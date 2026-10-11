import { RECOGNITION_CONFIG } from './config.js';

export class TemporalSmoother {
  constructor(config = {}) { this.config = { ...RECOGNITION_CONFIG, ...config }; this.reset(); }
  reset() { this.history = []; this.candidate = null; this.since = null; this.last = null; this.lockedLetter = null; this.releaseAt = null; }
  update(letter, now, handDetected = true, allowRelease = true) {
    const c = this.config;
    if (!Number.isFinite(now)) { this.reset(); return { letter: null, status: 'unknown', progress: 0, isNew: false }; }
    if (this.last !== null && (now < this.last || now - this.last > c.maxGapMs)) {
      // A camera stall must not re-arm an identical pose that never released.
      const lockedLetter = this.lockedLetter;
      this.reset(); this.lockedLetter = lockedLetter;
    }
    this.last = now;
    if (!letter) {
      this.history = []; this.candidate = null; this.since = null;
      if (allowRelease) {
        this.releaseAt ??= now;
        if (now - this.releaseAt >= c.releaseMs) this.lockedLetter = null;
      } else this.releaseAt = null;
      return { letter: null, status: handDetected ? 'unknown' : 'no-hand', progress: 0, agreement: 0, isNew: false, lockedLetter: this.lockedLetter };
    }
    this.releaseAt = null;
    if (letter !== this.candidate) { this.candidate = letter; this.since = now; }
    this.history.push(letter);
    if (this.history.length > c.windowSize) this.history.shift();
    const agreement = this.history.filter(v => v === letter).length / this.history.length;
    const progress = Math.min(1, (now - this.since) / c.durationMs);
    const stable = progress >= 1 && this.history.length >= c.minimumSamples && agreement >= c.agreement;
    const isNew = stable && this.lockedLetter !== letter;
    if (isNew) this.lockedLetter = letter;
    return { letter: stable ? letter : null, candidate: letter, status: stable ? 'stable' : 'tentative',
      progress: stable ? 1 : Math.min(progress, .99), agreement, isNew, lockedLetter: this.lockedLetter };
  }
}
