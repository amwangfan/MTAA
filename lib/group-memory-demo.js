// 独立的虚构群演示数据；不读取真实群聊或 MTAA 的浏览器记忆。
const at = (day, hour, minute) => Date.UTC(2026, 10, day, hour - 8, minute);
const initialMessages = [
  { id: 'g1', author: '林老师', time: at(20, 9, 0), text: '本周五下午三点在实验楼会议室讨论眼镜原型，请带上测试记录。' },
  { id: 'g2', author: '小禾', time: at(20, 9, 4), text: '我喜欢先看图，再讨论细节。' },
  { id: 'g3', author: '我', time: at(20, 9, 8), text: '我可以整理会议纪要。' },
  { id: 'g4', author: '小禾', time: at(21, 10, 0), text: '上次展示图示时，我比较容易理解接口问题。' },
];
const changes = {
  correction: { id: 'g5', author: '林老师', time: at(21, 10, 5), text: '更正：项目讨论改到周三下午三点，地点仍是实验楼会议室。' },
  revoke: { id: 'g6', author: '林老师', time: at(21, 10, 12), text: '撤销：本周项目讨论取消，不用去会议室。' },
};
const phrases = ['眼镜原型', '测试记录', '会议室', '讨论', '会议纪要', '图示', '接口问题', '实验报告', '课程设计', '选题表', '实验记录', '原始数据', '志愿服务', '外拍', '例会', '原型演示'];
export const groupSpace = {
  name: 'Whale 智能眼镜项目组',
  short: '项目群',
  description: '虚构项目群 · 讨论原型、测试记录与展示方式',
  members: ['林老师', '小禾', '我'],
};

export function freshGroupDemo() {
  return { messages: structuredClone(initialMessages), processed: [], memories: [], lastRefresh: null };
}
// 预整合演示态：初始即含更正+撤销的完整证据链（meeting-v1 superseded、meeting-v2 revoked）。
export function presetGroupDemo() {
  return refreshGroupDemo(stageGroupMessage(stageGroupMessage(freshGroupDemo(), 'correction'), 'revoke'));
}
export function stageGroupMessage(state, kind) {
  const message = changes[kind];
  if (!message || state.messages.some(m => m.id === message.id)) return state;
  return { ...state, messages: [...state.messages, { ...message }] };
}
export function segmentGroupMessages(messages) {
  const sorted = [...messages].sort((a, b) => a.time - b.time);
  const segments = [];
  for (const message of sorted) {
    let last = segments.at(-1);
    if (!last || message.time - last.messages.at(-1).time > 30 * 60000) {
      last = { id: `segment-${message.id}`, messages: [] };
      segments.push(last);
    }
    last.messages.push(message);
  }
  return segments.map(segment => ({ ...segment, keywords: phrases.filter(word => segment.messages.some(m => m.text.includes(word))) }));
}
export function refreshGroupDemo(state) {
  const next = structuredClone(state);
  let processed = 0;
  for (const message of next.messages) {
    if (next.processed.includes(message.id)) continue;
    next.processed.push(message.id); processed++;
    const activeMeeting = next.memories.find(m => m.slot === 'meeting' && m.status === 'active');
    if (message.author === '林老师' && message.text.startsWith('撤销：') && activeMeeting) {
      activeMeeting.status = 'revoked'; activeMeeting.changedBy = message.id;
    } else if (message.author === '林老师' && message.text.startsWith('更正：') && activeMeeting) {
      activeMeeting.status = 'superseded'; activeMeeting.changedBy = message.id;
      next.memories.push({ id: 'meeting-v2', slot: 'meeting', kind: '群公共事实', summary: '项目讨论改到周三下午三点，地点是实验楼会议室', status: 'active', evidence: message.id, subject: '项目群', previous: activeMeeting.id });
    } else if (message.author === '林老师' && message.text.includes('讨论眼镜原型')) {
      next.memories.push({ id: 'meeting-v1', slot: 'meeting', kind: '群公共事实', summary: '周五下午三点在实验楼会议室讨论眼镜原型', status: 'active', evidence: message.id, subject: '项目群' });
    } else if (message.author === '小禾' && message.text.includes('我喜欢先看图')) {
      next.memories.push({ id: 'member-preference', slot: 'preference', kind: '成员公开自述', summary: '小禾喜欢先看图，再讨论细节', status: 'active', evidence: message.id, subject: '小禾' });
    }
  }
  next.lastRefresh = { processed, at: next.messages.at(-1)?.time ?? null };
  return next;
}
export function currentGroupMemories(state) {
  return state.memories.filter(memory => memory.status === 'active');
}

// 图谱只由当前演示消息与已形成的记忆构造；节点的证据始终指向原消息。
// 节点自带简短 label（谁在哪个群说了什么）与 description（来源群＋发送者＋大致含义），供画布标签与悬停。
const shortText = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);
const MEMORY_STATUS = { active: '当前有效', superseded: '已被更正', revoked: '已撤销' };
export function groupMemoryGraph(state) {
  const space = state.space ?? groupSpace;
  const segments = segmentGroupMessages(state.messages);
  const nodes = [{ id: 'group', kind: 'group', label: space.name, description: `${space.name} · ${space.description}` }];
  const links = [];
  const add = (node) => { if (!nodes.some(n => n.id === node.id)) nodes.push(node); };
  // 语义权重：高 weight = 更强吸引/更短理想长度；缺省 0.6 向后兼容。
  const edge = (from, to, label, weight = 0.6) => links.push({ id: `${from}:${to}:${label}`, from, to, label, weight });
  for (const author of space.members) {
    const count = state.messages.filter(m => m.author === author).length;
    add({ id: `member:${author}`, kind: 'member', label: author, author, description: `${space.short}成员 · 发言 ${count} 条` });
    edge('group', `member:${author}`, '群成员', 0.6);
  }
  for (const [index, segment] of segments.entries()) {
    add({ id: segment.id, kind: 'segment', label: `对话段 ${index + 1}`, segmentId: segment.id, description: `${space.short} · 对话段 ${index + 1} · ${segment.messages.length} 条消息` });
    edge('group', segment.id, '包含对话', 0.5);
    for (const message of segment.messages) {
      add({ id: `source-${message.id}`, kind: 'evidence', label: `${message.author}·${space.short}`, messageId: message.id, description: `${message.author} 在${space.short}的原话：「${shortText(message.text, 40)}」` });
      edge(segment.id, `source-${message.id}`, '原始消息', 0.6);
    }
    for (const word of segment.keywords) {
      const id = `keyword:${word}`;
      add({ id, kind: 'keyword', label: word, keyword: word, description: `${space.short}对话中反复出现的话题` });
      edge(segment.id, id, '讨论话题', 0.7);
    }
  }
  for (const memory of state.memories) {
    add({ id: `memory:${memory.id}`, kind: 'memory', label: shortText(memory.summary, 14), memoryId: memory.id, status: memory.status, description: `${memory.kind} · ${MEMORY_STATUS[memory.status] || memory.status} · ${memory.summary}` });
    edge(memory.slot !== 'preference' ? 'group' : `member:${memory.subject}`, `memory:${memory.id}`, memory.kind, 0.9);
    if (memory.previous) edge(`memory:${memory.previous}`, `memory:${memory.id}`, '更正为', 1.0);
    for (const messageId of [memory.evidence, memory.changedBy].filter(Boolean)) {
      if (state.messages.some(m => m.id === messageId)) {
        edge(`memory:${memory.id}`, `source-${messageId}`, messageId === memory.evidence ? '来源' : '状态变更', 1.0);
      }
    }
  }
  return { nodes, links, segments };
}

export function groupMemberPortrait(state, author) {
  const messages = state.messages.filter(m => m.author === author);
  const segments = segmentGroupMessages(state.messages);
  const topics = [...new Set(segments.flatMap(s => s.keywords.filter(word => s.messages.some(m => m.author === author && m.text.includes(word)))))];
  const preferences = state.memories.filter(m => m.subject === author && m.slot === 'preference' && m.status === 'active');
  return { author, messages, topics, preferences, evidence: messages.map(m => m.id) };
}
