import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { recognizeFGeometry } from '../src/utils/handGeometry.js';
import { recognizeStaticGeometry } from '../src/recognition/staticGeometry.js';
import { recognizeLetter } from '../src/utils/recognizeLetter.js';
import { RecognitionController } from '../src/recognition/controller.js';
import { RaceEngine } from '../src/utils/raceEngine.js';
import { cameraPoints, pose } from './fixtures/signs.mjs';

function fPose() {
  const p = pose('B');
  p[6] = { x: -.65, y: -.65, z: 0 };
  p[7] = { x: -.8, y: -.6, z: .3 };
  p[8] = { x: -.75, y: -.3, z: .4 };
  p[4] = { ...p[8], x: -.72 };
  return p;
}

test('F recognizes a curved index/thumb circle across scale, reflection, rotation and depth tilt', () => {
  for (const scale of [.04,.08,.12]) for (const mirror of [false,true])
    for (const angle of [-.7,0,.7]) for (const nod of [0,.5]) {
      const p = cameraPoints(fPose(), {scale,mirror,angle,nod});
      assert.equal(recognizeFGeometry(p),true);
      assert.equal(recognizeStaticGeometry(p).letter,'F');
      assert.equal(recognizeLetter(p),'F');
    }
});

test('F rejects an open pinch, a straight index, folded raised fingers and neighboring letters', () => {
  for(const sign of ['A','B','C','D','I','L','V','W','Y','OPEN','FIST']) assert.equal(recognizeFGeometry(cameraPoints(pose(sign))),false,sign);
  const open=fPose();open[4]={...open[4],x:-1.3};
  assert.equal(recognizeFGeometry(cameraPoints(open)),false);
  const folded=fPose();for(const n of [14,15,16]) folded[n]=pose('FIST')[n];
  assert.equal(recognizeFGeometry(cameraPoints(folded)),false);
  assert.equal(recognizeFGeometry(null),false);
});

const classes=JSON.parse(await readFile(new URL('../public/models/asl/mlp_classes.json',import.meta.url)));
for(const mode of ['single','versus']) test(`F geometry overrides wrong or uncertain model results in ${mode} races`,async()=>{
  for(const predicted of ['D','S',null]) {
    let now=0;const results=[];
    const race=new RaceEngine({mode,targetLetters:['F'],clock:()=>now});
    race.addPlayer('p1');if(mode==='versus') race.addPlayer('p2');race.start();
    const controller=new RecognitionController({clock:()=>now,
      infer:async()=>({logits:classes.map(c=>predicted===null?0:c===predicted?20:-20),classes}),
      onResult:r=>{results.push(r);if(r.isNew)race.submitRecognition('p1',r,now);}});
    controller.setTarget('F');controller.setChallenge(race.getChallengeId('p1'));
    // The camera's height-normalized coordinates must be corrected for geometry.
    const p=cameraPoints(fPose(),{scale:.04}).map(p=>({...p,y:(p.y-.3)*16/9}));
    for(now=0;now<=1200;now+=100) await controller.process(p,now,{aspectRatio:16/9});
    assert.deepEqual(results.filter(r=>r.isNew).map(r=>r.letter),['F']);
    assert.equal(race.status,'finished');
    assert.match(results.at(-1).method,/F geometry/);
    controller.dispose();
  }
});
