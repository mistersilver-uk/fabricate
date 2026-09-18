import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import {
  describeValidationAddressPairing,
  describeValidationHostContract,
} from '../helpers/validationAddressContracts.js';
import { FOUNDRY_BRIDGE_RAW_MODULES } from '../helpers/foundryBridgeModules.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-item-validation-',
  rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES],
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
  /* THE ONE ASSERTION IN THIS REPOSITORY THAT READS THE SURFACE'S RENDERED ROOT. */
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
    // The HOOK keeps this editor's own word; the CLASS is the surface's.
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

// ── THE ROW ACTION'S TWO ADDRESSES (issue 1517) ─────────────────────────────────────────────
describe('the recipe-item validation row action addresses a control (issue 1517)', () => {
  const viewButton = (root, id) =>
    root.querySelector(`[data-recipe-item-check="${id}"] [data-recipe-item-validation-view]`);

  it('hands the host BOTH addresses, positionally, for every blocking row', async () => {
    const calls = [];
    const root = await harness.mount({
      recipeItem: draft({ caps: { item: { limitUses: true, maxUses: 0 }, learn: {} } }),
      linkedItem: null,
      visibilityMode: 'item',
      onSelectIssue: (target, focusTarget) => calls.push([target, focusTarget]),
    });

    for (const [id, route, control] of [
      ['itemLinked', 'overview', 'recipe-item-source'],
      ['recipeLinked', 'contents', 'recipe-item-link-recipe'],
      ['usesValid', 'limits', 'recipe-item-uses'],
    ]) {
      const button = viewButton(root, id);
      assert.ok(Boolean(button), `the ${id} row renders a View button`);
      assert.equal(
        button.getAttribute('data-recipe-item-validation-view'),
        route,
        `the ${id} row's hook carries its ROUTE`
      );
      button.click();
    }

    assert.deepEqual(calls, [
      ['overview', 'recipe-item-source'],
      ['contents', 'recipe-item-link-recipe'],
      ['limits', 'recipe-item-uses'],
    ]);
  });

  it('addresses the learning stepper in knowledge mode, where the uses row does not exist', async () => {
    const calls = [];
    const root = await harness.mount({
      recipeItem: draft({
        linkedRecipeIds: ['r1'],
        caps: { item: {}, learn: { limitLearning: true, learningMode: 'ntimes', learnsAllowed: 0 } },
      }),
      linkedItem: { uuid: 'Item.a' },
      visibilityMode: 'knowledge',
      onSelectIssue: (target, focusTarget) => calls.push([target, focusTarget]),
    });
    viewButton(root, 'learnsValid').click();
    assert.deepEqual(calls, [['limits', 'recipe-item-learns']]);
  });

  it('gives a PASSING row no action at all, so the button only ever reaches a defect', async () => {
    // WHICH OF THE SHAPES A ROW IS, asserted rather than assumed. A row carrying neither address
    // renders no button; a row carrying a route alone would render one that changes tab and
    // focuses nothing; a row carrying both is the case above. This tab produces the first and
    // the third — every check it renders names one control — so the route-only shape is proved
    // where it actually occurs, on the Tool and essence surfaces, in their own suites.
    const root = await harness.mount({
      recipeItem: draft({ linkedRecipeIds: ['r1'] }),
      linkedItem: { uuid: 'Item.a' },
      visibilityMode: 'item',
    });
    for (const id of ['itemLinked', 'recipeLinked', 'usesValid']) {
      assert.equal(check(root, id).getAttribute('data-ok'), 'true', `${id} passes in this state`);
      assert.ok(!viewButton(root, id), `and the passing ${id} row renders no View button`);
    }
  });

  it('gives a row whose check it cannot place no action either', async () => {
    // The supplied-`validation` door. A caller may hand this tab a check id its address table
    // does not know; the honest outcome is a row with no action, never a button that routes to
    // `undefined`.
    const root = await harness.mount({
      recipeItem: draft(),
      linkedItem: null,
      visibilityMode: 'item',
      validation: { checks: [{ id: 'unplaceable', ok: false, label: 'Something else' }] },
    });
    assert.ok(!root.querySelector('[data-recipe-item-validation-view]'));
  });
});

// ── THE PAIR, AND THE HOST THAT JOINS IT (issue 1517) ───────────────────────────────────────
describeValidationAddressPairing({
  title: 'every recipe-item address the producer emits is carried by a real control',
  producerFile: 'recipe-item/RecipeItemValidationTab.svelte',
  tableName: 'CHECK_ADDRESSES',
  tablePattern: /const CHECK_ADDRESSES = \{([\s\S]*?)\n {2}\};/u,
  addressPattern: /focusTarget: '([^']+)'/gu,
  expectedAddressCount: 4,
  expectation: 'the four checks',
  // WHICH FILE IS SUPPOSED TO CARRY WHICH ADDRESS. This is the half a producer cannot check.
  destinations: {
    'recipe-item-source': 'recipe-item/RecipeItemOverviewTab.svelte',
    'recipe-item-link-recipe': 'recipe-item/RecipeItemContentsTab.svelte',
    'recipe-item-uses': 'recipe-item/RecipeItemLimitsTab.svelte',
    'recipe-item-learns': 'recipe-item/RecipeItemLimitsTab.svelte',
  },
  routeNoun: 'tab',
  destinationNoun: 'tab',
  // TWO OF THE FOUR RIDE AN ATTRIBUTE BAG.
  focusProvenElsewhere: ['recipe-item-link-recipe', 'recipe-item-source'],
});

describeValidationHostContract({
  title: 'RecipeItemEditor wires the row action in the order the mechanism needs',
  hostFile: 'RecipeItemEditor.svelte',
  tabComponent: 'RecipeItemValidationTab',
  routeCall: 'onSelectTab(route)',
  regionMarker: 'data-recipe-item-issue-announcement',
  regionOutsideNoun: 'tab chain',
  mustPrecede: [
    {
      marker: '{#if recipeItem}',
      present: 'the record guard must exist',
      order: 'the region sits outside the record guard',
    },
    {
      marker: "{#if activeTab === 'overview'}",
      present: 'the tab chain must exist',
      order: 'and outside the tab chain',
    },
  ],
});
