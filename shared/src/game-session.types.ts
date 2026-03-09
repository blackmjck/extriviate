import type { ContentBlock } from './upload.types.ts';
import type { GameBoard } from './game.types.ts';

// ---- Round State Machine ----

// All possible round phases during a live game session.
// These map directly to the computer-hosted state machine in CLAUDE.md.
export type RoundPhase =
  | 'idle'
  | 'daily_double_revealed'
  | 'question_revealed'
  | 'buzzers_open'
  | 'player_answering'
  | 'answer_evaluated'
  | 'round_complete'
  | 'round_timeout';

// Why buzzers are currently locked. Determines how they get released.
export type BuzzerLockReason =
  | 'reading_time'       // text content — timer-based release
  | 'awaiting_ready'     // image content — all players must send player_ready
  | 'video_playing'      // video content — all players must send video_ended
  | 'host_controlled';   // user_hosted mode — host releases manually

// The complete round state broadcast to all clients on every phase change.
// Clients replace their local round state entirely — no diffing.
export interface RoundStatePayload {
  phase: RoundPhase;
  gameCategoryId: number | null;
  questionId: number | null;
  rowPosition: number | null;
  pointValue: number | null;
  isDailyDouble: boolean;
  questionContent: ContentBlock[] | null;
  answerContent: ContentBlock[] | null;     // revealed after round ends
  buzzerLockReason: BuzzerLockReason | null;
  activePlayerId: number | null;            // who is answering / selecting
  questionSelecterId: number | null;        // who picks the next question
  submittedAnswer: string | null;           // the text the player submitted
  wager: number | null;                     // daily double wager amount
  buzzQueue: number[];                      // ordered list of player IDs who buzzed
  isCorrect: boolean | null;                // result of the last evaluation
}

// ---- Live Player State ----

// A player as they exist during an active session (in-memory, not DB).
export interface LivePlayer {
  playerId: number;
  displayName: string;
  score: number;
  isHost: boolean;
  isReady: boolean;
  isDisconnected: boolean;
  avatarMode: 'camera' | 'static' | 'none';
  avatarUrl: string | null;
  cameraActive: boolean;
  audioMuted: boolean;
  peerId: string | null;       // WebRTC peer ID (random UUID)
}

// Tracks a disconnected player during the grace period before removal.
export interface DisconnectedPlayer {
  playerId: number;
  displayName: string;
  removalTimer: ReturnType<typeof setTimeout>;
  disconnectedAt: number;     // Date.now() timestamp
}

// ---- Session Mode ----

export type SessionMode = 'computer_hosted' | 'user_hosted';

// ---- Server → Client Messages ----

// All messages the server broadcasts to connected clients.
export type GameplayMessage =
  | { type: 'full_state_sync'; state: FullStateSyncPayload }
  | { type: 'round_state_update'; roundState: RoundStatePayload }
  | { type: 'buzzers_released' }
  | { type: 'buzzers_locked'; reason: BuzzerLockReason }
  | { type: 'buzz_received'; playerId: number; position: number }
  | { type: 'answer_submitted'; playerId: number; answer: string }
  | { type: 'answer_result'; playerId: number; correct: boolean; pointDelta: number; newScore: number }
  | { type: 'timer_started'; timerType: 'buzz' | 'answer' | 'lock'; durationMs: number }
  | { type: 'timer_expired'; timerType: 'buzz' | 'answer' | 'lock' }
  | { type: 'player_disconnected'; playerId: number }
  | { type: 'player_reconnected'; playerId: number }
  | { type: 'player_removed'; playerId: number }
  | { type: 'host_assigned_player'; playerId: number; displayName: string }
  | { type: 'media_state_update'; playerId: number; cameraActive: boolean; audioMuted: boolean }
  | { type: 'webrtc_offer'; fromPeerId: string; toPeerId: string; sdp: string }
  | { type: 'webrtc_answer'; fromPeerId: string; toPeerId: string; sdp: string }
  | { type: 'webrtc_ice_candidate'; fromPeerId: string; toPeerId: string; candidate: string };

// The payload sent on initial connect or reconnect — complete snapshot.
export interface FullStateSyncPayload {
  sessionId: number;
  gameId: number;
  sessionName: string;
  joinCode: string;
  board: GameBoard;
  mode: SessionMode;
  turnBased: boolean;
  status: 'lobby' | 'active' | 'paused' | 'completed';
  players: LivePlayer[];
  roundState: RoundStatePayload;
  hostPlayerId: number;
}

// ---- Client → Server Messages ----

// All messages clients can send to the server over WebSocket.
export type ClientGameMessage =
  | { type: 'reconnect_guest'; guestToken: string }
  | { type: 'buzz'; playerId: number }
  | { type: 'answer_submitted'; playerId: number; answer: string }
  | { type: 'wager_declared'; playerId: number; wager: number }
  | { type: 'release_buzzers' }
  | { type: 'lock_buzzers' }
  | { type: 'player_ready'; playerId: number }
  | { type: 'video_ended'; playerId: number }
  | { type: 'media_state_update'; playerId: number; cameraActive: boolean; audioMuted: boolean }
  | { type: 'webrtc_offer'; fromPeerId: string; toPeerId: string; sdp: string }
  | { type: 'webrtc_answer'; fromPeerId: string; toPeerId: string; sdp: string }
  | { type: 'webrtc_ice_candidate'; fromPeerId: string; toPeerId: string; candidate: string };

// ---- Guest Token ----

// The payload inside a signed guest session token.
export interface GuestTokenPayload {
  sub: string;          // 'guest:{playerId}'
  sessionId: number;
  playerId: number;
  type: 'guest_session';
  iat?: number;
  exp?: number;
}
