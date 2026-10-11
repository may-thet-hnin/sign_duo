// Static letters offered for practice. Each one was classified correctly by the
// ONNX model on real reference-photo landmarks (tests/fixtures/referenceLandmarks.json).
// G, H, K, P, Q, T, U and X were misclassified there and are deliberately not offered.
// J and Z require motion, which a single-frame classifier cannot check.
export const STARTER_SIGNS = Object.freeze(['A', 'B', 'L']);
export const WORD_SIGNS = Object.freeze(['HELLO', 'YES', 'NO']);
export const LESSON_GROUPS = Object.freeze([
  { id: 'getting-started', title: 'Getting started', category: 'alphabet', signs: STARTER_SIGNS, quiz: ['B', 'L', 'A'] },
  { id: 'handshape-basics', title: 'Handshape basics', category: 'alphabet', signs: ['C', 'D', 'I'], quiz: ['D', 'I', 'C'] },
  { id: 'finger-combinations', title: 'Finger combinations', category: 'alphabet', signs: ['V', 'W', 'Y'], quiz: ['W', 'Y', 'V'] },
  { id: 'closed-hands', title: 'Closed hands', category: 'alphabet', signs: ['E', 'S', 'M', 'N'], quiz: ['M', 'E', 'N', 'S'] },
  { id: 'circles-and-crossings', title: 'Circles and crossings', category: 'alphabet', signs: ['O', 'F', 'R'], quiz: ['R', 'O', 'F'] },
  { id: 'everyday-words', title: 'Everyday words', category: 'words', signs: WORD_SIGNS, quiz: ['YES', 'NO', 'HELLO'] },
].map(lesson => Object.freeze({ ...lesson, signs: Object.freeze([...lesson.signs]), quiz: Object.freeze([...lesson.quiz]) })));
export const ALPHABET_SIGNS = Object.freeze(LESSON_GROUPS.filter(l => l.category === 'alphabet').flatMap(l => l.signs));
// E, M and N are closed-fist shapes that are easy to confuse with each other
// and with A/S, so races leave them out for now. Lessons still teach them.
export const COMPETITION_EXCLUDED = Object.freeze(['E', 'M', 'N']);
const COMPETITION_LETTERS = Object.freeze(ALPHABET_SIGNS.filter(letter => !COMPETITION_EXCLUDED.includes(letter)));
export const SUPPORTED_SIGNS = Object.freeze({
  learning: Object.freeze([...ALPHABET_SIGNS, ...WORD_SIGNS]),
  competition: Object.freeze([...COMPETITION_LETTERS, ...WORD_SIGNS]),
});
// Races draw a fresh random sequence from one of these pools every time.
export const COMPETITION_POOLS = Object.freeze({
  alphabet: COMPETITION_LETTERS,
  words: WORD_SIGNS,
  mixed: SUPPORTED_SIGNS.competition,
});
export const POINTS_PER_SIGN = 1;
// Skips each player gets per race (duo players have their own allowance).
export const SKIPS_PER_RACE = 3;
export const RECOGNITION_CONFIG = Object.freeze({
  confidence: 0.85, margin: 0.15, windowSize: 12, minimumSamples: 8,
  agreement: 0.8, durationMs: 900, maxGapMs: 350, releaseMs: 400,
  intervalMs: 80,
});
export const RACE_DURATIONS = Object.freeze([30, 60, 90, 120]);
