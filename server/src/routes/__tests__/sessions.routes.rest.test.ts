import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import sessionsRoutes from '../sessions.routes.js';

// ---------------------------------------------------------------------------
// Hoisted mock instances
//
// All mock objects must be created with vi.hoisted() so they exist before
// vi.mock() factory functions run (both are hoisted above imports by Vitest).
//
// mockGss is the singleton instance that sessions.routes.ts binds to at
// module load time via `const gameStateService = new GameStateService()`.
// Mocking the class constructor to return this object ensures every call
// inside the route handlers hits the same controllable instance.
// ---------------------------------------------------------------------------
const { mockGss, mockSessionSvc, mockAuthSvc, mockBuildGameBoard, mockExtractBoardValues } =
  vi.hoisted(() => {
    const mockGss = {
      createSession: vi.fn(),
      getSession: vi.fn(),
      removeSession: vi.fn(),
      addPlayer: vi.fn(),
      removePlayerSocket: vi.fn(),
      handleDisconnect: vi.fn(),
      handleReconnect: vi.fn(),
      verifyIdentity: vi.fn().mockReturnValue(true),
      selectQuestion: vi.fn(),
      declareWager: vi.fn(),
      handleBuzz: vi.fn(),
      releaseBuzzers: vi.fn(),
      lockBuzzers: vi.fn(),
      submitAnswer: vi.fn(),
      applyEvaluationResult: vi.fn(),
      advanceBuzzQueue: vi.fn(),
      completeRound: vi.fn(),
      handlePlayerReady: vi.fn(),
      handleVideoEnded: vi.fn(),
      broadcast: vi.fn(),
      sendTo: vi.fn(),
      buildFullStateSync: vi.fn().mockReturnValue({ players: [], roundState: {} }),
      markBoardQuestionAnswered: vi.fn(),
    };

    const mockSessionSvc = {
      findByJoinCode: vi.fn(),
      findById: vi.fn(),
      createSession: vi.fn(),
      getPlayers: vi.fn(),
      addPlayer: vi.fn(),
      removePlayer: vi.fn(),
      findPlayerByUserId: vi.fn(),
      updateStatus: vi.fn(),
      updateScore: vi.fn(),
      setRanks: vi.fn(),
      markQuestionAnswered: vi.fn(),
    };

    const mockAuthSvc = {
      login: vi.fn(),
      signUp: vi.fn(),
    };

    return {
      mockGss,
      mockSessionSvc,
      mockAuthSvc,
      mockBuildGameBoard: vi.fn(),
      mockExtractBoardValues: vi.fn().mockReturnValue([200, 400, 600, 800, 1000]),
    };
  });

vi.mock('../../services/game-state.service.js', () => ({
  GameStateService: vi.fn(() => mockGss),
}));

vi.mock('../../services/session.service.js', () => ({
  SessionService: vi.fn(() => mockSessionSvc),
}));

vi.mock('../../services/auth.service.js', () => ({
  AuthService: vi.fn(() => mockAuthSvc),
}));

vi.mock('../../services/session-state-builder.js', () => ({
  buildGameBoard: (...args: unknown[]) => mockBuildGameBoard(...args),
  extractBoardValues: (...args: unknown[]) => mockExtractBoardValues(...args),
}));

// evaluation.service is only used by the WebSocket answer handler; not needed here.
vi.mock('../../services/evaluation.service.js', () => ({
  evaluateAnswer: vi.fn(),
}));

// Partial hook mock: requireAuth is replaced with a no-op that injects a
// fixed request.user so protected-route tests focus on route logic, not auth.
// requireAuth behaviour is already proven in auth.hook.test.ts.
vi.mock('../../hooks/auth.hook.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/auth.hook.js')>();
  return {
    ...actual,
    requireAuth: vi.fn(async (req: any) => {
      req.user = { sub: '1', email: '', role: 'player', jti: 'test-jti' };
    }),
  };
});

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const TEST_JWT_SECRET = 'test-secret-long-enough-for-hs256-signing';

const fakeSession = {
  id: 1,
  game_id: 10,
  host_id: 1,
  name: 'Test Session',
  join_code: 'ABC123',
  status: 'lobby',
  mode: 'computer_hosted',
  turn_based: false,
};

const fakePlayer = {
  id: 5,
  session_id: 1,
  user_id: 1,
  display_name: 'Alice',
  final_score: 0,
};

// A minimal board with one category and one unanswered question, used by
// endpoints that call buildGameBoard (select and create).
const fakeBoard = {
  game: { id: 10, requireQuestionFormat: false, useAiEvaluation: false },
  categories: [
    {
      id: 20,
      name: 'Science',
      questions: [
        {
          questionId: 99,
          rowPosition: 1,
          pointValue: 200,
          isDailyDouble: false,
          isAnswered: false,
          question: {
            content: [{ type: 'text', value: 'What is H2O?' }],
            answer: {
              content: [{ type: 'text', value: 'Water' }],
              acceptedAnswers: ['water', 'h2o'],
            },
          },
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

function buildApp() {
  const app = Fastify({ logger: false });

  // Real JWT plugin — the /join route signs guest tokens with fastify.jwt.sign,
  // and some tests decode those tokens to verify their payload shape.
  app.register(fastifyJwt, {
    secret: TEST_JWT_SECRET,
    sign: { expiresIn: '15m' },
    decode: { complete: true },
  });

  app.register(fastifyCookie, { secret: TEST_JWT_SECRET });

  // fastify.db is used directly in POST / for the game ownership query.
  // Tests that exercise that route set mockDb.query return values individually.
  const mockDb = { query: vi.fn() };
  app.decorate('db', mockDb as any);
  app.decorate('redis', undefined as any);
  app.decorate('redisAvailable', false);
  app.decorate('isTokenBlacklisted', vi.fn().mockResolvedValue(false));
  app.decorate('blacklistToken', vi.fn());
  app.decorate('signAccessToken', (p: any) => app.jwt.sign(p, { expiresIn: '15m' }));
  app.decorate('signRefreshToken', (p: any) => app.jwt.sign(p, { expiresIn: '7d' }));

  app.register(sessionsRoutes, { prefix: '/api/sessions' });

  return { app, mockDb };
}

// ---------------------------------------------------------------------------

describe('GET /api/sessions/:joinCode', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    ({ app } = buildApp());
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(() => app.close());

  test('returns session preview when found, or 404 when not found', async () => {
    // TODO
  });
});

// ---------------------------------------------------------------------------

describe('POST /api/sessions', () => {
  let app: ReturnType<typeof Fastify>;
  let mockDb: { query: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    ({ app, mockDb } = buildApp());
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(() => app.close());

  test('guards: missing auth returns 401, unowned game returns 404, board failure returns 500', async () => {
    // TODO
  });

  test('creates session, initialises in-memory state, adds host player, returns 201', async () => {
    // TODO
  });
});

// ---------------------------------------------------------------------------

describe('POST /api/sessions/:id/join', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    ({ app } = buildApp());
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(() => app.close());

  test('returns 404 when session is not found or has a non-joinable status', async () => {
    // TODO
  });

  test('guest method: adds player and returns a signed guest token with correct payload', async () => {
    // TODO
  });

  test('login/signup methods delegate to AuthService and surface its errors', async () => {
    // TODO
  });

  test('returns existing player without re-adding when a registered user rejoins', async () => {
    // TODO
  });
});

// ---------------------------------------------------------------------------

describe('PATCH /api/sessions/:id/status', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    ({ app } = buildApp());
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(() => app.close());

  test('returns 404 when session is not found or not owned by the requester', async () => {
    // TODO
  });

  test("'completed': sets ranks, broadcasts full_state_sync, removes in-memory session", async () => {
    // TODO
  });

  test("'paused'/'active': broadcasts full_state_sync without removing the session", async () => {
    // TODO
  });
});

// ---------------------------------------------------------------------------

describe('DELETE /api/sessions/:id/players/:playerId', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    ({ app } = buildApp());
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(() => app.close());

  test('returns 404 when player not found; removes from state and broadcasts when found', async () => {
    // TODO
  });
});

// ---------------------------------------------------------------------------

describe('POST /api/sessions/:id/questions/:questionId/select', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    ({ app } = buildApp());
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(() => app.close());

  test('guards: no session → 404, round in progress → 400, board failure → 500, question not found → 404, already answered → 400', async () => {
    // TODO
  });

  test('selects question, hides answer in broadcast, marks answered in DB', async () => {
    // TODO
  });
});

// ---------------------------------------------------------------------------

describe('POST /api/sessions/:id/evaluate', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    ({ app } = buildApp());
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(() => app.close());

  test('returns 400 INVALID_MODE when session is absent or not user_hosted', async () => {
    // TODO
  });

  test('applies result, broadcasts answer_result and round_state_update, branches on roundOver', async () => {
    // TODO
  });
});
