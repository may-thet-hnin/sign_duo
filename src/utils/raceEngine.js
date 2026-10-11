/**
 * raceEngine.js
 *
 * Timed competition. Targets come from one random sequence per race, extended
 * as players advance, so a round never runs out of signs before the timer.
 * In duo mode both players read the same sequence (same signs, same order)
 * at their own pace.
 *
 * Modes:
 *   "single" - five hearts; a wrong sign costs a heart, and losing the last
 *              heart ends the run early
 *   "versus" - two local players; highest score when time runs out wins
 *
 * A player may skip a target at any time, up to SKIPS_PER_RACE times per
 * race. Skips score nothing, cost nothing, and move that player along the
 * same shared sequence.
 *
 * No React, webcam, model, or backend dependencies.
 */

import { COMPETITION_POOLS, POINTS_PER_SIGN, SKIPS_PER_RACE, SUPPORTED_SIGNS } from '../recognition/config.js';
let nextRaceId = 0;

export class RaceEngine {
  constructor({
    mode = "single",
    durationSeconds = 60,
    startingHearts = 5,
    pool = COMPETITION_POOLS.alphabet,
    skipsPerRace = SKIPS_PER_RACE,
    random = Math.random,
    clock = () => performance.now(),
  } = {}) {
    if (!["single", "versus"].includes(mode)) {
      throw new Error('Mode must be "single" or "versus".');
    }
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('Race duration must be positive.');
    if (!pool.length || new Set(pool).size !== pool.length || pool.some(sign => !SUPPORTED_SIGNS.competition.includes(sign))) {
      throw new Error(`Competition signs must be distinct supported signs: ${SUPPORTED_SIGNS.competition.join(', ')}.`);
    }

    this.mode = mode;
    this.id = ++nextRaceId;
    this.clock = clock;
    this.random = random;
    this.recognitionEvents = new Map();
    this.durationSeconds = durationSeconds;
    this.startingHearts = startingHearts;
    this.skipsPerRace = skipsPerRace;
    this.pool = [...pool];
    // The shared sequence. Both players index into this one array.
    this.sequence = [];
    // Never repeat a sign within this many previous targets (none for a pool
    // of one). Three words: no immediate repeat; 13 letters: none in last 4.
    this.repeatGap = Math.min(this.pool.length - 1, Math.max(1, Math.floor(this.pool.length / 3)));

    this.players = new Map();
    this.status = "waiting";
    this.startedAt = null;
    this.endedAt = null;
    this.endReason = null;
    this.winnerId = null;
    this.winReason = null;
  }

  signAt(index) {
    while (this.sequence.length <= index) {
      const recent = this.repeatGap ? this.sequence.slice(-this.repeatGap) : [];
      const choices = this.pool.filter(sign => !recent.includes(sign));
      this.sequence.push(choices[Math.floor(this.random() * choices.length) % choices.length]);
    }
    return this.sequence[index];
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
      skipped: 0,
      skippedIndices: [],
      hearts: this.mode === "single" ? this.startingHearts : null,
      streak: 0,
      bestStreak: 0,
      lastAttempt: null,
      // Only set when a solo player loses their last heart.
      finished: false,
    });
  }

  start(now = this.clock()) {
    if (this.status !== "waiting") {
      throw new Error("Race has already started or ended.");
    }
    const requiredPlayers = this.mode === "single" ? 1 : 2;
    if (this.players.size !== requiredPlayers) {
      throw new Error(`This mode requires ${requiredPlayers} player(s).`);
    }
    this.status = "running";
    this.startedAt = now;
    return this.getSnapshot(now);
  }

  getTime(now = this.clock()) {
    if (this.startedAt === null) {
      return { elapsedSeconds: 0, remainingSeconds: this.durationSeconds };
    }
    const end = this.endedAt ?? now;
    const elapsedSeconds = Math.min(this.durationSeconds, Math.max(0, (end - this.startedAt) / 1000));
    return { elapsedSeconds, remainingSeconds: Math.max(0, this.durationSeconds - elapsedSeconds) };
  }

  getCurrentTarget(playerId) {
    const player = this.getPlayer(playerId);
    return player.finished ? null : this.signAt(player.progress);
  }

  getChallengeId(playerId) {
    return `${this.id}:${playerId}:${this.getPlayer(playerId).progress}`;
  }

  submitRecognition(playerId, result, now = this.clock()) {
    if (this.status !== 'running') return { accepted: false, reason: 'race_not_running' };
    if (result?.status !== 'stable' || !result.isNew || !result.eventId || !this.pool.includes(result.letter)) {
      return { accepted: false, reason: 'not_validated' };
    }
    if (result.challengeId !== this.getChallengeId(playerId)) return { accepted: false, reason: 'stale_challenge' };
    const events = this.recognitionEvents.get(playerId) || new Set();
    if (events.has(result.eventId)) return { accepted: false, reason: 'duplicate_event' };
    events.add(result.eventId); this.recognitionEvents.set(playerId, events);
    return this.submitLetter(playerId, result.letter, now);
  }

  /**
   * Submit ONE distinct recognized sign. Call this only after the
   * recognition layer has confirmed a new stable sign.
   */
  submitLetter(playerId, predictedLetter, now = this.clock()) {
    if (this.status !== "running") {
      return { accepted: false, reason: "race_not_running" };
    }
    // The deadline wins over a submission that arrives after it.
    this.updateTime(now);
    if (this.status !== "running") {
      return { accepted: false, reason: "race_ended" };
    }

    const player = this.getPlayer(playerId);
    if (player.finished) {
      return { accepted: false, reason: "player_finished" };
    }
    const letter = String(predictedLetter ?? "").trim().toUpperCase();
    if (!this.pool.includes(letter)) {
      return { accepted: false, reason: "invalid_letter" };
    }

    const target = this.getCurrentTarget(playerId);
    const correct = letter === target;
    player.lastAttempt = { letter, target, correct, timestamp: now };

    if (correct) {
      player.correct++;
      player.progress++;
      player.streak++;
      player.bestStreak = Math.max(player.bestStreak, player.streak);
    } else {
      player.mistakes++;
      player.streak = 0;
      if (this.mode === "single") {
        player.hearts = Math.max(0, player.hearts - 1);
        if (player.hearts === 0) player.finished = true;
      }
    }

    if (player.finished) this.end(now, "out_of_hearts");

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

  /**
   * Move a player past their current target for 0 points. `challengeId`
   * names the target being skipped, so a double click skips only one target.
   */
  skip(playerId, challengeId, now = this.clock()) {
    if (this.status !== "running") return { accepted: false, reason: "race_not_running" };
    this.updateTime(now);
    if (this.status !== "running") return { accepted: false, reason: "race_ended" };
    const player = this.getPlayer(playerId);
    if (player.finished) return { accepted: false, reason: "player_finished" };
    if (challengeId !== this.getChallengeId(playerId)) return { accepted: false, reason: "stale_challenge" };
    if (player.skipped >= this.skipsPerRace) return { accepted: false, reason: "no_skips_left" };
    const target = this.getCurrentTarget(playerId);
    player.skippedIndices = [...player.skippedIndices.slice(-7), player.progress];
    player.progress++;
    player.skipped++;
    player.streak = 0;
    player.lastAttempt = { letter: null, target, correct: false, skipped: true, timestamp: now };
    return { accepted: true, skipped: target, nextTarget: this.getCurrentTarget(playerId) };
  }

  updateTime(now = this.clock()) {
    if (this.status === "running" && this.getTime(now).remainingSeconds <= 0) {
      // Freeze the clock at the deadline, not at whenever this check ran.
      this.end(this.startedAt + this.durationSeconds * 1000, "time_up");
    }
    return this.getSnapshot(now);
  }

  end(now = this.clock(), reason = "manual") {
  if (this.status !== "running") {
    return this.getResults(now);
  }
  this.status = "finished";
  this.endedAt = now;
  this.endReason = reason;

  // Versus Mode Winner Determination
  if (this.mode === 'versus') {
    const [first, second] = this.getResults(now).ranking;
    
    // 1. Highest Net Competition Score Wins
    if (first.score !== second.score) {
      this.winnerId = first.id; 
      this.winReason = "more_points";
    } 
    // 2. Tie-breaker 1: Fewer mistakes
    else if (first.mistakes !== second.mistakes) {
      this.winnerId = first.id; 
      this.winReason = "fewer_mistakes";
    } 
    // 3. Tie-breaker 2: Higher Raw SPM
    else if (first.spm !== second.spm) {
      this.winnerId = first.id; 
      this.winReason = "higher_raw_speed";
    }
  }
  return this.getResults(now);
}

// Monkeytype Raw Speed equivalent (Keystrokes per Minute)
getSPM(player, now = this.clock()) {
  const { elapsedSeconds } = this.getTime(now);
  if (elapsedSeconds <= 0) return 0;

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

// Monkeytype Net Speed equivalent (Net SPM)
getCompetitionScore(player, now = this.clock()) {
  const { elapsedSeconds } = this.getTime(now);
  if (elapsedSeconds <= 0) return 0;

  // Net speed: calculates SPM purely on successfully completed signs/characters.
  const netSpm = (player.correct * 60) / elapsedSeconds;

  return Number(netSpm.toFixed(2));
}

getPlayerSnapshot(player, now = this.clock()) {
  const from = Math.max(0, player.progress - 2);
  return {
    ...player,
    score: this.getCompetitionScore(player, now), // Replaced flat score with Net SPM score
    currentTarget: this.getCurrentTarget(player.id),
    challengeId: this.getChallengeId(player.id),
    skipsLeft: Math.max(0, this.skipsPerRace - player.skipped),
    window: { 
      from, 
      signs: Array.from({ length: player.progress - from + 6 }, (_, i) => this.signAt(from + i)) 
    },
    spm: this.getSPM(player, now),          // Raw SPM
    accuracy: this.getAccuracy(player),     // Accuracy %
  };
}

  getSnapshot(now = this.clock()) {
    return {
      raceId: this.id,
      mode: this.mode,
      status: this.status,
      durationSeconds: this.durationSeconds,
      ...this.getTime(now),
      players: [...this.players.values()].map((player) => this.getPlayerSnapshot(player, now)),
    };
  }

  getResults(now = this.clock()) {
    const snapshot = this.getSnapshot(now);
    const ranking = [...snapshot.players].sort((a, b) => {
      if (a.id === this.winnerId) return -1;
      if (b.id === this.winnerId) return 1;
      return b.score - a.score || a.mistakes - b.mistakes;
    });
    // In single-player, this is the player's result, not a win.
    const winner = this.mode === "versus" && this.winnerId !== null
      ? snapshot.players.find(player => player.id === this.winnerId)
      : null;
    return { ...snapshot, winner, winnerId: this.winnerId, winReason: this.winReason, ranking, endReason: this.endReason };
  }

  getPlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) {
      throw new Error(`Unknown player: "${playerId}"`);
    }
    return player;
  }
}
