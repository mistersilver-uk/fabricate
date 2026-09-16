import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import {
  MARKS_AND_NOTICES_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  STATUS_TONE_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';
import { ANNOUNCE_AFTER_FOCUS_MS } from '../../src/ui/svelte/util/announceAfterFocus.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-item-editor-',
  rawModules: [
    // Issue 1506: the one tone map the converted status pills read at a dynamic site.
    ...STATUS_TONE_RAW_MODULES,
    // Issue 1504: the raw closure the shared `<Select>` reaches through `SearchablePopover`.
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    // RecipeItemEditor/ToolEditView/EssenceEditView resolve, focus and mark the control a
    // validation row addresses through this pure leaf (issue 1517). This harness validates its
    // dependency graph, so an omission throws a named "add it to rawModules" error rather than
    // hanging — but the error arrives from `before()`, which reports as `# cancelled`.
    'src/ui/svelte/apps/manager/validationFocus.js',
    // …and the announcement half beside it (issue 1517, review r1): the panel fallback for a
    // route-only row, the control's accessible name, and the handoff to the module's shared
    // "move focus, then announce" ordering rule — which is why `util/announceAfterFocus.js` is
    // a raw module here too. It was five copies inside five hosts before it was one leaf.
    'src/ui/svelte/apps/manager/validationAnnouncement.js',
    'src/ui/svelte/util/announceAfterFocus.js',
    'src/ui/svelte/util/recipeItemAccessBadge.js',
    // The Limits tab's character-prerequisite picker imports the pure engine (issue 544).
    'src/systems/characterPrerequisites.js',
    'src/ui/svelte/util/dropUtils.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    'src/ui/svelte/actions/anchoredPopover.js',
    'src/ui/svelte/util/overlayBounds.js',
    // The rail's "How players see it" preview builds a synthetic row (pure helper) and
    // embeds the REAL player InventoryDetail, which pulls in the shared art tile and the
    // resolution behind it (issue 544; retargeted by issue 1506).
    'src/ui/svelte/util/recipeItemPreviewRow.js',
    'src/ui/svelte/util/craftingImageDefaults.js',
    'src/ui/svelte/util/craftingArtResolution.js',
    // `SearchablePopover` lays its portaled panel out against the trigger (issue 1458).
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/listboxNavigation.js',
    'src/ui/svelte/util/overlayHost.js',
    // The essence colour fold, reached through the embedded player inventory detail.
    'src/ui/svelte/util/essenceTint.js',
    // NOTE: the progressive order/threshold leaves are deliberately NOT listed.
    // `ProgressiveStageList.svelte` imports neither (only `foundryBridge`); their real
    // importer is `inventoryStore.svelte.js`, which no mounted suite loads.
  ],
  compiledModules: [
    'src/ui/svelte/components/Medallion.svelte',
    // The actor portrait (issue 1514), reached through the EMBEDDED player inventory detail
    // below: the component branch draws a source actor's portrait through it. The preview only
    // ever renders the BOOK branch, but module resolution is not rendering — the compiled
    // router imports every child statically.
    'src/ui/svelte/components/Avatar.svelte',
    'src/ui/svelte/components/Pagination.svelte',
    // Issue 1504: the shared `<Select>`'s whole compiled closure — also covers the manager's
    // ONE chip (issue 883) and the shared no-state primitive (issue 785).
    ...SELECT_COMPILED_MODULES,
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    ...MARKS_AND_NOTICES_COMPILED_MODULES,
    'src/ui/svelte/components/ItemDropZone.svelte',
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    // InventoryDetail routes (issue 675) rather than rendering both bodies itself. The
    // preview only ever reaches the BOOK branch, but module resolution is not rendering:
    // the compiled router imports every child statically, so the whole `detail/` tree
    // must be compiled here too or this suite HANGS (`# cancelled`), never fails.
    // The shell BOTH bodies render inside (header + shared body leaves).
    'src/ui/svelte/apps/inventory/detail/InventoryDetailHeader.svelte',
    'src/ui/svelte/apps/inventory/detail/InventoryDetailPager.svelte',
    'src/ui/svelte/apps/inventory/detail/InventoryBookDetail.svelte',
    // The preview NEVER renders the salvage tree (a book is never salvageable), but the
    // component branch statically imports it, so it must still be compiled here.
    'src/ui/svelte/apps/crafting/detail/ProgressiveStageList.svelte',
    // The shared complication summary row and the leaf it renders (issue 1286).
    // `ProgressiveStageList` draws the per-stage complication band through it, and `Chip` is
    // already above via the `SELECT_COMPILED_MODULES` spread — so omitting either HANGS this
    // suite (# cancelled) rather than failing it.
    'src/ui/svelte/apps/manager/ComplicationSummaryRow.svelte',
    'src/ui/svelte/components/RowDisclosure.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageRollSummary.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageSimpleBody.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageRoutedBody.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageProgressiveBody.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageMisconfiguredBody.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageToolRequirements.svelte',
    'src/ui/svelte/apps/inventory/detail/InventorySalvagePanel.svelte',
    // The multi-system participation selector InventoryComponentDetail imports (issue 766).
    'src/ui/svelte/apps/inventory/detail/InventorySystemSelector.svelte',
    'src/ui/svelte/apps/inventory/detail/InventoryComponentDetail.svelte',
    'src/ui/svelte/apps/inventory/InventoryDetail.svelte',
    // The promoted tab-strip primitive (issue 1362), a dependency of the tab strip below.
    'src/ui/svelte/components/EditorTabs.svelte',
    'src/ui/svelte/apps/manager/recipe-item/RecipeItemEditorTabs.svelte',
    'src/ui/svelte/apps/manager/recipe-item/RecipeItemOverviewTab.svelte',
    // The Contents tab's Link-recipe menu is a `SearchablePopover` (issue 1458).
    // `Chip`, `EmptyState`, `SearchablePopover` and the popover's raw dependencies are already
    // listed above via the `SELECT_COMPILED_MODULES` spread.
    'src/ui/svelte/apps/manager/recipe-item/RecipeItemContentsTab.svelte',
    'src/ui/svelte/apps/manager/recipe-item/RecipeItemLimitsTab.svelte',
    // THE validation surface and the push-button its View rows render (issue 1444). The
    // Validation tab hands the surface its checks and renders no markup itself, so omitting
    // either HANGS this suite (# cancelled) rather than failing it. `ManagerButton` is already
    // listed above via the `SELECT_COMPILED_MODULES` spread.
    'src/ui/svelte/components/EditorValidationSurface.svelte',
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
// ── THE ROW ACTION MOVES FOCUS, END TO END (issue 1517, review r1) ──────────────────────────
//
// The recipe-item editor was the one host of the five whose row action was proved only by SOURCE
// READS — `describeValidationHostContract` in `recipe-item-validation-tab-mounted.test.js` reads
// the ordering out of the file, and the address pairing reads the producer's table against the
// destination tabs. Neither watches the keyboard actually move, and neither can: the pairing scan
// reads the ELEMENT a stamp is written on, and two of this editor's four addresses reach the DOM
// through a primitive's attribute bag, where there is no element in this source to read.
//
// `recipe-item-source` IS ONE OF THOSE TWO, and it was the hole. It rides `ItemDropZone`'s
// `hookAttrs.root` with `tabindex: '-1'` and `'data-keyboard-focus': 'true'` as BAG KEYS — object
// properties, invisible to `design-system-keyboard-focus`'s AST walk, which reads written
// attributes — so deleting both from `RecipeItemOverviewTab` left every gate in the repository
// green while a real browser focused nothing. The pairing suite's `focusProvenElsewhere` list
// DECLARED that its focusability was "proved by a mounted suite"; no such clause existed. It does
// now, and it reads the two attributes off the rendered element, which is the only place they can
// be seen.
describe('RecipeItemEditor — the validation row action reaches the control (issue 1517)', () => {
  // Identity, asserted as a BOOLEAN. Handing a live happy-dom element to `node:assert` renders its
  // subtree, its parents and its owner document when the assertion fails, which takes the process
  // out with a heap OOM — a real failure wearing a crash's costume.
  const assertIs = (actual, expected, message) => assert.equal(actual === expected, true, message);

  /**
   * Mount the editor on its Validation tab with the shell's own route write wired back into the
   * `activeTab` prop, exactly as `RecipeItemEditView` does: this editor does not own its route,
   * so a test that dropped `onSelectTab` would prove the action changed nothing.
   */
  async function openValidation(props) {
    const root = await harness.mount({
      activeTab: 'validation',
      visibilityMode: 'item',
      onSelectTab: (tab) => harness.setProps({ activeTab: tab }),
      ...props,
    });
    return root;
  }

  async function activateIssueView(root, checkId) {
    const button = root.querySelector(
      `[data-recipe-item-check="${checkId}"] [data-recipe-item-validation-view]`
    );
    assert.ok(Boolean(button), `the ${checkId} row renders a View button`);
    button.click();
    // NO `flushSync` BEFORE THE AWAIT, deliberately. The mechanism is that the route change's own
    // flush is queued as a microtask BEFORE the focus helper's, so draining microtasks is what
    // proves the ordering rather than a synchronous flush papering over it.
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    flushSync();
    return button;
  }

  const announcement = (root) =>
    root.querySelector('[data-recipe-item-issue-announcement]').textContent.trim();

  /**
   * Wait for a sentence that is QUEUED BEHIND A FOCUS UTTERANCE (issue 1157). A `polite` region is
   * queued speech and a focus change CANCELS queued speech, so the sentence is written after the
   * move — the rule `src/ui/svelte/util/announceAfterFocus.js` owns for the whole module. The
   * delay is IMPORTED: a local copy would silently start asserting the un-delayed state.
   */
  async function flushAnnouncement() {
    await new Promise((resolve) => setTimeout(resolve, ANNOUNCE_AFTER_FOCUS_MS + 40));
    flushSync();
  }

  it('routes to Overview and focuses the DROP ZONE, whose focusability rides an attribute bag', async () => {
    const root = await openValidation({
      recipeItem: draft({ originItemUuid: '' }),
      linkedItem: null,
      linkedRecipes: [],
    });

    await activateIssueView(root, 'itemLinked');

    assert.ok(Boolean(root.querySelector('[data-recipe-item-tab="overview"]')), 'the route changed');
    const zone = root.querySelector('[data-validation-target="recipe-item-source"]');
    assert.ok(Boolean(zone), 'the Overview tab carries the addressed zone');
    assertIs(document.activeElement, zone, 'and it holds focus');
    // THE TWO ATTRIBUTES, READ OFF THE RENDERED ELEMENT. happy-dom focuses anything, so the line
    // above is vacuous on its own — and the AST walk that would otherwise catch a missing
    // `tabindex` cannot see these two, because they are bag keys rather than written attributes.
    // This is the only reading of them there is. Named mutation: delete either from
    // `RecipeItemOverviewTab`'s `linkHooks.root` and this clause reds.
    assert.equal(zone.tagName, 'DIV', 'a zone root is not natively focusable');
    assert.equal(zone.getAttribute('tabindex'), '-1', 'so it declares the tabindex that makes the focus real');
    assert.equal(
      zone.getAttribute('data-keyboard-focus'),
      'true',
      'and the attribute that tells Foundry the window is focused — without which Space pauses ' +
        'the game and the arrows pan the canvas behind the open application'
    );
    assert.equal(
      zone.getAttribute('data-validation-focused'),
      '',
      'and it is marked, so a POINTER activation paints a ring the :focus reset would strip'
    );
    assert.equal(
      announcement(root),
      '',
      'and the region is EMPTY while the move is in flight: it is cleared before the move and ' +
        'written after it, so a repeat activation of the same row is a CHANGE the region announces'
    );

    await flushAnnouncement();
    assert.equal(
      announcement(root),
      'Overview',
      'the region names the destination it reached; the zone carries no accessible name of its ' +
        'own, so there is no control to name beside it'
    );
  });

  it('changes route and focuses the destination PANEL for a route-only row', async () => {
    // `recipeLinked` names the CONTENTS tab and no control: the remedy is that tab's own
    // Link-recipe menu, and the check is about the list rather than about one control in it.
    // Activating it unmounts the Validation panel the button was in, so with nothing to fall back
    // to focus lands on `<body>`, where every Foundry keybinding is live.
    const root = await openValidation({
      recipeItem: draft(),
      linkedItem: LINKED_ITEM,
      linkedRecipes: [],
    });

    await activateIssueView(root, 'recipeLinked');

    assert.ok(Boolean(root.querySelector('[data-recipe-item-tab="contents"]')), 'the route changed');
    const panel = root.querySelector('.manager-recipe-item-editor-panel');
    assert.ok(Boolean(panel), 'the editor renders its tab panel');
    assertIs(document.activeElement, panel, 'and the panel holds focus, not `<body>`');
    assert.equal(panel.getAttribute('tabindex'), '-1', 'a programmatic destination, not a tab stop');
    assert.equal(panel.getAttribute('data-keyboard-focus'), 'true', 'and it declares itself focused');
    assert.ok(
      !root.querySelector('[data-validation-focused]'),
      'nothing is MARKED: the accent ring names the control a row addressed, and this row ' +
        'addressed none — the panel is where focus went, not what the row was about'
    );
  });
});
