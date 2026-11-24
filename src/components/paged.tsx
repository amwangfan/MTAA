import { useState } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { paginateFilter, PAGE_SIZE } from "../../lib/paginate.js";

// 模块内分页＋搜索的共享钩子与控件。样式走 Tailwind（暖纸：白底细线圆角、clay 焦点），不改 index.css。
export function usePagedSearch<T>(items: T[], textOf: (t: T) => string) {
  const [query, setQueryRaw] = useState("");
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const setQuery = (q: string) => { setQueryRaw(q); setPage(1); }; // 搜索时重置到第 1 页
  const toggle = () => { if (open) { setQueryRaw(""); setPage(1); } setOpen(!open); }; // 关闭即清空恢复全量
  const result = paginateFilter(items, query, page, PAGE_SIZE, (t: any) => textOf(t));
  return { ...result, query, setQuery, open, toggle, setPage };
}
export type PagedSearch<T> = ReturnType<typeof usePagedSearch<T>>;

const iconBtn = "grid h-7 w-7 place-items-center rounded-lg border border-line bg-white text-ink-2 hover:bg-paper-2 focus:border-clay-deep focus:outline-none";

export function ModuleSearch({ ps, placeholder = "搜索本模块" }: { ps: PagedSearch<any>; placeholder?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {ps.open && (
        <>
          <input
            autoFocus
            value={ps.query}
            onChange={e => ps.setQuery(e.target.value)}
            placeholder={placeholder}
            aria-label="搜索本模块"
            className="h-7 w-36 rounded-lg border border-line bg-white px-2 text-xs text-ink focus:border-clay-deep focus:outline-none"
          />
          {ps.query && <span className="text-xs text-muted">{ps.matched} 条</span>}
        </>
      )}
      <button type="button" aria-label={ps.open ? "关闭搜索" : "搜索本模块"} aria-expanded={ps.open} onClick={ps.toggle} className={iconBtn}>
        {ps.open ? <X size={14} /> : <Search size={14} />}
      </button>
    </span>
  );
}

export function Pager({ ps }: { ps: PagedSearch<any> }) {
  if (ps.pages <= 1) return null; // ≤3 条（单页）不显示控件
  return (
    <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted">
      <button type="button" aria-label="上一页" disabled={ps.page <= 1} onClick={() => ps.setPage(ps.page - 1)} className={iconBtn + " disabled:opacity-40"}>
        <ChevronLeft size={14} />
      </button>
      <span aria-live="polite">{ps.page}/{ps.pages} 页</span>
      <button type="button" aria-label="下一页" disabled={ps.page >= ps.pages} onClick={() => ps.setPage(ps.page + 1)} className={iconBtn + " disabled:opacity-40"}>
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
