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

// MediaPipe image x/z use width units; y uses height units. Geometry needs
// equal axes, while the existing ONNX input keeps the original coordinates.
export function metricLandmarks(points, aspectRatio = 1) {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return null;
  return Array.isArray(points) ? points.map(p => p && ({ ...p, y: p.y / aspectRatio })) : null;
}

// C can bend mostly at the knuckles, with nearly straight PIP/DIP joints.
// Build a palm axis from thumb CMC and the MCP row, excluding the wrist.
// Remove the sideways component so thumb CMC's offset is not counted as curl.
export function cHandshapeFeatures(points) {
  const unknown = { curled: false, matched: false };
  if (!Array.isArray(points) || points.length !== 21 || points.slice(1).some(p =>
    !p || ![p.x, p.y, p.z ?? 0].every(Number.isFinite))) return unknown;
  const vector = (a, b) => [b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)];
  const dot = (a, b) => a.reduce((sum, v, j) => sum + v * b[j], 0);
  const bases = [5, 9, 13, 17];
  const center = Object.fromEntries(['x', 'y', 'z'].map(axis =>
    [axis, bases.reduce((sum, base) => sum + (points[base][axis] ?? 0), 0) / 4]));
  const row = vector(points[5], points[17]);
  const palm = vector(points[1], center);
  const rowLength = dot(row, row);
  if (rowLength < 1e-10) return unknown;
  const forward = palm.map((v, j) => v - row[j] * dot(palm, row) / rowLength);
  const forwardLength = Math.hypot(...forward);
  if (forwardLength < 1e-5) return unknown;
  const chains = bases.map(base => {
    const proximal = vector(points[base], points[base + 1]);
    const proximalLength = Math.hypot(...proximal);
    const length = getDistance(points[base], points[base + 1]) +
      getDistance(points[base + 1], points[base + 2]) + getDistance(points[base + 2], points[base + 3]);
    const pip = jointAngle(points[base], points[base + 1], points[base + 2]);
    const dip = jointAngle(points[base + 1], points[base + 2], points[base + 3]);
    const knuckleBend = proximalLength > 1e-5 ? Math.acos(Math.max(-1, Math.min(1,
      dot(forward, proximal) / (forwardLength * proximalLength)))) * 180 / Math.PI : 180;
    return { length, pip, dip, knuckleBend,
      reach: getDistance(points[base], points[base + 3]) / length };
  });
  // Retain real curl evidence. Open palms lack both knuckle and joint bend;
  // closed fists have sharply folded joints or a short base-to-tip reach.
  const curled = chains.every(f => f.length > 1e-5 && f.pip > 75 && f.dip > 75 && f.reach > .45 &&
    ((f.pip + f.dip < 325 && f.reach < .9) ||
      (f.knuckleBend > 25 && f.knuckleBend < 110 && f.pip + f.dip < 355)));
  const fingerLength = chains[0].length;
  const aperture = getDistance(points[4], points[8]) / fingerLength;
  const matched = curled && jointAngle(points[3], points[4], points[8]) > 95 &&
    aperture > .3 && aperture < 1.6 &&
    [[8, 12], [12, 16], [16, 20]].every(([a, b]) => getDistance(points[a], points[b]) / fingerLength < .5);
  return { curled, matched };
}

// Scale-free joint features. Unknown/borderline fingers remain uncertain.
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
      curved: angle >= 80 && angle <= 150 && distalAngle >= 85 && distalAngle <= 165 && reach > .5,
      arc: angle > 75 && distalAngle > 75 && angle + distalAngle < 325 && reach / length > .45 && reach / length < .9,
    };
  }
  const distance = (a, b) => getDistance(points[a], points[b]) / width;
  const thumbAngle = jointAngle(points[2], points[3], points[4]);
  const thumbSpan = jointAngle(points[4], points[2], points[5]);
  const thumbReach = distance(2, 4) / (distance(2, 3) + distance(3, 4));
  return { width, fingers, distance, thumbAngle,
    thumbOpen: thumbAngle > 145 && distance(4, 5) > 1.05,
    thumbAbducted: thumbSpan > 85 && thumbReach > .8 && distance(4, 5) > 1.05,
    thumbFacingGap: jointAngle(points[3], points[4], points[8]) > 95,
    thumbClosed: distance(4, 5) < .85,
    wrist: points[0],
    knuckleX: (points[5].x + points[9].x + points[13].x + points[17].x) / 4,
    knuckleY: (points[5].y + points[9].y + points[13].y + points[17].y) / 4,
    knuckleZ: (points[5].z + points[9].z + points[13].z + points[17].z) / 4,
  };
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
