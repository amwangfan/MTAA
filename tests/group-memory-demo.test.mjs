import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentGroupMemories, freshGroupDemo, groupMemberPortrait, groupMemoryGraph, refreshGroupDemo, segmentGroupMessages, stageGroupMessage } from '../lib/group-memory-demo.js';

test('manual group refresh forms evidence-backed memories once', () => {
  const fresh = freshGroupDemo();
  const segments = segmentGroupMessages(fresh.messages);
  assert.equal(segments.length, 2);
  assert(segments[0].keywords.includes('眼镜原型'));
  const filled = refreshGroupDemo(fresh);
  assert.equal(filled.lastRefresh.processed, 4);
  assert.equal(currentGroupMemories(filled).length, 2);
  assert.equal(filled.memories.find(m => m.id === 'member-preference').evidence, 'g2');
  const again = refreshGroupDemo(filled);
  assert.equal(again.lastRefresh.processed, 0);
  assert.deepEqual(again.memories, filled.memories);
});

test('group graph keeps members, topics and message evidence connected', () => {
  const filled = refreshGroupDemo(freshGroupDemo());
  const graph = groupMemoryGraph(filled);
  assert(graph.nodes.some(n => n.id === 'member:小禾'));
  assert(graph.nodes.some(n => n.id === 'keyword:眼镜原型'));
  assert(graph.nodes.some(n => n.id === 'source-g2' && n.kind === 'evidence'));
  assert(graph.links.some(l => l.from === 'memory:member-preference' && l.to === 'source-g2'));
  const portrait = groupMemberPortrait(filled, '小禾');
  assert.equal(portrait.messages.length, 2);
  assert.deepEqual(portrait.preferences.map(p => p.id), ['member-preference']);
  assert(portrait.topics.includes('图示'));
});

test('correction and revocation leave evidence but remove old meeting from current use', () => {
  const initial = refreshGroupDemo(freshGroupDemo());
  const corrected = refreshGroupDemo(stageGroupMessage(initial, 'correction'));
  assert.equal(corrected.memories.find(m => m.id === 'meeting-v1').status, 'superseded');
  assert.equal(corrected.memories.find(m => m.id === 'meeting-v2').previous, 'meeting-v1');
  assert.deepEqual(currentGroupMemories(corrected).filter(m => m.slot === 'meeting').map(m => m.id), ['meeting-v2']);
  const revoked = refreshGroupDemo(stageGroupMessage(corrected, 'revoke'));
  assert.equal(revoked.memories.find(m => m.id === 'meeting-v2').status, 'revoked');
  assert.equal(currentGroupMemories(revoked).some(m => m.slot === 'meeting'), false);
  assert.equal(currentGroupMemories(revoked).some(m => m.slot === 'preference'), true);
  assert.equal(refreshGroupDemo(revoked).lastRefresh.processed, 0);
});
