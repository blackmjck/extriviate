import { Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import type { GameplayMessage, ClientGameMessage } from '@extriviate/shared';
import { GuestSessionService } from './guest-session.service';

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

const MAX_PENDING_MESSAGES = 20;

@Injectable({ providedIn: 'root' })
export class GameSocketService {
  private readonly guestSession = inject(GuestSessionService);

  private socket: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private currentSessionId: number | null = null;
  private tokenGetter: (() => string | undefined) | undefined;
  private pendingMessages: ClientGameMessage[] = [];
  private intentionallyClosed = false;
  private hasConnectedOnce = false;
  private isReconnecting = false;

  readonly connectionState = signal<ConnectionState>('disconnected');
  /** True only while attempting to reconnect after a dropped connection (never on initial load). */
  readonly reconnecting = signal(false);
  readonly messages$ = new Subject<GameplayMessage>();

  connect(
    sessionId: number,
    tokenGetter?: (() => string | undefined),
    isReconnect = false,
  ): void {
    this.intentionallyClosed = false;
    this.isReconnecting = isReconnect;
    this.currentSessionId = sessionId;
    this.tokenGetter = tokenGetter;
    this.reconnectAttempt = 0;
    this.openConnection();
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    this.hasConnectedOnce = false;
    this.clearReconnectTimer();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connectionState.set('disconnected');
    this.reconnecting.set(false);
    this.pendingMessages = [];
  }

  send(message: ClientGameMessage): void {
    if (this.connectionState() === 'connected' && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      if (this.pendingMessages.length >= MAX_PENDING_MESSAGES) {
        this.pendingMessages.shift(); // drop the oldest message
      }
      this.pendingMessages.push(message);
    }
  }

  private openConnection(): void {
    if (this.currentSessionId === null) {
      return;
    }

    this.connectionState.set('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/api/sessions/${this.currentSessionId}/ws`;

    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      this.connectionState.set('connected');
      this.hasConnectedOnce = true;
      this.reconnecting.set(false);
      this.reconnectAttempt = 0;

      if (this.guestSession.hasSession()) {
        const guestToken = this.guestSession.getToken();
        if (guestToken) {
          this.socket!.send(JSON.stringify({ type: 'reconnect_guest', guestToken }));
        }
      } else {
        const token = this.tokenGetter?.();
        if (token) {
          this.socket!.send(JSON.stringify({ type: 'auth', token }));
        }
      }
      this.isReconnecting = false;
      // Pending messages are flushed only after the server confirms identity
      // via full_state_sync — see GameStateService.handleMessage. Flushing here
      // would drop messages because the server silently ignores all messages from
      // sockets that are not yet in socketIdentities.
    };

    this.socket.onmessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data) as GameplayMessage;
        this.messages$.next(message);
      } catch {
        // Ignore malformed messages
      }
    };

    this.socket.onclose = () => {
      this.connectionState.set('disconnected');
      this.socket = null;
      if (!this.intentionallyClosed) {
        this.scheduleReconnect();
      }
    };

    this.socket.onerror = () => {
      // onclose will fire after onerror, so reconnect is handled there
    };
  }

  private scheduleReconnect(): void {
    this.isReconnecting = true;
    if (this.hasConnectedOnce) {
      this.reconnecting.set(true);
    }

    const baseDelay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 30000);
    const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1); // +/- 20%
    const delay = baseDelay + jitter;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempt++;
      this.openConnection();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  flushPendingMessages(): void {
    const messages = this.pendingMessages;
    this.pendingMessages = [];
    for (const msg of messages) {
      this.send(msg);
    }
  }
}
