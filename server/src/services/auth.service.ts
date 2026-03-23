import bcrypt from 'bcrypt';
import crypto, { randomUUID } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { Resend } from 'resend';
import type {
  PublicUser,
  AuthTokens,
  SignUpRequest,
  LoginRequest,
  LoginError,
  HttpError,
} from '@extriviate/shared';
import { MAX_LOGIN_ATTEMPTS, LOGIN_LOCKOUT_DURATION_SECONDS } from '@extriviate/shared';
import { config } from '../config.js';
import type { QueryService } from './query.service.js';

const SALT_ROUNDS = 12;
const EMAIL_RESET_MAX = 3;
const EMAIL_RESET_WINDOW_SECONDS = 10 * 60; // 10-minute fixed window
const GENERIC_RESET_RESPONSE = "If that email is registered, you'll receive a link shortly.";
// bcrypt work factor - 12 is the current recommended minimum.
// Higher = more secure but slower. 12 takes ~300ms on modern hardware.
// which is acceptable for a login endpoint.

// For the rare instance (e.g. emails) where we may send user-entered content
// from the UI back to a user without running it through other escape methods.
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class AuthService {
  private readonly resend: Resend;

  constructor(
    private readonly qs: QueryService,
    private readonly fastify: FastifyInstance
  ) {
    this.resend = new Resend(config.resend.apiKey);
  }

  // Check if the password has been used in any known data breaches (i.e. is unsafe)
  async isPwnedPassword(password: string): Promise<boolean> {
    const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
    const text = await res.text();

    return text.split('\n').some((line) => line.split(':')[0] === suffix);
  }

  // Send a password reset link if the email has an active account.
  // Always returns the same generic message to avoid confirming whether
  // an email address is registered (enumeration prevention).
  async forgotPassword(email: string): Promise<{ response: string }> {
    const normalizedEmail = email.toLowerCase().trim();
    const emailKey = `pw_reset:${normalizedEmail}`;

    // Per-email rate limit — checked before the DB query so we don't waste
    // a round-trip on a request we're going to silently drop anyway.
    // Returns the generic response on breach (not 429) to avoid confirming
    // the address is registered and being targeted.
    if (this.fastify.redisAvailable) {
      const attempts = await this.fastify.redis.get(emailKey);
      if (parseInt(attempts ?? '0', 10) >= EMAIL_RESET_MAX) {
        return { response: GENERIC_RESET_RESPONSE };
      }
    } else {
      this.fastify.log.warn('Redis unavailable: per-email password reset rate limit bypassed');
    }

    const user = await this.qs.findActiveUserByEmail(normalizedEmail);

    if (!user) {
      return { response: GENERIC_RESET_RESPONSE };
    }

    // Lazy cleanup: remove expired (but unused) tokens from previous requests
    // so the table doesn't grow unbounded over time.
    await this.qs.deleteExpiredPasswordResetTokensForUser(user.id);

    // Store only the SHA-256 hash — the raw token is never persisted.
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await this.qs.createPasswordResetToken(user.id, tokenHash, expiresAt);

    const resetUrl = `${config.client.url}/reset-password?token=${rawToken}`;

    let sendError = false;
    try {
      const { error } = await this.resend.emails.send({
        from: 'notifications@notify.extriviate.com',
        to: user.email,
        subject: 'Reset your Extriviate password',
        html: `<p>We received a request to reset your Extriviate password for account <strong>${escapeHtml(user.email)}</strong>.</p>
              <p><a href="${resetUrl}" rel="noopener noreferrer">Reset your Extriviate password</a>. This link expires in 15 minutes.</p>
              <p>If you didn't request this, you can safely ignore this email. Your password will not change.</p>`,
      });
      if (error) sendError = true;
    } catch (sendException) {
      sendError = true;
      this.fastify.log.error({ error: sendException }, 'Resend SDK threw during email send');
    }

    if (sendError) {
      // Clean up the orphaned token immediately
      await this.qs.deletePasswordResetTokenByHash(tokenHash);

      return { response: GENERIC_RESET_RESPONSE };
    }

    // Increment the per-email counter only on a successful send —
    // this counts actual delivered emails, not failed attempts or enumeration probes.
    // Fixed window: set expiry only on the first increment so the window
    // doesn't slide with each new send.
    if (this.fastify.redisAvailable) {
      const newCount = await this.fastify.redis.incr(emailKey);
      if (newCount === 1) {
        await this.fastify.redis.expire(emailKey, EMAIL_RESET_WINDOW_SECONDS);
      }
    }

    return { response: GENERIC_RESET_RESPONSE };
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const tokenRecord = await this.qs.findPasswordResetToken(tokenHash);

    // Generic error for all failure modes — never reveal whether a token
    // was valid, expired, or already used.
    const invalidTokenError = Object.assign(
      new Error('This reset link is invalid or has expired.'),
      { code: 'INVALID_RESET_TOKEN', statusCode: 400 }
    );

    if (!tokenRecord) throw invalidTokenError;
    if (tokenRecord.used_at) throw invalidTokenError;
    if (new Date() > new Date(tokenRecord.expires_at)) throw invalidTokenError;

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Transaction: update the password and consume the token atomically.
    // If either query fails, both roll back — the token stays valid for retry.
    const client = await this.fastify.db.connect();
    try {
      await client.query('BEGIN');

      // Verify the account is still active before changing anything
      const activeUser = await this.qs.findActiveUserById(tokenRecord.user_id);
      if (!activeUser) throw invalidTokenError;

      await this.qs.updateUserPassword(tokenRecord.user_id, passwordHash, client);

      // Bump the accepted token version in order to soft invalidate any
      // current tokens that might be compromised.
      await this.qs.incrementTokenVersion(tokenRecord.user_id, client);

      // Definitive single-use guard: claims the token atomically inside the
      // transaction. false return means a concurrent request won the race.
      const claimed = await this.qs.deleteUsedPasswordResetToken(tokenRecord.id, client);
      if (!claimed) {
        throw invalidTokenError;
      }

      // Invalidate all other outstanding tokens for this user so earlier reset
      // emails cannot be replayed after a successful reset.
      await this.qs.deleteUnusedPasswordResetTokensForUser(tokenRecord.user_id, client);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async signUp(data: SignUpRequest): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const normalizedEmail = data.email.toLowerCase().trim();

    const existing = await this.qs.findActiveUserByEmail(normalizedEmail);
    if (existing) {
      const e = new Error('An account with this email already exists') as HttpError;
      e.code = 'EMAIL_TAKEN';
      e.statusCode = 409;
      throw e;
    }

    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

    let dbUser;
    try {
      dbUser = await this.qs.createUser(normalizedEmail, data.displayName.trim(), passwordHash);
    } catch (err: unknown) {
      const { code } = err as { code: string };
      if (code === '23505') {
        const e = new Error('An account with this email already exists') as HttpError;
        e.code = 'EMAIL_TAKEN';
        e.statusCode = 409;
        throw e;
      }
      throw err;
    }

    const publicUser = toPublicUser(dbUser);
    const tokens = this.generateTokens(publicUser, dbUser.token_version);

    return { user: publicUser, tokens };
  }

  async login(data: LoginRequest): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const normalizedEmail = data.email.toLowerCase().trim();
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
        ) as LoginError;
        err.code = 'ACCOUNT_LOCKED';
        err.statusCode = 429;
        err.retryAfterSeconds = secondsRemaining;
        throw err;
      }
    }

    const user = await this.qs.findActiveUserByEmail(normalizedEmail);

    // Compare against a dummy hash even when user is not found.
    // This prevents timing attacks that could reveal whether
    // an email address has an account.
    const hash =
      user?.password_hash ?? '$2b$12$invalidhashpadding000000000000000000000000000000000000000';
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

      const err = new Error('Invalid email or password') as LoginError;
      err.code = 'INVALID_CREDENTIALS';
      err.statusCode = 401;
      throw err;
    }

    // Successful login - clear the failure counter
    if (this.fastify.redisAvailable) {
      await this.fastify.redis.del(lockoutKey);
    }

    const publicUser = toPublicUser(user);
    const tokens = this.generateTokens(publicUser, user.token_version);

    return { user: publicUser, tokens };
  }

  async logout(jti: string, blacklistUntil: number): Promise<void> {
    await this.fastify.blacklistToken(jti, blacklistUntil);
  }

  // Validates that the tokenVersion in a refresh JWT matches the DB.
  // Throws SESSION_INVALIDATED if stale (e.g. after a password reset) or
  // USER_NOT_FOUND if the account is gone/inactive.
  // Returns the DB-authoritative version for embedding in the new token pair.
  async validateTokenVersion(
    userId: number,
    payloadVersion: number | undefined
  ): Promise<number> {
    const dbVersion = await this.qs.findUserTokenVersion(userId);

    if (dbVersion === null) {
      const e = new Error('Account not found') as HttpError;
      e.code = 'USER_NOT_FOUND';
      e.statusCode = 401;
      throw e;
    }

    if ((payloadVersion ?? 0) !== dbVersion) {
      const e = new Error('Session has been invalidated') as HttpError;
      e.code = 'SESSION_INVALIDATED';
      e.statusCode = 401;
      throw e;
    }

    return dbVersion;
  }

  private generateTokens(user: PublicUser, tokenVersion: number): AuthTokens {
    const jti = randomUUID();
    // jti (JWT ID) is unique per token - used as the blacklist key for Redis

    const payload = {
      sub: String(user.id),
      role: user.role,
      jti,
      tokenVersion,
    };

    return {
      accessToken: this.fastify.signAccessToken(payload),
      refreshToken: this.fastify.signRefreshToken(payload),
    };
  }
}

// Strips sensitive fields - never expose passwordHash or email in responses
function toPublicUser(user: {
  id: number;
  display_name: string;
  role: string;
  created_at: string;
}): PublicUser {
  return {
    id: user.id,
    displayName: user.display_name,
    role: user.role as PublicUser['role'],
    createdAt: user.created_at,
  };
}
