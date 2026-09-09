/**
 * The two readings of a rendered `EditorValidationSurface` that have to agree (issue 1517).
 *
 * "The count rail, the verdict and the rendered rows are one reading of one state" is a sentence
 * in `openspec/specs/design-system/spec.md`, and the only way to assert it is to read the rail and
 * to read the rows and to compare them. Three suites now do that — the recipe tab's, the checks
 * route's and the environment editor's — and each had, or was about to have, its own copy of both
 * readers.
 *
 * THEY ARE HERE BECAUSE THREE COPIES OF THE SAME SHAPE IS WHAT THE DUPLICATION GATE COUNTS, and
 * because the comparison is only worth anything while the two sides are read the same way: a suite
 * that quietly tallied `.is-warn` rows outside `[data-validation-group]`, or counted a tile the
 * surface renders but another suite's copy skipped, would report agreement or disagreement that
 * says nothing about the other surfaces.
 *
 * Not named `*.test.js`: `tests/helpers/` is outside the `npm test` glob, so nothing here is
 * collected as a suite.
 */

/**
 * The rail's tiles, as numbers, keyed by the count each one reports.
 *
 * A tile is present only for a count the site REPORTS — the surface draws the subset of
 * `passing | warnings | blocking` it is given — so the returned object's keys are themselves part
 * of the reading. A two-state surface answers `{ passing, blocking }` and no `warnings` key.
 *
 * @param {ParentNode} root The mounted subtree holding the surface.
 * @returns {Record<string, number>}
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
 * Scoped to `[data-validation-group]` because that is what the rail is a tally OF. The summary
 * medallion above it carries its own status class, and a document-wide sweep for `.is-pass` would
 * count it as a fourth row and make every comparison off by one.
 *
 * A key is omitted when its count is zero and the caller asked for the two-state shape, so the
 * result is compared with the rail through {@link tallyMatchingRail} rather than directly.
 *
 * @param {ParentNode} root The mounted subtree holding the surface.
 * @returns {{passing: number, warnings: number, blocking: number}}
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
 * A site that reports two tiles has no `warnings` tile to disagree with, so comparing the full
 * three-key tally against it would fail on a key the surface was never asked to draw. This keeps
 * the comparison to the question the site claims to answer.
 *
 * @param {ParentNode} root The mounted subtree holding the surface.
 * @returns {Record<string, number>}
 */
export function tallyMatchingRail(root) {
  const tally = rowStatusTally(root);
  return Object.fromEntries(Object.keys(railCounts(root)).map((count) => [count, tally[count]]));
}
