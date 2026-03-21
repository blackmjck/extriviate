import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import type { GameplayMessage, RoundStatePayload } from '@extriviate/shared';
import { QuestionComponent } from './question.component';
import { GameStateService } from '../../core/services/game-state.service';
import { GameSocketService } from '../../core/services/game-socket.service';
import { SpeechRecognitionService } from '../../core/services/speech-recognition.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRoundState(overrides: Partial<RoundStatePayload> = {}): RoundStatePayload {
  return {
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup helper
// ---------------------------------------------------------------------------

function setup(roundStateOverride: RoundStatePayload | null = null, currentPlayerId: number | null = 1) {
  const messages$ = new Subject<GameplayMessage>();
  const roundStateSignal = signal<RoundStatePayload | null>(roundStateOverride);

  const mockGameState = {
    roundState: roundStateSignal,
    currentPlayerId: signal(currentPlayerId),
    players: signal([]),
    isHost: signal(false),
  };

  const mockSocket = {
    messages$,
    send: vi.fn(),
    connectionState: signal('connected' as const),
    reconnecting: signal(false),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  const mockSpeech = {
    isAvailable: signal(false),
    isListening: signal(false),
    finalTranscript: signal(''),
    interimTranscript: signal(''),
    start: vi.fn(),
    stop: vi.fn(),
  };

  TestBed.configureTestingModule({
    imports: [QuestionComponent],
    providers: [
      provideZonelessChangeDetection(),
      { provide: GameStateService, useValue: mockGameState },
      { provide: GameSocketService, useValue: mockSocket },
      { provide: SpeechRecognitionService, useValue: mockSpeech },
    ],
  });

  const fixture: ComponentFixture<QuestionComponent> = TestBed.createComponent(QuestionComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();

  return { fixture, component, roundStateSignal, messages$, mockSocket, mockSpeech };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  TestBed.resetTestingModule();
});

// ---------------------------------------------------------------------------
// timer behaviour
// ---------------------------------------------------------------------------

describe('timer behaviour', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('timer_started message starts countdown from given duration', () => {
    const { component, messages$ } = setup();
    messages$.next({ type: 'timer_started', timerType: 'buzz', durationMs: 10000 });
    expect(component.timerValue()).toBe(10);
    vi.advanceTimersByTime(1000);
    expect(component.timerValue()).toBe(9);
    vi.advanceTimersByTime(9000);
    expect(component.timerValue()).toBe(0);
  });

  it('timer is cleared by phase change, not by a server message (timer_expired removed from protocol)', () => {
    // The server never broadcasts timer_expired — timer clearing is driven by
    // the phase-change effect watching roundState.phase.
    const { component, fixture, roundStateSignal, messages$ } = setup();
    roundStateSignal.set(makeRoundState({ phase: 'buzzers_open' }));
    fixture.detectChanges();

    messages$.next({ type: 'timer_started', timerType: 'buzz', durationMs: 5000 });
    vi.advanceTimersByTime(1000);
    expect(component.timerValue()).toBe(4);

    // Phase transitions to idle → effect fires → timer cleared
    roundStateSignal.set(makeRoundState({ phase: 'idle' }));
    fixture.detectChanges();
    expect(component.timerValue()).toBeNull();
  });

  it('timer clears when phase leaves buzzers_open', () => {
    const { component, fixture, roundStateSignal, messages$ } = setup();
    roundStateSignal.set(makeRoundState({ phase: 'buzzers_open' }));
    fixture.detectChanges();
    messages$.next({ type: 'timer_started', timerType: 'buzz', durationMs: 10000 });
    expect(component.timerValue()).not.toBeNull();
    roundStateSignal.set(makeRoundState({ phase: 'idle' }));
    fixture.detectChanges();
    expect(component.timerValue()).toBeNull();
  });

  it('ngOnDestroy clears the interval', () => {
    const { component, messages$ } = setup();
    messages$.next({ type: 'timer_started', timerType: 'buzz', durationMs: 5000 });
    expect(component.timerValue()).not.toBeNull();
    component.ngOnDestroy();
    vi.advanceTimersByTime(3000);
    expect(component.timerValue()).toBeNull();
  });

  it('restores timer from timerDeadlineMs when deadline is in the future', () => {
    // Simulates reconnect: roundState arrives with timerDeadlineMs already set.
    // The effect computes remainingMs = deadline - Date.now() and calls startTimer().
    const { component, fixture, roundStateSignal } = setup();
    const futureDeadline = Date.now() + 7000;
    roundStateSignal.set(makeRoundState({ phase: 'buzzers_open', timerDeadlineMs: futureDeadline }));
    fixture.detectChanges();
    // startTimer() sets timerValue to Math.ceil(remainingMs / 1000)
    // remainingMs ≈ 7000ms → timerValue ≈ 7
    const tv = component.timerValue();
    expect(tv).not.toBeNull();
    expect(tv!).toBeGreaterThanOrEqual(6);
    expect(tv!).toBeLessThanOrEqual(7);
  });

  it('clears timer when timerDeadlineMs is already in the past', () => {
    // When reconnecting to a session whose timer already expired, clearTimer() is called.
    const { component, fixture, roundStateSignal } = setup();
    // First give the component a running timer so we can verify it gets cleared
    component.startTimer(5000);
    expect(component.timerValue()).not.toBeNull();

    const pastDeadline = Date.now() - 1000;
    roundStateSignal.set(makeRoundState({ phase: 'buzzers_open', timerDeadlineMs: pastDeadline }));
    fixture.detectChanges();
    expect(component.timerValue()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buzz()
// ---------------------------------------------------------------------------

describe('buzz()', () => {
  function makePointerEvent(): PointerEvent {
    return { preventDefault: vi.fn() } as unknown as PointerEvent;
  }

  it('sends buzz message with currentPlayerId', () => {
    const { component, mockSocket } = setup(null, 1);
    component.buzz(makePointerEvent());
    expect(mockSocket.send).toHaveBeenCalledWith({ type: 'buzz', playerId: 1 });
  });

  it('calls event.preventDefault() to suppress the 300ms tap delay', () => {
    const { component } = setup(null, 1);
    const event = makePointerEvent();
    component.buzz(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('does not send if currentPlayerId is null', () => {
    const { component, mockSocket } = setup(null, null);
    component.buzz(makePointerEvent());
    expect(mockSocket.send).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// submitAnswer()
// ---------------------------------------------------------------------------

describe('submitAnswer()', () => {
  it('sends answer_submitted with trimmed text and clears input', () => {
    const { component, mockSocket } = setup(null, 1);
    component.answerText.set('  What is Paris?  ');
    component.submitAnswer();
    expect(mockSocket.send).toHaveBeenCalledWith({
      type: 'answer_submitted',
      playerId: 1,
      answer: 'What is Paris?',
    });
    expect(component.answerText()).toBe('');
  });

  it('does not send if answer is empty after trim', () => {
    const { component, mockSocket } = setup(null, 1);
    component.answerText.set('   ');
    component.submitAnswer();
    expect(mockSocket.send).not.toHaveBeenCalled();
  });

  it('does not send if currentPlayerId is null', () => {
    const { component, mockSocket } = setup(null, null);
    component.answerText.set('some answer');
    component.submitAnswer();
    expect(mockSocket.send).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// startPtt() / stopPtt()
// ---------------------------------------------------------------------------

describe('startPtt()', () => {
  it('delegates to SpeechRecognitionService.start()', () => {
    const { component, mockSpeech } = setup(null, 1);
    component.startPtt();
    expect(mockSpeech.start).toHaveBeenCalledOnce();
  });
});

describe('stopPtt()', () => {
  it('delegates to SpeechRecognitionService.stop()', () => {
    const { component, mockSpeech } = setup(null, 1);
    component.stopPtt();
    expect(mockSpeech.stop).toHaveBeenCalledOnce();
  });

  it('copies finalTranscript into answerText when transcript is non-empty', () => {
    const { component, mockSpeech } = setup(null, 1);
    mockSpeech.finalTranscript.set('What is the Eiffel Tower?');
    component.stopPtt();
    expect(component.answerText()).toBe('What is the Eiffel Tower?');
  });

  it('does not overwrite answerText when finalTranscript is empty', () => {
    const { component, mockSpeech } = setup(null, 1);
    component.answerText.set('existing text');
    mockSpeech.finalTranscript.set('');
    component.stopPtt();
    // answerText is only written when transcript is truthy
    expect(component.answerText()).toBe('existing text');
  });
});

// ---------------------------------------------------------------------------
// template visibility
// ---------------------------------------------------------------------------

describe('template visibility', () => {
  it('buzz button is visible when phase is buzzers_open', () => {
    const { fixture, roundStateSignal } = setup();
    roundStateSignal.set(makeRoundState({ phase: 'buzzers_open' }));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.buzz-button')).not.toBeNull();
  });

  it('buzz button is not visible when phase is idle', () => {
    const { fixture, roundStateSignal } = setup();
    roundStateSignal.set(makeRoundState({ phase: 'idle' }));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.buzz-button')).toBeNull();
  });

  it('answer form is visible when phase is player_answering and isActivePlayer', () => {
    const { fixture, roundStateSignal } = setup(null, 1);
    roundStateSignal.set(makeRoundState({ phase: 'player_answering', activePlayerId: 1 }));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.answer-form')).not.toBeNull();
  });

  it('answer form is not visible when phase is player_answering but not active player', () => {
    const { fixture, roundStateSignal } = setup(null, 1);
    roundStateSignal.set(makeRoundState({ phase: 'player_answering', activePlayerId: 99 }));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.answer-form')).toBeNull();
  });

  it('result is visible when phase is answer_evaluated', () => {
    const { fixture, roundStateSignal } = setup();
    roundStateSignal.set(makeRoundState({ phase: 'answer_evaluated', isCorrect: true }));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.result')).not.toBeNull();
  });

  it('timer display is visible when timerValue is not null', () => {
    const { fixture, component } = setup();
    component.startTimer(5000);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.timer')).not.toBeNull();
  });

  it('timer display is absent when timerValue is null', () => {
    const { fixture } = setup();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.timer')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// timer display
// ---------------------------------------------------------------------------

describe('timer display', () => {
  it('shows urgent class when timerValue <= 3', () => {
    const { fixture, component } = setup();
    component.startTimer(3000);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.timer.urgent')).not.toBeNull();
  });

  it('does not show urgent class when timerValue > 3', () => {
    const { fixture, component } = setup();
    component.startTimer(10000);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.timer.urgent')).toBeNull();
  });
});
