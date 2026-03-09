import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import fp from 'fastify-plugin';

// We need to control what config.redis.url returns and what createClient does,
// so we mock both modules before importing the plugin.

vi.mock('../../config.js', () => ({
  config: { redis: { url: '' } },
}));

vi.mock('redis', () => ({
  createClient: vi.fn(),
}));

import { config } from '../../config.js';
import { createClient } from 'redis';
import redisPlugin from '../redis.plugin.js';

const mockConfig = config as { redis: { url: string } };
const mockCreateClient = createClient as ReturnType<typeof vi.fn>;

function buildApp() {
  return Fastify({ logger: false });
}

describe('redis.plugin — no REDIS_URL configured', () => {
  beforeEach(() => {
    mockConfig.redis.url = '';
    mockCreateClient.mockReset();
  });

  test('registers without error', async () => {
    const app = buildApp();
    await expect(app.register(redisPlugin)).resolves.not.toThrow();
    await app.ready();
    await app.close();
  });

  test('decorates fastify.redisAvailable as false', async () => {
    const app = buildApp();
    await app.register(redisPlugin);
    await app.ready();
    expect(app.redisAvailable).toBe(false);
    await app.close();
  });

  test('decorates fastify.redis with a null stub whose get returns null', async () => {
    const app = buildApp();
    await app.register(redisPlugin);
    await app.ready();
    const result = await app.redis.get('any-key');
    expect(result).toBeNull();
    await app.close();
  });

  test('decorates fastify.redis with a null stub whose set resolves', async () => {
    const app = buildApp();
    await app.register(redisPlugin);
    await app.ready();
    await expect(app.redis.set('key', 'val', { EX: 60 } as any)).resolves.not.toThrow();
    await app.close();
  });

  test('does not call createClient', async () => {
    const app = buildApp();
    await app.register(redisPlugin);
    await app.ready();
    expect(mockCreateClient).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('redis.plugin — REDIS_URL set but connection fails', () => {
  beforeEach(() => {
    mockConfig.redis.url = 'redis://localhost:6379';
    mockCreateClient.mockReset();
  });

  test('registers without error even when connect() rejects', async () => {
    mockCreateClient.mockReturnValue({
      on: vi.fn(),
      connect: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    });

    const app = buildApp();
    await expect(app.register(redisPlugin)).resolves.not.toThrow();
    await app.ready();
    await app.close();
  });

  test('sets redisAvailable to false when connect() rejects', async () => {
    mockCreateClient.mockReturnValue({
      on: vi.fn(),
      connect: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    });

    const app = buildApp();
    await app.register(redisPlugin);
    await app.ready();
    expect(app.redisAvailable).toBe(false);
    await app.close();
  });

  test('installs null stub when connect() rejects', async () => {
    mockCreateClient.mockReturnValue({
      on: vi.fn(),
      connect: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    });

    const app = buildApp();
    await app.register(redisPlugin);
    await app.ready();
    const result = await app.redis.get('any-key');
    expect(result).toBeNull();
    await app.close();
  });
});

describe('redis.plugin — REDIS_URL set and connection succeeds', () => {
  beforeEach(() => {
    mockConfig.redis.url = 'redis://localhost:6379';
    mockCreateClient.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('sets redisAvailable to true', async () => {
    const fakeClient = {
      on: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
    };
    mockCreateClient.mockReturnValue(fakeClient);

    const app = buildApp();
    await app.register(redisPlugin);
    await app.ready();
    expect(app.redisAvailable).toBe(true);
    await app.close();
  });

  test('decorates fastify.redis with the live client', async () => {
    const fakeClient = {
      on: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
    };
    mockCreateClient.mockReturnValue(fakeClient);

    const app = buildApp();
    await app.register(redisPlugin);
    await app.ready();
    expect(app.redis).toBe(fakeClient);
    await app.close();
  });

  test('calls quit() on app close', async () => {
    const fakeClient = {
      on: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
    };
    mockCreateClient.mockReturnValue(fakeClient);

    const app = buildApp();
    await app.register(redisPlugin);
    await app.ready();
    await app.close();
    expect(fakeClient.quit).toHaveBeenCalledOnce();
  });
});
