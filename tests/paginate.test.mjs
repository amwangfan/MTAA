import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paginateFilter, PAGE_SIZE } from '../lib/paginate.js';

const items = Array.from({ length: 8 }, (_, i) => ({ summary: `条目${i + 1}`, tag: i % 2 ? '辣' : '甜' }));
const textOf = it => `${it.summary} ${it.tag}`;

test('PAGE_SIZE is 3', () => { assert.equal(PAGE_SIZE, 3); });

test('≤3 items: single page, all shown, no pager needed', () => {
  const r = paginateFilter(items.slice(0, 3), '', 1, 3, textOf);
  assert.equal(r.items.length, 3);
  assert.equal(r.pages, 1);
  assert.equal(r.page, 1);
  const r2 = paginateFilter(items.slice(0, 1), '', 1, 3, textOf);
  assert.equal(r2.items.length, 1);
  assert.equal(r2.pages, 1);
});

test('>3 items: correct page count and slicing', () => {
  const r = paginateFilter(items, '', 1, 3, textOf);
  assert.equal(r.pages, 3); // ceil(8/3)
  assert.deepEqual(r.items.map(x => x.summary), ['条目1', '条目2', '条目3']);
  const p3 = paginateFilter(items, '', 3, 3, textOf);
  assert.deepEqual(p3.items.map(x => x.summary), ['条目7', '条目8']);
});

test('page clamps into range', () => {
  assert.equal(paginateFilter(items, '', 99, 3, textOf).page, 3);
  assert.equal(paginateFilter(items, '', 0, 3, textOf).page, 1);
});

test('search filters and reports match count; page resets are safe', () => {
  const r = paginateFilter(items, '辣', 1, 3, textOf);
  assert.equal(r.matched, 4);
  assert.equal(r.pages, 2);
  assert.deepEqual(r.items.map(x => x.summary), ['条目2', '条目4', '条目6']);
  assert.equal(r.searching, true);
  // 请求超出过滤后页数时夹回最后一页（等效于重置页码后的安全行为）
  assert.equal(paginateFilter(items, '辣', 5, 3, textOf).page, 2);
});

test('clearing query restores the full list', () => {
  const searched = paginateFilter(items, '辣', 1, 3, textOf);
  assert.equal(searched.matched, 4);
  const cleared = paginateFilter(items, '', 1, 3, textOf);
  assert.equal(cleared.matched, 8);
  assert.equal(cleared.searching, false);
  const whitespace = paginateFilter(items, '   ', 1, 3, textOf);
  assert.equal(whitespace.matched, 8, '纯空白视为未搜索');
});

test('empty list: pages=1, no crash', () => {
  const r = paginateFilter([], 'anything', 1, 3, textOf);
  assert.equal(r.pages, 1);
  assert.equal(r.items.length, 0);
  assert.equal(r.matched, 0);
});
