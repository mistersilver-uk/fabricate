import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-item-validation-',
  rawModules: ['src/ui/svelte/util/foundryBridge.js'],
  compiledModules: [
    // The manager's ONE chip (issue 883). A `.svelte` the tree renders but the harness
    // omits HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/components/Chip.svelte',
    // THE validation surface and the push-button its View rows render (issue 1444). This
    // tab renders none of the markup itself now, so omitting either CANCELS the suite.
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/EditorValidationSurface.svelte',
    'src/ui/svelte/apps/manager/recipe-item/RecipeItemValidationTab.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/recipe-item/RecipeItemValidationTab.svelte'
});

function draft(overrides = {}) {
  return { id: 'ri1', originItemUuid: '', linkedRecipeIds: [], caps: { item: {}, learn: {} }, ...overrides };
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

function check(root, id) {
  return root.querySelector(`[data-recipe-item-check="${id}"]`);
}

function blockingTile(root) {
  return root.querySelector('[data-recipe-item-count-blocking]');
}

function summary(root) {
  return root.querySelector('[data-recipe-item-validation-summary]');
}

describe('EditorValidationSurface emits the namespace root its rules are anchored on (issue 1509)', () => {
  /*
   * THE ONE ASSERTION IN THIS REPOSITORY THAT READS THE SURFACE'S RENDERED ROOT.
   *
   * Every other guard on this family reads SOURCE TEXT: the area-scope gate reads the composed
   * `const classes = $derived([...])` array, the sheet census reads the selectors, the fixture
   * clauses read strings in `tests/`. All of them are satisfied by a component that DECLARES
   * `fabricate-validation` in that array and stops rendering it on its root element -- at which
   * point every re-rooted rule in `styles/fabricate.css` matches nothing and the summary card,
   * the medallion, the count rail and the row stack draw unstyled in every host, including the
   * manager.
   *
   * Read off the mounted DOM, in the shape `manager-button-mounted.test.js:83` uses, in a suite
   * that already mounts the surface. THIS suite rather than one of the other seven, because this
   * caller is the ONE that passes a `class` of its own -- so the same reading proves both halves
   * of the contract: the root leads, and a caller's classes append after the surface's own
   * instead of replacing them.
   */
  it('writes `fabricate-validation` first on its root section, ahead of a caller`s own classes', async () => {
    const root = await harness.mount({ recipeItem: draft(), linkedItem: null, visibilityMode: 'item' });
    const surface = root.querySelector('[data-editor-validation-surface]');
    assert.ok(Boolean(surface), 'the tab must render the surface at all');
    assert.equal(surface.tagName.toLowerCase(), 'section');
    assert.equal(
      surface.className.replaceAll(/ ?svelte-[a-z0-9]+/g, ''),
      'fabricate-validation manager-recipe-tab manager-recipe-validation ' +
        'manager-editor-validation-surface manager-recipe-item-tab manager-recipe-item-validation',
      'the root must carry the primitive`s own namespace class FIRST -- every re-rooted rule in ' +
        '`styles/fabricate.css` names it as the leading compound -- then the surface`s three ' +
        '`manager-*` classes, then this caller`s two, appended and never substituted'
    );
  });

  it('writes the root on the SECTION and not on the summary row inside it', async () => {
    // THE MUTATION CONTROL'S TARGET, stated as an assertion so the control has something to flip.
    // Moving `class={classes}` off the section and onto the inner summary row leaves the array
    // intact, so `composedClassRegion` still finds `fabricate-validation` as its first literal
    // and the area-scope gate's `rootless`, `gated` and emission clauses all stay green. Only a
    // reading of WHICH element carries it can see that move -- and it is the difference between
    // a root that is an ancestor of the whole family and one that is a sibling of most of it.
    const root = await harness.mount({ recipeItem: draft(), linkedItem: null, visibilityMode: 'item' });
    const row = root.querySelector('.manager-recipe-validation-summary-row');
    assert.ok(Boolean(row), 'the summary row must render, or this control has no subject');
    assert.ok(
      !row.classList.contains('fabricate-validation'),
      'the summary row carries the family root, which belongs on the surface`s own section: ' +
        'every rule in the sheet roots at it as an ANCESTOR of this row, so a root here matches ' +
        'nothing the row contains'
    );
    assert.ok(
      Boolean(row.closest('.fabricate-validation')),
      'and the row must still sit UNDER the root, which is the relationship the sheet encodes'
    );
  });
});

describe('RecipeItemValidationTab (mounted)', () => {
  it('flags a missing linked item and missing recipes as blocking, with the summary card + count tiles', async () => {
    const root = await harness.mount({ recipeItem: draft(), linkedItem: null, visibilityMode: 'item' });
    // Row hooks + per-row status treatment (bordered rows with pass/block pills).
    assert.equal(check(root, 'itemLinked').getAttribute('data-ok'), 'false');
    assert.equal(check(root, 'recipeLinked').getAttribute('data-ok'), 'false');
    assert.ok(check(root, 'itemLinked').classList.contains('is-block'));
    assert.ok(check(root, 'itemLinked').querySelector('.manager-recipe-val-pill.is-block'));
    // usesValid holds (limited-use is off), so it passes.
    assert.equal(check(root, 'usesValid').getAttribute('data-ok'), 'true');
    assert.ok(check(root, 'usesValid').classList.contains('is-pass'));
    assert.ok(check(root, 'usesValid').querySelector('.manager-recipe-val-pill.is-pass'));
    // A grouped bordered-row block with the Requirements group header.
    assert.ok(root.querySelector('[data-recipe-item-validation-group="requirements"] .manager-recipe-val-group-label'));
    // Summary card reads blocked; the two count tiles reflect 1 passing / 2 blocking,
    // and the critical-count observable now lives on the blocking tile.
    assert.equal(summary(root).getAttribute('data-recipe-item-validation-summary'), 'blocked');
    // The HOOK keeps this editor's own word; the CLASS is the surface's, and there are only
    // three of those (issue 1373). `is-blocked` was painted by nothing on four of the six
    // editors that draw this card, so the surface now resolves any caller's word to one of
    // `is-pass`/`is-warn`/`is-block` — the same three the check ROWS above already assert.
    assert.ok(summary(root).classList.contains('is-block'));
    assert.equal(root.querySelector('[data-recipe-item-count-passing]').textContent.trim(), '1');
    assert.equal(blockingTile(root).textContent.trim(), '2');
    assert.equal(blockingTile(root).getAttribute('data-critical-count'), '2');
    // Exactly two count tiles — no Warnings tile (books validation is two-state).
    assert.equal(root.querySelectorAll('[data-recipe-item-validation-counts] .manager-recipe-rail-count').length, 2);
    assert.equal(root.querySelector('.manager-recipe-rail-count.is-warning'), null);
  });

  it('passes all checks when linked, with recipes and valid uses', async () => {
    const root = await harness.mount({
      recipeItem: draft({ linkedRecipeIds: ['r1'], caps: { item: { limitUses: true, maxUses: 2 }, learn: {} } }),
      linkedItem: { uuid: 'Item.a' },
      visibilityMode: 'item'
    });
    assert.equal(check(root, 'itemLinked').getAttribute('data-ok'), 'true');
    assert.equal(check(root, 'recipeLinked').getAttribute('data-ok'), 'true');
    assert.equal(check(root, 'usesValid').getAttribute('data-ok'), 'true');
    assert.ok(check(root, 'itemLinked').querySelector('.manager-recipe-val-pill.is-pass'));
    assert.equal(summary(root).getAttribute('data-recipe-item-validation-summary'), 'clear');
    assert.ok(summary(root).classList.contains('is-pass'));
    assert.equal(root.querySelector('[data-recipe-item-count-passing]').textContent.trim(), '3');
    assert.equal(blockingTile(root).textContent.trim(), '0');
    assert.equal(blockingTile(root).getAttribute('data-critical-count'), '0');
  });

  it('shows the uses check only in item mode', async () => {
    const itemRoot = await harness.mount({ recipeItem: draft({ linkedRecipeIds: ['r1'] }), linkedItem: { uuid: 'Item.a' }, visibilityMode: 'item' });
    assert.ok(check(itemRoot, 'usesValid'));
    assert.equal(check(itemRoot, 'learnsValid'), null);
    harness.remount();
    const knowRoot = await harness.mount({ recipeItem: draft({ linkedRecipeIds: ['r1'] }), linkedItem: { uuid: 'Item.a' }, visibilityMode: 'knowledge' });
    assert.ok(check(knowRoot, 'learnsValid'));
    assert.equal(check(knowRoot, 'usesValid'), null);
  });

  it('flags an invalid ntimes learns count in knowledge mode', async () => {
    const root = await harness.mount({
      recipeItem: draft({ linkedRecipeIds: ['r1'], caps: { item: {}, learn: { limitLearning: true, learningMode: 'ntimes', learnsAllowed: 0 } } }),
      linkedItem: { uuid: 'Item.a' },
      visibilityMode: 'knowledge'
    });
    assert.equal(check(root, 'learnsValid').getAttribute('data-ok'), 'false');
  });

  it('prefers an explicit validation prop over the local computation', async () => {
    const root = await harness.mount({
      recipeItem: draft(),
      linkedItem: null,
      visibilityMode: 'item',
      validation: { checks: [{ id: 'itemLinked', ok: true, label: 'Custom rule' }] }
    });
    const only = root.querySelectorAll('[data-recipe-item-check]');
    assert.equal(only.length, 1);
    assert.equal(only[0].getAttribute('data-ok'), 'true');
    assert.match(only[0].textContent, /Custom rule/);
  });
});
