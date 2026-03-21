import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import authRoutes from '../auth.routes.js';
import { config } from '../../config.js';

// vi.hoisted variables are available inside vi.mock() factories because
// both are hoisted above imports. Regular const/let at module scope are not.
const { mockSignUp, mockLogin, mockLogout, mockIsPwnedPassword, mockForgotPassword, mockResetPassword } = vi.hoisted(() => ({
  mockSignUp: vi.fn(),
  mockLogin: vi.fn(),
  mockLogout: vi.fn(),
  mockIsPwnedPassword: vi.fn(),
  mockForgotPassword: vi.fn(),
  mockResetPassword: vi.fn(),
}));

vi.mock('../../services/auth.service.js', () => ({
  AuthService: vi.fn().mockImplementation(() => ({
    signUp: mockSignUp,
    login: mockLogin,
    logout: mockLogout,
    isPwnedPassword: mockIsPwnedPassword,
    forgotPassword: mockForgotPassword,
    resetPassword: mockResetPassword,
  })),
}));

// Partial hook mock: turnstileVerify is a no-op; requireAuth stays real.
// importOriginal re-exports all real exports so we only override what we need.
vi.mock('../../hooks/auth.hook.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/auth.hook.js')>();
  return { ...actual, turnstileVerify: vi.fn(async () => {}) };
});

vi.mock('../../config.js', () => ({
  config: {
    server: { nodeEnv: 'test' }, // ensures `secure: false` on cookies in all tests
  },
}));

const TEST_JWT_SECRET = 'test-secret-long-enough-for-hs256-signing';

const fakeUser = {
  id: 1,
  displayName: 'Alice',
  role: 'player' as const,
  createdAt: new Date('2025-01-01'),
};

function buildApp() {
  const app = Fastify({ logger: false });
  const mockIsBlacklisted = vi.fn().mockResolvedValue(false);
  const mockBlacklistToken = vi.fn().mockResolvedValue(undefined);
  // Default: user exists with token_version 0 — overridden per-test when needed
  const mockDbQuery = vi.fn().mockResolvedValue({ rows: [{ token_version: 0 }] });

  // Real JWT plugin — needed by requireAuth (jwtVerify) and by the
  // /logout + /refresh handlers (fastify.jwt.verify).
  app.register(fastifyJwt, {
    secret: TEST_JWT_SECRET,
    sign: { expiresIn: '15m' },
    decode: { complete: true },
  });

  // Real cookie plugin — needed for setCookie/clearCookie/request.cookies.
  app.register(fastifyCookie, { secret: TEST_JWT_SECRET });

  // Decorators that authRoutes and requireAuth read off fastify/request.server.
  // AuthService itself is mocked; db.query is only called by requireAuth's tokenVersion check.
  app.decorate('db', { query: mockDbQuery } as any);
  app.decorate('redis', undefined as any);
  app.decorate('redisAvailable', false); // → in-memory rate limiting
  app.decorate('isTokenBlacklisted', mockIsBlacklisted);
  app.decorate('blacklistToken', mockBlacklistToken);

  // signAccessToken / signRefreshToken are used by /refresh to issue new tokens.
  // Delegating to the real jwt.sign means the new cookie value is a real JWT,
  // which lets us assert that it differs from the original token.
  app.decorate('signAccessToken', (p: any) => app.jwt.sign(p, { expiresIn: '15m' }));
  app.decorate('signRefreshToken', (p: any) => app.jwt.sign(p, { expiresIn: '7d' }));

  app.register(authRoutes, { prefix: '/api/auth' });

  return { app, mockIsBlacklisted, mockBlacklistToken, mockDbQuery };
}

// ---------------------------------------------------------------------------

describe('POST /api/auth/signup', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    ({ app } = buildApp());
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(() => app.close());

  test('rejects invalid bodies with 400 and never calls AuthService', async () => {
    const cases = [
      { email: 'test@example.com', password: 'password1' }, // missing displayName
      { email: 'not-an-email', password: 'password1', displayName: 'A' }, // bad email format
      { email: 'test@example.com', password: 'short', displayName: 'A' }, // password < 8 chars
      { email: 'test@example.com', password: 'x'.repeat(73), displayName: 'A' }, // password > 72 chars
      { email: 'test@example.com', password: 'password1', displayName: '' }, // empty displayName
    ];

    for (const payload of cases) {
      const res = await app.inject({ method: 'POST', url: '/api/auth/signup', payload });
      expect(res.statusCode, `expected 400 for payload: ${JSON.stringify(payload)}`).toBe(400);
    }

    expect(mockSignUp).not.toHaveBeenCalled();
  });

  test('returns 201, puts accessToken in body, and puts refreshToken in HttpOnly cookie only', async () => {
    mockSignUp.mockResolvedValue({
      user: fakeUser,
      tokens: { accessToken: 'new-access-token', refreshToken: 'new-refresh-token' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'alice@example.com', password: 'password123', displayName: 'Alice' },
    });

    expect(res.statusCode).toBe(201);

    // accessToken is in the body; refreshToken must NOT appear anywhere in it
    const body = res.json();
    expect(body.data.tokens.accessToken).toBe('new-access-token');
    expect(JSON.stringify(body)).not.toContain('new-refresh-token');

    // refreshToken lives in the cookie instead
    const cookie = res.headers['set-cookie'] as string;
    expect(cookie).toContain('new-refresh-token');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/auth');
    expect(cookie).toContain(`Max-Age=${7 * 24 * 60 * 60}`);
    // nodeEnv is 'test' (not 'production') → secure flag must be absent
    expect(cookie.toLowerCase()).not.toContain('secure');
  });

  test('maps service errors to the correct HTTP status and ApiResponse shape', async () => {
    const err = Object.assign(new Error('An account with this email already exists'), {
      code: 'EMAIL_TAKEN',
      statusCode: 409,
    });
    mockSignUp.mockRejectedValue(err);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'taken@example.com', password: 'password123', displayName: 'Alice' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'EMAIL_TAKEN', message: expect.any(String) },
    });
  });

  test('sets the Secure flag on the cookie when NODE_ENV is production', async () => {
    // Mutate the already-mocked config object for this test only
    (config as any).server.nodeEnv = 'production';

    const { app: prodApp } = buildApp();
    await prodApp.ready();

    try {
      mockSignUp.mockResolvedValue({
        user: fakeUser,
        tokens: { accessToken: 'at', refreshToken: 'rt' },
      });

      const res = await prodApp.inject({
        method: 'POST',
        url: '/api/auth/signup',
        payload: { email: 'alice@example.com', password: 'password123', displayName: 'Alice' },
      });

      expect(res.headers['set-cookie']).toMatch(/;\s*Secure/i);
    } finally {
      (config as any).server.nodeEnv = 'test'; // restore for all other tests
      await prodApp.close();
    }
  });

  test('returns 500 when the service throws an error with no statusCode', async () => {
    mockSignUp.mockRejectedValue(new Error('Unexpected database failure'));

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'alice@example.com', password: 'password123', displayName: 'Alice' },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({
      success: false,
      error: { message: 'Unexpected database failure' },
    });
  });
});

// ---------------------------------------------------------------------------

describe('POST /api/auth/login', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    ({ app } = buildApp());
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(() => app.close());

  test('returns 200, sets the refresh cookie, and returns accessToken in the body', async () => {
    mockLogin.mockResolvedValue({
      user: fakeUser,
      tokens: { accessToken: 'login-access', refreshToken: 'login-refresh' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'alice@example.com', password: 'password123' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.tokens.accessToken).toBe('login-access');
    expect(res.headers['set-cookie']).toContain('login-refresh');
  });

  test('returns 429 with a Retry-After header when the account is locked', async () => {
    const err = Object.assign(new Error('Too many failed login attempts.'), {
      code: 'ACCOUNT_LOCKED',
      statusCode: 429,
      retryAfterSeconds: 540,
    });
    mockLogin.mockRejectedValue(err);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'alice@example.com', password: 'wrong' },
    });

    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('540');
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'ACCOUNT_LOCKED' },
    });
  });

  test('returns 401 for invalid credentials without a Retry-After header', async () => {
    const err = Object.assign(new Error('Invalid email or password'), {
      code: 'INVALID_CREDENTIALS',
      statusCode: 401,
    });
    mockLogin.mockRejectedValue(err);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'alice@example.com', password: 'wrong' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.headers['retry-after']).toBeUndefined();
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  test('rejects invalid bodies with 400 and never calls AuthService', async () => {
    const cases = [
      { password: 'password123' }, // missing email
      { email: 'alice@example.com' }, // missing password
      { email: 'not-an-email', password: 'password123' }, // invalid email format
    ];

    for (const payload of cases) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload,
      });
      expect(res.statusCode, `expected 400 for ${JSON.stringify(payload)}`).toBe(400);
    }

    expect(mockLogin).not.toHaveBeenCalled();
  });

  test('does not expose the refreshToken in the response body', async () => {
    mockLogin.mockResolvedValue({
      user: fakeUser,
      tokens: { accessToken: 'login-access', refreshToken: 'login-refresh-secret' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'alice@example.com', password: 'password123' },
    });

    expect(JSON.stringify(res.json())).not.toContain('login-refresh-secret');
  });

  test('returns 500 when the service throws an error with no statusCode', async () => {
    mockLogin.mockRejectedValue(new Error('Connection pool exhausted'));

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'alice@example.com', password: 'password123' },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({
      success: false,
      error: { message: 'Connection pool exhausted' },
    });
  });
});

// ---------------------------------------------------------------------------

describe('POST /api/auth/logout', () => {
  let app: ReturnType<typeof Fastify>;
  let mockDbQuery: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    ({ app, mockDbQuery } = buildApp());
    await app.ready();
    vi.clearAllMocks();
    mockDbQuery.mockResolvedValue({ rows: [{ token_version: 0 }] }); // restore after clearAllMocks
  });

  afterEach(() => app.close());

  test('blacklists the shared jti using the refresh token expiry and clears the cookie', async () => {
    const jti = 'shared-session-jti';
    const accessToken = app.jwt.sign({ sub: '1', email: '', role: 'player', jti });
    const refreshToken = app.jwt.sign(
      { sub: '1', email: '', role: 'player', jti },
      { expiresIn: '7d' }
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Cookie: `refresh_token=${refreshToken}`,
      },
    });

    expect(res.statusCode).toBe(200);

    // logout was called with the refresh token's jti and its own (longer) expiry
    expect(mockLogout).toHaveBeenCalledOnce();
    const [calledJti, calledExp] = mockLogout.mock.calls[0];
    expect(calledJti).toBe(jti);
    // refresh token expiry is ~7 days from now; access token expiry is ~15 minutes.
    // confirm we used the refresh token's exp (the larger value).
    const fifteenMinutesFromNow = Math.floor(Date.now() / 1000) + 15 * 60;
    expect(calledExp).toBeGreaterThan(fifteenMinutesFromNow);

    // cookie is cleared
    const setCookie = res.headers['set-cookie'] as string;
    expect(setCookie).toContain('refresh_token=');
    expect(setCookie).toMatch(/Max-Age=0|expires=Thu, 01 Jan 1970/i);
  });

  test('returns 400 TOKEN_MISMATCH when access and refresh tokens belong to different sessions', async () => {
    const accessToken = app.jwt.sign({ sub: '1', email: '', role: 'player', jti: 'jti-session-A' });
    const refreshToken = app.jwt.sign(
      { sub: '1', email: '', role: 'player', jti: 'jti-session-B' },
      { expiresIn: '7d' }
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Cookie: `refresh_token=${refreshToken}`,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('TOKEN_MISMATCH');
    expect(mockLogout).not.toHaveBeenCalled();
  });

  test('returns 200 and does not call logout when no refresh cookie is present', async () => {
    const accessToken = app.jwt.sign({ sub: '1', email: '', role: 'player', jti: 'jti-1' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  test('blacklists the access token on a best-effort basis when the refresh cookie is invalid', async () => {
    const accessToken = app.jwt.sign({
      sub: '1',
      email: '',
      role: 'player',
      jti: 'access-only-jti',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Cookie: 'refresh_token=this.is.not.a.valid.jwt',
      },
    });

    expect(res.statusCode).toBe(200);
    // best-effort: access token's own jti was passed to logout
    expect(mockLogout).toHaveBeenCalledOnce();
    expect(mockLogout.mock.calls[0][0]).toBe('access-only-jti');
  });

  test('returns 401 when no Authorization header is present', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
    });

    expect(res.statusCode).toBe(401);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  test('clears the refresh cookie even when the refresh token is invalid', async () => {
    const accessToken = app.jwt.sign({ sub: '1', email: '', role: 'player', jti: 'some-jti' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Cookie: 'refresh_token=this.is.not.a.valid.jwt',
      },
    });

    expect(res.statusCode).toBe(200);
    const setCookie = res.headers['set-cookie'] as string;
    expect(setCookie).toMatch(/Max-Age=0|expires=Thu, 01 Jan 1970/i);
    expect(setCookie).toContain('Path=/api/auth');
  });

  test('returns 401 SESSION_INVALIDATED when the token version is stale after a password reset', async () => {
    // Token was issued with version 0; DB now has version 1 (reset happened since)
    mockDbQuery.mockResolvedValue({ rows: [{ token_version: 1 }] });
    const accessToken = app.jwt.sign({
      sub: '1', email: '', role: 'player', jti: 'old-session-jti', tokenVersion: 0,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'SESSION_INVALIDATED' },
    });
  });

  test('allows logout when the token version matches the current DB value', async () => {
    mockDbQuery.mockResolvedValue({ rows: [{ token_version: 2 }] });
    const jti = 'current-session-jti';
    const accessToken = app.jwt.sign({ sub: '1', email: '', role: 'player', jti, tokenVersion: 2 });
    const refreshToken = app.jwt.sign(
      { sub: '1', email: '', role: 'player', jti, tokenVersion: 2 },
      { expiresIn: '7d' }
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Cookie: `refresh_token=${refreshToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------

describe('POST /api/auth/check-password', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    ({ app } = buildApp());
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(() => app.close());

  test('returns 400 and never calls AuthService for invalid bodies', async () => {
    const cases = [
      {}, // missing password
      { password: 'short' }, // below minLength 8
      { password: 'x'.repeat(73) }, // above maxLength 72
    ];
    for (const payload of cases) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/check-password',
        payload,
      });
      expect(res.statusCode, `expected 400 for ${JSON.stringify(payload)}`).toBe(400);
    }
    expect(mockIsPwnedPassword).not.toHaveBeenCalled();
  });

  test('returns 200 with { pwned: true } when the service reports a breach', async () => {
    mockIsPwnedPassword.mockResolvedValue(true);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/check-password',
      payload: { password: 'password123' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { pwned: true } });
    expect(mockIsPwnedPassword).toHaveBeenCalledWith('password123');
  });

  test('returns 200 with { pwned: false } when the service finds no breach', async () => {
    mockIsPwnedPassword.mockResolvedValue(false);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/check-password',
      payload: { password: 'password123' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { pwned: false } });
  });

  test('returns 503 PWNED_CHECK_UNAVAILABLE when the HIBP API call throws', async () => {
    mockIsPwnedPassword.mockRejectedValue(new Error('Network error'));

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/check-password',
      payload: { password: 'password123' },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'PWNED_CHECK_UNAVAILABLE' },
    });
  });

  test('accepts passwords at the exact minimum and maximum lengths', async () => {
    mockIsPwnedPassword.mockResolvedValue(false);

    for (const password of ['x'.repeat(8), 'x'.repeat(72)]) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/check-password',
        payload: { password },
      });
      expect(res.statusCode, `expected 200 for ${password.length}-char password`).toBe(200);
    }
  });
});

// ---------------------------------------------------------------------------

describe('POST /api/auth/refresh', () => {
  let app: ReturnType<typeof Fastify>;
  let mockIsBlacklisted: ReturnType<typeof vi.fn>;
  let mockBlacklistToken: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    ({ app, mockIsBlacklisted, mockBlacklistToken } = buildApp());
    await app.ready();
    vi.clearAllMocks();
    // restore default after clearAllMocks wipes call history
    // (clearAllMocks does not reset implementations, but be explicit for clarity)
    mockIsBlacklisted.mockResolvedValue(false);
  });

  afterEach(() => app.close());

  test('returns 401 NO_TOKEN when no refresh cookie is present', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/refresh' });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('NO_TOKEN');
    expect(mockIsBlacklisted).not.toHaveBeenCalled();
  });

  test('returns 401 TOKEN_REVOKED and clears the cookie when the token is blacklisted', async () => {
    mockIsBlacklisted.mockResolvedValue(true);
    const refreshToken = app.jwt.sign(
      { sub: '1', email: '', role: 'player', jti: 'revoked-jti' },
      { expiresIn: '7d' }
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { Cookie: `refresh_token=${refreshToken}` },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('TOKEN_REVOKED');
    expect(res.headers['set-cookie']).toMatch(/Max-Age=0|expires=Thu, 01 Jan 1970/i);
  });

  test('returns 401 INVALID_TOKEN and clears the cookie when the refresh token is invalid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { Cookie: 'refresh_token=this.is.garbage' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_TOKEN');
    expect(res.headers['set-cookie']).toMatch(/Max-Age=0|expires=Thu, 01 Jan 1970/i);
    expect(mockBlacklistToken).not.toHaveBeenCalled();
  });

  test('rotates the token pair: blacklists old jti, issues new cookie with a different jti', async () => {
    const oldJti = 'old-jti-to-be-retired';
    const oldRefreshToken = app.jwt.sign(
      { sub: '42', email: '', role: 'player', jti: oldJti },
      { expiresIn: '7d' }
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { Cookie: `refresh_token=${oldRefreshToken}` },
    });

    expect(res.statusCode).toBe(200);

    // new access token is present under the 'accessToken' key
    const body = res.json();
    expect(body.data.accessToken).toBeDefined();

    // old jti was blacklisted before new tokens were issued (rotation step 1)
    expect(mockBlacklistToken).toHaveBeenCalledWith(oldJti, expect.any(Number));

    // new cookie is a different token from the original
    const setCookie = res.headers['set-cookie'] as string;
    expect(setCookie).toContain('refresh_token=');
    expect(setCookie).not.toContain(oldRefreshToken);

    // verify the new cookie carries a different jti
    const newTokenValue = setCookie.match(/refresh_token=([^;]+)/)?.[1];
    const newPayload = app.jwt.decode(newTokenValue!) as any;
    expect(newPayload.payload.jti).not.toBe(oldJti);
  });

  test('new tokens carry the original sub, email, and role', async () => {
    const originalPayload = {
      sub: '42',
      email: 'alice@example.com',
      role: 'admin',
      jti: 'original-jti',
    };
    const oldRefreshToken = app.jwt.sign(originalPayload, { expiresIn: '7d' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { Cookie: `refresh_token=${oldRefreshToken}` },
    });

    expect(res.statusCode).toBe(200);

    // Verify new access token identity
    const newAccessToken = res.json().data.accessToken;
    const newAccessPayload = (app.jwt.decode(newAccessToken) as any).payload;
    expect(newAccessPayload.sub).toBe('42');
    expect(newAccessPayload.email).toBe('alice@example.com');
    expect(newAccessPayload.role).toBe('admin');

    // Verify new refresh token identity
    const setCookie = res.headers['set-cookie'] as string;
    const newRefreshValue = setCookie.match(/refresh_token=([^;]+)/)?.[1];
    const newRefreshPayload = (app.jwt.decode(newRefreshValue!) as any).payload;
    expect(newRefreshPayload.sub).toBe('42');
    expect(newRefreshPayload.role).toBe('admin');
  });

  test('new access token and new refresh token share the same new jti', async () => {
    const oldRefreshToken = app.jwt.sign(
      { sub: '1', email: '', role: 'player', jti: 'old-jti' },
      { expiresIn: '7d' }
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { Cookie: `refresh_token=${oldRefreshToken}` },
    });

    expect(res.statusCode).toBe(200);

    const newAccessToken = res.json().data.accessToken;
    const newAccessPayload = (app.jwt.decode(newAccessToken) as any).payload;

    const setCookie = res.headers['set-cookie'] as string;
    const newRefreshValue = setCookie.match(/refresh_token=([^;]+)/)?.[1];
    const newRefreshPayload = (app.jwt.decode(newRefreshValue!) as any).payload;

    // Both new tokens must carry the same jti so the logout route can validate them together
    expect(newAccessPayload.jti).toBe(newRefreshPayload.jti);
    expect(newAccessPayload.jti).not.toBe('old-jti');
  });

  test('new refresh cookie has correct security attributes', async () => {
    const oldRefreshToken = app.jwt.sign(
      { sub: '1', email: '', role: 'player', jti: 'old-jti' },
      { expiresIn: '7d' }
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { Cookie: `refresh_token=${oldRefreshToken}` },
    });

    const cookie = res.headers['set-cookie'] as string;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/auth');
    expect(cookie).toContain(`Max-Age=${7 * 24 * 60 * 60}`);
    expect(cookie.toLowerCase()).not.toContain('secure'); // nodeEnv is 'test'
  });

  test('propagates tokenVersion from the incoming refresh token into both new tokens', async () => {
    const oldRefreshToken = app.jwt.sign(
      { sub: '1', email: '', role: 'player', jti: 'old-jti', tokenVersion: 3 },
      { expiresIn: '7d' }
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { Cookie: `refresh_token=${oldRefreshToken}` },
    });

    expect(res.statusCode).toBe(200);

    const newAccessPayload = (app.jwt.decode(res.json().data.accessToken) as any).payload;
    expect(newAccessPayload.tokenVersion).toBe(3);

    const newRefreshValue = (res.headers['set-cookie'] as string).match(/refresh_token=([^;]+)/)?.[1];
    const newRefreshPayload = (app.jwt.decode(newRefreshValue!) as any).payload;
    expect(newRefreshPayload.tokenVersion).toBe(3);
  });

  test('issues tokens without tokenVersion when the incoming token had none (pre-migration compat)', async () => {
    const oldRefreshToken = app.jwt.sign(
      { sub: '1', email: '', role: 'player', jti: 'old-jti' }, // no tokenVersion
      { expiresIn: '7d' }
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { Cookie: `refresh_token=${oldRefreshToken}` },
    });

    expect(res.statusCode).toBe(200);

    const newAccessPayload = (app.jwt.decode(res.json().data.accessToken) as any).payload;
    expect(newAccessPayload.tokenVersion).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------

describe('POST /api/auth/forgot-password', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    ({ app } = buildApp());
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(() => app.close());

  test('rejects a body missing email with 400 before calling AuthService', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { turnstileToken: 'tok' }, // missing email
    });

    expect(res.statusCode).toBe(400);
    expect(mockForgotPassword).not.toHaveBeenCalled();
  });

  test('rejects a body missing turnstileToken with 400 before calling AuthService', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'alice@example.com' }, // missing turnstileToken
    });

    expect(res.statusCode).toBe(400);
    expect(mockForgotPassword).not.toHaveBeenCalled();
  });

  test('rejects an invalid email format with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'not-an-email', turnstileToken: 'tok' },
    });

    expect(res.statusCode).toBe(400);
    expect(mockForgotPassword).not.toHaveBeenCalled();
  });

  test('returns 200 with the generic response message on success', async () => {
    const message = "If that email is registered, you'll receive a link shortly.";
    mockForgotPassword.mockResolvedValue({ response: message });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'alice@example.com', turnstileToken: 'tok' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { response: message } });
  });

  test('proxies the service statusCode and error code on failure', async () => {
    const err = Object.assign(new Error('Failed to send reset email. Please try again.'), {
      code: 'EMAIL_SEND_FAILED',
      statusCode: 503,
    });
    mockForgotPassword.mockRejectedValue(err);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'alice@example.com', turnstileToken: 'tok' },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'EMAIL_SEND_FAILED' },
    });
  });

  test('returns 500 INTERNAL_ERROR when the service throws without a statusCode', async () => {
    mockForgotPassword.mockRejectedValue(new Error('Unexpected error'));

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'alice@example.com', turnstileToken: 'tok' },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'INTERNAL_ERROR' },
    });
  });

  test('returns 429 RATE_LIMITED after 10 requests from the same IP within the hour', async () => {
    const message = "If that email is registered, you'll receive a link shortly.";
    mockForgotPassword.mockResolvedValue({ response: message });
    const validPayload = { email: 'alice@example.com', turnstileToken: 'tok' };

    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/forgot-password',
        payload: validPayload,
      });
      expect(res.statusCode, `expected 200 on request ${i + 1}`).toBe(200);
    }

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: validPayload,
    });
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'RATE_LIMITED' },
    });
  });
});

// ---------------------------------------------------------------------------

describe('POST /api/auth/reset-password', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    ({ app } = buildApp());
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(() => app.close());

  test('rejects a body missing token with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { newPassword: 'NewPassword1!' },
    });

    expect(res.statusCode).toBe(400);
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  test('rejects a body missing newPassword with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: 'some-token' },
    });

    expect(res.statusCode).toBe(400);
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  test('rejects a newPassword shorter than 8 characters with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: 'tok', newPassword: 'short' },
    });

    expect(res.statusCode).toBe(400);
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  test('rejects a newPassword longer than 72 characters with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: 'tok', newPassword: 'x'.repeat(73) },
    });

    expect(res.statusCode).toBe(400);
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  test('accepts passwords at the exact minimum and maximum length boundaries', async () => {
    mockResetPassword.mockResolvedValue(undefined);

    for (const newPassword of ['x'.repeat(8), 'x'.repeat(72)]) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/reset-password',
        payload: { token: 'valid-token', newPassword },
      });
      expect(res.statusCode, `expected 200 for ${newPassword.length}-char password`).toBe(200);
    }
  });

  test('returns 200 with a success message when the reset succeeds', async () => {
    mockResetPassword.mockResolvedValue(undefined);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: 'valid-token', newPassword: 'NewPassword1!' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: { message: 'Password updated successfully.' },
    });
  });

  test('returns 400 INVALID_RESET_TOKEN when the service rejects the token', async () => {
    const err = Object.assign(new Error('This reset link is invalid or has expired.'), {
      code: 'INVALID_RESET_TOKEN',
      statusCode: 400,
    });
    mockResetPassword.mockRejectedValue(err);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: 'bad-token', newPassword: 'NewPassword1!' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'INVALID_RESET_TOKEN' },
    });
  });

  test('does not require a turnstileToken — no Turnstile check on this route', async () => {
    mockResetPassword.mockResolvedValue(undefined);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      // no turnstileToken field
      payload: { token: 'valid-token', newPassword: 'NewPassword1!' },
    });

    expect(res.statusCode).toBe(200);
  });

  test('returns 429 RATE_LIMITED after 5 requests from the same IP within 15 minutes', async () => {
    mockResetPassword.mockResolvedValue(undefined);
    const validPayload = { token: 'some-token', newPassword: 'NewPassword1!' };

    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/reset-password',
        payload: validPayload,
      });
      expect(res.statusCode, `expected 200 on request ${i + 1}`).toBe(200);
    }

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: validPayload,
    });
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: 'RATE_LIMITED' },
    });
  });
});
