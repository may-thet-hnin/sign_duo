import PixelSprite from "./Pixel.jsx";

/**
 * ResultsScreen: shows the winner and a head-to-head stats comparison.
 *
 * Props
 * - players:   [{ id, name, score, lives, maxLives, progress,
 *                 correct, attempts, bestStreak, timeSeconds }, ...]  (exactly two)
 * - winnerId:  optional. Overrides the automatic winner; null is an explicit tie.
 * - onRematch: called when "Play again" is pressed
 * - onHome:    called when "Back to menu" is pressed (button hidden if omitted)
 */

function Trophy() {
  return <PixelSprite name="trophy" scale={7} className="rs__trophy" />;
}

function formatTime(sec) {
  if (sec == null) return "–";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function accuracy(p) {
  if (!p.attempts) return null;
  return Math.round((p.correct / p.attempts) * 100);
}

function pickWinner(a, b, winnerId) {
  if (winnerId !== undefined) return a.id === winnerId ? a : b.id === winnerId ? b : null;
  if (a.score !== b.score) return a.score > b.score ? a : b;
  if (a.progress !== b.progress) return a.progress > b.progress ? a : b;
  return null; // tie
}

export default function ResultsScreen({ players, winnerId, onRematch, onHome, durationSeconds }) {
  const [a, b] = players;
  const winner = pickWinner(a, b, winnerId);
  const loser = winner ? (winner.id === a.id ? b : a) : null;
  const margin = winner ? winner.score - loser.score : 0;

  // higher: true means a bigger number wins the row
  const rows = [
    { label: "Score", get: (p) => p.score, show: (p) => p.score.toLocaleString(), higher: true },
    { label: "Accuracy", get: accuracy, show: (p) => (accuracy(p) == null ? "–" : `${accuracy(p)}%`), higher: true },
    { label: "Correct signs", get: (p) => p.correct, show: (p) => `${p.correct} / ${p.attempts}`, higher: true },
    { label: "Best streak", get: (p) => p.bestStreak, show: (p) => p.bestStreak, higher: true },
    { label: "Hearts left", get: (p) => p.lives, show: (p) => `${p.lives} / ${p.maxLives}`, higher: true },
    { label: "Progress", get: (p) => p.progress, show: (p) => `${Math.round(p.progress)}%`, higher: true, bar: true },
    { label: "Time", get: (p) => p.timeSeconds, show: (p) => formatTime(p.timeSeconds), higher: false },
  ];

  // Hearts only exist in solo-style play; hide the row when neither player has any.
  const visibleRows = rows.filter(row => !(row.label === "Hearts left" && !a.maxLives && !b.maxLives));

  function isBest(row, p, other) {
    const x = row.get(p);
    const y = row.get(other);
    if (x == null || y == null || x === y) return false;
    return row.higher ? x > y : x < y;
  }

  return (
    <div className="rs" aria-label="Race results" role="region">
      <section className="rs__banner glass" data-tie={!winner} aria-live="polite">
        <Trophy />
        {durationSeconds && <p>{durationSeconds}-second race</p>}
        <p className="rs__eyebrow">{winner ? "Winner" : "Result"}</p>
        <h1 className="rs__title">{winner ? winner.name : "It's a tie!"}</h1>
        <p className="rs__sub">
          {winner
            ? margin > 0
              ? `Won by ${margin.toLocaleString()} points`
              : "Won on progress"
            : "Both players finished level"}
        </p>
      </section>

      <div className="rs__card glass">
        <table className="rs__table">
          <caption>Head-to-head stats</caption>
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Stat</span></th>
              {[a, b].map((p) => (
                <th scope="col" key={p.id} className={`rs__p rs__p--${p.id}`}>
                  {p.name}
                  {winner && winner.id === p.id && <span className="rs__crown">Winner</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {[
                  [a, b],
                  [b, a],
                ].map(([p, other]) => (
                  <td key={p.id} className={`rs__p--${p.id}`} data-best={isBest(row, p, other)}>
                    {row.show(p)}
                    {row.bar && (
                      <div className="rs__bar sd-bar" aria-hidden="true">
                        <div className="sd-bar__fill" style={{ "--pct": `${Math.min(100, p.progress)}%` }} />
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rs__actions">
        <button className="sd-button sd-button-start" onClick={onRematch}>Play again</button>
        {onHome && (
          <button className="sd-button sd-button-secondary" onClick={onHome}>Back to menu</button>
        )}
      </div>
    </div>
  );
}

/* Example usage

import ResultsScreen from "./ResultsScreen";

<ResultsScreen
  players={[
    { id: "p1", name: "Player 1", score: 1250, lives: 2, maxLives: 3, progress: 100,
      correct: 11, attempts: 13, bestStreak: 6, timeSeconds: 94 },
    { id: "p2", name: "Player 2", score: 980, lives: 1, maxLives: 3, progress: 85,
      correct: 9, attempts: 14, bestStreak: 4, timeSeconds: 101 },
  ]}
  onRematch={() => {}}
  onHome={() => {}}
/>
*/
