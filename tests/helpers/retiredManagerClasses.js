/**
 * The nine `manager-*` root classes issue 1507 retired, each with the root that replaced it and
 * the primitive whose template writes that root; and the prose lines that may still name one.
 * Read by `tests/retired-manager-classes.test.js`. A line is allowlisted by a substring unique to
 * it and by the number of retired tokens it names, so an edit that drops the history from the
 * line, or adds a token to it, drops it from this list too.
 */

/** @type {Readonly<Record<string, { root: string, primitive: string }>>} */
export const RETIRED_CLASSES = Object.freeze({
  'manager-button': {
    root: 'fabricate-button',
    primitive: 'src/ui/svelte/components/Button.svelte',
  },
  'manager-icon-button': {
    root: 'fabricate-icon-button',
    primitive: 'src/ui/svelte/components/IconButton.svelte',
  },
  'manager-search': {
    root: 'fabricate-search',
    primitive: 'src/ui/svelte/components/SearchField.svelte',
  },
  'manager-toolbar': {
    root: 'fabricate-filter-bar',
    primitive: 'src/ui/svelte/components/FilterBar.svelte',
  },
  'manager-field': { root: 'fabricate-field', primitive: 'src/ui/svelte/components/Field.svelte' },
  'manager-inspector-card': {
    root: 'fabricate-card',
    primitive: 'src/ui/svelte/components/InspectorCard.svelte',
  },
  'manager-status-toggle': {
    root: 'fabricate-toggle',
    primitive: 'src/ui/svelte/components/StatusToggle.svelte',
  },
  'manager-pagination': {
    root: 'fabricate-pagination',
    primitive: 'src/ui/svelte/components/Pagination.svelte',
  },
  'manager-action-menu': {
    root: 'fabricate-action-menu',
    primitive: 'src/ui/svelte/components/ActionMenu.svelte',
  },
});

const REPLACED = 'records what a primitive replaced, and says the class is retired';
const WORKED = 'a worked re-rooting example written before the retirement, and says so';

/** @type {ReadonlyArray<{ file: string, includes: string, tokens: number, why: string }>} */
export const HISTORICAL_LINES = Object.freeze([
  {
    file: 'openspec/specs/design-system/library.html',
    includes: 'hand-rolled <code>manager-icon-button</code> sites (a class issue 1507 retired)',
    tokens: 1,
    why: REPLACED,
  },
  {
    file: 'openspec/specs/design-system/library.html',
    includes:
      '<code>.fabricate-manager .manager-button&hellip;</code> (a class issue 1507 retired)',
    tokens: 1,
    why: 'records what issue 1502 re-rooted, and says the class is retired',
  },
  {
    file: 'openspec/specs/design-system/library.html',
    includes: '<code>class="manager-inspector-card"</code> sections (a class issue 1507 retired)',
    tokens: 1,
    why: REPLACED,
  },
  {
    file: 'openspec/specs/design-system/library.html',
    includes: '<code>class="manager-toolbar"</code> sections (a class issue 1507 retired)',
    tokens: 1,
    why: REPLACED,
  },
  {
    file: 'openspec/specs/design-system/spec.md',
    includes: 'written before issue 1507 retired `manager-button`',
    tokens: 2,
    why: WORKED,
  },
  {
    file: 'openspec/specs/design-system/spec.md',
    includes: 'written before issue 1507 retired `manager-search`',
    tokens: 2,
    why: WORKED,
  },
  {
    file: 'openspec/specs/design-system/spec.md',
    includes: 'As of issue 1507 nine primitives write no second family class',
    tokens: 9,
    why: 'the requirement sentence that records the retirement names the nine classes it retired',
  },
  {
    file: 'openspec/specs/ui-visual-style/spec.md',
    includes: '`manager-button`, a class issue 1507 retired, plus a remembered `is-*` modifier',
    tokens: 1,
    why: REPLACED,
  },
  {
    file: 'openspec/specs/ui-visual-style/spec.md',
    includes: '`manager-icon-button`, a class issue 1507 retired, plus a remembered',
    tokens: 1,
    why: REPLACED,
  },
  {
    file: 'openspec/specs/ui-visual-style/spec.md',
    includes: '`class="manager-inspector-card"`, a class issue 1507 retired, on a `<section>`',
    tokens: 1,
    why: REPLACED,
  },
  {
    file: 'openspec/specs/ui-visual-style/spec.md',
    includes: 'write `manager-field`, a class issue 1507 retired, then remember',
    tokens: 1,
    why: REPLACED,
  },
  {
    file: 'openspec/specs/ui-visual-style/spec.md',
    includes: '`class="manager-search"` labels, two classes issue 1507 retired',
    tokens: 2,
    why: REPLACED,
  },
  {
    file: 'scripts/README.md',
    includes: '`.manager-environment-row .manager-icon-button .nth(3)`',
    tokens: 1,
    why:
      'a smoke selector from the historical hit list, a sentence `tests/doc-split-sentences.test.js` ' +
      'pins verbatim',
  },
  {
    file: 'scripts/lib/designSystemPrimitives.json',
    includes: '`class=\\"manager-icon-button\\"` sites (a class issue 1507 retired)',
    tokens: 1,
    why: REPLACED,
  },
  {
    file: 'scripts/lib/designSystemPrimitives.json',
    includes: '`class=\\"manager-inspector-card\\"` sections (a class issue 1507 retired)',
    tokens: 1,
    why: REPLACED,
  },
  {
    file: 'scripts/lib/designSystemPrimitives.json',
    includes: '`class=\\"manager-search\\"` labels (a class issue 1507 retired)',
    tokens: 1,
    why: REPLACED,
  },
  {
    file: 'scripts/lib/designSystemPrimitives.json',
    includes: '`class=\\"manager-toolbar\\"` sections (a class issue 1507 retired)',
    tokens: 1,
    why: REPLACED,
  },
]);
