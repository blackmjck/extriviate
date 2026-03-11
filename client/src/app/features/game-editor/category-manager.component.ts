import {
  Component,
  inject,
  signal,
  OnInit,
  input,
  output,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Category } from '@extriviate/shared';
import { CategoryService } from '../../core/services/category.service';

@Component({
  selector: 'app-category-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './category-manager.component.html',
  styleUrls: ['./category-manager.component.scss'],
})
export class CategoryManagerComponent implements OnInit {
  private readonly cats = inject(CategoryService);

  /** Category IDs already assigned to other board slots — hidden from the list. */
  readonly excludedIds = input<Set<number>>(new Set());

  /** Emits the selected category when the user picks one. */
  readonly categorySelected = output<Category>();

  readonly categories = signal<Category[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  // Create / edit form state
  readonly editing = signal<Category | null>(null);
  readonly formName = signal('');
  readonly formDescription = signal('');
  readonly showForm = signal(false);

  ngOnInit(): void {
    this.loadCategories();
  }

  async loadCategories(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.cats.getCategories();
      this.categories.set(res.data.items);
    } catch {
      this.error.set('Failed to load categories.');
    } finally {
      this.loading.set(false);
    }
  }

  selectCategory(cat: Category): void {
    this.categorySelected.emit(cat);
  }

  openCreateForm(): void {
    this.editing.set(null);
    this.formName.set('');
    this.formDescription.set('');
    this.showForm.set(true);
  }

  openEditForm(cat: Category): void {
    this.editing.set(cat);
    this.formName.set(cat.name);
    this.formDescription.set(cat.description ?? '');
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.editing.set(null);
  }

  async submitForm(): Promise<void> {
    const name = this.formName().trim();
    if (!name) return;

    const description = this.formDescription().trim() || undefined;

    this.error.set(null);
    const current = this.editing();

    try {
      if (current) {
        await this.cats.updateCategory(current.id, name, description);
      } else {
        await this.cats.createCategory(name, description);
      }
      this.cancelForm();
      this.loadCategories();
    } catch {
      this.error.set(current ? 'Failed to update category.' : 'Failed to create category.');
    }
  }

  async deleteCategory(id: number): Promise<void> {
    if (!confirm('Delete this category? Questions in it will not be removed.')) return;
    try {
      await this.cats.deleteCategory(id);
      this.loadCategories();
    } catch {
      this.error.set('Failed to delete category.');
    }
  }
}
