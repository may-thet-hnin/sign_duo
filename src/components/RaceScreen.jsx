import { useCallback } from 'react';
import Camera from './Camera.jsx';
import PixelSprite from './Pixel.jsx';
import RecognitionDebug from './RecognitionDebug.jsx';
import { SUPPORTED_SIGNS } from '../recognition/config.js';
import { raceFeedback } from '../utils/raceFeedback.js';
import { signContent } from '../utils/lessonContent.js';
import { recognitionProgress } from '../utils/learning.js';

function RacePlayer({ player, index, status, cameraId, deviceLabel, recognition, event, sequence, onRecognition, onCameraStatus, onSimulate }) {
  const cameraStatus = useCallback(next => onCameraStatus(player.id, next), [onCameraStatus, player.id]);
  const detected = recognition?.candidate || recognition?.letter;
  const progress = recognitionProgress(recognition, player.currentTarget, player.challengeId).progress;
  const sign = signContent(player.currentTarget);
  return <article className={`sd-player sd-player--${player.id}`}>
    <div className="sd-player-head">
      <span className="sd-tag">P{index + 1}</span><h3>{player.name}</h3>
      <span className="sd-badge">{player.hearts === null ? `${player.competitionScore} pts` : <><PixelSprite name="heart" scale={2} />×{player.hearts}</>}</span>
    </div>
    <div className="sd-player-body">
      <div className={`sd-target${sign?.movement ? ' sd-target--word' : ''}`} aria-label={`${player.name} current target`}>
        <span>Make this sign</span><strong>{player.currentTarget || '✓'}</strong>
        <span>Detected: <b>{detected || '—'}</b></span>
        <span className="sd-recognition-state">{recognition?.status === 'stable' ? sign?.movement ? 'Motion detected' : 'Stable handshape' : recognition?.status === 'tentative' ? sign?.movement ? 'Follow the movement' : 'Tentative · hold steady' : 'Looking for a sign'}</span>
        {sign?.movement && <p className="sd-word-guidance">{sign.movement}{sign.simplified ? ' Simplified: forehead position is not checked.' : ''}</p>}
      </div>
      <div className="sd-race-camera">
        {!player.finished && ['waiting', 'running'].includes(status) && <Camera deviceId={cameraId || undefined}
          challengeId={player.challengeId} targetSign={player.currentTarget} recognitionActive={status === 'running'}
          onRecognition={next => onRecognition(player.id, next)} onStatus={cameraStatus} />}
        {player.finished && <div className="sd-player-finished">✓ Sequence complete</div>}
        <p className="sd-caption">{deviceLabel || 'Default camera'}</p>
      </div>
    </div>
    <p className="sd-feedback" role="status">{status === 'waiting' ? recognition?.error || event || 'Preparing cameras…' : raceFeedback(player, recognition)}</p>
    <div className="sd-hold-progress" role="progressbar" aria-label={`${player.name} ${sign?.movement ? 'motion completion' : 'sign stability'}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}><span style={{ width: `${progress * 100}%` }} /></div>
    <p className="sd-attempt" key={player.lastAttempt?.timestamp ?? 'waiting'} data-correct={player.lastAttempt?.correct} aria-live="polite">
      {player.lastAttempt ? event : 'Hold a matching sign steadily to advance.'}
    </p>
    <div className="sd-race-progress">
      <span>Progress <b>{player.progress}/{sequence.length}</b></span>
      <div className="sd-bar" role="progressbar" aria-label={`${player.name} race progress`} aria-valuemin={0} aria-valuemax={sequence.length} aria-valuenow={player.progress}>
        <div className="sd-bar__fill" style={{ '--pct': `${player.progress / sequence.length * 100}%` }} />
      </div>
    </div>
    <div className="sd-letters" style={{ '--n': sequence.length }} aria-label={`${player.name} target letters`}>
      {sequence.map((letter, i) => <span key={i} title={letter} className={`${letter.length > 1 ? 'sd-sequence-word' : ''} ${i < player.progress ? 'complete' : i === player.progress ? 'current' : ''} ${i === player.progress - 1 ? 'just-completed' : ''}`}>{letter}</span>)}
    </div>
    <div className="sd-stats">
      <span>Correct <b>{player.correct}</b></span><span>Mistakes <b>{player.mistakes}</b></span>
      <span>Accuracy <b>{player.accuracy}%</b></span><span>SPM <b>{player.spm}</b></span>
    </div>
    {import.meta.env.DEV && <div className="sd-race-diagnostics">
      <RecognitionDebug result={recognition} target={player.currentTarget} />
      {status === 'running' && <details className="sd-debug"><summary>Developer tests (simulated, not camera)</summary>
        {SUPPORTED_SIGNS.competition.map(letter => <button key={letter} className="sd-button sd-button-secondary sd-small" onClick={() => onSimulate(player.id, letter)}>Simulate {letter}</button>)}
      </details>}
    </div>}
  </article>;
}

export default function RaceScreen({ gameState, mode, cameraIds, devices, recognition, events, onRecognition, onCameraStatus, onSimulate, onExit, sequence }) {
  const seconds = Math.max(0, Math.ceil(gameState.remainingSeconds));
  return <section className={`sd-race sd-race--${mode}`}>
    <header className="sd-race-header glass">
      <p className="sd-mode-tag">{mode === 'versus' ? 'Duo race' : 'Solo race'}<span>{gameState.durationSeconds}s round</span></p>
      <h2 className={`sd-clock${seconds <= 10 ? ' sd-clock--low' : ''}`}><b>{seconds}</b><span>{gameState.status === 'waiting' ? 'Preparing cameras' : 's remaining'}</span></h2>
      <button className="sd-button sd-button-secondary sd-small" onClick={onExit}>Exit race</button>
    </header>
    <p className="sd-race-hint">Hold letters steadily. Complete the motion for words. Release briefly for repeats; reopen both fingers to repeat NO.</p>
    <div className="sd-race-grid glass">
      {gameState.players.map((player, index) => <RacePlayer key={player.id} player={player} index={index} status={gameState.status}
        cameraId={cameraIds[player.id]} deviceLabel={devices.find(d => d.deviceId === cameraIds[player.id])?.label}
        recognition={recognition[player.id]} event={events[player.id]} sequence={sequence}
        onRecognition={onRecognition} onCameraStatus={onCameraStatus} onSimulate={onSimulate} />)}
    </div>
  </section>;
}
