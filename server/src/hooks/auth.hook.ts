import {
  CF_SECRET_TEST_KEYS,
  CF_VERIFY_API,
  TurnstileValidationResponse,
} from '@extriviate/shared';
import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';

// This function is used as a preHandler on any route that requires
// authentication. It is not a plugin - it's applied per-route or
// per-route-group, giving us flexibility over which routes are protected.
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    // @fastify/jwt adds this method to request.
    // It reads the Authorization: Bearer <token> header,
    // verifies the signature and expiry, and returns the payload.
    await request.jwtVerify();

    const payload = request.user;

    // Check the jti against the Redis blacklist.
    // jti (JWT ID) is a unique identifier per token - we set this
    // when signing so each issued token can be individually revoked.
    if (payload.jti) {
      const blacklisted = await request.server.isTokenBlacklisted(payload.jti);
      if (blacklisted) {
        return reply.status(401).send({
          success: false,
          error: { message: 'Token has been revoked', code: 'TOKEN_REVOKED' },
        });
      }
    }

    // Always validate tokenVersion against the DB to reject sessions that predate
    // a password reset. Tokens without tokenVersion are treated as version 0 so
    // that pre-migration tokens are correctly invalidated after a password reset.
    const versionResult = await request.server.db.query<{ token_version: number }>(
      'SELECT token_version FROM users WHERE id = $1 AND is_active = true',
      [payload.sub]
    );
    const dbVersion = versionResult.rows[0]?.token_version ?? 0;
    const payloadVersion = payload.tokenVersion ?? 0;
    if (!versionResult.rows[0] || dbVersion !== payloadVersion) {
      return reply.status(401).send({
        success: false,
        error: { message: 'Session has been invalidated', code: 'SESSION_INVALIDATED' },
      });
    }
  } catch (err) {
    return reply.status(401).send({
      success: false,
      error: { message: 'Unauthorized', code: 'UNAUTHORIZED' },
    });
  }
}

// Optional variant - attaches the user if a valid token is present,
// but does NOT reject requests without one. Used on routes like the
// session join page where both guests and logged-in users are valid.
// Blacklist check is best-effort: if the token is revoked, request.user
// is cleared so the route handler treats the caller as unauthenticated.
export async function optionalAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
    const payload = request.user;
    if (payload?.jti) {
      const blacklisted = await request.server.isTokenBlacklisted(payload.jti);
      // 'as any' is used here because we can't assign request to type
      // FastifyRequest here without it yelling about jwtPayload
      if (blacklisted) {
        (request as any).user = undefined;
        return;
      }
    }

    const versionResult = await request.server.db.query<{ token_version: number }>(
      'SELECT token_version FROM users WHERE id = $1 AND is_active = true',
      [payload.sub]
    );
    const dbVersion = versionResult.rows[0]?.token_version ?? 0;
    const payloadVersion = payload.tokenVersion ?? 0;
    if (!versionResult.rows[0] || dbVersion !== payloadVersion) {
      return reply.status(401).send({
        success: false,
        error: { message: 'Session has been invalidated', code: 'SESSION_INVALIDATED' },
      });
    }
  } catch {
    // No valid token - that's fine, request.user simply won't be set.
    // Route handlers must check for request.user before using it.
  }
}

// Bot protection variant using Cloudflare's Turnstile API as a
// captcha to verify that the user is not a bot. Used on login and
// signup routes where we want to prevent bot spamming.
// **NOTE: this expects the `turnstileToken` to be present in the request body.
export async function turnstileVerify(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { turnstileToken } = request.body as { turnstileToken: string };

    if (!turnstileToken) {
      return reply.status(400).send({
        success: false,
        error: { message: 'Bot verification failed', code: 'CAPTCHA_FAILED' },
      });
    }

    const body = {
      secret:
        config.server.nodeEnv === 'production'
          ? config.turnstile.secretKey
          : CF_SECRET_TEST_KEYS.PASS,
      response: turnstileToken,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    let response: Response;
    try {
      response = await fetch(CF_VERIFY_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      request.log.warn({ status: response.status }, 'Turnstile API returned non-2xx');
      return reply.status(503).send({
        success: false,
        error: {
          message: 'Security verification is temporarily unavailable. Please try again.',
          code: 'CAPTCHA_UNAVAILABLE',
        },
      });
    }

    const result: TurnstileValidationResponse = await response.json();

    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: { message: 'Bot verification failed', code: 'CAPTCHA_FAILED' },
      });
    }
  } catch (err) {
    const isTimeout = (err as { name?: string }).name === 'AbortError';
    if (isTimeout) {
      request.log.warn('Turnstile verification timed out after 5s');
      return reply.status(503).send({
        success: false,
        error: {
          message: 'Security verification timed out. Please try again.',
          code: 'CAPTCHA_UNAVAILABLE',
        },
      });
    }
    return reply.status(400).send({
      success: false,
      error: { message: 'Bot verification failed', code: 'CAPTCHA_FAILED' },
    });
  }
}
