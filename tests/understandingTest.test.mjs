import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSE_LESSONS } from '../src/utils/lessonContent.js';
import { TEST_LENGTH, createTestSequence, startTest, recordSign, firstTryScore, coachMessage } from '../src/utils/understandingTest.js';
import { emptyProgress, parseProgress, recordTestResult, replayProgress } from '../src/utils/learning.js';
import { ghostShape, placeGhost } from '../src/utils/ghostHands.js';

test('each test is six random signs from its own lesson, evenly spread, no back-to-back repeats', () => {
  for (const lesson of COURSE_LESSONS) {
    const seen = new Set();
    for (let run = 0; run < 40; run++) {
      const sequence = createTestSequence(lesson.signs);
      seen.add(sequence.join(','));
      assert.equal(sequence.length, TEST_LENGTH);
      assert.ok(sequence.every(sign => lesson.signs.includes(sign)), `${lesson.id}: only this lesson's signs`);
      for (let i = 1; i < sequence.length; i++) assert.notEqual(sequence[i], sequence[i - 1], `${lesson.id}: ${sequence}`);
      const counts = lesson.signs.map(sign => sequence.filter(s => s === sign).length);
      assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `${lesson.id}: every sign used about equally ${counts}`);
      assert.ok(counts.every(n => n >= 1));
    }
    assert.ok(seen.size > 1, `${lesson.id}: the order changes between tests`);
  }
});

test('wrong signs are recorded as mistakes and never advance; there is no skip', () => {
  let t = startTest(['A', 'B', 'L'], () => 0);
  const [first, second] = t.sequence;
  const wrong = ['A', 'B', 'L'].find(s => s !== first);
  t = recordSign(t, wrong);
  assert.equal(t.index, 0);
  assert.deepEqual(t.items[0].mistakes, [wrong]);
  t = recordSign(t, first);
  assert.equal(t.index, 1);
  assert.equal(t.items[0].correct, true);
  assert.equal(t.sequence[t.index], second);
  for (const sign of t.sequence.slice(1)) t = recordSign(t, sign);
  assert.equal(t.done, true);
  assert.equal(firstTryScore(t), TEST_LENGTH - 1, 'the first sign needed a second try');
  assert.equal(recordSign(t, 'A'), t, 'a finished test ignores further signs');
  assert.ok(!('skip' in t));
});

test('the coach explains how to sign the target, and what differs after a mistake', () => {
  const how = coachMessage('N');
  assert.equal(how.title, 'How to sign N');
  assert.ok(how.steps.length && how.tip);
  const fix = coachMessage('N', 'M');
  assert.equal(fix.title, 'That looks like M, not N');
  assert.match(fix.detail, /^M: /);
  assert.match(fix.want, /^N: /);
  assert.match(fix.tip, /two fingers/);
  assert.equal(coachMessage('N', 'N').title, 'How to sign N');
  assert.match(coachMessage('YES', 'NO').want, /^YES: /);
});

test('best test score is saved per lesson, kept on restart and survives a reload', () => {
  const lesson = COURSE_LESSONS[0];
  let p = emptyProgress();
  assert.equal(p.testBest, null);
  p = recordTestResult(p, 4);
  assert.equal(p.testBest, 4);
  assert.equal(p.attempted, true);
  assert.equal(recordTestResult(p, 2).testBest, 4, 'a lower score does not replace the best');
  assert.equal(recordTestResult(p, 6).testBest, 6);
  assert.deepEqual(parseProgress(JSON.stringify(p), lesson), p);
  assert.equal(replayProgress(p).testBest, 4);
  assert.equal(parseProgress(JSON.stringify({ ...p, testBest: 99 }), lesson).testBest, null, 'invalid saved scores are dropped');
});

test('a ghost exists for every lesson sign and sits on the tracked hand', () => {
  for (const sign of COURSE_LESSONS.flatMap(l => l.signs)) {
    const shape = ghostShape(sign, 500);
    assert.equal(shape?.length, 21, sign);
    assert.ok(shape.flat().every(Number.isFinite), sign);
    assert.ok(Math.abs(Math.hypot(shape[9][0] - shape[0][0], shape[9][1] - shape[0][1]) - 1) < 1e-2, `${sign} is unit-scaled`);
  }
  // Without a hand: upright in the lower middle of the frame.
  const alone = placeGhost(ghostShape('A'), null, null, 1280, 720);
  assert.deepEqual(alone[0], [640, 612]);
  assert.ok(alone[9][1] < alone[0][1], 'fingers point up');
  // With a hand: same wrist, same wrist-to-knuckle length and direction.
  const hand = Array.from({ length: 21 }, () => ({ x: .4, y: .5, z: 0 }));
  hand[0] = { x: .4, y: .7, z: 0 }; hand[9] = { x: .5, y: .5, z: 0 };
  const placed = placeGhost(ghostShape('V'), hand, 'Right', 1280, 720);
  assert.deepEqual(placed[0].map(Math.round), [512, 504]);
  const want = [.5 * 1280, .5 * 720];
  assert.ok(Math.hypot(placed[9][0] - want[0], placed[9][1] - want[1]) < 1e-6, 'ghost knuckle lands on the user knuckle');
  // A "Left" hand gets the mirrored ghost: the thumb switches sides.
  const thumbSide = handedness => {
    const p = placeGhost(ghostShape('L'), null, handedness, 1000, 1000);
    return Math.sign(p[4][0] - p[0][0]);
  };
  assert.equal(thumbSide('Left'), -thumbSide('Right'));
});

test('word ghosts animate their motion', () => {
  for (const word of ['HELLO', 'YES', 'NO']) {
    const still = ghostShape(word, 0), moving = ghostShape(word, 1000);
    assert.notDeepEqual(still, moving, `${word} changes over time`);
  }
  assert.ok(ghostShape('HELLO', 1000)[0][0] > ghostShape('HELLO', 0)[0][0], 'HELLO sweeps sideways');
});
