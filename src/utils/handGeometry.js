//Calculares the Euclidean distance between two 3D points
 function getDistance (p1, p2)
{
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = p1.z - p2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

//Checks if a finger is extended by comparing the distance from wrist to the figertip vs the wrist to the PIP joint
 function isFingerExtended(landmarks, tipIndex, pipIndex, wristIndex = 0) {
  const wrist = landmarks[wristIndex];
  const tip = landmarks[tipIndex];
  const pip = landmarks[pipIndex];

  const tipDist = getDistance(wrist, tip);
  const pipDist = getDistance(wrist, pip);

  // Adding a small buffer factor to avoid jitter
  return tipDist > pipDist * 1.1;
}

//Convenience object mapping MediaPipe landmark indices for each fingerFINGER_INDICES = {
 const FINGER_INDICES = {
  thumb: { tip: 4, ip: 3, mcp: 2 },
  index: { tip: 8, pip: 6, mcp: 5 },
  middle: { tip: 12, pip: 10, mcp: 9 },
  ring: { tip: 16, pip: 14, mcp: 13 },
  pinky: { tip: 20, pip: 18, mcp: 17 },
};