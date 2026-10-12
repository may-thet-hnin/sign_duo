import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceEngine } from '../src/utils/raceEngine.js';
import { COMPETITION_POOLS } from '../src/recognition/config.js';

function race(mode = 'versus', options = {}) {
  let now = 0;
  const engine = new RaceEngine({ mode, durationSeconds: 30, clock: () => now, ...options });
  engine.addPlayer('p1');
  if (mode === 'versus') engine.addPlayer('p2');
  engine.start();
  return { engine, at: value => { now = value; } };
}

function recognize(engine, playerId, letter, eventId) {
  return engine.submitRecognition(playerId, {
    status: 'stable', isNew: true, letter, eventId,
    challengeId: engine.getChallengeId(playerId),
  });
}

// Sign the player's current target correctly.
const signCorrectly = (engine, playerId, eventId) => recognize(engine, playerId, engine.getCurrentTarget(playerId), eventId);
const wrongSign = (engine, playerId) => engine.pool.find(sign => sign !== engine.getCurrentTarget(playerId));

test('every race draws a new random sequence', () => {
  const sequences = Array.from({ length: 5 }, () => {
    const { engine } = race('single');
    return Array.from({ length: 20 }, (_, i) => engine.signAt(i)).join(',');
  });
  assert.ok(new Set(sequences).size > 1, 'sequences differ between races');
});

test('E, M and N never appear in a competition and cannot be scored', () => {
  for (const pool of Object.values(COMPETITION_POOLS)) {
    assert.ok(!pool.some(sign => ['E', 'M', 'N'].includes(sign)));
    const { engine } = race('single', { pool });
    assert.ok(Array.from({ length: 300 }, (_, i) => engine.signAt(i)).every(sign => pool.includes(sign)));
  }
  assert.throws(() => new RaceEngine({ pool: ['A', 'E'] }));
  const { engine } = race('single');
  assert.equal(recognize(engine, 'p1', 'M', 'm').reason, 'not_validated');
  assert.equal(engine.getPlayer('p1').mistakes, 0, 'an excluded sign is not even a mistake');
});

test('duo players read one shared sequence at their own pace', () => {
  const { engine, at } = race('versus');
  const seen = { p1: [], p2: [] };
  for (let i = 0; i < 12; i++) {
    at(100 + i * 100);
    seen.p1.push(engine.getCurrentTarget('p1'));
    signCorrectly(engine, 'p1', `p1-${i}`);
    if (i % 2 === 0) { // p2 is slower
      seen.p2.push(engine.getCurrentTarget('p2'));
      signCorrectly(engine, 'p2', `p2-${i}`);
    }
  }
  assert.deepEqual(seen.p2, seen.p1.slice(0, seen.p2.length), 'same signs in the same order');
  assert.equal(engine.getPlayer('p1').progress, 12);
  assert.equal(engine.getPlayer('p2').progress, 6);
  // A mistake by one player changes nothing for the other.
  recognize(engine, 'p2', wrongSign(engine, 'p2'), 'p2-wrong');
  assert.equal(engine.getPlayer('p2').progress, 6);
  assert.equal(engine.getCurrentTarget('p1'), engine.signAt(12));
});

test('rounds never run out: signs keep coming until the timer reaches zero', () => {
  const { engine, at } = race('single', { pool: ['A', 'B', 'L'] });
  for (let i = 0; i < 200; i++) {
    at(10 + i * 100);
    assert.equal(signCorrectly(engine, 'p1', String(i)).correct, true);
  }
  assert.equal(engine.status, 'running');
  assert.equal(engine.getPlayer('p1').correct, 200);
  assert.ok(engine.getCurrentTarget('p1'));
  at(30000); engine.updateTime();
  assert.equal(engine.status, 'finished');
  assert.equal(engine.getResults().endReason, 'time_up');
});

test('repeats are kept apart: no back-to-back duplicates, and larger pools spread them further', () => {
  for (const pool of [['A', 'B'], COMPETITION_POOLS.words, COMPETITION_POOLS.alphabet, COMPETITION_POOLS.mixed]) {
    const { engine } = race('single', { pool });
    const sequence = Array.from({ length: 500 }, (_, i) => engine.signAt(i));
    for (let i = 1; i < sequence.length; i++) {
      const recent = sequence.slice(Math.max(0, i - engine.repeatGap), i);
      assert.ok(!recent.includes(sequence[i]), `${sequence[i]} repeated within ${engine.repeatGap} at ${i} (pool ${pool.length})`);
    }
    assert.ok(engine.repeatGap >= 1);
    assert.equal(new Set(sequence).size, pool.length, 'every sign in the pool is used');
  }
  // A pool of one sign has no alternative, so it repeats.
  const { engine } = race('single', { pool: ['A'] });
  assert.deepEqual([0, 1, 2].map(i => engine.signAt(i)), ['A', 'A', 'A']);
});

test('each correct sign scores points; the highest score at zero wins', () => {
  const { engine, at } = race('versus');
  at(1000);
  for (let i = 0; i < 3; i++) signCorrectly(engine, 'p2', `p2-${i}`);
  signCorrectly(engine, 'p1', 'p1-0');
  // p2 also makes more mistakes, but points decide first.
  recognize(engine, 'p2', wrongSign(engine, 'p2'), 'p2-wrong');
  // Score is net correct signs per minute: 3 correct in the first second.
  assert.equal(engine.getSnapshot().players.find(p => p.id === 'p2').score, 180);
  assert.equal(engine.status, 'running', 'no player can end a duo early');
  at(30000); engine.updateTime();
  const result = engine.getResults();
  assert.equal(result.winnerId, 'p2');
  assert.equal(result.winReason, 'more_points');
  assert.deepEqual(result.ranking.map(p => p.id), ['p2', 'p1']);
  assert.deepEqual(result.ranking.map(p => p.correct), [3, 1]);
  assert.deepEqual(result.ranking.map(p => p.score), [6, 2], 'correct signs per minute over the 30 s race');
});

test('equal scores fall back to fewer mistakes; equal on both is a genuine tie', () => {
  const close = race('versus');
  close.at(1000);
  signCorrectly(close.engine, 'p1', 'a'); signCorrectly(close.engine, 'p2', 'b');
  recognize(close.engine, 'p1', wrongSign(close.engine, 'p1'), 'w');
  close.at(30000); close.engine.updateTime();
  assert.equal(close.engine.getResults().winnerId, 'p2');
  assert.equal(close.engine.getResults().winReason, 'fewer_mistakes');

  for (const signs of [0, 2]) {
    const tied = race('versus');
    tied.at(1000);
    for (let i = 0; i < signs; i++) { signCorrectly(tied.engine, 'p1', `a${i}`); signCorrectly(tied.engine, 'p2', `b${i}`); }
    tied.at(30000); tied.engine.updateTime();
    assert.equal(tied.engine.getResults().winnerId, null);
    assert.equal(tied.engine.getResults().winReason, null);
  }
});

test('the timer ends the race at zero, stops scoring and freezes the results', () => {
  const { engine, at } = race('versus');
  at(1000); signCorrectly(engine, 'p1', 'early');
  // The clock check runs late, but the race ends at the deadline itself.
  at(30400);
  assert.equal(signCorrectly(engine, 'p2', 'late').reason, 'race_ended');
  assert.equal(engine.status, 'finished');
  assert.equal(engine.endedAt, 30000);
  const final = engine.getResults();
  assert.equal(final.elapsedSeconds, 30);
  assert.equal(final.remainingSeconds, 0);
  assert.equal(final.winnerId, 'p1');
  at(60000);
  assert.equal(signCorrectly(engine, 'p1', 'after').accepted, false);
  engine.updateTime(); engine.end(undefined, 'manual');
  assert.deepEqual(engine.getResults(), final);
});

test('rematch starts a new sequence, score and event scope', () => {
  const old = race('versus');
  old.at(1000);
  const previous = { status: 'stable', isNew: true, letter: old.engine.getCurrentTarget('p1'), eventId: 'old',
    challengeId: old.engine.getChallengeId('p1') };
  old.engine.submitRecognition('p1', previous);
  const fresh = new RaceEngine({ mode: 'versus' });
  fresh.addPlayer('p1'); fresh.addPlayer('p2');
  const waiting = fresh.getSnapshot(100000);
  assert.notEqual(waiting.raceId, old.engine.id);
  assert.equal(waiting.status, 'waiting');
  assert.equal(fresh.winnerId, null);
  assert.equal(fresh.recognitionEvents.size, 0);
  for (const p of waiting.players) { assert.equal(p.progress, 0); assert.equal(p.score, 0); }
  fresh.start(100000);
  assert.equal(fresh.submitRecognition('p1', previous, 100001).reason, 'stale_challenge');
});

test('solo: hearts can end a run early; otherwise the timer ends it', () => {
  const solo = race('single', { pool: ['A', 'B'], random: () => 0 });
  solo.at(1000);
  recognize(solo.engine, 'p1', 'B', 'wrong');
  assert.equal(solo.engine.getPlayer('p1').hearts, 4);
  solo.at(2000);
  recognize(solo.engine, 'p1', 'A', 'correct');
  assert.equal(solo.engine.status, 'running');
  assert.equal(solo.engine.getResults().winner, null);

  const exhausted = race('single');
  for (let i = 0; i < 5; i++) {
    exhausted.at(1000 + i);
    recognize(exhausted.engine, 'p1', wrongSign(exhausted.engine, 'p1'), String(i));
  }
  assert.equal(exhausted.engine.status, 'finished');
  assert.equal(exhausted.engine.getResults().endReason, 'out_of_hearts');
  assert.equal(exhausted.engine.getPlayer('p1').hearts, 0);

  const timed = race('single');
  timed.at(30000);
  timed.engine.updateTime();
  assert.equal(timed.engine.getResults().endReason, 'time_up');
});

test('the race screen window shows recent, current and upcoming shared signs', () => {
  const { engine, at } = race('versus');
  for (let i = 0; i < 4; i++) { at(100 * i + 100); signCorrectly(engine, 'p1', `p1-${i}`); }
  const [p1, p2] = engine.getSnapshot().players;
  assert.equal(p1.window.from, 2);
  assert.deepEqual(p1.window.signs, Array.from({ length: 8 }, (_, i) => engine.signAt(2 + i)));
  assert.equal(p1.window.signs[2], p1.currentTarget);
  assert.equal(p2.window.from, 0);
  assert.equal(p2.window.signs[0], p2.currentTarget);
});

test('a sign is never skipped by waiting, only by the Skip button', () => {
  const { engine, at } = race('single');
  at(29000); engine.updateTime();
  assert.equal(engine.getPlayer('p1').progress, 0);
  assert.equal(engine.getPlayer('p1').skipped, 0);
  assert.equal('autoSkipIn' in engine.getSnapshot().players[0], false);
});

test('skip: 0 points, no penalty, next sign at once, and a double click skips only one', () => {
  const { engine, at } = race('single', { pool: ['A', 'B', 'L'] });
  at(500); signCorrectly(engine, 'p1', 'first');
  const before = engine.getSnapshot().players[0];
  const target = before.currentTarget, challengeId = before.challengeId;
  at(1000);
  assert.deepEqual(engine.skip('p1', challengeId), { accepted: true, skipped: target, nextTarget: engine.signAt(2) });
  assert.equal(engine.skip('p1', challengeId).reason, 'stale_challenge', 'second click of a double click');
  const after = engine.getSnapshot().players[0];
  assert.equal(after.progress, 2);
  assert.equal(after.correct, before.correct, 'skipping neither adds nor removes points');
  assert.equal(engine.getCompetitionScore(engine.getPlayer('p1'), 1000), 60, 'score at the same moment is unchanged by the skip');
  assert.equal(after.skipped, 1);
  assert.equal(after.hearts, before.hearts);
  assert.equal(after.mistakes, 0);
  assert.equal(after.lastAttempt.skipped, true);
  assert.deepEqual(after.skippedIndices, [1]);
  // A recognition finished for the skipped sign can no longer score.
  assert.equal(engine.submitRecognition('p1', { status: 'stable', isNew: true, eventId: 'late', letter: target, challengeId }).reason, 'stale_challenge');
  assert.equal(engine.getPlayer('p1').correct, 1);
});

test('three skips per player per race; the fourth is refused', () => {
  const { engine, at } = race('versus');
  at(1000);
  assert.equal(engine.getSnapshot().players[0].skipsLeft, 3);
  for (let i = 0; i < 3; i++) assert.equal(engine.skip('p1', engine.getChallengeId('p1')).accepted, true);
  const stuck = engine.getSnapshot().players[0];
  assert.equal(stuck.skipsLeft, 0);
  assert.deepEqual(engine.skip('p1', stuck.challengeId), { accepted: false, reason: 'no_skips_left' });
  assert.equal(engine.getPlayer('p1').progress, 3, 'the refused skip does not move the player');
  // Signing still works after the allowance is used up.
  assert.equal(signCorrectly(engine, 'p1', 'after-skips').correct, true);
  // Player 2 keeps a full allowance of their own.
  assert.equal(engine.getSnapshot().players[1].skipsLeft, 3);
  assert.equal(engine.skip('p2', engine.getChallengeId('p2')).accepted, true);
  // A new race starts everyone at three again.
  assert.equal(race('versus').engine.getSnapshot().players[0].skipsLeft, 3);
});

test('duo: own skip button per player, one shared sequence, main timer unaffected', () => {
  const { engine, at } = race('versus');
  at(1000);
  engine.skip('p1', engine.getChallengeId('p1'));
  engine.skip('p1', engine.getChallengeId('p1'));
  engine.skip('p1', engine.getChallengeId('p1'));
  assert.equal(engine.getPlayer('p2').progress, 0, 'p1 skipping does not move p2');
  at(3000); signCorrectly(engine, 'p2', 'p2-0');
  // Signs are only ever skipped by the player: waiting does nothing.
  at(9000); engine.updateTime();
  assert.equal(engine.getPlayer('p1').progress, 3);
  assert.equal(engine.getPlayer('p1').skipped, 3);
  assert.equal(engine.getPlayer('p2').progress, 1);
  assert.equal(engine.getPlayer('p2').skipped, 0);
  // Both are still walking the same sequence.
  assert.equal(engine.getCurrentTarget('p1'), engine.signAt(3));
  assert.equal(engine.getCurrentTarget('p2'), engine.signAt(1));
  assert.equal(engine.status, 'running');
  assert.ok(Math.abs(engine.getSnapshot().remainingSeconds - 21) < 1e-9, 'skips do not touch the main timer');
  at(30000); engine.updateTime();
  assert.equal(engine.status, 'finished');
  assert.equal(engine.getResults().winnerId, 'p2', 'one completed sign beats only skips');
  assert.equal(engine.skip('p2', engine.getChallengeId('p2')).reason, 'race_not_running');
});
