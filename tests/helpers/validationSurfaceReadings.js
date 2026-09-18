/** The two readings of a rendered `EditorValidationSurface` that have to agree (issue 1517). */

/**
 * The rail's tiles, as numbers, keyed by the count each one reports.
 *
 * @param {ParentNode} root The mounted subtree holding the surface.
 */
export function railCounts(root) {
  return Object.fromEntries(
    Array.from(root.querySelectorAll('[data-editor-validation-count]')).map((tile) => [
      tile.getAttribute('data-editor-validation-count'),
      Number(tile.textContent.trim()),
    ])
  );
}

/**
 * The SAME question asked of the rendered rows: how many of each status is drawn.
 *
 * @param {ParentNode} root The mounted subtree holding the surface.
 */
export function rowStatusTally(root) {
  const tally = { passing: 0, warnings: 0, blocking: 0 };
  for (const row of root.querySelectorAll('[data-validation-group] .manager-recipe-val-row')) {
    if (row.classList.contains('is-pass')) tally.passing += 1;
    if (row.classList.contains('is-warn')) tally.warnings += 1;
    if (row.classList.contains('is-block')) tally.blocking += 1;
  }
  return tally;
}

/**
 * The row tally, narrowed to the counts the rail actually reports.
 *
 * @param {ParentNode} root The mounted subtree holding the surface.
 */
export function tallyMatchingRail(root) {
  const tally = rowStatusTally(root);
  return Object.fromEntries(Object.keys(railCounts(root)).map((count) => [count, tally[count]]));
}
