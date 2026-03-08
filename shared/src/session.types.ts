import type { GameBoard } from "./game.types";
import type { PublicUser } from "./user.types";
import type { SessionMode } from "./game-session.types";

// The status lifecycle of a game session.
// 'lobby' - session created, host is waiting for players to join
// 'active' - game is in progress
// 'paused' - game temporarily paused (e.g. host disconnected in user_hosted mode)
// 'completed' - game has ended, scores are final
export type SessionStatus = "lobby" | "active" | "paused" | "completed";

// A game session record - created when a host starts a game
export interface GameSession {
  id: number;
  gameId: number;
  hostId: number;
  name: string; // e.g. "Family Trivia Night"
  joinCode: string; // short alphanumeric code, e.g. "A3F9K2"
  status: SessionStatus;
  mode: SessionMode; // computer_hosted or user_hosted
  turnBased: boolean;
  playedAt: string;
  endedAt: string | null;
}

// A player participating in a session
// userId is null for guest players who joined without an account
export interface SessionPlayer {
  id: number;
  sessionId: number;
  userId: number | null; // null = guest player
  displayName: string; // snapshot of name at time of play
  finalScore: number;
  rank: number | null; // null until session is completed
}

// The join method a player used to join a session
// Used by the client to determine which join flow to show
export type JoinMethod = "guest" | "login" | "signup";

// Request body sent when a player joins a session via the short URL
// Exactly one of guestDisplayName, loginCredentials, or signupData must be provided
// enforced by the discriminated union below
export type JoinSessionRequest =
  | { method: "guest"; displayName: string }
  | { method: "login"; email: string; password: string }
  | { method: "signup"; email: string; password: string; displayName: string };

// Response returned after successfully joining a session
export interface JoinSessionResponse {
  player: SessionPlayer;
  session: GameSession;
  // Token is included if the player logged in or signed up during join.
  // Null for guests - they have no persistent account session.
  tokens: { accessToken: string; refreshToken: string } | null;
}

// Request body to create a new session from a saved game
export interface CreateSessionRequest {
  gameId: number;
  name: string; // the session display name chosen by the host
}

// The full live session state sent over WebSocket or on initial page load.
// Contains everything needed to render the game board and scoreboard.
export interface LiveSessionState {
  session: GameSession;
  board: GameBoard;
  players: SessionPlayer[];
  currentUser: PublicUser | null; // null if the viewer is a guest
}

// WebSocket message types - all messages between client and server
// during a live session use this discriminated union.
export type SessionMessage =
  | { type: "player_joined"; player: SessionPlayer }
  | { type: "player_left"; playerId: number }
  | { type: "question_opened"; gameCategoryId: number; rowPosition: number }
  | {
      type: "question_answered";
      questionId: number;
      playerId: number;
      correct: boolean;
    }
  | { type: "score_updated"; playerId: number; newScore: number }
  | { type: "session_ended"; players: SessionPlayer[] }
  | { type: "error"; message: string };
