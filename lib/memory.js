// 记忆模块（理想化模拟，架构留真实接入口）。
// 概念对应 whale-core/memory：原始消息不是事实；候选需显式同意晋升（consent+evidence）；
// 召回 = 词项命中(中文单字+二元组) × 重要度 × 半衰期衰减；记忆空间分 owner / group。
// 本模块为纯函数 + 状态操作，不依赖 DOM，可在浏览器与 Node 测试中复用。
export const HALF_LIFE_DAYS = 30;
export const dayOf = ms => new Date(ms + 8 * 3600000).toISOString().slice(0, 10);

// 中文词项 = 单字 + 二元组；英文/数字整词。与 whale-core curation._terms 同思路。
export function terms(text) {
  const tokens = String(text || '').toLowerCase().match(/[a-z0-9]+|[一-鿿]+/g) || [];
  const parts = new Set();
  for (const tok of tokens) {
    if (/^[一-鿿]+$/.test(tok)) {
      for (const ch of tok) parts.add(ch);
      for (let i = 0; i < tok.length - 1; i++) parts.add(tok.slice(i, i + 2));
    } else parts.add(tok);
  }
  return parts;
}
const weight = t => (t.length >= 2 ? 2 : 1);

// 可解释规则：命中模式写进 record.pattern。绝不自动晋升。
const OWNER_PATTERNS = [
  { re: /我(怕|不吃|不喜欢|喜欢|爱|习惯|最爱)([^，。！!？?\n]{1,40})/, kind: 'preference', importance: 0.7, label: '自述偏好「我+怕/习惯/喜欢…」' },
  { re: /我(一般|平时)([^，。！!？?\n]{1,40})/, kind: 'preference', importance: 0.6, label: '自述习惯「我+一般/平时…」' },
  { re: /^(周末|平时)一般([^，。！!？?\n]{1,40})/, kind: 'preference', importance: 0.6, label: '自述习惯「周末/平时一般…」' },
  { re: /我是([^，。！!？?\n]{1,30})/, kind: 'fact', importance: 0.8, label: '自述事实「我是…」' },
  { re: /我负责([^，。！!？?\n]{1,40})/, kind: 'fact', importance: 0.8, label: '自述事实「我负责…」' }
];
const EPISODE_PATTERNS = [
  { re: /湖边[^，。！!？?\n]{0,20}(首测|调试|眼镜)/, summary: '湖边调试：智能眼镜首测见真章', importance: 0.7, label: '经历「湖边+首测/调试/眼镜」' },
  { re: /湖边[^，。！!？?\n]{0,20}(测试|录制|拍素材)/, summary: '湖边测试：4K30 帧视频录制', importance: 0.6, label: '经历「湖边+测试/录制/拍素材」' },
  { re: /讨论AI模型[^，。！!？?\n]{0,30}/, summary: '讨论 AI 模型使用与开销', importance: 0.6, label: '经历「讨论AI模型…」' },
  { re: /标定/, summary: '在实验室做标定', importance: 0.5, label: '经历「标定」' },
  { re: /(一起吃饭|约饭|聚餐)/, summary: '和室友约饭', importance: 0.5, label: '经历「一起吃饭/约饭/聚餐」' }
];

// 为一条消息生成候选（不晋升）。返回新增记录数组；调用方负责并入 state.memory。
export function candidatesFor(message, groupId, origin = 'rules') {
  const out = [];
  const text = message.text || '';
  const push = (kind, summary, quote, space, importance, pattern, expiresAt) => {
    out.push({
      kind, summary: summary.slice(0, 120),
      evidence: [{ messageId: message.id, quote }],
      space, importance, createdAt: message.time,
      expiresAt: expiresAt || null,
      state: 'candidate', origin, pattern, groupId
    });
  };
  if (message.author === '我') {
    for (const p of OWNER_PATTERNS) {
      const m = text.match(p.re);
      if (m) push(p.kind, m[0], m[0], 'owner', p.importance, p.label, null);
    }
  }
  for (const p of EPISODE_PATTERNS) {
    const m = text.match(p.re);
    if (m) push('episode', p.summary, m[0], 'group:' + groupId, p.importance, p.label, message.time + HALF_LIFE_DAYS * 86400000);
  }
  return out;
}

// 并入 state.memory，按 space+kind+summary 去重（候选/已晋升都算）， forgotten 不复活。
export function addCandidates(state, records) {
  state.memory = state.memory || [];
  const added = [];
  for (const r of records) {
    const dup = state.memory.find(x => x.space === r.space && x.kind === r.kind && x.summary === r.summary && x.state !== 'forgotten');
    if (dup) {
      for (const e of r.evidence) if (!dup.evidence.some(y => y.messageId === e.messageId && y.quote === e.quote)) dup.evidence.push(e);
      continue;
    }
    const rec = { ...r, id: 'mem' + (++state.seq) };
    state.memory.push(rec); added.push(rec);
  }
  return added;
}
export function extractInto(state, message, origin = 'rules') {
  return addCandidates(state, candidatesFor(message, state.scenario, origin));
}

export function promote(state, id, now) {
  const r = (state.memory || []).find(x => x.id === id);
  if (!r || r.state !== 'candidate') return null;
  r.state = 'curated'; r.consent = true; r.curatedAt = now;
  return r;
}
export function forget(state, id, now) {
  const r = (state.memory || []).find(x => x.id === id);
  if (!r || r.state === 'forgotten') return null;
  r.state = 'forgotten'; r.forgottenAt = now;
  return r;
}
// 明确更正已确认的主人记忆：保留旧版本和来源，但旧版本立即退出召回。
export function correct(state, id, message) {
  const old = (state.memory || []).find(x => x.id === id);
  if (!old || old.state !== 'curated' || old.space !== 'owner' || message.author !== '我' || !/^更正[：:]/.test(message.text || '')) return null;
  const next = candidatesFor(message, state.scenario).find(x => x.space === old.space && x.kind === old.kind && x.summary !== old.summary);
  if (!next) return null;
  const [record] = addCandidates(state, [next]);
  if (!record) return null;
  promote(state, record.id, message.time);
  record.supersedes = old.id;
  old.state = 'superseded'; old.supersededBy = record.id; old.supersededAt = message.time;
  return record;
}
export const isExpired = (r, now) => Boolean(r.expiresAt) && now >= r.expiresAt;

// 召回：仅 curated 且未过期。score = 词项命中 × 重要度 × 衰减（fact 视为长期事实不衰减）。
export function recall(state, query, now, { limit = 5, spaces = null } = {}) {
  const qt = terms(query);
  if (!qt.size) return [];
  const qWeight = [...qt].reduce((a, t) => a + weight(t), 0);
  const hits = [];
  for (const r of state.memory || []) {
    if (r.state !== 'curated' || isExpired(r, now)) continue;
    if (spaces && !spaces.includes(r.space)) continue;
    const rt = terms(r.summary);
    const common = [...qt].filter(t => rt.has(t));
    if (!common.length) continue;
    const relevance = common.reduce((a, t) => a + weight(t), 0) / qWeight;
    const age = Math.max(0, (now - r.createdAt) / 86400000);
    const stable = r.kind === 'fact';
    const freshness = stable ? 1 : Math.pow(0.5, age / HALF_LIFE_DAYS);
    const score = relevance * r.importance * freshness;
    const reasons = [
      `词项命中 ${common.length}/${qt.size}（相关度 ${relevance.toFixed(2)}）`,
      `重要度 ${r.importance}`,
      stable ? '长期事实不衰减' : `距今 ${age.toFixed(0)} 天 · 半衰期30天衰减 ${freshness.toFixed(2)}`,
      `空间 ${r.space}`,
      `证据「${r.evidence[0]?.quote || ''}」`
    ];
    hits.push({ record: r, score, reasons });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

// 「你的一天」日摘要：理想化模板 + 关键事件（消息/任务/提醒）。
export function daySummary(states, dateStr, now) {
  const msgs = [], tasks = [], reminders = [];
  for (const s of states) {
    for (const m of s.messages || []) if (dayOf(m.time) === dateStr) msgs.push({ ...m, group: s.scenario });
    for (const t of s.tasks || []) if (dayOf(t.created) === dateStr || (t.due && dayOf(t.due) === dateStr)) tasks.push({ ...t, group: s.scenario });
    for (const r of s.reminders || []) if (dayOf(r.time) === dateStr) reminders.push({ ...r, group: s.scenario });
  }
  msgs.sort((a, b) => a.time - b.time);
  const has = re => msgs.some(m => re.test(m.text));
  let title;
  if (has(/湖边[^，。]{0,20}(首测|调试|眼镜)/)) title = '湖边调试：智能眼镜首测见真章';
  else if (has(/讨论AI模型/)) title = '讨论 AI 模型使用与开销';
  else if (has(/湖边/)) title = '湖边测试：4K30 帧视频录制';
  else if (tasks.length) title = '推进：' + tasks[0].title;
  else if (msgs.length) title = '日常：消息与待办回顾';
  else title = '平静的一天';
  const key = msgs.filter(m => m.author === '我' || /提交|截止|集合|会议|培训|延期|取消|报修|湖边|首测|讨论AI/.test(m.text)).slice(0, 6);
  const summary = `${dateStr} · ${msgs.length} 条消息 / ${tasks.length} 项任务 / ${reminders.length} 条提醒`;
  return { date: dateStr, title, summary, messages: key, tasks, reminders };
}
