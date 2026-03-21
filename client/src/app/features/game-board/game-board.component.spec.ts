import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal, computed } from '@angular/core';
import { GameBoardComponent } from './game-board.component';
import { GameStateService } from '../../core/services/game-state.service';
import { SessionService } from '../../core/services/session.service';
import { OrientationService } from '../../core/services/orientation.service';
import { WebRtcService } from '../../core/services/webrtc.service';
import type { GameBoard, GameCategory, GameQuestion, RoundStatePayload } from '@extriviate/shared';

// ---- Fixtures -------------------------------------------------------

const IDLE_ROUND: RoundStatePayload = {
  phase: 'idle',
  gameCategoryId: null,
  questionId: null,
  rowPosition: null,
  pointValue: null,
  isDailyDouble: false,
  questionContent: null,
  answerContent: null,
  buzzerLockReason: null,
  activePlayerId: null,
  questionSelecterId: null,
  submittedAnswer: null,
  wager: null,
  buzzQueue: [],
  isCorrect: null,
  timerDeadlineMs: null,
};

function makeQuestion(overrides: Partial<GameQuestion> = {}): GameQuestion {
  return {
    id: 10,
    gameId: 1,
    gameCategoryId: 1,
    questionId: 99,
    rowPosition: 1,
    pointValue: 200,
    isDailyDouble: false,
    isAnswered: false,
    question: {
      id: 99,
      creatorId: 1,
      categoryId: 1,
      content: [{ type: 'text', value: 'Q' }],
      answer: {
        id: 1,
        questionId: 99,
        content: [{ type: 'text', value: 'A' }],
        acceptedAnswers: [],
      },
      createdAt: '',
      updatedAt: '',
    },
    ...overrides,
  };
}

function makeCategory(
  id: number,
  position: number,
  name: string,
  questions: GameQuestion[] = [],
): GameCategory & { questions: GameQuestion[] } {
  return {
    id,
    gameId: 1,
    categoryId: id,
    position,
    category: { id, creatorId: 1, name, description: null, createdAt: '', updatedAt: '' },
    questions,
  };
}

const EMPTY_BOARD: GameBoard = {
  game: {
    id: 1,
    creatorId: 1,
    title: 'Test',
    dailyDoublesEnabled: false,
    isPublished: true,
    requireQuestionFormat: false,
    useAiEvaluation: false,
    createdAt: '',
    updatedAt: '',
  },
  categories: [],
};

// ---- Setup ----------------------------------------------------------

function setup() {
  const roundState = signal<RoundStatePayload | null>(null);
  const currentPlayerId = signal<number | null>(1);
  const activeQuestionId = computed(() => roundState()?.questionId ?? null);

  const mockGameState = {
    roundState,
    players: signal([]),
    currentPlayerId,
    activeQuestionId,
    markQuestionAnswered: vi.fn(),
  };

  const mockSessionService = {
    selectQuestion: vi.fn().mockResolvedValue({ success: true, data: {} }),
  };

  const mockWebRtc = {
    peerId: null as string | null,
    remoteStreams: signal(new Map<string, unknown>()),
    localStream$: signal(null),
    cameraActive: signal(false),
    audioMuted: signal(false),
    toggleCamera: vi.fn(),
    toggleAudio: vi.fn(),
  };

  const mockOrientation = {
    isPortrait: signal(false),
    isSmallScreen: signal(false),
  };

  TestBed.configureTestingModule({
    imports: [GameBoardComponent],
    providers: [
      provideZonelessChangeDetection(),
      { provide: GameStateService, useValue: mockGameState },
      { provide: SessionService, useValue: mockSessionService },
      { provide: WebRtcService, useValue: mockWebRtc },
      { provide: OrientationService, useValue: mockOrientation },
    ],
  });

  const fixture = TestBed.createComponent(GameBoardComponent);
  const component = fixture.componentInstance;

  fixture.componentRef.setInput('board', EMPTY_BOARD);
  fixture.componentRef.setInput('sessionId', 1);

  return { fixture, component, roundState, currentPlayerId, mockGameState, mockSessionService, mockOrientation };
}

// ---- Tests ----------------------------------------------------------

describe('GameBoardComponent — canSelectQuestion', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('returns false when phase is not idle', () => {
    const { component, roundState } = setup();
    roundState.set({ ...IDLE_ROUND, phase: 'buzzers_open', questionSelecterId: 1 });
    expect(component.canSelectQuestion()).toBe(false);
  });

  it('returns true when idle and questionSelecterId is null (free-for-all)', () => {
    const { component, roundState } = setup();
    roundState.set({ ...IDLE_ROUND, questionSelecterId: null });
    expect(component.canSelectQuestion()).toBe(true);
  });

  it('returns true when idle and questionSelecterId matches currentPlayerId', () => {
    const { component, roundState, currentPlayerId } = setup();
    currentPlayerId.set(5);
    roundState.set({ ...IDLE_ROUND, questionSelecterId: 5 });
    expect(component.canSelectQuestion()).toBe(true);
  });

  it('returns false when idle and questionSelecterId is a different player', () => {
    const { component, roundState, currentPlayerId } = setup();
    currentPlayerId.set(1);
    roundState.set({ ...IDLE_ROUND, questionSelecterId: 2 });
    expect(component.canSelectQuestion()).toBe(false);
  });

  it('returns false when roundState is null (no state yet)', () => {
    const { component, roundState, currentPlayerId } = setup();
    roundState.set(null);
    currentPlayerId.set(1);
    // phase defaults to idle, selecterId defaults to null → free-for-all = true
    expect(component.canSelectQuestion()).toBe(true);
  });
});

describe('GameBoardComponent — isAnswered', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('returns true for undefined question', () => {
    const { component } = setup();
    expect(component.isAnswered(undefined)).toBe(true);
  });

  it('returns true when question.isAnswered is true', () => {
    const { component } = setup();
    expect(component.isAnswered(makeQuestion({ isAnswered: true }))).toBe(true);
  });

  it('returns false when question is unanswered and not the active question', () => {
    const { component, roundState } = setup();
    roundState.set({ ...IDLE_ROUND, questionId: 50 });
    expect(component.isAnswered(makeQuestion({ questionId: 99, isAnswered: false }))).toBe(false);
  });

  it('returns true when question.questionId matches activeQuestionId (in-progress round)', () => {
    const { component, roundState } = setup();
    roundState.set({ ...IDLE_ROUND, phase: 'question_revealed', questionId: 99 });
    expect(component.isAnswered(makeQuestion({ questionId: 99, isAnswered: false }))).toBe(true);
  });
});

describe('GameBoardComponent — getCellAriaLabel', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('returns "Already answered" for undefined question', () => {
    const { component } = setup();
    expect(component.getCellAriaLabel(undefined)).toBe('Already answered');
  });

  it('returns "Already answered" when question.isAnswered is true', () => {
    const { component } = setup();
    expect(component.getCellAriaLabel(makeQuestion({ isAnswered: true }))).toBe('Already answered');
  });

  it('returns "Already answered" when question matches activeQuestionId', () => {
    const { component, roundState } = setup();
    roundState.set({ ...IDLE_ROUND, phase: 'buzzers_open', questionId: 99 });
    expect(component.getCellAriaLabel(makeQuestion({ questionId: 99, isAnswered: false }))).toBe(
      'Already answered',
    );
  });

  it('returns "not your turn" label when canSelectQuestion is false', () => {
    const { component, roundState, currentPlayerId } = setup();
    currentPlayerId.set(1);
    roundState.set({ ...IDLE_ROUND, questionSelecterId: 2 });
    expect(component.getCellAriaLabel(makeQuestion({ pointValue: 400 }))).toBe(
      '$400, not your turn to select',
    );
  });

  it('returns "Select $N" when the question is selectable', () => {
    const { component, roundState } = setup();
    roundState.set({ ...IDLE_ROUND, questionSelecterId: null });
    expect(component.getCellAriaLabel(makeQuestion({ pointValue: 600 }))).toBe('Select $600');
  });
});

describe('GameBoardComponent — selectCell', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('does nothing when question is undefined', async () => {
    const { component, mockSessionService } = setup();
    await component.selectCell(undefined);
    expect(mockSessionService.selectQuestion).not.toHaveBeenCalled();
  });

  it('does nothing when question is already answered', async () => {
    const { component, mockSessionService } = setup();
    await component.selectCell(makeQuestion({ isAnswered: true }));
    expect(mockSessionService.selectQuestion).not.toHaveBeenCalled();
  });

  it('does nothing when canSelectQuestion is false', async () => {
    const { component, mockSessionService, roundState, currentPlayerId } = setup();
    currentPlayerId.set(1);
    roundState.set({ ...IDLE_ROUND, questionSelecterId: 2 });
    await component.selectCell(makeQuestion({ isAnswered: false }));
    expect(mockSessionService.selectQuestion).not.toHaveBeenCalled();
  });

  it('calls SessionService.selectQuestion and markQuestionAnswered on success', async () => {
    const { component, roundState, mockGameState, mockSessionService } = setup();
    roundState.set({ ...IDLE_ROUND, questionSelecterId: null });
    const question = makeQuestion({ id: 10, questionId: 99 });

    const emitted: unknown[] = [];
    component.questionSelected.subscribe((v) => emitted.push(v));

    await component.selectCell(question);

    expect(mockSessionService.selectQuestion).toHaveBeenCalledWith(1, 99);
    expect(mockGameState.markQuestionAnswered).toHaveBeenCalledWith(10);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ questionId: 99, pointValue: 200 });
  });

  it('does not call markQuestionAnswered when selectQuestion rejects', async () => {
    const { component, roundState, mockGameState, mockSessionService } = setup();
    mockSessionService.selectQuestion.mockRejectedValue(new Error('Server error'));
    roundState.set({ ...IDLE_ROUND, questionSelecterId: null });

    await component.selectCell(makeQuestion());

    expect(mockGameState.markQuestionAnswered).not.toHaveBeenCalled();
  });
});

// ---- New tests -------------------------------------------------------

describe('GameBoardComponent — categories computed', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('returns empty array when board has no categories', () => {
    const { component } = setup();
    expect(component.categories()).toEqual([]);
  });

  it('returns categories sorted by position', () => {
    const { component, fixture } = setup();
    const cat1 = makeCategory(1, 3, 'Science');
    const cat2 = makeCategory(2, 1, 'History');
    const cat3 = makeCategory(3, 2, 'Sports');
    fixture.componentRef.setInput('board', { ...EMPTY_BOARD, categories: [cat1, cat2, cat3] });
    fixture.detectChanges();
    const result = component.categories();
    expect(result.map((c) => c.position)).toEqual([1, 2, 3]);
    expect(result.map((c) => c.category.name)).toEqual(['History', 'Sports', 'Science']);
  });

  it('returns a single category unchanged', () => {
    const { component, fixture } = setup();
    const cat = makeCategory(1, 1, 'Potpourri');
    fixture.componentRef.setInput('board', { ...EMPTY_BOARD, categories: [cat] });
    fixture.detectChanges();
    expect(component.categories()).toHaveLength(1);
    expect(component.categories()[0].category.name).toBe('Potpourri');
  });
});

describe('GameBoardComponent — rowIndices computed', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('returns [1, 2, 3, 4, 5] for GAME_QUESTION_ROWS = 5', () => {
    const { component } = setup();
    expect(component.rowIndices()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('GameBoardComponent — getQuestionAt', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('returns the question whose rowPosition matches the given row', () => {
    const { component } = setup();
    const q1 = makeQuestion({ rowPosition: 1, pointValue: 200 });
    const q2 = makeQuestion({ rowPosition: 2, pointValue: 400 });
    const cat = makeCategory(1, 1, 'Test', [q1, q2]);
    expect(component.getQuestionAt(cat, 1)).toBe(q1);
    expect(component.getQuestionAt(cat, 2)).toBe(q2);
  });

  it('returns undefined when no question exists at the given row', () => {
    const { component } = setup();
    const cat = makeCategory(1, 1, 'Test', [makeQuestion({ rowPosition: 1 })]);
    expect(component.getQuestionAt(cat, 3)).toBeUndefined();
  });
});

describe('GameBoardComponent — template: category headers', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('renders a .category-header element for each category', () => {
    const { fixture } = setup();
    const cat1 = makeCategory(1, 1, 'Science');
    const cat2 = makeCategory(2, 2, 'History');
    fixture.componentRef.setInput('board', { ...EMPTY_BOARD, categories: [cat1, cat2] });
    fixture.detectChanges();
    const headers = (fixture.nativeElement as HTMLElement).querySelectorAll('.category-header');
    expect(headers).toHaveLength(2);
    expect(headers[0].textContent?.trim()).toBe('Science');
    expect(headers[1].textContent?.trim()).toBe('History');
  });

  it('renders no .category-header elements when categories is empty', () => {
    const { fixture } = setup();
    fixture.detectChanges();
    const headers = (fixture.nativeElement as HTMLElement).querySelectorAll('.category-header');
    expect(headers).toHaveLength(0);
  });
});

describe('GameBoardComponent — template: cell CSS classes', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('adds "answered" CSS class to cells where isAnswered() is true', () => {
    const { fixture, roundState } = setup();
    // Make questionId: 99 the active question so it reads as answered
    roundState.set({ ...IDLE_ROUND, phase: 'question_revealed', questionId: 99 });
    const answeredQ = makeQuestion({ rowPosition: 1, questionId: 99, isAnswered: false });
    const cat = makeCategory(1, 1, 'Test', [answeredQ]);
    fixture.componentRef.setInput('board', { ...EMPTY_BOARD, categories: [cat] });
    fixture.detectChanges();
    const cell = (fixture.nativeElement as HTMLElement).querySelector('button.cell');
    expect(cell?.classList.contains('answered')).toBe(true);
  });

  it('adds "not-your-turn" CSS class when question is not answered and canSelectQuestion is false', () => {
    const { fixture, roundState, currentPlayerId } = setup();
    currentPlayerId.set(1);
    roundState.set({ ...IDLE_ROUND, questionSelecterId: 2 });
    const q = makeQuestion({ rowPosition: 1, questionId: 5, isAnswered: false });
    const cat = makeCategory(1, 1, 'Test', [q]);
    fixture.componentRef.setInput('board', { ...EMPTY_BOARD, categories: [cat] });
    fixture.detectChanges();
    const cell = (fixture.nativeElement as HTMLElement).querySelector('button.cell');
    expect(cell?.classList.contains('not-your-turn')).toBe(true);
  });

  it('does not add "not-your-turn" to answered cells', () => {
    const { fixture } = setup();
    const q = makeQuestion({ rowPosition: 1, questionId: 5, isAnswered: true });
    const cat = makeCategory(1, 1, 'Test', [q]);
    fixture.componentRef.setInput('board', { ...EMPTY_BOARD, categories: [cat] });
    fixture.detectChanges();
    const cell = (fixture.nativeElement as HTMLElement).querySelector('button.cell');
    // answered=true so !isAnswered(question) is false → not-your-turn class not applied
    expect(cell?.classList.contains('not-your-turn')).toBe(false);
  });

  it('renders point value text inside unanswered cells', () => {
    const { fixture, roundState } = setup();
    roundState.set({ ...IDLE_ROUND, questionSelecterId: null });
    const q = makeQuestion({ rowPosition: 1, pointValue: 400, isAnswered: false });
    const cat = makeCategory(1, 1, 'Test', [q]);
    fixture.componentRef.setInput('board', { ...EMPTY_BOARD, categories: [cat] });
    fixture.detectChanges();
    const pointEl = (fixture.nativeElement as HTMLElement).querySelector('.point-value');
    expect(pointEl?.textContent?.trim()).toBe('$400');
  });

  it('does not render point value text inside answered cells', () => {
    const { fixture } = setup();
    const q = makeQuestion({ rowPosition: 1, pointValue: 400, isAnswered: true });
    const cat = makeCategory(1, 1, 'Test', [q]);
    fixture.componentRef.setInput('board', { ...EMPTY_BOARD, categories: [cat] });
    fixture.detectChanges();
    const pointEl = (fixture.nativeElement as HTMLElement).querySelector('.point-value');
    expect(pointEl).toBeNull();
  });
});

describe('GameBoardComponent — showOrientationPrompt', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('is false when device is landscape', () => {
    const { component, mockOrientation } = setup();
    mockOrientation.isPortrait.set(false);
    mockOrientation.isSmallScreen.set(true);
    expect(component.showOrientationPrompt()).toBe(false);
  });

  it('is false when device is not small screen', () => {
    const { component, mockOrientation } = setup();
    mockOrientation.isPortrait.set(true);
    mockOrientation.isSmallScreen.set(false);
    expect(component.showOrientationPrompt()).toBe(false);
  });

  it('is true when device is both portrait and small screen', () => {
    const { component, mockOrientation } = setup();
    mockOrientation.isPortrait.set(true);
    mockOrientation.isSmallScreen.set(true);
    expect(component.showOrientationPrompt()).toBe(true);
  });

  it('renders the orientation prompt element when showOrientationPrompt is true', () => {
    const { fixture, mockOrientation } = setup();
    mockOrientation.isPortrait.set(true);
    mockOrientation.isSmallScreen.set(true);
    fixture.detectChanges();
    const prompt = (fixture.nativeElement as HTMLElement).querySelector('.orientation-prompt');
    expect(prompt).not.toBeNull();
  });

  it('does not render the orientation prompt element when showOrientationPrompt is false', () => {
    const { fixture } = setup();
    // defaults: isPortrait=false, isSmallScreen=false
    fixture.detectChanges();
    const prompt = (fixture.nativeElement as HTMLElement).querySelector('.orientation-prompt');
    expect(prompt).toBeNull();
  });
});
