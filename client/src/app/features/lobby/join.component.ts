import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type {
  GameSession,
  JoinMethod,
  JoinSessionResponse,
  ApiResponse,
} from '@extriviate/shared';
import { AuthService } from '../../core/services/auth.service';
import { GuestSessionService } from '../../core/services/guest-session.service';
import { GameSocketService } from '../../core/services/game-socket.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-join',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './join.component.html',
  styleUrl: './join.component.scss',
})
export class JoinComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly guestSession = inject(GuestSessionService);
  private readonly gameSocket = inject(GameSocketService);

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
      const res = await firstValueFrom(
        this.http.get<ApiResponse<GameSession>>(`${environment.apiUrl}/api/sessions/${code}`),
      );
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

  async onJoin(): Promise<void> {
    const session = this.session();
    if (!session) return;

    this.errorMessage.set('');
    this.loading.set(true);

    try {
      let body: Record<string, unknown>;
      const method = this.joinMethod();

      if (method === 'guest') {
        body = { method: 'guest', displayName: this.guestName() };
      } else if (method === 'login') {
        body = { method: 'login', email: this.loginEmail(), password: this.loginPassword() };
      } else {
        body = {
          method: 'signup',
          email: this.signupEmail(),
          password: this.signupPassword(),
          displayName: this.signupName(),
        };
      }

      const res = await firstValueFrom(
        this.http.post<ApiResponse<JoinSessionResponse>>(
          `${environment.apiUrl}/api/sessions/${session.id}/join`,
          body,
        ),
      );

      const { player, session: updatedSession, tokens } = res.data;

      if (method === 'guest') {
        // For guests, the server returns a guest token in the tokens field
        // Store guest session info for reconnection
        if (tokens) {
          this.guestSession.store(tokens.accessToken, player.id, updatedSession.id);
        }
        this.gameSocket.connect(updatedSession.id, tokens?.accessToken);
      } else {
        // Authenticated user - tokens are stored by AuthService during login/signup
        // but the join endpoint also returns them
        if (tokens) {
          this.auth.login(
            method === 'login' ? this.loginEmail() : this.signupEmail(),
            method === 'login' ? this.loginPassword() : this.signupPassword(),
          );
        }
        this.gameSocket.connect(updatedSession.id, tokens?.accessToken);
      }

      await this.router.navigate(['/session', updatedSession.id]);
    } catch (err: any) {
      const message = err?.error?.error?.message ?? 'Failed to join session.';
      this.errorMessage.set(message);
    } finally {
      this.loading.set(false);
    }
  }
}
