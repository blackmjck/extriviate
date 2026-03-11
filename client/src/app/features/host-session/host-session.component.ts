import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import type { GameBoard, CreateSessionRequest, SessionMode } from '@extriviate/shared';
import { GameService } from '../../core/services/game.service';
import { SessionService } from '../../core/services/session.service';

@Component({
  selector: 'app-host-session',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './host-session.component.html',
  styleUrl: './host-session.component.scss',
})
export class HostSessionComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly gameService = inject(GameService);
  private readonly sessionService = inject(SessionService);

  // Remote state
  readonly game = signal<GameBoard['game'] | null>(null);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly submitError = signal<string | null>(null);

  // Form state
  readonly sessionName = signal('');
  readonly mode = signal<SessionMode>('computer_hosted');
  readonly turnBased = signal(false);

  // Validation
  readonly nameError = computed(() =>
    this.sessionName().trim().length === 0 ? 'Session name is required.' : null,
  );

  readonly canSubmit = computed(() => this.nameError() === null && !this.submitting());

  private gameId!: number;

  ngOnInit(): void {
    this.gameId = Number(this.route.snapshot.paramMap.get('id'));
    void this.loadGame();
  }

  private async loadGame(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const res = await this.gameService.getGame(this.gameId);
      if (res.success) {
        this.game.set(res.data.game);
        this.sessionName.set(res.data.game.title);
      }
    } catch {
      this.loadError.set('Could not load game. Please go back and try again.');
    } finally {
      this.loading.set(false);
    }
  }

  setSessionName(value: string): void {
    this.sessionName.set(value);
    this.submitError.set(null);
  }

  setMode(value: SessionMode): void {
    this.mode.set(value);
  }

  setTurnBased(value: boolean): void {
    this.turnBased.set(value);
  }

  async startSession(): Promise<void> {
    if (!this.canSubmit()) return;

    this.submitting.set(true);
    this.submitError.set(null);

    const body: CreateSessionRequest = {
      gameId: this.gameId,
      name: this.sessionName().trim(),
      mode: this.mode(),
      turnBased: this.turnBased(),
    };

    try {
      const res = await this.sessionService.createSession(body);
      if (res.success) {
        await this.router.navigate(['/session', res.data.id]);
      }
    } catch (err: unknown) {
      const message =
        (err as { error?: { error?: { message?: string } } })?.error?.error?.message ??
        'Failed to create session. Please try again.';
      this.submitError.set(message);
      this.submitting.set(false);
    }
  }
}
