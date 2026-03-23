import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  ApiResponse,
  GameSession,
  CreateSessionRequest,
  JoinSessionRequest,
  JoinSessionResponse,
  SessionStatus,
} from '@extriviate/shared';
import { AuthService } from './auth.service';
import { GuestSessionService } from './guest-session.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly guestSession = inject(GuestSessionService);

  /** Returns an Authorization header using the JWT access token if present,
   *  falling back to the guest session token. Used for live-game endpoints. */
  private getEffectiveAuthHeaders(): Record<string, string> {
    const token = this.auth.getAccessToken();
    if (token) return { Authorization: `Bearer ${token}` };
    const guestToken = this.guestSession.getToken();
    if (guestToken) return { Authorization: `Bearer ${guestToken}` };
    return {};
  }

  async getSession(joinCode: string): Promise<ApiResponse<GameSession>> {
    return await firstValueFrom(
      this.http.get<ApiResponse<GameSession>>(`${environment.apiUrl}/api/sessions/${joinCode}`),
    );
  }

  async createSession(body: CreateSessionRequest): Promise<ApiResponse<GameSession>> {
    return await firstValueFrom(
      this.http.post<ApiResponse<GameSession>>(`${environment.apiUrl}/api/sessions`, body, {
        headers: this.auth.getAuthHeaders(),
      }),
    );
  }

  async joinSession(
    sessionId: number,
    body: JoinSessionRequest,
  ): Promise<ApiResponse<JoinSessionResponse>> {
    return await firstValueFrom(
      this.http.post<ApiResponse<JoinSessionResponse>>(
        `${environment.apiUrl}/api/sessions/${sessionId}/join`,
        body,
      ),
    );
  }

  async updateStatus(sessionId: number, status: SessionStatus): Promise<ApiResponse<GameSession>> {
    return await firstValueFrom(
      this.http.patch<ApiResponse<GameSession>>(
        `${environment.apiUrl}/api/sessions/${sessionId}/status`,
        { status },
        { headers: this.auth.getAuthHeaders() },
      ),
    );
  }

  async selectQuestion(sessionId: number, questionId: number): Promise<ApiResponse<unknown>> {
    return await firstValueFrom(
      this.http.post<ApiResponse<unknown>>(
        `/api/sessions/${sessionId}/questions/${questionId}/select`,
        {},
        { headers: this.getEffectiveAuthHeaders() },
      ),
    );
  }

  async evaluateAnswer(
    sessionId: number,
    playerId: number,
    correct: boolean,
  ): Promise<ApiResponse<unknown>> {
    return await firstValueFrom(
      this.http.post<ApiResponse<unknown>>(
        `/api/sessions/${sessionId}/evaluate`,
        { playerId, correct },
        { headers: this.getEffectiveAuthHeaders() },
      ),
    );
  }
}
