import { Component, inject, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DAILY_DOUBLE_MIN_WAGER } from '@extriviate/shared';
import { GameStateService } from '../../core/services/game-state.service';
import { GameSocketService } from '../../core/services/game-socket.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-daily-double',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './daily-double.component.html',
  styleUrl: './daily-double.component.scss',
})
export class DailyDoubleComponent {
  private readonly gameState = inject(GameStateService);
  private readonly socketService = inject(GameSocketService);
  private readonly authService = inject(AuthService);

  readonly wagerAmount = signal<number>(DAILY_DOUBLE_MIN_WAGER);

  readonly roundState = computed(() => this.gameState.roundState());

  readonly isRevealed = computed(() => this.roundState()?.phase === 'daily_double_revealed');

  readonly currentPlayerId = computed(() => this.authService.currentUser()?.id ?? null);

  readonly isActivePlayer = computed(() => {
    const state = this.roundState();
    const userId = this.currentPlayerId();
    if (!state || userId === null) return false;
    return state.activePlayerId === userId;
  });

  readonly playerScore = computed(() => {
    const userId = this.currentPlayerId();
    if (userId === null) return 0;
    const player = this.gameState.players().find((p) => p.playerId === userId);
    return player?.score ?? 0;
  });

  readonly highestBoardValue = computed(() => {
    const state = this.roundState();
    return state?.pointValue ?? 1000;
  });

  readonly minWager = DAILY_DOUBLE_MIN_WAGER;

  readonly maxWager = computed(() =>
    Math.max(this.playerScore(), this.highestBoardValue()),
  );

  submitWager(): void {
    const playerId = this.currentPlayerId();
    if (playerId === null) return;

    let wager = this.wagerAmount();
    wager = Math.max(this.minWager, Math.min(wager, this.maxWager()));

    this.socketService.send({ type: 'wager_declared', playerId, wager });
  }
}
