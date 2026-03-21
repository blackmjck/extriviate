import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { GameStateService } from '../../core/services/game-state.service';
import { SessionService } from '../../core/services/session.service';
import { WebRtcService } from '../../core/services/webrtc.service';
import { PlayerGalleryComponent } from '../../shared/components/player-gallery/player-gallery.component';
import { MediaControlsComponent } from '../../shared/components/media-controls/media-controls.component';
import { isApiErrorResponse } from '../../shared/utils/helpers';

const MEDIA_PREF_KEY = 'extriviate_media_pref';

@Component({
  selector: 'app-lobby',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlayerGalleryComponent, MediaControlsComponent],
  templateUrl: './lobby.component.html',
  styleUrl: './lobby.component.scss',
})
export class LobbyComponent implements OnInit {
  private readonly gameState = inject(GameStateService);
  private readonly sessionService = inject(SessionService);
  private readonly webrtc = inject(WebRtcService);

  readonly starting = signal(false);
  readonly copied = signal(false);
  readonly errorMessage = signal('');

  /** 'enabled' | 'disabled' | null (no choice made yet) */
  private readonly mediaPref = signal<'enabled' | 'disabled' | null>(
    localStorage.getItem(MEDIA_PREF_KEY) as 'enabled' | 'disabled' | null,
  );

  /** Show the prompt when no preference has been saved. */
  readonly showMediaPrompt = computed(() => this.mediaPref() === null);

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

  ngOnInit(): void {
    // Auto-start stream if the user previously chose to enable media.
    // If permission is now denied, reset the preference so the prompt reappears.
    if (this.mediaPref() === 'enabled') {
      this.webrtc.startLocalStream().catch(() => {
        localStorage.setItem(MEDIA_PREF_KEY, 'disabled');
        this.mediaPref.set('disabled');
      });
    }
  }

  async enableMedia(): Promise<void> {
    localStorage.setItem(MEDIA_PREF_KEY, 'enabled');
    this.mediaPref.set('enabled');
    await this.webrtc.startLocalStream();
  }

  skipMedia(): void {
    localStorage.setItem(MEDIA_PREF_KEY, 'disabled');
    this.mediaPref.set('disabled');
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
    const sessionId = this.gameState.sessionId();
    if (!sessionId) return;

    this.starting.set(true);
    this.errorMessage.set('');

    try {
      await this.sessionService.updateStatus(sessionId, 'active');
    } catch (err: unknown) {
      let message = 'An unknown error occurred';
      // Handle APIError wrapped in HttpErrorResponse
      if (isApiErrorResponse(err)) {
        message = err?.error?.error?.message ?? 'Failed to start the game.';
        // Handle HttpErrorResponses and other standard error types
      } else if (err instanceof Error) {
        message = err.message;
      }
      this.errorMessage.set(message);
    } finally {
      this.starting.set(false);
    }
  }
}
