import { FastifyRequest, FastifyReply } from 'fastify';

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
export async function optionalAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    // No valid token - that's fine, request.user simply won't be set.
    // Route handlers must check for request.user before using it.
  }
}
