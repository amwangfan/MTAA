import { useEffect, useRef, useState } from "react";
import { Send, Users, FileText, Image as ImageIcon, ListChecks, Link2, Megaphone, Sparkles, Cpu, PlugZap, ChevronDown, Smile, AtSign } from "lucide-react";
import { store, state, sendMessage, notify, persist } from "../store";
import { scenarios, memberDirectory, senderRole, day } from "../../lib/engine.js";
import { fmt } from "../fmt";
import { groups, persona, isNotice, readCount, attachmentFor, systemLines, quoteFor, weekday, type Attachment } from "../sim";
import { GlassCard, Badge, Button, Avatar, EmptyState } from "./ui";

const hm = (ms: number) => fmt(ms).slice(-5);
function AttachmentView({ a }: { a: Attachment }) {
  if (a.type === "file") return <div className="att att-file"><span className="att-ext">{a.ext}</span><div className="min-w-0"><b>{a.name}</b><small>{a.size} · 群文件</small></div><FileText className="h-4 w-4 text-muted" /></div>;
  if (a.type === "images") return <div className="att att-images">{Array.from({ length: a.count }).map((_, i) => <span key={i} className={"att-img img-" + (i % 3)}><ImageIcon className="h-4 w-4" /></span>)}<small>{a.label}</small></div>;
  if (a.type === "relay") return <div className="att att-relay"><ListChecks className="h-4 w-4" /><div><b>{a.title}</b><small>已有 {a.count} 人参与 · 点击接龙</small></div></div>;
  return <div className="att att-link"><Link2 className="h-4 w-4" /><div><b>{a.title}</b><small>{a.sub}</small></div></div>;
}
function Outcome({ m }: { m: any }) {
  const o = m.outcome; if (!o || ["chat", "ignored"].includes(o.kind)) return null;
  const tone = m.fallback ? "is-fallback" : o.kind === "ai_pending" ? "is-wait" : o.kind === "review" ? "is-review" : "is-ok";
  const Icon = m.fallback ? Cpu : Sparkles;
  return <div className={"whale-receipt " + tone}><Icon className="h-3 w-3" />{m.fallback ? "规则回退 · " : ""}{o.kind === "ai_pending" ? "Whale 正在理解…" : o.text.replace(/^AI .*?已回退规则模式 · /, "")}</div>;
}

export default function SourcesView() {
  const s = state();
  const messagesRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [author, setAuthor] = useState(store.demoAuthor);
  const scene = scenarios.find((x: any) => x.id === store.active) || scenarios[0];
  const g = groups[s.scenario];
  const members = [...new Set([...(memberDirectory[s.scenario as keyof typeof memberDirectory] || []).map((m: any) => m.name), ...s.messages.map((m: any) => m.author)])];
  useEffect(() => { setAuthor("我"); }, [s.scenario]);
  useEffect(() => {
    const box = messagesRef.current; if (!box) return;
    const target = store.focusMessageId;
    const node = target ? Array.from(box.querySelectorAll<HTMLElement>("[data-message-id]")).find((x) => x.dataset.messageId === target) : null;
    if (node) node.scrollIntoView({ block: "center", behavior: "smooth" }); else box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [s.scenario, s.messages.length, store.focusMessageId, store.typing]);
  const submit = async (e: any) => { e.preventDefault(); if (!text.trim() || store.busy || !store.followed.has(store.active)) return; const t = text; store.focusMessageId = null; setText(""); await sendMessage(t, author); };
  const typing = store.typing && store.typing.scene === s.scenario ? persona(s.scenario, store.typing.author) : null;
  const followedScenes = scenarios.filter((x: any) => store.followed.has(x.id));

  return (
    <div className="chat-layout">
      <aside className="chat-list" data-tour="sources" aria-label="群聊列表">
        <div className="chat-list-head"><Users className="h-4 w-4" />关注的群 · {store.followed.size}</div>
        {followedScenes.map((x: any) => { const st = store.states[x.id]; const last = st.messages.at(-1); const gg = groups[x.id]; return (
          <button key={x.id} aria-current={x.id === store.active ? "true" : undefined} disabled={store.busy} onClick={() => { store.active = x.id; store.selected = null; store.focusMessageId = null; persist(); notify(); }} className="chat-list-item">
            <Avatar name={gg.icon} color={gg.color} size={40} square />
            <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><b className="truncate">{gg.title}</b><small>{last ? hm(last.time) : ""}</small></div><p className="truncate">{last ? `${persona(x.id, last.author).short}：${last.text}` : "暂无消息"}</p></div>
          </button>
        ); })}
        <details className="chat-follow"><summary>管理关注来源 <ChevronDown className="h-3 w-3" /></summary>
          <div className="mt-2 grid gap-2">{scenarios.map((sc: any) => <label key={sc.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={store.followed.has(sc.id)} disabled={store.busy} onChange={(e) => { if (e.target.checked) store.followed.add(sc.id); else store.followed.delete(sc.id); if (store.followed.size && !store.followed.has(store.active)) store.active = [...store.followed][0]; store.focusMessageId = null; persist(); notify(); }} />{groups[sc.id].title}</label>)}</div>
          <p className="mt-2 text-xs text-muted">取消关注只隐藏该群的事项，不删除消息。</p>
        </details>
      </aside>

      {store.followed.size > 0 ? <GlassCard hover={false} className="chat-window">
        <header className="chat-head">
          <Avatar name={g.icon} color={g.color} size={40} square />
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><b className="truncate font-display text-base">{g.title}</b><span className="text-xs text-muted">({g.members})</span></div></div>
          <Badge tone="slate" className="hidden sm:inline-flex">模拟群聊 · 未接真实 QQ</Badge>
        </header>
        <div ref={messagesRef} role="log" aria-label="群聊消息" className="chat-scroll scrollbar-thin">
          {s.messages.map((m: any, i: number) => {
            const p = persona(s.scenario, m.author), mine = m.author === "我", prev = s.messages[i - 1];
            const newDay = !prev || day(prev.time) !== day(m.time);
            const showTime = newDay || m.time - prev.time >= 5 * 60000;
            const notice = isNotice(s.scenario, m), att = attachmentFor(m), q = quoteFor(s.messages, i), rc = notice ? readCount(s.scenario, m) : null;
            return (
              <div key={m.id}>
                {showTime && <div className="chat-time">{newDay ? `${day(m.time).slice(5).replace("-", "月")}日 ${weekday(m.time)} ` : ""}{hm(m.time)}</div>}
                <div data-message-id={m.id} className={"chat-row " + (mine ? "is-mine " : "") + (store.focusMessageId === m.id ? "evidence-msg" : "")}>
                  <Avatar name={p.name} color={p.color} tag={p.tag} />
                  <div className="chat-col">
                    <div className="chat-name">{!mine && p.tag && <span className={"role-tag " + (p.tag === "群主" ? "is-owner" : "")}>{p.tag}</span>}{p.name}</div>
                    {q && <div className="chat-quote">回复 {persona(s.scenario, q.author).short}：{q.text.slice(0, 28)}{q.text.length > 28 ? "…" : ""}</div>}
                    <div className={"bubble " + (mine ? "is-mine" : "") + (notice ? " is-notice" : "")}>
                      {notice && <div className="notice-head"><Megaphone className="h-3.5 w-3.5" />群公告</div>}
                      <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{notice && <span className="at-all">@全体成员 </span>}{m.text}</span>
                      {rc && <div className="notice-read">{rc.read}/{rc.total} 人已读</div>}
                    </div>
                    {att && <AttachmentView a={att} />}
                    <Outcome m={m} />
                  </div>
                </div>
                {systemLines(m).map((t) => <div key={t} className="chat-system">{t}</div>)}
              </div>
            );
          })}
          {typing && <div className="chat-row"><Avatar name={typing.name} color={typing.color} tag={typing.tag} /><div className="chat-col"><div className="chat-name">{typing.name}</div><div className="bubble typing" aria-label="正在输入"><i /><i /><i /></div></div></div>}
        </div>
        <form onSubmit={submit} className="chat-compose">
          <div className="sample-row" aria-label="示例消息">
            {scene.samples.map((x: string, i: number) => <button type="button" key={i} onClick={() => setText(x)} className="sample-chip">{x}</button>)}
          </div>
          <div className="compose-box">
            <textarea aria-label="输入模拟群消息" value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={1200} placeholder={`以「${persona(s.scenario, author).short}」身份发言…  Ctrl+Enter 发送`} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit(e); }} />
            <div className="compose-tools">
              <span className="flex items-center gap-2 text-muted"><Smile className="h-4 w-4" /><AtSign className="h-4 w-4" /><ImageIcon className="h-4 w-4" /></span>
              <select aria-label="模拟发送者" disabled={store.busy} value={author} onChange={(e) => { setAuthor(e.target.value); store.demoAuthor = e.target.value; }}>
                {members.map((m: any) => <option key={m} value={m}>{persona(s.scenario, m).name} · {senderRole(s, m).replace(/（模拟身份）/, "")}</option>)}
              </select>
              <Button type="submit" disabled={store.busy || !text.trim()}><Send className="h-4 w-4" />{store.busy ? "整理中…" : "发送"}</Button>
            </div>
          </div>
        </form>
      </GlassCard> : <GlassCard className="p-8"><EmptyState icon={Users} title="还没有关注任何群" sub="在左侧「管理关注来源」里勾选需要整理的群，或在侧栏切换场景。" /></GlassCard>}
    </div>
  );
}
