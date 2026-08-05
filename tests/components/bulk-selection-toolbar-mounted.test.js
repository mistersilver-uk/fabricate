/**
 * The manager's ONE multi-select toolbar (issue 772, extracted for issue 1010).
 *
 * Two things are asserted here, and only one of them is about this component's own
 * behaviour.
 *
 * 1. THE `:global()` CONTRACT, which no other gate in this repository can see.
 *
 *    The toolbar draws the page box's focus ring itself, because it passes
 *    `wrapper="contents"` and so opts out of the ring `SelectionCheckbox` scopes to the
 *    `<label>` IT renders. That rule reaches across a component boundary:
 *
 *      .fab-bulk-selection-all
 *        :global(.fab-selection-input:focus-visible + .fab-selection-check)
 *
 *    Before issue 924 the `input` half sat OUTSIDE the `:global()`, the compiler pruned the
 *    whole rule as unused, and the ring was dead in every shipped build. That failure was
 *    LOUD — `css_unused_selector`, which `scripts/check-svelte-warnings.mjs` exits 1 on —
 *    and the fix made the SAME breakage SILENT, because nothing analyses the contents of a
 *    `:global()`: Svelte's unused-selector analysis stops at it, Stylelint excludes
 *    `.svelte` entirely, and SonarCloud indexes none of it.
 *
 *    So adjacency alone is not enough. Adjacency proves the DOM still has the shape the
 *    rule needs; it cannot see a typo INSIDE the `:global()`, which would leave a
 *    live-looking rule matching nothing. The drift assertion below therefore re-reads the
 *    class tokens out of the selector itself and demands each one still appear in
 *    `SelectionCheckbox`'s markup, so a rename on either side of the boundary fails here.
 *
 * 2. THE PARAMETERS. The row class and all five `data-*` hooks are props, defaulted to the
 *    Component Studio's strings so the shipped call site, the smoke selectors
 *    (`scripts/foundry-test-run.mjs`) and the view-lab cases resolve unchanged. That
 *    default is a compatibility contract, not an implementation detail, so it is pinned —
 *    and so is the override, because a primitive whose hooks silently ignored a caller
 *    would look fine on the studio it was extracted from.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const TOOLBAR_PATH = 'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte';
const CHECKBOX_PATH = 'src/ui/svelte/components/SelectionCheckbox.svelte';

const toolbar = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-bulk-selection-toolbar-',
  rawModules: ['src/ui/svelte/util/foundryBridge.js'],
  compiledModules: [CHECKBOX_PATH, TOOLBAR_PATH],
  componentPath: TOOLBAR_PATH
});

function readRepoFile(repoPath) {
  return readFileSync(resolve(repoRoot, repoPath), 'utf8');
}

/** The component's scoped stylesheet with its CSS comments removed. */
function styleBlockOf(source) {
  return source
    .slice(source.indexOf('<style>'), source.lastIndexOf('</style>'))
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * An element's classes with Svelte's own scoping class removed.
 *
 * The root row carries one. It did NOT before issue 1010, because its class attribute was a
 * static literal the compiler could prove no scoped selector matched; making the row class a
 * PROP makes the attribute dynamic, and the compiler then adds the hash conservatively. It
 * is inert — this component declares no rule that could match the row — but it is real, so
 * the assertions state what the row must carry rather than pretending the set is unchanged.
 */
function authoredClasses(element) {
  return [...element.classList].filter((token) => !token.startsWith('svelte-')).sort();
}

/** Every class token a component's MARKUP puts in a literal `class="…"` attribute. */
function markupClassTokens(source) {
  const markup = source.slice(0, source.indexOf('<style>'));
  return new Set(
    [...markup.matchAll(/class="([^"]*)"/g)]
      .flatMap(([, value]) => value.split(/\s+/))
      .filter((token) => /^[\w-]+$/.test(token))
  );
}

before(async () => {
  await toolbar.setup();
});
after(() => {
  toolbar.teardown();
});
afterEach(() => {
  toolbar.remount();
});

describe('BulkSelectionToolbar cross-boundary focus ring (issue 924 / 1010)', () => {
  it('keeps every class inside its :global() selector present in SelectionCheckbox markup', () => {
    const globalSelectors = [...styleBlockOf(readRepoFile(TOOLBAR_PATH)).matchAll(/:global\(([^)]+)\)/g)]
      .map(([, selector]) => selector);

    // Teeth first: if the extraction ever drops the rule, the loop below would iterate an
    // empty set and pass while the ring was gone.
    assert.equal(
      globalSelectors.length,
      1,
      'the toolbar owns exactly ONE cross-boundary rule — the page box focus ring'
    );

    const referenced = [...globalSelectors[0].matchAll(/\.([\w-]+)/g)].map(([, token]) => token);
    assert.deepEqual(
      [...referenced].sort(),
      ['fab-selection-check', 'fab-selection-input'],
      'the ring reaches the real control and its visible box, and nothing else'
    );

    const rendered = markupClassTokens(readRepoFile(CHECKBOX_PATH));
    for (const token of referenced) {
      assert.ok(
        rendered.has(token),
        `SelectionCheckbox no longer renders \`.${token}\`, so the toolbar's :global() ring` +
          ' matches nothing. NOTHING ELSE FAILS on this: the contents of a :global() are not' +
          ' analysed by the compiler, Stylelint excludes .svelte and SonarCloud indexes none' +
          ' of it. Rename the class on both sides, or the focus ring dies silently.'
      );
    }
  });

  it('keeps the page box adjacent to its visible box, so the host focus ring still matches', async () => {
    const root = await toolbar.mount({ pageSelectionState: 'some', count: 2 });

    const host = root.querySelector('.fab-bulk-selection-all');
    assert.ok(host, 'the toolbar renders the label that owns the focus ring');

    const input = host.querySelector('input.fab-selection-input');
    assert.ok(
      input,
      'the ring selector keys on `.fab-selection-input` — SelectionCheckbox must still render' +
        ' the real control under that class inside this host'
    );

    // `nextElementSibling` skips the comment anchors Svelte interleaves, which is exactly why
    // the rule uses `+` rather than a descendant combinator.
    const box = input.nextElementSibling;
    assert.ok(
      box?.classList.contains('fab-selection-check'),
      'the visible box must remain the input\'s IMMEDIATE element sibling: the ring is drawn by' +
        ' `.fab-selection-input:focus-visible + .fab-selection-check`, so interposing an element' +
        ' or renaming the box silently kills the focus ring on the page-selection control'
    );
  });
});

describe('BulkSelectionToolbar hook and row-class parameters (issue 1010)', () => {
  it('defaults every hook and the host row class to the Component Studio strings', async () => {
    const root = await toolbar.mount({
      pageSelectionState: 'some',
      count: 2,
      showSelectAllResults: true,
      selectAllResultsCount: 9
    });

    const row = root.querySelector('[data-component-selection-toolbar]');
    assert.ok(row, 'the shipped toolbar hook is the default, so the smoke walk still finds it');
    assert.deepEqual(
      authoredClasses(row),
      ['is-selection', 'manager-component-filter-row'],
      'the root JOINS the host toolbar row class it inherits its metrics from'
    );

    for (const hook of [
      'data-component-select-all-page',
      'data-component-selection-count',
      'data-component-select-all-results',
      'data-component-clear-selection'
    ]) {
      assert.ok(
        Boolean(root.querySelector(`[${hook}]`)),
        `${hook} is a shipped selector in foundry-test-run.mjs and the view-lab cases`
      );
    }
  });

  it('renames the row class and every hook for a second studio', async () => {
    const root = await toolbar.mount({
      pageSelectionState: 'all',
      count: 3,
      showSelectAllResults: true,
      selectAllResultsCount: 12,
      rowClass: 'manager-recipe-filter-row',
      toolbarAttr: 'data-recipe-selection-toolbar',
      pageBoxAttr: 'data-recipe-select-all-page',
      countAttr: 'data-recipe-selection-count',
      resultsAttr: 'data-recipe-select-all-results',
      clearAttr: 'data-recipe-clear-selection'
    });

    const row = root.querySelector('[data-recipe-selection-toolbar]');
    assert.ok(row, 'the toolbar hook is a parameter, not a reason to fork the component');
    assert.deepEqual(authoredClasses(row), ['is-selection', 'manager-recipe-filter-row']);

    for (const hook of [
      'data-recipe-select-all-page',
      'data-recipe-selection-count',
      'data-recipe-select-all-results',
      'data-recipe-clear-selection'
    ]) {
      assert.ok(Boolean(root.querySelector(`[${hook}]`)), `${hook} should be rendered`);
    }

    // The defaults must be GONE, not merely joined by the overrides: a primitive that
    // emitted both would let one studio's screenshot walk photograph the other's toolbar.
    for (const shipped of [
      'data-component-selection-toolbar',
      'data-component-select-all-page',
      'data-component-selection-count',
      'data-component-select-all-results',
      'data-component-clear-selection'
    ]) {
      assert.ok(
        !root.querySelector(`[${shipped}]`),
        `${shipped} must not survive an override, or the two studios share selectors`
      );
    }
  });

  it('hides the count, the results link and Clear while nothing is selected', async () => {
    const root = await toolbar.mount({ count: 0, showSelectAllResults: true });

    assert.ok(
      Boolean(root.querySelector('[data-component-select-all-page]')),
      'the tri-state page box is always available — it is how a selection STARTS'
    );
    for (const hook of [
      'data-component-selection-count',
      'data-component-select-all-results',
      'data-component-clear-selection'
    ]) {
      assert.ok(!root.querySelector(`[${hook}]`), `${hook} belongs to a non-empty selection`);
    }
  });
});
