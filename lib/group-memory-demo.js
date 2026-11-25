// 独立的虚构群演示数据；不读取真实群聊或 MTAA 的浏览器记忆。
import { groupMemoryPreset } from './whale-demo-data.js';

const at = value => Date.parse(`${value.replace(' ', 'T')}:00+08:00`);
const withTime = ({ time, ...message }) => ({ ...message, time: at(time) });
const initialMessages = groupMemoryPreset.initialMessages.map(withTime);
const changes = {
  correction: withTime(groupMemoryPreset.correction),
  revoke: withTime(groupMemoryPreset.revoke),
};
const phrases = ['校园导览原型', '用户访谈记录', '演示脚本', '流程图', '交互细节', '授权流程', '创新工坊', '项目讨论', '访谈记录', '演示流程', '课程设计', '开题报告', '小组分工', '原型联调', '实验记录', '原始数据', '设备培训', '城市漫步', '志愿讲解', '饮水机报修', '宿舍卫生检查'];
export const groupSpace = {
  name: groupMemoryPreset.name,
  short: groupMemoryPreset.short,
  description: groupMemoryPreset.description,
  members: [...groupMemoryPreset.members],
};
const expectedMeetings = groupMemoryPreset.expectedMemories.filter(memory => memory.slot === 'meeting');
const expectedPreference = groupMemoryPreset.expectedMemories.find(memory => memory.slot === 'preference');
const meetingAuthor = changes.correction.author;
const preferenceAuthor = initialMessages.find(message => message.id === expectedPreference.sourceMessageId)?.author;

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
    if (message.author === meetingAuthor && message.text.startsWith('撤销：')) {
      for (const memory of next.memories.filter(item => item.slot === 'meeting')) { memory.status = 'revoked'; memory.changedBy = message.id; }
    } else if (message.author === meetingAuthor && message.text.startsWith('更正：') && activeMeeting) {
      activeMeeting.status = 'superseded'; activeMeeting.changedBy = message.id;
      next.memories.push({ id: 'meeting-v2', slot: 'meeting', kind: '群公共事实', summary: expectedMeetings[1].summary, status: 'active', evidence: message.id, subject: groupSpace.short, previous: activeMeeting.id });
    } else if (message.author === meetingAuthor && message.text.includes('讨论校园导览原型')) {
      next.memories.push({ id: 'meeting-v1', slot: 'meeting', kind: '群公共事实', summary: expectedMeetings[0].summary, status: 'active', evidence: message.id, subject: groupSpace.short });
    } else if (message.author === preferenceAuthor && message.text.includes('我喜欢先看流程图')) {
      next.memories.push({ id: 'member-preference', slot: 'preference', kind: '成员公开自述', summary: expectedPreference.summary, status: 'active', evidence: message.id, subject: expectedPreference.subject });
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
    add({ id: `member:${author}`, kind: 'member', label: author, author, description: `${space.short}成员 · 发言 ${count} 条消息` });
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
