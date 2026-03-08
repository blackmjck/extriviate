import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import type {
  Game,
  GameBoard,
  GameCategory,
  GameQuestion,
  ApiResponse,
  UpdateGameRequest,
  AssignGameCategoryRequest,
} from '@extriviate/shared';
import { GAME_CATEGORY_COUNT, GAME_QUESTION_ROWS } from '@extriviate/shared';
import { AuthService } from '../../core/services/auth.service';
import { CategoryManagerComponent } from './category-manager.component';
import { environment } from '../../../environments/environment';

/** Slot representation for the board grid before categories/questions are assigned. */
export interface BoardSlot {
  position: number; // 1-6
  gameCategory: (GameCategory & { questions: GameQuestion[] }) | null;
}

@Component({
  selector: 'app-game-editor',
  standalone: true,
  imports: [FormsModule, CategoryManagerComponent],
  templateUrl: './game-editor.component.html',
  styleUrls: ['./game-editor.component.scss'],
})
export class GameEditorComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly game = signal<Game | null>(null);
  readonly board = signal<BoardSlot[]>([]);

  // Metadata editing
  readonly title = signal('');
  readonly dailyDoublesEnabled = signal(false);

  readonly showCategoryManager = signal(false);
  readonly activeCategorySlot = signal<number | null>(null);

  readonly isDirty = signal(false);

  readonly questionRows = Array.from({ length: GAME_QUESTION_ROWS }, (_, i) => i + 1);
  readonly categorySlots = computed(() => this.board());

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadGame(Number(id));
    } else {
      this.loading.set(false);
    }
  }

  async loadGame(id: number): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(
        this.http.get<ApiResponse<GameBoard>>(
          `${environment.apiUrl}/api/games/${id}`,
          { headers: this.auth.getAuthHeaders() },
        ),
      );
      const gameBoard = res.data;
      this.game.set(gameBoard.game);
      this.title.set(gameBoard.game.title);
      this.dailyDoublesEnabled.set(gameBoard.game.dailyDoublesEnabled);

      // Build the 6-slot board, filling in existing categories
      const slots: BoardSlot[] = [];
      for (let pos = 1; pos <= GAME_CATEGORY_COUNT; pos++) {
        const existing = gameBoard.categories.find((c) => c.position === pos) ?? null;
        slots.push({ position: pos, gameCategory: existing });
      }
      this.board.set(slots);
    } catch {
      this.error.set('Failed to load game.');
    } finally {
      this.loading.set(false);
    }
  }

  openCategoryManager(position: number): void {
    this.activeCategorySlot.set(position);
    this.showCategoryManager.set(true);
  }

  closeCategoryManager(): void {
    this.showCategoryManager.set(false);
    this.activeCategorySlot.set(null);
  }

  onCategoryAssigned(categoryId: number): void {
    const position = this.activeCategorySlot();
    if (position === null) return;
    // Update the board slot with a placeholder category
    this.board.update((slots) =>
      slots.map((s) =>
        s.position === position
          ? {
              ...s,
              gameCategory: {
                id: 0,
                gameId: this.game()?.id ?? 0,
                categoryId,
                position,
                category: { id: categoryId, creatorId: 0, name: '...', description: null, createdAt: '', updatedAt: '' },
                questions: [],
              },
            }
          : s,
      ),
    );
    this.isDirty.set(true);
    this.closeCategoryManager();
  }

  getQuestionAtSlot(slot: BoardSlot, row: number): GameQuestion | undefined {
    return slot.gameCategory?.questions.find((q) => q.rowPosition === row);
  }

  onMetadataChange(): void {
    this.isDirty.set(true);
  }

  async saveGame(): Promise<void> {
    const currentGame = this.game();
    if (!currentGame) return;

    this.saving.set(true);
    this.error.set(null);

    try {
      // Save metadata
      const metaUpdate: UpdateGameRequest = {
        title: this.title(),
        dailyDoublesEnabled: this.dailyDoublesEnabled(),
      };
      await firstValueFrom(
        this.http.put<ApiResponse<Game>>(
          `${environment.apiUrl}/api/games/${currentGame.id}`,
          metaUpdate,
          { headers: this.auth.getAuthHeaders() },
        ),
      );

      // Save board assignments
      const assignments: AssignGameCategoryRequest[] = this.board()
        .filter((s) => s.gameCategory !== null)
        .map((s) => ({
          categoryId: s.gameCategory!.categoryId,
          position: s.position,
          questions: s.gameCategory!.questions.map((q) => ({
            questionId: q.questionId,
            rowPosition: q.rowPosition,
            pointValue: q.pointValue,
            isDailyDouble: q.isDailyDouble,
          })),
        }));

      await firstValueFrom(
        this.http.put<ApiResponse<GameBoard>>(
          `${environment.apiUrl}/api/games/${currentGame.id}/board`,
          { categories: assignments },
          { headers: this.auth.getAuthHeaders() },
        ),
      );

      this.isDirty.set(false);
    } catch {
      this.error.set('Failed to save game.');
    } finally {
      this.saving.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(['/games']);
  }
}
