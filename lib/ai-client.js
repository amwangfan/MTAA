import {publishers} from './engine.js';
import {validateExtraction,ExtractionError} from './extraction-contract.js';
import {validateMemoryExtraction} from './memory-contract.js';
import {validateInitiativeResponse} from './initiative-contract.js';
import {addCandidates} from './memory.js';
export function makeRequest(s,message){const allowed=publishers(s);let total=0;const context=s.messages.filter(m=>m.id!==message.id&&allowed.includes(m.author)&&m.time<=message.time).slice(-12).reverse().filter(m=>(total+=m.text.length)<=16000).reverse().map(({id,author,text,time})=>({id,author,text,time}));return{version:1,groupId:s.scenario,now:message.time,message:{id:message.id,author:message.author,text:message.text,time:message.time},context,tasks:s.tasks.filter(t=>!['done','cancelled'].includes(t.status)).slice(-80).map(({id,title,status,due,windowStart})=>({id,title,status,due,windowStart}))};}
// AI 提取结果先生成建议，不直接落任务（功能二）。
export function applyAI(s,messageId,response,request){
 const message=s.messages.find(m=>m.id===messageId);if(!message)throw new Error('原消息不存在');if(message.aiApplied)return message.outcome;
 if(response.version!==1||response.engine?.type!=='ai')throw new ExtractionError('INVALID_EXTRACTION','提取服务版本或来源标识无效');
 validateExtraction(response.extraction,request);
 s.suggestions=s.suggestions||[];let lastId;
 for(const item of response.extraction.items){
  if(item.operation!=='create'&&!s.tasks.some(t=>t.id===item.targetId))throw new ExtractionError('TASK_CONFLICT','目标事项已变化，请重试');
  const sug={id:'s'+(++s.seq),groupId:s.scenario,messageId,author:message.author,time:message.time,operation:item.operation,targetId:item.operation==='create'?null:item.targetId,title:item.title,kind:item.kind,due:item.when.value?Date.parse(item.when.value):null,windowStart:item.when.start?Date.parse(item.when.start):null,precision:item.when.precision,location:item.location.value?{value:item.location.value,mode:item.location.mode,basis:'AI提取 · 有原文依据'}:null,requirements:item.requirements,needsConfirmation:item.needsConfirmation,evidence:item.evidence,status:'pending',origin:'ai',history:[{at:message.time,text:'AI提取生成待办建议，程序校验原文后待确认'}],taskId:null};
  s.suggestions.push(sug);lastId=sug.id;
 }
 message.aiApplied=true;message.suggested=true;message.outcome={kind:response.extraction.items.length?'suggested':'chat',text:response.extraction.items.length?`AI已生成 ${response.extraction.items.length} 条待办建议，请在右下角通知中心确认。`:'AI未识别到需要安排的事项。',suggestionId:lastId};
 return message.outcome;
}
export async function processAIMessage(s,message,{fetcher=fetch}={}){
 message=s.messages.find(m=>m.id===message.id)||message;
 if(message.aiApplied)return message.outcome;
 if(!publishers(s).includes(message.author)){message.outcome={kind:'ignored',text:'该发送者未被选为整理发布者，消息已保留。'};return message.outcome;}
 const request=makeRequest(s,message);message.outcome={kind:'ai_pending',text:'正在等待AI整理'};
 try{const res=await fetcher('/api/v1/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(45000)});const output=await res.json();if(!res.ok)throw new ExtractionError(output.code||'AI_UNAVAILABLE',output.message||'AI暂时不可用');return applyAI(s,message.id,output,request);}
 catch(e){const current=s.messages.find(m=>m.id===message.id);current.outcome={kind:'ai_pending',code:e.code||'AI_UNAVAILABLE',text:e.code?e.message:'AI连接失败，消息已保存，可以重试'};return current.outcome;}
}
// 可选 AI 记忆提取（配置时），结果仍为候选，不晋升。
export async function processMemoryAI(s,message,{fetcher=fetch}={}){
 try{const request={version:1,groupId:s.scenario,now:message.time,message:{id:message.id,author:message.author,text:message.text,time:message.time},context:[]};
  const res=await fetcher('/api/v1/memory-extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(30000)});
  if(!res.ok)return;const output=await res.json();validateMemoryExtraction(output.extraction,request);
  const recs=output.extraction.items.map(it=>({kind:it.kind,summary:it.summary,evidence:it.evidence,space:it.space||(it.kind==='episode'?'group:'+s.scenario:'owner'),importance:it.importance,createdAt:message.time,expiresAt:it.expiresAt||null,state:'candidate',origin:'ai',pattern:'AI提取',groupId:s.scenario}));
  addCandidates(s,recs);
 }catch{/* 记忆AI失败不影响主流程，规则候选已存在 */}
}
// AI 主动判断（配置时），失败回退模拟判断器。
export async function decideInitiativeAI(ctx,{fetcher=fetch}={}){
 try{const request={version:1,now:ctx.now,activity:ctx.activity,upcoming:ctx.upcoming.map(t=>({id:t.id,title:t.title,due:t.due})),overdue:ctx.overdue.map(t=>({id:t.id,title:t.title,due:t.due})),newMessages:ctx.newMessages.map(m=>({id:m.id,author:m.author,text:m.text,time:m.time})),memories:ctx.memories,policy:ctx.policy};
  const res=await fetcher('/api/v1/initiative',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(30000)});
  if(!res.ok)return null;const output=await res.json();return validateInitiativeResponse(output.decision);
 }catch{return null;}
}
