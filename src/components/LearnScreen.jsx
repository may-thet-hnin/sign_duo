import { useEffect, useRef, useState } from 'react';
import Camera from './Camera.jsx';
import PixelSprite from './Pixel.jsx';
import RecognitionDebug from './RecognitionDebug.jsx';
import { COURSE_LESSONS, REFERENCE_URL } from '../utils/lessonContent.js';
import { SUPPORTED_SIGNS } from '../recognition/config.js';
import { emptyCourseProgress, parseCourseProgress, COURSE_PROGRESS_KEY, PROGRESS_KEY, updateLessonProgress, recordPractice, recordAnswer, advanceProgress, replayProgress, recognitionProgress, skipPractice } from '../utils/learning.js';
import '../styles/learning.css';

function SignReference({ sign, quiz = false, onReady }) {
  const [status, setStatus] = useState('loading');
  if (sign.simplified) return <figure className="learn-reference">
    <div className="learn-reference__image learn-motion" aria-label="Simplified open hand outward movement cue">
      <span aria-hidden="true" className="learn-motion__hand">✋</span>
      <p>Open hand → outward sweep</p>
    </div>
    <figcaption>Movement cue only. <a href={sign.referenceUrl} target="_blank" rel="noreferrer">Watch an ASL reference</a></figcaption>
  </figure>;
  return <figure className="learn-reference">
    <div className="learn-reference__image">
      <img src={sign.image} alt={quiz ? 'ASL handshape to identify' : sign.description}
        referrerPolicy="no-referrer" onLoad={() => { setStatus('ready'); onReady?.(true); }}
        onError={() => { setStatus('error'); onReady?.(false); }} hidden={status === 'error'} />
      {status === 'loading' && <span role="status">Loading reference…</span>}
      {status === 'error' && <p role="alert">Reference unavailable. Check your connection or open the ASL reference below.</p>}
    </div>
    <figcaption><a href={sign.referenceUrl || REFERENCE_URL} target="_blank" rel="noreferrer">Reference: ASL University / Lifeprint{sign.movement ? ' · Watch the movement' : ''}</a></figcaption>
  </figure>;
}

function ProgressBar({ value, label }) {
  return <div className="sd-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
    <div className="sd-bar__fill" style={{ '--pct': `${value}%` }} />
  </div>;
}

function Practice({ sign, onSuccess, onContinue, onSkip, previouslyPassed }) {
  const [recognition, setRecognition] = useState(null);
  const credited = useRef(false);
  const feedbackCandidate = useRef({ text: '', since: 0 });
  const [retry, setRetry] = useState(0);
  const attemptNumber = useRef(0);
  const sessionId = `practice:${sign.id}:${retry}`;
  const currentSession = useRef(sessionId);
  const [result, setResult] = useState({ progress: 0, complete: false });
  const [detected, setDetected] = useState(null);
  const [feedback, setFeedback] = useState('Show your hand to the camera to begin.');
  const [cameraStatus, setCameraStatus] = useState({ ready: false, error: null });

  // Camera reports stalled tracking itself ('tracking-paused'), so no second watchdog is needed here.
  function handleRecognition(next) {
    if (credited.current || next.challengeId && next.challengeId !== currentSession.current) return;
    setRecognition(next);
    const matching = (next.candidate || next.letter) === sign.letter;
    const progress = recognitionProgress(next, sign.letter, currentSession.current);
    const complete = progress.complete;
    setResult(progress);
    setDetected(next.candidate || next.letter || null);
    const text = next.status === 'error' ? `Recognition unavailable: ${next.error}`
      : next.status === 'loading' ? 'Loading sign recognition…'
      : next.status === 'no-hand' ? 'Show your hand to the camera.'
      : next.status === 'tracking-paused' ? 'Tracking paused. Show your hand again.'
      : next.status === 'out-of-frame' ? 'Make sure your entire hand is visible.'
      : !matching && next.candidate ? `I detected ${next.candidate}. Try making ${sign.letter}.`
      : matching ? sign.movement ? `${next.phase || 'Starting pose'} · ${sign.movement}` : 'Almost there! Hold your hand steady.'
      : 'I can see your hand, but cannot recognize the sign yet.';
    if (complete) {
      credited.current = true;
      setFeedback(sign.simplified ? 'HELLO practice motion detected. Forehead position was not checked.' : `Practice detected: ${sign.letter}.`);
      onSuccess(sign.letter);
      return;
    }
    const now = performance.now();
    if (feedbackCandidate.current.text !== text) feedbackCandidate.current = { text, since: now };
    if (next.status === 'error' || next.status === 'loading' || now - feedbackCandidate.current.since >= 200) setFeedback(text);
  }

  function tryAgain() {
    const nextAttempt = ++attemptNumber.current;
    currentSession.current = `practice:${sign.id}:${nextAttempt}`;
    credited.current = false;
    setResult({ progress: 0, complete: false });
    setDetected(null);
    setRecognition(null);
    setFeedback('Show your hand to the camera to begin.');
    feedbackCandidate.current = { text: '', since: 0 };
    setCameraStatus({ ready: false, error: null });
    setRetry(nextAttempt);
  }

  return <div className="learn-practice">
    <article className="learn-panel glass">
      <p className="learn-eyebrow">Camera practice</p>
      <h2>Practice <span className="learn-letter">{sign.letter}</span></h2>
      <SignReference sign={sign} />
      <ol className="learn-instructions">{sign.steps.map(step => <li key={step}>{step}</li>)}</ol>
      <p className="learn-tip">{sign.movement || 'Hold the sign steadily for about one second.'} Use one hand, good lighting, and keep your wrist and fingertips visible.</p>
      {sign.simplified && <p className="learn-note">Simplified HELLO practice checks open-hand motion only. It cannot verify forehead position or the complete ASL sign.</p>}
      <p className="learn-note">The preview is mirrored. Either hand is welcome; accuracy varies with angle and lighting.</p>
    </article>
    <article className={`learn-panel learn-camera glass ${result.complete ? 'learn-success' : ''}`}>
      <div className="learn-camera__heading"><h3>Your turn</h3><span className="learn-pill">Target {sign.letter}</span></div>
      <Camera key={retry} challengeId={sessionId} targetSign={sign.letter} recognitionActive={!result.complete} onRecognition={handleRecognition} onStatus={setCameraStatus} />
      <div className="learn-readouts"><span>{cameraStatus.error ? 'Camera needs attention' : cameraStatus.ready ? 'Hand tracking ready' : 'Preparing camera'}</span><span>Detected: <strong>{detected || '—'}</strong></span></div>
      <p className="learn-feedback" data-success={result.complete} role="status">
        {cameraStatus.error ? 'Allow camera access or check your connection, then try again.' : feedback}
      </p>
      <ProgressBar value={result.progress * 100} label={sign.movement ? 'Gesture motion completion' : 'Stable recognition'} />
      <p className="learn-note">{result.complete ? 'Practice detected. Great work!' : `${Math.round(result.progress * 100)}% · ${sign.movement ? 'Complete the movement' : 'Hold a matching sign steadily'}`}</p>
      {import.meta.env.DEV && <RecognitionDebug result={recognition} target={sign.letter} />}
      <div className="learn-actions">
        <button className="sd-button sd-button-secondary" onClick={tryAgain}>Try again</button>
        {!result.complete && !previouslyPassed && <button className="sd-button sd-button-secondary" onClick={onSkip}>Skip for now</button>}
        <button className="sd-button" disabled={!result.complete && !previouslyPassed} onClick={onContinue}>Continue</button>
      </div>
      {previouslyPassed && !result.complete && <p className="learn-note">This sign was already camera verified in this attempt. You can continue or practice again.</p>}
      {!result.complete && !previouslyPassed && <p className="learn-note">Stuck? Skip for now and come back by replaying the lesson. Skipped signs do not count as practiced.</p>}
    </article>
  </div>;
}

function KnowledgeCheck({ lesson, index, onSubmit, onContinue, savedAnswer }) {
  const sign = lesson.content.find(s => s.letter === lesson.quiz[index]);
  const words = lesson.category === 'words';
  const [selected, setSelected] = useState(savedAnswer || null);
  const [submitted, setSubmitted] = useState(Boolean(savedAnswer));
  const [imageReady, setImageReady] = useState(words);
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
    <p className="learn-eyebrow">Knowledge check {index + 1} / {lesson.quiz.length}</p>
    <h2>{words ? sign.quizCue : 'Which letter is this?'}</h2>
    <p>{words ? 'Choose the word whose movement matches the description.' : 'Look at the photo, choose a letter, then check your answer.'}</p>
    {!words && <SignReference sign={sign} quiz onReady={setImageReady} />}
    <form onSubmit={submit}>
      <fieldset disabled={submitted || !imageReady} className="learn-options">
        <legend>Choose one {words ? 'word' : 'letter'}</legend>
        {lesson.content.map(option => <label key={option.id} className={`learn-option${words ? ' learn-option--word' : ''}`}
          data-selected={selected === option.letter}
          data-state={submitted ? option.letter === sign.letter ? 'right' : option.letter === selected ? 'wrong' : undefined : undefined}>
          <input type="radio" name="sign" value={option.letter} checked={selected === option.letter} onChange={() => setSelected(option.letter)} />
          <span className="hl__key">{option.letter}</span><span>{words ? option.letter === 'HELLO' ? 'Simplified greeting practice' : 'Basic word' : `Letter ${option.letter}`}</span>
          {submitted && option.letter === sign.letter && <span className="learn-option__mark">Correct</span>}
        </label>)}
      </fieldset>
      <p className="learn-feedback" data-success={submitted && correct} role="status">
        {submitted ? correct ? 'Excellent! You identified the sign.' : `That was ${sign.letter}. ${sign.description}` : 'Your answer will appear here after you submit.'}
      </p>
      {!submitted && <button className="sd-button" disabled={!selected || !imageReady} type="submit">Check answer</button>}
      {submitted && <button className="sd-button" type="button" onClick={onContinue}>{index === lesson.quiz.length - 1 ? 'See results' : 'Next question'}</button>}
    </form>
  </article>;
}

export default function LearnScreen() {
  const [course, setCourse] = useState(() => {
    try { return parseCourseProgress(localStorage.getItem(COURSE_PROGRESS_KEY), localStorage.getItem(PROGRESS_KEY)); }
    catch { return emptyCourseProgress(); }
  });
  const [lessonId, setLessonId] = useState(COURSE_LESSONS[0].id);
  const [view, setView] = useState('dashboard');
  const [saveError, setSaveError] = useState(false);
  const headingRef = useRef(null);
  const lesson = COURSE_LESSONS.find(item => item.id === lessonId);
  const progress = course.lessons[lessonId];
  const position = progress.position;
  const sign = lesson.content[Math.min(lesson.content.length - 1, Math.floor(position / 2))];
  const quizScore = progress.answers.reduce((score, answer, i) => score + Number(answer === lesson.quiz[i]), 0);
  const mastered = new Set(Object.values(course.lessons).flatMap(p => p.mastered));
  const completedLessons = Object.values(course.lessons).filter(p => p.completed || p.completions > 0).length;
  const successfulAttempts = Object.values(course.lessons).reduce((sum, p) => sum + p.successfulAttempts, 0);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      try { localStorage.setItem(COURSE_PROGRESS_KEY, JSON.stringify(course)); setSaveError(false); }
      catch { setSaveError(true); }
    });
    return () => { active = false; };
  }, [course]);
  useEffect(() => { headingRef.current?.focus(); }, [view, position, lessonId]);

  function updateProgress(update) {
    setCourse(old => updateLessonProgress(old, lessonId, update));
  }
  function openLesson(id) {
    setLessonId(id);
    setView('lesson');
  }
  function replay(id = lessonId) {
    setCourse(old => updateLessonProgress(old, id, replayProgress));
    openLesson(id);
  }
  function advance() {
    updateProgress(old => advanceProgress(old, lesson));
  }

  return <section className="learning" aria-label="Sign language learning">
    <h2 ref={headingRef} tabIndex={-1} className="learn-heading">{view === 'dashboard' ? 'Master signs one lesson at a time.' : progress.completed ? `${lesson.title} completed!` : `${lesson.title} · ${position < lesson.practiceActivities ? sign.letter : 'Review'}`}</h2>
    {saveError && <p className="sd-error" role="alert">Your browser could not save progress. You can keep learning, but this attempt may be lost after a refresh.</p>}
    {view === 'dashboard' ? <>
      <p className="learn-intro">Each lesson teaches a small group of signs with guided references, camera practice, and knowledge checks. Take your time. There are no lost hearts here.</p>
      <div className="learn-summary glass">
        <div><strong>{mastered.size} / {SUPPORTED_SIGNS.learning.length}</strong><span>Signs practiced with camera</span></div>
        <div><strong>{completedLessons} / {COURSE_LESSONS.length}</strong><span>Lessons completed</span></div>
        <div><strong>{successfulAttempts}</strong><span>Successful practices</span></div>
      </div>
      {[['Alphabet', 'alphabet'], ['Basic Words', 'words']].map(([title, category]) => <section className="learn-category" aria-label={title} key={category}>
        <h3>{title}</h3>
        <div className="learn-lesson-grid">{COURSE_LESSONS.filter(item => item.category === category).map(item => {
          const saved = course.lessons[item.id];
          const score = saved.answers.reduce((total, answer, i) => total + Number(answer === item.quiz[i]), 0);
          return <article className="learn-panel glass" key={item.id}>
            <p className="learn-eyebrow">Lesson {COURSE_LESSONS.indexOf(item) + 1} · {category === 'words' ? 'Motion practice' : 'Alphabet'}</p>
            <h3>{item.title}</h3>
            <div className="learn-signs">{item.signs.map(letter => <span className="learn-pill" key={letter}>{letter}{saved.practiced.includes(letter) ? ' ✓' : saved.skipped.includes(letter) ? ' · skipped' : ''}</span>)}</div>
            <p>{item.signs.length} guided signs, {item.signs.length} camera practices, and {item.quiz.length} knowledge checks.</p>
            {category === 'words' && <p className="learn-note">HELLO is simplified motion practice; forehead position cannot be verified.</p>}
            <ProgressBar value={saved.position / item.activityCount * 100} label={`${item.title} lesson progress`} />
            <p className="learn-note">{saved.completed ? `Complete · Quiz ${score} / ${item.quiz.length}${saved.skipped.length ? ` · ${saved.skipped.length} skipped` : ''}` : saved.position > 0 ? `In progress · Activity ${saved.position + 1} / ${item.activityCount}` : `Ready when you are · ${item.activityCount} activities`}</p>
            {saved.completions > 0 && !saved.completed && <p className="learn-note">Previously completed · Replay in progress</p>}
            <button className="sd-button" onClick={() => saved.completed ? replay(item.id) : openLesson(item.id)}>{saved.completed ? 'Replay lesson' : saved.position > 0 ? 'Continue lesson' : 'Start lesson'}</button>
          </article>;
        })}</div>
      </section>)}
      <p className="learn-note">Recognition is an experimental practice aid. Words require motion; HELLO is simplified. An ASL teacher can help with technique and variations.</p>
    </> : <>
      <div className="learn-journey glass">
        <button className="sd-link" onClick={() => setView('dashboard')}>Back to lessons</button>
        <div><span>{progress.completed ? `${lesson.activityCount} / ${lesson.activityCount} activities complete` : `Activity ${position + 1} / ${lesson.activityCount} · ${position < lesson.practiceActivities ? position % 2 === 0 ? 'Learn & observe' : 'Camera practice' : 'Knowledge check'}`}</span><ProgressBar value={position / lesson.activityCount * 100} label={`${lesson.title} progress`} /></div>
      </div>
      {position < lesson.practiceActivities && position % 2 === 0 && <article className="learn-panel learn-guided glass" key={`${lessonId}:${position}`}>
        <div><p className="learn-eyebrow">Learn & observe</p><h2>Let's learn <span className="learn-letter">{sign.letter}</span></h2><SignReference sign={sign} /></div>
        <div><h3>{sign.name}</h3><ol className="learn-instructions">{sign.steps.map(step => <li key={step}>{step}</li>)}</ol>
          <p className="learn-tip"><strong>What to watch for</strong><br />{sign.mistake}</p>
          {sign.movement && <p className="learn-tip">{sign.movement}</p>}
          <button className="sd-button" onClick={advance}>Try it yourself</button>
          <p className="learn-note">Camera access is requested during practice. Your video stays in this browser.</p>
        </div>
      </article>}
      {position < lesson.practiceActivities && position % 2 === 1 && <Practice key={`${lessonId}:${position}`} sign={sign} onSuccess={letter => updateProgress(old => recordPractice(old, letter, lesson))} onContinue={advance} onSkip={() => updateProgress(old => skipPractice(old, lesson))} previouslyPassed={progress.practiced.includes(sign.letter)} />}
      {position >= lesson.practiceActivities && position < lesson.activityCount && <KnowledgeCheck key={`${lessonId}:${position}`} lesson={lesson} index={position - lesson.practiceActivities} savedAnswer={progress.answers[position - lesson.practiceActivities]}
        onSubmit={answer => updateProgress(old => recordAnswer(old, answer, lesson))} onContinue={advance} />}
      {progress.completed && <article className="learn-panel learn-complete glass">
        <PixelSprite name="trophy" scale={7} /><h3>{lesson.title} complete.</h3>
        <p>{progress.practiced.length ? `You practiced ${progress.practiced.join(', ')} with the camera.` : 'You finished the lesson without camera practice.'} Keep practicing at a comfortable pace.</p>
        <div className="learn-signs">{progress.practiced.map(letter => <span className="learn-pill" key={letter}>{letter} ✓</span>)}</div>
        {progress.skipped.length > 0 && <p className="learn-note">Skipped for now: {progress.skipped.join(', ')}. Replay the lesson to practice {progress.skipped.length === 1 ? 'it' : 'them'} with the camera.</p>}
        <p className="learn-score">Quiz score: {quizScore} / {lesson.quiz.length} ({Math.round(quizScore / lesson.quiz.length * 100)}%)</p>
        <p>{quizScore === lesson.quiz.length ? 'Excellent recall! Try these signs again in a race.' : 'Every review helps. Replay the lesson to build your recall.'}</p>
        <div className="learn-actions"><button className="sd-button" onClick={() => replay()}>Replay lesson</button><button className="sd-button sd-button-secondary" onClick={() => setView('dashboard')}>Back to lessons</button></div>
      </article>}
    </>}
  </section>;
}
