import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeLandmarks, validateClasses, softmax, decodePrediction, canonicalHand } from '../src/recognition/preprocessing.js';
import { TemporalSmoother } from '../src/recognition/temporalSmoothing.js';
import { RECOGNITION_CONFIG, SUPPORTED_SIGNS } from '../src/recognition/config.js';
import { RecognitionController } from '../src/recognition/controller.js';
import { RaceEngine } from '../src/utils/raceEngine.js';
import { releaseCamera } from '../src/recognition/cameraResources.js';

const classes = JSON.parse(await readFile(new URL('../public/models/asl/mlp_classes.json', import.meta.url)));
const points = Array.from({ length: 21 }, (_, i) => ({ x: .3 + i * .01, y: .3 + i * .005, z: -i * .001 }));
test('camera teardown detaches video and stops every stream track', () => {
  let stopped = 0;
  const video = { srcObject: {} };
  releaseCamera(video, { getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }] });
  assert.equal(video.srcObject, null); assert.equal(stopped, 2);
  releaseCamera(null, undefined);
});
function logits(letter) { return classes.map(c => c === letter ? 20 : -20); }

test('exact wrist-relative XYZ normalization preserves translation and uniform scale', () => {
  const input = normalizeLandmarks(points);
  assert.equal(input.length, 63);
  assert.ok(input instanceof Float32Array);
  assert.deepEqual(Array.from(input.slice(0, 3)), [0, 0, 0]);
  assert.ok(Math.abs(Math.hypot(...input.slice(27, 30)) - 1) < 1e-6);
  const transformed = normalizeLandmarks(points.map(p => ({ x: p.x * 2 + 3, y: p.y * 2 - 4, z: p.z * 2 + 5 })));
  input.forEach((v, i) => assert.ok(Math.abs(v - transformed[i]) < 1e-5));
  assert.equal(normalizeLandmarks(null), null);
  assert.equal(normalizeLandmarks(points.map(p => ({ ...p, z: NaN }))), null);
  assert.equal(normalizeLandmarks(Array(21).fill(points[0])), null);
});

test('official mapping, numerically stable softmax, confidence and full-class filtering', () => {
  assert.equal(validateClasses(classes)[10], 'A');
  assert.equal(classes[21], 'L');
  assert.throws(() => validateClasses(['A']));
  assert.deepEqual(softmax([10000, 10000]), [.5, .5]);
  assert.throws(() => softmax([NaN]));
  assert.equal(decodePrediction(logits('L'), classes, RECOGNITION_CONFIG, SUPPORTED_SIGNS.learning).letter, 'L');
  // Digits and motion letters are never answers; 9 is the same handshape as F.
  for (const c of ['J','Z','0','5']) {
    const result = decodePrediction(logits(c), classes, RECOGNITION_CONFIG, SUPPORTED_SIGNS.learning);
    assert.equal(result.raw, c);
    assert.ok(result.top.every(t => /^[A-Z]$/.test(t.letter) && !['J','Z'].includes(t.letter)));
  }
  for (const c of ['F','9']) {
    const result = decodePrediction(logits(c), classes, RECOGNITION_CONFIG, SUPPORTED_SIGNS.learning);
    assert.equal(result.raw, c); assert.equal(result.letter, 'F');
  }
  assert.equal(decodePrediction(logits('G'), classes, RECOGNITION_CONFIG, SUPPORTED_SIGNS.learning).letter, null, 'excluded letters are never accepted');
  const split = classes.map(c => c === '9' || c === 'F' ? 5 : c === 'W' ? 5.5 : -20);
  assert.equal(decodePrediction(split, classes, { confidence: .5, margin: .05 }, ['F','W']).letter, 'F', '9 and F probabilities combine');
  assert.equal(decodePrediction(Array(36).fill(1), classes, RECOGNITION_CONFIG, SUPPORTED_SIGNS.learning).letter, null);
  assert.equal(decodePrediction(logits('A'), classes, { confidence: .85, margin: 1.1 }, ['A']).letter, null);
});

test('time-based confirmation, no-hand reset, unknown, release and stale frames', () => {
  const s = new TemporalSmoother();
  for (let now = 0; now < 900; now += 100) assert.equal(s.update('A', now).isNew, false);
  assert.equal(s.update('A', 900).isNew, true);
  assert.equal(s.update('B', 1000).isNew, false);
  assert.equal(s.update(null, 1100, false).status, 'no-hand');
  assert.equal(s.update('A', 1200).progress, 0);
  s.update(null, 1300); s.update(null, 1500); s.update(null, 1700);
  for (let now = 1800; now < 2700; now += 100) s.update('B', now);
  assert.equal(s.update('B', 2700).isNew, true);
  assert.equal(s.update('B', 4000).progress, 0);
  assert.equal(s.update('B', 3900).progress, 0);
});

test('competition generation and submissions enforce approved letters in both modes', () => {
  for (const mode of ['single', 'versus']) {
    const race = new RaceEngine({ mode });
    assert.ok(Array.from({ length: 50 }, (_, i) => race.signAt(i)).every(c => SUPPORTED_SIGNS.competition.includes(c)));
    race.addPlayer('p1'); if (mode === 'versus') race.addPlayer('p2'); race.start(0);
    for (const c of ['THANK YOU','J','Z','G','0']) {
      assert.throws(() => new RaceEngine({ mode, pool: [c] }));
      assert.equal(race.submitLetter('p1', c, 100).accepted, false);
    }
    assert.equal(race.getPlayer('p1').mistakes, 0);
  }
});

test('controller skips concurrent frames and ignores inference after no-hand or disposal', async () => {
  let resolve; let calls = 0; const results = [];
  const c = new RecognitionController({ infer: () => { calls++; return new Promise(r => { resolve = r; }); }, onResult: r => results.push(r) });
  const now = performance.now(); const pending = c.process(points, now);
  await c.process(points, now + 100); assert.equal(calls, 1);
  await c.process(null, now + 101);
  resolve({ logits: logits('A'), classes, latencyMs: 1 }); await pending;
  assert.equal(results.length, 1); assert.equal(results[0].status, 'no-hand');
  const second = c.process(points, now + 200); c.dispose();
  resolve({ logits: logits('A'), classes, latencyMs: 1 }); await second;
  assert.equal(results.length, 1); await c.process(points, now + 300); assert.equal(calls, 2);
});

test('left hands are reflected into the model hand; right and unknown hands are unchanged', async () => {
  assert.deepEqual(canonicalHand(points, 'Left').map(p => p.x), points.map(p => -p.x));
  for (const handedness of ['Right', null]) assert.equal(canonicalHand(points, handedness), points);
  const inputs = [];
  const c = new RecognitionController({ infer: async input => { inputs.push(input); return { logits: logits('A'), classes, latencyMs: 1 }; }, onResult: () => {} });
  await c.process(points, 0, { handedness: 'Right' });
  await c.process(points, 100, { handedness: 'Left' });
  assert.deepEqual(inputs[0], normalizeLandmarks(points));
  assert.deepEqual(inputs[1], normalizeLandmarks(points.map(p => ({ ...p, x: -p.x }))));
  c.dispose();
});

test('actual downloaded ONNX executes with CPU WASM and returns 36 finite logits', async () => {
  const ort = await import('onnxruntime-web');
  ort.env.wasm.numThreads = 1;
  const model = await readFile(new URL('../public/models/asl/mlp_asl.onnx', import.meta.url));
  const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
  try {
    const output = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', normalizeLandmarks(points), [1,63]) });
    const tensor = output[session.outputNames[0]];
    assert.deepEqual(tensor.dims, [1,36]);
    assert.equal(tensor.data.length, classes.length);
    assert.ok(Array.from(tensor.data).every(Number.isFinite));
  } finally { await session.release(); }
});
