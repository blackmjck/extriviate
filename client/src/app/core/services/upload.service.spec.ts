import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { UploadService } from './upload.service';
import { AuthService } from './auth.service';

const mockAuth = { getAuthHeaders: () => ({}) };

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuthService, useValue: mockAuth },
    ],
  });

  const service = TestBed.inject(UploadService);
  const httpMock = TestBed.inject(HttpTestingController);
  return { service, httpMock };
}

describe('UploadService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  describe('presign', () => {
    it('POSTs /api/uploads/presign with mimeType', async () => {
      const { service, httpMock } = setup();

      const promise = service.presign('image/jpeg');
      const req = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.includes('/api/uploads/presign'),
      );
      expect(req.request.body).toMatchObject({ mimeType: 'image/jpeg' });
      req.flush({ success: true, data: { url: 'https://r2.example.com/upload', key: 'abc123' } });
      const result = await promise;

      expect(result.data.key).toBe('abc123');
      httpMock.verify();
    });

    it('propagates errors', async () => {
      const { service, httpMock } = setup();

      const promise = service.presign('image/jpeg');
      httpMock
        .expectOne((r) => r.url.includes('/api/uploads/presign'))
        .flush('Error', { status: 500, statusText: 'Error' });

      await expect(promise).rejects.toThrow();
      httpMock.verify();
    });
  });

  describe('confirm', () => {
    it('POSTs /api/uploads/confirm with key, mimeType, and sizeBytes', async () => {
      const { service, httpMock } = setup();

      const promise = service.confirm('abc123', 'image/jpeg', 204800);
      const req = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.includes('/api/uploads/confirm'),
      );
      expect(req.request.body).toMatchObject({
        key: 'abc123',
        mimeType: 'image/jpeg',
        sizeBytes: 204800,
      });
      req.flush({
        success: true,
        data: { publicUrl: 'https://cdn.example.com/abc123', key: 'abc123' },
      });
      const result = await promise;

      expect(result.data.publicUrl).toBe('https://cdn.example.com/abc123');
      httpMock.verify();
    });

    it('propagates HTTP errors from confirm', async () => {
      const { service, httpMock } = setup();

      const promise = service.confirm('key1', 'image/png', 1024);
      httpMock
        .expectOne((r) => r.url.includes('/api/uploads/confirm'))
        .flush('Forbidden', { status: 403, statusText: 'Forbidden' });

      await expect(promise).rejects.toThrow();
      httpMock.verify();
    });
  });

  describe('uploadToPresignedUrl', () => {
    it('resolves when XHR completes with a 2xx status', async () => {
      const { service } = setup();

      // Mock XMLHttpRequest
      const mockXhr = {
        open: vi.fn(),
        setRequestHeader: vi.fn(),
        send: vi.fn(),
        upload: { addEventListener: vi.fn() },
        addEventListener: vi.fn((event: string, handler: () => void) => {
          if (event === 'load') {
            // Simulate an immediate successful response
            Object.defineProperty(mockXhr, 'status', { value: 200, configurable: true });
            handler();
          }
        }),
        status: 200,
      };
      vi.spyOn(globalThis, 'XMLHttpRequest').mockImplementation(function () {
        return mockXhr;
      } as unknown as typeof XMLHttpRequest);

      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      await expect(
        service.uploadToPresignedUrl('https://r2.example.com/upload', file, vi.fn()),
      ).resolves.toBeUndefined();

      expect(mockXhr.open).toHaveBeenCalledWith('PUT', 'https://r2.example.com/upload');
      expect(mockXhr.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    });

    it('rejects when XHR completes with a non-2xx status', async () => {
      const { service } = setup();

      const mockXhr = {
        open: vi.fn(),
        setRequestHeader: vi.fn(),
        send: vi.fn(),
        upload: { addEventListener: vi.fn() },
        addEventListener: vi.fn((event: string, handler: () => void) => {
          if (event === 'load') {
            Object.defineProperty(mockXhr, 'status', { value: 403, configurable: true });
            handler();
          }
        }),
        status: 403,
      };
      vi.spyOn(globalThis, 'XMLHttpRequest').mockImplementation(function () {
        return mockXhr;
      } as unknown as typeof XMLHttpRequest);

      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      await expect(
        service.uploadToPresignedUrl('https://r2.example.com/upload', file, vi.fn()),
      ).rejects.toThrow('Upload failed with status 403');
    });

    it('rejects when a network error occurs', async () => {
      const { service } = setup();

      const eventHandlers: Record<string, () => void> = {};
      const mockXhr = {
        open: vi.fn(),
        setRequestHeader: vi.fn(),
        send: vi.fn(),
        upload: { addEventListener: vi.fn() },
        addEventListener: vi.fn((event: string, handler: () => void) => {
          eventHandlers[event] = handler;
        }),
        status: 0,
      };
      vi.spyOn(globalThis, 'XMLHttpRequest').mockImplementation(function () {
        return mockXhr;
      } as unknown as typeof XMLHttpRequest);

      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const promise = service.uploadToPresignedUrl('https://r2.example.com/upload', file, vi.fn());

      // Trigger the 'error' event after the promise is established
      eventHandlers['error']?.();

      await expect(promise).rejects.toThrow('Upload network error');
    });

    it('rejects when the upload is aborted', async () => {
      const { service } = setup();

      const eventHandlers: Record<string, () => void> = {};
      const mockXhr = {
        open: vi.fn(),
        setRequestHeader: vi.fn(),
        send: vi.fn(),
        upload: { addEventListener: vi.fn() },
        addEventListener: vi.fn((event: string, handler: () => void) => {
          eventHandlers[event] = handler;
        }),
        status: 0,
      };
      vi.spyOn(globalThis, 'XMLHttpRequest').mockImplementation(function () {
        return mockXhr;
      } as unknown as typeof XMLHttpRequest);

      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      const promise = service.uploadToPresignedUrl('https://r2.example.com/upload', file, vi.fn());

      eventHandlers['abort']?.();

      await expect(promise).rejects.toThrow('Upload aborted');
    });

    it('calls onProgress with upload fraction when lengthComputable is true', () => {
      const { service } = setup();

      // Capture the progress handler registered on xhr.upload
      const capturedHandlers: { progress?: (e: ProgressEvent) => void } = {};
      const mockXhr = {
        open: vi.fn(),
        setRequestHeader: vi.fn(),
        send: vi.fn(),
        upload: {
          addEventListener: vi.fn((event: string, handler: (e: ProgressEvent) => void) => {
            if (event === 'progress') capturedHandlers.progress = handler;
          }),
        },
        // addEventListener for load/error/abort — never fire them; we only test progress
        addEventListener: vi.fn(),
        status: 200,
      };
      vi.spyOn(globalThis, 'XMLHttpRequest').mockImplementation(function () {
        return mockXhr;
      } as unknown as typeof XMLHttpRequest);

      const onProgress = vi.fn();
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      // Start upload (promise will never resolve since load is never fired, but that's fine)
      service.uploadToPresignedUrl('https://r2.example.com/upload', file, onProgress);

      // Simulate two progress events
      capturedHandlers.progress?.({
        lengthComputable: true,
        loaded: 25,
        total: 100,
      } as ProgressEvent);
      expect(onProgress).toHaveBeenCalledWith(0.25);

      capturedHandlers.progress?.({
        lengthComputable: true,
        loaded: 75,
        total: 100,
      } as ProgressEvent);
      expect(onProgress).toHaveBeenCalledWith(0.75);

      expect(onProgress).toHaveBeenCalledTimes(2);
    });

    it('does not call onProgress when lengthComputable is false', () => {
      const { service } = setup();

      const capturedHandlers: { progress?: (e: ProgressEvent) => void } = {};
      const mockXhr = {
        open: vi.fn(),
        setRequestHeader: vi.fn(),
        send: vi.fn(),
        upload: {
          addEventListener: vi.fn((event: string, handler: (e: ProgressEvent) => void) => {
            if (event === 'progress') capturedHandlers.progress = handler;
          }),
        },
        addEventListener: vi.fn(),
        status: 200,
      };
      vi.spyOn(globalThis, 'XMLHttpRequest').mockImplementation(function () {
        return mockXhr;
      } as unknown as typeof XMLHttpRequest);

      const onProgress = vi.fn();
      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      service.uploadToPresignedUrl('https://r2.example.com/upload', file, onProgress);

      // Simulate a progress event where length is not known
      capturedHandlers.progress?.({
        lengthComputable: false,
        loaded: 50,
        total: 0,
      } as ProgressEvent);

      expect(onProgress).not.toHaveBeenCalled();
    });
  });
});
