import { useLayoutEffect, useRef, useState } from "react";
import { MessagesSquare, Brain, ListChecks, Home, Menu, X, CircleHelp, PlayCircle, RotateCcw, SlidersHorizontal, Info } from "lucide-react";
import { WhaleLogo } from "./ui";
import AISettings from "./AISettings";
import { DEMO_DURATION_SECONDS } from "../../lib/demo-playback.js";
import { store, resetAll, type View } from "../store";

const tabs: { id: View; label: string; icon: any }[] = [
  { id: "home", label: "首页", icon: Home },
  { id: "messages", label: "消息", icon: MessagesSquare },
  { id: "center", label: "待办", icon: ListChecks },
  { id: "memory", label: "助手", icon: Brain },
];

export default function Navbar({ view, setView, startGuide, startDemo }: { startGuide: () => void; startDemo: () => void; view: View; setView: (v: View) => void }) {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const [selection, setSelection] = useState<{ top: number; height: number } | null>(null);
  const activeView: View = view === "initiative" ? "center" : view === "devices" ? "memory" : view;

  useLayoutEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLButtonElement>('button[aria-current="page"]');
    if (!nav || !active) { setSelection(null); return; }
    const measure = () => {
      const top = active.offsetTop;
      const height = active.offsetHeight;
      setSelection(previous => previous?.top === top && previous.height === height ? previous : { top, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    nav.querySelectorAll("button").forEach(button => observer.observe(button));
    return () => observer.disconnect();
  }, [activeView]);

  const ai = store.ai;
  const unread = store.initiative.inbox.filter((reminder: any) => !reminder.read).length;
  const pending = (store.states.home?.devices?.pending || []).filter((item: any) => item.status === "needs_approval").length;
  const counts: Partial<Record<View, number>> = { center: unread, memory: pending };
  const aiText = ai.configured ? (ai.overloaded ? "AI超过负载" : "AI接入") : "AI未接入";
  const aiTone = ai.configured ? (ai.overloaded ? "is-off" : "is-live") : "is-off";

  return <>
    <div className="mobile-navigation">
      <button type="button" aria-label={open ? "关闭导航" : "打开导航"} aria-expanded={open} aria-controls="primary-sidebar" onClick={() => setOpen(!open)}>{open ? <X size={21} /> : <Menu size={21} />}</button>
      <span className="font-display font-semibold">WHALE</span>
      <button type="button" onClick={startDemo} disabled={store.demo.running} className="ml-auto flex items-center gap-1 text-sm text-clay-deep"><PlayCircle size={16} />演示</button>
    </div>
    {open && <button type="button" className="sidebar-backdrop" aria-label="关闭导航遮罩" onClick={() => setOpen(false)} />}
    <aside id="primary-sidebar" aria-label="主导航" className={"primary-sidebar " + (open ? "is-open" : "")}>
      <div className="sidebar-brand"><span className="sidebar-logo"><WhaleLogo className="h-6 w-6" /></span><div><strong>WHALE</strong><small>消息有着落</small></div><button type="button" className="sidebar-close" aria-label="关闭导航" onClick={() => setOpen(false)}><X size={20} /></button></div>
      <button type="button" className="sidebar-demo" onClick={() => { setOpen(false); startDemo(); }} disabled={store.demo.running}><PlayCircle size={18} /><span>{store.demo.running ? "演示进行中…" : "一键自动演示"}</span><small>{DEMO_DURATION_SECONDS} 秒</small></button>
      <p className="sidebar-caption">工作空间</p>
      <nav ref={navRef} className={selection ? "workspace-nav has-selection" : "workspace-nav"}>
        {selection && <span aria-hidden="true" className="workspace-nav-selection" style={{ height: selection.height, transform: `translateY(${selection.top}px)` }} />}
        {tabs.map((tab) => <button key={tab.id} type="button" aria-current={activeView === tab.id ? "page" : undefined}
          onClick={() => { setView(tab.id); setOpen(false); }}>
          <tab.icon size={18} /><span>{tab.label}</span>{counts[tab.id] ? <em className="nav-count">{counts[tab.id]}</em> : null}
        </button>)}
      </nav>
      <div className="sidebar-tools">
        <span className={"ai-pill " + aiTone} role="status" aria-label="AI 连接状态"><i />{aiText}</span>
        <button type="button" aria-haspopup="dialog" onClick={() => { setOpen(false); setSettingsOpen(true); }}><SlidersHorizontal size={17} />AI 设置</button>
        <button type="button" data-tour="help" onClick={() => { setOpen(false); startGuide(); }}><CircleHelp size={17} />分步引导</button>
        <button type="button" onClick={() => { setOpen(false); setView("about"); }}><Info size={17} />关于作品</button>
        <button type="button" disabled={store.busy || store.demo.running} onClick={() => { if (window.confirm("重置全部演示数据？群聊、待办、记忆和设备会回到初始状态。")) resetAll(); }}><RotateCcw size={17} />重置演示数据</button>
      </div>
    </aside>
    {settingsOpen && <AISettings onClose={() => setSettingsOpen(false)} />}
  </>;
}
