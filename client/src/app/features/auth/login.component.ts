import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgxTurnstileModule } from 'ngx-turnstile';
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

  readonly CF_SITE_KEY = environment.cfSiteKey;

  email = signal('');
  password = signal('');
  errorMessage = signal('');
  loading = signal(false);

  onCaptcha(msg?: string | null, isError = false): void {
    console[isError ? 'error' : 'log'](msg);
  }

  async onSubmit(): Promise<void> {
    this.errorMessage.set('');
    this.loading.set(true);

    try {
      await this.auth.login(this.email(), this.password());
      await this.router.navigate(['/games']);
    } catch (err: unknown) {
      let message = 'Login failed. Please try again.';
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
