import { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcrypt';
import { requireAuth } from '../hooks/auth.hook.js';
import type { UpdateProfileRequest, ChangePasswordRequest } from '@extriviate/shared';

const SALT_ROUNDS = 12;

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/users/me
  // Returns the currently authenticated user's profile
  fastify.get('/me', { preHandler: [requireAuth] }, async (request, reply) => {
    const user = await fastify.queryService.findActiveUserById(parseInt(request.user.sub, 10));

    if (!user) {
      return reply.status(404).send({
        success: false,
        error: { message: 'User not found', code: 'USER_NOT_FOUND' },
      });
    }

    return reply.send({
      success: true,
      data: {
        id: user.id,
        displayName: user.display_name,
        role: user.role,
        createdAt: user.created_at,
      },
    });
  });

  // GET /api/users/me/stats
  // Returns aggregated counts for the profile page.
  fastify.get('/me/stats', { preHandler: [requireAuth] }, async (request, reply) => {
    const row = await fastify.queryService.getUserStats(parseInt(request.user.sub, 10));
    return reply.send({
      success: true,
      data: {
        gamesCreated: Number(row.games_created),
        categoriesCreated: Number(row.categories_created),
        questionsCreated: Number(row.questions_created),
        sessionsPlayed: Number(row.sessions_played),
      },
    });
  });

  // PATCH /api/users/me
  // Updates the current user's display name.
  // PATCH is used rather than PUT because we're doing a partial update -
  // only the fields provided in the body are changed.
  fastify.patch<{ Body: UpdateProfileRequest }>(
    '/me',
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: 'object',
          minProperties: 1,
          // Reject empty bodies - at least one field must be provided
          properties: {
            displayName: { type: 'string', minLength: 1, maxLength: 50 },
          },
          additionalProperties: false,
          // Reject any fields not listed above - prevents unexpected
          // data from being passed to the query.
        },
      },
    },
    async (request, reply) => {
      const { displayName } = request.body;

      const user = await fastify.queryService.updateUserDisplayName(
        parseInt(request.user.sub, 10),
        displayName ?? null,
      );
      // COALESCE($1, display_name) means: use the new value if provided,
      // otherwise keep the existing value. This handles partial updates
      // cleanly without needing separate queries per field.

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: { message: 'User not found', code: 'USER_NOT_FOUND' },
        });
      }

      return reply.send({
        success: true,
        data: {
          id: user.id,
          displayName: user.display_name,
          role: user.role,
          createdAt: user.created_at,
        },
      });
    }
  );

  // POST /api/users/me/change-password
  // Separate endpoint from PATCH /me because password changes require
  // current password verification - different logic and stricter handling.
  fastify.post<{ Body: ChangePasswordRequest }>(
    '/me/change-password',
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: {
            currentPassword: { type: 'string' },
            newPassword: { type: 'string', minLength: 8, maxLength: 72 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { currentPassword, newPassword } = request.body;

      // Fetch the current hash to verify against
      const row = await fastify.queryService.findUserHashById(parseInt(request.user.sub, 10));

      if (!row) {
        return reply.status(404).send({
          success: false,
          error: { message: 'User not found', code: 'USER_NOT_FOUND' },
        });
      }

      const valid = await bcrypt.compare(currentPassword, row.password_hash);
      if (!valid) {
        return reply.status(401).send({
          success: false,
          error: { message: 'Current password is incorrect', code: 'INVALID_PASSWORD' },
        });
      }

      const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      await fastify.queryService.updateUserPassword(parseInt(request.user.sub, 10), newHash);

      return reply.send({ success: true, data: null });
    }
  );

  // DELETE /api/users/me
  // Soft-deletes the account by setting is_active = false.
  // Hard deletion would cascade through the schema and destroy all the
  // user's games and categories - soft delete preserves historical records
  // while preventing further login.
  fastify.delete('/me', { preHandler: [requireAuth] }, async (request, reply) => {
    await fastify.queryService.deactivateUser(parseInt(request.user.sub, 10));

    // Blacklist the current token immediately so it can't be reused
    if (request.user.jti && request.user.exp) {
      await fastify.blacklistToken(request.user.jti, request.user.exp);
    }

    return reply.send({ success: true, data: null });
  });
};

export default usersRoutes;
