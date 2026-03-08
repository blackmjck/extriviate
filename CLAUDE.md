# Extriviate — Project Context for Claude Code

This file gives Claude Code a complete mental model of the Extriviate project.
Read it before writing any code. Sections are ordered from most to least fundamental.

---

## What Is This?

A multiplayer browser-based Jeopardy-style trivia game. Players join a session
via a 6-character code, answer questions on a 6×6 board, and compete for points.
The host can be the computer (fully automated) or a human (manual control).

---

## Stack & Hosting

| Layer                 | Technology                                                     |
| --------------------- | -------------------------------------------------------------- |
| Server                | Node.js, Fastify v5, TypeScript (`"type": "module"`)           |
| Client                | Angular v21, TypeScript, SCSS, zoneless, standalone components |
| Database              | PostgreSQL (Render managed)                                    |
| Cache / JWT blacklist | Redis (Render Key Value)                                       |
| File storage          | Cloudflare R2 (presigned upload, no egress fees)               |
| Hosting               | Render — single $7/mo web service, single instance only        |
| Monorepo              | npm workspaces: `shared/`, `server/`, `client/`                |

**Single instance constraint is intentional.** No distributed state, no Redis
pub/sub for game state. `GameStateService` holds everything in-memory Maps.

---

## Repository Layout

```
extriviate/
  package.json                     ← workspace root; workspaces: [shared, server, client]
  CLAUDE.md                        ← this file
  shared/                          ← @extriviate/shared — pure TS types + constants, no build step
    package.json
    src/
      index.ts
      constants.ts
      auth.types.ts
      user.types.ts
      game.types.ts
      session.types.ts
      game-session.types.ts
      upload.types.ts
      api.types.ts
  server/                          ← @extriviate/server
    package.json
    src/
      config.ts
      app.ts
      server.ts
      types/fastify.d.ts
      plugins/                     ← db, redis, jwt, cors, websocket
      hooks/
        auth.hook.ts               ← requireAuth, optionalAuth
      services/
        auth.service.ts
        session.service.ts         ← DB operations for sessions/players
        game-state.service.ts      ← IN-MEMORY live state, buzz queue, timers
        session-state-builder.ts   ← buildLiveSessionState() for full_state_sync
        evaluation.service.ts      ← layered answer evaluation (no AI yet)
      routes/
        auth.routes.ts
        users.routes.ts
        categories.routes.ts
        questions.routes.ts
        games.routes.ts
        uploads.routes.ts
        sessions.routes.ts         ← includes WebSocket handler
  client/                          ← @extriviate/client
    angular.json
    src/
      app/
        core/services/
          auth.service.ts
          guest-session.service.ts
          game-socket.service.ts
          game-state.service.ts    ← Angular signal store for live session
          webrtc.service.ts
          speech-recognition.service.ts
          orientation.service.ts
        features/
          auth/
          lobby/
          game-board/
          question/
          daily-double/
          host-controls/
          session-end/
          game-editor/
          upload/
```

---

## Code Style Rules

- **TypeScript everywhere.** No `any` unless interfacing with raw DB rows (cast immediately).
- **Single quotes** everywhere (`.prettierrc`).
- **Angular 2016 file naming:** `game-board.component.ts`, `game-state.service.ts`, etc.
- **Angular patterns:** `signal()`/`computed()` for state, `inject()` for DI,
  `@if`/`@for` control flow, standalone components only. No `NgModules`, no `Zone.js`.
- **Fastify patterns:** `fp()` for plugins, dedicated pool client + `BEGIN/COMMIT/ROLLBACK`
  for multi-statement transactions, `COALESCE` for partial updates, check PG error
  codes `23505` (duplicate) and `23503` (FK violation) before rethrowing.
- **Server responses always follow `ApiResponse<T>`:**

  ```typescript
  { success: true,  data: T }
  { success: false, error: { message: string; code: string } }
  ```

- **Process exits on startup failure** (`process.exit(1)`) — Render will restart.

---

## Database Schema

```sql
users             id, email UNIQUE, display_name, password_hash, role, is_active
categories        id, creator_id→users, name, UNIQUE(creator_id,name)
questions         id, creator_id, category_id, content JSONB
answers           id, question_id CASCADE, content JSONB, accepted_answers text[]
games             id, creator_id, title, daily_doubles_enabled, is_published,
                  require_question_format, use_ai_evaluation
game_categories   id, game_id, category_id RESTRICT, position 1-6, UNIQUE(game_id,position)
game_questions    id, game_id, game_category_id, question_id RESTRICT, row_position 1-5,
                  point_value>0, is_daily_double, is_answered
game_sessions     id, game_id, host_id, name, join_code, status, mode, turn_based,
                  played_at, ended_at
session_players   id, session_id, user_id nullable, display_name, final_score INTEGER, rank nullable
uploads           id, owner_id, key, public_url UNIQUE, mime_type, size_bytes
```

- Scores support negatives (INTEGER, not UNSIGNED).
- `is_active = false` soft-deletes users.
- `status` values: `lobby | active | paused | completed`
- `mode` values: `computer_hosted | user_hosted`

---

## The Two Planes (Most Important Architectural Concept)

**Persistence Plane — PostgreSQL via REST**
Low-frequency, durable operations: user accounts, game definitions, session records,
final scores, uploads. Always survives a server restart.

**Live Plane — In-memory Maps via WebSocket**
Everything during active gameplay: round state, buzz queue, timers, player scores,
disconnection grace periods. Lives in `GameStateService` on the server.
If the server restarts mid-game, the session is over — acceptable for this tier.

WebRTC sits orthogonally: the server relays signaling messages through the WebSocket
channel but never touches media. After ICE completes, media is peer-to-peer.

---

## Identity & Authentication

Three identity types — handle all three consistently:

**Registered users**

- JWT access token (15m) passed as `?token=` query param when opening the WebSocket.
- Refresh token (7d) stored client-side, used to get new access tokens.
- JWT blacklist in Redis (keyed by `jti`, TTL = remaining expiry).

**Guest players**

- Receive a signed `guest_session` token at join time (4h expiry).
- Token payload: `{ sub: 'guest:{playerId}', sessionId, playerId, type: 'guest_session' }`.
- Stored in `sessionStorage` by `GuestSessionService` (survives refresh, gone when tab closes).
- On WebSocket reconnect, guest sends `{ type: 'reconnect_guest', guestToken }` as the
  **first message** before anything else.

**`socketIdentities` map** (`Map<WebSocket, { playerId, isHost }>`)
Lives inside `SessionGameState`. Every incoming WebSocket message that carries a
`playerId` must be validated against this map — claimed identity must match verified
identity. This prevents spoofing.

---

## WebSocket: What Goes Where

**Always WebSocket (latency-critical or broadcast):**
`buzz`, `answer_submitted`, `wager_declared`, `release_buzzers`, `lock_buzzers`,
`player_ready`, `video_ended`, `reconnect_guest`, all `webrtc_*` signaling,
and all server→client broadcasts.

**Always REST (durable state changes):**
Join session, create/start session, `PATCH /sessions/:id/status`, evaluate answer
(user-hosted host), score persistence, media state change.

**Rule of thumb:** if it needs to reach all other clients within milliseconds, it's
WebSocket. If it writes a row to the DB, it's REST.

Server broadcasts are always **complete state snapshots** for the relevant slice —
clients replace their local state entirely on receipt, never diff/patch.

---

## In-Memory Game State Shape

```typescript
SessionGameState {
  sessionId, mode, turnBased, status
  players:             Map<playerId, LivePlayer>
  disconnectedPlayers: Map<playerId, DisconnectedPlayer>
  socketIdentities:    Map<WebSocket, { playerId, isHost }>
  playerSockets:       Map<playerId, WebSocket>
  roundState:          RoundStatePayload
  boardValues:         number[]        // remaining unanswered point values (for DD wager max)
  hostPlayerId:        number
  buzzTimer:           NodeJS.Timeout | null
  answerTimer:         NodeJS.Timeout | null
  lockTimer:           NodeJS.Timeout | null
}

LivePlayer {
  playerId, displayName, score, isHost, isReady, isDisconnected
  avatarMode, avatarUrl, cameraActive, audioMuted, peerId
}
```

Scores are updated in `LivePlayer.score` on every evaluation and immediately
persisted to `session_players.final_score` via the `onScoreChanged` callback.

---

## Computer-Hosted Round State Machine

```
idle
 ├─ Daily Double selected ──► daily_double_revealed
 │                                └─ wager_declared ──► question_revealed ──► player_answering
 │                                                                                  └─ answer_evaluated ──► round_complete
 └─ Normal question selected ──► question_revealed (buzzers locked)
                                      └─ [lock expires] ──► buzzers_open (10s window)
                                                                ├─ nobody buzzed ──► round_timeout ──► idle
                                                                └─ buzz ──► player_answering (10s)
                                                                                ├─ correct ──► answer_evaluated ──► round_complete
                                                                                ├─ wrong ──► answer_evaluated ──► next in queue / round_timeout
                                                                                └─ timeout ──► treated as wrong
```

**Buzzer lock strategy (computer_hosted only):**

| Content type     | Lock reason      | Releases when                                      |
| ---------------- | ---------------- | -------------------------------------------------- |
| Text             | `reading_time`   | Timer: `clamp(wordCount/250*60000, 2000, 8000)` ms |
| Image            | `awaiting_ready` | All active players send `player_ready` OR 30s max  |
| Video            | `video_playing`  | All active players send `video_ended`              |
| Mixed + video    | `video_playing`  | Video takes priority                               |
| Mixed text+image | `awaiting_ready` |                                                    |

**User-hosted:** lock reason is always `host_controlled`. Host sends
`release_buzzers` / `lock_buzzers` messages to control the buzzer manually.

---

## Daily Double Rules

- Only `activePlayerId` (the question selecter) can answer — no buzz queue.
- Wager: min `$5`, max `Math.max(playerScore, highestRemainingBoardValue)`.
- If player score ≤ 0, max = `highestRemainingBoardValue`.
- Wrong answer deducts the wager (score can go negative).
- After DD (correct or wrong), the same player selects the next question.
- Server validates wager server-side — client-side validation is UX only.

---

## Disconnection / Reconnection Grace Period

**On WebSocket close:**

1. Remove socket from identity maps.
2. Mark `LivePlayer.isDisconnected = true`.
3. Broadcast `player_disconnected`.
4. Start 30s removal timer. On expiry: remove from live state, broadcast `player_removed`.
5. Mid-turn special cases:
   - Active answerer: forfeit turn, advance to next buzzer.
   - Daily Double holder: return to `idle`.
   - Question selecter: set `questionSelecterId = null`.
   - Host (user_hosted): transition session to `paused`.

**On reconnect:**

1. Verify identity (JWT or guest token).
2. Cancel removal timer, clear `isDisconnected`.
3. Register new socket in identity maps.
4. Send `full_state_sync` to reconnecting socket only.
5. Broadcast `player_reconnected` to all others.
6. If session was `paused` and host reconnects: restore to `active`.

**Client-side reconnect backoff:** `min(1000 * 2^attempt, 30000)` ms ± 20% jitter.
`intentionallyClosed` flag prevents reconnection after deliberate disconnect.

---

## Answer Evaluation (No AI Yet)

Layered pipeline in `evaluation.service.ts`:

1. **Exact** — normalise both strings (strip Jeopardy format, lowercase, remove
   punctuation and articles), compare. Returns immediately on match.
2. **Accepted list + fuzzy** — compare against creator-defined `acceptedAnswers[]`
   using Levenshtein distance. Threshold: 1 edit ≤4 chars, 2 edits ≤8 chars, 20% otherwise.
3. **Fuzzy on primary answer** — same Levenshtein logic against the main correct answer.
4. **Token overlap** — tokenise both strings (remove stop words), require ≥80% of
   correct tokens to appear in submitted answer.

`requireQuestionFormat` flag: if true, submitted answer must begin with "What is…" / "Who is…"
before normalisation strips it.
`useAIEvaluation` flag exists on the `Game` entity but is always `false` — AI layer deferred.

---

## Push-to-Talk Voice (Web Speech API)

Entirely client-side. `SpeechRecognitionService` wraps the browser API:

- `continuous: false`, `interimResults: true`
- Interim results update the answer text field in real time.
- On PTT button release: `stop()` → final transcript → `answer_submitted` WebSocket message.
- If `window.SpeechRecognition` is unavailable, PTT button is hidden; text input only.
- Evaluation pipeline is identical regardless of input method.

Phase 2 (future): OpenAI Whisper. Phase 3 (future): Deepgram streaming.

---

## WebRTC

Server's only job: relay signaling messages by `toPeerId`.
Messages: `webrtc_offer`, `webrtc_answer`, `webrtc_ice_candidate`.
Server never inspects, stores, or modifies these payloads.
After ICE completes, media flows peer-to-peer.
`peerId` is a random UUID generated client-side and stored in `LivePlayer` at join time.

---

## PWA

Set up via `ng add @angular/pwa`. Key requirements:

- Service worker caches app shell for offline load.
- Service worker must **not** intercept WebSocket or API calls.
- `manifest.webmanifest`: `display: standalone` removes browser chrome on mobile.
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
- Safe area insets (`env(safe-area-inset-*)`) applied to `.game-container`.
- `OrientationService` exposes `isPortrait` and `isSmallScreen` signals.
- Buzz button: `width/height: min(30vw, 120px)`, `border-radius: 50%`,
  `touch-action: manipulation`, use `(touchstart)` + `event.preventDefault()`.

---

## Key Constants (shared/src/constants.ts)

```
GAME_CATEGORY_COUNT     = 6
GAME_QUESTION_ROWS      = 5
DAILY_DOUBLE_MAX        = 2
DAILY_DOUBLE_MIN_WAGER  = 5

BUZZ_WINDOW_DURATION_MS   = 10_000
ANSWER_TIMER_DURATION_MS  = 10_000
ANSWER_REVEAL_DURATION_MS = 3_000
TEXT_MIN_LOCK_MS          = 2_000
TEXT_MAX_LOCK_MS          = 8_000
WORDS_PER_MINUTE          = 250
IMAGE_MIN_VIEW_MS         = 5_000
MAX_READY_WAIT_MS         = 30_000
RECONNECT_GRACE_PERIOD_MS = 30_000
GUEST_TOKEN_EXPIRY_HOURS  = 4
SESSION_CODE_LENGTH       = 6
```

---

## Environment Variables (server)

```
PORT, HOST, NODE_ENV
DATABASE_URL, REDIS_URL
JWT_SECRET, JWT_ACCESS_EXPIRY, JWT_REFRESH_EXPIRY
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
CLIENT_URL
ANTHROPIC_API_KEY   (reserved — future AI evaluation)
OPENAI_API_KEY      (reserved — future Whisper STT)
```

---

## REST API Surface

```
POST   /api/auth/signup
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh

GET    /api/users/me
PATCH  /api/users/me
POST   /api/users/me/change-password
DELETE /api/users/me

GET    /api/categories         (paginated)
GET    /api/categories/:id
POST   /api/categories
PATCH  /api/categories/:id
DELETE /api/categories/:id

GET    /api/questions          (paginated, ?categoryId filter)
GET    /api/questions/:id
POST   /api/questions
PATCH  /api/questions/:id
DELETE /api/questions/:id

GET    /api/games              (paginated)
GET    /api/games/:id          ← full board with categories + questions + answers
POST   /api/games
PATCH  /api/games/:id
PUT    /api/games/:id/board    ← replaces entire board in one transaction
DELETE /api/games/:id

POST   /api/uploads/presign
POST   /api/uploads/confirm
GET    /api/uploads            (paginated)
DELETE /api/uploads/:id

GET    /api/sessions/:joinCode             ← preview before joining
POST   /api/sessions                       ← create (auth required)
POST   /api/sessions/:id/join              ← guest | login | signup
PATCH  /api/sessions/:id/status            ← active | paused | completed
GET    /api/sessions/:id/players
DELETE /api/sessions/:id/players/:playerId
POST   /api/sessions/:id/questions/:questionId/select   ← mark answered + open question
POST   /api/sessions/:id/evaluate                       ← user_hosted host evaluation
WS     /api/sessions/:id/ws?token=...
```

---

## WebSocket Message Types

**Server → Client (`GameplayMessage`):**
`full_state_sync`, `round_state_update`, `buzzers_released`, `buzzers_locked`,
`buzz_received`, `answer_submitted`, `answer_result`, `timer_started`, `timer_expired`,
`player_disconnected`, `player_reconnected`, `player_removed`, `host_assigned_player`,
`media_state_update`, `webrtc_offer`, `webrtc_answer`, `webrtc_ice_candidate`

**Client → Server (`ClientGameMessage`):**
`reconnect_guest`, `buzz`, `answer_submitted`, `wager_declared`,
`release_buzzers`, `lock_buzzers`, `player_ready`, `video_ended`,
`webrtc_offer`, `webrtc_answer`, `webrtc_ice_candidate`

---

## Angular Client Architecture Notes

- `GameSocketService` owns the WebSocket. Reconnect uses exponential backoff + jitter.
  Pending messages are queued until identity is confirmed, then flushed.
- `GameStateService` (Angular) holds all live session state as signals.
  `full_state_sync` replaces all signals entirely. All other messages are partial updates.
- Components read from signals only — they never hold local copies of game state.
- `GuestSessionService` uses `sessionStorage` keys:
  `extriviate_guest_token`, `extriviate_guest_player_id`, `extriviate_guest_session_id`.

---

## What Is Not Built Yet

The following are designed and documented here but have no implementation:

- Angular client (all features, components, services)
- `sessions.routes.ts` — the most complex route file (WebSocket handler lives here)
- `session.service.ts` — DB operations for sessions
- `auth.service.ts` — signup/login/logout/refresh
- Adaptive game board layout component
- Player gallery (avatars, active highlight, disconnected indicator)
- Daily Double wager UI
- Speech bubble answer display
- Host controls panel
- Session end / rankings screen
- PWA manifest + service worker config
- AI evaluation layer (`useAIEvaluation` flag exists, always `false`)
- Whisper / Deepgram STT (Phase 2/3 — Web Speech API only for now)

---

## Design Tokens (Mobile UI)

```
Background:    #0a0a14  (dark navy)
Accent:        #4169e1  (royal blue)
Score/value:   #f5c842  (gold)
Question text: Georgia, serif
UI text:       Trebuchet MS, sans-serif
Score display: Courier New, monospace
```
