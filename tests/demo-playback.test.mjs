import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DemoPlayback,DEMO_STEP_MS} from '../lib/demo-playback.js';

test('eight steps each receive four seconds of playback',async()=>{
  let time=0;
  const run=new DemoPlayback({now:()=>time,sleep:async ms=>{time+=ms;}});
  assert.equal(DEMO_STEP_MS,4000);
  for(let step=0;step<8;step++)await run.wait(DEMO_STEP_MS);
  assert(time>=32000&&time<32500);
});
test('paused time is excluded and resuming preserves remaining time',async()=>{
  let time=0,count=0;
  const run=new DemoPlayback({now:()=>time,sleep:async ms=>{
    time+=ms;count++;
    if(count===2)run.paused=true;
    if(count===12)run.paused=false;
  }});
  await run.wait(240);
  assert.equal(time,900); // 240ms reading + 660ms paused/boundary intervals
});
test('stop exits even while paused and never resumes later actions',async()=>{
  let time=0;
  const run=new DemoPlayback({now:()=>time,sleep:async ms=>{time+=ms;run.stop();}});
  run.paused=true;
  await assert.rejects(run.wait(4000),/stopped/);
  assert.equal(time,60);
});
