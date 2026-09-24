<!-- Svelte 5 runes mode -->
<script>
  import { onDestroy, untrack } from 'svelte';
  import GatheringInspectorRail from './environment/GatheringInspectorRail.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import { isGameMaster, localize, notifyInfo, notifyWarn } from '../../util/foundryBridge.js';
  import { announceAfterFocusMove } from '../../util/announceAfterFocus.js';
  import { resolveDropUuid } from '../../util/dropUtils.js';
  import { permitsFailureResults } from '../../../../utils/failureResultPolicy.js';
  // THE SHARED SOURCE-REFERENCE WALK (issue 1373).
  import { getItemMatchUuids } from '../../../../utils/sourceReferenceUnion.js';
  import {
    routedOutcomeTierOptions,
    routedTierOptionsForPolicy,
    routedOutcomeTierNamesForPolicy,
    routedHasOutcomeTiers,
    routedOutcomeTierCount,
    resolveRecipeCheckTierOptions,
    resolveRecipeFixedOutcomeTierOptions,
  } from '../../../../utils/routedOutcomeKeywords.js';
  import {
    getEffectiveRecipeCategories,
    getRecipeCategoryLabel,
    normalizeRecipeCategory,
  } from '../../../../utils/recipeCategories.js';
  import {
    getComponentCategoryLabel,
    normalizeComponentCategory,
  } from '../../../../utils/componentCategories.js';
  import { categoryIconFor } from '../../../../utils/categoryIcons.js';
  // ── COMPLICATIONS: the trigger picker's option labels (issue 1286) ─────────────────── A check
  // trigger carries no authored name — `_normalizeUnifiedTrigger` drops `label` deliberately.
  import { parseDiceGroups } from '../../../../utils/craftingCheckExpression.js';
  import { interpolate } from './checks/checksCopy.js';
  import { summariseCondition } from './checks/checkTriggerSummary.js';
  import { buildVocabularyUsage, dedupeVocabularyEntries } from '../../../model/vocabularyUsage.js';
  import { createRecipeBrowserState } from '../../../model/recipeBrowserModel.js';
  import {
    componentCategoryOptions,
    createComponentBrowserState,
  } from '../../../model/componentBrowserModel.js';
  import {
    createComponentBulkDraft,
    toBulkComponentEdit,
  } from '../../../model/componentBulkEditModel.js';
  import {
    countBlockedRecipeEnables,
    countRecipeBookMembership,
    createRecipeBulkDraft,
    describeRecipeCheckTierAxis,
    toBulkRecipeEdit,
  } from '../../../model/recipeBulkEditModel.js';
  import { createEssenceBrowserState } from '../../../model/essenceBrowserModel.js';
  import { createManagerBrowserViewStates } from '../../../model/managerBrowserViewState.js';
  import {
    createEssenceBulkDraft,
    toBulkEssenceEdit,
  } from '../../../model/essenceBulkEditModel.js';
  import { resolveRecipeImage } from '../../util/craftingImageDefaults.js';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import { buildComponentEditorState } from '../../util/componentEditor.js';
  import { getCurrencyProvidersForFoundrySystem } from '../../../../config/currencyProviders.js';
  import ComponentEditView from './ComponentEditView.svelte';
  import ComponentsBrowserView from './ComponentsBrowserView.svelte';
  import ChecksView from './checks/ChecksView.svelte';
  import EnvironmentEditView from './EnvironmentEditView.svelte';
  import EnvironmentsBrowserView from './EnvironmentsBrowserView.svelte';
  import GatheringRealmsTab from './GatheringRealmsTab.svelte';
  import GatheringMapLinksTab from './GatheringMapLinksTab.svelte';
  import EssenceBrowserView from './EssenceBrowserView.svelte';
  import EssenceEditView from './EssenceEditView.svelte';
  // The essence library's rail halves and the editor's live preview (issue 1036), extracted out of
  // this file.
  import EssenceBrowserInspector from './essences/EssenceBrowserInspector.svelte';
  import EssenceBulkEditPanel from './essences/EssenceBulkEditPanel.svelte';
  import EssenceBehaviorPreview from './essences/EssenceBehaviorPreview.svelte';
  import GatheringTaskEditView from './GatheringTaskEditView.svelte';
  import GatheringEventEditView from './GatheringEventEditView.svelte';
  import ToolEditView from './ToolEditView.svelte';
  import ToolsBrowserView from './ToolsBrowserView.svelte';
  import ToolBrowserInspector from './tools/ToolBrowserInspector.svelte';
  import RecipesBrowserView from './RecipesBrowserView.svelte';
  import RecipeBrowserInspector from './recipes/RecipeBrowserInspector.svelte';
  // The recipe library's bulk edit panel (issue 1010) — the sibling of the above, and under
  // `recipes/` for the same reason: `recipe/` is the EDITOR's directory.
  import RecipeBulkEditPanel from './recipes/RecipeBulkEditPanel.svelte';
  // The component library's inspector (issue 676) — the sibling of the above.
  import ComponentBrowserInspector from './components/ComponentBrowserInspector.svelte';
  // The three component-scope sentences this shell owns (issue 1371, parity round 4): the two
  // header subtitles it renders, and the salvage-mode label all three of them name.
  import { componentRulesSubtitle } from './scoped/componentScoped.js';
  import { salvageResolutionModeOptions } from './resolutionModeOptions.js';
  import ComponentBulkEditPanel from './components/ComponentBulkEditPanel.svelte';
  import BooksScrollsView from './BooksScrollsView.svelte';
  import KnowledgeView from './KnowledgeView.svelte';
  import CraftingSettingsView from './CraftingSettingsView.svelte';
  import AccessTabView from './AccessTabView.svelte';
  import GrantAccessInspector from './GrantAccessInspector.svelte';
  import ItemPageInspector from './ItemPageInspector.svelte';
  import RecipeItemEditor from './RecipeItemEditor.svelte';
  import ComponentAddFromCatalogueDialog from './scoped/ComponentAddFromCatalogueDialog.svelte';
  import ImportFolderMappingModal from './ImportFolderMappingModal.svelte';
  import ImportReportModal from './ImportReportModal.svelte';
  import { createImportFlowModel } from './importFlowModel.svelte.js';
  import ManagerNavRail from './ManagerNavRail.svelte';
  import ManagerPageHeader from './ManagerPageHeader.svelte';
  import {
    buildCraftingNavItems,
    activeCraftingTab as resolveActiveCraftingTab,
    isCraftingRoute as isCraftingView,
    isCraftingViewAvailable,
    resolveCraftingRedirect,
  } from './crafting/craftingNav.js';
  import {
    CHECKS_VIEWS,
    isChecksRoute as isChecksView,
    resolveChecksRedirect,
  } from './checks/checksNav.js';
  import { createChecksRouteModel } from './checks/checksRouteModel.svelte.js';
  import { createGatheringRouteModel } from './gatheringRouteModel.svelte.js';
  import { createGatheringDraftHandlers } from './gatheringDraftHandlers.svelte.js';
  import { createGatheringModifierHandlers } from './gatheringModifierHandlers.svelte.js';
  import {
    gatheringDropCountValue,
    gatheringDropRateTierClass,
    gatheringDropRateTierColor,
    gatheringDropRateValue,
    gatheringModifierDisplayValue,
    gatheringModifierValueClass,
    gatheringTaskDropRows,
    gatheringTaskImage,
    signedToOperatorValue,
    sortedDangerTags,
    truncateDescription,
  } from './gatheringDisplay.js';
  import RecipeEditView from './RecipeEditView.svelte';
  import { craftingEffect } from './crafting/craftingVisibility.js';
  import SystemBrowserInspector from './SystemBrowserInspector.svelte';
  import SystemEditView from './SystemEditView.svelte';
  import SystemsBrowserView from './SystemsBrowserView.svelte';
  import TagsCategoriesView from './TagsCategoriesView.svelte';
  import WorldComponentCataloguePage from './scoped/WorldComponentCataloguePage.svelte';
  import WorldComponentEntryPage from './scoped/WorldComponentEntryPage.svelte';
  import WorldEssenceCataloguePage from './scoped/WorldEssenceCataloguePage.svelte';
  import WorldEssenceEntryPage from './scoped/WorldEssenceEntryPage.svelte';
  import WorldToolCataloguePage from './scoped/WorldToolCataloguePage.svelte';
  import WorldToolEntryPage from './scoped/WorldToolEntryPage.svelte';
  import WorldVocabularyPage from './scoped/WorldVocabularyPage.svelte';
  import { scopedEntryName, scopedEntryRoute } from './scoped/scopedEntryRoutes.js';
  import { essenceShortValueName, mintEssenceId } from './scoped/essenceScoped.js';
  // The shipped two-step destructive control, for the world Tool entry's header `Delete` (issue
  // 1373).
  import ArmedDangerButton from '../../components/ArmedDangerButton.svelte';
  import {
    buildRouteExitGuards,
    confirmRouteExitGuards,
    runRouteExitGuard,
  } from './routeExitGuards.js';
  import { createBulkSelectionOwner } from './bulkSelection.svelte.js';
  import { createNavRailModel } from './navRailModel.svelte.js';
  import { createHeaderModel } from './headerModel.svelte.js';
  import WorldDowntimeExtensionHost from './downtime/WorldDowntimeExtensionHost.svelte';
  import WorldCurrencyTab from './world/WorldCurrencyTab.svelte';
  import WorldModifiersTab from './world/WorldModifiersTab.svelte';
  import WorldPrerequisitesTab from './world/WorldPrerequisitesTab.svelte';
  import { WORLD_DOWNTIME_PREVIEW_PROVIDER } from './downtime/worldDowntimePreviewProvider.js';
  import { createRouteChromeChannel } from './downtime/routeChromeChannel.js';
  import { WORLD_DOWNTIME_SURFACE_ID } from '../../../managerExtensions.js';
  import {
    mapModifierToPrerequisite,
    mapPrerequisiteToModifier,
  } from '../../../../systems/characterModifierPrerequisiteCopy.js';

  let { store, services = null, managerExtensions = null, playerExtensions = null } = $props();
  let downtimeExtensionHost = $state(null);
  // Which provider currently holds the Downtime surface, and which one has already failed to mount.
  let downtimeProviderSnapshot = $state(null);
  let downtimeFaultedProvider = $state(null);
  // Bumped by `context.requestRemount()`. The host's mount effect keys on the context
  // object, so a new identity is the whole re-render mechanism.
  let downtimeContextRevision = $state(0);
  // The chrome the live companion mount has asked Core to render, or null for "use what the active
  // tab declared at registration".
  let downtimeRouteChrome = $state(null);
  // Whether the live mount can be asked to pop one level, which the breadcrumb's tab crumb reads.
  let downtimeCanReselect = $state(false);
  const downtimeChromeChannel = createRouteChromeChannel({
    onChange: (chrome) => {
      downtimeRouteChrome = chrome;
    },
    onReselectAvailable: (available) => {
      downtimeCanReselect = available;
    },
    // The channel gates a companion's `navigateToTab` on liveness and hands the survivors here,
    // where the registered provider's tab set and the rail's own navigation already live.
    onNavigate: (tabId) => navigateWorldDowntimeTab(tabId),
  });
  // Every surface a companion currently claims, not just Core's Downtime one.
  let managerRegisteredSurfaceIds = $state([]);
  let playerRegisteredSurfaceIds = $state([]);
  // The runtime side of a Downtime tab's badge (issue 1302): a frozen, null-prototype record keyed
  // by tab id, one snapshot per publication.
  let downtimeNavTabBadges = $state(null);

  $effect(() => {
    if (!managerExtensions?.subscribe) return;
    return managerExtensions.subscribe(WORLD_DOWNTIME_SURFACE_ID, (nextProvider) => {
      // A new snapshot is a new chance: a replacement provider is never pre-blamed for the
      // previous one's mount fault.
      downtimeFaultedProvider = null;
      downtimeProviderSnapshot = nextProvider;
    });
  });

  $effect(() => {
    if (!managerExtensions?.subscribeSurfaceIds) return;
    return managerExtensions.subscribeSurfaceIds((surfaceIds) => {
      managerRegisteredSurfaceIds = surfaceIds;
    });
  });

  // The runtime badge channel.
  $effect(() => {
    if (!managerExtensions?.subscribeNavTabBadges) return;
    return managerExtensions.subscribeNavTabBadges(WORLD_DOWNTIME_SURFACE_ID, (badges) => {
      downtimeNavTabBadges = badges;
    });
  });

  $effect(() => {
    if (!playerExtensions?.subscribeSurfaceIds) return;
    return playerExtensions.subscribeSurfaceIds((surfaceIds) => {
      playerRegisteredSurfaceIds = surfaceIds;
    });
  });

  function requestDowntimeRemount() {
    downtimeContextRevision += 1;
  }

  // A provider whose mount threw is set aside rather than unregistered: it keeps its registration
  // (and its unregister handle stays the companion's).
  function noteDowntimeProviderFault(faultedProvider) {
    downtimeFaultedProvider = faultedProvider;
  }

  function runDowntimeHeaderAction(action) {
    try {
      action.onSelect(Object.freeze({ ...worldDowntimeContext, actionId: action.id }));
    } catch (error) {
      console.error('Fabricate | Downtime header action failed:', error);
    }
  }

  // Core's own tab fields are lang KEYS and a companion's are already-localized text, so
  // `downtimeCoreFallback` is the one discriminator between the two readings.
  function downtimeChrome(field, coreDefault, providerDefault = coreDefault) {
    const runtime = downtimeRuntimeChrome?.[field];
    if (runtime) return runtime;
    const value = activeDowntimeTab?.[field];
    if (downtimeCoreFallback) return value ? text(value, coreDefault) : coreDefault;
    return value || providerDefault;
  }

  // The same rule, for a named rail entry rather than the active tab's chrome.
  function downtimeTabText(tab, field) {
    const value = tab?.[field];
    if (!value) return tab?.id ?? '';
    return downtimeCoreFallback ? text(value, tab.id) : value;
  }

  // THE DOWNTIME TRAIL'S LAST TWO CRUMBS (issue 1322), and they are two rather than one.
  const downtimeTabCrumb = $derived.by(() => {
    const value = activeDowntimeTab?.breadcrumb;
    if (downtimeCoreFallback) return value ? text(value, worldDowntimeTabId) : worldDowntimeTabId;
    return value || downtimeTabText(activeDowntimeTab, 'label');
  });

  // The companion's own leaf, or the empty string when there is nothing further to say.
  const downtimeLeafCrumb = $derived.by(() => {
    const runtime = downtimeRuntimeChrome?.breadcrumb;
    if (!runtime || runtime === downtimeTabCrumb) return '';
    return runtime;
  });

  // Whether the tab crumb is worth pressing.
  const downtimeTabCrumbNavigable = $derived(downtimeLeafCrumb !== '' && downtimeCanReselect);

  // The ApplicationV2 shell calls this before it unmounts the Svelte root, while a companion target
  // is still connected.
  export function disposeDowntimeProviderBeforeRemoval() {
    downtimeExtensionHost?.disposeBeforeRemoval?.();
  }

  onDestroy(disposeDowntimeProviderBeforeRemoval);

  // svelte-ignore state_referenced_locally
  const viewState = store.viewState;

  let activeView = $state('systems');
  // The tab the System Overview page (`system-edit`) should open on.
  let requestedSystemTab = $state('settings');
  let requestedSystemTabNonce = $state(0);
  // Deep link into the System Overview page's Modifiers section (issue 1117).
  let requestedSystemModifierSectionNonce = $state(0);
  let selectedRecipeId = $state('');
  let selectedComponentId = $state('');
  let selectedEssenceId = $state('');
  let lastComponentSystemId = $state('');
  let lastEssenceSystemId = $state('');
  let essenceEditDirty = $state(false);
  let essenceEditSaving = $state(false);
  let essenceEditDraft = $state(null);
  let componentEditDirty = $state(false);
  let componentEditSaving = $state(false);
  let componentEditDraft = $state(null);
  // The System Overview → Settings identity form (Name + Description) stages its typed values in
  // `SystemEditView` locally; they are lifted here so the route-exit guard can Save on navigate.
  let systemDetailsDraft = $state({ name: '', description: '' });
  let systemDetailsDirty = $state(false);
  let systemDetailsReseedNonce = $state(0);
  // Staged progressive-difficulty value for the component being edited (number or
  // null). Seeded on edit-entry; persisted with the rest of the draft on Save.
  let componentDifficultyDraft = $state(null);
  let recipeEditSaving = $state(false);
  let recipeSaveFailed = $state(false);
  // The recipe editor stages edits in a root-held draft and commits only on Save.
  let recipeDraft = $state(null);
  let recipeDraftBaseline = $state(null);
  // The recipe browser's filter / sort / group / paginate view-state, lifted OUT of
  // RecipesBrowserView so it survives the editor round-trip (issue 643).
  let recipeBrowserState = $state(createRecipeBrowserState());
  // Same lift, same reason, for the component library (issue 676): its filter/sort/ group/page
  // state used to live inside ComponentsBrowserView, so every editor round-trip reset it.
  let componentBrowserState = $state(createComponentBrowserState());
  // The staged-but-unwritten bulk edit (issue 772).
  let componentBulkDraft = $state(createComponentBulkDraft());
  let componentBulkApplying = $state(false);
  // The armed bulk delete (issue 1129).
  let componentBulkDeleting = $state(false);
  let componentBulkDeleteArmed = $state(false);
  // The recipe library's twin (issue 1010), owned here for the identical reason: the recipe bulk
  // panel is unmounted the moment the selection empties.
  let recipeBulkDraft = $state(createRecipeBulkDraft());
  let recipeBulkApplying = $state(false);
  // The recipe library's armed bulk delete (issue 1132), the third and last studio to get one.
  let recipeBulkDeleting = $state(false);
  let recipeBulkDeleteArmed = $state(false);
  // What a FINISHED delete that left the card mounted has to say for itself.
  let recipeBulkDeleteOutcome = $state('');
  // Its two twins (issue 1157, review round).
  let componentBulkDeleteOutcome = $state('');
  let essenceBulkDeleteOutcome = $state('');
  // The essence library's lifted view-state (issue 1036) — the third and last studio to get one,
  // and the fix for criterion 12.
  let essenceBrowserState = $state(createEssenceBrowserState());
  // ── EVERY OTHER BROWSE SURFACE'S LIFTED VIEW-STATE (issue 1438) ──────────────────────── The
  // three studios above each got their own declaration as they shipped.
  let managerBrowserState = $state(createManagerBrowserViewStates());
  // The staged-but-unwritten essence bulk edit, owned HERE for the reason its two siblings are: the
  // panel is unmounted the moment the selection empties.
  let essenceBulkDraft = $state(createEssenceBulkDraft());
  let essenceBulkApplying = $state(false);
  let essenceBulkDeleting = $state(false);
  // The bulk delete's ARMED latch (the maintainer's binding decision for this action).
  let essenceBulkDeleteArmed = $state(false);
  // `activeTravelTab` serves World > Parties ALONE now (issue 1282).
  let activeTravelTab = $state('parties');
  // World > Travel's destination: `realms` or `map`. Realms is the landing tab.
  let worldTravelTab = $state('realms');
  // The selected Downtime preview is owned here rather than inside the extension host
  // because the rail, the page header and the breadcrumb all name it.
  let worldDowntimeTabId = $state('tracking');
  // The selected recipe item on the Books & Scrolls surface (issue 511).
  let selectedRecipeItemId = $state('');
  // The recipe selected on the Access surface (visibility=restricted); drives the
  // GrantAccessInspector aside.
  let selectedRecipeIdForAccess = $state('');
  // Recipe-item editor draft (recipe-item-edit route).
  let recipeItemDraft = $state(null);
  let recipeItemDraftBaseline = $state(null);
  let recipeItemLinkedSourceSnapshot = $state(null);
  let recipeItemEditSaving = $state(false);
  // Set on every failed recipe-item save.
  let recipeItemSaveFailed = $state(false);
  let recipeItemActiveTab = $state('overview');
  // World-item options fed to the recipe-item editor's Overview link picker.
  let worldItemOptions = $state([]);
  // `Add from catalogue to {system}` (issue 1371, M9): the system Component Rules list's header
  // action opens an IN-PLACE picker over the world catalogue rather than navigating anywhere.
  let componentAddFromCatalogueOpen = $state(false);
  // `breakage`, because the system Tool rules editor has no Overview tab: identity is world
  // scope's, and `ToolEditorTabs` records why (issue 1373).
  let toolEditorActiveTab = $state('breakage');
  let toolValidationFocusNonce = $state(0);

  const selectedSystem = $derived($viewState.selectedSystem);
  const selectedSystemId = $derived(selectedSystem?.id || '');
  const systemsLoading = $derived($viewState.systemsLoading === true);
  // The system import report and the folder-aware component drop (issue 1721).
  const importFlow = createImportFlowModel({
    store: () => store,
    services: () => services,
    selectedSystemId: () => selectedSystemId,
  });
  // The Checks Studio's staged drafts and rail group (issue 1721).
  const checks = createChecksRouteModel({
    store: () => store,
    selectedSystem: () => selectedSystem,
    selectedSystemId: () => selectedSystemId,
    salvageResolutionMode: () => salvageResolutionMode,
    gatheringResolutionMode: () => gathering.gatheringResolutionMode,
    selectedSystemModifiers: () => selectedSystemModifiers,
    currentView: () => currentView,
  });
  // The gathering workspace's tab, selections, drafts and library (issue 1721).
  const gathering = createGatheringRouteModel({
    store: () => store,
    viewState: () => $viewState,
    view: () => currentView,
    selectedSystem: () => selectedSystem,
    selectedSystemId: () => selectedSystemId,
    canShowEnvironments: () => canShowEnvironments,
    isGatheringRoute: () => isGatheringRoute,
    navRail: () => navRail,
    text,
  });
  // The gathering workspace's library, draft and drop writes (issue 1721).
  const drafts = createGatheringDraftHandlers({
    store: () => store,
    services: () => services,
    gathering,
    navRail: () => navRail,
    selectedSystemId: () => selectedSystemId,
    canShowEnvironments: () => canShowEnvironments,
    isPromise,
    afterTruthyResult,
    confirmRouteExit,
    setActiveView: (view) => {
      activeView = view;
    },
    text,
  });
  // The Modifier Library references and condition modifiers a drop or an event carries.
  const modifiers = createGatheringModifierHandlers({
    gathering,
    drafts,
    selectedSystemModifiers: () => selectedSystemModifiers,
    text,
  });
  const canShowEnvironments = $derived(selectedSystem?.features?.gathering === true);
  const recipeMultiStepEnabled = $derived(selectedSystem?.features?.multiStepRecipes === true);
  // Complex recipes need a resolution mode that allows multiple ingredient/result
  // sets; simple/progressive systems craft exactly one set into one result.
  const recipeMultiSetAllowed = $derived(
    !['simple', 'progressive'].includes(selectedSystem?.resolutionMode || 'simple')
  );
  const canShowEssences = $derived(selectedSystem?.features?.essences === true);
  // Experimental toggle (issue 745): the Crafting group is now unconditional; this
  // gate only decides whether the unimplemented Graph placeholder is advertised.
  const experimentalFeaturesEnabled = $derived($viewState.experimentalFeaturesEnabled === true);
  const showEssenceSourceUi = $derived(selectedSystem?.features?.effectTransfer === true);
  // The essence property-macro gate (issue 1036).
  const showEssencePropertyMacroUi = $derived(selectedSystem?.features?.propertyMacros === true);
  const currentView = $derived(
    normalizedActiveView(activeView, selectedSystem, canShowEnvironments, canShowEssences)
  );
  const isToolStudioRoute = $derived(currentView === 'tools' || currentView === 'tool-edit');

  // THE `Add from catalogue` PICKER CANNOT OUTLIVE ITS ROUTE (issue 1371, r11).
  $effect(() => {
    if (currentView !== 'components') componentAddFromCatalogueOpen = false;
  });

  // WHICH ROUTES NEED THE ITEM ROSTER, which is a WIDER set than the Tool Studio's own (issue
  // 1373).
  const needsWorldItemOptions = $derived(
    isToolStudioRoute ||
      currentView === 'world-tools' ||
      currentView === 'world-tool-entry' ||
      currentView === 'world-components' ||
      currentView === 'world-component-entry'
  );

  $effect(() => {
    if (!needsWorldItemOptions) return;
    let active = true;
    const applyOptions = (options) => {
      if (active) worldItemOptions = Array.isArray(options) ? options : [];
    };
    let request;
    try {
      request = services?.getWorldItemOptions?.();
    } catch {
      applyOptions([]);
      return;
    }
    if (isPromise(request)) request.then(applyOptions, () => applyOptions([]));
    else applyOptions(request);
    return () => {
      active = false;
    };
  });

  // The pure `evaluateSystemValidation` report, computed in the admin store from the selected
  // system's recipes/environments/components.
  const systemValidationReport = $derived(
    $viewState.systemValidation || {
      issues: [],
      counts: { critical: 0, warning: 0, info: 0, blockers: 0 },
      blocksSystem: false,
    }
  );
  const systemBlocksSystem = $derived(systemValidationReport.blocksSystem === true);
  const systemOverviewCount = $derived(
    (systemValidationReport.counts?.critical || 0) + (systemValidationReport.counts?.warning || 0)
  );

  // The salvage check editor shown is selected by the salvage resolution mode.
  const salvageResolutionMode = $derived(selectedSystem?.salvageResolutionMode || 'simple');

  // Recipe tiers offered to the recipe editor's "Check tier" dropdown, resolved from the active
  // crafting-check mode.
  const recipeCheckTierOptions = $derived(
    resolveRecipeCheckTierOptions(selectedSystem?.craftingCheck, checks.craftingCheckMode)
  );
  // Fixed-type routed success tiers offered to the recipe's "Minimum success tier" override; empty
  // (control hidden) unless the system's real resolution mode is `routedByCheck` + fixed.
  const recipeMinSuccessTierOptions = $derived(
    resolveRecipeFixedOutcomeTierOptions(
      selectedSystem?.craftingCheck,
      selectedSystem?.resolutionMode
    )
  );

  // Why the system's active crafting check applies no check modifiers, or '' when it does.
  const recipeCraftingModifierInertCause = $derived(
    selectedSystem?.craftingCheck?.modifierFormulaInertCause || ''
  );

  // Routed-check outcome tiers (active type) offered to the recipe editor's check-mode result-set
  // assignment control as {id, name}.
  const recipeRoutedOutcomeTierOptions = $derived.by(() =>
    routedTierOptionsForPolicy(
      selectedSystem?.craftingCheck?.routed,
      selectedSystem?.craftingCheck?.failureResultPolicy
    )
  );
  // ALL routed outcome tiers ({id, name}, success + failure) — the library inspector
  // resolves a routed-by-check result group's checkOutcomeIds to these tier NAMES.
  const recipeAllOutcomeTierOptions = $derived.by(() =>
    routedOutcomeTierOptions(selectedSystem?.craftingCheck?.routed)
  );
  // Whether ANY outcome tier is defined (even failure-only).
  const recipeRoutedHasOutcomeTiers = $derived.by(() =>
    routedHasOutcomeTiers(selectedSystem?.craftingCheck?.routed)
  );
  // Whether this system's crafting failure-result policy permits results on a failed check (issue
  // 1098).
  const recipeFailureResultsAllowed = $derived(
    permitsFailureResults(selectedSystem?.craftingCheck?.failureResultPolicy)
  );

  // Salvage feature gate + the inputs the per-component salvage editor needs.
  const componentSalvageEnabled = $derived(selectedSystem?.features?.salvage === true);

  // ── THE SYSTEM'S SALVAGE MODE, AS A LABEL, FOR THE THREE COMPONENT SURFACES THAT STATE IT ── The
  // list's header subtitle.
  const componentSalvageModeLabel = $derived(
    (() => {
      const option = salvageResolutionModeOptions.find(
        (candidate) => candidate.value === (selectedSystem?.salvageResolutionMode || 'simple')
      );
      return option ? text(option.labelKey, option.fallback) : '';
    })()
  );

  // The world projection's entry for the SELECTED row, and that entry's row for THIS system.
  const componentInspectorWorldEntry = $derived(
    (Array.isArray(worldScopeState.component?.entries)
      ? worldScopeState.component.entries
      : []
    ).find((entry) => String(entry?.id ?? '') === String(selectedComponent?.id ?? '')) ?? null
  );
  const componentInspectorWorldSystemRow = $derived(
    (Array.isArray(componentInspectorWorldEntry?.systems)
      ? componentInspectorWorldEntry.systems
      : []
    ).find((row) => row?.systemId === selectedSystemId) ?? null
  );
  // Routed-salvage outcome tier NAMES (active type), used by the per-component outcome-routing
  // selects.
  const salvageOutcomeNames = $derived(
    routedOutcomeTierNamesForPolicy(
      selectedSystem?.salvageCraftingCheck?.routed,
      selectedSystem?.salvageCraftingCheck?.failureResultPolicy
    )
  );
  // The second axis of the per-component salvage panel's derived presentation
  // (issue 676, decision 2): salvageResolutionMode × salvage-check enablement.
  const salvageCheckEnabled = $derived(selectedSystem?.salvageCraftingCheck?.enabled === true);
  // DC presets come from `salvageCraftingCheck.simple.tiers` in EVERY resolution mode,
  // routed included (decision 7, case 5) — there is no `.routed.tiers` sibling.
  const salvageCheckTiers = $derived(selectedSystem?.salvageCraftingCheck?.simple?.tiers || []);
  const salvageCheckDcMode = $derived(
    selectedSystem?.salvageCraftingCheck?.simple?.dcMode || 'static'
  );
  const salvageCheckDc = $derived(selectedSystem?.salvageCraftingCheck?.simple?.dc ?? 0);
  // System components offered to the salvage yield picker.
  const salvageComponentOptions = $derived(selectedSystem?.managedItemOptions || []);

  // ── COMPLICATIONS: the SYSTEM-scoped bag the component editor cannot derive (issue 1286) ─
  const complicationActivities = $derived({
    crafting: selectedSystem?.resolutionMode === 'progressive',
    salvage: salvageResolutionMode === 'progressive',
    gathering: gatheringProgressive,
  });

  // The named triggers on the three PROGRESSIVE check blocks, as `{ id, label, activity }`.
  const complicationTriggerOptions = $derived([
    ...complicationTriggersFor('crafting', selectedSystem?.craftingCheck?.progressive),
    ...complicationTriggersFor('salvage', selectedSystem?.salvageCraftingCheck?.progressive),
    ...complicationTriggersFor('gathering', selectedSystem?.gatheringCraftingCheck?.progressive),
  ]);

  /** Resolve one summary FRAGMENT to a sentence. */
  function complicationTriggerPhrase(fragment) {
    const data = Object.fromEntries(
      Object.entries(fragment.data ?? {}).map(([key, entry]) => [
        key,
        entry && typeof entry === 'object' ? text(entry.key, entry.fallback) : entry,
      ])
    );
    return interpolate(text(fragment.key, fragment.fallback), data);
  }

  /** The `{ id, label, activity }` options for ONE activity's progressive check block. */
  function complicationTriggersFor(activity, block) {
    const triggers = Array.isArray(block?.checkBreakage?.triggers)
      ? block.checkBreakage.triggers
      : [];
    if (triggers.length === 0) return [];
    const diceGroups = parseDiceGroups(block?.rollFormula || '');
    return triggers
      .filter((trigger) => trigger?.id)
      .map((trigger) => ({
        id: trigger.id,
        activity,
        label: complicationTriggerPhrase(
          summariseCondition(trigger.condition ?? {}, { diceGroups })
        ),
      }));
  }

  // The macro picker's options.
  const complicationMacroOptions = $derived(selectedSystem?.availableScriptMacros || []);

  $effect(() => checks.reseed());

  const selectedCounts = $derived({
    components: selectedSystem?.managedItemOptions?.length || 0,
    recipes: $viewState.recipes?.length || 0,
    environments:
      selectedSystem?.features?.gathering === true ? $viewState.environments?.length || 0 : null,
    essences: selectedSystem?.essenceDefinitions?.length || 0,
    itemTags: selectedSystem?.itemTags?.length || 0,
    recipeCategories: selectedSystem?.categories?.length || 0,
  });
  const itemCards = $derived($viewState.itemCards || []);
  // Reference counting for the Tags & Categories screen delegates to the pure
  // `buildVocabularyUsage` helper (issue 689), which — unlike the pre-689 inline count.
  const tagCategoryUsage = $derived(
    buildVocabularyUsage($viewState.recipes || [], itemCards, {
      recipeTagPlaceholderCounts: $viewState.recipeTagPlaceholderCounts,
    })
  );
  const categoryRows = $derived(
    buildCategoryRows(
      selectedSystem?.categories || [],
      tagCategoryUsage.categoryUsage,
      selectedSystem?.categoryIcons || {}
    )
  );
  const componentCategoryRows = $derived(
    buildComponentCategoryRows(
      selectedSystem?.componentCategories || [],
      tagCategoryUsage.componentCategoryUsage,
      selectedSystem?.componentCategoryIcons || {}
    )
  );
  const tagRows = $derived(buildTagRows(selectedSystem?.itemTags || [], tagCategoryUsage.tagUsage));
  // Every category counter on the Tags & Categories screen reports the WHOLE vocabulary — the GM's
  // own entries plus the reserved General bucket — because General is a real.
  const tagCategoryCounts = $derived({
    recipeCategories: categoryRows.length,
    componentCategories: componentCategoryRows.length,
    itemTags: tagRows.length,
  });
  // The ONE authored modifier library (issue 1117).
  const selectedSystemModifiers = $derived(
    Array.isArray($viewState.worldModifiers) ? $viewState.worldModifiers : []
  );
  // The currency ladder is WORLD scope (issue 1278) — one config for the whole world, because a
  // world runs exactly one ruleset and so has exactly one way actors store coins.
  const worldCurrency = $derived(
    $viewState.worldCurrency || {
      spendStrategy: 'actorProperty',
      providerId: '',
      macros: { canAfford: '', increment: '', decrement: '', balance: '' },
      units: [],
    }
  );
  const selectedCurrencyUnits = $derived(
    Array.isArray(worldCurrency.units) ? worldCurrency.units : []
  );
  // The derived `validateCurrencyProfile` report (issue 1493).
  const worldCurrencyValidation = $derived(
    $viewState.worldCurrencyValidation || { valid: true, errors: [] }
  );
  const currencyValidationErrors = $derived(
    Array.isArray(worldCurrencyValidation.errors) ? worldCurrencyValidation.errors : []
  );
  // Units exist world-wide regardless of any one system, so the recipe editor must gate cost
  // affordances on the SYSTEM's explicit enable flag, not on unit presence.
  const selectedCurrencyEnabled = $derived(
    selectedSystem?.requirements?.currency?.enabled === true
  );
  // Time requirements default ON (issue 714): an absent flag keeps existing recipe/step durations
  // authorable and applied.
  const selectedTimeRequirementsEnabled = $derived(
    selectedSystem?.requirements?.time?.enabled !== false
  );
  const foundrySystemId = $derived(String($viewState.foundrySystemId || ''));
  const characterModifierPresetsSupported = $derived(['dnd5e', 'pf2e'].includes(foundrySystemId));
  const currencyPresetsSupported = $derived(['dnd5e', 'pf2e'].includes(foundrySystemId));
  // How many crafting systems actually opt into the world's currency.
  const allSystems = $derived($viewState.systems || []);
  // Reads the projected `currencyEnabled` flag, NOT `requirements.currency.enabled`: the system
  // list is a deliberate allowlist projection that does not carry `requirements`.
  const currencyEnabledSystemCount = $derived(
    allSystems.filter((system) => system?.currencyEnabled === true).length
  );
  const currencySpendStrategy = $derived(worldCurrency.spendStrategy || 'actorProperty');
  const currencyProviderId = $derived(worldCurrency.providerId || '');
  const currencyMacros = $derived(
    worldCurrency.macros || {
      canAfford: '',
      increment: '',
      decrement: '',
      balance: '',
    }
  );
  const currencyProviderOptions = $derived(
    getCurrencyProvidersForFoundrySystem(foundrySystemId).map((provider) => ({
      id: provider.id,
      label: provider.label,
    }))
  );
  // WORLD scope since issue 1308: none of these takes a system id, and none of them requires a
  // crafting system to be SELECTED.
  async function onAddCharacterModifier(partial) {
    return await store.addModifier(partial);
  }
  async function onSeedCharacterModifierPresets() {
    if (!characterModifierPresetsSupported) return;
    await store.seedModifierPresets();
  }
  async function onUpdateCharacterModifier(modifierId, patch) {
    await store.updateModifier(modifierId, patch);
  }
  async function onDeleteCharacterModifier(modifierId) {
    await store.deleteModifier(modifierId);
  }
  async function onReorderCharacterModifier(fromIndex, toIndex) {
    await store.reorderModifier(fromIndex, toIndex);
  }

  // Character prerequisites (issue 544) — pass/fail learning gates, WORLD scope since issue
  // 1308, so these handlers take no system id and need no selection either.
  const selectedCharacterPrerequisites = $derived(
    Array.isArray($viewState.worldCharacterPrerequisites)
      ? $viewState.worldCharacterPrerequisites
      : []
  );
  const characterPrerequisitePresetsSupported = $derived(
    ['dnd5e', 'pf2e'].includes(foundrySystemId)
  );
  async function onAddCharacterPrerequisite(partial) {
    return await store.addCharacterPrerequisite(partial);
  }
  async function onUpdateCharacterPrerequisite(prerequisiteId, patch) {
    await store.updateCharacterPrerequisite(prerequisiteId, patch);
  }
  async function onDeleteCharacterPrerequisite(prerequisiteId) {
    await store.deleteCharacterPrerequisite(prerequisiteId);
  }
  async function onReorderCharacterPrerequisite(fromIndex, toIndex) {
    await store.reorderCharacterPrerequisite(fromIndex, toIndex);
  }
  async function onSeedCharacterPrerequisitePresets() {
    if (!characterPrerequisitePresetsSupported) return;
    await store.seedPrerequisitePresets();
  }

  // Currency is WORLD scope (issue 1278): none of these take a system id, and none of them require
  // a selected crafting system.
  async function onAddCurrencyUnit() {
    return await store.addCurrencyUnit();
  }
  async function onUpdateCurrencyUnit(unitId, patch) {
    await store.updateCurrencyUnit(unitId, patch);
  }
  async function onDeleteCurrencyUnit(unitId) {
    await store.deleteCurrencyUnit(unitId);
  }
  async function onReorderCurrencyUnit(fromIndex, toIndex) {
    await store.reorderCurrencyUnit(fromIndex, toIndex);
  }
  async function onAddCurrencySubUnit(parentUnitId, subUnitId) {
    await store.addCurrencySubUnit(parentUnitId, subUnitId);
  }
  async function onUpdateCurrencySubUnit(parentUnitId, subUnitId, amount) {
    await store.updateCurrencySubUnit(parentUnitId, subUnitId, amount);
  }
  async function onDeleteCurrencySubUnit(parentUnitId, subUnitId) {
    await store.deleteCurrencySubUnit(parentUnitId, subUnitId);
  }
  async function onSeedCurrencyPresets() {
    if (!currencyPresetsSupported) return;
    await store.seedCurrencyUnitPresets();
  }
  async function onSetCurrencySpendStrategy(spendStrategy) {
    await store.setCurrencySpendStrategy(spendStrategy);
  }
  async function onSetCurrencyProvider(providerId) {
    await store.setCurrencyProvider(providerId);
  }
  async function onSetCurrencyMacro(key, uuid) {
    if (!uuid) return;
    await store.setCurrencyMacro(key, uuid);
  }
  async function onClearCurrencyMacro(key) {
    await store.clearCurrencyMacro(key);
  }

  $effect(() => modifiers.resetSearchOnDrop());
  $effect(() => modifiers.resetSearchOnEvent());
  $effect(() => modifiers.syncSearchDirection());
  $effect(() => modifiers.reconcileDropPickers());
  $effect(() => modifiers.reconcileEventPickers());

  const showRecipeCategories = $derived(!!selectedSystem);
  const selectedRecipe = $derived(
    ($viewState.recipes || []).find((recipe) => recipe.id === selectedRecipeId) ||
      ($viewState.recipes || [])[0] ||
      null
  );
  // Recipe-edit deriveds read the live draft (not the persisted record) so the editor, inspector,
  // and header chip all track unsaved staged edits.
  const alchemyCheckMode = $derived(
    selectedSystem?.resolutionMode === 'alchemy'
      ? selectedSystem?.alchemy?.checkMode || 'none'
      : null
  );
  // Recipe complexity is EMERGENT from structure now (issue 643): the editor renders multi-set
  // chrome purely off the ingredient-set / result-group COUNT.
  const recipeCanAddSet = $derived(
    recipeMultiSetAllowed && selectedSystem?.resolutionMode !== 'alchemy'
  );
  // Alchemy Simple mode drives the Results tab's fixed two-slot editor (success +
  // reserved failure result set).
  const recipeAlchemySimple = $derived(alchemyCheckMode === 'simple');
  // A SIMPLE-resolution system with the crafting check enabled has a pass/fail outcome, so it too
  // gets the reserved-failure two-slot result editor (issue 643).
  const recipeSimpleWithCheck = $derived(
    (selectedSystem?.resolutionMode || 'simple') === 'simple' &&
      selectedSystem?.craftingCheck?.enabled === true
  );
  // The routing basis is a property of the system MODE for the routed crafting modes (routedByCheck
  // → 'check', routedByIngredients → 'ingredientSet').
  const recipeRoutingProvider = $derived(
    (() => {
      const mode = selectedSystem?.resolutionMode || 'simple';
      if (mode === 'routedByCheck') return 'check';
      if (mode === 'routedByIngredients') return 'ingredientSet';
      if (mode === 'alchemy') return alchemyCheckMode === 'tiered' ? 'check' : null;
      return null;
    })()
  );
  // Progressive systems award a recipe's results in order, so the Results tab
  // enables drag-reorder of the result rows (resolution mode is a system setting).
  const recipeProgressive = $derived(selectedSystem?.resolutionMode === 'progressive');
  // Alchemy enable-blocker context for the recipe editor's Validation tab (issue 549).
  const recipeAlchemy = $derived(
    selectedSystem?.resolutionMode === 'alchemy' ? { checkMode: alchemyCheckMode || 'none' } : null
  );
  const recipeSignatureConflicts = $derived.by(() => {
    if (!recipeAlchemy || !recipeDraft?.id) return [];
    // Reference the live recipe list so the prediction recomputes after a refresh.
    void $viewState.recipes;
    return store.getRecipeSignatureConflicts?.(recipeDraft.id, recipeDraft) || [];
  });

  // --- Recipe editor context rail (issue 643 §4b) --------------------------------
  // The recipe editor's Access / Books & Scrolls tabs are MODE-CONDITIONAL off the same
  // craftingEffect matrix the nav and Crafting Settings read, so there is exactly one
  // source of truth for which conditional surface a visibility mode implies.
  const recipeVisibilityEffect = $derived(
    craftingEffect(selectedSystem?.visibilityMode || 'knowledge')
  );
  // Resolution happens in the STORE (the tab never touches ids): granted characters resolve over
  // EVERY world actor, not the player-character roster.
  const recipeAccessRoster = $derived(
    store.resolveRecipeAccess?.(recipeDraft?.access, {
      players: $viewState.worldUsers || [],
      characters: $viewState.accessCharacters || [],
    }) || { players: [], characters: [] }
  );
  const recipeEditDirty = $derived(
    Boolean(recipeDraft) && JSON.stringify(recipeDraft) !== JSON.stringify(recipeDraftBaseline)
  );
  const showComponentTags = $derived(
    itemCards.some((item) => item.showTags || (Array.isArray(item.tags) && item.tags.length > 0))
  );
  // THE `itemCards[0]` FALLBACK IS THE FIRST RENDER'S ANSWER, NOT THE SELECTION'S (issue 1371
  // r13-list, M14).
  const selectedComponent = $derived(
    itemCards.find((item) => item.id === selectedComponentId) || itemCards[0] || null
  );
  const essenceCards = $derived(
    $viewState.essenceCards || selectedSystem?.essenceDefinitions || []
  );
  const selectedEssenceStrict = $derived(
    essenceCards.find((essence) => essence.id === selectedEssenceId) || null
  );
  // NO `isCreatingEssenceDraft` (issue 1372, maintainer parity round 8).
  const selectedEssence = $derived(selectedEssenceStrict || essenceCards[0] || null);
  const selectedEssenceForInspector = $derived(
    currentView === 'essence-edit' ? essenceEditDraft : selectedEssence
  );
  const canSaveEssenceEdit = $derived(
    essenceEditDirty === true && essenceEditDraft?.validName === true && essenceEditSaving !== true
  );
  // ── The essence bulk selection (issue 1036) ────────────────────────────────────── Owned by the
  // shared composable over the LIFTED browser state, which `EssenceBrowserView` binds. `rows` is
  // the PROJECTION, not the ids: the delete-impact statement unions carrier IDENTITIES
  // (`componentUsageItems` and `recipeUsageIds`), which live on it.
  const essenceBulk = createBulkSelectionOwner({
    state: () => essenceBrowserState,
    key: 'bulkSelectedEssenceIds',
    rows: () => essenceCards,
    announce: (message) =>
      announceBulkSelectionEmptied('essences', message ?? selectionClearedAnnouncement()),
  });
  // Discard the staged draft when the selection empties — a clear, a system switch, a prune that
  // removed the last id, or a successful apply.
  $effect(() => {
    if (essenceBulk.ids.size === 0) essenceBulkDraft = createEssenceBulkDraft();
    essenceBulkDeleteArmed = false;
  });
  const canSaveComponentEdit = $derived(
    componentEditCombinedDirty === true && componentEditSaving !== true
  );
  const canSaveRecipeEdit = $derived(
    recipeEditDirty === true && Boolean(recipeDraft?.name?.trim()) && recipeEditSaving !== true
  );
  const recipeItemDefinitions = $derived(selectedSystem?.recipeItemDefinitions || []);
  const componentForEdit = $derived(
    currentView === 'component-edit'
      ? itemCards.find((item) => item.id === selectedComponentId) || null
      : null
  );
  // The expensive half of a component card — its linked source document, the "Missing" verdict and
  // the live description fallback — resolves on demand (issue 1081).
  $effect(() => {
    for (const card of [selectedComponent, componentForEdit]) {
      card?.hydrate?.()?.catch?.(() => {});
    }
  });
  const componentEditTagOptions = $derived(componentTagOptionsFor(componentForEdit));
  const componentEditEssenceOptions = $derived(componentEssenceOptionsFor(componentForEdit));
  const componentEditShowTags = $derived(componentShowTagsFor(componentForEdit));
  const componentEditShowEssences = $derived(componentShowEssencesFor(componentForEdit));
  // Progressive difficulty is authored from the right inspector but STAGED into the component
  // editor's save flow (it persists on Save, not on change).
  const gatheringProgressive = $derived(
    $viewState.gatheringConfig?.systems?.[selectedSystemId]?.economy?.resolutionMode ===
      'progressive'
  );
  // The SYSTEM-scoped half of that question, extracted so three surfaces can share it (issue 772):
  // the single-component editor control, the browser row's read-only DC badge.
  const componentDifficultyAxisProgressive = $derived(
    selectedSystem?.resolutionMode === 'progressive' ||
      salvageResolutionMode === 'progressive' ||
      gatheringProgressive
  );
  // Behaviour-preserving by construction: the same three axes ANDed with the same two view terms
  // this derivation always had.
  const componentDifficultyShown = $derived(
    currentView === 'component-edit' && componentDifficultyAxisProgressive && !!componentForEdit
  );
  const componentDifficultyDirty = $derived(
    componentDifficultyShown &&
      normalizeComponentDifficulty(componentDifficultyDraft) !==
        normalizeComponentDifficulty(componentForEdit?.difficulty)
  );
  const componentEditCombinedDirty = $derived(
    componentEditDirty === true || componentDifficultyDirty === true
  );
  // ── The bulk selection (issue 772) ─────────────────────────────────────────────── Owned by the
  // shared composable over the LIFTED browser state, which `ComponentsBrowserView` binds.
  const componentBulk = createBulkSelectionOwner({
    state: () => componentBrowserState,
    key: 'bulkSelectedComponentIds',
    rows: () => itemCards,
    announce: (message) =>
      announceBulkSelectionEmptied('components', message ?? selectionClearedAnnouncement()),
  });
  const componentBulkCategoryOptions = $derived(
    componentCategoryOptions(itemCards, selectedSystem?.componentCategories || [])
  );
  // What deleting the current selection would do (issue 1129).
  const componentBulkDeleteImpact = $derived(
    store.describeComponentDelete?.(componentBulk.ids) ?? {
      deletable: 0,
      deletableIds: [],
      recipesRewritten: 0,
      recipesDisabled: 0,
    }
  );
  // Discard the staged draft when the selection empties — a clear, a system switch, a prune that
  // removed the last id, or a successful apply.
  $effect(() => {
    if (componentBulk.ids.size === 0) componentBulkDraft = createComponentBulkDraft();
    componentBulkDeleteArmed = false;
  });
  // ── The recipe bulk selection (issue 1010) ─────────────────────────────────────── Owned by the
  // shared composable over the LIFTED browser state, which `RecipesBrowserView` binds. `rows` is
  // the PROJECTION, not the ids: the blocked-enable forecast reads `enableBlocked` and `enabled`,
  // both of which live on the projection the browser renders.
  const recipeBulk = createBulkSelectionOwner({
    state: () => recipeBrowserState,
    key: 'bulkSelectedRecipeIds',
    rows: () => $viewState.recipes || [],
    announce: (message) =>
      announceBulkSelectionEmptied('recipes', message ?? selectionClearedAnnouncement()),
  });
  // The SAME predicate the row's `Can't enable` pill reads, so the panel's count and the pilled
  // rows are one set by construction rather than by convention.
  const recipeBulkBlockedCount = $derived(
    countBlockedRecipeEnables(recipeBulk.rows, recipeBulkDraft?.status)
  );
  // How many of the SELECTED recipes each recipe book holds — the `holds n of {total}` figure the
  // bulk panel's book picker states.
  const recipeBulkBookMembership = $derived(countRecipeBookMembership(recipeBulk.rows));
  // The axis gate reuses the EXISTING `recipeCheckTierOptions` derived rather than re-resolving the
  // tier list.
  const recipeBulkCheckTierAxis = $derived(
    describeRecipeCheckTierAxis({
      craftingCheck: selectedSystem?.craftingCheck,
      craftingCheckMode: checks.craftingCheckMode,
      tierOptions: recipeCheckTierOptions,
    })
  );
  // The system's AUTHORED vocabulary, which is what the single-recipe editor's own select offers —
  // not the browser filter's in-use tally.
  const recipeBulkCategoryOptions = $derived(
    getEffectiveRecipeCategories(selectedSystem?.categories || [])
  );
  // What deleting the current selection would do (issue 1132).
  const recipeBulkDeleteImpact = $derived.by(() => {
    void $viewState;
    return (
      store.describeRecipeDelete?.(recipeBulk.ids) ?? {
        deletable: 0,
        deletableIds: [],
        recipeItemsAffected: 0,
        recipeItemIds: [],
        learnersAffected: 0,
        learnerIds: [],
      }
    );
  });
  // Discard the staged draft whenever the selection empties — a clear, a system switch, a prune
  // that removed the last id, or a successful apply.
  $effect(() => {
    if (recipeBulk.count === 0) recipeBulkDraft = createRecipeBulkDraft();
  });
  // DISARM the delete whenever the selection changes at all.
  $effect(() => {
    void recipeBulk.ids;
    recipeBulkDeleteArmed = false;
  });
  const isWorldRoute = $derived(currentView === 'world');
  const isWorldDowntimeRoute = $derived(currentView === 'world-downtime');
  // World > Currency (issue 1278).
  const isWorldCurrencyRoute = $derived(currentView === 'world-currency');
  // World > Rules & Resources (issue 1311).
  const isWorldPrerequisitesRoute = $derived(currentView === 'world-prerequisites');
  const isWorldModifiersRoute = $derived(currentView === 'world-modifiers');
  const isWorldRulesRoute = $derived(
    isWorldCurrencyRoute || isWorldPrerequisitesRoute || isWorldModifiersRoute
  );
  // -- World scoped-entity routes (issue 1362, epic 1357) --------------------------------
  const WORLD_SCOPED_VIEWS = Object.freeze([
    'world-components',
    'world-component-entry',
    'world-essences',
    'world-essence-entry',
    'world-tools',
    'world-tool-entry',
    'world-vocabulary',
  ]);
  const isWorldScopedRoute = $derived(WORLD_SCOPED_VIEWS.includes(currentView));
  // The world corpus behind the rail leaves' count badges.
  const worldScopeState = $derived($viewState.worldScope || {});
  const worldScopedCounts = $derived({
    components: worldScopeState.component?.entities?.length ?? 0,
    essences: worldScopeState.essence?.entities?.length ?? 0,
    tools: worldScopeState.tool?.entities?.length ?? 0,
    // The World Vocabulary count, WIRED NOW even though its corpus arrives with PR 7, and the
    // reason is a one-way door.
    vocabulary: worldScopeState.vocabulary?.total ?? 0,
  });

  // ── THE WORLD-SCOPE DATA SEAM (issue 1374) ─────────────────────────────────────────────
  const componentScopeProps = $derived({
    scope: worldScopeState.component ?? null,
    actions: store?.worldScope?.component ?? null,
    systems: allSystems,
    systemId: selectedSystemId || '',
  });
  const essenceScopeProps = $derived({
    scope: worldScopeState.essence ?? null,
    actions: store?.worldScope?.essence ?? null,
    systems: allSystems,
    systemId: selectedSystemId || '',
  });
  const toolScopeProps = $derived({
    scope: worldScopeState.tool ?? null,
    actions: store?.worldScope?.tool ?? null,
    systems: allSystems,
    systemId: selectedSystemId || '',
  });

  // ── THE WORLD INGREDIENT ROSTERS (issue 1373, maintainer round 2) ────────────────────────
  const worldComponentOptions = $derived(
    (worldScopeState.component?.entries ?? []).map((entry) => ({
      id: entry.id,
      name: entry.entity?.name || entry.id,
      img: entry.entity?.img || '',
      // CARRIED FOR THE DROP TARGET.
      ...(entry.entity?.registeredItemUuid && {
        registeredItemUuid: entry.entity.registeredItemUuid,
      }),
      ...(entry.entity?.originItemUuid && { originItemUuid: entry.entity.originItemUuid }),
    }))
  );

  // WORLD-DISABLED ESSENCES ARE WITHHELD FROM THE OFFER, which is exactly what
  // `selectableEssenceOptions` does with a system-disabled one.
  const worldEssenceOptions = $derived(
    (worldScopeState.essence?.entries ?? []).map((entry) => ({
      ...(entry.entity ?? {}),
      id: entry.id,
      enabled: entry.worldEnabled !== false,
    }))
  );

  // THE WORLD TAG VOCABULARY, DERIVED FROM THE RECORDS THAT CARRY IT.
  const worldComponentTags = $derived(
    [
      ...new Set(
        (worldScopeState.component?.entries ?? []).flatMap((entry) =>
          Array.isArray(entry.defaults?.tags) ? entry.defaults.tags : []
        )
      ),
    ].sort((left, right) => String(left).localeCompare(String(right)))
  );

  // ── WHAT THE ESSENCE RULES INSPECTOR NEEDS FROM THE WORLD JOIN (issue 1372, round 8) ──────
  const inspectedEssenceWorldEntry = $derived(
    (worldScopeState.essence?.entries ?? []).find(
      (candidate) => candidate?.id === selectedEssenceForInspector?.id
    ) ?? null
  );
  const inspectedEssenceSystemRows = $derived(
    worldScopeState.essence?.available === true &&
      Array.isArray(inspectedEssenceWorldEntry?.systems)
      ? inspectedEssenceWorldEntry.systems
      : []
  );
  // The inherit map for THIS system, or `null` when there is no membership record.
  const inspectedEssenceInherited = $derived(
    inspectedEssenceSystemRows.find((row) => row?.systemId === selectedSystemId)?.inherited ?? null
  );

  // ── THE SYSTEM ESSENCE RULES HEADER (issue 1372, maintainer parity round 7) ───────────────
  const essenceRulesWorldEntry = $derived(
    currentView === 'essence-edit' && selectedEssenceId
      ? ((worldScopeState.essence?.entries ?? []).find(
          (candidate) => candidate?.id === selectedEssenceId
        ) ?? null)
      : null
  );
  const essenceRulesMode = $derived(
    worldScopeState.essence?.available === true && essenceRulesWorldEntry !== null
  );

  // Name and glyph follow the world record wherever there is one (issue 1654): `1.34.0` merges
  // equivalent world essences and `icon` is not in the equivalence key.
  const essenceEditName = $derived(
    essenceRulesWorldEntry?.entity?.name ||
      essenceEditDraft?.name ||
      selectedEssenceStrict?.name ||
      ''
  );
  const essenceEditIcon = $derived(
    essenceRulesWorldEntry?.entity?.icon ||
      essenceEditDraft?.icon ||
      selectedEssenceStrict?.icon ||
      'fas fa-mortar-pestle'
  );
  // The tint needs no world read of its own (maintainer ruling M29): `adminStore`'s projection
  // already overlays the world colour onto the in-system row's `colorToken`.
  const essenceEditTint = $derived(
    essenceEditDraft?.colorToken ?? selectedEssenceStrict?.colorToken ?? ''
  );

  // The subline states the two facts the reference states: WHICH system's rules these are, and
  // whether the essence is on in it.
  const essenceEditSubline = $derived(
    interpolate(text('FABRICATE.Admin.Manager.Essence.RulesSubtitle', '{system} rules · {state}'), {
      system: selectedSystem?.name || '',
      state:
        (essenceEditDraft?.enabled ?? selectedEssenceStrict?.enabled) === false
          ? text('FABRICATE.Admin.Manager.Essence.RulesDisabled', 'disabled')
          : text('FABRICATE.Admin.Manager.Essence.RulesEnabled', 'enabled'),
    })
  );

  // WHICH WORLD ENTITY AN ENTRY ROUTE IS OPEN ON (issue 1362).
  let worldScopedEntryId = $state('');
  const worldScopedEntryRoute = $derived(scopedEntryRoute(currentView));

  /**
   * THE BUFFERED IDENTITY OF WHICHEVER SCOPED ENTRY EDITOR IS OPEN (issue 1372, maintainer parity
   * round 6).
   */
  let scopedEntryDraftIdentity = $state(null);

  /** One scoped entry editor's buffered identity, or `null` to withdraw it. */
  function handleScopedEntryDraftIdentity(identity) {
    scopedEntryDraftIdentity = identity && typeof identity === 'object' ? { ...identity } : null;
  }

  /** One buffered identity field as a string, or `null` when no editor is reporting one. */
  function scopedEntryDraftField(field) {
    if (!scopedEntryDraftIdentity) return null;
    const value = scopedEntryDraftIdentity[field];
    return typeof value === 'string' ? value : null;
  }

  // TRIMMED on both branches, because `scopedEntryName` trims and a crumb that changed its
  // whitespace handling the moment an editor opened would be a difference nobody authored.
  const worldScopedEntryCrumb = $derived(
    scopedEntryDraftField('name')?.trim() ??
      scopedEntryName(
        worldScopeState[worldScopedEntryRoute?.entityType]?.entities,
        worldScopedEntryId
      )
  );

  // THE ESSENCE ENTRY ROUTE'S HEADER NAMES THE ESSENCE (issue 1372, maintainer parity round 4).
  const worldEssenceEntryRecord = $derived(
    currentView === 'world-essence-entry'
      ? ((worldScopeState.essence?.entries ?? []).find(
          (candidate) => candidate?.id === worldScopedEntryId
        ) ?? null)
      : null
  );

  // `count` is the projection's own member total and `total` is the crafting-system roster the same
  // entry was built against.
  const worldEssenceEntrySubtitle = $derived(
    worldEssenceEntryRecord
      ? interpolate(
          text(
            'FABRICATE.Admin.Manager.Scoped.EssenceEntryIdentitySubtitle',
            'World definition · used by {count} of {total} systems'
          ),
          {
            count: Number(worldEssenceEntryRecord.membershipCount) || 0,
            total: Array.isArray(worldEssenceEntryRecord.systems)
              ? worldEssenceEntryRecord.systems.length
              : 0,
          }
        )
      : ''
  );

  /** THE WORLD ESSENCE ENTRY EDITOR'S BUFFERED EDIT. */
  let worldEssenceEntryHandle = null;
  let worldEssenceEntryDirty = $state(false);
  let worldEssenceEntrySaving = $state(false);

  function handleWorldEssenceEntryDraft(handle) {
    worldEssenceEntryHandle = handle ?? null;
    if (!handle) worldEssenceEntryDirty = false;
  }

  function handleWorldEssenceEntryDirty(dirty) {
    worldEssenceEntryDirty = dirty === true;
  }

  // THE HEADING NAMES THE DRAFT, NOT THE RECORD ON DISK (issue 1372, maintainer parity round 5).
  const worldEssenceEntryName = $derived(
    worldEssenceEntryRecord
      ? (scopedEntryDraftField('name') ?? worldEssenceEntryRecord.entity?.name ?? '')
      : ''
  );

  // AND SO DOES THE MEDALLION BESIDE IT (issue 1372, maintainer parity round 6).
  const worldEssenceEntryIcon = $derived(
    worldEssenceEntryRecord
      ? (scopedEntryDraftField('icon') ?? worldEssenceEntryRecord.entity?.icon ?? '')
      : ''
  );
  const worldEssenceEntryTint = $derived(
    worldEssenceEntryRecord
      ? (scopedEntryDraftField('colorToken') ?? worldEssenceEntryRecord.entity?.colorToken ?? '')
      : ''
  );

  // THE TOOL ENTRY ROUTE'S HEADER NAMES THE TOOL.
  const worldToolEntryRecord = $derived(
    currentView === 'world-tool-entry'
      ? ((worldScopeState.tool?.entries ?? []).find(
          (candidate) => candidate?.id === worldScopedEntryId
        ) ?? null)
      : null
  );

  /** WHAT THE RECORD IS, under its name, REPORTED BY THE PAGE rather than derived here. */
  let worldToolEntrySubtitle = $state('');

  function handleWorldToolEntrySubline(subline) {
    worldToolEntrySubtitle = typeof subline === 'string' ? subline : '';
  }

  /** THE WORLD TOOL ENTRY EDITOR'S BUFFERED EDIT, held where its two consumers are. */
  let worldToolEntryHandle = null;
  let worldToolEntryDirty = $state(false);
  let worldToolEntrySaving = $state(false);

  function handleWorldToolEntryDraft(handle) {
    worldToolEntryHandle = handle ?? null;
    if (!handle) {
      worldToolEntryDirty = false;
      worldToolEntrySubtitle = '';
    }
  }

  function handleWorldToolEntryDirty(dirty) {
    worldToolEntryDirty = dirty === true;
  }

  /**
   * THE WORLD TOOL ENTRY'S HEADER `Delete`, which the design draws between Back and Save
   * (`tmp/proto/tool-entry.png`) and which this screen did not have (issue 1373).
   */
  let worldToolEntryDelete = $state(null);
  let worldToolEntryDeleteArmed = $state('');

  function handleWorldToolEntryDelete(descriptor) {
    worldToolEntryDelete = descriptor ?? null;
    if (!descriptor) worldToolEntryDeleteArmed = '';
  }

  // THE HEADING NAMES THE DRAFT, NOT THE RECORD ON DISK — consistent with the essence entry and
  // with the linked-item tile this page draws from the same buffered value.
  const worldToolEntryName = $derived(
    worldToolEntryRecord
      ? (scopedEntryDraftField('name') ?? worldToolEntryRecord.entity?.name ?? '')
      : ''
  );

  /** Flush the world tool entry editor's buffered edit. */
  async function saveWorldToolEntry() {
    if (!worldToolEntryHandle) return false;
    worldToolEntrySaving = true;
    try {
      return (await worldToolEntryHandle.save()) !== false;
    } finally {
      worldToolEntrySaving = false;
    }
  }

  /** THE WORLD COMPONENT ENTRY EDITOR'S DRAFT (issue 1371). */
  let worldComponentEntryHandle = null;
  let worldComponentEntryDirty = $state(false);
  let worldComponentEntrySaving = $state(false);

  function handleWorldComponentEntryDraft(handle) {
    worldComponentEntryHandle = handle ?? null;
    if (!handle) {
      worldComponentEntryDirty = false;
      worldComponentEntrySubtitle = '';
    }
  }

  function handleWorldComponentEntryDirty(dirty) {
    worldComponentEntryDirty = dirty === true;
  }

  /** THE WORLD COMPONENT ENTRY ROUTE'S HEADER NAMES THE COMPONENT (issue 1371, parity round 4). */
  const worldComponentEntryRecord = $derived(
    currentView === 'world-component-entry'
      ? ((worldScopeState.component?.entries ?? []).find(
          (candidate) => candidate?.id === worldScopedEntryId
        ) ?? null)
      : null
  );

  /** WHAT THE RECORD IS, under its name, REPORTED BY THE PAGE rather than derived here. */
  let worldComponentEntrySubtitle = $state('');

  function handleWorldComponentEntrySubline(subline) {
    worldComponentEntrySubtitle = typeof subline === 'string' ? subline : '';
  }

  // THE HEADING NAMES THE DRAFT, NOT THE RECORD ON DISK, off the shared `scopedEntryDraftIdentity`
  // channel the breadcrumb's last crumb also reads.
  const worldComponentEntryName = $derived(
    worldComponentEntryRecord
      ? (scopedEntryDraftField('name') ?? worldComponentEntryRecord.entity?.name ?? '')
      : ''
  );
  const worldComponentEntryImage = $derived(
    worldComponentEntryRecord
      ? (scopedEntryDraftField('img') ?? worldComponentEntryRecord.entity?.img ?? '')
      : ''
  );

  /** Flush the world component entry editor's buffered edit. */
  async function saveWorldComponentEntry() {
    if (!worldComponentEntryHandle) return false;
    worldComponentEntrySaving = true;
    try {
      return (await worldComponentEntryHandle.save()) !== false;
    } finally {
      worldComponentEntrySaving = false;
    }
  }

  /** Flush the world essence entry editor's buffered edit. */
  async function saveWorldEssenceEntry() {
    if (!worldEssenceEntryHandle) return false;
    worldEssenceEntrySaving = true;
    try {
      return (await worldEssenceEntryHandle.save()) !== false;
    } finally {
      worldEssenceEntrySaving = false;
    }
  }

  // Open an entry route ON a world entity.
  function openWorldScopedEntry(view, entityId) {
    const nextEntryId = typeof entityId === 'string' ? entityId : String(entityId ?? '');
    return afterTruthyResult(confirmRouteExit(view), () => {
      worldScopedEntryId = nextEntryId;
      activeView = view;
    });
  }

  /** Create a world essence from the page header and open its entry editor. */
  /**
   * Open ONE crafting system's essence rules for a world essence, from the catalogue inspector.
   *
   * @param {string} _entityId the essence the row belongs to; see above.
   * @param {string} systemId the crafting system whose rules to open.
   * @returns {unknown} whatever `selectSystem` answered, so a refused exit stays refused.
   */
  function openSystemEssenceRules(_entityId, systemId) {
    if (!systemId) return false;
    return afterTruthyResult(selectSystem(systemId, 'essences'), () => {
      activeView = 'essences';
    });
  }

  /**
   * Open one crafting system's TOOL RULES from the world tool catalogue's inspector row.
   *
   * @returns {unknown} whatever `selectSystem` answered, so a refused exit stays refused.
   */
  function openSystemToolRules(_entityId, systemId) {
    if (!systemId) return false;
    return afterTruthyResult(selectSystem(systemId, 'tools'), () => {
      activeView = 'tools';
    });
  }

  /**
   * Open one crafting system's COMPONENT RULES list, from a world catalogue row (issue 1371).
   *
   * @param {string} entityId the component the row belongs to, selected into the list.
   * @returns {unknown} whatever `selectSystem` answered, so a refused exit stays refused.
   */
  function openSystemComponentRules(entityId, systemId) {
    if (!systemId) return false;
    return afterTruthyResult(selectSystem(systemId, 'components'), () => {
      resetComponentSelectionFor(systemId, String(entityId ?? ''));
      activeView = 'components';
    });
  }

  async function createWorldEssence() {
    const name = text('FABRICATE.Admin.Manager.Scoped.Essence.NewName', 'New essence');
    // The retired leg is required here (issue 1654): this mints from a fixed placeholder name.
    const id = mintEssenceId(
      name,
      worldScopeState.essence?.entities ?? [],
      worldScopeState.essence?.retiredIds ?? []
    );
    const created = await store?.worldScope?.essence?.createEntity?.({
      id,
      name,
      icon: 'fas fa-flask-vial',
      colorToken: '',
      description: '',
    });
    if (created === false) return;
    openWorldScopedEntry('world-essence-entry', id);
  }

  // -- Full width: ONE mechanically checked decision over a THREE-state classification ---
  //
  // Suppressing the `<aside class="manager-inspector">` here and releasing the grid column in
  // `styles/fabricate.css` are ONE decision expressed twice: do only the first and a ~300px
  // empty box still holds the strip open; do only the second and the (empty) aside wraps to
  // an implicit grid row underneath the editor. This set IS that one decision, and the aside
  // chain below is BUILT from it rather than restating any clause.
  //
  // THREE THINGS MAKE THE OBVIOUS SHAPE -- a set of route tokens -- WRONG:
  //
  //  1. Three of the twelve shipped clauses are not route tokens at all. `checks` is a FAMILY
  //     matched by a PREFIX selector, World > Parties is a route+substate matched by a
  //     COMPOUND attribute selector, and the world-rules clause spans THREE tokens.
  //  2. There are THREE layout states in the shipped stylesheet, not two. `tool-edit` and
  //     `knowledge` suppress the aside AND keep three tracks, repurposing the third column
  //     for their own content. A gate asserting "aside excluded equals column released" is
  //     therefore unsatisfiable on `main`, and every loosening of it is vacuous.
  //  3. So each entry says WHICH class it is. The aside chain is built from the UNION of the
  //     two aside-suppressing classes; the third class is `shared-3-track`, whose members --
  //     the base rule, its collapsed sibling, and the route-scoped `tools` widths -- KEEP
  //     their inspector and are deliberately absent from this set.
  //
  // `selector` is the BASE stylesheet selector, verbatim.
  // `tests/manager-full-width-gate.test.js` asserts set equality between these and the
  // stylesheet's own, so a route released here and not there (or the reverse) fails at test
  // time rather than as a dead 300px strip.
  function isGatheringTaskFullWidth(view, context) {
    return view === 'gathering-task-edit' && context.resultGroupTaskMode === true;
  }

  const FULL_WIDTH_VIEWS = Object.freeze([
    {
      id: 'environment-edit',
      layoutClass: 'full-width-2-track',
      selector: '.fabricate-manager[data-manager-view="environment-edit"] .manager-body',
      predicate: (view) => view === 'environment-edit',
    },
    {
      // ROUTE + EDITOR MODE. d100 keeps its drop inspector; Direct and Check own all of
      // their result authoring in the main pane, so the shared inspector has no content.
      id: 'gathering-task-edit',
      layoutClass: 'full-width-2-track',
      selector:
        '.fabricate-manager[data-manager-view="gathering-task-edit"][data-gathering-task-layout="results"] .manager-body',
      predicate: isGatheringTaskFullWidth,
    },
    {
      // A FAMILY, not a token: `checks` became four child routes plus a retained redirect
      // (issue 1096), which is why the stylesheet matches it by prefix.
      id: 'checks',
      layoutClass: 'full-width-2-track',
      selector: '.fabricate-manager[data-manager-view^="checks"] .manager-body',
      predicate: (view) => isChecksView(view),
    },
    {
      id: 'component-edit',
      layoutClass: 'full-width-2-track',
      selector: '.fabricate-manager[data-manager-view="component-edit"] .manager-body',
      predicate: (view) => view === 'component-edit',
    },
    {
      id: 'recipe-edit',
      layoutClass: 'full-width-2-track',
      selector: '.fabricate-manager[data-manager-view="recipe-edit"] .manager-body',
      predicate: (view) => view === 'recipe-edit',
    },
    {
      id: 'crafting-settings',
      layoutClass: 'full-width-2-track',
      selector: '.fabricate-manager[data-manager-view="crafting-settings"] .manager-body',
      predicate: (view) => view === 'crafting-settings',
    },
    {
      id: 'recipe-item-edit',
      layoutClass: 'full-width-2-track',
      selector: '.fabricate-manager[data-manager-view="recipe-item-edit"] .manager-body',
      predicate: (view) => view === 'recipe-item-edit',
    },
    {
      id: 'system-edit',
      layoutClass: 'full-width-2-track',
      selector: '.fabricate-manager[data-manager-view="system-edit"] .manager-body',
      predicate: (view) => view === 'system-edit',
    },
    {
      // The system vocabulary screen joins the released routes in issue 1915: its inspector
      // rail is retired, not converted, so the column it held has no content to return to.
      id: 'tags',
      layoutClass: 'full-width-2-track',
      selector: '.fabricate-manager[data-manager-view="tags"] .manager-body',
      predicate: (view) => view === 'tags',
    },
    {
      id: 'world-currency',
      layoutClass: 'full-width-2-track',
      selector: '.fabricate-manager[data-manager-view="world-currency"] .manager-body',
      predicate: (view) => view === 'world-currency',
    },
    {
      id: 'world-prerequisites',
      layoutClass: 'full-width-2-track',
      selector: '.fabricate-manager[data-manager-view="world-prerequisites"] .manager-body',
      predicate: (view) => view === 'world-prerequisites',
    },
    {
      id: 'world-modifiers',
      layoutClass: 'full-width-2-track',
      selector: '.fabricate-manager[data-manager-view="world-modifiers"] .manager-body',
      predicate: (view) => view === 'world-modifiers',
    },
    {
      id: 'world-downtime',
      layoutClass: 'full-width-2-track',
      selector: '.fabricate-manager[data-manager-view="world-downtime"] .manager-body',
      predicate: (view) => view === 'world-downtime',
    },
    {
      // ROUTE + SUBSTATE. World owns the whole content column only on its Parties tab, so the
      // stylesheet matches a compound of two attributes and this predicate reads both.
      id: 'world-parties',
      layoutClass: 'full-width-2-track',
      selector:
        '.fabricate-manager[data-manager-view="world"][data-world-travel-tab="parties"] .manager-body',
      predicate: (view, context) => view === 'world' && context.travelTab === 'parties',
    },
    {
      // SELF-OWNED THREE-TRACK: the aside is suppressed AND the third track is kept, because
      // the Tool editor owns its own third column.
      id: 'tool-edit',
      layoutClass: 'self-owned-3-track',
      selector: '.fabricate-manager[data-manager-view="tool-edit"] .manager-body',
      predicate: (view) => view === 'tool-edit',
    },
    {
      // Likewise: the Knowledge surface owns roster + detail, and a fourth column would clip
      // the detail pane's action cluster at the 1024px minimum (issue 785).
      id: 'knowledge',
      layoutClass: 'self-owned-3-track',
      selector: '.fabricate-manager[data-manager-view="knowledge"] .manager-body',
      predicate: (view) => view === 'knowledge',
    },
    // The seven world scoped-entity routes.
    {
      id: 'world-components',
      layoutClass: 'full-width-2-track',
      selector: '.fabricate-manager[data-manager-view="world-components"] .manager-body',
      predicate: (view) => view === 'world-components',
    },
    {
      id: 'world-component-entry',
      layoutClass: 'full-width-2-track',
      selector: '.fabricate-manager[data-manager-view="world-component-entry"] .manager-body',
      predicate: (view) => view === 'world-component-entry',
    },
    {
      id: 'world-essences',
      layoutClass: 'full-width-2-track',
      selector: '.fabricate-manager[data-manager-view="world-essences"] .manager-body',
      predicate: (view) => view === 'world-essences',
    },
    {
      id: 'world-essence-entry',
      layoutClass: 'full-width-2-track',
      selector: '.fabricate-manager[data-manager-view="world-essence-entry"] .manager-body',
      predicate: (view) => view === 'world-essence-entry',
    },
    {
      id: 'world-tools',
      layoutClass: 'full-width-2-track',
      selector: '.fabricate-manager[data-manager-view="world-tools"] .manager-body',
      predicate: (view) => view === 'world-tools',
    },
    {
      id: 'world-tool-entry',
      layoutClass: 'full-width-2-track',
      selector: '.fabricate-manager[data-manager-view="world-tool-entry"] .manager-body',
      predicate: (view) => view === 'world-tool-entry',
    },
    {
      id: 'world-vocabulary',
      layoutClass: 'full-width-2-track',
      selector: '.fabricate-manager[data-manager-view="world-vocabulary"] .manager-body',
      predicate: (view) => view === 'world-vocabulary',
    },
  ]);
  // Which sub-item the rail marks as current, and the `data-world-rules-tab` marker the CSS and
  // the View Lab read.
  const worldRulesTab = $derived(
    isWorldPrerequisitesRoute ? 'prerequisites' : isWorldModifiersRoute ? 'modifiers' : 'currency'
  );
  // ONE derivation for the destination's name, read by the breadcrumb, the page title and the
  // `<main>` aria-label. Three call-site literals would drift.
  const worldRulesPageTitle = $derived(
    isWorldPrerequisitesRoute
      ? text('FABRICATE.Admin.Manager.CharacterPrerequisites.Title', 'Character prerequisites')
      : isWorldModifiersRoute
        ? text('FABRICATE.Admin.Manager.Modifiers.Title', 'Modifiers')
        : text('FABRICATE.Admin.Manager.World.CurrencyTitle', 'World Currency')
  );
  // World > Travel (issue 1282).
  const isWorldTravelRoute = $derived(currentView === 'world-travel');
  // ONE attribute answering "which World travel destination is on screen", written once so the
  // markup carries no nested ternary.
  const worldTravelTabAttribute = $derived.by(() => {
    if (isWorldTravelRoute) return worldTravelTab;
    return isWorldRoute ? activeTravelTab : undefined;
  });
  // THE WORLD > DOWNTIME EXPERIMENTAL GATE (issue 1257), and it is TEMPORARY.
  const worldDowntimeAvailable = $derived(experimentalFeaturesEnabled);
  // A registered provider holds the surface until it faults; otherwise Core's own preview does.
  const downtimeProvider = $derived(
    downtimeProviderSnapshot && downtimeProviderSnapshot !== downtimeFaultedProvider
      ? downtimeProviderSnapshot
      : null
  );
  const downtimeCoreFallback = $derived(downtimeProvider === null);
  // The union of both registries' claimed surfaces.
  const registeredSurfaceIds = $derived([
    ...managerRegisteredSurfaceIds,
    ...playerRegisteredSurfaceIds,
  ]);
  // The title bar's premium signal (issue 1185).
  const premiumInstalled = $derived(registeredSurfaceIds.length > 0);
  const downtimeTabs = $derived(downtimeProvider?.tabs ?? WORLD_DOWNTIME_PREVIEW_PROVIDER.tabs);
  const activeDowntimeTab = $derived(
    downtimeTabs.find((tab) => tab.id === worldDowntimeTabId) ?? downtimeTabs[0]
  );
  // A tab a provider no longer declares must not leave the route on an empty panel. This
  // covers registration, unregistration, and re-registration with a different tab set.
  $effect(() => {
    const tabs = downtimeTabs;
    if (tabs.some((tab) => tab.id === worldDowntimeTabId)) return;
    worldDowntimeTabId = tabs[0].id;
  });
  // The id of the element carrying the sub-item's VISIBLE LABEL, stated once and used twice: the
  // rail stamps it.
  const downtimeNavLabelId = (tabId) => `manager-downtime-nav-label-${tabId}`;
  // Gated on provider mode rather than merely on the channel being empty.
  const downtimeRuntimeChrome = $derived(downtimeCoreFallback ? null : downtimeRouteChrome);
  // Header actions belong to the live mount, then to the active TAB, then to the provider's own
  // list; Core keeps its bespoke premium anchor rather than routing it through a public descriptor.
  const downtimeHeaderActions = $derived(
    downtimeCoreFallback
      ? []
      : (downtimeRuntimeChrome?.actions ??
          activeDowntimeTab?.actions ??
          downtimeProvider.actions ??
          [])
  );
  // The staged-changes indicator, and a runtime-only channel by design: it reports what the
  // mount is DOING right now, which nothing stated at registration can know.
  const downtimeHeaderStatus = $derived(downtimeRuntimeChrome?.status ?? null);
  // Header artwork, opt-in per update.
  const downtimeHeaderArtwork = $derived(
    downtimeRuntimeChrome?.icon || downtimeRuntimeChrome?.image ? downtimeRuntimeChrome : null
  );
  const worldDowntimeContext = $derived.by(() => {
    // Read the revision so `requestRemount()` yields a NEW frozen identity, which is what
    // the host's mount effect keys on. Nothing here is a Core store, document or component.
    const revision = downtimeContextRevision;
    // The context object is its own mount's identity token, which is why the two channel functions
    // close over a holder rather than being stated once outside this derivation.
    const self = { context: null };
    const context = Object.freeze({
      schemaVersion: 1,
      surface: 'manager',
      surfaceId: WORLD_DOWNTIME_SURFACE_ID,
      route: 'world-downtime',
      tabId: worldDowntimeTabId,
      craftingSystemId: selectedSystemId || null,
      isGM: isGameMaster(),
      revision,
      requestRemount: requestDowntimeRemount,
      setRouteChrome: (chrome) => downtimeChromeChannel.setChrome(self.context, chrome),
      onRouteReselect: (handler) => downtimeChromeChannel.onReselect(self.context, handler),
      onBeforeNavigate: (handler) => downtimeChromeChannel.onBeforeNavigate(self.context, handler),
      navigateToTab: (tabId) => downtimeChromeChannel.navigate(self.context, tabId),
    });
    self.context = context;
    return context;
  });
  const isGatheringRoute = $derived(
    currentView === 'environments' ||
      currentView === 'environment-edit' ||
      currentView === 'gathering-task-edit' ||
      currentView === 'gathering-event-edit'
  );
  $effect(() => gathering.normalizeTab());

  // Crafting nav group (issue 511, PR-B redesign).
  const craftingVisibilityMode = $derived(selectedSystem?.visibilityMode || 'knowledge');
  // The Knowledge surface's gate is wider than Books & Scrolls': it is also shown for an alchemy
  // system under ANY visibility mode.
  const craftingResolutionMode = $derived(selectedSystem?.resolutionMode || '');
  const recipeCount = $derived($viewState.recipes?.length || 0);
  const recipeItemCount = $derived(recipeItemDefinitions.length);
  // ONE argument bag, read by the rail AND by route reconciliation in `normalizedActiveView` (issue
  // 1151), mirroring the checks route model's `checksNavArgs`/`checksNavItems`.
  const craftingNavArgs = $derived({
    visibilityMode: craftingVisibilityMode,
    resolutionMode: craftingResolutionMode,
    recipeCount,
    recipeItemCount,
  });
  const craftingNavItems = $derived(buildCraftingNavItems(craftingNavArgs));
  // The Crafting parent-group badge totals its visible sub-tabs (Recipes + Books & Scrolls where
  // that surface applies), mirroring the gathering group's total.
  const craftingNavCount = $derived(
    craftingNavItems.reduce((sum, item) => sum + (item.count || 0), 0)
  );
  const isCraftingRoute = $derived(isCraftingView(currentView));
  const activeCraftingTab = $derived(resolveActiveCraftingTab(currentView));
  const isChecksRoute = $derived(isChecksView(currentView));

  // ── Rail group expansion, and the collapse seam (issue 1185, extracted by issue 1717) ───
  // Both inputs are thunks: the model reads them inside its own `$derived.by` to subscribe to
  // these route deriveds across the module boundary.
  const navRail = createNavRailModel({
    services: () => services,
    groupLocks: () => ({
      crafting: isCraftingRoute,
      checks: isChecksRoute,
      gathering: gathering.isActiveGatheringChildRoute,
      worldTravel: isWorldTravelRoute,
      worldRules: isWorldRulesRoute,
      worldDowntime: isWorldDowntimeRoute,
    }),
    // The whole rail locks open over a companion's Downtime surface (issue 1213).
    railLocked: () => isWorldDowntimeRoute && !downtimeCoreFallback,
  });
  $effect(() => navRail.syncLocks());
  // The Tool Studio is a TOP-LEVEL rail entry that presents as Crafting context — its breadcrumb
  // reads "<system> › Crafting › Tools" — so entering it opens the Crafting group.
  $effect(() => {
    if (isToolStudioRoute) navRail.expandGroup('crafting');
  });
  // The Knowledge surface's projection is published TOP-LEVEL, never hung off `selectedSystem`
  // (issue 785).
  const knowledgeState = $derived($viewState.knowledge || null);
  // Entering the surface arms the store's whole-world scan; leaving it makes `refreshKnowledge` a
  // total no-op again and drops the cached snapshot.
  $effect(() => {
    store.setKnowledgeActive?.(currentView === 'knowledge');
  });
  // The recipe whose access grant is open on the Access surface.
  const selectedRecipeForAccess = $derived(
    ($viewState.recipes || []).find((recipe) => recipe.id === selectedRecipeIdForAccess) || null
  );
  // The projected recipe item selected on Books & Scrolls (drives the inspector).
  const selectedRecipeItem = $derived(
    (recipeItemDefinitions || []).find((def) => def.id === selectedRecipeItemId) || null
  );
  // ---- Recipe-item editor draft derivations (recipe-item-edit route) ---------
  const recipeItemEditDirty = $derived(
    Boolean(recipeItemDraft) &&
      JSON.stringify(recipeItemDraft) !== JSON.stringify(recipeItemDraftBaseline)
  );
  const canSaveRecipeItemEdit = $derived(
    recipeItemEditDirty === true && recipeItemEditSaving !== true
  );
  // The linked linked world item for the editor's Overview preview.
  const recipeItemEditorLinkedItem = $derived.by(() => {
    const uuid = String(recipeItemDraft?.originItemUuid || '');
    if (!uuid) return null;
    if (recipeItemLinkedSourceSnapshot?.uuid === uuid) {
      return { ...recipeItemLinkedSourceSnapshot };
    }
    const persisted = (recipeItemDefinitions || []).find((def) => def.originItemUuid === uuid);
    if (persisted) {
      return {
        uuid,
        name: persisted.resolvedName,
        img: persisted.resolvedImg,
        type: persisted.derivedType,
        description: persisted.description || '',
      };
    }
    const option = (worldItemOptions || []).find((item) => item.uuid === uuid);
    return option ? { ...option } : { uuid, name: '', img: '', type: '' };
  });
  // Recipes contained by the edited recipe item, and the pool that can still be added.
  const recipeItemDraftRecipeIds = $derived(
    new Set((recipeItemDraft?.recipeIds || []).map((id) => String(id)))
  );
  const recipeItemEditorLinkedRecipes = $derived(
    recipeItemDraft
      ? ($viewState.recipes || []).filter((recipe) =>
          recipeItemDraftRecipeIds.has(String(recipe?.id))
        )
      : []
  );
  const recipeItemEditorAvailableRecipes = $derived(
    recipeItemDraft
      ? ($viewState.recipes || []).filter(
          (recipe) => !recipeItemDraftRecipeIds.has(String(recipe?.id))
        )
      : []
  );
  // ─────────────────────────────────────────────────────────────────────────────────────────
  // BREADCRUMB LEAVES: the SUBJECT of an editor, not the act of editing it (issue 1328).
  const crumbSubject = (name, key, fallback) => {
    const trimmed = String(name ?? '').trim();
    return trimmed || text(key, fallback);
  };
  const environmentCrumb = $derived(
    crumbSubject(
      gathering.environmentDraftForDisplay?.name,
      'FABRICATE.Admin.Manager.Environment.EditBreadcrumb',
      'Edit environment'
    )
  );
  const gatheringTaskCrumb = $derived(
    crumbSubject(
      gathering.gatheringTaskDraft?.name,
      'FABRICATE.Admin.Manager.Environment.Tasks.EditBreadcrumb',
      'Edit gathering task'
    )
  );
  const gatheringEventCrumb = $derived(
    crumbSubject(
      gathering.gatheringEventDraft?.name,
      'FABRICATE.Admin.Manager.Environment.Events.EditBreadcrumb',
      'Edit gathering event'
    )
  );
  // THE LINKED ITEM'S name rather than a field on the draft, because a recipe item HAS no name of
  // its own: it is a world item plus the recipes it contains.
  const recipeItemCrumb = $derived(
    crumbSubject(
      recipeItemEditorLinkedItem?.name,
      'FABRICATE.Admin.Manager.RecipeItem.EditBreadcrumb',
      'Edit recipe item'
    )
  );

  // Tools are system-owned: read the canonical library from the selected crafting system (surfaced
  // on $viewState.selectedSystem.tools by the store) rather than the gathering-config copy.
  const selectedGatheringSystemTools = $derived(
    Array.isArray($viewState.selectedSystem?.tools) ? $viewState.selectedSystem.tools : []
  );
  const toolsNavCount = $derived(selectedGatheringSystemTools.length);
  // Recipe-editor tools library: enrich each tool with its backing component's name (so an
  // unlabelled tool can fall back to the component name rather than exposing a raw id, mirroring
  // the tool inspector's `label || component.name` resolution) and image (so the recipe Tools
  // section and picker show the component thumbnail instead of a generic tool glyph).
  const recipeToolsLibrary = $derived(
    selectedGatheringSystemTools.map((tool) => {
      const component = (selectedSystem?.managedItemOptions || []).find(
        (item) => String(item.id) === String(tool.componentId)
      );
      return { ...tool, componentName: component?.name || '', componentImg: component?.img || '' };
    })
  );
  const travelParties = $derived($viewState.travelParties || []);

  // World > Parties page-header subtitle (issue 1182).
  const playerCharacterUuids = $derived(
    new Set(
      ($viewState.actorOptions || [])
        .filter((actor) => actor.isPlayerCharacter === true)
        .map((actor) => actor.uuid)
    )
  );
  const assignedCharacterCount = $derived.by(() => {
    const assigned = [];
    for (const party of travelParties) {
      for (const uuid of party.memberActorUuids || []) {
        if (playerCharacterUuids.has(uuid) && !assigned.includes(uuid)) assigned.push(uuid);
      }
    }
    return assigned.length;
  });
  const enabledPartyCount = $derived(
    travelParties.filter((party) => party.enabled === true).length
  );

  // Realm selection is UI-local (no store resolution needed); the inspector
  // reads the selected realm from the system-realm projection.
  let selectedTravelRealmId = $state('');
  const worldRealms = $derived($viewState.worldRealms || []);
  // Rows for the Realms tab's per-realm environment editor.
  const worldTravelEnvironmentOptions = $derived(
    gathering.environmentList.map((environment) => ({
      id: environment.id,
      name: environment.name,
      img: environment.img || '',
      enabled: environment.enabled !== false,
      includedRealmIds: Array.isArray(environment.includedRealmIds)
        ? environment.includedRealmIds
        : [],
    }))
  );
  const selectedTravelRealm = $derived(
    worldRealms.find((realm) => realm.id === selectedTravelRealmId) || null
  );
  // Mirror the Parties tab: keep a realm selected whenever one exists, falling
  // back to the first realm when nothing is selected or the selection is gone.
  $effect(() => {
    if (worldRealms.length === 0) {
      if (selectedTravelRealmId) selectedTravelRealmId = '';
    } else if (!worldRealms.some((realm) => realm.id === selectedTravelRealmId)) {
      selectedTravelRealmId = worldRealms[0].id;
    }
  });
  // Map Region Links tab: selection over the current scene's regions (UI-local).
  let selectedMapRegionUuid = $state('');
  const mapCurrentSceneRegions = $derived($viewState.currentSceneRegions || []);
  const selectedMapRegion = $derived(
    mapCurrentSceneRegions.find((region) => region.sceneRegionUuid === selectedMapRegionUuid) ||
      null
  );
  // Auto-select the first scene region (and re-seat when the scene changes and the
  // region set is replaced), clearing the selection when the scene has none.
  $effect(() => {
    if (mapCurrentSceneRegions.length === 0) {
      if (selectedMapRegionUuid) selectedMapRegionUuid = '';
    } else if (
      !mapCurrentSceneRegions.some((region) => region.sceneRegionUuid === selectedMapRegionUuid)
    ) {
      selectedMapRegionUuid = mapCurrentSceneRegions[0].sceneRegionUuid;
    }
  });
  function isGatheringResultGroupMode(mode) {
    return ['straight', 'routed'].includes(mode);
  }
  // The ONE read of the full-width set. `null` means the route keeps its inspector. Gathering
  // passes its selected task mode into this same decision so aside suppression and track release
  // cannot disagree during a mode switch.
  const fullWidthLayout = $derived(
    FULL_WIDTH_VIEWS.find((entry) =>
      entry.predicate(currentView, {
        travelTab: activeTravelTab,
        resultGroupTaskMode: isGatheringResultGroupMode(gathering.gatheringTaskResolutionMode),
      })
    ) ?? null
  );

  const libraryToolsList = $derived(
    Array.isArray(selectedSystem?.tools) ? selectedSystem.tools : []
  );
  const focusedToolDraft = $derived($viewState.toolDraft || null);
  const focusedToolValidation = $derived(
    $viewState.toolDraftValidation || { valid: false, errors: ['missing'] }
  );
  const selectedLibraryTool = $derived(
    libraryToolsList.find((tool) => tool.id === focusedToolDraft?.id) || null
  );

  // WHICH WORLD TOOL THE RULES LIST HAS SELECTED THAT THIS SYSTEM HAS NO RECORD FOR.
  let unadoptedToolId = $state('');
  const unadoptedWorldTool = $derived(
    unadoptedToolId
      ? ((worldScopeState.tool?.entries ?? []).find((entry) => entry.id === unadoptedToolId) ??
          null)
      : null
  );

  /** The Tool the browser inspector describes. */
  const inspectedLibraryTool = $derived(unadoptedWorldTool ? null : selectedLibraryTool);

  /** The selected Tool's per-section INHERIT map. */
  const selectedLibraryToolInherited = $derived.by(() => {
    const toolId = String(inspectedLibraryTool?.id ?? '');
    if (!toolId) return {};
    const entry = (worldScopeState.tool?.entries ?? []).find(
      (candidate) => String(candidate?.id ?? '') === toolId
    );
    const systemRow = (Array.isArray(entry?.systems) ? entry.systems : []).find(
      (candidate) => String(candidate?.systemId ?? '') === String(selectedSystemId ?? '')
    );
    return systemRow?.inherited ?? {};
  });

  /**
   * Seed the component selection for a system, and stamp the system sentinel with it.
   *
   * @param {string} [componentId] the component to select, or `''` for none — the rules list then
   * selects its first drawn row.
   */
  function resetComponentSelectionFor(systemId, componentId = '') {
    selectedComponentId = componentId;
    componentEditDirty = false;
    componentEditSaving = false;
    componentEditDraft = null;
    lastComponentSystemId = systemId;
  }

  $effect(() => {
    if (selectedSystemId === lastComponentSystemId) return;
    resetComponentSelectionFor(selectedSystemId);
  });

  $effect(() => {
    if (selectedSystemId === lastEssenceSystemId) return;
    selectedEssenceId = '';
    essenceEditDirty = false;
    essenceEditSaving = false;
    essenceEditDraft = null;
    lastEssenceSystemId = selectedSystemId;
  });

  $effect(() => gathering.resetOnSystemSwitch());
  $effect(() => gathering.resetTabOffRoute());
  $effect(() => gathering.reselectTask());
  $effect(() => gathering.reselectEvent());
  $effect(() => gathering.reselectDrop());

  $effect(() => {
    services?.registerEssenceDirtyGuard?.(() =>
      runRouteExitGuard(routeExitGuardFor('essence-edit'), 'close')
    );
    return () => services?.registerEssenceDirtyGuard?.(null);
  });

  $effect(() => {
    services?.registerToolDirtyGuard?.(() =>
      runRouteExitGuard(routeExitGuardFor('tool-edit'), 'close')
    );
    return () => services?.registerToolDirtyGuard?.(null);
  });

  // The companion's own window-close guard.
  $effect(() => {
    services?.registerDowntimeCompanionGuard?.(() =>
      downtimeChromeChannel.confirmNavigation('close')
    );
    return () => services?.registerDowntimeCompanionGuard?.(null);
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  /** The interpolating localizer, for the notices this shell composes itself. */
  function format(key, fallback, data) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(data ?? {})) {
      result = result.replaceAll(`{${token}}`, String(value));
    }
    return result;
  }

  function formatCount(keySingular, fallbackSingular, keyPlural, fallbackPlural, count) {
    const key = count === 1 ? keySingular : keyPlural;
    const fallback = count === 1 ? fallbackSingular : fallbackPlural;
    return `${count} ${text(key, fallback)}`;
  }

  // The recipe editor's header subline: "<category> · <resolution mode>".
  function recipeEditSubtitle() {
    const category = getRecipeCategoryLabel(
      normalizeRecipeCategory(recipeDraft?.category),
      localize
    );
    const mode = resolutionModeLabel(selectedSystem?.resolutionMode);
    // "⟨category⟩ · ⟨mode⟩ · DC ⟨n⟩" (§F4): resolve the check DC from the same projected
    // `checkSummary` the browser row's check pill reads.
    const summary = selectedRecipe?.checkSummary || null;
    let dcSuffix = '';
    if (summary?.kind === 'dc' && Number.isFinite(Number(summary.dc))) {
      dcSuffix = ` · ${text('FABRICATE.Admin.Manager.Recipe.CheckDcShort', 'DC')} ${summary.dc}`;
    } else if (summary?.kind === 'none') {
      dcSuffix = ` · ${text('FABRICATE.Admin.Manager.Recipe.CheckDcShort', 'DC')} —`;
    }
    return `${category} · ${mode}${dcSuffix}`;
  }

  // The component editor's header subline: "<category> · Linked <source>" (issue 676, decision 4).
  function componentEditSubtitle() {
    const category = getComponentCategoryLabel(
      normalizeComponentCategory(componentForEdit?.category),
      localize
    );
    return componentRulesSubtitle(
      {
        systemName: selectedSystem?.name || '',
        category,
        salvageModeLabel: componentSalvageModeLabel,
      },
      format
    );
  }

  function resolutionModeLabel(mode) {
    const labels = {
      simple: text('FABRICATE.Admin.SystemSettings.ResolutionSimple', 'Simple'),
      routedByIngredients: text(
        'FABRICATE.Admin.Manager.ResolutionRoutedByIngredients',
        'Routed by ingredients'
      ),
      routedByCheck: text('FABRICATE.Admin.Manager.ResolutionRoutedByCheck', 'Routed by check'),
      progressive: text('FABRICATE.Admin.SystemSettings.ResolutionProgressive', 'Progressive'),
      alchemy: text('FABRICATE.Admin.SystemSettings.ResolutionAlchemy', 'Alchemy'),
    };
    return (
      labels[mode] || mode || text('FABRICATE.Admin.SystemSettings.ResolutionSimple', 'Simple')
    );
  }

  // The titlebar's right-hand status line.
  const titlebarOutcomeTierCount = $derived(
    selectedSystem?.resolutionMode === 'routedByCheck'
      ? routedOutcomeTierCount(selectedSystem?.craftingCheck?.routed)
      : 0
  );

  function titlebarStatusLabel() {
    const mode = resolutionModeLabel(selectedSystem?.resolutionMode);
    if (titlebarOutcomeTierCount <= 0) return mode;
    const tiers = formatCount(
      'FABRICATE.Admin.Manager.Titlebar.OutcomeTier',
      'outcome tier',
      'FABRICATE.Admin.Manager.Titlebar.OutcomeTiers',
      'outcome tiers',
      titlebarOutcomeTierCount
    );
    return `${mode} · ${tiers}`;
  }

  function normalizedActiveView(view, system, environmentsAvailable, essencesAvailable) {
    // `checks` is RETAINED as a redirect to the first available child (issue 1096), so existing
    // deep links.
    if (system && view === 'checks') return resolveChecksRedirect(checks.checksNavArgs);
    // A child whose feature was switched off while it was open falls back to the same
    // redirect rather than rendering a route the rail no longer offers.
    if (
      system &&
      CHECKS_VIEWS.includes(view) &&
      !checks.checksNavItems.some((item) => item.view === view)
    )
      return resolveChecksRedirect(checks.checksNavArgs);
    // The same reconciliation for the Crafting group (issue 1151).
    if (system && isCraftingView(view) && !isCraftingViewAvailable(view, craftingNavArgs))
      return resolveCraftingRedirect(craftingNavArgs);
    // The standalone `system-overview` route was folded into the `system-edit` page's Validation
    // tab; a stale value (no system selected) falls through to the `systems` library here.
    if (
      view === 'world' ||
      view === 'world-downtime' ||
      view === 'world-currency' ||
      view === 'world-prerequisites' ||
      view === 'world-modifiers' ||
      view === 'world-travel' ||
      // The seven scoped-entity routes join the world pass-through (issue 1362) and MUST be above
      // the fallthrough below.
      WORLD_SCOPED_VIEWS.includes(view)
    )
      return view;
    if (!system) return 'systems';
    if (view === 'system-overview') return 'system-edit';
    if (view === 'tool-edit' && !$viewState.toolDraft) return 'tools';
    if (
      (view === 'environments' ||
        view === 'environment-edit' ||
        view === 'gathering-task-edit' ||
        view === 'gathering-event-edit') &&
      !environmentsAvailable
    )
      return 'systems';
    if ((view === 'essences' || view === 'essence-edit') && !essencesAvailable) return 'systems';
    return view;
  }

  function componentTagOptionsFor(item) {
    if (!selectedSystem || !item) return [];
    return buildComponentEditorState(selectedSystem, item).tagOptions || [];
  }

  function componentEssenceOptionsFor(item) {
    if (!selectedSystem || !item) return [];
    return buildComponentEditorState(selectedSystem, item).essenceOptions || [];
  }

  function componentShowTagsFor(item) {
    if (!selectedSystem || !item) return false;
    return buildComponentEditorState(selectedSystem, item).showTags === true;
  }

  function componentShowEssencesFor(item) {
    if (!selectedSystem || !item) return false;
    return buildComponentEditorState(selectedSystem, item).showEssences === true;
  }

  // The page header's six answers, one derivation each (issue 1720). Every leg is passed as a
  // thunk so `createHeaderModel` reads this shell's live `$derived` values rather than the ones
  // they held when it was built.
  const header = createHeaderModel({
    route: {
      checksActiveTab: () => checks.checksActiveTab,
      currentView: () => currentView,
      displayedGatheringTab: () => gathering.displayedGatheringTab,
      isChecksRoute: () => isChecksRoute,
      isWorldDowntimeRoute: () => isWorldDowntimeRoute,
      isWorldRulesRoute: () => isWorldRulesRoute,
      isWorldScopedRoute: () => isWorldScopedRoute,
      worldTravelTab: () => worldTravelTab,
    },
    state: {
      allSystems: () => allSystems,
      assignedCharacterCount: () => assignedCharacterCount,
      componentEditSubtitle: () => componentEditSubtitle,
      componentForEdit: () => componentForEdit,
      componentSalvageModeLabel: () => componentSalvageModeLabel,
      currencyEnabledSystemCount: () => currencyEnabledSystemCount,
      downtimeChrome: () => downtimeChrome,
      downtimeHeaderArtwork: () => downtimeHeaderArtwork,
      enabledPartyCount: () => enabledPartyCount,
      essenceRulesMode: () => essenceRulesMode,
      format: () => format,
      gatheringTabPageHint: () => gathering.gatheringTabPageHint,
      gatheringTabPageTitle: () => gathering.gatheringTabPageTitle,
      playerCharacterUuids: () => playerCharacterUuids,
      recipeDraft: () => recipeDraft,
      recipeEditSubtitle: () => recipeEditSubtitle,
      selectedCharacterPrerequisites: () => selectedCharacterPrerequisites,
      selectedCurrencyUnits: () => selectedCurrencyUnits,
      selectedSystem: () => selectedSystem,
      selectedSystemModifiers: () => selectedSystemModifiers,
      showEssenceSourceUi: () => showEssenceSourceUi,
      text: () => text,
      travelParties: () => travelParties,
      worldComponentEntryRecord: () => worldComponentEntryRecord,
      worldEssenceEntryRecord: () => worldEssenceEntryRecord,
      worldRulesPageTitle: () => worldRulesPageTitle,
      worldToolEntryRecord: () => worldToolEntryRecord,
    },
  });

  function isPromise(value) {
    return value && typeof value.then === 'function';
  }

  function afterTruthyResult(result, callback) {
    if (isPromise(result)) {
      return result.then((value) => {
        if (value !== false) callback();
        return value;
      });
    }
    if (result !== false) callback();
    return result;
  }

  function inspectorLabel() {
    if (currentView === 'recipe-edit')
      return text('FABRICATE.Admin.Manager.Recipe.RecipeItem', 'Recipe item');
    if (currentView === 'component-edit')
      return text('FABRICATE.Admin.Manager.Component.SourceCard.Title', 'Linked Source Item');
    if (currentView === 'access')
      return text('FABRICATE.Admin.Manager.Access.Inspector', 'Grant access inspector');
    if (currentView === 'books-scrolls')
      return text(
        'FABRICATE.Admin.Manager.BooksScrolls.Inspector',
        'Selected recipe item inspector'
      );
    if (currentView === 'recipes')
      return text('FABRICATE.Admin.Manager.Recipe.Inspector', 'Selected recipe inspector');
    if (currentView === 'components')
      return text('FABRICATE.Admin.Manager.Component.Inspector', 'Selected component inspector');
    if (currentView === 'essences' || currentView === 'essence-edit')
      return text('FABRICATE.Admin.Manager.Essence.Inspector', 'Selected essence inspector');
    if (currentView === 'environments' && gathering.displayedGatheringTab === 'tasks')
      return text(
        'FABRICATE.Admin.Manager.Environment.Tasks.Inspector',
        'Selected gathering task inspector'
      );
    if (isWorldRoute)
      return text('FABRICATE.Admin.Manager.World.PartiesInspector', 'Selected world party');
    if (isWorldTravelRoute)
      return worldTravelTab === 'map'
        ? text('FABRICATE.Admin.Manager.Travel.MapLinksInspector', 'Selected map region link')
        : text('FABRICATE.Admin.Manager.Travel.RealmsInspector', 'Selected realm');
    if (currentView === 'tools')
      return text('FABRICATE.Admin.Manager.Tools.Inspector', 'Selected tool inspector');
    if (currentView === 'environments')
      return text(
        'FABRICATE.Admin.Manager.Environment.Inspector',
        'Selected environment inspector'
      );
    return text('FABRICATE.Admin.Manager.SelectedSystemInspector', 'Selected system inspector');
  }

  // The gathering finishers also run on the clean path: both answers clear the draft and move on.
  const finishGatheringTaskExit = async (action, nextView) => {
    if (action === 'cancel' || action === false) return false;
    if (action === 'save') {
      const saved = await drafts.saveGatheringTaskDraft();
      if (saved === false) return false;
    }
    drafts.clearGatheringTaskDraft();
    if (nextView) activeView = nextView;
    return true;
  };

  const finishGatheringEventExit = async (action, nextView) => {
    if (action === 'cancel' || action === false) return false;
    if (action === 'save') {
      const saved = await drafts.saveGatheringEventDraft();
      if (saved === false) return false;
    }
    drafts.clearGatheringEventDraft();
    if (nextView) activeView = nextView;
    return true;
  };

  // `subject` is the identity of what the caller is navigating to, for the routes whose view token
  // does not change when the subject does. `activeView` holds one token, so no two rows can be
  // active at once, which is why the order between them is immaterial.
  const routeExitGuards = buildRouteExitGuards({
    'world-essence-entry': {
      active: () => activeView === 'world-essence-entry',
      subject: () => worldScopedEntryId,
      isDirty: () => worldEssenceEntryHandle?.isDirty() === true,
      confirm: () => store?.confirmDiscardDirtyEssenceDraft?.(),
      save: () => saveWorldEssenceEntry(),
      discard: () => worldEssenceEntryHandle?.discard?.(),
    },
    'world-tool-entry': {
      active: () => activeView === 'world-tool-entry',
      subject: () => worldScopedEntryId,
      isDirty: () => worldToolEntryHandle?.isDirty() === true,
      confirm: () => store?.confirmDiscardDirtyToolEntryDraft?.(),
      save: () => saveWorldToolEntry(),
      discard: () => worldToolEntryHandle?.discard?.(),
    },
    'world-component-entry': {
      active: () => activeView === 'world-component-entry',
      subject: () => worldScopedEntryId,
      isDirty: () => worldComponentEntryHandle?.isDirty() === true,
      confirm: () => store?.confirmDiscardDirtyComponentDraft?.(),
      save: () => saveWorldComponentEntry(),
      discard: () => worldComponentEntryHandle?.discard?.(),
    },
    'environment-edit': {
      active: () => activeView === 'environment-edit',
      isDirty: () => $viewState.environmentDraftDirty === true,
      confirm: () => store.confirmDiscardDirtyEnvironmentDraft?.(),
      finish: async (action) => {
        if (action === 'cancel' || action === false) return false;
        if (action === 'save') {
          const result = await store.saveEnvironmentDraft?.();
          return !(result && result.ok === false);
        }
        await store.cancelEnvironmentDraft?.();
        return true;
      },
    },
    // Criterion 23 (issue 1036): the guard compares the essence, not only the view token.
    'essence-edit': {
      active: () => activeView === 'essence-edit',
      subject: () => selectedEssenceId,
      isDirty: () => essenceEditDirty === true,
      confirm: () => store.confirmDiscardDirtyEssenceDraft?.(),
      finish: async (action) => {
        if (action === 'cancel' || action === false) return false;
        if (action === 'save') {
          if (!essenceEditDraft || essenceEditDraft.validName !== true) return false;
          const saved = await saveEssenceEdit(
            essenceEditDraft.id || null,
            essenceEditDraft.updates
          );
          return saved !== false;
        }
        essenceEditDirty = false;
        essenceEditDraft = null;
        store.cancelEssenceDraft?.();
        return true;
      },
    },
    'recipe-edit': {
      active: () => activeView === 'recipe-edit',
      isDirty: () => recipeEditDirty === true,
      confirm: () => store.confirmDiscardDirtyRecipeDraft?.(),
      finish: async (action) => {
        if (action === 'cancel' || action === false) return false;
        if (action === 'save') {
          const saved = await saveRecipeDraft();
          return saved !== false;
        }
        // Discard: roll the draft back to the last-persisted baseline so the dirty flag clears.
        recipeDraft = cloneRecipeDraft(recipeDraftBaseline);
        return true;
      },
    },
    'recipe-item-edit': {
      active: () => activeView === 'recipe-item-edit',
      isDirty: () => recipeItemEditDirty === true,
      confirm: () => store.confirmDiscardDirtyRecipeItemDraft?.(),
      finish: async (action) => {
        if (action === 'cancel' || action === false) return false;
        if (action === 'save') {
          const saved = await saveRecipeItemDraft();
          return saved !== false;
        }
        recipeItemDraft = cloneRecipeItemDraft(recipeItemDraftBaseline);
        recipeItemLinkedSourceSnapshot = recipeItemSourceSnapshot(recipeItemDraftBaseline);
        return true;
      },
    },
    'component-edit': {
      active: () => activeView === 'component-edit',
      isDirty: () => componentEditCombinedDirty === true,
      confirm: () => store.confirmDiscardDirtyComponentDraft?.(),
      finish: async (action) => {
        if (action === 'cancel' || action === false) return false;
        if (action === 'save') {
          if (!componentEditDraft || !componentEditDraft.id) return false;
          const saved = await saveComponentEdit(componentEditDraft.id, componentEditDraft.updates);
          return saved !== false;
        }
        componentEditDirty = false;
        componentEditDraft = null;
        return true;
      },
    },
    'gathering-task-edit': {
      active: () => activeView === 'gathering-task-edit',
      isDirty: () => gathering.gatheringTaskDraftDirty,
      whenClean: (nextView) => finishGatheringTaskExit(true, nextView),
      confirm: () => store.confirmDiscardDirtyGatheringTaskDraft?.(),
      finish: finishGatheringTaskExit,
    },
    'gathering-event-edit': {
      active: () => activeView === 'gathering-event-edit',
      isDirty: () => gathering.gatheringEventDraftDirty,
      whenClean: (nextView) => finishGatheringEventExit(true, nextView),
      confirm: () => store.confirmDiscardDirtyGatheringEventDraft?.(),
      finish: finishGatheringEventExit,
    },
    'tool-edit': {
      active: () => activeView === 'tool-edit',
      subject: () => String(focusedToolDraft?.id || ''),
      isDirty: () => $viewState.toolDraftDirty === true,
      whenClean: () => {
        store?.cancelToolsDraft?.();
        return true;
      },
      confirm: () =>
        services?.confirmDirtyToolsNavigation
          ? services.confirmDirtyToolsNavigation({ toolId: String(focusedToolDraft?.id || '') })
          : store?.confirmDiscardDirtyToolsDraft?.(),
      finish: async (action) => {
        if (action === 'save') {
          const saved = await store?.saveToolDraft?.();
          if (saved === false) {
            surfaceToolsSaveValidationError();
            return false;
          }
          store?.cancelToolsDraft?.();
          return true;
        }
        if (action === 'discard' || action === true) {
          store?.discardToolDraft?.();
          store?.cancelToolsDraft?.();
          return true;
        }
        return false;
      },
    },
    // The Checks Studio's route-exit prompt (issue 1096); its route is a family of tabs.
    checks: {
      active: () => isChecksRoute,
      family: (nextView) => isChecksView(nextView),
      isDirty: () => checks.checksDirty,
      confirm: () =>
        store?.confirmDiscardDirtyChecksDraft?.(
          checks.checksDirtyActivities.map((activity) =>
            text(
              `FABRICATE.Admin.Manager.Checks.Tabs.${activity[0].toUpperCase()}${activity.slice(1)}`,
              activity
            )
          )
        ),
      finish: async (action) => {
        // Navigation is gated on the save, as the essence and system-details guards gate theirs.
        if (action === 'save') return await checks.saveChecks();
        if (action === 'discard' || action === true) {
          checks.discardChecksDrafts();
          return true;
        }
        return false;
      },
    },
    'system-edit': {
      active: () => activeView === 'system-edit',
      isDirty: () => systemDetailsDirty === true,
      confirm: () => store.confirmDiscardDirtySystemDetailsDraft?.(),
      finish: async (action) => {
        if (action === 'cancel' || action === false) return false;
        if (action === 'save') {
          const saved = await store.saveSystemDetails?.(
            systemDetailsDraft.name,
            systemDetailsDraft.description
          );
          return saved !== false;
        }
        // Discard: bump the reseed nonce so `SystemEditView` reverts its inputs to the persisted
        // values.
        systemDetailsDirty = false;
        systemDetailsReseedNonce += 1;
        return true;
      },
    },
  });

  function routeExitGuardFor(view) {
    return routeExitGuards.find((row) => row.view === view);
  }

  // Asked with no destination: the row's same-view skip is what the caller below has ruled out.
  function runSystemDetailsDiscardPrompt() {
    return runRouteExitGuard(routeExitGuardFor('system-edit'), '');
  }

  // Scope-select swaps the SYSTEM while keeping the view token, so the same-view skip above would
  // let a dirty identity draft through.
  function confirmSystemDetailsScopeChange(systemId) {
    if (activeView !== 'system-edit') return true;
    if (systemId === selectedSystemId || systemDetailsDirty !== true) return true;
    return runSystemDetailsDiscardPrompt();
  }

  /**
   * Ask a mounted companion whether the GM may leave the screen it is showing.
   *
   * @param {string} nextRouteId Destination Downtime tab id, when the caller states one.
   * @returns {undefined|boolean|Promise<boolean>} `undefined` when there is nothing to ask.
   */
  function confirmDowntimeCompanionNavigation(nextView, nextRouteId) {
    if (activeView !== 'world-downtime') return undefined;
    if (nextView === 'world-downtime' && (!nextRouteId || nextRouteId === worldDowntimeTabId))
      return undefined;
    return downtimeChromeChannel.confirmNavigation(nextView === 'world-downtime' ? 'tab' : 'route');
  }

  /** Core's own route-exit cascade, plus the Downtime host disposal that follows it. */
  function finishRouteExit(nextView, nextRouteId) {
    const result = confirmRouteExitGuards(routeExitGuards, nextView, nextRouteId);
    if (activeView !== 'world-downtime' || nextView === 'world-downtime') return result;

    // Keep the original route-guard promise identity.
    const disposeDowntime = (confirmed) => {
      if (confirmed !== false) downtimeExtensionHost?.disposeBeforeRemoval?.();
    };
    if (isPromise(result)) result.then(disposeDowntime);
    else disposeDowntime(result);
    return result;
  }

  // The companion is asked FIRST, and only about navigations that end its mount.
  function confirmRouteExit(nextView, nextRouteId = '') {
    const companion = confirmDowntimeCompanionNavigation(nextView, nextRouteId);
    // Returned UNTOUCHED, not wrapped: `afterTruthyResult` subscribes to this value immediately,
    // and wrapping it would put every existing route activation one microtask later.
    if (companion === undefined) return finishRouteExit(nextView, nextRouteId);
    if (isPromise(companion))
      return companion.then((allowed) =>
        allowed === false ? false : finishRouteExit(nextView, nextRouteId)
      );
    return companion === false ? false : finishRouteExit(nextView, nextRouteId);
  }

  function surfaceToolsSaveValidationError() {
    toolEditorActiveTab = 'validation';
    toolValidationFocusNonce += 1;
    notifyWarn(localize('FABRICATE.Admin.Manager.Tools.SaveBlockedInvalid'));
  }

  function setView(view) {
    if (
      (view === 'recipes' ||
        view === 'components' ||
        view === 'component-edit' ||
        view === 'tags' ||
        view === 'system-edit' ||
        view === 'tools' ||
        view === 'tool-edit' ||
        view === 'checks' ||
        isChecksView(view) ||
        view === 'knowledge') &&
      !selectedSystem
    )
      return;
    if (
      (view === 'environments' ||
        view === 'environment-edit' ||
        view === 'gathering-task-edit' ||
        view === 'gathering-event-edit') &&
      !canShowEnvironments
    )
      return;
    if ((view === 'essences' || view === 'essence-edit') && !canShowEssences) return;
    afterTruthyResult(confirmRouteExit(view), () => {
      activeView = view;
      if (view === 'tools') store?.cancelToolsDraft?.();
    });
  }

  function selectSystem(systemId, nextView = 'systems') {
    const runSelection = () => {
      const selected = store.selectSystem?.(systemId);
      if (isPromise(selected)) return selected.then((value) => value !== false);
      return selected !== false;
    };
    if (systemId === selectedSystemId) {
      const confirmed = confirmRouteExit(nextView);
      if (isPromise(confirmed))
        return confirmed.then((value) => (value === false ? false : runSelection()));
      if (confirmed === false) return false;
    }
    return runSelection();
  }

  // A per-record editor/detail view is bound to ONE system's record.
  const SCOPE_BROWSER_BY_VIEW = {
    'recipe-edit': 'recipes',
    'recipe-item-edit': 'books-scrolls',
    'component-edit': 'components',
    'essence-edit': 'essences',
    'tool-edit': 'tools',
  };

  function browserViewForScopeChange(view) {
    return SCOPE_BROWSER_BY_VIEW[view] || view;
  }

  // ---- Route-scoped library search clear (issue 1462) -----------------------------
  function searchScopeForView(view) {
    return browserViewForScopeChange(view);
  }

  let lastSearchScope = untrack(() => searchScopeForView(currentView));
  $effect(() => {
    const scope = searchScopeForView(currentView);
    if (scope === lastSearchScope) return;
    lastSearchScope = scope;
    store.clearLibrarySearches?.();
  });

  // Scope-select change: route to the corresponding browser for the new system, running the
  // dirty-exit guard first (the different-system path in selectSystem skips it).
  function changeScopeSystem(systemId) {
    if (!systemId) return;
    const target = browserViewForScopeChange(currentView);
    // The system-details guard skips same-view exits, so a `system-edit` scope swap
    // (same view token, different system) is guarded explicitly first.
    afterTruthyResult(confirmSystemDetailsScopeChange(systemId), () => {
      afterTruthyResult(confirmRouteExit(target), () => {
        const selected = store.selectSystem?.(systemId);
        const landed = isPromise(selected)
          ? selected.then((value) => value !== false)
          : selected !== false;
        afterTruthyResult(landed, () => {
          activeView = target;
        });
      });
    });
  }

  function selectSystemAndShowBrowser(systemId = selectedSystemId) {
    const selected = systemId ? selectSystem(systemId, 'systems') : confirmRouteExit('systems');
    afterTruthyResult(selected, () => {
      activeView = 'systems';
    });
  }

  // Open the System Overview page (`system-edit`) on a specific tab.
  function requestSystemTab(tab) {
    requestedSystemTab = tab === 'validation' ? 'validation' : 'settings';
    requestedSystemTabNonce += 1;
  }

  function editSystem(systemId) {
    if (!systemId) return;
    afterTruthyResult(selectSystem(systemId, 'system-edit'), () => {
      requestSystemTab('settings');
      activeView = 'system-edit';
    });
  }

  // Open the System Overview page on its Settings tab with the Modifiers section expanded and
  // scrolled to (issue 1117).
  function showSystemModifiers() {
    if (!selectedSystem) return;
    afterTruthyResult(confirmRouteExit('system-edit'), () => {
      requestSystemTab('settings');
      requestedSystemModifierSectionNonce += 1;
      activeView = 'system-edit';
    });
  }

  // The standalone overview route was folded into the System Overview page's Validation tab.
  function showSystemOverview() {
    if (!selectedSystem) return;
    afterTruthyResult(confirmRouteExit('system-edit'), () => {
      requestSystemTab('validation');
      activeView = 'system-edit';
    });
  }

  // Maps a system-validation issue `kind` to the manager's deep-link selection helper + the view it
  // routes to.
  const OVERVIEW_DEEP_LINKS = {
    recipe: {
      view: 'recipe-edit',
      targetId: (issue) => issue.entityId,
      open: (id) => editRecipe(id),
    },
    environment: {
      view: 'environment-edit',
      targetId: (issue) => issue.environmentId,
      open: (id) => drafts.editEnvironment(id),
    },
    task: {
      view: 'environment-edit',
      targetId: (issue) => issue.environmentId,
      open: (id) => drafts.editEnvironment(id),
    },
    event: {
      view: 'environment-edit',
      targetId: (issue) => issue.environmentId,
      open: (id) => drafts.editEnvironment(id),
    },
    salvage: {
      view: 'component-edit',
      targetId: (issue) => issue.entityId,
      open: (id) => editComponent(id),
    },
  };

  function selectOverviewIssue(issue) {
    if (!issue) return;
    const target = OVERVIEW_DEEP_LINKS[issue.kind];
    if (!target) return;
    const id = target.targetId(issue);
    if (!id) return;
    target.open(id);
  }

  // Activating the PARENT opens the group and routes to the first available child, which is
  // what makes the retained `checks` id a redirect rather than a dead route.
  function activateChecksParent() {
    navRail.expandGroup('checks');
    setView(resolveChecksRedirect(checks.checksNavArgs));
  }

  function backToSystemsBrowser() {
    afterTruthyResult(confirmRouteExit('systems'), () => {
      activeView = 'systems';
    });
  }

  function backToEnvironmentsBrowse() {
    afterTruthyResult(confirmRouteExit('environments'), () => {
      activeView = canShowEnvironments ? 'environments' : 'systems';
      if (canShowEnvironments) navRail.expandGroup('gathering');
    });
  }

  function backToEssencesBrowse() {
    afterTruthyResult(confirmRouteExit('essences'), () => {
      activeView = canShowEssences ? 'essences' : 'systems';
    });
  }

  function saveEnvironmentEdit() {
    store.saveEnvironmentDraft?.();
  }

  function essenceEditSaveLabel() {
    if (essenceEditSaving) return text('FABRICATE.Admin.Manager.Essence.Saving', 'Saving...');
    // `Save rules` on the rules screen, because that is what the screen holds: the identity the
    // word "essence" names is a world record this route cannot write.
    return essenceRulesMode
      ? text('FABRICATE.Admin.Manager.Essence.SaveRules', 'Save rules')
      : text('FABRICATE.Admin.Manager.Essence.Save', 'Save essence');
  }

  function selectRecipe(recipeId) {
    selectedRecipeId = recipeId;
  }

  // Deep PLAIN clone for the recipe draft + baseline.
  function cloneRecipeDraft(source) {
    return source ? JSON.parse(JSON.stringify(source)) : null;
  }

  // Stage an edit into the in-flight draft without persisting. Every editor handler
  // routes through here; Save commits the whole draft in one call.
  function patchRecipeDraft(patch) {
    if (!recipeDraft || !patch) return;
    recipeDraft = { ...recipeDraft, ...patch };
  }

  function editRecipe(recipeId = selectedRecipe?.id) {
    afterTruthyResult(confirmRouteExit('recipe-edit'), () => {
      selectedRecipeId = recipeId;
      recipeEditSaving = false;
      recipeSaveFailed = false;
      // Seed both draft and baseline from the persisted record (deep plain clones).
      const source = ($viewState.recipes || []).find((recipe) => recipe.id === recipeId) || null;
      recipeDraft = cloneRecipeDraft(source);
      recipeDraftBaseline = cloneRecipeDraft(source);
      activeView = 'recipe-edit';
    });
  }

  function clearRecipeDraft() {
    recipeDraft = null;
    recipeDraftBaseline = null;
    recipeSaveFailed = false;
  }

  function backToRecipesBrowse() {
    afterTruthyResult(confirmRouteExit('recipes'), () => {
      activeView = 'recipes';
    });
  }

  // Commit the staged draft in a single updateRecipe call. allowIncomplete keeps a shell's empty
  // ingredients/results from blocking the save.
  async function saveRecipeDraft() {
    if (recipeEditSaving) return false;
    if (!recipeDraft?.id) return false;
    recipeEditSaving = true;
    recipeSaveFailed = false;
    try {
      // notify:false — an editor save is the GM's own explicit action (the view
      // returns to the browser on success), so a "Recipe updated" toast is noise.
      const result = await store.updateRecipe?.(recipeDraft.id, recipeDraft, {
        allowIncomplete: true,
        notify: false,
      });
      if (result === false) {
        recipeSaveFailed = true;
        return false;
      }
      recipeDraftBaseline = cloneRecipeDraft(recipeDraft);
      activeView = 'recipes';
      return result;
    } catch {
      recipeSaveFailed = true;
      return false;
    } finally {
      recipeEditSaving = false;
    }
  }

  async function createRecipe() {
    if (!selectedSystemId) return;
    const created = await store.createRecipe?.();
    if (created?.id) editRecipe(created.id);
  }

  async function deleteRecipeFromEdit() {
    if (!selectedRecipeId || recipeEditSaving) return;
    const result = await store.deleteRecipe?.(selectedRecipeId);
    if (result === false) return; // cancelled or failed → stay in the editor
    clearRecipeDraft();
    activeView = 'recipes';
  }

  // The on/off toggle is the one immediate exception: enabling validates against the PERSISTED
  // recipe, so it commits straight away (no staging, no dirty).
  async function handleToggleRecipeEnabled() {
    if (!recipeDraft?.id) return;
    const next = recipeDraft.enabled === false;
    const ok = await store.toggleRecipeEnabled?.(recipeDraft.id, next);
    if (ok === false) return;
    recipeDraft = { ...recipeDraft, enabled: next };
    recipeDraftBaseline = recipeDraftBaseline
      ? { ...recipeDraftBaseline, enabled: next }
      : recipeDraftBaseline;
  }

  // Deep-link from the recipe editor's context rail to the Access screen, with THIS recipe
  // selected.
  function openRecipeAccess() {
    if (recipeDraft?.id) selectedRecipeIdForAccess = recipeDraft.id;
    openCraftingSection('access');
  }

  // Remove ONE book from this recipe's membership (issue 511 many-to-many) — used by the Books &
  // Scrolls tab's per-book unlink.
  async function handleRemoveRecipeItem(recipeItemId) {
    const rid = recipeDraft?.id;
    if (!rid || !recipeItemId) return false;
    const liveRecipe = ($viewState.recipes || []).find((r) => String(r?.id) === String(rid));
    // Function-local scratch, spread into a store call on the next line but never held in
    // state; the persisted value is the array, not the Set.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const membership = new Set((liveRecipe?.recipeItemIds || []).map((id) => String(id)));
    membership.delete(String(recipeItemId));
    await store.setRecipeBookMembership?.(rid, [...membership]);
    const updated = ($viewState.recipes || []).find((r) => String(r?.id) === String(rid));
    if (updated) {
      const patch = {
        recipeItemId: updated.recipeItemId || '',
        recipeItemIds: Array.isArray(updated.recipeItemIds) ? updated.recipeItemIds : [],
      };
      if (recipeDraft) recipeDraft = { ...recipeDraft, ...patch };
      if (recipeDraftBaseline) recipeDraftBaseline = { ...recipeDraftBaseline, ...patch };
    }
    return true;
  }

  function handleSetRecipeCategory(category) {
    patchRecipeDraft({ category });
    return true;
  }

  // Enter multi-step: seed Step 1 from the draft's current top-level ingredients / results / tools
  // so an already-craftable recipe stays craftable (the engine only falls back to top-level fields
  // when the steps array is empty).
  function newStepId() {
    return (
      globalThis.foundry?.utils?.randomID?.() || `step-${Math.random().toString(36).slice(2, 10)}`
    );
  }

  function handleEnterMultiStep() {
    if (!recipeDraft) return false;
    const seeded = {
      id: newStepId(),
      name: `${text('FABRICATE.Admin.Manager.Recipe.StepLabel', 'Step')} 1`,
      description: '',
      ingredientSets: recipeDraft.ingredientSets || [],
      resultGroups: recipeDraft.resultGroups || [],
      toolIds: recipeDraft.toolIds || [],
    };
    patchRecipeDraft({ steps: [seeded] });
    return true;
  }

  // Reverting multi-step → single-step discards the per-step authoring, so warn
  // before staging the empty steps array (engine falls back to top-level fields).
  async function handleRevertToSingleStep() {
    if (!recipeDraft) return false;
    const name =
      String(recipeDraft.name || '').trim() ||
      text('FABRICATE.Admin.Manager.Recipe.UnnamedRecipe', 'this recipe');
    const confirmed = await store.confirmRecipeAction?.({
      title: localize('FABRICATE.Admin.Manager.Recipe.RevertToSingleStepTitle'),
      content: localize('FABRICATE.Admin.Manager.Recipe.RevertToSingleStepContent', { name }),
      confirmLabel: localize('FABRICATE.Admin.Manager.Recipe.RevertToSingleStepConfirm'),
    });
    if (!confirmed) return false;
    patchRecipeDraft({ steps: [] });
    return true;
  }

  function currentSteps() {
    return Array.isArray(recipeDraft?.steps) ? [...recipeDraft.steps] : [];
  }

  // Locking persists immediately (like enable) and is NEVER gated in either direction — a GM locks
  // a recipe precisely while it is unfinished.
  async function handleToggleRecipeLocked(next) {
    if (!recipeDraft?.id) return;
    const ok = await store.toggleRecipeLocked?.(recipeDraft.id, next === true);
    if (ok === false) return;
    recipeDraft = { ...recipeDraft, locked: next === true };
    recipeDraftBaseline = recipeDraftBaseline
      ? { ...recipeDraftBaseline, locked: next === true }
      : recipeDraftBaseline;
  }

  function handleAddStep() {
    if (!recipeDraft) return false;
    const steps = currentSteps();
    steps.push({
      id: newStepId(),
      name: `${text('FABRICATE.Admin.Manager.Recipe.StepLabel', 'Step')} ${steps.length + 1}`,
      description: '',
    });
    patchRecipeDraft({ steps });
    return true;
  }

  function handleReorderSteps(from, to) {
    if (!recipeDraft) return false;
    const steps = currentSteps();
    if (from < 0 || to < 0 || from >= steps.length || to >= steps.length || from === to)
      return false;
    const [moved] = steps.splice(from, 1);
    steps.splice(to, 0, moved);
    patchRecipeDraft({ steps });
    return true;
  }

  function handleUpdateStep(stepId, patch) {
    if (!recipeDraft || !patch) return false;
    const steps = currentSteps().map((step) => (step.id === stepId ? { ...step, ...patch } : step));
    patchRecipeDraft({ steps });
    return true;
  }

  // Deleting a step removes the whole step (its ingredients, results, and tools).
  async function handleDeleteStep(stepId, context = 'overview') {
    if (!recipeDraft) return false;
    const steps = currentSteps();
    const step = steps.find((entry) => entry?.id === stepId);
    if (!step) return false;
    const name =
      String(step.name || '').trim() ||
      text('FABRICATE.Admin.Manager.Recipe.UnnamedStep', 'this step');
    const alsoDeleted = localize(
      {
        ingredients: 'FABRICATE.Admin.Manager.Recipe.DeleteStepAlsoIngredients',
        results: 'FABRICATE.Admin.Manager.Recipe.DeleteStepAlsoResults',
        tools: 'FABRICATE.Admin.Manager.Recipe.DeleteStepAlsoTools',
      }[context] || 'FABRICATE.Admin.Manager.Recipe.DeleteStepAlsoAll'
    );
    const confirmed = await store.confirmRecipeAction?.({
      title: localize('FABRICATE.Admin.Manager.Recipe.DeleteStepTitle'),
      content: localize('FABRICATE.Admin.Manager.Recipe.DeleteStepContent', { name, alsoDeleted }),
      confirmLabel: localize('FABRICATE.Admin.Manager.Recipe.DeleteStep'),
    });
    if (!confirmed) return false;
    patchRecipeDraft({ steps: steps.filter((entry) => entry?.id !== stepId) });
    return true;
  }

  function recipeEditSaveLabel() {
    if (recipeEditSaving) return text('FABRICATE.Admin.Manager.Recipe.Saving', 'Saving...');
    return text('FABRICATE.Admin.Manager.Recipe.Save', 'Save recipe');
  }

  function selectComponent(componentId) {
    selectedComponentId = componentId;
  }

  function selectEssence(essenceId) {
    selectedEssenceId = essenceId;
  }

  function editEssence(essenceId = selectedEssence?.id) {
    if (!essenceId || !canShowEssences) return;
    if (currentView === 'essence-edit' && essenceId === selectedEssenceId) return;
    // The target id is what lets the essence guard tell "re-entering this editor" from "switching
    // to a different essence"; without it the guard would skip the discard prompt for the switch.
    afterTruthyResult(confirmRouteExit('essence-edit', essenceId), () => {
      selectedEssenceId = essenceId;
      essenceEditDirty = false;
      essenceEditDraft = null;
      activeView = 'essence-edit';
    });
  }

  function selectSystemRow(systemId) {
    if (!systemId) return;
    selectSystem(systemId);
  }

  // A newly created system is already SELECTED by the store, but the GM was left on the systems
  // library looking at a list — one more click from the thing they just asked for.
  function createSystem() {
    afterTruthyResult(store.createSystem?.(), () => {
      requestSystemTab('settings');
      activeView = 'system-edit';
    });
  }

  function exportSystem(systemId = selectedSystemId) {
    if (!systemId) return;
    store.exportSystem?.(systemId);
  }

  function deleteSystem(systemId = selectedSystemId) {
    if (!systemId) return;
    store.deleteSystem?.(systemId);
  }

  function duplicateRecipe(recipeId = selectedRecipe?.id) {
    if (!recipeId) return;
    store.duplicateRecipe?.(recipeId);
  }

  function deleteRecipe(recipeId = selectedRecipe?.id) {
    if (!recipeId) return;
    store.deleteRecipe?.(recipeId);
  }

  // Enabling is GATED: an incomplete recipe (or one with a conflicting signature) is refused.
  function toggleRecipeEnabled(recipeId, enabled, options) {
    store.toggleRecipeEnabled?.(recipeId, enabled, options);
  }

  function editComponent(itemId = selectedComponent?.id) {
    if (!itemId || !selectedSystem) return;
    if (currentView === 'component-edit' && itemId === selectedComponentId) return;
    afterTruthyResult(confirmRouteExit('component-edit'), () => {
      selectedComponentId = itemId;
      componentEditDirty = false;
      componentEditDraft = null;
      // Seed the staged difficulty from the component's persisted value so the
      // right-inspector input opens in sync and starts clean.
      const entryItem = itemCards.find((item) => String(item.id) === String(itemId));
      componentDifficultyDraft = normalizeComponentDifficulty(entryItem?.difficulty);
      activeView = 'component-edit';
    });
  }

  function backToComponentsBrowse() {
    afterTruthyResult(confirmRouteExit('components'), () => {
      activeView = 'components';
    });
  }

  // The salvage DC control's "Manage presets" deep link (issue 676, decision 7).
  function openSalvageCheckPresets() {
    setView('checks');
  }

  function handleComponentDraftChange(draft) {
    componentEditDraft = draft || null;
    componentEditDirty = draft?.dirty === true;
  }

  async function saveComponentEdit(itemId, updates, { baseline } = {}) {
    if (componentEditSaving || !itemId) return false;
    componentEditSaving = true;
    try {
      // Fold the staged progressive-difficulty value into the same update so it
      // persists through the editor's Save flow (only when the difficulty input
      // is shown for this progressive system).
      const merged = componentDifficultyShown
        ? { ...(updates || {}), difficulty: normalizeComponentDifficulty(componentDifficultyDraft) }
        : updates;
      // AND THE BASELINE THE EDITOR DREW TRAVELS WITH IT (issue 1371 r22-store4, the Foundry
      // integrator's round-8 finding 1).
      const result = await store.updateComponent?.(itemId, merged, { baseline });
      if (result === false) return false;
      componentEditDirty = false;
      componentEditDraft = null;
      activeView = 'components';
      return true;
    } catch {
      return false;
    } finally {
      componentEditSaving = false;
    }
  }

  function replaceComponentSource(itemId, data) {
    if (!itemId) return;
    services?.onReplaceSource?.(itemId, data);
  }

  // Coerce a raw difficulty value to the persisted shape: an integer >= 1, or null (cleared) for
  // blank / sub-1 / non-integer / invalid input.
  function normalizeComponentDifficulty(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const numeric = Math.trunc(Number(value));
    return Number.isFinite(numeric) && numeric >= 1 ? numeric : null;
  }

  // Stage a progressive-difficulty edit from the right inspector.
  function stageComponentDifficulty(value) {
    componentDifficultyDraft = value;
  }

  function unlinkComponentSource(itemId = selectedComponent?.id) {
    if (!itemId) return;
    services?.onUnlinkSource?.(itemId);
  }

  function openComponentSource(uuid = selectedComponent?.registeredItemUuidDisplay) {
    if (!uuid) return;
    services?.onOpenSource?.(uuid);
  }

  function componentEditSaveLabel() {
    if (componentEditSaving) return text('FABRICATE.Admin.Manager.Component.Saving', 'Saving...');
    // `Save rules`, per the reference (gap-list row 126): this editor saves ONE SYSTEM'S rules
    // for a component whose identity is saved somewhere else entirely.
    return text('FABRICATE.Admin.Manager.Component.SaveRules', 'Save rules');
  }

  function deleteComponent(itemId = selectedComponent?.id) {
    if (!itemId) return;
    store.deleteComponent?.(itemId);
  }

  // ── EMPTYING A BULK SELECTION (issue 1157) ───────────────────────────────────────
  let bulkSelectionAnnouncement = $state(null);
  // Orders the deferred announcements below against each other; see
  // `announceBulkSelectionEmptied`. Plain, not `$state`: nothing renders it.
  let bulkAnnouncementTicket = 0;

  // The focus target: the studio's TOOLBAR — the `<section>` holding the filter rows and, as its
  // last row, the selection register.
  const BULK_SELECTION_TOOLBAR = {
    components: 'data-component-toolbar',
    essences: 'data-essence-toolbar',
    recipes: 'data-recipe-toolbar',
  };

  function selectionClearedAnnouncement() {
    return text('FABRICATE.Admin.Manager.BulkEdit.SelectionCleared', 'Selection cleared.');
  }

  /**
   * Put the keyboard back on `studio`'s toolbar, and report whether it actually moved.
   *
   * @returns {boolean} true only when focus was moved, which is what decides whether the
   * announcement has a focus utterance to queue behind.
   */
  function focusBulkSelectionToolbar(studio) {
    if (typeof document === 'undefined') return false;
    const attribute = BULK_SELECTION_TOOLBAR[studio];
    if (!attribute) return false;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected !== false) return false;
    const node = document.querySelector(`.fabricate-manager [${attribute}]`);
    if (!node || node.isConnected === false) return false;
    node.focus?.();
    return document.activeElement === node;
  }

  /**
   * Report an emptied bulk selection: put the keyboard back on `studio`'s toolbar and announce
   * `message` through the manager's region, IN THAT ORDER.
   */
  function announceBulkSelectionEmptied(studio, message) {
    const spoken = String(message || '');
    // The ticket is what the delay costs: a sentence still waiting must never land on top of one
    // asked for after it.
    bulkAnnouncementTicket += 1;
    const ticket = bulkAnnouncementTicket;
    announceAfterFocusMove(
      () => focusBulkSelectionToolbar(studio),
      () => {
        if (ticket !== bulkAnnouncementTicket) return;
        bulkSelectionAnnouncement = { text: spoken };
      }
    );
  }

  // ── Bulk edit (issue 772) ──────────────────────────────────────────────────────── The panel
  // stages into a draft this root owns; NOTHING is written until Apply.
  function stageComponentBulkDraft(next) {
    componentBulkDraft = next || createComponentBulkDraft();
  }

  async function applyComponentBulkEdit() {
    if (componentBulkApplying) return false;
    const ids = componentBulk.ids;
    if (ids.size === 0) return false;
    // An unstaged axis is never sent.
    const edit = toBulkComponentEdit(componentBulkDraft);
    if (Object.keys(edit).length === 0) return false;
    componentBulkApplying = true;
    try {
      // The store returns the write RESULT, never a bare boolean, so a `null` covers every no-write
      // case in one test.
      const result = await store.applyComponentBulkEdit?.(ids, edit);
      if (!result) return false;
      // The count the GM is told is the count that actually CHANGED, not the count they ticked: the
      // write primitive compares each component before and after.
      const count = result.updated;
      const message = componentBulkAppliedMessage(count);
      // One `save()` and one `refresh()` happened inside the store action, so the rows are already
      // re-rendering.
      componentBulk.clear(message);
      notifyInfo(message);
      return true;
    } finally {
      componentBulkApplying = false;
    }
  }

  // Singular, on the same terms as the panel's own heading and Apply label: the threshold is `> 0`,
  // so ONE ticked row is the advertised case.
  function componentBulkAppliedMessage(count) {
    if (count === 0) {
      return text(
        'FABRICATE.Admin.Manager.Component.BulkEdit.AppliedNone',
        'No components needed changing.'
      );
    }
    if (count === 1) {
      return text(
        'FABRICATE.Admin.Manager.Component.BulkEdit.AppliedOne',
        'Applied bulk changes to 1 component.'
      );
    }
    return text(
      'FABRICATE.Admin.Manager.Component.BulkEdit.Applied',
      'Applied bulk changes to {count} components.'
    ).replace('{count}', count);
  }

  // The ARMED bulk delete's confirm step (issue 1129).
  async function deleteSelectedComponents(ids) {
    if (componentBulkDeleting) return false;
    const targets = Array.isArray(ids) ? ids : [];
    if (targets.length === 0) return false;
    componentBulkDeleting = true;
    try {
      const result = await store.deleteComponents?.(targets);
      // A FAILED write returns the store's zero result, which is an OBJECT and therefore truthy.
      const deleted = Number(result?.deleted) || 0;
      if (deleted === 0) {
        // The card SURVIVES this path, so it is the one place the outcome can be spoken and the one
        // control focus can be returned to.
        componentBulkDeleteOutcome = text(
          'FABRICATE.Admin.Manager.BulkEdit.DeleteNoneDeleted',
          'Nothing was deleted. The selection is unchanged.'
        );
        return false;
      }
      const message = componentBulkDeletedMessage(result);
      componentBulk.clear(message);
      notifyInfo(message);
      return true;
    } catch (err) {
      // The store catches its own write failures, so reaching here means the failure was elsewhere.
      console.error('Fabricate | Failed to delete the selected components:', err);
      return false;
    } finally {
      // Both live here so the comment above stays true on EVERY exit.
      componentBulkDeleteArmed = false;
      componentBulkDeleting = false;
    }
  }

  // `recipesDisabled` is the most consequential outcome of the three — recipes the GM's players
  // could craft this morning and cannot craft now.
  function componentBulkDeletedMessage(result) {
    const disabled = Number(result?.recipesDisabled) || 0;
    const template =
      disabled > 0
        ? text(
            'FABRICATE.Admin.Manager.Component.BulkEdit.DeletedWithDisabled',
            'Deleted {count} component(s) and rewrote {recipes} recipe(s), disabling {disabled} of them.'
          )
        : text(
            'FABRICATE.Admin.Manager.Component.BulkEdit.Deleted',
            'Deleted {count} component(s) and rewrote {recipes} recipe(s).'
          );
    return template
      .replace('{count}', Number(result?.deleted) || 0)
      .replace('{recipes}', Number(result?.recipesUpdated) || 0)
      .replace('{disabled}', disabled);
  }

  // ── Recipe bulk edit (issue 1010) ──────────────────────────────────────────────── The twin of
  // the block above.
  function stageRecipeBulkDraft(next) {
    recipeBulkDraft = next || createRecipeBulkDraft();
  }

  // Singular / plural over one count, so the three post-apply sentences below do not each
  // grow their own ternary pair.
  function bulkRecipeCountText(count, oneKey, oneFallback, manyKey, manyFallback) {
    if (count === 1) return text(oneKey, oneFallback);
    return text(manyKey, manyFallback).replace('{count}', count);
  }

  // The book half of the post-apply report, reporting membership EDGES rather than the DEFINITIONS
  // `booksUpdated` counts: the GM asked to put these recipes in that book.
  function recipeBulkBooksMessage(result) {
    const added = Number(result?.bookAdditions) || 0;
    const removed = Number(result?.bookRemovals) || 0;
    if (added === 0 && removed === 0) return '';

    const addedText = bulkRecipeCountText(
      added,
      'FABRICATE.Admin.Manager.Recipe.BulkEdit.AppliedBookAdditionsOne',
      '1 addition',
      'FABRICATE.Admin.Manager.Recipe.BulkEdit.AppliedBookAdditions',
      '{count} additions'
    );
    const removedText = bulkRecipeCountText(
      removed,
      'FABRICATE.Admin.Manager.Recipe.BulkEdit.AppliedBookRemovalsOne',
      '1 removal',
      'FABRICATE.Admin.Manager.Recipe.BulkEdit.AppliedBookRemovals',
      '{count} removals'
    );
    // Three WHOLE sentences rather than one assembled around a localized " and ": a join word is
    // the part of this string a translator is least able to place.
    if (added > 0 && removed > 0) {
      return text(
        'FABRICATE.Admin.Manager.Recipe.BulkEdit.AppliedBooksBoth',
        'Books & scrolls updated — {added} and {removed}.'
      )
        .replace('{added}', addedText)
        .replace('{removed}', removedText);
    }
    if (added > 0) {
      return text(
        'FABRICATE.Admin.Manager.Recipe.BulkEdit.AppliedBooksAdded',
        'Books & scrolls updated — {added}.'
      ).replace('{added}', addedText);
    }
    return text(
      'FABRICATE.Admin.Manager.Recipe.BulkEdit.AppliedBooksRemoved',
      'Books & scrolls updated — {removed}.'
    ).replace('{removed}', removedText);
  }

  // The post-apply report, and the AUTHORITY on the blocked count — the panel's pre-flight figure
  // is only a lower bound, because it cannot see collisions the batch itself creates.
  function recipeBulkAppliedMessage(result) {
    const updated = Number(result?.updated) || 0;
    const blocked = Number(result?.blockedEnables) || 0;
    const rejected = Number(result?.rejected) || 0;
    const books = recipeBulkBooksMessage(result);
    // Zero is its own message rather than "applied to 0 recipes", which reads as a failure for what
    // is a legitimate outcome — every selected recipe already matched.
    const sentences = [];
    if (updated === 0 && !books) {
      sentences.push(
        text('FABRICATE.Admin.Manager.Recipe.BulkEdit.AppliedNone', 'No recipes needed changing.')
      );
    } else if (updated > 0) {
      sentences.push(
        bulkRecipeCountText(
          updated,
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.AppliedOne',
          'Applied bulk changes to 1 recipe.',
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.Applied',
          'Applied bulk changes to {count} recipes.'
        )
      );
    }
    if (books) sentences.push(books);
    if (blocked > 0) {
      sentences.push(
        bulkRecipeCountText(
          blocked,
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.AppliedBlockedOne',
          "1 recipe couldn't be enabled yet.",
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.AppliedBlocked',
          "{count} recipes couldn't be enabled yet."
        )
      );
    }
    if (rejected > 0) {
      sentences.push(
        bulkRecipeCountText(
          rejected,
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.AppliedRejectedOne',
          "1 recipe couldn't be saved — see the console.",
          'FABRICATE.Admin.Manager.Recipe.BulkEdit.AppliedRejected',
          "{count} recipes couldn't be saved — see the console."
        )
      );
    }
    return sentences.join(' ');
  }

  // The ARMED bulk delete's confirm step (issue 1132).
  function armRecipeBulkDelete() {
    recipeBulkDeleteOutcome = '';
    recipeBulkDeleteArmed = true;
  }

  // The two twins. Arming clears the previous outcome for the reason above: a live region
  // that is handed identical text a second time says nothing the second time.
  function armComponentBulkDelete() {
    componentBulkDeleteOutcome = '';
    componentBulkDeleteArmed = true;
  }

  function armEssenceBulkDelete() {
    essenceBulkDeleteOutcome = '';
    essenceBulkDeleteArmed = true;
  }

  async function deleteSelectedRecipes(ids) {
    if (recipeBulkDeleting) return false;
    const targets = Array.isArray(ids) ? ids : [];
    if (targets.length === 0) return false;
    recipeBulkDeleting = true;
    try {
      const result = await store.deleteRecipes?.(targets);
      // A FAILED write returns the store's zero result, which is an OBJECT and therefore truthy.
      const deleted = Number(result?.deleted) || 0;
      if (deleted === 0) {
        // The card survives this path, so the outcome is announced through the card's own live
        // region and focus goes back to the control.
        recipeBulkDeleteOutcome = text(
          'FABRICATE.Admin.Manager.BulkEdit.DeleteNoneDeleted',
          'Nothing was deleted. The selection is unchanged.'
        );
        return false;
      }
      const message = recipeBulkDeletedMessage(result);
      recipeBulk.clear(message);
      notifyInfo(message);
      return true;
    } catch (err) {
      // The store catches its own write failures, so reaching here means the failure was elsewhere.
      console.error('Fabricate | Failed to delete the selected recipes:', err);
      recipeBulkDeleteOutcome = text(
        'FABRICATE.Admin.Manager.Recipe.BulkEdit.DeleteFailed',
        'Failed to delete the selected recipes.'
      );
      return false;
    } finally {
      // Both live here so the paragraph above stays true on EVERY exit.
      recipeBulkDeleteArmed = false;
      recipeBulkDeleting = false;
    }
  }

  // The post-delete report, and the only feedback that survives the panel unmounting on a
  // successful delete.
  function recipeBulkDeletedMessage(result) {
    const count = Number(result?.deleted) || 0;
    const items = Number(result?.recipeItemsAffected) || 0;
    const learners = Number(result?.learnersAffected) || 0;
    let template;
    if (items > 0 && learners > 0) {
      template = text(
        'FABRICATE.Admin.Manager.Recipe.BulkEdit.DeletedWithItemsAndLearners',
        'Deleted {count} recipe(s), removed them from {items} of your books & scrolls, and {learners} character(s) forgot them.'
      );
    } else if (items > 0) {
      template = text(
        'FABRICATE.Admin.Manager.Recipe.BulkEdit.DeletedWithItems',
        'Deleted {count} recipe(s) and removed them from {items} of your books & scrolls.'
      );
    } else if (learners > 0) {
      template = text(
        'FABRICATE.Admin.Manager.Recipe.BulkEdit.DeletedWithLearners',
        'Deleted {count} recipe(s); {learners} character(s) forgot them.'
      );
    } else {
      template = text(
        'FABRICATE.Admin.Manager.Recipe.BulkEdit.Deleted',
        'Deleted {count} recipe(s).'
      );
    }
    return template
      .replace('{count}', count)
      .replace('{items}', items)
      .replace('{learners}', learners);
  }

  async function applyRecipeBulkEdit() {
    if (recipeBulkApplying) return false;
    const ids = recipeBulk.ids;
    if (ids.size === 0) return false;
    // An unstaged axis is never sent.
    const edit = toBulkRecipeEdit(recipeBulkDraft);
    if (Object.keys(edit).length === 0) return false;
    recipeBulkApplying = true;
    try {
      // The store returns the write RESULT, never a bare boolean, so a `null` covers every no-write
      // case in one test.
      const result = await store.applyRecipeBulkEdit?.(ids, edit);
      if (!result) return false;
      // One save and one refresh happened inside the store action, so the rows are already
      // re-rendering.
      const message = recipeBulkAppliedMessage(result);
      recipeBulk.clear(message);
      notifyInfo(message);
      return true;
    } finally {
      recipeBulkApplying = false;
    }
  }

  function addCategory(value, icon) {
    if (!selectedSystemId) return;
    return store.addCategory?.(value, icon);
  }

  function removeCategory(category) {
    if (!selectedSystemId) return;
    return store.removeCategory?.(category);
  }

  function setCategoryIcon(name, icon) {
    if (!selectedSystemId) return;
    return store.setCategoryIcon?.(name, icon);
  }

  function addComponentCategory(value, icon) {
    if (!selectedSystemId) return;
    return store.addComponentCategory?.(value, icon);
  }

  function removeComponentCategory(category) {
    if (!selectedSystemId) return;
    return store.removeComponentCategory?.(category);
  }

  function setComponentCategoryIcon(name, icon) {
    if (!selectedSystemId) return;
    return store.setComponentCategoryIcon?.(name, icon);
  }

  function addTag(value) {
    if (!selectedSystemId) return;
    return store.addTag?.(value);
  }

  function removeTag(tag) {
    if (!selectedSystemId) return;
    return store.removeTag?.(tag);
  }

  async function saveEssenceEdit(essenceId, updates) {
    if (essenceEditSaving) return false;
    essenceEditSaving = true;
    try {
      const result = essenceId
        ? await store.updateEssence?.(essenceId, updates)
        : await store.addEssence?.(
            updates.name,
            updates.description,
            updates.icon,
            showEssenceSourceUi ? updates.sourceComponentId || null : null,
            // The authored colour (issue 917) has to travel with the create call too, or a
            // new essence loses the colour the GM picked before its first save.
            updates.colorToken || null,
            // …and so do the two fields issue 1036 added, for exactly the same reason: the editor
            // can author both BEFORE the first save.
            {
              enabled: updates.enabled !== false,
              ...(showEssencePropertyMacroUi
                ? { propertyMacroUuid: updates.propertyMacroUuid || null }
                : {}),
            }
          );
      if (result === false) return false;
      essenceEditDirty = false;
      essenceEditDraft = null;
      activeView = canShowEssences ? 'essences' : 'systems';
      return result;
    } catch {
      return false;
    } finally {
      essenceEditSaving = false;
    }
  }

  function cancelEssenceEdit() {
    afterTruthyResult(confirmRouteExit('essences'), () => {
      // A clean draft never reaches the essence row's finisher, so this is its only such call.
      store.cancelEssenceDraft?.();
      activeView = canShowEssences ? 'essences' : 'systems';
    });
  }

  function handleEssenceDraftChange(draft) {
    essenceEditDraft = draft || null;
    essenceEditDirty = draft?.dirty === true;
  }

  function removeEssence(essenceId = selectedEssence?.id) {
    if (!essenceId) return;
    // `deleteEssence` (issue 1036) — the store's singular delete, renamed from `removeEssence` so
    // it pairs with the new `deleteEssences` set delete.
    store.deleteEssence?.(essenceId);
  }

  function importEssenceSourceDrop(data) {
    return services?.importSingleManagedItemFromDrop?.(data) ?? null;
  }

  async function updateSelectedEssenceSource(sourceComponentId) {
    if (!selectedEssenceForInspector?.id || currentView === 'essence-edit') return false;
    return store.updateEssence?.(selectedEssenceForInspector.id, { sourceComponentId });
  }

  async function handleInspectorEssenceSourceDrop(data) {
    const item = await importEssenceSourceDrop(data);
    if (!item?.id) return false;
    return updateSelectedEssenceSource(item.id);
  }

  function handleInspectorEssenceSourceSelect(itemId) {
    return updateSelectedEssenceSource(itemId || null);
  }

  function unlinkSelectedEssenceSource() {
    return updateSelectedEssenceSource(null);
  }

  // ── Essence library actions (issue 1036) ─────────────────────────────────────────

  // The row's enable switch.
  function toggleEssenceEnabled(essenceId, enabled) {
    if (!essenceId) return;
    store.setEssenceEnabled?.(essenceId, enabled === true);
  }

  // ── Essence bulk edit (issue 1036) ─────────────────────────────────────────────── The panel
  // stages into a draft this root owns; NOTHING is written until Apply.
  function stageEssenceBulkDraft(next) {
    essenceBulkDraft = next || createEssenceBulkDraft();
  }

  async function applyEssenceBulkEdit() {
    if (essenceBulkApplying) return false;
    const ids = essenceBulk.ids;
    if (ids.size === 0) return false;
    // An unstaged axis is never sent.
    const edit = toBulkEssenceEdit(essenceBulkDraft);
    if (Object.keys(edit).length === 0) return false;
    essenceBulkApplying = true;
    try {
      const result = await store.applyEssenceBulkEdit?.(ids, edit);
      if (!result) return false;
      const message = essenceBulkAppliedMessage(Number(result.updated) || 0);
      essenceBulk.clear(message);
      notifyInfo(message);
      return true;
    } finally {
      essenceBulkApplying = false;
    }
  }

  // The third of the three apply reports, on the same terms as its two siblings.
  function essenceBulkAppliedMessage(count) {
    if (count === 0) {
      return text(
        'FABRICATE.Admin.Manager.Essence.BulkEdit.AppliedNone',
        'No essences needed changing.'
      );
    }
    if (count === 1) {
      return text('FABRICATE.Admin.Manager.Essence.BulkEdit.AppliedOne', 'Updated 1 essence.');
    }
    return text(
      'FABRICATE.Admin.Manager.Essence.BulkEdit.Applied',
      'Updated {count} essences.'
    ).replace('{count}', count);
  }

  // The ARMED bulk delete's confirm step.
  async function deleteSelectedEssences(ids) {
    if (essenceBulkDeleting) return false;
    const targets = Array.isArray(ids) ? ids : [];
    if (targets.length === 0) return false;
    essenceBulkDeleting = true;
    try {
      const result = await store.deleteEssences?.(targets);
      // A FAILED write returns the store's zero result, which is an OBJECT and therefore truthy.
      const deleted = Number(result?.deleted) || 0;
      if (deleted === 0) {
        // The twin of the component branch above, and for the same reason: the card survives
        // a delete that reached nothing, so this is the only surface that can say so.
        essenceBulkDeleteOutcome = text(
          'FABRICATE.Admin.Manager.BulkEdit.DeleteNoneDeleted',
          'Nothing was deleted. The selection is unchanged.'
        );
        return false;
      }
      const message = essenceBulkDeletedMessage(result);
      essenceBulk.clear(message);
      notifyInfo(message);
      return true;
    } catch (err) {
      // The store catches its own write failures, so reaching here means the failure was elsewhere.
      console.error('Fabricate | Failed to delete the selected essences:', err);
      return false;
    } finally {
      // The disarm lives HERE rather than in the `try` after the await: a rejection would
      // otherwise skip it and leave an armed button that deletes on the next single click.
      essenceBulkDeleteArmed = false;
      essenceBulkDeleting = false;
    }
  }

  // `recipesDisabled` is the most consequential outcome of the three — recipes the GM's players
  // could craft this morning and cannot craft now.
  function essenceBulkDeletedMessage(result) {
    const disabled = Number(result?.recipesDisabled) || 0;
    const template =
      disabled > 0
        ? text(
            'FABRICATE.Admin.Manager.Essence.BulkEdit.DeletedWithDisabled',
            'Deleted {count} essence(s) and rewrote {recipes} recipe(s), disabling {disabled} of them.'
          )
        : text(
            'FABRICATE.Admin.Manager.Essence.BulkEdit.Deleted',
            'Deleted {count} essence(s) and rewrote {recipes} recipe(s).'
          );
    return template
      .replace('{count}', Number(result?.deleted) || 0)
      .replace('{recipes}', Number(result?.recipesUpdated) || 0)
      .replace('{disabled}', disabled);
  }

  /**
   * The world Tool that ALREADY names `uuid` as its source Item, or `null`.
   *
   * @returns {object|null} The world scope entry, or `null` when no record names that Item.
   */
  function worldToolForSourceItem(uuid) {
    const needle = String(uuid ?? '').trim();
    if (!needle) return null;
    return (
      (worldScopeState.tool?.entries ?? []).find((entry) =>
        getItemMatchUuids(entry?.entity).includes(needle)
      ) ?? null
    );
  }

  /** Create a WORLD Tool from an Item dropped on the world Tools Catalogue, and open its entry. */
  async function createWorldToolFromItemDrop(data) {
    if (!data) return false;
    const uuid = resolveDropUuid(data);
    if (!uuid) return false;
    const source = await services?.resolveToolSource?.(uuid);
    if (!source) return false;
    const sourceUuid = source.uuid || uuid;
    const existing = worldToolForSourceItem(sourceUuid);
    if (existing) {
      notifyInfo(existingWorldToolMessage(existing));
      openWorldScopedEntry('world-tool-entry', existing.id);
      return true;
    }
    const entityId = String(store?.randomID?.() || '');
    if (!entityId) return false;
    const created = await store?.worldScope?.tool?.createEntity?.({
      id: entityId,
      name: source.name || '',
      img: source.img || '',
      description: source.description || '',
      originItemUuid: sourceUuid,
      registeredItemUuid: sourceUuid,
    });
    if (created !== true) return false;
    // CHAINED, so the drop lands the GM on the record it just made rather than on a list they
    // then have to find it in. Routed through the same guard every other entry navigation uses.
    openWorldScopedEntry('world-tool-entry', entityId);
    return true;
  }

  /** What a GM is told when their drop landed on a world Tool that already existed. */
  function existingWorldToolMessage(entry) {
    const name = String(entry?.entity?.name || entry?.id || '');
    // BOTH KEYS ARE WRITTEN OUT WHOLE rather than composed from a suffix.
    const message =
      entry?.worldEnabled === false
        ? text(
            'FABRICATE.Admin.Manager.Scoped.Tool.DropExistingDisabled',
            '{name} already exists for that Item and is disabled at world scope. Opened it instead of creating a second.'
          )
        : text(
            'FABRICATE.Admin.Manager.Scoped.Tool.DropExisting',
            '{name} already exists for that Item. Opened it instead of creating a second.'
          );
    return message.replace('{name}', name);
  }

  /** RE-POINT a world Tool at another world Item. */
  /** The actors the world Tool entry's `Preview as` region offers. */
  const worldToolPreviewActors = $derived(
    currentView === 'world-tool-entry'
      ? ($viewState.actorOptions || [])
          .filter((actor) => actor?.uuid && actor.isPlayerCharacter === true)
          .map((actor) => ({
            id: String(actor.uuid),
            name: String(actor.name ?? actor.uuid),
            img: typeof actor.img === 'string' ? actor.img : '',
          }))
      : []
  );

  /** ONE actor's prepared roll data, for resolving a Tool's world-default prerequisites. */
  function worldToolPreviewRollData(actorUuid) {
    if (!actorUuid) return null;
    return store?.getActorRollData?.(actorUuid) ?? null;
  }

  async function relinkWorldToolSource(data) {
    const entityId = worldScopedEntryId;
    if (!entityId || !data) return false;
    const uuid = resolveDropUuid(data);
    if (!uuid) return false;
    const source = await services?.resolveToolSource?.(uuid);
    if (!source) return false;
    const patched = await store?.worldScope?.tool?.updateEntity?.(entityId, {
      name: source.name || '',
      img: source.img || '',
      description: source.description || '',
      originItemUuid: source.uuid || uuid,
      registeredItemUuid: source.uuid || uuid,
      aliasItemUuids: [],
    });
    return patched === true;
  }

  /** UNLINK a world Tool from its world Item. */
  async function unlinkWorldToolSource(entityId) {
    if (!entityId) return false;
    const patched = await store?.worldScope?.tool?.updateEntity?.(entityId, {
      originItemUuid: null,
      registeredItemUuid: null,
      aliasItemUuids: [],
    });
    return patched === true;
  }

  /** Whether a uuid names an Item EMBEDDED in another document (issue 1371). */
  function isEmbeddedItemUuid(uuid) {
    const parseUuid = globalThis.foundry?.utils?.parseUuid;
    if (typeof parseUuid !== 'function') return true;
    try {
      const parsed = parseUuid(uuid);
      if (!parsed || typeof parsed !== 'object') return true;
      return Number(parsed.embedded?.length) > 0;
    } catch {
      return true;
    }
  }

  /** The world component whose source-link fields already name one Item, or `null`. */
  function worldComponentForSourceItem(uuid) {
    const needle = String(uuid ?? '').trim();
    if (!needle) return null;
    return (
      (worldScopeState.component?.entries ?? []).find((entry) =>
        getItemMatchUuids(entry?.entity).includes(needle)
      ) ?? null
    );
  }

  /** Create a WORLD component from an Item dropped on the world Component Catalogue. */
  async function createWorldComponentFromItemDrop(data) {
    if (!data) return false;
    // The payload arrives UNRESOLVED, so the drop shape is normalised before anything reads it.
    const uuid = resolveDropUuid(data);
    if (!uuid) return false;
    if (isEmbeddedItemUuid(uuid)) {
      notifyWarn(
        text(
          'FABRICATE.Admin.Manager.Scoped.Component.DropEmbeddedRefused',
          'That Item belongs to an actor, so it cannot be a world component. Drop the Item from the Items directory or a compendium instead.'
        )
      );
      return false;
    }
    const source = await services?.resolveToolSource?.(uuid);
    if (!source) return false;
    const sourceUuid = source.uuid || uuid;
    const existing = worldComponentForSourceItem(sourceUuid);
    if (existing) {
      notifyInfo(
        format(
          'FABRICATE.Admin.Manager.Scoped.Component.DropExisting',
          '{name} is already a world component, so this drop opened it instead of making a second one.',
          { name: String(existing.entity?.name || existing.id || '') }
        )
      );
      openWorldScopedEntry('world-component-entry', existing.id);
      return true;
    }
    const entityId = String(store?.randomID?.() || '');
    if (!entityId) return false;
    const created = await store?.worldScope?.component?.createEntity?.({
      id: entityId,
      name: source.name || '',
      img: source.img || '',
      description: source.description || '',
      originItemUuid: sourceUuid,
      registeredItemUuid: sourceUuid,
    });
    if (created !== true) return false;
    // CHAINED, so the drop lands the GM on the record it just made rather than on a list they
    // then have to find it in. Routed through the same guard every other entry navigation uses.
    openWorldScopedEntry('world-component-entry', entityId);
    return true;
  }

  /** RE-POINT a world component at a different world-scoped Item, from the entry's own card. */
  async function relinkWorldComponentSource(data) {
    const entityId = worldScopedEntryId;
    if (!entityId || !data) return false;
    const uuid = resolveDropUuid(data);
    if (!uuid) return false;
    if (isEmbeddedItemUuid(uuid)) {
      notifyWarn(
        text(
          'FABRICATE.Admin.Manager.Scoped.Component.DropEmbeddedRefused',
          'That Item belongs to an actor, so it cannot be a world component. Drop the Item from the Items directory or a compendium instead.'
        )
      );
      return false;
    }
    const source = await services?.resolveToolSource?.(uuid);
    if (!source) return false;
    const patched = await store?.worldScope?.component?.updateEntity?.(entityId, {
      name: source.name || '',
      img: source.img || '',
      description: source.description || '',
      originItemUuid: source.uuid || uuid,
      registeredItemUuid: source.uuid || uuid,
      aliasItemUuids: [],
    });
    return patched === true;
  }

  /** UNLINK a world component from its world-scoped Item. */
  async function unlinkWorldComponentSource(entityId) {
    if (!entityId) return false;
    const patched = await store?.worldScope?.component?.updateEntity?.(entityId, {
      originItemUuid: null,
      registeredItemUuid: null,
      aliasItemUuids: [],
    });
    return patched === true;
  }

  async function toggleFocusedToolEnabled(enabled) {
    if (!focusedToolDraft?.id || $viewState.toolDraftBaseline === null) return false;
    return store.toggleToolEnabled?.(focusedToolDraft.id, enabled, selectedSystemId);
  }

  function openWorldParties() {
    return afterTruthyResult(confirmRouteExit('world'), () => {
      activeTravelTab = 'parties';
      activeView = 'world';
    });
  }

  // World > Rules & Resources (issue 1311).
  const WORLD_RULES_ROUTES = Object.freeze({
    currency: 'world-currency',
    prerequisites: 'world-prerequisites',
    modifiers: 'world-modifiers',
  });
  function openWorldRulesDestination(destination = 'currency') {
    const view = WORLD_RULES_ROUTES[destination];
    if (!view) return;
    return afterTruthyResult(confirmRouteExit(view, destination), () => {
      navRail.expandGroup('worldRules');
      activeView = view;
    });
  }

  function activateWorldRulesParent() {
    navRail.expandGroup('worldRules');
    if (isWorldRulesRoute) return;
    openWorldRulesDestination('currency');
  }

  // The cross-copy between the two libraries (issue 1308's `characterModifierPrerequisiteCopy`)
  // used to be an in-page affair: both lists rendered on System Settings.
  let worldRulesRequestOpenId = $state('');
  let worldRulesRequestOpenNonce = $state(0);

  // The copy announcement moved up here with the handler.
  let worldRulesCopyAnnouncement = $state('');
  function announceWorldRulesCopy(name) {
    const label = String(name || '').trim();
    const localized = text('FABRICATE.Admin.Manager.ListErgonomics.CopiedAnnouncement', '');
    worldRulesCopyAnnouncement =
      localized && localized.includes('{name}')
        ? localized.replace('{name}', label)
        : `Copied ${label} and icon — set the condition.`;
  }

  async function copyModifierToPrerequisite(entry) {
    const created = await store.addCharacterPrerequisite(mapModifierToPrerequisite(entry));
    if (!created?.id) return;
    worldRulesRequestOpenId = created.id;
    worldRulesRequestOpenNonce += 1;
    announceWorldRulesCopy(entry?.label);
    openWorldRulesDestination('prerequisites');
  }

  async function copyPrerequisiteToModifier(entry) {
    const created = await store.addModifier(mapPrerequisiteToModifier(entry));
    if (!created?.id) return;
    worldRulesRequestOpenId = created.id;
    worldRulesRequestOpenNonce += 1;
    announceWorldRulesCopy(entry?.name);
    openWorldRulesDestination('modifiers');
  }

  function openWorldDowntime() {
    // Issue 1257.
    if (!worldDowntimeAvailable) return;
    return afterTruthyResult(confirmRouteExit('world-downtime'), () => {
      navRail.expandGroup('worldDowntime');
      activeView = 'world-downtime';
    });
  }

  // The rail child and the studio card's button are two triggers for ONE navigation, so
  // both land here: select the preview, then commit the route.
  function openWorldDowntimePreview(tabId) {
    // Issue 1257: the same refusal as the parent entry above, for the same reason.
    if (!worldDowntimeAvailable) return;
    // The ACTIVE tab set, never a fixed list: whoever holds the surface decides what exists.
    if (!downtimeTabs.some((tab) => tab.id === tabId)) return;
    // RE-ACTIVATION, not navigation.
    if (isWorldDowntimeRoute && worldDowntimeTabId === tabId) {
      downtimeChromeChannel.reselect();
      return;
    }
    // The destination TAB travels as the route-exit subject id, because a Downtime tab is precisely
    // the "same view token, different subject" case that parameter exists for.
    return afterTruthyResult(confirmRouteExit('world-downtime', tabId), () => {
      worldDowntimeTabId = tabId;
      navRail.expandGroup('worldDowntime');
      activeView = 'world-downtime';
    });
  }

  /**
   * A mounted companion asking Core to take the GM to another of its OWN tabs (issue 1332).
   *
   * @param {string} tabId A tab id the live mount's own provider registered.
   */
  function navigateWorldDowntimeTab(tabId) {
    // A well-formed id this provider does not declare is `false`, not a throw: the tab set is a
    // runtime fact that moves under a companion — a provider may re-register with a different one.
    if (!downtimeProvider?.tabs?.some((tab) => tab.id === tabId)) return false;
    // Issue 1257's gate, restated for the same reason `openWorldDowntime` restates it: the
    // route is unreachable while the gate is shut, so a companion cannot be routed onto it.
    if (!worldDowntimeAvailable) return false;
    const moved = openWorldDowntimePreview(tabId);
    // `undefined` reaches here only from the re-activation branch or from a route exit with nothing
    // to ask — both did what the companion asked, so both are `true`.
    if (isPromise(moved)) return moved.then((value) => value !== false);
    return moved !== false;
  }

  // World > Travel (issue 1282). No availability refusal: the route is ungated, exactly like
  // World > Currency and unlike experimental-gated Downtime.
  function openWorldTravelDestination(destination = 'realms') {
    if (!['realms', 'map'].includes(destination)) return;
    return afterTruthyResult(confirmRouteExit('world-travel', destination), () => {
      worldTravelTab = destination;
      navRail.expandGroup('worldTravel');
      activeView = 'world-travel';
    });
  }

  function activateWorldTravelParent() {
    navRail.expandGroup('worldTravel');
    if (isWorldTravelRoute) return;
    openWorldTravelDestination('realms');
  }

  function enterToolEditor() {
    toolEditorActiveTab = 'breakage';
    activeView = 'tool-edit';
  }

  function openToolEditor(toolId) {
    const id = String(toolId || '');
    if (!id) return false;
    if (currentView === 'tool-edit' && String(focusedToolDraft?.id || '') === id) return true;
    afterTruthyResult(runRouteExitGuard(routeExitGuardFor('tool-edit'), 'tool-edit', id), () => {
      if (store?.openToolDraft?.(id, selectedSystemId) === false) return;
      enterToolEditor();
    });
    return true;
  }

  function selectLibraryTool(toolId) {
    if (!toolId) return false;
    const id = String(toolId);
    const opened = store?.openToolDraft?.(id, selectedSystemId) ?? false;
    // A WORLD TOOL THIS SYSTEM HAS NO RULES RECORD FOR CANNOT OPEN A DRAFT, and that is not a
    // failure to swallow.
    unadoptedToolId = opened === false ? id : '';
    return opened;
  }

  /** Adopt a world Tool into this system, and MOVE THE SELECTION ONTO THE RECORD IT CREATED. */
  async function adoptWorldToolIntoSystem(entityId) {
    const adopted = await store?.worldScope?.tool?.addToSystem?.(entityId, selectedSystemId);
    if (adopted !== true) return false;
    return selectLibraryTool(entityId);
  }

  function backToToolsBrowser() {
    afterTruthyResult(confirmRouteExit('tools'), () => {
      activeView = 'tools';
    });
  }

  async function saveSelectedToolDraft() {
    if (!focusedToolDraft || !store?.saveToolDraft) return false;
    const saved = await store.saveToolDraft();
    if (saved === false) surfaceToolsSaveValidationError();
    return saved;
  }

  /** STOP USING THE FOCUSED TOOL IN THE SELECTED SYSTEM (issue 1373). */
  async function removeFocusedToolFromSystem() {
    const toolId = String(focusedToolDraft?.id || '');
    if (!toolId || !selectedSystemId) return false;
    // NO `confirmDeleteTool` DIALOG, and that is not an omission.
    const removed = await store?.removeToolFromSystem?.(toolId, selectedSystemId);
    if (removed !== true) return false;
    activeView = 'tools';
    return true;
  }

  /** Move ONE of the focused Tool's world-default sections between inheriting and overriding. */
  async function setFocusedToolSectionInherited(section, inherit) {
    if (!focusedToolDraft?.id || $viewState.toolDraftBaseline === null) return false;
    return store?.setToolSectionInherited?.(
      focusedToolDraft.id,
      section,
      inherit,
      selectedSystemId
    );
  }

  // Crafting nav group handlers (issue 511), mirroring the gathering group.
  function openCraftingSection(tabId = 'recipes') {
    const item = craftingNavItems.find((tab) => tab.id === tabId) || craftingNavItems[0];
    const nextView = item?.view || 'recipes';
    afterTruthyResult(confirmRouteExit(nextView), () => {
      activeView = nextView;
      navRail.expandGroup('crafting');
    });
  }

  function activateCraftingParent() {
    if (isCraftingRoute) {
      navRail.expandGroup('crafting');
      return;
    }
    openCraftingSection('recipes');
  }

  // ---- Books & Scrolls surface handlers (issue 511, PR-B redesign) ----------
  // Select a recipe item row (opens the ItemPageInspector aside).
  function selectRecipeItem(recipeItemId) {
    selectedRecipeItemId = recipeItemId;
  }

  // The ItemPageInspector quick-limit toggle emits a boolean; turn it into the right caps patch for
  // the active visibility mode (live-apply, no draft).
  function toggleRecipeItemQuickLimit(recipeItemId, limited) {
    const patch =
      craftingVisibilityMode === 'item'
        ? { item: { limitUses: limited === true, maxUses: 1 } }
        : {
            learn: { limitLearning: limited === true, learnScope: 'perInstance', learnsAllowed: 1 },
          };
    store.updateRecipeItemCaps?.(recipeItemId, patch);
  }

  // Deep PLAIN clone for the recipe-item draft + baseline.
  function cloneRecipeItemDraft(source) {
    return source ? JSON.parse(JSON.stringify(source)) : null;
  }

  function recipeItemSourceSnapshot(source) {
    const uuid = String(source?.originItemUuid || '');
    if (!uuid) return null;
    return {
      uuid,
      name: source?.resolvedName || source?.name || '',
      img: source?.resolvedImg || source?.img || '',
      type: source?.derivedType || source?.type || '',
      description: source?.description || '',
    };
  }

  // Recursively deep-merge a partial patch into the recipe-item draft.
  function deepMergeDraft(base, patch) {
    const result = { ...(base || {}) };
    for (const [key, value] of Object.entries(patch || {})) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = deepMergeDraft(result[key], value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  function patchRecipeItemDraft(patch) {
    if (!recipeItemDraft || !patch) return;
    recipeItemDraft = deepMergeDraft(recipeItemDraft, patch);
  }

  // Open the full-window recipe-item editor for a definition (recipe-item-edit route).
  function editRecipeItem(recipeItemId) {
    afterTruthyResult(confirmRouteExit('recipe-item-edit'), () => {
      selectedRecipeItemId = recipeItemId;
      recipeItemEditSaving = false;
      recipeItemSaveFailed = false;
      recipeItemActiveTab = 'overview';
      const source = (recipeItemDefinitions || []).find((def) => def.id === recipeItemId) || null;
      recipeItemDraft = cloneRecipeItemDraft(source);
      recipeItemDraftBaseline = cloneRecipeItemDraft(source);
      recipeItemLinkedSourceSnapshot = recipeItemSourceSnapshot(source);
      activeView = 'recipe-item-edit';
      navRail.expandGroup('crafting');
      Promise.resolve(services?.getWorldItemOptions?.()).then((options) => {
        worldItemOptions = options || [];
      });
    });
  }

  function clearRecipeItemDraft() {
    recipeItemDraft = null;
    recipeItemDraftBaseline = null;
    recipeItemLinkedSourceSnapshot = null;
    recipeItemSaveFailed = false;
  }

  // Commit the staged recipe-item draft in a single updateRecipeItemDefinition call (via the
  // store's saveRecipeItem wrapper).
  async function saveRecipeItemDraft() {
    if (recipeItemEditSaving) return false;
    if (!recipeItemDraft?.id) return false;
    recipeItemEditSaving = true;
    recipeItemSaveFailed = false;
    try {
      const result = await store.saveRecipeItem?.(recipeItemDraft.id, {
        enabled: recipeItemDraft.enabled !== false,
        originItemUuid: recipeItemDraft.originItemUuid ?? null,
        recipeIds: Array.isArray(recipeItemDraft.recipeIds) ? recipeItemDraft.recipeIds : [],
        caps: recipeItemDraft.caps || {},
      });
      if (result === false) {
        recipeItemSaveFailed = true;
        return false;
      }
      recipeItemDraftBaseline = cloneRecipeItemDraft(recipeItemDraft);
      activeView = 'books-scrolls';
      return result;
    } catch {
      recipeItemSaveFailed = true;
      return false;
    } finally {
      recipeItemEditSaving = false;
    }
  }

  async function deleteRecipeItemFromEdit() {
    if (!recipeItemDraft?.id || recipeItemEditSaving) return;
    const result = await store.deleteRecipeItemDefinition?.(recipeItemDraft.id);
    if (result === false) return; // cancelled or failed → stay in the editor
    clearRecipeItemDraft();
    activeView = 'books-scrolls';
  }

  function backToBooksScrolls() {
    afterTruthyResult(confirmRouteExit('books-scrolls'), () => {
      activeView = 'books-scrolls';
    });
  }

  // Link / unlink the linked world item behind the edited recipe item (staged).
  async function linkRecipeItemSource(uuid) {
    if (!uuid) return false;
    const source = await services?.resolveToolSource?.(uuid);
    if (!source) return false;
    recipeItemLinkedSourceSnapshot = { ...source, uuid: source.uuid || uuid };
    patchRecipeItemDraft({ originItemUuid: source.uuid || uuid });
    return true;
  }

  function unlinkRecipeItemSource() {
    recipeItemLinkedSourceSnapshot = null;
    patchRecipeItemDraft({ originItemUuid: null });
  }

  // Add / remove a recipe on the edited book.
  function linkRecipeToItem(recipeId) {
    if (!recipeItemDraft?.id || !recipeId) return;
    // Function-local scratch: the draft is patched with the spread array below, so the Set
    // never reaches state.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const next = new Set((recipeItemDraft.recipeIds || []).map((id) => String(id)));
    next.add(String(recipeId));
    patchRecipeItemDraft({ recipeIds: [...next] });
  }

  function unlinkRecipeFromItem(recipeId) {
    if (!recipeItemDraft?.id || !recipeId) return;
    const next = (recipeItemDraft.recipeIds || [])
      .map((id) => String(id))
      .filter((id) => id !== String(recipeId));
    patchRecipeItemDraft({ recipeIds: next });
  }

  // Create a recipe item from a dropped world/compendium Item (issue 844).
  async function dropRecipeItem(uuid) {
    if (!uuid) return;
    const created = await store.addRecipeItemFromUuid?.(selectedSystemId, uuid);
    const newId = typeof created === 'string' ? created : created?.item?.id || created?.id;
    if (newId) editRecipeItem(newId);
  }

  function copyComponentSource(uuid = selectedComponent?.registeredItemUuidDisplay) {
    if (!uuid) return;
    return services?.onCopySourceUuid?.(uuid);
  }

  function selectedEssenceSourceUuid() {
    if (!selectedEssenceForInspector?.associatedItem) return '';
    return (
      selectedEssenceForInspector.sourceItemUuid ||
      selectedEssenceForInspector.associatedItem.originItemUuid ||
      ''
    );
  }

  function copySelectedEssenceSource() {
    const uuid = selectedEssenceSourceUuid();
    if (!uuid) return;
    services?.onCopySourceUuid?.(uuid);
  }

  // `componentSourceState` lived here to tone the inline components inspector's source chip.

  // No caller left. Deleting this and its two helpers (usageEvidenceItems,
  // salvageSummaryLabel) would strip the only readers of the twelve component Salvage* and
  // Usage* lang keys, orphaning them and failing the lang-keys-no-orphans ratchet, which may
  // not be grown. lang/en.json is outside this change's owned paths, so the trio is
  // suppressed rather than deleted; issue 926 removes the code and the keys together.
  // (Do not spell those keys with their leading namespace here: the orphan scanner treats a
  // dotted key literal in a COMMENT as a reference, and a partial one covers a whole subtree.)
  // eslint-disable-next-line no-unused-vars
  function componentEvidenceItems(item) {
    const evidence = [];
    if (!item) return evidence;
    if (Object.prototype.hasOwnProperty.call(item, 'difficulty')) {
      evidence.push({
        id: 'difficulty',
        label: text(
          'FABRICATE.Admin.Manager.Component.ProgressiveDifficulty',
          'Progressive difficulty'
        ),
        value: item.difficulty,
      });
    }
    if (item.salvageSummary) {
      evidence.push({
        id: 'salvage',
        label: text('FABRICATE.Admin.Manager.Component.Salvage', 'Salvage'),
        value: salvageSummaryLabel(item.salvageSummary),
      });
    }
    for (const fact of usageEvidenceItems(item)) {
      evidence.push(fact);
    }
    return evidence;
  }

  function usageEvidenceItems(item) {
    if (!item?.usageCounts || typeof item.usageCounts !== 'object') return [];
    const labels = {
      ingredient: text('FABRICATE.Admin.Manager.Component.UsageIngredient', 'Ingredient usage'),
      result: text('FABRICATE.Admin.Manager.Component.UsageResult', 'Result usage'),
      tool: text('FABRICATE.Admin.Manager.Component.UsageTool', 'Tool usage'),
      gathering: text('FABRICATE.Admin.Manager.Component.UsageGathering', 'Gathering usage'),
      salvage: text('FABRICATE.Admin.Manager.Component.UsageSalvage', 'Salvage usage'),
    };
    return Object.entries(item.usageCounts)
      .filter(([, count]) => Number.isFinite(Number(count)))
      .map(([key, count]) => ({
        id: `usage-${key}`,
        label: labels[key] || key,
        value: Number(count),
      }));
  }

  function salvageSummaryLabel(summary) {
    const parts = [
      text('FABRICATE.Admin.Manager.Component.SalvageQuantity', '{count} required').replace(
        '{count}',
        summary.quantityRequired ?? 1
      ),
    ];
    if (summary.toolCount > 0)
      parts.push(
        text('FABRICATE.Admin.Manager.Component.SalvageTools', '{count} tools').replace(
          '{count}',
          summary.toolCount
        )
      );
    if (summary.resultGroupCount > 0)
      parts.push(
        text('FABRICATE.Admin.Manager.Component.SalvageResults', '{count} result groups').replace(
          '{count}',
          summary.resultGroupCount
        )
      );
    if (summary.outcomeCount > 0)
      parts.push(
        text('FABRICATE.Admin.Manager.Component.SalvageOutcomes', '{count} outcomes').replace(
          '{count}',
          summary.outcomeCount
        )
      );
    if (summary.hasTimeRequirement)
      parts.push(text('FABRICATE.Admin.Manager.Component.SalvageTime', 'time'));
    if (summary.hasCurrencyRequirement)
      parts.push(text('FABRICATE.Admin.Manager.Component.SalvageCost', 'cost'));
    return parts.join(', ');
  }

  function buildCategoryRows(categories, usage, icons) {
    const generalName = text('FABRICATE.Admin.Manager.Recipe.General', 'General');
    const customRows = dedupeVocabularyEntries(categories, { reservesGeneral: true }).map(
      (entry) => {
        const recipeUsageCount = usage.get(entry.key) || 0;
        return {
          id: entry.key,
          kind: 'category',
          name: entry.name,
          title: entry.spellings.length > 1 ? entry.spellings.join(', ') : '',
          icon: categoryIconFor(icons, entry.name),
          recipeUsageCount,
          totalUsage: recipeUsageCount,
          locked: false,
        };
      }
    );
    return [
      {
        id: 'general',
        kind: 'category',
        name: generalName,
        icon: categoryIconFor(icons, 'general'),
        recipeUsageCount: usage.get('general') || 0,
        totalUsage: usage.get('general') || 0,
        locked: true,
      },
      ...customRows,
    ];
  }

  // Component-category rows (issue 676).
  function buildComponentCategoryRows(categories, usage, icons) {
    const generalName = text('FABRICATE.Common.General', 'General');
    const customRows = dedupeVocabularyEntries(categories, { reservesGeneral: true }).map(
      (entry) => {
        const componentUsageCount = usage.get(entry.key) || 0;
        return {
          id: entry.key,
          kind: 'component-category',
          name: entry.name,
          title: entry.spellings.length > 1 ? entry.spellings.join(', ') : '',
          icon: categoryIconFor(icons, entry.name),
          componentUsageCount,
          totalUsage: componentUsageCount,
          locked: false,
        };
      }
    );
    return [
      {
        id: 'general',
        kind: 'component-category',
        name: generalName,
        icon: categoryIconFor(icons, 'general'),
        componentUsageCount: usage.get('general') || 0,
        totalUsage: usage.get('general') || 0,
        locked: true,
      },
      ...customRows,
    ];
  }

  // The tag vocabulary reserves no bucket, so a tag named `general` is an entry like any other.
  function buildTagRows(tags, usage) {
    return dedupeVocabularyEntries(tags).map((entry) => {
      const componentUsageCount = usage.get(entry.key) || 0;
      return {
        id: entry.key,
        kind: 'tag',
        name: entry.name,
        title: entry.spellings.length > 1 ? entry.spellings.join(', ') : '',
        componentUsageCount,
        totalUsage: componentUsageCount,
      };
    });
  }

  // The page header's action ladder is a child component now, so every control it presses is a
  // named function here rather than a closure written at the call site.
  const backToWorldEssences = () => setView('world-essences');
  const backToWorldTools = () => setView('world-tools');
  const backToWorldComponents = () => setView('world-components');
  const createParty = () => store.createParty?.();
  const deleteEnvironmentDraft = () => store.deleteEnvironmentDraft?.();
  const exportSelectedSystem = () => exportSystem();
  const createGatheringTaskForSystem = () => drafts.createGatheringTask(selectedSystemId);
  const createGatheringEventForSystem = () => drafts.createGatheringEvent(selectedSystemId);

  function openComponentAddFromCatalogue() {
    componentAddFromCatalogueOpen = true;
  }

  async function createTravelRealm() {
    const created = await store.createRealmQuick?.(
      text('FABRICATE.Admin.Manager.Travel.DefaultRealmName', 'New realm')
    );
    if (typeof created === 'string' && created) selectedTravelRealmId = created;
  }
</script>

<div
  class="fabricate-manager"
  data-manager-view={currentView}
  data-gathering-task-layout={fullWidthLayout?.id === 'gathering-task-edit' ? 'results' : undefined}
  data-world-travel-tab={worldTravelTabAttribute}
  data-world-rules-tab={isWorldRulesRoute ? worldRulesTab : undefined}
>
  <!--
    The manager titlebar: a thin, always-present identity strip above the header.
  -->
  <!--
    THE TITLE BAND RENDERS ON THE TOOL ROUTES TOO (issue 1373).
  -->
  <div
    class="manager-titlebar"
    data-manager-titlebar
    aria-label={text('FABRICATE.Admin.Manager.Titlebar.Label', 'Crafting manager')}
  >
    <!--
    The layer-group icon and "Crafting Systems" product label used to lead this strip.
  -->
    {#if premiumInstalled}
      <span
        class="manager-titlebar-badge"
        data-manager-titlebar-premium
        title={text(
          'FABRICATE.Admin.Manager.Titlebar.PremiumStatus',
          'Fabricate Premium is installed and connected'
        )}
        aria-label={text(
          'FABRICATE.Admin.Manager.Titlebar.PremiumStatus',
          'Fabricate Premium is installed and connected'
        )}>{text('FABRICATE.Admin.Manager.Titlebar.Premium', 'PREMIUM')}</span
      >
    {/if}
    {#if selectedSystem}
      <span
        class="manager-titlebar-status"
        data-manager-titlebar-status
        title={titlebarStatusLabel()}
        aria-label={text('FABRICATE.Admin.Manager.Titlebar.Status', 'Selected system resolution')}
      >
        <!-- The reference marks this line with an INFORMATION glyph, not a die. What follows
             it is a statement about how the selected system resolves, which a d20 reads as a
             dice-roll control rather than as a caption (issue 1373). -->
        <i class="fas fa-circle-info manager-titlebar-status-icon" aria-hidden="true"></i>
        <span class="manager-titlebar-status-text">{titlebarStatusLabel()}</span>
      </span>
    {/if}
  </div>

  <ManagerPageHeader
    {header}
    {isToolStudioRoute}
    {currentView}
    {text}
    {selectedSystem}
    {selectSystemAndShowBrowser}
    {editSystem}
    {recipeDraft}
    {resolveRecipeImage}
    {componentForEdit}
    {downtimeHeaderArtwork}
    {worldEssenceEntryIcon}
    {worldEssenceEntryTint}
    {worldEssenceEntryName}
    {worldEssenceEntrySubtitle}
    {essenceEditIcon}
    {essenceEditTint}
    {essenceEditName}
    {essenceEditSubline}
    {worldComponentEntryImage}
    {worldComponentEntryName}
    {worldComponentEntrySubtitle}
    {worldToolEntryRecord}
    {worldToolEntryName}
    {worldToolEntrySubtitle}
    environmentDraftForDisplay={gathering.environmentDraftForDisplay}
    {isWorldRoute}
    {isWorldDowntimeRoute}
    {isWorldRulesRoute}
    {isWorldTravelRoute}
    {isWorldScopedRoute}
    {isChecksRoute}
    checksActiveTab={checks.checksActiveTab}
    {worldScopedEntryRoute}
    {worldScopedEntryCrumb}
    {worldRulesTab}
    {worldRulesPageTitle}
    {worldTravelTab}
    {worldDowntimeTabId}
    {downtimeTabCrumb}
    {downtimeTabCrumbNavigable}
    {downtimeLeafCrumb}
    {downtimeChromeChannel}
    activeGatheringTab={gathering.activeGatheringTab}
    gatheringTabLabel={gathering.gatheringTabLabel}
    {recipeItemCrumb}
    {environmentCrumb}
    {gatheringTaskCrumb}
    {gatheringEventCrumb}
    {openWorldParties}
    {setView}
    {openCraftingSection}
    {backToBooksScrolls}
    {backToEssencesBrowse}
    {backToRecipesBrowse}
    {backToComponentsBrowse}
    {backToEnvironmentsBrowse}
    backToGatheringTaskLibrary={drafts.backToGatheringTaskLibrary}
    backToGatheringEventLibrary={drafts.backToGatheringEventLibrary}
    {selectedSystemId}
    {worldEssenceEntryDirty}
    {worldEssenceEntrySaving}
    {backToWorldEssences}
    {saveWorldEssenceEntry}
    {worldToolEntryDirty}
    {worldToolEntrySaving}
    {worldToolEntryDelete}
    {worldToolDeleteAction}
    {backToWorldTools}
    {saveWorldToolEntry}
    {worldComponentEntryDirty}
    {worldComponentEntrySaving}
    {backToWorldComponents}
    {saveWorldComponentEntry}
    {createWorldEssence}
    {downtimeCoreFallback}
    {downtimeHeaderStatus}
    {downtimeHeaderActions}
    {runDowntimeHeaderAction}
    travelSaving={$viewState.travelSaving}
    {createParty}
    {createTravelRealm}
    {backToSystemsBrowser}
    importSystem={importFlow.importSystem}
    {exportSelectedSystem}
    {createSystem}
    {createRecipe}
    {recipeEditDirty}
    {recipeEditSaving}
    {recipeEditSaveLabel}
    {canSaveRecipeEdit}
    {selectedRecipeId}
    {deleteRecipeFromEdit}
    {saveRecipeDraft}
    {recipeItemDraft}
    {recipeItemEditDirty}
    {recipeItemEditSaving}
    {recipeItemSaveFailed}
    {canSaveRecipeItemEdit}
    {deleteRecipeItemFromEdit}
    {saveRecipeItemDraft}
    {openComponentAddFromCatalogue}
    {componentEditCombinedDirty}
    {componentEditSaving}
    {componentEditSaveLabel}
    {canSaveComponentEdit}
    checksDirty={checks.checksDirty}
    checksSaving={checks.checksSaving}
    saveChecks={checks.saveChecks}
    {essenceEditDirty}
    {essenceEditSaving}
    {essenceEditSaveLabel}
    {canSaveEssenceEdit}
    {cancelEssenceEdit}
    displayedGatheringTab={gathering.displayedGatheringTab}
    {canShowEnvironments}
    {createGatheringTaskForSystem}
    {createGatheringEventForSystem}
    createEnvironment={drafts.createEnvironment}
    environmentDraftDirty={$viewState.environmentDraftDirty}
    environmentDraftIsNew={$viewState.environmentDraftIsNew}
    environmentSaving={$viewState.environmentSaving}
    {deleteEnvironmentDraft}
    {saveEnvironmentEdit}
    gatheringTaskDraftDirty={gathering.gatheringTaskDraftDirty}
    gatheringTaskSaving={gathering.gatheringTaskSaving}
    gatheringTaskValidation={gathering.gatheringTaskValidation}
    gatheringTaskSaveError={gathering.gatheringTaskSaveError}
    selectedGatheringTaskId={gathering.selectedGatheringTaskId}
    deleteGatheringTaskDraft={drafts.deleteGatheringTaskDraft}
    saveGatheringTaskDraft={drafts.saveGatheringTaskDraft}
    gatheringEventDraftDirty={gathering.gatheringEventDraftDirty}
    gatheringEventSaving={gathering.gatheringEventSaving}
    gatheringEventValidation={gathering.gatheringEventValidation}
    gatheringEventSaveError={gathering.gatheringEventSaveError}
    selectedGatheringEventId={gathering.selectedGatheringEventId}
    deleteGatheringEventDraft={drafts.deleteGatheringEventDraft}
    saveGatheringEventDraft={drafts.saveGatheringEventDraft}
  />

  <div class={`manager-body ${navRail.collapsedDisplay ? 'is-rail-collapsed' : ''}`}>
    <ManagerNavRail
      {navRail}
      systems={$viewState.systems || []}
      {selectedSystem}
      {currentView}
      {changeScopeSystem}
      {backToSystemsBrowser}
      {setView}
      {editSystem}
      {systemOverviewCount}
      {isCraftingRoute}
      {activateCraftingParent}
      {craftingNavCount}
      {craftingNavItems}
      {activeCraftingTab}
      {openCraftingSection}
      {selectedCounts}
      {tagCategoryCounts}
      {canShowEssences}
      {toolsNavCount}
      {isChecksRoute}
      {activateChecksParent}
      checksNavCount={checks.checksNavCount}
      checksNavItems={checks.checksNavItems}
      {canShowEnvironments}
      {isGatheringRoute}
      activateGatheringParent={drafts.activateGatheringParent}
      gatheringNavCounts={gathering.gatheringNavCounts}
      visibleGatheringNavItems={gathering.visibleGatheringNavItems}
      displayedGatheringTab={gathering.displayedGatheringTab}
      openGatheringSection={drafts.openGatheringSection}
      {experimentalFeaturesEnabled}
      {worldScopedCounts}
      {isWorldRoute}
      {openWorldParties}
      {travelParties}
      {isWorldTravelRoute}
      {activateWorldTravelParent}
      {worldRealms}
      {worldTravelTab}
      {openWorldTravelDestination}
      {isWorldRulesRoute}
      {activateWorldRulesParent}
      {selectedCurrencyUnits}
      {selectedCharacterPrerequisites}
      {selectedSystemModifiers}
      {isWorldCurrencyRoute}
      {isWorldPrerequisitesRoute}
      {isWorldModifiersRoute}
      {openWorldRulesDestination}
      {worldDowntimeAvailable}
      {isWorldDowntimeRoute}
      {downtimeCoreFallback}
      {downtimeTabs}
      {downtimeNavTabBadges}
      {downtimeTabText}
      {downtimeNavLabelId}
      {worldDowntimeTabId}
      {openWorldDowntime}
      {openWorldDowntimePreview}
    />

    {#if currentView === 'world-components'}
      <!--
        The seven world scoped-entity routes (issue 1362).
      -->
      <WorldComponentCataloguePage
        {...componentScopeProps}
        onOpenEntry={(entityId) => openWorldScopedEntry('world-component-entry', entityId)}
        onOpenSystemRules={(entityId, systemId) => openSystemComponentRules(entityId, systemId)}
        onOpenVocabulary={() => setView('world-vocabulary')}
        onCreateFromItemDrop={createWorldComponentFromItemDrop}
        worldItems={worldItemOptions}
        worldEssences={worldEssenceOptions}
        bind:browserState={managerBrowserState.worldComponentCatalogue}
      />
    {:else if currentView === 'world-component-entry'}
      <WorldComponentEntryPage
        {...componentScopeProps}
        entityId={worldScopedEntryId}
        worldItems={worldItemOptions}
        worldEssences={worldEssenceOptions}
        onBackToCatalogue={() => setView('world-components')}
        onOpenSystemRules={(entityId, systemId) => openSystemComponentRules(entityId, systemId)}
        onOpenWorldVocabulary={() => setView('world-vocabulary')}
        onSourceDrop={relinkWorldComponentSource}
        onUnlinkSource={() => unlinkWorldComponentSource(worldScopedEntryId)}
        onCopySourceUuid={(uuid) => copyComponentSource(uuid)}
        onDraftChange={handleWorldComponentEntryDraft}
        onDirtyChange={handleWorldComponentEntryDirty}
        onDraftIdentityChange={handleScopedEntryDraftIdentity}
        onSublineChange={handleWorldComponentEntrySubline}
      />
    {:else if currentView === 'world-essences'}
      <WorldEssenceCataloguePage
        {...essenceScopeProps}
        onOpenEntry={(entityId) => openWorldScopedEntry('world-essence-entry', entityId)}
        onOpenSystemRules={(entityId, systemId) => openSystemEssenceRules(entityId, systemId)}
        bind:browserState={managerBrowserState.worldEssenceCatalogue}
      />
    {:else if currentView === 'world-essence-entry'}
      <WorldEssenceEntryPage
        {...essenceScopeProps}
        entityId={worldScopedEntryId}
        onBackToCatalogue={() => setView('world-essences')}
        onDraftChange={handleWorldEssenceEntryDraft}
        onDirtyChange={handleWorldEssenceEntryDirty}
        onDraftIdentityChange={handleScopedEntryDraftIdentity}
      />
    {:else if currentView === 'world-tools'}
      <WorldToolCataloguePage
        {...toolScopeProps}
        onOpenEntry={(entityId) => openWorldScopedEntry('world-tool-entry', entityId)}
        worldItems={worldItemOptions}
        onOpenSystemRules={(entityId, systemId) => openSystemToolRules(entityId, systemId)}
        onCreateFromItemDrop={createWorldToolFromItemDrop}
      />
    {:else if currentView === 'world-tool-entry'}
      <WorldToolEntryPage
        {...toolScopeProps}
        entityId={worldScopedEntryId}
        worldItems={worldItemOptions}
        prerequisiteOptions={selectedCharacterPrerequisites}
        modifierOptions={selectedSystemModifiers}
        componentOptions={worldComponentOptions}
        essenceOptions={worldEssenceOptions}
        itemTags={worldComponentTags}
        currencyUnits={selectedCurrencyUnits}
        previewActors={worldToolPreviewActors}
        getPreviewRollData={worldToolPreviewRollData}
        onBackToCatalogue={() => setView('world-tools')}
        onSourceDrop={relinkWorldToolSource}
        onUnlinkSource={() => unlinkWorldToolSource(worldScopedEntryId)}
        onDraftChange={handleWorldToolEntryDraft}
        onDirtyChange={handleWorldToolEntryDirty}
        onDraftIdentityChange={handleScopedEntryDraftIdentity}
        onSublineChange={handleWorldToolEntrySubline}
        onDeleteChange={handleWorldToolEntryDelete}
      />
    {:else if currentView === 'world-vocabulary'}
      <WorldVocabularyPage
        vocabulary={worldScopeState.vocabulary ?? null}
        actions={store?.worldScope?.vocabulary ?? null}
        systems={allSystems}
      />
    {:else if currentView === 'world-downtime'}
      <main
        class="manager-main"
        aria-label={text('FABRICATE.Admin.Manager.World.Downtime.Title', 'Downtime')}
      >
        <WorldDowntimeExtensionHost
          bind:this={downtimeExtensionHost}
          bind:activeTabId={worldDowntimeTabId}
          provider={downtimeProvider}
          tabs={downtimeTabs}
          context={worldDowntimeContext}
          navLabelId={downtimeNavLabelId}
          emitHook={managerExtensions?.emitHook}
          chromeChannel={downtimeChromeChannel}
          onProviderFault={noteDowntimeProviderFault}
        />
      </main>
    {:else if isWorldCurrencyRoute}
      <!--
        World > Currency renders its own `manager-main` straight from the root.
      -->
      <main
        class="manager-main"
        aria-label={text('FABRICATE.Admin.Manager.World.CurrencyTitle', 'World Currency')}
      >
        <WorldCurrencyTab
          currencyUnits={selectedCurrencyUnits}
          {currencyValidationErrors}
          {currencyPresetsSupported}
          {currencySpendStrategy}
          {currencyProviderId}
          {currencyMacros}
          {currencyProviderOptions}
          {onAddCurrencyUnit}
          {onUpdateCurrencyUnit}
          {onDeleteCurrencyUnit}
          {onReorderCurrencyUnit}
          {onAddCurrencySubUnit}
          {onUpdateCurrencySubUnit}
          {onDeleteCurrencySubUnit}
          {onSeedCurrencyPresets}
          {onSetCurrencySpendStrategy}
          {onSetCurrencyProvider}
          {onSetCurrencyMacro}
          {onClearCurrencyMacro}
        />
      </main>
    {:else if isWorldPrerequisitesRoute}
      <!--
        World > Character prerequisites (issue 1311), the second Rules & Resources destination.
      -->
      <main class="manager-main" aria-label={worldRulesPageTitle}>
        <p class="visually-hidden" aria-live="polite" data-list-copy-announcement>
          {worldRulesCopyAnnouncement}
        </p>
        <WorldPrerequisitesTab
          library={selectedCharacterPrerequisites}
          presetsSupported={characterPrerequisitePresetsSupported}
          onAdd={onAddCharacterPrerequisite}
          onUpdate={onUpdateCharacterPrerequisite}
          onDelete={onDeleteCharacterPrerequisite}
          onReorder={onReorderCharacterPrerequisite}
          onSeedPresets={onSeedCharacterPrerequisitePresets}
          onCopyToModifier={copyPrerequisiteToModifier}
          requestOpenId={worldRulesRequestOpenId}
          requestOpenNonce={worldRulesRequestOpenNonce}
        />
      </main>
    {:else if isWorldModifiersRoute}
      <!-- World > Modifiers (issue 1311), the third Rules & Resources destination. -->
      <main class="manager-main" aria-label={worldRulesPageTitle}>
        <p class="visually-hidden" aria-live="polite" data-list-copy-announcement>
          {worldRulesCopyAnnouncement}
        </p>
        <WorldModifiersTab
          library={selectedSystemModifiers}
          presetsSupported={characterModifierPresetsSupported}
          {foundrySystemId}
          onAdd={onAddCharacterModifier}
          onUpdate={onUpdateCharacterModifier}
          onDelete={onDeleteCharacterModifier}
          onReorder={onReorderCharacterModifier}
          onSeedPresets={onSeedCharacterModifierPresets}
          onCopyToPrerequisite={copyModifierToPrerequisite}
          requestOpenId={worldRulesRequestOpenId}
          requestOpenNonce={worldRulesRequestOpenNonce}
        />
      </main>
    {:else if isWorldTravelRoute}
      <!--
        World > Travel renders its own `manager-main` straight from the root.
      -->
      <main
        class="manager-main"
        aria-label={text('FABRICATE.Admin.Manager.World.TravelTitle', 'World Travel')}
      >
        {#if worldTravelTab === 'map'}
          <GatheringMapLinksTab
            sceneRegions={mapCurrentSceneRegions}
            sceneUuid={$viewState.currentSceneUuid || ''}
            selectedRegionUuid={selectedMapRegionUuid}
            regions={worldRealms}
            saving={$viewState.travelSaving === true}
            onSelect={(uuid) => (selectedMapRegionUuid = uuid)}
            onSetLink={(sceneRegionUuid, realmId) =>
              store.setMapRegionLink?.(sceneRegionUuid, realmId)}
          />
        {:else}
          <GatheringRealmsTab
            realms={worldRealms}
            selectedRealmId={selectedTravelRealmId}
            environments={worldTravelEnvironmentOptions}
            saving={$viewState.travelSaving === true}
            onSelectRealm={(id) => (selectedTravelRealmId = id)}
            onAddEnvironment={(envId, realmId) =>
              store.setEnvironmentRealmMembership?.(envId, realmId, true)}
            onRemoveEnvironment={(envId, realmId) =>
              store.setEnvironmentRealmMembership?.(envId, realmId, false)}
            bind:browserState={managerBrowserState.travelRealms}
            bind:realmEnvironmentsBrowserState={managerBrowserState.realmEnvironments}
          />
        {/if}
      </main>
    {:else if currentView === 'environments' || currentView === 'world'}
      <EnvironmentsBrowserView
        environments={gathering.environmentList}
        environmentsLoading={$viewState.environmentsLoading}
        environmentsError={$viewState.environmentsError}
        environmentDraft={gathering.environmentDraftForDisplay}
        environmentDraftDirty={$viewState.environmentDraftDirty}
        environmentValidationCount={gathering.environmentValidationCount}
        selectedEnvironmentId={gathering.selectedEnvironmentId}
        {selectedSystemId}
        gatheringConfig={$viewState.gatheringConfig}
        sceneOptions={selectedSystem?.sceneOptions || []}
        environmentTaskCounts={$viewState.environmentTaskCounts || {}}
        shouldUseEnvironmentDraftForDisplay={gathering.shouldUseEnvironmentDraftForDisplay}
        activeGatheringTab={isWorldRoute ? 'travel' : gathering.displayedGatheringTab}
        activeTravelTab={isWorldRoute ? 'parties' : activeTravelTab}
        selectedTaskId={gathering.selectedGatheringTask?.id || gathering.selectedGatheringTaskId}
        selectedEventId={gathering.selectedGatheringEvent?.id || gathering.selectedGatheringEventId}
        managedItemOptions={selectedSystem?.managedItemOptions || []}
        {services}
        onSelectGatheringTab={drafts.selectGatheringTab}
        onSelectGatheringTask={drafts.selectGatheringTask}
        onCreateGatheringTask={drafts.createGatheringTask}
        onEditGatheringTask={drafts.editGatheringTask}
        onDuplicateGatheringTask={drafts.duplicateGatheringTask}
        onDeleteGatheringTask={drafts.deleteGatheringTask}
        onToggleGatheringTaskEnabled={drafts.toggleGatheringTaskEnabled}
        onSelectGatheringEvent={drafts.selectGatheringEvent}
        onCreateGatheringEvent={drafts.createGatheringEvent}
        onEditGatheringEvent={drafts.editGatheringEvent}
        onDuplicateGatheringEvent={drafts.duplicateGatheringEvent}
        onDeleteGatheringEvent={drafts.deleteGatheringEvent}
        onToggleGatheringEventEnabled={drafts.toggleGatheringEventEnabled}
        onSelectEnvironment={(id) => drafts.selectEnvironment(id)}
        onEditEnvironment={(id) => drafts.editEnvironment(id)}
        onCreateEnvironment={drafts.createEnvironment}
        onDuplicateEnvironment={(id) => drafts.duplicateEnvironment(id)}
        onDeleteEnvironment={(id) => drafts.deleteEnvironment(id)}
        onToggleEnvironmentEnabled={(id, enabled) => drafts.toggleEnvironmentEnabled(id, enabled)}
        onUpdateGatheringConditions={store.updateGatheringConditions}
        onToggleGatheringConditionEnabled={store.toggleGatheringConditionEnabled}
        onAddGatheringConditionValue={store.addGatheringConditionValue}
        onUpdateGatheringConditionValue={store.updateGatheringConditionValue}
        onDeleteGatheringConditionValue={store.deleteGatheringConditionValue}
        onAddGatheringVocabularyValue={store.addGatheringVocabularyValue}
        onUpdateGatheringVocabularyValue={store.updateGatheringVocabularyValue}
        onDeleteGatheringVocabularyValue={store.deleteGatheringVocabularyValue}
        onPickImagePath={services?.pickImagePath}
        {travelParties}
        travelSaving={$viewState.travelSaving === true}
        travelError={$viewState.travelError}
        travelFieldErrors={$viewState.travelFieldErrors || {}}
        travelActorOptions={$viewState.actorOptions || []}
        {worldRealms}
        partyRealmOverridesAvailable={gathering.partyRealmOverridesAvailable}
        partyRealmOverridesUnavailableHint={gathering.partyRealmOverridesUnavailableHint}
        onCreateParty={() => store.createParty?.()}
        onRenameParty={(id, name) => store.renameParty?.(id, name)}
        onSetPartyEnabled={(id, enabled) => store.setPartyEnabled?.(id, enabled)}
        onDeleteParty={(id) => store.deleteParty?.(id)}
        onAddPartyMember={(id, uuid) => store.addOrMovePartyMember?.(id, uuid)}
        onRemovePartyMember={(id, uuid) => store.removePartyMember?.(id, uuid)}
        onMovePartyMember={(from, to, uuid) => store.movePartyMember?.(from, to, uuid)}
        onSetPartyTravelActor={(id, uuid) => store.setPartyTravelActor?.(id, uuid)}
        onClearPartyTravelActor={(id) => store.clearPartyTravelActor?.(id)}
        onSetPartyRealmOverride={(id, sys, ids) => store.setPartyRealmOverride?.(id, sys, ids)}
        onClearPartyRealmOverride={(id, sys) => store.clearPartyRealmOverride?.(id, sys)}
        onRemoveStaleMember={(id, uuid) => store.removeStaleMember?.(id, uuid)}
        onClearStaleTravelActor={(id) => store.clearStaleTravelActor?.(id)}
        onDropStaleOverrideRealm={(id, sys, realmId) =>
          store.dropStaleOverrideRealm?.(id, sys, realmId)}
        bind:browserState={managerBrowserState.environments}
        bind:gatheringTasksBrowserState={managerBrowserState.gatheringTasks}
        bind:gatheringEventsBrowserState={managerBrowserState.gatheringEvents}
      />
    {:else if currentView === 'environment-edit' && selectedSystem}
      <main
        class="manager-main manager-environment-edit-main"
        aria-label={text('FABRICATE.Admin.Manager.Environment.EditTitle', 'Edit environment')}
      >
        <section class="manager-environment-editor-shell">
          <EnvironmentEditView
            environmentDraft={$viewState.environmentDraft}
            composition={$viewState.environmentComposition}
            eventSelectionMode={gathering.selectedGatheringRules.eventSelectionMode}
            isNew={$viewState.environmentDraftIsNew}
            linkedSceneImage={gathering.environmentSceneImage($viewState.environmentDraft)}
            realmRecords={worldRealms}
            realmsEnabled={gathering.gatheringRealmsEnabled}
            biomeOptions={modifiers.gatheringVocabularyOptions('biomes')}
            dangerOptions={modifiers.gatheringVocabularyOptions('danger')}
            onPickImagePath={services?.pickImagePath}
            onUpdateEnvironment={store.updateEnvironmentDraft}
            onSetCompositionMode={store.setEnvironmentCompositionMode}
            onIncludeRecord={store.includeEnvironmentRecord}
            onForceIncludeRecord={store.forceIncludeEnvironmentRecord}
            onExcludeRecord={store.excludeEnvironmentRecord}
            onRestoreRecord={store.restoreEnvironmentRecord}
            onReorderRecord={store.reorderEnvironmentRecord}
            onOpenSourceTask={(id) => drafts.editGatheringTask(id)}
            onOpenSourceEvent={(id) => drafts.editGatheringEvent(id)}
          />
        </section>
      </main>
    {:else if isChecksRoute && selectedSystem}
      <main
        class="manager-main manager-environment-edit-main"
        aria-label={text('FABRICATE.Admin.Manager.Checks.Title', 'Checks')}
      >
        <!-- `data-checks-shell` drops the shared editor shell's 12px padding for this route
             only (issue 1096). The prototype's studio runs edge to edge inside the app
             window and puts every inset on the pane itself; the shell's padding, the
             workspace gap and the panel's own inset were stacking into dead space at the
             body's edges. Marked on the SHELL rather than styled from a descendant, because
             the padding belongs to the shell and a child cannot remove it. -->
        <section class="manager-environment-editor-shell" data-checks-shell>
          <ChecksView
            {foundrySystemId}
            resolutionMode={selectedSystem?.resolutionMode || 'simple'}
            alchemyCheckMode={checks.alchemyCheckModeDraft}
            craftingCheck={checks.checkRoutedDraft}
            craftingCheckSimple={checks.checkSimpleDraft}
            craftingCheckProgressive={checks.checkProgressiveDraft}
            craftingConsumption={selectedSystem?.craftingCheck?.consumption || null}
            salvageConsumption={selectedSystem?.salvageCraftingCheck?.consumption || null}
            craftingFailureResultPolicy={selectedSystem?.craftingCheck?.failureResultPolicy ||
              'perRecord'}
            salvageFailureResultPolicy={selectedSystem?.salvageCraftingCheck?.failureResultPolicy ||
              'perRecord'}
            gatheringFailureResultPolicy={selectedSystem?.gatheringCraftingCheck
              ?.failureResultPolicy || 'perRecord'}
            modifiers={selectedSystemModifiers}
            craftingDefaultModifierPolicy={selectedSystem?.craftingCheck?.defaultModifierPolicy ||
              'addAll'}
            craftingDefaultModifierIds={selectedSystem?.craftingCheck?.defaultModifierIds || []}
            craftingMaxModifierPicks={selectedSystem?.craftingCheck?.maxModifierPicks ?? null}
            salvageDefaultModifierPolicy={selectedSystem?.salvageCraftingCheck
              ?.defaultModifierPolicy || 'addAll'}
            salvageDefaultModifierIds={selectedSystem?.salvageCraftingCheck?.defaultModifierIds ||
              []}
            salvageMaxModifierPicks={selectedSystem?.salvageCraftingCheck?.maxModifierPicks ?? null}
            gatheringDefaultModifierPolicy={selectedSystem?.gatheringCraftingCheck
              ?.defaultModifierPolicy || 'addAll'}
            gatheringDefaultModifierIds={selectedSystem?.gatheringCraftingCheck
              ?.defaultModifierIds || []}
            gatheringMaxModifierPicks={selectedSystem?.gatheringCraftingCheck?.maxModifierPicks ??
              null}
            alchemyLearnOnCraft={selectedSystem?.alchemy?.learnOnCraft === true}
            alchemyConsumeOnFail={selectedSystem?.alchemy?.consumeOnFail !== false}
            alchemyShowAttemptHistory={selectedSystem?.alchemy?.showAttemptHistoryToPlayers !==
              false}
            {salvageResolutionMode}
            salvageCheckSimple={checks.salvageSimpleDraft}
            salvageCheckRouted={checks.salvageRoutedDraft}
            salvageCheckProgressive={checks.salvageProgressiveDraft}
            gatheringResolutionMode={gathering.gatheringResolutionMode}
            gatheringCheckProgressive={checks.gatheringProgressiveDraft}
            gatheringCheckRouted={checks.gatheringRoutedDraft}
            breakageAuthority={selectedSystem?.toolBreakage?.authority || 'toolSpecific'}
            features={selectedSystem?.features || {}}
            activation={checks.checkActivation}
            activity={checks.checksActiveTab}
            requestedSection={checks.checksActiveSection}
            requestedSectionNonce={checks.checksSectionRequestNonce}
            dirty={checks.checksDirty}
            dirtyActivities={checks.checksDirtyActivities}
            onUpdateCraftingCheck={checks.onUpdateCraftingCheck}
            onUpdateCraftingCheckSimple={checks.onUpdateCraftingCheckSimple}
            onUpdateCraftingCheckProgressive={checks.onUpdateCraftingCheckProgressive}
            onUpdateSalvageCheckSimple={checks.onUpdateSalvageCheckSimple}
            onUpdateSalvageCheckRouted={checks.onUpdateSalvageCheckRouted}
            onUpdateSalvageCheckProgressive={checks.onUpdateSalvageCheckProgressive}
            onUpdateGatheringCheckProgressive={checks.onUpdateGatheringCheckProgressive}
            onUpdateGatheringCheckRouted={checks.onUpdateGatheringCheckRouted}
            onSetAlchemyCheckMode={(m) => {
              checks.alchemyCheckModeDraft = m;
            }}
            onUpdateCraftingConsumption={(patch) => store.saveCraftingCheckConsumption?.(patch)}
            onUpdateSalvageConsumption={(patch) => store.saveSalvageCheckConsumption?.(patch)}
            onUpdateCraftingFailureResultPolicy={(policy) =>
              store.saveCraftingCheckFailureResultPolicy?.(policy)}
            onUpdateSalvageFailureResultPolicy={(policy) =>
              store.saveSalvageCheckFailureResultPolicy?.(policy)}
            onUpdateGatheringFailureResultPolicy={(policy) =>
              store.saveGatheringCheckFailureResultPolicy?.(policy)}
            onUpdateCraftingCheckModifiers={(patch) => store.saveCraftingCheckModifiers?.(patch)}
            onUpdateSalvageCheckModifiers={(patch) => store.saveSalvageCheckModifiers?.(patch)}
            onUpdateGatheringCheckModifiers={(patch) => store.saveGatheringCheckModifiers?.(patch)}
            onUpdateAlchemyFlags={checks.onUpdateAlchemyFlags}
            onOpenActivity={(activity, section) => {
              checks.requestSection(section);
              setView(`checks-${activity}`);
            }}
            onOpenModifierLibrary={showSystemModifiers}
            onToggleCheckActive={checks.onToggleCheckActive}
          />
        </section>
      </main>
    {:else if currentView === 'gathering-task-edit' && selectedSystem}
      <GatheringTaskEditView
        task={gathering.editingGatheringTask}
        staminaEnabled={gathering.selectedGatheringTaskStaminaEnabled}
        nodesEnabled={gathering.selectedGatheringTaskNodesEnabled}
        resolutionMode={gathering.gatheringTaskResolutionMode}
        routedOutcomeTiers={gathering.gatheringTaskRoutedOutcomeTiers}
        resultValidationErrors={gathering.gatheringTaskValidation.resultErrors || []}
        {itemCards}
        managedItemOptions={selectedSystem.managedItemOptions || []}
        weatherOptions={modifiers.gatheringConditionOptions('weather')}
        timeOfDayOptions={modifiers.gatheringConditionOptions('timeOfDay')}
        biomeOptions={modifiers.gatheringVocabularyOptions('biomes')}
        selectedDropId={gathering.selectedGatheringDrop?.id || gathering.selectedGatheringDropId}
        rewardRules={gathering.selectedGatheringRules}
        characterModifierLibrary={selectedSystemModifiers}
        checkModifierOptions={selectedSystemModifiers}
        gatheringModifierPolicy={selectedSystem?.gatheringCraftingCheck?.defaultModifierPolicy ||
          'addAll'}
        gatheringModifierMaxPicks={selectedSystem?.gatheringCraftingCheck?.maxModifierPicks ?? null}
        gatheringModifierDefaultIds={selectedSystem?.gatheringCraftingCheck?.defaultModifierIds ||
          []}
        libraryTools={selectedGatheringSystemTools}
        environmentOptions={gathering.selectedSystemEnvironmentOptions}
        onPickImagePath={services?.pickImagePath}
        onUpdateTask={drafts.updateSelectedGatheringTask}
        onSelectDrop={(rowId) => {
          gathering.selectedGatheringDropId = rowId;
        }}
        onAddDrop={drafts.addGatheringTaskDrop}
        onUpdateDrop={drafts.updateGatheringTaskDrop}
        onMoveDrop={drafts.moveGatheringTaskDrop}
        onImportDrop={drafts.importGatheringTaskDrop}
        onAddModifier={modifiers.addGatheringDropModifier}
        onUpdateModifier={modifiers.updateGatheringDropModifier}
        onDeleteModifier={modifiers.deleteGatheringDropModifier}
        onAddToolReference={drafts.addToolReferenceToSelectedTask}
        onRemoveToolReference={drafts.removeToolReferenceFromSelectedTask}
      />
    {:else if currentView === 'gathering-event-edit' && selectedSystem}
      <GatheringEventEditView
        event={gathering.editingGatheringEvent}
        weatherOptions={modifiers.gatheringConditionOptions('weather')}
        timeOfDayOptions={modifiers.gatheringConditionOptions('timeOfDay')}
        biomeOptions={modifiers.gatheringVocabularyOptions('biomes')}
        onPickImagePath={services?.pickImagePath}
        onUpdateEvent={drafts.updateSelectedGatheringEvent}
      />
    {:else if currentView === 'tools' && selectedSystem}
      <ToolsBrowserView
        {...toolScopeProps}
        tools={libraryToolsList}
        selectedToolId={focusedToolDraft?.id || ''}
        managedItemOptions={selectedSystem?.managedItemOptions || []}
        breakageAuthority={selectedSystem?.toolBreakage?.authority || 'toolSpecific'}
        breakageSource={selectedSystem?.toolBreakage?.source || 'default'}
        selectedUnadoptedToolId={unadoptedToolId}
        onSelectTool={selectLibraryTool}
        onEditTool={openToolEditor}
        onToggleToolEnabled={(id, enabled) =>
          store.toggleToolEnabled?.(id, enabled, selectedSystemId)}
        onSetBreakageAuthority={(authority) => store.setToolBreakageAuthority?.(authority)}
        onOpenWorldCatalogue={() => setView('world-tools')}
        bind:browserState={managerBrowserState.tools}
      />
    {:else if currentView === 'tool-edit' && selectedSystem && focusedToolDraft}
      <ToolEditView
        {...toolScopeProps}
        tool={focusedToolDraft}
        systemName={selectedSystem.name}
        breakageSource={selectedSystem?.toolBreakage?.source || 'default'}
        validation={focusedToolValidation}
        dirty={$viewState.toolDraftDirty === true}
        persisted={$viewState.toolDraftBaseline !== null}
        saving={$viewState.toolDraftSaving === true}
        saveError={$viewState.toolDraftSaveError}
        activeTab={toolEditorActiveTab}
        focusValidationNonce={toolValidationFocusNonce}
        managedItems={selectedSystem?.managedItemOptions || []}
        itemTags={selectedSystem?.itemTags || []}
        essenceOptions={selectedSystem?.features?.essences === true
          ? selectedSystem?.essenceDefinitions || []
          : []}
        currencyUnits={selectedCurrencyUnits}
        currencyEnabled={selectedCurrencyEnabled}
        prerequisiteOptions={selectedCharacterPrerequisites}
        modifierOptions={selectedSystemModifiers}
        actorOptions={$viewState.actorOptions || []}
        getActorRollData={(uuid) => store.getActorRollData?.(uuid)}
        requiredFor={$viewState.toolRequiredFor?.[focusedToolDraft.id] || []}
        authority={selectedSystem?.toolBreakage?.authority || 'toolSpecific'}
        onOpenSystems={selectSystemAndShowBrowser}
        onOpenSystem={() => editSystem(selectedSystem.id)}
        onOpenTools={backToToolsBrowser}
        onBack={backToToolsBrowser}
        onSave={saveSelectedToolDraft}
        onTabChange={(tab) => {
          toolEditorActiveTab = tab;
        }}
        onPatch={(patch) => store.patchToolDraft?.(patch)}
        onToggleEnabled={toggleFocusedToolEnabled}
        onEditWorldTool={(entityId) => openWorldScopedEntry('world-tool-entry', entityId)}
        onToggleInherited={setFocusedToolSectionInherited}
        onRemoveFromSystem={removeFocusedToolFromSystem}
      />
    {:else if currentView === 'essences' && selectedSystem}
      <EssenceBrowserView
        {...essenceScopeProps}
        {essenceCards}
        showSourceUi={showEssenceSourceUi}
        showPropertyMacroUi={showEssencePropertyMacroUi}
        selectedEssenceId={selectedEssence?.id || selectedEssenceId}
        {selectedSystemId}
        onSelectEssence={selectEssence}
        onEditEssence={editEssence}
        onToggleEssenceEnabled={toggleEssenceEnabled}
        onSelectionCleared={() => essenceBulk.announceCleared()}
        bind:browserState={essenceBrowserState}
      />
    {:else if currentView === 'essence-edit' && selectedSystem}
      <EssenceEditView
        {...essenceScopeProps}
        essence={selectedEssenceId ? selectedEssenceStrict : null}
        managedItemOptions={selectedSystem.managedItemOptions || []}
        showSourceUi={showEssenceSourceUi}
        showPropertyMacroUi={showEssencePropertyMacroUi}
        saving={essenceEditSaving}
        onSave={saveEssenceEdit}
        onDirtyChange={(dirty) => {
          essenceEditDirty = dirty;
        }}
        onDraftChange={handleEssenceDraftChange}
        onImportSourceDrop={importEssenceSourceDrop}
        onCopySourceUuid={(uuid) => copyComponentSource(uuid)}
        onOpenSharedDefinition={(entityId) => openWorldScopedEntry('world-essence-entry', entityId)}
      />
    {:else if currentView === 'tags' && selectedSystem}
      <TagsCategoriesView
        {categoryRows}
        {componentCategoryRows}
        {tagRows}
        onAddCategory={addCategory}
        onRemoveCategory={removeCategory}
        onAddComponentCategory={addComponentCategory}
        onRemoveComponentCategory={removeComponentCategory}
        onAddTag={addTag}
        onRemoveTag={removeTag}
        onSetCategoryIcon={setCategoryIcon}
        onSetComponentCategoryIcon={setComponentCategoryIcon}
        bind:recipeCategoryBrowserState={managerBrowserState.recipeCategoryVocabulary}
        bind:componentCategoryBrowserState={managerBrowserState.componentCategoryVocabulary}
        bind:componentTagBrowserState={managerBrowserState.componentTagVocabulary}
      />
    {:else if currentView === 'component-edit' && selectedSystem}
      {#if componentForEdit}
        <ComponentEditView
          {...componentScopeProps}
          component={componentForEdit}
          tagOptions={componentEditTagOptions}
          essenceOptions={componentEditEssenceOptions}
          showTags={componentEditShowTags}
          showEssences={componentEditShowEssences}
          showSalvage={componentSalvageEnabled}
          categoryOptions={selectedSystem?.componentCategories || []}
          {salvageResolutionMode}
          {salvageOutcomeNames}
          {salvageCheckEnabled}
          {salvageCheckTiers}
          checkModifierOptions={selectedSystemModifiers}
          salvageModifierPolicy={selectedSystem?.salvageCraftingCheck?.defaultModifierPolicy ||
            'addAll'}
          salvageModifierMaxPicks={selectedSystem?.salvageCraftingCheck?.maxModifierPicks ?? null}
          salvageModifierDefaultIds={selectedSystem?.salvageCraftingCheck?.defaultModifierIds || []}
          {salvageCheckDcMode}
          {salvageCheckDc}
          componentOptions={salvageComponentOptions}
          {complicationActivities}
          {complicationTriggerOptions}
          macroOptions={complicationMacroOptions}
          saving={componentEditSaving}
          showDifficulty={componentDifficultyShown}
          difficulty={componentDifficultyDraft}
          onDifficultyChange={(value) => stageComponentDifficulty(value)}
          onReplaceSource={(itemId, data) => replaceComponentSource(itemId, data)}
          onUnlinkSource={(itemId) => unlinkComponentSource(itemId)}
          onOpenSource={(uuid) => openComponentSource(uuid)}
          onCopySourceUuid={(uuid) => copyComponentSource(uuid)}
          onManageCheckPresets={openSalvageCheckPresets}
          onOpenComponent={(componentId) => editComponent(componentId)}
          onOpenWorldEntry={(route, entityId) => openWorldScopedEntry(route, entityId)}
          onSave={saveComponentEdit}
          onDirtyChange={(dirty) => {
            componentEditDirty = dirty;
          }}
          onDraftChange={handleComponentDraftChange}
        />
      {:else}
        <main
          class="manager-main"
          aria-label={text('FABRICATE.Admin.Manager.Component.EditTitle', 'Edit component')}
        >
          <EmptyState
            icon="fas fa-boxes"
            title={text('FABRICATE.Admin.Manager.Component.SelectComponent', 'Select a component')}
            hint={text(
              'FABRICATE.Admin.Manager.Component.EditMissingHint',
              'Pick a component from the browser to edit its tags, essences, and source linkage.'
            )}
          />
        </main>
      {/if}
    {:else if currentView === 'components'}
      <ComponentsBrowserView
        {...componentScopeProps}
        {itemCards}
        itemSearchTerm={$viewState.itemSearchTerm || ''}
        {selectedComponentId}
        {selectedSystemId}
        selectedSystemResolutionMode={selectedSystem?.resolutionMode || 'simple'}
        difficultyAxisProgressive={componentDifficultyAxisProgressive}
        categoryVocabulary={selectedSystem?.componentCategories || []}
        bind:browserState={componentBrowserState}
        dropEnabled={!!selectedSystemId && !!services?.onDropItem}
        onSearchChange={(term) => store.setItemSearch?.(term)}
        onSelectComponent={(id) => selectComponent(id)}
        onDropComponent={(data) => importFlow.dropComponent(data)}
        onEditComponent={(id) => editComponent(id)}
        onOpenWorldEntry={(route, entityId) => openWorldScopedEntry(route, entityId)}
        onSelectionCleared={() => componentBulk.announceCleared()}
      />
    {:else if currentView === 'recipe-edit' && selectedSystem}
      <RecipeEditView
        recipe={recipeDraft}
        canAddSet={recipeCanAddSet}
        alchemySimple={recipeAlchemySimple}
        simpleFailureSlot={recipeSimpleWithCheck}
        progressive={recipeProgressive}
        saving={recipeEditSaving}
        saveFailed={recipeSaveFailed}
        onPickImagePath={services?.pickImagePath}
        currencyUnits={selectedCurrencyUnits}
        currencyEnabled={selectedCurrencyEnabled}
        timeRequirementsEnabled={selectedTimeRequirementsEnabled}
        toolsLibrary={recipeToolsLibrary}
        componentOptions={selectedSystem?.managedItemOptions || []}
        componentTagOptions={selectedSystem?.componentTagOptions || []}
        essenceOptions={selectedSystem?.features?.essences
          ? selectedSystem?.essenceDefinitions || []
          : []}
        itemTags={selectedSystem?.itemTags || []}
        checkTierOptions={recipeCheckTierOptions}
        minSuccessTierOptions={recipeMinSuccessTierOptions}
        craftingModifierOptions={selectedSystemModifiers}
        craftingModifierPolicy={selectedSystem?.craftingCheck?.defaultModifierPolicy || 'addAll'}
        craftingModifierDefaultIds={selectedSystem?.craftingCheck?.defaultModifierIds || []}
        craftingModifierMaxPicks={selectedSystem?.craftingCheck?.maxModifierPicks ?? null}
        craftingModifierInertCause={recipeCraftingModifierInertCause}
        onOpenChecks={() => setView('checks')}
        categories={selectedSystem?.categories || []}
        onSetCategory={handleSetRecipeCategory}
        routingProvider={recipeRoutingProvider}
        routedOutcomeTierOptions={recipeRoutedOutcomeTierOptions}
        routedOutcomeTiersDefined={recipeRoutedHasOutcomeTiers}
        routedFailureResultsAllowed={recipeFailureResultsAllowed}
        alchemy={recipeAlchemy}
        signatureConflicts={recipeSignatureConflicts}
        onOpenComponent={(componentId) => editComponent(componentId)}
        resolutionMode={selectedSystem?.resolutionMode || 'simple'}
        visibilityEffect={recipeVisibilityEffect}
        accessPlayers={recipeAccessRoster.players}
        accessCharacters={recipeAccessRoster.characters}
        {recipeItemDefinitions}
        onRemoveRecipeItem={handleRemoveRecipeItem}
        onOpenItem={(uuid) => services?.onOpenSource?.(uuid)}
        onOpenAccess={openRecipeAccess}
        onOpenBooksScrolls={() => openCraftingSection('books-scrolls')}
        multiStepEnabled={recipeMultiStepEnabled}
        onEnterMultiStep={handleEnterMultiStep}
        onRevertToSingleStep={handleRevertToSingleStep}
        onOpenCraftingSettings={() => openCraftingSection('settings')}
        onUpdateRecipe={(patch) => patchRecipeDraft(patch)}
        onToggleEnabled={handleToggleRecipeEnabled}
        onToggleLocked={handleToggleRecipeLocked}
        onAddStep={handleAddStep}
        onReorderSteps={handleReorderSteps}
        onUpdateStep={handleUpdateStep}
        onDeleteStep={handleDeleteStep}
      />
    {:else if currentView === 'crafting-settings' && selectedSystem}
      <CraftingSettingsView
        {selectedSystem}
        onSetResolutionMode={(nextMode) => store.setResolutionMode?.(nextMode)}
        onSetSalvageResolutionMode={(nextMode) => store.setSalvageResolutionMode?.(nextMode)}
        onSetVisibilityMode={(m) => store.setVisibilityMode?.(m)}
      />
    {:else if currentView === 'access' && selectedSystem}
      <AccessTabView
        recipes={$viewState.recipes || []}
        recipeCategories={$viewState.recipeCategories || []}
        recipeSearchTerm={$viewState.recipeSearchTerm || ''}
        selectedRecipeId={selectedRecipeIdForAccess}
        onSearchChange={(term) => store.setRecipeSearch?.(term)}
        onSelectRecipe={(id) => (selectedRecipeIdForAccess = id)}
      />
    {:else if currentView === 'books-scrolls' && selectedSystem}
      <BooksScrollsView
        recipeItems={recipeItemDefinitions}
        visibilityMode={craftingVisibilityMode}
        {selectedRecipeItemId}
        onSelectRecipeItem={(id) => selectRecipeItem(id)}
        onOpenRecipeItem={(id) => editRecipeItem(id)}
        onDropRecipeItem={(uuid) => dropRecipeItem(uuid)}
        dropEnabled={!!selectedSystemId}
        onToggleEnabled={(id, enabled) => store.setRecipeItemEnabled?.(id, enabled)}
      />
    {:else if currentView === 'knowledge' && selectedSystem}
      <KnowledgeView
        knowledge={knowledgeState}
        selectedSystemName={selectedSystem?.name || ''}
        onSelectActor={(actorId) => store.selectKnowledgeActor?.(actorId)}
        onExpend={(actorId, itemId) => store.expendRecipeItemUse?.(actorId, itemId)}
        onDelete={(actorId, itemId) => store.deleteOwnedRecipeItem?.(actorId, itemId)}
        onErase={(actorId, recipeId) => store.eraseLearnedRecipe?.(actorId, recipeId)}
        onResetSystem={(actorId) => store.resetActorSystemKnowledge?.(actorId)}
        onResetAll={(actorId) => store.resetActorAllKnowledge?.(actorId)}
        bind:browserState={managerBrowserState.knowledgeRoster}
      />
    {:else if currentView === 'recipe-item-edit' && selectedSystem}
      <RecipeItemEditor
        recipeItem={recipeItemDraft}
        linkedItem={recipeItemEditorLinkedItem}
        linkedRecipes={recipeItemEditorLinkedRecipes}
        availableRecipes={recipeItemEditorAvailableRecipes}
        characterPrerequisites={selectedCharacterPrerequisites}
        visibilityMode={craftingVisibilityMode}
        activeTab={recipeItemActiveTab}
        onSelectTab={(tab) => (recipeItemActiveTab = tab)}
        onPatch={(patch) => patchRecipeItemDraft(patch)}
        onLinkItem={(uuid) => linkRecipeItemSource(uuid)}
        onUnlinkItem={() => unlinkRecipeItemSource()}
        onCopyItemUuid={(uuid) => copyComponentSource(uuid)}
        onLinkRecipe={(id) => linkRecipeToItem(id)}
        onRemoveRecipe={(id) => unlinkRecipeFromItem(id)}
      />
    {:else if currentView === 'recipes'}
      <RecipesBrowserView
        recipes={$viewState.recipes || []}
        recipeCategories={$viewState.recipeCategories || []}
        recipeSearchTerm={$viewState.recipeSearchTerm || ''}
        selectedRecipeId={selectedRecipe?.id || ''}
        {selectedSystemId}
        {showRecipeCategories}
        resolutionMode={selectedSystem?.resolutionMode || 'simple'}
        bind:browserState={recipeBrowserState}
        onSearchChange={(term) => store.setRecipeSearch?.(term)}
        onSelectRecipe={(id) => selectRecipe(id)}
        onEditRecipe={(id) => editRecipe(id)}
        onToggleEnabled={(id, enabled, options) => toggleRecipeEnabled(id, enabled, options)}
        onToggleLocked={(id, locked) => store.toggleRecipeLocked?.(id, locked)}
        onSelectionCleared={() => recipeBulk.announceCleared()}
      />
    {:else if currentView === 'system-edit' && selectedSystem}
      <main
        class="manager-main manager-environment-edit-main"
        aria-label={text('FABRICATE.Admin.Manager.SystemEdit.Title', 'System settings')}
      >
        <section class="manager-environment-editor-shell">
          <SystemEditView
            {selectedSystem}
            systemBlocked={systemBlocksSystem}
            validationReport={systemValidationReport}
            requestedTab={requestedSystemTab}
            requestedTabNonce={requestedSystemTabNonce}
            onSelectIssue={(issue) => selectOverviewIssue(issue)}
            onShowSystemOverview={showSystemOverview}
            onSaveDetails={(name, description) => store.saveSystemDetails?.(name, description)}
            onDetailsChange={(name, description) => {
              systemDetailsDraft = { name, description };
            }}
            onDirtyChange={(dirty) => {
              systemDetailsDirty = dirty;
            }}
            reseedNonce={systemDetailsReseedNonce}
            onToggleFeature={(storeKey, checked) => store.toggleFeature?.(storeKey, checked)}
            modifierLibrary={selectedSystemModifiers}
            modifierPresetsSupported={characterModifierPresetsSupported}
            {foundrySystemId}
            onAddModifier={onAddCharacterModifier}
            onUpdateModifier={onUpdateCharacterModifier}
            onDeleteModifier={onDeleteCharacterModifier}
            onReorderModifier={onReorderCharacterModifier}
            onSeedModifierPresets={onSeedCharacterModifierPresets}
            requestedSectionNonce={requestedSystemModifierSectionNonce}
            characterPrerequisiteLibrary={selectedCharacterPrerequisites}
            {characterPrerequisitePresetsSupported}
            {onAddCharacterPrerequisite}
            {onUpdateCharacterPrerequisite}
            {onDeleteCharacterPrerequisite}
            {onReorderCharacterPrerequisite}
            {onSeedCharacterPrerequisitePresets}
            onToggleCurrency={(next) => store.toggleRequirement?.('currency', next)}
            onToggleGatheringRealms={(next) =>
              store.setGatheringRealmsEnabled?.(selectedSystemId, next)}
            onToggleTime={(next) => store.toggleRequirement?.('time', next)}
          />
        </section>
      </main>
    {:else}
      <SystemsBrowserView
        systems={$viewState.systems || []}
        {systemsLoading}
        {selectedSystemId}
        onSelectSystem={(id) => selectSystemRow(id)}
        onCreateSystem={createSystem}
        onEditSystem={(id) => editSystem(id)}
        onExportSystem={(id) => exportSystem(id)}
        onDeleteSystem={(id) => deleteSystem(id)}
        onToggleSystemEnabled={(id, enabled) => store.toggleSystemEnabled?.(id, enabled)}
        bind:browserState={managerBrowserState.systems}
      />
    {/if}

    <!-- Suppressing the aside here and releasing the column in `styles/fabricate.css`
         are ONE decision expressed twice — do only the first and a 300px empty box still
         holds the strip open; do only the second and this (empty) aside wraps to an
         implicit grid row underneath the editor.

         THE TWO LISTS ARE NO LONGER KEPT IN STEP BY HAND. This condition is BUILT from
         `FULL_WIDTH_VIEWS` above, which is the one place the decision is recorded, and
         `tests/manager-full-width-gate.test.js` asserts that set against the stylesheet's
         own. A twelve-clause chain restated here is exactly how the two drifted twice:
         `checks` was released in the root and matched nothing in the sheet (issue 1096),
         and `world-currency` the same way (issue 1311), each rendering against a ~300px
         dead strip.

         It reads the UNION of both aside-suppressing classes rather than the full-width
         subset alone: `tool-edit` and `knowledge` suppress the aside AND keep three
         tracks, so a full-width-only test would put their inspector back. -->
    {#if !fullWidthLayout}
      <aside class="manager-inspector" aria-label={inspectorLabel()}>
        <!-- `world-travel` belongs in this list even though it renders its own `manager-main`:
             the travel inspector is a BRANCH of the chain nested inside here, so leaving the
             route out makes that branch unreachable and the aside falls through to nothing.
             The symptom is silent — the route commits, its panel renders, and only the detail
             pane is missing, which is why only the view lab caught it. -->
        {#if currentView === 'world' || currentView === 'environments' || currentView === 'environment-edit' || currentView === 'gathering-task-edit' || currentView === 'gathering-event-edit' || isWorldTravelRoute}
          <GatheringInspectorRail
            {currentView}
            displayedGatheringTab={gathering.displayedGatheringTab}
            {isWorldTravelRoute}
            activeGatheringInspectorTab={gathering.activeGatheringInspectorTab}
            selectedGatheringTask={gathering.selectedGatheringTask}
            editingGatheringTask={gathering.editingGatheringTask}
            selectedGatheringDrop={gathering.selectedGatheringDrop}
            activeGatheringTaskEnvironmentCount={gathering.activeGatheringTaskEnvironmentCount}
            gatheringTaskAvailability={gathering.gatheringTaskAvailability}
            {gatheringTaskDropRows}
            {gatheringTaskImage}
            gatheringTaskName={gathering.gatheringTaskName}
            gatheringTaskReferencingEnvironments={gathering.gatheringTaskReferencingEnvironments}
            {gatheringDropCountValue}
            gatheringDropImage={gathering.gatheringDropImage}
            gatheringDropName={gathering.gatheringDropName}
            {gatheringDropRateTierClass}
            {gatheringDropRateTierColor}
            {gatheringDropRateValue}
            gatheringDropModifierPickerSelection={modifiers.gatheringDropModifierPickerSelection}
            characterModifierSearchSuggestions={modifiers.characterModifierSearchSuggestions}
            selectedGatheringEvent={gathering.selectedGatheringEvent}
            editingGatheringEvent={gathering.editingGatheringEvent}
            activeGatheringEventEnvironmentCount={gathering.activeGatheringEventEnvironmentCount}
            gatheringEventReferencingEnvironments={gathering.gatheringEventReferencingEnvironments}
            gatheringEventModifierPickerSelection={modifiers.gatheringEventModifierPickerSelection}
            eventCharacterModifierSearchSuggestions={modifiers.eventCharacterModifierSearchSuggestions}
            {sortedDangerTags}
            {selectedSystemModifiers}
            characterModifierSearchOpenUp={modifiers.characterModifierSearchOpenUp}
            gatheringConditionAvailableOptions={modifiers.gatheringConditionAvailableOptions}
            gatheringConditionLabel={gathering.gatheringConditionLabel}
            gatheringConditionModifierRows={modifiers.gatheringConditionModifierRows}
            gatheringModifierCardHint={gathering.gatheringModifierCardHint}
            gatheringModifierCardTitle={gathering.gatheringModifierCardTitle}
            {gatheringModifierDisplayValue}
            gatheringModifierKindIcon={gathering.gatheringModifierKindIcon}
            {gatheringModifierValueClass}
            {signedToOperatorValue}
            rowCharacterModifiers={modifiers.rowCharacterModifiers}
            characterModifierIconForRef={modifiers.characterModifierIconForRef}
            characterModifierIsCustomized={modifiers.characterModifierIsCustomized}
            characterModifierLabelForRef={modifiers.characterModifierLabelForRef}
            characterModifierLibraryEntry={modifiers.characterModifierLibraryEntry}
            characterModifierOperatorClass={modifiers.characterModifierOperatorClass}
            selectedGatheringRules={gathering.selectedGatheringRules}
            {worldTravelTab}
            {selectedTravelRealm}
            {selectedMapRegion}
            {worldRealms}
            selectedEnvironment={gathering.selectedEnvironment}
            selectedEnvironmentFacts={gathering.selectedEnvironmentFacts}
            selectedEnvironmentSceneState={gathering.selectedEnvironmentSceneState}
            environmentList={gathering.environmentList}
            environmentValidationCount={gathering.environmentValidationCount}
            environmentDirtyFor={gathering.environmentDirtyFor}
            environmentInvalidFor={gathering.environmentInvalidFor}
            environmentImage={gathering.environmentImage}
            environmentName={gathering.environmentName}
            environmentSelectionModeLabel={gathering.environmentSelectionModeLabel}
            environmentStatusLabel={gathering.environmentStatusLabel}
            hasEnvironmentImage={gathering.hasEnvironmentImage}
            {truncateDescription}
            travelSaving={$viewState.travelSaving === true}
            environmentSaveError={$viewState.environmentSaveError}
            bind:characterModifierSearchAnchor={modifiers.characterModifierSearchAnchor}
            bind:characterModifierSearchTerm={modifiers.characterModifierSearchTerm}
            onDuplicateDrop={drafts.duplicateGatheringTaskDrop}
            onDeleteDrop={drafts.deleteGatheringTaskDrop}
            onUpdateDrop={drafts.updateGatheringTaskDrop}
            onDropCountInput={drafts.onGatheringDropCountInput}
            onDropCountBlur={drafts.onGatheringDropCountBlur}
            onDropCountKeydown={drafts.onGatheringDropCountKeydown}
            onSelectDropModifierPickerOption={modifiers.setGatheringDropModifierPickerSelection}
            onAddDropConditionModifier={modifiers.addGatheringDropModifier}
            onUpdateDropConditionModifier={modifiers.updateGatheringDropModifier}
            onDropConditionModifierKeydown={modifiers.onGatheringDropModifierKeydown}
            onDeleteDropConditionModifier={modifiers.deleteGatheringDropModifier}
            onPickDropCharacterModifier={modifiers.pickCharacterModifierForRow}
            onUpdateDropCharacterModifier={modifiers.onUpdateDropCharacterModifier}
            onDeleteDropCharacterModifier={modifiers.onDeleteDropCharacterModifier}
            onSetDropCharacterModifierOverride={modifiers.setCharacterModifierOverrideEnabled}
            onSelectEventModifierPickerOption={modifiers.setGatheringEventModifierPickerSelection}
            onAddEventConditionModifier={modifiers.addGatheringEventConditionModifier}
            onUpdateEventConditionModifier={modifiers.updateGatheringEventConditionModifier}
            onEventConditionModifierKeydown={modifiers.onGatheringEventModifierKeydown}
            onDeleteEventConditionModifier={modifiers.deleteGatheringEventConditionModifier}
            onPickEventCharacterModifier={modifiers.pickCharacterModifierForEvent}
            onUpdateEventCharacterModifier={modifiers.onUpdateEventCharacterModifier}
            onDeleteEventCharacterModifier={modifiers.onDeleteEventCharacterModifier}
            onSetEventCharacterModifierOverride={modifiers.setEventCharacterModifierOverrideEnabled}
            onUpdateRules={drafts.updateSelectedGatheringRules}
            onDeleteRealm={(realmId) => store.deleteRealm?.(realmId)}
            onRenameRealm={(realmId, name) => store.renameRealm?.(realmId, name)}
          />
        {:else if currentView === 'essences' || currentView === 'essence-edit'}
          <!--
          Three mutually exclusive rail states, in priority order (issue 1036):
        -->
          {#if currentView === 'essence-edit' && essenceEditDraft}
            <EssenceBehaviorPreview
              essence={essenceEditDraft}
              effectTransferEnabled={showEssenceSourceUi}
              propertyMacrosEnabled={showEssencePropertyMacroUi}
              sourceName={essenceEditDraft.sourceName || ''}
              macroName={essenceEditDraft.macroName ||
                essenceShortValueName(essenceEditDraft.propertyMacroUuid)}
              inherited={inspectedEssenceInherited}
              sampleComponentName={essenceEditDraft.componentUsageItems?.[0]?.name || ''}
            />
          {:else if currentView === 'essences' && essenceBulk.count > 0}
            <EssenceBulkEditPanel
              count={essenceBulk.count}
              selectedRows={essenceBulk.rows}
              draft={essenceBulkDraft}
              applying={essenceBulkApplying}
              deleting={essenceBulkDeleting}
              deleteArmed={essenceBulkDeleteArmed}
              deleteOutcome={essenceBulkDeleteOutcome}
              onDraftChange={(next) => stageEssenceBulkDraft(next)}
              onClearSelection={() => essenceBulk.clear()}
              onApply={() => applyEssenceBulkEdit()}
              onArmDelete={() => armEssenceBulkDelete()}
              onDisarmDelete={() => (essenceBulkDeleteArmed = false)}
              onDelete={(ids) => deleteSelectedEssences(ids)}
            />
          {:else if selectedEssenceForInspector}
            <EssenceBrowserInspector
              essence={selectedEssenceForInspector}
              showSourceUi={showEssenceSourceUi}
              showPropertyMacroUi={showEssencePropertyMacroUi}
              managedItemOptions={selectedSystem?.managedItemOptions || []}
              sourceUuid={selectedEssenceSourceUuid()}
              systemName={selectedSystem?.name || ''}
              inherited={inspectedEssenceInherited}
              systemRows={inspectedEssenceSystemRows}
              memberCount={Number(inspectedEssenceWorldEntry?.membershipCount) || 0}
              rosterSize={allSystems.length}
              membershipActions={store?.worldScope?.essence ?? null}
              onOpenSystemRules={(entityId, systemId) => openSystemEssenceRules(entityId, systemId)}
              onEdit={(id) => editEssence(id)}
              onOpenWorldDefinition={(id) => openWorldScopedEntry('world-essence-entry', id)}
              onDelete={(id) => removeEssence(id)}
              onEditComponent={(id) => editComponent(id)}
              onCopySource={copySelectedEssenceSource}
              onUnlinkSource={unlinkSelectedEssenceSource}
              onSourceDrop={handleInspectorEssenceSourceDrop}
              onSourceSelect={handleInspectorEssenceSourceSelect}
            />
          {:else if currentView === 'essences' && essenceCards.length === 0}
            <section
              class="manager-setup-card"
              aria-label={text(
                'FABRICATE.Admin.Manager.Essence.EmptySetup.Title',
                'Set up essences'
              )}
            >
              <div class="manager-setup-card-header">
                <i class="fas fa-mortar-pestle" aria-hidden="true"></i>
                <div>
                  <p class="manager-kicker">
                    {text('FABRICATE.Admin.Manager.Essence.EmptySetup.Kicker', 'Essence setup')}
                  </p>
                  <h3>
                    {text('FABRICATE.Admin.Manager.Essence.EmptySetup.Title', 'Set up essences')}
                  </h3>
                </div>
              </div>
              <p class="manager-muted">
                {text(
                  'FABRICATE.Admin.Manager.Essence.EmptySetup.Hint',
                  'Create the first essence definition for this system, then assign quantities to components that should contribute that essence.'
                )}
              </p>
              <ol class="manager-setup-list">
                <li>
                  {text(
                    'FABRICATE.Admin.Manager.Essence.EmptySetup.StepCreate',
                    'Create an essence with a clear name, icon, and description.'
                  )}
                </li>
                <li>
                  {text(
                    'FABRICATE.Admin.Manager.Essence.EmptySetup.StepAssign',
                    'Edit components to assign essence quantities that recipes can require.'
                  )}
                </li>
                <li>
                  {text(
                    'FABRICATE.Admin.Manager.Essence.EmptySetup.StepTransfer',
                    'If effect transfer is enabled, link source components whose effects should carry to crafted results.'
                  )}
                </li>
              </ol>
              <div
                class="manager-setup-links"
                aria-label={text(
                  'FABRICATE.Admin.Manager.Essence.EmptySetup.Resources',
                  'Essence resources'
                )}
              >
                <ManagerButton
                  tag="a"
                  href="https://mistersilver-uk.github.io/fabricate/essences"
                  target="_blank"
                  rel="noreferrer"
                >
                  <i class="fas fa-book-open" aria-hidden="true"></i>
                  <span
                    >{text(
                      'FABRICATE.Admin.Manager.Essence.EmptySetup.EssenceDocs',
                      'Essence docs'
                    )}</span
                  >
                </ManagerButton>
                <ManagerButton
                  tag="a"
                  href="https://mistersilver-uk.github.io/fabricate/essences/effect-transfer"
                  target="_blank"
                  rel="noreferrer"
                >
                  <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
                  <span
                    >{text(
                      'FABRICATE.Admin.Manager.Essence.EmptySetup.EffectTransferDocs',
                      'Effect transfer'
                    )}</span
                  >
                </ManagerButton>
              </div>
            </section>
          {:else}
            <EmptyState
              icon="fas fa-mortar-pestle"
              title={currentView === 'essence-edit'
                ? text('FABRICATE.Admin.Manager.Essence.CreateInspectorTitle', 'New essence draft')
                : text('FABRICATE.Admin.Manager.Essence.SelectEssence', 'Select an essence')}
              hint={currentView === 'essence-edit'
                ? text(
                    'FABRICATE.Admin.Manager.Essence.CreateInspectorHint',
                    'The inspector will show the essence ID after the draft is saved.'
                  )
                : showEssenceSourceUi
                  ? text(
                      'FABRICATE.Admin.Manager.Essence.InspectorHint',
                      'The inspector shows source linkage and component usage for the selected essence.'
                    )
                  : text(
                      'FABRICATE.Admin.Manager.Essence.InspectorNoSourceHint',
                      'The inspector shows identity and component usage for the selected essence.'
                    )}
            />
          {/if}
        {:else if currentView === 'components'}
          <!--
          The bulk panel REPLACES the single-component inspector while the selection is non-empty
           (issue 772) — the prototype's `bulkOn` / `bulkOff` swap, at its `> 0` threshold.
        -->
          {#if componentBulk.count > 0}
            <ComponentBulkEditPanel
              count={componentBulk.count}
              systemName={selectedSystem?.name || ''}
              categoryOptions={componentBulkCategoryOptions}
              tags={selectedSystem?.itemTags || []}
              showEssences={selectedSystem?.features?.essences === true}
              essenceDefinitions={selectedSystem?.essenceDefinitions || []}
              showProgressiveDifficulty={componentDifficultyAxisProgressive}
              selectedCards={componentBulk.rows}
              draft={componentBulkDraft}
              applying={componentBulkApplying}
              deleting={componentBulkDeleting}
              deleteArmed={componentBulkDeleteArmed}
              deleteImpact={componentBulkDeleteImpact}
              deleteOutcome={componentBulkDeleteOutcome}
              onDraftChange={(next) => stageComponentBulkDraft(next)}
              onClearSelection={() => componentBulk.clear()}
              onApply={() => applyComponentBulkEdit()}
              onArmDelete={() => armComponentBulkDelete()}
              onDisarmDelete={() => (componentBulkDeleteArmed = false)}
              onDelete={(ids) => deleteSelectedComponents(ids)}
            />
          {:else if selectedComponent}
            <!--
              THE WORLD FACTS THE IN-SYSTEM CARD CANNOT ANSWER (issue 1371, parity round 4).
            -->
            <ComponentBrowserInspector
              {selectedComponent}
              showTags={showComponentTags}
              worldEntry={componentInspectorWorldEntry}
              worldSystemRow={componentInspectorWorldSystemRow}
              systemName={selectedSystem?.name || ''}
              salvageFeatureEnabled={componentSalvageEnabled}
              salvageModeLabel={componentSalvageModeLabel}
              onEditSystemRules={() => editComponent(selectedComponent?.id)}
              onOpenWorldEntry={(entityId) =>
                openWorldScopedEntry('world-component-entry', entityId)}
              onCopySourceUuid={(uuid) => copyComponentSource(uuid)}
              onUnlink={(id) => unlinkComponentSource(id)}
              onDelete={(id) => deleteComponent(id)}
            />
          {:else if itemCards.length === 0}
            <section
              class="manager-setup-card"
              aria-label={text(
                'FABRICATE.Admin.Manager.Component.EmptySetup.Title',
                'Set up components'
              )}
            >
              <div class="manager-setup-card-header">
                <i class="fas fa-box-open" aria-hidden="true"></i>
                <div>
                  <p class="manager-kicker">
                    {text('FABRICATE.Admin.Manager.Component.EmptySetup.Kicker', 'Component setup')}
                  </p>
                  <h3>
                    {text(
                      'FABRICATE.Admin.Manager.Component.EmptySetup.Title',
                      'Set up components'
                    )}
                  </h3>
                </div>
              </div>
              <p class="manager-muted">
                {text(
                  'FABRICATE.Admin.Manager.Component.EmptySetup.Hint',
                  'Import item-backed components before recipes can reference ingredients, tools, results, or essence sources.'
                )}
              </p>
              <ol class="manager-setup-list">
                <li>
                  {text(
                    'FABRICATE.Admin.Manager.Component.EmptySetup.StepImport',
                    'Drop world, compendium, pack, or folder items into the component browser.'
                  )}
                </li>
                <li>
                  {text(
                    'FABRICATE.Admin.Manager.Component.EmptySetup.StepOrganize',
                    'Add tags, essences, source links, and difficulty metadata where the selected system uses them.'
                  )}
                </li>
                <li>
                  {text(
                    'FABRICATE.Admin.Manager.Component.EmptySetup.StepRecipes',
                    'Use the managed components as recipe requirements, tools, and results.'
                  )}
                </li>
              </ol>
              <div
                class="manager-setup-links"
                aria-label={text(
                  'FABRICATE.Admin.Manager.Component.EmptySetup.Resources',
                  'Component resources'
                )}
              >
                <ManagerButton
                  tag="a"
                  href="https://mistersilver-uk.github.io/fabricate/components/"
                  target="_blank"
                  rel="noreferrer"
                >
                  <i class="fas fa-book-open" aria-hidden="true"></i>
                  <span
                    >{text(
                      'FABRICATE.Admin.Manager.Component.EmptySetup.ComponentDocs',
                      'Component docs'
                    )}</span
                  >
                </ManagerButton>
                <ManagerButton
                  tag="a"
                  href="https://mistersilver-uk.github.io/fabricate/help/quickstart"
                  target="_blank"
                  rel="noreferrer"
                >
                  <i class="fas fa-circle-question" aria-hidden="true"></i>
                  <span
                    >{text(
                      'FABRICATE.Admin.Manager.Component.EmptySetup.Quickstart',
                      'Quickstart'
                    )}</span
                  >
                </ManagerButton>
              </div>
            </section>
          {:else}
            <EmptyState
              icon="fas fa-boxes"
              title={text(
                'FABRICATE.Admin.Manager.Component.SelectComponent',
                'Select a component'
              )}
              hint={text(
                'FABRICATE.Admin.Manager.Component.InspectorHint',
                'The inspector shows component identity, origin, tags, essences, and source copy context for the selected row.'
              )}
            />
          {/if}
        {:else if currentView === 'recipes'}
          <!--
          The bulk panel REPLACES the single-recipe inspector while the selection is non-empty
           (issue 1010), at the same `> 0` threshold the Component Studio uses.
        -->
          {#if recipeBulk.count > 0}
            <RecipeBulkEditPanel
              count={recipeBulk.count}
              categoryOptions={recipeBulkCategoryOptions}
              checkTierAxis={recipeBulkCheckTierAxis}
              checkTierOptions={recipeCheckTierOptions}
              books={recipeItemDefinitions}
              bookMembership={recipeBulkBookMembership}
              blockedCount={recipeBulkBlockedCount}
              draft={recipeBulkDraft}
              applying={recipeBulkApplying}
              deleting={recipeBulkDeleting}
              deleteArmed={recipeBulkDeleteArmed}
              deleteImpact={recipeBulkDeleteImpact}
              deleteOutcome={recipeBulkDeleteOutcome}
              onDraftChange={(next) => stageRecipeBulkDraft(next)}
              onClearSelection={() => recipeBulk.clear()}
              onApply={() => applyRecipeBulkEdit()}
              onArmDelete={() => armRecipeBulkDelete()}
              onDisarmDelete={() => (recipeBulkDeleteArmed = false)}
              onDelete={(ids) => deleteSelectedRecipes(ids)}
            />
          {:else}
            <RecipeBrowserInspector
              {selectedRecipe}
              resolutionMode={selectedSystem?.resolutionMode || 'simple'}
              outcomeTiers={recipeAllOutcomeTierOptions}
              recipeCount={($viewState.recipes || []).length}
              componentCount={selectedCounts.components}
              componentOptions={selectedSystem?.managedItemOptions || []}
              essenceOptions={selectedSystem?.features?.essences
                ? selectedSystem?.essenceDefinitions || []
                : []}
              {showRecipeCategories}
              showVisibilitySummary={$viewState.showVisibilitySummary}
              onEdit={() => editRecipe(selectedRecipe?.id)}
              onDuplicate={() => duplicateRecipe()}
              onDelete={() => deleteRecipe()}
              onAddComponents={() => setView('components')}
            />
          {/if}
        {:else if currentView === 'tools'}
          <ToolBrowserInspector
            tool={inspectedLibraryTool}
            managedItems={selectedSystem?.managedItemOptions || []}
            prerequisiteOptions={selectedCharacterPrerequisites}
            authority={selectedSystem?.toolBreakage?.authority || 'toolSpecific'}
            systemName={selectedSystem?.name || ''}
            unadopted={unadoptedWorldTool}
            inherited={selectedLibraryToolInherited}
            onEdit={openToolEditor}
            onEditWorldTool={(entityId) => openWorldScopedEntry('world-tool-entry', entityId)}
            onAddToSystem={(entityId) => adoptWorldToolIntoSystem(entityId)}
          />
        {:else if currentView === 'component-edit'}
          <!-- NO RIGHT RAIL (issue 676, decision 4). The component editor is a single
             scrolling column: the source actions rehomed into the identity strip and
             the progressive-difficulty control into the body, both inside
             ComponentEditView. Nothing was lost — see ComponentIdentityStrip. -->
        {:else if currentView === 'access'}
          <GrantAccessInspector
            recipe={selectedRecipeForAccess}
            characters={store.getPcRoster?.() || []}
            players={$viewState.worldUsers || []}
            onSaveAccess={(id, grant) => store.saveRecipeAccess?.(id, grant)}
            bind:browserState={managerBrowserState.recipeAccess}
          />
        {:else if currentView === 'books-scrolls'}
          <ItemPageInspector
            item={selectedRecipeItem}
            visibilityMode={craftingVisibilityMode}
            onOpenRecipeItem={(id) => editRecipeItem(id)}
            onToggleEnabled={(id, enabled) => store.setRecipeItemEnabled?.(id, enabled)}
            onToggleQuickLimit={(id, limited) => toggleRecipeItemQuickLimit(id, limited)}
          />
        {:else}
          <SystemBrowserInspector
            {store}
            {selectedSystem}
            {selectedSystemId}
            {selectedCounts}
            {systemsLoading}
            systems={$viewState.systems}
            gatheringConfig={$viewState.gatheringConfig}
            {resolutionModeLabel}
          />
        {/if}
      </aside>
    {/if}
  </div>

  <ImportFolderMappingModal
    open={importFlow.importMappingOpen}
    folders={importFlow.importMappingFolders}
    componentCategories={selectedSystem?.componentCategories || []}
    itemTags={selectedSystem?.itemTags || []}
    onAddCategory={addComponentCategory}
    onCommit={importFlow.commitImportFolderMapping}
    onClose={() => (importFlow.importMappingOpen = false)}
  />

  <ImportReportModal
    open={importFlow.importReportContent !== null}
    content={importFlow.importReportContent}
    onClose={() => (importFlow.importReportContent = null)}
  />

  <!--
    THE SYSTEM COMPONENT RULES LIST'S `Add from catalogue` PICKER (issue 1371, M9).
  -->
  <ComponentAddFromCatalogueDialog
    open={componentAddFromCatalogueOpen}
    systemId={selectedSystemId || ''}
    systemName={selectedSystem?.name || ''}
    entries={worldScopeState.component?.entries ?? []}
    onAdd={async (entityId, targetSystemId) =>
      (await store?.worldScope?.component?.addToSystem?.(entityId, targetSystemId)) === true}
    onClose={() => (componentAddFromCatalogueOpen = false)}
  />

  <!--
    THE MANAGER'S ONE PERSISTENT LIVE REGION (issue 1157).
  -->
  <p
    class="visually-hidden"
    aria-live="polite"
    aria-atomic="true"
    data-manager-bulk-selection-announce
  >
    {#key bulkSelectionAnnouncement}{#if bulkSelectionAnnouncement?.text}<span
          >{bulkSelectionAnnouncement.text}</span
        >{/if}{/key}
  </p>
</div>

<!--
  THE WORLD TOOL ENTRY'S HEADER `Delete` (issue 1373).
-->
{#snippet worldToolDeleteAction()}
  <ArmedDangerButton
    token={worldToolEntryDelete?.token ?? ''}
    armed={Boolean(worldToolEntryDelete?.token) &&
      worldToolEntryDeleteArmed === worldToolEntryDelete.token}
    idleLabel={worldToolEntryDelete?.label ?? ''}
    armedLabel={worldToolEntryDelete?.armedLabel ?? ''}
    idleAriaLabel={worldToolEntryDelete?.idleAriaLabel ?? ''}
    armedAriaLabel={worldToolEntryDelete?.armedAriaLabel ?? ''}
    onArm={(token) => (worldToolEntryDeleteArmed = token)}
    onDisarm={() => (worldToolEntryDeleteArmed = '')}
    onConfirm={() => {
      worldToolEntryDeleteArmed = '';
      worldToolEntryDelete?.run?.();
    }}
  />
{/snippet}
