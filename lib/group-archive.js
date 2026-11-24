import { publishers } from './engine.js';

export function readArchive(scene) {
  return scene.groupArchive ?? { processed: [], memories: [], lastRefresh: null };
}

function classify(scene, msg, memories) {
  const text = msg.text.trim();
  if (/^我(?:喜欢|偏好|更喜欢)/.test(text)) {
    return { key: 'preference:' + msg.author + ':' + text, subject: msg.author, slot: 'preference', action: 'add', summary: text };
  }
  if (!publishers(scene).includes(msg.author)) return null;
  const namedChange = text.replace(/^(?:更正|撤销)[：:]\s*/, '').match(/^(.+?)(?:现已|已)?(改到|改为|延期到|取消)(.*?)[。！]?$/);
  if (namedChange) {
    const key = 'notice:' + namedChange[1].trim();
    if (memories.some(m => m.key === key && m.status === 'active')) {
      return {key, action:namedChange[2] === '取消' ? 'revoke' : 'correct', summary:text.replace(/^更正[：:]\s*/, '')};
    }
  }
  const explicit = text.match(/^(通知|更正|撤销)[：:]\s*([^：:]+?)(?:[：:]\s*(.+))?$/u);
  if (explicit && (explicit[3] || explicit[1] === '撤销')) {
    return { key: 'notice:' + explicit[2].trim(), action: {通知:'add',更正:'correct',撤销:'revoke'}[explicit[1]], summary: [explicit[2],explicit[3]].filter(Boolean).join('：') };
  }
  const suggestion = scene.suggestions?.find(s => s.messageId === msg.id);
  const task = scene.tasks.find(t => t.id === msg.taskId || t.id === suggestion?.targetId);
  const title = suggestion?.title ?? task?.title;
  if (!title) return null;
  const kind = msg.outcome?.kind;
  if (kind === 'linked') return null;
  const operation = suggestion?.operation ?? (kind === 'updated' ? (/取消|不用交|不需要交/.test(text) ? 'cancel' : 'update') : kind === 'created' || kind === 'review' ? 'create' : '');
  const action = {create:'add',update:'correct',cancel:'revoke',complete:'correct'}[operation];
  return action ? { key:'task:' + title, action, summary:text } : null;
}

export function updateArchive(scene) {
  const archive = readArchive(scene);
  const seen = new Set(archive.processed);
  const pending = scene.messages.filter(m => !seen.has(m.id));
  if (!pending.length) return archive;
  const memories = archive.memories.map(m => ({ ...m }));
  const changes = [];
  for (const message of pending) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    const candidate = classify(scene, message, memories);
    if (!candidate) continue;
    const {key, action, summary} = candidate;
    const prior = memories.find(m => m.key === key && m.status === 'active');
    if (action === 'add' ? prior : !prior) continue;
    if (action === 'correct' && prior.summary === summary) continue;
    if (prior) {
      prior.status = action === 'revoke' ? 'revoked' : 'superseded';
      prior.changedBy = message.id;
    }
    if (action !== 'revoke') memories.push({
      id: message.id, key, slot: candidate.slot ?? 'notice', kind: candidate.slot ? '成员公开自述' : '群公共事实',
      subject: candidate.subject ?? null, summary, status:'active', evidence:message.id, previous:prior?.id
    });
    changes.push({ action, before:prior?.summary, after:action === 'revoke' ? null : summary, evidence:message.id });
  }
  scene.groupArchive = { processed:[...seen], memories, lastRefresh:{ processed:seen.size - archive.processed.length, changes } };
  return scene.groupArchive;
}
