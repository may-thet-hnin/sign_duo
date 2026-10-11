import { useRef, useState } from 'react';
import Camera from './Camera.jsx';
import RecognitionDebug from './RecognitionDebug.jsx';
import { summarizeAttempt } from '../recognition/evaluation.js';
import { RECOGNITION_CONFIG } from '../recognition/config.js';

export default function RecognitionLab({ onExit }) {
  const [target, setTarget] = useState('A');
  const [expected, setExpected] = useState('A');
  const [conditions, setConditions] = useState('Right hand, upright, normal lighting');
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [attempts, setAttempts] = useState([]);
  const [sessionKey, setSessionKey] = useState(0);
  const attempt = useRef(null);
  function start() {
    attempt.current = { target, expected, conditions, startedAt: performance.now(), samples: [] };
    setSessionKey(k => k + 1); setRunning(true);
  }
  function finish() {
    const current = attempt.current;
    if (!current) return;
    const endedAt = performance.now();
    const saved = { ...current, endedAt, summary: summarizeAttempt(current.samples, current.expected, current.startedAt, endedAt, current.target) };
    setAttempts(previous => [...previous, saved]); attempt.current = null; setRunning(false);
  }
  function receive(next) {
    setResult(next);
    if (!attempt.current || !['no-hand', 'unknown', 'tentative', 'stable', 'out-of-frame', 'tracking-paused'].includes(next.status)) return;
    attempt.current.startedAt = attempt.current.samples.length ? attempt.current.startedAt : performance.now();
    attempt.current.samples.push(next);
    if (performance.now() - attempt.current.startedAt >= 5000) finish();
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ config: RECOGNITION_CONFIG, attempts }, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'sign-duo-recognition-evaluation.json'; anchor.click();
    URL.revokeObjectURL(url);
  }
  return <section className="learn-panel glass">
    <button className="sd-link" onClick={onExit}>Back to menu</button>
    <h1>Recognition evaluation</h1>
    <p>Each attempt records five seconds after model startup. Pose before starting; release between attempts. Scores across frames measure agreement, not independent-example accuracy.</p>
    <div className="sd-camera-selects">
      <label>Target<select disabled={running} value={target} onChange={e => setTarget(e.target.value)}>{['A','B','L'].map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Actual sign / negative test<select disabled={running} value={expected} onChange={e => setExpected(e.target.value)}>{['A','B','L','UNKNOWN'].map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Hand, angle, lighting, user, negative pose<input disabled={running} value={conditions} onChange={e => setConditions(e.target.value)} /></label>
    </div>
    <p>For negative tests choose UNKNOWN and describe “no hand” or the unsupported pose. Choose another actual letter for wrong-target tests.</p>
    <Camera key={sessionKey} onRecognition={receive} />
    <p role="status">{result?.error || `${result?.status || 'Preparing'} · ${result?.candidate || result?.letter || 'UNKNOWN'}`}</p>
    <RecognitionDebug result={result} target={target} />
    <button className="sd-button" disabled={running || !result || ['loading','error'].includes(result.status)} onClick={start}>Start attempt</button>
    {running && <button className="sd-button sd-button-secondary" onClick={finish}>Finish attempt</button>}
    <button className="sd-button sd-button-secondary" disabled={!attempts.length} onClick={download}>Export results</button>
    <ol>{attempts.map((a, i) => <li key={i}>{a.expected} · {a.conditions} · {a.summary.samples} samples ·
      correct accepted: {String(a.summary.acceptedCorrect)} · false acceptance: {String(a.summary.falseAcceptance)} ·
      latency: {a.summary.firstCorrectLatencyMs?.toFixed(0) ?? '—'} ms · raw match: {a.summary.rawCorrectFraction === null ? 'n/a' : `${(a.summary.rawCorrectFraction * 100).toFixed(0)}%`}</li>)}</ol>
    <p>Experimental A/B/L only. This evaluates handshapes; it does not establish ASL fluency or validate conversational signs.</p>
    <p>Model: <a href="https://huggingface.co/nocontextdoruk/asl-landmark-mlp">Doruk Doğular, ASL Landmark MLP</a>, CC BY-NC 4.0. Dataset: <a href="https://data.mendeley.com/datasets/j4y5w2c8w9/1">Pranto et al., ASL-HG (2026)</a>, CC BY 4.0.</p>
  </section>;
}
