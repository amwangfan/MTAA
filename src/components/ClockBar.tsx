import { Clock3, Plus, FastForward, Play, Pause } from "lucide-react";
import { store, state, moveClock, setAutoplay, allRows, notify, persist } from "../store";
import { reminderAt, longReminderAt } from "../../lib/engine.js";
import { fmt, day } from "../fmt";
import { Button, GlassCard } from "./ui";

export default function ClockBar() {
  const s = state(); const ini = store.initiative;
  const times = allRows().flatMap(({ task }: any) => [task.status === "todo" && task.due && !task.reminded ? reminderAt(task) : null, longReminderAt(task, s.now)]).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  const next = () => {
    if (!times.length) return;
    moveClock(Math.max(s.now, Math.min(...times))).then(() => persist());
  };
  return (
    <GlassCard tour="clock" hover={false} className="mb-6 flex flex-wrap items-center gap-3 p-4">
      <div className="flex items-center gap-2">
        <span className="text-whale-800"><Clock3 className="h-6 w-6" /></span>
        <div>
          <div className="text-xs text-muted">演示时钟</div>
          <div className="font-mono text-sm font-semibold text-slate-800">{day(s.now).slice(0, 4)} / {fmt(s.now)}</div>
        </div>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => moveClock(s.now + 3600000).then(() => persist())}><Plus className="h-3 w-3" />1小时</Button>
        <Button size="sm" variant="ghost" onClick={() => moveClock(s.now + 24 * 3600000).then(() => persist())}><Plus className="h-3 w-3" />1天</Button>
        <Button size="sm" variant="soft" onClick={next} disabled={!times.length}><FastForward className="h-3 w-3" />下一次提醒</Button>
        <Button size="sm" variant={ini.autoplay ? "danger" : "primary"} onClick={() => setAutoplay(!ini.autoplay)}>
          {ini.autoplay ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}{ini.autoplay ? "停止" : "自动播放"}
        </Button>
        <select value={String(ini.speed || 1)} onChange={(e) => { ini.speed = Number(e.target.value); persist(); notify(); }} className="rounded-xl border border-field-line bg-white/80 px-2 py-1.5 text-xs">
          <option value="1">1分/秒</option><option value="5">5分/秒</option><option value="15">15分/秒</option><option value="60">1时/秒</option>
        </select>
      </div>
    </GlassCard>
  );
}
