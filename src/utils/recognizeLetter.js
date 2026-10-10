import { isFingerExtended, getDistance, FINGER_INDICES } from './handGeometry.js';

/** Classify a 21-point hand landmark set as A, B, L, or no match. */
export function recognizeLetter(landmarks) {
	if (!Array.isArray(landmarks) || landmarks.length < 21) return null;

	const indexExtended = isFingerExtended(landmarks, 'index');
	const middleExtended = isFingerExtended(landmarks, 'middle');
	const ringExtended = isFingerExtended(landmarks, 'ring');
	const pinkyExtended = isFingerExtended(landmarks, 'pinky');
	const thumbExtended = isFingerExtended(landmarks, 'thumb');

	const curledFingers = !indexExtended && !middleExtended && !ringExtended && !pinkyExtended;
	const straightFingers = indexExtended && middleExtended && ringExtended && pinkyExtended;

	// A folded thumb lies across the palm, near the index-finger MCP joint.
	// The palm width makes this test scale-independent.
	const indices = FINGER_INDICES || {};
	const thumbTipIndex = indices.thumb?.tip ?? 4;
	const indexBaseIndex = indices.index?.mcp ?? indices.index?.base ?? 5;
	const palmWidth = getDistance(landmarks[5], landmarks[17]);
	const thumbAcrossPalm = palmWidth > 0 &&
		getDistance(landmarks[thumbTipIndex], landmarks[indexBaseIndex]) < palmWidth * 0.65;

	if (curledFingers && thumbExtended) return 'A';
	if (straightFingers && !thumbExtended && thumbAcrossPalm) return 'B';
	if (thumbExtended && indexExtended && !middleExtended && !ringExtended && !pinkyExtended) return 'L';

	return null;
}
