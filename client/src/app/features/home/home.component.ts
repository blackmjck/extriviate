import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-home',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'home-host' },
})
export class HomeComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  readonly joinForm = this.fb.nonNullable.group({
    code: [
      '',
      [
        Validators.required,
        Validators.minLength(6),
        Validators.maxLength(6),
        Validators.pattern(/^[A-Za-z0-9]{6}$/),
      ],
    ],
  });

  readonly submitted = signal(false);

  readonly codeInvalid = computed(() => this.submitted() && this.joinForm.controls.code.invalid);

  onJoin(): void {
    this.submitted.set(true);
    if (this.joinForm.invalid) return;
    const code = this.joinForm.controls.code.value.toUpperCase();
    void this.router.navigate(['/join', code]);
  }
}
