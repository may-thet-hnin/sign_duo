export function summarizeAttempt(samples, expected, startedAt, endedAt, target = expected) {
  const stable = samples.filter(s => s.status === 'stable');
  const correct = samples.filter(s => expected !== 'UNKNOWN' && s.raw === expected);
  const first = stable.find(s => expected !== 'UNKNOWN' && s.letter === expected);
  const methods = [...new Set(samples.map(s => s.method).filter(Boolean))];
  return { samples: samples.length, durationMs: endedAt - startedAt, methods,
    rawCorrectFraction: expected === 'UNKNOWN' || !samples.length ? null : correct.length / samples.length,
    stableFraction: samples.length ? stable.length / samples.length : null,
    acceptedCorrect: Boolean(first),
    falseAcceptance: stable.some(s => expected === 'UNKNOWN' || s.letter !== expected),
    wrongTargetAcceptance: expected !== target && stable.some(s => s.letter === target),
    firstCorrectLatencyMs: first ? first.timestamp - startedAt : null,
    averageInferenceMs: samples.filter(s => Number.isFinite(s.latencyMs)).reduce((a, s) => a + s.latencyMs, 0) /
      (samples.filter(s => Number.isFinite(s.latencyMs)).length || 1),
    legacyCorrectFraction: expected === 'UNKNOWN' || !samples.length ? null : samples.filter(s => s.legacy === expected).length / samples.length,
  };
}
