// Articulated synthetic landmarks exercise rule mechanics, not webcam accuracy.
const point = (x, y, z = 0) => ({ x, y, z });
export function pose(sign) {
  const p = Array.from({ length: 21 }, () => point(0, 0));
  p[0] = point(0, 1);
  for (const [base, x] of [[5,-.5],[9,-.17],[13,.17],[17,.5]]) {
    p[base] = point(x, 0);
    p[base + 1] = point(x, -.55);
    p[base + 2] = point(x, -.3, .15);
    p[base + 3] = point(x, -.1, .25);
  }
  p[1] = point(-.55, .6); p[2] = point(-.7, .25);
  p[3] = point(-.8, 0); p[4] = point(-.5, -.05);
  const extend = (base, tipX = p[base].x) => {
    const start = p[base];
    for (const [joint, amount] of [[1,.4],[2,.72],[3,1]]) {
      p[base + joint] = point(start.x + (tipX - start.x) * amount, -1.45 * amount);
    }
  };
  const thumbOpen = () => { p[3] = point(-1.15, .15); p[4] = point(-1.65, .05); };
  if (['I','Y'].includes(sign)) extend(17);
  if (['Y','L','OPEN','A'].includes(sign)) thumbOpen();
  if (sign === 'V') { extend(5,-.8); extend(9,.15); }
  if (sign === 'W') { extend(5,-1); extend(9,0); extend(13,.8); }
  if (['L','D'].includes(sign)) extend(5);
  if (sign === 'D') {
    p[4] = point(-.4, -.2, .2); p[12] = point(-.35, -.25, .2); p[16] = point(-.2, -.2, .2); p[20] = point(-.05, -.2, .2);
  }
  if (['B','OPEN'].includes(sign)) for (const base of [5,9,13,17]) extend(base);
  if (sign === 'C') {
    for (const base of [5,9,13,17]) {
      p[base + 2] = point(p[base].x, -.6, .5);
      p[base + 3] = point(p[base].x, -.3, 1);
    }
    p[2] = point(-.7,.3); p[3] = point(-1.2,.1,.1); p[4] = point(-1.25,-.2,.2);
  }
  if (['NO_OPEN','NO_CLOSED'].includes(sign)) {
    extend(5); extend(9); p[4] = point(-.55, -.3);
    if (sign === 'NO_CLOSED') {
      p[7] = point(-.5,-.4,.1); p[8] = point(-.52,-.35);
      p[11] = point(-.3,-.4,.1); p[12] = point(-.35,-.35);
    }
  }
  return p;
}

export function cameraPoints(p, { scale = .08, dx = 0, dy = 0, mirror = false, angle = 0, nod = 0 } = {}) {
  return p.map(v => {
    const y = v.y - 1;
    const ny = y * Math.cos(nod) - v.z * Math.sin(nod);
    const nz = y * Math.sin(nod) + v.z * Math.cos(nod);
    const x = (mirror ? -v.x : v.x) * Math.cos(angle) - ny * Math.sin(angle);
    const ry = (mirror ? -v.x : v.x) * Math.sin(angle) + ny * Math.cos(angle);
    return { x: .5 + (x + dx) * scale, y: .6 + (ry + dy) * scale, z: nz * scale };
  });
}

export function wordFrames(word, options = {}) {
  return Array.from({ length: 14 }, (_, i) => {
    const now = i * 100;
    const movement = i <= 2 ? 0 : Math.min(1, (i - 2) / 5);
    let p = pose(word === 'HELLO' ? 'OPEN' : word === 'YES' ? 'FIST' : 'NO_OPEN');
    if (word === 'NO') {
      const closed = pose('NO_CLOSED');
      p = p.map((v, j) => ({ x: v.x + (closed[j].x - v.x) * movement,
        y: v.y + (closed[j].y - v.y) * movement, z: v.z + (closed[j].z - v.z) * movement }));
    }
    const nod = word === 'YES' ? (i <= 2 ? 0 : i <= 6 ? (i - 2) / 4 : Math.max(0, (10 - i) / 4)) * Math.PI / 3 : 0;
    return { now, points: cameraPoints(p, { ...options, dx: (options.dx || 0) + (word === 'HELLO' ? movement * (options.mirror ? -1 : 1) : 0), nod }) };
  });
}
