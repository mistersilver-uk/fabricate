import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import {
  describeValidationAddressPairing,
  describeValidationHostContract,
} from '../helpers/validationAddressContracts.js';

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

// ── THE ROW ACTION'S TWO ADDRESSES (issue 1517) ─────────────────────────────────────────────
//
// A validation row carries `target` — the ROUTE, the editor tab that hosts the gap — and
// `focusTarget` — the CONTROL, the value of the `data-validation-target` attribute the offending
// control carries in that tab. `RecipeItemValidationTab` is the producer for this editor; the
// three tab files below are the destinations; `RecipeItemEditor` is the host that resolves both.
//
// WHY THE HOST IS PROVEN FROM SOURCE HERE RATHER THAN MOUNTED. This suite's harness mounts the
// VALIDATION TAB, which is what makes the producer half directly clickable — the tab takes
// `onSelectIssue` as a prop, so the exact `(target, focusTarget)` pair a row hands the host is
// read from a real click rather than inferred. Mounting `RecipeItemEditor` instead would need a
// second harness carrying that editor's whole compiled closure — the embedded player inventory
// detail, the salvage tree, the shared select and popover stacks — which
// `recipe-item-editor-mounted.test.js` already declares, and a copy of it here is exactly the
// near-identical block the new-code duplication gate refuses. So the host's three obligations are
// read off its source, and the ADDRESSES are joined to the destinations that carry them below.
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
//
// Both contracts below are registered from `tests/helpers/validationAddressContracts.js`, driven
// by THIS editor's facts: the producer's own table, the destination declared for each address it
// emits, and the host's own route call. The machinery those facts feed — the comment stripping
// that keeps a scan from finding an address in the sentence explaining it, both attribute
// spellings, the focusability read that a mounted assertion cannot make, and the ordering — is
// written once there and explained in its docblock. It was a per-suite copy until the SonarCloud
// new-code duplication gate counted this file's copy and the Checks studio's as one shape.
describeValidationAddressPairing({
  title: 'every recipe-item address the producer emits is carried by a real control',
  producerFile: 'recipe-item/RecipeItemValidationTab.svelte',
  tableName: 'CHECK_ADDRESSES',
  tablePattern: /const CHECK_ADDRESSES = \{([\s\S]*?)\n {2}\};/u,
  addressPattern: /focusTarget: '([^']+)'/gu,
  expectedAddressCount: 4,
  expectation: 'the four checks',
  // WHICH FILE IS SUPPOSED TO CARRY WHICH ADDRESS. This is the half a producer cannot check: an
  // address no control carries is a View button that changes tab and focuses nothing, and neither
  // half alone can see it.
  destinations: {
    'recipe-item-source': 'recipe-item/RecipeItemOverviewTab.svelte',
    'recipe-item-link-recipe': 'recipe-item/RecipeItemContentsTab.svelte',
    'recipe-item-uses': 'recipe-item/RecipeItemLimitsTab.svelte',
    'recipe-item-learns': 'recipe-item/RecipeItemLimitsTab.svelte',
  },
  routeNoun: 'tab',
  destinationNoun: 'tab',
  // TWO OF THE FOUR RIDE AN ATTRIBUTE BAG — the Item drop zone's `hookAttrs.root` and the
  // link-recipe popover's `triggerData` — so the element they land on belongs to a primitive and
  // cannot be read from this tab's source. Their focusability is a property of that primitive,
  // proved where it is mounted; declared here rather than skipped so that a stamp moving from a
  // written attribute to a bag, which silently drops the static proof, has to be acknowledged.
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
