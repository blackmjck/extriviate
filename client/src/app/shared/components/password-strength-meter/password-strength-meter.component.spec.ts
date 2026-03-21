import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import {
  PasswordStrengthMeterComponent,
  ZXCVBN_TOKEN,
  zxcvbnScore,
} from './password-strength-meter.component';

// ---------------------------------------------------------------------------

const mockZxcvbn = vi.fn();

// ---------------------------------------------------------------------------
// Fixtures

function zxcvbnResult(score: zxcvbnScore, warning = '', suggestions: string[] = []) {
  return { score, feedback: { warning, suggestions } };
}

// ---------------------------------------------------------------------------
// Test helpers

function setup(opts: { minLength?: number; minLevel?: number } = {}) {
  const mockCheckPwned = vi.fn<() => Promise<boolean | undefined>>().mockResolvedValue(false);

  TestBed.configureTestingModule({
    imports: [PasswordStrengthMeterComponent],
    providers: [
      provideZonelessChangeDetection(),
      { provide: ZXCVBN_TOKEN, useValue: mockZxcvbn },
      { provide: AuthService, useValue: { checkPwnedPassword: mockCheckPwned } },
    ],
  });

  const fixture = TestBed.createComponent(PasswordStrengthMeterComponent);

  if (opts.minLength !== undefined) fixture.componentRef.setInput('minLength', opts.minLength);
  if (opts.minLevel !== undefined) fixture.componentRef.setInput('minLevel', opts.minLevel);

  return { fixture, component: fixture.componentInstance, mockCheckPwned };
}

/**
 * Sets the password input then optionally advances the fake timer to fire the
 * debounce, flushes async microtasks (checkPwnedPassword), and triggers change
 * detection. Must be called inside an async test with vi.useFakeTimers() active.
 */
async function setPassword(
  fixture: ComponentFixture<PasswordStrengthMeterComponent>,
  password: string,
  advance = true,
): Promise<void> {
  fixture.componentRef.setInput('password', password);
  fixture.detectChanges();
  if (advance) {
    vi.advanceTimersByTime(350); // fire the debounceTime(350) timer
    await Promise.resolve(); // flush microtasks: toSignal update + checkPassword async
    fixture.detectChanges();
  }
}

function host(fixture: ComponentFixture<PasswordStrengthMeterComponent>): HTMLElement {
  return fixture.nativeElement;
}

// ---------------------------------------------------------------------------

describe('PasswordStrengthMeterComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Stable default so tests that don't care about score always see valid zxcvbn output
    mockZxcvbn.mockReturnValue(zxcvbnResult(2));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  // -------------------------------------------------------------------------
  describe('template visibility', () => {
    it('renders nothing when the password input is empty', () => {
      const { fixture } = setup();
      fixture.detectChanges();
      expect(host(fixture).querySelector('.strength-meter')).toBeNull();
    });

    it('renders the meter as soon as the password input is non-empty', async () => {
      const { fixture } = setup();
      await setPassword(fixture, 'x');
      expect(host(fixture).querySelector('.strength-meter')).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe('too-short message', () => {
    it('shows the minimum-length message when password is below the default minLength (8)', async () => {
      const { fixture } = setup();
      await setPassword(fixture, 'abc'); // 3 chars

      const warning = host(fixture).querySelector('.warning');
      expect(warning?.textContent).toContain('Passwords must be at least 8 characters long.');
    });

    it('shows the correct threshold when a custom minLength is provided', async () => {
      const { fixture } = setup({ minLength: 12 });
      await setPassword(fixture, 'password'); // 8 chars < 12

      const warning = host(fixture).querySelector('.warning');
      expect(warning?.textContent).toContain('Passwords must be at least 12 characters long.');
    });

    it('hides the too-short message once the password reaches minLength', async () => {
      const { fixture } = setup();
      await setPassword(fixture, 'password1'); // 9 chars >= 8

      // bars container is visible → tooShort block is gone
      expect(host(fixture).querySelectorAll('.bar').length).toBe(5);
      expect(host(fixture).querySelector('.warning')?.textContent ?? '').not.toContain(
        'Passwords must be at least',
      );
    });

    it('never shows a too-short message when minLength is 0', async () => {
      const { fixture } = setup({ minLength: 0 });
      await setPassword(fixture, 'hi'); // 2 chars, but guard is disabled

      expect(host(fixture).querySelectorAll('.bar').length).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  describe('strength bars', () => {
    it('renders exactly 5 bar segments', async () => {
      const { fixture } = setup();
      await setPassword(fixture, 'password1');
      expect(host(fixture).querySelectorAll('.bar').length).toBe(5);
    });

    it('fills bars 0 through score with the score-colour class and leaves the rest bg-0', async () => {
      mockZxcvbn.mockReturnValue(zxcvbnResult(2)); // score 2 → bars 0,1,2 get bg-3; 3,4 get bg-0
      const { fixture } = setup();
      await setPassword(fixture, 'password1');

      const bars = Array.from(host(fixture).querySelectorAll<HTMLElement>('.bar'));
      expect(bars[0].classList.contains('bg-3')).toBe(true);
      expect(bars[1].classList.contains('bg-3')).toBe(true);
      expect(bars[2].classList.contains('bg-3')).toBe(true);
      expect(bars[3].classList.contains('bg-0')).toBe(true);
      expect(bars[4].classList.contains('bg-0')).toBe(true);
    });

    it('fills only the first bar with bg-1 for score 0', async () => {
      mockZxcvbn.mockReturnValue(zxcvbnResult(0));
      const { fixture } = setup();
      await setPassword(fixture, 'password1');

      const bars = Array.from(host(fixture).querySelectorAll<HTMLElement>('.bar'));
      expect(bars[0].classList.contains('bg-1')).toBe(true);
      // every other bar is empty
      expect(bars.slice(1).every((b) => b.classList.contains('bg-0'))).toBe(true);
    });

    it('fills all 5 bars with bg-5 for score 4', async () => {
      mockZxcvbn.mockReturnValue(zxcvbnResult(4));
      const { fixture } = setup();
      await setPassword(fixture, 'Tr0ub4dor&3!@#$');

      expect(host(fixture).querySelectorAll('.bar.bg-0').length).toBe(0);
      const bars = Array.from(host(fixture).querySelectorAll<HTMLElement>('.bar'));
      expect(bars.every((b) => b.classList.contains('bg-5'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('score labels', () => {
    const CASES: [zxcvbnScore, string][] = [
      [0, 'Very weak'],
      [1, 'Weak'],
      [2, 'Fair'],
      [3, 'Strong'],
      [4, 'Very strong'],
    ];

    for (const [score, label] of CASES) {
      it(`displays "${label}" for score ${score}`, async () => {
        mockZxcvbn.mockReturnValue(zxcvbnResult(score));
        const { fixture } = setup();
        await setPassword(fixture, 'password1');
        expect(host(fixture).querySelector('.label')?.textContent?.trim()).toBe(label);
      });
    }
  });

  // -------------------------------------------------------------------------
  describe('color class on label', () => {
    it('applies level-1 to the label for score 0', async () => {
      mockZxcvbn.mockReturnValue(zxcvbnResult(0));
      const { fixture } = setup();
      await setPassword(fixture, 'password1');
      expect(host(fixture).querySelector('.label')?.classList.contains('level-1')).toBe(true);
    });

    it('applies level-3 to the label for score 2', async () => {
      mockZxcvbn.mockReturnValue(zxcvbnResult(2));
      const { fixture } = setup();
      await setPassword(fixture, 'password1');
      expect(host(fixture).querySelector('.label')?.classList.contains('level-3')).toBe(true);
    });

    it('applies level-5 to the label for score 4', async () => {
      mockZxcvbn.mockReturnValue(zxcvbnResult(4));
      const { fixture } = setup();
      await setPassword(fixture, 'password1');
      expect(host(fixture).querySelector('.label')?.classList.contains('level-5')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('pass output', () => {
    it('emits false on initial change detection (no password, score is -1)', () => {
      const { fixture, component } = setup();
      const emissions: boolean[] = [];
      component.pass.subscribe((v) => emissions.push(v));

      fixture.detectChanges(); // effect runs: score=-1, -1 >= 2 → false
      expect(emissions).toContain(false);
    });

    it('emits true when score meets the default minLevel of 2', async () => {
      mockZxcvbn.mockReturnValue(zxcvbnResult(2));
      const { fixture, component } = setup();
      const emissions: boolean[] = [];
      component.pass.subscribe((v) => emissions.push(v));
      fixture.detectChanges();

      await setPassword(fixture, 'password1'); // score becomes 2 → 2 >= 2 → true
      expect(emissions.at(-1)).toBe(true);
    });

    it('emits false when score is below the default minLevel of 2', async () => {
      mockZxcvbn.mockReturnValue(zxcvbnResult(1));
      const { fixture, component } = setup();
      const emissions: boolean[] = [];
      component.pass.subscribe((v) => emissions.push(v));
      fixture.detectChanges();

      await setPassword(fixture, 'password1'); // score=1 < minLevel=2 → false
      expect(emissions.at(-1)).toBe(false);
    });

    it('emits false when score is one below a custom minLevel (boundary)', async () => {
      mockZxcvbn.mockReturnValue(zxcvbnResult(2));
      const { fixture, component } = setup({ minLevel: 3 }); // need score >= 3
      const emissions: boolean[] = [];
      component.pass.subscribe((v) => emissions.push(v));
      fixture.detectChanges();

      await setPassword(fixture, 'password1'); // score=2 < minLevel=3 → false
      expect(emissions.at(-1)).toBe(false);
    });

    it('emits true when score exactly equals a custom minLevel', async () => {
      mockZxcvbn.mockReturnValue(zxcvbnResult(3));
      const { fixture, component } = setup({ minLevel: 3 });
      const emissions: boolean[] = [];
      component.pass.subscribe((v) => emissions.push(v));
      fixture.detectChanges();

      await setPassword(fixture, 'password1'); // score=3 >= minLevel=3 → true
      expect(emissions.at(-1)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('HIBP integration', () => {
    it('calls checkPwnedPassword after the debounce when password is at minLength (8 chars)', async () => {
      const { fixture, mockCheckPwned } = setup();
      await setPassword(fixture, 'password'); // exactly 8 chars
      expect(mockCheckPwned).toHaveBeenCalledWith('password');
    });

    it('calls checkPwnedPassword when password exceeds minLength', async () => {
      const { fixture, mockCheckPwned } = setup();
      await setPassword(fixture, 'password123');
      expect(mockCheckPwned).toHaveBeenCalledWith('password123');
    });

    it('does NOT call checkPwnedPassword when password is below 8 characters', async () => {
      const { fixture, mockCheckPwned } = setup();
      await setPassword(fixture, 'short'); // 5 chars
      expect(mockCheckPwned).not.toHaveBeenCalled();
    });

    it('shows the breach warning when checkPwnedPassword resolves true', async () => {
      const { fixture, mockCheckPwned } = setup();
      mockCheckPwned.mockResolvedValue(true);
      await setPassword(fixture, 'password1');

      const allWarnings = Array.from(host(fixture).querySelectorAll('.warning'));
      expect(allWarnings.some((w) => w.textContent?.includes('data breach'))).toBe(true);
    });

    it('does not show the breach warning when checkPwnedPassword resolves false', async () => {
      const { fixture, mockCheckPwned } = setup();
      mockCheckPwned.mockResolvedValue(false);
      await setPassword(fixture, 'password1');

      const allWarnings = Array.from(host(fixture).querySelectorAll('.warning'));
      expect(allWarnings.some((w) => w.textContent?.includes('data breach'))).toBe(false);
    });

    it('treats an undefined response (server error) as safe — no breach warning shown', async () => {
      const { fixture, mockCheckPwned } = setup();
      mockCheckPwned.mockResolvedValue(undefined);
      await setPassword(fixture, 'password1');

      const allWarnings = Array.from(host(fixture).querySelectorAll('.warning'));
      expect(allWarnings.some((w) => w.textContent?.includes('data breach'))).toBe(false);
    });

    it('does not call checkPwnedPassword before the 350 ms debounce window elapses', async () => {
      const { fixture, mockCheckPwned } = setup();
      fixture.componentRef.setInput('password', 'password1');
      fixture.detectChanges();

      vi.advanceTimersByTime(349); // one ms short of the threshold
      expect(mockCheckPwned).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1); // complete the window
      await Promise.resolve();
      fixture.detectChanges();
    });
  });

  // -------------------------------------------------------------------------
  describe('zxcvbn feedback', () => {
    it('displays the zxcvbn warning text', async () => {
      mockZxcvbn.mockReturnValue(zxcvbnResult(1, 'This is a top-10 common password'));
      const { fixture } = setup();
      await setPassword(fixture, 'password1');

      const allWarnings = Array.from(host(fixture).querySelectorAll('.warning'));
      expect(
        allWarnings.some((w) => w.textContent?.includes('This is a top-10 common password')),
      ).toBe(true);
    });

    it('renders each suggestion as a separate .suggestion element', async () => {
      mockZxcvbn.mockReturnValue(
        zxcvbnResult(1, '', ['Add more symbols.', 'Use a longer password.']),
      );
      const { fixture } = setup();
      await setPassword(fixture, 'password1');

      const suggestions = host(fixture).querySelectorAll('.suggestion');
      expect(suggestions.length).toBe(2);
      expect(suggestions[0].textContent?.trim()).toBe('Add more symbols.');
      expect(suggestions[1].textContent?.trim()).toBe('Use a longer password.');
    });

    it('renders no .suggestion elements when zxcvbn returns none', async () => {
      mockZxcvbn.mockReturnValue(zxcvbnResult(3));
      const { fixture } = setup();
      await setPassword(fixture, 'password1');
      expect(host(fixture).querySelectorAll('.suggestion').length).toBe(0);
    });

    it('renders no .warning span when zxcvbn returns no warning and password is not pwned', async () => {
      mockZxcvbn.mockReturnValue(zxcvbnResult(3, ''));
      // mockCheckPwned defaults to false in setup()
      const { fixture } = setup();
      await setPassword(fixture, 'password1');
      expect(host(fixture).querySelectorAll('.warning').length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  describe('accessibility', () => {
    it('gives the meter container role="status"', async () => {
      const { fixture } = setup();
      await setPassword(fixture, 'password1');
      expect(host(fixture).querySelector('[role="status"]')).not.toBeNull();
    });

    it('sets aria-label to the current strength label', async () => {
      mockZxcvbn.mockReturnValue(zxcvbnResult(3));
      const { fixture } = setup();
      await setPassword(fixture, 'password1');

      const meter = host(fixture).querySelector('[role="status"]');
      expect(meter?.getAttribute('aria-label')).toBe('Strong');
    });

    it('aria-label updates when the score changes', async () => {
      mockZxcvbn.mockReturnValue(zxcvbnResult(1));
      const { fixture } = setup();
      await setPassword(fixture, 'password1');
      expect(host(fixture).querySelector('[role="status"]')?.getAttribute('aria-label')).toBe(
        'Weak',
      );

      mockZxcvbn.mockReturnValue(zxcvbnResult(4));
      await setPassword(fixture, 'Tr0ub4dor&3!@#');
      expect(host(fixture).querySelector('[role="status"]')?.getAttribute('aria-label')).toBe(
        'Very strong',
      );
    });

    it('does not render the role="status" element when password is empty', () => {
      const { fixture } = setup();
      fixture.detectChanges();
      expect(host(fixture).querySelector('[role="status"]')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe('debounce behaviour', () => {
    it('calls zxcvbn only once when multiple keystrokes arrive within the debounce window', async () => {
      const { fixture } = setup();

      // Rapid typing: three changes within the 350 ms window
      fixture.componentRef.setInput('password', 'p');
      fixture.detectChanges();
      vi.advanceTimersByTime(100);

      fixture.componentRef.setInput('password', 'pa');
      fixture.detectChanges();
      vi.advanceTimersByTime(100);

      fixture.componentRef.setInput('password', 'password1');
      fixture.detectChanges();

      vi.advanceTimersByTime(350); // debounce fires only for the final value
      await Promise.resolve();
      fixture.detectChanges();

      expect(mockZxcvbn).toHaveBeenCalledOnce();
      expect(mockZxcvbn).toHaveBeenCalledWith('password1');
    });

    it('does not call zxcvbn before the 350 ms window has elapsed', async () => {
      const { fixture } = setup();
      fixture.componentRef.setInput('password', 'password1');
      fixture.detectChanges();

      vi.advanceTimersByTime(349);
      expect(mockZxcvbn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1); // complete the window
      await Promise.resolve();
      fixture.detectChanges();
      expect(mockZxcvbn).toHaveBeenCalledOnce();
    });

    it('calls zxcvbn a second time when a distinct value arrives after the window', async () => {
      const { fixture } = setup();

      await setPassword(fixture, 'password1');
      expect(mockZxcvbn).toHaveBeenCalledTimes(1);

      await setPassword(fixture, 'differentPass1!');
      expect(mockZxcvbn).toHaveBeenCalledTimes(2);
    });
  });
});
