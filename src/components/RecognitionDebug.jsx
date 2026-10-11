export default function RecognitionDebug({ result, target }) {
  if (!result) return null;
  return <details className="sd-debug">
    <summary>Recognition diagnostics</summary>
    <dl>
      {Object.entries({ Target: target, Method: result.method, Hand: result.handDetected ? 'detected' : 'absent',
        Raw: result.raw, Stable: result.letter, Legacy: result.legacy, State: result.status,
        Agreement: `${Math.round((result.agreement || 0) * 100)}%`,
        'Inference ms': result.latencyMs?.toFixed(1) }).map(([key, value]) =>
        <div key={key}><dt>{key}</dt><dd>{value ?? '—'}</dd></div>)}
    </dl>
    <p>Top classes: {result.top?.map(p => `${p.letter} ${(p.confidence * 100).toFixed(1)}%`).join(' · ') || '—'}</p>
    <p>Scores belong to the raw ONNX class. B geometry has no probability score. Both recognition methods remain experimental.</p>
  </details>;
}
