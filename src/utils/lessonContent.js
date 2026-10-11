import { SUPPORTED_SIGNS, STARTER_SIGNS, ALPHABET_SIGNS, LESSON_GROUPS } from '../recognition/config.js';
export const REFERENCE_URL = 'https://www.lifeprint.com/asl101/fingerspelling/abc.htm';

// Photographic references from ASL University, never generated handshapes.
export const ALPHABET_LESSONS = [
  {
    id: 'a', letter: 'A', name: 'Fist with thumb alongside',
    image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/a.jpg',
    steps: ['Curl all four fingers into a closed fist.', 'Keep your thumb alongside the index finger, outside the fist.', 'Face your palm toward the person watching.'],
    mistake: 'Keep the thumb at the side rather than crossing it over the front of your fingers.',
    description: 'A closed fist, with the thumb resting upright beside the index finger.',
  },
  {
    id: 'b', letter: 'B', name: 'Flat hand',
    image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/b.jpg',
    steps: ['Extend all four fingers upward.', 'Keep the fingers together and fold your thumb across the palm.', 'Face your palm toward the person watching.'],
    mistake: 'Keep the four fingers together. This prototype recognizes the folded-thumb version of B.',
    description: 'Four straight fingers together, with the thumb folded across the palm.',
  },
  {
    id: 'l', letter: 'L', name: 'Index up, thumb out',
    image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/l.jpg',
    steps: ['Extend your index finger upward.', 'Extend your thumb sideways to form an L.', 'Curl your middle, ring, and little fingers into your palm.'],
    mistake: 'Keep the other three fingers curled and the thumb open. Use a comfortable wrist position.',
    description: 'An upright index finger and sideways thumb; the remaining fingers are curled.',
  },
  {
    id: 'c', letter: 'C', name: 'Curved open hand',
    image: 'https://www.lifeprint.com/asl101/fingerspelling/c.jpg',
    steps: ['Curve all four fingers together.', 'Curve the thumb underneath, leaving a visible C-shaped gap.', 'Keep the hand relaxed and show its curved profile to the camera.'],
    mistake: 'Keep an opening between thumb and fingers; closing the gap makes O.',
    description: 'Four curved fingers and a curved thumb forming an open C.',
  },
  {
    id: 'd', letter: 'D', name: 'Index up, fingertips meet thumb',
    image: 'https://www.lifeprint.com/asl101/fingerspelling/d.jpg',
    steps: ['Extend the index finger.', 'Bring the middle, ring, and little fingertips toward the thumb.', 'Let the middle fingertip meet the thumb, making a small circle below the index.'],
    mistake: 'Keep the thumb touching the curled fingers; an open sideways thumb resembles L.',
    description: 'Index extended with the other fingers curved toward the thumb.',
  },
  {
    id: 'i', letter: 'I', name: 'Little finger up',
    image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/i.jpg',
    steps: ['Fold the index, middle, and ring fingers.', 'Hold the thumb across the folded fingers.', 'Extend only your little finger.'],
    mistake: 'Keep the thumb tucked; extending it produces Y.',
    description: 'Little finger extended, other fingers folded and thumb tucked.',
  },
  {
    id: 'v', letter: 'V', name: 'Two spread fingers',
    image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/v.jpg',
    steps: ['Extend the index and middle fingers.', 'Separate them into a V.', 'Fold the ring and little fingers with the thumb across them.'],
    mistake: 'Keep the ring finger folded. Three extended fingers produce W.',
    description: 'Index and middle fingers straight and separated; other fingers folded.',
  },
  {
    id: 'w', letter: 'W', name: 'Three spread fingers',
    image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/w.jpg',
    steps: ['Extend the index, middle, and ring fingers.', 'Spread the three fingers.', 'Fold the little finger and hold it with the thumb.'],
    mistake: 'Keep the ring finger fully extended and the little finger folded.',
    description: 'Three spread upright fingers, with little finger folded and thumb tucked.',
  },
  {
    id: 'y', letter: 'Y', name: 'Thumb and little finger out',
    image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/y.jpg',
    steps: ['Fold the index, middle, and ring fingers.', 'Extend your thumb and little finger.', 'Keep the wrist comfortable with both extended digits visible.'],
    mistake: 'The thumb must be open. A tucked thumb resembles I.',
    description: 'Thumb and little finger extended, with three middle fingers folded.',
  },
  { id: 'e', letter: 'E', name: 'Bent fingertips', image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/e.jpg', steps: ['Bend all four fingers down toward your palm.', 'Tuck your thumb under the fingertips.', 'Keep the fingertips close to the thumb.'], mistake: 'Avoid making a fully closed fist.', description: 'Bent fingertips' },
  { id: 'f', letter: 'F', name: 'Thumb and index circle', image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/f.jpg', steps: ['Touch your index fingertip to your thumb tip.', 'Extend the middle, ring, and little fingers.', 'Keep the three extended fingers comfortably spread.'], mistake: 'Keep the index curled, rather than upright as in D.', description: 'Thumb and index circle' },
  { id: 'g', letter: 'G', name: 'Sideways index and thumb', image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/g.jpg', steps: ['Extend your index finger sideways.', 'Extend the thumb parallel to the index with a small gap.', 'Fold the remaining three fingers.'], mistake: 'Keep the hand sideways rather than making an upright L.', description: 'Sideways index and thumb' },
  { id: 'h', letter: 'H', name: 'Two sideways fingers', image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/h.jpg', steps: ['Extend your index and middle fingers together.', 'Point both fingers sideways.', 'Fold the ring and little fingers and tuck the thumb.'], mistake: 'Keep the two extended fingers together.', description: 'Two sideways fingers' },
  { id: 'j', letter: 'J', name: 'Little finger draws J', image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/j.jpg', steps: ['Start with only your little finger extended.', 'Move the little fingertip down, then curve inward.', 'Trace a J smoothly with the little fingertip.'], mistake: 'A stationary I handshape does not make J.', description: 'Little finger draws J', movement: 'Little finger: down, then inward curve.' },
  { id: 'k', letter: 'K', name: 'Two fingers with thumb between', image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/k.jpg', steps: ['Extend and separate the index and middle fingers.', 'Place the thumb against the base of the middle finger.', 'Fold the ring and little fingers.'], mistake: 'Keep the thumb between the extended fingers.', description: 'Two fingers with thumb between' },
  { id: 'm', letter: 'M', name: 'Thumb under three fingers', image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/m.jpg', steps: ['Make a fist with the thumb under the fingers.', 'Let the index, middle, and ring fingers lie over the thumb.', 'Keep the little finger curled beside them.'], mistake: 'Show three fingers over the thumb, rather than two as in N.', description: 'Thumb under three fingers' },
  { id: 'n', letter: 'N', name: 'Thumb under two fingers', image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/n.jpg', steps: ['Make a fist with the thumb under the fingers.', 'Let the index and middle fingers lie over the thumb.', 'Curl the ring and little fingers beside them.'], mistake: 'Show two fingers over the thumb, rather than three as in M.', description: 'Thumb under two fingers' },
  { id: 'o', letter: 'O', name: 'Fingertips form a circle', image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/o.jpg', steps: ['Curve all four fingers together.', 'Bring the fingertips to the thumb tip.', 'Show the rounded O shape from the side.'], mistake: 'Close the gap that remains open in C.', description: 'Fingertips form a circle' },
  { id: 'p', letter: 'P', name: 'Downward K', image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/p.jpg', steps: ['Form K with index and middle fingers extended.', 'Place the thumb against the middle finger.', 'Turn the hand so the middle finger points downward.'], mistake: 'Keep the K handshape as you turn it downward.', description: 'Downward K' },
  { id: 'q', letter: 'Q', name: 'Downward G', image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/q.jpg', steps: ['Form G with index and thumb extended.', 'Fold the other three fingers.', 'Turn the hand so the index and thumb point downward.'], mistake: 'Keep a small gap between the index and thumb.', description: 'Downward G' },
  { id: 'r', letter: 'R', name: 'Crossed fingers', image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/r.jpg', steps: ['Extend the index and middle fingers.', 'Cross the middle finger over the index.', 'Fold the remaining fingers and tuck the thumb.'], mistake: 'Cross the fingers rather than holding them together as in U.', description: 'Crossed fingers' },
  { id: 's', letter: 'S', name: 'Fist with thumb across', image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/s.jpg', steps: ['Curl all four fingers into a fist.', 'Place the thumb across the front of the fingers.', 'Face the fist toward the viewer.'], mistake: 'Keep the thumb across the front rather than alongside as in A.', description: 'Fist with thumb across' },
  { id: 't', letter: 'T', name: 'Thumb between two fingers', image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/t.jpg', steps: ['Make a fist.', 'Place the thumb between the index and middle fingers.', 'Let the thumb tip show between those fingers.'], mistake: 'Keep the thumb between the fingers rather than across the fist.', description: 'Thumb between two fingers' },
  { id: 'u', letter: 'U', name: 'Two fingers together', image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/u.jpg', steps: ['Extend the index and middle fingers upward.', 'Keep those two fingers together.', 'Fold the ring and little fingers and tuck the thumb.'], mistake: 'Keep the fingers together rather than spread as in V.', description: 'Two fingers together' },
  { id: 'x', letter: 'X', name: 'Hooked index', image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/x.jpg', steps: ['Fold the middle, ring, and little fingers.', 'Raise the index finger and bend it into a hook.', 'Keep the thumb tucked against the folded fingers.'], mistake: 'Bend the index rather than holding it straight.', description: 'Hooked index' },
  { id: 'z', letter: 'Z', name: 'Index finger draws Z', image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/z.jpg', steps: ['Extend only the index finger.', 'Trace a horizontal line, then a diagonal down in the opposite direction.', 'Finish with a horizontal line in the original direction.'], mistake: 'Trace all three strokes; holding the index still does not make Z.', description: 'Index finger draws Z', movement: 'Index finger: across, diagonal down, across.' },
].filter(sign => SUPPORTED_SIGNS.learning.includes(sign.letter)).sort((a, b) => ALPHABET_SIGNS.indexOf(a.letter) - ALPHABET_SIGNS.indexOf(b.letter)).map(sign => ({
  ...sign, category: 'alphabet', recognitionMethod: ['J', 'Z'].includes(sign.letter) ? 'temporal-geometry' : STARTER_SIGNS.includes(sign.letter) || 'EGHKMNOPQRSTUX'.includes(sign.letter) ? 'onnx-mlp' : 'static-geometry', enabled: true,
  modes: ['learning', ...(SUPPORTED_SIGNS.competition.includes(sign.letter) ? ['competition'] : [])],
}));

export const LESSONS = STARTER_SIGNS.map(letter => ALPHABET_LESSONS.find(sign => sign.letter === letter));
export const WORD_LESSONS = [
  {
    id: 'hello', letter: 'HELLO', name: 'HELLO · simplified motion practice', simplified: true,
    referenceUrl: 'https://www.lifeprint.com/asl101/pages-signs/h/hello.htm',
    steps: ['Open all four fingers and your thumb.', 'Move the open hand smoothly outward to the side.', 'Sweep about one palm width. Release your hand before repeating.'],
    movement: 'Open hand → sideways outward sweep.',
    quizCue: 'Which practice gesture uses an open hand sweeping outward to the side?',
    mistake: 'A stationary open palm does not count. This exercise cannot check forehead position.',
    description: 'Simplified open-hand outward sweep; hand motion only, not a full ASL HELLO check.',
  },
  {
    id: 'yes', letter: 'YES', name: 'Nodding fist',
    image: 'https://www.lifeprint.com/asl101/signjpegs/y/yes1.jpg',
    referenceUrl: 'https://www.lifeprint.com/asl101/pages-signs/y/yes.htm',
    steps: ['Make a closed fist with the thumb across the fingers.', 'Bend your fist down at the wrist and back up like a nod.', 'Keep the wrist in roughly the same place. Release before repeating.'],
    movement: 'Fist → bend down → return.',
    quizCue: 'Which word uses a closed fist bending down and back up at the wrist?',
    mistake: 'Moving the entire arm up and down is not a wrist nod. A stationary fist never counts.',
    description: 'Closed fist nodding down and back up by bending at the wrist.',
  },
  {
    id: 'no', letter: 'NO', name: 'Two fingers close to thumb',
    image: 'https://www.lifeprint.com/asl101/gifs/n/no-2-movement.gif',
    referenceUrl: 'https://www.lifeprint.com/asl101/pages-signs/n/no.htm',
    steps: ['Extend index and middle fingers together, with ring and little fingers folded.', 'Leave a gap between the two fingertips and the thumb.', 'Close both fingertips toward the thumb. Reopen both fingers to repeat.'],
    movement: 'Two fingers: open → close together to thumb.',
    quizCue: 'Which word closes both index and middle fingertips toward the thumb?',
    mistake: 'Both fingers must close toward the thumb. A one-finger pinch does not count.',
    description: 'Index and middle fingers closing together toward the thumb.',
  },
].map(sign => ({ ...sign, category: 'words', enabled: true, modes: ['learning', 'competition'], recognitionMethod: 'temporal-geometry' }));

export function signContent(letter) {
  return [...ALPHABET_LESSONS, ...WORD_LESSONS].find(sign => sign.letter === letter);
}

// Different order from the guided sequence; the answer is not always option one.
export const QUIZ_SIGNS = LESSON_GROUPS[0].quiz;

export const COURSE_LESSONS = LESSON_GROUPS.map(lesson => ({
  ...lesson,
  content: lesson.signs.map(signContent),
  practiceActivities: lesson.signs.length * 2,
  activityCount: lesson.signs.length * 2 + lesson.quiz.length,
}));
