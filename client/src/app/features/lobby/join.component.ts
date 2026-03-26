import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import type { GameSession, JoinMethod } from '@extriviate/shared';
import { AuthService } from '../../core/services/auth.service';
import { GuestSessionService } from '../../core/services/guest-session.service';
import { GameSocketService } from '../../core/services/game-socket.service';
import { SessionService } from '../../core/services/session.service';
import { isApiErrorResponse } from '../../shared/utils/helpers';

@Component({
  selector: 'app-join',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './join.component.html',
  styleUrl: './join.component.scss',
})
export class JoinComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly guestSession = inject(GuestSessionService);
  private readonly gameSocket = inject(GameSocketService);
  private readonly sessionService = inject(SessionService);

  readonly session = signal<GameSession | null>(null);
  readonly joinMethod = signal<JoinMethod>('guest');
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly fetchingSession = signal(true);

  // Guest fields
  readonly guestName = signal('');

  // Login fields
  readonly loginEmail = signal('');
  readonly loginPassword = signal('');

  // Signup fields
  readonly signupEmail = signal('');
  readonly signupPassword = signal('');
  readonly signupName = signal('');

  readonly joinCode = computed(() => this.route.snapshot.paramMap.get('joinCode') ?? '');

  async ngOnInit(): Promise<void> {
    const code = this.joinCode();
    if (!code) {
      this.errorMessage.set('Invalid join link.');
      this.fetchingSession.set(false);
      return;
    }

    try {
      const res = await this.sessionService.getSession(code);
      this.session.set(res.data);
    } catch {
      this.errorMessage.set('Session not found or no longer available.');
    } finally {
      this.fetchingSession.set(false);
    }
  }

  selectMethod(method: JoinMethod): void {
    this.joinMethod.set(method);
    this.errorMessage.set('');
  }

  private buildJoinBody() {
    const method = this.joinMethod();
    switch (method) {
      case 'guest':
        return { method: 'guest', displayName: this.guestName() } as const;
      case 'login':
        return {
          method: 'login',
          email: this.loginEmail(),
          password: this.loginPassword(),
        } as const;
      case 'signup':
        return {
          method: 'signup',
          email: this.signupEmail(),
          password: this.signupPassword(),
          displayName: this.signupName(),
        } as const;
    }
  }

  async onJoin(): Promise<void> {
    const session = this.session();
    if (!session) return;

    this.errorMessage.set('');
    this.loading.set(true);

    try {
      const method = this.joinMethod();
      const body = this.buildJoinBody();

      const res = await this.sessionService.joinSession(session.id, body);

      const { player, session: updatedSession, tokens, guestToken } = res.data;

      if (method === 'guest') {
        // For guests, the server returns a guest token in the tokens field
        // Store guest session info for reconnection
        if (guestToken) {
          this.guestSession.store(guestToken, player.id, updatedSession.id);
        }
        // Connect without a token getter - the socket will send reconnect_guest on open.
        this.gameSocket.connect(updatedSession.id);
      } else {
        // Registered user: prefer the live access token from AuthService (kept fresh
        // by the auth interceptor), falling back to the token in the join response.
        const capturedToken = tokens?.accessToken;
        this.gameSocket.connect(
          updatedSession.id,
          () => this.auth.getAccessToken() ?? capturedToken,
        );
      }

      await this.router.navigate(['/session', updatedSession.id]);
    } catch (err: unknown) {
      let message = 'Failed to join session';
      if (isApiErrorResponse(err)) {
        message = err.error.error.message;
      } else if (err instanceof Error) {
        message = err.message;
      }
      this.errorMessage.set(message);
    } finally {
      this.loading.set(false);
    }
  }
}
