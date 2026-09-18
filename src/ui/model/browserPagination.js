/** The one page-window model behind every GM library pager (issue 1036). */

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Slice one page out of the rows, clamping the page index into range. */
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
