import { Component, input, output, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { NgxTurnstileModule } from 'ngx-turnstile';
import { ResetPasswordComponent } from './reset-password.component';
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

const mockResetPassword = vi.fn();

// ---------------------------------------------------------------------------
// Setup

async function setup(opts: { token?: string | null } = {}): Promise<{
  fixture: ComponentFixture<ResetPasswordComponent>;
  component: ResetPasswordComponent;
  router: Router;
}> {
  const token = opts.token !== undefined ? opts.token : 'test-reset-token';

  await TestBed.configureTestingModule({
    imports: [ResetPasswordComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      // Override the ActivatedRoute AFTER provideRouter so it takes precedence
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            queryParamMap: {
              get: (k: string) => (k === 'token' ? token : null),
            },
          },
        },
      },
      { provide: AuthService, useValue: { resetPassword: mockResetPassword } },
    ],
  })
    .overrideComponent(ResetPasswordComponent, {
      remove: { imports: [NgxTurnstileModule] },
      add: { imports: [TurnstileStub] },
    })
    .compileComponents();

  const fixture = TestBed.createComponent(ResetPasswordComponent);
  const component = fixture.componentInstance;
  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigate').mockResolvedValue(true);
  fixture.detectChanges();

  return { fixture, component, router };
}

// ---------------------------------------------------------------------------

describe('ResetPasswordComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockResetPassword.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  // -------------------------------------------------------------------------
  describe('initial state', () => {
    it('starts with all signals at their empty/false defaults', async () => {
      const { component } = await setup();
      expect(component.password()).toBe('');
      expect(component.confirmPassword()).toBe('');
      expect(component.turnstileToken()).toBe('');
      expect(component.hp()).toBe('');
      expect(component.errorMessage()).toBe('');
      expect(component.responseMessage()).toBe('');
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

    it('returns required fields message when token is set but passwords are empty', async () => {
      const { component } = await setup();
      component.turnstileToken.set('cf-token');
      expect(component.disabledHint()).toBe('Please fill in all required fields.');
    });

    it('returns empty string when passwords and token are set', async () => {
      const { component } = await setup();
      component.password.set('new-password');
      component.confirmPassword.set('new-password');
      component.turnstileToken.set('cf-token');
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
      component.turnstileToken.set('cf-token');
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
    it('is false when passwords match, turnstileToken is set, and no error or lock', async () => {
      const { component } = await setup();
      component.password.set('new-password');
      component.confirmPassword.set('new-password');
      component.turnstileToken.set('cf-token');
      expect(component.disabled()).toBe(false);
    });

    it('is true initially', async () => {
      const { component } = await setup();
      expect(component.disabled()).toBe(true);
    });

    it('is true when password is missing', async () => {
      const { component } = await setup();
      component.turnstileToken.set('cf-token');
      expect(component.disabled()).toBe(true);
    });

    it('is true when turnstileToken is missing', async () => {
      const { component } = await setup();
      component.password.set('new-password');
      // turnstileToken is '' — !turnstileToken().length is a direct term in disabled()
      expect(component.disabled()).toBe(true);
    });

    it('is false even when errorMessage is set (errorMessage no longer gates the button)', async () => {
      const { component } = await setup();
      component.password.set('new-password');
      component.confirmPassword.set('new-password');
      component.turnstileToken.set('cf-token');
      component.errorMessage.set('Something went wrong');
      expect(component.disabled()).toBe(false);
    });

    it('is true when isLocked is true', async () => {
      const { component } = await setup();
      component.password.set('new-password');
      component.confirmPassword.set('new-password');
      component.turnstileToken.set('cf-token');
      component.isLocked.set(true);
      expect(component.disabled()).toBe(true);
    });

    it('is true when confirmPassword is missing', async () => {
      const { component } = await setup();
      component.password.set('new-password');
      component.turnstileToken.set('cf-token');
      expect(component.disabled()).toBe(true);
    });

    it('is true when passwords do not match', async () => {
      const { component } = await setup();
      component.password.set('new-password');
      component.confirmPassword.set('different-password');
      component.turnstileToken.set('cf-token');
      expect(component.disabled()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('ngOnInit()', () => {
    it('strips the token from the URL when a token is present', async () => {
      const { router } = await setup({ token: 'test-reset-token' });
      // The URL-strip navigate call uses replaceUrl: true
      expect(router.navigate).toHaveBeenCalledWith(
        [],
        expect.objectContaining({ replaceUrl: true }),
      );
    });

    it('redirects to /forgot-password with missing-token error when token is absent', async () => {
      const { router } = await setup({ token: null });
      // The first navigate call is redirectWithError() — before the URL strip
      expect(router.navigate).toHaveBeenNthCalledWith(1, ['/forgot-password'], {
        queryParams: { error: 'missing-token' },
      });
    });
  });

  // -------------------------------------------------------------------------
  describe('onCaptcha()', () => {
    it('sets turnstileToken to the provided string on success', async () => {
      const { component } = await setup();
      component.onCaptcha('captcha-token-abc');
      expect(component.turnstileToken()).toBe('captcha-token-abc');
    });

    it('clears errorMessage on successful captcha resolution', async () => {
      const { component } = await setup();
      component.errorMessage.set('previous error');
      component.onCaptcha('captcha-token-abc');
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
  describe('redirectWithError()', () => {
    it('calls router.navigate to /forgot-password with missing-token error', async () => {
      const { component, router } = await setup();
      // Reset spy count from ngOnInit calls
      vi.mocked(router.navigate).mockClear();
      component.redirectWithError();
      expect(router.navigate).toHaveBeenCalledWith(['/forgot-password'], {
        queryParams: { error: 'missing-token' },
      });
    });
  });

  // -------------------------------------------------------------------------
  describe('onSubmit(): state reset', () => {
    it('clears errorMessage and responseMessage and sets submitted/loading before awaiting', async () => {
      const { component } = await setup();
      // Pre-set a stale error to verify it gets cleared
      component.errorMessage.set('stale error');
      component.password.set('new-password');
      component.confirmPassword.set('new-password');
      component.turnstileToken.set('cf-token');

      // Use a never-resolving promise so we can inspect mid-flight state
      mockResetPassword.mockReturnValue(new Promise((resolve) => void resolve));
      const promise = component.onSubmit();

      // Synchronously check the mid-flight state — before the promise resolves
      expect(component.submitted()).toBe(true);
      expect(component.loading()).toBe(true);
      expect(component.errorMessage()).toBe('');
      expect(component.responseMessage()).toBe('');

      // Clean up — we don't await the never-resolving promise; just discard it
      void promise;
    });
  });

  // -------------------------------------------------------------------------
  describe('onSubmit(): honeypot', () => {
    it('delays 1 s, sets a vague error, and never calls auth.resetPassword', async () => {
      const { component } = await setup();
      component.hp.set('bot@evil.com');

      const promise = component.onSubmit();
      vi.advanceTimersByTime(1000);
      await promise;

      expect(component.errorMessage()).toBe('There was an error.');
      expect(component.loading()).toBe(false);
      expect(component.submitted()).toBe(false);
      expect(mockResetPassword).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('onSubmit(): success', () => {
    it('calls auth.resetPassword with the reset token, password, and captcha token', async () => {
      const { component } = await setup({ token: 'test-reset-token' });
      component.password.set('new-password');
      component.confirmPassword.set('new-password');
      component.turnstileToken.set('cf-token');
      mockResetPassword.mockResolvedValue(undefined);

      await component.onSubmit();

      expect(mockResetPassword).toHaveBeenCalledWith(
        'test-reset-token',
        'new-password',
        'cf-token',
      );
    });

    it('sets a success responseMessage after the promise resolves', async () => {
      const { component } = await setup();
      component.password.set('new-password');
      component.confirmPassword.set('new-password');
      component.turnstileToken.set('cf-token');
      mockResetPassword.mockResolvedValue(undefined);

      await component.onSubmit();

      expect(component.responseMessage()).toBe(
        'Success! Your password has been changed. You will be redirected to login with your new password.',
      );
    });

    it('navigates to /login after a 3-second delay following success', async () => {
      const { component, router } = await setup();
      component.password.set('new-password');
      component.confirmPassword.set('new-password');
      component.turnstileToken.set('cf-token');
      mockResetPassword.mockResolvedValue(undefined);

      await component.onSubmit();
      vi.advanceTimersByTime(3000);

      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('resets loading to false after the promise settles', async () => {
      const { component } = await setup();
      component.password.set('new-password');
      component.confirmPassword.set('new-password');
      component.turnstileToken.set('cf-token');
      mockResetPassword.mockResolvedValue(undefined);

      await component.onSubmit();

      expect(component.loading()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('onSubmit(): error', () => {
    it('sets a generic errorMessage and clears loading on failure', async () => {
      const { component } = await setup();
      component.password.set('new-password');
      component.confirmPassword.set('new-password');
      component.turnstileToken.set('cf-token');
      mockResetPassword.mockRejectedValue(new Error('invalid token'));

      await component.onSubmit();

      expect(component.errorMessage()).toBe(
        'This reset link is invalid or has expired. Please request a new one.',
      );
      expect(component.loading()).toBe(false);
      expect(component.responseMessage()).toBe('');
      expect(component.turnstileToken()).toBe('');
    });

    it('resets the turnstile widget after a failed submission', async () => {
      const { fixture, component } = await setup();
      const stub = fixture.debugElement.query(By.directive(TurnstileStub))
        ?.componentInstance as TurnstileStub;
      component.password.set('new-password');
      component.confirmPassword.set('new-password');
      component.turnstileToken.set('cf-token');
      mockResetPassword.mockRejectedValue(new Error('invalid'));

      await component.onSubmit();

      expect(stub.reset).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('template', () => {
    it('does not render .response-banner when responseMessage is empty', async () => {
      const { fixture } = await setup();
      expect(fixture.nativeElement.querySelector('.response-banner')).toBeNull();
    });

    it('renders .response-banner with correct text when responseMessage is set', async () => {
      const { fixture, component } = await setup();
      component.responseMessage.set('Success! Your password has been changed.');
      fixture.detectChanges();
      const banner = fixture.nativeElement.querySelector('.response-banner');
      expect(banner).toBeTruthy();
      expect(banner.textContent.trim()).toBe('Success! Your password has been changed.');
    });

    it('does not render .error-banner when errorMessage is empty', async () => {
      const { fixture } = await setup();
      expect(fixture.nativeElement.querySelector('.error-banner')).toBeNull();
    });

    it('renders .error-banner with correct text when errorMessage is set', async () => {
      const { fixture, component } = await setup();
      component.errorMessage.set('Something went wrong');
      fixture.detectChanges();
      const banner = fixture.nativeElement.querySelector('.error-banner');
      expect(banner).toBeTruthy();
      expect(banner.textContent.trim()).toBe('Something went wrong');
    });

    it('disables the submit button initially', async () => {
      const { fixture } = await setup();
      const btn = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('enables the submit button when passwords match and turnstileToken is set', async () => {
      const { fixture, component } = await setup();
      component.password.set('new-password');
      component.confirmPassword.set('new-password');
      component.turnstileToken.set('cf-token');
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    it('shows a field-error span when confirmPassword is non-empty and differs from password', async () => {
      const { fixture, component } = await setup();
      component.password.set('abc');
      component.confirmPassword.set('xyz');
      fixture.detectChanges();
      const err = fixture.nativeElement.querySelector('.field-error') as HTMLElement;
      expect(err).toBeTruthy();
      expect(err.textContent!.trim()).toBe('Passwords do not match');
    });

    it('does not show a field-error span when confirmPassword is empty', async () => {
      const { fixture, component } = await setup();
      component.password.set('abc');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.field-error')).toBeNull();
    });

    it('shows "Reset" button text when not loading (regardless of CAPTCHA token)', async () => {
      const { fixture } = await setup();
      const btn = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(btn.textContent!.trim()).toBe('Reset');
    });

    it('shows "Loading..." button text when loading is true but submitted is false', async () => {
      const { fixture, component } = await setup();
      component.loading.set(true);
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(btn.textContent!.trim()).toBe('Loading...');
    });

    it('shows "Resetting..." button text when both loading and submitted are true', async () => {
      const { fixture, component } = await setup();
      component.loading.set(true);
      component.submitted.set(true);
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(btn.textContent!.trim()).toBe('Resetting...');
    });

    it('shows "Reset" button text when turnstileToken is set and neither loading nor submitted', async () => {
      const { fixture, component } = await setup();
      component.turnstileToken.set('cf-token');
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(btn.textContent!.trim()).toBe('Reset');
    });

    it('shows the form-hint paragraph with CAPTCHA message when token is absent', async () => {
      const { fixture } = await setup();
      const hint = fixture.nativeElement.querySelector('.form-hint') as HTMLElement;
      expect(hint).toBeTruthy();
      expect(hint.textContent!.trim()).toContain('Waiting for security check');
    });

    it('hides the form-hint paragraph when passwords and token are set', async () => {
      const { fixture, component } = await setup();
      component.password.set('new-password');
      component.confirmPassword.set('new-password');
      component.turnstileToken.set('cf-token');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.form-hint')).toBeNull();
    });
  });
});
