import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  email = signal('');
  password = signal('');
  errorMessage = signal('');
  loading = signal(false);

  async onSubmit(): Promise<void> {
    this.errorMessage.set('');
    this.loading.set(true);

    try {
      await this.auth.login(this.email(), this.password());
      await this.router.navigate(['/']);
    } catch (err: any) {
      const message = err?.error?.error?.message ?? 'Login failed. Please try again.';
      this.errorMessage.set(message);
    } finally {
      this.loading.set(false);
    }
  }
}
