import { Injectable, inject, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import type { GameplayMessage } from '@extriviate/shared';
import { GameSocketService } from './game-socket.service';
import { GameStateService } from './game-state.service';

interface PeerConnection {
  connection: RTCPeerConnection;
  remoteStream: MediaStream;
  playerId: number;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

@Injectable({ providedIn: 'root' })
export class WebRtcService {
  private readonly socketService = inject(GameSocketService);
  private readonly gameState = inject(GameStateService);
  private readonly destroyRef = inject(DestroyRef);

  /** This client's random peer ID, generated once per session. */
  private _peerId: string | null = null;

  /** Map of remotePeerId → PeerConnection */
  private peers = new Map<string, PeerConnection>();

  /** Local media stream (camera + mic) */
  private localStream: MediaStream | null = null;

  readonly localStream$ = signal<MediaStream | null>(null);
  readonly remoteStreams = signal<Map<string, MediaStream>>(new Map());
  readonly cameraActive = signal(false);
  readonly audioMuted = signal(true);

  get peerId(): string | null {
    return this._peerId;
  }

  constructor() {
    this.socketService.messages$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        filter(
          (m): m is Extract<GameplayMessage, { type: `webrtc_${string}` }> =>
            m.type === 'webrtc_offer' ||
            m.type === 'webrtc_answer' ||
            m.type === 'webrtc_ice_candidate',
        ),
      )
      .subscribe((msg) => this.handleSignalingMessage(msg));
  }

  /** Generate a new peer ID for this session. Call once when joining. */
  generatePeerId(): string {
    this._peerId = crypto.randomUUID();
    return this._peerId;
  }

  /** Acquire local media and start offering to all existing peers. */
  async startLocalStream(video = true, audio = true): Promise<MediaStream | null> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ video, audio });
      this.localStream$.set(this.localStream);
      this.cameraActive.set(video);
      this.audioMuted.set(!audio);
      return this.localStream;
    } catch {
      // User denied or no device available
      return null;
    }
  }

  /** Toggle camera on/off without tearing down connections. */
  toggleCamera(): void {
    if (!this.localStream) return;
    const videoTracks = this.localStream.getVideoTracks();
    const enabled = !this.cameraActive();
    for (const track of videoTracks) {
      track.enabled = enabled;
    }
    this.cameraActive.set(enabled);
  }

  /** Toggle mic mute/unmute without tearing down connections. */
  toggleAudio(): void {
    if (!this.localStream) return;
    const audioTracks = this.localStream.getAudioTracks();
    const muted = !this.audioMuted();
    for (const track of audioTracks) {
      track.enabled = !muted;
    }
    this.audioMuted.set(muted);
  }

  /**
   * Initiate a peer connection to a remote player.
   * Creates an offer and sends it via the signaling server.
   */
  async connectToPeer(remotePeerId: string, remotePlayerId: number): Promise<void> {
    if (!this._peerId || this.peers.has(remotePeerId)) return;

    const pc = this.createPeerConnection(remotePeerId, remotePlayerId);

    // Add local tracks before creating offer
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.connection.addTrack(track, this.localStream);
      }
    }

    const offer = await pc.connection.createOffer();
    await pc.connection.setLocalDescription(offer);

    this.socketService.send({
      type: 'webrtc_offer',
      fromPeerId: this._peerId,
      toPeerId: remotePeerId,
      sdp: offer.sdp!,
    });
  }

  /** Connect to all current players that have a peerId. */
  async connectToAllPeers(): Promise<void> {
    const players = this.gameState.players();
    for (const player of players) {
      if (player.peerId && player.peerId !== this._peerId) {
        await this.connectToPeer(player.peerId, player.playerId);
      }
    }
  }

  /** Disconnect from a specific peer. */
  disconnectPeer(remotePeerId: string): void {
    const peer = this.peers.get(remotePeerId);
    if (!peer) return;
    peer.connection.close();
    this.peers.delete(remotePeerId);
    this.emitRemoteStreams();
  }

  /** Tear down all connections and release local media. */
  destroy(): void {
    for (const [peerId] of this.peers) {
      this.disconnectPeer(peerId);
    }
    this.peers.clear();

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
      this.localStream$.set(null);
    }

    this._peerId = null;
    this.cameraActive.set(false);
    this.audioMuted.set(true);
    this.emitRemoteStreams();
  }

  // ---- Private ----

  private createPeerConnection(remotePeerId: string, remotePlayerId: number): PeerConnection {
    const connection = new RTCPeerConnection(RTC_CONFIG);
    const remoteStream = new MediaStream();

    const peer: PeerConnection = { connection, remoteStream, playerId: remotePlayerId };
    this.peers.set(remotePeerId, peer);

    connection.onicecandidate = (event) => {
      if (event.candidate && this._peerId) {
        this.socketService.send({
          type: 'webrtc_ice_candidate',
          fromPeerId: this._peerId,
          toPeerId: remotePeerId,
          candidate: JSON.stringify(event.candidate),
        });
      }
    };

    connection.ontrack = (event) => {
      for (const stream of event.streams) {
        for (const track of stream.getTracks()) {
          remoteStream.addTrack(track);
        }
      }
      this.emitRemoteStreams();
    };

    connection.onconnectionstatechange = () => {
      if (
        connection.connectionState === 'disconnected' ||
        connection.connectionState === 'failed' ||
        connection.connectionState === 'closed'
      ) {
        this.peers.delete(remotePeerId);
        this.emitRemoteStreams();
      }
    };

    return peer;
  }

  private async handleSignalingMessage(
    msg: Extract<GameplayMessage, { type: `webrtc_${string}` }>,
  ): Promise<void> {
    if (!this._peerId || msg.toPeerId !== this._peerId) return;

    switch (msg.type) {
      case 'webrtc_offer': {
        await this.handleOffer(msg.fromPeerId, msg.sdp);
        break;
      }
      case 'webrtc_answer': {
        await this.handleAnswer(msg.fromPeerId, msg.sdp);
        break;
      }
      case 'webrtc_ice_candidate': {
        await this.handleIceCandidate(msg.fromPeerId, msg.candidate);
        break;
      }
    }
  }

  private async handleOffer(fromPeerId: string, sdp: string): Promise<void> {
    // Resolve the playerId for this peer
    const remotePlayerId = this.resolvePlayerId(fromPeerId);

    let peer = this.peers.get(fromPeerId);
    if (!peer) {
      peer = this.createPeerConnection(fromPeerId, remotePlayerId);
    }

    // Add local tracks before answering
    if (this.localStream) {
      const senders = peer.connection.getSenders();
      if (senders.length === 0) {
        for (const track of this.localStream.getTracks()) {
          peer.connection.addTrack(track, this.localStream);
        }
      }
    }

    await peer.connection.setRemoteDescription({ type: 'offer', sdp });
    const answer = await peer.connection.createAnswer();
    await peer.connection.setLocalDescription(answer);

    this.socketService.send({
      type: 'webrtc_answer',
      fromPeerId: this._peerId!,
      toPeerId: fromPeerId,
      sdp: answer.sdp!,
    });
  }

  private async handleAnswer(fromPeerId: string, sdp: string): Promise<void> {
    const peer = this.peers.get(fromPeerId);
    if (!peer) return;
    await peer.connection.setRemoteDescription({ type: 'answer', sdp });
  }

  private async handleIceCandidate(fromPeerId: string, candidateJson: string): Promise<void> {
    const peer = this.peers.get(fromPeerId);
    if (!peer) return;
    const candidate = JSON.parse(candidateJson) as RTCIceCandidateInit;
    await peer.connection.addIceCandidate(candidate);
  }

  private resolvePlayerId(peerId: string): number {
    const players = this.gameState.players();
    const player = players.find((p) => p.peerId === peerId);
    return player?.playerId ?? 0;
  }

  private emitRemoteStreams(): void {
    const streams = new Map<string, MediaStream>();
    for (const [peerId, peer] of this.peers) {
      if (peer.remoteStream.getTracks().length > 0) {
        streams.set(peerId, peer.remoteStream);
      }
    }
    this.remoteStreams.set(streams);
  }
}
