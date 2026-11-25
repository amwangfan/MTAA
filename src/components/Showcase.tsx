import { PlayCircle, ArrowRight, MessagesSquare, CheckCircle2, BellRing, Brain, PlugZap, MousePointerClick, Quote } from "lucide-react";
import { persist, store, type View } from "../store";
import { Reveal, CountUp, GlassCard } from "./ui";
import { useEffect, useRef } from "react";
import HomePreview from "./HomePreview";
import { aboutFeatures } from "./AboutView";
import { DEMO_DURATION_SECONDS } from "../../lib/demo-playback.js";
import { backgrounds, heroChat, recommendedHeroBackground } from "../../lib/whale-demo-data.js";

const steps: { n: string; title: string; view: View; icon: any }[] = [
  { n: "1", title: `${DEMO_DURATION_SECONDS} 秒看全程`, view: "center", icon: PlayCircle },
  { n: "2", title: "发一条通知", view: "messages", icon: MessagesSquare },
  { n: "3", title: "确认待办", view: "center", icon: CheckCircle2 },
  { n: "4", title: "对比记忆", view: "memory", icon: Brain },
  { n: "5", title: "联动设备", view: "devices", icon: BellRing },
];

export default function Showcase({ stats, startDemo, goto, startGuide }: { stats: { groups: number; todo: number; memory: number; reminders: number }; startDemo: () => void; goto: (v: View) => void; startGuide: () => void }) {
  const { taskCard, reminder } = heroChat;
  const recommendedBackground = backgrounds.find(background => background.id === recommendedHeroBackground) || backgrounds[0];
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
          <p className="hero-byline">2026 Qoder 高校创造力大赛 · StudyHack / LifeHack</p>
          <h2 id="hero-title" className="hero-title">群消息太多？<br /><span>Whale 帮你接住每一条</span></h2>
          <p className="hero-lead">年级通知群、课程群、社团群、项目群、实验室群、宿舍群……重要通知总是淹没在闲聊里。Whale 读懂消息，整理成<strong>有原文证据的待办建议</strong>，记住你的习惯，在合适的时候克制地提醒你，还能经你批准联动宿舍设备。</p>
          <div className="hero-actions mt-7 flex flex-wrap items-center gap-3">
            <button className="btn-hero" onClick={startDemo}><PlayCircle className="h-5 w-5" />一键自动演示 · {DEMO_DURATION_SECONDS} 秒</button>
            <button className="btn-hero-ghost" onClick={() => goto("messages")}><MousePointerClick className="h-4 w-4" />自己动手试试</button>
            <button className="py-1.5 text-sm text-muted underline-offset-4 hover:underline" onClick={startGuide}>分步引导</button>
          </div>
          <div className="hero-stats">
            {([["关注群", stats.groups], ["待处理事项", stats.todo], ["记忆记录", stats.memory], ["主动提醒", stats.reminders]] as [string, number][]).map(([l, v]) => <div key={l}><b><CountUp value={v} /></b><span>{l}</span></div>)}
          </div>
        </Reveal>
        <Reveal delay={120} className="hero-preview">
          <HomePreview>
            <div className="phone">
              <div className="phone-head"><span className="phone-avatar">{heroChat.groupName.slice(0, 1)}</span><div><b>{heroChat.groupName}</b><small>{heroChat.memberSummary}</small></div></div>
              <div ref={history} className="phone-body" role="region" aria-label="群聊演示记录" tabIndex={0} onPointerEnter={() => { browsingHistory.current = true; }} onPointerLeave={() => { browsingHistory.current = false; }} onFocus={() => { browsingHistory.current = true; }} onBlur={() => { browsingHistory.current = false; }}>
                {heroChat.messages.map((message, index) => {
                  const mine = "mine" in message && message.mine;
                  const notice = "notice" in message ? message.notice : undefined;
                  const text = "text" in message ? message.text : "";
                  return <div key={`${message.author}-${index}`} className={`ph-msg${mine ? " is-mine" : ""}`}>
                    <i style={{ background: mine ? "#bc5a34" : notice ? "#6a8f6b" : "#a3a19a" }}>{message.avatar}</i>
                    <p className={notice ? "ph-notice" : undefined}>{notice && <em>群公告</em>}{notice || text}</p>
                  </div>;
                })}
                <div className="ph-whale"><span className="ph-whale-dot" />Whale 识别到 {taskCard ? 1 : 0} 条待办</div>
                <div className="ph-card" data-hero-task-card>
                  <div className="ph-card-top"><b>{taskCard.title}</b><span>{taskCard.status}</span></div>
                  <div className="ph-card-meta">{taskCard.deadline}，明确时刻，{taskCard.source}</div>
                  <div className="ph-card-quote"><Quote className="h-3 w-3" />{taskCard.quote}</div>
                  {taskCard.requirements.length > 0 && <ul className="ph-card-requirements">{taskCard.requirements.map((requirement, index) => <li key={index}>{requirement}</li>)}</ul>}
                  <div className="ph-card-actions"><span className="is-add">添加</span><span>删除</span></div>
                </div>
                <div className="ph-banner"><BellRing className="h-3.5 w-3.5" /><div><b>{reminder.title}</b><small>{reminder.text}</small></div></div>
              </div>
            </div>
          </HomePreview>
          <button type="button" className="hero-background-recommendation" data-recommended-background={recommendedBackground.id}
            onClick={() => { store.active = recommendedBackground.id; store.followed.add(recommendedBackground.id); persist(); goto("messages"); }}>
            <span>推荐背景</span><b>{recommendedBackground.name}</b><small>{recommendedBackground.focus}</small><ArrowRight className="h-4 w-4" />
          </button>
        </Reveal>
      </div>
      <Reveal delay={200} className="hero-experience">
        <div className="steps-head"><h3>5 步体验</h3></div>
        <ol className="steps">
          {steps.map((s, i) => <li key={s.n}><button onClick={() => (i === 0 ? startDemo() : goto(s.view))}><span className="step-n">{s.n}</span><s.icon className="h-4 w-4 text-clay-deep" /><b>{s.title}</b></button></li>)}
        </ol>
        <div className="flow-strip">{["群消息", "AI 结构化提取 + 原文校验", "待办建议", "你来确认", "主动提醒、记忆、设备"].map((x, i, a) => <span key={x} className="flex items-center gap-2"><span className="chip">{x}</span>{i < a.length - 1 && <ArrowRight className="h-4 w-4 text-clay" />}</span>)}<span className="ml-auto hidden items-center gap-1 text-xs text-muted md:flex"><PlugZap className="h-3.5 w-3.5" />设备接口预留 HomeAssistant</span></div>
      </Reveal>
      <Reveal delay={260} className="hero-capabilities">
        <section aria-labelledby="capabilities-title">
        <div className="steps-head"><h3 id="capabilities-title">核心能力</h3><span>AI 为主，规则辅助</span></div>
        <div className="grid gap-4 md:grid-cols-3">
          {aboutFeatures.map(([Icon, title, description]) => <GlassCard key={title} className="feature-card p-5" hover>
            <span className="feature-icon"><Icon className="h-5 w-5" /></span>
            <div className="mt-3 font-display font-semibold">{title}</div>
            <p className="mt-1 text-sm text-muted">{description}</p>
          </GlassCard>)}
        </div>
        <p className="capability-boundary"><b>能力与隐私边界：</b>新消息先成为待确认建议；固定规则只用于离线演示或失败兜底；设备联动仅操作模拟设备，需逐次审批。演示数据默认保存在你的浏览器，AI 模式仅将必要消息上下文发送到服务端和模型供应商，密钥不会进入前端。</p>
        </section>
      </Reveal>
    </section>
  );
}
