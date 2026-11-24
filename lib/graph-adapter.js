/**
 * Normalize Whale memory.graph, MCP Memory Server graphs, and generic graph data.
 * The adapter does not infer relationships; it only maps supplied data.
 */

/** @param {any} value */
const text = (value) => value == null ? '' : String(value).trim();

/** @param {any} n */
function normalizeNode(n) {
  const id = text(n?.id ?? n?.name);
  if (!id) return null;
  const observations = Array.isArray(n.observations)
    ? n.observations.map(text).filter(Boolean)
    : n.observations == null ? [] : [text(n.observations)].filter(Boolean);
  const type = text(n.category ?? n.kind ?? n.entityType ?? n.entity_type ?? n.type) || 'entity';
  const label = text(n.label ?? n.content ?? n.name ?? id);
  return {
    ...n,
    id,
    label,
    type,
    description: text(n.description ?? n.content ?? observations[0] ?? ''),
    importance: clamp(Number(n.importance ?? n.weight ?? 0.5), 0, 1),
    scope: text(n.scope),
    status: text(n.status),
    observations,
    raw: n,
  };
}

/** @param {any} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}

/**
 * @param {any} input
 * @returns {{nodes: any[], edges: any[], types: string[], totalNodes: number, totalEdges: number, truncated: boolean}}
 */
export function normalizeGraph(input) {
  if (!input) return { nodes: [], edges: [], types: [], totalNodes: 0, totalEdges: 0, truncated: false };

  /** @type {any[]} */
  let sourceNodes = [];
  /** @type {any[]} */
  let sourceEdges = [];

  if (Array.isArray(input.entities) || Array.isArray(input.relations)) {
    sourceNodes = Array.isArray(input.entities) ? input.entities.map((e) => ({
      ...e,
      id: e.name,
      label: e.name,
      type: e.entityType ?? e.entity_type ?? 'entity',
      description: (e.observations || []).join('；'),
      observations: e.observations || [],
    })) : [];
    sourceEdges = Array.isArray(input.relations) ? input.relations.map((r) => ({
      ...r,
      source: r.from ?? r.source,
      target: r.to ?? r.target,
      relation: r.relationType ?? r.relation_type ?? r.relation ?? '相关',
    })) : [];
  } else {
    sourceNodes = [
      ...(Array.isArray(input.nodes) ? input.nodes : []),
      ...(Array.isArray(input.extra_nodes) ? input.extra_nodes : []),
    ];
    sourceEdges = [
      ...(Array.isArray(input.edges) ? input.edges : []),
      ...(Array.isArray(input.extra_edges) ? input.extra_edges : []),
    ];
  }

  const nodeMap = new Map();
  for (const raw of sourceNodes) {
    const node = normalizeNode(raw);
    if (node && !nodeMap.has(node.id)) nodeMap.set(node.id, node);
  }

  /** @type {any[]} */
  const edges = [];
  const edgeKeys = new Set();
  for (const raw of sourceEdges) {
    const source = text(raw.source ?? raw.src ?? raw.from);
    const target = text(raw.target ?? raw.dst ?? raw.to);
    if (!source || !target || source === target) continue;

    // MCP relations can reference undeclared entities. Keep those endpoints visible.
    for (const id of [source, target]) {
      if (!nodeMap.has(id)) {
        nodeMap.set(id, normalizeNode({
          id,
          label: id,
          type: 'implicit',
          description: '关系中出现，但原文件未声明实体',
          observations: [],
        }));
      }
    }

    const relation = text(raw.relation ?? raw.relationType ?? raw.relation_type) || '相关';
    const id = text(raw.id) || `${source}->${target}:${relation}`;
    if (edgeKeys.has(id)) continue;
    edgeKeys.add(id);
    edges.push({
      id,
      source,
      target,
      relation,
      weight: clamp(Number(raw.weight ?? 0.5), 0, 2),
      confidence: Number.isFinite(Number(raw.confidence)) ? clamp(Number(raw.confidence), 0, 1) : null,
      extra: Boolean(raw.extra),
      raw,
    });
  }

  const nodes = [...nodeMap.values()];
  const types = [...new Set(nodes.map((n) => n.type))].sort();
  return {
    nodes,
    edges,
    types,
    totalNodes: Number(input.total ?? input.totalNodes ?? nodes.length),
    totalEdges: Number(input.totalEdges ?? edges.length),
    truncated: Boolean(input.truncated),
  };
}

/** Deterministic color for a type, used by the Canvas renderer and legend. @param {string} value */
export function colorForType(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  const hue = (Math.abs(hash) * 137.508) % 360;
  return `hsl(${hue.toFixed(1)} 68% 62%)`;
}
