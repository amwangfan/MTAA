import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { subscribe, store, allRows, tickStates, persist, notify, checkAI, answerRuleFallback, type View } from "./store";
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
function RuleFallbackDialog() {
  const panel = useRef<HTMLElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancel.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); answerRuleFallback(false); return; }
      if (event.key !== "Tab") return;
      const controls = panel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    const root = document.getElementById("root");
    const wasInert = root?.inert || false;
    if (root) root.inert = true;
    return () => { document.removeEventListener("keydown", key); if (root) root.inert = wasInert; if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) answerRuleFallback(false); }}>
      <section ref={panel} role="dialog" aria-modal="true" aria-labelledby="rule-fallback-title" aria-describedby="rule-fallback-desc rule-fallback-scope" tabIndex={-1} className="card w-full max-w-md rounded-2xl p-6 shadow-2xl">
        <h2 id="rule-fallback-title" className="font-display text-xl font-semibold text-ink">AI 暂时繁忙</h2>
        <p id="rule-fallback-desc" className="mt-3 text-base font-semibold text-ink-2">是否使用固定规则？</p>
        <p id="rule-fallback-scope" className="mt-2 text-sm leading-6 text-muted">服务端返回 AI_BUSY 时，确认仅在本次请求使用规则引擎，不会开启持续回退。取消会保留当前内容，请稍后重试。</p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button ref={cancel} type="button" className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink-2 hover:bg-paper-2" onClick={() => answerRuleFallback(false)}>稍后重试</button>
          <button type="button" className="rounded-lg bg-clay-deep px-4 py-2 text-sm font-semibold text-white hover:bg-clay" onClick={() => answerRuleFallback(true)}>使用固定规则</button>
        </div>
      </section>
    </div>, document.body,
  );
}
const TITLES: Record<View, [string, string]> = {
  home: ["首页", "作品介绍"],
  center: ["信息总结", "跨群待办、截止分类与待确认建议"],
  messages: ["消息来源", "群聊 · 发一条通知试试"],
  memory: ["记忆", "可解释、可遗忘、会衰减的个人记忆"],
  initiative: ["主动判断", "什么时候该提醒你，什么时候该闭嘴"],
  devices: ["设备", "宿舍智能设备 · 风险分级与单次批准"],
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
  const unread = store.initiative.inbox.filter((reminder: any) => !reminder.read).length;
  const pendingApprovals = (store.states.home?.devices?.pending || []).filter((item: any) => item.status === "needs_approval").length;
  const goto = (v: View) => { setView(v); setSplit(null); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const gotoFromSidebar = (v: View) => {
    if (v === view) { goto(v); return; }
    sidebarDestination.current = v;
    setView(v);
    setSplit(null);
  };
  const gotoMessage = (scene: string, id: string) => { store.focusMessageId = id; store.active = scene; persist(); setSplit(null); setView("messages"); };
  const openSplit = (t: any) => { store.active = t.scene; setSplit(t); setView("center"); };
  const startDemo = () => { setGuideOpen(false); void runDemo({ goto: (v) => { setView(v); setSplit(null); }, openSplit, closeSplit: () => setSplit(null) }); };
  const startGuide = () => { returnView.current = view; setSplit(null); setGuideOpen(true); };
  const todoTab = view === "initiative" ? "reminders" : "list";
  const assistantTab = view === "devices" ? "environment" : "memory";
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
          {!["home", "messages", "about"].includes(view) && <div className="pt-2"><ClockBar /></div>}
          {["center", "initiative"].includes(view) && <>
            <TabBar scope="todos" label="待办" active={todoTab} onChange={(id) => goto(id === "reminders" ? "initiative" : "center")}
              tabs={[{ id: "list", label: "待办清单", icon: ListChecks }, { id: "reminders", label: "提醒", icon: BellRing, count: unread }]} />
            <div className="view-tabpanel" role="tabpanel" id={`tabpanel-todos-${todoTab}`} aria-labelledby={`tab-todos-${todoTab}`} tabIndex={0}>
              {view === "center"
                ? (split ? <SplitView target={split} onBack={() => setSplit(null)} now={now} gotoSource={() => { const source = store.states[split.scene]; const obj = split.type === "suggestion" ? source.suggestions.find((x: any) => x.id === split.id) : source.tasks.find((x: any) => x.id === split.id); gotoMessage(split.scene, obj?.messageId || obj?.sources?.at(-1) || ""); }} /> : <SummaryView openSplit={openSplit} />)
                : <InitiativeView gotoCenter={() => goto("center")} />}
            </div>
            {view === "center" && <div role="tabpanel" id="tabpanel-todos-reminders" aria-labelledby="tab-todos-reminders" hidden />}
            {view === "initiative" && <div role="tabpanel" id="tabpanel-todos-list" aria-labelledby="tab-todos-list" hidden />}
          </>}
          {view === "messages" && <div className="pt-2"><SourcesView /></div>}
          {["memory", "devices"].includes(view) && <>
            <TabBar scope="assistant" label="助手" active={assistantTab} onChange={(id) => goto(id === "environment" ? "devices" : "memory")}
              tabs={[{ id: "memory", label: "记忆", icon: Brain }, { id: "environment", label: "学习环境", icon: PlugZap, count: pendingApprovals }]} />
            <div className="view-tabpanel" role="tabpanel" id={`tabpanel-assistant-${assistantTab}`} aria-labelledby={`tab-assistant-${assistantTab}`} tabIndex={0}>
              {view === "memory" ? <MemoryView gotoMessage={gotoMessage} now={now} /> : <DevicesView />}
            </div>
            {view === "memory" && <div role="tabpanel" id="tabpanel-assistant-environment" aria-labelledby="tab-assistant-environment" hidden />}
            {view === "devices" && <div role="tabpanel" id="tabpanel-assistant-memory" aria-labelledby="tab-assistant-memory" hidden />}
          </>}
          {view === "about" && <div className="pt-2"><AboutView startDemo={startDemo} /></div>}
        </main>
        <footer className="site-footer">
          <WhaleLogo className="mx-auto mb-2 h-5 w-5 text-clay-deep" />
          Whale · 消息有着落 —— 2026 Qoder 高校创造力大赛参赛作品<br />
          <button type="button" className="footer-link" aria-current={view === "about" ? "page" : undefined} onClick={() => goto("about")}>关于作品</button><br />
          演示数据默认保存在你的浏览器；AI 模式会将必要消息上下文发送到服务端和模型供应商，密钥不会进入前端。
          <a className="icp-line" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">蜀ICP备2026070385号</a>
        </footer>
      </div>
      {store.demo.running && <DemoOverlay />}
      {store.ruleFallbackOpen && <RuleFallbackDialog />}
      {guideOpen && <UsageGuide onViewChange={goto} onClose={() => { try { localStorage.setItem(GUIDE_KEY, "seen"); } catch { /* ignore */ } setGuideOpen(false); goto(returnView.current); }} />}
      <ReminderCard gotoCenter={() => goto("center")} openSuggestion={target => { openSplit(target); window.scrollTo({ top: 0, behavior: "instant" }); }} />
    </div>
  );
}
