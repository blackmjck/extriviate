import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
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
