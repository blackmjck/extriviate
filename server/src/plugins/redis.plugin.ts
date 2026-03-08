import fp from "fastify-plugin";
import { FastifyPluginAsync } from "fastify";
import { createClient } from "redis";
import { config } from "../config.js";

const redisPlugin: FastifyPluginAsync = async (fastify) => {
  const client = createClient({ url: config.redis.url });

  client.on("error", (err) => {
    // Log Redis errors without crashing the server.
    // A transient Redis blip shouldn't take down the whole app -
    // the worst case is a blacklisted token briefly passing through.
    fastify.log.error({ err }, "Redis client error");
  });

  await client.connect();
  fastify.log.info("Redis connected");

  fastify.decorate("redis", client as any);
  // 'as any' works around a minor type mismatch between redis v4's
  // RedisClientType generic and the declaration in fastify.d.ts.
  // The runtime behavior is correct

  fastify.addHook("onClose", async () => {
    await client.quit();
    fastify.log.info("Redis connection closed");
  });
};

export default fp(redisPlugin, {
  name: "redis",
  fastify: "5.x",
});
