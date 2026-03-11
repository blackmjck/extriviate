import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { ActivatedRoute, Router } from '@angular/router';
import { HostSessionComponent } from './host-session.component';
import { GameService } from '../../core/services/game.service';
import { SessionService } from '../../core/services/session.service';
import type { Game } from '@extriviate/shared';

// ---- Fixtures -------------------------------------------------------

const GAME: Game = {
  id: 42,
  creatorId: 1,
  title: 'History 101',
  dailyDoublesEnabled: false,
  isPublished: true,
  requireQuestionFormat: false,
  useAiEvaluation: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const GAME_BOARD_RESPONSE = { success: true, data: { game: GAME, categories: [] } };

// ---- Helpers --------------------------------------------------------

function makeRoute(id = '42') {
  return { snapshot: { paramMap: { get: () => id } } };
}

function setup(routeId = '42') {
  const mockGameService = { getGame: vi.fn().mockResolvedValue(GAME_BOARD_RESPONSE) };
  const mockSessionService = {
    createSession: vi.fn().mockResolvedValue({ success: true, data: { id: 99 } }),
  };

  TestBed.configureTestingModule({
    imports: [HostSessionComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: makeRoute(routeId) },
      { provide: GameService, useValue: mockGameService },
      { provide: SessionService, useValue: mockSessionService },
    ],
  });

  const fixture = TestBed.createComponent(HostSessionComponent);
  const component = fixture.componentInstance;
  const router = TestBed.inject(Router);

  // Prevent loadGame from running in tests that only exercise form logic.
  vi.spyOn(component as unknown as { loadGame: () => Promise<void> }, 'loadGame').mockResolvedValue(
    undefined,
  );

  fixture.detectChanges();

  return { fixture, component, router, mockGameService, mockSessionService };
}

// ---- Tests ----------------------------------------------------------

describe('HostSessionComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  // -- Initial state --------------------------------------------------

  it('defaults mode to computer_hosted and turnBased to false', () => {
    const { component } = setup();
    expect(component.mode()).toBe('computer_hosted');
    expect(component.turnBased()).toBe(false);
  });

  it('starts with no errors', () => {
    const { component } = setup();
    expect(component.loadError()).toBeNull();
    expect(component.submitError()).toBeNull();
  });

  // -- loadGame -------------------------------------------------------

  describe('loadGame', () => {
    function setupWithRealLoad(routeId = '42') {
      const mockGameService = { getGame: vi.fn().mockResolvedValue(GAME_BOARD_RESPONSE) };
      const mockSessionService = { createSession: vi.fn() };

      TestBed.configureTestingModule({
        imports: [HostSessionComponent],
        providers: [
          provideZonelessChangeDetection(),
          provideRouter([]),
          { provide: ActivatedRoute, useValue: makeRoute(routeId) },
          { provide: GameService, useValue: mockGameService },
          { provide: SessionService, useValue: mockSessionService },
        ],
      });

      const fixture = TestBed.createComponent(HostSessionComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges(); // triggers ngOnInit → loadGame (real)
      return { component, mockGameService };
    }

    it('calls GameService.getGame with the route param', async () => {
      const { component, mockGameService } = setupWithRealLoad('42');
      await Promise.resolve();
      expect(mockGameService.getGame).toHaveBeenCalledWith(42);
      expect(component.sessionName()).toBe('History 101');
      expect(component.loading()).toBe(false);
    });

    it('sets loadError when getGame rejects', async () => {
      const mockGameService = { getGame: vi.fn().mockRejectedValue(new Error('Network error')) };
      const mockSessionService = { createSession: vi.fn() };

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [HostSessionComponent],
        providers: [
          provideZonelessChangeDetection(),
          provideRouter([]),
          { provide: ActivatedRoute, useValue: makeRoute('42') },
          { provide: GameService, useValue: mockGameService },
          { provide: SessionService, useValue: mockSessionService },
        ],
      });

      const fixture = TestBed.createComponent(HostSessionComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      await Promise.resolve();

      expect(component.loadError()).not.toBeNull();
      expect(component.game()).toBeNull();
      expect(component.loading()).toBe(false);
    });
  });

  // -- Form state setters ---------------------------------------------

  describe('setSessionName', () => {
    it('updates the sessionName signal', () => {
      const { component } = setup();
      component.setSessionName('Friday Night Trivia');
      expect(component.sessionName()).toBe('Friday Night Trivia');
    });

    it('clears submitError when the name is changed', () => {
      const { component } = setup();
      component.submitError.set('Something went wrong.');
      component.setSessionName('New Name');
      expect(component.submitError()).toBeNull();
    });
  });

  describe('setMode', () => {
    it('updates the mode signal to user_hosted', () => {
      const { component } = setup();
      component.setMode('user_hosted');
      expect(component.mode()).toBe('user_hosted');
    });

    it('updates the mode signal back to computer_hosted', () => {
      const { component } = setup();
      component.setMode('user_hosted');
      component.setMode('computer_hosted');
      expect(component.mode()).toBe('computer_hosted');
    });
  });

  describe('setTurnBased', () => {
    it('sets turnBased to true', () => {
      const { component } = setup();
      component.setTurnBased(true);
      expect(component.turnBased()).toBe(true);
    });

    it('sets turnBased back to false', () => {
      const { component } = setup();
      component.setTurnBased(true);
      component.setTurnBased(false);
      expect(component.turnBased()).toBe(false);
    });
  });

  // -- Validation -----------------------------------------------------

  describe('nameError', () => {
    it('is set when sessionName is empty', () => {
      const { component } = setup();
      component.setSessionName('');
      expect(component.nameError()).not.toBeNull();
    });

    it('is set when sessionName is only whitespace', () => {
      const { component } = setup();
      component.setSessionName('   ');
      expect(component.nameError()).not.toBeNull();
    });

    it('is null when sessionName has content', () => {
      const { component } = setup();
      component.setSessionName('My Session');
      expect(component.nameError()).toBeNull();
    });
  });

  describe('canSubmit', () => {
    it('is false when sessionName is empty', () => {
      const { component } = setup();
      component.setSessionName('');
      expect(component.canSubmit()).toBe(false);
    });

    it('is false while submitting is true', () => {
      const { component } = setup();
      component.setSessionName('Valid Name');
      component.submitting.set(true);
      expect(component.canSubmit()).toBe(false);
    });

    it('is true when name is valid and not submitting', () => {
      const { component } = setup();
      component.setSessionName('Valid Name');
      expect(component.canSubmit()).toBe(true);
    });
  });

  // -- startSession ---------------------------------------------------

  describe('startSession', () => {
    it('does nothing when canSubmit is false', async () => {
      const { component, mockSessionService } = setup();
      component.setSessionName('');
      await component.startSession();
      expect(mockSessionService.createSession).not.toHaveBeenCalled();
    });

    it('calls SessionService.createSession with the correct payload', async () => {
      const { component, mockSessionService } = setup();
      component.setSessionName('Friday Night Trivia');
      component.setMode('computer_hosted');
      component.setTurnBased(false);

      await component.startSession();

      expect(mockSessionService.createSession).toHaveBeenCalledWith({
        gameId: 42,
        name: 'Friday Night Trivia',
        mode: 'computer_hosted',
        turnBased: false,
      });
    });

    it('trims whitespace from sessionName before posting', async () => {
      const { component, mockSessionService } = setup();
      component.setSessionName('  Trivia Night  ');

      await component.startSession();

      expect(mockSessionService.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Trivia Night' }),
      );
    });

    it('navigates to /session/:id after a successful create', async () => {
      const { component, router } = setup();
      component.setSessionName('Test Session');
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      await component.startSession();

      expect(navSpy).toHaveBeenCalledWith(['/session', 99]);
    });

    it('sets submitError from the server message on failure', async () => {
      const { component, mockSessionService } = setup();
      component.setSessionName('Test Session');
      mockSessionService.createSession.mockRejectedValue({
        error: { error: { message: 'Game is not published.' } },
      });

      await component.startSession();

      expect(component.submitError()).toBe('Game is not published.');
    });

    it('uses a fallback message when the error has no message', async () => {
      const { component, mockSessionService } = setup();
      component.setSessionName('Test Session');
      mockSessionService.createSession.mockRejectedValue(new Error('Network error'));

      await component.startSession();

      expect(component.submitError()).not.toBeNull();
    });

    it('clears submitting after a failure', async () => {
      const { component, mockSessionService } = setup();
      component.setSessionName('Test Session');
      mockSessionService.createSession.mockRejectedValue(new Error('Error'));

      await component.startSession();

      expect(component.submitting()).toBe(false);
    });
  });
});
