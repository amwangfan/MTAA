/**
 * Canvas graph renderer + interaction layer.
 * Layout is delegated to graph-worker.js; this file owns viewport and drawing.
 *
 * whale-demo 适配：worker 创建改为可注入 factory（options.workerFactory），
 * 便于 vite-plugin-singlefile 用 ?worker&inline 内联进单文件；创建失败回退静态布局。
 * 画布配色改为暖纸主题（paper/ink/clay）。
 */

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// 暖纸画布调色板（浅色底上的可读性）
const EDGE_ACTIVE = 'rgba(188, 90, 52, .9)';      // clay-deep
const EDGE_FADED = 'rgba(110, 107, 99, .08)';     // muted
const EDGE_EXTRA = 'rgba(110, 107, 99, .25)';
const EDGE_NORMAL = 'rgba(110, 107, 99, .38)';
const HALO = 'rgba(217, 119, 87, .16)';           // clay
const NODE_STROKE = '#ffffff';
const NODE_STROKE_SELECTED = '#bc5a34';
const LABEL_INK = 'rgba(61, 61, 58, .95)';        // ink-2
const LABEL_SHADOW = 'rgba(250, 249, 245, .92)';  // paper

export class GraphEngine {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{onHover?: Function, onClick?: Function, colorOf?: Function, workerFactory?: () => Worker}} [options]
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = options;
    this.nodes = [];
    this.edges = [];
    this.byId = new Map();
    this.adj = new Map();
    this.filter = null;
    this.selectedId = null;
    this.hoverNode = null;
    this.positions = new Float32Array(0);
    this.view = { scale: 1, x: 0, y: 0 };
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.destroyed = false;
    this.pointers = new Map();
    this.drag = null;
    this.pan = null;
    this.pinch = null;
    this.down = null;
    this.worker = null;

    if (typeof Worker !== 'undefined' && options.workerFactory) {
      try {
        // worker 由宿主注入（如 Vite ?worker&inline 内联构造器）；未注入则不启用后台布局，
        // 静态初始布局仍可用。不用 new URL(import.meta.url) 默认分支，避免打包器额外出 worker chunk。
        this.worker = options.workerFactory();
        this.worker.addEventListener('message', (event) => this.onWorkerMessage(event.data));
        this.worker.addEventListener('error', () => this.onWorkerFailure());
      } catch {
        this.worker = null;
      }
    }

    this.resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => this.resize())
      : null;
    this.resizeObserver?.observe(canvas);
    this._onWindowResize = () => this.resize();
    if (!this.resizeObserver) window.addEventListener('resize', this._onWindowResize);

    this._onPointerDown = (e) => this.pointerDown(e);
    this._onPointerMove = (e) => this.pointerMove(e);
    this._onPointerUp = (e) => this.pointerUp(e);
    this._onPointerLeave = () => {
      if (!this.pointers.size) this.setHover(null, 0, 0);
    };
    this._onWheel = (e) => this.wheel(e);
    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._onPointerUp);
    canvas.addEventListener('pointercancel', this._onPointerUp);
    canvas.addEventListener('pointerleave', this._onPointerLeave);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.preventContextMenu);
    this.resize();
  }

  preventContextMenu(e) { e.preventDefault(); }

  resize() {
    if (this.destroyed) return;
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.draw();
  }

  /** @param {any[]} nodes @param {any[]} edges */
  setData(nodes, edges) {
    const previous = this.byId;
    this.byId = new Map();
    this.adj = new Map();
    this.nodes = (nodes || []).map((raw, i) => {
      const old = previous.get(raw.id);
      const angle = i * 2.399963229728653;
      const radius = 24 + Math.sqrt(i) * 13;
      const node = {
        ...raw,
        x: old?.x ?? Math.cos(angle) * radius,
        y: old?.y ?? Math.sin(angle) * radius,
        radius: raw.type === 'evidence' ? 4 : raw.type === 'space' ? 11 : raw.type === 'person' ? 8 : 6 + (raw.importance || 0.4) * 6,
      };
      this.byId.set(node.id, node);
      return node;
    });

    this.edges = [];
    for (const raw of edges || []) {
      const source = this.byId.get(raw.source ?? raw.src);
      const target = this.byId.get(raw.target ?? raw.dst);
      if (!source || !target || source === target) continue;
      const edge = { ...raw, source, target, weight: Number(raw.weight ?? 0.5) };
      this.edges.push(edge);
      if (!this.adj.has(source.id)) this.adj.set(source.id, new Set());
      if (!this.adj.has(target.id)) this.adj.set(target.id, new Set());
      this.adj.get(source.id).add(target.id);
      this.adj.get(target.id).add(source.id);
    }

    this.positions = new Float32Array(this.nodes.length * 2);
    this.nodes.forEach((n, i) => {
      this.positions[i * 2] = n.x;
      this.positions[i * 2 + 1] = n.y;
    });

    if (this.worker) {
      this.worker.postMessage({
        type: 'init',
        nodes: this.nodes.map((n) => ({ id: n.id, type: n.type, radius: n.radius, x: n.x, y: n.y })),
        edges: this.edges.map((e) => ({
          source: this.nodes.indexOf(e.source),
          target: this.nodes.indexOf(e.target),
          weight: e.weight,
        })),
      });
    }
    this.draw();
  }

  onWorkerMessage(message) {
    if (this.destroyed || message?.type !== 'positions') return;
    const positions = message.positions;
    if (!positions || positions.length !== this.nodes.length * 2) return;
    this.positions = positions;
    for (let i = 0; i < this.nodes.length; i++) {
      this.nodes[i].x = positions[i * 2];
      this.nodes[i].y = positions[i * 2 + 1];
    }
    this.draw();
  }

  onWorkerFailure() {
    this.worker?.terminate();
    this.worker = null;
    // The static initial positions remain usable when module workers are unavailable.
    this.draw();
  }

  /** @param {((node: any) => boolean)|null} predicate */
  setFilter(predicate) {
    this.filter = predicate;
    this.draw();
  }

  /** @param {string|null} id */
  select(id) {
    this.selectedId = id || null;
    this.draw();
  }

  /** @param {string} id */
  focus(id) {
    const node = this.byId.get(id);
    if (!node) return;
    this.view.scale = Math.max(this.view.scale, 1.15);
    this.view.x = -node.x * this.view.scale;
    this.view.y = -node.y * this.view.scale;
    this.selectedId = id;
    this.draw();
  }

  fit() {
    if (!this.nodes.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of this.nodes) {
      minX = Math.min(minX, n.x - n.radius);
      minY = Math.min(minY, n.y - n.radius);
      maxX = Math.max(maxX, n.x + n.radius);
      maxY = Math.max(maxY, n.y + n.radius);
    }
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const scale = clamp(Math.min((this.width - 90) / spanX, (this.height - 90) / spanY), 0.18, 2);
    this.view.scale = scale;
    this.view.x = -((minX + maxX) / 2) * scale;
    this.view.y = -((minY + maxY) / 2) * scale;
    this.draw();
  }

  zoomBy(factor) {
    const x = this.width / 2;
    const y = this.height / 2;
    this.zoomAt(factor, x, y);
  }

  zoomAt(factor, sx, sy) {
    const worldX = (sx - this.width / 2 - this.view.x) / this.view.scale;
    const worldY = (sy - this.height / 2 - this.view.y) / this.view.scale;
    const scale = clamp(this.view.scale * factor, 0.16, 4);
    this.view.scale = scale;
    this.view.x = sx - this.width / 2 - worldX * scale;
    this.view.y = sy - this.height / 2 - worldY * scale;
    this.draw();
  }

  visible(node) {
    return !this.filter || this.filter(node);
  }

  screenPoint(node) {
    return {
      x: this.width / 2 + this.view.x + node.x * this.view.scale,
      y: this.height / 2 + this.view.y + node.y * this.view.scale,
    };
  }

  hitTest(x, y) {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];
      if (!this.visible(node)) continue;
      const p = this.screenPoint(node);
      const r = Math.max(8, node.radius * this.view.scale + 4);
      const dx = x - p.x, dy = y - p.y;
      if (dx * dx + dy * dy <= r * r) return node;
    }
    return null;
  }

  localPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  pair() {
    const points = [...this.pointers.values()];
    if (points.length < 2) return null;
    const a = points[0], b = points[1];
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
    };
  }

  pointerDown(e) {
    if (e.button != null && e.button !== 0) return;
    const p = this.localPoint(e);
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, p);

    if (this.pointers.size >= 2) {
      if (this.drag) this.worker?.postMessage({ type: 'release', id: this.drag.id });
      this.drag = null;
      this.pan = null;
      const pair = this.pair();
      this.pinch = pair ? {
        ...pair,
        scale: this.view.scale,
        worldX: (pair.x - this.width / 2 - this.view.x) / this.view.scale,
        worldY: (pair.y - this.height / 2 - this.view.y) / this.view.scale,
      } : null;
      this.down = null;
      return;
    }

    const hit = this.hitTest(p.x, p.y);
    this.down = { id: e.pointerId, x: p.x, y: p.y, moved: 0, hit };
    if (hit) {
      this.drag = hit;
      this.worker?.postMessage({
        type: 'pin',
        id: hit.id,
        x: (p.x - this.width / 2 - this.view.x) / this.view.scale,
        y: (p.y - this.height / 2 - this.view.y) / this.view.scale,
      });
    } else {
      this.pan = { last: p };
    }
  }

  pointerMove(e) {
    const p = this.localPoint(e);
    const previous = this.pointers.get(e.pointerId);
    if (previous) this.pointers.set(e.pointerId, p);

    if (this.pinch && this.pointers.size >= 2) {
      const pair = this.pair();
      if (!pair) return;
      const scale = clamp(this.pinch.scale * pair.distance / this.pinch.distance, 0.16, 4);
      this.view.scale = scale;
      this.view.x = pair.x - this.width / 2 - this.pinch.worldX * scale;
      this.view.y = pair.y - this.height / 2 - this.pinch.worldY * scale;
      this.draw();
      return;
    }

    if (previous && this.drag) {
      if (this.down) this.down.moved += Math.abs(p.x - previous.x) + Math.abs(p.y - previous.y);
      this.worker?.postMessage({
        type: 'pin',
        id: this.drag.id,
        x: (p.x - this.width / 2 - this.view.x) / this.view.scale,
        y: (p.y - this.height / 2 - this.view.y) / this.view.scale,
      });
      return;
    }

    if (previous && this.pan) {
      if (this.down) this.down.moved += Math.abs(p.x - previous.x) + Math.abs(p.y - previous.y);
      this.view.x += p.x - this.pan.last.x;
      this.view.y += p.y - this.pan.last.y;
      this.pan.last = p;
      this.draw();
      return;
    }

    const hit = this.hitTest(p.x, p.y);
    if (hit?.id !== this.hoverNode?.id) {
      this.hoverNode = hit;
      this.options.onHover?.(hit, p.x, p.y);
      this.draw();
    }
    this.canvas.style.cursor = hit ? 'pointer' : 'grab';
  }

  pointerUp(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    const dragged = this.drag;
    if (dragged) this.worker?.postMessage({ type: 'release', id: dragged.id });

    const shouldClick = this.down && this.down.id === e.pointerId && this.down.moved < 5 && this.pointers.size === 0;
    const clickedNode = shouldClick ? this.down.hit : null;

    this.drag = null;
    this.pan = null;
    this.pinch = null;
    if (this.pointers.size === 1) {
      const remaining = [...this.pointers.values()][0];
      this.pan = { last: remaining };
    }
    if (!this.pointers.size) this.down = null;

    if (shouldClick) {
      this.options.onClick?.(clickedNode || null);
      if (clickedNode) {
        this.hoverNode = clickedNode;
        this.options.onHover?.(clickedNode, this.screenPoint(clickedNode).x, this.screenPoint(clickedNode).y);
      }
    }
    this.draw();
  }

  wheel(e) {
    e.preventDefault();
    const p = this.localPoint(e);
    this.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y);
  }

  setHover(node, x, y) {
    if (node?.id === this.hoverNode?.id) return;
    this.hoverNode = node;
    this.options.onHover?.(node, x, y);
    this.draw();
  }

  draw() {
    if (!this.ctx || this.destroyed) return;
    const ctx = this.ctx;
    const w = this.width, h = this.height;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2 + this.view.x, h / 2 + this.view.y);
    ctx.scale(this.view.scale, this.view.scale);

    const focusId = this.hoverNode?.id || this.selectedId;
    const neighbours = focusId ? (this.adj.get(focusId) || new Set()) : null;

    // Draw edges first; unrelated edges fade when a node is focused.
    for (const edge of this.edges) {
      const a = edge.source, b = edge.target;
      if (!this.visible(a) || !this.visible(b)) continue;
      const active = focusId && (a.id === focusId || b.id === focusId);
      const related = focusId && neighbours?.has(a.id) && neighbours?.has(b.id);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineWidth = active ? 1.9 : edge.extra ? 0.8 : 1;
      ctx.strokeStyle = active
        ? EDGE_ACTIVE
        : focusId && !related ? EDGE_FADED
        : edge.extra ? EDGE_EXTRA : EDGE_NORMAL;
      if (edge.extra) ctx.setLineDash([4, 4]); else ctx.setLineDash([]);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const node of this.nodes) {
      if (!this.visible(node)) continue;
      const active = node.id === focusId;
      const related = neighbours?.has(node.id);
      const dim = focusId && !active && !related;
      const color = this.options.colorOf?.(node) || node.color || fallbackColor(node.type);
      const alpha = dim ? 0.16 : 1;

      ctx.save();
      ctx.globalAlpha = alpha;
      if (active || node.id === this.selectedId) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 8, 0, Math.PI * 2);
        ctx.fillStyle = HALO;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius * 0.75, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = node.id === this.selectedId ? 2.2 : 1;
      ctx.strokeStyle = node.id === this.selectedId ? NODE_STROKE_SELECTED : NODE_STROKE;
      ctx.stroke();

      const showLabel = active || node.id === this.selectedId || this.view.scale > 0.92 || (node.importance || 0) > 0.82;
      if (showLabel) {
        ctx.font = `${12 / this.view.scale}px "Inter", "Noto Sans SC", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = LABEL_INK;
        ctx.shadowColor = LABEL_SHADOW;
        ctx.shadowBlur = 4 / this.view.scale;
        const label = String(node.label || node.id);
        ctx.fillText(label.length > 26 ? `${label.slice(0, 25)}…` : label, node.x, node.y + node.radius + 5 / this.view.scale);
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    }

    ctx.restore();
  }

  destroy() {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    if (!this.resizeObserver) window.removeEventListener('resize', this._onWindowResize);
    this.worker?.postMessage({ type: 'stop' });
    this.worker?.terminate();
    this.worker = null;
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerup', this._onPointerUp);
    this.canvas.removeEventListener('pointercancel', this._onPointerUp);
    this.canvas.removeEventListener('pointerleave', this._onPointerLeave);
    this.canvas.removeEventListener('wheel', this._onWheel);
    this.canvas.removeEventListener('contextmenu', this.preventContextMenu);
  }
}

function fallbackColor(type) {
  let hash = 0;
  for (let i = 0; i < String(type).length; i++) hash = (hash * 31 + String(type).charCodeAt(i)) | 0;
  return `hsl(${(Math.abs(hash) * 137.508) % 360} 66% 62%)`;
}
