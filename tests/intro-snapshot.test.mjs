import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIntroSnapshot } from '../lib/intro-snapshot.js';
import { fresh } from '../lib/engine.js';

test('first visit creates one clearly labeled rule demo reminder', () => {
  const state = fresh('project');
  const snapshot = createIntroSnapshot({ project: state }, state.now);
  assert(snapshot);
  assert.equal(snapshot.inboxItem.action, 'remind');
  assert.match(snapshot.inboxItem.text, /^演示快照：/);
  assert.match(snapshot.inboxItem.reason, /规则引擎/);
  assert.equal(snapshot.ledgerEntry.engine, 'sim');
  assert.equal(snapshot.ledgerEntry.delivered, true);
  assert(snapshot.inboxItem.evidence.length > 0);
});

test('no upcoming task means no fabricated reminder', () => {
  assert.equal(createIntroSnapshot({ empty: { tasks: [] } }, Date.UTC(2026, 10, 20, 1)), null);
});
