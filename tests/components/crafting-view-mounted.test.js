import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createMountedComponentHarness,
  CRAFTING_APP_RAW_MODULES,
  CRAFTING_APP_COMPILED_MODULES
} from '../helpers/svelte-component-harness.js';
import {
  craftability,
  essenceCraftability,
  fakeCraftingStore,
  listing,
  recipe
} from '../helpers/crafting-fixtures.js';
import { assertViewErrorTreatment } from '../helpers/playerViewStateAssertions.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-crafting-view-',
  rawModules: CRAFTING_APP_RAW_MODULES,
  compiledModules: CRAFTING_APP_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/apps/crafting/CraftingView.svelte'
});

function services(store, extra = {}) {
  return { crafting: store, craftingSources: null, actorBar: null, ...extra };
}

describe('CraftingView mounted behavior', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('renders the loading state before the first load resolves', async () => {
    const store = fakeCraftingStore({ loading: true, loadedOnce: false, recipes: [] });
    const target = await harness.mount({ services: services(store) });
    assert.ok(target.querySelector('[data-crafting-state="loading"]'), 'loading state shown');
    assert.equal(target.querySelector('[data-crafting-state="populated"]'), null);
  });

  it('announces the loading root as busy, and does not once the view is ready', async () => {
    // Asserted on the RENDERED DOM (issue 1514): a composition that declares `aria-busy` and
    // stops rendering it passes every source-text reader. The negative half matters as much —
    // an attribute that is always there says nothing about the state it describes.
    const loading = await harness.mount({
      services: services(fakeCraftingStore({ loading: true, loadedOnce: false, recipes: [] })),
    });
    const loadingRoot = loading.querySelector('[data-crafting-state="loading"]');
    assert.equal(loadingRoot.getAttribute('aria-busy'), 'true', 'the loading root is busy');
    assert.ok(
      loadingRoot.textContent.includes('FABRICATE.App.Crafting.Loading'),
      'and a VISIBLE label states what is loading'
    );

    harness.remount();
    const ready = await harness.mount({ services: services(fakeCraftingStore({ recipes: [recipe()] })) });
    assert.ok(ready.querySelector('[data-crafting-state="populated"]'), 'the ready view is populated');
    assert.ok(!ready.querySelector('[aria-busy]'), 'nothing in the ready view claims to be busy');
  });

  it('renders the error state when the store reports an error', async () => {
    const store = fakeCraftingStore({ error: 'boom', recipes: [] });
    const target = await harness.mount({ services: services(store) });
    assert.ok(target.querySelector('[data-crafting-state="error"]'), 'error state shown');
    assertViewErrorTreatment(target.querySelector('[data-crafting-state="error"]'), {
      view: 'crafting view',
      message: 'FABRICATE.App.Crafting.Error'
    });
  });

  it('renders the no-actor state when the listing has no selected actor', async () => {
    const store = fakeCraftingStore({ recipes: [], listing: listing([], { selectedActorId: null }) });
    const target = await harness.mount({ services: services(store) });
    assert.ok(target.querySelector('[data-crafting-state="no-actor"]'), 'no-actor state shown');
    assert.equal(target.querySelector('[data-crafting-state="empty"]'), null);
  });

  it('renders the empty state when an actor is selected but has no recipes', async () => {
    const store = fakeCraftingStore({ recipes: [] });
    const target = await harness.mount({ services: services(store) });
    assert.ok(target.querySelector('[data-crafting-state="empty"]'), 'empty state shown');
  });

  it('renders the populated 3-column layout with a recipe', async () => {
    const store = fakeCraftingStore({ recipes: [recipe()] });
    const target = await harness.mount({ services: services(store) });

    assert.equal(target.querySelector('[data-crafting-state="loading"]'), null, 'loading cleared');
    assert.ok(target.querySelector('[data-crafting-state="populated"]'), 'populated layout shown');
    assert.ok(target.querySelector('.crafting-view-column-left'), 'left column present');
    assert.ok(target.querySelector('.crafting-view-column-center'), 'center column present');
    assert.ok(target.querySelector('.crafting-view-column-right'), 'right column present');
    // The browser lists the recipe and the detail dispatcher resolves the body.
    assert.ok(target.querySelector('[data-recipe-id="recipe-1"]'), 'recipe row rendered in browser');
    assert.ok(target.querySelector('[data-crafting-detail-state="selected"]'), 'detail shows the selected recipe');
  });

  it('shows the shopping list in the right column by default (no completed run)', async () => {
    const store = fakeCraftingStore({ recipes: [recipe()] });
    const target = await harness.mount({ services: services(store) });
    assert.ok(target.querySelector('[data-crafting-shopping]'), 'shopping list rendered');
    assert.equal(target.querySelector('[data-crafting-run-summary]'), null, 'no run summary without a result');
  });

  it('swaps the right column to the run summary once the selected recipe has a roll result', async () => {
    const built = recipe();
    const store = fakeCraftingStore({
      recipes: [built],
      lastRollResult: { 'recipe-1': { success: true, items: [{ name: 'Healing Potion', qty: 1 }] } }
    });
    const target = await harness.mount({ services: services(store) });
    assert.ok(target.querySelector('[data-crafting-run-summary]'), 'run summary rendered for a completed run');
    assert.equal(target.querySelector('[data-crafting-shopping]'), null, 'shopping list hidden while the run summary is shown');
  });

  it('disables the run summary "Craft another" when the selection is no longer craftable (non-progressive)', async () => {
    const built = recipe({
      ingredientSets: [{ id: 'set-a', label: 'Option A', craftability: craftability({ canCraft: false }) }]
    });
    const store = fakeCraftingStore({
      recipes: [built],
      selectedCraftability: craftability({ canCraft: false }),
      lastRollResult: { 'recipe-1': { success: true, items: [] } }
    });
    const target = await harness.mount({ services: services(store) });
    const button = target.querySelector('[data-crafting-run-summary] [data-crafting-craft]');
    assert.ok(button, 'run summary craft button present');
    assert.equal(
      button.getAttribute('data-crafting-craft-disabled'),
      'true',
      '"Craft another" is disabled while materials are insufficient'
    );
  });

  it('keeps the progressive run summary "Craft next step" enabled even when materials are insufficient', async () => {
    const built = recipe({
      modeToken: 'progressive',
      modeLabel: 'Progressive',
      ingredientSets: [{ id: 'set-a', label: 'Option A', craftability: craftability({ canCraft: false }) }]
    });
    const store = fakeCraftingStore({
      recipes: [built],
      selectedCraftability: craftability({ canCraft: false }),
      lastRollResult: { 'recipe-1': { success: true, items: [] } }
    });
    const target = await harness.mount({ services: services(store) });
    const button = target.querySelector('[data-crafting-run-summary] [data-crafting-craft]');
    assert.ok(button, 'run summary craft button present');
    assert.equal(
      button.getAttribute('data-crafting-craft-disabled'),
      'false',
      'the time-gated progressive advance stays enabled'
    );
  });

  // ── Issue 917: requirement rail wiring ────────────────────────────────────
  //
  // These prove the view's OWN decisions — which step's rail is interactive, and
  // that the store's callbacks are actually reached. Both are invisible to the rail's
  // own suite, which is handed its props directly.

  function railRecipe(overrides = {}) {
    return recipe({
      ingredientSets: [
        { id: 'set-a', label: 'Option A', craftability: essenceCraftability(), products: [] }
      ],
      activeStepId: 'step-1',
      displayedStepId: 'step-1',
      ...overrides
    });
  }

  it('renders an interactive rail while the displayed step IS the step the engine would run', async () => {
    const store = fakeCraftingStore({ recipes: [railRecipe()] });
    const target = await harness.mount({ services: services(store) });
    assert.ok(target.querySelector('[data-recipe-section="requirement-rail"]'), 'rail rendered');
    assert.ok(
      !target.querySelector('[data-requirement-rail-readonly]'),
      'and it is not read-only'
    );
    assert.ok(target.querySelector('[data-recipe-section="essence-pool"]'), 'the pool auto-opened');
  });

  // A later step's rail describes a craft the button will not fire, and the engine
  // drops any allocation naming the wrong step, so the rail must not imply otherwise.
  it('renders the rail read-only when the displayed step is not the active step', async () => {
    const store = fakeCraftingStore({ recipes: [railRecipe({ activeStepId: 'step-2' })] });
    const target = await harness.mount({ services: services(store) });
    assert.ok(target.querySelector('[data-requirement-rail-readonly]'));
    assert.ok(!target.querySelector('[data-recipe-section="essence-pool"]'), 'no chooser opens');
  });

  // An armed time gate means the inputs were consumed when it was ARMED; a craft
  // click hits the engine's "still in progress" return and the finish path never
  // re-resolves ingredients, so the allocation controls would be a lie.
  it('renders the rail read-only while the active step time gate is armed', async () => {
    const store = fakeCraftingStore({
      recipes: [railRecipe({ activeStepTimeGateArmed: true })]
    });
    const target = await harness.mount({ services: services(store) });
    assert.ok(target.querySelector('[data-requirement-rail-readonly]'));
  });

  it('routes the rail callbacks back to the store', async () => {
    const calls = { openSlot: [], allocate: [], pickForMe: [] };
    const store = fakeCraftingStore({
      recipes: [railRecipe()],
      openSlot: (slotId) => calls.openSlot.push(slotId),
      setEssenceAllocation: (itemKey, units) => calls.allocate.push([itemKey, units]),
      pickForMe: (announcement) => calls.pickForMe.push(announcement)
    });
    const target = await harness.mount({ services: services(store) });

    target.querySelector('[data-requirement-pick-for-me]').click();
    target.querySelector('[data-essence-carrier="Item.dusk-1"] [data-stepper-increment]').click();

    assert.match(calls.pickForMe.at(-1), /Slots\.PickedForYou/, 'the view owns the i18n');
    assert.deepEqual(calls.allocate.at(-1), ['Item.dusk-1', 2]);
  });
});

/**
 * THE CRAFTING TAB'S ADOPTION OF THE SHARED PRIMITIVES, AND THE TWO ROUTINGS IT REFUSED
 * (issue 1514, the fifth and last phase).
 *
 * The refusals are asserted as well as the conversions, because a deferral recorded only in a
 * comment is a deferral the next author reverses without reading it. Each is stated as the
 * measurement that decided it, so a reviewer can re-take the measurement rather than re-argue it.
 */
describe('the crafting tab conversions and the routings they refused (issue 1514)', () => {
  /**
   * Source text with COMMENTS REMOVED, in both syntaxes.
   *
   * Every refusal below is recorded in a comment beside the markup it refuses for, and each of
   * those comments NAMES the primitive it declined — so a raw `includes` scan reads the record of
   * the refusal as the thing it forbids, and the assertion reds on the very sentence that makes
   * the deferral legible.
   */
  function code(file) {
    return readFileSync(resolve(repoRoot, file), 'utf8')
      .replaceAll(/<!--[\s\S]*?-->/gu, '')
      .replaceAll(/\/\*[\s\S]*?\*\//gu, '');
  }

  /**
   * Does `file` IMPORT the named component?
   *
   * The sharper form of "draws no shared X", and the one both refusals need: stripping comments
   * is not enough on its own, because a `//` line comment is prose about the tile a file mirrors
   * and a substring scan reads every one of them.
   */
  function imports(file, component) {
    return new RegExp(String.raw`import\s+${component}\s+from`, 'u').test(code(file));
  }

  const STAGE_LIST = 'src/ui/svelte/apps/crafting/detail/ProgressiveStageList.svelte';
  const BROWSER = 'src/ui/svelte/apps/crafting/RecipeBrowser.svelte';

  it('leaves both progressive stage tiles raw, because the primitive cannot say `draggable`', () => {
    const stages = code(STAGE_LIST);
    assert.ok(!imports(STAGE_LIST, 'Medallion'), 'the stage list draws no shared tile');
    // Counted over the `<img>` TAGS that carry the tile's class, not over the file: a third
    // `draggable="false"` lives on the complication band's own element and would have made a
    // whole-file count read three for two tiles.
    const stageImages = [...stages.matchAll(/<img\b[^>]*crafting-stage-img[^>]*>/gu)].map(
      ([tag]) => tag
    );
    assert.equal(stageImages.length, 2, 'the reorderable tile and the fixed one');
    assert.equal(
      stageImages.filter((tag) => tag.includes('draggable="false"')).length,
      2,
      'both stage images carry it, in the reorderable state and in the fixed one. It is REQUIRED ' +
        'rather than decorative — an `<img>` is natively draggable, so a drag started on the ' +
        'artwork becomes an image drag with the wrong ghost and dropping it outside the app can ' +
        'navigate away — and `progressive-body-mounted.test.js` asserts it in both states. ' +
        '`Medallion.svelte:146` renders its `<img>` with no `draggable` and no rest spread, so a ' +
        'change that builds no primitive cannot add the prop'
    );
    assert.match(
      stages,
      /\.crafting-stage-row\.is-stacked \.crafting-stage-img \{[\s\S]*?border-radius: 6px;/u,
      'and the SECOND blocker, independent of the first: the stacked row re-sizes the tile to ' +
        '30px and re-radiuses it to 6px, which a fixed 9px corner and a single `size` cannot ' +
        'express. Measured unstacked in the View Lab at 24.00x24.00 r4 on both sides of this ' +
        'change, which is the evidence the deferral was honoured'
    );
  });

  it('leaves the browser empty line hand-rolled, because the note variant cannot centre', () => {
    const browser = code(BROWSER);
    assert.ok(!imports(BROWSER, 'EmptyState'), 'the browser draws no shared panel');
    assert.match(
      browser,
      /\.crafting-browser-empty \{[\s\S]*?text-align: center;/u,
      '`.manager-empty.is-note` declares `place-items: start` and `text-align: left` on ITSELF, ' +
        'so a caller cannot restore a centred line through a wrapper; and `filtered`, which ' +
        'centres, keeps the dashed panel, which is the box the frame-move rule forbids. This is ' +
        'the SAME line `InventoryGrid` was refused on one phase earlier, at the same rendered ' +
        'shape — a full-width centred sentence standing in for a whole list — and it carries its ' +
        'filtered/zero distinction in the TEXT the same way'
    );
    assert.match(
      browser,
      /isFiltering\s*\?/u,
      'which is that distinction: a ternary on the sentence, not a variant on the box'
    );
  });

  /**
   * THE TAB'S FOUR ONE-LINE PANE EMPTIES, and the two sites that are NOT among them.
   *
   * The census predicate is the plan's own — `class="…empty"` under the crafting roots — and it
   * returns SEVEN sites in this tab. The plan called six of them one-liners; measured, four are.
   * `ShoppingList`'s is a glyph over a centred sentence FILLING its column (288.86x574.72), which
   * is a panel and is asserted as one in `shopping-list-mounted`; `RecipeBrowser`'s is centred and
   * is refused above; and `RecipeDetail`'s no-selection pane is the composition's sixth copy
   * rather than an empty of its own.
   *
   * Asserted per file by IMPORT plus the deleted class, which is the pair that cannot both hold
   * unless the conversion really happened: a file that still writes its own empty class has not
   * converted, and a file importing nothing cannot be rendering the panel.
   */
  it('routes the tab`s remaining one-line empties through the released `note` panel', () => {
    // THE SOURCES BAR LEFT THIS LIST WITHOUT LEAVING THE TREATMENT (issue 1513). Its picker is
    // the shared `SearchablePopover` now, so the sentence reaches the same `EmptyState note`
    // panel through the primitive's `emptyDetail` prop rather than through markup of its own —
    // which is why the pair this loop asserts (imports `EmptyState` AND deleted its own class)
    // stopped being the readable proof for that file. `component-sources-bar-mounted.test.js`
    // holds it instead, on the RENDERED DOM: a `<p>` under the panel and no `<h3>`, which is
    // stronger than either half of the pair and is the assertion that would catch the one
    // mistake available here — routing a body sentence into `emptyHint`, whose slot is the
    // heading.
    const NOTE_SITES = [
      ['src/ui/svelte/apps/crafting/detail/ConsumptionPlanPanel.svelte', 'consumption-plan-empty'],
      ['src/ui/svelte/apps/crafting/detail/EssencePoolPanel.svelte', 'essence-pool-empty'],
      ['src/ui/svelte/apps/crafting/detail/OutcomeTierTable.svelte', 'crafting-tiers-empty'],
    ];
    for (const [file, deletedClass] of NOTE_SITES) {
      const source = code(file);
      assert.ok(imports(file, 'EmptyState'), `${file} renders the shared panel`);
      assert.match(
        source,
        /<EmptyState note hint=\{/u,
        `${file} passes the sentence as \`hint\`, not \`title\`: \`title\` renders an <h3>, and ` +
          'choosing it at every one-line empty would insert headings into the player app`s outline'
      );
      assert.ok(
        !source.includes(deletedClass),
        `${file} deletes \`.${deletedClass}\` with the markup rather than leaving a rule that ` +
          'paints nothing'
      );
    }
  });

  it('leaves the step label a 12px headline, on a refusal that predates this change', () => {
    // NOT this change's decision, and recorded so the delta's kicker table is not re-litigated:
    // `a7fa2b123` (issue 1505) measured this label and refused it, because converting the step's
    // HEADLINE to the 8.5px subtle rung ranked it below the "Requirements" label beneath it and
    // below the 10px duration chip to its right. Re-measured here at 12.00/15.00, unmoved.
    const steps = 'src/ui/svelte/apps/crafting/detail/StepRequirementsList.svelte';
    assert.ok(!imports(steps, 'Kicker'), 'the step list draws no shared eyebrow');
    assert.match(
      code(steps),
      /\.crafting-step-label \{[\s\S]*?font-size: 12px;/u,
      'and the rule it keeps is the 12px one the earlier refusal named'
    );
  });
});
