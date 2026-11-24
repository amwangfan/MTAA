import { PlayCircle, MessagesSquare, FileSearch, Brain, BellRing, PlugZap, ShieldCheck, Server, Monitor, Cpu, Sparkles } from "lucide-react";
import { store, currentModelLabel } from "../store";
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
  { icon: Monitor, title: "浏览器（React 19 + Vite + Tailwind 4）", items: ["五视图工作区，一键演示", "lib/ 纯逻辑：规则引擎、记忆、主动判断、设备门控", "数据仅存 localStorage，不上传群聊"] },
  { icon: Server, title: "服务端代理（Node / Qoder Sites 函数）", items: ["/api/v1/extract、memory-extract、initiative、memory-chat", "同源校验、按 IP 限流、每日总额度", "契约校验：原文逐字引用、ID 不可虚构"] },
  { icon: Cpu, title: "大模型（AgentScope 节点 / DeepSeek）", items: ["AgentScope SSE 流式 · 模型列表实时拉取", "DeepSeek JSON 模式 · 侧栏可切换", "密钥只在服务端环境变量", "失败 / 限流 → 自动回退规则引擎并标注"] },
];

export default function AboutView({ startDemo }: { startDemo: () => void }) {
  return (
    <div className="about">
      <GlassCard hover={false} className="about-hero">
        <div className="chip mb-4">作品是什么</div>
        <h2 className="font-display text-2xl font-semibold leading-snug md:text-3xl">Whale 是给<span className="text-clay-deep">被群消息淹没的大学生</span>用的 AI 信息管家：把五个群的通知变成有证据的待办，记住你的习惯，在对的时间克制地提醒你，并在你批准后联动宿舍设备。</h2>
        <div className="mt-5 flex flex-wrap gap-2"><button className="btn-hero" onClick={startDemo}><PlayCircle className="h-5 w-5" />看 {DEMO_DURATION_SECONDS} 秒演示</button><Badge tone={store.ai.configured ? "green" : "amber"}>{store.ai.configured ? `当前已接入真实模型 · ${currentModelLabel()}` : "当前未配置模型 · 规则回退"}</Badge></div>
      </GlassCard>

      <SectionHeading title="为什么做" sub="这是我们自己每天的真实烦恼。" />
      <div className="grid gap-4 md:grid-cols-3">{pains.map(([t, d]) => <GlassCard key={t} hover={false} className="p-5"><div className="font-display text-lg font-semibold">{t}</div><p className="mt-2 text-sm text-muted">{d}</p></GlassCard>)}</div>

      <SectionHeading title="核心能力" />
      <div className="grid gap-4 md:grid-cols-3">{aboutFeatures.map(([I, t, d]) => <GlassCard key={t} className="feature-card p-5" hover><span className="feature-icon"><I className="h-5 w-5" /></span><div className="mt-3 font-display font-semibold">{t}</div><p className="mt-1 text-sm text-muted">{d}</p></GlassCard>)}</div>

      <SectionHeading title="怎么用（5 步）" />
      <GlassCard hover={false} className="p-5"><ol className="how-list">
        <li><b>看演示</b>：点侧栏「一键自动演示」，{DEMO_DURATION_SECONDS} 秒看完整流程。</li>
        <li><b>发通知</b>：「消息」选一个群，以群主/管理员身份发一条，如「周五18:00前交实验报告」。</li>
        <li><b>确认建议</b>：「待办 · 待办清单」里点开建议，核对原文高亮后添加或删除。</li>
        <li><b>问记忆</b>：「助手 · 记忆」里用同一个问题对照三套记忆档案，点 M 编号查依据。</li>
        <li><b>快进时间</b>：用演示时钟「下一次提醒」查看通知；在「助手 · 记忆」说「我要开始学习了」，按偏好调整设备。</li>
      </ol></GlassCard>

      <SectionHeading title="技术架构" />
      <div className="arch">{arch.map((a, i) => <div key={a.title} className="arch-col"><GlassCard hover={false} className="h-full p-5"><div className="flex items-center gap-2 font-semibold"><a.icon className="h-5 w-5 text-clay-deep" />{a.title}</div><ul className="mt-3 space-y-1.5 text-sm text-muted">{a.items.map((x) => <li key={x}>· {x}</li>)}</ul></GlassCard>{i < arch.length - 1 && <span className="arch-arrow" aria-hidden>→</span>}</div>)}</div>

      <SectionHeading title="真实与规则的边界" />
      <GlassCard hover={false} className="p-5 text-sm leading-7 text-ink-2">
        <p><Sparkles className="mr-1 inline h-4 w-4 text-clay-deep" /><b>真实：</b>AI 模式下消息理解、记忆对话、主动判断都会请求真实大模型；结果经契约校验后才显示，并标注「AI提取」。</p>
        <p><Cpu className="mr-1 inline h-4 w-4 text-moss" /><b>规则：</b>预置数据和「规则演示」由本地规则引擎生成，界面明确标注「规则引擎 / 规则回退」，不冒充 AI。</p>
      </GlassCard>
    </div>
  );
}
