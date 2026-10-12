// The LAN match authority. It runs in the host player's browser and owns the
// lobby and match, reusing the same RaceEngine as Duo Mode (shared random
// sequence, scoring, skips, duplicate and stale-event checks). It does not know
// how messages travel: each player is a "connection" with send() and close(),
// over WebRTC for the guest and in-page for the host's own screen.
import { RaceEngine } from '../utils/raceEngine.js';
import { COMPETITION_POOLS } from '../recognition/config.js';
import { RECONNECT_GRACE_MS, START_COUNTDOWN_MS, CODE_PATTERN, makeInviteCode, cleanName, parseClientMessage } from './protocol.js';

const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');

export function createLanHost({
  graceMs = RECONNECT_GRACE_MS, countdownMs = START_COUNTDOWN_MS, cameraTimeoutMs = 20000,
  tickMs = 250, now = () => Date.now(), random = Math.random, log = () => {},
} = {}) {
  const lobbies = new Map();
  const send = (connection, message) => connection?.send(message);
  const sendError = (connection, error) => send(connection, { type: 'error', error });

  // ---- Lobby state -------------------------------------------------------

  function view(lobby) {
    const engine = lobby.engine;
    const results = engine?.status === 'finished' ? engine.getResults(engine.endedAt) : null;
    return {
      type: 'state', serverNow: now(), code: lobby.code, phase: lobby.phase, settings: lobby.settings,
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
    for (const player of lobby.players) send(player.connection, state);
  }

  function clearTimers(lobby) {
    clearInterval(lobby.tickTimer); clearTimeout(lobby.countdownTimer); clearTimeout(lobby.prepTimer);
    lobby.tickTimer = lobby.countdownTimer = lobby.prepTimer = null;
  }

  function closeLobby(lobby, reason) {
    clearTimers(lobby);
    for (const player of lobby.players) {
      clearTimeout(player.graceTimer);
      const connection = player.connection;
      player.connection = null;
      send(connection, { type: 'closed', reason });
      connection?.close();
    }
    lobbies.delete(lobby.code);
    log(`lobby ${lobby.code} closed (${reason})`);
  }

  function backToLobby(lobby, error = null) {
    clearTimers(lobby);
    lobby.phase = 'lobby'; lobby.engine = null; lobby.startAt = null; lobby.pausedAt = null;
    for (const player of lobby.players) { player.ready = false; player.cameraReady = false; player.rematch = false; }
    if (error) for (const player of lobby.players) sendError(player.connection, error);
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

  function attach(lobby, player, connection) {
    if (player.connection && player.connection !== connection) player.connection.close();
    clearTimeout(player.graceTimer); player.graceTimer = null;
    player.connection = connection; player.connected = true;
    connection.lan = { lobby, player };
    send(connection, { type: 'welcome', code: lobby.code, playerId: player.id, token: player.token, host: player.host });
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
    send(guest.connection, { type: 'closed', reason: 'left' });
    broadcast(lobby);
  }

  function disconnected(connection) {
    const { lobby, player } = connection.lan ?? {};
    if (!lobby || player.connection !== connection || !lobbies.has(lobby.code)) return;
    player.connected = false; player.connection = null;
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

  function handle(connection, message) {
    const { lobby, player } = connection.lan ?? {};
    switch (message.type) {
      case 'ping': return send(connection, { type: 'pong', t: message.t, serverNow: now() });
      case 'create': {
        // Only the host's own screen creates a lobby; remote players can only join.
        if (lobby || !connection.local) return sendError(connection, 'bad_message');
        let code = message.code;
        if (!code || lobbies.has(code)) do code = makeInviteCode(random); while (lobbies.has(code));
        const created = { code, phase: 'lobby', settings: { durationSeconds: 60, vocabulary: 'alphabet' }, players: [], engine: null };
        const hostPlayer = { id: 'p1', name: cleanName(message.name, 'Player 1'), token: randomToken(), host: true,
          connected: true, ready: false, cameraReady: false, rematch: false };
        created.players.push(hostPlayer);
        lobbies.set(code, created);
        attach(created, hostPlayer, connection);
        log(`lobby ${code} created`);
        return broadcast(created);
      }
      case 'join': {
        if (lobby) return sendError(connection, 'bad_message');
        const target = lobbies.get(message.code);
        if (!target) return sendError(connection, 'not_found');
        if (target.players.length >= 2) return sendError(connection, 'full');
        if (target.phase !== 'lobby') return sendError(connection, 'in_progress');
        const guest = { id: 'p2', name: cleanName(message.name, 'Player 2'), token: randomToken(), host: false,
          connected: true, ready: false, cameraReady: false, rematch: false };
        target.players.push(guest);
        attach(target, guest, connection);
        return broadcast(target);
      }
      case 'rejoin': {
        const target = lobbies.get(message.code);
        const returning = target?.players.find(p => p.token === message.token);
        if (!returning) return sendError(connection, target ? 'expired' : 'not_found');
        attach(target, returning, connection);
        resumeMatch(target);
        return broadcast(target);
      }
    }
    if (!lobby) return sendError(connection, 'bad_message');
    switch (message.type) {
      case 'name':
        player.name = cleanName(message.name, player.name);
        return broadcast(lobby);
      case 'ready':
        if (lobby.phase !== 'lobby') return;
        player.ready = message.ready;
        return broadcast(lobby);
      case 'settings':
        if (!player.host) return sendError(connection, 'not_host');
        if (lobby.phase !== 'lobby') return;
        lobby.settings = { durationSeconds: message.durationSeconds, vocabulary: message.vocabulary };
        return broadcast(lobby);
      case 'start':
        if (!player.host) return sendError(connection, 'not_host');
        if (lobby.phase !== 'lobby') return;
        if (lobby.players.length !== 2 || lobby.players.some(p => !p.connected || !p.ready)) return sendError(connection, 'not_ready');
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
        connection.lan = null;
        if (player.host) return closeLobby(lobby, 'host_left');
        return removeGuest(lobby, player, 'opponent_left');
    }
  }

  return {
    lobbies,
    /**
     * Add a player connection. `transport` needs send(message) and close();
     * `local` marks the host's own screen. Returns receive(raw) and closed().
     */
    accept(transport, { local = false } = {}) {
      const connection = { send: message => transport.send(message), close: () => transport.close(), local, lan: null };
      return {
        receive(raw) {
          const parsed = parseClientMessage(raw);
          if (!parsed.ok) return sendError(connection, parsed.error);
          try { handle(connection, parsed.message); } catch (error) { log(`error: ${error.message}`); sendError(connection, 'bad_message'); }
        },
        closed: () => disconnected(connection),
      };
    },
    hasLobby: code => CODE_PATTERN.test(code) && lobbies.has(code),
    close() { for (const lobby of [...lobbies.values()]) closeLobby(lobby, 'host_left'); },
  };
}
