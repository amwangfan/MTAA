/**
 * Force simulation worker.
 * Uses a spatial grid for local repulsion/collision, edge springs and type anchors.
 * Main-thread rendering remains independent from this worker.
 */

let nodes = [];
let edges = [];
let byId = new Map();
let alpha = 0;
let running = false;
let generation = 0;
let anchorByType = new Map();

const CELL = 150;
const MAX_REPULSION_DISTANCE = 205;

/** @param {number} value @param {number} min @param {number} max */
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function buildAnchors() {
  const types = [...new Set(nodes.map((n) => n.type))].sort();
  anchorByType = new Map();
  const radius = Math.max(110, Math.sqrt(nodes.length) * 13);
  types.forEach((type, i) => {
    const angle = (i / Math.max(1, types.length)) * Math.PI * 2 - Math.PI / 2;
    anchorByType.set(type, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  });
}

function init(message) {
  generation++;
  const currentGeneration = generation;
  byId = new Map();
  nodes = (message.nodes || []).map((n, i) => {
    const angle = i * 2.399963229728653;
    const radius = 24 + Math.sqrt(i) * 13;
    const node = {
      id: n.id,
      type: n.type || 'entity',
      radius: Number.isFinite(n.radius) ? n.radius : 7,
      x: Number.isFinite(n.x) ? n.x : Math.cos(angle) * radius,
      y: Number.isFinite(n.y) ? n.y : Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      fx: null,
      fy: null,
    };
    byId.set(node.id, i);
    return node;
  });
  edges = (message.edges || []).map((e) => ({
    source: byId.get(e.source),
    target: byId.get(e.target),
    weight: clamp(Number(e.weight ?? 0.5), 0, 2),
  })).filter((e) => Number.isInteger(e.source) && Number.isInteger(e.target) && e.source !== e.target);

  buildAnchors();
  alpha = nodes.length ? 1 : 0;
  running = false;
  if (alpha > 0) start(currentGeneration);
  else sendPositions();
}

function start(token = generation) {
  if (running || !nodes.length) return;
  running = true;
  setTimeout(() => step(token), 0);
}

function step(token) {
  if (!running || token !== generation) return;
  const started = performance.now();
  tick();
  tick();
  sendPositions();
  if (alpha > 0.002 && performance.now() - started < 30) {
    setTimeout(() => step(token), 28);
  } else if (alpha > 0.002) {
    setTimeout(() => step(token), 28);
  } else {
    running = false;
  }
}

function tick() {
  if (!nodes.length) return;
  const grid = new Map();
  const cellKey = (x, y) => `${x},${y}`;

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const cx = Math.floor(n.x / CELL);
    const cy = Math.floor(n.y / CELL);
    const key = cellKey(cx, cy);
    const list = grid.get(key);
    if (list) list.push(i);
    else grid.set(key, [i]);
  }

  // Local repulsion and collision. Pair each node only once.
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    const cx = Math.floor(a.x / CELL);
    const cy = Math.floor(a.y / CELL);
    for (let ox = -2; ox <= 2; ox++) {
      for (let oy = -2; oy <= 2; oy++) {
        const list = grid.get(cellKey(cx + ox, cy + oy));
        if (!list) continue;
        for (const j of list) {
          if (j <= i) continue;
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) {
            dx = ((i * 17 + j * 13) % 11) * 0.1 + 0.1;
            dy = ((i * 7 + j * 19) % 13) * 0.1 + 0.1;
            d2 = dx * dx + dy * dy;
          }
          if (d2 > MAX_REPULSION_DISTANCE * MAX_REPULSION_DISTANCE) continue;
          const d = Math.sqrt(d2);
          const minDistance = a.radius + b.radius + 12;
          const repulsion = Math.min(2.2, 2200 / Math.max(36, d2)) * alpha;
          const fx = (dx / d) * repulsion;
          const fy = (dy / d) * repulsion;
          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;
          if (d < minDistance) {
            const push = ((minDistance - d) / d) * 0.22;
            a.vx -= dx * push;
            a.vy -= dy * push;
            b.vx += dx * push;
            b.vy += dy * push;
          }
        }
      }
    }
  }

  // Link springs.
  for (const e of edges) {
    const a = nodes[e.source];
    const b = nodes[e.target];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const desired = 138 - Math.min(48, e.weight * 22) + a.radius + b.radius;
    const force = ((d - desired) / d) * 0.018 * alpha * (0.55 + e.weight * 0.35);
    a.vx += dx * force;
    a.vy += dy * force;
    b.vx -= dx * force;
    b.vy -= dy * force;
  }

  // Type anchors keep categories visually grouped without implying semantic distance.
  for (const n of nodes) {
    if (n.fx != null && n.fy != null) {
      n.x = n.fx;
      n.y = n.fy;
      n.vx = 0;
      n.vy = 0;
      continue;
    }
    const anchor = anchorByType.get(n.type) || { x: 0, y: 0 };
    n.vx += (anchor.x - n.x) * 0.0014 * alpha - n.x * 0.00055 * alpha;
    n.vy += (anchor.y - n.y) * 0.0014 * alpha - n.y * 0.00055 * alpha;
    n.vx *= 0.82;
    n.vy *= 0.82;
    n.x += n.vx;
    n.y += n.vy;
  }

  alpha = Math.max(0, alpha * 0.985 - 0.00022);
}

function sendPositions() {
  const positions = new Float32Array(nodes.length * 2);
  for (let i = 0; i < nodes.length; i++) {
    positions[i * 2] = nodes[i].x;
    positions[i * 2 + 1] = nodes[i].y;
  }
  self.postMessage({ type: 'positions', positions, alpha }, [positions.buffer]);
}

self.onmessage = (event) => {
  const message = event.data || {};
  if (message.type === 'init') {
    init(message);
    return;
  }
  if (message.type === 'stop') {
    generation++;
    running = false;
    return;
  }
  if (message.type === 'pin' || message.type === 'release') {
    const index = byId.get(message.id);
    if (index == null) return;
    const n = nodes[index];
    if (message.type === 'pin') {
      n.fx = Number(message.x);
      n.fy = Number(message.y);
      n.x = n.fx;
      n.y = n.fy;
    } else {
      n.fx = null;
      n.fy = null;
    }
    alpha = Math.max(alpha, message.type === 'pin' ? 0.3 : 0.16);
    start();
    return;
  }
  if (message.type === 'reheat') {
    alpha = Math.max(alpha, Number(message.strength) || 0.3);
    start();
  }
};
