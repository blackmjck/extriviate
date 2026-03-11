import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { GameStateService } from '../../core/services/game-state.service';
import { GameSocketService } from '../../core/services/game-socket.service';
import { SessionService } from '../../core/services/session.service';

@Component({
  selector: 'app-host-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './host-controls.component.html',
  styleUrl: './host-controls.component.scss',
})
export class HostControlsComponent {
  private readonly gameState = inject(GameStateService);
  private readonly socketService = inject(GameSocketService);
  private readonly sessionService = inject(SessionService);

  readonly isVisible = computed(
    () => this.gameState.isHost() && this.gameState.mode() === 'user_hosted',
  );

  readonly roundState = computed(() => this.gameState.roundState());
  readonly phase = computed(() => this.roundState()?.phase ?? 'idle');

  readonly submittedAnswer = computed(() => this.roundState()?.submittedAnswer);
  readonly activePlayerId = computed(() => this.roundState()?.activePlayerId);

  readonly activePlayerName = computed(() => {
    const pid = this.activePlayerId();
    if (pid === null || pid === undefined) return null;
    const player = this.gameState.players().find((p) => p.playerId === pid);
    return player?.displayName ?? null;
  });

  readonly showEvaluationButtons = computed(() => {
    const p = this.phase();
    return p === 'player_answering' && this.submittedAnswer() !== null;
  });

  readonly phaseLabel = computed(() => {
    const labels: Record<string, string> = {
      idle: 'Idle',
      daily_double_revealed: 'Double Down',
      question_revealed: 'Question Revealed',
      buzzers_open: 'Buzzers Open',
      player_answering: 'Player Answering',
      answer_evaluated: 'Answer Evaluated',
      round_complete: 'Round Complete',
      round_timeout: 'Round Timed Out',
    };
    return labels[this.phase()] ?? this.phase();
  });

  releaseBuzzers(): void {
    this.socketService.send({ type: 'release_buzzers' });
  }

  lockBuzzers(): void {
    this.socketService.send({ type: 'lock_buzzers' });
  }

  evaluateAnswer(correct: boolean): void {
    const sessionId = this.gameState.sessionId();
    const playerId = this.roundState()?.activePlayerId;
    if (sessionId === null || playerId == null) return;

    this.sessionService.evaluateAnswer(sessionId, playerId, correct).catch(() => {
      // Silently ignore — server will broadcast round_state_update regardless
    });
  }
}
