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
const phrases = ['眼镜原型', '测试记录', '会议室', '讨论', '会议纪要', '图示', '接口问题'];
export const groupSpace = {
  name: 'Whale 智能眼镜项目组',
  description: '虚构项目群 · 讨论原型、测试记录与展示方式',
  members: ['林老师', '小禾', '我'],
};

export function freshGroupDemo() {
  return { messages: structuredClone(initialMessages), processed: [], memories: [], lastRefresh: null };
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
export function groupMemoryGraph(state) {
  const segments = segmentGroupMessages(state.messages);
  const nodes = [{ id: 'group', kind: 'group', label: groupSpace.name }];
  const links = [];
  const add = (node) => { if (!nodes.some(n => n.id === node.id)) nodes.push(node); };
  const edge = (from, to, label) => links.push({ id: `${from}:${to}:${label}`, from, to, label });
  for (const author of groupSpace.members) {
    add({ id: `member:${author}`, kind: 'member', label: author, author });
    edge('group', `member:${author}`, '群成员');
  }
  for (const [index, segment] of segments.entries()) {
    add({ id: segment.id, kind: 'segment', label: `对话段 ${index + 1}`, segmentId: segment.id });
    edge('group', segment.id, '包含对话');
    for (const word of segment.keywords) {
      const id = `keyword:${word}`;
      add({ id, kind: 'keyword', label: word, keyword: word });
      edge(segment.id, id, '讨论话题');
    }
  }
  for (const memory of state.memories) {
    add({ id: `memory:${memory.id}`, kind: 'memory', label: memory.summary, memoryId: memory.id, status: memory.status });
    edge(memory.subject === '项目群' ? 'group' : `member:${memory.subject}`, `memory:${memory.id}`, memory.kind);
    if (memory.previous) edge(`memory:${memory.previous}`, `memory:${memory.id}`, '更正为');
    for (const messageId of [memory.evidence, memory.changedBy].filter(Boolean)) {
      const message = state.messages.find(m => m.id === messageId);
      if (!message) continue;
      add({ id: `source-${message.id}`, kind: 'evidence', label: `${message.author}的原话`, messageId: message.id });
      edge(`memory:${memory.id}`, `source-${message.id}`, messageId === memory.evidence ? '来源' : '状态变更');
    }
  }
  return { nodes, links, segments };
}

export function groupMemberPortrait(state, author) {
  const messages = state.messages.filter(m => m.author === author);
  const segments = segmentGroupMessages(state.messages);
  const topics = [...new Set(segments.flatMap(s => s.keywords.filter(word => s.messages.some(m => m.author === author && m.text.includes(word)))))];
  const preferences = state.memories.filter(m => m.subject === author && m.slot === 'preference');
  return { author, messages, topics, preferences, evidence: messages.map(m => m.id) };
}
