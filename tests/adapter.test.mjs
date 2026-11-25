import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGraph, colorForType } from '../lib/graph-adapter.js';

test('normalizes Whale memory.graph including source nodes and edges', () => {
  const graph = normalizeGraph({
    nodes: [{ id: 'm1', kind: 'fact', content: '用户喜欢做项目', importance: 0.8 }],
    edges: [{ src: 'm1', dst: 'm2', relation: 'related', weight: 0.7 }],
    extra_nodes: [{ id: 'e1', label: '证据 1', category: 'evidence', evidence_id: 'msg:1' }],
    extra_edges: [{ src: 'm1', dst: 'e1', relation: '依据', extra: true }],
  });
  assert.equal(graph.nodes.length, 3);
  assert.equal(graph.edges.length, 2);
  assert.equal(graph.nodes.find(n => n.id === 'm1').type, 'fact');
  assert.equal(graph.nodes.find(n => n.id === 'e1').type, 'evidence');
  assert.equal(graph.edges.find(e => e.target === 'e1').relation, '依据');
});

test('normalizes MCP entities and relations and creates implicit endpoints', () => {
  const graph = normalizeGraph({
    entities: [
      { name: 'Whale-Core', entityType: 'project', observations: ['Agent 核心'] },
      { name: 'TypeScript', entityType: 'technology', observations: [] },
    ],
    relations: [
      { from: 'Whale-Core', to: 'TypeScript', relationType: '使用' },
      { from: 'Whale-Core', to: 'Preact', relationType: '使用' },
    ],
  });
  assert.equal(graph.nodes.length, 3);
  assert.equal(graph.edges.length, 2);
  assert.equal(graph.nodes.find(n => n.id === 'Preact').type, 'implicit');
});

test('normalizes generic source/target edges', () => {
  const graph = normalizeGraph({
    nodes: [{ id: 'a', label: 'A', type: 'person' }, { id: 'b', label: 'B', type: 'project' }],
    edges: [{ source: 'a', target: 'b', relation: 'works on', confidence: 0.9 }],
  });
  assert.equal(graph.edges[0].confidence, 0.9);
  assert.deepEqual(graph.types, ['person', 'project']);
});

// whale-demo 侧映射：groupMemoryGraph 的 nodes/links → normalizeGraph
test('group memory graph maps into adapter with kind as type and edge weight kept', () => {
  const graph = normalizeGraph({
    nodes: [
      { id: 'group', label: '鲸彩创新项目组', type: 'group', status: '', importance: 0.9 },
      { id: 'member:小禾', label: '小禾', type: 'member', status: '', importance: 0.45 },
      { id: 'memory:m1', label: '项目讨论改到周三', type: 'memory', status: 'active', importance: 0.7 },
    ],
    edges: [
      { id: 'e1', source: 'group', target: 'member:小禾', relation: '群成员', weight: 0.6 },
      { id: 'e2', source: 'member:小禾', target: 'memory:m1', relation: '更正为', weight: 1.0 },
    ],
  });
  assert.equal(graph.nodes.length, 3);
  assert.equal(graph.edges.length, 2);
  assert.equal(graph.nodes.find(n => n.id === 'memory:m1').status, 'active');
  assert.equal(graph.edges.find(e => e.id === 'e2').weight, 1.0);
  assert.equal(graph.edges.find(e => e.id === 'e2').relation, '更正为');
});

test('colorForType is deterministic', () => {
  assert.equal(colorForType('memory'), colorForType('memory'));
  assert.notEqual(colorForType('memory'), colorForType('member'));
});
