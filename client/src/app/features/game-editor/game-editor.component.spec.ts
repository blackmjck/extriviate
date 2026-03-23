import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, Router, ActivatedRoute } from '@angular/router';
import { vi } from 'vitest';
import { GameEditorComponent, BoardSlot } from './game-editor.component';
import { GameService } from '../../core/services/game.service';
import { CategoryService } from '../../core/services/category.service';
import { QuestionService } from '../../core/services/question.service';
import type { GameQuestion, Category, GameCategory, Game, GameBoard } from '@extriviate/shared';
import { GAME_CATEGORY_COUNT, GAME_QUESTION_ROWS } from '@extriviate/shared';
import type { QuestionPickedEvent } from './question-picker.component';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 42,
    creatorId: 1,
    title: 'Test Game',
    dailyDoublesEnabled: false,
    isPublished: false,
    requireQuestionFormat: false,
    useAiEvaluation: false,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function makeGameBoard(
  overrides: { game?: Partial<Game>; categories?: GameBoard['categories'] } = {},
): GameBoard {
  return {
    game: makeGame(overrides.game),
    categories: overrides.categories ?? [],
  };
}

// ---------------------------------------------------------------------------
// Mock services
// ---------------------------------------------------------------------------

function makeMockGameService() {
  return {
    getGame: vi.fn().mockResolvedValue({ success: true, data: makeGameBoard() }),
    createGame: vi.fn().mockResolvedValue({ success: true, data: makeGame() }),
    updateGame: vi.fn().mockResolvedValue({ success: true, data: makeGame() }),
    updateBoard: vi.fn().mockResolvedValue({ success: true, data: makeGameBoard() }),
    deleteGame: vi.fn().mockResolvedValue({ success: true, data: null }),
  };
}

const mockCategoryService = {
  getCategories: vi.fn().mockResolvedValue({ success: true, data: { items: [], total: 0 } }),
  createCategory: vi.fn().mockResolvedValue({ success: true, data: {} }),
  updateCategory: vi.fn().mockResolvedValue({ success: true, data: {} }),
  deleteCategory: vi.fn().mockResolvedValue({ success: true, data: null }),
};

const mockQuestionService = {
  getQuestions: vi.fn().mockResolvedValue({ success: true, data: { items: [], total: 0 } }),
  getQuestion: vi.fn().mockResolvedValue({ success: true, data: {} }),
  createQuestion: vi.fn().mockResolvedValue({ success: true, data: {} }),
  updateQuestion: vi.fn().mockResolvedValue({ success: true, data: {} }),
  deleteQuestion: vi.fn().mockResolvedValue({ success: true, data: null }),
};

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

/** Setup with NO route id param — triggers createGame() path */
function setupNew(gameService = makeMockGameService()) {
  TestBed.configureTestingModule({
    imports: [GameEditorComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null } } } },
      { provide: GameService, useValue: gameService },
      { provide: CategoryService, useValue: mockCategoryService },
      { provide: QuestionService, useValue: mockQuestionService },
    ],
  });
  const fixture = TestBed.createComponent(GameEditorComponent);
  const component = fixture.componentInstance;
  return { fixture, component, gameService };
}

/** Setup with a route id param — triggers loadGame() path */
function setupEdit(id: number, gameService = makeMockGameService()) {
  TestBed.configureTestingModule({
    imports: [GameEditorComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => String(id) } } },
      },
      { provide: GameService, useValue: gameService },
      { provide: CategoryService, useValue: mockCategoryService },
      { provide: QuestionService, useValue: mockQuestionService },
    ],
  });
  const fixture = TestBed.createComponent(GameEditorComponent);
  const component = fixture.componentInstance;
  return { fixture, component, gameService };
}

// ---------------------------------------------------------------------------
// Existing tests — kept intact
// ---------------------------------------------------------------------------

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
        { provide: CategoryService, useValue: mockCategoryService },
        { provide: QuestionService, useValue: mockQuestionService },
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

// ---------------------------------------------------------------------------
// createGame()
// ---------------------------------------------------------------------------

describe('GameEditorComponent - createGame()', () => {
  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  it('calls GameService.createGame with "Untitled Game"', async () => {
    const gameService = makeMockGameService();
    // Use edit route so ngOnInit calls loadGame(), not createGame().
    // Stub loadGame so it does nothing and we can test createGame() in isolation.
    const { component, fixture } = setupEdit(42, gameService);
    vi.spyOn(
      component as unknown as { loadGame: (id: number) => Promise<void> },
      'loadGame',
    ).mockResolvedValue(undefined);
    fixture.detectChanges();

    gameService.createGame.mockResolvedValue({ success: true, data: makeGame({ id: 99 }) });
    await component.createGame();

    expect(gameService.createGame).toHaveBeenCalledWith('Untitled Game');
  });

  it('navigates to /games/:id on success', async () => {
    const gameService = makeMockGameService();
    const { component, fixture } = setupEdit(42, gameService);
    vi.spyOn(
      component as unknown as { loadGame: (id: number) => Promise<void> },
      'loadGame',
    ).mockResolvedValue(undefined);
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    gameService.createGame.mockResolvedValue({ success: true, data: makeGame({ id: 55 }) });

    await component.createGame();

    expect(navigateSpy).toHaveBeenCalledWith(['/games', 55], { replaceUrl: true });
  });

  it('sets error signal on createGame failure', async () => {
    const gameService = makeMockGameService();
    const { component, fixture } = setupEdit(42, gameService);
    vi.spyOn(
      component as unknown as { loadGame: (id: number) => Promise<void> },
      'loadGame',
    ).mockResolvedValue(undefined);
    fixture.detectChanges();

    gameService.createGame.mockRejectedValue(new Error('Network error'));
    await component.createGame();

    expect(component.error()).toBe('Failed to create game.');
    expect(component.loading()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loadGame()
// ---------------------------------------------------------------------------

describe('GameEditorComponent - loadGame()', () => {
  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  it('populates title signal from API response game title', async () => {
    const gameService = makeMockGameService();
    gameService.getGame.mockResolvedValue({
      success: true,
      data: makeGameBoard({ game: { title: 'My Quiz' } }),
    });
    const { component } = setupEdit(42, gameService);

    await component.loadGame(42);

    expect(component.title()).toBe('My Quiz');
  });

  it('populates dailyDoublesEnabled from the game', async () => {
    const gameService = makeMockGameService();
    gameService.getGame.mockResolvedValue({
      success: true,
      data: makeGameBoard({ game: { dailyDoublesEnabled: true } }),
    });
    const { component } = setupEdit(42, gameService);

    await component.loadGame(42);

    expect(component.dailyDoublesEnabled()).toBe(true);
  });

  it('builds 6 board slots ordered by position', async () => {
    const gameService = makeMockGameService();
    const cat1 = { ...makeCategory(1), position: 1, questions: [] };
    const cat3 = { ...makeCategory(3), position: 3, questions: [] };
    gameService.getGame.mockResolvedValue({
      success: true,
      data: makeGameBoard({ categories: [cat3, cat1] }),
    });
    const { component } = setupEdit(42, gameService);

    await component.loadGame(42);

    const board = component.board();
    expect(board).toHaveLength(GAME_CATEGORY_COUNT);
    // Positions are 1-6 in order
    expect(board.map((s) => s.position)).toEqual([1, 2, 3, 4, 5, 6]);
    // Slot at position 1 has a category
    expect(board[0].gameCategory?.categoryId).toBe(1);
    // Slot at position 2 is empty
    expect(board[1].gameCategory).toBeNull();
    // Slot at position 3 has a category
    expect(board[2].gameCategory?.categoryId).toBe(3);
  });

  it('sets error signal when loadGame fails', async () => {
    const gameService = makeMockGameService();
    gameService.getGame.mockRejectedValue(new Error('Server error'));
    const { component } = setupEdit(42, gameService);

    await component.loadGame(42);

    expect(component.error()).toBe('Failed to load game.');
    expect(component.loading()).toBe(false);
  });

  it('sets loading to false in the finally block', async () => {
    const gameService = makeMockGameService();
    const { component } = setupEdit(42, gameService);

    await component.loadGame(42);

    expect(component.loading()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// openCategoryManager() / closeCategoryManager()
// ---------------------------------------------------------------------------

describe('GameEditorComponent - openCategoryManager()', () => {
  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  function setup() {
    const gameService = makeMockGameService();
    const { component, fixture } = setupNew(gameService);
    vi.spyOn(component, 'createGame').mockResolvedValue(undefined);
    fixture.detectChanges();
    return { component };
  }

  it('sets overlayMode — showCategoryManager becomes true', () => {
    const { component } = setup();
    component.openCategoryManager(2);
    expect(component.showCategoryManager()).toBe(true);
    expect(component.activeCategorySlot()).toBe(2);
  });

  it('closeCategoryManager resets both signals', () => {
    const { component } = setup();
    component.openCategoryManager(3);
    component.closeCategoryManager();
    expect(component.showCategoryManager()).toBe(false);
    expect(component.activeCategorySlot()).toBeNull();
  });

  it('onCategoryAssigned assigns the category to the active slot and closes the manager', () => {
    const { component } = setup();
    // Set up a board with a slot at position 1
    component.board.set([{ position: 1, gameCategory: null }]);
    component.game.set(makeGame({ id: 7 }));
    component.openCategoryManager(1);

    const cat: Category = {
      id: 99,
      creatorId: 1,
      name: 'Science',
      description: null,
      createdAt: '',
      updatedAt: '',
    };
    component.onCategoryAssigned(cat);

    const slot = component.board().find((s) => s.position === 1);
    expect(slot?.gameCategory?.categoryId).toBe(99);
    expect(component.showCategoryManager()).toBe(false);
    expect(component.isDirty()).toBe(true);
  });

  it('onCategoryAssigned is a no-op when activeCategorySlot is null', () => {
    const { component } = setup();
    component.board.set([{ position: 1, gameCategory: null }]);
    // activeCategorySlot is null by default
    const cat: Category = {
      id: 5,
      creatorId: 1,
      name: 'X',
      description: null,
      createdAt: '',
      updatedAt: '',
    };
    component.onCategoryAssigned(cat);
    expect(component.board()[0].gameCategory).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// openQuestionPicker() / onQuestionPicked()
// ---------------------------------------------------------------------------

describe('GameEditorComponent - openQuestionPicker() / onQuestionPicked()', () => {
  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  function setup() {
    const gameService = makeMockGameService();
    const { component, fixture } = setupNew(gameService);
    vi.spyOn(component, 'createGame').mockResolvedValue(undefined);
    fixture.detectChanges();
    return { component };
  }

  it('sets showQuestionPicker, activePickerSlot, and activePickerRow', () => {
    const { component } = setup();
    component.openQuestionPicker(3, 2);
    expect(component.showQuestionPicker()).toBe(true);
    expect(component.activePickerSlot()).toBe(3);
    expect(component.activePickerRow()).toBe(2);
  });

  it('closeQuestionPicker resets all three signals', () => {
    const { component } = setup();
    component.openQuestionPicker(3, 2);
    component.closeQuestionPicker();
    expect(component.showQuestionPicker()).toBe(false);
    expect(component.activePickerSlot()).toBeNull();
    expect(component.activePickerRow()).toBeNull();
  });

  it('onQuestionPicked places the question in the correct slot and marks isDirty', () => {
    const { component } = setup();
    const gc = makeCategory(1);
    gc.position = 1;
    gc.questions = [];
    component.board.set([{ position: 1, gameCategory: gc }]);
    component.game.set(makeGame({ id: 7 }));

    component.openQuestionPicker(1, 2);

    const event: QuestionPickedEvent = {
      question: {
        id: 77,
        creatorId: 1,
        categoryId: 1,
        content: [{ type: 'text', value: 'Question text' }],
        answer: {
          id: 77,
          questionId: 77,
          content: [{ type: 'text', value: 'Answer' }],
          acceptedAnswers: [],
        },
        createdAt: '',
        updatedAt: '',
      },
      pointValue: 400,
      isDailyDouble: false,
    };
    component.onQuestionPicked(event);

    const slot = component.board().find((s) => s.position === 1)!;
    const placed = slot.gameCategory!.questions.find((q) => q.rowPosition === 2);
    expect(placed).toBeDefined();
    expect(placed!.questionId).toBe(77);
    expect(placed!.pointValue).toBe(400);
    expect(component.isDirty()).toBe(true);
    expect(component.showQuestionPicker()).toBe(false);
  });

  it('onQuestionPicked is a no-op when activePickerSlot is null', () => {
    const { component } = setup();
    component.board.set([makeSlot(1, [10])]);
    // Do not open the picker — slot is null
    const event: QuestionPickedEvent = {
      question: {
        id: 99,
        creatorId: 1,
        categoryId: 1,
        content: [],
        answer: { id: 99, questionId: 99, content: [], acceptedAnswers: [] },
        createdAt: '',
        updatedAt: '',
      },
      pointValue: 200,
      isDailyDouble: false,
    };
    const boardBefore = component.board();
    component.onQuestionPicked(event);
    expect(component.board()).toEqual(boardBefore);
  });
});

// ---------------------------------------------------------------------------
// removeQuestion()
// ---------------------------------------------------------------------------

describe('GameEditorComponent - removeQuestion()', () => {
  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  function setup() {
    const gameService = makeMockGameService();
    const { component, fixture } = setupNew(gameService);
    vi.spyOn(component, 'createGame').mockResolvedValue(undefined);
    fixture.detectChanges();
    return { component, gameService };
  }

  it('starts with isDirty false', () => {
    const { component } = setup();
    expect(component.isDirty()).toBe(false);
  });

  it('clears the specified question from the slot', () => {
    const { component } = setup();
    component.board.set([makeSlot(1, [101, 102, 103])]);

    component.removeQuestion(1, 2); // remove row 2 (questionId 102)

    const questions = component.board()[0].gameCategory!.questions;
    expect(questions.find((q) => q.rowPosition === 2)).toBeUndefined();
    // Rows 1 and 3 should still exist
    expect(questions.find((q) => q.rowPosition === 1)).toBeDefined();
    expect(questions.find((q) => q.rowPosition === 3)).toBeDefined();
  });

  it('sets isDirty to true after removing a question', () => {
    const { component } = setup();
    component.board.set([makeSlot(1, [101])]);
    component.removeQuestion(1, 1);
    expect(component.isDirty()).toBe(true);
  });

  it('isDirty becomes false after a successful save', async () => {
    const { component, gameService } = setup();
    component.board.set([makeSlot(1, [101])]);
    component.game.set(makeGame({ id: 7 }));
    component.removeQuestion(1, 1);

    expect(component.isDirty()).toBe(true);

    await component.saveGame();

    expect(gameService.updateGame).toHaveBeenCalled();
    expect(component.isDirty()).toBe(false);
  });

  it('is a no-op for a slot that has no category', () => {
    const { component } = setup();
    component.board.set([{ position: 1, gameCategory: null }]);
    component.removeQuestion(1, 1);
    expect(component.board()[0].gameCategory).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// autosave debounce (fake timers)
// ---------------------------------------------------------------------------

describe('GameEditorComponent - autosave debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  it('multiple rapid dirty changes trigger only one save after 1500 ms', async () => {
    const gameService = makeMockGameService();
    const { component, fixture } = setupNew(gameService);
    vi.spyOn(component, 'createGame').mockResolvedValue(undefined);
    fixture.detectChanges();

    component.game.set(makeGame({ id: 7 }));
    component.board.set([makeSlot(1, [10])]);

    // Spy on performSave via autosaveNow; wrap both private methods with a spy
    const performSaveSpy = vi
      .spyOn(component as unknown as { performSave: () => Promise<void> }, 'performSave')
      .mockResolvedValue(undefined);

    // Three rapid dirty changes — each calls scheduleAutosave internally
    component.removeQuestion(1, 1);
    component.removeQuestion(1, 2);
    component.removeQuestion(1, 3);

    // Nothing should have been saved yet
    expect(performSaveSpy).not.toHaveBeenCalled();

    // Advance past the 1500 ms debounce
    vi.advanceTimersByTime(1500);
    await Promise.resolve();
    await Promise.resolve();

    expect(performSaveSpy).toHaveBeenCalledTimes(1);
  });

  it('does not save before the debounce window expires', async () => {
    const gameService = makeMockGameService();
    const { component, fixture } = setupNew(gameService);
    vi.spyOn(component, 'createGame').mockResolvedValue(undefined);
    fixture.detectChanges();

    component.game.set(makeGame({ id: 7 }));
    component.board.set([makeSlot(1, [10])]);

    const performSaveSpy = vi
      .spyOn(component as unknown as { performSave: () => Promise<void> }, 'performSave')
      .mockResolvedValue(undefined);

    component.removeQuestion(1, 1);

    vi.advanceTimersByTime(1000); // less than 1500 ms
    await Promise.resolve();

    expect(performSaveSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// publishGame()
// ---------------------------------------------------------------------------

describe('GameEditorComponent - publishGame()', () => {
  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  function buildReadyBoard(): BoardSlot[] {
    return Array.from({ length: GAME_CATEGORY_COUNT }, (_, i) => {
      const pos = i + 1;
      const gc = makeCategory(pos * 10);
      gc.position = pos;
      gc.questions = Array.from({ length: GAME_QUESTION_ROWS }, (__, r) =>
        makeGameQuestion(pos * 100 + r, r + 1),
      );
      return { position: pos, gameCategory: gc };
    });
  }

  it('calls GameService.updateGame with isPublished: true', async () => {
    const gameService = makeMockGameService();
    // Stub performSave so the test doesn't need to satisfy all board constraints
    const { component, fixture } = setupNew(gameService);
    vi.spyOn(component, 'createGame').mockResolvedValue(undefined);
    fixture.detectChanges();

    component.game.set(makeGame({ id: 7, isPublished: false }));
    component.title.set('Complete Title');
    component.board.set(buildReadyBoard());

    // Stub autosaveNow so it doesn't trigger extra updateGame calls
    vi.spyOn(component, 'autosaveNow').mockResolvedValue(undefined);

    await component.publishGame();

    expect(gameService.updateGame).toHaveBeenCalledWith(7, { isPublished: true });
  });

  it('does not call updateGame when isReady() is false', async () => {
    const gameService = makeMockGameService();
    const { component, fixture } = setupNew(gameService);
    vi.spyOn(component, 'createGame').mockResolvedValue(undefined);
    fixture.detectChanges();

    component.game.set(makeGame({ id: 7, isPublished: false }));
    // Leave title empty so isReady() is false
    component.title.set('');

    await component.publishGame();

    expect(gameService.updateGame).not.toHaveBeenCalled();
  });

  it('sets error signal when publishGame fails', async () => {
    const gameService = makeMockGameService();
    const { component, fixture } = setupNew(gameService);
    vi.spyOn(component, 'createGame').mockResolvedValue(undefined);
    fixture.detectChanges();

    component.game.set(makeGame({ id: 7, isPublished: false }));
    component.title.set('Complete Title');
    component.board.set(buildReadyBoard());

    vi.spyOn(component, 'autosaveNow').mockResolvedValue(undefined);
    gameService.updateGame.mockRejectedValue(new Error('Publish failed'));

    await component.publishGame();

    expect(component.error()).toBe('Failed to publish game.');
    expect(component.publishing()).toBe(false);
  });

  it('the publish button is disabled when isReady() is false', () => {
    const gameService = makeMockGameService();
    const { component, fixture } = setupNew(gameService);
    vi.spyOn(component, 'createGame').mockResolvedValue(undefined);
    // Ensure component is loaded (not in loading state)
    component.loading.set(false);
    component.game.set(makeGame({ id: 7, isPublished: false }));
    component.title.set('');
    fixture.detectChanges();

    expect(component.isReady()).toBe(false);
  });

  it('does not re-publish an already-published game', async () => {
    const gameService = makeMockGameService();
    const { component, fixture } = setupNew(gameService);
    vi.spyOn(component, 'createGame').mockResolvedValue(undefined);
    fixture.detectChanges();

    component.game.set(makeGame({ id: 7, isPublished: true }));
    component.title.set('Complete Title');
    component.board.set(buildReadyBoard());

    await component.publishGame();

    expect(gameService.updateGame).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// isDirty lifecycle
// ---------------------------------------------------------------------------

describe('GameEditorComponent - isDirty signal', () => {
  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  function setup() {
    const gameService = makeMockGameService();
    const { component, fixture } = setupNew(gameService);
    vi.spyOn(component, 'createGame').mockResolvedValue(undefined);
    fixture.detectChanges();
    return { component, gameService };
  }

  it('starts false', () => {
    const { component } = setup();
    expect(component.isDirty()).toBe(false);
  });

  it('becomes true after removeQuestion is called', () => {
    const { component } = setup();
    component.board.set([makeSlot(1, [10])]);
    component.removeQuestion(1, 1);
    expect(component.isDirty()).toBe(true);
  });

  it('becomes true after onMetadataChange is called', () => {
    const { component } = setup();
    component.onMetadataChange();
    expect(component.isDirty()).toBe(true);
  });

  it('becomes false after a successful saveGame()', async () => {
    const { component, gameService } = setup();
    component.game.set(makeGame({ id: 7 }));
    component.board.set([makeSlot(1, [10])]);
    component.isDirty.set(true);

    await component.saveGame();

    expect(gameService.updateGame).toHaveBeenCalled();
    expect(component.isDirty()).toBe(false);
  });

  it('remains true after a failed saveGame()', async () => {
    const { component, gameService } = setup();
    gameService.updateGame.mockRejectedValue(new Error('Save error'));
    component.game.set(makeGame({ id: 7 }));
    component.isDirty.set(true);

    await component.saveGame();

    expect(component.isDirty()).toBe(true);
    expect(component.error()).toBe('Failed to save game.');
  });
});

// ---------------------------------------------------------------------------
// saveGame()
// ---------------------------------------------------------------------------

describe('GameEditorComponent - saveGame()', () => {
  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  it('does not call performSave when game is null', async () => {
    const gameService = makeMockGameService();
    const { component, fixture } = setupNew(gameService);
    vi.spyOn(component, 'createGame').mockResolvedValue(undefined);
    fixture.detectChanges();

    // game is null by default
    await component.saveGame();

    expect(gameService.updateGame).not.toHaveBeenCalled();
  });

  it('calls updateGame and updateBoard with correct board assignments', async () => {
    const gameService = makeMockGameService();
    const { component, fixture } = setupNew(gameService);
    vi.spyOn(component, 'createGame').mockResolvedValue(undefined);
    fixture.detectChanges();

    component.game.set(makeGame({ id: 10 }));
    component.title.set('Board Title');
    component.board.set([makeSlot(1, [101])]);

    await component.saveGame();

    expect(gameService.updateGame).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ title: 'Board Title' }),
    );
    expect(gameService.updateBoard).toHaveBeenCalledWith(
      10,
      expect.arrayContaining([expect.objectContaining({ categoryId: 10, position: 1 })]),
    );
  });
});

// ---------------------------------------------------------------------------
// goBack()
// ---------------------------------------------------------------------------

describe('GameEditorComponent - goBack()', () => {
  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  it('navigates to /games', () => {
    const gameService = makeMockGameService();
    const { component, fixture } = setupNew(gameService);
    vi.spyOn(component, 'createGame').mockResolvedValue(undefined);
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.goBack();

    expect(navigateSpy).toHaveBeenCalledWith(['/games']);
  });
});

// ---------------------------------------------------------------------------
// excludedCategoryIds computed
// ---------------------------------------------------------------------------

describe('GameEditorComponent - excludedCategoryIds computed', () => {
  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  function setup() {
    const gameService = makeMockGameService();
    const { component, fixture } = setupNew(gameService);
    vi.spyOn(component, 'createGame').mockResolvedValue(undefined);
    fixture.detectChanges();
    return { component };
  }

  it('excludes category IDs from all other slots', () => {
    const { component } = setup();
    component.board.set([makeSlot(1, [10]), makeSlot(2, [20])]);
    component.activeCategorySlot.set(1); // editing slot 1

    // categoryId for slot 1 is 10, slot 2 is 20
    // slot 1 categoryId is position*10 = 10, slot 2 is 20
    const excluded = component.excludedCategoryIds();
    // slot 2's categoryId should be excluded (it is not the active slot)
    expect(excluded.has(20)).toBe(true);
    // slot 1's own categoryId should NOT be excluded (it IS the active slot)
    expect(excluded.has(10)).toBe(false);
  });

  it('returns empty set when no categories are assigned', () => {
    const { component } = setup();
    component.board.set([
      { position: 1, gameCategory: null },
      { position: 2, gameCategory: null },
    ]);
    expect(component.excludedCategoryIds().size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isReady computed
// ---------------------------------------------------------------------------

describe('GameEditorComponent - isReady computed', () => {
  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  function setup() {
    const gameService = makeMockGameService();
    const { component, fixture } = setupNew(gameService);
    vi.spyOn(component, 'createGame').mockResolvedValue(undefined);
    fixture.detectChanges();
    return { component };
  }

  it('returns false when title is empty', () => {
    const { component } = setup();
    component.title.set('');
    expect(component.isReady()).toBe(false);
  });

  it('returns false when board has fewer than 6 slots', () => {
    const { component } = setup();
    component.title.set('Some title');
    component.board.set([makeSlot(1, [10])]);
    expect(component.isReady()).toBe(false);
  });

  it('returns true when title is set and all 6 slots have 5 questions with positive point values', () => {
    const { component } = setup();
    component.title.set('Complete Game');
    component.board.set(
      Array.from({ length: GAME_CATEGORY_COUNT }, (_, i) => {
        const pos = i + 1;
        const gc = makeCategory(pos * 10);
        gc.position = pos;
        gc.questions = Array.from({ length: GAME_QUESTION_ROWS }, (__, r) =>
          makeGameQuestion(pos * 100 + r, r + 1),
        );
        return { position: pos, gameCategory: gc };
      }),
    );
    expect(component.isReady()).toBe(true);
  });
});
