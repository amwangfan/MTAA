// 域状态 store：复用 lib 纯逻辑，负责持久化/迁移/时钟/发送/门控，以及 AI 失败时的规则回退。
import * as E from "../lib/engine.js";
import { demoDataVersion } from "../lib/whale-demo-data.js";
import * as M from "../lib/memory.js";
import * as D from "../lib/devices.js";
import * as I from "../lib/initiative.js";
import {planStudyEnvironment} from "../lib/study-environment.js";
import {preferenceKey} from "../lib/memory-profiles.js";
import { createIntroSnapshot } from "../lib/intro-snapshot.js";
import { processAIMessage, processMemoryAI, decideInitiativeAI, resolveAIBusy } from "../lib/ai-client.js";
import { apiFetch } from "./api";

export const KEY = "whale.visual-demo.v2";
export const CHAT_KEY = "whale.memory-chat.v1";
export type View = "home" | "center" | "messages" | "memory" | "initiative" | "devices" | "about";
export type Track = "study" | "life" | "all";
const groupIds = E.scenarios.map((scene: any) => scene.id);
export const TRACKS: Record<Track, { label: string; desc: string; groups: string[] }> = {
  study: { label: "学习", desc: "年级通知、课程、项目、实验室", groups: groupIds.filter(id => ["grade", "course", "project", "lab"].includes(id)) },
  life: { label: "生活", desc: "社团、宿舍、设备", groups: groupIds.filter(id => ["club", "home"].includes(id)) },
  all: { label: "全部", desc: "六个群一起整理", groups: groupIds },
};

const listeners = new Set<() => void>();
export function notify() { listeners.forEach((f) => f()); }
export function subscribe(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }

export const store = {
  states: {} as Record<string, any>,
  followed: new Set<string>(TRACKS.study.groups),
  track: "study" as Track,
  active: "course",
  extractMode: "ai" as "ai" | "rules",
  initiative: I.initInitiative() as any,
  demoAuthor: "我",
  busy: false,
  focusMessageId: null as string | null,
  notice: "",
  reminderOpen: false,
  memoryAIEnabled: false,
  studyPlan: null as any,
  selected: null as string | null,
  ai: { configured: null as boolean | null, overloaded: false, limits: null as any, lastFallback: "" },
  typing: null as null | { scene: string; author: string },
  demo: { running: false, paused: false, phase: "showing" as "entering" | "showing" | "leaving", step: 0, total: 0, caption: "", sub: "", target: "", focusLabel: "" },
  ruleFallbackOpen: false,
  ruleFallbackQueue: [] as Array<(confirmed: boolean) => void>,
};

export function requestRuleFallback(): Promise<boolean> {
  return new Promise((resolve) => {
    store.ruleFallbackQueue.push(resolve);
    if (!store.ruleFallbackOpen) { store.ruleFallbackOpen = true; notify(); }
  });
}
export function answerRuleFallback(confirmed: boolean) {
  const resolve = store.ruleFallbackQueue.shift();
  store.ruleFallbackOpen = false;
  if (!confirmed) store.notice = "AI 暂时繁忙，已保留当前内容，请稍后重试。";
  resolve?.(confirmed);
  notify();
  if (store.ruleFallbackQueue.length) queueMicrotask(() => {
    if (store.ruleFallbackQueue.length) { store.ruleFallbackOpen = true; notify(); }
  });
}

// 设备是宿舍里的一套：所有群共享同一个设备对象（聊天指令/主动判断/手动控制都作用在这里）。
function linkDevices() {
  const home = store.states.home || Object.values(store.states)[0];
  const shared = D.initDevices(home);
  Object.values(store.states).forEach((s: any) => { s.devices = shared; });
}
function freshAll() {
  E.scenarios.forEach((x: any) => { store.states[x.id] = E.fresh(x.id); });
  Object.values(store.states).forEach((s: any) => { s.suggestions = s.suggestions || []; s.memory = s.memory || []; });
  linkDevices();
}

// 载入 + 迁移
let restoredState = false;
try {
  const old = JSON.parse(localStorage.getItem(KEY) || "null");
  if (old && old.demoDataVersion === demoDataVersion && E.scenarios.some((s: any) => s.id === old.active)) {
    restoredState = true;
    store.active = old.active;
    if (["ai", "rules"].includes(old.extractMode)) store.extractMode = old.extractMode;
    if (old.track && (TRACKS as any)[old.track]) store.track = old.track;
    if (Array.isArray(old.groups)) store.followed = new Set(old.groups.filter((id: string) => E.scenarios.some((x: any) => x.id === id)));
    for (const [id, s] of Object.entries<any>(old.states || {})) {
      if (s.version === 1 && Array.isArray(s.messages) && Array.isArray(s.tasks) && Array.isArray(s.reminders) && Number.isFinite(s.now) && Number.isInteger(s.seq)) {
        s.suggestions = s.suggestions || []; s.memory = s.memory || []; D.initDevices(s); store.states[id] = s;
      }
    }
    if (old.initiative) store.initiative = { ...I.initInitiative(), ...old.initiative };
  }
} catch { /* ignore */ }
E.scenarios.forEach((x: any) => { if (!store.states[x.id]) store.states[x.id] = E.fresh(x.id); });
Object.values(store.states).forEach((s: any) => { s.suggestions = s.suggestions || []; s.memory = s.memory || []; D.initDevices(s); });
Object.values(store.states).forEach((s: any) => {
  if (s.publisherVersion !== 2) { if (Array.isArray(s.publisherOverride) && !s.publisherOverride.includes("我")) s.publisherOverride.push("我"); E.rebuildPublisherTasks(s); }
  else if (s.noticeParserVersion !== 1) E.rebuildPublisherTasks(s);
});
linkDevices();
// Retain history but retire unapproved requests produced by the old group-chat path.
for(const p of store.states.home.devices.pending){if(p.source==='chat'&&p.status==='needs_approval')p.status='superseded';}
const latestClock = Math.max(...Object.values(store.states).map((s: any) => s.now));
Object.values(store.states).forEach((s: any) => { s.now = latestClock; });
if (!store.followed.size) store.followed = new Set(TRACKS[store.track].groups);
if (!store.followed.has(store.active)) store.active = [...store.followed][0];
if (!restoredState) {
  try {
    if (!localStorage.getItem("whale.intro-snapshot.v2")) {
      const snapshot = createIntroSnapshot(store.states, latestClock);
      if (snapshot) {
        store.initiative.inbox.push(snapshot.inboxItem);
        store.initiative.ledger.push(snapshot.ledgerEntry);
        store.initiative.used = 1; store.initiative.usedDate = snapshot.usedDate;
        store.reminderOpen = true;
        localStorage.setItem("whale.intro-snapshot.v2", "1");
        persist();
      }
    }
  } catch { /* 首次快照失败不影响正常使用 */ }
}

export const state = () => store.states[store.active];
export const tickStates = () => E.scenarios.filter((x: any) => store.followed.has(x.id)).map((x: any) => store.states[x.id]);
export const allRows = () => E.scenarios.filter((x: any) => store.followed.has(x.id)).flatMap((sc: any) => store.states[sc.id].tasks.map((t: any) => ({ scene: sc, task: t })));
export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({ version: 2, demoDataVersion, active: store.active, track: store.track, states: store.states, groups: [...store.followed], extractMode: store.extractMode, initiative: store.initiative })); } catch { store.notice = "浏览器保存失败，请检查存储空间；当前操作尚未持久化。"; }
}

export async function checkAI() {
  try {
    const r = await apiFetch("/api/v1/ai-status", { signal: AbortSignal.timeout(8000) });
    const i = await r.json();
    Object.assign(store.ai, { configured: Boolean(i.configured), limits: i.limits || null });
  } catch { store.ai.configured = false; }
  notify();
}
export const aiLive = () => store.extractMode === "ai" && store.ai.configured === true;

export function setTrack(t: Track) {
  if (store.busy) return;
  store.track = t; store.followed = new Set(TRACKS[t].groups);
  if (!store.followed.has(store.active)) store.active = TRACKS[t].groups[0];
  store.focusMessageId = null; persist(); notify();
}

// 时钟 + 节拍（AI 已配置时走 /api/v1/initiative，失败回退规则判断并标注）
let ticking = false; let playTimer: any = null;
let clockVersion = 0;
async function runTicks(from: number, to: number) {
  const version = clockVersion;
  const ini = store.initiative; const iv = ini.interval * 60000; const steps = Math.floor((to - from) / iv); const ts = tickStates();
  const at = async (t: number) => {
    if (version !== clockVersion) return null;
    const tryAI = aiLive();
    let aiDecision: any = null; let failure: any = null;
    if (tryAI) {
      const result = await decideInitiativeAI(I.buildContext(ts, t, ini), { fetcher: apiFetch });
      if (result?.ok) { aiDecision = result.decision; store.ai.overloaded = false; } else failure = result;
      if (failure?.code === "AI_BUSY") { store.ai.overloaded = true; if (!(await resolveAIBusy(failure, requestRuleFallback))) return null; }
    }
    if (version !== clockVersion) return null;
    const entry: any = I.tick(ts, t, ini, { aiDecision });
    if (tryAI && !aiDecision) { entry.fallback = true; store.ai.lastFallback = failure?.code === "AI_BUSY" ? "繁忙（仅本次）" : "主动判断请求失败"; }
    return t;
  };
  if (steps > 12) { const next = await at(to); return { cancelled: next === null, last: next ?? from, stale: version !== clockVersion }; }
  let last = from;
  for (let k = 1; k <= steps; k++) { const next = await at(from + k * iv); if (next === null) return { cancelled: true, last, stale: version !== clockVersion }; last = next; }
  if (to > from + steps * iv) { const next = await at(to); if (next === null) return { cancelled: true, last, stale: version !== clockVersion }; last = next; }
  return { cancelled: false, last, stale: version !== clockVersion };
}
export async function moveClock(to: number) {
  if (ticking) return; ticking = true;
  try {
    const from = state().now;
    Object.values(store.states).forEach((s: any) => { s.now = to; });
    const settled = await runTicks(from, to);
    if (settled.cancelled && !settled.stale) { Object.values(store.states).forEach((s: any) => { s.now = settled.last; }); store.notice = "AI 暂时繁忙，已保留当前现场，请稍后重试。"; }
    persist(); notify();
  } finally { ticking = false; }
}
export function resetClock() {
  clockVersion += 1;
  setAutoplay(false);
  Object.values(store.states).forEach((s: any) => { s.now = E.BASE; });
  store.initiative.lastTick = E.BASE;
  persist();
  notify();
}
export function setAutoplay(on: boolean) {
  store.initiative.autoplay = on; clearInterval(playTimer);
  if (on) playTimer = setInterval(() => { if (store.busy) return; moveClock(state().now + (Number(store.initiative.speed) || 1) * 60000).then(() => { persist(); }); }, 1000);
  persist(); notify();
}

const reasonText = (code?: string) => ({ AI_NOT_CONFIGURED: "未配置", RATE_LIMITED: "调用太频繁", DAILY_LIMIT: "今日额度已用完", AI_AUTH_ERROR: "凭据不可用", BAD_AI_RESPONSE: "返回结果无效", INVALID_EXTRACTION: "结果未通过原文校验", ORIGIN_REJECTED: "来源被拒绝" } as Record<string, string>)[code || ""] || "暂时不可用";

async function processMemoryWithFallback(s: any, message: any) {
  const result = await processMemoryAI(s, message, { fetcher: apiFetch });
  if (result?.code !== "AI_BUSY") return;
  store.ai.overloaded = true;
  const useRules = await resolveAIBusy(result, requestRuleFallback);
  if (useRules) { message.memoryFallback = true; store.ai.lastFallback = "繁忙（仅本次）"; }
  else store.notice = "AI 暂时繁忙，已有规则记忆候选保持不变，请稍后重试。";
}

// 发送：AI 模式 → /api/v1/extract；AI 未配置/失败/限流 → 自动回退规则引擎，并在消息与提示里明确标注。
export async function sendMessage(text: string, author: string, opts: { forceRules?: boolean } = {}) {
  if (store.busy || !text.trim()) return { kind: "ignored", text: "请等待上一条消息完成，或填写消息内容。" };
  const s = state(); store.busy = true; store.typing = null; notify();
  let outcome: any; let processLast = true;
  try {
    const wantAI = store.extractMode === "ai" && !opts.forceRules;
    const fallback = (reason: string, aiBusy = false) => {
      outcome = E.extractSuggestion(s, text, author);
      const last = s.messages.at(-1);
      if (last && last.outcome) { last.fallback = reason; last.outcome = { ...last.outcome, text: aiBusy ? `规则引擎 · ${last.outcome.text}` : `AI ${reason}，已回退规则模式 · ${last.outcome.text}` }; outcome = last.outcome; }
      store.ai.lastFallback = reason;
    };
    if (!wantAI) outcome = E.extractSuggestion(s, text, author);
    else if (store.ai.configured === false) fallback("未配置");
    else {
      const message = { id: "m" + ++s.seq, author, text, time: s.now, outcome: { kind: "ai_pending", text: "等待AI整理" } };
      s.messages.push(message); (s as any).lastSendMessageId = message.id; persist(); notify();
      outcome = await processAIMessage(s, message, { fetcher: apiFetch });
      if (outcome?.kind === "ai_pending" && outcome.code) {
        if (outcome.code === "AI_BUSY") {
          store.ai.overloaded = true;
          const useRules = await resolveAIBusy(outcome, requestRuleFallback);
          if (useRules) { const idx = s.messages.findIndex((m: any) => m.id === message.id); if (idx >= 0) s.messages.splice(idx, 1); fallback("繁忙", true); store.ai.lastFallback = "繁忙（仅本次）"; }
          else { const current = s.messages.find((m: any) => m.id === message.id); if (current) current.outcome = { kind: "error", code: "AI_BUSY", text: "AI 暂时繁忙，消息已保留，请稍后重试。" }; outcome = { kind: "cancelled", code: "AI_BUSY", text: "AI 暂时繁忙，消息已保留，请稍后重试。" }; store.notice = "AI 暂时繁忙，已保留消息和输入，请稍后重试。"; processLast = false; }
        } else { const idx = s.messages.findIndex((m: any) => m.id === message.id); if (idx >= 0) s.messages.splice(idx, 1); if (outcome.code === "AI_NOT_CONFIGURED") store.ai.configured = false; fallback(reasonText(outcome.code)); }
      } else { store.ai.lastFallback = ""; store.ai.overloaded = false; }
    }
    if (processLast) {
      const last = s.messages.at(-1);
      if (last) { M.extractInto(s, last, "rules"); if (aiLive() && store.memoryAIEnabled) await processMemoryWithFallback(s, last); }
    }
  } catch { outcome = { kind: "error", text: "整理未完成，消息已保留，请重试。" }; }
  store.busy = false; persist(); notify();
  return outcome;
}
export async function retryPending() {
  if (store.busy) return; store.busy = true; notify(); let done = 0;
  const completed: Array<{ s: any; message: any }> = [];
  try {
    const pend = tickStates().flatMap((s: any) => s.messages.filter((m: any) => E.publishers(s).includes(m.author) && (m.outcome?.kind === "ai_pending" || (m.outcome?.kind === "review" && !m.taskId))).map((m: any) => ({ s, id: m.id })));
    for (const { s, id } of pend) {
      const message = s.messages.find((m: any) => m.id === id);
      const previousSuggestionIds = new Set((s.suggestions || []).filter((suggestion: any) => suggestion.messageId === id && suggestion.status === "pending").map((suggestion: any) => suggestion.id));
      const o = await processAIMessage(s, message, { fetcher: apiFetch });
      if (o.code === "AI_BUSY") {
        store.ai.overloaded = true;
        const useRules = await resolveAIBusy(o, requestRuleFallback);
        if (!useRules) { message.outcome = { kind: "ai_pending", code: "AI_BUSY", text: "AI 暂时繁忙，消息已保留，请稍后重试。" }; store.notice = "AI 暂时繁忙，已保留消息，请稍后重试。"; break; }
        s.suggestions = (s.suggestions || []).filter((suggestion: any) => !previousSuggestionIds.has(suggestion.id));
        const index = s.messages.findIndex((m: any) => m.id === id); if (index >= 0) s.messages.splice(index, 1);
        E.extractSuggestion(s, message.text, message.author);
        const last = s.messages.at(-1); if (last) { last.fallback = "繁忙"; last.outcome = { ...last.outcome, text: `规则引擎 · ${last.outcome.text}` }; completed.push({ s, message: last }); }
        store.ai.lastFallback = "繁忙（仅本次）"; done++;
      } else { if (o.code === "AI_NOT_CONFIGURED") { store.notice = o.text; break; } if (o.kind !== "ai_pending") { store.ai.overloaded = false; s.suggestions = (s.suggestions || []).filter((suggestion: any) => !previousSuggestionIds.has(suggestion.id)); completed.push({ s, message }); done++; } }
      persist();
    }
    for (const { s, message } of completed) { M.extractInto(s, message, "rules"); if (aiLive() && store.memoryAIEnabled) await processMemoryWithFallback(s, message); }
    if (!store.notice) store.notice = `已重新处理 ${done} 条消息。`;
  } catch { store.notice = "重试未完成，消息仍保留，可稍后重试。"; } finally { store.busy = false; persist(); notify(); }
}

// 重置演示数据：回到 2026-11-20 09:00 的初始群聊（不清除使用引导的已读状态）。
export function resetData() {
  setAutoplay(false);
  store.states = {}; freshAll(); store.initiative = I.initInitiative(); store.selected = null; store.focusMessageId = null;
  store.followed = new Set(TRACKS[store.track].groups); store.active = TRACKS[store.track].groups[0];
  store.notice = ""; store.ai.lastFallback = ""; store.ai.overloaded = false; store.studyPlan=null;
  persist(); notify();
}
export function resetAll() {
  try { localStorage.removeItem(CHAT_KEY); localStorage.removeItem(preferenceKey); localStorage.removeItem("whale.intro-snapshot.v2"); } catch { /* ignore */ }
  resetData(); location.reload();
}

// 便捷动作
export function requestStudyEnvironment(question:string,profileId:string){
  let edits={};
  try { edits=JSON.parse(localStorage.getItem(preferenceKey)||'{}')?.[profileId] || {}; } catch {}
  const plan=planStudyEnvironment(state(),{question,profileId,edits});
  if(plan){store.studyPlan=plan;persist();notify();}
  return plan;
}
export const act = {
  addSug: (scene: string, id: string) => { const r = E.applySuggestion(store.states[scene], id, "add"); persist(); notify(); return r; },
  dismissSug: (scene: string, id: string) => { E.applySuggestion(store.states[scene], id, "dismiss"); persist(); notify(); },
  restoreSug: (scene: string, id: string) => { E.applySuggestion(store.states[scene], id, "restore"); persist(); notify(); },
  promote: (scene: string, id: string) => { M.promote(store.states[scene], id, store.states[scene].now); persist(); notify(); },
  forget: (scene: string, id: string) => { M.forget(store.states[scene], id, store.states[scene].now); persist(); notify(); },
  status: (id: string, st: string) => { E.changeStatus(state(), id, st); persist(); notify(); },
  devManual: async (id: string, cap: string, args: any) => { await D.manualControl(state(), id, cap, args); persist(); notify(); },
  devApprove: async (id: string) => { await D.approve(state(), id); persist(); notify(); },
  devReject: (id: string) => { D.reject(state(), id); persist(); notify(); },
  iniRead: (id: string) => { const r = store.initiative.inbox.find((x: any) => x.id === id); if (r) r.read = true; persist(); notify(); },
  iniStop: (topic: string) => { I.addFeedback(store.initiative, topic); store.initiative.inbox.forEach((x: any) => { if (x.topic === topic) x.read = true; }); persist(); notify(); },
  reset: () => { const now = state().now; const devices = state().devices; store.states[store.active] = E.fresh(store.active); store.states[store.active].now = now; store.states[store.active].devices = devices; store.selected = null; persist(); notify(); },
};
