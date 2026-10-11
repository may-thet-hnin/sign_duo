// Learning uses the game's classifier; this only confirms sustained predictions.
export class PracticeHold {
  constructor(target, durationMs = 1500, maxGapMs = 250) {
    this.target = target;
    this.durationMs = durationMs;
    this.maxGapMs = maxGapMs;
    this.reset();
  }

  reset() {
    this.startedAt = null;
    this.lastAt = null;
    this.complete = false;
  }

  update(letter, now) {
    if (this.complete) return { progress: 1, complete: true };
    if (letter !== this.target || !Number.isFinite(now)) {
      this.reset();
      return { progress: 0, complete: false };
    }
    if (this.lastAt === null || now - this.lastAt > this.maxGapMs || now < this.lastAt) {
      this.startedAt = now;
    }
    this.lastAt = now;
    const progress = Math.min(1, (now - this.startedAt) / this.durationMs);
    this.complete = progress >= 1;
    return { progress, complete: this.complete };
  }
}

export function handInFrame(points) {
  return Array.isArray(points) && points.length === 21 && points.every(p =>
    p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
    p.x > 0.025 && p.x < 0.975 && p.y > 0.025 && p.y < 0.975);
}

export const PROGRESS_KEY = 'sign-duo-learning-v1';
export const emptyProgress = () => ({
  version: 1, position: 0, practiced: [], mastered: [], answers: [],
  completed: false, completions: 0, successfulAttempts: 0,
});

export function parseProgress(raw) {
  try {
    const saved = JSON.parse(raw);
    if (saved?.version !== 1) return emptyProgress();
    // Recover only internally consistent checkpoints, including corrupt storage.
    const practiced = [];
    for (const letter of ['A', 'B', 'L']) {
      if (!Array.isArray(saved.practiced) || !saved.practiced.includes(letter)) break;
      practiced.push(letter);
    }
    const answers = practiced.length === 3 && Array.isArray(saved.answers)
      ? saved.answers.slice(0, 3).filter(a => ['A', 'B', 'L'].includes(a)) : [];
    const maxPosition = practiced.length === 3 ? 6 + answers.length : practiced.length * 2 + 1;
    const position = Number.isInteger(saved.position) ? Math.max(0, Math.min(saved.position, maxPosition, 9)) : 0;
    const completed = saved.completed === true && practiced.length === 3 && answers.length === 3 && position === 9;
    return {
      ...emptyProgress(), practiced, answers, position, completed,
      mastered: ['A', 'B', 'L'].filter(letter => practiced.includes(letter) || (Array.isArray(saved.mastered) && saved.mastered.includes(letter))),
      completions: Number.isInteger(saved.completions) ? Math.max(0, saved.completions) : 0,
      successfulAttempts: Number.isInteger(saved.successfulAttempts) ? Math.max(practiced.length, saved.successfulAttempts) : practiced.length,
    };
  } catch { return emptyProgress(); }
}

export function recordPractice(progress, letter) {
  const expected = ['A', 'B', 'L'][Math.floor(progress.position / 2)];
  if (progress.position >= 6 || progress.position % 2 !== 1 || letter !== expected || progress.practiced.includes(letter)) return progress;
  return { ...progress, practiced: [...progress.practiced, letter],
    mastered: [...new Set([...progress.mastered, letter])], successfulAttempts: progress.successfulAttempts + 1 };
}

export function recordAnswer(progress, answer) {
  if (progress.position < 6 || progress.position >= 9 || progress.answers.length !== progress.position - 6 || !['A', 'B', 'L'].includes(answer)) return progress;
  return { ...progress, answers: [...progress.answers, answer] };
}

export function advanceProgress(progress) {
  if (progress.position >= 9) return progress;
  if (progress.position < 6 && progress.position % 2 === 1 && !progress.practiced.includes(['A', 'B', 'L'][Math.floor(progress.position / 2)])) return progress;
  if (progress.position >= 6 && progress.answers.length <= progress.position - 6) return progress;
  const position = progress.position + 1;
  return { ...progress, position, completed: position === 9,
    completions: progress.completions + Number(position === 9) };
}

export function replayProgress(progress) {
  return { ...emptyProgress(), mastered: progress.mastered, completions: progress.completions, successfulAttempts: progress.successfulAttempts };
}
