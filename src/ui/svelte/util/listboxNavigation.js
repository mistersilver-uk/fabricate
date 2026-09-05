/**
 * WHERE THE KEYBOARD CURSOR GOES NEXT, and what to call the row it lands on (issue 1503).
 *
 * ── WHY THIS IS A MODULE AND NOT A HANDLER ──────────────────────────────────────────────────
 * `openspec/specs/design-system/spec.md` requires a listbox to keep DOM focus on ONE element and
 * drive selection with `aria-activedescendant`, which means the "which row is current" state is
 * arithmetic the component holds rather than something the browser does for it. That arithmetic
 * has wrap-around, an out-of-range guard, a two-axis grid form and a "nothing is active yet"
 * sentinel — six behaviours whose only honest test is a table of inputs and outputs.
 *
 * Left inside `SearchablePopover.svelte` the only way to reach it would be through a compiled
 * component, a happy-dom document and a synthesized `keydown` per case, which is why it lives
 * here: the numbers are proved by this module's unit tests and the WIRING (which element listens,
 * what the holder announces, that focus never moves onto a row) is proved by the mounted suite.
 *
 * The module imports nothing, so it is a leaf — but every component that imports IT joins its
 * importers' static-import closures, and each mounted harness that compiles one of them must
 * declare this file in its `rawModules` list. A harness that does not does NOT fail cleanly: it
 * throws in `before()` under `createMountedComponentHarness`, and HANGS in a hand-rolled suite,
 * reported either way as `# cancelled` rather than `# fail`.
 *
 * ── THE SENTINEL ────────────────────────────────────────────────────────────────────────────
 * `-1` means NOTHING IS ACTIVE — the GM has opened a panel and not yet pressed an arrow key — and
 * it is a different state from "the first row is active". It is what makes Enter a no-op on a
 * freshly opened panel instead of a blind choice of whatever happens to be at the top, and what
 * keeps every row free of the active marker until the GM asks for one.
 */

/** The vertical axis. `ArrowDown` is one ROW, which is `columns` cells in the grid form. */
const VERTICAL = new Map([
  ['ArrowDown', 1],
  ['ArrowUp', -1],
]);

/** The horizontal axis. One CELL per press, and it exists only in the grid form. */
const HORIZONTAL = new Map([
  ['ArrowRight', 1],
  ['ArrowLeft', -1],
]);

/** `true` for a whole number that can index a list of `count` rows. */
function isUsableIndex(value, count) {
  return Number.isInteger(value) && value >= 0 && value < count;
}

/** The number of rows, or 0 for anything that cannot be one. */
function rowCount(count) {
  return Number.isInteger(count) && count > 0 ? count : 0;
}

/**
 * The next position of the keyboard cursor, or `null` when the key is not one this owns.
 *
 * `null` is load-bearing rather than a convenience. The element holding focus is usually the
 * panel's QUERY FIELD, so a key this module does not own has to fall through to it untouched — a
 * return of `current` would be indistinguishable from "the cursor did not move" and would have
 * the caller `preventDefault()` every letter the GM types.
 *
 * @param {number} current The active index, or -1 for "nothing is active".
 * @param {number} count How many options the list renders, in its FLAT rendered order.
 * @param {string} key The `KeyboardEvent.key` that was pressed.
 * @param {object} [options]
 * @param {number} [options.columns] Cells per row in the grid form. Defaults to 1, in which case
 *   the list has no horizontal axis at all and Left/Right are left to the query field's caret.
 * @returns {number|null} The next index, or `null` when this key moves no cursor.
 */
export function nextActiveIndex(current, count, key, options = {}) {
  const rows = rowCount(count);
  if (rows === 0) return null;

  if (key === 'Home') return 0;
  if (key === 'End') return rows - 1;

  const columns = Number.isInteger(options?.columns) && options.columns > 1 ? options.columns : 1;
  const step = VERTICAL.has(key)
    ? VERTICAL.get(key) * columns
    : columns > 1 && HORIZONTAL.has(key)
      ? HORIZONTAL.get(key)
      : null;
  if (step === null) return null;

  // ENTERING THE LIST. From the sentinel — or from an index a caller's own `options` change has
  // left past the end — a press lands on an END rather than at `sentinel + step`, because there
  // is no position to step from and stepping from one would select a row the GM never saw.
  if (!isUsableIndex(current, rows)) return step > 0 ? 0 : rows - 1;

  // A CLOSED RING, over the flat order rather than over a rectangle. Wrapping the flat index is
  // what keeps a ragged last row reachable: five options in three columns leaves a two-cell row,
  // and a rectangular wrap would strand the cells under it.
  return (((current + step) % rows) + rows) % rows;
}

/**
 * The DOM `id` of one row, which is also what the holder's `aria-activedescendant` points at.
 *
 * ONE FUNCTION FOR BOTH so a mismatch is impossible by construction: the rows and the holder
 * cannot drift apart if neither of them spells the id itself.
 *
 * @param {string} prefix A per-component-instance prefix (`$props.id()`). Two open pickers both
 *   indexing from 0 would otherwise emit the same DOM id, and an `aria-activedescendant` pointing
 *   at a duplicated id is ambiguous document-wide.
 * @param {number} index The row's position in the FLAT rendered order.
 * @returns {string|undefined} The id, or `undefined` when nothing is active — which is what makes
 *   Svelte OMIT the attribute rather than write an id resolving to no element.
 */
export function activeOptionId(prefix, index) {
  if (typeof prefix !== 'string' || prefix === '') return;
  if (!Number.isInteger(index) || index < 0) return;
  return `${prefix}-option-${index}`;
}
