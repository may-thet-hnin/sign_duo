import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { metricLandmarks } from '../src/utils/handGeometry.js';
import { normalizeLandmarks } from '../src/recognition/preprocessing.js';
import { RecognitionController } from '../src/recognition/controller.js';
import { DynamicGestureRecognizer } from '../src/recognition/dynamicGestures.js';
import { pose, cameraPoints, wordFrames } from './fixtures/signs.mjs';

const classes = JSON.parse(await readFile(new URL('../public/models/asl/mlp_classes.json', import.meta.url)));
const inference = letter => ({ logits: classes.map(c => c === letter ? 20 : -20), classes, latencyMs: 1 });

test('widescreen frames reach the model with equal axes, like an undistorted hand', async () => {
  for (const aspectRatio of [4/3,16/9,9/16]) {
    const metric = cameraPoints(pose('V'),{scale:.04}).map(p=>({...p,y:p.y-.25}));
    const raw = metric.map(p => ({ ...p, y: p.y * aspectRatio }));
    let input;
    const c = new RecognitionController({ clock: () => 0, infer: async value => { input = value; return inference('V'); }, onResult: () => {} });
    await c.process(raw, 0, { aspectRatio });
    const undistorted = normalizeLandmarks(metric);
    undistorted.forEach((v, i) => assert.ok(Math.abs(input[i] - v) < 1e-5));
    c.dispose();
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
    assert.ok(results.some(r=>r.progress>.25&&r.progress<.65));
    assert.ok(results.some(r=>r.progress>=.65&&r.progress<1));
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
