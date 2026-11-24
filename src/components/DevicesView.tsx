import { useState } from "react";
import { Lightbulb, AirVent, Blinds, Speaker, Lock, LockOpen, ShieldCheck, ScrollText, Check, X, Minus, Plus, BookOpen, Moon, Thermometer, Droplets, ShieldAlert, Eye, MessageCircle } from "lucide-react";
import { state, act, store, notify } from "../store";
import { fmt } from "../fmt";
import { GlassCard, Badge, Button, SectionHeading, EmptyState } from "./ui";

const riskInfo: any = { read_only: ["只读", "green", Eye], communicate: ["沟通类", "amber", MessageCircle], transaction: ["事务类 · 需批准", "rose", ShieldAlert] };
const capName: any = { on_off: "开关", set_temperature: "调温", open_close: "开合", play: "播放", get_state: "读取状态" };
const stageName: any = { intent: "提出意图", approved: "已批准", executed: "已执行", denied: "已拒绝", superseded: "被新建议替代", failed: "执行失败" };
const sourceName: any = { manual: "手动", chat: "历史群聊请求", memory: "记忆对话", initiative: "主动判断", scene: "场景" };
const argsText = (cap: string, a: any = {}) => cap === "on_off" ? (a.on ? "打开" : "关闭") : cap === "open_close" ? (a.open ? "拉开" : "拉上") : cap === "set_temperature" ? `${a.temp}℃` : cap === "play" ? ((a.playing ?? a.play !== false) ? "播放" : "停止") : "";

function Visual({ d }: { d: any }) {
  if (d.type === "light") return <div className={"dv dv-light " + (d.state.on ? "is-on" : "")}><span className="glow" /><Lightbulb className="h-9 w-9" /></div>;
  if (d.type === "ac") { const pct = (Math.min(30, Math.max(16, d.state.temp)) - 16) / 14; const C = 2 * Math.PI * 34; return (
    <div className={"dv dv-ac " + (d.state.on ? "is-on" : "")}>
      <svg viewBox="0 0 80 80" width="84" height="84"><circle cx="40" cy="40" r="34" className="ring-bg" /><circle cx="40" cy="40" r="34" className="ring-fg" strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 40 40)" /></svg>
      <div className="ac-temp"><b>{d.state.temp}</b><small>℃</small></div>
      <span className="airflow"><i /><i /><i /></span>
    </div>); }
  if (d.type === "curtain") return <div className={"dv dv-curtain " + (d.state.open ? "is-open" : "")}><span className="window" /><span className="panel l" /><span className="panel r" /></div>;
  if (d.type === "speaker") return <div className={"dv dv-speaker " + (d.state.playing ? "is-on" : "")}><Speaker className="h-8 w-8" /><span className="eq"><i /><i /><i /><i /><i /></span></div>;
  return <div className={"dv dv-lock " + (d.state.locked ? "is-locked" : "")}>{d.state.locked ? <Lock className="h-8 w-8" /> : <LockOpen className="h-8 w-8" />}</div>;
}
const stateText = (d: any) => d.type === "light" ? (d.state.on ? "已打开" : "已关闭") : d.type === "ac" ? (d.state.on ? `制热中 · 目标 ${d.state.temp}℃` : `待机 · 设定 ${d.state.temp}℃`) : d.type === "curtain" ? (d.state.open ? "已拉开" : "已拉上") : d.type === "speaker" ? (d.state.playing ? "正在播放 · 白噪音" : "已停止") : (d.state.locked ? "已上锁 · 只读传感器" : "未上锁");

export default function DevicesView() {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const run = async (action: () => Promise<unknown>) => { if (busy) return; setBusy(true); setError(""); try { await action(); } catch { setError("模拟操作未完成，请检查设备状态后重试。"); } finally { setBusy(false); } };
  const dev = state().devices || { registry: [], pending: [], ledger: [] };
  const pending = dev.pending.filter((p: any) => p.status === "needs_approval");
  const get = (id: string) => dev.registry.find((d: any) => d.id === id);
  const ac = get("bedroom_ac");
  const room = ac?.state.on ? Math.round((ac.state.temp - 1.5) * 10) / 10 : 19.5;
  const scene = (name: string, target: [string, string, any][]) => run(async () => {
    for (const [id, cap, args] of target) { const d = get(id); if (!d?.online) continue; const same = cap === "on_off" ? d.state.on === args.on : cap === "open_close" ? d.state.open === args.open : cap === "play" ? d.state.playing === args.play : cap === "set_temperature" ? d.state.temp === args.temp : false; if (!same) await act.devManual(id, cap, args); }
    store.notice = `已执行「${name}」场景（手动触发，模拟受理）。`; notify();
  });
  return (
    <div>
      <div className="room-bar">
        <div><div className="text-[11px] tracking-widest text-muted">ROOM</div><div className="font-display text-xl font-semibold">3栋302 · 宿舍</div></div>
        <div className="room-metric"><Thermometer className="h-4 w-4" />室内 {room}℃</div>
        <div className="room-metric"><Droplets className="h-4 w-4" />湿度 46%</div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="soft" disabled={busy} onClick={() => scene("专注学习", [["living_light", "on_off", { on: true }], ["curtain", "open_close", { open: true }], ["speaker", "play", { play: false }], ["bedroom_ac", "set_temperature", { temp: 24 }], ["bedroom_ac", "on_off", { on: true }]])}><BookOpen className="h-3.5 w-3.5" />专注学习</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => scene("晚安", [["living_light", "on_off", { on: false }], ["curtain", "open_close", { open: false }], ["speaker", "play", { play: false }], ["bedroom_ac", "set_temperature", { temp: 26 }]])}><Moon className="h-3.5 w-3.5" />晚安</Button>
        </div>
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-rose-800">{error}</p>}
      <div className="device-grid">
        {dev.registry.map((d: any) => { const [rl, tone, RI] = riskInfo[d.riskTier] || riskInfo.transaction; const off = busy || !d.online; return (
          <GlassCard tour={d.id === "living_light" ? "devices" : undefined} key={d.id} className="dev-card">
            <div className="flex items-center justify-between gap-2"><span className="font-display font-semibold text-ink">{d.name}</span><span className={"online-dot " + (d.online ? "" : "is-off")}>{d.online ? "在线" : "离线"}</span></div>
            <Visual d={d} />
            <div className="text-center text-sm text-ink-2">{stateText(d)}</div>
            <div className="mt-2 flex justify-center"><Badge tone={tone}><RI className="h-3 w-3" />{rl}</Badge></div>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {d.capabilities.includes("on_off") && <Button size="sm" variant={d.state.on ? "soft" : "primary"} disabled={off} onClick={() => run(() => act.devManual(d.id, "on_off", { on: !d.state.on }))}>{d.state.on ? "关闭" : "打开"}</Button>}
              {d.capabilities.includes("set_temperature") && <span className="flex gap-1"><Button size="sm" variant="ghost" aria-label="降低温度" disabled={off || d.state.temp <= 16} onClick={() => run(() => act.devManual(d.id, "set_temperature", { temp: d.state.temp - 1 }))}><Minus className="h-3 w-3" /></Button><Button size="sm" variant="ghost" aria-label="升高温度" disabled={off || d.state.temp >= 30} onClick={() => run(() => act.devManual(d.id, "set_temperature", { temp: d.state.temp + 1 }))}><Plus className="h-3 w-3" /></Button></span>}
              {d.capabilities.includes("open_close") && <Button size="sm" variant="soft" disabled={off} onClick={() => run(() => act.devManual(d.id, "open_close", { open: !d.state.open }))}>{d.state.open ? "拉上" : "拉开"}</Button>}
              {d.capabilities.includes("play") && <Button size="sm" variant="soft" disabled={off} onClick={() => run(() => act.devManual(d.id, "play", { play: !d.state.playing }))}>{d.state.playing ? "停止" : "播放"}</Button>}
              {d.capabilities.length === 1 && <span className="text-xs text-muted">只读，Whale 不能控制</span>}
            </div>
          </GlassCard>
        ); })}
      </div>

      <SectionHeading eyebrow="Approval" title="等你批准的操作" sub="记忆对话结合学习偏好与设备状态提出调整建议；逐项批准后模拟执行，结果写入行动账本。" />
      <div data-tour="approval">
        {pending.length ? pending.map((p: any) => { const d = get(p.deviceId); return (
          <div key={p.id} className="approval-card animate-rise">
            <ShieldCheck className="h-6 w-6 flex-none text-rose-600" />
            <div className="min-w-0 flex-1"><div className="font-medium text-ink">{d?.name} · {capName[p.capability] || p.capability} {argsText(p.capability, p.args)}</div><div className="text-xs text-muted">{p.reason} · 来源：{sourceName[p.source] || p.source} · {fmt(p.at)}</div></div>
            <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => run(() => act.devApprove(p.id))}><Check className="h-3 w-3" />批准一次</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => act.devReject(p.id)}><X className="h-3 w-3" />拒绝</Button></div>
          </div>); }) : <GlassCard hover={false} className="mb-6"><EmptyState icon={ShieldCheck} title="暂无待批准操作" sub="在「记忆」对话中说「我要开始学习了」，结合学习偏好和设备状态生成调整建议。" /></GlassCard>}
      </div>

      <SectionHeading eyebrow="Ledger" title="行动账本" sub="意图 → 批准 → 执行 → 模拟受理回执，每一步都留痕。" />
      <GlassCard tour="device-ledger" hover={false} className="p-5">
        {dev.ledger.length ? <ol className="timeline">{dev.ledger.slice().reverse().slice(0, 30).map((l: any, i: number) => (
          <li key={i} className={"stage-" + l.stage}>
            <span className="font-mono text-xs text-muted">{fmt(l.at)}</span>
            <Badge tone={l.stage === "denied" ? "rose" : l.stage === "executed" ? "green" : l.stage === "approved" ? "amber" : "slate"}>{stageName[l.stage] || l.stage}</Badge>
            <span className="text-ink-2">{get(l.deviceId)?.name || l.deviceId} · {capName[l.capability] || l.capability}</span>
            <span className="text-xs text-muted">{sourceName[l.source] || l.source}{l.receipt ? " · 模拟受理（非真实设备）" : ""}</span>
          </li>))}</ol> : <EmptyState icon={ScrollText} title="还没有行动记录" sub="手动控制、场景或批准一次操作后，会在这里按时间留痕。" />}
      </GlassCard>
    </div>
  );
}
