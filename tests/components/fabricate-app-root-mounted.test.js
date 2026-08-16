/**
 * The player shell's mounted tier.
 *
 * It did not exist before issue 1198, and without it the two behaviours most likely to be
 * wrong — the companion fallback branch and the fault state — would have no honest proof: a
 * source regex can see that a branch is written, never that it renders. Everything here runs
 * against a REAL player-extension registry and the real pure derivations, so a drift between
 * the registry, `playerNavModel.js` and the rail fails here rather than at runtime.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { tick } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { createPlayerExtensionsRegistry } from '../../src/ui/playerExtensions.js';
import { deriveExtensionSurfaces, resolveActiveTab } from '../../src/ui/playerNavModel.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-app-root-',
  // Built by RUNNING the suite and reading the harness's thrown "add it to the named list"
  // message, never by guessing: `validateMountedComponentDependencies` walks the whole static
  // import closure and names the importer chain, the specifier and the target list.
  rawModules: [
    'src/config/flags.js',
    'src/config/hooks.js',
    'src/config/stackQuantityPathPresets.js',
    'src/gatheringImageDefaults.js',
    'src/systems/CraftingListingBuilder.js',
    'src/systems/checkModifierResolver.js',
    'src/systems/craftingBrowseStatus.js',
    'src/systems/foundryCalendar.js',
    'src/systems/inventorySnapshot.js',
    'src/systems/itemStackQuantity.js',
    'src/systems/salvageCheckUsability.js',
    'src/systems/stepRecipeView.js',
    'src/systems/summaryProjection.js',
    'src/systems/toolCheckBonus.js',
    'src/ui/extensionRegistry.js',
    'src/ui/playerExtensions.js',
    'src/ui/playerNavModel.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/apps/gathering/gatheringBlockedReasons.js',
    'src/ui/svelte/apps/gathering/scopedSelection.js',
    'src/ui/svelte/apps/gathering/selectionDefault.js',
    'src/ui/svelte/apps/journal/journalRunStatus.js',
    'src/ui/svelte/util/craftingImageDefaults.js',
    'src/ui/svelte/util/craftingRecipeStatus.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/essenceTint.js',
    'src/ui/svelte/util/fontAwesomeFreeClassicIcons.js',
    'src/ui/svelte/util/formatDuration.js',
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/gatheringConditionIcons.js',
    'src/ui/svelte/util/gatheringFormat.js',
    'src/ui/svelte/util/ingredientOptionStatus.js',
    'src/ui/svelte/util/recipeDuration.js',
    'src/ui/svelte/util/recipeItemAccessBadge.js',
    'src/ui/svelte/util/requirementSlots.js',
    'src/ui/svelte/util/sceneImages.js',
    'src/ui/svelte/util/worldTimeLabel.js',
    'src/utils/checkModifierPicks.js',
    'src/utils/componentCategories.js',
    'src/utils/craftingCheckExpression.js',
    'src/utils/objectPath.js',
    'src/utils/progressiveStageThresholds.js',
    'src/utils/recipeCategories.js',
    'src/utils/rollExpressionAverage.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/PlayerExtensionHost.svelte',
    'src/ui/svelte/apps/alchemy/AlchemyDisciplineChooser.svelte',
    'src/ui/svelte/apps/alchemy/AlchemyView.svelte',
    'src/ui/svelte/apps/alchemy/ComponentInventoryColumn.svelte',
    'src/ui/svelte/apps/alchemy/EssenceChips.svelte',
    'src/ui/svelte/apps/alchemy/KnownRecipesColumn.svelte',
    'src/ui/svelte/apps/alchemy/Workbench.svelte',
    'src/ui/svelte/apps/crafting/ComponentSourcesBar.svelte',
    'src/ui/svelte/apps/crafting/CraftButton.svelte',
    'src/ui/svelte/apps/crafting/CraftingEssenceThumb.svelte',
    'src/ui/svelte/apps/crafting/CraftingStatusBadge.svelte',
    'src/ui/svelte/apps/crafting/CraftingThumb.svelte',
    'src/ui/svelte/apps/crafting/CraftingView.svelte',
    'src/ui/svelte/apps/crafting/QuantityTag.svelte',
    'src/ui/svelte/apps/crafting/RecipeBrowser.svelte',
    'src/ui/svelte/apps/crafting/RecipeDetail.svelte',
    'src/ui/svelte/apps/crafting/RecipeDetailHeader.svelte',
    'src/ui/svelte/apps/crafting/RecipeListRow.svelte',
    'src/ui/svelte/apps/crafting/RunSummaryPanel.svelte',
    'src/ui/svelte/apps/crafting/ShoppingList.svelte',
    'src/ui/svelte/apps/crafting/detail/ConsumptionPlanPanel.svelte',
    'src/ui/svelte/apps/crafting/detail/CraftingCheckCard.svelte',
    'src/ui/svelte/apps/crafting/detail/EssenceContribution.svelte',
    'src/ui/svelte/apps/crafting/detail/EssencePoolPanel.svelte',
    'src/ui/svelte/apps/crafting/detail/IngredientOptionSelector.svelte',
    'src/ui/svelte/apps/crafting/detail/IngredientRoutedBody.svelte',
    'src/ui/svelte/apps/crafting/detail/IngredientSetSelector.svelte',
    'src/ui/svelte/apps/crafting/detail/IoTable.svelte',
    'src/ui/svelte/apps/crafting/detail/OutcomeTierTable.svelte',
    'src/ui/svelte/apps/crafting/detail/ProgressiveBody.svelte',
    'src/ui/svelte/apps/crafting/detail/ProgressiveStageList.svelte',
    'src/ui/svelte/apps/crafting/detail/RecipeBodyShell.svelte',
    'src/ui/svelte/apps/crafting/detail/RequirementRail.svelte',
    'src/ui/svelte/apps/crafting/detail/RequirementTile.svelte',
    'src/ui/svelte/apps/crafting/detail/RollResultBox.svelte',
    'src/ui/svelte/apps/crafting/detail/RoutedByCheckBody.svelte',
    'src/ui/svelte/apps/crafting/detail/SimpleRecipeBody.svelte',
    'src/ui/svelte/apps/crafting/detail/StepRequirementsList.svelte',
    'src/ui/svelte/apps/gathering/ChanceBar.svelte',
    'src/ui/svelte/apps/gathering/EnvironmentCard.svelte',
    'src/ui/svelte/apps/gathering/GatheringDetail.svelte',
    'src/ui/svelte/apps/gathering/GatheringDetailTabs.svelte',
    'src/ui/svelte/apps/gathering/GatheringDropModifiers.svelte',
    'src/ui/svelte/apps/gathering/GatheringEnvironmentList.svelte',
    'src/ui/svelte/apps/gathering/GatheringEventDetail.svelte',
    'src/ui/svelte/apps/gathering/GatheringEventRow.svelte',
    'src/ui/svelte/apps/gathering/GatheringEventsPanel.svelte',
    'src/ui/svelte/apps/gathering/GatheringTaskDetail.svelte',
    'src/ui/svelte/apps/gathering/GatheringTaskDrops.svelte',
    'src/ui/svelte/apps/gathering/GatheringTaskRequirements.svelte',
    'src/ui/svelte/apps/gathering/GatheringTaskRow.svelte',
    'src/ui/svelte/apps/gathering/GatheringTasksPanel.svelte',
    'src/ui/svelte/apps/gathering/GatheringView.svelte',
    'src/ui/svelte/apps/gathering/LinkedScene.svelte',
    'src/ui/svelte/apps/inventory/InventoryDetail.svelte',
    'src/ui/svelte/apps/inventory/InventoryFilters.svelte',
    'src/ui/svelte/apps/inventory/InventoryGrid.svelte',
    'src/ui/svelte/apps/inventory/InventoryItemCard.svelte',
    'src/ui/svelte/apps/inventory/InventoryView.svelte',
    'src/ui/svelte/apps/inventory/bulk/InventoryBulkPanel.svelte',
    'src/ui/svelte/apps/inventory/bulk/InventoryBulkReport.svelte',
    'src/ui/svelte/apps/inventory/bulk/InventoryBulkRow.svelte',
    'src/ui/svelte/apps/inventory/bulk/InventoryBulkSection.svelte',
    'src/ui/svelte/apps/inventory/detail/InventoryBookDetail.svelte',
    'src/ui/svelte/apps/inventory/detail/InventoryComponentDetail.svelte',
    'src/ui/svelte/apps/inventory/detail/InventoryDetailHeader.svelte',
    'src/ui/svelte/apps/inventory/detail/InventoryDetailPager.svelte',
    'src/ui/svelte/apps/inventory/detail/InventorySalvagePanel.svelte',
    'src/ui/svelte/apps/inventory/detail/InventorySystemSelector.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageMisconfiguredBody.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageProgressiveBody.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageRollSummary.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageRoutedBody.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageSimpleBody.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageToolRequirements.svelte',
    'src/ui/svelte/apps/journal/AboutThisRun.svelte',
    'src/ui/svelte/apps/journal/ActionsPanel.svelte',
    'src/ui/svelte/apps/journal/ActiveRunsList.svelte',
    'src/ui/svelte/apps/journal/HistoryList.svelte',
    'src/ui/svelte/apps/journal/HistoryRow.svelte',
    'src/ui/svelte/apps/journal/JournalCard.svelte',
    'src/ui/svelte/apps/journal/JournalFactRow.svelte',
    'src/ui/svelte/apps/journal/JournalListShell.svelte',
    'src/ui/svelte/apps/journal/JournalTips.svelte',
    'src/ui/svelte/apps/journal/JournalView.svelte',
    'src/ui/svelte/apps/journal/RecentResults.svelte',
    'src/ui/svelte/apps/journal/RunCard.svelte',
    'src/ui/svelte/apps/journal/RunDetail.svelte',
    'src/ui/svelte/apps/journal/RunStatusPill.svelte',
    'src/ui/svelte/apps/journal/StepDetails.svelte',
    'src/ui/svelte/apps/journal/StepTimeline.svelte',
    'src/ui/svelte/apps/journal/TimeRemainingBox.svelte',
    'src/ui/svelte/apps/journal/WhatToExpect.svelte',
    'src/ui/svelte/components/ActorSelectTopBar.svelte',
    'src/ui/svelte/components/FillBar.svelte',
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/components/StatusPill.svelte',
    'src/ui/svelte/components/Stepper.svelte',
    'src/ui/svelte/apps/FabricateAppRoot.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/FabricateAppRoot.svelte',
});

const DEFAULT_TAB = 'crafting';

/**
 * A player provider whose tab set is its OWN — three tabs, none of them a Core id.
 *
 * `count` on the first tab is deliberate: the rail renders a badge for any entry with a
 * positive count, so a projection that spread the provider's tab would hand a companion an
 * unvalidated badge. It must be dropped.
 *
 * @param {object} [options] Fixture behaviour.
 * @returns {object} `{ provider, calls }`.
 */
function makeProvider({ id = 'downtime', throwOnMount = false } = {}) {
  const calls = { mounts: [] };
  const provider = {
    apiVersion: 1,
    id,
    tabs: [
      {
        id: 'board',
        label: 'Downtime board',
        icon: 'fab fa-fort-awesome',
        accessibleName: 'Open the Downtime board',
        tooltip: 'Plan downtime activities',
        count: 12,
      },
      { id: 'ledger', label: 'Ledger', icon: 'fas fa-scroll' },
    ],
    mount({ target, tabId, context }) {
      calls.mounts.push({ tabId, context });
      const node = target.ownerDocument.createElement('button');
      node.type = 'button';
      node.textContent = `companion ${tabId}`;
      node.dataset.companionControl = tabId;
      target.append(node);
      if (throwOnMount) throw new Error('companion exploded');
      return () => {};
    },
  };
  return { provider, calls };
}

function fakeServices() {
  return {
    actorBar: {
      selectedActorId: '',
      selectableActors: [],
      loaded: true,
      conditions: null,
      conditionVisibility: {},
      realmContext: { enabled: false, realms: [] },
      selectedActor: null,
      loadSelectableActors: () => {},
      refreshConditions: () => {},
      selectScopedActor: () => {},
      selectActor: () => {},
    },
    journal: { navCount: 0, loadedOnce: true, load: () => {} },
  };
}

/**
 * Drive the shell exactly as the application host does: derive the frozen snapshot from the
 * REAL registry, and fall the active route back through the production `resolveActiveTab`
 * over the rail the shell actually rendered. Nothing here reimplements a production rule.
 */
function makeHost(registry, initialTab = DEFAULT_TAB) {
  let activeTab = initialTab;
  return {
    get activeTab() {
      return activeTab;
    },
    props() {
      return {
        activeTab,
        showAlchemy: false,
        onSelectTab: (tab) => {
          activeTab = tab;
        },
        services: fakeServices(),
        extensionSurfaces: deriveExtensionSurfaces(registry),
        playerExtensions: registry,
      };
    },
    // The offered set read off what the shell RENDERED, so the fallback is applied to the
    // real rail rather than to a fixture mirror of it.
    applyFallback(root) {
      const navTabs = railKeys(root).map((routeKey) => ({ routeKey }));
      activeTab = resolveActiveTab(activeTab, navTabs, DEFAULT_TAB);
      return activeTab;
    },
  };
}

function railButtons(root) {
  return Array.from(root.querySelectorAll('[data-player-nav-tab]'));
}

function railKeys(root) {
  return railButtons(root).map((button) => button.dataset.playerNavTab);
}

function railButton(root, routeKey) {
  return root.querySelector(`[data-player-nav-tab="${routeKey}"]`);
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('FabricateAppRoot (mounted, against a real player registry)', () => {
  it('appends provider tabs after the Core tabs and addresses them by route key', async () => {
    const registry = createPlayerExtensionsRegistry({ emitHook: () => {} });
    registry.publicApi.registerPlayerNavProvider(makeProvider().provider);
    const host = makeHost(registry);
    const root = await harness.mount(host.props());

    assert.deepEqual(railKeys(root), [
      'crafting',
      'gathering',
      'journal',
      'inventory',
      'ext:downtime:board',
      'ext:downtime:ledger',
    ]);
    // A Core entry's route key IS its tab id, so the shipped `data-nav-count` value and every
    // Core id in the DOM are byte-identical to what they were before the seam existed.
    assert.equal(railButton(root, 'crafting').id, 'player-nav-tab-crafting');
    assert.equal(railButton(root, 'ext:downtime:board').id, 'player-nav-tab-ext:downtime:board');
  });

  it('renders provider labels VERBATIM and Core labels localized, with the icon class list as given', async () => {
    const registry = createPlayerExtensionsRegistry({ emitHook: () => {} });
    registry.publicApi.registerPlayerNavProvider(makeProvider().provider);
    const root = await harness.mount(makeHost(registry).props());

    assert.equal(
      railButton(root, 'crafting').querySelector('.fabricate-app-nav-label').textContent,
      'FABRICATE.App.Nav.Crafting',
      'a Core label goes through localize (the harness localizer is identity)'
    );
    assert.equal(
      railButton(root, 'ext:downtime:board').querySelector('.fabricate-app-nav-label').textContent,
      'Downtime board',
      "a provider's label is final display text and is never fed to the localizer"
    );
    // Compared as a class SET (minus Svelte's injected scope class) rather than as the raw
    // attribute, so the assertion is about the glyph classes rather than about compiler output.
    const glyphClasses = (routeKey) =>
      Array.from(railButton(root, routeKey).querySelector('i').classList).filter(
        (name) => !name.startsWith('svelte-')
      );
    assert.deepEqual(
      glyphClasses('crafting'),
      ['fas', 'fa-hammer'],
      'Core prefixes the family for its own bare glyph names'
    );
    assert.deepEqual(
      glyphClasses('ext:downtime:board'),
      ['fab', 'fa-fort-awesome'],
      'a provider supplies the WHOLE class list, so a brands glyph is not given a second family'
    );
  });

  it('ignores a provider-declared count, so no companion tab can render a badge', async () => {
    const registry = createPlayerExtensionsRegistry({ emitHook: () => {} });
    registry.publicApi.registerPlayerNavProvider(makeProvider().provider);
    const root = await harness.mount(makeHost(registry).props());

    assert.ok(
      !railButton(root, 'ext:downtime:board').querySelector('.fabricate-app-nav-count'),
      'the allowlist projection makes an unvalidated, unbounded badge unrepresentable'
    );
    assert.ok(
      !root.querySelector('[data-nav-count="ext:downtime:board"]'),
      'and no route key reaches the badge attribute'
    );
  });

  it('wires the tablist: aria-controls, a labelled panel, roving tabindex and the optional pair', async () => {
    const registry = createPlayerExtensionsRegistry({ emitHook: () => {} });
    registry.publicApi.registerPlayerNavProvider(makeProvider().provider);
    const root = await harness.mount(makeHost(registry, 'ext:downtime:board').props());

    const panel = root.querySelector('#player-nav-panel');
    assert.ok(Boolean(panel), 'the content area is an addressable panel');
    assert.equal(panel.getAttribute('role'), 'tabpanel');
    assert.equal(panel.getAttribute('tabindex'), '0');
    assert.equal(panel.getAttribute('aria-labelledby'), 'player-nav-tab-ext:downtime:board');
    for (const button of railButtons(root)) {
      assert.equal(button.getAttribute('aria-controls'), 'player-nav-panel');
    }
    assert.deepEqual(
      railButtons(root).map((button) => button.getAttribute('tabindex')),
      ['-1', '-1', '-1', '-1', '0', '-1'],
      'exactly one rail button is in the tab order, and it is the active one'
    );

    const active = railButton(root, 'ext:downtime:board');
    assert.equal(active.getAttribute('aria-label'), 'Open the Downtime board');
    assert.equal(active.getAttribute('aria-describedby'), 'player-nav-tooltip-ext:downtime:board');
    // Selected by ATTRIBUTE, never by id: an id selector containing a colon is invalid CSS and
    // throws `SyntaxError` rather than returning null.
    const tooltip = root.querySelector('[id="player-nav-tooltip-ext:downtime:board"]');
    assert.equal(tooltip?.getAttribute('role'), 'tooltip');
    assert.equal(tooltip?.textContent, 'Plan downtime activities');
    // A Core tab's visible label IS its accessible name, so nothing may replace it.
    assert.ok(
      !railButton(root, 'crafting').hasAttribute('aria-label'),
      'Core tabs carry no aria-label'
    );
    assert.ok(
      !railButton(root, 'ext:downtime:ledger').hasAttribute('aria-label'),
      'nor does a provider tab that supplied no accessibleName'
    );
  });

  it('mounts the active companion tab into a stamped, Core-owned target', async () => {
    const registry = createPlayerExtensionsRegistry({ emitHook: () => {} });
    const { provider, calls } = makeProvider();
    registry.publicApi.registerPlayerNavProvider(provider);
    const root = await harness.mount(makeHost(registry, 'ext:downtime:board').props());

    const mountTarget = root.querySelector('[data-player-extension-mounted]');
    assert.ok(Boolean(mountTarget), 'the mount succeeded and stamped its target');
    assert.equal(mountTarget.dataset.playerExtensionMounted, 'downtime');
    assert.equal(mountTarget.dataset.playerExtensionTab, 'board');
    assert.equal(calls.mounts.length, 1);
    assert.equal(calls.mounts[0].tabId, 'board', 'the provider gets its own BARE tab id');
    assert.ok(Object.isFrozen(calls.mounts[0].context));
    assert.equal(
      calls.mounts[0].context.actorId,
      null,
      'an unselected actor is null, never the empty string the store holds'
    );
  });

  it('keeps the rail entry, holds the active tab and renders the Core error state on a fault', async () => {
    const registry = createPlayerExtensionsRegistry({ emitHook: () => {} });
    const { provider } = makeProvider({ throwOnMount: true });
    registry.publicApi.registerPlayerNavProvider(provider);
    const host = makeHost(registry, 'ext:downtime:board');
    const root = await harness.mount(host.props());
    await tick();

    assert.deepEqual(
      railKeys(root),
      ['crafting', 'gathering', 'journal', 'inventory', 'ext:downtime:board', 'ext:downtime:ledger'],
      "the faulted surface's rail entries STAY — removing them is indistinguishable from a mis-click"
    );
    assert.equal(host.activeTab, 'ext:downtime:board', 'and the active tab does not move');
    const fault = root.querySelector('[data-player-extension-fault]');
    assert.ok(Boolean(fault), 'Core renders its own error state in the panel');
    assert.equal(fault.dataset.playerExtensionFault, 'downtime');
    assert.match(fault.textContent, /downtime/, 'and it names the provider that failed');
    assert.ok(
      !root.querySelector('[data-companion-control]'),
      'the partial content the companion appended before throwing is gone'
    );
    // The registration SURVIVES: the unregister handle stays the companion's, and a later
    // snapshot may mount without it re-registering.
    assert.equal(registry.getPlayerNavProvider('downtime'), provider);
  });

  it('recovers focus onto the faulted surface rail button rather than losing it to the body', async () => {
    const registry = createPlayerExtensionsRegistry({ emitHook: () => {} });
    registry.publicApi.registerPlayerNavProvider(makeProvider({ throwOnMount: true }).provider);
    const root = await harness.mount(makeHost(registry, 'ext:downtime:board').props());
    await tick();
    await tick();

    // Compared through `id`, never as elements: `node:assert` serialises the actual value to
    // build its diff and walks a mounted happy-dom element's circular tree until the heap
    // dies, so a plain element comparison fails as an OOM with no message.
    assert.equal(
      root.ownerDocument.activeElement?.getAttribute?.('data-player-nav-tab') ?? null,
      'ext:downtime:board',
      'focus lands on the faulted surface own rail button rather than dropping to the body'
    );
  });

  it('mounts a replacement provider on the next snapshot: a fault is never inherited', async () => {
    const registry = createPlayerExtensionsRegistry({ emitHook: () => {} });
    const unregister = registry.publicApi.registerPlayerNavProvider(
      makeProvider({ throwOnMount: true }).provider
    );
    const host = makeHost(registry, 'ext:downtime:board');
    const root = await harness.mount(host.props());
    await tick();
    assert.ok(Boolean(root.querySelector('[data-player-extension-fault]')));

    unregister();
    const { provider: healthy, calls } = makeProvider();
    registry.publicApi.registerPlayerNavProvider(healthy);
    await harness.setProps(host.props());
    await tick();

    assert.ok(
      !root.querySelector('[data-player-extension-fault]'),
      'a replacement provider is never pre-blamed for the previous one fault'
    );
    assert.equal(calls.mounts.length, 1, 'and it is given the surface');
  });

  it('falls the active route back to crafting when the provider unregisters', async () => {
    const registry = createPlayerExtensionsRegistry({ emitHook: () => {} });
    const unregister = registry.publicApi.registerPlayerNavProvider(makeProvider().provider);
    const host = makeHost(registry, 'ext:downtime:board');
    const root = await harness.mount(host.props());
    assert.ok(Boolean(root.querySelector('[data-player-extension-mounted]')));

    unregister();
    await harness.setProps(host.props());
    assert.equal(
      host.applyFallback(root),
      DEFAULT_TAB,
      'a route key the new set no longer offers falls back rather than leaving an empty panel'
    );
    await harness.setProps(host.props());

    assert.deepEqual(railKeys(root), ['crafting', 'gathering', 'journal', 'inventory']);
    assert.equal(root.querySelector('.fabricate-app-shell').dataset.activeTab, DEFAULT_TAB);
    assert.ok(
      !root.querySelector('[data-player-extension-mounted]'),
      'and the companion target is gone with its surface'
    );
  });

  it('moves focus and selection with the vertical arrow keys, wrapping at both ends', async () => {
    const registry = createPlayerExtensionsRegistry({ emitHook: () => {} });
    registry.publicApi.registerPlayerNavProvider(makeProvider().provider);
    const host = makeHost(registry);
    const root = await harness.mount(host.props());

    const press = (routeKey, key) => {
      const button = railButton(root, routeKey);
      button.dispatchEvent(
        new root.ownerDocument.defaultView.KeyboardEvent('keydown', { key, bubbles: true })
      );
    };

    press('crafting', 'ArrowUp');
    assert.equal(host.activeTab, 'ext:downtime:ledger', 'Up from the first entry wraps to the last');
    press('crafting', 'End');
    assert.equal(host.activeTab, 'ext:downtime:ledger');
    press('crafting', 'ArrowDown');
    assert.equal(host.activeTab, 'gathering');
    press('crafting', 'Home');
    assert.equal(host.activeTab, 'crafting');
  });
});
