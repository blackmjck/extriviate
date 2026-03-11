/**
 * Standalone PostgreSQL connection test.
 * Run with: npm run test:db  (from the server directory)
 *
 * Tests: connectivity, schema completeness, CRUD lifecycle, constraint enforcement.
 * All test data is rolled back — no persistent changes to the database.
 */
import 'dotenv/config';
import pg from 'pg';
import { config } from '../src/config.js';

const { Pool } = pg;
type PoolClient = pg.PoolClient;

// ---------------------------------------------------------------------------
// Helper: run fn inside a SAVEPOINT and assert that it throws a specific PG
// error code. Rolls back to the savepoint on success (expected error received)
// or re-throws if the wrong error code (or no error) is returned.
// ---------------------------------------------------------------------------
async function assertConstraintViolation(
  client: PoolClient,
  label: string,
  fn: (c: PoolClient) => Promise<void>,
  expectedCode: string,
): Promise<void> {
  await client.query('SAVEPOINT cv');
  try {
    await fn(client);
    // fn completed without throwing — constraint was NOT enforced
    await client.query('RELEASE SAVEPOINT cv');
    throw new Error(`"${label}": expected PG error ${expectedCode} but no error was thrown`);
  } catch (err: any) {
    if (err.code === expectedCode) {
      await client.query('ROLLBACK TO SAVEPOINT cv');
      await client.query('RELEASE SAVEPOINT cv');
      // expected — constraint is working correctly
    } else {
      await client.query('ROLLBACK TO SAVEPOINT cv');
      await client.query('RELEASE SAVEPOINT cv');
      throw err; // unexpected error
    }
  }
}

async function run(): Promise<void> {
  const maskedUrl = config.db.url.replace(/:([^@/]+)@/, ':****@');

  console.log('PostgreSQL Connection Test');
  console.log('==========================');
  console.log(`URL: ${maskedUrl}`);
  console.log('');

  const pool = new Pool({
    connectionString: config.db.url,
    max: 2,
    connectionTimeoutMillis: 5_000,
  });

  try {
    // ------------------------------------------------------------------
    // 1. Connectivity + server version
    // ------------------------------------------------------------------
    process.stdout.write('1. Checking connectivity        ... ');
    const versionClient = await pool.connect();
    const versionRow = await versionClient
      .query<{ version: string }>('SELECT version()')
      .then((r) => r.rows[0].version);
    versionClient.release();
    const shortVersion = versionRow.split(' ').slice(0, 2).join(' ');
    console.log(`OK  (${shortVersion})`);

    // ------------------------------------------------------------------
    // 2. Schema — all expected tables present
    // ------------------------------------------------------------------
    process.stdout.write('2. Verifying schema tables      ... ');
    const EXPECTED_TABLES = [
      'users',
      'categories',
      'questions',
      'answers',
      'games',
      'game_categories',
      'game_questions',
      'game_sessions',
      'session_players',
      'uploads',
    ];
    const tableRows = await pool
      .query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
      )
      .then((r) => r.rows);
    const existingTables = new Set(tableRows.map((r) => r.tablename));
    const missing = EXPECTED_TABLES.filter((t) => !existingTables.has(t));
    if (missing.length > 0) {
      throw new Error(`Missing tables: ${missing.join(', ')}`);
    }
    console.log(`OK  (${EXPECTED_TABLES.length} tables found)`);

    // ------------------------------------------------------------------
    // Acquire a single client and BEGIN a transaction.
    // All test rows live inside this transaction and are ROLLED BACK at
    // the end — the live database is never modified.
    // ------------------------------------------------------------------
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // ----------------------------------------------------------------
      // 3. CRUD lifecycle: user → category → question → answer → game →
      //    game_category → game_question
      // ----------------------------------------------------------------
      process.stdout.write('3. Testing CRUD lifecycle       ... ');

      // user
      const userId = await client
        .query<{ id: number }>(
          `INSERT INTO users (email, display_name, password_hash)
           VALUES ('pg-check@extriviate.internal', 'PG Check', '$2b$12$placeholder')
           RETURNING id`,
        )
        .then((r) => r.rows[0].id);

      // category
      const categoryId = await client
        .query<{ id: number }>(
          `INSERT INTO categories (creator_id, name)
           VALUES ($1, 'PG Check Category')
           RETURNING id`,
          [userId],
        )
        .then((r) => r.rows[0].id);

      // question with JSONB content
      const questionId = await client
        .query<{ id: number }>(
          `INSERT INTO questions (creator_id, category_id, content)
           VALUES ($1, $2, $3::jsonb)
           RETURNING id`,
          [
            userId,
            categoryId,
            JSON.stringify([{ type: 'text', value: 'What is a PostgreSQL test?' }]),
          ],
        )
        .then((r) => r.rows[0].id);

      // answer — content JSONB + accepted_answers text[]
      await client.query(
        `INSERT INTO answers (question_id, content, accepted_answers)
         VALUES ($1, $2::jsonb, $3)`,
        [
          questionId,
          JSON.stringify([{ type: 'text', value: 'A PostgreSQL test' }]),
          ['a postgresql test', 'postgresql test', 'a test'],
        ],
      );

      // game
      const gameId = await client
        .query<{ id: number }>(
          `INSERT INTO games (creator_id, title) VALUES ($1, 'PG Check Game') RETURNING id`,
          [userId],
        )
        .then((r) => r.rows[0].id);

      // game_category (position 1)
      const gameCategoryId = await client
        .query<{ id: number }>(
          `INSERT INTO game_categories (game_id, category_id, position)
           VALUES ($1, $2, 1)
           RETURNING id`,
          [gameId, categoryId],
        )
        .then((r) => r.rows[0].id);

      // game_question (row 1, 200 points)
      await client.query(
        `INSERT INTO game_questions
           (game_id, game_category_id, question_id, row_position, point_value)
         VALUES ($1, $2, $3, 1, 200)`,
        [gameId, gameCategoryId, questionId],
      );

      // verify round-trip read
      const readBack = await client.query<{ title: string; cnt: string }>(
        `SELECT g.title,
                (SELECT count(*) FROM game_questions gq WHERE gq.game_id = g.id) AS cnt
         FROM games g WHERE g.id = $1`,
        [gameId],
      );
      if (readBack.rows[0].title !== 'PG Check Game') {
        throw new Error('Round-trip read returned wrong game title');
      }
      if (readBack.rows[0].cnt !== '1') {
        throw new Error('Round-trip read returned wrong game_question count');
      }

      console.log('OK  (user → category → question → answer → game → game_category → game_question)');

      // ----------------------------------------------------------------
      // 4. Constraint enforcement (savepoint-based, no separate txn)
      // ----------------------------------------------------------------
      process.stdout.write('4. Testing constraint enforcement ...\n');

      // 4a. Duplicate email → unique violation 23505
      process.stdout.write('   a. Duplicate email (23505)                    ... ');
      await assertConstraintViolation(
        client,
        'duplicate email',
        async (c) => {
          await c.query(
            `INSERT INTO users (email, display_name, password_hash)
             VALUES ('pg-check@extriviate.internal', 'Dup', '$2b$12$x')`,
          );
        },
        '23505',
      );
      console.log('OK');

      // 4b. Invalid role → check constraint 23514
      process.stdout.write('   b. Invalid user role (23514)                  ... ');
      await assertConstraintViolation(
        client,
        'invalid role',
        async (c) => {
          await c.query(
            `INSERT INTO users (email, display_name, password_hash, role)
             VALUES ('role-bad@extriviate.internal', 'X', '$2b$12$x', 'superadmin')`,
          );
        },
        '23514',
      );
      console.log('OK');

      // 4c. game_category position out of range (must be 1–6) → 23514
      process.stdout.write('   c. game_category position out of range (23514) ... ');
      await assertConstraintViolation(
        client,
        'gc_position_range',
        async (c) => {
          await c.query(
            `INSERT INTO game_categories (game_id, category_id, position)
             VALUES ($1, $2, 7)`,
            [gameId, categoryId],
          );
        },
        '23514',
      );
      console.log('OK');

      // 4d. game_question row_position out of range (must be 1–5) → 23514
      process.stdout.write('   d. game_question row_position out of range (23514) ... ');
      await assertConstraintViolation(
        client,
        'gq_row_position_range',
        async (c) => {
          await c.query(
            `INSERT INTO game_questions
               (game_id, game_category_id, question_id, row_position, point_value)
             VALUES ($1, $2, $3, 6, 200)`,
            [gameId, gameCategoryId, questionId],
          );
        },
        '23514',
      );
      console.log('OK');

      // 4e. game_question point_value ≤ 0 → 23514
      process.stdout.write('   e. game_question non-positive point_value (23514) ... ');
      await assertConstraintViolation(
        client,
        'gq_point_value_positive',
        async (c) => {
          await c.query(
            `INSERT INTO game_questions
               (game_id, game_category_id, question_id, row_position, point_value)
             VALUES ($1, $2, $3, 2, -50)`,
            [gameId, gameCategoryId, questionId],
          );
        },
        '23514',
      );
      console.log('OK');

      // 4f. FK violation: category creator_id references non-existent user → 23503
      process.stdout.write('   f. FK violation: non-existent creator_id (23503)  ... ');
      await assertConstraintViolation(
        client,
        'fk_creator_id',
        async (c) => {
          await c.query(
            `INSERT INTO categories (creator_id, name) VALUES (999999999, 'Orphan')`,
          );
        },
        '23503',
      );
      console.log('OK');

      // ----------------------------------------------------------------
      // 5. Roll back — no test rows persist
      // ----------------------------------------------------------------
      process.stdout.write('5. Rolling back test transaction ... ');
      await client.query('ROLLBACK');
      console.log('OK');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    console.log('');
    console.log('All checks passed. PostgreSQL is configured correctly.');
  } finally {
    await pool.end();
  }
}

run().catch((err: Error) => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
