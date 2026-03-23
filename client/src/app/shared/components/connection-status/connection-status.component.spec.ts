import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { vi } from 'vitest';
import { ConnectionStatusComponent } from './connection-status.component';
import { GameSocketService } from '../../../core/services/game-socket.service';

// ---------------------------------------------------------------------------
// Shared mock state — replaced per-test via .set()

const mockConnectionState = signal<'disconnected' | 'connecting' | 'connected'>('disconnected');
const mockReconnecting = signal(false);

const mockSocketService = {
  connectionState: mockConnectionState,
  reconnecting: mockReconnecting,
};

// ---------------------------------------------------------------------------

async function setup(): Promise<{
  fixture: ComponentFixture<ConnectionStatusComponent>;
  component: ConnectionStatusComponent;
  el: HTMLElement;
}> {
  await TestBed.configureTestingModule({
    imports: [ConnectionStatusComponent],
    providers: [
      provideZonelessChangeDetection(),
      { provide: GameSocketService, useValue: mockSocketService },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ConnectionStatusComponent);
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    el: fixture.nativeElement as HTMLElement,
  };
}

// ---------------------------------------------------------------------------

describe('ConnectionStatusComponent', () => {
  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
    // Reset shared signal state after each test
    mockReconnecting.set(false);
    mockConnectionState.set('disconnected');
  });

  // -------------------------------------------------------------------------
  it('creates the component', async () => {
    const { component } = await setup();
    expect(component).toBeTruthy();
  });

  it('exposes the injected socket service via the public socket property', async () => {
    const { component } = await setup();
    expect(component.socket).toBe(mockSocketService);
  });

  // -------------------------------------------------------------------------
  describe('when reconnecting is false', () => {
    it('renders no banner', async () => {
      mockReconnecting.set(false);
      const { el } = await setup();
      expect(el.querySelector('.reconnect-banner')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe('when reconnecting is true and connectionState is "connecting"', () => {
    it('renders the reconnect banner', async () => {
      mockReconnecting.set(true);
      mockConnectionState.set('connecting');
      const { el } = await setup();
      expect(el.querySelector('.reconnect-banner')).not.toBeNull();
    });

    it('shows "Reconnecting…" text', async () => {
      mockReconnecting.set(true);
      mockConnectionState.set('connecting');
      const { el } = await setup();
      const text = el.querySelector('.banner-text')?.textContent?.trim();
      expect(text).toBe('Reconnecting\u2026');
    });

    it('banner has role="status" for screen readers', async () => {
      mockReconnecting.set(true);
      mockConnectionState.set('connecting');
      const { el } = await setup();
      expect(el.querySelector('.reconnect-banner')?.getAttribute('role')).toBe('status');
    });

    it('banner has aria-live="polite"', async () => {
      mockReconnecting.set(true);
      mockConnectionState.set('connecting');
      const { el } = await setup();
      expect(el.querySelector('.reconnect-banner')?.getAttribute('aria-live')).toBe('polite');
    });

    it('renders the spinner element', async () => {
      mockReconnecting.set(true);
      mockConnectionState.set('connecting');
      const { el } = await setup();
      expect(el.querySelector('.spinner')).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe('when reconnecting is true and connectionState is "disconnected"', () => {
    it('renders the reconnect banner', async () => {
      mockReconnecting.set(true);
      mockConnectionState.set('disconnected');
      const { el } = await setup();
      expect(el.querySelector('.reconnect-banner')).not.toBeNull();
    });

    it('shows "Connection lost — waiting to reconnect…" text', async () => {
      mockReconnecting.set(true);
      mockConnectionState.set('disconnected');
      const { el } = await setup();
      const text = el.querySelector('.banner-text')?.textContent?.trim();
      // The template uses &mdash; and &hellip; HTML entities
      expect(text).toBe('Connection lost \u2014 waiting to reconnect\u2026');
    });
  });

  // -------------------------------------------------------------------------
  describe('reactive updates', () => {
    it('shows banner after reconnecting signal becomes true', async () => {
      mockReconnecting.set(false);
      mockConnectionState.set('connecting');
      const { fixture, el } = await setup();

      // Initially no banner
      expect(el.querySelector('.reconnect-banner')).toBeNull();

      // Simulate reconnect starting
      mockReconnecting.set(true);
      fixture.detectChanges();

      expect(el.querySelector('.reconnect-banner')).not.toBeNull();
    });

    it('hides banner after reconnecting signal becomes false', async () => {
      mockReconnecting.set(true);
      mockConnectionState.set('connecting');
      const { fixture, el } = await setup();

      // Initially banner is shown
      expect(el.querySelector('.reconnect-banner')).not.toBeNull();

      // Simulate reconnect complete
      mockReconnecting.set(false);
      fixture.detectChanges();

      expect(el.querySelector('.reconnect-banner')).toBeNull();
    });

    it('switches banner text when connectionState changes from "disconnected" to "connecting"', async () => {
      mockReconnecting.set(true);
      mockConnectionState.set('disconnected');
      const { fixture, el } = await setup();

      // Initially shows "connection lost" text
      expect(el.querySelector('.banner-text')?.textContent?.trim()).toBe(
        'Connection lost \u2014 waiting to reconnect\u2026',
      );

      // State changes to actively connecting
      mockConnectionState.set('connecting');
      fixture.detectChanges();

      expect(el.querySelector('.banner-text')?.textContent?.trim()).toBe('Reconnecting\u2026');
    });
  });
});
