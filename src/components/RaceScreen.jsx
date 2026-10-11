import Camera from './Camera.jsx';
import PixelSprite from './Pixel.jsx';

/** Presentation only: App owns the race engine and webcam recognition. */
export default function RaceScreen({ gameState, mode, cameraIds, devices, rawLetters, events, onRecognition, onSimulate, onExit, sequence }) {
  const seconds = Math.ceil(gameState.remainingSeconds);
  const low = seconds <= 10;

  return (
    <section className="sd-race">
      <header className="sd-race-header glass">
        <p className="sd-mode-tag">{mode === 'versus' ? 'Duo race' : 'Solo race'}</p>
        <h2 className={`sd-clock${low ? ' sd-clock--low' : ''}`}><b>{seconds}</b><span>s remaining</span></h2>
        <button className="sd-button sd-button-secondary sd-small" onClick={onExit}>Exit race</button>
      </header>
      <p className="sd-hint">Show the target sign steadily, then release your hand before your next sign. Live recognition supports A, B and L.</p>

      <div className="sd-race-grid">
        {gameState.players.map((player, index) => (
          <article className={`sd-player sd-player--${player.id} glass`} key={player.id}>
            <div className="sd-player-head">
              <span className="sd-tag">P{index + 1}</span>
              <h3>{player.name}</h3>
              <span className="sd-badge">
                {mode === 'versus'
                  ? `${player.competitionScore} pts`
                  : <><PixelSprite name="heart" scale={3} />×{player.hearts}</>}
              </span>
            </div>

            {gameState.status === 'running' && <Camera deviceId={cameraIds[player.id] || undefined} onRecognition={result => onRecognition(player.id, result)} />}
            <p className="sd-caption">{devices.find(d => d.deviceId === cameraIds[player.id])?.label || 'Default camera'}</p>

            <div className="sd-target">
              <span>Make this sign</span>
              <strong>{player.currentTarget || '✓'}</strong>
              <span>Detected: <b>{rawLetters[player.id] || '—'}</b></span>
            </div>

            <div className="sd-letters" style={{ '--n': sequence.length }} aria-label={`${player.name} target letters`}>
              {sequence.map((letter, i) => <span key={i} className={i < player.progress ? 'complete' : i === player.progress ? 'current' : ''}>{letter}</span>)}
            </div>
            <div className="sd-bar" role="progressbar" aria-label={`${player.name} progress`} aria-valuemin={0} aria-valuemax={sequence.length} aria-valuenow={player.progress}>
              <div className="sd-bar__fill" style={{ '--pct': `${(player.progress / sequence.length) * 100}%` }} />
            </div>

            <div className="sd-stats">
              <span>Correct <b>{player.correct}</b></span>
              <span>Mistakes <b>{player.mistakes}</b></span>
              <span>Accuracy <b>{player.accuracy}%</b></span>
              <span>SPM <b>{player.spm}</b></span>
            </div>
            <p className="sd-feedback" aria-live="polite">{events[player.id]}</p>

            {import.meta.env.DEV && gameState.status === 'running' && (
              <details className="sd-debug">
                <summary>Developer tests (simulated, not camera)</summary>
                {['A', 'B', 'L'].map(letter => <button key={letter} className="sd-button sd-button-secondary sd-small" onClick={() => onSimulate(player.id, letter)}>Simulate {letter}</button>)}
              </details>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
