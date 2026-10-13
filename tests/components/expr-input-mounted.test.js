/**
 * Issue 2465 — `<ExprInput>` (`RollDataExpressionInput.svelte`): one input that shows and writes
 * the stored expression unchanged and carries its caller's class and attributes, the reading it
 * draws of what the expression resolves to, the row of tokens that each insert a term at the caret,
 * and the one status region that speaks the reading after an edit.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test';

import { Window } from 'happy-dom';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { ANNOUNCE_AFTER_FOCUS_MS } from '../../src/ui/svelte/util/announceAfterFocus.js';
import { declarationViolations, readDeclaration } from '../helpers/apiConvention.js';
import { parseDesignLibrary, readDesignLibrary } from '../helpers/designLibrary.js';
import { walkNodes } from '../helpers/moduleAst.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { declaredPropNames } from '../helpers/sveltePropsDeclaration.js';
import { attributeValue } from '../helpers/svelteStructureContract.js';
import { parsedTemplates } from '../helpers/svelteTemplateScan.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const RDE = 'src/ui/svelte/apps/manager/RollDataExpressionInput.svelte';
const CCVF = 'src/ui/svelte/apps/manager/checks/CheckCharacterValueField.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-expr-input-',
  rawModules: ['src/ui/svelte/util/announceAfterFocus.js'],
  compiledModules: [
    'src/ui/svelte/components/Button.svelte',
    'src/ui/svelte/components/Chip.svelte',
    RDE,
  ],
  componentPath: RDE,
});

const templates = parsedTemplates();
const component = templates.find(({ file }) => file === RDE);

/** Props the component took before issue 2465, which no call site may pass again. */
const RETIRED_PROPS = Object.freeze(['sigil', 'dataField', 'inputAttrs']);

/** Hooks the hand-rolled rows this field replaced carried, which no template may write again. */
const RETIRED_HOOKS = Object.freeze([
  'data-world-modifier-suggestion',
  'data-world-modifier-suggestions',
  'data-check-formula-token',
  'data-check-formula-tokens',
]);

/** Classes those rows were drawn by, which no rule in the module sheet may name again. */
const RETIRED_CLASSES = Object.freeze([
  'manager-tag-suggestion',
  'manager-modifier-expression-suggestion',
  'manager-modifier-expression-suggestions',
  'manager-checks-formula-input',
  'manager-checks-formula-token',
  'manager-checks-formula-tokens',
]);

/** The planned-migrations row that names what still holds the entry at target: the file's place. */
const MIGRATION_SUBJECT = 'Expression field placement';

/** The entry's status, the prop names its API list sets in bold, and the migration subjects. */
function readEntry() {
  const html = readDesignLibrary();
  const block = parseDesignLibrary(html).blocks.find(({ names }) => names.includes('ExprInput'));
  const window = new Window();
  window.document.write(html);
  const heading = [...window.document.querySelectorAll('.notes h5')].find(
    (h5) => h5.textContent === 'ExprInput API'
  );
  const bold = [...(heading?.parentElement.querySelectorAll(':scope li:not(.k-hint) b') ?? [])];
  const entry = {
    status: block?.perNameStatus.ExprInput,
    names: bold.map((run) => run.textContent).filter((text) => /^[a-z][A-Za-z0-9]*$/u.test(text)),
    subjects: [...window.document.querySelectorAll('section#log tbody tr > td:first-child')].map(
      (cell) => cell.textContent.trim()
    ),
  };
  window.close();
  return entry;
}

function type(input, text) {
  input.value = text;
  input.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
}

/** Every call-site tag of the component under `src/ui/svelte`: its attribute names and spreads. */
function callSiteTags() {
  return templates.flatMap(({ file, ast }) =>
    [...walkNodes(ast.fragment)]
      .filter((node) => node.type === 'Component' && node.name === 'RollDataExpressionInput')
      .map((node) => ({
        file,
        names: node.attributes
          .filter((attribute) => attribute.type === 'Attribute')
          .map((attribute) => attribute.name),
        spreads: node.attributes.filter((attribute) => attribute.type === 'SpreadAttribute').length,
      }))
  );
}

/**
 * A value with its selection marked: one `|` is a collapsed caret, two bound a selected range.
 *
 * @param {string} text e.g. `'@a + |@b| + @c'`
 * @returns {{ value: string, start: number, end: number }}
 */
function marked(text) {
  const start = text.indexOf('|');
  const last = text.lastIndexOf('|');
  return { value: text.replaceAll('|', ''), start, end: last === start ? start : last - 1 };
}

const tokenButtons = (target) => [...target.querySelectorAll('.fab-expr-input-token')];

/** The template element whose static `class` holds `className`. */
function elementByClass(nodes, className) {
  return nodes.find(
    (node) =>
      node.type === 'RegularElement' &&
      (attributeValue(node, 'class') ?? '').split(/\s+/u).includes(className)
  );
}

/** A resolver over sums of numbers: `6 + 6` is 12, and anything else does not reduce. */
function sums(expression) {
  const total = expression
    .split('+')
    .reduce((held, term) => held + (term.trim() === '' ? NaN : Number(term)), 0);
  return Number.isFinite(total) ? total : null;
}

/** What a caller passes for a reading: the resolver and its statement. */
const READING = Object.freeze({ resolve: sums, unresolvedLabel: 'Unresolved' });

const readingOf = (target) => target.querySelector('[data-expr-input-reading]');
const statusOf = (target) => target.querySelector('[data-expr-input-status]');

/** A node's tag and classes, less the compiler's scoping class. */
const shapeOf = (node) =>
  [node.tagName, ...node.classList].filter((name) => !name.startsWith('svelte-'));

/** Every `console[level]` line logged while `run` resolves. */
async function loggedDuring(level, run) {
  const lines = [];
  const original = console[level];
  console[level] = (...parts) => {
    lines.push(parts.join(' '));
  };
  try {
    await run();
  } finally {
    console[level] = original;
  }
  return lines;
}

/**
 * Mount the field over `from`, put its selection where `from` marks it, and press `token` as a
 * real press leaves the page: focus on the token before its click.
 */
async function pressAt(from, token, props = {}) {
  const written = [];
  const { value, start, end } = marked(from);
  const target = await harness.mount({
    value,
    tokens: [token],
    tokensLabel: 'Add a term',
    onChange: (expression) => {
      written.push(expression);
    },
    ...props,
  });
  const input = target.querySelector('input');
  input.focus();
  input.setSelectionRange(start, end);
  const [button] = tokenButtons(target);
  button.focus();
  button.click();
  return { target, input, written };
}

/** What a press must leave: one write of `expected`'s text, focus on the field, the caret marked. */
function assertInserted({ input, written }, expected, name) {
  const { value, start } = marked(expected);
  assert.deepEqual(written, [value], `${name}: \`onChange\` fires once, with the whole expression`);
  assert.equal(input.value, value, `${name}: the field holds what was written`);
  assert.ok(globalThis.document.activeElement === input, `${name}: focus returns to the field`);
  assert.deepEqual(
    [input.selectionStart, input.selectionEnd],
    [start, start],
    `${name}: the caret stands directly after the term`
  );
}

/** Each row: what it shows, the field before the press, and the field after `1d4` is pressed. */
const INSERTIONS = Object.freeze([
  ['an empty field takes the term alone', '|', '1d4|'],
  ['the end after an operand takes a +', '@a|', '@a + 1d4|'],
  ['a trailing + is completed, not doubled', '@a +|', '@a + 1d4|'],
  ['so is a + with spaces after it', '@a +   |', '@a + 1d4|'],
  ['a trailing - is kept', '@a -|', '@a - 1d4|'],
  ['a trailing % is an operator too', '@a %|', '@a % 1d4|'],
  ['a trailing / is an operator', '@a /|', '@a / 1d4|'],
  ['a ** is completed', '2 **|', '2 ** 1d4|'],
  ['an open bracket takes no operator', 'floor((|', 'floor(( 1d4|'],
  ['the start of a non-blank value joins the operand after it', '|@a', '1d4| + @a'],
  ['between an operand and an operator', '@a| + @b', '@a + 1d4| + @b'],
  ['before a -', '@a| - @b', '@a + 1d4| - @b'],
  ['before a *', '@a| * 2', '@a + 1d4| * 2'],
  ['before a /', '@a| / 2', '@a + 1d4| / 2'],
  ['before a %', '@a |% 2', '@a + 1d4| % 2'],
  ['between the two stars of a power', '2 *|* 3', '2 * 1d4| * 3'],
  ['an unspaced / bounds a term', '@a/|@b', '@a/ 1d4| + @b'],
  ['an unspaced % bounds a term', '@a%|@b', '@a% 1d4| + @b'],
  ['a selected term is replaced', '@a + |@b| + @c', '@a + 1d4| + @c'],
  ['before a closing bracket', 'floor(@a|)', 'floor(@a + 1d4|)'],
  ['after a comma', 'max(@a,|', 'max(@a, 1d4|'],
  ['before a comma', 'max(@a|, 2)', 'max(@a + 1d4|, 2)'],
  [
    'the whole value selected joins the end, and the old text stands',
    '|@a + @b|',
    '@a + @b + 1d4|',
  ],
  ['a caret inside a path appends', '@abil|ities.dex', '@abilities.dex + 1d4|'],
  ['a caret inside a function name appends', 'flo|or(@a)', 'floor(@a) + 1d4|'],
  ['a caret inside a die appends', '2d|6', '2d6 + 1d4|'],
  ['a caret inside a number appends', '1|0', '10 + 1d4|'],
  ['a caret between a function and its bracket appends', 'floor|(@a)', 'floor(@a) + 1d4|'],
  ['a selection cut inside a path appends', '2d6 + @|prof|', '2d6 + @prof + 1d4|'],
  ['so does one cut at both ends', '@ab|c + d|ef', '@abc + def + 1d4|'],
]);

before(() => harness.setup());
afterEach(() => harness.remount());
after(() => harness.teardown());

describe('ExprInput (issue 2465)', () => {
  it('renders one text input holding the stored expression, with no affix', async () => {
    const target = await harness.mount({ value: '@abilities.dex.mod' });
    assert.equal(target.children.length, 1, 'one root element');
    const input = target.firstElementChild;
    assert.ok(input.matches('input[type="text"]'), 'and it is the text input');
    assert.equal(input.value, '@abilities.dex.mod');
    assert.ok(!target.querySelector('.manager-prerequisite-path-input'), 'no affix wrapper');
    assert.ok(!target.querySelector('.manager-prerequisite-at'), 'no `@` cap');
    assert.ok(!input.hasAttribute('data-roll-data-expression'), 'no retired hook');
  });

  it("lands the caller's class and attributes on the input", async () => {
    const attributes = {
      'data-hook': 'expression',
      'aria-label': 'Expression',
      'aria-invalid': 'true',
      title: 'A roll expression',
    };
    const target = await harness.mount({
      class: 'site-x',
      tokens: ['@prof'],
      tokensLabel: 'Add a term',
      ...attributes,
    });
    const input = target.querySelector('input');
    assert.deepEqual(
      [...input.classList].filter((name) => !name.startsWith('svelte-')),
      ['fab-expr-input', 'site-x']
    );
    const row = target.querySelector('.fab-expr-input-row');
    const group = row.querySelector('.fab-expr-input-tokens');
    for (const [name, value] of Object.entries(attributes)) {
      assert.equal(input.getAttribute(name), value, name);
      assert.ok(!row.hasAttribute(name), `${name} is not on the row`);
      if (name !== 'aria-label') {
        assert.ok(!group.hasAttribute(name), `${name} is not on the group`);
      }
    }
    for (const node of [row, group]) {
      assert.ok(!node.classList.contains('site-x'), "the caller's class stays on the input");
    }
  });

  it('removes an attribute its caller unsets', async () => {
    const target = await harness.mount({ 'aria-invalid': 'true' });
    assert.equal(target.querySelector('input').getAttribute('aria-invalid'), 'true');
    await harness.setProps({ 'aria-invalid': undefined });
    assert.ok(!target.querySelector('input').hasAttribute('aria-invalid'));
  });

  it('hands onChange the text as typed, adding no `@`', async () => {
    const written = [];
    const target = await harness.mount({
      onChange: (expression) => {
        written.push(expression);
      },
    });
    const input = target.querySelector('input');
    type(input, '1d4');
    type(input, 'prof');
    assert.deepEqual(written, ['1d4', 'prof']);
  });

  it("keeps the write path when a caller passes its own 'oninput'", async () => {
    const written = [];
    const spied = [];
    const target = await harness.mount({
      onChange: (expression) => {
        written.push(expression);
      },
      oninput: (event) => {
        spied.push(event);
      },
    });
    type(target.querySelector('input'), '1d4');
    assert.deepEqual(written, ['1d4']);
    assert.equal(spied.length, 0, "the caller's handler is not honoured");

    const root = component.ast.fragment.nodes.find((node) => node.type === 'RegularElement');
    const order = root.attributes.map((attribute) =>
      attribute.type === 'SpreadAttribute' ? '...' : attribute.name
    );
    assert.ok(order.includes('...'), 'the root carries the spread');
    assert.ok(
      order.indexOf('oninput') > order.indexOf('...'),
      `\`oninput\` follows the spread: ${order.join(' ')}`
    );
  });

  it('disables the input, and writes no placeholder of its own', async () => {
    const target = await harness.mount({ disabled: true });
    const input = target.querySelector('input');
    assert.equal(input.disabled, true);
    assert.equal(input.getAttribute('placeholder') ?? '', '');
  });

  it('declares exactly the props its entry gives the field, its reading and its row', () => {
    assert.deepEqual(declaredPropNames(component.source), [
      '...rest',
      'class',
      'disabled',
      'onChange',
      'placeholder',
      'resolve',
      'tokens',
      'tokensLabel',
      'unresolvedLabel',
      'value',
    ]);
  });

  it('breaks no rule of the shared-primitive API convention', () => {
    assert.deepEqual(declarationViolations(readDeclaration(component)), []);
  });

  it('agrees with its library entry on every prop the entry does not hold at target', () => {
    const { status, names, subjects } = readEntry();
    const declared = declaredPropNames(component.source).filter((name) => name !== '...rest');
    assert.ok(names.length > 0, 'the entry states an API');
    assert.deepEqual(
      declared.filter((name) => !names.includes(name)),
      [],
      'the entry names every declared prop'
    );
    const unbuilt = new Set(names.filter((name) => !declared.includes(name)));
    if (status !== 'target') {
      assert.deepEqual(unbuilt, new Set(), `at ${status} the entry and the file state one API`);
      return;
    }
    assert.deepEqual(
      unbuilt,
      new Set(),
      'the entry holds no prop at target that the file does not build: only its place is still to come'
    );
    assert.ok(
      subjects.includes(MIGRATION_SUBJECT),
      `a planned-migrations row names the difference: ${MIGRATION_SUBJECT}`
    );
  });

  it('is passed no retired prop at any call site, and no tokens without their name', () => {
    const tags = callSiteTags();
    assert.equal(
      new Set(tags.map(({ file }) => file)).size,
      5,
      "five files render it; a sixth importer updates this count and the manifest row's `why`, which names them"
    );
    assert.ok(tags.length >= 5, `only ${tags.length} tags were read`);
    assert.deepEqual(
      tags
        .filter(({ names }) => names.some((name) => RETIRED_PROPS.includes(name)))
        .map(({ file, names }) => `${file}: ${names.join(' ')}`),
      []
    );
    assert.deepEqual(
      tags
        .filter(({ names }) => names.includes('tokens') && !names.includes('tokensLabel'))
        .map(({ file }) => file),
      [],
      'a row of tokens is a group, and its name is the caller’s to give'
    );
    assert.ok(
      tags.some(({ names }) => names.includes('tokens')),
      'no call site passes `tokens`, so the two clauses above read nothing'
    );
    const resolving = tags.filter(({ names }) => names.includes('resolve'));
    assert.deepEqual(
      [...new Set(resolving.map(({ file }) => file))],
      [CCVF],
      'a resolver needs an actor in scope, and one file has one: a second is read by hand first'
    );
    assert.deepEqual(
      resolving.filter(({ names }) => !names.includes('unresolvedLabel')).map(({ file }) => file),
      [],
      'a reading that does not reduce is stated, and the statement is the caller’s to give'
    );
    assert.deepEqual(
      [...new Set(tags.filter(({ spreads }) => spreads > 0).map(({ file }) => file))].sort((a, b) =>
        a.localeCompare(b)
      ),
      [CCVF, 'src/ui/svelte/apps/manager/recipe/PickerRowAmount.svelte'],
      'a spread can carry `tokens` or a retired prop unread; a new one is read by hand before it joins this list'
    );
  });

  it("hands a check's character value its validation address as a prop, never an attribute bag", () => {
    const declared = declaredPropNames(templates.find(({ file }) => file === CCVF).source);
    assert.ok(declared.includes('validationTarget'), declared.join(' '));
    assert.ok(!declared.includes('inputAttrs'), 'the bag is banned on a member, and retired here');
  });

  it('left no hand-rolled row of tokens behind: no hook in a template, no rule in the sheet', () => {
    const written = templates.flatMap(({ file, ast }) =>
      [...walkNodes(ast.fragment)]
        .filter((node) => node.type === 'Attribute' && RETIRED_HOOKS.includes(node.name))
        .map((node) => `${file}: ${node.name}`)
    );
    assert.deepEqual(written, []);

    const sheet = readStylesheet().replaceAll(/\/\*[\s\S]*?\*\//gu, '');
    assert.ok(sheet.includes('.fabricate-typeahead-option'), 'the module sheet was not read');
    assert.deepEqual(
      RETIRED_CLASSES.filter((name) => new RegExp(String.raw`\.${name}(?![\w-])`, 'u').test(sheet)),
      []
    );
  });
});

describe('ExprInput: the row of tokens (issue 2465)', () => {
  it('draws no row when it has no token to draw', async () => {
    for (const tokens of [undefined, [], ['', ' ']]) {
      harness.remount();
      const target = await harness.mount({ value: '@a', tokens, tokensLabel: 'Add a term' });
      assert.deepEqual(
        [...target.children].map((child) => child.tagName),
        ['INPUT'],
        `tokens ${JSON.stringify(tokens)}: the input is the one root`
      );
      assert.ok(!target.querySelector('.fab-expr-input-row'), 'and no row is drawn');
    }
  });

  it('drops a blank token and trims the rest', async () => {
    const target = await harness.mount({ tokens: ['@a', '', ' 1d4 '], tokensLabel: 'Add a term' });
    assert.deepEqual(
      tokenButtons(target).map((button) => button.textContent),
      ['@a', '1d4']
    );
  });

  it('draws one named group of dashed buttons after the input, each reading its own term', async () => {
    const target = await harness.mount({ tokens: ['@prof', '1d4'], tokensLabel: 'Add a term' });
    assert.deepEqual(
      [...target.children].map((child) =>
        [child.tagName, ...child.classList].filter((name) => !name.startsWith('svelte-'))
      ),
      [
        ['INPUT', 'fab-expr-input'],
        ['DIV', 'fab-expr-input-row'],
      ],
      'the input, then the row, and nothing around either'
    );
    const row = target.querySelector('.fab-expr-input-row');
    assert.deepEqual(
      [row.hasAttribute('role'), row.hasAttribute('aria-label')],
      [false, false],
      'the row is layout alone: it carries no role and no name'
    );
    const group = row.querySelector('.fab-expr-input-tokens');
    assert.equal(group.getAttribute('role'), 'group');
    assert.equal(group.getAttribute('aria-label'), 'Add a term');

    const buttons = [...group.children];
    assert.deepEqual(
      buttons.map((button) => button.textContent),
      ['@prof', '1d4'],
      'in the order passed'
    );
    for (const button of buttons) {
      assert.ok(button.matches('button[type="button"]'), 'a real button that submits nothing');
      for (const name of ['fabricate-button', 'is-dashed', 'fab-expr-input-token']) {
        assert.ok(button.classList.contains(name), `${button.textContent} carries ${name}`);
      }
      assert.equal(button.getAttribute('data-keyboard-focus'), 'true');
      assert.ok(!button.hasAttribute('title'), 'its text is its only name');
      assert.ok(!button.querySelector('i'), 'and it draws no glyph');
    }
  });

  it('draws the reading and each token through the shared primitives, never its own markup', () => {
    const nodes = [...walkNodes(component.ast.fragment)];
    const componentsIn = (className) =>
      [...walkNodes(elementByClass(nodes, className).fragment)]
        .filter((node) => node.type === 'Component')
        .map((node) => node.name);
    assert.deepEqual(
      componentsIn('fab-expr-input-tokens'),
      ['Button'],
      'the group holds the one Button tag its `{#each}` repeats, and nothing else'
    );
    assert.deepEqual(
      componentsIn('fab-expr-input-row'),
      ['Chip', 'Button'],
      'the row holds the reading, a Chip, ahead of that group'
    );
    assert.deepEqual(
      nodes
        .filter((node) => node.type === 'RegularElement')
        .map((node) => node.name)
        .sort((a, b) => a.localeCompare(b)),
      ['div', 'div', 'input', 'span', 'span'],
      'the template writes no `<button>`, and its two spans are a token label and the status region'
    );
  });

  it('leaves the group unnamed, and says so once, when its caller passes no label', async () => {
    const warnings = await loggedDuring('warn', async () => {
      const target = await harness.mount({ tokens: ['@prof', '1d4'] });
      assert.ok(
        !target.querySelector('.fab-expr-input-tokens').hasAttribute('aria-label'),
        'no `aria-label` attribute is written, and none is invented'
      );
      await harness.setProps({ value: '@prof' });
    });
    assert.equal(warnings.length, 1, `one warning: ${warnings.join(' | ')}`);
    assert.match(warnings[0], /tokensLabel/u);
  });

  it('logs nothing when the row is named, or when there is no row', async () => {
    const warnings = await loggedDuring('warn', async () => {
      await harness.mount({ tokens: ['@prof'], tokensLabel: 'Add a term' });
      harness.remount();
      await harness.mount({ value: '@prof' });
    });
    assert.deepEqual(warnings, []);
  });

  for (const [name, from, expected] of INSERTIONS) {
    it(`inserts a pressed token: ${name}`, async () => {
      assertInserted(await pressAt(from, '1d4'), expected, name);
    });
  }

  for (const [name, value, expected] of [
    ['holding a value', '@a', '@a + 1d4|'],
    ['whose expression is absent', undefined, '1d4|'],
  ]) {
    it(`appends to a field that was never focused, ${name}`, async () => {
      const written = [];
      const target = await harness.mount({
        value,
        tokens: ['1d4'],
        tokensLabel: 'Add a term',
        onChange: (expression) => {
          written.push(expression);
        },
      });
      const input = target.querySelector('input');
      const [button] = tokenButtons(target);
      button.focus();
      button.click();
      assertInserted({ input, written }, expected, name);
    });
  }

  it('builds one compound expression from two presses', async () => {
    const written = [];
    const target = await harness.mount({
      value: '',
      tokens: ['@abilities.wis.mod', '1d4'],
      tokensLabel: 'Add a term',
      onChange: (expression) => {
        written.push(expression);
      },
    });
    const [first, second] = tokenButtons(target);
    first.focus();
    first.click();
    second.focus();
    second.click();
    assert.deepEqual(written, ['@abilities.wis.mod', '@abilities.wis.mod + 1d4']);
    assert.equal(target.querySelector('input').value, '@abilities.wis.mod + 1d4');
  });

  // The echo is deferred a microtask, as a parent's state write reaches the field after the
  // handler returns: it lands after the component has placed the caret, and must not move it.
  for (const [name, mounted, echo] of [
    ['exactly', '@a| + @b', (next) => next],
    ['trimmed', '  @a| + @b  ', (next) => next.trim()],
  ]) {
    it(`keeps the caret after the term when its parent echoes the value ${name}`, async () => {
      const written = [];
      let echoed = Promise.resolve();
      const { input } = await pressAt(mounted, '1d4', {
        onChange: (next) => {
          written.push(next);
          echoed = Promise.resolve().then(() => harness.setProps({ value: echo(next) }));
        },
      });
      await echoed;
      assertInserted({ input, written }, '@a + 1d4| + @b', name);
    });
  }

  it('disables the input and every token together, and a disabled token writes nothing', async () => {
    const written = [];
    const target = await harness.mount({
      value: '@a',
      disabled: true,
      tokens: ['@prof', '1d4'],
      tokensLabel: 'Add a term',
      onChange: (expression) => {
        written.push(expression);
      },
    });
    const input = target.querySelector('input');
    assert.equal(input.disabled, true);
    assert.deepEqual(
      tokenButtons(target).map((button) => button.disabled),
      [true, true]
    );
    for (const button of tokenButtons(target)) {
      button.dispatchEvent(new globalThis.window.MouseEvent('click', { bubbles: true }));
    }
    assert.deepEqual(written, [], 'a disabled token delivers no press');
    assert.equal(input.value, '@a');

    await harness.setProps({ disabled: false });
    assert.equal(input.disabled, false);
    assert.deepEqual(
      tokenButtons(target).map((button) => button.disabled),
      [false, false]
    );
  });
});

describe('ExprInput: the reading (issue 2465)', () => {
  const NUMBER_CHIP = Object.freeze([
    'SPAN',
    'manager-chip',
    'is-info',
    'is-mono',
    'is-inspector',
    'fab-expr-input-reading',
  ]);
  const STATEMENT_CHIP = Object.freeze([
    'SPAN',
    'manager-chip',
    'is-secondary',
    'is-inspector',
    'fab-expr-input-reading',
  ]);
  const TOKENS = Object.freeze({ tokens: ['@prof', '1d4'], tokensLabel: 'Add a term' });
  const GROUP = Object.freeze(['DIV', 'fab-expr-input-tokens']);
  const INPUT = Object.freeze(['INPUT', 'fab-expr-input']);
  const ROW = Object.freeze(['DIV', 'fab-expr-input-row']);
  const STATUS = Object.freeze(['SPAN', 'visually-hidden']);

  it('draws no reading, no status region and no description without a resolver, or with one that is no function', async () => {
    for (const resolver of [undefined, null, 'x', 12, {}, true]) {
      harness.remount();
      const name = `resolve ${JSON.stringify(resolver)}`;
      let target;
      const errors = await loggedDuring('error', async () => {
        target = await harness.mount({
          value: '12',
          unresolvedLabel: 'Unresolved',
          resolve: resolver,
        });
      });
      assert.deepEqual([...target.children].map(shapeOf), [INPUT], name);
      assert.ok(!readingOf(target), `${name}: no chip`);
      assert.ok(!target.querySelector('[role="status"]'), `${name}: no status region`);
      assert.ok(!target.querySelector('input').hasAttribute('aria-describedby'), name);
      assert.deepEqual(errors, [], `${name}: nothing is called, so nothing throws`);
    }
  });

  it('never asks the resolver about a blank expression, and draws no row for one', async () => {
    for (const value of ['', ' \t ', undefined, null]) {
      harness.remount();
      const asked = [];
      const target = await harness.mount({
        value,
        unresolvedLabel: 'Unresolved',
        resolve: (expression) => {
          asked.push(expression);
          return 12;
        },
      });
      const name = `value ${JSON.stringify(value)}`;
      assert.deepEqual(asked, [], `${name}: the resolver is not called`);
      assert.deepEqual(
        [...target.children].map(shapeOf),
        [INPUT, STATUS],
        `${name}: the roots are the input and the status region, which stays mounted`
      );
      assert.ok(!target.querySelector('input').hasAttribute('aria-describedby'), name);
    }
  });

  it('draws a number through the chip: info tone, inspector density, the mono face', async () => {
    const target = await harness.mount({ value: '6 + 6', ...READING });
    const chip = readingOf(target);
    assert.deepEqual(shapeOf(chip), NUMBER_CHIP);
    assert.equal(chip.getAttribute('data-expr-input-reading'), 'resolved');
    assert.equal(chip.textContent, '= 12');
  });

  it('writes the number as JavaScript writes it, a zero included', async () => {
    for (const [answer, drawn] of [
      [7.5, '= 7.5'],
      [-2, '= -2'],
      [0, '= 0'],
    ]) {
      harness.remount();
      const target = await harness.mount({
        value: '@a',
        unresolvedLabel: 'Unresolved',
        resolve: () => answer,
      });
      assert.equal(readingOf(target).textContent, drawn);
      assert.equal(readingOf(target).getAttribute('data-expr-input-reading'), 'resolved', drawn);
    }
  });

  it("draws the caller's statement at the secondary tone, in the UI face, where it does not reduce", async () => {
    const target = await harness.mount({ value: '@nope', ...READING });
    const chip = readingOf(target);
    assert.deepEqual(shapeOf(chip), STATEMENT_CHIP);
    assert.equal(chip.getAttribute('data-expr-input-reading'), 'unresolved');
    assert.equal(chip.textContent, 'Unresolved');
  });

  it('reads anything but a finite number as not reducing', async () => {
    for (const [name, answer] of [
      ['NaN', NaN],
      ['Infinity', Infinity],
      ['a numeric string', '12'],
      ['undefined', undefined],
      ['an object', {}],
      ['a promise', Promise.resolve(12)],
    ]) {
      harness.remount();
      const target = await harness.mount({
        value: '@a',
        unresolvedLabel: 'Unresolved',
        resolve: () => answer,
      });
      assert.deepEqual(shapeOf(readingOf(target)), STATEMENT_CHIP, name);
      assert.equal(readingOf(target).textContent, 'Unresolved', name);
    }
  });

  it('reads a resolver that throws as not reducing, logs it once, and stays mounted', async () => {
    let target;
    const errors = await loggedDuring('error', async () => {
      target = await harness.mount({
        value: '1',
        unresolvedLabel: 'Unresolved',
        resolve: () => {
          throw new Error('no roll data');
        },
      });
      await harness.setProps({ value: '2' });
      await harness.setProps({ value: '3' });
    });
    assert.equal(errors.length, 1, `one line across three expressions: ${errors.join(' | ')}`);
    assert.match(errors[0], /`resolve` threw/u);
    assert.equal(readingOf(target).textContent, 'Unresolved');
    assert.equal(target.querySelector('input').value, '3', 'the field still follows its value');
  });

  it('asks the resolver once per expression, and not for a new placeholder or statement', async () => {
    const asked = [];
    const target = await harness.mount({
      value: '6 + 6',
      unresolvedLabel: 'Unresolved',
      resolve: (expression) => {
        asked.push(expression);
        return sums(expression);
      },
    });
    assert.deepEqual(asked, ['6 + 6']);
    await harness.setProps({ placeholder: '@prof' });
    await harness.setProps({ disabled: true });
    await harness.setProps({ unresolvedLabel: 'No number' });
    assert.deepEqual(asked, ['6 + 6'], 'none of the three is a new expression');
    await harness.setProps({ value: ' @nope ' });
    assert.deepEqual(asked, ['6 + 6', ' @nope '], 'the text as shown, untrimmed');
    assert.equal(readingOf(target).textContent, 'No number', 'the statement is read as it stands');
  });

  it('keeps the reading on a disabled field', async () => {
    const target = await harness.mount({ value: '12', disabled: true, ...READING });
    assert.equal(target.querySelector('input').disabled, true);
    assert.equal(readingOf(target).textContent, '= 12');
  });

  for (const [name, unresolvedLabel] of [
    ['no statement', undefined],
    ['a statement of whitespace', ' \t '],
  ]) {
    it(`warns once, naming the prop, when a resolver arrives with ${name}, and draws no blank chip`, async () => {
      let target;
      const warnings = await loggedDuring('warn', async () => {
        target = await harness.mount({
          value: '@nope',
          resolve: sums,
          unresolvedLabel,
          'aria-describedby': 'hint',
        });
        await harness.setProps({ value: '@none' });
      });
      assert.equal(warnings.length, 1, `one warning: ${warnings.join(' | ')}`);
      assert.match(warnings[0], /unresolvedLabel/u);
      assert.ok(!readingOf(target), 'no chip is drawn, and no statement is invented');
      assert.ok(!target.querySelector('.fab-expr-input-row'), 'so no row is drawn for it');
      assert.equal(
        target.querySelector('input').getAttribute('aria-describedby'),
        'hint',
        "the description holds the caller's id alone, and no id of a chip that is not there"
      );
    });
  }

  it('warns once for a missing statement, however many resolvers the field is handed', async () => {
    const warnings = await loggedDuring('warn', async () => {
      await harness.mount({ value: '@nope', resolve: sums });
      await harness.setProps({ resolve: (expression) => sums(expression) });
      await harness.setProps({ resolve: (expression) => sums(expression) });
    });
    assert.equal(warnings.length, 1, `one warning across three resolvers: ${warnings.join(' | ')}`);
  });

  it('draws the statement trimmed', async () => {
    const target = await harness.mount({
      value: '@nope',
      resolve: sums,
      unresolvedLabel: '  Unresolved ',
    });
    assert.equal(readingOf(target).textContent, 'Unresolved');
  });

  for (const [name, props, roots, children] of [
    ['tokens alone', { ...TOKENS }, [INPUT, ROW], [GROUP]],
    ['a reading alone', { ...READING }, [INPUT, ROW, STATUS], [NUMBER_CHIP]],
    ['both', { ...READING, ...TOKENS }, [INPUT, ROW, STATUS], [NUMBER_CHIP, GROUP]],
  ]) {
    it(`holds ${name} in one row, the reading first and the group around the tokens only`, async () => {
      const target = await harness.mount({ value: '12', ...props });
      assert.deepEqual([...target.children].map(shapeOf), roots);
      const row = target.querySelector('.fab-expr-input-row');
      assert.deepEqual([...row.children].map(shapeOf), children);
      assert.deepEqual(
        [row.hasAttribute('role'), row.hasAttribute('aria-label')],
        [false, false],
        'the row carries no role and no name'
      );
      const groups = [...target.querySelectorAll('[role="group"]')];
      if (!children.includes(GROUP)) {
        assert.equal(groups.length, 0, 'with no token there is no group, and no name is owed');
        return;
      }
      assert.equal(groups.length, 1);
      assert.equal(groups[0].getAttribute('aria-label'), 'Add a term');
      assert.deepEqual(
        [...groups[0].children].map((child) => child.matches('button.fab-expr-input-token')),
        [true, true],
        'the group holds the tokens alone, never the reading'
      );
    });
  }
});

describe('ExprInput: the reading describes the field (issue 2465)', () => {
  const described = (target) => target.querySelector('input').getAttribute('aria-describedby');

  it("writes the reading's id ahead of the description its caller passes", async () => {
    const target = await harness.mount({
      value: '12',
      ...READING,
      'aria-describedby': 'hint-a hint-b',
    });
    const { id } = readingOf(target);
    assert.ok(id, 'the chip carries an id');
    assert.equal(described(target), `${id} hint-a hint-b`);
  });

  it("writes the reading's id alone where its caller passes none", async () => {
    const target = await harness.mount({ value: '@nope', ...READING });
    assert.equal(described(target), readingOf(target).id);
  });

  it("keeps the caller's description alone where no reading is drawn", async () => {
    for (const props of [{ value: '12' }, { value: '', ...READING }]) {
      harness.remount();
      const target = await harness.mount({ ...props, 'aria-describedby': 'hint-a' });
      assert.equal(described(target), 'hint-a');
    }
  });

  it('drops the id when the expression is cleared, and takes it back with the reading', async () => {
    const target = await harness.mount({ value: '12', ...READING, 'aria-describedby': 'hint-a' });
    const { id } = readingOf(target);
    await harness.setProps({ value: '' });
    assert.equal(described(target), 'hint-a');
    await harness.setProps({ 'aria-describedby': undefined });
    assert.ok(
      !target.querySelector('input').hasAttribute('aria-describedby'),
      'no attribute at all'
    );
    await harness.setProps({ value: '7' });
    assert.equal(described(target), id);
  });
});

describe('ExprInput: the announced reading (issue 2465)', () => {
  /** The caller's floating echoes, awaited by `settle` so none outlives its test. */
  const echoed = [];

  /** Cross a real macrotask, so every microtask the last act queued has run. */
  async function settle() {
    await new Promise((done) => setImmediate(done));
    const landing = [...echoed];
    echoed.length = 0;
    await Promise.all(landing);
  }

  async function advance(ms) {
    mock.timers.tick(ms);
    await settle();
  }

  // `setImmediate` stays real: every `harness.mount` awaits one.
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
  afterEach(() => mock.timers.reset());

  /** How a caller hands the written value back: inside `onChange`, or a microtask after it. */
  const ECHOES = Object.freeze([
    [
      'inside onChange',
      (next) => {
        echoed.push(harness.setProps({ value: next }));
      },
    ],
    [
      'a microtask later',
      (next) => {
        echoed.push(Promise.resolve().then(() => harness.setProps({ value: next })));
      },
    ],
  ]);

  const ONE_TOKEN = Object.freeze({ tokens: ['1'], tokensLabel: 'Add a term' });

  async function mountSpeaking(echo, props = {}) {
    const target = await harness.mount({ value: '', ...READING, ...props, onChange: echo });
    const input = target.querySelector('input');
    return {
      target,
      input,
      said: () => statusOf(target).textContent,
      drawn: () => readingOf(target)?.textContent ?? '',
      key: async (expression) => {
        type(input, expression);
        await settle();
      },
      press: async () => {
        const [button] = tokenButtons(target);
        button.focus();
        button.click();
        await settle();
      },
    };
  }

  /** Every handle the typing wait armed, and every handle `clearTimeout` was handed. */
  function watchTimers() {
    const armed = mock.method(globalThis, 'setTimeout');
    const cleared = mock.method(globalThis, 'clearTimeout');
    return {
      typed: () =>
        armed.mock.calls.filter((call) => call.arguments[1] === 500).map((call) => call.result),
      cleared: () => cleared.mock.calls.map((call) => call.arguments[0]),
      restore: () => {
        armed.mock.restore();
        cleared.mock.restore();
      },
    };
  }

  /**
   * Every warning and error logged while the mounted field is destroyed, `afterDestroy` runs, and
   * a second passes.
   */
  async function loggedByDestroying(afterDestroy = () => {}) {
    let warnings = [];
    const errors = await loggedDuring('error', async () => {
      warnings = await loggedDuring('warn', async () => {
        harness.remount();
        afterDestroy();
        await advance(1000);
      });
    });
    return [...warnings, ...errors];
  }

  /** A second resolver, whose every reading differs from `sums`'s. */
  const doubled = (expression) => sums(expression) * 2;

  for (const [when, echo] of ECHOES) {
    describe(`under a caller that echoes the value ${when}`, () => {
      it('mounts one empty status region beside the row, and no `aria-live` anywhere', async () => {
        const field = await mountSpeaking(echo, { value: '12', ...ONE_TOKEN });
        const regions = [...field.target.querySelectorAll('[role="status"]')];
        assert.equal(regions.length, 1);
        assert.ok(regions[0] === statusOf(field.target), 'and it is the hooked region');
        assert.ok(regions[0].parentElement === field.target, 'a root, never a child of the row');
        assert.equal(field.drawn(), '= 12');
        assert.equal(field.said(), '', 'a reading that was there at mount is not spoken');
        assert.ok(!field.target.querySelector('[aria-live]'), 'the role carries polite');
        assert.ok(!readingOf(field.target).hasAttribute('role'), 'the chip is no live region');
      });

      it('speaks a typed edit once typing has rested for 500ms', async () => {
        const field = await mountSpeaking(echo);
        await field.key('12');
        assert.equal(field.drawn(), '= 12', 'the chip follows the keystroke');
        await advance(499);
        assert.equal(field.said(), '', 'silent at 499ms');
        await advance(1);
        assert.equal(field.said(), '= 12');
      });

      it('restarts the wait on a keystroke, and speaks the last reading once', async () => {
        const timers = watchTimers();
        try {
          const field = await mountSpeaking(echo);
          await field.key('1');
          await advance(400);
          await field.key('12');
          const [first, second] = timers.typed();
          assert.ok(first && second, 'each keystroke arms its own wait');
          assert.ok(timers.cleared().includes(first), "and the second clears the first's");
          await advance(100);
          assert.equal(field.said(), '', 'silent at 500ms');
          await advance(399);
          assert.equal(field.said(), '', 'and at 899ms');
          await advance(1);
          assert.equal(field.said(), '= 12', 'the last reading, at 900ms');
        } finally {
          timers.restore();
        }
      });

      it('stays silent where an edit leaves the reading as it was', async () => {
        const field = await mountSpeaking(echo, { value: '12' });
        await field.key('6 + 6');
        await advance(500);
        assert.equal(field.said(), '', 'the reading was `= 12` before the edit and is after it');
        await field.key('7');
        await advance(500);
        assert.equal(field.said(), '= 7', 'and the next edit, which changes it, is spoken');
      });

      it('speaks the statement where a number stops reducing, and the number when it returns', async () => {
        const field = await mountSpeaking(echo, { value: '12' });
        await field.key('@nope');
        await advance(500);
        assert.equal(field.said(), 'Unresolved');
        await field.key('12');
        await advance(500);
        assert.equal(field.said(), '= 12');
      });

      it('empties the region on an edit to blank, once that edit has settled', async () => {
        const field = await mountSpeaking(echo);
        await field.key('12');
        await advance(500);
        assert.equal(field.said(), '= 12');
        await field.key('');
        await advance(499);
        assert.equal(field.said(), '= 12', 'not per keystroke');
        await advance(1);
        assert.equal(field.said(), '');
      });

      it('never speaks a reading its resolver changed, and empties the region for the next', async () => {
        const field = await mountSpeaking(echo);
        await field.key('12');
        await advance(500);
        assert.equal(field.said(), '= 12');

        await harness.setProps({ resolve: doubled });
        assert.equal(field.drawn(), '= 24', 'the chip follows the resolver');
        assert.equal(field.said(), '', 'and the region is emptied, not rewritten');
        await advance(1000);
        assert.equal(field.said(), '', 'at any later tick too');

        await field.key('6');
        await advance(500);
        assert.equal(
          field.said(),
          '= 12',
          'an edit back to a text spoken earlier is written again'
        );
      });

      it('never speaks a resolver that changed while an edit waited, and takes its reading as heard', async () => {
        const field = await mountSpeaking(echo);
        await field.key('12');
        await advance(500);
        assert.equal(field.said(), '= 12');

        await field.key('6 + 6');
        await advance(200);
        await harness.setProps({ resolve: doubled });
        assert.equal(field.drawn(), '= 24', 'the chip follows the resolver');
        await advance(300);
        assert.equal(field.said(), '', 'empty at 500ms: the edit left the reading as it was');
        await advance(1000);
        assert.equal(field.said(), '', 'and at any later tick');

        await field.key('12');
        await advance(500);
        assert.equal(
          field.said(),
          '',
          'an edit that keeps `= 24` is silent: it was taken as heard'
        );
        await field.key('6');
        await advance(500);
        assert.equal(field.said(), '= 12', 'and the next edit that changes it is spoken');
      });

      it('speaks a pressed token once focus is back on the field, with no typing wait', async () => {
        const field = await mountSpeaking(echo, { value: '5', ...ONE_TOKEN });
        const [button] = tokenButtons(field.target);
        button.focus();
        button.click();
        assert.ok(globalThis.document.activeElement === field.input, 'focus is on the field');
        assert.equal(field.said(), '', 'while the region is still empty');
        await settle();
        assert.equal(field.drawn(), '= 6');
        assert.equal(field.said(), '', 'and nothing is said until the focus move has been heard');
        await advance(ANNOUNCE_AFTER_FOCUS_MS - 1);
        assert.equal(field.said(), '');
        await advance(1);
        assert.equal(field.said(), '= 6', `at ${ANNOUNCE_AFTER_FOCUS_MS}ms, not at 500ms`);
      });

      it('hands the announcement to a keystroke that follows a press', async () => {
        const field = await mountSpeaking(echo, { value: '5', ...ONE_TOKEN });
        await field.press();
        await advance(100);
        await field.key('9');
        await advance(50);
        assert.equal(field.said(), '', "empty at 150ms, when the press's own wait ends");
        await advance(449);
        assert.equal(field.said(), '', 'and at 599ms');
        await advance(1);
        assert.equal(field.said(), '= 9', "one write, at the keystroke's 500ms");
      });

      it('hands the announcement to a press that follows a keystroke', async () => {
        const timers = watchTimers();
        try {
          const field = await mountSpeaking(echo, ONE_TOKEN);
          await field.key('5');
          await advance(200);
          await field.press();
          assert.ok(
            timers.cleared().includes(timers.typed()[0]),
            "the keystroke's wait is cleared"
          );
          await advance(ANNOUNCE_AFTER_FOCUS_MS - 1);
          assert.equal(field.said(), '');
          await advance(1);
          assert.equal(field.said(), '= 6', `at 200ms + ${ANNOUNCE_AFTER_FOCUS_MS}ms`);
          await advance(500);
          assert.equal(field.said(), '= 6', "and the keystroke's 500ms writes nothing");
        } finally {
          timers.restore();
        }
      });

      it('clears its typing wait when it is destroyed', async () => {
        const timers = watchTimers();
        try {
          const field = await mountSpeaking(echo, { value: '5', ...ONE_TOKEN });
          await field.press();
          await field.key('9');
          const typed = timers.typed().at(-1);
          assert.ok(typed, 'a typing wait is pending beside the press');
          assert.deepEqual(await loggedByDestroying(), []);
          assert.ok(timers.cleared().includes(typed), 'the typing wait was cleared');
        } finally {
          timers.restore();
        }
      });

      it('leaves a press still waiting inert when it is destroyed: a later write of its value reads nothing', async () => {
        const field = await mountSpeaking(echo, { value: '5', ...ONE_TOKEN });
        await field.press();
        const destroyed = harness.component;
        assert.deepEqual(await loggedByDestroying(() => destroyed.$set({ value: '77' })), []);
      });
    });
  }

  it('speaks an edit whose caller hands it a new resolver of the same readings, with the echo and after it', async () => {
    // The Studio's field re-derives its resolver on every write, and again when its route re-emits.
    const field = await mountSpeaking((next) => {
      echoed.push(harness.setProps({ value: next, resolve: (expression) => sums(expression) }));
    });
    await field.key('12');
    await advance(200);
    await harness.setProps({ resolve: (expression) => sums(expression) });
    await advance(300);
    assert.equal(field.said(), '= 12', 'the reading is the edit’s: no resolver moved it');
  });

  it('keeps what it said when its caller rewrites the expression to one of the same reading', async () => {
    const field = await mountSpeaking((next) => {
      echoed.push(harness.setProps({ value: next }));
    });
    await field.key('12');
    await advance(500);
    assert.equal(field.said(), '= 12');
    await harness.setProps({ value: '6 + 6' });
    assert.equal(field.said(), '= 12', 'no reading moved, so the region is left as it was');
  });

  it('takes a statement that changed while an edit waited as heard, as it does a resolver', async () => {
    const field = await mountSpeaking((next) => {
      echoed.push(harness.setProps({ value: next }));
    });
    await field.key('@nope');
    await advance(200);
    await harness.setProps({ unresolvedLabel: 'No number' });
    await advance(300);
    assert.equal(field.drawn(), 'No number');
    assert.equal(field.said(), '', 'the statement moved the reading, not the edit');
  });

  it("settles an edit whose caller's `onChange` throws, so the next reading is not left stale", async () => {
    const refused = [];
    const field = await mountSpeaking((next) => {
      if (next === '13') {
        refused.push(next);
        throw new Error('the caller failed');
      }
      echoed.push(harness.setProps({ value: next }));
    });
    await field.key('12');
    await advance(500);
    assert.equal(field.said(), '= 12');

    // The page reports a listener's throw; it never reaches the dispatch.
    await field.key('13');
    assert.deepEqual(refused, ['13'], 'the caller threw on that keystroke');
    await advance(500);
    await harness.setProps({ resolve: doubled });
    assert.equal(field.drawn(), '= 24', 'the caller kept `12`, which the new resolver doubles');
    assert.equal(field.said(), '', 'the region is emptied, not left on `= 12` under a `= 24` chip');

    await field.key('6');
    await advance(500);
    assert.equal(field.said(), '= 12', 'and an edit back to that text is spoken');
  });
});
