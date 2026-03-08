import { Component, inject, signal, OnInit, output } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import type { Category, ApiResponse, CreateCategoryRequest, UpdateCategoryRequest } from '@extriviate/shared';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-category-manager',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './category-manager.component.html',
  styleUrls: ['./category-manager.component.scss'],
})
export class CategoryManagerComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  /** Emits the selected category ID when the user picks one. */
  readonly categorySelected = output<number>();

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
      const res = await firstValueFrom(
        this.http.get<ApiResponse<Category[]>>(
          `${environment.apiUrl}/api/categories`,
          { headers: this.auth.getAuthHeaders() },
        ),
      );
      this.categories.set(res.data);
    } catch {
      this.error.set('Failed to load categories.');
    } finally {
      this.loading.set(false);
    }
  }

  selectCategory(id: number): void {
    this.categorySelected.emit(id);
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

    this.error.set(null);
    const current = this.editing();

    try {
      if (current) {
        const body: UpdateCategoryRequest = {
          name,
          description: this.formDescription().trim() || undefined,
        };
        await firstValueFrom(
          this.http.put<ApiResponse<Category>>(
            `${environment.apiUrl}/api/categories/${current.id}`,
            body,
            { headers: this.auth.getAuthHeaders() },
          ),
        );
      } else {
        const body: CreateCategoryRequest = {
          name,
          description: this.formDescription().trim() || undefined,
        };
        await firstValueFrom(
          this.http.post<ApiResponse<Category>>(
            `${environment.apiUrl}/api/categories`,
            body,
            { headers: this.auth.getAuthHeaders() },
          ),
        );
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
      await firstValueFrom(
        this.http.delete(`${environment.apiUrl}/api/categories/${id}`, {
          headers: this.auth.getAuthHeaders(),
        }),
      );
      this.loadCategories();
    } catch {
      this.error.set('Failed to delete category.');
    }
  }
}
