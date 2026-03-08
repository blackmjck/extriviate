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

      const conditions = ['q.creator_id = $1'];
      const params: any[] = [request.user.sub];

      if (categoryId) {
        conditions.push(`q.category_id = $${params.length + 1}`);
        params.push(categoryId);
      }

      const where = conditions.join(' AND ');

      const [items, count] = await Promise.all([
        fastify.db.query(
          `SELECT q.id, q.category_id, q.content, q.created_at, q.updated_at,
                  a.id AS answer_id, a.content AS answer_content
           FROM questions q
           LEFT JOIN answers a ON a.question_id = q.id
           WHERE ${where}
           ORDER BY q.created_at DESC
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limit, offset]
        ),
        fastify.db.query(
          `SELECT COUNT(*) FROM questions q WHERE ${where}`,
          params
        ),
      ]);

      const questions = items.rows.map((row: any) => ({
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
        data: {
          items: questions,
          total: parseInt(count.rows[0].count, 10),
          limit,
          offset,
        },
      });
    }
  );

  // GET /api/questions/:id
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const result = await fastify.db.query(
        `SELECT q.id, q.category_id, q.content, q.created_at, q.updated_at,
                a.id AS answer_id, a.content AS answer_content
         FROM questions q
         LEFT JOIN answers a ON a.question_id = q.id
         WHERE q.id = $1 AND q.creator_id = $2`,
        [request.params.id, request.user.sub]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({
          success: false,
          error: { message: 'Question not found', code: 'NOT_FOUND' },
        });
      }

      const row = result.rows[0];
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
      const client = await fastify.db.connect();

      try {
        await client.query('BEGIN');

        // Verify the category belongs to this user
        const catCheck = await client.query(
          'SELECT id FROM categories WHERE id = $1 AND creator_id = $2',
          [categoryId, request.user.sub]
        );
        if (catCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return reply.status(404).send({
            success: false,
            error: { message: 'Category not found', code: 'NOT_FOUND' },
          });
        }

        const questionResult = await client.query(
          `INSERT INTO questions (creator_id, category_id, content)
           VALUES ($1, $2, $3)
           RETURNING id, category_id, content, created_at, updated_at`,
          [request.user.sub, categoryId, JSON.stringify(content)]
        );

        const question = questionResult.rows[0];

        const answerResult = await client.query(
          `INSERT INTO answers (question_id, content)
           VALUES ($1, $2)
           RETURNING id, content`,
          [question.id, JSON.stringify(answer.content)]
        );

        await client.query('COMMIT');

        const answerRow = answerResult.rows[0];
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
      } catch (err: any) {
        await client.query('ROLLBACK');
        if (err.code === '23503') {
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
      const client = await fastify.db.connect();

      try {
        await client.query('BEGIN');

        // Verify ownership
        const existing = await client.query(
          'SELECT id FROM questions WHERE id = $1 AND creator_id = $2',
          [request.params.id, request.user.sub]
        );
        if (existing.rows.length === 0) {
          await client.query('ROLLBACK');
          return reply.status(404).send({
            success: false,
            error: { message: 'Question not found', code: 'NOT_FOUND' },
          });
        }

        if (content) {
          await client.query(
            `UPDATE questions
             SET content = $1, updated_at = NOW()
             WHERE id = $2`,
            [JSON.stringify(content), request.params.id]
          );
        }

        if (answer) {
          await client.query(
            `UPDATE answers
             SET content = $1
             WHERE question_id = $2`,
            [JSON.stringify(answer.content), request.params.id]
          );
        }

        const result = await client.query(
          `SELECT q.id, q.category_id, q.content, q.created_at, q.updated_at,
                  a.id AS answer_id, a.content AS answer_content
           FROM questions q
           LEFT JOIN answers a ON a.question_id = q.id
           WHERE q.id = $1`,
          [request.params.id]
        );

        await client.query('COMMIT');

        const row = result.rows[0];
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
        const result = await fastify.db.query(
          `DELETE FROM questions
           WHERE id = $1 AND creator_id = $2
           RETURNING id`,
          [request.params.id, request.user.sub]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({
            success: false,
            error: { message: 'Question not found', code: 'NOT_FOUND' },
          });
        }

        return reply.send({ success: true, data: null });
      } catch (err: any) {
        if (err.code === '23503') {
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
