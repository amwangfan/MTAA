import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pause, Play, Square } from "lucide-react";
import { DEMO_STEP_MS } from "../../lib/demo-playback.js";
import { store } from "../store";
import { pauseDemo, stopDemo } from "../demo";

export default function DemoOverlay() {
  const demo=store.demo;
  const [box,setBox]=useState<{left:number;top:number;width:number;height:number}|null>(null);
  const panel=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    let observer:ResizeObserver|undefined,frame=0;
    const measure=()=>{
      const el=document.querySelector(demo.target);
      if(!el){setBox(null);return;}
      const r=el.getBoundingClientRect();
      let left=Math.max(8,r.left-6),top=Math.max(8,r.top-6),right=Math.min(innerWidth-8,r.right+6),bottom=Math.min((panel.current?.getBoundingClientRect().top??innerHeight)-16,r.bottom+6);
      // Respect clipping of nested chat/evidence scrollers.
      for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){
        const css=getComputedStyle(p),b=p.getBoundingClientRect();
        if(/auto|scroll|hidden|clip/.test(css.overflowY)){top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);}
        if(/auto|scroll|hidden|clip/.test(css.overflowX)){left=Math.max(left,b.left);right=Math.min(right,b.right);}
      }
      setBox(right>left&&bottom>top?{left,top,width:right-left,height:bottom-top}:null);
    };
    const locate=()=>{
      const el=document.querySelector(demo.target);
      if(el){
        // Fixed notifications already have a screen position; do not scroll them.
        if(!el.closest('.notification-center')){
          const available=(panel.current?.getBoundingClientRect().top??innerHeight-170)-48;
          el.scrollIntoView({block:el.getBoundingClientRect().height>available?'start':'center',behavior:'instant'});
          const r=el.getBoundingClientRect(),limit=(panel.current?.getBoundingClientRect().top??innerHeight-170)-24;
          if(r.height>available)window.scrollBy({top:-24,behavior:'instant'});
          else if(r.bottom>limit)window.scrollBy({top:r.bottom-limit,behavior:'instant'});
        }
        observer=new ResizeObserver(measure); observer.observe(el);
      }
      measure();
    };
    frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(locate);});
    window.addEventListener('resize',measure); window.addEventListener('scroll',measure,true);
    return()=>{cancelAnimationFrame(frame);observer?.disconnect();window.removeEventListener('resize',measure);window.removeEventListener('scroll',measure,true);};
  },[demo.target]);
  useEffect(()=>{
    const content=document.querySelector<HTMLElement>('.application-content');
    const previous=content?.inert;
    if(content)content.inert=true;
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape')stopDemo();};
    document.addEventListener('keydown',key);
    const prev=document.activeElement as HTMLElement|null;
    panel.current?.querySelector<HTMLButtonElement>('[data-demo-pause]')?.focus({preventScroll:true});
    return()=>{if(content)content.inert=previous||false;document.removeEventListener('keydown',key);if(prev?.isConnected)prev.focus({preventScroll:true});};
  },[]);
  return <div className="demo-overlay">
    <div className="demo-blocker" aria-hidden="true" />
    <div
      key={demo.step}
      className="demo-shading"
      style={{ animationDuration: `${DEMO_STEP_MS}ms`, animationPlayState: demo.paused ? 'paused' : 'running' }}
      aria-hidden="true"
    >
      {box ? <div className="demo-spotlight" style={box} /> : <div className="demo-dim" />}
    </div>
    <div ref={panel} className="demo-bar" role="region" aria-label="自动演示控制">
      <div className="demo-progress" aria-hidden="true"><span style={{width:`${demo.step/demo.total*100}%`}}/></div>
      <div className="flex items-start gap-3">
        <span className="demo-step">{demo.step}/{demo.total}</span>
        <div className="min-w-0 flex-1" aria-live="polite" aria-atomic="true"><div className="demo-caption">{demo.caption}</div><div className="demo-sub">{demo.sub}</div></div>
        <div className="demo-controls">
          <button className="demo-stop" onClick={stopDemo}><Square className="h-3 w-3"/>停止</button>
          <button data-demo-pause className="demo-stop demo-pause" onClick={pauseDemo} aria-pressed={demo.paused}>{demo.paused?<Play className="h-3 w-3"/>:<Pause className="h-3 w-3"/>}{demo.paused?'继续':'暂停'}</button>
        </div>
      </div>
    </div>
  </div>;
}
