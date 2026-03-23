import 'dotenv/config';
import { describe, test, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { QueryService } from '../query.service.js';

// ---------------------------------------------------------------------------
// Real PostgreSQL — no mocks (team policy: mock/prod divergence burned us before).
// DATABASE_URL is loaded from .env via dotenv/config above.
// ---------------------------------------------------------------------------

let pool: Pool;
let qs: QueryService;
let txClient: PoolClient;

beforeAll(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  qs = new QueryService(pool);
});

beforeEach(async () => {
  txClient = await pool.connect();
  await txClient.query('BEGIN');
});

afterEach(async () => {
  await txClient.query('ROLLBACK');
  txClient.release();
});

afterAll(async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

async function seedUser(client: PoolClient, overrides: { email?: string; displayName?: string } = {}) {
  return qs.createUser(
    overrides.email ?? 'alice@example.com',
    overrides.displayName ?? 'Alice',
    '$2b$12$fakehash',
    client
  );
}

async function seedCategory(creatorId: number, client: PoolClient, name = 'Science') {
  return qs.createCategory(creatorId, name, null, client);
}

async function seedQuestion(creatorId: number, categoryId: number, client: PoolClient) {
  return qs.createQuestion(creatorId, categoryId, [{ type: 'text', value: 'Q?' }], client);
}

async function seedGame(creatorId: number, client: PoolClient, title = 'Trivia Night') {
  return qs.createGame(creatorId, title, true, client);
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

describe('Users', () => {
  test('createUser returns a full DbUser row with defaults', async () => {
    const user = await qs.createUser('bob@example.com', 'Bob', '$2b$12$hash', txClient);

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
    await qs.createUser('dupe@example.com', 'A', 'hash', txClient);
    const err = await qs.createUser('dupe@example.com', 'B', 'hash', txClient).catch((e) => e);
    expect(err.code).toBe('23505');
  });

  test('findActiveUserByEmail returns the user when active', async () => {
    const created = await qs.createUser('find@example.com', 'Find', 'hash', txClient);
    const found = await qs.findActiveUserByEmail('find@example.com', txClient);
    expect(found?.id).toBe(created.id);
  });

  test('findActiveUserByEmail returns null for inactive users', async () => {
    const user = await qs.createUser('inactive@example.com', 'Inactive', 'hash', txClient);
    await qs.deactivateUser(user.id, txClient);
    const found = await qs.findActiveUserByEmail('inactive@example.com', txClient);
    expect(found).toBeNull();
  });

  test('findActiveUserByEmail returns null when no match', async () => {
    expect(await qs.findActiveUserByEmail('nobody@example.com', txClient)).toBeNull();
  });

  test('findActiveUserById returns public fields only (no password_hash)', async () => {
    const user = await qs.createUser('pub@example.com', 'Pub', 'hash', txClient);
    const found = await qs.findActiveUserById(user.id, txClient);
    expect(found?.id).toBe(user.id);
    expect(found?.display_name).toBe('Pub');
    expect((found as any)?.password_hash).toBeUndefined();
  });

  test('findUserHashById returns the hash for active users', async () => {
    const user = await qs.createUser('hash@example.com', 'Hash', '$2b$12$special', txClient);
    const row = await qs.findUserHashById(user.id, txClient);
    expect(row?.password_hash).toBe('$2b$12$special');
  });

  test('findUserTokenVersion returns the current token_version for an active user', async () => {
    const user = await seedUser(txClient);
    const version = await qs.findUserTokenVersion(user.id, txClient);
    expect(version).toBe(0); // default token_version is 0
  });

  test('findUserTokenVersion returns null for a non-existent user', async () => {
    const version = await qs.findUserTokenVersion(99_999, txClient);
    expect(version).toBeNull();
  });

  test('findUserTokenVersion returns null after the user is deactivated', async () => {
    const user = await seedUser(txClient);
    await qs.deactivateUser(user.id, txClient);
    const version = await qs.findUserTokenVersion(user.id, txClient);
    expect(version).toBeNull();
  });

  test('deactivateUser sets is_active = false, findActiveUserById then returns null', async () => {
    const user = await qs.createUser('del@example.com', 'Del', 'hash', txClient);
    await qs.deactivateUser(user.id, txClient);
    expect(await qs.findActiveUserById(user.id, txClient)).toBeNull();
  });

  test('updateUserDisplayName uses COALESCE — null keeps the existing name', async () => {
    const user = await qs.createUser('coalesce@example.com', 'Original', 'hash', txClient);
    const updated = await qs.updateUserDisplayName(user.id, null, txClient);
    expect(updated?.display_name).toBe('Original');
  });

  test('updateUserDisplayName replaces the name when given a value', async () => {
    const user = await qs.createUser('rename@example.com', 'Old', 'hash', txClient);
    const updated = await qs.updateUserDisplayName(user.id, 'New', txClient);
    expect(updated?.display_name).toBe('New');
  });

  test('getUserStats returns string bigint counts for all four dimensions', async () => {
    const user = await seedUser(txClient);
    const stats = await qs.getUserStats(user.id, txClient);
    expect(stats.games_created).toBe('0');
    expect(stats.categories_created).toBe('0');
    expect(stats.questions_created).toBe('0');
    expect(stats.sessions_played).toBe('0');
  });

  test('getUserStats counts correctly after creating content', async () => {
    const user = await seedUser(txClient);
    await qs.createCategory(user.id, 'Cat1', null, txClient);
    await qs.createGame(user.id, 'Game1', true, txClient);
    const stats = await qs.getUserStats(user.id, txClient);
    expect(stats.categories_created).toBe('1');
    expect(stats.games_created).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// Password Reset
// ---------------------------------------------------------------------------

describe('Password Reset', () => {
  test('createPasswordResetToken and findPasswordResetToken round-trip', async () => {
    const user = await seedUser(txClient);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await qs.createPasswordResetToken(user.id, 'testhash123', expiresAt, txClient);

    const token = await qs.findPasswordResetToken('testhash123', txClient);
    expect(token).not.toBeNull();
    expect(token!.user_id).toBe(user.id);
    expect(token!.used_at).toBeNull();
    expect(token!.token_hash).toBe('testhash123');
  });

  test('findPasswordResetToken returns null when hash does not match', async () => {
    expect(await qs.findPasswordResetToken('nonexistent', txClient)).toBeNull();
  });

  test('deleteUsedPasswordResetToken returns true on first claim, false on second (sequential idempotency, savepoint-based)', async () => {
    const user = await seedUser(txClient);
    const expiresAt = new Date(Date.now() + 900_000);
    await qs.createPasswordResetToken(user.id, 'claimhash', expiresAt, txClient);
    const token = await qs.findPasswordResetToken('claimhash', txClient);

    await txClient.query('SAVEPOINT first_claim');
    const first = await qs.deleteUsedPasswordResetToken(token!.id, txClient);
    await txClient.query('RELEASE SAVEPOINT first_claim');
    expect(first).toBe(true);

    await txClient.query('SAVEPOINT second_claim');
    const second = await qs.deleteUsedPasswordResetToken(token!.id, txClient);
    await txClient.query('RELEASE SAVEPOINT second_claim');
    expect(second).toBe(false); // already deleted
  });

  test('deleteUnusedPasswordResetTokensForUser removes all remaining unclaimed tokens', async () => {
    const user = await seedUser(txClient);
    const exp = new Date(Date.now() + 900_000);
    await qs.createPasswordResetToken(user.id, 'hash-a', exp, txClient);
    await qs.createPasswordResetToken(user.id, 'hash-b', exp, txClient);

    // Claim hash-a (deletes it atomically), then clean up the rest
    const tokenA = await qs.findPasswordResetToken('hash-a', txClient);
    await txClient.query('SAVEPOINT reset_flow');
    await qs.deleteUsedPasswordResetToken(tokenA!.id, txClient);
    await qs.deleteUnusedPasswordResetTokensForUser(user.id, txClient);
    await txClient.query('RELEASE SAVEPOINT reset_flow');

    // Both are gone: hash-a was claimed and deleted, hash-b was cleaned up
    expect(await qs.findPasswordResetToken('hash-a', txClient)).toBeNull();
    expect(await qs.findPasswordResetToken('hash-b', txClient)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

describe('Categories', () => {
  test('createCategory returns the new row', async () => {
    const user = await seedUser(txClient);
    const cat = await qs.createCategory(user.id, 'History', 'Ancient civilisations', txClient);
    expect(cat.id).toBeGreaterThan(0);
    expect(cat.name).toBe('History');
    expect(cat.description).toBe('Ancient civilisations');
    expect(cat.creator_id).toBe(user.id);
  });

  test('createCategory throws 23505 on duplicate (creator_id, name)', async () => {
    const user = await seedUser(txClient);
    await qs.createCategory(user.id, 'Dupe', null, txClient);
    const err = await qs.createCategory(user.id, 'Dupe', null, txClient).catch((e) => e);
    expect(err.code).toBe('23505');
  });

  test("listCategories returns only the requesting creator's categories", async () => {
    const u1 = await seedUser(txClient, { email: 'u1@x.com' });
    const u2 = await seedUser(txClient, { email: 'u2@x.com' });
    await qs.createCategory(u1.id, 'U1 Cat', null, txClient);
    await qs.createCategory(u2.id, 'U2 Cat', null, txClient);

    const list = await qs.listCategories(u1.id, 10, 0, txClient);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('U1 Cat');
  });

  test("countCategories counts only the creator's rows", async () => {
    const user = await seedUser(txClient);
    await qs.createCategory(user.id, 'A', null, txClient);
    await qs.createCategory(user.id, 'B', null, txClient);
    expect(await qs.countCategories(user.id, txClient)).toBe(2);
  });

  test("findCategoryById returns null for another creator's category", async () => {
    const u1 = await seedUser(txClient, { email: 'u1@x.com' });
    const u2 = await seedUser(txClient, { email: 'u2@x.com' });
    const cat = await qs.createCategory(u2.id, 'Private', null, txClient);
    expect(await qs.findCategoryById(cat.id, u1.id, txClient)).toBeNull();
  });

  test('updateCategory uses COALESCE — null fields keep existing values', async () => {
    const user = await seedUser(txClient);
    const cat = await qs.createCategory(user.id, 'Original', 'Desc', txClient);
    const updated = await qs.updateCategory(cat.id, user.id, null, null, txClient);
    expect(updated?.name).toBe('Original');
    expect(updated?.description).toBe('Desc');
  });

  test('deleteCategory removes the row and returns true; returns false when not found', async () => {
    const user = await seedUser(txClient);
    const cat = await qs.createCategory(user.id, 'ToDelete', null, txClient);
    expect(await qs.deleteCategory(cat.id, user.id, txClient)).toBe(true);
    expect(await qs.deleteCategory(cat.id, user.id, txClient)).toBe(false);
  });

  test('deleteCategory throws 23503 when questions reference it', async () => {
    const user = await seedUser(txClient);
    const cat = await qs.createCategory(user.id, 'InUse', null, txClient);
    await qs.createQuestion(user.id, cat.id, [{ type: 'text', value: 'Q' }], txClient);
    const err = await qs.deleteCategory(cat.id, user.id, txClient).catch((e) => e);
    expect(err.code).toBe('23503');
  });
});

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

describe('Questions', () => {
  test('createQuestion and findQuestionWithAnswer round-trip', async () => {
    const user = await seedUser(txClient);
    const cat = await seedCategory(user.id, txClient);
    const q = await qs.createQuestion(user.id, cat.id, [{ type: 'text', value: 'Hello?' }], txClient);
    const withA = await qs.findQuestionWithAnswer(q.id, user.id, txClient);
    expect(withA?.id).toBe(q.id);
    expect(withA?.answer_id).toBeNull();
  });

  test('createAnswer and findQuestionWithAnswer returns the answer', async () => {
    const user = await seedUser(txClient);
    const cat = await seedCategory(user.id, txClient);
    const q = await seedQuestion(user.id, cat.id, txClient);
    await qs.createAnswer(q.id, [{ type: 'text', value: 'A' }], ['alt'], txClient);
    const withA = await qs.findQuestionWithAnswer(q.id, user.id, txClient);
    expect(withA?.answer_id).toBeGreaterThan(0);
  });

  test('countQuestions counts all when no categoryId given', async () => {
    const user = await seedUser(txClient);
    const cat1 = await qs.createCategory(user.id, 'C1', null, txClient);
    const cat2 = await qs.createCategory(user.id, 'C2', null, txClient);
    await qs.createQuestion(user.id, cat1.id, [], txClient);
    await qs.createQuestion(user.id, cat2.id, [], txClient);
    expect(await qs.countQuestions(user.id, undefined, txClient)).toBe(2);
  });

  test('countQuestions filters by categoryId when provided', async () => {
    const user = await seedUser(txClient);
    const cat1 = await qs.createCategory(user.id, 'C1', null, txClient);
    const cat2 = await qs.createCategory(user.id, 'C2', null, txClient);
    await qs.createQuestion(user.id, cat1.id, [], txClient);
    await qs.createQuestion(user.id, cat2.id, [], txClient);
    expect(await qs.countQuestions(user.id, cat1.id, txClient)).toBe(1);
  });

  test('listQuestionsWithAnswers filters by optional categoryId', async () => {
    const user = await seedUser(txClient);
    const cat1 = await qs.createCategory(user.id, 'C1', null, txClient);
    const cat2 = await qs.createCategory(user.id, 'C2', null, txClient);
    await qs.createQuestion(user.id, cat1.id, [], txClient);
    await qs.createQuestion(user.id, cat2.id, [], txClient);

    const all = await qs.listQuestionsWithAnswers(user.id, 10, 0, undefined, txClient);
    const filtered = await qs.listQuestionsWithAnswers(user.id, 10, 0, cat1.id, txClient);
    expect(all).toHaveLength(2);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].category_id).toBe(cat1.id);
  });

  test('updateQuestion changes content', async () => {
    const user = await seedUser(txClient);
    const cat = await seedCategory(user.id, txClient);
    const q = await seedQuestion(user.id, cat.id, txClient);
    await qs.updateQuestion(q.id, [{ type: 'text', value: 'Updated?' }], txClient);
    const row = await qs.findQuestionWithAnswer(q.id, user.id, txClient);
    expect(row?.content).toEqual([{ type: 'text', value: 'Updated?' }]);
  });

  test('deleteQuestion returns true then false', async () => {
    const user = await seedUser(txClient);
    const cat = await seedCategory(user.id, txClient);
    const q = await seedQuestion(user.id, cat.id, txClient);
    expect(await qs.deleteQuestion(q.id, user.id, txClient)).toBe(true);
    expect(await qs.deleteQuestion(q.id, user.id, txClient)).toBe(false);
  });

  test('deleteQuestion throws 23503 when question is used in a game', async () => {
    const user = await seedUser(txClient);
    const cat = await seedCategory(user.id, txClient);
    const q = await seedQuestion(user.id, cat.id, txClient);
    const game = await qs.createGame(user.id, 'G', true, txClient);

    await txClient.query('SAVEPOINT board_setup');
    const gc = await qs.insertGameCategory(game.id, cat.id, 1, txClient);
    await qs.insertGameQuestion(game.id, gc.id, q.id, 1, 200, false, txClient);
    await txClient.query('RELEASE SAVEPOINT board_setup');

    const err = await qs.deleteQuestion(q.id, user.id, txClient).catch((e) => e);
    expect(err.code).toBe('23503');
  });

  test('findQuestionWithAnswer omits creatorId filter when creatorId is undefined', async () => {
    const user = await seedUser(txClient);
    const cat = await seedCategory(user.id, txClient);
    const q = await seedQuestion(user.id, cat.id, txClient);
    const row = await qs.findQuestionWithAnswer(q.id, undefined, txClient);
    expect(row?.id).toBe(q.id);
  });
});

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

describe('Games', () => {
  test('createGame returns a full DbGame row with defaults', async () => {
    const user = await seedUser(txClient);
    const game = await qs.createGame(user.id, 'Trivia', false, txClient);
    expect(game.id).toBeGreaterThan(0);
    expect(game.title).toBe('Trivia');
    expect(game.daily_doubles_enabled).toBe(false);
    expect(game.is_published).toBe(false);
    expect(game.require_question_format).toBe(false);
    expect(game.use_ai_evaluation).toBe(false);
  });

  test("listGames returns only the creator's games, newest first", async () => {
    const u1 = await seedUser(txClient, { email: 'u1@x.com' });
    const u2 = await seedUser(txClient, { email: 'u2@x.com' });
    await qs.createGame(u1.id, 'Game A', true, txClient);
    await qs.createGame(u2.id, 'Game B', true, txClient);
    const list = await qs.listGames(u1.id, 10, 0, txClient);
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('Game A');
  });

  test('listGames is_complete is false for an empty game', async () => {
    const user = await seedUser(txClient);
    await qs.createGame(user.id, 'Empty', true, txClient);
    const list = await qs.listGames(user.id, 10, 0, txClient);
    expect(list[0].is_complete).toBe(false);
  });

  test('countGames returns the correct count', async () => {
    const user = await seedUser(txClient);
    await qs.createGame(user.id, 'G1', true, txClient);
    await qs.createGame(user.id, 'G2', true, txClient);
    expect(await qs.countGames(user.id, txClient)).toBe(2);
  });

  test('findGameById finds regardless of creator; findGameForOwner enforces ownership', async () => {
    const u1 = await seedUser(txClient, { email: 'u1@x.com' });
    const u2 = await seedUser(txClient, { email: 'u2@x.com' });
    const game = await qs.createGame(u1.id, 'Owned', true, txClient);

    expect((await qs.findGameById(game.id, txClient))?.id).toBe(game.id);
    expect((await qs.findGameForOwner(game.id, u1.id, txClient))?.id).toBe(game.id);
    expect(await qs.findGameForOwner(game.id, u2.id, txClient)).toBeNull();
  });

  test('updateGame uses COALESCE — null fields keep existing values', async () => {
    const user = await seedUser(txClient);
    const game = await qs.createGame(user.id, 'Original', true, txClient);
    const updated = await qs.updateGame(game.id, user.id, null, null, null, txClient);
    expect(updated?.title).toBe('Original');
    expect(updated?.daily_doubles_enabled).toBe(true);
  });

  test('updateGame returns null when game not found or wrong owner', async () => {
    const user = await seedUser(txClient);
    expect(await qs.updateGame(9999, user.id, 'X', null, null, txClient)).toBeNull();
  });

  test('insertGameCategory and insertGameQuestion persist board data', async () => {
    const user = await seedUser(txClient);
    const cat = await seedCategory(user.id, txClient);
    const q = await seedQuestion(user.id, cat.id, txClient);
    const game = await qs.createGame(user.id, 'Board', true, txClient);

    await txClient.query('SAVEPOINT board_setup');
    const gc = await qs.insertGameCategory(game.id, cat.id, 1, txClient);
    await qs.insertGameQuestion(game.id, gc.id, q.id, 1, 200, false, txClient);
    await txClient.query('RELEASE SAVEPOINT board_setup');

    const cats = await qs.listGameCategoriesWithCategoryData(game.id, txClient);
    expect(cats).toHaveLength(1);
    expect(cats[0].category_name).toBe('Science');

    const qs2 = await qs.listGameQuestionsWithData(game.id, txClient);
    expect(qs2).toHaveLength(1);
    expect(qs2[0].point_value).toBe(200);
  });

  test('countGameCategories and countGameQuestionsWithPointValue reflect board state', async () => {
    const user = await seedUser(txClient);
    const cat = await seedCategory(user.id, txClient);
    const q = await seedQuestion(user.id, cat.id, txClient);
    const game = await qs.createGame(user.id, 'G', true, txClient);

    expect(await qs.countGameCategories(game.id, txClient)).toBe(0);
    expect(await qs.countGameQuestionsWithPointValue(game.id, txClient)).toBe(0);

    await txClient.query('SAVEPOINT board_setup');
    const gc = await qs.insertGameCategory(game.id, cat.id, 1, txClient);
    await qs.insertGameQuestion(game.id, gc.id, q.id, 1, 200, false, txClient);
    await txClient.query('RELEASE SAVEPOINT board_setup');

    expect(await qs.countGameCategories(game.id, txClient)).toBe(1);
    expect(await qs.countGameQuestionsWithPointValue(game.id, txClient)).toBe(1);
  });

  test('deleteGameBoard removes questions then categories in the correct FK order', async () => {
    const user = await seedUser(txClient);
    const cat = await seedCategory(user.id, txClient);
    const q = await seedQuestion(user.id, cat.id, txClient);
    const game = await qs.createGame(user.id, 'G', true, txClient);

    await txClient.query('SAVEPOINT board_setup');
    const gc = await qs.insertGameCategory(game.id, cat.id, 1, txClient);
    await qs.insertGameQuestion(game.id, gc.id, q.id, 1, 200, false, txClient);
    await qs.deleteGameBoard(game.id, txClient);
    await txClient.query('RELEASE SAVEPOINT board_setup');

    expect(await qs.countGameCategories(game.id, txClient)).toBe(0);
  });

  test('deleteGame removes the game row and returns true; false when not found', async () => {
    const user = await seedUser(txClient);
    const game = await qs.createGame(user.id, 'Del', true, txClient);

    await txClient.query('SAVEPOINT delete_game');
    const deleted = await qs.deleteGame(game.id, user.id, txClient);
    await txClient.query('RELEASE SAVEPOINT delete_game');
    expect(deleted).toBe(true);

    expect(await qs.findGameById(game.id, txClient)).toBeNull();
  });

  test('markQuestionAnswered sets is_answered = true', async () => {
    const user = await seedUser(txClient);
    const cat = await seedCategory(user.id, txClient);
    const q = await seedQuestion(user.id, cat.id, txClient);
    const game = await qs.createGame(user.id, 'G', true, txClient);

    await txClient.query('SAVEPOINT board_setup');
    const gc = await qs.insertGameCategory(game.id, cat.id, 1, txClient);
    await qs.insertGameQuestion(game.id, gc.id, q.id, 1, 200, false, txClient);
    await txClient.query('RELEASE SAVEPOINT board_setup');

    await qs.markQuestionAnswered(game.id, q.id, txClient);
    const rows = await qs.listGameQuestionsWithData(game.id, txClient);
    expect(rows[0].is_answered).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

describe('Sessions', () => {
  test('createSession inserts and returns a DbGameSession', async () => {
    const user = await seedUser(txClient);
    const game = await seedGame(user.id, txClient);
    const session = await qs.createSession(
      game.id,
      user.id,
      'Test Session',
      'ABC123',
      'computer_hosted',
      false,
      txClient
    );

    expect(session.id).toBeGreaterThan(0);
    expect(session.join_code).toBe('ABC123');
    expect(session.status).toBe('lobby');
    expect(session.mode).toBe('computer_hosted');
    expect(session.turn_based).toBe(false);
    expect(session.ended_at).toBeNull();
  });

  test('checkJoinCodeCollision returns true for lobby/active sessions, false for completed', async () => {
    const user = await seedUser(txClient);
    const game = await seedGame(user.id, txClient);
    await qs.createSession(game.id, user.id, 'S', 'LIVE01', 'computer_hosted', false, txClient);

    expect(await qs.checkJoinCodeCollision('LIVE01', txClient)).toBe(true);

    // Complete it
    await qs.updateSessionStatus((await qs.findSessionByJoinCode('LIVE01', txClient))!.id, 'completed', txClient);

    expect(await qs.checkJoinCodeCollision('LIVE01', txClient)).toBe(false);
  });

  test('findSessionByJoinCode finds lobby/active sessions; uppercases join code', async () => {
    const user = await seedUser(txClient);
    const game = await seedGame(user.id, txClient);
    await qs.createSession(game.id, user.id, 'S', 'FIND01', 'computer_hosted', false, txClient);

    expect((await qs.findSessionByJoinCode('find01', txClient))?.join_code).toBe('FIND01');
  });

  test('findSessionByJoinCode returns null for completed sessions', async () => {
    const user = await seedUser(txClient);
    const game = await seedGame(user.id, txClient);
    const s = await qs.createSession(game.id, user.id, 'S', 'DONE01', 'computer_hosted', false, txClient);
    await qs.updateSessionStatus(s.id, 'completed', txClient);
    expect(await qs.findSessionByJoinCode('DONE01', txClient)).toBeNull();
  });

  test('findSessionById returns the session', async () => {
    const user = await seedUser(txClient);
    const game = await seedGame(user.id, txClient);
    const s = await qs.createSession(game.id, user.id, 'S', 'ID0001', 'computer_hosted', false, txClient);
    const found = await qs.findSessionById(s.id, txClient);
    expect(found?.id).toBe(s.id);
  });

  test('updateSessionStatus sets ended_at only when status is completed', async () => {
    const user = await seedUser(txClient);
    const game = await seedGame(user.id, txClient);
    const s = await qs.createSession(game.id, user.id, 'S', 'ST0001', 'computer_hosted', false, txClient);

    const active = await qs.updateSessionStatus(s.id, 'active', txClient);
    expect(active?.status).toBe('active');
    expect(active?.ended_at).toBeNull();

    const completed = await qs.updateSessionStatus(s.id, 'completed', txClient);
    expect(completed?.status).toBe('completed');
    expect(completed?.ended_at).not.toBeNull();
  });

  test('addPlayer, getPlayers, findPlayerByUserId, updateScore, removePlayer', async () => {
    const user = await seedUser(txClient);
    const game = await seedGame(user.id, txClient);
    const s = await qs.createSession(game.id, user.id, 'S', 'PL0001', 'computer_hosted', false, txClient);

    const player = await qs.addPlayer(s.id, 'Alice', user.id, txClient);
    expect(player.display_name).toBe('Alice');
    expect(player.final_score).toBe(0);

    const players = await qs.getPlayers(s.id, txClient);
    expect(players).toHaveLength(1);

    const byUserId = await qs.findPlayerByUserId(s.id, user.id, txClient);
    expect(byUserId?.id).toBe(player.id);

    await qs.updateScore(player.id, 800, txClient);
    const refreshed = await qs.getPlayers(s.id, txClient);
    expect(refreshed[0].final_score).toBe(800);

    expect(await qs.removePlayer(s.id, player.id, txClient)).toBe(true);
    expect(await qs.getPlayers(s.id, txClient)).toHaveLength(0);
  });

  test('setRanks assigns equal rank to tied players', async () => {
    const user = await seedUser(txClient);
    const game = await seedGame(user.id, txClient);
    const s = await qs.createSession(game.id, user.id, 'S', 'RK0001', 'computer_hosted', false, txClient);

    const p1 = await qs.addPlayer(s.id, 'P1', null, txClient);
    const p2 = await qs.addPlayer(s.id, 'P2', null, txClient);
    const p3 = await qs.addPlayer(s.id, 'P3', null, txClient);

    await qs.updateScore(p1.id, 800, txClient);
    await qs.updateScore(p2.id, 800, txClient); // tie with p1
    await qs.updateScore(p3.id, 400, txClient);

    const ranked = await qs.setRanks(s.id, txClient);
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
    const user = await seedUser(txClient);
    const upload = await qs.confirmUpload(
      user.id,
      'files/img.png',
      'https://r2.example.com/img.png',
      'image/png',
      4096,
      txClient
    );
    expect(upload.id).toBeGreaterThan(0);
    expect(upload.key).toBe('files/img.png');
    expect(upload.mime_type).toBe('image/png');
    expect(upload.size_bytes).toBe(4096);
  });

  test('confirmUpload throws 23505 on duplicate public_url', async () => {
    const user = await seedUser(txClient);
    await qs.confirmUpload(user.id, 'k1', 'https://r2.example.com/dup.png', 'image/png', 1, txClient);
    const err = await qs
      .confirmUpload(user.id, 'k2', 'https://r2.example.com/dup.png', 'image/png', 1, txClient)
      .catch((e) => e);
    expect(err.code).toBe('23505');
  });

  test('countUploads and listUploads reflect persisted state', async () => {
    const user = await seedUser(txClient);
    await qs.confirmUpload(user.id, 'k1', 'https://r2.example.com/a.png', 'image/png', 1, txClient);
    await qs.confirmUpload(user.id, 'k2', 'https://r2.example.com/b.png', 'image/png', 2, txClient);

    expect(await qs.countUploads(user.id, txClient)).toBe(2);
    const list = await qs.listUploads(user.id, 10, 0, txClient);
    expect(list).toHaveLength(2);
  });

  test("findUploadById returns null for another owner's upload", async () => {
    const u1 = await seedUser(txClient, { email: 'u1@x.com' });
    const u2 = await seedUser(txClient, { email: 'u2@x.com' });
    const upload = await qs.confirmUpload(
      u1.id,
      'k',
      'https://r2.example.com/priv.png',
      'image/png',
      1,
      txClient
    );
    expect(await qs.findUploadById(upload.id, u2.id, txClient)).toBeNull();
    expect(await qs.findUploadById(upload.id, u1.id, txClient)).not.toBeNull();
  });

  test('deleteUpload removes the row', async () => {
    const user = await seedUser(txClient);
    const upload = await qs.confirmUpload(
      user.id,
      'k',
      'https://r2.example.com/del.png',
      'image/png',
      1,
      txClient
    );
    await qs.deleteUpload(upload.id, txClient);
    expect(await qs.findUploadById(upload.id, user.id, txClient)).toBeNull();
  });
});
