import { Injectable, inject, signal, computed, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type {
  LivePlayer,
  RoundStatePayload,
  FullStateSyncPayload,
  GameplayMessage,
  SessionMode,
  SessionStatus,
  GameBoard,
} from '@extriviate/shared';
import { GameSocketService } from './game-socket.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class GameStateService {
  private readonly socketService = inject(GameSocketService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly players = signal<LivePlayer[]>([]);
  readonly roundState = signal<RoundStatePayload | null>(null);
  readonly sessionStatus = signal<SessionStatus>('lobby');
  readonly hostPlayerId = signal<number | null>(null);
  readonly mode = signal<SessionMode>('computer_hosted');
  readonly turnBased = signal<boolean>(false);
  readonly board = signal<GameBoard | null>(null);
  readonly gameId = signal<number | null>(null);
  readonly sessionId = signal<number | null>(null);
  readonly sessionName = signal<string>('');
  readonly joinCode = signal<string>('');

  readonly isHost = computed(() => {
    const user = this.authService.currentUser();
    const hostId = this.hostPlayerId();
    if (!user || hostId === null) {
      return false;
    }
    return user.id === hostId;
  });

  constructor() {
    this.socketService.messages$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((message) => this.handleMessage(message));
  }

  private handleMessage(message: GameplayMessage): void {
    switch (message.type) {
      case 'full_state_sync':
        this.applyFullStateSync(message.state);
        break;

      case 'round_state_update':
        this.roundState.set(message.roundState);
        break;

      case 'buzz_received':
        this.roundState.update((state) => {
          if (!state) return state;
          return { ...state, buzzQueue: [...state.buzzQueue, message.playerId] };
        });
        break;

      case 'answer_submitted':
        this.roundState.update((state) => {
          if (!state) return state;
          return { ...state, submittedAnswer: message.answer, activePlayerId: message.playerId };
        });
        break;

      case 'answer_result':
        this.roundState.update((state) => {
          if (!state) return state;
          return { ...state, isCorrect: message.correct };
        });
        this.players.update((players) =>
          players.map((p) =>
            p.playerId === message.playerId ? { ...p, score: message.newScore } : p,
          ),
        );
        break;

      case 'player_disconnected':
        this.players.update((players) =>
          players.map((p) =>
            p.playerId === message.playerId ? { ...p, isDisconnected: true } : p,
          ),
        );
        break;

      case 'player_reconnected':
        this.players.update((players) =>
          players.map((p) =>
            p.playerId === message.playerId ? { ...p, isDisconnected: false } : p,
          ),
        );
        break;

      case 'player_removed':
        this.players.update((players) =>
          players.filter((p) => p.playerId !== message.playerId),
        );
        break;

      case 'host_assigned_player':
        this.players.update((players) => {
          const exists = players.some((p) => p.playerId === message.playerId);
          if (exists) return players;
          return [
            ...players,
            {
              playerId: message.playerId,
              displayName: message.displayName,
              score: 0,
              isHost: false,
              isReady: false,
              isDisconnected: false,
              avatarMode: 'none',
              avatarUrl: null,
              cameraActive: false,
              audioMuted: true,
              peerId: null,
            },
          ];
        });
        break;

      case 'media_state_update':
        this.players.update((players) =>
          players.map((p) =>
            p.playerId === message.playerId
              ? { ...p, cameraActive: message.cameraActive, audioMuted: message.audioMuted }
              : p,
          ),
        );
        break;

      case 'buzzers_released':
      case 'buzzers_locked':
      case 'timer_started':
      case 'timer_expired':
      case 'webrtc_offer':
      case 'webrtc_answer':
      case 'webrtc_ice_candidate':
        // These are handled by other services or components directly via messages$
        break;
    }
  }

  private applyFullStateSync(state: FullStateSyncPayload): void {
    this.players.set(state.players);
    this.roundState.set(state.roundState);
    this.sessionStatus.set(state.status);
    this.hostPlayerId.set(state.hostPlayerId);
    this.mode.set(state.mode);
    this.turnBased.set(state.turnBased);
    this.board.set(state.board);
    this.gameId.set(state.gameId);
    this.sessionId.set(state.sessionId);
    this.sessionName.set(state.sessionName);
    this.joinCode.set(state.joinCode);
  }
}
