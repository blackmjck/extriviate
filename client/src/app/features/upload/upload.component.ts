import { Component, inject, signal, computed, output } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { ApiResponse, PresignResponse, UploadConfirmResponse } from '@extriviate/shared';
import { ALLOWED_UPLOAD_TYPES, MAX_IMAGE_SIZE_BYTES, MAX_VIDEO_SIZE_BYTES } from '@extriviate/shared';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-upload',
  standalone: true,
  templateUrl: './upload.component.html',
  styleUrls: ['./upload.component.scss'],
})
export class UploadComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  /** Emits the public URL of the uploaded file when the upload completes. */
  readonly uploaded = output<string>();

  readonly uploading = signal(false);
  readonly progress = signal(0);
  readonly error = signal<string | null>(null);
  readonly dragOver = signal(false);
  readonly fileName = signal<string | null>(null);

  readonly acceptTypes = ALLOWED_UPLOAD_TYPES.join(',');

  readonly progressPercent = computed(() => Math.round(this.progress() * 100));

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }

  onDragLeave(): void {
    this.dragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    const file = event.dataTransfer?.files[0];
    if (file) {
      this.handleFile(file);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.handleFile(file);
    }
    // Reset input so the same file can be re-selected
    input.value = '';
  }

  private async handleFile(file: File): Promise<void> {
    // Validate type
    if (!ALLOWED_UPLOAD_TYPES.includes(file.type as any)) {
      this.error.set(`Unsupported file type: ${file.type}`);
      return;
    }

    // Validate size
    const isVideo = file.type.startsWith('video/');
    const maxSize = isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;
    if (file.size > maxSize) {
      const limitMb = Math.round(maxSize / (1024 * 1024));
      this.error.set(`File too large. Maximum size is ${limitMb} MB.`);
      return;
    }

    this.error.set(null);
    this.uploading.set(true);
    this.progress.set(0);
    this.fileName.set(file.name);

    try {
      // Step 1: Get presigned URL
      const presignRes = await firstValueFrom(
        this.http.post<ApiResponse<PresignResponse>>(
          `${environment.apiUrl}/api/uploads/presign`,
          { mimeType: file.type },
          { headers: this.auth.getAuthHeaders() },
        ),
      );
      const { url: presignedUrl, key } = presignRes.data;
      this.progress.set(0.1);

      // Step 2: Upload to presigned URL with progress tracking
      await this.uploadWithProgress(presignedUrl, file);
      this.progress.set(0.9);

      // Step 3: Confirm upload
      const confirmRes = await firstValueFrom(
        this.http.post<ApiResponse<UploadConfirmResponse>>(
          `${environment.apiUrl}/api/uploads/confirm`,
          { key, mimeType: file.type, sizeBytes: file.size },
          { headers: this.auth.getAuthHeaders() },
        ),
      );
      this.progress.set(1);
      this.uploaded.emit(confirmRes.data.publicUrl);
    } catch {
      this.error.set('Upload failed. Please try again.');
    } finally {
      this.uploading.set(false);
    }
  }

  private uploadWithProgress(url: string, file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', file.type);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          // Map upload progress to 0.1 - 0.9 range
          const uploadFraction = e.loaded / e.total;
          this.progress.set(0.1 + uploadFraction * 0.8);
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
