
/**
 * raceEngine.js
 *
 * Modes:
 *   "single"   - timed practice, hearts, wrong answers cost hearts
 *   "versus"   - two local players, wrong answers add time penalties
 *
 * No React, webcam, model, or backend dependencies.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export class RaceEngine {
  constructor({
    mode = "single",
    durationSeconds = 60,
    startingHearts = 5,
    penaltySeconds = 2,
    targetLetters = null,
    countJAndZ = true,
  } = {}) {
    if (!["single", "versus"].includes(mode)) {
      throw new Error('Mode must be "single" or "versus".');
    }

    this.mode = mode;
    this.durationSeconds = durationSeconds;
    this.startingHearts = startingHearts;
    this.penaltySeconds = penaltySeconds;
    this.countJAndZ = countJAndZ;

    this.targetLetters = targetLetters
      ? targetLetters.map((letter) => letter.toUpperCase())
      : this.generateLetters(500);

    this.players = new Map();
    this.status = "waiting";
    this.startedAt = null;
    this.endedAt = null;
    this.endReason = null;
  }

  generateLetters(count) {
    const letters = this.countJAndZ
      ? ALPHABET
      : ALPHABET.replace(/[JZ]/g, "");

    return Array.from({ length: count }, () => {
      return letters[Math.floor(Math.random() * letters.length)];
    });
  }

  addPlayer(playerId, name = playerId) {
    if (this.status !== "waiting") {
      throw new Error("Cannot add players after the race starts.");
    }

    if (this.players.has(playerId)) {
      throw new Error(`Player "${playerId}" already exists.`);
    }

    if (this.mode === "single" && this.players.size >= 1) {
      throw new Error("Single-player mode supports one player.");
    }

    if (this.mode === "versus" && this.players.size >= 2) {
      throw new Error("Versus mode supports two players.");
    }

    this.players.set(playerId, {
      id: playerId,
      name,
      progress: 0,
      correct: 0,
      mistakes: 0,
      hearts: this.mode === "single" ? this.startingHearts : null,
      penaltySeconds: 0,
      streak: 0,
      bestStreak: 0,
      lastAttempt: null,
      finished: false,
    });
  }

  start(now = Date.now()) {
    if (this.status !== "waiting") {
      throw new Error("Race has already started or ended.");
    }

    const requiredPlayers = this.mode === "single" ? 1 : 2;

    if (this.players.size !== requiredPlayers) {
      throw new Error(
        `This mode requires ${requiredPlayers} player(s).`
      );
    }

    this.status = "running";
    this.startedAt = now;

    return this.getSnapshot(now);
  }

  getTime(now = Date.now()) {
    if (this.startedAt === null) {
      return {
        elapsedSeconds: 0,
        remainingSeconds: this.durationSeconds,
      };
    }

    const end = this.endedAt ?? now;

    const elapsedSeconds = Math.min(
      this.durationSeconds,
      Math.max(0, (end - this.startedAt) / 1000)
    );

    return {
      elapsedSeconds,
      remainingSeconds: Math.max(
        0,
        this.durationSeconds - elapsedSeconds
      ),
    };
  }

  getCurrentTarget(playerId) {
    const player = this.getPlayer(playerId);

    if (player.finished) return null;

    return this.targetLetters[player.progress] ?? null;
  }

  /**
   * Submit ONE distinct recognized gesture.
   *
   * Call this only after your recognition layer determines
   * that a new letter gesture has occurred.
   */
  submitLetter(playerId, predictedLetter, now = Date.now()) {
    if (this.status !== "running") {
      return { accepted: false, reason: "race_not_running" };
    }

    this.updateTime(now);

    if (this.status !== "running") {
      return { accepted: false, reason: "race_ended" };
    }

    const player = this.getPlayer(playerId);

    if (player.finished) {
      return { accepted: false, reason: "player_finished" };
    }

    const letter = String(predictedLetter ?? "")
      .trim()
      .toUpperCase();

    if (!/^[A-Z]$/.test(letter)) {
      return { accepted: false, reason: "invalid_letter" };
    }

    const target = this.getCurrentTarget(playerId);

    if (!target) {
      player.finished = true;
      this.checkRaceEnd(now);

      return { accepted: false, reason: "no_target" };
    }

    const correct = letter === target;

    player.lastAttempt = {
      letter,
      target,
      correct,
      timestamp: now,
    };

    if (correct) {
      player.correct++;
      player.progress++;
      player.streak++;

      player.bestStreak = Math.max(
        player.bestStreak,
        player.streak
      );

      if (player.progress >= this.targetLetters.length) {
        player.finished = true;
      }
    } else {
      player.mistakes++;
      player.streak = 0;

      if (this.mode === "single") {
        player.hearts = Math.max(0, player.hearts - 1);

        if (player.hearts === 0) {
          player.finished = true;
        }
      } else {
        // Versus: penalize this player's effective time only.
        player.penaltySeconds += this.penaltySeconds;
      }
    }

    this.checkRaceEnd(now);

    return {
      accepted: true,
      correct,
      predicted: letter,
      target,
      nextTarget: this.getCurrentTarget(playerId),
      player: this.getPlayerSnapshot(player, now),
      raceStatus: this.status,
    };
  }

  updateTime(now = Date.now()) {
    if (this.status !== "running") {
      return this.getSnapshot(now);
    }

    const { remainingSeconds } = this.getTime(now);

    if (remainingSeconds <= 0) {
      this.end(now, "time_up");
    } else {
      this.checkRaceEnd(now);
    }

    return this.getSnapshot(now);
  }

  checkRaceEnd(now = Date.now()) {
    if (this.status !== "running") return;

    const players = [...this.players.values()];

    if (this.mode === "single") {
      // Single-player ends when hearts run out or the
      // player completes the entire target sequence.
      if (players[0].finished) {
        this.end(now, "player_finished");
      }
      return;
    }

    // Versus ends early only when both players finish.
    if (players.every((player) => player.finished)) {
      this.end(now, "all_players_finished");
    }
  }

  end(now = Date.now(), reason = "manual") {
    if (this.status !== "running") {
      return this.getResults(now);
    }

    this.status = "finished";
    this.endedAt = now;
    this.endReason = reason;

    return this.getResults(now);
  }

  getSPM(player, now = Date.now()) {
    const { elapsedSeconds } = this.getTime(now);

    if(elapsedSeconds <= 0) return 0;

    return Number(
      ((player.correct + player.mistakes) * 60 / elapsedSeconds).toFixed(1)
    );
  }

  getAccuracy(player) {
    const attempts = player.correct + player.mistakes;

    if (attempts === 0) return 0;

    return Number(
      (player.correct * 100 / attempts).toFixed(1)
    );
  }

  getCompetitionScore(player, now = Date.now()) {
    const spm = this.getSPM(player, now);
    const accuracy = this.getAccuracy(player) / 100;

    // Tunable starting weights: 70% correct letters,
    // 30% adjusted SPM.
    return Number(
      (spm * accuracy).toFixed(2)
    );
  }

  getPlayerSnapshot(player, now = Date.now()) {
    return {
      ...player,
      currentTarget: this.getCurrentTarget(player.id),
      spm: this.getSPM(player, now),
      accuracy: this.getAccuracy(player),
      competitionScore:
        this.mode === "versus"
          ? this.getCompetitionScore(player, now)
          : null,
    };
  }

  getSnapshot(now = Date.now()) {
    return {
      mode: this.mode,
      status: this.status,
      durationSeconds: this.durationSeconds,
      ...this.getTime(now),
      players: [...this.players.values()].map((player) =>
        this.getPlayerSnapshot(player, now)
      ),
    };
  }

  getResults(now = Date.now()) {
    const snapshot = this.getSnapshot(now);

    const ranking = [...snapshot.players].sort((a, b) => {
      if (this.mode === "versus") {
        return (
          b.competitionScore - a.competitionScore ||
          b.correct - a.correct ||
          b.spm - a.spm
        );
      }

      return (
        b.correct - a.correct ||
        b.spm - a.spm
      );
    });

    // In single-player, this is the player's result,
    // not a claim that they beat another competitor.
    const winner =
      this.mode === "versus" && ranking.length === 2
        ? ranking[0]
        : null;

    return {
      ...snapshot,
      winner,
      ranking,
      endReason: this.endReason,
    };
  }

  getPlayer(playerId) {
    const player = this.players.get(playerId);

    if (!player) {
      throw new Error(`Unknown player: "${playerId}"`);
    }

    return player;
  }
}

/*
const race = new RaceEngine({
  mode: "single",
  durationSeconds: 60,
  startingHearts: 5,
});

race.addPlayer("p1", "Player");
race.start();


const race = new RaceEngine({
  mode: "versus",
  durationSeconds: 60,
  penaltySeconds: 2,
});

race.addPlayer("p1", "Player 1");
race.addPlayer("p2", "Player 2");

race.start();

// Each camera feeds its own player's recognition result.
race.submitLetter("p1", "A");
race.submitLetter("p2", "B");

// Get the current standings.
console.log(race.getSnapshot());

// When the timer expires:
race.updateTime();

// After the race:
if (race.status === "finished") {
  console.log(race.getResults());
}
  
*/
