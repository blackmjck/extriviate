import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { HomeComponent } from './home.component';
import { AuthService } from '../../core/services/auth.service';

function makeAuthService(authenticated = false) {
  const currentUser = signal(authenticated ? ({ id: 1 } as never) : null);
  return {
    currentUser,
    isAuthenticated: () => currentUser() !== null,
  };
}

async function setup(authenticated = false) {
  const authService = makeAuthService(authenticated);

  TestBed.configureTestingModule({
    imports: [HomeComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: authService },
    ],
  });

  const fixture = TestBed.createComponent(HomeComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  await fixture.whenStable();

  return { fixture, component, authService, router: TestBed.inject(Router) };
}

describe('HomeComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should create', async () => {
    const { component } = await setup();
    expect(component).toBeTruthy();
  });

  it('does not show error before first submit attempt', async () => {
    const { fixture } = await setup();
    const error = fixture.nativeElement.querySelector('#code-error');
    expect(error).toBeNull();
  });

  it('shows error when form submitted with empty code', async () => {
    const { fixture, component } = await setup();
    component.onJoin();
    fixture.detectChanges();
    const error = fixture.nativeElement.querySelector('#code-error');
    expect(error).not.toBeNull();
    expect(component.codeInvalid()).toBe(true);
  });

  it('navigates to /join/:code on valid submission', async () => {
    const { fixture, component, router } = await setup();
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.joinForm.controls.code.setValue('abc123');
    component.onJoin();
    fixture.detectChanges();

    expect(router.navigate).toHaveBeenCalledWith(['/join', 'ABC123']);
  });

  it('renders "Create / Edit Games" link to /games when authenticated', async () => {
    const { fixture } = await setup(true);
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/games"]');
    expect(link).not.toBeNull();
    expect(link.textContent?.trim()).toBe('Create / Edit Games');
  });

  it('renders "Sign In to Create Games" link to /login when not authenticated', async () => {
    const { fixture } = await setup(false);
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/login"]');
    expect(link).not.toBeNull();
    expect(link.textContent?.trim()).toBe('Sign In to Create Games');
  });
});
