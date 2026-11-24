// 模块内分页＋搜索的纯逻辑（无依赖，便于单测）。
export const PAGE_SIZE = 3;

/**
 * paginateFilter(items, query, page, size, textOf)
 * - query 非空时按 textOf(item) 包含过滤（大小写不敏感）
 * - 页码自动夹取到 [1, pages]；过滤后为空时 pages=1、items=[]
 * 返回 { items, page, pages, total, matched }（matched=过滤后总数）。
 * @param {Array} items
 * @param {string} query
 * @param {number} [page]
 * @param {number} [size]
 * @param {(item: any) => string} [textOf]
 */
export function paginateFilter(items, query, page = 1, size = PAGE_SIZE, textOf = String) {
  const q = String(query || '').trim().toLowerCase();
  const filtered = q ? items.filter(it => String(textOf(it)).toLowerCase().includes(q)) : items;
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * size;
  return { items: filtered.slice(start, start + size), page: current, pages, total: items.length, matched: filtered.length, searching: q.length > 0 };
}
