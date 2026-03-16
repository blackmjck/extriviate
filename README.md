# Extriviate

![Extriviate logo](client/public/icons/icon-96x96.svg)

A multiplayer browser-based Jeopardy-style trivia game. Players join a session via a 6-character code, answer questions on a 6x6 board, and compete for points. Supports both computer-hosted (fully automated) and user-hosted (manual control) modes.

## Stack

| Layer        | Technology                      |
| ------------ | ------------------------------- |
| Server       | Node.js, Fastify v5, TypeScript |
| Client       | Angular v21, TypeScript, SCSS   |
| Database     | PostgreSQL                      |
| Cache        | Redis                           |
| File Storage | Cloudflare R2                   |
| Hosting      | Render                          |

## Monorepo Structure

```
extriviate/
  shared/   ← @extriviate/shared — Pure TS types & constants (no build step needed at runtime)
  server/   ← @extriviate/server — Fastify API + WebSocket server
  client/   ← @extriviate/client — Angular SPA (PWA-enabled)
```

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL
- Redis

### Install

```bash
npm install
```

### Development

```bash
# Run server + client concurrently
npm run dev

# Or run individually
npm run start:server
npm run start:client
```

### Build

```bash
npm run build
```

### Database

```bash
npm run db:migrate -w @extriviate/server
```

### Testing

```bash
# Run all tests
npm test

# Run individually
npm run test:server
npm run test:client

# End-to-end
npm run e2e
```

### Environment Variables

Copy `server/.env.example` to `server/.env` and fill in the values:

```
PORT, HOST, NODE_ENV
DATABASE_URL, REDIS_URL
JWT_SECRET, JWT_ACCESS_EXPIRY, JWT_REFRESH_EXPIRY
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
CLIENT_URL
```

## Architecture

The app operates on two planes:

- **Persistence Plane** (PostgreSQL via REST) — user accounts, game definitions, session records, final scores
- **Live Plane** (in-memory Maps via WebSocket) — round state, buzz queue, timers, player scores during active gameplay

See `CLAUDE.md` for full architectural documentation.

## License

Private
