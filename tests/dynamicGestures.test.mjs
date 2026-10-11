import test from 'node:test';
import assert from 'node:assert/strict';
import { DynamicGestureRecognizer } from '../src/recognition/dynamicGestures.js';
import { RecognitionController } from '../src/recognition/controller.js';
import { pose, cameraPoints, wordFrames } from './fixtures/signs.mjs';

function naturalFrames(word, { mirror = false, scale = .08, interval = 80 } = {}) {
  return Array.from({ length: 28 }, (_, frame) => {
    const step = Math.min(1, frame / 12);
    let p = pose(word === 'HELLO' ? 'OPEN' : word === 'YES' ? 'FIST' : 'NO_OPEN');
    if (word === 'HELLO') p[4] = { x: -1.4, y: -.15, z: 0 }; // relaxed thumb
    if (word === 'YES') p[4] = { x: .5, y: -.1, z: .15 }; // across the fingers
    if (word === 'NO') {
      const closed = pose('NO_CLOSED');
      closed[12].x = -.12; // both near the thumb, without perfectly aligned tips
      p = p.map((v, j) => Object.fromEntries(['x', 'y', 'z'].map(axis =>
        [axis, v[axis] + (closed[j][axis] - v[axis]) * step])));
    }
    const nod = word === 'YES' ? .65 * (frame <= 12 ? step : Math.max(0, (24 - frame) / 12)) : 0;
    return { now: frame * interval, points: cameraPoints(p, {
      mirror, scale, nod, dx: word === 'HELLO' ? step * .85 : 0,
      dy: word === 'HELLO' ? step * .6 : 0,
    }) };
  });
}

for (const word of ['HELLO', 'YES', 'NO']) {
  test(`${word} accepts a comfortable smooth movement with natural handshape variation`, async () => {
    for (const mirror of [false, true]) for (const scale of [.05, .1]) {
      let now = 0;
      const results = [];
      const controller = new RecognitionController({
        clock: () => now, onResult: result => results.push(result),
        infer: async () => { throw new Error('Word practice must not use the alphabet model'); },
      });
      controller.setTarget(word);
      controller.setChallenge(`natural-${word}`);
      for (const frame of naturalFrames(word, { mirror, scale })) {
        now = frame.now;
        await controller.process(frame.points, now);
      }
      assert.deepEqual(results.filter(r => r.isNew).map(r => r.letter), [word]);
      controller.dispose();
    }
  });
}

test('small per-frame steps contribute to a slow Yes nod at higher tracking rates', () => {
  const recognizer = new DynamicGestureRecognizer();
  const results = Array.from({ length: 100 }, (_, frame) => {
    const nod = .65 * (frame <= 45 ? frame / 45 : Math.max(0, (90 - frame) / 45));
    return recognizer.update(cameraPoints(pose('FIST'), { nod }), frame * 20);
  });
  assert.deepEqual(results.filter(r => r.isNew).map(r => r.letter), ['YES']);
});

test('one uncertain handshape frame preserves motion but sustained pose loss resets it', () => {
  for (const word of ['HELLO', 'YES', 'NO']) {
    const d = new DynamicGestureRecognizer();
    const frames = wordFrames(word);
    const results = frames.map((frame, j) => d.update(j === 5 ? cameraPoints(pose('V')) : frame.points, frame.now));
    assert.deepEqual(results.filter(r => r.isNew).map(r => r.letter), [word]);
    const interrupted = new DynamicGestureRecognizer();
    for (const frame of frames.slice(0, 5)) interrupted.update(frame.points, frame.now);
    for (let now = 500; now <= 800; now += 100) interrupted.update(cameraPoints(pose('V')), now);
    for (const frame of frames.slice(8)) assert.equal(interrupted.update(frame.points, frame.now + 100).isNew, false);
  }
});

test('Hello and Yes re-arm after a neutral pose without removing the hand from view', () => {
  for (const word of ['HELLO', 'YES']) {
    const d = new DynamicGestureRecognizer();
    const first = wordFrames(word).map(frame => d.update(frame.points, frame.now));
    assert.equal(first.filter(r => r.isNew).length, 1);
    for (let now = 1400; now <= 1900; now += 100) d.update(cameraPoints(pose('V')), now);
    const second = wordFrames(word).map(frame => d.update(frame.points, frame.now + 2000));
    assert.deepEqual(second.filter(r => r.isNew).map(r => r.letter), [word]);
  }
});

test('comfortable static shapes and insufficient nods still cannot complete a word', () => {
  for (const word of ['HELLO', 'YES', 'NO']) {
    const d = new DynamicGestureRecognizer();
    const start = naturalFrames(word)[0].points;
    for (let now = 0; now < 2200; now += 80) assert.equal(d.update(start, now).isNew, false);
  }
  const d = new DynamicGestureRecognizer();
  for (let frame = 0; frame < 28; frame++) {
    const nod = .2 * Math.sin(frame / 27 * Math.PI);
    assert.equal(d.update(cameraPoints(pose('FIST'), { nod }), frame * 80).isNew, false);
  }
});

test('word recognition consumes every tracking frame, including fast movement between model samples', async () => {
  for (const word of ['HELLO', 'YES', 'NO']) {
    let now = 0;
    const results = [];
    const c = new RecognitionController({ clock: () => now, onResult: r => results.push(r),
      infer: async () => { throw new Error('Unexpected static inference'); } });
    c.setTarget(word);
    const frames = naturalFrames(word, { interval: 20 });
    for (const frame of frames) { now = frame.now; await c.process(frame.points, now); }
    assert.deepEqual(results.map(r => r.timestamp), frames.map(f => f.now));
    assert.deepEqual(results.filter(r => r.isNew).map(r => r.letter), [word]);
    assert.ok(new Set(results.filter(r => r.progress > .25 && r.progress < 1).map(r => r.progress)).size > 5,
      'progress should follow the intermediate motion');
    c.dispose();
  }
});

test('matching Hello endpoints cannot validate a path that repeatedly backtracks', () => {
  // A clear back-and-forth (about a third of a palm), not webcam-scale wobble.
  const x = [0, .35, 0, .4, .05, .45, .1, .5, .15, .55, .2, .6, .7, .78, .82, .82];
  const d = new DynamicGestureRecognizer();
  const results = x.map((dx, j) => d.update(cameraPoints(pose('OPEN'), { dx }), j * 80));
  assert.ok(results.some(r => r.progress > .8), 'reach the endpoint with sufficient displacement');
  assert.equal(results.some(r => r.isNew), false);
});

test('Yes needs a bend that returns; a repeated nod counts once', () => {
  // ASL YES is often nodded twice. The second nod must not score again.
  const twice = [0, .15, .3, .45, .6, .45, .3, .45, .6, .45, .3, .15, 0, 0];
  const d = new DynamicGestureRecognizer();
  const results = twice.map((nod, j) => d.update(cameraPoints(pose('FIST'), { nod }), j * 80));
  assert.ok(results.some(r => r.phase === 'returning'));
  assert.deepEqual(results.filter(r => r.isNew).map(r => r.letter), ['YES']);
  // Bending and shaking without ever returning near the start does not count.
  const stuck = [0, .15, .3, .45, .6, .45, .6, .45, .6, .45, .6, .6];
  const e = new DynamicGestureRecognizer();
  assert.equal(stuck.some((nod, j) => e.update(cameraPoints(pose('FIST'), { nod }), j * 80).isNew), false);
});

test('webcam-scale landmark jitter does not stop words or trigger them on a still hand', () => {
  let seed = 3;
  const noise = () => { seed = (seed * 16807) % 2147483647; const u = seed / 2147483647; seed = (seed * 16807) % 2147483647; return Math.sqrt(-2 * Math.log(u + 1e-12)) * Math.cos(2 * Math.PI * seed / 2147483647) * .002; };
  const jitter = points => points.map(p => ({ x: p.x + noise(), y: p.y + noise(), z: p.z + noise() }));
  for (const word of ['HELLO', 'YES', 'NO']) {
    let accepted = 0;
    for (let trial = 0; trial < 10; trial++) {
      const d = new DynamicGestureRecognizer();
      // Hold the starting pose for 0.8 s at 30 fps, then move: jitter accumulates while still.
      const frames = [...Array.from({ length: 24 }, () => naturalFrames(word, { interval: 33 })[0]), ...naturalFrames(word, { interval: 33 })];
      if (frames.some((f, j) => d.update(jitter(f.points), j * 33).isNew)) accepted++;
    }
    assert.ok(accepted >= 9, `${word} accepted ${accepted}/10 with 2-3 px jitter`);
  }
  for (const sign of ['OPEN', 'FIST', 'NO_OPEN', 'NO_CLOSED']) {
    const d = new DynamicGestureRecognizer();
    for (let j = 0; j < 150; j++) assert.equal(d.update(jitter(cameraPoints(pose(sign))), j * 33).isNew, false, sign);
  }
});

test('a few discrete position changes followed by a held endpoint do not replace a full sweep', () => {
  const d = new DynamicGestureRecognizer();
  const positions = [0, 0, .4, .8, .8, .8, .8, .8];
  for (const [j, dx] of positions.entries()) assert.equal(d.update(cameraPoints(pose('OPEN'), { dx }), j * 100).isNew, false);
});

test('No checks both finger paths together, even when both eventually reach the thumb', () => {
  const open = pose('NO_OPEN'), closed = pose('NO_CLOSED');
  open[4] = { x: -.3, y: -.3, z: 0 }; closed[4] = { ...open[4] };
  closed[12].x = -.12;
  const d = new DynamicGestureRecognizer();
  const results = Array.from({ length: 24 }, (_, frame) => {
    const p = open.map((v, j) => {
      const progress = clampProgress((frame - (j >= 9 && j <= 12 ? 5 : 0)) / 12);
      return Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, v[axis] + (closed[j][axis] - v[axis]) * progress]));
    });
    return d.update(cameraPoints(p), frame * 80);
  });
  assert.equal(results.at(-1).candidate, 'NO');
  assert.ok(results.at(-1).progress > .8, 'both tips reach the closing endpoint');
  assert.equal(results.some(r => r.isNew), false, 'staggered finger paths must not count as coordinated closure');
});

function clampProgress(value) { return Math.max(0, Math.min(1, value)); }

test('Yes uses world-landmark depth, so a normal nod counts even when image depth is underestimated', () => {
  // MediaPipe image z often reads a fraction of true depth; world landmarks do not.
  const nodFrames = (degrees, { translate = 0 } = {}) => Array.from({ length: 60 }, (_, k) => {
    const wave = Math.sin(Math.PI * Math.min(1, Math.max(0, (k - 15) / 21)));
    const options = { nod: wave * degrees * Math.PI / 180, dy: wave * translate };
    const truth = cameraPoints(pose('FIST'), options);
    return { now: k * 33, image: truth.map(p => ({ ...p, z: p.z * .3 })), world: truth.map(p => ({ x: p.x - .5, y: p.y - .6, z: p.z })) };
  });
  const words = (frames, useWorld) => {
    const d = new DynamicGestureRecognizer();
    return frames.map(f => d.update(f.image, f.now, useWorld ? f.world : null)).filter(r => r.isNew).map(r => r.letter);
  };
  for (const degrees of [25, 35]) {
    assert.deepEqual(words(nodFrames(degrees), true), ['YES'], `${degrees}° nod with world depth`);
    assert.deepEqual(words(nodFrames(degrees), false), [], 'squashed image depth alone hides the bend');
  }
  assert.deepEqual(words(nodFrames(0, { translate: 1 }), true), [], 'moving an unbent fist is not a nod');
  const d = new DynamicGestureRecognizer();
  const progress = nodFrames(30).map(f => d.update(f.image, f.now, f.world)).find(r => r.motion?.peakDegrees >= 20);
  assert.equal(progress.motion.depth, 'world', 'diagnostics report the bend and its depth source');
});

test('HELLO accepts the flat B-hand salute and fingertips beyond the top of the frame', async () => {
  const sweep = (shape, { top = 0 } = {}) => Array.from({ length: 40 }, (_, k) => {
    const m = Math.min(1, Math.max(0, (k - 8) / 18));
    return { now: k * 33, points: cameraPoints(pose(shape), { dx: m * 1.3, dy: top + m * .3 }) };
  });
  for (const [label, frames] of [['thumb tucked', sweep('B')], ['fingertips above the frame', sweep('OPEN', { top: -6.3 })]]) {
    if (label.startsWith('fingertips')) assert.ok(frames[0].points.some(p => p.y < 0), 'test really starts out of frame');
    let now = 0; const results = [];
    const c = new RecognitionController({ clock: () => now, infer: async () => { throw new Error('words never use the model'); }, onResult: r => results.push(r) });
    c.setTarget('HELLO'); c.setChallenge(label);
    for (const f of frames) { now = f.now; await c.process(f.points, now); }
    assert.deepEqual(results.filter(r => r.isNew).map(r => r.letter), ['HELLO'], label);
    c.dispose();
  }
  // Letters still need the whole hand in view.
  let now = 0; const letters = [];
  const c = new RecognitionController({ clock: () => now, infer: async () => { throw new Error('unreachable'); }, onResult: r => letters.push(r.status) });
  c.setTarget('B');
  await c.process(sweep('OPEN', { top: -6.3 })[0].points, 0);
  assert.deepEqual(letters, ['out-of-frame']);
  c.dispose();
});
