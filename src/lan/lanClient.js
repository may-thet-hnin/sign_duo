import { Peer } from 'peerjs';
import { createLanHost } from './lanHost.js';
import { PEER_ID_PREFIX, CONNECT_TIMEOUT_MS, HEARTBEAT_MS, LINK_TIMEOUT_MS, RECONNECT_GRACE_MS, makeInviteCode } from './protocol.js';

const SESSION_KEY = 'sign-duo-lan-session';

/** Register with the PeerJS signaling server (as `id`, or a random id). */
function openPeer(id) {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
    const timer = setTimeout(() => { peer.destroy(); reject(new Error('signaling')); }, CONNECT_TIMEOUT_MS);
    peer.once('open', () => { clearTimeout(timer); resolve(peer); });
    peer.once('error', error => { clearTimeout(timer); peer.destroy(); reject(new Error(error.type === 'unavailable-id' ? 'taken' : 'signaling')); });
  });
}

/** Open a WebRTC data channel to the host of `code`. */
function connectTo(peer, code) {
  return new Promise((resolve, reject) => {
    const connection = peer.connect(PEER_ID_PREFIX + code, { reliable: true, serialization: 'raw' });
    const finish = (error, value) => { clearTimeout(timer); peer.off('error', onPeerError); error ? reject(error) : resolve(value); };
    // The signaling server reports an unknown id; that means no such lobby.
    const onPeerError = error => { connection.close(); finish(new Error(error.type === 'peer-unavailable' ? 'not_found' : 'signaling')); };
    const timer = setTimeout(() => { connection.close(); finish(new Error('unreachable')); }, CONNECT_TIMEOUT_MS);
    peer.on('error', onPeerError);
    connection.once('open', () => finish(null, connection));
    connection.once('error', () => finish(new Error('unreachable')));
  });
}

/**
 * One player's link to the match. The host's client runs the match authority
 * (lanHost.js) in this page and accepts the guest over WebRTC; the guest's
 * client connects to it. Both keep a server clock offset for the shared
 * countdown, and the guest reconnects with its seat token if the link drops.
 */
export class LanClient {
  constructor({ onState, onWelcome, onError, onClosed, onStatus, onRemoteStream }) {
    this.handlers = { onState, onWelcome, onError, onClosed, onStatus, onRemoteStream };
    this.peer = null; this.host = null; this.local = null; this.connection = null;
    this.session = null; this.offset = 0; this.bestRtt = Infinity;
    this.leaving = false; this.reconnecting = false; this.resuming = false;
    this.heartbeat = null; this.reconnectTimer = null;
    // Camera video: each side sends its own camera as a one-way call to
    // `mediaPeer` (the host, or the seated guest) and answers the other's.
    this.localStream = null; this.mediaPeer = null; this.mediaConnection = null; this.outCall = null; this.inCall = null;
  }

  /** Match time now, on the host's clock. */
  serverNow() { return Date.now() + this.offset; }

  status(value) { this.handlers.onStatus?.(value); }

  // ---- Camera video -------------------------------------------------------

  /** Share this player's camera with the opponent (null stops sharing). */
  setLocalStream(stream) {
    if (stream === this.localStream) return;
    this.localStream = stream;
    this.callOpponent();
  }

  callOpponent() {
    this.outCall?.close(); this.outCall = null;
    if (!this.localStream || !this.mediaPeer || !this.peer || this.peer.destroyed || this.leaving) return;
    this.outCall = this.peer.call(this.mediaPeer, this.localStream);
  }

  listenForCalls(peer) {
    peer.on('call', call => {
      // Only the opponent's camera is accepted; anyone else holding the code is refused.
      if (!this.mediaPeer || call.peer !== this.mediaPeer) { call.close(); return; }
      this.inCall?.close();
      this.inCall = call;
      call.on('stream', stream => { if (this.inCall === call) this.handlers.onRemoteStream?.(stream); });
      call.on('close', () => { if (this.inCall === call) { this.inCall = null; this.handlers.onRemoteStream?.(null); } });
      call.answer();
    });
  }

  stopMedia() {
    this.mediaPeer = null; this.mediaConnection = null;
    this.outCall?.close(); this.outCall = null;
    this.inCall?.close(); this.inCall = null;
    this.handlers.onRemoteStream?.(null);
  }

  // ---- Host ---------------------------------------------------------------

  async create(name) {
    // Register an unused invite code as this device's peer id.
    let peer = null, code = null;
    for (let attempt = 0; attempt < 4 && !peer; attempt++) {
      code = makeInviteCode();
      try { peer = await openPeer(PEER_ID_PREFIX + code); }
      catch (error) { if (error.message !== 'taken') throw error; }
    }
    if (!peer) throw new Error('signaling');
    this.peer = peer; this.leaving = false;
    this.listenForCalls(peer);
    this.host = createLanHost();
    // Keep the code registered if the signaling connection blips; open data channels are unaffected.
    peer.on('disconnected', () => { if (!peer.destroyed && !this.leaving) peer.reconnect(); });
    peer.on('connection', connection => connection.once('open', () => this.acceptGuest(connection)));
    const link = this.host.accept({ send: message => queueMicrotask(() => this.receive(message)), close() {} }, { local: true });
    this.local = { send: message => link.receive(JSON.stringify(message)) };
    this.unload = () => this.leave();
    window.addEventListener('pagehide', this.unload);
    this.status('connected');
    this.send({ type: 'create', name, code });
  }

  acceptGuest(connection) {
    let lastHeard = Date.now(), gone = false;
    const link = this.host.accept({
      send: message => {
        // A welcome seats this connection as the guest: exchange camera video with it.
        if (message.type === 'welcome') { this.mediaPeer = connection.peer; this.mediaConnection = connection; this.callOpponent(); }
        if (connection.open) connection.send(JSON.stringify(message));
      },
      close: () => connection.close(),
    });
    connection.on('data', data => { lastHeard = Date.now(); if (typeof data === 'string') link.receive(data); });
    // The guest pings every HEARTBEAT_MS; silence means the link is gone even if WebRTC has not noticed yet.
    const watchdog = setInterval(() => { if (Date.now() - lastHeard > LINK_TIMEOUT_MS) connection.close(); }, HEARTBEAT_MS);
    const done = () => {
      if (gone) return;
      gone = true; clearInterval(watchdog); link.closed();
      if (this.mediaConnection === connection) this.stopMedia();
    };
    connection.on('close', done);
    connection.on('error', done);
  }

  // ---- Guest --------------------------------------------------------------

  async join(code, name) {
    this.leaving = false;
    this.peer = await openPeer();
    this.listenForCalls(this.peer);
    try { this.attachGuest(await connectTo(this.peer, code)); }
    catch (error) { this.peer.destroy(); this.peer = null; throw error; }
    this.send({ type: 'join', code, name });
  }

  /** Rejoin the lobby saved in this tab after a reload (guests only). */
  async resume() {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null'); } catch { /* storage unavailable */ }
    if (!saved) return false;
    this.resuming = true; this.leaving = false;
    try {
      this.peer = await openPeer();
      this.listenForCalls(this.peer);
      this.session = saved;
      this.attachGuest(await connectTo(this.peer, saved.code));
      this.send({ type: 'rejoin', code: saved.code, token: saved.token });
      return true;
    } catch {
      this.resuming = false;
      this.peer?.destroy(); this.peer = null;
      try { sessionStorage.removeItem(SESSION_KEY); } catch { /* storage unavailable */ }
      return false;
    }
  }

  attachGuest(connection) {
    this.connection = connection;
    this.status('connected');
    let lastHeard = Date.now();
    connection.on('data', data => {
      lastHeard = Date.now();
      try { this.receive(JSON.parse(data)); } catch { /* ignore malformed data */ }
    });
    connection.on('close', () => this.dropped(connection));
    clearInterval(this.heartbeat);
    // Heartbeat pings double as clock-sync samples.
    const beat = () => {
      if (Date.now() - lastHeard > LINK_TIMEOUT_MS) { connection.close(); return; }
      this.send({ type: 'ping', t: Date.now() });
    };
    beat();
    this.heartbeat = setInterval(beat, HEARTBEAT_MS);
  }

  dropped(connection) {
    if (connection !== this.connection) return;
    clearInterval(this.heartbeat);
    if (this.leaving || !this.session) { this.status('closed'); return; }
    // "Connection lost. Attempting to reconnect..."
    this.reconnecting = true;
    this.status('reconnecting');
    const deadline = Date.now() + RECONNECT_GRACE_MS;
    const retry = async () => {
      if (this.leaving) return;
      if (Date.now() > deadline) return this.giveUp('connection_lost');
      try {
        if (!this.peer || this.peer.destroyed) { this.peer = await openPeer(); this.listenForCalls(this.peer); }
        this.attachGuest(await connectTo(this.peer, this.session.code));
        this.send({ type: 'rejoin', code: this.session.code, token: this.session.token });
      } catch (error) {
        // The host's code is gone from the signaling server: the host closed the page.
        if (error.message === 'not_found') return this.giveUp('host_left');
        this.reconnectTimer = setTimeout(retry, 1000);
      }
    };
    this.reconnectTimer = setTimeout(retry, 300);
  }

  // ---- Both ---------------------------------------------------------------

  receive(message) {
    switch (message?.type) {
      case 'pong': {
        const rtt = Date.now() - message.t;
        if (rtt <= this.bestRtt * 1.5) {
          this.bestRtt = Math.min(this.bestRtt, rtt);
          this.offset = message.serverNow - (message.t + rtt / 2);
        }
        return;
      }
      case 'welcome':
        this.resuming = false; this.reconnecting = false;
        this.session = { code: message.code, token: message.token, playerId: message.playerId, host: message.host };
        // Only a guest can come back after a reload; the host's page holds the match.
        try { if (!message.host) sessionStorage.setItem(SESSION_KEY, JSON.stringify(this.session)); } catch { /* storage unavailable */ }
        this.status('connected');
        if (!message.host) { this.mediaPeer = PEER_ID_PREFIX + message.code; this.callOpponent(); }
        return this.handlers.onWelcome?.(this.session);
      case 'state': return this.handlers.onState?.(message);
      case 'error':
        if (['expired', 'not_found'].includes(message.error) && this.resuming) return this.giveUp('lobby_gone');
        if (['expired', 'not_found'].includes(message.error) && this.reconnecting) return this.giveUp('connection_lost');
        return this.handlers.onError?.(message.error);
      case 'closed':
        if (this.leaving) return;
        return this.giveUp(message.reason);
    }
  }

  send(message) {
    if (this.local) { this.local.send(message); return true; }
    if (this.connection?.open) { this.connection.send(JSON.stringify(message)); return true; }
    return false;
  }

  shutdown() {
    clearTimeout(this.reconnectTimer); clearInterval(this.heartbeat);
    if (this.unload) window.removeEventListener('pagehide', this.unload);
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* storage unavailable */ }
    const peer = this.peer;
    this.stopMedia();
    this.connection?.close();
    // Give the final "closed" message a moment to reach the other device.
    setTimeout(() => peer?.destroy(), 300);
  }

  giveUp(reason) {
    if (this.leaving) return;
    this.leaving = true; this.reconnecting = false;
    this.host?.close();
    this.shutdown();
    this.status('closed');
    this.handlers.onClosed?.(reason);
  }

  leave() {
    if (this.leaving) return;
    this.send({ type: 'leave' });
    this.leaving = true;
    this.host?.close();
    this.shutdown();
  }
}
