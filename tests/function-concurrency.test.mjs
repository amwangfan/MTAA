import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, acquireLease, createDbLeaseStore, leaseTtlFromEnv } from '../functions/app.mjs';

const NOW = Date.UTC(2026, 10, 24, 1);
const visitor = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const extractionRequest = { version: 1, groupId: 'course', now: NOW, message: { id: 'm1', author: '助教', text: '实验报告明天18:00前提交到学习通', time: NOW }, context: [], tasks: [] };
const extractionOutput = { items: [{ operation: 'create', targetId: null, title: '提交实验报告', kind: 'task', when: { value: '2026-11-25T18:00:00+08:00', start: null, precision: 'minute', meaning: 'deadline' }, location: { mode: 'online', value: '学习通' }, requirements: [], evidence: [{ messageId: 'm1', quote: '实验报告明天18:00前提交到学习通' }], needsConfirmation: [] }] };
const jsonResponse = value => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] }), { headers: { 'content-type': 'application/json' } });
const request = (body, cookie = visitor(1), headers = {}) => new Request('https://demo.example.com/functions/v1/app/api/v1/extract', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://demo.example.com', referer: 'https://demo.example.com/', 'sec-fetch-site': 'same-origin', cookie: `whale_visitor=${cookie}`, ...headers }, body: JSON.stringify(body) });

class MemoryLeaseStore {
  rows = [];
  async cleanup(now) { this.rows = this.rows.filter(row => Date.parse(row.expires_at) > now); }
  async byVisitor(id, now) { return this.rows.filter(row => row.visitor_id === id && Date.parse(row.expires_at) > now); }
  async activeSlots(now) { return this.rows.filter(row => Date.parse(row.expires_at) > now).map(row => ({ slot_no: row.slot_no })); }
  async insertIfAbsent(row) { if (this.rows.some(current => current.visitor_id === row.visitor_id || current.slot_no === row.slot_no)) return false; this.rows.push(row); return true; }
  async release(id) { this.rows = this.rows.filter(row => row.lease_id !== id); }
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('AI_MODEL controls the server model and browser selection headers are ignored', async () => {
  let sentModel;
  const app = createApp({ env: { AGENTSCOPE_API_KEY: 'offline-fixture', AI_MODEL: 'deepseek-v4.1-flash-1017' }, leaseStore: new MemoryLeaseStore(), fetcher: async (_url, options) => { sentModel = JSON.parse(options.body).model; return jsonResponse(extractionOutput); } });
  const response = await app(request(extractionRequest, visitor(1), { 'x-whale-provider': 'deepseek', 'x-whale-model': 'qwen3.8-flash' }));
  assert.equal(response.status, 200);
  assert.equal(sentModel, 'deepseek-v4.1-flash-1017');
});

test('anonymous status sets a random HttpOnly Secure SameSite=Lax UUID cookie', async () => {
  const app = createApp({ env: {}, leaseStore: new MemoryLeaseStore() });
  const response = await app(new Request('https://demo.example.com/functions/v1/app/api/v1/ai-status'));
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /^whale_visitor=[0-9a-f-]{36}/i);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.equal(JSON.parse(await response.text()).configured, false);
});

test('same cookie cannot start a second concurrent AI operation', { timeout: 3000 }, async () => {
  const leases = new MemoryLeaseStore();
  const started = deferred(), release = deferred();
  let calls = 0;
  const app = createApp({ env: { AGENTSCOPE_API_KEY: 'offline-fixture', AI_RATE_PER_IP: 100 }, leaseStore: leases, fetcher: async () => { calls++; if (calls === 1) { started.resolve(); await release.promise; } return jsonResponse(extractionOutput); } });
  try {
    const first = app(request(extractionRequest));
    await started.promise;
    const second = await app(request(extractionRequest));
    assert.equal(second.status, 429);
    assert.equal(JSON.parse(await second.text()).code, 'AI_BUSY');
    release.resolve();
    assert.equal((await first).status, 200);
    assert.equal(leases.rows.length, 0);
  } finally { release.resolve(); }
});

test('the ninth concurrent operation is rejected by the eight database slots', { timeout: 10000 }, async () => {
  const leases = new MemoryLeaseStore();
  const allStarted = deferred(), release = deferred();
  let calls = 0;
  const app = createApp({ env: { AGENTSCOPE_API_KEY: 'offline-fixture', AI_RATE_PER_IP: 100 }, leaseStore: leases, fetcher: async () => { calls++; if (calls === 8) allStarted.resolve(); await release.promise; return jsonResponse(extractionOutput); } });
  try {
    const pending = Array.from({ length: 8 }, (_, index) => app(request(extractionRequest, visitor(index + 1))));
    await allStarted.promise;
    const ninth = await app(request(extractionRequest, visitor(9)));
    assert.equal(ninth.status, 429);
    assert.equal(JSON.parse(await ninth.text()).code, 'AI_BUSY');
    assert.equal(leases.rows.length, 8);
    release.resolve();
    const responses = await Promise.all(pending);
    assert(responses.every(response => response.status === 200));
    assert.equal(leases.rows.length, 0);
  } finally { release.resolve(); }
});

test('failed validation releases its lease and never returns a successful AI result', async () => {
  const leases = new MemoryLeaseStore();
  const invalid = { items: [{ ...extractionOutput.items[0], evidence: [{ messageId: 'm1', quote: '不存在的原文' }] }] };
  const app = createApp({ env: { AGENTSCOPE_API_KEY: 'offline-fixture' }, leaseStore: leases, fetcher: async () => jsonResponse(invalid) });
  const response = await app(request(extractionRequest));
  assert.equal(response.status, 422);
  assert.equal(JSON.parse(await response.text()).code, 'INVALID_EXTRACTION');
  assert.equal(leases.rows.length, 0);
});

test('expired leases are cleaned before acquiring the same visitor and slot', async () => {
  const leases = new MemoryLeaseStore();
  leases.rows.push({ lease_id: 'old', visitor_id: visitor(1), slot_no: 1, operation: 'extract', created_at: new Date(NOW - 200000).toISOString(), expires_at: new Date(NOW - 100000).toISOString() });
  const result = await acquireLease(leases, visitor(1), 'extract', { now: NOW, ttlMs: 90000 });
  assert.equal(result.ok, true);
  assert.equal(result.lease.slot_no, 1);
  assert.equal(leases.rows.length, 1);
});

test('provider timeout maps to a safe error and releases the lease', { timeout: 3000 }, async () => {
  const leases = new MemoryLeaseStore();
  const app = createApp({ env: { AGENTSCOPE_API_KEY: 'offline-fixture', AI_TIMEOUT_MS: 20 }, leaseStore: leases, fetcher: async (_url, options) => new Promise((_resolve, reject) => { if (options.signal.aborted) reject(new Error('timeout')); else options.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true }); }) });
  const response = await app(request(extractionRequest));
  assert.equal(response.status, 502);
  assert.equal(JSON.parse(await response.text()).code, 'AI_UNAVAILABLE');
  assert.equal(leases.rows.length, 0);
});

test('memory-chat and initiative responses pass their contracts through the same lease path', async () => {
  const leases = new MemoryLeaseStore();
  const app = createApp({ env: { AGENTSCOPE_API_KEY: 'offline-fixture', AI_RATE_PER_IP: 100 }, leaseStore: leases, fetcher: async (_url, options) => {
    const system = JSON.parse(options.body).messages[0].content;
    if (system.includes('学习与生活助手')) return jsonResponse({ sentences: [{ text: '先复习 CMOS 反相器。', memoryIds: ['exam-subject'] }] });
    return jsonResponse({ action: 'silent', text: '', reason: '当前没有需要打扰的事件', evidence: [], urgency: 'low', deviceProposal: null });
  } });
  const chat = await app(new Request('https://demo.example.com/functions/v1/app/api/v1/memory-chat', { method: 'POST', headers: { 'content-type': 'application/json', cookie: `whale_visitor=${visitor(1)}` }, body: JSON.stringify({ version: 1, profileId: 'exam', question: '我要开始学习了', now: NOW }) }));
  assert.equal(chat.status, 200);
  const chatBody = JSON.parse(await chat.text());
  assert.equal(chatBody.engine.type, 'ai');
  assert.equal(chatBody.extraction.sentences[0].memoryIds[0], 'exam-subject');
  const initiative = await app(new Request('https://demo.example.com/functions/v1/app/api/v1/initiative', { method: 'POST', headers: { 'content-type': 'application/json', cookie: `whale_visitor=${visitor(2)}` }, body: JSON.stringify({ version: 1, now: NOW, activity: '', upcoming: [], overdue: [], newMessages: [], memories: [], policy: { quiet: false } }) }));
  assert.equal(initiative.status, 200);
  assert.equal(JSON.parse(await initiative.text()).decision.action, 'silent');
  assert.equal(leases.rows.length, 0);
});

test('lease TTL covers provider-specific timeout plus model-list discovery', () => {
  assert.equal(leaseTtlFromEnv({ AI_TIMEOUT_MS: 60000, AGENTSCOPE_TIMEOUT_MS: 120000, AI_MODEL_LIST_TIMEOUT_MS: 10000 }), 160000);
});

test('malformed model evidence is a contract error rather than a provider failure', async () => {
  const leases = new MemoryLeaseStore();
  const app = createApp({ env: { AGENTSCOPE_API_KEY: 'offline-fixture' }, leaseStore: leases, fetcher: async () => jsonResponse({ items: [{ ...extractionOutput.items[0], evidence: [null] }] }) });
  const response = await app(request(extractionRequest));
  assert.equal(response.status, 422);
  assert.equal(JSON.parse(await response.text()).code, 'INVALID_EXTRACTION');
  assert.equal(leases.rows.length, 0);
});

test('oversized JSON is rejected while streaming without acquiring a lease', async () => {
  const leases = new MemoryLeaseStore();
  let called = false;
  const app = createApp({ env: { AGENTSCOPE_API_KEY: 'offline-fixture' }, leaseStore: leases, fetcher: async () => { called = true; return jsonResponse(extractionOutput); } });
  const response = await app(new Request('https://demo.example.com/functions/v1/app/api/v1/extract', { method: 'POST', headers: { 'content-type': 'application/json', cookie: `whale_visitor=${visitor(1)}` }, body: 'x'.repeat(65537) }));
  assert.equal(response.status, 413);
  assert.equal(JSON.parse(await response.text()).code, 'TOO_LARGE');
  assert.equal(called, false);
  assert.equal(leases.rows.length, 0);
});

test('initiative rejects malformed silent text and non-object device proposals', async () => {
  for (const decision of [
    { action: 'silent', text: {}, reason: 'quiet', evidence: [], urgency: 'low', deviceProposal: null },
    { action: 'remind', text: 'remember', reason: 'due', evidence: [], urgency: 'normal', deviceProposal: false },
  ]) {
    const leases = new MemoryLeaseStore();
    const app = createApp({ env: { AGENTSCOPE_API_KEY: 'offline-fixture' }, leaseStore: leases, fetcher: async () => jsonResponse(decision) });
    const response = await app(new Request('https://demo.example.com/functions/v1/app/api/v1/initiative', { method: 'POST', headers: { 'content-type': 'application/json', cookie: `whale_visitor=${visitor(1)}` }, body: JSON.stringify({ version: 1, now: NOW, activity: '', upcoming: [], overdue: [], newMessages: [], memories: [], policy: { quiet: false } }) }));
    assert.equal(response.status, 422);
    assert.equal(JSON.parse(await response.text()).code, 'INVALID_EXTRACTION');
    assert.equal(leases.rows.length, 0);
  }
});

test('database_conflict is treated as an atomic slot race rather than a provider failure', async () => {
  const db = { from: () => ({ insertIfAbsent: () => ({ select: async () => ({ error: { code: 'database_conflict' } }) }) }) };
  assert.equal(await createDbLeaseStore(db).insertIfAbsent({ lease_id: 'lease', visitor_id: visitor(1), slot_no: 1 }), false);
});

test('memory-chat applies browser preference edits and returns only grounded updates', async () => {
  const leases = new MemoryLeaseStore();
  const quote = '以后每45分钟休息10分钟';
  let payload;
  const app = createApp({ env: { AGENTSCOPE_API_KEY: 'offline-fixture' }, leaseStore: leases, fetcher: async (_url, options) => {
    payload = JSON.parse(JSON.parse(options.body).messages[1].content);
    return jsonResponse({ sentences: [{ text: '按更新后的节奏学习。', memoryIds: ['exam-style'] }], preferenceUpdates: [{ id: 'exam-style', summary: '喜欢每45分钟休息10分钟', quote }, { id: 'exam-place', summary: '伪造更新', quote: '不在原话中的引用' }] });
  } });
  const response = await app(new Request('https://demo.example.com/functions/v1/app/api/v1/memory-chat', { method: 'POST', headers: { 'content-type': 'application/json', cookie: `whale_visitor=${visitor(1)}` }, body: JSON.stringify({ version: 1, profileId: 'exam', question: `我更喜欢短冲刺，${quote}。`, now: NOW, preferences: { 'exam-style': { summary: '当前喜欢每45分钟休息10分钟', origin: 'manual' } }, allowUpdates: true }) }));
  const body = JSON.parse(await response.text());
  assert.equal(response.status, 200);
  assert.equal(payload.memories.find(item => item.id === 'exam-style').summary, '当前喜欢每45分钟休息10分钟');
  assert(payload.writableIds.includes('exam-style'));
  assert.deepEqual(body.preferenceUpdates, { 'exam-style': { summary: '喜欢每45分钟休息10分钟', quote } });
  assert.equal(leases.rows.length, 0);
});

test('Sites forwarded host and browser same-origin signals accept the public origin', async () => {
  const make = origin => {
    const req = new Request('http://internal.example/functions/v1/app/api/v1/extract', { method: 'POST', body: JSON.stringify(extractionRequest) });
    const values = { 'content-type': 'application/json', 'x-forwarded-host': 'demo.example.com', 'x-forwarded-proto': 'https', cookie: `whale_visitor=${visitor(1)}`, origin, referer: new URL(origin).origin + '/', 'sec-fetch-site': origin === 'https://demo.example.com' ? 'same-origin' : 'cross-site' };
    Object.defineProperty(req, 'headers', { value: { get: name => values[String(name).toLowerCase()] || null } });
    return req;
  };
  const app = createApp({ env: { AGENTSCOPE_API_KEY: 'offline-fixture' }, leaseStore: new MemoryLeaseStore(), fetcher: async () => jsonResponse(extractionOutput) });
  assert.equal((await app(make('https://demo.example.com'))).status, 200);
  assert.equal((await app(make('https://evil.example'))).status, 403);
});
