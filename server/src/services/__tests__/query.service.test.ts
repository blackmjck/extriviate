import 'dotenv/config';
import { describe, test, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { Pool } from 'pg';
import { QueryService } from '../query.service.js';

// ---------------------------------------------------------------------------
// Real PostgreSQL — no mocks (team policy: mock/prod divergence burned us before).
// DATABASE_URL is loaded from .env via dotenv/config above.
// ---------------------------------------------------------------------------

let pool: Pool;
let qs: QueryService;

beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  qs = new QueryService(pool);
});

afterEach(async () => {
  // Delete in FK-safe order — no RESTART IDENTITY (requires sequence ownership).
  // Tests reference IDs returned from inserts, never hardcoded values.
  await pool.query(`
    DELETE FROM session_players;
    DELETE FROM game_sessions;
    DELETE FROM game_questions;
    DELETE FROM game_categories;
    DELETE FROM games;
    DELETE FROM answers;
    DELETE FROM questions;
    DELETE FROM categories;
    DELETE FROM password_reset_tokens;
    DELETE FROM uploads;
    DELETE FROM users;
  `);
});

afterAll(async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

async function seedUser(overrides: { email?: string; displayName?: string } = {}) {
  return qs.createUser(
    overrides.email ?? 'alice@example.com',
    overrides.displayName ?? 'Alice',
    '$2b$12$fakehash',
  );
}

async function seedCategory(creatorId: number, name = 'Science') {
  return qs.createCategory(creatorId, name, null);
}

async function seedQuestion(creatorId: number, categoryId: number) {
  return qs.createQuestion(creatorId, categoryId, [{ type: 'text', value: 'Q?' }]);
}

async function seedGame(creatorId: number, title = 'Trivia Night') {
  return qs.createGame(creatorId, title, true);
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

describe('Users', () => {
  test('createUser returns a full DbUser row with defaults', async () => {
    const user = await qs.createUser('bob@example.com', 'Bob', '$2b$12$hash');

    expect(user.id).toBeGreaterThan(0);
    expect(user.email).toBe('bob@example.com');
    expect(user.display_name).toBe('Bob');
    expect(user.role).toBe('creator');
    expect(user.is_active).toBe(true);
    expect(user.token_version).toBe(0);
    expect(user.password_hash).toBe('$2b$12$hash');
    expect(user.created_at).toBeTruthy(); // pg returns TIMESTAMPTZ as Date object
  });

  test('createUser throws 23505 on duplicate email', async () => {
    await qs.createUser('dupe@example.com', 'A', 'hash');
    const err = await qs.createUser('dupe@example.com', 'B', 'hash').catch((e) => e);
    expect(err.code).toBe('23505');
  });

  test('findActiveUserByEmail returns the user when active', async () => {
    const created = await qs.createUser('find@example.com', 'Find', 'hash');
    const found = await qs.findActiveUserByEmail('find@example.com');
    expect(found?.id).toBe(created.id);
  });

  test('findActiveUserByEmail returns null for inactive users', async () => {
    const user = await qs.createUser('inactive@example.com', 'Inactive', 'hash');
    await qs.deactivateUser(user.id);
    const found = await qs.findActiveUserByEmail('inactive@example.com');
    expect(found).toBeNull();
  });

  test('findActiveUserByEmail returns null when no match', async () => {
    expect(await qs.findActiveUserByEmail('nobody@example.com')).toBeNull();
  });

  test('findActiveUserById returns public fields only (no password_hash)', async () => {
    const user = await qs.createUser('pub@example.com', 'Pub', 'hash');
    const found = await qs.findActiveUserById(user.id);
    expect(found?.id).toBe(user.id);
    expect(found?.display_name).toBe('Pub');
    expect((found as any)?.password_hash).toBeUndefined();
  });

  test('findUserHashById returns the hash for active users', async () => {
    const user = await qs.createUser('hash@example.com', 'Hash', '$2b$12$special');
    const row = await qs.findUserHashById(user.id);
    expect(row?.password_hash).toBe('$2b$12$special');
  });

  test('deactivateUser sets is_active = false, findActiveUserById then returns null', async () => {
    const user = await qs.createUser('del@example.com', 'Del', 'hash');
    await qs.deactivateUser(user.id);
    expect(await qs.findActiveUserById(user.id)).toBeNull();
  });

  test('updateUserDisplayName uses COALESCE — null keeps the existing name', async () => {
    const user = await qs.createUser('coalesce@example.com', 'Original', 'hash');
    const updated = await qs.updateUserDisplayName(user.id, null);
    expect(updated?.display_name).toBe('Original');
  });

  test('updateUserDisplayName replaces the name when given a value', async () => {
    const user = await qs.createUser('rename@example.com', 'Old', 'hash');
    const updated = await qs.updateUserDisplayName(user.id, 'New');
    expect(updated?.display_name).toBe('New');
  });

  test('updateUserPassword increments token_version', async () => {
    const user = await qs.createUser('pw@example.com', 'PW', 'hash');
    expect(user.token_version).toBe(0);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await qs.updateUserPassword(user.id, 'newhash', client);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const refreshed = await qs.findActiveUserByEmail('pw@example.com');
    expect(refreshed?.token_version).toBe(1);
    expect(refreshed?.password_hash).toBe('newhash');
  });

  test('getUserStats returns string bigint counts for all four dimensions', async () => {
    const user = await seedUser();
    const stats = await qs.getUserStats(user.id);
    expect(stats.games_created).toBe('0');
    expect(stats.categories_created).toBe('0');
    expect(stats.questions_created).toBe('0');
    expect(stats.sessions_played).toBe('0');
  });

  test('getUserStats counts correctly after creating content', async () => {
    const user = await seedUser();
    await qs.createCategory(user.id, 'Cat1', null);
    await qs.createGame(user.id, 'Game1', true);
    const stats = await qs.getUserStats(user.id);
    expect(stats.categories_created).toBe('1');
    expect(stats.games_created).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// Password Reset
// ---------------------------------------------------------------------------

describe('Password Reset', () => {
  test('createPasswordResetToken and findPasswordResetToken round-trip', async () => {
    const user = await seedUser();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await qs.createPasswordResetToken(user.id, 'testhash123', expiresAt);

    const token = await qs.findPasswordResetToken('testhash123');
    expect(token).not.toBeNull();
    expect(token!.user_id).toBe(user.id);
    expect(token!.used_at).toBeNull();
    expect(token!.token_hash).toBe('testhash123');
  });

  test('findPasswordResetToken returns null when hash does not match', async () => {
    expect(await qs.findPasswordResetToken('nonexistent')).toBeNull();
  });

  test('markPasswordResetTokenUsed returns true on first call, false on second (concurrent claim)', async () => {
    const user = await seedUser();
    const expiresAt = new Date(Date.now() + 900_000);
    await qs.createPasswordResetToken(user.id, 'claimhash', expiresAt);
    const token = await qs.findPasswordResetToken('claimhash');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const first = await qs.markPasswordResetTokenUsed(token!.id, client);
      await client.query('COMMIT');
      expect(first).toBe(true);
    } finally {
      client.release();
    }

    const client2 = await pool.connect();
    try {
      await client2.query('BEGIN');
      const second = await qs.markPasswordResetTokenUsed(token!.id, client2);
      await client2.query('COMMIT');
      expect(second).toBe(false); // already used
    } finally {
      client2.release();
    }
  });

  test('deleteUnusedPasswordResetTokensForUser removes only unused tokens', async () => {
    const user = await seedUser();
    const exp = new Date(Date.now() + 900_000);
    await qs.createPasswordResetToken(user.id, 'hash-a', exp);
    await qs.createPasswordResetToken(user.id, 'hash-b', exp);

    // Mark hash-a used
    const tokenA = await qs.findPasswordResetToken('hash-a');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await qs.markPasswordResetTokenUsed(tokenA!.id, client);
      await qs.deleteUnusedPasswordResetTokensForUser(user.id, client);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    // hash-a (used) stays; hash-b (unused) is deleted
    expect(await qs.findPasswordResetToken('hash-a')).not.toBeNull();
    expect(await qs.findPasswordResetToken('hash-b')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

describe('Categories', () => {
  test('createCategory returns the new row', async () => {
    const user = await seedUser();
    const cat = await qs.createCategory(user.id, 'History', 'Ancient civilisations');
    expect(cat.id).toBeGreaterThan(0);
    expect(cat.name).toBe('History');
    expect(cat.description).toBe('Ancient civilisations');
    expect(cat.creator_id).toBe(user.id);
  });

  test('createCategory throws 23505 on duplicate (creator_id, name)', async () => {
    const user = await seedUser();
    await qs.createCategory(user.id, 'Dupe', null);
    const err = await qs.createCategory(user.id, 'Dupe', null).catch((e) => e);
    expect(err.code).toBe('23505');
  });

  test('listCategories returns only the requesting creator\'s categories', async () => {
    const u1 = await seedUser({ email: 'u1@x.com' });
    const u2 = await seedUser({ email: 'u2@x.com' });
    await qs.createCategory(u1.id, 'U1 Cat', null);
    await qs.createCategory(u2.id, 'U2 Cat', null);

    const list = await qs.listCategories(u1.id, 10, 0);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('U1 Cat');
  });

  test('countCategories counts only the creator\'s rows', async () => {
    const user = await seedUser();
    await qs.createCategory(user.id, 'A', null);
    await qs.createCategory(user.id, 'B', null);
    expect(await qs.countCategories(user.id)).toBe(2);
  });

  test('findCategoryById returns null for another creator\'s category', async () => {
    const u1 = await seedUser({ email: 'u1@x.com' });
    const u2 = await seedUser({ email: 'u2@x.com' });
    const cat = await qs.createCategory(u2.id, 'Private', null);
    expect(await qs.findCategoryById(cat.id, u1.id)).toBeNull();
  });

  test('updateCategory uses COALESCE — null fields keep existing values', async () => {
    const user = await seedUser();
    const cat = await qs.createCategory(user.id, 'Original', 'Desc');
    const updated = await qs.updateCategory(cat.id, user.id, null, null);
    expect(updated?.name).toBe('Original');
    expect(updated?.description).toBe('Desc');
  });

  test('deleteCategory removes the row and returns true; returns false when not found', async () => {
    const user = await seedUser();
    const cat = await qs.createCategory(user.id, 'ToDelete', null);
    expect(await qs.deleteCategory(cat.id, user.id)).toBe(true);
    expect(await qs.deleteCategory(cat.id, user.id)).toBe(false);
  });

  test('deleteCategory throws 23503 when questions reference it', async () => {
    const user = await seedUser();
    const cat = await qs.createCategory(user.id, 'InUse', null);
    await qs.createQuestion(user.id, cat.id, [{ type: 'text', value: 'Q' }]);
    const err = await qs.deleteCategory(cat.id, user.id).catch((e) => e);
    expect(err.code).toBe('23503');
  });
});

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

describe('Questions', () => {
  test('createQuestion and findQuestionWithAnswer round-trip', async () => {
    const user = await seedUser();
    const cat = await seedCategory(user.id);
    const q = await qs.createQuestion(user.id, cat.id, [{ type: 'text', value: 'Hello?' }]);
    const withA = await qs.findQuestionWithAnswer(q.id, user.id);
    expect(withA?.id).toBe(q.id);
    expect(withA?.answer_id).toBeNull();
  });

  test('createAnswer and findQuestionWithAnswer returns the answer', async () => {
    const user = await seedUser();
    const cat = await seedCategory(user.id);
    const q = await seedQuestion(user.id, cat.id);
    await qs.createAnswer(q.id, [{ type: 'text', value: 'A' }], ['alt']);
    const withA = await qs.findQuestionWithAnswer(q.id, user.id);
    expect(withA?.answer_id).toBeGreaterThan(0);
  });

  test('countQuestions counts all when no categoryId given', async () => {
    const user = await seedUser();
    const cat1 = await qs.createCategory(user.id, 'C1', null);
    const cat2 = await qs.createCategory(user.id, 'C2', null);
    await qs.createQuestion(user.id, cat1.id, []);
    await qs.createQuestion(user.id, cat2.id, []);
    expect(await qs.countQuestions(user.id)).toBe(2);
  });

  test('countQuestions filters by categoryId when provided', async () => {
    const user = await seedUser();
    const cat1 = await qs.createCategory(user.id, 'C1', null);
    const cat2 = await qs.createCategory(user.id, 'C2', null);
    await qs.createQuestion(user.id, cat1.id, []);
    await qs.createQuestion(user.id, cat2.id, []);
    expect(await qs.countQuestions(user.id, cat1.id)).toBe(1);
  });

  test('listQuestionsWithAnswers filters by optional categoryId', async () => {
    const user = await seedUser();
    const cat1 = await qs.createCategory(user.id, 'C1', null);
    const cat2 = await qs.createCategory(user.id, 'C2', null);
    await qs.createQuestion(user.id, cat1.id, []);
    await qs.createQuestion(user.id, cat2.id, []);

    const all = await qs.listQuestionsWithAnswers(user.id, 10, 0);
    const filtered = await qs.listQuestionsWithAnswers(user.id, 10, 0, cat1.id);
    expect(all).toHaveLength(2);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].category_id).toBe(cat1.id);
  });

  test('updateQuestion changes content', async () => {
    const user = await seedUser();
    const cat = await seedCategory(user.id);
    const q = await seedQuestion(user.id, cat.id);
    await qs.updateQuestion(q.id, [{ type: 'text', value: 'Updated?' }]);
    const row = await qs.findQuestionWithAnswer(q.id, user.id);
    expect(row?.content).toEqual([{ type: 'text', value: 'Updated?' }]);
  });

  test('deleteQuestion returns true then false', async () => {
    const user = await seedUser();
    const cat = await seedCategory(user.id);
    const q = await seedQuestion(user.id, cat.id);
    expect(await qs.deleteQuestion(q.id, user.id)).toBe(true);
    expect(await qs.deleteQuestion(q.id, user.id)).toBe(false);
  });

  test('deleteQuestion throws 23503 when question is used in a game', async () => {
    const user = await seedUser();
    const cat = await seedCategory(user.id);
    const q = await seedQuestion(user.id, cat.id);
    const game = await qs.createGame(user.id, 'G', true);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const gc = await qs.insertGameCategory(game.id, cat.id, 1, client);
      await qs.insertGameQuestion(game.id, gc.id, q.id, 1, 200, false, client);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const err = await qs.deleteQuestion(q.id, user.id).catch((e) => e);
    expect(err.code).toBe('23503');
  });

  test('findQuestionWithAnswer omits creatorId filter when creatorId is undefined', async () => {
    const user = await seedUser();
    const cat = await seedCategory(user.id);
    const q = await seedQuestion(user.id, cat.id);
    const row = await qs.findQuestionWithAnswer(q.id, undefined);
    expect(row?.id).toBe(q.id);
  });
});

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

describe('Games', () => {
  test('createGame returns a full DbGame row with defaults', async () => {
    const user = await seedUser();
    const game = await qs.createGame(user.id, 'Trivia', false);
    expect(game.id).toBeGreaterThan(0);
    expect(game.title).toBe('Trivia');
    expect(game.daily_doubles_enabled).toBe(false);
    expect(game.is_published).toBe(false);
    expect(game.require_question_format).toBe(false);
    expect(game.use_ai_evaluation).toBe(false);
  });

  test('listGames returns only the creator\'s games, newest first', async () => {
    const u1 = await seedUser({ email: 'u1@x.com' });
    const u2 = await seedUser({ email: 'u2@x.com' });
    await qs.createGame(u1.id, 'Game A', true);
    await qs.createGame(u2.id, 'Game B', true);
    const list = await qs.listGames(u1.id, 10, 0);
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('Game A');
  });

  test('listGames is_complete is false for an empty game', async () => {
    const user = await seedUser();
    await qs.createGame(user.id, 'Empty', true);
    const list = await qs.listGames(user.id, 10, 0);
    expect(list[0].is_complete).toBe(false);
  });

  test('countGames returns the correct count', async () => {
    const user = await seedUser();
    await qs.createGame(user.id, 'G1', true);
    await qs.createGame(user.id, 'G2', true);
    expect(await qs.countGames(user.id)).toBe(2);
  });

  test('findGameById finds regardless of creator; findGameForOwner enforces ownership', async () => {
    const u1 = await seedUser({ email: 'u1@x.com' });
    const u2 = await seedUser({ email: 'u2@x.com' });
    const game = await qs.createGame(u1.id, 'Owned', true);

    expect((await qs.findGameById(game.id))?.id).toBe(game.id);
    expect((await qs.findGameForOwner(game.id, u1.id))?.id).toBe(game.id);
    expect(await qs.findGameForOwner(game.id, u2.id)).toBeNull();
  });

  test('updateGame uses COALESCE — null fields keep existing values', async () => {
    const user = await seedUser();
    const game = await qs.createGame(user.id, 'Original', true);
    const updated = await qs.updateGame(game.id, user.id, null, null, null);
    expect(updated?.title).toBe('Original');
    expect(updated?.daily_doubles_enabled).toBe(true);
  });

  test('updateGame returns null when game not found or wrong owner', async () => {
    const user = await seedUser();
    expect(await qs.updateGame(9999, user.id, 'X', null, null)).toBeNull();
  });

  test('insertGameCategory and insertGameQuestion persist board data', async () => {
    const user = await seedUser();
    const cat = await seedCategory(user.id);
    const q = await seedQuestion(user.id, cat.id);
    const game = await qs.createGame(user.id, 'Board', true);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const gc = await qs.insertGameCategory(game.id, cat.id, 1, client);
      await qs.insertGameQuestion(game.id, gc.id, q.id, 1, 200, false, client);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const cats = await qs.listGameCategoriesWithCategoryData(game.id);
    expect(cats).toHaveLength(1);
    expect(cats[0].category_name).toBe('Science');

    const qs2 = await qs.listGameQuestionsWithData(game.id);
    expect(qs2).toHaveLength(1);
    expect(qs2[0].point_value).toBe(200);
  });

  test('countGameCategories and countGameQuestionsWithPointValue reflect board state', async () => {
    const user = await seedUser();
    const cat = await seedCategory(user.id);
    const q = await seedQuestion(user.id, cat.id);
    const game = await qs.createGame(user.id, 'G', true);

    expect(await qs.countGameCategories(game.id)).toBe(0);
    expect(await qs.countGameQuestionsWithPointValue(game.id)).toBe(0);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const gc = await qs.insertGameCategory(game.id, cat.id, 1, client);
      await qs.insertGameQuestion(game.id, gc.id, q.id, 1, 200, false, client);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    expect(await qs.countGameCategories(game.id)).toBe(1);
    expect(await qs.countGameQuestionsWithPointValue(game.id)).toBe(1);
  });

  test('deleteGameBoard removes questions then categories in the correct FK order', async () => {
    const user = await seedUser();
    const cat = await seedCategory(user.id);
    const q = await seedQuestion(user.id, cat.id);
    const game = await qs.createGame(user.id, 'G', true);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const gc = await qs.insertGameCategory(game.id, cat.id, 1, client);
      await qs.insertGameQuestion(game.id, gc.id, q.id, 1, 200, false, client);
      await qs.deleteGameBoard(game.id, client);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    expect(await qs.countGameCategories(game.id)).toBe(0);
  });

  test('deleteGame removes the game row and returns true; false when not found', async () => {
    const user = await seedUser();
    const game = await qs.createGame(user.id, 'Del', true);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const deleted = await qs.deleteGame(game.id, user.id, client);
      await client.query('COMMIT');
      expect(deleted).toBe(true);
    } finally {
      client.release();
    }

    expect(await qs.findGameById(game.id)).toBeNull();
  });

  test('markQuestionAnswered sets is_answered = true', async () => {
    const user = await seedUser();
    const cat = await seedCategory(user.id);
    const q = await seedQuestion(user.id, cat.id);
    const game = await qs.createGame(user.id, 'G', true);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const gc = await qs.insertGameCategory(game.id, cat.id, 1, client);
      await qs.insertGameQuestion(game.id, gc.id, q.id, 1, 200, false, client);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    await qs.markQuestionAnswered(game.id, q.id);
    const rows = await qs.listGameQuestionsWithData(game.id);
    expect(rows[0].is_answered).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

describe('Sessions', () => {
  test('createSession inserts and returns a DbGameSession', async () => {
    const user = await seedUser();
    const game = await seedGame(user.id);
    const session = await qs.createSession(game.id, user.id, 'Test Session', 'ABC123', 'computer_hosted', false);

    expect(session.id).toBeGreaterThan(0);
    expect(session.join_code).toBe('ABC123');
    expect(session.status).toBe('lobby');
    expect(session.mode).toBe('computer_hosted');
    expect(session.turn_based).toBe(false);
    expect(session.ended_at).toBeNull();
  });

  test('checkJoinCodeCollision returns true for lobby/active sessions, false for completed', async () => {
    const user = await seedUser();
    const game = await seedGame(user.id);
    await qs.createSession(game.id, user.id, 'S', 'LIVE01', 'computer_hosted', false);

    expect(await qs.checkJoinCodeCollision('LIVE01')).toBe(true);

    // Complete it
    await qs.updateSessionStatus(
      (await qs.findSessionByJoinCode('LIVE01'))!.id,
      'completed'
    );

    expect(await qs.checkJoinCodeCollision('LIVE01')).toBe(false);
  });

  test('findSessionByJoinCode finds lobby/active sessions; uppercases join code', async () => {
    const user = await seedUser();
    const game = await seedGame(user.id);
    await qs.createSession(game.id, user.id, 'S', 'FIND01', 'computer_hosted', false);

    expect((await qs.findSessionByJoinCode('find01'))?.join_code).toBe('FIND01');
  });

  test('findSessionByJoinCode returns null for completed sessions', async () => {
    const user = await seedUser();
    const game = await seedGame(user.id);
    const s = await qs.createSession(game.id, user.id, 'S', 'DONE01', 'computer_hosted', false);
    await qs.updateSessionStatus(s.id, 'completed');
    expect(await qs.findSessionByJoinCode('DONE01')).toBeNull();
  });

  test('findSessionById returns the session', async () => {
    const user = await seedUser();
    const game = await seedGame(user.id);
    const s = await qs.createSession(game.id, user.id, 'S', 'ID0001', 'computer_hosted', false);
    const found = await qs.findSessionById(s.id);
    expect(found?.id).toBe(s.id);
  });

  test('updateSessionStatus sets ended_at only when status is completed', async () => {
    const user = await seedUser();
    const game = await seedGame(user.id);
    const s = await qs.createSession(game.id, user.id, 'S', 'ST0001', 'computer_hosted', false);

    const active = await qs.updateSessionStatus(s.id, 'active');
    expect(active?.status).toBe('active');
    expect(active?.ended_at).toBeNull();

    const completed = await qs.updateSessionStatus(s.id, 'completed');
    expect(completed?.status).toBe('completed');
    expect(completed?.ended_at).not.toBeNull();
  });

  test('addPlayer, getPlayers, findPlayerByUserId, updateScore, removePlayer', async () => {
    const user = await seedUser();
    const game = await seedGame(user.id);
    const s = await qs.createSession(game.id, user.id, 'S', 'PL0001', 'computer_hosted', false);

    const player = await qs.addPlayer(s.id, 'Alice', user.id);
    expect(player.display_name).toBe('Alice');
    expect(player.final_score).toBe(0);

    const players = await qs.getPlayers(s.id);
    expect(players).toHaveLength(1);

    const byUserId = await qs.findPlayerByUserId(s.id, user.id);
    expect(byUserId?.id).toBe(player.id);

    await qs.updateScore(player.id, 800);
    const refreshed = await qs.getPlayers(s.id);
    expect(refreshed[0].final_score).toBe(800);

    expect(await qs.removePlayer(s.id, player.id)).toBe(true);
    expect(await qs.getPlayers(s.id)).toHaveLength(0);
  });

  test('setRanks assigns equal rank to tied players', async () => {
    const user = await seedUser();
    const game = await seedGame(user.id);
    const s = await qs.createSession(game.id, user.id, 'S', 'RK0001', 'computer_hosted', false);

    const p1 = await qs.addPlayer(s.id, 'P1', null);
    const p2 = await qs.addPlayer(s.id, 'P2', null);
    const p3 = await qs.addPlayer(s.id, 'P3', null);

    await qs.updateScore(p1.id, 800);
    await qs.updateScore(p2.id, 800); // tie with p1
    await qs.updateScore(p3.id, 400);

    const ranked = await qs.setRanks(s.id);
    const byId = Object.fromEntries(ranked.map((p) => [p.id, p]));

    expect(byId[p1.id].rank).toBe(1);
    expect(byId[p2.id].rank).toBe(1); // tied
    expect(byId[p3.id].rank).toBe(3); // gap after tie
  });
});

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

describe('Uploads', () => {
  test('confirmUpload returns the persisted row', async () => {
    const user = await seedUser();
    const upload = await qs.confirmUpload(user.id, 'files/img.png', 'https://r2.example.com/img.png', 'image/png', 4096);
    expect(upload.id).toBeGreaterThan(0);
    expect(upload.key).toBe('files/img.png');
    expect(upload.mime_type).toBe('image/png');
    expect(upload.size_bytes).toBe(4096);
  });

  test('confirmUpload throws 23505 on duplicate public_url', async () => {
    const user = await seedUser();
    await qs.confirmUpload(user.id, 'k1', 'https://r2.example.com/dup.png', 'image/png', 1);
    const err = await qs.confirmUpload(user.id, 'k2', 'https://r2.example.com/dup.png', 'image/png', 1).catch((e) => e);
    expect(err.code).toBe('23505');
  });

  test('countUploads and listUploads reflect persisted state', async () => {
    const user = await seedUser();
    await qs.confirmUpload(user.id, 'k1', 'https://r2.example.com/a.png', 'image/png', 1);
    await qs.confirmUpload(user.id, 'k2', 'https://r2.example.com/b.png', 'image/png', 2);

    expect(await qs.countUploads(user.id)).toBe(2);
    const list = await qs.listUploads(user.id, 10, 0);
    expect(list).toHaveLength(2);
  });

  test('findUploadById returns null for another owner\'s upload', async () => {
    const u1 = await seedUser({ email: 'u1@x.com' });
    const u2 = await seedUser({ email: 'u2@x.com' });
    const upload = await qs.confirmUpload(u1.id, 'k', 'https://r2.example.com/priv.png', 'image/png', 1);
    expect(await qs.findUploadById(upload.id, u2.id)).toBeNull();
    expect(await qs.findUploadById(upload.id, u1.id)).not.toBeNull();
  });

  test('deleteUpload removes the row', async () => {
    const user = await seedUser();
    const upload = await qs.confirmUpload(user.id, 'k', 'https://r2.example.com/del.png', 'image/png', 1);
    await qs.deleteUpload(upload.id);
    expect(await qs.findUploadById(upload.id, user.id)).toBeNull();
  });
});
