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
      const creatorId = parseInt(request.user.sub, 10);

      const [rows, total] = await Promise.all([
        fastify.queryService.listGames(creatorId, limit, offset),
        fastify.queryService.countGames(creatorId),
      ]);

      const games = rows.map((row) => ({
        id: row.id,
        title: row.title,
        dailyDoublesEnabled: row.daily_doubles_enabled,
        isPublished: row.is_published,
        isComplete: row.is_complete,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      return reply.send({
        success: true,
        data: { items: games, total, limit, offset },
      });
    }
  );

  // GET /api/games/:id
  // Returns the full game board with categories, questions, and answers.
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const gameId = parseInt(request.params.id, 10);
      const creatorId = parseInt(request.user.sub, 10);

      const gameRow = await fastify.queryService.findGameForOwner(gameId, creatorId);

      if (!gameRow) {
        return reply.status(404).send({
          success: false,
          error: { message: 'Game not found', code: 'NOT_FOUND' },
        });
      }

      const game = {
        id: gameRow.id,
        creatorId: gameRow.creator_id,
        title: gameRow.title,
        dailyDoublesEnabled: gameRow.daily_doubles_enabled,
        isPublished: gameRow.is_published,
        createdAt: gameRow.created_at,
        updatedAt: gameRow.updated_at,
      };

      // Fetch categories with their questions and answers
      const [categoryRows, questionRows] = await Promise.all([
        fastify.queryService.listGameCategoriesWithCategoryData(gameId),
        fastify.queryService.listGameQuestionsWithData(gameId),
      ]);

      // Group questions by game_category_id
      const questionsByCategory = new Map<number, any[]>();
      for (const row of questionRows) {
        const list = questionsByCategory.get(row.game_category_id) ?? [];
        list.push({
          id: row.id,
          gameId,
          gameCategoryId: row.game_category_id,
          questionId: row.question_id,
          rowPosition: row.row_position,
          pointValue: row.point_value,
          isDailyDouble: row.is_daily_double,
          isAnswered: row.is_answered,
          question: {
            id: row.question_id,
            creatorId: row.question_creator_id,
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

      const categories = categoryRows.map((row) => ({
        id: row.id,
        gameId,
        categoryId: row.category_id,
        position: row.position,
        category: {
          id: row.category_id,
          creatorId: row.category_creator_id,
          name: row.category_name,
          description: row.category_description,
          createdAt: row.category_created_at,
          updatedAt: row.category_updated_at,
        },
        questions: questionsByCategory.get(row.id) ?? [],
      }));

      const isComplete =
        game.title.trim().length > 0 &&
        categories.length === GAME_CATEGORY_COUNT &&
        categories.every(
          (c) =>
            c.questions.length === GAME_QUESTION_ROWS &&
            c.questions.every((q: any) => q.pointValue > 0)
        );

      return reply.send({
        success: true,
        data: { game: { ...game, isComplete }, categories },
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

      const row = await fastify.queryService.createGame(
        parseInt(request.user.sub, 10),
        title,
        dailyDoublesEnabled,
      );

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
      const gameId = parseInt(request.params.id, 10);
      const creatorId = parseInt(request.user.sub, 10);

      // When publishing, verify the game is complete before allowing it.
      if (isPublished === true) {
        const totalQuestions = GAME_CATEGORY_COUNT * GAME_QUESTION_ROWS;
        const [cats, qs, gameRow] = await Promise.all([
          fastify.queryService.countGameCategories(gameId),
          fastify.queryService.countGameQuestionsWithPointValue(gameId),
          fastify.queryService.findGameForOwner(gameId, creatorId),
        ]);

        if (!gameRow) {
          return reply.status(404).send({
            success: false,
            error: { message: 'Game not found', code: 'NOT_FOUND' },
          });
        }

        const effectiveTitle = (title ?? gameRow.title ?? '').trim();

        if (!effectiveTitle || cats < GAME_CATEGORY_COUNT || qs < totalQuestions) {
          return reply.status(400).send({
            success: false,
            error: {
              message:
                'Game must have a title, all 6 categories, and all 30 questions with point values before publishing.',
              code: 'GAME_NOT_COMPLETE',
            },
          });
        }
      }

      const row = await fastify.queryService.updateGame(
        gameId,
        creatorId,
        title ?? null,
        dailyDoublesEnabled ?? null,
        isPublished ?? null,
      );

      if (!row) {
        return reply.status(404).send({
          success: false,
          error: { message: 'Game not found', code: 'NOT_FOUND' },
        });
      }

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
      const gameId = parseInt(request.params.id, 10);
      const creatorId = parseInt(request.user.sub, 10);
      const client = await fastify.db.connect();

      try {
        await client.query('BEGIN');

        // Verify game ownership
        const game = await fastify.queryService.findGameForOwner(gameId, creatorId);
        if (!game) {
          await client.query('ROLLBACK');
          return reply.status(404).send({
            success: false,
            error: { message: 'Game not found', code: 'NOT_FOUND' },
          });
        }

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
                message: `Maximum ${DAILY_DOUBLE_MAX} double downs allowed`,
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
            error: {
              message: 'Category positions must be unique (1-6)',
              code: 'INVALID_POSITIONS',
            },
          });
        }

        // Clear existing board data (game_questions has FK to game_categories,
        // so deleteGameBoard removes questions first)
        await fastify.queryService.deleteGameBoard(gameId, client);

        // Insert categories and questions
        for (const cat of categories) {
          const gc = await fastify.queryService.insertGameCategory(
            gameId, cat.categoryId, cat.position, client,
          );

          for (const q of cat.questions) {
            await fastify.queryService.insertGameQuestion(
              gameId, gc.id, q.questionId, q.rowPosition, q.pointValue, q.isDailyDouble ?? false, client,
            );
          }
        }

        await client.query('COMMIT');

        return reply.send({ success: true, data: null });
      } catch (err: unknown) {
        await client.query('ROLLBACK');
        const { code } = err as { code: string };
        if (code === '23503') {
          return reply.status(404).send({
            success: false,
            error: {
              message: 'One or more referenced categories or questions do not exist',
              code: 'REFERENCE_NOT_FOUND',
            },
          });
        }
        if (code === '23505') {
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
      const gameId = parseInt(request.params.id, 10);
      const creatorId = parseInt(request.user.sub, 10);
      const client = await fastify.db.connect();

      try {
        await client.query('BEGIN');

        // Delete board data first (FK ordering: questions before categories before game)
        await fastify.queryService.deleteGameBoard(gameId, client);

        const deleted = await fastify.queryService.deleteGame(gameId, creatorId, client);

        if (!deleted) {
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
