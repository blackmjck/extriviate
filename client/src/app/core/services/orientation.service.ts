import { Injectable, signal, DestroyRef, inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class OrientationService {
  private readonly destroyRef = inject(DestroyRef);

  readonly isPortrait = signal<boolean>(false);
  readonly isSmallScreen = signal<boolean>(false);

  constructor() {
    const portraitQuery = window.matchMedia('(orientation: portrait)');
    const smallScreenQuery = window.matchMedia('(max-width: 768px)');

    this.isPortrait.set(portraitQuery.matches);
    this.isSmallScreen.set(smallScreenQuery.matches);

    const onPortraitChange = (e: MediaQueryListEvent) => this.isPortrait.set(e.matches);
    const onSmallScreenChange = (e: MediaQueryListEvent) => this.isSmallScreen.set(e.matches);

    portraitQuery.addEventListener('change', onPortraitChange);
    smallScreenQuery.addEventListener('change', onSmallScreenChange);

    this.destroyRef.onDestroy(() => {
      portraitQuery.removeEventListener('change', onPortraitChange);
      smallScreenQuery.removeEventListener('change', onSmallScreenChange);
    });
  }
}
