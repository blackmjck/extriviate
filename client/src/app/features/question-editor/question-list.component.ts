import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import type { Category, QuestionWithAnswer } from '@extriviate/shared';
import { QuestionService } from '../../core/services/question.service';
import { CategoryService } from '../../core/services/category.service';
import { ContentBlocksComponent } from '../../shared/components/content-blocks/content-blocks.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-question-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, ContentBlocksComponent],
  templateUrl: './question-list.component.html',
  styleUrls: ['./question-list.component.scss'],
})
export class QuestionListComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly q = inject(QuestionService);
  private readonly cats = inject(CategoryService);

  readonly visible = signal<Set<number>>(new Set<number>());
  readonly questions = signal<QuestionWithAnswer[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly total = signal(0);
  readonly offset = signal(0);
  readonly filterCategoryId = signal<number | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly currentPage = computed(() => Math.floor(this.offset() / PAGE_SIZE) + 1);
  readonly totalPages = computed(() => Math.ceil(this.total() / PAGE_SIZE));
  readonly hasPrev = computed(() => this.offset() > 0);
  readonly hasNext = computed(() => this.offset() + PAGE_SIZE < this.total());

  ngOnInit(): void {
    this.loadCategories();
    this.loadQuestions();
  }

  private async loadCategories(): Promise<void> {
    try {
      const res = await this.cats.getCategories();
      this.categories.set(res.data.items);
    } catch {
      // Non-fatal — filter just won't show category names
    }
  }

  async loadQuestions(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const catId = this.filterCategoryId();
      const res = await this.q.getQuestions(this.offset(), PAGE_SIZE, catId);
      this.questions.set(res.data.items);
      this.total.set(res.data.total);
    } catch {
      this.error.set('Failed to load questions.');
    } finally {
      this.loading.set(false);
    }
  }

  onFilterChange(categoryId: string): void {
    this.filterCategoryId.set(categoryId ? Number(categoryId) : null);
    this.offset.set(0);
    this.loadQuestions();
  }

  nextPage(): void {
    this.offset.update((o) => o + PAGE_SIZE);
    this.loadQuestions();
  }

  prevPage(): void {
    this.offset.update((o) => Math.max(0, o - PAGE_SIZE));
    this.loadQuestions();
  }

  isVisible(id: number): boolean {
    return this.visible().has(id);
  }

  toggleVisibility(id: number): void {
    const hide = this.visible().has(id);
    this.visible.update((list) => {
      if (hide) {
        const replacement = new Set(list);
        replacement.delete(id);
        return replacement;
      } else {
        return new Set([...list, id]);
      }
    });
  }

  createQuestion(): void {
    this.router.navigate(['/questions', 'new']);
  }

  editQuestion(id: number): void {
    this.router.navigate(['/questions', id]);
  }

  async deleteQuestion(id: number): Promise<void> {
    if (!confirm('Delete this question? This cannot be undone.')) return;
    try {
      await this.q.deleteQuestion(id);
      this.loadQuestions();
    } catch {
      this.error.set('Failed to delete question.');
    }
  }

  /** Returns the first text block value as a preview, or a type indicator. */
  questionPreview(q: QuestionWithAnswer): string {
    for (const block of q.content) {
      if (block.type === 'text') return block.value.slice(0, 100) || '(empty text)';
      if (block.type === 'image') return '[image]';
      if (block.type === 'video') return '[video]';
    }
    return '(no content)';
  }

  categoryName(categoryId: number): string {
    return this.categories().find((c) => c.id === categoryId)?.name ?? '—';
  }
}
