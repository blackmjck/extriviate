import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { GameEditorComponent, BoardSlot } from './game-editor.component';
import { GameService } from '../../core/services/game.service';
import type { GameQuestion, Category, GameCategory } from '@extriviate/shared';

function makeCategory(id: number): GameCategory & { questions: GameQuestion[] } {
  const cat: Category = {
    id,
    creatorId: 1,
    name: `Category ${id}`,
    description: null,
    createdAt: '',
    updatedAt: '',
  };
  return { id, gameId: 1, categoryId: id, position: 1, category: cat, questions: [] };
}

function makeGameQuestion(questionId: number, rowPosition: number): GameQuestion {
  return {
    id: 0,
    gameId: 1,
    gameCategoryId: 0,
    questionId,
    rowPosition,
    pointValue: rowPosition * 200,
    isDailyDouble: false,
    isAnswered: false,
    question: {
      id: questionId,
      creatorId: 1,
      categoryId: 10,
      content: [{ type: 'text', value: `Q${questionId}` }],
      answer: {
        id: questionId,
        questionId,
        content: [{ type: 'text', value: 'A' }],
        acceptedAnswers: [],
      },
      createdAt: '',
      updatedAt: '',
    },
  };
}

function makeSlot(position: number, questionIds: number[] = []): BoardSlot {
  if (questionIds.length === 0) return { position, gameCategory: null };
  const gc = makeCategory(position * 10);
  gc.position = position;
  gc.questions = questionIds.map((qid, i) => makeGameQuestion(qid, i + 1));
  return { position, gameCategory: gc };
}

const mockGameService = {
  getGame: vi.fn().mockResolvedValue({ success: true, data: { game: {}, categories: [] } }),
  createGame: vi.fn().mockResolvedValue({ success: true, data: { id: 1 } }),
  updateGame: vi.fn().mockResolvedValue({ success: true, data: {} }),
  updateBoard: vi.fn().mockResolvedValue({ success: true, data: {} }),
  deleteGame: vi.fn().mockResolvedValue({ success: true, data: null }),
};

describe('GameEditorComponent - assignedQuestionIds', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [GameEditorComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null } } } },
        { provide: GameService, useValue: mockGameService },
      ],
    });
    const fixture = TestBed.createComponent(GameEditorComponent);
    const component = fixture.componentInstance;
    vi.spyOn(component, 'createGame').mockResolvedValue(undefined);
    vi.spyOn(
      component as unknown as { loadGame: () => Promise<void> },
      'loadGame',
    ).mockResolvedValue(undefined);
    fixture.detectChanges();
    return { fixture, component };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('returns an empty set when the board has no slots', () => {
    const { component } = setup();
    component.board.set([]);
    expect(component.assignedQuestionIds().size).toBe(0);
  });

  it('returns an empty set when all slots have no category assigned', () => {
    const { component } = setup();
    component.board.set([makeSlot(1), makeSlot(2), makeSlot(3)]);
    expect(component.assignedQuestionIds().size).toBe(0);
  });

  it('collects question IDs from a single slot', () => {
    const { component } = setup();
    component.board.set([makeSlot(1, [101, 102, 103])]);
    expect(component.assignedQuestionIds()).toEqual(new Set([101, 102, 103]));
  });

  it('collects question IDs from multiple slots', () => {
    const { component } = setup();
    component.board.set([makeSlot(1, [101, 102]), makeSlot(2, [201, 202]), makeSlot(3)]);
    expect(component.assignedQuestionIds()).toEqual(new Set([101, 102, 201, 202]));
  });

  it('updates reactively when the board signal changes', () => {
    const { component } = setup();
    component.board.set([makeSlot(1, [10])]);
    expect(component.assignedQuestionIds()).toEqual(new Set([10]));

    component.board.set([makeSlot(1, [10]), makeSlot(2, [20])]);
    expect(component.assignedQuestionIds()).toEqual(new Set([10, 20]));
  });
});
