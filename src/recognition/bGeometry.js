import { getDistance, isFingerExtended } from '../utils/handGeometry.js';

// Compatibility path for B only; geometry has no model probability score.
export function recognizeBGeometry(points) {
  if (!Array.isArray(points) || points.length !== 21 || points.some(p =>
    !p || ![p.x, p.y, p.z].every(Number.isFinite))) return false;
  const width = getDistance(points[5], points[17]);
  return width > .001 && ['index', 'middle', 'ring', 'pinky'].every(finger => isFingerExtended(points, finger)) &&
    getDistance(points[4], points[5]) < width * .85;
}
