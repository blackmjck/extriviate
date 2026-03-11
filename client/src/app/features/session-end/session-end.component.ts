import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { GameStateService } from '../../core/services/game-state.service';

@Component({
  selector: 'app-session-end',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  templateUrl: './session-end.component.html',
  styleUrls: ['./session-end.component.scss'],
})
export class SessionEndComponent {
  private readonly router = inject(Router);
  private readonly gameState = inject(GameStateService);

  /** All players sorted by score descending, with rank assigned. */
  readonly rankedPlayers = computed<RankedPlayer[]>(() => {
    const players = this.gameState.players();
    return [...players]
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({
        displayName: p.displayName,
        score: p.score,
        rank: i + 1,
      }));
  });

  /** Top 3 players for the podium display. */
  readonly podium = computed(() => this.rankedPlayers().slice(0, 3));

  /** Remaining players below the podium. */
  readonly rest = computed(() => this.rankedPlayers().slice(3));

  /** Podium display order: 2nd, 1st, 3rd (for the classic layout). */
  readonly podiumOrdered = computed(() => {
    const top = this.podium();
    if (top.length < 3) return top;
    return [top[1], top[0], top[2]];
  });

  getPodiumHeight(rank: number): string {
    switch (rank) {
      case 1:
        return '160px';
      case 2:
        return '120px';
      case 3:
        return '88px';
      default:
        return '60px';
    }
  }

  getMedalEmoji(rank: number): string {
    switch (rank) {
      case 1:
        return '\u{1F947}';
      case 2:
        return '\u{1F948}';
      case 3:
        return '\u{1F949}';
      default:
        return '';
    }
  }

  playAgain(): void {
    this.router.navigate(['/']);
  }
}

export interface RankedPlayer {
  displayName: string;
  score: number;
  rank: number;
}
