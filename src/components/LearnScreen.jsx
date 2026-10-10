import { useEffect, useRef, useState } from "react";

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

const css = `
.hl { --bg:#fff; --fg:#1a1a1a; --muted:#6b6b66; --line:#e4e2db; --soft:#f6f5f1;
  --accent:#2f6fed; --accent-fg:#fff; --good:#1f8a4c; --bad:#d9363e;
  max-width:460px; margin:0 auto; padding:16px; color:var(--fg);
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif; }
@media (prefers-color-scheme: dark) {
  .hl { --bg:#1f1f1d; --fg:#f2f1ec; --muted:#a3a29a; --line:#37362f; --soft:#2a2a27;
    --accent:#6f9bff; --accent-fg:#101010; --good:#4fc47f; --bad:#ff6b73; }
}
.hl * { box-sizing:border-box; }
.hl__top { display:flex; align-items:center; gap:12px; margin-bottom:14px; }
.hl__track { flex:1; height:8px; background:var(--soft); border-radius:4px; overflow:hidden; }
.hl__fill { height:100%; background:var(--accent); border-radius:4px; transition:width .4s ease; }
.hl__hearts { display:flex; gap:3px; color:var(--bad); }
.hl__heart { width:20px; height:20px; transition:opacity .2s; }
.hl__heart[data-lost="true"] { opacity:.25; }
.hl__score { font-size:14px; font-weight:500; min-width:52px; text-align:right; font-variant-numeric:tabular-nums; }
.hl__card { background:var(--bg); border:1px solid var(--line); border-radius:12px; padding:20px; }
.hl__tag { font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; margin:0 0 8px; }
.hl__h { margin:0 0 4px; font-size:22px; font-weight:500; }
.hl__sub { margin:0 0 16px; color:var(--muted); font-size:14px; }
.hl__img { aspect-ratio:4/3; width:100%; border-radius:10px; background:var(--soft);
  display:flex; align-items:center; justify-content:center; overflow:hidden; margin-bottom:16px; }
.hl__img img { width:100%; height:100%; object-fit:contain; }
.hl__big { font-size:72px; font-weight:500; color:var(--muted); }
.hl__steps { margin:0 0 20px; padding-left:20px; line-height:1.6; font-size:15px; }
.hl__btn { width:100%; font:inherit; font-size:16px; font-weight:500; padding:12px; cursor:pointer;
  color:var(--accent-fg); background:var(--accent); border:none; border-radius:10px; }
.hl__btn:disabled { opacity:.45; cursor:default; }
.hl__btn--ghost { color:var(--fg); background:transparent; border:1px solid var(--line); margin-top:8px; }
.hl__opts { display:grid; gap:8px; margin-bottom:16px; }
.hl__opt { font:inherit; font-size:15px; text-align:left; padding:12px 14px; cursor:pointer;
  color:var(--fg); background:var(--bg); border:1px solid var(--line); border-radius:10px; }
.hl__opt:hover:not(:disabled) { border-color:var(--muted); }
.hl__opt[data-state="right"] { border:2px solid var(--good); }
.hl__opt[data-state="wrong"] { border:2px solid var(--bad); }
.hl__msg { min-height:22px; margin:0 0 12px; font-size:14px; font-weight:500; }
.hl__msg[data-ok="true"] { color:var(--good); }
.hl__msg[data-ok="false"] { color:var(--bad); }
.hl__cam { position:relative; aspect-ratio:4/3; border-radius:10px; overflow:hidden; background:var(--soft); margin-bottom:12px; }
.hl__video { width:100%; height:100%; object-fit:cover; transform:scaleX(-1); display:block; }
.hl__camtxt { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  padding:16px; text-align:center; color:var(--muted); font-size:14px; }
.hl__ref { display:flex; gap:12px; align-items:center; margin-bottom:12px; font-size:14px; }
.hl__ref b { font-size:28px; font-weight:500; }
@media (prefers-reduced-motion: reduce) { .hl__fill, .hl__heart { transition:none; } }
`;

function Heart({ lost }) {
  return (
    <svg className="hl__heart" data-lost={lost} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s-7.5-4.6-9.6-9.1C1.1 8.9 2.7 5.5 6 5.1c2-.2 3.7.8 4.6 2.2l1.4 1.9 1.4-1.9c.9-1.4 2.6-2.4 4.6-2.2 3.3.4 4.9 3.8 3.6 6.8C19.5 16.4 12 21 12 21z"
        fill="currentColor"
      />
    </svg>
  );
}

function SignImage({ lesson }) {
  return (
    <div className="hl__img">
      {lesson.image ? (
        <img src={lesson.image} alt={`Handshape for the letter ${lesson.letter}`} />
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
      <style>{css}</style>

      <header className="hl__top">
        <div className="hl__hearts" role="img" aria-label={`${lives} of ${MAX_LIVES} lives left`}>
          {Array.from({ length: MAX_LIVES }, (_, i) => <Heart key={i} lost={i >= lives} />)}
        </div>
        <div className="hl__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="hl__fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="hl__score">{score} pts</div>
      </header>

      {phase === "learn" && (
        <div className="hl__card">
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
        <div className="hl__card">
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
                  {o.letter}: {o.name}
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
        <div className="hl__card">
          <p className="hl__tag">Your turn</p>
          <h2 className="hl__h">Make the letter {lesson.letter}</h2>
          <p className="hl__sub">{lesson.clue}</p>
          <div className="hl__cam">
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
        <div className="hl__card">
          <p className="hl__tag">Complete</p>
          <h2 className="hl__h">Nice work!</h2>
          <p className="hl__sub">You finished {lessons.length} handshapes and scored {score} points.</p>
          <button className="hl__btn" onClick={restart}>Practice again</button>
        </div>
      )}

      {phase === "failed" && (
        <div className="hl__card">
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
