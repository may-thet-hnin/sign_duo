import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RaceEngine } from '../src/utils/raceEngine.js';
import { raceFeedback } from '../src/utils/raceFeedback.js';
import { TemporalSmoother } from '../src/recognition/temporalSmoothing.js';
import { RecognitionController } from '../src/recognition/controller.js';
import { RACE_DURATIONS } from '../src/recognition/config.js';

const classes = JSON.parse(await readFile(new URL('../public/models/asl/mlp_classes.json', import.meta.url)));
const { samples } = JSON.parse(await readFile(new URL('./fixtures/referenceLandmarks.json', import.meta.url)));
// Synthetic articulated geometry tests mechanics, not measured webcam accuracy.
function bFixture() {
  const points = Array.from({ length: 21 }, () => ({ x: .5, y: .7, z: 0 }));
  points[0] = { x: .5, y: .85, z: 0 };
  for (const [base, x] of [[5,.4],[9,.46],[13,.52],[17,.58]]) {
    for (let joint = 0; joint < 4; joint++) points[base + joint] = { x, y: .65 - joint * .11, z: 0 };
  }
  points[2] = { x: .32, y: .7, z: 0 };
  points[3] = { x: .38, y: .69, z: 0 };
  points[4] = { x: .43, y: .67, z: 0 };
  return points;
}
function stableFrames(smoother, letter, from) {
  let result;
  for (let now = from; now <= from + 1000; now += 100) result = smoother.update(letter, now);
  return result;
}
// A two-sign pool alternates (repeats are avoided); random=0 makes it start with the first sign.
function start(mode = 'single', pool = ['A','B','L']) {
  const engine = new RaceEngine({ mode, pool, random: () => 0 });
  engine.addPlayer('p1'); if (mode === 'versus') engine.addPlayer('p2');
  engine.start(0); return engine;
}
function event(engine, playerId, letter, id) {
  return { status: 'stable', isNew: true, eventId: id, challengeId: engine.getChallengeId(playerId), letter };
}

test('stable B advances once, rejects duplicates and immediately exposes next target', () => {
  const engine = start('single', ['B','L']);
  const result = event(engine, 'p1', 'B', 'first');
  assert.equal(engine.submitRecognition('p1', result, 900).correct, true);
  assert.equal(engine.getPlayer('p1').progress, 1);
  assert.equal(engine.getSnapshot(900).players[0].currentTarget, 'L');
  assert.equal(engine.submitRecognition('p1', result, 901).accepted, false);
  assert.equal(engine.submitRecognition('p1', { ...result, challengeId: engine.getChallengeId('p1') }, 902).reason, 'duplicate_event');
  assert.equal(engine.getPlayer('p1').correct, 1);
});

test('different stable letters naturally re-arm without any hand release', () => {
  const smoother = new TemporalSmoother();
  let count = 0;
  for (const [letter, startAt] of [['A',0],['B',1100],['L',2200]]) {
    for (let now = startAt; now <= startAt + 1000; now += 100) {
      const result = smoother.update(letter, now);
      if (result.isNew) count++;
    }
  }
  assert.equal(count, 3);
});

test('A to A needs release, and camera stalls never re-arm a held identical sign', () => {
  const smoother = new TemporalSmoother();
  let events = 0;
  for (let now = 0; now <= 2100; now += 100) if (smoother.update('A', now).isNew) events++;
  assert.equal(events, 1);
  smoother.update('A', 4000);
  for (let now = 4100; now <= 5000; now += 100) assert.equal(smoother.update('A', now).isNew, false);
  for (let now = 5100; now <= 6000; now += 100) smoother.update(null, now, true, false);
  for (let now = 6100; now <= 7100; now += 100) assert.equal(smoother.update('A', now).isNew, false);
  for (let now = 7200; now <= 7600; now += 100) smoother.update(null, now, false);
  for (let now = 7700; now <= 8700; now += 100) if (smoother.update('A', now).isNew) events++;
  assert.equal(events, 2);
});

test('a one-sign pool repeats A, and each repeat needs a release and a fresh event', () => {
  const engine = start('single', ['A']);
  const smoother = new TemporalSmoother();
  let number = 0;
  function feed(letter, now) {
    const challengeId = engine.getChallengeId('p1');
    const result = smoother.update(letter, now, Boolean(letter));
    if (result.isNew) engine.submitRecognition('p1', { ...result, challengeId, eventId: String(++number) }, now);
  }
  for (let now = 0; now <= 1900; now += 100) feed('A', now);
  assert.equal(engine.getPlayer('p1').progress, 1);
  for (let now = 2000; now <= 2400; now += 100) feed(null, now);
  for (let now = 2500; now <= 3500; now += 100) feed('A', now);
  assert.equal(engine.getPlayer('p1').progress, 2);
  assert.equal(engine.getCurrentTarget('p1'), 'A');
  assert.equal(engine.status, 'running', 'rounds never run out of signs');
});

test('incorrect sign never advances and duplicate wrong results do not drain hearts', () => {
  const engine = start('single', ['B','L']);
  const wrong = event(engine, 'p1', 'L', 'wrong');
  assert.equal(engine.submitRecognition('p1', wrong, 900).correct, false);
  assert.equal(engine.submitRecognition('p1', wrong, 1000).accepted, false);
  assert.equal(engine.getPlayer('p1').progress, 0); assert.equal(engine.getPlayer('p1').hearts, 4);
  assert.equal(engine.submitRecognition('p1', event(engine, 'p1', 'B', 'correct'), 2000).correct, true);
});

test('tentative and unstable sequences cannot score', () => {
  const smoother = new TemporalSmoother();
  for (let now = 0; now <= 2000; now += 100) assert.equal(smoother.update(now % 200 ? 'B' : null, now).isNew, false);
  assert.equal(stableFrames(smoother, 'B', 2100).status, 'stable');
  const engine = start();
  assert.equal(engine.submitRecognition('p1', { ...event(engine,'p1','A','x'), status: 'tentative' }, 900).accepted, false);
});

test('duo events are scoped to one player and one challenge', () => {
  const engine = start('versus');
  const p1 = event(engine, 'p1', 'A', 'one');
  assert.equal(engine.submitRecognition('p2', p1, 900).accepted, false);
  engine.submitRecognition('p1', p1, 900);
  assert.equal(engine.getPlayer('p1').progress, 1); assert.equal(engine.getPlayer('p2').progress, 0);
  engine.submitRecognition('p2', event(engine,'p2','B','two'), 1000);
  assert.equal(engine.getPlayer('p2').mistakes, 1); assert.equal(engine.getPlayer('p1').mistakes, 0);
});

test('a previous race event cannot be replayed after rematch', () => {
  const old = start(); const previous = event(old, 'p1', 'A', 'previous');
  const rematch = start();
  assert.equal(rematch.submitRecognition('p1', previous, 900).reason, 'stale_challenge');
  assert.equal(rematch.getPlayer('p1').progress, 0);
});

test('all timer choices wait for start, use monotonic elapsed time and clamp at zero', () => {
  for (const mode of ['single','versus']) for (const durationSeconds of RACE_DURATIONS) {
    let now = 1000;
    const engine = new RaceEngine({ mode, durationSeconds, clock: () => now });
    engine.addPlayer('p1'); if (mode === 'versus') engine.addPlayer('p2');
    now += 100000; assert.equal(engine.getSnapshot().remainingSeconds, durationSeconds);
    engine.start(); assert.throws(() => engine.start());
    now += 1234; assert.ok(Math.abs(engine.getSnapshot().remainingSeconds - (durationSeconds - 1.234)) < 1e-9);
    now += durationSeconds * 1000; engine.updateTime();
    assert.equal(engine.getSnapshot().remainingSeconds, 0); assert.equal(engine.status, 'finished');
    assert.equal(engine.getResults().durationSeconds, durationSeconds);
    assert.equal(engine.submitRecognition('p1', event(engine,'p1','A','late')).accepted, false);
  }
});

test('real ONNX on real B landmarks and time validation advance the race end to end', async () => {
  const ort = await import('onnxruntime-web');
  ort.env.wasm.numThreads = 1;
  const reference = samples.find(s => s.letter === 'B' && s.handedness === 'Left');
  const b = reference.points.map(([x, y, z]) => ({ x, y, z }));
  const session = await ort.InferenceSession.create(await readFile(new URL('../public/models/asl/mlp_asl.onnx', import.meta.url)), { executionProviders: ['wasm'] });
  let now = 0;
  const engine = start('single', ['B','L']);
  const controller = new RecognitionController({ clock: () => now,
    infer: async input => {
      const inferenceStart = performance.now();
      const output = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1,63]) });
      return { logits: output[session.outputNames[0]].data, classes, latencyMs: performance.now() - inferenceStart };
    }, onResult: result => {
      if (result.isNew) {
        assert.equal(result.letter, 'B');
        engine.submitRecognition('p1', result, now);
        controller.setChallenge(engine.getChallengeId('p1'));
      }
    },
  });
  controller.setChallenge(engine.getChallengeId('p1'));
  try {
    for (now = 0; now <= 2000; now += 100) await controller.process(b, now, { handedness: reference.handedness });
    assert.equal(engine.getPlayer('p1').correct, 1);
    assert.equal(engine.getCurrentTarget('p1'), 'L');
  } finally { controller.dispose(); await session.release(); }
});

test('challenge changes discard in-flight inference before it can consume a new event', async () => {
  let resolve; const results = [];
  const c = new RecognitionController({ onResult: result => results.push(result), infer: () => new Promise(r => { resolve = r; }) });
  c.setChallenge('p1:0'); const pending = c.process(bFixture(), performance.now());
  c.setChallenge('p1:1'); resolve({ logits: classes.map(c => c === 'B' ? 20 : -20), classes, latencyMs: 1 });
  await pending; assert.equal(results.length, 0); c.dispose();
});

test('feedback explains tentative, wrong, repeated, absent and error states without claiming acceptance', () => {
  const player = { currentTarget: 'B', finished: false };
  assert.equal(raceFeedback(player, { status: 'no-hand' }), 'Show your hand to the camera.');
  assert.match(raceFeedback(player, { status: 'tentative', candidate: 'B' }), /Hold B/);
  assert.match(raceFeedback(player, { candidate: 'A' }), /Detected A/);
  assert.match(raceFeedback(player, { status: 'stable', letter: 'B', lockedLetter: 'B' }), /Release/);
  assert.match(raceFeedback(player, { status: 'error', error: 'Failed' }), /Failed/);
});
