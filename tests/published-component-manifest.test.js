/**
 * The published component manifest (issue 2426) against each component's parsed declaration: its
 * props, rest, root and each key's kind, then its import closure of `.svelte` and `.js` files: a
 * stylesheet and template that need no ancestor above the entry's root, no read of a Foundry
 * global, no class the module sheet names under an `any` root, focusable elements marked as
 * admission rule 9 asks, and `overlays` stated exactly where an overlay action is reached, as rule
 * 10 asks (issue 2454); then the selectors that name the published `Chip`'s root class in the
 * module sheet, and the published `InspectorCard`'s, `EmptyState`'s and `Notice`'s in the sheet
 * and every component `<style>` (issue 2451); then the published `Button`'s, with every selector
 * that names a bare `button`, every selector that reads a shipped `aria` key off any element, and
 * every script under `src/` that reads one (issue 2452). The test-only probe runs beside the
 * shipped entries;
 * the adapter's bindings are the mounted suite's, and what a published control must also do is
 * `published-component-controls.test.js`'s (issue 2452).
 * Limit: the gate does not see what a component passes a callback, so an entry that states `args`
 * adds a mounted clause on each argument's type.
 * Limit: it reads scoped `<style>` declarations, not inline `style=` values.
 * Limit: rule 9 judges a `svelte:element` by its pinned tags, and does not see an attribute a
 * spread writes, so the `type` of a dynamic button is
 * `components/published-button-mounted.test.js`'s. A tag that reads a name a template block binds
 * fails closed, as does a closure file that passes a child a prop its pinned tags rest on the
 * default of; a child drawn through an alias, `svelte:component` or a re-exporting module is not
 * followed.
 * Limit: on an element a control-landing rest is spread on, a spread is followed only into an
 * object literal a top-level `const` holds, so `$derived.by`, an alias, a computed key, a call and
 * a local written to after its declaration fail closed, as an action, an `{@attach}`, a transition
 * and an `animate:` do. An attribute written through `bind:this`, which `Button.svelte` states, or
 * by an event-handler attribute on `event.currentTarget`, is not seen.
 * Limit: the twin rule reads a branch's landings wherever they sit in it, so one under a nested
 * `{#if}` with no `{:else}` counts as drawn, judges no `{#await}`'s branches, and does not see a
 * landing inside a snippet rendered in one branch; which landing a pinned entry's defaults draw is
 * its `heldBy` clause's, not the gate's.
 * Limit: the DOM-read census sees only the read forms `attributeReads` names, and the aria-key
 * clause does not see which element a read is of, nor whether an inner function holding it runs.
 * Limit: sheet reach does not see a class composed across an interpolation, a class a published
 * `data` value writes (`icon` on `Medallion`, `StatBox`, `InfoStrip`, `EmptyState` and `Notice`),
 * or an unprefixed state class.
 * Limit: sheet reach reads the module sheet, not a component's `:global()` rule.
 * Limit: a census's `manager-*` clause shares sheet reach's limits.
 * Limit: `readsGlobal` sees a free reference or a member of a free host, not a destructure of one.
 * Limit: `renderedLocals` sees `{@render local()}` and `{@render local?.()}` on the prop's own
 * local, not a snippet forwarded to a child or read through an alias; a forwarded `text` or `slot`
 * key fails closed and a forwarded `data` key is not seen. It matches by name, so it does not see
 * a `{@const}` or an `{#await … then}` binding that shadows the local, nor a local tested in an
 * `{#if}` other than its own guard. Nor does it see a foreign `{#if}` around a render tag, `?.()`
 * or guarded, so a slot another prop hides is not refused.
 * Limit: the chip census reads the module sheet, not a component's `:global()` rule, and each
 * census takes on trust that no extension target sits under one of its pinned ancestor classes.
 * Limit: a companion that writes one of the card's two pinned `data-*` attributes through `rest`
 * takes Fabricate's private rule.
 * Limit: the button censuses read no universal or attribute-only compound, so a `data-*` hook on
 * one is not among the names M13 reserves: the spec's rule that a companion passes only names that
 * carry its own module id is what keeps a rest key off it. Their pinned ancestors
 * `fabricate-tabs`, `fabricate-pagination` and `fabricate-filter-bar` reopen when one is published
 * with a content slot, as `FilterBar` already renders `children`.
 * Limit: `components/re-rooted-controls-host-independence.test.js` measures the neutral button
 * alone, so the reaching set's first clause is what holds each visual role under either window.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { stylesheetSources } from '../scripts/lib/stylesheetSource.js';
import { PUBLISHED_COMPONENT_MANIFEST } from '../src/ui/publishedComponentManifest.js';
import { RESERVED_ON_A_CONTROL } from '../src/ui/publishedComponentProps.js';
import { valueEntryFault } from '../src/ui/publishedComponentValues.js';

import { PROBE_ENTRY, PROBE_OVERLAY_ENTRY } from './fixtures/published-components/probeEntry.js';
import { readDeclaration, templateOf } from './helpers/apiConvention.js';
import { parseModule, walkNodes } from './helpers/moduleAst.js';
import { componentAstOf, sourceAstEntriesUnder } from './helpers/parsedSource.js';
import {
  BARE_BUTTON_ANCESTORS,
  BARE_BUTTON_RULES,
  MANAGER_BUTTON_FLOOR,
  attributeReads,
  bareButtonSelectors,
  cannotMatchPublished,
  classNames,
  classesOf,
  compoundsOf,
  dataHooksOf,
  entryNamed,
  ownFilesOf,
  placementFaults,
  publishedManagerClasses,
  publishedTokens,
  ringFaults,
  shippedCensus,
  spelledStrings,
  staleAncestors,
  syntheticCensus,
  TOGGLE,
} from './helpers/publishedComponentCensus.js';
import {
  BRANCH_TWIN,
  DYNAMIC_ELEMENTS,
  SHIPPED,
  ariaFaults,
  attributeSelectors,
  attributesReadInClauses,
  branchTwinFaults,
  byName,
  controlRestFaults,
  declarationsOf,
  dynamicElementFaults,
  dynamicElements,
  everyStylesheet,
  focusableElements,
  followedProps,
  importClosure,
  isComponent,
  moduleRing,
  propLocals,
  publishedLocals,
  restElements,
  restReads,
  selectorsNaming,
  selectorsOnAttribute,
  spreadKeys,
  syntheticReader,
  tagKeys,
  unheldClauses,
} from './helpers/publishedComponentGate.js';
import { readsGlobal } from './helpers/svelteStructureContract.js';

const APP_ROOTS = new Set(['fabricate', 'fabricate-app', 'fabricate-manager']);
const APP_TOKENS = ['var(--fab-manager-'];
/** What a `fabricate` entry is still refused: the Manager root's own class and tokens. */
const MANAGER_ROOTS = new Set(['fabricate-manager']);
const MANAGER_RULES = new Set(['app-root selector', ...APP_TOKENS]);
// A `--font-primary` read whose fallback ends in a literal resolves with no Foundry variable.
const LITERAL_GUARDED_FACE = /var\(\s*--font-primary\s*,\s*[^\s(),][^()]*\)/g;
const FOUNDRY_GLOBALS = [
  'game',
  'foundry',
  'Hooks',
  'CONFIG',
  'CONST',
  'ui',
  'canvas',
  'fromUuid',
  'fromUuidSync',
  'getDocumentClass',
];

/**
 * Every render tag beneath an `{#each}`, a `{#key}`, a `{#snippet}` or a child component's content,
 * where one tag can hold several branches.
 */
const REPEATING_BLOCKS = new Set([
  'EachBlock',
  'KeyBlock',
  'SnippetBlock',
  'Component',
  'SvelteComponent',
  'SvelteSelf',
]);
function repeatedRenderTags(ast) {
  const repeated = new Set();
  for (const block of walkNodes(ast.fragment)) {
    if (!REPEATING_BLOCKS.has(block.type)) continue;
    for (const node of walkNodes(block)) if (node.type === 'RenderTag') repeated.add(node);
  }
  return repeated;
}

const renderCall = (tag) =>
  tag.expression.type === 'ChainExpression' ? tag.expression.expression : tag.expression;

/**
 * Every render tag in the consequent of an `{#if}` whose whole test is the local the tag calls.
 * An `{:else if}` is no guard: its consequent is drawn only while every earlier test is false.
 */
function guardedRenderTags(ast) {
  const guarded = new Set();
  for (const block of walkNodes(ast.fragment)) {
    if (block.type !== 'IfBlock' || block.elseif || block.test.type !== 'Identifier') continue;
    for (const node of walkNodes(block.consequent)) {
      if (node.type !== 'RenderTag') continue;
      const { callee } = renderCall(node);
      if (callee?.type === 'Identifier' && callee.name === block.test.name) guarded.add(node);
    }
  }
  return guarded;
}

/**
 * Every local a `{@render}` tag calls, with each call's argument count, whether it is `?.()`,
 * whether its own `{#if}` guards it, and whether a repeating block holds it.
 */
function renderedLocals(ast) {
  const called = new Map();
  const repeated = repeatedRenderTags(ast);
  const guarded = guardedRenderTags(ast);
  for (const node of walkNodes(ast.fragment)) {
    if (node.type !== 'RenderTag') continue;
    const call = renderCall(node);
    if (call.callee?.type !== 'Identifier') continue;
    const calls = called.get(call.callee.name) ?? [];
    calls.push({
      args: call.arguments.length,
      optional: call.optional === true,
      guarded: guarded.has(node),
      repeated: repeated.has(node),
    });
    called.set(call.callee.name, calls);
  }
  return called;
}

const SHIPPED_KINDS = new Set(['data', 'text', 'slot', 'callback', 'aria', 'value']);
const VALUE_KEY = /^[a-z][A-Za-z0-9]*$/;
const VALUE_TYPES = new Set(['string', 'number', 'boolean']);
const SLOT_ELEMENTS = new Set(['div', 'span']);

/** Whether a render call draws nothing for an absent local: `?.()`, or under the local's own guard. */
const toleratesAbsence = (call) => call.optional || call.guarded;

/**
 * What a `text` key's render calls break: drawn at least once, bare, and `?.()` or guarded unless
 * required.
 */
function textRenderFaults(key, spec, calls) {
  const faults = [];
  if (calls.length === 0) faults.push(`${key} is a text key no render tag draws`);
  if (calls.some((call) => call.args > 0)) {
    faults.push(`${key} is a text key rendered with an argument`);
  }
  if (spec.required !== true && !calls.every(toleratesAbsence)) {
    faults.push(`${key} is an optional text key rendered without ?. or an {#if} guard`);
  }
  return faults;
}

/**
 * What a `slot` key's spec and render calls break: `{ kind, element? }` with a `<div>` or
 * `<span>` element, drawn by exactly one bare render tag, `?.()` or guarded, that no `{#each}`,
 * `{#key}`, `{#snippet}` or component holds, so the one slot element is drawn once and never taken
 * in turn.
 */
function slotFaults(key, spec, calls) {
  const faults = [];
  if (spec.required !== undefined) faults.push(`${key} is a slot key that states required`);
  if (spec.element !== undefined && !SLOT_ELEMENTS.has(spec.element)) {
    faults.push(`${key} is a slot key whose element is ${spec.element}`);
  }
  if (calls.length === 0) faults.push(`${key} is a slot key no render tag draws`);
  if (calls.length > 1) faults.push(`${key} is a slot key more than one render tag draws`);
  if (calls.some((call) => call.args > 0)) {
    faults.push(`${key} is a slot key rendered with an argument`);
  }
  if (!calls.every(toleratesAbsence)) {
    faults.push(`${key} is a slot key rendered without ?. or an {#if} guard`);
  }
  if (calls.some((call) => call.repeated)) {
    faults.push(`${key} is a slot key rendered inside {#each}, {#key}, {#snippet} or a component`);
  }
  return faults;
}

/** What a key's `args` breaks: stated on a `callback` key only, as a non-negative integer. */
function argsFaults(key, spec) {
  if (spec.args === undefined) return [];
  if (spec.kind !== 'callback') return [`${key} states args, which only a callback key takes`];
  const counts = Number.isInteger(spec.args) && spec.args >= 0;
  return counts ? [] : [`${key} states args that is not a non-negative integer`];
}

/**
 * What a key's `requiredWhen` breaks: the name of another `data` key of the entry that is neither
 * `required` nor `requiredWhen` itself, on a key that is no `slot`, `aria` or `value` key and states no
 * `required` (issue 2452).
 */
function requiredWhenFaults(key, spec, entry) {
  const name = spec.requiredWhen;
  if (name === undefined) return [];
  const guard = typeof name === 'string' && Object.hasOwn(entry.props, name) && entry.props[name];
  const named = `${key} is requiredWhen ${String(name)}`;
  const faults = [];
  if (!guard || name === key) faults.push(`${named}, which is no other key of the entry`);
  else if (guard.kind !== 'data') faults.push(`${named}, which is no data key`);
  else if (guard.required === true || guard.requiredWhen !== undefined) {
    faults.push(`${named}, which is itself required or requiredWhen`);
  }
  if (['slot', 'aria', 'value'].includes(spec.kind)) {
    faults.push(`${key} states requiredWhen, which no ${spec.kind} key takes`);
  }
  if (spec.required !== undefined) faults.push(`${key} states both required and requiredWhen`);
  return faults;
}

/**
 * What a `value` key's spec breaks: a name that is not camel case from a lower-case letter, an
 * `initial` that is not a string, number, boolean or `null`, a stated `required`, and a
 * synthesised `on<Key>Change` the entry lists or the component declares.
 */
function valueFaults(key, spec, entry, declared) {
  if (spec.kind !== 'value') return [];
  const change = `on${key[0].toUpperCase()}${key.slice(1)}Change`;
  const primitive = spec.initial === null || VALUE_TYPES.has(typeof spec.initial);
  return [
    ...(VALUE_KEY.test(key) ? [] : [`${key} is a value key whose name is not camel case`]),
    ...(primitive ? [] : [`${key} has an initial that is not a string, number, boolean or null`]),
    ...(spec.required === undefined ? [] : [`${key} is a value key that states required`]),
    ...(Object.hasOwn(entry.props, change)
      ? [`${key} synthesises ${change}, which the entry lists`]
      : []),
    ...(declared.has(change) ? [`${key} synthesises ${change}, which the component declares`] : []),
  ];
}

/** What a key's `element` breaks: stated on a `slot` key only. */
const elementFaults = (key, spec) =>
  spec.kind !== 'slot' && spec.element !== undefined
    ? [`${key} states element, which only a slot key takes`]
    : [];

/**
 * Each rule an entry's published keys break against the component's parsed declaration, as
 * `<key> <rule>`. A `value` key is `$bindable`, and no other published key is. An unpublished prop
 * is not judged: it may be `$bindable` or rendered either way.
 * An `aria` key is judged by `ariaFaults`, since the component declares no prop for it.
 * Where a `callback` key is called from is `published-component-controls.test.js`'s.
 */
function declarationFaults(entry, ast) {
  const declared = new Map(propLocals(ast).map((prop) => [prop.key, prop]));
  const rendered = renderedLocals(ast);
  return Object.entries(entry.props).flatMap(([key, spec]) => {
    const prop = declared.get(key);
    const unshipped = SHIPPED_KINDS.has(spec.kind)
      ? []
      : [`${key} has the unshipped kind ${spec.kind}`];
    if (spec.kind === 'aria') {
      const own = ariaFaults(key, spec, entry, Boolean(prop));
      return [
        ...unshipped,
        ...own,
        ...elementFaults(key, spec),
        ...argsFaults(key, spec),
        ...requiredWhenFaults(key, spec, entry),
      ];
    }
    const faults = key.startsWith('aria-')
      ? [`${key} is spelled as an ARIA attribute and is not an aria key`]
      : [];
    if (!prop) return [...faults, `${key} is not a declared prop`];
    faults.push(...unshipped);
    if (spec.required !== undefined && typeof spec.required !== 'boolean') {
      faults.push(`${key} is required by something other than a boolean`);
    }
    if (prop.bindable && spec.kind !== 'value') faults.push(`${key} is $bindable`);
    if (!prop.bindable && spec.kind === 'value') {
      faults.push(`${key} is a value key that is not $bindable`);
    }
    faults.push(...valueFaults(key, spec, entry, declared));
    const calls = rendered.get(prop.local) ?? [];
    if (spec.kind === 'text') faults.push(...textRenderFaults(key, spec, calls));
    if (spec.kind === 'slot') faults.push(...slotFaults(key, spec, calls));
    faults.push(...elementFaults(key, spec));
    if ((spec.kind === 'data' || spec.kind === 'value') && calls.length > 0) {
      faults.push(`${key} is a ${spec.kind} key rendered as a snippet`);
    }
    if (spec.kind === 'callback' && calls.length > 0) {
      faults.push(`${key} is a callback key a render tag calls`);
    }
    return [...faults, ...argsFaults(key, spec), ...requiredWhenFaults(key, spec, entry)];
  });
}

/** An entry's `aria` keys; an entry a synthetic row gives no props has none. */
const ariaKeysOf = (entry) =>
  Object.keys(entry.props ?? {}).filter((key) => entry.props[key].kind === 'aria');

/** Every shipped `aria` key, as `<entry>.<key>`, in manifest order. */
const shippedAriaKeys = () =>
  PUBLISHED_COMPONENT_MANIFEST.flatMap((entry) =>
    ariaKeysOf(entry).map((key) => `${entry.name}.${key}`)
  );

/** The mounted suite of each entry that publishes an `aria` key, which reads each key off the control. */
const ARIA_KEY_SUITES = Object.freeze({
  Button: 'tests/components/published-button-mounted.test.js',
  StatusToggle: 'tests/components/published-toggle-mounted.test.js',
});

/**
 * Every DOM read under `src/` of a shipped `aria` key or of `aria-pressed`, which a published
 * `data` key drives, beside why no published control is the element it reads.
 */
const JS_ARIA_READERS = Object.freeze({
  'src/ui/svelte/apps/journal/RunAwardChoice.svelte: querySelector([data-award-choice-id] button[aria-pressed]:not([disabled]))':
    'under a Fabricate hook',
  'src/ui/svelte/apps/manager/validationAnnouncement.js: getAttribute(aria-labelledby)':
    "on Fabricate's own validation targets",
  'src/ui/svelte/components/Modal.svelte: closest([aria-expanded="true"])':
    'no extension target sits in a Fabricate modal',
});

/** The classes `tone` and `density` can write beside the root class, private values included. */
const PUBLISHED_CHIP_CLASSES = new Set([
  'is-positive',
  'is-warning',
  'is-danger',
  'is-info',
  'is-neutral',
  'is-accent',
  'is-active',
  'is-disabled',
  'is-negative',
  'is-muted',
  'is-tag',
  'is-secondary',
  'is-subtle',
  'is-list',
  'is-row',
  'is-action',
  'is-tag-run',
  'is-inspector',
  'is-header',
]);
/** The manager layout classes a sheet rule reaches a chip under; no extension target sits in one. */
const CHIP_LAYOUT_ANCESTORS = new Set([
  'manager-tools-authority-heading',
  'manager-recipe-steps-requirements',
  'manager-recipe-name-row',
  'manager-vocabulary-row',
  'manager-component-tag-run',
]);

/**
 * What a census needs of a published root class: the classes its published keys can write beside
 * it, the ancestor classes no extension target sits under, and whether it draws the companion's
 * own children. The ancestor sets are per root and never merged.
 */
const CHIP = Object.freeze({
  root: 'manager-chip',
  writable: PUBLISHED_CHIP_CLASSES,
  ancestors: CHIP_LAYOUT_ANCESTORS,
  drawsChildren: false,
});
const CARD = Object.freeze({
  root: 'fabricate-card',
  writable: new Set(),
  ancestors: new Set(['manager-checks-rail', 'manager-inspector']),
  drawsChildren: true,
});
const EMPTY = Object.freeze({
  root: 'manager-empty',
  writable: new Set(['is-filtered']),
  ancestors: new Set([
    'manager-task-required-tools-scroll',
    'journal-detail-pane',
    'manager-scoped-list-inspector-scroll',
  ]),
  drawsChildren: true,
});
/** `is-accent` is writable because a private `tone` value still writes it. */
const NOTICE = Object.freeze({
  root: 'fab-notice',
  writable: new Set(['is-danger', 'is-warning', 'is-info', 'is-success', 'is-accent']),
  ancestors: new Set(),
  drawsChildren: true,
});

/**
 * The published `Button`: the classes `role` and `fullWidth` write beside its root, which
 * `Button.svelte` is held to, and the classes under which a sheet rule redraws a button, no
 * extension target sitting in one. `disables` says a published key writes `disabled`, so
 * `:disabled` keeps no selector off the button.
 */
const BUTTON = Object.freeze({
  root: 'fabricate-button',
  writable: new Set([
    'is-primary',
    'is-ghost',
    'is-danger',
    'is-dashed',
    'is-warning-action',
    'is-full-width',
  ]),
  ancestors: new Set([
    'manager-tool-inspector-foot',
    'manager-knowledge-reset-actions',
    'manager-knowledge-row-actions',
    'manager-component-entry-row-actions',
    'manager-component-entry-danger-body',
    'manager-drop-inspector-stack',
    'fab-bulk-edit-dock',
    'manager-tool-edit-actions',
    'manager-environment-drop-adjustment-row',
    'manager-checks-tier-add',
    'manager-salvage-stage-add',
    'fabricate-filter-bar',
    'manager-vocabulary-confirm',
    'manager-vocabulary-form-fields',
    'manager-checks-trigger-presets',
    'manager-task-drop-controls',
    'manager-drop-editor-actions',
    'manager-setup-links',
    'fab-ic-actions',
    'fab-ic-identity-head',
    'fab-bulk-delete-card',
    'fab-im-toolbar',
    'fab-im-promote-actions',
    'manager-import-mapping-row',
    'manager-scoped-copy-head',
    'manager-scoped-shared-head',
    'manager-scoped-roster-system',
  ]),
  drawsChildren: false,
  disables: true,
});

/** The classes `Button.svelte` spells that no published key writes. */
const UNPUBLISHED_BUTTON_CLASSES = Object.freeze(['is-size-28', 'is-size-38']);

/** Every selector in one sheet that names the chip root, as `{ selector, safe }`. */
function chipSelectors(file, css) {
  const { source, ast } = templateOf(file, `<style>${css}</style>`);
  return selectorsNaming(ast.css, CHIP.root).map((complex) => ({
    selector: `${file}: ${source.slice(complex.start, complex.end)}`,
    safe: cannotMatchPublished(complex, CHIP),
  }));
}

const unsafeChipSelectors = (file, css) =>
  chipSelectors(file, css)
    .filter(({ safe }) => !safe)
    .map(({ selector }) => selector);

/** The 21 sheet rules that draw a published button, each one compound with nothing above it. */
const BUTTON_FAMILY_RULES = Object.freeze([
  'styles/fabricate-manager-shell.css: .fabricate-button.fabricate-button.fabricate-button',
  'styles/fabricate-manager-shell.css: .fabricate-button.fabricate-button.fabricate-button.is-primary',
  'styles/fabricate-manager-shell.css: .fabricate-button.fabricate-button.fabricate-button.is-ghost:not(:disabled)',
  "styles/fabricate-manager-shell.css: .fabricate-button.fabricate-button.fabricate-button.is-ghost:not(:disabled, [aria-disabled='true']):hover",
  'styles/fabricate-manager-shell.css: .fabricate-button.fabricate-button.fabricate-button.is-dashed',
  'styles/fabricate-manager-shell.css: .fabricate-button.fabricate-button.fabricate-button.is-dashed:not(:disabled)',
  "styles/fabricate-manager-shell.css: .fabricate-button.fabricate-button.fabricate-button.is-dashed:not(:disabled, [aria-disabled='true']):hover",
  'styles/fabricate-manager-shell.css: .fabricate-button.fabricate-button.fabricate-button.is-full-width',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-button',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-button.fabricate-button',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-button.fabricate-button:disabled',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-button.fabricate-button',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-button:focus',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-button:focus-visible',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-button.fabricate-button.is-primary:not(:disabled)',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-button.fabricate-button.is-danger:not(:disabled)',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-button.fabricate-button.is-warning-action:not(:disabled)',
  "styles/fabricate-manager-rail-gathering.css: .fabricate-button.fabricate-button:not(:disabled, [aria-disabled='true']):hover",
  "styles/fabricate-manager-rail-gathering.css: .fabricate-button.fabricate-button.is-primary:not(:disabled, [aria-disabled='true']):hover",
  "styles/fabricate-manager-rail-gathering.css: .fabricate-button.fabricate-button.is-danger:not(:disabled, [aria-disabled='true']):hover",
  "styles/fabricate-manager-rail-gathering.css: .fabricate-button.fabricate-button.is-warning-action:not(:disabled, [aria-disabled='true']):hover",
]);
/**
 * The three rules no published button can match, which fail closed: an anchor's, a glyph child's,
 * and the busy face, whose `aria-busy` the seam refuses (issue 2540).
 */
const BUTTON_UNMATCHED_RULES = Object.freeze([
  'styles/fabricate-manager-rail-gathering.css: .fabricate-button.fabricate-button:is(a)',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-button.fabricate-button i',
  "styles/fabricate-manager-rail-gathering.css: .fabricate-button.fabricate-button[aria-busy='true']:not(:disabled)",
]);
/** The sheet rule a button matches only through a `data-*` hook Fabricate writes. */
const BUTTON_DATA_HOOK_RULES = Object.freeze([
  'styles/fabricate-manager-library.css: .fabricate-button.fabricate-button.fabricate-button[data-essence-sort-direction]',
]);

/**
 * Every selector that reads a shipped `aria` key, or `aria-pressed`, which a published `data` key
 * drives, as written, beside the class that keeps it off a published control: a pinned ancestor
 * above it, which no extension target sits under, or a class the element holding the attribute
 * needs, which no published closure spells.
 */
const ARIA_KEY_SELECTORS = Object.freeze([
  [
    "src/ui/svelte/apps/interactables/InteractablesManagerRoot.svelte: .fab-im-toolbar :global(.fabricate-button[aria-expanded='true'])",
    'fab-im-toolbar',
  ],
  [
    "styles/fabricate-list-primitives.css: .fabricate-list-row:has(> .fabricate-list-row-open[aria-pressed='true'])",
    'fabricate-list-row-open',
  ],
  [
    "styles/fabricate-list-primitives.css: .fabricate-list-row.is-danger:has(> .fabricate-list-row-open[aria-pressed='true'])",
    'fabricate-list-row-open',
  ],
  [
    "styles/fabricate-list-primitives.css: .fabricate-list-row:not(.is-danger):has(> .fabricate-list-row-open[aria-pressed='true'])",
    'fabricate-list-row-open',
  ],
  [
    "styles/fabricate-list-primitives.css: .fabricate-list-row:not(.is-danger):has(> .fabricate-list-row-open:enabled:hover:not([aria-pressed='true']))",
    'fabricate-list-row-open',
  ],
  [
    "src/ui/svelte/apps/InteractableConfigRoot.svelte: .fab-ic-actions :global(.fabricate-button[aria-pressed='true'])",
    'fab-ic-actions',
  ],
  [
    "src/ui/svelte/apps/InteractableConfigRoot.svelte: .fab-ic-actions :global(.fabricate-button[aria-pressed='false'] .fab-ic-state-glyph)",
    'fab-ic-actions',
  ],
  [
    "src/ui/svelte/apps/manager/BulkStagingInset.svelte: :global(.fab-bulk-inset button.fab-bulk-inset-row:not([aria-pressed='true']):enabled:hover)",
    'fab-bulk-inset-row',
  ],
]);

/**
 * Whether `kept` keeps one `attributeSelectors` reading off a published control: as a `pinned`
 * ancestor above the attribute, or as a class its own element requires that `spelled` lacks.
 */
const keptOff = ({ above, bearers }, kept, pinned, spelled) =>
  (pinned.has(kept) && above.includes(kept)) || (bearers.includes(kept) && !spelled.has(kept));

/** The card's own two family rules, which draw all of it under a Fabricate window. */
const CARD_FAMILY_RULES = Object.freeze([
  'styles/fabricate-manager-rail-gathering.css: .fabricate-card.fabricate-card',
  'styles/fabricate-manager-rail-gathering.css: .fabricate-card.fabricate-card',
]);
/** The component rules a card matches only through a `data-*` hook Fabricate writes. */
const CARD_DATA_HOOK_RULES = Object.freeze([
  'src/ui/svelte/apps/manager/checks/CraftingModifierCatalogueCard.svelte: .fabricate-card[data-crafting-modifier-catalogue]',
  'src/ui/svelte/apps/manager/checks/CraftingModifierCatalogueCard.svelte: .fabricate-card[data-crafting-modifier-policy-card]',
]);
/**
 * The one rule that names the notice root, inside `:has()`, as written: it pads the element a
 * recipe notice sits in and not the notice, which the census cannot prove.
 */
const NOTICE_HAS_RULES = Object.freeze([
  'styles/fabricate-manager-library.css: .fabricate-manager .manager-recipe-notice:has(.fab-notice)',
]);

/**
 * What a component's own stylesheet and template borrow from above the entry's `root`, by rule:
 * every rule at `any`, the Manager root's selector and tokens at `fabricate`, none at `manager`.
 */
function ancestorDependencies(ast, root = 'any') {
  if (root === 'manager') return [];
  const windowed = root === 'fabricate';
  const refused = windowed ? MANAGER_ROOTS : APP_ROOTS;
  const found = new Set();
  for (const node of walkNodes(ast.css)) {
    if (node.type === 'ClassSelector' && refused.has(node.name)) found.add('app-root selector');
    if (node.type === 'Atrule' && node.name === 'container') found.add('@container');
    if (node.type !== 'Declaration') continue;
    for (const token of APP_TOKENS) if (node.value.includes(token)) found.add(token);
    if (node.value.replaceAll(LITERAL_GUARDED_FACE, '').includes('--font-primary')) {
      found.add('unguarded var(--font-primary)');
    }
  }
  for (const node of walkNodes(ast.fragment)) {
    if (classNames(node).includes('visually-hidden')) found.add('.visually-hidden');
  }
  return [...found].filter((rule) => !windowed || MANAGER_RULES.has(rule)).sort(byName);
}

/** Each Foundry global one file reads, as `reads <name>`; a local binding of the name is no read. */
function foundryReads(file, reader) {
  const scope = isComponent(file) ? reader.componentScope(file) : reader.module(file);
  return FOUNDRY_GLOBALS.filter((name) => readsGlobal(scope, name)).map((name) => `reads ${name}`);
}

/** Each ancestor dependency and Foundry read in an entry's closure, as `<file>: <rule>`. */
function closureDependencies(path, reader = SHIPPED, root = 'any') {
  return [...importClosure(path, reader)].flatMap((file) =>
    [
      ...(isComponent(file) ? ancestorDependencies(reader.component(file), root) : []),
      ...foundryReads(file, reader),
    ].map((rule) => `${file}: ${rule}`)
  );
}

const SHEET_PREFIXES = ['fab-', 'fabricate-', 'manager-'];

/** Every class name a module sheet selector names. */
function sheetClassNames() {
  const names = new Set();
  for (const { file, text } of stylesheetSources().parts) {
    const { ast } = templateOf(file, `<style>${text}</style>`);
    for (const node of walkNodes(ast.css)) if (node.type === 'ClassSelector') names.add(node.name);
  }
  return names;
}

/**
 * Sheet reach: each `fab-`, `fabricate-` or `manager-` class token an `any` entry's closure
 * spells that a selector in `sheet` names, as `<file>: <token>`. Another root is not judged.
 */
function sheetReach({ path, root }, sheet, reader = SHIPPED) {
  if (root !== 'any') return [];
  return [...importClosure(path, reader)].flatMap((file) => {
    const tokens = spelledStrings(file, reader).flatMap((text) => text.split(/\s+/));
    return [...new Set(tokens)]
      .filter((token) => SHEET_PREFIXES.some((prefix) => token.startsWith(prefix)))
      .filter((token) => sheet.has(token))
      .sort(byName)
      .map((token) => `${file}: ${token}`);
  });
}

/** The sheet-named tokens the shipped `any` closures spell, each kept off a published mount. */
const SHEET_REACH_PINS = Object.freeze([
  // On the remove control, which no published key draws.
  'src/ui/svelte/components/Chip.svelte: fab-hit-area',
  // The chip's root class, which the 16-selector census below holds.
  'src/ui/svelte/components/Chip.svelte: manager-chip',
  // The panel's root class, which its 3-selector census below holds.
  'src/ui/svelte/components/EmptyState.svelte: manager-empty',
  // The notice's root class, which its 1-selector census below holds.
  'src/ui/svelte/components/Notice.svelte: fab-notice',
]);

/** Rule 9 over an entry's whole closure: every element judged, and every fault. */
function closureFocusables(path, reader = SHIPPED, dynamic = undefined) {
  const scans = [...importClosure(path, reader)]
    .filter(isComponent)
    .map((file) => focusableElements(file, reader.component(file), dynamic));
  return {
    judged: scans.flatMap((scan) => scan.judged),
    faults: scans.flatMap((scan) => scan.faults),
  };
}

const NO_REST_ELEMENT = 'rest lands on no element the gate can see';
const MIXED_REST = 'rest lands on a control and on an element that is none';
const UNSTATED_REST = "rest lands on a control and restOn is not 'control'";
const OVERSTATED_REST = 'restOn is stated and rest lands on no control';
const UNFOLLOWED_REST = 'rest is read where the gate cannot follow';

/**
 * The entries whose rest lands on more than one element, by path, each drawn while every prop of
 * `defaults`, which the entry does not publish, keeps its default: the tag of the landing drawn
 * then, the tags of those it keeps undrawn, and in `heldBy` the mounted clause that holds both.
 */
const REST_LANDINGS = Object.freeze({
  'src/ui/svelte/components/SearchField.svelte': {
    drawn: 'label',
    undrawn: ['Field'],
    defaults: ['label'],
    heldBy:
      'tests/components/published-search-mounted.test.js: the default draws the label root alone',
  },
  'src/ui/svelte/components/StatusToggle.svelte': {
    drawn: 'button',
    undrawn: ['input', 'span'],
    defaults: ['as'],
    heldBy:
      'tests/components/published-toggle-mounted.test.js: the default draws the button host alone',
  },
});

/**
 * What a landing pin breaks: rest landing on other tags than it names, a default the entry
 * publishes or the component does not declare, a landing whose guards the gate cannot follow or
 * that follow any prop but `defaults`, and no `heldBy`.
 */
function landingPinFaults(entry, ast, landed, { drawn, undrawn, defaults, heldBy }) {
  const published = publishedLocals(entry, ast);
  const declared = new Set(propLocals(ast).map(({ key }) => key));
  const pinned = [...defaults].sort(byName);
  const tags = landed.map(({ node }) => node.name).sort(byName);
  const named = [drawn, ...undrawn].sort(byName);
  return [
    ...(tags.join(',') === named.join(',')
      ? []
      : [`rest is pinned to land on [${named}], and lands on [${tags}]`]),
    ...pinned
      .filter((key) => Object.hasOwn(entry.props, key))
      .map((key) => `rest is pinned to the default of ${key}, which ${entry.name} publishes`),
    ...pinned
      .filter((key) => !declared.has(key))
      .map(
        (key) => `rest is pinned to the default of ${key}, which the component does not declare`
      ),
    ...landed.flatMap(({ node, guards }) => {
      const { props, faults } = followedProps(ast, guards, published);
      return [
        ...faults.map((fault) => `rest on <${node.name}> sits under a guard that ${fault}`),
        ...(props.join(',') === pinned.join(',')
          ? []
          : [
              `rest on <${node.name}> is pinned to the defaults [${pinned}] and its guards follow [${props}]`,
            ]),
      ];
    }),
    ...(heldBy ? [] : ['rest is pinned to defaults and names no mounted clause in heldBy']),
  ];
}

/**
 * What an entry's `restOn` breaks against where its component spreads rest: `'control'` exactly
 * when every element the rest local is spread on is one rule 9 judges, absent exactly when none
 * is, and a rest the gate sees on no element, reads anywhere but in those spreads, or hands to a
 * child component its pin does not name undrawn, fails closed.
 * An entry `landings` pins is judged by its drawn landing alone, and every entry by the twin rule.
 * Where rest lands on a control, `controlRestFaults` judges what the component writes beside it,
 * the entry's `aria` keys among it.
 */
function restOnFaults(entry, ast, dynamic = undefined, landings = REST_LANDINGS) {
  if (!entry.rest) return entry.restOn === undefined ? [] : [OVERSTATED_REST];
  const every = restElements(ast);
  if (every.every(({ node }) => node.type === 'Component')) return [NO_REST_ELEMENT];
  const pin = landings[entry.path];
  const pinned = pin ? landingPinFaults(entry, ast, every, pin) : [];
  const landed = pin ? every.filter(({ node }) => node.name === pin.drawn) : every;
  const shape = [...pinned, ...branchTwinFaults(ast)];
  const handed = every.filter(
    ({ node }) => node.type === 'Component' && !pin?.undrawn.includes(node.name)
  );
  const judged = focusableElements(entry.path, ast, dynamic).elements.map(({ node }) => node);
  const controls = landed.filter(({ node }) => judged.includes(node));
  if (controls.length > 0 && controls.length < landed.length) return [...shape, MIXED_REST];
  const lands = controls.length > 0;
  const stated = entry.restOn === 'control';
  return [
    ...shape,
    ...(restReads(ast) > every.length || handed.length > 0 ? [UNFOLLOWED_REST] : []),
    ...(lands && !stated ? [UNSTATED_REST] : []),
    ...(!lands && entry.restOn !== undefined ? [OVERSTATED_REST] : []),
    ...controls.flatMap((control) =>
      controlRestFaults(control, RESERVED_ON_A_CONTROL, ariaKeysOf(entry))
    ),
  ];
}

/**
 * Every component file of `entries`' closures, once, as `{ file, ast, published }`: `published`
 * is the keys of the entry whose own file it is, by local name, and empty for any other file.
 */
function closureComponents(entries, reader = SHIPPED) {
  const files = new Set(entries.flatMap((entry) => [...importClosure(entry.path, reader)]));
  const components = [...files].filter((file) => isComponent(file));
  return components.map((file) => {
    const ast = reader.component(file);
    const entry = entries.find(({ path }) => path === file);
    return { file, ast, published: entry ? publishedLocals(entry, ast) : new Map() };
  });
}

describe('the manifest', () => {
  it('pins the names a control-landing rest reserves, which are fixed for an entry’s version', () => {
    assert.equal(
      String(RESERVED_ON_A_CONTROL),
      '/^data-(?:keyboard-focus|action|cursor|validation-focused|essence-sort-direction|tooltip(?:-[a-z0-9-]*)?)$/',
      'reserving another name narrows every restOn entry and bumps its version'
    );
  });

  it('holds a primitive initial and no colliding change key on every value key, the probe’s among them', () => {
    for (const entry of [...PUBLISHED_COMPONENT_MANIFEST, PROBE_ENTRY]) {
      assert.equal(valueEntryFault(entry), null, entry.name);
    }
  });

  it('is a frozen list of frozen entries with unique names', () => {
    assert.ok(Object.isFrozen(PUBLISHED_COMPONENT_MANIFEST));
    const names = PUBLISHED_COMPONENT_MANIFEST.map((entry) => entry.name);
    assert.equal(new Set(names).size, names.length);
    for (const entry of PUBLISHED_COMPONENT_MANIFEST) {
      assert.ok(Object.isFrozen(entry) && Object.isFrozen(entry.props), entry.name);
    }
  });
});

/** The overlay actions admission rule 10 names: a closure that reaches one opens an overlay. */
const OVERLAY_ACTIONS = Object.freeze([
  'src/ui/svelte/actions/anchoredPopover.js',
  'src/ui/svelte/actions/dismissOnOutsideClick.js',
  'src/ui/svelte/actions/portal.js',
  'src/ui/svelte/actions/typeaheadPanel.js',
]);

/** Rule 10 (issue 2454): `overlays: true` exactly when the closure reaches an overlay action. */
function overlayFaults(entry, reader = SHIPPED) {
  const reached = [...importClosure(entry.path, reader)]
    .filter((file) => OVERLAY_ACTIONS.includes(file))
    .sort(byName);
  if (reached.length === 0) {
    return entry.overlays === true ? ['is overlays: true and reaches no overlay action'] : [];
  }
  if (entry.overlays === true) return [];
  return reached.map((file) => `reaches ${file} and is not overlays: true`);
}

describe('admission rule 10: an entry that opens an overlay states overlays', () => {
  it('names only overlay actions the plumbing ships', () => {
    for (const file of OVERLAY_ACTIONS) assert.ok(SHIPPED.module(file).ast, file);
  });

  it('holds every shipped entry and both probes', () => {
    for (const entry of [...PUBLISHED_COMPONENT_MANIFEST, PROBE_ENTRY, PROBE_OVERLAY_ENTRY]) {
      assert.deepEqual(overlayFaults(entry), [], entry.name);
    }
  });

  it('refuses the overlay probe without overlays, by each action its closure reaches', () => {
    const { overlays, ...unstated } = PROBE_OVERLAY_ENTRY;
    assert.equal(overlays, true, 'the probe states it');
    assert.deepEqual(overlayFaults(unstated), [
      'reaches src/ui/svelte/actions/anchoredPopover.js and is not overlays: true',
      'reaches src/ui/svelte/actions/portal.js and is not overlays: true',
    ]);
  });

  it('refuses a closure that imports only a pure export of anchoredPopover.js', () => {
    const reader = syntheticReader({
      'src/ui/svelte/components/E.svelte':
        "<script>import { hostRelativePopoverLayout } from '../actions/anchoredPopover.js';" +
        'const layout = hostRelativePopoverLayout(() => null);</script>',
      'src/ui/svelte/actions/anchoredPopover.js':
        'export function hostRelativePopoverLayout(compute) { return compute; }',
    });
    const entry = { name: 'E', path: 'src/ui/svelte/components/E.svelte' };
    assert.deepEqual(overlayFaults(entry, reader), [
      'reaches src/ui/svelte/actions/anchoredPopover.js and is not overlays: true',
    ]);
    assert.deepEqual(overlayFaults({ ...entry, overlays: true }, reader), []);
  });

  it('refuses overlays on an entry whose closure reaches no overlay action', () => {
    assert.deepEqual(overlayFaults({ ...PROBE_ENTRY, overlays: true }), [
      'is overlays: true and reaches no overlay action',
    ]);
  });
});

describe('each entry matches its component declaration', () => {
  for (const entry of [...PUBLISHED_COMPONENT_MANIFEST, PROBE_ENTRY, PROBE_OVERLAY_ENTRY]) {
    it(`${entry.name} publishes only declared props at a shipped kind, rest exactly when declared, and a root`, () => {
      const declaration = readDeclaration({ file: entry.path, ast: componentAstOf(entry.path) });
      const optional = new Set(['restOn', 'overlays']);
      const keys = Object.keys(entry).filter((key) => !optional.has(key));
      assert.deepEqual(keys.sort(byName), ['name', 'path', 'props', 'rest', 'root', 'version']);
      assert.ok(
        !Object.hasOwn(entry, 'restOn') || entry.restOn === 'control',
        "restOn is 'control' or absent"
      );
      assert.ok(
        !Object.hasOwn(entry, 'overlays') || entry.overlays === true,
        'overlays is true or absent'
      );
      assert.ok(['any', 'fabricate', 'manager'].includes(entry.root), 'a shipped root');
      assert.ok(Number.isInteger(entry.version) && entry.version > 0, 'a positive version');
      assert.equal(entry.name, declaration.component);
      assert.equal(entry.rest, declaration.rest !== null, 'rest matches the rest declaration');
      assert.deepEqual(declarationFaults(entry, declaration.ast), []);
    });

    it(`${entry.name} states restOn exactly when its rest keys land on a control it draws`, () => {
      assert.deepEqual(restOnFaults(entry, componentAstOf(entry.path)), []);
    });

    it(`${entry.name} needs no ancestor above its root and reads no Foundry global, closure included`, () => {
      assert.deepEqual(closureDependencies(entry.path, SHIPPED, entry.root), []);
    });

    it(`${entry.name} marks every focusable element it draws, and names no form control`, () => {
      assert.deepEqual(closureFocusables(entry.path).faults, []);
    });
  }

  it('judges fourteen focusable elements across the shipped closures, each file read once: the Button, the Chip remove button, the Notice action and dismiss buttons, the search input, the StatusToggle button and checkbox, the Stepper buttons and its number and formatted inputs, and the probe button and two inputs', () => {
    const files = new Set(
      [...PUBLISHED_COMPONENT_MANIFEST, PROBE_ENTRY].flatMap((entry) => [
        ...importClosure(entry.path, SHIPPED),
      ])
    );
    const judged = [...files]
      .filter(isComponent)
      .flatMap((file) => focusableElements(file, componentAstOf(file)).judged);
    assert.deepEqual(judged.sort(byName), [
      'src/ui/svelte/components/Button.svelte: svelte:element',
      'src/ui/svelte/components/Chip.svelte: button',
      'src/ui/svelte/components/Notice.svelte: button',
      'src/ui/svelte/components/Notice.svelte: button',
      'src/ui/svelte/components/SearchField.svelte: input',
      'src/ui/svelte/components/StatusToggle.svelte: button',
      'src/ui/svelte/components/StatusToggle.svelte: input',
      'src/ui/svelte/components/Stepper.svelte: button',
      'src/ui/svelte/components/Stepper.svelte: button',
      'src/ui/svelte/components/Stepper.svelte: input',
      'src/ui/svelte/components/Stepper.svelte: input',
      'tests/fixtures/published-components/PublishedProbe.svelte: button',
      'tests/fixtures/published-components/PublishedProbe.svelte: input',
      'tests/fixtures/published-components/PublishedProbe.svelte: input',
    ]);
  });

  it('pins every svelte:element the shipped closures and the probe draw, by the tags and the published keys its file states', () => {
    const files = closureComponents([...PUBLISHED_COMPONENT_MANIFEST, PROBE_ENTRY]);
    assert.ok(files.length >= 15, 'every shipped closure and the probe were read');
    assert.deepEqual(dynamicElementFaults(files), []);
    const held = Object.values(DYNAMIC_ELEMENTS).flatMap(({ heldBy }) => (heldBy ? [heldBy] : []));
    assert.ok(held.length > 0, 'a pin names a mounted clause');
    assert.deepEqual(unheldClauses(held), [], 'each names a describe block of its file');
  });

  it('pins the rest landings of each entry whose rest lands on more than one element, held by a mounted clause', () => {
    const held = Object.values(REST_LANDINGS).map(({ heldBy }) => heldBy);
    assert.deepEqual(
      Object.keys(REST_LANDINGS),
      [
        'src/ui/svelte/components/SearchField.svelte',
        'src/ui/svelte/components/StatusToggle.svelte',
      ],
      'the search field, whose unpublished label keeps its Field root undrawn, and the switch, whose unpublished as keeps its checkbox and indicator hosts undrawn'
    );
    assert.deepEqual(unheldClauses(held), [], 'each names a describe block of its file');
  });

  it('pins every shipped callback key with how many arguments it forwards', () => {
    const shipped = PUBLISHED_COMPONENT_MANIFEST.flatMap((entry) =>
      Object.entries(entry.props)
        .filter(([, spec]) => spec.kind === 'callback')
        .map(([key, spec]) => `${entry.name}.${key}: ${spec.args ?? 0}`)
    );
    assert.deepEqual(
      shipped,
      [
        'Notice.onAction: 0',
        'Notice.onDismiss: 0',
        'Button.onclick: 0',
        'StatusToggle.onclick: 0',
        'Stepper.onChange: 1',
      ],
      'a forwarded argument needs a mounted clause on its type'
    );
  });

  it('pins every shipped aria key', () => {
    assert.deepEqual(
      shippedAriaKeys(),
      [
        'Button.aria-expanded',
        'Button.aria-describedby',
        'StatusToggle.aria-labelledby',
        'StatusToggle.aria-describedby',
      ],
      'an aria key needs a mounted clause that reads the attribute off the control, and a group line that states its values'
    );
  });

  it('reads each shipped aria key with getAttribute in a clause of its entry’s mounted suite', () => {
    const entries = PUBLISHED_COMPONENT_MANIFEST.filter((entry) => ariaKeysOf(entry).length > 0);
    assert.deepEqual(
      entries.map(({ name }) => name),
      Object.keys(ARIA_KEY_SUITES),
      'one mounted suite per entry with an aria key'
    );
    for (const entry of entries) {
      const read = attributesReadInClauses(SHIPPED.module(ARIA_KEY_SUITES[entry.name]).ast);
      assert.deepEqual(
        ariaKeysOf(entry).filter((key) => !read.includes(key)),
        [],
        `${ARIA_KEY_SUITES[entry.name]} reads each of ${entry.name}’s aria keys in a clause`
      );
    }
  });

  it('pins every DOM read under src/ of a shipped aria key or aria-pressed, with why it reads no published control', () => {
    const names = [...new Set(PUBLISHED_COMPONENT_MANIFEST.flatMap((entry) => ariaKeysOf(entry)))];
    const files = sourceAstEntriesUnder('src');
    assert.ok(files.length > 900, `src/ was read: ${files.length} files`);
    assert.deepEqual(
      attributeReads(files, [...names, 'aria-pressed']).sort(byName),
      Object.keys(JS_ARIA_READERS).sort(byName),
      'a script that reads a published ARIA attribute off a control a companion mounted acts on it'
    );
  });

  it('spells no sheet-named class in an any closure but the four pinned: the Chip pair, and the EmptyState and Notice roots', () => {
    const sheet = sheetClassNames();
    assert.ok(sheet.has('fabricate-card') && sheet.size > 500, 'the module sheet was read');
    const reach = [...PUBLISHED_COMPONENT_MANIFEST, PROBE_ENTRY].flatMap((entry) =>
      sheetReach(entry, sheet)
    );
    assert.deepEqual([...new Set(reach)].sort(byName), [...SHEET_REACH_PINS]);
    const card = PUBLISHED_COMPONENT_MANIFEST.find(({ name }) => name === 'InspectorCard');
    assert.deepEqual(
      sheetReach({ ...card, root: 'any' }, sheet),
      ['src/ui/svelte/components/InspectorCard.svelte: fabricate-card'],
      'the class the sheet draws the card by is what refuses it the any root'
    );
  });

  it('reads a snippet, a bindable and a rest prop from a declaration, so the gate can see them', () => {
    const { ast } = templateOf(
      'Synthetic.svelte',
      '<script>\n  let { body, value = $bindable(), ...rest } = $props();\n</script>\n{@render body?.()}'
    );
    assert.deepEqual(propLocals(ast), [
      { key: 'body', local: 'body', bindable: false },
      { key: 'value', local: 'value', bindable: true },
    ]);
    assert.deepEqual(
      [...renderedLocals(ast)],
      [['body', [{ args: 0, optional: true, guarded: false, repeated: false }]]]
    );
  });

  const SYNTHETIC = templateOf(
    'Synthetic.svelte',
    [
      '<script>',
      '  let { label, body, note, value = $bindable(), row, flag, ...rest } = $props();',
      '</script>',
      '<p {...rest}>{label}{@render body()}{@render body?.()}{@render note?.()}</p>',
      '{@render row?.(label)}{@render row()}',
    ].join('\n')
  ).ast;
  const data = { kind: 'data' };
  const faultsOf = (props) => declarationFaults({ props }, SYNTHETIC);

  it('passes a synthetic entry whose keys each match their declaration and render tags', () => {
    const body = { kind: 'text', required: true };
    assert.deepEqual(faultsOf({ label: data, body, note: { kind: 'text' } }), []);
    const when = { kind: 'text', requiredWhen: 'label' };
    assert.deepEqual(faultsOf({ label: data, note: when }), [], 'a key required while label is');
    const optional = { kind: 'data', required: false };
    assert.deepEqual(
      faultsOf({ label: optional, note: when }),
      [],
      'a guard that states required: false is not itself required'
    );
  });

  it('admits an unpublished prop that is $bindable, or rendered with and without an argument', () => {
    assert.deepEqual(faultsOf({ label: data }), []);
  });

  it('passes a $bindable value key whose initial is each primitive, null among them', () => {
    for (const initial of ['', 0, false, null]) {
      assert.deepEqual(faultsOf({ value: { kind: 'value', initial } }), []);
    }
  });

  it('names a value key whose change callback the component declares, or whose name is not camel case', () => {
    const { ast } = templateOf(
      'Valued.svelte',
      [
        '<script>',
        "  let { value = $bindable(''), onValueChange, Big = $bindable('') } = $props();",
        '</script>',
      ].join('\n')
    );
    const value = { kind: 'value', initial: '' };
    assert.deepEqual(declarationFaults({ props: { value, Big: value } }, ast), [
      'value synthesises onValueChange, which the component declares',
      'Big is a value key whose name is not camel case',
    ]);
  });

  for (const [claim, props, faults] of [
    ['a published $bindable key', { value: data }, ['value is $bindable']],
    [
      'a text key no render tag draws',
      { label: { kind: 'text' } },
      ['label is a text key no render tag draws'],
    ],
    [
      'a text key rendered bare at one site and with an argument at another',
      {
        row: { kind: 'text', required: true },
      },
      ['row is a text key rendered with an argument'],
    ],
    [
      'an optional text key rendered without ?.',
      { body: { kind: 'text' } },
      ['body is an optional text key rendered without ?. or an {#if} guard'],
    ],
    ['a data key with a render tag', { note: data }, ['note is a data key rendered as a snippet']],
    [
      'a value key that is not $bindable, with a render tag',
      { note: { kind: 'value', initial: '' } },
      ['note is a value key that is not $bindable', 'note is a value key rendered as a snippet'],
    ],
    [
      'a value key with no initial',
      { value: { kind: 'value' } },
      ['value has an initial that is not a string, number, boolean or null'],
    ],
    [
      'a value key whose initial is an object',
      { value: { kind: 'value', initial: {} } },
      ['value has an initial that is not a string, number, boolean or null'],
    ],
    [
      'a value key that states required',
      { value: { kind: 'value', initial: '', required: false } },
      ['value is a value key that states required'],
    ],
    [
      'a value key that states requiredWhen',
      { open: { kind: 'data' }, value: { kind: 'value', initial: '', requiredWhen: 'open' } },
      ['open is not a declared prop', 'value states requiredWhen, which no value key takes'],
    ],
    [
      'a value key whose change callback the entry lists',
      { value: { kind: 'value', initial: null }, onValueChange: { kind: 'callback' } },
      [
        'value synthesises onValueChange, which the entry lists',
        'onValueChange is not a declared prop',
      ],
    ],
    [
      'a callback key a render tag calls',
      { note: { kind: 'callback' } },
      ['note is a callback key a render tag calls'],
    ],
    ['a $bindable callback key', { value: { kind: 'callback' } }, ['value is $bindable']],
    [
      'element on a callback key',
      { label: { kind: 'callback', element: 'div' } },
      ['label states element, which only a slot key takes'],
    ],
    [
      'a callback key whose args is negative',
      { label: { kind: 'callback', args: -1 } },
      ['label states args that is not a non-negative integer'],
    ],
    [
      'a callback key whose args is a fraction',
      { label: { kind: 'callback', args: 1.5 } },
      ['label states args that is not a non-negative integer'],
    ],
    [
      'args on a key that is no callback',
      { label: { kind: 'data', args: 0 } },
      ['label states args, which only a callback key takes'],
    ],
    [
      'element on a key that is no slot',
      { label: { kind: 'data', element: 'div' } },
      ['label states element, which only a slot key takes'],
    ],
    ['a key the component does not declare', { missing: data }, ['missing is not a declared prop']],
    [
      'a required that is not a boolean',
      { label: { kind: 'data', required: 'yes' } },
      ['label is required by something other than a boolean'],
    ],
    [
      'a requiredWhen naming no key of the entry',
      { label: { kind: 'data', requiredWhen: 'toString' } },
      ['label is requiredWhen toString, which is no other key of the entry'],
    ],
    [
      'a requiredWhen naming its own key',
      { label: { kind: 'data', requiredWhen: 'label' } },
      ['label is requiredWhen label, which is no other key of the entry'],
    ],
    [
      'a requiredWhen that is no string',
      { label: { kind: 'data', requiredWhen: 1 } },
      ['label is requiredWhen 1, which is no other key of the entry'],
    ],
    [
      'a requiredWhen naming a key that is no data key',
      { note: { kind: 'text' }, label: { kind: 'data', requiredWhen: 'note' } },
      ['label is requiredWhen note, which is no data key'],
    ],
    [
      'a requiredWhen naming a required key',
      { label: { kind: 'data', required: true }, note: { kind: 'text', requiredWhen: 'label' } },
      ['note is requiredWhen label, which is itself required or requiredWhen'],
    ],
    [
      'a requiredWhen naming a requiredWhen key',
      {
        label: data,
        flag: { kind: 'data', requiredWhen: 'label' },
        note: { kind: 'text', requiredWhen: 'flag' },
      },
      ['note is requiredWhen flag, which is itself required or requiredWhen'],
    ],
    [
      'a requiredWhen beside required',
      { label: data, note: { kind: 'text', required: false, requiredWhen: 'label' } },
      ['note states both required and requiredWhen'],
    ],
  ]) {
    it(`names ${claim} as a fault`, () => {
      assert.deepEqual(faultsOf(props), faults);
    });
  }

  const SLOTTED = templateOf(
    'Slotted.svelte',
    [
      '<script>',
      '  let { clean, twice, bare, given, listed, keyed, snipped, wrapped, unused } = $props();',
      '</script>',
      '<div>{@render clean?.()}{@render twice?.()}{@render twice?.()}{@render bare()}</div>',
      '{@render given?.(1)}',
      '{#each [1] as item (item)}<p>{@render listed?.()}</p>{/each}',
      '{#key clean}<p>{@render keyed?.()}</p>{/key}',
      '{#snippet row()}<p>{@render snipped?.()}</p>{/snippet}',
      '<Wrapper>{@render wrapped?.()}</Wrapper>',
    ].join('\n')
  ).ast;
  const slot = { kind: 'slot' };
  const slotFaultsOf = (props) => declarationFaults({ props }, SLOTTED);

  it('passes a slot key one bare ?.() render tag draws, at either element', () => {
    assert.deepEqual(slotFaultsOf({ clean: slot }), []);
    for (const element of ['div', 'span']) {
      assert.deepEqual(slotFaultsOf({ clean: { kind: 'slot', element } }), []);
    }
  });

  for (const [claim, props, faults] of [
    ['no render tag draws', { unused: slot }, ['unused is a slot key no render tag draws']],
    [
      'two render tags draw',
      { twice: slot },
      ['twice is a slot key more than one render tag draws'],
    ],
    [
      'rendered with an argument',
      { given: slot },
      ['given is a slot key rendered with an argument'],
    ],
    [
      'rendered without ?.',
      { bare: slot },
      ['bare is a slot key rendered without ?. or an {#if} guard'],
    ],
    [
      'rendered inside {#each}',
      { listed: slot },
      ['listed is a slot key rendered inside {#each}, {#key}, {#snippet} or a component'],
    ],
    [
      'rendered inside {#key}',
      { keyed: slot },
      ['keyed is a slot key rendered inside {#each}, {#key}, {#snippet} or a component'],
    ],
    [
      'rendered inside {#snippet}',
      { snipped: slot },
      ['snipped is a slot key rendered inside {#each}, {#key}, {#snippet} or a component'],
    ],
    [
      'rendered inside a component',
      { wrapped: slot },
      ['wrapped is a slot key rendered inside {#each}, {#key}, {#snippet} or a component'],
    ],
    [
      'that states required',
      { clean: { kind: 'slot', required: false } },
      ['clean is a slot key that states required'],
    ],
    [
      'that states requiredWhen',
      { unused: { kind: 'data' }, clean: { kind: 'slot', requiredWhen: 'unused' } },
      ['clean states requiredWhen, which no slot key takes'],
    ],
    [
      'whose element is a <p>',
      { clean: { kind: 'slot', element: 'p' } },
      ['clean is a slot key whose element is p'],
    ],
  ]) {
    it(`names a slot key ${claim} as a fault`, () => {
      assert.deepEqual(slotFaultsOf(props), faults);
    });
  }

  const GUARDED = templateOf(
    'Guarded.svelte',
    [
      '<script>',
      '  let { plain, boxed, note, a: first, b: second, other, alt, chained, negated, joined,',
      '    foreign, twice, given, listed, nested } = $props();',
      '</script>',
      '{#if plain}{@render plain()}{/if}',
      '{#if boxed}<span>{@render boxed()}</span>{/if}',
      '{#if note}{@render note()}{/if}',
      '{#if first}{@render first()}{/if}',
      '{#if b}{@render second()}{/if}',
      '{#if alt}<p></p>{:else}{@render alt()}{/if}',
      '{#if other}<p></p>{:else if chained}{@render chained()}{/if}',
      '{#if !negated}{@render negated()}{/if}',
      '{#if joined && other}{@render joined()}{/if}',
      '{#if other}{@render foreign()}{/if}',
      '{#if twice}{@render twice()}{@render twice()}{/if}',
      '{#if given}{@render given(1)}{/if}',
      '{#if listed}{#each [1] as item (item)}{@render listed()}{/each}{/if}',
      '{#if nested}{#if other}{@render nested()}{/if}{/if}',
    ].join('\n')
  ).ast;
  const guardFaultsOf = (props) => declarationFaults({ props }, GUARDED);
  const UNGUARDED = 'is a slot key rendered without ?. or an {#if} guard';
  const REPEATED = 'is a slot key rendered inside {#each}, {#key}, {#snippet} or a component';

  it('passes a slot key and an optional text key whose bare render tag its own {#if} guards', () => {
    assert.deepEqual(guardFaultsOf({ plain: slot }), [], 'directly in the consequent');
    assert.deepEqual(guardFaultsOf({ boxed: slot }), [], 'inside an element in the consequent');
    assert.deepEqual(guardFaultsOf({ note: { kind: 'text' } }), [], 'an optional text key');
    assert.deepEqual(guardFaultsOf({ a: slot }), [], 'a renamed local, guarded by its local name');
    assert.deepEqual(
      guardFaultsOf({ nested: slot }),
      [],
      'a foreign {#if} around the tag is not seen, so the slot another prop hides is admitted'
    );
  });

  for (const [claim, key, fault] of [
    ['in the alternate of its own {#if}', 'alt', UNGUARDED],
    ['under {:else if}, which an earlier test can hide', 'chained', UNGUARDED],
    ['under a test that negates it', 'negated', UNGUARDED],
    ['under a test that joins it with another expression', 'joined', UNGUARDED],
    ['under a test that names another local', 'foreign', UNGUARDED],
    ['under a test that names the key and not its renamed local', 'b', UNGUARDED],
    ['twice in one guard', 'twice', 'is a slot key more than one render tag draws'],
    ['with an argument in its guard', 'given', 'is a slot key rendered with an argument'],
    ['under {#each} in its guard', 'listed', REPEATED],
  ]) {
    it(`names a slot key rendered ${claim} as a fault`, () => {
      assert.deepEqual(guardFaultsOf({ [key]: slot }), [`${key} ${fault}`]);
    });
  }

  it('walks static component imports, so an offender only an imported file carries is named', () => {
    const sources = {
      'src/Entry.svelte':
        '<script>import Leaf from \'./parts/Leaf.svelte\';</script><Leaf /><span class="visually-hidden"></span>',
      'src/parts/Cycle.svelte': "<script>import Entry from '../Entry.svelte';</script><Entry />",
      'src/parts/Leaf.svelte':
        "<script module>import Deep from '../deep/Deep.svelte';</script><script>import Cycle from './Cycle.svelte';</script><Deep /><Cycle />",
      'src/deep/Deep.svelte': '<style>:global(.fabricate-app) .a { color: red; }</style>',
    };
    assert.deepEqual(closureDependencies('src/Entry.svelte', syntheticReader(sources)), [
      'src/Entry.svelte: .visually-hidden',
      'src/deep/Deep.svelte: app-root selector',
    ]);
  });

  it('sees every ancestor dependency the published-components spec forbids', () => {
    const offenders = [
      '<span class="a visually-hidden"></span><span class:visually-hidden={on}></span>',
      '<style>',
      '  :global(.fabricate-manager) .a { color: var(--fab-manager-ink); }',
      '  @container app (width > 1px) { .a { font-family: var(--font-primary); } }',
      '</style>',
    ];
    const { ast } = templateOf('Synthetic.svelte', offenders.join('\n'));
    assert.deepEqual(ancestorDependencies(ast), [
      '.visually-hidden',
      '@container',
      'app-root selector',
      'unguarded var(--font-primary)',
      'var(--fab-manager-',
    ]);
    for (const root of ['.fabricate', '.fabricate-app']) {
      const scoped = templateOf('Root.svelte', `<style>:global ${root} .a { color: red; }</style>`);
      assert.deepEqual(ancestorDependencies(scoped.ast), ['app-root selector'], root);
    }
  });

  const MANAGER_BORROWS = [
    ['a .fabricate-manager selector', ':global(.fabricate-manager) .a { color: red; }'],
    ['a --fab-manager- token', '.a { color: var(--fab-manager-ink); }'],
  ];
  const WINDOW_BORROWS = [
    ['a .fabricate selector', ':global(.fabricate) .a { color: red; }'],
    ['a .fabricate-app selector', ':global(.fabricate-app) .a { color: red; }'],
  ];
  const rootRule = (css, root) =>
    closureDependencies(
      'src/E.svelte',
      syntheticReader({ 'src/E.svelte': `<style>${css}</style>` }),
      root
    );

  for (const [claim, css] of WINDOW_BORROWS) {
    it(`admits ${claim} to a fabricate entry and a manager entry, and refuses it to an any entry`, () => {
      assert.deepEqual(rootRule(css, 'fabricate'), []);
      assert.deepEqual(rootRule(css, 'manager'), []);
      assert.deepEqual(rootRule(css, 'any'), ['src/E.svelte: app-root selector']);
    });
  }

  for (const [claim, css] of MANAGER_BORROWS) {
    it(`refuses ${claim} to a fabricate entry and an any entry, and admits it to a manager entry`, () => {
      assert.equal(rootRule(css, 'fabricate').length, 1);
      assert.deepEqual(rootRule(css, 'fabricate'), rootRule(css, 'any'));
      assert.deepEqual(rootRule(css, 'manager'), []);
    });
  }

  it('admits what only a Fabricate window supplies to a fabricate entry, and never a Foundry read', () => {
    const windowed =
      '<span class="visually-hidden"></span><style>@container app (width > 1px) { .a { font-family: var(--font-primary); } }</style>';
    const reader = syntheticReader({
      'src/E.svelte': windowed,
      'src/G.svelte': '<script>const read = game;</script>',
    });
    assert.deepEqual(closureDependencies('src/E.svelte', reader, 'fabricate'), []);
    assert.equal(closureDependencies('src/E.svelte', reader, 'any').length, 3);
    for (const root of ['any', 'fabricate', 'manager']) {
      assert.deepEqual(closureDependencies('src/G.svelte', reader, root), [
        'src/G.svelte: reads game',
      ]);
    }
  });

  const CARD = new Set(['fabricate-card']);
  const reachOf = (sources, root = 'any') =>
    sheetReach({ path: 'src/E.svelte', root }, CARD, syntheticReader(sources));

  for (const [spelling, source] of [
    ['class attribute text', '<section class="a fabricate-card"></section>'],
    ['a class: directive', '<section class:fabricate-card={on}></section>'],
    ['a template class array', "<section class={['fabricate-card', extra]}></section>"],
    ['a script literal', "<script>const classes = ['fabricate-card'];</script>"],
    [
      'a template-literal chunk',
      '<script>const classes = `fabricate-card ${extra}`;</script>{classes}',
    ],
    ['a module script literal', "<script module>export const ROOT = 'fabricate-card';</script>"],
  ]) {
    it(`names a sheet-named class an any entry spells as ${spelling}`, () => {
      assert.deepEqual(reachOf({ 'src/E.svelte': source }), ['src/E.svelte: fabricate-card']);
      assert.deepEqual(reachOf({ 'src/E.svelte': source }, 'fabricate'), [], 'not at fabricate');
    });
  }

  it('names a sheet-named class only a file reached by import spells', () => {
    const sources = {
      'src/E.svelte': "<script>import Leaf from './Leaf.svelte';</script><Leaf />",
      'src/Leaf.svelte': "<script>import { ROOT } from './root.js';</script><p class={ROOT}></p>",
      'src/root.js': "export const ROOT = 'fabricate-card';",
    };
    assert.deepEqual(reachOf(sources), ['src/root.js: fabricate-card']);
  });

  it('reads a class token whole, so a longer name and a token inside a value are not the class', () => {
    const source =
      '<script>const style = `--x:var(--fabricate-card-${tone})`;</script><p class="fabricate-card-row not-fabricate-card" {style}></p>';
    assert.deepEqual(reachOf({ 'src/E.svelte': source }), []);
  });

  const focusOf = (markup) =>
    closureFocusables('src/E.svelte', syntheticReader({ 'src/E.svelte': markup }));

  it('passes a marked button and an unnamed input, and reports both as judged', () => {
    assert.deepEqual(
      focusOf('<button type="button" data-keyboard-focus="true">x</button><input /><p>x</p>'),
      { judged: ['src/E.svelte: button', 'src/E.svelte: input'], faults: [] }
    );
  });

  for (const [claim, markup, fault] of [
    [
      'a button without data-keyboard-focus',
      '<button type="button">x</button>',
      'button does not state data-keyboard-focus="true"',
    ],
    [
      'a button whose data-keyboard-focus is not static',
      '<button type="button" data-keyboard-focus={on}>x</button>',
      'button does not state data-keyboard-focus="true"',
    ],
    [
      'a button without type',
      '<button data-keyboard-focus="true">x</button>',
      'button does not state type="button"',
    ],
    ['a link', '<a href="#x">x</a>', 'a does not state data-keyboard-focus="true"'],
    [
      'an element with tabindex',
      '<span tabindex="0">x</span>',
      'span does not state data-keyboard-focus="true"',
    ],
    ['a named input', '<input name="q" />', 'input states name'],
    ['a named select', '<select name={field}></select>', 'select states name'],
  ]) {
    it(`names ${claim} as a rule 9 fault`, () => {
      assert.deepEqual(focusOf(markup).faults, [`src/E.svelte: ${fault}`]);
    });
  }

  /** Rule 9's element ids and faults over one synthetic file's `markup`. */
  const idsOf = (markup) => {
    const { ast } = templateOf('src/E.svelte', markup);
    const { elements, faults } = focusableElements('src/E.svelte', ast);
    return { ids: elements.map(({ id }) => id), faults };
  };

  it('tells two inputs that share a hook apart by their static type, and moves no unshared id', () => {
    const markup =
      '{#if a}<input type="text" data-in />{:else}<input type="number" data-in />{/if}';
    assert.deepEqual(idsOf(`${markup}<input data-other />`), {
      ids: [
        'src/E.svelte: input[data-in][type="text"]',
        'src/E.svelte: input[data-in][type="number"]',
        'src/E.svelte: input[data-other]',
      ],
      faults: [],
    });
  });

  for (const [claim, markup] of [
    ['a pair with no static type', '<input data-in /><input type={kind} data-in />'],
    ['a pair of one type', '<input type="number" data-in /><input type="number" data-in />'],
  ]) {
    it(`names ${claim} that shares a hook as a fault`, () => {
      assert.deepEqual(idsOf(markup).faults, [
        'src/E.svelte: input[data-in] names more than one element',
      ]);
    });
  }

  const DYNAMIC = 'src/E.svelte: svelte:element';
  const MARKED = ' data-keyboard-focus="true"';
  const UNMARKED = `${DYNAMIC} does not state data-keyboard-focus="true"`;
  /** Rule 9 over one `svelte:element` that states `attributes`, pinned to `tags` or unpinned. */
  const dynamicFocusOf = (attributes, tags) =>
    closureFocusables(
      'src/E.svelte',
      syntheticReader({
        'src/E.svelte': ['<svelte:element this={tag}', attributes, '>x</svelte:element>'].join(''),
      }),
      tags ? { [DYNAMIC]: { tags, keys: [] } } : {}
    );

  for (const [claim, attributes, tags, judged, faults] of [
    ['a marked svelte:element pinned to button', MARKED, ['button'], [DYNAMIC], []],
    ['an unmarked one pinned to button', '', ['button'], [DYNAMIC], [UNMARKED]],
    [
      'one pinned to button whose data-keyboard-focus is not static',
      ' data-keyboard-focus={on}',
      ['button'],
      [DYNAMIC],
      [UNMARKED],
    ],
    ['one pinned to tags that draw no control', '', ['p', 'span'], [], []],
    [
      'a marked one pinned to p that states tabindex',
      `${MARKED} tabindex="0"`,
      ['p'],
      [DYNAMIC],
      [],
    ],
    ['one with no pin', MARKED, null, [], [`${DYNAMIC} has no pinned tags`]],
    [
      'a named one pinned to button',
      `${MARKED} name="q"`,
      ['button'],
      [DYNAMIC],
      [`${DYNAMIC} states name`],
    ],
    [
      'one pinned to a link and a span, judged once as their union',
      '',
      ['a', 'span'],
      [DYNAMIC],
      [UNMARKED],
    ],
  ]) {
    it(`judges ${claim} by its pinned tags`, () => {
      assert.deepEqual(dynamicFocusOf(attributes, tags), { judged, faults });
    });
  }

  const HOSTED = [
    "let { as = 'p', ...rest } = $props();",
    "const HOSTS = new Set(['p', 'span']);",
    "const host = $derived(HOSTS.has(as) ? as : 'p');",
  ].join(' ');
  /** The pin faults of one file whose script is `body` and whose template is `template`, publishing `as`. */
  const pinFaultsOf = (pins, { body = HOSTED, template, file = 'src/E.svelte' } = {}) => {
    const drawn = template ?? '<svelte:element this={host}></svelte:element>';
    const { ast } = templateOf(file, `<script>${body}</script>${drawn}`);
    return dynamicElementFaults([{ file, ast, published: new Map([['as', 'as']]) }], pins);
  };
  const HELD = { tags: ['p', 'span'], keys: ['as'], heldBy: 'a mounted clause' };

  it('passes a pin whose tags its file spells and whose keys its tag follows', () => {
    assert.deepEqual(pinFaultsOf({ [DYNAMIC]: HELD }), []);
  });

  for (const [claim, pins, options, faults] of [
    [
      'a pinned id no file draws',
      { [DYNAMIC]: HELD, 'src/Gone.svelte: svelte:element': HELD },
      {},
      ['src/Gone.svelte: svelte:element is pinned and no file draws it'],
    ],
    ['a drawn element with no pin', {}, {}, [`${DYNAMIC} has no pin`]],
    [
      'a pinned tag the file does not spell',
      { [DYNAMIC]: { ...HELD, tags: ['h3', 'p'] } },
      {},
      [`${DYNAMIC} pins <h3>, which its file does not spell`],
    ],
    [
      'two hookless elements in one file',
      { [DYNAMIC]: HELD },
      { template: '<svelte:element this={host} /><svelte:element this={host} />' },
      [`${DYNAMIC} is drawn twice, so one pin would name two elements`],
    ],
    [
      'an open pin on a shipped file',
      { [DYNAMIC]: { tags: ['p', 'span'], keys: ['as'], open: true } },
      {},
      [`${DYNAMIC} is open in a shipped file`],
    ],
    [
      'a keyed pin that names no mounted clause',
      { [DYNAMIC]: { tags: ['p', 'span'], keys: ['as'] } },
      {},
      [`${DYNAMIC} follows a published key and names no mounted clause in heldBy`],
    ],
    [
      'a pin whose keys differ from what its tag follows',
      { [DYNAMIC]: { tags: ['p', 'span'], keys: [] } },
      {},
      [`${DYNAMIC} pins the keys [], and its tag follows [as]`],
    ],
  ]) {
    it(`names ${claim} as a pin fault`, () => {
      assert.deepEqual(pinFaultsOf(pins, options), faults);
    });
  }

  it('admits an open pin on a test fixture, which no shipped closure reaches', () => {
    const file = 'tests/fixtures/Probe.svelte';
    const id = `${file}: svelte:element`;
    const pins = { [id]: { tags: ['p', 'span'], keys: ['as'], open: true } };
    assert.deepEqual(pinFaultsOf(pins, { file }), []);
  });

  /**
   * The keys and faults `tagKeys` reads of `<svelte:element this={<tag>}>` under a script `body`,
   * publishing `as`, the element drawn between `open` and `close`.
   */
  const keysOf = (body, tag, [open, close] = ['', '']) => {
    const drawn = `${open}<svelte:element this={${tag}}></svelte:element>${close}`;
    const { ast } = templateOf('src/E.svelte', `<script>${body}</script>${drawn}`);
    const [{ node }] = dynamicElements('src/E.svelte', ast);
    const { keys, faults } = tagKeys(ast, node, new Map([['as', 'as']]));
    return { keys, faults };
  };
  const PROPS = "let { as = 'p', other = 'p', ...rest } = $props();";
  const CANNOT_FOLLOW = (name) => `tag reads ${name}, which the gate cannot follow`;

  for (const [claim, body, tag, keys] of [
    ['the published prop itself', PROPS, 'as', ['as']],
    ['one $derived', `${PROPS} const host = $derived(as);`, 'host', ['as']],
    [
      'two levels of $derived',
      `${PROPS} const first = $derived(as); const host = $derived(first ?? 'p');`,
      'host',
      ['as'],
    ],
    ['$derived.by', `${PROPS} const host = $derived.by(() => as);`, 'host', ['as']],
    ['a function the tag calls', `${PROPS} function tagFor() { return as; }`, 'tagFor()', ['as']],
    ['an unpublished prop', PROPS, 'other', []],
    ['a constant that reads no prop', `${PROPS} const host = 'p';`, 'host', []],
    ['a literal', PROPS, "'p'", []],
  ]) {
    it(`follows a tag that reads ${claim} to the published keys behind it`, () => {
      assert.deepEqual(keysOf(body, tag), { keys, faults: [] });
    });
  }

  for (const [claim, body, tag, name] of [
    ['a let', `${PROPS} let host = as;`, 'host', 'host'],
    ['a $state', `${PROPS} const host = $state(as);`, 'host', 'host'],
    ['an import', `import { host } from './host.js'; ${PROPS}`, 'host', 'host'],
    ['the rest local', PROPS, "rest['data-tag']", 'rest'],
    ['a destructured name', `${PROPS} const { host } = pick(as);`, 'host', 'host'],
  ]) {
    it(`fails closed on a tag that reads ${claim}, which it cannot follow`, () => {
      assert.deepEqual(keysOf(body, tag), { keys: [], faults: [CANNOT_FOLLOW(name)] });
    });
  }

  for (const [claim, open, close] of [
    ['an {#each} item', '{#each [as] as host (host)}', '{/each}'],
    ['an {#each} index', '{#each [as] as item, host (item)}', '{/each}'],
    ['a {@const}', '{#if as}{@const host = as}', '{/if}'],
    ['a snippet parameter', '{#snippet row(host)}', '{/snippet}'],
    ['an {#await} value', '{#await as then host}', '{/await}'],
  ]) {
    it(`fails closed on a tag that reads ${claim}, which a template block binds`, () => {
      assert.deepEqual(keysOf(PROPS, 'host', [open, close]), {
        keys: [],
        faults: [CANNOT_FOLLOW('host')],
      });
    });
  }

  it('fails closed on a tag that reads a prop a template block shadows', () => {
    const shadowed = keysOf(PROPS, 'as', ['{#each [other] as as (as)}', '{/each}']);
    assert.deepEqual(shadowed, { keys: [], faults: [CANNOT_FOLLOW('as')] });
  });

  const CHILD = 'src/E.svelte';
  const UNKEYED = { [DYNAMIC]: { tags: ['span'], keys: [] } };
  /** The pin faults of a child whose tag reads its prop `tagProp`, beside a parent that draws it as `drawn`. */
  const passedFaultsOf = (drawn, pins = UNKEYED, tagProp = 'tag', parentKeys = new Map()) => {
    const sources = {
      [CHILD]: `<script>let { ${tagProp} = 'span', ...rest } = $props();</script><svelte:element this={${tagProp}}></svelte:element>`,
      'src/Parent.svelte': `<script>import Child from './E.svelte'; let { label, ...rest } = $props();</script>${drawn}`,
    };
    const published = { [CHILD]: new Map([['as', 'as']]), 'src/Parent.svelte': parentKeys };
    const files = Object.entries(sources).map(([file, source]) => ({
      file,
      ast: templateOf(file, source).ast,
      published: published[file] ?? new Map(),
    }));
    return dynamicElementFaults(files, pins);
  };
  const PASSED = (name) =>
    `src/Parent.svelte passes ${name} to ${CHILD}, whose pinned tags rest on its default`;

  it('passes a parent that states no prop the child’s tag reads, and one that states a key the pin follows', () => {
    assert.deepEqual(passedFaultsOf('<Child tone="x" />'), []);
    const keyed = { [DYNAMIC]: { tags: ['span'], keys: ['as'], heldBy: 'a mounted clause' } };
    assert.deepEqual(passedFaultsOf('<Child as="p" {...more} />', keyed, 'as'), []);
  });

  it('passes a parent that names a pinned tag by a literal, and an entry that spreads its own rest', () => {
    assert.deepEqual(passedFaultsOf('<Child tag="span" />'), []);
    const entry = new Map([['label', 'label']]);
    assert.deepEqual(passedFaultsOf('<Child {...rest} />', UNKEYED, 'tag', entry), []);
  });

  for (const [claim, drawn, faults] of [
    ['the prop by name', '<Child tag="button" />', [PASSED('tag')]],
    ['its rest, from a file that is no entry', '<Child {...rest} />', [PASSED('a spread')]],
    ['the prop from an expression', '<Child tag={kind} />', [PASSED('tag')]],
    ['the prop by a binding', '<Child bind:tag={kind} />', [PASSED('tag')]],
    ['a spread', '<Child {...more} />', [PASSED('a spread')]],
  ]) {
    it(`names a closure parent that passes a child ${claim} as a pin fault`, () => {
      assert.deepEqual(passedFaultsOf(drawn), faults);
    });
  }

  const REST = '<script>let { label, ...rest } = $props();</script>';
  /** One marked button that states `attributes` after its mark. */
  const pressed = (attributes) =>
    ['<button type="button" data-keyboard-focus="true"', attributes, '>x</button>'].join('');
  /** What `restOn` breaks for an entry over `template`, stating `restOn` when one is given. */
  const restFaultsOf = (template, restOn = null, script = REST) => {
    const entry = { path: 'src/E.svelte', rest: true };
    if (restOn) entry.restOn = restOn;
    return restOnFaults(entry, templateOf(entry.path, script + template).ast);
  };

  it('passes rest on a control with restOn stated, and rest on elements that are none with it absent', () => {
    assert.deepEqual(restFaultsOf(pressed(' {...rest}'), 'control'), []);
    assert.deepEqual(restFaultsOf('<input {...rest} />', 'control'), [], 'a form control');
    assert.deepEqual(restFaultsOf('<div {...rest}></div>'), []);
    assert.deepEqual(
      restFaultsOf('{#if label}<div {...rest}></div>{:else}<p {...rest}></p>{/if}'),
      [],
      'two roots, neither a control'
    );
  });

  for (const [claim, template, restOn, faults] of [
    ['rest on a button with restOn absent', pressed(' {...rest}'), null, [UNSTATED_REST]],
    ['rest on a div with restOn stated', '<div {...rest}></div>', 'control', [OVERSTATED_REST]],
    ['rest forwarded to a component', '<Child {...rest} />', null, [NO_REST_ELEMENT]],
    ['rest spread on no element at all', '<div></div>', 'control', [NO_REST_ELEMENT]],
    [
      'rest on two elements, one a button',
      ['<div {...rest}>', pressed(' {...rest}'), '</div>'].join(''),
      'control',
      [MIXED_REST],
    ],
    [
      'a static data attribute written before a control-landing spread',
      pressed(' data-open {...rest}'),
      'control',
      ['data-open is written before a control-landing rest and is not reserved'],
    ],
    [
      'a dynamic data attribute written before a control-landing spread',
      pressed(' data-open={label} {...rest}'),
      'control',
      ['data-open is written before a control-landing rest and is not reserved'],
    ],
    [
      'a data attribute in mixed case written before a control-landing spread',
      pressed(' DATA-State {...rest}'),
      'control',
      ['data-state is written before a control-landing rest and is not reserved'],
    ],
  ]) {
    it(`names ${claim} as a restOn fault`, () => {
      assert.deepEqual(restFaultsOf(template, restOn), faults);
    });
  }

  it('fails closed on rest that reaches a control through a $derived copy, and admits a data attribute written after the spread', () => {
    const copied =
      '<script>let { label, ...rest } = $props(); const attrs = $derived({ ...rest });</script>';
    assert.deepEqual(restFaultsOf(pressed(' {...attrs}'), 'control', copied), [NO_REST_ELEMENT]);
    assert.deepEqual(restFaultsOf(pressed(' {...rest} data-open'), 'control'), []);
  });

  for (const [claim, template, script] of [
    [
      'a $derived copy spread beside it',
      ['<div {...rest}>', pressed(' {...attrs}'), '</div>'].join(''),
      '<script>let { label, ...rest } = $props(); const attrs = $derived({ ...rest });</script>',
    ],
    ['a child component it is also spread on', '<div {...rest}><Child {...rest} /></div>', REST],
    [
      'a member read written on a control',
      ['<div {...rest}>', pressed(" data-x={rest['data-x']}"), '</div>'].join(''),
      REST,
    ],
    ['a second spread on the same element', '<div {...rest} {...rest}></div>', REST],
  ]) {
    it(`fails closed on rest that lands on a root and also reaches ${claim}`, () => {
      assert.deepEqual(restFaultsOf(template, null, script), [UNFOLLOWED_REST]);
    });
  }

  it('judges a svelte:element the rest is spread on by its pinned tags', () => {
    const entry = { path: 'src/E.svelte', rest: true };
    const markup = `${REST}<svelte:element this="button" data-keyboard-focus="true" {...rest} />`;
    const { ast } = templateOf(entry.path, markup);
    const pinned = (tags) => ({ 'src/E.svelte: svelte:element': { tags, keys: [] } });
    assert.deepEqual(restOnFaults(entry, ast, pinned(['button'])), [UNSTATED_REST]);
    assert.deepEqual(restOnFaults({ ...entry, restOn: 'control' }, ast, pinned(['button'])), []);
    assert.deepEqual(restOnFaults(entry, ast, pinned(['span'])), []);
  });

  it('refuses restOn on an entry that takes no rest', () => {
    const entry = { path: 'src/E.svelte', rest: false, restOn: 'control' };
    const { ast } = templateOf(entry.path, '<script>let { label } = $props();</script><p>x</p>');
    assert.deepEqual(restOnFaults(entry, ast), [OVERSTATED_REST]);
  });

  const BOXED = [
    "<script>let { as = 'button', label, ...rest } = $props(); let held = $state(false);",
    " const isBox = $derived(as === 'box');</script>",
  ].join('');
  /** A box landing under `test`, else the marked button, each taking the rest. */
  const hosted = (test = 'isBox') =>
    `{#if ${test}}<span {...rest}></span>{:else}${pressed(' {...rest}')}{/if}`;
  const LANDED = { drawn: 'button', undrawn: ['span'], defaults: ['as'], heldBy: 'a clause' };
  /** The `restOn` faults of a control-landing entry over `template`, its landings pinned `pin`. */
  const pinnedFaultsOf = (pin, { template = hosted(), props = { label: data } } = {}) => {
    const entry = { name: 'E', path: 'src/E.svelte', rest: true, restOn: 'control', props };
    const { ast } = templateOf(entry.path, BOXED + template);
    return restOnFaults(entry, ast, undefined, { [entry.path]: pin });
  };
  const GUARDS = (tag, follow) =>
    `rest on <${tag}> is pinned to the defaults [as] and its guards follow [${follow}]`;

  it('judges a pinned entry by its drawn landing alone, which unpinned is mixed', () => {
    assert.deepEqual(pinnedFaultsOf(LANDED), []);
    assert.deepEqual(pinnedFaultsOf(undefined), [MIXED_REST]);
  });

  for (const [claim, pin, options, faults] of [
    [
      'a drawn landing that is no control',
      { ...LANDED, drawn: 'span', undrawn: ['button'] },
      {},
      [OVERSTATED_REST],
    ],
    [
      'an undrawn landing on another tag',
      { ...LANDED, undrawn: ['input'] },
      {},
      ['rest is pinned to land on [button,input], and lands on [button,span]'],
    ],
    [
      'a default the entry publishes',
      LANDED,
      { props: { label: data, as: data } },
      ['rest is pinned to the default of as, which E publishes'],
    ],
    [
      'a default the component does not declare',
      { ...LANDED, defaults: ['size'] },
      {},
      [
        'rest is pinned to the default of size, which the component does not declare',
        'rest on <span> is pinned to the defaults [size] and its guards follow [as]',
        'rest on <button> is pinned to the defaults [size] and its guards follow [as]',
      ],
    ],
    [
      'guards that follow a published key',
      LANDED,
      { template: hosted('isBox || label') },
      [GUARDS('span', 'as,label'), GUARDS('button', 'as,label')],
    ],
    [
      'a guard the gate cannot follow',
      LANDED,
      { template: hosted('isBox || held') },
      [
        'rest on <span> sits under a guard that reads held, which the gate cannot follow',
        'rest on <button> sits under a guard that reads held, which the gate cannot follow',
      ],
    ],
    [
      'landings no guard holds apart',
      LANDED,
      { template: `<span {...rest}></span>${pressed(' {...rest}')}` },
      [GUARDS('span', ''), GUARDS('button', '')],
    ],
    [
      'no heldBy',
      { drawn: 'button', undrawn: ['span'], defaults: ['as'] },
      {},
      ['rest is pinned to defaults and names no mounted clause in heldBy'],
    ],
  ]) {
    it(`names ${claim} as a landing pin fault`, () => {
      assert.deepEqual(pinnedFaultsOf(pin, options), faults);
    });
  }

  /** The twin rule over `template`, beneath a script that takes `label` and the rest. */
  const twinsOf = (template) => branchTwinFaults(templateOf('src/E.svelte', REST + template).ast);

  for (const [claim, template] of [
    [
      'rest in every branch',
      '{#if label}<button {...rest}>x</button>{:else}<span {...rest}></span>{/if}',
    ],
    ['an empty {:else}', '{#if label}<p {...rest}></p>{:else} {/if}'],
    ['no {:else}', '{#if label}<p {...rest}></p>{/if}'],
    ['rest in no branch', '{#if label}<p></p>{:else}<i></i>{/if}<div {...rest}></div>'],
    [
      'a landing under a nested {#if} with no {:else}, which the rule does not see',
      '{#if label}{#if label.length}<p {...rest}></p>{/if}{:else}<i {...rest}></i>{/if}',
    ],
    ['an {#each} with no {:else}', '{#each [label] as item}<p {...rest}>{item}</p>{/each}'],
    [
      'an {#each} whose {:else} holds it too',
      '{#each [label] as item}<p {...rest}>{item}</p>{:else}<i {...rest}></i>{/each}',
    ],
  ]) {
    it(`passes ${claim} under the twin rule`, () => {
      assert.deepEqual(twinsOf(template), []);
    });
  }

  for (const [claim, template] of [
    [
      'a branch that draws an element without it',
      '{#if label}<button {...rest}>x</button>{:else}<button>y</button>{/if}',
    ],
    ['a branch that draws text alone', '{#if label}<p {...rest}></p>{:else}No label{/if}'],
    [
      'the last branch of an {:else if} chain',
      '{#if label}<p {...rest}></p>{:else if label.length}<i {...rest}></i>{:else}<b>x</b>{/if}',
    ],
    [
      'the {:else} of an {#each}',
      '{#each [label] as item}<p {...rest}>{item}</p>{:else}<b>x</b>{/each}',
    ],
  ]) {
    it(`names rest that misses ${claim} as one twin fault`, () => {
      assert.deepEqual(twinsOf(template), [BRANCH_TWIN]);
    });
  }

  it('judges every entry by the twin rule, its rest landing on a control or not', () => {
    const template = '{#if label}<div {...rest}></div>{:else}<p></p>{/if}';
    assert.deepEqual(restFaultsOf(template), [BRANCH_TWIN]);
  });

  const SPREAD = '<script>let { open, role, ...rest } = $props(); ';
  const BUILT = 'const build = () => ({ type: "button" });';
  const LITERAL = 'const attrs = { type: "button" };';
  /** The spreads `restElements` reads beside the rest on the one element of `template`, under a script `body`. */
  const spreadsOf = (body, template = pressed(' {...attrs} {...rest}')) =>
    restElements(templateOf('src/E.svelte', `${SPREAD}${body}</script>${template}`).ast)[0].spreads;
  const followed = (keys, local = 'attrs') => [{ local, before: true, keys }];

  for (const [claim, body, keys] of [
    [
      'an object literal',
      'const attrs = { type: "button", "data-state": role };',
      ['type', 'data-state'],
    ],
    ['shorthand keys', 'const attrs = { open, role };', ['open', 'role']],
    ['a $derived object literal', 'const attrs = $derived({ disabled: open });', ['disabled']],
    [
      'both branches of a conditional',
      'const attrs = $derived(open ? { href: role } : { type: "button", disabled: open });',
      ['href', 'type', 'disabled'],
    ],
    [
      'the right of &&',
      'const attrs = $derived(open && { "aria-expanded": true });',
      ['aria-expanded'],
    ],
    ['both sides of ||', 'const attrs = { title: role } || { type: "button" };', ['title', 'type']],
    ['both sides of ??', 'const attrs = { title: role } ?? { type: "button" };', ['title', 'type']],
  ]) {
    it(`follows a spread of ${claim} to its keys`, () => {
      assert.deepEqual(spreadsOf(body), followed(keys));
    });
  }

  for (const [claim, body] of [
    ['an object literal that spreads another', 'const attrs = { ...role, type: "button" };'],
    ['a computed key', 'const NAME = "aria-expanded"; const attrs = { [NAME]: open };'],
    ['$derived.by', 'const attrs = $derived.by(() => ({ "aria-expanded": open }));'],
    ['$state', 'const attrs = $state({ type: "button" });'],
    ['$state.raw', 'const attrs = $state.raw({ type: "button" });'],
    ['a let', 'let attrs = { type: "button" };'],
    ['an import', 'import { attrs } from "./attrs.js";'],
    ['a function', 'function attrs() {}'],
    ['a destructured name', 'const { attrs } = role;'],
    ['a call', `${BUILT} const attrs = build();`],
    ['an alias', 'const base = { type: "button" }; const attrs = base;'],
    [
      'a conditional with a branch that is a call',
      `${BUILT} const attrs = $derived(open ? { type: "button" } : build());`,
    ],
    [
      '|| whose left is a name',
      'const other = { type: "button" }; const attrs = $derived(other || { disabled: open });',
    ],
    ['a local a member write follows', `${LITERAL} attrs["aria-expanded"] = open;`],
    [
      'a local Object.assign writes to',
      `${LITERAL} Object.assign(attrs, { "aria-expanded": open });`,
    ],
    ['a local another object holds', `${LITERAL} const held = { attrs };`],
    ['a local a function reads', `${LITERAL} const widen = () => { attrs.role = role; };`],
    [
      'a local an alias is then written through',
      `${LITERAL} const alias = attrs; alias["aria-expanded"] = open;`,
    ],
    ['a local the script exports', `export ${LITERAL}`],
    ['an undeclared name', ''],
  ]) {
    it(`fails closed on a spread of ${claim}, which it cannot follow`, () => {
      assert.deepEqual(spreadsOf(body), followed(null));
    });
  }

  it('follows a spread of a local a module script holds, and fails closed where that script writes to it or exports it', () => {
    const under = (module) =>
      `<script module>${module}</script>${pressed(' {...attrs} {...rest}')}`;
    assert.deepEqual(spreadsOf('', under(LITERAL)), followed(['type']));
    const written = `${LITERAL} attrs["aria-expanded"] = true;`;
    assert.deepEqual(spreadsOf('', under(written)), followed(null), 'written to');
    assert.deepEqual(spreadsOf('', under(`export ${LITERAL}`)), followed(null), 'exported');
  });

  it('fails closed on a spread of a name a template block binds, and of anything that is no name', () => {
    for (const [open, close] of [
      ['{#each [{ "aria-expanded": true }] as attrs}', '{/each}'],
      ['{#if open}{@const attrs = { "aria-expanded": true }}', '{/if}'],
    ]) {
      const bound = `${open}${pressed(' {...attrs} {...rest}')}${close}`;
      assert.deepEqual(spreadsOf(LITERAL, bound), followed(null), open);
    }
    for (const spread of ['{ "aria-expanded": open }', 'role.button', 'build()']) {
      const template = pressed(` {...${spread}} {...rest}`);
      assert.deepEqual(spreadsOf(BUILT, template), followed(null, 'an expression'), spread);
    }
  });

  it('reads a spread on either side of the rest, and no second spread of the rest itself', () => {
    const template = pressed(' {...attrs} {...rest} {...rest} {...build()}');
    assert.deepEqual(spreadsOf(`${BUILT} ${LITERAL}`, template), [
      { local: 'attrs', before: true, keys: ['type'] },
      { local: 'an expression', before: false, keys: null },
    ]);
    assert.equal(spreadKeys(templateOf('src/E.svelte', '<p></p>').ast, undefined), null);
  });

  it('follows the spread the shipped Button writes ahead of its rest', () => {
    const [{ spreads, handed }] = restElements(componentAstOf(entryNamed('Button').path));
    assert.deepEqual(
      spreads,
      followed(['href', 'target', 'rel', 'type', 'disabled'], 'attributes')
    );
    assert.deepEqual(handed, []);
  });

  const CANNOT_FOLLOW_SPREAD = (local) =>
    `a spread of ${local} sits on a control-landing rest element and the gate cannot follow it`;
  const HANDED = (what) =>
    `${what} hands a control-landing rest element to code the gate cannot follow`;
  const UNRESERVED = (name) =>
    `${name} is written before a control-landing rest and is not reserved`;
  /** The `restOn` faults of a control-landing entry whose script is `body` and whose button states `attributes`. */
  const controlFaultsOf = (body, attributes) =>
    restFaultsOf(pressed(attributes), 'control', `${SPREAD}${body}</script>`);
  const AHEAD = ' {...attrs} {...rest}';

  it('passes a control-landing rest behind a followed spread of no data-* name, or of a reserved one', () => {
    assert.deepEqual(
      controlFaultsOf('const attrs = { type: "button", disabled: open };', AHEAD),
      []
    );
    assert.deepEqual(controlFaultsOf('const attrs = { "data-action": role };', AHEAD), []);
    assert.deepEqual(
      controlFaultsOf('const attrs = { "data-state": role };', ' {...rest} {...attrs}'),
      [],
      'a data-* name written after the rest is the component’s to keep'
    );
  });

  for (const [claim, body, attributes, faults] of [
    [
      'a followed spread of an unreserved data-* name ahead of the rest',
      'const attrs = $derived(open ? { type: "button" } : { "data-state": role });',
      AHEAD,
      [UNRESERVED('data-state')],
    ],
    [
      'an attribute and a followed spread that each write one',
      'const attrs = { "data-state": role, "data-action": role };',
      ` data-open${AHEAD}`,
      [UNRESERVED('data-open'), UNRESERVED('data-state')],
    ],
    [
      'a spread it cannot follow ahead of the rest',
      `${BUILT} const attrs = build();`,
      AHEAD,
      [CANNOT_FOLLOW_SPREAD('attrs')],
    ],
    [
      'a spread it cannot follow behind the rest',
      `${BUILT} const attrs = build();`,
      ' {...rest} {...attrs}',
      [CANNOT_FOLLOW_SPREAD('attrs')],
    ],
    [
      'a spread of a call behind the rest',
      BUILT,
      ' {...rest} {...build()}',
      [CANNOT_FOLLOW_SPREAD('an expression')],
    ],
    ['an action', BUILT, ' use:build {...rest}', [HANDED('a use: action')]],
    ['an {@attach}', BUILT, ' {@attach build} {...rest}', [HANDED('an {@attach}')]],
    ['a transition', BUILT, ' transition:build {...rest}', [HANDED('a transition')]],
    ['an in: transition', BUILT, ' {...rest} in:build', [HANDED('a transition')]],
    ['an animate: directive', BUILT, ' animate:build {...rest}', [HANDED('an animate: directive')]],
  ]) {
    it(`names ${claim} as a fault of a control-landing rest`, () => {
      assert.deepEqual(controlFaultsOf(body, attributes), faults);
    });
  }

  it('judges none of them on an element that is no control', () => {
    const script = `${SPREAD}${BUILT}</script>`;
    const template = '<div data-open use:build {...build()} {...rest}></div>';
    assert.deepEqual(restFaultsOf(template, null, script), []);
  });

  const aria = { kind: 'aria' };
  const CONTROL = templateOf(
    'Control.svelte',
    `<script>let { label, 'aria-busy': busy, ...rest } = $props();</script>${pressed(' {...rest}')}`
  ).ast;
  const LANDING = { rest: true, restOn: 'control' };
  /** The declaration faults of `props` on an entry over a button, whose rest lands on it unless `landing` says otherwise. */
  const ariaFaultsOf = (props, landing = LANDING) =>
    declarationFaults({ props, ...landing }, CONTROL);
  const ARIA = (key, rule) => `${key} is an aria key ${rule}`;
  const NO_CONTROL = ARIA('aria-expanded', 'on an entry whose rest lands on no control');
  const MISSPELLED = (key) => `${key} is spelled as an ARIA attribute and is not an aria key`;

  it('passes an aria key spelled aria-<name> on an entry whose rest lands on a control, a held name included', () => {
    const published = { label: data, 'aria-expanded': aria, 'aria-describedby': aria };
    assert.deepEqual(ariaFaultsOf(published), []);
    assert.deepEqual(ariaFaultsOf({ 'aria-labelledby': aria }), [], 'held, and not never');
  });

  for (const [claim, props, landing, faults] of [
    [
      'an aria key spelled as a prop',
      { ariaExpanded: aria },
      LANDING,
      [ARIA('ariaExpanded', 'not spelled aria-<name>')],
    ],
    [
      'an aria key spelled in upper case',
      { 'aria-Expanded': aria },
      LANDING,
      [ARIA('aria-Expanded', 'not spelled aria-<name>')],
    ],
    [
      'an aria key the component declares',
      { 'aria-busy': aria },
      LANDING,
      [ARIA('aria-busy', 'the component declares as a prop')],
    ],
    [
      'an aria key that states required',
      { 'aria-expanded': { kind: 'aria', required: false } },
      LANDING,
      [ARIA('aria-expanded', 'that states required')],
    ],
    [
      'an aria key that states requiredWhen',
      { label: data, 'aria-expanded': { kind: 'aria', requiredWhen: 'label' } },
      LANDING,
      ['aria-expanded states requiredWhen, which no aria key takes'],
    ],
    [
      'an aria key on an entry with no restOn',
      { 'aria-expanded': aria },
      { rest: true },
      [NO_CONTROL],
    ],
    [
      'an aria key on an entry that takes no rest',
      { 'aria-expanded': aria },
      { rest: false, restOn: 'control' },
      [NO_CONTROL],
    ],
    [
      'element on an aria key',
      { 'aria-expanded': { kind: 'aria', element: 'div' } },
      LANDING,
      ['aria-expanded states element, which only a slot key takes'],
    ],
    [
      'args on an aria key',
      { 'aria-expanded': { kind: 'aria', args: 0 } },
      LANDING,
      ['aria-expanded states args, which only a callback key takes'],
    ],
    [
      'a data key spelled as an ARIA attribute',
      { 'aria-expanded': data },
      LANDING,
      [MISSPELLED('aria-expanded'), 'aria-expanded is not a declared prop'],
    ],
    [
      'a declared callback key spelled as one',
      { 'aria-busy': { kind: 'callback' } },
      LANDING,
      [MISSPELLED('aria-busy')],
    ],
  ]) {
    it(`names ${claim} as a fault`, () => {
      assert.deepEqual(ariaFaultsOf(props, landing), faults);
    });
  }

  for (const key of ['aria-pressed', 'aria-disabled', 'aria-hidden', 'aria-live', 'aria-owns']) {
    it(`names ${key} as an ARIA attribute the seam never publishes`, () => {
      assert.deepEqual(ariaFaultsOf({ [key]: aria }), [
        `${key} is an ARIA attribute the seam never publishes`,
      ]);
    });
  }

  const WRITTEN = 'aria-expanded is written by the component and published as an aria key';
  /**
   * The `restOn` faults of a control-landing entry publishing `keys` as `aria` keys, over a button
   * that states `attributes` and a local `attrs` whose one key is `spelled`.
   */
  const writtenFaultsOf = (attributes, keys, spelled = 'aria-expanded') => {
    const props = Object.fromEntries(keys.map((key) => [key, aria]));
    const entry = { path: 'src/E.svelte', ...LANDING, props };
    const script = `${SPREAD}const attrs = { "${spelled}": open };</script>`;
    return restOnFaults(entry, templateOf(entry.path, script + pressed(attributes)).ast);
  };

  for (const [claim, attributes, spelled] of [
    ['ahead of the rest', ' aria-expanded={open} {...rest}'],
    ['behind the rest', ' {...rest} aria-expanded={open}'],
    ['behind the rest in upper case', ' {...rest} ARIA-EXPANDED={open}'],
    ['as static text', ' aria-expanded="false" {...rest}'],
    ['through a followed spread ahead of the rest', ' {...attrs} {...rest}'],
    ['through a followed spread behind the rest', ' {...rest} {...attrs}'],
    [
      'through a followed spread that spells it in mixed case',
      ' {...rest} {...attrs}',
      'ARIA-Expanded',
    ],
  ]) {
    it(`names an aria key the component writes ${claim} as a fault, and none where the entry does not publish it`, () => {
      assert.deepEqual(writtenFaultsOf(attributes, ['aria-expanded'], spelled), [WRITTEN]);
      assert.deepEqual(writtenFaultsOf(attributes, ['aria-describedby'], spelled), []);
      assert.deepEqual(writtenFaultsOf(attributes, [], spelled), []);
    });
  }

  const faceRule = (value) =>
    ancestorDependencies(
      templateOf('Face.svelte', `<style>.a { font-family: ${value}; }</style>`).ast
    );

  for (const value of [
    'var(--font-primary)',
    'var(--font-primary, )',
    'var(--font-primary, var(--x))',
    'var(--font-body, var(--font-primary))',
  ]) {
    it(`refuses ${value}, which can go invalid with no Foundry variable`, () => {
      assert.deepEqual(faceRule(value), ['unguarded var(--font-primary)']);
    });
  }

  it('admits a --font-primary read whose fallback ends in a literal', () => {
    assert.deepEqual(faceRule('var(--font-body, var(--font-primary, sans-serif))'), []);
  });

  it('follows a re-export and a lazy import to a plain module that reads a Foundry global', () => {
    const reader = syntheticReader({
      'src/Entry.svelte':
        "<script>import { localize } from './bridge.js'; const lazy = () => import('./lazy.js');</script>{localize('a')}{lazy}",
      'src/bridge.js': "export { localize } from './localize.js'; export * from './star.js';",
      'src/localize.js': 'export const localize = (key) => globalThis.game?.i18n.localize(key);',
      'src/star.js': 'export const settle = () => Hooks.callAll("settle");',
      'src/lazy.js': 'export default () => window["canvas"].ready;',
    });
    assert.deepEqual(closureDependencies('src/Entry.svelte', reader), [
      'src/localize.js: reads game',
      'src/star.js: reads Hooks',
      'src/lazy.js: reads canvas',
    ]);
  });

  it('reports a Foundry global a component reads in its template or its script', () => {
    const reader = syntheticReader({
      'src/Template.svelte': "<p>{game.i18n.localize('a')}</p>",
      'src/Script.svelte':
        '<script>const id = foundry.utils.randomID(); ui.notifications.info(id);</script>',
    });
    assert.deepEqual(closureDependencies('src/Template.svelte', reader), [
      'src/Template.svelte: reads game',
    ]);
    assert.deepEqual(closureDependencies('src/Script.svelte', reader), [
      'src/Script.svelte: reads foundry',
      'src/Script.svelte: reads ui',
    ]);
  });

  for (const name of [
    'game',
    'foundry',
    'Hooks',
    'CONFIG',
    'CONST',
    'ui',
    'canvas',
    'fromUuid',
    'fromUuidSync',
    'getDocumentClass',
  ]) {
    it(`refuses a closure file that reads ${name}`, () => {
      const reader = syntheticReader({ 'src/E.svelte': `<script>const read = ${name};</script>` });
      assert.deepEqual(closureDependencies('src/E.svelte', reader), [
        `src/E.svelte: reads ${name}`,
      ]);
    });
  }

  it('reads a local binding and a member of the same name as no global', () => {
    const reader = syntheticReader({
      'src/Local.svelte':
        "<script>import { ui } from './local.js'; const game = { user: 1 };</script>{game.user}{ui.canvas}",
      'src/local.js': 'const game = { user: 1 }; export const ui = { canvas: game.user };',
    });
    assert.deepEqual(closureDependencies('src/Local.svelte', reader), []);
  });
});

const unsafeOf = (census) => census.filter(({ safe }) => !safe).map(({ selector }) => selector);

/** An entry's published keys and root, which a census of its root class pins. */
const publishedShapeOf = (name) => [Object.keys(entryNamed(name).props), entryNamed(name).root];

describe('the module sheet against the published Chip', () => {
  it('names the chip root in 15 selectors, none of which a published chip can match', () => {
    const selectors = stylesheetSources().parts.flatMap(({ file, text }) =>
      chipSelectors(file, text)
    );
    assert.deepEqual(
      selectors.filter(({ safe }) => !safe).map(({ selector }) => selector),
      []
    );
    // 16 at publication; issue 2512 deleted the routing chip's rule with its component.
    assert.equal(selectors.length, 15, 'the census the static Chip was published on');
    assert.deepEqual(
      Object.keys(PUBLISHED_COMPONENT_MANIFEST.find(({ name }) => name === 'Chip').props),
      ['tone', 'density', 'children'],
      'a published key that draws a classed child reopens cannotMatchPublished and fab-hit-area'
    );
  });

  const MANAGER = '.fabricate-manager';
  for (const [claim, selector] of [
    ['a class the published keys cannot write', `${MANAGER} .manager-chip.manager-tag-pill`],
    ['a published class beside an unwritable one', `${MANAGER} .manager-chip.is-list.is-empty`],
    ['the :disabled state', `${MANAGER} .manager-chip:disabled`],
    ['a classed glyph child', `${MANAGER} .manager-chip .fa-circle`],
    ['a pinned layout ancestor', `${MANAGER} .manager-vocabulary-row > .manager-chip`],
    ['another class that only starts with the root', `${MANAGER} .manager-chip-row`],
  ]) {
    it(`admits a selector that needs ${claim}`, () => {
      assert.deepEqual(unsafeChipSelectors('sheet.css', `${selector} { height: 30px }`), []);
    });
  }

  for (const selector of [
    `${MANAGER} .manager-chip`,
    `${MANAGER} .manager-chip.is-warning.is-list`,
    `${MANAGER} .manager-inspector .manager-chip`,
    `${MANAGER} .manager-chip > span`,
    `${MANAGER} .manager-chip ~ div > .manager-chip`,
    `${MANAGER} .manager-chip.is-row`,
    `${MANAGER} :is(.manager-chip.manager-tag-pill, .manager-pill)`,
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published chip`, () => {
      const css = `@media (width > 1px) { .manager-pill, ${selector} { height: 30px } }`;
      assert.deepEqual(unsafeChipSelectors('sheet.css', css), [`sheet.css: ${selector}`]);
    });
  }
});

describe('the module sheet and every component style against the published InspectorCard', () => {
  // Issue 2315 retired seven caller rules that restated or wrapped the card and added its `flush`
  // rule, so the census InspectorCard was published on, 23, is now 17.
  it('names the card root in 17 selectors: its two family rules, two data-hook rules, and thirteen no published card can match', () => {
    assert.ok(publishedManagerClasses().has('manager-chip'), 'the published closures were read');
    const selectors = shippedCensus(CARD, 'InspectorCard');
    assert.deepEqual(unsafeOf(selectors), [...CARD_FAMILY_RULES, ...CARD_DATA_HOOK_RULES]);
    assert.equal(selectors.length, 17, 'the census at issue 2315');
    assert.deepEqual(
      PUBLISHED_COMPONENT_MANIFEST.filter(({ root }) => root !== 'any').map(({ name }) => name),
      ['InspectorCard', 'Button', 'StatusToggle', 'Stepper', 'SearchField'],
      'an entry with a required root needs a census of its own'
    );
    assert.deepEqual(
      publishedShapeOf('InspectorCard'),
      [['children'], 'fabricate'],
      'a published key that writes a class, or a wider root, reopens cannotMatchPublished'
    );
  });

  const SPELLED = new Set(['manager-chip']);
  const unsafeCardSelectors = (css) => unsafeOf(syntheticCensus(CARD, css, { spelled: SPELLED }));

  for (const [claim, selector] of [
    ['a class no published key writes', '.fabricate-card.manager-checks-card'],
    ['a pinned ancestor', '.fabricate-manager .manager-checks-rail .fabricate-card'],
    ['the other pinned ancestor', '.manager-inspector > .fabricate-card'],
    [
      'a manager class no published closure spells, below',
      '.fabricate-card[data-x] .manager-unspelled',
    ],
    ['an unwritable class inside :global()', ':global(.fabricate-card.is-x > .fab-rail)'],
    ['another class that only starts with the root', '.fabricate .fabricate-card-row'],
  ]) {
    it(`admits a selector that needs ${claim}`, () => {
      assert.deepEqual(unsafeCardSelectors(`${selector} { gap: 0 }`), []);
    });
  }

  for (const [selector, flat = selector] of [
    ['.fabricate-card'],
    ['.fabricate .fabricate-card'],
    ['.fabricate-card .manager-chip'],
    ['.fabricate-card > .fab-rail'],
    ['.fabricate-card[data-x]'],
    ['.fabricate-card .is-open'],
    [':global(.fabricate-card[data-x])', '.fabricate-card[data-x]'],
    ['.a :global(.fabricate-card) > p', '.a .fabricate-card > p'],
    ['.manager-tools-authority-heading .fabricate-card'],
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published card or its content`, () => {
      assert.deepEqual(unsafeCardSelectors(`${selector} { gap: 0 }`), [`sheet.css: ${flat}`]);
    });
  }

  it('refuses the flush rule once a published key could write is-flush', () => {
    const css = '.fabricate-card.fabricate-card.is-flush { padding: 0 }';
    assert.deepEqual(
      unsafeCardSelectors(css),
      [],
      'flush is unpublished, so is-flush is unwritable'
    );
    const flushPublished = { ...CARD, writable: new Set(['is-flush']) };
    assert.deepEqual(unsafeOf(syntheticCensus(flushPublished, css, { spelled: SPELLED })), [
      'sheet.css: .fabricate-card.fabricate-card.is-flush',
    ]);
  });

  it('admits a class a published closure spells once the shape calls it undrawn', () => {
    const css = '.fabricate-card .manager-chip { gap: 0 }';
    const undrawn = { ...CARD, undrawn: new Set(['manager-chip']) };
    assert.deepEqual(unsafeCardSelectors(css), ['sheet.css: .fabricate-card .manager-chip']);
    assert.deepEqual(unsafeOf(syntheticCensus(undrawn, css, { spelled: SPELLED })), []);
  });
});

describe('the module sheet and every component style against the published EmptyState', () => {
  it('names the panel root in 3 selectors outside its own file, each under a pinned ancestor', () => {
    const selectors = shippedCensus(EMPTY, 'EmptyState');
    assert.deepEqual(unsafeOf(selectors), []);
    assert.equal(selectors.length, 3, 'the census EmptyState was published on');
    assert.deepEqual(
      publishedShapeOf('EmptyState'),
      [['icon', 'title', 'hint', 'filtered', 'children'], 'any'],
      'a published key that writes a class reopens cannotMatchPublished'
    );
  });

  const unsafe = (css) => unsafeOf(syntheticCensus(EMPTY, css));

  for (const [claim, selector] of [
    ['a state class no published key writes', '.manager-empty.is-compact'],
    [
      'the required-tools scroll above it',
      '.fabricate-manager .manager-task-required-tools-scroll > .manager-empty',
    ],
    ['the journal detail pane above it', '.journal-detail-pane > :global(.manager-empty)'],
    [
      'the scoped list inspector above it',
      '.manager-scoped-list-inspector-scroll.is-resting > :global(.manager-empty)',
    ],
  ]) {
    it(`admits a selector that needs ${claim}`, () => {
      assert.equal(syntheticCensus(EMPTY, `${selector} { flex: 1 }`).length, 1);
      assert.deepEqual(unsafe(`${selector} { flex: 1 }`), []);
    });
  }

  for (const selector of [
    '.manager-empty',
    '.manager-empty.is-filtered',
    '.manager-empty > div > p',
    '.manager-empty .companion-way-out',
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published panel or its content`, () => {
      assert.deepEqual(unsafe(`${selector} { flex: 1 }`), [`sheet.css: ${selector}`]);
    });
  }

  it('skips a scoped selector in the entry’s own file, and judges one :global reaches', () => {
    const own = { own: new Set(['sheet.css']) };
    const scoped = '.manager-empty p { margin: 0 }';
    assert.deepEqual(syntheticCensus(EMPTY, scoped, own), []);
    assert.deepEqual(unsafe(scoped), ['sheet.css: .manager-empty p'], 'judged in any other file');
    for (const css of [
      '.manager-empty :global(p) { margin: 0 }',
      ':global { .manager-empty p { margin: 0 } }',
    ]) {
      assert.deepEqual(unsafeOf(syntheticCensus(EMPTY, css, own)), ['sheet.css: .manager-empty p']);
    }
    for (const css of [
      '.manager-empty { :global(p) { margin: 0 } }',
      '.manager-empty { & :global(p) { margin: 0 } }',
      '.manager-empty { :global { p { margin: 0 } } }',
    ]) {
      assert.deepEqual(
        unsafeOf(syntheticCensus(EMPTY, css, own)),
        ['sheet.css: .manager-empty'],
        css
      );
    }
  });

  it('refuses a published chip under the panel, through the census every sheet is read by', () => {
    const { css } = templateOf(
      'sheet.css',
      '<style>.manager-empty .manager-chip { gap: 0 }</style>'
    ).ast;
    assert.deepEqual(unsafeOf(shippedCensus(EMPTY, 'EmptyState', [['sheet.css', css]])), [
      'sheet.css: .manager-empty .manager-chip',
    ]);
  });
});

describe('the module sheet and every component style against the published Notice', () => {
  it('names the notice root in 1 selector outside its own file, the pinned :has() rule, and its tone attribute in none', () => {
    const selectors = shippedCensus(NOTICE, 'Notice');
    assert.deepEqual(
      selectors.filter(({ safe }) => !safe).map(({ written }) => written),
      [...NOTICE_HAS_RULES]
    );
    assert.equal(selectors.length, 1, 'the census Notice was published on');
    const own = ownFilesOf('Notice');
    assert.deepEqual(
      everyStylesheet()
        .filter(([file]) => !own.has(file))
        .flatMap(([file, css]) => selectorsOnAttribute(file, css, 'data-notice-tone')),
      [],
      'no rule outside the notice styles it by the tone attribute it writes'
    );
    assert.deepEqual(
      publishedShapeOf('Notice'),
      [
        [
          'tone',
          'title',
          'detail',
          'icon',
          'action',
          'onAction',
          'dismissable',
          'dismissLabel',
          'onDismiss',
        ],
        'any',
      ],
      'a published key that writes a class reopens cannotMatchPublished'
    );
  });

  const unsafe = (css) => unsafeOf(syntheticCensus(NOTICE, css));

  it('admits a selector that needs a state class no published key writes', () => {
    assert.equal(syntheticCensus(NOTICE, '.fab-notice.is-compact { gap: 0 }').length, 1);
    assert.deepEqual(unsafe('.fab-notice.is-compact { gap: 0 }'), []);
  });

  for (const selector of [
    '.fab-notice',
    '.fab-notice.is-warning',
    '.fabricate .fab-notice .fab-notice-title',
    '.fab-notice > i',
    '.fab-notice.is-danger',
    '.fab-notice.is-info',
    '.fab-notice.is-success',
    '.fab-notice.is-accent',
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published notice or its parts`, () => {
      assert.deepEqual(unsafe(`${selector} { gap: 0 }`), [`sheet.css: ${selector}`]);
    });
  }

  it('fails closed on a root named only inside :has(), which only its written form spells', () => {
    const [{ selector, written, safe }, ...others] = syntheticCensus(
      NOTICE,
      '.a:has(.fab-notice) { padding: 0 }'
    );
    assert.deepEqual(
      [selector, written, safe, others.length],
      ['sheet.css: .a:has', 'sheet.css: .a:has(.fab-notice)', false, 0]
    );
  });

  it('names a selector that holds a data-notice-tone attribute, and no other', () => {
    const { css } = templateOf(
      'sheet.css',
      '<style>.a[data-notice-tone="warning"] .b, .c[data-notice] { gap: 0 }</style>'
    ).ast;
    assert.deepEqual(selectorsOnAttribute('sheet.css', css, 'data-notice-tone'), [
      'sheet.css: .a[data-notice-tone="warning"] .b',
    ]);
  });
});

/** Every selector with a bare `button` compound, over every stylesheet. */
const shippedBareButtons = () =>
  everyStylesheet().flatMap(([file, css]) =>
    bareButtonSelectors(file, css, BUTTON, BARE_BUTTON_ANCESTORS)
  );
const writtenOf = (census) => census.map(({ written }) => written).sort(byName);
const reachingOf = (census) => census.filter(({ safe }) => !safe);

describe('the module sheet and every component style against the published Button', () => {
  it('reaches a published button through 25 selectors: 21 that draw it, three it cannot match and one data-hook rule', () => {
    const census = shippedCensus(BUTTON, 'Button');
    assert.deepEqual(
      writtenOf(reachingOf(census)),
      [...BUTTON_FAMILY_RULES, ...BUTTON_UNMATCHED_RULES, ...BUTTON_DATA_HOOK_RULES].sort(byName)
    );
    const inPartials = census.filter(({ written }) => written.startsWith('styles/')).length;
    assert.ok(inPartials >= 100, `the partials were read: ${inPartials} selectors`);
    assert.ok(
      census.length - inPartials >= 15,
      `every component style was read: ${census.length - inPartials} selectors`
    );
    assert.deepEqual(
      staleAncestors(BUTTON, census, publishedManagerClasses()),
      [],
      'each pinned ancestor keeps at least one selector off a published button'
    );
    assert.deepEqual(
      publishedShapeOf('Button'),
      [
        [
          'role',
          'fullWidth',
          'disabled',
          'children',
          'onclick',
          'aria-expanded',
          'aria-describedby',
        ],
        'fabricate',
      ],
      'a published size, class or tag reopens the census'
    );
  });

  it('reads a shipped aria key or aria-pressed in eight selectors of any stylesheet, each kept off a published control', () => {
    const keys = PUBLISHED_COMPONENT_MANIFEST.flatMap((entry) => ariaKeysOf(entry));
    const names = [...new Set(keys)];
    assert.deepEqual(
      names,
      ['aria-expanded', 'aria-describedby', 'aria-labelledby'],
      'the aria keys the census reads'
    );
    const reading = [...names, 'aria-pressed'].flatMap((name) =>
      attributeSelectors(everyStylesheet(), name)
    );
    assert.deepEqual(
      reading.map(({ written }) => written),
      ARIA_KEY_SELECTORS.map(([written]) => written),
      'a rule that reads an aria key off an element restyles a published control a companion sets it on'
    );
    const shapes = [CHIP, CARD, EMPTY, NOTICE, BUTTON, TOGGLE];
    const pinned = new Set([
      ...shapes.flatMap((shape) => [...shape.ancestors]),
      ...BARE_BUTTON_ANCESTORS,
    ]);
    const spelled = publishedTokens();
    for (const [index, [written, kept]] of ARIA_KEY_SELECTORS.entries()) {
      assert.ok(
        keptOff(reading[index], kept, pinned, spelled),
        `${written} is kept off by ${kept}`
      );
    }
  });

  /** One `aria-pressed` reading of `rule`, as the ARIA census takes it. */
  const pressedReading = (rule) => {
    const { css } = templateOf('sheet.css', `<style>${rule} { gap: 0 }</style>`).ast;
    return attributeSelectors([['sheet.css', css]], 'aria-pressed')[0];
  };

  it('names as a bearer only a compound whose own element holds the attribute, not a :has() subject', () => {
    assert.deepEqual(pressedReading('.x:has([aria-pressed])').bearers, []);
    assert.deepEqual(pressedReading('.x:has(> .y[aria-pressed])').bearers, ['y']);
    assert.deepEqual(pressedReading('.x:not([aria-pressed])').bearers, ['x']);
  });

  it('keeps a row off by its bearer only when no published closure spells that class', () => {
    const spelled = publishedTokens();
    assert.ok(spelled.has('fabricate-toggle'), 'the switch spells its root class');
    const none = new Set();
    const reading = pressedReading('.fabricate-toggle[aria-pressed]');
    assert.ok(!keptOff(reading, 'fabricate-toggle', none, spelled), 'a spelled bearer is refused');
    const unspelled = pressedReading('.acme-row[aria-pressed]');
    assert.ok(keptOff(unspelled, 'acme-row', none, spelled), 'an unspelled bearer holds');
  });

  /**
   * Holds what `attributeSelectors` reads of `aria-expanded` in one sheet of `rules` to each rule's
   * stated `above`, `null` marking a rule it must not read.
   */
  const assertAbove = (rules) => {
    const written = rules.map(([rule]) => rule);
    const { css } = templateOf('sheet.css', `<style>${written.join(', ')} { gap: 0 }</style>`).ast;
    assert.deepEqual(
      attributeSelectors([['sheet.css', css]], 'aria-expanded').map(({ written, above }) => ({
        written,
        above,
      })),
      rules
        .filter(([, above]) => above !== null)
        .map(([rule, above]) => ({ written: `sheet.css: ${rule}`, above }))
    );
  };

  it('reads an attribute selector wherever a selector holds it, beside the classes above it', () => {
    assertAbove([
      [".fabricate [aria-expanded='true']", ['fabricate']],
      [
        '.fab-im-toolbar.is-open > :global(.fabricate-button[aria-expanded]) i',
        ['fab-im-toolbar', 'is-open'],
      ],
      ['.a:not([aria-expanded]) .b', []],
      ['[aria-expanded]', []],
      ['.c[aria-describedby]', null],
    ]);
  });

  it('reads an attribute name in any case and through a CSS escape, as HTML matches it', () => {
    assertAbove([
      [".d [ARIA-EXPANDED='true']", ['d']],
      [String.raw`.e [aria\-expanded]`, ['e']],
      [String.raw`.f [\41 ria-expanded]`, ['f']],
    ]);
  });

  it('counts as above only a class an ancestor of the attribute’s element must carry', () => {
    assertAbove([
      [':not(.fab-im-toolbar) .x[aria-expanded]', []],
      ['.g + .h ~ .i > .j .k[aria-expanded]', ['i', 'j']],
      [':is(.l, .m) :has(.n) :where(.o) :global(.p.q) .r[aria-expanded]', ['p', 'q']],
      [':global(.s .t) .u[aria-expanded]', []],
    ]);
  });

  it('draws a published button alike under any ancestor, with the module ring and no other', () => {
    const reaching = reachingOf(shippedCensus(BUTTON, 'Button'));
    assert.deepEqual(placementFaults(reaching, BUTTON, BUTTON_DATA_HOOK_RULES), []);
    assert.deepEqual(ringFaults(reaching, BUTTON), []);
  });

  it('holds the classes the census calls writable to the classes Button.svelte spells and a sheet rule names on the button', () => {
    const tokens = spelledStrings(entryNamed('Button').path, SHIPPED).flatMap((spelled) =>
      spelled.split(/\s+/)
    );
    const onRoot = new Set(
      shippedCensus(BUTTON, 'Button').flatMap(({ complex }) =>
        compoundsOf(complex)
          .map((compound) => classesOf(compound))
          .filter((classes) => classes.includes(BUTTON.root))
          .flat()
      )
    );
    assert.deepEqual(
      [...new Set(tokens)].filter((token) => onRoot.has(token)).sort(byName),
      [BUTTON.root, ...BUTTON.writable, ...UNPUBLISHED_BUTTON_CLASSES].sort(byName),
      'a class the file spells that a rule names on the button is writable, or pinned unpublished'
    );
  });

  it('reaches a published button through four bare button rules, and no other', () => {
    const census = shippedBareButtons();
    assert.deepEqual(writtenOf(reachingOf(census)), [...BARE_BUTTON_RULES].sort(byName));
    assert.ok(census.length >= 18, `the sheets were read: ${census.length} bare button selectors`);
    const live = new Set(census.flatMap(({ under }) => under));
    assert.deepEqual(
      [...BARE_BUTTON_ANCESTORS].filter((name) => !live.has(name)),
      [],
      'each pinned ancestor keeps at least one selector off a published button'
    );
  });

  it('reserves every data-* name a rule that reaches a published button reads, by its class or as a bare button', () => {
    const hooks = dataHooksOf([
      ...reachingOf(shippedCensus(BUTTON, 'Button')),
      ...reachingOf(shippedBareButtons()),
    ]);
    assert.deepEqual(
      hooks,
      ['data-essence-sort-direction', 'data-validation-focused'],
      'the hooks both censuses read at this head'
    );
    assert.deepEqual(
      hooks.filter((name) => !RESERVED_ON_A_CONTROL.test(name)),
      [],
      'a rest key of that name would take a rule of Fabricate’s, so M13 refuses it on a control'
    );
  });

  it('declares only the family floor in the Manager’s bare button rule, so both windows draw alike', () => {
    const floorOf = (census, written) =>
      census.filter((row) => row.written === written).map(({ rule }) => declarationsOf(rule));
    assert.deepEqual(floorOf(shippedBareButtons(), BARE_BUTTON_RULES.at(-1)), [
      [...MANAGER_BUTTON_FLOOR],
    ]);
    const family = 'styles/fabricate-manager-rail-gathering.css: .fabricate-button';
    assert.deepEqual(floorOf(shippedCensus(BUTTON, 'Button'), family), [[...MANAGER_BUTTON_FLOOR]]);
  });

  const SPELLED = new Set();
  const buttonCensus = (css) => syntheticCensus(BUTTON, css, { spelled: SPELLED });
  const reachingIn = (css) => writtenOf(reachingOf(buttonCensus(css)));

  for (const [claim, selector] of [
    ['a class no published key writes', '.fabricate-button.is-size-38'],
    ['the armed state, which no published key writes', '.fabricate-button.is-danger.is-armed'],
    ['a per-site class', '.fabricate-button.fabricate-button.manager-recipe-sort-direction'],
    ['a pinned ancestor', '.fabricate-manager .manager-knowledge-reset-actions .fabricate-button'],
    ['a classed child', '.fabricate-button .fa-plus'],
  ]) {
    it(`admits a selector that needs ${claim}`, () => {
      assert.equal(buttonCensus(`${selector} { gap: 0 }`).length, 1);
      assert.deepEqual(reachingIn(`${selector} { gap: 0 }`), []);
    });
  }

  for (const selector of [
    '.fabricate-button',
    '.fabricate-button.is-primary:not(:disabled):hover',
    '.fabricate-button:disabled',
    '.fabricate-manager .fabricate-button',
    '.fabricate-button > span',
    '.fabricate-button[data-x]',
    '.manager-tools-authority-heading .fabricate-button',
  ]) {
    it(`refuses ${selector}, which nothing keeps off a published button`, () => {
      assert.deepEqual(reachingIn(`${selector} { gap: 0 }`), [`sheet.css: ${selector}`]);
    });
  }

  it('reads :disabled as safe for a root no published key disables, and as reaching for the button', () => {
    const disabled = (shape) =>
      reachingOf(syntheticCensus(shape, `.${shape.root}:disabled { gap: 0 }`)).length;
    assert.equal(disabled(CHIP), 0);
    assert.equal(disabled(BUTTON), 1);
  });

  it('reaches through a class once a published key writes it', () => {
    const sized = { ...BUTTON, writable: new Set([...BUTTON.writable, 'is-size-38']) };
    const census = syntheticCensus(sized, '.fabricate-button.is-size-38 { gap: 0 }');
    assert.deepEqual(writtenOf(reachingOf(census)), ['sheet.css: .fabricate-button.is-size-38']);
  });

  it('names a pinned ancestor that keeps no selector off the button as stale', () => {
    const census = buttonCensus('.manager-knowledge-reset-actions .fabricate-button { gap: 0 }');
    const stale = staleAncestors(BUTTON, census, SPELLED);
    assert.equal(
      stale.includes('manager-knowledge-reset-actions'),
      false,
      'the one the selector names'
    );
    assert.equal(stale.length, BUTTON.ancestors.size - 1, 'every other is stale');
  });

  const MODULE_RING = `outline: ${moduleRing().outline}; outline-offset: ${moduleRing().offset};`;
  const FAMILY = [
    '.fabricate-button { font: inherit }',
    '.fabricate-button:focus { outline: none; box-shadow: none }',
    `.fabricate-button:focus-visible { ${MODULE_RING} }`,
  ].join(' ');
  const HOOK = 'sheet.css: .fabricate-manager .fabricate-button[data-hook]';
  /** The faults of the three clauses over the reaching set of `family` and `css`. */
  const clauseFaults = (css, family = FAMILY) => {
    const reaching = reachingOf(buttonCensus(`${family} ${css}`));
    return [...placementFaults(reaching, BUTTON, [HOOK]), ...ringFaults(reaching, BUTTON)];
  };

  it('admits beside the module ring exactly the ring extras a shape names, and no other declaration', () => {
    const extras = { ...BUTTON, ringExtras: [['box-shadow', 'none']] };
    const markWith = (more) => FAMILY.replace(`{ ${MODULE_RING} }`, `{ ${MODULE_RING} ${more} }`);
    const ringOf = (family, shape) => ringFaults(reachingOf(buttonCensus(family)), shape);
    const UNRINGED =
      'sheet.css: .fabricate-button:focus-visible does not declare exactly the module ring';
    assert.deepEqual(ringOf(markWith('box-shadow: none;'), extras), []);
    assert.deepEqual(
      ringOf(markWith('box-shadow: none;'), BUTTON),
      [UNRINGED],
      'not for a shape without'
    );
    assert.deepEqual(ringOf(markWith('box-shadow: 0 0 2px red;'), extras), [UNRINGED]);
    assert.deepEqual(ringOf(markWith('box-shadow: none; color: red;'), extras), [UNRINGED]);
    assert.deepEqual(ringOf(FAMILY, extras), [UNRINGED], 'an extra the rule does not declare');
  });

  it('passes a family of one-compound rules with one strip and one module ring', () => {
    assert.deepEqual(clauseFaults(''), []);
    assert.deepEqual(clauseFaults('@media (width > 1px) { .fabricate-button { gap: 0 } }'), []);
    assert.deepEqual(clauseFaults('@supports (gap: 0) { .fabricate-button { gap: 0 } }'), []);
    assert.deepEqual(
      clauseFaults('.fabricate-manager .fabricate-button[data-hook] { gap: 0 }'),
      [],
      'a pinned data-hook rule is not placed'
    );
  });

  for (const [claim, css, faults, family] of [
    [
      'a rule under an ancestor',
      '.fabricate-manager .fabricate-button { gap: 0 }',
      ["sheet.css: .fabricate-manager .fabricate-button has a compound above the root's own"],
    ],
    [
      'a rule inside @container',
      '@container fabricate-manager (width > 1px) { .fabricate-button.fabricate-button { gap: 0 } }',
      ['sheet.css: .fabricate-button.fabricate-button sits inside @container'],
    ],
    [
      'a rule inside @scope',
      '@scope (.fabricate-manager) { .fabricate-button.is-primary { gap: 0 } }',
      ['sheet.css: .fabricate-button.is-primary sits inside @scope'],
    ],
    [
      'a rule inside @layer',
      '@layer late { .fabricate-button.is-ghost { gap: 0 } }',
      ['sheet.css: .fabricate-button.is-ghost sits inside @layer'],
    ],
    [
      'a rule nested in another style rule',
      '.wrap { .fabricate-button.is-ghost { gap: 0 } }',
      ['sheet.css: .fabricate-button.is-ghost sits inside rule'],
    ],
    [
      'a :focus-visible rule that strips the ring',
      '',
      ['sheet.css: .fabricate-button:focus-visible does not declare exactly the module ring'],
      FAMILY.replace(MODULE_RING, 'outline: none'),
    ],
    [
      'a second :focus-visible rule',
      `.fabricate-button.is-ghost:focus-visible { ${MODULE_RING} }`,
      ['2 reaching selectors carry :focus-visible'],
    ],
    [
      'no :focus-visible rule',
      '',
      ['0 reaching selectors carry :focus-visible'],
      FAMILY.replace(`.fabricate-button:focus-visible { ${MODULE_RING} }`, ''),
    ],
    [
      'a :focus rule that is not the strip',
      '',
      ['sheet.css: .fabricate-button:focus is not the strip'],
      FAMILY.replace('box-shadow: none', 'color: red'),
    ],
    [
      'a role rule that draws a shadow',
      '.fabricate-button.is-primary { box-shadow: 0 0 2px red }',
      ['sheet.css: .fabricate-button.is-primary declares box-shadow'],
    ],
    [
      'a role rule that states an outline longhand',
      '.fabricate-button.is-ghost:not(:disabled) { outline-width: 0 }',
      ['sheet.css: .fabricate-button.is-ghost:not(:disabled) declares outline-width'],
    ],
    [
      'a rule that resets all',
      '.fabricate-button.is-dashed { all: unset }',
      ['sheet.css: .fabricate-button.is-dashed declares all'],
    ],
  ]) {
    it(`names ${claim} as a fault of the reaching set`, () => {
      assert.deepEqual(clauseFaults(css, family), faults);
    });
  }

  const bareIn = (css, file = 'sheet.css') =>
    bareButtonSelectors(
      file,
      templateOf(file, `<style>${css}</style>`).ast.css,
      BUTTON,
      BARE_BUTTON_ANCESTORS
    );

  it('admits a bare button under a pinned ancestor, and reads none a class keeps off the button', () => {
    const [tab, ...others] = bareIn(
      '.fabricate-tabs button, .fabricate-app button.active { gap: 0 }'
    );
    assert.deepEqual(
      [tab.written, tab.safe, tab.under, others.length],
      ['sheet.css: .fabricate-tabs button', true, ['fabricate-tabs'], 0]
    );
    assert.deepEqual(bareIn('.a button.manager-row:hover > i { gap: 0 }'), []);
  });

  for (const selector of [
    '.fabricate-app .window-content button',
    'button',
    '.companion-host button > span',
    '.fabricate-manager button.is-primary',
    '.fabricate :is(button, a)',
  ]) {
    it(`names ${selector}, which no pinned ancestor keeps off a published button`, () => {
      assert.deepEqual(writtenOf(reachingOf(bareIn(`${selector} { gap: 0 }`))), [
        `sheet.css: ${selector}`,
      ]);
    });
  }

  it('reads a data-* hook wherever a reaching selector holds it, inside :not() included', () => {
    const classed = buttonCensus('.fabricate-button[data-x]:not([data-y="1"]) { gap: 0 }');
    assert.deepEqual(dataHooksOf(reachingOf(classed)), ['data-x', 'data-y']);
    const bare = bareIn('.fabricate button[data-z], .fabricate-tabs button[data-tab] { gap: 0 }');
    assert.deepEqual(dataHooksOf(reachingOf(bare)), ['data-z'], 'a pinned ancestor keeps one off');
    assert.equal(RESERVED_ON_A_CONTROL.test('data-x'), false, 'so a new hook reds the clause');
  });

  it('reads a component’s bare button rule only where :global reaches it', () => {
    const file = 'src/Host.svelte';
    assert.deepEqual(bareIn('.host button { gap: 0 }', file), []);
    assert.deepEqual(writtenOf(reachingOf(bareIn('.host :global(button) { gap: 0 }', file))), [
      `${file}: .host :global(button)`,
    ]);
  });
});

describe('the DOM reads of a published ARIA attribute', () => {
  /** What `attributeReads` names of `aria-labelledby` in one file of `source`. */
  const readsIn = (file, source) => {
    const ast = isComponent(file) ? templateOf(file, source).ast : parseModule(source).ast;
    return attributeReads([[file, ast]], ['aria-labelledby']);
  };

  for (const [claim, file, source, read] of [
    [
      'a selector a module passes closest',
      'src/a.js',
      "el.closest('[aria-labelledby]');",
      'closest([aria-labelledby])',
    ],
    [
      'an optional call',
      'src/a.js',
      "el?.closest?.('[aria-labelledby]');",
      'closest([aria-labelledby])',
    ],
    [
      'an attribute in upper case',
      'src/a.js',
      "el.getAttribute('ARIA-LABELLEDBY');",
      'getAttribute(ARIA-LABELLEDBY)',
    ],
    [
      'a selector with a value',
      'src/a.js',
      'el.matches(\'[aria-labelledby="x"]\');',
      'matches([aria-labelledby="x"])',
    ],
    [
      'a template literal',
      'src/a.js',
      'el.querySelectorAll(`b[aria-labelledby]`);',
      'querySelectorAll(b[aria-labelledby])',
    ],
    [
      'a template handler',
      'src/E.svelte',
      '<button onclick={(event) => event.currentTarget.hasAttribute("aria-labelledby")}>x</button>',
      'hasAttribute(aria-labelledby)',
    ],
    [
      'a component script',
      'src/E.svelte',
      "<script>const named = (el) => el.querySelector('[aria-labelledby]');</script>",
      'querySelector([aria-labelledby])',
    ],
  ]) {
    it(`names ${claim}`, () => {
      assert.deepEqual(readsIn(file, source), [`${file}: ${read}`]);
    });
  }

  for (const [claim, source] of [
    ['a write', "el.setAttribute('aria-labelledby', 'x');"],
    ['another attribute', "el.closest('[aria-label]'); el.getAttribute('aria-labelledby-x');"],
    ['a call on no member', "closest('[aria-labelledby]');"],
    [
      'a selector held in a local, which it does not see',
      "const S = '[aria-labelledby]'; el.closest(S);",
    ],
  ]) {
    it(`names no read for ${claim}`, () => {
      assert.deepEqual(readsIn('src/a.js', source), []);
    });
  }

  it('reads a getAttribute call inside an it or test body, and none in a refusal or outside a clause', () => {
    const { ast } = parseModule(
      [
        "describe('x', () => {",
        "  const outside = node.getAttribute('aria-busy');",
        "  it('reads', () => { assert.equal(button().getAttribute('aria-labelledby'), 'x'); });",
        "  it('refuses', () => { assertRefused({ 'aria-describedby': null }); });",
        "  test('reads too', async () => node?.getAttribute?.('aria-controls'));",
        '});',
      ].join('\n')
    );
    assert.deepEqual(attributesReadInClauses(ast), ['aria-controls', 'aria-labelledby']);
  });

  it('reads no getAttribute call in a clause that it or a describe around it skips', () => {
    const { ast } = parseModule(
      [
        "describe.skip('x', () => { it('a', () => node.getAttribute('aria-busy')); });",
        "describe('y', { skip: true }, () => { it('b', () => node.getAttribute('aria-owns')); });",
        "it.skip('c', () => node.getAttribute('aria-live'));",
        "it('d', { skip: 'later' }, () => node.getAttribute('aria-atomic'));",
        "test('e', { todo: true }, () => node.getAttribute('aria-details'));",
        "it('f', { skip: false }, () => node.getAttribute('aria-controls'));",
      ].join('\n')
    );
    assert.deepEqual(attributesReadInClauses(ast), ['aria-controls']);
  });
});
