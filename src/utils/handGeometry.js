// MediaPipe Hand Landmarker indexes (21 landmarks per hand).
export const FINGER_INDICES = {
  thumb: { tip: 4, ip: 3, mcp: 2 },
  index: { tip: 8, pip: 6, mcp: 5 },
  middle: { tip: 12, pip: 10, mcp: 9 },
  ring: { tip: 16, pip: 14, mcp: 13 },
  pinky: { tip: 20, pip: 18, mcp: 17 },
};

export function getDistance(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

// Geometric heuristic, not a validated ASL fingerspelling model.
export function isFingerExtended(landmarks, finger) {
  const indices = FINGER_INDICES[finger];
  if (!indices || !Array.isArray(landmarks) || landmarks.length < 21) return false;
  const joint = finger === 'thumb' ? indices.ip : indices.pip;
  const tip = landmarks[indices.tip];
  const middle = landmarks[joint];
  const base = landmarks[indices.mcp];
  // Extension: tip is clearly further from the base joint than the intermediate joint.
  return getDistance(tip, base) > getDistance(middle, base) * 1.35;
}
