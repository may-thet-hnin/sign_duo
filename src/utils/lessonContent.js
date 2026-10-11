export const REFERENCE_URL = 'https://www.lifeprint.com/asl101/fingerspelling/abc.htm';

// Photographic references from ASL University, never generated handshapes.
export const LESSONS = [
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
];

// Different order from the guided sequence; the answer is not always option one.
export const QUIZ_SIGNS = ['B', 'L', 'A'];
