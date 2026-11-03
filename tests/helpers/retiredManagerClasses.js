/**
 * The ten `manager-*` root classes issues 1507 and 2543 retired and the `fab-manager-button`
 * token issue 2540 retired, each with the root that replaced it and the primitive whose template
 * writes that root; the prose lines that may still name one; and the header-action compat lines
 * that still write `fab-manager-button` until the release that removes them.
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
  'manager-modal': { root: 'fabricate-modal', primitive: 'src/ui/svelte/components/Modal.svelte' },
  'fab-manager-button': {
    root: 'fabricate-button',
    primitive: 'src/ui/svelte/components/Button.svelte',
  },
});

const REPLACED = 'records what a primitive replaced, and says the class is retired';
const RETIRED_2540 = 'records the token issue 2540 retired, and says so';
const WORKED = 'a worked re-rooting example of a compound naming a retired class';

/** @type {ReadonlyArray<{ file: string, includes: string, tokens: number, why: string }>} */
export const HISTORICAL_LINES = Object.freeze([
  {
    file: 'openspec/specs/design-system/library.html',
    includes: 'restyled <code>.manager-pagination</code> in their own',
    tokens: 1,
    why: 'records the ruled player pager re-themes, and says the class is retired',
  },
  {
    file: 'openspec/specs/design-system/spec.md',
    includes:
      'as in a compound such as `.manager-button.fab-manager-button[data-essence-sort-direction]`',
    tokens: 2,
    why: WORKED,
  },
  {
    file: 'openspec/specs/design-system/spec.md',
    includes: 'as in `.fabricate-manager [data-manager-tools-search] .manager-search`.',
    tokens: 1,
    why: WORKED,
  },
  {
    file: 'openspec/specs/design-system/spec.md',
    includes: 'Nine primitives write no second family class',
    tokens: 9,
    why: 'the requirement sentence that records the retirement names the nine classes it retired',
  },
  {
    file: 'openspec/specs/design-system/spec.md',
    includes: '`manager-modal` is retired too, a tenth token',
    tokens: 1,
    why: 'records what Modal replaced, and says the class is retired',
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
    why: 'a smoke selector from the historical hit list of dropped selectors',
  },
  {
    file: 'openspec/specs/design-system/spec.md',
    includes: '`fab-manager-button` is retired on the same one-class-for-one-class rule',
    tokens: 1,
    why: RETIRED_2540,
  },
  {
    file: 'openspec/specs/ui-visual-style/spec.md',
    includes: 'Until issue 2540 the control-height rungs were published against',
    tokens: 1,
    why: RETIRED_2540,
  },
  {
    file: 'tests/components/manager-button-reviewed-overrides.test.js',
    includes: ' * Retiring `fab-manager-button` put `ArmedDangerButton`',
    tokens: 1,
    why: RETIRED_2540,
  },
]);

/**
 * Why a compat line may still write `fab-manager-button`: the companion header-action seam
 * published it, so issue 2540 keeps it there as an inert deprecated token that no rule names.
 */
export const HEADER_ACTION_COMPAT_WHY =
  'the deprecated header-action compat token: extension header actions still carry it, no ' +
  'Fabricate rule names it, and it goes after at least one minor release announced in the notes';

/**
 * The release that removes the compat token: issue 2540 ships in the 1.14 line (`main` cuts
 * `v1.14.0-beta.*`, the last stable tag is `v1.13.0`), so 1.15.0 is one minor after it.
 * Issue 2569 tracks the removal; no test enforces the release.
 */
export const HEADER_ACTION_COMPAT_REMOVE_IN = '1.15.0';

const COMPAT = Object.freeze({
  tokens: 1,
  why: HEADER_ACTION_COMPAT_WHY,
  removeIn: HEADER_ACTION_COMPAT_REMOVE_IN,
});

/** @type {ReadonlyArray<{ file: string, includes: string, tokens: number, why: string, removeIn: string }>} */
export const COMPAT_LINES = Object.freeze([
  {
    ...COMPAT,
    file: 'src/ui/managerExtensions.js',
    includes:
      "const HEADER_ACTION_BASE_CLASSES = 'fabricate-button fab-manager-button is-size-38';",
  },
  {
    ...COMPAT,
    file: 'src/ui/managerExtensions.js',
    includes: '`fab-manager-button` is an inert compat token, deprecated',
  },
  {
    ...COMPAT,
    file: 'tests/manager-extensions.test.js',
    includes: "const HEADER_ACTION_BASE = 'fabricate-button fab-manager-button is-size-38';",
  },
  // The extension lines of the header census, which issue 2540 left unchanged.
  ...[
    String.raw`is-size-38 is-ghost\" data-manager-header-action=\"back`,
    String.raw`is-size-38\" data-manager-header-action=\"guide`,
    String.raw`is-size-38 is-primary\" data-manager-header-action=\"save`,
  ].map((tail) => ({
    ...COMPAT,
    file: 'tests/components/manager-header-mounted.js',
    includes: `fab-manager-button ${tail}`,
  })),
  ...['is-ghost', 'is-danger', 'is-primary'].map((role) => ({
    ...COMPAT,
    file: 'scripts/lib/view-lab-cases/managerWorldPartiesAndDowntime.js',
    includes: `value: 'fabricate-button fab-manager-button is-size-38 ${role}',`,
  })),
  {
    ...COMPAT,
    file: 'openspec/specs/ui-extension-points/spec.md',
    includes: 'and also `fab-manager-button`, a deprecated compat token',
  },
  {
    ...COMPAT,
    file: 'openspec/specs/ui-extension-points/spec.md',
    includes: '- **THEN** it still carries `fab-manager-button`',
  },
]);
