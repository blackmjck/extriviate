-- Extriviate — Initial Database Schema
-- Run against a fresh PostgreSQL database.
-- Requires PostgreSQL 14+ for standard SQL features used here.

BEGIN;

-- ============================================================
-- 1. users
-- ============================================================
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'creator',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT users_role_check CHECK (role IN ('creator', 'admin'))
);

-- ============================================================
-- 2. categories
-- ============================================================
CREATE TABLE categories (
  id          SERIAL PRIMARY KEY,
  creator_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT categories_unique_name_per_creator UNIQUE (creator_id, name)
);

CREATE INDEX idx_categories_creator ON categories (creator_id);

-- ============================================================
-- 3. questions
-- ============================================================
CREATE TABLE questions (
  id          SERIAL PRIMARY KEY,
  creator_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  content     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_questions_creator ON questions (creator_id);
CREATE INDEX idx_questions_category ON questions (category_id);

-- ============================================================
-- 4. answers (1:1 with questions, cascade delete)
-- ============================================================
CREATE TABLE answers (
  id               SERIAL PRIMARY KEY,
  question_id      INTEGER NOT NULL UNIQUE REFERENCES questions (id) ON DELETE CASCADE,
  content          JSONB NOT NULL,
  accepted_answers TEXT[] DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. games
-- ============================================================
CREATE TABLE games (
  id                      SERIAL PRIMARY KEY,
  creator_id              INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title                   TEXT NOT NULL,
  daily_doubles_enabled   BOOLEAN NOT NULL DEFAULT true,
  is_published            BOOLEAN NOT NULL DEFAULT false,
  require_question_format BOOLEAN NOT NULL DEFAULT false,
  use_ai_evaluation       BOOLEAN NOT NULL DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_games_creator ON games (creator_id);

-- ============================================================
-- 6. game_categories (links games to categories, position 1-6)
-- ============================================================
CREATE TABLE game_categories (
  id          SERIAL PRIMARY KEY,
  game_id     INTEGER NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  position    INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT gc_unique_position UNIQUE (game_id, position),
  CONSTRAINT gc_position_range CHECK (position BETWEEN 1 AND 6)
);

CREATE INDEX idx_game_categories_game ON game_categories (game_id);

-- ============================================================
-- 7. game_questions (links games to questions via game_categories)
-- ============================================================
CREATE TABLE game_questions (
  id               SERIAL PRIMARY KEY,
  game_id          INTEGER NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  game_category_id INTEGER NOT NULL REFERENCES game_categories (id) ON DELETE CASCADE,
  question_id      INTEGER NOT NULL REFERENCES questions (id) ON DELETE RESTRICT,
  row_position     INTEGER NOT NULL,
  point_value      INTEGER NOT NULL,
  is_daily_double  BOOLEAN NOT NULL DEFAULT false,
  is_answered      BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT gq_point_value_positive CHECK (point_value > 0),
  CONSTRAINT gq_row_position_range CHECK (row_position BETWEEN 1 AND 5)
);

CREATE INDEX idx_game_questions_game ON game_questions (game_id);
CREATE INDEX idx_game_questions_category ON game_questions (game_category_id);

-- ============================================================
-- 8. game_sessions
-- ============================================================
CREATE TABLE game_sessions (
  id         SERIAL PRIMARY KEY,
  game_id    INTEGER NOT NULL REFERENCES games (id) ON DELETE RESTRICT,
  host_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  name       TEXT NOT NULL,
  join_code  VARCHAR(6) NOT NULL,
  status     TEXT NOT NULL DEFAULT 'lobby',
  mode       TEXT NOT NULL DEFAULT 'computer_hosted',
  turn_based BOOLEAN NOT NULL DEFAULT false,
  played_at  TIMESTAMPTZ DEFAULT NOW(),
  ended_at   TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT gs_status_check CHECK (status IN ('lobby', 'active', 'paused', 'completed')),
  CONSTRAINT gs_mode_check CHECK (mode IN ('computer_hosted', 'user_hosted'))
);

-- Join codes are looked up frequently; only active/lobby sessions matter.
CREATE INDEX idx_game_sessions_join_code ON game_sessions (join_code) WHERE status IN ('lobby', 'active');
CREATE INDEX idx_game_sessions_host ON game_sessions (host_id);

-- ============================================================
-- 9. session_players
-- ============================================================
CREATE TABLE session_players (
  id           SERIAL PRIMARY KEY,
  session_id   INTEGER NOT NULL REFERENCES game_sessions (id) ON DELETE CASCADE,
  user_id      INTEGER REFERENCES users (id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  final_score  INTEGER NOT NULL DEFAULT 0,
  rank         INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_players_session ON session_players (session_id);
CREATE INDEX idx_session_players_user ON session_players (user_id) WHERE user_id IS NOT NULL;

-- ============================================================
-- 10. uploads (Cloudflare R2 file tracking)
-- ============================================================
CREATE TABLE uploads (
  id         SERIAL PRIMARY KEY,
  owner_id   INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  public_url TEXT NOT NULL UNIQUE,
  mime_type  TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uploads_size_positive CHECK (size_bytes > 0)
);

CREATE INDEX idx_uploads_owner ON uploads (owner_id);

COMMIT;
