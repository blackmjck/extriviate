import { Component, inject, input, output, computed, ChangeDetectionStrategy } from '@angular/core';
import type { GameBoard, GameCategory, GameQuestion } from '@extriviate/shared';
import { GAME_QUESTION_ROWS } from '@extriviate/shared';
import { GameStateService } from '../../core/services/game-state.service';
import { SessionService } from '../../core/services/session.service';
import { WebRtcService } from '../../core/services/webrtc.service';
import { OrientationService } from '../../core/services/orientation.service';
import { PlayerGalleryComponent } from '../../shared/components/player-gallery/player-gallery.component';
import { MediaControlsComponent } from '../../shared/components/media-controls/media-controls.component';

export interface CellSelection {
  gameCategoryId: number;
  questionId: number;
  rowPosition: number;
  pointValue: number;
}

@Component({
  selector: 'app-game-board',
  imports: [PlayerGalleryComponent, MediaControlsComponent],
  templateUrl: './game-board.component.html',
  styleUrl: './game-board.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameBoardComponent {
  private readonly gameState = inject(GameStateService);
  private readonly sessionService = inject(SessionService);
  private readonly webrtc = inject(WebRtcService);
  private readonly orientation = inject(OrientationService);

  /** True on small-screen portrait devices — show rotation prompt during active play */
  readonly showOrientationPrompt = computed(
    () => this.orientation.isPortrait() && this.orientation.isSmallScreen(),
  );

  readonly board = input.required<GameBoard>();
  readonly sessionId = input.required<number>();
  readonly questionSelected = output<CellSelection>();

  readonly players = this.gameState.players;
  readonly activePlayerId = computed(() => this.gameState.roundState()?.activePlayerId ?? null);
  readonly questionSelecterId = computed(
    () => this.gameState.roundState()?.questionSelecterId ?? null,
  );
  readonly phase = computed(() => this.gameState.roundState()?.phase ?? 'idle');
  readonly submittedAnswer = computed(() => this.gameState.roundState()?.submittedAnswer ?? null);

  // Used only for media controls
  readonly localPlayerId = computed(() => {
    const myPeerId = this.webrtc.peerId;
    if (!myPeerId) return 0;
    const player = this.gameState.players().find((p) => p.peerId === myPeerId);
    return player?.playerId ?? 0;
  });

  /** True when this player is allowed to select a question. */
  readonly canSelectQuestion = computed(() => {
    if (this.phase() !== 'idle') return false;
    const selecterId = this.questionSelecterId();
    if (selecterId === null) return true; // free-for-all
    return selecterId === this.gameState.currentPlayerId();
  });

  readonly categories = computed(() => {
    const b = this.board();
    if (!b) return [];
    return [...b.categories].sort((a, b) => a.position - b.position);
  });

  readonly rowIndices = computed(() => Array.from({ length: GAME_QUESTION_ROWS }, (_, i) => i + 1));

  getQuestionAt(
    category: GameCategory & { questions: GameQuestion[] },
    row: number,
  ): GameQuestion | undefined {
    return category.questions.find((q) => q.rowPosition === row);
  }

  /** A question is visually "done" if the DB flag is set OR if it is the active
   *  in-progress question (derived from round_state_update, not just full_state_sync).
   *  This keeps the board consistent for all clients the moment a round starts. */
  isAnswered(question: GameQuestion | undefined): boolean {
    if (!question) return true;
    if (question.isAnswered) return true;
    return question.questionId === this.gameState.activeQuestionId();
  }

  /** Returns an accessible label for each board cell button. */
  getCellAriaLabel(question: GameQuestion | undefined): string {
    if (!question || this.isAnswered(question)) return 'Already answered';
    if (!this.canSelectQuestion()) return `$${question.pointValue}, not your turn to select`;
    return `Select $${question.pointValue}`;
  }

  async selectCell(question: GameQuestion | undefined): Promise<void> {
    if (!question || this.isAnswered(question) || !this.canSelectQuestion()) return;

    const sid = this.sessionId();
    try {
      await this.sessionService.selectQuestion(sid, question.questionId);
    } catch {
      return;
    }

    this.gameState.markQuestionAnswered(question.id);

    this.questionSelected.emit({
      gameCategoryId: question.gameCategoryId,
      questionId: question.questionId,
      rowPosition: question.rowPosition,
      pointValue: question.pointValue,
    });
  }
}
