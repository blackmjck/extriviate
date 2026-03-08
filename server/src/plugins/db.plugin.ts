import fp from "fastify-plugin";
import { FastifyPluginAsync } from "fastify";
import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

const dbPlugin: FastifyPluginAsync = async (fastify) => {
  const pool = new Pool({
    connectionString: config.db.url,
    max: 10,
    // Maximum number of clients in the pool.
    // 10 is conservative and appropriate for a $7/mo Render instance.
    // More connections = more RAM consumed

    idleTimeoutMillis: 30_000,
    // A client idle for 30 seconds is released back to the pool.

    connectionTimeoutMillis: 5_000,
    // If a connection cannot be established within 5 seconds, throw an error
    // rather than hanging indefinitely
  });

  // Test the connection on startup - fail fast if the DB is unreachable
  await pool.connect().then((client) => {
    fastify.log.info("PostgreSQL connected");
    client.release();
    // Always release clients back to the pool after use
  });

  // Attach the pool to the Fastify instance so all route handlers
  // can access it via fastify.db
  fastify.decorate("db", pool);

  // Drain the pool gracefully when the server shuts down.
  // Without this, Node may hang waiting for open conditions to close.
  fastify.addHook("onClose", async () => {
    await pool.end();
    fastify.log.info("PostgreSQL pool drained");
  });
};

// fp() wraps the plugin with fastify-plugin, breaking encapsulation so that
// fastify.db is accessible everywhere, not just within this plugin's scope.
export default fp(dbPlugin, {
  name: "db",
  fastify: "5.x",
});
