// Geometry checks for letter pairs the model mixes up on webcams. Each one
// runs only when the model's top letter is in the pair, and overrides it only
// when the thumb position is decisive; in between, the model's answer stands.
//
// Distances are in palm widths (index to little-finger knuckle), measured on
// the canonical (reflected, aspect-corrected) hand. Ranges below are from the
// real reference-photo landmarks in tests/fixtures/referenceLandmarks.json.

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

const PAIRS = [
  {
    // D: the thumb tip touches the middle fingertip (0.20-0.35).
    // L: the thumb points away from it (1.52-1.61).
    letters: ['D', 'L'],
    decide(p, width) {
      const gap = distance(p[4], p[12]) / width;
      return gap < .8 ? 'D' : gap > 1.1 ? 'L' : null;
    },
  },
  {
    // S: the thumb crosses the fingers, its tip by the middle finger's middle
    // knuckle (0.12-0.31). A: the thumb rests beside the index (0.41-0.67).
    letters: ['A', 'S'],
    decide(p, width) {
      const gap = distance(p[4], p[10]) / width;
      return gap < .34 ? 'S' : gap > .38 ? 'A' : null;
    },
  },
];

/**
 * Settle a model prediction for a confusable pair. Returns the corrected
 * prediction, with `pairCheck` naming the rule when it changed the answer.
 * `points` must be the same canonical hand the model was given.
 */
export function resolveConfusablePair(prediction, points, config, allowlist) {
  const top = prediction.top?.[0];
  const pair = top && PAIRS.find(rule => rule.letters.includes(top.letter));
  if (!pair || !Array.isArray(points) || points.length !== 21) return prediction;
  const width = distance(points[5], points[17]);
  if (!(width > 1e-6)) return prediction;
  const decided = pair.decide(points, width);
  if (!decided || !allowlist.includes(decided)) return prediction;
  // Accept the pair's letter when the model was at least leaning towards the pair.
  const pairConfidence = prediction.top.filter(t => pair.letters.includes(t.letter)).reduce((sum, t) => sum + t.confidence, 0);
  if (pairConfidence < config.confidence) return prediction;
  if (decided === prediction.letter) return prediction;
  return { ...prediction, letter: decided, pairCheck: `${pair.letters.join('/')} thumb check` };
}
