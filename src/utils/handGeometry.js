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

export function jointAngle(a, b, c) {
  const ab = getDistance(a, b), bc = getDistance(b, c), ac = getDistance(a, c);
  if (!Number.isFinite(ab + bc + ac) || ab * bc < 1e-8) return 0;
  return Math.acos(Math.max(-1, Math.min(1, (ab * ab + bc * bc - ac * ac) / (2 * ab * bc)))) * 180 / Math.PI;
}

// MediaPipe image x/z use width units; y uses height units. Convert to equal
// axes so geometry and the ONNX model see the hand's true proportions.
export function metricLandmarks(points, aspectRatio = 1) {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return null;
  return Array.isArray(points) ? points.map(p => p && ({ ...p, y: p.y / aspectRatio })) : null;
}

// Scale-free joint features for word motions. Borderline fingers stay uncertain.
export function handFeatures(points) {
  if (!Array.isArray(points) || points.length !== 21 || points.some(p =>
    !p || ![p.x, p.y, p.z ?? 0].every(Number.isFinite))) return null;
  const width = getDistance(points[5], points[17]);
  if (width < .001) return null;
  const fingers = {};
  for (const [finger, { mcp, pip, tip }] of Object.entries(FINGER_INDICES)) {
    if (finger === 'thumb') continue;
    const angle = jointAngle(points[mcp], points[pip], points[pip + 1]);
    const distalAngle = jointAngle(points[pip], points[pip + 1], points[tip]);
    const reach = getDistance(points[mcp], points[tip]) / width;
    const length = (getDistance(points[mcp], points[pip]) + getDistance(points[pip], points[pip + 1]) + getDistance(points[pip + 1], points[tip])) / width;
    fingers[finger] = {
      angle, distalAngle, reach, length, straightness: reach / length,
      extended: angle > 155 && distalAngle > 150 && reach > .85,
      folded: angle < 115 && reach < .85,
    };
  }
  const distance = (a, b) => getDistance(points[a], points[b]) / width;
  const thumbAngle = jointAngle(points[2], points[3], points[4]);
  const thumbSpan = jointAngle(points[4], points[2], points[5]);
  const thumbReach = distance(2, 4) / (distance(2, 3) + distance(3, 4));
  return { width, fingers, distance,
    thumbOpen: thumbAngle > 145 && distance(4, 5) > 1.05,
    thumbAbducted: thumbSpan > 85 && thumbReach > .8 && distance(4, 5) > 1.05,
    thumbClosed: distance(4, 5) < .85,
    wrist: points[0],
    knuckleX: (points[5].x + points[9].x + points[13].x + points[17].x) / 4,
    knuckleY: (points[5].y + points[9].y + points[13].y + points[17].y) / 4,
    knuckleZ: (points[5].z + points[9].z + points[13].z + points[17].z) / 4,
  };
}
