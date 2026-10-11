import test from 'node:test';
import assert from 'node:assert/strict';
import { PracticeHold, handInFrame, emptyProgress, parseProgress, recordPractice, recordAnswer, advanceProgress, replayProgress } from '../src/utils/learning.js';
import { recognizeLetter } from '../src/utils/recognizeLetter.js';
import { RaceEngine } from '../src/utils/raceEngine.js';
import { LetterStabilizer } from '../src/utils/stabilizeLetter.js';

test('practice requires 1.5 seconds of matching frames, then latches success', () => {
  const hold = new PracticeHold('A');
  assert.equal(hold.update('A', 0).complete, false);
  for (let time = 100; time < 1500; time += 100) assert.equal(hold.update('A', time).complete, false);
  assert.deepEqual(hold.update('A', 1500), { progress: 1, complete: true });
  assert.equal(hold.update(null, 1600).complete, true);
  hold.reset();
  assert.equal(hold.update('A', 2000).complete, false);
});

test('wrong, absent, unknown, stalled, or backwards frames reset recognition', () => {
  for (const interruption of ['B', null, 'unknown']) {
    const hold = new PracticeHold('A');
    hold.update('A', 0);
    hold.update('A', 200);
    assert.equal(hold.update(interruption, 220).progress, 0);
    assert.equal(hold.update('A', 250).progress, 0);
  }
  const hold = new PracticeHold('L');
  hold.update('L', 0);
  assert.equal(hold.update('L', 2000).complete, false, 'a paused camera cannot pass');
  assert.equal(hold.update('L', 1000).progress, 0);
  assert.equal(hold.update('L', NaN).progress, 0);
});

test('frame boundaries reject clipped and malformed landmarks', () => {
  const points = Array.from({ length: 21 }, () => ({ x: .5, y: .5 }));
  assert.equal(handInFrame(points), true);
  points[8].x = .99;
  assert.equal(handInFrame(points), false);
  assert.equal(handInFrame(null), false);
  assert.equal(handInFrame(points.slice(1)), false);
  points[8].x = NaN;
  assert.equal(handInFrame(points), false);
});

test('all camera practices gate progression and cannot award duplicate credit', () => {
  let progress = emptyProgress();
  for (const letter of ['A', 'B', 'L']) {
    assert.equal(recordPractice(progress, letter), progress, 'guided steps do not grant practice credit');
    progress = advanceProgress(progress);
    assert.equal(advanceProgress(progress), progress, 'unverified practice blocks advancement');
    assert.equal(recordPractice(progress, 'C'), progress);
    progress = recordPractice(progress, letter);
    assert.equal(recordPractice(progress, letter), progress);
    progress = advanceProgress(progress);
  }
  assert.equal(progress.position, 6);
  assert.equal(progress.successfulAttempts, 3);
  assert.deepEqual(progress.practiced, ['A', 'B', 'L']);
  assert.equal(advanceProgress(progress), progress, 'unanswered quiz cannot advance');
  for (const answer of ['B', 'A', 'A']) {
    progress = recordAnswer(progress, answer);
    assert.equal(recordAnswer(progress, answer), progress, 'answer submission cannot repeat');
    progress = advanceProgress(progress);
  }
  assert.equal(progress.completed, true);
  assert.equal(progress.completions, 1);
  assert.equal(advanceProgress(progress), progress);
  assert.deepEqual(parseProgress(JSON.stringify(progress)), progress);
  const replay = replayProgress(progress);
  assert.equal(replay.position, 0);
  assert.deepEqual(replay.practiced, []);
  assert.deepEqual(replay.mastered, ['A', 'B', 'L']);
  assert.equal(replay.completions, 1);
});

test('storage recovers invalid data and resumes only consistent checkpoints', () => {
  for (const raw of [null, '', '{', 'null', '{"version":2}']) assert.deepEqual(parseProgress(raw), emptyProgress());
  const partial = { ...emptyProgress(), position: 3, practiced: ['A'], mastered: ['A'], successfulAttempts: 1 };
  assert.deepEqual(parseProgress(JSON.stringify(partial)), partial);
  const invalid = parseProgress(JSON.stringify({ version: 1, position: 9, practiced: [], answers: ['B', 'L', 'A'], completed: true }));
  assert.equal(invalid.completed, false);
  assert.equal(invalid.position, 1);
  assert.deepEqual(invalid.answers, []);
  assert.deepEqual(parseProgress('{"version":1,"practiced":"ABL"}').practiced, []);
});

// Synthetic geometry verifies invariance of existing rules, not real ASL accuracy.
function lFixture() {
  const points = Array.from({ length: 21 }, () => ({ x: .5, y: .65, z: 0 }));
  points[2] = { x: .5, y: .65, z: 0 };
  points[4] = { x: .8, y: .65, z: 0 };
  points[5] = { x: .45, y: .65, z: 0 };
  points[6] = { x: .45, y: .5, z: 0 };
  points[8] = { x: .45, y: .25, z: 0 };
  points[17] = { x: .3, y: .65, z: 0 };
  for (const [base, joint, tip] of [[9, 10, 12], [13, 14, 16], [17, 18, 20]]) {
    points[joint] = { ...points[base], y: .5 };
    points[tip] = { ...points[base], y: .62 };
  }
  return points;
}

test('existing L rules tolerate XY rotation, reflection, translation and scale', () => {
  const points = lFixture();
  assert.equal(recognizeLetter(points), 'L');
  for (const angle of [0, .3, .8, 1.5, 3]) {
    const transformed = points.map(p => ({ x: 2 * (p.x * Math.cos(angle) - p.y * Math.sin(angle)) + 1,
      y: 2 * (p.x * Math.sin(angle) + p.y * Math.cos(angle)) - 1, z: 0 }));
    assert.equal(recognizeLetter(transformed), 'L');
  }
  assert.equal(recognizeLetter(points.map(p => ({ ...p, x: 1 - p.x }))), 'L');
  assert.equal(recognizeLetter(null), null);
  assert.equal(recognizeLetter(points.slice(1)), null);
});

test('solo hearts, duo penalties, results and race stabilization retain behavior', () => {
  const solo = new RaceEngine({ targetLetters: ['A'], startingHearts: 5 });
  solo.addPlayer('p1'); solo.start(0);
  solo.submitLetter('p1', 'B', 100);
  assert.equal(solo.getPlayer('p1').hearts, 4);
  solo.submitLetter('p1', 'A', 1000);
  assert.equal(solo.status, 'finished');
  assert.equal(solo.getResults(1000).players[0].accuracy, 50);
  const duo = new RaceEngine({ mode: 'versus', targetLetters: ['A'] });
  duo.addPlayer('p1'); duo.addPlayer('p2'); duo.start(0);
  duo.submitLetter('p2', 'B', 100);
  assert.equal(duo.getPlayer('p2').penaltySeconds, 2);
  duo.submitLetter('p1', 'A', 1000);
  assert.equal(duo.status, 'finished');
  assert.equal(duo.submitLetter('p2', 'A', 2000).accepted, false);
  assert.equal(duo.getResults(2000).winner.id, 'p1');
  assert.equal(duo.getResults(2000).elapsedSeconds, 1);
  const stable = new LetterStabilizer();
  for (let i = 0; i < 5; i++) assert.equal(stable.addFrame('A').isNew, false);
  assert.equal(stable.addFrame('A').isNew, true);
  assert.equal(stable.addFrame('B').isNew, false);
  for (let i = 0; i < 5; i++) stable.addFrame(null);
  for (let i = 0; i < 5; i++) stable.addFrame('B');
  assert.equal(stable.addFrame('B').isNew, true);
});
