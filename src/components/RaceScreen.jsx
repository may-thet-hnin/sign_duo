import { useCallback } from 'react';
import Camera from './Camera.jsx';
import PixelSprite from './Pixel.jsx';
import RecognitionDebug from './RecognitionDebug.jsx';
import SuccessBurst from './SuccessBurst.jsx';
import { SKIPS_PER_RACE, SUPPORTED_SIGNS } from '../recognition/config.js';
import { raceFeedback } from '../utils/raceFeedback.js';
import { signContent } from '../utils/lessonContent.js';
import { recognitionProgress } from '../utils/learning.js';

function attemptText(player, event) {
  const attempt = player.lastAttempt;
  if (!attempt) return 'Hold a matching sign steadily to advance.';
  if (attempt.skipped) return `Skipped ${attempt.target} · no points. Next: ${player.currentTarget ?? '—'}`;
  return event;
}

function RacePlayer({ player, index, status, timeLeft, cameraId, deviceLabel, recognition, event, celebration, onRecognition, onCameraStatus, onSimulate, onSkip }) {
  const cameraStatus = useCallback(next => onCameraStatus(player.id, next), [onCameraStatus, player.id]);
  const detected = recognition?.candidate || recognition?.letter;
  const progress = recognitionProgress(recognition, player.currentTarget, player.challengeId).progress;
  const sign = signContent(player.currentTarget);
  return <article className={`sd-player sd-player--${player.id}`}>
    <div className="sd-player-head">
      <span className="sd-tag">P{index + 1}</span><h3>{player.name}</h3>
      <span className="sd-badge">{player.hearts === null ? `${player.score.toLocaleString()} pts` : <><PixelSprite name="heart" scale={2} />×{player.hearts}</>}</span>
    </div>
    <div className="sd-player-body">
      <div className={`sd-target${sign?.movement ? ' sd-target--word' : ''}${celebration ? ' sd-target--success' : ''}`} aria-label={`${player.name} current target`}>
        <span>Make this sign</span><strong>{player.currentTarget || '✓'}</strong>
        <span>Detected: <b>{detected || '—'}</b></span>
        <span className="sd-recognition-state">{recognition?.status === 'stable' ? sign?.movement ? 'Motion detected' : 'Stable handshape' : recognition?.status === 'tentative' ? sign?.movement ? 'Follow the movement' : 'Tentative · hold steady' : 'Looking for a sign'}</span>
        {sign?.movement && <p className="sd-word-guidance">{sign.movement}{sign.simplified ? ' Simplified: forehead position is not checked.' : ''}</p>}
      </div>
      <div className="sd-race-camera">
        {!player.finished && ['waiting', 'running'].includes(status) && <Camera deviceId={cameraId || undefined}
          challengeId={player.challengeId} targetSign={player.currentTarget} recognitionActive={status === 'running' && !celebration} trackingPaused={Boolean(celebration)}
          allowlist={SUPPORTED_SIGNS.competition}
          onRecognition={next => onRecognition(player.id, next)} onStatus={cameraStatus} />}
        {celebration && <SuccessBurst key={celebration.id} sign={celebration.sign} next={celebration.next} />}
        {player.finished && <div className="sd-player-finished">Out of hearts</div>}
        <p className="sd-caption">{deviceLabel || 'Default camera'}</p>
      </div>
    </div>
    <p className="sd-feedback" role="status">{status === 'waiting' ? recognition?.error || event || 'Preparing cameras…' : celebration ? `Correct! Get ready for ${celebration.next ?? 'the next sign'}…` : raceFeedback(player, recognition)}</p>
    <div className="sd-hold-progress" role="progressbar" aria-label={`${player.name} ${sign?.movement ? 'motion completion' : 'sign stability'}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}><span style={{ width: `${progress * 100}%` }} /></div>
    {status === 'running' && !player.finished && <div className="sd-skip">
      <span>Stuck on this sign?</span>
      <button type="button" className="sd-button sd-button-secondary sd-small" disabled={player.skipsLeft === 0}
        onClick={() => onSkip(player.id, player.challengeId)}
        aria-label={`${player.name}: skip ${player.currentTarget}, ${player.skipsLeft} skip${player.skipsLeft === 1 ? '' : 's'} left`}>
        {player.skipsLeft ? `Skip (${player.skipsLeft} left)` : 'No skips left'}
      </button>
    </div>}
    <p className="sd-attempt" key={player.lastAttempt?.timestamp ?? 'waiting'} data-correct={player.lastAttempt?.skipped ? undefined : player.lastAttempt?.correct} aria-live="polite">
      {attemptText(player, event)}
    </p>
    <div className="sd-race-progress">
      <span>Score <b>{player.score.toLocaleString()}</b> · Signs <b>{player.correct}</b></span>
      <div className="sd-bar" role="progressbar" aria-label="Round time remaining" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(timeLeft * 100)}>
        <div className="sd-bar__fill" style={{ '--pct': `${timeLeft * 100}%` }} />
      </div>
    </div>
    {/* A window of the shared random sequence: done, current, then upcoming signs. */}
    <div className="sd-letters" style={{ '--n': 8 }} aria-label={`${player.name} target signs`}>
      {player.window.signs.map((letter, offset) => {
        const i = player.window.from + offset;
        const skipped = player.skippedIndices.includes(i);
        return <span key={i} title={skipped ? `${letter} (skipped)` : letter} className={`${letter.length > 1 ? 'sd-sequence-word' : ''} ${skipped ? 'skipped' : i < player.progress ? 'complete' : i === player.progress ? 'current' : ''} ${i === player.progress - 1 && !skipped ? 'just-completed' : ''}`}>{letter}</span>;
      })}
    </div>
    <div className="sd-stats">
      <span>Correct <b>{player.correct}</b></span><span>Skipped <b>{player.skipped}</b></span>
      <span>Mistakes <b>{player.mistakes}</b></span><span>Accuracy <b>{player.accuracy}%</b></span>
    </div>
    {import.meta.env.DEV && <div className="sd-race-diagnostics">
      <RecognitionDebug result={recognition} target={player.currentTarget} />
      {status === 'running' && <details className="sd-debug"><summary>Developer tests (simulated, not camera)</summary>
        {SUPPORTED_SIGNS.competition.map(letter => <button key={letter} className="sd-button sd-button-secondary sd-small" onClick={() => onSimulate(player.id, letter)}>Simulate {letter}</button>)}
      </details>}
    </div>}
  </article>;
}

export default function RaceScreen({ gameState, mode, cameraIds, devices, recognition, events, celebrations = {}, onRecognition, onCameraStatus, onSimulate, onSkip, onExit }) {
  const seconds = Math.max(0, Math.ceil(gameState.remainingSeconds));
  return <section className={`sd-race sd-race--${mode}`}>
    <header className="sd-race-header glass">
      <p className="sd-mode-tag">{mode === 'versus' ? 'Duo race' : 'Solo race'}<span>{gameState.durationSeconds}s round</span></p>
      <h2 className={`sd-clock${seconds <= 10 ? ' sd-clock--low' : ''}`}><b>{seconds}</b><span>{gameState.status === 'waiting' ? 'Preparing cameras' : 's remaining'}</span></h2>
      <button className="sd-button sd-button-secondary sd-small" onClick={onExit}>Exit race</button>
    </header>
    <p className="sd-race-hint">Hold letters steadily. Complete the motion for words. Stuck? You have {SKIPS_PER_RACE} skips per race, worth 0 points; the timer keeps running.</p>
    <div className="sd-race-grid glass">
      {gameState.players.map((player, index) => <RacePlayer key={player.id} player={player} index={index} status={gameState.status}
        cameraId={cameraIds[player.id]} deviceLabel={devices.find(d => d.deviceId === cameraIds[player.id])?.label}
        recognition={recognition[player.id]} event={events[player.id]} celebration={celebrations[player.id]} timeLeft={gameState.remainingSeconds / gameState.durationSeconds}
        onRecognition={onRecognition} onCameraStatus={onCameraStatus} onSimulate={onSimulate} onSkip={onSkip} />)}
    </div>
  </section>;
}
