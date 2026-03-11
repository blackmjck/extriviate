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
      vi.spyOn(globalThis, 'XMLHttpRequest').mockImplementation(
        function () { return mockXhr; } as unknown as typeof XMLHttpRequest,
      );

      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      await expect(
        service.uploadToPresignedUrl('https://r2.example.com/upload', file, vi.fn()),
      ).resolves.toBeUndefined();

      expect(mockXhr.open).toHaveBeenCalledWith('PUT', 'https://r2.example.com/upload');
      expect(mockXhr.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
      vi.restoreAllMocks();
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
      vi.spyOn(globalThis, 'XMLHttpRequest').mockImplementation(
        function () { return mockXhr; } as unknown as typeof XMLHttpRequest,
      );

      const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
      await expect(
        service.uploadToPresignedUrl('https://r2.example.com/upload', file, vi.fn()),
      ).rejects.toThrow('Upload failed with status 403');

      vi.restoreAllMocks();
    });

    // it('calls onProgress with upload fractions', () => {
    //   const { service } = setup();

    //   let progressCallback: ((e: ProgressEvent) => void) | null = null;
    //   const mockXhr = {
    //     open: vi.fn(),
    //     setRequestHeader: vi.fn(),
    //     send: vi.fn(),
    //     upload: {
    //       addEventListener: vi.fn((_event: string, handler: (e: ProgressEvent) => void) => {
    //         progressCallback = handler;
    //       }),
    //     },
    //     addEventListener: vi.fn(),
    //     status: 200,
    //   };
    //   vi.spyOn(globalThis, 'XMLHttpRequest').mockImplementation(
    //     () => mockXhr as unknown as XMLHttpRequest,
    //   );

    //   const onProgress = vi.fn();
    //   const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
    //   service.uploadToPresignedUrl('https://r2.example.com/upload', file, onProgress);

    //   // Simulate a progress event
    //   progressCallback?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent);
    //   expect(onProgress).toHaveBeenCalledWith(0.5);

    //   vi.restoreAllMocks();
    // });
  });
});
