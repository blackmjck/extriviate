import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ThemeService, type ActiveTheme } from './theme.service';

const STORAGE_KEY = 'extriviate_theme';

function setupMatchMedia(matches: boolean) {
  const listeners: ((e: MediaQueryListEvent) => void)[] = [];
  const mql = {
    matches,
    addEventListener: vi.fn((_: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.push(cb);
    }),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockReturnValue(mql),
  });
  return {
    triggerChange: (m: boolean) =>
      listeners.forEach((cb) => cb({ matches: m } as MediaQueryListEvent)),
  };
}

function setup(systemDark = false) {
  const { triggerChange } = setupMatchMedia(systemDark);
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });
  const service = TestBed.inject(ThemeService);
  return { service, triggerChange };
}

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  // -- resolveInitialTheme ----------------------------------------------------

  describe('resolveInitialTheme', () => {
    it('restores "dark" from localStorage', () => {
      localStorage.setItem(STORAGE_KEY, 'dark');
      const { service } = setup(false);
      expect(service.activeTheme()).toBe('dark');
    });

    it('restores "light" from localStorage', () => {
      localStorage.setItem(STORAGE_KEY, 'light');
      const { service } = setup(true);
      expect(service.activeTheme()).toBe('light');
    });

    it('falls back to "dark" when system prefers dark and nothing is stored', () => {
      const { service } = setup(true);
      expect(service.activeTheme()).toBe('dark');
    });

    it('falls back to "light" when system prefers light and nothing is stored', () => {
      const { service } = setup(false);
      expect(service.activeTheme()).toBe('light');
    });

    it('falls back to system preference when a stored value is unrecognised (e.g. old theme name)', () => {
      localStorage.setItem(STORAGE_KEY, 'quiz-show');
      const { service } = setup(true);
      // 'quiz-show' is not in VALID_THEMES so the system preference wins
      expect(service.activeTheme()).toBe('dark');
    });

    it('falls back to light when stored value is unrecognised and system prefers light', () => {
      localStorage.setItem(STORAGE_KEY, 'glitzy');
      const { service } = setup(false);
      expect(service.activeTheme()).toBe('light');
    });
  });

  // -- DOM effect -------------------------------------------------------------

  describe('DOM effect', () => {
    it('sets data-theme="" when theme is dark', () => {
      localStorage.setItem(STORAGE_KEY, 'dark');
      setup();
      TestBed.flushEffects();
      expect(document.documentElement.dataset['theme']).toBe('');
    });

    it('sets data-theme="light" when theme is light', () => {
      localStorage.setItem(STORAGE_KEY, 'light');
      setup();
      TestBed.flushEffects();
      expect(document.documentElement.dataset['theme']).toBe('light');
    });
  });

  // -- setTheme() -------------------------------------------------------------

  describe('setTheme()', () => {
    const themes: ActiveTheme[] = ['dark', 'light'];

    for (const theme of themes) {
      it(`sets activeTheme to "${theme}" and persists to localStorage`, () => {
        const { service } = setup();
        service.setTheme(theme);
        expect(service.activeTheme()).toBe(theme);
        expect(localStorage.getItem(STORAGE_KEY)).toBe(theme);
      });
    }
  });

  // -- system preference change -----------------------------------------------

  describe('system preference change', () => {
    it('switches to dark when system changes to dark and no stored preference', () => {
      const { service, triggerChange } = setup(false);
      expect(service.activeTheme()).toBe('light');
      triggerChange(true);
      expect(service.activeTheme()).toBe('dark');
    });

    it('switches to light when system changes to light and no stored preference', () => {
      const { service, triggerChange } = setup(true);
      expect(service.activeTheme()).toBe('dark');
      triggerChange(false);
      expect(service.activeTheme()).toBe('light');
    });

    it('does not override a stored preference on system change', () => {
      localStorage.setItem(STORAGE_KEY, 'dark');
      const { service, triggerChange } = setup(false);
      triggerChange(false);
      expect(service.activeTheme()).toBe('dark');
    });
  });
});
