// LAN helper for Sign Duo multiplayer. Run on every device (`npm run lan`):
//  - On the host it runs the lobby and is the match authority, reusing the
//    same RaceEngine as Duo Mode (shared random sequence, scoring, skips,
//    duplicate and stale-event checks).
//  - On any device it answers browser "find lobby" requests by UDP broadcast,
//    since a web page cannot discover LAN devices itself.
// Browsers open the app on their own localhost (cameras need a secure page)
// and talk to a helper over WebSocket. No camera video leaves a device.
import { WebSocketServer } from 'ws';
import dgram from 'node:dgram';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { RaceEngine } from '../src/utils/raceEngine.js';
import { COMPETITION_POOLS } from '../src/recognition/config.js';
import {
  LAN_WS_PORT, LAN_DISCOVERY_PORT, LAN_DISCOVERY_MS, RECONNECT_GRACE_MS, START_COUNTDOWN_MS, MAX_MESSAGE_BYTES,
  makeInviteCode, cleanName, parseClientMessage, isLocalOrigin,
} from '../src/lan/protocol.js';

const DISCOVERY_FIND = 'signduo-find';
const DISCOVERY_HERE = 'signduo-here';
const OPEN = 1;

/** Non-internal IPv4 addresses of this machine, with their broadcast addresses. */
export function lanInterfaces() {
  const result = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      const ip = entry.address.split('.').map(Number), mask = entry.netmask.split('.').map(Number);
      result.push({ address: entry.address, broadcast: ip.map((part, i) => (part | (~mask[i] & 255))).join('.') });
    }
  }
  return result;
}

export function createLanRelay({
  port = LAN_WS_PORT, host = '0.0.0.0', discoveryPort = LAN_DISCOVERY_PORT, discoveryTargetPort = discoveryPort, graceMs = RECONNECT_GRACE_MS,
  countdownMs = START_COUNTDOWN_MS, cameraTimeoutMs = 20000, discoveryMs = LAN_DISCOVERY_MS,
  tickMs = 250, now = () => Date.now(), random = Math.random, log = () => {},
} = {}) {
  const lobbies = new Map();
  const wss = new WebSocketServer({ port, host, maxPayload: MAX_MESSAGE_BYTES, verifyClient: ({ origin }) => isLocalOrigin(origin) });
  const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });

  const boundPort = () => wss.address()?.port ?? port;
  const send = (socket, message) => { if (socket?.readyState === OPEN) socket.send(JSON.stringify(message)); };
  const sendError = (socket, error) => send(socket, { type: 'error', error });

  // ---- Lobby state -------------------------------------------------------

  function view(lobby) {
    const engine = lobby.engine;
    const results = engine?.status === 'finished' ? engine.getResults(engine.endedAt) : null;
    return {
      type: 'state', serverNow: now(), code: lobby.code, phase: lobby.phase, settings: lobby.settings,
      lanAddresses: lanInterfaces().map(i => i.address),
      players: lobby.players.map(p => ({ id: p.id, name: p.name, host: p.host, connected: p.connected,
        ready: p.ready, cameraReady: p.cameraReady, rematch: p.rematch })),
      match: engine ? {
        raceId: engine.id, startAt: lobby.startAt, endsAt: engine.startedAt === null ? null : engine.startedAt + engine.durationSeconds * 1000,
        snapshot: engine.getSnapshot(lobby.pausedAt ?? now()), results,
      } : null,
      pause: lobby.phase === 'paused' ? { waitingFor: lobby.players.filter(p => !p.connected).map(p => p.id), until: lobby.pauseUntil } : null,
    };
  }

  function broadcast(lobby) {
    const state = view(lobby);
    for (const player of lobby.players) send(player.socket, state);
  }

  function clearTimers(lobby) {
    clearInterval(lobby.tickTimer); clearTimeout(lobby.countdownTimer); clearTimeout(lobby.prepTimer);
    lobby.tickTimer = lobby.countdownTimer = lobby.prepTimer = null;
  }

  function closeLobby(lobby, reason) {
    clearTimers(lobby);
    for (const player of lobby.players) {
      clearTimeout(player.graceTimer);
      send(player.socket, { type: 'closed', reason });
      player.socket?.close();
    }
    lobbies.delete(lobby.code);
    log(`lobby ${lobby.code} closed (${reason})`);
  }

  function backToLobby(lobby, error = null) {
    clearTimers(lobby);
    lobby.phase = 'lobby'; lobby.engine = null; lobby.startAt = null; lobby.pausedAt = null;
    for (const player of lobby.players) { player.ready = false; player.cameraReady = false; player.rematch = false; }
    if (error) for (const player of lobby.players) sendError(player.socket, error);
    broadcast(lobby);
  }

  // ---- Match flow --------------------------------------------------------

  function prepareMatch(lobby) {
    clearTimers(lobby);
    lobby.phase = 'preparing'; lobby.engine = null; lobby.startAt = null; lobby.pausedAt = null;
    for (const player of lobby.players) { player.cameraReady = false; player.rematch = false; }
    // Each device mounts its game camera and reports when recognition is ready.
    lobby.prepTimer = setTimeout(() => backToLobby(lobby, 'camera'), cameraTimeoutMs);
    broadcast(lobby);
  }

  function beginCountdown(lobby) {
    clearTimeout(lobby.prepTimer);
    const engine = new RaceEngine({ mode: 'versus', durationSeconds: lobby.settings.durationSeconds,
      pool: COMPETITION_POOLS[lobby.settings.vocabulary], clock: now, random });
    for (const player of lobby.players) engine.addPlayer(player.id, player.name);
    lobby.engine = engine;
    lobby.phase = 'countdown';
    lobby.startAt = now() + countdownMs;
    lobby.countdownTimer = setTimeout(() => {
      engine.start(lobby.startAt);
      lobby.phase = 'playing';
      startTicking(lobby);
      broadcast(lobby);
    }, Math.max(0, lobby.startAt - now()));
    broadcast(lobby);
  }

  function startTicking(lobby) {
    clearInterval(lobby.tickTimer);
    lobby.tickTimer = setInterval(() => tick(lobby), tickMs);
  }

  function tick(lobby) {
    if (lobby.phase !== 'playing') return;
    lobby.engine.updateTime(now());
    if (lobby.engine.status === 'finished') finishMatch(lobby);
    else broadcast(lobby);
  }

  function finishMatch(lobby) {
    clearTimers(lobby);
    lobby.phase = 'results';
    for (const player of lobby.players) player.rematch = false;
    broadcast(lobby);
  }

  function pauseMatch(lobby) {
    if (lobby.phase !== 'playing') return;
    clearInterval(lobby.tickTimer); lobby.tickTimer = null;
    lobby.engine.updateTime(now());
    if (lobby.engine.status === 'finished') { finishMatch(lobby); return; }
    lobby.phase = 'paused';
    lobby.pausedAt = now();
    lobby.pauseUntil = now() + graceMs;
  }

  function resumeMatch(lobby) {
    if (lobby.phase !== 'paused' || lobby.players.some(p => !p.connected)) return;
    // The paused time does not count: move the match start forward by it.
    lobby.engine.startedAt += now() - lobby.pausedAt;
    lobby.pausedAt = null; lobby.pauseUntil = null;
    lobby.phase = 'playing';
    startTicking(lobby);
  }

  function forfeit(lobby, winner, reason) {
    clearTimers(lobby);
    const engine = lobby.engine;
    const endAt = lobby.pausedAt ?? now();
    if (engine.status === 'running') engine.end(endAt, reason);
    engine.winnerId = winner.id; engine.winReason = reason;
    lobby.pausedAt = null;
    lobby.phase = 'results';
    for (const player of lobby.players) player.rematch = false;
  }

  // ---- Players -----------------------------------------------------------

  function attach(lobby, player, socket) {
    if (player.socket && player.socket !== socket) player.socket.close();
    clearTimeout(player.graceTimer); player.graceTimer = null;
    player.socket = socket; player.connected = true;
    socket.lan = { lobby, player };
    send(socket, { type: 'welcome', code: lobby.code, playerId: player.id, token: player.token, host: player.host });
  }

  function removeGuest(lobby, guest, reason) {
    clearTimeout(guest.graceTimer);
    if (['playing', 'paused', 'countdown', 'preparing'].includes(lobby.phase) && lobby.engine) {
      forfeit(lobby, lobby.players.find(p => p !== guest), reason);
    } else if (lobby.phase !== 'results') {
      clearTimers(lobby);
      lobby.phase = 'lobby'; lobby.engine = null;
    }
    lobby.players = lobby.players.filter(p => p !== guest);
    for (const player of lobby.players) { player.ready = false; player.cameraReady = false; player.rematch = false; }
    if (lobby.phase !== 'results') lobby.phase = 'lobby';
    send(guest.socket, { type: 'closed', reason: 'left' });
    broadcast(lobby);
  }

  function disconnected(socket) {
    const { lobby, player } = socket.lan ?? {};
    if (!lobby || player.socket !== socket || !lobbies.has(lobby.code)) return;
    player.connected = false; player.socket = null;
    if (lobby.phase === 'playing') pauseMatch(lobby);
    else if (lobby.phase === 'preparing' || lobby.phase === 'countdown') backToLobby(lobby);
    player.graceTimer = setTimeout(() => {
      if (player.connected || !lobbies.has(lobby.code)) return;
      if (player.host) closeLobby(lobby, 'host_left');
      else removeGuest(lobby, player, 'opponent_left');
    }, graceMs);
    broadcast(lobby);
  }

  // ---- Messages ----------------------------------------------------------

  function handle(socket, message) {
    const { lobby, player } = socket.lan ?? {};
    switch (message.type) {
      case 'ping': return send(socket, { type: 'pong', t: message.t, serverNow: now() });
      case 'find': return discover(message.code).then(found => send(socket, found
        ? { type: 'found', code: message.code, address: found.address, port: found.port }
        : { type: 'error', error: 'not_found' }));
      case 'create': {
        if (lobby) return sendError(socket, 'bad_message');
        let code; do code = makeInviteCode(random); while (lobbies.has(code));
        const created = { code, phase: 'lobby', settings: { durationSeconds: 60, vocabulary: 'alphabet' }, players: [], engine: null };
        const hostPlayer = { id: 'p1', name: cleanName(message.name, 'Player 1'), token: randomBytes(16).toString('hex'), host: true,
          connected: true, ready: false, cameraReady: false, rematch: false };
        created.players.push(hostPlayer);
        lobbies.set(code, created);
        attach(created, hostPlayer, socket);
        log(`lobby ${code} created`);
        return broadcast(created);
      }
      case 'join': {
        if (lobby) return sendError(socket, 'bad_message');
        const target = lobbies.get(message.code);
        if (!target) return sendError(socket, 'not_found');
        if (target.players.length >= 2) return sendError(socket, 'full');
        if (target.phase !== 'lobby') return sendError(socket, 'in_progress');
        const guest = { id: 'p2', name: cleanName(message.name, 'Player 2'), token: randomBytes(16).toString('hex'), host: false,
          connected: true, ready: false, cameraReady: false, rematch: false };
        target.players.push(guest);
        attach(target, guest, socket);
        return broadcast(target);
      }
      case 'rejoin': {
        const target = lobbies.get(message.code);
        const returning = target?.players.find(p => p.token === message.token);
        if (!returning) return sendError(socket, target ? 'expired' : 'not_found');
        attach(target, returning, socket);
        resumeMatch(target);
        return broadcast(target);
      }
    }
    if (!lobby) return sendError(socket, 'bad_message');
    switch (message.type) {
      case 'name':
        player.name = cleanName(message.name, player.name);
        return broadcast(lobby);
      case 'ready':
        if (lobby.phase !== 'lobby') return;
        player.ready = message.ready;
        return broadcast(lobby);
      case 'settings':
        if (!player.host) return sendError(socket, 'not_host');
        if (lobby.phase !== 'lobby') return;
        lobby.settings = { durationSeconds: message.durationSeconds, vocabulary: message.vocabulary };
        return broadcast(lobby);
      case 'start':
        if (!player.host) return sendError(socket, 'not_host');
        if (lobby.phase !== 'lobby') return;
        if (lobby.players.length !== 2 || lobby.players.some(p => !p.connected || !p.ready)) return sendError(socket, 'not_ready');
        return prepareMatch(lobby);
      case 'cameraReady':
        if (lobby.phase !== 'preparing') return;
        player.cameraReady = message.ready;
        if (lobby.players.length === 2 && lobby.players.every(p => p.connected && p.cameraReady)) return beginCountdown(lobby);
        return broadcast(lobby);
      case 'sign': {
        if (lobby.phase !== 'playing') return;
        const outcome = lobby.engine.submitRecognition(player.id,
          { status: 'stable', isNew: true, letter: message.letter, eventId: message.eventId, challengeId: message.challengeId }, now());
        if (lobby.engine.status === 'finished') return finishMatch(lobby);
        if (outcome.accepted) broadcast(lobby);
        return;
      }
      case 'skip': {
        if (lobby.phase !== 'playing') return;
        const outcome = lobby.engine.skip(player.id, message.challengeId, now());
        if (lobby.engine.status === 'finished') return finishMatch(lobby);
        if (outcome.accepted) broadcast(lobby);
        return;
      }
      case 'rematch':
        if (lobby.phase !== 'results') return;
        player.rematch = true;
        if (lobby.players.length === 2 && lobby.players.every(p => p.connected && p.rematch)) return prepareMatch(lobby);
        return broadcast(lobby);
      case 'toLobby':
        if (lobby.phase !== 'results') return;
        return backToLobby(lobby);
      case 'leave':
        socket.lan = null;
        if (player.host) return closeLobby(lobby, 'host_left');
        return removeGuest(lobby, player, 'opponent_left');
    }
  }

  wss.on('connection', socket => {
    socket.on('message', (data, isBinary) => {
      if (isBinary) return sendError(socket, 'bad_message');
      const parsed = parseClientMessage(data.toString());
      if (!parsed.ok) return sendError(socket, parsed.error);
      try { handle(socket, parsed.message); } catch (error) { log(`error: ${error.message}`); sendError(socket, 'bad_message'); }
    });
    socket.on('close', () => disconnected(socket));
    socket.on('error', () => {});
  });

  // ---- Discovery ---------------------------------------------------------

  udp.on('message', (buffer, remote) => {
    let message;
    try { message = JSON.parse(buffer.toString()); } catch { return; }
    if (message?.t !== DISCOVERY_FIND || typeof message.code !== 'string' || typeof message.nonce !== 'string') return;
    if (!lobbies.has(message.code)) return;
    const reply = Buffer.from(JSON.stringify({ t: DISCOVERY_HERE, code: message.code, nonce: message.nonce, port: boundPort() }));
    udp.send(reply, remote.port, remote.address);
  });
  udp.on('error', error => log(`discovery error: ${error.message}`));

  /** Ask the LAN (and this machine) which helper hosts `code`. */
  function discover(code) {
    // A lobby hosted by this helper needs no broadcast.
    if (lobbies.has(code)) return Promise.resolve({ address: '127.0.0.1', port: boundPort() });
    return new Promise(resolve => {
      const socket = dgram.createSocket('udp4');
      const nonce = randomBytes(8).toString('hex');
      const done = result => { clearTimeout(timer); try { socket.close(); } catch { /* already closed */ } resolve(result); };
      const timer = setTimeout(() => done(null), discoveryMs);
      socket.on('message', (buffer, remote) => {
        let message;
        try { message = JSON.parse(buffer.toString()); } catch { return; }
        if (message?.t === DISCOVERY_HERE && message.nonce === nonce && message.code === code && Number.isInteger(message.port)) {
          // A host on this same machine is reached over loopback.
          const own = lanInterfaces().some(i => i.address === remote.address);
          done({ address: own ? '127.0.0.1' : remote.address, port: message.port });
        }
      });
      socket.on('error', () => done(null));
      socket.bind(0, () => {
        socket.setBroadcast(true);
        const payload = Buffer.from(JSON.stringify({ t: DISCOVERY_FIND, code, nonce }));
        const targets = new Set(['255.255.255.255', '127.0.0.1', ...lanInterfaces().map(i => i.broadcast)]);
        for (const target of targets) socket.send(payload, discoveryTargetPort, target, () => {});
      });
    });
  }

  const ready = Promise.all([
    new Promise((resolve, reject) => { wss.once('listening', resolve); wss.once('error', reject); }),
    new Promise((resolve, reject) => {
      udp.once('error', reject);
      // Loopback-only helpers (testing on one machine) also keep discovery on loopback.
      udp.bind({ port: discoveryPort, address: host === '0.0.0.0' ? undefined : host }, () => { udp.setBroadcast(true); resolve(); });
    }),
  ]);

  return {
    ready, lobbies, discover,
    get port() { return boundPort(); },
    get discoveryPort() { return udp.address().port; },
    async close() {
      for (const lobby of [...lobbies.values()]) closeLobby(lobby, 'host_left');
      // ws v8 waits for open sockets to end on their own; end them now.
      for (const client of wss.clients) client.terminate();
      await new Promise(resolve => wss.close(() => resolve()));
      await new Promise(resolve => { try { udp.close(resolve); } catch { resolve(); } });
    },
  };
}
