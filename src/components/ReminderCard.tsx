import { useEffect, useRef } from "react";
import { BellRing, Check, Ban, CalendarSearch, ChevronDown } from "lucide-react";
import { store, act, notify } from "../store";
import { fmt } from "../fmt";
import { WhaleLogo } from "./ui";

// 手机通知横幅样式：新提醒到达时自动展开；可「知道了」「不再提醒这类」「查看日程」，也可收起为角标。
export default function ReminderCard({ gotoCenter }: { gotoCenter: () => void }) {
  const unread = store.initiative.inbox.filter((r: any) => !r.read);
  const lastSeen = useRef<string | null>(null);
  const latest = unread[unread.length - 1];
  useEffect(() => { if (latest && latest.id !== lastSeen.current) { lastSeen.current = latest.id; store.reminderOpen = true; notify(); } }, [latest?.id]);
  if (!unread.length || (store.demo.running && store.demo.step !== 6)) return null;
  const close = () => { store.reminderOpen = false; notify(); };
  if (!store.reminderOpen) return <button aria-label={`展开${unread.length}条未读提醒`} onClick={() => { store.reminderOpen = true; notify(); }} className="reminder-pill"><BellRing className="h-4 w-4" />{unread.length} 条提醒</button>;
  const r = latest;
  const urgent = r.urgency === "high";
  return (
    <div className="push-wrap" role="alertdialog" aria-label="主动提醒">
      <div className={"push " + (urgent ? "is-urgent" : "")}>
        <div className="push-head">
          <span className="push-app"><WhaleLogo className="h-3.5 w-3.5" /></span><b>WHALE</b><span>· {r.action === "remind" ? "截止提醒" : "重要消息"}</span>
          <span className="ml-auto">{fmt(r.at).slice(-5)}</span>
          <button aria-label="收起提醒" onClick={close}><ChevronDown className="h-4 w-4" /></button>
        </div>
        <div className="push-title">{r.text}</div>
        <div className="push-body">{r.reason}{unread.length > 1 ? ` · 还有 ${unread.length - 1} 条未读` : ""}</div>
        <div className="push-actions">
          <button onClick={() => act.iniRead(r.id)}><Check className="h-3.5 w-3.5" />知道了</button>
          <button onClick={() => act.iniStop(r.topic)}><Ban className="h-3.5 w-3.5" />不再提醒这类</button>
          <button onClick={() => { close(); gotoCenter(); }}><CalendarSearch className="h-3.5 w-3.5" />查看日程</button>
        </div>
      </div>
    </div>
  );
}
