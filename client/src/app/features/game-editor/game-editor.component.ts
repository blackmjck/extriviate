import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import type {
  Game,
  GameBoard,
  GameCategory,
  GameQuestion,
  Category,
  UpdateGameRequest,
  AssignGameCategoryRequest,
} from '@extriviate/shared';
import { GAME_CATEGORY_COUNT, GAME_QUESTION_ROWS, DAILY_DOUBLE_MAX } from '@extriviate/shared';
import { GameService } from '../../core/services/game.service';
import { CategoryManagerComponent } from './category-manager.component';
import { QuestionPickerComponent, type QuestionPickedEvent } from './question-picker.component';

/** Slot representation for the board grid before categories/questions are assigned. */
export interface BoardSlot {
  position: number; // 1-6
  gameCategory: (GameCategory & { questions: GameQuestion[] }) | null;
}

@Component({
  selector: 'app-game-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, CategoryManagerComponent, QuestionPickerComponent],
  templateUrl: './game-editor.component.html',
  styleUrls: ['./game-editor.component.scss'],
})
export class GameEditorComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly gameService = inject(GameService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly autosaving = signal(false);
  readonly error = signal<string | null>(null);

  readonly game = signal<Game | null>(null);
  readonly board = signal<BoardSlot[]>([]);

  // Metadata editing
  readonly title = signal('');
  readonly dailyDoublesEnabled = signal(false);

  readonly showCategoryManager = signal(false);
  readonly activeCategorySlot = signal<number | null>(null);

  readonly showQuestionPicker = signal(false);
  readonly activePickerSlot = signal<number | null>(null);
  readonly activePickerRow = signal<number | null>(null);

  readonly isDirty = signal(false);
  readonly publishing = signal(false);

  /** True when the game has a title, all 6 categories filled, and all 30 questions with point values. */
  readonly isReady = computed(() => {
    if (!this.title().trim()) return false;
    const slots = this.board();
    return (
      slots.length === GAME_CATEGORY_COUNT &&
      slots.every(
        (s) =>
          s.gameCategory !== null &&
          s.gameCategory.questions.length === GAME_QUESTION_ROWS &&
          s.gameCategory.questions.every((q) => q.pointValue > 0),
      )
    );
  });

  readonly questionRows = Array.from({ length: GAME_QUESTION_ROWS }, (_, i) => i + 1);
  readonly categorySlots = computed(() => this.board());

  /** All question IDs currently assigned anywhere on the board. Used to prevent duplicates. */
  readonly assignedQuestionIds = computed(() => {
    const ids = new Set<number>();
    for (const slot of this.board()) {
      for (const q of slot.gameCategory?.questions ?? []) {
        ids.add(q.questionId);
      }
    }
    return ids;
  });

  /**
   * Category IDs already assigned to other slots — passed to CategoryManagerComponent
   * so those categories are shown as disabled. Excludes the slot currently being edited
   * so swapping a category back is allowed.
   */
  readonly excludedCategoryIds = computed(() => {
    const activePos = this.activeCategorySlot();
    const ids = new Set<number>();
    for (const slot of this.board()) {
      if (slot.gameCategory && slot.position !== activePos) {
        ids.add(slot.gameCategory.categoryId);
      }
    }
    return ids;
  });

  /** Number of questions currently marked as daily doubles across all board slots. */
  readonly dailyDoubleCount = computed(() => {
    let count = 0;
    for (const slot of this.board()) {
      for (const q of slot.gameCategory?.questions ?? []) {
        if (q.isDailyDouble) count++;
      }
    }
    return count;
  });

  /**
   * Whether the question picker can offer the "Mark as Daily Double" toggle.
   * True when DDs are enabled AND (fewer than max are used, OR the active slot
   * already holds a DD — replacing it keeps the count the same).
   */
  readonly canMarkDailyDouble = computed(() => {
    if (!this.dailyDoublesEnabled()) return false;
    const activePos = this.activePickerSlot();
    const activeRow = this.activePickerRow();
    const slotHasDD =
      activePos !== null && activeRow !== null
        ? (this.board()
            .find((s) => s.position === activePos)
            ?.gameCategory?.questions.find((q) => q.rowPosition === activeRow)?.isDailyDouble ??
          false)
        : false;
    return this.dailyDoubleCount() < DAILY_DOUBLE_MAX || slotHasDD;
  });

  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadGame(Number(id));
    } else {
      this.createGame();
    }
  }

  ngOnDestroy(): void {
    if (this.autosaveTimer !== null) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }

  async createGame(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.gameService.createGame('Untitled Game');
      // Replace the /games/new history entry so Back returns to the game list
      this.router.navigate(['/games', res.data.id], { replaceUrl: true });
    } catch {
      this.error.set('Failed to create game.');
      this.loading.set(false);
    }
  }

  async loadGame(id: number): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.gameService.getGame(id);
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

  onCategoryAssigned(category: Category): void {
    const position = this.activeCategorySlot();
    if (position === null) return;
    this.board.update((slots) =>
      slots.map((s) =>
        s.position === position
          ? {
              ...s,
              gameCategory: {
                id: 0,
                gameId: this.game()?.id ?? 0,
                categoryId: category.id,
                position,
                category,
                questions: [],
              },
            }
          : s,
      ),
    );
    this.isDirty.set(true);
    this.closeCategoryManager();
    this.scheduleAutosave();
  }

  openQuestionPicker(position: number, rowPosition: number): void {
    this.activePickerSlot.set(position);
    this.activePickerRow.set(rowPosition);
    this.showQuestionPicker.set(true);
  }

  closeQuestionPicker(): void {
    this.showQuestionPicker.set(false);
    this.activePickerSlot.set(null);
    this.activePickerRow.set(null);
  }

  onQuestionPicked(event: QuestionPickedEvent): void {
    const position = this.activePickerSlot();
    const rowPosition = this.activePickerRow();
    if (position === null || rowPosition === null) return;

    this.board.update((slots) =>
      slots.map((s) => {
        if (s.position !== position || !s.gameCategory) return s;
        const newQuestion: GameQuestion = {
          id: 0,
          gameId: this.game()?.id ?? 0,
          gameCategoryId: s.gameCategory.id,
          questionId: event.question.id,
          rowPosition,
          pointValue: event.pointValue,
          isDailyDouble: event.isDailyDouble,
          isAnswered: false,
          question: event.question,
        };
        const filtered = s.gameCategory.questions.filter((q) => q.rowPosition !== rowPosition);
        return {
          ...s,
          gameCategory: { ...s.gameCategory, questions: [...filtered, newQuestion] },
        };
      }),
    );

    this.isDirty.set(true);
    this.closeQuestionPicker();
    this.scheduleAutosave();
  }

  removeQuestion(position: number, rowPosition: number): void {
    this.board.update((slots) =>
      slots.map((s) => {
        if (s.position !== position || !s.gameCategory) return s;
        return {
          ...s,
          gameCategory: {
            ...s.gameCategory,
            questions: s.gameCategory.questions.filter((q) => q.rowPosition !== rowPosition),
          },
        };
      }),
    );
    this.isDirty.set(true);
    this.scheduleAutosave();
  }

  getQuestionAtSlot(slot: BoardSlot, row: number): GameQuestion | undefined {
    return slot.gameCategory?.questions.find((q) => q.rowPosition === row);
  }

  /** Returns the categoryId for the active picker slot, or null. */
  getActivePickerCategoryId(): number | null {
    const pos = this.activePickerSlot();
    if (pos === null) return null;
    return this.board().find((s) => s.position === pos)?.gameCategory?.categoryId ?? null;
  }

  /** Returns the isDailyDouble flag of the question currently in the active picker slot, if any. */
  getActiveSlotIsDailyDouble(): boolean {
    const pos = this.activePickerSlot();
    const row = this.activePickerRow();
    if (pos === null || row === null) return false;
    return (
      this.board()
        .find((s) => s.position === pos)
        ?.gameCategory?.questions.find((q) => q.rowPosition === row)?.isDailyDouble ?? false
    );
  }

  /** Immediately updates the DD flag on the existing question in the active picker slot. */
  onDailyDoubleToggled(isDailyDouble: boolean): void {
    const position = this.activePickerSlot();
    const rowPosition = this.activePickerRow();
    if (position === null || rowPosition === null) return;
    this.board.update((slots) =>
      slots.map((s) => {
        if (s.position !== position || !s.gameCategory) return s;
        return {
          ...s,
          gameCategory: {
            ...s.gameCategory,
            questions: s.gameCategory.questions.map((q) =>
              q.rowPosition === rowPosition ? { ...q, isDailyDouble } : q,
            ),
          },
        };
      }),
    );
    this.isDirty.set(true);
    this.scheduleAutosave();
  }

  onDailyDoublesEnabledChange(enabled: boolean): void {
    this.dailyDoublesEnabled.set(enabled);
    if (!enabled) {
      this.board.update((slots) =>
        slots.map((s) => {
          if (!s.gameCategory) return s;
          return {
            ...s,
            gameCategory: {
              ...s.gameCategory,
              questions: s.gameCategory.questions.map((q) =>
                q.isDailyDouble ? { ...q, isDailyDouble: false } : q,
              ),
            },
          };
        }),
      );
    }
    this.isDirty.set(true);
    this.scheduleAutosave();
  }

  onMetadataChange(): void {
    this.isDirty.set(true);
    this.scheduleAutosave();
  }

  /** Debounced autosave trigger. Resets the timer on every call. */
  private scheduleAutosave(): void {
    if (this.autosaveTimer !== null) {
      clearTimeout(this.autosaveTimer);
    }
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      this.autosaveNow();
    }, 1500);
  }

  /**
   * Flushes any pending debounce timer and immediately performs a save if dirty.
   * Called by the CanDeactivate guard before navigation, and by the debounce timer.
   */
  async autosaveNow(): Promise<void> {
    if (this.autosaveTimer !== null) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    if (!this.isDirty() || !this.game() || this.saving() || this.autosaving()) return;
    this.autosaving.set(true);
    const start = Date.now();
    try {
      await this.performSave();
      this.isDirty.set(false);
    } catch {
      // Silent — the manual Save button remains available if autosave fails.
    } finally {
      const elapsed = Date.now() - start;
      const remaining = 1000 - elapsed;
      if (remaining > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, remaining));
      }
      this.autosaving.set(false);
    }
  }

  async saveGame(): Promise<void> {
    if (!this.game() || this.autosaving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.performSave();
      this.isDirty.set(false);
    } catch {
      this.error.set('Failed to save game.');
    } finally {
      this.saving.set(false);
    }
  }

  async publishGame(): Promise<void> {
    if (!this.isReady() || this.game()?.isPublished || this.publishing()) return;
    // Flush any pending autosave so the server sees the latest board before the publish guard runs.
    await this.autosaveNow();
    this.publishing.set(true);
    this.error.set(null);
    try {
      await this.gameService.updateGame(this.game()!.id, { isPublished: true });
      this.game.update((g) => (g ? { ...g, isPublished: true } : g));
    } catch {
      this.error.set('Failed to publish game.');
    } finally {
      this.publishing.set(false);
    }
  }

  private async performSave(): Promise<void> {
    const currentGame = this.game()!;

    // Save metadata
    const metaUpdate: UpdateGameRequest = {
      title: this.title(),
      dailyDoublesEnabled: this.dailyDoublesEnabled(),
    };
    await this.gameService.updateGame(currentGame.id, metaUpdate);

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

    await this.gameService.updateBoard(currentGame.id, assignments);
  }

  goBack(): void {
    this.router.navigate(['/games']);
  }
}
