/** The shared category-total model behind the GM library group headers (issue 676). */

/** Count rows per category. */
export function countByCategory(rows, categoryOf) {
  const counts = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const category = categoryOf(row);
    counts.set(category, (counts.get(category) || 0) + 1);
  }
  return counts;
}

/** The total to show beside a group's rendered count. */
export function categoryTotalOf(totals, category, renderedCount) {
  const total = totals instanceof Map ? totals.get(category) : undefined;
  return Number.isInteger(total) && total > renderedCount ? total : renderedCount;
}
