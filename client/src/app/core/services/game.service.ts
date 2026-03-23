import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  ApiResponse,
  Game,
  GameBoard,
  PaginatedResponse,
  CreateGameRequest,
  UpdateGameRequest,
  AssignGameCategoryRequest,
} from '@extriviate/shared';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  async getGame(id: number): Promise<ApiResponse<GameBoard>> {
    return await firstValueFrom(
      this.http.get<ApiResponse<GameBoard>>(`${environment.apiUrl}/api/games/${id}`, {
        headers: this.auth.getAuthHeaders(),
      }),
    );
  }

  async getGames(offset = 0, limit = 12): Promise<ApiResponse<PaginatedResponse<Game>>> {
    return await firstValueFrom(
      this.http.get<ApiResponse<PaginatedResponse<Game>>>(`${environment.apiUrl}/api/games`, {
        params: { limit, offset },
        headers: this.auth.getAuthHeaders(),
      }),
    );
  }

  async createGame(title: string): Promise<ApiResponse<Game>> {
    const body: CreateGameRequest = { title };
    return await firstValueFrom(
      this.http.post<ApiResponse<Game>>(`${environment.apiUrl}/api/games`, body, {
        headers: this.auth.getAuthHeaders(),
      }),
    );
  }

  async updateGame(id: number, body: UpdateGameRequest): Promise<ApiResponse<Game>> {
    return await firstValueFrom(
      this.http.patch<ApiResponse<Game>>(`${environment.apiUrl}/api/games/${id}`, body, {
        headers: this.auth.getAuthHeaders(),
      }),
    );
  }

  async updateBoard(
    id: number,
    categories: AssignGameCategoryRequest[],
  ): Promise<ApiResponse<GameBoard>> {
    return await firstValueFrom(
      this.http.put<ApiResponse<GameBoard>>(
        `${environment.apiUrl}/api/games/${id}/board`,
        { categories },
        { headers: this.auth.getAuthHeaders() },
      ),
    );
  }

  async deleteGame(id: number): Promise<ApiResponse<null>> {
    return await firstValueFrom(
      this.http.delete<ApiResponse<null>>(`${environment.apiUrl}/api/games/${id}`, {
        headers: this.auth.getAuthHeaders(),
      }),
    );
  }
}
