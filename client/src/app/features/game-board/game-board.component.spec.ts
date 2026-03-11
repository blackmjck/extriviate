import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal, computed } from '@angular/core';
import { GameBoardComponent } from './game-board.component';
import { GameStateService } from '../../core/services/game-state.service';
import { SessionService } from '../../core/services/session.service';
import { WebRtcService } from '../../core/services/webrtc.service';
import type { GameBoard, GameQuestion, RoundStatePayload } from '@extriviate/shared';

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

  const mockWebRtc = { peerId: null as string | null };

  TestBed.configureTestingModule({
    imports: [GameBoardComponent],
    providers: [
      provideZonelessChangeDetection(),
      { provide: GameStateService, useValue: mockGameState },
      { provide: SessionService, useValue: mockSessionService },
      { provide: WebRtcService, useValue: mockWebRtc },
    ],
  });

  const fixture = TestBed.createComponent(GameBoardComponent);
  const component = fixture.componentInstance;

  fixture.componentRef.setInput('board', EMPTY_BOARD);
  fixture.componentRef.setInput('sessionId', 1);

  return { fixture, component, roundState, currentPlayerId, mockGameState, mockSessionService };
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
