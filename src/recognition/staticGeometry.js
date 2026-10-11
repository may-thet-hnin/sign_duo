import { cHandshapeFeatures, handFeatures, recognizeEGeometry, recognizeFGeometry } from '../utils/handGeometry.js';

// Conservative geometry rules for the added letters. Scores express rule
// agreement, not calibrated probabilities. A/B/L retain their existing path.
export function recognizeStaticGeometry(points) {
  const f = handFeatures(points);
  if (!f) return { letter: null, quality: 0 };
  const { index: i, middle: m, ring: r, pinky: p } = f.fingers;
  const c = cHandshapeFeatures(points);
  const candidates = [];
  const add = (letter, condition) => { if (condition) candidates.push(letter); };
  add('F', recognizeFGeometry(points));
  add('E', recognizeEGeometry(points));
  add('I', i.folded && m.folded && r.folded && p.extended && f.thumbClosed);
  add('Y', i.folded && m.folded && r.folded && p.extended && f.thumbAbducted);
  add('V', i.extended && m.extended && r.folded && p.folded && f.thumbClosed && f.distance(8, 12) > .55);
  // Thumb may hold the little finger rather than reach the index MCP.
  // Compare spacing to each person's MCP spacing, not a fixed tip separation.
  add('W', i.extended && m.extended && r.extended && p.folded && (f.thumbClosed || f.distance(4, 20) < .45) &&
    f.distance(8, 12) > f.distance(5, 9) * 1.05 && f.distance(12, 16) > f.distance(9, 13) * 1.05);
  // D requires the thumb/middle contact as well as an extended index.
  add('D', i.extended && (m.folded || m.arc) && (r.folded || r.arc) && (p.folded || p.arc) &&
    f.distance(4, 12) < .4 && f.distance(12, 16) < .6 && f.distance(16, 20) < .6);
  // C uses finger-chain scale and knuckle/joint curl, independent of wrist.
  add('C', c.matched);
  const possibleF = !i.extended && [m, r, p].every(finger => finger.angle > 145 && finger.distalAngle > 135 && finger.straightness > .8 && finger.reach > .65);
  const possibleAdded = possibleF || p.extended && i.folded && m.folded && r.folded ||
    i.extended && m.extended && p.folded ||
    i.extended && !m.extended && !r.extended && !p.extended && !f.thumbOpen ||
    [i, m, r, p].filter(v => v.arc).length >= 3 || c.curled;
  return { letter: candidates.length === 1 ? candidates[0] : null,
    uncertain: candidates.length !== 1 && possibleAdded,
    quality: candidates.length === 1 ? 1 : 0 };
}
