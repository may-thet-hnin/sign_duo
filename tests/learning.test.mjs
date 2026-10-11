import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProgress, parseProgress, recordPractice, recordAnswer, advanceProgress, replayProgress } from '../src/utils/learning.js';
import { RaceEngine } from '../src/utils/raceEngine.js';

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
});
