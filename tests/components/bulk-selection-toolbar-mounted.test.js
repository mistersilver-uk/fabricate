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

  // ── THE TWO PARAMETERS ISSUE 1373 ADDED, AND WHERE THEIR CSS HAS TO LIVE ───────────────────
  it('renders the standing hint only when one is given', async () => {
    const bare = await toolbar.mount({ count: 3 });
    assert.ok(
      !bare.querySelector('.fab-bulk-selection-hint'),
      'the default renders a hint element, so the three studios are no longer byte-identical'
    );

    const hinted = await toolbar.mount({ count: 3, hint: 'Bulk actions are in the inspector' });
    const hint = hinted.querySelector('.fab-bulk-selection-hint');
    assert.ok(Boolean(hint), 'the hint prop rendered nothing');
    assert.equal(hint.textContent.trim(), 'Bulk actions are in the inspector');
  });

  it('draws the two actions as bare type only when asked, glyph and underline together', async () => {
    // `proto:595` is a bare clickable span in `--info` with NO border; `proto:596` is the same
    // shape in `--subtle` with NO glyph. The `fa-xmark` this component draws is not invented —
    // `proto:626` is the INSPECTOR PANEL's Clear and it carries one — it is the panel's treatment
    // borrowed for the band, where the reference states the plainer one.
    //
    // BOTH HALVES ON ONE PROP, and both directions asserted: a variant that dropped the glyph and
    // kept the underline would satisfy either clause on its own.
    const shipped = await toolbar.mount({ count: 3, showSelectAllResults: true });
    assert.ok(
      Boolean(shipped.querySelector('.fab-bulk-selection-clear i')),
      'the default lost the xmark, so the three studios are no longer byte-identical'
    );
    assert.ok(
      !shipped.querySelector('.fab-bulk-selection-link').classList.contains('is-bare'),
      'the default marks the link bare, so the studios lose their underline too'
    );

    const bare = await toolbar.mount({ count: 3, showSelectAllResults: true, bareActions: true });
    assert.ok(
      !bare.querySelector('.fab-bulk-selection-clear i'),
      '`Clear` still draws the panel’s xmark, which `proto:596` does not'
    );
    assert.ok(
      bare.querySelector('.fab-bulk-selection-link').classList.contains('is-bare'),
      'the link never takes the class its underline override is keyed on'
    );
    // AND THE LABEL SURVIVES THE GLYPH. Removing the `<i>` from a button whose accessible name is
    // its text is safe; removing the text would not be, and the two edits look alike in a diff.
    assert.match(bare.querySelector('.fab-bulk-selection-clear').textContent, /Clear/);

    // THE OVERRIDE IS A RULE, not just a class. A `class:` directive with no selector behind it
    // renders identically to one with a broken selector.
    const source = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte'),
      'utf8'
    );
    assert.match(
      source,
      /\.fab-bulk-selection-link\.is-bare\s*\{[^}]*border-bottom:\s*0/,
      'nothing removes the underline `proto:595` does not draw'
    );
  });

  it('draws the count glyph the caller names, and defaults to the studios’ own', async () => {
    // ── THE COUNT IS A THIRD OBJECT, NOT A THIRD ACTION ──────────────────────────────────────
    // `proto:593` draws the band's count as `700 11px var(--sans)` in `--accent` behind a
    // `fa-solid fa-check-double` at `font-size:10px; margin-right:6px`. Measured in Chromium
    // against the production layering, everything but the glyph already matches: 10.88px / 700 /
    // `#E8C6A7`, and a 6px optical gap from `--fab-space-chip`. The one real divergence is WHICH
    // GLYPH, and that is markup — no stylesheet can swap an element the template renders, which
    // is why this is a prop and not a rule.
    //
    // A PROP OF ITS OWN rather than a third clause on `bareActions`: see the note beside
    // `countIcon`'s declaration. Both directions are asserted, because a component that ignored
    // the prop and one that hard-coded the design's glyph for everybody each satisfy one clause.
    const shipped = await toolbar.mount({ count: 2 });
    const shippedGlyph = shipped.querySelector('.fab-bulk-selection-count > i');
    assert.ok(Boolean(shippedGlyph), 'the count lost its leading glyph outright');
    assert.deepEqual(
      authoredClasses(shippedGlyph),
      ['fa-layer-group', 'fas'],
      'the default moved off the stack glyph, so the Component, Recipe and Essence Studios — and ' +
        'the two font-size fixtures that hand-copy this markup — no longer render what ships'
    );

    const band = await toolbar.mount({ count: 2, countIcon: 'fa-solid fa-check-double' });
    const bandGlyph = band.querySelector('.fab-bulk-selection-count > i');
    assert.ok(Boolean(bandGlyph), 'the named glyph rendered no element at all');
    assert.deepEqual(
      authoredClasses(bandGlyph),
      ['fa-check-double', 'fa-solid'],
      'the caller names a glyph and the count draws the shipped one anyway'
    );
    // STILL DECORATIVE. The count's accessible name is the `N selected` text beside it; a glyph
    // that lost `aria-hidden` would be announced as an unnamed image in the middle of it.
    assert.equal(bandGlyph.getAttribute('aria-hidden'), 'true', 'the glyph is decoration');
    // AND THE LABEL SURVIVES THE SWAP, which is the edit next to it in any future diff.
    assert.match(band.querySelector('.fab-bulk-selection-count').textContent, /2 selected/);

    // AND THE CATALOGUE ACTUALLY ASKS FOR IT. A prop nobody passes renders the shipped glyph on
    // every screen while both mounted directions above stay green.
    const frame = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/manager/scoped/EntityListInspectorFrame.svelte'),
      'utf8'
    );
    assert.match(
      frame,
      /countIcon="fa-solid fa-check-double"/,
      'the scoped catalogue band never opts in, so `proto:593`’s glyph ships nowhere'
    );
  });

  // ── `selectAllScope`: THE BAND WITHOUT ITS MASTER BOX (issue 1371, gap-list row 37) ────────
  it('keeps the master box and the results wording under the shipped scope', async () => {
    // THE DEFAULT HALF, asserted first and in both directions. A prop that suppressed the box
    // for everybody would still satisfy every `'shown'` assertion below.
    const root = await toolbar.mount({
      pageSelectionState: 'some',
      count: 3,
      showSelectAllResults: true,
      selectAllResultsCount: 9
    });
    assert.ok(
      Boolean(root.querySelector('[data-component-select-all-page]')),
      'the shipped band lost its tri-state box, so the three studios cannot start a selection from it'
    );
    assert.equal(
      root.querySelector('[data-component-select-all-results]').textContent.trim(),
      'Select all 9 results',
      'the shipped band names the FILTERED set, which is the population its link acts on'
    );
  });

  it('drops the master box and names the SHOWN rows under selectAllScope="shown"', async () => {
    // `proto:592-596` draws a count, a standing sentence, one `Select all {n} shown` and Clear —
    // no master box anywhere, and its one action selects the rows on screen. Both halves are one
    // ruling, so both are asserted together: a variant that dropped the box and kept `results`
    // would offer the filtered set with no way to take the page.
    const root = await toolbar.mount({
      pageSelectionState: 'some',
      count: 3,
      showSelectAllResults: true,
      selectAllResultsCount: 9,
      selectAllScope: 'shown'
    });
    assert.ok(
      !root.querySelector('[data-component-select-all-page]'),
      'the master box is still drawn beside a link that already covers the rows it acts on'
    );
    assert.ok(
      !root.querySelector('.fab-bulk-selection-all'),
      'and its label host goes with it — an empty click target is worse than no control'
    );
    assert.equal(
      root.querySelector('[data-component-select-all-results]').textContent.trim(),
      'Select all 9 shown',
      'the one remaining action still names `results`, which is not the population it now takes'
    );
    // The count, the hint and Clear are untouched by the scope: it is a ruling about the
    // select-all pair and nothing else.
    assert.match(
      root.querySelector('[data-component-selection-count]').textContent,
      /3 selected/,
      'the count is the fact the band acts on and is not part of this ruling'
    );
    assert.ok(Boolean(root.querySelector('[data-component-clear-selection]')), 'Clear survives');
  });

  it('renders NOTHING under "shown" while the selection is empty, rather than an empty row', async () => {
    // Everything except the box lives behind `count > 0`, so suppressing the box leaves a
    // bordered, padded row with no children — `.is-selection` in the global sheet gives that row
    // its metrics and its hairline, so it is visible. `proto:591` gates the whole band on the
    // selection for exactly this reason.
    const empty = await toolbar.mount({ count: 0, selectAllScope: 'shown' });
    assert.ok(
      !empty.querySelector('[data-component-selection-toolbar]'),
      'an empty band still renders its bordered row with nothing inside it'
    );

    // AND THE DEFAULT STILL RENDERS AT ZERO, which is the assertion that keeps the one above
    // from being a licence to delete the band: the shipped studios show the box at zero selection
    // because the box is how a selection starts.
    const shipped = await toolbar.mount({ count: 0 });
    assert.ok(
      Boolean(shipped.querySelector('[data-component-selection-toolbar]')),
      'the shipped band stopped rendering at zero selection, which deletes the control that starts one'
    );
  });

  it('renders the shipped band for an unrecognised scope rather than deleting its box', async () => {
    // The closed-set contract `Chip`'s tone and `ManagerButton`'s role both state: a typo shows
    // up as the default, never as a silently missing control.
    for (const selectAllScope of ['results', 'Shown', 'page', '', undefined]) {
      const root = await toolbar.mount({ count: 2, selectAllScope });
      assert.ok(
        Boolean(root.querySelector('[data-component-select-all-page]')),
        `\`${String(selectAllScope)}\` is not a scope this band offers, so it renders the shipped one`
      );
      toolbar.remount();
    }
  });

  it('groups the two text actions at the trailing edge only when asked, and pays for the pair', () => {
    // ── WHY THIS IS A SOURCE ASSERTION AND NOT A MOUNTED ONE ─────────────────────────────────
    // happy-dom computes no cascade, so the mounted tree can state that `is-trailing` is on the
    // element and never that the margin moved. The real geometry is measured in a browser by
    // `scoped-list-inspector-geometry.test.js`. What is pinned HERE is the thing that measurement
    // cannot see: WHICH FILE the two declarations are written in.
    //
    // `styles/fabricate.css` ships at `layer(modules)` — `module.json` gives it no explicit layer
    // and Foundry imports an unlayered module sheet there, which `tests/view-lab/cascade.css`
    // reproduces. This component's scoped block is injected unlayered at runtime, and an
    // unlayered declaration beats a layered one whatever the specificity. So the obvious
    // authoring of this rule — a higher-specificity selector in the global sheet — is emitted,
    // matches, and has its declaration silently discarded. It was written that way first and the
    // View Lab is what caught it.
    const source = readFileSync(
      resolve(repoRoot, 'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte'),
      'utf8'
    );
    assert.match(
      source,
      /\.fab-bulk-selection-link\.is-trailing\s*\{[^}]*margin-left:\s*auto/,
      'the trailing-group margin is not in this component’s scoped block'
    );
    // AND THE SECOND HALF, which is the one an eye skips: two flex items each carrying
    // `margin-left: auto` SPLIT the free space rather than both moving right, so `Clear` has to
    // give its own back or the pair sits half a band apart.
    assert.match(
      source,
      /\.fab-bulk-selection-link\.is-trailing\s*\+\s*\.fab-bulk-selection-clear\s*\{[^}]*margin-left:\s*0/,
      '`Clear` keeps its own auto margin beside a trailing link, so the free space splits'
    );

    // COMMENTS STRIPPED FIRST, and that is not tidiness: the sheet's own note about this rule
    // NAMES both selectors, so a comment-blind scan reports the explanation as the violation and
    // the guard can never go green. It also has to still bite, so `fails on a real rule` below is
    // the negative half.
    const sheet = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      ''
    );
    const declarations = sheet
      .split('}')
      .filter((block) => /\.fab-bulk-selection-(link|clear)[^{]*\{/.test(block));
    assert.deepEqual(
      declarations,
      [],
      'a rule in `styles/fabricate.css` targets this primitive’s own elements. That sheet is ' +
        'layered and this block is not, so the rule is discarded silently — author it here.'
    );

    // THE SCAN IS PROVED TO BITE, on the sheet's own text plus one synthetic rule. A
    // comment-stripping filter that stripped too much would report zero on every input, which is
    // indistinguishable from a clean sheet.
    const seeded = `${sheet}\n.fabricate-manager .x .fab-bulk-selection-clear { margin-left: 0; }`;
    assert.equal(
      seeded.split('}').filter((block) => /\.fab-bulk-selection-(link|clear)[^{]*\{/.test(block))
        .length,
      1,
      'the scan cannot see a rule in the global sheet at all, so its green above means nothing'
    );
  });
});
