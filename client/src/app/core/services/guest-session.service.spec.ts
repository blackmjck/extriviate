import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { vi } from 'vitest';
import { GuestSessionService } from './guest-session.service';

function setup() {
  TestBed.configureTestingModule({
    providers: [GuestSessionService, provideZonelessChangeDetection()],
  });
  return TestBed.inject(GuestSessionService);
}

describe('GuestSessionService', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  describe('store()', () => {
    it('writes all three keys to sessionStorage', () => {
      const service = setup();
      service.store('my-token', 42, 7);
      expect(sessionStorage.getItem('extriviate_guest_token')).toBe('my-token');
      expect(sessionStorage.getItem('extriviate_guest_player_id')).toBe('42');
      expect(sessionStorage.getItem('extriviate_guest_session_id')).toBe('7');
    });
  });

  describe('getToken()', () => {
    it('returns the token after store', () => {
      const service = setup();
      service.store('abc-token', 1, 2);
      expect(service.getToken()).toBe('abc-token');
    });

    it('returns null when no token is stored', () => {
      const service = setup();
      expect(service.getToken()).toBeNull();
    });
  });

  describe('getPlayerId()', () => {
    it('returns the player id as a number after store', () => {
      const service = setup();
      service.store('tok', 99, 3);
      expect(service.getPlayerId()).toBe(99);
    });

    it('returns null when no player id is stored', () => {
      const service = setup();
      expect(service.getPlayerId()).toBeNull();
    });
  });

  describe('getSessionId()', () => {
    it('returns the session id as a number after store', () => {
      const service = setup();
      service.store('tok', 1, 55);
      expect(service.getSessionId()).toBe(55);
    });

    it('returns null when no session id is stored', () => {
      const service = setup();
      expect(service.getSessionId()).toBeNull();
    });
  });

  describe('clear()', () => {
    it('removes all three keys from sessionStorage', () => {
      const service = setup();
      service.store('tok', 10, 20);
      service.clear();
      expect(sessionStorage.getItem('extriviate_guest_token')).toBeNull();
      expect(sessionStorage.getItem('extriviate_guest_player_id')).toBeNull();
      expect(sessionStorage.getItem('extriviate_guest_session_id')).toBeNull();
    });
  });

  describe('hasSession()', () => {
    it('returns true after store', () => {
      const service = setup();
      service.store('tok', 1, 2);
      expect(service.hasSession()).toBe(true);
    });

    it('returns false after clear', () => {
      const service = setup();
      service.store('tok', 1, 2);
      service.clear();
      expect(service.hasSession()).toBe(false);
    });

    it('returns false when nothing has been stored', () => {
      const service = setup();
      expect(service.hasSession()).toBe(false);
    });
  });
});
