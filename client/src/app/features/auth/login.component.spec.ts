import { Component, input, output, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { vi } from 'vitest';
import { NgxTurnstileModule } from 'ngx-turnstile';
import { LoginComponent } from './login.component';
import { AuthService } from '../../core/services/auth.service';

// ---------------------------------------------------------------------------
// Stubs

/** Replaces NgxTurnstileModule so no Cloudflare JS is loaded in JSDOM. */
// eslint-disable-next-line @angular-eslint/component-selector
@Component({ selector: 'ngx-turnstile', template: '' })
class TurnstileStub {
  readonly siteKey = input<string>();
  readonly theme = input<string>();
  readonly resolved = output<string | null>();
  readonly errored = output<string | null>();
}

// ---------------------------------------------------------------------------
// Fixtures

const fakeUser = { id: 1, email: 'a@b.com', displayName: 'Alice', role: 'player' as const };

function makeApiError(message: string, code = 'SOME_ERROR', status = 400): HttpErrorResponse {
  return new HttpErrorResponse({ error: { error: { message, code } }, status });
}

// ---------------------------------------------------------------------------
// Setup

const mockLogin = vi.fn();

function host(f: ComponentFixture<LoginComponent>): HTMLElement {
  return f.nativeElement as HTMLElement;
}

async function setup(): Promise<{
  fixture: ComponentFixture<LoginComponent>;
  component: LoginComponent;
  router: Router;
}> {
  await TestBed.configureTestingModule({
    imports: [LoginComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: { login: mockLogin } },
    ],
  })
    .overrideComponent(LoginComponent, {
      remove: { imports: [NgxTurnstileModule] },
      add: { imports: [TurnstileStub] },
    })
    .compileComponents();

  const fixture = TestBed.createComponent(LoginComponent);
  const component = fixture.componentInstance;
  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigate').mockResolvedValue(true);
  fixture.detectChanges();
  return { fixture, component, router };
}

// ---------------------------------------------------------------------------

describe('LoginComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockLogin.mockReset();
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
      expect(component.turnstileToken()).toBe('');
      expect(component.errorMessage()).toBe('');
      expect(component.hp()).toBe('');
      expect(component.loading()).toBe(false);
      expect(component.submitted()).toBe(false);
      expect(component.isLocked()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('computed: disabledHint', () => {
    it('returns empty string when loading is true', async () => {
      const { component } = await setup();
      component.loading.set(true);
      expect(component.disabledHint()).toBe('');
    });

    it('returns empty string when isLocked is true', async () => {
      const { component } = await setup();
      component.isLocked.set(true);
      expect(component.disabledHint()).toBe('');
    });

    it('returns CAPTCHA wait message when not locked/loading and token is empty', async () => {
      const { component } = await setup();
      expect(component.disabledHint()).toBe('Waiting for security check to complete\u2026');
    });

    it('returns required fields message when token is set but fields are empty', async () => {
      const { component } = await setup();
      component.turnstileToken.set('tok');
      expect(component.disabledHint()).toBe('Please fill in all required fields.');
    });

    it('returns empty string when all conditions are met', async () => {
      const { component } = await setup();
      component.email.set('a@b.com');
      component.password.set('secret');
      component.turnstileToken.set('tok');
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
  describe('computed: showWorking', () => {
    it('is true when both loading and submitted are true', async () => {
      const { component } = await setup();
      component.loading.set(true);
      component.submitted.set(true);
      expect(component.showWorking()).toBe(true);
    });

    it('is false when only loading is true', async () => {
      const { component } = await setup();
      component.loading.set(true);
      expect(component.showWorking()).toBe(false);
    });

    it('is false when only submitted is true', async () => {
      const { component } = await setup();
      component.submitted.set(true);
      expect(component.showWorking()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('computed: disabled', () => {
    it('is false when email, password and token are all set', async () => {
      const { component } = await setup();
      component.email.set('a@b.com');
      component.password.set('secret');
      component.turnstileToken.set('tok');
      expect(component.disabled()).toBe(false);
    });

    it('is true initially (no email, no password, no token)', async () => {
      const { component } = await setup();
      expect(component.disabled()).toBe(true);
    });

    it('is true when email is missing', async () => {
      const { component } = await setup();
      component.password.set('secret');
      component.turnstileToken.set('tok');
      expect(component.disabled()).toBe(true);
    });

    it('is true when password is missing', async () => {
      const { component } = await setup();
      component.email.set('a@b.com');
      component.turnstileToken.set('tok');
      expect(component.disabled()).toBe(true);
    });

    it('is true when token is missing', async () => {
      const { component } = await setup();
      component.email.set('a@b.com');
      component.password.set('secret');
      expect(component.disabled()).toBe(true);
    });

    it('is false even when errorMessage is set (errorMessage no longer gates the button)', async () => {
      const { component } = await setup();
      component.email.set('a@b.com');
      component.password.set('secret');
      component.turnstileToken.set('tok');
      component.errorMessage.set('oops');
      expect(component.disabled()).toBe(false);
    });

    it('is true when isLocked is true', async () => {
      const { component } = await setup();
      component.email.set('a@b.com');
      component.password.set('secret');
      component.turnstileToken.set('tok');
      component.isLocked.set(true);
      expect(component.disabled()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('onCaptcha()', () => {
    it('sets turnstileToken on successful resolution', async () => {
      const { component } = await setup();
      component.onCaptcha('captcha-token-123');
      expect(component.turnstileToken()).toBe('captcha-token-123');
      expect(component.errorMessage()).toBe('');
    });

    it('sets turnstileToken to empty string when msg is null', async () => {
      const { component } = await setup();
      component.turnstileToken.set('old-token');
      component.onCaptcha(null);
      expect(component.turnstileToken()).toBe('');
    });

    it('sets CAPTCHA errorMessage and clears token on error', async () => {
      const { component } = await setup();
      component.turnstileToken.set('old-token');
      component.onCaptcha('widget error', true);
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
      // Signal should still equal the existing value (no spurious re-set)
      expect(component.hp()).toBe('existing@evil.com');
    });
  });

  // -------------------------------------------------------------------------
  describe('onSubmit(): honeypot', () => {
    it('delays 1 s, sets a vague error, and never calls auth.login', async () => {
      const { component } = await setup();
      component.hp.set('bot@evil.com');

      const promise = component.onSubmit();
      vi.advanceTimersByTime(1000);
      await promise;

      expect(component.errorMessage()).toBe('There was an error.');
      expect(component.loading()).toBe(false);
      expect(component.submitted()).toBe(false);
      expect(mockLogin).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('onSubmit(): success', () => {
    it('calls auth.login with email, password and turnstile token', async () => {
      const { component } = await setup();
      component.email.set('a@b.com');
      component.password.set('secret');
      component.turnstileToken.set('tok');
      mockLogin.mockResolvedValue(fakeUser);

      await component.onSubmit();

      expect(mockLogin).toHaveBeenCalledWith('a@b.com', 'secret', 'tok');
    });

    it('navigates to /games on success', async () => {
      const { component, router } = await setup();
      component.email.set('a@b.com');
      component.password.set('secret');
      component.turnstileToken.set('tok');
      mockLogin.mockResolvedValue(fakeUser);

      await component.onSubmit();

      expect(router.navigate).toHaveBeenCalledWith(['/games']);
    });

    it('clears a pre-existing errorMessage before submitting', async () => {
      const { component } = await setup();
      component.email.set('a@b.com');
      component.password.set('secret');
      component.turnstileToken.set('tok');
      component.errorMessage.set('stale error');
      mockLogin.mockResolvedValue(fakeUser);

      await component.onSubmit();

      expect(component.errorMessage()).toBe('');
    });

    it('resets loading to false after success', async () => {
      const { component } = await setup();
      mockLogin.mockResolvedValue(fakeUser);
      component.email.set('a@b.com');
      component.password.set('secret');
      component.turnstileToken.set('tok');

      await component.onSubmit();

      expect(component.loading()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('onSubmit(): error handling', () => {
    async function submitWithError(
      fixture: ComponentFixture<LoginComponent>,
      component: LoginComponent,
      err: unknown,
    ) {
      component.email.set('a@b.com');
      component.password.set('secret');
      component.turnstileToken.set('tok');
      mockLogin.mockRejectedValue(err);
      await component.onSubmit();
    }

    it('sets errorMessage from the API error response', async () => {
      const { fixture, component } = await setup();
      await submitWithError(fixture, component, makeApiError('Invalid credentials'));
      expect(component.errorMessage()).toBe('Invalid credentials');
    });

    it('sets isLocked and custom errorMessage when code is ACCOUNT_LOCKED', async () => {
      const { fixture, component } = await setup();
      await submitWithError(
        fixture,
        component,
        makeApiError('Account locked for 15 minutes', 'ACCOUNT_LOCKED', 403),
      );
      expect(component.isLocked()).toBe(true);
      expect(component.errorMessage()).toBe('Account locked for 15 minutes');
    });

    it('does not set isLocked for non-ACCOUNT_LOCKED error codes', async () => {
      const { fixture, component } = await setup();
      await submitWithError(fixture, component, makeApiError('Bad request', 'VALIDATION_ERROR'));
      expect(component.isLocked()).toBe(false);
    });

    it('sets errorMessage from a generic Error instance', async () => {
      const { fixture, component } = await setup();
      await submitWithError(fixture, component, new Error('Network failure'));
      expect(component.errorMessage()).toBe('Network failure');
    });

    it('uses the default message for unknown error types', async () => {
      const { fixture, component } = await setup();
      await submitWithError(fixture, component, 'some string error');
      expect(component.errorMessage()).toBe('Login failed. Please try again.');
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

    it('shows "Sign In" button text when not loading (regardless of CAPTCHA token)', async () => {
      const { fixture } = await setup();
      const btn = host(fixture).querySelector<HTMLButtonElement>('button[type="submit"]')!;
      expect(btn.textContent!.trim()).toBe('Sign In');
    });

    it('shows "Loading..." button text when loading is true but submitted is false', async () => {
      const { fixture, component } = await setup();
      component.loading.set(true);
      fixture.detectChanges();
      const btn = host(fixture).querySelector<HTMLButtonElement>('button[type="submit"]')!;
      expect(btn.textContent!.trim()).toBe('Loading...');
    });

    it('shows "Sign In" button text when token is set and not loading', async () => {
      const { fixture, component } = await setup();
      component.turnstileToken.set('tok');
      fixture.detectChanges();
      const btn = host(fixture).querySelector<HTMLButtonElement>('button[type="submit"]')!;
      expect(btn.textContent!.trim()).toBe('Sign In');
    });

    it('shows "Signing in..." button text when loading and submitted', async () => {
      const { fixture, component } = await setup();
      component.turnstileToken.set('tok');
      component.loading.set(true);
      component.submitted.set(true);
      fixture.detectChanges();
      const btn = host(fixture).querySelector<HTMLButtonElement>('button[type="submit"]')!;
      expect(btn.textContent!.trim()).toBe('Signing in...');
    });

    it('disables the submit button when disabled() is true', async () => {
      const { fixture } = await setup();
      const btn = host(fixture).querySelector<HTMLButtonElement>('button[type="submit"]')!;
      expect(btn.disabled).toBe(true);
    });

    it('enables the submit button when all required fields are filled', async () => {
      const { fixture, component } = await setup();
      component.email.set('a@b.com');
      component.password.set('secret');
      component.turnstileToken.set('tok');
      fixture.detectChanges();
      const btn = host(fixture).querySelector<HTMLButtonElement>('button[type="submit"]')!;
      expect(btn.disabled).toBe(false);
    });

    it('shows the form-hint paragraph with CAPTCHA message when token is absent', async () => {
      const { fixture } = await setup();
      const hint = host(fixture).querySelector<HTMLElement>('.form-hint');
      expect(hint).toBeTruthy();
      expect(hint!.textContent!.trim()).toContain('Waiting for security check');
    });

    it('hides the form-hint paragraph when all required fields are filled', async () => {
      const { fixture, component } = await setup();
      component.email.set('a@b.com');
      component.password.set('secret');
      component.turnstileToken.set('tok');
      fixture.detectChanges();
      expect(host(fixture).querySelector('.form-hint')).toBeNull();
    });
  });
});
