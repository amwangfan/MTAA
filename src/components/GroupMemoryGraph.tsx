import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Minus, Plus, Scan } from "lucide-react";
import { createSimulation, ALPHA_MIN } from "../../lib/graph-layout.js";

type GraphNode = { id: string; kind: string; label: string; status?: string };
type GraphLink = { id: string; from: string; to: string; label: string; weight?: number };
type Props = {
  graph: { nodes: GraphNode[]; links: GraphLink[] };
  selected: string;
  onSelect: (id: string) => void;
  query: string;
  kind: string;
  mode: "2d" | "3d";
};

const palettes: Record<string, string> = {
  group: "#bc5a34", member: "#5d7351", segment: "#8a6a9a",
  keyword: "#c99a3a", memory: "#4c6a7a", evidence: "#a67c64",
};
const short = (s: string, n = 11) => s.length > n ? `${s.slice(0, n)}…` : s;
const VIEW_W = 960, VIEW_H = 450, CX = VIEW_W / 2, CY = VIEW_H / 2;
const hashZ = (id: string) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
};

export default function GroupMemoryGraph({ graph, selected, onSelect, query, kind, mode }: Props) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState({ x: -0.18, y: 0.25 });
  const [reduced, setReduced] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const matched = new Set(graph.nodes.filter(n => (!kind || n.kind === kind) && (!q || n.label.toLocaleLowerCase().includes(q))).map(n => n.id));
    const ids = q ? new Set([...matched, ...graph.links.filter(l => matched.has(l.from) || matched.has(l.to)).flatMap(l => [l.from, l.to])]) : matched;
    return { nodes: graph.nodes.filter(n => ids.has(n.id)), links: graph.links.filter(l => ids.has(l.from) && ids.has(l.to)) };
  }, [graph, kind, query]);

  const sim = useMemo(() => createSimulation(visible.nodes, visible.links, { width: VIEW_W, height: VIEW_H }), [visible]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const lineLayerRef = useRef<SVGGElement | null>(null);
  const nodeLayerRef = useRef<SVGGElement | null>(null);
  const lineEls = useRef(new Map<string, SVGLineElement>());
  const nodeEls = useRef(new Map<string, SVGGElement>());
  const dragNode = useRef<{ id: string; startX: number; startY: number; moved: boolean } | null>(null);
  const dragRotate = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const simRef = useRef(sim);
  const modeRef = useRef(mode);
  const rotRef = useRef(rotation);
  const zoomRef = useRef(zoom);
  const reducedRef = useRef(reduced);
  const paintRef = useRef<() => void>(() => {});
  simRef.current = sim; modeRef.current = mode; rotRef.current = rotation; zoomRef.current = zoom; reducedRef.current = reduced;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const paint = () => {
    const current = simRef.current;
    if (!current) return;
    const positions = current.positions();
    const is3d = modeRef.current === "3d";
    const { x: rx, y: ry } = rotRef.current;
    const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
    const projected = positions.map(p => {
      if (!is3d) return { id: p.id, x: p.x, y: p.y, scale: 1, z: 0 };
      const z = (hashZ(p.id) - 0.5) * 220;
      const X = p.x - CX, Y = p.y - CY;
      const nx = X * cy + z * sy, nz = z * cy - X * sy;
      const ny = Y * cx - nz * sx, nz2 = Y * sx + nz * cx;
      const scale = 550 / (550 - nz2);
      return { id: p.id, x: CX + nx * scale, y: CY + ny * scale, scale: Math.max(.75, Math.min(1.25, scale)), z: nz2 };
    });
    const byId = new Map(projected.map(p => [p.id, p]));
    for (const link of current.state.links) {
      const a = byId.get(link.from), b = byId.get(link.to);
      const el = lineEls.current.get(link.id);
      if (!el || !a || !b) continue;
      el.setAttribute("x1", a.x.toFixed(2)); el.setAttribute("y1", a.y.toFixed(2));
      el.setAttribute("x2", b.x.toFixed(2)); el.setAttribute("y2", b.y.toFixed(2));
    }
    for (const p of projected) {
      const el = nodeEls.current.get(p.id);
      if (el) el.setAttribute("transform", `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) scale(${p.scale.toFixed(3)})`);
    }
    if (is3d && nodeLayerRef.current) {
      [...projected].sort((a, b) => a.z - b.z).forEach(p => { const el = nodeEls.current.get(p.id); if (el) nodeLayerRef.current!.appendChild(el); });
    }
  };
  paintRef.current = paint;

  const stopLoop = () => {
    runningRef.current = false;
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  };
  const startLoop = () => {
    if (runningRef.current || reducedRef.current) return;
    runningRef.current = true;
    const frame = () => {
      const current = simRef.current;
      if (!current) { runningRef.current = false; rafRef.current = null; return; }
      const alpha = current.tick();
      paintRef.current();
      if (alpha < ALPHA_MIN && !dragNode.current) { runningRef.current = false; rafRef.current = null; return; }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  };

  useEffect(() => {
    stopLoop();
    paintRef.current();
    if (reducedRef.current) {
      for (let i = 0; i < 220; i++) sim.tick();
      paintRef.current();
    } else {
      startLoop();
    }
    const onVisible = () => {
      if (document.hidden) stopLoop();
      else if (!reducedRef.current) { paintRef.current(); startLoop(); }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopLoop(); document.removeEventListener("visibilitychange", onVisible); };
  }, [sim]);

  useEffect(() => { paintRef.current(); if (!reducedRef.current) startLoop(); }, [mode, rotation, zoom]);

  const toSim = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const vx = (clientX - rect.left) / rect.width * VIEW_W;
    const vy = (clientY - rect.top) / rect.height * VIEW_H;
    const z = zoomRef.current;
    return { x: (vx - CX) / z + CX, y: (vy - CY) / z + CY };
  };

  const onNodeDown = (event: ReactPointerEvent<SVGGElement>, id: string) => {
    event.stopPropagation();
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    dragNode.current = { id, startX: event.clientX, startY: event.clientY, moved: false };
    const p = toSim(event.clientX, event.clientY);
    simRef.current?.setDrag(id, p.x, p.y);
    if (reducedRef.current) { for (let i = 0; i < 10; i++) simRef.current?.tick(); paintRef.current(); }
    else startLoop();
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const dragging = dragNode.current;
    if (dragging) {
      if (Math.hypot(event.clientX - dragging.startX, event.clientY - dragging.startY) > 4) dragging.moved = true;
      const p = toSim(event.clientX, event.clientY);
      simRef.current?.setDrag(dragging.id, p.x, p.y);
      if (reducedRef.current) { for (let i = 0; i < 8; i++) simRef.current?.tick(); }
      paintRef.current();
      return;
    }
    if (mode !== "3d" || !dragRotate.current) return;
    const dx = event.clientX - dragRotate.current.x, dy = event.clientY - dragRotate.current.y;
    dragRotate.current = { x: event.clientX, y: event.clientY };
    setRotation(r => ({ x: Math.max(-1.2, Math.min(1.2, r.x + dy * .007)), y: r.y + dx * .007 }));
  };

  const onPointerUp = () => {
    const dragging = dragNode.current;
    if (dragging) {
      dragNode.current = null;
      simRef.current?.endDrag(dragging.id);
      if (reducedRef.current) { for (let i = 0; i < 60; i++) simRef.current?.tick(); paintRef.current(); }
      else startLoop();
      if (!dragging.moved) onSelect(dragging.id);
    }
    dragRotate.current = null;
  };

  const selectedNode = visible.nodes.find(n => n.id === selected);

  return <div className={`group-graph group-graph-${mode}`}>
    <div className="group-graph-controls" aria-label="图谱缩放">
      <button aria-label="放大图谱" onClick={() => setZoom(z => Math.min(1.7, z + .2))}><Plus size={16} /></button>
      <button aria-label="缩小图谱" onClick={() => setZoom(z => Math.max(.6, z - .2))}><Minus size={16} /></button>
      <button aria-label="适应画面" onClick={() => { setZoom(1); setRotation({ x: -.18, y: .25 }); }}><Scan size={16} /></button>
    </div>
    <svg ref={svgRef} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img"
      aria-label={`${mode.toUpperCase()} 群聊记忆图谱，${visible.nodes.length} 个节点，可拖动节点重排`}
      onPointerDown={e => { if (mode === "3d" && !dragNode.current) dragRotate.current = { x: e.clientX, y: e.clientY }; }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => { dragRotate.current = null; }}>
      <g transform={`translate(${CX} ${CY}) scale(${zoom}) translate(${-CX} ${-CY})`}>
        <g ref={lineLayerRef}>
          {visible.links.map(l => {
            const related = Boolean(selected) && (l.from === selected || l.to === selected);
            return <line key={l.id} ref={el => { if (el) lineEls.current.set(l.id, el); else lineEls.current.delete(l.id); }}
              className={related ? "group-graph-link is-related" : "group-graph-link"} />;
          })}
        </g>
        <g ref={nodeLayerRef}>
          {visible.nodes.map(n => {
            const kind = n.kind;
            return <g key={n.id} ref={el => { if (el) nodeEls.current.set(n.id, el); else nodeEls.current.delete(n.id); }}
              className="group-graph-node" role="button" tabIndex={0} aria-label={`查看${n.label}`}
              onPointerDown={e => onNodeDown(e, n.id)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(n.id); } }}>
              <circle r={kind === "group" ? 34 : kind === "member" ? 24 : 18} fill={palettes[kind] || "#888"}
                stroke={selected === n.id ? "#262624" : "#fff"} strokeWidth={selected === n.id ? 4 : 2.5} />
              <text y={kind === "group" ? 51 : 36} textAnchor="middle" className="group-graph-label">{short(n.label, kind === "memory" ? 14 : 10)}</text>
              {n.status && n.status !== "active" && <circle cx="15" cy="-15" r="5" fill={n.status === "revoked" ? "#a87171" : "#c99a3a"} stroke="#fff" strokeWidth="2" />}
            </g>;
          })}
        </g>
      </g>
    </svg>
    <span className="group-graph-hint">{mode === "3d" ? "拖动节点重排 · 空白处拖动旋转" : "拖动节点重排 · 按钮缩放"}</span>
    {!visible.nodes.length && <p className="group-graph-empty">没有符合条件的节点</p>}
    <div className="group-graph-footer">
      <span>{visible.nodes.length} 个节点 · {visible.links.length} 条关系</span>
      {selectedNode && <span>已选：{short(selectedNode.label, 22)}</span>}
    </div>
  </div>;
}
