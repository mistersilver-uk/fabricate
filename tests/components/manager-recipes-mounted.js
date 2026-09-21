/** The recipe routes: the browser, the editor, the overview tab and Books & Scrolls. */

import { afterEach, before, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync, mount, tick, unmount } from 'svelte';
// Issue 1504: a converted control is a shared `<Select>`.
import {
  chooseSelectOption,
  selectOptionValues,
  selectTriggerText,
} from '../helpers/select-control.js';
import { createStore } from '../helpers/manager/managerStoreFake.js';
import {
  createManagerQueries,
  editRecipeName,
  headerSaveButton,
} from '../helpers/manager/managerQueries.js';
import { createManagerMounts } from '../helpers/manager/managerMount.js';
import {
  booksScrollsFixtures,
  managerComponents,
  settleBetweenTests,
} from './manager-mounted-shared.js';

let Component;
let RecipeOverviewTabComponent;
let mounted;
let target;

// The locators read `target` through a getter rather than a captured element.
const queries = createManagerQueries(() => target);
const {
  activeCraftingSubitemIds,
  assertHeaderBackIsGhost,
  craftingParent,
  craftingSubitem,
  switchScopeSystemTo,
} = queries;
const { mountManager, openRecipeEditor } = createManagerMounts({
  queries,
  component: () => Component,
  adopt: (nextMounted, nextTarget) => {
    mounted = nextMounted;
    target = nextTarget;
  },
  adoptStore: () => {},
});

/** Register this route’s cases in `manager-mounted.test.js`’s one describe. */
export function registerRecipesCases() {
  before(async () => {
    ({
      Component,
      RecipeOverviewTabComponent,
    } = await managerComponents());
  });

  afterEach(async () => {
    if (mounted) {
      unmount(mounted);
      mounted = null;
    }
    target?.remove();
    target = null;
    await settleBetweenTests();
  });


  it('recipe overview shows the check-tier dropdown only when tiers exist and emits checkTierId', () => {
    const emitted = [];
    // No tiers ⇒ no dropdown.
    mountRecipeOverview({
      recipe: { id: 'r1', checkTierId: null },
      checkTierOptions: [],
      onUpdateRecipe: () => {},
    });
    assert.ok(!target.querySelector('[data-recipe-check-tier]'), 'no tiers, no dropdown');
    unmount(mounted);
    mounted = null;
    target.remove();

    // Tiers present ⇒ dropdown with the recipe's current selection.
    mountRecipeOverview({
      recipe: { id: 'r1', checkTierId: 'tier1' },
      checkTierOptions: [
        { id: 'tier1', name: 'Hard', dc: 18 },
        { id: 'tier2', name: 'Easy', dc: 8 },
      ],
      onUpdateRecipe: (patch) => emitted.push(patch),
    });
    // The cell is the shared `<Select>` since issue 1510, so the chosen tier is the trigger's own
    // text and the offers are rows in its panel — and the blank Default row takes the primitive's
    // `__unchanged__` handle, because a `data-popover-option` cannot be empty.
    const tier = '[data-recipe-check-tier] [data-recipe-field="checkTierId"]';
    assert.ok(target.querySelector(tier), 'dropdown renders when tiers exist');
    assert.equal(selectTriggerText(target, tier), 'Hard (DC 18)', 'reflects the recipe selection');
    assert.deepEqual(
      selectOptionValues(target, tier),
      ['__unchanged__', 'tier1', 'tier2'],
      'Default + two tiers'
    );

    chooseSelectOption(target, tier, 'tier2');
    assert.deepEqual(emitted.at(-1), { checkTierId: 'tier2' });

    chooseSelectOption(target, tier, '__unchanged__');
    assert.deepEqual(emitted.at(-1), { checkTierId: null }, 'Default clears the tier');
  });

  // THE HOST CARRIES `.fabricate-manager` (issue 1510), because the tab's converted select portals
  // its panel to the nearest application root and falls back to `<body>` without one — so a bare
  // `<div>` host would put the option list outside the element every assertion here reads.
  function mountRecipeOverview(props) {
    target = document.createElement('div');
    target.className = 'fabricate-manager';
    document.body.appendChild(target);
    mounted = mount(RecipeOverviewTabComponent, { target, props });
    flushSync();
    return target;
  }

  // The per-recipe visibility card is GONE (issue 643 §2c). It was a legacy surface
  // editing legacy fields: gated on the superseded `recipeVisibility.listMode`, writing
  // `recipe.visibility { restricted, allowedUserIds }` whose canonical successor is
  // `recipe.access { characterIds, playerIds }` — owned by the Access tab. The
  // assertions below are the REMOVAL contract, not a repoint of the old editor.
  it('recipe overview no longer renders any per-recipe visibility editor', () => {
    mountRecipeOverview({
      recipe: { id: 'r1', visibility: { restricted: true, allowedUserIds: ['u1'] } },
      onUpdateRecipe: () => {},
    });
    assert.equal(
      target.querySelector('[data-recipe-section="visibility"]'),
      null,
      'the legacy visibility section is deleted, not restyled'
    );
    assert.equal(
      target.querySelector('[data-recipe-field="visibility-restricted"]'),
      null,
      'no restrict toggle'
    );
    assert.equal(
      target.querySelector('[data-recipe-visibility-users]'),
      null,
      'no allowed-users allow-list'
    );
  });

  // The Locked STATUS card is a different concept from the recipe-item locked IMAGE
  // (`data-recipe-item-locked-image`), so it deliberately sits outside that naming
  // family. `recipe.locked` was persisted and engine-honoured but written by nothing.
  it('recipe overview renders the Locked status card and toggles it in both directions', () => {
    const toggled = [];
    mountRecipeOverview({
      recipe: { id: 'r1' },
      locked: false,
      onToggleLocked: (next) => toggled.push(next),
      onUpdateRecipe: () => {},
    });
    const card = target.querySelector('[data-recipe-section="locked-status"]');
    assert.ok(card, 'the Locked status card renders');
    assert.equal(
      target.querySelector('[data-recipe-item-locked-image]'),
      null,
      'the Locked card is not the recipe-item locked-image affordance'
    );
    // The Locked card is a left-aligned status card (icon + copy + switch).
    assert.ok(
      card.querySelector('.manager-recipe-status-card') ||
        card.classList.contains('manager-recipe-status-card'),
      'the Locked switch and its copy sit in a status card'
    );
    assert.ok(
      card.querySelector('[data-recipe-field="locked"]'),
      'the Locked switch renders in the status card'
    );
    assert.equal(
      card.querySelector('.manager-task-core-status'),
      null,
      'a card with no image picker must not reuse the media column stack, which centres and 14ch-clamps its copy'
    );
    const toggle = target.querySelector('[data-recipe-field="locked"]');
    assert.equal(toggle.getAttribute('aria-pressed'), 'false', 'an unlocked recipe reads off');
    toggle.click();
    assert.deepEqual(toggled, [true], 'locking requests locked = true');

    unmount(mounted);
    mounted = null;
    target.remove();

    // Unlocking is never gated — a GM locks a recipe precisely while it is unfinished.
    const unlocked = [];
    mountRecipeOverview({
      recipe: { id: 'r1' },
      locked: true,
      onToggleLocked: (next) => unlocked.push(next),
      onUpdateRecipe: () => {},
    });
    const lockedToggle = target.querySelector('[data-recipe-field="locked"]');
    assert.equal(lockedToggle.getAttribute('aria-pressed'), 'true', 'a locked recipe reads on');
    assert.equal(lockedToggle.disabled, false, 'unlocking is never gated');
    lockedToggle.click();
    assert.deepEqual(unlocked, [false], 'unlocking requests locked = false');
  });

  it('routes to the recipes browser with selected recipe inspector and actions', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { experimentalFeaturesEnabled: true }),
        services: {
          openCurrentAdmin: () => {},
        },
      },
    });
    flushSync();

    craftingParent().click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipes');
    assert.equal(target.querySelectorAll('.manager-recipe-row').length, 2);
    // ONE page header, owned by the shell (issue 643). The library used to render a
    // second — kicker + "Recipe library" + a second subtitle — directly beneath the
    // shell's breadcrumb / "Recipes" / subtitle / Create block.
    assert.equal(
      target.querySelectorAll('.manager-main .manager-section-header').length,
      0,
      'the library must not stack a second page header under the shell header'
    );
    assert.ok(target.textContent.includes('Healing Draught'));
    assert.ok(target.textContent.includes('Restores a small amount of health.'));
    assert.ok(target.textContent.includes('Player visibility'));
    const enabledRecipeToggle = target.querySelector(
      '[data-recipe-id="r1"] .manager-status-toggle'
    );
    const disabledRecipeToggle = target.querySelector(
      '[data-recipe-id="r2"] .manager-status-toggle'
    );
    assert.ok(enabledRecipeToggle, 'enabled recipe row should render the shared status toggle');
    assert.ok(disabledRecipeToggle, 'disabled recipe row should render the shared status toggle');
    assert.equal(enabledRecipeToggle.getAttribute('aria-pressed'), 'true');
    assert.equal(disabledRecipeToggle.getAttribute('aria-pressed'), 'false');
    // No "On"/"Off" TEXT in the row (issue 643): the track colour is the state.
    for (const toggle of [enabledRecipeToggle, disabledRecipeToggle]) {
      assert.equal(
        toggle.querySelector('.manager-status-toggle-label'),
        null,
        'the row switch carries no redundant On/Off text'
      );
      assert.ok(toggle.getAttribute('aria-label'), 'the switch is still named for assistive tech');
    }
    assert.equal(
      target.querySelector('[data-recipe-id="r2"] .manager-toggle input[type="checkbox"]'),
      null
    );

    target.querySelector('[data-recipe-id="r2"] .manager-recipe-identity').click();
    await tick();
    flushSync();
    assert.ok(target.querySelector('[data-recipe-id="r2"]').classList.contains('is-selected'));
    assert.ok(target.textContent.includes('Locked Elixir'));
    assert.ok(target.textContent.includes('Restricted (none selected)'));
    // r2 is incomplete AND off, so enabling it would be REFUSED.
    const r2Blocked = target.querySelector('[data-recipe-id="r2"] .manager-chip.is-danger');
    assert.ok(r2Blocked, "an incomplete, disabled recipe row should say it can't be enabled");
    assert.equal(r2Blocked.textContent.trim(), "Can't enable");
    assert.equal(
      target.querySelector('[data-recipe-id="r1"] .manager-chip.is-warning'),
      null,
      'a complete recipe row should not render an authoring-state pill'
    );

    assert.equal(
      target.querySelector('.manager-pagination'),
      null,
      'pagination should hide while filtered row count is below the page size'
    );

    // The status filter is a segmented control (all / on / off).
    assert.equal(
      target.querySelector('[data-recipe-filter-chip="status"]'),
      null,
      'no active-filter chip should show while every filter is at its default'
    );
    const offSegment = target.querySelector('[data-recipe-status-option="off"] input');
    offSegment.checked = true;
    offSegment.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();
    assert.equal(
      target.querySelectorAll('.manager-recipe-row').length,
      1,
      'only the off recipe remains'
    );
    const statusChip = target.querySelector('[data-recipe-filter-chip="status"]');
    assert.ok(statusChip, 'an active filter should surface a clearable chip');
    statusChip.querySelector('.manager-recipe-chip-clear').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('[data-recipe-filter-chip="status"]'),
      null,
      'clearing the chip should reset the filter'
    );
    assert.equal(target.querySelectorAll('.manager-recipe-row').length, 2);

    // `Edit recipe` is the POINT of the inspector and its primary action (issue 643).
    const inspectorActions = Array.from(
      target.querySelectorAll('.manager-recipe-browser-inspector-actions [data-recipe-action]')
    ).map((button) => button.dataset.recipeAction);
    assert.deepEqual(
      inspectorActions,
      ['duplicate', 'edit', 'delete'],
      'Duplicate (secondary), then Edit (primary), then Delete demoted below it'
    );
    // The 2x2 stat grid (issue 643, brief §3.3) answers the four questions a GM has
    // about the recipe they just clicked. Structure and Result-groups restated the row
    // itself and are gone; Ingredients, Results and the Crafting check replace them.
    for (const fact of ['ingredients', 'results', 'steps', 'check']) {
      assert.ok(
        target.querySelector(`[data-recipe-fact="${fact}"]`),
        `recipe inspector should expose the ${fact} stat`
      );
    }
    assert.ok(
      target.querySelector('.manager-recipe-stat-grid'),
      'recipe inspector should render the stat grid, not the generic fact list'
    );
    // The inspector is ONE column on the panel background, not five nested boxes.
    assert.equal(
      target.querySelectorAll('.manager-recipe-browser-inspector .manager-inspector-card').length,
      0,
      'the inspector sections are micro-labels on the panel, not nested cards'
    );
    assert.equal(
      target.querySelector('[data-recipe-inspector]').textContent.includes('Recipe details'),
      false,
      'the invented "Recipe details" heading is gone'
    );
    const heroRow = target.querySelector('.manager-recipe-browser-inspector-hero');
    assert.ok(heroRow, 'recipe inspector should lead with its hero');
    assert.equal(
      heroRow.querySelector('[data-medallion]').dataset.medallion,
      'image',
      'recipe inspector hero should render the resolved recipe image, not only a glyph'
    );

    const search = target.querySelector('.manager-toolbar input[type="search"]');
    search.value = 'elixir';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    target.querySelector('[data-recipe-id="r2"] .manager-status-toggle').click();

    // Duplicate and Delete moved to the inspector (issue 643).
    target.querySelector('[data-recipe-id="r2"] .manager-recipe-identity').click();
    flushSync();
    target
      .querySelector('.manager-recipe-browser-inspector [data-recipe-action="duplicate"]')
      .click();
    target.querySelector('.manager-recipe-browser-inspector [data-recipe-action="delete"]').click();

    assert.deepEqual(calls.slice(-2), [
      ['duplicateRecipe', 'r2'],
      ['deleteRecipe', 'r2'],
    ]);
    assert.ok(calls.some((call) => call[0] === 'setRecipeSearch' && call[1] === 'elixir'));
    const enableCall = calls.find(
      (call) => call[0] === 'toggleRecipeEnabled' && call[1] === 'r2' && call[2] === true
    );
    assert.ok(enableCall, 'the row toggle reaches the store through the root');

    // THE CHAIN, END TO END. `RecipesBrowserView` hands its `onToggleEnabled` prop an
    // `onBlocked` sink; the ROOT must forward that third argument to
    // `store.toggleRecipeEnabled`, because supplying it is exactly what makes the real
    // store suppress its Foundry notification. Two half-proofs (the row emits it; the
    // store honours it) both stay green while the root quietly drops it — and the flash
    // dies while the toast returns. So this asserts the whole path: the store received
    // the sink, and driving that sink renders the in-window flash.
    assert.equal(
      typeof enableCall[3]?.onBlocked,
      'function',
      "the root must forward the row's blocked-message sink to the store — dropping it silently restores the Foundry toast"
    );
    assert.equal(target.querySelector('[data-recipe-flash]'), null, 'nothing has been refused yet');
    enableCall[3].onBlocked('This recipe has no result groups.');
    flushSync();
    const flash = target.querySelector('[data-recipe-flash]');
    assert.ok(flash, 'the refusal the store pushes back through the sink renders in-window');
    assert.equal(flash.getAttribute('role'), 'alert');
    assert.match(flash.textContent, /This recipe has no result groups\./);
    // The dismiss control is the shared `<Notice>`'s own as of issue 1515.
    target.querySelector('[data-notice-dismiss]').click();
    flushSync();
    assert.ok(!target.querySelector('[data-recipe-flash]'), 'the flash is dismissible');

    // The recipes header no longer renders crafting-system import/export.
    assert.ok(
      !calls.some((call) => call[0] === 'importRecipes'),
      'recipes header should not call importRecipes'
    );
    assert.ok(
      !calls.some((call) => call[0] === 'exportRecipes'),
      'recipes header should not call exportRecipes'
    );

    // Edit moved to the inspector (issue 643): r2 is already selected above.
    const editButton = target.querySelector(
      '.manager-recipe-browser-inspector [data-recipe-action="edit"]'
    );
    assert.ok(
      editButton.querySelector('.fa-pen'),
      'the inspector Edit action carries the pen icon'
    );
    editButton.click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipe-edit',
      'Edit should navigate to the recipe-edit route'
    );
    assert.ok(
      target.querySelector('.manager-main [data-recipe-section="identity"]'),
      'recipe-edit renders the identity card in the central main'
    );
    // The mock system carries no recipeVisibility.knowledge.mode.
    assert.equal(
      target.querySelector('.manager-inspector'),
      null,
      'recipe-edit renders no inspector aside — the rail is deleted and its column released'
    );
    const booksTab = target.querySelector('.manager-main [data-recipe-tab-button="books-scrolls"]');
    assert.ok(booksTab, 'the Books & Scrolls tab is offered for the default knowledge mode');
    booksTab.click();
    await tick();
    flushSync();
    assert.ok(
      target.querySelector('.manager-main [data-recipe-section="recipe-item"]'),
      'the Books & Scrolls tab hosts the linked-book list'
    );
    // The recipe-edit header now follows the task/environment convention.
    const recipeEditButtons = Array.from(
      target.querySelectorAll('.manager-header-actions .manager-button')
    );
    assert.ok(
      !recipeEditButtons.some((button) => button.textContent.includes('Cancel')),
      'recipe-edit header should not offer a Cancel control'
    );
    const backButton = recipeEditButtons.find((button) =>
      button.textContent.includes('Back to recipes')
    );
    assert.ok(backButton, 'recipe-edit header should offer a Back to recipes control');
    backButton.click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipes',
      'Back to recipes should return to the recipes browser'
    );
  });

  // Issue 643: the browser's filter / sort / group / paginate state is lifted to the
  // root so it survives the edit round-trip. Opening the editor unmounts the browser;
  // without the lift it remounted at defaults, throwing away the view the GM left. The
  // search term already persisted (it lives in the store); this proves the other controls
  // now do too — open Edit from the ROW pencil, return, and find the same view.
  it('preserves the recipe browser filters and sort across an edit round-trip', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { experimentalFeaturesEnabled: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    craftingParent().click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipes');
    assert.equal(
      target.querySelectorAll('.manager-recipe-row').length,
      2,
      'both recipes at the default filter'
    );

    // Filter to OFF (leaves only the disabled r2) and flip the sort to descending.
    const offSegment = target.querySelector('[data-recipe-status-option="off"] input');
    offSegment.checked = true;
    offSegment.dispatchEvent(new Event('change', { bubbles: true }));
    target.querySelector('[data-recipe-sort-direction]').click();
    await tick();
    flushSync();
    assert.deepEqual(
      Array.from(target.querySelectorAll('.manager-recipe-row')).map((row) => row.dataset.recipeId),
      ['r2'],
      'the OFF filter leaves only the disabled recipe'
    );
    assert.equal(
      target.querySelector('[data-recipe-sort-direction]').dataset.recipeSortDirection,
      'desc'
    );

    // Open the editor from the ROW's own Edit pencil (the restored primary affordance).
    target.querySelector('[data-recipe-id="r2"] [data-recipe-edit]').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipe-edit',
      'the row Edit pencil opens the recipe-edit route'
    );

    // Return via Back to recipes.
    const backButton = Array.from(
      target.querySelectorAll('.manager-header-actions .manager-button')
    ).find((button) => button.textContent.includes('Back to recipes'));
    assert.ok(backButton, 'the editor offers Back to recipes');
    backButton.click();
    await tick();
    flushSync();

    // The browser is back with the SAME filters and sort — not reset to defaults.
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipes');
    assert.ok(
      target.querySelector('[data-recipe-filter-chip="status"]'),
      'the status filter survived the edit round-trip'
    );
    assert.deepEqual(
      Array.from(target.querySelectorAll('.manager-recipe-row')).map((row) => row.dataset.recipeId),
      ['r2'],
      'the OFF filter is still applied after returning from the editor'
    );
    assert.equal(
      target.querySelector('[data-recipe-sort-direction]').dataset.recipeSortDirection,
      'desc',
      'the descending sort survived the edit round-trip'
    );
  });

  // Issue 806: the category filter AND the current page are lost across the edit
  // round-trip when the reset sentinel is component-local (it re-fires on the remount).
  it('preserves the recipe browser category filter and page across an edit round-trip', async () => {
    const calls = [];
    // Twelve same-category recipes so a page-2 (size 10) view is reachable.
    const potions = Array.from({ length: 12 }, (_, index) => ({
      id: `p${String(index + 1).padStart(2, '0')}`,
      name: `Potion ${String(index + 1).padStart(2, '0')}`,
      img: 'icons/consumables/potions/potion-bottle-corked-red.webp',
      description: 'A brew.',
      category: 'potions',
      recipeItemId: `ri-p${index + 1}`,
      enabled: true,
      locked: false,
      isSimple: true,
      structureLabel: 'Simple',
      stepCount: 1,
      resultGroupCount: 1,
      ingredientCount: 2,
      toolCount: 0,
      checkSummary: { kind: 'none', dc: null },
      requirementsPreview: [
        {
          id: 'step-1',
          name: 'Step 1',
          ingredientSetCount: 1,
          ingredientCount: 2,
          toolCount: 0,
          resultGroupCount: 1,
        },
      ],
      visibilitySummary: 'All players',
      ingredients: new Array(2),
      tools: [],
    }));
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { experimentalFeaturesEnabled: true, recipes: potions }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    craftingParent().click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipes');

    // Filter to the potions category, then shrink the page and step to page 2.
    const categorySelect = target.querySelector('[data-recipe-category-filter]');
    categorySelect.value = 'potions';
    categorySelect.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    flushSync();

    chooseSelectOption(target, '[data-pagination-size]', 10);
    await tick();
    flushSync();
    target.querySelector('[data-pagination-next]').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('[data-recipe-count]').textContent.trim(),
      '11–12 of 12',
      'the browser is on page 2 before opening the editor'
    );

    // Open the editor from a page-2 row, then return via Back to recipes.
    target.querySelector('[data-recipe-id="p11"] [data-recipe-edit]').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipe-edit');

    const backButton = Array.from(
      target.querySelectorAll('.manager-header-actions .manager-button')
    ).find((button) => button.textContent.includes('Back to recipes'));
    backButton.click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipes');
    assert.ok(
      target.querySelector('[data-recipe-filter-chip="category"]'),
      'the category filter survived the edit round-trip'
    );
    assert.equal(
      target.querySelector('[data-recipe-count]').textContent.trim(),
      '11–12 of 12',
      'the browser returned to page 2, not page 1'
    );
  });

  it('creates a recipe from the recipes header and opens the recipe-edit route', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { experimentalFeaturesEnabled: true }),
        services: {
          openCurrentAdmin: () => {},
        },
      },
    });
    flushSync();

    craftingParent().click();
    await tick();
    flushSync();

    const createButton = Array.from(
      target.querySelectorAll('.manager-header-actions .manager-button')
    ).find((button) => button.textContent.includes('Create recipe'));
    assert.ok(createButton, 'recipes header should offer a Create recipe control');
    createButton.click();
    await tick();
    flushSync();

    assert.ok(
      calls.some((call) => call[0] === 'createRecipe'),
      'Create recipe should call store.createRecipe'
    );
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipe-edit',
      'Create recipe should open the recipe-edit route'
    );
  });

  it('shows the recipe-item inspector aside on the recipe-edit route when the knowledge mode is learned', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          experimentalFeaturesEnabled: true,
          recipeKnowledgeMode: 'learned',
        }),
        services: {
          openCurrentAdmin: () => {},
        },
      },
    });
    flushSync();

    craftingParent().click();
    await tick();
    flushSync();

    // Select r2, then open the editor from the inspector's Edit action (issue 643).
    target.querySelector('[data-recipe-id="r2"] .manager-recipe-identity').click();
    await tick();
    flushSync();
    target.querySelector('.manager-recipe-browser-inspector [data-recipe-action="edit"]').click();
    await tick();
    flushSync();

    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipe-edit',
      'Edit should navigate to the recipe-edit route'
    );
    assert.ok(
      target.querySelector('.manager-main [data-recipe-section="identity"]'),
      'recipe-edit still renders the identity card in the central main'
    );
    // Learning a recipe requires it to link a recipe item (the book the player
    // learns from), and this surface is the only place that link can be REMOVED,
    // so the Books & Scrolls tab must show for 'learned' too — otherwise a
    // learned-only system has no way to see or manage what teaches a recipe.
    const booksTab = target.querySelector('.manager-main [data-recipe-tab-button="books-scrolls"]');
    assert.ok(booksTab, 'the Books & Scrolls tab is offered for the learned knowledge mode');
    booksTab.click();
    await tick();
    flushSync();
    assert.ok(
      target.querySelector('.manager-main [data-recipe-section="recipe-item"]'),
      'the Books & Scrolls tab hosts the linked-book list for the learned knowledge mode'
    );
    assert.ok(
      !target.textContent.includes('Edit identity for this recipe.'),
      'learned mode no longer shows the identity-only subtitle'
    );
  });

  it('stages editor edits without persisting until the header Save is pressed', async () => {
    const calls = [];
    const target = await openRecipeEditor(calls);

    editRecipeName(target, 'Greater Healing Draught');
    await tick();
    flushSync();

    // No persistence has happened yet — the edit is staged in the root-held draft.
    assert.ok(
      !calls.some((call) => call[0] === 'updateRecipe'),
      'editing does not call store.updateRecipe before Save'
    );
    // The Unsaved chip reflects the dirty draft.
    const dirtyChip = Array.from(
      target.querySelectorAll('.manager-header-actions .manager-chip.is-warning')
    ).find((chip) => chip.textContent.includes('Unsaved'));
    assert.ok(dirtyChip, 'the Unsaved chip is shown while the draft is dirty');

    // The header Save commits the whole staged draft in exactly one updateRecipe call.
    headerSaveButton(target).click();
    await tick();
    flushSync();
    const updateCalls = calls.filter((call) => call[0] === 'updateRecipe');
    assert.equal(updateCalls.length, 1, 'Save fires exactly one store.updateRecipe');
    assert.equal(updateCalls[0][1], 'r1', 'updateRecipe targets the edited recipe id');
    assert.equal(
      updateCalls[0][2].name,
      'Greater Healing Draught',
      'the committed draft carries the staged name'
    );
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipes',
      'a successful Save returns to the recipes browser'
    );
  });

  it('gives a step seeded by switching to multi-step a stable id (so step-scoped edits route to the step, not the recipe)', async () => {
    const calls = [];
    const target = await openRecipeEditor(calls, {
      selectedFeatures: {
        essences: true,
        effectTransfer: true,
        itemTags: true,
        gathering: true,
        recipeCategories: true,
        multiStepRecipes: true,
      },
    });

    // Switching a single-step recipe to multi-step seeds one step into the draft.
    target.querySelector('.manager-main [data-recipe-step-mode-option="multi"]').click();
    await tick();
    flushSync();

    headerSaveButton(target).click();
    await tick();
    flushSync();

    const updateCalls = calls.filter((call) => call[0] === 'updateRecipe');
    assert.equal(updateCalls.length, 1, 'Save commits the staged multi-step draft once');
    const committed = updateCalls[0][2];
    assert.ok(
      Array.isArray(committed.steps) && committed.steps.length === 1,
      'the draft now holds one explicit step'
    );
    assert.ok(
      typeof committed.steps[0].id === 'string' && committed.steps[0].id.length > 0,
      'the seeded step carries a stable id so its scoped edits do not misroute'
    );
  });

  it('persists the enabled toggle immediately and never marks the editor dirty', async () => {
    const calls = [];
    await openRecipeEditor(calls);

    // r1 starts enabled; toggling fires toggleRecipeEnabled(false) immediately.
    target.querySelector('.manager-main [data-recipe-field="enabled"]').click();
    await tick();
    flushSync();

    const toggleCalls = calls.filter((call) => call[0] === 'toggleRecipeEnabled');
    assert.equal(
      toggleCalls.length,
      1,
      'the enabled toggle persists immediately via toggleRecipeEnabled'
    );
    assert.deepEqual(
      [toggleCalls[0][1], toggleCalls[0][2]],
      ['r1', false],
      'it disables the persisted recipe'
    );
    assert.ok(
      !calls.some((call) => call[0] === 'updateRecipe'),
      'the enabled toggle does not stage an updateRecipe'
    );

    // The toggle synced the baseline, so the editor is not dirty: no Unsaved chip.
    const dirtyChip = Array.from(
      target.querySelectorAll('.manager-header-actions .manager-chip.is-warning')
    ).find((chip) => chip.textContent.includes('Unsaved'));
    assert.equal(dirtyChip, undefined, 'toggling enabled does not mark the editor dirty');
  });

  it('does not prompt on navigation when only the enabled toggle changed', async () => {
    const calls = [];
    await openRecipeEditor(calls);

    target.querySelector('.manager-main [data-recipe-field="enabled"]').click();
    await tick();
    flushSync();

    Array.from(target.querySelectorAll('.manager-header-actions .manager-button'))
      .find((button) => button.textContent.includes('Back to recipes'))
      .click();
    await tick();
    flushSync();

    assert.ok(
      !calls.some((call) => call[0] === 'confirmDiscardDirtyRecipeDraft'),
      'no discard prompt fires after only toggling enabled'
    );
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipes',
      'navigation proceeds without a prompt'
    );
  });

  it('prompts the 3-way choice on dirty navigation and Saves on the save choice', async () => {
    const calls = [];
    const target = await openRecipeEditor(calls, { confirmDiscardRecipeResult: 'save' });

    editRecipeName(target, 'Save On Exit');
    await tick();
    flushSync();

    Array.from(target.querySelectorAll('.manager-header-actions .manager-button'))
      .find((button) => button.textContent.includes('Back to recipes'))
      .click();
    await tick();
    flushSync();

    assert.ok(
      calls.some((call) => call[0] === 'confirmDiscardDirtyRecipeDraft'),
      'the 3-way choice dialog is consulted on dirty navigation'
    );
    const updateCalls = calls.filter((call) => call[0] === 'updateRecipe');
    assert.equal(updateCalls.length, 1, 'choosing Save commits the staged draft');
    assert.equal(
      updateCalls[0][2].name,
      'Save On Exit',
      'the committed draft carries the staged name'
    );
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipes',
      'navigation proceeds after Save'
    );
  });

  it('discards staged edits on the discard choice and does not persist them', async () => {
    const calls = [];
    const target = await openRecipeEditor(calls, { confirmDiscardRecipeResult: 'discard' });

    editRecipeName(target, 'Discard Me');
    await tick();
    flushSync();

    Array.from(target.querySelectorAll('.manager-header-actions .manager-button'))
      .find((button) => button.textContent.includes('Back to recipes'))
      .click();
    await tick();
    flushSync();

    assert.ok(
      calls.some((call) => call[0] === 'confirmDiscardDirtyRecipeDraft'),
      'the choice dialog is consulted'
    );
    assert.ok(
      !calls.some((call) => call[0] === 'updateRecipe'),
      'choosing Discard persists nothing'
    );
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipes',
      'navigation proceeds after Discard'
    );
  });

  it('stays in the editor on the cancel (keep editing) choice', async () => {
    const calls = [];
    const target = await openRecipeEditor(calls, { confirmDiscardRecipeResult: 'cancel' });

    editRecipeName(target, 'Keep Editing');
    await tick();
    flushSync();

    Array.from(target.querySelectorAll('.manager-header-actions .manager-button'))
      .find((button) => button.textContent.includes('Back to recipes'))
      .click();
    await tick();
    flushSync();

    assert.ok(
      calls.some((call) => call[0] === 'confirmDiscardDirtyRecipeDraft'),
      'the choice dialog is consulted'
    );
    assert.ok(!calls.some((call) => call[0] === 'updateRecipe'), 'cancelling persists nothing');
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipe-edit',
      'cancelling keeps the editor open'
    );
  });

  it('changing the crafting system from the rail scope-select returns to the recipe browser', async () => {
    const calls = [];
    const target = await openRecipeEditor(calls);
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'recipe-edit');

    const scopeSelect = target.querySelector('[data-manager-scope-select]');
    const current = scopeSelect.value;
    const other = Array.from(scopeSelect.options)
      .map((option) => option.value)
      .find((value) => value !== current);
    assert.ok(other, 'a second crafting system is available to switch to');

    scopeSelect.value = other;
    scopeSelect.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
    await tick();
    flushSync();

    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipes',
      'switching system from the recipe editor lands on the recipe browser, not a stale editor'
    );
    assert.ok(
      calls.some((call) => call[0] === 'selectSystem' && call[1] === other),
      'the new system was selected'
    );
  });

  it('guards an unsaved recipe editor before a scope-select system switch (cancel keeps it open)', async () => {
    const calls = [];
    const target = await openRecipeEditor(calls, { confirmDiscardRecipeResult: 'cancel' });
    editRecipeName(target, 'Dirty Draft');
    await tick();
    flushSync();

    const scopeSelect = target.querySelector('[data-manager-scope-select]');
    const other = Array.from(scopeSelect.options)
      .map((option) => option.value)
      .find((value) => value !== scopeSelect.value);

    scopeSelect.value = other;
    scopeSelect.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }));
    await tick();
    flushSync();

    assert.ok(
      calls.some((call) => call[0] === 'confirmDiscardDirtyRecipeDraft'),
      'the discard dialog is consulted before switching system'
    );
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipe-edit',
      'cancelling the discard keeps the editor open'
    );
    assert.ok(
      !calls.some((call) => call[0] === 'selectSystem' && call[1] === other),
      'the system is not switched when the discard is cancelled'
    );
  });

  // The Knowledge surface's ROOT wiring (issue 785). The surface's own behaviour is
  // covered by tests/components/knowledge-view-mounted.test.js; what only the root
  // can prove is that the sub-item routes, that the shared inspector aside is
  // suppressed (leaving it rendered would hold a dead 300px strip open beside the
  // surface's own roster · detail columns), and that the global roll-up chip lands
  // in the page header rather than the per-character fact cluster.
  it('routes the Knowledge sub-item to a full-width three-pane surface with no shared inspector', async () => {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore([], { experimentalFeaturesEnabled: true }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();
    craftingParent().click();
    await tick();
    flushSync();
    craftingSubitem('Knowledge').click();
    await tick();
    flushSync();

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'knowledge');
    assert.equal(craftingSubitem('Knowledge').getAttribute('aria-current'), 'page');
    assert.equal(craftingSubitem('Knowledge').classList.contains('is-active'), true);
    assert.ok(target.querySelector('[data-knowledge-view]'), 'the knowledge surface renders');
    assert.ok(target.querySelector('[data-knowledge-search]'), 'the roster search renders');
    assert.equal(
      target.querySelector('.manager-inspector'),
      null,
      'the shared inspector aside is suppressed for the knowledge route'
    );
    // The page header carries no roster roll-up pill.
    assert.equal(
      target.querySelector('[data-knowledge-header-pills]'),
      null,
      'the knowledge page header renders no roster roll-up pill'
    );
  });

  // Navigate the mounted manager to the Books & Scrolls surface via the Crafting
  // group and return the surface root for querying.
  async function openBooksScrolls(calls, storeOptions = {}, services = {}) {
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, { experimentalFeaturesEnabled: true, ...storeOptions }),
        services: { openCurrentAdmin: () => {}, ...services },
      },
    });
    flushSync();
    craftingParent().click();
    await tick();
    flushSync();
    craftingSubitem('Books & Scrolls').click();
    await tick();
    flushSync();
    return target;
  }


  it('lists recipe items with recipe-count and cap chips and surfaces the item inspector on select', async () => {
    const calls = [];
    await openBooksScrolls(calls, { recipeItemDefinitions: booksScrollsFixtures });

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'books-scrolls');
    assert.ok(target.querySelector('[data-books-scrolls]'), 'Books & Scrolls surface renders');
    // The parent nav count totals the visible sub-tabs.
    assert.equal(craftingParent().querySelector('.manager-nav-count').textContent.trim(), '4');

    // Both recipe items are listed with their own recipe-count + learning chips.
    const cards = Array.from(target.querySelectorAll('[data-books-scrolls-item]'));
    assert.equal(cards.length, 2);
    assert.equal(
      target.querySelector('[data-books-scrolls-recipe-count="ri1"]').textContent.trim(),
      '1 recipe'
    );
    assert.equal(
      target.querySelector('[data-books-scrolls-recipe-count="ri2"]').textContent.trim(),
      'No recipes'
    );
    // Knowledge mode (default): the cap chip shows the learning limit.
    assert.equal(
      target
        .querySelector('[data-books-scrolls-cap-chip="ri1"]')
        .getAttribute('data-books-scrolls-cap-limited'),
      'true'
    );
    assert.equal(
      target
        .querySelector('[data-books-scrolls-cap-chip="ri2"]')
        .getAttribute('data-books-scrolls-cap-limited'),
      'false'
    );

    // Toggling a row's enabled flag routes through setRecipeItemEnabled (no draft).
    target.querySelector('[data-books-scrolls-toggle="ri1"]').click();
    await tick();
    flushSync();
    assert.ok(
      calls.some(
        (call) => call[0] === 'setRecipeItemEnabled' && call[1] === 'ri1' && call[2] === false
      ),
      'toggling a row calls setRecipeItemEnabled'
    );

    // Selecting a row surfaces the ItemPageInspector aside for that item.
    target.querySelector('[data-books-scrolls-select="ri2"]').click();
    await tick();
    flushSync();
    assert.ok(
      target.querySelector('[data-item-page-inspector]'),
      'the item inspector renders on select'
    );
    assert.equal(
      target.querySelector('[data-item-page-name]').textContent.trim(),
      'Scroll of Elixirs'
    );
    assert.equal(target.querySelector('[data-item-page-recipe-count]').textContent.trim(), '0');
  });

  it('opens the recipe-item editor from a Books & Scrolls row and saves the staged draft', async () => {
    const calls = [];
    await openBooksScrolls(calls, { recipeItemDefinitions: booksScrollsFixtures });

    // The pen action opens the full-window recipe-item editor route.
    target.querySelector('[data-books-scrolls-edit="ri1"]').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipe-item-edit'
    );
    assert.ok(
      target.querySelector('[data-recipe-item-editor]'),
      'the recipe-item editor body renders'
    );
    // AND THE TRAIL NAMES THE ITEM (issue 1328).
    assert.deepEqual(
      Array.from(target.querySelectorAll('.manager-breadcrumbs > *'))
        .filter((node) => node.tagName.toLowerCase() !== 'i')
        .map((node) => node.textContent.trim()),
      ['Crafting Systems', 'Alchemy', 'Crafting', 'Books & Scrolls', 'Alchemist Cook Book']
    );
    // The router owns the header + footer actions.
    assertHeaderBackIsGhost('[data-recipe-item-back]', 'recipe-item-edit');
    assert.ok(target.querySelector('[data-recipe-item-delete]'), 'Delete action renders');
    const save = target.querySelector('[data-recipe-item-save]');
    assert.ok(save, 'Save action renders');
    assert.equal(save.disabled, true, 'Save is disabled until the draft is dirty');
    // The editor is fed the persisted linked recipe (r1) for ri1.
    assert.ok(
      target.textContent.includes('Alchemist Cook Book'),
      'the linked item name shows in the editor'
    );

    // Flipping the Overview Enabled toggle stages a draft change → dirty.
    target.querySelector('[data-recipe-item-enabled]').click();
    await tick();
    flushSync();
    assert.ok(
      target.querySelector('[data-recipe-item-dirty]'),
      'the Unsaved chip appears when dirty'
    );
    assert.equal(
      target.querySelector('[data-recipe-item-save]').disabled,
      false,
      'Save enables when dirty'
    );

    // Saving commits the whole draft in one saveRecipeItem call.
    target.querySelector('[data-recipe-item-save]').click();
    await tick();
    flushSync();
    const saveCall = calls.find((call) => call[0] === 'saveRecipeItem' && call[1] === 'ri1');
    assert.ok(saveCall, 'Save routes through saveRecipeItem for ri1');
    assert.equal(saveCall[2].enabled, false, 'the staged enabled change is persisted');
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'books-scrolls');
  });

  it('retains the resolved Recipe Item source snapshot after a staged compendium drop', async () => {
    const calls = [];
    const replacement = {
      uuid: 'Compendium.mythwright.items.Item.field-guide',
      name: 'Field Guide to Mythwright',
      img: 'icons/sundries/books/book-embossed-gold-red.webp',
      type: 'book',
      description: 'A complete resolved source snapshot.',
    };
    await openBooksScrolls(
      calls,
      { recipeItemDefinitions: booksScrollsFixtures },
      {
        resolveToolSource: async (uuid) => (uuid === replacement.uuid ? replacement : null),
      }
    );

    target.querySelector('[data-books-scrolls-edit="ri1"]').click();
    await tick();
    flushSync();

    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', {
      value: { getData: () => JSON.stringify({ type: 'Item', uuid: replacement.uuid }) },
    });
    target.querySelector('[data-item-drop-zone="recipe-item"]').dispatchEvent(drop);
    await Promise.resolve();
    await tick();
    flushSync();

    const linkedSource = target.querySelector('[data-item-drop-zone="recipe-item"]');
    assert.match(linkedSource.textContent, /Field Guide to Mythwright/);
    assert.equal(linkedSource.querySelector('img')?.getAttribute('src'), replacement.img);
    assert.equal(
      target.querySelector('[data-recipe-item-name]').textContent.trim(),
      replacement.name
    );
    assert.ok(target.querySelector('[data-recipe-item-dirty]'));
  });

  it('guards a dirty recipe-item editor exit through the confirm-discard chain', async () => {
    const calls = [];
    await openBooksScrolls(calls, {
      recipeItemDefinitions: booksScrollsFixtures,
      // Cancel the discard so navigation is blocked and the editor stays open.
      confirmDiscardRecipeItemResult: 'cancel',
    });

    target.querySelector('[data-books-scrolls-edit="ri1"]').click();
    await tick();
    flushSync();
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipe-item-edit'
    );

    // Make the draft dirty.
    target.querySelector('[data-recipe-item-enabled]').click();
    await tick();
    flushSync();

    // Attempting to leave via Back consults the confirm-discard guard.
    target.querySelector('[data-recipe-item-back]').click();
    await tick();
    flushSync();
    assert.ok(
      calls.some((call) => call[0] === 'confirmDiscardDirtyRecipeItemDraft'),
      'a dirty exit enters the recipe-item confirm-discard chain'
    );
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipe-item-edit',
      'cancelling the discard keeps the editor open'
    );
  });

  it('creates a recipe item by dropping a world/compendium item and then opens its editor', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          experimentalFeaturesEnabled: true,
          recipeItemDefinitions: booksScrollsFixtures,
        }),
        services: {
          openCurrentAdmin: () => {},
        },
      },
    });
    flushSync();
    craftingParent().click();
    await tick();
    flushSync();
    craftingSubitem('Books & Scrolls').click();
    await tick();
    flushSync();

    // Creation is a drop-zone now (issue 844) — the blank-window create dialog is gone.
    assert.equal(target.querySelector('[data-books-scrolls-create]'), null, 'no create button');
    const dropZone = target.querySelector('[data-books-scrolls-drop-zone]');
    assert.ok(dropZone, 'the Books & Scrolls surface has a creation drop-zone');

    // Dropping a compendium item (pack + id) resolves to a Compendium UUID and adds
    // the definition, then routes to its editor.
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    dropEvent.dataTransfer = {
      getData: () => JSON.stringify({ type: 'Item', pack: 'world.items', id: 'tome' }),
    };
    dropZone.dispatchEvent(dropEvent);
    await tick();
    flushSync();
    await tick();
    flushSync();
    assert.ok(
      calls.some(
        (call) => call[0] === 'addRecipeItemFromUuid' && call[2] === 'Compendium.world.items.tome'
      ),
      'dropping an item adds it via addRecipeItemFromUuid with the resolved uuid'
    );
    assert.equal(
      target.querySelector('.fabricate-manager').dataset.managerView,
      'recipe-item-edit'
    );
  });

  it('exposes the Access sub-tab under restricted visibility and grants a recipe', async () => {
    const calls = [];
    target = document.createElement('div');
    document.body.appendChild(target);
    mounted = mount(Component, {
      target,
      props: {
        store: createStore(calls, {
          experimentalFeaturesEnabled: true,
          selectedSystemOverrides: { visibilityMode: 'restricted' },
          pcRoster: [{ id: 'char1', name: 'Aria', img: '' }],
        }),
        services: { openCurrentAdmin: () => {} },
      },
    });
    flushSync();

    // Restricted visibility surfaces the Access sub-tab (and hides Books & Scrolls).
    craftingParent().click();
    await tick();
    flushSync();
    assert.ok(craftingSubitem('Access'), 'the Access sub-tab is shown under restricted visibility');
    assert.equal(
      craftingSubitem('Books & Scrolls'),
      undefined,
      'Books & Scrolls is hidden under restricted'
    );

    craftingSubitem('Access').click();
    await tick();
    flushSync();
    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'access');
    assert.ok(target.querySelector('[data-access-search]'), 'the access list renders');
    assert.ok(target.querySelectorAll('[data-access-row]').length >= 1, 'recipes are listed');

    // Selecting a recipe surfaces the GrantAccessInspector.
    target.querySelector('[data-access-row="r1"]').click();
    await tick();
    flushSync();
    assert.ok(
      target.querySelector('[data-access-roster]'),
      'the grant-access inspector renders on select'
    );
  });

  // ── Crafting route reconciliation across a scope switch (issue 1151) ──────────────
  const RESTRICTED_SIMPLE = { visibilityMode: 'restricted', resolutionMode: 'simple' };
  const KNOWLEDGE_SIMPLE = { visibilityMode: 'knowledge', resolutionMode: 'simple' };
  const GLOBAL_ALCHEMY = { visibilityMode: 'global', resolutionMode: 'alchemy' };
  const KNOWLEDGE_TO_RESTRICTED = { alchemy: KNOWLEDGE_SIMPLE, smithing: RESTRICTED_SIMPLE };

  // Mount with per-system modes, open the Crafting group.
  async function openCraftingEntry(calls, systemCraftingModes, label, storeOptions = {}) {
    mountManager(calls, {
      experimentalFeaturesEnabled: true,
      systemCraftingModes,
      ...storeOptions,
    });
    craftingParent().click();
    await tick();
    flushSync();
    const entry = craftingSubitem(label);
    assert.ok(entry, `the Crafting submenu offers "${label}" for the selected system`);
    entry.click();
    await tick();
    flushSync();
    return target.querySelector('.fabricate-manager').dataset.managerView;
  }

  // The shared arrangement for the three `recipe-item-edit` cases.
  async function openRecipeItemEditorForSwitch(calls, storeOptions = {}) {
    await openCraftingEntry(calls, KNOWLEDGE_TO_RESTRICTED, 'Books & Scrolls', {
      recipeItemDefinitions: booksScrollsFixtures,
      ...storeOptions,
    });
    target.querySelector('[data-books-scrolls-edit="ri1"]').click();
    await tick();
    flushSync();
    return target.querySelector('.fabricate-manager').dataset.managerView;
  }

  // Make the open recipe-item draft dirty through its enabled toggle.
  async function dirtyOpenRecipeItem() {
    target.querySelector('[data-recipe-item-enabled]').click();
    await tick();
    flushSync();
  }

  it('reconciles Access onto the new system’s Books & Scrolls on a scope switch', async () => {
    const calls = [];
    const start = await openCraftingEntry(
      calls,
      { alchemy: RESTRICTED_SIMPLE, smithing: KNOWLEDGE_SIMPLE },
      'Access'
    );
    assert.equal(start, 'access');

    assert.equal(
      await switchScopeSystemTo('smithing'),
      'books-scrolls',
      'a knowledge-mode system offers no Access entry, so the router must not keep rendering it'
    );
    assert.deepEqual(
      activeCraftingSubitemIds(),
      ['books-scrolls'],
      'exactly one Crafting sub-entry is highlighted, and it is the redirect target'
    );
  });

  it('reconciles Books & Scrolls onto the new system’s Access on a scope switch', async () => {
    const calls = [];
    const start = await openCraftingEntry(calls, KNOWLEDGE_TO_RESTRICTED, 'Books & Scrolls');
    assert.equal(start, 'books-scrolls');

    assert.equal(await switchScopeSystemTo('smithing'), 'access');
    assert.deepEqual(activeCraftingSubitemIds(), ['access']);
  });

  it('reconciles a recipe-item editor onto Access, never a Books & Scrolls the system lacks', async () => {
    const calls = [];
    assert.equal(await openRecipeItemEditorForSwitch(calls), 'recipe-item-edit');

    // `recipe-item-edit` is owned by Books & Scrolls, so it collapses onto its parent:
    assert.equal(await switchScopeSystemTo('smithing'), 'access');
    assert.deepEqual(activeCraftingSubitemIds(), ['access']);
  });

  it('reconciles onto Knowledge when the new system is global + alchemy', async () => {
    // The settled edge case, asserted at the mounted level because it is the ONLY cell
    // whose answer depends on `resolutionMode` reaching `buildCraftingNavItems` through
    // `craftingNavArgs`: every other cell resolves the same target either way, so a bag
    // that dropped `resolutionMode` would pass every other assertion here.
    const calls = [];
    const start = await openCraftingEntry(
      calls,
      { alchemy: RESTRICTED_SIMPLE, smithing: GLOBAL_ALCHEMY },
      'Access'
    );
    assert.equal(start, 'access');

    assert.equal(
      await switchScopeSystemTo('smithing'),
      'knowledge',
      'a global alchemy system DOES offer a mode-conditional entry, so Recipes would be wrong'
    );
    assert.deepEqual(activeCraftingSubitemIds(), ['knowledge']);
  });

  it('leaves an always-present Crafting route alone across a scope switch', async () => {
    // The negative control: `recipes` is unconditional, so the clause must not fire.
    const calls = [];
    const start = await openCraftingEntry(calls, KNOWLEDGE_TO_RESTRICTED, 'Recipes');
    assert.equal(start, 'recipes');

    assert.equal(await switchScopeSystemTo('smithing'), 'recipes');
    assert.deepEqual(activeCraftingSubitemIds(), ['recipes']);
  });

  it('still guards a dirty recipe-item editor before reconciling (cancel keeps it open)', async () => {
    // The route-exit guard is not weakened by the read-time normalization.
    const calls = [];
    await openRecipeItemEditorForSwitch(calls, { confirmDiscardRecipeItemResult: 'cancel' });
    await dirtyOpenRecipeItem();

    assert.equal(await switchScopeSystemTo('smithing'), 'recipe-item-edit');
    assert.ok(
      calls.some((call) => call[0] === 'confirmDiscardDirtyRecipeItemDraft'),
      'the recipe-item discard confirmation is consulted before the system switch'
    );
    assert.ok(
      !calls.some((call) => call[0] === 'selectSystem' && call[1] === 'smithing'),
      'cancelling the discard aborts the system switch, so no reconciliation happens'
    );
  });

  it('lands a discarded dirty recipe-item editor on the new system’s Access', async () => {
    const calls = [];
    await openRecipeItemEditorForSwitch(calls, { confirmDiscardRecipeItemResult: 'discard' });
    await dirtyOpenRecipeItem();

    assert.equal(await switchScopeSystemTo('smithing'), 'access');
    assert.ok(
      calls.some((call) => call[0] === 'confirmDiscardDirtyRecipeItemDraft'),
      'the discard confirmation still runs on the way out'
    );
    assert.deepEqual(activeCraftingSubitemIds(), ['access']);
  });

  it('shows the Books & Scrolls empty state when the system has no recipe items', async () => {
    const calls = [];
    await openBooksScrolls(calls, { recipeItemDefinitions: [] });

    assert.equal(target.querySelector('.fabricate-manager').dataset.managerView, 'books-scrolls');
    assert.ok(target.querySelector('[data-books-scrolls-empty]'), 'empty state renders');
    assert.equal(target.querySelectorAll('[data-books-scrolls-item]').length, 0);
    assert.ok(target.textContent.includes('No recipe items yet'));
  });
}
