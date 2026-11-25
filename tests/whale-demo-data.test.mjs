import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { applySuggestion, extractSuggestion, fmt, fresh, publishers, scenarios } from '../lib/engine.js';
import { backgrounds, heroChat, memberDirectory, recommendedHeroBackground, scenarioSeeds } from '../lib/whale-demo-data.js';

const day = ms => new Date(ms + 8 * 3600000).toISOString().slice(0, 10);
const dateTime = ms => `${day(ms)} ${new Date(ms + 8 * 3600000).toISOString().slice(11, 16)}`;

test('all six Whale scenarios seed successfully and grade has complete publishers', () => {
  assert.deepEqual(scenarios.map(scene => scene.id), ['grade', 'course', 'club', 'project', 'lab', 'home']);
  assert.equal(recommendedHeroBackground, 'grade');
  assert(backgrounds.some(background => background.id === 'grade'));
  for (const scene of scenarios) {
    const state = fresh(scene.id);
    assert.equal(state.scenario, scene.id);
    assert.equal(state.messages.length, scenarioSeeds[scene.id].messages.length);
    assert(state.messages.every(message => memberDirectory[scene.id].some(member => member.name === message.author)));
  }
  assert.deepEqual(publishers({ scenario: 'grade' }), ['辅导员', '学习委员', '我']);
});

test('grade seeds extract tasks, corrected event details, sports requirements and noise separation', () => {
  const state = fresh('grade');
  const learning = state.tasks.find(task => task.title === '青年大学习');
  assert(learning);
  assert.equal(dateTime(learning.due), '2026-11-22 18:00');

  const safety = state.tasks.find(task => task.title === '安全教育');
  assert(safety, JSON.stringify({ tasks: state.tasks.map(task => ({ title: task.title, kind: task.kind, due: task.due })), safetyMessages: state.messages.filter(message => message.text.includes('安全教育')).map(message => ({ text: message.text, outcome: message.outcome })) }));
  assert.equal(safety.kind, 'event');
  assert.equal(dateTime(safety.due), '2026-11-21 10:00');
  assert.equal(safety.location.value, '学生活动中心报告厅');
  assert(safety.sources.length >= 2);
  const originalSafety = Date.UTC(2026, 10, 20, 6, 30);
  assert(safety.history.some(entry => entry.text === `日期更新：${fmt(originalSafety)} → ${fmt(safety.due)}`));

  const materials = state.tasks.find(task => task.title === '家庭经济困难学生材料');
  assert(materials);
  assert.equal(dateTime(materials.due), '2026-11-25 17:00');
  assert.equal(materials.location.value, '线上表单');

  const sports = state.tasks.find(task => task.title === '体育测试');
  assert(sports);
  assert.equal(sports.kind, 'event');
  assert.equal(dateTime(sports.due), '2026-11-24 14:00');
  assert.equal(sports.location.value, '东区田径场');

  for (const noise of scenarioSeeds.grade.noiseExamples) {
    const message = state.messages.find(message => message.text === noise);
    assert(['chat', 'ignored'].includes(message.outcome.kind));
    assert(!state.tasks.some(task => task.sources.includes(message.id)));
  }
  const cancelledLecture = state.messages.find(message => message.text.includes('心理讲座取消'));
  assert.equal(cancelledLecture.outcome.kind, 'updated');
  const lecture = state.tasks.find(task => task.title === '心理讲座');
  assert(lecture);
  assert.equal(lecture.status, 'cancelled');
  assert(lecture.sources.includes(cancelledLecture.id));
});

test('grade keeps suggestion confirmation, idempotent add, dismiss and restore behavior', () => {
  const state = fresh('grade');
  const before = state.tasks.length;
  extractSuggestion(state, '年级汇总表11月28日18:00前提交。', '学习委员');
  const suggestion = state.suggestions.at(-1);
  assert(suggestion);
  assert.equal(suggestion.title, '年级汇总表');
  assert.equal(state.tasks.length, before);
  applySuggestion(state, suggestion.id, 'add');
  applySuggestion(state, suggestion.id, 'add');
  assert.equal(state.tasks.length, before + 1);

  extractSuggestion(state, '安全承诺书12月1日18:00前提交。', '辅导员');
  const dismissed = state.suggestions.at(-1);
  applySuggestion(state, dismissed.id, 'dismiss');
  assert.equal(dismissed.status, 'dismissed');
  applySuggestion(state, dismissed.id, 'restore');
  assert.equal(dismissed.status, 'pending');
  assert(!state.tasks.some(task => task.title === '安全承诺书'));
});

test('simulation mappings cover every scenario without undefined group or persona', async () => {
  const dependency = `export const memberDirectory=${JSON.stringify(memberDirectory)};export const scenarios=${JSON.stringify(scenarios)};`;
  const dependencyUrl = `data:text/javascript;base64,${Buffer.from(dependency).toString('base64')}`;
  const source = readFileSync(new URL('../src/sim.ts', import.meta.url), 'utf8').replace('../lib/whale-demo-data.js', dependencyUrl);
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  const sim = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}#whale-sim`);
  assert.deepEqual(Object.keys(sim.groups), scenarios.map(scene => scene.id));
  for (const scene of scenarios) {
    assert.equal(sim.groups[scene.id].title, scene.name);
    assert.equal(sim.groups[scene.id].icon, scene.mark);
    for (const member of memberDirectory[scene.id]) {
      const persona = sim.persona(scene.id, member.name);
      assert.equal(persona.name, member.name);
      assert.equal(persona.tag, { owner: '群主', admin: '管理员', member: undefined }[member.role]);
    }
    const counts = sim.readCount(scene.id, { id: 'm1', text: '测试已读人数' });
    assert(counts.read >= 0 && counts.read < counts.total);
  }
  assert(sim.isNotice('grade', { author: '学习委员', text: scenarioSeeds.grade.messages[1][1] }));
  assert(sim.isNotice('grade', { author: '辅导员', text: scenarioSeeds.grade.messages[9][1] }));
  assert(!sim.isNotice('grade', { author: '同学', text: scenarioSeeds.grade.messages[0][1] }));
  assert(!sim.isNotice('grade', { author: '学习委员', text: scenarioSeeds.grade.noiseExamples[0] }));
});

test('Showcase binds every hero task field and recommends the JSON background', () => {
  const source = readFileSync(new URL('../src/components/Showcase.tsx', import.meta.url), 'utf8');
  const preview = readFileSync(new URL('../src/components/HomePreview.tsx', import.meta.url), 'utf8');
  assert(source.includes('import { backgrounds, heroChat, recommendedHeroBackground }'));
  assert(source.includes('<HomePreview>'));
  for (const binding of ['taskCard.title', 'taskCard.status', 'taskCard.deadline', 'taskCard.source', 'taskCard.quote', 'reminder.title', 'reminder.text']) {
    assert(source.includes(`{${binding}}`), `hero card must bind ${binding}`);
  }
  assert(source.includes('taskCard.requirements.map'));
  assert(source.includes('data-recommended-background={recommendedBackground.id}'));
  assert(source.includes('store.active = recommendedBackground.id'));
  assert(!source.includes('课程作业'));
  assert(!source.includes('数字电路 · 2024级1班'));
  assert(preview.includes('<SchedulePreview'));
  assert(preview.includes('<DevicePreview'));
  assert(preview.includes('setActive(n => (n + 1) % labels.length)'), 'HomePreview rotation remains available');
  assert.equal(heroChat.taskCard.title, '项目路演材料');
  assert.equal(heroChat.taskCard.deadline, '11月26日 18:00');
  assert.equal(heroChat.taskCard.source, '鲸彩创新 · 项目协作群');
  assert.equal(heroChat.taskCard.quote, '项目路演材料11月26日18:00前提交到课程平台');
  assert.deepEqual(heroChat.taskCard.requirements, ['文件命名为“小组编号-路演材料”', '附演示视频链接', '只交线上版本']);
  assert.equal(heroChat.reminder.text, '临近截止：项目路演材料（还有 1 小时）');
});
