/**
 * Issue 2465 — `<ExprInput>` (`RollDataExpressionInput.svelte`): one input that shows and writes
 * the stored expression unchanged and carries its caller's class and attributes.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { Window } from 'happy-dom';

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
  compiledModules: [RDE],
  componentPath: RDE,
});

const templates = parsedTemplates();
const component = templates.find(({ file }) => file === RDE);

/** Props the component took before issue 2465, which no call site may pass again. */
const RETIRED_PROPS = Object.freeze(['sigil', 'dataField', 'inputAttrs']);

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

describe('ExprInput (issue 2465)', () => {
  before(() => harness.setup());
  afterEach(() => harness.remount());
  after(() => harness.teardown());

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
    const target = await harness.mount({ class: 'site-x', ...attributes });
    const input = target.querySelector('input');
    assert.deepEqual(
      [...input.classList].filter((name) => !name.startsWith('svelte-')),
      ['fab-expr-input', 'site-x']
    );
    for (const [name, value] of Object.entries(attributes)) {
      assert.equal(input.getAttribute(name), value, name);
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

  it('declares exactly the props its entry gives the field', () => {
    assert.deepEqual(declaredPropNames(component.source), [
      '...rest',
      'class',
      'disabled',
      'onChange',
      'placeholder',
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
      new Set(['resolve', 'tokens']),
      'what the entry still holds at target; a PR that builds one strikes it from this set, the entry hint and the planned-migrations row together'
    );
    assert.ok(
      subjects.includes(MIGRATION_SUBJECT),
      `a planned-migrations row names the difference: ${MIGRATION_SUBJECT}`
    );
  });

  it('is passed no retired prop at any call site', () => {
    const tags = templates.flatMap(({ file, ast }) =>
      [...walkNodes(ast.fragment)]
        .filter((node) => node.type === 'Component' && node.name === 'RollDataExpressionInput')
        .map((node) => ({
          file,
          names: node.attributes
            .filter((attribute) => attribute.type === 'Attribute')
            .map((attribute) => attribute.name),
        }))
    );
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
  });
});
