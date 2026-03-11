import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { SessionService } from './session.service';
import { AuthService } from './auth.service';
import { GuestSessionService } from './guest-session.service';

const SESSION = {
  id: 5,
  gameId: 42,
  hostId: 1,
  name: 'Friday Night Trivia',
  joinCode: 'ABC123',
  status: 'lobby' as const,
  mode: 'computer_hosted' as const,
  turnBased: false,
  playedAt: '',
  endedAt: null,
};

const PLAYER = {
  id: 1,
  sessionId: 5,
  userId: null,
  displayName: 'Alice',
  finalScore: 0,
  rank: null,
};

function setup(token: string | null = 'jwt-token', guestToken: string | null = null) {
  const mockAuth = {
    getAuthHeaders: () => (token ? { Authorization: `Bearer ${token}` } : {}),
    getAccessToken: () => token,
  };
  const mockGuest = { getToken: () => guestToken };

  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuthService, useValue: mockAuth },
      { provide: GuestSessionService, useValue: mockGuest },
    ],
  });

  const service = TestBed.inject(SessionService);
  const httpMock = TestBed.inject(HttpTestingController);
  return { service, httpMock };
}

describe('SessionService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('getSession', () => {
    it('GETs /api/sessions/:joinCode with no auth header', async () => {
      const { service, httpMock } = setup();

      const promise = service.getSession('ABC123');
      const req = httpMock.expectOne((r) =>
        r.method === 'GET' && r.url.includes('/api/sessions/ABC123'),
      );
      req.flush({ success: true, data: SESSION });
      const result = await promise;

      expect(result.data.joinCode).toBe('ABC123');
      httpMock.verify();
    });
  });

  describe('createSession', () => {
    it('POSTs /api/sessions with the body', async () => {
      const { service, httpMock } = setup();

      const body = { gameId: 42, name: 'Trivia', mode: 'computer_hosted' as const, turnBased: false };
      const promise = service.createSession(body);
      const req = httpMock.expectOne((r) => r.method === 'POST' && r.url.includes('/api/sessions'));
      expect(req.request.body).toMatchObject(body);
      req.flush({ success: true, data: SESSION });
      await promise;
      httpMock.verify();
    });
  });

  describe('joinSession', () => {
    it('POSTs /api/sessions/:id/join with the body', async () => {
      const { service, httpMock } = setup();

      const body = { method: 'guest' as const, displayName: 'Bob' };
      const promise = service.joinSession(5, body);
      const req = httpMock.expectOne((r) =>
        r.method === 'POST' && r.url.includes('/api/sessions/5/join'),
      );
      expect(req.request.body).toMatchObject(body);
      req.flush({ success: true, data: { player: PLAYER, session: SESSION, tokens: null } });
      await promise;
      httpMock.verify();
    });
  });

  describe('updateStatus', () => {
    it('PATCHes /api/sessions/:id/status with { status }', async () => {
      const { service, httpMock } = setup();

      const promise = service.updateStatus(5, 'active');
      const req = httpMock.expectOne((r) =>
        r.method === 'PATCH' && r.url.includes('/api/sessions/5/status'),
      );
      expect(req.request.body).toMatchObject({ status: 'active' });
      req.flush({ success: true, data: { ...SESSION, status: 'active' } });
      await promise;
      httpMock.verify();
    });
  });

  describe('selectQuestion', () => {
    it('POSTs /api/sessions/:id/questions/:questionId/select', async () => {
      const { service, httpMock } = setup();

      const promise = service.selectQuestion(5, 99);
      const req = httpMock.expectOne((r) =>
        r.method === 'POST' && r.url.includes('/api/sessions/5/questions/99/select'),
      );
      req.flush({ success: true, data: {} });
      await promise;
      httpMock.verify();
    });

    it('uses guest token when no JWT is present', async () => {
      const { service, httpMock } = setup(null, 'guest-token-abc');

      const promise = service.selectQuestion(5, 99);
      const req = httpMock.expectOne((r) => r.url.includes('/questions/99/select'));
      expect(req.request.headers.get('Authorization')).toBe('Bearer guest-token-abc');
      req.flush({ success: true, data: {} });
      await promise;
      httpMock.verify();
    });
  });

  describe('evaluateAnswer', () => {
    it('POSTs /api/sessions/:id/evaluate with playerId and correct', async () => {
      const { service, httpMock } = setup();

      const promise = service.evaluateAnswer(5, 3, true);
      const req = httpMock.expectOne((r) =>
        r.method === 'POST' && r.url.includes('/api/sessions/5/evaluate'),
      );
      expect(req.request.body).toMatchObject({ playerId: 3, correct: true });
      req.flush({ success: true, data: {} });
      await promise;
      httpMock.verify();
    });

    it('propagates errors', async () => {
      const { service, httpMock } = setup();

      const promise = service.evaluateAnswer(5, 3, false);
      httpMock
        .expectOne((r) => r.url.includes('/api/sessions/5/evaluate'))
        .flush('Error', { status: 500, statusText: 'Error' });

      await expect(promise).rejects.toThrow();
      httpMock.verify();
    });
  });
});
