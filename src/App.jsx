import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import LearnScreen from './components/LearnScreen.jsx';
// LAN mode (and its WebRTC library) loads only when someone opens it.
const LanScreen = lazy(() => import('./components/LanScreen.jsx'));
import RaceScreen from './components/RaceScreen.jsx';
import PixelSprite from './components/Pixel.jsx';
import Scenery from './components/Scenery.jsx';
import HeroLens from './components/HeroLens.jsx';
import ResultsScreen from './components/ResultsScreen.jsx';
import ResultsReveal from './components/ResultsReveal.jsx';
import { RACE_DURATIONS, COMPETITION_POOLS, ALPHABET_SIGNS, WORD_SIGNS, POINTS_PER_SIGN, SUCCESS_PAUSE_MS } from './recognition/config.js';
import { RaceEngine } from './utils/raceEngine.js';
import './App.css';

function asResultPlayer(player, snapshot) {
  return {
    id: player.id, name: player.name, score: player.score,
    lives: player.hearts ?? 0, maxLives: snapshot.mode === 'single' ? 5 : 0,
    correct: player.correct, attempts: player.correct + player.mistakes,
    bestStreak: player.bestStreak, spm: player.spm, skipped: player.skipped,
  };
}

export default function App() {
  const engineRef = useRef(null);
  const timerRef = useRef(null);
  const readyCameras = useRef({});
  const [duration, setDuration] = useState(60);
  const [screen, setScreen] = useState('home');
  const [mode, setMode] = useState('single');
  const [vocabulary, setVocabulary] = useState('alphabet');
  const [devices, setDevices] = useState([]);
  const [cameraIds, setCameraIds] = useState({ p1: '', p2: '' });
  const [deviceMessage, setDeviceMessage] = useState('');
  const [gameState, setGameState] = useState(null);
  const [results, setResults] = useState(null);
  const [recognition, setRecognition] = useState({});
  const [events, setEvents] = useState({ p1: 'Waiting for race', p2: 'Waiting for race' });
  // Per-player success burst; that player's recognition pauses while it shows.
  const [celebrations, setCelebrations] = useState({});
  const celebrationId = useRef(0);
  const [error, setError] = useState('');

  const stopRaceTimer = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const publishRace = useCallback(engine => {
    if (engineRef.current !== engine) return;
    const snapshot = engine.getSnapshot();
    if (snapshot.status === 'finished') {
      stopRaceTimer();
      setResults(engine.getResults());
      setScreen('results');
    }
    setGameState(snapshot);
  }, [stopRaceTimer]);

  async function findCameras() {
    try {
      if (!navigator.mediaDevices?.enumerateDevices || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Cameras require localhost or HTTPS in a supported browser.');
      }
      const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      probe.getTracks().forEach(track => track.stop());
      const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput' && d.deviceId);
      setDevices(cameras);
      setCameraIds(previous => {
        const ids = cameras.map(d => d.deviceId);
        const p1 = ids.includes(previous.p1) ? previous.p1 : ids[0] ?? '';
        const p2 = ids.includes(previous.p2) && previous.p2 !== p1 ? previous.p2 : ids.find(id => id !== p1) ?? '';
        return { p1, p2 };
      });
      setDeviceMessage(`${cameras.length} camera${cameras.length === 1 ? '' : 's'} detected.`);
      setError('');
    } catch (err) { setDeviceMessage(''); setError(`Camera search failed: ${err.message}`); }
  }

  function startRace() {
    // LAN mode has its own lobby; the chosen signs and length become the host's starting settings.
    if (mode === 'lan') { setError(''); setScreen('lan'); return; }
    try {
      if (mode === 'versus' && (!cameraIds.p1 || !cameraIds.p2 || cameraIds.p1 === cameraIds.p2)) {
        throw new Error('Duo Mode requires two different cameras. Find cameras and choose one for each player.');
      }
      // A new engine draws a new random sequence; duo players share it.
      const engine = new RaceEngine({ mode, durationSeconds: duration, startingHearts: 5, pool: COMPETITION_POOLS[vocabulary] });
      engine.addPlayer('p1', 'Player 1');
      if (mode === 'versus') engine.addPlayer('p2', 'Player 2');
      stopRaceTimer();
      engineRef.current = engine;
      readyCameras.current = {};
      setRecognition({});
      setCelebrations({});
      setEvents({ p1: 'Preparing camera and recognition…', p2: 'Preparing camera and recognition…' });
      setResults(null); setError(''); setGameState(engine.getSnapshot()); setScreen('race');
    } catch (err) { setError(err.message); }
  }

  function submitAttempt(playerId, letter, simulated = false, recognitionResult = null) {
    const engine = engineRef.current;
    if (!engine || engine.id !== gameState?.raceId || engine.status !== 'running') return;
    const outcome = recognitionResult ? engine.submitRecognition(playerId, recognitionResult) : engine.submitLetter(playerId, letter);
    // A late submission can end the race by timeout without being accepted.
    if (!outcome.accepted) {
      if (engine.status === 'finished') publishRace(engine);
      return;
    }
    setEvents(previous => ({ ...previous, [playerId]: `${simulated ? '[SIMULATED] ' : ''}${letter}: ${outcome.correct ? `Accepted! +${POINTS_PER_SIGN} · Next: ${outcome.nextTarget || '—'}` : `Try again — expected ${outcome.target}`}` }));
    if (outcome.correct) {
      const id = ++celebrationId.current;
      setCelebrations(previous => ({ ...previous, [playerId]: { id, sign: letter, next: outcome.nextTarget } }));
      setTimeout(() => setCelebrations(previous => previous[playerId]?.id === id ? { ...previous, [playerId]: null } : previous), SUCCESS_PAUSE_MS);
    }
    publishRace(engine);
  }

  function skipTarget(playerId, challengeId) {
    const engine = engineRef.current;
    if (!engine || engine.id !== gameState?.raceId || engine.status !== 'running') return;
    // The challenge ID makes a double click skip only one sign.
    engine.skip(playerId, challengeId);
    publishRace(engine);
  }

  const handleCameraStatus = useCallback((playerId, status) => {
    const engine = engineRef.current;
    if (!engine || engine.id !== gameState?.raceId || engine.status !== 'waiting') return;
    readyCameras.current[playerId] = status.ready;
    if (status.error) setEvents(previous => ({ ...previous, [playerId]: status.error }));
    if ([...engine.players.keys()].every(id => readyCameras.current[id])) {
      const snapshot = engine.start();
      setGameState(snapshot);
      setEvents({ p1: 'Show the target sign to begin.', p2: 'Show the target sign to begin.' });
    }
  }, [gameState?.raceId]);

  function handleRecognition(playerId, result) {
    const engine = engineRef.current;
    if (!engine || engine.id !== gameState?.raceId || !['waiting', 'running'].includes(engine.status)) return;
    setRecognition(previous => ({ ...previous, [playerId]: result }));
    if (engine.status === 'running' && result.isNew) submitAttempt(playerId, result.letter, false, result);
  }

  useEffect(() => {
    if (screen !== 'race' || gameState?.status !== 'running') return undefined;
    const engine = engineRef.current;
    if (!engine || engine.status !== 'running') return undefined;
    const tick = () => {
      if (engineRef.current !== engine || engine.status !== 'running') return;
      engine.updateTime();
      publishRace(engine);
    };
    // The interval refreshes the clock display; the timeout ends the race at
    // the deadline itself rather than up to 250 ms later.
    const timer = setInterval(tick, 250);
    const deadline = setTimeout(tick, engine.getTime().remainingSeconds * 1000 + 1);
    timerRef.current = timer;
    return () => {
      clearInterval(timer);
      clearTimeout(deadline);
      if (timerRef.current === timer) timerRef.current = null;
    };
  }, [screen, gameState?.status, gameState?.raceId, publishRace]);

  function goHome() {
    stopRaceTimer();
    engineRef.current = null;
    setGameState(null); setResults(null); setRecognition({}); setCelebrations({});
    setError(''); setScreen('home');
  }

  return <>
    <Scenery />
    <div className="sd-scan" aria-hidden="true" />
    <main className={`sd-app ${screen === 'race' || screen === 'lan' ? 'sd-app--race' : ''}`}>
      <nav className="sd-nav glass">
        <button className="sd-brand" onClick={goHome}><PixelSprite name="A" scale={2} />Sign Duo</button>
        <span className="sd-nav-note">Learn, practice, compete</span>
      </nav>

      {screen === 'home' && <section className="sd-home">
        <div className="sd-home-copy">
          <h1 className="sd-logo"><span>Sign</span><span>Duo</span></h1>
          <p className="sd-tagline">Learn signs. Race friends.</p>
          <p className="sd-lede">Learn the handshapes, then test your skills with live webcam recognition.</p>
          <div className="sd-home-actions">
            <button className="sd-button sd-button-start" onClick={() => setScreen('learn')}>Start learning</button>
            <button className="sd-button sd-button-secondary" onClick={() => setScreen('setup')}>Play a race</button>
          </div>
        </div>
        <HeroLens />
        <div className="sd-feature-grid">
          <article className="sd-feature glass"><PixelSprite name="A" scale={4} /><h3>Learn</h3><p>Guided letters, camera-verified practice and knowledge checks.</p></article>
          <article className="sd-feature glass"><PixelSprite name="flag" scale={5} /><h3>Solo</h3><p>Choose your race duration. Five hearts.</p></article>
          <article className="sd-feature glass"><PixelSprite name="bolt" scale={5} /><h3>Duo</h3><p>Two webcams, one shared sequence, real-time competition.</p></article>
        </div>
        <p className="sd-hint">Practice {ALPHABET_SIGNS.length} letters and {WORD_SIGNS.length} basic word motions. Hold letters steadily; complete the movement for words. HELLO uses simplified motion practice.</p>
      </section>}

      {screen === 'learn' && <section className="sd-learn">
        <button className="sd-link" onClick={goHome}>Back to menu</button>
        <h1 className="sd-page-title">Sign lessons</h1>
        <LearnScreen />
        <button className="sd-button sd-button-secondary sd-after-learn" onClick={() => setScreen('setup')}>Ready to race?</button>
      </section>}

      {screen === 'setup' && <section className="sd-setup">
        <button className="sd-link" onClick={goHome}>Back to menu</button>
        <h1 className="sd-page-title">Choose your challenge</h1>
        <div className="sd-mode-grid">
          <button className={`sd-mode glass ${mode === 'single' ? 'selected' : ''}`} aria-pressed={mode === 'single'} onClick={() => { setMode('single'); setError(''); }}>
            <PixelSprite name="flag" scale={5} />
            <strong>Solo</strong>
            <span>One webcam · 5 hearts · Choose your duration</span>
          </button>
          <button className={`sd-mode glass ${mode === 'versus' ? 'selected' : ''}`} aria-pressed={mode === 'versus'} onClick={() => { setMode('versus'); setError(''); }}>
            <PixelSprite name="bolt" scale={5} />
            <strong>Duo</strong>
            <span>Two webcams · head-to-head · Shared timer</span>
          </button>
          <button className={`sd-mode glass ${mode === 'lan' ? 'selected' : ''}`} aria-pressed={mode === 'lan'} onClick={() => { setMode('lan'); setError(''); }}>
            <PixelSprite name="trophy" scale={5} />
            <strong>LAN</strong>
            <span>Two devices · same Wi-Fi · Invite code</span>
          </button>
        </div>
        <div className="sd-duration glass">
          <fieldset className="sd-duration-options">
            <legend>Choose your signs</legend>
            <div>{[['alphabet', 'Alphabet'], ['words', 'Basic Words'], ['mixed', 'Mixed']].map(([value, label]) => <button type="button" key={value}
              className={`sd-button sd-button-secondary ${vocabulary === value ? 'selected' : ''}`}
              aria-pressed={vocabulary === value} onClick={() => setVocabulary(value)}>{label}</button>)}</div>
          </fieldset>
          {vocabulary !== 'alphabet' && <p className="sd-hint">Word motions are experimental. HELLO checks an outward open-hand sweep; forehead position is not checked.</p>}
        </div>
        <div className="sd-duration glass">
          <fieldset className="sd-duration-options">
            <legend>Choose your race duration</legend>
            <div>{RACE_DURATIONS.map(seconds => <button type="button" key={seconds} className={`sd-button sd-button-secondary ${duration === seconds ? 'selected' : ''}`} aria-pressed={duration === seconds} onClick={() => setDuration(seconds)}>{seconds}s</button>)}</div>
          </fieldset>
        </div>
        <div className="sd-setup-box glass">
          <h2>Camera setup</h2>
          <button className="sd-button sd-button-secondary" onClick={findCameras}>Find cameras / allow access</button>
          <p className="sd-hint" aria-live="polite">{deviceMessage || 'Select webcams before racing. Solo can also use your default webcam.'}</p>
          {devices.length > 0 && <div className="sd-camera-selects">{['p1', ...(mode === 'versus' ? ['p2'] : [])].map(id => <label key={id}>{id === 'p1' ? 'Player 1 webcam' : 'Player 2 webcam'}<select value={cameraIds[id]} onChange={event => setCameraIds(old => ({ ...old, [id]: event.target.value }))}><option value="">Select webcam</option>{devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}</select></label>)}</div>}
          {mode === 'versus' && <p className="sd-hint">Duo requires two distinct webcams connected to this computer (a phone can work as a second webcam).</p>}
        </div>
        {error && <p className="sd-error" role="alert">{error}</p>}
        <button className="sd-button sd-button-start sd-start" onClick={startRace}>{mode === 'lan' ? 'Open LAN lobby' : `Start ${mode === 'versus' ? 'duo' : 'solo'} race`}</button>
      </section>}

      {screen === 'lan' && <Suspense fallback={<p className="lan-busy" role="status"><span className="lan-spinner" aria-hidden="true" />Loading LAN mode…</p>}>
        <LanScreen initialSettings={{ durationSeconds: duration, vocabulary }} cameraId={cameraIds.p1 || undefined} onExit={goHome} />
      </Suspense>}

      {screen === 'race' && gameState && <RaceScreen key={gameState.raceId} gameState={gameState} mode={mode} cameraIds={cameraIds} devices={devices} recognition={recognition} events={events} celebrations={celebrations} onRecognition={handleRecognition} onCameraStatus={handleCameraStatus} onSimulate={(id, letter) => submitAttempt(id, letter, true)} onSkip={skipTarget} onExit={goHome} />}

      {screen === 'results' && results && <ResultsReveal key={results.raceId}
        title={results.endReason === 'out_of_hearts' ? 'OUT OF HEARTS!' : 'TIME UP!'}
        subtitle={mode === 'versus' ? 'Final scores…' : `Score: ${results.players[0].score.toLocaleString()}`}>
        {mode === 'versus'
        ? <ResultsScreen durationSeconds={results.durationSeconds} players={results.ranking.map(p => asResultPlayer(p, results))} winnerId={results.winnerId} winReason={results.winReason} onRematch={startRace} onHome={goHome} />
        : <section className="sd-solo-result glass">
            <PixelSprite name="trophy" scale={7} className="sd-trophy" />
            <h1 className="sd-page-title">{results.endReason === 'out_of_hearts' ? 'Out of hearts!' : 'Great practice!'}</h1>
            <p>{results.durationSeconds}-second race · Score: {results.players[0].score.toLocaleString()}</p>
            <h2>{results.players[0].correct} sign{results.players[0].correct === 1 ? '' : 's'} correct</h2>
            <dl className="sd-result-stats">
              <div><dt>Accuracy</dt><dd>{results.players[0].accuracy}%</dd></div>
              <div><dt>Best streak</dt><dd>{results.players[0].bestStreak}</dd></div>
              <div><dt>Skipped</dt><dd>{results.players[0].skipped}</dd></div>
              <div><dt>Signs per minute</dt><dd>{results.players[0].spm}</dd></div>
            </dl>
            <div className="sd-home-actions"><button className="sd-button sd-button-start" onClick={startRace}>Play again</button><button className="sd-button sd-button-secondary" onClick={goHome}>Back to menu</button></div>
          </section>}
      </ResultsReveal>}
      <p className="sd-hint">Recognition model: <a href="https://huggingface.co/nocontextdoruk/asl-landmark-mlp" target="_blank" rel="noreferrer">Doruk Doğular · CC BY-NC 4.0</a>. Dataset: <a href="https://data.mendeley.com/datasets/j4y5w2c8w9/1" target="_blank" rel="noreferrer">Pranto et al., ASL-HG (2026) · CC BY 4.0</a>.</p>
    </main>
  </>;
}
