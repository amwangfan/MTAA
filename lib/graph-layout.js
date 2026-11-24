// 力导向图布局：d3-force 范式的纯 ES 实现，无运行时依赖，支持 2D/3D。
// velocity-Verlet 积分；多体斥力（软核 + 距离截断）；按权重弹簧（强度压缩到 [0.1,0.6]）；
// 向心 gentle；d3 式软碰撞（anticipated 位置、strength 0.7、2 轮迭代、按 r² 加权、速度级松弛）；
// 阻尼 velocityDecay 0.7 + 每 tick 位移上限 MAX_MOVE，避免过冲跳变；拖拽 lerp 平滑跟随。
export const DEFAULT_WIDTH = 960;
export const DEFAULT_HEIGHT = 450;
export const DEFAULT_DEPTH = 240;
export const ALPHA_MIN = 0.001;
export const ALPHA_DECAY = 0.0228;
export const ALPHA_TARGET_DRAG = 0.3;

const KIND_RADIUS = { group: 34, member: 24, segment: 18, keyword: 18, memory: 18, evidence: 18 };
const RING = { group: 0, member: 115, segment: 195, keyword: 285, memory: 245, evidence: 350 };
const OFFSET = { group: 0, member: -1.5, segment: 0.4, keyword: -0.5, memory: 2.2, evidence: 1.6 };

const IDEAL_LENGTH = 90;        // 理想长度基准；实际 = IDEAL_LENGTH / weight
const SPRING_K = 0.02;          // 弹簧强度基准；实际强度 = (0.1 + 0.5·weight)，压缩到 [0.1,0.6]
const REPULSION = 900;          // 斥力常数；f = REP·alpha/(d²+eps)，软核无硬 clamp
const REPULSION_EPS = 25;
const REPULSION_MAX_DIST = 320; // 距离截断
const CENTER = 0.0045;          // 向心 gentle
const DEFAULT_WEIGHT = 0.6;
const VELOCITY_DECAY = 0.7;     // 阻尼（保留更少速度，收敛平滑）
export const MAX_MOVE = 5;      // 每 tick 位移上限（px）
const COLLIDE_STRENGTH = 0.7;
const COLLIDE_ITERATIONS = 2;
const DRAG_LERP = 0.35;         // 被拖节点向指针平滑跟随比例

function hashUnit(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

function seedRing(nodes, width, height, is3d) {
  const counts = {}; const totals = {}; const cx = width / 2; const cy = height / 2;
  for (const n of nodes) totals[n.kind] = (totals[n.kind] || 0) + 1;
  for (const n of nodes) {
    const i = counts[n.kind] || 0; counts[n.kind] = i + 1;
    const t = (i + 0.5) / (totals[n.kind] || 1);
    const a = t * Math.PI * 2 + (OFFSET[n.kind] || 0);
    const r = RING[n.kind] !== undefined ? RING[n.kind] : 290;
    n.x = cx + Math.cos(a) * r;
    n.y = cy + Math.sin(a) * r * 0.62;
    if (is3d) n.z = Math.sin(a * 1.7) * 105; // 沿用原 3D 高度分量做种子
  }
}

/**
 * 构造力导向模拟。nodes: {id,kind,label?,status?,x?,y?,z?,r?}；links: {id,from,to,label?,weight?}
 * options: {width,height,depth,dimensions:2|3}
 */
export function createSimulation(nodes, links, options = {}) {
  const width = options.width || DEFAULT_WIDTH;
  const height = options.height || DEFAULT_HEIGHT;
  const is3d = options.dimensions === 3;
  const ns = nodes.map((n, index) => ({
    id: n.id, kind: n.kind || '', label: n.label || '', status: n.status,
    index, r: Number.isFinite(n.r) ? n.r : (KIND_RADIUS[n.kind] || 18),
    x: Number.isFinite(n.x) ? n.x : NaN, y: Number.isFinite(n.y) ? n.y : NaN,
    z: is3d ? (Number.isFinite(n.z) ? n.z : 0) : 0,
    vx: 0, vy: 0, vz: 0, fx: null, fy: null, fz: null, hash: hashUnit(String(n.id)),
  }));
  if (ns.some(n => !Number.isFinite(n.x) || !Number.isFinite(n.y))) seedRing(ns, width, height, is3d);
  const byId = new Map(ns.map(n => [n.id, n]));
  const ls = links.map(l => {
    const source = byId.get(l.from); const target = byId.get(l.to);
    const weight = Number.isFinite(l.weight) && l.weight > 0 ? l.weight : DEFAULT_WEIGHT;
    return { id: l.id, label: l.label, from: l.from, to: l.to, weight, source, target };
  }).filter(l => l.source && l.target);
  const state = {
    nodes: ns, links: ls, width, height, is3d, cx: width / 2, cy: height / 2, cz: 0,
    alpha: 1, alphaTarget: 0, alphaDecay: ALPHA_DECAY, alphaMin: ALPHA_MIN, velocityDecay: VELOCITY_DECAY,
  };
  const stepFn = dt => step(state, dt);
  const sim = {
    state,
    get alpha() { return state.alpha; },
    tick(dt = 1) { advanceAlpha(state); stepFn(dt); return state.alpha; },
    // 渐升 reheat：只抬目标值，alpha 由 advanceAlpha 平滑逼近，不瞬时跳变
    reheat(target = ALPHA_TARGET_DRAG) {
      state.alphaTarget = target;
      if (state.alpha < state.alphaMin) state.alpha = state.alphaMin * 2; // 从停止处缓启动
      return state.alpha;
    },
    setDrag(id, x, y, z) {
      const n = byId.get(id); if (!n) return;
      n.fx = x; n.fy = y; if (state.is3d) n.fz = Number.isFinite(z) ? z : (n.fz ?? n.z);
      sim.reheat(ALPHA_TARGET_DRAG);
    },
    endDrag(id) {
      const n = byId.get(id); if (n) { n.fx = null; n.fy = null; n.fz = null; }
      state.alphaTarget = 0;
    },
    positions() {
      return state.nodes.map(n => ({ id: n.id, kind: n.kind, x: n.x, y: n.y, z: n.z, vx: n.vx, vy: n.vy, vz: n.vz, fx: n.fx, fy: n.fy, fz: n.fz, r: n.r }));
    },
  };
  return sim;
}

/** alpha 向 alphaTarget 平滑收敛（双向）；低于 alphaMin 且目标为 0 时停止。 */
export function advanceAlpha(state) {
  state.alpha += (state.alphaTarget - state.alpha) * state.alphaDecay;
  if (state.alphaTarget === 0 && state.alpha < state.alphaMin) state.alpha = 0;
  return state.alpha;
}

const clampMove = v => v > MAX_MOVE ? MAX_MOVE : v < -MAX_MOVE ? -MAX_MOVE : v;

/**
 * 纯力步：推进一帧。不改变 alpha（由 advanceAlpha 维护）。
 * 拖拽节点(fx/fy[/fz])向目标 lerp，不 teleport；邻居经斥力/软碰撞渐进退避。
 */
export function step(state, dt = 1) {
  const nodes = state.nodes;
  const n = nodes.length;
  const is3d = state.is3d;
  const fxs = new Float64Array(n), fys = new Float64Array(n), fzs = new Float64Array(n);
  const alpha = state.alpha;
  const cx = state.cx, cy = state.cy, cz = state.cz;

  // 向心 gentle
  if (alpha > 0) {
    for (let i = 0; i < n; i++) {
      const node = nodes[i];
      fxs[i] += (cx - node.x) * CENTER * alpha;
      fys[i] += (cy - node.y) * CENTER * alpha;
      if (is3d) fzs[i] += (cz - node.z) * CENTER * alpha;
    }
  }

  // 按权重的弹簧吸引（强度压缩到 [0.1,0.6]，给碰撞留空间）；理想长度 ∝ 1/weight
  if (alpha > 0) {
    for (const link of state.links) {
      const s = link.source, t = link.target;
      let dx = t.x - s.x, dy = t.y - s.y, dz = is3d ? t.z - s.z : 0;
      let dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 1e-6) { dx = 1e-6; dy = 0; dz = 0; dist = 1e-6; }
      const rest = IDEAL_LENGTH / Math.max(link.weight, 0.05);
      const strength = 0.1 + 0.5 * Math.min(link.weight, 1); // [0.1, 0.6]
      const f = SPRING_K * strength * (dist - rest) * alpha;
      const nx = dx / dist, ny = dy / dist, nz = dz / dist;
      fxs[s.index] += nx * f; fys[s.index] += ny * f; if (is3d) fzs[s.index] += nz * f;
      fxs[t.index] -= nx * f; fys[t.index] -= ny * f; if (is3d) fzs[t.index] -= nz * f;
    }
  }

  // 多体斥力：软核（d²+eps，无尖峰）+ 距离截断，无硬 clamp
  if (alpha > 0) {
    const maxD2 = REPULSION_MAX_DIST * REPULSION_MAX_DIST;
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y, dz = is3d ? b.z - a.z : 0;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > maxD2) continue;
        const dist = Math.sqrt(d2) || 1e-6;
        const f = REPULSION * alpha / (d2 + REPULSION_EPS);
        const nx = dx / dist, ny = dy / dist, nz = dz / dist;
        fxs[i] -= nx * f; fys[i] -= ny * f; if (is3d) fzs[i] -= nz * f;
        fxs[j] += nx * f; fys[j] += ny * f; if (is3d) fzs[j] += nz * f;
      }
    }
  }

  // 积分：先加速（拖拽节点 lerp 跟随目标）
  const decay = 1 - state.velocityDecay;
  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    if (node.fx !== null && node.fx !== undefined) {
      node.x += (node.fx - node.x) * DRAG_LERP;
      node.y += (node.fy - node.y) * DRAG_LERP;
      if (is3d) node.z += ((node.fz ?? node.z) - node.z) * DRAG_LERP;
      node.vx = 0; node.vy = 0; node.vz = 0;
      continue;
    }
    node.vx = (node.vx + fxs[i] * dt) * decay;
    node.vy = (node.vy + fys[i] * dt) * decay;
    if (is3d) node.vz = (node.vz + fzs[i] * dt) * decay;
  }

  // d3 式软碰撞：anticipated 位置、strength 0.7、2 轮迭代、按 r² 加权、速度级松弛
  for (let iter = 0; iter < COLLIDE_ITERATIONS; iter++) {
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      if (a.fx !== null && a.fx !== undefined) continue;
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        const ax = a.x + a.vx, ay = a.y + a.vy, az = is3d ? a.z + a.vz : 0;
        const bx = b.x + b.vx, by = b.y + b.vy, bz = is3d ? b.z + b.vz : 0;
        let dx = bx - ax, dy = by - ay, dz = bz - az;
        let dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const minDist = a.r + b.r + 2;
        if (dist >= minDist) continue;
        if (dist < 1e-6) { dx = (i % 2 ? 1 : -1); dy = 0; dz = 0; dist = 1; }
        const overlap = (minDist - dist) * COLLIDE_STRENGTH;
        const nx = dx / dist, ny = dy / dist, nz = dz / dist;
        // 按 r² 加权分配（大节点动得少）；被拖节点视为不动
        const bFixed = b.fx !== null && b.fx !== undefined;
        const wa = bFixed ? 1 : b.r * b.r / (a.r * a.r + b.r * b.r);
        const wb = bFixed ? 0 : 1 - wa;
        a.vx -= nx * overlap * wa; a.vy -= ny * overlap * wa; if (is3d) a.vz -= nz * overlap * wa;
        b.vx += nx * overlap * wb; b.vy += ny * overlap * wb; if (is3d) b.vz += nz * overlap * wb;
      }
    }
  }

  // 应用位移：每 tick 位移上限 MAX_MOVE，防过冲跳变
  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    if (node.fx !== null && node.fx !== undefined) continue;
    node.x += clampMove(node.vx * dt);
    node.y += clampMove(node.vy * dt);
    if (is3d) node.z += clampMove(node.vz * dt);
    // 软边界
    const minX = node.r, maxX = state.width - node.r, minY = node.r, maxY = state.height - node.r;
    if (node.x < minX) { node.x = minX; node.vx *= -0.3; }
    if (node.x > maxX) { node.x = maxX; node.vx *= -0.3; }
    if (node.y < minY) { node.y = minY; node.vy *= -0.3; }
    if (node.y > maxY) { node.y = maxY; node.vy *= -0.3; }
    if (is3d) {
      const halfDepth = DEFAULT_DEPTH;
      if (node.z < -halfDepth) { node.z = -halfDepth; node.vz *= -0.3; }
      if (node.z > halfDepth) { node.z = halfDepth; node.vz *= -0.3; }
    }
  }
  return state;
}
