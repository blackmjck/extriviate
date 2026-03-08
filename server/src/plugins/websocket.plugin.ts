import fp from "fastify-plugin";
import { FastifyPluginAsync } from "fastify";
import fastifyWebsocket from "@fastify/websocket";

const websocketPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyWebsocket, {
    options: {
      maxPayload: 1_048_576,
      // Maximum WebSocket message size in bytes - 1 MB.
      // Game state messages will be much smaller than this.
      // Prevents oversized messages from being processed.
    },
  });
};

export default fp(websocketPlugin, {
  name: "websocket",
  fastify: "5.x",
});
