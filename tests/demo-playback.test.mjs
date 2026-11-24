import {test} from 'node:test';
import assert from 'node:assert/strict';
import { DemoPlayback, DEMO_STEP_COUNT, DEMO_READING_MS, DEMO_TRANSITION_MS } from '../lib/demo-playback.js';

test('eight steps include 1.5-second transitions within a 32-second playback',async()=>{
  let time=0;
  const run=new DemoPlayback({now:()=>time,sleep:async ms=>{time+=ms;}});
  assert.equal(DEMO_READING_MS, 2500);
  assert.equal(DEMO_TRANSITION_MS, 1500);
  for (let step=0; step<DEMO_STEP_COUNT; step++) {
    await run.wait(DEMO_READING_MS);
    await run.wait(DEMO_TRANSITION_MS / 2);
    await run.wait(DEMO_TRANSITION_MS / 2);
  }
  assert.equal(time, 32000);
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
