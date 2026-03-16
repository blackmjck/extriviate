import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ThemeService } from './theme.service';

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
  // jsdom does not implement matchMedia — define it before spying
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
    it('returns stored "dark" from localStorage even when system prefers light', () => {
      localStorage.setItem(STORAGE_KEY, 'dark');
      const { service } = setup(false);
      expect(service.theme()).toBe('dark');
    });

    it('returns stored "light" from localStorage even when system prefers dark', () => {
      localStorage.setItem(STORAGE_KEY, 'light');
      const { service } = setup(true);
      expect(service.theme()).toBe('light');
    });

    it('falls back to "dark" from prefers-color-scheme when nothing is stored', () => {
      const { service } = setup(true);
      expect(service.theme()).toBe('dark');
    });

    it('falls back to "light" from prefers-color-scheme when nothing is stored', () => {
      const { service } = setup(false);
      expect(service.theme()).toBe('light');
    });
  });

  // -- DOM effect -------------------------------------------------------------

  describe('DOM effect', () => {
    it('sets data-theme="light" on <html> when theme is light', () => {
      localStorage.setItem(STORAGE_KEY, 'light');
      setup();
      TestBed.flushEffects();
      expect(document.documentElement.dataset['theme']).toBe('light');
    });

    it('sets data-theme="" on <html> when theme is dark', () => {
      localStorage.setItem(STORAGE_KEY, 'dark');
      setup();
      TestBed.flushEffects();
      expect(document.documentElement.dataset['theme']).toBe('');
    });
  });

  // -- toggle() ---------------------------------------------------------------

  describe('toggle()', () => {
    it('switches from dark to light and saves to localStorage', () => {
      localStorage.setItem(STORAGE_KEY, 'dark');
      const { service } = setup();
      service.toggle();
      expect(service.theme()).toBe('light');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
    });

    it('switches from light to dark and saves to localStorage', () => {
      localStorage.setItem(STORAGE_KEY, 'light');
      const { service } = setup();
      service.toggle();
      expect(service.theme()).toBe('dark');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
    });
  });

  // -- setTheme() -------------------------------------------------------------

  describe('setTheme()', () => {
    it('sets the theme signal and writes to localStorage', () => {
      const { service } = setup(false);
      service.setTheme('light');
      expect(service.theme()).toBe('light');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
    });
  });

  // -- system preference change -----------------------------------------------

  describe('system preference change', () => {
    it('updates theme to dark when system changes to dark and no stored preference', () => {
      const { service, triggerChange } = setup(false);
      expect(service.theme()).toBe('light');
      triggerChange(true);
      expect(service.theme()).toBe('dark');
    });

    it('updates theme to light when system changes to light and no stored preference', () => {
      const { service, triggerChange } = setup(true);
      expect(service.theme()).toBe('dark');
      triggerChange(false);
      expect(service.theme()).toBe('light');
    });

    it('does not override theme when a stored preference exists', () => {
      localStorage.setItem(STORAGE_KEY, 'light');
      const { service, triggerChange } = setup(false);
      triggerChange(true);
      expect(service.theme()).toBe('light');
    });
  });
});
