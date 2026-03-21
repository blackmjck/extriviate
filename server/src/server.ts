import { buildApp } from './app.js';
import { config } from './config.js';

// Top-level await is valid here because server/package.json has type "module"
const fastify = await buildApp();

try {
  await fastify.listen({
    port: config.server.port,
    host: config.server.host,
  });

  process.on('SIGTERM', () => {
    fastify.log.info('SIGTERM received - closing server');
    void fastify.close().then(() => process.exit(0));
  });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
  // process.exit(1) signals to Render (or any process manager) that
  // the server exited with an error, which triggers a restart
}
