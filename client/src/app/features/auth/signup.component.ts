import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { isApiErrorResponse } from '../../shared/utils/helpers';

@Component({
  selector: 'app-signup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.scss',
})
export class SignupComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  email = signal('');
  password = signal('');
  displayName = signal('');
  errorMessage = signal('');
  loading = signal(false);

  async onSubmit(): Promise<void> {
    this.errorMessage.set('');
    this.loading.set(true);

    try {
      await this.auth.signup(this.email(), this.password(), this.displayName());
      await this.router.navigate(['/']);
    } catch (err: unknown) {
      let message = 'Signup failed. Please try again.';
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
