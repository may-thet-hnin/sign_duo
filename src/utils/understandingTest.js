import { signContent } from './lessonContent.js';

// "Test your understanding": a short random run through one lesson's signs.
// No timer and no skipping; each sign must be made correctly to move on.
export const TEST_LENGTH = 6;

/**
 * Random order that uses every sign as evenly as possible (6 from 3 signs:
 * each twice) and never repeats a sign back to back when avoidable.
 */
export function createTestSequence(signs, length = TEST_LENGTH, random = Math.random) {
  // Which signs get an extra use (when the length does not divide evenly) is random too.
  const shuffled = [...signs];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const extras = shuffled.slice(0, length % signs.length);
  const counts = new Map(signs.map(sign => [sign, Math.floor(length / signs.length) + (extras.includes(sign) ? 1 : 0)]));
  const sequence = [];
  while (sequence.length < length) {
    const previous = sequence.at(-1);
    const remaining = [...counts].filter(([sign, n]) => n > 0 && sign !== previous);
    const pool = remaining.length ? remaining : [...counts].filter(([, n]) => n > 0);
    // Prefer the signs with the most uses left, so the end never forces a repeat.
    const most = Math.max(...pool.map(([, n]) => n));
    const choices = pool.filter(([, n]) => n === most);
    const [sign] = choices[Math.floor(random() * choices.length) % choices.length];
    sequence.push(sign);
    counts.set(sign, counts.get(sign) - 1);
  }
  return sequence;
}

export function startTest(signs, random = Math.random) {
  const sequence = createTestSequence(signs, TEST_LENGTH, random);
  return { sequence, index: 0, items: sequence.map(sign => ({ sign, mistakes: [], correct: false })), done: false };
}

/** Record one confirmed sign: the right one advances, anything else is a mistake. */
export function recordSign(test, letter) {
  if (test.done || !letter) return test;
  const items = test.items.map((item, i) => i !== test.index ? item
    : letter === item.sign ? { ...item, correct: true } : { ...item, mistakes: [...item.mistakes, letter] });
  const index = letter === test.sequence[test.index] ? test.index + 1 : test.index;
  return { ...test, items, index, done: index >= test.sequence.length };
}

/** Signs made correctly on the first try. */
export function firstTryScore(test) {
  return test.items.filter(item => item.correct && !item.mistakes.length).length;
}

/**
 * Coach panel text. With a detected sign that is not the target, explain the
 * difference using the lesson content; otherwise show how to make the target.
 */
export function coachMessage(target, detected = null) {
  const want = signContent(target);
  if (!want) return null;
  if (!detected || detected === target) {
    return { title: `How to sign ${target}`, steps: want.steps, tip: want.mistake };
  }
  const got = signContent(detected);
  return {
    title: `That looks like ${detected}, not ${target}`,
    detail: got ? `${detected}: ${got.description}` : null,
    want: `${target}: ${want.description}`,
    tip: want.mistake,
  };
}
