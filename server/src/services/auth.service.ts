import bcrypt from 'bcrypt';
import crypto, { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import type { User, PublicUser, AuthTokens, SignUpRequest, LoginRequest } from '@extriviate/shared';
import { MAX_LOGIN_ATTEMPTS, LOGIN_LOCKOUT_DURATION_SECONDS } from '@extriviate/shared';

const SALT_ROUNDS = 12;
// bcrypt work factor - 12 is the current recommended minimum.
// Higher = more secure but slower. 12 takes ~300ms on modern hardware.
// which is acceptable for a login endpoint.

export class AuthService {
  constructor(
    private readonly db: Pool,
    private readonly fastify: FastifyInstance
  ) {}

  // Check if the password has been used in any known data breaches (i.e. is unsafe)
  async isPwnedPassword(password: string): Promise<boolean> {
    const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
    const text = await res.text();

    return text.split('\n').some((line) => line.split(':')[0] === suffix);
  }

  async signUp(data: SignUpRequest): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const { email, password, displayName } = data;

    // Check for existing account with this email
    const existing = await this.db.query('SELECT id FROM users WHERE email = $1', [
      email.toLowerCase(),
    ]);
    if (existing.rows.length > 0) {
      const err = new Error('An account with this email already exists') as any;
      err.code = 'EMAIL_TAKEN';
      err.statusCode = 409;
      throw err;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await this.db.query<User>(
      `INSERT INTO users (email, display_name, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id, email, display_name, role, is_active, created_at, updated_at`,
      [email.toLowerCase(), displayName, passwordHash]
    );

    const user = result.rows[0];
    const publicUser = toPublicUser(user);
    const tokens = this.generateTokens(publicUser);

    return { user: publicUser, tokens };
  }

  async login(data: LoginRequest): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const normalizedEmail = data.email.toLowerCase();
    const lockoutKey = `login_attempts:${normalizedEmail}`;

    // Check for an active lockout
    // This runs before DB query and bcrypt, so locked accounts return
    // immediately without burning 300ms on a password hash comparison.
    // If Redis is unavailable, we skip the check and fall through to
    // normal authentication. Turnstile remains active as the primary protection.
    if (this.fastify.redisAvailable) {
      const attempts = await this.fastify.redis.get(lockoutKey);
      const failCount = parseInt(attempts ?? '0', 10);

      if (failCount >= MAX_LOGIN_ATTEMPTS) {
        // ttl() returns the remaining seconds on the key.
        // -1 = key has no expiry (shouldn't happen here), -2 = key doesn't exist.
        const ttl = await this.fastify.redis.ttl(lockoutKey);
        const secondsRemaining = Math.max(ttl, 0);
        const minutesRemaining = Math.ceil(secondsRemaining / 60);

        const err = new Error(
          `Too many failed login attempts. Please try again in ${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''}.`
        ) as any;
        err.code = 'ACCOUNT_LOCKED';
        err.statusCode = 429;
        err.retryAfterSeconds = secondsRemaining;
        throw err;
      }
    }

    const result = await this.db.query<User>(
      'SELECT * FROM users WHERE email = $1 AND is_active = true',
      [data.email.toLowerCase()]
    );

    const user = result.rows[0];

    // Compare against a dummy hash even when user is not found.
    // This prevents timing attacks that could reveal whether
    // an email address has an account.
    const hash =
      (user as any)?.password_hash ??
      '$2b$12$invalidhashpadding000000000000000000000000000000000000000';
    const valid = await bcrypt.compare(data.password, hash);

    if (!user || !valid) {
      // Record the failure
      if (this.fastify.redisAvailable) {
        const newCount = await this.fastify.redis.incr(lockoutKey);

        if (newCount === 1) {
          // First failure: start the lockout window.
          // EXPIRE is only called when the count becomes 1 (i.e. the key is new).
          // Subsequent failures just increment within the existing window.
          await this.fastify.redis.expire(lockoutKey, LOGIN_LOCKOUT_DURATION_SECONDS);
        }
      }

      const err = new Error('Invalid email or password') as any;
      err.code = 'INVALID_CREDENTIALS';
      err.statusCode = 401;
      throw err;
    }

    // Successful login - clear the failure counter
    if (this.fastify.redisAvailable) {
      await this.fastify.redis.del(lockoutKey);
    }

    const publicUser = toPublicUser(user);
    const tokens = this.generateTokens(publicUser);

    return { user: publicUser, tokens };
  }

  async logout(jti: string, blacklistUntil: number): Promise<void> {
    await this.fastify.blacklistToken(jti, blacklistUntil);
  }

  private generateTokens(user: PublicUser): AuthTokens {
    const jti = randomUUID();
    // jti (JWT ID) is unique per token - used as the blacklist key for Redis

    const payload = {
      sub: String(user.id),
      email: '', // not included in payload for privacy
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
