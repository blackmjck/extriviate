import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal, computed } from '@angular/core';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import type {
  GameplayMessage,
  LivePlayer,
  RoundStatePayload,
  FullStateSyncPayload,
  GameBoard,
} from '@extriviate/shared';
import { GameStateService } from './game-state.service';
import { GameSocketService } from './game-socket.service';
import { AuthService } from './auth.service';
import { GuestSessionService } from './guest-session.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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
    audioMuted: true,
    peerId: null,
    ...overrides,
  };
}

function makeRoundState(overrides: Partial<RoundStatePayload> = {}): RoundStatePayload {
  return {
    phase: 'idle',
    gameCategoryId: null,
    questionId: null,
    rowPosition: null,
    pointValue: null,
    isDailyDouble: false,
    questionContent: null,
    answerContent: null,
    buzzerLockReason: null,
    activePlayerId: null,
    questionSelecterId: null,
    submittedAnswer: null,
    wager: null,
    buzzQueue: [],
    isCorrect: null,
    timerDeadlineMs: null,
    ...overrides,
  };
}

/** Minimal board fixture — cast to satisfy GameBoard typing in tests. */
function makeBoard() {
  return {
    categories: [
      {
        id: 1,
        gameId: 1,
        categoryId: 1,
        position: 1,
        category: {
          id: 1,
          creatorId: 1,
          name: 'Science',
          description: null,
          createdAt: '',
          updatedAt: '',
        },
        questions: [
          {
            id: 10,
            gameId: 1,
            gameCategoryId: 1,
            questionId: 10,
            rowPosition: 1,
            pointValue: 200,
            isDailyDouble: false,
            isAnswered: false,
            question: null,
          },
        ],
      },
    ],
  } as unknown as GameBoard;
}

function makeFullStateSync(overrides: Partial<FullStateSyncPayload> = {}): FullStateSyncPayload {
  return {
    sessionId: 1,
    gameId: 1,
    sessionName: 'Test Game',
    joinCode: 'ABC123',
    board: makeBoard(),
    mode: 'computer_hosted',
    turnBased: false,
    status: 'active',
    players: [makePlayer()],
    roundState: makeRoundState(),
    hostPlayerId: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup helper
// ---------------------------------------------------------------------------

function setup(authUserId: number | null = null, guestPlayerId: number | null = null) {
  const messages$ = new Subject<GameplayMessage>();

  const mockSocket = {
    messages$,
    send: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    flushPendingMessages: vi.fn(),
    connectionState: signal<'disconnected' | 'connecting' | 'connected'>('disconnected'),
    reconnecting: signal(false),
  };

  const mockAuth = {
    currentUser: signal(
      authUserId !== null
        ? { id: authUserId, displayName: 'Test', role: 'creator' as const, createdAt: '' }
        : null,
    ),
    isAuthenticated: computed(() => authUserId !== null),
    getAccessToken: vi.fn().mockReturnValue(null),
    getAuthHeaders: vi.fn().mockReturnValue({}),
  };

  const mockGuest = {
    hasSession: vi.fn().mockReturnValue(guestPlayerId !== null),
    getToken: vi.fn().mockReturnValue(null),
    getPlayerId: vi.fn().mockReturnValue(guestPlayerId),
    getSessionId: vi.fn().mockReturnValue(null),
    clear: vi.fn(),
    store: vi.fn(),
  };

  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      GameStateService,
      { provide: GameSocketService, useValue: mockSocket },
      { provide: AuthService, useValue: mockAuth },
      { provide: GuestSessionService, useValue: mockGuest },
    ],
  });

  const service = TestBed.inject(GameStateService);
  return { service, messages$ };
}

afterEach(() => {
  vi.clearAllMocks();
  TestBed.resetTestingModule();
});

// ---------------------------------------------------------------------------
// initial signal state
// ---------------------------------------------------------------------------

describe('initial signal state', () => {
  it('all 11 signals have their default values', () => {
    const { service } = setup();
    expect(service.players()).toEqual([]);
    expect(service.roundState()).toBeNull();
    expect(service.sessionStatus()).toBe('lobby');
    expect(service.hostPlayerId()).toBeNull();
    expect(service.mode()).toBe('computer_hosted');
    expect(service.turnBased()).toBe(false);
    expect(service.board()).toBeNull();
    expect(service.gameId()).toBeNull();
    expect(service.sessionId()).toBeNull();
    expect(service.sessionName()).toBe('');
    expect(service.joinCode()).toBe('');
  });
});

// ---------------------------------------------------------------------------
// full_state_sync
// ---------------------------------------------------------------------------

describe('full_state_sync', () => {
  it('replaces all 11 signals from the payload', () => {
    const { service, messages$ } = setup();
    const state = makeFullStateSync({
      gameId: 99,
      joinCode: 'ZYXWVU',
      sessionName: 'My Game',
      mode: 'user_hosted',
      turnBased: true,
      hostPlayerId: 42,
      status: 'active',
      sessionId: 7,
    });
    messages$.next({ type: 'full_state_sync', state });

    expect(service.gameId()).toBe(99);
    expect(service.joinCode()).toBe('ZYXWVU');
    expect(service.sessionName()).toBe('My Game');
    expect(service.mode()).toBe('user_hosted');
    expect(service.turnBased()).toBe(true);
    expect(service.hostPlayerId()).toBe(42);
    expect(service.sessionStatus()).toBe('active');
    expect(service.sessionId()).toBe(7);
    expect(service.players()).toEqual(state.players);
    expect(service.board()).toBe(state.board);
    expect(service.roundState()).toEqual(state.roundState);
  });

  it('completely replaces the players array (not merged)', () => {
    const { service, messages$ } = setup();
    messages$.next({
      type: 'full_state_sync',
      state: makeFullStateSync({
        players: [makePlayer({ playerId: 1 }), makePlayer({ playerId: 2 })],
      }),
    });
    expect(service.players()).toHaveLength(2);

    messages$.next({
      type: 'full_state_sync',
      state: makeFullStateSync({ players: [makePlayer({ playerId: 3, displayName: 'Bob' })] }),
    });
    expect(service.players()).toHaveLength(1);
    expect(service.players()[0].playerId).toBe(3);
  });

  it('completely replaces the board (not merged)', () => {
    const { service, messages$ } = setup();
    const board1 = makeBoard();
    messages$.next({ type: 'full_state_sync', state: makeFullStateSync({ board: board1 }) });
    expect(service.board()).toBe(board1);

    const board2 = makeBoard();
    messages$.next({ type: 'full_state_sync', state: makeFullStateSync({ board: board2 }) });
    expect(service.board()).toBe(board2);
  });
});

// ---------------------------------------------------------------------------
// round_state_update
// ---------------------------------------------------------------------------

describe('round_state_update', () => {
  it('replaces roundState with the payload', () => {
    const { service, messages$ } = setup();
    messages$.next({
      type: 'round_state_update',
      roundState: makeRoundState({ phase: 'buzzers_open' }),
    });
    expect(service.roundState()?.phase).toBe('buzzers_open');
  });

  it('does not modify players or sessionStatus', () => {
    const { service, messages$ } = setup();
    messages$.next({
      type: 'full_state_sync',
      state: makeFullStateSync({ status: 'active', players: [makePlayer()] }),
    });
    messages$.next({
      type: 'round_state_update',
      roundState: makeRoundState({ phase: 'question_revealed' }),
    });
    expect(service.players()).toHaveLength(1);
    expect(service.sessionStatus()).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// player_disconnected
// ---------------------------------------------------------------------------

describe('player_disconnected', () => {
  it('sets isDisconnected to true for the matching player', () => {
    const { service, messages$ } = setup();
    messages$.next({
      type: 'full_state_sync',
      state: makeFullStateSync({
        players: [makePlayer({ playerId: 1 }), makePlayer({ playerId: 2 })],
      }),
    });
    messages$.next({ type: 'player_disconnected', playerId: 1 });
    const p1 = service.players().find((p) => p.playerId === 1)!;
    const p2 = service.players().find((p) => p.playerId === 2)!;
    expect(p1.isDisconnected).toBe(true);
    expect(p2.isDisconnected).toBe(false);
  });

  it('does not modify roundState or sessionStatus', () => {
    const { service, messages$ } = setup();
    messages$.next({
      type: 'full_state_sync',
      state: makeFullStateSync({ status: 'active' }),
    });
    messages$.next({ type: 'round_state_update', roundState: makeRoundState({ phase: 'idle' }) });
    messages$.next({ type: 'player_disconnected', playerId: 1 });
    expect(service.roundState()?.phase).toBe('idle');
    expect(service.sessionStatus()).toBe('active');
  });

  it('is a no-op for unknown playerId', () => {
    const { service, messages$ } = setup();
    messages$.next({
      type: 'full_state_sync',
      state: makeFullStateSync({ players: [makePlayer({ playerId: 1 })] }),
    });
    messages$.next({ type: 'player_disconnected', playerId: 999 });
    expect(service.players()).toHaveLength(1);
    expect(service.players()[0].isDisconnected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// player_reconnected
// ---------------------------------------------------------------------------

describe('player_reconnected', () => {
  it('sets isDisconnected to false for the matching player', () => {
    const { service, messages$ } = setup();
    messages$.next({
      type: 'full_state_sync',
      state: makeFullStateSync({
        players: [makePlayer({ playerId: 1, isDisconnected: true })],
      }),
    });
    messages$.next({ type: 'player_reconnected', playerId: 1 });
    expect(service.players()[0].isDisconnected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// player_removed
// ---------------------------------------------------------------------------

describe('player_removed', () => {
  it('removes the matching player from the players array', () => {
    const { service, messages$ } = setup();
    messages$.next({
      type: 'full_state_sync',
      state: makeFullStateSync({
        players: [
          makePlayer({ playerId: 1 }),
          makePlayer({ playerId: 2 }),
          makePlayer({ playerId: 3 }),
        ],
      }),
    });
    messages$.next({ type: 'player_removed', playerId: 2 });
    expect(service.players()).toHaveLength(2);
    expect(service.players().find((p) => p.playerId === 2)).toBeUndefined();
  });

  it('is a no-op for unknown playerId', () => {
    const { service, messages$ } = setup();
    messages$.next({
      type: 'full_state_sync',
      state: makeFullStateSync({ players: [makePlayer({ playerId: 1 })] }),
    });
    messages$.next({ type: 'player_removed', playerId: 999 });
    expect(service.players()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// answer_result
// ---------------------------------------------------------------------------

describe('answer_result', () => {
  it('updates the matching player score', () => {
    const { service, messages$ } = setup();
    messages$.next({
      type: 'full_state_sync',
      state: makeFullStateSync({ players: [makePlayer({ playerId: 1, score: 200 })] }),
    });
    messages$.next({
      type: 'answer_result',
      playerId: 1,
      correct: true,
      pointDelta: 400,
      newScore: 600,
    });
    expect(service.players()[0].score).toBe(600);
  });

  it('sets roundState.isCorrect to true on correct answer', () => {
    const { service, messages$ } = setup();
    messages$.next({
      type: 'full_state_sync',
      state: makeFullStateSync({ players: [makePlayer({ playerId: 1 })] }),
    });
    messages$.next({
      type: 'answer_result',
      playerId: 1,
      correct: true,
      pointDelta: 200,
      newScore: 200,
    });
    expect(service.roundState()?.isCorrect).toBe(true);
  });

  it('sets roundState.isCorrect to false on wrong answer', () => {
    const { service, messages$ } = setup();
    messages$.next({
      type: 'full_state_sync',
      state: makeFullStateSync({ players: [makePlayer({ playerId: 1 })] }),
    });
    messages$.next({
      type: 'answer_result',
      playerId: 1,
      correct: false,
      pointDelta: -200,
      newScore: -200,
    });
    expect(service.roundState()?.isCorrect).toBe(false);
  });

  it('does not change sessionStatus or board', () => {
    const { service, messages$ } = setup();
    const board = makeBoard();
    messages$.next({
      type: 'full_state_sync',
      state: makeFullStateSync({ players: [makePlayer({ playerId: 1 })], status: 'active', board }),
    });
    messages$.next({
      type: 'answer_result',
      playerId: 1,
      correct: true,
      pointDelta: 200,
      newScore: 200,
    });
    expect(service.sessionStatus()).toBe('active');
    expect(service.board()).toBe(board);
  });
});

// ---------------------------------------------------------------------------
// buzz_received
// ---------------------------------------------------------------------------

describe('buzz_received', () => {
  it('appends playerId to roundState.buzzQueue', () => {
    const { service, messages$ } = setup();
    messages$.next({
      type: 'full_state_sync',
      state: makeFullStateSync({ roundState: makeRoundState({ buzzQueue: [1] }) }),
    });
    messages$.next({ type: 'buzz_received', playerId: 2, position: 1 });
    expect(service.roundState()?.buzzQueue).toEqual([1, 2]);
  });

  it('does nothing when roundState is null', () => {
    const { messages$ } = setup();
    // roundState is null by default (no full_state_sync)
    expect(() => {
      messages$.next({ type: 'buzz_received', playerId: 1, position: 0 });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// answer_submitted
// ---------------------------------------------------------------------------

describe('answer_submitted', () => {
  it('updates submittedAnswer and activePlayerId on roundState', () => {
    const { service, messages$ } = setup();
    messages$.next({ type: 'full_state_sync', state: makeFullStateSync() });
    messages$.next({ type: 'answer_submitted', playerId: 3, answer: 'What is Paris?' });
    expect(service.roundState()?.submittedAnswer).toBe('What is Paris?');
    expect(service.roundState()?.activePlayerId).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// host_assigned_player
// ---------------------------------------------------------------------------

describe('host_assigned_player', () => {
  it('adds a new player to the players array', () => {
    const { service, messages$ } = setup();
    messages$.next({
      type: 'full_state_sync',
      state: makeFullStateSync({ players: [] }),
    });
    messages$.next({ type: 'host_assigned_player', playerId: 5, displayName: 'Charlie' });
    expect(service.players()).toHaveLength(1);
    expect(service.players()[0].playerId).toBe(5);
    expect(service.players()[0].displayName).toBe('Charlie');
    expect(service.players()[0].score).toBe(0);
  });

  it('does not add a duplicate if playerId already exists', () => {
    const { service, messages$ } = setup();
    messages$.next({
      type: 'full_state_sync',
      state: makeFullStateSync({ players: [] }),
    });
    messages$.next({ type: 'host_assigned_player', playerId: 5, displayName: 'Charlie' });
    messages$.next({ type: 'host_assigned_player', playerId: 5, displayName: 'Charlie' });
    expect(service.players()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// media_state_update
// ---------------------------------------------------------------------------

describe('media_state_update', () => {
  it('updates cameraActive and audioMuted for the matching player', () => {
    const { service, messages$ } = setup();
    messages$.next({
      type: 'full_state_sync',
      state: makeFullStateSync({
        players: [makePlayer({ playerId: 1, cameraActive: false, audioMuted: true })],
      }),
    });
    messages$.next({
      type: 'media_state_update',
      playerId: 1,
      cameraActive: true,
      audioMuted: false,
    });
    expect(service.players()[0].cameraActive).toBe(true);
    expect(service.players()[0].audioMuted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// currentPlayerId computed signal
// ---------------------------------------------------------------------------

describe('currentPlayerId computed signal', () => {
  it('returns auth user id when authenticated', () => {
    const { service } = setup(7, null);
    expect(service.currentPlayerId()).toBe(7);
  });

  it('falls back to guest player id when not authenticated', () => {
    const { service } = setup(null, 42);
    expect(service.currentPlayerId()).toBe(42);
  });

  it('returns null when neither auth nor guest', () => {
    const { service } = setup(null, null);
    expect(service.currentPlayerId()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isHost computed signal
// ---------------------------------------------------------------------------

describe('isHost computed signal', () => {
  it('returns true when currentPlayerId equals hostPlayerId', () => {
    const { service, messages$ } = setup(7, null);
    messages$.next({
      type: 'full_state_sync',
      state: makeFullStateSync({ hostPlayerId: 7 }),
    });
    expect(service.isHost()).toBe(true);
  });

  it('returns false when currentPlayerId differs from hostPlayerId', () => {
    const { service, messages$ } = setup(3, null);
    messages$.next({
      type: 'full_state_sync',
      state: makeFullStateSync({ hostPlayerId: 7 }),
    });
    expect(service.isHost()).toBe(false);
  });

  it('returns false when currentPlayerId is null', () => {
    const { service, messages$ } = setup(null, null);
    messages$.next({
      type: 'full_state_sync',
      state: makeFullStateSync({ hostPlayerId: 7 }),
    });
    expect(service.isHost()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// markQuestionAnswered()
// ---------------------------------------------------------------------------

describe('markQuestionAnswered()', () => {
  it('sets isAnswered to true for the matching game question id', () => {
    const { service, messages$ } = setup();
    messages$.next({ type: 'full_state_sync', state: makeFullStateSync() });
    service.markQuestionAnswered(10);
    expect(service.board()?.categories[0].questions[0].isAnswered).toBe(true);
  });

  it('is a no-op when board is null (no throw)', () => {
    const { service } = setup();
    // board is null — no full_state_sync
    expect(() => service.markQuestionAnswered(10)).not.toThrow();
  });
});
