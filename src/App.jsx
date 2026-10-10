import { useEffect, useRef, useState } from 'react';
import LearnScreen, { LESSONS } from './components/LearnScreen.jsx';
import RaceScreen from './components/RaceScreen.jsx';
import PixelSprite from './components/Pixel.jsx';
import Scenery from './components/Scenery.jsx';
import HeroLens from './components/HeroLens.jsx';
import ResultsScreen from './components/ResultsScreen.jsx';
import { recognizeLetter } from './utils/recognizeLetter.js';
import { LetterStabilizer } from './utils/stabilizeLetter.js';
import { RaceEngine } from './utils/raceEngine.js';
import './App.css';

const TEST_SEQUENCE = ['A', 'B', 'L', 'A', 'L', 'B', 'L', 'A', 'B', 'L', 'B', 'A'];
const SUPPORTED_LESSONS = LESSONS.filter(lesson => ['A', 'B', 'L'].includes(lesson.letter));

function asResultPlayer(player, snapshot) {
  return {
    id: player.id, name: player.name,
    score: Math.round((snapshot.mode === 'versus' ? player.competitionScore : player.correct) * 100),
    lives: player.hearts ?? 0, maxLives: snapshot.mode === 'single' ? 5 : 0,
    progress: (player.progress / TEST_SEQUENCE.length) * 100,
    correct: player.correct, attempts: player.correct + player.mistakes,
    bestStreak: player.bestStreak,
    timeSeconds: snapshot.elapsedSeconds + player.penaltySeconds,
  };
}

export default function App() {
  const engineRef = useRef(null);
  const stabilizersRef = useRef({ p1: new LetterStabilizer(), p2: new LetterStabilizer() });
  const [screen, setScreen] = useState('home');
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
    try {
      if (mode === 'versus' && (!cameraIds.p1 || !cameraIds.p2 || cameraIds.p1 === cameraIds.p2)) {
        throw new Error('Duo Mode requires two different cameras. Find cameras and choose one for each player.');
      }
      const engine = new RaceEngine({ mode, durationSeconds: 60, startingHearts: 5, penaltySeconds: 2, targetLetters: TEST_SEQUENCE, countJAndZ: false });
      engine.addPlayer('p1', 'Player 1');
      if (mode === 'versus') engine.addPlayer('p2', 'Player 2');
      engine.start();
      engineRef.current = engine;
      Object.values(stabilizersRef.current).forEach(s => s.reset());
      setRawLetters({ p1: null, p2: null });
      setEvents({ p1: 'Show the target sign to begin.', p2: 'Show the target sign to begin.' });
      setResults(null); setError(''); setGameState(engine.getSnapshot()); setScreen('race');
    } catch (err) { setError(err.message); }
  }

  function submitAttempt(playerId, letter, simulated = false) {
    const engine = engineRef.current;
    if (!engine || engine.status !== 'running') return;
    const outcome = engine.submitLetter(playerId, letter);
    if (!outcome.accepted) return;
    setEvents(previous => ({ ...previous, [playerId]: `${simulated ? '[SIMULATED] ' : ''}${letter}: ${outcome.correct ? 'Correct!' : `Try again — expected ${outcome.target}`}` }));
    const snapshot = engine.getSnapshot();
    setGameState(snapshot);
    if (snapshot.status === 'finished') { setResults(engine.getResults()); setScreen('results'); }
  }

  function handleLandmarks(playerId, landmarks) {
    if (engineRef.current?.status !== 'running') return;
    const letter = recognizeLetter(landmarks);
    setRawLetters(previous => previous[playerId] === letter ? previous : { ...previous, [playerId]: letter });
    const event = stabilizersRef.current[playerId].addFrame(letter);
    if (event.isNew) submitAttempt(playerId, event.letter);
  }

  useEffect(() => {
    if (screen !== 'race' || gameState?.status !== 'running') return undefined;
    const timer = setInterval(() => {
      const engine = engineRef.current;
      if (!engine) return;
      const snapshot = engine.updateTime();
      setGameState(snapshot);
      if (snapshot.status === 'finished') { setResults(engine.getResults()); setScreen('results'); }
    }, 250);
    return () => clearInterval(timer);
  }, [screen, gameState?.status]);

  function goHome() {
    engineRef.current = null;
    Object.values(stabilizersRef.current).forEach(s => s.reset());
    setGameState(null); setResults(null); setRawLetters({ p1: null, p2: null });
    setError(''); setScreen('home');
  }

  return <>
    <Scenery />
    <div className="sd-scan" aria-hidden="true" />
    <main className="sd-app">
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
          <article className="sd-feature glass"><PixelSprite name="A" scale={4} /><h3>Learn</h3><p>Guided letters, quizzes and self-guided handshape practice.</p></article>
          <article className="sd-feature glass"><PixelSprite name="flag" scale={5} /><h3>Solo</h3><p>60 seconds to complete the sequence. Five hearts.</p></article>
          <article className="sd-feature glass"><PixelSprite name="bolt" scale={5} /><h3>Duo</h3><p>Two webcams, one shared sequence, real-time competition.</p></article>
        </div>
        <p className="sd-hint">Live recognition currently supports A, B and L. Learning practice is self-assessed.</p>
      </section>}

      {screen === 'learn' && <section className="sd-learn">
        <button className="sd-link" onClick={goHome}>Back to menu</button>
        <h1 className="sd-page-title">Sign lessons</h1>
        <LearnScreen lessons={SUPPORTED_LESSONS} onFinish={() => {}} />
        <button className="sd-button sd-button-secondary sd-after-learn" onClick={() => setScreen('setup')}>Ready to race?</button>
      </section>}

      {screen === 'setup' && <section className="sd-setup">
        <button className="sd-link" onClick={goHome}>Back to menu</button>
        <h1 className="sd-page-title">Choose your challenge</h1>
        <div className="sd-mode-grid">
          <button className={`sd-mode glass ${mode === 'single' ? 'selected' : ''}`} aria-pressed={mode === 'single'} onClick={() => { setMode('single'); setError(''); }}>
            <PixelSprite name="flag" scale={5} />
            <strong>Solo</strong>
            <span>One webcam · 5 hearts · 60 seconds</span>
          </button>
          <button className={`sd-mode glass ${mode === 'versus' ? 'selected' : ''}`} aria-pressed={mode === 'versus'} onClick={() => { setMode('versus'); setError(''); }}>
            <PixelSprite name="bolt" scale={5} />
            <strong>Duo</strong>
            <span>Two webcams · head-to-head · 60 seconds</span>
          </button>
        </div>
        <div className="sd-setup-box glass">
          <h2>Camera setup</h2>
          <button className="sd-button sd-button-secondary" onClick={findCameras}>Find cameras / allow access</button>
          <p className="sd-hint" aria-live="polite">{deviceMessage || 'Select webcams before racing. Solo can also use your default webcam.'}</p>
          {devices.length > 0 && <div className="sd-camera-selects">{['p1', ...(mode === 'versus' ? ['p2'] : [])].map(id => <label key={id}>{id === 'p1' ? 'Player 1 webcam' : 'Player 2 webcam'}<select value={cameraIds[id]} onChange={event => setCameraIds(old => ({ ...old, [id]: event.target.value }))}><option value="">Select webcam</option>{devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}</select></label>)}</div>}
          {mode === 'versus' && <p className="sd-hint">Duo requires two distinct webcams connected to this computer (a phone can work as a second webcam).</p>}
        </div>
        {error && <p className="sd-error" role="alert">{error}</p>}
        <button className="sd-button sd-button-start sd-start" onClick={startRace}>Start {mode === 'versus' ? 'duo' : 'solo'} race</button>
      </section>}

      {screen === 'race' && gameState && <RaceScreen gameState={gameState} mode={mode} cameraIds={cameraIds} devices={devices} rawLetters={rawLetters} events={events} sequence={TEST_SEQUENCE} onLandmarks={handleLandmarks} onSimulate={(id, letter) => submitAttempt(id, letter, true)} onExit={goHome} />}

      {screen === 'results' && results && (mode === 'versus'
        ? <ResultsScreen players={results.ranking.map(p => asResultPlayer(p, results))} winnerId={results.ranking[0].competitionScore === results.ranking[1].competitionScore ? null : results.winner?.id} onRematch={startRace} onHome={goHome} />
        : <section className="sd-solo-result glass">
            <PixelSprite name="trophy" scale={7} className="sd-trophy" />
            <h1 className="sd-page-title">Great practice!</h1>
            <h2>{results.players[0].correct} / {TEST_SEQUENCE.length} signs correct</h2>
            <dl className="sd-result-stats">
              <div><dt>Accuracy</dt><dd>{results.players[0].accuracy}%</dd></div>
              <div><dt>Best streak</dt><dd>{results.players[0].bestStreak}</dd></div>
              <div><dt>Signs per minute</dt><dd>{results.players[0].spm}</dd></div>
            </dl>
            <div className="sd-home-actions"><button className="sd-button sd-button-start" onClick={startRace}>Play again</button><button className="sd-button sd-button-secondary" onClick={goHome}>Back to menu</button></div>
          </section>)}
    </main>
  </>;
}
