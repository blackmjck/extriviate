import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { vi } from 'vitest';
import { OrientationService } from './orientation.service';

// Each call to window.matchMedia during OrientationService construction returns its
// own MediaQueryList mock so portrait and small-screen listeners can be fired independently.
function setupMatchMedia(portraitMatches: boolean, smallScreenMatches: boolean) {
  const portraitListeners: ((e: MediaQueryListEvent) => void)[] = [];
  const smallScreenListeners: ((e: MediaQueryListEvent) => void)[] = [];

  const portraitMql = {
    matches: portraitMatches,
    addEventListener: vi.fn((_: string, cb: (e: MediaQueryListEvent) => void) => {
      portraitListeners.push(cb);
    }),
    removeEventListener: vi.fn(),
  };

  const smallScreenMql = {
    matches: smallScreenMatches,
    addEventListener: vi.fn((_: string, cb: (e: MediaQueryListEvent) => void) => {
      smallScreenListeners.push(cb);
    }),
    removeEventListener: vi.fn(),
  };

  // The service calls matchMedia with the portrait query first, then the small-screen query.
  const matchMediaMock = vi
    .fn()
    .mockReturnValueOnce(portraitMql)
    .mockReturnValueOnce(smallScreenMql);

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: matchMediaMock,
  });

  return {
    portraitMql,
    smallScreenMql,
    triggerPortraitChange: (matches: boolean) =>
      portraitListeners.forEach((cb) => cb({ matches } as MediaQueryListEvent)),
    triggerSmallScreenChange: (matches: boolean) =>
      smallScreenListeners.forEach((cb) => cb({ matches } as MediaQueryListEvent)),
  };
}

describe('OrientationService', () => {
  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  describe('initial state', () => {
    it('sets isPortrait to true when portrait media query matches', () => {
      // matchMedia must be mocked before TestBed.configureTestingModule so the
      // service constructor sees the mock when it is instantiated.
      setupMatchMedia(true, false);
      TestBed.configureTestingModule({
        providers: [OrientationService, provideZonelessChangeDetection()],
      });
      const service = TestBed.inject(OrientationService);
      expect(service.isPortrait()).toBe(true);
    });

    it('sets isPortrait to false when portrait media query does not match', () => {
      setupMatchMedia(false, true);
      TestBed.configureTestingModule({
        providers: [OrientationService, provideZonelessChangeDetection()],
      });
      const service = TestBed.inject(OrientationService);
      expect(service.isPortrait()).toBe(false);
    });

    it('sets isSmallScreen to true when small-screen media query matches', () => {
      setupMatchMedia(false, true);
      TestBed.configureTestingModule({
        providers: [OrientationService, provideZonelessChangeDetection()],
      });
      const service = TestBed.inject(OrientationService);
      expect(service.isSmallScreen()).toBe(true);
    });

    it('sets isSmallScreen to false when small-screen media query does not match', () => {
      setupMatchMedia(true, false);
      TestBed.configureTestingModule({
        providers: [OrientationService, provideZonelessChangeDetection()],
      });
      const service = TestBed.inject(OrientationService);
      expect(service.isSmallScreen()).toBe(false);
    });
  });

  describe('portrait change listener', () => {
    it('sets isPortrait to true when the portrait listener fires with matches=true', () => {
      const { triggerPortraitChange } = setupMatchMedia(false, false);
      TestBed.configureTestingModule({
        providers: [OrientationService, provideZonelessChangeDetection()],
      });
      const service = TestBed.inject(OrientationService);
      expect(service.isPortrait()).toBe(false);
      triggerPortraitChange(true);
      expect(service.isPortrait()).toBe(true);
    });

    it('sets isPortrait to false when the portrait listener fires with matches=false', () => {
      const { triggerPortraitChange } = setupMatchMedia(true, false);
      TestBed.configureTestingModule({
        providers: [OrientationService, provideZonelessChangeDetection()],
      });
      const service = TestBed.inject(OrientationService);
      expect(service.isPortrait()).toBe(true);
      triggerPortraitChange(false);
      expect(service.isPortrait()).toBe(false);
    });
  });

  describe('small screen change listener', () => {
    it('sets isSmallScreen to true when the small-screen listener fires with matches=true', () => {
      const { triggerSmallScreenChange } = setupMatchMedia(false, false);
      TestBed.configureTestingModule({
        providers: [OrientationService, provideZonelessChangeDetection()],
      });
      const service = TestBed.inject(OrientationService);
      expect(service.isSmallScreen()).toBe(false);
      triggerSmallScreenChange(true);
      expect(service.isSmallScreen()).toBe(true);
    });

    it('sets isSmallScreen to false when the small-screen listener fires with matches=false', () => {
      const { triggerSmallScreenChange } = setupMatchMedia(false, true);
      TestBed.configureTestingModule({
        providers: [OrientationService, provideZonelessChangeDetection()],
      });
      const service = TestBed.inject(OrientationService);
      expect(service.isSmallScreen()).toBe(true);
      triggerSmallScreenChange(false);
      expect(service.isSmallScreen()).toBe(false);
    });
  });

  describe('cleanup on destroy', () => {
    it('calls removeEventListener on the portrait query when the service is destroyed', () => {
      const { portraitMql } = setupMatchMedia(false, false);
      TestBed.configureTestingModule({
        providers: [OrientationService, provideZonelessChangeDetection()],
      });
      TestBed.inject(OrientationService);
      // resetTestingModule triggers DestroyRef.onDestroy callbacks
      TestBed.resetTestingModule();
      expect(portraitMql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('calls removeEventListener on the small-screen query when the service is destroyed', () => {
      const { smallScreenMql } = setupMatchMedia(false, false);
      TestBed.configureTestingModule({
        providers: [OrientationService, provideZonelessChangeDetection()],
      });
      TestBed.inject(OrientationService);
      TestBed.resetTestingModule();
      expect(smallScreenMql.removeEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function),
      );
    });
  });
});
