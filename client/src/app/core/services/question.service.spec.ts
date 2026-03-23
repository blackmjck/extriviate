import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { QuestionService, DEFAULT_PAGE_SIZE } from './question.service';
import { AuthService } from './auth.service';

const mockAuth = { getAuthHeaders: () => ({}) };

const TEXT_BLOCK = { type: 'text' as const, value: 'What is the capital of France?' };
const ANSWER_BLOCK = { type: 'text' as const, value: 'Paris' };

const QUESTION = {
  id: 1,
  categoryId: 10,
  content: [TEXT_BLOCK],
  answer: {
    id: 100,
    content: [ANSWER_BLOCK],
    acceptedAnswers: ['paris'],
  },
};

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuthService, useValue: mockAuth },
    ],
  });

  const service = TestBed.inject(QuestionService);
  const httpMock = TestBed.inject(HttpTestingController);
  return { service, httpMock };
}

describe('QuestionService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('DEFAULT_PAGE_SIZE', () => {
    it('is 20', () => {
      expect(DEFAULT_PAGE_SIZE).toBe(20);
    });
  });

  describe('getQuestions', () => {
    it('GETs /api/questions with default offset, limit, and no categoryId param', async () => {
      const { service, httpMock } = setup();

      const promise = service.getQuestions(0, DEFAULT_PAGE_SIZE, null);
      const req = httpMock.expectOne((r) => r.method === 'GET' && r.url.includes('/api/questions'));
      expect(req.request.params.get('offset')).toBe('0');
      expect(req.request.params.get('limit')).toBe('20');
      expect(req.request.params.has('categoryId')).toBe(false);

      req.flush({ success: true, data: { items: [QUESTION], total: 1 } });
      const result = await promise;

      expect(result.success).toBe(true);
      httpMock.verify();
    });

    it('passes custom offset and limit', async () => {
      const { service, httpMock } = setup();

      const promise = service.getQuestions(40, 10, null);
      const req = httpMock.expectOne((r) => r.url.includes('/api/questions'));

      expect(req.request.params.get('offset')).toBe('40');
      expect(req.request.params.get('limit')).toBe('10');

      req.flush({ success: true, data: { items: [], total: 0 } });
      await promise;
      httpMock.verify();
    });

    it('includes categoryId param when a category is specified', async () => {
      const { service, httpMock } = setup();

      const promise = service.getQuestions(0, DEFAULT_PAGE_SIZE, 10);
      const req = httpMock.expectOne((r) => r.url.includes('/api/questions'));

      expect(req.request.params.get('categoryId')).toBe('10');

      req.flush({ success: true, data: { items: [QUESTION], total: 1 } });
      await promise;
      httpMock.verify();
    });

    it('omits categoryId param when null is passed', async () => {
      const { service, httpMock } = setup();

      const promise = service.getQuestions(0, DEFAULT_PAGE_SIZE, null);
      const req = httpMock.expectOne((r) => r.url.includes('/api/questions'));

      expect(req.request.params.has('categoryId')).toBe(false);

      req.flush({ success: true, data: { items: [], total: 0 } });
      await promise;
      httpMock.verify();
    });

    it('returns the flushed response', async () => {
      const { service, httpMock } = setup();

      const promise = service.getQuestions(0, DEFAULT_PAGE_SIZE, null);
      httpMock
        .expectOne((r) => r.url.includes('/api/questions'))
        .flush({ success: true, data: { items: [QUESTION], total: 1 } });

      const result = await promise;
      expect(result.data.items).toHaveLength(1);
      expect(result.data.total).toBe(1);
      httpMock.verify();
    });

    it('propagates HTTP errors', async () => {
      const { service, httpMock } = setup();

      const promise = service.getQuestions(0, DEFAULT_PAGE_SIZE, null);
      httpMock
        .expectOne((r) => r.url.includes('/api/questions'))
        .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      await expect(promise).rejects.toThrow();
      httpMock.verify();
    });
  });

  describe('getQuestion', () => {
    it('GETs /api/questions/:id', async () => {
      const { service, httpMock } = setup();

      const promise = service.getQuestion(1);
      const req = httpMock.expectOne(
        (r) => r.method === 'GET' && r.url.includes('/api/questions/1'),
      );
      req.flush({ success: true, data: QUESTION });
      const result = await promise;

      expect(result.data.id).toBe(1);
      httpMock.verify();
    });

    it('propagates HTTP errors', async () => {
      const { service, httpMock } = setup();

      const promise = service.getQuestion(999);
      httpMock
        .expectOne((r) => r.url.includes('/api/questions/999'))
        .flush('Not found', { status: 404, statusText: 'Not Found' });

      await expect(promise).rejects.toThrow();
      httpMock.verify();
    });
  });

  describe('createQuestion', () => {
    it('POSTs /api/questions with categoryId, content, and answer', async () => {
      const { service, httpMock } = setup();

      const promise = service.createQuestion(10, [TEXT_BLOCK], [ANSWER_BLOCK], ['paris']);
      const req = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.includes('/api/questions'),
      );

      expect(req.request.body).toMatchObject({
        categoryId: 10,
        content: [TEXT_BLOCK],
        answer: {
          content: [ANSWER_BLOCK],
          acceptedAnswers: ['paris'],
        },
      });

      req.flush({ success: true, data: QUESTION });
      const result = await promise;

      expect(result.success).toBe(true);
      httpMock.verify();
    });

    it('omits acceptedAnswers from the body when not provided', async () => {
      const { service, httpMock } = setup();

      const promise = service.createQuestion(10, [TEXT_BLOCK], [ANSWER_BLOCK]);
      const req = httpMock.expectOne((r) => r.method === 'POST');

      // acceptedAnswers key is present but its value is undefined, which
      // means the field is structurally included as undefined — the body should
      // not include a defined acceptedAnswers array.
      expect(req.request.body.answer.acceptedAnswers).toBeUndefined();

      req.flush({ success: true, data: QUESTION });
      await promise;
      httpMock.verify();
    });

    it('propagates HTTP errors', async () => {
      const { service, httpMock } = setup();

      const promise = service.createQuestion(10, [TEXT_BLOCK], [ANSWER_BLOCK]);
      httpMock
        .expectOne((r) => r.url.includes('/api/questions'))
        .flush('Bad Request', { status: 400, statusText: 'Bad Request' });

      await expect(promise).rejects.toThrow();
      httpMock.verify();
    });
  });

  describe('updateQuestion', () => {
    it('PATCHes /api/questions/:id with content and answer', async () => {
      const { service, httpMock } = setup();

      const updated = { type: 'text' as const, value: 'Updated question?' };
      const promise = service.updateQuestion(1, [updated], [ANSWER_BLOCK], ['paris']);
      const req = httpMock.expectOne(
        (r) => r.method === 'PATCH' && r.url.includes('/api/questions/1'),
      );

      expect(req.request.body).toMatchObject({
        content: [updated],
        answer: {
          content: [ANSWER_BLOCK],
          acceptedAnswers: ['paris'],
        },
      });

      req.flush({ success: true, data: { ...QUESTION, content: [updated] } });
      const result = await promise;

      expect(result.success).toBe(true);
      httpMock.verify();
    });

    it('omits acceptedAnswers from the body when not provided', async () => {
      const { service, httpMock } = setup();

      const promise = service.updateQuestion(1, [TEXT_BLOCK], [ANSWER_BLOCK]);
      const req = httpMock.expectOne((r) => r.method === 'PATCH');

      expect(req.request.body.answer.acceptedAnswers).toBeUndefined();

      req.flush({ success: true, data: QUESTION });
      await promise;
      httpMock.verify();
    });

    it('propagates HTTP errors', async () => {
      const { service, httpMock } = setup();

      const promise = service.updateQuestion(999, [TEXT_BLOCK], [ANSWER_BLOCK]);
      httpMock
        .expectOne((r) => r.url.includes('/api/questions/999'))
        .flush('Not found', { status: 404, statusText: 'Not Found' });

      await expect(promise).rejects.toThrow();
      httpMock.verify();
    });
  });

  describe('deleteQuestion', () => {
    it('DELETEs /api/questions/:id', async () => {
      const { service, httpMock } = setup();

      const promise = service.deleteQuestion(1);
      const req = httpMock.expectOne(
        (r) => r.method === 'DELETE' && r.url.includes('/api/questions/1'),
      );
      req.flush({ success: true, data: null });
      const result = await promise;

      expect(result.success).toBe(true);
      httpMock.verify();
    });

    it('propagates HTTP errors', async () => {
      const { service, httpMock } = setup();

      const promise = service.deleteQuestion(99);
      httpMock
        .expectOne((r) => r.url.includes('/api/questions/99'))
        .flush('Not found', { status: 404, statusText: 'Not Found' });

      await expect(promise).rejects.toThrow();
      httpMock.verify();
    });
  });
});
