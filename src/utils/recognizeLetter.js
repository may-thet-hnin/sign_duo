import { isFingerExtended, getDistance } from './handGeometry.js';
import { recognizeStaticGeometry } from '../recognition/staticGeometry.js';

// Angle in the camera's XY plane. Unchanged by in-plane hand rotation.
function thumbIndexAngle(points) {
  const thumb = { x: points[4].x - points[2].x, y: points[4].y - points[2].y };
  const index = { x: points[8].x - points[5].x, y: points[8].y - points[5].y };
  const lengths = Math.hypot(thumb.x, thumb.y) * Math.hypot(index.x, index.y);
  if (lengths < 0.00001) return 0;
  const cos = Math.max(-1, Math.min(1, (thumb.x * index.x + thumb.y * index.y) / lengths));
  return Math.acos(cos) * (180 / Math.PI);
}

// Experimental static handshape heuristics. Existing A/B/L rules are retained.
// Confirm results against an ASL reference and calibrate with multiple people.
export function recognizeLetter(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length !== 21 ||
      landmarks.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;

  const added = recognizeStaticGeometry(landmarks).letter;
  if (added) return added;

  const index = isFingerExtended(landmarks, 'index');
  const middle = isFingerExtended(landmarks, 'middle');
  const ring = isFingerExtended(landmarks, 'ring');
  const pinky = isFingerExtended(landmarks, 'pinky');
  const thumb = isFingerExtended(landmarks, 'thumb');
  const palmWidth = getDistance(landmarks[5], landmarks[17]);
  if (!Number.isFinite(palmWidth) || palmWidth < 0.001) return null;

  // For B, the thumb typically folds across the palm and four fingers extend.
  const thumbAcrossPalm = getDistance(landmarks[4], landmarks[5]) < palmWidth * 0.85;
  if (index && middle && ring && pinky && thumbAcrossPalm) return 'B';
  // The thumb-index opening is less dependent on whether the hand is tilted
  // sideways than the original thumb-extension threshold alone.
  const opening = thumbIndexAngle(landmarks);
  const thumbTipFarFromIndexBase = getDistance(landmarks[4], landmarks[5]) > palmWidth * 0.95;
  if (index && !middle && !ring && !pinky &&
      !thumbAcrossPalm && thumbTipFarFromIndexBase &&
      opening >= 40 && opening <= 145) return 'L';
  if (!index && !middle && !ring && !pinky && thumb && !thumbAcrossPalm) return 'A';
  return null;
}
