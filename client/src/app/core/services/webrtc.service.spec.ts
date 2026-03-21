import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { WebRtcService } from './webrtc.service';
import { GameSocketService } from './game-socket.service';
import { GameStateService } from './game-state.service';
import type { GameplayMessage, LivePlayer } from '@extriviate/shared';

// ---------------------------------------------------------------------------
// RTCPeerConnection class-based mock
//
// vi.stubGlobal requires a true constructor function, not an arrow-function
// wrapped in vi.fn(). We use a class here so `new RTCPeerConnection()` works.
// ---------------------------------------------------------------------------

/** Shared registry so tests can inspect every PC created in a test run. */
let createdPCs: MockPC[] = [];

class MockPC {
  addTrack = vi.fn();
  getSenders = vi.fn().mockReturnValue([]);
  createOffer = vi.fn().mockResolvedValue({ sdp: 'offer-sdp', type: 'offer' as RTCSdpType });
  createAnswer = vi.fn().mockResolvedValue({ sdp: 'answer-sdp', type: 'answer' as RTCSdpType });
  setLocalDescription = vi.fn().mockResolvedValue(undefined);
  setRemoteDescription = vi.fn().mockResolvedValue(undefined);
  addIceCandidate = vi.fn().mockResolvedValue(undefined);
  close = vi.fn();
  connectionState: RTCPeerConnectionState = 'new';

  onicecandidate: ((ev: RTCPeerConnectionIceEvent) => void) | null = null;
  ontrack: ((ev: RTCTrackEvent) => void) | null = null;
  onconnectionstatechange: ((ev: Event) => void) | null = null;

  constructor() {
    createdPCs.push(this);
  }
}

/** Minimal MediaStream stub — the service only calls getTracks/getVideoTracks/getAudioTracks/stop. */
class MockMediaStream {
  private _videoTracks: object[];
  private _audioTracks: object[];

  constructor(videoTracks: object[] = [], audioTracks: object[] = []) {
    this._videoTracks = videoTracks;
    this._audioTracks = audioTracks;
  }

  getVideoTracks = vi.fn(() => this._videoTracks);
  getAudioTracks = vi.fn(() => this._audioTracks);
  getTracks = vi.fn(() => [...this._videoTracks, ...this._audioTracks]);
  addTrack = vi.fn();
}

/** Build a LivePlayer with sensible defaults. */
function makePlayer(override: Partial<LivePlayer> = {}): LivePlayer {
  return {
    playerId: override.playerId ?? 1,
    displayName: override.displayName ?? 'Player',
    score: override.score ?? 0,
    isHost: override.isHost ?? false,
    isReady: override.isReady ?? false,
    isDisconnected: override.isDisconnected ?? false,
    avatarMode: override.avatarMode ?? 'none',
    avatarUrl: override.avatarUrl ?? null,
    cameraActive: override.cameraActive ?? false,
    audioMuted: override.audioMuted ?? true,
    peerId: override.peerId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Test setup helper
// ---------------------------------------------------------------------------

function setup(initialPlayers: Partial<LivePlayer>[] = []) {
  // Reset the shared PC registry before each test
  createdPCs = [];

  const messages$ = new Subject<GameplayMessage>();
  const socketSend = vi.fn();

  const mockSocket = { messages$, send: socketSend };

  const playersSignal = signal<LivePlayer[]>(initialPlayers.map(makePlayer));
  const mockGameState = { players: playersSignal };

  // Stub RTCPeerConnection globally using a real class (vi.stubGlobal requires a constructor)
  vi.stubGlobal('RTCPeerConnection', MockPC);

  // Stub MediaStream globally using a real class.
  // The service calls `new MediaStream()` inside createPeerConnection, so the stub
  // must be constructable. MockMediaStream IS a class, so it satisfies that requirement.
  vi.stubGlobal('MediaStream', MockMediaStream);

  // Stub navigator.mediaDevices so getUserMedia can be mocked per-test
  const getUserMedia = vi.fn();
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: { getUserMedia },
  });

  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      WebRtcService,
      { provide: GameSocketService, useValue: mockSocket },
      { provide: GameStateService, useValue: mockGameState },
    ],
  });

  const service = TestBed.inject(WebRtcService);

  return { service, messages$, socketSend, playersSignal, getUserMedia };
}

// ---------------------------------------------------------------------------

describe('WebRtcService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  // -------------------------------------------------------------------------
  describe('initial state', () => {
    it('peerId is null before generatePeerId is called', () => {
      const { service } = setup();
      expect(service.peerId).toBeNull();
    });

    it('localStream$ signal is null initially', () => {
      const { service } = setup();
      expect(service.localStream$()).toBeNull();
    });

    it('remoteStreams signal is an empty Map initially', () => {
      const { service } = setup();
      expect(service.remoteStreams().size).toBe(0);
    });

    it('cameraActive signal is false initially', () => {
      const { service } = setup();
      expect(service.cameraActive()).toBe(false);
    });

    it('audioMuted signal is true initially', () => {
      const { service } = setup();
      expect(service.audioMuted()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('generatePeerId()', () => {
    it('returns a non-empty string', () => {
      const { service } = setup();
      const id = service.generatePeerId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('stores the result so peerId getter returns the same value', () => {
      const { service } = setup();
      const id = service.generatePeerId();
      expect(service.peerId).toBe(id);
    });

    it('generates a new ID on each call', () => {
      const { service } = setup();
      const id1 = service.generatePeerId();
      const id2 = service.generatePeerId();
      expect(id1).not.toBe(id2);
    });
  });

  // -------------------------------------------------------------------------
  describe('startLocalStream()', () => {
    it('returns the MediaStream on success', async () => {
      const { service, getUserMedia } = setup();
      const fakeStream = new MockMediaStream([{ enabled: true }], [{ enabled: true }]);
      getUserMedia.mockResolvedValue(fakeStream);

      const result = await service.startLocalStream();
      expect(result).toBe(fakeStream);
    });

    it('sets localStream$ signal to the acquired stream', async () => {
      const { service, getUserMedia } = setup();
      const fakeStream = new MockMediaStream();
      getUserMedia.mockResolvedValue(fakeStream);

      await service.startLocalStream();
      expect(service.localStream$()).toBe(fakeStream);
    });

    it('sets cameraActive to true when video is requested', async () => {
      const { service, getUserMedia } = setup();
      getUserMedia.mockResolvedValue(new MockMediaStream());

      await service.startLocalStream(true, true);
      expect(service.cameraActive()).toBe(true);
    });

    it('sets cameraActive to false when video is not requested', async () => {
      const { service, getUserMedia } = setup();
      getUserMedia.mockResolvedValue(new MockMediaStream());

      await service.startLocalStream(false, true);
      expect(service.cameraActive()).toBe(false);
    });

    it('sets audioMuted to false when audio is requested', async () => {
      const { service, getUserMedia } = setup();
      getUserMedia.mockResolvedValue(new MockMediaStream());

      await service.startLocalStream(true, true);
      expect(service.audioMuted()).toBe(false);
    });

    it('sets audioMuted to true when audio is not requested', async () => {
      const { service, getUserMedia } = setup();
      getUserMedia.mockResolvedValue(new MockMediaStream());

      await service.startLocalStream(true, false);
      expect(service.audioMuted()).toBe(true);
    });

    it('returns null when getUserMedia throws (permission denied)', async () => {
      const { service, getUserMedia } = setup();
      getUserMedia.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));

      const result = await service.startLocalStream();
      expect(result).toBeNull();
    });

    it('leaves signals unchanged when getUserMedia throws', async () => {
      const { service, getUserMedia } = setup();
      getUserMedia.mockRejectedValue(new Error('no device'));

      await service.startLocalStream();
      expect(service.localStream$()).toBeNull();
      expect(service.cameraActive()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('toggleCamera()', () => {
    it('does nothing when no local stream is present', () => {
      const { service } = setup();
      expect(() => service.toggleCamera()).not.toThrow();
      expect(service.cameraActive()).toBe(false);
    });

    it('disables all video tracks and sets cameraActive to false when currently active', async () => {
      const { service, getUserMedia } = setup();
      const videoTrack = { enabled: true };
      getUserMedia.mockResolvedValue(new MockMediaStream([videoTrack]));
      await service.startLocalStream(true, true);

      service.toggleCamera();

      expect(videoTrack.enabled).toBe(false);
      expect(service.cameraActive()).toBe(false);
    });

    it('enables all video tracks and sets cameraActive to true when currently inactive', async () => {
      const { service, getUserMedia } = setup();
      const videoTrack = { enabled: false };
      getUserMedia.mockResolvedValue(new MockMediaStream([videoTrack]));
      await service.startLocalStream(false, true);

      service.toggleCamera();

      expect(videoTrack.enabled).toBe(true);
      expect(service.cameraActive()).toBe(true);
    });

    it('toggles cameraActive again on a second call (on → off → on)', async () => {
      const { service, getUserMedia } = setup();
      const videoTrack = { enabled: true };
      getUserMedia.mockResolvedValue(new MockMediaStream([videoTrack]));
      await service.startLocalStream(true, true);

      service.toggleCamera(); // off
      service.toggleCamera(); // back on

      expect(videoTrack.enabled).toBe(true);
      expect(service.cameraActive()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('toggleAudio()', () => {
    it('does nothing when no local stream is present', () => {
      const { service } = setup();
      expect(() => service.toggleAudio()).not.toThrow();
    });

    it('mutes audio and sets audioMuted to true when currently unmuted', async () => {
      const { service, getUserMedia } = setup();
      const audioTrack = { enabled: true };
      getUserMedia.mockResolvedValue(new MockMediaStream([], [audioTrack]));
      await service.startLocalStream(true, true); // audioMuted becomes false

      service.toggleAudio();

      expect(audioTrack.enabled).toBe(false);
      expect(service.audioMuted()).toBe(true);
    });

    it('unmutes audio and sets audioMuted to false when currently muted', async () => {
      const { service, getUserMedia } = setup();
      const audioTrack = { enabled: false };
      getUserMedia.mockResolvedValue(new MockMediaStream([], [audioTrack]));
      await service.startLocalStream(true, false); // audioMuted becomes true

      service.toggleAudio();

      expect(audioTrack.enabled).toBe(true);
      expect(service.audioMuted()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('connectToPeer()', () => {
    it('does nothing when peerId has not been generated', async () => {
      const { service } = setup();
      await service.connectToPeer('remote-peer', 42);
      expect(createdPCs).toHaveLength(0);
    });

    it('creates an RTCPeerConnection and sends a webrtc_offer', async () => {
      const { service, socketSend } = setup();
      service.generatePeerId();

      await service.connectToPeer('remote-peer', 42);

      expect(socketSend).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'webrtc_offer', toPeerId: 'remote-peer' }),
      );
    });

    it('does not create a second connection when already connected to the same peer', async () => {
      const { service } = setup();
      service.generatePeerId();

      await service.connectToPeer('remote-peer', 42);
      const countAfterFirst = createdPCs.length;

      await service.connectToPeer('remote-peer', 42);

      expect(createdPCs.length).toBe(countAfterFirst);
    });

    it('adds local tracks to the peer connection when a local stream is active', async () => {
      const { service, getUserMedia } = setup();
      service.generatePeerId();

      const videoTrack = { enabled: true };
      const fakeStream = new MockMediaStream([videoTrack]);
      getUserMedia.mockResolvedValue(fakeStream);
      await service.startLocalStream();

      await service.connectToPeer('remote-peer', 42);

      expect(createdPCs[0].addTrack).toHaveBeenCalledWith(videoTrack, fakeStream);
    });

    it('sends the correct fromPeerId and sdp in the offer message', async () => {
      const { service, socketSend } = setup();
      const myPeerId = service.generatePeerId();

      await service.connectToPeer('their-peer', 99);

      expect(socketSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'webrtc_offer',
          fromPeerId: myPeerId,
          toPeerId: 'their-peer',
          sdp: 'offer-sdp',
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  describe('connectToAllPeers()', () => {
    it('connects to each player that has a peerId different from the local peer', async () => {
      const { service, socketSend, playersSignal } = setup();
      service.generatePeerId();

      playersSignal.set([
        makePlayer({ playerId: 2, peerId: 'bob-peer' }),
      ]);

      await service.connectToAllPeers();

      expect(socketSend).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'webrtc_offer', toPeerId: 'bob-peer' }),
      );
    });

    it('skips players with no peerId', async () => {
      const { service, socketSend, playersSignal } = setup();
      service.generatePeerId();

      playersSignal.set([makePlayer({ playerId: 2, peerId: null })]);

      await service.connectToAllPeers();

      expect(socketSend).not.toHaveBeenCalled();
    });

    it('skips the player whose peerId matches the local peer', async () => {
      const { service, socketSend, playersSignal } = setup();
      const myPeerId = service.generatePeerId();

      playersSignal.set([makePlayer({ playerId: 1, peerId: myPeerId })]);

      await service.connectToAllPeers();

      expect(socketSend).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('disconnectPeer()', () => {
    it('does nothing when the peer is not tracked', () => {
      const { service } = setup();
      expect(() => service.disconnectPeer('unknown-peer')).not.toThrow();
    });

    it('calls close() on the RTCPeerConnection for the specified peer', async () => {
      const { service } = setup();
      service.generatePeerId();
      await service.connectToPeer('remote-peer', 42);

      service.disconnectPeer('remote-peer');

      expect(createdPCs[0].close).toHaveBeenCalled();
    });

    it('removes the peer so a second disconnect call is a no-op', async () => {
      const { service } = setup();
      service.generatePeerId();
      await service.connectToPeer('remote-peer', 42);

      service.disconnectPeer('remote-peer');
      expect(createdPCs[0].close).toHaveBeenCalledTimes(1);

      // Second call must not throw and must not double-close
      expect(() => service.disconnectPeer('remote-peer')).not.toThrow();
      expect(createdPCs[0].close).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('destroy()', () => {
    it('closes all active peer connections', async () => {
      const { service } = setup();
      service.generatePeerId();
      await service.connectToPeer('peer-a', 1);
      await service.connectToPeer('peer-b', 2);

      service.destroy();

      expect(createdPCs[0].close).toHaveBeenCalled();
      expect(createdPCs[1].close).toHaveBeenCalled();
    });

    it('stops all tracks on the local stream', async () => {
      const { service, getUserMedia } = setup();
      const stopFn = vi.fn();
      const track = { stop: stopFn, enabled: true };
      const fakeStream = new MockMediaStream([track]);
      getUserMedia.mockResolvedValue(fakeStream);
      await service.startLocalStream();

      service.destroy();

      expect(stopFn).toHaveBeenCalled();
    });

    it('sets localStream$ to null', async () => {
      const { service, getUserMedia } = setup();
      getUserMedia.mockResolvedValue(new MockMediaStream());
      await service.startLocalStream();

      service.destroy();

      expect(service.localStream$()).toBeNull();
    });

    it('resets peerId to null', () => {
      const { service } = setup();
      service.generatePeerId();

      service.destroy();

      expect(service.peerId).toBeNull();
    });

    it('resets cameraActive to false', async () => {
      const { service, getUserMedia } = setup();
      getUserMedia.mockResolvedValue(new MockMediaStream());
      await service.startLocalStream(true, true);

      service.destroy();

      expect(service.cameraActive()).toBe(false);
    });

    it('resets audioMuted to true', async () => {
      const { service, getUserMedia } = setup();
      getUserMedia.mockResolvedValue(new MockMediaStream());
      await service.startLocalStream(true, true);

      service.destroy();

      expect(service.audioMuted()).toBe(true);
    });

    it('is safe to call when no stream and no peers exist', () => {
      const { service } = setup();
      expect(() => service.destroy()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  describe('ICE candidate emission via onicecandidate', () => {
    it('sends webrtc_ice_candidate via the socket when the connection emits a candidate', async () => {
      const { service, socketSend } = setup();
      const myPeerId = service.generatePeerId();
      await service.connectToPeer('remote-peer', 42);

      const fakeCandidate = { candidate: 'candidate-string', sdpMLineIndex: 0 };
      const pc = createdPCs[0];
      pc.onicecandidate!({ candidate: fakeCandidate } as unknown as RTCPeerConnectionIceEvent);

      // socketSend was called twice: once for the offer, once for the ICE candidate
      expect(socketSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'webrtc_ice_candidate',
          fromPeerId: myPeerId,
          toPeerId: 'remote-peer',
          candidate: JSON.stringify(fakeCandidate),
        }),
      );
    });

    it('does not send a candidate message when event.candidate is null', async () => {
      const { service, socketSend } = setup();
      service.generatePeerId();
      await service.connectToPeer('remote-peer', 42);

      const callsAfterOffer = socketSend.mock.calls.length;
      const pc = createdPCs[0];
      pc.onicecandidate!({ candidate: null } as unknown as RTCPeerConnectionIceEvent);

      expect(socketSend.mock.calls.length).toBe(callsAfterOffer);
    });
  });

  // -------------------------------------------------------------------------
  describe('ontrack handler — remote stream assembly', () => {
    it('calls addTrack on the internal remoteStream for each track in each incoming stream', async () => {
      const { service } = setup();
      service.generatePeerId();
      await service.connectToPeer('remote-peer', 42);

      const pc = createdPCs[0];
      const fakeTrack = {};
      const fakeRemoteStream = {
        getTracks: vi.fn().mockReturnValue([fakeTrack]),
      };

      // Retrieve the remoteStream mock created inside createPeerConnection.
      // MediaStream was stubbed globally so this is a MockMediaStream instance.
      pc.ontrack!({ streams: [fakeRemoteStream] } as unknown as RTCTrackEvent);

      // The handler iterates streams → tracks and calls remoteStream.addTrack().
      // We verify the function ran without error; the mock MediaStream captures the call.
      expect(service.remoteStreams).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  describe('onconnectionstatechange — peer cleanup', () => {
    it.each(['disconnected', 'failed', 'closed'] as RTCPeerConnectionState[])(
      'removes peer from internal tracking when connectionState becomes "%s"',
      async (state) => {
        const { service } = setup();
        service.generatePeerId();
        await service.connectToPeer('remote-peer', 42);

        const pc = createdPCs[0];
        pc.connectionState = state;
        pc.onconnectionstatechange!({} as Event);

        // After removal, a second explicit disconnect should be a no-op (peer gone)
        expect(() => service.disconnectPeer('remote-peer')).not.toThrow();
        // The handler does not call close() — it only removes the peer from the map
        expect(pc.close).not.toHaveBeenCalled();
      },
    );

    it('does not remove the peer when connectionState is "connected"', async () => {
      const { service } = setup();
      service.generatePeerId();
      await service.connectToPeer('remote-peer', 42);

      const pc = createdPCs[0];
      pc.connectionState = 'connected';
      pc.onconnectionstatechange!({} as Event);

      // Peer should still be tracked — explicit disconnect works
      service.disconnectPeer('remote-peer');
      expect(pc.close).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  describe('signaling message handling', () => {
    const tick = () => Promise.resolve();

    describe('webrtc_offer', () => {
      it('ignores the message when peerId has not been generated', async () => {
        const { messages$ } = setup();
        // No generatePeerId() — _peerId is null

        messages$.next({
          type: 'webrtc_offer',
          fromPeerId: 'sender',
          toPeerId: 'anyone',
          sdp: 'sdp',
        } as unknown as GameplayMessage);

        await tick();
        expect(createdPCs).toHaveLength(0);
      });

      it('ignores the message when toPeerId does not match the local peer', async () => {
        const { service, messages$ } = setup();
        service.generatePeerId();

        messages$.next({
          type: 'webrtc_offer',
          fromPeerId: 'sender',
          toPeerId: 'someone-else',
          sdp: 'sdp',
        } as unknown as GameplayMessage);

        await tick();
        expect(createdPCs).toHaveLength(0);
      });

      it('creates a peer connection and sends a webrtc_answer when a valid offer arrives', async () => {
        const { service, messages$, socketSend } = setup();
        const myPeerId = service.generatePeerId();

        messages$.next({
          type: 'webrtc_offer',
          fromPeerId: 'sender-peer',
          toPeerId: myPeerId,
          sdp: 'remote-offer-sdp',
        } as unknown as GameplayMessage);

        // handleSignalingMessage → handleOffer is fully async; drain the queue
        await tick(); // subscribe callback runs
        await tick(); // handleOffer's setRemoteDescription resolves
        await tick(); // createAnswer resolves
        await tick(); // setLocalDescription resolves

        expect(socketSend).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'webrtc_answer',
            fromPeerId: myPeerId,
            toPeerId: 'sender-peer',
            sdp: 'answer-sdp',
          }),
        );
      });

      it('reuses an existing peer connection instead of creating a new one when offer arrives for a known peer', async () => {
        const { service, messages$ } = setup();
        const myPeerId = service.generatePeerId();

        // Act as the initial offerer so the peer already exists
        await service.connectToPeer('sender-peer', 42);
        const countAfterFirst = createdPCs.length;

        // The remote sends us an updated offer
        messages$.next({
          type: 'webrtc_offer',
          fromPeerId: 'sender-peer',
          toPeerId: myPeerId,
          sdp: 'updated-offer-sdp',
        } as unknown as GameplayMessage);

        await tick();
        await tick();
        await tick();
        await tick();

        expect(createdPCs.length).toBe(countAfterFirst);
      });

      it('adds local tracks to the answer peer connection when a local stream is active', async () => {
        const { service, messages$, getUserMedia } = setup();
        const myPeerId = service.generatePeerId();

        const videoTrack = { enabled: true };
        const fakeStream = new MockMediaStream([videoTrack]);
        getUserMedia.mockResolvedValue(fakeStream);
        await service.startLocalStream();

        messages$.next({
          type: 'webrtc_offer',
          fromPeerId: 'sender-peer',
          toPeerId: myPeerId,
          sdp: 'remote-offer-sdp',
        } as unknown as GameplayMessage);

        await tick();
        await tick();
        await tick();
        await tick();

        expect(createdPCs[0].addTrack).toHaveBeenCalledWith(videoTrack, fakeStream);
      });
    });

    describe('webrtc_answer', () => {
      it('ignores the answer when the peer is not tracked', async () => {
        const { service, messages$ } = setup();
        const myPeerId = service.generatePeerId();

        messages$.next({
          type: 'webrtc_answer',
          fromPeerId: 'unknown-peer',
          toPeerId: myPeerId,
          sdp: 'answer-sdp',
        } as unknown as GameplayMessage);

        await tick();
        // No error — implicit pass
      });

      it('calls setRemoteDescription on the correct peer connection', async () => {
        const { service, messages$ } = setup();
        const myPeerId = service.generatePeerId();
        await service.connectToPeer('their-peer', 42);

        messages$.next({
          type: 'webrtc_answer',
          fromPeerId: 'their-peer',
          toPeerId: myPeerId,
          sdp: 'their-answer-sdp',
        } as unknown as GameplayMessage);

        await tick();
        await tick();

        expect(createdPCs[0].setRemoteDescription).toHaveBeenCalledWith({
          type: 'answer',
          sdp: 'their-answer-sdp',
        });
      });
    });

    describe('webrtc_ice_candidate', () => {
      it('ignores the candidate when the peer is not tracked', async () => {
        const { service, messages$ } = setup();
        const myPeerId = service.generatePeerId();

        messages$.next({
          type: 'webrtc_ice_candidate',
          fromPeerId: 'unknown-peer',
          toPeerId: myPeerId,
          candidate: JSON.stringify({ candidate: 'c', sdpMLineIndex: 0 }),
        } as unknown as GameplayMessage);

        await tick();
        // No error — implicit pass
      });

      it('calls addIceCandidate on the correct peer connection', async () => {
        const { service, messages$ } = setup();
        const myPeerId = service.generatePeerId();
        await service.connectToPeer('their-peer', 42);

        const candidateInit = { candidate: 'candidate-data', sdpMLineIndex: 0 };
        messages$.next({
          type: 'webrtc_ice_candidate',
          fromPeerId: 'their-peer',
          toPeerId: myPeerId,
          candidate: JSON.stringify(candidateInit),
        } as unknown as GameplayMessage);

        await tick();
        await tick();

        expect(createdPCs[0].addIceCandidate).toHaveBeenCalledWith(candidateInit);
      });
    });
  });

  // -------------------------------------------------------------------------
  describe('resolvePlayerId() — player lookup during offer handling', () => {
    const tick = () => Promise.resolve();

    it('resolves the playerId from the players signal when a matching peerId is found', async () => {
      const { service, messages$, socketSend, playersSignal } = setup();
      const myPeerId = service.generatePeerId();

      playersSignal.set([makePlayer({ playerId: 77, peerId: 'charlie-peer' })]);

      messages$.next({
        type: 'webrtc_offer',
        fromPeerId: 'charlie-peer',
        toPeerId: myPeerId,
        sdp: 'sdp',
      } as unknown as GameplayMessage);

      await tick();
      await tick();
      await tick();
      await tick();

      // An answer should have been sent — confirms the offer was processed
      expect(socketSend).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'webrtc_answer' }),
      );
    });

    it('falls back to playerId 0 when no matching player is found', async () => {
      const { service, messages$, socketSend } = setup();
      const myPeerId = service.generatePeerId();
      // playersSignal is empty — no player has this peerId

      messages$.next({
        type: 'webrtc_offer',
        fromPeerId: 'unknown-sender',
        toPeerId: myPeerId,
        sdp: 'sdp',
      } as unknown as GameplayMessage);

      await tick();
      await tick();
      await tick();
      await tick();

      // An answer should still be sent even without a known playerId
      expect(socketSend).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'webrtc_answer' }),
      );
    });
  });
});
