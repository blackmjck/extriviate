import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { GameSocketService } from '../../core/services/game-socket.service';
import { GameStateService } from '../../core/services/game-state.service';
import { AuthService } from '../../core/services/auth.service';
import { GuestSessionService } from '../../core/services/guest-session.service';
import { WebRtcService } from '../../core/services/webrtc.service';
import { LobbyComponent } from '../lobby/lobby.component';
import { GameBoardComponent } from '../game-board/game-board.component';
import { QuestionComponent } from '../question/question.component';
import { DailyDoubleComponent } from '../daily-double/daily-double.component';
import { HostControlsComponent } from '../host-controls/host-controls.component';
import { SessionEndComponent } from '../session-end/session-end.component';
import { ConnectionStatusComponent } from '../../shared/components/connection-status/connection-status.component';

@Component({
  selector: 'app-game-session',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'main' },
  imports: [
    LobbyComponent,
    GameBoardComponent,
    QuestionComponent,
    DailyDoubleComponent,
    HostControlsComponent,
    SessionEndComponent,
    ConnectionStatusComponent,
  ],
  templateUrl: './game-session.component.html',
  styleUrl: './game-session.component.scss',
})
export class GameSessionComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly socketService = inject(GameSocketService);
  private readonly gameState = inject(GameStateService);
  private readonly authService = inject(AuthService);
  private readonly guestSession = inject(GuestSessionService);
  private readonly webRtc = inject(WebRtcService);

  readonly sessionId = computed(() => parseInt(this.route.snapshot.paramMap.get('id') ?? '0', 10));

  readonly sessionStatus = this.gameState.sessionStatus;
  readonly board = this.gameState.board;

  readonly phase = computed(() => this.gameState.roundState()?.phase ?? 'idle');

  readonly showDailyDoubleOverlay = computed(() => this.phase() === 'daily_double_revealed');

  readonly showQuestionOverlay = computed(() => {
    const p = this.phase();
    return (
      p === 'question_revealed' ||
      p === 'buzzers_open' ||
      p === 'player_answering' ||
      p === 'answer_evaluated' ||
      p === 'round_complete' ||
      p === 'round_timeout'
    );
  });

  ngOnInit(): void {
    // JoinComponent may have already connected the socket (happy-path join flow).
    // Only open a new connection if the socket is currently disconnected
    // (e.g. page refresh, direct URL navigation).
    if (this.socketService.connectionState() === 'disconnected') {
      const id = this.sessionId();
      const isGuestReconnect = this.guestSession.hasSession();
      const token = isGuestReconnect
        ? (this.guestSession.getToken() ?? undefined)
        : (this.authService.getAccessToken() ?? undefined);
      this.socketService.connect(id, token, isGuestReconnect);
    }
  }

  ngOnDestroy(): void {
    this.webRtc.destroy();
    this.socketService.disconnect();
  }
}
