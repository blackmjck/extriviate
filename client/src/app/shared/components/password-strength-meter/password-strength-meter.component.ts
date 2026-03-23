// password-strength-meter.component.ts
import {
  Component,
  InjectionToken,
  input,
  computed,
  inject,
  signal,
  output,
  effect,
  ChangeDetectionStrategy,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, tap } from 'rxjs';
import { zxcvbn } from '@zxcvbn-ts/core';
import { AuthService } from '../../../core/services/auth.service';

export type zxcvbnScore = 0 | 1 | 2 | 3 | 4;

export const ZXCVBN_TOKEN = new InjectionToken<typeof zxcvbn>('ZXCVBN_TOKEN', {
  providedIn: 'root',
  factory: () => zxcvbn,
});

@Component({
  selector: 'app-password-strength-meter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './password-strength-meter.component.html',
  styleUrl: './password-strength-meter.component.scss',
})
export class PasswordStrengthMeterComponent {
  private readonly auth = inject(AuthService);
  private readonly zxcvbnFn = inject(ZXCVBN_TOKEN);

  readonly password = input<string>('');
  readonly minLength = input<number>(8); // a minimum of 8 is required for the HIBP check
  readonly minLevel = input<number>(2); // by default, must be at level 2 or higher to pass

  pass = output<boolean>();

  readonly isPwned = signal<boolean>(false);
  readonly isPwnedChecking = signal<boolean>(false);
  readonly LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
  readonly segments: zxcvbnScore[] = [0, 1, 2, 3, 4]; // 5 bars = scores 0–4 mapped to 1–5

  readonly password$ = toObservable(this.password).pipe(
    debounceTime(350),
    distinctUntilChanged(),
    tap((password: string) => this.checkPassword(password)),
  );

  readonly debouncedPassword = toSignal(this.password$, { initialValue: '' });

  private readonly result = computed(() => {
    const p = this.debouncedPassword();
    return p ? this.zxcvbnFn(p) : null;
  });

  readonly score = computed(() => this.result()?.score ?? -1);
  readonly label = computed(() => (this.score() >= 0 ? this.LABELS[this.score()] : ''));
  readonly colorClass = computed(() => (this.score() >= 0 ? `level-${this.score() + 1}` : ''));
  readonly tooShort = computed(() => {
    if (this.minLength() > 0) {
      return this.debouncedPassword().length < this.minLength();
    } else {
      return false;
    }
  });
  readonly warning = computed(() => this.result()?.feedback.warning ?? '');
  readonly suggestions = computed(() => this.result()?.feedback.suggestions ?? []);

  constructor() {
    effect(() => {
      this.pass.emit(
        !this.isPwnedChecking() &&
        this.score() >= this.minLevel() &&
        !this.isPwned()
      );
    });
  }

  async checkPassword(password: string): Promise<void> {
    if (password.length >= 8) {
      this.isPwnedChecking.set(true);
      const pwned: boolean | undefined = await this.auth.checkPwnedPassword(password);
      this.isPwned.set(!!pwned);
      this.isPwnedChecking.set(false);
    } else {
      this.isPwned.set(false);
      this.isPwnedChecking.set(false);
    }
  }
}
