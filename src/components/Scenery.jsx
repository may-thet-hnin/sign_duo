import { memo } from 'react';
import PixelSprite from './Pixel.jsx';

/* Everything here is deterministic so renders are stable. */
const STARS = Array.from({ length: 44 }, (_, i) => ({
  left: (i * 19 + (i % 3) * 7) % 100,
  top: (i * 37 + i * i * 11) % 46,
  size: i % 7 === 0 ? 4 : 3,
  twinkle: i % 5 === 0,
}));

const CLOUDS = [
  { top: '9%', width: 300, dur: '210s', delay: '-60s' },
  { top: '27%', width: 190, dur: '280s', delay: '-190s' },
  { top: '16%', width: 240, dur: '170s', delay: '-120s' },
];

function hillRects(seed, base, amp) {
  const rects = [];
  for (let x = 0; x < 320; x += 4) {
    const raw = base + amp * Math.sin(x * 0.045 + seed) + amp * 0.5 * Math.sin(x * 0.11 + seed * 2);
    const height = Math.max(4, Math.round(raw / 2) * 2);
    rects.push({ x, y: 64 - height, height });
  }
  return rects;
}
const FAR = hillRects(1.2, 26, 9);
const NEAR = hillRects(4.1, 14, 7);

/** Fixed 16-bit dusk backdrop. Gives the glass panels something to refract.
 * Memoized: it has no props, and App re-renders on every recognition update. */
export default memo(function Scenery() {
  return (
    <div className="sd-scenery" aria-hidden="true">
      <div className="sd-blob sd-blob--aqua" />
      <div className="sd-blob sd-blob--pink" />
      <div className="sd-blob sd-blob--gold" />
      {STARS.map((star, i) => (
        <i
          key={i}
          className={`sd-star${star.twinkle ? ' sd-star--twinkle' : ''}`}
          style={{ left: `${star.left}%`, top: `${star.top}%`, width: star.size, height: star.size }}
        />
      ))}
      {CLOUDS.map((cloud, i) => (
        <div
          key={i}
          className="sd-cloud"
          style={{ top: cloud.top, width: cloud.width, '--dur': cloud.dur, '--delay': cloud.delay }}
        >
          <PixelSprite name="cloud" scale={1} />
        </div>
      ))}
      <svg className="sd-hills" viewBox="0 0 320 64" preserveAspectRatio="xMidYMax slice" shapeRendering="crispEdges">
        {FAR.map(r => <rect key={`f${r.x}`} x={r.x} y={r.y} width="4" height={r.height} fill="#4b2a93" />)}
        {NEAR.map(r => <rect key={`n${r.x}`} x={r.x} y={r.y} width="4" height={r.height} fill="#24135f" />)}
      </svg>
    </div>
  );
});
