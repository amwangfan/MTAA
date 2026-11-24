import MemoryChat from "./MemoryChat";
import GroupMemoryDemo from "./GroupMemoryDemo";
import { useState } from "react";
import { Brain, Sparkles, CalendarDays, Search, Quote, Trash2, Check } from "lucide-react";
import { tickStates, act, store, notify } from "../store";
import { recall, daySummary, dayOf } from "../../lib/memory.js";
import { day } from "../../lib/engine.js";
import { scName } from "../fmt";
import { GlassCard, Badge, Button, SectionHeading } from "./ui";

export default function MemoryView({ gotoMessage, now }: { gotoMessage: (scene: string, id: string) => void; now: number }) {
  const [query, setQuery] = useState("");
  const states = tickStates();
  const all = states.flatMap((s: any) => s.memory || []);
  const curated = all.filter((r: any) => r.state === "curated" && r.space === "owner");
  const candidates = all.filter((r: any) => r.state === "candidate");
  const hits = query ? states.flatMap((s: any) => recall(s, query, now, { limit: 6 })) : [];
  const days = [...new Set(states.flatMap((s: any) => s.messages.map((m: any) => dayOf(m.time))))].sort().reverse().slice(0, 4);
  const ev = (r: any) => r.evidence.map((e: any, i: number) => <Button key={i} size="sm" variant="ghost" onClick={() => gotoMessage(r.groupId, e.messageId)}><Quote className="h-3 w-3" />证据原文</Button>);
  return (
    <div><GroupMemoryDemo/><MemoryChat/><label className="mb-5 flex items-center gap-2 text-sm"><input type="checkbox" checked={store.memoryAIEnabled} onChange={e=>{store.memoryAIEnabled=e.target.checked;notify();}}/>发送群消息时额外提取AI记忆（增加模型调用，默认关闭）</label><div className="grid gap-6 lg:grid-cols-2">
      <GlassCard hover={false} className="p-5">
        <h2 data-tour="memory" className="font-display mb-3 flex items-center gap-2 text-lg font-bold"><Brain className="h-5 w-5 text-whale-600" />关于我</h2>
        {curated.length ? curated.map((r: any) => (
          <div key={r.id} className="mb-2 rounded-2xl border border-slate-200 bg-white/80 p-3">
            <div className="flex items-start justify-between gap-2">
              <div><div className="font-medium text-slate-800">{r.summary}</div><div className="text-xs text-slate-500">{r.kind === "fact" ? "事实" : "偏好"} · 重要度 {r.importance} · {r.pattern}</div></div>
              <Button size="sm" variant="ghost" onClick={() => act.forget(r.groupId, r.id)}><Trash2 className="h-3 w-3" />忘记</Button>
            </div>
            <div className="mt-2 flex gap-2">{ev(r)}</div>
          </div>
        )) : <p className="text-sm text-slate-500">还没有已晋升记忆。到「记忆候选」点击记住。</p>}
      </GlassCard>
      <GlassCard hover={false} className="p-5">
        <h2 className="font-display mb-3 flex items-center gap-2 text-lg font-bold"><Sparkles className="h-5 w-5 text-teal-600" />记忆候选</h2>
        <p className="mb-3 text-xs text-slate-500">原始消息不是事实；需你确认才晋升。</p>
        {candidates.length ? candidates.map((r: any) => (
          <div key={r.id} className="mb-2 rounded-2xl border border-slate-200 bg-white/80 p-3">
            <div className="font-medium text-slate-800">{r.summary}</div>
            <div className="text-xs text-slate-500">{scName(r.groupId)} · {r.kind} · 命中「{r.pattern}」 · {r.origin === "ai" ? "AI提取" : "模拟提取"}</div>
            <div className="mt-1 rounded-xl border-l-2 border-teal-300 bg-teal-50/60 px-2 py-1 text-xs text-slate-600">「{r.evidence[0]?.quote}」</div>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => act.promote(r.groupId, r.id)}><Check className="h-3 w-3" />记住</Button>
              <Button size="sm" variant="ghost" onClick={() => act.forget(r.groupId, r.id)}><Trash2 className="h-3 w-3" />忘记</Button>
            </div>
          </div>
        )) : <p className="text-sm text-slate-500">暂无候选。</p>}
      </GlassCard>
      <GlassCard hover={false} className="p-5">
        <h2 className="font-display mb-3 flex items-center gap-2 text-lg font-bold"><CalendarDays className="h-5 w-5 text-violet-600" />你的一天</h2>
        {days.map((d: string) => { const sum = daySummary(states, d, now); return (
          <div key={d} className="mb-2 rounded-2xl border border-slate-200 bg-white/80 p-3">
            <div className="text-xs text-slate-500">{d === day(now) ? "今天" : d}</div>
            <div className="font-medium text-slate-800">{sum.title}</div>
            <div className="text-xs text-slate-500">{sum.summary}</div>
          </div>
        ); })}
      </GlassCard>
      <GlassCard hover={false} className="p-5">
        <h2 className="font-display mb-3 flex items-center gap-2 text-lg font-bold"><Search className="h-5 w-5 text-whale-600" />召回搜索</h2>
        <p className="mb-2 text-xs text-slate-500">词项命中×重要度×半衰期30天衰减；仅召回已晋升且未过期。</p>
        <div className="mb-3 flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="如：辣 / 湖边 / DeepSeek" className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-whale-400 focus:outline-none" />
        </div>
        {query ? (hits.length ? hits.map((h: any, i: number) => (
          <div key={i} className="relative mb-2 rounded-2xl border border-slate-200 bg-white/80 p-3">
            <div className="font-medium text-slate-800">{h.record.summary}</div>
            <Badge tone="whale" className="absolute right-3 top-3">{h.score.toFixed(2)}</Badge>
            <ul className="mt-1 list-disc pl-4 text-xs text-slate-500">{h.reasons.map((x: string, j: number) => <li key={j}>{x}</li>)}</ul>
            <div className="mt-2 flex gap-2">{ev(h.record)}</div>
          </div>
        )) : <p className="text-sm text-slate-500">无命中。</p>) : <p className="text-sm text-slate-400">输入查询查看打分与证据。</p>}
      </GlassCard>
    </div></div>
  );
}
