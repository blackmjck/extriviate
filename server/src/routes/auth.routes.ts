import { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'crypto';
import fastifyRateLimit from '@fastify/rate-limit';
import { AuthService } from '../services/auth.service.js';
import { requireAuth, turnstileVerify } from '../hooks/auth.hook.js';
import type { SignUpRequest, LoginRequest, JwtPayload } from '@extriviate/shared';
import { config } from '../config.js';

// Cookie options for the refresh token.
// HttpOnly: JavaScript cannot read this cookie.
// Secure: only send over HTTPS. Set to false in development.
// SameSite: 'lax' allows the cookie to be sent on same-site requests and
//           top-level navigations, but blocks silent cross-site requests (CSRF protection).
// Path: only send the cookie when the browser makes requests to /api/auth -
//       not on every single API call. This reduces exposure.
function getRefreshCookieOptions(nodeEnv: string) {
  return {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: 'lax' as const,
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds (matches JWT_REFRESH_EXPIRY)
  };
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  const authService = new AuthService(fastify.db, fastify);

  // Rate limiting
  // Registered first so it applies to all routes declared below in this scope.
  // The 'global: true' flag means the limits below are the DEFAULT for every
  // auth route. Individual routes can override with a tighter config object.
  await fastify.register(fastifyRateLimit, {
    global: true,
    max: 30,
    timeWindow: '1 minute',

    // Use the existing Redis connection as the counter store.
    // This means rate-limit counters survive server restarts and are accurate
    // even under concurrent load (Redis operations are atomic).
    // Falls back to in-memory automatically if Redis is unavailable.
    redis: fastify.redisAvailable ? fastify.redis : undefined,

    // In production, Fastify reads request.ip from X-Forwarded-For (trustProxy: true).
    // This key generator makes the rate-limit key explicit for clarity.
    keyGenerator: (request) => request.ip,

    // Return a response that matches the ApiResponse<T> format used everywhere
    // else in the API; the default response format from the plugin is different.
    errorResponseBuilder: (_request, context) => ({
      success: false,
      error: {
        message: `Too many requests. Please wait ${Math.ceil(context.ttl / 1000)} seconds before trying again.`,
        code: 'RATE_LIMITED',
      },
    }),

    // Add standard rate-limit headers to every response so clients know where
    // they stand. The browser and any HTTP client can read:
    //   X-RateLimit-Limit      - the maximum requests allowed
    //   X-RateLimit-Remaining  - how many requests are left in the current window
    //   X-RateLimit-Reset      - when the window resets (epoch timestamp)
    //   Retry-After            - seconds to wait (only on 429 responses)
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  });

  // POST /api/auth/signup
  fastify.post<{ Body: SignUpRequest }>(
    '/signup',
    {
      preHandler: [turnstileVerify],
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '10 minutes',
          // 5 signups per 10 minutes per IP.
        },
      },
      schema: {
        // Fastify validates the request body against this schema before
        // the handler runs. Invalid requests are rejected with a 400
        // automatically - no manual validation needed in the handler.
        body: {
          type: 'object',
          required: ['email', 'password', 'displayName'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8, maxLength: 72 },
            // 72 chars is bcrypt's effective maximum input length
            displayName: { type: 'string', minLength: 1, maxLength: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { user, tokens } = await authService.signUp(request.body);

        // Set the refresh token as an HttpOnly cookie.
        // The browser stores this; JS cannot read it
        reply.setCookie(
          'refresh_token',
          tokens.refreshToken,
          getRefreshCookieOptions(config.server.nodeEnv)
        );

        // Only return the access token in the JSON body.
        return reply
          .status(201)
          .send({ success: true, data: { user, tokens: { accessToken: tokens.accessToken } } });
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({
          success: false,
          error: { message: err.message, code: err.code },
        });
      }
    }
  );

  // POST /api/auth/login
  fastify.post<{ Body: LoginRequest }>(
    '/login',
    {
      preHandler: [turnstileVerify],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '10 minutes',
          // 10 login attempts per 10 minutes per IP.
        },
      },
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { user, tokens } = await authService.login(request.body);

        // Set the refresh token as an HttpOnly cookie.
        // The browser stores this; JS cannot read it
        reply.setCookie(
          'refresh_token',
          tokens.refreshToken,
          getRefreshCookieOptions(config.server.nodeEnv)
        );

        // Only return the access token in the JSON body.
        return reply
          .status(200)
          .send({ success: true, data: { user, tokens: { accessToken: tokens.accessToken } } });
      } catch (err: any) {
        // For account lockout, include the Retry-After header so well-behaved
        // clients (and the app) know exactly how long to wait.
        if (err.code === 'ACCOUNT_LOCKED') {
          return reply
            .status(429)
            .header('Retry-After', String(err.retryAfterSeconds))
            .send({
              success: false,
              error: { message: err.message, code: err.code },
            });
        }

        return reply.status(err.statusCode ?? 500).send({
          success: false,
          error: { message: err.message, code: err.code },
        });
      }
    }
  );

  // POST /api/auth/logout  (protected)
  fastify.post(
    '/logout',
    {
      preHandler: [requireAuth],
    },
    // preHandler runs before the route handler.
    // requireAuth verifies the JWT and populates request.user.
    // An array is used so additional hooks can be added later.
    async (request, reply) => {
      const accessPayload = request.user; // verified access token payload
      const refreshToken = request.cookies['refresh_token'];

      if (refreshToken) {
        try {
          // Verify the refresh token's signature and expiry.
          // .verify() throws if the token is invalid, expired, or tampered with.
          const refreshPayload = fastify.jwt.verify<JwtPayload>(refreshToken);

          // Confirm both tokens belong to the same session.
          // If someone sends a valid refresh token from a *different* login session,
          // we must not let them blacklist it (that would be a logout-of-someone-else attack).
          if (refreshPayload.jti !== accessPayload.jti) {
            return reply.status(400).send({
              success: false,
              error: { message: 'Token mismatch', code: 'TOKEN_MISMATCH' },
            });
          }

          if (refreshPayload.jti === accessPayload.jti && refreshPayload.exp) {
            // Blacklist using the refresh token's expiry (up to 7 days from now).
            // Because both tokens share the same jti, this single blacklist entry
            // covers the access token as well.
            await authService.logout(refreshPayload.jti!, refreshPayload.exp);
          }
        } catch {
          // The refresh token is invalid or already expired.
          // Still blacklist the access token on a best-effort basis.
          if (accessPayload.jti && accessPayload.exp) {
            await authService.logout(accessPayload.jti, accessPayload.exp);
          }
        }
      }

      // Clear the cookie from the browser regardless of blacklist success.
      reply.clearCookie('refresh_token', getRefreshCookieOptions(config.server.nodeEnv));
      return reply.status(200).send({ success: true, data: null });
    }
  );

  // POST /api/auth/check-password
  fastify.post<{ Body: { password: string } }>(
    '/check-password',
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
          // Tighter than the global 30/min because each call fans out to
          // the external HIBP API. Prevents abuse while still allowing
          // fast real-time feedback as the user types.
        },
      },
      schema: {
        body: {
          type: 'object',
          required: ['password'],
          properties: {
            password: { type: 'string', minLength: 8, maxLength: 72 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const pwned = await authService.isPwnedPassword(request.body.password);
        return reply.status(200).send({ success: true, data: { pwned } });
      } catch {
        // HIBP is a best-effort check. If their API is unreachable,
        // tell the client clearly so it can decide whether to block
        // or warn. Never silently return `false` — that would be misleading.
        return reply.status(503).send({
          success: false,
          error: {
            message: 'Password breach check is temporarily unavailable.',
            code: 'PWNED_CHECK_UNAVAILABLE',
          },
        });
      }
    }
  );

  // POST /api/auth/refresh
  fastify.post(
    '/refresh',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: 15 * 60 * 1000, // 15 minutes
          // Why 10 per 15 minutes?
          // A legitimate user refreshes at most once per 15-minute access token
          // window.
          // An attacker with a stolen refresh token can call this at most 10
          // times before being blocked.
          // A script hammering this endpoint can do at most 10 calls per 15 minutes
          // per IP. This eliminates the DoS risk from this endpoint almost entirely.
        },
      },
    },
    async (request, reply) => {
      // Read the refresh token from the cookie.
      // No request body needed.
      const refreshToken = request.cookies['refresh_token'];

      if (!refreshToken) {
        return reply.status(401).send({
          success: false,
          error: { message: 'No refresh token', code: 'NO_TOKEN' },
        });
      }

      try {
        const payload = fastify.jwt.verify<JwtPayload>(refreshToken);

        const blacklisted = await fastify.isTokenBlacklisted(payload.jti!);
        if (blacklisted) {
          // This refresh token has already been used or was explicitly revoked.
          // Clear the cookie - there's no valid session to restore.
          reply.clearCookie('refresh_token', getRefreshCookieOptions(config.server.nodeEnv));
          return reply.status(401).send({
            success: false,
            error: { message: 'Token has been revoked', code: 'TOKEN_REVOKED' },
          });
        }

        // ROTATION STEP 1: Retire the old refresh token immediately.
        // Blacklist the incoming refresh token right now, before issuing anything new.
        // If anything fails after this point, the old token still cannot be reused -
        // the user will just need to log in again. This is the safer failure mode.
        if (payload.jti && payload.exp) {
          await fastify.blacklistToken(payload.jti, payload.exp);
        }

        // ROTATION STEP 2: Issue a completely new token pair
        // A fresh jti means this is a brand new identity - the old jti is dead.
        const newJti = randomUUID();
        const newPayload = {
          sub: payload.sub,
          email: payload.email,
          role: payload.role,
          jti: newJti,
        };

        const newAccessToken = fastify.signAccessToken(newPayload);
        const newRefreshToken = fastify.signRefreshToken(newPayload);

        // ROTATION STEP 3: Replace the cookie with the new refresh token.
        // The browser will overwrite the old cookie with the new one automatically
        // because they share the same cookie name, path, and domain.
        reply.setCookie(
          'refresh_token',
          newRefreshToken,
          getRefreshCookieOptions(config.server.nodeEnv)
        );

        return reply.send({ success: true, data: { accessToken: newAccessToken } });
      } catch {
        // Token was invalid or expired - clear the cookie so the browser stops sending it.
        reply.clearCookie('refresh_token', getRefreshCookieOptions(config.server.nodeEnv));
        return reply.status(401).send({
          success: false,
          error: { message: 'Invalid refresh token', code: 'INVALID_TOKEN' },
        });
      }
    }
  );
};

export default authRoutes;
