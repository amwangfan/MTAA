import { PlayCircle, MessagesSquare, FileSearch, Brain, BellRing, PlugZap, ShieldCheck, Server, Monitor, Cpu, Sparkles } from "lucide-react";
import { store } from "../store";
import { GlassCard, SectionHeading, Badge } from "./ui";
import { DEMO_DURATION_SECONDS } from "../../lib/demo-playback.js";

const pains = [
  ["一天几百条群消息", "课程、社团、项目、实验室、宿舍五六个群，作业和通知夹在表情包里，一刷就过。"],
  ["通知会变", "截止日期延期、活动改时间、取消……旧信息还留在脑子里，最容易出错。"],
  ["提醒太吵或太晚", "日历要自己录；系统提醒不懂语境，深夜也响，或者在你最需要的时候沉默。"],
];
export const aboutFeatures: [any, string, string][] = [
  [MessagesSquare, "读懂群消息", "AI 理解作业、活动、延期、取消、完成；只整理群主/管理员发布的内容。"],
  [FileSearch, "每条都有证据", "待办建议附原文引用，程序逐字校验；分屏高亮 + 编号连线溯源。"],
  [ShieldCheck, "你来确认", "新消息先变成建议，添加 / 删除 / 恢复由你决定，不擅自改日程。"],
  [Brain, "可解释的记忆", "候选需同意才记住；召回给出得分理由，30 天半衰期，随时忘记。"],
  [BellRing, "克制的主动提醒", "节拍判断 + 静默时段 + 每日配额 + 反馈过滤，决策账本可展开提示词。"],
  [PlugZap, "设备联动有门控", "只读 / 沟通 / 事务三级风险；事务类必须单次批准，全程留痕。"],
];
const arch = [
  { icon: Monitor, title: "浏览器（React 19 + Vite + Tailwind 4）", items: ["多视图工作区，一键演示", "lib/ 纯逻辑：规则引擎、记忆、主动判断、设备门控", "演示数据默认保存在浏览器 localStorage", "群聊、成员、身份目录均为虚构 / 模拟"] },
  { icon: Server, title: "Qoder Sites Deno Function + Function backend 数据库租约", items: ["同源 /functions/v1/app，提供 /api/v1/* 接口", "数据库唯一约束：每 Cookie 1 个、全站 8 个并发 AI 操作", "来源校验、限流与模型响应契约校验"] },
  { icon: Cpu, title: "AI 服务（服务端代理）", items: ["模型配置仅保存在服务端环境变量，前端不展示模型名或供应商", "密钥只在服务端环境变量，不进入前端", "AI 只生成待确认建议，不直接写数据库、不执行设备工具", "满载返回 AI_BUSY；用户确认后仅本次回退规则引擎"] },
];
const PRIVACY_TEXT = "演示数据默认保存在你的浏览器；AI 模式会将必要消息上下文发送到服务端和模型供应商，密钥不会进入前端。必要上下文包括消息原文、已有事项摘要、选中记忆档案与主动判断上下文。";

export default function AboutView({ startDemo }: { startDemo: () => void }) {
  return (
    <div className="about">
      <GlassCard hover={false} className="about-hero">
        <div className="chip mb-4">作品是什么</div>
        <h2 className="font-display text-2xl font-semibold leading-snug md:text-3xl">Whale 是给<span className="text-clay-deep">被群消息淹没的大学生</span>用的 AI 信息管家：把六个群的通知变成有证据的待办，记住你的习惯，在对的时间克制地提醒你，并在你批准后联动宿舍设备。</h2>
        <div className="mt-5 flex flex-wrap gap-2"><button className="btn-hero" onClick={startDemo}><PlayCircle className="h-5 w-5" />看 {DEMO_DURATION_SECONDS} 秒演示</button><Badge tone={store.ai.configured ? (store.ai.overloaded ? "rose" : "green") : "amber"}>{store.ai.configured ? (store.ai.overloaded ? "AI超过负载" : "AI接入") : "AI未接入"}</Badge></div>
      </GlassCard>

      <SectionHeading title="为什么做" sub="这是我们自己每天的真实烦恼。" />
      <div className="grid gap-4 md:grid-cols-3">{pains.map(([t, d]) => <GlassCard key={t} hover={false} className="p-5"><div className="font-display text-lg font-semibold">{t}</div><p className="mt-2 text-sm text-muted">{d}</p></GlassCard>)}</div>

      <SectionHeading title="核心能力" />
      <div className="grid gap-4 md:grid-cols-3">{aboutFeatures.map(([I, t, d]) => <GlassCard key={t} className="feature-card p-5" hover><span className="feature-icon"><I className="h-5 w-5" /></span><div className="mt-3 font-display font-semibold">{t}</div><p className="mt-1 text-sm text-muted">{d}</p></GlassCard>)}</div>

      <SectionHeading title="怎么用（5 步）" />
      <GlassCard hover={false} className="p-5"><ol className="how-list">
        <li><b>看演示</b>：点侧栏「一键自动演示」，{DEMO_DURATION_SECONDS} 秒规则模式演示完整流程。</li>
        <li><b>发通知</b>：「消息」选一个群，以群主/管理员身份发一条，如「周五18:00前交实验报告」。</li>
        <li><b>确认建议</b>：「待办 · 待办清单」里点开建议，核对原文高亮后添加或删除。</li>
        <li><b>问记忆</b>：「助手 · 记忆」里用同一个问题对照三套记忆档案，点 M 编号查依据。</li>
        <li><b>快进时间</b>：用演示时钟「下一次提醒」查看通知；在「助手 · 学习环境」按偏好调整模拟设备。</li>
      </ol></GlassCard>

      <SectionHeading title="技术架构" />
      <div className="arch">{arch.map((a, i) => <div key={a.title} className="arch-col"><GlassCard hover={false} className="h-full p-5"><div className="flex items-center gap-2 font-semibold"><a.icon className="h-5 w-5 text-clay-deep" />{a.title}</div><ul className="mt-3 space-y-1.5 text-sm text-muted">{a.items.map((x) => <li key={x}>· {x}</li>)}</ul></GlassCard>{i < arch.length - 1 && <span className="arch-arrow" aria-hidden>→</span>}</div>)}</div>

      <SectionHeading title="真实与规则的边界" />
      <GlassCard hover={false} className="p-5 text-sm leading-7 text-ink-2">
        <p><b>模拟数据：</b>群聊、成员、身份目录均为虚构 / 模拟，不对应真实个人或群组。</p>
        <p><b>模拟设备：</b>设备联动是模拟审批，不是真实 HomeAssistant 控制；批准只改变演示中的设备状态。</p>
        <p><Sparkles className="mr-1 inline h-4 w-4 text-clay-deep" /><b>真实 AI：</b>AI 模式下消息理解、记忆对话、主动判断会请求真实模型；AI 只生成待确认建议，不直接写数据库、不执行设备工具。结果经契约校验后才显示。</p>
        <p><Cpu className="mr-1 inline h-4 w-4 text-moss" /><b>AI 为主，规则辅助：</b>真实 AI 是默认整理路径；固定规则只用于离线演示和失败兜底，界面标注「规则引擎 / 规则回退」，不冒充 AI。</p>
        <p><b>{DEMO_DURATION_SECONDS} 秒演示：</b>自动演示始终使用规则模式，不能作为真实 AI 证据。</p>
        <p><b>满载回退：</b>服务端返回 AI_BUSY 时不会自动冒充成功；用户确认后仅本次规则回退，取消则保留现场并提示稍后重试。</p>
        <p className="mt-3 border-t border-line pt-3"><b>隐私：</b>{PRIVACY_TEXT}</p>
      </GlassCard>
    </div>
  );
}
