import {
  Component,
  inject,
  input,
  computed,
  ElementRef,
  viewChildren,
  effect,
  ChangeDetectionStrategy,
} from '@angular/core';
import type { LivePlayer } from '@extriviate/shared';
import { WebRtcService } from '../../../core/services/webrtc.service';
import { SpeechBubbleComponent } from '../speech-bubble/speech-bubble.component';

@Component({
  selector: 'app-player-gallery',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SpeechBubbleComponent],
  templateUrl: './player-gallery.component.html',
  styleUrl: './player-gallery.component.scss',
})
export class PlayerGalleryComponent {
  private readonly webrtc = inject(WebRtcService);

  /** All live players in the session. */
  readonly players = input.required<LivePlayer[]>();

  /** The currently active player (answering or selecting). Highlighted in the gallery. */
  readonly activePlayerId = input<number | null>(null);

  /** The player who selects the next question. Subtle indicator. */
  readonly questionSelecterId = input<number | null>(null);

  /** Whether to show scores (false in lobby, true during gameplay). */
  readonly showScores = input(false);

  /** Layout mode: 'row' for horizontal strip, 'grid' for wrap layout. */
  readonly layout = input<'row' | 'grid'>('row');

  /** Answer text to display in a speech bubble above the active player. Only shown in row layout. */
  readonly submittedAnswer = input<string | null>(null);

  readonly remoteStreams = this.webrtc.remoteStreams;
  readonly localStream = this.webrtc.localStream$;
  readonly localPeerId = computed(() => this.webrtc.peerId);

  private readonly videoElements = viewChildren<ElementRef<HTMLVideoElement>>('videoEl');

  constructor() {
    // Attach streams to <video> elements when they change
    effect(() => {
      const elements = this.videoElements();
      const remote = this.remoteStreams();
      const local = this.localStream();
      const myPeerId = this.localPeerId();

      for (const elRef of elements) {
        const video = elRef.nativeElement;
        const peerId = video.dataset['peerId'];
        if (!peerId) continue;

        if (peerId === myPeerId && local) {
          if (video.srcObject !== local) {
            video.srcObject = local;
          }
        } else {
          const stream = remote.get(peerId);
          if (stream && video.srcObject !== stream) {
            video.srcObject = stream;
          }
        }
      }
    });
  }

  isActive(player: LivePlayer): boolean {
    return player.playerId === this.activePlayerId();
  }

  showBubble(player: LivePlayer): boolean {
    return (
      this.layout() === 'row' &&
      this.submittedAnswer() !== null &&
      player.playerId === this.activePlayerId()
    );
  }

  /**
   * Tail points toward the avatar. In a row layout the gallery strip sits at the
   * bottom of the screen, so the bubble appears above the card with the tail
   * pointing downward back to the avatar. In the future if the layout changes
   * or becomes dynamic we can do more calculation here instead.
   */
  getBubbleTailSide(): 'bottom' {
    return 'bottom';
  }

  isSelector(player: LivePlayer): boolean {
    return player.playerId === this.questionSelecterId();
  }

  hasVideoStream(player: LivePlayer): boolean {
    if (!player.peerId) return false;
    if (player.peerId === this.localPeerId()) {
      return this.localStream() !== null && player.cameraActive;
    }
    return this.remoteStreams().has(player.peerId) && player.cameraActive;
  }

  getInitial(name: string): string {
    return name.charAt(0).toUpperCase();
  }

  trackByPlayerId(_index: number, player: LivePlayer): number {
    return player.playerId;
  }
}
