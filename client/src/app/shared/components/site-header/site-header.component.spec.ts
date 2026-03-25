import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { SiteHeaderComponent } from './site-header.component';
import { AuthService } from '../../../core/services/auth.service';

function makeMockAuthService(authenticated = false) {
  return {
    isAuthenticated: signal(authenticated).asReadonly(),
  };
}

function setup(authenticated = false) {
  const mockAuth = makeMockAuthService(authenticated);
  TestBed.configureTestingModule({
    imports: [SiteHeaderComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: mockAuth },
    ],
  });
  const fixture = TestBed.createComponent(SiteHeaderComponent);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  return { fixture, host, mockAuth };
}

describe('SiteHeaderComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  describe('logo', () => {
    it('renders a link to / with aria-label "Extriviate home"', () => {
      const { host } = setup();
      const logo = host.querySelector<HTMLAnchorElement>('.site-header__logo');
      expect(logo).not.toBeNull();
      expect(logo?.getAttribute('aria-label')).toBe('Extriviate home');
    });

    it('renders the wordmark text', () => {
      const { host } = setup();
      const name = host.querySelector('.site-header__logo-name');
      expect(name?.textContent?.trim()).toBe('Extriviate');
    });
  });

  describe('nav landmark', () => {
    it('has aria-label "User navigation"', () => {
      const { host } = setup();
      const nav = host.querySelector('nav');
      expect(nav?.getAttribute('aria-label')).toBe('User navigation');
    });
  });

  describe('when unauthenticated', () => {
    it('renders a link to /login', () => {
      const { host } = setup(false);
      const link = host.querySelector<HTMLAnchorElement>('.site-header__user-link');
      expect(link?.getAttribute('href')).toBe('/login');
    });

    it('sets aria-label to "Log in"', () => {
      const { host } = setup(false);
      const link = host.querySelector('.site-header__user-link');
      expect(link?.getAttribute('aria-label')).toBe('Log in');
    });

    it('does not render a link to /profile', () => {
      const { host } = setup(false);
      const profileLinks = host.querySelectorAll<HTMLAnchorElement>('a[href="/profile"]');
      expect(profileLinks.length).toBe(0);
    });
  });

  describe('when authenticated', () => {
    it('renders a link to /profile', () => {
      const { host } = setup(true);
      const link = host.querySelector<HTMLAnchorElement>('.site-header__user-link');
      expect(link?.getAttribute('href')).toBe('/profile');
    });

    it('sets aria-label to "Go to your profile"', () => {
      const { host } = setup(true);
      const link = host.querySelector('.site-header__user-link');
      expect(link?.getAttribute('aria-label')).toBe('Go to your profile');
    });

    it('does not render a link to /login', () => {
      const { host } = setup(true);
      const loginLinks = host.querySelectorAll<HTMLAnchorElement>('a[href="/login"]');
      expect(loginLinks.length).toBe(0);
    });
  });
});
