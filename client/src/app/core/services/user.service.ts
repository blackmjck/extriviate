import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { ApiResponse, PublicUser, UserStats, UpdateProfileRequest } from '@extriviate/shared';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  async updateProfile(body: UpdateProfileRequest): Promise<ApiResponse<PublicUser>> {
    return await firstValueFrom(
      this.http.patch<ApiResponse<PublicUser>>(`${environment.apiUrl}/api/users/me`, body, {
        headers: this.auth.getAuthHeaders(),
      }),
    );
  }

  async getStats(): Promise<ApiResponse<UserStats>> {
    return await firstValueFrom(
      this.http.get<ApiResponse<UserStats>>(`${environment.apiUrl}/api/users/me/stats`, {
        headers: this.auth.getAuthHeaders(),
      }),
    );
  }
}
