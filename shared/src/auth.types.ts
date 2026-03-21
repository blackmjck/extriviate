// The shape of data encoded inside the JWT payload
// Kept minimal - only what's needed to identify and authorize a request
export interface JwtPayload {
  sub: string; // subject - the user's numeric ID, stored as string per JWT convention
  email: string;
  role: UserRole;
  iat?: number; // issued-at - added automatically by the JWT library
  exp?: number; // expiry - added automatically by the JWT library
  jti?: string; // JWT ID - unique identifier used to key the Redis blacklist
  tokenVersion?: number; // incremented on password reset; stale tokens are rejected by requireAuth
}

// The token pair returned on successful login or token refresh (used in generateTokens)
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// The refresh token is sent as an HttpOnly cookie, so it never appears here
export interface AccessTokenResponse {
  accessToken: string;
}

// Request body for email/password signup.
export interface SignUpRequest {
  email: string;
  password: string;
  displayName: string;
  turnstileToken?: string;
}

// Request body for email/password login
export interface LoginRequest {
  email: string;
  password: string;
  turnstileToken?: string;
}

// Error type if login request fails
export interface LoginError extends Error {
  code: string;
  statusCode: number; // HTTP status code
  retryAfterSeconds?: number; // rate limiting
}

// Response body returned after a successful login or signup
export interface AuthResponse {
  user: PublicUser;
  tokens: AccessTokenResponse;
}

// Response body returned after a successful isPasswordPwned check
export interface PwnedResponse {
  pwned: boolean;
}

// Supported external OAuth providers.
// Typed as a union so adding a new provider (e.g. 'amazon') is a single change here
// and TypeScript will flag anywhere that needs updating
export type OAuthProvider = 'google' | 'facebook' | 'github';

// Stored record of a linked OAuth identity for a user account.
// A single user account can have multiple OAuth providers linked to it
export interface OAuthIdentity {
  id: number;
  userId: number;
  provider: OAuthProvider;
  providerUserId: string; // the ID assigned by the external provider
  createdAt: string; // ISO 8601 date string - dates are strings over the wire
}

// Import here to avoid circular reference - auth types reference user types
import type { PublicUser, UserRole } from './user.types.js';
