import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { GameService } from './game.service';
import { AuthService } from './auth.service';

const mockAuth = { getAuthHeaders: () => ({}) };

const GAME = {
  id: 42,
  creatorId: 1,
  title: 'Test Game',
  dailyDoublesEnabled: false,
  isPublished: true,
  requireQuestionFormat: false,
  useAiEvaluation: false,
  createdAt: '',
  updatedAt: '',
};

const GAME_BOARD = { game: GAME, categories: [] };

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuthService, useValue: mockAuth },
    ],
  });

  const service = TestBed.inject(GameService);
  const httpMock = TestBed.inject(HttpTestingController);
  return { service, httpMock };
}

describe('GameService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('getGame', () => {
    it('GETs /api/games/:id', async () => {
      const { service, httpMock } = setup();

      const promise = service.getGame(42);
      const req = httpMock.expectOne((r) => r.method === 'GET' && r.url.includes('/api/games/42'));
      req.flush({ success: true, data: GAME_BOARD });
      const result = await promise;

      expect(result.data.game.id).toBe(42);
      httpMock.verify();
    });

    it('propagates errors', async () => {
      const { service, httpMock } = setup();

      const promise = service.getGame(99);
      httpMock
        .expectOne((r) => r.url.includes('/api/games/99'))
        .flush('Not found', { status: 404, statusText: 'Not Found' });

      await expect(promise).rejects.toThrow();
      httpMock.verify();
    });
  });

  describe('getGames', () => {
    it('GETs /api/games with offset and limit params', async () => {
      const { service, httpMock } = setup();

      const promise = service.getGames(0, 12);
      const req = httpMock.expectOne((r) => r.method === 'GET' && r.url.includes('/api/games'));
      expect(req.request.params.get('limit')).toBe('12');
      expect(req.request.params.get('offset')).toBe('0');
      req.flush({ success: true, data: { items: [GAME], total: 1 } });
      const result = await promise;

      expect(result.data.items).toHaveLength(1);
      httpMock.verify();
    });
  });

  describe('createGame', () => {
    it('POSTs /api/games with the title', async () => {
      const { service, httpMock } = setup();

      const promise = service.createGame('My Game');
      const req = httpMock.expectOne((r) => r.method === 'POST' && r.url.includes('/api/games'));
      expect(req.request.body).toMatchObject({ title: 'My Game' });
      req.flush({ success: true, data: GAME });
      await promise;
      httpMock.verify();
    });
  });

  describe('updateGame', () => {
    it('PATCHes /api/games/:id with the body', async () => {
      const { service, httpMock } = setup();

      const promise = service.updateGame(42, { title: 'New Title' });
      const req = httpMock.expectOne(
        (r) => r.method === 'PATCH' && r.url.includes('/api/games/42'),
      );
      expect(req.request.body).toMatchObject({ title: 'New Title' });
      req.flush({ success: true, data: GAME });
      await promise;
      httpMock.verify();
    });
  });

  describe('updateBoard', () => {
    it('PUTs /api/games/:id/board with categories wrapped in body', async () => {
      const { service, httpMock } = setup();

      const assignments = [{ categoryId: 1, position: 1, questions: [] }];
      const promise = service.updateBoard(42, assignments);
      const req = httpMock.expectOne(
        (r) => r.method === 'PUT' && r.url.includes('/api/games/42/board'),
      );
      expect(req.request.body).toMatchObject({ categories: assignments });
      req.flush({ success: true, data: GAME_BOARD });
      await promise;
      httpMock.verify();
    });
  });

  describe('deleteGame', () => {
    it('DELETEs /api/games/:id', async () => {
      const { service, httpMock } = setup();

      const promise = service.deleteGame(42);
      const req = httpMock.expectOne(
        (r) => r.method === 'DELETE' && r.url.includes('/api/games/42'),
      );
      req.flush({ success: true, data: null });
      await promise;
      httpMock.verify();
    });

    it('propagates errors', async () => {
      const { service, httpMock } = setup();

      const promise = service.deleteGame(42);
      httpMock
        .expectOne((r) => r.url.includes('/api/games/42'))
        .flush('Error', { status: 500, statusText: 'Server Error' });

      await expect(promise).rejects.toThrow();
      httpMock.verify();
    });
  });
});
