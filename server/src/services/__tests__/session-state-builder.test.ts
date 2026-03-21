import { describe, test, expect, vi } from 'vitest';
import { buildGameBoard, extractBoardValues } from '../session-state-builder.js';
import type { QueryService } from '../query.service.js';
import type { GameBoard } from '@extriviate/shared';

// ---- extractBoardValues ----

describe('extractBoardValues', () => {
  function makeBoard(questions: Array<{ pointValue: number; isAnswered: boolean }>): GameBoard {
    return {
      game: {
        id: 1,
        creatorId: 1,
        title: 'T',
        dailyDoublesEnabled: false,
        isPublished: true,
        requireQuestionFormat: false,
        useAiEvaluation: false,
        createdAt: '',
        updatedAt: '',
      },
      categories: [
        {
          id: 1,
          gameId: 1,
          categoryId: 1,
          position: 1,
          category: { id: 1, creatorId: 1, name: 'Cat', description: null, createdAt: '', updatedAt: '' },
          questions: questions.map((q, i) => ({
            id: i + 1,
            gameId: 1,
            gameCategoryId: 1,
            questionId: i + 1,
            rowPosition: i + 1,
            pointValue: q.pointValue,
            isDailyDouble: false,
            isAnswered: q.isAnswered,
            question: {
              id: i + 1,
              creatorId: 1,
              categoryId: 1,
              content: [],
              createdAt: '',
              updatedAt: '',
              answer: { id: i + 1, questionId: i + 1, content: [], acceptedAnswers: [] },
            },
          })),
        },
      ],
    };
  }

  test('returns all point values when none answered', () => {
    const board = makeBoard([
      { pointValue: 200, isAnswered: false },
      { pointValue: 400, isAnswered: false },
      { pointValue: 600, isAnswered: false },
    ]);

    expect(extractBoardValues(board)).toEqual([200, 400, 600]);
  });

  test('excludes answered questions', () => {
    const board = makeBoard([
      { pointValue: 200, isAnswered: true },
      { pointValue: 400, isAnswered: false },
      { pointValue: 600, isAnswered: true },
    ]);

    expect(extractBoardValues(board)).toEqual([400]);
  });

  test('returns empty array when all answered', () => {
    const board = makeBoard([
      { pointValue: 200, isAnswered: true },
      { pointValue: 400, isAnswered: true },
    ]);

    expect(extractBoardValues(board)).toEqual([]);
  });

  test('returns empty array when board has no categories', () => {
    const board: GameBoard = {
      game: {
        id: 1,
        creatorId: 1,
        title: 'T',
        dailyDoublesEnabled: false,
        isPublished: true,
        requireQuestionFormat: false,
        useAiEvaluation: false,
        createdAt: '',
        updatedAt: '',
      },
      categories: [],
    };

    expect(extractBoardValues(board)).toEqual([]);
  });

  test('collects values across multiple categories', () => {
    const game = {
      id: 1, creatorId: 1, title: 'T', dailyDoublesEnabled: false,
      isPublished: true, requireQuestionFormat: false, useAiEvaluation: false,
      createdAt: '', updatedAt: '',
    };
    const makeCategory = (id: number, pointValues: number[]) => ({
      id,
      gameId: 1,
      categoryId: id,
      position: id,
      category: { id, creatorId: 1, name: `Cat ${id}`, description: null, createdAt: '', updatedAt: '' },
      questions: pointValues.map((pv, i) => ({
        id: id * 10 + i,
        gameId: 1,
        gameCategoryId: id,
        questionId: id * 10 + i,
        rowPosition: i + 1,
        pointValue: pv,
        isDailyDouble: false,
        isAnswered: false,
        question: {
          id: id * 10 + i, creatorId: 1, categoryId: id, content: [], createdAt: '', updatedAt: '',
          answer: { id: id * 10 + i, questionId: id * 10 + i, content: [], acceptedAnswers: [] },
        },
      })),
    });

    const board: GameBoard = {
      game,
      categories: [
        makeCategory(1, [200, 400]),
        makeCategory(2, [600, 800]),
      ],
    };

    const values = extractBoardValues(board);
    expect(values.sort((a, b) => a - b)).toEqual([200, 400, 600, 800]);
  });
});

// ---- buildGameBoard ----

// Creates a mock QueryService whose three methods return the given fixture data.
function makeQs(
  gameRow: object | null,
  categoryRows: object[],
  questionRows: object[],
): QueryService {
  return {
    findGameById: vi.fn().mockResolvedValue(gameRow),
    listGameCategoriesWithCategoryData: vi.fn().mockResolvedValue(categoryRows),
    listGameQuestionsWithData: vi.fn().mockResolvedValue(questionRows),
  } as unknown as QueryService;
}

// Minimal DB row fixtures
const gameRow = {
  id: 1,
  creator_id: 10,
  title: 'Test Game',
  daily_doubles_enabled: false,
  is_published: true,
  require_question_format: false,
  use_ai_evaluation: false,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

const categoryRow = {
  id: 100,
  game_id: 1,
  category_id: 50,
  position: 1,
  created_at: '2024-01-01',
  category_name: 'Science',
  category_description: null,
  category_creator_id: 10,
  category_created_at: '2024-01-01',
  category_updated_at: '2024-01-01',
};

const questionRow = {
  id: 200,
  game_id: 1,
  game_category_id: 100,
  question_id: 300,
  row_position: 1,
  point_value: 200,
  is_daily_double: false,
  is_answered: false,
  question_creator_id: 10,
  question_content: [{ type: 'text', value: 'Q content' }],
  category_id: 50,
  question_created_at: '2024-01-01',
  question_updated_at: '2024-01-01',
  answer_id: 400,
  answer_content: [{ type: 'text', value: 'A content' }],
  accepted_answers: ['alt answer'],
};

describe('buildGameBoard', () => {
  test('returns null when game not found', async () => {
    const qs = makeQs(null, [], []);
    const result = await buildGameBoard(qs, 999);
    expect(result).toBeNull();
  });

  test('returns GameBoard with correct game fields', async () => {
    const qs = makeQs(gameRow, [categoryRow], [questionRow]);
    const board = await buildGameBoard(qs, 1);

    expect(board).not.toBeNull();
    expect(board!.game.id).toBe(1);
    expect(board!.game.title).toBe('Test Game');
    expect(board!.game.creatorId).toBe(10);
    expect(board!.game.requireQuestionFormat).toBe(false);
  });

  test('maps categories correctly', async () => {
    const qs = makeQs(gameRow, [categoryRow], [questionRow]);
    const board = await buildGameBoard(qs, 1);

    expect(board!.categories).toHaveLength(1);
    expect(board!.categories[0].id).toBe(100);
    expect(board!.categories[0].category.name).toBe('Science');
    expect(board!.categories[0].position).toBe(1);
  });

  test('maps questions to correct categories', async () => {
    const qs = makeQs(gameRow, [categoryRow], [questionRow]);
    const board = await buildGameBoard(qs, 1);

    const questions = board!.categories[0].questions;
    expect(questions).toHaveLength(1);
    expect(questions[0].pointValue).toBe(200);
    expect(questions[0].isDailyDouble).toBe(false);
    expect(questions[0].isAnswered).toBe(false);
  });

  test('maps question content and answer', async () => {
    const qs = makeQs(gameRow, [categoryRow], [questionRow]);
    const board = await buildGameBoard(qs, 1);

    const q = board!.categories[0].questions[0];
    expect(q.question.content).toEqual([{ type: 'text', value: 'Q content' }]);
    expect(q.question.answer.content).toEqual([{ type: 'text', value: 'A content' }]);
    expect(q.question.answer.acceptedAnswers).toEqual(['alt answer']);
  });

  test('null accepted_answers defaults to empty array', async () => {
    const rowWithNullAccepted = { ...questionRow, accepted_answers: null };
    const qs = makeQs(gameRow, [categoryRow], [rowWithNullAccepted]);
    const board = await buildGameBoard(qs, 1);

    expect(board!.categories[0].questions[0].question.answer.acceptedAnswers).toEqual([]);
  });

  test('returns empty categories array when game has no categories', async () => {
    const qs = makeQs(gameRow, [], []);
    const board = await buildGameBoard(qs, 1);

    expect(board!.categories).toHaveLength(0);
  });

  test('questions not matching any category are not orphaned into wrong category', async () => {
    const orphanQuestionRow = { ...questionRow, game_category_id: 999 };
    const qs = makeQs(gameRow, [categoryRow], [orphanQuestionRow]);
    const board = await buildGameBoard(qs, 1);

    // Category 100 should have 0 questions since orphan belongs to category 999
    expect(board!.categories[0].questions).toHaveLength(0);
  });

  test('multiple questions grouped under correct category', async () => {
    const q2 = { ...questionRow, id: 201, question_id: 301, row_position: 2, point_value: 400 };
    const qs = makeQs(gameRow, [categoryRow], [questionRow, q2]);
    const board = await buildGameBoard(qs, 1);

    expect(board!.categories[0].questions).toHaveLength(2);
    expect(board!.categories[0].questions.map((q) => q.pointValue)).toEqual([200, 400]);
  });

  test('calls findGameById, listGameCategoriesWithCategoryData, and listGameQuestionsWithData', async () => {
    const qs = makeQs(gameRow, [categoryRow], [questionRow]);
    await buildGameBoard(qs, 1);

    expect(qs.findGameById).toHaveBeenCalledWith(1);
    expect(qs.listGameCategoriesWithCategoryData).toHaveBeenCalledWith(1);
    expect(qs.listGameQuestionsWithData).toHaveBeenCalledWith(1);
  });
});
