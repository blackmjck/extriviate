import type { Pool } from 'pg';
import type {
  GameBoard,
  Game,
  GameCategory,
  GameQuestion,
  Category,
  QuestionWithAnswer,
} from '@extriviate/shared';

// Builds the full game board from the database for a given game.
// Used when creating a session's initial state and for full_state_sync payloads.

export async function buildGameBoard(db: Pool, gameId: number): Promise<GameBoard | null> {
  const gameResult = await db.query(
    `SELECT id, creator_id, title, daily_doubles_enabled, is_published,
            require_question_format, use_ai_evaluation, created_at, updated_at
     FROM games WHERE id = $1`,
    [gameId],
  );

  if (gameResult.rows.length === 0) return null;

  const row = gameResult.rows[0];
  const game: Game = {
    id: row.id,
    creatorId: row.creator_id,
    title: row.title,
    dailyDoublesEnabled: row.daily_doubles_enabled,
    isPublished: row.is_published,
    requireQuestionFormat: row.require_question_format,
    useAiEvaluation: row.use_ai_evaluation,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  const categoriesResult = await db.query(
    `SELECT gc.id, gc.category_id, gc.position,
            c.name AS category_name, c.description AS category_description,
            c.creator_id AS category_creator_id,
            c.created_at AS category_created_at, c.updated_at AS category_updated_at
     FROM game_categories gc
     JOIN categories c ON c.id = gc.category_id
     WHERE gc.game_id = $1
     ORDER BY gc.position`,
    [gameId],
  );

  const questionsResult = await db.query(
    `SELECT gq.id, gq.game_category_id, gq.question_id, gq.row_position,
            gq.point_value, gq.is_daily_double, gq.is_answered,
            q.creator_id AS question_creator_id,
            q.content AS question_content, q.category_id,
            q.created_at AS question_created_at, q.updated_at AS question_updated_at,
            a.id AS answer_id, a.content AS answer_content,
            a.accepted_answers
     FROM game_questions gq
     JOIN questions q ON q.id = gq.question_id
     LEFT JOIN answers a ON a.question_id = q.id
     WHERE gq.game_id = $1
     ORDER BY gq.row_position`,
    [gameId],
  );

  // Group questions by game_category_id
  const questionsByCategory = new Map<number, GameQuestion[]>();
  for (const qRow of questionsResult.rows) {
    const list = questionsByCategory.get(qRow.game_category_id) ?? [];

    const question: QuestionWithAnswer = {
      id: qRow.question_id,
      creatorId: qRow.question_creator_id,
      categoryId: qRow.category_id,
      content: qRow.question_content,
      createdAt: qRow.question_created_at,
      updatedAt: qRow.question_updated_at,
      answer: {
        id: qRow.answer_id,
        questionId: qRow.question_id,
        content: qRow.answer_content,
        acceptedAnswers: qRow.accepted_answers ?? [],
      },
    };

    list.push({
      id: qRow.id,
      gameId,
      gameCategoryId: qRow.game_category_id,
      questionId: qRow.question_id,
      rowPosition: qRow.row_position,
      pointValue: qRow.point_value,
      isDailyDouble: qRow.is_daily_double,
      isAnswered: qRow.is_answered,
      question,
    });

    questionsByCategory.set(qRow.game_category_id, list);
  }

  const categories: Array<GameCategory & { questions: GameQuestion[] }> = categoriesResult.rows.map(
    (cRow: any) => {
      const category: Category = {
        id: cRow.category_id,
        creatorId: cRow.category_creator_id,
        name: cRow.category_name,
        description: cRow.category_description,
        createdAt: cRow.category_created_at,
        updatedAt: cRow.category_updated_at,
      };

      return {
        id: cRow.id,
        gameId,
        categoryId: cRow.category_id,
        position: cRow.position,
        category,
        questions: questionsByCategory.get(cRow.id) ?? [],
      };
    },
  );

  return { game, categories };
}

// Extracts all unanswered point values from a game board.
// Used to calculate the maximum daily double wager.
export function extractBoardValues(board: GameBoard): number[] {
  const values: number[] = [];
  for (const cat of board.categories) {
    for (const q of cat.questions) {
      if (!q.isAnswered) {
        values.push(q.pointValue);
      }
    }
  }
  return values;
}
