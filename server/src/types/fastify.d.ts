import type { JwtPayload } from '@extriviate/shared';

// Augment @fastify/jwt's own interface rather than FastifyRequest directly.
// This is the correct mechanism - @fastify/jwt reads this interface to
// determine the type of request.user throughout the application.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload; // what gets signed into the token
    user: JwtPayload; // what request.user resolves to after jwtVerify()
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    // These are attached by our plugins using fastify.decorate()
    // and are then available on the fastify instance throughout the app.
    db: import('pg').Pool;
    // The PostgreSQL connection pool

    redis: import('redis').RedisClientType;
    // The Redis client instance (or a null stub when Redis is unavailable)

    redisAvailable: boolean;
    // True when a live Redis connection was established at startup.
    // When false, token blacklisting is skipped and blacklist checks always
    // return false — all other functionality is unaffected.

    signAccessToken: (payload: Omit<JwtPayload, 'iat' | 'exp'>) => string;
    signRefreshToken: (payload: Omit<JwtPayload, 'iat' | 'exp'>) => string;
    blacklistToken: (jti: string, expiresAt: number) => Promise<void>;
    isTokenBlacklisted: (jti: string) => Promise<boolean>;
  }
}
