import { LAN_WS_PORT, RECONNECT_GRACE_MS } from './protocol.js';

const SESSION_KEY = 'sign-duo-lan-session';
const CONNECT_TIMEOUT_MS = 4000;
const FIND_TIMEOUT_MS = 6000;

function open(url) {
  return new Promise((resolve, reject) => {
    let socket;
    try { socket = new WebSocket(url); } catch (error) { reject(error); return; }
    const timer = setTimeout(() => { socket.close(); reject(new Error('timeout')); }, CONNECT_TIMEOUT_MS);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(socket); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('unreachable')); }, { once: true });
  });
}

const urlFor = (address, port = LAN_WS_PORT) => `ws://${address.includes(':') && !address.startsWith('[') ? `[${address}]` : address}:${port}`;

/**
 * Ask this device's LAN helper to find which host holds `code`.
 * Resolves { address, port }; rejects with Error('no_helper' | 'not_found').
 */
export async function findLobby(code) {
  let socket;
  try { socket = await open(urlFor('localhost')); } catch { throw new Error('no_helper'); }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('not_found')); }, FIND_TIMEOUT_MS);
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.type === 'found') { clearTimeout(timer); socket.close(); resolve({ address: message.address, port: message.port }); }
      if (message.type === 'error') { clearTimeout(timer); socket.close(); reject(new Error(message.error)); }
    });
    socket.send(JSON.stringify({ type: 'find', code }));
  });
}

/**
 * One device's connection to the host's LAN helper. Keeps a server clock
 * offset (for the shared countdown) and reconnects with its seat token if the
 * connection drops, for up to the helper's grace period.
 */
export class LanClient {
  constructor({ onState, onWelcome, onError, onClosed, onStatus }) {
    this.handlers = { onState, onWelcome, onError, onClosed, onStatus };
    this.socket = null; this.session = null; this.offset = 0; this.bestRtt = Infinity;
    this.leaving = false; this.pingTimer = null; this.reconnectTimer = null;
  }

  /** Server time now, estimated from ping round trips. */
  serverNow() { return Date.now() + this.offset; }

  status(value) { this.handlers.onStatus?.(value); }

  async connect(address, port, firstMessage) {
    this.leaving = false;
    const socket = await open(urlFor(address, port));
    this.attach(socket, address, port);
    socket.send(JSON.stringify(firstMessage));
  }

  create(name) { return this.connect('localhost', LAN_WS_PORT, { type: 'create', name }).catch(() => { throw new Error('no_helper'); }); }

  async join(code, name, manualAddress = '') {
    const target = manualAddress.trim() ? { address: manualAddress.trim(), port: LAN_WS_PORT } : await findLobby(code);
    try { await this.connect(target.address, target.port, { type: 'join', code, name }); }
    catch { throw new Error('unreachable'); }
  }

  /** Rejoin a lobby saved in this tab (after a page reload). */
  async resume() {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
    if (!saved) return false;
    this.resuming = true;
    try { await this.connect(saved.address, saved.port, { type: 'rejoin', code: saved.code, token: saved.token }); return true; }
    catch { sessionStorage.removeItem(SESSION_KEY); return false; }
  }

  attach(socket, address, port) {
    this.socket = socket;
    this.status('connected');
    socket.addEventListener('message', event => this.receive(JSON.parse(event.data), address, port));
    socket.addEventListener('close', () => this.dropped(socket));
    // Several quick pings early, then occasional ones: keep the lowest-latency estimate.
    let count = 0;
    clearInterval(this.pingTimer);
    const ping = () => { this.send({ type: 'ping', t: Date.now() }); if (++count === 5) { clearInterval(this.pingTimer); this.pingTimer = setInterval(ping, 10000); } };
    ping();
    this.pingTimer = setInterval(ping, 400);
  }

  receive(message, address, port) {
    switch (message.type) {
      case 'pong': {
        const rtt = Date.now() - message.t;
        if (rtt <= this.bestRtt * 1.5) {
          this.bestRtt = Math.min(this.bestRtt, rtt);
          this.offset = message.serverNow - (message.t + rtt / 2);
        }
        return;
      }
      case 'welcome':
        this.resuming = false;
        this.session = { address, port, code: message.code, token: message.token, playerId: message.playerId, host: message.host };
        try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(this.session)); } catch { /* storage unavailable */ }
        return this.handlers.onWelcome?.(this.session);
      case 'state': return this.handlers.onState?.(message);
      case 'error':
        if (['expired', 'not_found'].includes(message.error) && this.resuming) return this.giveUp('lobby_gone');
        if (['expired', 'not_found'].includes(message.error) && this.reconnecting) return this.giveUp('connection_lost');
        return this.handlers.onError?.(message.error);
      case 'closed': return this.giveUp(message.reason);
    }
  }

  send(message) {
    if (this.socket?.readyState === WebSocket.OPEN) { this.socket.send(JSON.stringify(message)); return true; }
    return false;
  }

  dropped(socket) {
    if (socket !== this.socket) return;
    clearInterval(this.pingTimer);
    if (this.leaving || !this.session) { this.status('closed'); return; }
    // "Connection lost. Attempting to reconnect..."
    this.reconnecting = true;
    this.status('reconnecting');
    const deadline = Date.now() + RECONNECT_GRACE_MS;
    const retry = async () => {
      if (this.leaving) return;
      if (Date.now() > deadline) return this.giveUp('connection_lost');
      try {
        await this.connect(this.session.address, this.session.port, { type: 'rejoin', code: this.session.code, token: this.session.token });
        this.reconnecting = false;
      } catch { this.reconnectTimer = setTimeout(retry, 1000); }
    };
    this.reconnectTimer = setTimeout(retry, 500);
  }

  giveUp(reason) {
    this.leaving = true; this.reconnecting = false;
    clearTimeout(this.reconnectTimer); clearInterval(this.pingTimer);
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* storage unavailable */ }
    this.socket?.close();
    this.status('closed');
    this.handlers.onClosed?.(reason);
  }

  leave() {
    this.send({ type: 'leave' });
    this.leaving = true;
    clearTimeout(this.reconnectTimer); clearInterval(this.pingTimer);
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* storage unavailable */ }
    this.socket?.close();
  }
}
