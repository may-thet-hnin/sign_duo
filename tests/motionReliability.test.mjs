import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { recognizeEGeometry, motionHandFeatures } from '../src/utils/handGeometry.js';
import { recognizeStaticGeometry } from '../src/recognition/staticGeometry.js';
import { RecognitionController } from '../src/recognition/controller.js';
import { DynamicGestureRecognizer } from '../src/recognition/dynamicGestures.js';
import { MotionLetterRecognizer } from '../src/recognition/motionLetters.js';
import { cameraPoints, pose, wordFrames } from './fixtures/signs.mjs';

function ePose() {
  const points = pose('FIST');
  for (const base of [5,9,13,17]) {
    const x = points[base].x;
    points[base+1] = { x, y: -.8, z: 0 };
    points[base+2] = { x, y: -.65, z: .2 };
    points[base+3] = { x, y: -.3, z: .2 };
  }
  points[4] = { x: -.05, y: -.05, z: .2 };
  return points;
}

test('E geometry accepts a row of curled fingertips above the thumb across scale and rotation', () => {
  for (const mirror of [false,true]) for (const angle of [-.7,0,.7]) for (const scale of [.04,.08,.12]) {
    const points = cameraPoints(ePose(), { mirror, angle, scale });
    assert.equal(recognizeEGeometry(points), true);
    assert.equal(recognizeStaticGeometry(points).letter, 'E');
  }
  for (const sign of ['FIST','A','B','C','D','I','L','OPEN']) assert.equal(recognizeEGeometry(cameraPoints(pose(sign))), false, sign);
});

test('E geometry completes a stable hold even when the model confuses it with S', async () => {
  const classes = JSON.parse(await readFile(new URL('../public/models/asl/mlp_classes.json', import.meta.url)));
  let now = 0; const results = [];
  const controller = new RecognitionController({ clock: () => now,
    infer: async () => ({ logits: classes.map(c => c === 'S' ? 20 : -20), classes }),
    onResult: r => results.push(r) });
  controller.setTarget('E');
  for (now = 0; now <= 1500; now += 100) await controller.process(cameraPoints(ePose()), now);
  assert.deepEqual(results.filter(r => r.isNew).map(r => r.letter), ['E']);
  assert.equal(results.at(-1).modelLetter, 'S');
  assert.match(results.at(-1).method, /E geometry/);
  controller.dispose();
});

for (const word of ['HELLO','YES','NO']) test(`${word} tolerates one misclassified pose frame and irregular frame timing`, () => {
  for (const mirror of [false,true]) {
    const recognizer = new DynamicGestureRecognizer();
    const frames = wordFrames(word, {mirror});
    const results = frames.map((frame, n) => recognizer.update(n === 4 ? cameraPoints(pose('L')) : frame.points, n*120, word));
    assert.equal(results.filter(r=>r.isNew).length, 1, `${word} ${mirror}`);
  }
});

test('HELLO allows a tucked thumb and a diagonal outward sweep', () => {
  const recognizer = new DynamicGestureRecognizer();
  const frames = wordFrames('HELLO');
  const results = frames.map((frame,n) => {
    const points = frame.points.map((p,i) => i < 5 ? cameraPoints(pose('B'))[i] : { ...p, y: p.y - Math.min(n/7,1)*.05 });
    // Translate thumb and wrist consistently with the hand.
    const dx = frame.points[0].x - frames[0].points[0].x;
    for (let i=0;i<5;i++) points[i] = {...points[i],x:points[i].x+dx,y:points[i].y-Math.min(n/7,1)*.05};
    return recognizer.update(points, frame.now, 'HELLO');
  });
  assert.equal(results.filter(r=>r.isNew).length,1);
});

function motionFrames(letter, mirror = false) {
  const path = letter === 'J' ? [[0,0],[0,0],[.06,.2],[.1,.43],[-.1,.5],[-.23,.4],[-.23,.4],[-.23,.4]]
    : [[0,0],[0,0],[.25,.05],[.53,.1],[.32,.26],[.05,.43],[.3,.45],[.59,.48],[.59,.48],[.59,.48]];
  return path.map(([dx,dy],n)=>({ now: n*120, points:cameraPoints(pose(letter==='J'?'I':'L'), {dx:mirror?-dx:dx,dy,mirror}) }));
}
for (const letter of ['J','Z']) test(`${letter} accepts smaller imperfect strokes and one pose glitch for either hand`, () => {
  for (const mirror of [false,true]) {
    const recognizer = new MotionLetterRecognizer();
    const results = motionFrames(letter, mirror).map((f,n)=>recognizer.update(n===1?cameraPoints(pose('B')):f.points,f.now,letter));
    assert.equal(results.filter(r=>r.isNew).length,1, `${letter} ${mirror}`);
  }
});

test('motion finger features accept foreshortened straight fingers', () => {
  const points = pose('I');
  for (const i of [18,19,20]) points[i].y = points[i].y * .5;
  assert.equal(motionHandFeatures(cameraPoints(points)).fingers.pinky.motionExtended, true);
});

test('targeted word detection rejects another word and re-arms after a changed pose', () => {
  const recognizer = new DynamicGestureRecognizer();
  for (const frame of wordFrames('HELLO')) assert.equal(recognizer.update(frame.points,frame.now,'YES').isNew,false);
  recognizer.reset();
  let count = 0;
  for (const frame of wordFrames('YES')) count += Number(recognizer.update(frame.points,frame.now,'YES').isNew);
  for (let now=1400;now<=1900;now+=100) recognizer.update(cameraPoints(pose('OPEN')),now,'YES');
  for (const frame of wordFrames('YES')) count += Number(recognizer.update(frame.points,frame.now+2000,'YES').isNew);
  assert.equal(count,2);
});

for (const target of ['J','Z','HELLO','YES','NO']) test(`${target} controller keeps a stroke across one missed tracking frame`, async () => {
  let now = 0; const results = [];
  const controller = new RecognitionController({ clock:()=>now,
    infer:async()=>{ throw new Error('Motion must not run model inference'); }, onResult:r=>results.push(r) });
  controller.setTarget(target); controller.setChallenge('motion');
  const trajectory = ['J','Z'].includes(target) ? motionFrames(target) : wordFrames(target);
  for (const [n,frame] of trajectory.entries()) {
    now=frame.now;
    await controller.process(frame.points,now);
    if(n===3) { now+=35; await controller.process(null,now); }
  }
  assert.equal(results.filter(r=>r.isNew).length,1,target);
  assert.equal(results.find(r=>r.isNew).letter,target);
  controller.dispose();
});

test('long tracking loss clears partial motion and never completes from the missing frames', async () => {
  let now = 0; const results = [];
  const controller = new RecognitionController({ clock:()=>now, infer:async()=>{}, onResult:r=>results.push(r) });
  controller.setTarget('Z');
  const trajectory=motionFrames('Z');
  for(const frame of trajectory.slice(0,4)) {now=frame.now;await controller.process(frame.points,now);}
  for(now=400;now<=1000;now+=100) await controller.process(null,now);
  for(const frame of trajectory.slice(4)) {now=frame.now+1000;await controller.process(frame.points,now);}
  assert.equal(results.some(r=>r.isNew),false);
  controller.dispose();
});

test('E accepts fingertips touching the thumb instead of requiring an air gap', () => {
  const points=ePose();points[4]={...points[8]};
  assert.equal(recognizeEGeometry(cameraPoints(points)),true);
});

test('motion at camera frame rate completes without relying on large per-frame changes', () => {
  for(const word of ['HELLO','YES','NO']) {
    const frames=wordFrames(word);
    const recognizer=new DynamicGestureRecognizer();const results=[];
    for(let n=0;n<=78;n++) {
      const position=n/6;const index=Math.min(12,Math.floor(position));const t=position-index;
      const a=frames[index].points,b=frames[index+1].points;
      const points=a.map((p,j)=>Object.fromEntries(['x','y','z'].map(axis=>[axis,p[axis]+(b[j][axis]-p[axis])*t])));
      results.push(recognizer.update(points,n*33,word));
    }
    assert.equal(results.filter(r=>r.isNew).length,1,word);
  }
});
