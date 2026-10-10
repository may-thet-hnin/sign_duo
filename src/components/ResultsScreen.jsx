/**
 * ResultsScreen: shows the winner and a head-to-head stats comparison.
 *
 * Props
 * - players:   [{ id, name, score, lives, maxLives, progress,
 *                 correct, attempts, bestStreak, timeSeconds }, ...]  (exactly two)
 * - winnerId:  optional. Overrides the automatic winner (score, then progress).
 * - onRematch: called when "Play again" is pressed
 * - onHome:    called when "Back to menu" is pressed (button hidden if omitted)
 */

const css = `
.rs { --bg:#fff; --fg:#1a1a1a; --muted:#6b6b66; --line:#e4e2db; --soft:#f6f5f1;
  --accent:#2f6fed; --accent-fg:#fff; --gold:#b7791f; --gold-bg:#fdf3dc; --good:#1f8a4c;
  max-width:560px; margin:0 auto; padding:20px; color:var(--fg);
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif; }
@media (prefers-color-scheme: dark) {
  .rs { --bg:#1f1f1d; --fg:#f2f1ec; --muted:#a3a29a; --line:#37362f; --soft:#2a2a27;
    --accent:#6f9bff; --accent-fg:#101010; --gold:#f2c35a; --gold-bg:#3a3220; --good:#4fc47f; }
}
.rs * { box-sizing:border-box; }
.rs .sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
.rs__banner { text-align:center; padding:24px 16px; border-radius:12px; background:var(--gold-bg);
  border:1px solid var(--line); margin-bottom:16px; }
.rs__banner[data-tie="true"] { background:var(--soft); }
.rs__trophy { width:44px; height:44px; color:var(--gold); }
.rs__banner[data-tie="true"] .rs__trophy { color:var(--muted); }
.rs__eyebrow { margin:8px 0 2px; font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
.rs__title { margin:0; font-size:28px; font-weight:500; }
.rs__sub { margin:6px 0 0; font-size:14px; color:var(--muted); }
.rs__card { background:var(--bg); border:1px solid var(--line); border-radius:12px; overflow:hidden; }
.rs__table { width:100%; border-collapse:collapse; font-size:15px; }
.rs__table caption { text-align:left; padding:14px 16px 4px; font-size:13px; color:var(--muted); }
.rs__table th, .rs__table td { padding:12px 16px; text-align:center; }
.rs__table thead th { font-weight:500; border-bottom:1px solid var(--line); }
.rs__table thead th:first-child, .rs__table tbody th { text-align:left; }
.rs__table tbody th { font-weight:400; color:var(--muted); font-size:14px; }
.rs__table tbody tr + tr { border-top:1px solid var(--line); }
.rs__table td { font-variant-numeric:tabular-nums; }
.rs__table td[data-best="true"] { font-weight:500; color:var(--good); }
.rs__crown { display:inline-block; margin-left:6px; font-size:11px; font-weight:500; padding:1px 7px;
  border-radius:8px; background:var(--gold-bg); color:var(--gold); vertical-align:middle; }
.rs__bar { height:6px; background:var(--soft); border-radius:3px; overflow:hidden; margin:6px auto 0; max-width:90px; }
.rs__bar > div { height:100%; background:var(--accent); border-radius:3px; }
.rs__actions { display:grid; gap:8px; margin-top:16px; }
.rs__btn { font:inherit; font-size:16px; font-weight:500; padding:12px; cursor:pointer;
  color:var(--accent-fg); background:var(--accent); border:none; border-radius:10px; }
.rs__btn--ghost { color:var(--fg); background:transparent; border:1px solid var(--line); }
`;

function Trophy() {
  return (
    <svg className="rs__trophy" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 3h10v2h3v3c0 2.2-1.8 4-4 4h-.3A5 5 0 0 1 13 14.9V17h3v2H8v-2h3v-2.1A5 5 0 0 1 8.3 12H8C5.8 12 4 10.2 4 8V5h3V3Zm-1 4v1c0 1.1.9 2 2 2V7H6Zm12 0h-2v3c1.1 0 2-.9 2-2V7Z"
      />
    </svg>
  );
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
  if (winnerId) return a.id === winnerId ? a : b.id === winnerId ? b : null;
  if (a.score !== b.score) return a.score > b.score ? a : b;
  if (a.progress !== b.progress) return a.progress > b.progress ? a : b;
  return null; // tie
}

export default function ResultsScreen({ players, winnerId, onRematch, onHome }) {
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

  function isBest(row, p, other) {
    const x = row.get(p);
    const y = row.get(other);
    if (x == null || y == null || x === y) return false;
    return row.higher ? x > y : x < y;
  }

  return (
    <main className="rs" aria-label="Race results">
      <style>{css}</style>

      <section className="rs__banner" data-tie={!winner} aria-live="polite">
        <Trophy />
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

      <div className="rs__card">
        <table className="rs__table">
          <caption>Head-to-head stats</caption>
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Stat</span></th>
              {[a, b].map((p) => (
                <th scope="col" key={p.id}>
                  {p.name}
                  {winner && winner.id === p.id && <span className="rs__crown">Winner</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {[
                  [a, b],
                  [b, a],
                ].map(([p, other]) => (
                  <td key={p.id} data-best={isBest(row, p, other)}>
                    {row.show(p)}
                    {row.bar && (
                      <div className="rs__bar" aria-hidden="true">
                        <div style={{ width: `${Math.min(100, p.progress)}%` }} />
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
        <button className="rs__btn" onClick={onRematch}>Play again</button>
        {onHome && (
          <button className="rs__btn rs__btn--ghost" onClick={onHome}>Back to menu</button>
        )}
      </div>
    </main>
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
