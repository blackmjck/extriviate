import { customAlphabet } from "nanoid";
import type { Pool } from "pg";
import type { GameSession, SessionPlayer } from "@extriviate/shared";
import { SESSION_CODE_LENGTH } from "@extriviate/shared";

// Only uppercase letters and numbers, no ambiguous characters (0,O,I,1).
// This produces codes like "A3F9K2" that are easy to read and type.
const generateCode = customAlphabet(
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
  SESSION_CODE_LENGTH,
);

export class SessionService {
  constructor(private readonly db: Pool) {}

  async createSession(
    gameId: number,
    hostId: number,
    name: string,
  ): Promise<GameSession> {
    // Generate a unique join code, retrying on the rare chance of a collision
    let joinCode: string;
    let attempts = 0;

    while (true) {
      joinCode = generateCode();
      const existing = await this.db.query(
        `SELECT id FROM game_sessions
        WHERE join_code = $1 AND status != 'completed'`,
        [joinCode],
      );
      // Only check for collision against active sessions -
      // completed sessions can safely reuse old codes
      if (existing.rows.length === 0) break;
      if (++attempts > 10)
        throw new Error("Could not generate unique join code");
    }

    const result = await this.db.query<GameSession>(
      `INSERT INTO game_sessions (game_id, host_id, name, join_code, status)
      VALUES ($1, $2, $3, $4, 'lobby')
      RETURNING *`,
      [gameId, hostId, name, joinCode!],
    );

    return result.rows[0];
  }

  async findByJoinCode(joinCode: string): Promise<GameSession | null> {
    const result = await this.db.query<GameSession>(
      `SELECT * FROM game_sessions
      WHERE join_code = $1 AND status IN ('lobby', 'active')`,
      [joinCode.toUpperCase()],
    );
    return result.rows[0] ?? null;
  }

  async findById(sessionId: number): Promise<GameSession | null> {
    const result = await this.db.query<GameSession>(
      "SELECT * FROM game_sessions WHERE id = $1",
      [sessionId],
    );
    return result.rows[0] ?? null;
  }

  async updateStatus(
    sessionId: number,
    status: string,
  ): Promise<GameSession | null> {
    const extra = status === "completed" ? ", ended_at = NOW()" : "";
    const result = await this.db.query<GameSession>(
      `UPDATE game_sessions
       SET status = $1${extra}
       WHERE id = $2
       RETURNING *`,
      [status, sessionId],
    );
    return result.rows[0] ?? null;
  }

  // ---- Player operations ----

  async addPlayer(
    sessionId: number,
    displayName: string,
    userId: number | null,
  ): Promise<SessionPlayer> {
    const result = await this.db.query<SessionPlayer>(
      `INSERT INTO session_players (session_id, user_id, display_name, final_score)
       VALUES ($1, $2, $3, 0)
       RETURNING *`,
      [sessionId, userId, displayName],
    );
    return result.rows[0];
  }

  async getPlayers(sessionId: number): Promise<SessionPlayer[]> {
    const result = await this.db.query<SessionPlayer>(
      `SELECT * FROM session_players
       WHERE session_id = $1
       ORDER BY final_score DESC, display_name ASC`,
      [sessionId],
    );
    return result.rows;
  }

  async findPlayerByUserId(
    sessionId: number,
    userId: number,
  ): Promise<SessionPlayer | null> {
    const result = await this.db.query<SessionPlayer>(
      `SELECT * FROM session_players
       WHERE session_id = $1 AND user_id = $2`,
      [sessionId, userId],
    );
    return result.rows[0] ?? null;
  }

  async removePlayer(sessionId: number, playerId: number): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM session_players
       WHERE id = $1 AND session_id = $2
       RETURNING id`,
      [playerId, sessionId],
    );
    return result.rows.length > 0;
  }

  async updateScore(playerId: number, newScore: number): Promise<void> {
    await this.db.query(
      "UPDATE session_players SET final_score = $1 WHERE id = $2",
      [newScore, playerId],
    );
  }

  async setRanks(sessionId: number): Promise<SessionPlayer[]> {
    // Assign ranks based on final_score descending.
    // Players with the same score get the same rank.
    const result = await this.db.query<SessionPlayer>(
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

  async markQuestionAnswered(
    gameId: number,
    questionId: number,
  ): Promise<void> {
    await this.db.query(
      `UPDATE game_questions
       SET is_answered = true
       WHERE game_id = $1 AND question_id = $2`,
      [gameId, questionId],
    );
  }
}
