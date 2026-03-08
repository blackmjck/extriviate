import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-signup',
  standalone: true,
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
    } catch (err: any) {
      const message = err?.error?.error?.message ?? 'Signup failed. Please try again.';
      this.errorMessage.set(message);
    } finally {
      this.loading.set(false);
    }
  }
}
