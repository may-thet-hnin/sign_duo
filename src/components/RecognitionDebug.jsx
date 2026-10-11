export default function RecognitionDebug({ result, target }) {
  if (!result) return null;
  return <details className="sd-debug">
    <summary>Recognition diagnostics</summary>
    <dl>
      {Object.entries({ Target: target, Method: result.method,
        Hand: result.handDetected ? result.handedness ? `detected (${result.handedness})` : 'detected' : 'absent',
        'Raw class': result.raw, Stable: result.letter, State: result.status,
        Agreement: `${Math.round((result.agreement || 0) * 100)}%`,
        'Inference ms': result.latencyMs?.toFixed(1) }).map(([key, value]) =>
        <div key={key}><dt>{key}</dt><dd>{value ?? '—'}</dd></div>)}
    </dl>
    <p>Top letters: {result.top?.map(p => `${p.letter} ${(p.confidence * 100).toFixed(1)}%`).join(' · ') || '—'}</p>
    <p>Letter scores are model probabilities renormalized over static letters (9 counts as F). Word motion rules have no calibrated probability. Recognition remains experimental.</p>
  </details>;
}
