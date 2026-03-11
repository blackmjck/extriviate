import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  input,
  output,
  ChangeDetectionStrategy,
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import type { QuestionWithAnswer } from '@extriviate/shared';
import { QuestionService } from '../../core/services/question.service';

export interface QuestionPickedEvent {
  question: QuestionWithAnswer;
  pointValue: number;
  isDailyDouble: boolean;
}

const PAGE_SIZE = 8;

@Component({
  selector: 'app-question-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './question-picker.component.html',
  styleUrls: ['./question-picker.component.scss'],
})
export class QuestionPickerComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly q = inject(QuestionService);

  readonly categoryId = input.required<number>();
  readonly rowPosition = input.required<number>();
  readonly excludedIds = input<Set<number>>(new Set());
  /** Whether the game has daily doubles enabled. */
  readonly dailyDoublesEnabled = input(false);
  /** Whether the user can still designate this question as a daily double. */
  readonly canMarkDailyDouble = input(false);
  /** The current DD status of the question already in this slot (if any). */
  readonly currentIsDailyDouble = input(false);

  readonly questionPicked = output<QuestionPickedEvent>();
  /** Emitted immediately when the Daily Double toggle changes. */
  readonly dailyDoubleToggled = output<boolean>();

  readonly questions = signal<QuestionWithAnswer[]>([]);
  readonly visibleQuestions = computed(() => {
    const excluded = this.excludedIds();
    return excluded.size === 0
      ? this.questions()
      : this.questions().filter((q) => !excluded.has(q.id));
  });
  readonly total = signal(0);
  readonly offset = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly pointValue = signal(200);
  readonly markAsDailyDouble = signal(false);

  readonly hasPrev = () => this.offset() > 0;
  readonly hasNext = () => this.offset() + PAGE_SIZE < this.total();
  readonly currentPage = () => Math.floor(this.offset() / PAGE_SIZE) + 1;
  readonly totalPages = () => Math.ceil(this.total() / PAGE_SIZE);

  ngOnInit(): void {
    this.pointValue.set(this.rowPosition() * 200);
    this.markAsDailyDouble.set(this.currentIsDailyDouble());
    this.loadQuestions();
  }

  onDailyDoubleChange(value: boolean): void {
    this.markAsDailyDouble.set(value);
    this.dailyDoubleToggled.emit(value);
  }

  async loadQuestions(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.q.getQuestions(this.offset(), PAGE_SIZE, this.categoryId());
      this.questions.set(res.data.items);
      this.total.set(res.data.total);
    } catch {
      this.error.set('Failed to load questions.');
    } finally {
      this.loading.set(false);
    }
  }

  nextPage(): void {
    this.offset.update((o) => o + PAGE_SIZE);
    this.loadQuestions();
  }

  prevPage(): void {
    this.offset.update((o) => Math.max(0, o - PAGE_SIZE));
    this.loadQuestions();
  }

  select(question: QuestionWithAnswer): void {
    this.questionPicked.emit({
      question,
      pointValue: this.pointValue(),
      isDailyDouble: this.canMarkDailyDouble() && this.markAsDailyDouble(),
    });
  }

  createNew(): void {
    this.router.navigate(['/questions', 'new'], {
      queryParams: { categoryId: this.categoryId() },
    });
  }

  questionPreview(q: QuestionWithAnswer): string {
    for (const block of q.content) {
      if (block.type === 'text') return block.value.slice(0, 90) || '(empty)';
      if (block.type === 'image') return '[image]';
      if (block.type === 'video') return '[video]';
    }
    return '(no content)';
  }
}
