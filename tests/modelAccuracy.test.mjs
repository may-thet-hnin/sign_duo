import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeLandmarks, canonicalHand, decodePrediction } from '../src/recognition/preprocessing.js';
import { resolveConfusablePair } from '../src/recognition/confusablePairs.js';
import { ALPHABET_SIGNS, RECOGNITION_CONFIG, SUPPORTED_SIGNS } from '../src/recognition/config.js';

// Real MediaPipe landmarks from reference photos (one signer, not webcam).
// This measures the model through the app's own preprocessing and decoding;
// it does not establish live webcam accuracy.
const classes = JSON.parse(await readFile(new URL('../public/models/asl/mlp_classes.json', import.meta.url)));
const { samples } = JSON.parse(await readFile(new URL('./fixtures/referenceLandmarks.json', import.meta.url)));
const EXCLUDED = ['G', 'H', 'K', 'P', 'Q', 'T', 'U', 'X'];

async function evaluate({ canonical = true, allowlist = SUPPORTED_SIGNS.learning } = {}) {
  const ort = await import('onnxruntime-web');
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(await readFile(new URL('../public/models/asl/mlp_asl.onnx', import.meta.url)), { executionProviders: ['wasm'] });
  try {
    const results = [];
    for (const sample of samples) {
      const points = sample.points.map(([x, y, z]) => ({ x, y, z }));
      const hand = canonical ? canonicalHand(points, sample.handedness) : points;
      const output = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', normalizeLandmarks(hand), [1, 63]) });
      // The same decode and D/L, A/S thumb check the app uses.
      const prediction = resolveConfusablePair(decodePrediction(output[session.outputNames[0]].data, classes, RECOGNITION_CONFIG, allowlist),
        hand, RECOGNITION_CONFIG, allowlist);
      results.push({ ...sample, top: prediction.top[0].letter, accepted: prediction.letter });
    }
    return results;
  } finally { await session.release(); }
}

const byLetter = (results, letters) => Object.fromEntries(letters.map(letter => {
  const rows = results.filter(r => r.letter === letter);
  return [letter, rows.filter(r => r.top === letter).length / rows.length];
}));

test('every offered letter has real-photo evidence and is classified correctly', async () => {
  const results = await evaluate();
  const offered = results.filter(r => ALPHABET_SIGNS.includes(r.letter));
  assert.deepEqual(new Set(offered.map(r => r.letter)), new Set(ALPHABET_SIGNS), 'each offered letter needs samples');
  const overall = offered.filter(r => r.top === r.letter).length / offered.length;
  assert.ok(overall >= .9, `offered-letter top-1 accuracy ${overall}`);
  // C's side-view reference photo fails; its front-view photo passes on every variant.
  for (const [letter, accuracy] of Object.entries(byLetter(results, ALPHABET_SIGNS))) {
    assert.ok(accuracy >= .5, `${letter} top-1 accuracy ${accuracy}`);
  }
  // A confident, accepted answer that names another offered letter costs a heart in a race.
  const wrongAccepted = offered.filter(r => r.accepted && r.accepted !== r.letter);
  assert.ok(wrongAccepted.length / offered.length <= .03, `wrong acceptances ${wrongAccepted.length}`);
});

test('letters left out of the game could not be completed or would be confused', async () => {
  // Decode as if every static letter were offered, then check each exclusion.
  const results = await evaluate({ allowlist: [...ALPHABET_SIGNS, ...EXCLUDED] });
  for (const letter of EXCLUDED.filter(l => results.some(r => r.letter === l))) {
    const rows = results.filter(r => r.letter === letter);
    const completed = rows.filter(r => r.accepted === letter).length / rows.length;
    const confused = rows.filter(r => r.accepted && r.accepted !== letter).length / rows.length;
    // T rarely reaches the confidence gate; U is confidently read as R; the rest are misread.
    assert.ok(completed <= .25 || confused >= .25, `${letter}: completed ${completed}, confused ${confused}; re-evaluate whether to offer it`);
  }
  assert.ok(EXCLUDED.every(letter => !SUPPORTED_SIGNS.learning.includes(letter)));
});

test('left hands work only after reflection to the model hand', async () => {
  const accuracy = rows => rows.filter(r => r.top === r.letter).length / rows.length;
  const mirroredOffered = r => r.mirrored && ALPHABET_SIGNS.includes(r.letter);
  const canonical = (await evaluate()).filter(mirroredOffered);
  const raw = (await evaluate({ canonical: false })).filter(mirroredOffered);
  assert.ok(accuracy(canonical) >= .9, `mirrored with reflection ${accuracy(canonical)}`);
  assert.ok(accuracy(raw) < .5, `mirrored without reflection ${accuracy(raw)}`);
});
