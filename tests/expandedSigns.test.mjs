import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { recognizeLetter } from '../src/utils/recognizeLetter.js';
import { recognizeStaticGeometry } from '../src/recognition/staticGeometry.js';
import { DynamicGestureRecognizer } from '../src/recognition/dynamicGestures.js';
import { RecognitionController } from '../src/recognition/controller.js';
import { RaceEngine } from '../src/utils/raceEngine.js';
import { ALPHABET_SIGNS, WORD_SIGNS, CHALLENGE_SEQUENCES } from '../src/recognition/config.js';
import { ALPHABET_LESSONS, WORD_LESSONS, LESSONS } from '../src/utils/lessonContent.js';
import { emptyProgress, recordExploration, parseProgress } from '../src/utils/learning.js';
import { pose, cameraPoints, wordFrames } from './fixtures/signs.mjs';

const classes = JSON.parse(await readFile(new URL('../public/models/asl/mlp_classes.json', import.meta.url)));
const inference = letter => ({ logits: classes.map(c => c === letter ? 20 : -20), classes, latencyMs: 1 });

for (const letter of ['C','D','I','V','W','Y']) {
  test(`${letter} geometry is invariant to size, translation, reflection and in-plane rotation`, () => {
    for (const scale of [.05,.08,.12]) for (const mirror of [false,true]) for (const angle of [-.5,0,.5]) {
      const points = cameraPoints(pose(letter), { scale, mirror, angle, dx: .2, dy: -.2 });
      assert.equal(recognizeStaticGeometry(points).letter, letter);
      assert.equal(recognizeLetter(points), letter);
    }
  });
}

test('A/B/L legacy geometry remains intact; unknown and similar shapes are rejected', () => {
  for (const letter of ['A','B','L']) assert.equal(recognizeLetter(cameraPoints(pose(letter))), letter);
  assert.equal(recognizeStaticGeometry(cameraPoints(pose('OPEN'))).letter, null);
  const u = pose('V');
  for (const [a,b] of [[6,10],[7,11],[8,12]]) u[b] = { ...u[a], x: u[a].x + .15 };
  assert.equal(recognizeStaticGeometry(cameraPoints(u)).letter, null);
  const uncertain = pose('I'); uncertain[4].x = -1.4; // thumb between tucked and fully open
  assert.equal(recognizeStaticGeometry(cameraPoints(uncertain)).letter, null);
  const o = pose('C'); o[4] = { ...o[8] };
  assert.equal(recognizeStaticGeometry(cameraPoints(o)).letter, null);
  assert.equal(recognizeStaticGeometry(null).letter, null);
});

for (const word of WORD_SIGNS) {
  test(`${word} needs ordered motion and cannot repeatedly count a held endpoint`, () => {
    for (const mirror of [false,true]) for (const scale of [.05,.1]) {
      const dynamic = new DynamicGestureRecognizer();
      const frames = wordFrames(word, { mirror, scale });
      const results = frames.map(({ points, now }) => dynamic.update(points, now));
      assert.equal(results.filter(r => r.isNew).length, 1, `${word} ${mirror} ${scale}`);
      assert.equal(results.find(r => r.isNew).letter, word);
      for (let now = 1400; now < 3000; now += 100) assert.equal(dynamic.update(frames.at(-1).points, now).isNew, false);
      dynamic.update(null, 3100);
      const repeat = wordFrames(word, { mirror, scale }).map(f => dynamic.update(f.points, f.now + 3200));
      assert.equal(repeat.filter(r => r.isNew).length, 1);
      assert.ok(dynamic.history.length <= 30);
    }
  });
}

test('stationary poses, translated fist, single-finger pinch and fast transitions never complete words', () => {
  for (const sign of ['FIST','OPEN','NO_OPEN','NO_CLOSED','L','V']) {
    const d = new DynamicGestureRecognizer();
    for (let now = 0; now < 4000; now += 100) assert.equal(d.update(cameraPoints(pose(sign)), now).isNew, false);
  }
  const translated = new DynamicGestureRecognizer();
  for (let i = 0; i < 20; i++) assert.equal(translated.update(cameraPoints(pose('FIST'), { dy: Math.sin(i / 3) * .5 }), i * 100).isNew, false);
  const pinch = new DynamicGestureRecognizer();
  for (const f of wordFrames('NO')) {
    const p = [...f.points]; p[12] = cameraPoints(pose('NO_OPEN'))[12];
    assert.equal(pinch.update(p, f.now).isNew, false);
  }
  const tooFast = new DynamicGestureRecognizer();
  for (const f of wordFrames('HELLO')) assert.equal(tooFast.update(f.points, f.now / 10).isNew, false);
});

test('motion history resets after hand loss, stalls, backwards timestamps and challenge changes', () => {
  for (const interruption of ['loss','stall','backwards']) {
    const d = new DynamicGestureRecognizer();
    const frames = wordFrames('NO');
    for (const f of frames.slice(0,6)) d.update(f.points, f.now);
    if (interruption === 'loss') d.update(null, 550);
    for (const f of frames.slice(6)) {
      const now = interruption === 'stall' ? f.now + 1000 : interruption === 'backwards' ? f.now - 550 : f.now;
      assert.equal(d.update(f.points, now).isNew, false);
    }
  }
});

test('single-frame jumps and incomplete nods cannot finish a word', () => {
  const jumped = new DynamicGestureRecognizer();
  for (let i = 0; i < 15; i++) {
    assert.equal(jumped.update(cameraPoints(pose('OPEN'), { dx: i >= 3 ? 1 : 0 }), i * 100).isNew, false);
  }
  const halfNod = new DynamicGestureRecognizer();
  for (const f of wordFrames('YES').slice(0,7)) halfNod.update(f.points, f.now);
  for (let now = 700; now < 2000; now += 100) {
    assert.equal(halfNod.update(cameraPoints(pose('FIST'), { nod: Math.PI / 3 }), now).isNew, false);
  }
});

test('NO can repeat after reopening both fingers without losing hand tracking', () => {
  const d = new DynamicGestureRecognizer();
  let accepted = 0;
  for (const f of wordFrames('NO')) accepted += Number(d.update(f.points, f.now).isNew);
  for (let now = 1400; now < 1900; now += 100) d.update(cameraPoints(pose('NO_OPEN')), now);
  for (const f of wordFrames('NO')) accepted += Number(d.update(f.points, 1900 + f.now).isNew);
  assert.equal(accepted, 2);
});

test('controller geometry retains stability thresholds and cannot be vetoed by a wrong model class', async () => {
  let now = 0; const results = [];
  const controller = new RecognitionController({ infer: async () => inference('V'), clock: () => now, onResult: r => results.push(r) });
  controller.setChallenge('v'); controller.setTarget('V');
  for (now = 0; now <= 1500; now += 100) await controller.process(cameraPoints(pose('V')), now);
  assert.equal(results.filter(r => r.isNew).length, 1);
  controller.dispose();
  const conflicts = [];
  const uncertain = new RecognitionController({ infer: async () => inference('W'), clock: () => now, onResult: r => conflicts.push(r) });
  for (now = 0; now <= 1500; now += 100) await uncertain.process(cameraPoints(pose('V')), now);
  assert.equal(conflicts.filter(r => r.isNew && r.letter === 'V').length, 1);
  uncertain.dispose();
});

test('mixed challenges re-arm static letters after a word and discard partial motion on target changes', async () => {
  let now = 0; const results = [];
  const c = new RecognitionController({ infer: async () => inference('A'), clock: () => now, onResult: r => results.push(r) });
  c.setTarget('A'); c.setChallenge('a-1');
  for (now = 0; now <= 1000; now += 100) await c.process(cameraPoints(pose('A')), now);
  c.setTarget('YES'); c.setChallenge('yes');
  for (const f of wordFrames('YES')) { now = 1200 + f.now; await c.process(f.points, now); }
  c.setTarget('A'); c.setChallenge('a-2');
  for (now = 2600; now <= 3600; now += 100) await c.process(cameraPoints(pose('A')), now);
  assert.deepEqual(results.filter(r => r.isNew).map(r => r.letter), ['A','YES','A']);
  c.setTarget('NO'); c.setChallenge('no-1');
  for (const f of wordFrames('NO').slice(0,6)) { now = 3800 + f.now; await c.process(f.points, now); }
  c.setChallenge('no-2');
  for (const f of wordFrames('NO').slice(6)) { now = 3800 + f.now; await c.process(f.points, now); }
  assert.equal(results.filter(r => r.isNew && r.letter === 'NO').length, 0);
  c.dispose();
});

test('solo and duo consume temporal events with independent cameras and frozen first-completion wins', async () => {
  for (const mode of ['single','versus']) {
    let now = 0;
    const engine = new RaceEngine({ mode, targetLetters: ['YES','NO'], clock: () => now });
    engine.addPlayer('p1'); if (mode === 'versus') engine.addPlayer('p2'); engine.start();
    const controllers = new Map([...engine.players.keys()].map(id => {
      const c = new RecognitionController({ infer: async () => { throw new Error('Words must not run static inference'); }, clock: () => now,
        onResult: result => { if (result.isNew) engine.submitRecognition(id, result, now); } });
      c.setChallenge(engine.getChallengeId(id)); c.setTarget('YES');
      return [id, c];
    }));
    for (const f of wordFrames('YES')) {
      now = f.now;
      for (const [id,c] of controllers) await c.process(id === 'p1' ? f.points : cameraPoints(pose('FIST')), now);
    }
    assert.equal(engine.getPlayer('p1').progress, 1);
    if (mode === 'versus') assert.equal(engine.getPlayer('p2').progress, 0);
    const c = controllers.get('p1'); c.setChallenge(engine.getChallengeId('p1')); c.setTarget('NO');
    for (const f of wordFrames('NO')) { now = 1500 + f.now; await c.process(f.points, now); }
    assert.equal(engine.status, 'finished');
    assert.equal(engine.getResults().winnerId, mode === 'versus' ? 'p1' : null);
    const final = engine.getResults();
    now += 5000;
    engine.updateTime();
    assert.deepEqual(engine.getResults(), final);
    for (const controller of controllers.values()) controller.dispose();
  }
});

test('every offered sign has content and race challenges; expanded practice preserves starter saves', () => {
  assert.deepEqual(LESSONS.map(s => s.letter), ['A','B','L']);
  assert.deepEqual(new Set(ALPHABET_LESSONS.map(s => s.letter)), new Set(ALPHABET_SIGNS));
  assert.deepEqual(WORD_LESSONS.map(s => s.letter), WORD_SIGNS);
  assert.equal(WORD_LESSONS[0].simplified, true);
  for (const sequence of Object.values(CHALLENGE_SEQUENCES)) assert.doesNotThrow(() => new RaceEngine({ targetLetters: sequence }));
  const progress = recordExploration(recordExploration(emptyProgress(), 'C'), 'YES');
  assert.equal(progress.position, 0);
  assert.deepEqual(progress.practiced, []);
  assert.equal(recordExploration(progress, 'C'), progress);
  assert.deepEqual(parseProgress(JSON.stringify(progress)), progress);
});
