import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameStateService } from '../game-state.service.js';
import type { SessionGameState } from '../game-state.service.js';
import type { GameBoard, LivePlayer } from '@extriviate/shared';
import type { WebSocket as WsWebSocket } from 'ws';
import {
  RECONNECT_GRACE_PERIOD_MS,
  ANSWER_TIMER_DURATION_MS,
  BUZZ_WINDOW_DURATION_MS,
  ANSWER_REVEAL_DURATION_MS,
  DAILY_DOUBLE_MIN_WAGER,
  TEXT_MAX_LOCK_MS,
  MAX_READY_WAIT_MS,
} from '@extriviate/shared';

// ---- Minimal fake WebSocket ----

function makeSocket(open = true): WsWebSocket {
  return {
    readyState: open ? 1 : 3, // 1 = OPEN, 3 = CLOSED
    OPEN: 1,
    send: vi.fn(),
  } as unknown as WsWebSocket;
}

// ---- Minimal GameBoard fixture ----

function makeBoard(pointValues: number[] = [200, 400, 600, 800, 1000]): GameBoard {
  const questions = pointValues.map((pv, i) => ({
    id: i + 1,
    gameId: 1,
    gameCategoryId: 1,
    questionId: i + 1,
    rowPosition: i + 1,
    pointValue: pv,
    isDailyDouble: false,
    isAnswered: false,
    question: {
      id: i + 1,
      creatorId: 1,
      categoryId: 1,
      content: [{ type: 'text' as const, value: `Question ${i + 1}` }],
      createdAt: '',
      updatedAt: '',
      answer: {
        id: i + 1,
        questionId: i + 1,
        content: [{ type: 'text' as const, value: `Answer ${i + 1}` }],
        acceptedAnswers: [],
      },
    },
  }));

  return {
    game: {
      id: 1,
      creatorId: 1,
      title: 'Test Game',
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
        category: { id: 1, creatorId: 1, name: 'Cat 1', description: null, createdAt: '', updatedAt: '' },
        questions,
      },
    ],
  };
}

// ---- LivePlayer factory ----

function makePlayer(overrides: Partial<LivePlayer> = {}): LivePlayer {
  return {
    playerId: 1,
    displayName: 'Alice',
    score: 0,
    isHost: false,
    isReady: false,
    isDisconnected: false,
    avatarMode: 'none',
    avatarUrl: null,
    cameraActive: false,
    audioMuted: false,
    peerId: null,
    ...overrides,
  };
}

// ---- SessionGameState factory ----

function makeState(
  service: GameStateService,
  overrides: { mode?: SessionGameState['mode']; turnBased?: boolean; boardValues?: number[] } = {},
): SessionGameState {
  const onScoreChanged = vi.fn();
  const onQuestionAnswered = vi.fn();
  return service.createSession(
    1,
    1,
    'Test Session',
    'ABC123',
    makeBoard(),
    overrides.mode ?? 'computer_hosted',
    overrides.turnBased ?? false,
    1,
    overrides.boardValues ?? [200, 400, 600, 800, 1000],
    onScoreChanged,
    onQuestionAnswered,
  );
}

// ---- Helper: select a text question into the state ----

function selectTextQuestion(service: GameStateService, state: SessionGameState, selecterId = 2): void {
  service.selectQuestion(
    state,
    1,        // gameCategoryId
    1,        // questionId
    1,        // rowPosition
    200,      // pointValue
    false,    // isDailyDouble
    [{ type: 'text', value: 'A short question' }],
    [{ type: 'text', value: 'Correct answer' }],
    selecterId,
  );
}

// ---- Helper: advance state to buzzers_open ----

function openBuzzers(service: GameStateService, state: SessionGameState, selecterId = 2): void {
  selectTextQuestion(service, state, selecterId);
  service.releaseBuzzers(state);
}

// ===========================================================================

describe('GameStateService', () => {
  let service: GameStateService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new GameStateService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---- Session CRUD ----

  describe('createSession / getSession / removeSession', () => {
    test('createSession stores and returns state with lobby status', () => {
      const state = makeState(service);
      expect(state.status).toBe('lobby');
      expect(state.sessionId).toBe(1);
    });

    test('getSession returns the stored state', () => {
      const state = makeState(service);
      expect(service.getSession(1)).toBe(state);
    });

    test('getSession returns undefined for unknown id', () => {
      expect(service.getSession(999)).toBeUndefined();
    });

    test('removeSession deletes the session', () => {
      makeState(service);
      service.removeSession(1);
      expect(service.getSession(1)).toBeUndefined();
    });

    test('removeSession clears running timers', () => {
      const state = makeState(service);
      openBuzzers(service, state);
      // buzzTimer should be running
      expect(state.buzzTimer).not.toBeNull();

      service.removeSession(1);
      // No timer firing after removal
      vi.runAllTimers();
      // If timers were cleared, the state is gone and no error thrown
      expect(service.getSession(1)).toBeUndefined();
    });

    test('removeSession cancels the revealTimer so state is not mutated after removal', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 2 }), makeSocket());
      openBuzzers(service, state);
      service.handleBuzz(state, 2);
      // completeRound sets revealTimer
      service.completeRound(state);
      expect(state.revealTimer).not.toBeNull();

      service.removeSession(1);
      // Timer must be cleared; running it would otherwise mutate the orphaned state
      expect(state.revealTimer).toBeNull();
      // Advancing time must not throw or mutate orphaned state
      vi.runAllTimers();
    });

    test('removeSession cancels disconnection timers so removal callbacks never fire', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 10 }), makeSocket());
      const onRemoval = vi.fn();
      service.handleDisconnect(state, 10, onRemoval);
      expect(state.disconnectedPlayers.has(10)).toBe(true);

      service.removeSession(1);
      vi.advanceTimersByTime(RECONNECT_GRACE_PERIOD_MS);

      expect(onRemoval).not.toHaveBeenCalled();
    });

    test('removeSession is a no-op for unknown id', () => {
      expect(() => service.removeSession(999)).not.toThrow();
    });
  });

  // ---- Player management ----

  describe('addPlayer / removePlayerSocket', () => {
    test('addPlayer registers socket identity', () => {
      const state = makeState(service);
      const socket = makeSocket();
      const player = makePlayer();

      service.addPlayer(state, player, socket);

      expect(state.players.get(1)).toBe(player);
      expect(state.playerSockets.get(1)).toBe(socket);
      expect(state.socketIdentities.get(socket)).toEqual({ playerId: 1, isHost: false });
    });

    test('addPlayer sets isHost in identity from player', () => {
      const state = makeState(service);
      const socket = makeSocket();
      const player = makePlayer({ isHost: true });

      service.addPlayer(state, player, socket);

      expect(state.socketIdentities.get(socket)?.isHost).toBe(true);
    });

    test('removePlayerSocket returns identity and cleans maps', () => {
      const state = makeState(service);
      const socket = makeSocket();
      service.addPlayer(state, makePlayer(), socket);

      const identity = service.removePlayerSocket(state, socket);

      expect(identity).toEqual({ playerId: 1, isHost: false });
      expect(state.socketIdentities.has(socket)).toBe(false);
      expect(state.playerSockets.has(1)).toBe(false);
    });

    test('removePlayerSocket returns null for unknown socket', () => {
      const state = makeState(service);
      expect(service.removePlayerSocket(state, makeSocket())).toBeNull();
    });
  });

  // ---- Identity verification ----

  describe('verifyIdentity', () => {
    test('returns true when socket and playerId match', () => {
      const state = makeState(service);
      const socket = makeSocket();
      service.addPlayer(state, makePlayer({ playerId: 42 }), socket);

      expect(service.verifyIdentity(state, socket, 42)).toBe(true);
    });

    test('returns false when playerId does not match socket identity', () => {
      const state = makeState(service);
      const socket = makeSocket();
      service.addPlayer(state, makePlayer({ playerId: 42 }), socket);

      expect(service.verifyIdentity(state, socket, 99)).toBe(false);
    });

    test('returns false for unregistered socket', () => {
      const state = makeState(service);
      expect(service.verifyIdentity(state, makeSocket(), 1)).toBe(false);
    });
  });

  // ---- Disconnection / Reconnection ----

  describe('handleDisconnect', () => {
    test('marks player as disconnected and adds to disconnectedPlayers', () => {
      const state = makeState(service);
      const socket = makeSocket();
      const player = makePlayer({ playerId: 10 });
      service.addPlayer(state, player, socket);

      service.handleDisconnect(state, 10, vi.fn());

      expect(player.isDisconnected).toBe(true);
      expect(state.disconnectedPlayers.has(10)).toBe(true);
    });

    test('removal callback fires after RECONNECT_GRACE_PERIOD_MS', () => {
      const state = makeState(service);
      const socket = makeSocket();
      service.addPlayer(state, makePlayer({ playerId: 10 }), socket);
      const onRemoval = vi.fn();

      service.handleDisconnect(state, 10, onRemoval);
      expect(onRemoval).not.toHaveBeenCalled();

      vi.advanceTimersByTime(RECONNECT_GRACE_PERIOD_MS);
      expect(onRemoval).toHaveBeenCalledWith(10);
      expect(state.players.has(10)).toBe(false);
    });

    test('player removed from players map when grace period expires', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 10 }), makeSocket());

      service.handleDisconnect(state, 10, vi.fn());
      vi.advanceTimersByTime(RECONNECT_GRACE_PERIOD_MS);

      expect(state.players.has(10)).toBe(false);
    });

    test('user_hosted host disconnect pauses the session', () => {
      const state = makeState(service, { mode: 'user_hosted' });
      const socket = makeSocket();
      service.addPlayer(state, makePlayer({ playerId: 1, isHost: true }), socket);
      state.hostPlayerId = 1;

      service.handleDisconnect(state, 1, vi.fn());

      expect(state.status).toBe('paused');
    });

    test('computer_hosted host disconnect does not pause session', () => {
      const state = makeState(service, { mode: 'computer_hosted' });
      service.addPlayer(state, makePlayer({ playerId: 1, isHost: true }), makeSocket());

      service.handleDisconnect(state, 1, vi.fn());

      expect(state.status).toBe('lobby');
    });

    test('active answerer disconnect forfeits turn', () => {
      const state = makeState(service);
      state.status = 'active';
      const socket = makeSocket();
      service.addPlayer(state, makePlayer({ playerId: 5 }), socket);
      openBuzzers(service, state);
      service.handleBuzz(state, 5); // player 5 is now active answerer

      service.handleDisconnect(state, 5, vi.fn());

      // After forfeit, phase should advance (no more buzzers → buzzers_open or round_timeout)
      const phase = state.roundState.phase;
      expect(['buzzers_open', 'round_timeout']).toContain(phase);
    });

    test('daily double holder disconnect returns to idle', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 7 }), makeSocket());
      // Set up a DD round state manually
      state.roundState.phase = 'daily_double_revealed';
      state.roundState.activePlayerId = 7;

      service.handleDisconnect(state, 7, vi.fn());

      expect(state.roundState.phase).toBe('idle');
    });

    // Regression: DD holder disconnecting during player_answering (after wagering) must
    // return to idle — NOT call advanceBuzzQueue which would incorrectly open buzzers.
    test('DD holder disconnect in player_answering returns to idle, not buzzers_open', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 5, score: 500 }), makeSocket());
      service.selectQuestion(state, 1, 1, 1, 200, true, [{ type: 'text', value: 'Q' }], [], 5);
      service.declareWager(state, 5, 200);
      // Manually advance to player_answering to simulate wager accepted
      state.roundState.phase = 'player_answering';
      state.roundState.isDailyDouble = true;
      state.roundState.activePlayerId = 5;

      service.handleDisconnect(state, 5, vi.fn());

      expect(state.roundState.phase).toBe('idle'); // must NOT be 'buzzers_open'
    });

    test('questionSelecterId is nulled when selecter disconnects', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 3 }), makeSocket());
      state.roundState.questionSelecterId = 3;

      service.handleDisconnect(state, 3, vi.fn());

      expect(state.roundState.questionSelecterId).toBeNull();
    });

    test('handleDisconnect is a no-op for unknown player', () => {
      const state = makeState(service);
      expect(() => service.handleDisconnect(state, 999, vi.fn())).not.toThrow();
    });
  });

  describe('handleReconnect', () => {
    test('cancels removal timer and clears isDisconnected', () => {
      const state = makeState(service);
      const socket = makeSocket();
      service.addPlayer(state, makePlayer({ playerId: 10 }), socket);
      const onRemoval = vi.fn();
      service.handleDisconnect(state, 10, onRemoval);

      const newSocket = makeSocket();
      const result = service.handleReconnect(state, 10, newSocket);

      expect(result).toBe(true);
      expect(state.players.get(10)?.isDisconnected).toBe(false);

      // Advance past grace period — removal callback should NOT fire
      vi.advanceTimersByTime(RECONNECT_GRACE_PERIOD_MS);
      expect(onRemoval).not.toHaveBeenCalled();
    });

    test('registers new socket in identity maps', () => {
      const state = makeState(service);
      const oldSocket = makeSocket();
      service.addPlayer(state, makePlayer({ playerId: 10 }), oldSocket);
      service.handleDisconnect(state, 10, vi.fn());

      const newSocket = makeSocket();
      service.handleReconnect(state, 10, newSocket);

      expect(state.playerSockets.get(10)).toBe(newSocket);
      expect(state.socketIdentities.get(newSocket)).toEqual({ playerId: 10, isHost: false });
    });

    test('host reconnect restores paused session to active', () => {
      const state = makeState(service, { mode: 'user_hosted' });
      service.addPlayer(state, makePlayer({ playerId: 1, isHost: true }), makeSocket());
      state.hostPlayerId = 1;
      service.handleDisconnect(state, 1, vi.fn());
      expect(state.status).toBe('paused');

      service.handleReconnect(state, 1, makeSocket());

      expect(state.status).toBe('active');
    });

    test('returns false for unknown player', () => {
      const state = makeState(service);
      expect(service.handleReconnect(state, 999, makeSocket())).toBe(false);
    });

    // Regression: old socket must be evicted from socketIdentities so that its
    // 'close' event does NOT re-trigger handleDisconnect on the reconnected player.
    test('removes old socket from socketIdentities to prevent re-triggered disconnect', () => {
      const state = makeState(service);
      const oldSocket = makeSocket();
      service.addPlayer(state, makePlayer({ playerId: 10 }), oldSocket);
      service.handleDisconnect(state, 10, vi.fn());

      const newSocket = makeSocket();
      service.handleReconnect(state, 10, newSocket);

      expect(state.socketIdentities.has(oldSocket)).toBe(false); // old socket evicted
      expect(state.socketIdentities.has(newSocket)).toBe(true);  // new socket registered
      expect(state.playerSockets.get(10)).toBe(newSocket);
    });
  });

  // ---- Question selection ----

  describe('selectQuestion', () => {
    test('removes point value from boardValues', () => {
      const state = makeState(service, { boardValues: [200, 400, 600] });

      service.selectQuestion(state, 1, 1, 1, 200, false, [{ type: 'text', value: 'Q' }], [], 1);

      expect(state.boardValues).not.toContain(200);
      expect(state.boardValues).toHaveLength(2);
    });

    test('non-DD sets phase to question_revealed', () => {
      const state = makeState(service);

      service.selectQuestion(state, 1, 1, 1, 200, false, [{ type: 'text', value: 'Q' }], [], 1);

      expect(state.roundState.phase).toBe('question_revealed');
    });

    test('non-DD sets text lock reason to reading_time for computer_hosted', () => {
      const state = makeState(service, { mode: 'computer_hosted' });

      service.selectQuestion(state, 1, 1, 1, 200, false, [{ type: 'text', value: 'Q' }], [], 1);

      expect(state.roundState.buzzerLockReason).toBe('reading_time');
    });

    test('non-DD image content sets lock reason to awaiting_ready', () => {
      const state = makeState(service, { mode: 'computer_hosted' });

      service.selectQuestion(
        state, 1, 1, 1, 200, false,
        [{ type: 'image', url: 'http://x.com/img.png', alt: '' }],
        [], 1,
      );

      expect(state.roundState.buzzerLockReason).toBe('awaiting_ready');
    });

    test('non-DD video content sets lock reason to video_playing', () => {
      const state = makeState(service, { mode: 'computer_hosted' });

      service.selectQuestion(
        state, 1, 1, 1, 200, false,
        [{ type: 'video', url: 'http://x.com/vid.mp4' }],
        [], 1,
      );

      expect(state.roundState.buzzerLockReason).toBe('video_playing');
    });

    test('user_hosted always sets lock reason to host_controlled', () => {
      const state = makeState(service, { mode: 'user_hosted' });

      service.selectQuestion(state, 1, 1, 1, 200, false, [{ type: 'text', value: 'Q' }], [], 1);

      expect(state.roundState.buzzerLockReason).toBe('host_controlled');
    });

    test('DD sets phase to daily_double_revealed', () => {
      const state = makeState(service);

      service.selectQuestion(state, 1, 1, 1, 200, true, [{ type: 'text', value: 'Q' }], [], 5);

      expect(state.roundState.phase).toBe('daily_double_revealed');
    });

    test('DD sets activePlayerId to the selecter', () => {
      const state = makeState(service);

      service.selectQuestion(state, 1, 1, 1, 200, true, [{ type: 'text', value: 'Q' }], [], 5);

      expect(state.roundState.activePlayerId).toBe(5);
    });

    test('DD does not start a lock timer', () => {
      const state = makeState(service);

      service.selectQuestion(state, 1, 1, 1, 200, true, [{ type: 'text', value: 'Q' }], [], 5);

      expect(state.lockTimer).toBeNull();
    });

    test('calls onQuestionAnswered callback', () => {
      const state = makeState(service);

      service.selectQuestion(state, 1, 42, 1, 200, false, [{ type: 'text', value: 'Q' }], [], 1);

      expect(state.onQuestionAnswered).toHaveBeenCalledWith(42);
    });

    test('reading_time lock timer fires and releases buzzers', () => {
      const state = makeState(service, { mode: 'computer_hosted' });
      service.selectQuestion(
        state, 1, 1, 1, 200, false,
        [{ type: 'text', value: 'word '.repeat(10) }],
        [], 1,
      );

      expect(state.roundState.phase).toBe('question_revealed');
      // Advance only to the lock timer — do not overshoot into the buzz timer (10s)
      vi.advanceTimersByTime(TEXT_MAX_LOCK_MS);
      expect(state.roundState.phase).toBe('buzzers_open');
    });
  });

  // ---- Daily double wager ----

  describe('declareWager', () => {
    function setupDD(scoreOverride = 500): SessionGameState {
      const state = makeState(service, { boardValues: [200, 400, 600, 800, 1000] });
      service.addPlayer(state, makePlayer({ playerId: 5, score: scoreOverride }), makeSocket());
      service.selectQuestion(state, 1, 1, 1, 200, true, [{ type: 'text', value: 'Q' }], [], 5);
      return state;
    }

    test('valid wager accepted, phase → question_revealed', () => {
      const state = setupDD(500);
      const ok = service.declareWager(state, 5, 300);
      expect(ok).toBe(true);
      expect(state.roundState.phase).toBe('question_revealed');
      expect(state.roundState.wager).toBe(300);
    });

    test('wager clamped to minimum DAILY_DOUBLE_MIN_WAGER', () => {
      const state = setupDD(500);
      service.declareWager(state, 5, 1);
      expect(state.roundState.wager).toBe(DAILY_DOUBLE_MIN_WAGER);
    });

    test('wager clamped to max(playerScore, highestBoardValue)', () => {
      const state = setupDD(500);
      // boardValues are [200,400,600,800,1000] but 200 was removed during selectQuestion
      // highest remaining = 1000; playerScore = 500 → max = 1000
      service.declareWager(state, 5, 9999);
      expect(state.roundState.wager).toBe(1000);
    });

    test('negative score player: max wager = highestBoardValue', () => {
      const state = setupDD(-100);
      service.declareWager(state, 5, 9999);
      expect(state.roundState.wager).toBe(1000);
    });

    test('returns false when not in daily_double_revealed phase', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 5 }), makeSocket());
      expect(service.declareWager(state, 5, 200)).toBe(false);
    });

    test('returns false when wrong player tries to wager', () => {
      const state = setupDD();
      expect(service.declareWager(state, 99, 200)).toBe(false);
    });
  });

  // ---- Buzzer logic ----

  describe('handleBuzz', () => {
    test('returns null when not in buzzers_open phase', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 2 }), makeSocket());
      expect(service.handleBuzz(state, 2)).toBeNull();
    });

    test('first buzz sets phase to player_answering', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 2 }), makeSocket());
      openBuzzers(service, state);

      service.handleBuzz(state, 2);

      expect(state.roundState.phase).toBe('player_answering');
      expect(state.roundState.activePlayerId).toBe(2);
    });

    test('first buzz returns position 1', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 2 }), makeSocket());
      openBuzzers(service, state);

      expect(service.handleBuzz(state, 2)).toBe(1);
    });

    test('second buzz rejected once phase changes to player_answering', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 2 }), makeSocket());
      service.addPlayer(state, makePlayer({ playerId: 3, displayName: 'Bob' }), makeSocket());
      openBuzzers(service, state);

      service.handleBuzz(state, 2);
      // Phase is now player_answering — second buzz is rejected
      const pos = service.handleBuzz(state, 3);

      expect(pos).toBeNull();
      expect(state.roundState.activePlayerId).toBe(2); // still player 2
    });

    test('duplicate buzz from same player returns null', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 2 }), makeSocket());
      openBuzzers(service, state);

      service.handleBuzz(state, 2);
      expect(service.handleBuzz(state, 2)).toBeNull();
    });

    test('disconnected player cannot buzz', () => {
      const state = makeState(service);
      const player = makePlayer({ playerId: 2, isDisconnected: true });
      service.addPlayer(state, player, makeSocket());
      openBuzzers(service, state);

      expect(service.handleBuzz(state, 2)).toBeNull();
    });

    test('first buzz starts answer timer', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 2 }), makeSocket());
      openBuzzers(service, state);

      service.handleBuzz(state, 2);

      expect(state.answerTimer).not.toBeNull();
    });
  });

  describe('releaseBuzzers / lockBuzzers', () => {
    test('releaseBuzzers transitions phase to buzzers_open', () => {
      const state = makeState(service);
      selectTextQuestion(service, state);

      service.releaseBuzzers(state);

      expect(state.roundState.phase).toBe('buzzers_open');
      expect(state.roundState.buzzerLockReason).toBeNull();
    });

    test('releaseBuzzers starts buzz timer', () => {
      const state = makeState(service);
      selectTextQuestion(service, state);

      service.releaseBuzzers(state);

      expect(state.buzzTimer).not.toBeNull();
    });

    test('releaseBuzzers is a no-op when not in question_revealed', () => {
      const state = makeState(service);
      // idle phase
      service.releaseBuzzers(state);
      expect(state.roundState.phase).toBe('idle');
    });

    test('lockBuzzers sets buzzerLockReason to host_controlled', () => {
      const state = makeState(service, { mode: 'user_hosted' });
      selectTextQuestion(service, state);
      service.releaseBuzzers(state);

      service.lockBuzzers(state);

      expect(state.roundState.buzzerLockReason).toBe('host_controlled');
    });

    test('lockBuzzers clears a running buzz timer', () => {
      const state = makeState(service, { mode: 'user_hosted' });
      selectTextQuestion(service, state);
      service.releaseBuzzers(state);
      expect(state.buzzTimer).not.toBeNull();

      service.lockBuzzers(state);

      expect(state.buzzTimer).toBeNull();
    });

    test('buzz window timeout triggers round_timeout', () => {
      const state = makeState(service);
      openBuzzers(service, state);

      vi.advanceTimersByTime(BUZZ_WINDOW_DURATION_MS);

      expect(state.roundState.phase).toBe('round_timeout');
    });
  });

  // ---- Answer handling ----

  describe('submitAnswer', () => {
    test('stores answer and returns true for active player', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 2 }), makeSocket());
      openBuzzers(service, state);
      service.handleBuzz(state, 2);

      const ok = service.submitAnswer(state, 2, 'My answer');

      expect(ok).toBe(true);
      expect(state.roundState.submittedAnswer).toBe('My answer');
    });

    test('returns false when wrong player submits', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 2 }), makeSocket());
      service.addPlayer(state, makePlayer({ playerId: 3, displayName: 'Bob' }), makeSocket());
      openBuzzers(service, state);
      service.handleBuzz(state, 2);

      expect(service.submitAnswer(state, 3, 'Wrong player')).toBe(false);
    });

    test('returns false when not in player_answering phase', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 2 }), makeSocket());
      openBuzzers(service, state);
      // No buzz yet — phase is buzzers_open

      expect(service.submitAnswer(state, 2, 'Too early')).toBe(false);
    });

    test('clears the answer timer on submission', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 2 }), makeSocket());
      openBuzzers(service, state);
      service.handleBuzz(state, 2);
      expect(state.answerTimer).not.toBeNull();

      service.submitAnswer(state, 2, 'Answer');

      expect(state.answerTimer).toBeNull();
    });
  });

  // ---- Evaluation / scoring ----

  describe('applyEvaluationResult', () => {
    test('correct answer adds pointValue to score', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 2, score: 0 }), makeSocket());
      openBuzzers(service, state);
      service.handleBuzz(state, 2);
      state.roundState.pointValue = 400;

      const result = service.applyEvaluationResult(state, 2, true);

      expect(result.pointDelta).toBe(400);
      expect(result.newScore).toBe(400);
      expect(state.players.get(2)?.score).toBe(400);
    });

    test('wrong answer deducts pointValue from score', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 2, score: 600 }), makeSocket());
      openBuzzers(service, state);
      service.handleBuzz(state, 2);
      state.roundState.pointValue = 200;

      const result = service.applyEvaluationResult(state, 2, false);

      expect(result.pointDelta).toBe(-200);
      expect(result.newScore).toBe(400);
    });

    test('score can go negative', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 2, score: 0 }), makeSocket());
      openBuzzers(service, state);
      service.handleBuzz(state, 2);
      state.roundState.pointValue = 200;

      const result = service.applyEvaluationResult(state, 2, false);

      expect(result.newScore).toBe(-200);
    });

    test('calls onScoreChanged callback', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 2 }), makeSocket());
      openBuzzers(service, state);
      service.handleBuzz(state, 2);
      state.roundState.pointValue = 200;

      service.applyEvaluationResult(state, 2, true);

      expect(state.onScoreChanged).toHaveBeenCalledWith(2, 200);
    });

    test('correct answer is roundOver=true', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 2 }), makeSocket());
      openBuzzers(service, state);
      service.handleBuzz(state, 2);
      state.roundState.pointValue = 200;

      const result = service.applyEvaluationResult(state, 2, true);

      expect(result.roundOver).toBe(true);
    });

    test('wrong non-DD answer is roundOver=false', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 2 }), makeSocket());
      openBuzzers(service, state);
      service.handleBuzz(state, 2);
      state.roundState.pointValue = 200;
      state.roundState.isDailyDouble = false;

      const result = service.applyEvaluationResult(state, 2, false);

      expect(result.roundOver).toBe(false);
    });

    test('DD: wrong answer uses wager and is roundOver=true', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 5, score: 1000 }), makeSocket());
      service.selectQuestion(state, 1, 1, 1, 200, true, [{ type: 'text', value: 'Q' }], [], 5);
      service.declareWager(state, 5, 500);
      state.roundState.phase = 'player_answering';

      const result = service.applyEvaluationResult(state, 5, false);

      expect(result.pointDelta).toBe(-500);
      expect(result.roundOver).toBe(true);
    });

    test('DD correct answer adds the declared wager and sets questionSelecterId to the answerer', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 5, score: 1000 }), makeSocket());
      service.selectQuestion(state, 1, 1, 1, 200, true, [{ type: 'text', value: 'Q' }], [], 5);
      service.declareWager(state, 5, 500);
      state.roundState.phase = 'player_answering';

      const result = service.applyEvaluationResult(state, 5, true);

      expect(result.pointDelta).toBe(500); // wager, not pointValue (200)
      expect(result.newScore).toBe(1500);
      expect(result.roundOver).toBe(true);
      expect(state.roundState.questionSelecterId).toBe(5);
    });

    test('correct answer sets questionSelecterId to answering player', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 2 }), makeSocket());
      openBuzzers(service, state);
      service.handleBuzz(state, 2);
      state.roundState.pointValue = 200;

      service.applyEvaluationResult(state, 2, true);

      expect(state.roundState.questionSelecterId).toBe(2);
    });
  });

  // ---- advanceBuzzQueue ----

  describe('advanceBuzzQueue', () => {
    test('moves to next buzzer in queue', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 2 }), makeSocket());
      service.addPlayer(state, makePlayer({ playerId: 3, displayName: 'Bob' }), makeSocket());
      // handleBuzz only allows one buzz per phase (phase changes on first buzz).
      // Seed the queue manually to test the multi-entry path of advanceBuzzQueue.
      state.roundState.buzzQueue = [2, 3];
      state.roundState.activePlayerId = 2;
      state.roundState.phase = 'player_answering';

      service.advanceBuzzQueue(state);

      expect(state.roundState.activePlayerId).toBe(3);
      expect(state.roundState.phase).toBe('player_answering');
    });

    test('no more buzzers → reopens buzzers_open and starts buzz timer', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 2 }), makeSocket());
      openBuzzers(service, state);
      service.handleBuzz(state, 2);

      service.advanceBuzzQueue(state);

      expect(state.roundState.phase).toBe('buzzers_open');
      expect(state.buzzTimer).not.toBeNull();
    });
  });

  // ---- completeRound / handleRoundTimeout ----

  describe('completeRound', () => {
    test('sets phase to round_complete', () => {
      const state = makeState(service);
      openBuzzers(service, state);
      service.completeRound(state);
      expect(state.roundState.phase).toBe('round_complete');
    });

    test('returns to idle after ANSWER_REVEAL_DURATION_MS', () => {
      const state = makeState(service);
      state.roundState.questionSelecterId = 7;
      openBuzzers(service, state);
      service.completeRound(state);

      vi.advanceTimersByTime(ANSWER_REVEAL_DURATION_MS);

      expect(state.roundState.phase).toBe('idle');
    });

    test('preserves questionSelecterId after returning to idle', () => {
      const state = makeState(service);
      openBuzzers(service, state);
      // Set after openBuzzers — selectTextQuestion inside it overwrites questionSelecterId to 2
      state.roundState.questionSelecterId = 7;
      service.completeRound(state);

      vi.advanceTimersByTime(ANSWER_REVEAL_DURATION_MS);

      expect(state.roundState.questionSelecterId).toBe(7);
    });
  });

  describe('handleRoundTimeout', () => {
    test('sets phase to round_timeout', () => {
      const state = makeState(service);
      service.handleRoundTimeout(state);
      expect(state.roundState.phase).toBe('round_timeout');
    });

    test('returns to idle after ANSWER_REVEAL_DURATION_MS', () => {
      const state = makeState(service);
      const selecterId = 3;
      state.roundState.questionSelecterId = selecterId;
      service.handleRoundTimeout(state);

      vi.advanceTimersByTime(ANSWER_REVEAL_DURATION_MS);

      expect(state.roundState.phase).toBe('idle');
      expect(state.roundState.questionSelecterId).toBe(selecterId);
    });
  });

  // ---- Answer timer ----

  describe('answer timer', () => {
    test('answer timeout deducts points and calls onScoreChanged', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 2, score: 400 }), makeSocket());
      openBuzzers(service, state);
      service.handleBuzz(state, 2);
      state.roundState.pointValue = 200;

      vi.advanceTimersByTime(ANSWER_TIMER_DURATION_MS);

      expect(state.players.get(2)?.score).toBe(200);
      expect(state.onScoreChanged).toHaveBeenCalled();
    });
  });

  // ---- Player ready / video ended ----

  describe('handlePlayerReady', () => {
    test('returns false for unknown player', () => {
      const state = makeState(service);
      expect(service.handlePlayerReady(state, 999)).toBe(false);
    });

    test('all active players ready releases buzzers', () => {
      const state = makeState(service, { mode: 'computer_hosted' });
      const socket1 = makeSocket();
      const socket2 = makeSocket();
      service.addPlayer(state, makePlayer({ playerId: 2 }), socket1);
      service.addPlayer(state, makePlayer({ playerId: 3, displayName: 'Bob' }), socket2);

      // Select an image question so lock reason = awaiting_ready
      service.selectQuestion(
        state, 1, 1, 1, 200, false,
        [{ type: 'image', url: 'http://x.com/img.png', alt: '' }],
        [], 1,
      );

      service.handlePlayerReady(state, 2);
      const allReady = service.handlePlayerReady(state, 3);

      expect(allReady).toBe(true);
      expect(state.roundState.phase).toBe('buzzers_open');
    });

    test('not all players ready returns false', () => {
      const state = makeState(service, { mode: 'computer_hosted' });
      service.addPlayer(state, makePlayer({ playerId: 2 }), makeSocket());
      service.addPlayer(state, makePlayer({ playerId: 3, displayName: 'Bob' }), makeSocket());

      service.selectQuestion(
        state, 1, 1, 1, 200, false,
        [{ type: 'image', url: 'http://x.com/img.png', alt: '' }],
        [], 1,
      );

      const result = service.handlePlayerReady(state, 2); // only 1 of 2
      expect(result).toBe(false);
    });

    test('disconnected player is excluded from ready count; 1 connected player ready releases buzzers', () => {
      const state = makeState(service, { mode: 'computer_hosted' });
      service.addPlayer(state, makePlayer({ playerId: 2 }), makeSocket());
      service.addPlayer(state, makePlayer({ playerId: 3, displayName: 'Bob', isDisconnected: true }), makeSocket());

      service.selectQuestion(
        state, 1, 1, 1, 200, false,
        [{ type: 'image', url: 'http://x.com/img.png', alt: '' }],
        [], 1,
      );

      // Only player 2 is active; player 3 is disconnected and should not block release.
      const allReady = service.handlePlayerReady(state, 2);

      expect(allReady).toBe(true);
      expect(state.roundState.phase).toBe('buzzers_open');
    });

    test('MAX_READY_WAIT_MS fallback timer releases buzzers even if not all players are ready', () => {
      const state = makeState(service, { mode: 'computer_hosted' });
      service.addPlayer(state, makePlayer({ playerId: 2 }), makeSocket());
      service.addPlayer(state, makePlayer({ playerId: 3, displayName: 'Bob' }), makeSocket());

      service.selectQuestion(
        state, 1, 1, 1, 200, false,
        [{ type: 'image', url: 'http://x.com/img.png', alt: '' }],
        [], 1,
      );
      expect(state.roundState.phase).toBe('question_revealed');

      vi.advanceTimersByTime(MAX_READY_WAIT_MS);

      expect(state.roundState.phase).toBe('buzzers_open');
    });
  });

  // ---- handleVideoEnded ----

  describe('handleVideoEnded', () => {
    test('returns false for unknown player', () => {
      const state = makeState(service);
      expect(service.handleVideoEnded(state, 999)).toBe(false);
    });

    test('all active players signal video_ended → releases buzzers', () => {
      const state = makeState(service, { mode: 'computer_hosted' });
      service.addPlayer(state, makePlayer({ playerId: 2 }), makeSocket());
      service.addPlayer(state, makePlayer({ playerId: 3, displayName: 'Bob' }), makeSocket());

      service.selectQuestion(
        state, 1, 1, 1, 200, false,
        [{ type: 'video', url: 'http://x.com/vid.mp4' }],
        [], 1,
      );

      service.handleVideoEnded(state, 2);
      const allDone = service.handleVideoEnded(state, 3);

      expect(allDone).toBe(true);
      expect(state.roundState.phase).toBe('buzzers_open');
    });

    test('only one of two players signals → returns false', () => {
      const state = makeState(service, { mode: 'computer_hosted' });
      service.addPlayer(state, makePlayer({ playerId: 2 }), makeSocket());
      service.addPlayer(state, makePlayer({ playerId: 3, displayName: 'Bob' }), makeSocket());

      service.selectQuestion(
        state, 1, 1, 1, 200, false,
        [{ type: 'video', url: 'http://x.com/vid.mp4' }],
        [], 1,
      );

      expect(service.handleVideoEnded(state, 2)).toBe(false);
    });
  });

  // ---- buildFullStateSync ----

  describe('buildFullStateSync', () => {
    test('strips answerContent when phase is not complete/timeout', () => {
      const state = makeState(service);
      openBuzzers(service, state);
      state.roundState.answerContent = [{ type: 'text', value: 'The answer' }];
      state.roundState.phase = 'player_answering';

      const sync = service.buildFullStateSync(state);

      expect(sync.roundState.answerContent).toBeNull();
    });

    test('includes answerContent when phase is round_complete', () => {
      const state = makeState(service);
      state.roundState.phase = 'round_complete';
      state.roundState.answerContent = [{ type: 'text', value: 'The answer' }];

      const sync = service.buildFullStateSync(state);

      expect(sync.roundState.answerContent).not.toBeNull();
    });

    test('includes answerContent when phase is round_timeout', () => {
      const state = makeState(service);
      state.roundState.phase = 'round_timeout';
      state.roundState.answerContent = [{ type: 'text', value: 'The answer' }];

      const sync = service.buildFullStateSync(state);

      expect(sync.roundState.answerContent).not.toBeNull();
    });

    test('does not mutate state.roundState.answerContent when stripping it from the sync payload', () => {
      const state = makeState(service);
      const originalContent = [{ type: 'text' as const, value: 'Secret answer' }];
      state.roundState.answerContent = originalContent;
      state.roundState.phase = 'player_answering';

      const sync = service.buildFullStateSync(state);

      expect(sync.roundState.answerContent).toBeNull();
      expect(state.roundState.answerContent).toBe(originalContent); // original reference preserved
    });

    test('players array is derived from Map values', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 2 }), makeSocket());
      service.addPlayer(state, makePlayer({ playerId: 3, displayName: 'Bob' }), makeSocket());

      const sync = service.buildFullStateSync(state);

      expect(sync.players).toHaveLength(2);
    });
  });

  // ---- markBoardQuestionAnswered ----

  describe('markBoardQuestionAnswered', () => {
    test('sets isAnswered=true on matching question', () => {
      const state = makeState(service);
      const q = state.board.categories[0].questions[0];
      expect(q.isAnswered).toBe(false);

      service.markBoardQuestionAnswered(state, q.questionId);

      expect(q.isAnswered).toBe(true);
    });

    test('does not modify other questions', () => {
      const state = makeState(service);
      const questions = state.board.categories[0].questions;
      service.markBoardQuestionAnswered(state, questions[0].questionId);

      expect(questions[1].isAnswered).toBe(false);
    });

    test('no-op for unknown questionId', () => {
      const state = makeState(service);
      expect(() => service.markBoardQuestionAnswered(state, 9999)).not.toThrow();
    });
  });

  // ---- getActivePlayerCount ----

  describe('getActivePlayerCount', () => {
    test('counts only non-disconnected players', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 1 }), makeSocket());
      service.addPlayer(state, makePlayer({ playerId: 2, displayName: 'Bob', isDisconnected: true }), makeSocket());
      service.addPlayer(state, makePlayer({ playerId: 3, displayName: 'Carol' }), makeSocket());

      expect(service.getActivePlayerCount(state)).toBe(2);
    });

    test('returns 0 when no players', () => {
      const state = makeState(service);
      expect(service.getActivePlayerCount(state)).toBe(0);
    });
  });

  // ---- broadcast / sendTo ----

  describe('broadcast', () => {
    test('sends to all connected sockets', () => {
      const state = makeState(service);
      const s1 = makeSocket();
      const s2 = makeSocket();
      service.addPlayer(state, makePlayer({ playerId: 2 }), s1);
      service.addPlayer(state, makePlayer({ playerId: 3, displayName: 'Bob' }), s2);

      service.broadcast(state, { type: 'buzzers_released' });

      expect(s1.send).toHaveBeenCalledOnce();
      expect(s2.send).toHaveBeenCalledOnce();
    });

    test('excludes specified socket from broadcast', () => {
      const state = makeState(service);
      const s1 = makeSocket();
      const s2 = makeSocket();
      service.addPlayer(state, makePlayer({ playerId: 2 }), s1);
      service.addPlayer(state, makePlayer({ playerId: 3, displayName: 'Bob' }), s2);

      service.broadcast(state, { type: 'buzzers_released' }, s1);

      expect(s1.send).not.toHaveBeenCalled();
      expect(s2.send).toHaveBeenCalledOnce();
    });

    test('does not send to closed sockets', () => {
      const state = makeState(service);
      const closedSocket = makeSocket(false);
      service.addPlayer(state, makePlayer({ playerId: 2 }), closedSocket);

      service.broadcast(state, { type: 'buzzers_released' });

      expect(closedSocket.send).not.toHaveBeenCalled();
    });
  });

  describe('sendTo', () => {
    test('sends to an open socket and silently skips a closed socket', () => {
      const openSocket = makeSocket(true);
      const closedSocket = makeSocket(false);
      const msg = { type: 'buzzers_released' } as const;

      service.sendTo(openSocket, msg);
      service.sendTo(closedSocket, msg);

      expect(openSocket.send).toHaveBeenCalledOnce();
      expect(closedSocket.send).not.toHaveBeenCalled();
    });
  });

  describe('timer leak prevention', () => {
    test('selectQuestion called twice does not leak the first lockTimer', () => {
      const state = makeState(service);
      service.addPlayer(state, makePlayer({ playerId: 1 }), makeSocket());

      // First selection — lockTimer starts
      service.selectQuestion(
        state, 1, 1, 1, 200, false,
        [{ type: 'text', value: 'First question' }],
        [{ type: 'text', value: 'Answer' }],
        1,
      );
      expect(state.lockTimer).not.toBeNull();

      // Second selection before first timer fires
      service.selectQuestion(
        state, 2, 2, 1, 400, false,
        [{ type: 'text', value: 'Second question' }],
        [{ type: 'text', value: 'Answer' }],
        1,
      );

      const releaseSpy = vi.spyOn(service as unknown as { releaseBuzzers: () => void }, 'releaseBuzzers');
      vi.advanceTimersByTime(TEXT_MAX_LOCK_MS + 1000);

      // Only one releaseBuzzers call — from the second timer, not both
      expect(releaseSpy).toHaveBeenCalledTimes(1);
    });
  });
});
