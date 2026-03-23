import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgxTurnstileModule } from 'ngx-turnstile';
import { CF_TEST_SITEKEYS } from '@extriviate/shared';
import { AuthService } from '../../core/services/auth.service';
import { isApiErrorResponse } from '../../shared/utils/helpers';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, NgxTurnstileModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly CF_SITE_KEY = environment.production
    ? environment.cfSiteKey
    : CF_TEST_SITEKEYS.PASS_INVISIBLE; // show the widget but pass the challenge each time

  email = signal('');
  password = signal('');
  turnstileToken = signal('');
  hp = signal(''); // expose a honeypot hidden input to catch bot autofill attempts
  errorMessage = signal('');
  loading = signal(false);
  submitted = signal(false);
  isLocked = signal(false);

  showLoading = computed(() => this.loading());
  showWorking = computed(() => this.loading() && this.submitted());
  disabled = computed(
    () =>
      this.loading() ||
      !this.turnstileToken().length ||
      !this.password().length ||
      !this.email().length ||
      this.isLocked(),
  );
  disabledHint = computed<string>(() => {
    if (this.loading() || this.isLocked()) return '';
    if (!this.turnstileToken().length) return 'Waiting for security check to complete\u2026';
    if (!this.email().length || !this.password().length)
      return 'Please fill in all required fields.';
    return '';
  });

  onCaptcha(msg: string | null, isError = false): void {
    if (isError) {
      this.errorMessage.set('CAPTCHA failed. Please refresh and try again.');
      this.turnstileToken.set('');
    } else {
      this.turnstileToken.set(msg ?? '');
    }
  }

  setHP(evt: Event): void {
    const value = (evt.target as HTMLInputElement).value;
    if (value !== this.hp()) {
      this.hp.set(value);
    }
  }

  async onSubmit(): Promise<void> {
    this.errorMessage.set('');
    this.isLocked.set(false);
    this.submitted.set(true);
    this.loading.set(true);

    // catch any honeypotted bot submissions
    // and reject with a frustratingly vague error :-)
    if (this.hp().length) {
      // make them wait for it!
      await new Promise((res) => setTimeout(res, 1000));
      // annoy them with an unhelpful message!
      this.errorMessage.set('There was an error.');
      this.loading.set(false);
      this.submitted.set(false);
      return;
    }

    try {
      await this.auth.login(this.email(), this.password(), this.turnstileToken());
      await this.router.navigate(['/games']);
    } catch (err: unknown) {
      let message = 'Login failed. Please try again.';
      if (isApiErrorResponse(err)) {
        message = err.error.error.message;

        // Lock the form when the account is locked.
        // The error message already tells the user how long to wait.
        // The Turnstile widget will also need to be reset for the next attempt.
        if (err.error.error.code === 'ACCOUNT_LOCKED') {
          this.isLocked.set(true);
        }
      } else if (err instanceof Error) {
        message = err.message;
      }
      this.errorMessage.set(message);
    } finally {
      this.loading.set(false);
      this.submitted.set(false);
    }
  }
}
