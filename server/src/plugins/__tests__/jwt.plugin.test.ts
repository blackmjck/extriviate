import { describe, test, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import fp from 'fastify-plugin';
import jwtPlugin from '../jwt.plugin.js';

vi.mock('../../config.js', () => ({
  config: {
    jwt: {
      secret: 'test-secret-that-is-long-enough',
      accessExpiry: '15m',
      refreshExpiry: '7d',
    },
  },
}));

// Build a Fastify instance with pre-decorated redis stubs so we can test
// the jwt plugin in isolation without a real Redis or redis plugin.
function buildApp({ redisAvailable }: { redisAvailable: boolean }) {
  const app = Fastify({ logger: false });

  const mockGet = vi.fn().mockResolvedValue(null);
  const mockSet = vi.fn().mockResolvedValue(null);

  // Inline plugin named 'redis' to satisfy jwtPlugin's dependencies: ['redis']
  app.register(
    fp(
      async (fastify) => {
        fastify.decorate('redis', { get: mockGet, set: mockSet } as any);
        fastify.decorate('redisAvailable', redisAvailable);
      },
      { name: 'redis' },
    ),
  );

  app.register(jwtPlugin);

  return { app, mockGet, mockSet };
}

describe('jwt.plugin — blacklistToken', () => {
  test('writes to Redis when redisAvailable is true', async () => {
    const { app, mockSet } = buildApp({ redisAvailable: true });
    await app.ready();

    const futureExp = Math.floor(Date.now() / 1000) + 900; // 15 min from now
    await app.blacklistToken('some-jti', futureExp);

    expect(mockSet).toHaveBeenCalledOnce();
    expect(mockSet).toHaveBeenCalledWith(
      'blacklist:some-jti',
      '1',
      expect.objectContaining({ EX: expect.any(Number) }),
    );
    await app.close();
  });

  test('skips Redis write when redisAvailable is false', async () => {
    const { app, mockSet } = buildApp({ redisAvailable: false });
    await app.ready();

    const futureExp = Math.floor(Date.now() / 1000) + 900;
    await app.blacklistToken('some-jti', futureExp);

    expect(mockSet).not.toHaveBeenCalled();
    await app.close();
  });

  test('does not write to Redis when token is already expired', async () => {
    const { app, mockSet } = buildApp({ redisAvailable: true });
    await app.ready();

    const pastExp = Math.floor(Date.now() / 1000) - 1; // already expired
    await app.blacklistToken('expired-jti', pastExp);

    expect(mockSet).not.toHaveBeenCalled();
    await app.close();
  });

  test('resolves without throwing when redisAvailable is false', async () => {
    const { app } = buildApp({ redisAvailable: false });
    await app.ready();

    const futureExp = Math.floor(Date.now() / 1000) + 900;
    await expect(app.blacklistToken('jti', futureExp)).resolves.not.toThrow();
    await app.close();
  });
});

describe('jwt.plugin — isTokenBlacklisted', () => {
  test('returns true when jti is in Redis', async () => {
    const { app, mockGet } = buildApp({ redisAvailable: true });
    mockGet.mockResolvedValue('1');
    await app.ready();

    const result = await app.isTokenBlacklisted('revoked-jti');
    expect(result).toBe(true);
    expect(mockGet).toHaveBeenCalledWith('blacklist:revoked-jti');
    await app.close();
  });

  test('returns false when jti is not in Redis', async () => {
    const { app, mockGet } = buildApp({ redisAvailable: true });
    mockGet.mockResolvedValue(null);
    await app.ready();

    const result = await app.isTokenBlacklisted('valid-jti');
    expect(result).toBe(false);
    await app.close();
  });

  test('returns false without calling Redis when redisAvailable is false', async () => {
    const { app, mockGet } = buildApp({ redisAvailable: false });
    await app.ready();

    const result = await app.isTokenBlacklisted('any-jti');
    expect(result).toBe(false);
    expect(mockGet).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('jwt.plugin — token signing', () => {
  test('signAccessToken returns a non-empty string', async () => {
    const { app } = buildApp({ redisAvailable: false });
    await app.ready();

    const token = app.signAccessToken({ sub: '42', email: '', role: 'creator', jti: 'abc' });
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    await app.close();
  });

  test('signRefreshToken returns a non-empty string', async () => {
    const { app } = buildApp({ redisAvailable: false });
    await app.ready();

    const token = app.signRefreshToken({ sub: '42', email: '', role: 'creator', jti: 'abc' });
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    await app.close();
  });
});
