/**
 * What a published entry that draws a control must hold (issue 2452), over each entry's import
 * closure: every `callback` key is called from an event handler; every focusable element is pinned
 * to the published key that draws it, to `'always'`, or to `null`; a reached one draws its own
 * mark for keyboard focus and is named by the companion; a closure that takes a window's ring
 * states no focus rule of its own; and no rule outside the published `Notice` styles its action
 * button. The test-only probe runs beside the shipped entries. A key's kind and `args` are
 * `published-component-manifest.test.js`'s.
 * Limit: reach reads the entry's own file and does not follow a derived guard, so the chip's
 * `null` pin rests on that gate's pin of its published keys.
 * Limit: the focus mark reads declarations; the computed half is `notice-mounted.test.js`'s. A mark
 * that is not an outline is refused.
 * Limit: a `svelte:element` is judged by its pinned tags, which that gate holds to its file.
 * Limit: a handler declared in `<script>` and named by an attribute fails closed, as does a
 * callback handed to a child component.
 * Limit: a name is read from the element's own `aria-label` or content, not from a child element
 * or `aria-labelledby`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { stylesheetSources } from '../scripts/lib/stylesheetSource.js';
import { PUBLISHED_COMPONENT_MANIFEST } from '../src/ui/publishedComponentManifest.js';

import { PROBE_ENTRY } from './fixtures/published-components/probeEntry.js';
import { templateOf } from './helpers/apiConvention.js';
import { walkNodes, walkWithAncestors } from './helpers/moduleAst.js';
import {
  DYNAMIC_ELEMENTS,
  SHIPPED,
  attributeOf,
  byName,
  everyStylesheet,
  focusableElements,
  importClosure,
  isComponent,
  isControlTag,
  propLocals,
  publishedLocals,
  selectorsNaming,
  selectorsOnAttribute,
  staticText,
  syntheticReader,
  writtenSelector,
} from './helpers/publishedComponentGate.js';
import { styleRules } from './helpers/svelteStructureContract.js';

const ENTRIES = Object.freeze([...PUBLISHED_COMPONENT_MANIFEST, PROBE_ENTRY]);

/**
 * Each focusable element the shipped closures draw, by file and static hook: the published key
 * whose guard draws it, `'always'` for one no guard hides, or `null` for one no published key
 * reaches.
 */
const FOCUSABLE_REACH = Object.freeze({
  // Under `removeControl`, a derived of three props the entry does not publish.
  'src/ui/svelte/components/Chip.svelte: button[data-chip-remove]': null,
  'src/ui/svelte/components/Notice.svelte: button[data-notice-action]': 'action',
  'src/ui/svelte/components/Notice.svelte: button[data-notice-dismiss]': null,
  'tests/fixtures/published-components/PublishedProbe.svelte: button[data-probe-press]': 'always',
});

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

/** Whether a reference is an `on…` attribute's whole value on a DOM element, or inside a function that is. */
function isEventReference(ancestors) {
  const at = ancestors.findLastIndex(
    (ancestor) => ancestor.type === 'Attribute' && ancestor.name.startsWith('on')
  );
  if (at < 1 || !DOM_ELEMENTS.has(ancestors[at - 1].type)) return false;
  const [tag, value] = ancestors.slice(at + 1);
  return tag?.type === 'ExpressionTag' && (value === undefined || isFunction(value));
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

/** Where each reference to `local` sits: `'event'`, `'guard'` or `'other'`; its own declaration is none. */
function referenceSites(ast, local) {
  const sites = [];
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
      if (isEventReference(ancestors)) sites.push('event');
      else sites.push(isGuardRead(node, ancestors) ? 'guard' : 'other');
    });
  }
  return sites;
}

/** What each `callback` key of an entry breaks: referenced outside an event, or called by none. */
function eventFaults(entry, ast) {
  const callbacks = propLocals(ast).filter(({ key }) => entry.props[key]?.kind === 'callback');
  return callbacks.flatMap(({ key, local }) => {
    const sites = referenceSites(ast, local);
    return [
      ...(sites.includes('other') ? [`${key} ${OUTSIDE_AN_EVENT}`] : []),
      ...(sites.includes('event') ? [] : [`${key} ${NOTHING_CALLS}`]),
    ];
  });
}

/**
 * Every focusable element an entry's closure draws, each with the entry and its parsed file. An
 * element in the entry's own file also carries the entry's published keys by local name.
 */
function controlsOf(entry, reader = SHIPPED, dynamic = DYNAMIC_ELEMENTS) {
  const own = publishedLocals(entry, reader.component(entry.path));
  return [...importClosure(entry.path, reader)].filter(isComponent).flatMap((file) => {
    const ast = reader.component(file);
    const published = file === entry.path ? own : new Map();
    return focusableElements(file, ast, dynamic).elements.map((element) => ({
      ...element,
      entry,
      ast,
      published,
    }));
  });
}

/** What one control's pin breaks. */
function reachFaults({ id, guards, published, entry }, pins) {
  if (!Object.hasOwn(pins, id)) return [`${id} has no reach pin`];
  const pin = pins[id];
  if (pin === 'always') return guards.size > 0 ? [`${id} is pinned always under a guard`] : [];
  if (pin !== null) {
    if (!Object.hasOwn(entry.props, pin)) {
      return [`${id} is pinned to ${pin}, which ${entry.name} does not publish`];
    }
    const named = [...guards].some((name) => published.get(name) === pin);
    return named ? [] : [`${id} is pinned to ${pin}, which no guard above it names`];
  }
  if (guards.size === 0) return [`${id} is pinned null under no guard`];
  return [...guards]
    .filter((name) => published.has(name))
    .map((name) => `${id} is pinned null under a guard that names ${published.get(name)}`);
}

const isReached = ({ id }, pins) => pins[id] !== null && pins[id] !== undefined;

const isRingSelector = (complex) => {
  const [root, subject, ...deeper] = complex.children;
  if (!subject || deeper.length > 0) return false;
  const [rootPart, ...rootRest] = root.selectors;
  const [element, pseudo, ...rest] = subject.selectors;
  return (
    rootRest.length === 0 &&
    rootPart.type === 'ClassSelector' &&
    rootPart.name === 'fabricate' &&
    rest.length === 0 &&
    (element.type === 'TypeSelector' || element.type === 'AttributeSelector') &&
    pseudo?.type === 'PseudoClassSelector' &&
    pseudo.name === 'focus-visible'
  );
};

const declarationsOf = (rule) =>
  rule.block.children
    .filter((node) => node.type === 'Declaration')
    .map((node) => [node.property, node.value.replaceAll(/\s+/g, ' ').trim()]);

let ring;
/** The module's keyboard ring, read from `styles/fabricate-base.css`: the elements it names and what it draws. */
function moduleRing() {
  if (ring) return ring;
  const base = stylesheetSources().parts.find(({ file }) => file === 'styles/fabricate-base.css');
  const { css } = templateOf(base.file, `<style>${base.text}</style>`).ast;
  const rules = [...walkNodes(css)].filter(
    (node) => node.type === 'Rule' && node.prelude.children.every(isRingSelector)
  );
  assert.equal(rules.length, 1, 'one `.fabricate <element>:focus-visible` rule');
  const named = rules[0].prelude.children.map((complex) => complex.children[1].selectors[0]);
  const drawn = Object.fromEntries(declarationsOf(rules[0]));
  ring = {
    tags: named.filter((part) => part.type === 'TypeSelector').map((part) => part.name),
    attributes: named.filter((part) => part.type === 'AttributeSelector').map((part) => part.name),
    outline: drawn.outline,
    offset: drawn['outline-offset'],
  };
  return ring;
}

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

const FOCUS_STRIP = JSON.stringify([
  ['box-shadow', 'none'],
  ['outline', 'none'],
]);
const byProperty = ([a], [b]) => byName(a, b);
const isStrip = (rule) => JSON.stringify(declarationsOf(rule).sort(byProperty)) === FOCUS_STRIP;
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

/** The local an expression is rooted at: itself, or the object its member chain starts from. */
function rootLocal(expression) {
  let node = expression;
  while (node.type === 'ChainExpression' || node.type === 'MemberExpression') {
    node = node.type === 'ChainExpression' ? node.expression : node.object;
  }
  return node.type === 'Identifier' ? node.name : null;
}

const LITERAL = 'is named by a literal';
const UNPUBLISHED_NAME = "is not named by a published data key or a text key's render tag";
const OPTIONAL_NAME = 'is named by a text key that is not required';

/** What one part of a name breaks: text, an expression, or a render tag. */
function namePartFault(part, { published, entry }) {
  const specOf = (local) => entry.props[published.get(local)];
  const kindOf = (local) => specOf(local)?.kind;
  if (part.type === 'Text') return LITERAL;
  if (part.type === 'RenderTag') {
    const { callee } =
      part.expression.type === 'ChainExpression' ? part.expression.expression : part.expression;
    if (kindOf(callee?.name) !== 'text') return UNPUBLISHED_NAME;
    return specOf(callee.name).required === true ? null : OPTIONAL_NAME;
  }
  if (part.type !== 'ExpressionTag') return UNPUBLISHED_NAME;
  const { expression } = part;
  if (expression.type === 'Literal' || expression.type === 'TemplateLiteral') return LITERAL;
  return kindOf(rootLocal(expression)) === 'data' ? null : UNPUBLISHED_NAME;
}

/**
 * What a reached control's name breaks: its `aria-label`, or else its content, is an expression
 * rooted at a published `data` key's local, or a required `text` key's render tag.
 */
function nameFaults(control) {
  const { id, node } = control;
  const label = attributeOf(node, 'aria-label');
  const parts = label
    ? [label.value === true ? { type: 'Text' } : label.value].flat()
    : node.fragment.nodes.filter((child) => child.type !== 'Text' || child.data.trim() !== '');
  if (parts.length === 0) return [`${id} has no name`];
  const faults = parts.map((part) => namePartFault(part, control)).filter(Boolean);
  return [...new Set(faults)].map((fault) => `${id} ${fault}`);
}

const FOCUS_PSEUDO_CLASSES = new Set(['focus', 'focus-visible', 'focus-within']);
const OWN_FOCUS_RULE = 'states a focus rule of its own under a root that supplies the ring';
const declaresUnderRing = (property) => `declares ${property} under a root that supplies the ring`;

/**
 * What a closure whose reached control takes a window's ring breaks: no file of it holds a selector
 * that carries a focus pseudo-class anywhere, in or out of an at-rule, scoped or `:global`, and
 * none declares `all` or a property whose name starts `outline`. Vacuous at `any`, and for a
 * closure that draws no reached control.
 */
function focusRuleFaults(entry, controls, pins, reader) {
  const reached = controls.filter((control) => isReached(control, pins));
  if (entry.root === 'any' || reached.length === 0) return [];
  return [...importClosure(entry.path, reader)].filter(isComponent).flatMap((file) => {
    const nodes = [...walkNodes(reader.component(file).css)];
    const own = nodes.some(
      (node) => node.type === 'PseudoClassSelector' && FOCUS_PSEUDO_CLASSES.has(node.name)
    );
    const declared = nodes
      .filter((node) => node.type === 'Declaration')
      .map((node) => node.property)
      .filter((property) => property === 'all' || property.startsWith('outline'));
    const faults = [...new Set(declared)].map((property) => declaresUnderRing(property));
    return [...(own ? [OWN_FOCUS_RULE] : []), ...faults].map((fault) => `${file} ${fault}`);
  });
}

/** Every fault of every control an entry draws, against `pins`, then of its closure's focus rules. */
function controlFaults(entry, pins, reader = SHIPPED, dynamic = DYNAMIC_ELEMENTS) {
  const controls = controlsOf(entry, reader, dynamic);
  const faults = controls.flatMap((control) => [
    ...reachFaults(control, pins),
    ...(isReached(control, pins) ? [...focusMarkFaults(control), ...nameFaults(control)] : []),
  ]);
  return [...faults, ...focusRuleFaults(entry, controls, pins, reader)];
}

/** The notice's action button, by the class and the hook it writes, and the file that may style it. */
const NOTICE_ACTION = Object.freeze({
  path: 'src/ui/svelte/components/Notice.svelte',
  classes: ['fab-notice-button'],
  attributes: ['data-notice-action'],
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

    it(`${entry.name} draws each control under its pinned key, marked for keyboard focus and named by the companion`, () => {
      assert.deepEqual(controlFaults(entry, FOCUSABLE_REACH), []);
    });
  }

  it('pins every focusable element the shipped closures draw, and no other', () => {
    const drawn = ENTRIES.flatMap((entry) => controlsOf(entry).map(({ id }) => id));
    assert.deepEqual([...new Set(drawn)].sort(byName), Object.keys(FOCUSABLE_REACH).sort(byName));
  });

  it('styles the notice action in no rule outside the notice, by its class or by its hook', () => {
    const own = importClosure(NOTICE_ACTION.path, SHIPPED);
    assert.ok(own.has(NOTICE_ACTION.path), 'the notice was read');
    assert.deepEqual(partSelectors(everyStylesheet(), NOTICE_ACTION, own), []);
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
function syntheticFaults(markup, { props = { label: { kind: 'data' } }, pin, root = 'any' }) {
  const entry = { name: 'E', path: E, root, props };
  const pins = pin === undefined ? {} : { [PRESS]: pin };
  const faults = controlFaults(entry, pins, syntheticReader({ [E]: markup }));
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
function dynamicFaults(tags, content = LABEL, props = { label: { kind: 'data' } }) {
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

  const props = { rows: { kind: 'data' }, label: { kind: 'data' } };
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
    const entry = { name: 'E', path: E, root: 'fabricate', props: { label: { kind: 'data' } } };
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

  it('names a focus rule in another file of the closure, by that file', () => {
    const entry = { name: 'E', path: E, root: 'fabricate', props: { label: { kind: 'data' } } };
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

  it('names a selector that holds the action hook, and no other attribute', () => {
    const css = '.a [data-notice-action] > i, .b[data-notice-dismiss] { gap: 0 }';
    assert.deepEqual(partSelectors(sheet(css), NOTICE_ACTION), [
      'sheet.css: .a [data-notice-action] > i',
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
    label: { kind: 'data' },
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

  it('reads the render tag inside a svelte:element as it reads one inside a button', () => {
    assert.deepEqual(dynamicFaults(['button'], '{@render caption?.()}', props), []);
    assert.deepEqual(dynamicFaults(['button'], '{@render note?.()}', props), [OPTIONAL_NAME]);
  });

  for (const [claim, content, open, fault] of [
    ['a literal', 'Close', '', LITERAL],
    ['a literal aria-label', '', ' aria-label="Close"', LITERAL],
    ['a literal expression', "{'Close'}", '', LITERAL],
    ['a literal fallback', "{label ?? 'Close'}", '', UNPUBLISHED_NAME],
    ['a name rooted at a callback key', '{onPress.name}', '', UNPUBLISHED_NAME],
    ['a name rooted at an unpublished prop', '{other}', '', UNPUBLISHED_NAME],
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
  for (const [claim, markup] of [
    [
      'a handler declared in <script>',
      closed(
        ' function press() { onPress?.(); }',
        '<button type="button" onclick={press}>x</button>'
      ),
    ],
    ['a callback handed to a child component', closed('', '<Child onclick={onPress} />')],
    ['a handler on svelte:window', closed('', '<svelte:window onclick={onPress} />')],
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
