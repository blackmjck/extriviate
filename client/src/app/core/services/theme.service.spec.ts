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

    it('restores "quiz-show" from localStorage', () => {
      localStorage.setItem(STORAGE_KEY, 'quiz-show');
      const { service } = setup();
      expect(service.activeTheme()).toBe('quiz-show');
    });

    it('restores "showcase" from localStorage', () => {
      localStorage.setItem(STORAGE_KEY, 'showcase');
      const { service } = setup();
      expect(service.activeTheme()).toBe('showcase');
    });

    it('restores "glitzy" from localStorage', () => {
      localStorage.setItem(STORAGE_KEY, 'glitzy');
      const { service } = setup();
      expect(service.activeTheme()).toBe('glitzy');
    });

    it('falls back to "quiz-show" from system preference when nothing is stored', () => {
      const { service } = setup(true);
      expect(service.activeTheme()).toBe('quiz-show');
    });

    it('falls back to "light" from system preference when nothing is stored', () => {
      const { service } = setup(false);
      expect(service.activeTheme()).toBe('light');
    });

    it('falls back to system preference when stored value is unrecognised', () => {
      localStorage.setItem(STORAGE_KEY, 'unknown-value');
      const { service } = setup(true);
      expect(service.activeTheme()).toBe('quiz-show');
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

    it('sets data-theme="quiz-show" when theme is quiz-show', () => {
      localStorage.setItem(STORAGE_KEY, 'quiz-show');
      setup();
      TestBed.flushEffects();
      expect(document.documentElement.dataset['theme']).toBe('quiz-show');
    });

    it('sets data-theme="showcase" when theme is showcase', () => {
      localStorage.setItem(STORAGE_KEY, 'showcase');
      setup();
      TestBed.flushEffects();
      expect(document.documentElement.dataset['theme']).toBe('showcase');
    });

    it('sets data-theme="glitzy" when theme is glitzy', () => {
      localStorage.setItem(STORAGE_KEY, 'glitzy');
      setup();
      TestBed.flushEffects();
      expect(document.documentElement.dataset['theme']).toBe('glitzy');
    });
  });

  // -- setTheme() -------------------------------------------------------------

  describe('setTheme()', () => {
    const themes: ActiveTheme[] = ['dark', 'light', 'quiz-show', 'showcase', 'glitzy'];

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
      expect(service.activeTheme()).toBe('quiz-show');
      triggerChange(false);
      expect(service.activeTheme()).toBe('light');
    });

    it('does not override a stored preference on system change', () => {
      localStorage.setItem(STORAGE_KEY, 'showcase');
      const { service, triggerChange } = setup(false);
      triggerChange(true);
      expect(service.activeTheme()).toBe('showcase');
    });
  });
});
