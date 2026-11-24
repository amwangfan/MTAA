import {useState} from 'react';
import {store,state,act} from '../store';
import {Button,Badge} from './ui';
import {currentSetting,settingText} from '../../lib/study-environment.js';

const labels:Record<string,string>={matched:'已符合偏好',needs_approval:'待批准',executed:'模拟已调整',rejected:'已拒绝',superseded:'已被新建议替代',offline:'离线 · 不调整',missing:'未拥有 · 不调整',unsupported:'能力不支持',approved:'执行中',failed:'调整失败 · 请核对设备'};
export default function StudyEnvironment({onMemory}:{onMemory:(profile:string,id:string)=>void}){
  const plan=store.studyPlan,[busy,setBusy]=useState(false),[error,setError]=useState('');
  if(!plan)return null;
  const dev=state().devices;
  const operate=async(id:string)=>{if(busy)return;setBusy(true);setError('');try{await act.devApprove(id);}catch{setError('模拟调整未完成，请在设备页核对状态。');}finally{setBusy(false);}};
  return <section data-demo="study-environment" className="study-environment" aria-label="记忆对话学习环境联动">
    <div className="study-user"><b>我</b><p>{plan.question}</p></div>
    <div className="study-reply"><div className="mb-2 flex flex-wrap items-center gap-2"><b>Whale</b><Badge tone="amber">规则联动 · 模拟设备</Badge></div>
      <p>我查了你的「{plan.profileName}」学习偏好，并对比了已拥有设备的当前状态。只调整不符合偏好的部分，符合的保持不变。</p>
      <button className="study-memory" onClick={()=>onMemory(plan.profileId,plan.memory.id)}>记忆依据：{plan.memory.summary}</button>
      <div className="overflow-x-auto"><table className="study-device-table"><thead><tr><th>设备</th><th>当前状态</th><th>习惯设置</th><th>处理</th></tr></thead><tbody>{plan.rows.map((r:any)=>{
        const action=dev.pending.find((p:any)=>p.id===r.actionId),status=action?.status||r.status,d=dev.registry.find((d:any)=>d.id===r.deviceId);
        return <tr key={r.deviceId+':'+r.capability}><td>{r.name}{r.capability==='set_temperature'?' · 温度':''}</td><td>{d?settingText(r.capability,currentSetting(d,r.capability)):r.before}</td><td>{r.after}</td><td>{status==='needs_approval'?<span className="study-actions"><Button size="sm" disabled={busy} onClick={()=>operate(r.actionId)}>批准调整</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>act.devReject(r.actionId)}>拒绝</Button></span>:<span>{labels[status]||status}</span>}</td></tr>;
      })}</tbody></table></div>
      <p className="mt-2 text-sm text-muted">调整前逐项批准，结果同步到「设备」的状态与行动账本。</p>
      {error&&<p role="alert">{error}</p>}
    </div>
  </section>;
}
