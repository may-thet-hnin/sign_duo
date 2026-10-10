
import { useEffect, useRef, useState } from "react";
import { RaceEngine } from "./utils/raceEngine.js";

export default function App() {
  const engineRef = useRef(null);

  const [mode, setMode] = useState("single");
  const [gameState, setGameState] = useState(null);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");

  // Create and start a new race.
  function startRace() {
    try {
      const engine = new RaceEngine({
        mode,
        durationSeconds: 60,
        startingHearts: 5,
        penaltySeconds: 2,
      });

      engine.addPlayer("p1", "Player 1");

      if (mode === "versus") {
        engine.addPlayer("p2", "Player 2");
      }

      engine.start();

      engineRef.current = engine;
      setResults(null);
      setError("");
      setGameState(engine.getSnapshot());
    } catch (err) {
      setError(err.message);
    }
  }

  // Called by a camera/recognition component when a new
  // distinct letter has been recognized.
  function handleRecognizedLetter(playerId, letter) {
    const engine = engineRef.current;

    if (!engine || engine.status !== "running") return;

    const result = engine.submitLetter(playerId, letter);

    if (!result.accepted) return;

    const snapshot = engine.getSnapshot();
    setGameState(snapshot);

    if (snapshot.status === "finished") {
      setResults(engine.getResults());
    }
  }

  // Refresh the displayed timer and race state once per second.
  useEffect(() => {
    if (gameState?.status !== "running") return;

    const intervalId = setInterval(() => {
      const engine = engineRef.current;
      if (!engine) return;

      const snapshot = engine.updateTime();
      setGameState(snapshot);

      if (snapshot.status === "finished") {
        setResults(engine.getResults());
      }
    }, 250);

    return () => clearInterval(intervalId);
  }, [gameState?.status]);

  function restartRace() {
    engineRef.current = null;
    setGameState(null);
    setResults(null);
    setError("");
  }

  const players = gameState?.players ?? [];

  return (
    <main className="app">
      <h1>Sign Sprint</h1>

      {!gameState && (
        <section>
          <h2>Choose your game mode</h2>

          <button onClick={() => setMode("single")}>
            Single Player
          </button>

          <button onClick={() => setMode("versus")}>
            Two Player
          </button>

          <p>Selected mode: {mode}</p>

          <button onClick={startRace}>
            Start Race
          </button>

          {error && <p role="alert">{error}</p>}
        </section>
      )}

      {gameState && (
        <>
          <header>
            <h2>
              {mode === "single"
                ? "Practice Test"
                : "Head-to-Head Race"}
            </h2>

            <p>
              Time remaining:{" "}
              {Math.ceil(gameState.remainingSeconds)}s
            </p>
          </header>

          <section className="camera-grid">
            {players.map((player) => (
              <div key={player.id} className="player-panel">
                <h3>{player.name}</h3>

                {/*
                  Replace this placeholder with your camera
                  and recognition component.

                  Its recognition callback should call:
                  handleRecognizedLetter(player.id, letter)
                */}
                <div className="camera-placeholder">
                  Camera for {player.name}
                </div>

                <h2>
                  Target: {player.currentTarget ?? "Finished"}
                </h2>

                <p>Correct letters: {player.correct}</p>
                <p>SPM: {player.spm}</p>
                <p>Accuracy: {player.accuracy}%</p>
                <p>Streak: {player.streak}</p>

                {mode === "single" && (
                  <p>Hearts: {player.hearts}</p>
                )}

                {mode === "versus" && (
                  <p>
                    Time penalty: {player.penaltySeconds}s
                  </p>
                )}

                <p>Mistakes: {player.mistakes}</p>
              </div>
            ))}
          </section>

          {results && (
            <section className="results">
              <h2>Race Results</h2>

              {mode === "versus" && (
                <h3>
                  Winner: {results.winner?.name ?? "No winner"}
                </h3>
              )}

              {results.ranking.map((player) => (
                <div key={player.id}>
                  <strong>{player.name}</strong>
                  {" — "}
                  {player.correct} correct letters,
                  {" "}
                  {player.spm} SPM
                  {mode === "versus" &&
                    `, score ${player.competitionScore}`}
                </div>
              ))}

              <button onClick={restartRace}>
                Back to Setup
              </button>
            </section>
          )}
        </>
      )}
    </main>
  );
}

