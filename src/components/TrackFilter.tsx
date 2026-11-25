import { GraduationCap, Coffee, Layers } from "lucide-react";
import { store, setTrack, TRACKS, type Track } from "../store";

const trackIcon: Record<Track, any> = { study: GraduationCap, life: Coffee, all: Layers };

/* 顶部场景筛选沿用既有 TRACKS/setTrack：学习含年级群，生活含社团/宿舍，全部覆盖六群。 */
export default function TrackFilter() {
  return (
    <div className="track-switch is-top" role="radiogroup" aria-label="场景筛选">
      {(Object.keys(TRACKS) as Track[]).map((track) => {
        const Icon = trackIcon[track];
        return <button key={track} type="button" role="radio" aria-checked={store.track === track}
          disabled={store.busy || store.demo.running} title={TRACKS[track].desc} onClick={() => setTrack(track)}>
          <Icon size={13} aria-hidden="true" />{TRACKS[track].label}
        </button>;
      })}
    </div>
  );
}
