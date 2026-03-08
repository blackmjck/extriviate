import { Component, inject, input, output, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { GameBoard, GameCategory, GameQuestion } from '@extriviate/shared';
import { GAME_CATEGORY_COUNT, GAME_QUESTION_ROWS } from '@extriviate/shared';
import { GameStateService } from '../../core/services/game-state.service';

export interface CellSelection {
  gameCategoryId: number;
  questionId: number;
  rowPosition: number;
  pointValue: number;
}

@Component({
  selector: 'app-game-board',
  standalone: true,
  templateUrl: './game-board.component.html',
  styleUrl: './game-board.component.scss',
})
export class GameBoardComponent {
  private readonly http = inject(HttpClient);
  private readonly gameState = inject(GameStateService);

  readonly board = input.required<GameBoard>();
  readonly sessionId = input.required<number>();
  readonly questionSelected = output<CellSelection>();

  readonly answeredIds = signal<Set<number>>(new Set());

  readonly categories = computed(() => {
    const b = this.board();
    if (!b) return [];
    return [...b.categories].sort((a, b) => a.position - b.position);
  });

  readonly rowIndices = computed(() =>
    Array.from({ length: GAME_QUESTION_ROWS }, (_, i) => i + 1),
  );

  getQuestionAt(
    category: GameCategory & { questions: GameQuestion[] },
    row: number,
  ): GameQuestion | undefined {
    return category.questions.find((q) => q.rowPosition === row);
  }

  isAnswered(question: GameQuestion | undefined): boolean {
    if (!question) return true;
    return question.isAnswered || this.answeredIds().has(question.id);
  }

  async selectCell(question: GameQuestion | undefined): Promise<void> {
    if (!question || this.isAnswered(question)) return;

    const sid = this.sessionId();
    try {
      await firstValueFrom(
        this.http.post(`/api/sessions/${sid}/questions/${question.questionId}/select`, {}),
      );
    } catch {
      return;
    }

    this.answeredIds.update((ids) => {
      const next = new Set(ids);
      next.add(question.id);
      return next;
    });

    this.questionSelected.emit({
      gameCategoryId: question.gameCategoryId,
      questionId: question.questionId,
      rowPosition: question.rowPosition,
      pointValue: question.pointValue,
    });
  }
}
