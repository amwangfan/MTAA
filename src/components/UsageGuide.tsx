import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { View } from '../store';
export const GUIDE_KEY='whale.visual-demo.guide.v2';
const steps:{view:View;target:string;title:string;body:string}[]=[
 {view:'center',target:'[data-tour="suggestions"]',title:'重要消息，变成待办',body:'群通知会先生成建议。确认添加后，才会进入待办清单。'},
 {view:'messages',target:'[data-tour="sources"]',title:'选择消息来源',body:'选择关注的群，用模拟管理员“我”试发通知。未配置AI时，可切换规则演示。'},
 {view:'center',target:'.summary-tools',title:'查找与核对',body:'搜索任务或按群筛选。点击事项，查看原文、时间和变更记录。'},
 {view:'memory',target:'[data-tour="memory-dialogue"]',title:'记忆如何改变回答',body:'切换三套模拟记忆，对同一个问题比较回答。点击M编号，核对每句话引用了哪条记忆。'},
 {view:'memory',target:'[data-tour="memory-dialogue"]',title:'准备学习环境',body:'说“我要开始学习了”，按记忆偏好和设备状态生成调整建议。逐项批准后，在“设备”核对模拟结果。'}
];
export default function UsageGuide({onViewChange,onClose}:{onViewChange:(view:View)=>void;onClose:()=>void}){
 const [index,setIndex]=useState(0),[box,setBox]=useState<DOMRect|null>(null);
 const panel=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null),step=steps[index];
 useEffect(()=>{onViewChange(step.view);},[index]);
 useLayoutEffect(()=>{let observer:ResizeObserver|undefined,frame=0;const measure=()=>{const el=document.querySelector(step.target);if(el)setBox(el.getBoundingClientRect());else setBox(null);};
 const first=()=>{const el=document.querySelector(step.target);if(el){el.scrollIntoView({block:'start',behavior:'instant'});window.scrollBy({top:-140,behavior:'instant'});}measure();if(el){observer=new ResizeObserver(measure);observer.observe(el);}button.current?.focus({preventScroll:true});};
 frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(first);});window.addEventListener('resize',measure);window.addEventListener('scroll',measure,true);
 return()=>{cancelAnimationFrame(frame);observer?.disconnect();window.removeEventListener('resize',measure);window.removeEventListener('scroll',measure,true);};},[index]);
 useEffect(()=>{const prev=document.activeElement as HTMLElement|null;const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onClose();}if(e.key==='Tab'){const controls=panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');if(!controls?.length)return;const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);if(prev?.isConnected)prev.focus({preventScroll:true});};},[onClose]);
 useEffect(()=>{const root=document.getElementById("root");if(!root)return;const was=root.inert;root.inert=true;return()=>{root.inert=was;};},[]);
 const vw=window.innerWidth,vh=window.innerHeight,contentLeft=document.querySelector("#main-content")?.getBoundingClientRect().left||0,width=Math.min(370,vw-contentLeft-24);
 const left=contentLeft+(vw-contentLeft-width)/2;
 const highlight=box&&box.width>0&&box.height>0?{left:Math.max(4,box.left-5),top:Math.max(4,box.top-5),width:Math.min(vw-8,box.width+10),height:Math.min(vh-8,box.height+10)}:null;
 return createPortal(<div className="usage-guide-layer"><div className="guide-blocker"/>{highlight?<div className="guide-spotlight" style={highlight}/>:<div className="guide-dim"/>}<div ref={panel} role="dialog" aria-modal="true" aria-labelledby="guide-title" aria-describedby="guide-body" className="guide-panel" style={{left,bottom:20,width}}><div className="guide-heading"><span>{index+1} / {steps.length}</span><button onClick={onClose} aria-label="跳过使用引导">跳过</button></div><div className="guide-progress" aria-hidden="true"><span style={{width:((index+1)/steps.length*100)+'%'}}/></div><h2 id="guide-title">{step.title}</h2><p id="guide-body">{step.body}</p><div className="guide-actions"><button disabled={index===0} onClick={()=>setIndex(i=>i-1)}>上一步</button><button ref={button} className="guide-next" onClick={()=>index===steps.length-1?onClose():setIndex(i=>i+1)}>{index===steps.length-1?'开始使用':'下一步'}</button></div></div></div>,document.body);
}
