import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { decideInitiativeAI, processMemoryAI, resolveAIBusy } from '../lib/ai-client.js';

const apiSource = readFileSync(new URL('../src/api.ts', import.meta.url), 'utf8');
async function loadApi(tag = 'default') {
  const { outputText } = ts.transpileModule(apiSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}#${tag}`);
}
const context = { now: Date.UTC(2026, 10, 20, 1), activity: '在宿舍', upcoming: [], overdue: [], newMessages: [], memories: [], policy: { quiet: false, quota: 6, used: 0, feedback: [] } };

test('API uses the same-origin Qoder Sites Function by default', async () => {
  const { API_BASE } = await loadApi();
  assert.equal(API_BASE, '/functions/v1/app');
});

test('WHALE_API_BASE remains an optional override and strips trailing slashes', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { WHALE_API_BASE: 'https://demo.example/functions/v1/app///' };
  try {
    const overridden = await loadApi('override=whale-api-base');
    assert.equal(overridden.API_BASE, 'https://demo.example/functions/v1/app');
    assert.equal(overridden.apiUrl('/api/v1/ai-status'), 'https://demo.example/functions/v1/app/api/v1/ai-status');
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('apiFetch never selects a model and forces same-origin credentials', async () => {
  const { apiFetch } = await loadApi('fetch');
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (input, init) => { captured = { input, init }; return new Response('{}', { status: 200 }); };
  try {
    await apiFetch('/api/v1/extract', { method: 'POST', headers: { 'X-Test': 'preserved' }, credentials: 'omit' });
    const headers = new Headers(captured.init.headers);
    assert.equal(captured.input, '/functions/v1/app/api/v1/extract');
    assert.equal(captured.init.credentials, 'same-origin');
    assert.equal(headers.get('X-Whale-Provider'), null);
    assert.equal(headers.get('X-Whale-Model'), null);
    assert.equal(headers.get('X-Test'), 'preserved');
  } finally { globalThis.fetch = originalFetch; }
});

test('resolveAIBusy asks only for AI_BUSY and returns the current confirmation', async () => {
  for (const code of [undefined, 'RATE_LIMITED', 'AI_NOT_CONFIGURED']) {
    let asked = false;
    assert.equal(await resolveAIBusy({ code }, () => { asked = true; return true; }), false);
    assert.equal(asked, false);
  }
  const busy = Object.assign(new Error('busy'), { code: 'AI_BUSY' });
  assert.equal(await resolveAIBusy(busy, async error => { assert.equal(error, busy); return true; }), true);
  assert.equal(await resolveAIBusy(busy, async () => false), false);
  assert.deepEqual(await Promise.all([resolveAIBusy(busy, async () => true), resolveAIBusy(busy, async () => false)]), [true, false]);
});

test('decideInitiativeAI preserves AI_BUSY and wraps validated success', async () => {
  const failed = await decideInitiativeAI(context, { fetcher: async () => new Response(JSON.stringify({ code: 'AI_BUSY', message: 'capacity full' }), { status: 429 }) });
  assert.equal(failed.ok, false);
  assert.equal(failed.code, 'AI_BUSY');
  const decision = { action: 'silent', text: '', reason: 'nothing due', urgency: 'low', evidence: [], deviceProposal: null };
  const succeeded = await decideInitiativeAI(context, { fetcher: async () => new Response(JSON.stringify({ decision }), { status: 200 }) });
  assert.equal(succeeded.ok, true);
  assert.deepEqual(succeeded.decision, decision);
});

test('optional memory extraction preserves AI_BUSY for explicit confirmation', async () => {
  const result = await processMemoryAI({ scenario: 'course' }, { id: 'm1', author: '我', text: '我喜欢爵士音乐', time: context.now }, {
    fetcher: async () => new Response(JSON.stringify({ code: 'AI_BUSY', message: 'capacity full' }), { status: 429 }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'AI_BUSY');
});
