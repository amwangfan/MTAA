// Eight steps, four seconds each (paused time excluded). Always rules-only.
import * as E from "../lib/engine.js";
import { DemoPlayback, DEMO_STEP_MS } from "../lib/demo-playback.js";
import { store, notify, persist, resetData, sendMessage, moveClock, act, setTrack, setAutoplay, requestStudyEnvironment, type View } from "./store";

type Nav = { goto: (v: View) => void; openSplit: (t: any) => void; closeSplit: () => void };
let playback: DemoPlayback | null = null;
export function stopDemo() { playback?.stop(); store.demo.running=false; store.typing=null; notify(); }
export function pauseDemo() { if(!playback)return; playback.paused=!playback.paused; store.demo.paused=playback.paused; notify(); }

export async function runDemo(nav: Nav) {
  // A stopped run owns cleanup until its outstanding wait has exited.
  if(playback || store.busy)return;
  const run=new DemoPlayback(); playback=run;
  const prevMode=store.extractMode;
  const step=(n:number,caption:string,sub:string,target:string,focusLabel:string)=>{
    store.demo={running:true,paused:run.paused,step:n,total:8,caption,sub,target,focusLabel}; notify();
  };
  const wait=(ms=DEMO_STEP_MS)=>run.wait(ms);
  try {
    setAutoplay(false); resetData(); setTrack("study"); store.extractMode="rules";
    store.initiative.enabled=true; store.reminderOpen=false; nav.closeSplit();

    store.active="course";
    await sendMessage("数电第三次实验报告明天18:00前提交到学习通，命名：学号-姓名-实验3","助教",{forceRules:true});
    const s=store.states.course;
    nav.goto("messages");
    step(1,"群里收到一条作业通知","先看原文：明天 18:00 前，提交实验报告到学习通。",`[data-message-id="${s.messages.at(-1)?.id}"]`,"新收到的通知 · 原文");
    await wait();

    nav.goto("center");
    const sug=s.suggestions.filter((g:any)=>g.status==="pending").at(-1);
    if(!sug)throw new Error('missing suggestion');
    step(2,"通知已整理成待办建议","这里有任务、来源群和截止时间；现在还没有加入待办。",`[data-demo-suggestion="course:${sug.id}"]`,"新生成的待办建议");
    await wait();

    step(3,"确认建议，建立自己的待办","重要通知先成为建议，由你决定是否加入日程。",`[data-demo-add="course:${sug.id}"]`,"即将模拟点击：添加待办");
    await wait(DEMO_STEP_MS/2);
    const result:any=act.addSug("course",sug.id),taskId=result?.taskId;
    if(!taskId)throw new Error('missing task');
    step(3,"已确认，待办加入清单","通知 → 建议 → 确认，现在可以在清单中找到这件事。",`[data-demo-task="course:${taskId}"]`,"确认后的待办");
    await wait(DEMO_STEP_MS/2);

    nav.openSplit({type:"task",id:taskId,scene:"course"});
    step(4,"每条待办都能找到原文","左边原消息，右边整理结果；编号与连线说明信息从哪来。",'[data-demo="evidence"]',"原文与整理结果");
    await wait(); nav.closeSplit();

    nav.goto("initiative");
    const t=s.tasks.find((x:any)=>x.id===taskId);
    if(t)await moveClock(E.reminderAt(t));
    store.reminderOpen=false; persist();
    step(5,"时钟快进到截止前 1 小时","演示快进时间，检查是否需要提醒，不用真的等到明天。",'[data-tour="clock"]',"已快进的演示时钟");
    await wait();

    store.reminderOpen=true;
    step(6,"截止提醒到了","模拟通知会说明提醒内容；可以确认收到，或关闭这类提醒。",'.push-wrap',"刚到达的截止提醒");
    await wait(); store.reminderOpen=false;

    setTrack("life"); store.active="home";
    requestStudyEnvironment("我要开始学习了","exam");
    nav.goto("memory");
    step(7,"记忆对话，准备你的学习环境","结合平常的学习偏好和当前设备状态，建议开灯、开空调并调至 24℃。",'[data-demo="study-environment"]',"学习偏好与设备状态");
    await wait();

    nav.goto("devices");
    step(8,"按学习习惯调整设备","批准本次调整后，设备状态与行动账本同步更新；这里展示模拟执行。",'[data-tour="approval"]',"单次批准区域");
    await wait(DEMO_STEP_MS/2);
    for(const id of store.studyPlan?.actionIds||[])await act.devApprove(id);
    step(8,"学习环境已按偏好调整（模拟）","灯已打开，空调已开启并设为 24℃；每项调整都能查看记忆来源和执行记录。",'[data-tour="device-ledger"]',"行动账本 · 模拟回执");
    await wait(DEMO_STEP_MS/2);
    store.notice="演示完成。去「消息来源」发一条自己的通知，或重新演示并随时暂停。";
    nav.goto("center");
  } catch {
    if(!run.stopped)store.notice="演示中断，已恢复普通操作。可以重新开始演示。";
  } finally {
    store.extractMode=prevMode; store.typing=null; store.demo.running=false; store.demo.paused=false;
    playback=null; persist(); notify();
  }
}
