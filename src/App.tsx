import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { subscribe, store, allRows, tickStates, persist, notify, checkAI, type View } from "./store";
import { runDemo } from "./demo";
import DemoOverlay from "./components/DemoOverlay";
import UsageGuide, { GUIDE_KEY } from "./components/UsageGuide";
import Navbar from "./components/Navbar";
import Showcase from "./components/Showcase";
import ClockBar from "./components/ClockBar";
import SummaryView from "./components/SummaryView";
import SourcesView from "./components/SourcesView";
import MemoryView from "./components/MemoryView";
import InitiativeView from "./components/InitiativeView";
import DevicesView from "./components/DevicesView";
import AboutView from "./components/AboutView";
import SplitView from "./components/SplitView";
import ReminderCard from "./components/ReminderCard";
import { WhaleLogo } from "./components/ui";
import { Sparkles, X } from "lucide-react";

function useStore() { const [, force] = useReducer((x: number) => x + 1, 0); useEffect(() => subscribe(force), []); return store; }
const HERO_KEY = "whale.hero.hidden.v1";
const TITLES: Record<View, [string, string]> = {
  center: ["信息总结", "跨群待办、截止分类与待确认建议"],
  messages: ["消息来源", "群聊 · 发一条通知试试"],
  memory: ["记忆", "可解释、可遗忘、会衰减的个人记忆"],
  initiative: ["主动判断", "什么时候该提醒你，什么时候该闭嘴"],
  devices: ["设备", "宿舍智能设备 · 风险分级与单次批准"],
  about: ["关于作品", "作品是什么 · 为什么做 · 怎么用 · 技术架构"],
};

export default function App() {
  useStore();
  const [guideOpen, setGuideOpen] = useState(false);
  const returnView = useRef<View>("center");
  const [view, setView] = useState<View>("center");
  const main = useRef<HTMLElement>(null);
  const sidebarDestination = useRef<View | null>(null);
  const [split, setSplit] = useState<any>(null);
  const [hero, setHero] = useState(() => { try { return !localStorage.getItem(HERO_KEY); } catch { return true; } });
  useEffect(() => { void checkAI(); }, []);
  useLayoutEffect(() => {
    const fromSidebar = sidebarDestination.current === view;
    sidebarDestination.current = null;
    if (!fromSidebar || !main.current) return;

    window.scrollTo({ top: 0, behavior: "instant" });
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animation = main.current.animate(
      reduceMotion
        ? [{ opacity: 0.86 }, { opacity: 1 }]
        : [{ opacity: 0.86, transform: "translateY(5px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 200, easing: "ease-out" },
    );
    return () => animation.cancel();
  }, [view]);
  const now = store.states[store.active].now;
  const rows = allRows();
  const stats = { groups: store.followed.size, todo: rows.filter((x: any) => x.task.status === "todo").length, memory: tickStates().reduce((a: number, s: any) => a + (s.memory || []).length, 0), reminders: store.initiative.inbox.length };
  const goto = (v: View) => { setView(v); setSplit(null); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const gotoFromSidebar = (v: View) => {
    if (v === view) { goto(v); return; }
    sidebarDestination.current = v;
    setView(v);
    setSplit(null);
  };
  const gotoMessage = (scene: string, id: string) => { store.focusMessageId = id; store.active = scene; persist(); setSplit(null); setView("messages"); };
  const openSplit = (t: any) => { store.active = t.scene; setSplit(t); setView("center"); };
  const setHeroOpen = (b: boolean) => { setHero(b); try { b ? localStorage.removeItem(HERO_KEY) : localStorage.setItem(HERO_KEY, "1"); } catch { /* ignore */ } };
  const startDemo = () => { setGuideOpen(false); setHeroOpen(false); void runDemo({ goto: (v) => { setView(v); setSplit(null); }, openSplit, closeSplit: () => setSplit(null) }); };
  const startGuide = () => { returnView.current = view; setSplit(null); setGuideOpen(true); };
  const [title, sub] = TITLES[view];

  return (
    <div className="relative min-h-screen">
      <a href="#main-content" className="skip-link">跳到主要内容</a>
      <div className="bg-canvas" />
      <div className="dot-grid" />
      <div className="grain" />
      <div className="relative z-10 application-content">
        <Navbar startGuide={startGuide} startDemo={startDemo} view={view} setView={gotoFromSidebar} hero={hero} setHero={(b) => { setHeroOpen(b); goto("center"); }} />
        <main ref={main} id="main-content" className="mx-auto max-w-7xl px-4 pb-24">
          <div className="workspace-heading"><div><h1>{title}</h1><p>{sub}</p></div><span className="heading-chip">{store.track === "life" ? "LIFE" : store.track === "study" ? "STUDY" : "ALL"} · DEMO</span></div>
          {store.notice && <div role="status" className="notice-bar animate-rise"><Sparkles className="h-4 w-4 flex-none text-clay-deep" /><span className="flex-1">{store.notice}</span><button aria-label="关闭操作提示" onClick={() => { store.notice = ""; notify(); }}><X className="h-4 w-4" /></button></div>}
          {store.extractMode === "ai" && store.ai.configured && store.ai.lastFallback && <p role="status" className="fallback-bar">上一次 AI 请求{store.ai.lastFallback}，已回退规则模式（结果已明确标注）。稍后发送会再次尝试真实模型。</p>}
          {view === "center" && hero && !split && <Showcase stats={stats} startDemo={startDemo} goto={goto} startGuide={startGuide} hide={() => setHeroOpen(false)} />}
          {!["messages", "about"].includes(view) && <div className="pt-2"><ClockBar /></div>}
          {view === "center" && (split ? <SplitView target={split} onBack={() => setSplit(null)} now={now} gotoSource={() => { const source = store.states[split.scene]; const obj = split.type === "suggestion" ? source.suggestions.find((x: any) => x.id === split.id) : source.tasks.find((x: any) => x.id === split.id); gotoMessage(split.scene, obj?.messageId || obj?.sources?.at(-1) || ""); }} /> : <SummaryView openSplit={openSplit} goto={goto} />)}
          {view === "messages" && <div className="pt-2"><SourcesView /></div>}
          {view === "memory" && <div className="pt-2"><MemoryView gotoMessage={gotoMessage} now={now} /></div>}
          {view === "initiative" && <div className="pt-2"><InitiativeView gotoCenter={() => goto("center")} /></div>}
          {view === "devices" && <div className="pt-2"><DevicesView /></div>}
          {view === "about" && <div className="pt-2"><AboutView startDemo={startDemo} /></div>}
        </main>
        <footer className="site-footer">
          <WhaleLogo className="mx-auto mb-2 h-5 w-5 text-clay-deep" />
          Whale · 消息有着落 —— 2026 Qoder 高校创造力大赛参赛作品<br />
          数据只存在你的浏览器 · AI 由服务端代理调用，密钥不进前端
          <a className="icp-line" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">蜀ICP备2026070385号</a>
        </footer>
      </div>
      {store.demo.running && <DemoOverlay />}
      {guideOpen && <UsageGuide onViewChange={goto} onClose={() => { try { localStorage.setItem(GUIDE_KEY, "seen"); } catch { /* ignore */ } setGuideOpen(false); goto(returnView.current); }} />}
      <ReminderCard gotoCenter={() => goto("center")} />
    </div>
  );
}
