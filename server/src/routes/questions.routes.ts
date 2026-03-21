import { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../hooks/auth.hook.js';
import type {
  CreateQuestionRequest,
  UpdateQuestionRequest,
  PaginationParams,
} from '@extriviate/shared';

const questionsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/questions
  // Returns questions belonging to the authenticated user, with optional category filter.
  fastify.get<{ Querystring: PaginationParams & { categoryId?: string } }>(
    '/',
    {
      preHandler: [requireAuth],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            offset: { type: 'integer', minimum: 0, default: 0 },
            categoryId: { type: 'integer' },
          },
        },
      },
    },
    async (request, reply) => {
      const { limit = 20, offset = 0, categoryId } = request.query;
      const creatorId = parseInt(request.user.sub, 10);
      const catId = categoryId ? parseInt(categoryId, 10) : undefined;

      const [rows, total] = await Promise.all([
        fastify.queryService.listQuestionsWithAnswers(creatorId, limit, offset, catId),
        fastify.queryService.countQuestions(creatorId, catId),
      ]);

      const questions = rows.map((row) => ({
        id: row.id,
        categoryId: row.category_id,
        content: row.content,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        answer: row.answer_id
          ? { id: row.answer_id, questionId: row.id, content: row.answer_content }
          : null,
      }));

      return reply.send({
        success: true,
        data: { items: questions, total, limit, offset },
      });
    }
  );

  // GET /api/questions/:id
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const row = await fastify.queryService.findQuestionWithAnswer(
        parseInt(request.params.id, 10),
        parseInt(request.user.sub, 10),
      );

      if (!row) {
        return reply.status(404).send({
          success: false,
          error: { message: 'Question not found', code: 'NOT_FOUND' },
        });
      }

      return reply.send({
        success: true,
        data: {
          id: row.id,
          categoryId: row.category_id,
          content: row.content,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          answer: row.answer_id
            ? { id: row.answer_id, questionId: row.id, content: row.answer_content }
            : null,
        },
      });
    }
  );

  // POST /api/questions
  // Creates a question and its answer in a single transaction.
  fastify.post<{ Body: CreateQuestionRequest }>(
    '/',
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: 'object',
          required: ['categoryId', 'content', 'answer'],
          properties: {
            categoryId: { type: 'integer' },
            content: {
              type: 'array',
              minItems: 1,
              items: { type: 'object' },
            },
            answer: {
              type: 'object',
              required: ['content'],
              properties: {
                content: {
                  type: 'array',
                  minItems: 1,
                  items: { type: 'object' },
                },
              },
            },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { categoryId, content, answer } = request.body;
      const creatorId = parseInt(request.user.sub, 10);
      const client = await fastify.db.connect();

      try {
        await client.query('BEGIN');

        // Verify the category belongs to this user
        const cat = await fastify.queryService.findCategoryForCreator(categoryId, creatorId, client);
        if (!cat) {
          await client.query('ROLLBACK');
          return reply.status(404).send({
            success: false,
            error: { message: 'Category not found', code: 'NOT_FOUND' },
          });
        }

        const question = await fastify.queryService.createQuestion(creatorId, categoryId, content, client);
        const answerRow = await fastify.queryService.createAnswer(question.id, answer.content, undefined, client);

        await client.query('COMMIT');

        return reply.status(201).send({
          success: true,
          data: {
            id: question.id,
            categoryId: question.category_id,
            content: question.content,
            createdAt: question.created_at,
            updatedAt: question.updated_at,
            answer: {
              id: answerRow.id,
              questionId: question.id,
              content: answerRow.content,
            },
          },
        });
      } catch (err: unknown) {
        await client.query('ROLLBACK');
        const { code } = err as { code: string };
        if (code === '23503') {
          return reply.status(404).send({
            success: false,
            error: { message: 'Category not found', code: 'NOT_FOUND' },
          });
        }
        throw err;
      } finally {
        client.release();
      }
    }
  );

  // PATCH /api/questions/:id
  // Updates question content and/or its answer.
  fastify.patch<{ Params: { id: string }; Body: UpdateQuestionRequest }>(
    '/:id',
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: 'object',
          minProperties: 1,
          properties: {
            content: {
              type: 'array',
              minItems: 1,
              items: { type: 'object' },
            },
            answer: {
              type: 'object',
              required: ['content'],
              properties: {
                content: {
                  type: 'array',
                  minItems: 1,
                  items: { type: 'object' },
                },
              },
            },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { content, answer } = request.body;
      const questionId = parseInt(request.params.id, 10);
      const creatorId = parseInt(request.user.sub, 10);
      const client = await fastify.db.connect();

      try {
        await client.query('BEGIN');

        // Verify ownership
        const existing = await fastify.queryService.findQuestionForCreator(questionId, creatorId, client);
        if (!existing) {
          await client.query('ROLLBACK');
          return reply.status(404).send({
            success: false,
            error: { message: 'Question not found', code: 'NOT_FOUND' },
          });
        }

        if (content) {
          await fastify.queryService.updateQuestion(questionId, content, client);
        }

        if (answer) {
          await fastify.queryService.updateAnswer(questionId, answer.content, client);
        }

        const row = await fastify.queryService.findQuestionWithAnswer(questionId, undefined, client);

        await client.query('COMMIT');

        return reply.send({
          success: true,
          data: {
            id: row!.id,
            categoryId: row!.category_id,
            content: row!.content,
            createdAt: row!.created_at,
            updatedAt: row!.updated_at,
            answer: row!.answer_id
              ? { id: row!.answer_id, questionId: row!.id, content: row!.answer_content }
              : null,
          },
        });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
  );

  // DELETE /api/questions/:id
  // Cascade delete removes the answer automatically (ON DELETE CASCADE).
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      try {
        const deleted = await fastify.queryService.deleteQuestion(
          parseInt(request.params.id, 10),
          parseInt(request.user.sub, 10),
        );

        if (!deleted) {
          return reply.status(404).send({
            success: false,
            error: { message: 'Question not found', code: 'NOT_FOUND' },
          });
        }

        return reply.send({ success: true, data: null });
      } catch (err: unknown) {
        const { code } = err as { code: string };
        if (code === '23503') {
          return reply.status(409).send({
            success: false,
            error: {
              message: 'This question is used in a saved game and cannot be deleted.',
              code: 'QUESTION_IN_USE',
            },
          });
        }
        throw err;
      }
    }
  );
};

export default questionsRoutes;
