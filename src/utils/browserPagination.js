/**
 * The one page-window model behind every GM library pager (issue 1036).
 *
 * `paginateComponents`, `paginateRecipes` and `paginateEssences` are the same arithmetic
 * over three different row nouns: clamp the requested page into range, slice it, and
 * report a 1-based inclusive RANGE. Each browser model keeps its own noun-named export —
 * the returned page is keyed `components` / `recipes` / `essences` and the views read that
 * key — but the arithmetic lives here once, so a third literal copy never lands and a fix
 * to the clamp cannot reach two studios out of three.
 *
 * The clamp is what stops a filter change that SHRINKS the list from stranding the pager
 * on an empty page, and the range is reported because the library count reads "1–5 of 12":
 * a bare "5 of 12" never tells the GM which page they are looking at. An empty result
 * reports `0..0` rather than `1..0`.
 *
 * A pure leaf: no Foundry globals, no store reads, and no imports at all. That leaf status
 * is load-bearing beyond tidiness — every mounted-Svelte suite naming a browser model must
 * name this file too, and an import added here would propagate into all of those lists.
 */

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Slice one page out of the rows, clamping the page index into range.
 *
 * @param {object[]} rows
 * @param {{pageIndex?: number, pageSize?: number}} [options]
 * @param {number} defaultPageSize the studio's own default, used when `pageSize` is
 *   absent or unparseable.
 * @returns {{rows: object[], pageIndex: number, pageCount: number, totalCount: number,
 *   rangeStart: number, rangeEnd: number}} `rows` is the PAGE; each caller re-keys it to
 *   its own noun.
 */
export function paginateRows(rows, options = {}, defaultPageSize = 25) {
  const all = Array.isArray(rows) ? rows : [];
  const pageSize = Math.max(1, numeric(options.pageSize, defaultPageSize));
  const pageCount = Math.max(1, Math.ceil(all.length / pageSize));
  const pageIndex = Math.min(Math.max(0, numeric(options.pageIndex)), pageCount - 1);
  const start = pageIndex * pageSize;
  const page = all.slice(start, start + pageSize);

  return {
    rows: page,
    pageIndex,
    pageCount,
    totalCount: all.length,
    rangeStart: page.length > 0 ? start + 1 : 0,
    rangeEnd: page.length > 0 ? start + page.length : 0,
  };
}
