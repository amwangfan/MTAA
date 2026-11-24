import { GraduationCap, Coffee, Layers } from "lucide-react";
import { store, setTrack, TRACKS, type Track } from "../store";

const trackIcon: Record<Track, any> = { study: GraduationCap, life: Coffee, all: Layers };

/* 页面顶部的场景筛选：紧凑分段控件（原侧栏 track-switch 上移）。 */
export default function TrackFilter() {
  return (
    <div className="track-switch is-top" role="radiogroup" aria-label="场景筛选">
      {(Object.keys(TRACKS) as Track[]).map((t) => {
        const Icon = trackIcon[t];
        return <button key={t} role="radio" aria-checked={store.track === t} disabled={store.busy || store.demo.running} title={TRACKS[t].desc} onClick={() => setTrack(t)}><Icon size={13} aria-hidden />{TRACKS[t].label}</button>;
      })}
    </div>
  );
}
