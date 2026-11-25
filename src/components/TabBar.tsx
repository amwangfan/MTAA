import { useRef } from "react";

export type TabItem = { id: string; label: string; icon?: any; count?: number };

/* 返回键盘操作的目标标签；非导航键返回 null，便于调用方决定是否阻止默认行为。 */
export function tabKeyTarget(key: string, index: number, count: number): number | null {
  if (count < 1) return null;
  if (key === "ArrowRight") return (index + 1) % count;
  if (key === "ArrowLeft") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/* 容器视图标签：自动激活、roving tabindex，并提供完整的 tab/tabpanel 关联。 */
export default function TabBar({ scope, tabs, active, onChange, label }: {
  scope: string;
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const target = tabKeyTarget(event.key, index, tabs.length);
    if (target === null) return;
    event.preventDefault();
    refs.current[target]?.focus();
    onChange(tabs[target].id);
  };
  return (
    <div className="view-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button key={tab.id} ref={(element) => { refs.current[index] = element; }}
          type="button" role="tab" id={`tab-${scope}-${tab.id}`}
          aria-selected={active === tab.id} aria-controls={`tabpanel-${scope}-${tab.id}`}
          tabIndex={active === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)} onKeyDown={(event) => onKey(event, index)}>
          {tab.icon && <tab.icon size={15} aria-hidden="true" />}<span>{tab.label}</span>
          {typeof tab.count === "number" && tab.count > 0 ? <em className="tab-count">{tab.count}</em> : null}
        </button>
      ))}
    </div>
  );
}
