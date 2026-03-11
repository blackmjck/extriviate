import {
  Component,
  inject,
  computed,
  signal,
  effect,
  OnDestroy,
  ChangeDetectionStrategy,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { GameStateService } from '../../core/services/game-state.service';
import { GameSocketService } from '../../core/services/game-socket.service';
import { SpeechRecognitionService } from '../../core/services/speech-recognition.service';
import { ContentBlocksComponent } from '../../shared/components/content-blocks/content-blocks.component';

@Component({
  selector: 'app-question',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ContentBlocksComponent],
  templateUrl: './question.component.html',
  styleUrl: './question.component.scss',
})
export class QuestionComponent implements OnDestroy {
  private readonly gameState = inject(GameStateService);
  private readonly socketService = inject(GameSocketService);
  readonly speech = inject(SpeechRecognitionService);

  readonly answerText = signal('');
  readonly timerValue = signal<number | null>(null);

  private timerInterval: ReturnType<typeof setInterval> | null = null;

  readonly roundState = computed(() => this.gameState.roundState());
  readonly phase = computed(() => this.roundState()?.phase ?? 'idle');

  readonly questionContent = computed(() => this.roundState()?.questionContent ?? []);
  readonly answerContent = computed(() => this.roundState()?.answerContent ?? []);
  readonly pointValue = computed(() => this.roundState()?.pointValue);
  readonly submittedAnswer = computed(() => this.roundState()?.submittedAnswer);
  readonly isCorrect = computed(() => this.roundState()?.isCorrect);

  readonly currentPlayerId = computed(() => this.gameState.currentPlayerId());

  readonly isActivePlayer = computed(() => {
    const state = this.roundState();
    const userId = this.currentPlayerId();
    if (!state || userId === null) return false;
    return state.activePlayerId === userId;
  });

  readonly showBuzzButton = computed(() => this.phase() === 'buzzers_open');

  readonly showAnswerInput = computed(
    () => this.phase() === 'player_answering' && this.isActivePlayer(),
  );

  readonly showResult = computed(() => this.phase() === 'answer_evaluated');

  constructor() {
    // Clear timer whenever phase leaves a timer-relevant state
    effect(() => {
      const p = this.phase();
      if (p !== 'buzzers_open' && p !== 'player_answering') {
        this.clearTimer();
      }
    });

    // Drive timer from server timer messages
    this.socketService.messages$.pipe(takeUntilDestroyed()).subscribe((message) => {
      if (message.type === 'timer_started') {
        this.startTimer(message.durationMs);
      } else if (message.type === 'timer_expired') {
        this.clearTimer();
      }
    });
  }

  buzz(): void {
    const playerId = this.currentPlayerId();
    if (playerId === null) return;
    this.socketService.send({ type: 'buzz', playerId });
  }

  submitAnswer(): void {
    const playerId = this.currentPlayerId();
    if (playerId === null) return;
    const answer = this.answerText().trim();
    if (!answer) return;
    this.socketService.send({ type: 'answer_submitted', playerId, answer });
    this.answerText.set('');
  }

  startPtt(): void {
    this.speech.start();
  }

  stopPtt(): void {
    this.speech.stop();
    const transcript = this.speech.finalTranscript();
    if (transcript) {
      this.answerText.set(transcript);
    }
  }

  startTimer(durationMs: number): void {
    this.clearTimer();
    let remaining = Math.ceil(durationMs / 1000);
    this.timerValue.set(remaining);
    this.timerInterval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        this.clearTimer();
        this.timerValue.set(0);
      } else {
        this.timerValue.set(remaining);
      }
    }, 1000);
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  clearTimer(): void {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.timerValue.set(null);
  }
}
