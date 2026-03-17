import { Injectable, signal, effect, inject, DestroyRef } from '@angular/core';

export type ActiveTheme = 'dark' | 'light' | 'quiz-show' | 'showcase' | 'glitzy';

const STORAGE_KEY = 'extriviate_theme';

const VALID_THEMES = new Set<string>([
  'dark', 'light', 'quiz-show', 'showcase', 'glitzy',
]);

// Maps each ActiveTheme to the value written to data-theme on <html>.
const THEME_ATTR: Record<ActiveTheme, string> = {
  dark:         '',
  light:        'light',
  'quiz-show':  'quiz-show',
  showcase:     'showcase',
  glitzy:       'glitzy',
};

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly destroyRef = inject(DestroyRef);

  private readonly systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  readonly activeTheme = signal<ActiveTheme>(this.resolveInitialTheme());

  constructor() {
    effect(() => {
      document.documentElement.dataset['theme'] = THEME_ATTR[this.activeTheme()];
    });

    const onSystemChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        this.activeTheme.set(e.matches ? 'dark' : 'light');
      }
    };

    this.systemDark.addEventListener('change', onSystemChange);
    this.destroyRef.onDestroy(() => {
      this.systemDark.removeEventListener('change', onSystemChange);
    });
  }

  setTheme(theme: ActiveTheme): void {
    this.activeTheme.set(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }

  private resolveInitialTheme(): ActiveTheme {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && VALID_THEMES.has(stored)) return stored as ActiveTheme;
    return this.systemDark.matches ? 'dark' : 'light';
  }
}
