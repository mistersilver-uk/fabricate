import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-item-editor-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/recipeItemAccessBadge.js',
    // The Limits tab's character-prerequisite picker imports the pure engine (issue 544).
    'src/systems/characterPrerequisites.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    // The rail's "How players see it" preview builds a synthetic row (pure helper) and
    // embeds the REAL player InventoryDetail, which pulls in CraftingThumb →
    // craftingImageDefaults (issue 544).
    'src/ui/svelte/util/recipeItemPreviewRow.js',
    'src/ui/svelte/util/craftingImageDefaults.js',
    // NOTE: the progressive order/threshold leaves are deliberately NOT listed.
    // `ProgressiveStageList.svelte` imports neither (only `foundryBridge`); their real
    // importer is `inventoryStore.svelte.js`, which no mounted suite loads.
  ],
  compiledModules: [
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/apps/manager/ItemPickerModal.svelte',
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    'src/ui/svelte/apps/crafting/CraftingThumb.svelte',
    // InventoryDetail routes (issue 675) rather than rendering both bodies itself. The
    // preview only ever reaches the BOOK branch, but module resolution is not rendering:
    // the compiled router imports every child statically, so the whole `detail/` tree
    // must be compiled here too or this suite HANGS (`# cancelled`), never fails.
    'src/ui/svelte/apps/inventory/detail/InventoryDetailPager.svelte',
    'src/ui/svelte/apps/inventory/detail/InventoryBookDetail.svelte',
    // The preview NEVER renders the salvage tree (a book is never salvageable), but the
    // component branch statically imports it, so it must still be compiled here.
    'src/ui/svelte/apps/crafting/detail/ProgressiveStageList.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageRollSummary.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageSimpleBody.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageRoutedBody.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageProgressiveBody.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageMisconfiguredBody.svelte',
    'src/ui/svelte/apps/inventory/detail/InventorySalvagePanel.svelte',
    'src/ui/svelte/apps/inventory/detail/InventoryComponentDetail.svelte',
    'src/ui/svelte/apps/inventory/InventoryDetail.svelte',
    'src/ui/svelte/apps/manager/recipe-item/RecipeItemEditorTabs.svelte',
    'src/ui/svelte/apps/manager/recipe-item/RecipeItemOverviewTab.svelte',
    'src/ui/svelte/apps/manager/recipe-item/RecipeItemContentsTab.svelte',
    'src/ui/svelte/apps/manager/recipe-item/RecipeItemLimitsTab.svelte',
    'src/ui/svelte/apps/manager/recipe-item/RecipeItemValidationTab.svelte',
    'src/ui/svelte/apps/manager/RecipeItemEditor.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/RecipeItemEditor.svelte',
});

const LINKED_ITEM = { uuid: 'Item.abc', name: 'Ashfall Compendium', img: '', type: 'Tome' };
const LINKED_RECIPES = [
  { id: 'r1', name: 'Alloy Bronze', category: 'Smithing' },
  { id: 'r2', name: 'Refine Steel', category: 'Smithing' },
];

function draft(overrides = {}) {
  return {
    id: 'ri1',
    originItemUuid: 'Item.abc',
    enabled: true,
    caps: {
      item: { limitUses: false, maxUses: 3, whenSpent: 'destroyed' },
      learn: { limitLearning: false, learnScope: 'perInstance', learnsAllowed: 1 },
    },
    ...overrides,
  };
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('RecipeItemEditor (mounted)', () => {
  it('shows an empty state when no recipe item is supplied', async () => {
    const root = await harness.mount({ recipeItem: null });
    assert.ok(root.querySelector('.manager-empty'));
    assert.equal(root.querySelector('[data-recipe-item-editor]'), null);
  });

  it('renders the active tab panel and the right rail (with the embedded player preview)', async () => {
    const root = await harness.mount({
      recipeItem: draft(),
      linkedItem: LINKED_ITEM,
      linkedRecipes: LINKED_RECIPES,
      activeTab: 'overview',
      visibilityMode: 'item',
    });
    assert.ok(
      root.querySelector('[data-recipe-item-tab="overview"]'),
      'overview tab panel renders'
    );
    assert.ok(root.querySelector('[data-recipe-item-rail]'), 'right rail renders');
    // The "How players see it" preview now renders the REAL player InventoryDetail.
    const preview = root.querySelector('[data-recipe-item-preview]');
    assert.ok(preview, 'preview wrapper renders');
    assert.ok(
      preview.querySelector('[data-inventory-recipe-item]'),
      'the embedded player book detail renders'
    );
    assert.ok(
      preview.querySelector('[data-inventory-access-badge]'),
      'the player access badge renders'
    );
    assert.ok(root.querySelector('[data-recipe-item-rules]'), 'effective rules render');
  });

  // AC13 (issue 675). The preview renders the REAL player component, so the split that
  // added the salvage surface had to leave it routing to the BOOK body. A book is never
  // salvageable, so the salvage tree is in the module graph but never in the render.
  it('AC13: the preview renders the real player book detail and NEVER a salvage tab', async () => {
    const root = await harness.mount({
      recipeItem: draft(),
      linkedItem: LINKED_ITEM,
      linkedRecipes: LINKED_RECIPES,
      activeTab: 'overview',
      visibilityMode: 'item',
    });
    const preview = root.querySelector('[data-recipe-item-preview]');
    assert.ok(
      preview.querySelector('[data-inventory-recipe-item]'),
      'still the real player book detail, not a re-implementation'
    );
    assert.equal(
      preview.querySelector('[data-inventory-detail-tab="salvage"]'),
      null,
      'no Info | Salvage strip'
    );
    assert.equal(
      preview.querySelector('[data-inventory-salvage-panel]'),
      null,
      'and no salvage panel'
    );
  });

  it('switches the rendered tab with the activeTab prop', async () => {
    const root = await harness.mount({
      recipeItem: draft(),
      linkedItem: LINKED_ITEM,
      linkedRecipes: LINKED_RECIPES,
      activeTab: 'limits',
      visibilityMode: 'item',
    });
    assert.ok(root.querySelector('[data-recipe-item-tab="limits"]'));
    assert.equal(root.querySelector('[data-recipe-item-tab="overview"]'), null);
  });

  it('routes the tab strip selection through onSelectTab', async () => {
    const calls = [];
    const root = await harness.mount({
      recipeItem: draft(),
      linkedItem: LINKED_ITEM,
      linkedRecipes: LINKED_RECIPES,
      activeTab: 'overview',
      onSelectTab: (id) => calls.push(id),
    });
    root.querySelector('[data-recipe-item-tab-button="contents"]').click();
    assert.deepEqual(calls, ['contents']);
  });

  it('derives the contents count badge and a passing validation badge', async () => {
    const root = await harness.mount({
      recipeItem: draft(),
      linkedItem: LINKED_ITEM,
      linkedRecipes: LINKED_RECIPES,
      activeTab: 'overview',
      visibilityMode: 'item',
    });
    assert.equal(
      root.querySelector('[data-recipe-item-tab-badge="contents"]').textContent.trim(),
      '2'
    );
    const validation = root.querySelector('[data-recipe-item-tab-badge="validation"]');
    assert.equal(validation.textContent.trim(), '✓');
    assert.ok(validation.classList.contains('is-active'));
  });

  it('turns the validation badge danger when the linked item is missing', async () => {
    const root = await harness.mount({
      recipeItem: draft({ originItemUuid: '' }),
      linkedItem: null,
      linkedRecipes: [],
      activeTab: 'overview',
      visibilityMode: 'item',
    });
    const validation = root.querySelector('[data-recipe-item-tab-badge="validation"]');
    // itemLinked + recipeLinked both fail = 2 critical.
    assert.equal(validation.textContent.trim(), '2');
    assert.ok(validation.classList.contains('is-danger'));
  });

  it('recomputes the embedded item-mode preview and effective rules from caps', async () => {
    const root = await harness.mount({
      recipeItem: draft({
        caps: { item: { limitUses: true, maxUses: 5, whenSpent: 'inert' }, learn: {} },
      }),
      linkedItem: LINKED_ITEM,
      linkedRecipes: LINKED_RECIPES,
      activeTab: 'overview',
      visibilityMode: 'item',
    });
    const preview = root.querySelector('[data-recipe-item-preview]');
    // Item mode: the embedded player access badge reads the use cap; the affordance is Craft.
    const badge = preview.querySelector('[data-inventory-access-badge]');
    assert.match(badge.textContent, /NUses/, 'the access badge reflects the use cap');
    assert.match(badge.textContent, /5/, 'the use cap value shows');
    assert.ok(
      preview.querySelector('[data-inventory-craft="r1"]'),
      'item-mode books show Craft (not Learn)'
    );
    assert.equal(
      preview.querySelector('[data-inventory-learn="r1"]'),
      null,
      'no Learn affordance in item mode'
    );
    const rules = root.querySelector('[data-recipe-item-rules]').textContent;
    assert.match(rules, /5 uses per copy/);
    assert.match(rules, /inert/i);
  });

  it('shows the knowledge-mode embedded preview and rules when the visibility mode is knowledge', async () => {
    const root = await harness.mount({
      recipeItem: draft({
        caps: {
          item: {},
          learn: { limitLearning: true, learnScope: 'perInstance', learnsAllowed: 3 },
        },
      }),
      linkedItem: LINKED_ITEM,
      linkedRecipes: LINKED_RECIPES,
      activeTab: 'overview',
      visibilityMode: 'knowledge',
    });
    const badge = root.querySelector('[data-recipe-item-preview] [data-inventory-access-badge]');
    assert.match(badge.textContent, /LearnUpToPerCopy/, 'the badge reads the per-copy learn cap');
    assert.match(badge.textContent, /3/, 'the learn cap value shows');
    // Knowledge mode ⇒ per-recipe Learn affordance in the embedded detail.
    assert.ok(
      root.querySelector('[data-recipe-item-preview] [data-inventory-learn="r1"]'),
      'knowledge books show Learn'
    );
    assert.match(root.querySelector('[data-recipe-item-rules]').textContent, /every recipe/i);
  });

  it('resolves a generic/empty recipe image to the blueprint in the embedded preview (issue 544)', async () => {
    const root = await harness.mount({
      recipeItem: draft({
        caps: { item: {}, learn: { limitLearning: false } },
      }),
      linkedItem: LINKED_ITEM,
      // A single linked recipe carrying Foundry's generic item-bag image.
      linkedRecipes: [{ id: 'r1', name: 'Forge Club', img: 'icons/svg/item-bag.svg' }],
      activeTab: 'overview',
      visibilityMode: 'knowledge',
    });
    const thumb = root.querySelector(
      '[data-recipe-item-preview] [data-inventory-learn-recipe="r1"] img'
    );
    assert.ok(thumb, 'the embedded recipe thumbnail renders');
    assert.match(
      thumb.getAttribute('src'),
      /blueprint-recipe-alchemical\.webp$/,
      'shows the blueprint'
    );
    assert.ok(!/item-bag\.svg$/.test(thumb.getAttribute('src')), 'never the generic item-bag SVG');
  });

  it('renders the learn-all CTA in the embedded preview for a Limited-learning book with Recipes-allowed 1 (issue 544)', async () => {
    const root = await harness.mount({
      recipeItem: draft({
        caps: {
          item: {},
          learn: { limitLearning: true, learnScope: 'perInstance', learnsAllowed: 1 },
        },
      }),
      linkedItem: LINKED_ITEM,
      linkedRecipes: [{ id: 'r1', name: 'Forge Club' }],
      activeTab: 'overview',
      visibilityMode: 'knowledge',
    });
    const cta = root.querySelector('[data-recipe-item-preview] [data-inventory-learn-all]');
    assert.ok(
      cta,
      'the embedded learn-all CTA is not hidden when the cap (1) covers the single recipe'
    );
    // A single-recipe book reads the singular "Read & learn".
    assert.match(cta.textContent, /ReadLearnAllRecipeSingular/, 'single recipe ⇒ singular CTA');
  });

  it('renders the embedded player preview even when the book has no recipes', async () => {
    const root = await harness.mount({
      recipeItem: draft(),
      linkedItem: LINKED_ITEM,
      linkedRecipes: [],
      activeTab: 'overview',
      visibilityMode: 'item',
    });
    const preview = root.querySelector('[data-recipe-item-preview]');
    assert.ok(
      preview.querySelector('[data-inventory-recipe-item]'),
      'the embedded detail still renders'
    );
    // No recipes ⇒ no Learn/Craft affordances (the embedded detail shows its empty note).
    assert.equal(preview.querySelector('[data-inventory-learn="r1"]'), null, 'no Learn affordance');
    assert.equal(preview.querySelector('[data-inventory-craft="r1"]'), null, 'no Craft affordance');
  });

  it('surfaces requirements as "Needs:" effective-rules rows (each with a Satisfied? toggle) driving the embedded preview (issue 544)', async () => {
    const root = await harness.mount({
      recipeItem: draft({
        caps: {
          item: {},
          learn: {
            limitLearning: true,
            learnScope: 'perInstance',
            learnsAllowed: 3,
            prerequisiteIds: ['r1'],
            characterPrerequisiteIds: ['p1'],
          },
        },
      }),
      linkedItem: LINKED_ITEM,
      linkedRecipes: LINKED_RECIPES,
      characterPrerequisites: [
        {
          id: 'p1',
          name: 'Wizardly',
          icon: 'fas fa-hat-wizard',
          path: 'skills.arc.rank',
          op: 'gte',
          value: 2,
        },
      ],
      activeTab: 'overview',
      visibilityMode: 'knowledge',
    });
    // Effective rules carry one "Needs: <name>" ROW per requirement, both kinds.
    const rules = root.querySelector('[data-recipe-item-rules]').textContent;
    assert.match(rules, /Needs: Alloy Bronze/, 'a Required Knowledge rule row');
    assert.match(rules, /Needs: Wizardly/, 'a Learning prerequisite rule row');
    // The character-prereq rule sub shows the human-readable preview (@path op value).
    assert.match(rules, /arc\.rank/, 'the prereq preview appears as the rule sub');
    // Each Needs row carries a Satisfied? toggle (the cap rows do not).
    assert.ok(
      root.querySelector('[data-recipe-item-satisfied-toggle="r1"]'),
      'the Required Knowledge row has a Satisfied? toggle'
    );
    assert.ok(
      root.querySelector('[data-recipe-item-satisfied-toggle="p1"]'),
      'the Learning prerequisite row has a Satisfied? toggle'
    );

    // The embedded player preview shows both requirement chips (default satisfied ⇒ met).
    const preview = root.querySelector('[data-recipe-item-preview]');
    const rk = preview.querySelector('[data-inventory-requirement="r1"]');
    assert.ok(rk, 'the embedded preview renders the Required Knowledge chip');
    assert.ok(
      rk.querySelector('i.fa-graduation-cap'),
      'the Required Knowledge chip uses the graduation-cap icon'
    );
    assert.equal(rk.getAttribute('data-requirement-met'), 'true', 'default is satisfied/met');
    assert.ok(
      preview.querySelector('[data-inventory-requirement="p1"]'),
      'the character prereq chip renders too'
    );
  });

  it('the Satisfied? toggle flips the embedded preview met/unmet + Learn gating (issue 544)', async () => {
    const root = await harness.mount({
      recipeItem: draft({
        caps: {
          item: {},
          learn: {
            limitLearning: true,
            learnScope: 'perInstance',
            learnsAllowed: 3,
            prerequisiteIds: ['req-a'],
          },
        },
      }),
      linkedItem: LINKED_ITEM,
      linkedRecipes: [{ id: 'r1', name: 'Alloy Bronze' }],
      availableRecipes: [{ id: 'req-a', name: 'Prereq A' }],
      activeTab: 'overview',
      visibilityMode: 'knowledge',
    });
    const preview = () => root.querySelector('[data-recipe-item-preview]');
    // Default satisfied ⇒ the requirement is met and the recipe's Learn button is enabled.
    assert.equal(
      preview()
        .querySelector('[data-inventory-requirement="req-a"]')
        .getAttribute('data-requirement-met'),
      'true'
    );
    assert.equal(
      preview().querySelector('[data-inventory-learn="r1"]').disabled,
      false,
      'Learn enabled while satisfied'
    );

    // Flip the toggle OFF → the requirement becomes unmet and Learn is disabled.
    root.querySelector('[data-recipe-item-satisfied-toggle="req-a"]').click();
    flushSync();
    assert.equal(
      preview()
        .querySelector('[data-inventory-requirement="req-a"]')
        .getAttribute('data-requirement-met'),
      'false',
      'requirement flips to unmet'
    );
    assert.equal(
      preview().querySelector('[data-inventory-learn="r1"]').disabled,
      true,
      'Learn disabled when unmet'
    );

    // Flip back ON → met + enabled again.
    root.querySelector('[data-recipe-item-satisfied-toggle="req-a"]').click();
    flushSync();
    assert.equal(
      preview()
        .querySelector('[data-inventory-requirement="req-a"]')
        .getAttribute('data-requirement-met'),
      'true'
    );
    assert.equal(
      preview().querySelector('[data-inventory-learn="r1"]').disabled,
      false,
      'Learn re-enabled'
    );
  });

  it('drops the "Needs:" rules/toggles and the preview requirement chips when Limited learning is off (gates toggle-gated)', async () => {
    const root = await harness.mount({
      recipeItem: draft({
        caps: {
          item: {},
          learn: {
            limitLearning: false,
            prerequisiteIds: ['r1'],
            characterPrerequisiteIds: ['p1'],
          },
        },
      }),
      linkedItem: LINKED_ITEM,
      linkedRecipes: LINKED_RECIPES,
      characterPrerequisites: [
        { id: 'p1', name: 'Wizardly', icon: 'fas fa-hat-wizard', path: 'x', op: 'gte', value: 1 },
      ],
      activeTab: 'overview',
      visibilityMode: 'knowledge',
    });
    assert.equal(
      root.querySelector('[data-recipe-item-satisfied-toggle="r1"]'),
      null,
      'no Satisfied? toggle when off'
    );
    assert.equal(
      /Needs:/i.test(root.querySelector('[data-recipe-item-rules]').textContent),
      false,
      'no Needs rules when off'
    );
    assert.equal(
      root.querySelector('[data-recipe-item-preview] [data-inventory-requirement]'),
      null,
      'no preview requirement chips when off'
    );
  });
});
