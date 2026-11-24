import { useMemo, useState } from "react";
import { GitBranch, RefreshCw, RotateCcw, Search } from "lucide-react";
import { currentGroupMemories, freshGroupDemo, groupMemberPortrait, groupMemoryGraph, groupSpace, refreshGroupDemo, stageGroupMessage } from "../../lib/group-memory-demo.js";
import { Badge, Button, GlassCard } from "./ui";
import GroupMemoryGraph from "./GroupMemoryGraph";

const time = (ms: number) => new Date(ms).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const statuses: Record<string, string> = { active: "当前有效", superseded: "已被更正", revoked: "已撤销" };
const kinds = [{ id: "", label: "全部节点" }, { id: "member", label: "成员" }, { id: "keyword", label: "关键词" }, { id: "memory", label: "记忆" }, { id: "evidence", label: "证据" }];

export default function GroupMemoryDemo() {
  const [data, setData] = useState<any>(freshGroupDemo);
  const [selected, setSelected] = useState("group");
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [kind, setKind] = useState("");
  const [query, setQuery] = useState("");
  const [indexMode, setIndexMode] = useState<"segments" | "members">("segments");
  const [notice, setNotice] = useState("群消息已备好；手动整合后可查看记忆与证据关系");
  const graph = useMemo(() => groupMemoryGraph(data), [data]);
  const node: any = graph.nodes.find((n: any) => n.id === selected);
  const message = data.messages.find((m: any) => m.id === node?.messageId);
  const memory = data.memories.find((m: any) => m.id === node?.memoryId);
  const segment: any = graph.segments.find((s: any) => s.id === node?.segmentId);
  const portrait = node?.author ? groupMemberPortrait(data, node.author) : null;
  const keywordSegments: any[] = node?.keyword ? graph.segments.filter((s: any) => s.keywords.includes(node.keyword)) : [];
  const current = currentGroupMemories(data);
  const pending = data.messages.filter((m: any) => !data.processed.includes(m.id)).length;
  const old = data.memories.find((m: any) => m.id === "meeting-v1");
  const newer = data.memories.find((m: any) => m.id === "meeting-v2");
  const canCorrect = old?.status === "active" && !data.messages.some((m: any) => m.id === "g5");
  const canRevoke = newer?.status === "active" && !data.messages.some((m: any) => m.id === "g6");
  const evidence = (id: string, label = "查看原话") => <button className="group-memory-link" onClick={() => setSelected(`source-${id}`)}>{label} →</button>;
  function refresh() {
    const next = refreshGroupDemo(data);
    setData(next);
    setNotice(next.lastRefresh.processed ? `已整合 ${next.lastRefresh.processed} 条新消息；再次刷新不会重复写入` : "没有新消息，未重复写入");
    if (selected === "group" && next.memories.length) setSelected(`memory:${next.memories[0].id}`);
  }
  function stage(change: "correction" | "revoke") {
    setData(stageGroupMessage(data, change));
    setNotice(change === "correction" ? "更正消息已进入群聊；点击「手动整合」更新事实" : "撤销消息已进入群聊；点击「手动整合」使安排失效");
  }
  return <GlassCard hover={false} className="group-memory-workspace mb-6 p-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><GitBranch className="h-5 w-5 text-clay-deep"/><h2 className="font-display text-xl font-semibold">群记忆空间</h2><Badge tone="whale">虚构数据演示</Badge></div><p className="mt-1 text-sm text-muted">从群聊到话题、成员画像和有证据的记忆</p></div>
      <Button size="sm" variant="ghost" onClick={() => { setData(freshGroupDemo()); setSelected("group"); setNotice("演示已重置"); }}><RotateCcw className="h-3 w-3"/>重置演示</Button>
    </header>
    <div className="group-memory-summary mt-5">
      <div className="group-memory-space"><span className="group-memory-icon">项</span><div><b>{groupSpace.name}</b><p>{groupSpace.description}</p></div></div>
      {[[groupSpace.members.length,"位群成员"],[data.messages.length,"条原始消息"],[graph.segments.length,"段对话"],[data.memories.length,"项记忆版本"]].map(([n,label]) => <div className="group-memory-stat" key={String(label)}><strong>{n}</strong><span>{label}</span></div>)}
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Button onClick={refresh}><RefreshCw className="h-3 w-3"/>手动整合 {pending ? `（${pending} 条）` : "（无新消息）"}</Button>
      <Button variant="ghost" disabled={!canCorrect} onClick={() => stage("correction")}>加入更正消息</Button>
      <Button variant="ghost" disabled={!canRevoke} onClick={() => stage("revoke")}>加入撤销消息</Button>
      <span role="status" className="text-xs text-muted">{notice}</span>
    </div>
    <div className="group-memory-main mt-5">
      <section className="group-memory-panel" aria-label="记忆图谱">
        <div className="group-memory-panel-head"><div><h3 className="font-display text-lg font-semibold">记忆图谱</h3><p>点开节点，沿关系查看原话和状态</p></div><div className="group-memory-mode" aria-label="图谱维度"><button aria-pressed={mode === "2d"} onClick={() => setMode("2d")}>2D</button><button aria-pressed={mode === "3d"} onClick={() => setMode("3d")}>3D</button></div></div>
        <div className="group-memory-toolbar"><label><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索人物、话题或记忆" aria-label="搜索图谱"/></label><select aria-label="节点类型" value={kind} onChange={e => setKind(e.target.value)}>{kinds.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></div>
        <GroupMemoryGraph graph={graph} selected={selected} onSelect={setSelected} query={query} kind={kind} mode={mode}/>
        <div className="group-memory-legend">{[["群空间","group"],["成员","member"],["对话段","segment"],["关键词","keyword"],["记忆","memory"],["原话证据","evidence"]].map(([label,k]) => <span key={k}><i className={`group-memory-dot ${k}`}/>{label}</span>)}</div>
      </section>
      <aside className="group-memory-panel group-memory-detail" aria-live="polite">
        <div className="group-memory-panel-head"><div><h3 className="font-display text-lg font-semibold">节点详情</h3><p>每条结论都能回到消息来源</p></div></div>
        <div className="group-memory-detail-body">
          <Badge tone={node?.kind === "memory" ? "teal" : "slate"}>{({ group:"群空间", member:"成员画像", segment:"对话段", keyword:"群聊关键词", memory:"记忆版本", evidence:"原话证据" } as any)[node?.kind || "group"]}</Badge>
          <h4 className="font-display mt-3 text-lg font-semibold">{node?.label || groupSpace.name}</h4>
          {message && <><p className="mt-3 text-sm text-muted">{message.author} · {time(message.time)}</p><blockquote className="group-memory-quote">{message.text}</blockquote><p className="mt-2 text-xs text-muted">原始群消息 · {message.id}</p></>}
          {memory && <><p className="mt-3 text-sm">{memory.kind} · <b>{statuses[memory.status]}</b></p><p className="mt-1 text-xs text-muted">主体：{memory.subject}{memory.previous ? ` · 接替 ${memory.previous}` : ""}</p><div className="mt-3 flex flex-wrap gap-3">{evidence(memory.evidence,"查看形成依据")}{memory.changedBy && evidence(memory.changedBy,"查看状态变更依据")}{memory.previous && <button className="group-memory-link" onClick={() => setSelected(`memory:${memory.previous}`)}>查看旧版本 →</button>}</div></>}
          {portrait && <><p className="mt-2 text-sm text-muted">本群 {portrait.messages.length} 条发言 · {portrait.topics.length} 个相关话题</p><div className="group-memory-tags">{portrait.topics.map((t: string) => <button key={t} onClick={() => setSelected(`keyword:${t}`)}>{t}</button>)}</div>{portrait.preferences.length ? portrait.preferences.map((p: any) => <div className="group-memory-insight" key={p.id}><b>公开自述</b><p>{p.summary}</p>{evidence(p.evidence)}</div>) : <p className="mt-3 text-sm text-muted">尚无明确偏好；讨论过的话题不会直接当作喜好</p>}{portrait.messages.slice(0,3).map((m: any) => <div className="group-memory-source" key={m.id}><span>{time(m.time)}</span><p>{m.text}</p>{evidence(m.id)}</div>)}</>}
          {segment && <><p className="mt-2 text-sm text-muted">{segment.messages.length} 条消息 · {time(segment.messages[0].time)}</p><div className="group-memory-tags">{segment.keywords.map((w: string) => <button key={w} onClick={() => setSelected(`keyword:${w}`)}>{w}</button>)}</div>{segment.messages.map((m: any) => <div className="group-memory-source" key={m.id}><b>{m.author}</b><span> · {time(m.time)}</span><p>{m.text}</p>{evidence(m.id)}</div>)}</>}
          {node?.keyword && <><p className="mt-2 text-sm text-muted">出现在 {keywordSegments.length} 段对话中</p>{keywordSegments.map(s => <div className="group-memory-insight" key={s.id}><button className="group-memory-link" onClick={() => setSelected(s.id)}>查看对话段 →</button>{s.messages.filter((m: any) => m.text.includes(node.keyword)).map((m: any) => <div key={m.id} className="mt-2 text-sm"><b>{m.author}</b>：{m.text}<div>{evidence(m.id)}</div></div>)}</div>)}</>}
          {node?.kind === "group" && <><p className="mt-2 text-sm text-muted">{groupSpace.description}</p><p className="mt-3 text-sm">群公共事实与成员自述分开保存；旧版本保留依据，但不用于当前提醒</p><div className="mt-3 flex flex-wrap gap-2">{groupSpace.members.map(author => <button key={author} className="group-memory-member" onClick={() => setSelected(`member:${author}`)}>{author}</button>)}</div></>}
        </div>
      </aside>
    </div>
    <div className="group-memory-bottom mt-5">
      <section className="group-memory-panel"><div className="group-memory-panel-head"><div><h3 className="font-display text-lg font-semibold">群聊索引</h3><p>按时间分段，关键词取自本段原话</p></div><div className="group-memory-mode"><button aria-pressed={indexMode === "segments"} onClick={() => setIndexMode("segments")}>按对话</button><button aria-pressed={indexMode === "members"} onClick={() => setIndexMode("members")}>按成员</button></div></div>
        <div className="group-memory-index">{indexMode === "segments" ? graph.segments.map((s: any,i: number) => <button key={s.id} className="group-memory-row" onClick={() => setSelected(s.id)}><span className="group-memory-row-icon">{i+1}</span><span><b>对话段 {i+1}</b><small>{s.messages.length} 条 · {time(s.messages[0].time)}</small></span><span className="group-memory-row-tags">{s.keywords.slice(0,3).join(" · ")}</span></button>) : groupSpace.members.map(author => { const p = groupMemberPortrait(data,author); return <button key={author} className="group-memory-row" onClick={() => setSelected(`member:${author}`)}><span className="group-memory-row-icon">{author.slice(0,1)}</span><span><b>{author}</b><small>{p.messages.length} 条公开发言</small></span><span className="group-memory-row-tags">{p.topics.slice(0,3).join(" · ")}</span></button>; })}</div>
      </section>
      <section className="group-memory-panel"><div className="group-memory-panel-head"><div><h3 className="font-display text-lg font-semibold">当前可用结论</h3><p>更正和撤销不会擦掉历史依据</p></div></div><div className="group-memory-index">{current.length ? current.map((m: any) => <button key={m.id} className="group-memory-row" onClick={() => setSelected(`memory:${m.id}`)}><span className="group-memory-row-icon">✓</span><span><b>{m.summary}</b><small>{m.kind} · 当前有效</small></span></button>) : <p className="p-4 text-sm text-muted">暂无有效结论。先整合群消息，或查看已撤销的历史版本</p>}</div><div className="group-memory-decision">{current.some((m: any) => m.slot === "meeting") ? "当前项目讨论可用于提醒" : data.memories.some((m: any) => m.slot === "meeting") ? "讨论已撤销，旧安排不会继续触发提醒" : "讨论安排尚未整合，暂不触发提醒"}</div></section>
    </div>
  </GlassCard>;
}
