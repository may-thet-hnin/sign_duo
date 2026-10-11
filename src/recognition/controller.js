import { normalizeLandmarks, decodePrediction } from './preprocessing.js';
import { TemporalSmoother } from './temporalSmoothing.js';
import { RECOGNITION_CONFIG, SUPPORTED_SIGNS, WORD_SIGNS, MOTION_LETTERS } from './config.js';
import { recognizeLetter } from '../utils/recognizeLetter.js';
import { recognizeBGeometry } from './bGeometry.js';
import { recognizeStaticGeometry } from './staticGeometry.js';
import { DynamicGestureRecognizer } from './dynamicGestures.js';
import { MotionLetterRecognizer } from './motionLetters.js';
import { metricLandmarks } from '../utils/handGeometry.js';
let nextControllerId = 0;

export class RecognitionController {
  constructor({ infer, onResult, config = {}, allowlist = SUPPORTED_SIGNS.learning, clock = () => performance.now() }) {
    this.infer = infer; this.onResult = onResult; this.config = { ...RECOGNITION_CONFIG, ...config };
    this.allowlist = allowlist; this.smoother = new TemporalSmoother(this.config);
    this.busy = false; this.disposed = false; this.lastAt = -Infinity; this.generation = 0;
    this.id = ++nextControllerId; this.eventNumber = 0; this.challengeId = null;
    this.clock = clock; this.missingSince = null;
    this.motionLetters = new MotionLetterRecognizer(); this.dynamic = new DynamicGestureRecognizer(); this.targetSign = null;
  }
  emit(result) { if (!this.disposed) this.onResult({ method: 'ONNX MLP', ...result }); }
  setChallenge(challengeId) {
    if (this.challengeId !== challengeId) {
      this.generation++; this.missingSince = null; this.dynamic.reset(true); this.motionLetters.reset(true);
      const locked = this.smoother.lockedLetter;
      this.smoother.reset(); this.smoother.lockedLetter = locked;
    }
    this.challengeId = challengeId;
  }
  setTarget(sign) {
    if (sign !== this.targetSign) {
      this.generation++; this.missingSince = null; this.dynamic.reset(true); this.motionLetters.reset(true);
      const isMotion = target => WORD_SIGNS.includes(target) || MOTION_LETTERS.includes(target);
      if (isMotion(sign) !== isMotion(this.targetSign)) this.smoother.reset();
    }
    this.targetSign = sign;
  }
  invalidate(status, now) {
    this.generation++;
    this.dynamic.reset(status === 'tracking-paused'); this.motionLetters.reset(status === 'tracking-paused');
    const smoothed = this.smoother.update(null, now, status !== 'no-hand', status !== 'tracking-paused');
    this.emit({ ...smoothed, status, timestamp: now, handDetected: status !== 'no-hand', top: [], raw: null });
  }
  async process(points, now, { aspectRatio = 1 } = {}) {
    if (this.disposed) return;
    const motionTarget = WORD_SIGNS.includes(this.targetSign) || MOTION_LETTERS.includes(this.targetSign);
    if (!points) {
      if (motionTarget) {
        this.missingSince ??= now;
        // One dropped tracking frame must not erase the stroke. Never score a
        // missing observation; longer loss still discards partial motion.
        if (now - this.missingSince <= 180) {
          this.emit({ status: 'no-hand', letter: null, progress: 0, isNew: false,
            handDetected: false, timestamp: now, challengeId: this.challengeId, kind: 'dynamic' });
          return;
        }
      }
      this.invalidate('no-hand', now); return;
    }
    if (this.missingSince !== null) {
      if (now - this.missingSince > 180) { this.dynamic.reset(true); this.motionLetters.reset(true); }
      this.missingSince = null;
    }
    const input = normalizeLandmarks(points);
    if (!input) { this.invalidate('unknown', now); return; }
    if (points.some(p => p.x <= 0 || p.x >= 1 || p.y <= 0 || p.y >= 1)) { this.invalidate('out-of-frame', now); return; }
    const geometryPoints = metricLandmarks(points, aspectRatio);
    if (!geometryPoints) { this.invalidate('unknown', now); return; }
    // Feed every tracked video frame into the trajectory, including frames
    // arriving while a stale static-model request is finishing.
    if (now <= this.lastAt || !motionTarget && (this.busy || now - this.lastAt < this.config.intervalMs)) return;
    if (motionTarget) {
      this.lastAt = now;
      const result = MOTION_LETTERS.includes(this.targetSign)
        ? this.motionLetters.update(geometryPoints, now, this.targetSign) : this.dynamic.update(geometryPoints, now, this.targetSign);
      const allowed = !result.letter || this.allowlist.includes(result.letter);
      this.emit({ ...result, ...(allowed ? {} : { letter: null, isNew: false, status: 'unknown' }),
        timestamp: now, handDetected: true, challengeId: this.challengeId,
        eventId: allowed && result.isNew ? `${this.id}:${++this.eventNumber}` : null,
        method: result.simplified ? 'HELLO simplified motion practice' : 'Temporal hand geometry',
        top: [], raw: null });
      return;
    }
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
      const geometry = recognizeStaticGeometry(geometryPoints);
      const added = geometry.letter && this.allowlist.includes(geometry.letter) ? geometry.letter : null;
      // New static letters use the existing full-alphabet MLP. The original
      // geometry letters retain their contact/curl validation path.
      const uncertain = geometry.uncertain && !(prediction.letter === 'L' && legacy === 'L');
      const modelAdded = prediction.letter && 'EFGHKMNOPQRSTUX'.includes(prediction.letter) ? prediction.letter : null;
      const contactGeometry = added === 'E' || added === 'F';
      const letter = (contactGeometry ? added : null) || modelAdded || added || (uncertain ? null : geometryB ? 'B' :
        (['A', 'B', 'L'].includes(prediction.letter) ? prediction.letter : null));
      const smoothed = this.smoother.update(letter, now);
      const eventId = smoothed.isNew ? `${this.id}:${++this.eventNumber}` : null;
      this.emit({ ...prediction, ...smoothed, timestamp: now, handDetected: true, challengeId, eventId,
        modelLetter: prediction.letter, validatedCandidate: letter,
        method: contactGeometry ? `${added} geometry (experimental); ONNX comparison` : modelAdded ? 'ONNX MLP' : added ? 'Static geometry (experimental); ONNX comparison' : geometryB ? 'B geometry (experimental); ONNX comparison' : 'ONNX MLP',
        quality: (contactGeometry || !modelAdded && added) ? geometry.quality : null,
        legacy, latencyMs: output.latencyMs });
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      this.smoother.reset(); this.emit({ status: 'error', letter: null, progress: 0, isNew: false, error: error.message });
    }
    finally { this.busy = false; }
  }
  dispose() { this.disposed = true; this.generation++; this.smoother.reset(); this.dynamic.reset(); this.motionLetters.reset(); }
}
