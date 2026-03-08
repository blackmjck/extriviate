import { Injectable } from '@angular/core';

const GUEST_TOKEN_KEY = 'extriviate_guest_token';
const GUEST_PLAYER_ID_KEY = 'extriviate_guest_player_id';
const GUEST_SESSION_ID_KEY = 'extriviate_guest_session_id';

@Injectable({ providedIn: 'root' })
export class GuestSessionService {
  store(token: string, playerId: number, sessionId: number): void {
    sessionStorage.setItem(GUEST_TOKEN_KEY, token);
    sessionStorage.setItem(GUEST_PLAYER_ID_KEY, String(playerId));
    sessionStorage.setItem(GUEST_SESSION_ID_KEY, String(sessionId));
  }

  getToken(): string | null {
    return sessionStorage.getItem(GUEST_TOKEN_KEY);
  }

  getPlayerId(): number | null {
    const id = sessionStorage.getItem(GUEST_PLAYER_ID_KEY);
    return id !== null ? Number(id) : null;
  }

  getSessionId(): number | null {
    const id = sessionStorage.getItem(GUEST_SESSION_ID_KEY);
    return id !== null ? Number(id) : null;
  }

  clear(): void {
    sessionStorage.removeItem(GUEST_TOKEN_KEY);
    sessionStorage.removeItem(GUEST_PLAYER_ID_KEY);
    sessionStorage.removeItem(GUEST_SESSION_ID_KEY);
  }

  hasSession(): boolean {
    return sessionStorage.getItem(GUEST_TOKEN_KEY) !== null;
  }
}
