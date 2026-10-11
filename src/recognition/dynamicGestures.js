import { handFeatures } from '../utils/handGeometry.js';
import { RECOGNITION_CONFIG } from './config.js';

const pending = (candidate = null, progress = 0, phase = 'waiting') => ({
  letter: null, candidate, progress, status: candidate ? 'tentative' : 'unknown', isNew: false,
  phase, kind: 'dynamic',
});

// Per-camera motion milestones. Completion requires an ordered trajectory and
// two endpoint observations, not a timed static hold at either end.
export class DynamicGestureRecognizer {
  constructor() { this.reset(); }
  reset(preserveLock = false) {
    this.lockedWord = preserveLock ? this.lockedWord : null;
    this.history = []; this.state = null; this.lastAt = null; this.releaseAt = null;
  }
  update(points, now) {
    const f = handFeatures(points);
    if (!f || !Number.isFinite(now)) { this.reset(); return pending(); }
    if (this.lastAt !== null && (now <= this.lastAt || now - this.lastAt > RECOGNITION_CONFIG.maxGapMs)) this.reset(true);
    this.lastAt = now;
    const { index: i, middle: m, ring: r, pinky: p } = f.fingers;
    const fist = [i, m, r, p].every(v => v.folded) && f.thumbClosed;
    const open = [i, m, r, p].every(v => v.extended) && f.thumbOpen;
    const noBase = r.folded && p.folded && f.distance(8, 12) < .6 &&
      Math.abs(f.distance(4, 8) - f.distance(4, 12)) < .35;
    const noOpen = noBase && i.extended && m.extended && f.distance(4, 8) > .8 && f.distance(4, 12) > .8;
    const noClosed = noBase && f.distance(4, 8) < .4 && f.distance(4, 12) < .4;
    const word = this.state?.word ?? (noOpen || noClosed && this.lockedWord === 'NO' ? 'NO' : fist ? 'YES' : open ? 'HELLO' : null);
    const poseValid = word === 'YES' ? fist : word === 'HELLO' ? open : noBase;

    if (this.lockedWord === word) {
      // NO re-arms by reopening both fingers; other words need a different pose
      // or a brief hand release. Holding the endpoint never repeats an event.
      if (word === 'NO' && noOpen) {
        this.releaseAt ??= now;
        if (now - this.releaseAt >= 240) this.lockedWord = null;
      } else this.releaseAt = null;
      if (this.lockedWord) return { ...pending(word), lockedLetter: word };
    } else if (word && word !== this.lockedWord) this.lockedWord = null;
    if (!word || !poseValid) { this.state = null; this.history = []; return pending(); }

    const sample = { now, x: f.wrist.x, y: f.wrist.y, width: f.width,
      nod: (f.knuckleY - f.wrist.y) / f.width,
      nodAngle: Math.atan2(f.knuckleZ - f.wrist.z, f.wrist.y - f.knuckleY),
      side: (f.knuckleX - f.wrist.x) / f.width,
      gap: (f.distance(4, 8) + f.distance(4, 12)) / 2 };
    this.history.push(sample);
    this.history = this.history.filter(s => now - s.now <= 2400).slice(-30);
    if (!this.state) {
      if (word === 'NO' && !noOpen) return pending();
      this.state = { word, start: sample, startSamples: 0, endpoints: 0, movementSamples: 0, bent: false };
    }
    const s = this.state, a = s.start;
    const dx = (sample.x - a.x) / a.width, dy = (sample.y - a.y) / a.width;
    const previous = this.history.at(-2);
    if (previous && (Math.hypot(sample.x - previous.x, sample.y - previous.y) / a.width > .45 ||
        Math.abs(sample.nod - previous.nod) > .45 || Math.abs(sample.gap - previous.gap) > .45)) {
      this.state = null; this.history = []; return pending();
    }
    if (sample.width / a.width < .7 || sample.width / a.width > 1.3 || now - a.now > 2400) {
      this.state = null; this.history = []; return pending();
    }
    s.startSamples++;
    const moving = previous && (word === 'HELLO' ? Math.abs(sample.x - previous.x) / a.width > .025
      : word === 'YES' ? Math.abs(sample.nod - previous.nod) > .025 : Math.abs(sample.gap - previous.gap) > .025);
    if (moving) s.movementSamples++;
    let endpoint;
    let progress = .25;
    let phase = 'start';
    if (word === 'HELLO') {
      if (Math.abs(dy) > .55 || Math.abs(dx) > 2.5 || (s.direction && dx * s.direction < -.1)) {
        this.state = null; return pending();
      }
      if (Math.abs(dx) > .2) s.direction ??= Math.sign(dx);
      if (s.direction && previous && (sample.x - previous.x) / a.width * s.direction < -.15) {
        this.state = null; return pending();
      }
      endpoint = Math.abs(dx) >= .75;
      if (Math.abs(dx) > .15) { progress = .5; phase = 'moving'; }
      if (Math.abs(dx) > .5) { progress = .75; phase = 'trajectory'; }
    } else if (word === 'YES') {
      // Fist nod measured relative to wrist: translating a stationary fist
      // vertically cannot satisfy this. Require bend down, then return.
      if (Math.hypot(dx, dy) > .6 || Math.abs(sample.side - a.side) > .3) { this.state = null; return pending(); }
      if (sample.nod - a.nod > .35 && Math.abs(sample.nodAngle - a.nodAngle) > .35) s.bent = true;
      if (sample.nod - a.nod > .15) { progress = .5; phase = 'bending'; }
      if (s.bent) { progress = .75; phase = 'returning'; }
      endpoint = s.bent && Math.abs(sample.nod - a.nod) < .12 && Math.abs(sample.nodAngle - a.nodAngle) < .2;
    } else {
      if (Math.hypot(dx, dy) > .5) { this.state = null; return pending(); }
      endpoint = noClosed && a.gap - sample.gap > .6;
      if (a.gap - sample.gap > .15) { progress = .5; phase = 'closing'; }
      if (a.gap - sample.gap > .45) { progress = .75; phase = 'approaching'; }
      if (previous && sample.gap - previous.gap > .15) { this.state = null; this.history = []; return pending(); }
    }
    s.endpoints = endpoint ? s.endpoints + 1 : 0;
    if (s.startSamples >= 5 && s.movementSamples >= 3 && now - a.now >= 240 && s.endpoints >= 2) {
      this.lockedWord = word; this.state = null; this.history = [];
      return { letter: word, candidate: word, status: 'stable', progress: 1, isNew: true,
        lockedLetter: word, quality: 1, simplified: word === 'HELLO', phase: 'complete', kind: 'dynamic' };
    }
    return pending(word, progress, phase);
  }
}
