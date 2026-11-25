import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentGroupMemories, freshGroupDemo, groupMemberPortrait, groupMemoryGraph, groupSpace, presetGroupDemo, refreshGroupDemo, segmentGroupMessages, stageGroupMessage } from '../lib/group-memory-demo.js';
import { groupMemoryPreset } from '../lib/whale-demo-data.js';

test('manual group refresh recognizes campus-guide discussion and flowchart preference once', () => {
  const fresh = freshGroupDemo();
  const segments = segmentGroupMessages(fresh.messages);
  assert.equal(segments.length, 2);
  assert(segments[0].keywords.includes('校园导览原型'));
  assert(segments[0].keywords.includes('流程图'));
  const filled = refreshGroupDemo(fresh);
  assert.equal(filled.lastRefresh.processed, 4);
  assert.equal(currentGroupMemories(filled).length, 2);
  assert.equal(filled.memories.find(m => m.id === 'member-preference').evidence, 'g2');
  assert.equal(filled.memories.find(m => m.id === 'meeting-v1').summary, '周五下午三点在创新工坊讨论校园导览原型');
  assert.equal(filled.memories.find(m => m.id === 'member-preference').summary, '小禾喜欢先看流程图，再讨论交互细节');
  const again = refreshGroupDemo(filled);
  assert.equal(again.lastRefresh.processed, 0);
  assert.deepEqual(again.memories, filled.memories);
});

test('group graph keeps members, topics and message evidence connected', () => {
  const filled = refreshGroupDemo(freshGroupDemo());
  const graph = groupMemoryGraph(filled);
  assert(graph.nodes.some(n => n.id === 'member:小禾'));
  assert(graph.nodes.some(n => n.id === 'keyword:校园导览原型'));
  assert(graph.nodes.some(n => n.id === 'source-g2' && n.kind === 'evidence'));
  assert(graph.links.some(l => l.from === 'memory:member-preference' && l.to === 'source-g2'));
  const portrait = groupMemberPortrait(filled, '小禾');
  assert.equal(portrait.messages.length, 2);
  assert.deepEqual(portrait.preferences.map(p => p.id), ['member-preference']);
  assert(portrait.topics.includes('流程图'));
});

test('correction and revocation leave evidence but remove old meeting from current use', () => {
  const initial = refreshGroupDemo(freshGroupDemo());
  const corrected = refreshGroupDemo(stageGroupMessage(initial, 'correction'));
  assert.equal(corrected.memories.find(m => m.id === 'meeting-v1').status, 'superseded');
  assert.equal(corrected.memories.find(m => m.id === 'meeting-v1').changedBy, 'g5');
  assert.equal(corrected.memories.find(m => m.id === 'meeting-v2').previous, 'meeting-v1');
  assert.equal(corrected.memories.find(m => m.id === 'meeting-v2').summary, '周三下午三点在创新工坊讨论校园导览原型');
  assert.deepEqual(currentGroupMemories(corrected).filter(m => m.slot === 'meeting').map(m => m.id), ['meeting-v2']);
  const revoked = refreshGroupDemo(stageGroupMessage(corrected, 'revoke'));
  assert.equal(revoked.memories.find(m => m.id === 'meeting-v2').status, 'revoked');
  assert.equal(revoked.memories.find(m => m.id === 'meeting-v2').changedBy, 'g6');
  assert.equal(currentGroupMemories(revoked).some(m => m.slot === 'meeting'), false);
  assert.equal(currentGroupMemories(revoked).some(m => m.slot === 'preference'), true);
  assert.equal(refreshGroupDemo(revoked).lastRefresh.processed, 0);
});

test('preset demo state ships pre-integrated with the full correction/revoke evidence chain', () => {
  const preset = presetGroupDemo();
  assert.equal(preset.processed.length, 6, '初始即处理 4 条原始消息+更正+撤销');
  assert.equal(preset.memories.find(m => m.id === 'meeting-v1').status, 'revoked');
  assert.equal(preset.memories.find(m => m.id === 'meeting-v2').status, 'revoked');
  assert.deepEqual(currentGroupMemories(preset).map(m => m.id), ['member-preference']);
  assert.equal(preset.messages.filter(m => !preset.processed.includes(m.id)).length, 0, '无待整合消息');
  const graph = groupMemoryGraph(preset);
  assert(graph.nodes.some(n => n.id === 'source-g5' && n.kind === 'evidence'), '更正原话证据在图中');
  assert(graph.nodes.some(n => n.id === 'source-g6' && n.kind === 'evidence'), '撤销原话证据在图中');
  assert(graph.links.some(l => l.label === '更正为' && l.weight === 1.0));
});

test('preset messages, memories and group space match the Whale JSON source', () => {
  const preset = presetGroupDemo();
  assert.deepEqual(preset.messages.map(({ id, author, text }) => ({ id, author, text })), [
    ...groupMemoryPreset.initialMessages, groupMemoryPreset.correction, groupMemoryPreset.revoke,
  ].map(({ id, author, text }) => ({ id, author, text })));
  assert.deepEqual(groupSpace, {
    name: groupMemoryPreset.name, short: groupMemoryPreset.short,
    description: groupMemoryPreset.description, members: groupMemoryPreset.members,
  });
  for (const expected of groupMemoryPreset.expectedMemories) {
    const memory = preset.memories.find(m => m.evidence === expected.sourceMessageId);
    assert(memory);
    assert.equal(memory.slot, expected.slot);
    assert.equal(memory.summary, expected.summary);
    assert.equal(memory.status, expected.finalStatus);
    assert.equal(memory.changedBy, expected.statusChangeMessageId);
    if (expected.subject) assert.equal(memory.subject, expected.subject);
  }
});

test('graph node labels carry author and space; descriptions carry meaning', () => {
  const graph = groupMemoryGraph(presetGroupDemo());
  const evidence = graph.nodes.find(n => n.id === 'source-g1');
  assert.equal(evidence.label, '周老师·创新项目群');
  assert(evidence.description.includes('周老师') && evidence.description.includes('创新项目群') && evidence.description.includes('原话'));
  const member = graph.nodes.find(n => n.id === 'member:小禾');
  assert.equal(member.label, '小禾');
  assert(member.description.includes('创新项目群成员') && member.description.includes('发言'));
  const memory = graph.nodes.find(n => n.id === 'memory:meeting-v2');
  assert(memory.label.length <= 15, 'memory 标签截断');
  assert(memory.description.includes('已撤销'));
  const keyword = graph.nodes.find(n => n.id === 'keyword:校园导览原型');
  assert.equal(keyword.label, '校园导览原型');
  assert(keyword.description.includes('话题'));
  const segment = graph.nodes.find(n => n.kind === 'segment');
  assert(/^对话段 \d+$/.test(segment.label));
  assert(segment.description.includes('条消息'));
});
