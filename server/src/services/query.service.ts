import type { Pool, PoolClient } from 'pg';
import type {
  DbAnswer,
  DbCategory,
  DbGame,
  DbGameCategory,
  DbGameCategoryRow,
  DbGameListItem,
  DbGameQuestion,
  DbGameQuestionRow,
  DbGameSession,
  DbPasswordResetToken,
  DbPublicUser,
  DbQuestion,
  DbQuestionWithAnswer,
  DbSessionPlayer,
  DbUpload,
  DbUser,
  DbUserStats,
  SessionMode,
  SessionStatus,
} from '@extriviate/shared';
import { GAME_CATEGORY_COUNT, GAME_QUESTION_ROWS } from '@extriviate/shared';

// QueryService is the single source of truth for all SQL in the server.
// Each method maps 1:1 to a distinct query or small set of related queries.
// Methods are alphabetically ordered within labelled sections.
//
// Transaction pattern: methods that can participate in a caller-managed
// transaction accept an optional `client?: PoolClient`. When provided, the
// method uses that client directly. When omitted it uses the pool.
// Some methods take a non-optional `client: PoolClient` — these are ONLY
// ever valid inside an existing transaction (e.g. deleteGameBoard).
export class QueryService {
  constructor(private readonly db: Pool) {}

  private conn(client?: PoolClient): Pool | PoolClient {
    return client ?? this.db;
  }

  // ---- Answers ----

  async createAnswer(
    questionId: number,
    content: unknown,
    acceptedAnswers?: string[],
    client?: PoolClient,
  ): Promise<DbAnswer> {
    const result = await this.conn(client).query<DbAnswer>(
      `INSERT INTO answers (question_id, content, accepted_answers)
       VALUES ($1, $2, $3)
       RETURNING id, question_id, content, accepted_answers, created_at`,
      [questionId, JSON.stringify(content), acceptedAnswers ?? []],
    );
    return result.rows[0];
  }

  async updateAnswer(
    questionId: number,
    content: unknown,
    client?: PoolClient,
  ): Promise<void> {
    await this.conn(client).query(
      'UPDATE answers SET content = $1 WHERE question_id = $2',
      [JSON.stringify(content), questionId],
    );
  }

  // ---- Categories ----

  async countCategories(creatorId: number): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      'SELECT COUNT(*) FROM categories WHERE creator_id = $1',
      [creatorId],
    );
    return parseInt(result.rows[0].count, 10);
  }

  async createCategory(
    creatorId: number,
    name: string,
    description: string | null,
  ): Promise<DbCategory> {
    const result = await this.db.query<DbCategory>(
      `INSERT INTO categories (creator_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING id, creator_id, name, description, created_at, updated_at`,
      [creatorId, name, description],
    );
    return result.rows[0];
  }

  async deleteCategory(categoryId: number, creatorId: number): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM categories WHERE id = $1 AND creator_id = $2 RETURNING id',
      [categoryId, creatorId],
    );
    return result.rows.length > 0;
  }

  async findCategoryById(
    categoryId: number,
    creatorId: number,
  ): Promise<DbCategory | null> {
    const result = await this.db.query<DbCategory>(
      `SELECT id, creator_id, name, description, created_at, updated_at
       FROM categories
       WHERE id = $1 AND creator_id = $2`,
      [categoryId, creatorId],
    );
    return result.rows[0] ?? null;
  }

  async findCategoryForCreator(
    categoryId: number,
    creatorId: number,
    client?: PoolClient,
  ): Promise<{ id: number } | null> {
    const result = await this.conn(client).query<{ id: number }>(
      'SELECT id FROM categories WHERE id = $1 AND creator_id = $2',
      [categoryId, creatorId],
    );
    return result.rows[0] ?? null;
  }

  async listCategories(
    creatorId: number,
    limit: number,
    offset: number,
  ): Promise<DbCategory[]> {
    const result = await this.db.query<DbCategory>(
      `SELECT id, creator_id, name, description, created_at, updated_at
       FROM categories
       WHERE creator_id = $1
       ORDER BY name ASC
       LIMIT $2 OFFSET $3`,
      [creatorId, limit, offset],
    );
    return result.rows;
  }

  async updateCategory(
    categoryId: number,
    creatorId: number,
    name: string | null,
    description: string | null,
  ): Promise<DbCategory | null> {
    const result = await this.db.query<DbCategory>(
      `UPDATE categories
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           updated_at = NOW()
       WHERE id = $3 AND creator_id = $4
       RETURNING id, creator_id, name, description, created_at, updated_at`,
      [name, description, categoryId, creatorId],
    );
    return result.rows[0] ?? null;
  }

  // ---- Games ----

  async countGameCategories(gameId: number): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      'SELECT COUNT(*) FROM game_categories WHERE game_id = $1',
      [gameId],
    );
    return parseInt(result.rows[0].count, 10);
  }

  async countGames(creatorId: number): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      'SELECT COUNT(*) FROM games WHERE creator_id = $1',
      [creatorId],
    );
    return parseInt(result.rows[0].count, 10);
  }

  async countGameQuestionsWithPointValue(gameId: number): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      'SELECT COUNT(*) FROM game_questions WHERE game_id = $1 AND point_value > 0',
      [gameId],
    );
    return parseInt(result.rows[0].count, 10);
  }

  async createGame(
    creatorId: number,
    title: string,
    dailyDoublesEnabled: boolean,
  ): Promise<DbGame> {
    const result = await this.db.query<DbGame>(
      `INSERT INTO games (creator_id, title, daily_doubles_enabled)
       VALUES ($1, $2, $3)
       RETURNING id, creator_id, title, daily_doubles_enabled, is_published,
                 require_question_format, use_ai_evaluation, created_at, updated_at`,
      [creatorId, title, dailyDoublesEnabled],
    );
    return result.rows[0];
  }

  // client is required — deleteGame is only called inside a caller-managed transaction
  async deleteGame(
    gameId: number,
    creatorId: number,
    client: PoolClient,
  ): Promise<boolean> {
    const result = await client.query(
      'DELETE FROM games WHERE id = $1 AND creator_id = $2 RETURNING id',
      [gameId, creatorId],
    );
    return result.rows.length > 0;
  }

  // client is required — deleteGameBoard is only called inside a caller-managed transaction.
  // Deletes questions before categories because game_questions has an FK to game_categories.
  async deleteGameBoard(gameId: number, client: PoolClient): Promise<void> {
    await client.query('DELETE FROM game_questions WHERE game_id = $1', [gameId]);
    await client.query('DELETE FROM game_categories WHERE game_id = $1', [gameId]);
  }

  // Used by session-state-builder — does not enforce creator ownership
  async findGameById(gameId: number): Promise<DbGame | null> {
    const result = await this.db.query<DbGame>(
      `SELECT id, creator_id, title, daily_doubles_enabled, is_published,
              require_question_format, use_ai_evaluation, created_at, updated_at
       FROM games WHERE id = $1`,
      [gameId],
    );
    return result.rows[0] ?? null;
  }

  // Used by routes — enforces creator ownership
  async findGameForOwner(gameId: number, creatorId: number): Promise<DbGame | null> {
    const result = await this.db.query<DbGame>(
      `SELECT id, creator_id, title, daily_doubles_enabled, is_published,
              require_question_format, use_ai_evaluation, created_at, updated_at
       FROM games WHERE id = $1 AND creator_id = $2`,
      [gameId, creatorId],
    );
    return result.rows[0] ?? null;
  }

  // client is required — called inside board-replacement transaction
  async insertGameCategory(
    gameId: number,
    categoryId: number,
    position: number,
    client: PoolClient,
  ): Promise<DbGameCategory> {
    const result = await client.query<DbGameCategory>(
      `INSERT INTO game_categories (game_id, category_id, position)
       VALUES ($1, $2, $3)
       RETURNING id, game_id, category_id, position, created_at`,
      [gameId, categoryId, position],
    );
    return result.rows[0];
  }

  // client is required — called inside board-replacement transaction
  async insertGameQuestion(
    gameId: number,
    gameCategoryId: number,
    questionId: number,
    rowPosition: number,
    pointValue: number,
    isDailyDouble: boolean,
    client: PoolClient,
  ): Promise<void> {
    await client.query(
      `INSERT INTO game_questions
         (game_id, game_category_id, question_id, row_position, point_value, is_daily_double)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [gameId, gameCategoryId, questionId, rowPosition, pointValue, isDailyDouble],
    );
  }

  // Returns full JOIN result used by GET /api/games/:id and the session-state-builder.
  // Includes category_creator_id so both call sites can map correctly.
  async listGameCategoriesWithCategoryData(gameId: number): Promise<DbGameCategoryRow[]> {
    const result = await this.db.query<DbGameCategoryRow>(
      `SELECT gc.id, gc.game_id, gc.category_id, gc.position, gc.created_at,
              c.name AS category_name, c.description AS category_description,
              c.creator_id AS category_creator_id,
              c.created_at AS category_created_at, c.updated_at AS category_updated_at
       FROM game_categories gc
       JOIN categories c ON c.id = gc.category_id
       WHERE gc.game_id = $1
       ORDER BY gc.position`,
      [gameId],
    );
    return result.rows;
  }

  // Returns full JOIN result used by GET /api/games/:id and the session-state-builder.
  // Includes question_creator_id and accepted_answers so both call sites can map correctly.
  async listGameQuestionsWithData(gameId: number): Promise<DbGameQuestionRow[]> {
    const result = await this.db.query<DbGameQuestionRow>(
      `SELECT gq.id, gq.game_id, gq.game_category_id, gq.question_id, gq.row_position,
              gq.point_value, gq.is_daily_double, gq.is_answered,
              q.creator_id AS question_creator_id,
              q.content AS question_content, q.category_id,
              q.created_at AS question_created_at, q.updated_at AS question_updated_at,
              a.id AS answer_id, a.content AS answer_content,
              a.accepted_answers
       FROM game_questions gq
       JOIN questions q ON q.id = gq.question_id
       LEFT JOIN answers a ON a.question_id = q.id
       WHERE gq.game_id = $1
       ORDER BY gq.row_position`,
      [gameId],
    );
    return result.rows;
  }

  async listGames(
    creatorId: number,
    limit: number,
    offset: number,
  ): Promise<DbGameListItem[]> {
    const totalQuestions = GAME_CATEGORY_COUNT * GAME_QUESTION_ROWS;
    const result = await this.db.query<DbGameListItem>(
      `SELECT g.id, g.title, g.daily_doubles_enabled, g.is_published,
              g.created_at, g.updated_at,
              (
                g.title <> '' AND
                (SELECT COUNT(*) FROM game_categories gc WHERE gc.game_id = g.id) = $4 AND
                (SELECT COUNT(*) FROM game_questions gq WHERE gq.game_id = g.id AND gq.point_value > 0) = $5
              ) AS is_complete
       FROM games g
       WHERE g.creator_id = $1
       ORDER BY g.updated_at DESC
       LIMIT $2 OFFSET $3`,
      [creatorId, limit, offset, GAME_CATEGORY_COUNT, totalQuestions],
    );
    return result.rows;
  }

  async updateGame(
    gameId: number,
    creatorId: number,
    title: string | null,
    dailyDoublesEnabled: boolean | null,
    isPublished: boolean | null,
  ): Promise<DbGame | null> {
    const result = await this.db.query<DbGame>(
      `UPDATE games
       SET title = COALESCE($1, title),
           daily_doubles_enabled = COALESCE($2, daily_doubles_enabled),
           is_published = COALESCE($3, is_published),
           updated_at = NOW()
       WHERE id = $4 AND creator_id = $5
       RETURNING id, creator_id, title, daily_doubles_enabled, is_published,
                 require_question_format, use_ai_evaluation, created_at, updated_at`,
      [title, dailyDoublesEnabled, isPublished, gameId, creatorId],
    );
    return result.rows[0] ?? null;
  }

  // ---- Password Reset ----

  async createPasswordResetToken(
    userId: number,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt],
    );
  }

  // client is required — called inside the reset-password transaction
  async deleteUnusedPasswordResetTokensForUser(
    userId: number,
    client: PoolClient,
  ): Promise<void> {
    await client.query(
      'DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL',
      [userId],
    );
  }

  async findPasswordResetToken(tokenHash: string): Promise<DbPasswordResetToken | null> {
    const result = await this.db.query<DbPasswordResetToken>(
      `SELECT id, user_id, token_hash, expires_at, used_at, created_at
       FROM password_reset_tokens
       WHERE token_hash = $1`,
      [tokenHash],
    );
    return result.rows[0] ?? null;
  }

  // client is required — called inside the reset-password transaction.
  // Returns false when the token was already claimed (concurrent race condition).
  async markPasswordResetTokenUsed(
    tokenId: string,
    client: PoolClient,
  ): Promise<boolean> {
    const result = await client.query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1 AND used_at IS NULL',
      [tokenId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ---- Questions ----

  async countQuestions(creatorId: number, categoryId?: number): Promise<number> {
    const params: unknown[] = [creatorId];
    let where = 'q.creator_id = $1';
    if (categoryId !== undefined) {
      params.push(categoryId);
      where += ` AND q.category_id = $${params.length}`;
    }
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) FROM questions q WHERE ${where}`,
      params,
    );
    return parseInt(result.rows[0].count, 10);
  }

  async createQuestion(
    creatorId: number,
    categoryId: number,
    content: unknown,
    client?: PoolClient,
  ): Promise<DbQuestion> {
    const result = await this.conn(client).query<DbQuestion>(
      `INSERT INTO questions (creator_id, category_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, creator_id, category_id, content, created_at, updated_at`,
      [creatorId, categoryId, JSON.stringify(content)],
    );
    return result.rows[0];
  }

  async deleteQuestion(questionId: number, creatorId: number): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM questions WHERE id = $1 AND creator_id = $2 RETURNING id',
      [questionId, creatorId],
    );
    return result.rows.length > 0;
  }

  async findQuestionForCreator(
    questionId: number,
    creatorId: number,
    client?: PoolClient,
  ): Promise<{ id: number } | null> {
    const result = await this.conn(client).query<{ id: number }>(
      'SELECT id FROM questions WHERE id = $1 AND creator_id = $2',
      [questionId, creatorId],
    );
    return result.rows[0] ?? null;
  }

  // When creatorId is omitted (e.g., re-fetch inside a transaction after ownership
  // was already verified), the WHERE clause only filters by questionId.
  async findQuestionWithAnswer(
    questionId: number,
    creatorId?: number,
    client?: PoolClient,
  ): Promise<DbQuestionWithAnswer | null> {
    const params: unknown[] = [questionId];
    let where = 'q.id = $1';
    if (creatorId !== undefined) {
      params.push(creatorId);
      where += ` AND q.creator_id = $${params.length}`;
    }
    const result = await this.conn(client).query<DbQuestionWithAnswer>(
      `SELECT q.id, q.creator_id, q.category_id, q.content, q.created_at, q.updated_at,
              a.id AS answer_id, a.content AS answer_content
       FROM questions q
       LEFT JOIN answers a ON a.question_id = q.id
       WHERE ${where}`,
      params,
    );
    return result.rows[0] ?? null;
  }

  async listQuestionsWithAnswers(
    creatorId: number,
    limit: number,
    offset: number,
    categoryId?: number,
  ): Promise<DbQuestionWithAnswer[]> {
    const params: unknown[] = [creatorId];
    let where = 'q.creator_id = $1';
    if (categoryId !== undefined) {
      params.push(categoryId);
      where += ` AND q.category_id = $${params.length}`;
    }
    const result = await this.db.query<DbQuestionWithAnswer>(
      `SELECT q.id, q.creator_id, q.category_id, q.content, q.created_at, q.updated_at,
              a.id AS answer_id, a.content AS answer_content
       FROM questions q
       LEFT JOIN answers a ON a.question_id = q.id
       WHERE ${where}
       ORDER BY q.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    return result.rows;
  }

  async updateQuestion(
    questionId: number,
    content: unknown,
    client?: PoolClient,
  ): Promise<void> {
    await this.conn(client).query(
      'UPDATE questions SET content = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(content), questionId],
    );
  }

  // ---- Sessions ----

  async addPlayer(
    sessionId: number,
    displayName: string,
    userId: number | null,
  ): Promise<DbSessionPlayer> {
    const result = await this.db.query<DbSessionPlayer>(
      `INSERT INTO session_players (session_id, user_id, display_name, final_score)
       VALUES ($1, $2, $3, 0)
       RETURNING *`,
      [sessionId, userId, displayName],
    );
    return result.rows[0];
  }

  async checkJoinCodeCollision(joinCode: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT id FROM game_sessions WHERE join_code = $1 AND status != 'completed'`,
      [joinCode],
    );
    return result.rows.length > 0;
  }

  async createSession(
    gameId: number,
    hostId: number,
    name: string,
    joinCode: string,
    mode: SessionMode,
    turnBased: boolean,
  ): Promise<DbGameSession> {
    const result = await this.db.query<DbGameSession>(
      `INSERT INTO game_sessions (game_id, host_id, name, join_code, status, mode, turn_based)
       VALUES ($1, $2, $3, $4, 'lobby', $5, $6)
       RETURNING *`,
      [gameId, hostId, name, joinCode, mode, turnBased],
    );
    return result.rows[0];
  }

  async findPlayerByUserId(
    sessionId: number,
    userId: number,
  ): Promise<DbSessionPlayer | null> {
    const result = await this.db.query<DbSessionPlayer>(
      'SELECT * FROM session_players WHERE session_id = $1 AND user_id = $2',
      [sessionId, userId],
    );
    return result.rows[0] ?? null;
  }

  async findSessionById(sessionId: number): Promise<DbGameSession | null> {
    const result = await this.db.query<DbGameSession>(
      'SELECT * FROM game_sessions WHERE id = $1',
      [sessionId],
    );
    return result.rows[0] ?? null;
  }

  async findSessionByJoinCode(joinCode: string): Promise<DbGameSession | null> {
    const result = await this.db.query<DbGameSession>(
      `SELECT * FROM game_sessions WHERE join_code = $1 AND status IN ('lobby', 'active')`,
      [joinCode.toUpperCase()],
    );
    return result.rows[0] ?? null;
  }

  async getPlayers(sessionId: number): Promise<DbSessionPlayer[]> {
    const result = await this.db.query<DbSessionPlayer>(
      `SELECT * FROM session_players
       WHERE session_id = $1
       ORDER BY final_score DESC, display_name ASC`,
      [sessionId],
    );
    return result.rows;
  }

  async markQuestionAnswered(gameId: number, questionId: number): Promise<void> {
    await this.db.query(
      'UPDATE game_questions SET is_answered = true WHERE game_id = $1 AND question_id = $2',
      [gameId, questionId],
    );
  }

  async removePlayer(sessionId: number, playerId: number): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM session_players WHERE id = $1 AND session_id = $2 RETURNING id',
      [playerId, sessionId],
    );
    return result.rows.length > 0;
  }

  async setRanks(sessionId: number): Promise<DbSessionPlayer[]> {
    // RANK() OVER gives tied players the same rank (e.g., two players at 800 both rank 1st)
    const result = await this.db.query<DbSessionPlayer>(
      `UPDATE session_players sp
       SET rank = ranked.rank
       FROM (
         SELECT id, RANK() OVER (ORDER BY final_score DESC) AS rank
         FROM session_players
         WHERE session_id = $1
       ) ranked
       WHERE sp.id = ranked.id AND sp.session_id = $1
       RETURNING sp.*`,
      [sessionId],
    );
    return result.rows;
  }

  async updateScore(playerId: number, newScore: number): Promise<void> {
    await this.db.query(
      'UPDATE session_players SET final_score = $1 WHERE id = $2',
      [newScore, playerId],
    );
  }

  async updateSessionStatus(
    sessionId: number,
    status: SessionStatus,
  ): Promise<DbGameSession | null> {
    const extra = status === 'completed' ? ', ended_at = NOW()' : '';
    const result = await this.db.query<DbGameSession>(
      `UPDATE game_sessions SET status = $1${extra} WHERE id = $2 RETURNING *`,
      [status, sessionId],
    );
    return result.rows[0] ?? null;
  }

  // ---- Uploads ----

  async confirmUpload(
    ownerId: number,
    key: string,
    publicUrl: string,
    mimeType: string,
    sizeBytes: number,
  ): Promise<DbUpload> {
    const result = await this.db.query<DbUpload>(
      `INSERT INTO uploads (owner_id, key, public_url, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, owner_id, key, public_url, mime_type, size_bytes, created_at`,
      [ownerId, key, publicUrl, mimeType, sizeBytes],
    );
    return result.rows[0];
  }

  async countUploads(ownerId: number): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      'SELECT COUNT(*) FROM uploads WHERE owner_id = $1',
      [ownerId],
    );
    return parseInt(result.rows[0].count, 10);
  }

  async deleteUpload(uploadId: number): Promise<void> {
    await this.db.query('DELETE FROM uploads WHERE id = $1', [uploadId]);
  }

  async findUploadById(uploadId: number, ownerId: number): Promise<DbUpload | null> {
    const result = await this.db.query<DbUpload>(
      `SELECT id, owner_id, key, public_url, mime_type, size_bytes, created_at
       FROM uploads WHERE id = $1 AND owner_id = $2`,
      [uploadId, ownerId],
    );
    return result.rows[0] ?? null;
  }

  async listUploads(ownerId: number, limit: number, offset: number): Promise<DbUpload[]> {
    const result = await this.db.query<DbUpload>(
      `SELECT id, owner_id, key, public_url, mime_type, size_bytes, created_at
       FROM uploads
       WHERE owner_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [ownerId, limit, offset],
    );
    return result.rows;
  }

  // ---- Users ----

  async createUser(
    email: string,
    displayName: string,
    passwordHash: string,
  ): Promise<DbUser> {
    const result = await this.db.query<DbUser>(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name, password_hash, role, is_active,
                 created_at, updated_at, token_version`,
      [email, displayName, passwordHash],
    );
    return result.rows[0];
  }

  async deactivateUser(userId: number): Promise<void> {
    await this.db.query(
      'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1',
      [userId],
    );
  }

  async findActiveUserByEmail(email: string): Promise<DbUser | null> {
    const result = await this.db.query<DbUser>(
      'SELECT * FROM users WHERE email = $1 AND is_active = true',
      [email],
    );
    return result.rows[0] ?? null;
  }

  async findActiveUserById(userId: number): Promise<DbPublicUser | null> {
    const result = await this.db.query<DbPublicUser>(
      'SELECT id, display_name, role, created_at FROM users WHERE id = $1 AND is_active = true',
      [userId],
    );
    return result.rows[0] ?? null;
  }

  async findUserHashById(userId: number): Promise<{ password_hash: string } | null> {
    const result = await this.db.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1 AND is_active = true',
      [userId],
    );
    return result.rows[0] ?? null;
  }

  async getUserStats(userId: number): Promise<DbUserStats> {
    const result = await this.db.query<DbUserStats>(
      `SELECT
        (SELECT COUNT(*) FROM games WHERE creator_id = $1) AS games_created,
        (SELECT COUNT(*) FROM categories WHERE creator_id = $1) AS categories_created,
        (SELECT COUNT(*) FROM questions WHERE creator_id = $1) AS questions_created,
        (SELECT COUNT(*) FROM session_players sp
          JOIN game_sessions gs ON gs.id = sp.session_id
          WHERE sp.user_id = $1 AND gs.status = 'completed') AS sessions_played`,
      [userId],
    );
    return result.rows[0];
  }

  async updateUserDisplayName(
    userId: number,
    displayName: string | null,
  ): Promise<DbPublicUser | null> {
    const result = await this.db.query<DbPublicUser>(
      `UPDATE users
       SET display_name = COALESCE($1, display_name),
           updated_at = NOW()
       WHERE id = $2 AND is_active = true
       RETURNING id, display_name, role, created_at`,
      [displayName, userId],
    );
    return result.rows[0] ?? null;
  }

  async updateUserPassword(
    userId: number,
    passwordHash: string,
    client?: PoolClient,
  ): Promise<void> {
    await this.conn(client).query(
      'UPDATE users SET password_hash = $1, updated_at = NOW(), token_version = token_version + 1 WHERE id = $2',
      [passwordHash, userId],
    );
  }
}
