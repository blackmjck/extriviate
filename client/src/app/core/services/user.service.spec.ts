import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { UserService } from './user.service';
import { AuthService } from './auth.service';

const mockAuth = { getAuthHeaders: () => ({}) };

const USER = { id: 1, displayName: 'Alice', role: 'creator' as const, createdAt: '' };
const STATS = { gamesCreated: 3, categoriesCreated: 5, questionsCreated: 12, sessionsPlayed: 7 };

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuthService, useValue: mockAuth },
    ],
  });

  const service = TestBed.inject(UserService);
  const httpMock = TestBed.inject(HttpTestingController);
  return { service, httpMock };
}

describe('UserService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('updateProfile', () => {
    it('PATCHes /api/users/me with the body', async () => {
      const { service, httpMock } = setup();

      const body = { displayName: 'Bob' };
      const promise = service.updateProfile(body);
      const req = httpMock.expectOne(
        (r) => r.method === 'PATCH' && r.url.includes('/api/users/me'),
      );
      expect(req.request.body).toMatchObject(body);
      req.flush({ success: true, data: { ...USER, displayName: 'Bob' } });
      const result = await promise;

      expect(result.data.displayName).toBe('Bob');
      httpMock.verify();
    });

    it('propagates errors', async () => {
      const { service, httpMock } = setup();

      const promise = service.updateProfile({ displayName: 'Bob' });
      httpMock
        .expectOne((r) => r.url.includes('/api/users/me'))
        .flush('Error', { status: 500, statusText: 'Error' });

      await expect(promise).rejects.toThrow();
      httpMock.verify();
    });
  });

  describe('getStats', () => {
    it('GETs /api/users/me/stats', async () => {
      const { service, httpMock } = setup();

      const promise = service.getStats();
      const req = httpMock.expectOne(
        (r) => r.method === 'GET' && r.url.includes('/api/users/me/stats'),
      );
      req.flush({ success: true, data: STATS });
      const result = await promise;

      expect(result.data).toEqual(STATS);
      httpMock.verify();
    });

    it('propagates errors', async () => {
      const { service, httpMock } = setup();

      const promise = service.getStats();
      httpMock
        .expectOne((r) => r.url.includes('/api/users/me/stats'))
        .flush('Error', { status: 500, statusText: 'Error' });

      await expect(promise).rejects.toThrow();
      httpMock.verify();
    });
  });
});
