// Additional letters need webcam evaluation and explicit approval before enabling.
export const SUPPORTED_SIGNS = Object.freeze({
  learning: Object.freeze(['A', 'B', 'L']),
  competition: Object.freeze(['A', 'B', 'L']),
});
export const RECOGNITION_CONFIG = Object.freeze({
  confidence: 0.85, margin: 0.15, windowSize: 12, minimumSamples: 8,
  agreement: 0.8, durationMs: 900, maxGapMs: 350, releaseMs: 400,
  intervalMs: 80,
});
export const RACE_DURATIONS = Object.freeze([30, 60, 90, 120]);
