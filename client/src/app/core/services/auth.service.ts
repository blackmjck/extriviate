import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  type PublicUser,
  type ApiResponse,
  type AuthResponse,
  type AuthTokens,
  PwnedResponse,
} from '@extriviate/shared';
import { GameSocketService } from './game-socket.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly socketService = inject(GameSocketService);

  // The access token lives only in memory. It is gone on page reload -
  // that's intentional. loadUser() silently restores it via the HttpOnly cookie.
  private accessToken: string | null = null;

  readonly currentUser = signal<PublicUser | null>(null);
  readonly isAuthenticated = computed(() => this.currentUser() !== null);

  // This checks against the HIBP service to see if the password is potentially unsafe (i.e. has been exposed in a breach).
  // It returns either `true` (unsafe password), `false` (password is safe), or `undefined` (server error)
  async checkPwnedPassword(password: string): Promise<boolean | undefined> {
    try {
      const res = await firstValueFrom(
        this.http.post<ApiResponse<PwnedResponse>>('/api/auth/check-password', { password }),
      );

      // If there is a valid response, send it on
      return res.data.pwned;
    } catch {
      // Failure here means either a local server error or an HIBP server error.
      // Either way, it means we can't evaluate the password in this request for good or ill.
      return undefined;
    }
  }

  // This triggers a check for a user on the backend and sends a password reset email (if valid)
  async forgotPassword(email: string, turnstileToken: string): Promise<string> {
    const res = await firstValueFrom(
      this.http.post<ApiResponse<{ response: string }>>('/api/auth/forgot-password', {
        email,
        turnstileToken,
      }),
    );
    // Return the server message (which should be generic to avoid phishing)
    return res.data.response;
  }

  // Send the secret reset token and new password for the user
  async resetPassword(token: string, password: string, turnstileToken: string): Promise<void> {
    await firstValueFrom(
      this.http.post<ApiResponse<void>>('/api/auth/reset-password', {
        token,
        newPassword: password,
        turnstileToken,
      }),
    );
  }

  async login(email: string, password: string, turnstileToken: string): Promise<PublicUser> {
    const res = await firstValueFrom(
      this.http.post<ApiResponse<AuthResponse>>('/api/auth/login', {
        email,
        password,
        turnstileToken,
      }),
    );
    // Store only the access token. The refresh token is in the HttpOnly cookie -
    // we never see it here; the browser handles it automatically.
    this.accessToken = res.data.tokens.accessToken;
    this.currentUser.set(res.data.user);
    return res.data.user;
  }

  async signup(
    email: string,
    password: string,
    displayName: string,
    turnstileToken: string,
  ): Promise<PublicUser> {
    const res = await firstValueFrom(
      this.http.post<ApiResponse<AuthResponse>>('/api/auth/signup', {
        email,
        password,
        displayName,
        turnstileToken,
      }),
    );
    this.accessToken = res.data.tokens.accessToken;
    this.currentUser.set(res.data.user);
    return res.data.user;
  }

  logout(): void {
    const token = this.accessToken;
    if (token) {
      // Fire-and-forget: blacklist both tokens on the server.
      // If this request fails, the access token still expires in <15m
      // and the refresh token will be rejected on next use (it won't be
      // in localStorage anymore, so only an attacker with a stale copy
      // could try it - and even that window is now <7d, not infinite).
      // The server clears the HttpOnly cookie and blacklists the tokens.
      // withCredentials: true is required so the browser sends the refresh
      // token cookie along with this request.
      this.http
        .post(
          '/api/auth/logout',
          {},
          {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true,
          },
        )
        .subscribe({
          error: () => {
            // Ignore errors
          },
        });
    }
    this.socketService.disconnect();
    this.accessToken = null;
    this.currentUser.set(null);
  }

  async refreshToken(): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<ApiResponse<AuthTokens>>('/api/auth/refresh', {}, { withCredentials: true }),
    );
    this.accessToken = res.data.accessToken;
  }

  async loadUser(): Promise<void> {
    if (!this.accessToken) {
      // No access token in memory — try a silent refresh using the cookie.
      // If the cookie is absent or expired, this will throw and we'll log out.
      await this.tryRefreshAndLoad();
      return;
    }
    try {
      const res = await firstValueFrom(
        this.http.get<ApiResponse<PublicUser>>('/api/users/me', {
          headers: this.getAuthHeaders(),
        }),
      );
      this.currentUser.set(res.data);
    } catch {
      // Access token rejected (likely expired) — try to refresh before logging out.
      await this.tryRefreshAndLoad();
    }
  }

  /** Attempts a token refresh, then re-fetches the current user. On any failure, logs out. */
  private async tryRefreshAndLoad(): Promise<void> {
    try {
      await this.refreshToken();
      const res = await firstValueFrom(
        this.http.get<ApiResponse<PublicUser>>('/api/users/me', {
          headers: this.getAuthHeaders(),
        }),
      );
      this.currentUser.set(res.data);
    } catch {
      this.logout();
    }
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getAuthHeaders(): Record<string, string> {
    return this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {};
  }
}
