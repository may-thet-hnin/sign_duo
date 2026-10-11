import { SUPPORTED_SIGNS, ALPHABET_SIGNS, LESSON_GROUPS } from '../recognition/config.js';
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
  {
    id: 'e', letter: 'E', name: 'Fingertips bent over the thumb',
    image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/e.jpg',
    steps: ['Bend all four fingers at the middle knuckles so the fingertips point down.', 'Tuck your thumb across the palm, underneath the fingertips.', 'Face your palm toward the person watching.'],
    mistake: 'Keep the thumb below the fingertips. A thumb across the front of a tight fist makes S.',
    description: 'Four bent fingertips resting above a thumb tucked across the palm.',
  },
  {
    id: 's', letter: 'S', name: 'Fist with thumb across the front',
    image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/s.jpg',
    steps: ['Curl all four fingers into a closed fist.', 'Lay your thumb across the front of the curled fingers.', 'Face your palm toward the person watching.'],
    mistake: 'The thumb crosses the front of the fingers. Beside the index finger it makes A.',
    description: 'A closed fist with the thumb wrapped across the front of the fingers.',
  },
  {
    id: 'm', letter: 'M', name: 'Thumb under three fingers',
    image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/m.jpg',
    steps: ['Fold the index, middle and ring fingers down over your thumb.', 'Let the thumb tip peek out between the ring and little fingers.', 'Keep the little finger folded.'],
    mistake: 'Three fingers cover the thumb. Covering it with only two makes N.',
    description: 'Index, middle and ring fingers folded over the tucked thumb.',
  },
  {
    id: 'n', letter: 'N', name: 'Thumb under two fingers',
    image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/n.jpg',
    steps: ['Fold the index and middle fingers down over your thumb.', 'Let the thumb tip peek out between the middle and ring fingers.', 'Keep the ring and little fingers folded.'],
    mistake: 'Only two fingers cover the thumb. Covering it with three makes M.',
    description: 'Index and middle fingers folded over the tucked thumb.',
  },
  {
    id: 'o', letter: 'O', name: 'Fingertips meet the thumb',
    image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/o.jpg',
    steps: ['Curve all four fingers together.', 'Bring the fingertips down to touch the thumb tip.', 'Leave a round opening in the middle, like the letter O.'],
    mistake: 'The fingertips touch the thumb. Leaving a gap makes C.',
    description: 'Curved fingers touching the thumb tip to form a round O.',
  },
  {
    id: 'f', letter: 'F', name: 'Index and thumb circle',
    image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/f.jpg',
    steps: ['Touch the tip of your index finger to the tip of your thumb.', 'Extend the middle, ring and little fingers upward.', 'Spread the three raised fingers slightly.'],
    mistake: 'Keep the other three fingers straight. The same handshape is also the number 9.',
    description: 'Index finger and thumb forming a circle, with three fingers raised.',
  },
  {
    id: 'r', letter: 'R', name: 'Crossed fingers',
    image: 'https://www.lifeprint.com/asl101/fingerspelling/oldletters/r.jpg',
    steps: ['Extend the index and middle fingers.', 'Cross the two raised fingers over each other.', 'Fold the ring and little fingers with the thumb over them.'],
    mistake: 'The two fingers must cross. Side by side without crossing makes U.',
    description: 'Index and middle fingers crossed, with the other fingers folded.',
  },
].filter(sign => SUPPORTED_SIGNS.learning.includes(sign.letter)).sort((a, b) => ALPHABET_SIGNS.indexOf(a.letter) - ALPHABET_SIGNS.indexOf(b.letter)).map(sign => ({
  ...sign, category: 'alphabet', recognitionMethod: 'onnx-mlp', enabled: true,
  modes: ['learning', ...(SUPPORTED_SIGNS.competition.includes(sign.letter) ? ['competition'] : [])],
}));

export const WORD_LESSONS = [
  {
    id: 'hello', letter: 'HELLO', name: 'HELLO · simplified motion practice', simplified: true,
    referenceUrl: 'https://www.lifeprint.com/asl101/pages-signs/h/hello.htm',
    steps: ['Hold your hand flat with all four fingers straight. The thumb can be tucked or open.', 'Move the flat hand smoothly outward to the side, for example from your forehead.', 'Sweep about one palm width. Release your hand before repeating.'],
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

export const COURSE_LESSONS = LESSON_GROUPS.map(lesson => ({
  ...lesson,
  content: lesson.signs.map(signContent),
  practiceActivities: lesson.signs.length * 2,
  activityCount: lesson.signs.length * 2 + lesson.quiz.length,
}));
