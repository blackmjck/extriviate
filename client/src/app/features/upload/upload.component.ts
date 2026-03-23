import {
  Component,
  inject,
  signal,
  computed,
  output,
  ChangeDetectionStrategy,
} from '@angular/core';
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_IMAGE_SIZE_MBYTES,
  MAX_VIDEO_SIZE_MBYTES,
} from '@extriviate/shared';
import { UploadService } from '../../core/services/upload.service';

@Component({
  selector: 'app-upload',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './upload.component.html',
  styleUrls: ['./upload.component.scss'],
})
export class UploadComponent {
  private readonly uploadService = inject(UploadService);

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
    if (!(ALLOWED_UPLOAD_TYPES as unknown as string[]).includes(file.type)) {
      this.error.set(`Unsupported file type: ${file.type}`);
      return;
    }

    // Validate size
    const isVideo = file.type.startsWith('video/');
    const maxSize = isVideo ? MAX_VIDEO_SIZE_MBYTES : MAX_IMAGE_SIZE_MBYTES;
    if (file.size > maxSize) {
      this.error.set(`File too large. Maximum size is ${maxSize} MB.`);
      return;
    }

    this.error.set(null);
    this.uploading.set(true);
    this.progress.set(0);
    this.fileName.set(file.name);

    try {
      // Step 1: Get presigned URL
      const presignRes = await this.uploadService.presign(file.type);
      const { url: presignedUrl, key } = presignRes.data;
      this.progress.set(0.1);

      // Step 2: Upload to presigned URL with progress tracking
      await this.uploadService.uploadToPresignedUrl(presignedUrl, file, (fraction) => {
        // Map upload progress to 0.1 - 0.9 range
        this.progress.set(0.1 + fraction * 0.8);
      });
      this.progress.set(0.9);

      // Step 3: Confirm upload
      const confirmRes = await this.uploadService.confirm(key, file.type, file.size);
      this.progress.set(1);
      this.uploaded.emit(confirmRes.data.publicUrl);
    } catch {
      this.error.set('Upload failed. Please try again.');
    } finally {
      this.uploading.set(false);
    }
  }
}
