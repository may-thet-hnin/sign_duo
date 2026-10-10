import test from 'node:test';
import assert from 'node:assert/strict';
import { getDistance, isFingerExtended, FINGER_INDICES } from '../src/utils/handGeometry.js';
import { recognizeLetter } from '../src/utils/recognizeLetter.js';
import { LetterStabilizer } from '../src/utils/stabilizeLetter.js';
import { RaceEngine } from '../src/utils/raceEngine.js';

test('geometry exports and input guards', () => {
  assert.equal(getDistance({x:0,y:0,z:0},{x:3,y:4,z:0}), 5);
  assert.equal(FINGER_INDICES.index.tip, 8);
  assert.equal(isFingerExtended([], 'index'), false);
  assert.equal(recognizeLetter(null), null);
});

test('stable prediction requires release and cannot repeatedly count a held letter', () => {
  const stabilizer = new LetterStabilizer(3, 2);
  assert.equal(stabilizer.addFrame('L').isNew, false);
  assert.equal(stabilizer.addFrame('L').isNew, false);
  assert.equal(stabilizer.addFrame('L').isNew, true);
  assert.equal(stabilizer.addFrame('L').isNew, false);
  assert.equal(stabilizer.addFrame('B').isNew, false);
  stabilizer.addFrame(null);
  stabilizer.addFrame(null);
  assert.equal(stabilizer.addFrame('B').isNew, false);
  assert.equal(stabilizer.addFrame('B').isNew, false);
  assert.equal(stabilizer.addFrame('B').isNew, true);
});

test('race engine updates progression, hearts and finishes', () => {
  const race = new RaceEngine({mode:'single',targetLetters:['L','A'],durationSeconds:60});
  race.addPlayer('p1');
  race.start(1000);
  assert.equal(race.submitLetter('p1','B',2000).correct,false);
  assert.equal(race.getSnapshot(2000).players[0].hearts,4);
  assert.equal(race.submitLetter('p1','L',3000).correct,true);
  assert.equal(race.getSnapshot(3000).players[0].currentTarget,'A');
  assert.equal(race.submitLetter('p1','A',4000).correct,true);
  assert.equal(race.status,'finished');
  assert.equal(race.getResults(4000).ranking[0].correct,2);
});

test('duo mode uses independent progress, penalties and competitive results', () => {
  const race = new RaceEngine({ mode: 'versus', targetLetters: ['A', 'L'], durationSeconds: 60, penaltySeconds: 2 });
  race.addPlayer('p1', 'Player 1');
  race.addPlayer('p2', 'Player 2');
  race.start(1000);
  assert.equal(race.submitLetter('p1', 'A', 2000).correct, true);
  assert.equal(race.submitLetter('p2', 'B', 2000).correct, false);
  let players = race.getSnapshot(2000).players;
  assert.equal(players[0].progress, 1);
  assert.equal(players[1].progress, 0);
  assert.equal(players[1].penaltySeconds, 2);
  assert.equal(race.submitLetter('p2', 'A', 3000).correct, true);
  assert.equal(race.submitLetter('p1', 'L', 4000).correct, true);
  assert.equal(race.status, 'running');
  assert.equal(race.submitLetter('p2', 'L', 5000).correct, true);
  assert.equal(race.status, 'finished');
  assert.equal(race.getResults(5000).ranking.length, 2);
});
