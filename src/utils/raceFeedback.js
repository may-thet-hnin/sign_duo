export function raceFeedback(player, result) {
  if (player.finished) return 'Sequence completed!';
  if (!result) return 'Show your hand to the camera.';
  if (result.status === 'error') return `Recognition unavailable: ${result.error}`;
  if (result.status === 'loading') return 'Loading letter recognition…';
  if (result.status === 'no-hand') return 'Show your hand to the camera.';
  if (result.status === 'out-of-frame') return 'Make sure your entire hand is visible.';
  if (result.status === 'tracking-paused') return 'Tracking paused. Show your hand again.';
  const detected = result.candidate || result.letter;
  if (!detected) return 'I can see your hand, but cannot recognize the sign yet.';
  if (detected !== player.currentTarget) return `Detected ${detected} — target ${player.currentTarget}.`;
  if (result.lockedLetter === player.currentTarget && !result.isNew) return 'Release your hand briefly, then sign again.';
  return `Hold ${detected} steady…`;
}
