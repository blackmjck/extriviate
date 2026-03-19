import Fastify, { FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import dbPlugin from './plugins/db.plugin.js';
import redisPlugin from './plugins/redis.plugin.js';
import jwtPlugin from './plugins/jwt.plugin.js';
import corsPlugin from './plugins/cors.plugin.js';
import websocketPlugin from './plugins/websocket.plugin.js';
import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import gamesRoutes from './routes/games.routes.js';
import categoriesRoutes from './routes/categories.routes.js';
import questionsRoutes from './routes/questions.routes.js';
import uploadsRoutes from './routes/uploads.routes.js';
import sessionsRoutes from './routes/sessions.routes.js';
import { config } from './config.js';

export async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: config.server.nodeEnv === 'production' ? 'info' : 'debug',
      // 'debug' in development shows every request detail.
      // 'info' in production reduces log noise and cost.
    },
    // Tells Fastify to read the real client IP from the X-Forwarded-For header.
    // Required because Render routes all traffic through a reverse proxy.
    // Without this, request.ip is always the proxy's internal address, and
    // every user would share the same rate-limit counter.
    trustProxy: true,
  });

  // ---- Infrastructure plugins ----
  // These must be registered before routes because routes depend on
  // fastify.db, fastify.redis, etc. Fastify guarantees registration order
  await fastify.register(dbPlugin);
  await fastify.register(redisPlugin);
  await fastify.register(jwtPlugin);
  // jwtPlugin depends on redisPlugin - its dependencies: ['redis'] declaration
  // makes Fastify verify this ordering is correct at startup
  await fastify.register(corsPlugin);
  await fastify.register(websocketPlugin);
  await fastify.register(fastifyCookie, {
    secret: config.jwt.secret, // signs cookies to prevent tampering
  });

  // ---- Routes ----
  // Each route group is registered under /api with a feature prefix.
  // The prefix option is provided by Fastify's register API - all routes
  // defined inside the plugin automatically inherit the prefix.
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(usersRoutes, { prefix: '/api/users' });
  await fastify.register(gamesRoutes, { prefix: '/api/games' });
  await fastify.register(categoriesRoutes, { prefix: '/api/categories' });
  await fastify.register(questionsRoutes, { prefix: '/api/questions' });
  await fastify.register(uploadsRoutes, { prefix: '/api/uploads' });
  await fastify.register(sessionsRoutes, { prefix: '/api/sessions' });

  // ---- Health Check ----
  // Render uses this to verify the service is running.
  // Kept outside /api prefix so it's always accessible without auth.
  fastify.get('/health', async () => ({ status: 'ok' }));

  return fastify;
}
