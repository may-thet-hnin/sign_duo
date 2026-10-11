import { handFeatures } from '../utils/handGeometry.js';
import { RECOGNITION_CONFIG } from './config.js';

const pending = (candidate = null, progress = 0, phase = 'waiting') => ({
  letter: null, candidate, progress, status: candidate ? 'tentative' : 'unknown', isNew: false,
  phase, kind: 'dynamic',
});

const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const clamp = value => Math.max(0, Math.min(1, value));

// Webcam landmarks jitter by a few pixels every frame. A One-Euro filter
// smooths a still hand strongly but follows fast movement with little lag.
// Without it, jitter alone broke YES and NO (simulated 2-3 px noise: 1/40 and 5/40).
const FILTER = { minCutoff: 1.5, beta: 20, dCutoff: 1 };
const smoothing = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
class LandmarkFilter {
  reset() { this.values = null; this.speeds = null; this.at = null; }
  apply(points, now) {
    const raw = points.flatMap(p => [p.x, p.y, p.z ?? 0]);
    const dt = this.values && now > this.at ? (now - this.at) / 1000 : null;
    if (dt === null) {
      this.values = raw; this.speeds = raw.map(() => 0);
    } else {
      const ds = smoothing(FILTER.dCutoff, dt);
      raw.forEach((v, k) => {
        this.speeds[k] += ds * ((v - this.values[k]) / dt - this.speeds[k]);
        this.values[k] += smoothing(FILTER.minCutoff + FILTER.beta * Math.abs(this.speeds[k]), dt) * (v - this.values[k]);
      });
    }
    this.at = now;
    return points.map((_, j) => ({ x: this.values[j * 3], y: this.values[j * 3 + 1], z: this.values[j * 3 + 2] }));
  }
}

// Match observed points along a stroke, not just its displacement. The raw
// series must pass through the interior in distinct steps, so a couple of
// teleporting frames cannot pose as a sweep. Backtracking is measured on the
// smoothed series, ignoring wobble below `deadband`, so jitter while the hand
// is held still before moving does not count. Normalized by the observed
// extent so signing speed does not define the shape.
function matchesStroke(raw, smooth, deadband) {
  if (raw.length < 5) return false;
  const rawExtent = raw.at(-1) - raw[0], extent = smooth.at(-1) - smooth[0];
  if (Math.abs(rawExtent) < .01 || Math.abs(extent) < .01) return false;
  let band = 0, travel = 0, steps = 0, lastStep = 0, anchor = smooth[0];
  const bands = [[.15, .55], [.45, .9]];
  for (let j = 1; j < raw.length; j++) {
    if (Math.abs(smooth[j] - anchor) >= deadband || j === smooth.length - 1) {
      travel += Math.abs(smooth[j] - anchor); anchor = smooth[j];
    }
    const position = (raw[j] - raw[0]) / rawExtent;
    if (band < bands.length && position >= bands[band][0] && position <= bands[band][1]) band++;
    if (Math.abs(position - lastStep) >= .05) { steps++; lastStep = position; }
  }
  return band === bands.length && steps >= 3 && Math.abs(extent) / travel >= .65;
}

// Wrist-to-knuckle orientation in the camera's y-z plane. MediaPipe's
// image z underestimates depth: when it reads half the true depth, a 25° nod
// measures under 10° and YES never completes. World landmarks (metres, axes
// aligned with the camera) keep true depth, so YES prefers them.
const validPoints = points => Array.isArray(points) && points.length === 21 &&
  points.every(p => p && [p.x, p.y, p.z].every(Number.isFinite));
function orientation(p) {
  const k = [5, 9, 13, 17].reduce((sum, i) => ({ x: sum.x + p[i].x / 4, y: sum.y + p[i].y / 4, z: sum.z + p[i].z / 4 }), { x: 0, y: 0, z: 0 });
  const width = Math.hypot(p[5].x - p[17].x, p[5].y - p[17].y, p[5].z - p[17].z) || 1;
  return { nod: (k.y - p[0].y) / width, nodAngle: Math.atan2(k.z - p[0].z, p[0].y - k.y) };
}

// Dynamic handshapes need room for natural curl and tracking variation.
// Keep these tolerances local: static alphabet classification is unchanged.
function classify(f) {
  const { index: i, middle: m, ring: r, pinky: p } = f.fingers;
  const curled = v => v.folded || (v.angle < 145 && v.straightness < .7 && v.reach < 1);
  const extended = v => v.angle > 140 && v.distalAngle > 135 && v.reach > .8;
  const indexGap = f.distance(4, 8), middleGap = f.distance(4, 12);
  const noBase = curled(r) && curled(p) && f.distance(8, 12) < .8 &&
    Math.abs(indexGap - middleGap) < .55;
  return {
    fist: [i, m, r, p].every(curled) && (f.thumbClosed || f.distance(4, 9) < .9),
    // Any flat hand: thumb spread, alongside or tucked. The ASL HELLO salute is a
    // flat B-hand, and requiring a spread thumb rejected it every time.
    open: [i, m, r, p].every(extended),
    noBase,
    noOpen: noBase && extended(i) && extended(m) && indexGap > .7 && middleGap > .7,
    noClosed: noBase && indexGap < .5 && middleGap < .5,
  };
}

// Per-camera trajectories retain every observed motion frame for up to 2.4 s.
export class DynamicGestureRecognizer {
  constructor() { this.filter = new LandmarkFilter(); this.worldFilter = new LandmarkFilter(); this.reset(); }
  reset(preserveLock = false) {
    this.lockedWord = preserveLock ? this.lockedWord : null;
    this.history = []; this.state = null; this.lastAt = null; this.releaseAt = null; this.invalidAt = null;
    this.filter.reset(); this.worldFilter.reset();
  }
  update(points, now, world = null) {
    const raw = handFeatures(points);
    if (!raw || !Number.isFinite(now)) { this.reset(); return pending(); }
    if (this.lastAt !== null && (now <= this.lastAt || now - this.lastAt > RECOGNITION_CONFIG.maxGapMs)) this.reset(true);
    this.lastAt = now;
    if (this.invalidAt !== null && now - this.invalidAt > 160) { this.state = null; this.history = []; }
    // Handshape comes from this frame alone; a stray frame must not leak into
    // the smoothed trajectory of the frames after it.
    const { fist, open, noBase, noOpen, noClosed } = classify(raw);
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
    } else if (this.lockedWord) {
      this.releaseAt ??= now;
      if (now - this.releaseAt >= RECOGNITION_CONFIG.releaseMs) {
        this.lockedWord = null; this.releaseAt = null;
      }
    }
    if (!word || !poseValid) {
      // One uncertain frame should not erase an otherwise continuous motion.
      this.invalidAt ??= now;
      if (now - this.invalidAt > 160) { this.state = null; this.history = []; }
      return pending();
    }
    this.invalidAt = null;

    const smoothed = this.filter.apply(points, now);
    const f = handFeatures(smoothed) ?? raw;
    const indexGap = f.distance(4, 8), middleGap = f.distance(4, 12);
    const hasWorld = validPoints(world);
    if (!hasWorld) this.worldFilter.reset();
    const turn = orientation(hasWorld ? this.worldFilter.apply(world, now) : smoothed);
    const rawTurn = orientation(hasWorld ? world : points);
    const sample = { now, x: f.wrist.x, y: f.wrist.y, width: f.width, depth: hasWorld ? 'world' : 'image',
      nod: turn.nod, nodAngle: turn.nodAngle,
      side: (f.knuckleX - f.wrist.x) / f.width,
      gap: (indexGap + middleGap) / 2, indexGap, middleGap,
      // Unfiltered values: smoothing would turn a tracking glitch into motion.
      rawX: raw.wrist.x, rawY: raw.wrist.y, rawNod: rawTurn.nod, rawNodAngle: rawTurn.nodAngle,
      rawIndexGap: raw.distance(4, 8), rawMiddleGap: raw.distance(4, 12) };
    this.history.push(sample);
    this.history = this.history.filter(s => now - s.now <= 2400).slice(-256);
    if (!this.state) {
      if (word === 'NO' && !noOpen) return pending();
      this.state = { word, start: sample, startSamples: 0, endpoints: 0, movementSamples: 0, travel: 0, bent: false, peak: 0, peakIndex: 0 };
    }
    // Do not compare world and image orientation within one motion.
    if (this.state.start.depth !== sample.depth) { this.state = null; this.history = [sample]; return pending(word); }
    const s = this.state, a = s.start;
    const dx = (sample.x - a.x) / a.width, dy = (sample.y - a.y) / a.width;
    const previous = this.history.at(-2);
    // Tracking glitches jump by about a palm width in one frame. Ordinary
    // jitter on a small, distant hand can reach ~0.4, so stay above that.
    if (previous && (Math.hypot(sample.rawX - previous.rawX, sample.rawY - previous.rawY) / a.width > .8 ||
        Math.abs(sample.rawNod - previous.rawNod) > .6 ||
        Math.abs(sample.rawIndexGap - previous.rawIndexGap) > .6 || Math.abs(sample.rawMiddleGap - previous.rawMiddleGap) > .6)) {
      this.state = null; this.history = []; return pending();
    }
    if (sample.width / a.width < .7 || sample.width / a.width > 1.3 || now - a.now > 2400) {
      this.state = null; this.history = []; return pending();
    }
    s.startSamples++;
    // Accumulate small steps instead of discarding every slow-motion frame.
    // Still require movement on multiple observations, not one large jump.
    if (previous) {
      s.travel += word === 'HELLO' ? Math.abs(sample.x - previous.x) / a.width
        : word === 'YES' ? Math.abs(angleDelta(sample.nodAngle, previous.nodAngle))
          : Math.abs(sample.gap - previous.gap);
      if (s.travel >= .025) { s.movementSamples++; s.travel = 0; }
    }
    let endpoint;
    let motion = null;
    let trajectoryValid;
    let progress;
    let phase = 'start';
    if (word === 'HELLO') {
      if (Math.abs(dy) > Math.max(.65, Math.abs(dx) * .85) || Math.abs(dx) > 2.5 || (s.direction && dx * s.direction < -.1)) {
        this.state = null; this.history = []; return pending();
      }
      if (Math.abs(dx) > .2) s.direction ??= Math.sign(dx);
      if (s.direction && previous && (sample.x - previous.x) / a.width * s.direction < -.15) {
        this.state = null; this.history = []; return pending();
      }
      endpoint = Math.abs(dx) >= .75;
      trajectoryValid = matchesStroke(this.history.map(frame => (frame.rawX - a.rawX) / a.width),
        this.history.map(frame => (frame.x - a.x) / a.width), .05);
      progress = .25 + .65 * clamp(Math.abs(dx) / .75);
      if (Math.abs(dx) > .15) phase = 'moving';
      if (Math.abs(dx) > .5) phase = 'trajectory';
    } else if (word === 'YES') {
      // Fist nod measured relative to wrist: translating a stationary fist
      // vertically cannot satisfy this. Require bend down, then return.
      // About 17° of wrist bend is enough. A knock may move the forearm a
      // little too, so allow some wrist travel; the fist must still bend.
      const bend = Math.abs(angleDelta(sample.nodAngle, a.nodAngle));
      if (Math.hypot(dx, dy) > 1.2 || Math.abs(sample.side - a.side) > .4) { this.state = null; this.history = []; return pending(); }
      if (bend > .3) s.bent = true;
      if (bend > s.peak) { s.peak = bend; s.peakIndex = this.history.length - 1; }
      const angles = this.history.map(frame => angleDelta(frame.nodAngle, a.nodAngle));
      const rawAngles = this.history.map(frame => angleDelta(frame.rawNodAngle, a.rawNodAngle));
      trajectoryValid = s.bent && matchesStroke(rawAngles.slice(0, s.peakIndex + 1), angles.slice(0, s.peakIndex + 1), .03) &&
        matchesStroke(rawAngles.slice(s.peakIndex), angles.slice(s.peakIndex), .03);
      progress = .25 + .35 * clamp(bend / .3);
      motion = { bendDegrees: Math.round(bend * 180 / Math.PI), peakDegrees: Math.round(s.peak * 180 / Math.PI), depth: sample.depth };
      if (bend > .15) phase = 'bending';
      if (s.bent) {
        progress = .6 + .3 * clamp((s.peak - bend) / s.peak);
        phase = s.peak - bend > .05 ? 'returning' : 'bending';
      }
      endpoint = s.bent && Math.abs(sample.nod - a.nod) < .15 && bend < .2;
    } else {
      if (Math.hypot(dx, dy) > .5) { this.state = null; this.history = []; return pending(); }
      endpoint = noClosed && a.indexGap - sample.indexGap > .4 && a.middleGap - sample.middleGap > .4;
      const indexClosure = a.indexGap - sample.indexGap, middleClosure = a.middleGap - sample.middleGap;
      trajectoryValid = endpoint && matchesStroke(this.history.map(frame => frame.rawIndexGap), this.history.map(frame => frame.indexGap), .08) &&
        matchesStroke(this.history.map(frame => frame.rawMiddleGap), this.history.map(frame => frame.middleGap), .08) &&
        // Both fingers close together. Allow a few noisy frames; a finger that
        // lags for a third of the motion still fails.
        this.history.filter(frame => Math.abs((a.indexGap - frame.indexGap) / indexClosure -
          (a.middleGap - frame.middleGap) / middleClosure) >= .4).length <= this.history.length * .1;
      progress = .25 + .65 * clamp(Math.min(indexClosure / Math.max(.4, a.indexGap - .5), middleClosure / Math.max(.4, a.middleGap - .5)));
      if (a.gap - sample.gap > .15) phase = 'closing';
      if (a.gap - sample.gap > .45) phase = 'approaching';
      if (previous && sample.gap - previous.gap > .15) { this.state = null; this.history = []; return pending(); }
    }
    s.endpoints = endpoint ? s.endpoints + 1 : 0;
    if (trajectoryValid && s.startSamples >= 5 && s.movementSamples >= 3 && now - a.now >= 240 && s.endpoints >= 2) {
      this.lockedWord = word; this.state = null; this.history = [];
      return { letter: word, candidate: word, status: 'stable', progress: 1, isNew: true,
        lockedLetter: word, quality: 1, simplified: word === 'HELLO', phase: 'complete', kind: 'dynamic' };
    }
    return { ...pending(word, progress, phase), ...(motion && { motion }) };
  }
}
