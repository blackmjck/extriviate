import { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../hooks/auth.hook.js';
import type {
  CreateGameRequest,
  UpdateGameRequest,
  AssignGameCategoryRequest,
  PaginationParams,
} from '@extriviate/shared';
import {
  GAME_CATEGORY_COUNT,
  GAME_QUESTION_ROWS,
  DAILY_DOUBLE_MAX,
  MAX_GAME_TITLE_LENGTH,
} from '@extriviate/shared';

const gamesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/games
  // Returns games belonging to the authenticated user.
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
          `SELECT id, title, daily_doubles_enabled, is_published, created_at, updated_at
           FROM games
           WHERE creator_id = $1
           ORDER BY updated_at DESC
           LIMIT $2 OFFSET $3`,
          [request.user.sub, limit, offset]
        ),
        fastify.db.query('SELECT COUNT(*) FROM games WHERE creator_id = $1', [
          request.user.sub,
        ]),
      ]);

      const games = items.rows.map((row: any) => ({
        id: row.id,
        title: row.title,
        dailyDoublesEnabled: row.daily_doubles_enabled,
        isPublished: row.is_published,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      return reply.send({
        success: true,
        data: {
          items: games,
          total: parseInt(count.rows[0].count, 10),
          limit,
          offset,
        },
      });
    }
  );

  // GET /api/games/:id
  // Returns the full game board with categories, questions, and answers.
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const gameResult = await fastify.db.query(
        `SELECT id, title, daily_doubles_enabled, is_published, created_at, updated_at
         FROM games
         WHERE id = $1 AND creator_id = $2`,
        [request.params.id, request.user.sub]
      );

      if (gameResult.rows.length === 0) {
        return reply.status(404).send({
          success: false,
          error: { message: 'Game not found', code: 'NOT_FOUND' },
        });
      }

      const gameRow = gameResult.rows[0];
      const game = {
        id: gameRow.id,
        creatorId: parseInt(request.user.sub, 10),
        title: gameRow.title,
        dailyDoublesEnabled: gameRow.daily_doubles_enabled,
        isPublished: gameRow.is_published,
        createdAt: gameRow.created_at,
        updatedAt: gameRow.updated_at,
      };

      // Fetch categories with their questions and answers
      const categoriesResult = await fastify.db.query(
        `SELECT gc.id, gc.category_id, gc.position,
                c.name AS category_name, c.description AS category_description,
                c.created_at AS category_created_at, c.updated_at AS category_updated_at
         FROM game_categories gc
         JOIN categories c ON c.id = gc.category_id
         WHERE gc.game_id = $1
         ORDER BY gc.position`,
        [request.params.id]
      );

      const questionsResult = await fastify.db.query(
        `SELECT gq.id, gq.game_category_id, gq.question_id, gq.row_position,
                gq.point_value, gq.is_daily_double, gq.is_answered,
                q.content AS question_content, q.category_id, q.created_at AS question_created_at,
                q.updated_at AS question_updated_at,
                a.id AS answer_id, a.content AS answer_content
         FROM game_questions gq
         JOIN questions q ON q.id = gq.question_id
         LEFT JOIN answers a ON a.question_id = q.id
         WHERE gq.game_id = $1
         ORDER BY gq.row_position`,
        [request.params.id]
      );

      // Group questions by game_category_id
      const questionsByCategory = new Map<number, any[]>();
      for (const row of questionsResult.rows) {
        const list = questionsByCategory.get(row.game_category_id) ?? [];
        list.push({
          id: row.id,
          gameId: parseInt(request.params.id, 10),
          gameCategoryId: row.game_category_id,
          questionId: row.question_id,
          rowPosition: row.row_position,
          pointValue: row.point_value,
          isDailyDouble: row.is_daily_double,
          isAnswered: row.is_answered,
          question: {
            id: row.question_id,
            creatorId: parseInt(request.user.sub, 10),
            categoryId: row.category_id,
            content: row.question_content,
            createdAt: row.question_created_at,
            updatedAt: row.question_updated_at,
            answer: row.answer_id
              ? { id: row.answer_id, questionId: row.question_id, content: row.answer_content }
              : null,
          },
        });
        questionsByCategory.set(row.game_category_id, list);
      }

      const categories = categoriesResult.rows.map((row: any) => ({
        id: row.id,
        gameId: parseInt(request.params.id, 10),
        categoryId: row.category_id,
        position: row.position,
        category: {
          id: row.category_id,
          creatorId: parseInt(request.user.sub, 10),
          name: row.category_name,
          description: row.category_description,
          createdAt: row.category_created_at,
          updatedAt: row.category_updated_at,
        },
        questions: questionsByCategory.get(row.id) ?? [],
      }));

      return reply.send({
        success: true,
        data: { game, categories },
      });
    }
  );

  // POST /api/games
  fastify.post<{ Body: CreateGameRequest }>(
    '/',
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string', minLength: 1, maxLength: MAX_GAME_TITLE_LENGTH },
            dailyDoublesEnabled: { type: 'boolean', default: true },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { title, dailyDoublesEnabled = true } = request.body;

      const result = await fastify.db.query(
        `INSERT INTO games (creator_id, title, daily_doubles_enabled)
         VALUES ($1, $2, $3)
         RETURNING id, title, daily_doubles_enabled, is_published, created_at, updated_at`,
        [request.user.sub, title, dailyDoublesEnabled]
      );

      const row = result.rows[0];
      return reply.status(201).send({
        success: true,
        data: {
          id: row.id,
          title: row.title,
          dailyDoublesEnabled: row.daily_doubles_enabled,
          isPublished: row.is_published,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      });
    }
  );

  // PATCH /api/games/:id
  fastify.patch<{ Params: { id: string }; Body: UpdateGameRequest }>(
    '/:id',
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: 'object',
          minProperties: 1,
          properties: {
            title: { type: 'string', minLength: 1, maxLength: MAX_GAME_TITLE_LENGTH },
            dailyDoublesEnabled: { type: 'boolean' },
            isPublished: { type: 'boolean' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { title, dailyDoublesEnabled, isPublished } = request.body;

      const result = await fastify.db.query(
        `UPDATE games
         SET title = COALESCE($1, title),
             daily_doubles_enabled = COALESCE($2, daily_doubles_enabled),
             is_published = COALESCE($3, is_published),
             updated_at = NOW()
         WHERE id = $4 AND creator_id = $5
         RETURNING id, title, daily_doubles_enabled, is_published, created_at, updated_at`,
        [
          title ?? null,
          dailyDoublesEnabled ?? null,
          isPublished ?? null,
          request.params.id,
          request.user.sub,
        ]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({
          success: false,
          error: { message: 'Game not found', code: 'NOT_FOUND' },
        });
      }

      const row = result.rows[0];
      return reply.send({
        success: true,
        data: {
          id: row.id,
          title: row.title,
          dailyDoublesEnabled: row.daily_doubles_enabled,
          isPublished: row.is_published,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      });
    }
  );

  // PUT /api/games/:id/board
  // Replaces the entire game board (categories + questions) in one transaction.
  // This is an idempotent full replacement — all existing board data is deleted first.
  fastify.put<{ Params: { id: string }; Body: { categories: AssignGameCategoryRequest[] } }>(
    '/:id/board',
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: 'object',
          required: ['categories'],
          properties: {
            categories: {
              type: 'array',
              minItems: GAME_CATEGORY_COUNT,
              maxItems: GAME_CATEGORY_COUNT,
              items: {
                type: 'object',
                required: ['categoryId', 'position', 'questions'],
                properties: {
                  categoryId: { type: 'integer' },
                  position: { type: 'integer', minimum: 1, maximum: GAME_CATEGORY_COUNT },
                  questions: {
                    type: 'array',
                    minItems: GAME_QUESTION_ROWS,
                    maxItems: GAME_QUESTION_ROWS,
                    items: {
                      type: 'object',
                      required: ['questionId', 'rowPosition', 'pointValue'],
                      properties: {
                        questionId: { type: 'integer' },
                        rowPosition: { type: 'integer', minimum: 1, maximum: GAME_QUESTION_ROWS },
                        pointValue: { type: 'integer', minimum: 1 },
                        isDailyDouble: { type: 'boolean', default: false },
                      },
                    },
                  },
                },
              },
            },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { categories } = request.body;
      const client = await fastify.db.connect();

      try {
        await client.query('BEGIN');

        // Verify game ownership
        const gameCheck = await client.query(
          'SELECT id, daily_doubles_enabled FROM games WHERE id = $1 AND creator_id = $2',
          [request.params.id, request.user.sub]
        );
        if (gameCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return reply.status(404).send({
            success: false,
            error: { message: 'Game not found', code: 'NOT_FOUND' },
          });
        }

        const game = gameCheck.rows[0];

        // Validate daily double count
        if (game.daily_doubles_enabled) {
          let ddCount = 0;
          for (const cat of categories) {
            for (const q of cat.questions) {
              if (q.isDailyDouble) ddCount++;
            }
          }
          if (ddCount > DAILY_DOUBLE_MAX) {
            await client.query('ROLLBACK');
            return reply.status(400).send({
              success: false,
              error: {
                message: `Maximum ${DAILY_DOUBLE_MAX} daily doubles allowed`,
                code: 'TOO_MANY_DAILY_DOUBLES',
              },
            });
          }
        }

        // Validate unique positions
        const positions = new Set(categories.map((c) => c.position));
        if (positions.size !== GAME_CATEGORY_COUNT) {
          await client.query('ROLLBACK');
          return reply.status(400).send({
            success: false,
            error: { message: 'Category positions must be unique (1-6)', code: 'INVALID_POSITIONS' },
          });
        }

        // Clear existing board data (game_questions has FK to game_categories,
        // so delete questions first)
        await client.query('DELETE FROM game_questions WHERE game_id = $1', [request.params.id]);
        await client.query('DELETE FROM game_categories WHERE game_id = $1', [request.params.id]);

        // Insert categories and questions
        for (const cat of categories) {
          const catResult = await client.query(
            `INSERT INTO game_categories (game_id, category_id, position)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [request.params.id, cat.categoryId, cat.position]
          );
          const gameCategoryId = catResult.rows[0].id;

          for (const q of cat.questions) {
            await client.query(
              `INSERT INTO game_questions (game_id, game_category_id, question_id, row_position, point_value, is_daily_double)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                request.params.id,
                gameCategoryId,
                q.questionId,
                q.rowPosition,
                q.pointValue,
                q.isDailyDouble ?? false,
              ]
            );
          }
        }

        await client.query('COMMIT');

        return reply.send({ success: true, data: null });
      } catch (err: any) {
        await client.query('ROLLBACK');
        if (err.code === '23503') {
          return reply.status(404).send({
            success: false,
            error: {
              message: 'One or more referenced categories or questions do not exist',
              code: 'REFERENCE_NOT_FOUND',
            },
          });
        }
        if (err.code === '23505') {
          return reply.status(409).send({
            success: false,
            error: {
              message: 'Duplicate position detected',
              code: 'DUPLICATE_POSITION',
            },
          });
        }
        throw err;
      } finally {
        client.release();
      }
    }
  );

  // DELETE /api/games/:id
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const client = await fastify.db.connect();

      try {
        await client.query('BEGIN');

        // Delete board data first (FK ordering)
        await client.query('DELETE FROM game_questions WHERE game_id = $1', [request.params.id]);
        await client.query('DELETE FROM game_categories WHERE game_id = $1', [request.params.id]);

        const result = await client.query(
          'DELETE FROM games WHERE id = $1 AND creator_id = $2 RETURNING id',
          [request.params.id, request.user.sub]
        );

        if (result.rows.length === 0) {
          await client.query('ROLLBACK');
          return reply.status(404).send({
            success: false,
            error: { message: 'Game not found', code: 'NOT_FOUND' },
          });
        }

        await client.query('COMMIT');
        return reply.send({ success: true, data: null });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
  );
};

export default gamesRoutes;
