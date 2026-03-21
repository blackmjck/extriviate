import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import bcrypt from 'bcrypt';
import { AuthService } from '../auth.service.js';
import type { QueryService } from '../query.service.js';
import type { DbUser } from '@extriviate/shared';
import { MAX_LOGIN_ATTEMPTS, LOGIN_LOCKOUT_DURATION_SECONDS } from '@extriviate/shared';

vi.mock('bcrypt', () => ({
  default: { hash: vi.fn(), compare: vi.fn() },
}));

const { mockEmailsSend } = vi.hoisted(() => ({
  mockEmailsSend: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockEmailsSend },
  })),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const dbUserRow: DbUser = {
  id: 1,
  email: 'alice@example.com',
  display_name: 'Alice',
  password_hash: '$2b$12$hashedvalue',
  role: 'creator',
  is_active: true,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
  token_version: 0,
};

// ---------------------------------------------------------------------------
// Mock QueryService
// ---------------------------------------------------------------------------

function makeMockQs(): QueryService {
  return {
    findActiveUserByEmail: vi.fn(),
    createUser: vi.fn(),
    findPasswordResetToken: vi.fn(),
    createPasswordResetToken: vi.fn(),
    updateUserPassword: vi.fn(),
    markPasswordResetTokenUsed: vi.fn(),
    deleteUnusedPasswordResetTokensForUser: vi.fn(),
  } as unknown as QueryService;
}

// ---------------------------------------------------------------------------
// Mock pg client returned by fastify.db.connect() — used in resetPassword()
// ---------------------------------------------------------------------------

const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};

// ---------------------------------------------------------------------------
// Mock Redis + Fastify
// ---------------------------------------------------------------------------

const mockRedis = {
  get: vi.fn(),
  ttl: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  del: vi.fn(),
};

const mockFastify = {
  redisAvailable: true,
  redis: mockRedis,
  db: { connect: vi.fn() },
  signAccessToken: vi.fn<(payload: Record<string, unknown>) => string>(() => 'mock-access-token'),
  signRefreshToken: vi.fn<(payload: Record<string, unknown>) => string>(() => 'mock-refresh-token'),
  blacklistToken: vi.fn(),
  log: { error: vi.fn() },
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('AuthService', () => {
  let service: AuthService;
  let mockQs: QueryService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFastify.redisAvailable = true;
    mockFastify.db.connect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [], rowCount: 1 });
    mockQs = makeMockQs();
    service = new AuthService(mockQs, mockFastify as any);
  });

  describe('signUp()', () => {
    test('creates a user and returns a sanitised PublicUser with tokens', async () => {
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-pw' as any);
      vi.mocked(mockQs.createUser).mockResolvedValue(dbUserRow);

      const result = await service.signUp({
        email: 'Alice@Example.COM',
        password: 'hunter2hunter2',
        displayName: 'Alice',
        turnstileToken: 'token',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('hunter2hunter2', 12);
      expect(mockQs.createUser).toHaveBeenCalledOnce();
      expect(mockQs.createUser).toHaveBeenCalledWith('alice@example.com', 'Alice', 'hashed-pw');

      expect(result.user).toEqual({
        id: 1,
        displayName: 'Alice',
        role: 'creator',
        createdAt: dbUserRow.created_at,
      });
      expect((result.user as any).email).toBeUndefined();
      expect((result.user as any).passwordHash).toBeUndefined();

      expect(result.tokens.accessToken).toBe('mock-access-token');
      expect(result.tokens.refreshToken).toBe('mock-refresh-token');
    });

    test('throws EMAIL_TAKEN (409) when createUser hits a unique constraint violation', async () => {
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-pw' as any);
      const pgDupe = Object.assign(new Error('duplicate key value'), { code: '23505' });
      vi.mocked(mockQs.createUser).mockRejectedValueOnce(pgDupe);

      await expect(
        service.signUp({
          email: 'alice@example.com',
          password: 'pw123456',
          displayName: 'A',
          turnstileToken: 't',
        })
      ).rejects.toMatchObject({ code: 'EMAIL_TAKEN', statusCode: 409 });

      expect(bcrypt.hash).toHaveBeenCalled();
      expect(mockQs.createUser).toHaveBeenCalledOnce();
    });

    test('rethrows non-23505 DB errors without wrapping them', async () => {
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-pw' as any);
      vi.mocked(mockQs.createUser).mockRejectedValueOnce(new Error('connection pool exhausted'));

      await expect(
        service.signUp({
          email: 'alice@example.com',
          password: 'pw123456',
          displayName: 'A',
          turnstileToken: 't',
        })
      ).rejects.toThrow('connection pool exhausted');
    });

    test('passes a shared jti UUID to both signAccessToken and signRefreshToken', async () => {
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-pw' as any);
      vi.mocked(mockQs.createUser).mockResolvedValue(dbUserRow);

      const capturedJtis: string[] = [];
      mockFastify.signAccessToken.mockImplementation((payload: any) => {
        capturedJtis.push(payload.jti);
        return 'mock-access-token';
      });
      mockFastify.signRefreshToken.mockImplementation((payload: any) => {
        capturedJtis.push(payload.jti);
        return 'mock-refresh-token';
      });

      await service.signUp({
        email: 'alice@example.com',
        password: 'hunter2hunter2',
        displayName: 'Alice',
        turnstileToken: 'token',
      });

      expect(capturedJtis).toHaveLength(2);
      expect(capturedJtis[0]).toBe(capturedJtis[1]);
      expect(capturedJtis[0]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    test('includes tokenVersion from the DB row in both token payloads', async () => {
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-pw' as any);
      vi.mocked(mockQs.createUser).mockResolvedValue({ ...dbUserRow, token_version: 3 });

      const capturedVersions: number[] = [];
      mockFastify.signAccessToken.mockImplementation((payload: any) => {
        capturedVersions.push(payload.tokenVersion);
        return 'mock-access-token';
      });
      mockFastify.signRefreshToken.mockImplementation((payload: any) => {
        capturedVersions.push(payload.tokenVersion);
        return 'mock-refresh-token';
      });

      await service.signUp({ email: 'alice@example.com', password: 'hunter2', displayName: 'A', turnstileToken: 't' });

      expect(capturedVersions).toEqual([3, 3]);
    });

    test('does not include email in the token payload and coerces sub to a string', async () => {
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-pw' as any);
      vi.mocked(mockQs.createUser).mockResolvedValue(dbUserRow);

      await service.signUp({
        email: 'alice@example.com',
        password: 'hunter2hunter2',
        displayName: 'Alice',
        turnstileToken: 'token',
      });

      expect(mockFastify.signAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: '1',
          email: '',
          role: 'creator',
        })
      );
    });

    test('lowercases the email passed to createUser', async () => {
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-pw' as any);
      vi.mocked(mockQs.createUser).mockResolvedValue(dbUserRow);

      await service.signUp({
        email: 'Alice@Example.COM',
        password: 'hunter2hunter2',
        displayName: 'Alice',
        turnstileToken: 'token',
      });

      expect(mockQs.createUser).toHaveBeenCalledWith('alice@example.com', 'Alice', 'hashed-pw');
    });

    test('throws EMAIL_TAKEN when a soft-deleted user owns that email (unique constraint fires)', async () => {
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-pw' as any);
      const pgDupe = Object.assign(new Error('duplicate key value'), { code: '23505' });
      vi.mocked(mockQs.createUser).mockRejectedValueOnce(pgDupe);

      await expect(
        service.signUp({
          email: 'deleted@example.com',
          password: 'pw123456',
          displayName: 'Ghost',
          turnstileToken: 't',
        })
      ).rejects.toMatchObject({ code: 'EMAIL_TAKEN', statusCode: 409 });

      expect(bcrypt.hash).toHaveBeenCalled();
    });
  });

  describe('login() credentials and counter management', () => {
    test('returns user and tokens on valid credentials, and clears the lockout counter', async () => {
      mockRedis.get.mockResolvedValue('2');
      mockRedis.ttl.mockResolvedValue(700);
      vi.mocked(mockQs.findActiveUserByEmail).mockResolvedValue(dbUserRow);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as any);

      const result = await service.login({
        email: 'Alice@Example.COM',
        password: 'correct-pw',
        turnstileToken: 'token',
      });

      expect(mockRedis.del).toHaveBeenCalledWith('login_attempts:alice@example.com');
      expect(result.user.id).toBe(1);
      expect(result.tokens.accessToken).toBe('mock-access-token');
    });

    test('increments the counter and sets the expiry on the first failure', async () => {
      mockRedis.get.mockResolvedValue('0');
      vi.mocked(mockQs.findActiveUserByEmail).mockResolvedValue(dbUserRow);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as any);
      mockRedis.incr.mockResolvedValue(1);

      await expect(
        service.login({ email: 'alice@example.com', password: 'wrong', turnstileToken: 't' })
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });

      expect(mockRedis.incr).toHaveBeenCalledWith('login_attempts:alice@example.com');
      expect(mockRedis.expire).toHaveBeenCalledWith(
        'login_attempts:alice@example.com',
        LOGIN_LOCKOUT_DURATION_SECONDS
      );
    });

    test('increments the counter without resetting the expiry on repeat failures', async () => {
      mockRedis.get.mockResolvedValue('3');
      vi.mocked(mockQs.findActiveUserByEmail).mockResolvedValue(dbUserRow);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as any);
      mockRedis.incr.mockResolvedValue(4);

      await expect(
        service.login({ email: 'alice@example.com', password: 'wrong', turnstileToken: 't' })
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

      expect(mockRedis.incr).toHaveBeenCalledOnce();
      expect(mockRedis.expire).not.toHaveBeenCalled();
    });

    test('normalizes a mixed-case email before querying', async () => {
      mockRedis.get.mockResolvedValue('0');
      vi.mocked(mockQs.findActiveUserByEmail).mockResolvedValue(dbUserRow);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as any);

      await service.login({
        email: 'Alice@Example.COM',
        password: 'correct-pw',
        turnstileToken: 'token',
      });

      expect(mockQs.findActiveUserByEmail).toHaveBeenCalledWith('alice@example.com');
    });

    test('treats a null Redis value (no key) as 0 failures and proceeds normally', async () => {
      mockRedis.get.mockResolvedValue(null);
      vi.mocked(mockQs.findActiveUserByEmail).mockResolvedValue(dbUserRow);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as any);

      const result = await service.login({
        email: 'alice@example.com',
        password: 'correct-pw',
        turnstileToken: 't',
      });

      expect(result.user.id).toBe(1);
    });

    test('does NOT lock the account when the failure count is one below the limit', async () => {
      mockRedis.get.mockResolvedValue(String(MAX_LOGIN_ATTEMPTS - 1));
      vi.mocked(mockQs.findActiveUserByEmail).mockResolvedValue(dbUserRow);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as any);

      await expect(
        service.login({ email: 'alice@example.com', password: 'correct-pw', turnstileToken: 't' })
      ).resolves.toMatchObject({ user: { id: 1 } });
    });
  });

  describe('login() lockout', () => {
    test('throws ACCOUNT_LOCKED (429) with TTL when attempt count reaches the limit', async () => {
      mockRedis.get.mockResolvedValue(String(MAX_LOGIN_ATTEMPTS));
      mockRedis.ttl.mockResolvedValue(540);

      await expect(
        service.login({ email: 'alice@example.com', password: 'any', turnstileToken: 't' })
      ).rejects.toMatchObject({
        code: 'ACCOUNT_LOCKED',
        statusCode: 429,
        retryAfterSeconds: 540,
        message: expect.stringContaining('9 minutes'),
      });

      expect(mockQs.findActiveUserByEmail).not.toHaveBeenCalled();
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    test('uses the singular "minute" when exactly 60 seconds remain', async () => {
      mockRedis.get.mockResolvedValue(String(MAX_LOGIN_ATTEMPTS));
      mockRedis.ttl.mockResolvedValue(60);

      const err = await service
        .login({ email: 'alice@example.com', password: 'any', turnstileToken: 't' })
        .catch((e) => e);

      expect(err).toMatchObject({ code: 'ACCOUNT_LOCKED', retryAfterSeconds: 60 });
      expect(err.message).toContain('1 minute');
      expect(err.message).not.toContain('1 minutes');
    });

    test('handles a zero or negative TTL gracefully (Math.max edge case)', async () => {
      mockRedis.get.mockResolvedValue(String(MAX_LOGIN_ATTEMPTS));
      mockRedis.ttl.mockResolvedValue(-1);

      await expect(
        service.login({ email: 'alice@example.com', password: 'any', turnstileToken: 't' })
      ).rejects.toMatchObject({
        code: 'ACCOUNT_LOCKED',
        retryAfterSeconds: 0,
      });
    });
  });

  describe('login() defensive paths', () => {
    test('skips lockout check and failure recording when Redis is unavailable', async () => {
      mockFastify.redisAvailable = false;
      vi.mocked(mockQs.findActiveUserByEmail).mockResolvedValue(dbUserRow);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as any);

      const result = await service.login({
        email: 'alice@example.com',
        password: 'correct-pw',
        turnstileToken: 't',
      });

      expect(mockRedis.get).not.toHaveBeenCalled();
      expect(mockRedis.incr).not.toHaveBeenCalled();
      expect(mockRedis.del).not.toHaveBeenCalled();
      expect(result.user.id).toBe(1);
    });

    test('calls bcrypt.compare with a dummy hash when no account exists for the email', async () => {
      mockRedis.get.mockResolvedValue('0');
      vi.mocked(mockQs.findActiveUserByEmail).mockResolvedValue(null);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as any);
      mockRedis.incr.mockResolvedValue(1);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'pw', turnstileToken: 't' })
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

      expect(bcrypt.compare).toHaveBeenCalledOnce();
      const [, hashArg] = vi.mocked(bcrypt.compare).mock.calls[0];
      expect(hashArg).toMatch(/^\$2b\$12\$/);
      expect(hashArg).not.toBe(dbUserRow.password_hash);
    });

    test('treats an inactive user the same as a missing user (INVALID_CREDENTIALS, dummy hash used)', async () => {
      mockRedis.get.mockResolvedValue('0');
      vi.mocked(mockQs.findActiveUserByEmail).mockResolvedValue(null);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as any);
      mockRedis.incr.mockResolvedValue(1);

      await expect(
        service.login({ email: 'inactive@example.com', password: 'pw', turnstileToken: 't' })
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });

      expect(bcrypt.compare).toHaveBeenCalledOnce();
      expect(bcrypt.compare).toHaveBeenCalledWith(
        'pw',
        expect.stringMatching(/^\$2b\$12\$/)
      );
      expect(bcrypt.compare).not.toHaveBeenCalledWith('pw', dbUserRow.password_hash);
    });
  });

  describe('logout()', () => {
    test('calls fastify.blacklistToken with the provided jti and expiry', async () => {
      await service.logout('jti-abc-123', 1_800_000);

      expect(mockFastify.blacklistToken).toHaveBeenCalledExactlyOnceWith('jti-abc-123', 1_800_000);
    });
  });

  describe('forgotPassword()', () => {
    beforeEach(() => {
      mockEmailsSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    });

    test('returns the generic response immediately when the per-email rate limit is reached', async () => {
      mockRedis.get.mockResolvedValue('3');

      const result = await service.forgotPassword('alice@example.com');

      expect(result.response).toMatch(/If that email/);
      expect(mockQs.findActiveUserByEmail).not.toHaveBeenCalled();
      expect(mockEmailsSend).not.toHaveBeenCalled();
    });

    test('returns the generic response and sends no email when the user is not found', async () => {
      mockRedis.get.mockResolvedValue('0');
      vi.mocked(mockQs.findActiveUserByEmail).mockResolvedValue(null);

      const result = await service.forgotPassword('nobody@example.com');

      expect(result.response).toMatch(/If that email/);
      expect(mockRedis.incr).not.toHaveBeenCalled();
      expect(mockEmailsSend).not.toHaveBeenCalled();
    });

    test('increments the counter and sets the expiry on the first send', async () => {
      mockRedis.get.mockResolvedValue('0');
      mockRedis.incr.mockResolvedValue(1);
      vi.mocked(mockQs.findActiveUserByEmail).mockResolvedValue(dbUserRow);
      vi.mocked(mockQs.createPasswordResetToken).mockResolvedValue(undefined);

      await service.forgotPassword('alice@example.com');

      expect(mockRedis.incr).toHaveBeenCalledWith('pw_reset:alice@example.com');
      expect(mockRedis.expire).toHaveBeenCalledWith('pw_reset:alice@example.com', 600);
      expect(mockEmailsSend).toHaveBeenCalledOnce();
    });

    test('increments the counter but does not reset the expiry on subsequent sends', async () => {
      mockRedis.get.mockResolvedValue('1');
      mockRedis.incr.mockResolvedValue(2);
      vi.mocked(mockQs.findActiveUserByEmail).mockResolvedValue(dbUserRow);
      vi.mocked(mockQs.createPasswordResetToken).mockResolvedValue(undefined);

      await service.forgotPassword('alice@example.com');

      expect(mockRedis.incr).toHaveBeenCalledOnce();
      expect(mockRedis.expire).not.toHaveBeenCalled();
    });

    test('skips all Redis calls and still sends the email when Redis is unavailable', async () => {
      mockFastify.redisAvailable = false;
      vi.mocked(mockQs.findActiveUserByEmail).mockResolvedValue(dbUserRow);
      vi.mocked(mockQs.createPasswordResetToken).mockResolvedValue(undefined);

      const result = await service.forgotPassword('alice@example.com');

      expect(mockRedis.get).not.toHaveBeenCalled();
      expect(mockRedis.incr).not.toHaveBeenCalled();
      expect(mockEmailsSend).toHaveBeenCalledOnce();
      expect(result.response).toMatch(/If that email/);
    });

    test('skips Redis calls and sends no email when Redis is unavailable and user is not found', async () => {
      mockFastify.redisAvailable = false;
      vi.mocked(mockQs.findActiveUserByEmail).mockResolvedValue(null);

      const result = await service.forgotPassword('nobody@example.com');

      expect(mockRedis.get).not.toHaveBeenCalled();
      expect(mockEmailsSend).not.toHaveBeenCalled();
      expect(result.response).toMatch(/If that email/);
    });

    test('normalizes the email before using it as the Redis key and findActiveUserByEmail arg', async () => {
      mockRedis.get.mockResolvedValue('0');
      mockRedis.incr.mockResolvedValue(1);
      vi.mocked(mockQs.findActiveUserByEmail).mockResolvedValue(dbUserRow);
      vi.mocked(mockQs.createPasswordResetToken).mockResolvedValue(undefined);

      await service.forgotPassword('  ALICE@EXAMPLE.COM  ');

      expect(mockRedis.get).toHaveBeenCalledWith('pw_reset:alice@example.com');
      expect(mockQs.findActiveUserByEmail).toHaveBeenCalledWith('alice@example.com');
    });

    test('stores a SHA-256 hash of the token, not the raw token', async () => {
      mockRedis.get.mockResolvedValue('0');
      mockRedis.incr.mockResolvedValue(1);
      vi.mocked(mockQs.findActiveUserByEmail).mockResolvedValue(dbUserRow);
      vi.mocked(mockQs.createPasswordResetToken).mockResolvedValue(undefined);

      await service.forgotPassword('alice@example.com');

      expect(mockQs.createPasswordResetToken).toHaveBeenCalledWith(
        dbUserRow.id,
        expect.stringMatching(/^[0-9a-f]{64}$/),
        expect.any(Date)
      );
    });

    test('throws EMAIL_SEND_FAILED (503) when Resend returns an error object', async () => {
      mockRedis.get.mockResolvedValue('0');
      mockRedis.incr.mockResolvedValue(1);
      vi.mocked(mockQs.findActiveUserByEmail).mockResolvedValue(dbUserRow);
      vi.mocked(mockQs.createPasswordResetToken).mockResolvedValue(undefined);
      mockEmailsSend.mockResolvedValue({
        data: null,
        error: { message: 'Resend API error', name: 'api_error', statusCode: 500 },
      });

      await expect(service.forgotPassword('alice@example.com')).rejects.toMatchObject({
        code: 'EMAIL_SEND_FAILED',
        statusCode: 503,
      });
      expect(mockFastify.log.error).toHaveBeenCalledOnce();
    });
  });

  describe('resetPassword()', () => {
    const validTokenRecord = {
      id: 'token-uuid-1',
      user_id: 1,
      token_hash: 'some-hash',
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
      used_at: null,
      created_at: '2026-01-01T00:00:00Z',
    };

    beforeEach(() => {
      vi.mocked(bcrypt.hash).mockResolvedValue('new-hashed-pw' as any);
      vi.mocked(mockQs.updateUserPassword).mockResolvedValue(undefined);
      vi.mocked(mockQs.markPasswordResetTokenUsed).mockResolvedValue(true);
      vi.mocked(mockQs.deleteUnusedPasswordResetTokensForUser).mockResolvedValue(undefined);
    });

    test('throws INVALID_RESET_TOKEN (400) when no matching token record is found', async () => {
      vi.mocked(mockQs.findPasswordResetToken).mockResolvedValue(null);

      await expect(service.resetPassword('raw-token', 'NewPassword1!')).rejects.toMatchObject({
        code: 'INVALID_RESET_TOKEN',
        statusCode: 400,
      });
      expect(mockFastify.db.connect).not.toHaveBeenCalled();
    });

    test('throws INVALID_RESET_TOKEN (400) when the token has already been used', async () => {
      vi.mocked(mockQs.findPasswordResetToken).mockResolvedValue({
        ...validTokenRecord,
        used_at: new Date(),
      });

      await expect(service.resetPassword('raw-token', 'NewPassword1!')).rejects.toMatchObject({
        code: 'INVALID_RESET_TOKEN',
        statusCode: 400,
      });
      expect(mockFastify.db.connect).not.toHaveBeenCalled();
    });

    test('throws INVALID_RESET_TOKEN (400) when the token has expired', async () => {
      vi.mocked(mockQs.findPasswordResetToken).mockResolvedValue({
        ...validTokenRecord,
        expires_at: new Date(Date.now() - 1000),
        used_at: null,
      });

      await expect(service.resetPassword('raw-token', 'NewPassword1!')).rejects.toMatchObject({
        code: 'INVALID_RESET_TOKEN',
        statusCode: 400,
      });
      expect(mockFastify.db.connect).not.toHaveBeenCalled();
    });

    test('hashes the new password, updates the user, marks the token used, deletes stale tokens, and commits', async () => {
      vi.mocked(mockQs.findPasswordResetToken).mockResolvedValue(validTokenRecord);

      await service.resetPassword('raw-token', 'NewPassword1!');

      expect(bcrypt.hash).toHaveBeenCalledWith('NewPassword1!', 12);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockQs.updateUserPassword).toHaveBeenCalledWith(
        validTokenRecord.user_id, 'new-hashed-pw', mockClient
      );
      expect(mockQs.markPasswordResetTokenUsed).toHaveBeenCalledWith(validTokenRecord.id, mockClient);
      expect(mockQs.deleteUnusedPasswordResetTokensForUser).toHaveBeenCalledWith(
        validTokenRecord.user_id, mockClient
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalledOnce();
    });

    test('rolls back, releases the client, and re-throws when a transaction query fails', async () => {
      vi.mocked(mockQs.findPasswordResetToken).mockResolvedValue(validTokenRecord);
      const dbError = new Error('Deadlock detected');
      vi.mocked(mockQs.updateUserPassword).mockRejectedValueOnce(dbError);

      await expect(service.resetPassword('raw-token', 'NewPassword1!')).rejects.toThrow(
        'Deadlock detected'
      );
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalledOnce();
    });

    test('looks up the token by its SHA-256 hash, not by the raw token string', async () => {
      vi.mocked(mockQs.findPasswordResetToken).mockResolvedValue(validTokenRecord);

      await service.resetPassword('my-raw-token', 'NewPassword1!');

      const hashArg = vi.mocked(mockQs.findPasswordResetToken).mock.calls[0][0];
      expect(hashArg).toMatch(/^[0-9a-f]{64}$/);
      expect(hashArg).not.toBe('my-raw-token');
    });

    test('throws INVALID_RESET_TOKEN and rolls back when the token is concurrently claimed', async () => {
      vi.mocked(mockQs.findPasswordResetToken).mockResolvedValue(validTokenRecord);
      vi.mocked(mockQs.markPasswordResetTokenUsed).mockResolvedValue(false); // race lost

      await expect(service.resetPassword('raw-token', 'NewPassword1!')).rejects.toMatchObject({
        code: 'INVALID_RESET_TOKEN',
        statusCode: 400,
      });

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalledOnce();
      expect(mockQs.deleteUnusedPasswordResetTokensForUser).not.toHaveBeenCalled();
    });

    test('calls deleteUnusedPasswordResetTokensForUser with the token user_id', async () => {
      vi.mocked(mockQs.findPasswordResetToken).mockResolvedValue(validTokenRecord);

      await service.resetPassword('raw-token', 'NewPassword1!');

      expect(mockQs.deleteUnusedPasswordResetTokensForUser).toHaveBeenCalledWith(
        validTokenRecord.user_id, mockClient
      );
    });
  });

  describe('isPwnedPassword()', () => {
    const mockFetch = vi.fn();

    beforeEach(() => {
      vi.stubGlobal('fetch', mockFetch);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    test('returns true when the SHA-1 suffix appears in the HIBP range response', async () => {
      mockFetch.mockResolvedValue({
        text: vi
          .fn()
          .mockResolvedValue(
            'AABBCCDD00112233445566778899AABBCCD:3\n' +
              '1E4C9B93F3F0682250B6CF8331B7EE68FD8:3730471\n' +
              'ZZYYXXWWVVUUTTSSRRQQPPOONNMMLLKKJJI:1'
          ),
      });

      const result = await service.isPwnedPassword('password');

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/range/5BAA6'));
    });

    test('returns false when the SHA-1 suffix is absent from the HIBP range response', async () => {
      mockFetch.mockResolvedValue({
        text: vi.fn().mockResolvedValue(
          'AABBCCDD00112233445566778899AABBCCD:3\n' + 'ZZYYXXWWVVUUTTSSRRQQPPOONNMMLLKKJJI:1'
        ),
      });

      const result = await service.isPwnedPassword('password');

      expect(result).toBe(false);
    });

    test('propagates network errors so the route can return 503', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(service.isPwnedPassword('password')).rejects.toThrow('Network error');
    });

    test('correctly matches a suffix when HIBP returns CRLF line endings (\\r\\n)', async () => {
      mockFetch.mockResolvedValue({
        text: vi.fn().mockResolvedValue(
          'AABBCCDD00112233445566778899AABBCCD:3\r\n' +
            '1E4C9B93F3F0682250B6CF8331B7EE68FD8:3730471\r\n' +
            'ZZYYXXWWVVUUTTSSRRQQPPOONNMMLLKKJJI:1\r\n'
        ),
      });

      const result = await service.isPwnedPassword('password');

      // NOTE: This test is expected to FAIL against the current implementation.
      // The split('\n') without trimming leaves '\r' on each suffix token,
      // so '1E4C9...FD8\r' !== '1E4C9...FD8'. Fix: trim() each line before split(':').
      expect(result).toBe(true);
    });

    test('returns false (does not throw) when HIBP responds with a non-200 status', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: vi.fn().mockResolvedValue('Too Many Requests'),
      });

      const result = await service.isPwnedPassword('password');
      expect(result).toBe(false);
    });
  });
});
