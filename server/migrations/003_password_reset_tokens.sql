-- Migration 003: password reset tokens
-- Stores short-lived, single-use tokens for the forgot-password flow.
-- Only the SHA-256 hash of the raw token is stored — the raw token is
-- sent to the user's email and never persisted.

BEGIN;

CREATE TABLE password_reset_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup by token hash (the only query path for validation)
CREATE INDEX idx_prt_token_hash ON password_reset_tokens (token_hash);

-- Useful for querying/cleaning up tokens by user (e.g. on account deletion)
CREATE INDEX idx_prt_user_id ON password_reset_tokens (user_id);

COMMIT;
