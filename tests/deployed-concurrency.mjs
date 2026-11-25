const base = 'https://studyhack-aoffuim2fx9.qoder.zone/functions/v1/app/api/v1/extract';
const now = Date.UTC(2026, 10, 24, 1);
const visitor = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const payload = { version: 1, groupId: 'course', now, message: { id: 'm-concurrency', author: '助教', text: '实验报告明天18:00前提交到学习通。', time: now }, context: [], tasks: [] };
const origin = 'https://studyhack-aoffuim2fx9.qoder.zone';
const call = cookie => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `whale_visitor=${cookie}`, Origin: origin, Referer: origin + '/', 'Sec-Fetch-Site': 'same-origin' }, body: JSON.stringify({ ...payload, message: { ...payload.message, id: `m-${cookie}` } }) }).then(async response => ({ status: response.status, body: await response.json() }));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

const first = call(visitor(1));
await pause(500);
const sameCookieSecond = await call(visitor(1));
const firstResult = await first;

const pending = Array.from({ length: 8 }, (_, index) => call(visitor(index + 10)));
await pause(500);
const ninth = await call(visitor(99));
const eight = await Promise.all(pending);

const summary = {
  sameCookie: { first: firstResult.status, second: sameCookieSecond.status, secondCode: sameCookieSecond.body.code },
  global: { eight: eight.map(item => ({ status: item.status, code: item.body.code, message: item.body.message })), ninth: ninth.status, ninthCode: ninth.body.code },
};
console.log(JSON.stringify(summary, null, 2));
if (firstResult.status !== 200 || sameCookieSecond.status !== 429 || sameCookieSecond.body.code !== 'AI_BUSY' || eight.some(item => item.status !== 200) || ninth.status !== 429 || ninth.body.code !== 'AI_BUSY') process.exitCode = 1;
