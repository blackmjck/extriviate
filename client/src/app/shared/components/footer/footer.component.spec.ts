import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { FooterComponent } from './footer.component';
import { ThemeService, type ActiveTheme } from '../../../core/services/theme.service';

function setup(initialTheme: ActiveTheme = 'dark') {
  const themeSignal = signal<ActiveTheme>(initialTheme);
  const mockThemeService = {
    activeTheme: themeSignal.asReadonly(),
    setTheme: vi.fn(),
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

  // -- Static content ---------------------------------------------------------

  it('renders the current copyright year in a <small> element', () => {
    const { fixture } = setup();
    const small: HTMLElement = fixture.nativeElement.querySelector('small');
    expect(small).not.toBeNull();
    expect(small.textContent).toContain(String(new Date().getFullYear()));
  });

  it('legal <nav> contains a link to /privacy', () => {
    const { fixture } = setup();
    const nav: HTMLElement = fixture.nativeElement.querySelector('nav[aria-label="Legal"]');
    expect(nav).not.toBeNull();
    const link: HTMLAnchorElement = nav.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/privacy');
  });

  // -- Theme select -----------------------------------------------------------

  it('renders a <select> with one option per theme (6 total)', () => {
    const { fixture } = setup();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    expect(select).not.toBeNull();
    expect(select.options.length).toBe(5);
  });

  it('select has an accessible label', () => {
    const { fixture } = setup();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    const id = select.getAttribute('id');
    expect(id).toBeTruthy();
    const label = fixture.nativeElement.querySelector(`label[for="${id}"]`);
    expect(label).not.toBeNull();
  });

  it('option values match expected theme identifiers', () => {
    const { fixture } = setup();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['dark', 'light', 'quiz-show', 'showcase', 'glitzy']);
  });

  it('marks the current theme option as selected', () => {
    const { fixture } = setup('showcase');
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    const selected = Array.from(select.options).find((o) => o.selected);
    expect(selected?.value).toBe('showcase');
  });

  it('updates selected option when theme signal changes', () => {
    const { fixture, themeSignal } = setup('dark');
    themeSignal.set('glitzy');
    fixture.detectChanges();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    const selected = Array.from(select.options).find((o) => o.selected);
    expect(selected?.value).toBe('glitzy');
  });

  it('calls setTheme with the chosen value on change', () => {
    const { fixture, mockThemeService } = setup();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    select.value = 'quiz-show';
    select.dispatchEvent(new Event('change'));
    expect(mockThemeService.setTheme).toHaveBeenCalledWith('quiz-show');
  });


});
