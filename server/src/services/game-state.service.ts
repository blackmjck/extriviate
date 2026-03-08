import type { WebSocket } from 'ws';
import type {
  RoundStatePayload,
  LivePlayer,
  DisconnectedPlayer,
  SessionMode,
  GameplayMessage,
  ClientGameMessage,
  FullStateSyncPayload,
  BuzzerLockReason,
  RoundPhase,
  ContentBlock,
} from '@extriviate/shared';
import {
  BUZZ_WINDOW_DURATION_MS,
  ANSWER_TIMER_DURATION_MS,
  ANSWER_REVEAL_DURATION_MS,
  TEXT_MIN_LOCK_MS,
  TEXT_MAX_LOCK_MS,
  WORDS_PER_MINUTE,
  MAX_READY_WAIT_MS,
  RECONNECT_GRACE_PERIOD_MS,
  DAILY_DOUBLE_MIN_WAGER,
} from '@extriviate/shared';

// ---- Per-Session State ----

export interface SessionGameState {
  sessionId: number;
  gameId: number;
  mode: SessionMode;
  turnBased: boolean;
  status: 'lobby' | 'active' | 'paused' | 'completed';
  players: Map<number, LivePlayer>;
  disconnectedPlayers: Map<number, DisconnectedPlayer>;
  socketIdentities: Map<WebSocket, { playerId: number; isHost: boolean }>;
  playerSockets: Map<number, WebSocket>;
  roundState: RoundStatePayload;
  boardValues: number[];       // remaining unanswered point values (for DD wager max)
  hostPlayerId: number;
  buzzTimer: ReturnType<typeof setTimeout> | null;
  answerTimer: ReturnType<typeof setTimeout> | null;
  lockTimer: ReturnType<typeof setTimeout> | null;
  // Callbacks to persist changes to the database
  onScoreChanged: (playerId: number, newScore: number) => void;
  onQuestionAnswered: (questionId: number) => void;
}

// ---- Default Round State ----

function createIdleRoundState(): RoundStatePayload {
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
  };
}

// ---- Service ----

export class GameStateService {
  // One entry per active session — cleared when session completes
  private sessions = new Map<number, SessionGameState>();

  createSession(
    sessionId: number,
    gameId: number,
    mode: SessionMode,
    turnBased: boolean,
    hostPlayerId: number,
    boardValues: number[],
    onScoreChanged: (playerId: number, newScore: number) => void,
    onQuestionAnswered: (questionId: number) => void,
  ): SessionGameState {
    const state: SessionGameState = {
      sessionId,
      gameId,
      mode,
      turnBased,
      status: 'lobby',
      players: new Map(),
      disconnectedPlayers: new Map(),
      socketIdentities: new Map(),
      playerSockets: new Map(),
      roundState: createIdleRoundState(),
      boardValues,
      hostPlayerId,
      buzzTimer: null,
      answerTimer: null,
      lockTimer: null,
      onScoreChanged,
      onQuestionAnswered,
    };
    this.sessions.set(sessionId, state);
    return state;
  }

  getSession(sessionId: number): SessionGameState | undefined {
    return this.sessions.get(sessionId);
  }

  removeSession(sessionId: number): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      this.clearAllTimers(state);
      // Clear all disconnection timers
      for (const dp of state.disconnectedPlayers.values()) {
        clearTimeout(dp.removalTimer);
      }
      this.sessions.delete(sessionId);
    }
  }

  // ---- Player Management ----

  addPlayer(state: SessionGameState, player: LivePlayer, socket: WebSocket): void {
    state.players.set(player.playerId, player);
    state.playerSockets.set(player.playerId, socket);
    state.socketIdentities.set(socket, {
      playerId: player.playerId,
      isHost: player.isHost,
    });
  }

  removePlayerSocket(state: SessionGameState, socket: WebSocket): { playerId: number; isHost: boolean } | null {
    const identity = state.socketIdentities.get(socket);
    if (!identity) return null;

    state.socketIdentities.delete(socket);
    state.playerSockets.delete(identity.playerId);
    return identity;
  }

  // ---- Disconnection / Reconnection ----

  handleDisconnect(
    state: SessionGameState,
    playerId: number,
    onRemoval: (playerId: number) => void,
  ): void {
    const player = state.players.get(playerId);
    if (!player) return;

    player.isDisconnected = true;

    // Start removal timer
    const removalTimer = setTimeout(() => {
      state.players.delete(playerId);
      state.disconnectedPlayers.delete(playerId);
      onRemoval(playerId);
    }, RECONNECT_GRACE_PERIOD_MS);

    state.disconnectedPlayers.set(playerId, {
      playerId,
      displayName: player.displayName,
      removalTimer,
      disconnectedAt: Date.now(),
    });

    // Mid-turn special cases
    this.handleMidTurnDisconnect(state, playerId);
  }

  handleReconnect(
    state: SessionGameState,
    playerId: number,
    socket: WebSocket,
  ): boolean {
    const player = state.players.get(playerId);
    if (!player) return false;

    // Cancel removal timer
    const disconnected = state.disconnectedPlayers.get(playerId);
    if (disconnected) {
      clearTimeout(disconnected.removalTimer);
      state.disconnectedPlayers.delete(playerId);
    }

    player.isDisconnected = false;
    state.playerSockets.set(playerId, socket);
    state.socketIdentities.set(socket, {
      playerId,
      isHost: player.isHost,
    });

    // If session was paused because host disconnected, restore to active
    if (state.status === 'paused' && player.isHost) {
      state.status = 'active';
    }

    return true;
  }

  private handleMidTurnDisconnect(state: SessionGameState, playerId: number): void {
    const rs = state.roundState;

    if (rs.activePlayerId === playerId && rs.phase === 'player_answering') {
      // Active answerer disconnected — forfeit turn, advance buzz queue
      this.clearTimer(state, 'answerTimer');
      this.advanceBuzzQueue(state);
    }

    if (rs.activePlayerId === playerId && rs.phase === 'daily_double_revealed') {
      // DD holder disconnected — return to idle
      this.clearAllTimers(state);
      state.roundState = createIdleRoundState();
    }

    if (rs.questionSelecterId === playerId) {
      rs.questionSelecterId = null;
    }

    // Host disconnect in user_hosted mode → pause
    const player = state.players.get(playerId);
    if (player?.isHost && state.mode === 'user_hosted') {
      state.status = 'paused';
    }
  }

  // ---- Identity Verification ----

  verifyIdentity(state: SessionGameState, socket: WebSocket, claimedPlayerId: number): boolean {
    const identity = state.socketIdentities.get(socket);
    return identity !== undefined && identity.playerId === claimedPlayerId;
  }

  // ---- Question Selection ----

  selectQuestion(
    state: SessionGameState,
    gameCategoryId: number,
    questionId: number,
    rowPosition: number,
    pointValue: number,
    isDailyDouble: boolean,
    questionContent: ContentBlock[],
    answerContent: ContentBlock[],
    selecterId: number,
  ): void {
    // Remove this value from remaining board values
    const idx = state.boardValues.indexOf(pointValue);
    if (idx !== -1) state.boardValues.splice(idx, 1);

    state.roundState = {
      ...createIdleRoundState(),
      gameCategoryId,
      questionId,
      rowPosition,
      pointValue,
      isDailyDouble,
      questionContent,
      questionSelecterId: selecterId,
      activePlayerId: isDailyDouble ? selecterId : null,
      answerContent, // stored but not broadcast until round ends
      phase: isDailyDouble ? 'daily_double_revealed' : 'question_revealed',
      buzzerLockReason: isDailyDouble ? null : this.determineLockReason(state, questionContent),
    };

    // Mark answered in DB
    state.onQuestionAnswered(questionId);

    // For non-DD questions, start the lock timer
    if (!isDailyDouble) {
      this.startLockTimer(state, questionContent);
    }
  }

  // ---- Daily Double ----

  declareWager(state: SessionGameState, playerId: number, wager: number): boolean {
    const rs = state.roundState;
    if (rs.phase !== 'daily_double_revealed' || rs.activePlayerId !== playerId) return false;

    const player = state.players.get(playerId);
    if (!player) return false;

    // Validate wager server-side
    const highestBoardValue = state.boardValues.length > 0 ? Math.max(...state.boardValues) : 0;
    const maxWager = player.score <= 0
      ? highestBoardValue
      : Math.max(player.score, highestBoardValue);
    const clampedWager = Math.max(DAILY_DOUBLE_MIN_WAGER, Math.min(wager, maxWager));

    rs.wager = clampedWager;
    rs.phase = 'question_revealed';
    // DD goes straight to question_revealed with no lock — player answers immediately

    return true;
  }

  // ---- Buzzer Logic ----

  handleBuzz(state: SessionGameState, playerId: number): number | null {
    const rs = state.roundState;
    if (rs.phase !== 'buzzers_open') return null;

    const player = state.players.get(playerId);
    if (!player || player.isDisconnected) return null;

    // Prevent duplicate buzzes
    if (rs.buzzQueue.includes(playerId)) return null;

    rs.buzzQueue.push(playerId);
    const position = rs.buzzQueue.length;

    // First buzz — start answering
    if (position === 1) {
      rs.activePlayerId = playerId;
      rs.phase = 'player_answering';
      this.clearTimer(state, 'buzzTimer');
      this.startAnswerTimer(state);
    }

    return position;
  }

  releaseBuzzers(state: SessionGameState): void {
    const rs = state.roundState;
    if (rs.phase !== 'question_revealed') return;

    this.clearTimer(state, 'lockTimer');
    rs.phase = 'buzzers_open';
    rs.buzzerLockReason = null;

    this.startBuzzTimer(state);
  }

  lockBuzzers(state: SessionGameState): void {
    const rs = state.roundState;
    rs.buzzerLockReason = 'host_controlled';
    this.clearTimer(state, 'buzzTimer');
  }

  // ---- Answer Handling ----

  submitAnswer(state: SessionGameState, playerId: number, answer: string): boolean {
    const rs = state.roundState;
    if (rs.activePlayerId !== playerId) return false;
    if (rs.phase !== 'player_answering') return false;

    rs.submittedAnswer = answer;
    this.clearTimer(state, 'answerTimer');
    return true;
  }

  applyEvaluationResult(
    state: SessionGameState,
    playerId: number,
    correct: boolean,
  ): { pointDelta: number; newScore: number; roundOver: boolean } {
    const rs = state.roundState;
    const player = state.players.get(playerId);
    if (!player) return { pointDelta: 0, newScore: 0, roundOver: true };

    const points = rs.isDailyDouble ? (rs.wager ?? 0) : (rs.pointValue ?? 0);
    const pointDelta = correct ? points : -points;
    player.score += pointDelta;

    // Persist score immediately
    state.onScoreChanged(playerId, player.score);

    rs.isCorrect = correct;
    rs.phase = 'answer_evaluated';

    if (correct || rs.isDailyDouble) {
      // Correct answer or DD (only one attempt) → round complete
      // For correct: selecter for next round = the answerer
      // For DD wrong: selecter stays the same (DD holder picks next)
      if (correct) {
        rs.questionSelecterId = playerId;
      }
      return { pointDelta, newScore: player.score, roundOver: true };
    }

    // Wrong answer on non-DD — try next in buzz queue
    return { pointDelta, newScore: player.score, roundOver: false };
  }

  advanceBuzzQueue(state: SessionGameState): void {
    const rs = state.roundState;
    const nextIndex = rs.buzzQueue.indexOf(rs.activePlayerId!) + 1;

    if (nextIndex < rs.buzzQueue.length) {
      // Next buzzer in queue
      rs.activePlayerId = rs.buzzQueue[nextIndex];
      rs.phase = 'player_answering';
      rs.submittedAnswer = null;
      rs.isCorrect = null;
      this.startAnswerTimer(state);
    } else {
      // No more buzzers — reopen if we came from buzzers_open
      rs.activePlayerId = null;
      rs.phase = 'buzzers_open';
      rs.submittedAnswer = null;
      rs.isCorrect = null;
      this.startBuzzTimer(state);
    }
  }

  completeRound(state: SessionGameState): void {
    const rs = state.roundState;
    rs.phase = 'round_complete';
    this.clearAllTimers(state);

    // After reveal delay, return to idle
    setTimeout(() => {
      if (state.roundState.phase === 'round_complete') {
        state.roundState = createIdleRoundState();
        // Preserve questionSelecterId from the completed round
        state.roundState.questionSelecterId = rs.questionSelecterId;
      }
    }, ANSWER_REVEAL_DURATION_MS);
  }

  handleRoundTimeout(state: SessionGameState): void {
    state.roundState.phase = 'round_timeout';
    this.clearAllTimers(state);

    // After reveal delay, return to idle
    setTimeout(() => {
      if (state.roundState.phase === 'round_timeout') {
        const selecterId = state.roundState.questionSelecterId;
        state.roundState = createIdleRoundState();
        state.roundState.questionSelecterId = selecterId;
      }
    }, ANSWER_REVEAL_DURATION_MS);
  }

  // ---- Player Ready / Video Ended ----

  handlePlayerReady(state: SessionGameState, playerId: number): boolean {
    const player = state.players.get(playerId);
    if (!player) return false;
    player.isReady = true;

    return this.checkAllPlayersReady(state);
  }

  handleVideoEnded(state: SessionGameState, playerId: number): boolean {
    const player = state.players.get(playerId);
    if (!player) return false;
    player.isReady = true; // reuse isReady for video_ended tracking

    return this.checkAllPlayersReady(state);
  }

  private checkAllPlayersReady(state: SessionGameState): boolean {
    const activePlayers = [...state.players.values()].filter((p) => !p.isDisconnected);
    const allReady = activePlayers.every((p) => p.isReady);

    if (allReady && state.roundState.phase === 'question_revealed') {
      this.releaseBuzzers(state);
      // Reset ready flags
      for (const p of state.players.values()) p.isReady = false;
      return true;
    }
    return false;
  }

  // ---- Lock Reason Determination ----

  private determineLockReason(state: SessionGameState, content: ContentBlock[]): BuzzerLockReason {
    if (state.mode === 'user_hosted') return 'host_controlled';

    const hasVideo = content.some((b) => b.type === 'video');
    const hasImage = content.some((b) => b.type === 'image');

    if (hasVideo) return 'video_playing';
    if (hasImage) return 'awaiting_ready';
    return 'reading_time';
  }

  // ---- Timers ----

  private startLockTimer(state: SessionGameState, content: ContentBlock[]): void {
    const reason = state.roundState.buzzerLockReason;
    if (!reason || reason === 'host_controlled') return;

    if (reason === 'reading_time') {
      const textContent = content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; value: string }).value)
        .join(' ');
      const wordCount = textContent.split(/\s+/).filter(Boolean).length;
      const durationMs = Math.min(
        Math.max(Math.round((wordCount / WORDS_PER_MINUTE) * 60_000), TEXT_MIN_LOCK_MS),
        TEXT_MAX_LOCK_MS,
      );

      state.lockTimer = setTimeout(() => {
        this.releaseBuzzers(state);
      }, durationMs);
    } else if (reason === 'awaiting_ready' || reason === 'video_playing') {
      // Max wait timer — release even if not all players are ready
      state.lockTimer = setTimeout(() => {
        this.releaseBuzzers(state);
        for (const p of state.players.values()) p.isReady = false;
      }, MAX_READY_WAIT_MS);
    }
  }

  private startBuzzTimer(state: SessionGameState): void {
    state.buzzTimer = setTimeout(() => {
      state.buzzTimer = null;
      // Nobody buzzed in time
      this.handleRoundTimeout(state);
    }, BUZZ_WINDOW_DURATION_MS);
  }

  private startAnswerTimer(state: SessionGameState): void {
    state.answerTimer = setTimeout(() => {
      state.answerTimer = null;
      // Treat timeout as wrong answer
      const rs = state.roundState;
      if (rs.activePlayerId !== null) {
        rs.submittedAnswer = null; // no answer given
        this.applyEvaluationResult(state, rs.activePlayerId, false);
      }
    }, ANSWER_TIMER_DURATION_MS);
  }

  private clearTimer(state: SessionGameState, timerName: 'buzzTimer' | 'answerTimer' | 'lockTimer'): void {
    if (state[timerName]) {
      clearTimeout(state[timerName]!);
      state[timerName] = null;
    }
  }

  private clearAllTimers(state: SessionGameState): void {
    this.clearTimer(state, 'buzzTimer');
    this.clearTimer(state, 'answerTimer');
    this.clearTimer(state, 'lockTimer');
  }

  // ---- Broadcasting ----

  broadcast(state: SessionGameState, message: GameplayMessage, excludeSocket?: WebSocket): void {
    const data = JSON.stringify(message);
    for (const [socket] of state.socketIdentities) {
      if (socket !== excludeSocket && socket.readyState === socket.OPEN) {
        socket.send(data);
      }
    }
  }

  sendTo(socket: WebSocket, message: GameplayMessage): void {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  // ---- Full State Sync ----

  buildFullStateSync(state: SessionGameState): FullStateSyncPayload {
    // Strip answerContent from round state unless the round is complete/timeout
    const roundState = { ...state.roundState };
    if (roundState.phase !== 'round_complete' && roundState.phase !== 'round_timeout') {
      roundState.answerContent = null;
    }

    return {
      sessionId: state.sessionId,
      mode: state.mode,
      turnBased: state.turnBased,
      status: state.status,
      players: [...state.players.values()],
      roundState,
      hostPlayerId: state.hostPlayerId,
    };
  }

  // ---- Active Player Count ----

  getActivePlayerCount(state: SessionGameState): number {
    return [...state.players.values()].filter((p) => !p.isDisconnected).length;
  }
}
