export class ExtractionError extends Error{constructor(code,message){super(message);this.code=code;}}
const fail=message=>{throw new ExtractionError('INVALID_EXTRACTION',message);};
const str=(v,max=200)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v))&&Number(v.slice(11,13))<24&&new Date(Date.UTC(Number(v.slice(0,4)),Number(v.slice(5,7))-1,Number(v.slice(8,10)))).toISOString().slice(0,10)===v.slice(0,10);
export function validateRequest(r){
 if(r?.version!==1||!str(r.groupId,100)||!Number.isFinite(r.now))fail('请求版本、群标识或参考时间无效');
 const checkMessage=m=>m&&str(m.id,100)&&str(m.author,100)&&str(m.text,8000)&&Number.isFinite(m.time);
 if(!checkMessage(r.message)||!Array.isArray(r.context)||r.context.length>12||!r.context.every(checkMessage))fail('消息或历史上下文无效');
 const ids=[r.message,...r.context].map(m=>m.id);if(new Set(ids).size!==ids.length)fail('消息标识重复');
 if(!Array.isArray(r.tasks)||r.tasks.length>80||r.tasks.some(t=>!t||!str(t.id,100)||!str(t.title,100)))fail('已存在事项列表无效');
 if(new Set(r.tasks.map(t=>t.id)).size!==r.tasks.length)fail('事项标识重复');
 if(r.suggestions!==undefined&&(!Array.isArray(r.suggestions)||r.suggestions.length>80||r.suggestions.some(s=>!s||!str(s.id,100)||!str(s.title,100)||!str(s.messageId,100)||s.status!=='pending')))fail('待确认建议列表无效');
 if(new Set((r.suggestions||[]).map(s=>s.id)).size!==(r.suggestions||[]).length)fail('建议标识重复');
 return r;
}
export function validateExtraction(output,request){
 validateRequest(request);
 if(!output||!Array.isArray(output.items)||output.items.length>12)fail('模型结果必须包含items数组，最多12项');
 const sources=new Map([request.message,...request.context].map(m=>[m.id,m.text])),targets=new Set([...request.tasks.map(t=>t.id),...(request.suggestions||[]).map(s=>s.id)]);
 for(const t of output.items){
  if(!t||!['create','update','cancel','complete'].includes(t.operation)||!str(t.title,100)||!['task','event'].includes(t.kind))fail('事项类型、标题或动作无效');
  if(t.operation==='create'&&t.targetId!==null)fail('新建事项不能指定目标ID');
  if(t.operation!=='create'&&!targets.has(t.targetId))fail('修改或取消必须引用已有事项或待确认建议ID');
  if(!Array.isArray(t.evidence)||!t.evidence.length||t.evidence.length>12||!t.evidence.some(e=>e.messageId===request.message.id))fail('每项结果必须引用本条消息的原文依据');
  if(t.evidence.some(e=>!e||!str(e.quote,8000)||!sources.get(e.messageId)?.includes(e.quote)))fail('原文依据不存在，拒绝保存');
  const w=t.when;if(!w||!['date','minute','missing'].includes(w.precision)||!['start','deadline'].includes(w.meaning))fail('时间精度或含义无效');
  if(w.value!==null&&!date(w.value))fail('时间必须为带时区的ISO格式');
  if(w.precision==='date'&&!/T23:59:00(?:\.000)?\+08:00$/.test(w.value))fail('仅日期的时间需按北京时间23:59保存，并保留date精度');
  if((w.precision==='missing')!==(w.value===null))fail('时间值与精度不一致');
  if(w.start!==null&&(!date(w.start)||!w.value||Date.parse(w.start)>Date.parse(w.value)))fail('任务周期无效');
  const l=t.location;if(!l||!['onsite','online','none','unknown'].includes(l.mode)||!(l.value===null||str(l.value,300)))fail('地点类型或内容无效');
  if(l.value&&!t.evidence.some(e=>e.quote.includes(l.value)))fail('地点必须有原文依据');
  if(!Array.isArray(t.requirements)||t.requirements.length>12||t.requirements.some(x=>!str(x,500)))fail('要求列表无效');
  if(!Array.isArray(t.needsConfirmation)||t.needsConfirmation.length>8||t.needsConfirmation.some(x=>!str(x,300)))fail('待确认说明无效');
 }
 return output;
}
