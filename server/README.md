### Architecture of the API

```
server/
  src/
    server.ts              ← entry point, starts Fastify
    app.ts                 ← builds and configures the Fastify instance
    config.ts              ← loads and validates environment variables
    types/
      fastify.d.ts         ← TypeScript declaration merging for decorators
    plugins/
      db.plugin.ts         ← PostgreSQL connection pool
      redis.plugin.ts      ← Redis client for JWT blacklist
      jwt.plugin.ts        ← JWT verify/sign, blacklist check
      cors.plugin.ts       ← CORS configuration
      websocket.plugin.ts  ← WebSocket support
    routes/
      auth.routes.ts       ← /api/auth/* (login, signup, refresh, logout)
      users.routes.ts      ← /api/users/* (profile, password)
      games.routes.ts      ← /api/games/* (CRUD)
      categories.routes.ts ← /api/categories/* (CRUD)
      questions.routes.ts  ← /api/questions/* (CRUD)
      uploads.routes.ts    ← /api/uploads/* (presign, confirm, delete)
      sessions.routes.ts   ← /api/sessions/* (create, join, manage)
    hooks/
      auth.hook.ts         ← reusable preHandler for protected routes
    services/
      auth.service.ts      ← password hashing, token generation
      session.service.ts   ← join code generation, session management
      upload.service.ts    ← R2 presign, delete
  .env
  .env.example
  package.json
  tsconfig.json
```
