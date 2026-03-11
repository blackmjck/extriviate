import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { WebRtcService } from '../../../core/services/webrtc.service';
import { GameSocketService } from '../../../core/services/game-socket.service';

@Component({
  selector: 'app-media-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './media-controls.component.html',
  styleUrl: './media-controls.component.scss',
})
export class MediaControlsComponent {
  private readonly webrtc = inject(WebRtcService);
  private readonly socketService = inject(GameSocketService);

  readonly playerId = input.required<number>();

  readonly hasLocalStream = computed(() => !!this.webrtc.localStream$());
  readonly cameraActive = this.webrtc.cameraActive;
  readonly audioMuted = this.webrtc.audioMuted;

  toggleCamera(): void {
    if (!this.webrtc.localStream$()) return;
    this.webrtc.toggleCamera();
    this.sendMediaState();
  }

  toggleAudio(): void {
    if (!this.webrtc.localStream$()) return;
    this.webrtc.toggleAudio();
    this.sendMediaState();
  }

  private sendMediaState(): void {
    this.socketService.send({
      type: 'media_state_update',
      playerId: this.playerId(),
      cameraActive: this.cameraActive(),
      audioMuted: this.audioMuted(),
    });
  }
}
