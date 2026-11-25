import { useState } from "react";
import { CalendarClock, MapPin, ListChecks, History, Brain, Link2 } from "lucide-react";
import { act, notify, persist, store } from "../store";
import * as E from "../../lib/engine.js";
import { fmt, dueText, statusText, timeBasis, scName, BADGE } from "../fmt";
import { Badge, Button } from "./ui";

export default function SplitRight({ s, obj, t, isSug, sug, evidenceIds, relMem, now }: any) {
  const [editOpen, setEditOpen] = useState(false);
  const [d, setD] = useState(""); const [tm, setTm] = useState(""); const [prog, setProg] = useState("");
  const terminal = t && ["done", "cancelled"].includes(t.status);
  const saveDate = () => { const r = E.dateFrom(d + (tm ? " " + tm : ""), now); if (!r.due || r.error) {store.notice=r.error||"请选择有效日期。";notify();return;} if(t.windowStart && r.due<t.windowStart){store.notice="截止时间不能早于任务开始时间。";notify();return;} t.history.push({ at: now, text: "用户修改日期：" + fmt(r.due) }); t.due = r.due; t.precision = r.precision; t.updated = now; t.reminded = false; t.revision = (t.revision || 0) + 1; t.status = t.needsConfirmation?.length ? "review" : "todo"; setEditOpen(false); persist(); notify(); };
  const saveProg = () => { if(!prog.trim() || !Number.isInteger(Number(prog)) || Number(prog)<0 || Number(prog)>100){store.notice="请输入0到100之间的整数进度。";notify();return;} if (E.updateProgress(t, now, Number(prog))) { t.longRevision = (t.longRevision || 0) + 1; persist(); notify(); } };
  const stages = t && (t.stages || E.suggestedStages(t));
  return (
    <div id="split-right" className="min-w-0 space-y-3">
      <div>
        <h3 className="font-display text-lg font-bold text-slate-900">{obj.title}</h3>
        <p className="text-xs text-slate-500">{isSug ? (sug.origin === "ai" ? "AI提取建议" : "规则建议") : (t.extraction?.type === "ai" ? "AI提取" : "预置/规则（非AI）")} · {s.scenario && scName(s.scenario)}</p>
      </div>
      <div>
        <div className="flex items-center gap-1 text-xs font-semibold text-slate-500"><CalendarClock className="h-3.5 w-3.5" />时间 {evidenceIds[0] && <span className="text-whale-600">{BADGE[0]}</span>}</div>
        <div className="text-sm text-slate-800">{dueText(obj)} <Badge tone="slate">{obj.precision === "date" ? "仅日期" : obj.precision === "minute" ? "明确时刻" : "待确认"}</Badge> <Badge tone="teal">{timeBasis(obj)}</Badge></div>
      </div>
      {obj.location && <div><div className="flex items-center gap-1 text-xs font-semibold text-slate-500"><MapPin className="h-3.5 w-3.5" />地点</div><div className="text-sm text-slate-800">{obj.location.value}</div></div>}
      {(obj.requirements || []).length > 0 && <div><div className="flex items-center gap-1 text-xs font-semibold text-slate-500"><ListChecks className="h-3.5 w-3.5" />要求</div><ul className="list-disc pl-4 text-sm text-slate-700">{obj.requirements.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>}
      <div><div className="text-xs font-semibold text-slate-500">状态</div><div className="text-sm text-slate-800">{isSug ? (sug.status === "pending" ? "待确认建议" : sug.status) : statusText(t, now)}</div></div>
      {relMem.length > 0 && <div><div className="flex items-center gap-1 text-xs font-semibold text-slate-500"><Brain className="h-3.5 w-3.5" />相关记忆</div>{relMem.map((h: any, i: number) => <div key={i} className="mt-1 flex justify-between rounded-xl bg-violet-50 px-2 py-1 text-xs text-violet-800"><span>{h.record.summary}</span><span>{h.score.toFixed(2)}</span></div>)}</div>}
      <div>
        <div className="flex items-center gap-1 text-xs font-semibold text-slate-500"><Link2 className="h-3.5 w-3.5" />证据（点击定位左栏）</div>
        {evidenceIds.map((id: string, i: number) => { const m = s.messages.find((x: any) => x.id === id); if(!m)return <p key={id}>原消息暂不可用，引用仍保留。</p>; return (
          <button key={id} data-ev-idx={i} className="ev-item mt-1 flex w-full items-start gap-2 rounded-xl border border-slate-200 bg-white/80 p-2 text-left text-xs hover:border-whale-300"
            onClick={() => document.querySelector(`#split-right`)?.parentElement?.querySelector(`[data-ev-idx="${i}"].evidence-msg`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>
            <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-whale-600 text-[10px] text-white">{BADGE[i]}</span>
            <span><span className="text-slate-400">{m.author} · {fmt(m.time)}</span><br />{m.text}</span>
          </button>
        ); })}
      </div>
      <div><div className="flex items-center gap-1 text-xs font-semibold text-slate-500"><History className="h-3.5 w-3.5" />变化记录</div><ol className="mt-1 space-y-1 text-xs text-slate-600">{(obj.history || []).map((h: any, i: number) => <li key={i}><span className="font-mono text-slate-400">{fmt(h.at)}</span> {h.text}</li>)}</ol></div>
      {!isSug && t && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {(t.needsConfirmation || []).length > 0 && <Button size="sm" variant="soft" onClick={() => { t.needsConfirmation = []; t.status = t.due ? "todo" : "review"; t.history.push({ at: now, text: "用户核对原文后确认字段" }); persist(); notify(); }}>确认事项</Button>}
          {!terminal ? <>
            <Button size="sm" onClick={() => act.status(t.id, "done")}>标记完成</Button>
            <Button size="sm" variant="soft" onClick={() => { setEditOpen(!editOpen); setD(t.due ? E.day(t.due) : ""); }}>补充/修改日期</Button>
            <Button size="sm" variant="ghost" onClick={() => act.status(t.id, "cancelled")}>取消事项</Button>
          </> : <Button size="sm" variant="soft" onClick={() => act.status(t.id, t.due ? "todo" : "review")}>重新打开</Button>}
        </div>
      )}
      {editOpen && t && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2">
          <input type="date" value={d} onChange={(e) => setD(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
          <input type="time" value={tm} onChange={(e) => setTm(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
          <Button size="sm" onClick={saveDate}>保存日期</Button>
        </div>
      )}
      {!isSug && t && E.isLongTask(t) && (
        <div className="space-y-2 rounded-2xl border border-violet-200 bg-violet-50/50 p-3">
          <div className="text-sm font-semibold text-violet-800">长期任务安排</div>
          <div className="text-xs text-slate-600">周期 {E.day(t.windowStart)} 至 {E.day(t.due)}，{E.longState(t, now)}，{t.progress === undefined ? "进度未填写" : `进度 ${t.progress}%`}</div>
          {!terminal && <div className="flex items-center gap-2"><input type="number" min={0} max={100} value={prog} onChange={(e) => setProg(e.target.value)} placeholder="0–100" className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-xs" /><Button size="sm" variant="soft" onClick={saveProg}>保存进度</Button><Button size="sm" variant="ghost" onClick={() => { t.started = true; t.lastProgressAt = now; persist(); notify(); }}>标记进行中</Button></div>}
          {(stages || []).map((x: any, i: number) => (
            <div key={i} className="flex items-center justify-between text-xs text-slate-700"><span>{x.title} <span className="text-slate-400">{E.day(x.due)}</span></span>{t.stages && !terminal && <Button size="sm" variant="ghost" onClick={() => { x.done = !x.done; t.longRevision = (t.longRevision || 0) + 1; persist(); notify(); }}>{x.done ? "撤销" : "完成"}</Button>}</div>
          ))}
          {!t.stages && !terminal && <Button size="sm" variant="soft" onClick={() => { E.confirmStages(t, now); persist(); notify(); }}>确认建议阶段</Button>}
        </div>
      )}
    </div>
  );
}
