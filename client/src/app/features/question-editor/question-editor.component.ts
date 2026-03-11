import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import type { Category } from '@extriviate/shared';
import type { ContentBlock } from '@extriviate/shared';
import { ContentBlockEditorComponent } from './content-block-editor.component';
import { CategoryService } from '../../core/services/category.service';
import { QuestionService } from '../../core/services/question.service';

@Component({
  selector: 'app-question-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ContentBlockEditorComponent],
  templateUrl: './question-editor.component.html',
  styleUrls: ['./question-editor.component.scss'],
})
export class QuestionEditorComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cats = inject(CategoryService);
  private readonly q = inject(QuestionService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly categories = signal<Category[]>([]);
  readonly questionId = signal<number | null>(null);

  // Form fields
  readonly categoryId = signal<number | null>(null);
  readonly questionBlocks = signal<ContentBlock[]>([{ type: 'text', value: '' }]);
  readonly answerBlocks = signal<ContentBlock[]>([{ type: 'text', value: '' }]);
  // Accepted answers as a newline-separated string for the textarea
  readonly acceptedAnswersRaw = signal('');

  readonly isNew = computed(() => this.questionId() === null);

  readonly acceptedAnswersList = computed(() =>
    this.acceptedAnswersRaw()
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
  );

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    const categoryIdParam = this.route.snapshot.queryParamMap.get('categoryId');

    if (categoryIdParam) {
      this.categoryId.set(Number(categoryIdParam));
    }

    Promise.all([
      this.loadCategories(),
      id ? this.loadQuestion(Number(id)) : Promise.resolve(),
    ]).finally(() => this.loading.set(false));
  }

  private async loadCategories(): Promise<void> {
    try {
      const res = await this.cats.getCategories();
      this.categories.set(res.data.items);
      // Default to first category if none pre-selected
      if (!this.categoryId() && res.data.items.length > 0) {
        this.categoryId.set(res.data.items[0].id);
      }
    } catch {
      this.error.set('Failed to load categories.');
    }
  }

  private async loadQuestion(id: number): Promise<void> {
    try {
      const res = await this.q.getQuestion(id);
      const q = res.data;
      this.questionId.set(q.id);
      this.categoryId.set(q.categoryId);
      this.questionBlocks.set(q.content);
      this.answerBlocks.set(q.answer.content);
      this.acceptedAnswersRaw.set(q.answer.acceptedAnswers.join('\n'));
    } catch {
      this.error.set('Failed to load question.');
    }
  }

  async save(): Promise<void> {
    const catId = this.categoryId();
    if (!catId) {
      this.error.set('Please select a category.');
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    try {
      const id = this.questionId();
      if (id === null) {
        await this.q.createQuestion(
          catId,
          this.questionBlocks(),
          this.answerBlocks(),
          this.acceptedAnswersList(),
        );
      } else {
        await this.q.updateQuestion(
          id,
          this.questionBlocks(),
          this.answerBlocks(),
          this.acceptedAnswersList(),
        );
      }
      this.router.navigate(['/questions']);
    } catch {
      this.error.set('Failed to save question.');
    } finally {
      this.saving.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(['/questions']);
  }
}
