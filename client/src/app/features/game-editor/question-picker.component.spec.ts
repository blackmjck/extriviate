import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { QuestionPickerComponent, QuestionPickedEvent } from './question-picker.component';
import type { QuestionWithAnswer } from '@extriviate/shared';

function makeQuestion(id: number, categoryId = 10): QuestionWithAnswer {
  return {
    id,
    creatorId: 1,
    categoryId,
    content: [{ type: 'text', value: `Question ${id}` }],
    answer: {
      id,
      questionId: id,
      content: [{ type: 'text', value: 'Answer' }],
      acceptedAnswers: [],
    },
    createdAt: '',
    updatedAt: '',
  };
}

describe('QuestionPickerComponent', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [QuestionPickerComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(QuestionPickerComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('categoryId', 10);
    fixture.componentRef.setInput('rowPosition', 1);
    vi.spyOn(component, 'loadQuestions').mockResolvedValue(undefined);
    fixture.detectChanges();
    return { fixture, component };
  }

  afterEach(() => TestBed.resetTestingModule());

  describe('visibleQuestions', () => {
    it('returns all questions when excludedIds is empty', () => {
      const { component } = setup();
      const qs = [makeQuestion(1), makeQuestion(2), makeQuestion(3)];
      component.questions.set(qs);
      expect(component.visibleQuestions()).toEqual(qs);
    });

    it('hides the question whose ID is in excludedIds', () => {
      const { component, fixture } = setup();
      component.questions.set([makeQuestion(1), makeQuestion(2), makeQuestion(3)]);
      fixture.componentRef.setInput('excludedIds', new Set([2]));
      expect(component.visibleQuestions().map((q) => q.id)).toEqual([1, 3]);
    });

    it('hides multiple excluded questions', () => {
      const { component, fixture } = setup();
      component.questions.set([makeQuestion(1), makeQuestion(2), makeQuestion(3)]);
      fixture.componentRef.setInput('excludedIds', new Set([1, 3]));
      expect(component.visibleQuestions().map((q) => q.id)).toEqual([2]);
    });

    it('returns empty array when all questions are excluded', () => {
      const { component, fixture } = setup();
      component.questions.set([makeQuestion(1), makeQuestion(2)]);
      fixture.componentRef.setInput('excludedIds', new Set([1, 2]));
      expect(component.visibleQuestions()).toEqual([]);
    });

    it('is unaffected by IDs not present in the question list', () => {
      const { component, fixture } = setup();
      component.questions.set([makeQuestion(1), makeQuestion(2)]);
      fixture.componentRef.setInput('excludedIds', new Set([99, 100]));
      expect(component.visibleQuestions().map((q) => q.id)).toEqual([1, 2]);
    });
  });

  describe('select', () => {
    it('emits questionPicked with the question and current pointValue', () => {
      const { component } = setup();
      const q = makeQuestion(5);
      component.pointValue.set(400);
      const emitted: QuestionPickedEvent[] = [];
      component.questionPicked.subscribe((e) => emitted.push(e));
      component.select(q);
      expect(emitted.length).toBe(1);
      expect(emitted[0]).toEqual({ question: q, pointValue: 400, isDailyDouble: false });
    });
  });
});

// ---- Additional coverage tests -------------------------------------------------------

describe('QuestionPickerComponent — ngOnInit', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('sets pointValue to rowPosition * 200 on init', () => {
    TestBed.configureTestingModule({
      imports: [QuestionPickerComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(QuestionPickerComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('categoryId', 10);
    fixture.componentRef.setInput('rowPosition', 3);
    vi.spyOn(component, 'loadQuestions').mockResolvedValue(undefined);
    fixture.detectChanges();
    expect(component.pointValue()).toBe(600);
  });

  it('initialises markAsDailyDouble from currentIsDailyDouble input', () => {
    TestBed.configureTestingModule({
      imports: [QuestionPickerComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(QuestionPickerComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('categoryId', 10);
    fixture.componentRef.setInput('rowPosition', 1);
    fixture.componentRef.setInput('currentIsDailyDouble', true);
    vi.spyOn(component, 'loadQuestions').mockResolvedValue(undefined);
    fixture.detectChanges();
    expect(component.markAsDailyDouble()).toBe(true);
  });
});

describe('QuestionPickerComponent — loadQuestions (HTTP)', () => {
  function setupWithHttp() {
    TestBed.configureTestingModule({
      imports: [QuestionPickerComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    const fixture = TestBed.createComponent(QuestionPickerComponent);
    const component = fixture.componentInstance;
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('categoryId', 10);
    fixture.componentRef.setInput('rowPosition', 2);
    // Do NOT mock loadQuestions — let it run for real
    fixture.detectChanges();
    return { fixture, component, httpMock };
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('sets loading to true while the request is in flight', () => {
    const { component, httpMock } = setupWithHttp();
    // loading should be true before the request completes
    expect(component.loading()).toBe(true);
    // satisfy the pending request to avoid afterEach verify failure
    httpMock
      .expectOne((r) => r.url.includes('/api/questions'))
      .flush({ success: true, data: { items: [], total: 0 } });
    httpMock.verify();
  });

  it('populates questions and total after a successful fetch', async () => {
    const { component, httpMock } = setupWithHttp();
    const items = [makeQuestion(1), makeQuestion(2)];
    httpMock
      .expectOne((r) => r.url.includes('/api/questions'))
      .flush({ success: true, data: { items, total: 2 } });
    // firstValueFrom + async/await chain needs multiple microtask flushes
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(component.questions()).toEqual(items);
    expect(component.total()).toBe(2);
    expect(component.loading()).toBe(false);
    httpMock.verify();
  });

  it('passes the categoryId as a query parameter', () => {
    const { httpMock } = setupWithHttp();
    const req = httpMock.expectOne((r) => r.url.includes('/api/questions'));
    expect(req.request.params.get('categoryId')).toBe('10');
    req.flush({ success: true, data: { items: [], total: 0 } });
    httpMock.verify();
  });

  it('passes offset as a query parameter', () => {
    const { httpMock } = setupWithHttp();
    const req = httpMock.expectOne((r) => r.url.includes('/api/questions'));
    expect(req.request.params.get('offset')).toBe('0');
    req.flush({ success: true, data: { items: [], total: 0 } });
    httpMock.verify();
  });

  it('sets error signal and clears loading on HTTP failure', async () => {
    const { component, httpMock } = setupWithHttp();
    httpMock
      .expectOne((r) => r.url.includes('/api/questions'))
      .flush('Server error', { status: 500, statusText: 'Internal Server Error' });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(component.error()).toBe('Failed to load questions.');
    expect(component.loading()).toBe(false);
    httpMock.verify();
  });

  it('renders the loading text while loading', () => {
    const { fixture, httpMock } = setupWithHttp();
    // loading is true during the in-flight request
    fixture.detectChanges();
    const loadingEl = (fixture.nativeElement as HTMLElement).querySelector('.loading-text');
    expect(loadingEl).not.toBeNull();
    // clean up
    httpMock
      .expectOne((r) => r.url.includes('/api/questions'))
      .flush({ success: true, data: { items: [], total: 0 } });
    httpMock.verify();
  });

  it('renders the empty-state list item when there are no visible questions', async () => {
    const { fixture, httpMock } = setupWithHttp();
    httpMock
      .expectOne((r) => r.url.includes('/api/questions'))
      .flush({ success: true, data: { items: [], total: 0 } });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    const emptyEl = (fixture.nativeElement as HTMLElement).querySelector('.picker__empty');
    expect(emptyEl).not.toBeNull();
    httpMock.verify();
  });
});

describe('QuestionPickerComponent — pagination', () => {
  function setupPaged() {
    TestBed.configureTestingModule({
      imports: [QuestionPickerComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(QuestionPickerComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('categoryId', 10);
    fixture.componentRef.setInput('rowPosition', 1);
    vi.spyOn(component, 'loadQuestions').mockResolvedValue(undefined);
    fixture.detectChanges();
    return { fixture, component };
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('hasPrev returns false when offset is 0', () => {
    const { component } = setupPaged();
    component.offset.set(0);
    expect(component.hasPrev()).toBe(false);
  });

  it('hasPrev returns true when offset is greater than 0', () => {
    const { component } = setupPaged();
    component.offset.set(8);
    expect(component.hasPrev()).toBe(true);
  });

  it('hasNext returns false when all items fit on the current page', () => {
    const { component } = setupPaged();
    component.offset.set(0);
    component.total.set(5);
    expect(component.hasNext()).toBe(false);
  });

  it('hasNext returns true when there are more items beyond the current page', () => {
    const { component } = setupPaged();
    component.offset.set(0);
    component.total.set(20);
    expect(component.hasNext()).toBe(true);
  });

  it('currentPage returns 1 for offset 0', () => {
    const { component } = setupPaged();
    component.offset.set(0);
    expect(component.currentPage()).toBe(1);
  });

  it('currentPage returns 2 for offset 8 (PAGE_SIZE = 8)', () => {
    const { component } = setupPaged();
    component.offset.set(8);
    expect(component.currentPage()).toBe(2);
  });

  it('totalPages returns the ceiling of total / PAGE_SIZE', () => {
    const { component } = setupPaged();
    component.total.set(17);
    expect(component.totalPages()).toBe(3); // ceil(17/8) = 3
  });

  it('nextPage increments offset by PAGE_SIZE and calls loadQuestions', () => {
    const { component } = setupPaged();
    component.offset.set(0);
    component.nextPage();
    expect(component.offset()).toBe(8);
    expect(component.loadQuestions).toHaveBeenCalledTimes(2); // once on init + once on nextPage
  });

  it('prevPage decrements offset by PAGE_SIZE and calls loadQuestions', () => {
    const { component } = setupPaged();
    component.offset.set(16);
    component.prevPage();
    expect(component.offset()).toBe(8);
    expect(component.loadQuestions).toHaveBeenCalledTimes(2);
  });

  it('prevPage does not go below 0', () => {
    const { component } = setupPaged();
    component.offset.set(4);
    component.prevPage();
    expect(component.offset()).toBe(0);
  });
});

describe('QuestionPickerComponent — onDailyDoubleChange', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  function setupDD() {
    TestBed.configureTestingModule({
      imports: [QuestionPickerComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(QuestionPickerComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('categoryId', 10);
    fixture.componentRef.setInput('rowPosition', 1);
    vi.spyOn(component, 'loadQuestions').mockResolvedValue(undefined);
    fixture.detectChanges();
    return { component };
  }

  it('sets markAsDailyDouble signal and emits dailyDoubleToggled', () => {
    const { component } = setupDD();
    const emitted: boolean[] = [];
    component.dailyDoubleToggled.subscribe((v) => emitted.push(v));
    component.onDailyDoubleChange(true);
    expect(component.markAsDailyDouble()).toBe(true);
    expect(emitted).toEqual([true]);
  });

  it('emits false when daily double is turned off', () => {
    const { component } = setupDD();
    component.markAsDailyDouble.set(true);
    const emitted: boolean[] = [];
    component.dailyDoubleToggled.subscribe((v) => emitted.push(v));
    component.onDailyDoubleChange(false);
    expect(component.markAsDailyDouble()).toBe(false);
    expect(emitted).toEqual([false]);
  });
});

describe('QuestionPickerComponent — select with dailyDouble', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  function setupSelect(canMarkDailyDouble: boolean, markAsDailyDouble: boolean) {
    TestBed.configureTestingModule({
      imports: [QuestionPickerComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(QuestionPickerComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('categoryId', 10);
    fixture.componentRef.setInput('rowPosition', 1);
    fixture.componentRef.setInput('canMarkDailyDouble', canMarkDailyDouble);
    vi.spyOn(component, 'loadQuestions').mockResolvedValue(undefined);
    fixture.detectChanges();
    component.markAsDailyDouble.set(markAsDailyDouble);
    return { component };
  }

  it('emits isDailyDouble: true when canMarkDailyDouble and markAsDailyDouble are both true', () => {
    const { component } = setupSelect(true, true);
    const emitted: QuestionPickedEvent[] = [];
    component.questionPicked.subscribe((e) => emitted.push(e));
    component.select(makeQuestion(7));
    expect(emitted[0].isDailyDouble).toBe(true);
  });

  it('emits isDailyDouble: false when canMarkDailyDouble is false even if markAsDailyDouble is true', () => {
    const { component } = setupSelect(false, true);
    const emitted: QuestionPickedEvent[] = [];
    component.questionPicked.subscribe((e) => emitted.push(e));
    component.select(makeQuestion(7));
    expect(emitted[0].isDailyDouble).toBe(false);
  });
});

describe('QuestionPickerComponent — questionPreview', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  function setupPreview() {
    TestBed.configureTestingModule({
      imports: [QuestionPickerComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(QuestionPickerComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('categoryId', 10);
    fixture.componentRef.setInput('rowPosition', 1);
    vi.spyOn(component, 'loadQuestions').mockResolvedValue(undefined);
    fixture.detectChanges();
    return { component };
  }

  it.each([
    [
      'text block',
      {
        id: 1,
        creatorId: 1,
        categoryId: 1,
        content: [{ type: 'text' as const, value: 'Hello world' }],
        answer: { id: 1, questionId: 1, content: [], acceptedAnswers: [] },
        createdAt: '',
        updatedAt: '',
      },
      'Hello world',
    ],
    [
      'empty text block',
      {
        id: 1,
        creatorId: 1,
        categoryId: 1,
        content: [{ type: 'text' as const, value: '' }],
        answer: { id: 1, questionId: 1, content: [], acceptedAnswers: [] },
        createdAt: '',
        updatedAt: '',
      },
      '(empty)',
    ],
    [
      'image block',
      {
        id: 1,
        creatorId: 1,
        categoryId: 1,
        content: [{ type: 'image' as const, value: 'https://img' }],
        answer: { id: 1, questionId: 1, content: [], acceptedAnswers: [] },
        createdAt: '',
        updatedAt: '',
      },
      '[image]',
    ],
    [
      'video block',
      {
        id: 1,
        creatorId: 1,
        categoryId: 1,
        content: [{ type: 'video' as const, value: 'https://vid' }],
        answer: { id: 1, questionId: 1, content: [], acceptedAnswers: [] },
        createdAt: '',
        updatedAt: '',
      },
      '[video]',
    ],
    [
      'no content blocks',
      {
        id: 1,
        creatorId: 1,
        categoryId: 1,
        content: [],
        answer: { id: 1, questionId: 1, content: [], acceptedAnswers: [] },
        createdAt: '',
        updatedAt: '',
      },
      '(no content)',
    ],
  ])('returns correct preview for %s', (_label, question, expected) => {
    const { component } = setupPreview();
    expect(component.questionPreview(question as QuestionWithAnswer)).toBe(expected);
  });

  it('truncates text preview to 90 characters', () => {
    const { component } = setupPreview();
    const longText = 'A'.repeat(100);
    const q: QuestionWithAnswer = {
      id: 1,
      creatorId: 1,
      categoryId: 1,
      content: [{ type: 'text', value: longText }],
      answer: { id: 1, questionId: 1, content: [], acceptedAnswers: [] },
      createdAt: '',
      updatedAt: '',
    };
    expect(component.questionPreview(q)).toHaveLength(90);
  });
});

describe('QuestionPickerComponent — createNew', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('navigates to /questions/new with the categoryId as a query param', () => {
    TestBed.configureTestingModule({
      imports: [QuestionPickerComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(QuestionPickerComponent);
    const component = fixture.componentInstance;
    const router = TestBed.inject(Router);
    fixture.componentRef.setInput('categoryId', 42);
    fixture.componentRef.setInput('rowPosition', 1);
    vi.spyOn(component, 'loadQuestions').mockResolvedValue(undefined);
    fixture.detectChanges();

    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.createNew();
    expect(navigateSpy).toHaveBeenCalledWith(['/questions', 'new'], {
      queryParams: { categoryId: 42 },
    });
  });
});
