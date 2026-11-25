// 群聊拟真层（仅展示）：虚构人物、群资料、公告样式、附件/接龙/图片占位、引用回复与系统提示。
// 不改动 lib/ 中的消息与权限逻辑：作者键保持「老师/助教/成员/我…」，这里只映射为更像真实群聊的显示。
import { memberDirectory, scenarios } from "../lib/whale-demo-data.js";

export type Persona = { name: string; short: string; tag?: string; color: string };
const P = (name: string, color: string, tag?: string): Persona => ({ name, short: name.replace(/^.*·\s*/, "").replace(/（.*?）/, ""), tag, color });

const colors: Record<string, string> = {
  grade: "#7b6a99", course: "#5d7351", club: "#c99a3a", project: "#bc5a34", lab: "#4c6a7a", home: "#8a6a9a",
};
const members: Record<string, number> = { grade: 126, course: 86, club: 142, project: 6, lab: 23, home: 48 };
export const groups = Object.fromEntries(scenarios.map(scene => [scene.id, {
  title: scene.name,
  members: members[scene.id] || 10,
  icon: scene.mark,
  color: colors[scene.id] || "#a3a19a",
  kind: ["club", "home"].includes(scene.id) ? "life" as const : "study" as const,
}])) as Record<string, { title: string; members: number; icon: string; color: string; kind: "study" | "life" }>;

const roleTags: Record<string, string | undefined> = { owner: "群主", admin: "管理员", member: undefined };
const directory = memberDirectory as Record<string, Array<{ name: string; role: string }>>;
const personas: Record<string, Record<string, Persona>> = Object.fromEntries(scenarios.map(scene => [scene.id,
  Object.fromEntries(directory[scene.id].map(member => [member.name, P(member.name, member.role === "owner" ? colors[scene.id] : member.role === "admin" ? "#6a8f6b" : "#a3a19a", roleTags[member.role])])),
]));
const ME: Persona = { name: "我", short: "我", color: "#bc5a34", tag: "管理员" };
export function persona(scene: string, author: string): Persona {
  if (author === "我") return ME;
  return personas[scene]?.[author] || P(author, "#a3a19a");
}

const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return Math.abs(h); };
const NOTICE = /提交|截止|集合|会议|讨论|培训|检查|报修|例会|延期|改到|更正|取消|撤销|完成|开始|上交|上门|测试/;
export function isNotice(scene: string, m: any) {
  const p = persona(scene, m.author);
  return m.author !== "我" && (p.tag === "群主" || p.tag === "管理员") && NOTICE.test(m.text);
}
export function readCount(scene: string, m: any) {
  const total = groups[scene]?.members || 10;
  return { read: Math.min(total - 1, Math.round(total * 0.55) + (hash(m.id + m.text) % Math.max(2, Math.round(total * 0.4)))), total };
}

export type Attachment =
  | { type: "file"; name: string; size: string; ext: string }
  | { type: "images"; count: number; label: string }
  | { type: "relay"; title: string; count: number }
  | { type: "link"; title: string; sub: string };
const rules: [RegExp, Attachment][] = [
  [/课程设计11月20日至12月18日/, { type: "file", name: "课程设计任务书.pdf", size: "1.2 MB", ext: "PDF" }],
  [/开题报告/, { type: "file", name: "开题报告模板.docx", size: "36 KB", ext: "DOC" }],
  [/小组分工表/, { type: "file", name: "小组分工表-模板.xlsx", size: "18 KB", ext: "XLS" }],
  [/实验记录.*原始数据/, { type: "file", name: "实验记录模板（含原始数据页）.docx", size: "42 KB", ext: "DOC" }],
  [/青年大学习/, { type: "link", title: "青年大学习 · 本期学习入口", sub: "完成后请在本群提交截图" }],
  [/安全教育/, { type: "link", title: "安全教育 · 场地指引", sub: "以群内最新更正时间为准" }],
  [/活动照片/, { type: "images", count: 3, label: "上次活动精选" }],
  [/志愿讲解报名/, { type: "relay", title: "志愿讲解报名接龙", count: 17 }],
  [/产品说明/, { type: "file", name: "产品说明模板.docx", size: "28 KB", ext: "DOC" }],
  [/快递架/, { type: "images", count: 1, label: "快递架位置" }],
  [/线上会议室/, { type: "link", title: "线上会议室 · 点击入会", sub: "会议号 728 316 905" }],
  [/设备培训/, { type: "file", name: "设备培训操作手册2026版.pdf", size: "3.4 MB", ext: "PDF" }],
];
export function attachmentFor(m: any): Attachment | null {
  for (const [re, a] of rules) if (re.test(m.text)) return a;
  return null;
}
// 系统提示：撤回、拍一拍等，增加真实群聊的节奏感（纯展示，不进入任何提取）。
const systemAfter: Record<string, string[]> = {
  "签到是要扫码吗？": ["学习委员 拍了拍 我"],
  "1000米还是800米？": ["学习委员 撤回了一条消息"],
  "表单链接在哪里找？": ["辅导员 设置了群公告"],
  "报告大概需要多少页？": ["助教 撤回了一条消息"],
  "需要带相机吗？": ["社长 拍了拍 我"],
  "报名要写具体时段吗？": ["组织部 拍了拍 我"],
  "原始数据放哪？": ["实验员 设置了群公告"],
  "早餐帮我带一份。": ["室友 拍了拍 我"],
};
export const systemLines = (m: any) => systemAfter[m.text] || [];
export function quoteFor(list: any[], i: number) {
  const m = list[i], prev = list[i - 1];
  if (!prev || !/[？?]$/.test(m.text) || prev.author === m.author || m.time - prev.time > 30 * 60000) return null;
  return prev;
}
export const weekday = (ms: number) => "周" + "日一二三四五六"[new Date(ms + 8 * 3600000).getUTCDay()];
