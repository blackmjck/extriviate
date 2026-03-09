import { Component, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { GameSession, ApiResponse } from '@extriviate/shared';
import { GameStateService } from '../../core/services/game-state.service';
import { AuthService } from '../../core/services/auth.service';
import { PlayerGalleryComponent } from '../../shared/components/player-gallery/player-gallery.component';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [PlayerGalleryComponent],
  templateUrl: './lobby.component.html',
  styleUrl: './lobby.component.scss',
})
export class LobbyComponent {
  private readonly http = inject(HttpClient);
  private readonly gameState = inject(GameStateService);
  private readonly auth = inject(AuthService);

  readonly session = signal<GameSession | null>(null);
  readonly starting = signal(false);
  readonly copied = signal(false);
  readonly errorMessage = signal('');

  readonly players = this.gameState.players;
  readonly isHost = this.gameState.isHost;

  readonly joinCode = computed(() => this.session()?.joinCode ?? '');

  setSession(session: GameSession): void {
    this.session.set(session);
  }

  async copyJoinCode(): Promise<void> {
    const code = this.joinCode();
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Clipboard API may not be available
    }
  }

  async startGame(): Promise<void> {
    const session = this.session();
    if (!session) return;

    this.starting.set(true);
    this.errorMessage.set('');

    try {
      await firstValueFrom(
        this.http.patch<ApiResponse<GameSession>>(
          `${environment.apiUrl}/api/sessions/${session.id}/status`,
          { status: 'active' },
          { headers: this.auth.getAuthHeaders() },
        ),
      );
    } catch (err: any) {
      const message = err?.error?.error?.message ?? 'Failed to start the game.';
      this.errorMessage.set(message);
    } finally {
      this.starting.set(false);
    }
  }
}
