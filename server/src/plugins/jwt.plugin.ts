import fp from "fastify-plugin";
import { FastifyPluginAsync } from "fastify";
import fastifyJwt from "@fastify/jwt";
import { config } from "../config.js";
import type { JwtPayload } from "@extriviate/shared";

const jwtPlugin: FastifyPluginAsync = async (fastify) => {
  // Register @fastify/jwt with our secret.
  // This adds fastify.jwt to the instance, which provides
  // .sign(), .verify(), and .decode() methods.
  await fastify.register(fastifyJwt, {
    secret: config.jwt.secret,

    sign: {
      expiresIn: config.jwt.accessExpiry,
      // Default sign options - used when calling fastify.jwt.sign()
      // without explicit options. Access tokens expire quickly (15m).
    },

    decode: { complete: true },
    // complete: true means .decode() returns both header and payload,
    // giving us access to the jti (JWT ID) for blacklisting.
  });

  // Decorate the instance with a helper to sign an access token.
  // Centralizing this here means all token creation goes through one place.
  fastify.decorate(
    "signAccessToken",
    (payload: Omit<JwtPayload, "iat" | "exp">) => {
      return fastify.jwt.sign(payload, { expiresIn: config.jwt.accessExpiry });
    },
  );

  // Decorate with a helper to sign a refresh token
  // Refresh tokens have a longer expiry and are stored client-side
  // in an httpOnly cookie or localStorage
  fastify.decorate(
    "signRefreshToken",
    (payload: Omit<JwtPayload, "iat" | "exp">) => {
      return fastify.jwt.sign(payload, { expiresIn: config.jwt.refreshExpiry });
    },
  );

  // Decorate with a helper to blacklist a token by its jti.
  // The token is stored in Redis with an expiry matching when it would
  // naturally expire anyway - so Redis cleans up automatically.
  // If Redis is unavailable, this is a no-op — tokens expire naturally.
  fastify.decorate("blacklistToken", async (jti: string, expiresAt: number) => {
    if (!fastify.redisAvailable) {
      fastify.log.warn(
        { jti },
        "Redis unavailable — token not blacklisted, will expire naturally",
      );
      return;
    }
    const secondsRemaining = expiresAt - Math.floor(Date.now() / 1000);
    if (secondsRemaining > 0) {
      await fastify.redis.set(
        `blacklist:${jti}`,
        "1",
        { EX: secondsRemaining },
        // EX sets the Redis key TTL in seconds - key auto-deletes when
        // the token would have expired anyway, keeping Redis lean.
      );
    }
  });

  // Decorate with a helper to check if a token's jti is blacklisted.
  // If Redis is unavailable, always returns false (no blacklist to check).
  fastify.decorate(
    "isTokenBlacklisted",
    async (jti: string): Promise<boolean> => {
      if (!fastify.redisAvailable) {
        return false;
      }
      const result = await fastify.redis.get(`blacklist:${jti}`);
      return result !== null;
    },
  );
};

// Declare the new decorators on FastifyInstance for TypeScript
declare module "fastify" {
  interface FastifyInstance {
    signAccessToken: (payload: Omit<JwtPayload, "iat" | "exp">) => string;
    signRefreshToken: (payload: Omit<JwtPayload, "iat" | "exp">) => string;
    blacklistToken: (jti: string, expiresAt: number) => Promise<void>;
    isTokenBlacklisted: (jti: string) => Promise<boolean>;
  }
}

export default fp(jwtPlugin, {
  name: "jwt",
  fastify: "5.x",
  dependencies: ["redis"],
  // redis must still be registered first so fastify.redisAvailable is set
  // before jwtPlugin runs — the redis plugin always succeeds now (graceful fallback).
});
