-- Migration 004: add token_version to users for post-reset session invalidation
-- When a user resets their password, token_version is incremented.
-- JWTs carry the tokenVersion claim at issuance; requireAuth rejects any token
-- whose claim no longer matches the current DB value, invalidating all pre-reset
-- sessions without needing to enumerate Redis keys.

BEGIN;

ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;

COMMIT;
