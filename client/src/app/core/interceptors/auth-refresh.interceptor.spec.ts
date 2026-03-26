import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { HttpContext } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';
import { authRefreshInterceptor, RETRY_AFTER_REFRESH } from './auth-refresh.interceptor';
import { AuthService } from '../services/auth.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tick = (): Promise<void> => Promise.resolve();

function setup(accessToken: string | null = 'valid-token') {
  const mockAuth = {
    getAccessToken: vi.fn().mockReturnValue(accessToken),
    refreshTokenOnce: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
  };

  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authRefreshInterceptor])),
      provideHttpClientTesting(),
      { provide: AuthService, useValue: mockAuth },
    ],
  });

  return {
    http: TestBed.inject(HttpClient),
    httpMock: TestBed.inject(HttpTestingController),
    mockAuth,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  TestBed.resetTestingModule();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('authRefreshInterceptor', () => {
  // -------------------------------------------------------------------------
  describe('pass-through on success', () => {
    it('returns a 200 response as-is without calling refreshTokenOnce', async () => {
      const { http, httpMock, mockAuth } = setup();

      const p = firstValueFrom(
        http.get('/api/games/1', { headers: { Authorization: 'Bearer valid-token' } }),
      );
      httpMock.expectOne('/api/games/1').flush({ success: true, data: { id: 1 } });

      await p;
      expect(mockAuth.refreshTokenOnce).not.toHaveBeenCalled();
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  describe('happy path 401 retry', () => {
    it('calls refreshTokenOnce then retries the request with the new token on 401', async () => {
      const { http, httpMock, mockAuth } = setup('old-token');

      // After refresh the service now returns a different token
      mockAuth.getAccessToken
        .mockReturnValueOnce('old-token') // initial check before refresh
        .mockReturnValue('new-token'); // used when building the retry header

      const p = firstValueFrom(
        http.get('/api/games/1', { headers: { Authorization: 'Bearer old-token' } }),
      );

      // Original request returns 401
      httpMock
        .expectOne('/api/games/1')
        .flush({ error: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

      // The interceptor calls refreshTokenOnce() — resolves after one microtask
      await tick();
      await tick();

      expect(mockAuth.refreshTokenOnce).toHaveBeenCalledOnce();

      // Retry request must carry the updated token
      const retryReq = httpMock.expectOne('/api/games/1');
      expect(retryReq.request.headers.get('Authorization')).toBe('Bearer new-token');
      retryReq.flush({ success: true, data: { id: 1 } });

      await p;
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  describe('retry gets 401 — no re-interception', () => {
    it('does not call refreshTokenOnce a second time when the retried request returns 401', async () => {
      const { http, httpMock, mockAuth } = setup();

      // Simulate a request that already has RETRY_AFTER_REFRESH set (as if it is the retry)
      const p = firstValueFrom(
        http.get('/api/games/1', {
          headers: { Authorization: 'Bearer token' },
          context: new HttpContext().set(RETRY_AFTER_REFRESH, true),
        }),
      ).catch((err) => err);

      httpMock
        .expectOne('/api/games/1')
        .flush({ error: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

      await p;
      expect(mockAuth.refreshTokenOnce).not.toHaveBeenCalled();
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  describe('skip auth endpoints', () => {
    it('does not call refreshTokenOnce when the URL contains /api/auth', async () => {
      const { http, httpMock, mockAuth } = setup();

      const p = firstValueFrom(
        http.post(
          '/api/auth/login',
          {},
          { headers: { Authorization: 'Bearer valid-token' } },
        ),
      ).catch((err) => err);

      httpMock
        .expectOne('/api/auth/login')
        .flush({ error: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

      await p;
      expect(mockAuth.refreshTokenOnce).not.toHaveBeenCalled();
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  describe('skip when no Authorization header', () => {
    it('does not call refreshTokenOnce when the request has no Authorization header', async () => {
      const { http, httpMock, mockAuth } = setup();

      // No Authorization header
      const p = firstValueFrom(http.get('/api/games/1')).catch((err) => err);

      httpMock
        .expectOne('/api/games/1')
        .flush({ error: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

      await p;
      expect(mockAuth.refreshTokenOnce).not.toHaveBeenCalled();
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  describe('skip when access token is null', () => {
    it('does not call refreshTokenOnce when getAccessToken returns null (guest scenario)', async () => {
      // accessToken is null — mimics a guest user
      const { http, httpMock, mockAuth } = setup(null);

      const p = firstValueFrom(
        http.get('/api/games/1', { headers: { Authorization: 'Bearer some-token' } }),
      ).catch((err) => err);

      httpMock
        .expectOne('/api/games/1')
        .flush({ error: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

      await p;
      expect(mockAuth.refreshTokenOnce).not.toHaveBeenCalled();
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  describe('skip non-401 errors', () => {
    it('does not call refreshTokenOnce on a 403 response', async () => {
      const { http, httpMock, mockAuth } = setup();

      const p = firstValueFrom(
        http.get('/api/games/1', { headers: { Authorization: 'Bearer valid-token' } }),
      ).catch((err) => err);

      httpMock
        .expectOne('/api/games/1')
        .flush({ error: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });

      await p;
      expect(mockAuth.refreshTokenOnce).not.toHaveBeenCalled();
      httpMock.verify();
    });

    it('does not call refreshTokenOnce on a 500 response', async () => {
      const { http, httpMock, mockAuth } = setup();

      const p = firstValueFrom(
        http.get('/api/games/1', { headers: { Authorization: 'Bearer valid-token' } }),
      ).catch((err) => err);

      httpMock
        .expectOne('/api/games/1')
        .flush('Internal Server Error', { status: 500, statusText: 'Internal Server Error' });

      await p;
      expect(mockAuth.refreshTokenOnce).not.toHaveBeenCalled();
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  describe('refresh failure → logout', () => {
    it('calls logout and re-throws the original 401 error when refreshTokenOnce rejects', async () => {
      const { http, httpMock, mockAuth } = setup();

      mockAuth.refreshTokenOnce.mockRejectedValue(new Error('Refresh failed'));

      let caughtError: unknown;
      const p = firstValueFrom(
        http.get('/api/games/1', { headers: { Authorization: 'Bearer valid-token' } }),
      ).catch((err) => {
        caughtError = err;
      });

      httpMock
        .expectOne('/api/games/1')
        .flush({ error: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

      await tick();
      await tick();
      await tick();

      await p;

      expect(mockAuth.logout).toHaveBeenCalledOnce();
      // The re-thrown error must be the original HttpErrorResponse (status 401)
      expect((caughtError as { status: number }).status).toBe(401);
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  describe('token updated in retry header', () => {
    it('uses the value returned by getAccessToken() after refresh — not the pre-refresh value', async () => {
      const { http, httpMock, mockAuth } = setup('stale-token');

      let callCount = 0;
      mockAuth.getAccessToken.mockImplementation(() => {
        // First call is the pre-flight guard check inside the condition,
        // subsequent calls (after refresh) return the new token
        callCount++;
        return callCount === 1 ? 'stale-token' : 'fresh-token';
      });

      const p = firstValueFrom(
        http.get('/api/games/1', { headers: { Authorization: 'Bearer stale-token' } }),
      );

      httpMock
        .expectOne('/api/games/1')
        .flush({ error: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

      await tick();
      await tick();

      const retryReq = httpMock.expectOne('/api/games/1');
      expect(retryReq.request.headers.get('Authorization')).toBe('Bearer fresh-token');
      retryReq.flush({ success: true, data: {} });

      await p;
      httpMock.verify();
    });
  });
});
