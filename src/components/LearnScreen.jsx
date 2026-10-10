import { useEffect, useRef, useState } from "react";
import PixelSprite from "./Pixel.jsx";

/* ---------- Lesson content: edit or extend freely ---------- */
// Put sign images in your public folder (e.g. /public/signs/a.png) and set `image`.
// Without an image, a placeholder with the letter is shown.
export const LESSONS = [
  {
    id: "a", letter: "A", name: "Fist with thumb alongside",
    image: null,
    steps: ["Make a fist.", "Rest your thumb along the side of your index finger.", "Keep your palm facing forward."],
    clue: "A closed fist with the thumb resting against the side of the index finger",
  },
  {
    id: "b", letter: "B", name: "Flat hand",
    image: null,
    steps: ["Hold your fingers straight up and pressed together.", "Fold your thumb across your palm.", "Palm faces forward."],
    clue: "Straight, joined fingers pointing up with the thumb folded across the palm",
  },
  {
    id: "c", letter: "C", name: "Curved hand",
    image: null,
    steps: ["Curve your fingers together.", "Curve your thumb to match.", "The gap between them forms a C."],
    clue: "Fingers and thumb curved to make the shape of the letter C",
  },
  {
    id: "l", letter: "L", name: "L shape",
    image: null,
    steps: ["Point your index finger up.", "Stick your thumb out to the side.", "Curl the other three fingers down."],
    clue: "Index finger up and thumb out to the side, other fingers curled",
  },
  {
    id: "v", letter: "V", name: "Peace sign",
    image: null,
    steps: ["Raise your index and middle fingers.", "Spread them apart.", "Fold the other fingers down under your thumb."],
    clue: "Index and middle fingers raised and spread apart, others folded down",
  },
  {
    id: "y", letter: "Y", name: "Thumb and pinky out",
    image: null,
    steps: ["Extend your thumb and pinky.", "Curl the other three fingers into your palm.", "Keep your wrist relaxed."],
    clue: "Thumb and little finger extended, the other three fingers curled in",
  },
];

const MAX_LIVES = 3;
const POINTS_QUIZ = 10;
const POINTS_PRACTICE = 5;

function Heart({ lost }) {
  return <span className="hl__heart" data-lost={lost}><PixelSprite name="heart" scale={4} /></span>;
}

const SPRITE_LETTERS = ["A", "B", "C", "L", "V", "Y"];

function SignImage({ lesson }) {
  return (
    <div className="hl__img">
      {lesson.image ? (
        <img src={lesson.image} alt={`Handshape for the letter ${lesson.letter}`} />
      ) : SPRITE_LETTERS.includes(lesson.letter) ? (
        <PixelSprite name={lesson.letter} scale={16} label={`Handshape for the letter ${lesson.letter}`} />
      ) : (
        <span className="hl__big" aria-hidden="true">{lesson.letter}</span>
      )}
    </div>
  );
}

// Three options, with the correct one in a position that varies by lesson.
function buildOptions(idx, lessons) {
  const n = lessons.length;
  const opts = [lessons[idx], lessons[(idx + 1) % n], lessons[(idx + 2) % n]];
  const shift = idx % 3;
  return opts.map((_, i) => opts[(i + shift) % 3]);
}

export default function HandshapeLessons({ lessons = LESSONS, onFinish }) {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState("learn"); // learn | quiz | practice | done | failed
  const [lives, setLives] = useState(MAX_LIVES);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState(null);
  const [stream, setStream] = useState(null);
  const [camError, setCamError] = useState(false);
  const videoRef = useRef(null);

  const lesson = lessons[idx];
  const options = buildOptions(idx, lessons);
  const completed = phase === "done" ? lessons.length : idx;
  const pct = Math.round((completed / lessons.length) * 100);

  // Camera runs only during the practice step.
  useEffect(() => {
    if (phase !== "practice") return undefined;
    let active = true;
    let current = null;
    setCamError(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError(true);
      return undefined;
    }
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((s) => {
        if (!active) { s.getTracks().forEach((t) => t.stop()); return; }
        current = s;
        setStream(s);
      })
      .catch(() => active && setCamError(true));
    return () => {
      active = false;
      if (current) current.getTracks().forEach((t) => t.stop());
      setStream(null);
    };
  }, [phase, idx]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  function pick(opt) {
    if (picked) return;
    setPicked(opt.id);
    if (opt.id === lesson.id) {
      setScore((s) => s + POINTS_QUIZ);
    } else {
      setLives((l) => Math.max(0, l - 1));
    }
  }

  function afterQuiz() {
    const out = lives <= 0;
    setPicked(null);
    setPhase(out ? "failed" : "practice");
  }

  function finishPractice(gotIt) {
    if (gotIt) setScore((s) => s + POINTS_PRACTICE);
    if (idx + 1 >= lessons.length) {
      setPhase("done");
      if (onFinish) onFinish({ score: score + (gotIt ? POINTS_PRACTICE : 0), lives });
    } else {
      setIdx(idx + 1);
      setPhase("learn");
    }
  }

  function restart() {
    setIdx(0); setPhase("learn"); setLives(MAX_LIVES); setScore(0); setPicked(null);
  }

  return (
    <section className="hl" aria-label="Handshape lessons">
      <header className="hl__top glass">
        <div className="hl__hearts" role="img" aria-label={`${lives} of ${MAX_LIVES} lives left`}>
          {Array.from({ length: MAX_LIVES }, (_, i) => <Heart key={i} lost={i >= lives} />)}
        </div>
        <div className="hl__track sd-bar" role="progressbar" aria-label="Lesson progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="sd-bar__fill" style={{ "--pct": `${pct}%` }} />
        </div>
        <div className="hl__score">{score}<small> pts</small></div>
      </header>

      {phase === "learn" && (
        <div className="hl__card glass">
          <p className="hl__tag">Lesson {idx + 1} of {lessons.length}</p>
          <h2 className="hl__h">Letter {lesson.letter}</h2>
          <p className="hl__sub">{lesson.name}</p>
          <SignImage lesson={lesson} />
          <ol className="hl__steps">
            {lesson.steps.map((s) => <li key={s}>{s}</li>)}
          </ol>
          <button className="hl__btn" onClick={() => setPhase("quiz")}>Check yourself</button>
        </div>
      )}

      {phase === "quiz" && (
        <div className="hl__card glass">
          <p className="hl__tag">Quick check</p>
          <h2 className="hl__h">Which letter is this?</h2>
          <p className="hl__sub">{lesson.clue}</p>
          <div className="hl__opts">
            {options.map((o) => {
              let state;
              if (picked) {
                if (o.id === lesson.id) state = "right";
                else if (o.id === picked) state = "wrong";
              }
              return (
                <button key={o.id} className="hl__opt" data-state={state} disabled={!!picked} onClick={() => pick(o)}>
                  <span className="hl__key">{o.letter}</span><span>{o.name}</span>
                </button>
              );
            })}
          </div>
          <p className="hl__msg" data-ok={picked ? String(picked === lesson.id) : undefined} aria-live="polite">
            {picked && (picked === lesson.id ? `Correct! +${POINTS_QUIZ} points` : "Not quite. You lost a heart.")}
          </p>
          <button className="hl__btn" disabled={!picked} onClick={afterQuiz}>Continue</button>
        </div>
      )}

      {phase === "practice" && (
        <div className="hl__card glass">
          <p className="hl__tag">Your turn</p>
          <h2 className="hl__h">Make the letter {lesson.letter}</h2>
          <p className="hl__sub">{lesson.clue}</p>
          <div className="hl__cam sd-viewfinder">
            {stream ? (
              <video ref={videoRef} className="hl__video" autoPlay playsInline muted />
            ) : (
              <div className="hl__camtxt">
                {camError
                  ? "Camera isn't available. You can still practice and self-check."
                  : "Starting camera…"}
              </div>
            )}
          </div>
          <button className="hl__btn" onClick={() => finishPractice(true)}>I got it (+{POINTS_PRACTICE})</button>
          <button className="hl__btn hl__btn--ghost" onClick={() => finishPractice(false)}>Skip for now</button>
        </div>
      )}

      {phase === "done" && (
        <div className="hl__card glass">
          <p className="hl__tag">Complete</p>
          <h2 className="hl__h">Nice work!</h2>
          <p className="hl__sub">You finished {lessons.length} handshapes and scored {score} points.</p>
          <button className="hl__btn" onClick={restart}>Practice again</button>
        </div>
      )}

      {phase === "failed" && (
        <div className="hl__card glass">
          <p className="hl__tag">Out of hearts</p>
          <h2 className="hl__h">Let's try that again</h2>
          <p className="hl__sub">You reached lesson {idx + 1} and scored {score} points.</p>
          <button className="hl__btn" onClick={restart}>Restart</button>
        </div>
      )}
    </section>
  );
}

/* Usage

import HandshapeLessons from "./HandshapeLessons";

export default function LearnScreen() {
  return <HandshapeLessons onFinish={({ score }) => console.log("done", score)} />;
}
*/
