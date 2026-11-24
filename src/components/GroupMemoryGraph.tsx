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
const SPIN_FRICTION = 0.95;      // 旋转惯性阻尼
const SPIN_MIN = 0.0002;         // 低于该角速度视为停止
const DEFAULT_ROT = { x: -0.18, y: 0.25 };

export default function GroupMemoryGraph({ graph, selected, onSelect, query, kind, mode }: Props) {
  const [zoom, setZoom] = useState(1);
  const [reduced, setReduced] = useState(false);
  const rotation = useRef({ ...DEFAULT_ROT });   // 角度在 ref，避免每帧 React 重渲染
  const spin = useRef({ x: 0, y: 0 });

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const matched = new Set(graph.nodes.filter(n => (!kind || n.kind === kind) && (!q || n.label.toLocaleLowerCase().includes(q))).map(n => n.id));
    const ids = q ? new Set([...matched, ...graph.links.filter(l => matched.has(l.from) || matched.has(l.to)).flatMap(l => [l.from, l.to])]) : matched;
    return { nodes: graph.nodes.filter(n => ids.has(n.id)), links: graph.links.filter(l => ids.has(l.from) && ids.has(l.to)) };
  }, [graph, kind, query]);

  const is3d = mode === "3d";
  const sim = useMemo(
    () => createSimulation(visible.nodes, visible.links, { width: VIEW_W, height: VIEW_H, dimensions: is3d ? 3 : 2 }),
    [visible, is3d]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const nodeLayerRef = useRef<SVGGElement | null>(null);
  const lineEls = useRef(new Map<string, SVGLineElement>());
  const nodeEls = useRef(new Map<string, SVGGElement>());
  const dragNode = useRef<{ id: string; startX: number; startY: number; lastX: number; lastY: number; moved: boolean } | null>(null);
  const dragRotate = useRef<{ x: number; y: number; lastT: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const simRef = useRef(sim); const modeRef = useRef(mode);
  const zoomRef = useRef(zoom); const reducedRef = useRef(reduced);
  const paintRef = useRef<() => void>(() => {});
  simRef.current = sim; modeRef.current = mode; zoomRef.current = zoom; reducedRef.current = reduced;

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
    const positions: any[] = current.positions();
    const in3d = modeRef.current === "3d";
    const { x: rx, y: ry } = rotation.current;
    const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
    type P = { id: string; x: number; y: number; scale: number; z: number };
    const projected: P[] = positions.map((p: any): P => {
      if (!in3d) return { id: p.id, x: p.x, y: p.y, scale: 1, z: 0 };
      // 真 3D：旋转矩阵（Ry 后 Rx）+ 透视投影
      const X = p.x - CX, Y = p.y - CY, Z = p.z;
      const nx = X * cy + Z * sy, nzA = Z * cy - X * sy;
      const ny = Y * cx - nzA * sx, nzB = Y * sx + nzA * cx;
      const scale = Math.max(.55, Math.min(1.6, 550 / (550 - nzB)));
      return { id: p.id, x: CX + nx * scale, y: CY + ny * scale, scale, z: nzB };
    });
    const byId = new Map<string, P>(projected.map(p => [p.id, p]));
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
    if (in3d && nodeLayerRef.current) {
      [...projected].sort((a, b) => a.z - b.z).forEach(p => { const el = nodeEls.current.get(p.id); if (el) nodeLayerRef.current!.appendChild(el); });
    }
  };
  paintRef.current = paint;

  const spinning = () => Math.abs(spin.current.x) > SPIN_MIN || Math.abs(spin.current.y) > SPIN_MIN;
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
      // 旋转惯性：松手后角速度按阻尼缓停
      if (spinning() && !dragRotate.current) {
        rotation.current = { x: Math.max(-1.2, Math.min(1.2, rotation.current.x + spin.current.x)), y: rotation.current.y + spin.current.y };
        spin.current = { x: spin.current.x * SPIN_FRICTION, y: spin.current.y * SPIN_FRICTION };
        if (!spinning()) spin.current = { x: 0, y: 0 };
      }
      const alpha = current.tick();
      paintRef.current();
      if (alpha < ALPHA_MIN && !dragNode.current && !spinning()) { runningRef.current = false; rafRef.current = null; return; }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  };

  useEffect(() => {
    stopLoop();
    spin.current = { x: 0, y: 0 };
    paintRef.current();
    if (reducedRef.current) { for (let i = 0; i < 220; i++) sim.tick(); paintRef.current(); }
    else startLoop();
    const onVisible = () => {
      if (document.hidden) stopLoop();
      else if (!reducedRef.current) { paintRef.current(); startLoop(); }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopLoop(); document.removeEventListener("visibilitychange", onVisible); };
  }, [sim]);

  useEffect(() => { paintRef.current(); if (!reducedRef.current) startLoop(); }, [zoom]);

  // 指针 → 视图坐标（含 zoom）
  const toView = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left) / rect.width * VIEW_W,
      y: (clientY - rect.top) / rect.height * VIEW_H,
    };
  };
  const toSim2d = (clientX: number, clientY: number) => {
    const v = toView(clientX, clientY); const z = zoomRef.current;
    return { x: (v.x - CX) / z + CX, y: (v.y - CY) / z + CY };
  };
  // 3D 拖拽：视图位移经逆旋转映射回世界平面（在节点当前深度拖动）
  const dragWorldDelta = (dxView: number, dyView: number, nodeZ: number) => {
    const { x: rx, y: ry } = rotation.current;
    // 正变换 R = Rx(rx)·Ry(ry)；逆变换 = Ry(-ry)·Rx(-rx)
    let dx = dxView, dy = dyView, dz = 0;
    let cx1 = Math.cos(-rx), sx1 = Math.sin(-rx);
    let ny = dy * cx1 - dz * sx1; let nz = dy * sx1 + dz * cx1; dy = ny; dz = nz;
    let cy1 = Math.cos(-ry), sy1 = Math.sin(-ry);
    let nx = dx * cy1 + dz * sy1; nz = -dx * sy1 + dz * cy1; dx = nx; dz = nz;
    void nodeZ;
    return { dx: dx / zoomRef.current, dy: dy / zoomRef.current, dz };
  };

  const onNodeDown = (event: ReactPointerEvent<SVGGElement>, id: string) => {
    event.stopPropagation();
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    spin.current = { x: 0, y: 0 };
    dragNode.current = { id, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false };
    const current = simRef.current;
    if (!current) return;
    if (modeRef.current === "3d") {
      const n = current.state.nodes.find((nd: any) => nd.id === id);
      if (n) current.setDrag(id, n.x, n.y, n.z); // 先锁定当前位置，move 中按增量走
    } else {
      const p = toSim2d(event.clientX, event.clientY);
      current.setDrag(id, p.x, p.y);
    }
    if (reducedRef.current) { for (let i = 0; i < 10; i++) current.tick(); paintRef.current(); }
    else startLoop();
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const dragging = dragNode.current;
    if (dragging) {
      const current = simRef.current;
      if (!current) return;
      if (Math.hypot(event.clientX - dragging.startX, event.clientY - dragging.startY) > 4) dragging.moved = true;
      const rect = svgRef.current?.getBoundingClientRect();
      const kx = rect ? VIEW_W / rect.width : 1, ky = rect ? VIEW_H / rect.height : 1;
      if (modeRef.current === "3d") {
        const n = current.state.nodes.find((nd: any) => nd.id === dragging.id);
        if (n) {
          const d = dragWorldDelta((event.clientX - dragging.lastX) * kx, (event.clientY - dragging.lastY) * ky, n.z);
          current.setDrag(dragging.id, n.x + d.dx, n.y + d.dy, n.z + d.dz);
        }
      } else {
        const p = toSim2d(event.clientX, event.clientY);
        current.setDrag(dragging.id, p.x, p.y);
      }
      dragging.lastX = event.clientX; dragging.lastY = event.clientY;
      if (reducedRef.current) { for (let i = 0; i < 8; i++) current.tick(); }
      paintRef.current();
      return;
    }
    if (mode !== "3d" || !dragRotate.current) return;
    // trackball 旋转 + 记录角速度（供惯性）
    const dx = event.clientX - dragRotate.current.x, dy = event.clientY - dragRotate.current.y;
    dragRotate.current = { x: event.clientX, y: event.clientY, lastT: performance.now() };
    rotation.current = { x: Math.max(-1.2, Math.min(1.2, rotation.current.x + dy * .007)), y: rotation.current.y + dx * .007 };
    spin.current = { x: dy * .007, y: dx * .007 };
    paintRef.current();
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
    if (dragRotate.current) { dragRotate.current = null; if (!reducedRef.current) startLoop(); } // 惯性由主循环接管
  };

  const selectedNode = visible.nodes.find(n => n.id === selected);

  return <div className={`group-graph group-graph-${mode}`}>
    <div className="group-graph-controls" aria-label="图谱缩放">
      <button aria-label="放大图谱" onClick={() => setZoom(z => Math.min(1.7, z + .2))}><Plus size={16} /></button>
      <button aria-label="缩小图谱" onClick={() => setZoom(z => Math.max(.6, z - .2))}><Minus size={16} /></button>
      <button aria-label="适应画面" onClick={() => { setZoom(1); rotation.current = { ...DEFAULT_ROT }; spin.current = { x: 0, y: 0 }; paintRef.current(); }}><Scan size={16} /></button>
    </div>
    <svg ref={svgRef} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img"
      aria-label={`${mode.toUpperCase()} 群聊记忆图谱，${visible.nodes.length} 个节点，可拖动节点重排`}
      onPointerDown={e => { if (mode === "3d" && !dragNode.current) dragRotate.current = { x: e.clientX, y: e.clientY, lastT: performance.now() }; }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => { dragRotate.current = null; }}>
      <g transform={`translate(${CX} ${CY}) scale(${zoom}) translate(${-CX} ${-CY})`}>
        <g>
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
    <span className="group-graph-hint">{mode === "3d" ? "拖动节点重排 · 空白处拖动旋转（带惯性）" : "拖动节点重排 · 按钮缩放"}</span>
    {!visible.nodes.length && <p className="group-graph-empty">没有符合条件的节点</p>}
    <div className="group-graph-footer">
      <span>{visible.nodes.length} 个节点 · {visible.links.length} 条关系</span>
      {selectedNode && <span>已选：{short(selectedNode.label, 22)}</span>}
    </div>
  </div>;
}
