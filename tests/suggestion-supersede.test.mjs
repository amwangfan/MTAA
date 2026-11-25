import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fresh } from '../lib/engine.js';
import { applyAI, makeRequest } from '../lib/ai-client.js';

const item = (operation, targetId, value) => ({
  operation, targetId, title: '智能眼镜项目', kind: 'task',
  when: { value, start: null, precision: 'minute', meaning: 'deadline' },
  location: { mode: 'unknown', value: null }, requirements: [],
  evidence: [{ messageId: 'current', quote: '当前消息' }], needsConfirmation: [],
});
const response = extraction => ({ version: 1, engine: { type: 'ai' }, extraction: { items: extraction } });
const addMessage = (state, id, text) => {
  const message = { id, author: '我', text, time: state.now + 60000 };
  state.messages.push(message);
  return message;
};

test('AI延期替换同名待确认建议并保留替代链', () => {
  const state = fresh('project');
  const first = addMessage(state, 'first', '智能眼镜项目11月30日18:00前完成');
  const firstRequest = makeRequest(state, first);
  firstRequest.message.text = '智能眼镜项目11月30日18:00前完成';
  const firstItem = item('create', null, '2026-11-30T18:00:00+08:00');
  firstItem.evidence[0] = { messageId: first.id, quote: first.text };
  applyAI(state, first.id, response([firstItem]), firstRequest);
  const original = state.suggestions.find(suggestion => suggestion.status === 'pending');
  assert(original);

  const second = addMessage(state, 'second', '延期到12月2日18:00');
  const secondRequest = makeRequest(state, second);
  assert.equal(secondRequest.suggestions.length, 1);
  assert.equal(secondRequest.suggestions[0].id, original.id);
  const secondItem = item('update', original.id, '2026-12-02T18:00:00+08:00');
  secondItem.evidence[0] = { messageId: second.id, quote: second.text };
  applyAI(state, second.id, response([secondItem]), secondRequest);

  const pending = state.suggestions.filter(suggestion => suggestion.status === 'pending');
  assert.equal(pending.length, 1);
  assert.equal(original.status, 'superseded');
  assert.equal(original.supersededBy, pending[0].id);
  assert.deepEqual(pending[0].supersedes, [original.id]);
  assert.equal(pending[0].operation, 'create');
  assert.equal(pending[0].targetId, null);
  assert.equal(pending[0].due, Date.parse('2026-12-02T18:00:00+08:00'));
  assert(pending[0].history.some(entry => entry.text.includes('替代待确认建议')));
});

test('AI重复create同名建议也会替代旧建议而不是叠加', () => {
  const state = fresh('project');
  const first = addMessage(state, 'first', '智能眼镜项目11月30日18:00前完成');
  const firstRequest = makeRequest(state, first);
  const firstItem = item('create', null, '2026-11-30T18:00:00+08:00');
  firstItem.evidence[0] = { messageId: first.id, quote: first.text };
  applyAI(state, first.id, response([firstItem]), firstRequest);
  const original = state.suggestions.find(suggestion => suggestion.status === 'pending');

  const second = addMessage(state, 'second', '智能眼镜项目12月2日18:00前完成');
  const secondRequest = makeRequest(state, second);
  const secondItem = item('create', null, '2026-12-02T18:00:00+08:00');
  secondItem.evidence[0] = { messageId: second.id, quote: second.text };
  applyAI(state, second.id, response([secondItem]), secondRequest);
  assert.equal(state.suggestions.filter(suggestion => suggestion.status === 'pending').length, 1);
  assert.equal(original.status, 'superseded');
});
