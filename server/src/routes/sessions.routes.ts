import { FastifyPluginAsync } from 'fastify';
import type { WebSocket } from 'ws';
import { requireAuth, optionalAuth } from '../hooks/auth.hook.js';
import { AuthService } from '../services/auth.service.js';
import { SessionService } from '../services/session.service.js';
import { GameStateService, type SessionGameState } from '../services/game-state.service.js';
import { buildGameBoard, extractBoardValues } from '../services/session-state-builder.js';
import { evaluateAnswer } from '../services/evaluation.service.js';
import type {
  CreateSessionRequest,
  JoinSessionRequest,
  ClientGameMessage,
  LivePlayer,
  ContentBlock,
  GuestTokenPayload,
} from '@extriviate/shared';
import {
  MAX_SESSION_NAME_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  GUEST_TOKEN_EXPIRY_HOURS,
} from '@extriviate/shared';

// Shared service instances — singleton per server lifetime
const gameStateService = new GameStateService();

const sessionsRoutes: FastifyPluginAsync = async (fastify) => {
  const sessionService = new SessionService(fastify.db);
  const authService = new AuthService(fastify.db, fastify);

  // ---- REST Routes ----

  // GET /api/sessions/:joinCode — preview session before joining
  fastify.get<{ Params: { joinCode: string } }>('/:joinCode', async (request, reply) => {
    const session = await sessionService.findByJoinCode(request.params.joinCode);
    if (!session) {
      return reply.status(404).send({
        success: false,
        error: { message: 'Session not found or already ended', code: 'NOT_FOUND' },
      });
    }

    const players = await sessionService.getPlayers(session.id);
    return reply.send({
      success: true,
      data: {
        session: {
          id: session.id,
          name: (session as any).name,
          status: (session as any).status,
          joinCode: (session as any).join_code,
        },
        playerCount: players.length,
      },
    });
  });

  // POST /api/sessions — create a new session (auth required)
  fastify.post<{ Body: CreateSessionRequest }>(
    '/',
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: 'object',
          required: ['gameId', 'name'],
          properties: {
            gameId: { type: 'integer' },
            name: { type: 'string', minLength: 1, maxLength: MAX_SESSION_NAME_LENGTH },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { gameId, name } = request.body;
      const userId = parseInt(request.user.sub, 10);

      // Verify the game exists and belongs to this user
      const gameResult = await fastify.db.query(
        'SELECT id FROM games WHERE id = $1 AND creator_id = $2',
        [gameId, userId]
      );
      if (gameResult.rows.length === 0) {
        return reply.status(404).send({
          success: false,
          error: { message: 'Game not found', code: 'NOT_FOUND' },
        });
      }

      const session = await sessionService.createSession(gameId, userId, name);

      // Load the full board and initialize in-memory state
      const board = await buildGameBoard(fastify.db, gameId);
      if (!board) {
        return reply.status(500).send({
          success: false,
          error: { message: 'Failed to load game board', code: 'INTERNAL_ERROR' },
        });
      }

      const boardValues = extractBoardValues(board);
      const mode = (session as any).mode ?? 'computer_hosted';
      const turnBased = (session as any).turn_based ?? false;

      const sessionName = name;
      const joinCode = (session as any).join_code as string;

      gameStateService.createSession(
        session.id,
        gameId,
        sessionName,
        joinCode,
        board,
        mode,
        turnBased,
        userId,
        boardValues,
        (playerId, newScore) => sessionService.updateScore(playerId, newScore),
        (questionId) => {
          sessionService.markQuestionAnswered(gameId, questionId);
          const s = gameStateService.getSession(session.id);
          if (s) gameStateService.markBoardQuestionAnswered(s, questionId);
        }
      );

      // Add the host as the first player
      const hostPlayer = await sessionService.addPlayer(session.id, request.user.email, userId);
      const state = gameStateService.getSession(session.id)!;
      // Host LivePlayer entry will be created when they connect via WebSocket

      return reply.status(201).send({
        success: true,
        data: session,
      });
    }
  );

  // POST /api/sessions/:id/join — join a session as guest, login, or signup
  fastify.post<{ Params: { id: string }; Body: JoinSessionRequest }>(
    '/:id/join',
    {
      schema: {
        body: {
          type: 'object',
          required: ['method'],
          properties: {
            method: { type: 'string', enum: ['guest', 'login', 'signup'] },
            displayName: { type: 'string', minLength: 1, maxLength: MAX_DISPLAY_NAME_LENGTH },
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const sessionId = parseInt(request.params.id, 10);
      const session = await sessionService.findById(sessionId);

      if (!session || !['lobby', 'active'].includes((session as any).status)) {
        return reply.status(404).send({
          success: false,
          error: { message: 'Session not found or not joinable', code: 'NOT_FOUND' },
        });
      }

      const body = request.body;
      let userId: number | null = null;
      let displayName: string;
      let tokens: { accessToken: string; refreshToken: string } | null = null;
      let guestToken: string | null = null;

      if (body.method === 'guest') {
        displayName = body.displayName;
      } else if (body.method === 'login') {
        try {
          const result = await authService.login({ email: body.email, password: body.password });
          userId = result.user.id;
          displayName = result.user.displayName;
          tokens = result.tokens;
        } catch (err: any) {
          return reply.status(err.statusCode ?? 401).send({
            success: false,
            error: { message: err.message, code: err.code },
          });
        }
      } else {
        // signup
        try {
          const result = await authService.signUp({
            email: body.email,
            password: body.password,
            displayName: body.displayName,
          });
          userId = result.user.id;
          displayName = result.user.displayName;
          tokens = result.tokens;
        } catch (err: any) {
          return reply.status(err.statusCode ?? 500).send({
            success: false,
            error: { message: err.message, code: err.code },
          });
        }
      }

      // Check if this user already joined
      if (userId) {
        const existing = await sessionService.findPlayerByUserId(sessionId, userId);
        if (existing) {
          return reply.send({
            success: true,
            data: { player: existing, session, tokens, guestToken: null },
          });
        }
      }

      const player = await sessionService.addPlayer(sessionId, displayName, userId);

      // Generate guest token for guest players
      if (body.method === 'guest') {
        const payload: GuestTokenPayload = {
          sub: `guest:${player.id}`,
          sessionId,
          playerId: player.id,
          type: 'guest_session',
        };
        guestToken = fastify.jwt.sign(payload as any, {
          expiresIn: `${GUEST_TOKEN_EXPIRY_HOURS}h`,
        });
      }

      return reply.status(201).send({
        success: true,
        data: { player, session, tokens, guestToken },
      });
    }
  );

  // PATCH /api/sessions/:id/status — change session status
  fastify.patch<{ Params: { id: string }; Body: { status: string } }>(
    '/:id/status',
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['active', 'paused', 'completed'] },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const sessionId = parseInt(request.params.id, 10);
      const session = await sessionService.findById(sessionId);

      if (!session || (session as any).host_id !== parseInt(request.user.sub, 10)) {
        return reply.status(404).send({
          success: false,
          error: { message: 'Session not found', code: 'NOT_FOUND' },
        });
      }

      const updated = await sessionService.updateStatus(sessionId, request.body.status);

      // Update in-memory state and broadcast to all connected clients
      const state = gameStateService.getSession(sessionId);
      if (state) {
        state.status = request.body.status as any;

        if (request.body.status === 'completed') {
          // Set ranks, broadcast full_state_sync with completed status,
          // then remove session. Broadcast must happen before removeSession.
          await sessionService.setRanks(sessionId);
          gameStateService.broadcast(state, {
            type: 'full_state_sync',
            state: gameStateService.buildFullStateSync(state),
          });
          gameStateService.removeSession(sessionId);
        } else {
          // 'active' or 'paused' — all clients need to react to the status change
          gameStateService.broadcast(state, {
            type: 'full_state_sync',
            state: gameStateService.buildFullStateSync(state),
          });
        }
      }

      return reply.send({ success: true, data: updated });
    }
  );

  // GET /api/sessions/:id/players
  fastify.get<{ Params: { id: string } }>(
    '/:id/players',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const sessionId = parseInt(request.params.id, 10);
      const players = await sessionService.getPlayers(sessionId);
      return reply.send({ success: true, data: players });
    }
  );

  // DELETE /api/sessions/:id/players/:playerId
  fastify.delete<{ Params: { id: string; playerId: string } }>(
    '/:id/players/:playerId',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const sessionId = parseInt(request.params.id, 10);
      const playerId = parseInt(request.params.playerId, 10);

      const removed = await sessionService.removePlayer(sessionId, playerId);
      if (!removed) {
        return reply.status(404).send({
          success: false,
          error: { message: 'Player not found', code: 'NOT_FOUND' },
        });
      }

      // Remove from in-memory state too
      const state = gameStateService.getSession(sessionId);
      if (state) {
        state.players.delete(playerId);
        gameStateService.broadcast(state, { type: 'player_removed', playerId });
      }

      return reply.send({ success: true, data: null });
    }
  );

  // POST /api/sessions/:id/questions/:questionId/select — mark question as selected
  fastify.post<{ Params: { id: string; questionId: string } }>(
    '/:id/questions/:questionId/select',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const sessionId = parseInt(request.params.id, 10);
      const questionId = parseInt(request.params.questionId, 10);
      const userId = parseInt(request.user.sub, 10);

      const state = gameStateService.getSession(sessionId);
      if (!state) {
        return reply.status(404).send({
          success: false,
          error: { message: 'Session not active', code: 'NOT_FOUND' },
        });
      }

      if (state.roundState.phase !== 'idle') {
        return reply.status(400).send({
          success: false,
          error: { message: 'A question is already in play', code: 'ROUND_IN_PROGRESS' },
        });
      }

      // Find the question on the board
      const board = await buildGameBoard(fastify.db, state.gameId);
      if (!board) {
        return reply.status(500).send({
          success: false,
          error: { message: 'Failed to load board', code: 'INTERNAL_ERROR' },
        });
      }

      let foundQuestion: any = null;
      let gameCategoryId: number | null = null;
      for (const cat of board.categories) {
        for (const gq of cat.questions) {
          if (gq.questionId === questionId) {
            foundQuestion = gq;
            gameCategoryId = cat.id;
            break;
          }
        }
        if (foundQuestion) break;
      }

      if (!foundQuestion) {
        return reply.status(404).send({
          success: false,
          error: { message: 'Question not found on board', code: 'NOT_FOUND' },
        });
      }

      if (foundQuestion.isAnswered) {
        return reply.status(400).send({
          success: false,
          error: { message: 'Question already answered', code: 'ALREADY_ANSWERED' },
        });
      }

      // Find the selecting player's ID
      let selecterId: number | null = null;
      for (const [pid, player] of state.players) {
        if (!player.isHost) continue;
        // In user_hosted, host selects. In computer_hosted, the questionSelecterId picks.
        selecterId = state.roundState.questionSelecterId ?? pid;
        break;
      }
      if (!selecterId) selecterId = userId;

      const questionContent: ContentBlock[] = foundQuestion.question.content;
      const answerContent: ContentBlock[] = foundQuestion.question.answer?.content ?? [];

      gameStateService.selectQuestion(
        state,
        gameCategoryId!,
        questionId,
        foundQuestion.rowPosition,
        foundQuestion.pointValue,
        foundQuestion.isDailyDouble,
        questionContent,
        answerContent,
        selecterId
      );

      // Broadcast round state update
      gameStateService.broadcast(state, {
        type: 'round_state_update',
        roundState: { ...state.roundState, answerContent: null }, // hide answer
      });

      // Mark answered in DB
      await sessionService.markQuestionAnswered(state.gameId, questionId);

      return reply.send({ success: true, data: null });
    }
  );

  // POST /api/sessions/:id/evaluate — host evaluates answer (user_hosted mode)
  fastify.post<{ Params: { id: string }; Body: { playerId: number; correct: boolean } }>(
    '/:id/evaluate',
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: 'object',
          required: ['playerId', 'correct'],
          properties: {
            playerId: { type: 'integer' },
            correct: { type: 'boolean' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const sessionId = parseInt(request.params.id, 10);
      const { playerId, correct } = request.body;

      const state = gameStateService.getSession(sessionId);
      if (!state || state.mode !== 'user_hosted') {
        return reply.status(400).send({
          success: false,
          error: { message: 'Not a user-hosted session', code: 'INVALID_MODE' },
        });
      }

      const result = gameStateService.applyEvaluationResult(state, playerId, correct);

      gameStateService.broadcast(state, {
        type: 'answer_result',
        playerId,
        correct,
        pointDelta: result.pointDelta,
        newScore: result.newScore,
      });

      if (result.roundOver) {
        gameStateService.completeRound(state);
      } else {
        gameStateService.advanceBuzzQueue(state);
      }

      gameStateService.broadcast(state, {
        type: 'round_state_update',
        roundState: state.roundState,
      });

      return reply.send({ success: true, data: null });
    }
  );

  // ---- WebSocket ----

  fastify.get<{ Params: { id: string } }>(
    '/:id/ws',
    { websocket: true },
    async (socket: WebSocket, request) => {
      const sessionId = parseInt(request.params.id, 10);
      const state = gameStateService.getSession(sessionId);

      if (!state) {
        socket.close(4004, 'Session not found');
        return;
      }

      // Auth timeout
      // The client must send either { type: 'auth' } or { type: 'reconnect_guest' }
      // as its very first message. If it doesn't arrive within 5 seconds, we close
      // the connection. This prevents anonymous sockets from sitting open and
      // consuming server resources without ever identifying themselves.
      const authTimeout = setTimeout(() => {
        if (!state.socketIdentities.has(socket)) {
          socket.close(4001, 'Authentication timeout');
        }
      }, 5000);

      // Clear the timeout whenever the socket closes
      socket.once('close', () => clearTimeout(authTimeout));

      // ---- Message Handler ----
      socket.on('message', async (raw: Buffer) => {
        let msg: ClientGameMessage;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return; // ignore malformed messages
        }

        // Registered user auth
        // The client sends this as the very first message after onopen fires.
        if (msg.type === 'auth') {
          // Ignore if this socket is already registered (duplicate auth attempt)
          if (state.socketIdentities.has(socket)) return;

          try {
            const payload = fastify.jwt.verify<any>(msg.token);
            const blacklisted = await fastify.isTokenBlacklisted(payload.jti);
            if (blacklisted) {
              socket.close(4001, 'Token revoked');
              return;
            }

            const userId = parseInt(payload.sub, 10);
            const isHost = state.hostPlayerId === userId;
            const existingPlayer = await sessionService.findPlayerByUserId(sessionId, userId);

            if (!existingPlayer) {
              socket.close(4001, 'Player not found in session');
              return;
            }

            clearTimeout(authTimeout); // legitimate auth arrived, cancel the timeout

            const reconnected = gameStateService.handleReconnect(state, existingPlayer.id, socket);
            if (reconnected) {
              gameStateService.sendTo(socket, {
                type: 'full_state_sync',
                state: gameStateService.buildFullStateSync(state),
              });
              gameStateService.broadcast(
                state,
                {
                  type: 'player_reconnected',
                  playerId: existingPlayer.id,
                },
                socket
              );
            } else {
              const livePlayer: LivePlayer = {
                playerId: existingPlayer.id,
                displayName:
                  (existingPlayer as any).display_name ??
                  (existingPlayer as any).displayName ??
                  'Player',
                score:
                  (existingPlayer as any).final_score ?? (existingPlayer as any).finalScore ?? 0,
                isHost,
                isReady: false,
                isDisconnected: false,
                avatarMode: 'none',
                avatarUrl: null,
                cameraActive: false,
                audioMuted: true,
                peerId: null,
              };
              gameStateService.addPlayer(state, livePlayer, socket);
              gameStateService.sendTo(socket, {
                type: 'full_state_sync',
                state: gameStateService.buildFullStateSync(state),
              });
            }
          } catch {
            socket.close(4001, 'Invalid token');
          }
          return;
        }

        // Handle guest reconnect as the first message
        if (msg.type === 'reconnect_guest') {
          try {
            const payload = fastify.jwt.verify<GuestTokenPayload>(msg.guestToken);
            if (payload.type !== 'guest_session' || payload.sessionId !== sessionId) {
              socket.close(4001, 'Invalid guest token');
              return;
            }

            clearTimeout(authTimeout); // legitimate auth arrived

            const reconnected = gameStateService.handleReconnect(state, payload.playerId, socket);
            if (reconnected) {
              gameStateService.sendTo(socket, {
                type: 'full_state_sync',
                state: gameStateService.buildFullStateSync(state),
              });
              gameStateService.broadcast(
                state,
                {
                  type: 'player_reconnected',
                  playerId: payload.playerId,
                },
                socket
              );
            } else {
              // Guest connecting for the first time via token
              const players = await sessionService.getPlayers(sessionId);
              const dbPlayer = players.find((p) => p.id === payload.playerId);
              if (dbPlayer) {
                const livePlayer: LivePlayer = {
                  playerId: dbPlayer.id,
                  displayName:
                    (dbPlayer as any).display_name ?? (dbPlayer as any).displayName ?? 'Guest',
                  score: (dbPlayer as any).final_score ?? (dbPlayer as any).finalScore ?? 0,
                  isHost: false,
                  isReady: false,
                  isDisconnected: false,
                  avatarMode: 'none',
                  avatarUrl: null,
                  cameraActive: false,
                  audioMuted: true,
                  peerId: null,
                };
                gameStateService.addPlayer(state, livePlayer, socket);

                gameStateService.sendTo(socket, {
                  type: 'full_state_sync',
                  state: gameStateService.buildFullStateSync(state),
                });
              }
            }
          } catch {
            socket.close(4001, 'Invalid guest token');
          }
          return;
        }

        // Guard: reject all other messages from unregistered sockets
        if (!state.socketIdentities.has(socket)) {
          return; // not yet authenticated -> silently drop
        }

        // For all other messages, verify identity
        if ('playerId' in msg) {
          const claimedId = (msg as any).playerId;
          if (!gameStateService.verifyIdentity(state, socket, claimedId)) {
            return; // silently drop spoofed messages
          }
        }

        switch (msg.type) {
          case 'buzz': {
            const position = gameStateService.handleBuzz(state, msg.playerId);
            if (position !== null) {
              gameStateService.broadcast(state, {
                type: 'buzz_received',
                playerId: msg.playerId,
                position,
              });
              if (position === 1) {
                gameStateService.broadcast(state, {
                  type: 'timer_started',
                  timerType: 'answer',
                  durationMs: 10_000,
                });
              }
              gameStateService.broadcast(state, {
                type: 'round_state_update',
                roundState: { ...state.roundState, answerContent: null },
              });
            }
            break;
          }

          case 'answer_submitted': {
            const accepted = gameStateService.submitAnswer(state, msg.playerId, msg.answer);
            if (!accepted) break;

            gameStateService.broadcast(state, {
              type: 'answer_submitted',
              playerId: msg.playerId,
              answer: msg.answer,
            });

            // In computer_hosted mode, evaluate automatically
            if (state.mode === 'computer_hosted') {
              const board = await buildGameBoard(fastify.db, state.gameId);
              const rs = state.roundState;

              // Find the correct answer for this question
              let correctAnswer = '';
              let acceptedAnswers: string[] = [];
              let requireQuestionFormat = false;

              if (board && rs.questionId) {
                for (const cat of board.categories) {
                  for (const gq of cat.questions) {
                    if (gq.questionId === rs.questionId) {
                      // Extract text from answer content blocks
                      correctAnswer = gq.question.answer.content
                        .filter((b: ContentBlock) => b.type === 'text')
                        .map((b: ContentBlock) => (b as { type: 'text'; value: string }).value)
                        .join(' ');
                      acceptedAnswers = gq.question.answer.acceptedAnswers ?? [];
                      requireQuestionFormat = board.game.requireQuestionFormat;
                      break;
                    }
                  }
                }
              }

              const evalResult = evaluateAnswer({
                submittedAnswer: msg.answer,
                correctAnswer,
                acceptedAnswers,
                requireQuestionFormat,
              });

              const result = gameStateService.applyEvaluationResult(
                state,
                msg.playerId,
                evalResult.correct
              );

              gameStateService.broadcast(state, {
                type: 'answer_result',
                playerId: msg.playerId,
                correct: evalResult.correct,
                pointDelta: result.pointDelta,
                newScore: result.newScore,
              });

              if (result.roundOver) {
                gameStateService.completeRound(state);
              } else {
                gameStateService.advanceBuzzQueue(state);
              }

              gameStateService.broadcast(state, {
                type: 'round_state_update',
                roundState: state.roundState,
              });
            }
            // In user_hosted mode, host evaluates via POST /evaluate
            break;
          }

          case 'wager_declared': {
            const accepted = gameStateService.declareWager(state, msg.playerId, msg.wager);
            if (accepted) {
              gameStateService.broadcast(state, {
                type: 'round_state_update',
                roundState: { ...state.roundState, answerContent: null },
              });
              gameStateService.broadcast(state, {
                type: 'timer_started',
                timerType: 'answer',
                durationMs: 10_000,
              });
            }
            break;
          }

          case 'release_buzzers': {
            // Host-only action in user_hosted mode
            const identity = state.socketIdentities.get(socket);
            if (identity?.isHost && state.mode === 'user_hosted') {
              gameStateService.releaseBuzzers(state);
              gameStateService.broadcast(state, { type: 'buzzers_released' });
              gameStateService.broadcast(state, {
                type: 'timer_started',
                timerType: 'buzz',
                durationMs: 10_000,
              });
              gameStateService.broadcast(state, {
                type: 'round_state_update',
                roundState: { ...state.roundState, answerContent: null },
              });
            }
            break;
          }

          case 'lock_buzzers': {
            const identity = state.socketIdentities.get(socket);
            if (identity?.isHost && state.mode === 'user_hosted') {
              gameStateService.lockBuzzers(state);
              gameStateService.broadcast(state, {
                type: 'buzzers_locked',
                reason: 'host_controlled',
              });
            }
            break;
          }

          case 'player_ready': {
            const allReady = gameStateService.handlePlayerReady(state, msg.playerId);
            if (allReady) {
              gameStateService.broadcast(state, { type: 'buzzers_released' });
              gameStateService.broadcast(state, {
                type: 'round_state_update',
                roundState: { ...state.roundState, answerContent: null },
              });
            }
            break;
          }

          case 'video_ended': {
            const allDone = gameStateService.handleVideoEnded(state, msg.playerId);
            if (allDone) {
              gameStateService.broadcast(state, { type: 'buzzers_released' });
              gameStateService.broadcast(state, {
                type: 'round_state_update',
                roundState: { ...state.roundState, answerContent: null },
              });
            }
            break;
          }

          case 'media_state_update': {
            const player = state.players.get(msg.playerId);
            if (player) {
              player.cameraActive = msg.cameraActive;
              player.audioMuted = msg.audioMuted;
              gameStateService.broadcast(
                state,
                {
                  type: 'media_state_update',
                  playerId: msg.playerId,
                  cameraActive: msg.cameraActive,
                  audioMuted: msg.audioMuted,
                },
                socket
              );
            }
            break;
          }

          // WebRTC signaling — relay without inspection
          case 'webrtc_offer':
          case 'webrtc_answer':
          case 'webrtc_ice_candidate': {
            // Find the target socket by peerId
            for (const [targetSocket, identity] of state.socketIdentities) {
              const targetPlayer = state.players.get(identity.playerId);
              if (targetPlayer?.peerId === msg.toPeerId) {
                gameStateService.sendTo(targetSocket, msg as any);
                break;
              }
            }
            break;
          }
        }
      });

      // ---- Close Handler ----
      socket.on('close', () => {
        const identity = gameStateService.removePlayerSocket(state, socket);
        if (!identity) return;

        const statusBefore = state.status;

        gameStateService.handleDisconnect(state, identity.playerId, (removedId) => {
          gameStateService.broadcast(state, { type: 'player_removed', playerId: removedId });
        });

        gameStateService.broadcast(state, {
          type: 'player_disconnected',
          playerId: identity.playerId,
        });

        // If a user_hosted host disconnecting caused the session to pause,
        // broadcast the status change so all clients can react.
        if (state.status === 'paused' && statusBefore !== 'paused') {
          gameStateService.broadcast(state, {
            type: 'full_state_sync',
            state: gameStateService.buildFullStateSync(state),
          });
        }
      });
    }
  );
};

export default sessionsRoutes;
