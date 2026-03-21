import type {
  ContentBlock,
  GameBoard,
  Game,
  GameQuestion,
  Category,
  QuestionByCategory,
  QuestionWithAnswer,
} from '@extriviate/shared';
import type { QueryService } from './query.service.js';

// Builds the full game board from the database for a given game.
// Used when creating a session's initial state and for full_state_sync payloads.

export async function buildGameBoard(qs: QueryService, gameId: number): Promise<GameBoard | null> {
  const gameRow = await qs.findGameById(gameId);
  if (!gameRow) return null;

  const game: Game = {
    id: gameRow.id,
    creatorId: gameRow.creator_id,
    title: gameRow.title,
    dailyDoublesEnabled: gameRow.daily_doubles_enabled,
    isPublished: gameRow.is_published,
    requireQuestionFormat: gameRow.require_question_format,
    useAiEvaluation: gameRow.use_ai_evaluation,
    createdAt: gameRow.created_at,
    updatedAt: gameRow.updated_at,
  };

  const [categoryRows, questionRows] = await Promise.all([
    qs.listGameCategoriesWithCategoryData(gameId),
    qs.listGameQuestionsWithData(gameId),
  ]);

  // Group questions by game_category_id
  const questionsByCategory = new Map<number, GameQuestion[]>();
  for (const qRow of questionRows) {
    const list = questionsByCategory.get(qRow.game_category_id) ?? [];

    const question: QuestionWithAnswer = {
      id: qRow.question_id,
      creatorId: qRow.question_creator_id,
      categoryId: qRow.category_id,
      content: qRow.question_content as ContentBlock[],
      createdAt: qRow.question_created_at,
      updatedAt: qRow.question_updated_at,
      answer: {
        id: qRow.answer_id as number,
        questionId: qRow.question_id,
        content: qRow.answer_content as ContentBlock[],
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

  const categories: QuestionByCategory[] = categoryRows.map((cRow) => {
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
  });

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
