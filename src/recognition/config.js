// Experimental practice vocabulary; webcam accuracy has not been measured.
export const STARTER_SIGNS = Object.freeze(['A', 'B', 'L']);
export const ALPHABET_SIGNS = Object.freeze(['A', 'B', 'C', 'D', 'I', 'L', 'V', 'W', 'Y']);
export const WORD_SIGNS = Object.freeze(['HELLO', 'YES', 'NO']);
export const LESSON_GROUPS = Object.freeze([
  { id: 'getting-started', title: 'Getting started', category: 'alphabet', signs: STARTER_SIGNS, quiz: ['B', 'L', 'A'] },
  { id: 'handshape-basics', title: 'Handshape basics', category: 'alphabet', signs: ['C', 'D', 'I'], quiz: ['D', 'I', 'C'] },
  { id: 'finger-combinations', title: 'Finger combinations', category: 'alphabet', signs: ['V', 'W', 'Y'], quiz: ['W', 'Y', 'V'] },
  { id: 'everyday-words', title: 'Everyday words', category: 'words', signs: WORD_SIGNS, quiz: ['YES', 'NO', 'HELLO'] },
].map(lesson => Object.freeze({ ...lesson, signs: Object.freeze([...lesson.signs]), quiz: Object.freeze([...lesson.quiz]) })));
export const SUPPORTED_SIGNS = Object.freeze({
  learning: Object.freeze([...ALPHABET_SIGNS, ...WORD_SIGNS]),
  competition: Object.freeze([...ALPHABET_SIGNS, ...WORD_SIGNS]),
});
export const CHALLENGE_SEQUENCES = Object.freeze({
  alphabet: Object.freeze([...ALPHABET_SIGNS, 'A', 'B', 'L']),
  words: Object.freeze(['HELLO', 'YES', 'NO', 'YES', 'NO', 'HELLO']),
  mixed: Object.freeze([...ALPHABET_SIGNS, ...WORD_SIGNS]),
});
export const RECOGNITION_CONFIG = Object.freeze({
  confidence: 0.85, margin: 0.15, windowSize: 12, minimumSamples: 8,
  agreement: 0.8, durationMs: 900, maxGapMs: 350, releaseMs: 400,
  intervalMs: 80,
});
export const RACE_DURATIONS = Object.freeze([30, 60, 90, 120]);
