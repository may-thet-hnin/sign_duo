import { normalizeLandmarks, decodePrediction } from './preprocessing.js';
import { TemporalSmoother } from './temporalSmoothing.js';
import { RECOGNITION_CONFIG, SUPPORTED_SIGNS } from './config.js';
import { recognizeLetter } from '../utils/recognizeLetter.js';
import { recognizeBGeometry } from './bGeometry.js';
let nextControllerId = 0;

export class RecognitionController {
  constructor({ infer, onResult, config = {}, allowlist = SUPPORTED_SIGNS.learning, clock = () => performance.now() }) {
    this.infer = infer; this.onResult = onResult; this.config = { ...RECOGNITION_CONFIG, ...config };
    this.allowlist = allowlist; this.smoother = new TemporalSmoother(this.config);
    this.busy = false; this.disposed = false; this.lastAt = -Infinity; this.generation = 0;
    this.id = ++nextControllerId; this.eventNumber = 0; this.challengeId = null;
    this.clock = clock;
  }
  emit(result) { if (!this.disposed) this.onResult({ method: 'ONNX MLP', ...result }); }
  setChallenge(challengeId) {
    if (this.challengeId !== challengeId) this.generation++;
    this.challengeId = challengeId;
  }
  invalidate(status, now) {
    this.generation++;
    const smoothed = this.smoother.update(null, now, status !== 'no-hand', status !== 'tracking-paused');
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
    const challengeId = this.challengeId;
    try {
      const output = await this.infer(input);
      if (this.disposed || generation !== this.generation) return;
      if (this.clock() - now > this.config.maxGapMs) { this.invalidate('unknown', this.clock()); return; }
      const prediction = decodePrediction(output.logits, output.classes, this.config, this.allowlist);
      // Preserve the previously working B rule. Model confidence remains attached
      // to the model's raw class; geometry does not have a calibrated probability.
      const legacy = recognizeLetter(points);
      const geometryB = recognizeBGeometry(points) && this.allowlist.includes('B');
      const letter = geometryB ? 'B' : prediction.letter;
      const smoothed = this.smoother.update(letter, now);
      const eventId = smoothed.isNew ? `${this.id}:${++this.eventNumber}` : null;
      this.emit({ ...prediction, ...smoothed, timestamp: now, handDetected: true, challengeId, eventId,
        modelLetter: prediction.letter, validatedCandidate: letter,
        method: geometryB ? 'B geometry (experimental); ONNX comparison' : 'ONNX MLP',
        legacy, latencyMs: output.latencyMs });
    } catch (error) { this.smoother.reset(); this.emit({ status: 'error', letter: null, progress: 0, isNew: false, error: error.message }); }
    finally { this.busy = false; }
  }
  dispose() { this.disposed = true; this.generation++; this.smoother.reset(); }
}
