import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import fastifyWebsocket from '@fastify/websocket';
import { WebSocket } from 'ws';
import type { AddressInfo } from 'net';
import sessionsRoutes from '../sessions.routes.js';

// ---------------------------------------------------------------------------
// Hoisted mock instances — identical strategy to sessions.routes.rest.test.ts.
//
// mockGss must be hoisted because GameStateService is instantiated at module
// scope in sessions.routes.ts. The constructor mock must be in place before
// the module loads so the singleton binds to our controllable object.
// ---------------------------------------------------------------------------
const { mockGss, mockSessionSvc, mockAuthSvc, mockBuildGameBoard, mockEvaluate } =
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
      mockEvaluate: vi.fn(),
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
  extractBoardValues: vi.fn().mockReturnValue([200, 400, 600]),
}));

vi.mock('../../services/evaluation.service.js', () => ({
  evaluateAnswer: (...args: unknown[]) => mockEvaluate(...args),
}));

// requireAuth is not used in the WebSocket handler (auth happens via the first
// WS message, not HTTP preHandlers), but the import must still resolve.
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
const SESSION_ID = 1;

/** Creates a realistic in-memory session state. Tests mutate or override fields
 *  as needed; using a factory avoids cross-test state leakage from a shared object. */
function makeMockState(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: SESSION_ID,
    gameId: 10,
    mode: 'computer_hosted',
    status: 'active',
    turnBased: false,
    hostPlayerId: 1,
    boardValues: [200, 400, 600, 800, 1000],
    // Real Maps so handler code can call .get()/.set()/.has()/.delete()
    players: new Map<number, any>(),
    socketIdentities: new Map<WebSocket, { playerId: number; isHost: boolean }>(),
    playerSockets: new Map<number, WebSocket>(),
    disconnectedPlayers: new Map<number, any>(),
    roundState: {
      phase: 'buzzers_open',
      questionId: 99,
      pointValue: 200,
      isDailyDouble: false,
      answerContent: [{ type: 'text', value: 'Water' }],
    },
    ...overrides,
  };
}

/** Minimal board fixture for answer_submitted tests that reach buildGameBoard. */
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
              acceptedAnswers: ['water'],
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

/**
 * Creates, configures, and starts a real Fastify server bound to an ephemeral
 * port. WebSocket tests cannot use app.inject() — they require a live TCP
 * listener that the `ws` client can connect to.
 *
 * Registration order must mirror app.ts:
 *   jwt → cookie → decorators → websocket plugin → sessions routes
 */
async function buildWsApp() {
  const app = Fastify({ logger: false });

  app.register(fastifyJwt, {
    secret: TEST_JWT_SECRET,
    sign: { expiresIn: '15m' },
    decode: { complete: true },
  });
  app.register(fastifyCookie, { secret: TEST_JWT_SECRET });

  const mockDb = { query: vi.fn() };
  app.decorate('db', mockDb as any);
  app.decorate('redis', undefined as any);
  app.decorate('redisAvailable', false);
  app.decorate('isTokenBlacklisted', vi.fn().mockResolvedValue(false));
  app.decorate('blacklistToken', vi.fn());
  app.decorate('signAccessToken', (p: any) => app.jwt.sign(p, { expiresIn: '15m' }));
  app.decorate('signRefreshToken', (p: any) => app.jwt.sign(p, { expiresIn: '7d' }));

  // @fastify/websocket must be registered before any route that uses
  // `{ websocket: true }` — sessions.routes.ts declares the WS route.
  app.register(fastifyWebsocket);
  app.register(sessionsRoutes, { prefix: '/api/sessions' });

  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address() as AddressInfo;

  return { app, port };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Returns a URL for the session WebSocket endpoint. */
function wsUrl(port: number, sessionId = SESSION_ID) {
  return `ws://127.0.0.1:${port}/api/sessions/${sessionId}/ws`;
}

/**
 * Collects `count` parsed messages from `ws`, rejecting after `timeoutMs`.
 * Used to assert the exact sequence of server→client broadcasts.
 */
function collectMessages(ws: WebSocket, count: number, timeoutMs = 3000): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const msgs: any[] = [];
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${count} messages (got ${msgs.length})`)),
      timeoutMs
    );
    ws.on('message', (raw) => {
      msgs.push(JSON.parse(raw.toString()));
      if (msgs.length >= count) {
        clearTimeout(timer);
        resolve(msgs);
      }
    });
    ws.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

/**
 * Resolves with the WebSocket close event details.
 * Used to assert the server closed the socket with an expected code/reason.
 */
function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    ws.on('close', (code, reasonBuf) =>
      resolve({ code, reason: reasonBuf.toString() })
    );
    ws.on('error', reject);
    setTimeout(() => reject(new Error('WS did not close within 3 s')), 3000);
  });
}

/**
 * Opens a WebSocket, sends an auth message, and waits for the full_state_sync
 * that the server sends after successful authentication.
 * Returns the connected socket ready for further message exchange.
 */
async function connectAndAuth(port: number, token: string): Promise<WebSocket> {
  const ws = new WebSocket(wsUrl(port));
  await new Promise<void>((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  const syncP = collectMessages(ws, 1);
  ws.send(JSON.stringify({ type: 'auth', token }));
  await syncP; // wait for full_state_sync before returning
  return ws;
}

// ---------------------------------------------------------------------------

describe('Connection lifecycle', () => {
  let app: Awaited<ReturnType<typeof buildWsApp>>['app'];
  let port: number;

  beforeEach(async () => {
    ({ app, port } = await buildWsApp());
    vi.clearAllMocks();
  });

  afterEach(() => app.close());

  test('closes with 4004 immediately when no in-memory session exists', async () => {
    // TODO
  });

  test('closes with 4001 after auth timeout when no auth message is sent', async () => {
    // Note: use vi.useFakeTimers() to advance past the 5 s timeout without
    // waiting in real time. Remember to restore with vi.useRealTimers() at
    // the end of this test, or wrap in a try/finally.
    // TODO
  });
});

// ---------------------------------------------------------------------------

describe('WebSocket auth — registered user', () => {
  let app: Awaited<ReturnType<typeof buildWsApp>>['app'];
  let port: number;

  beforeEach(async () => {
    ({ app, port } = await buildWsApp());
    vi.clearAllMocks();
    // Default: getSession returns a valid state so the connection isn't closed
    // immediately. Individual tests override per-call as needed.
    mockGss.getSession.mockReturnValue(makeMockState());
  });

  afterEach(() => app.close());

  test('new player: verifies token, calls addPlayer, sends full_state_sync to socket', async () => {
    // TODO
  });

  test('reconnecting player: sends full_state_sync to socket and player_reconnected to others', async () => {
    // TODO
  });

  test('invalid token / blacklisted token / player not in session → closes 4001', async () => {
    // TODO
  });
});

// ---------------------------------------------------------------------------

describe('WebSocket auth — guest', () => {
  let app: Awaited<ReturnType<typeof buildWsApp>>['app'];
  let port: number;

  beforeEach(async () => {
    ({ app, port } = await buildWsApp());
    vi.clearAllMocks();
    mockGss.getSession.mockReturnValue(makeMockState());
  });

  afterEach(() => app.close());

  test('valid reconnect_guest as new player: adds player and sends full_state_sync', async () => {
    // TODO
  });

  test('invalid JWT or mismatched sessionId → closes 4001', async () => {
    // TODO
  });
});

// ---------------------------------------------------------------------------

describe('WebSocket security guards', () => {
  let app: Awaited<ReturnType<typeof buildWsApp>>['app'];
  let port: number;

  beforeEach(async () => {
    ({ app, port } = await buildWsApp());
    vi.clearAllMocks();
    mockGss.getSession.mockReturnValue(makeMockState());
  });

  afterEach(() => app.close());

  test('pre-auth messages are silently dropped; spoofed playerId after auth is also dropped', async () => {
    // TODO
  });
});

// ---------------------------------------------------------------------------

describe('WebSocket message routing — buzz', () => {
  let app: Awaited<ReturnType<typeof buildWsApp>>['app'];
  let port: number;

  beforeEach(async () => {
    ({ app, port } = await buildWsApp());
    vi.clearAllMocks();
    mockGss.getSession.mockReturnValue(makeMockState());
  });

  afterEach(() => app.close());

  test('accepted buzz (position 1) → buzz_received + timer_started + round_state_update with hidden answer', async () => {
    // TODO
  });
});

// ---------------------------------------------------------------------------

describe('WebSocket message routing — answer_submitted', () => {
  let app: Awaited<ReturnType<typeof buildWsApp>>['app'];
  let port: number;

  beforeEach(async () => {
    ({ app, port } = await buildWsApp());
    vi.clearAllMocks();
    mockGss.getSession.mockReturnValue(makeMockState());
  });

  afterEach(() => app.close());

  test('computer_hosted: evaluates automatically, broadcasts result, branches on roundOver', async () => {
    // TODO
  });

  test('user_hosted: broadcasts answer_submitted only — no auto-evaluation', async () => {
    // TODO
  });
});

// ---------------------------------------------------------------------------

describe('WebSocket message routing — host controls', () => {
  let app: Awaited<ReturnType<typeof buildWsApp>>['app'];
  let port: number;

  beforeEach(async () => {
    ({ app, port } = await buildWsApp());
    vi.clearAllMocks();
    mockGss.getSession.mockReturnValue(makeMockState({ mode: 'user_hosted' }));
  });

  afterEach(() => app.close());

  test('release_buzzers and lock_buzzers are only acted upon by the host in user_hosted mode', async () => {
    // TODO
  });
});

// ---------------------------------------------------------------------------

describe('WebSocket message routing — readiness signals', () => {
  let app: Awaited<ReturnType<typeof buildWsApp>>['app'];
  let port: number;

  beforeEach(async () => {
    ({ app, port } = await buildWsApp());
    vi.clearAllMocks();
    mockGss.getSession.mockReturnValue(makeMockState());
  });

  afterEach(() => app.close());

  test('player_ready and video_ended broadcast buzzers_released only when all players have signalled', async () => {
    // TODO
  });
});

// ---------------------------------------------------------------------------

describe('WebSocket message routing — media and WebRTC signaling', () => {
  let app: Awaited<ReturnType<typeof buildWsApp>>['app'];
  let port: number;

  beforeEach(async () => {
    ({ app, port } = await buildWsApp());
    vi.clearAllMocks();
    mockGss.getSession.mockReturnValue(makeMockState());
  });

  afterEach(() => app.close());

  test('media_state_update: mutates player state and broadcasts to others excluding sender', async () => {
    // TODO
  });

  test('WebRTC signaling: relays message to target socket by peerId; no-ops when target not found', async () => {
    // TODO
  });
});

// ---------------------------------------------------------------------------

describe('WebSocket close handler', () => {
  let app: Awaited<ReturnType<typeof buildWsApp>>['app'];
  let port: number;

  beforeEach(async () => {
    ({ app, port } = await buildWsApp());
    vi.clearAllMocks();
    mockGss.getSession.mockReturnValue(makeMockState());
  });

  afterEach(() => app.close());

  test('clean disconnect: calls handleDisconnect and broadcasts player_disconnected', async () => {
    // TODO
  });

  test('host disconnect that causes session pause: additionally broadcasts full_state_sync', async () => {
    // TODO
  });
});
