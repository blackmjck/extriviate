import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgxTurnstileComponent, NgxTurnstileModule } from 'ngx-turnstile';
import { CF_TEST_SITEKEYS } from '@extriviate/shared';
import { AuthService } from '../../core/services/auth.service';
import { isApiErrorResponse } from '../../shared/utils/helpers';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-forgot-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, NgxTurnstileModule],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
})
export class ForgotPasswordComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly turnstile = viewChild<NgxTurnstileComponent>('turnstile');

  private captchaError = false;

  readonly CF_SITE_KEY = environment.production
    ? environment.cfSiteKey
    : CF_TEST_SITEKEYS.PASS_INVISIBLE; // show the widget but pass the challenge each time

  email = signal('');
  turnstileToken = signal('');
  hp = signal(''); // expose a honeypot hidden input to catch bot autofill attempts
  errorMessage = signal('');
  navMessage = signal('');
  responseMessage = signal('');
  loading = signal(false);
  submitted = signal(false);
  isLocked = signal(false);

  showLoading = computed(() => this.loading());
  showWorking = computed(() => this.loading() && this.submitted());
  disabled = computed(
    () =>
      this.loading() || !this.turnstileToken().length || !this.email().length || this.isLocked(),
  );
  disabledHint = computed<string>(() => {
    if (this.loading() || this.isLocked()) return '';
    if (!this.turnstileToken().length) return 'Waiting for security check to complete\u2026';
    if (!this.email().length) return 'Please enter your email address.';
    return '';
  });

  ngOnInit(): void {
    const error = this.route.snapshot.queryParamMap.get('error');
    if (error === 'missing-token') {
      this.navMessage.set(
        'The reset link is invalid or has already been used. Please request a new one.',
      );
      // Strip the query param so it doesn't persist on refresh
      this.router.navigate([], { replaceUrl: true, queryParams: {} });
    }
  }

  onCaptcha(msg: string | null, isError = false): void {
    if (isError) {
      this.captchaError = true;
      this.errorMessage.set('CAPTCHA failed. Please refresh and try again.');
      this.turnstileToken.set('');
    } else {
      // only clear the message if it was captcha related in the first place
      if (this.captchaError) this.errorMessage.set('');
      this.captchaError = false;
      this.turnstileToken.set(msg ?? '');
    }
  }

  setHP(evt: Event) {
    const value = (evt.target as HTMLInputElement).value;
    if (value !== this.hp()) {
      this.hp.set(value);
    }
  }

  async onSubmit(): Promise<void> {
    this.errorMessage.set('');
    this.responseMessage.set('');
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

    // trigger the email dispatch if you can
    try {
      const response = await this.auth.forgotPassword(this.email(), this.turnstileToken());
      this.responseMessage.set(response);
      this.isLocked.set(true);
    } catch (err: unknown) {
      let message = '';
      if (isApiErrorResponse(err)) {
        message = err.error.error.message;
        // TODO: handle any specific error codes here, e.g. hitting the rate limit
      } else if (err instanceof Error) {
        message = err.message;
      }
      this.errorMessage.set(message);
      this.turnstile()?.reset();
      this.turnstileToken.set('');
    } finally {
      this.loading.set(false);
      this.submitted.set(false);
    }
  }
}
