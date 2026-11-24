import { useMemo, useRef, useState } from "react";
import { Minus, Plus, Scan } from "lucide-react";

type GraphNode = { id: string; kind: string; label: string; status?: string };
type GraphLink = { id: string; from: string; to: string; label: string };
type Props = {
  graph: { nodes: GraphNode[]; links: GraphLink[] };
  selected: string;
  onSelect: (id: string) => void;
  query: string;
  kind: string;
  mode: "2d" | "3d";
};

const palette: Record<string, string> = {
  group: "#bc5a34", member: "#5d7351", segment: "#8a6a9a",
  keyword: "#c99a3a", memory: "#4c6a7a", evidence: "#a67c64",
};
const short = (s: string, n = 11) => s.length > n ? `${s.slice(0, n)}…` : s;

export default function GroupMemoryGraph({ graph, selected, onSelect, query, kind, mode }: Props) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState({ x: -0.18, y: 0.25 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const matched = new Set(graph.nodes.filter(n => (!kind || n.kind === kind) && (!q || n.label.toLocaleLowerCase().includes(q))).map(n => n.id));
    // A search result retains its immediate neighbours, making the evidence chain readable.
    const ids = q ? new Set([...matched, ...graph.links.filter(l => matched.has(l.from) || matched.has(l.to)).flatMap(l => [l.from, l.to])]) : matched;
    return { nodes: graph.nodes.filter(n => ids.has(n.id)), links: graph.links.filter(l => ids.has(l.from) && ids.has(l.to)) };
  }, [graph, kind, query]);
  const points = useMemo(() => {
    const counts: Record<string, number> = {};
    const totals: Record<string, number> = {};
    visible.nodes.forEach(n => { totals[n.kind] = (totals[n.kind] || 0) + 1; });
    return visible.nodes.map(n => {
      const i = counts[n.kind] || 0; counts[n.kind] = i + 1;
      const t = (i + 0.5) / (totals[n.kind] || 1);
      const rings: Record<string, number> = { group: 0, member: 115, segment: 195, keyword: 285, memory: 245, evidence: 350 };
      const offsets: Record<string, number> = { group: 0, member: -1.5, segment: 0.4, keyword: -0.5, memory: 2.2, evidence: 1.6 };
      const a = t * Math.PI * 2 + offsets[n.kind];
      const radius = rings[n.kind] ?? 290;
      let x = Math.cos(a) * radius, y = Math.sin(a) * radius * 0.62, z = Math.sin(a * 1.7) * 105;
      let scale = 1;
      if (mode === "3d") {
        const cy = Math.cos(rotation.y), sy = Math.sin(rotation.y), cx = Math.cos(rotation.x), sx = Math.sin(rotation.x);
        const nx = x * cy + z * sy, nz = z * cy - x * sy;
        const ny = y * cx - nz * sx; z = y * sx + nz * cx; x = nx; y = ny;
        scale = 550 / (550 - z);
      }
      return { ...n, x: 480 + x * scale, y: 225 + y * scale, z, scale };
    });
  }, [visible.nodes, mode, rotation]);
  const byId = new Map(points.map(n => [n.id, n]));
  const selectedNode = byId.get(selected);
  return <div className={`group-graph group-graph-${mode}`}>
    <div className="group-graph-controls" aria-label="图谱缩放">
      <button aria-label="放大图谱" onClick={() => setZoom(z => Math.min(1.7, z + .2))}><Plus size={16}/></button>
      <button aria-label="缩小图谱" onClick={() => setZoom(z => Math.max(.6, z - .2))}><Minus size={16}/></button>
      <button aria-label="适应画面" onClick={() => { setZoom(1); setRotation({ x: -.18, y: .25 }); }}><Scan size={16}/></button>
    </div>
    <svg viewBox="0 0 960 450" role="img" aria-label={`${mode.toUpperCase()} 群聊记忆图谱，${points.length} 个节点`} onPointerDown={e => { if (mode === "3d") drag.current = { x: e.clientX, y: e.clientY }; }} onPointerMove={e => { if (!drag.current || mode !== "3d") return; const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y; drag.current = { x: e.clientX, y: e.clientY }; setRotation(r => ({ x: Math.max(-1.2, Math.min(1.2, r.x + dy * .007)), y: r.y + dx * .007 })); }} onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}>
      <g transform={`translate(480 225) scale(${zoom}) translate(-480 -225)`}>
        {visible.links.map(l => { const a = byId.get(l.from), b = byId.get(l.to); return a && b ? <line key={l.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={selected && (l.from === selected || l.to === selected) ? "group-graph-link is-related" : "group-graph-link"} /> : null; })}
        {[...points].sort((a,b) => a.z - b.z).map(n => <g key={n.id} transform={`translate(${n.x} ${n.y}) scale(${Math.max(.75,Math.min(1.25,n.scale))})`} className="group-graph-node" role="button" tabIndex={0} aria-label={`查看${n.label}`} onClick={() => onSelect(n.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onSelect(n.id); }}>
          <circle r={n.kind === "group" ? 34 : n.kind === "member" ? 24 : 18} fill={palette[n.kind] || "#888"} stroke={selected === n.id ? "#262624" : "#fff"} strokeWidth={selected === n.id ? 4 : 2.5} />
          <text y={n.kind === "group" ? 51 : 36} textAnchor="middle" className="group-graph-label">{short(n.label, n.kind === "memory" ? 14 : 10)}</text>
          {n.status && n.status !== "active" && <circle cx="15" cy="-15" r="5" fill={n.status === "revoked" ? "#a87171" : "#c99a3a"} stroke="#fff" strokeWidth="2"/>}
        </g>)}
      </g>
    </svg>
    {mode === "3d" && <span className="group-graph-hint">拖动旋转 · 节点远近按透视显示</span>}
    {!points.length && <p className="group-graph-empty">没有符合条件的节点</p>}
    <div className="group-graph-footer"><span>{points.length} 个节点 · {visible.links.length} 条关系</span>{selectedNode && <span>已选：{short(selectedNode.label, 22)}</span>}</div>
  </div>;
}
