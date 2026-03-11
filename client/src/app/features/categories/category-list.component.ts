import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import type { Category } from '@extriviate/shared';
import { CategoryService } from '../../core/services/category.service';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-category-list',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './category-list.component.html',
  styleUrl: './category-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryListComponent implements OnInit {
  private readonly cats = inject(CategoryService);
  private readonly fb = inject(FormBuilder);

  readonly form: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', [Validators.maxLength(255)]],
  });

  readonly categories = signal<Category[]>([]);
  readonly total = signal(0);
  readonly offset = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly editing = signal<Category | null>(null);
  readonly showForm = signal(false);
  readonly saving = signal(false);

  readonly currentPage = computed(() => Math.floor(this.offset() / PAGE_SIZE) + 1);
  readonly totalPages = computed(() => Math.ceil(this.total() / PAGE_SIZE));
  readonly hasPrev = computed(() => this.offset() > 0);
  readonly hasNext = computed(() => this.offset() + PAGE_SIZE < this.total());

  ngOnInit(): void {
    this.loadCategories();
  }

  async loadCategories(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.cats.getCategories(this.offset(), PAGE_SIZE);
      this.categories.set(res.data.items);
      this.total.set(res.data.total);
    } catch {
      this.error.set('Failed to load categories.');
    } finally {
      this.loading.set(false);
    }
  }

  nextPage(): void {
    this.offset.update((o) => o + PAGE_SIZE);
    this.loadCategories();
  }

  prevPage(): void {
    this.offset.update((o) => Math.max(0, o - PAGE_SIZE));
    this.loadCategories();
  }

  openCreateForm(): void {
    this.editing.set(null);
    this.form.reset({ name: '', description: '' });
    this.showForm.set(true);
  }

  openEditForm(cat: Category): void {
    this.editing.set(cat);
    this.form.patchValue({ name: cat.name, description: cat.description ?? '' });
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.editing.set(null);
  }

  async submitForm(): Promise<void> {
    if (this.form.invalid) return;

    const { name, description } = this.form.getRawValue() as { name: string; description: string };
    const trimmedName = name.trim();
    if (!trimmedName) return;

    this.saving.set(true);
    this.error.set(null);
    const current = this.editing();

    try {
      if (current) {
        await this.cats.updateCategory(current.id, trimmedName, description);
      } else {
        await this.cats.createCategory(trimmedName, description);
      }
      this.cancelForm();
      this.loadCategories();
    } catch {
      this.error.set(current ? 'Failed to update category.' : 'Failed to create category.');
    } finally {
      this.saving.set(false);
    }
  }

  async deleteCategory(id: number): Promise<void> {
    if (!confirm('Delete this category? Questions in it will not be removed.')) return;
    this.error.set(null);
    try {
      await this.cats.deleteCategory(id);
      this.loadCategories();
    } catch (err: unknown) {
      const code = (err as { error?: { error?: { code?: string } } })?.error?.error?.code;
      if (code === 'CATEGORY_IN_USE') {
        this.error.set('This category is used in a saved game and cannot be deleted.');
      } else {
        this.error.set('Failed to delete category.');
      }
    }
  }
}
