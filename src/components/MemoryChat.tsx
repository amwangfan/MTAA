import {useEffect,useRef,useState} from 'react';
import {memoryProfiles,profileFor,simulatedMemoryAnswer} from '../../lib/memory-profiles.js';
import {validateChatAnswer} from '../../lib/memory-chat-contract.js';
import {store,state,requestStudyEnvironment} from '../store';
import StudyEnvironment from './StudyEnvironment';
import {apiFetch} from '../api';
import {Button,Badge,GlassCard} from './ui';
import {usePagedSearch,ModuleSearch,Pager} from './paged';
type Result={question:string;response?:any;error?:string};
const KEY='whale.memory-chat.v1';
function readResults():Record<string,Result>{try{const saved=JSON.parse(localStorage.getItem(KEY)||'{}'),clean:Record<string,Result>={};for(const p of memoryProfiles){const r=saved[p.id];if(r?.response?.profileId===p.id&&typeof r.question==='string'&&r.question.length<=2000){validateChatAnswer(r.response.extraction,p.id);clean[p.id]=r;}}return clean;}catch{return {};}}
export default function MemoryChat(){
 const [profileId,setProfile]=useState('exam'),[question,setQuestion]=useState('我现在要学习了，帮我安排一下。'),[results,setResults]=useState<Record<string,Result>>(readResults),[busy,setBusy]=useState(false),[highlight,setHighlight]=useState(''),[storageError,setStorageError]=useState('');
 const controller=useRef<AbortController|null>(null),profile=profileFor(profileId)!;
 useEffect(()=>()=>controller.current?.abort(),[]);
 useEffect(()=>{if(store.demo.running&&store.studyPlan){setQuestion(store.studyPlan.question);setProfile(store.studyPlan.profileId);}},[store.studyPlan]);
 useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(results));setStorageError('');}catch{setStorageError('回答暂未保存，当前页面仍可查看。');}},[results]);
 useEffect(()=>{if(highlight)document.getElementById('profile-memory-'+highlight)?.scrollIntoView({block:'nearest',behavior:'smooth'});},[profileId,highlight]);
 const run=async(compare=false)=>{const q=question.trim();if(!q||busy)return;if(!compare&&requestStudyEnvironment(q,profileId))return;const ids=compare?memoryProfiles.map(p=>p.id):[profileId],mode=store.extractMode,now=state().now;setBusy(true);controller.current=new AbortController();setResults(prev=>{const copy={...prev};ids.forEach(id=>delete copy[id]);return copy;});
 try{for(const id of ids){let response:any;try{if(mode==='rules'){response={...simulatedMemoryAnswer(id),profileId:id};}else{const res=await apiFetch('/api/v1/memory-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:1,profileId:id,question:q,now}),signal:AbortSignal.any([controller.current.signal,AbortSignal.timeout(45000)])});const data=await res.json();if(!res.ok)throw Object.assign(new Error(data.message||'回答暂不可用'),{code:data.code});if(data.version!==1||data.profileId!==id||data.engine?.type!=='ai')throw new Error('返回档案或来源标识无效');validateChatAnswer(data.extraction,id);response=data;}setResults(prev=>({...prev,[id]:{question:q,response}}));}
 catch(e:any){if(controller.current.signal.aborted)return;setResults(prev=>({...prev,[id]:{question:q,error:e.code?e.message:'请求未完成，可稍后重试。'}}));if(e.code==='AI_NOT_CONFIGURED')break;}}
 }finally{setBusy(false);}};
 const shown=memoryProfiles.filter(p=>results[p.id]);
 const chatPs=usePagedSearch(shown,(p:any)=>{const r=results[p.id];const sentences=r?.response?.extraction?.sentences?.map((s:any)=>s.text).join(' ')||'';return `${p.name} ${r?.question||''} ${sentences} ${r?.error||''}`;});
 return <GlassCard className="mb-6 p-5">
  <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 data-tour="memory-dialogue" className="text-lg font-semibold">记忆对话</h2><p className="mt-1 text-sm text-muted">说「我要开始学习了」，结合学习偏好和设备状态，准备你的学习环境。</p></div><div className="flex items-center gap-2"><Badge tone="slate">预置档案 · 不替换你的记忆</Badge><ModuleSearch ps={chatPs} placeholder="搜索回答或档案"/></div></div>
  <div role="group" aria-label="选择记忆档案" className="mb-4 flex flex-wrap gap-2">{memoryProfiles.map(p=><Button key={p.id} variant={profileId===p.id?'primary':'ghost'} disabled={busy} aria-pressed={profileId===p.id} onClick={()=>{setProfile(p.id);setHighlight('');}}>{p.name}</Button>)}</div>
  <div className="memory-chat-layout"><section><h3 className="mb-2 text-sm font-semibold">本次可用记忆 · {profile.name}</h3><p className="mb-3 text-sm text-muted">{profile.description}</p>{profile.memories.map((m,i)=><div id={'profile-memory-'+m.id} key={m.id} className={'profile-memory '+(highlight===m.id?'is-highlighted':'')}><span className="text-xs text-muted">M{i+1} · {m.kind==='preference'?'偏好':m.kind==='episode'?'经历':'事实'}（预置）</span><p>{m.summary}</p></div>)}</section>
  <section><label className="mb-2 block text-sm font-semibold" htmlFor="memory-question">你的问题</label><textarea id="memory-question" rows={3} value={question} maxLength={2000} disabled={busy} onChange={e=>setQuestion(e.target.value)} className="w-full rounded-xl border border-field-line bg-white p-3"/><div className="mt-3 flex flex-wrap gap-2"><Button disabled={busy||!question.trim()} onClick={()=>run(false)}>{busy?'正在处理…':'根据当前记忆回答'}</Button><Button variant="ghost" disabled={busy||!question.trim()} onClick={()=>run(true)}>同题对照三套记忆</Button></div><p className="mt-2 text-sm text-muted">{store.extractMode==='rules'?'固定模板：仅展示记忆差异和引用，不理解问题。':'真实AI模式：只发送问题与选中档案；三套对照最多调用模型3次。'}</p><p className="mt-2 text-xs text-muted">引用是AI标注的依据，不是对内部推理的证明。请点击编号核对。</p>{storageError&&<p role="status">{storageError}</p>}</section></div>
  <StudyEnvironment onMemory={(id,memoryId)=>{setProfile(id);setHighlight(memoryId);}}/>
  <div aria-live="polite" className="memory-answer-grid">{chatPs.items.map((p:any)=>{const r=results[p.id];return <article key={p.id} className="memory-answer"><h3>{p.name} <Badge tone={r.response?.engine?.type==='ai'?'green':'amber'}>{r.response?.engine?.type==='ai'?'AI回答':r.error?'未完成':'固定模板'}</Badge></h3><p className="mb-3 text-sm text-muted">问题：{r.question}</p>{r.error?<p role="alert" className="text-sm text-rose-800">{r.error} · 配置AI后可点击上方按钮重试。</p>:r.response.extraction.sentences.map((sentence:any,i:number)=><p key={i} className="cited-sentence">{sentence.text} {sentence.memoryIds.map((id:string)=>{const index=p.memories.findIndex((m:any)=>m.id===id);return <button key={id} disabled={busy} className="memory-citation" aria-label={'查看记忆：'+p.memories[index].summary} onClick={()=>{setProfile(p.id);setHighlight(id);}}>M{index+1}</button>;})}</p>)}</article>;})}{chatPs.searching&&!chatPs.items.length&&<p className="text-sm text-muted">没有匹配的回答。</p>}</div>
   <Pager ps={chatPs}/>
 </GlassCard>;
}
