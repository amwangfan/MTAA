import {currentProfile} from './memory-profiles.js';
import {initDevices,propose} from './devices.js';

export function isStudyRequest(question){
  const q=String(question||'');
  return /(?:我要|我现在要|开始|准备).*(?:学习|复习)|(?:学习|复习).*(?:环境|设备)/.test(q)
    && !/不要|别|不想|不打算|不需要|停止|结束|取消|图书馆|教室/.test(q);
}
export function settingText(cap,args){
  if(cap==='on_off')return args.on?'打开':'关闭';
  if(cap==='set_temperature')return `${args.temp}℃`;
  if(cap==='open_close')return args.open?'拉开':'拉上';
  if(cap==='play')return args.playing?'播放':'停止';
  return '未知';
}
export function currentSetting(d,cap){
  return cap==='on_off'?{on:d.state.on}:cap==='set_temperature'?{temp:d.state.temp}:cap==='open_close'?{open:d.state.open}:{playing:d.state.playing};
}
export function planStudyEnvironment(state,{question,profileId,edits={}}){
  if(!isStudyRequest(question))return null;
  const profile=currentProfile(profileId,edits);
  if(!profile)throw new Error('记忆档案不存在');
  const memory=profile.memories.find(m=>m.id===profileId+'-environment');
  if(!memory?.settings)return null;
  const dev=initDevices(state),rows=[];
  for(const old of dev.pending.filter(p=>p.source==='memory'&&p.status==='needs_approval')){
    const wanted=memory.settings.find(s=>s.deviceId===old.deviceId&&s.capability===old.capability),d=dev.registry.find(d=>d.id===old.deviceId);
    if(old.evidence?.[0]?.memoryId!==memory.id||!wanted||!d?.online||!d.capabilities.includes(old.capability)||JSON.stringify(old.args)!==JSON.stringify(wanted.args)||settingText(old.capability,currentSetting(d,old.capability))===settingText(wanted.capability,wanted.args)){
      old.status='superseded';dev.ledger.push({id:old.id,at:state.now,stage:'superseded',source:'memory',deviceId:old.deviceId,capability:old.capability});
    }
  }
  for(const setting of memory?.settings||[]){
    const d=dev.registry.find(d=>d.id===setting.deviceId);
    if(!d){rows.push({...setting,name:setting.deviceId,status:'missing',before:'未拥有',after:settingText(setting.capability,setting.args)});continue;}
    const before=settingText(setting.capability,currentSetting(d,setting.capability)),after=settingText(setting.capability,setting.args);
    let status='matched',actionId;
    if(!d.online)status='offline';
    else if(!d.capabilities.includes(setting.capability))status='unsupported';
    else if(before!==after){
      const old=dev.pending.find(p=>p.source==='memory'&&p.status==='needs_approval'&&p.deviceId===d.id&&p.capability===setting.capability);
      // Replace an older profile's conflicting, unapproved suggestion.
      if(old&&JSON.stringify(old.args)!==JSON.stringify(setting.args)){old.status='superseded';dev.ledger.push({id:old.id,at:state.now,stage:'superseded',source:'memory',deviceId:d.id,capability:setting.capability});}
      const entry=old?.status==='needs_approval'?old:propose(state,{...setting,args:{...setting.args},source:'memory',reason:`记忆对话「${question}」；依据：${memory.summary}`,evidence:[{memoryId:memory.id,summary:memory.summary,profileId}]});
      actionId=entry.id;status='needs_approval';
    }
    rows.push({...setting,name:d.name,before,after,status,actionId});
  }
  return {question,profileId,profileName:profile.name,memory:{id:memory.id,summary:memory.summary},rows,actionIds:rows.map(r=>r.actionId).filter(Boolean),simulated:true,at:state.now};
}
