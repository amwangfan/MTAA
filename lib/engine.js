import {extractInto} from './memory.js';
import {memberDirectory, scenarios, demoBaseMs} from './whale-demo-data.js';
export const BASE=demoBaseMs; // 2026-11-20 09:00, UTC+8
export const fmt=(ms)=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(ms);
export const day=(ms)=>new Date(ms+8*3600000).toISOString().slice(0,10);
export {memberDirectory, scenarios};
export function publishers(s){return Array.isArray(s.publisherOverride)?s.publisherOverride:(memberDirectory[s.scenario]||[]).filter(m=>['owner','admin'].includes(m.role)).map(m=>m.name);}
export function senderRole(s,name){const role=(memberDirectory[s.scenario]||[]).find(m=>m.name===name)?.role;return role==='owner'?'群主':role==='admin'?'管理员':role==='member'?'普通成员':'身份未识别';}
export function rebuildPublisherTasks(s){
 const previous=[...(s.excludedTasks||[]),...s.tasks],messages=s.messages.map(m=>({...m})),now=s.now;
 s.tasks=[];s.messages=[];s.reminders=[];s.seq=0;s.lastTaskId=null;
 for(const m of messages){s.now=m.time;if(m.aiApplied||m.suggested||m.outcome?.kind==='ai_pending'){s.messages.push(m);continue;}ingest(s,m.text,m.author,m.id);}
 let nextId=Math.max(0,...[...previous,...messages].map(x=>Number(x.id.replace(/^\D+/,''))||0));
 const refs=new Map();for(const t of s.tasks){const old=previous.find(x=>x.title===t.title);if(!old){const id='t'+(++nextId);refs.set(t.id,id);t.id=id;continue;}refs.set(t.id,old.id);t.id=old.id;
 const lastSource=Math.max(...s.messages.filter(m=>t.sources.includes(m.id)).map(m=>m.time));
 const userDate=old.history.filter(h=>h.text.startsWith('用户修改日期')&&h.at>=lastSource).at(-1);if(userDate){t.due=old.due;t.precision=old.precision;t.windowStart=old.windowStart;}
 const userStatus=old.history.filter(h=>/用户标记完成|用户取消事项|用户重新打开事项/.test(h.text)&&h.at>=lastSource).at(-1);if(userStatus)t.status=old.status;
 for(const key of ['progress','started','lastProgressAt','longReminderMode','longRevision'])if(old[key]!==undefined)t[key]=old[key];
 if(old.due===t.due&&old.stages)t.stages=old.stages;
 t.history.push(...old.history.filter(h=>h.text.startsWith('用户')));
 }
 for(const m of s.messages)if(m.taskId&&!m.aiApplied){m.taskId=refs.get(m.taskId)||m.taskId;if(m.outcome?.taskId)m.outcome.taskId=m.taskId;}
 s.lastTaskId=refs.get(s.lastTaskId)||s.lastTaskId;
 const aiTasks=previous.filter(t=>t.extraction?.type==='ai'&&t.sources.every(id=>publishers(s).includes(s.messages.find(m=>m.id===id)?.author)));const aiTitles=new Set(aiTasks.map(t=>t.title));s.tasks=s.tasks.filter(t=>!aiTitles.has(t.title)).concat(aiTasks.map(t=>({...t,reminded:false})));
 for(const m of s.messages)if(m.aiApplied&&m.taskId&&!s.tasks.some(t=>t.id===m.taskId)){m.aiApplied=false;delete m.taskId;m.outcome={kind:publishers(s).includes(m.author)?'ai_pending':'ignored',text:'发布者范围发生变化，消息保留，等待重新AI整理'};}
 s.excludedTasks=previous.filter(t=>!s.tasks.some(x=>x.title===t.title));
 s.seq=Math.max(s.seq,...[...s.messages,...s.tasks,...s.excludedTasks,...(s.suggestions||[]),...(s.memory||[])].map(x=>Number(x.id.replace(/^\D+/,''))||0));s.now=now;s.publisherVersion=2;s.noticeParserVersion=1;
}
export const isLongTask=t=>Boolean(t.windowStart&&t.due&&Date.parse(day(t.due))-Date.parse(day(t.windowStart))>=14*86400000);
export function longState(t,now){return t.status==='done'?'已完成':t.status==='cancelled'?'已取消':t.due<now?'已过截止':day(now)<day(t.windowStart)?'未开始':t.started?'进行中':'未开始';}
export function suggestedStages(t){
 if(!isLongTask(t))return [];
 const start=Date.parse(day(t.windowStart))-8*3600000,end=Date.parse(day(t.due))-8*3600000;
 return ['明确目标与准备','形成初稿 / 初步成果','检查与提交'].map((title,i)=>({title,due:Math.min(t.due,start+Math.round((end-start)/86400000*[.2,.65,1][i])*86400000+18*3600000),done:false}));
}
export function confirmStages(t,now){if(t.stages)return;t.stages=suggestedStages(t);t.longReminderMode='stages';t.history.push({at:now,text:'用户确认系统建议阶段；非群原文安排'});}
export function updateProgress(t,now,value){
 if(!Number.isInteger(value)||value<0||value>100)return false;
 t.progress=value;t.started=value>0||t.started;t.lastProgressAt=now;
 t.history.push({at:now,text:`用户更新进度：${value}%（手动填写）`});return true;
}
export function longReminderAt(t,now){
 if(!isLongTask(t)||t.status!=='todo'||t.longReminderMode==='off'||now>t.due)return null;
 const start=Date.parse(day(t.windowStart))-8*3600000;
 if(t.longReminderMode==='stages'){
  const dates=(t.stages||[]).filter(s=>!s.done&&s.due>(t.lastLongReminder||0)).map(s=>s.due);
  return dates.length?Math.min(...dates):null;
 }
 const at=Math.max(start,t.lastProgressAt||t.created,t.lastLongReminder||0)+7*86400000;return at<=t.due?at:null;
}
export function deadlineBucket(task,now){
 if(['done','cancelled'].includes(task.status))return 'archive';
 if(!task.due||task.status==='review')return 'review';
 if(task.due<now)return 'overdue';
 const days=(Date.parse(day(task.due))-Date.parse(day(now)))/86400000;
 return days===0?'today':days===1?'tomorrow':days<=7?'week':'later';
}
export function dateFrom(text,now){
 if(!/\d{1,2}[月/.-]\d{1,2}/.test(text)&&/(?:一个月|1个月|一月)内|(?:一个月|1个月)后/.test(text)){
 const local=new Date(now+8*3600000),year=local.getUTCFullYear(),month=local.getUTCMonth()+1;
 const last=new Date(Date.UTC(year,month+1,0)).getUTCDate(),date=Math.min(local.getUTCDate(),last);
 return{due:Date.UTC(year,month,date,15,59),windowStart:now,precision:'date'};
 }
 const dates=[...text.matchAll(/(?:(20\d{2})[年/.-])?(\d{1,2})[月/.-](\d{1,2})(?:日|号)?/g)];
 if(dates.length>1){const between=text.slice(dates[0].index+dates[0][0].length,dates[1].index);if(dates.length===2&&/至|到|[-~—]/.test(between)){const start=dateFrom(dates[0][0],now),end=dateFrom(text.slice(dates[1].index),now);if(start.error||end.error)return{error:start.error||end.error};if(end.due<start.due)return{error:'结束日期早于开始日期，请确认时间窗口。'};return{...end,windowStart:start.due};}return{error:'消息包含多个日期，请明确截止日期，或使用“11月17日至11月29日”这样的时间窗口。'};}
 const local=new Date(now+8*3600000);let y=local.getUTCFullYear(),m,d;
 const explicit=text.match(/(?:(20\d{2})[年/.-])?(\d{1,2})[月/.-](\d{1,2})(?:日|号)?/);
 if(explicit){y=explicit[1]?+explicit[1]:y;m=+explicit[2];d=+explicit[3];}
 else if(/今天|明天|后天/.test(text)){const n=/后天/.test(text)?2:/明天/.test(text)?1:0;const x=new Date(local.getTime()+n*86400000);y=x.getUTCFullYear();m=x.getUTCMonth()+1;d=x.getUTCDate();}
 else {const w=text.match(/(下周|本周|这周|周)([一二三四五六日天])/);if(!w)return {due:null,precision:'missing'};const target='一二三四五六日'.indexOf(w[2]==='天'?'日':w[2])+1;const current=local.getUTCDay()||7;let delta=target-current;if(w[1]==='下周')delta+=7;else if(w[1]==='周'&&delta<0)delta+=7;const x=new Date(local.getTime()+delta*86400000);y=x.getUTCFullYear();m=x.getUTCMonth()+1;d=x.getUTCDate();}
 const check=new Date(Date.UTC(y,m-1,d));if(check.getUTCFullYear()!==y||check.getUTCMonth()!==m-1||check.getUTCDate()!==d)return {error:'日期不存在，请检查月份和日期。'};
 let h=23,min=59,precision='date';const time=text.match(/(?:(上午|下午|晚上|中午)\s*)?(\d{1,2})(?::|：)(\d{2})/);const cn=text.match(/(上午|下午|晚上|中午)?\s*(\d{1,2})点(?:(\d{1,2})分?)?/);
 if(time||cn){const t=time||cn;h=+t[2];min=+(t[3]||0);if(t[1]){if(h<1||h>23||(t[1]==='上午'&&h>12))return{error:'时刻无效，请核对上午/下午与小时是否一致。'};if(/下午|晚上|中午/.test(t[1])&&h<12)h+=12;if(t[1]==='上午'&&h===12)h=0;}if(h>23||min>59)return{error:'时刻无效，请检查小时和分钟。'};precision='minute';}
 return {due:Date.UTC(y,m-1,d,h-8,min),precision};
}
export function locationFrom(text){const match=text.match(/(?:地点|会场|集合地点)\s*[：:]\s*([^\s；;。,\n，]{1,100})/);return match?match[1]:null;}
export function titleFrom(text){
 text=text.replace(/(?:一个月|1个月|一月)内|(?:一个月|1个月)后/g,'');
 text=text.replace(/^\s*(?:20\d{2}[年/.-])?\d{1,2}[月/.-]\d{1,2}(?:日|号)?\s*(?:至|到|[-~—])\s*(?:20\d{2}[年/.-])?\d{1,2}[月/.-]\d{1,2}(?:日|号)?(?:期间|内)?\s*(?:完成|提交|上交)?\s*/,'');
 let s=text.trim().replace(/^(?:请大家|请|大家|麻烦大家|麻烦|记得|我需要|我要|需要|提醒我|我来|我负责)\s*/,'');
 const quoted=s.match(/[「“《【](.*?)[」”》】]/);if(quoted)return quoted[1].replace(/通知$/,'').slice(0,50);
 s=s.replace(/(?:上午|下午|晚上|中午)?\s*\d{1,2}(?:(?::|：)\d{2}|点(?:\d{1,2}分?)?)/g,'');
 s=s.replace(/^(?:今天|明天|后天|下周[一二三四五六日天]|本周[一二三四五六日天]|周[一二三四五六日天])(?:上午|下午|晚上)?[，,\s]*/,'');
 s=s.split(/(?:20\d{2}[年/.-])?\d{1,2}[月/.-]\d{1,2}|(?:今天|明天|后天|下周|本周|这周|周)[一二三四五六日天]?/)[0];
 s=s.replace(/(?:需要|请|要)?(?:在|于)$/,'').replace(/(?:前|之前)?(?:提交|上交|交|完成|截止|报名|集合|开会|举办|开展|安排).*$/,'').replace(/[，,。！!：:\s]+$/,'');
 if(s.length<2){s=text.replace(/(?:(20\d{2})[年/.-])?\d{1,2}[月/.-]\d{1,2}(?:日|号)?/g,'').replace(/(?:今天|明天|后天|下周[一二三四五六日天]|周[一二三四五六日天])/g,'').replace(/(?:上午|下午|晚上)?\d{1,2}(?::|：)\d{2}/g,'').replace(/(?:请大家|请|之前|截止|提交|上交|完成|需要|提醒我|前|在)/g,'').trim();}
 s=s.replace(/(?:上午|下午|晚上|中午)?\s*\d{1,2}点(?:\d{1,2}分?)?/g,'').replace(/^(?:上午|下午|晚上|中午)/,'').trim();
 return (s||'待补充的事项').slice(0,50);
}
export function ingest(state,text,author='我',eventId){
 const clean=text.trim();if(!clean)return{kind:'error',text:'先写一句消息再发送。'};if(clean.length>1200)return{kind:'error',text:'演示消息最多1200字，请拆分发送。'};
 if(eventId&&state.messages.some(m=>m.id===eventId))return{kind:'ignored',text:'重复消息已忽略，没有新增任务。'};
 const msg={id:eventId||'m'+(++state.seq),text:clean,author,time:state.now};state.messages.push(msg);
 if(!publishers(state).includes(author)){msg.outcome={kind:'ignored',text:'该发送者未被选为整理发布者，消息已保留。'};return msg.outcome;}
 const date=dateFrom(clean,state.now);if(date.error){msg.outcome={kind:'review',text:date.error};return msg.outcome;}
 const active=state.tasks.filter(t=>!['done','cancelled'].includes(t.status));
 const matches=active.filter(t=>clean.includes(t.title));
 const anaphora=/刚才|上面|这项|这个|该任务/.test(clean)&&state.lastTaskId;
 const target=matches.length===1?matches[0]:matches.length===0&&anaphora?active.find(t=>t.id===state.lastTaskId):null;
 const mutation=/延期|延后|提前到|提前至|提前于|改到|改为|推迟|取消|不用交|不需要交|已完成|已经完成|我完成了|做完了/.test(clean);
 if(mutation){
  if(!target){
   const named=clean.match(/^(?:原定[^，。]*?的)?([^，。：:]{2,40}?)(?:取消|不用交|不需要交)/);
   if(named&&/取消|不用交|不需要交/.test(clean)){
    const title=named[1].trim(),task={id:'t'+(++state.seq),title,kind:/大会|会议|开会|集合|讲座|培训|考试|测试|答辩/.test(clean)?'event':'task',location:null,due:date.due,windowStart:null,precision:date.precision,status:'cancelled',sources:[msg.id],history:[{at:state.now,text:'从群消息中记录取消事项'},{at:state.now,text:'群消息确认：已取消'}],created:state.now,updated:state.now,reminded:false,revision:0,owner:'待确认'};
    state.tasks.push(task);state.lastTaskId=task.id;msg.taskId=task.id;msg.outcome={kind:'updated',text:`已记录「${title}」取消，原消息保留。`,taskId:task.id};return msg.outcome;
   }
   msg.outcome={kind:'review',text:'需要明确是哪项任务：请带上任务名称，例如“实验报告延期到12月2日”。'};return msg.outcome;
  }
  if(!/取消|不用交|不需要交|已完成|已经完成|我完成了|做完了/.test(clean)&&!date.due){msg.outcome={kind:'review',text:'找到了任务，但新日期还不明确。请补充具体日期。'};return msg.outcome;}
  if(date.due&&target.windowStart&&date.due<target.windowStart){msg.outcome={kind:'review',text:'新截止日期早于任务开始日期，请确认周期。'};return msg.outcome;}
  target.sources.push(msg.id);target.updated=state.now;target.reminded=false;target.revision=(target.revision||0)+1;
  if(/取消|不用交|不需要交/.test(clean))target.status='cancelled';
  else if(/已完成|已经完成|我完成了|做完了/.test(clean))target.status='done';
  else{const place=locationFrom(clean);if(place)target.location={value:place,sourceId:msg.id,basis:'原文提取'};const before=target.due;target.due=date.due;target.windowStart=date.windowStart||target.windowStart||null;target.stages=null;target.lastLongReminder=null;target.precision=date.precision;target.status='todo';target.history.push({at:state.now,text:`日期更新：${before?fmt(before):'未确定'} → ${fmt(date.due)}`});}
  const label=target.status==='cancelled'?'已取消':target.status==='done'?'已完成':'已更新截止日期';
  if(target.status==='done'||target.status==='cancelled')target.history.push({at:state.now,text:'群消息确认：'+label});
  state.lastTaskId=target.id;msg.taskId=target.id;msg.outcome={kind:'updated',text:`${label}「${target.title}」，旧提醒已失效。`,taskId:target.id};return msg.outcome;
 }
 if(!date.due&&/流程|操作说明|攻略|指南/.test(clean)){msg.outcome={kind:'chat',text:'这是流程或说明信息，暂不建立任务。'};return msg.outcome;}
 if(!/提交|上交|作业|报告|报名|集合|会议|开会|大会|召开|讲座|培训|考试|测试|答辩|签到|开始|入场|请大家.*参加|负责|修复|报修|完成|提醒我|需要|计划|截止/.test(clean)){msg.outcome={kind:'chat',text:'这是一条普通聊天，暂不建立任务。'};return msg.outcome;}
 const title=titleFrom(clean);const duplicate=active.find(t=>t.title===title);
 if(duplicate){duplicate.sources.push(msg.id);msg.taskId=duplicate.id;msg.outcome={kind:'linked',text:`补充到已有任务「${title}」，没有重复创建。`,taskId:duplicate.id};return msg.outcome;}
 const place=locationFrom(clean),kind=/大会|会议|开会|集合|讲座|培训|考试|测试|答辩|安全教育/.test(clean)?'event':'task';
 const task={id:'t'+(++state.seq),title,kind,location:place?{value:place,sourceId:msg.id,basis:'原文提取'}:null,due:date.due,windowStart:date.windowStart||null,precision:date.precision,status:date.due?'todo':'review',sources:[msg.id],history:[{at:state.now,text:'从群消息中建立事项'}],created:state.now,updated:state.now,reminded:false,revision:0,owner:/我负责|我来/.test(clean)?'我':'待确认'};
 state.tasks.push(task);state.lastTaskId=task.id;msg.taskId=task.id;
 msg.outcome={kind:task.status==='review'?'review':'created',text:date.due?`已整理「${title}」，可查看原文与截止信息。`:`发现「${title}」，截止日期未明确，已放入待确认。`,taskId:task.id};return msg.outcome;
}
// 功能二：新消息先产生待办建议（suggestion），不直接落任务。预置 seeds 仍走 ingest 直建任务。
export function extractSuggestion(s,text,author){
 const clean=text.trim();
 if(!clean)return{kind:'error',text:'先写一句消息再发送。'};
 if(clean.length>1200)return{kind:'error',text:'演示消息最多1200字，请拆分发送。'};
 const clone=structuredClone(s);
 const outcome=ingest(clone,text,author);
 if(outcome.kind==='error')return outcome;
 const newMsg=clone.messages.at(-1);
 if(['ignored','chat'].includes(outcome.kind)|| (outcome.kind==='review'&&!outcome.taskId)){s.messages.push(newMsg);s.seq=clone.seq;s.lastSendMessageId=newMsg.id;return outcome;}
 const t=clone.tasks.find(x=>x.id===outcome.taskId)||clone.tasks.at(-1);
 const operation=outcome.kind==='created'?'create':t.status==='cancelled'?'cancel':t.status==='done'?'complete':'update';
 const sug={id:'s'+(++clone.seq),groupId:s.scenario,messageId:newMsg.id,author,time:s.now,operation,targetId:operation==='create'?null:t.id,title:t.title,kind:t.kind,due:t.due,windowStart:t.windowStart,precision:t.precision,location:t.location,requirements:t.requirements||[],needsConfirmation:t.needsConfirmation||[],evidence:[{messageId:newMsg.id,quote:clean}],status:'pending',origin:'rules',history:[{at:s.now,text:'规则提取生成待办建议'}],taskId:null};
 clone.suggestions=clone.suggestions||[];clone.suggestions.push(sug);
 newMsg.suggested=true;newMsg.outcome={kind:'suggested',text:`已生成待办建议「${t.title}」，请在右下角通知中心确认。`,suggestionId:sug.id};
 s.messages.push(newMsg);s.suggestions=clone.suggestions;s.seq=clone.seq;s.lastSendMessageId=newMsg.id;
 return newMsg.outcome;
}
export function applySuggestion(s,id,action){
 const sug=(s.suggestions||[]).find(x=>x.id===id);if(!sug)return null;const now=s.now;
 if(action==='dismiss'){if(sug.status==='added')return null;sug.status='dismissed';sug.history.push({at:now,text:'用户删除建议（保留在已处理，可恢复）'});return sug;}
 if(action==='restore'){if(sug.status!=='dismissed')return null;sug.status='pending';sug.history.push({at:now,text:'用户恢复建议'});return sug;}
 if(action==='add'){
  if(sug.status==='added')return null;let t;
  if(sug.operation==='create'){
   t={id:'t'+(++s.seq),title:sug.title,kind:sug.kind,location:sug.location,due:sug.due,windowStart:sug.windowStart,precision:sug.precision,status:sug.due&&!sug.needsConfirmation.length?'todo':'review',sources:[sug.messageId],history:[{at:now,text:'用户确认添加（来自待办建议）'}],created:now,updated:now,reminded:false,revision:0,owner:'待确认',needsConfirmation:sug.needsConfirmation,requirements:sug.requirements,evidence:sug.evidence,extraction:{type:sug.origin==='ai'?'ai':'rules',provider:sug.origin==='ai'?'deepseek':'规则演示'}};
   s.tasks.push(t);
  }else{
   t=s.tasks.find(x=>x.id===sug.targetId);if(!t)return null;
   t.sources=[...new Set([...t.sources,sug.messageId])];t.evidence=[...(t.evidence||[]),...sug.evidence];t.updated=now;t.reminded=false;t.revision=(t.revision||0)+1;
   if(sug.operation==='cancel')t.status='cancelled';
   else if(sug.operation==='complete')t.status='done';
   else{const before=t.due;t.due=sug.due;t.windowStart=sug.windowStart||t.windowStart;t.precision=sug.precision;if(sug.location)t.location=sug.location;t.status=sug.due?'todo':'review';t.history.push({at:now,text:`日期更新：${before?fmt(before):'未确定'} → ${sug.due?fmt(sug.due):'未确定'}`});}
   t.history.push({at:now,text:'用户确认添加（建议变更）'});
  }
  sug.status='added';sug.taskId=t.id;sug.history.push({at:now,text:'用户确认添加'});s.lastTaskId=t.id;return sug;
 }
 return null;
}
// scenarios 与成员目录统一来自 whale-demo-data.js；规则引擎只消费既有 seeds 结构。
export const at=mdhm=>{const m=String(mdhm).match(/^(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/);if(!m)throw new Error('seed 时间格式应为 MM-DD HH:mm');return Date.UTC(2026,+m[1]-1,+m[2],+m[3]-8,+m[4]);};
export function fresh(id){const seeds=scenarios.find(x=>x.id===id).seeds;const s={version:1,scenario:id,publisherVersion:2,noticeParserVersion:1,now:BASE,seq:0,messages:[],tasks:[],reminders:[],suggestions:[],memory:[],lastTaskId:null};let cursor=BASE-seeds.length*30*60000;for(const [a,t,ts] of seeds){s.now=ts?at(ts):cursor;ingest(s,t,a);extractInto(s,s.messages.at(-1),'rules');cursor=s.now+30*60000;}s.now=BASE;return s;}
// 时钟推进不再直接发定点提醒；reminderAt/longReminderAt 降级为主动判断的输入信号（见 initiative.js）。
export function advance(state,hours){state.now+=hours*3600000;return [];}
export function reminderAt(task){return task.precision==='date'?task.due-(23*60+59-18*60)*60000:task.due-3600000;}
export function remind(state){const hits=[];for(const task of state.tasks){if(task.status!=='todo'||!task.due||task.reminded)continue;if(state.now>=reminderAt(task)){const r={id:'r'+(++state.seq),taskId:task.id,title:task.title,time:state.now,revision:task.revision||0,late:state.now>task.due};state.reminders.push(r);hits.push(r);task.reminded=true;}}
 for(const task of state.tasks){const at=longReminderAt(task,state.now);if(at===null||at>task.due||state.now<at)continue;const r={id:'r'+(++state.seq),taskId:task.id,title:task.title+' · '+(task.longReminderMode==='stages'?'阶段节点，请核对进度':'一周未更新，请核对进度'),time:state.now,revision:task.revision||0,longRevision:task.longRevision||0,kind:'long'};task.lastLongReminder=state.now;state.reminders.push(r);hits.push(r);}
 return hits;}
export function changeStatus(state,id,status){const t=state.tasks.find(t=>t.id===id);if(!t)return;t.status=status;t.updated=state.now;t.revision=(t.revision||0)+1;t.history.push({at:state.now,text:status==='done'?'用户标记完成':status==='cancelled'?'用户取消事项':'用户重新打开事项'});t.reminded=false;}
