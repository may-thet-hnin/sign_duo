// Experimental practice vocabulary; webcam accuracy has not been measured.
export const STARTER_SIGNS = Object.freeze(['A', 'B', 'L']);
export const ALPHABET_SIGNS = Object.freeze('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''));
export const MOTION_LETTERS = Object.freeze(['J', 'Z']);
export const WORD_SIGNS = Object.freeze(['HELLO', 'YES', 'NO']);
export const LESSON_GROUPS = Object.freeze([
  { id: 'getting-started', title: 'Getting started', category: 'alphabet', signs: STARTER_SIGNS, quiz: ['B', 'L', 'A'] },
  { id: 'handshape-basics', title: 'Handshape basics', category: 'alphabet', signs: ['C', 'D', 'I'], quiz: ['D', 'I', 'C'] },
  { id: 'finger-combinations', title: 'Finger combinations', category: 'alphabet', signs: ['V', 'W', 'Y'], quiz: ['W', 'Y', 'V'] },
  { id: 'closed-hand', title: 'Closed hand shapes', category: 'alphabet', signs: ['E', 'M', 'N'], quiz: ['N', 'M', 'E'] },
  { id: 'thumb-placement', title: 'Thumb placement', category: 'alphabet', signs: ['S', 'T', 'O'], quiz: ['O', 'T', 'S'] },
  { id: 'sideways-shapes', title: 'Sideways shapes', category: 'alphabet', signs: ['G', 'H', 'Q'], quiz: ['Q', 'H', 'G'] },
  { id: 'finger-details', title: 'Finger details', category: 'alphabet', signs: ['F', 'R', 'U'], quiz: ['U', 'R', 'F'] },
  { id: 'bent-fingers', title: 'Bent and angled fingers', category: 'alphabet', signs: ['K', 'P', 'X'], quiz: ['X', 'P', 'K'] },
  { id: 'moving-letters', title: 'Moving letters', category: 'alphabet', signs: ['J', 'Z'], quiz: ['Z', 'J'] },
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
