import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { ApiResponse, PresignResponse, UploadConfirmResponse } from '@extriviate/shared';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  async presign(mimeType: string): Promise<ApiResponse<PresignResponse>> {
    return await firstValueFrom(
      this.http.post<ApiResponse<PresignResponse>>(
        `${environment.apiUrl}/api/uploads/presign`,
        { mimeType },
        { headers: this.auth.getAuthHeaders() },
      ),
    );
  }

  async confirm(
    key: string,
    mimeType: string,
    sizeBytes: number,
  ): Promise<ApiResponse<UploadConfirmResponse>> {
    return await firstValueFrom(
      this.http.post<ApiResponse<UploadConfirmResponse>>(
        `${environment.apiUrl}/api/uploads/confirm`,
        { key, mimeType, sizeBytes },
        { headers: this.auth.getAuthHeaders() },
      ),
    );
  }

  /** Uploads a file directly to a presigned URL via XHR so upload progress can be tracked.
   *  Calls onProgress with a fraction in the range [0, 1] as the upload proceeds. */
  uploadToPresignedUrl(
    url: string,
    file: File,
    onProgress: (fraction: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', file.type);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress(e.loaded / e.total);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Upload network error')));
      xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

      xhr.send(file);
    });
  }
}
