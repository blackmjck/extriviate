import { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../hooks/auth.hook.js';
import type {
  CreateCategoryRequest,
  UpdateCategoryRequest,
  PaginationParams,
} from '@extriviate/shared';
import { MAX_CATEGORY_NAME_LENGTH } from '@extriviate/shared';

const categoriesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/categories
  // Returns all categories belonging to the authenticated user.
  fastify.get<{ Querystring: PaginationParams }>(
    '/',
    {
      preHandler: [requireAuth],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            offset: { type: 'integer', minimum: 0, default: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      const { limit = 20, offset = 0 } = request.query;

      const [items, count] = await Promise.all([
        fastify.db.query(
          `SELECT id, name, description, created_at, updated_at
          FROM categories
          WHERE creator_id = $1
          ORDER BY name ASC
          LIMIT $2 OFFSET $3`,
          [request.user.sub, limit, offset]
        ),
        fastify.db.query('SELECT COUNT(*) FROM categories WHERE creator_id = $1', [
          request.user.sub,
        ]),
      ]);

      return reply.send({
        success: true,
        data: {
          items: items.rows,
          total: parseInt(count.rows[0].count, 10),
          limit,
          offset,
        },
      });
    }
  );

  // GET /api/categories/:id
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const result = await fastify.db.query(
        `SELECT id, name, description, created_at, updated_at
        FROM categories
        WHERE id = $1 AND creator_id = $2`,
        [request.params.id, request.user.sub]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({
          success: false,
          error: { message: 'Category not found', code: 'NOT_FOUND' },
        });
      }

      return reply.send({ success: true, data: result.rows[0] });
    }
  );

  // POST /api/categories
  fastify.post<{ Body: CreateCategoryRequest }>(
    '/',
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: MAX_CATEGORY_NAME_LENGTH },
            description: { type: 'string', maxLength: 500 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { name, description } = request.body;

      try {
        const result = await fastify.db.query(
          `INSERT INTO categories (creator_id, name, description)
          VALUES ($1, $2, $3)
          RETURNING id, name, description, created_at, updated_at`,
          [request.user.sub, name, description ?? null]
        );

        return reply.status(201).send({ success: true, data: result.rows[0] });
      } catch (err: any) {
        // PostgreSQL error code 23505 is a unique constraint violation.
        // Our schema has UNIQUE(creator_id, name) - this catches duplicate
        // category names for the same creator.
        if (err.code === '23505') {
          return reply.status(409).send({
            success: false,
            error: {
              message: 'You already have a category with this name',
              code: 'DUPLICATE_NAME',
            },
          });
        }
        throw err;
      }
    }
  );

  // PATCH /api/categories/:id
  fastify.patch<{ Params: { id: string }; Body: UpdateCategoryRequest }>(
    '/:id',
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: 'object',
          minProperties: 1,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: MAX_CATEGORY_NAME_LENGTH },
            description: { type: 'string', maxLength: 500 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { name, description } = request.body;

      try {
        const result = await fastify.db.query(
          `UPDATE categories
          SET name = COALESCE($1, name),
              description = COALESCE($2, description),
              updated_at = NOW()
          WHERE id = $3 AND creator_id = $4
          RETURNING id, name, description, created_at, updated_at`,
          [name ?? null, description ?? null, request.params.id, request.user.sub]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({
            success: false,
            error: { message: 'Category not found', code: 'NOT_FOUND' },
          });
        }

        return reply.send({ success: true, data: result.rows[0] });
      } catch (err: any) {
        if (err.code === '23505') {
          return reply.status(409).send({
            success: false,
            error: {
              message: 'You already have a category with this name',
              code: 'DUPLICATE_NAME',
            },
          });
        }
        throw err;
      }
    }
  );

  // DELETE /api/categories/:id
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      try {
        const result = await fastify.db.query(
          `DELETE FROM categories
          WHERE id = $1 AND creator_id = $2
          RETURNING id`,
          [request.params.id, request.user.sub]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({
            success: false,
            error: { message: 'Category not found', code: 'NOT_FOUND' },
          });
        }

        return reply.send({ success: true, data: null });
      } catch (err: any) {
        // PostgreSQL error code 23503 is a foreign key violation.
        // This fires when trying to delete a category that is currently
        // referenced by a game - our schema uses ON DELETE RESTRICT.
        if (err.code === '23503') {
          return reply.status(409).send({
            success: false,
            error: {
              message: 'This category is used in a saved game and cannot be deleted.',
              code: 'CATEGORY_IN_USE',
            },
          });
        }
        throw err;
      }
    }
  );
};

export default categoriesRoutes;
