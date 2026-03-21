import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { requireAuth, optionalAuth, turnstileVerify } from '../auth.hook.js';
import { CF_SECRET_TEST_KEYS } from '@extriviate/shared';

vi.mock('../../config.js', () => ({
  config: {
    server: { nodeEnv: 'test' },
    turnstile: { secretKey: 'prod-secret' },
  },
}));

const TEST_JWT_SECRET = 'test-secret-long-enough-for-hs256-signing';

function buildApp() {
  const app = Fastify({ logger: false });
  const mockIsBlacklisted = vi.fn().mockResolvedValue(false);
  const mockDbQuery = vi.fn().mockResolvedValue({ rows: [{ token_version: 0 }] });

  app.register(fastifyJwt, {
    secret: TEST_JWT_SECRET,
    sign: { expiresIn: '15m' },
    decode: { complete: true },
  });
  app.decorate('isTokenBlacklisted', mockIsBlacklisted);
  app.decorate('db', { query: mockDbQuery } as any);

  app.get('/protected', { preHandler: [requireAuth] }, async (req) => ({
    sub: req.user.sub,
    jti: req.user.jti ?? null,
  }));
  app.get('/optional', { preHandler: [optionalAuth] }, async (req) => ({
    hasUser: !!(req as any).user,
  }));
  app.post('/verify', { preHandler: [turnstileVerify] }, async (req) => ({ ok: true }));

  return { app, mockIsBlacklisted, mockDbQuery };
}

function mockCloudflare(fetchMock: ReturnType<typeof vi.fn>, success: boolean) {
  // unused param satisfies linter; fetch is a global stub
  fetchMock.mockResolvedValue({
    json: vi.fn().mockResolvedValue({ success }),
  });
}

describe('requireAuth', () => {
  let app: ReturnType<typeof Fastify>;
  let mockIsBlacklisted: ReturnType<typeof vi.fn>;
  let mockDbQuery: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    ({ app, mockIsBlacklisted, mockDbQuery } = buildApp());
    await app.ready();
  });

  afterEach(() => app.close());

  // Valid, non-blacklisted token test
  test('allows a valid non-blacklisted token and populates request.user', async () => {
    const token = app.jwt.sign({ sub: '42', email: '', role: 'player', jti: 'jti-abc' });

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ sub: '42', jti: 'jti-abc' });
    expect(mockIsBlacklisted).toHaveBeenCalledWith('jti-abc');
  });

  // blacklisted token test
  test('rejects a blacklisted token with 401 TOKEN_REVOKED', async () => {
    mockIsBlacklisted.mockResolvedValue(true);
    const token = app.jwt.sign({ sub: '42', email: '', role: 'player', jti: 'revoked-jti' });

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'TOKEN_REVOKED' },
    });
  });

  // missing or invalid token test
  test('rejects requests with a missing or malformed token with 401 UNAUTHORIZED', async () => {
    // No Authorization header
    const noToken = await app.inject({ method: 'GET', url: '/protected' });
    expect(noToken.statusCode).toBe(401);
    expect(noToken.json()).toMatchObject({
      success: false,
      error: { code: 'UNAUTHORIZED' },
    });

    // Tampered/garbage token
    const badToken = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { Authorization: 'Bearer not.a.real.token' },
    });
    expect(badToken.statusCode).toBe(401);
    expect(badToken.json().error.code).toBe('UNAUTHORIZED');

    // In both cases the blacklist check must not be reached
    expect(mockIsBlacklisted).not.toHaveBeenCalled();
  });

  // token without jti test
  test('allows a token with no jti without calling the blacklist check', async () => {
    // Sign without a jti field — the if (payload.jti) guard should short-circuit
    const token = app.jwt.sign({ sub: '99', email: '', role: 'player' });

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(mockIsBlacklisted).not.toHaveBeenCalled();
  });

  // tokenVersion: token without the claim is treated as version 0 — DB IS checked
  test('treats a token with no tokenVersion as version 0 and allows it when DB version is 0', async () => {
    // Default mockDbQuery returns token_version: 0
    const token = app.jwt.sign({ sub: '1', email: '', role: 'creator', jti: 'no-ver-jti' });

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    // DB must be consulted — missing tokenVersion is no longer a free pass
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT token_version FROM users'),
      ['1'],
    );
  });

  // tokenVersion: token without the claim is REJECTED when DB version > 0
  // (e.g. password was reset after a pre-migration token was issued)
  test('rejects a token without tokenVersion when the DB version has been incremented', async () => {
    mockDbQuery.mockResolvedValue({ rows: [{ token_version: 1 }] });
    const token = app.jwt.sign({ sub: '1', email: '', role: 'creator', jti: 'pre-migration-jti' });

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'SESSION_INVALIDATED' },
    });
  });

  // tokenVersion: matching version passes
  test('allows a token whose tokenVersion matches the current DB value', async () => {
    mockDbQuery.mockResolvedValue({ rows: [{ token_version: 2 }] });
    const token = app.jwt.sign({ sub: '1', email: '', role: 'creator', jti: 'ver-jti', tokenVersion: 2 });

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT token_version FROM users'),
      ['1']
    );
  });

  // tokenVersion: stale version after password reset
  test('returns 401 SESSION_INVALIDATED when the token predates a password reset', async () => {
    // Token carries version 0; DB now has version 1 (reset happened)
    mockDbQuery.mockResolvedValue({ rows: [{ token_version: 1 }] });
    const token = app.jwt.sign({ sub: '1', email: '', role: 'creator', jti: 'stale-jti', tokenVersion: 0 });

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'SESSION_INVALIDATED' },
    });
  });

  // expired token test
  test('rejects an expired token with 401 UNAUTHORIZED', async () => {
    const expiredToken = app.jwt.sign(
      { sub: '1', email: '', role: 'player', jti: 'exp-jti' },
      { expiresIn: -1 },
    );

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { Authorization: `Bearer ${expiredToken}` },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'UNAUTHORIZED' },
    });
    // Blacklist check must not be reached — token rejected by jwt.verify before our hook logic runs
    expect(mockIsBlacklisted).not.toHaveBeenCalled();
  });

  // tokenVersion: user not found (deactivated)
  test('returns 401 SESSION_INVALIDATED when the user row is not found in the DB', async () => {
    mockDbQuery.mockResolvedValue({ rows: [] });
    const token = app.jwt.sign({ sub: '999', email: '', role: 'creator', jti: 'ghost-jti', tokenVersion: 0 });

    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('SESSION_INVALIDATED');
  });
});

describe('optionalAuth', () => {
  let app: ReturnType<typeof Fastify>;
  let mockIsBlacklisted: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    ({ app, mockIsBlacklisted } = buildApp());
    await app.ready();
  });

  afterEach(() => app.close());

  // valid token sets user/absent token passes silently test
  test('populates request.user on a valid token and does not block requests without one', async () => {
    const token = app.jwt.sign({ sub: '7', email: '', role: 'player', jti: 'opt-jti' });

    const withToken = await app.inject({
      method: 'GET',
      url: '/optional',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(withToken.statusCode).toBe(200);
    expect(withToken.json().hasUser).toBe(true);

    const noToken = await app.inject({ method: 'GET', url: '/optional' });
    expect(noToken.statusCode).toBe(200);
    expect(noToken.json().hasUser).toBe(false);
  });

  // blacklisted token: optionalAuth must clear request.user instead of passing it through
  test('clears request.user when the token jti is blacklisted', async () => {
    mockIsBlacklisted.mockResolvedValue(true);
    const token = app.jwt.sign({ sub: '7', email: '', role: 'player', jti: 'revoked-opt-jti' });

    const response = await app.inject({
      method: 'GET',
      url: '/optional',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    // user must be cleared, not populated, so the route treats caller as anonymous
    expect(response.json().hasUser).toBe(false);
    expect(mockIsBlacklisted).toHaveBeenCalledWith('revoked-opt-jti');
  });
});

describe('turnstileVerify', () => {
  let app: ReturnType<typeof Fastify>;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    ({ app } = buildApp());
    await app.ready();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllGlobals();
  });

  // missing turnstileToken in body test
  test('returns 400 CAPTCHA_FAILED and does not call fetch when turnstileToken is absent', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/verify',
      payload: { someOtherField: 'value' }, // no turnstileToken
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'CAPTCHA_FAILED' },
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // Cloudflare returns `success: false` test
  test('returns 400 CAPTCHA_FAILED when Cloudflare verification fails', async () => {
    mockCloudflare(mockFetch, false);

    const response = await app.inject({
      method: 'POST',
      url: '/verify',
      payload: { turnstileToken: 'failing-token' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('CAPTCHA_FAILED');
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  // Cloudflare returns `success: true` test
  test('calls next and returns 200 when Cloudflare verification succeeds', async () => {
    mockCloudflare(mockFetch, true);

    const response = await app.inject({
      method: 'POST',
      url: '/verify',
      payload: { turnstileToken: 'valid-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  // fetch throws network error test
  test('returns 400 CAPTCHA_FAILED when the Cloudflare API is unreachable', async () => {
    mockFetch.mockRejectedValue(new Error('Network failure'));

    const response = await app.inject({
      method: 'POST',
      url: '/verify',
      payload: { turnstileToken: 'some-token' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('CAPTCHA_FAILED');
  });

  // non-production: always-pass test key is substituted for the real secret
  test('uses the CF always-pass test key in non-production environments', async () => {
    // The config mock sets nodeEnv: 'test', so the hook substitutes CF_SECRET_TEST_KEYS.PASS
    mockCloudflare(mockFetch, true);

    await app.inject({
      method: 'POST',
      url: '/verify',
      payload: { turnstileToken: 'any-token' },
    });

    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(requestBody.secret).toBe(CF_SECRET_TEST_KEYS.PASS);
    expect(requestBody.secret).not.toBe('prod-secret');
  });
});
