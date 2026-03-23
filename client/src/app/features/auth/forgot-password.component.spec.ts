import { Component, input, output, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { By } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { vi } from 'vitest';
import { NgxTurnstileModule } from 'ngx-turnstile';
import { ForgotPasswordComponent } from './forgot-password.component';
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
  reset = vi.fn();
}

// ---------------------------------------------------------------------------
// Fixtures

function makeApiError(message: string, code = 'SOME_ERROR', status = 400): HttpErrorResponse {
  return new HttpErrorResponse({ error: { error: { message, code } }, status });
}

// ---------------------------------------------------------------------------
// Setup

const mockForgotPassword = vi.fn();

function host(f: ComponentFixture<ForgotPasswordComponent>): HTMLElement {
  return f.nativeElement as HTMLElement;
}

async function setup(opts: { errorParam?: string | null } = {}): Promise<{
  fixture: ComponentFixture<ForgotPasswordComponent>;
  component: ForgotPasswordComponent;
  router: Router;
}> {
  const errorParam = opts.errorParam !== undefined ? opts.errorParam : null;

  await TestBed.configureTestingModule({
    imports: [ForgotPasswordComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            queryParamMap: {
              get: (k: string) => (k === 'error' ? errorParam : null),
            },
          },
        },
      },
      { provide: AuthService, useValue: { forgotPassword: mockForgotPassword } },
    ],
  })
    .overrideComponent(ForgotPasswordComponent, {
      remove: { imports: [NgxTurnstileModule] },
      add: { imports: [TurnstileStub] },
    })
    .compileComponents();

  const fixture = TestBed.createComponent(ForgotPasswordComponent);
  const component = fixture.componentInstance;
  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigate').mockResolvedValue(true);
  fixture.detectChanges();

  return { fixture, component, router };
}

// ---------------------------------------------------------------------------

describe('ForgotPasswordComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockForgotPassword.mockReset();
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

    it('starts with all signals at their empty/false defaults', async () => {
      const { component } = await setup();
      expect(component.email()).toBe('');
      expect(component.turnstileToken()).toBe('');
      expect(component.hp()).toBe('');
      expect(component.errorMessage()).toBe('');
      expect(component.navMessage()).toBe('');
      expect(component.responseMessage()).toBe('');
      expect(component.loading()).toBe(false);
      expect(component.submitted()).toBe(false);
      expect(component.isLocked()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('computed: showLoading', () => {
    it('is true when turnstileToken is empty', async () => {
      const { component } = await setup();
      expect(component.showLoading()).toBe(true);
    });

    it('is false when turnstileToken is set and loading is false', async () => {
      const { component } = await setup();
      component.turnstileToken.set('cf-token');
      expect(component.showLoading()).toBe(false);
    });

    it('is true when loading is true even with a turnstileToken', async () => {
      const { component } = await setup();
      component.turnstileToken.set('cf-token');
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
    it('is false when email and turnstileToken are set and no error or lock', async () => {
      const { component } = await setup();
      component.email.set('alice@example.com');
      component.turnstileToken.set('cf-token');
      expect(component.disabled()).toBe(false);
    });

    it('is true initially', async () => {
      const { component } = await setup();
      expect(component.disabled()).toBe(true);
    });

    it('is true when email is missing', async () => {
      const { component } = await setup();
      component.turnstileToken.set('cf-token');
      expect(component.disabled()).toBe(true);
    });

    it('is true when turnstileToken is missing', async () => {
      const { component } = await setup();
      component.email.set('alice@example.com');
      expect(component.disabled()).toBe(true);
    });

    it('is true when errorMessage is set', async () => {
      const { component } = await setup();
      component.email.set('alice@example.com');
      component.turnstileToken.set('cf-token');
      component.errorMessage.set('oops');
      expect(component.disabled()).toBeTruthy();
    });

    it('is true when isLocked is true', async () => {
      const { component } = await setup();
      component.email.set('alice@example.com');
      component.turnstileToken.set('cf-token');
      component.isLocked.set(true);
      expect(component.disabled()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('ngOnInit()', () => {
    it('sets navMessage and strips the query param when ?error=missing-token is present', async () => {
      const { component, router } = await setup({ errorParam: 'missing-token' });
      expect(component.navMessage()).toBe(
        'The reset link is invalid or has already been used. Please request a new one.',
      );
      expect(router.navigate).toHaveBeenCalledWith([], {
        replaceUrl: true,
        queryParams: {},
      });
    });

    it('leaves navMessage empty when no error query param is present', async () => {
      const { component } = await setup();
      expect(component.navMessage()).toBe('');
    });

    it('does not call router.navigate when no error query param is present', async () => {
      const { router } = await setup();
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('onCaptcha()', () => {
    it('sets turnstileToken on successful resolution', async () => {
      const { component } = await setup();
      component.onCaptcha('captcha-token-123');
      expect(component.turnstileToken()).toBe('captcha-token-123');
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

    it('clears a prior captcha errorMessage when the widget resolves successfully', async () => {
      const { component } = await setup();
      component.onCaptcha(null, true); // sets captchaError = true and errorMessage
      component.onCaptcha('new-token'); // should clear errorMessage because captchaError is true
      expect(component.errorMessage()).toBe('');
      expect(component.turnstileToken()).toBe('new-token');
    });

    it('does NOT clear errorMessage on success when the error was not captcha-related', async () => {
      const { component } = await setup();
      component.errorMessage.set('Some other error');
      component.onCaptcha('new-token'); // captchaError is false
      expect(component.errorMessage()).toBe('Some other error');
      expect(component.turnstileToken()).toBe('new-token');
    });
  });

  // -------------------------------------------------------------------------
  describe('setHP()', () => {
    it('sets hp when given a non-empty string', async () => {
      const { component } = await setup();
      component.setHP('bot@evil.com');
      expect(component.hp()).toBe('bot@evil.com');
    });

    it('does not set hp for an empty string', async () => {
      const { component } = await setup();
      component.setHP('');
      expect(component.hp()).toBe('');
    });

    it('sets hp from a native Event with a non-empty target value', async () => {
      const { component } = await setup();
      const inputEl = document.createElement('input');
      inputEl.value = 'bot@evil.com';
      const event = new Event('input');
      Object.defineProperty(event, 'target', { value: inputEl });
      component.setHP(event);
      expect(component.hp()).toBe('bot@evil.com');
    });

    it('does not update hp from a native Event when value equals current hp', async () => {
      const { component } = await setup();
      component.hp.set('existing@evil.com');
      const inputEl = document.createElement('input');
      inputEl.value = 'existing@evil.com';
      const event = new Event('input');
      Object.defineProperty(event, 'target', { value: inputEl });
      component.setHP(event);
      expect(component.hp()).toBe('existing@evil.com');
    });
  });

  // -------------------------------------------------------------------------
  describe('onSubmit(): honeypot', () => {
    it('delays 1 s, sets a vague error, and never calls auth.forgotPassword', async () => {
      const { component } = await setup();
      component.hp.set('bot@evil.com');

      const promise = component.onSubmit();
      vi.advanceTimersByTime(1000);
      await promise;

      expect(component.errorMessage()).toBe('There was an error.');
      expect(component.loading()).toBe(false);
      expect(mockForgotPassword).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('onSubmit(): success', () => {
    it('calls auth.forgotPassword with the email and turnstile token', async () => {
      const { component } = await setup();
      component.email.set('alice@example.com');
      component.turnstileToken.set('cf-token');
      mockForgotPassword.mockResolvedValue('If that email exists, a reset link has been sent.');

      await component.onSubmit();

      expect(mockForgotPassword).toHaveBeenCalledWith('alice@example.com', 'cf-token');
    });

    it('sets responseMessage to the server response string', async () => {
      const { component } = await setup();
      component.email.set('alice@example.com');
      component.turnstileToken.set('cf-token');
      mockForgotPassword.mockResolvedValue('If that email exists, a reset link has been sent.');

      await component.onSubmit();

      expect(component.responseMessage()).toBe(
        'If that email exists, a reset link has been sent.',
      );
    });

    it('sets isLocked to true after a successful submission', async () => {
      const { component } = await setup();
      component.email.set('alice@example.com');
      component.turnstileToken.set('cf-token');
      mockForgotPassword.mockResolvedValue('Check your inbox.');

      await component.onSubmit();

      expect(component.isLocked()).toBe(true);
    });

    it('clears a pre-existing errorMessage before submitting', async () => {
      const { component } = await setup();
      component.email.set('alice@example.com');
      component.turnstileToken.set('cf-token');
      component.errorMessage.set('stale error');
      mockForgotPassword.mockResolvedValue('Check your inbox.');

      await component.onSubmit();

      expect(component.errorMessage()).toBe('');
    });

    it('resets loading to false after the promise settles', async () => {
      const { component } = await setup();
      component.email.set('alice@example.com');
      component.turnstileToken.set('cf-token');
      mockForgotPassword.mockResolvedValue('Check your inbox.');

      await component.onSubmit();

      expect(component.loading()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('onSubmit(): error handling', () => {
    async function submitWithError(component: ForgotPasswordComponent, err: unknown) {
      component.email.set('alice@example.com');
      component.turnstileToken.set('cf-token');
      mockForgotPassword.mockRejectedValue(err);
      await component.onSubmit();
    }

    it('sets errorMessage from the API error response', async () => {
      const { component } = await setup();
      await submitWithError(component, makeApiError('Too many requests', 'RATE_LIMITED', 429));
      expect(component.errorMessage()).toBe('Too many requests');
    });

    it('sets errorMessage from a generic Error instance', async () => {
      const { component } = await setup();
      await submitWithError(component, new Error('Network failure'));
      expect(component.errorMessage()).toBe('Network failure');
    });

    it('resets the turnstile widget on error', async () => {
      const { fixture, component } = await setup();
      const stub = fixture.debugElement.query(By.directive(TurnstileStub))
        ?.componentInstance as TurnstileStub;
      await submitWithError(component, new Error('fail'));
      expect(stub.reset).toHaveBeenCalled();
    });

    it('clears turnstileToken on error', async () => {
      const { component } = await setup();
      await submitWithError(component, new Error('fail'));
      expect(component.turnstileToken()).toBe('');
    });

    it('resets loading to false after an error', async () => {
      const { component } = await setup();
      await submitWithError(component, new Error('fail'));
      expect(component.loading()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('template', () => {
    it('does not render .response-banner when responseMessage is empty', async () => {
      const { fixture } = await setup();
      expect(host(fixture).querySelector('.response-banner')).toBeNull();
    });

    it('renders .response-banner with correct text when responseMessage is set', async () => {
      const { fixture, component } = await setup();
      component.responseMessage.set('Check your inbox!');
      fixture.detectChanges();
      const banner = host(fixture).querySelector('.response-banner');
      expect(banner).toBeTruthy();
      expect(banner!.textContent!.trim()).toBe('Check your inbox!');
    });

    it('does not render .info-banner when navMessage is empty', async () => {
      const { fixture } = await setup();
      expect(host(fixture).querySelector('.info-banner')).toBeNull();
    });

    it('renders .info-banner with correct text when navMessage is set', async () => {
      const { fixture, component } = await setup();
      component.navMessage.set('Your session has expired.');
      fixture.detectChanges();
      const banner = host(fixture).querySelector('.info-banner');
      expect(banner).toBeTruthy();
      expect(banner!.textContent!.trim()).toBe('Your session has expired.');
    });

    it('does not render .error-banner when errorMessage is empty', async () => {
      const { fixture } = await setup();
      expect(host(fixture).querySelector('.error-banner')).toBeNull();
    });

    it('renders .error-banner with correct text when errorMessage is set', async () => {
      const { fixture, component } = await setup();
      component.errorMessage.set('Something went wrong');
      fixture.detectChanges();
      const banner = host(fixture).querySelector('.error-banner');
      expect(banner).toBeTruthy();
      expect(banner!.textContent!.trim()).toBe('Something went wrong');
    });

    it('disables the submit button initially', async () => {
      const { fixture } = await setup();
      const btn = host(fixture).querySelector<HTMLButtonElement>('button[type="submit"]')!;
      expect(btn.disabled).toBe(true);
    });

    it('enables the submit button when email and turnstileToken are set without errors', async () => {
      const { fixture, component } = await setup();
      component.email.set('alice@example.com');
      component.turnstileToken.set('cf-token');
      fixture.detectChanges();
      const btn = host(fixture).querySelector<HTMLButtonElement>('button[type="submit"]')!;
      expect(btn.disabled).toBe(false);
    });

    it('shows "Loading..." button text when no token is present', async () => {
      const { fixture } = await setup();
      const btn = host(fixture).querySelector<HTMLButtonElement>('button[type="submit"]')!;
      expect(btn.textContent!.trim()).toBe('Loading...');
    });

    it('shows "Recover" button text when token is set and not loading', async () => {
      const { fixture, component } = await setup();
      component.turnstileToken.set('cf-token');
      fixture.detectChanges();
      const btn = host(fixture).querySelector<HTMLButtonElement>('button[type="submit"]')!;
      expect(btn.textContent!.trim()).toBe('Recover');
    });

    it('shows "Checking..." button text when both loading and submitted are true', async () => {
      const { fixture, component } = await setup();
      component.turnstileToken.set('cf-token');
      component.loading.set(true);
      component.submitted.set(true);
      fixture.detectChanges();
      const btn = host(fixture).querySelector<HTMLButtonElement>('button[type="submit"]')!;
      expect(btn.textContent!.trim()).toBe('Checking...');
    });
  });
});
