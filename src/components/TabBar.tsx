import { useRef } from "react";

/* 容器视图的标签页条：role=tablist，支持 ←/→/Home/End 键盘切换。 */
export type TabItem = { id: string; label: string; icon?: any; count?: number };

export default function TabBar({ scope, tabs, active, onChange, label }: {
  scope: string;
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const focus = (i: number) => { refs.current[i]?.focus(); onChange(tabs[i].id); };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "ArrowRight") { e.preventDefault(); focus((i + 1) % tabs.length); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); focus((i - 1 + tabs.length) % tabs.length); }
    else if (e.key === "Home") { e.preventDefault(); focus(0); }
    else if (e.key === "End") { e.preventDefault(); focus(tabs.length - 1); }
  };
  return (
    <div className="view-tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button key={t.id} ref={(el) => { refs.current[i] = el; }}
          role="tab" id={`tab-${scope}-${t.id}`} aria-selected={active === t.id} aria-controls={`tabpanel-${scope}-${t.id}`}
          tabIndex={active === t.id ? 0 : -1}
          onClick={() => onChange(t.id)} onKeyDown={(e) => onKey(e, i)}>
          {t.icon && <t.icon size={15} aria-hidden />}<span>{t.label}</span>
          {typeof t.count === "number" && t.count > 0 ? <em className="tab-count">{t.count}</em> : null}
        </button>
      ))}
    </div>
  );
}
