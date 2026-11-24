import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { store, allRows } from "../store";
import { deadlineBucket, isLongTask, longState, day } from "../../lib/engine.js";
import { dueText, statusText, scName } from "../fmt";
import { GlassCard, Badge, SectionHeading } from "./ui";

export default function SummaryView({ openSplit }: { openSplit: (t: any) => void }) {
  const now = state_now();
  const [query,setQuery] = useState("");
  const [group,setGroup] = useState("all");
  const [showEmpty,setShowEmpty] = useState(false);
  const all = allRows();
  const rows = all.filter(({scene,task}:any) => (group === "all" || scene.id === group) && (!query.trim() || (task.title+" "+scName(scene.id)+" "+(task.location?.value||"")).toLowerCase().includes(query.trim().toLowerCase())));
  const groups: [string, string][] = [["overdue", "已过时间"], ["today", "今天"], ["tomorrow", "明天"], ["week", "未来七天"], ["later", "更晚截止"], ["review", "待确认日期"], ["archive", "已完成 / 已取消"]];
  const long = rows.filter(({ task }: any) => isLongTask(task) && !["done", "cancelled"].includes(task.status));
  return (
    <div>
      {long.length > 0 && (
        <GlassCard hover={false} className="mb-6 p-5">
          <h2 className="font-display mb-3 flex items-center gap-2 text-lg font-bold text-slate-900"><CalendarRange className="h-5 w-5 text-violet-600" />长期进行中</h2>
          {long.map(({ scene, task }: any) => (
            <button key={`${scene.id}:${task.id}`} onClick={() => openSplit({ type: "task", id: task.id, scene: scene.id })} className="mb-2 flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/80 p-3 text-left hover:border-whale-300">
              <span className="font-medium text-slate-800">{task.title} <Badge tone="violet">{scName(scene.id)}</Badge></span>
              <span className="text-xs text-slate-500">{day(task.windowStart).slice(5)} 至 {day(task.due).slice(5)} · {task.progress === undefined ? longState(task, now) : `进度 ${task.progress}%`}</span>
            </button>
          ))}
        </GlassCard>
      )}

      <SectionHeading eyebrow="Deadline" title="跨群事务总览" sub="按演示时钟分类；不明确的日期不会推测成截止日。" />
      <div className="summary-tools mb-4 flex flex-wrap gap-3"><input aria-label="搜索事项" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索任务、地点或群名" className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2"/><select aria-label="按来源群筛选" value={group} onChange={e=>setGroup(e.target.value)} className="rounded-xl border border-line bg-white px-3 py-2"><option value="all">全部来源</option>{[...new Set(all.map((x:any)=>x.scene.id))].map(id=><option key={id} value={id}>{scName(id)}</option>)}</select><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showEmpty} onChange={e=>setShowEmpty(e.target.checked)}/>显示空分类</label></div>
      <p role="status" className="mb-4 text-sm text-muted">显示 {rows.length} / {all.length} 项{!rows.length ? " · 暂无匹配，可清空搜索或切换来源" : ""}</p>
      {groups.map(([key, label]) => {
        const items = rows.filter((x: any) => deadlineBucket(x.task, now) === key).sort((a: any, b: any) => (a.task.due ?? Infinity) - (b.task.due ?? Infinity));
        if (!items.length && !showEmpty) return null;
        const body = (
          <div>
            {items.map(({ scene, task }: any) => (
              <button data-demo-task={`${scene.id}:${task.id}`} key={`${scene.id}:${task.id}`} onClick={() => openSplit({ type: "task", id: task.id, scene: scene.id })}
                className={`mb-2 grid w-full grid-cols-[1fr_auto] items-center gap-2 rounded-2xl border bg-white/80 p-3 text-left hover:border-whale-300 md:grid-cols-[1fr_auto_auto] ${key === "overdue" ? "border-rose-200" : "border-slate-200"}`}>
                <span className="flex min-w-0 flex-wrap items-center gap-2"><span className="min-w-0 truncate font-medium text-slate-800">{task.title}</span><Badge tone="slate">{scName(scene.id)}</Badge></span>
                <span className="text-xs text-slate-500">{dueText(task)}</span>
                <span className="text-sm text-slate-500">{statusText(task, now)}</span>
              </button>
            ))}
            {!items.length && <p className="text-sm text-slate-400">暂无</p>}
          </div>
        );
        return key === "archive" ? (
          <details key={key} className="mb-4"><summary className="cursor-pointer text-sm font-medium text-slate-600">归档 · {items.length} 项</summary>{body}</details>
        ) : (
          <GlassCard key={key} hover={false} className="mb-4 p-4">
            <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-700">{label}</h3><span className="text-xs text-slate-400">{items.length} 项</span></div>
            {body}
          </GlassCard>
        );
      })}
    </div>
  );
}
function state_now() { return store.states[store.active].now; }
