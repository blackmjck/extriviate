import fp from "fastify-plugin";
import { FastifyPluginAsync } from "fastify";
import { createClient } from "redis";
import { config } from "../config.js";

// Minimal stub satisfying the get/set operations used by the JWT plugin.
// All operations are no-ops; blacklisting is silently skipped when Redis
// is unavailable. The only security implication is that logout does not
// immediately revoke tokens — they expire naturally (access: 15m).
const nullRedisClient = {
  get: async (_key: string) => null,
  set: async (..._args: unknown[]) => null,
  quit: async () => {},
} as any;

const redisPlugin: FastifyPluginAsync = async (fastify) => {
  if (!config.redis.url) {
    fastify.log.warn(
      "REDIS_URL is not set — running without Redis. " +
        "Token revocation (logout) will not take effect until natural token expiry.",
    );
    fastify.decorate("redis", nullRedisClient);
    fastify.decorate("redisAvailable", false);
    return;
  }

  const client = createClient({ url: config.redis.url });

  client.on("error", (err) => {
    // Log Redis errors without crashing the server.
    // A transient Redis blip shouldn't take down the whole app -
    // the worst case is a blacklisted token briefly passing through.
    fastify.log.error({ err }, "Redis client error");
  });

  try {
    await client.connect();
    fastify.log.info("Redis connected");
    fastify.decorate("redis", client as any);
    fastify.decorate("redisAvailable", true);

    fastify.addHook("onClose", async () => {
      await client.quit();
      fastify.log.info("Redis connection closed");
    });
  } catch (err) {
    fastify.log.warn(
      { err },
      "Redis connection failed — running without Redis. " +
        "Token revocation (logout) will not take effect until natural token expiry.",
    );
    fastify.decorate("redis", nullRedisClient);
    fastify.decorate("redisAvailable", false);
  }
};

export default fp(redisPlugin, {
  name: "redis",
  fastify: "5.x",
});
