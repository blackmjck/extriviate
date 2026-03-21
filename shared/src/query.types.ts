import type { SessionStatus } from './session.types.js';
import type { SessionMode } from './game-session.types.js';
import type { UserRole } from './user.types.js';

export interface DbAnswer {
  id: number;
  question_id: number;
  content: unknown;           // JSONB — cast to ContentBlock[] at call site
  accepted_answers: string[];
  created_at: string;
}

export interface DbCategory {
  id: number;
  creator_id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbGame {
  id: number;
  creator_id: number;
  title: string;
  daily_doubles_enabled: boolean;
  is_published: boolean;
  require_question_format: boolean;
  use_ai_evaluation: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbGameCategory {
  id: number;
  game_id: number;
  category_id: number;
  position: number;
  created_at: string;
}

export interface DbGameCategoryRow extends DbGameCategory {
  category_name: string;
  category_description: string | null;
  category_creator_id: number;
  category_created_at: string;
  category_updated_at: string;
}

export interface DbGameListItem {
  id: number;
  title: string;
  daily_doubles_enabled: boolean;
  is_published: boolean;
  is_complete: boolean;   // computed boolean from SELECT
  created_at: string;
  updated_at: string;
}

export interface DbGameQuestion {
  id: number;
  game_id: number;
  game_category_id: number;
  question_id: number;
  row_position: number;
  point_value: number;
  is_daily_double: boolean;
  is_answered: boolean;
}

export interface DbGameQuestionRow extends DbGameQuestion {
  question_creator_id: number;
  question_content: unknown;        // JSONB
  category_id: number;
  question_created_at: string;
  question_updated_at: string;
  answer_id: number | null;
  answer_content: unknown | null;   // JSONB
  accepted_answers: string[] | null;
}

export interface DbGameSession {
  id: number;
  game_id: number;
  host_id: number;
  name: string;
  join_code: string;
  status: SessionStatus;
  mode: SessionMode;
  turn_based: boolean;
  played_at: string;
  ended_at: string | null;
  created_at: string;
}

export interface DbPasswordResetToken {
  id: string;
  user_id: number;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: string;
}

export interface DbPublicUser {
  id: number;
  display_name: string;
  role: UserRole;
  created_at: string;
}

export interface DbQuestion {
  id: number;
  creator_id: number;
  category_id: number;
  content: unknown;   // JSONB
  created_at: string;
  updated_at: string;
}

export interface DbQuestionWithAnswer extends DbQuestion {
  answer_id: number | null;
  answer_content: unknown | null;   // JSONB
}

export interface DbSessionPlayer {
  id: number;
  session_id: number;
  user_id: number | null;
  display_name: string;
  final_score: number;
  rank: number | null;
  created_at: string;
}

export interface DbUpload {
  id: number;
  owner_id: number;
  key: string;
  public_url: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

export interface DbUser {
  id: number;
  email: string;
  display_name: string;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  token_version: number;
}

export interface DbUserStats {
  games_created: string;        // pg returns bigint COUNT as string
  categories_created: string;
  questions_created: string;
  sessions_played: string;
}
