/**
 * Issue 2465 — `<ExprInput>` (`RollDataExpressionInput.svelte`): one input that shows and writes
 * the stored expression unchanged and carries its caller's class and attributes, and the row of
 * tokens it draws after it, each of which inserts its term at the caret.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { Window } from 'happy-dom';

import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { declarationViolations, readDeclaration } from '../helpers/apiConvention.js';
import { parseDesignLibrary, readDesignLibrary } from '../helpers/designLibrary.js';
import { walkNodes } from '../helpers/moduleAst.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { declaredPropNames } from '../helpers/sveltePropsDeclaration.js';
import { parsedTemplates } from '../helpers/svelteTemplateScan.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const RDE = 'src/ui/svelte/apps/manager/RollDataExpressionInput.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-expr-input-',
  rawModules: [],
  compiledModules: ['src/ui/svelte/components/Button.svelte', RDE],
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
]);

/** Classes those rows were drawn by, which no rule in the module sheet may name again. */
const RETIRED_CLASSES = Object.freeze([
  'manager-tag-suggestion',
  'manager-modifier-expression-suggestion',
  'manager-modifier-expression-suggestions',
]);

/** The planned-migrations row that names what the entry specifies and the file does not ship. */
const MIGRATION_SUBJECT = 'Expression field tokens and reading';

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

/** Every call-site tag of the component under `src/ui/svelte`, with the attribute names it passes. */
function callSiteTags() {
  return templates.flatMap(({ file, ast }) =>
    [...walkNodes(ast.fragment)]
      .filter((node) => node.type === 'Component' && node.name === 'RollDataExpressionInput')
      .map((node) => ({
        file,
        names: node.attributes
          .filter((attribute) => attribute.type === 'Attribute')
          .map((attribute) => attribute.name),
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

/** Every `console.warn` line logged while `run` resolves. */
async function warningsDuring(run) {
  const warnings = [];
  const original = console.warn;
  console.warn = (...parts) => {
    warnings.push(parts.join(' '));
  };
  try {
    await run();
  } finally {
    console.warn = original;
  }
  return warnings;
}

const tokenButtons = (target) => [...target.querySelectorAll('.fab-expr-input-token')];

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
  ['an open bracket takes no operator', 'floor((|', 'floor(( 1d4|'],
  ['the start of a non-blank value joins the operand after it', '|@a', '1d4| + @a'],
  ['between an operand and an operator', '@a| + @b', '@a + 1d4| + @b'],
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
    for (const [name, value] of Object.entries(attributes)) {
      assert.equal(input.getAttribute(name), value, name);
      if (name !== 'aria-label') assert.ok(!row.hasAttribute(name), `${name} is not on the row`);
    }
    assert.ok(!row.classList.contains('site-x'), "the caller's class is not on the row");
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

  it('declares exactly the props its entry gives the field and its row', () => {
    assert.deepEqual(declaredPropNames(component.source), [
      '...rest',
      'class',
      'disabled',
      'onChange',
      'placeholder',
      'tokens',
      'tokensLabel',
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
      new Set(['resolve']),
      'what the entry still holds at target; a PR that builds it strikes it from this set, the entry hint and the planned-migrations row together'
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
      4,
      "four files render it; a fifth importer updates this count and the manifest row's `why`, which names them"
    );
    assert.ok(tags.length >= 4, `only ${tags.length} tags were read`);
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
    assert.equal(row.getAttribute('role'), 'group');
    assert.equal(row.getAttribute('aria-label'), 'Add a term');

    const buttons = [...row.children];
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

  it('draws each token through the shared Button, never a button of its own', () => {
    const nodes = [...walkNodes(component.ast.fragment)];
    const row = nodes.find(
      (node) => node.type === 'RegularElement' && node.name === 'div' && node.fragment
    );
    assert.deepEqual(
      [...walkNodes(row.fragment)]
        .filter((node) => node.type === 'Component')
        .map((node) => node.name),
      ['Button'],
      'the row holds the one Button tag its `{#each}` repeats'
    );
    assert.deepEqual(
      nodes.filter((node) => node.type === 'RegularElement' && node.name === 'button'),
      [],
      'and the template writes no `<button>` element'
    );
  });

  it('leaves the row unnamed, and says so once, when its caller passes no label', async () => {
    const warnings = await warningsDuring(async () => {
      const target = await harness.mount({ tokens: ['@prof', '1d4'] });
      assert.ok(
        !target.querySelector('.fab-expr-input-row').hasAttribute('aria-label'),
        'no `aria-label` attribute is written, and none is invented'
      );
      await harness.setProps({ value: '@prof' });
    });
    assert.equal(warnings.length, 1, `one warning: ${warnings.join(' | ')}`);
    assert.match(warnings[0], /tokensLabel/u);
  });

  it('logs nothing when the row is named, or when there is no row', async () => {
    const warnings = await warningsDuring(async () => {
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

  it('appends to a field that was never focused', async () => {
    const written = [];
    const target = await harness.mount({
      value: '@a',
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
    assertInserted({ input, written }, '@a + 1d4|', 'never focused');
  });

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
