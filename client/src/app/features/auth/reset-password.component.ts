import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CF_TEST_SITEKEYS } from '@extriviate/shared';
import { NgxTurnstileModule } from 'ngx-turnstile';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-reset-password',
  imports: [FormsModule, NgxTurnstileModule],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private resetToken: string | null = null;

  readonly CF_SITE_KEY = environment.production
    ? environment.cfSiteKey
    : CF_TEST_SITEKEYS.PASS_INVISIBLE; // show the widget but pass the challenge each time

  password = signal('');
  turnstileToken = signal('');
  hp = signal(''); // expose a honeypot hidden input to catch bot autofill attempts
  errorMessage = signal('');
  responseMessage = signal('');
  loading = signal(false);
  submitted = signal(false);
  isLocked = signal(false);

  showLoading = computed(() => this.loading() || !this.turnstileToken().length);
  showWorking = computed(() => this.loading() && this.submitted());
  disabled = computed(
    () =>
      this.showLoading() ||
      this.showWorking() ||
      this.errorMessage().length ||
      !this.password().length ||
      this.isLocked(),
  );

  ngOnInit(): void {
    this.resetToken = this.route.snapshot.queryParamMap.get('token');

    if (!this.resetToken) this.redirectWithError();

    // Strip the token from the URL without triggering navigation
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
      replaceUrl: true, // replaces the history entry without pushing a new one
    });
  }

  onCaptcha(msg: string | null, isError = false): void {
    if (isError) {
      this.errorMessage.set('CAPTCHA failed. Please refresh and try again.');
      this.turnstileToken.set('');
    } else {
      this.turnstileToken.set(msg ?? '');
    }
  }

  setHP(evt: unknown) {
    // handle Angular-interpreted events
    if (typeof evt === 'string' && evt.length) {
      this.hp.set(evt);
      // handle native HTML events (e.g. input, change, blur, etc.)
    } else if (evt instanceof Event && evt.target) {
      const { value } = evt.target as unknown as { value: string };
      if (value !== this.hp()) {
        this.hp.set(value);
      }
    }
  }

  redirectWithError(): void {
    // No token present - this URL is invalid, redirect rather than showing a form
    this.router.navigate(['/forgot-password'], {
      queryParams: { error: 'missing-token' },
    });
  }

  async onSubmit(): Promise<void> {
    this.errorMessage.set('');
    this.responseMessage.set('');
    this.isLocked.set(false);
    this.submitted.set(true);
    this.loading.set(true);

    // ignore invalid URLs and just redirect
    if (!this.resetToken) this.redirectWithError();

    // catch any honeypotted bot submissions
    // and reject with a frustratingly vague error :-)
    if (this.hp().length) {
      // make them wait for it!
      await new Promise((res) => setTimeout(res, 1000));
      // annoy them with an unhelpful message!
      this.errorMessage.set('There was an error.');
      this.loading.set(false);
      return;
    }

    // send the reset request
    try {
      await this.auth.resetPassword(this.resetToken!, this.password(), this.turnstileToken());

      // display a positive response?
      this.responseMessage.set(
        'Success! Your password has been changed. You will be redirected to login with your new password.',
      );

      // Don't navigate away immediately — let the user see the success message,
      // then redirect to login after a short delay
      setTimeout(() => this.router.navigate(['/login']), 3000);
    } catch {
      // Use a generic message to avoid giving hints to attackers
      this.errorMessage.set('This reset link is invalid or has expired. Please request a new one.');
    } finally {
      this.loading.set(false);
    }
  }
}
