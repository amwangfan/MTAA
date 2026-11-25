import { day } from './engine.js';

export function createIntroSnapshot(states, now) {
  const candidates = Object.values(states).flatMap(state => state.tasks
    .filter(task => task.status === 'todo' && task.due)
    .map(task => ({ state, task })))
    .sort((a, b) => a.task.due - b.task.due);
  const selected = candidates[0];
  if (!selected) return null;
  const { state, task } = selected;
  const text = `演示快照：临近截止「${task.title}」`;
  const reason = '首次访问演示快照（规则引擎，不是真实 AI 判断）';
  return {
    inboxItem: { id: 'pr-intro', at: now, action: 'remind', text, reason, urgency: 'normal', evidence: task.sources || [], topic: 'deadline', read: false, snapshot: true },
    ledgerEntry: { id: 'tick-intro', at: now, promptSummary: '首次访问 · 演示快照', prompt: `演示任务：${task.title}；来源群：${state.scenario}`, decision: { action: 'remind', text, reason, evidence: task.sources || [], urgency: 'normal', deviceProposal: null }, gate: { status: 'ready', reason: '首次演示快照' }, delivered: true, engine: 'sim' },
    usedDate: day(now),
  };
}
