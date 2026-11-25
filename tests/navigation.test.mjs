import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const navbar = read('src/components/Navbar.tsx');
const app = read('src/App.tsx');
const tabBar = read('src/components/TabBar.tsx');
const aiSettings = read('src/components/AISettings.tsx');
const trackFilter = read('src/components/TrackFilter.tsx');
const showcase = read('src/components/Showcase.tsx');
const about = read('src/components/AboutView.tsx');
const store = read('src/store.ts');
const demoData = read('lib/whale-demo-data.js');

const { outputText } = ts.transpileModule(tabBar, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
});
const tabModule = { exports: {} };
new Function('require', 'exports', 'module', outputText)(require, tabModule.exports, tabModule);
const { tabKeyTarget } = tabModule.exports;

test('Navbar exposes exactly four primary entries with the baseline View mapping', () => {
  const tabDeclaration = navbar.match(/const tabs[^=]*=\s*\[([\s\S]*?)\n\];/);
  assert(tabDeclaration, 'primary tab declaration exists');
  const entries = [...tabDeclaration[1].matchAll(/\{ id: "([^"]+)", label: "([^"]+)"/g)].map((match) => [match[1], match[2]]);
  assert.deepEqual(entries, [['home', '首页'], ['messages', '消息'], ['center', '待办'], ['memory', '助手']]);
  assert.match(navbar, /view === "initiative" \? "center"/);
  assert.match(navbar, /view === "devices" \? "memory"/);
  assert.doesNotMatch(navbar, /track-switch|TRACKS|setTrack/);
  assert.doesNotMatch(navbar, /检查中|规则演示模式/);
  for (const label of ['AI接入', 'AI超过负载', 'AI未接入']) assert(navbar.includes(label));
});

test('TabBar has linked tab semantics, roving focus, and wraparound keyboard navigation', () => {
  for (const semantic of ['role="tablist"', 'role="tab"', 'aria-selected={active === tab.id}', 'aria-controls={`tabpanel-${scope}-${tab.id}`}', 'tabIndex={active === tab.id ? 0 : -1}']) {
    assert(tabBar.includes(semantic), semantic);
  }
  assert.equal(tabKeyTarget('ArrowRight', 0, 2), 1);
  assert.equal(tabKeyTarget('ArrowRight', 1, 2), 0);
  assert.equal(tabKeyTarget('ArrowLeft', 0, 2), 1);
  assert.equal(tabKeyTarget('ArrowLeft', 1, 2), 0);
  assert.equal(tabKeyTarget('Home', 1, 2), 0);
  assert.equal(tabKeyTarget('End', 0, 2), 1);
  assert.equal(tabKeyTarget('Enter', 0, 2), null);
  assert.equal(tabKeyTarget('ArrowRight', 0, 0), null);
});

test('App switches center/initiative and memory/devices without changing View', () => {
  assert.match(app, /active=\{todoTab\}/);
  assert.match(app, /id === "reminders" \? "initiative" : "center"/);
  assert.match(app, /active=\{assistantTab\}/);
  assert.match(app, /id === "environment" \? "devices" : "memory"/);
  assert.match(app, /role="tabpanel" id=\{`tabpanel-todos-\$\{todoTab\}`\} aria-labelledby=\{`tab-todos-\$\{todoTab\}`\}/);
  assert.match(app, /role="tabpanel" id=\{`tabpanel-assistant-\$\{assistantTab\}`\} aria-labelledby=\{`tab-assistant-\$\{assistantTab\}`\}/);
  assert.doesNotMatch(store, /type View =[^\n]*"todos"|type View =[^\n]*"assistant"/);
});

test('TrackFilter delegates to existing tracks and retains grade plus all six groups', () => {
  assert.match(trackFilter, /Object\.keys\(TRACKS\)/);
  assert.match(trackFilter, /onClick=\{\(\) => setTrack\(track\)\}/);
  assert.match(trackFilter, /aria-checked=\{store\.track === track\}/);
  assert.match(store, /study:[\s\S]*?\["grade", "course", "project", "lab"\]/);
  assert.match(store, /life:[\s\S]*?\["club", "home"\]/);
  assert.match(store, /all:[\s\S]*?groups: groupIds/);
  const groups = [...demoData.matchAll(/^  (grade|course|club|project|lab|home): \{/gm)].map((match) => match[1]);
  assert.deepEqual(groups, ['grade', 'course', 'club', 'project', 'lab', 'home']);
});

test('AISettings only switches understanding mode and traps/restores focus', () => {
  assert.equal((aiSettings.match(/<select\b/g) || []).length, 1);
  assert.match(aiSettings, /id="understanding-mode"/);
  assert.match(aiSettings, /store\.extractMode = event\.target\.value as "ai" \| "rules"/);
  assert.doesNotMatch(aiSettings, /模型|供应商|ai-provider|ai-model|loadModels|applyChoice|自动回退/);
  assert.match(aiSettings, /离线演示或失败兜底/);
  assert.match(aiSettings, /event\.key === "Escape"/);
  assert.match(aiSettings, /event\.shiftKey/);
  assert.match(aiSettings, /root\.inert = true/);
  assert.match(aiSettings, /previous\?\.isConnected\) previous\.focus/);
  assert.match(aiSettings, /aria-modal="true"/);
});

test('Showcase keeps six-group heroChat and adds capability cards with privacy boundaries', () => {
  assert.match(showcase, /import \{ aboutFeatures \} from "\.\/AboutView"/);
  assert.match(showcase, /aboutFeatures\.map/);
  assert.match(showcase, /heroChat\.messages\.map/);
  assert.match(showcase, /年级通知群、课程群、社团群、项目群、实验室群、宿舍群/);
  for (const copy of ['AI 为主，规则辅助', '待确认建议', '模拟设备', '逐次审批', '离线演示或失败兜底', '演示数据默认保存在你的浏览器', '必要消息上下文', '服务端和模型供应商', '密钥不会进入前端']) {
    assert(showcase.includes(copy), copy);
  }
});

test('AboutView exports shared features and App retains dialogs, footer, split, reminders, and clock', () => {
  assert.match(about, /export const aboutFeatures/);
  assert.match(about, /aboutFeatures\.map/);
  assert.match(about, /把六个群的通知/);
  assert.match(about, /AI 为主，规则辅助/);
  assert.match(about, /模拟设备/);
  assert.doesNotMatch(about, /AgentScope|DeepSeek/);
  for (const retained of ['RuleFallbackDialog', 'store.ruleFallbackOpen && <RuleFallbackDialog', 'AI_BUSY', 'site-footer', 'ClockBar', 'SplitView', 'ReminderCard', 'onClick={() => goto("about")}', 'onViewChange={goto}', 'openSplit']) {
    assert(app.includes(retained), retained);
  }
});
