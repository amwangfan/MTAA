import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Lightbulb, Wind, LockKeyhole, Music2, Sun, Moon, Wifi, Check } from "lucide-react";
import { heroChat, scenarioSeeds } from "../../lib/whale-demo-data.js";

const sportsSignal: any = scenarioSeeds.grade.expectedSignals.find((signal: any) => signal.title === "体育测试");
const labels = ["群聊整理", "每日日程", "设备联动"];
const holdMs = 2500;
const slideMs = 800;

function SchedulePreview() {
  return <div className="preview-schedule">
    <header><span className="preview-eyebrow">YOUR DAY · 演示日程</span><h3><CalendarDays size={20} />把今天安排好</h3><p>11 月 24 日 · 星期二</p></header>
    <div className="preview-day-summary"><strong>3</strong><span>件重要的事<br /><small>消息有着落，生活有条理</small></span><span className="preview-date">24</span></div>
    <div className="preview-agenda">
      <div className="agenda-item sage"><time>09:00</time><div><b>整理功能截图</b><small>{heroChat.taskCard.source} · 进行中</small></div><Check size={15} /></div>
      <div className="agenda-item amber"><time>{sportsSignal.deadline.slice(11, 16)}</time><div><b>{sportsSignal.title}</b><small>{sportsSignal.source}群 · {sportsSignal.location}</small><em>记得带校园卡</em></div></div>
      <div className="agenda-item clay"><time>{heroChat.taskCard.deadline.slice(-5)}</time><div><b>{heroChat.taskCard.title}</b><small>{heroChat.taskCard.source}</small><em>{heroChat.taskCard.deadline.split(" ")[0]}截止</em></div></div>
    </div>
    <footer>每一项安排，都能追溯到原消息。</footer>
  </div>;
}

function DevicePreview() {
  return <div className="preview-devices">
    <header><span className="preview-eyebrow">MY SPACE · 模拟设备</span><h3>让房间懂你的习惯</h3><p><Wifi size={12} /> 宿舍 · 5 台设备在线</p></header>
    <div className="preview-scene"><span><Moon size={16} /> 学习模式</span><b>「我要开始学习了」</b><small>根据记忆推荐，经你确认后调整</small></div>
    <div className="preview-control-grid">
      <div className="control-tile light"><Lightbulb size={24} /><b>书桌台灯</b><span>亮度 75%</span><div className="preview-slider"><i /></div></div>
      <div className="control-tile air"><Wind size={24} /><b>卧室空调</b><strong>26<small>℃</small></strong><span>舒适送风</span></div>
      <div className="control-tile curtain"><Sun size={22} /><b>窗帘</b><span>半开 · 自然光</span></div>
      <div className="control-tile music"><Music2 size={22} /><b>白噪音</b><span>轻雨声 · 低音量</span></div>
    </div>
    <footer><LockKeyhole size={13} /> 门锁已上锁 <span>只读状态</span></footer>
  </div>;
}

export default function HomePreview({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(2);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (hovered || focused) return;
    let timer = window.setTimeout(advance, holdMs);
    function advance() {
      setActive(n => (n + 1) % labels.length);
      timer = window.setTimeout(advance, slideMs + holdMs);
    }
    return () => window.clearTimeout(timer);
  }, [hovered, focused]);
  return <div className="home-carousel" role="region" aria-label="Whale 功能预览轮播"
    onPointerEnter={e => { if (e.pointerType !== "touch") setHovered(true); }} onPointerLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}>
    <div className="home-carousel-stage" style={{ "--slide-duration": `${slideMs}ms` } as CSSProperties}>
      {[children, <SchedulePreview key="schedule" />, <DevicePreview key="devices" />].map((content, index) => {
        const position = (index - active + labels.length) % labels.length;
        return <div key={labels[index]} className={`preview-slide ${position === 0 ? "is-center" : position === 1 ? "is-right" : "is-left"}`}
          aria-hidden={position !== 0} ref={node => { if (node) node.inert = position !== 0; }}>{content}</div>;
      })}
    </div>
    {[
      { side: "prev", label: "上一张卡片", step: -1, Icon: ChevronLeft },
      { side: "next", label: "下一张卡片", step: 1, Icon: ChevronRight },
    ].map(({ side, label, step, Icon }) => (
      <button
        key={side}
        type="button"
        className={`preview-arrow preview-arrow-${side}`}
        aria-label={label}
        onClick={e => {
          setActive(index => (index + step + labels.length) % labels.length);
          if (e.detail > 0) e.currentTarget.blur();
        }}
      >
        <Icon size={19} aria-hidden="true" />
      </button>
    ))}
  </div>;
}
