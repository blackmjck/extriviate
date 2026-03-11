import { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcrypt';
import { requireAuth } from '../hooks/auth.hook.js';
import type { UpdateProfileRequest, ChangePasswordRequest } from '@extriviate/shared';

const SALT_ROUNDS = 12;

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/users/me
  // Returns the currently authenticated user's profile
  fastify.get('/me', { preHandler: [requireAuth] }, async (request, reply) => {
    const result = await fastify.db.query(
      `SELECT id, display_name, role, created_at
        FROM users
        WHERE id = $1 AND is_active = true`,
      [request.user.sub]
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: { message: 'User not found', code: 'USER_NOT_FOUND' },
      });
    }

    const user = result.rows[0];
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
    const userId = request.user.sub;
    const result = await fastify.db.query(
      `SELECT
        (SELECT COUNT(*) FROM games WHERE creator_id = $1) AS games_created,
        (SELECT COUNT(*) FROM categories WHERE creator_id = $1) AS categories_created,
        (SELECT COUNT(*) FROM questions WHERE creator_id = $1) AS questions_created,
        (SELECT COUNT(*) FROM session_players sp
          JOIN game_sessions gs ON gs.id = sp.session_id
          WHERE sp.user_id = $1 AND gs.status = 'completed') AS sessions_played`,
      [userId]
    );
    const row = result.rows[0];
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

      const result = await fastify.db.query(
        `UPDATE users
        SET display_name = COALESCE($1, display_name),
            updated_at = NOW()
        WHERE id = $2 AND is_active = true
        RETURNING id, display_name, role, created_at`,
        [displayName ?? null, request.user.sub]
      );
      // COALESCE($1, display_name) means: use the new value if provided,
      // otherwise keep the existing value. This handles partial updates
      // cleanly without needing separate queries per field.

      if (result.rows.length === 0) {
        return reply.status(404).send({
          success: false,
          error: { message: 'User not found', code: 'USER_NOT_FOUND' },
        });
      }

      const user = result.rows[0];
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
  // Separate endpoing from PATCH /me because password changes require
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
      const result = await fastify.db.query(
        'SELECT password_hash FROM users WHERE id = $1 AND is_active = true',
        [request.user.sub]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({
          success: false,
          error: { message: 'User not found', code: 'USER_NOT_FOUND' },
        });
      }

      const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
      if (!valid) {
        return reply.status(401).send({
          success: false,
          error: { message: 'Current password is incorrect', code: 'INVALID_PASSWORD' },
        });
      }

      const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      await fastify.db.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [newHash, request.user.sub]
      );

      return reply.send({ success: true, data: null });
    }
  );

  // DELETE /api/users/me
  // Soft-deletes the account by setting is_active = false.
  // Hard deletion would cascade through the schema and destroy all the
  // user's games and categories - soft delete preserves historical records
  // while preventing further login.
  fastify.delete('/me', { preHandler: [requireAuth] }, async (request, reply) => {
    await fastify.db.query('UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1', [
      request.user.sub,
    ]);

    // Blacklist the current token immediately so it can't be reused
    if (request.user.jti && request.user.exp) {
      await fastify.blacklistToken(request.user.jti, request.user.exp);
    }

    return reply.send({ success: true, data: null });
  });
};

export default usersRoutes;
