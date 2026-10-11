import { useEffect, useState } from 'react';
import PixelSprite from './Pixel.jsx';

const CONFETTI_COLORS = ['var(--gold)', 'var(--mint)', 'var(--pink)', 'var(--aqua)'];
// Deterministic pixel confetti: positions, drift and timing vary by index.
const CONFETTI = Array.from({ length: 30 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  drift: ((i * 53) % 41) - 20,
  delay: (i % 7) * 70,
  duration: 1100 + (i % 5) * 90,
  size: i % 3 === 0 ? 12 : 8,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
}));

// Matches the sd-clear-out animation. A timer, not only animationend: browsers
// pause animations in hidden tabs, which would leave the overlay up.
const BANNER_MS = 1700;

const prefersReducedMotion = () => typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Arcade "stage clear" transition into a results view: a pixel banner, trophy
 * and confetti over a dimmed screen, then the results rise in one block at a
 * time. Click to skip. With `play` false, or reduced motion, the results show
 * immediately.
 */
export default function ResultsReveal({ play = true, title, subtitle, children }) {
  const [phase, setPhase] = useState(() => play && !prefersReducedMotion() ? 'banner' : 'shown');
  const finish = () => setPhase(current => current === 'banner' ? 'rising' : current);
  useEffect(() => {
    if (phase !== 'banner') return undefined;
    const timer = setTimeout(finish, BANNER_MS);
    return () => clearTimeout(timer);
  }, [phase]);
  return <>
    {phase === 'banner' && <div className="sd-clear" role="status" aria-live="polite" onClick={finish}
      onAnimationEnd={event => { if (event.target === event.currentTarget) finish(); }}>
      <div className="sd-clear__confetti" aria-hidden="true">
        {CONFETTI.map((piece, i) => <i key={i} style={{ left: `${piece.left}%`, width: piece.size, height: piece.size, background: piece.color,
          '--drift': `${piece.drift}px`, animationDelay: `${piece.delay}ms`, animationDuration: `${piece.duration}ms` }} />)}
      </div>
      <PixelSprite name="trophy" scale={8} className="sd-clear__trophy" />
      <strong className="sd-clear__banner">{title}</strong>
      {subtitle && <span className="sd-clear__subtitle">{subtitle}</span>}
      <span className="sd-clear__skip">Click to continue</span>
    </div>}
    <div className={`sd-reveal${phase === 'banner' ? ' sd-reveal--hold' : phase === 'rising' ? ' sd-reveal--rise' : ''}`}>
      {children}
    </div>
  </>;
}
