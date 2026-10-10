import { PALETTES, SPRITES } from '../utils/sprites.js';

const cache = new Map();

/** Turn a sprite's character grid into merged colour runs (with generated outline). */
function build(name) {
  if (cache.has(name)) return cache.get(name);
  const sprite = SPRITES[name];
  if (!sprite) return null;
  const palette = PALETTES[sprite.palette];
  const outline = sprite.outline !== false;
  const pad = outline ? 1 : 0;
  const w = sprite.rows[0].length + pad * 2;
  const h = sprite.rows.length + pad * 2;

  const grid = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => sprite.rows[y - pad]?.[x - pad] ?? '.'),
  );
  const painted = grid.map(row => row.slice());

  if (outline) {
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (grid[y][x] !== '.') continue;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (grid[y + dy]?.[x + dx] && grid[y + dy][x + dx] !== '.') painted[y][x] = 'k';
          }
        }
      }
    }
  }

  const runs = [];
  for (let y = 0; y < h; y += 1) {
    let x = 0;
    while (x < w) {
      const ch = painted[y][x];
      if (ch === '.') { x += 1; continue; }
      let end = x;
      while (end + 1 < w && painted[y][end + 1] === ch) end += 1;
      runs.push({ x, y, width: end - x + 1, fill: palette[ch] });
      x = end + 1;
    }
  }
  const result = { w, h, runs };
  cache.set(name, result);
  return result;
}

/**
 * Crisp pixel-art sprite. Decorative unless `label` is given.
 * Size comes from `scale` (px per sprite pixel) or from CSS width.
 */
export default function PixelSprite({ name, scale = 4, label, className = '' }) {
  const data = build(name);
  if (!data) return null;
  return (
    <svg
      className={`sd-sprite ${className}`.trim()}
      viewBox={`0 0 ${data.w} ${data.h}`}
      width={data.w * scale}
      height={data.h * scale}
      shapeRendering="crispEdges"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {data.runs.map((run, i) => (
        <rect key={i} x={run.x} y={run.y} width={run.width} height="1" fill={run.fill} />
      ))}
    </svg>
  );
}
