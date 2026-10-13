/**
 * What a published entry that draws a control must hold (issue 2452), over each entry's import
 * closure: every `callback` key is called from an event handler; every focusable element is pinned
 * to the published key that draws it, to `'always'`, or to `null`; and a reached one draws its own
 * mark for keyboard focus and is named by the companion. The test-only probe runs beside the
 * shipped entries. A key's kind and `args` are `published-component-manifest.test.js`'s.
 * Limit: reach reads the entry's own file and does not follow a derived guard, so the chip's
 * `null` pin rests on that gate's pin of its published keys.
 * Limit: the focus mark reads declarations; the computed half is `notice-mounted.test.js`'s. A mark
 * that is not an outline is refused.
 * Limit: a `svelte:element` tag is still unseen, as rule 9 does not see it.
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
import { walkNodes } from './helpers/moduleAst.js';
import {
  SHIPPED,
  attributeOf,
  byName,
  focusableElements,
  importClosure,
  isComponent,
  propLocals,
  staticText,
  syntheticReader,
  walkWithAncestors,
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
  'src/ui/svelte/components/Notice.svelte: button[data-notice-action]': null,
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

/** Whether a reference is an `on…` attribute's whole value on a native element, or inside a function that is. */
function isEventReference(ancestors) {
  const at = ancestors.findLastIndex(
    (ancestor) => ancestor.type === 'Attribute' && ancestor.name.startsWith('on')
  );
  if (at < 1 || ancestors[at - 1].type !== 'RegularElement') return false;
  const [tag, value] = ancestors.slice(at + 1);
  return tag?.type === 'ExpressionTag' && (value === undefined || isFunction(value));
}

/** Whether a reference is read, and not called, in the test of an `{#if}`. */
function isGuardRead(node, ancestors) {
  const at = ancestors.findLastIndex((ancestor) => ancestor.type === 'IfBlock');
  if (at === -1) return false;
  const path = [...ancestors.slice(at + 1), node];
  if (path[0] !== ancestors[at].test) return false;
  return path.every(
    (step, index) => step.type !== 'CallExpression' || step.callee !== path[index + 1]
  );
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
function controlsOf(entry, reader = SHIPPED) {
  const own = new Map(
    propLocals(reader.component(entry.path))
      .filter(({ key }) => Object.hasOwn(entry.props, key))
      .map(({ key, local }) => [local, key])
  );
  return [...importClosure(entry.path, reader)].filter(isComponent).flatMap((file) => {
    const ast = reader.component(file);
    const published = file === entry.path ? own : new Map();
    return focusableElements(file, ast).elements.map((element) => ({
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
    const known = Object.hasOwn(entry.props, pin);
    return known ? [] : [`${id} is pinned to ${pin}, which ${entry.name} does not publish`];
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

/** The pseudo-class a rule states on one subject made only of classes in `classes`, or `null`. */
function focusRuleOn(rule, classes) {
  const [complex, ...others] = rule.prelude.children;
  if (others.length > 0 || complex.children.length !== 1) return null;
  const parts = complex.children[0].selectors;
  const named = parts.filter((part) => part.type === 'ClassSelector');
  const pseudo = parts.filter((part) => part.type === 'PseudoClassSelector');
  if (pseudo.length !== 1 || named.length === 0 || named.length + 1 !== parts.length) return null;
  return named.every((part) => classes.includes(part.name)) ? pseudo[0].name : null;
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

/**
 * What a reached control's focus mark breaks. At `any`, its file holds a `:focus` rule declaring
 * exactly `outline: none` and `box-shadow: none`, then a `:focus-visible` rule drawing the module
 * ring, each on a subject made only of the element's static classes. At another root its tag is
 * one the module ring names.
 */
function focusMarkFaults({ id, node, ast, entry }, moduleRule = moduleRing()) {
  if (entry.root !== 'any') {
    const named =
      moduleRule.tags.includes(node.name) ||
      moduleRule.attributes.some((name) => attributeOf(node, name));
    return named ? [] : [`${id} is a <${node.name}>, which the module ring does not name`];
  }
  const classes = (staticText(attributeOf(node, 'class')) ?? '').split(/\s+/).filter(Boolean);
  const rules = styleRules(ast).map((rule) => [focusRuleOn(rule, classes), rule]);
  const strip = rules.findIndex(([pseudo]) => pseudo === 'focus');
  const mark = rules.findIndex(([pseudo]) => pseudo === 'focus-visible');
  const faults = [];
  if (strip === -1) faults.push(`${id} has no :focus rule on its own classes`);
  else if (!isStrip(rules[strip][1])) {
    faults.push(`${id} :focus does not declare exactly outline: none and box-shadow: none`);
  }
  if (mark === -1) return [...faults, `${id} has no :focus-visible rule on its own classes`];
  if (strip !== -1 && mark < strip) faults.push(`${id} :focus-visible comes before :focus`);
  return [...faults, ...markFaults(id, rules[mark][1], moduleRule)];
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

/** What one part of a name breaks: text, an expression, or a render tag. */
function namePartFault(part, { published, entry }) {
  const kindOf = (local) => entry.props[published.get(local)]?.kind;
  if (part.type === 'Text') return LITERAL;
  if (part.type === 'RenderTag') {
    const { callee } =
      part.expression.type === 'ChainExpression' ? part.expression.expression : part.expression;
    return kindOf(callee?.name) === 'text' ? null : UNPUBLISHED_NAME;
  }
  if (part.type !== 'ExpressionTag') return UNPUBLISHED_NAME;
  const { expression } = part;
  if (expression.type === 'Literal' || expression.type === 'TemplateLiteral') return LITERAL;
  return kindOf(rootLocal(expression)) === 'data' ? null : UNPUBLISHED_NAME;
}

/**
 * What a reached control's name breaks: its `aria-label`, or else its content, is an expression
 * rooted at a published `data` key's local, or a `text` key's render tag.
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

/** Every fault of every control an entry draws, against `pins`. */
function controlFaults(entry, pins, reader = SHIPPED) {
  return controlsOf(entry, reader).flatMap((control) => [
    ...reachFaults(control, pins),
    ...(isReached(control, pins) ? [...focusMarkFaults(control), ...nameFaults(control)] : []),
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
});

describe('the name clause', () => {
  const props = {
    label: { kind: 'data' },
    caption: { kind: 'text' },
    onPress: { kind: 'callback' },
  };
  const named = (content, open = '') =>
    syntheticFaults(
      script('label, caption, onPress, other') + button(content, open) + styled(PAIR),
      { props, pin: 'always' }
    );

  it('passes a name rooted at a published data key, as content or aria-label, and the render tag of a text key', () => {
    assert.deepEqual(named(LABEL), []);
    assert.deepEqual(named('{label?.short}'), []);
    assert.deepEqual(named('<i></i>', ' aria-label={label.long}'), []);
    assert.deepEqual(named('{@render caption?.()}'), []);
  });

  for (const [claim, content, open, fault] of [
    ['a literal', 'Close', '', LITERAL],
    ['a literal aria-label', '', ' aria-label="Close"', LITERAL],
    ['a literal expression', "{'Close'}", '', LITERAL],
    ['a literal fallback', "{label ?? 'Close'}", '', UNPUBLISHED_NAME],
    ['a name rooted at a callback key', '{onPress.name}', '', UNPUBLISHED_NAME],
    ['a name rooted at an unpublished prop', '{other}', '', UNPUBLISHED_NAME],
    ['a render tag of a key that is no text key', '{@render label?.()}', '', UNPUBLISHED_NAME],
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
  const KEYS = 'inEffect, inText, inTest, inDerived, unused, onlyRead, clean, read: renamed';
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
      '{#if onlyRead}<b></b>{/if}',
      '{#if renamed && clean}',
      '  <button type="button" onclick={clean}>x</button>',
      '  <button type="button" onclick={() => { renamed?.(); inEffect?.(); inText?.(); inTest?.(); inDerived?.(); }}>y</button>',
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
    [
      'a handler on svelte:element',
      closed('', '<svelte:element this="button" onclick={() => onPress?.()}></svelte:element>'),
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

  it('judges no key that is not a published callback', () => {
    assert.deepEqual(eventFaults({ props: { inEffect: { kind: 'data' } } }, SYNTHETIC), []);
  });
});
