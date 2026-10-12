import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanRelay } from '../server/lanRelay.js';
import { parseClientMessage, normalizeInviteCode, makeInviteCode, CODE_PATTERN, isLocalOrigin } from '../src/lan/protocol.js';

let nextPort = 46000 + Math.floor(Math.random() * 1000) * 4;
async function startRelay(options = {}) {
  const ports = { port: nextPort++, discoveryPort: nextPort++ };
  const relay = createLanRelay({ ...ports, host: '127.0.0.1', countdownMs: 50, graceMs: 300, tickMs: 20, cameraTimeoutMs: 1000, discoveryMs: 600, ...options });
  await relay.ready;
  return relay;
}

// A test client that records every message and can wait for one.
async function connect(relay) {
  const socket = new WebSocket(`ws://127.0.0.1:${relay.port}`);
  const messages = [];
  const waiters = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    messages.push(message);
    for (const w of [...waiters]) if (w.match(message)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(message); }
  });
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve); socket.addEventListener('error', reject); });
  const client = {
    socket, messages,
    send: message => socket.send(JSON.stringify(message)),
    waitFor(match, ms = 2000) {
      const found = messages.find(match);
      if (found) { messages.splice(messages.indexOf(found), 1); return Promise.resolve(found); }
      return new Promise((resolve, reject) => {
        const waiter = { match, resolve: m => { messages.splice(messages.indexOf(m), 1); clearTimeout(timer); resolve(m); } };
        const timer = setTimeout(() => { waiters.splice(waiters.indexOf(waiter), 1); reject(new Error(`timed out waiting (${messages.map(m => m.type + ':' + (m.phase ?? m.error ?? '')).join(', ')})`)); }, ms);
        waiters.push(waiter);
      });
    },
    state: (phase, extra = () => true) => client.waitFor(m => m.type === 'state' && (!phase || m.phase === phase) && extra(m)),
    close: () => socket.close(),
  };
  return client;
}

async function lobbyWithTwo(relay) {
  const host = await connect(relay);
  host.send({ type: 'create', name: 'Ana' });
  const welcome = await host.waitFor(m => m.type === 'welcome');
  const guest = await connect(relay);
  guest.send({ type: 'join', code: welcome.code, name: 'Ben' });
  const guestWelcome = await guest.waitFor(m => m.type === 'welcome');
  return { host, guest, code: welcome.code, hostToken: welcome.token, guestToken: guestWelcome.token };
}

async function startMatch(host, guest) {
  host.send({ type: 'ready', ready: true }); guest.send({ type: 'ready', ready: true });
  await host.state('lobby', m => m.players.every(p => p.ready));
  host.send({ type: 'start' });
  await host.state('preparing'); await guest.state('preparing');
  host.send({ type: 'cameraReady', ready: true }); guest.send({ type: 'cameraReady', ready: true });
  const countdown = await guest.state('countdown');
  await host.state('playing'); const playing = await guest.state('playing');
  return { countdown, playing };
}

const me = (state, id) => state.match.snapshot.players.find(p => p.id === id);

test('protocol: invite codes, message validation and allowed page origins', () => {
  for (let i = 0; i < 200; i++) assert.match(makeInviteCode(), CODE_PATTERN);
  assert.equal(normalizeInviteCode(' x7k-9p2 '), 'X7K9P2');
  assert.equal(normalizeInviteCode('X7K9P'), null, 'too short');
  assert.equal(normalizeInviteCode('X7K9P0'), null, 'look-alike 0 is never used');
  assert.equal(parseClientMessage('{"type":"join","code":"X7K9P2"}').ok, true);
  for (const bad of ['nope', '[]', '{"type":"hack"}', '{"type":"join","code":"short"}', '{"type":"sign","letter":"Z","eventId":"1","challengeId":"c"}',
    '{"type":"settings","durationSeconds":7,"vocabulary":"alphabet"}', 'x'.repeat(5000)]) {
    assert.equal(parseClientMessage(bad).ok, false, bad.slice(0, 40));
  }
  assert.ok(isLocalOrigin('http://localhost:5173') && isLocalOrigin('http://192.168.1.5:5173') && isLocalOrigin(undefined));
  assert.ok(!isLocalOrigin('https://example.com'));
});

test('host creates a lobby; guest joins with the code; both see both players', async () => {
  const relay = await startRelay();
  try {
    const host = await connect(relay);
    host.send({ type: 'create', name: 'Ana' });
    const welcome = await host.waitFor(m => m.type === 'welcome');
    assert.match(welcome.code, CODE_PATTERN);
    assert.equal(welcome.host, true);
    const waiting = await host.state('lobby');
    assert.deepEqual(waiting.players.map(p => [p.name, p.connected]), [['Ana', true]]);

    const guest = await connect(relay);
    guest.send({ type: 'join', code: welcome.code, name: 'Ben' });
    assert.equal((await guest.waitFor(m => m.type === 'welcome')).playerId, 'p2');
    const both = await host.state('lobby', m => m.players.length === 2);
    assert.deepEqual(both.players.map(p => [p.id, p.name, p.host, p.connected, p.ready]), [['p1', 'Ana', true, true, false], ['p2', 'Ben', false, true, false]]);
    assert.equal((await guest.state('lobby', m => m.players.length === 2)).code, welcome.code);
  } finally { await relay.close(); }
});

test('wrong code, full lobby, non-host start and start before ready are refused', async () => {
  const relay = await startRelay();
  try {
    const stranger = await connect(relay);
    stranger.send({ type: 'join', code: 'ABCDEF' });
    assert.equal((await stranger.waitFor(m => m.type === 'error')).error, 'not_found');
    const { host, guest, code } = await lobbyWithTwo(relay);
    const third = await connect(relay);
    third.send({ type: 'join', code });
    assert.equal((await third.waitFor(m => m.type === 'error')).error, 'full');
    guest.send({ type: 'start' });
    assert.equal((await guest.waitFor(m => m.type === 'error')).error, 'not_host');
    host.send({ type: 'start' });
    assert.equal((await host.waitFor(m => m.type === 'error')).error, 'not_ready');
    guest.send({ type: 'settings', durationSeconds: 30, vocabulary: 'words' });
    assert.equal((await guest.waitFor(m => m.type === 'error')).error, 'not_host');
    host.send('not json at all');
    assert.equal((await host.waitFor(m => m.type === 'error')).error, 'bad_message');
  } finally { await relay.close(); }
});

test('a full match: same sequence, synced start, authoritative scores, duplicates rejected, results on both', async () => {
  const relay = await startRelay();
  try {
    const { host, guest } = await lobbyWithTwo(relay);
    host.send({ type: 'settings', durationSeconds: 30, vocabulary: 'alphabet' });
    await guest.state('lobby', m => m.settings.durationSeconds === 30);
    const { countdown, playing } = await startMatch(host, guest);
    assert.ok(countdown.match.startAt > countdown.serverNow, 'start time is in the future, set by the host');
    assert.equal(playing.match.endsAt - playing.match.startAt, 30000);

    // Both devices get the same targets in the same order.
    const p1 = me(playing, 'p1'), p2 = me(playing, 'p2');
    assert.equal(p1.currentTarget, p2.currentTarget);
    assert.deepEqual(p1.window.signs, p2.window.signs);

    // Host signs correctly; the same event again (duplicate packet) and a stale one do nothing.
    const sign = { type: 'sign', letter: p1.currentTarget, eventId: 'host-1', challengeId: p1.challengeId };
    host.send(sign); host.send(sign);
    let state = await guest.state('playing', m => me(m, 'p1').correct === 1);
    assert.equal(me(state, 'p1').progress, 1);
    assert.equal(me(state, 'p2').progress, 0, 'the guest is unaffected');
    host.send({ ...sign, eventId: 'host-late' });
    // Guest signs its own first target (the same sign the host had).
    guest.send({ type: 'sign', letter: p2.currentTarget, eventId: 'guest-1', challengeId: p2.challengeId });
    state = await host.state('playing', m => me(m, 'p2').correct === 1);
    assert.equal(me(state, 'p1').correct, 1, 'the duplicate and the stale event were not counted');
    assert.equal(me(state, 'p2').currentTarget, me(playing, 'p1').window.signs[1], 'the guest moves to the same second sign');

    // Simultaneous scoring: both sign their next target in the same moment.
    const next = state;
    host.send({ type: 'sign', letter: me(next, 'p1').currentTarget, eventId: 'host-2', challengeId: me(next, 'p1').challengeId });
    guest.send({ type: 'sign', letter: me(next, 'p2').currentTarget, eventId: 'guest-2', challengeId: me(next, 'p2').challengeId });
    state = await host.state('playing', m => me(m, 'p1').correct === 2 && me(m, 'p2').correct === 2);
    // A wrong sign is a mistake for that player only.
    const wrong = ['A', 'B', 'C', 'D', 'I', 'V'].find(l => l !== me(state, 'p2').currentTarget);
    guest.send({ type: 'sign', letter: wrong, eventId: 'guest-wrong', challengeId: me(state, 'p2').challengeId });
    state = await host.state('playing', m => me(m, 'p2').mistakes === 1);
    assert.equal(me(state, 'p1').mistakes, 0);
    // Skips are synchronized too.
    host.send({ type: 'skip', challengeId: me(state, 'p1').challengeId });
    state = await guest.state('playing', m => me(m, 'p1').skipped === 1);
    assert.equal(me(state, 'p1').progress, 3);

    // End the match early by moving the relay clock: results reach both, with the same winner.
    relay.lobbies.values().next().value.engine.startedAt -= 30000;
    const [hostResults, guestResults] = await Promise.all([host.state('results'), guest.state('results')]);
    assert.deepEqual(hostResults.match.results.ranking.map(p => [p.id, p.correct]), guestResults.match.results.ranking.map(p => [p.id, p.correct]));
    // Two correct each; the guest's wrong sign decides it.
    assert.deepEqual(hostResults.match.results.ranking.map(p => [p.id, p.correct, p.mistakes]), [['p1', 2, 0], ['p2', 2, 1]]);
    assert.equal(hostResults.match.results.winnerId, 'p1');
    assert.equal(guestResults.match.results.winnerId, 'p1');
    assert.equal(hostResults.match.results.winReason, 'fewer_mistakes');
  } finally { await relay.close(); }
});

test('a player disconnect pauses the match; rejoining resumes it with the paused time not counted', async () => {
  let clock = 1_000_000;
  const relay = await startRelay({ now: () => clock, graceMs: 2000 });
  try {
    const { host, guest, code, guestToken } = await lobbyWithTwo(relay);
    const timer = setInterval(() => { clock += 20; }, 20);
    try {
      const { playing } = await startMatch(host, guest);
      const endsAt = playing.match.endsAt;
      guest.close();
      const paused = await host.state('paused');
      assert.deepEqual(paused.pause.waitingFor, ['p2']);
      clock += 5000; // five seconds away
      const back = await connect(relay);
      back.send({ type: 'rejoin', code, token: guestToken });
      assert.equal((await back.waitFor(m => m.type === 'welcome')).playerId, 'p2');
      // Skip updates queued before the pause; take the first one after the rejoin.
      const resumed = await host.state('playing', m => m.match.endsAt > endsAt);
      assert.ok(resumed.match.endsAt >= endsAt + 5000, 'the end time moved by the pause');
      // A stolen or wrong token cannot take the place.
      const imposter = await connect(relay);
      imposter.send({ type: 'rejoin', code, token: 'x'.repeat(32) });
      assert.equal((await imposter.waitFor(m => m.type === 'error')).error, 'expired');
    } finally { clearInterval(timer); }
  } finally { await relay.close(); }
});

test('if the opponent does not come back in time, the remaining player wins by forfeit', async () => {
  const relay = await startRelay({ graceMs: 200 });
  try {
    const { host, guest } = await lobbyWithTwo(relay);
    await startMatch(host, guest);
    guest.close();
    await host.state('paused');
    const results = await host.state('results');
    assert.equal(results.match.results.winnerId, 'p1');
    assert.equal(results.match.results.winReason, 'opponent_left');
  } finally { await relay.close(); }
});

test('the host leaving closes the match safely for the guest', async () => {
  const relay = await startRelay();
  try {
    const { host, guest } = await lobbyWithTwo(relay);
    await startMatch(host, guest);
    host.send({ type: 'leave' });
    assert.equal((await guest.waitFor(m => m.type === 'closed')).reason, 'host_left');
    assert.equal(relay.lobbies.size, 0);
  } finally { await relay.close(); }
});

test('play again starts a fresh synchronized match only when both agree; return to lobby resets ready', async () => {
  const relay = await startRelay();
  try {
    const { host, guest } = await lobbyWithTwo(relay);
    const first = (await startMatch(host, guest)).playing.match.raceId;
    relay.lobbies.values().next().value.engine.startedAt -= 60000;
    await host.state('results'); await guest.state('results');
    host.send({ type: 'rematch' });
    const waiting = await guest.state('results', m => m.players.find(p => p.id === 'p1').rematch);
    assert.equal(waiting.phase, 'results', 'one vote is not enough');
    guest.send({ type: 'rematch' });
    await host.state('preparing'); await guest.state('preparing');
    host.send({ type: 'cameraReady', ready: true }); guest.send({ type: 'cameraReady', ready: true });
    const second = await guest.state('playing');
    assert.notEqual(second.match.raceId, first);
    assert.ok(me(second, 'p1').correct === 0 && me(second, 'p2').correct === 0);
    relay.lobbies.values().next().value.engine.startedAt -= 60000;
    await host.state('results');
    guest.send({ type: 'toLobby' });
    const lobby = await host.state('lobby');
    assert.ok(lobby.players.every(p => !p.ready) && lobby.match === null);
  } finally { await relay.close(); }
});

test('UDP discovery: another helper finds the host by invite code; unknown codes are not found', async () => {
  const hostRelay = await startRelay();
  const joinRelay = await startRelay({ discoveryTargetPort: hostRelay.discoveryPort });
  try {
    const host = await connect(hostRelay);
    host.send({ type: 'create', name: 'Ana' });
    const { code } = await host.waitFor(m => m.type === 'welcome');
    const browser = await connect(joinRelay);
    browser.send({ type: 'find', code });
    const found = await browser.waitFor(m => m.type === 'found', 3000);
    assert.equal(found.port, hostRelay.port);
    // The address it found really reaches the host's lobby.
    const guest = new WebSocket(`ws://${found.address}:${found.port}`);
    await new Promise((resolve, reject) => { guest.addEventListener('open', resolve); guest.addEventListener('error', reject); });
    guest.close();
    browser.send({ type: 'find', code: 'ZZZZZZ' });
    assert.equal((await browser.waitFor(m => m.type === 'error', 3000)).error, 'not_found');
  } finally { await hostRelay.close(); await joinRelay.close(); }
});
