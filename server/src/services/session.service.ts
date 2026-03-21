import { customAlphabet } from 'nanoid';
import type { SessionMode, SessionStatus, DbGameSession, DbSessionPlayer } from '@extriviate/shared';
import { SESSION_CODE_LENGTH } from '@extriviate/shared';
import type { QueryService } from './query.service.js';

// Only uppercase letters and numbers, no ambiguous characters (0,O,I,1).
// This produces codes like "A3F9K2" that are easy to read and type.
const generateCode = customAlphabet(
  'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  SESSION_CODE_LENGTH,
);

export { DbGameSession };

export class SessionService {
  constructor(private readonly qs: QueryService) {}

  async createSession(
    gameId: number,
    hostId: number,
    name: string,
    mode: SessionMode = 'computer_hosted',
    turnBased: boolean = false,
  ): Promise<DbGameSession> {
    // Generate a unique join code, retrying on the rare chance of a collision
    let joinCode: string;
    let attempts = 0;

    while (true) {
      joinCode = generateCode();
      const collision = await this.qs.checkJoinCodeCollision(joinCode);
      // Only check for collision against active sessions -
      // completed sessions can safely reuse old codes
      if (!collision) break;
      if (++attempts > 10)
        throw new Error('Could not generate unique join code');
    }

    return this.qs.createSession(gameId, hostId, name, joinCode!, mode, turnBased);
  }

  async findByJoinCode(joinCode: string): Promise<DbGameSession | null> {
    return this.qs.findSessionByJoinCode(joinCode);
  }

  async findById(sessionId: number): Promise<DbGameSession | null> {
    return this.qs.findSessionById(sessionId);
  }

  async updateStatus(
    sessionId: number,
    status: SessionStatus,
  ): Promise<DbGameSession | null> {
    return this.qs.updateSessionStatus(sessionId, status);
  }

  // ---- Player operations ----

  async addPlayer(
    sessionId: number,
    displayName: string,
    userId: number | null,
  ): Promise<DbSessionPlayer> {
    return this.qs.addPlayer(sessionId, displayName, userId);
  }

  async getPlayers(sessionId: number): Promise<DbSessionPlayer[]> {
    return this.qs.getPlayers(sessionId);
  }

  async findPlayerByUserId(
    sessionId: number,
    userId: number,
  ): Promise<DbSessionPlayer | null> {
    return this.qs.findPlayerByUserId(sessionId, userId);
  }

  async removePlayer(sessionId: number, playerId: number): Promise<boolean> {
    return this.qs.removePlayer(sessionId, playerId);
  }

  async updateScore(playerId: number, newScore: number): Promise<void> {
    return this.qs.updateScore(playerId, newScore);
  }

  async setRanks(sessionId: number): Promise<DbSessionPlayer[]> {
    return this.qs.setRanks(sessionId);
  }

  async markQuestionAnswered(gameId: number, questionId: number): Promise<void> {
    return this.qs.markQuestionAnswered(gameId, questionId);
  }
}
