import PixelSprite from "./Pixel.jsx";

/**
 * ResultsScreen: shows the winner and a head-to-head stats comparison.
 *
 * Props
 * - players:   [{ id, name, score, lives, maxLives,
 *                 correct, attempts, bestStreak, spm, skipped }, ...]  (exactly two)
 * - winnerId:  optional. Overrides the automatic winner; null is an explicit tie.
 * - winReason: optional. "more_points" | "fewer_mistakes" (from RaceEngine).
 * - onRematch: called when "Play again" is pressed
 * - onHome:    called when "Back to menu" is pressed (button hidden if omitted)
 */

function Trophy() {
  return <PixelSprite name="trophy" scale={7} className="rs__trophy" />;
}

function accuracy(p) {
  if (!p.attempts) return null;
  return Math.round((p.correct / p.attempts) * 100);
}

function pickWinner(a, b, winnerId) {
  if (winnerId !== undefined) return a.id === winnerId ? a : b.id === winnerId ? b : null;
  if (a.score !== b.score) return a.score > b.score ? a : b;
  return null; // tie
}

const WIN_REASONS = {
  more_points: "Highest score when time ran out",
  fewer_mistakes: "Same correct signs, fewer mistakes",
  opponent_left: "Opponent left the match",
};

export default function ResultsScreen({ players, winnerId, winReason, onRematch, onHome, durationSeconds,
  rematchLabel = "Play again", homeLabel = "Back to menu", extraActions = null }) {
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
    { label: "Signs per minute", get: (p) => p.spm, show: (p) => p.spm, higher: true },
    { label: "Skipped", get: (p) => p.skipped, show: (p) => p.skipped, higher: false },
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
            ? WIN_REASONS[winReason] ?? `Won by ${margin.toLocaleString()} point${margin === 1 ? '' : 's'}`
            : "Same correct signs and mistakes"}
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
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rs__actions">
        <button className="sd-button sd-button-start" onClick={onRematch}>{rematchLabel}</button>
        {extraActions}
        {onHome && (
          <button className="sd-button sd-button-secondary" onClick={onHome}>{homeLabel}</button>
        )}
      </div>
    </div>
  );
}
