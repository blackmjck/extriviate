import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideRouter, RouterOutlet } from '@angular/router';
import { App } from './app.component';
import { ThemeService, type ActiveTheme } from './core/services/theme.service';

function makeMockThemeService(initialTheme: ActiveTheme = 'dark') {
  return {
    activeTheme: signal<ActiveTheme>(initialTheme).asReadonly(),
    setTheme: vi.fn(),
  };
}

// Override child components that carry heavy dependencies (GameSocketService, etc.)
// so the App shell can be tested in isolation.
function configureTestBed() {
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: ThemeService, useValue: makeMockThemeService() },
    ],
  });
  TestBed.overrideComponent(App, {
    set: { imports: [RouterOutlet], template: '<router-outlet />' },
  });
}

describe('AppComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('creates without error', () => {
    configureTestBed();
    expect(() => TestBed.createComponent(App)).not.toThrow();
  });

  it('renders a router-outlet in the template', () => {
    configureTestBed();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
  });
});
