import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceEngine } from '../src/utils/raceEngine.js';

function race(mode = 'versus', targetLetters = ['A', 'B', 'L']) {
  let now = 0;
  const engine = new RaceEngine({ mode, targetLetters, durationSeconds: 30, clock: () => now });
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

for (const winnerId of ['p1', 'p2']) {
  test(`${winnerId} finishes first: independent progress, immediate win and frozen time`, () => {
    const { engine, at } = race();
    const otherId = winnerId === 'p1' ? 'p2' : 'p1';
    for (const [i, letter] of ['A', 'B'].entries()) {
      at(1000 + i * 1000);
      recognize(engine, winnerId, letter, `winner-${i}`);
      recognize(engine, otherId, letter, `other-${i}`);
      assert.equal(engine.status, 'running'); // Equal incomplete progress is not a tie.
      assert.equal(engine.getResults().winner, null);
    }
    at(3456.789);
    assert.equal(recognize(engine, winnerId, 'L', 'completion').raceStatus, 'finished');
    const final = engine.getResults();
    assert.equal(final.winnerId, winnerId);
    assert.equal(final.winner.id, winnerId);
    assert.equal(final.winReason, 'finished_first');
    assert.equal(final.ranking[0].id, winnerId);
    assert.equal(final.endReason, 'player_finished');
    assert.equal(final.elapsedSeconds, 3.456789);
    assert.equal(final.players.find(p => p.id === otherId).progress, 2);
    assert.equal(engine.endedAt, 3456.789);

    at(100000);
    assert.equal(recognize(engine, otherId, 'L', 'late').accepted, false);
    assert.equal(engine.submitLetter(winnerId, 'A').accepted, false);
    engine.updateTime();
    engine.checkRaceEnd();
    engine.end(undefined, 'manual');
    assert.deepEqual(engine.getResults(), final);
  });

  test(`same-update completions use first processed event (${winnerId})`, () => {
    const { engine, at } = race('versus', ['A']);
    at(1234);
    const otherId = winnerId === 'p1' ? 'p2' : 'p1';
    recognize(engine, winnerId, 'A', 'first');
    assert.equal(recognize(engine, otherId, 'A', 'second').reason, 'race_not_running');
    assert.equal(engine.getResults().winnerId, winnerId);
    assert.equal(engine.getResults().elapsedSeconds, 1.234);
  });
}

test('completion winner overrides equal scores, including zero elapsed time', () => {
  const { engine } = race('versus', ['A']);
  recognize(engine, 'p2', 'A', 'first');
  const result = engine.getResults();
  assert.equal(result.players[0].competitionScore, result.players[1].competitionScore);
  assert.equal(result.winnerId, 'p2');
  assert.equal(result.ranking[0].id, 'p2');
  assert.equal(result.elapsedSeconds, 0);
});

test('timeout ranks correct signs, then fewer mistakes, and ties only when both are equal', () => {
  const { engine, at } = race();
  at(1000);
  recognize(engine, 'p1', 'A', 'p1');
  recognize(engine, 'p2', 'A', 'p2');
  // Equal correct signs: the extra wrong attempt must not win via a higher sign rate.
  recognize(engine, 'p2', 'A', 'wrong');
  at(30050);
  engine.updateTime();
  const final = engine.getResults();
  assert.equal(final.endReason, 'time_up');
  assert.equal(final.winnerId, 'p1');
  assert.equal(final.winReason, 'fewer_mistakes');
  assert.equal(final.ranking[0].id, 'p1');
  assert.equal(final.players[0].competitionScore, final.players[1].competitionScore);
  assert.equal(final.elapsedSeconds, 30);
  assert.equal(final.remainingSeconds, 0);
  at(60000);
  assert.deepEqual(engine.updateTime(), engine.getSnapshot(30050));

  for (const progress of [0, 1]) {
    const tied = race();
    if (progress) {
      tied.at(1000);
      recognize(tied.engine, 'p1', 'A', 'p1');
      recognize(tied.engine, 'p2', 'A', 'p2');
    }
    tied.at(30000);
    tied.engine.updateTime();
    assert.equal(tied.engine.getResults().winnerId, null);
    assert.equal(tied.engine.getResults().winner, null);
    assert.equal(tied.engine.getResults().winReason, null);
  }

  const ahead = race();
  ahead.at(1000);
  recognize(ahead.engine, 'p2', 'A', 'p2-a');
  recognize(ahead.engine, 'p2', 'B', 'p2-b');
  recognize(ahead.engine, 'p1', 'A', 'p1-a');
  ahead.at(30000);
  ahead.engine.updateTime();
  assert.equal(ahead.engine.getResults().winnerId, 'p2');
  assert.equal(ahead.engine.getResults().winReason, 'more_correct');
});

test('scores come from unrounded counts, so rounding never decides a winner', () => {
  const { engine, at } = race('versus', ['A', 'B', 'L']);
  at(1000);
  recognize(engine, 'p1', 'A', 'a1');
  recognize(engine, 'p2', 'B', 'w1');
  recognize(engine, 'p2', 'L', 'w2');
  recognize(engine, 'p2', 'A', 'a2');
  at(7000);
  const [p1, p2] = engine.getSnapshot().players;
  assert.equal(p1.competitionScore, p2.competitionScore, 'one correct sign each in 7 s');
  assert.equal(p1.competitionScore, Number((60 / 7).toFixed(2)));
});

test('deadline takes precedence over a late completion event', () => {
  const { engine, at } = race('versus', ['A']);
  at(30000);
  assert.equal(recognize(engine, 'p1', 'A', 'late').reason, 'race_ended');
  assert.equal(engine.status, 'finished');
  assert.equal(engine.getResults().endReason, 'time_up');
  assert.equal(engine.getResults().winner, null);
  assert.equal(engine.getPlayer('p1').progress, 0);
});

test('rematch resets outcome, clock, progress, penalties and recognition event scope', () => {
  const old = race('versus', ['A']);
  old.at(1000);
  const previous = { status: 'stable', isNew: true, letter: 'A', eventId: 'old',
    challengeId: old.engine.getChallengeId('p1') };
  old.engine.submitRecognition('p1', previous);
  const fresh = new RaceEngine({ mode: 'versus', targetLetters: ['A'] });
  fresh.addPlayer('p1'); fresh.addPlayer('p2');
  const waiting = fresh.getSnapshot(100000);
  assert.notEqual(waiting.raceId, old.engine.id);
  assert.equal(waiting.status, 'waiting');
  assert.equal(waiting.elapsedSeconds, 0);
  assert.equal(fresh.winnerId, null);
  assert.equal(fresh.endedAt, null);
  assert.equal(fresh.endReason, null);
  assert.equal(fresh.recognitionEvents.size, 0);
  for (const p of waiting.players) {
    assert.equal(p.progress, 0);
    assert.equal(p.penaltySeconds, 0);
    assert.equal(p.finished, false);
  }
  fresh.start(100000);
  assert.equal(fresh.submitRecognition('p1', previous, 100001).reason, 'stale_challenge');
  fresh.submitLetter('p2', 'A', 100123);
  assert.equal(fresh.getResults().winnerId, 'p2');
  assert.equal(fresh.getResults().elapsedSeconds, .123);
});

test('solo completion, hearts and timeout retain their behavior', () => {
  const solo = race('single', ['A']);
  solo.at(1000);
  recognize(solo.engine, 'p1', 'B', 'wrong');
  assert.equal(solo.engine.getPlayer('p1').hearts, 4);
  solo.at(2000);
  recognize(solo.engine, 'p1', 'A', 'correct');
  assert.equal(solo.engine.status, 'finished');
  assert.equal(solo.engine.getResults().winner, null);
  assert.equal(solo.engine.getResults().elapsedSeconds, 2);

  const exhausted = race('single');
  for (let i = 0; i < 5; i++) {
    exhausted.at(1000 + i);
    recognize(exhausted.engine, 'p1', 'B', String(i));
  }
  assert.equal(exhausted.engine.status, 'finished');
  assert.equal(exhausted.engine.getPlayer('p1').hearts, 0);

  const timed = race('single');
  timed.at(30000);
  timed.engine.updateTime();
  assert.equal(timed.engine.getResults().endReason, 'time_up');
});
