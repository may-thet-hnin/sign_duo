import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DynamicGestureRecognizer } from '../src/recognition/dynamicGestures.js';
import { RecognitionController } from '../src/recognition/controller.js';
import { RaceEngine } from '../src/utils/raceEngine.js';
import { ALPHABET_SIGNS, WORD_SIGNS, COMPETITION_POOLS } from '../src/recognition/config.js';
import { ALPHABET_LESSONS, WORD_LESSONS, signContent } from '../src/utils/lessonContent.js';
import { pose, cameraPoints, wordFrames } from './fixtures/signs.mjs';

const classes = JSON.parse(await readFile(new URL('../public/models/asl/mlp_classes.json', import.meta.url)));
const inference = letter => ({ logits: classes.map(c => c === letter ? 20 : -20), classes, latencyMs: 1 });

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

test('every offered letter comes from the model and keeps the hold gate', async () => {
  // D/L and A/S also pass a thumb-geometry check (tests/confusablePairs.test.mjs),
  // which this generic open-hand pose would fail.
  for (const letter of ALPHABET_SIGNS.filter(l => !['D', 'L', 'A', 'S'].includes(l))) {
    let now = 0; const results = [];
    const controller = new RecognitionController({ infer: async () => inference(letter), clock: () => now, onResult: r => results.push(r) });
    controller.setChallenge(letter); controller.setTarget(letter);
    for (now = 0; now <= 1500; now += 100) await controller.process(cameraPoints(pose('OPEN')), now);
    assert.deepEqual(results.filter(r => r.isNew).map(r => r.letter), [letter]);
    assert.ok(results.filter(r => r.timestamp < 900).every(r => !r.isNew));
    controller.dispose();
  }
  for (const excluded of ['G','U','X','J','0']) {
    let now = 0; const results = [];
    const controller = new RecognitionController({ infer: async () => inference(excluded), clock: () => now, onResult: r => results.push(r) });
    for (now = 0; now <= 1500; now += 100) await controller.process(cameraPoints(pose('OPEN')), now);
    assert.ok(results.every(r => !r.isNew && r.letter === null), `${excluded} must never be accepted`);
    controller.dispose();
  }
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

test('solo and duo consume temporal events with independent cameras until time runs out', async () => {
  for (const mode of ['single','versus']) {
    let now = 0;
    const engine = new RaceEngine({ mode, pool: ['YES','NO'], random: () => 0, durationSeconds: 5, clock: () => now });
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
    assert.equal(engine.getPlayer('p1').progress, 2);
    assert.equal(engine.getCurrentTarget('p1'), 'YES', 'new signs keep coming');
    assert.equal(engine.status, 'running');
    now = 5000; engine.updateTime();
    assert.equal(engine.status, 'finished');
    assert.equal(engine.getResults().winnerId, mode === 'versus' ? 'p1' : null);
    const final = engine.getResults();
    now += 5000;
    engine.updateTime();
    assert.deepEqual(engine.getResults(), final);
    for (const controller of controllers.values()) controller.dispose();
  }
});

test('every offered sign has content and race challenges', () => {
  assert.deepEqual(new Set(ALPHABET_LESSONS.map(s => s.letter)), new Set(ALPHABET_SIGNS));
  assert.deepEqual(WORD_LESSONS.map(s => s.letter), WORD_SIGNS);
  assert.equal(WORD_LESSONS[0].simplified, true);
  for (const sign of [...ALPHABET_SIGNS, ...WORD_SIGNS]) assert.equal(signContent(sign)?.letter, sign);
  for (const pool of Object.values(COMPETITION_POOLS)) assert.doesNotThrow(() => new RaceEngine({ pool }));
  assert.deepEqual(COMPETITION_POOLS.alphabet, ALPHABET_SIGNS.filter(s => !['E','M','N'].includes(s)));
});
