import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { PublicUser, ApiResponse, AuthResponse, AuthTokens } from '@extriviate/shared';

const ACCESS_TOKEN_KEY = 'extriviate_access_token';
const REFRESH_TOKEN_KEY = 'extriviate_refresh_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  readonly currentUser = signal<PublicUser | null>(null);
  readonly isAuthenticated = computed(() => this.currentUser() !== null);

  async login(email: string, password: string): Promise<PublicUser> {
    const res = await firstValueFrom(
      this.http.post<ApiResponse<AuthResponse>>('/api/auth/login', { email, password }),
    );
    this.storeTokens(res.data.tokens);
    this.currentUser.set(res.data.user);
    return res.data.user;
  }

  async signup(email: string, password: string, displayName: string): Promise<PublicUser> {
    const res = await firstValueFrom(
      this.http.post<ApiResponse<AuthResponse>>('/api/auth/signup', {
        email,
        password,
        displayName,
      }),
    );
    this.storeTokens(res.data.tokens);
    this.currentUser.set(res.data.user);
    return res.data.user;
  }

  logout(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    this.currentUser.set(null);
  }

  async refreshToken(): Promise<void> {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      this.logout();
      return;
    }
    const res = await firstValueFrom(
      this.http.post<ApiResponse<AuthTokens>>('/api/auth/refresh', { refreshToken }),
    );
    this.storeTokens(res.data);
  }

  async loadUser(): Promise<void> {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
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
      this.currentUser.set(null);
    }
  }

  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private storeTokens(tokens: AuthTokens): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }
}
