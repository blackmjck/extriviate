import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import type { Pool } from "pg";
import type { FastifyInstance } from "fastify";
import type {
  User,
  PublicUser,
  AuthTokens,
  SignUpRequest,
  LoginRequest,
} from "@extriviate/shared";

const SALT_ROUNDS = 12;
// bcrypt work factor - 12 is the current recommended minimum.
// Higher = more secure but slower. 12 takes ~300ms on modern hardware.
// which is acceptable for a login endpoint.

export class AuthService {
  constructor(
    private readonly db: Pool,
    private readonly fastify: FastifyInstance,
  ) {}

  async signUp(
    data: SignUpRequest,
  ): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const { email, password, displayName } = data;

    // Check for existing account with this email
    const existing = await this.db.query(
      "SELECT id FROM users WHERE email = $1",
      [email.toLowerCase()],
    );
    if (existing.rows.length > 0) {
      const err = new Error("An account with this email already exists") as any;
      err.code = "EMAIL_TAKEN";
      err.statusCode = 409;
      throw err;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await this.db.query<User>(
      `INSERT INTO users (email, display_name, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id, email, display_name, role, is_active, created_at, updated_at`,
      [email.toLowerCase(), displayName, passwordHash],
    );

    const user = result.rows[0];
    const publicUser = toPublicUser(user);
    const tokens = this.generateTokens(publicUser);

    return { user: publicUser, tokens };
  }

  async login(
    data: LoginRequest,
  ): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const result = await this.db.query<User>(
      "SELECT * FROM users WHERE email = $1 AND is_active = true",
      [data.email.toLowerCase()],
    );

    const user = result.rows[0];

    // Compare against a dummy hash even when user is not found.
    // This prevents timing attacks that could reveal whether
    // an email address has an account.
    const hash =
      (user as any)?.password_hash ??
      "$2b$12$invalidhashpadding000000000000000000000000000000000000000";
    const valid = await bcrypt.compare(data.password, hash);

    if (!user || !valid) {
      const err = new Error("Invalid email or password") as any;
      err.code = "INVALID_CREDENTIALS";
      err.statusCode = 401;
      throw err;
    }

    const publicUser = toPublicUser(user);
    const tokens = this.generateTokens(publicUser);

    return { user: publicUser, tokens };
  }

  async logout(jti: string, exp: number): Promise<void> {
    await this.fastify.blacklistToken(jti, exp);
  }

  private generateTokens(user: PublicUser): AuthTokens {
    const jti = randomUUID();
    // jti (JWT ID) is unique per token - used as the blacklist key for Redis

    const payload = {
      sub: String(user.id),
      email: "", // not included in payload for privacy
      role: user.role,
      jti,
    };

    return {
      accessToken: this.fastify.signAccessToken(payload),
      refreshToken: this.fastify.signRefreshToken(payload),
    };
  }
}

// Strips sensitive fields - never expose passwordHash or email in responses
function toPublicUser(user: any): PublicUser {
  return {
    id: user.id,
    displayName: user.display_name,
    role: user.role,
    createdAt: user.created_at,
  };
}
