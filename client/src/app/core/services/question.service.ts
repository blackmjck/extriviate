import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  ApiResponse,
  ContentBlock,
  CreateQuestionRequest,
  PaginatedResponse,
  QuestionWithAnswer,
  UpdateQuestionRequest,
} from '@extriviate/shared';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

export const DEFAULT_PAGE_SIZE = 20;

@Injectable({ providedIn: 'root' })
export class QuestionService {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  async getQuestions(
    offset = 0,
    limit = DEFAULT_PAGE_SIZE,
    categoryId: number | null,
  ): Promise<ApiResponse<PaginatedResponse<QuestionWithAnswer>>> {
    const params: Record<string, string | number> = {
      limit,
      offset,
    };
    if (categoryId !== null) {
      params['categoryId'] = categoryId;
    }
    return await firstValueFrom(
      this.http.get<ApiResponse<PaginatedResponse<QuestionWithAnswer>>>(
        `${environment.apiUrl}/api/questions`,
        {
          params,
          headers: this.auth.getAuthHeaders(),
        },
      ),
    );
  }

  async getQuestion(id: number): Promise<ApiResponse<QuestionWithAnswer>> {
    return await firstValueFrom(
      this.http.get<ApiResponse<QuestionWithAnswer>>(`${environment.apiUrl}/api/questions/${id}`, {
        headers: this.auth.getAuthHeaders(),
      }),
    );
  }

  async createQuestion(
    categoryId: number,
    content: ContentBlock[],
    answerContent: ContentBlock[],
    acceptedAnswers?: string[],
  ): Promise<ApiResponse<QuestionWithAnswer>> {
    const body: CreateQuestionRequest = {
      categoryId,
      content,
      answer: {
        content: answerContent,
        acceptedAnswers,
      },
    };
    return await firstValueFrom(
      this.http.post<ApiResponse<QuestionWithAnswer>>(`${environment.apiUrl}/api/questions`, body, {
        headers: this.auth.getAuthHeaders(),
      }),
    );
  }

  async updateQuestion(
    id: number,
    content: ContentBlock[],
    answerContent: ContentBlock[],
    acceptedAnswers?: string[],
  ): Promise<ApiResponse<QuestionWithAnswer>> {
    const body: UpdateQuestionRequest = {
      content,
      answer: {
        content: answerContent,
        acceptedAnswers,
      },
    };
    return await firstValueFrom(
      this.http.patch<ApiResponse<QuestionWithAnswer>>(
        `${environment.apiUrl}/api/questions/${id}`,
        body,
        {
          headers: this.auth.getAuthHeaders(),
        },
      ),
    );
  }

  async deleteQuestion(id: number): Promise<ApiResponse<null>> {
    return await firstValueFrom(
      this.http.delete<ApiResponse<null>>(`${environment.apiUrl}/api/questions/${id}`, {
        headers: this.auth.getAuthHeaders(),
      }),
    );
  }
}
