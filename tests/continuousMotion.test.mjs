import test from 'node:test';
import assert from 'node:assert/strict';
import { MotionStroke } from '../src/recognition/motionStroke.js';
import { MotionLetterRecognizer } from '../src/recognition/motionLetters.js';
import { DynamicGestureRecognizer } from '../src/recognition/dynamicGestures.js';
import { RecognitionController } from '../src/recognition/controller.js';
import { cameraPoints, pose, wordFrames } from './fixtures/signs.mjs';

test('stroke evidence rejects endpoints even after long holds; dense samples accumulate travel', () => {
  const sparse=new MotionStroke(.6);
  for(let n=0;n<50;n++) sparse.observe(n<25?0:.6);
  assert.equal(sparse.complete,false);
  const dense=new MotionStroke(.6);
  for(let n=0;n<=300;n++) dense.observe(n*.002);
  assert.equal(dense.complete,true);
});

for(const letter of ['J','Z']) test(`${letter} cannot complete by holding stroke endpoints without tracing between them`, () => {
  const path=letter==='J'?[[0,0],[0,.65],[-.45,.55]]:[[0,0],[.75,0],[0,.65],[.75,.65]];
  const recognizer=new MotionLetterRecognizer();let now=0;
  for(const [dx,dy] of path) for(let n=0;n<8;n++) {
    const points=cameraPoints(pose(letter==='J'?'I':'L'),{dx,dy});
    assert.equal(recognizer.update(points,now,letter).isNew,false);now+=100;
  }
});
for(const word of ['HELLO','YES','NO']) test(`${word} cannot complete from only starting and ending postures`,()=>{
  const frames=wordFrames(word);const recognizer=new DynamicGestureRecognizer();let now=0;
  const samples=word==='YES'?[frames[0],frames[6],frames.at(-1)]:[frames[0],frames.at(-1)];
  for(const sample of samples) for(let n=0;n<8;n++) {
    assert.equal(recognizer.update(sample.points,now,word).isNew,false);now+=100;
  }
});

test('controller retains every 60 fps motion observation and reports continuous progress',async()=>{
  let now=0;const results=[];
  const controller=new RecognitionController({clock:()=>now,infer:async()=>{throw new Error('No static inference');},onResult:r=>results.push(r)});
  controller.setTarget('HELLO');controller.setChallenge('sweep');
  for(let n=0;n<90;n++) {
    now=n*1000/60;
    await controller.process(cameraPoints(pose('OPEN'),{dx:Math.min(n/80,.8)}),now);
  }
  assert.equal(results.length,90);
  assert.equal(results.filter(r=>r.isNew).length,1);
  assert.ok(new Set(results.filter(r=>r.status==='tentative').map(r=>r.progress)).size>20);
  controller.dispose();
});

test('switching to motion does not drop frames while old static inference is pending',async()=>{
  let now=0;let resolve;const results=[];
  const controller=new RecognitionController({clock:()=>now,infer:()=>new Promise(r=>resolve=r),onResult:r=>results.push(r)});
  controller.setTarget('A');const old=controller.process(cameraPoints(pose('A')),now);
  controller.setTarget('HELLO');controller.setChallenge('new');
  for(const frame of wordFrames('HELLO')) {now=frame.now+100;await controller.process(frame.points,now);}
  assert.equal(results.filter(r=>r.isNew).length,1);
  resolve({logits:[],classes:[]});await old;
  assert.equal(results.filter(r=>r.isNew).length,1);
  controller.dispose();
});
