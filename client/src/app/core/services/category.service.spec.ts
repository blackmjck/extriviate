import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { CategoryService } from './category.service';
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

  const service = TestBed.inject(CategoryService);
  const httpMock = TestBed.inject(HttpTestingController);
  return { service, httpMock };
}

describe('CategoryService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('getCategories', () => {
    it('GETs /api/categories with default limit and offset', async () => {
      const { service, httpMock } = setup();

      const promise = service.getCategories();
      const req = httpMock.expectOne(
        (r) => r.method === 'GET' && r.url.includes('/api/categories'),
      );
      expect(req.request.params.get('limit')).toBe('20');
      expect(req.request.params.get('offset')).toBe('0');
      req.flush({ success: true, data: { items: [], total: 0 } });
      await promise;
      httpMock.verify();
    });

    it('passes custom offset and limit', async () => {
      const { service, httpMock } = setup();

      const promise = service.getCategories(20, 10);
      const req = httpMock.expectOne((r) => r.url.includes('/api/categories'));
      expect(req.request.params.get('offset')).toBe('20');
      expect(req.request.params.get('limit')).toBe('10');
      req.flush({ success: true, data: { items: [], total: 0 } });
      await promise;
      httpMock.verify();
    });
  });

  describe('createCategory', () => {
    it('POSTs to /api/categories with name and description', async () => {
      const { service, httpMock } = setup();

      const promise = service.createCategory('Science', 'Natural sciences');
      const req = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.includes('/api/categories'),
      );
      expect(req.request.body).toMatchObject({ name: 'Science', description: 'Natural sciences' });
      req.flush({ success: true, data: { id: 1, name: 'Science' } });
      await promise;
      httpMock.verify();
    });

    it('omits description when it is empty', async () => {
      const { service, httpMock } = setup();

      const promise = service.createCategory('Math');
      const req = httpMock.expectOne((r) => r.method === 'POST');
      expect(req.request.body.description).toBeUndefined();
      req.flush({ success: true, data: { id: 2, name: 'Math' } });
      await promise;
      httpMock.verify();
    });
  });

  describe('updateCategory', () => {
    it('PATCHes /api/categories/:id with the updated fields', async () => {
      const { service, httpMock } = setup();

      const promise = service.updateCategory(3, 'Biology', 'Life sciences');
      const req = httpMock.expectOne(
        (r) => r.method === 'PATCH' && r.url.includes('/api/categories/3'),
      );
      expect(req.request.body).toMatchObject({ name: 'Biology', description: 'Life sciences' });
      req.flush({ success: true, data: { id: 3, name: 'Biology' } });
      await promise;
      httpMock.verify();
    });
  });

  describe('deleteCategory', () => {
    it('DELETEs /api/categories/:id', async () => {
      const { service, httpMock } = setup();

      const promise = service.deleteCategory(3);
      const req = httpMock.expectOne(
        (r) => r.method === 'DELETE' && r.url.includes('/api/categories/3'),
      );
      req.flush({ success: true, data: null });
      await promise;
      httpMock.verify();
    });

    it('propagates errors', async () => {
      const { service, httpMock } = setup();

      const promise = service.deleteCategory(99);
      httpMock
        .expectOne((r) => r.url.includes('/api/categories/99'))
        .flush('Not found', { status: 404, statusText: 'Not Found' });

      await expect(promise).rejects.toThrow();
      httpMock.verify();
    });
  });
});
