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
import {
  DOMAIN_CONSUMERS,
  INVALIDATION_DOMAIN_NAMES,
  INVALIDATION_DOMAINS,
  INVALIDATION_STORES,
} from '../../src/systems/invalidationDomains.js';
import { CRAFTING_DATA_CHANGED_HOOK } from '../../src/systems/craftingDataChange.js';

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
    'src/systems/invalidationDomains.js',
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
  // `cleanups` records `connected` because that is the whole guarantee: the shell must run a
  // companion's cleanup while its target is still in the document, and a count alone cannot
  // tell a connected teardown apart from one running against an already-detached tree.
  const calls = { mounts: [], cleanups: [] };
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
      return () => {
        calls.cleanups.push({ tabId, connected: target.isConnected });
      };
    },
  };
  return { provider, calls };
}

/**
 * The shared player services the shell reads.
 *
 * `selectedActorId` defaults to the EMPTY STRING rather than to `null`, because that is what
 * `createActorBarStore` initialises and clears its selection to — and the context contract
 * normalises it to `null`. A case that wants a real selection passes one; nothing else changes.
 *
 * @param {object} [options] Selection state the actor bar holds.
 * @param {string} [options.selectedActorId] The bar's raw selection.
 * @returns {object} The services object the shell is given.
 */
function fakeServices({ selectedActorId = '' } = {}) {
  return {
    actorBar: {
      selectedActorId,
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
  let selectedActorId = '';
  return {
    get activeTab() {
      return activeTab;
    },
    // The window-wide Actor selection, changed as `ActorSelectTopBar` would change it: the next
    // `props()` carries the new value, exactly as the application host re-reads the store.
    selectActor(actorId) {
      selectedActorId = actorId;
    },
    props() {
      return {
        activeTab,
        showAlchemy: false,
        onSelectTab: (tab) => {
          activeTab = tab;
        },
        services: fakeServices({ selectedActorId }),
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

function focusedNavTab(root) {
  return root.ownerDocument.activeElement?.dataset?.playerNavTab ?? null;
}

/**
 * Register one provider into a fresh real registry and mount the shell on one of its tabs.
 *
 * Hoisted because eleven cases need exactly this three-line opening, and a fresh copy of it
 * per case is the near-identical block SonarCloud's new-code duplication gate counts.
 *
 * @param {object} [options] Scenario inputs.
 * @returns {Promise<object>} `{ registry, provider, calls, host, root, unregister }`.
 */
async function mountOnCompanionTab({ id = 'downtime', tabId = 'board', emitHook = () => {} } = {}) {
  const registry = createPlayerExtensionsRegistry({ emitHook });
  const { provider, calls } = makeProvider({ id });
  const unregister = registry.publicApi.registerPlayerNavProvider(provider);
  const host = makeHost(registry, `ext:${id}:${tabId}`);
  const root = await harness.mount(host.props());
  return { registry, provider, calls, host, root, unregister };
}

/**
 * The shell's own compiled stylesheet, as injected into the mounted document, with comments
 * STRIPPED.
 *
 * Stripping is what stops an assertion being satisfied by the prose *about* a declaration
 * instead of the declaration itself — the rail's width rule is explained in a comment that
 * quotes it verbatim, so an unstripped substring match could never fail.
 *
 * @param {HTMLElement} root Mounted root.
 * @returns {string} Declaration text.
 */
function shellStyleSheet(root) {
  const css = Array.from(root.ownerDocument.querySelectorAll('style'))
    .map((node) => node.textContent ?? '')
    .find((text) => text.includes('.fabricate-app-nav-item'));
  assert.ok(Boolean(css), "the shell's compiled stylesheet is injected into the mounted document");
  return css.replaceAll(/\/\*[\s\S]*?\*\//g, '');
}

function ruleBody(css, className) {
  return new RegExp(`\\.${className}(?![\\w-])[^{}]*\\{([^{}]*)\\}`).exec(css)?.[1] ?? '';
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

    // FOCUS IS PINNED ALONGSIDE SELECTION, and it is the half that matters: the handler
    // schedules `railButton(next).focus()` on `tick()`, and selection without focus leaves the
    // user parked on a button that has just become `tabindex="-1"` — reachable by neither Tab
    // nor a further arrow press. Two ticks because the handler's own `tick().then` is what
    // moves focus, so the first only settles the flush that resolved it.
    const settle = async () => {
      await tick();
      await tick();
    };

    press('crafting', 'ArrowUp');
    assert.equal(host.activeTab, 'ext:downtime:ledger', 'Up from the first entry wraps to the last');
    await settle();
    assert.equal(focusedNavTab(root), 'ext:downtime:ledger', 'and focus wraps with it');
    press('crafting', 'End');
    assert.equal(host.activeTab, 'ext:downtime:ledger');
    await settle();
    assert.equal(focusedNavTab(root), 'ext:downtime:ledger');
    press('crafting', 'ArrowDown');
    assert.equal(host.activeTab, 'gathering');
    await settle();
    assert.equal(focusedNavTab(root), 'gathering');
    press('crafting', 'Home');
    assert.equal(host.activeTab, 'crafting');
    await settle();
    assert.equal(focusedNavTab(root), 'crafting');
  });

  it('keeps one rail tab stop when the active tab names no rendered entry', async () => {
    const registry = createPlayerExtensionsRegistry({ emitHook: () => {} });
    // `CORE_TABS` admits `alchemy` unconditionally while `showAlchemy` is computed
    // independently, so this pair is reachable: an open on `alchemy` while Alchemy is
    // unavailable renders a rail no entry of which matches the active tab.
    const root = await harness.mount({
      activeTab: 'alchemy',
      showAlchemy: false,
      onSelectTab: () => {},
      services: fakeServices(),
      extensionSurfaces: deriveExtensionSurfaces(registry),
      playerExtensions: registry,
    });

    assert.deepEqual(railKeys(root), ['crafting', 'gathering', 'journal', 'inventory']);
    assert.deepEqual(
      railButtons(root).map((button) => button.getAttribute('tabindex')),
      ['0', '-1', '-1', '-1'],
      'the tab stop falls back to the first entry rather than leaving every button at -1, '
        + 'which would take the whole rail out of the Tab order'
    );
    assert.deepEqual(
      railButtons(root).map((button) => button.getAttribute('aria-selected')),
      ['false', 'false', 'false', 'false'],
      'only the tab STOP falls back; aria-selected stays bound to the active tab, so nothing '
        + 'claims a selection the panel is not showing'
    );
  });

  it('emits the tooltip nodes outside the tablist, whose owned children are all tabs', async () => {
    const { root } = await mountOnCompanionTab();

    const tablist = root.querySelector('[role="tablist"]');
    assert.deepEqual(
      Array.from(tablist.children).map((child) => child.getAttribute('role')),
      ['tab', 'tab', 'tab', 'tab', 'tab', 'tab'],
      "a tablist's only permitted owned role is tab, so a tooltip child is unallowed content "
        + "axe-core's aria-required-children reports"
    );
    // Selected by ATTRIBUTE, never by id: an id selector containing a colon is invalid CSS.
    const tooltip = root.querySelector('[id="player-nav-tooltip-ext:downtime:board"]');
    assert.equal(tooltip?.getAttribute('role'), 'tooltip', 'the tooltip node still exists');
    assert.ok(!tablist.contains(tooltip), 'and it is no longer owned by the tablist');
    assert.ok(
      Boolean(tooltip.closest('.fabricate-app-shell')),
      'it stays inside the shell, and an IDREF resolves document-wide, so the association the '
        + 'rail button declares is unchanged'
    );
    assert.equal(
      railButton(root, 'ext:downtime:board').getAttribute('aria-describedby'),
      'player-nav-tooltip-ext:downtime:board'
    );
  });

  it('lets the rail button yield the scrollbar gutter rather than overflowing the 84px column', async () => {
    // ASSERTED AS A DECLARATION, not as measured overflow, and deliberately so. The View Lab's
    // `expectNoHorizontalOverflow` compares scrollWidth against clientWidth, and headless
    // Chromium renders OVERLAY scrollbars that consume no layout width at all — so a green
    // capture proves no CONTENT overflow and can say nothing about a reserved gutter. happy-dom
    // computes no cascade either. The compiled, injected stylesheet is the honest target.
    const { root } = await mountOnCompanionTab();
    const css = shellStyleSheet(root);

    assert.match(
      ruleBody(css, 'fabricate-app-nav-item'),
      /width:\s*min\(64px,\s*100%\)/,
      'a non-shrinkable 64px button inside a 68px content box puts a VISIBLE horizontal '
        + 'scrollbar in the rail once a thin classic scrollbar takes its ~12px'
    );
    assert.match(
      ruleBody(css, 'fabricate-app-nav'),
      /scrollbar-gutter:\s*stable/,
      'and the gutter is reserved up front, so crossing the entry count that starts the scroll '
        + 'does not reflow the whole column'
    );
  });
});

/**
 * The shell's invalidation-domain routing, mounted (issue 1078 part B1).
 *
 * ## Why this exists at all
 *
 * The two source-text guards it replaces sliced a 400-character window after the FIRST
 * occurrence of a `subscribe*(` call, and that window spanned four subscription sites — so
 * review demonstrated all five of their assertions passing against routing that was
 * simultaneously wrong in three ways. Nothing short of driving the real hook seam can see which
 * store a given change actually reaches.
 *
 * ## What makes it falsifiable
 *
 * The expectation is computed from the SHIPPED `DOMAIN_CONSUMERS`, so it is not a second
 * hand-written table that could agree with a wrong one. What it compares that against is the
 * shell's real, mounted subscription behaviour — which is exactly the assertion the derived
 * `STORE_DOMAINS` has no other gate for.
 *
 * `subscribeCraftingDataChange` reads `globalThis.Hooks` at subscribe time and previously
 * no-oped under this harness because the global was absent, which is why the routing had never
 * been runtime-tested at all. A `Hooks` fake is all it needed.
 */
describe('FabricateAppRoot invalidation-domain routing (mounted)', () => {
  /** The stores THIS component owns. `gathering` belongs to `GatheringView`. */
  const SHELL_STORES = [
    INVALIDATION_STORES.CRAFTING,
    INVALIDATION_STORES.INVENTORY,
    INVALIDATION_STORES.ALCHEMY,
    INVALIDATION_STORES.JOURNAL,
  ];

  let hooks = null;

  /** A Hooks fake with `callAll`, so the shell's subscriptions register and can be fired. */
  function installHooks() {
    const handlers = new Map();
    let nextId = 0;
    hooks = {
      on(name, fn) {
        if (!handlers.has(name)) handlers.set(name, new Map());
        nextId += 1;
        handlers.get(name).set(nextId, fn);
        return nextId;
      },
      off(name, id) {
        handlers.get(name)?.delete(id);
      },
      callAll(name, payload) {
        for (const fn of [...(handlers.get(name)?.values() ?? [])]) fn(payload);
      },
      count: (name) => handlers.get(name)?.size ?? 0,
    };
    globalThis.Hooks = hooks;
  }

  /**
   * The shared services, with every store seam the shell can reach replaced by a counter.
   *
   * `inventory` carries BOTH seams: `reloadOnDocumentChange` is the bulk-run guard the shell
   * must use, and `load` is the bypass it must never call. Counting them separately is what
   * lets one case assert routing and the absence of the bypass at the same time.
   *
   * WHAT THE INVENTORY COUNTER COUNTS IS THE SEAM CALL, NOT THE LISTING BUILD, and for this
   * subject the two diverge: the real `inventoryStore.reloadOnDocumentChange()` returns without
   * loading while `bulkRunning || bulkDestroying`, so a build-counting guard would read zero in
   * BOTH directions if a fixture left either flag set. The question here is whether the shell
   * ROUTED the change to the inventory store at all, so the seam call is the right thing to
   * count — and because these are plain counters rather than a real store, no bulk run can be
   * in flight to suppress one.
   *
   * @returns {{calls: object, services: object}}
   */
  function spyServices() {
    const calls = {
      craftingSources: 0,
      crafting: 0,
      inventory: 0,
      inventoryBypass: 0,
      alchemy: 0,
      journal: 0,
    };
    const bump = (key) => () => {
      calls[key] += 1;
    };
    return {
      calls,
      services: {
        ...fakeServices(),
        // `setCraftingActor` is not decoration: the Crafting tab is the DEFAULT route, so its
        // view renders and pushes the shared actor selection into the sources store on mount.
        craftingSources: { load: bump('craftingSources'), setCraftingActor: () => {} },
        crafting: { load: bump('crafting') },
        inventory: { reloadOnDocumentChange: bump('inventory'), load: bump('inventoryBypass') },
        alchemy: { load: bump('alchemy') },
        journal: { navCount: 0, loadedOnce: true, load: bump('journal') },
        getSelectedCraftingActorId: () => 'actor-1',
        getCraftingComponentSourceIds: () => ['actor-1'],
      },
    };
  }

  /** Mount the shell with counting services and a live Hooks fake. */
  async function mountWithSpies() {
    installHooks();
    const registry = createPlayerExtensionsRegistry({ emitHook: () => {} });
    const { calls, services } = spyServices();
    await harness.mount({
      activeTab: DEFAULT_TAB,
      showAlchemy: false,
      onSelectTab: () => {},
      services,
      extensionSurfaces: deriveExtensionSurfaces(registry),
      playerExtensions: registry,
    });
    // Reset AFTER mount: the shell's own start-up reads must not be counted as routing.
    for (const key of Object.keys(calls)) calls[key] = 0;
    return calls;
  }

  /** The stores a change actually reached, in taxonomy order. */
  const reached = (calls) => SHELL_STORES.filter((store) => calls[store] > 0);

  /** One well-formed change naming exactly one domain. */
  const oneDomain = (domain) => ({
    source: 'recipes',
    scopes: [{ systemId: 'sys-a', domains: [domain] }],
  });

  afterEach(() => {
    delete globalThis.Hooks;
    hooks = null;
  });

  it('subscribes once per shell store, on the unpublished scoped hook only', async () => {
    await mountWithSpies();

    assert.equal(
      hooks.count(CRAFTING_DATA_CHANGED_HOOK),
      SHELL_STORES.length,
      'one subscription per store, each carrying its own derived domain set'
    );
    assert.equal(
      hooks.count('fabricate.recipesChanged'),
      0,
      'the zero-argument legacy bindings are gone — they discarded the payload, so no ' +
        'narrowing was possible however good a delta was emitted'
    );
    assert.equal(hooks.count('fabricate.craftingSystemsChanged'), 0);
  });

  // TABLE-DRIVEN, from the shipped constant. A domain added to the taxonomy without a
  // decision about every store reddens here rather than shipping a silent broad refresh.
  for (const domain of INVALIDATION_DOMAIN_NAMES) {
    it(`routes a ${domain} change to exactly its consuming stores`, async () => {
      const calls = await mountWithSpies();

      hooks.callAll(CRAFTING_DATA_CHANGED_HOOK, oneDomain(domain));

      assert.deepEqual(
        reached(calls),
        SHELL_STORES.filter((store) => DOMAIN_CONSUMERS[domain].includes(store)),
        `the shell's actual behaviour must equal the shipped DOMAIN_CONSUMERS row for ${domain}`
      );
      assert.equal(
        calls.inventoryBypass,
        0,
        'and the inventory listing is never rebuilt through the seam that bypasses the ' +
          'bulk-run guard'
      );
    });
  }

  it('does NOT rebuild the journal for prose, measured from a warmed non-zero baseline', async () => {
    const calls = await mountWithSpies();

    // WARM. `assert.equal(journal, 0)` against a cold fixture is vacuous, so the journal is
    // made to reload first and that baseline is asserted before the real measurement.
    hooks.callAll(CRAFTING_DATA_CHANGED_HOOK, oneDomain(INVALIDATION_DOMAINS.LABELLING));
    assert.ok(calls.journal > 0, 'the baseline: a labelling change DOES rebuild the journal');
    const warmed = calls.journal;
    calls.journal = 0;

    hooks.callAll(CRAFTING_DATA_CHANGED_HOOK, oneDomain(INVALIDATION_DOMAINS.NARRATIVE));

    assert.equal(
      calls.journal,
      0,
      `the journal reloaded ${warmed} time(s) for a label and must reload zero times for prose`
    );
    assert.ok(calls.crafting > 0, 'while the stores that DO read prose still rebuild');
    assert.ok(calls.inventory > 0);
    assert.ok(calls.alchemy > 0);
  });

  it('reloads EVERY store when the change names no domain', async () => {
    // The fail-safe, asserted BEHAVIOURALLY rather than through the fallback counter.
    //
    // Not because the counter is unreachable — it is: the harness copies `foundryBridge.js`
    // into its temp tree and the mounted component imports that copy, so this file's import of
    // the repo path reads a DIFFERENT module instance, but the temp copy has zero imports and
    // could be loaded from the temp tree if a case wanted it. It is simply not what this case
    // is for: the claim here is which stores an unattributable change reaches, and the counter
    // itself is asserted directly in `tests/util/foundry-bridge-subscriptions.test.js` and
    // `tests/invalidation-domain-signal.test.js`.
    const calls = await mountWithSpies();

    hooks.callAll(CRAFTING_DATA_CHANGED_HOOK, { source: 'recipes', scopes: [] });

    assert.deepEqual(reached(calls), SHELL_STORES);
    assert.equal(calls.inventoryBypass, 0);
  });

  it('carries craftingSources with the crafting store rather than as a taxonomy store', async () => {
    // It holds the selectable component-source ACTORS, not a definition-derived read model, so
    // it has no fact class of its own. Pinned because dropping it would silently stop a source
    // list refreshing on exactly the changes it refreshed on before this issue.
    const calls = await mountWithSpies();

    hooks.callAll(CRAFTING_DATA_CHANGED_HOOK, oneDomain(INVALIDATION_DOMAINS.LABELLING));

    assert.equal(calls.craftingSources, calls.crafting);
    assert.ok(calls.craftingSources > 0);
  });

  it('routes an owned-item change through the held-inventory domain', async () => {
    // The shell's SECOND broad handler. Its consumers are now derived from the taxonomy too,
    // which is what brought the journal into it: a run's redaction reads the owned-copy branch.
    const calls = await mountWithSpies();

    hooks.callAll('updateItem', { actor: { id: 'actor-1' } });
    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.deepEqual(
      reached(calls),
      SHELL_STORES.filter((store) =>
        DOMAIN_CONSUMERS[INVALIDATION_DOMAINS.HELD_INVENTORY].includes(store)
      )
    );
    assert.equal(calls.inventoryBypass, 0);
  });

  it('ignores an owned-item change on an actor this window does not read', async () => {
    const calls = await mountWithSpies();

    hooks.callAll('updateItem', { actor: { id: 'someone-else' } });
    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.deepEqual(reached(calls), [], 'the relevance filter still gates the item path');
  });
});

describe('FabricateAppRoot companion disposal (mounted)', () => {
  it('disposes the companion while its target is connected when the tab leaves for a Core tab', async () => {
    const { calls, host, root } = await mountOnCompanionTab();
    assert.equal(calls.mounts.length, 1);

    railButton(root, 'crafting').click();
    await harness.setProps(host.props());

    assert.equal(host.activeTab, 'crafting');
    assert.deepEqual(
      calls.cleanups,
      [{ tabId: 'board', connected: true }],
      'the {#if activeRoute} branch destroys the host, and destroy_effect removes its DOM '
        + 'BEFORE running teardowns, so without the shell disposing first this ran detached'
    );
    assert.ok(!root.querySelector('[data-player-extension-mounted]'), 'and the target is gone');
  });

  it('disposes the outgoing companion while connected when the tab moves to another surface', async () => {
    const { registry, calls, host, root } = await mountOnCompanionTab();
    const { provider: second, calls: secondCalls } = makeProvider({ id: 'crewquarters' });
    registry.publicApi.registerPlayerNavProvider(second);
    await harness.setProps(host.props());

    railButton(root, 'ext:crewquarters:board').click();
    await harness.setProps(host.props());

    assert.deepEqual(
      calls.cleanups,
      [{ tabId: 'board', connected: true }],
      'the {#key activeSurface.surfaceId} block recreates the host on a cross-surface swap'
    );
    assert.equal(secondCalls.mounts.length, 1, 'and the incoming surface is mounted');
  });

  it('disposes the companion while connected when its provider unregisters under the live tab', async () => {
    const { calls, host, unregister } = await mountOnCompanionTab();

    unregister();
    // The publication path: `_refreshExtensionSurfaces` pushes the new snapshot, the
    // {:else if activeSurface} branch flips, and the host is destroyed outright.
    await harness.setProps(host.props());

    assert.deepEqual(calls.cleanups, [{ tabId: 'board', connected: true }]);
  });

  it('runs the companion cleanup against a connected target when the application disposes the shell', async () => {
    const { calls } = await mountOnCompanionTab();

    // The seam `SvelteFabricateApp.close()` reaches immediately before `super.close()`. The
    // close-ordering fixture proves the application calls the SHELL; this is the other half —
    // that the shell reaches the HOST, and does so while the target is still in the document.
    harness.component.disposePlayerProvidersBeforeRemoval();

    assert.deepEqual(calls.cleanups, [{ tabId: 'board', connected: true }]);
  });

  it('remounts the surface with a fresh context when the companion calls requestRemount', async () => {
    const { calls } = await mountOnCompanionTab();

    // The documented public context method, invoked exactly as a companion would.
    calls.mounts[0].context.requestRemount();
    await tick();

    assert.equal(calls.mounts.length, 2, 'the shell produces a NEW context identity');
    assert.notEqual(calls.mounts[0].context, calls.mounts[1].context, 'replaced, never mutated');
    assert.equal(calls.mounts[1].context.revision, 1, 'and the revision advanced');
    assert.deepEqual(calls.cleanups, [{ tabId: 'board', connected: true }]);
  });

  it('emits the surface hooks through the registry edge the shell threads down', async () => {
    const hooks = [];
    const { host, root } = await mountOnCompanionTab({
      emitHook: (name, payload) => hooks.push([name, payload]),
    });
    const surfaceHooks = () =>
      hooks.map(([name]) => name).filter((name) => name.startsWith('fabricate.player.surface'));

    assert.deepEqual(
      surfaceHooks(),
      ['fabricate.player.surfaceMounted'],
      'the shell passes the registry own emitHook down, so the host hooks travel the same edge'
    );

    railButton(root, 'ext:downtime:ledger').click();
    await harness.setProps(host.props());

    assert.deepEqual(surfaceHooks(), [
      'fabricate.player.surfaceMounted',
      'fabricate.player.surfaceTabChanged',
    ]);
    const tabChanged = hooks.find(([name]) => name === 'fabricate.player.surfaceTabChanged');
    assert.equal(tabChanged[1].previousTabId, 'board');
    assert.equal(tabChanged[1].tabId, 'ledger');
  });
});

describe('FabricateAppRoot companion context stability (mounted)', () => {
  it('does not remount a live companion when a value-identical snapshot is republished', async () => {
    const { calls, host } = await mountOnCompanionTab();
    assert.equal(calls.mounts.length, 1);

    // `deriveExtensionSurfaces` allocates a FRESH frozen `{ surfaceId, provider }` wrapper on
    // every call, so each of these re-seeds is a new `activeSurface` identity carrying
    // identical values — which is precisely what a republication looks like in production.
    await harness.setProps(host.props());
    await harness.setProps(host.props());

    assert.equal(calls.mounts.length, 1, 'identical values must not produce a new context');
    assert.deepEqual(calls.cleanups, [], 'so nothing was torn down and rebuilt');
  });

  it('does not remount a live companion when an unrelated provider registers', async () => {
    const { registry, calls, host, root } = await mountOnCompanionTab();

    registry.publicApi.registerPlayerNavProvider(makeProvider({ id: 'crewquarters' }).provider);
    await harness.setProps(host.props());

    assert.equal(railKeys(root).length, 8, 'the second companion really did reach the rail');
    assert.equal(
      calls.mounts.length,
      1,
      "another companion registering must not churn an unrelated live panel's scroll position, "
        + 'focus and in-flight state'
    );
    assert.deepEqual(calls.cleanups, []);
  });

  it('mounts exactly once across the open path: the seeded snapshot and the registry replay', async () => {
    // `_prepareSvelteProps` seeds snapshot #1, then `_onRender` -> `_registerHooks()` joins the
    // registry — and `subscribeSurfaceIds` replays the current value SYNCHRONOUSLY before it
    // returns the unsubscribe, producing snapshot #2 inside the same open. Both steps are the
    // real ones here: the real registry replay and the real derivation.
    const { registry, calls, host } = await mountOnCompanionTab();
    const pushes = [];
    const unsubscribe = registry.subscribeSurfaceIds(() =>
      pushes.push(harness.setProps(host.props()))
    );
    await Promise.all(pushes);
    unsubscribe();

    assert.equal(pushes.length, 1, 'the replay really did push a second snapshot');
    assert.equal(calls.mounts.length, 1, 'opening the window calls the companion mount ONCE');
    assert.deepEqual(calls.cleanups, [], 'and never tore it down and rebuilt it mid-open');
  });

  // THE OTHER DIRECTION, and the one with teeth. `FabricateAppRoot`'s `CONTEXT_VALUE_KEYS` is a
  // hand-maintained mirror of the frozen context literal it compares, and it is what the
  // memoization proved above keys on — so a key MISSING from that list fails silently rather than
  // loudly: the shell republishes the STALE context and the companion keeps a value the window no
  // longer holds. `surfaceId`, `tabId` and `revision` are covered by the cross-surface swap, the
  // tab-change hook case and `requestRemount` respectively; these two cover the remaining pair.
  it('remounts with a fresh context when the shared actor selection changes', async () => {
    const { calls, host } = await mountOnCompanionTab();
    assert.equal(calls.mounts[0].context.actorId, null, 'nothing is selected to begin with');

    host.selectActor('actor-7');
    await harness.setProps(host.props());

    assert.equal(calls.mounts.length, 2, 'a change of actor produces a new context and a remount');
    assert.equal(
      calls.mounts[1].context.actorId,
      'actor-7',
      'and the companion is handed the NEW selection rather than a memoized stale one'
    );
    assert.deepEqual(
      calls.cleanups,
      [{ tabId: 'board', connected: true }],
      'the outgoing mount was cleaned up first, while its target was still connected'
    );
  });

  it('remounts with a fresh context when the GM role behind isGM changes', async () => {
    const { calls, host } = await mountOnCompanionTab();
    assert.equal(calls.mounts[0].context.isGM, false, 'the fixture user is not a GM to begin with');

    // `isGameMaster()` reads the Foundry global at derivation time and subscribes to nothing, so
    // a republication is what recomputes it. Restored in `finally` so a failed assertion cannot
    // leak a GM user into the cases that follow.
    globalThis.game.user = { isGM: true };
    try {
      await harness.setProps(host.props());
    } finally {
      delete globalThis.game.user;
    }

    assert.equal(calls.mounts.length, 2, 'the changed value produces a new context and a remount');
    assert.equal(
      calls.mounts[1].context.isGM,
      true,
      'and the companion sees the promotion rather than the context it was first given'
    );
  });
});
