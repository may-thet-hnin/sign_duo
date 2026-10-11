import { useEffect, useRef, useState } from 'react';
import Camera from './Camera.jsx';
import PixelSprite from './Pixel.jsx';
import { recognizeLetter } from '../utils/recognizeLetter.js';
import { LESSONS, QUIZ_SIGNS, REFERENCE_URL } from '../utils/lessonContent.js';
import { PracticeHold, handInFrame, emptyProgress, parseProgress, PROGRESS_KEY, recordPractice, recordAnswer, advanceProgress, replayProgress } from '../utils/learning.js';
import '../styles/learning.css';

function SignReference({ sign, quiz = false, onReady }) {
  const [status, setStatus] = useState('loading');
  return <figure className="learn-reference">
    <div className="learn-reference__image">
      <img src={sign.image} alt={quiz ? 'ASL handshape to identify' : sign.description}
        referrerPolicy="no-referrer" onLoad={() => { setStatus('ready'); onReady?.(true); }}
        onError={() => { setStatus('error'); onReady?.(false); }} hidden={status === 'error'} />
      {status === 'loading' && <span role="status">Loading reference…</span>}
      {status === 'error' && <p role="alert">Reference unavailable. Check your connection and reload before taking the quiz.</p>}
    </div>
    <figcaption><a href={REFERENCE_URL} target="_blank" rel="noreferrer">Photo: ASL University / Lifeprint</a></figcaption>
  </figure>;
}

function ProgressBar({ value, label }) {
  return <div className="sd-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
    <div className="sd-bar__fill" style={{ '--pct': `${value}%` }} />
  </div>;
}

function Practice({ sign, onSuccess, onContinue, previouslyPassed }) {
  const hold = useRef(new PracticeHold(sign.letter));
  const credited = useRef(false);
  const feedbackCandidate = useRef({ text: '', since: 0 });
  const lastFrame = useRef(null);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState({ progress: 0, complete: false });
  const [detected, setDetected] = useState(null);
  const [feedback, setFeedback] = useState('Show your hand to the camera to begin.');
  const [cameraStatus, setCameraStatus] = useState({ ready: false, error: null });

  useEffect(() => {
    const watchdog = setInterval(() => {
      if (!credited.current && lastFrame.current !== null && performance.now() - lastFrame.current > 300) {
        hold.current.reset();
        lastFrame.current = null;
        setResult({ progress: 0, complete: false });
        setDetected(null);
        setFeedback('Tracking paused. Show your hand to the camera again.');
      }
    }, 150);
    return () => clearInterval(watchdog);
  }, []);

  function handleLandmarks(points) {
    if (credited.current) return;
    const now = performance.now();
    lastFrame.current = now;
    const inFrame = handInFrame(points);
    const letter = inFrame ? recognizeLetter(points) : null;
    const next = hold.current.update(letter, now);
    setResult(next);
    setDetected(letter);
    let text = !points ? 'Place your hand inside the camera frame.'
      : !inFrame ? 'Move your hand back so it is fully visible.'
      : !letter ? 'Adjust your hand position and try again.'
      : letter !== sign.letter ? `I can see a ${letter}. Try making an ${sign.letter}.`
      : 'Almost there! Hold your hand steady.';
    if (next.complete) {
      credited.current = true;
      text = `Correct! You’re signing ${sign.letter}!`;
      setFeedback(text);
      onSuccess(sign.letter);
      return;
    }
    if (feedbackCandidate.current.text !== text) feedbackCandidate.current = { text, since: now };
    if (now - feedbackCandidate.current.since >= 200) setFeedback(text);
  }

  function tryAgain() {
    hold.current.reset();
    credited.current = false;
    setResult({ progress: 0, complete: false });
    setDetected(null);
    setFeedback('Show your hand to the camera to begin.');
    feedbackCandidate.current = { text: '', since: 0 };
    lastFrame.current = null;
    setCameraStatus({ ready: false, error: null });
    setRetry(n => n + 1);
  }

  return <div className="learn-practice">
    <article className="learn-panel glass">
      <p className="learn-eyebrow">Camera practice</p>
      <h2>Make the letter <span className="learn-letter">{sign.letter}</span></h2>
      <SignReference sign={sign} />
      <ol className="learn-instructions">{sign.steps.map(step => <li key={step}>{step}</li>)}</ol>
      <p className="learn-tip">Use one hand, good lighting, and keep your wrist and fingertips visible. Hold the recognized sign for 1.5 seconds.</p>
      <p className="learn-note">The preview is mirrored. Either hand is welcome; accuracy varies with angle and lighting.</p>
    </article>
    <article className={`learn-panel learn-camera glass ${result.complete ? 'learn-success' : ''}`}>
      <div className="learn-camera__heading"><h3>Your turn</h3><span className="learn-pill">Target {sign.letter}</span></div>
      <Camera key={retry} onLandmarks={handleLandmarks} onStatus={setCameraStatus} />
      <div className="learn-readouts"><span>{cameraStatus.error ? 'Camera needs attention' : cameraStatus.ready ? 'Hand tracking ready' : 'Preparing camera'}</span><span>Detected: <strong>{detected || '—'}</strong></span></div>
      <p className="learn-feedback" data-success={result.complete} role="status">
        {cameraStatus.error ? 'Allow camera access or check your connection, then try again.' : feedback}
      </p>
      <ProgressBar value={result.progress * 100} label="Stable recognition" />
      <p className="learn-note">{result.complete ? 'Practice verified. Great work!' : `${Math.round(result.progress * 100)}% · Hold a matching sign steadily`}</p>
      <div className="learn-actions">
        <button className="sd-button sd-button-secondary" onClick={tryAgain}>Try again</button>
        <button className="sd-button" disabled={!result.complete && !previouslyPassed} onClick={onContinue}>Continue</button>
      </div>
      {previouslyPassed && !result.complete && <p className="learn-note">This sign was already camera verified in this attempt. You can continue or practice again.</p>}
    </article>
  </div>;
}

function KnowledgeCheck({ index, onSubmit, onContinue, savedAnswer }) {
  const sign = LESSONS.find(s => s.letter === QUIZ_SIGNS[index]);
  const [selected, setSelected] = useState(savedAnswer || null);
  const [submitted, setSubmitted] = useState(Boolean(savedAnswer));
  const [imageReady, setImageReady] = useState(false);
  const submissionLock = useRef(Boolean(savedAnswer));
  const correct = selected === sign.letter;
  function submit(event) {
    event.preventDefault();
    if (!selected || !imageReady || submissionLock.current) return;
    submissionLock.current = true;
    setSubmitted(true);
    onSubmit(selected);
  }
  return <article className="learn-panel learn-quiz glass">
    <p className="learn-eyebrow">Knowledge check {index + 1} / 3</p>
    <h2>Which letter is this?</h2>
    <p>Look at the photo, choose a letter, then check your answer.</p>
    <SignReference sign={sign} quiz onReady={setImageReady} />
    <form onSubmit={submit}>
      <fieldset disabled={submitted || !imageReady} className="learn-options">
        <legend>Choose one letter</legend>
        {LESSONS.map(option => <label key={option.id} className="learn-option"
          data-selected={selected === option.letter}
          data-state={submitted ? option.letter === sign.letter ? 'right' : option.letter === selected ? 'wrong' : undefined : undefined}>
          <input type="radio" name="letter" value={option.letter} checked={selected === option.letter} onChange={() => setSelected(option.letter)} />
          <span className="hl__key">{option.letter}</span><span>Letter {option.letter}</span>
          {submitted && option.letter === sign.letter && <span className="learn-option__mark">Correct</span>}
        </label>)}
      </fieldset>
      <p className="learn-feedback" data-success={submitted && correct} role="status">
        {submitted ? correct ? 'Excellent! You identified the sign.' : `That was ${sign.letter}. ${sign.description}` : 'Your answer will appear here after you submit.'}
      </p>
      {!submitted && <button className="sd-button" disabled={!selected || !imageReady} type="submit">Check answer</button>}
      {submitted && <button className="sd-button" type="button" onClick={onContinue}>{index === 2 ? 'See results' : 'Next question'}</button>}
    </form>
  </article>;
}

export default function LearnScreen() {
  const [progress, setProgress] = useState(() => {
    try { return parseProgress(localStorage.getItem(PROGRESS_KEY)); }
    catch { return emptyProgress(); }
  });
  const [view, setView] = useState('dashboard');
  const [saveError, setSaveError] = useState(false);
  const headingRef = useRef(null);
  const position = progress.position;
  const sign = LESSONS[Math.min(2, Math.floor(position / 2))];
  const quizScore = progress.answers.reduce((score, answer, i) => score + Number(answer === QUIZ_SIGNS[i]), 0);

  useEffect(() => {
    // Storage is an external system; report failures after the sync completes.
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); setSaveError(false); }
      catch { setSaveError(true); }
    });
    return () => { active = false; };
  }, [progress]);
  useEffect(() => { headingRef.current?.focus(); }, [view, position]);

  function replay() {
    setProgress(replayProgress);
    setView('lesson');
  }
  function practiceSuccess(letter) {
    setProgress(old => recordPractice(old, letter));
  }
  function advance() {
    setProgress(advanceProgress);
  }

  return <section className="learning" aria-label="Sign language learning">
    <h2 ref={headingRef} tabIndex={-1} className="learn-heading">{view === 'dashboard' ? 'Master signs one step at a time.' : position === 9 ? 'Lesson completed!' : `Getting started · ${position < 6 ? sign.letter : 'Review'}`}</h2>
    {saveError && <p className="sd-error" role="alert">Your browser could not save progress. You can keep learning, but this attempt may be lost after a refresh.</p>}
    {view === 'dashboard' ? <>
      <p className="learn-intro">Learn the handshape, observe a reference, practice with your camera, and check what you remember. Take your time—there are no lost hearts here.</p>
      <div className="learn-summary glass">
        <div><strong>{progress.mastered.length} / 3</strong><span>Signs camera verified</span></div>
        <div><strong>{progress.completions}</strong><span>Lessons completed</span></div>
        <div><strong>{progress.successfulAttempts}</strong><span>Successful practices</span></div>
      </div>
      <div className="learn-lesson-grid">
        <article className="learn-panel glass">
          <p className="learn-eyebrow">Lesson 1 · Camera supported</p><h3>Getting started</h3>
          <div className="learn-signs">{LESSONS.map(s => <span key={s.id} className="learn-pill">{s.letter}{progress.practiced.includes(s.letter) ? ' ✓' : ''}</span>)}</div>
          <p>Three guided signs, three camera practices, and a short knowledge check.</p>
          <ProgressBar value={position / 9 * 100} label="Getting started lesson progress" />
          <p className="learn-note">{progress.completed ? `Complete · Quiz ${quizScore} / 3` : position > 0 ? `In progress · Activity ${position + 1} / 9` : 'Ready when you are · 9 activities'}</p>
          <button className="sd-button" onClick={() => progress.completed ? replay() : setView('lesson')}>{progress.completed ? 'Replay lesson' : position > 0 ? 'Continue lesson' : 'Start lesson'}</button>
        </article>
        <article className="learn-panel learn-coming glass">
          <p className="learn-eyebrow">Lesson 2 · Coming soon</p><h3>More letters</h3>
          <p>New lessons will unlock when more signs can be recognized reliably.</p><span className="learn-pill">Coming soon</span>
        </article>
      </div>
      <p className="learn-note">Live evaluation supports A, B, and L using experimental handshape rules. It is a practice aid; an ASL teacher can help with technique and variations.</p>
    </> : <>
      <div className="learn-journey glass">
        <button className="sd-link" onClick={() => setView('dashboard')}>Back to learning</button>
        <div><span>{position === 9 ? '9 / 9 activities complete' : `Activity ${position + 1} / 9 · ${position < 6 ? position % 2 === 0 ? 'Learn & observe' : 'Camera practice' : 'Knowledge check'}`}</span><ProgressBar value={position / 9 * 100} label="Lesson progress" /></div>
      </div>
      {position < 6 && position % 2 === 0 && <article className="learn-panel learn-guided glass" key={position}>
        <div><p className="learn-eyebrow">Learn & observe</p><h2>Let’s learn <span className="learn-letter">{sign.letter}</span></h2><SignReference sign={sign} /></div>
        <div><h3>{sign.name}</h3><ol className="learn-instructions">{sign.steps.map(step => <li key={step}>{step}</li>)}</ol>
          <p className="learn-tip"><strong>What to watch for</strong><br />{sign.mistake}</p>
          <button className="sd-button" onClick={advance}>Try it yourself</button>
          <p className="learn-note">Camera access is requested during practice. Your video stays in this browser.</p>
        </div>
      </article>}
      {position < 6 && position % 2 === 1 && <Practice key={position} sign={sign} onSuccess={practiceSuccess} onContinue={advance} previouslyPassed={progress.practiced.includes(sign.letter)} />}
      {position >= 6 && position < 9 && <KnowledgeCheck key={position} index={position - 6} savedAnswer={progress.answers[position - 6]}
        onSubmit={answer => setProgress(old => recordAnswer(old, answer))} onContinue={advance} />}
      {position === 9 && <article className="learn-panel learn-complete glass">
        <PixelSprite name="trophy" scale={7} /><h3>You built a strong start.</h3>
        <p>You camera verified A, B, and L. Keep practicing at a comfortable pace.</p>
        <div className="learn-signs">{progress.practiced.map(letter => <span className="learn-pill" key={letter}>{letter} ✓</span>)}</div>
        <p className="learn-score">Quiz score: {quizScore} / 3 ({Math.round(quizScore / 3 * 100)}%)</p>
        <p>{quizScore === 3 ? 'Excellent recall! Try these signs again in a race.' : 'Every review helps. Replay the lesson to build your recall.'}</p>
        <div className="learn-actions"><button className="sd-button" onClick={replay}>Replay lesson</button><button className="sd-button sd-button-secondary" onClick={() => setView('dashboard')}>Back to learning</button></div>
      </article>}
    </>}
  </section>;
}
