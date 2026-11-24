// 力导向图布局：d3-force 范式的纯 ES 实现，无运行时依赖。
// velocity-Verlet 积分 + 多体斥力(O(n²)) + 按权重弹簧(Hooke) + 向心 + 碰撞退避 + alpha 衰减。
// 初始位置沿用既有 ring 布局做种子（保持可识别），再松弛。
export const DEFAULT_WIDTH = 960;
export const DEFAULT_HEIGHT = 450;
export const ALPHA_MIN = 0.001;
export const ALPHA_DECAY = 0.0228;
export const ALPHA_TARGET_DRAG = 0.3;

const KIND_RADIUS = { group: 34, member: 24, segment: 18, keyword: 18, memory: 18, evidence: 18 };
const RING = { group: 0, member: 115, segment: 195, keyword: 285, memory: 245, evidence: 350 };
const OFFSET = { group: 0, member: -1.5, segment: 0.4, keyword: -0.5, memory: 2.2, evidence: 1.6 };

const IDEAL_LENGTH = 90;     // 理想长度基准；实际 = IDEAL_LENGTH / weight
const SPRING_K = 0.02;       // 弹簧强度基准，实际 ∝ weight
const REPULSION = 900;       // 多体斥力常数 / dist²
const CENTER = 0.0045;       // 向心 gentle（弱于低权重弹簧，避免把节点拉成一点）
const DEFAULT_WEIGHT = 0.6;
const VELOCITY_DECAY = 0.4;

function hashUnit(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

function seedRing(nodes, width, height) {
  const counts = {}; const totals = {}; const cx = width / 2; const cy = height / 2;
  for (const n of nodes) totals[n.kind] = (totals[n.kind] || 0) + 1;
  for (const n of nodes) {
    const i = counts[n.kind] || 0; counts[n.kind] = i + 1;
    const t = (i + 0.5) / (totals[n.kind] || 1);
    const a = t * Math.PI * 2 + (OFFSET[n.kind] || 0);
    const r = RING[n.kind] !== undefined ? RING[n.kind] : 290;
    n.x = cx + Math.cos(a) * r;
    n.y = cy + Math.sin(a) * r * 0.62;
  }
}

/**
 * 构造一个力导向模拟。nodes: {id,kind,label?,status?,x?,y?,r?}；links: {id,from,to,label?,weight?}
 * @param {Array<object>} nodes
 * @param {Array<object>} links
 * @param {{width?:number,height?:number}} [options]
 */
export function createSimulation(nodes, links, options = {}) {
  const width = options.width || DEFAULT_WIDTH;
  const height = options.height || DEFAULT_HEIGHT;
  const ns = nodes.map((n, index) => ({
    id: n.id, kind: n.kind || '', label: n.label || '', status: n.status,
    index, r: Number.isFinite(n.r) ? n.r : (KIND_RADIUS[n.kind] || 18),
    x: Number.isFinite(n.x) ? n.x : NaN, y: Number.isFinite(n.y) ? n.y : NaN,
    vx: 0, vy: 0, fx: null, fy: null, hash: hashUnit(String(n.id)),
  }));
  if (ns.some(n => !Number.isFinite(n.x) || !Number.isFinite(n.y))) seedRing(ns, width, height);
  const byId = new Map(ns.map(n => [n.id, n]));
  const ls = links.map(l => {
    const source = byId.get(l.from); const target = byId.get(l.to);
    const weight = Number.isFinite(l.weight) && l.weight > 0 ? l.weight : DEFAULT_WEIGHT;
    return { id: l.id, label: l.label, from: l.from, to: l.to, weight, source, target };
  }).filter(l => l.source && l.target);
  const state = {
    nodes: ns, links: ls, width, height, cx: width / 2, cy: height / 2,
    alpha: 1, alphaTarget: 0, alphaDecay: ALPHA_DECAY, alphaMin: ALPHA_MIN, velocityDecay: VELOCITY_DECAY,
  };
  const stepFn = dt => step(state, dt);
  const sim = {
    state,
    get alpha() { return state.alpha; },
    tick(dt = 1) { advanceAlpha(state); stepFn(dt); return state.alpha; },
    reheat(target = ALPHA_TARGET_DRAG) {
      state.alphaTarget = target;
      if (state.alpha < target) state.alpha = target;
      return state.alpha;
    },
    setDrag(id, x, y) {
      const n = byId.get(id); if (!n) return;
      n.fx = x; n.fy = y; n.x = x; n.y = y; n.vx = 0; n.vy = 0;
      state.alphaTarget = ALPHA_TARGET_DRAG; if (state.alpha < ALPHA_TARGET_DRAG) state.alpha = ALPHA_TARGET_DRAG;
    },
    endDrag(id) {
      const n = byId.get(id); if (n) { n.fx = null; n.fy = null; }
      state.alphaTarget = 0;
    },
    positions() {
      return state.nodes.map(n => ({ id: n.id, kind: n.kind, x: n.x, y: n.y, vx: n.vx, vy: n.vy, fx: n.fx, fy: n.fy, r: n.r }));
    },
  };
  return sim;
}

/** alpha 向 alphaTarget 收敛；低于 alphaMin 时停止。 */
export function advanceAlpha(state) {
  state.alpha += (state.alphaTarget - state.alpha) * state.alphaDecay;
  if (state.alpha < state.alphaMin) state.alpha = state.alphaTarget > 0 ? state.alphaTarget : 0;
  return state.alpha;
}

/**
 * 纯力步：给定 state（nodes/links/alpha/cx/cy）推进一帧。导出便于测试。
 * 不改变 alpha；alpha 由 advanceAlpha 维护。拖拽节点(fx/fy)位置锁定。
 */
export function step(state, dt = 1) {
  const nodes = state.nodes;
  const n = nodes.length;
  const fxForce = new Float64Array(n);
  const fyForce = new Float64Array(n);
  const alpha = state.alpha;
  const cx = state.cx; const cy = state.cy;

  // 向心 gentle
  if (alpha > 0) {
    for (let i = 0; i < n; i++) {
      const node = nodes[i];
      fxForce[i] += (cx - node.x) * CENTER * alpha;
      fyForce[i] += (cy - node.y) * CENTER * alpha;
    }
  }

  // 按权重的弹簧吸引 / 理想长度 ∝ 1/weight
  if (alpha > 0) {
    for (const link of state.links) {
      const s = link.source; const t = link.target;
      let dx = t.x - s.x; let dy = t.y - s.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1e-6) { dx = 1e-6; dy = 0; dist = 1e-6; }
      const rest = IDEAL_LENGTH / Math.max(link.weight, 0.05);
      const f = SPRING_K * link.weight * (dist - rest) * alpha;
      const nx = dx / dist; const ny = dy / dist;
      fxForce[s.index] += nx * f; fyForce[s.index] += ny * f;
      fxForce[t.index] -= nx * f; fyForce[t.index] -= ny * f;
    }
  }

  // 多体斥力（Coulomb / O(n²)，小图足够）
  if (alpha > 0) {
    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        let dx = b.x - a.x; let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) d2 = 1;
        const dist = Math.sqrt(d2);
        const f = Math.min(24, REPULSION * alpha / d2);
        const nx = dx / dist; const ny = dy / dist;
        fxForce[i] -= nx * f; fyForce[i] -= ny * f;
        fxForce[j] += nx * f; fyForce[j] += ny * f;
      }
    }
  }

  // 碰撞退避：不随 alpha 衰减，保证最终不重叠
  for (let i = 0; i < n; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < n; j++) {
      const b = nodes[j];
      let dx = b.x - a.x; let dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = a.r + b.r + 2;
      if (dist >= minDist) continue;
      if (dist < 1e-6) { dx = (i % 2 ? 1 : -1); dy = 0; dist = 1; }
      const overlap = minDist - dist;
      const nx = dx / dist; const ny = dy / dist;
      a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5;
      b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5;
    }
  }

  // velocity-Verlet 积分
  const decay = 1 - state.velocityDecay;
  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    if (node.fx !== null && node.fy !== null) { node.x = node.fx; node.y = node.fy; node.vx = 0; node.vy = 0; continue; }
    node.vx = (node.vx + fxForce[i] * dt) * decay;
    node.vy = (node.vy + fyForce[i] * dt) * decay;
    node.x += node.vx * dt;
    node.y += node.vy * dt;
    // 软边界：避免节点飞出画布
    const minX = node.r, maxX = state.width - node.r, minY = node.r, maxY = state.height - node.r;
    if (node.x < minX) { node.x = minX; node.vx *= -0.3; }
    if (node.x > maxX) { node.x = maxX; node.vx *= -0.3; }
    if (node.y < minY) { node.y = minY; node.vy *= -0.3; }
    if (node.y > maxY) { node.y = maxY; node.vy *= -0.3; }
  }
  return state;
}
