import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanHost } from '../src/lan/lanHost.js';
import { parseClientMessage, normalizeInviteCode, makeInviteCode, CODE_PATTERN } from '../src/lan/protocol.js';

// The match authority runs in the host's browser; here its "network" is in memory.
function startHost(options = {}) {
  return createLanHost({ countdownMs: 50, graceMs: 300, tickMs: 20, cameraTimeoutMs: 1000, ...options });
}

// A test player connection that records every message and can wait for one.
async function connect(host, { local = false } = {}) {
  const messages = [];
  const waiters = [];
  let open = true;
  const link = host.accept({
    send: message => {
      if (!open) return;
      const copy = JSON.parse(JSON.stringify(message));
      messages.push(copy);
      for (const w of [...waiters]) if (w.match(copy)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(copy); }
    },
    close: () => { if (open) { open = false; link.closed(); } },
  }, { local });
  const client = {
    messages,
    send: message => { if (open) link.receive(typeof message === 'string' ? message : JSON.stringify(message)); },
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
    // A dropped network link.
    close: () => { if (open) { open = false; link.closed(); } },
  };
  return client;
}

async function lobbyWithTwo(authority) {
  const host = await connect(authority, { local: true });
  host.send({ type: 'create', name: 'Ana' });
  const welcome = await host.waitFor(m => m.type === 'welcome');
  const guest = await connect(authority);
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

test('protocol: invite codes and message validation', () => {
  for (let i = 0; i < 200; i++) assert.match(makeInviteCode(), CODE_PATTERN);
  assert.equal(normalizeInviteCode(' x7k-9p2 '), 'X7K9P2');
  assert.equal(normalizeInviteCode('X7K9P'), null, 'too short');
  assert.equal(normalizeInviteCode('X7K9P0'), null, 'look-alike 0 is never used');
  assert.equal(parseClientMessage('{"type":"join","code":"X7K9P2"}').ok, true);
  for (const bad of ['nope', '[]', '{"type":"hack"}', '{"type":"join","code":"short"}', '{"type":"sign","letter":"Z","eventId":"1","challengeId":"c"}',
    '{"type":"settings","durationSeconds":7,"vocabulary":"alphabet"}', 'x'.repeat(5000)]) {
    assert.equal(parseClientMessage(bad).ok, false, bad.slice(0, 40));
  }
  assert.equal(parseClientMessage('{"type":"create","code":"bad"}').ok, false);
});

test('host creates a lobby; guest joins with the code; both see both players', async () => {
  const authority = startHost();
  try {
    const host = await connect(authority, { local: true });
    host.send({ type: 'create', name: 'Ana', code: 'X7K9P2' });
    const welcome = await host.waitFor(m => m.type === 'welcome');
    assert.equal(welcome.code, 'X7K9P2', 'the code the host registered for its peer id');
    assert.equal(welcome.host, true);
    const waiting = await host.state('lobby');
    assert.deepEqual(waiting.players.map(p => [p.name, p.connected]), [['Ana', true]]);

    const guest = await connect(authority);
    guest.send({ type: 'join', code: welcome.code, name: 'Ben' });
    assert.equal((await guest.waitFor(m => m.type === 'welcome')).playerId, 'p2');
    const both = await host.state('lobby', m => m.players.length === 2);
    assert.deepEqual(both.players.map(p => [p.id, p.name, p.host, p.connected, p.ready]), [['p1', 'Ana', true, true, false], ['p2', 'Ben', false, true, false]]);
    assert.equal((await guest.state('lobby', m => m.players.length === 2)).code, welcome.code);
  } finally { authority.close(); }
});

test('wrong code, full lobby, non-host start and start before ready are refused', async () => {
  const authority = startHost();
  try {
    const stranger = await connect(authority);
    stranger.send({ type: 'create', name: 'Mallory' });
    assert.equal((await stranger.waitFor(m => m.type === 'error')).error, 'bad_message', 'only the host page creates lobbies');
    stranger.send({ type: 'join', code: 'ABCDEF' });
    assert.equal((await stranger.waitFor(m => m.type === 'error')).error, 'not_found');
    const { host, guest, code } = await lobbyWithTwo(authority);
    const third = await connect(authority);
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
  } finally { authority.close(); }
});

test('a full match: same sequence, synced start, authoritative scores, duplicates rejected, results on both', async () => {
  const authority = startHost();
  try {
    const { host, guest } = await lobbyWithTwo(authority);
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

    // End the match early by moving the authority clock: results reach both, with the same winner.
    authority.lobbies.values().next().value.engine.startedAt -= 30000;
    const [hostResults, guestResults] = await Promise.all([host.state('results'), guest.state('results')]);
    assert.deepEqual(hostResults.match.results.ranking.map(p => [p.id, p.correct]), guestResults.match.results.ranking.map(p => [p.id, p.correct]));
    // Two correct each; the guest's wrong sign decides it.
    assert.deepEqual(hostResults.match.results.ranking.map(p => [p.id, p.correct, p.mistakes]), [['p1', 2, 0], ['p2', 2, 1]]);
    assert.equal(hostResults.match.results.winnerId, 'p1');
    assert.equal(guestResults.match.results.winnerId, 'p1');
    assert.equal(hostResults.match.results.winReason, 'fewer_mistakes');
  } finally { authority.close(); }
});

test('a player disconnect pauses the match; rejoining resumes it with the paused time not counted', async () => {
  let clock = 1_000_000;
  const authority = startHost({ now: () => clock, graceMs: 2000 });
  try {
    const { host, guest, code, guestToken } = await lobbyWithTwo(authority);
    const timer = setInterval(() => { clock += 20; }, 20);
    try {
      const { playing } = await startMatch(host, guest);
      const endsAt = playing.match.endsAt;
      guest.close();
      const paused = await host.state('paused');
      assert.deepEqual(paused.pause.waitingFor, ['p2']);
      clock += 5000; // five seconds away
      const back = await connect(authority);
      back.send({ type: 'rejoin', code, token: guestToken });
      assert.equal((await back.waitFor(m => m.type === 'welcome')).playerId, 'p2');
      // Skip updates queued before the pause; take the first one after the rejoin.
      const resumed = await host.state('playing', m => m.match.endsAt > endsAt);
      assert.ok(resumed.match.endsAt >= endsAt + 5000, 'the end time moved by the pause');
      // A stolen or wrong token cannot take the place.
      const imposter = await connect(authority);
      imposter.send({ type: 'rejoin', code, token: 'x'.repeat(32) });
      assert.equal((await imposter.waitFor(m => m.type === 'error')).error, 'expired');
    } finally { clearInterval(timer); }
  } finally { authority.close(); }
});

test('if the opponent does not come back in time, the remaining player wins by forfeit', async () => {
  const authority = startHost({ graceMs: 200 });
  try {
    const { host, guest } = await lobbyWithTwo(authority);
    await startMatch(host, guest);
    guest.close();
    await host.state('paused');
    const results = await host.state('results');
    assert.equal(results.match.results.winnerId, 'p1');
    assert.equal(results.match.results.winReason, 'opponent_left');
  } finally { authority.close(); }
});

test('the host leaving closes the match safely for the guest', async () => {
  const authority = startHost();
  try {
    const { host, guest } = await lobbyWithTwo(authority);
    await startMatch(host, guest);
    host.send({ type: 'leave' });
    assert.equal((await guest.waitFor(m => m.type === 'closed')).reason, 'host_left');
    assert.equal(authority.lobbies.size, 0);
  } finally { authority.close(); }
});

test('play again starts a fresh synchronized match only when both agree; return to lobby resets ready', async () => {
  const authority = startHost();
  try {
    const { host, guest } = await lobbyWithTwo(authority);
    const first = (await startMatch(host, guest)).playing.match.raceId;
    authority.lobbies.values().next().value.engine.startedAt -= 60000;
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
    authority.lobbies.values().next().value.engine.startedAt -= 60000;
    await host.state('results');
    guest.send({ type: 'toLobby' });
    const lobby = await host.state('lobby');
    assert.ok(lobby.players.every(p => !p.ready) && lobby.match === null);
  } finally { authority.close(); }
});
