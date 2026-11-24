// 域状态 store：复用 lib 纯逻辑，负责持久化/迁移/时钟/发送/门控，以及 AI 失败时的规则回退。
import * as E from "../lib/engine.js";
import * as M from "../lib/memory.js";
import * as D from "../lib/devices.js";
import * as I from "../lib/initiative.js";
import {planStudyEnvironment} from "../lib/study-environment.js";
import { processAIMessage, processMemoryAI, decideInitiativeAI } from "../lib/ai-client.js";
import { apiFetch, setAIChoice } from "./api";

export const KEY = "whale.visual-demo.v2";
export const CHAT_KEY = "whale.memory-chat.v1";
export const MODEL_KEY = "whale.ai-choice.v1";
export type ProviderInfo = { provider: string; label: string; models: string[]; live: boolean; default: string | null; error?: string | null };
export type View = "home" | "center" | "messages" | "memory" | "initiative" | "devices" | "about";
export type Track = "study" | "life" | "all";
export const TRACKS: Record<Track, { label: string; desc: string; groups: string[] }> = {
  study: { label: "学习", desc: "课程 · 项目 · 实验室", groups: ["course", "project", "lab"] },
  life: { label: "生活", desc: "社团 · 宿舍 · 设备", groups: ["club", "home"] },
  all: { label: "全部", desc: "五个群一起整理", groups: ["course", "club", "project", "lab", "home"] },
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
  memoryAIEnabled: false,
  studyPlan: null as any,
  selected: null as string | null,
  ai: { configured: null as boolean | null, model: null as string | null, provider: null as string | null, limits: null as any, lastFallback: "", providers: [] as ProviderInfo[], choice: { provider: "", model: "" }, loadingModels: false },
  typing: null as null | { scene: string; author: string },
  demo: { running: false, paused: false, phase: "showing" as "entering" | "showing" | "leaving", step: 0, total: 0, caption: "", sub: "", target: "", focusLabel: "" },
};

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
try {
  const old = JSON.parse(localStorage.getItem(KEY) || "null");
  if (old && E.scenarios.some((s: any) => s.id === old.active)) {
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

export const state = () => store.states[store.active];
export const tickStates = () => E.scenarios.filter((x: any) => store.followed.has(x.id)).map((x: any) => store.states[x.id]);
export const allRows = () => E.scenarios.filter((x: any) => store.followed.has(x.id)).flatMap((sc: any) => store.states[sc.id].tasks.map((t: any) => ({ scene: sc, task: t })));
export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({ version: 2, active: store.active, track: store.track, states: store.states, groups: [...store.followed], extractMode: store.extractMode, initiative: store.initiative })); } catch { store.notice = "浏览器保存失败，请检查存储空间；当前操作尚未持久化。"; }
}

export async function checkAI() {
  try {
    const r = await apiFetch("/api/v1/ai-status", { signal: AbortSignal.timeout(8000) });
    const i = await r.json();
    Object.assign(store.ai, { configured: Boolean(i.configured), model: i.model || null, provider: i.provider || null, limits: i.limits || null });
  } catch { store.ai.configured = false; }
  notify();
  if (store.ai.configured) await loadModels();
}
// 可选模型：服务端实时从各节点 /models 拉取；选择记在本浏览器，失效时回到服务端默认。
export async function loadModels(force = false) {
  store.ai.loadingModels = true; notify();
  try {
    const r = await apiFetch("/api/v1/models", { headers: force ? { "X-Whale-Refresh": "1" } : {}, signal: AbortSignal.timeout(15000) });
    const data = await r.json();
    if (r.ok && Array.isArray(data.providers)) store.ai.providers = data.providers;
  } catch { /* 保留旧列表 */ }
  let saved: any = null; try { saved = JSON.parse(localStorage.getItem(MODEL_KEY) || "null"); } catch { /* ignore */ }
  const cur = store.ai.choice.provider ? store.ai.choice : saved;
  applyChoice(cur?.provider, cur?.model, false);
  store.ai.loadingModels = false; notify();
}
export function applyChoice(provider?: string, model?: string, save = true) {
  const list = store.ai.providers;
  const p = list.find((x) => x.provider === provider) || list.find((x) => x.provider === store.ai.provider) || list[0];
  if (!p) { store.ai.choice = { provider: "", model: "" }; setAIChoice(store.ai.choice); return; }
  const m = model && p.models.includes(model) ? model : (p.default || p.models[0] || "");
  store.ai.choice = { provider: p.provider, model: m };
  setAIChoice(store.ai.choice);
  if (save) { try { localStorage.setItem(MODEL_KEY, JSON.stringify(store.ai.choice)); } catch { /* ignore */ } notify(); }
}
export const currentModelLabel = () => store.ai.choice.model || store.ai.model || "";
export const aiLive = () => store.extractMode === "ai" && store.ai.configured === true;

export function setTrack(t: Track) {
  if (store.busy) return;
  store.track = t; store.followed = new Set(TRACKS[t].groups);
  if (!store.followed.has(store.active)) store.active = TRACKS[t].groups[0];
  store.focusMessageId = null; persist(); notify();
}

// 时钟 + 节拍（AI 已配置时走 /api/v1/initiative，失败回退模拟判断并标注）
let ticking = false; let playTimer: any = null;
let clockVersion = 0;
async function runTicks(from: number, to: number) {
  const version = clockVersion;
  const ini = store.initiative; const iv = ini.interval * 60000; const steps = Math.floor((to - from) / iv); const ts = tickStates();
  const at = async (t: number) => {
    if (version !== clockVersion) return;
    const tryAI = aiLive();
    const ai = tryAI ? await decideInitiativeAI(I.buildContext(ts, t, ini), { fetcher: apiFetch }) : null;
    if (version !== clockVersion) return;
    const entry: any = I.tick(ts, t, ini, { aiDecision: ai });
    if (tryAI && !ai) { entry.fallback = true; store.ai.lastFallback = "主动判断请求失败"; }
  };
  if (steps > 12) await at(to); else { for (let k = 1; k <= steps; k++) await at(from + k * iv); if (to > from + steps * iv) await at(to); }
}
export async function moveClock(to: number) {
  if (ticking) return; ticking = true;
  try { const from = state().now; Object.values(store.states).forEach((s: any) => { s.now = to; }); await runTicks(from, to); notify(); }
  finally { ticking = false; }
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

// 发送：AI 模式 → /api/v1/extract；AI 未配置/失败/限流 → 自动回退规则引擎，并在消息与提示里明确标注。
export async function sendMessage(text: string, author: string, opts: { forceRules?: boolean } = {}) {
  if (store.busy || !text.trim()) return { kind: "ignored", text: "请等待上一条消息完成，或填写消息内容。" };
  const s = state(); store.busy = true; store.typing = null; notify();
  let outcome: any;
  try {
    const wantAI = store.extractMode === "ai" && !opts.forceRules;
    const fallback = (reason: string) => {
      outcome = E.extractSuggestion(s, text, author);
      const last = s.messages.at(-1);
      if (last && last.outcome) { last.fallback = reason; last.outcome = { ...last.outcome, text: `AI ${reason}，已回退规则模式 · ${last.outcome.text}` }; outcome = last.outcome; }
      store.ai.lastFallback = reason;
    };
    if (!wantAI) outcome = E.extractSuggestion(s, text, author);
    else if (store.ai.configured === false) fallback("未配置");
    else {
      const message = { id: "m" + ++s.seq, author, text, time: s.now, outcome: { kind: "ai_pending", text: "等待AI整理" } };
      s.messages.push(message); (s as any).lastSendMessageId = message.id; persist(); notify();
      outcome = await processAIMessage(s, message, { fetcher: apiFetch });
      if (outcome?.kind === "ai_pending" && outcome.code) {
        const idx = s.messages.findIndex((m: any) => m.id === message.id); if (idx >= 0) s.messages.splice(idx, 1);
        if (outcome.code === "AI_NOT_CONFIGURED") store.ai.configured = false;
        fallback(reasonText(outcome.code));
      } else store.ai.lastFallback = "";
    }
    const last = s.messages.at(-1);
    if (last) {
      M.extractInto(s, last, "rules");
      if (aiLive() && store.memoryAIEnabled) void processMemoryAI(s, last, { fetcher: apiFetch }).then(() => { persist(); notify(); });
      // Group notifications supply tasks/memories, never device-control authority.
    }
  } catch { outcome = { kind: "error", text: "整理未完成，消息已保留，请重试。" }; }
  store.busy = false; persist(); notify();
  return outcome;
}
export async function retryPending() {
  if (store.busy) return; store.busy = true; notify(); let done = 0;
  try {
    const pend = tickStates().flatMap((s: any) => s.messages.filter((m: any) => E.publishers(s).includes(m.author) && (m.outcome?.kind === "ai_pending" || (m.outcome?.kind === "review" && !m.taskId))).map((m: any) => ({ s, id: m.id })));
    for (const { s, id } of pend) { const o = await processAIMessage(s, s.messages.find((m: any) => m.id === id), { fetcher: apiFetch }); persist(); if (o.code === "AI_NOT_CONFIGURED") { store.notice = o.text; break; } if (o.kind !== "ai_pending") done++; }
    if (!store.notice) store.notice = `已重新处理 ${done} 条消息。`;
  } catch { store.notice = "重试未完成，消息仍保留，可稍后重试。"; } finally { store.busy = false; persist(); notify(); }
}

// 重置演示数据：回到 2026-11-20 09:00 的初始群聊（不清除使用引导的已读状态）。
export function resetData() {
  setAutoplay(false);
  store.states = {}; freshAll(); store.initiative = I.initInitiative(); store.selected = null; store.focusMessageId = null;
  store.followed = new Set(TRACKS[store.track].groups); store.active = TRACKS[store.track].groups[0];
  store.notice = ""; store.ai.lastFallback = ""; store.studyPlan=null;
  persist(); notify();
}
export function resetAll() {
  try { localStorage.removeItem(CHAT_KEY); } catch { /* ignore */ }
  resetData(); location.reload();
}

// 便捷动作
export function requestStudyEnvironment(question:string,profileId:string){
  const plan=planStudyEnvironment(state(),{question,profileId});
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
