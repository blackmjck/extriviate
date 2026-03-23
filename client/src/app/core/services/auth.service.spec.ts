import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { AuthService } from './auth.service';
import { GameSocketService } from './game-socket.service';

// ---------------------------------------------------------------------------
// Fixtures

const fakeUser = {
  id: 1,
  displayName: 'Alice',
  role: 'player' as const,
  createdAt: '2025-01-01T00:00:00.000Z',
};

const fakeAuthResponse = {
  user: fakeUser,
  tokens: { accessToken: 'test-access-token' },
};

// ---------------------------------------------------------------------------
// Helpers

const mockSocketService = { disconnect: vi.fn() };

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: GameSocketService, useValue: mockSocketService },
    ],
  });
  return {
    service: TestBed.inject(AuthService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

/**
 * Advances the microtask queue by one turn.
 *
 * `firstValueFrom()` resolves via a microtask even when the underlying
 * Observable completes synchronously (as Angular's HttpTestingController
 * does when you call req.flush()). Awaiting this function between
 * sequential HTTP steps lets each `await` inside the service advance
 * before the next expectOne() call is made.
 */
const tick = (): Promise<void> => Promise.resolve();

/** Puts the service into a logged-in state by completing a real login call. */
async function loginService(service: AuthService, httpMock: HttpTestingController): Promise<void> {
  const p = service.login('alice@example.com', 'password', 'turnstile');
  httpMock.expectOne('/api/auth/login').flush({ success: true, data: fakeAuthResponse });
  await p;
}

// ---------------------------------------------------------------------------

describe('AuthService', () => {
  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  // -------------------------------------------------------------------------
  describe('initial state', () => {
    it('currentUser signal is null before any interaction', () => {
      const { service } = setup();
      expect(service.currentUser()).toBeNull();
    });

    it('isAuthenticated computed is false before any interaction', () => {
      const { service } = setup();
      expect(service.isAuthenticated()).toBe(false);
    });

    it('getAccessToken returns null before any interaction', () => {
      const { service } = setup();
      expect(service.getAccessToken()).toBeNull();
    });

    it('getAuthHeaders returns an empty object before any interaction', () => {
      const { service } = setup();
      expect(service.getAuthHeaders()).toEqual({});
    });
  });

  // -------------------------------------------------------------------------
  describe('checkPwnedPassword()', () => {
    it('POSTs to /api/auth/check-password with the provided password', async () => {
      const { service, httpMock } = setup();

      const promise = service.checkPwnedPassword('hunter2');
      const req = httpMock.expectOne('/api/auth/check-password');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ password: 'hunter2' });
      req.flush({ success: true, data: { pwned: false } });

      await promise;
      httpMock.verify();
    });

    it('returns true when the server reports the password was found in a data breach', async () => {
      const { service, httpMock } = setup();

      const promise = service.checkPwnedPassword('password');
      httpMock
        .expectOne('/api/auth/check-password')
        .flush({ success: true, data: { pwned: true } });

      expect(await promise).toBe(true);
      httpMock.verify();
    });

    it('returns false when the server reports no breach', async () => {
      const { service, httpMock } = setup();

      const promise = service.checkPwnedPassword('c0rr3ctH0rseBatteryStaple!');
      httpMock
        .expectOne('/api/auth/check-password')
        .flush({ success: true, data: { pwned: false } });

      expect(await promise).toBe(false);
      httpMock.verify();
    });

    it('returns undefined when the server responds with an error status', async () => {
      const { service, httpMock } = setup();

      const promise = service.checkPwnedPassword('password');
      httpMock
        .expectOne('/api/auth/check-password')
        .flush('Service Unavailable', { status: 503, statusText: 'Service Unavailable' });

      expect(await promise).toBeUndefined();
      httpMock.verify();
    });

    it('returns undefined when the request fails due to a network error', async () => {
      const { service, httpMock } = setup();

      const promise = service.checkPwnedPassword('password');
      httpMock.expectOne('/api/auth/check-password').error(new ProgressEvent('network error'));

      expect(await promise).toBeUndefined();
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  describe('login()', () => {
    it('POSTs to /api/auth/login with email, password, and turnstileToken', async () => {
      const { service, httpMock } = setup();

      const promise = service.login('alice@example.com', 'password123', 'cf-token');
      const req = httpMock.expectOne('/api/auth/login');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        email: 'alice@example.com',
        password: 'password123',
        turnstileToken: 'cf-token',
      });
      req.flush({ success: true, data: fakeAuthResponse });

      await promise;
      httpMock.verify();
    });

    it('stores the access token in memory', async () => {
      const { service, httpMock } = setup();

      const p = service.login('alice@example.com', 'password', 'token');
      httpMock.expectOne('/api/auth/login').flush({ success: true, data: fakeAuthResponse });
      await p;

      expect(service.getAccessToken()).toBe('test-access-token');
    });

    it('sets the currentUser signal to the returned user', async () => {
      const { service, httpMock } = setup();

      const p = service.login('alice@example.com', 'password', 'token');
      httpMock.expectOne('/api/auth/login').flush({ success: true, data: fakeAuthResponse });
      await p;

      expect(service.currentUser()).toEqual(fakeUser);
    });

    it('sets isAuthenticated to true', async () => {
      const { service, httpMock } = setup();

      const p = service.login('alice@example.com', 'password', 'token');
      httpMock.expectOne('/api/auth/login').flush({ success: true, data: fakeAuthResponse });
      await p;

      expect(service.isAuthenticated()).toBe(true);
    });

    it('returns the user from the server response', async () => {
      const { service, httpMock } = setup();

      const p = service.login('alice@example.com', 'password', 'token');
      httpMock.expectOne('/api/auth/login').flush({ success: true, data: fakeAuthResponse });
      const user = await p;

      expect(user).toEqual(fakeUser);
    });

    it('propagates HTTP errors to the caller without modifying state', async () => {
      const { service, httpMock } = setup();

      const p = service.login('alice@example.com', 'wrong', 'token');
      httpMock.expectOne('/api/auth/login').flush(
        {
          success: false,
          error: { message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' },
        },
        { status: 401, statusText: 'Unauthorized' },
      );

      await expect(p).rejects.toThrow();
      expect(service.getAccessToken()).toBeNull();
      expect(service.currentUser()).toBeNull();
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  describe('signup()', () => {
    const signupUser = {
      id: 2,
      displayName: 'Bob',
      role: 'player' as const,
      createdAt: '2025-01-01T00:00:00.000Z',
    };
    const signupAuthResponse = {
      user: signupUser,
      tokens: { accessToken: 'signup-access-token' },
    };

    it('POSTs to /api/auth/signup with email, password, displayName, and turnstileToken', async () => {
      const { service, httpMock } = setup();

      const promise = service.signup('bob@example.com', 'password123', 'Bob', 'cf-token');
      const req = httpMock.expectOne('/api/auth/signup');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        email: 'bob@example.com',
        password: 'password123',
        displayName: 'Bob',
        turnstileToken: 'cf-token',
      });
      req.flush({ success: true, data: signupAuthResponse });

      await promise;
      httpMock.verify();
    });

    it('stores the access token in memory', async () => {
      const { service, httpMock } = setup();

      const p = service.signup('bob@example.com', 'password123', 'Bob', 'token');
      httpMock.expectOne('/api/auth/signup').flush({ success: true, data: signupAuthResponse });
      await p;

      expect(service.getAccessToken()).toBe('signup-access-token');
    });

    it('sets the currentUser signal to the returned user', async () => {
      const { service, httpMock } = setup();

      const p = service.signup('bob@example.com', 'password123', 'Bob', 'token');
      httpMock.expectOne('/api/auth/signup').flush({ success: true, data: signupAuthResponse });
      await p;

      expect(service.currentUser()).toEqual(signupUser);
    });

    it('sets isAuthenticated to true', async () => {
      const { service, httpMock } = setup();

      const p = service.signup('bob@example.com', 'password123', 'Bob', 'token');
      httpMock.expectOne('/api/auth/signup').flush({ success: true, data: signupAuthResponse });
      await p;

      expect(service.isAuthenticated()).toBe(true);
    });

    it('returns the user from the server response', async () => {
      const { service, httpMock } = setup();

      const p = service.signup('bob@example.com', 'password123', 'Bob', 'token');
      httpMock.expectOne('/api/auth/signup').flush({ success: true, data: signupAuthResponse });
      const user = await p;

      expect(user).toEqual(signupUser);
    });

    it('propagates HTTP errors to the caller without modifying state', async () => {
      const { service, httpMock } = setup();

      const p = service.signup('taken@example.com', 'password123', 'Taken', 'token');
      httpMock.expectOne('/api/auth/signup').flush(
        {
          success: false,
          error: { message: 'An account with this email already exists', code: 'EMAIL_TAKEN' },
        },
        { status: 409, statusText: 'Conflict' },
      );

      await expect(p).rejects.toThrow();
      expect(service.getAccessToken()).toBeNull();
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  describe('logout()', () => {
    it('fires a POST to /api/auth/logout when an access token is in memory', async () => {
      const { service, httpMock } = setup();
      await loginService(service, httpMock);

      service.logout();

      const req = httpMock.expectOne('/api/auth/logout');
      expect(req.request.method).toBe('POST');
      req.flush({});
      httpMock.verify();
    });

    it('sends an Authorization: Bearer header on the logout request', async () => {
      const { service, httpMock } = setup();
      await loginService(service, httpMock);

      service.logout();

      const req = httpMock.expectOne('/api/auth/logout');
      expect(req.request.headers.get('Authorization')).toBe('Bearer test-access-token');
      req.flush({});
      httpMock.verify();
    });

    it('sends withCredentials: true so the refresh-token cookie is included', async () => {
      const { service, httpMock } = setup();
      await loginService(service, httpMock);

      service.logout();

      const req = httpMock.expectOne('/api/auth/logout');
      expect(req.request.withCredentials).toBe(true);
      req.flush({});
      httpMock.verify();
    });

    it('sends an empty body (not the options object) on the logout request', async () => {
      const { service, httpMock } = setup();
      await loginService(service, httpMock);

      service.logout();

      const req = httpMock.expectOne('/api/auth/logout');
      // Body must be null (Angular serialises {} as null for application/json with no fields)
      // or at most an empty object — never the options object containing headers/withCredentials.
      expect(req.request.body).not.toHaveProperty('headers');
      expect(req.request.body).not.toHaveProperty('withCredentials');
      req.flush({});
      httpMock.verify();
    });

    it('calls socketService.disconnect() to close any active game connection', async () => {
      const { service, httpMock } = setup();
      await loginService(service, httpMock);

      service.logout();

      expect(mockSocketService.disconnect).toHaveBeenCalledOnce();
      httpMock.expectOne('/api/auth/logout').flush({});
      httpMock.verify();
    });

    it('does NOT fire a logout HTTP request when no access token is in memory', () => {
      const { service, httpMock } = setup();

      service.logout(); // called while already unauthenticated

      httpMock.expectNone('/api/auth/logout');
      httpMock.verify();
    });

    it('still calls socketService.disconnect() even when no access token is held', () => {
      const { service, httpMock } = setup();

      service.logout();

      expect(mockSocketService.disconnect).toHaveBeenCalledOnce();
      httpMock.verify();
    });

    it('clears the access token synchronously before the HTTP request completes', async () => {
      const { service, httpMock } = setup();
      await loginService(service, httpMock);

      service.logout();

      // State is cleared immediately — the fire-and-forget POST has not yet been flushed
      expect(service.getAccessToken()).toBeNull();

      httpMock.expectOne('/api/auth/logout').flush({});
      httpMock.verify();
    });

    it('clears the currentUser signal synchronously', async () => {
      const { service, httpMock } = setup();
      await loginService(service, httpMock);

      service.logout();

      expect(service.currentUser()).toBeNull();

      httpMock.expectOne('/api/auth/logout').flush({});
      httpMock.verify();
    });

    it('sets isAuthenticated to false synchronously', async () => {
      const { service, httpMock } = setup();
      await loginService(service, httpMock);

      service.logout();

      expect(service.isAuthenticated()).toBe(false);

      httpMock.expectOne('/api/auth/logout').flush({});
      httpMock.verify();
    });

    it('silently ignores HTTP errors from the logout request', async () => {
      const { service, httpMock } = setup();
      await loginService(service, httpMock);

      service.logout();

      // Flushing with a server error must not throw or restore state
      httpMock
        .expectOne('/api/auth/logout')
        .flush('Internal Server Error', { status: 500, statusText: 'Error' });

      expect(service.getAccessToken()).toBeNull();
      expect(service.currentUser()).toBeNull();
      httpMock.verify();
    });

    it('clears state without throwing even when called while already logged out', () => {
      const { service, httpMock } = setup();

      expect(() => service.logout()).not.toThrow();

      expect(service.getAccessToken()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  describe('refreshToken()', () => {
    it('POSTs to /api/auth/refresh with an empty body and withCredentials: true', async () => {
      const { service, httpMock } = setup();

      const promise = service.refreshToken();
      const req = httpMock.expectOne('/api/auth/refresh');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      expect(req.request.withCredentials).toBe(true);
      req.flush({ success: true, data: { accessToken: 'refreshed-token' } });

      await promise;
      httpMock.verify();
    });

    it('updates the in-memory access token on a successful refresh', async () => {
      const { service, httpMock } = setup();

      const promise = service.refreshToken();
      httpMock
        .expectOne('/api/auth/refresh')
        .flush({ success: true, data: { accessToken: 'refreshed-token' } });
      await promise;

      expect(service.getAccessToken()).toBe('refreshed-token');
    });

    it('propagates errors to the caller', async () => {
      const { service, httpMock } = setup();

      const promise = service.refreshToken();
      httpMock
        .expectOne('/api/auth/refresh')
        .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      await expect(promise).rejects.toThrow();
      expect(service.getAccessToken()).toBeNull();
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  describe('loadUser()', () => {
    describe('when an access token is already in memory', () => {
      it('GETs /api/users/me with the Authorization header', async () => {
        const { service, httpMock } = setup();
        await loginService(service, httpMock);

        const promise = service.loadUser();
        const req = httpMock.expectOne('/api/users/me');
        expect(req.request.method).toBe('GET');
        expect(req.request.headers.get('Authorization')).toBe('Bearer test-access-token');
        req.flush({ success: true, data: fakeUser });

        await promise;
        httpMock.verify();
      });

      it('sets the currentUser signal on a successful response', async () => {
        const { service, httpMock } = setup();
        await loginService(service, httpMock);

        const promise = service.loadUser();
        httpMock.expectOne('/api/users/me').flush({ success: true, data: fakeUser });
        await promise;

        expect(service.currentUser()).toEqual(fakeUser);
      });

      it('silently retries via refresh when GET /api/users/me fails', async () => {
        const { service, httpMock } = setup();
        await loginService(service, httpMock);

        const promise = service.loadUser();

        // Step 1 — initial GET fails (e.g. access token expired)
        httpMock
          .expectOne('/api/users/me')
          .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
        await tick(); // let the catch block advance to tryRefreshAndLoad

        // Step 2 — refresh
        httpMock
          .expectOne('/api/auth/refresh')
          .flush({ success: true, data: { accessToken: 'refreshed-token' } });
        await tick(); // let firstValueFrom inside refreshToken() resolve
        await tick(); // let tryRefreshAndLoad()'s continuation run and issue the re-fetch

        // Step 3 — re-fetch with the new token
        const meReq = httpMock.expectOne('/api/users/me');
        expect(meReq.request.headers.get('Authorization')).toBe('Bearer refreshed-token');
        meReq.flush({ success: true, data: fakeUser });

        await promise;
        expect(service.currentUser()).toEqual(fakeUser);
        httpMock.verify();
      });

      it('calls logout when refresh also fails after a GET /api/users/me error', async () => {
        const { service, httpMock } = setup();
        await loginService(service, httpMock); // token = 'test-access-token'

        const promise = service.loadUser();

        // Initial GET fails
        httpMock
          .expectOne('/api/users/me')
          .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
        await tick();

        // Refresh also fails — token is still 'test-access-token' (unchanged)
        httpMock
          .expectOne('/api/auth/refresh')
          .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
        await tick(); // let firstValueFrom inside refreshToken() reject
        await tick(); // let tryRefreshAndLoad()'s catch block run and call logout()

        // logout() fires because the original token is still in memory
        httpMock.expectOne('/api/auth/logout').flush({});

        await promise;
        expect(service.getAccessToken()).toBeNull();
        expect(service.currentUser()).toBeNull();
        httpMock.verify();
      });
    });

    describe('when no access token is in memory (cold start)', () => {
      it('refreshes via cookie then fetches the user', async () => {
        const { service, httpMock } = setup();

        const promise = service.loadUser();

        // Step 1 — refresh using the HttpOnly cookie
        httpMock
          .expectOne('/api/auth/refresh')
          .flush({ success: true, data: { accessToken: 'cold-token' } });
        await tick(); // let firstValueFrom inside refreshToken() resolve
        await tick(); // let tryRefreshAndLoad()'s continuation run and issue GET /api/users/me

        // Step 2 — fetch user with the new token
        httpMock.expectOne('/api/users/me').flush({ success: true, data: fakeUser });

        await promise;
        expect(service.currentUser()).toEqual(fakeUser);
        expect(service.getAccessToken()).toBe('cold-token');
        httpMock.verify();
      });

      it('calls logout (no HTTP request) when the refresh request fails', async () => {
        const { service, httpMock } = setup();

        const promise = service.loadUser();

        // Refresh fails — token was never set, so logout() skips the HTTP call
        httpMock
          .expectOne('/api/auth/refresh')
          .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

        await promise;
        expect(service.getAccessToken()).toBeNull();
        expect(service.currentUser()).toBeNull();
        // No /api/auth/logout request because accessToken was null when logout() ran
        httpMock.verify();
      });

      it('calls logout (with HTTP request) when refresh succeeds but GET /api/users/me fails', async () => {
        const { service, httpMock } = setup();

        const promise = service.loadUser();

        // Refresh succeeds — token is now set in memory
        httpMock
          .expectOne('/api/auth/refresh')
          .flush({ success: true, data: { accessToken: 'new-token' } });
        await tick(); // let firstValueFrom inside refreshToken() resolve
        await tick(); // let tryRefreshAndLoad()'s continuation run and issue GET /api/users/me

        // GET /api/users/me fails
        httpMock
          .expectOne('/api/users/me')
          .flush('Server Error', { status: 500, statusText: 'Error' });
        await tick();

        // logout() fires because the token was set by the successful refresh
        httpMock.expectOne('/api/auth/logout').flush({});

        await promise;
        expect(service.getAccessToken()).toBeNull();
        expect(service.currentUser()).toBeNull();
        httpMock.verify();
      });
    });
  });

  // -------------------------------------------------------------------------
  describe('forgotPassword()', () => {
    it('POSTs to /api/auth/forgot-password with email and turnstileToken', async () => {
      const { service, httpMock } = setup();

      const promise = service.forgotPassword('alice@example.com', 'cf-token');
      const req = httpMock.expectOne('/api/auth/forgot-password');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email: 'alice@example.com', turnstileToken: 'cf-token' });
      req.flush({
        success: true,
        data: { response: 'If that email exists, a reset link has been sent.' },
      });

      await promise;
      httpMock.verify();
    });

    it('returns the server response string on success', async () => {
      const { service, httpMock } = setup();

      const promise = service.forgotPassword('alice@example.com', 'cf-token');
      httpMock
        .expectOne('/api/auth/forgot-password')
        .flush({
          success: true,
          data: { response: 'If that email exists, a reset link has been sent.' },
        });

      expect(await promise).toBe('If that email exists, a reset link has been sent.');
      httpMock.verify();
    });

    it('throws when the server responds with an error status', async () => {
      const { service, httpMock } = setup();

      const promise = service.forgotPassword('alice@example.com', 'cf-token');
      httpMock
        .expectOne('/api/auth/forgot-password')
        .flush(
          { success: false, error: { message: 'Too many requests', code: 'RATE_LIMITED' } },
          { status: 429, statusText: 'Too Many Requests' },
        );

      await expect(promise).rejects.toThrow();
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  describe('resetPassword()', () => {
    it('POSTs to /api/auth/reset-password with token, password, and turnstileToken', async () => {
      const { service, httpMock } = setup();

      const promise = service.resetPassword('reset-token-abc', 'new-password', 'cf-token');
      const req = httpMock.expectOne('/api/auth/reset-password');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        token: 'reset-token-abc',
        newPassword: 'new-password',
        turnstileToken: 'cf-token',
      });
      req.flush({ success: true, data: null });

      await promise;
      httpMock.verify();
    });

    it('resolves without throwing on a successful reset', async () => {
      const { service, httpMock } = setup();

      const promise = service.resetPassword('reset-token-abc', 'new-password', 'cf-token');
      httpMock.expectOne('/api/auth/reset-password').flush({ success: true, data: null });

      await expect(promise).resolves.not.toThrow();
      httpMock.verify();
    });

    it('throws when the server responds with an error status (invalid token)', async () => {
      const { service, httpMock } = setup();

      const promise = service.resetPassword('expired-token', 'new-password', 'cf-token');
      httpMock
        .expectOne('/api/auth/reset-password')
        .flush(
          {
            success: false,
            error: { message: 'Invalid or expired reset token', code: 'INVALID_RESET_TOKEN' },
          },
          { status: 400, statusText: 'Bad Request' },
        );

      await expect(promise).rejects.toThrow();
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  describe('getAccessToken()', () => {
    it('returns null initially', () => {
      const { service } = setup();
      expect(service.getAccessToken()).toBeNull();
    });

    it('returns the token after a successful login', async () => {
      const { service, httpMock } = setup();
      await loginService(service, httpMock);

      expect(service.getAccessToken()).toBe('test-access-token');
    });

    it('returns null after logout', async () => {
      const { service, httpMock } = setup();
      await loginService(service, httpMock);

      service.logout();
      httpMock.expectOne('/api/auth/logout').flush({});

      expect(service.getAccessToken()).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe('getAuthHeaders()', () => {
    it('returns an empty object when unauthenticated', () => {
      const { service } = setup();
      expect(service.getAuthHeaders()).toEqual({});
    });

    it('returns an Authorization Bearer header when authenticated', async () => {
      const { service, httpMock } = setup();
      await loginService(service, httpMock);

      expect(service.getAuthHeaders()).toEqual({
        Authorization: 'Bearer test-access-token',
      });
    });

    it('returns an empty object again after logout', async () => {
      const { service, httpMock } = setup();
      await loginService(service, httpMock);

      service.logout();
      httpMock.expectOne('/api/auth/logout').flush({});

      expect(service.getAuthHeaders()).toEqual({});
    });
  });
});
