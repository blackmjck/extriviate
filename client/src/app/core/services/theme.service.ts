import { Injectable, signal, effect, inject, DestroyRef } from '@angular/core';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'extriviate_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly destroyRef = inject(DestroyRef);

  private readonly systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  readonly theme = signal<Theme>(this.resolveInitialTheme());

  constructor() {
    effect(() => {
      document.documentElement.dataset['theme'] = this.theme() === 'light' ? 'light' : '';
    });

    const onSystemChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        this.theme.set(e.matches ? 'dark' : 'light');
      }
    };

    this.systemDark.addEventListener('change', onSystemChange);
    this.destroyRef.onDestroy(() => {
      this.systemDark.removeEventListener('change', onSystemChange);
    });
  }

  toggle(): void {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  setTheme(theme: Theme): void {
    this.theme.set(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }

  private resolveInitialTheme(): Theme {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    return this.systemDark.matches ? 'dark' : 'light';
  }
}
