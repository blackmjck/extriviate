import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { ProfileComponent } from './profile.component';
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';
import type { PublicUser } from '@extriviate/shared';

const USER: PublicUser = { id: 1, displayName: 'Alice', role: 'creator', createdAt: '' };
const STATS = { gamesCreated: 3, categoriesCreated: 5, questionsCreated: 12, sessionsPlayed: 7 };

function makeAuthMock(user: PublicUser | null = USER) {
  const currentUser = signal<PublicUser | null>(user);
  return { currentUser };
}

function setup(
  user: PublicUser | null = USER,
  statsResult: unknown = { success: true, data: STATS },
) {
  const authMock = makeAuthMock(user);
  const mockUserService = {
    getStats: vi.fn().mockResolvedValue(statsResult),
    updateProfile: vi.fn().mockResolvedValue({ success: true, data: USER }),
  };

  TestBed.configureTestingModule({
    imports: [ProfileComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: authMock },
      { provide: UserService, useValue: mockUserService },
    ],
  });

  const fixture = TestBed.createComponent(ProfileComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges(); // triggers ngOnInit → loadStats()

  return { fixture, component, authMock, mockUserService };
}

describe('ProfileComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  // -- Initial state --------------------------------------------------

  it('loads stats on init and exposes them', async () => {
    const { component } = setup();
    await Promise.resolve();
    expect(component.stats()).toEqual(STATS);
    expect(component.loading()).toBe(false);
    expect(component.error()).toBeNull();
  });

  it('sets error when getStats rejects', async () => {
    const { component } = setup(USER, Promise.reject(new Error('Server error')));
    await Promise.resolve();
    expect(component.error()).toBe('Could not load profile stats.');
    expect(component.loading()).toBe(false);
  });

  it('exposes user from AuthService', async () => {
    const { component } = setup();
    await Promise.resolve();
    expect(component.user()).toEqual(USER);
  });

  // -- Inline name edit -----------------------------------------------

  it('editingName starts as false', async () => {
    const { component } = setup();
    await Promise.resolve();
    expect(component.editingName()).toBe(false);
  });

  it('startEditName sets editingName true and pre-fills form', async () => {
    const { component } = setup();
    await Promise.resolve();
    component.startEditName();
    expect(component.editingName()).toBe(true);
    expect(component.nameForm.value.displayName).toBe('Alice');
  });

  it('cancelEditName hides form and clears nameError', async () => {
    const { component } = setup();
    await Promise.resolve();
    component.startEditName();
    component.cancelEditName();
    expect(component.editingName()).toBe(false);
    expect(component.nameError()).toBeNull();
  });

  it('saveDisplayName calls UserService.updateProfile and updates currentUser', async () => {
    const updatedUser: PublicUser = { ...USER, displayName: 'Bob' };
    const { component, authMock, mockUserService } = setup();
    mockUserService.updateProfile.mockResolvedValue({ success: true, data: updatedUser });

    await Promise.resolve();
    component.startEditName();
    component.nameForm.setValue({ displayName: 'Bob' });

    await component.saveDisplayName();

    expect(mockUserService.updateProfile).toHaveBeenCalledWith({ displayName: 'Bob' });
    expect(authMock.currentUser()).toEqual(updatedUser);
    expect(component.editingName()).toBe(false);
  });

  it('saveDisplayName sets nameError on failure', async () => {
    const { component, mockUserService } = setup();
    mockUserService.updateProfile.mockRejectedValue(new Error('Network error'));

    await Promise.resolve();
    component.startEditName();
    component.nameForm.setValue({ displayName: 'Bob' });

    await component.saveDisplayName();

    expect(component.nameError()).toBe('Failed to update display name.');
    expect(component.editingName()).toBe(true);
  });

  it('saveDisplayName does nothing when form is invalid', async () => {
    const { component, mockUserService } = setup();
    await Promise.resolve();
    component.startEditName();
    component.nameForm.setValue({ displayName: '' });

    await component.saveDisplayName();

    expect(mockUserService.updateProfile).not.toHaveBeenCalled();
  });

  it('savingName is true during the updateProfile call and false after', async () => {
    let resolveFn!: (v: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveFn = resolve;
    });

    const { component, mockUserService } = setup();
    mockUserService.updateProfile.mockReturnValue(pending);

    await Promise.resolve();
    component.startEditName();
    component.nameForm.setValue({ displayName: 'Bob' });

    const savePromise = component.saveDisplayName();
    expect(component.savingName()).toBe(true);

    resolveFn({ success: true, data: { ...USER, displayName: 'Bob' } });
    await savePromise;
    expect(component.savingName()).toBe(false);
  });
});
