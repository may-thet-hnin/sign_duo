import { normalizeLandmarks, decodePrediction } from './preprocessing.js';
import { TemporalSmoother } from './temporalSmoothing.js';
import { RECOGNITION_CONFIG, SUPPORTED_SIGNS } from './config.js';
import { recognizeLetter } from '../utils/recognizeLetter.js';

export class RecognitionController {
  constructor({ infer, onResult, config = {}, allowlist = SUPPORTED_SIGNS.learning }) {
    this.infer = infer; this.onResult = onResult; this.config = { ...RECOGNITION_CONFIG, ...config };
    this.allowlist = allowlist; this.smoother = new TemporalSmoother(this.config);
    this.busy = false; this.disposed = false; this.lastAt = -Infinity; this.generation = 0;
  }
  emit(result) { if (!this.disposed) this.onResult({ method: 'ONNX MLP', ...result }); }
  invalidate(status, now) {
    this.generation++;
    const smoothed = this.smoother.update(null, now, status !== 'no-hand');
    this.emit({ ...smoothed, status, timestamp: now, handDetected: status !== 'no-hand', top: [], raw: null });
  }
  async process(points, now) {
    if (this.disposed) return;
    if (!points) { this.invalidate('no-hand', now); return; }
    const input = normalizeLandmarks(points);
    if (!input) { this.invalidate('unknown', now); return; }
    if (points.some(p => p.x <= 0 || p.x >= 1 || p.y <= 0 || p.y >= 1)) { this.invalidate('out-of-frame', now); return; }
    if (this.busy || now - this.lastAt < this.config.intervalMs) return;
    this.busy = true; this.lastAt = now;
    const generation = this.generation;
    try {
      const output = await this.infer(input);
      if (this.disposed || generation !== this.generation) return;
      if (performance.now() - now > this.config.maxGapMs) { this.invalidate('unknown', performance.now()); return; }
      const prediction = decodePrediction(output.logits, output.classes, this.config, this.allowlist);
      const smoothed = this.smoother.update(prediction.letter, now);
      this.emit({ ...prediction, ...smoothed, timestamp: now, handDetected: true,
        legacy: recognizeLetter(points), latencyMs: output.latencyMs });
    } catch (error) { this.smoother.reset(); this.emit({ status: 'error', letter: null, progress: 0, isNew: false, error: error.message }); }
    finally { this.busy = false; }
  }
  dispose() { this.disposed = true; this.generation++; this.smoother.reset(); }
}
