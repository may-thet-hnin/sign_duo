import { useEffect, useState } from 'react';
import PixelSprite from './Pixel.jsx';
import { ALPHABET_SIGNS } from '../recognition/config.js';
import { SPRITES } from '../utils/sprites.js';

// Only letters with pixel art; other letters would render an empty lens.
const LETTERS = ALPHABET_SIGNS.filter(letter => SPRITES[letter]);

/** Title-screen centrepiece: a glass lens that cycles through the signs the game can recognise. */
export default function HeroLens() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = setInterval(() => setIndex(i => (i + 1) % LETTERS.length), 1600);
    return () => clearInterval(timer);
  }, []);

  const letter = LETTERS[index];
  return (
    <figure className="sd-lens-wrap">
      <div className="sd-lens glass">
        <PixelSprite key={letter} name={letter} scale={10} className="sd-lens__hand" label={`Handshape for the letter ${letter}`} />
      </div>
      <figcaption className="sd-lens__cap">Now signing <b>{letter}</b></figcaption>
    </figure>
  );
}
