import { useLayoutEffect, useRef, useState } from "react";
import { LayoutDashboard, MessagesSquare, Brain, BellRing, PlugZap, Home, Menu, X, CircleHelp, PlayCircle, RotateCcw, Info, GraduationCap, Coffee, Layers, RefreshCw } from "lucide-react";
import { WhaleLogo } from "./ui";
import { DEMO_DURATION_SECONDS } from "../../lib/demo-playback.js";
import { store, persist, notify, setTrack, resetAll, applyChoice, loadModels, currentModelLabel, TRACKS, type View, type Track } from "../store";
const tabs: { id: View; label: string; icon: any }[] = [{ id: "home", label: "首页", icon: Home }, { id: "center", label: "信息总结", icon: LayoutDashboard }, { id: "messages", label: "消息来源", icon: MessagesSquare }, { id: "memory", label: "记忆", icon: Brain }, { id: "initiative", label: "主动判断", icon: BellRing }, { id: "devices", label: "设备", icon: PlugZap }, { id: "about", label: "关于作品", icon: Info }];
const trackIcon: Record<Track, any> = { study: GraduationCap, life: Coffee, all: Layers };

export default function Navbar({ view, setView, startGuide, startDemo }: { startGuide: () => void; startDemo: () => void; view: View; setView: (v: View) => void }) {
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const [selection, setSelection] = useState<{ top: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLButtonElement>('button[aria-current="page"]');
    if (!nav || !active) return;

    const measure = () => {
      const top = active.offsetTop;
      const height = active.offsetHeight;
      setSelection(previous => previous?.top === top && previous.height === height ? previous : { top, height });
    };

    measure();
    const observer = new ResizeObserver(measure);
    nav.querySelectorAll('button').forEach(button => observer.observe(button));
    return () => observer.disconnect();
  }, [view]);
  const ai = store.ai;
  const unread = store.initiative.inbox.filter((r: any) => !r.read).length;
  const pending = (store.states.home?.devices?.pending || []).filter((p: any) => p.status === "needs_approval").length;
  const counts: Partial<Record<View, number>> = { initiative: unread, devices: pending };
  const aiText = ai.configured === null ? "检查中…" : store.extractMode === "rules" ? "规则演示模式" : ai.configured ? `真实 AI · ${currentModelLabel() || "已配置"}` : "AI 未配置 · 规则回退";
  const aiTone = store.extractMode === "rules" ? "is-rules" : ai.configured ? "is-live" : "is-off";
  return <>
    <div className="mobile-navigation"><button aria-label={open ? "关闭导航" : "打开导航"} aria-expanded={open} aria-controls="primary-sidebar" onClick={() => setOpen(!open)}>{open ? <X size={21} /> : <Menu size={21} />}</button><span className="font-display font-semibold">WHALE</span><button onClick={startDemo} disabled={store.demo.running} className="ml-auto flex items-center gap-1 text-sm text-clay-deep"><PlayCircle size={16} />演示</button></div>
    {open && <button className="sidebar-backdrop" aria-label="关闭导航遮罩" onClick={() => setOpen(false)} />}
    <aside id="primary-sidebar" aria-label="主导航" className={"primary-sidebar " + (open ? "is-open" : "")}>
      <div className="sidebar-brand"><span className="sidebar-logo"><WhaleLogo className="h-6 w-6" /></span><div><strong>WHALE</strong><small>消息有着落</small></div><button className="sidebar-close" aria-label="关闭导航" onClick={() => setOpen(false)}><X size={20} /></button></div>
      <button className="sidebar-demo" onClick={() => { setOpen(false); startDemo(); }} disabled={store.demo.running}><PlayCircle size={18} /><span>{store.demo.running ? "演示进行中…" : "一键自动演示"}</span><small>{DEMO_DURATION_SECONDS} 秒</small></button>
      <p className="sidebar-caption">场景</p>
      <div className="track-switch" role="radiogroup" aria-label="场景">
        {(Object.keys(TRACKS) as Track[]).map((t) => { const Icon = trackIcon[t]; return <button key={t} role="radio" aria-checked={store.track === t} disabled={store.busy || store.demo.running} title={TRACKS[t].desc} onClick={() => setTrack(t)}><Icon size={14} />{TRACKS[t].label}</button>; })}
      </div>
      <p className="sidebar-caption">工作空间</p>
      <nav ref={navRef} className={selection ? "workspace-nav has-selection" : "workspace-nav"}>
        {selection && <span aria-hidden="true" className="workspace-nav-selection" style={{ height: selection.height, transform: `translateY(${selection.top}px)` }} />}
        {tabs.map((t) => <button key={t.id} aria-current={view === t.id ? "page" : undefined} onClick={() => { setView(t.id); setOpen(false); }}><t.icon size={18} /><span>{t.label}</span>{counts[t.id] ? <em className="nav-count">{counts[t.id]}</em> : null}</button>)}
      </nav>
      <div className="sidebar-tools">
        <label htmlFor="understanding-mode">消息理解模式</label>
        <select id="understanding-mode" aria-label="消息理解模式" disabled={store.busy || store.demo.running} value={store.extractMode} onChange={(e) => { store.extractMode = e.target.value as "ai" | "rules"; persist(); notify(); }}><option value="ai">AI 整理（真实模型）</option><option value="rules">规则演示（离线）</option></select>
        <span className={"ai-pill " + aiTone}><i />{aiText}</span>
        {store.extractMode === "ai" && ai.configured && ai.providers.length > 0 && (() => { const cur = ai.providers.find((p) => p.provider === ai.choice.provider) || ai.providers[0]; const lock = store.busy || store.demo.running; return <div className="model-picker">
          <label htmlFor="ai-provider">模型节点</label>
          <select id="ai-provider" disabled={lock} value={cur.provider} onChange={(e) => applyChoice(e.target.value)}>{ai.providers.map((p) => <option key={p.provider} value={p.provider}>{p.label}</option>)}</select>
          <label htmlFor="ai-model">模型 <span className={"model-live " + (cur.live ? "is-live" : "is-off")} title={cur.live ? "列表实时拉取自节点 /models" : "节点列表暂不可用：" + (cur.error || "") + "，仅提供默认模型"}>{cur.live ? `实时 · ${cur.models.length}` : "仅默认"}</span></label>
          <div className="model-row"><select id="ai-model" disabled={lock} value={ai.choice.model} onChange={(e) => applyChoice(cur.provider, e.target.value)}>{cur.models.map((m) => <option key={m} value={m}>{m}{m === cur.default ? "（默认）" : ""}</option>)}</select>
          <button type="button" aria-label="重新拉取模型列表" title="重新拉取模型列表" disabled={lock || ai.loadingModels} onClick={() => loadModels(true)}><RefreshCw size={14} className={ai.loadingModels ? "animate-spin" : ""} /></button></div>
        </div>; })()}
        <button data-tour="help" onClick={() => { setOpen(false); startGuide(); }}><CircleHelp size={17} />分步引导</button>
        <button onClick={() => { if (window.confirm("重置全部演示数据？群聊、待办、记忆和设备会回到初始状态。")) resetAll(); }} disabled={store.busy || store.demo.running}><RotateCcw size={17} />重置演示数据</button>
        <p className="sidebar-footnote">虚构群聊 · 模拟设备 · 数据仅存本浏览器</p>
      </div>
    </aside>
  </>;
}
