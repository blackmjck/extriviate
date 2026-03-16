import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { FooterComponent } from './footer.component';
import { ThemeService, type Theme } from '../../../core/services/theme.service';

function setup(initialTheme: Theme = 'dark') {
  const themeSignal = signal<Theme>(initialTheme);
  const mockThemeService = {
    theme: themeSignal.asReadonly(),
    toggle: vi.fn(),
  };

  TestBed.configureTestingModule({
    imports: [FooterComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: ThemeService, useValue: mockThemeService },
    ],
  });

  const fixture = TestBed.createComponent(FooterComponent);
  fixture.detectChanges();
  return { fixture, mockThemeService, themeSignal };
}

describe('FooterComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('renders the current copyright year in a <small> element', () => {
    const { fixture } = setup();
    const small: HTMLElement = fixture.nativeElement.querySelector('small');
    expect(small).not.toBeNull();
    expect(small.textContent).toContain(String(new Date().getFullYear()));
  });

  it('shows "Light mode" button label when theme is dark', () => {
    const { fixture } = setup('dark');
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(btn.textContent?.trim()).toBe('Light mode');
  });

  it('shows "Dark mode" button label when theme is light', () => {
    const { fixture } = setup('light');
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(btn.textContent?.trim()).toBe('Dark mode');
  });

  it('button aria-label is "Switch to light mode" when theme is dark', () => {
    const { fixture } = setup('dark');
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(btn.getAttribute('aria-label')).toBe('Switch to light mode');
  });

  it('button aria-label is "Switch to dark mode" when theme is light', () => {
    const { fixture } = setup('light');
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(btn.getAttribute('aria-label')).toBe('Switch to dark mode');
  });

  it('clicking the toggle button calls themeService.toggle()', () => {
    const { fixture, mockThemeService } = setup();
    fixture.nativeElement.querySelector('button').click();
    expect(mockThemeService.toggle).toHaveBeenCalledOnce();
  });

  it('legal <nav> contains a link to /privacy', () => {
    const { fixture } = setup();
    const nav: HTMLElement = fixture.nativeElement.querySelector('nav[aria-label="Legal"]');
    expect(nav).not.toBeNull();
    const link: HTMLAnchorElement = nav.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/privacy');
  });
});
