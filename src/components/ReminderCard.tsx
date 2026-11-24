import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Bell, BellRing, Check, Ban, CalendarSearch, ChevronDown, ChevronUp, X, Plus, RotateCcw } from "lucide-react";
import { act, store, tickStates } from "../store";
import { fmt, scName } from "../fmt";
import { Badge, Button, WhaleLogo } from "./ui";

type Reminder = {
  id: string;
  at: number;
  action: string;
  text: string;
  reason: string;
  urgency: string;
  topic: string;
  read: boolean;
};
type SuggestionTarget = { type: "suggestion"; id: string; scene: string };
const previewMs = 3000;

function ReminderHeading({ reminder: r }: { reminder: Reminder }) {
  return <span className="push-head">
    <span className="push-app"><WhaleLogo className="h-3.5 w-3.5" /></span>
    <b>WHALE</b><span>· {r.action === "remind" ? "截止提醒" : "重要消息"}</span>
    <time className="ml-auto">{fmt(r.at).slice(-5)}</time>
  </span>;
}

function ReminderItem({ reminder, expanded, preview, onToggle, onViewSchedule }: {
  reminder: Reminder;
  expanded: boolean;
  preview?: boolean;
  onToggle: () => void;
  onViewSchedule: () => void;
}) {
  const bodyId = `${preview ? "preview" : "inbox"}-reminder-${reminder.id}`;
  return <article className={`push ${reminder.urgency === "high" ? "is-urgent" : ""} ${expanded ? "" : "is-collapsed"} ${preview ? "is-arriving" : ""}`}>
    <button type="button" className="push-summary" aria-expanded={expanded} aria-controls={bodyId} onClick={onToggle}>
      <ReminderHeading reminder={reminder} />
      <span className="push-title"><span>{reminder.text}</span>{expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
    </button>
    <div id={bodyId} hidden={!expanded}>
      <div className="push-body">{reminder.reason}</div>
      <div className="push-actions">
        <button onClick={() => act.iniRead(reminder.id)}><Check size={14} />知道了</button>
        <button onClick={() => act.iniStop(reminder.topic)}><Ban size={14} />不再提醒这类</button>
        <button onClick={onViewSchedule}><CalendarSearch size={14} />查看日程</button>
      </div>
    </div>
  </article>;
}

export default function ReminderCard({ gotoCenter, openSuggestion }: {
  gotoCenter: () => void;
  openSuggestion: (target: SuggestionTarget) => void;
}) {
  const inbox: Reminder[] = store.initiative.inbox;
  const latest = inbox.at(-1);
  const unread = inbox.filter(r => !r.read).reverse();
  const suggestions = tickStates().flatMap(s => (s.suggestions || []).map((item: any) => ({ ...item, scene: s.scenario })));
  const pending = suggestions.filter(item => item.status === "pending").sort((a, b) => b.time - a.time);
  const handled = suggestions.filter(item => item.status !== "pending");
  const count = unread.length + pending.length;
  const demo = store.demo;
  const demoSuggestions = demo.running && (demo.step === 2 || demo.target.startsWith("[data-demo-add="));
  const demoReminder = demo.running && demo.step === 6 && demo.phase !== "entering" ? latest : undefined;
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewExpandedId, setPreviewExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [previews, setPreviews] = useState<Reminder[]>([]);
  const seen = useRef({ inbox, latest, runningDemo: demo.running, demoReminder });
  const timers = useRef(new Map<Reminder, number>());
  const root = useRef<HTMLDivElement>(null);
  const bell = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      activeTimers.forEach(timer => window.clearTimeout(timer));
      activeTimers.clear();
    };
  }, []);

  useEffect(() => {
    const previous = seen.current;
    seen.current = { inbox, latest, runningDemo: demo.running, demoReminder };
    if (previous.inbox !== inbox || previous.runningDemo !== demo.running) {
      timers.current.forEach(timer => window.clearTimeout(timer));
      timers.current.clear();
      setPreviews([]);
      if (demo.running) setOpen(false);
    }
    let arrivals: Reminder[] = [];
    if (demo.running) {
      if (demoReminder && demoReminder !== previous.demoReminder) arrivals = [demoReminder];
    } else if (latest && !previous.runningDemo && latest !== previous.latest) {
      const start = previous.inbox === inbox && previous.latest ? inbox.indexOf(previous.latest) + 1 : 0;
      arrivals = inbox.slice(start);
    }
    const newPreviews = arrivals.filter(reminder => !reminder.read && !timers.current.has(reminder));
    if (!newPreviews.length) return;
    setPreviews(current => [...newPreviews.slice().reverse(), ...current]);
    setPreviewExpandedId(newPreviews.at(-1)!.id);
    for (const reminder of newPreviews) {
      const timer = window.setTimeout(() => {
        timers.current.delete(reminder);
        setPreviews(current => current.filter(item => item !== reminder));
      }, previewMs);
      timers.current.set(reminder, timer);
    }
  }, [inbox, latest, demo.running, demoReminder]);

  useEffect(() => {
    if (!open || demo.running) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      bell.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, demo.running]);

  const panelVisible = demo.running ? demoSuggestions : open;
  const floating = demo.running && demo.step !== 6
    ? []
    : previews.filter(r => !r.read && inbox.includes(r)).slice(0, 3);
  const visibleReminders = showAll ? unread : unread.slice(0, 3);

  return <div ref={root} className="notification-center" inert={demo.running || undefined}>
    {floating.length > 0 && <aside className={`push-wrap${panelVisible ? " is-behind-panel" : ""}`} aria-label="新提醒" style={{ "--preview-duration": `${previewMs}ms` } as CSSProperties}>
      {floating.map(reminder => <ReminderItem key={reminder.id} reminder={reminder} preview expanded={previewExpandedId === reminder.id}
        onToggle={() => setPreviewExpandedId(id => id === reminder.id ? null : reminder.id)}
        onViewSchedule={() => { setPreviews(current => current.filter(item => item !== reminder)); gotoCenter(); }} />)}
      <span className="sr-only" role="status">{floating[0].text}</span>
    </aside>}

    <button ref={bell} type="button" data-tour="notifications" className={`reminder-pill${count ? "" : " is-empty"}`}
      aria-label={count ? `通知中心，${unread.length} 条未读提醒，${pending.length} 项待确认` : "通知中心"}
      aria-expanded={panelVisible} aria-controls={panelVisible ? "notification-panel" : undefined}
      onClick={() => {
        if (open) { setOpen(false); return; }
        setExpandedId(unread[0]?.id ?? null);
        setShowAll(false);
        setOpen(true);
      }}>
      {count ? <BellRing size={17} aria-hidden="true" /> : <Bell size={17} aria-hidden="true" />}
      {count > 0 && <span>{count} 条提醒</span>}
    </button>

    {panelVisible && <section id="notification-panel" className={`notification-panel${demoSuggestions ? " is-demo" : ""}`} aria-label="通知中心">
      <header className="notification-panel-head">
        <h2>通知中心</h2>
        <button type="button" aria-label="收起通知中心" onClick={() => { setOpen(false); bell.current?.focus(); }}><X size={17} /></button>
      </header>
      <div className="notification-content">
        {count === 0 && <p className="notification-empty">暂无新提醒或待确认事项</p>}
        {(pending.length > 0 || handled.length > 0) && <section aria-label="待确认事项">
          {pending.length > 0 && <h3>待确认事项 <span>{pending.length}</span></h3>}
          {pending.map(item => <div key={`${item.scene}:${item.id}`} data-demo-suggestion={`${item.scene}:${item.id}`} className="sug-row notification-suggestion">
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => {
              setOpen(false);
              openSuggestion({ type: "suggestion", id: item.id, scene: item.scene });
            }}>
              <b>{item.title}</b>
              <small>{scName(item.scene)} · {item.author} · {fmt(item.time)}</small>
              <small>{item.due ? `截止 ${fmt(item.due)}` : "截止待确认"} · {item.origin === "ai" ? "AI 提取" : "规则引擎"}</small>
            </button>
            <button type="button" data-demo-add={`${item.scene}:${item.id}`} title="直接添加" aria-label={`添加待办：${item.title}`}
              onClick={() => act.addSug(item.scene, item.id)} className="notification-add"><Plus size={18} /></button>
          </div>)}
          {handled.length > 0 && <details className="notification-history">
            <summary>已处理建议 · {handled.length}</summary>
            {handled.map(item => <div key={`${item.scene}:${item.id}`} className="flex items-center justify-between gap-2 py-2">
              <span>{item.title} <Badge tone={item.status === "added" ? "green" : "slate"}>{item.status === "added" ? "已添加" : "已删除"}</Badge></span>
              {item.status === "dismissed" && <Button size="sm" variant="ghost" onClick={() => act.restoreSug(item.scene, item.id)}><RotateCcw size={12} />恢复</Button>}
            </div>)}
          </details>}
        </section>}

        {unread.length > 0 && <section aria-label="未读提醒">
          <h3>未读提醒 <span>{unread.length}</span></h3>
          <div className="push-list">
            {visibleReminders.map(reminder => <ReminderItem key={reminder.id} reminder={reminder} expanded={expandedId === reminder.id}
              onToggle={() => setExpandedId(id => id === reminder.id ? null : reminder.id)}
              onViewSchedule={() => { setOpen(false); gotoCenter(); }} />)}
          </div>
          {unread.length > 3 && <button className="push-more" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>{showAll ? <ChevronUp size={16} /> : <ChevronDown size={16} />}{showAll ? "收起更多" : `显示全部 ${unread.length} 条提醒`}</button>}
        </section>}
      </div>
    </section>}
  </div>;
}
