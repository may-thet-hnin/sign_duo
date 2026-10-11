import { isFingerExtended, getDistance } from './handGeometry.js';

// Angle in the camera's XY plane. Unchanged by in-plane hand rotation.
function thumbIndexAngle(points) {
  const thumb = { x: points[4].x - points[2].x, y: points[4].y - points[2].y };
  const index = { x: points[8].x - points[5].x, y: points[8].y - points[5].y };
  const lengths = Math.hypot(thumb.x, thumb.y) * Math.hypot(index.x, index.y);
  if (lengths < 0.00001) return 0;
  const cos = Math.max(-1, Math.min(1, (thumb.x * index.x + thumb.y * index.y) / lengths));
  return Math.acos(cos) * (180 / Math.PI);
}

// Experimental static handshape heuristics for A, B and L.
// Confirm results against an ASL reference and calibrate with multiple people.

export function recognizeLetter(landmarks) {
  if (
    !Array.isArray(landmarks) ||
    landmarks.length !== 21 ||
    landmarks.some(
      (p) =>
        !p ||
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y)
    )
  ) {
    return null;
  }

  const index = isFingerExtended(landmarks, 'index');
  const middle = isFingerExtended(landmarks, 'middle');
  const ring = isFingerExtended(landmarks, 'ring');
  const pinky = isFingerExtended(landmarks, 'pinky');
  const thumb = isFingerExtended(landmarks, 'thumb');

  const palmWidth = getDistance(landmarks[5], landmarks[17]);

  if (!Number.isFinite(palmWidth) || palmWidth < 0.001) {
    return null;
  }

  const thumbToIndexBase =
    getDistance(landmarks[4], landmarks[5]) / palmWidth;

  const opening = thumbIndexAngle(landmarks);

  // Score each handshape instead of requiring every condition to pass.
  let scoreA = 0;
  let scoreB = 0;
  let scoreL = 0;

  // A: four fingers folded, thumb visible and away from the palm.
  scoreA += !index ? 1 : 0;
  scoreA += !middle ? 1 : 0;
  scoreA += !ring ? 1 : 0;
  scoreA += !pinky ? 1 : 0;
  scoreA += thumb ? 1 : 0;
  scoreA += thumbToIndexBase > 0.70 ? 1 : 0;

  // B: four fingers extended, thumb relatively close to index base.
  scoreB += index ? 1 : 0;
  scoreB += middle ? 1 : 0;
  scoreB += ring ? 1 : 0;
  scoreB += pinky ? 1 : 0;
  scoreB += thumbToIndexBase < 1.05 ? 1 : 0;

  // L: index extended, other fingers folded, thumb open.
  scoreL += index ? 1 : 0;
  scoreL += !middle ? 1 : 0;
  scoreL += !ring ? 1 : 0;
  scoreL += !pinky ? 1 : 0;
  scoreL += thumbToIndexBase > 0.70 ? 1 : 0;
  scoreL += opening >= 25 && opening <= 155 ? 1 : 0;

  const candidates = [
    { letter: 'A', score: scoreA, minimum: 5 },
    { letter: 'B', score: scoreB, minimum: 4 },
    { letter: 'L', score: scoreL, minimum: 5 },
  ];

  candidates.sort((a, b) => b.score - a.score);

  const best = candidates[0];
  const second = candidates[1];

  // Require a reasonable match and a margin over the next-best letter.
  if (best.score < best.minimum || best.score - second.score < 1) {
    return null;
  }

  return best.letter;
}

