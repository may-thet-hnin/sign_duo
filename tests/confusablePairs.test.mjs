import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canonicalHand, decodePrediction } from '../src/recognition/preprocessing.js';
import { resolveConfusablePair } from '../src/recognition/confusablePairs.js';
import { RECOGNITION_CONFIG, SUPPORTED_SIGNS } from '../src/recognition/config.js';

const classes = JSON.parse(await readFile(new URL('../public/models/asl/mlp_classes.json', import.meta.url)));
const { samples } = JSON.parse(await readFile(new URL('./fixtures/referenceLandmarks.json', import.meta.url)));
const hand = s => canonicalHand(s.points.map(([x, y, z]) => ({ x, y, z })), s.handedness);
// A model output that is sure of `letter` (or split between two letters).
const predict = (weights) => decodePrediction(classes.map(c => weights[c] ?? -20), classes, RECOGNITION_CONFIG, SUPPORTED_SIGNS.learning);
const PARTNER = { D: 'L', L: 'D', A: 'S', S: 'A' };

test('a confident wrong answer within D/L or A/S is corrected by the real hand shape', () => {
  for (const [letter, partner] of Object.entries(PARTNER)) {
    const rows = samples.filter(s => s.letter === letter);
    assert.ok(rows.length >= 8, letter);
    for (const s of rows) {
      const fixed = resolveConfusablePair(predict({ [partner]: 20 }), hand(s), RECOGNITION_CONFIG, SUPPORTED_SIGNS.learning);
      assert.equal(fixed.letter, letter, `${s.image} (${letter}) read as ${partner}`);
      assert.match(fixed.pairCheck, /thumb check/);
    }
  }
});

test('a split between the pair is settled by the hand shape instead of being rejected', () => {
  const d = samples.find(s => s.letter === 'D');
  const split = predict({ D: 5, L: 5.2 });
  assert.equal(split.letter, null, 'too close for the confidence margin on its own');
  assert.equal(resolveConfusablePair(split, hand(d), RECOGNITION_CONFIG, SUPPORTED_SIGNS.learning).letter, 'D');
});

test('correct answers, other letters and unsure models are left alone', () => {
  for (const letter of ['D', 'L', 'A', 'S']) {
    const s = samples.find(x => x.letter === letter);
    const right = predict({ [letter]: 20 });
    assert.equal(resolveConfusablePair(right, hand(s), RECOGNITION_CONFIG, SUPPORTED_SIGNS.learning), right);
  }
  const v = samples.find(s => s.letter === 'V');
  const other = predict({ V: 20 });
  assert.equal(resolveConfusablePair(other, hand(v), RECOGNITION_CONFIG, SUPPORTED_SIGNS.learning), other);
  // Model unsure about the pair as a whole: no override.
  const unsure = predict({ L: 3, V: 3, W: 3 });
  assert.equal(resolveConfusablePair(unsure, hand(samples.find(s => s.letter === 'D')), RECOGNITION_CONFIG, SUPPORTED_SIGNS.learning), unsure);
  // In races A/S may be offered while D is not: never answer with a letter outside the allowlist.
  const noD = resolveConfusablePair(predict({ L: 20 }), hand(samples.find(s => s.letter === 'D')), RECOGNITION_CONFIG, ['L', 'A']);
  assert.equal(noD.letter, 'L');
});
