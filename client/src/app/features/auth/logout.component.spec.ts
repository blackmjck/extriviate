import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { LogoutComponent } from './logout.component';
import { AuthService } from '../../core/services/auth.service';

// ---------------------------------------------------------------------------
// Setup

const mockLogout = vi.fn();

/**
 * Creates the component but intentionally does NOT call detectChanges().
 * ngOnInit fires on the first detectChanges() call, so each test must
 * trigger it explicitly — this gives per-test control over mock instrumentation
 * before ngOnInit executes.
 */
async function setup(): Promise<{
  fixture: ComponentFixture<LogoutComponent>;
  component: LogoutComponent;
  router: Router;
}> {
  await TestBed.configureTestingModule({
    imports: [LogoutComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: { logout: mockLogout } },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(LogoutComponent);
  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigate').mockResolvedValue(true);

  return { fixture, component: fixture.componentInstance, router };
}

// ---------------------------------------------------------------------------

describe('LogoutComponent', () => {
  beforeEach(() => {
    mockLogout.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // -------------------------------------------------------------------------
  it('should create', async () => {
    const { fixture, component } = await setup();
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  describe('ngOnInit()', () => {
    it('calls auth.logout() exactly once', async () => {
      const { fixture } = await setup();
      fixture.detectChanges();
      expect(mockLogout).toHaveBeenCalledOnce();
    });

    it('navigates to /login with replaceUrl: true', async () => {
      const { fixture, router } = await setup();
      fixture.detectChanges();
      expect(router.navigate).toHaveBeenCalledWith(['/login'], { replaceUrl: true });
    });

    it('calls auth.logout() before navigating', async () => {
      const { fixture, router } = await setup();
      const callOrder: string[] = [];

      mockLogout.mockImplementation(() => {
        callOrder.push('logout');
      });
      vi.mocked(router.navigate).mockImplementation(() => {
        callOrder.push('navigate');
        return Promise.resolve(true);
      });

      fixture.detectChanges();

      expect(callOrder).toEqual(['logout', 'navigate']);
    });
  });

  // -------------------------------------------------------------------------
  describe('template', () => {
    it('renders a paragraph with "Signing out…" text', async () => {
      const { fixture } = await setup();
      fixture.detectChanges();
      const p = (fixture.nativeElement as HTMLElement).querySelector('p');
      expect(p).toBeTruthy();
      expect(p!.textContent).toBe('Signing out…');
    });

    it('paragraph has aria-live="polite" for screen readers', async () => {
      const { fixture } = await setup();
      fixture.detectChanges();
      const p = (fixture.nativeElement as HTMLElement).querySelector('p');
      expect(p!.getAttribute('aria-live')).toBe('polite');
    });
  });
});
