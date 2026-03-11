import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  ApiResponse,
  Category,
  PaginatedResponse,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from '@extriviate/shared';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

export const DEFAULT_PAGE_SIZE = 20;

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  async getCategories(
    offset = 0,
    limit = DEFAULT_PAGE_SIZE,
  ): Promise<ApiResponse<PaginatedResponse<Category>>> {
    return await firstValueFrom(
      this.http.get<ApiResponse<PaginatedResponse<Category>>>(
        `${environment.apiUrl}/api/categories`,
        {
          params: { limit, offset },
          headers: this.auth.getAuthHeaders(),
        },
      ),
    );
  }

  async createCategory(name: string, description = ''): Promise<ApiResponse<Category>> {
    const body: CreateCategoryRequest = {
      name,
      description: description.trim() || undefined,
    };
    return await firstValueFrom(
      this.http.post<ApiResponse<Category>>(`${environment.apiUrl}/api/categories`, body, {
        headers: this.auth.getAuthHeaders(),
      }),
    );
  }

  async updateCategory(id: number, name: string, description = ''): Promise<ApiResponse<Category>> {
    const body: UpdateCategoryRequest = {
      name,
      description: description.trim() || undefined,
    };
    return await firstValueFrom(
      this.http.patch<ApiResponse<Category>>(`${environment.apiUrl}/api/categories/${id}`, body, {
        headers: this.auth.getAuthHeaders(),
      }),
    );
  }

  async deleteCategory(id: number): Promise<ApiResponse<null>> {
    return await firstValueFrom(
      this.http.delete<ApiResponse<null>>(`${environment.apiUrl}/api/categories/${id}`, {
        headers: this.auth.getAuthHeaders(),
      }),
    );
  }
}
