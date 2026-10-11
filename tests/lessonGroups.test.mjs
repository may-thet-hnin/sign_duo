import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSE_LESSONS } from '../src/utils/lessonContent.js';
import { SUPPORTED_SIGNS } from '../src/recognition/config.js';
import { emptyProgress, emptyCourseProgress, parseCourseProgress, updateLessonProgress,
  recordPractice, recordAnswer, advanceProgress, replayProgress, recognitionProgress } from '../src/utils/learning.js';

function completeLesson(p, lesson) {
  for (const sign of lesson.signs) {
    p = advanceProgress(p, lesson);
    assert.equal(advanceProgress(p, lesson), p, 'camera confirmation is required');
    const wrong = SUPPORTED_SIGNS.learning.find(s => s !== sign);
    assert.equal(recordPractice(p, wrong, lesson), p);
    p = recordPractice(p, sign, lesson);
    assert.equal(recordPractice(p, sign, lesson), p, 'credit cannot repeat');
    p = advanceProgress(p, lesson);
  }
  for (const answer of lesson.quiz) {
    assert.equal(advanceProgress(p, lesson), p, 'each knowledge check must be submitted');
    p = recordAnswer(p, answer, lesson);
    p = advanceProgress(p, lesson);
  }
  return p;
}

test('four lessons cover every supported sign exactly once in the requested groups', () => {
  assert.deepEqual(COURSE_LESSONS.map(l => l.signs), [
    ['A','B','L'], ['C','D','I'], ['V','W','Y'], ['HELLO','YES','NO'],
  ]);
  assert.deepEqual(new Set(COURSE_LESSONS.flatMap(l => l.signs)), new Set(SUPPORTED_SIGNS.learning));
  for (const l of COURSE_LESSONS) {
    assert.equal(l.content.length, l.signs.length);
    assert.equal(l.activityCount, l.signs.length * 2 + l.quiz.length);
    assert.equal(l.activityCount, 9);
    assert.ok(l.quiz.every(s => l.signs.includes(s)));
  }
});

test('each lesson independently gates, completes, saves, resumes and replays', () => {
  let course = emptyCourseProgress();
  for (const lesson of COURSE_LESSONS) {
    const untouched = course;
    course = updateLessonProgress(course, lesson.id, p => advanceProgress(p, lesson));
    assert.deepEqual(parseCourseProgress(JSON.stringify(course)), course);
    for (const other of COURSE_LESSONS.filter(l => l.id !== lesson.id)) {
      assert.deepEqual(course.lessons[other.id], untouched.lessons[other.id]);
    }
    // Resume from the first practice instead of restarting its guided activity.
    let progress = course.lessons[lesson.id];
    progress = recordPractice(progress, lesson.signs[0], lesson);
    progress = advanceProgress(progress, lesson);
    for (const sign of lesson.signs.slice(1)) {
      progress = advanceProgress(progress, lesson);
      progress = recordPractice(progress, sign, lesson);
      progress = advanceProgress(progress, lesson);
    }
    for (const answer of lesson.quiz) {
      progress = recordAnswer(progress, answer, lesson);
      progress = advanceProgress(progress, lesson);
    }
    course = updateLessonProgress(course, lesson.id, () => progress);
    assert.equal(progress.completed, true);
    assert.equal(progress.position, lesson.activityCount);
    assert.equal(progress.completions, 1);
    assert.deepEqual(parseCourseProgress(JSON.stringify(course)), course);
    const replay = updateLessonProgress(course, lesson.id, replayProgress);
    assert.equal(replay.lessons[lesson.id].position, 0);
    assert.equal(replay.lessons[lesson.id].completed, false);
    assert.equal(replay.lessons[lesson.id].completions, 1);
    assert.deepEqual(replay.lessons[lesson.id].mastered, progress.mastered);
    for (const other of COURSE_LESSONS.filter(l => l.id !== lesson.id)) assert.deepEqual(replay.lessons[other.id], course.lessons[other.id]);
  }
});

test('legacy Lesson 1 completion/checkpoints migrate without advancing other lessons', () => {
  const first = COURSE_LESSONS[0];
  for (const old of [completeLesson(emptyProgress(), first), { ...emptyProgress(), position: 3, practiced: ['A'], mastered: ['A','C'], successfulAttempts: 2 }]) {
    const migrated = parseCourseProgress(null, JSON.stringify(old));
    assert.equal(migrated.lessons[first.id].position, old.position);
    assert.equal(migrated.lessons[first.id].completed, old.completed);
    assert.deepEqual(migrated.lessons[first.id].answers, old.answers);
    assert.equal(migrated.lessons['handshape-basics'].position, 0);
    assert.equal(migrated.lessons['handshape-basics'].completed, false);
    assert.equal(Object.values(migrated.lessons).reduce((sum,p) => sum + p.successfulAttempts, 0), old.successfulAttempts);
    assert.deepEqual(parseCourseProgress(JSON.stringify(migrated)), migrated);
  }
});

test('corrupt completion flags, missing practices and shifted quiz answers cannot complete a lesson', () => {
  for (const lesson of COURSE_LESSONS) {
    const saved = emptyCourseProgress();
    saved.lessons[lesson.id] = { ...emptyProgress(), position: 999, completed: true, answers: [...lesson.quiz] };
    let parsed = parseCourseProgress(JSON.stringify(saved)).lessons[lesson.id];
    assert.equal(parsed.completed, false);
    assert.ok(parsed.position <= 1);
    saved.lessons[lesson.id].practiced = [...lesson.signs];
    saved.lessons[lesson.id].answers = [lesson.quiz[0], 'INVALID', lesson.quiz[2]];
    parsed = parseCourseProgress(JSON.stringify(saved)).lessons[lesson.id];
    assert.deepEqual(parsed.answers, [lesson.quiz[0]]);
    assert.equal(parsed.completed, false);
  }
});

test('activity counts and gates follow configuration rather than three-sign constants', () => {
  const lesson = { signs: ['C','D'], quiz: ['D'], practiceActivities: 4, activityCount: 5 };
  const progress = completeLesson(emptyProgress(), lesson);
  assert.equal(progress.position, 5);
  assert.equal(progress.completed, true);
});

test('display progress accepts only current validated events; words use motion milestones', () => {
  for (const target of ['A','YES','NO','HELLO']) {
    assert.deepEqual(recognitionProgress(null,target), { progress: 0, complete: false });
    for (const progress of [.25,.5,.75]) {
      assert.deepEqual(recognitionProgress({ candidate: target, status: 'tentative', progress, kind: 'dynamic', challengeId: 'current' }, target, 'current'), { progress, complete: false });
    }
    const completed = { letter: target, candidate: target, status: 'stable', progress: 1, isNew: true, challengeId: 'current' };
    assert.deepEqual(recognitionProgress(completed,target,'current'), { progress: 1, complete: true });
    assert.deepEqual(recognitionProgress(completed,target,'next'), { progress: 0, complete: false });
    assert.equal(recognitionProgress({ ...completed, isNew: false },target,'current').complete, false);
    assert.deepEqual(recognitionProgress({ candidate: 'OTHER', status: 'tentative', progress: .9 }, target), { progress: 0, complete: false });
  }
});
