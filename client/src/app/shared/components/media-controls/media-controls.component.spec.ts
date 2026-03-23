import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { vi } from 'vitest';
import { MediaControlsComponent } from './media-controls.component';
import { WebRtcService } from '../../../core/services/webrtc.service';
import { GameSocketService } from '../../../core/services/game-socket.service';

// ─── Stub factories ──────────────────────────────────────────────────────────

function buildWebRtcStub(streamValue: MediaStream | null = null) {
  return {
    localStream$: signal<MediaStream | null>(streamValue),
    cameraActive: signal(false),
    audioMuted: signal(true),
    toggleCamera: vi.fn(),
    toggleAudio: vi.fn(),
  };
}

function buildSocketStub() {
  return { send: vi.fn() };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MediaControlsComponent', () => {
  let fixture: ComponentFixture<MediaControlsComponent>;
  let component: MediaControlsComponent;
  let webrtcStub: ReturnType<typeof buildWebRtcStub>;
  let socketStub: ReturnType<typeof buildSocketStub>;

  function setup(
    playerId = 42,
    streamValue: MediaStream | null = null,
    webrtcOverrides?: Partial<ReturnType<typeof buildWebRtcStub>>,
  ): HTMLElement {
    webrtcStub = { ...buildWebRtcStub(streamValue), ...webrtcOverrides };
    socketStub = buildSocketStub();

    TestBed.configureTestingModule({
      imports: [MediaControlsComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: WebRtcService, useValue: webrtcStub },
        { provide: GameSocketService, useValue: socketStub },
      ],
    });

    fixture = TestBed.createComponent(MediaControlsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('playerId', playerId);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  // ─── hasLocalStream computed ──────────────────────────────────────────────

  it('hasLocalStream is false when localStream$() returns null', () => {
    setup(1, null);
    expect(component.hasLocalStream()).toBe(false);
  });

  it('hasLocalStream is true when localStream$() returns a stream object', () => {
    // JSDOM does not implement MediaStream — a plain object stub is sufficient
    // because the component only checks !!localStream$()
    setup(1, {} as MediaStream);
    expect(component.hasLocalStream()).toBe(true);
  });

  // ─── Template rendering ───────────────────────────────────────────────────

  it('hides the media-controls div when there is no stream', () => {
    const el = setup(1, null);
    expect(el.querySelector('.media-controls')).toBeNull();
  });

  it('shows the media-controls div when a stream is present', () => {
    const el = setup(1, {} as MediaStream);
    expect(el.querySelector('.media-controls')).not.toBeNull();
  });

  it('camera button has aria-label "Turn camera off" when cameraActive is true', () => {
    const webrtcPatch = { cameraActive: signal(true) };
    const el = setup(
      1,
      {} as MediaStream,
      webrtcPatch as unknown as Partial<ReturnType<typeof buildWebRtcStub>>,
    );
    const cameraBtn = el.querySelectorAll('.control-btn')[0];
    expect(cameraBtn.getAttribute('aria-label')).toBe('Turn camera off');
  });

  it('camera button has aria-label "Turn camera on" when cameraActive is false', () => {
    const el = setup(1, {} as MediaStream);
    // Default cameraActive is false
    const cameraBtn = el.querySelectorAll('.control-btn')[0];
    expect(cameraBtn.getAttribute('aria-label')).toBe('Turn camera on');
  });

  it('audio button has aria-label "Unmute microphone" when audioMuted is true', () => {
    const el = setup(1, {} as MediaStream);
    // Default audioMuted is true
    const audioBtn = el.querySelectorAll('.control-btn')[1];
    expect(audioBtn.getAttribute('aria-label')).toBe('Unmute microphone');
  });

  it('audio button has aria-label "Mute microphone" when audioMuted is false', () => {
    const webrtcPatch = { audioMuted: signal(false) };
    const el = setup(
      1,
      {} as MediaStream,
      webrtcPatch as unknown as Partial<ReturnType<typeof buildWebRtcStub>>,
    );
    const audioBtn = el.querySelectorAll('.control-btn')[1];
    expect(audioBtn.getAttribute('aria-label')).toBe('Mute microphone');
  });

  it('camera button has .off class when cameraActive is false', () => {
    const el = setup(1, {} as MediaStream);
    expect(el.querySelectorAll('.control-btn')[0].classList).toContain('off');
  });

  it('audio button has .off class when audioMuted is true', () => {
    const el = setup(1, {} as MediaStream);
    expect(el.querySelectorAll('.control-btn')[1].classList).toContain('off');
  });

  // ─── toggleCamera() ──────────────────────────────────────────────────────

  it('toggleCamera() is a no-op when there is no stream', () => {
    setup(1, null);
    component.toggleCamera();
    expect(webrtcStub.toggleCamera).not.toHaveBeenCalled();
    expect(socketStub.send).not.toHaveBeenCalled();
  });

  it('toggleCamera() calls webrtc.toggleCamera() when a stream is present', () => {
    setup(1, {} as MediaStream);
    component.toggleCamera();
    expect(webrtcStub.toggleCamera).toHaveBeenCalledOnce();
  });

  it('toggleCamera() sends a media_state_update socket message with correct playerId', () => {
    setup(7, {} as MediaStream);
    component.toggleCamera();
    expect(socketStub.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'media_state_update', playerId: 7 }),
    );
  });

  it('toggleCamera() sends cameraActive and audioMuted values from signals', () => {
    const webrtcPatch = { cameraActive: signal(true), audioMuted: signal(false) };
    setup(
      3,
      {} as MediaStream,
      webrtcPatch as unknown as Partial<ReturnType<typeof buildWebRtcStub>>,
    );
    component.toggleCamera();
    expect(socketStub.send).toHaveBeenCalledWith({
      type: 'media_state_update',
      playerId: 3,
      cameraActive: true,
      audioMuted: false,
    });
  });

  // ─── toggleAudio() ───────────────────────────────────────────────────────

  it('toggleAudio() is a no-op when there is no stream', () => {
    setup(1, null);
    component.toggleAudio();
    expect(webrtcStub.toggleAudio).not.toHaveBeenCalled();
    expect(socketStub.send).not.toHaveBeenCalled();
  });

  it('toggleAudio() calls webrtc.toggleAudio() when a stream is present', () => {
    setup(1, {} as MediaStream);
    component.toggleAudio();
    expect(webrtcStub.toggleAudio).toHaveBeenCalledOnce();
  });

  it('toggleAudio() sends a media_state_update socket message with correct playerId', () => {
    setup(99, {} as MediaStream);
    component.toggleAudio();
    expect(socketStub.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'media_state_update', playerId: 99 }),
    );
  });

  it('toggleAudio() sends current cameraActive and audioMuted signal values', () => {
    const webrtcPatch = { cameraActive: signal(false), audioMuted: signal(true) };
    setup(
      5,
      {} as MediaStream,
      webrtcPatch as unknown as Partial<ReturnType<typeof buildWebRtcStub>>,
    );
    component.toggleAudio();
    expect(socketStub.send).toHaveBeenCalledWith({
      type: 'media_state_update',
      playerId: 5,
      cameraActive: false,
      audioMuted: true,
    });
  });
});
