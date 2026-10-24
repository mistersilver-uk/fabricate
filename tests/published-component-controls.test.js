/**
 * What a published entry that draws a control must hold (issue 2452), over the files each entry's
 * drawn closure reaches (`helpers/publishedClosureDrawn.js`): every `callback` key is called from
 * an admitted event handler, and every `value` key is written only from one (issue 2453); every
 * focusable element is pinned to the published key that draws it, to `'always'`, to the defaults
 * of props the entry does not publish, or to `null`; a reached one draws its own mark for keyboard
 * focus and is named by the companion; an entry that publishes `aria-labelledby` names each
 * reached control by a required key; a closure that takes a window's ring states no focus rule of
 * its own but the pinned scoped rings, and its reached control no inline style; and no rule
 * outside the published `Notice` styles its buttons. A control pinned to its guard key is named by
 * that key, a required key or a key `requiredWhen` that guard.
 * The test-only probe runs beside the shipped entries. A key's kind and `args` are
 * `published-component-manifest.test.js`'s.
 * Limit: reach follows a guard through a plain `const` and `$derived` to the props it reads; a
 * guard it cannot follow faults a defaults pin only, so a `null` or key pin under a `$state` guard
 * is judged by the names it can follow.
 * Limit: the focus mark reads declarations; the computed half is `notice-mounted.test.js`'s. A mark
 * that is not an outline is refused.
 * Limit: a `svelte:element` is judged by its pinned tags, which that gate holds to its file and to
 * what each closure file passes it; the `type` of a dynamic button is
 * `components/published-button-mounted.test.js`'s.
 * Limit: a value write is an assignment, an update, a `for…of` or `for…in` head or a `bind:`
 * directive naming the key's own local, so a write through an alias or a shadowing name is not
 * seen.
 * Limit: an event beyond `CALLBACK_EVENTS` is admitted only on the tag its entry's `ENTRY_EVENTS`
 * row names; which keys the handler acts on is that row's mounted clause's.
 * Limit: a script function counts as an event's only when it is a top-level declaration or `const`
 * function every reference to which is an admitted attribute's value, a call inside one, or a
 * call inside another such function; inside one, a deferred call is not seen. A callback handed
 * to a child component fails closed unless `FORWARDED_CALLBACKS` pins it; an exported function and
 * one also called from `onMount` fail closed.
 * Limit: a scoped ring pin is matched by its selector as written, and judged by its declarations.
 * Limit: a name is read from the element's own `aria-label` or content, a `const` or `$derived`
 * local followed through its value operands, and not from a child element or `aria-labelledby`;
 * whether a name is drawn in every state is the mounted suite's; a control in a closure file other
 * than the entry's is named by its `CLOSURE_NAMES` pin, and one of the entry's own file named
 * through an item it cannot follow by its `OWN_NAMES` pin, which the mounted suite holds; one in
 * another published entry's own file is judged by its `NESTED_NAMES` row, and its key pin under
 * that entry alone (issue 2646).
 * Limit: a closure control two entries reach may take a `{ byEntry }` row, which `pinsFor` resolves
 * for each, and a `class:` directive or `style` attribute the drawn closure holds falsy draws
 * nothing (issue 2647).
 * Limit: whether a control draws text of its own follows the snippets its file defines, counts a
 * child component as text, and holds off only an `{#if}` on an unpublished prop at a falsy default.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { PUBLISHED_COMPONENT_MANIFEST } from '../src/ui/publishedComponentManifest.js';

import { PROBE_ENTRY } from './fixtures/published-components/probeEntry.js';
import { templateOf } from './helpers/apiConvention.js';
import { literalStrings, walkNodes, walkWithAncestors } from './helpers/moduleAst.js';
import { drawnClosure, drawsNode, heldFalsy } from './helpers/publishedClosureDrawn.js';
import {
  DYNAMIC_ELEMENTS,
  SHIPPED,
  attributeOf,
  byName,
  declarationsOf,
  drawsOwnText,
  everyStylesheet,
  focusableElements,
  followedProps,
  importClosure,
  isComponent,
  isControlTag,
  isStrip,
  moduleRing,
  nameSources,
  propLocals,
  publishedLocals,
  sameDeclarations,
  selectorsNaming,
  selectorsOnAttribute,
  staticText,
  syntheticReader,
  unheldClauses,
  writtenSelector,
} from './helpers/publishedComponentGate.js';
import { repoRoot } from './helpers/sourceScan.js';
import { styleRules } from './helpers/svelteStructureContract.js';

const ENTRIES = Object.freeze([...PUBLISHED_COMPONENT_MANIFEST, PROBE_ENTRY]);

/**
 * One entry's flat view of a `FOCUSABLE_REACH` or `CLOSURE_NAMES` table: a `{ byEntry }` row gives
 * that entry's pin, which gains `entry` when it is an object, or nothing.
 */
function pinsFor(entry, table) {
  const view = {};
  for (const [id, pin] of Object.entries(table)) {
    if (!pin?.byEntry) view[id] = pin;
    else if (Object.hasOwn(pin.byEntry, entry.name)) {
      const own = pin.byEntry[entry.name];
      view[id] = own && typeof own === 'object' ? { ...own, entry: entry.name } : own;
    }
  }
  return view;
}

/** Every pin a table holds, a `{ byEntry }` row's each, with the entry a by-entry pin is for. */
const flatPins = (table) =>
  Object.entries(table).flatMap(([id, pin]) =>
    pin?.byEntry
      ? Object.entries(pin.byEntry).map(([entry, own]) => ({ id, pin: own, entry }))
      : [{ id, pin, entry: pin?.entry }]
  );

/**
 * Each focusable element the shipped closures draw, by file and static hook: the published key
 * whose guard draws it, `'always'` for one no guard hides, `{ defaults, heldBy }` for one drawn
 * while each prop of `defaults`, which the entry does not publish, keeps its default, `heldBy`
 * naming the mounted clause that holds it, or `null` for one no published key reaches; a file two
 * entries reach may take a `{ byEntry }` row of each one's pin, resolved by `pinsFor` (issue 2647).
 */
const FOCUSABLE_REACH = Object.freeze({
  'src/ui/svelte/components/Button.svelte: svelte:element': 'always',
  // The picker's own trigger, its `trigger` snippet, which no guard hides.
  'src/ui/svelte/components/IconPicker.svelte: button': 'always',
  // Under `removeControl`, a derived of three props the entry does not publish.
  'src/ui/svelte/components/Chip.svelte: button[data-chip-remove]': null,
  // One tab button for each item of `tabs`.
  'src/ui/svelte/components/EditorTabs.svelte: button': 'tabs',
  'src/ui/svelte/components/IconButton.svelte: button': 'always',
  'src/ui/svelte/components/Notice.svelte: button[data-notice-action]': 'action',
  'src/ui/svelte/components/Notice.svelte: button[data-notice-dismiss]': 'dismissable',
  // One radio for each item of `options`.
  'src/ui/svelte/components/RadioCardGroup.svelte: input': 'options',
  // The picker's own trigger, past every trigger form `Select` does not pass; `IconPicker` passes
  // its own `trigger` snippet.
  'src/ui/svelte/components/SearchablePopover.svelte: button': {
    byEntry: {
      Select: {
        defaults: [
          'anchor',
          'inlineSearchTrigger',
          'open',
          'trigger',
          'triggerButton',
          'triggerChip',
        ],
        heldBy:
          'tests/components/published-select-mounted.test.js: the published Select draws its trigger alone',
      },
      IconPicker: null,
    },
  },
  // The inline query and its close control, under `inlineSearchTrigger`, which `Select` does not pass.
  'src/ui/svelte/components/SearchablePopover.svelte: button[data-picker-inline-close]': null,
  'src/ui/svelte/components/SearchablePopover.svelte: input': null,
  // The panel and its rows, which its own file draws unguarded; the query field, under `showSearch`,
  // which `Select` turns off and `IconPicker` keeps at its default.
  'src/ui/svelte/components/SearchablePopoverPanel.svelte: div': 'always',
  'src/ui/svelte/components/SearchablePopoverPanel.svelte: button': 'always',
  'src/ui/svelte/components/SearchablePopoverPanel.svelte: input': {
    byEntry: {
      Select: null,
      IconPicker: {
        defaults: ['inlineSearchTrigger', 'showSearch'],
        heldBy:
          'tests/components/published-icon-picker-mounted.test.js: the published IconPicker opens its list',
      },
    },
  },
  // In the `control` snippet, which both branches of `{#if label}` render.
  'src/ui/svelte/components/SearchField.svelte: input': 'always',
  // One radio for each item of `options`.
  'src/ui/svelte/components/SegmentedControl.svelte: input': 'options',
  'src/ui/svelte/components/StatusToggle.svelte: button': {
    defaults: ['as'],
    heldBy:
      'tests/components/published-toggle-mounted.test.js: the default draws the button host alone',
  },
  // Drawn only when `as`, which the entry does not publish, is `'checkbox'`.
  'src/ui/svelte/components/StatusToggle.svelte: input': null,
  // In snippets both branches of `{#if isVertical}` render, which reach reads as unguarded.
  'src/ui/svelte/components/Stepper.svelte: button[data-stepper-decrement]': 'always',
  'src/ui/svelte/components/Stepper.svelte: button[data-stepper-increment]': 'always',
  'src/ui/svelte/components/Stepper.svelte: input[data-stepper-input][type="number"]': {
    defaults: ['formatValue', 'parseValue'],
    heldBy:
      'tests/components/published-stepper-mounted.test.js: the default draws the number field',
  },
  // The formatted mode's, drawn only when `formatValue` and `parseValue`, which the entry does not publish, are set.
  'src/ui/svelte/components/Stepper.svelte: input[data-stepper-input][type="text"]': null,
  'tests/fixtures/published-components/PublishedProbe.svelte: button[data-probe-press]': 'always',
  'tests/fixtures/published-components/PublishedProbe.svelte: input[data-probe-count]': 'always',
  'tests/fixtures/published-components/PublishedProbe.svelte: input[data-probe-query]': 'always',
});

/**
 * The reached controls of a closure file other than the entry's own, by id: the published keys
 * whose text names it, which the gate does not follow across files, or the group sentence that
 * states its `vocabulary`, and the mounted clause that reads its accessible name; a control two
 * entries reach takes a `{ byEntry }` row (issue 2647).
 */
const CLOSURE_NAMES = Object.freeze({
  'src/ui/svelte/components/SearchablePopover.svelte: button': {
    entry: 'Select',
    keys: ['ariaLabel'],
    heldBy: 'tests/components/published-select-mounted.test.js: the published Select names',
  },
  'src/ui/svelte/components/SearchablePopoverPanel.svelte: div': {
    byEntry: {
      Select: {
        keys: ['ariaLabel'],
        heldBy: 'tests/components/published-select-mounted.test.js: the published Select names',
      },
      IconPicker: {
        keys: ['listLabel'],
        heldBy:
          'tests/components/published-icon-picker-mounted.test.js: the published IconPicker names',
      },
    },
  },
  // `Select`'s, each row's `label` member, which the entry's group states is required;
  // `IconPicker`'s, each glyph's vocabulary label, which its group states.
  'src/ui/svelte/components/SearchablePopoverPanel.svelte: button': {
    byEntry: {
      Select: {
        keys: ['options'],
        heldBy: 'tests/components/published-select-mounted.test.js: the published Select names',
      },
      IconPicker: {
        vocabulary:
          "Each row is named by its glyph's `label`, as `game.fabricate.listCuratedIcons()` answers it on the same client, which is English and is not localized.",
        heldBy:
          'tests/components/published-icon-picker-mounted.test.js: the published IconPicker names',
      },
    },
  },
  'src/ui/svelte/components/SearchablePopoverPanel.svelte: input': {
    entry: 'IconPicker',
    keys: ['searchLabel'],
    heldBy:
      'tests/components/published-icon-picker-mounted.test.js: the published IconPicker names',
  },
});

/**
 * The reached controls of an entry's own file whose name the gate cannot follow, by id: the
 * published keys whose items' text names it, and the mounted clause that reads its accessible name.
 */
const OWN_NAMES = Object.freeze({
  // `ariaLabel`, through the `$derived` that falls back to Fabricate's own copy.
  'src/ui/svelte/components/IconPicker.svelte: button': {
    entry: 'IconPicker',
    keys: ['ariaLabel'],
    heldBy:
      'tests/components/published-icon-picker-mounted.test.js: the published IconPicker names',
  },
  // Each tab's `label`, which the entry's group states is required; its `aria-label` is written
  // only under props the entry does not publish.
  'src/ui/svelte/components/EditorTabs.svelte: button': {
    entry: 'EditorTabs',
    keys: ['tabs'],
    heldBy:
      'tests/components/published-editor-tabs-mounted.test.js: the published EditorTabs names',
  },
  // Each option's `label`, which the entry's group states is required, through the radio's
  // `aria-labelledby`.
  'src/ui/svelte/components/RadioCardGroup.svelte: input': {
    entry: 'RadioCardGroup',
    keys: ['options'],
    heldBy:
      'tests/components/published-radio-card-group-mounted.test.js: the published RadioCardGroup names',
  },
  // Each option's `label`, which the entry's group states is required, through the radio's
  // wrapping `<label>`.
  'src/ui/svelte/components/SegmentedControl.svelte: input': {
    entry: 'SegmentedControl',
    keys: ['options'],
    heldBy:
      'tests/components/published-segmented-control-mounted.test.js: the published SegmentedControl names',
  },
});

/**
 * The reached controls an entry draws from another published entry's own file, by entry then id:
 * the drawing entry's required `data` keys that feed the control's name, which the gate does not
 * follow across files, and the mounted clause that reads its accessible name (issue 2646).
 */
const NESTED_NAMES = Object.freeze({
  Pagination: {
    'src/ui/svelte/components/IconButton.svelte: button': {
      keys: ['previousLabel', 'nextLabel'],
      heldBy:
        'tests/components/published-pagination-mounted.test.js: the published Pagination names',
    },
    // Each size's numeral, from the sizes offered and the size shown.
    'src/ui/svelte/components/SegmentedControl.svelte: input': {
      keys: ['pageSizeOptions', 'pageSize'],
      heldBy:
        'tests/components/published-pagination-mounted.test.js: the published Pagination names',
    },
  },
});

/**
 * The callback keys an entry hands a closure child as the child's own callback, which the gate
 * does not follow into the child: the script function, or the list of them, that calls the key,
 * the child's prop each is passed as, and the mounted clause that operates the child by pointer
 * and by key.
 */
const FORWARDED_CALLBACKS = Object.freeze({
  Select: {
    onChange: {
      by: 'choose',
      as: 'onSelect',
      heldBy: 'tests/components/published-select-mounted.test.js: a choice in the published Select',
    },
  },
  IconPicker: {
    onChange: {
      by: 'selectIcon',
      as: 'onSelect',
      heldBy:
        'tests/components/published-icon-picker-mounted.test.js: a choice in the published IconPicker',
    },
  },
  Pagination: {
    onPageChange: {
      by: ['previousPage', 'nextPage'],
      as: 'onclick',
      heldBy:
        'tests/components/published-pagination-mounted.test.js: a page turn in the published Pagination',
    },
    onPageSizeChange: {
      by: 'changePageSize',
      as: 'onChange',
      heldBy:
        'tests/components/published-pagination-mounted.test.js: a page-size choice in the published Pagination',
    },
  },
});

/** The controls drawn unguarded and named by an optional key: the probe's, which mounts unlabelled. */
const OPTIONAL_NAME_PINS = Object.freeze([
  'tests/fixtures/published-components/PublishedProbe.svelte: button[data-probe-press]',
  'tests/fixtures/published-components/PublishedProbe.svelte: input[data-probe-count]',
  'tests/fixtures/published-components/PublishedProbe.svelte: input[data-probe-query]',
]);

const OUTSIDE_AN_EVENT = 'is a callback key referenced outside an event handler';
const NOTHING_CALLS = 'is a callback key nothing calls';

/** The only keys referenced outside an event handler: the probe's, which exist to prove why. */
const CALLED_OUTSIDE_AN_EVENT = Object.freeze({
  // An effect reads `$derived(onPing)`, and another calls `$derived(onPick)`.
  PublishedProbe: [`onPing ${OUTSIDE_AN_EVENT}`, `onPick ${OUTSIDE_AN_EVENT}`],
});

const isFunction = (node) =>
  node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression';

/** The template nodes that draw one DOM element, so an `on…` attribute on one is an event listener. */
const DOM_ELEMENTS = new Set(['RegularElement', 'SvelteElement']);
/**
 * The events a published callback is called from, by attribute, beside the one tag each is
 * admitted on or `null` for any: a press acts as a `click`, never on pointer down, and an
 * `<input>` reports an edit, a key and losing focus.
 */
const CALLBACK_EVENTS = Object.freeze({
  onclick: null,
  oninput: 'input',
  onblur: 'input',
  onkeydown: 'input',
});

/**
 * The events an entry's group names beyond `CALLBACK_EVENTS`, by entry: each attribute with the
 * one tag it is admitted on there, and the mounted clause that presses the keys the group names.
 */
const ENTRY_EVENTS = Object.freeze({
  EditorTabs: {
    onkeydown: {
      tag: 'button',
      heldBy:
        'tests/components/published-editor-tabs-mounted.test.js: the keyboard on the published EditorTabs',
    },
  },
  RadioCardGroup: {
    onchange: {
      tag: 'input',
      heldBy:
        'tests/components/published-radio-card-group-mounted.test.js: the keyboard on the published RadioCardGroup',
    },
  },
  SegmentedControl: {
    onchange: {
      tag: 'input',
      heldBy:
        'tests/components/published-segmented-control-mounted.test.js: the keyboard on the published SegmentedControl',
    },
  },
});

/**
 * Whether a reference is an admitted event attribute's whole value on a DOM element, or inside a
 * function that is; `extra` is the entry's `ENTRY_EVENTS` row.
 */
function isEventReference(ancestors, extra = {}) {
  const admitted = (name) => Object.hasOwn(CALLBACK_EVENTS, name) || Object.hasOwn(extra, name);
  const at = ancestors.findLastIndex(
    (ancestor) => ancestor.type === 'Attribute' && admitted(ancestor.name)
  );
  if (at < 1 || !DOM_ELEMENTS.has(ancestors[at - 1].type)) return false;
  const { name } = ancestors[at];
  const element = ancestors[at - 1].name;
  const only = CALLBACK_EVENTS[name];
  if (only !== null && only !== element && extra[name]?.tag !== element) return false;
  const [tag, value] = ancestors.slice(at + 1);
  return tag?.type === 'ExpressionTag' && (value === undefined || isFunction(value));
}

/** Each top-level function of the instance script, a declaration or a `const` arrow or function, by name. */
function scriptFunctions(ast) {
  const functions = new Map();
  for (const statement of ast.instance?.content.body ?? []) {
    if (statement.type === 'FunctionDeclaration') functions.set(statement.id.name, statement);
    if (statement.type !== 'VariableDeclaration' || statement.kind !== 'const') continue;
    for (const { id, init } of statement.declarations) {
      if (id.type === 'Identifier' && isFunction(init)) functions.set(id.name, init);
    }
  }
  return functions;
}

/**
 * Where one reference to a script function sits: an admitted event attribute's whole value or a
 * call inside one (`'entry'`), a call inside a script function (that function's name), or else
 * `'other'`.
 */
function functionSite(node, ancestors, bodies, extra) {
  const parent = ancestors.at(-1);
  const called = parent?.type === 'CallExpression' && parent.callee === node;
  if (isEventReference(ancestors, extra)) {
    return parent?.type === 'ExpressionTag' || called ? 'entry' : 'other';
  }
  const body = ancestors.findLast((ancestor) => bodies.has(ancestor));
  return called && body ? bodies.get(body) : 'other';
}

/** Every reference's `functionSite`, by the script function it names; a declaring name is none. */
function functionReferences(ast, functions, extra) {
  const bodies = new Map([...functions].map(([name, node]) => [node, name]));
  const found = new Map([...functions.keys()].map((name) => [name, []]));
  for (const root of [ast.module, ast.instance, ast.fragment]) {
    walkWithAncestors(root, (node, ancestors) => {
      if (node.type !== 'Identifier' || !found.has(node.name)) return;
      const parent = ancestors.at(-1);
      const declares = parent?.id === node;
      const member = parent?.type === 'MemberExpression' && parent.property === node;
      if (declares || (member && !parent.computed)) return;
      found.get(node.name).push(functionSite(node, ancestors, bodies, extra));
    });
  }
  return found;
}

/**
 * The script functions only events reach, by node: the greatest set none of whose members is
 * referenced but as an event entry or a call from a member, then those of it an entry reaches.
 */
function eventOnlyFunctions(ast, extra) {
  const functions = scriptFunctions(ast);
  const references = functionReferences(ast, functions, extra);
  const kept = new Set(references.keys());
  let changed = true;
  while (changed) {
    changed = false;
    for (const name of kept) {
      const sites = references.get(name);
      if (sites.every((site) => site === 'entry' || kept.has(site))) continue;
      kept.delete(name);
      changed = true;
    }
  }
  const live = new Set([...kept].filter((name) => references.get(name).includes('entry')));
  for (let grown = true; grown; ) {
    grown = false;
    for (const name of kept) {
      if (live.has(name) || references.get(name).every((site) => !live.has(site))) continue;
      live.add(name);
      grown = true;
    }
  }
  return new Set([...live].map((name) => functions.get(name)));
}

const CALLS = new Set(['CallExpression', 'NewExpression', 'TaggedTemplateExpression']);

/** Whether a reference is read in the test of an `{#if}`, neither called there nor handed to a call. */
function isGuardRead(node, ancestors) {
  const at = ancestors.findLastIndex((ancestor) => ancestor.type === 'IfBlock');
  if (at === -1) return false;
  const path = [...ancestors.slice(at + 1), node];
  if (path[0] !== ancestors[at].test) return false;
  return path.every((step) => !CALLS.has(step.type));
}

/**
 * Where each reference to `local` sits: `'event'` in an admitted event attribute or a script
 * function only events reach, `'guard'` or `'other'`; its own declaration is none.
 */
function referenceSites(ast, local, extra) {
  const sites = [];
  const live = eventOnlyFunctions(ast, extra);
  const declares = (ancestor) =>
    ancestor.type === 'VariableDeclarator' && ancestor.init?.callee?.name === '$props';
  for (const root of [ast.module, ast.instance, ast.fragment]) {
    walkWithAncestors(root, (node, ancestors) => {
      if (node.type !== 'Identifier' || node.name !== local) return;
      const parent = ancestors.at(-1);
      if (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed) {
        return;
      }
      if (ancestors.some(declares)) return;
      const event =
        isEventReference(ancestors, extra) || ancestors.some((ancestor) => live.has(ancestor));
      if (event) sites.push('event');
      else sites.push(isGuardRead(node, ancestors) ? 'guard' : 'other');
    });
  }
  return sites;
}

/**
 * What a forwarded callback key breaks: a reference that is not a call inside a function `by`
 * lists, a reference to one that is not the whole value of a child component's `as` attribute,
 * and one handed to no child.
 */
function forwardedFaults(ast, key, local, { by, as }) {
  const listed = [by].flat();
  const functions = scriptFunctions(ast);
  const holders = listed.map((name) => functions.get(name)).filter(Boolean);
  const faults = new Set();
  const handed = new Map(listed.map((name) => [name, 0]));
  for (const root of [ast.instance, ast.fragment]) {
    walkWithAncestors(root, (node, ancestors) => {
      if (node.type !== 'Identifier') return;
      const parent = ancestors.at(-1);
      if (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed)
        return;
      if (
        node.name === local &&
        ancestors.every((above) => above.init?.callee?.name !== '$props')
      ) {
        const called = parent?.type === 'CallExpression' && parent.callee === node;
        const inside = holders.some((holder) => ancestors.includes(holder));
        if (!called || !inside) faults.add(`${key} is called outside ${listed.join(', ')}`);
      }
      if (!handed.has(node.name) || parent?.id === node) return;
      const [component, attribute, tag] = ancestors.slice(-3);
      const passed = component?.type === 'Component' && attribute?.name === as && tag === parent;
      if (passed) handed.set(node.name, handed.get(node.name) + 1);
      else faults.add(`${node.name} is referenced but as a child's ${as}`);
    });
  }
  for (const [name, count] of handed) {
    if (count === 0) faults.add(`${name} is handed to no child as ${as}`);
  }
  return [...faults];
}

/**
 * What each `callback` key of an entry breaks: referenced outside an event, or called by none; a
 * key `forwarded` pins is judged by `forwardedFaults` instead.
 */
function eventFaults(entry, ast, forwarded = FORWARDED_CALLBACKS, events = ENTRY_EVENTS) {
  const callbacks = propLocals(ast).filter(({ key }) => entry.props[key]?.kind === 'callback');
  return callbacks.flatMap(({ key, local }) => {
    const pin = forwarded[entry.name]?.[key];
    if (pin) return forwardedFaults(ast, key, local, pin);
    const sites = referenceSites(ast, local, events[entry.name]);
    return [
      ...(sites.includes('other') ? [`${key} ${OUTSIDE_AN_EVENT}`] : []),
      ...(sites.includes('event') ? [] : [`${key} ${NOTHING_CALLS}`]),
    ];
  });
}

const WRITTEN_OUTSIDE_AN_EVENT = 'is a value key written outside an event handler';

/** The only value key written outside an event handler: the probe's, which exists to prove why. */
const WRITTEN_OUTSIDE = Object.freeze({
  // An effect writes `mirror` once per distinct `mirrorAt`.
  PublishedProbe: [`mirror ${WRITTEN_OUTSIDE_AN_EVENT}`],
});

const WRITING_HEADS = new Set(['AssignmentExpression', 'ForOfStatement', 'ForInStatement']);

/**
 * Whether a reference to a local writes it: assigned, updated, bound by a `bind:` directive, or
 * named in a `for…of` or `for…in` head, a declaring one included, which fails closed.
 */
function isWrite(node, ancestors) {
  const parent = ancestors.at(-1);
  if (parent?.type === 'UpdateExpression' || parent?.type === 'BindDirective') return true;
  const at = ancestors.findLastIndex((ancestor) => WRITING_HEADS.has(ancestor.type));
  return at !== -1 && (ancestors[at + 1] ?? node) === ancestors[at].left;
}

/** Where each write of `local` sits: `'event'` as `referenceSites` reads one, else `'other'`. */
function writeSites(ast, local, extra) {
  const sites = [];
  const live = eventOnlyFunctions(ast, extra);
  for (const root of [ast.module, ast.instance, ast.fragment]) {
    walkWithAncestors(root, (node, ancestors) => {
      if (node.type !== 'Identifier' || node.name !== local || !isWrite(node, ancestors)) return;
      const event =
        isEventReference(ancestors, extra) || ancestors.some((ancestor) => live.has(ancestor));
      sites.push(event ? 'event' : 'other');
    });
  }
  return sites;
}

/** What each `value` key of an entry breaks: written outside an event handler. */
function valueWriteFaults(entry, ast, events = ENTRY_EVENTS) {
  const values = propLocals(ast).filter(({ key }) => entry.props[key]?.kind === 'value');
  return values.flatMap(({ key, local }) =>
    writeSites(ast, local, events[entry.name]).includes('other')
      ? [`${key} ${WRITTEN_OUTSIDE_AN_EVENT}`]
      : []
  );
}

/**
 * Every focusable element an entry's closure draws, each with the entry and its parsed file, in
 * the files its drawn closure reaches (issue 2454). An element in the entry's own file also
 * carries the entry's published keys by local name.
 */
function controlsOf(entry, reader = SHIPPED, dynamic = DYNAMIC_ELEMENTS) {
  const own = publishedLocals(entry, reader.component(entry.path));
  const { files } = drawnClosure(entry, reader);
  return [...files].flatMap((file) => {
    const ast = reader.component(file);
    const published = file === entry.path ? own : new Map();
    return focusableElements(file, ast, dynamic).elements.map((element) => ({
      ...element,
      file,
      entry,
      ast,
      published,
    }));
  });
}

/**
 * What a defaults pin breaks: a default the entry publishes or the component does not declare, a
 * guard the gate cannot follow, guards that follow any prop but `defaults`, and no `heldBy`.
 */
function defaultsPinFaults({ id, entry, ast }, { defaults, heldBy }, followed) {
  const declared = new Set(propLocals(ast).map(({ key }) => key));
  const pinned = [...defaults].sort(byName);
  return [
    ...pinned
      .filter((key) => Object.hasOwn(entry.props, key))
      .map((key) => `${id} is pinned to the default of ${key}, which ${entry.name} publishes`),
    ...pinned
      .filter((key) => !declared.has(key))
      .map(
        (key) => `${id} is pinned to the default of ${key}, which the component does not declare`
      ),
    ...followed.faults.map((fault) => `${id} guard ${fault}`),
    ...(followed.props.join(',') === pinned.join(',')
      ? []
      : [`${id} is pinned to the defaults [${pinned}] and its guards follow [${followed.props}]`]),
    ...(heldBy ? [] : [`${id} is pinned to defaults and names no mounted clause in heldBy`]),
  ];
}

/** Whether a control sits in another published entry's own file than the entry drawing it. */
const isNested = ({ file, entry }, entries = ENTRIES) =>
  entries.some((owner) => owner.path === file && owner.name !== entry.name);

/**
 * What one control's pin breaks, its guards followed to the props they read. A key pin on a
 * control in another published entry's own file is that entry's to judge (issue 2646).
 */
function reachFaults(control, pins, entries = ENTRIES) {
  const { id, guards, published, entry, ast } = control;
  if (!Object.hasOwn(pins, id)) return [`${id} has no reach pin`];
  const pin = pins[id];
  if (pin === 'always') return guards.size > 0 ? [`${id} is pinned always under a guard`] : [];
  const followed = followedProps(ast, guards, published);
  if (pin?.defaults) return defaultsPinFaults(control, pin, followed);
  if (pin !== null && isNested(control, entries)) return [];
  if (pin !== null) {
    if (!Object.hasOwn(entry.props, pin)) {
      return [`${id} is pinned to ${pin}, which ${entry.name} does not publish`];
    }
    return followed.keys.includes(pin)
      ? []
      : [`${id} is pinned to ${pin}, which no guard above it names`];
  }
  if (guards.size === 0) return [`${id} is pinned null under no guard`];
  return followed.keys.map((key) => `${id} is pinned null under a guard that names ${key}`);
}

const isReached = ({ id }, pins) => pins[id] !== null && pins[id] !== undefined;
/** Whether a control is drawn whatever the companion passes: pinned `'always'` or to defaults. */
const isAlwaysDrawn = ({ id }, pins) => pins[id] === 'always' || Boolean(pins[id]?.defaults);

/**
 * The pseudo-class a rule states on one subject made only of classes in `classes`, with how many
 * classes that subject names, or `null`.
 */
function focusRuleOn(rule, classes) {
  const [complex, ...others] = rule.prelude.children;
  if (others.length > 0 || complex.children.length !== 1) return null;
  const parts = complex.children[0].selectors;
  const named = parts.filter((part) => part.type === 'ClassSelector');
  const pseudo = parts.filter((part) => part.type === 'PseudoClassSelector');
  if (pseudo.length !== 1 || named.length === 0 || named.length + 1 !== parts.length) return null;
  if (named.some((part) => !classes.includes(part.name))) return null;
  return { pseudo: pseudo[0].name, weight: named.length };
}

/**
 * Every rule of a component's `<style>` that states `pseudo` on the element's own classes, each
 * with its place among the rules, its subject's class count and whether an at-rule holds it.
 */
function ownRules(ast, classes, pseudo) {
  return styleRules(ast).flatMap((rule, at) => {
    const on = focusRuleOn(rule, classes);
    if (on?.pseudo !== pseudo) return [];
    return [{ rule, at, weight: on.weight, nested: !ast.css.children.includes(rule) }];
  });
}

const drawsOutline = (value) =>
  Boolean(value) &&
  value.split(' ').every((token) => token !== 'none' && !/^0[a-z%]*$/.test(token));

/** What the `:focus-visible` rule of a control at `any` breaks against the module ring. */
function markFaults(id, rule, moduleRule) {
  const drawn = Object.fromEntries(declarationsOf(rule));
  if (!drawsOutline(drawn.outline)) return [`${id} :focus-visible draws no outline`];
  return [
    ...(drawn.outline === moduleRule.outline
      ? []
      : [`${id} :focus-visible outline is not the module ring's`]),
    ...(drawn['outline-offset'] === moduleRule.offset
      ? []
      : [`${id} :focus-visible outline-offset is not the module ring's`]),
  ];
}

/** What the two halves of a control's focus pair break against each other; either may be absent. */
function pairFaults(id, strip, mark) {
  const faults = [];
  if (!strip) faults.push(`${id} has no :focus rule on its own classes`);
  else if (!isStrip(strip.rule)) {
    faults.push(`${id} :focus does not declare exactly outline: none and box-shadow: none`);
  }
  if (!mark) return [...faults, `${id} has no :focus-visible rule on its own classes`];
  if (strip && mark.at < strip.at) faults.push(`${id} :focus-visible comes before :focus`);
  if (strip && strip.weight > mark.weight) faults.push(`${id} :focus out-ranks :focus-visible`);
  return faults;
}

/**
 * What a reached control's focus mark breaks. At `any`, its file holds one `:focus` rule declaring
 * exactly `outline: none` and `box-shadow: none`, then one `:focus-visible` rule drawing the module
 * ring, each outside any at-rule, on a subject made only of the element's static classes, the
 * first naming no more of them than the second. At another root the module ring names each tag it
 * can draw as a control, every tag where it states `tabindex`, or an attribute it states.
 */
function focusMarkFaults({ id, node, tags, ast, entry }, moduleRule = moduleRing()) {
  if (entry.root !== 'any') {
    if (moduleRule.attributes.some((name) => attributeOf(node, name))) return [];
    const every = Boolean(attributeOf(node, 'tabindex'));
    return tags
      .filter((tag) => (every || isControlTag(tag)) && !moduleRule.tags.includes(tag))
      .map((tag) => `${id} is a <${tag}>, which the module ring does not name`);
  }
  const classes = (staticText(attributeOf(node, 'class')) ?? '').split(/\s+/).filter(Boolean);
  const strips = ownRules(ast, classes, 'focus');
  const marks = ownRules(ast, classes, 'focus-visible');
  const faults = [];
  for (const [pseudo, found] of [
    ['focus', strips],
    ['focus-visible', marks],
  ]) {
    if (found.length > 1) faults.push(`${id} has more than one :${pseudo} rule on its own classes`);
  }
  if ([...strips, ...marks].some(({ nested }) => nested)) {
    faults.push(`${id} focus pair sits inside an at-rule`);
  }
  faults.push(...pairFaults(id, strips[0], marks[0]));
  return marks[0] ? [...faults, ...markFaults(id, marks[0].rule, moduleRule)] : faults;
}

const LITERAL = 'is named by a literal';
const UNPUBLISHED_NAME = "is not named by a published data key or a text key's render tag";
const OPTIONAL_NAME = 'is named by a text key that is not required';
const OPTIONAL_DATA_NAME = 'is named by a data key that is not required';
const UNGUARDED_NAME = 'is named by a data key that is not its guard, required or requiredWhen it';

/**
 * The published keys an expression's value reaches, by `nameSources`, or the fault it is: a
 * literal reached, or a value from anything but a published `data` key.
 */
function dataNameOf(expression, { ast, published, entry }) {
  const { locals, literal, unfollowed } = nameSources(ast, expression);
  if (literal) return { fault: LITERAL };
  const keys = locals.map((local) => published.get(local));
  const data = keys.every((key) => entry.props[key]?.kind === 'data');
  return unfollowed || keys.length === 0 || !data ? { fault: UNPUBLISHED_NAME } : { keys };
}

/**
 * What one part of a name breaks: text, an expression, or a render tag. A control drawn whatever
 * the companion passes (`strict`) is named only by required keys, and one pinned to its `guard`
 * key only by that key, required keys and keys `requiredWhen` that guard (issue 2452).
 */
function namePartFault(part, control, strict, guard = null) {
  const { published, entry } = control;
  const specOf = (local) => entry.props[published.get(local)];
  if (part.type === 'Text') return LITERAL;
  if (part.type === 'RenderTag') {
    const { callee } =
      part.expression.type === 'ChainExpression' ? part.expression.expression : part.expression;
    if (specOf(callee?.name)?.kind !== 'text') return UNPUBLISHED_NAME;
    return specOf(callee.name).required === true ? null : OPTIONAL_NAME;
  }
  if (part.type !== 'ExpressionTag') return UNPUBLISHED_NAME;
  const { fault, keys } = dataNameOf(part.expression, control);
  if (fault) return fault;
  const isRequired = (key) => entry.props[key].required === true;
  if (strict) return keys.every(isRequired) ? null : OPTIONAL_DATA_NAME;
  const held = (key) => key === guard || isRequired(key) || entry.props[key].requiredWhen === guard;
  return guard === null || keys.every(held) ? null : UNGUARDED_NAME;
}

/**
 * Whether a content node is a decorative glyph, which names nothing: an `<i aria-hidden="true">`,
 * bare or as the one child of an `{#if}` that guards it.
 */
function isHiddenGlyph(child) {
  if (child.type === 'IfBlock') {
    const [only, ...rest] = child.consequent.nodes;
    return rest.length === 0 && !child.alternate && isHiddenGlyph(only);
  }
  const hidden =
    child.type === 'RegularElement' && child.name === 'i' && attributeOf(child, 'aria-hidden');
  return Boolean(hidden) && [hidden.value].flat().every((part) => part?.data === 'true');
}

/** A control's name parts: its `aria-label`'s, or else its content's, less any hidden glyph. */
function nameParts(node) {
  const label = attributeOf(node, 'aria-label');
  if (label) return [label.value === true ? { type: 'Text' } : label.value].flat();
  return node.fragment.nodes.filter(
    (child) => (child.type !== 'Text' || child.data.trim() !== '') && !isHiddenGlyph(child)
  );
}

/**
 * What a reached control's name breaks: its `aria-label`, or else its content, is an expression
 * whose value reaches published `data` keys and no literal, or a required `text` key's render tag;
 * on a control drawn whatever the companion passes, outside `OPTIONAL_NAME_PINS`, each of those
 * `data` keys is required.
 */
function nameFaults(
  control,
  pins,
  optional = OPTIONAL_NAME_PINS,
  names = undefined,
  nested = NESTED_NAMES,
  entries = ENTRIES
) {
  const { id, node, entry } = control;
  const named = names ?? { ...pinsFor(entry, CLOSURE_NAMES), ...OWN_NAMES };
  const row = nested[entry.name]?.[id];
  if (row) return closureNameFaults(control, { ...row, entry: entry.name });
  if (isNested(control, entries))
    return [`${id} is drawn by ${entry.name} and has no NESTED_NAMES row`];
  if (Object.hasOwn(named, id)) return closureNameFaults(control, named[id]);
  const parts = nameParts(node);
  if (parts.length === 0) return [`${id} has no name`];
  const strict = isAlwaysDrawn(control, pins) && !optional.includes(id);
  const guard = typeof pins[id] === 'string' && pins[id] !== 'always' ? pins[id] : null;
  const faults = parts.map((part) => namePartFault(part, control, strict, guard)).filter(Boolean);
  return [...new Set(faults)].map((fault) => `${id} ${fault}`);
}

/**
 * Each `nested` row naming a control its entry's drawn closure does not reach, or an entry that is
 * not published.
 */
function nestedRowFaults(nested = NESTED_NAMES, pins = FOCUSABLE_REACH, reader = SHIPPED) {
  return Object.entries(nested).flatMap(([name, rows]) => {
    const entry = ENTRIES.find((candidate) => candidate.name === name);
    if (!entry) return [`${name} is no published entry`];
    const reach = pinsFor(entry, pins);
    const controls = controlsOf(entry, reader).filter((control) => isReached(control, reach));
    const reached = new Set(controls.map(({ id }) => id));
    return Object.keys(rows)
      .filter((id) => !reached.has(id))
      .map((id) => `${name} names ${id}, which its drawn closure does not reach`);
  });
}

/**
 * What the `{ byEntry }` rows break (issue 2647): a key that is no published entry, a row on a
 * published entry's own path, which gate (b) judges through that entry, a reach row that does not
 * name exactly the entries whose drawn closure lists its id, and a name row that does not name
 * exactly those of them whose resolved reach pin reaches it.
 */
function byEntryRowFaults(
  reach = FOCUSABLE_REACH,
  names = CLOSURE_NAMES,
  entries = ENTRIES,
  reader = SHIPPED
) {
  const drawing = (id) =>
    entries.filter((entry) => controlsOf(entry, reader).some((control) => control.id === id));
  const reaching = (id) => drawing(id).filter((entry) => isReached({ id }, pinsFor(entry, reach)));
  const rowFaults = (table, label, expected) =>
    Object.entries(table).flatMap(([id, pin]) => {
      if (!pin?.byEntry) return [];
      const keys = Object.keys(pin.byEntry).sort(byName);
      const named = expected(id)
        .map(({ name }) => name)
        .sort(byName);
      return [
        ...keys
          .filter((key) => entries.every(({ name }) => name !== key))
          .map((key) => `${label} ${id} names ${key}, which is no published entry`),
        ...(entries.some(({ path }) => id.startsWith(`${path}: `))
          ? [`${label} ${id} is a by-entry row on a published entry's own file`]
          : []),
        ...(keys.join(',') === named.join(',')
          ? []
          : [`${label} ${id} names [${keys}], and [${named}] reach it`]),
      ];
    });
  return [...rowFaults(reach, 'reach', drawing), ...rowFaults(names, 'name', reaching)];
}

const EXTENSION_SPEC = 'openspec/specs/ui-extension-points/spec.md';
let extensionSpecLines;
/** The `ui-extension-points` spec's lines, read once. */
const specLines = () =>
  (extensionSpecLines ??= readFileSync(resolve(repoRoot, EXTENSION_SPEC), 'utf8').split('\n'));

/** A group's opening line, `- **\`Name\`.**`, or its `- **Private:**` line, each closing the group above. */
const GROUP_LINE = /^- \*\*(?:`([^`]+)`\.|Private:)\*\*/u;

/** The lines of `entry`'s group in the spec, past its opening line to the next group, Private line or heading. */
function groupLines(entry, lines) {
  const start = lines.findIndex((line) => GROUP_LINE.exec(line)?.[1] === entry);
  if (start === -1) return [];
  const end = lines.findIndex(
    (line, at) => at > start && (GROUP_LINE.test(line) || line.startsWith('#'))
  );
  return lines.slice(start + 1, end === -1 ? lines.length : end);
}

/** Whether `sentence` is one whole line of `entry`'s group, its list marker aside. */
const groupStates = (entry, sentence, lines) =>
  groupLines(entry, lines).some((line) => line.trim().replace(/^- /u, '') === sentence);

/**
 * What a closure name pin breaks: another entry, or a key its entry does not publish as required
 * data; a vocabulary pin, a sentence its entry's group does not state as a whole line, or no
 * `heldBy`.
 */
function closureNameFaults({ id, entry }, pin, lines = specLines()) {
  if (pin.entry !== entry.name) return [`${id} is named for ${pin.entry}, not ${entry.name}`];
  if (Object.hasOwn(pin, 'vocabulary')) {
    return [
      ...(groupStates(entry.name, pin.vocabulary, lines)
        ? []
        : [`${id} is named by a vocabulary ${entry.name}'s group does not state`]),
      ...(pin.heldBy
        ? []
        : [`${id} is named by a vocabulary and names no mounted clause in heldBy`]),
    ];
  }
  return pin.keys
    .filter((key) => entry.props[key]?.kind !== 'data' || entry.props[key].required !== true)
    .map((key) => `${id} is named by ${key}, which ${entry.name} does not require as data`);
}

const LABELLED_BY = 'aria-labelledby';

/**
 * Whether a reached control may sit beside `aria-labelledby`: it draws no text of its own, and an
 * `aria-label` of one expression names it by required `data` keys alone.
 */
function namedByRequiredLabel(control) {
  const { ast, node, published, entry } = control;
  if (drawsOwnText(ast, node, published)) return false;
  const [part, ...others] = [attributeOf(node, 'aria-label')?.value ?? []].flat();
  if (part?.type !== 'ExpressionTag' || others.length > 0) return false;
  const { keys } = dataNameOf(part.expression, control);
  return Boolean(keys) && keys.every((key) => entry.props[key].required === true);
}

/** What an entry that publishes `aria-labelledby` breaks: a reached control it may not sit beside, or none. */
function labelledByFaults(entry, controls, pins) {
  if (entry.props[LABELLED_BY]?.kind !== 'aria') return [];
  const reached = controls.filter((control) => isReached(control, pins));
  const admitted = reached.length > 0 && reached.every((control) => namedByRequiredLabel(control));
  return admitted ? [] : [`${entry.name} publishes aria-labelledby beside no required name`];
}

const FOCUS_PSEUDO_CLASSES = new Set(['focus', 'focus-visible', 'focus-within']);
const OWN_FOCUS_RULE = 'states a focus rule of its own under a root that supplies the ring';
const declaresUnderRing = (property) => `declares ${property} under a root that supplies the ring`;
const INLINE_STYLE = 'states an inline style under a root that supplies the ring';

/**
 * The focus rules a closure file draws for its own controls in place of the window's ring, by
 * file: each as its selector is written, beside its declarations. A file's design-system entry
 * states the variant in `statedBy`.
 */
const SCOPED_RINGS = Object.freeze({
  'src/ui/svelte/components/Stepper.svelte': {
    statedBy:
      "The `Stepper` input keeps its own ring, 2px at a 1px offset, which its scoped rule draws around the value between the two adjuncts, and its `−`/`+` adjuncts draw the same 2px accent ring at a 1px offset; in the default horizontal row each sits at offset 0, the input's unless it fills its row and the adjuncts' unless the density is comfortable.",
    rules: [
      {
        selector:
          '.fab-stepper:not(.is-vertical):not(.is-comfortable) .fab-stepper-adjunct:focus-visible',
        declarations: [['outline-offset', '0']],
      },
      {
        selector: '.fab-stepper-input[data-stepper-endpoint]:not(:focus-visible)',
        declarations: [['color', 'var(--fab-text-muted)']],
      },
      {
        selector: '.fab-stepper-input:focus-visible',
        declarations: [
          ['outline', '2px solid var(--fab-accent)'],
          ['outline-offset', '1px'],
        ],
      },
      {
        selector: '.fab-stepper:not(.is-vertical):not(.is-fill) .fab-stepper-input:focus-visible',
        declarations: [['outline-offset', '0']],
      },
      {
        selector: '.fab-stepper-adjunct:focus-visible',
        declarations: [
          ['outline', '2px solid var(--fab-accent)'],
          ['outline-offset', '1px'],
        ],
      },
    ],
  },
  'src/ui/svelte/components/SegmentedControl.svelte': {
    statedBy:
      'The `SegmentedControl` segment keeps its own ring, the 2px accent at a 2px offset drawn on the segment around its visually hidden radio, which the `tag` tone turns inward to a -2px offset.',
    rules: [
      {
        selector: '.manager-segment:has(:focus-visible)',
        declarations: [
          ['outline', '2px solid var(--fab-accent)'],
          ['outline-offset', '2px'],
        ],
      },
      {
        selector: '.manager-segmented.is-tag .manager-segment:has(:focus-visible)',
        declarations: [['outline-offset', '-2px']],
      },
    ],
  },
});

/** What a scoped ring pin may declare: the module ring's outline, an offset, and a colour. */
const RING_PROPERTIES = new Set(['outline', 'outline-offset', 'color']);

/** A rule's whole selector list as its stylesheet writes it. */
const writtenPrelude = (css, rule) =>
  css.content.styles.slice(
    rule.prelude.start - css.content.start,
    rule.prelude.end - css.content.start
  );

/**
 * The rules of one file's `<style>` its scoped ring pins exempt, and what each pin breaks: no rule
 * so written (stale), a focus pseudo-class other than `:focus-visible` or none, declarations
 * other than pinned, a property outside `RING_PROPERTIES`, and an `outline` not the module ring's.
 */
function scopedRingFaults(file, css, pinned = [], moduleRule = moduleRing()) {
  const rules = css ? [...walkNodes(css)].filter((node) => node.type === 'Rule') : [];
  const exempt = new Set();
  const faults = pinned.flatMap(({ selector, declarations }) => {
    const matched = rules.filter((rule) => writtenPrelude(css, rule) === selector);
    if (matched.length === 0) return [`${file} pins ${selector}, which no rule writes`];
    return matched.flatMap((rule) => {
      exempt.add(rule);
      const focus = [...walkNodes(rule.prelude)].filter(
        (node) => node.type === 'PseudoClassSelector' && FOCUS_PSEUDO_CLASSES.has(node.name)
      );
      const drawn = declarationsOf(rule);
      return [
        ...(focus.length > 0 && focus.every(({ name }) => name === 'focus-visible')
          ? []
          : [`${file} pins ${selector}, which carries a focus pseudo-class but :focus-visible`]),
        ...(sameDeclarations(rule, declarations)
          ? []
          : [`${file} pins ${selector}, whose declarations are not its pin's`]),
        ...drawn
          .filter(([property]) => !RING_PROPERTIES.has(property))
          .map(([property]) => `${file} pins ${selector}, which declares ${property}`),
        ...drawn
          .filter(([property, value]) => property === 'outline' && value !== moduleRule.outline)
          .map(() => `${file} pins ${selector}, whose outline is not the module ring's`),
      ];
    });
  });
  return { exempt, faults };
}

/**
 * Every class one element's `class` attribute or `class:` directive spells, its expression's
 * literals included, but a directive `omits` answers true for.
 */
function elementClasses(node, omits = () => false) {
  const tokens = [];
  for (const attribute of node.attributes) {
    if (attribute.type === 'ClassDirective' && !omits(attribute)) tokens.push(attribute.name);
    if (attribute.type !== 'Attribute' || attribute.name !== 'class') continue;
    for (const part of [attribute.value].flat()) {
      const texts = part.type === 'Text' ? [part.data] : literalStrings(part);
      tokens.push(...texts.flatMap((text) => text.split(/\s+/)));
    }
  }
  return tokens.filter(Boolean);
}

/**
 * The classes one drawn closure file spells on elements only where no published key reaches them:
 * an element its drawn closure leaves undrawn, a control the reach pins call unreached and what it
 * holds, or a `class:` directive the drawn closure holds falsy, and never in its script (issue 2454).
 */
function unreachedClasses(file, ast, drawn, controls, pins) {
  const unreached = new Set(
    controls
      .filter((control) => control.ast === ast && !isReached(control, pins))
      .map(({ node }) => node)
  );
  const off = new Map();
  walkWithAncestors(ast.fragment, (node, ancestors) => {
    if (node.type !== 'RegularElement' && node.type !== 'SvelteElement') return;
    const hidden =
      !drawsNode(drawn, file, node) || [node, ...ancestors].some((above) => unreached.has(above));
    const omits = (directive) => heldFalsy(drawn, file, directive.expression);
    for (const name of elementClasses(node, omits)) {
      off.set(name, (off.get(name) ?? true) && hidden);
    }
    const held = node.attributes.filter(
      (attribute) => attribute.type === 'ClassDirective' && omits(attribute)
    );
    for (const { name } of held) if (!off.has(name)) off.set(name, true);
  });
  const scripted = new Set(literalStrings(ast.instance).flatMap((text) => text.split(/\s+/)));
  return new Set(
    [...off].filter(([name, hidden]) => hidden && !scripted.has(name)).map(([name]) => name)
  );
}

/** Whether an attribute states an inline style: a `style:` directive, or a `style` the drawn closure does not hold falsy. */
function statesStyle(attribute, drawn, file) {
  if (attribute.type === 'StyleDirective') return true;
  if (attribute.name !== 'style') return false;
  const parts = [attribute.value].flat();
  const [only] = parts;
  return !(
    parts.length === 1 &&
    only.type === 'ExpressionTag' &&
    heldFalsy(drawn, file, only.expression)
  );
}

/** Whether a stylesheet node holds `:global` anywhere. */
const holdsGlobal = (node) =>
  [...walkNodes(node)].some(
    (part) => part.type === 'PseudoClassSelector' && part.name === 'global'
  );

/** Whether every selector of a rule names a class of `classes` and holds no `:global`. */
const onlyOn = (rule, classes) =>
  rule.prelude.children.every((complex) => {
    // A class inside a pseudo-class's argument (`:not()`, `:is()`, `:where()`) does not confine the match.
    const compound = complex.children.flatMap(({ selectors }) => selectors);
    return (
      !holdsGlobal(complex) &&
      compound.some((part) => part.type === 'ClassSelector' && classes.has(part.name))
    );
  });

/**
 * What a closure whose reached control takes a window's ring breaks: no file of its closure holds
 * a selector that carries a focus pseudo-class anywhere, in or out of an at-rule, scoped or
 * `:global`, none declares `all` or a property whose name starts `outline`, and no reached control
 * states a `style:` directive or a `style` attribute the drawn closure does not hold falsy. A rule `rings` pins for its file is exempt as
 * `scopedRingFaults` judges it, so is one whose every selector names a class `unreachedClasses`
 * answers, and so is every rule holding no `:global` in a file the drawn closure does not reach.
 * Vacuous for a closure that draws no reached control, and at `any` but for a pin, which that
 * root never takes.
 */
function focusRuleFaults(entry, controls, pins, reader, rings = SCOPED_RINGS) {
  const drawn = drawnClosure(entry, reader);
  const components = [...importClosure(entry.path, reader)].filter((file) => isComponent(file));
  const reached = controls.filter((control) => isReached(control, pins));
  if (entry.root === 'any') {
    return components
      .filter((file) => Object.hasOwn(rings, file))
      .map((file) => `${file} pins a scoped ring under an entry whose root is any`);
  }
  if (reached.length === 0) return [];
  const styled = reached.filter(({ node, file }) =>
    node.attributes.some((attribute) => statesStyle(attribute, drawn, file))
  );
  const inline = styled.map(({ id }) => `${id} ${INLINE_STYLE}`);
  const ruled = components.flatMap((file) => {
    const ast = reader.component(file);
    const { css } = ast;
    const scoped = scopedRingFaults(file, css, rings[file]?.rules);
    const reaches = drawn.files.has(file);
    const unreached = reaches && unreachedClasses(file, ast, drawn, controls, pins);
    const exemptRule = (rule) => (reaches ? onlyOn(rule, unreached) : !holdsGlobal(rule));
    const exempt = (node) => scoped.exempt.has(node) || (node.type === 'Rule' && exemptRule(node));
    const nodes = [];
    walkWithAncestors(css, (node, ancestors) => {
      if (!exempt(node) && ancestors.every((ancestor) => !exempt(ancestor))) nodes.push(node);
    });
    const own = nodes.some(
      (node) => node.type === 'PseudoClassSelector' && FOCUS_PSEUDO_CLASSES.has(node.name)
    );
    const declared = nodes
      .filter((node) => node.type === 'Declaration')
      .map((node) => node.property)
      .filter((property) => property === 'all' || property.startsWith('outline'));
    const faults = [...new Set(declared)].map((property) => declaresUnderRing(property));
    return [
      ...[...(own ? [OWN_FOCUS_RULE] : []), ...faults].map((fault) => `${file} ${fault}`),
      ...scoped.faults,
    ];
  });
  return [...inline, ...ruled];
}

/**
 * Every fault of every control an entry draws, against its view of the reach `table` and of
 * `closureNames`, then of its closure's focus rules.
 */
function controlFaults(
  entry,
  table,
  reader = SHIPPED,
  dynamic = DYNAMIC_ELEMENTS,
  rings = SCOPED_RINGS,
  closureNames = CLOSURE_NAMES
) {
  const pins = pinsFor(entry, table);
  const names = { ...pinsFor(entry, closureNames), ...OWN_NAMES };
  const controls = controlsOf(entry, reader, dynamic);
  const faults = controls.flatMap((control) => [
    ...reachFaults(control, pins),
    ...(isReached(control, pins)
      ? [...focusMarkFaults(control), ...nameFaults(control, pins, OPTIONAL_NAME_PINS, names)]
      : []),
  ]);
  return [
    ...faults,
    ...labelledByFaults(entry, controls, pins),
    ...focusRuleFaults(entry, controls, pins, reader, rings),
  ];
}

/** The notice's buttons, by the class and the hooks they write, and the file that may style them. */
const NOTICE_ACTION = Object.freeze({
  path: 'src/ui/svelte/components/Notice.svelte',
  classes: ['fab-notice-button'],
  attributes: ['data-notice-action', 'data-notice-dismiss'],
});

/** Every selector of `sheets` outside `own` that names one of a part's classes or holds one of its attributes, as written. */
function partSelectors(sheets, { classes, attributes }, own = new Set()) {
  return sheets
    .filter(([file]) => !own.has(file))
    .flatMap(([file, css]) => [
      ...classes.flatMap((name) =>
        selectorsNaming(css, name).map((complex) => `${file}: ${writtenSelector(css, complex)}`)
      ),
      ...attributes.flatMap((name) => selectorsOnAttribute(file, css, name)),
    ]);
}

describe('each published entry that draws a control', () => {
  for (const entry of ENTRIES) {
    it(`${entry.name} calls each callback key from an event handler, and nowhere else`, () => {
      assert.deepEqual(
        eventFaults(entry, SHIPPED.component(entry.path)),
        CALLED_OUTSIDE_AN_EVENT[entry.name] ?? []
      );
    });

    it(`${entry.name} writes each value key from an event handler, and nowhere else`, () => {
      assert.deepEqual(
        valueWriteFaults(entry, SHIPPED.component(entry.path)),
        WRITTEN_OUTSIDE[entry.name] ?? []
      );
    });

    it(`${entry.name} draws each control under its pinned key, marked for keyboard focus and named by the companion`, () => {
      assert.deepEqual(controlFaults(entry, FOCUSABLE_REACH), []);
    });
  }

  it('names a describe block of its mounted suite in each defaults pin', () => {
    const held = flatPins(FOCUSABLE_REACH).flatMap(({ pin }) =>
      pin?.defaults ? [pin.heldBy] : []
    );
    assert.ok(held.length > 0, 'the switch is pinned to the default of as');
    assert.deepEqual(unheldClauses(held), []);
  });

  it('names a describe block of its mounted suite in each name, nested name, forwarded callback and entry event pin', () => {
    const held = [
      ...[...flatPins(CLOSURE_NAMES), ...flatPins(OWN_NAMES)].map(({ pin }) => pin.heldBy),
      ...Object.values(NESTED_NAMES).flatMap((rows) =>
        Object.values(rows).map(({ heldBy }) => heldBy)
      ),
      ...Object.values(ENTRY_EVENTS).flatMap((events) =>
        Object.values(events).map(({ heldBy }) => heldBy)
      ),
      ...Object.values(FORWARDED_CALLBACKS).flatMap((keys) =>
        Object.values(keys).map(({ heldBy }) => heldBy)
      ),
    ];
    assert.ok(held.length > 0, 'the picker is pinned');
    assert.deepEqual(unheldClauses(held), []);
  });

  it('pins a name only on a reach pin of a published entry, in its own file or not as the table says, and forwards only a callback key', () => {
    for (const [table, own] of [
      [CLOSURE_NAMES, false],
      [OWN_NAMES, true],
    ]) {
      for (const { id, entry } of flatPins(table)) {
        assert.ok(Object.hasOwn(FOCUSABLE_REACH, id), `${id} is a reach pin`);
        const published = ENTRIES.find(({ name }) => name === entry);
        assert.ok(published, `${id} names the published ${entry}`);
        assert.equal(id.startsWith(`${published.path}: `), own, `${id} sits where its table says`);
      }
    }
    for (const name of [...Object.keys(ENTRY_EVENTS), ...Object.keys(NESTED_NAMES)]) {
      assert.ok(
        ENTRIES.some((entry) => entry.name === name),
        `${name} is a published entry`
      );
    }
    for (const [name, rows] of Object.entries(NESTED_NAMES)) {
      for (const id of Object.keys(rows)) {
        assert.ok(Object.hasOwn(FOCUSABLE_REACH, id), `${id} is a reach pin`);
        const owner = ENTRIES.find(({ path }) => id.startsWith(`${path}: `));
        assert.ok(owner && owner.name !== name, `${id} sits in another published entry's own file`);
      }
    }
    assert.deepEqual(nestedRowFaults(), [], 'each nested name row is a control its entry reaches');
    assert.deepEqual(byEntryRowFaults(), [], 'each by-entry row names exactly its entries');
    for (const [name, keys] of Object.entries(FORWARDED_CALLBACKS)) {
      const entry = ENTRIES.find((candidate) => candidate.name === name);
      for (const key of Object.keys(keys)) {
        assert.equal(entry?.props[key]?.kind, 'callback', `${name}.${key} is a callback key`);
      }
    }
  });

  it('exempts from the required-name rule only a control pinned always', () => {
    assert.ok(OPTIONAL_NAME_PINS.length > 0, 'the probe is exempt');
    for (const id of OPTIONAL_NAME_PINS) assert.equal(FOCUSABLE_REACH[id], 'always', id);
  });

  it('pins every focusable element the shipped closures draw, and no other', () => {
    const drawn = ENTRIES.flatMap((entry) => controlsOf(entry).map(({ id }) => id));
    assert.deepEqual([...new Set(drawn)].sort(byName), Object.keys(FOCUSABLE_REACH).sort(byName));
  });

  it('styles the notice buttons in no rule outside the notice, by their class or by their hooks', () => {
    const own = importClosure(NOTICE_ACTION.path, SHIPPED);
    assert.ok(own.has(NOTICE_ACTION.path), 'the notice was read');
    assert.deepEqual(partSelectors(everyStylesheet(), NOTICE_ACTION, own), []);
  });

  it('pins scoped rings only on a file a shipped entry draws, whose design-system entry states its own ring', () => {
    const drawn = new Set(
      PUBLISHED_COMPONENT_MANIFEST.flatMap((entry) => [...importClosure(entry.path, SHIPPED)])
    );
    const spec = resolve(repoRoot, 'openspec/specs/design-system/spec.md');
    const stated = readFileSync(spec, 'utf8').split('\n');
    const pinned = Object.entries(SCOPED_RINGS);
    assert.ok(pinned.length > 0, 'the stepper is pinned');
    for (const [file, { statedBy }] of pinned) {
      assert.ok(drawn.has(file), `${file} is drawn by a shipped entry`);
      assert.ok(stated.includes(statedBy), `${file}: the design-system spec states ${statedBy}`);
    }
  });

  it('reads a module ring from the sheet that names button and draws an outline at an offset', () => {
    const { tags, outline, offset } = moduleRing();
    assert.ok(tags.includes('button'), 'the ring names button');
    assert.ok(drawsOutline(outline), 'the ring draws an outline');
    assert.ok(Boolean(offset), 'the ring states an offset');
  });
});

const E = 'src/E.svelte';
const PRESS = `${E}: button[data-press]`;
const STRIP = '.press:focus { outline: none; box-shadow: none; }';
/** The module ring's two declarations, read from the sheet, so no fixture restates them. */
const MODULE_RING = `outline: ${moduleRing().outline}; outline-offset: ${moduleRing().offset};`;
const RING = `.press:focus-visible { ${MODULE_RING} }`;
const PAIR = `${STRIP} ${RING}`;
const LABEL = '{label}';

const script = (keys) => `<script>let { ${keys} } = $props();</script>`;
const styled = (css) => `<style>${css}</style>`;
/** One marked button holding `content`, with `open` written before its tag closes. */
const button = (content = LABEL, open = '') =>
  `<button type="button" class="press" data-keyboard-focus="true" data-press${open}>${content}</button>`;

/** The control faults of a synthetic entry over `markup`, publishing `props` at `root`, with its one button pinned `pin`. */
function syntheticFaults(
  markup,
  { props = { label: { kind: 'data', required: true } }, pin, root = 'any', rings }
) {
  const entry = { name: 'E', path: E, root, props };
  const pins = pin === undefined ? {} : { [PRESS]: pin };
  const reader = syntheticReader({ [E]: markup });
  const faults = controlFaults(entry, pins, reader, DYNAMIC_ELEMENTS, rings);
  return faults.map((fault) => fault.replace(`${PRESS} `, ''));
}

const DYNAMIC_PRESS = `${E}: svelte:element[data-press]`;
/** One marked `svelte:element` holding `content`, its tag read from an unpublished prop. */
const dynamicPress = (content) =>
  [
    '<svelte:element this={tag} data-keyboard-focus="true" data-press>',
    content,
    '</svelte:element>',
  ].join('');

/** The control faults of a `fabricate` entry whose one control is a `svelte:element` pinned to `tags`. */
function dynamicFaults(tags, content = LABEL, props = { label: { kind: 'data', required: true } }) {
  const entry = { name: 'E', path: E, root: 'fabricate', props };
  const markup = script('label, caption, note, tag') + dynamicPress(content);
  const dynamic = { [DYNAMIC_PRESS]: { tags, keys: [] } };
  const reader = syntheticReader({ [E]: markup });
  return controlFaults(entry, { [DYNAMIC_PRESS]: 'always' }, reader, dynamic).map((fault) =>
    fault.replace(`${DYNAMIC_PRESS} `, '')
  );
}

describe('the reach clause', () => {
  it('passes an unguarded button pinned always, and one under its published key', () => {
    const plain = script('label') + button() + styled(PAIR);
    assert.deepEqual(syntheticFaults(plain, { pin: 'always' }), []);
    const guarded = [script('label'), '{#if label}', button(), '{/if}', styled(PAIR)].join('');
    assert.deepEqual(syntheticFaults(guarded, { pin: 'label' }), []);
  });

  const props = { rows: { kind: 'data' }, label: { kind: 'data', requiredWhen: 'rows' } };
  for (const [claim, open, close] of [
    ['under {#each} of a published key', '{#each rows as row (row)}', '{/each}'],
    ['in the {:else} of a published key', '{#if rows}<p></p>{:else}', '{/if}'],
  ]) {
    it(`reads a button ${claim} as under that key`, () => {
      const markup = [script('rows, label'), open, button(), close, styled(PAIR)].join('');
      assert.deepEqual(syntheticFaults(markup, { props, pin: 'rows' }), []);
      assert.deepEqual(syntheticFaults(markup, { props, pin: null }), [
        'is pinned null under a guard that names rows',
      ]);
    });
  }

  const guarded = [
    script('label, hidden'),
    '{#if label && !hidden}',
    button(),
    '{/if}',
    styled(PAIR),
  ].join('');
  for (const [claim, pin, fault] of [
    [
      'a null pin under a guard that names a published key',
      null,
      'is pinned null under a guard that names label',
    ],
    ['a pin naming an unpublished key', 'hidden', 'is pinned to hidden, which E does not publish'],
    ['always under a guard', 'always', 'is pinned always under a guard'],
    ['an element with no pin', undefined, 'has no reach pin'],
  ]) {
    it(`names ${claim} as a fault`, () => {
      assert.deepEqual(syntheticFaults(guarded, { pin }), [fault]);
    });
  }

  const UNNAMED = 'is pinned to label, which no guard above it names';
  for (const [claim, open, close] of [
    ['under a guard that names another prop', '{#if hidden}', '{/if}'],
    ['under no guard', '', ''],
  ]) {
    it(`names a key pin on a button ${claim} as a fault`, () => {
      const markup = [script('label, hidden'), open, button(), close, styled(PAIR)].join('');
      assert.deepEqual(syntheticFaults(markup, { pin: 'label' }), [UNNAMED]);
    });
  }

  it('names a key pin under a guard that names another published key as a fault', () => {
    const markup = [script('rows, label'), '{#if label}', button(), '{/if}', styled(PAIR)].join('');
    assert.deepEqual(syntheticFaults(markup, { props, pin: 'rows' }), [
      'is pinned to rows, which no guard above it names',
    ]);
  });

  it('names a null pin on a button no guard hides as a fault', () => {
    const plain = script('label') + button() + styled(PAIR);
    assert.deepEqual(syntheticFaults(plain, { pin: null }), ['is pinned null under no guard']);
  });

  it('judges no mark and no name on a control pinned null', () => {
    const bare = [script('label, hidden'), '{#if hidden}', button('Close'), '{/if}'].join('');
    assert.deepEqual(syntheticFaults(bare, { pin: null }), []);
  });

  /** A glyph button drawn under `shown`, named through `aria-label` by `label`, published as `spec`. */
  const glyphFaults = (spec, extra = {}) =>
    syntheticFaults(
      [
        script('shown, label, other'),
        '{#if shown}',
        button('<i aria-hidden="true"></i>', ' aria-label={label || undefined}'),
        '{/if}',
        styled(PAIR),
      ].join(''),
      { pin: 'shown', props: { shown: { kind: 'data' }, label: spec, ...extra } }
    );
  for (const [claim, spec] of [
    ['a required key', { kind: 'data', required: true }],
    ['a key requiredWhen its guard', { kind: 'data', requiredWhen: 'shown' }],
  ]) {
    it(`passes a guarded control named by ${claim}`, () => {
      assert.deepEqual(glyphFaults(spec), []);
    });
  }

  it('passes a guarded control named by its guard key itself', () => {
    const markup = [script('label'), '{#if label}', button(), '{/if}', styled(PAIR)].join('');
    assert.deepEqual(
      syntheticFaults(markup, { pin: 'label', props: { label: { kind: 'data' } } }),
      []
    );
  });

  for (const [claim, spec] of [
    ['an optional key', { kind: 'data' }],
    ['a key requiredWhen another key', { kind: 'data', requiredWhen: 'other' }],
  ]) {
    it(`names a guarded control named by ${claim} as a fault`, () => {
      assert.deepEqual(glyphFaults(spec, { other: { kind: 'data' } }), [UNGUARDED_NAME]);
    });
  }

  const derived = (guard) =>
    `<script>let { label, hidden } = $props(); const shown = $derived(${guard});</script>`;
  it('follows a guard through $derived to the published key it reads, for a key pin and a null pin', () => {
    const markup = [derived('label && !hidden'), '{#if shown}', button(), '{/if}', styled(PAIR)];
    assert.deepEqual(syntheticFaults(markup.join(''), { pin: 'label' }), []);
    assert.deepEqual(syntheticFaults(markup.join(''), { pin: null }), [
      'is pinned null under a guard that names label',
    ]);
  });

  it('judges a null pin and a key pin under a guard it cannot follow by the names it can', () => {
    const held = `<script>let { label } = $props(); let dismissed = $state(false);</script>`;
    const under = (guard) => [held, `{#if ${guard}}`, button(), '{/if}', styled(PAIR)].join('');
    assert.deepEqual(syntheticFaults(under('!dismissed'), { pin: null }), []);
    assert.deepEqual(syntheticFaults(under('label && !dismissed'), { pin: 'label' }), []);
  });
});

describe('the defaults pin', () => {
  const HOSTED = "let { as = 'button', label, other = '' } = $props(); let box = $state(false);";
  /** A button drawn under `guard`, which reads the unpublished `as` through `isBox`. */
  const hosted = (guard = '!isBox') =>
    [
      `<script>${HOSTED} const isBox = $derived(as === 'box');</script>`,
      `{#if ${guard}}`,
      button(),
      '{/if}',
      styled(PAIR),
    ].join('');
  const PINNED = { defaults: ['as'], heldBy: 'a mounted clause' };
  const required = { kind: 'data', required: true };

  it('passes a control drawn at the default of an unpublished prop, judged for its mark and name', () => {
    assert.deepEqual(syntheticFaults(hosted(), { pin: PINNED }), []);
    assert.deepEqual(
      syntheticFaults(hosted(), { pin: PINNED, props: { label: { kind: 'data' } } }),
      [OPTIONAL_DATA_NAME]
    );
  });

  for (const [claim, options, faults] of [
    [
      'a default the entry publishes',
      { pin: PINNED, props: { label: required, as: { kind: 'data' } } },
      ['is pinned to the default of as, which E publishes'],
    ],
    [
      'a default the component does not declare',
      { pin: { ...PINNED, defaults: ['size'] } },
      [
        'is pinned to the default of size, which the component does not declare',
        'is pinned to the defaults [size] and its guards follow [as]',
      ],
    ],
    [
      'guards that follow another prop',
      { pin: PINNED, guard: '!isBox && !other' },
      ['is pinned to the defaults [as] and its guards follow [as,other]'],
    ],
    [
      'no heldBy',
      { pin: { defaults: ['as'] } },
      ['is pinned to defaults and names no mounted clause in heldBy'],
    ],
    [
      'a guard read the gate cannot follow',
      { pin: PINNED, guard: '!isBox && !box' },
      ['guard reads box, which the gate cannot follow'],
    ],
    [
      'a guard that reads no prop',
      { pin: PINNED, guard: 'true' },
      ['is pinned to the defaults [as] and its guards follow []'],
    ],
  ]) {
    it(`names ${claim} as a fault`, () => {
      const { guard, ...rest } = options;
      assert.deepEqual(syntheticFaults(hosted(guard), rest), faults);
    });
  }
});

describe('the focus mark clause', () => {
  const marked = (css, root = 'any') =>
    syntheticFaults(script('label') + button() + styled(css), { pin: 'always', root });
  const visible = (declarations) => `${STRIP} .press:focus-visible { ${declarations} }`;
  const NO_MARK = 'has no :focus-visible rule on its own classes';
  const NO_OUTLINE = ':focus-visible draws no outline';
  const NOT_A_STRIP = ':focus does not declare exactly outline: none and box-shadow: none';

  it('passes the pair in order at any, and a button with no rule of its own at another root', () => {
    assert.deepEqual(marked(PAIR), []);
    assert.deepEqual(marked('', 'fabricate'), []);
    assert.deepEqual(marked('', 'manager'), []);
  });

  for (const [claim, css, fault] of [
    ['no :focus-visible rule', STRIP, NO_MARK],
    ['a :focus-visible rule declaring outline: none', visible('outline: none;'), NO_OUTLINE],
    ['a :focus-visible rule declaring outline: 0', visible('outline: 0;'), NO_OUTLINE],
    ['a mark that is not an outline', visible('background: red;'), NO_OUTLINE],
    ['the :focus half absent', RING, 'has no :focus rule on its own classes'],
    [
      'a :focus half without box-shadow: none',
      `.press:focus { outline: none; } ${RING}`,
      NOT_A_STRIP,
    ],
    [
      'a :focus half that paints',
      `.press:focus { outline: none; box-shadow: none; color: red; } ${RING}`,
      NOT_A_STRIP,
    ],
    ['the pair reversed', `${RING} ${STRIP}`, ':focus-visible comes before :focus'],
    [
      'a subject with a class the element does not state',
      `${STRIP} .press.is-open:focus-visible { ${MODULE_RING} }`,
      NO_MARK,
    ],
    [
      'a subject under an ancestor',
      `${STRIP} .wrap .press:focus-visible { ${MODULE_RING} }`,
      NO_MARK,
    ],
    [
      'a second :focus-visible rule that strips the ring',
      `${PAIR} .press:focus-visible { outline: none; }`,
      'has more than one :focus-visible rule on its own classes',
    ],
    [
      'a :focus half whose subject names more classes than the mark',
      `.press.press:focus { outline: none; box-shadow: none; } ${RING}`,
      ':focus out-ranks :focus-visible',
    ],
    [
      'the pair inside an at-rule',
      `@media (min-width: 9999px) { ${PAIR} }`,
      'focus pair sits inside an at-rule',
    ],
    [
      'an outline that differs from the module ring',
      visible(`outline: 9px dotted red; outline-offset: ${moduleRing().offset};`),
      ":focus-visible outline is not the module ring's",
    ],
    [
      'an outline-offset that differs from the module ring',
      visible(`outline: ${moduleRing().outline}; outline-offset: 9px;`),
      ":focus-visible outline-offset is not the module ring's",
    ],
  ]) {
    it(`names ${claim} as a fault at any`, () => {
      assert.deepEqual(marked(css), [fault]);
    });
  }

  it('names a <select> at fabricate as a fault, because the module ring does not name its tag', () => {
    const select = script('label') + '<select data-press aria-label={label}></select>';
    const entry = {
      name: 'E',
      path: E,
      root: 'fabricate',
      props: { label: { kind: 'data', required: true } },
    };
    const pins = { [`${E}: select[data-press]`]: 'always' };
    assert.deepEqual(controlFaults(entry, pins, syntheticReader({ [E]: select })), [
      `${E}: select[data-press] is a <select>, which the module ring does not name`,
    ]);
  });

  it('judges a svelte:element at fabricate by each pinned tag that draws a control', () => {
    assert.deepEqual(dynamicFaults(['a', 'button']), []);
    assert.deepEqual(dynamicFaults(['button', 'span']), [], 'a span is no control');
    assert.deepEqual(dynamicFaults(['button', 'select']), [
      'is a <select>, which the module ring does not name',
    ]);
  });
});

describe('the focus rule clause', () => {
  const OWN = `${E} states a focus rule of its own under a root that supplies the ring`;
  const declares = (property) => `${E} declares ${property} under a root that supplies the ring`;
  const ruled = (css, root = 'fabricate') =>
    syntheticFaults(script('label') + button() + styled(css), { pin: 'always', root });

  it('passes a closure with no rule, and one with no <style> element, at fabricate', () => {
    assert.deepEqual(ruled('.press { color: red; }'), []);
    assert.deepEqual(
      syntheticFaults(script('label') + button(), { pin: 'always', root: 'fabricate' }),
      []
    );
  });

  for (const [claim, css, faults] of [
    [
      'a :focus-visible rule that strips the ring',
      '.press:focus-visible { outline: none; }',
      [OWN, declares('outline')],
    ],
    ['the strip alone', STRIP, [OWN, declares('outline')]],
    ['the strip inside @media', `@media (width > 1px) { ${STRIP} }`, [OWN, declares('outline')]],
    ['a :global focus rule', ':global(button:focus-visible) { color: red; }', [OWN]],
    ['a focus pseudo-class inside :is()', '.press:is(:focus-visible, .x) { color: red; }', [OWN]],
    ['a focus pseudo-class inside :has()', '.wrap:has(:focus-within) { color: red; }', [OWN]],
    [
      'an outline with no focus pseudo-class',
      '.wrap .press { outline: none; }',
      [declares('outline')],
    ],
    ['an important outline', '.press { outline: 0 !important; }', [declares('outline')]],
    ['an outline longhand', '.press { outline-width: 0; }', [declares('outline-width')]],
    ['all', '.press { all: unset; }', [declares('all')]],
  ]) {
    it(`names ${claim} as a fault at fabricate, and judges none of it at any`, () => {
      assert.deepEqual(ruled(css), faults);
      assert.deepEqual(ruled(css, 'manager'), faults);
      const atAny = ruled(`${PAIR} ${css}`, 'any');
      assert.deepEqual(
        atAny.filter((fault) => fault.includes('a root that supplies the ring')),
        [],
        'at any'
      );
    });
  }

  for (const [claim, open] of [
    ['a style attribute', ' style="outline: none"'],
    ['a style attribute read from an expression', ' style={ring}'],
    ['a style: directive', ' style:outline="none"'],
    ['a style: directive on a longhand', ' style:outline-width={0}'],
  ]) {
    it(`names ${claim} on a reached control as a fault at fabricate, and judges none of it at any`, () => {
      const markup = script('label') + button(LABEL, open);
      assert.deepEqual(syntheticFaults(markup, { pin: 'always', root: 'fabricate' }), [
        INLINE_STYLE,
      ]);
      assert.deepEqual(syntheticFaults(markup + styled(PAIR), { pin: 'always' }), []);
    });
  }

  it('judges no inline style on a control no published key reaches', () => {
    const hidden = [
      script('label, hidden'),
      '{#if hidden}',
      button('Close', ' style="outline: none"'),
      '{/if}',
    ].join('');
    assert.deepEqual(syntheticFaults(hidden, { pin: null, root: 'fabricate' }), []);
  });

  it('names a focus rule in another file of the closure, by that file', () => {
    const entry = {
      name: 'E',
      path: E,
      root: 'fabricate',
      props: { label: { kind: 'data', required: true } },
    };
    const reader = syntheticReader({
      [E]: `<script>import Leaf from './Leaf.svelte'; let { label } = $props();</script>${button()}<Leaf />`,
      'src/Leaf.svelte': '<p class="leaf">x</p><style>.leaf:focus-within { color: red; }</style>',
    });
    assert.deepEqual(controlFaults(entry, { [PRESS]: 'always' }, reader), [
      'src/Leaf.svelte states a focus rule of its own under a root that supplies the ring',
    ]);
  });

  it('judges no focus rule in a closure whose control no published key reaches', () => {
    const hidden = [
      script('label, hidden'),
      '{#if hidden}',
      button('Close'),
      '{/if}',
      styled(STRIP),
    ].join('');
    assert.deepEqual(syntheticFaults(hidden, { pin: null, root: 'fabricate' }), []);
  });
});

describe('the scoped ring clause', () => {
  const SELECTOR = '.wrap .press:focus-visible';
  const ringed = (declarations) => `${SELECTOR} { ${declarations} }`;
  const DRAWN = [
    ['outline', moduleRing().outline],
    ['outline-offset', '0'],
  ];
  const RINGED = ringed(`outline: ${moduleRing().outline}; outline-offset: 0;`);
  /** The faults of one marked button at `root` whose sheet is `css`, its file's rings pinned to `rules`. */
  const scoped = (css, rules = [{ selector: SELECTOR, declarations: DRAWN }], root = 'fabricate') =>
    syntheticFaults(script('label') + button() + styled(css), {
      pin: 'always',
      root,
      rings: { [E]: { statedBy: 'a design-system sentence', rules } },
    });
  const pinFault = (fault) => `${E} pins ${SELECTOR}, ${fault}`;

  it('exempts a pinned :focus-visible rule drawing the module ring at its pinned offset', () => {
    assert.deepEqual(scoped(RINGED), []);
    const muted = '.press[data-x]:not(:focus-visible) { color: red; }';
    const rules = [
      { selector: '.press[data-x]:not(:focus-visible)', declarations: [['color', 'red']] },
    ];
    assert.deepEqual(scoped(muted, rules), [], 'a colour at rest');
  });

  for (const [claim, css, rules, faults] of [
    [
      'an unpinned rule',
      RINGED,
      [],
      [
        `${E} states a focus rule of its own under a root that supplies the ring`,
        `${E} declares outline under a root that supplies the ring`,
        `${E} declares outline-offset under a root that supplies the ring`,
      ],
    ],
    ['a stale pin', '.press { color: red; }', undefined, [pinFault('which no rule writes')]],
    [
      'an outline that differs from the module ring’s',
      ringed('outline: 9px dotted red; outline-offset: 0;'),
      [
        {
          selector: SELECTOR,
          declarations: [
            ['outline', '9px dotted red'],
            ['outline-offset', '0'],
          ],
        },
      ],
      [pinFault("whose outline is not the module ring's")],
    ],
    [
      'box-shadow on a pinned rule',
      ringed(`outline: ${moduleRing().outline}; outline-offset: 0; box-shadow: none;`),
      [{ selector: SELECTOR, declarations: [...DRAWN, ['box-shadow', 'none']] }],
      [pinFault('which declares box-shadow')],
    ],
    [
      'declarations other than its pin’s',
      ringed(`outline: ${moduleRing().outline}; outline-offset: 1px;`),
      undefined,
      [pinFault("whose declarations are not its pin's")],
    ],
  ]) {
    it(`names ${claim} as a fault`, () => {
      assert.deepEqual(scoped(css, rules), faults);
    });
  }

  it('names a pinned :focus rule as a fault', () => {
    const css = `.press:focus { outline: ${moduleRing().outline}; }`;
    const rules = [{ selector: '.press:focus', declarations: [['outline', moduleRing().outline]] }];
    assert.deepEqual(scoped(css, rules), [
      `${E} pins .press:focus, which carries a focus pseudo-class but :focus-visible`,
    ]);
  });

  it('names a pin at any as a fault', () => {
    const faults = scoped(`${PAIR} ${RINGED}`, undefined, 'any');
    assert.ok(faults.includes(`${E} pins a scoped ring under an entry whose root is any`));
  });
});

describe('the parts clause', () => {
  const sheet = (css, file = 'sheet.css') => [
    [file, templateOf(file, `<style>${css}</style>`).ast.css],
  ];

  it('names a selector that names the action class, wherever in the selector', () => {
    const css = '.fabricate .fab-notice-button, .fab-notice-buttons { gap: 0 }';
    assert.deepEqual(partSelectors(sheet(css), NOTICE_ACTION), [
      'sheet.css: .fabricate .fab-notice-button',
    ]);
  });

  it('names a selector that holds the action or the dismiss hook, and no other attribute', () => {
    const css =
      '.a [data-notice-action] > i, .b[data-notice-dismiss], .c[data-notice-tone] { gap: 0 }';
    assert.deepEqual(partSelectors(sheet(css), NOTICE_ACTION), [
      'sheet.css: .a [data-notice-action] > i',
      'sheet.css: .b[data-notice-dismiss]',
    ]);
  });

  it('skips a selector in a file of the notice’s own closure', () => {
    const own = new Set([NOTICE_ACTION.path]);
    const css = '.fab-notice-button { gap: 0 }';
    assert.deepEqual(partSelectors(sheet(css, NOTICE_ACTION.path), NOTICE_ACTION, own), []);
    assert.equal(partSelectors(sheet(css), NOTICE_ACTION, own).length, 1);
  });
});

describe('the name clause', () => {
  const props = {
    label: { kind: 'data', required: true },
    caption: { kind: 'text', required: true },
    note: { kind: 'text' },
    onPress: { kind: 'callback' },
  };
  const named = (content, open = '') =>
    syntheticFaults(
      script('label, caption, note, onPress, other') + button(content, open) + styled(PAIR),
      { props, pin: 'always' }
    );

  it('passes a name rooted at a published data key, as content or aria-label, and the render tag of a required text key', () => {
    assert.deepEqual(named(LABEL), []);
    assert.deepEqual(named('{label?.short}'), []);
    assert.deepEqual(named('<i></i>', ' aria-label={label.long}'), []);
    assert.deepEqual(named('{@render caption?.()}'), []);
  });

  it('reads undefined as nothing, though a pattern default reads it, as SearchField’s conditional aria-label does', () => {
    const markup =
      '<script>let { label, other, ...rest } = $props(); const { x = undefined } = $derived(rest);</script>' +
      button('<i></i>', ' aria-label={other ? undefined : label || undefined}') +
      styled(PAIR);
    assert.deepEqual(syntheticFaults(markup, { props, pin: 'always' }), []);
  });

  it('names a name that reads only undefined as a fault, for it reaches no published key', () => {
    assert.deepEqual(named('<i></i>', ' aria-label={other ? undefined : undefined}'), [
      UNPUBLISHED_NAME,
    ]);
  });

  it('reads the render tag inside a svelte:element as it reads one inside a button', () => {
    assert.deepEqual(dynamicFaults(['button'], '{@render caption?.()}', props), []);
    assert.deepEqual(dynamicFaults(['button'], '{@render note?.()}', props), [OPTIONAL_NAME]);
  });

  for (const [claim, content, open, fault] of [
    ['a literal', 'Close', '', LITERAL],
    ['a literal aria-label', '', ' aria-label="Close"', LITERAL],
    ['a literal expression', "{'Close'}", '', LITERAL],
    ['a literal fallback', "{label ?? 'Close'}", '', LITERAL],
    ['a template literal', '{`Close`}', '', LITERAL],
    ['a name rooted at a callback key', '{onPress.name}', '', UNPUBLISHED_NAME],
    ['a name rooted at an unpublished prop', '{other}', '', UNPUBLISHED_NAME],
    ['a call', '{label.trim()}', '', UNPUBLISHED_NAME],
    ['a render tag of a key that is no text key', '{@render label?.()}', '', UNPUBLISHED_NAME],
    ['the render tag of a text key that is not required', '{@render note?.()}', '', OPTIONAL_NAME],
    ['a literal beside a published key', `Close ${LABEL}`, '', LITERAL],
  ]) {
    it(`names ${claim} as a fault`, () => {
      assert.deepEqual(named(content, open), [fault]);
    });
  }

  it('names a control with no content and no aria-label as a fault', () => {
    assert.deepEqual(named(''), ['has no name']);
  });

  const shadowedProps = { label: props.label, rows: { kind: 'data' } };
  for (const [claim, open, close, pin] of [
    ['an {#each} context', '{#each rows as label (label)}', '{/each}', 'rows'],
    ['an {#each} index', '{#each rows as row, label (row)}', '{/each}', 'rows'],
    ['a {@const}', '{#if rows}{@const label = rows}', '{/if}', 'rows'],
    ['a {:then} value', '{#await rows then label}', '{/await}', 'always'],
    ['a {:catch} error', '{#await rows}<p></p>{:catch label}', '{/await}', 'always'],
    ['a snippet parameter', '{#snippet row(label)}', '{/snippet}{@render row(label)}', 'always'],
  ]) {
    it(`names a name rooted at a published key that ${claim} shadows as a fault`, () => {
      const markup = [script('label, rows'), open, button(), close, styled(PAIR)].join('');
      assert.deepEqual(syntheticFaults(markup, { props: shadowedProps, pin }), [UNPUBLISHED_NAME]);
    });
  }

  /** The name faults of a button pinned `pin` whose `aria-label` reads `accessibleName`, declared by `body`. */
  const derivedName = (body, { pin = 'always', label = props.label } = {}) =>
    syntheticFaults(
      [
        "<script>let { label, as = 'p', other, ...rest } = $props(); const NAME = 'Toggle';",
        ` const HOSTS = ['p']; ${body}</script>`,
        '{#if label}',
        button('<i></i>', ' aria-label={accessibleName}'),
        '{/if}',
        styled(PAIR),
      ].join(''),
      { props: { label, other: { kind: 'text' } }, pin }
    );

  for (const [claim, body] of [
    ['$derived(label || undefined)', 'const accessibleName = $derived(label || undefined);'],
    ['a plain const', 'const accessibleName = label;'],
    [
      'a conditional whose test reads an unpublished prop',
      'const accessibleName = $derived(HOSTS.includes(as) ? label : undefined);',
    ],
    ['the right of &&', 'const accessibleName = $derived(as && label);'],
  ]) {
    it(`follows a name through ${claim} to the published key behind it`, () => {
      assert.deepEqual(derivedName(body, { pin: 'label' }), []);
    });
  }

  for (const [claim, body, fault] of [
    ["$derived(label || 'Toggle')", "const accessibleName = $derived(label || 'Toggle');", LITERAL],
    ['a literal held in a const', 'const accessibleName = $derived(label || NAME);', LITERAL],
    ['a template literal', 'const accessibleName = $derived(label || `Toggle`);', LITERAL],
    ['an unpublished prop', 'const accessibleName = $derived(as);', UNPUBLISHED_NAME],
    ['a text key', 'const accessibleName = $derived(other);', UNPUBLISHED_NAME],
    ['a $state', 'const accessibleName = $state(label);', UNPUBLISHED_NAME],
    ['a let', 'let accessibleName = label;', UNPUBLISHED_NAME],
    ['$derived.by', 'const accessibleName = $derived.by(() => label);', UNPUBLISHED_NAME],
    ['a function', 'function accessibleName() { return label; }', UNPUBLISHED_NAME],
  ]) {
    it(`names a name followed to ${claim} as a fault`, () => {
      assert.deepEqual(derivedName(body, { pin: 'label' }), [fault]);
    });
  }

  it('requires the name key of a control drawn whatever the companion passes, and of no other', () => {
    const body = 'const accessibleName = $derived(label || undefined);';
    const optional = { kind: 'data' };
    assert.deepEqual(derivedName(body, { pin: 'label', label: optional }), []);
    const always = [script('label'), button(), styled(PAIR)].join('');
    assert.deepEqual(syntheticFaults(always, { pin: 'always', props: { label: optional } }), [
      OPTIONAL_DATA_NAME,
    ]);
  });

  it('exempts only the controls OPTIONAL_NAME_PINS names, the probe controls, which mount unlabelled', () => {
    const always = { [PRESS]: 'always' };
    const entry = { name: 'E', path: E, root: 'any', props: { label: { kind: 'data' } } };
    const [control] = controlsOf(entry, syntheticReader({ [E]: script('label') + button() }));
    assert.deepEqual(nameFaults(control, always), [`${PRESS} ${OPTIONAL_DATA_NAME}`]);
    assert.deepEqual(nameFaults(control, always, [PRESS]), []);
  });
});

describe('the aria-labelledby admission clause', () => {
  const required = { kind: 'data', required: true };
  const LABELLED = { 'aria-labelledby': { kind: 'aria' } };
  const NAMED = ' aria-label={accessibleName}';
  /** The faults of an entry publishing `props`, its one button holding `content` and `open`. */
  const admitted = (content, open = NAMED, props = { label: required, ...LABELLED }) =>
    syntheticFaults(
      [
        "<script>let { label, note = '', ...rest } = $props();",
        ' const accessibleName = $derived(label || undefined);</script>',
        '{#snippet face()}<span aria-hidden="true"><span></span></span>{#if note}<span>{note}</span>{/if}{/snippet}',
        '{#snippet worded()}<span>{label}</span>{/snippet}',
        button(content, open),
        styled(PAIR),
      ].join(''),
      { props, pin: 'always' }
    );
  const REFUSED = 'E publishes aria-labelledby beside no required name';

  it('admits it beside a control that draws no text and is named by a required key through aria-label', () => {
    assert.deepEqual(admitted('<span aria-hidden="true"></span>'), []);
    assert.deepEqual(admitted('{@render face()}'), [], 'a snippet held off at a falsy default');
  });

  it('judges no entry that does not publish it', () => {
    assert.deepEqual(admitted(LABEL, '', { label: required }), []);
  });

  for (const [claim, content, open, props] of [
    ['a control named by its own text, as Button is', LABEL, ''],
    ['a control that draws text beside its aria-label', '<span>{label}</span>', NAMED],
    ['a control whose snippet draws text', '{@render worded()}', NAMED],
    ['a static text node', 'On', NAMED],
    ['a name key that is not required', '', NAMED, { label: { kind: 'data' }, ...LABELLED }],
    ['a child component, which may draw text', '<Label text={label} />', NAMED],
    ['a render of a snippet its file does not define', '{@render children?.()}', NAMED],
    ['text under an {#if} on a published key', '{#if label}<span>{label}</span>{/if}', NAMED],
  ]) {
    it(`names ${claim} as a fault`, () => {
      assert.ok(admitted(content, open, props).includes(REFUSED));
    });
  }

  /** The faults of an entry publishing it beside a required `label`, over `markup`, under `pins`. */
  const labelledFaults = (markup, pins) => {
    const entry = { name: 'E', path: E, root: 'any', props: { label: required, ...LABELLED } };
    return controlFaults(entry, pins, syntheticReader({ [E]: markup }));
  };

  it('names an entry one of whose two reached controls draws text as a fault', () => {
    const markup = [
      '<script>let { label, ...rest } = $props(); const accessibleName = $derived(label || undefined);</script>',
      button('', NAMED),
      button('<span>{label}</span>', NAMED).replace('data-press', 'data-other'),
      styled(PAIR),
    ].join('');
    const pins = { [PRESS]: 'always', [`${E}: button[data-other]`]: 'always' };
    assert.ok(labelledFaults(markup, pins).includes(REFUSED));
  });

  it('names an entry that reaches no control as a fault', () => {
    assert.ok(
      labelledFaults(
        '<script>let { label, ...rest } = $props();</script><span {...rest}>{label}</span>',
        {}
      ).includes(REFUSED)
    );
  });
});

describe('the called-from-an-event clause', () => {
  const KEYS =
    'inEffect, inText, inTest, inCall, inDerived, unused, onlyRead, clean, read: renamed';
  const SYNTHETIC = templateOf(
    'Synthetic.svelte',
    [
      '<script>',
      `  let { ${KEYS} } = $props();`,
      '  $effect(() => {',
      '    inEffect?.();',
      '  });',
      '  const held = $derived(inDerived);',
      '</script>',
      '<p>{inText?.()}{held}</p>',
      '{#if inTest()}<b></b>{/if}',
      '{#if run(inCall)}<b></b>{/if}',
      '{#if onlyRead}<b></b>{/if}',
      '{#if renamed && clean}',
      '  <button type="button" onclick={clean}>x</button>',
      '  <button type="button" onclick={() => { renamed?.(); inEffect?.(); inText?.(); inTest?.(); inCall?.(); inDerived?.(); }}>y</button>',
      '{/if}',
    ].join('\n')
  ).ast;
  const callback = { kind: 'callback' };
  const faultsOf = (...keys) =>
    eventFaults({ props: Object.fromEntries(keys.map((key) => [key, callback])) }, SYNTHETIC);

  it('passes a key that is the whole value of an on… attribute, and one read in an {#if} test and called in a handler', () => {
    assert.deepEqual(faultsOf('clean', 'read'), []);
  });

  for (const [claim, key, fault] of [
    ['a call in $effect', 'inEffect', OUTSIDE_AN_EVENT],
    ['a call in a text expression', 'inText', OUTSIDE_AN_EVENT],
    ['a call in an {#if} test', 'inTest', OUTSIDE_AN_EVENT],
    ['a key handed to a call in an {#if} test', 'inCall', OUTSIDE_AN_EVENT],
    ['a read in $derived', 'inDerived', OUTSIDE_AN_EVENT],
    ['a key never referenced', 'unused', NOTHING_CALLS],
    ['a key only read in an {#if} test', 'onlyRead', NOTHING_CALLS],
  ]) {
    it(`names ${claim} as a fault`, () => {
      assert.deepEqual(faultsOf(key), [`${key} ${fault}`]);
    });
  }

  const closed = (declared, markup) =>
    ['<script>let { onPress } = $props();', declared, '</script>', markup].join('');
  const PRESSES = ' function press() { onPress?.(1); }';
  for (const [claim, markup] of [
    ['a function declaration', closed(PRESSES, '<button type="button" onclick={press}>x</button>')],
    [
      'a const arrow called inside a handler',
      closed(
        ' const press = () => onPress?.();',
        '<button type="button" onclick={() => press()}>x</button>'
      ),
    ],
    [
      'a chain of functions from an input event',
      closed(
        ' function inner(value) { onPress?.(value); } function outer(event) { inner(event.currentTarget.value); }',
        '<input oninput={outer} />'
      ),
    ],
    ['a key on an input’s blur', closed('', '<input onblur={onPress} />')],
    ['a key called on an input’s keydown', closed('', '<input onkeydown={() => onPress?.()} />')],
  ]) {
    it(`passes a key reached from an admitted event through ${claim}`, () => {
      const { ast } = templateOf('Reached.svelte', markup);
      assert.deepEqual(eventFaults({ props: { onPress: callback } }, ast), []);
    });
  }

  for (const [claim, markup] of [
    [
      'a function also called from an $effect',
      closed(
        `${PRESSES} $effect(() => { press(); });`,
        '<button type="button" onclick={press}>x</button>'
      ),
    ],
    [
      'a function handed to setTimeout',
      closed(PRESSES, '<button type="button" onclick={() => setTimeout(press)}>x</button>'),
    ],
    ['a function reached only from onfocus', closed(PRESSES, '<input onfocus={press} />')],
    [
      'a cycle of functions no event reaches',
      closed(' function a() { b(); onPress?.(); } function b() { a(); }', '<p></p>'),
    ],
    ['oninput on a button', closed('', '<button type="button" oninput={onPress}>x</button>')],
    ['a callback handed to a child component', closed('', '<Child onclick={onPress} />')],
    [
      'an exported function, which a parent can call',
      closed(
        ' export function press() { onPress?.(1); }',
        '<button type="button" onclick={press}>x</button>'
      ),
    ],
    [
      'a function also called from onMount',
      closed(
        `${PRESSES} onMount(() => press());`,
        '<button type="button" onclick={press}>x</button>'
      ),
    ],
    [
      'a function also handed to a child component',
      closed(PRESSES, '<button type="button" onclick={press}>x</button><Child cb={press} />'),
    ],
    ['a handler on svelte:window', closed('', '<svelte:window onclick={onPress} />')],
    [
      'a pointer-entry handler',
      closed('', '<button type="button" onmouseenter={onPress}>x</button>'),
    ],
    ['a focus handler', closed('', '<button type="button" onfocus={() => onPress?.()}>x</button>')],
    [
      'a pointer-down handler',
      closed('', '<button type="button" onpointerdown={onPress}>x</button>'),
    ],
    [
      'an on… value that is neither the key nor a function',
      closed('', '<button type="button" onclick={flag ? onPress : null}>x</button>'),
    ],
  ]) {
    it(`fails closed on ${claim}`, () => {
      const { ast } = templateOf('Closed.svelte', markup);
      assert.deepEqual(eventFaults({ props: { onPress: callback } }, ast), [
        `onPress ${OUTSIDE_AN_EVENT}`,
        `onPress ${NOTHING_CALLS}`,
      ]);
    });
  }

  it('admits keydown on a button only for an entry whose events pin names that tag', () => {
    const { ast } = templateOf(
      'Keyed.svelte',
      closed(PRESSES, '<button type="button" onkeydown={(event) => press(event)}>x</button>')
    );
    const entry = { name: 'Keyed', props: { onPress: callback } };
    const pinned = { Keyed: { onkeydown: { tag: 'button', heldBy: 'a mounted clause' } } };
    assert.deepEqual(eventFaults(entry, ast, FORWARDED_CALLBACKS, pinned), []);
    const closedFaults = [`onPress ${OUTSIDE_AN_EVENT}`, `onPress ${NOTHING_CALLS}`];
    assert.deepEqual(eventFaults(entry, ast, FORWARDED_CALLBACKS, {}), closedFaults);
    const elsewhere = { Keyed: { onkeydown: { tag: 'div', heldBy: 'a mounted clause' } } };
    assert.deepEqual(eventFaults(entry, ast, FORWARDED_CALLBACKS, elsewhere), closedFaults);
  });

  for (const [claim, key, handler] of [
    ['the key as the whole value', 'onclick', '{onclick}'],
    ['a function that calls the key', 'onPress', 'onclick={() => onPress?.()}'],
  ]) {
    it(`passes ${claim} of an on… attribute on a svelte:element, which draws a DOM element`, () => {
      const markup = `<script>let { ${key} } = $props();</script><svelte:element this="button" ${handler}></svelte:element>`;
      const { ast } = templateOf('Dynamic.svelte', markup);
      assert.deepEqual(eventFaults({ props: { [key]: callback } }, ast), []);
    });
  }

  it('judges no key that is not a published callback', () => {
    assert.deepEqual(eventFaults({ props: { inEffect: { kind: 'data' } } }, SYNTHETIC), []);
  });
});

describe('the written-from-an-event clause', () => {
  const value = { kind: 'value', initial: '' };
  const faultsOf = (declared, markup) => {
    const source = [
      "<script>let { query = $bindable(''), unpublished = $bindable('') } = $props();",
      declared,
      '</script>',
      markup,
    ].join('');
    return valueWriteFaults({ props: { query: value } }, templateOf('Value.svelte', source).ast);
  };
  const WRITTEN = [`query ${WRITTEN_OUTSIDE_AN_EVENT}`];

  for (const [claim, declared, markup] of [
    ['a read alone', '', '<output>{query}</output>'],
    ['an input handler', '', '<input oninput={(event) => (query = event.currentTarget.value)} />'],
    [
      'a function only an event reaches',
      ' function clear() { query = ""; }',
      '<button type="button" onclick={clear}>x</button>',
    ],
    ['a write of a key the entry does not publish', ' $effect(() => { unpublished = "x"; });', ''],
  ]) {
    it(`passes ${claim}`, () => {
      assert.deepEqual(faultsOf(declared, markup), []);
    });
  }

  for (const [claim, declared, markup] of [
    ['a write in $effect', ' $effect(() => { query = "x"; });', ''],
    ['an update expression in $effect', ' $effect(() => { query++; });', ''],
    ['a destructuring write in $effect', ' $effect(() => { [query] = ["x"]; });', ''],
    ['a write at init', ' query = "x";', ''],
    ['a for…of head at init', ' for (query of ["x"]) {}', ''],
    ['a for…in head in $effect', ' $effect(() => { for (query in { x: 1 }) {} });', ''],
    ['a destructuring for…of head', ' for ([query] of [["x"]]) {}', ''],
    ['a declaring for…of head', ' for (const query of ["x"]) {}', ''],
    ['bind:value', '', '<input bind:value={query} />'],
    [
      'a function also called from an $effect',
      ' function clear() { query = ""; } $effect(() => { clear(); });',
      '<button type="button" onclick={clear}>x</button>',
    ],
    [
      'an exported function',
      ' export function clear() { query = ""; }',
      '<button type="button" onclick={clear}>x</button>',
    ],
    ['a focus handler', '', '<input onfocus={() => (query = "")} />'],
  ]) {
    it(`fails closed on ${claim}`, () => {
      assert.deepEqual(faultsOf(declared, markup), WRITTEN);
    });
  }
});

describe('a control drawn in a closure child, and a callback handed to one (issue 2454)', () => {
  const C = 'src/C.svelte';
  const CHILD_PRESS = `${C}: button[data-press]`;
  const entry = {
    name: 'E',
    path: E,
    root: 'fabricate',
    props: { label: { kind: 'data', required: true }, note: { kind: 'data' } },
  };
  /** A reader over a parent that draws `C` as `tag`, beside a child whose own button `C` draws. */
  const readerOf = (tag, childBody = '', css = '') =>
    syntheticReader({
      [E]:
        "<script>import C from './C.svelte'; let { label, note, extra = false } = $props();</script>" +
        tag,
      [C]:
        '<script>let { label, extra = false } = $props();</script>' +
        '<button type="button" data-keyboard-focus="true" data-press aria-label={label}>x</button>' +
        childBody +
        (css ? styled(css) : ''),
    });
  const idsOf = (reader) => controlsOf(entry, reader).map(({ id }) => id);
  /** The faults of the child's pinned control over `reader`, but the control's own. */
  const ruleFaults = (reader) =>
    controlFaults(entry, { [CHILD_PRESS]: 'always' }, reader).filter(
      (fault) => !fault.startsWith(CHILD_PRESS)
    );

  it('draws the child’s control only where the parent’s tag is drawn', () => {
    assert.deepEqual(idsOf(readerOf('<C {label} />')), [CHILD_PRESS]);
    assert.deepEqual(idsOf(readerOf('{#if extra}<C {label} />{/if}')), []);
    assert.deepEqual(idsOf(readerOf('{#if note}<C {label} />{/if}')), [CHILD_PRESS]);
  });

  it('names a child’s control by the required keys its closure name pin states, and no other', () => {
    const [control] = controlsOf(entry, readerOf('<C {label} />'));
    const pins = { [CHILD_PRESS]: 'always' };
    const named = (keys, name = 'E') =>
      nameFaults(control, pins, [], { [CHILD_PRESS]: { entry: name, keys } });
    assert.deepEqual(named(['label']), []);
    assert.deepEqual(named(['note']), [
      `${CHILD_PRESS} is named by note, which E does not require as data`,
    ]);
    assert.deepEqual(named(['label'], 'Other'), [`${CHILD_PRESS} is named for Other, not E`]);
    assert.deepEqual(nameFaults(control, pins), [`${CHILD_PRESS} ${UNPUBLISHED_NAME}`]);
  });

  it('exempts a child’s focus rule on an element no published key draws, and not one on a drawn element', () => {
    const OWN = `${C} ${OWN_FOCUS_RULE}`;
    const focusFaults = (body, css) =>
      controlFaults(
        entry,
        { [CHILD_PRESS]: 'always' },
        readerOf('<C {label} />', body, css)
      ).filter((fault) => fault.startsWith(`${C} `) && !fault.startsWith(CHILD_PRESS));
    const extra = '{#if extra}<span class="c-extra"></span>{/if}';
    assert.deepEqual(focusFaults(extra, '.c-extra:focus-visible { color: var(--fab-text); }'), []);
    assert.deepEqual(
      focusFaults(
        '<span class="c-own"></span>',
        '.c-own:focus-visible { color: var(--fab-text); }'
      ),
      [OWN]
    );
    assert.deepEqual(
      focusFaults(extra, ':global(.c-extra):focus-visible { color: var(--fab-text); }'),
      [OWN]
    );
    assert.deepEqual(
      ruleFaults(
        readerOf('<C {label} extra />', extra, '.c-extra:focus-visible { color: var(--fab-text); }')
      ),
      [OWN],
      'a bare extra draws what its {#if} holds'
    );
  });

  it('exempts no rule that names an undrawn class only inside a pseudo-class’s argument', () => {
    const OWN = `${C} ${OWN_FOCUS_RULE}`;
    const body = '{#if extra}<span class="c-extra"></span>{/if}<span class="c-own"></span>';
    const focusFaults = (css) => ruleFaults(readerOf('<C {label} />', body, css));
    assert.deepEqual(focusFaults('button:not(.c-extra):focus-visible { outline: none; }'), [
      OWN,
      `${C} declares outline under a root that supplies the ring`,
    ]);
    for (const selector of ['.c-own:not(.c-extra)', ':is(.c-extra, .c-own)']) {
      assert.deepEqual(
        focusFaults(`${selector}:focus-visible { color: var(--fab-text); }`),
        [OWN],
        selector
      );
    }
  });

  it('judges a :global focus rule in a closure file the drawn closure does not reach, and no scoped one', () => {
    const U = 'src/U.svelte';
    const undrawn = (css) =>
      ruleFaults(
        syntheticReader({
          [E]:
            "<script>import C from './C.svelte'; import U from './U.svelte'; let { label, extra = false } = $props();</script>" +
            '<C {label} />{#if extra}<U />{/if}',
          [C]:
            '<script>let { label } = $props();</script>' +
            '<button type="button" data-keyboard-focus="true" data-press aria-label={label}>x</button>',
          [U]: `<span class="u"></span>${styled(css)}`,
        })
      );
    assert.deepEqual(undrawn('.u:focus-visible { outline: none; }'), []);
    assert.deepEqual(
      undrawn(':global(.fabricate-select-trigger):focus-visible { outline: none; }'),
      [`${U} ${OWN_FOCUS_RULE}`, `${U} declares outline under a root that supplies the ring`]
    );
  });

  const FORWARDED = { E: { onPick: { by: 'choose', as: 'onSelect' } } };
  const callback = { kind: 'callback', required: true };
  const forwardedOf = (script, markup) =>
    eventFaults(
      { name: 'E', props: { onPick: callback } },
      templateOf(
        E,
        `<script>import C from './C.svelte'; let { onPick } = $props(); ${script}</script>${markup}`
      ).ast,
      FORWARDED
    );
  const CHOOSE = 'function choose(id) { onPick(id); }';

  it('passes a callback key called only in the function the pin names, handed only as the child’s callback', () => {
    assert.deepEqual(forwardedOf(CHOOSE, '<C onSelect={choose} />'), []);
  });

  for (const [claim, script, markup, fault] of [
    [
      'called outside that function',
      `${CHOOSE} $effect(() => onPick(1));`,
      '<C onSelect={choose} />',
      'onPick is called outside choose',
    ],
    [
      'read but not called',
      `${CHOOSE} const held = onPick;`,
      '<C onSelect={choose} />',
      'onPick is called outside choose',
    ],
    [
      'a function also used as a listener',
      CHOOSE,
      '<C onSelect={choose} /><button onclick={choose}>x</button>',
      "choose is referenced but as a child's onSelect",
    ],
    [
      'a function handed as another prop',
      CHOOSE,
      '<C onPress={choose} />',
      "choose is referenced but as a child's onSelect",
    ],
    ['a function handed to no child', CHOOSE, '', 'choose is handed to no child as onSelect'],
  ]) {
    it(`names a forwarded callback ${claim}`, () => {
      assert.ok(forwardedOf(script, markup).includes(fault), fault);
    });
  }
});

describe('a published child drawn inside another entry (issue 2646)', () => {
  const C = 'src/C.svelte';
  const CHILD_PRESS = `${C}: button[data-press]`;
  const drawer = {
    name: 'E',
    path: E,
    root: 'fabricate',
    props: { label: { kind: 'data', required: true }, note: { kind: 'data' } },
  };
  const child = {
    name: 'C',
    path: C,
    root: 'fabricate',
    props: { shown: { kind: 'data' }, name: { kind: 'data', required: true } },
  };
  const reader = syntheticReader({
    [E]: "<script>import C from './C.svelte'; let { label, note } = $props();</script><C name={label} shown />",
    [C]:
      "<script>let { shown = false, name = '' } = $props();</script>" +
      '{#if shown}<button type="button" data-keyboard-focus="true" data-press aria-label={name}>x</button>{/if}',
  });
  const [control] = controlsOf(drawer, reader);
  const pins = { [CHILD_PRESS]: 'shown' };

  it('judges a key pin in another published entry’s own file under that entry alone', () => {
    assert.deepEqual(reachFaults(control, pins, [drawer, child]), []);
    assert.ok(isReached(control, pins), 'the drawing entry counts the control as reached');
  });

  it('judges the same key pin under the drawing entry where its file is no entry’s own', () => {
    assert.deepEqual(reachFaults(control, pins, [drawer]), [
      `${CHILD_PRESS} is pinned to shown, which E does not publish`,
    ]);
  });

  const named = (rows) => nameFaults(control, pins, [], {}, rows, [drawer, child]);

  it('names a nested control by the drawing entry’s required data keys its row states', () => {
    assert.deepEqual(named({ E: { [CHILD_PRESS]: { keys: ['label'] } } }), []);
  });

  it('names a nested control with no row, or a row naming a key not required as data, as a fault', () => {
    assert.deepEqual(named({}), [`${CHILD_PRESS} is drawn by E and has no NESTED_NAMES row`]);
    assert.deepEqual(named({ E: { [CHILD_PRESS]: { keys: ['note'] } } }), [
      `${CHILD_PRESS} is named by note, which E does not require as data`,
    ]);
  });

  it('names a nested row for a control its entry does not reach, or for no published entry', () => {
    const unreached = 'src/ui/svelte/components/Button.svelte: svelte:element';
    assert.deepEqual(nestedRowFaults({ Pagination: { [unreached]: { keys: ['nextLabel'] } } }), [
      `Pagination names ${unreached}, which its drawn closure does not reach`,
    ]);
    assert.deepEqual(nestedRowFaults({ Nowhere: {} }), ['Nowhere is no published entry']);
    const press = 'src/ui/svelte/components/IconButton.svelte: button';
    const elsewhere = { ...FOCUSABLE_REACH, [press]: { byEntry: { Select: 'always' } } };
    assert.deepEqual(
      nestedRowFaults({ Pagination: { [press]: { keys: ['nextLabel'] } } }, elsewhere),
      [`Pagination names ${press}, which its drawn closure does not reach`]
    );
  });

  const forwardedOf = (script, markup) =>
    eventFaults(
      { name: 'E', props: { onTurn: { kind: 'callback', required: true } } },
      templateOf(
        E,
        `<script>import C from './C.svelte'; let { onTurn } = $props(); function back() { onTurn(0); } function on() { onTurn(1); } ${script}</script>${markup}`
      ).ast,
      { E: { onTurn: { by: ['back', 'on'], as: 'onclick' } } }
    );

  it('passes a callback key called only in the functions its list names, each handed as the child’s callback', () => {
    assert.deepEqual(forwardedOf('', '<C onclick={back} /><C onclick={on} />'), []);
  });

  it('names a key called in an unlisted function, and a listed function handed to no child', () => {
    assert.ok(
      forwardedOf(
        'function skip() { onTurn(9); }',
        '<C onclick={back} /><C onclick={on} /><C onclick={skip} />'
      ).includes('onTurn is called outside back, on')
    );
    assert.deepEqual(forwardedOf('', '<C onclick={back} />'), [
      'on is handed to no child as onclick',
    ]);
  });
});

describe('the drawn closure, which fails closed (issue 2454)', () => {
  const C = 'src/C.svelte';
  const W = 'src/W.svelte';
  const CHILD_PRESS = `${C}: button[data-press]`;
  const entry = {
    name: 'E',
    path: E,
    root: 'fabricate',
    props: { label: { kind: 'data', required: true }, items: { kind: 'data' } },
  };
  const CHILD =
    '<script>let { label, extra = false } = $props();</script>' +
    '<button type="button" data-keyboard-focus="true" data-press aria-label={label}>x</button>';
  /** A reader over an entry file that runs `imports` and states `props`, then draws `markup`. */
  const readerOver = (markup, { imports = "import C from './C.svelte';", props = '', more = {} }) =>
    syntheticReader({
      [E]: `<script>${imports} let { label, items = [], open = false${props} } = $props();</script>${markup}`,
      [C]: CHILD,
      ...more,
    });
  const idsOver = (markup, options = {}) =>
    controlsOf(entry, readerOver(markup, options)).map(({ id }) => id);
  /** The child's falsy props, which `undefined` answers for a child the closure leaves undrawn. */
  const childFalsy = (markup, options = {}) => {
    const drawn = drawnClosure(entry, readerOver(markup, options));
    return drawn.files.has(C) ? [...drawn.falsy.get(C)] : undefined;
  };

  it('leaves the child undrawn under a falsy prop, and its own prop falsy where its tag omits it', () => {
    assert.deepEqual(idsOver('{#if open}<C {label} />{/if}'), []);
    assert.deepEqual(childFalsy('<C {label} />'), ['extra']);
  });

  for (const [claim, markup, props = ''] of [
    ['an {#each} context', '{#each items as open}{#if open}<C {label} />{/if}{/each}'],
    ['an {#each} index', '{#each items as item, open}{#if open}<C {label} />{/if}{/each}'],
    [
      'a snippet parameter',
      '{#snippet row(open)}{#if open}<C {label} />{/if}{/snippet}{#each items as item}{@render row(item)}{/each}',
    ],
    ['a {@const}', '{#each items as item}{@const open = item}{#if open}<C {label} />{/if}{/each}'],
    ['an {#await} value', '{#await items then open}{#if open}<C {label} />{/if}{/await}'],
    ['an {#await} error', '{#await items}{:catch open}{#if open}<C {label} />{/if}{/await}'],
  ]) {
    it(`draws the child under a falsy prop that ${claim} shadows`, () => {
      assert.deepEqual(idsOver(markup, { props }), [CHILD_PRESS]);
    });
  }

  it('draws the child under a falsy const that a template block shadows', () => {
    const markup = '{#each items as shown}{#if shown}<C {label} />{/if}{/each}';
    const imports = "import C from './C.svelte'; const shown = false;";
    assert.deepEqual(idsOver(markup, { imports }), [CHILD_PRESS]);
  });

  for (const [claim, markup, wrapper] of [
    [
      'content its tag holds, as children',
      '<W {label}>{label}</W>',
      "<script>import C from './C.svelte'; let { label, children } = $props();</script>{#if children}<C {label} />{@render children()}{/if}",
    ],
    [
      'a snippet its tag holds, by the snippet’s name',
      '<W {label}>{#snippet header()}<b>{label}</b>{/snippet}</W>',
      "<script>import C from './C.svelte'; let { label, header } = $props();</script>{#if header}<C {label} />{@render header()}{/if}",
    ],
  ]) {
    it(`draws a wrapper’s guarded child when the parent passes ${claim}`, () => {
      const imports = "import W from './W.svelte';";
      assert.deepEqual(idsOver(markup, { imports, more: { [W]: wrapper } }), [CHILD_PRESS]);
    });
  }

  it('keeps a wrapper’s children falsy when its tag holds only white space', () => {
    const wrapper =
      "<script>import C from './C.svelte'; let { label, children } = $props();</script>{#if children}<C {label} />{/if}";
    const imports = "import W from './W.svelte';";
    assert.deepEqual(idsOver('<W {label}> </W>', { imports, more: { [W]: wrapper } }), []);
  });

  for (const [claim, imports, markup, more = {}] of [
    [
      'a const that holds its import',
      "import C from './C.svelte'; const Comp = C;",
      '<Comp {label} />',
    ],
    ['a svelte:component', "import C from './C.svelte';", '<svelte:component this={C} {label} />'],
    [
      'a .js module that re-exports it',
      "import { C } from './parts.js';",
      '<C {label} />',
      { 'src/parts.js': "export { default as C } from './C.svelte';" },
    ],
  ]) {
    it(`draws a child drawn through ${claim}, with no falsy prop`, () => {
      assert.deepEqual(idsOver(markup, { imports, more }), [CHILD_PRESS]);
      assert.deepEqual(childFalsy(markup, { imports, more }), []);
    });
  }

  for (const [claim, write] of [
    ['an array pattern', '[open] = [true];'],
    ['an object pattern', '({ open } = { open: true });'],
  ]) {
    it(`draws the child under a prop the entry writes through ${claim}`, () => {
      const imports = `import C from './C.svelte'; function toggle() { ${write} }`;
      const markup =
        '<button type="button" onclick={toggle}>t</button>{#if open}<C {label} />{/if}';
      assert.ok(idsOver(markup, { imports }).includes(CHILD_PRESS));
    });
  }

  it('reads a member off a falsy prop as falsy only as its length or an optional read no primitive holds', () => {
    const under = (test) =>
      idsOver(['{#if ', test, '}<C {label} />{/if}'].join(''), {
        props: ", blank = '', length = ''",
      });
    const computed = ['open?.[blank]', 'open[length]'];
    for (const test of ['blank.trim', 'blank?.trim', 'blank.missing', 'open?.[0]', ...computed]) {
      assert.deepEqual(under(test), [CHILD_PRESS], test);
    }
    for (const test of ['blank.length', 'open?.missing']) assert.deepEqual(under(test), [], test);
  });

  /** An entry file that runs `script` over `props`, then draws `markup`, with the child beside it. */
  const idsOverScript = (script, markup, props = 'label, open = false') =>
    controlsOf(
      entry,
      syntheticReader({
        [E]: `<script>import C from './C.svelte'; let { ${props} } = $props(); ${script}</script>${markup}`,
        [C]: CHILD,
      })
    ).map(({ id }) => id);
  const GUARDED = '{#if open}<C {label} />{/if}';
  const PRESS = '<button type="button" onclick={toggle}>t</button>';

  for (const [claim, script] of [
    ['an update', 'function toggle() { open++; }'],
    ['a for…of head', 'function toggle() { for (open of [1]); }'],
    ['a for…in head', 'function toggle() { for (open in { a: 1 }); }'],
  ]) {
    it(`draws the child under a prop the entry writes through ${claim}`, () => {
      assert.ok(idsOverScript(script, PRESS + GUARDED).includes(CHILD_PRESS));
    });
  }

  it('draws the child under a prop the template writes, by a bind: directive or an inline handler', () => {
    const bound = '<input bind:value={open} />';
    assert.ok(idsOverScript('', bound + GUARDED).includes(CHILD_PRESS));
    const inline = '<button type="button" onclick={() => (open = true)}>t</button>';
    assert.ok(idsOverScript('', inline + GUARDED).includes(CHILD_PRESS));
  });

  it('draws the child under a prop a module script writes, by name', () => {
    const source = `<script module>export function reset() { open = true; }</script>`;
    const reader = syntheticReader({
      [E]: `${source}<script>import C from './C.svelte'; let { label, open = false } = $props();</script>${GUARDED}`,
      [C]: CHILD,
    });
    assert.deepEqual(
      controlsOf(entry, reader).map(({ id }) => id),
      [CHILD_PRESS]
    );
  });

  it('leaves the child undrawn under a prop whose member the entry writes', () => {
    assert.ok(
      !idsOverScript('function toggle() { open.x = 1; }', PRESS + GUARDED).includes(CHILD_PRESS)
    );
  });

  it('draws a child in the {:else} branch of an {#if} on a falsy prop', () => {
    assert.deepEqual(idsOver('{#if open}x{:else}<C {label} />{/if}'), [CHILD_PRESS]);
  });

  it('draws the child under an entry prop whose unpublished default is truthy', () => {
    assert.deepEqual(idsOverScript('', GUARDED, 'label, open = true'), [CHILD_PRESS]);
  });

  it('reads a test as falsy only by the cases the module docblock lists', () => {
    const under = (test, props = '') =>
      idsOver(['{#if ', test, '}<C {label} />{/if}'].join(''), { props });
    for (const test of [
      'label || open',
      'String(open)',
      '1',
      'true',
      "'x'",
      'open ? label : open',
    ]) {
      assert.deepEqual(under(test), [CHILD_PRESS], test);
    }
    for (const test of ['undefined', 'open || undefined', 'Boolean(open)', 'open && label']) {
      assert.deepEqual(under(test), [], test);
    }
  });

  it('ends a cycle of consts at the name it began with, as a test no prop makes falsy', () => {
    const script = 'const first = second; const second = first;';
    assert.deepEqual(idsOverScript(script, '{#if first}<C {label} />{/if}'), [CHILD_PRESS]);
  });

  /** Tags `W` over `wTag`, with `wBody` its markup and `wProps` its props, and answers the ids. */
  const idsOverWrapper = (wTag, { wBody = '{#if show}<C />{/if}', wProps = 'show', script = '' }) =>
    controlsOf(
      entry,
      syntheticReader({
        [E]: `<script>import C from './C.svelte'; import W from './W.svelte'; let { label, open = false, ...rest } = $props(); ${script}</script>${wTag}`,
        [W]: `<script>import C from './C.svelte'; let { ${wProps} } = $props();</script>${wBody}`,
        [C]: CHILD,
      })
    ).map(({ id }) => id);

  it('keeps a wrapper’s guarded child undrawn where its tag passes only falsy values', () => {
    assert.deepEqual(idsOverWrapper('<W show={open} />', {}), []);
    assert.deepEqual(idsOverWrapper('<W />', {}), []);
    assert.deepEqual(idsOverWrapper('<W show="" />', {}), []);
    assert.deepEqual(idsOverWrapper('<W {...rest} />', {}), []);
  });

  for (const [claim, tag, script = ''] of [
    ['text that is not empty', '<W show="0" />'],
    ['text beside an expression', '<W show="{open}{label}" />'],
    ['a spread of a local that is not its rest', '<W {...other} />', 'const other = { show: 1 };'],
    [
      'a bound local, which anything may write',
      '<W bind:show={held} />',
      'let held = $state(false);',
    ],
  ]) {
    it(`draws a wrapper’s guarded child when its tag passes ${claim}`, () => {
      assert.deepEqual(idsOverWrapper(tag, { script }), [CHILD_PRESS]);
    });
  }

  it('draws a wrapper’s guarded child where its tag omits a prop whose default is truthy', () => {
    assert.deepEqual(idsOverWrapper('<W />', { wProps: 'show = true' }), [CHILD_PRESS]);
  });

  it('leaves a wrapper’s guarded child undrawn where only another prop carries content', () => {
    const wrapper = { wBody: '{#if header}<C />{/if}', wProps: 'header' };
    assert.deepEqual(idsOverWrapper('<W>{label}</W>', wrapper), []);
  });

  it('draws what a nested wrapper’s rest holds, a spread of a non-entry rest being no keep', () => {
    const entryTag = '<W show={true} />';
    const sources = {
      [E]: `<script>import W from './W.svelte'; let { label, ...rest } = $props();</script>${entryTag}`,
      [W]: "<script>import V from './V.svelte'; let { show, ...rest } = $props();</script><V {...rest} />",
      'src/V.svelte':
        "<script>import C from './C.svelte'; let { x } = $props();</script>{#if x}<C />{/if}",
      [C]: CHILD,
    };
    const ids = controlsOf(entry, syntheticReader(sources)).map(({ id }) => id);
    assert.deepEqual(ids, [CHILD_PRESS]);
  });

  it('draws a component the entry loads by import(), with no falsy prop', () => {
    const imports = "const load = () => import('./C.svelte');";
    assert.deepEqual(idsOver('', { imports }), [CHILD_PRESS]);
    assert.deepEqual(childFalsy('', { imports }), []);
  });

  it('draws a component drawn through a namespace import’s dotted tag, with no falsy prop', () => {
    const imports = "import * as Ns from './C.svelte';";
    assert.deepEqual(idsOver('<Ns.default {label} />', { imports }), [CHILD_PRESS]);
    assert.deepEqual(childFalsy('<Ns.default {label} />', { imports }), []);
  });
});

describe('a control two published entries reach (issue 2647)', () => {
  const C = 'src/C.svelte';
  const F = 'src/F.svelte';
  const CHILD_PRESS = `${C}: button[data-press]`;
  const drawerOf = (name, path) => ({
    name,
    path,
    root: 'fabricate',
    props: { label: { kind: 'data', required: true } },
  });
  const [e, f, g] = [drawerOf('E', E), drawerOf('F', F), drawerOf('G', 'src/G.svelte')];
  const DRAWING =
    "<script>import C from './C.svelte'; let { label } = $props();</script><C {label} />";
  const reader = syntheticReader({
    [E]: DRAWING,
    [F]: DRAWING,
    'src/G.svelte': '<script>let { label } = $props();</script><p>{label}</p>',
    [C]:
      '<script>let { label } = $props();</script>' +
      '<button type="button" data-keyboard-focus="true" data-press aria-label={label}>x</button>',
  });
  const NAMED = { [CHILD_PRESS]: { byEntry: { E: { keys: ['label'] }, F: { keys: ['label'] } } } };
  const faultsOf = (entry, reach, names = NAMED) =>
    controlFaults(entry, reach, reader, DYNAMIC_ELEMENTS, SCOPED_RINGS, names);

  it('passes a flat always row under each entry that reaches its file', () => {
    const reach = { [CHILD_PRESS]: 'always' };
    assert.deepEqual(faultsOf(e, reach), []);
    assert.deepEqual(faultsOf(f, reach), []);
    assert.deepEqual(byEntryRowFaults(reach, NAMED, [e, f, g], reader), []);
  });

  it('faults an entry a by-entry reach row omits, though the row lists the id', () => {
    const reach = { [CHILD_PRESS]: { byEntry: { F: 'always' } } };
    assert.deepEqual(faultsOf(f, reach), []);
    assert.deepEqual(faultsOf(e, reach), [`${CHILD_PRESS} has no reach pin`]);
    assert.deepEqual(byEntryRowFaults(reach, {}, [e, f], reader), [
      `reach ${CHILD_PRESS} names [F], and [E,F] reach it`,
    ]);
  });

  it('faults a by-entry reach row naming an entry that does not draw the id, or no entry', () => {
    const reach = {
      [CHILD_PRESS]: { byEntry: { E: 'always', F: 'always', G: 'always', H: null } },
    };
    assert.deepEqual(byEntryRowFaults(reach, {}, [e, f, g], reader), [
      `reach ${CHILD_PRESS} names H, which is no published entry`,
      `reach ${CHILD_PRESS} names [E,F,G,H], and [E,F] reach it`,
    ]);
  });

  it("faults a by-entry row on a published entry's own file", () => {
    const owner = { ...drawerOf('C', C), props: { label: { kind: 'data', required: true } } };
    const reach = { [CHILD_PRESS]: { byEntry: { C: 'always', E: 'always', F: 'always' } } };
    assert.ok(
      byEntryRowFaults(reach, {}, [e, f, owner], reader).includes(
        `reach ${CHILD_PRESS} is a by-entry row on a published entry's own file`
      )
    );
  });

  it('faults a by-entry name row naming an entry under which the control is unreached', () => {
    const reach = { [CHILD_PRESS]: { byEntry: { E: 'always', F: null } } };
    assert.deepEqual(byEntryRowFaults(reach, NAMED, [e, f], reader), [
      `name ${CHILD_PRESS} names [E,F], and [E] reach it`,
    ]);
  });

  it('faults a flat key pin one reaching entry passes and another does not publish', () => {
    const own = syntheticReader({
      [E]: [script('label, shown'), '{#if shown}', button(), '{/if}', styled(PAIR)].join(''),
      [F]: "<script>import E from './E.svelte'; let { label } = $props();</script><E {label} shown />",
    });
    const pins = { [PRESS]: 'shown' };
    const entry = { ...e, root: 'any', props: { ...e.props, shown: { kind: 'data' } } };
    assert.deepEqual(controlFaults(entry, pins, own), []);
    assert.ok(
      controlFaults(f, pins, own).includes(`${PRESS} is pinned to shown, which F does not publish`)
    );
  });

  const GROUPS = [
    '- **`E`.**',
    '  - It is a picker.',
    '    Rows are named by their glyph.',
    '- **`F`.**',
    '  - Rows are named by their tile.',
    '- **Private:** Rows are named by their hook.',
  ];
  const [control] = controlsOf(e, reader);
  const vocabulary = (sentence, heldBy = 'a mounted clause') =>
    closureNameFaults(control, { entry: 'E', vocabulary: sentence, heldBy }, GROUPS);

  it("passes a vocabulary pin whose sentence is a whole line of its entry's group", () => {
    assert.deepEqual(vocabulary('Rows are named by their glyph.'), []);
    assert.deepEqual(vocabulary('It is a picker.'), [], 'a list item reads as its sentence');
  });

  it("faults a vocabulary pin whose sentence its entry's group lacks, or that names no clause", () => {
    const LACKS = `${CHILD_PRESS} is named by a vocabulary E's group does not state`;
    for (const sentence of [
      'Rows are named by their tile.',
      'Rows are named by their hook.',
      'Rows are named by',
    ]) {
      assert.deepEqual(vocabulary(sentence), [LACKS], sentence);
    }
    const unheld = { entry: 'E', vocabulary: 'Rows are named by their glyph.' };
    assert.deepEqual(closureNameFaults(control, unheld, GROUPS), [
      `${CHILD_PRESS} is named by a vocabulary and names no mounted clause in heldBy`,
    ]);
  });
});

describe('a class or a style the drawn closure holds falsy (issue 2647)', () => {
  const OWN = `${E} ${OWN_FOCUS_RULE}`;
  /** The faults at fabricate of a marked button beside `markup`, publishing `props` beside `label`. */
  const heldFaults = (keys, markup, css, props = {}) =>
    syntheticFaults(script(keys) + markup + button() + (css ? styled(css) : ''), {
      pin: 'always',
      root: 'fabricate',
      props: { label: { kind: 'data', required: true }, ...props },
    });
  const RULE = '.x:focus-visible { color: var(--fab-text); }';
  const CLASSED = '<span class:x={p}></span>';

  it('exempts a focus rule on a class only a class: directive on an unpublished falsy prop writes', () => {
    assert.deepEqual(heldFaults('label, p = false', CLASSED, RULE), []);
  });

  it('faults the same rule when the prop is published, or its default is truthy', () => {
    assert.deepEqual(heldFaults('label, p = false', CLASSED, RULE, { p: { kind: 'data' } }), [OWN]);
    assert.deepEqual(heldFaults('label, p = true', CLASSED, RULE), [OWN]);
  });

  const styledPress = (keys, props = {}) =>
    syntheticFaults(script(keys) + button(LABEL, ' style={s}'), {
      pin: 'always',
      root: 'fabricate',
      props: { label: { kind: 'data', required: true }, ...props },
    });

  it('reads a style attribute of one expression the drawn closure holds falsy as no inline style', () => {
    assert.deepEqual(styledPress("label, s = ''"), []);
  });

  it('faults the same style attribute when its prop is published, or its default is truthy', () => {
    assert.deepEqual(styledPress("label, s = ''", { s: { kind: 'data' } }), [INLINE_STYLE]);
    assert.deepEqual(styledPress("label, s = 'outline: none'"), [INLINE_STYLE]);
  });
});
