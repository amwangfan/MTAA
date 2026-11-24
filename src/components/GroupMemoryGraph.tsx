import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { GraphEngine } from "../../lib/graph-engine.js";
import { normalizeGraph, colorForType } from "../../lib/graph-adapter.js";
import GraphWorker from "../../lib/graph-worker.js?worker&inline";
import "../graph-canvas.css";

type GraphNode = { id: string; kind: string; label: string; status?: string; messageId?: string };
type GraphLink = { id: string; from: string; to: string; label: string; weight?: number };
export type GroupMemoryGraphHandle = { zoomIn: () => void; zoomOut: () => void; resetView: () => void };
type Props = {
  graph: { nodes: GraphNode[]; links: GraphLink[] };
  selected: string;
  onSelect: (id: string) => void;
  onOpenEvidence?: (messageId: string) => void;
  query: string;
  kind: string;
};

// 暖纸节点色（与图例 .group-memory-dot 一致）
const KIND_COLORS: Record<string, string> = {
  group: "#bc5a34", member: "#5d7351", segment: "#8a6a9a",
  keyword: "#c99a3a", memory: "#4c6a7a", evidence: "#a67c64",
};
const short = (s: string, n = 22) => s.length > n ? `${s.slice(0, n)}…` : s;
const KIND_LABEL: Record<string, string> = { group: "群空间", member: "成员", segment: "对话段", keyword: "关键词", memory: "记忆", evidence: "原话证据" };

const GroupMemoryGraph = forwardRef<GroupMemoryGraphHandle, Props>(function GroupMemoryGraph({ graph, selected, onSelect, onOpenEvidence, query, kind }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<any>(null);
  const [tooltip, setTooltip] = useState<{ label: string; kind: string; x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(false);

  // groupMemoryGraph → explorer 数据模型 → normalizeGraph
  const data = useMemo(() => normalizeGraph({
    nodes: graph.nodes.map(n => ({
      id: n.id, label: n.label, type: n.kind, status: n.status,
      description: n.label,
      importance: n.kind === "group" ? 0.9 : n.kind === "memory" ? 0.7 : 0.45,
      raw: n,
    })),
    edges: graph.links.map(l => ({ id: l.id, source: l.from, target: l.to, relation: l.label, weight: l.weight ?? 0.6 })),
  }), [graph]);

  // 搜索/类型过滤：命中节点保留其一跳邻居，证据链可读
  const filterIds = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!kind && !q) return null;
    const matched = new Set(data.nodes.filter(n => (!kind || n.type === kind) && (!q || n.label.toLocaleLowerCase().includes(q))).map(n => n.id));
    if (q) for (const e of data.edges) if (matched.has(e.source) || matched.has(e.target)) { matched.add(e.source); matched.add(e.target); }
    return matched;
  }, [data, kind, query]);

  useImperativeHandle(ref, () => ({
    zoomIn: () => engineRef.current?.zoomBy(1.2),
    zoomOut: () => engineRef.current?.zoomBy(0.82),
    resetView: () => engineRef.current?.fit(),
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new GraphEngine(canvas, {
      workerFactory: () => new GraphWorker(), // ?worker&inline：单文件构建内可用
      colorOf: (n: any) => KIND_COLORS[n.type] || colorForType(n.type),
      onHover: (node: any, x: number, y: number) => {
        setTooltip(node ? { label: node.label, kind: KIND_LABEL[node.type] || node.type, x, y } : null);
      },
      onClick: (node: any) => {
        if (!node) { onSelect(""); return; }
        onSelect(node.id);
        const raw = node.raw;
        if (node.type === "evidence" && raw?.messageId && onOpenEvidence) onOpenEvidence(raw.messageId);
      },
    });
    engineRef.current = engine;
    return () => { engine.destroy(); engineRef.current = null; };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const had = engine.nodes.length;
    engine.setData(data.nodes, data.edges);
    if (!had && data.nodes.length) requestAnimationFrame(() => engine.fit());
  }, [data]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setFilter(filterIds ? (n: any) => filterIds.has(n.id) : null);
    setEmpty(filterIds ? data.nodes.filter(n => filterIds.has(n.id)).length === 0 : false);
  }, [filterIds, data]);

  useEffect(() => { engineRef.current?.select(selected || null); }, [selected]);

  return <div className="wge-stage">
    <canvas ref={canvasRef} className="wge-canvas" role="img" aria-label={`群聊记忆图谱，${data.nodes.length} 个节点，可拖动节点、平移与缩放`} />
    {tooltip && <div className="wge-tooltip" style={{ left: Math.min(tooltip.x + 14, 340), top: Math.max(8, tooltip.y - 14) }}>
      <strong>{short(tooltip.label)}</strong><span>{tooltip.kind}</span>
    </div>}
    <span className="wge-stage-hint">拖动节点重排 · 空白平移 · 滚轮缩放</span>
    {empty && <p className="wge-empty">没有符合条件的节点</p>}
  </div>;
});
export default GroupMemoryGraph;
