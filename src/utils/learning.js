import { SUPPORTED_SIGNS, STARTER_SIGNS } from '../recognition/config.js';
import { COURSE_LESSONS } from './lessonContent.js';
export const PROGRESS_KEY = 'sign-duo-learning-v1';
export const emptyProgress = () => ({
  version: 1, position: 0, practiced: [], skipped: [], mastered: [], answers: [],
  completed: false, completions: 0, successfulAttempts: 0,
});

export function parseProgress(raw, lesson = COURSE_LESSONS[0]) {
  try {
    const saved = JSON.parse(raw);
    if (saved?.version !== 1) return emptyProgress();
    // Recover only internally consistent checkpoints, including corrupt storage.
    // Each sign is either camera-practiced or skipped for now; stop at the first
    // sign that is neither.
    const practiced = [], skipped = [];
    const has = (list, letter) => Array.isArray(list) && list.includes(letter);
    for (const letter of lesson.signs) {
      if (has(saved.practiced, letter)) practiced.push(letter);
      else if (has(saved.skipped, letter)) skipped.push(letter);
      else break;
    }
    const passed = practiced.length + skipped.length;
    // Stop at the first invalid answer; filtering would shift later answers
    // onto the wrong quiz question and allow a corrupt checkpoint to advance.
    const answers = [];
    if (passed === lesson.signs.length && Array.isArray(saved.answers)) {
      for (const answer of saved.answers.slice(0, lesson.quiz.length)) {
        if (!lesson.signs.includes(answer)) break;
        answers.push(answer);
      }
    }
    const maxPosition = passed === lesson.signs.length ? lesson.practiceActivities + answers.length : passed * 2 + 1;
    const position = Number.isInteger(saved.position) ? Math.max(0, Math.min(saved.position, maxPosition, lesson.activityCount)) : 0;
    const completed = passed === lesson.signs.length && answers.length === lesson.quiz.length && position === lesson.activityCount;
    return {
      ...emptyProgress(), practiced, skipped, answers, position, completed,
      mastered: SUPPORTED_SIGNS.learning.filter(letter => practiced.includes(letter) || (Array.isArray(saved.mastered) && saved.mastered.includes(letter))),
      completions: Number.isInteger(saved.completions) ? Math.max(0, saved.completions) : 0,
      successfulAttempts: Number.isInteger(saved.successfulAttempts) ? Math.max(practiced.length, saved.successfulAttempts) : practiced.length,
    };
  } catch { return emptyProgress(); }
}

export function recordPractice(progress, letter, lesson = COURSE_LESSONS[0]) {
  const expected = lesson.signs[Math.floor(progress.position / 2)];
  if (progress.position >= lesson.practiceActivities || progress.position % 2 !== 1 || letter !== expected || progress.practiced.includes(letter)) return progress;
  return { ...progress, practiced: [...progress.practiced, letter],
    mastered: [...new Set([...progress.mastered, letter])], successfulAttempts: progress.successfulAttempts + 1 };
}

// "Skip for now" on a camera practice: move on without camera credit. The sign
// is remembered as skipped so the lesson can point the learner back to it.
export function skipPractice(progress, lesson = COURSE_LESSONS[0]) {
  const sign = lesson.signs[Math.floor(progress.position / 2)];
  if (progress.position >= lesson.practiceActivities || progress.position % 2 !== 1 ||
    progress.practiced.includes(sign) || progress.skipped.includes(sign)) return progress;
  return { ...progress, skipped: [...progress.skipped, sign], position: progress.position + 1 };
}

export function recordAnswer(progress, answer, lesson = COURSE_LESSONS[0]) {
  if (progress.position < lesson.practiceActivities || progress.position >= lesson.activityCount || progress.answers.length !== progress.position - lesson.practiceActivities || !lesson.signs.includes(answer)) return progress;
  return { ...progress, answers: [...progress.answers, answer] };
}

export function advanceProgress(progress, lesson = COURSE_LESSONS[0]) {
  if (progress.position >= lesson.activityCount) return progress;
  if (progress.position < lesson.practiceActivities && progress.position % 2 === 1 && !progress.practiced.includes(lesson.signs[Math.floor(progress.position / 2)])) return progress;
  if (progress.position >= lesson.practiceActivities && progress.answers.length <= progress.position - lesson.practiceActivities) return progress;
  const position = progress.position + 1;
  return { ...progress, position, completed: position === lesson.activityCount,
    completions: progress.completions + Number(position === lesson.activityCount) };
}

export function replayProgress(progress) {
  return { ...emptyProgress(), mastered: progress.mastered, completions: progress.completions, successfulAttempts: progress.successfulAttempts };
}

export const COURSE_PROGRESS_KEY = 'sign-duo-learning-v2';
export const emptyCourseProgress = () => ({ version: 2,
  lessons: Object.fromEntries(COURSE_LESSONS.map(lesson => [lesson.id, emptyProgress()])),
});

export function parseCourseProgress(raw, legacyRaw = null) {
  const course = emptyCourseProgress();
  try {
    const saved = JSON.parse(raw);
    if (saved?.version === 2 && saved.lessons && typeof saved.lessons === 'object') {
      for (const lesson of COURSE_LESSONS) {
        const p = parseProgress(JSON.stringify(saved.lessons[lesson.id]), lesson);
        course.lessons[lesson.id] = { ...p, mastered: p.mastered.filter(sign => lesson.signs.includes(sign)) };
      }
      return course;
    }
  } catch { /* Fall back to the untouched v1 checkpoint. */ }
  const legacy = parseProgress(legacyRaw);
  const extra = legacy.mastered.filter(sign => !STARTER_SIGNS.includes(sign));
  for (const [index, lesson] of COURSE_LESSONS.entries()) {
    const mastered = legacy.mastered.filter(sign => lesson.signs.includes(sign));
    course.lessons[lesson.id] = index === 0
      ? { ...legacy, mastered, successfulAttempts: Math.max(legacy.practiced.length, legacy.successfulAttempts - extra.length) }
      : { ...emptyProgress(), mastered, successfulAttempts: mastered.length };
  }
  return course;
}

export function updateLessonProgress(course, lessonId, update) {
  const previous = course.lessons[lessonId];
  if (!previous) return course;
  const next = update(previous);
  return next === previous ? course : { ...course, lessons: { ...course.lessons, [lessonId]: next } };
}

// Shared display logic uses a recognizer's actual event and milestone fields.
// In particular, dynamic words never pass through a static hold timer.
export function recognitionProgress(result, target, challengeId = null) {
  if (!result || challengeId !== null && result.challengeId !== challengeId) return { progress: 0, complete: false };
  if (result.lockedLetter === target && !result.isNew) return { progress: 0, complete: false };
  const matching = (result.candidate || result.letter) === target;
  const complete = result.status === 'stable' && result.letter === target && result.isNew === true;
  return { progress: complete ? 1 : matching && Number.isFinite(result.progress)
    ? Math.max(0, Math.min(.99, result.progress)) : 0, complete };
}
