export function normalizeLandmarks(points) {
  if (!Array.isArray(points) || points.length !== 21 || points.some(p =>
    !p || ![p.x, p.y, p.z].every(Number.isFinite))) return null;
  const wrist = points[0];
  const scale = Math.hypot(points[9].x - wrist.x, points[9].y - wrist.y, points[9].z - wrist.z);
  if (scale < 1e-6) return null;
  return Float32Array.from(points.flatMap(p =>
    [(p.x - wrist.x) / scale, (p.y - wrist.y) / scale, (p.z - wrist.z) / scale]));
}

export function validateClasses(classes) {
  if (!Array.isArray(classes) || classes.length !== 36 || new Set(classes).size !== 36 ||
    classes.some(c => typeof c !== 'string' || !/^[0-9A-Z]$/.test(c))) {
    throw new Error('Invalid official ASL class mapping');
  }
  return classes;
}

export function softmax(logits) {
  if (!logits.length || Array.from(logits).some(v => !Number.isFinite(v))) throw new Error('Invalid model logits');
  const max = Math.max(...logits);
  const values = Array.from(logits, v => Math.exp(v - max));
  const sum = values.reduce((a, b) => a + b, 0);
  return values.map(v => v / sum);
}

export function decodePrediction(logits, classes, config, allowlist) {
  validateClasses(classes);
  if (logits.length !== classes.length) throw new Error('Unexpected ASL output shape');
  const top = softmax(logits).map((confidence, i) => ({ letter: classes[i], confidence }))
    .sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  const margin = top[0].confidence - top[1].confidence;
  return { raw: top[0].letter, confidence: top[0].confidence, margin, top,
    letter: top[0].confidence >= config.confidence && margin >= config.margin &&
      allowlist.includes(top[0].letter) ? top[0].letter : null };
}
