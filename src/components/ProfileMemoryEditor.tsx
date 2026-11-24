import {useMemo,useState} from 'react';
import GroupMemoryGraph from './GroupMemoryGraph';
import {Button} from './ui';

export type MemoryEdit = {summary?:string; kind?:string; origin?:string; quote?:string; removed?:boolean};
type Memory = {id:string; kind:string; summary:string; quote?:string; origin?:string; settings?:unknown};
type Props = {profile:{id:string;name:string;memories:Memory[]}; busy:boolean; highlight:string; select:(id:string)=>void;
  save:(id:string,edit:MemoryEdit)=>boolean};
const names:Record<string,string>={fact:'事实',preference:'偏好',episode:'经历'};

export default function ProfileMemoryEditor({profile,busy,highlight,select,save}:Props){
  const [showGraph,setShowGraph]=useState(false);
  const [draft,setDraft]=useState<{id:string;kind:string;text:string}|null>(null);
  const graph=useMemo(()=>({
    nodes:[{id:profile.id,kind:'group',label:profile.name},...profile.memories.map(m=>({id:m.id,kind:'memory',label:m.summary,description:m.summary}))],
    links:profile.memories.map(m=>({id:profile.id+':'+m.id,from:profile.id,to:m.id,label:names[m.kind]}))
  }),[profile]);
  const rows=showGraph ? profile.memories.filter(m=>m.id===highlight) : profile.memories;
  function submit(){
    if(!draft?.text.trim()||busy)return;
    const id=draft.id || profile.id+'-user-'+crypto.randomUUID();
    if(save(id,{kind:draft.kind,summary:draft.text.trim(),origin:'manual'})){setDraft(null);select(id);}
  }
  return <section aria-label="当前档案记忆">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">本次可用记忆 · {profile.name}</h3>
      <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={()=>setShowGraph(!showGraph)}>{showGraph?'查看列表':'查看档案图谱'}</Button>
      <Button size="sm" disabled={busy} onClick={()=>setDraft({id:'',kind:'preference',text:''})}>添加记忆</Button></div>
    </div>
    {showGraph&&<GroupMemoryGraph graph={graph} selected={highlight} onSelect={select} query="" kind="" label="档案记忆图谱"/>}
    {draft&&<form className="profile-memory" onSubmit={e=>{e.preventDefault();submit();}}>
      <label className="block text-sm">类型 <select value={draft.kind} disabled={!!draft.id||busy} onChange={e=>setDraft({...draft,kind:e.target.value})}>{Object.entries(names).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <label className="mt-2 block text-sm">记忆内容<textarea autoFocus maxLength={400} rows={3} value={draft.text} disabled={busy} onChange={e=>setDraft({...draft,text:e.target.value})} className="mt-1 w-full rounded-lg border border-field-line p-2"/></label>
      {draft.id===profile.id+'-environment'&&<p className="text-xs text-muted">修改后保存为文字记忆，并取消这条记忆原有的设备联动。</p>}
      <div className="mt-2 flex gap-2"><button type="submit" className="group-memory-link" disabled={busy||!draft.text.trim()}>保存记忆</button><button type="button" className="text-xs" onClick={()=>setDraft(null)}>取消</button></div>
    </form>}
    {showGraph&&!rows.length&&profile.memories.length>0&&<p className="my-2 text-sm text-muted">点击记忆节点可查看、编辑或移除。</p>}
    {!profile.memories.length&&<p className="my-2 text-sm text-muted">当前档案还没有记忆。</p>}
    {rows.map(m=><div id={'profile-memory-'+m.id} key={m.id} className={'profile-memory '+(highlight===m.id?'is-highlighted':'')}>
      <span className="text-xs text-muted">M{profile.memories.indexOf(m)+1} · {names[m.kind]} · {m.origin==='manual'?'手动更新':m.origin==='chat'?'对话更新':'预置'}</span><p>{m.summary}</p>
      {m.quote&&<small className="block text-muted">你的原话 · {m.quote}</small>}
      <div className="mt-2 flex gap-3"><button className="group-memory-link" disabled={busy} onClick={()=>setDraft({id:m.id,kind:m.kind,text:m.summary})}>编辑</button>
      <button className="group-memory-link" disabled={busy} onClick={()=>{if(save(m.id,{removed:true})){if(draft?.id===m.id)setDraft(null);if(highlight===m.id)select('');}}}>移除</button></div>
    </div>)}
  </section>;
}
