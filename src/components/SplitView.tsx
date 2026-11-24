import { useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, Check, Trash2 } from "lucide-react";
import { store, act } from "../store";
import { recall } from "../../lib/memory.js";
import { fmt, scName, BADGE } from "../fmt";
import { GlassCard, Button } from "./ui";
import SplitRight from "./SplitRight";

const esc = (v: string) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export default function SplitView({ target, onBack, now, gotoSource }: { target: any; onBack: () => void; now: number; gotoSource: () => void }) {
  const s = store.states[target.scene];
  const isSug = target.type === "suggestion";
  const sug = isSug ? (s.suggestions || []).find((x: any) => x.id === target.id) : null;
  const t = isSug ? (sug?.taskId ? s.tasks.find((x: any) => x.id === sug.taskId) : null) : s.tasks.find((x: any) => x.id === target.id);
  const obj = isSug ? sug : t;
  const wrapRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState("");

  const ev = isSug ? (sug?.evidence || []) : (t?.evidence || (t?.sources || []).map((id: string) => ({ messageId: id, quote: (s.messages.find((m: any) => m.id === id) || {}).text || "" })));
  const evidenceIds = [...new Set(ev.map((e: any) => e.messageId))].filter((id) => s.messages.some((m: any) => m.id === id));
  const quotesByMsg: any = {}; ev.forEach((e: any) => { (quotesByMsg[e.messageId] = quotesByMsg[e.messageId] || []).push(e.quote); });
  const relMem = obj ? recall(s, obj.title, now, { limit: 3 }) : [];

  const draw = () => {
    const wrap = wrapRef.current, left = leftRef.current; if (!wrap || !left) return;
    if (window.innerWidth < 900) { setSvg(""); return; }
    const wr = wrap.getBoundingClientRect(); let paths = "";
    left.querySelectorAll("[data-ev-idx]").forEach((L: any) => {
      const idx = L.dataset.evIdx; if (idx < 0) return;
      const R = wrap.querySelector(`#split-right .ev-item[data-ev-idx="${idx}"]`); if (!R) return;
      const lr = L.getBoundingClientRect(), rr = (R as any).getBoundingClientRect();
      const x1 = lr.right - wr.left, y1 = lr.top - wr.top + lr.height / 2, x2 = rr.left - wr.left, y2 = rr.top - wr.top + rr.height / 2; const mx = (x1 + x2) / 2;
      paths += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="#bc5a34" stroke-width="1.6" stroke-dasharray="5 4" opacity="0.55" class="ev-link"/>`;
    });
    setSvg(paths);
  };
  useLayoutEffect(() => { draw(); const l = leftRef.current; l?.addEventListener("scroll", draw); window.addEventListener("resize", draw); l?.querySelector(".evidence-msg")?.scrollIntoView({ block: "center" }); return () => { l?.removeEventListener("scroll", draw); window.removeEventListener("resize", draw); }; });

  if (!obj) return <GlassCard className="p-6">事项不存在。<Button onClick={onBack} className="ml-3">返回</Button></GlassCard>;
  const terminal = t && ["done", "cancelled"].includes(t.status);

  return (
    <div data-demo="evidence" ref={wrapRef} className="relative">
      <GlassCard hover={false} className="relative overflow-hidden p-4">
        <div className={`mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3 ${isSug && sug.status === "pending" ? "border-whale-200 bg-whale-50" : "border-slate-200 bg-slate-50"}`}>
          {isSug && sug.status === "pending" ? (
            <>
              <span className="text-sm font-semibold text-slate-800">这个日程要添加还是删除？</span>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => { act.addSug(s.scenario, sug.id); onBack(); }}><Check className="h-3 w-3" />添加</Button>
                <Button size="sm" variant="danger" onClick={() => { act.dismissSug(s.scenario, sug.id); onBack(); }}><Trash2 className="h-3 w-3" />删除</Button>
              </div>
            </>
          ) : (
            <>
              <span className="font-display font-semibold text-slate-900">{obj.title}</span>
              <div className="flex gap-2">
                {t && !terminal && <><Button size="sm" variant="ghost">保留</Button><Button size="sm" variant="danger" onClick={() => act.status(t.id, "cancelled")}>删除</Button></>}
                {t && terminal && <Button size="sm" variant="soft" onClick={() => act.status(t.id, t.due ? "todo" : "review")}>重新打开</Button>}
              </div>
            </>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div ref={leftRef} className="scrollbar-thin max-h-[520px] space-y-3 overflow-y-auto rounded-2xl bg-slate-50/70 p-3">
            {s.messages.map((m: any, i: number) => {
              const idx = evidenceIds.indexOf(m.id);
              let html = esc(m.text);
              (quotesByMsg[m.id] || []).forEach((q: string) => { const eq = esc(q); if (html.includes(eq)) html = html.replace(eq, `<mark class="ev-mark">${eq}</mark>`); });
              return (
                <div key={m.id}>
                  {(i === 0 || m.time - s.messages[i - 1].time >= 5 * 60000) && <div className="my-1 text-center text-[11px] text-slate-400">{fmt(m.time)}</div>}
                  <div data-ev-idx={idx} className={`flex gap-2 rounded-xl p-1 ${m.author === "我" ? "flex-row-reverse" : ""} ${idx >= 0 ? "evidence-msg" : ""}`}>
                    {idx >= 0 && <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-whale-600 text-xs text-white">{BADGE[idx]}</span>}
                    <span className={`grid h-8 w-8 flex-none place-items-center rounded-lg text-xs font-semibold ${m.author === "我" ? "bg-whale-600 text-white" : "bg-whale-100 text-whale-700"}`}>{m.author.slice(0, 1)}</span>
                    <div className={`max-w-[80%] rounded-2xl p-2.5 text-sm ${m.author === "我" ? "bg-whale-600 text-white" : "border border-slate-200 bg-white text-slate-700"}`} dangerouslySetInnerHTML={{ __html: html }} />
                  </div>
                </div>
              );
            })}
          </div>
          <SplitRight s={s} obj={obj} t={t} isSug={isSug} sug={sug} evidenceIds={evidenceIds} relMem={relMem} now={now} />
        </div>
        <svg className="pointer-events-none absolute inset-0 hidden md:block" width="100%" height="100%" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="mt-3 flex gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-3 w-3" />返回列表</Button>
          <Button variant="ghost" size="sm" onClick={gotoSource}><ExternalLink className="h-3 w-3" />查看原消息</Button>
        </div>
      </GlassCard>
    </div>
  );
}
