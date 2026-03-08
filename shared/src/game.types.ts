import type { ContentBlock } from "./upload.types.ts";

// ---- Categories ----

export interface Category {
  id: number;
  creatorId: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryRequest {
  name: string;
  description?: string;
}

export interface UpdateCategoryRequest {
  name?: string;
  description?: string;
}

// ---- Questions & Answers ----

// A question belongs to a category and contains rich content
export interface Question {
  id: number;
  creatorId: number;
  categoryId: number;
  content: ContentBlock[]; // array of content blocks - text, image, or video
  createdAt: string;
  updatedAt: string;
}

// An answer is always associated with exactly one question
export interface Answer {
  id: number;
  questionId: number;
  content: ContentBlock[]; // same rich content model as questions
  acceptedAnswers: string[]; // alternative accepted answer strings for fuzzy matching
}

export interface CreateQuestionRequest {
  categoryId: number;
  content: ContentBlock[];
  answer: {
    content: ContentBlock[];
    acceptedAnswers?: string[];
  };
}

export interface UpdateQuestionRequest {
  content?: ContentBlock[];
  answer?: {
    content: ContentBlock[];
    acceptedAnswers?: string[];
  };
}

// A question bundled with its answer - used when loading the creator's editor view.
export interface QuestionWithAnswer extends Question {
  answer: Answer;
}

// ---- Games ----

export interface Game {
  id: number;
  creatorId: number;
  title: string;
  dailyDoublesEnabled: boolean;
  isPublished: boolean;
  requireQuestionFormat: boolean; // "What is…" / "Who is…" required
  useAiEvaluation: boolean; // always false for now — AI layer deferred
  createdAt: string;
  updatedAt: string;
}

// A game category slot - one of the six columns in the game board.
// position is 1-6, enforced by the database CHECK constraint.
export interface GameCategory {
  id: number;
  gameId: number;
  categoryId: number;
  position: number; // 1-6
  category: Category; // always populated when sending to client
}

// A single question slot on the game board
// rowPosition is 1-5, pointValue is always positive
export interface GameQuestion {
  id: number;
  gameId: number;
  gameCategoryId: number;
  questionId: number;
  rowPosition: number; // 1-5
  pointValue: number; // e.g. 200, 400, 600, 800, 1000
  isDailyDouble: boolean;
  isAnswered: boolean;
  question: QuestionWithAnswer;
}

// The full game board - all six categories with their five questions each
// This is the primary shape sent to the client when loading a game to play or edit
export interface GameBoard {
  game: Game;
  categories: Array<
    GameCategory & {
      questions: GameQuestion[]; // always exactly 5, ordered by rowPosition
    }
  >;
}

export interface CreateGameRequest {
  title: string;
  dailyDoublesEnabled?: boolean;
  requireQuestionFormat?: boolean;
  useAiEvaluation?: boolean;
}

export interface UpdateGameRequest {
  title?: string;
  dailyDoublesEnabled?: boolean;
  isPublished?: boolean;
  requireQuestionFormat?: boolean;
  useAiEvaluation?: boolean;
}

// Used when assembling the game board during game creation
// Specifies which category goes in which column, which questions to use,
// their row order, point values, and daily double assignment.
export interface AssignGameCategoryRequest {
  categoryId: number;
  position: number; // 1-6
  questions: Array<{
    questionId: number;
    rowPosition: number; // 1-5
    pointValue: number;
    isDailyDouble?: boolean;
  }>;
}
