import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fresh} from '../lib/engine.js';
import {initDevices,approve} from '../lib/devices.js';
import {planStudyEnvironment} from '../lib/study-environment.js';
const request={question:'我要开始学习了',profileId:'exam'};
test('memory preference and current device state produce only necessary adjustments, pending approval',async()=>{
  const s=fresh('home'),dev=initDevices(s),p=planStudyEnvironment(s,request);
  assert.equal(p.actionIds.length,3);
  assert(p.rows.filter(r=>['curtain','speaker'].includes(r.deviceId)).every(r=>r.status==='matched'));
  assert.equal(dev.registry.find(d=>d.id==='living_light').state.on,false);
  assert(dev.pending.every(a=>a.source==='memory'&&a.evidence[0].memoryId==='exam-environment'));
  for(const id of p.actionIds)await approve(s,id);
  assert.equal(dev.registry.find(d=>d.id==='living_light').state.on,true);
  assert.deepEqual(dev.registry.find(d=>d.id==='bedroom_ac').state,{on:true,temp:24});
  assert.equal(planStudyEnvironment(s,request).actionIds.length,0);
});
test('repeating a request reuses pending actions; changing profile supersedes conflicting temperature',()=>{
  const s=fresh('home'),a=planStudyEnvironment(s,request),again=planStudyEnvironment(s,request);
  assert.deepEqual(again.actionIds,a.actionIds);
  const old=initDevices(s).pending.find(p=>p.capability==='set_temperature');
  const p=planStudyEnvironment(s,{...request,profileId:'daily'});
  assert.equal(old.status,'superseded');
  assert(!p.rows.some(r=>r.capability==='set_temperature'&&r.actionId)); // already 26 degrees
});
test('missing, offline and unsupported hardware never receives an action',()=>{
  const s=fresh('home'),dev=initDevices(s);
  dev.registry=dev.registry.filter(d=>d.id!=='curtain');
  dev.registry.find(d=>d.id==='living_light').online=false;
  dev.registry.find(d=>d.id==='bedroom_ac').capabilities=['get_state'];
  const p=planStudyEnvironment(s,request);
  assert.equal(p.actionIds.length,0);
  assert(p.rows.some(r=>r.status==='offline'));
  assert(p.rows.some(r=>r.status==='missing'));
  assert(p.rows.some(r=>r.status==='unsupported'));
});
test('negated requests, unrelated messages and studying elsewhere do not control home devices',()=>{
  const s=fresh('home');
  for(const question of ['你好','我不想开始学习了','我要去图书馆学习','不要调整学习环境'])assert.equal(planStudyEnvironment(s,{...request,question}),null);
  assert.equal(initDevices(s).pending.length,0);
});
test('device going offline before approval records failure and cannot replay the action',async()=>{
  const s=fresh('home'),p=planStudyEnvironment(s,request),dev=initDevices(s),id=p.actionIds[0];
  dev.registry.find(d=>d.id==='living_light').online=false;
  await assert.rejects(approve(s,id),/离线/);
  assert.equal(dev.pending.find(a=>a.id===id).status,'failed');
  assert.equal(await approve(s,id),null);
});
