// Where the keyboard cursor goes next, which intent a holder key carries, and what to call the row it lands on (issues 1503, 1504).
// `openspec/specs/design-system/spec.md` requires a listbox to hold DOM focus on ONE element and
// drive selection with `aria-activedescendant`, so "which row is current" is arithmetic — with
// wrap-around, an out-of-range guard, a grid form and a sentinel — whose only honest test is a table
// of inputs and outputs. THE SENTINEL `-1` means NOTHING IS ACTIVE, which is a different state from
// "the first row is active": it is what makes Enter a no-op on a freshly opened panel.

// A leaf, but every importer's mounted harness must list this file in `rawModules`; one that does
// not throws in `before()`, or HANGS, reported either way as `# cancelled` rather than `# fail`.

const VERTICAL = new Map([
  ['ArrowDown', 1],
  ['ArrowUp', -1],
]);

const HORIZONTAL = new Map([
  ['ArrowRight', 1],
  ['ArrowLeft', -1],
]);

function isUsableIndex(value, count) {
  return Number.isInteger(value) && value >= 0 && value < count;
}

function rowCount(count) {
  return Number.isInteger(count) && count > 0 ? count : 0;
}

function ring(index, rows) {
  return ((index % rows) + rows) % rows;
}

// The predicate is OPTIONAL, and an absent one answers `false` for every row, so the disabled axis
// costs a pre-1504 caller nothing: no predicate, no skip scan, the same number out of every branch.
function skips(isDisabled, index) {
  return typeof isDisabled === 'function' && Boolean(isDisabled(index));
}

// `fallback` answers the fully-gated list, which is a real state. The scan is bounded by `rows`
// rather than by "until it comes back round": a ring with nothing enabled would otherwise spin.
function firstEnabled({ from, direction, rows, isDisabled, fallback }) {
  if (typeof isDisabled !== 'function') return from;
  for (let scanned = 0; scanned < rows; scanned += 1) {
    const index = ring(from + direction * scanned, rows);
    if (!skips(isDisabled, index)) return index;
  }
  return fallback;
}

// `null` is load-bearing: focus usually sits on the panel's QUERY FIELD, so a key this module does
// not own must fall through untouched — returning `current` reads as "the cursor did not move" and
// would `preventDefault()` every typed letter. `isDisabled` is an INDEX predicate, not the option
// array, so this module stays off the option SHAPE.
export function nextActiveIndex(current, count, key, options = {}) {
  const rows = rowCount(count);
  if (rows === 0) return null;

  const isDisabled = options?.isDisabled;
  // Where the cursor stays with nowhere enabled to go. An index a caller's own `options` change
  // left past the end is not a position to stay at, so it reads as the sentinel.
  const fallback = isUsableIndex(current, rows) ? current : -1;

  // The ends are the outermost ENABLED rows: Home landing on a gated first option would announce a
  // row the GM cannot choose, so each end scans inward.
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

  // Entering the list from the sentinel lands on an END rather than at `sentinel + step`: there is
  // no position to step from. The ring closes over the FLAT order, not a rectangle, which is what
  // keeps a ragged last row reachable — a rectangular wrap would strand the cells under it.
  const landing = isUsableIndex(current, rows)
    ? ring(current + step, rows)
    : step > 0
      ? 0
      : rows - 1;

  // The skip scan walks ONE row at a time even where the press was `columns` wide: stepping by
  // `columns` would visit one COLUMN of the ring, stranding every enabled tile beside a gated one.
  return firstEnabled({
    from: landing,
    direction: Math.sign(step),
    rows,
    isDisabled,
    fallback,
  });
}

const TYPE_AHEAD_RESET_MS = 500;

// Where a typed prefix puts the cursor, rebuilt once here because a select-only combobox suppresses
// the query field issue 1503 routes printable keys to (issue 1504). THE BUFFER IS A VALUE, not state
// held here: a module-level one would be shared by every picker on screen and could not be reset on
// close; the clock is a DEFAULT rather than a read, so a test can observe the inactivity window.
// The rules: case-insensitive, against the rendered LABEL rather than the value (a page-size
// control's value is 25); a disabled row is skipped; a prefix matching nothing returns a `null`
// index yet still EXTENDS the buffer, so a fourth character can rescue a mistyped third; a repeated
// single character CYCLES rather than searching for `aaa`; and SPACE only continues a live prefix.
export function typeAheadCursor(current, labels, key, options = {}) {
  // A printable character is exactly a one-character `key`: every navigation and editing key spells
  // itself out, so the length test needs no list and cannot fall behind an unseen keyboard layout.
  if (typeof key !== 'string' || key.length !== 1) return null;

  const now = Number.isFinite(options?.now) ? options.now : Date.now();
  const resetAfter = Number.isFinite(options?.resetAfter)
    ? options.resetAfter
    : TYPE_AHEAD_RESET_MS;
  const previous = options?.buffer;
  // A clock READ, not a timer: a timer would need clearing on close, on unmount and on an options
  // change, where elapsed time answers the same question with nothing to tear down.
  const carried =
    typeof previous?.text === 'string' &&
    Number.isFinite(previous?.at) &&
    now - previous.at <= resetAfter
      ? previous.text
      : '';
  if (key === ' ' && carried === '') return null;

  const buffer = { text: carried + key, at: now };
  return { buffer, index: prefixMatch(buffer.text, labels, current, options?.isDisabled) };
}

// Where the scan STARTS is the difference between refining and cycling: two or more different
// characters start AT the active row, a single character or a repeat at the row AFTER it.
function prefixMatch(text, labels, current, isDisabled) {
  const rows = Array.isArray(labels) ? labels.length : 0;
  if (rows === 0) return null;

  const repeated = [...text].every((character) => character === text[0]);
  const needle = (repeated ? text[0] : text).toLowerCase();
  const anchor = isUsableIndex(current, rows) ? current : -1;
  const from = repeated ? anchor + 1 : Math.max(anchor, 0);

  for (let scanned = 0; scanned < rows; scanned += 1) {
    const index = ring(from + scanned, rows);
    if (skips(isDisabled, index)) continue;
    if (
      String(labels[index] ?? '')
        .trim()
        .toLowerCase()
        .startsWith(needle)
    ) {
      return index;
    }
  }
  return null;
}

const CARET_EDGE = new Map([
  ['ArrowLeft', 'start'],
  ['Home', 'start'],
  ['ArrowRight', 'end'],
  ['End', 'end'],
]);

/** Whether the key belongs to the caret in the holder's query field rather than to the list. */
export function caretOwnsKey(event) {
  const field = event.target;
  if (typeof field?.selectionStart !== 'number') return false;
  const edge = CARET_EDGE.get(event.key);
  if (!edge) return false;
  if (field.selectionStart !== field.selectionEnd) return true;
  return edge === 'start' ? field.selectionStart > 0 : field.selectionEnd < field.value.length;
}

const OPENING_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

/** What a closed select-only holder opens on this key, or `null`; `altOpen` moves no cursor. */
export function openingKeyOwns(event) {
  if (event.ctrlKey || event.metaKey || event.shiftKey) return null;
  const altOpen = Boolean(event.altKey && event.key === 'ArrowDown');
  if (!altOpen && (event.altKey || !OPENING_KEYS.has(event.key))) return null;
  return { altOpen };
}

/** What type-ahead does with this key on a select-only holder, or `null` when it owns none of it. */
export function typeAheadOwnsKey(event, context = {}) {
  if (context.showSearch || context.holderDisabled) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  return typeAheadCursor(context.current, context.labels, event.key, {
    buffer: context.buffer,
    isDisabled: context.isDisabled,
    now: context.now,
    resetAfter: context.resetAfter,
  });
}

const PASS_THROUGH = Object.freeze({ kind: 'pass-through' });

function cursorMove(from, event, context) {
  return nextActiveIndex(from, context.count, event.key, {
    columns: context.columns,
    isDisabled: context.isDisabled,
  });
}

function typeAheadIntent(typed) {
  return { kind: 'type-ahead', buffer: typed.buffer, index: typed.index };
}

function closedHolderIntent(event, context) {
  const opening = context.showSearch || context.holderDisabled ? null : openingKeyOwns(event);
  if (opening) {
    return { kind: 'open', index: opening.altOpen ? null : cursorMove(-1, event, context) };
  }
  const typed = typeAheadOwnsKey(event, context);
  return typed ? typeAheadIntent(typed) : PASS_THROUGH;
}

/** One intent per holder key: its kind, the landing index or `null`, and type-ahead's next buffer. */
export function holderKeyIntent(event, context = {}) {
  if (!context.open) return closedHolderIntent(event, context);
  if (event.key === 'Enter') {
    return isUsableIndex(context.current, rowCount(context.count))
      ? { kind: 'choose', index: context.current }
      : PASS_THROUGH;
  }
  const typed = typeAheadOwnsKey(event, context);
  if (typed) return typeAheadIntent(typed);
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return PASS_THROUGH;
  if (caretOwnsKey(event)) return PASS_THROUGH;
  const index = cursorMove(context.current, event, context);
  return index === null ? PASS_THROUGH : { kind: 'move-cursor', index };
}

// One function for the row id AND the holder's `aria-activedescendant`, so the two cannot drift.
// `prefix` is per component instance, because two pickers both indexing from 0 would emit the same
// DOM id; `undefined` is what makes Svelte OMIT the attribute rather than point it at no element.
export function activeOptionId(prefix, index) {
  if (typeof prefix !== 'string' || prefix === '') return;
  if (!Number.isInteger(index) || index < 0) return;
  return `${prefix}-option-${index}`;
}
