import { RECOGNITION_CONFIG } from './config.js';

export class TemporalSmoother {
  constructor(config = {}) { this.config = { ...RECOGNITION_CONFIG, ...config }; this.reset(); }
  reset() { this.history = []; this.candidate = null; this.since = null; this.last = null; this.locked = false; this.releaseAt = null; }
  update(letter, now, handDetected = true) {
    const c = this.config;
    if (!Number.isFinite(now)) { this.reset(); return { letter: null, status: 'unknown', progress: 0, isNew: false }; }
    if (this.last !== null && (now < this.last || now - this.last > c.maxGapMs)) this.reset();
    this.last = now;
    if (!letter) {
      this.history = []; this.candidate = null; this.since = null;
      this.releaseAt ??= now;
      if (now - this.releaseAt >= c.releaseMs) this.locked = false;
      return { letter: null, status: handDetected ? 'unknown' : 'no-hand', progress: 0, agreement: 0, isNew: false };
    }
    this.releaseAt = null;
    if (letter !== this.candidate) { this.candidate = letter; this.since = now; }
    this.history.push(letter);
    if (this.history.length > c.windowSize) this.history.shift();
    const agreement = this.history.filter(v => v === letter).length / this.history.length;
    const progress = Math.min(1, (now - this.since) / c.durationMs);
    const stable = progress >= 1 && this.history.length >= c.minimumSamples && agreement >= c.agreement;
    const isNew = stable && !this.locked;
    if (isNew) this.locked = true;
    return { letter: stable ? letter : null, candidate: letter, status: stable ? 'stable' : 'tentative',
      progress: stable ? 1 : Math.min(progress, .99), agreement, isNew };
  }
}
