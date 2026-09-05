/**
 * WHERE THE KEYBOARD CURSOR GOES NEXT, and what to call the row it lands on (issues 1503, 1504).
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
 * ── WHAT ISSUE 1504 ADDS, AND WHY IT LANDS HERE RATHER THAN IN THE COMPONENT ────────────────
 * A shared `<Select>` is a listbox whose query field is suppressed, so two behaviours a native
 * `<select>` has for free stop being free: a GATED option must be stepped OVER rather than landed
 * on, and a TYPED CHARACTER must jump to the option it names. Both are arithmetic over the flat
 * rendered order — the same order this module already owns — and both are inherited by every
 * select the epic converts, so a copy per call site is exactly what putting them here prevents.
 * `nextActiveIndex` gains an optional `isDisabled` predicate for the first.
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

/** One position on the closed ring of `rows` rows, whatever the arithmetic handed it. */
function ring(index, rows) {
  return ((index % rows) + rows) % rows;
}

/**
 * `true` when the row at `index` is one the cursor must not land on.
 *
 * The predicate is OPTIONAL and an absent one answers `false` for every row, which is what makes
 * the whole disabled axis cost an existing caller nothing: no predicate, no skip scan, and the
 * same number out of every branch below as before issue 1504 added them.
 */
function skips(isDisabled, index) {
  return typeof isDisabled === 'function' && Boolean(isDisabled(index));
}

/**
 * The first ENABLED row at or after `from`, walking `direction` around the ring.
 *
 * `fallback` is the answer when there is no enabled row at all — every option disabled, which is
 * a real state for a select whose whole list is gated. The scan is bounded by `rows` rather than
 * by "until it comes back round", because the two differ precisely in the case that matters: a
 * ring with nothing enabled would otherwise spin forever.
 */
function firstEnabled({ from, direction, rows, isDisabled, fallback }) {
  if (typeof isDisabled !== 'function') return from;
  for (let scanned = 0; scanned < rows; scanned += 1) {
    const index = ring(from + direction * scanned, rows);
    if (!skips(isDisabled, index)) return index;
  }
  return fallback;
}

/**
 * The next position of the keyboard cursor, or `null` when the key is not one this owns.
 *
 * `null` is load-bearing rather than a convenience. The element holding focus is usually the
 * panel's QUERY FIELD, so a key this module does not own has to fall through to it untouched — a
 * return of `current` would be indistinguishable from "the cursor did not move" and would have
 * the caller `preventDefault()` every letter the GM types.
 *
 * ── THE DISABLED AXIS (issue 1504) ──────────────────────────────────────────────────────────
 * `isDisabled` is an INDEX predicate rather than the option array, so this module stays off the
 * option SHAPE: a caller whose rows are `{disabled}`, `{available: false}` or a separate gate set
 * all answer the same question here. It is optional, and an absent one is not a special case with
 * a branch — `firstEnabled` returns its starting index untouched — so every pre-1504 importer
 * gets the same number out of every branch below that it got before, with no skip scan at all.
 *
 * @param {number} current The active index, or -1 for "nothing is active".
 * @param {number} count How many options the list renders, in its FLAT rendered order.
 * @param {string} key The `KeyboardEvent.key` that was pressed.
 * @param {object} [options]
 * @param {number} [options.columns] Cells per row in the grid form. Defaults to 1, in which case
 *   the list has no horizontal axis at all and Left/Right are left to the query field's caret.
 * @param {(index: number) => boolean} [options.isDisabled] Which rows the cursor must skip. With
 *   NO enabled row at all the scan terminates and the cursor stays where it is, which is the
 *   answer a fully gated list has: -1 when nothing was active, and the current row otherwise.
 * @returns {number|null} The next index, or `null` when this key moves no cursor.
 */
export function nextActiveIndex(current, count, key, options = {}) {
  const rows = rowCount(count);
  if (rows === 0) return null;

  const isDisabled = options?.isDisabled;
  // WHERE THE CURSOR STAYS when there is nowhere enabled to go. An index the caller's own
  // `options` change has left past the end is not a position to stay at, so it reads as the
  // sentinel — the same reading the entry branch below already gives it.
  const fallback = isUsableIndex(current, rows) ? current : -1;

  // THE ENDS ARE THE OUTERMOST ENABLED ROWS, not the outermost rows. Home landing on a gated
  // first option would announce a row the GM cannot choose and make Enter a no-op they have no
  // way to explain; scanning INWARD from each end is what keeps both keys meaningful.
  if (key === 'Home') return firstEnabled({ from: 0, direction: 1, rows, isDisabled, fallback });
  if (key === 'End')
    return firstEnabled({ from: rows - 1, direction: -1, rows, isDisabled, fallback });

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
  //
  // A CLOSED RING, over the flat order rather than over a rectangle. Wrapping the flat index is
  // what keeps a ragged last row reachable: five options in three columns leaves a two-cell row,
  // and a rectangular wrap would strand the cells under it.
  const landing = isUsableIndex(current, rows)
    ? ring(current + step, rows)
    : step > 0
      ? 0
      : rows - 1;

  // THE SKIP SCAN WALKS ONE ROW AT A TIME, even where the press was `columns` wide. In the grid
  // form a scan that kept stepping by `columns` would only ever visit one COLUMN of the ring, so
  // a grid whose first column was gated would strand every enabled tile beside it; walking the
  // flat order visits every cell, which is the same order the ids and the cursor are numbered in.
  return firstEnabled({
    from: landing,
    direction: Math.sign(step),
    rows,
    isDisabled,
    fallback,
  });
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
