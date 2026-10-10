import { useRef, useState } from "react";
import PlayerCard from "./PlayerCard";
import ResultsScreen from "./ResultsScreen";

const MAX_LIVES = 3;
const POINTS_PER_CORRECT = 100;
const PROGRESS_PER_CORRECT = 10; // 10 correct signs = 100%

const makePlayer = (id, name) => ({
  id, name,
  score: 0, lives: MAX_LIVES, maxLives: MAX_LIVES, progress: 0,
  correct: 0, attempts: 0, streak: 0, bestStreak: 0, timeSeconds: null,
});

/**
 * Props
 * - names:     ["Player 1", "Player 2"]
 * - streams:   [MediaStream | null, MediaStream | null] for the cameras
 * - answerRef: a ref; RaceScreen sets answerRef.current = (playerId, isCorrect) => void
 *              so your sign-recognition code can report each attempt
 * - onExit:    called by "Back to menu" on the results screen
 * - demo:      show test buttons (remove in production)
 */
export default function RaceScreen({
  names = ["Player 1", "Player 2"],
  streams = [null, null],
  answerRef,
  onExit,
  demo = false,
}) {
  const [players, setPlayers] = useState(() => names.map((n, i) => makePlayer(`p${i + 1}`, n)));
  const [finished, setFinished] = useState(false);
  const [winnerId, setWinnerId] = useState(null);
  const startedAt = useRef(Date.now());

  function recordAnswer(id, isCorrect) {
    if (finished) return;
    const elapsed = Math.round((Date.now() - startedAt.current) / 1000);

    const next = players.map((p) => {
      if (p.id !== id) return p;
      const q = { ...p, attempts: p.attempts + 1 };
      if (isCorrect) {
        q.correct += 1;
        q.streak += 1;
        q.bestStreak = Math.max(q.bestStreak, q.streak);
        q.score += POINTS_PER_CORRECT;
        q.progress = Math.min(100, q.progress + PROGRESS_PER_CORRECT);
      } else {
        q.streak = 0;
        q.lives = Math.max(0, q.lives - 1);
      }
      return q;
    });

    const actor = next.find((p) => p.id === id);
    const other = next.find((p) => p.id !== id);
    const reachedFinish = actor.progress >= 100;
    const outOfHearts = actor.lives === 0;

    if (reachedFinish || outOfHearts) {
      // Race over: stamp times for anyone who hasn't got one yet
      setPlayers(next.map((p) => ({ ...p, timeSeconds: p.timeSeconds ?? elapsed })));
      setWinnerId(reachedFinish ? actor.id : other.id);
      setFinished(true);
    } else {
      setPlayers(next);
    }
  }

  // Let the parent (your sign-recognition code) report answers
  if (answerRef) answerRef.current = recordAnswer;

  function rematch() {
    setPlayers(names.map((n, i) => makePlayer(`p${i + 1}`, n)));
    setWinnerId(null);
    setFinished(false);
    startedAt.current = Date.now();
  }

  if (finished) {
    return (
      <ResultsScreen
        players={players}
        winnerId={winnerId}
        onRematch={rematch}
        onHome={onExit}
      />
    );
  }

  return (
    <main className="race">
      <style>{`
        .race { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr));
          gap:16px; max-width:760px; margin:0 auto; padding:24px; }
        .race > .pc { max-width:none; }
        .race__demo { grid-column:1 / -1; display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
        @media (max-width: 640px) { .race { grid-template-columns:1fr; } }
      `}</style>

      {players.map((p, i) => (
        <PlayerCard
          key={p.id}
          name={p.name}
          stream={streams[i]}
          score={p.score}
          lives={p.lives}
          maxLives={p.maxLives}
          progress={p.progress}
        />
      ))}

      {demo && (
        <div className="race__demo">
          {players.map((p) => (
            <span key={p.id}>
              <button onClick={() => recordAnswer(p.id, true)}>{p.name} correct</button>{" "}
              <button onClick={() => recordAnswer(p.id, false)}>{p.name} wrong</button>
            </span>
          ))}
        </div>
      )}
    </main>
  );
}

/* Example usage

import { useRef } from "react";
import RaceScreen from "./RaceScreen";

export default function Game() {
  const answerRef = useRef(null);

  // Call this wherever your game judges a sign:
  //   answerRef.current("p1", true);   // Player 1 got it right
  //   answerRef.current("p2", false);  // Player 2 got it wrong

  return <RaceScreen answerRef={answerRef} onExit={() => {}} demo />;
}
*/
