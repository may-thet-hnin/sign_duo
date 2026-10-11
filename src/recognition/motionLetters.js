import { motionHandFeatures } from '../utils/handGeometry.js';
import { MotionStroke } from './motionStroke.js';
import { RECOGNITION_CONFIG } from './config.js';

const pending = (candidate = null, progress = 0, phase = 'start') => ({
  letter: null, candidate, progress, phase, kind: 'dynamic',
  status: candidate ? 'tentative' : 'unknown', isNew: false,
});

// Track ordered fingertip strokes in palm-width units. Each camera owns its
// state. Static handshapes and single-frame jumps cannot complete a letter.
export class MotionLetterRecognizer {
  constructor() { this.reset(); }
  reset(preserveLock = false) {
    this.lockedLetter = preserveLock ? this.lockedLetter : null;
    this.state = null; this.lastAt = null; this.releaseAt = null; this.invalidAt = null;
  }
  update(points, now, letter) {
    const f = motionHandFeatures(points);
    if (!f || !['J', 'Z'].includes(letter) || !Number.isFinite(now)) { this.reset(); return pending(); }
    if (this.lastAt !== null && (now <= this.lastAt || now - this.lastAt > RECOGNITION_CONFIG.maxGapMs)) this.reset(true);
    this.lastAt = now;
    const { index: i, middle: m, ring: r, pinky: p } = f.fingers;
    const valid = letter === 'J' ? p.motionExtended && i.motionFolded && m.motionFolded && r.motionFolded
      : i.motionExtended && m.motionFolded && r.motionFolded && p.motionFolded;
    if (!valid) {
      this.invalidAt ??= now;
      if (this.state && now - this.invalidAt <= 180) return pending(letter, this.state.progress, 'keep tracing');
      this.state = null;
      this.releaseAt ??= now;
      if (now - this.releaseAt >= RECOGNITION_CONFIG.releaseMs) this.lockedLetter = null;
      return pending();
    }
    this.releaseAt = null; this.invalidAt = null;
    if (this.lockedLetter === letter) return { ...pending(letter), lockedLetter: letter };
    const tip = points[letter === 'J' ? 20 : 8];
    const sample = { x: tip.x / f.width, y: tip.y / f.width };
    if (!this.state || this.state.letter !== letter) {
      this.state = { letter, start: sample, previous: sample, width: f.width, direction: Math.sign(points[5].x - points[17].x), at: now, stage: 0, samples: 0, endpoints: 0, stroke: new MotionStroke(letter === 'J' ? .4 : .5), progress: .1 };
    }
    const s = this.state;
    // Use the initial scale so apparent zoom cannot draw a stroke.
    sample.x = tip.x / s.width; sample.y = tip.y / s.width;
    if (now - s.at > 4500 || f.width / s.width < .5 || f.width / s.width > 1.8 ||
        Math.hypot(sample.x - s.previous.x, sample.y - s.previous.y) > Math.max(.65, (now - (s.previousAt ?? s.at)) * .008)) {
      this.state = null; return pending();
    }
    s.samples++;
    // Keep the actual turning point when a stroke continues past its minimum
    // distance. Otherwise the next stroke is measured from an early milestone.
    let dx = sample.x - s.start.x, dy = sample.y - s.start.y;
    const continuing = letter === 'J' && s.stage === 1 && dy > .03 && Math.abs(dx) < .08 ||
      letter === 'Z' && s.stage === 1 && dx * s.direction > .03 && Math.abs(dy) < .1 ||
      letter === 'Z' && s.stage === 2 && dx * s.direction < -.03 && dy > .03;
    if (continuing) { s.start = sample; dx = 0; dy = 0; }
    const stages = letter === 'J' ? 2 : 3;
    if (s.stage < stages) {
      const amount = letter === 'J'
        ? s.stage === 0 ? dy : dx * s.direction
        : s.stage === 0 ? Math.abs(dx) : s.stage === 1 ? Math.min(-dx * s.direction, dy * .4 / .3) : dx * s.direction;
      const onPath = letter === 'J'
        ? s.stage === 0 ? Math.abs(dx) < .75 : dy < .4 && dy > -.8
        : s.stage === 1 ? true : Math.abs(dy) < .45;
      if (onPath) s.stroke.observe(amount);
      s.progress = Math.max(s.progress, .1 + .8 * (s.stage + s.stroke.progress) / stages);
      if (onPath && s.stroke.complete) {
        if (letter === 'Z' && s.stage === 0) s.direction = Math.sign(dx);
        s.stage++; s.start = sample;
        s.stroke = new MotionStroke(letter === 'J' ? .25 : s.stage === 1 ? .4 : .5);
      }
    }
    s.previous = sample; s.previousAt = now;
    const done = s.stage === (letter === 'J' ? 2 : 3);
    s.endpoints = done ? s.endpoints + 1 : 0;
    if (s.endpoints >= 2 && s.samples >= 6 && now - s.at >= 400) {
      this.lockedLetter = letter; this.state = null;
      return { letter, candidate: letter, progress: 1, phase: 'complete', status: 'stable',
        kind: 'dynamic', isNew: true, lockedLetter: letter, quality: 1 };
    }
    return pending(letter, s.progress, letter === 'J'
      ? s.stage ? 'curve inward' : 'move down' : ['first horizontal stroke', 'diagonal down', 'final horizontal stroke', 'finish'][s.stage]);
  }
}
