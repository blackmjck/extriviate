import { Component, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { GameSession, ApiResponse } from '@extriviate/shared';
import { GameStateService } from '../../core/services/game-state.service';
import { AuthService } from '../../core/services/auth.service';
import { WebRtcService } from '../../core/services/webrtc.service';
import { PlayerGalleryComponent } from '../../shared/components/player-gallery/player-gallery.component';
import { MediaControlsComponent } from '../../shared/components/media-controls/media-controls.component';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [PlayerGalleryComponent, MediaControlsComponent],
  templateUrl: './lobby.component.html',
  styleUrl: './lobby.component.scss',
})
export class LobbyComponent {
  private readonly http = inject(HttpClient);
  private readonly gameState = inject(GameStateService);
  private readonly auth = inject(AuthService);
  private readonly webrtc = inject(WebRtcService);

  readonly starting = signal(false);
  readonly copied = signal(false);
  readonly errorMessage = signal('');

  readonly players = this.gameState.players;
  readonly isHost = this.gameState.isHost;
  readonly sessionName = this.gameState.sessionName;
  readonly joinCode = this.gameState.joinCode;

  readonly localPlayerId = computed(() => {
    const myPeerId = this.webrtc.peerId;
    if (!myPeerId) return 0;
    const player = this.gameState.players().find((p) => p.peerId === myPeerId);
    return player?.playerId ?? 0;
  });

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
    const sessionId = this.gameState.sessionId();
    if (!sessionId) return;

    this.starting.set(true);
    this.errorMessage.set('');

    try {
      await firstValueFrom(
        this.http.patch<ApiResponse<GameSession>>(
          `${environment.apiUrl}/api/sessions/${sessionId}/status`,
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
