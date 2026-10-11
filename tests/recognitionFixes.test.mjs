import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { metricLandmarks, handFeatures } from '../src/utils/handGeometry.js';
import { recognizeStaticGeometry } from '../src/recognition/staticGeometry.js';
import { RecognitionController } from '../src/recognition/controller.js';
import { DynamicGestureRecognizer } from '../src/recognition/dynamicGestures.js';
import { pose, cameraPoints, wordFrames } from './fixtures/signs.mjs';

const classes = JSON.parse(await readFile(new URL('../public/models/asl/mlp_classes.json', import.meta.url)));
const inference = letter => ({ logits: classes.map(c => c === letter ? 20 : -20), classes, latencyMs: 1 });

// Side-on C with curl mainly at MCP: its finger reach is near chain length,
// and its thumb/index opening is larger than the old 0.95-chain limit.
function knuckleC() {
  const c = pose('C');
  for (const base of [5, 9, 13, 17]) {
    c[base + 1] = { x: c[base].x, y: -.4, z: .4 };
    c[base + 2] = { x: c[base].x, y: -.5, z: .7 };
    c[base + 3] = { x: c[base].x, y: -.48, z: .9 };
  }
  c[2] = { x: -.7, y: .65, z: 0 };
  c[3] = { x: -.6, y: .65, z: .3 };
  c[4] = { x: -.5, y: .65, z: .7 };
  return c;
}

test('C recognizes knuckle-dominant curl and is unchanged by wrist position', () => {
  const c = knuckleC();
  const f = handFeatures(cameraPoints(c));
  assert.equal(f.fingers.index.arc, false, 'old per-joint arc rule rejects this C');
  assert.ok(f.distance(4, 8) / f.fingers.index.length > .95, 'old aperture limit rejects this C');
  for (const wrist of [{ x: 0, y: 1, z: 0 }, { x: .7, y: .6, z: .4 }, c[9]]) {
    c[0] = { ...wrist };
    for (const mirror of [false, true]) for (const angle of [-.6, 0, .6]) {
      assert.equal(recognizeStaticGeometry(cameraPoints(c, { mirror, angle })).letter, 'C');
    }
  }
  // The same extended thumb without four curved fingers is not enough.
  const palm = knuckleC();
  const open = pose('OPEN');
  for (const base of [5, 9, 13, 17]) for (let j = 1; j <= 3; j++) palm[base + j] = open[base + j];
  assert.notEqual(recognizeStaticGeometry(cameraPoints(palm)).letter, 'C');
});

test('knuckle-dominant C reaches static confirmation despite a wrong B model result', async () => {
  let now = 0; const results = [];
  const c = new RecognitionController({ clock: () => now, infer: async () => inference('B'), onResult: r => results.push(r) });
  c.setChallenge('practice-c'); c.setTarget('C');
  for (now = 0; now <= 1200; now += 100) await c.process(cameraPoints(knuckleC()), now);
  assert.deepEqual(results.filter(r => r.isNew).map(r => r.letter), ['C']);
  assert.ok(results.filter(r => r.timestamp < 900).every(r => !r.isNew), 'keep the existing hold gate');
  c.dispose();
});

test('knuckle-dominant O and an unopposed claw cannot fall through to B', async () => {
  const o = knuckleC(); o[4] = { ...o[8] };
  const claw = knuckleC(); claw[3] = { x: -.6, y: .65, z: .9 }; claw[4] = { x: -.5, y: .65, z: .5 };
  for (const shape of [o, claw]) {
    let now = 0; const results = [];
    const c = new RecognitionController({ clock: () => now, infer: async () => inference('B'), onResult: r => results.push(r) });
    for (now = 0; now <= 1200; now += 100) await c.process(cameraPoints(shape), now);
    assert.ok(results.every(r => r.letter === null && !r.isNew));
    c.dispose();
  }
});

test('C permits a smooth arc with straighter distal joints while rejecting palm, fist and O', () => {
  const c = pose('C');
  for (const base of [5,9,13,17]) c[base + 3] = { x: c[base].x, y: -.65, z: 1 };
  for (const mirror of [false,true]) for (const nod of [0,.5]) {
    assert.equal(recognizeStaticGeometry(cameraPoints(c,{mirror,nod})).letter,'C');
  }
  for (const sign of ['OPEN','FIST']) assert.notEqual(recognizeStaticGeometry(cameraPoints(pose(sign))).letter,'C');
  c[4] = { ...c[8] };
  assert.notEqual(recognizeStaticGeometry(cameraPoints(c)).letter,'C');
});

test('uncertain added-letter geometry cannot fall through to a confident wrong model class', async () => {
  const uncertainI = pose('I'); uncertainI[4].x = -1.4;
  const o = pose('C'); o[4] = { ...o[8] };
  const claw = pose('C'); claw[3] = { x: -.8, y: 0, z: 0 }; claw[4] = { x: -.5, y: -.05, z: 0 };
  for (const p of [uncertainI,o,claw]) {
    let now = 0; const results=[];
    const c = new RecognitionController({clock:()=>now,infer:async()=>inference('A'),onResult:r=>results.push(r)});
    for(now=0;now<=1200;now+=100) await c.process(cameraPoints(p),now);
    assert.ok(results.every(r=>!r.isNew&&r.letter===null));
    c.dispose();
  }
});

test('W uses individual MCP spacing and thumb/little-finger contact', () => {
  const w = pose('W');
  for (const [base,tipX] of [[5,-.53],[9,-.17],[13,.19]]) {
    for (const [joint,fraction] of [[1,.4],[2,.72],[3,1]]) {
      w[base + joint] = { x: w[base].x + (tipX - w[base].x) * fraction, y: -1.45 * fraction, z: 0 };
    }
  }
  w[4] = { x: .4, y: -.12, z: .25 };
  const points = cameraPoints(w);
  const f = handFeatures(points);
  assert.ok(f.distance(8,12) < .4 && !f.thumbClosed, 'old constraints reject this geometry');
  assert.equal(recognizeStaticGeometry(points).letter,'W');
  assert.equal(recognizeStaticGeometry(cameraPoints(pose('V'))).letter,'V');
  assert.notEqual(recognizeStaticGeometry(cameraPoints(pose('OPEN'))).letter,'W');
});

test('Y uses thumb abduction, allowing a naturally bent IP without confusing I/L', () => {
  const y = pose('Y');
  y[3] = { x: -1.1, y: .2, z: 0 }; y[4] = { x: -1.55, y: -.45, z: 0 };
  const f = handFeatures(cameraPoints(y));
  assert.ok(f.thumbAngle < 145 && f.thumbAbducted);
  for (const mirror of [false,true]) for (const angle of [-.7,0,.7]) assert.equal(recognizeStaticGeometry(cameraPoints(y,{mirror,angle})).letter,'Y');
  assert.equal(recognizeStaticGeometry(cameraPoints(pose('I'))).letter,'I');
  assert.notEqual(recognizeStaticGeometry(cameraPoints(pose('L'))).letter,'Y');
});

test('D requires genuine curl/contact geometry and rejects a raised index without the circle', () => {
  assert.equal(recognizeStaticGeometry(cameraPoints(pose('D'))).letter,'D');
  const missingCircle = pose('D'); missingCircle[4] = { x: -.8, y: .4, z: 0 };
  assert.notEqual(recognizeStaticGeometry(cameraPoints(missingCircle)).letter,'D');
  assert.notEqual(recognizeStaticGeometry(cameraPoints(pose('L'))).letter,'D');
});

test('widescreen correction restores all added geometry and preserves raw model inputs', async () => {
  for (const letter of ['C','D','W','Y','I','V']) {
    for (const aspectRatio of [4/3,16/9,9/16]) {
      const metric = cameraPoints(pose(letter),{scale:.04}).map(p=>({...p,y:p.y-.25}));
      const raw = metric.map(p => ({ ...p, y: p.y * aspectRatio }));
      const corrected = metricLandmarks(raw,aspectRatio);
      assert.equal(recognizeStaticGeometry(corrected).letter,letter);
      let now = 0; const results = []; let input;
      const c = new RecognitionController({ clock: () => now, infer: async value => { input = value; return inference('A'); }, onResult: r => results.push(r) });
      for (now=0; now<=1000; now+=100) await c.process(raw,now,{aspectRatio});
      assert.equal(results.find(r => r.isNew)?.letter,letter);
      // ONNX normalization still uses the uncorrected y/wrist scale.
      const scale = Math.hypot(raw[9].x-raw[0].x,raw[9].y-raw[0].y,raw[9].z-raw[0].z);
      assert.ok(Math.abs(input[28]-(raw[9].y-raw[0].y)/scale)<1e-6);
      c.dispose();
    }
  }
});

test('word progress is tied to movement, with no endpoint hold timer', () => {
  for (const word of ['HELLO','YES','NO']) {
    const d = new DynamicGestureRecognizer();
    const results = [];
    for (const frame of wordFrames(word)) {
      results.push(d.update(frame.points,frame.now));
      if (results.at(-1).isNew) break;
    }
    assert.ok(results.some(r=>r.progress===.25));
    assert.ok(results.some(r=>r.progress===.5));
    assert.ok(results.some(r=>r.progress===.75));
    assert.equal(results.at(-1).progress,1);
    assert.equal(results.at(-1).phase,'complete');
    const still = new DynamicGestureRecognizer();
    for (let now=0;now<2000;now+=100) assert.ok(still.update(wordFrames(word)[0].points,now).progress<=.25);
    // Begin moving immediately; no 180 ms starting hold is needed.
    const moving = new DynamicGestureRecognizer();
    const frames = wordFrames(word).filter((_,i)=>i===0||i>=3);
    const motionResults = frames.map((f,i)=>moving.update(f.points,i*100));
    assert.equal(motionResults.filter(r=>r.isNew).length,1);
  }
});

test('challenge changes reset partial static holds and ignore stale inference failures', async () => {
  let now=0; const results=[];
  const c=new RecognitionController({clock:()=>now,infer:async()=>inference('A'),onResult:r=>results.push(r)});
  for(now=0;now<=600;now+=100) await c.process(cameraPoints(pose('A')),now);
  c.setChallenge('next');
  for(now=700;now<=1500;now+=100) await c.process(cameraPoints(pose('A')),now);
  assert.equal(results.filter(r=>r.isNew).length,0);
  now=1600; await c.process(cameraPoints(pose('A')),now);
  assert.equal(results.filter(r=>r.isNew).length,1);
  c.dispose();
  let reject; const stale=[];
  const pending=new RecognitionController({clock:()=>0,infer:()=>new Promise((_,r)=>{reject=r;}),onResult:r=>stale.push(r)});
  const request=pending.process(cameraPoints(pose('A')),0);
  pending.setChallenge('new'); reject(new Error('old model failure'));
  await request;
  assert.deepEqual(stale,[]);
  pending.dispose();
});
