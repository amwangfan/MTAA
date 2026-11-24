import { PlayCircle, ArrowRight, MessagesSquare, CheckCircle2, BellRing, Brain, PlugZap, X, MousePointerClick, Quote } from "lucide-react";
import type { View } from "../store";
import { Reveal, CountUp } from "./ui";
import { useEffect, useRef } from "react";
import HomePreview from "./HomePreview";
import { DEMO_DURATION_SECONDS } from "../../lib/demo-playback.js";

const steps: { n: string; title: string; view: View; icon: any }[] = [
  { n: "1", title: `${DEMO_DURATION_SECONDS} 秒看全程`, view: "center", icon: PlayCircle },
  { n: "2", title: "发一条通知", view: "messages", icon: MessagesSquare },
  { n: "3", title: "确认待办", view: "center", icon: CheckCircle2 },
  { n: "4", title: "对比记忆", view: "memory", icon: Brain },
  { n: "5", title: "联动设备", view: "memory", icon: BellRing },
];

export default function Showcase({ stats, startDemo, goto, startGuide }: { stats: { groups: number; todo: number; memory: number; reminders: number }; startDemo: () => void; goto: (v: View) => void; startGuide: () => void }) {
  const history = useRef<HTMLDivElement>(null);
  const browsingHistory = useRef(false);
  useEffect(() => {
    if (history.current && !browsingHistory.current) {
      history.current.scrollTop = history.current.scrollHeight;
    }
  }, []);
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-grid">
        <Reveal>
          <div className="chip mb-5">2026 QODER 高校创造力大赛 · STUDYHACK / LIFEHACK</div>
          <h2 id="hero-title" className="hero-title">群消息太多？<br /><span>Whale 帮你接住每一条</span>通知。</h2>
          <p className="hero-lead">课程群、社团群、项目群、实验室群、宿舍群……重要通知总是淹没在闲聊里。Whale 读懂消息，整理成<strong>有原文证据的待办建议</strong>，记住你的习惯，在合适的时候克制地提醒你，还能经你批准联动宿舍设备。</p>
          <div className="hero-actions mt-7 flex flex-wrap items-center gap-3">
            <button className="btn-hero" onClick={startDemo}><PlayCircle className="h-5 w-5" />一键自动演示 · {DEMO_DURATION_SECONDS} 秒</button>
            <button className="btn-hero-ghost" onClick={() => goto("messages")}><MousePointerClick className="h-4 w-4" />自己动手试试</button>
            <button className="text-sm text-muted underline-offset-4 hover:underline" onClick={startGuide}>分步引导</button>
          </div>
          <div className="hero-stats">
            {([["关注群", stats.groups], ["待处理事项", stats.todo], ["记忆记录", stats.memory], ["主动提醒", stats.reminders]] as [string, number][]).map(([l, v]) => <div key={l}><b><CountUp value={v} /></b><span>{l}</span></div>)}
          </div>
        </Reveal>
        <Reveal delay={120} className="hero-preview">
          <HomePreview>
          <div className="phone">
            <div className="phone-head"><span className="phone-avatar">课</span><div><b>数字电路 · 2024级1班</b><small>86 人 · 王老师、林助教…</small></div></div>
            <div ref={history} className="phone-body" role="region" aria-label="群聊演示记录" tabIndex={0} onPointerEnter={() => { browsingHistory.current = true; }} onPointerLeave={() => { browsingHistory.current = false; }} onFocus={() => { browsingHistory.current = true; }} onBlur={() => { browsingHistory.current = false; }}>
              <div className="ph-msg"><i style={{ background: "#a3a19a" }}>陈</i><p>这次作业量大吗？😭</p></div>
              <div className="ph-msg is-mine"><i>我</i><p>我刚做完实验，报告还没开始写。</p></div>
              <div className="ph-msg"><i style={{ background: "#6a8f6b" }}>林</i><p className="ph-notice"><em>群公告</em>@全体成员 课程作业 11月24日18:00 前上交，别拖。</p></div>
              <div className="ph-msg is-mine"><i>我</i><p>收到，今晚先整理实验数据。</p></div>
              <div className="ph-msg"><i style={{ background: "#a3a19a" }}>陈</i><p>记得把波形截图也放进报告。</p></div>
              <div className="ph-msg is-mine"><i>我</i><p>好，我一起补上，明天下午检查后提交。</p></div>
              <div className="ph-whale"><span className="ph-whale-dot" />Whale 识别到 1 条待办</div>
              <div className="ph-card">
                <div className="ph-card-top"><b>课程作业</b><span>待确认</span></div>
                <div className="ph-card-meta">11月24日 18:00 · 明确时刻 · 课程作业群</div>
                <div className="ph-card-quote"><Quote className="h-3 w-3" />课程作业11月24日18:00前上交</div>
                <div className="ph-card-actions"><span className="is-add">添加</span><span>删除</span></div>
              </div>
              <div className="ph-banner"><BellRing className="h-3.5 w-3.5" /><div><b>WHALE · 主动提醒</b><small>临近截止：课程作业（还有 1 小时）</small></div></div>
            </div>
          </div>
          </HomePreview>
        </Reveal>
      </div>
      <Reveal delay={200} className="hero-experience">
        <div className="steps-head"><h3>5 步体验</h3></div>
        <ol className="steps">
          {steps.map((s, i) => <li key={s.n}><button onClick={() => (i === 0 ? startDemo() : goto(s.view))}><span className="step-n">{s.n}</span><s.icon className="h-4 w-4 text-clay-deep" /><b>{s.title}</b></button></li>)}
        </ol>
        <div className="flow-strip">{["群消息", "AI 结构化提取 + 原文校验", "待办建议", "你来确认", "主动提醒 · 记忆 · 设备"].map((x, i, a) => <span key={x} className="flex items-center gap-2"><span className="chip">{x}</span>{i < a.length - 1 && <ArrowRight className="h-4 w-4 text-clay" />}</span>)}<span className="ml-auto hidden items-center gap-1 text-xs text-muted md:flex"><PlugZap className="h-3.5 w-3.5" />设备接口预留 HomeAssistant</span></div>
      </Reveal>
    </section>
  );
}
