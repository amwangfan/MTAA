import { fmt, day, scenarios } from "../lib/engine.js";
export { fmt, day };
export const BADGE = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫"];
export const scName = (id: string) => scenarios.find((scene: any) => scene.id === id)?.name || id;
export const dueText = (t: any) => !t.due ? "截止待确认" : t.precision === "date" ? day(t.due).slice(5).replace("-", "月") + "日 · 仅日期" : fmt(t.due);
export const statusText = (t: any, now: number) => t.status === "done" ? "已完成" : t.status === "cancelled" ? "已取消" : t.status === "review" ? "待确认" : t.due < now ? "已过时间" : "待处理";
export const timeBasis = (t: any) => t.history.slice().reverse().find((h: any) => /用户修改日期|日期更新/.test(h.text))?.text.startsWith("用户修改日期") ? "用户手动补充" : !t.due ? "日期待确认" : t.precision === "date" ? "原文仅日期" : "原文明确时刻";
