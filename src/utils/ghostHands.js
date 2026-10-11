import { LETTER_GHOSTS, WORD_POSES } from './ghostHandData.js';

// Ghost hand: the target handshape drawn over the camera view as a guide.
// Shapes are 21 [x, y] points relative to the wrist, scaled so the
// wrist-to-middle-knuckle length is 1, in MediaPipe "Right" orientation.

const WORD_PERIOD_MS = 2000;
// 0 -> 1 -> 0 over one period, with a short rest at each end.
const swing = timeMs => {
  const t = (timeMs % WORD_PERIOD_MS) / WORD_PERIOD_MS;
  return Math.min(1, Math.max(0, Math.sin(Math.PI * t) * 1.25));
};

// Word poses use a wrist at [0, 1]; convert to wrist-relative, unit-length 2D.
function wordShape(points, { dx = 0, nod = 0 } = {}) {
  const [wx, wy] = points[0];
  const rel = points.map(([x, y, z]) => {
    const ry = y - wy;
    return [x - wx, ry * Math.cos(nod) - z * Math.sin(nod)];
  });
  const length = Math.hypot(rel[9][0], rel[9][1]);
  return rel.map(([x, y]) => [x / length + dx, y / length]);
}

/** The ghost shape for a sign at a moment in time (words animate). */
export function ghostShape(sign, timeMs = 0) {
  if (LETTER_GHOSTS[sign]) return LETTER_GHOSTS[sign];
  const s = swing(timeMs);
  if (sign === 'HELLO') return wordShape(WORD_POSES.OPEN, { dx: s * 1.2 });
  if (sign === 'YES') return wordShape(WORD_POSES.FIST, { nod: s * Math.PI / 4 });
  if (sign === 'NO') {
    const closing = WORD_POSES.NO_OPEN.map((p, j) => p.map((v, k) => v + (WORD_POSES.NO_CLOSED[j][k] - v) * s));
    return wordShape(closing);
  }
  return null;
}

/**
 * Place a ghost shape in canvas pixels. With a tracked hand, the ghost sits on
 * the user's wrist, matches their hand size and angle, and is reflected for a
 * hand MediaPipe labels "Left". Without one, it stands upright in the lower
 * middle of the frame.
 */
export function placeGhost(shape, landmarks, handedness, width, height) {
  if (!shape) return null;
  let origin = [width / 2, height * .85];
  let length = height * .28;
  let angle = 0;
  const flip = handedness === 'Left' ? -1 : 1;
  // Measure the shape's own wrist-to-knuckle vector so the ghost knuckle lands
  // exactly on the user's (stored shapes are rounded; HELLO is shifted mid-sweep).
  const gx = (shape[9][0] - shape[0][0]) * flip, gy = shape[9][1] - shape[0][1];
  const ghostUp = Math.atan2(gy, gx);
  const unit = Math.hypot(gx, gy) || 1;
  if (landmarks?.length === 21) {
    const wrist = [landmarks[0].x * width, landmarks[0].y * height];
    const knuckle = [landmarks[9].x * width, landmarks[9].y * height];
    origin = wrist;
    length = Math.hypot(knuckle[0] - wrist[0], knuckle[1] - wrist[1]) || length;
    angle = Math.atan2(knuckle[1] - wrist[1], knuckle[0] - wrist[0]) - ghostUp;
  }
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return shape.map(([x, y]) => {
    const fx = x * flip;
    return [origin[0] + (fx * cos - y * sin) * length / unit, origin[1] + (fx * sin + y * cos) * length / unit];
  });
}
