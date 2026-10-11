import { useState } from 'react';
import Camera from './Camera.jsx';
import PixelSprite from './Pixel.jsx';
import SuccessBurst from './SuccessBurst.jsx';
import ResultsReveal from './ResultsReveal.jsx';
import { SUCCESS_PAUSE_MS } from '../recognition/config.js';
import { TEST_LENGTH, startTest, recordSign, firstTryScore, coachMessage } from '../utils/understandingTest.js';
import { recognitionProgress } from '../utils/learning.js';

function statusText(recognition, target) {
  switch (recognition?.status) {
    case 'error': return `Recognition unavailable: ${recognition.error}`;
    case 'loading': return 'Loading sign recognition…';
    case 'no-hand': return 'Show your hand to the camera.';
    case 'tracking-paused': return 'Tracking paused. Show your hand again.';
    case 'out-of-frame': return 'Make sure your entire hand is visible.';
    default: break;
  }
  const detected = recognition?.candidate || recognition?.letter;
  if (!recognition) return 'Show your hand to the camera to begin.';
  if (!detected) return 'I can see your hand, but cannot recognize the sign yet.';
  if (detected !== target && recognition.lockedLetter === detected) return `You already got ${detected}. Now make ${target}.`;
  return detected === target ? `Hold ${target} steady…` : `Detected ${detected}. Try making ${target}.`;
}

/**
 * "Test your understanding": six random signs from one lesson, no timer and
 * no skipping. A coach panel explains mistakes and a ghost hand shows the
 * target handshape over the camera view.
 */
export default function UnderstandingTest({ lesson, onFinish, onExit }) {
  const [run, setRun] = useState(() => ({ id: 1, test: startTest(lesson.signs) }));
  const [recognition, setRecognition] = useState(null);
  const [lastMistake, setLastMistake] = useState(null);
  const [showGhost, setShowGhost] = useState(true);
  // Success burst after a correct sign; recognition pauses while it shows.
  const [celebration, setCelebration] = useState(null);
  const { test } = run;
  const target = test.sequence[test.index] ?? null;
  const challengeId = `test:${run.id}:${test.index}`;

  function handleRecognition(next) {
    if (test.done || (next.challengeId && next.challengeId !== challengeId)) return;
    setRecognition(next);
    if (!(next.isNew && next.status === 'stable' && next.letter)) return;
    const updated = recordSign(test, next.letter);
    setLastMistake(next.letter === target ? null : { index: test.index, detected: next.letter });
    setRun(current => ({ ...current, test: updated }));
    if (next.letter === target && !updated.done) {
      const id = `${run.id}:${test.index}`;
      setCelebration({ id, sign: target, next: updated.sequence[updated.index] });
      setTimeout(() => setCelebration(current => current?.id === id ? null : current), SUCCESS_PAUSE_MS);
    }
    if (updated.done) onFinish(firstTryScore(updated));
  }

  function retake() {
    setRun(current => ({ id: current.id + 1, test: startTest(lesson.signs) }));
    setRecognition(null);
    setLastMistake(null);
    setCelebration(null);
  }

  if (test.done) {
    const score = firstTryScore(test);
    const missed = test.items.filter(item => item.mistakes.length);
    return <ResultsReveal key={run.id} title="TEST COMPLETE!" subtitle={`${score} / ${TEST_LENGTH} right on the first try`}>
      <article className="learn-panel learn-complete glass">
      <PixelSprite name="trophy" scale={7} />
      <h3>Test complete</h3>
      <p className="learn-score">{score} / {TEST_LENGTH} right on the first try</p>
      {missed.length ? <div className="learn-test-review">
        <p>Signs to review:</p>
        <ul>{missed.map((item, i) => {
          const coach = coachMessage(item.sign, item.mistakes[0]);
          return <li key={i}><strong>{item.sign}</strong>: you signed {item.mistakes.join(', then ')} first. {coach.tip}</li>;
        })}</ul>
      </div> : <p>Every sign was right the first time. Excellent!</p>}
      <div className="learn-actions">
        <button className="sd-button" onClick={retake}>Take another test</button>
        <button className="sd-button sd-button-secondary" onClick={onExit}>Back to lessons</button>
      </div>
    </article>
    </ResultsReveal>;
  }

  const current = recognition?.challengeId === challengeId ? recognition : null;
  const candidate = current?.candidate || current?.letter;
  const mistakeHere = lastMistake?.index === test.index ? lastMistake.detected : null;
  // Still holding the sign just accepted is not a mistake: coach the next sign instead.
  const stillHolding = candidate && candidate !== target && current?.lockedLetter === candidate;
  const wrongNow = candidate && candidate !== target && !stillHolding;
  const coach = coachMessage(target, wrongNow ? candidate : mistakeHere);
  const progress = recognitionProgress(current, target, challengeId).progress;
  const pastMistakes = test.items.slice(0, test.index + 1).flatMap((item, i) => item.mistakes.map(letter => ({ i, sign: item.sign, letter })));

  return <div className="learn-practice">
    <article className="learn-panel glass">
      <p className="learn-eyebrow">Test your understanding</p>
      <h2>Sign <span className="learn-letter">{target}</span></h2>
      <div className="sd-letters" style={{ '--n': TEST_LENGTH }} aria-label="Test signs">
        {test.items.map((item, i) => <span key={i} title={item.sign}
          className={`${item.sign.length > 1 ? 'sd-sequence-word' : ''} ${i < test.index ? 'complete' : i === test.index ? 'current' : ''} ${item.mistakes.length ? 'had-mistake' : ''}`}>
          {i < test.index || i === test.index ? item.sign : '?'}
        </span>)}
      </div>
      <section className={`learn-coach${mistakeHere || wrongNow ? ' learn-coach--correcting' : ''}`} aria-live="polite">
        <h3>{coach.title}</h3>
        {coach.steps && <ol className="learn-instructions">{coach.steps.map(step => <li key={step}>{step}</li>)}</ol>}
        {coach.detail && <p>{coach.detail}</p>}
        {coach.want && <p>{coach.want}</p>}
        <p className="learn-tip">{coach.tip}</p>
      </section>
      {pastMistakes.length > 0 && <div className="learn-test-review">
        <p>Mistakes so far:</p>
        <ul>{pastMistakes.map((m, k) => <li key={k}>Sign {m.i + 1} ({m.sign}): signed {m.letter}</li>)}</ul>
      </div>}
    </article>
    <article className="learn-panel learn-camera glass">
      <div className="learn-camera__heading"><h3>Your turn</h3><span className="learn-pill">Sign {test.index + 1} / {TEST_LENGTH}</span></div>
      <div className="sd-success-host">
        <Camera challengeId={challengeId} targetSign={target} recognitionActive={!test.done && !celebration} trackingPaused={Boolean(celebration)}
          ghost={showGhost && !celebration ? target : null} onRecognition={handleRecognition} />
        {celebration && <SuccessBurst key={celebration.id} sign={celebration.sign} next={celebration.next} />}
      </div>
      <div className="learn-readouts">
        <label className="learn-ghost-toggle"><input type="checkbox" checked={showGhost} onChange={event => setShowGhost(event.target.checked)} /> Ghost hand guide</label>
        <span>Detected: <strong>{candidate || '—'}</strong></span>
      </div>
      <p className="learn-feedback" data-success={Boolean(celebration)} role="status">{celebration ? `Correct! Get ready for ${celebration.next}…` : statusText(current ?? recognition, target)}</p>
      <div className="sd-bar" role="progressbar" aria-label="Sign recognition" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <div className="sd-bar__fill" style={{ '--pct': `${progress * 100}%` }} />
      </div>
      <p className="learn-note">{showGhost ? 'Match your hand to the dashed ghost. ' : ''}Hold the sign steadily to move on. There is no timer.</p>
      <div className="learn-actions">
        <button className="sd-button sd-button-secondary" onClick={onExit}>End test</button>
      </div>
    </article>
  </div>;
}
