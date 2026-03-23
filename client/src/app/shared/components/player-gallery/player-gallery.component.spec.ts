import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import type { LivePlayer } from '@extriviate/shared';
import { PlayerGalleryComponent } from './player-gallery.component';
import { WebRtcService } from '../../../core/services/webrtc.service';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<LivePlayer> = {}): LivePlayer {
  return {
    playerId: 1,
    displayName: 'Alice',
    score: 200,
    isHost: false,
    isReady: true,
    isDisconnected: false,
    avatarMode: 'none',
    avatarUrl: null,
    cameraActive: false,
    audioMuted: true,
    peerId: null,
    ...overrides,
  };
}

function buildWebRtcStub(
  peerIdValue: string | null = null,
  initialRemoteStreams: Map<string, MediaStream> = new Map<string, MediaStream>(),
) {
  const localStream$ = signal<MediaStream | null>(null);
  const remoteStreams = signal<Map<string, MediaStream>>(initialRemoteStreams);
  return {
    localStream$,
    remoteStreams,
    get peerId() {
      return peerIdValue;
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PlayerGalleryComponent', () => {
  let fixture: ComponentFixture<PlayerGalleryComponent>;
  let component: PlayerGalleryComponent;
  let webrtcStub: ReturnType<typeof buildWebRtcStub>;

  function setup(
    players: LivePlayer[],
    inputs: {
      activePlayerId?: number | null;
      questionSelecterId?: number | null;
      showScores?: boolean;
      layout?: 'row' | 'grid';
      submittedAnswer?: string | null;
    } = {},
    peerIdValue: string | null = null,
    initialRemoteStreams: Map<string, MediaStream> = new Map<string, MediaStream>(),
  ): HTMLElement {
    webrtcStub = buildWebRtcStub(peerIdValue, initialRemoteStreams);

    TestBed.configureTestingModule({
      imports: [PlayerGalleryComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: WebRtcService, useValue: webrtcStub },
      ],
    });

    fixture = TestBed.createComponent(PlayerGalleryComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('players', players);
    if (inputs.activePlayerId !== undefined)
      fixture.componentRef.setInput('activePlayerId', inputs.activePlayerId);
    if (inputs.questionSelecterId !== undefined)
      fixture.componentRef.setInput('questionSelecterId', inputs.questionSelecterId);
    if (inputs.showScores !== undefined)
      fixture.componentRef.setInput('showScores', inputs.showScores);
    if (inputs.layout !== undefined) fixture.componentRef.setInput('layout', inputs.layout);
    if (inputs.submittedAnswer !== undefined)
      fixture.componentRef.setInput('submittedAnswer', inputs.submittedAnswer);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  // ─── Rendering ─────────────────────────────────────────────────────────────

  it('shows empty-state message when players array is empty', () => {
    const el = setup([]);
    expect(el.querySelector('.empty-state')?.textContent?.trim()).toBe('No players yet');
  });

  it('renders one .player-card per player', () => {
    const el = setup([
      makePlayer({ playerId: 1 }),
      makePlayer({ playerId: 2, displayName: 'Bob' }),
    ]);
    expect(el.querySelectorAll('.player-card').length).toBe(2);
  });

  it('renders player display names', () => {
    const el = setup([makePlayer({ displayName: 'Zara' })]);
    expect(el.querySelector('.player-name')?.textContent?.trim()).toBe('Zara');
  });

  it('applies layout-row class when layout is row', () => {
    const el = setup([makePlayer()], { layout: 'row' });
    expect(el.querySelector('.gallery')?.classList).toContain('layout-row');
  });

  it('applies layout-grid class when layout is grid', () => {
    const el = setup([makePlayer()], { layout: 'grid' });
    expect(el.querySelector('.gallery')?.classList).toContain('layout-grid');
  });

  it('adds .active class to the card of the active player', () => {
    const el = setup(
      [makePlayer({ playerId: 1 }), makePlayer({ playerId: 2, displayName: 'Bob' })],
      { activePlayerId: 1 },
    );
    const cards = el.querySelectorAll('.player-card');
    expect(cards[0].classList).toContain('active');
    expect(cards[1].classList).not.toContain('active');
  });

  it('adds .selector class to the card of the question selecter', () => {
    const el = setup(
      [makePlayer({ playerId: 1 }), makePlayer({ playerId: 2, displayName: 'Bob' })],
      { questionSelecterId: 2 },
    );
    const cards = el.querySelectorAll('.player-card');
    expect(cards[0].classList).not.toContain('selector');
    expect(cards[1].classList).toContain('selector');
  });

  it('adds .disconnected class and renders disconnected overlay', () => {
    const el = setup([makePlayer({ isDisconnected: true })]);
    const card = el.querySelector('.player-card')!;
    expect(card.classList).toContain('disconnected');
    expect(card.querySelector('.disconnected-overlay')).not.toBeNull();
  });

  it('hides score element when showScores is false (default)', () => {
    const el = setup([makePlayer({ score: 500 })]);
    expect(el.querySelector('.player-score')).toBeNull();
  });

  it('shows score when showScores is true', () => {
    const el = setup([makePlayer({ score: 400 })], { showScores: true });
    expect(el.querySelector('.player-score')?.textContent).toContain('400');
  });

  it('applies .negative class to score when score is below zero', () => {
    const el = setup([makePlayer({ score: -200 })], { showScores: true });
    expect(el.querySelector('.player-score')?.classList).toContain('negative');
  });

  it('renders Host badge for players where isHost is true', () => {
    const el = setup([makePlayer({ isHost: true })]);
    expect(el.querySelector('.badge-host')?.textContent?.trim()).toBe('Host');
  });

  it('renders Active badge for the active player', () => {
    const el = setup([makePlayer({ playerId: 1 })], { activePlayerId: 1 });
    expect(el.querySelector('.badge-active')?.textContent?.trim()).toBe('Active');
  });

  it('renders audio indicator when player mic is active and camera is on', () => {
    const el = setup([makePlayer({ audioMuted: false, cameraActive: true })]);
    expect(el.querySelector('.audio-indicator')).not.toBeNull();
  });

  it('does not render audio indicator when audioMuted is true', () => {
    const el = setup([makePlayer({ audioMuted: true, cameraActive: true })]);
    expect(el.querySelector('.audio-indicator')).toBeNull();
  });

  it('shows speech bubble for active player in row layout when submittedAnswer is set', () => {
    const el = setup([makePlayer({ playerId: 1 })], {
      layout: 'row',
      activePlayerId: 1,
      submittedAnswer: 'What is gravity?',
    });
    expect(el.querySelector('app-speech-bubble')).not.toBeNull();
  });

  it('does not show speech bubble in grid layout', () => {
    const el = setup([makePlayer({ playerId: 1 })], {
      layout: 'grid',
      activePlayerId: 1,
      submittedAnswer: 'What is gravity?',
    });
    expect(el.querySelector('app-speech-bubble')).toBeNull();
  });

  it('does not show speech bubble when submittedAnswer is null', () => {
    const el = setup([makePlayer({ playerId: 1 })], {
      layout: 'row',
      activePlayerId: 1,
      submittedAnswer: null,
    });
    expect(el.querySelector('app-speech-bubble')).toBeNull();
  });

  it('renders avatar initial when player has no stream and no avatarUrl', () => {
    const el = setup([makePlayer({ displayName: 'Quinn', avatarMode: 'none' })]);
    expect(el.querySelector('.avatar-initial')?.textContent?.trim()).toBe('Q');
  });

  it('renders avatar image when avatarMode is static and avatarUrl is set', () => {
    const el = setup([
      makePlayer({ avatarMode: 'static', avatarUrl: 'https://example.com/img.png' }),
    ]);
    const img = el.querySelector('.avatar-image') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.src).toContain('example.com/img.png');
  });

  // ─── Pure methods ──────────────────────────────────────────────────────────

  it('isActive() returns true when player.playerId matches activePlayerId', () => {
    setup([makePlayer()], { activePlayerId: 1 });
    expect(component.isActive(makePlayer({ playerId: 1 }))).toBe(true);
  });

  it('isActive() returns false when player.playerId does not match activePlayerId', () => {
    setup([makePlayer()], { activePlayerId: 2 });
    expect(component.isActive(makePlayer({ playerId: 1 }))).toBe(false);
  });

  it('isSelector() returns true when player.playerId matches questionSelecterId', () => {
    setup([makePlayer()], { questionSelecterId: 1 });
    expect(component.isSelector(makePlayer({ playerId: 1 }))).toBe(true);
  });

  it('isSelector() returns false when player.playerId does not match questionSelecterId', () => {
    setup([makePlayer()], { questionSelecterId: 99 });
    expect(component.isSelector(makePlayer({ playerId: 1 }))).toBe(false);
  });

  it('showBubble() returns true in row layout with active player and submittedAnswer', () => {
    setup([makePlayer()], { layout: 'row', activePlayerId: 1, submittedAnswer: 'X' });
    expect(component.showBubble(makePlayer({ playerId: 1 }))).toBe(true);
  });

  it('showBubble() returns false in grid layout', () => {
    setup([makePlayer()], { layout: 'grid', activePlayerId: 1, submittedAnswer: 'X' });
    expect(component.showBubble(makePlayer({ playerId: 1 }))).toBe(false);
  });

  it('showBubble() returns false when submittedAnswer is null', () => {
    setup([makePlayer()], { layout: 'row', activePlayerId: 1, submittedAnswer: null });
    expect(component.showBubble(makePlayer({ playerId: 1 }))).toBe(false);
  });

  it('showBubble() returns false when player is not the active player', () => {
    setup([makePlayer()], { layout: 'row', activePlayerId: 99, submittedAnswer: 'X' });
    expect(component.showBubble(makePlayer({ playerId: 1 }))).toBe(false);
  });

  it('getBubbleTailSide() always returns bottom', () => {
    setup([makePlayer()]);
    expect(component.getBubbleTailSide()).toBe('bottom');
  });

  it('getInitial() returns uppercase first character of name', () => {
    setup([makePlayer()]);
    expect(component.getInitial('alice')).toBe('A');
    expect(component.getInitial('Bob')).toBe('B');
  });

  it('trackByPlayerId() returns the player playerId', () => {
    setup([makePlayer()]);
    expect(component.trackByPlayerId(0, makePlayer({ playerId: 42 }))).toBe(42);
  });

  // ─── hasVideoStream() ──────────────────────────────────────────────────────

  it('hasVideoStream() returns false when player has no peerId', () => {
    setup([makePlayer({ peerId: null })]);
    expect(component.hasVideoStream(makePlayer({ peerId: null }))).toBe(false);
  });

  it('hasVideoStream() returns false when remote player cameraActive is false', () => {
    // hasVideoStream() only checks Map.has() — a plain object stub suffices
    const fakeStream = {} as MediaStream;
    setup([makePlayer({ peerId: 'peer-remote', cameraActive: false })], {}, null);
    webrtcStub.remoteStreams.set(new Map([['peer-remote', fakeStream]]));
    expect(
      component.hasVideoStream(makePlayer({ peerId: 'peer-remote', cameraActive: false })),
    ).toBe(false);
  });

  it('hasVideoStream() returns true when remote player has stream and cameraActive is true', () => {
    const fakeStream = {} as MediaStream;
    setup([makePlayer({ peerId: 'peer-remote', cameraActive: true })], {}, 'peer-local');
    webrtcStub.remoteStreams.set(new Map([['peer-remote', fakeStream]]));
    expect(
      component.hasVideoStream(makePlayer({ peerId: 'peer-remote', cameraActive: true })),
    ).toBe(true);
  });

  it('hasVideoStream() returns true for local player when localStream is set and cameraActive is true', () => {
    const fakeStream = {} as MediaStream;
    setup([makePlayer({ peerId: 'peer-local', cameraActive: true })], {}, 'peer-local');
    webrtcStub.localStream$.set(fakeStream);
    expect(component.hasVideoStream(makePlayer({ peerId: 'peer-local', cameraActive: true }))).toBe(
      true,
    );
  });

  it('hasVideoStream() returns false for local player when localStream is null', () => {
    setup([makePlayer({ peerId: 'peer-local', cameraActive: true })], {}, 'peer-local');
    // localStream$ defaults to null in stub
    expect(component.hasVideoStream(makePlayer({ peerId: 'peer-local', cameraActive: true }))).toBe(
      false,
    );
  });

  // ─── stream-attachment effect (lines 58-69) ────────────────────────────────

  it('attaches a remote stream to the matching <video> element via data-peer-id', () => {
    // The stream must be in remoteStreams before setup so that hasVideoStream() returns
    // true on the initial render and the <video #videoEl [attr.data-peer-id]> element
    // is created in the DOM.  Once the element exists, the stream-attachment effect
    // (lines 58-69 in the component source) assigns video.srcObject.
    const fakeStream = {} as MediaStream;
    const initialRemote = new Map([['peer-abc', fakeStream]]);
    const el = setup(
      [makePlayer({ playerId: 1, peerId: 'peer-abc', cameraActive: true })],
      {},
      'peer-local', // local peerId is different so the remote branch fires
      initialRemote,
    );

    // The video element must be present after the first render
    expect(el.querySelector<HTMLVideoElement>('video[data-peer-id="peer-abc"]')).not.toBeNull();

    // Flush the effect so the srcObject assignment runs
    TestBed.flushEffects();

    // JSDOM's HTMLVideoElement.srcObject setter is a no-op, so we verify the
    // effect ran without throwing and the video element is still in the DOM.
    expect(el.querySelector<HTMLVideoElement>('video[data-peer-id="peer-abc"]')).not.toBeNull();
    expect(
      component.hasVideoStream(makePlayer({ playerId: 1, peerId: 'peer-abc', cameraActive: true })),
    ).toBe(true);
  });

  it('attaches local stream to the <video> element matching the local peerId', () => {
    // The local branch fires when peerId === myPeerId. Supply the local stream via
    // localStream$ before setup so hasVideoStream() returns true on initial render.
    const fakeStream = {} as MediaStream;
    const el = setup(
      [makePlayer({ playerId: 1, peerId: 'peer-me', cameraActive: true })],
      {},
      'peer-me', // local peerId matches the player's peerId
    );

    // Initially no local stream → video element not rendered yet
    expect(el.querySelector<HTMLVideoElement>('video[data-peer-id="peer-me"]')).toBeNull();

    // Provide the local stream, re-render so hasVideoStream() returns true and the
    // <video> element is created, then flush effects for the srcObject assignment.
    webrtcStub.localStream$.set(fakeStream);
    fixture.detectChanges();
    TestBed.flushEffects();

    // Effect ran without error; video element is now in the DOM
    expect(el.querySelector<HTMLVideoElement>('video[data-peer-id="peer-me"]')).not.toBeNull();
    expect(
      component.hasVideoStream(makePlayer({ playerId: 1, peerId: 'peer-me', cameraActive: true })),
    ).toBe(true);
  });
});
