import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { subscribe, store, allRows, tickStates, persist, notify, checkAI, setTab, type View } from "./store";
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
import TabBar from "./components/TabBar";
import TrackFilter from "./components/TrackFilter";
import { WhaleLogo } from "./components/ui";
import { Sparkles, X, ListChecks, BellRing, Brain, PlugZap } from "lucide-react";

function useStore() { const [, force] = useReducer((x: number) => x + 1, 0); useEffect(() => subscribe(force), []); return store; }
const TITLES: Record<View, [string, string]> = {
  home: ["首页", "作品介绍"],
  messages: ["消息", "发一条通知，或翻看群聊原文"],
  todos: ["待办", "跨群待办清单与主动提醒"],
  assistant: ["助手", "可解释的个人记忆与学习环境联动"],
  about: ["关于作品", "作品是什么、为什么做、怎么用、技术架构"],
};

export default function App() {
  useStore();
  const [guideOpen, setGuideOpen] = useState(false);
  const returnView = useRef<View>("home");
  const [view, setView] = useState<View>("home");
  const main = useRef<HTMLElement>(null);
  const sidebarDestination = useRef<View | null>(null);
  const [split, setSplit] = useState<any>(null);
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
  const unread = store.initiative.inbox.filter((r: any) => !r.read).length;
  const pendingApprovals = (store.states.home?.devices?.pending || []).filter((p: any) => p.status === "needs_approval").length;
  const goto = (v: View, tab?: string) => {
    if (v === "todos" && tab) store.tab.todos = tab as typeof store.tab.todos;
    if (v === "assistant" && tab) store.tab.assistant = tab as typeof store.tab.assistant;
    setView(v); setSplit(null); window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const gotoFromSidebar = (v: View) => {
    if (v === view) { goto(v); return; }
    sidebarDestination.current = v;
    setView(v);
    setSplit(null);
  };
  const gotoMessage = (scene: string, id: string) => { store.focusMessageId = id; store.active = scene; persist(); setSplit(null); setView("messages"); };
  const openSplit = (t: any) => { store.active = t.scene; setTab("todos", "list"); setSplit(t); setView("todos"); };
  const startDemo = () => { setGuideOpen(false); void runDemo({ goto: (v, tab) => { if (v === "todos" && tab) store.tab.todos = tab as typeof store.tab.todos; if (v === "assistant" && tab) store.tab.assistant = tab as typeof store.tab.assistant; setView(v); setSplit(null); }, openSplit, closeSplit: () => setSplit(null) }); };
  const startGuide = () => { returnView.current = view; setSplit(null); setGuideOpen(true); };
  const gotoTodoList = () => { setTab("todos", "list"); if (view !== "todos") goto("todos", "list"); };
  const [title, sub] = TITLES[view];

  return (
    <div className="relative min-h-screen">
      <a href="#main-content" className="skip-link">跳到主要内容</a>
      <div className="bg-canvas" />
      <div className="dot-grid" />
      <div className="grain" />
      <div className={`relative z-10 application-content${view === "home" ? " home-layout" : ""}`}>
        <Navbar startGuide={startGuide} startDemo={startDemo} view={view} setView={gotoFromSidebar} />
        <main ref={main} id="main-content" className={`mx-auto max-w-7xl px-4 pb-24${view === "home" ? " home-main" : ""}`}>
          {view !== "home" && <div className="workspace-heading"><div><h1>{title}</h1><p>{sub}</p></div><TrackFilter /></div>}
          {view !== "home" && store.notice && <div role="status" className="notice-bar animate-rise"><Sparkles className="h-4 w-4 flex-none text-clay-deep" /><span className="flex-1">{store.notice}</span><button aria-label="关闭操作提示" onClick={() => { store.notice = ""; notify(); }}><X className="h-4 w-4" /></button></div>}
          {view !== "home" && store.extractMode === "ai" && store.ai.configured && store.ai.lastFallback && <p role="status" className="fallback-bar">上一次 AI 请求{store.ai.lastFallback}，已回退规则模式（结果已明确标注）。稍后发送会再次尝试真实模型。</p>}
          {view === "home" && <Showcase stats={stats} startDemo={startDemo} goto={goto} startGuide={startGuide} />}
          {["todos", "assistant"].includes(view) && <div className="pt-2"><ClockBar /></div>}
          {view === "todos" && <>
            <TabBar scope="todos" label="待办" active={store.tab.todos} onChange={(id) => setTab("todos", id)}
              tabs={[{ id: "list", label: "待办清单", icon: ListChecks }, { id: "reminders", label: "提醒", icon: BellRing, count: unread }]} />
            <div role="tabpanel" id={`tabpanel-todos-${store.tab.todos}`} aria-labelledby={`tab-todos-${store.tab.todos}`}>
              {store.tab.todos === "list"
                ? (split ? <SplitView target={split} onBack={() => setSplit(null)} now={now} gotoSource={() => { const source = store.states[split.scene]; const obj = split.type === "suggestion" ? source.suggestions.find((x: any) => x.id === split.id) : source.tasks.find((x: any) => x.id === split.id); gotoMessage(split.scene, obj?.messageId || obj?.sources?.at(-1) || ""); }} /> : <SummaryView openSplit={openSplit} />)
                : <InitiativeView gotoCenter={gotoTodoList} />}
            </div>
          </>}
          {view === "messages" && <div className="pt-2"><SourcesView /></div>}
          {view === "assistant" && <>
            <TabBar scope="assistant" label="助手" active={store.tab.assistant} onChange={(id) => setTab("assistant", id)}
              tabs={[{ id: "memory", label: "记忆", icon: Brain }, { id: "environment", label: "学习环境", icon: PlugZap, count: pendingApprovals }]} />
            <div role="tabpanel" id={`tabpanel-assistant-${store.tab.assistant}`} aria-labelledby={`tab-assistant-${store.tab.assistant}`}>
              {store.tab.assistant === "memory" ? <MemoryView gotoMessage={gotoMessage} now={now} /> : <DevicesView />}
            </div>
          </>}
          {view === "about" && <div className="pt-2"><AboutView startDemo={startDemo} /></div>}
        </main>
        {view !== "home" && <footer className="site-footer">
          <WhaleLogo className="mx-auto mb-2 h-5 w-5 text-clay-deep" />
          Whale · 消息有着落 —— 2026 Qoder 高校创造力大赛参赛作品<br />
          <button type="button" className="footer-link" aria-current={view === "about" ? "page" : undefined} onClick={() => goto("about")}>关于作品</button> · 数据只存在你的浏览器 · AI 由服务端代理调用，密钥不进前端
          <a className="icp-line" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">蜀ICP备2026070385号</a>
        </footer>}
      </div>
      {store.demo.running && <DemoOverlay />}
      {guideOpen && <UsageGuide onViewChange={goto} onClose={() => { try { localStorage.setItem(GUIDE_KEY, "seen"); } catch { /* ignore */ } setGuideOpen(false); goto(returnView.current); }} />}
      <ReminderCard gotoCenter={gotoTodoList} openSuggestion={target => { openSplit(target); window.scrollTo({ top: 0, behavior: "instant" }); }} />
    </div>
  );
}
