import { BellRing, ScrollText, Check, Ban, CalendarSearch } from "lucide-react";
import { store, act, notify, persist } from "../store";
import { fmt } from "../fmt";
import { GlassCard, Badge, Button, SectionHeading, EmptyState } from "./ui";

const gateTone: any = { ready: "green", deferred: "amber", needs_approval: "rose", disabled: "slate" };
export default function InitiativeView({ gotoCenter }: { gotoCenter: () => void }) {
  const ini = store.initiative;
  const set = (patch: any) => { Object.assign(ini, patch); persist(); notify(); };
  return (
    <div data-tour="initiative">
      <GlassCard hover={false} className="mb-6 flex flex-wrap items-center gap-4 p-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ini.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="h-4 w-4 accent-whale-600" />启用主动判断</label>
        <label className="flex items-center gap-2 text-sm">节拍
          <select value={String(ini.interval)} onChange={(e) => set({ interval: Number(e.target.value) })} className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs">
            <option value="1">1分钟</option><option value="5">5分钟</option><option value="15">15分钟</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">活动
          <select value={ini.activity} onChange={(e) => set({ activity: e.target.value })} className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs">
            <option value="">自动推断</option><option>在宿舍写报告</option><option>在湖边调试眼镜</option><option>在实验室</option>
          </select>
        </label>
        <Badge tone="slate">静默 23:00–08:00 · 配额 {ini.used}/6</Badge>
        {ini.feedback.length > 0 && <Badge tone="rose">不再提醒：{ini.feedback.join("、")}</Badge>}
      </GlassCard>

      <SectionHeading eyebrow="Inbox" title="提醒收件箱" sub="门控通过后才进入；可交互，不发送真实系统通知。" />
      <GlassCard hover={false} className="mb-6 p-5">
        {ini.inbox.length ? ini.inbox.slice().reverse().map((r: any) => (
          <div key={r.id} className={`mb-2 rounded-2xl border p-3 ${r.read ? "border-slate-200 bg-white/60" : "border-whale-300 bg-whale-50/60"}`}>
            <div className="font-medium text-slate-800">{r.text}</div>
            <div className="text-xs text-slate-500">{fmt(r.at)} · {r.reason} · {r.urgency}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => act.iniRead(r.id)}><Check className="h-3 w-3" />知道了</Button>
              <Button size="sm" variant="ghost" onClick={() => act.iniStop(r.topic)}><Ban className="h-3 w-3" />不再提醒这类</Button>
              <Button size="sm" variant="soft" onClick={gotoCenter}><CalendarSearch className="h-3 w-3" />查看日程</Button>
            </div>
          </div>
        )) : <EmptyState icon={BellRing} title="还没有主动提醒" sub="用上方演示时钟「下一次提醒」快进，或开启自动播放观察每个节拍的判断。" />}
      </GlassCard>

      <SectionHeading eyebrow="Ledger" title="决策账本" sub="每次节拍一行；可展开完整提示词。" />
      <GlassCard hover={false} className="p-5">
        {ini.ledger.length ? ini.ledger.slice().reverse().map((e: any) => (
          <details key={e.id} className="mb-2 rounded-2xl border border-slate-200 bg-white/80 p-3">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
              <span className="font-mono text-xs text-slate-500">{fmt(e.at)}</span>
              <Badge tone={e.engine === "ai" ? "green" : "whale"}>{e.engine === "ai" ? "AI判断" : e.fallback ? "AI失败·规则回退" : "规则判断"}</Badge>
              <Badge tone={gateTone[e.gate.status] || "slate"}>{e.gate.status}</Badge>
              <span className="text-slate-700">{e.decision.action}</span>
              <span className="text-xs text-slate-400">{e.promptSummary}</span>
            </summary>
            <p className="mt-2 text-xs text-slate-600">决策理由：{e.decision.reason} · 门控：{e.gate.reason}{e.delivered ? " · 已投递" : ""}</p>
            <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 font-mono text-[11px] text-slate-600">{e.prompt}</pre>
          </details>
        )) : <EmptyState icon={ScrollText} title="还没有节拍记录" sub="每次节拍都会记录：看到了什么、怎么判断、门控是否放行。" />}
      </GlassCard>
    </div>
  );
}
