import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { vi } from 'vitest';
import type { ClientGameMessage } from '@extriviate/shared';
import { GameSocketService } from './game-socket.service';
import { GuestSessionService } from './guest-session.service';

// ---------------------------------------------------------------------------
// MockWebSocket
// ---------------------------------------------------------------------------

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static createdInstances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  readonly send = vi.fn();
  readonly close = vi.fn().mockImplementation(() => {
    this.onclose?.();
  });

  constructor(public readonly url: string) {
    MockWebSocket.createdInstances.push(this);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fireOpen(ws: MockWebSocket) {
  ws.readyState = MockWebSocket.OPEN;
  ws.onopen?.({} as Event);
}

function setup(guestHasSession = false, guestToken: string | null = null) {
  MockWebSocket.createdInstances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);

  const mockGuest = {
    hasSession: vi.fn().mockReturnValue(guestHasSession),
    getToken: vi.fn().mockReturnValue(guestToken),
    getPlayerId: vi.fn().mockReturnValue(null),
    getSessionId: vi.fn().mockReturnValue(null),
    clear: vi.fn(),
    store: vi.fn(),
  };

  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      GameSocketService,
      { provide: GuestSessionService, useValue: mockGuest },
    ],
  });

  const service = TestBed.inject(GameSocketService);
  return { service, mockGuest };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
  TestBed.resetTestingModule();
});

// ---------------------------------------------------------------------------
// connect() / initial connection
// ---------------------------------------------------------------------------

describe('connect() / initial connection', () => {
  it('sets connectionState to "connecting" immediately', () => {
    const { service } = setup();
    service.connect(1);
    expect(service.connectionState()).toBe('connecting');
  });

  it('sets connectionState to "connected" when onopen fires', () => {
    const { service } = setup();
    service.connect(1);
    const ws = MockWebSocket.createdInstances[0];
    fireOpen(ws);
    expect(service.connectionState()).toBe('connected');
  });

  it('reconnecting signal is false on initial connect after onopen', () => {
    const { service } = setup();
    service.connect(1);
    const ws = MockWebSocket.createdInstances[0];
    fireOpen(ws);
    expect(service.reconnecting()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// auth on open — registered user (H-1 regression)
// ---------------------------------------------------------------------------

describe('auth on open — registered user (H-1 regression)', () => {
  it('sends { type: "auth", token } on onopen when token provided and no guest session', () => {
    const { service } = setup(false);
    service.connect(1, 'jwt-token');
    const ws = MockWebSocket.createdInstances[0];
    fireOpen(ws);
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'auth', token: 'jwt-token' }));
  });

  it('does not send auth when no token and no guest session', () => {
    const { service } = setup(false, null);
    service.connect(1, undefined);
    const ws = MockWebSocket.createdInstances[0];
    fireOpen(ws);
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('does not send reconnect_guest for a registered user', () => {
    const { service } = setup(false);
    service.connect(1, 'jwt-token');
    const ws = MockWebSocket.createdInstances[0];
    fireOpen(ws);
    const calls = ws.send.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls.every((s) => !s.includes('reconnect_guest'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// auth on open — guest user
// ---------------------------------------------------------------------------

describe('auth on open — guest user', () => {
  it('sends reconnect_guest on onopen when guest session exists', () => {
    const { service } = setup(true, 'guest-tok');
    service.connect(1);
    const ws = MockWebSocket.createdInstances[0];
    fireOpen(ws);
    expect(ws.send.mock.calls[0][0]).toBe(
      JSON.stringify({ type: 'reconnect_guest', guestToken: 'guest-tok' }),
    );
  });

  it('sends reconnect_guest without flushing pending messages (flush deferred to full_state_sync)', () => {
    const { service } = setup(true, 'guest-tok');
    // Queue a message before connecting
    service.send({ type: 'buzz', playerId: 99 } as ClientGameMessage);
    service.connect(1);
    const ws = MockWebSocket.createdInstances[0];
    fireOpen(ws);
    // Only the identity message is sent; the queued buzz must wait for full_state_sync
    expect(ws.send.mock.calls.length).toBe(1);
    expect(ws.send.mock.calls[0][0]).toContain('reconnect_guest');
  });

  it('does not send reconnect_guest when getToken() returns null', () => {
    const { service } = setup(true, null);
    service.connect(1);
    const ws = MockWebSocket.createdInstances[0];
    fireOpen(ws);
    expect(ws.send).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// pending message queue — FIFO flush
// ---------------------------------------------------------------------------

describe('pending message queue — FIFO flush', () => {
  it('queues messages while socket is not open', () => {
    const { service } = setup();
    service.connect(1);
    const ws = MockWebSocket.createdInstances[0];
    // Socket still CONNECTING — sends should be queued
    service.send({ type: 'buzz', playerId: 1 } as ClientGameMessage);
    service.send({ type: 'buzz', playerId: 2 } as ClientGameMessage);
    service.send({ type: 'buzz', playerId: 3 } as ClientGameMessage);
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('flushes pending messages in FIFO order when flushPendingMessages() is called', () => {
    const { service } = setup(false);
    service.connect(1, undefined);
    const ws = MockWebSocket.createdInstances[0];
    service.send({ type: 'buzz', playerId: 1 } as ClientGameMessage);
    service.send({ type: 'release_buzzers' } as ClientGameMessage);
    service.send({ type: 'lock_buzzers' } as ClientGameMessage);
    fireOpen(ws);
    // onopen sends no messages (no token, no guest). Queue is still held.
    expect(ws.send.mock.calls.length).toBe(0);
    // GameStateService calls this after receiving full_state_sync
    service.flushPendingMessages();
    expect(ws.send.mock.calls[0][0]).toContain('"playerId":1');
    expect(ws.send.mock.calls[1][0]).toContain('release_buzzers');
    expect(ws.send.mock.calls[2][0]).toContain('lock_buzzers');
  });

  it('clears pending messages on disconnect()', () => {
    const { service } = setup();
    service.connect(1);
    const ws = MockWebSocket.createdInstances[0];
    service.send({ type: 'buzz', playerId: 1 } as ClientGameMessage);
    service.disconnect();
    // disconnect closes socket; onclose fires (via MockWebSocket.close)
    // No pending messages should be sent
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('sends directly when already connected', () => {
    const { service } = setup(false);
    service.connect(1, undefined);
    const ws = MockWebSocket.createdInstances[0];
    fireOpen(ws);
    const before = ws.send.mock.calls.length;
    service.send({ type: 'buzz', playerId: 5 } as ClientGameMessage);
    expect(ws.send.mock.calls.length).toBe(before + 1);
    expect(ws.send.mock.calls[before][0]).toContain('buzz');
  });
});

// ---------------------------------------------------------------------------
// disconnect()
// ---------------------------------------------------------------------------

describe('disconnect()', () => {
  it('sets connectionState to "disconnected" synchronously', () => {
    const { service } = setup();
    service.connect(1);
    const ws = MockWebSocket.createdInstances[0];
    fireOpen(ws);
    service.disconnect();
    expect(service.connectionState()).toBe('disconnected');
  });

  it('sets reconnecting to false', () => {
    vi.useFakeTimers();
    const { service } = setup();
    service.connect(1);
    const ws = MockWebSocket.createdInstances[0];
    fireOpen(ws);
    // Trigger reconnect state
    ws.onclose?.();
    expect(service.reconnecting()).toBe(true);
    service.disconnect();
    expect(service.reconnecting()).toBe(false);
  });

  it('sets intentionallyClosed — prevents scheduleReconnect after onclose', () => {
    vi.useFakeTimers();
    const { service } = setup();
    service.connect(1);
    const ws = MockWebSocket.createdInstances[0];
    fireOpen(ws);
    service.disconnect();
    // onclose fires via MockWebSocket.close() in disconnect()
    vi.advanceTimersByTime(31000);
    // Should still be 1 instance — no reconnect attempt
    expect(MockWebSocket.createdInstances.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// reconnect backoff
// ---------------------------------------------------------------------------

describe('reconnect backoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('attempt 0: schedules reconnect with ~1000ms base delay', () => {
    const { service } = setup();
    service.connect(1);
    const ws = MockWebSocket.createdInstances[0];
    fireOpen(ws);
    ws.onclose?.();
    expect(MockWebSocket.createdInstances.length).toBe(1);
    vi.advanceTimersByTime(1200);
    expect(MockWebSocket.createdInstances.length).toBe(2);
  });

  it('attempt 1: schedules reconnect with ~2000ms base delay', () => {
    const { service } = setup();
    service.connect(1);
    const ws1 = MockWebSocket.createdInstances[0];
    fireOpen(ws1);
    ws1.onclose?.();
    vi.advanceTimersByTime(1200); // first reconnect fires
    const ws2 = MockWebSocket.createdInstances[1];
    fireOpen(ws2);
    ws2.onclose?.();
    vi.advanceTimersByTime(2400); // second reconnect fires
    expect(MockWebSocket.createdInstances.length).toBe(3);
  });

  it('backoff caps at 30000ms (does not exceed ~36s)', () => {
    const { service } = setup();
    service.connect(1);
    const ws = MockWebSocket.createdInstances[0];
    fireOpen(ws);
    // Force high attempt count to hit 30s cap
    (service as unknown as { reconnectAttempt: number }).reconnectAttempt = 5;
    ws.onclose?.();
    vi.advanceTimersByTime(36000);
    expect(MockWebSocket.createdInstances.length).toBe(2);
  });

  it('reconnecting signal is true while waiting, false after open', () => {
    const { service } = setup();
    service.connect(1);
    const ws = MockWebSocket.createdInstances[0];
    fireOpen(ws);
    ws.onclose?.();
    expect(service.reconnecting()).toBe(true);
    vi.advanceTimersByTime(1200);
    const ws2 = MockWebSocket.createdInstances[1];
    fireOpen(ws2);
    expect(service.reconnecting()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// message parsing
// ---------------------------------------------------------------------------

describe('message parsing', () => {
  it('emits parsed GameplayMessage to messages$', () => {
    const { service } = setup();
    service.connect(1);
    const ws = MockWebSocket.createdInstances[0];
    fireOpen(ws);

    const received: unknown[] = [];
    service.messages$.subscribe((m) => received.push(m));

    ws.onmessage?.({ data: JSON.stringify({ type: 'buzzers_released' }) } as MessageEvent);
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ type: 'buzzers_released' });
  });

  it('ignores malformed JSON silently', () => {
    const { service } = setup();
    service.connect(1);
    const ws = MockWebSocket.createdInstances[0];
    fireOpen(ws);

    const received: unknown[] = [];
    service.messages$.subscribe((m) => received.push(m));

    expect(() => {
      ws.onmessage?.({ data: 'not-json' } as MessageEvent);
    }).not.toThrow();
    expect(received).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// premature flush prevention (H-2 regression)
// ---------------------------------------------------------------------------

describe('premature flush prevention — pending queue held until server confirms identity', () => {
  it('does not flush queued messages immediately after onopen when auth token is present', () => {
    const { service } = setup(false);
    service.send({ type: 'buzz', playerId: 1 } as ClientGameMessage);
    service.connect(1, 'jwt-token');
    const ws = MockWebSocket.createdInstances[0];
    fireOpen(ws);
    // Only the auth message was sent; the queued buzz must be withheld
    expect(ws.send.mock.calls.length).toBe(1);
    expect(ws.send.mock.calls[0][0]).toContain('"type":"auth"');
    expect(ws.send.mock.calls.some((c: unknown[]) => (c[0] as string).includes('buzz'))).toBe(false);
  });

  it('does not flush queued messages immediately after onopen when no identity is available', () => {
    const { service } = setup(false, null);
    service.send({ type: 'buzz', playerId: 1 } as ClientGameMessage);
    service.connect(1, undefined);
    const ws = MockWebSocket.createdInstances[0];
    fireOpen(ws);
    // No identity message and no flush — queue is held
    expect(ws.send.mock.calls.length).toBe(0);
  });

  it('delivers all queued messages in order when flushPendingMessages() is called after onopen', () => {
    const { service } = setup(false);
    service.send({ type: 'buzz', playerId: 7 } as ClientGameMessage);
    service.send({ type: 'answer_submitted', playerId: 7, answer: 'Paris' } as ClientGameMessage);
    service.connect(1, 'jwt-token');
    const ws = MockWebSocket.createdInstances[0];
    fireOpen(ws);
    // Queue is still held after auth message
    const sentBeforeFlush = ws.send.mock.calls.length; // 1 (auth only)

    // Simulate GameStateService calling this on full_state_sync
    service.flushPendingMessages();

    expect(ws.send.mock.calls.length).toBe(sentBeforeFlush + 2);
    expect(ws.send.mock.calls[sentBeforeFlush][0]).toContain('"playerId":7');
    expect(ws.send.mock.calls[sentBeforeFlush + 1][0]).toContain('answer_submitted');
  });

  it('calling flushPendingMessages() a second time is a no-op', () => {
    const { service } = setup(false);
    service.send({ type: 'buzz', playerId: 1 } as ClientGameMessage);
    service.connect(1, 'jwt-token');
    const ws = MockWebSocket.createdInstances[0];
    fireOpen(ws);
    service.flushPendingMessages();
    const countAfterFirstFlush = ws.send.mock.calls.length;
    service.flushPendingMessages(); // second call — queue is empty
    expect(ws.send.mock.calls.length).toBe(countAfterFirstFlush);
  });
});
