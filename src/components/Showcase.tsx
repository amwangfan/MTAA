import { PlayCircle, ArrowRight, MessagesSquare, CheckCircle2, BellRing, Brain, PlugZap, X, MousePointerClick, Quote } from "lucide-react";
import type { View } from "../store";
import { Reveal, CountUp } from "./ui";

const steps: { n: string; title: string; desc: string; view: View; icon: any }[] = [
  { n: "1", title: "看 32 秒自动演示", desc: "从一条群通知到提醒和设备联动，完整走一遍。", view: "center", icon: PlayCircle },
  { n: "2", title: "在「消息来源」发一条通知", desc: "选个群，点示例消息或自己写，比如「周五前交实验报告」。", view: "messages", icon: MessagesSquare },
  { n: "3", title: "回「信息总结」确认建议", desc: "点开事项，看原文高亮和证据连线，再决定添加还是删除。", view: "center", icon: CheckCircle2 },
  { n: "4", title: "在「记忆」同题对照", desc: "同一个问题，三套记忆给出三种安排；点 M 编号核对依据。", view: "memory", icon: Brain },
  { n: "5", title: "学习环境随记忆联动", desc: "在「记忆」说「我要开始学习了」，查看偏好与设备状态，批准调整。", view: "memory", icon: BellRing },
];

export default function Showcase({ stats, startDemo, goto, startGuide, hide }: { stats: { groups: number; todo: number; memory: number; reminders: number }; startDemo: () => void; goto: (v: View) => void; startGuide: () => void; hide: () => void }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <button className="hero-close" onClick={hide} aria-label="收起首页介绍"><X className="h-4 w-4" /></button>
      <div className="hero-grid">
        <Reveal>
          <p className="hero-byline">2026 Qoder 高校创造力大赛 · StudyHack / LifeHack</p>
          <h2 id="hero-title" className="hero-title">群消息太多？<br /><span>Whale 帮你接住每一条</span>作业和通知。</h2>
          <p className="hero-lead">课程群、社团群、项目群、实验室群、宿舍群……重要通知总是淹没在闲聊里。Whale 读懂消息，整理成<strong>有原文证据的待办建议</strong>，记住你的习惯，在合适的时候克制地提醒你，还能经你批准联动宿舍设备。</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button className="btn-hero" onClick={startDemo}><PlayCircle className="h-5 w-5" />一键自动演示（32 秒）</button>
            <button className="btn-hero-ghost" onClick={() => goto("messages")}><MousePointerClick className="h-4 w-4" />自己动手试试</button>
            <button className="py-1.5 text-sm text-muted underline-offset-4 hover:underline" onClick={startGuide}>分步引导</button>
          </div>
          <div className="hero-stats">
            {([["关注群", stats.groups], ["待处理事项", stats.todo], ["记忆记录", stats.memory], ["主动提醒", stats.reminders]] as [string, number][]).map(([l, v]) => <div key={l}><b><CountUp value={v} /></b><span>{l}</span></div>)}
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div className="phone" aria-hidden>
            <div className="phone-notch" />
            <div className="phone-head"><span className="phone-avatar">课</span><div><b>数字电路 · 2024级1班</b><small>86 人 · 王老师、林助教…</small></div></div>
            <div className="phone-body">
              <div className="ph-msg"><i style={{ background: "#a3a19a" }}>陈</i><p>这次作业量大吗？😭</p></div>
              <div className="ph-msg"><i style={{ background: "#6a8f6b" }}>林</i><p className="ph-notice"><em>群公告</em>@全体成员 课程作业 11月24日18:00 前上交，别拖。</p></div>
              <div className="ph-msg"><i style={{ background: "#a3a19a" }}>陈</i><p>早起好困……</p></div>
              <div className="ph-whale"><span className="ph-whale-dot" />Whale 识别到 1 条待办</div>
              <div className="ph-card">
                <div className="ph-card-top"><b>课程作业</b><span>待确认</span></div>
                <div className="ph-card-meta">11月24日 18:00，明确时刻，课程作业群</div>
                <div className="ph-card-quote"><Quote className="h-3 w-3" />课程作业11月24日18:00前上交</div>
                <div className="ph-card-actions"><span className="is-add">添加</span><span>删除</span></div>
              </div>
              <div className="ph-banner"><BellRing className="h-3.5 w-3.5" /><div><b>WHALE · 主动提醒</b><small>临近截止：课程作业（还有 1 小时）</small></div></div>
            </div>
          </div>
        </Reveal>
      </div>
      <Reveal delay={200}>
        <div className="steps-head"><h3>评委 5 步体验</h3><span>每一步都能点</span></div>
        <ol className="steps">
          {steps.map((s, i) => <li key={s.n}><button onClick={() => (i === 0 ? startDemo() : goto(s.view))}><span className="step-n">{s.n}</span><s.icon className="h-4 w-4 text-clay-deep" /><b>{s.title}</b><small>{s.desc}</small></button></li>)}
        </ol>
        <div className="flow-strip">{["群消息", "AI 结构化提取 + 原文校验", "待办建议", "你来确认", "主动提醒、记忆、设备"].map((x, i, a) => <span key={x} className="flex items-center gap-2"><span className="chip">{x}</span>{i < a.length - 1 && <ArrowRight className="h-4 w-4 text-clay" />}</span>)}<span className="ml-auto hidden items-center gap-1 text-xs text-muted md:flex"><PlugZap className="h-3.5 w-3.5" />设备接口预留 HomeAssistant</span></div>
      </Reveal>
    </section>
  );
}
