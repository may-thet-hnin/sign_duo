import { useEffect, useRef, useState } from 'react';
import Camera from './components/Camera.jsx';
import { recognizeLetter } from './utils/recognizeLetter.js';
import { LetterStabilizer } from './utils/stabilizeLetter.js';
import { RaceEngine } from './utils/raceEngine.js';

// Shared sequence makes the two-player comparison fair. Only supported letters.
const TEST_SEQUENCE = ['A', 'B', 'L', 'A', 'L', 'B', 'L', 'A', 'B', 'L', 'B', 'A'];
const colors = { p1: '#7358e9', p2: '#e07c40' };

export default function App() {
  const engineRef = useRef(null);
  const stabilizersRef = useRef({ p1: new LetterStabilizer(), p2: new LetterStabilizer() });
  const [mode, setMode] = useState('single');
  const [devices, setDevices] = useState([]);
  const [cameraIds, setCameraIds] = useState({ p1: '', p2: '' });
  const [deviceMessage, setDeviceMessage] = useState('');
  const [gameState, setGameState] = useState(null);
  const [results, setResults] = useState(null);
  const [rawLetters, setRawLetters] = useState({ p1: null, p2: null });
  const [events, setEvents] = useState({ p1: 'Waiting for race', p2: 'Waiting for race' });
  const [error, setError] = useState('');

  async function findCameras() {
    try {
      if (!navigator.mediaDevices?.enumerateDevices || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access requires localhost or HTTPS and a supported browser.');
      }
      // A short-lived permission request allows browsers to reveal camera labels.
      const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      probe.getTracks().forEach(track => track.stop());
      const cameras = (await navigator.mediaDevices.enumerateDevices())
        .filter(device => device.kind === 'videoinput' && device.deviceId);
      setDevices(cameras);
      setCameraIds(previous => {
        const available = cameras.map(device => device.deviceId);
        const p1 = available.includes(previous.p1) ? previous.p1 : (available[0] ?? '');
        const p2 = available.includes(previous.p2) && previous.p2 !== p1
          ? previous.p2 : (available.find(id => id !== p1) ?? '');
        return { p1, p2 };
      });
      setDeviceMessage(`${cameras.length} camera${cameras.length === 1 ? '' : 's'} detected.`);
      return cameras;
    } catch (err) {
      setDeviceMessage(`Camera search failed: ${err.message}`);
      return [];
    }
  }

  function startRace() {
    try {
      if (mode === 'versus' && (!cameraIds.p1 || !cameraIds.p2 || cameraIds.p1 === cameraIds.p2)) {
        throw new Error('Duo Mode needs TWO different physical webcams. Click Find Cameras and select one for each player.');
      }
      const engine = new RaceEngine({
        mode, durationSeconds: 60, startingHearts: 5, penaltySeconds: 2,
        targetLetters: TEST_SEQUENCE, countJAndZ: false,
      });
      engine.addPlayer('p1', 'Player 1');
      if (mode === 'versus') engine.addPlayer('p2', 'Player 2');
      engine.start();
      engineRef.current = engine;
      Object.values(stabilizersRef.current).forEach(s => s.reset());
      setRawLetters({ p1: null, p2: null });
      setEvents({ p1: 'Show the target, then release your hand between letters.', p2: 'Show the target, then release your hand between letters.' });
      setResults(null);
      setError('');
      setGameState(engine.getSnapshot());
    } catch (err) {
      setError(err.message);
    }
  }

  function submitAttempt(playerId, letter, simulated = false) {
    const engine = engineRef.current;
    if (!engine || engine.status !== 'running') return;
    const outcome = engine.submitLetter(playerId, letter);
    if (!outcome.accepted) return;
    setEvents(previous => ({ ...previous, [playerId]: `${simulated ? '[SIMULATED] ' : ''}${letter}: ${outcome.correct ? 'correct!' : `incorrect — expected ${outcome.target}`}` }));
    const snapshot = engine.getSnapshot();
    setGameState(snapshot);
    if (snapshot.status === 'finished') setResults(engine.getResults());
  }

  function handleLandmarks(playerId, landmarks) {
    if (engineRef.current?.status !== 'running') return;
    const letter = recognizeLetter(landmarks);
    setRawLetters(previous => previous[playerId] === letter ? previous : { ...previous, [playerId]: letter });
    const event = stabilizersRef.current[playerId].addFrame(letter);
    if (event.isNew) submitAttempt(playerId, event.letter);
  }

  useEffect(() => {
    if (gameState?.status !== 'running') return undefined;
    const timer = setInterval(() => {
      const engine = engineRef.current;
      if (!engine) return;
      const snapshot = engine.updateTime();
      setGameState(snapshot);
      if (snapshot.status === 'finished') setResults(engine.getResults());
    }, 250);
    return () => clearInterval(timer);
  }, [gameState?.status]);

  function reset() {
    engineRef.current = null;
    Object.values(stabilizersRef.current).forEach(s => s.reset());
    setGameState(null);
    setResults(null);
    setRawLetters({ p1: null, p2: null });
    setError('');
  }

  function playerPanel(player) {
    const next = player.currentTarget;
    return <article key={player.id} style={{ flex: '1 1 340px', minWidth: 0, border: `2px solid ${colors[player.id]}`, borderRadius: 14, padding: 14 }}>
      <h2 style={{ marginTop: 0 }}>{player.name}</h2>
      {gameState.status === 'running' && <Camera
        deviceId={cameraIds[player.id] || undefined}
        onLandmarks={landmarks => handleLandmarks(player.id, landmarks)}
      />}
      <p style={{ marginTop: 12 }}>Camera: <b>{devices.find(d => d.deviceId === cameraIds[player.id])?.label || (cameraIds[player.id] ? 'Selected camera' : 'Default camera')}</b></p>
      <p>Raw prediction: <strong>{rawLetters[player.id] ?? 'Unknown / no hand'}</strong></p>
      <h2>Target: <strong style={{ color: colors[player.id] }}>{next ?? 'Finished'}</strong></h2>
      <div aria-label={`${player.name} letter sequence`} style={{ display: 'flex', flexWrap: 'wrap', gap: 5, margin: '12px 0' }}>
        {TEST_SEQUENCE.map((letter, index) => <span key={index} style={{ padding: '5px 9px', borderRadius: 5, background: index < player.progress ? '#287149' : index === player.progress ? colors[player.id] : '#444', color: 'white', fontWeight: 700 }}>{letter}</span>)}
      </div>
      <progress max={TEST_SEQUENCE.length} value={player.progress} style={{ width: '100%', height: 15 }} />
      <p>Correct: {player.correct} · Mistakes: {player.mistakes} · SPM: {player.spm}</p>
      <p>Accuracy: {player.accuracy}% · Streak: {player.streak}</p>
      {mode === 'single' ? <p>Hearts: {player.hearts}</p> : <p>Penalty: {player.penaltySeconds}s · Score: {player.competitionScore}</p>}
      <p style={{ minHeight: 45 }}>Last attempt: {events[player.id]}</p>
      {gameState.status === 'running' && <details><summary>Debug — simulated submissions (NOT webcam recognition)</summary>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {['A', 'B', 'L'].map(letter => <button key={letter} onClick={() => submitAttempt(player.id, letter, true)}>Simulate {letter}</button>)}
        </div>
      </details>}
    </article>;
  }

  return <main style={{ maxWidth: 1200, margin: 'auto', padding: 20, fontFamily: 'system-ui', textAlign: 'left' }}>
    <h1 style={{ margin: '12px 0' }}>SignDuo — Integration Test</h1>
    <p>This temporary screen tests live ASL handshape recognition and local two-player competition. The final UI files are untouched.</p>
    {!gameState ? <section style={{ marginTop: 24 }}>
      <h2>Choose a mode</h2>
      <button onClick={() => { setMode('single'); setError(''); }} disabled={mode === 'single'}>Solo</button>{' '}
      <button onClick={() => { setMode('versus'); setError(''); }} disabled={mode === 'versus'}>Duo (two webcams)</button>
      <div style={{ marginTop: 16 }}>
        <button onClick={findCameras}>Find Cameras / Allow Permission</button>
        <p aria-live="polite">{deviceMessage}</p>
      </div>
      {devices.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, margin: '16px 0' }}>
        {['p1', ...(mode === 'versus' ? ['p2'] : [])].map(id => <label key={id} style={{ display: 'grid', gap: 5 }}>
          {id === 'p1' ? 'Player 1 webcam' : 'Player 2 webcam'}
          <select value={cameraIds[id]} onChange={event => setCameraIds(prev => ({ ...prev, [id]: event.target.value }))}>
            <option value="">Select a webcam</option>
            {devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
          </select>
        </label>)}
      </div>}
      {mode === 'versus' && <p><strong>Requires 2 webcams on this computer</strong> (for example, laptop webcam + USB webcam). One webcam cannot provide two independent camera views. Both players receive the same letters.</p>}
      <button style={{ marginTop: 16 }} onClick={startRace}>Start {mode === 'versus' ? 'Duo' : 'Solo'} Race (60 sec)</button>
      {error && <p role="alert" style={{ color: '#ee6767' }}>{error}</p>}
    </section> : <section style={{ marginTop: 20 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h2>{mode === 'versus' ? 'Duo Race' : 'Solo Challenge'} · {Math.ceil(gameState.remainingSeconds)}s remaining</h2>
        <button onClick={reset}>Back to Setup</button>
      </header>
      <p>Hold each handshape steady for recognition, then remove your hand briefly before the next letter. Only A, B and L are supported.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 18, alignItems: 'flex-start' }}>
        {gameState.players.map(playerPanel)}
      </div>
      {results && <section style={{ marginTop: 22, padding: 16, border: '1px solid #888', borderRadius: 12 }}>
        <h2>Race Results</h2>
        <p>Finished: {results.endReason}</p>
        {mode === 'versus' && <h2>{results.ranking[0]?.competitionScore === results.ranking[1]?.competitionScore ? 'Tie!' : `Winner: ${results.winner?.name ?? 'None'}`}</h2>}
        {results.ranking.map(player => <p key={player.id}>{player.name}: {player.correct} correct · {player.spm} SPM · {player.accuracy}% accuracy{mode === 'versus' ? ` · Score ${player.competitionScore}` : ''}</p>)}
        <button onClick={reset}>Play Again</button>
      </section>}
    </section>}
    <p style={{ marginTop: 28, fontSize: 13, opacity: 0.75 }}>Prototype: A/B/L recognition is experimental and may require handshape calibration. Duo races are local; no online matchmaking.</p>
  </main>;
}
