import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgxTurnstileModule } from 'ngx-turnstile';
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
export class ForgotPasswordComponent {
  private readonly auth = inject(AuthService);

  readonly CF_SITE_KEY = environment.production
    ? environment.cfSiteKey
    : CF_TEST_SITEKEYS.PASS_INVISIBLE; // show the widget but pass the challenge each time

  email = signal('');
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
      !this.email().length ||
      this.isLocked(),
  );

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
      return;
    }

    // trigger the email dispatch if you can
    try {
      const response = await this.auth.forgotPassword(this.email(), this.turnstileToken());
      // display a positive response?
      this.responseMessage.set(response);
    } catch (err: unknown) {
      let message = '';
      if (isApiErrorResponse(err)) {
        message = err.error.error.message;
        // TODO: handle any specific error codes here, e.g. hitting the rate limit
      } else if (err instanceof Error) {
        message = err.message;
      }
      this.errorMessage.set(message);
    } finally {
      this.loading.set(false);
    }
  }
}
