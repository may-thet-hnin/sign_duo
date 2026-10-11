import { SUCCESS_PAUSE_MS } from '../recognition/config.js';

/**
 * Shown over the camera for SUCCESS_PAUSE_MS after a sign is accepted. While
 * it is up, recognition is paused, so a held gesture cannot count again or
 * count against the next sign. `key` it by the success so it replays each time.
 */
export default function SuccessBurst({ sign, next }) {
  return <div className="sd-success" role="status" aria-live="assertive" style={{ '--success-ms': `${SUCCESS_PAUSE_MS}ms` }}>
    <span className="sd-success__ring" aria-hidden="true" />
    <span className="sd-success__check" aria-hidden="true">✓</span>
    <strong className="sd-success__sign">{sign} · Correct!</strong>
    {next && <span className="sd-success__next">Next: <b>{next}</b></span>}
  </div>;
}
