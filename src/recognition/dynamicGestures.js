import { motionHandFeatures } from '../utils/handGeometry.js';
import { MotionStroke } from './motionStroke.js';
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
    this.history = []; this.state = null; this.lastAt = null; this.releaseAt = null; this.invalidAt = null;
  }
  update(points, now, target = null) {
    const f = motionHandFeatures(points);
    if (!f || !Number.isFinite(now)) { this.reset(); return pending(); }
    if (this.lastAt !== null && (now <= this.lastAt || now - this.lastAt > RECOGNITION_CONFIG.maxGapMs)) this.reset(true);
    this.lastAt = now;
    const { index: i, middle: m, ring: r, pinky: p } = f.fingers;
    const fist = [i, m, r, p].every(v => v.motionFolded) && !f.thumbAbducted;
    const open = [i, m, r, p].every(v => v.motionExtended);
    const noBase = r.motionFolded && p.motionFolded && f.distance(8, 12) < .85 &&
      Math.abs(f.distance(4, 8) - f.distance(4, 12)) < .5;
    const noOpen = noBase && i.motionExtended && m.motionExtended && f.distance(4, 8) > .6 && f.distance(4, 12) > .6;
    const noClosed = noBase && f.distance(4, 8) < .5 && f.distance(4, 12) < .5;
    const word = target ?? this.state?.word ?? (noOpen || noClosed && this.lockedWord === 'NO' ? 'NO' : fist ? 'YES' : open ? 'HELLO' : null);
    const poseValid = word === 'YES' ? fist : word === 'HELLO' ? open : noBase && (!this.state ? noOpen || noClosed : true);

    if (this.lockedWord === word) {
      // NO re-arms by reopening both fingers; other words need a different pose
      // or a brief hand release. Holding the endpoint never repeats an event.
      if (word === 'NO' && noOpen) {
        this.releaseAt ??= now;
        if (now - this.releaseAt >= 240) this.lockedWord = null;
      } else if (!poseValid) {
        this.releaseAt ??= now;
        if (now - this.releaseAt >= RECOGNITION_CONFIG.releaseMs) this.lockedWord = null;
      } else this.releaseAt = null;
      if (this.lockedWord) return { ...pending(word), lockedLetter: word };
    } else if (word && word !== this.lockedWord) this.lockedWord = null;
    if (!word || !poseValid) {
      this.invalidAt ??= now;
      if (this.state && now - this.invalidAt <= 180) return pending(word, this.state.progress, 'keep moving');
      this.state = null; this.history = []; return pending();
    }
    this.invalidAt = null;

    const sample = { now, x: f.wrist.x, y: f.wrist.y, width: f.width,
      nod: (f.knuckleY - f.wrist.y) / f.width,
      nodAngle: Math.atan2(f.knuckleZ - f.wrist.z, f.wrist.y - f.knuckleY),
      side: (f.knuckleX - f.wrist.x) / f.width,
      gap: (f.distance(4, 8) + f.distance(4, 12)) / 2 };
    this.history.push(sample);
    this.history = this.history.filter(s => now - s.now <= 3500).slice(-30);
    if (!this.state) {
      if (word === 'NO' && !noOpen) return pending();
      this.state = { word, start: sample, startSamples: 0, endpoints: 0, bent: false, progress: .1, stroke: new MotionStroke(word === 'YES' ? .3 : word === 'NO' ? .4 : .6), returnStroke: new MotionStroke(.3), peakBend: 0 };
    }
    const s = this.state, a = s.start;
    sample.nod *= sample.width / a.width;
    sample.side *= sample.width / a.width;
    sample.gap *= sample.width / a.width;
    const dx = (sample.x - a.x) / a.width, dy = (sample.y - a.y) / a.width;
    const previous = this.history.at(-2);
    if (previous && (Math.hypot(sample.x - previous.x, sample.y - previous.y) / a.width > Math.max(.45, (now - previous.now) * .006) ||
        Math.abs(sample.nod - previous.nod) > Math.max(.45, (now - previous.now) * .006) || Math.abs(sample.gap - previous.gap) > .7)) {
      this.state = null; this.history = []; return pending();
    }
    if (sample.width / a.width < .5 || sample.width / a.width > 1.8 || now - a.now > 3500) {
      this.state = null; this.history = []; return pending();
    }
    s.startSamples++;
    let endpoint;
    let progress;
    let phase;
    if (word === 'HELLO') {
      if (Math.abs(dy) > 1.1 || Math.abs(dx) > 3.5 || (s.direction && dx * s.direction < -.1)) {
        this.state = null; return pending();
      }
      if (Math.abs(dx) > .2) s.direction ??= Math.sign(dx);
      if (s.direction && previous && (sample.x - previous.x) / a.width * s.direction < -.15) {
        this.state = null; return pending();
      }
      s.stroke.observe(Math.abs(dx));
      endpoint = s.stroke.complete;
      progress = .1 + .8 * s.stroke.progress;
      phase = s.stroke.progress > .8 ? 'trajectory' : s.stroke.progress > 0 ? 'moving' : 'start';
    } else if (word === 'YES') {
      // Fist nod measured relative to wrist: translating a stationary fist
      // vertically cannot satisfy this. Require bend down, then return.
      if (Math.hypot(dx, dy) > 1.1 || Math.abs(sample.side - a.side) > .6) { this.state = null; return pending(); }
      const bend = Math.abs(Math.atan2(Math.sin(sample.nodAngle - a.nodAngle), Math.cos(sample.nodAngle - a.nodAngle)));
      s.stroke.observe(bend);
      s.peakBend = Math.max(s.peakBend, bend);
      if (s.stroke.complete && Math.abs(sample.nod - a.nod) > .12) s.bent = true;
      s.returnStroke.distance = Math.max(.15, s.peakBend - .2);
      if (s.bent) s.returnStroke.observe(s.peakBend - bend);
      progress = s.bent ? .5 + .4 * s.returnStroke.progress : .1 + .4 * s.stroke.progress;
      phase = s.bent ? 'returning' : bend > .03 ? 'bending' : 'start';
      endpoint = s.bent && s.returnStroke.complete && Math.abs(sample.nod - a.nod) < .25 && bend < .25;
    } else {
      if (Math.hypot(dx, dy) > .9) { this.state = null; return pending(); }
      s.stroke.observe(a.gap - sample.gap);
      endpoint = noClosed && s.stroke.complete;
      progress = .1 + .8 * s.stroke.progress;
      phase = s.stroke.progress > .8 ? 'approaching' : s.stroke.progress > 0 ? 'closing' : 'start';
      if (previous && sample.gap - previous.gap > .25) { this.state = null; this.history = []; return pending(); }
    }
    s.endpoints = endpoint ? s.endpoints + 1 : 0;
    if (s.startSamples >= 5 && now - a.now >= 240 && s.endpoints >= 2) {
      this.lockedWord = word; this.state = null; this.history = [];
      return { letter: word, candidate: word, status: 'stable', progress: 1, isNew: true,
        lockedLetter: word, quality: 1, simplified: word === 'HELLO', phase: 'complete', kind: 'dynamic' };
    }
    s.progress = Math.max(s.progress, progress);
    return pending(word, s.progress, phase);
  }
}
