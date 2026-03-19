import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import bcrypt from 'bcrypt';
import { AuthService } from '../auth.service.js';
import { MAX_LOGIN_ATTEMPTS, LOGIN_LOCKOUT_DURATION_SECONDS } from '@extriviate/shared';

vi.mock('bcrypt', () => ({
  default: { hash: vi.fn(), compare: vi.fn() },
}));

// Mock the database
const mockDb = {
  query: vi.fn(),
};

const dbUserRow = {
  id: 1,
  email: 'alice@example.com',
  display_name: 'Alice',
  password_hash: '$2b$12$hashedvalue',
  role: 'player' as const,
  is_active: true,
  created_at: new Date('2025-01-01'),
  updated_at: new Date('2025-01-01'),
};

// Mock the Redis calls in Fastify
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
  signAccessToken: vi.fn<(payload: Record<string, unknown>) => string>(() => 'mock-access-token'),
  signRefreshToken: vi.fn<(payload: Record<string, unknown>) => string>(() => 'mock-refresh-token'),
  blacklistToken: vi.fn(),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFastify.redisAvailable = true; // reset for the Redis-unavailable tests
    service = new AuthService(mockDb as any, mockFastify as any);
  });

  describe('signUp()', () => {
    // Happy path test
    test('inserts a new user and returns a sanitised PublicUser with tokens', async () => {
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-pw' as any);
      // First query: email uniqueness check — no existing row
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // Second query: INSERT ... RETURNING — the newly created row
      mockDb.query.mockResolvedValueOnce({ rows: [dbUserRow] });

      const result = await service.signUp({
        email: 'Alice@Example.COM',
        password: 'hunter2hunter2',
        displayName: 'Alice',
        turnstileToken: 'token',
      });

      // bcrypt received the password and the configured salt rounds
      expect(bcrypt.hash).toHaveBeenCalledWith('hunter2hunter2', 12);

      // The uniqueness check used the lowercased email
      expect(mockDb.query).toHaveBeenNthCalledWith(1, expect.any(String), ['alice@example.com']);

      // User is sanitised: no email, no passwordHash, correct camelCase mapping
      expect(result.user).toEqual({
        id: 1,
        displayName: 'Alice',
        role: 'player',
        createdAt: dbUserRow.created_at,
      });
      expect((result.user as any).email).toBeUndefined();
      expect((result.user as any).passwordHash).toBeUndefined();

      // Tokens come from the signing helpers
      expect(result.tokens.accessToken).toBe('mock-access-token');
      expect(result.tokens.refreshToken).toBe('mock-refresh-token');
    });

    // Duplicate email test
    test('throws EMAIL_TAKEN (409) without hashing the password when email is taken', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 99 }] }); // email already exists

      await expect(
        service.signUp({
          email: 'alice@example.com',
          password: 'pw',
          displayName: 'A',
          turnstileToken: 't',
        })
      ).rejects.toMatchObject({ code: 'EMAIL_TAKEN', statusCode: 409 });

      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(mockDb.query).toHaveBeenCalledOnce(); // only the SELECT, not the INSERT
    });

    test('passes a shared jti UUID to both signAccessToken and signRefreshToken', async () => {
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-pw' as any);
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      mockDb.query.mockResolvedValueOnce({ rows: [dbUserRow] });

      // Capture the jti from each signing call via mockImplementation
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
      // same jti in both tokens
      expect(capturedJtis[0]).toBe(capturedJtis[1]);
      // jti must be a valid UUID v4
      expect(capturedJtis[0]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    test('does not include email in the token payload and coerces sub to a string', async () => {
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-pw' as any);
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      mockDb.query.mockResolvedValueOnce({ rows: [dbUserRow] }); // dbUserRow.id = 1 (number)

      await service.signUp({
        email: 'alice@example.com',
        password: 'hunter2hunter2',
        displayName: 'Alice',
        turnstileToken: 'token',
      });

      // sub must be a string per the JWT spec
      expect(mockFastify.signAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: '1', // String(1) - not the number 1
          email: '',
          role: 'player',
        })
      );
    });
  });

  describe('login() credentials and counter management', () => {
    // Valid login test
    test('returns user and tokens on valid credentials, and clears the lockout counter', async () => {
      mockRedis.get.mockResolvedValue('2'); // 2 prior failures — below the limit
      mockRedis.ttl.mockResolvedValue(700);
      mockDb.query.mockResolvedValue({ rows: [dbUserRow] });
      vi.mocked(bcrypt.compare).mockResolvedValue(true as any);

      const result = await service.login({
        email: 'Alice@Example.COM',
        password: 'correct-pw',
        turnstileToken: 'token',
      });

      // Counter cleared after successful auth
      expect(mockRedis.del).toHaveBeenCalledWith('login_attempts:alice@example.com');

      // Returned user is sanitised (same shape asserted in signUp test)
      expect(result.user.id).toBe(1);
      expect(result.tokens.accessToken).toBe('mock-access-token');
    });

    // First failed attempt test
    test('increments the counter and sets the expiry on the first failure', async () => {
      mockRedis.get.mockResolvedValue('0'); // no prior failures
      mockDb.query.mockResolvedValue({ rows: [dbUserRow] });
      vi.mocked(bcrypt.compare).mockResolvedValue(false as any); // wrong password
      mockRedis.incr.mockResolvedValue(1); // first failure: count becomes 1

      await expect(
        service.login({ email: 'alice@example.com', password: 'wrong', turnstileToken: 't' })
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });

      expect(mockRedis.incr).toHaveBeenCalledWith('login_attempts:alice@example.com');
      expect(mockRedis.expire).toHaveBeenCalledWith(
        'login_attempts:alice@example.com',
        LOGIN_LOCKOUT_DURATION_SECONDS
      );
    });

    // Second+ failed attempt test
    test('increments the counter without resetting the expiry on repeat failures', async () => {
      mockRedis.get.mockResolvedValue('3'); // 3 prior failures already recorded
      mockDb.query.mockResolvedValue({ rows: [dbUserRow] });
      vi.mocked(bcrypt.compare).mockResolvedValue(false as any);
      mockRedis.incr.mockResolvedValue(4); // fourth failure: count becomes 4

      await expect(
        service.login({ email: 'alice@example.com', password: 'wrong', turnstileToken: 't' })
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

      expect(mockRedis.incr).toHaveBeenCalledOnce();
      expect(mockRedis.expire).not.toHaveBeenCalled(); // must NOT reset the window
    });

    test('lowercases the email in the INSERT, not just the uniqueness SELECT', async () => {
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-pw' as any);
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // SELECT → no duplicate
      mockDb.query.mockResolvedValueOnce({ rows: [dbUserRow] }); // INSERT → new row

      await service.signUp({
        email: 'Alice@Example.COM',
        password: 'hunter2hunter2',
        displayName: 'Alice',
        turnstileToken: 'token',
      });

      // Second call is the INSERT — $1 must be the lowercase email
      expect(mockDb.query).toHaveBeenNthCalledWith(2, expect.any(String), [
        'alice@example.com',
        'Alice',
        'hashed-pw',
      ]);
    });

    test('throws EMAIL_TAKEN when a soft-deleted (inactive) user owns that email', async () => {
      // The uniqueness SELECT has no is_active filter — an inactive user still blocks re-registration
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 7 }] }); // inactive user returned

      await expect(
        service.signUp({
          email: 'deleted@example.com',
          password: 'pw123456',
          displayName: 'Ghost',
          turnstileToken: 't',
        })
      ).rejects.toMatchObject({ code: 'EMAIL_TAKEN', statusCode: 409 });

      expect(bcrypt.hash).not.toHaveBeenCalled();
    });

    test('normalizes a mixed-case email before passing it to the DB query', async () => {
      mockRedis.get.mockResolvedValue('0');
      mockDb.query.mockResolvedValue({ rows: [dbUserRow] });
      vi.mocked(bcrypt.compare).mockResolvedValue(true as any);

      await service.login({
        email: 'Alice@Example.COM',
        password: 'correct-pw',
        turnstileToken: 'token',
      });

      // The SELECT must receive the lowercase version as $1
      expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), ['alice@example.com']);
    });

    test('treats a null Redis value (no key) as 0 failures and proceeds normally', async () => {
      mockRedis.get.mockResolvedValue(null); // key does not exist in Redis
      mockDb.query.mockResolvedValue({ rows: [dbUserRow] });
      vi.mocked(bcrypt.compare).mockResolvedValue(true as any);

      const result = await service.login({
        email: 'alice@example.com',
        password: 'correct-pw',
        turnstileToken: 't',
      });

      // Null is treated as 0 via the `?? '0'` default — should not throw ACCOUNT_LOCKED
      expect(result.user.id).toBe(1);
    });

    test('does NOT lock the account when the failure count is one below the limit', async () => {
      mockRedis.get.mockResolvedValue(String(MAX_LOGIN_ATTEMPTS - 1)); // 9 failures
      mockDb.query.mockResolvedValue({ rows: [dbUserRow] });
      vi.mocked(bcrypt.compare).mockResolvedValue(true as any);

      // Should not throw — the >= MAX_LOGIN_ATTEMPTS boundary excludes MAX-1
      await expect(
        service.login({ email: 'alice@example.com', password: 'correct-pw', turnstileToken: 't' })
      ).resolves.toMatchObject({ user: { id: 1 } });
    });
  });

  describe('login() lockout', () => {
    // Account locked test
    test('throws ACCOUNT_LOCKED (429) with TTL when attempt count reaches the limit', async () => {
      mockRedis.get.mockResolvedValue(String(MAX_LOGIN_ATTEMPTS)); // exactly at threshold
      mockRedis.ttl.mockResolvedValue(540); // 9 minutes remaining

      await expect(
        service.login({ email: 'alice@example.com', password: 'any', turnstileToken: 't' })
      ).rejects.toMatchObject({
        code: 'ACCOUNT_LOCKED',
        statusCode: 429,
        retryAfterSeconds: 540,
        message: expect.stringContaining('9 minutes'),
      });

      // Short-circuits before touching the DB or bcrypt
      expect(mockDb.query).not.toHaveBeenCalled();
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    test('uses the singular "minute" when exactly 60 seconds remain', async () => {
      mockRedis.get.mockResolvedValue(String(MAX_LOGIN_ATTEMPTS));
      mockRedis.ttl.mockResolvedValue(60); // Math.ceil(60/60) = 1

      const err = await service
        .login({ email: 'alice@example.com', password: 'any', turnstileToken: 't' })
        .catch((e) => e);

      expect(err).toMatchObject({ code: 'ACCOUNT_LOCKED', retryAfterSeconds: 60 });
      expect(err.message).toContain('1 minute');
      expect(err.message).not.toContain('1 minutes'); // plural branch must not fire
    });

    test('handles a zero or negative TTL gracefully (Math.max edge case)', async () => {
      mockRedis.get.mockResolvedValue(String(MAX_LOGIN_ATTEMPTS));
      mockRedis.ttl.mockResolvedValue(-1); // key has no expiry — shouldn't normally happen

      await expect(
        service.login({ email: 'alice@example.com', password: 'any', turnstileToken: 't' })
      ).rejects.toMatchObject({
        code: 'ACCOUNT_LOCKED',
        retryAfterSeconds: 0, // Math.max(-1, 0) = 0
      });
    });
  });

  describe('login() defensive paths', () => {
    // Redis unavailable test
    test('skips lockout check and failure recording when Redis is unavailable', async () => {
      mockFastify.redisAvailable = false;
      mockDb.query.mockResolvedValue({ rows: [dbUserRow] });
      vi.mocked(bcrypt.compare).mockResolvedValue(true as any);

      const result = await service.login({
        email: 'alice@example.com',
        password: 'correct-pw',
        turnstileToken: 't',
      });

      // No Redis calls whatsoever
      expect(mockRedis.get).not.toHaveBeenCalled();
      expect(mockRedis.incr).not.toHaveBeenCalled();
      expect(mockRedis.del).not.toHaveBeenCalled();

      // Auth still works
      expect(result.user.id).toBe(1);
    });

    // Non-existent email test (for timing safety)
    test('calls bcrypt.compare with a dummy hash when no account exists for the email', async () => {
      mockRedis.get.mockResolvedValue('0');
      mockDb.query.mockResolvedValue({ rows: [] }); // no matching user
      vi.mocked(bcrypt.compare).mockResolvedValue(false as any);
      mockRedis.incr.mockResolvedValue(1);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'pw', turnstileToken: 't' })
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

      // bcrypt.compare must be called even when no user was found
      expect(bcrypt.compare).toHaveBeenCalledOnce();
      // The second argument must NOT be the real password hash (it's the dummy)
      const [, hashArg] = vi.mocked(bcrypt.compare).mock.calls[0];
      expect(hashArg).toMatch(/^\$2b\$12\$/); // bcrypt format, but a dummy value
      expect(hashArg).not.toBe(dbUserRow.password_hash);
    });

    test('treats an inactive user the same as a missing user (INVALID_CREDENTIALS, dummy hash used)', async () => {
      mockRedis.get.mockResolvedValue('0');
      // The query filters WHERE is_active = true, so an inactive user returns no rows
      mockDb.query.mockResolvedValue({ rows: [] });
      vi.mocked(bcrypt.compare).mockResolvedValue(false as any);
      mockRedis.incr.mockResolvedValue(1);

      await expect(
        service.login({ email: 'inactive@example.com', password: 'pw', turnstileToken: 't' })
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });

      // Timing safety: bcrypt.compare must still be called, even for an inactive account
      expect(bcrypt.compare).toHaveBeenCalledOnce();
      expect(bcrypt.compare).toHaveBeenCalledWith(
        'pw',
        expect.stringMatching(/^\$2b\$12\$/) // bcrypt format but the dummy value
      );
      expect(bcrypt.compare).not.toHaveBeenCalledWith('pw', dbUserRow.password_hash);
    });
  });

  describe('logout()', () => {
    // Delegation to blacklistToken test
    test('calls fastify.blacklistToken with the provided jti and expiry', async () => {
      await service.logout('jti-abc-123', 1_800_000);

      expect(mockFastify.blacklistToken).toHaveBeenCalledExactlyOnceWith('jti-abc-123', 1_800_000);
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
      // SHA1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
      // prefix = "5BAA6", suffix = "1E4C9B93F3F0682250B6CF8331B7EE68FD8"
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
          // the real suffix for "password" is not in this list
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
      // The real HIBP API uses \r\n — the current split('\n') leaves \r on each suffix.
      // This test documents the current behaviour. If it fails, the implementation
      // has a silent false-negative bug: pwned passwords would be reported as safe.
      mockFetch.mockResolvedValue({
        text: vi.fn().mockResolvedValue(
          // SHA1("password") suffix: 1E4C9B93F3F0682250B6CF8331B7EE68FD8
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
      // The implementation calls res.text() unconditionally with no res.ok check.
      // A 429 from HIBP would produce an error-page body — the suffix would not be found,
      // so the function silently returns false rather than throwing.
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: vi.fn().mockResolvedValue('Too Many Requests'),
      });

      // Document the current behaviour: no throw, returns false
      const result = await service.isPwnedPassword('password');
      expect(result).toBe(false);
    });
  });
});
