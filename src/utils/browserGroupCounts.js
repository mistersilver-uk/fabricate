/**
 * The shared category-total model behind the GM library group headers (issue 676).
 *
 * Both libraries group the PAGE, not the filtered list (see `recipeBrowserModel.js` and
 * `componentBrowserModel.js`): the pager stays the unit of truth for how many rows are
 * on screen, so a header counting the filtered list would put "12 recipes" above the
 * three rows page 2 renders. The reverse reading is just as wrong the other way —
 * "General · 25 components" above page 1 of a 282-strong General bucket says the bucket
 * holds 25. So the header carries BOTH numbers ("25 of 282"), and this module supplies
 * the second one.
 *
 * The total is computed over the FILTERED rows, never the raw roster: a category total
 * that ignored the active search / category / essence filters would be a third wrong
 * number.
 *
 * It lives under `src/utils/` and is shared by both browser models rather than copied
 * into each: the two studios must read as one product, and a hand-copied count loop is
 * how they stop.
 */

/**
 * Count rows per category.
 *
 * @param {object[]} rows the FILTERED rows (pre-pagination), in any order.
 * @param {(row: object) => string} categoryOf reads a row's normalized category key.
 * @returns {Map<string, number>} category key → how many filtered rows it holds.
 */
export function countByCategory(rows, categoryOf) {
  const counts = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const category = categoryOf(row);
    counts.set(category, (counts.get(category) || 0) + 1);
  }
  return counts;
}

/**
 * The total to show beside a group's rendered count.
 *
 * Falls back to the rendered count when the category is absent from the map (an
 * un-supplied totals map, or a caller that grouped rows the totals were not computed
 * from) — so a header can never claim a category holds FEWER rows than it is rendering.
 *
 * @param {Map<string, number>|null|undefined} totals from {@link countByCategory}.
 * @param {string} category
 * @param {number} renderedCount how many rows this group renders on the current page.
 * @returns {number}
 */
export function categoryTotalOf(totals, category, renderedCount) {
  const total = totals instanceof Map ? totals.get(category) : undefined;
  return Number.isInteger(total) && total > renderedCount ? total : renderedCount;
}
