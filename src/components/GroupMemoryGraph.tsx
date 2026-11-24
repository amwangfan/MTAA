import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createSimulation, rotate3D, screenDeltaToWorld3D, shouldStartDrag, ALPHA_MIN } from "../../lib/graph-layout.js";

type GraphNode = { id: string; kind: string; label: string; status?: string };
type GraphLink = { id: string; from: string; to: string; label: string; weight?: number };
export type GroupMemoryGraphHandle = { zoomIn: () => void; zoomOut: () => void; resetView: () => void };
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
const SPIN_FRICTION = 0.95;
const SPIN_MIN = 0.0002;
const DEFAULT_ROT = { x: -0.18, y: 0.25 };

const GroupMemoryGraph = forwardRef<GroupMemoryGraphHandle, Props>(function GroupMemoryGraph({ graph, selected, onSelect, query, kind, mode }, ref) {
  const [zoom, setZoom] = useState(1);
  const [reduced, setReduced] = useState(false);
  const rotation = useRef({ ...DEFAULT_ROT });
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
  // press 候选：按下只记录，不扰动布局；超过阈值才进入 dragging
  const press = useRef<{ id: string; startX: number; startY: number } | null>(null);
  const dragging = useRef<{ id: string; lastX: number; lastY: number; worldX: number; worldY: number; worldZ: number } | null>(null);
  const dragRotate = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const simRef = useRef(sim); const modeRef = useRef(mode);
  const zoomRef = useRef(zoom); const reducedRef = useRef(reduced);
  const paintRef = useRef<() => void>(() => {});
  simRef.current = sim; modeRef.current = mode; zoomRef.current = zoom; reducedRef.current = reduced;

  useImperativeHandle(ref, () => ({
    zoomIn: () => setZoom(z => Math.min(1.7, z + .2)),
    zoomOut: () => setZoom(z => Math.max(.6, z - .2)),
    resetView: () => {
      setZoom(1); rotation.current = { ...DEFAULT_ROT }; spin.current = { x: 0, y: 0 };
      paintRef.current();
    },
  }));

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
    type P = { id: string; x: number; y: number; scale: number; z: number };
    const projected: P[] = positions.map((p: any): P => {
      if (!in3d) return { id: p.id, x: p.x, y: p.y, scale: 1, z: 0 };
      const r = rotate3D(p.x - CX, p.y - CY, p.z, rx, ry);
      const scale = Math.max(.55, Math.min(1.6, 550 / (550 - r.nz)));
      return { id: p.id, x: CX + r.nx * scale, y: CY + r.ny * scale, scale, z: r.nz };
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
      if (spinning() && !dragRotate.current) {
        rotation.current = { x: Math.max(-1.2, Math.min(1.2, rotation.current.x + spin.current.x)), y: rotation.current.y + spin.current.y };
        spin.current = { x: spin.current.x * SPIN_FRICTION, y: spin.current.y * SPIN_FRICTION };
        if (!spinning()) spin.current = { x: 0, y: 0 };
      }
      const alpha = current.tick();
      paintRef.current();
      if (alpha < ALPHA_MIN && !dragging.current && !spinning()) { runningRef.current = false; rafRef.current = null; return; }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  };

  useEffect(() => {
    stopLoop();
    spin.current = { x: 0, y: 0 };
    paintRef.current();
    // 充分 settle：跑到真正平衡，避免残余张力在下次交互时爆发
    if (reducedRef.current) { for (let i = 0; i < 400; i++) sim.tick(); paintRef.current(); }
    else startLoop();
    const onVisible = () => {
      if (document.hidden) stopLoop();
      else if (!reducedRef.current) { paintRef.current(); startLoop(); }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopLoop(); document.removeEventListener("visibilitychange", onVisible); };
  }, [sim]);

  useEffect(() => { paintRef.current(); if (!reducedRef.current) startLoop(); }, [zoom]);

  const toSim2d = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const vx = (clientX - rect.left) / rect.width * VIEW_W;
    const vy = (clientY - rect.top) / rect.height * VIEW_H;
    const z = zoomRef.current;
    return { x: (vx - CX) / z + CX, y: (vy - CY) / z + CY };
  };
  const viewDelta = (dxClient: number, dyClient: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const kx = rect ? VIEW_W / rect.width : 1, ky = rect ? VIEW_H / rect.height : 1;
    return { dx: dxClient * kx, dy: dyClient * ky };
  };

  // 按下：只记录候选与准备，不调 setDrag/reheat，不扰动布局
  const onNodeDown = (event: ReactPointerEvent<SVGGElement>, id: string) => {
    event.stopPropagation();
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    spin.current = { x: 0, y: 0 };
    press.current = { id, startX: event.clientX, startY: event.clientY };
  };

  const beginDrag = (clientX: number, clientY: number) => {
    const p = press.current; const current = simRef.current;
    if (!p || !current) return;
    const n = current.state.nodes.find((nd: any) => nd.id === p.id);
    if (!n) { press.current = null; return; }
    dragging.current = { id: p.id, lastX: clientX, lastY: clientY, worldX: n.x, worldY: n.y, worldZ: n.z };
    if (modeRef.current === "3d") {
      // 首个目标=当前位置（阈值内的位移忽略），之后按增量 1:1 跟随
      current.setDrag(p.id, n.x, n.y, n.z);
    } else {
      const pt = toSim2d(clientX, clientY);
      current.setDrag(p.id, pt.x, pt.y);
      dragging.current.worldX = pt.x; dragging.current.worldY = pt.y;
    }
    if (reducedRef.current) { for (let i = 0; i < 10; i++) current.tick(); paintRef.current(); }
    else startLoop();
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = simRef.current;
    // 候选 → 阈值内不进入拖动
    if (press.current && !dragging.current) {
      if (!shouldStartDrag(event.clientX - press.current.startX, event.clientY - press.current.startY)) return;
      beginDrag(event.clientX, event.clientY);
      return;
    }
    if (dragging.current && current) {
      const d = viewDelta(event.clientX - dragging.current.lastX, event.clientY - dragging.current.lastY);
      dragging.current.lastX = event.clientX; dragging.current.lastY = event.clientY;
      if (modeRef.current === "3d") {
        // 1:1：视图位移 ÷ 节点透视 scale，再逆旋转映射到世界增量
        const { x: rx, y: ry } = rotation.current;
        const pz = rotate3D(dragging.current.worldX - CX, dragging.current.worldY - CY, dragging.current.worldZ, rx, ry).nz;
        const w = screenDeltaToWorld3D(d.dx / zoomRef.current, d.dy / zoomRef.current, pz, rx, ry);
        dragging.current.worldX += w.dx; dragging.current.worldY += w.dy; dragging.current.worldZ += w.dz;
        current.setDrag(dragging.current.id, dragging.current.worldX, dragging.current.worldY, dragging.current.worldZ);
      } else {
        dragging.current.worldX += d.dx / zoomRef.current; dragging.current.worldY += d.dy / zoomRef.current;
        current.setDrag(dragging.current.id, dragging.current.worldX, dragging.current.worldY);
      }
      if (reducedRef.current) { for (let i = 0; i < 8; i++) current.tick(); }
      paintRef.current();
      return;
    }
    if (mode !== "3d" || !dragRotate.current) return;
    const dx = event.clientX - dragRotate.current.x, dy = event.clientY - dragRotate.current.y;
    dragRotate.current = { x: event.clientX, y: event.clientY };
    rotation.current = { x: Math.max(-1.2, Math.min(1.2, rotation.current.x + dy * .007)), y: rotation.current.y + dx * .007 };
    spin.current = { x: dy * .007, y: dx * .007 };
    paintRef.current();
  };

  const onPointerUp = () => {
    if (dragging.current) {
      const id = dragging.current.id;
      dragging.current = null; press.current = null;
      simRef.current?.endDrag(id);
      if (reducedRef.current) { for (let i = 0; i < 60; i++) simRef.current?.tick(); paintRef.current(); }
      else startLoop();
      return;
    }
    if (press.current) { onSelect(press.current.id); press.current = null; } // 纯按下抬起=选择
    if (dragRotate.current) { dragRotate.current = null; if (!reducedRef.current) startLoop(); }
  };

  const selectedNode = visible.nodes.find(n => n.id === selected);

  return <div className={`group-graph group-graph-${mode}`}>
    <svg ref={svgRef} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img"
      aria-label={`${mode.toUpperCase()} 群聊记忆图谱，${visible.nodes.length} 个节点，可拖动节点重排`}
      onPointerDown={e => { if (mode === "3d" && !press.current && !dragging.current) dragRotate.current = { x: e.clientX, y: e.clientY }; }}
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
    <span className="group-graph-hint">{mode === "3d" ? "拖动节点重排 · 空白处拖动旋转（带惯性）" : "拖动节点重排 · 工具条缩放"}</span>
    {!visible.nodes.length && <p className="group-graph-empty">没有符合条件的节点</p>}
    <div className="group-graph-footer">
      <span>{visible.nodes.length} 个节点 · {visible.links.length} 条关系</span>
      {selectedNode && <span>已选：{short(selectedNode.label, 22)}</span>}
    </div>
  </div>;
});
export default GroupMemoryGraph;
