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

  if (
    !indices ||
    !Array.isArray(landmarks) ||
    landmarks.length < 21
  ) {
    return false;
  }

  const tip = landmarks[indices.tip];
  const base = landmarks[indices.mcp];

  // For the thumb, compare the tip to its IP joint.
  // For other fingers, compare the tip to the PIP joint.
  const jointIndex = finger === 'thumb' ? indices.ip : indices.pip;
  const joint = landmarks[jointIndex];

  const tipToBase = getDistance(tip, base);
  const jointToBase = getDistance(joint, base);

  if (
    !Number.isFinite(tipToBase) ||
    !Number.isFinite(jointToBase) ||
    jointToBase < 0.00001
  ) {
    return false;
  }

  // Previously 1.35. A lower ratio accepts slightly bent fingers.
  return tipToBase > jointToBase * 1.20;
}
