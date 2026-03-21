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
      const creatorId = parseInt(request.user.sub, 10);

      const [items, total] = await Promise.all([
        fastify.queryService.listCategories(creatorId, limit, offset),
        fastify.queryService.countCategories(creatorId),
      ]);

      return reply.send({
        success: true,
        data: { items, total, limit, offset },
      });
    }
  );

  // GET /api/categories/:id
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const category = await fastify.queryService.findCategoryById(
        parseInt(request.params.id, 10),
        parseInt(request.user.sub, 10),
      );

      if (!category) {
        return reply.status(404).send({
          success: false,
          error: { message: 'Category not found', code: 'NOT_FOUND' },
        });
      }

      return reply.send({ success: true, data: category });
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
        const category = await fastify.queryService.createCategory(
          parseInt(request.user.sub, 10),
          name,
          description ?? null,
        );

        return reply.status(201).send({ success: true, data: category });
      } catch (err: unknown) {
        const { code } = err as { code: string };
        // PostgreSQL error code 23505 is a unique constraint violation.
        // Our schema has UNIQUE(creator_id, name) - this catches duplicate
        // category names for the same creator.
        if (code === '23505') {
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
        const category = await fastify.queryService.updateCategory(
          parseInt(request.params.id, 10),
          parseInt(request.user.sub, 10),
          name ?? null,
          description ?? null,
        );

        if (!category) {
          return reply.status(404).send({
            success: false,
            error: { message: 'Category not found', code: 'NOT_FOUND' },
          });
        }

        return reply.send({ success: true, data: category });
      } catch (err: unknown) {
        const { code } = err as { code: string };
        if (code === '23505') {
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
        const deleted = await fastify.queryService.deleteCategory(
          parseInt(request.params.id, 10),
          parseInt(request.user.sub, 10),
        );

        if (!deleted) {
          return reply.status(404).send({
            success: false,
            error: { message: 'Category not found', code: 'NOT_FOUND' },
          });
        }

        return reply.send({ success: true, data: null });
      } catch (err: unknown) {
        const { code } = err as { code: string };
        // PostgreSQL error code 23503 is a foreign key violation.
        // This fires when trying to delete a category that is currently
        // referenced by a game - our schema uses ON DELETE RESTRICT.
        if (code === '23503') {
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
