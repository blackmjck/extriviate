import fp from "fastify-plugin";
import { FastifyPluginAsync } from "fastify";
import fastifyCors from "@fastify/cors";
import { config } from "../config.js";

const corsPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyCors, {
    origin: config.client.url,
    // Only allow requests from our Angular app's URL.
    // In development this is http://localhost:4200.
    // In production this should be your custom domain.

    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    // OPTIONS must be included to support CORS preflight requests,
    // which browsers send before any cross-origin request with custom headers.

    allowedHeaders: ["Content-Type", "Authorization"],
    // Authorization is needed so our Angular app can send Bearer tokens.

    credentials: true,
    // Allows cookies and Authorization headers to be included in
    // cross-origin requests. Required for our JWT auth flow.
  });
};

export default fp(corsPlugin, {
  name: "cors",
  fastify: "5.x",
});
