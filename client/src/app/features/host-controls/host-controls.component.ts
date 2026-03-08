import { Component, inject, computed } from '@angular/core';
import { GameStateService } from '../../core/services/game-state.service';
import { GameSocketService } from '../../core/services/game-socket.service';

@Component({
  selector: 'app-host-controls',
  standalone: true,
  templateUrl: './host-controls.component.html',
  styleUrl: './host-controls.component.scss',
})
export class HostControlsComponent {
  private readonly gameState = inject(GameStateService);
  private readonly socketService = inject(GameSocketService);

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
      daily_double_revealed: 'Daily Double',
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
    // The server handles answer_result when host sends evaluation.
    // We send the same answer_submitted message type with the host's verdict
    // encoded in the existing protocol. The server interprets release/lock
    // based on mode. For user_hosted, the host evaluates via dedicated messages.
    // Since the shared types use release_buzzers / lock_buzzers as the
    // mechanism, we rely on the server processing the evaluation from the
    // round_state_update flow. The host UI sends release_buzzers for correct
    // (which advances the round) or lock_buzzers for incorrect (which allows
    // next buzzer). This maps to the server's user_hosted state machine.
    if (correct) {
      this.socketService.send({ type: 'release_buzzers' });
    } else {
      this.socketService.send({ type: 'lock_buzzers' });
    }
  }
}
