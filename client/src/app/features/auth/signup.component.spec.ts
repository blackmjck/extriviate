import { Component, input, output, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { vi } from 'vitest';
import { NgxTurnstileModule } from 'ngx-turnstile';
import { SignupComponent } from './signup.component';
import { AuthService } from '../../core/services/auth.service';
import { PasswordStrengthMeterComponent } from '../../shared/components/password-strength-meter/password-strength-meter.component';

// ---------------------------------------------------------------------------
// Stubs

// eslint-disable-next-line @angular-eslint/component-selector
@Component({ selector: 'ngx-turnstile', template: '' })
class TurnstileStub {
  readonly siteKey = input<string>();
  readonly theme = input<string>();
  readonly resolved = output<string | null>();
  readonly errored = output<string | null>();
}

/**
 * Replaces PasswordStrengthMeterComponent so zxcvbn and HIBP are not
 * invoked during signup unit tests.
 */
@Component({ selector: 'app-password-strength-meter', template: '' })
class PasswordStrengthMeterStub {
  readonly password = input<string>('');
  readonly minLength = input<number>(8);
  readonly minLevel = input<number>(2);
  readonly pass = output<boolean>();
}

// ---------------------------------------------------------------------------
// Fixtures

const fakeUser = { id: 2, email: 'b@c.com', displayName: 'Bob', role: 'player' as const };

function makeApiError(message: string, code = 'SOME_ERROR', status = 400): HttpErrorResponse {
  return new HttpErrorResponse({ error: { error: { message, code } }, status });
}

// ---------------------------------------------------------------------------
// Setup

const mockSignup = vi.fn();

function host(f: ComponentFixture<SignupComponent>): HTMLElement {
  return f.nativeElement as HTMLElement;
}

async function setup(): Promise<{
  fixture: ComponentFixture<SignupComponent>;
  component: SignupComponent;
  router: Router;
}> {
  await TestBed.configureTestingModule({
    imports: [SignupComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      {
        provide: AuthService,
        useValue: { signup: mockSignup, checkPwnedPassword: vi.fn().mockResolvedValue(false) },
      },
    ],
  })
    .overrideComponent(SignupComponent, {
      remove: { imports: [NgxTurnstileModule, PasswordStrengthMeterComponent] },
      add: { imports: [TurnstileStub, PasswordStrengthMeterStub] },
    })
    .compileComponents();

  const fixture = TestBed.createComponent(SignupComponent);
  const component = fixture.componentInstance;
  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigate').mockResolvedValue(true);
  fixture.detectChanges();
  return { fixture, component, router };
}

// ---------------------------------------------------------------------------

describe('SignupComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSignup.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  // -------------------------------------------------------------------------
  describe('initial state', () => {
    it('should create', async () => {
      const { component } = await setup();
      expect(component).toBeTruthy();
    });

    it('starts with all signals empty/false', async () => {
      const { component } = await setup();
      expect(component.email()).toBe('');
      expect(component.password()).toBe('');
      expect(component.displayName()).toBe('');
      expect(component.turnstileToken()).toBe('');
      expect(component.hp()).toBe('');
      expect(component.errorMessage()).toBe('');
      expect(component.strongPassword()).toBe(false);
      expect(component.loading()).toBe(false);
      expect(component.submitted()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('computed: disabledHint', () => {
    it('returns empty string when loading is true', async () => {
      const { component } = await setup();
      component.loading.set(true);
      expect(component.disabledHint()).toBe('');
    });

    it('returns CAPTCHA wait message when not loading and token is empty', async () => {
      const { component } = await setup();
      expect(component.disabledHint()).toBe('Waiting for security check to complete\u2026');
    });

    it('returns required fields message when token is set but fields are empty', async () => {
      const { component } = await setup();
      component.turnstileToken.set('tok');
      expect(component.disabledHint()).toBe('Please fill in all required fields.');
    });

    it('returns password strength message when all fields filled but strongPassword is false', async () => {
      const { component } = await setup();
      component.turnstileToken.set('tok');
      component.email.set('b@c.com');
      component.password.set('weak');
      component.displayName.set('Bob');
      expect(component.disabledHint()).toBe('Please choose a stronger password.');
    });

    it('returns empty string when all conditions are met', async () => {
      const { component } = await setup();
      component.turnstileToken.set('tok');
      component.email.set('b@c.com');
      component.password.set('strongPass!');
      component.displayName.set('Bob');
      component.strongPassword.set(true);
      expect(component.disabledHint()).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  describe('computed: showLoading', () => {
    it('is false when loading is false (regardless of token)', async () => {
      const { component } = await setup();
      expect(component.showLoading()).toBe(false);
    });

    it('is false when loading is false even with a token set', async () => {
      const { component } = await setup();
      component.turnstileToken.set('tok');
      expect(component.showLoading()).toBe(false);
    });

    it('is true when loading is true', async () => {
      const { component } = await setup();
      component.loading.set(true);
      expect(component.showLoading()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('computed: disabled', () => {
    it('is true initially', async () => {
      const { component } = await setup();
      expect(component.disabled()).toBe(true);
    });

    it('is true even when all other fields are filled but strongPassword is false', async () => {
      const { component } = await setup();
      component.email.set('b@c.com');
      component.password.set('weakpass');
      component.displayName.set('Bob');
      component.turnstileToken.set('tok');
      // strongPassword defaults to false
      expect(component.disabled()).toBe(true);
    });

    it('is false when all fields are filled and strongPassword is true', async () => {
      const { component } = await setup();
      component.email.set('b@c.com');
      component.password.set('strongPass!');
      component.displayName.set('Bob');
      component.turnstileToken.set('tok');
      component.strongPassword.set(true);
      expect(component.disabled()).toBe(false);
    });

    it('is true when displayName is missing', async () => {
      const { component } = await setup();
      component.email.set('b@c.com');
      component.password.set('strongPass!');
      component.turnstileToken.set('tok');
      component.strongPassword.set(true);
      expect(component.disabled()).toBe(true);
    });

    it('is false even when errorMessage is set (errorMessage no longer gates the button)', async () => {
      const { component } = await setup();
      component.email.set('b@c.com');
      component.password.set('strongPass!');
      component.displayName.set('Bob');
      component.turnstileToken.set('tok');
      component.strongPassword.set(true);
      component.errorMessage.set('oops');
      expect(component.disabled()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('onCaptcha()', () => {
    it('sets turnstileToken on success', async () => {
      const { component } = await setup();
      component.onCaptcha('token-xyz');
      expect(component.turnstileToken()).toBe('token-xyz');
      expect(component.errorMessage()).toBe('');
    });

    it('sets turnstileToken to empty string when msg is null', async () => {
      const { component } = await setup();
      component.turnstileToken.set('old');
      component.onCaptcha(null);
      expect(component.turnstileToken()).toBe('');
    });

    it('sets CAPTCHA errorMessage and clears token on error', async () => {
      const { component } = await setup();
      component.turnstileToken.set('old');
      component.onCaptcha('error detail', true);
      expect(component.errorMessage()).toBe('CAPTCHA failed. Please refresh and try again.');
      expect(component.turnstileToken()).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  describe('setHP()', () => {
    it('sets hp from a native Event with a non-empty target value', async () => {
      const { component } = await setup();
      const input = document.createElement('input');
      input.value = 'bot@evil.com';
      const event = new Event('input');
      Object.defineProperty(event, 'target', { value: input });
      component.setHP(event);
      expect(component.hp()).toBe('bot@evil.com');
    });

    it('does not update hp from a native Event when value equals current hp', async () => {
      const { component } = await setup();
      component.hp.set('existing@evil.com');
      const input = document.createElement('input');
      input.value = 'existing@evil.com';
      const event = new Event('input');
      Object.defineProperty(event, 'target', { value: input });
      component.setHP(event);
      expect(component.hp()).toBe('existing@evil.com');
    });
  });

  // -------------------------------------------------------------------------
  describe('measureStrength()', () => {
    it('sets strongPassword to true when pass is true', async () => {
      const { component } = await setup();
      component.measureStrength(true);
      expect(component.strongPassword()).toBe(true);
    });

    it('sets strongPassword to false when pass is false', async () => {
      const { component } = await setup();
      component.strongPassword.set(true);
      component.measureStrength(false);
      expect(component.strongPassword()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('onSubmit(): honeypot', () => {
    it('delays 1 s, sets a vague error, and never calls auth.signup', async () => {
      const { component } = await setup();
      component.hp.set('bot@evil.com');

      const promise = component.onSubmit();
      vi.advanceTimersByTime(1000);
      await promise;

      expect(component.errorMessage()).toBe('There was an error.');
      expect(component.loading()).toBe(false);
      expect(component.submitted()).toBe(false);
      expect(mockSignup).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('onSubmit(): success', () => {
    it('calls auth.signup with email, password, displayName and token', async () => {
      const { component } = await setup();
      component.email.set('b@c.com');
      component.password.set('strongPass!');
      component.displayName.set('Bob');
      component.turnstileToken.set('tok');
      mockSignup.mockResolvedValue(fakeUser);

      await component.onSubmit();

      expect(mockSignup).toHaveBeenCalledWith('b@c.com', 'strongPass!', 'Bob', 'tok');
    });

    it('navigates to / on success', async () => {
      const { component, router } = await setup();
      component.email.set('b@c.com');
      component.password.set('strongPass!');
      component.displayName.set('Bob');
      component.turnstileToken.set('tok');
      mockSignup.mockResolvedValue(fakeUser);

      await component.onSubmit();

      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('clears a pre-existing errorMessage before submitting', async () => {
      const { component } = await setup();
      component.email.set('b@c.com');
      component.password.set('strongPass!');
      component.displayName.set('Bob');
      component.turnstileToken.set('tok');
      component.errorMessage.set('stale error');
      mockSignup.mockResolvedValue(fakeUser);

      await component.onSubmit();

      expect(component.errorMessage()).toBe('');
    });

    it('resets loading to false after success', async () => {
      const { component } = await setup();
      mockSignup.mockResolvedValue(fakeUser);
      component.email.set('b@c.com');
      component.password.set('strongPass!');
      component.displayName.set('Bob');
      component.turnstileToken.set('tok');

      await component.onSubmit();

      expect(component.loading()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('onSubmit(): error handling', () => {
    async function submitWithError(
      fixture: ComponentFixture<SignupComponent>,
      component: SignupComponent,
      err: unknown,
    ) {
      component.email.set('b@c.com');
      component.password.set('strongPass!');
      component.displayName.set('Bob');
      component.turnstileToken.set('tok');
      mockSignup.mockRejectedValue(err);
      await component.onSubmit();
    }

    it('sets errorMessage from the API error response', async () => {
      const { fixture, component } = await setup();
      await submitWithError(fixture, component, makeApiError('Email already in use'));
      expect(component.errorMessage()).toBe('Email already in use');
    });

    it('sets errorMessage from a generic Error instance', async () => {
      const { fixture, component } = await setup();
      await submitWithError(fixture, component, new Error('Network failure'));
      expect(component.errorMessage()).toBe('Network failure');
    });

    it('uses the default message for unknown error types', async () => {
      const { fixture, component } = await setup();
      await submitWithError(fixture, component, 'some string error');
      expect(component.errorMessage()).toBe('Signup failed. Please try again.');
    });

    it('resets loading to false after an error', async () => {
      const { fixture, component } = await setup();
      await submitWithError(fixture, component, new Error('fail'));
      expect(component.loading()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('template', () => {
    it('hides the error banner when errorMessage is empty', async () => {
      const { fixture } = await setup();
      expect(host(fixture).querySelector('.error-banner')).toBeNull();
    });

    it('shows the error banner with message text when errorMessage is set', async () => {
      const { fixture, component } = await setup();
      component.errorMessage.set('Something went wrong');
      fixture.detectChanges();
      const banner = host(fixture).querySelector('.error-banner');
      expect(banner).toBeTruthy();
      expect(banner!.textContent!.trim()).toBe('Something went wrong');
    });

    it('shows "Sign Up" button text when not loading (regardless of CAPTCHA token)', async () => {
      const { fixture } = await setup();
      const btn = host(fixture).querySelector<HTMLButtonElement>('button[type="submit"]')!;
      expect(btn.textContent!.trim()).toBe('Sign Up');
    });

    it('shows "Loading..." button text when loading is true but submitted is false', async () => {
      const { fixture, component } = await setup();
      component.loading.set(true);
      fixture.detectChanges();
      const btn = host(fixture).querySelector<HTMLButtonElement>('button[type="submit"]')!;
      expect(btn.textContent!.trim()).toBe('Loading...');
    });

    it('shows "Sign Up" button text when token is set and not loading', async () => {
      const { fixture, component } = await setup();
      component.turnstileToken.set('tok');
      fixture.detectChanges();
      const btn = host(fixture).querySelector<HTMLButtonElement>('button[type="submit"]')!;
      expect(btn.textContent!.trim()).toBe('Sign Up');
    });

    it('shows "Creating account..." button text when loading and submitted', async () => {
      const { fixture, component } = await setup();
      component.turnstileToken.set('tok');
      component.loading.set(true);
      component.submitted.set(true);
      fixture.detectChanges();
      const btn = host(fixture).querySelector<HTMLButtonElement>('button[type="submit"]')!;
      expect(btn.textContent!.trim()).toBe('Creating account...');
    });

    it('disables the submit button when disabled() is true', async () => {
      const { fixture } = await setup();
      const btn = host(fixture).querySelector<HTMLButtonElement>('button[type="submit"]')!;
      expect(btn.disabled).toBe(true);
    });

    it('hides app-password-strength-meter when password is empty', async () => {
      const { fixture } = await setup();
      expect(host(fixture).querySelector('app-password-strength-meter')).toBeNull();
    });

    it('shows app-password-strength-meter when password has content', async () => {
      const { fixture, component } = await setup();
      component.password.set('typing...');
      fixture.detectChanges();
      expect(host(fixture).querySelector('app-password-strength-meter')).toBeTruthy();
    });

    it('shows the form-hint paragraph with CAPTCHA message when token is absent', async () => {
      const { fixture } = await setup();
      const hint = host(fixture).querySelector<HTMLElement>('.form-hint');
      expect(hint).toBeTruthy();
      expect(hint!.textContent!.trim()).toContain('Waiting for security check');
    });

    it('hides the form-hint paragraph when all conditions are met', async () => {
      const { fixture, component } = await setup();
      component.turnstileToken.set('tok');
      component.email.set('b@c.com');
      component.password.set('strongPass!');
      component.displayName.set('Bob');
      component.strongPassword.set(true);
      fixture.detectChanges();
      expect(host(fixture).querySelector('.form-hint')).toBeNull();
    });
  });
});
