import { FastifyPluginAsync } from "fastify";
import { AuthService } from "../services/auth.service.js";
import { requireAuth } from "../hooks/auth.hook.js";
import type {
  SignUpRequest,
  LoginRequest,
  RefreshRequest,
} from "@extriviate/shared";

const authRoutes: FastifyPluginAsync = async (fastify) => {
  const authService = new AuthService(fastify.db, fastify);

  // POST /api/auth/signup
  fastify.post<{ Body: SignUpRequest }>(
    "/signup",
    {
      schema: {
        // Fastify validates the request body against this schema before
        // the handler runs. Invalid requests are rejected with a 400
        // automatically - no manual validation needed in the handler.
        body: {
          type: "object",
          required: ["email", "password", "displayName"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 8, maxLength: 72 },
            // 72 chars is bcrypt's effective maximum input length
            displayName: { type: "string", minLength: 1, maxLength: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { user, tokens } = await authService.signUp(request.body);
        return reply
          .status(201)
          .send({ success: true, data: { user, tokens } });
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({
          success: false,
          error: { message: err.message, code: err.code },
        });
      }
    },
  );

  // POST /api/auth/login
  fastify.post<{ Body: LoginRequest }>(
    "/login",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { user, tokens } = await authService.login(request.body);
        return reply
          .status(200)
          .send({ success: true, data: { user, tokens } });
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({
          success: false,
          error: { message: err.message, code: err.code },
        });
      }
    },
  );

  // POST /api/auth/logout  (protected)
  fastify.post(
    "/logout",
    { preHandler: [requireAuth] },
    // preHandler runs before the route handler.
    // requireAuth verifies the JWT and populates request.user.
    // An array is used so additional hooks can be added later.
    async (request, reply) => {
      const payload = request.user;
      if (payload.jti && payload.exp) {
        await authService.logout(payload.jti, payload.exp);
      }
      return reply.status(200).send({ success: true, data: null });
    },
  );

  // POST /api/auth/refresh
  fastify.post<{ Body: RefreshRequest }>(
    "/refresh",
    {
      schema: {
        body: {
          type: "object",
          required: ["refreshToken"],
          properties: {
            refreshToken: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const payload = fastify.jwt.verify<any>(request.body.refreshToken);

        const blacklisted = await fastify.isTokenBlacklisted(payload.jti);
        if (blacklisted) {
          return reply.status(401).send({
            success: false,
            error: { message: "Token has been revoked", code: "TOKEN_REVOKED" },
          });
        }

        // Issue a fresh access token using the same identity
        const accessToken = fastify.signAccessToken({
          sub: payload.sub,
          email: payload.email,
          role: payload.role,
          jti: payload.jti,
        });

        return reply.send({ success: true, data: { accessToken } });
      } catch {
        return reply.status(401).send({
          success: false,
          error: { message: "Invalid refresh token", code: "INVALID_TOKEN" },
        });
      }
    },
  );
};

export default authRoutes;
