import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RecognitionController } from '../src/recognition/controller.js';
import { MotionLetterRecognizer } from '../src/recognition/motionLetters.js';
import { ALPHABET_SIGNS, CHALLENGE_SEQUENCES } from '../src/recognition/config.js';
import { COURSE_LESSONS } from '../src/utils/lessonContent.js';
import { RaceEngine } from '../src/utils/raceEngine.js';
import { pose, cameraPoints } from './fixtures/signs.mjs';
const classes = JSON.parse(await readFile(new URL('../public/models/asl/mlp_classes.json', import.meta.url)));

test('all 26 letters have tutorial content and appear in alphabet and mixed races', () => {
  assert.equal(ALPHABET_SIGNS.length, 26);
  for (const letter of ALPHABET_SIGNS) {
    const content = COURSE_LESSONS.flatMap(l => l.content).find(s => s.letter === letter);
    assert.ok(content?.steps.length && content.image && content.enabled, letter);
    assert.ok(CHALLENGE_SEQUENCES.alphabet.includes(letter));
    assert.ok(CHALLENGE_SEQUENCES.mixed.includes(letter));
  }
});

for (const mode of ['single', 'versus']) test(`added static model classes advance ${mode} races after a stable hold`, async () => {
  let now = 0;
  const letters = 'EFGHKMNOPQRSTUX'.split('');
  const race = new RaceEngine({ mode, targetLetters: letters, clock: () => now });
  race.addPlayer('p1'); if (mode === 'versus') race.addPlayer('p2'); race.start();
  let target;
  const controller = new RecognitionController({ clock: () => now,
    infer: async () => ({ logits: classes.map(c => c === target ? 20 : -20), classes }),
    onResult: result => { if (result.isNew) race.submitRecognition('p1', result, now); } });
  for (target of letters) {
    controller.setTarget(target); controller.setChallenge(race.getChallengeId('p1'));
    const end = now + 1100;
    for (; now <= end; now += 100) await controller.process(cameraPoints(pose('FIST')), now);
    assert.equal(race.getPlayer('p1').progress, letters.indexOf(target) + 1, target);
  }
  assert.equal(race.status, 'finished');
  if (mode === 'versus') assert.equal(race.getPlayer('p2').progress, 0);
  controller.dispose();
});

function frames(letter, mirror = false) {
  const path = letter === 'J'
    ? [[0,0],[0,0],[0,.2],[0,.4],[0,.65],[-.2,.65],[-.4,.55],[-.4,.55]]
    : [[0,0],[0,0],[.25,0],[.5,0],[.75,0],[.5,.2],[.25,.4],[0,.65],[.25,.65],[.5,.65],[.75,.65],[.75,.65]];
  return path.map(([dx,dy], n) => ({ now: n * 100,
    points: cameraPoints(pose(letter === 'J' ? 'I' : 'L'), { dx: mirror ? -dx : dx, dy, mirror }) }));
}
for (const letter of ['J', 'Z']) test(`${letter} requires ordered motion, locks its endpoint and resets on interruptions`, () => {
  for (const mirror of [false, true]) {
    const recognizer = new MotionLetterRecognizer();
    for (let now = 0; now < 1500; now += 100) assert.equal(recognizer.update(frames(letter, mirror)[0].points, now, letter).isNew, false);
    recognizer.reset();
    const results = frames(letter, mirror).map(f => recognizer.update(f.points, f.now, letter));
    assert.equal(results.filter(r => r.isNew).length, 1);
    assert.equal(results.find(r => r.isNew).letter, letter);
    const last = frames(letter, mirror).at(-1);
    assert.equal(recognizer.update(last.points, last.now + 100, letter).isNew, false);
    recognizer.reset();
    const trajectory = frames(letter, mirror);
    trajectory.slice(0,4).forEach(f => recognizer.update(f.points, f.now, letter));
    recognizer.update(null, 350, letter);
    assert.equal(trajectory.slice(4).some(f => recognizer.update(f.points, f.now, letter).isNew), false);
  }
});

for (const mode of ['single', 'versus']) test(`J and Z motion events complete ${mode} races`, async () => {
  let now = 0;
  const race = new RaceEngine({ mode, targetLetters: ['J', 'Z'], clock: () => now });
  race.addPlayer('p1'); if (mode === 'versus') race.addPlayer('p2'); race.start();
  const controller = new RecognitionController({ clock: () => now,
    infer: async () => { throw new Error('Motion letters must bypass static inference'); },
    onResult: result => { if (result.isNew) race.submitRecognition('p1', result, now); } });
  for (const letter of ['J', 'Z']) {
    controller.setTarget(letter); controller.setChallenge(race.getChallengeId('p1'));
    const offset = now + 100;
    for (const frame of frames(letter)) { now = offset + frame.now; await controller.process(frame.points, now); }
  }
  assert.equal(race.status, 'finished');
  assert.equal(race.getPlayer('p1').progress, 2);
  controller.dispose();
});
