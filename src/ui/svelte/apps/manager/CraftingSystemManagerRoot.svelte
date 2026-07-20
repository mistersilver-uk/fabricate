<!-- Svelte 5 runes mode -->
<script>
  import {
    DEFAULT_GATHERING_ENVIRONMENT_IMG,
    DEFAULT_GATHERING_EVENT_IMG,
    DEFAULT_GATHERING_TASK_IMG
  } from '../../../../gatheringImageDefaults.js';
  import { localize, notifyWarn } from '../../util/foundryBridge.js';
  import {
    routedSuccessTierOptions,
    routedOutcomeTierOptions,
    routedHasOutcomeTiers,
    routedOutcomeTierCount,
    routedOutcomeTierNames,
    resolveRecipeCheckTierOptions,
    resolveRecipeFixedOutcomeTierOptions
  } from '../../../../utils/routedOutcomeKeywords.js';
  import {
    getRecipeCategoryLabel,
    normalizeRecipeCategory
  } from '../../../../utils/recipeCategories.js';
  import {
    getComponentCategoryLabel,
    normalizeComponentCategory
  } from '../../../../utils/componentCategories.js';
  import { categoryIconFor } from '../../../../utils/categoryIcons.js';
  import { buildVocabularyUsage } from '../../../../utils/vocabularyUsage.js';
  import { createRecipeBrowserState } from '../../../../utils/recipeBrowserModel.js';
  import { createComponentBrowserState } from '../../../../utils/componentBrowserModel.js';
  import { resolveRecipeImage } from '../../util/craftingImageDefaults.js';
  import Medallion from '../../components/Medallion.svelte';
  import { buildComponentEditorState } from '../../util/componentEditor.js';
  import { getCurrencyProvidersForFoundrySystem } from '../../../../config/currencyProviders.js';
  import ComponentEditView from './ComponentEditView.svelte';
  import ComponentEditorHeader from './component/ComponentEditorHeader.svelte';
  import ComponentsBrowserView from './ComponentsBrowserView.svelte';
  import ChecksView from './checks/ChecksView.svelte';
  import EnvironmentEditView from './EnvironmentEditView.svelte';
  import EnvironmentsBrowserView from './EnvironmentsBrowserView.svelte';
  import EssenceBrowserView from './EssenceBrowserView.svelte';
  import EssenceEditView from './EssenceEditView.svelte';
  import GatheringTaskEditView from './GatheringTaskEditView.svelte';
  import GatheringEventEditView from './GatheringEventEditView.svelte';
  import RealmNameField from './RealmNameField.svelte';
  import ToolsBrowserView from './ToolsBrowserView.svelte';
  import EssenceSourceSelector from '../../components/EssenceSourceSelector.svelte';
  import Pagination from '../../components/Pagination.svelte';
  import RecipesBrowserView from './RecipesBrowserView.svelte';
  import RecipeBrowserInspector from './recipes/RecipeBrowserInspector.svelte';
  // The component library's inspector (issue 676) — the sibling of the above. It lives
  // under `components/` (the BROWSER's dir), NOT `component/`, which the screenshot map
  // globs for the component EDITOR's frames.
  import ComponentBrowserInspector from './components/ComponentBrowserInspector.svelte';
  import BooksScrollsView from './BooksScrollsView.svelte';
  import CraftingSettingsView from './CraftingSettingsView.svelte';
  import AccessTabView from './AccessTabView.svelte';
  import GrantAccessInspector from './GrantAccessInspector.svelte';
  import ItemPageInspector from './ItemPageInspector.svelte';
  import RecipeItemEditor from './RecipeItemEditor.svelte';
  import ItemPickerModal from './ItemPickerModal.svelte';
  import {
    buildCraftingNavItems,
    activeCraftingTab as resolveActiveCraftingTab,
    isCraftingRoute as isCraftingView,
  } from './crafting/craftingNav.js';
  import RecipeEditView from './RecipeEditView.svelte';
  import { craftingEffect } from './crafting/craftingVisibility.js';
  import SystemEditView from './SystemEditView.svelte';
  import SystemsBrowserView from './SystemsBrowserView.svelte';
  import TagsCategoriesView from './TagsCategoriesView.svelte';

  let { store, services = null } = $props();

  // svelte-ignore state_referenced_locally
  const viewState = store.viewState;

  let activeView = $state('systems');
  // The tab the System Overview page (`system-edit`) should open on. The standalone
  // overview route was folded into this page as its Validation tab; bumping
  // `requestedSystemTabNonce` alongside `requestedSystemTab` lets a deep link (or the
  // blocker banner) force the Validation tab open even when the page is already shown.
  let requestedSystemTab = $state('settings');
  let requestedSystemTabNonce = $state(0);
  let selectedRecipeId = $state('');
  let selectedComponentId = $state('');
  let selectedEssenceId = $state('');
  let lastComponentSystemId = $state('');
  let lastEssenceSystemId = $state('');
  let lastGatheringSystemId = $state('');
  let essenceEditDirty = $state(false);
  let essenceEditSaving = $state(false);
  let essenceEditDraft = $state(null);
  let componentEditDirty = $state(false);
  let componentEditSaving = $state(false);
  let componentEditDraft = $state(null);
  // The System Overview → Settings identity form (Name + Description) stages its
  // typed values in `SystemEditView` locally; they are lifted here so the
  // route-exit guard can Save on navigate. `systemDetailsReseedNonce` is bumped on
  // Discard to force the view to re-seed its inputs from the persisted system.
  let systemDetailsDraft = $state({ name: '', description: '' });
  let systemDetailsDirty = $state(false);
  let systemDetailsReseedNonce = $state(0);
  // Staged progressive-difficulty value for the component being edited (number or
  // null). Seeded on edit-entry; persisted with the rest of the draft on Save.
  let componentDifficultyDraft = $state(null);
  let recipeEditSaving = $state(false);
  let recipeSaveFailed = $state(false);
  // The recipe editor stages edits in a root-held draft and commits only on Save.
  // `recipeDraft` is the live, edited copy passed down to the editor; `recipeDraftBaseline`
  // is the last-persisted snapshot. Both are deep PLAIN clones so JSON.stringify
  // comparison drives the dirty flag (mirrors the gathering-task/event editors).
  let recipeDraft = $state(null);
  let recipeDraftBaseline = $state(null);
  // The recipe browser's filter / sort / group / paginate view-state, lifted OUT of
  // RecipesBrowserView so it survives the editor round-trip (issue 643). Opening the
  // editor switches `currentView` to `recipe-edit`, which unmounts the browser; without
  // this the browser remounted with every control reset to defaults, throwing away the
  // page, filters, sort and grouping the GM left. `editRecipe()` never touches it, and
  // `saveRecipeDraft()` / `backToRecipesBrowse()` only flip `activeView`, so on return
  // the browser remounts against this intact object. Fresh open still starts at defaults
  // (this is seeded once, on first mount).
  let recipeBrowserState = $state(createRecipeBrowserState());
  // Same lift, same reason, for the component library (issue 676): its filter/sort/
  // group/page state used to live inside ComponentsBrowserView, so every editor
  // round-trip reset it.
  let componentBrowserState = $state(createComponentBrowserState());
  let activeGatheringTab = $state('environments');
  let activeTravelTab = $state('parties');
  let gatheringMenuExpanded = $state(false);
  // Crafting nav group (issue 511): mirrors the gathering group's expand state.
  // The group is always available as of issue 745 (v1.3 headline); only its
  // expand/collapse state lives here.
  let craftingMenuExpanded = $state(false);
  // The selected recipe item on the Books & Scrolls surface (issue 511).
  let selectedRecipeItemId = $state('');
  // The recipe selected on the Access surface (visibility=restricted); drives the
  // GrantAccessInspector aside.
  let selectedRecipeIdForAccess = $state('');
  // Recipe-item editor draft (recipe-item-edit route). Mirrors the recipe-edit
  // draft pattern: a root-held live draft + last-persisted baseline (deep plain
  // clones) so JSON comparison drives the dirty flag and Discard reverts.
  let recipeItemDraft = $state(null);
  let recipeItemDraftBaseline = $state(null);
  let recipeItemEditSaving = $state(false);
  let recipeItemSaveFailed = $state(false);
  let recipeItemActiveTab = $state('overview');
  // Item picker modal (Create recipe item flow on Books & Scrolls / Overview tab).
  let itemPickerOpen = $state(false);
  let worldItemOptions = $state([]);
  // svelte-ignore state_referenced_locally
  let railCollapsed = $state(services?.getSetting?.('managerRailCollapsed') === true);

  function toggleManagerRail() {
    railCollapsed = !railCollapsed;
    services?.setSetting?.('managerRailCollapsed', railCollapsed);
  }

  function selectTravelTab(tabId) {
    if (['parties', 'realms', 'map'].includes(tabId)) activeTravelTab = tabId;
  }
  let selectedGatheringTaskId = $state('');
  let selectedGatheringEventId = $state('');
  let selectedGatheringDropId = $state('');
  let gatheringTaskDraft = $state(null);
  let gatheringTaskDraftBaseline = $state(null);
  let gatheringTaskSaving = $state(false);
  let gatheringTaskSaveError = $state('');
  let gatheringEventDraft = $state(null);
  let gatheringEventDraftBaseline = $state(null);
  let gatheringEventSaving = $state(false);
  let gatheringEventSaveError = $state('');
  let toolsComponentSearchTerm = $state('');
  let toolsComponentPageIndex = $state(0);
  let toolsComponentPageSize = $state(6);

  // Per-check tool-breakage trigger block (issue 419), carried on every check
  // draft so authoring it under checkDriven authority persists. Deep-clone the
  // persisted block (matching the engine's `{ enabled, triggers[] }` shape) or
  // seed the empty default; triggers carry `{ id, label, condition }`.
  function cloneCheckBreakage(checkBreakage) {
    const source = checkBreakage && typeof checkBreakage === 'object' ? checkBreakage : {};
    return {
      triggers: Array.isArray(source.triggers)
        ? source.triggers.map((trigger) => ({
            id: trigger?.id,
            condition:
              trigger?.condition && typeof trigger.condition === 'object'
                ? { ...trigger.condition }
                : null,
            outcome: ['success', 'failure', 'none'].includes(trigger?.outcome)
              ? trigger.outcome
              : 'none',
            breakTools: trigger?.breakTools === true
          }))
        : []
    };
  }

  // Routed crafting check editor: a staged draft is seeded from the selected
  // system's craftingCheck.routed and committed only via the top-right Save
  // button (the same staged pattern the other editors use), so persistence is
  // explicit and never raced by navigation.
  function cloneRoutedCheck(routed) {
    const source = routed && typeof routed === 'object' ? routed : {};
    const dc = Number(source.dc);
    const rollFormula =
      typeof source.rollFormula === 'string'
        ? source.rollFormula
        : typeof source.rollExpression === 'string'
          ? source.rollExpression
          : '';
    return {
      type: source.type === 'fixed' ? 'fixed' : 'relative',
      rollFormula,
      dc: Number.isFinite(dc) ? Math.trunc(dc) : 15,
      thresholdMode: source.thresholdMode === 'exceed' ? 'exceed' : 'meet',
      tiers: Array.isArray(source.tiers) ? source.tiers.map((tier) => ({ ...tier })) : [],
      relativeOutcomes: Array.isArray(source.relativeOutcomes)
        ? source.relativeOutcomes.map((outcome) => ({ ...outcome }))
        : [],
      fixedOutcomes: Array.isArray(source.fixedOutcomes)
        ? source.fixedOutcomes.map((outcome) => ({ ...outcome }))
        : [],
      checkBreakage: cloneCheckBreakage(source.checkBreakage)
    };
  }
  // svelte-ignore state_referenced_locally
  let checkRoutedDraft = $state(cloneRoutedCheck($viewState.selectedSystem?.craftingCheck?.routed));
  // svelte-ignore state_referenced_locally
  let checkRoutedBaseline = $state(cloneRoutedCheck($viewState.selectedSystem?.craftingCheck?.routed));
  // svelte-ignore state_referenced_locally
  let lastChecksSystemId = $viewState.selectedSystem?.id || '';
  // svelte-ignore state_referenced_locally
  let lastChecksResolutionMode = $viewState.selectedSystem?.resolutionMode || 'simple';
  let checkRoutedSaving = $state(false);
  const checkRoutedDirty = $derived(
    JSON.stringify(checkRoutedDraft) !== JSON.stringify(checkRoutedBaseline)
  );

  // Simple (pass/fail) crafting check draft — same staged pattern, used for simple
  // and alchemy resolution modes.
  function cloneSimpleCheck(simple) {
    const source = simple && typeof simple === 'object' ? simple : {};
    const dc = Number(source.dc);
    return {
      rollFormula: typeof source.rollFormula === 'string' ? source.rollFormula : '',
      dc: Number.isFinite(dc) ? Math.trunc(dc) : 15,
      thresholdMode: source.thresholdMode === 'exceed' ? 'exceed' : 'meet',
      dcMode: source.dcMode === 'dynamic' ? 'dynamic' : 'static',
      tiers: Array.isArray(source.tiers) ? source.tiers.map((tier) => ({ ...tier })) : [],
      macroUuid: source.macroUuid || null,
      checkBreakage: cloneCheckBreakage(source.checkBreakage)
    };
  }
  // svelte-ignore state_referenced_locally
  let checkSimpleDraft = $state(cloneSimpleCheck($viewState.selectedSystem?.craftingCheck?.simple));
  // svelte-ignore state_referenced_locally
  let checkSimpleBaseline = $state(cloneSimpleCheck($viewState.selectedSystem?.craftingCheck?.simple));
  let checkSimpleSaving = $state(false);
  const checkSimpleDirty = $derived(
    JSON.stringify(checkSimpleDraft) !== JSON.stringify(checkSimpleBaseline)
  );

  // Progressive crafting check draft — same staged pattern, used for progressive
  // resolution mode. Only the roll formula and crit table are edited here; the
  // award setting (awardMode) is carried through untouched so a save never drops it.
  function cloneProgressiveCheck(progressive) {
    const source = progressive && typeof progressive === 'object' ? progressive : {};
    return {
      awardMode: ['partial', 'equal', 'exceed'].includes(source.awardMode)
        ? source.awardMode
        : 'equal',
      rollFormula: typeof source.rollFormula === 'string' ? source.rollFormula : '',
      checkBreakage: cloneCheckBreakage(source.checkBreakage)
    };
  }
  // svelte-ignore state_referenced_locally
  let checkProgressiveDraft = $state(
    cloneProgressiveCheck($viewState.selectedSystem?.craftingCheck?.progressive)
  );
  // svelte-ignore state_referenced_locally
  let checkProgressiveBaseline = $state(
    cloneProgressiveCheck($viewState.selectedSystem?.craftingCheck?.progressive)
  );
  let checkProgressiveSaving = $state(false);
  const checkProgressiveDirty = $derived(
    JSON.stringify(checkProgressiveDraft) !== JSON.stringify(checkProgressiveBaseline)
  );

  // Salvage check drafts — the salvage check now mirrors the crafting check shapes
  // (simple/routed/progressive), so the crafting clone helpers are reused. Same
  // staged pattern: one draft per mode, committed via the tab-aware header Save.
  const sysSalvage = $viewState.selectedSystem?.salvageCraftingCheck;
  // svelte-ignore state_referenced_locally
  let salvageSimpleDraft = $state(cloneSimpleCheck(sysSalvage?.simple));
  // svelte-ignore state_referenced_locally
  let salvageSimpleBaseline = $state(cloneSimpleCheck(sysSalvage?.simple));
  // svelte-ignore state_referenced_locally
  let salvageRoutedDraft = $state(cloneRoutedCheck(sysSalvage?.routed));
  // svelte-ignore state_referenced_locally
  let salvageRoutedBaseline = $state(cloneRoutedCheck(sysSalvage?.routed));
  // svelte-ignore state_referenced_locally
  let salvageProgressiveDraft = $state(cloneProgressiveCheck(sysSalvage?.progressive));
  // svelte-ignore state_referenced_locally
  let salvageProgressiveBaseline = $state(cloneProgressiveCheck(sysSalvage?.progressive));
  let salvageSimpleSaving = $state(false);
  let salvageRoutedSaving = $state(false);
  let salvageProgressiveSaving = $state(false);
  const salvageSimpleDirty = $derived(
    JSON.stringify(salvageSimpleDraft) !== JSON.stringify(salvageSimpleBaseline)
  );
  const salvageRoutedDirty = $derived(
    JSON.stringify(salvageRoutedDraft) !== JSON.stringify(salvageRoutedBaseline)
  );
  const salvageProgressiveDirty = $derived(
    JSON.stringify(salvageProgressiveDraft) !== JSON.stringify(salvageProgressiveBaseline)
  );

  // Gathering check drafts — the system-level gathering check mirrors the
  // crafting/salvage progressive + routed shapes (d100 has no editable config),
  // so the crafting clone helpers are reused. Same staged pattern as salvage.
  const sysGathering = $viewState.selectedSystem?.gatheringCraftingCheck;
  // svelte-ignore state_referenced_locally
  let gatheringProgressiveDraft = $state(cloneProgressiveCheck(sysGathering?.progressive));
  // svelte-ignore state_referenced_locally
  let gatheringProgressiveBaseline = $state(cloneProgressiveCheck(sysGathering?.progressive));
  // svelte-ignore state_referenced_locally
  let gatheringRoutedDraft = $state(cloneRoutedCheck(sysGathering?.routed));
  // svelte-ignore state_referenced_locally
  let gatheringRoutedBaseline = $state(cloneRoutedCheck(sysGathering?.routed));
  let gatheringProgressiveSaving = $state(false);
  let gatheringRoutedSaving = $state(false);
  const gatheringProgressiveDirty = $derived(
    JSON.stringify(gatheringProgressiveDraft) !== JSON.stringify(gatheringProgressiveBaseline)
  );
  const gatheringRoutedDirty = $derived(
    JSON.stringify(gatheringRoutedDraft) !== JSON.stringify(gatheringRoutedBaseline)
  );
  // Which Checks sub-tab is active (crafting | salvage | gathering | validation),
  // so the shared header Save persists the right draft.
  let checksActiveTab = $state('crafting');
  // The Graph surface (issue 442) is unimplemented; it stays a disabled placeholder
  // and, as of issue 745, renders only when experimental features are enabled.
  const placeholderViews = [
    { id: 'graph', icon: 'fas fa-project-diagram', labelKey: 'FABRICATE.Admin.Manager.Nav.Graph', fallback: 'Graph' }
  ];

  const selectedSystem = $derived($viewState.selectedSystem);
  const selectedSystemId = $derived(selectedSystem?.id || '');
  const systemsLoading = $derived($viewState.systemsLoading === true);
  const canShowEnvironments = $derived(selectedSystem?.features?.gathering === true);
  const recipeMultiStepEnabled = $derived(selectedSystem?.features?.multiStepRecipes === true);
  // Complex recipes need a resolution mode that allows multiple ingredient/result
  // sets; simple/progressive systems craft exactly one set into one result.
  const recipeMultiSetAllowed = $derived(!['simple', 'progressive'].includes(selectedSystem?.resolutionMode || 'simple'));
  // Both routed modes route a result group across multiple result groups (by the
  // ingredient set in routedByIngredients, by the check outcome in routedByCheck);
  // the routing basis is a property of the system mode, not a per-recipe choice.
  const recipeRouted = $derived(
    ['routedByIngredients', 'routedByCheck'].includes(selectedSystem?.resolutionMode || 'simple')
  );
  const canShowEssences = $derived(selectedSystem?.features?.essences === true);
  // Experimental toggle (issue 745): the Crafting group is now unconditional; this
  // gate only decides whether the unimplemented Graph placeholder is advertised.
  const experimentalFeaturesEnabled = $derived($viewState.experimentalFeaturesEnabled === true);
  const showEssenceSourceUi = $derived(selectedSystem?.features?.effectTransfer === true);
  const currentView = $derived(normalizedActiveView(activeView, selectedSystem, canShowEnvironments, canShowEssences));

  // The pure `evaluateSystemValidation` report, computed in the admin store from
  // the selected system's recipes/environments/components. Drives the GM system
  // overview view, its rail count badge, and the system-blocker banner.
  const systemValidationReport = $derived(
    $viewState.systemValidation || { issues: [], counts: { critical: 0, warning: 0, info: 0, blockers: 0 }, blocksSystem: false }
  );
  const systemBlocksSystem = $derived(systemValidationReport.blocksSystem === true);
  const systemOverviewCount = $derived(
    (systemValidationReport.counts?.critical || 0) + (systemValidationReport.counts?.warning || 0)
  );

  // Per-check activation state for the right-menu "Active" card. A check is only
  // toggleable when its resolution mode makes it optional (Simple); otherwise the
  // mode requires it and the card explains that.
  const checkActivation = $derived({
    crafting: {
      mode: selectedSystem?.resolutionMode || 'simple',
      // The crafting check is optional in simple and routedByIngredients (it runs
      // only when a roll formula is authored and checks are enabled); routedByCheck
      // and progressive REQUIRE it. Alchemy is driven by alchemy.checkMode: simple
      // and tiered are MANDATORY (cannot be disabled → requiredHint), while none has
      // NO check (the `none` flag suppresses the Active TOGGLE and shows a distinct
      // "resolves without a check" hint in place of the requiredHint — the Active
      // card itself stays as a read-only note).
      optional:
        (selectedSystem?.resolutionMode || 'simple') === 'alchemy'
          ? false
          : ['simple', 'routedByIngredients'].includes(selectedSystem?.resolutionMode || 'simple'),
      none:
        selectedSystem?.resolutionMode === 'alchemy' &&
        (selectedSystem?.alchemy?.checkMode || 'none') === 'none',
      enabled: selectedSystem?.craftingCheck?.enabled === true
    },
    salvage: {
      mode: selectedSystem?.salvageResolutionMode || 'simple',
      optional: (selectedSystem?.salvageResolutionMode || 'simple') === 'simple',
      enabled: selectedSystem?.salvageCraftingCheck?.enabled === true
    },
    // The system-level gathering check's shape is the gathering economy's
    // resolution mode. d100 is the fixed roll (optional/no enable toggle);
    // progressive/routed are editable checks with an Active toggle.
    gathering: {
      mode: gatheringResolutionMode,
      optional: gatheringResolutionMode === 'd100',
      enabled: selectedSystem?.gatheringCraftingCheck?.enabled === true
    }
  });

  // Which crafting check editor is active for the selected system, and whether it
  // has unsaved staged edits — drives the single top-right Save button.
  // Only `routedByCheck` authors the tier-routing routed check; `routedByIngredients`
  // shares the simple pass/fail slot with `simple`/`alchemy`, so it routes dirty
  // tracking + Save through the simple draft (`store.saveCraftingCheckSimple`) and its
  // recipe "Check tier" dropdown falls out of the collapsed 'simple' mode. The separate
  // `recipeRouted` derivation (multi-set / route enablement) still covers both routed
  // modes.
  const craftingCheckMode = $derived(
    (function _craftingCheckMode(resolution) {
      if (resolution === 'routedByCheck') return 'routed';
      if (resolution === 'progressive') return 'progressive';
      if (['simple', 'alchemy', 'routedByIngredients'].includes(resolution)) return 'simple';
      return null;
    })(selectedSystem?.resolutionMode || 'simple')
  );
  const craftingCheckDirty = $derived(
    (craftingCheckMode === 'routed' && checkRoutedDirty) ||
      (craftingCheckMode === 'simple' && checkSimpleDirty) ||
      (craftingCheckMode === 'progressive' && checkProgressiveDirty)
  );
  const craftingCheckSaving = $derived(
    checkRoutedSaving || checkSimpleSaving || checkProgressiveSaving
  );

  // The salvage check editor shown is selected by the salvage resolution mode.
  const salvageResolutionMode = $derived(selectedSystem?.salvageResolutionMode || 'simple');
  const salvageCheckDirty = $derived(
    (salvageResolutionMode === 'routed' && salvageRoutedDirty) ||
      (salvageResolutionMode === 'progressive' && salvageProgressiveDirty) ||
      (salvageResolutionMode === 'simple' && salvageSimpleDirty)
  );
  const salvageCheckSaving = $derived(
    salvageSimpleSaving || salvageRoutedSaving || salvageProgressiveSaving
  );

  // The gathering check editor shown is selected by the gathering economy's
  // resolution mode; d100 has no editable draft, so it is never dirty/saving.
  const gatheringCheckDirty = $derived(
    (gatheringResolutionMode === 'routed' && gatheringRoutedDirty) ||
      (gatheringResolutionMode === 'progressive' && gatheringProgressiveDirty)
  );
  const gatheringCheckSaving = $derived(
    gatheringProgressiveSaving || gatheringRoutedSaving
  );

  // Tab-aware Checks dirty/saving/save: the single header Save button persists
  // whichever check sub-tab is active.
  const checksDirty = $derived(
    checksActiveTab === 'salvage'
      ? salvageCheckDirty
      : checksActiveTab === 'gathering'
        ? gatheringCheckDirty
        : craftingCheckDirty
  );
  const checksSaving = $derived(
    checksActiveTab === 'salvage'
      ? salvageCheckSaving
      : checksActiveTab === 'gathering'
        ? gatheringCheckSaving
        : craftingCheckSaving
  );

  // Recipe tiers offered to the recipe editor's "Check tier" dropdown, resolved
  // from the active crafting-check mode. Recipe tiers are authored on a RELATIVE
  // check, so a simple-static check surfaces its `simple.tiers` and a routed
  // relative check (`routed.type !== 'fixed'`) surfaces its `routed.tiers`; fixed,
  // dynamic-dc, progressive and unknown modes offer nothing. See the pure helper.
  const recipeCheckTierOptions = $derived(
    resolveRecipeCheckTierOptions(selectedSystem?.craftingCheck, craftingCheckMode)
  );
  // Fixed-type routed success tiers offered to the recipe's "Minimum success tier"
  // override; empty (control hidden) unless the system's real resolution mode is
  // `routedByCheck` + fixed. Gated on `resolutionMode`, not the collapsed
  // `craftingCheckMode`, so a `routedByIngredients` system (which authors its check
  // on the shared `simple` pass/fail slot and has no outcome tiers) does not surface
  // a dead control.
  const recipeMinSuccessTierOptions = $derived(
    resolveRecipeFixedOutcomeTierOptions(selectedSystem?.craftingCheck, selectedSystem?.resolutionMode)
  );

  // Routed-check outcome tiers (active type) offered to the recipe editor's
  // check-mode result-set assignment control as {id, name}. Failure tiers are
  // excluded — a failed check produces no result set to route to.
  const recipeRoutedOutcomeTierOptions = $derived.by(() =>
    routedSuccessTierOptions(selectedSystem?.craftingCheck?.routed)
  );
  // ALL routed outcome tiers ({id, name}, success + failure) — the library inspector
  // resolves a routed-by-check result group's checkOutcomeIds to these tier NAMES.
  const recipeAllOutcomeTierOptions = $derived.by(() =>
    routedOutcomeTierOptions(selectedSystem?.craftingCheck?.routed)
  );
  // Whether ANY outcome tier is defined (even failure-only). Lets the recipe
  // editor tell "no tiers authored" apart from "tiers exist but none is Success"
  // — both empty the option list above, but each needs a different hint.
  const recipeRoutedHasOutcomeTiers = $derived.by(() =>
    routedHasOutcomeTiers(selectedSystem?.craftingCheck?.routed)
  );

  // Salvage feature gate + the inputs the per-component salvage editor needs.
  const componentSalvageEnabled = $derived(selectedSystem?.features?.salvage === true);
  // Routed-salvage outcome tier NAMES (active type), used by the per-component
  // outcome-routing selects. Names map to result-group ids in component.salvage.
  const salvageOutcomeNames = $derived(
    routedOutcomeTierNames(selectedSystem?.salvageCraftingCheck?.routed)
  );
  // The second axis of the per-component salvage panel's derived presentation
  // (issue 676, decision 2): salvageResolutionMode × salvage-check enablement.
  const salvageCheckEnabled = $derived(selectedSystem?.salvageCraftingCheck?.enabled === true);
  // DC presets come from `salvageCraftingCheck.simple.tiers` in EVERY resolution mode,
  // routed included (decision 7, case 5) — there is no `.routed.tiers` sibling.
  const salvageCheckTiers = $derived(selectedSystem?.salvageCraftingCheck?.simple?.tiers || []);
  const salvageCheckDcMode = $derived(selectedSystem?.salvageCraftingCheck?.simple?.dcMode || 'static');
  const salvageCheckDc = $derived(selectedSystem?.salvageCraftingCheck?.simple?.dc ?? 0);
  // System components offered to the salvage yield picker.
  //
  // READ FROM `managedItemOptions`, NEVER FROM `itemCards` (issue 676). `itemCards` is
  // the component BROWSER's list and is SEARCH-FILTERED:
  //   itemCards ← _buildItemCards(…, itemSearchTerm, …) ← getItems(systemId, search)
  // where `itemSearchTerm` is `get(itemSearch)`, the browser's search store. Projecting
  // the picker from it leaked that search into the editor: typing "iron" in the browser
  // and then opening any component silently narrowed the yield picker to components
  // matching "iron" — a filter applied by a control that is not on screen, with no
  // feedback. `selectedSystem.managedItemOptions` is `_buildManagedItemOptions` over the
  // UNFILTERED managed items, and is already what the recipe editor's component pickers
  // read; salvage was the one surface that diverged.
  //
  // It is REUSED rather than re-projected here on purpose. The old hand-rolled map was an
  // ALLOWLIST whose every field had to be remembered — an omitted `difficulty` reaches the
  // editor as `undefined` and the progressive row's badge silently reads "No difficulty"
  // for every row, which looks like unauthored data rather than a dropped projection.
  // `_buildManagedItemOptions` already carries `id`/`name`/`img`/`description`/`category`/
  // `difficulty`, so there is one projection to keep correct instead of two.
  const salvageComponentOptions = $derived(selectedSystem?.managedItemOptions || []);

  // Reseed the routed + simple check drafts and baselines when the selected system
  // changes (not on every refresh of the same system, so a save never clobbers an
  // open draft) OR when the SAME system's resolution mode changes. The latter is a
  // data-loss guard: `CraftingSystemManager.updateSystem` moves the persisted
  // crafting-check config across slots when a mode crosses the `routedByIngredients`
  // boundary (routed↔simple), so the editor must re-read both crafting-check slots
  // from the persisted system — otherwise a stale/empty draft would be Saved back and
  // clobber the migrated config.
  $effect(() => {
    const resolutionMode = selectedSystem?.resolutionMode || 'simple';
    const systemChanged = selectedSystemId !== lastChecksSystemId;
    const resolutionModeChanged =
      !systemChanged && resolutionMode !== lastChecksResolutionMode;
    if (!systemChanged && !resolutionModeChanged) return;
    lastChecksSystemId = selectedSystemId;
    lastChecksResolutionMode = resolutionMode;
    checkRoutedDraft = cloneRoutedCheck(selectedSystem?.craftingCheck?.routed);
    checkRoutedBaseline = cloneRoutedCheck(selectedSystem?.craftingCheck?.routed);
    checkSimpleDraft = cloneSimpleCheck(selectedSystem?.craftingCheck?.simple);
    checkSimpleBaseline = cloneSimpleCheck(selectedSystem?.craftingCheck?.simple);
    checkProgressiveDraft = cloneProgressiveCheck(selectedSystem?.craftingCheck?.progressive);
    checkProgressiveBaseline = cloneProgressiveCheck(selectedSystem?.craftingCheck?.progressive);
    // A same-system resolution-mode change never touches the salvage/gathering
    // checks; only reseed those on a genuine system switch so an open salvage/
    // gathering draft is not clobbered by a crafting-mode change.
    if (!systemChanged) return;
    const nextSalvage = selectedSystem?.salvageCraftingCheck;
    salvageSimpleDraft = cloneSimpleCheck(nextSalvage?.simple);
    salvageSimpleBaseline = cloneSimpleCheck(nextSalvage?.simple);
    salvageRoutedDraft = cloneRoutedCheck(nextSalvage?.routed);
    salvageRoutedBaseline = cloneRoutedCheck(nextSalvage?.routed);
    salvageProgressiveDraft = cloneProgressiveCheck(nextSalvage?.progressive);
    salvageProgressiveBaseline = cloneProgressiveCheck(nextSalvage?.progressive);
    const nextGathering = selectedSystem?.gatheringCraftingCheck;
    gatheringProgressiveDraft = cloneProgressiveCheck(nextGathering?.progressive);
    gatheringProgressiveBaseline = cloneProgressiveCheck(nextGathering?.progressive);
    gatheringRoutedDraft = cloneRoutedCheck(nextGathering?.routed);
    gatheringRoutedBaseline = cloneRoutedCheck(nextGathering?.routed);
  });

  function onUpdateCraftingCheck(next) {
    checkRoutedDraft = next;
  }

  function onUpdateCraftingCheckSimple(next) {
    checkSimpleDraft = next;
  }

  function onUpdateCraftingCheckProgressive(next) {
    checkProgressiveDraft = next;
  }

  function onUpdateSalvageCheckSimple(next) {
    salvageSimpleDraft = next;
  }

  function onUpdateSalvageCheckRouted(next) {
    salvageRoutedDraft = next;
  }

  function onUpdateSalvageCheckProgressive(next) {
    salvageProgressiveDraft = next;
  }

  function onUpdateGatheringCheckProgressive(next) {
    gatheringProgressiveDraft = next;
  }

  function onUpdateGatheringCheckRouted(next) {
    gatheringRoutedDraft = next;
  }

  // Live-persist an alchemy behaviour-flag patch (issue 713). saveAlchemyConfig
  // rewrites all three flags from its argument, so send the current projected values
  // with the single toggled field overridden — passing a bare `{ learnOnCraft }` would
  // silently re-default consumeOnFail/showAttemptHistoryToPlayers to their defaults.
  function onUpdateAlchemyFlags(patch) {
    const current = selectedSystem?.alchemy || {};
    store?.saveAlchemyConfig?.({
      checkMode: current.checkMode,
      learnOnCraft: current.learnOnCraft === true,
      consumeOnFail: current.consumeOnFail !== false,
      showAttemptHistoryToPlayers: current.showAttemptHistoryToPlayers !== false,
      ...patch,
    });
  }

  async function saveCraftingCheck() {
    if (!selectedSystemId || craftingCheckSaving || !craftingCheckDirty) return;
    if (craftingCheckMode === 'routed') {
      checkRoutedSaving = true;
      try {
        await store?.saveCraftingCheckRouted?.(checkRoutedDraft);
        checkRoutedBaseline = cloneRoutedCheck(checkRoutedDraft);
      } finally {
        checkRoutedSaving = false;
      }
    } else if (craftingCheckMode === 'simple') {
      checkSimpleSaving = true;
      try {
        await store?.saveCraftingCheckSimple?.(checkSimpleDraft);
        checkSimpleBaseline = cloneSimpleCheck(checkSimpleDraft);
      } finally {
        checkSimpleSaving = false;
      }
    } else if (craftingCheckMode === 'progressive') {
      checkProgressiveSaving = true;
      try {
        await store?.saveCraftingCheckProgressive?.(checkProgressiveDraft);
        checkProgressiveBaseline = cloneProgressiveCheck(checkProgressiveDraft);
      } finally {
        checkProgressiveSaving = false;
      }
    }
  }

  async function saveSalvageCheck() {
    if (!selectedSystemId || salvageCheckSaving || !salvageCheckDirty) return;
    if (salvageResolutionMode === 'routed') {
      salvageRoutedSaving = true;
      try {
        await store?.saveSalvageCheckRouted?.(salvageRoutedDraft);
        salvageRoutedBaseline = cloneRoutedCheck(salvageRoutedDraft);
      } finally {
        salvageRoutedSaving = false;
      }
    } else if (salvageResolutionMode === 'progressive') {
      salvageProgressiveSaving = true;
      try {
        await store?.saveSalvageCheckProgressive?.(salvageProgressiveDraft);
        salvageProgressiveBaseline = cloneProgressiveCheck(salvageProgressiveDraft);
      } finally {
        salvageProgressiveSaving = false;
      }
    } else {
      salvageSimpleSaving = true;
      try {
        await store?.saveSalvageCheckSimple?.(salvageSimpleDraft);
        salvageSimpleBaseline = cloneSimpleCheck(salvageSimpleDraft);
      } finally {
        salvageSimpleSaving = false;
      }
    }
  }

  async function saveGatheringCheck() {
    if (!selectedSystemId || gatheringCheckSaving || !gatheringCheckDirty) return;
    if (gatheringResolutionMode === 'routed') {
      gatheringRoutedSaving = true;
      try {
        await store?.saveGatheringCheckRouted?.(gatheringRoutedDraft);
        gatheringRoutedBaseline = cloneRoutedCheck(gatheringRoutedDraft);
      } finally {
        gatheringRoutedSaving = false;
      }
    } else if (gatheringResolutionMode === 'progressive') {
      gatheringProgressiveSaving = true;
      try {
        await store?.saveGatheringCheckProgressive?.(gatheringProgressiveDraft);
        gatheringProgressiveBaseline = cloneProgressiveCheck(gatheringProgressiveDraft);
      } finally {
        gatheringProgressiveSaving = false;
      }
    }
    // d100 mode has no editable config — nothing to persist.
  }

  // The shared Checks header Save persists whichever sub-tab is active.
  async function saveChecks() {
    if (checksActiveTab === 'salvage') return saveSalvageCheck();
    if (checksActiveTab === 'gathering') return saveGatheringCheck();
    return saveCraftingCheck();
  }

  function onToggleCheckActive(kind, enabled) {
    if (kind === 'crafting') store?.saveCraftingCheckActive?.(enabled);
    else if (kind === 'salvage') store?.saveSalvageCheckActive?.(enabled);
    else if (kind === 'gathering') store?.saveGatheringCheckActive?.(enabled);
  }
  const selectedCounts = $derived({
    components: selectedSystem?.managedItemOptions?.length || 0,
    recipes: $viewState.recipes?.length || 0,
    environments: selectedSystem?.features?.gathering === true ? ($viewState.environments?.length || 0) : null,
    essences: selectedSystem?.essenceDefinitions?.length || 0,
    itemTags: selectedSystem?.itemTags?.length || 0,
    recipeCategories: selectedSystem?.categories?.length || 0
  });
  const itemCards = $derived($viewState.itemCards || []);
  const toolsComponentCards = $derived(Array.isArray(itemCards) ? itemCards : []);
  const toolsNormalizedComponentSearchTerm = $derived(toolsComponentSearchTerm.trim().toLowerCase());
  const toolsFilteredComponentCards = $derived(toolsComponentCards.filter(item => {
    const name = String(item?.name || '').toLowerCase();
    return !toolsNormalizedComponentSearchTerm || name.includes(toolsNormalizedComponentSearchTerm);
  }));
  const toolsPaginatedComponentCards = $derived(toolsFilteredComponentCards.slice(
    toolsComponentPageIndex * toolsComponentPageSize,
    (toolsComponentPageIndex + 1) * toolsComponentPageSize
  ));
  const tagCategoryUsage = $derived(buildTagCategoryUsage(selectedSystem, $viewState.recipes || [], itemCards));
  const categoryRows = $derived(buildCategoryRows(
    selectedSystem?.categories || [],
    tagCategoryUsage.categoryUsage,
    selectedSystem?.categoryIcons || {}
  ));
  const componentCategoryRows = $derived(buildComponentCategoryRows(
    selectedSystem?.componentCategories || [],
    tagCategoryUsage.componentCategoryUsage,
    selectedSystem?.componentCategoryIcons || {}
  ));
  const tagRows = $derived(buildTagRows(selectedSystem?.itemTags || [], tagCategoryUsage.tagUsage));
  const tagCategoryCounts = $derived({
    baseCategories: 1,
    customCategories: categoryRows.filter(row => row.id !== 'general').length,
    customComponentCategories: componentCategoryRows.filter(row => row.id !== 'general').length,
    itemTags: tagRows.length,
    categoryReferences: tagCategoryUsage.categoryReferenceCount,
    componentCategoryReferences: tagCategoryUsage.componentCategoryReferenceCount,
    tagReferences: tagCategoryUsage.tagReferenceCount
  });
  // The Tags & Categories screen shows one vocabulary tab at a time; the active tab
  // is owned here so the inspector's contextual help can follow it (the view is a
  // controlled component over this state). Each help block is title + three bullets.
  let tagsActiveTab = $state('recipe');
  const tagsHelp = $derived.by(() => {
    if (tagsActiveTab === 'component') {
      return {
        title: text('FABRICATE.Admin.Manager.TagsCategories.ComponentHelpTitle', 'How component categories work'),
        items: [
          text('FABRICATE.Admin.Manager.TagsCategories.ComponentHelp1', 'Every component belongs to General until you add categories to group them.'),
          text('FABRICATE.Admin.Manager.TagsCategories.ComponentHelp2', 'Component categories are independent of recipe categories.'),
          text('FABRICATE.Admin.Manager.TagsCategories.ComponentHelp3', 'Deleting a category reassigns its components back to General.')
        ]
      };
    }
    if (tagsActiveTab === 'tag') {
      return {
        title: text('FABRICATE.Admin.Manager.TagsCategories.TagHelpTitle', 'How component tags work'),
        items: [
          text('FABRICATE.Admin.Manager.TagsCategories.TagHelp1', 'Tags appear on components and on tag-placeholder ingredients in recipes.'),
          text('FABRICATE.Admin.Manager.TagsCategories.TagHelp2', 'Tag names are normalised to lowercase so they stay consistent.'),
          text('FABRICATE.Admin.Manager.TagsCategories.TagHelp3', 'A recipe can require any component carrying a tag instead of a specific item.')
        ]
      };
    }
    return {
      title: text('FABRICATE.Admin.Manager.TagsCategories.RecipeHelpTitle', 'How recipe categories work'),
      items: [
        text('FABRICATE.Admin.Manager.TagsCategories.RecipeHelp1', 'Categories are flat — each recipe picks one, with no parent or child folders.'),
        text('FABRICATE.Admin.Manager.TagsCategories.RecipeHelp2', 'General is the reserved fallback for recipes without a custom category.'),
        text('FABRICATE.Admin.Manager.TagsCategories.RecipeHelp3', 'Adding a category makes it selectable in the recipe editor immediately.')
      ]
    };
  });
  const selectedCountFacts = $derived(buildSelectedCountFacts(selectedCounts));
  const enabledFeatureLabels = $derived(featureLabels(selectedSystem));
  const selectedGatheringConditionShortcuts = $derived(buildSelectedGatheringConditionShortcuts(
    selectedSystem,
    $viewState.gatheringConfig
  ));
  const selectedGatheringCharacterModifiers = $derived(
    Array.isArray($viewState.gatheringConfig?.systems?.[selectedSystemId]?.characterModifiers)
      ? $viewState.gatheringConfig.systems[selectedSystemId].characterModifiers
      : []
  );
  const selectedCurrencyUnits = $derived(
    Array.isArray(selectedSystem?.requirements?.currency?.units)
      ? selectedSystem.requirements.currency.units
      : []
  );
  // Units are seeded from adapter presets even for a currency-disabled system, so the
  // recipe editor must gate cost affordances on the explicit enable flag, not on unit
  // presence. Threaded alongside the units so existing requirements can render read-only
  // (rather than vanish) when currency is off.
  const selectedCurrencyEnabled = $derived(
    selectedSystem?.requirements?.currency?.enabled === true
  );
  // Time requirements default ON (issue 714): an absent flag keeps existing recipe/step
  // durations authorable and applied, so gate the recipe Duration surfaces only on an
  // explicit GM opt-out (`enabled === false`), mirroring the normalizer default.
  const selectedTimeRequirementsEnabled = $derived(
    selectedSystem?.requirements?.time?.enabled !== false
  );
  const foundrySystemId = $derived(String($viewState.foundrySystemId || ''));
  const characterModifierPresetsSupported = $derived(['dnd5e', 'pf2e'].includes(foundrySystemId));
  const currencyPresetsSupported = $derived(['dnd5e', 'pf2e'].includes(foundrySystemId));
  const currencySpendStrategy = $derived(selectedSystem?.requirements?.currency?.spendStrategy || 'actorProperty');
  const currencyProviderId = $derived(selectedSystem?.requirements?.currency?.providerId || '');
  const currencyMacros = $derived(selectedSystem?.requirements?.currency?.macros || { canAfford: '', increment: '', decrement: '' });
  const currencyProviderOptions = $derived(
    getCurrencyProvidersForFoundrySystem(foundrySystemId).map(provider => ({ id: provider.id, label: provider.label }))
  );
  async function onAddCharacterModifier() {
    if (!selectedSystemId) return null;
    return await store.addGatheringCharacterModifier(selectedSystemId);
  }
  async function onSeedCharacterModifierPresets() {
    if (!selectedSystemId || !characterModifierPresetsSupported) return;
    await store.seedGatheringCharacterModifierPresets(selectedSystemId);
  }
  async function onUpdateCharacterModifier(modifierId, patch) {
    if (!selectedSystemId) return;
    await store.updateGatheringCharacterModifier(selectedSystemId, modifierId, patch);
  }
  async function onDeleteCharacterModifier(modifierId) {
    if (!selectedSystemId) return;
    await store.deleteGatheringCharacterModifier(selectedSystemId, modifierId);
  }

  // Character prerequisites (issue 544) — system-owned pass/fail learning gates.
  const selectedCharacterPrerequisites = $derived(
    Array.isArray(selectedSystem?.characterPrerequisites)
      ? selectedSystem.characterPrerequisites
      : []
  );
  const characterPrerequisitePresetsSupported = $derived(
    ['dnd5e', 'pf2e'].includes(foundrySystemId)
  );
  async function onAddCharacterPrerequisite() {
    if (!selectedSystemId) return null;
    return await store.addCharacterPrerequisite(selectedSystemId);
  }
  async function onUpdateCharacterPrerequisite(prerequisiteId, patch) {
    if (!selectedSystemId) return;
    await store.updateCharacterPrerequisite(selectedSystemId, prerequisiteId, patch);
  }
  async function onDeleteCharacterPrerequisite(prerequisiteId) {
    if (!selectedSystemId) return;
    await store.deleteCharacterPrerequisite(selectedSystemId, prerequisiteId);
  }
  async function onSeedCharacterPrerequisitePresets() {
    if (!selectedSystemId || !characterPrerequisitePresetsSupported) return;
    await store.seedCharacterPrerequisitePresetsForSystem(selectedSystemId);
  }

  async function onAddCurrencyUnit() {
    if (!selectedSystemId) return null;
    return await store.addCurrencyUnit(selectedSystemId);
  }
  async function onUpdateCurrencyUnit(unitId, patch) {
    if (!selectedSystemId) return;
    await store.updateCurrencyUnit(selectedSystemId, unitId, patch);
  }
  async function onDeleteCurrencyUnit(unitId) {
    if (!selectedSystemId) return;
    await store.deleteCurrencyUnit(selectedSystemId, unitId);
  }
  async function onAddCurrencySubUnit(parentUnitId, subUnitId) {
    if (!selectedSystemId) return;
    await store.addCurrencySubUnit(selectedSystemId, parentUnitId, subUnitId);
  }
  async function onUpdateCurrencySubUnit(parentUnitId, subUnitId, amount) {
    if (!selectedSystemId) return;
    await store.updateCurrencySubUnit(selectedSystemId, parentUnitId, subUnitId, amount);
  }
  async function onDeleteCurrencySubUnit(parentUnitId, subUnitId) {
    if (!selectedSystemId) return;
    await store.deleteCurrencySubUnit(selectedSystemId, parentUnitId, subUnitId);
  }
  async function onSeedCurrencyPresets() {
    if (!selectedSystemId || !currencyPresetsSupported) return;
    await store.seedCurrencyUnitPresets(selectedSystemId);
  }
  async function onSetCurrencySpendStrategy(spendStrategy) {
    if (!selectedSystemId) return;
    await store.setCurrencySpendStrategy(selectedSystemId, spendStrategy);
  }
  async function onSetCurrencyProvider(providerId) {
    if (!selectedSystemId) return;
    await store.setCurrencyProvider(selectedSystemId, providerId);
  }
  async function onSetCurrencyMacro(key, uuid) {
    if (!selectedSystemId || !uuid) return;
    await store.setCurrencyMacro(selectedSystemId, key, uuid);
  }
  async function onClearCurrencyMacro(key) {
    if (!selectedSystemId) return;
    await store.clearCurrencyMacro(selectedSystemId, key);
  }

  function characterModifierLibraryEntry(modifierId) {
    if (!modifierId) return null;
    return selectedGatheringCharacterModifiers.find(entry => entry.id === modifierId) || null;
  }

  function characterModifierLabelForRef(ref) {
    const entry = characterModifierLibraryEntry(ref?.modifierId);
    if (entry) return entry.label || entry.id;
    return text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.UnknownModifier', 'Unknown modifier ({id})').replace('{id}', ref?.modifierId || '');
  }

  function characterModifierIconForRef(ref) {
    return characterModifierLibraryEntry(ref?.modifierId)?.icon || 'fa-solid fa-user';
  }

  function characterModifierIsCustomized(ref) {
    if (!ref) return false;
    return Boolean(ref.expressionOverride);
  }

  function rowCharacterModifiers(row) {
    return Array.isArray(row?.characterModifiers) ? row.characterModifiers : [];
  }

  async function onAddDropCharacterModifier(rowId, modifierId = null) {
    if (!editingGatheringTask?.id || !rowId) return;
    const id = modifierId ?? selectedGatheringCharacterModifiers[0]?.id ?? '';
    if (!id) return;
    const rows = gatheringTaskDropRows(editingGatheringTask);
    const row = rows.find(entry => entry.id === rowId);
    if (!row) return;
    const refs = Array.isArray(row.characterModifiers) ? row.characterModifiers : [];
    const newRef = {
      id: `char-mod-${id}-${refs.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
      modifierId: id,
      operator: '+',
      min: null,
      max: null,
      expressionOverride: ''
    };
    updateGatheringTaskDrop(rowId, { characterModifiers: [...refs, newRef] });
  }

  let characterModifierSearchTerm = $state('');
  const characterModifierSearchSuggestions = $derived.by(() => {
    const term = characterModifierSearchTerm.trim().toLowerCase();
    if (!term) return [];
    const attached = new Set((selectedGatheringDrop?.characterModifiers || []).map(ref => ref.modifierId).filter(Boolean));
    return selectedGatheringCharacterModifiers.filter(entry => {
      if (attached.has(entry.id)) return false;
      const label = String(entry.label || '').toLowerCase();
      const id = String(entry.id || '').toLowerCase();
      return label.includes(term) || id.includes(term);
    });
  });
  $effect(() => {
    if (selectedGatheringDrop?.id) {
      characterModifierSearchTerm = '';
    }
  });

  const eventCharacterModifierSearchSuggestions = $derived.by(() => {
    const term = characterModifierSearchTerm.trim().toLowerCase();
    if (!term) return [];
    const attached = new Set((editingGatheringEvent?.characterModifiers || []).map(ref => ref.modifierId).filter(Boolean));
    return selectedGatheringCharacterModifiers.filter(entry => {
      if (attached.has(entry.id)) return false;
      const label = String(entry.label || '').toLowerCase();
      const id = String(entry.id || '').toLowerCase();
      return label.includes(term) || id.includes(term);
    });
  });
  $effect(() => {
    if (editingGatheringEvent?.id) {
      characterModifierSearchTerm = '';
    }
  });

  let characterModifierSearchAnchor = $state(null);
  let characterModifierSearchOpenUp = $state(false);

  function characterModifierSearchClippingBounds(node) {
    const documentRef = globalThis.document;
    const windowRef = globalThis.window || globalThis;
    const viewportTop = 0;
    const viewportBottom = Number(globalThis.innerHeight || windowRef.innerHeight) || documentRef?.documentElement?.clientHeight || 0;
    let parent = node?.parentElement;
    while (parent && parent !== documentRef?.documentElement) {
      const style = globalThis.getComputedStyle?.(parent);
      const overflow = `${style?.overflow || ''} ${style?.overflowY || ''} ${style?.overflowX || ''}`;
      if (/(auto|scroll|hidden|clip)/.test(overflow)) {
        const rect = parent.getBoundingClientRect?.();
        if (rect) {
          return {
            top: Math.max(viewportTop, rect.top),
            bottom: Math.min(viewportBottom || rect.bottom, rect.bottom)
          };
        }
      }
      parent = parent.parentElement;
    }
    return { top: viewportTop, bottom: viewportBottom };
  }

  function updateCharacterModifierSearchDirection() {
    const node = characterModifierSearchAnchor;
    const rect = node?.getBoundingClientRect?.();
    if (!rect) {
      characterModifierSearchOpenUp = false;
      return;
    }
    const bounds = characterModifierSearchClippingBounds(node);
    const spaceBelow = bounds.bottom - rect.bottom;
    const spaceAbove = rect.top - bounds.top;
    const openUpThreshold = 160;
    characterModifierSearchOpenUp = spaceBelow < openUpThreshold && spaceAbove > spaceBelow;
  }

  $effect(() => {
    if (characterModifierSearchSuggestions.length === 0) {
      characterModifierSearchOpenUp = false;
      return;
    }
    updateCharacterModifierSearchDirection();
  });

  async function pickCharacterModifierForRow(rowId, modifierId) {
    characterModifierSearchTerm = '';
    await onAddDropCharacterModifier(rowId, modifierId);
  }

  function characterModifierOperatorClass(operator) {
    return operator === '-' ? 'is-negative' : 'is-positive';
  }

  let gatheringTimeOfDayPickerSelection = $state('');
  let gatheringWeatherPickerSelection = $state('');
  let gatheringBiomePickerSelection = $state('');
  $effect(() => {
    const biomeAvailable = gatheringConditionAvailableOptions(selectedGatheringDrop, 'biome');
    if (!biomeAvailable.some(option => option.id === gatheringBiomePickerSelection)) {
      gatheringBiomePickerSelection = biomeAvailable[0]?.id || '';
    }
    const timeAvailable = gatheringConditionAvailableOptions(selectedGatheringDrop, 'timeOfDay');
    if (!timeAvailable.some(option => option.id === gatheringTimeOfDayPickerSelection)) {
      gatheringTimeOfDayPickerSelection = timeAvailable[0]?.id || '';
    }
    const weatherAvailable = gatheringConditionAvailableOptions(selectedGatheringDrop, 'weather');
    if (!weatherAvailable.some(option => option.id === gatheringWeatherPickerSelection)) {
      gatheringWeatherPickerSelection = weatherAvailable[0]?.id || '';
    }
  });

  let gatheringEventTimeOfDayPickerSelection = $state('');
  let gatheringEventWeatherPickerSelection = $state('');
  let gatheringEventBiomePickerSelection = $state('');
  $effect(() => {
    const biomeAvailable = gatheringConditionAvailableOptions(editingGatheringEvent, 'biome');
    if (!biomeAvailable.some(option => option.id === gatheringEventBiomePickerSelection)) {
      gatheringEventBiomePickerSelection = biomeAvailable[0]?.id || '';
    }
    const timeAvailable = gatheringConditionAvailableOptions(editingGatheringEvent, 'timeOfDay');
    if (!timeAvailable.some(option => option.id === gatheringEventTimeOfDayPickerSelection)) {
      gatheringEventTimeOfDayPickerSelection = timeAvailable[0]?.id || '';
    }
    const weatherAvailable = gatheringConditionAvailableOptions(editingGatheringEvent, 'weather');
    if (!weatherAvailable.some(option => option.id === gatheringEventWeatherPickerSelection)) {
      gatheringEventWeatherPickerSelection = weatherAvailable[0]?.id || '';
    }
  });

  function gatheringEventModifierPickerSelection(kind) {
    if (kind === 'biome') return gatheringEventBiomePickerSelection;
    return kind === 'weather' ? gatheringEventWeatherPickerSelection : gatheringEventTimeOfDayPickerSelection;
  }

  function setGatheringEventModifierPickerSelection(kind, value) {
    if (kind === 'biome') gatheringEventBiomePickerSelection = value;
    else if (kind === 'weather') gatheringEventWeatherPickerSelection = value;
    else gatheringEventTimeOfDayPickerSelection = value;
  }

  function gatheringDropModifierPickerSelection(kind) {
    if (kind === 'biome') return gatheringBiomePickerSelection;
    return kind === 'weather' ? gatheringWeatherPickerSelection : gatheringTimeOfDayPickerSelection;
  }

  function setGatheringDropModifierPickerSelection(kind, value) {
    if (kind === 'biome') gatheringBiomePickerSelection = value;
    else if (kind === 'weather') gatheringWeatherPickerSelection = value;
    else gatheringTimeOfDayPickerSelection = value;
  }

  function gatheringModifierSignedValue(modifier) {
    return (modifier?.operator === '-' ? -1 : 1) * Math.abs(Math.trunc(Number(modifier?.value || 0)));
  }

  function gatheringModifierValueClass(modifier) {
    const signed = gatheringModifierSignedValue(modifier);
    if (signed > 0) return 'is-positive';
    if (signed < 0) return 'is-negative';
    return 'is-zero';
  }

  function gatheringModifierDisplayValue(modifier) {
    const value = Math.abs(Math.trunc(Number(modifier?.value || 0)));
    if (modifier?.operator === '-') return value > 0 ? `-${value}` : '-';
    return value > 0 ? `+${value}` : '0';
  }

  function signedToOperatorValue(raw) {
    const text = String(raw ?? '');
    const negative = text.trim().startsWith('-');
    const digits = text.replace(/[^0-9]/g, '');
    const value = digits === '' ? 0 : Math.abs(Math.trunc(Number(digits)));
    return { operator: negative ? '-' : '+', value };
  }

  function onGatheringDropModifierKeydown(rowId, kind, modifier, event) {
    event.stopPropagation();
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const next = signedToOperatorValue(String(gatheringModifierSignedValue(modifier) + (event.key === 'ArrowUp' ? 1 : -1)));
    event.currentTarget.value = gatheringModifierDisplayValue(next);
    updateGatheringDropModifier(rowId, kind, modifier.id, next);
  }

  function onGatheringEventModifierKeydown(kind, modifier, event) {
    event.stopPropagation();
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const next = signedToOperatorValue(String(gatheringModifierSignedValue(modifier) + (event.key === 'ArrowUp' ? 1 : -1)));
    event.currentTarget.value = gatheringModifierDisplayValue(next);
    updateGatheringEventConditionModifier(kind, modifier.id, next);
  }

  async function setCharacterModifierOverrideEnabled(rowId, ref, enabled, libraryEntry) {
    const expressionOverride = enabled ? (libraryEntry?.expression || '') : '';
    await onUpdateDropCharacterModifier(rowId, ref.id, { expressionOverride });
  }

  async function onUpdateDropCharacterModifier(rowId, refId, patch) {
    if (!editingGatheringTask?.id || !rowId || !refId) return;
    const rows = gatheringTaskDropRows(editingGatheringTask);
    const row = rows.find(entry => entry.id === rowId);
    if (!row) return;
    const refs = Array.isArray(row.characterModifiers) ? row.characterModifiers : [];
    const nextRefs = refs.map(ref => ref.id === refId ? { ...ref, ...patch } : ref);
    updateGatheringTaskDrop(rowId, { characterModifiers: nextRefs });
  }

  async function onDeleteDropCharacterModifier(rowId, refId) {
    if (!editingGatheringTask?.id || !rowId || !refId) return;
    const rows = gatheringTaskDropRows(editingGatheringTask);
    const row = rows.find(entry => entry.id === rowId);
    if (!row) return;
    const refs = Array.isArray(row.characterModifiers) ? row.characterModifiers : [];
    const nextRefs = refs.filter(ref => ref.id !== refId);
    if (nextRefs.length === refs.length) return;
    updateGatheringTaskDrop(rowId, { characterModifiers: nextRefs });
  }

  const visiblePlaceholderViews = $derived(selectedSystem
    ? placeholderViews.filter(view => isViewAvailableForSystem(view, selectedSystem))
    : []
  );
  const showRecipeCategories = $derived(!!selectedSystem);
  const selectedRecipe = $derived(
    ($viewState.recipes || []).find(recipe => recipe.id === selectedRecipeId)
      || ($viewState.recipes || [])[0]
      || null
  );
  // Recipe-edit deriveds read the live draft (not the persisted record) so the
  // editor, inspector, and header chip all track unsaved staged edits.
  // Alchemy check mode drives the alchemy recipe editor shape (decoupled from the
  // single `complex` flag): none/simple → single ingredient set + single/labeled
  // result sets; tiered → multi-group tier assignment (like routedByCheck).
  const alchemyCheckMode = $derived(
    selectedSystem?.resolutionMode === 'alchemy'
      ? selectedSystem?.alchemy?.checkMode || 'none'
      : null
  );
  // Recipe complexity is EMERGENT from structure now (issue 643): the editor renders
  // multi-set chrome purely off the ingredient-set / result-group COUNT, so there is
  // no `complex` prop threaded down any more. What the Ingredients tab still needs is
  // whether the mode PERMITS more than one set — that gates the "Add ingredient set"
  // promotion affordance. Multiple sets are allowed everywhere except the structurally
  // 1×1 modes (simple/progressive) and alchemy (which forces a single set).
  const recipeCanAddSet = $derived(
    recipeMultiSetAllowed && selectedSystem?.resolutionMode !== 'alchemy'
  );
  // Alchemy Simple mode drives the Results tab's fixed two-slot editor (success +
  // reserved failure result set).
  const recipeAlchemySimple = $derived(alchemyCheckMode === 'simple');
  // A SIMPLE-resolution system with the crafting check enabled has a pass/fail outcome,
  // so it too gets the reserved-failure two-slot result editor (issue 643): a failed
  // check produces the reserved `role: 'failure'` group (or nothing).
  const recipeSimpleWithCheck = $derived(
    (selectedSystem?.resolutionMode || 'simple') === 'simple' &&
      selectedSystem?.craftingCheck?.enabled === true
  );
  // The routing basis is a property of the system MODE for the routed crafting
  // modes (routedByCheck → 'check', routedByIngredients → 'ingredientSet'). Alchemy
  // routes by the system-level check mode: tiered → 'check' (routed tier assignment),
  // none/simple → null. The retired per-recipe provider is no longer read.
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
  // Alchemy enable-blocker context for the recipe editor's Validation tab (issue
  // 549): the alchemy check mode (drives the result-selection blocker) and the
  // cross-recipe signature conflicts touching this recipe. Both are null/[] for every
  // non-alchemy system, so those systems gain no new checks. The conflicts recompute
  // against the LIVE draft's ingredient sets (and the current recipe list) so the tab
  // predicts the collision before the GM saves and clicks enable.
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
  const recipeVisibilityEffect = $derived(craftingEffect(selectedSystem?.visibilityMode || 'knowledge'));
  // Resolution happens in the STORE (the tab never touches ids): granted characters
  // resolve over EVERY world actor, not the player-character roster, because the
  // runtime predicate applies no type filter. The rosters are passed explicitly so the
  // reactive dependency on them is visible here rather than hidden inside the store.
  const recipeAccessRoster = $derived(
    store.resolveRecipeAccess?.(recipeDraft?.access, {
      players: $viewState.worldUsers || [],
      characters: $viewState.accessCharacters || [],
    }) || { players: [], characters: [] }
  );
  const recipeEditDirty = $derived(Boolean(recipeDraft)
    && JSON.stringify(recipeDraft) !== JSON.stringify(recipeDraftBaseline));
  const showComponentTags = $derived(itemCards.some(item => item.showTags || (Array.isArray(item.tags) && item.tags.length > 0)));
  const showComponentEssences = $derived(itemCards.some(item => item.showEssences || (Array.isArray(item.essences) && item.essences.length > 0)));
  const selectedComponent = $derived(
    itemCards.find(item => item.id === selectedComponentId)
      || itemCards[0]
      || null
  );
  const essenceCards = $derived($viewState.essenceCards || selectedSystem?.essenceDefinitions || []);
  const selectedEssenceStrict = $derived(essenceCards.find(essence => essence.id === selectedEssenceId) || null);
  const isCreatingEssenceDraft = $derived(currentView === 'essence-edit' && !selectedEssenceId);
  const selectedEssence = $derived(
    selectedEssenceStrict
      || essenceCards[0]
      || null
  );
  const selectedEssenceForInspector = $derived(currentView === 'essence-edit' ? essenceEditDraft : selectedEssence);
  const canSaveEssenceEdit = $derived(essenceEditDirty === true
    && essenceEditDraft?.validName === true
    && essenceEditSaving !== true);
  const canSaveComponentEdit = $derived(componentEditCombinedDirty === true
    && componentEditSaving !== true);
  const canSaveRecipeEdit = $derived(recipeEditDirty === true
    && Boolean(recipeDraft?.name?.trim())
    && recipeEditSaving !== true);
  const recipeItemDefinitions = $derived(selectedSystem?.recipeItemDefinitions || []);
  const componentForEdit = $derived(currentView === 'component-edit'
    ? itemCards.find(item => item.id === selectedComponentId) || null
    : null);
  const componentEditTagOptions = $derived(componentTagOptionsFor(componentForEdit));
  const componentEditEssenceOptions = $derived(componentEssenceOptionsFor(componentForEdit));
  const componentEditShowTags = $derived(componentShowTagsFor(componentForEdit));
  const componentEditShowEssences = $derived(componentShowEssencesFor(componentForEdit));
  // Progressive difficulty is authored from the right inspector but STAGED into
  // the component editor's save flow (it persists on Save, not on change). The
  // draft is seeded on edit-entry (editComponent); these derive its visibility,
  // dirtiness, and the combined dirty state the Save button + route guard use.
  // `component.difficulty` is ONE component-level scalar read by SEVERAL
  // progressive surfaces, each with its OWN resolution mode:
  //   - progressive recipes   → ResolutionModeService  (system.resolutionMode)
  //   - progressive salvage   → CraftingEngine         (system.salvageResolutionMode)
  //   - progressive gathering → GatheringEngine        (the system's gathering
  //     economy `resolutionMode`; `difficultyForResult` costs each result by the
  //     component's difficulty)
  // Gating on the RECIPE mode alone was the bug (issue 676): a system that is
  // `routedByCheck` for recipes but progressive for salvage reads difficulty and
  // could never author it. Read the gathering economy straight off viewState
  // rather than via `gatheringResolutionMode` (declared further down) so this
  // derivation carries no declaration-order coupling. The economy is ONE block
  // per system (`gatheringConfig.systems[systemId].economy`), so this is a direct
  // read of the edited system's mode, not a scan.
  const gatheringProgressive = $derived(
    $viewState.gatheringConfig?.systems?.[selectedSystemId]?.economy?.resolutionMode === 'progressive'
  );
  const componentDifficultyShown = $derived(
    currentView === 'component-edit'
    && (
      selectedSystem?.resolutionMode === 'progressive'
      || salvageResolutionMode === 'progressive'
      || gatheringProgressive
    )
    && !!componentForEdit
  );
  const componentDifficultyDirty = $derived(
    componentDifficultyShown
    && normalizeComponentDifficulty(componentDifficultyDraft)
      !== normalizeComponentDifficulty(componentForEdit?.difficulty)
  );
  const componentEditCombinedDirty = $derived(
    componentEditDirty === true || componentDifficultyDirty === true
  );
  const environmentList = $derived($viewState.environments || []);
  const environmentValidationCount = $derived(Array.isArray($viewState.environmentValidationState?.errors)
    ? $viewState.environmentValidationState.errors.length
    : 0);
  const selectedEnvironmentId = $derived($viewState.selectedEnvironmentId || $viewState.environmentDraft?.id || '');
  const environmentDraftForDisplay = $derived($viewState.environmentDraft || null);
  const shouldUseEnvironmentDraftForDisplay = $derived(Boolean(environmentDraftForDisplay)
    && (currentView === 'environment-edit'
      || $viewState.environmentDraftDirty === true
      || $viewState.environmentDraftIsNew === true
      || environmentDraftForDisplay.id === selectedEnvironmentId));
  const selectedEnvironment = $derived(
    shouldUseEnvironmentDraftForDisplay
      ? environmentDraftForDisplay
      : (environmentList.find(environment => environment.id === selectedEnvironmentId)
        || environmentList.find(environment => environment.id === environmentDraftForDisplay?.id)
        || environmentList[0]
        || null)
  );
  const selectedEnvironmentFacts = $derived(environmentFacts(selectedEnvironment));
  const selectedEnvironmentSceneState = $derived(environmentSceneState(selectedEnvironment));
  const gatheringNavItems = [
    {
      id: 'environments',
      icon: 'fas fa-seedling',
      labelKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.Environments',
      labelFallback: 'Environments'
    },
    {
      id: 'tasks',
      icon: 'fas fa-list-check',
      labelKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.Tasks',
      labelFallback: 'Tasks',
      titleKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.TasksTitle',
      titleFallback: 'Gathering Tasks',
      hintKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.TasksHint',
      hintFallback: 'Browse gathering tasks before attaching them to environments.'
    },
    {
      id: 'encounters',
      icon: 'fas fa-masks-theater',
      labelKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.Encounters',
      labelFallback: 'Events',
      titleKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersTitle',
      titleFallback: 'Gathering events',
      hintKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersHint',
      hintFallback: 'Browse reusable events before attaching them to environments.'
    },
    {
      id: 'travel',
      icon: 'fas fa-route',
      labelKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.Travel',
      labelFallback: 'Travel',
      titleKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.TravelTitle',
      titleFallback: 'Travel and parties',
      hintKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.TravelHint',
      hintFallback: 'Manage Fabricate parties and set the current realm for this crafting system.'
    },
    {
      id: 'settings',
      icon: 'fas fa-sliders',
      labelKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.Settings',
      labelFallback: 'Settings',
      titleKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.SettingsPlaceholderTitle',
      titleFallback: 'Gathering settings',
      hintKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.SettingsPlaceholderHint',
      hintFallback: 'Set system-level rules for gathering.'
    }
  ];
  // The Travel/Realms subsystem is opt-in per system. When disabled, the Travel
  // nav item is hidden AND removed from the tab-resolution lists so a stale
  // `activeGatheringTab === 'travel'` falls back to environments (filtering the
  // render alone is insufficient — the guards below validate against this list).
  const gatheringRealmsEnabled = $derived($viewState.gatheringRealmSettings?.enabled === true);
  const visibleGatheringNavItems = $derived(
    gatheringRealmsEnabled ? gatheringNavItems : gatheringNavItems.filter(tab => tab.id !== 'travel')
  );
  const gatheringInspectorTabs = $derived(visibleGatheringNavItems.filter(tab => tab.id !== 'environments'));
  const isGatheringRoute = $derived(currentView === 'environments' || currentView === 'environment-edit' || currentView === 'gathering-task-edit' || currentView === 'gathering-event-edit');
  const isActiveGatheringChildRoute = $derived(
    isGatheringRoute && visibleGatheringNavItems.some(tab => tab.id === activeGatheringTab)
  );
  const activeGatheringInspectorTab = $derived(
    gatheringInspectorTabs.find(tab => tab.id === activeGatheringTab) || null
  );
  // Stale-tab guard: if the active tab is no longer visible (e.g. Travel after the
  // GM disables Travel & Realms), fall back to Environments.
  $effect(() => {
    if (!visibleGatheringNavItems.some(tab => tab.id === activeGatheringTab)) {
      activeGatheringTab = 'environments';
    }
  });

  // Crafting nav group (issue 511, PR-B redesign). The visible sub-tabs are a
  // conditional set derived from the system's `visibilityMode` by the shared nav
  // model (`buildCraftingNavItems`): Recipes and Settings are always present,
  // Access appears under `restricted`, Books & Scrolls under `item`/`knowledge`.
  // Each sub-item maps to a distinct route, so highlighting is derived from the
  // active route via `resolveActiveCraftingTab`. The group is unconditional as of
  // issue 745 (v1.3 headline).
  const craftingVisibilityMode = $derived(selectedSystem?.visibilityMode || 'knowledge');
  const recipeCount = $derived($viewState.recipes?.length || 0);
  const recipeItemCount = $derived(recipeItemDefinitions.length);
  const craftingNavItems = $derived(
    buildCraftingNavItems({
      visibilityMode: craftingVisibilityMode,
      recipeCount,
      recipeItemCount,
    })
  );
  // The Crafting parent-group badge totals its visible sub-tabs (Recipes + Books &
  // Scrolls where that surface applies), mirroring the gathering group's total, so
  // the collapsed group count reflects everything inside it — not recipes alone.
  const craftingNavCount = $derived(
    craftingNavItems.reduce((sum, item) => sum + (item.count || 0), 0)
  );
  const isCraftingRoute = $derived(isCraftingView(currentView));
  const activeCraftingTab = $derived(resolveActiveCraftingTab(currentView));
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
    Boolean(recipeItemDraft)
      && JSON.stringify(recipeItemDraft) !== JSON.stringify(recipeItemDraftBaseline)
  );
  const canSaveRecipeItemEdit = $derived(recipeItemEditDirty === true && recipeItemEditSaving !== true);
  // The linked linked world item for the editor's Overview preview: resolve from the
  // DRAFT's originItemUuid (so a staged link change updates the preview) against the
  // projected recipe item's resolved fields, then the world-item options.
  const recipeItemEditorLinkedItem = $derived.by(() => {
    const uuid = String(recipeItemDraft?.originItemUuid || '');
    if (!uuid) return null;
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
  // Recipes contained by the edited recipe item, and the pool that can still be
  // added. Derived from the DRAFT's `recipeIds` (staged membership), so linking and
  // unlinking reflect live and only persist on Save.
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
  // The Crafting group's expansion follows the active route: it expands on
  // entering a crafting child route and collapses on leaving, so the submenu
  // never dangles open over unrelated views. A manual toggle from a non-crafting
  // route sticks until the route category next changes.
  $effect(() => {
    craftingMenuExpanded = isCraftingRoute;
  });
  const selectedGatheringRules = $derived($viewState.gatheringConfig?.systems?.[selectedSystemId]?.rules || {
    rewardSelectionMode: 'highestRankedDrop',
    rewardLimit: 1,
    eventSelectionMode: 'allDrops',
    eventLimit: 1,
    eventPolicy: 'successWithEvent',
    toolBreakagePolicy: 'failureOnBreak',
    biomeModifierAggregation: 'strongestOfEach',
    eventVisibility: 'encounterChance'
  });
  const selectedGatheringSystemConfig = $derived($viewState.gatheringConfig?.systems?.[selectedSystemId] || {});
  // Two independent limitation flags. Honor key-presence precedence: a present
  // `enabled` flag wins over a stale legacy `mode` (mirrors the service / GM
  // economy-view read-compat mapping) so a disabled limit can't be resurrected.
  const selectedGatheringEconomy = $derived(selectedGatheringSystemConfig.economy || {});
  // The gathering check editor shown is selected by the gathering economy's
  // resolution mode (d100 → fixed, not editable; progressive/routed → editable).
  const gatheringResolutionMode = $derived(selectedGatheringEconomy.resolutionMode || 'd100');
  const selectedGatheringTaskStaminaEnabled = $derived(
    selectedGatheringEconomy.stamina != null && Object.prototype.hasOwnProperty.call(selectedGatheringEconomy.stamina, 'enabled')
      ? selectedGatheringEconomy.stamina.enabled === true
      : selectedGatheringEconomy.mode === 'stamina'
  );
  const selectedGatheringTaskNodesEnabled = $derived(
    selectedGatheringEconomy.nodes != null && Object.prototype.hasOwnProperty.call(selectedGatheringEconomy.nodes, 'enabled')
      ? selectedGatheringEconomy.nodes.enabled === true
      : selectedGatheringEconomy.mode === 'nodes'
  );
  const gatheringTaskDefinitions = $derived(Array.isArray(selectedGatheringSystemConfig.tasks) ? selectedGatheringSystemConfig.tasks : []);
  const gatheringEventDefinitions = $derived(Array.isArray(selectedGatheringSystemConfig.events) ? selectedGatheringSystemConfig.events : []);
  // Tools are system-owned: read the canonical library from the selected
  // crafting system (surfaced on $viewState.selectedSystem.tools by the store)
  // rather than the gathering-config copy.
  const selectedGatheringSystemTools = $derived(Array.isArray($viewState.selectedSystem?.tools) ? $viewState.selectedSystem.tools : []);
  const toolsNavCount = $derived(selectedGatheringSystemTools.length);
  // Recipe-editor tools library: enrich each tool with its backing component's
  // name (so an unlabelled tool can fall back to the component name rather than
  // exposing a raw id, mirroring the tool inspector's `label || component.name`
  // resolution) and image (so the recipe Tools section and picker show the
  // component thumbnail instead of a generic tool glyph).
  const recipeToolsLibrary = $derived(
    selectedGatheringSystemTools.map((tool) => {
      const component = (selectedSystem?.managedItemOptions || []).find(
        (item) => String(item.id) === String(tool.componentId)
      );
      return { ...tool, componentName: component?.name || '', componentImg: component?.img || '' };
    })
  );
  // Environments of the selected system, as { id, name } rows for the task
  // editor's optional default-environment select (the on-drop precedence middle
  // tier).
  const selectedSystemEnvironmentOptions = $derived(
    environmentList
      .filter(environment => String(environment?.craftingSystemId || '') === String(selectedSystemId || ''))
      .map(environment => ({ id: String(environment.id), name: String(environment.name || environment.id) }))
  );
  const travelParties = $derived($viewState.travelParties || []);
  const selectedTravelPartyId = $derived($viewState.selectedPartyId || '');
  const selectedTravelParty = $derived(
    travelParties.find(party => party.id === selectedTravelPartyId) || null
  );
  // Realm selection is UI-local (no store resolution needed); the inspector
  // reads the selected realm from the system-realm projection.
  let selectedTravelRealmId = $state('');
  const travelSystemRealms = $derived($viewState.selectedSystemRealms || []);
  const selectedTravelRealm = $derived(
    travelSystemRealms.find(realm => realm.id === selectedTravelRealmId) || null
  );
  // Mirror the Parties tab: keep a realm selected whenever one exists, falling
  // back to the first realm when nothing is selected or the selection is gone.
  $effect(() => {
    if (travelSystemRealms.length === 0) {
      if (selectedTravelRealmId) selectedTravelRealmId = '';
    } else if (!travelSystemRealms.some(realm => realm.id === selectedTravelRealmId)) {
      selectedTravelRealmId = travelSystemRealms[0].id;
    }
  });
  // Map Region Links tab: selection over the current scene's regions (UI-local).
  let selectedMapRegionUuid = $state('');
  const mapCurrentSceneRegions = $derived($viewState.currentSceneRegions || []);
  const selectedMapRegion = $derived(
    mapCurrentSceneRegions.find(region => region.sceneRegionUuid === selectedMapRegionUuid) || null
  );
  // Auto-select the first scene region (and re-seat when the scene changes and the
  // region set is replaced), clearing the selection when the scene has none.
  $effect(() => {
    if (mapCurrentSceneRegions.length === 0) {
      if (selectedMapRegionUuid) selectedMapRegionUuid = '';
    } else if (!mapCurrentSceneRegions.some(region => region.sceneRegionUuid === selectedMapRegionUuid)) {
      selectedMapRegionUuid = mapCurrentSceneRegions[0].sceneRegionUuid;
    }
  });
  const gatheringNavCounts = $derived({
    environments: environmentList.length,
    tasks: gatheringTaskDefinitions.length,
    encounters: gatheringEventDefinitions.length,
    travel: travelParties.length,
    total: environmentList.length + gatheringTaskDefinitions.length + gatheringEventDefinitions.length
  });
  const selectedGatheringTask = $derived(
    gatheringTaskDefinitions.find(task => task.id === selectedGatheringTaskId)
      || gatheringTaskDefinitions[0]
      || null
  );
  const selectedGatheringEvent = $derived(
    gatheringEventDefinitions.find(event => event.id === selectedGatheringEventId)
      || gatheringEventDefinitions[0]
      || null
  );
  const editingGatheringTask = $derived(gatheringTaskDraft || selectedGatheringTask);
  const selectedGatheringDrop = $derived(
    gatheringTaskDropRows(editingGatheringTask).find(row => row.id === selectedGatheringDropId)
      || gatheringTaskDropRows(editingGatheringTask)[0]
      || null
  );
  const gatheringTaskDraftDirty = $derived(
    !!(gatheringTaskDraft && gatheringTaskDraftBaseline
      && JSON.stringify(gatheringTaskDraft) !== JSON.stringify(gatheringTaskDraftBaseline))
  );
  const gatheringTaskValidation = $derived(
    gatheringTaskDraft
      ? (store.validateGatheringLibraryTask?.(gatheringTaskDraft) || { valid: true, errors: [] })
      : { valid: true, errors: [] }
  );

  const editingGatheringEvent = $derived(gatheringEventDraft || selectedGatheringEvent);
  const gatheringEventDraftDirty = $derived(
    !!(gatheringEventDraft && gatheringEventDraftBaseline
      && JSON.stringify(gatheringEventDraft) !== JSON.stringify(gatheringEventDraftBaseline))
  );
  const gatheringEventValidation = $derived(validateGatheringEventDraft(gatheringEventDraft));

  function validateGatheringEventDraft(draft) {
    if (!draft) return { valid: true, errors: [] };
    const errors = [];
    if (!String(draft?.name || '').trim()) {
      errors.push(text('FABRICATE.Admin.Manager.Environment.Events.NameRequired', 'Name is required.'));
    }
    const rate = Number(draft?.dropRate);
    if (!Number.isFinite(rate) || rate < 1 || rate > 100) {
      errors.push(text('FABRICATE.Admin.Manager.Environment.Events.DropRateInvalid', 'Drop rate must be between 1 and 100.'));
    }
    return { valid: errors.length === 0, errors };
  }

  const libraryToolsList = $derived(Array.isArray($viewState.toolsDraft) ? $viewState.toolsDraft : []);
  const dirtyToolIds = $derived(Array.isArray($viewState.toolsDraftDirtyToolIds) ? $viewState.toolsDraftDirtyToolIds : []);
  const selectedLibraryTool = $derived(
    libraryToolsList.find(tool => tool.id === $viewState.toolsDraftSelectedToolId) || null
  );
  const selectedLibraryToolDirty = $derived(
    selectedLibraryTool ? dirtyToolIds.includes(selectedLibraryTool.id) : false
  );
  const selectedToolDraftValidation = $derived(
    currentView === 'tools' && selectedLibraryTool
      ? (store.validateToolDraft?.(selectedLibraryTool.id) || { valid: true, errors: [] })
      : { valid: true, errors: [] }
  );

  $effect(() => {
    if (selectedSystemId === lastComponentSystemId) return;
    selectedComponentId = '';
    componentEditDirty = false;
    componentEditSaving = false;
    componentEditDraft = null;
    lastComponentSystemId = selectedSystemId;
  });

  $effect(() => {
    if (selectedSystemId === lastEssenceSystemId) return;
    selectedEssenceId = '';
    essenceEditDirty = false;
    essenceEditSaving = false;
    essenceEditDraft = null;
    lastEssenceSystemId = selectedSystemId;
  });

  $effect(() => {
    if (selectedSystemId === lastGatheringSystemId) return;
    activeGatheringTab = 'environments';
    selectedGatheringTaskId = '';
    selectedGatheringEventId = '';
    gatheringTaskDraft = null;
    gatheringTaskDraftBaseline = null;
    gatheringTaskSaving = false;
    gatheringTaskSaveError = '';
    gatheringEventDraft = null;
    gatheringEventDraftBaseline = null;
    gatheringEventSaving = false;
    gatheringEventSaveError = '';
    gatheringMenuExpanded = isGatheringRoute;
    store?.cancelToolsDraft?.();
    lastGatheringSystemId = selectedSystemId;
  });

  $effect(() => {
    if (activeGatheringTab === 'environments') return;
    if (currentView === 'environments' && canShowEnvironments) return;
    if (currentView === 'gathering-task-edit' && canShowEnvironments) return;
    if (currentView === 'gathering-event-edit' && canShowEnvironments) return;
    activeGatheringTab = 'environments';
  });

  $effect(() => {
    if (!isActiveGatheringChildRoute || gatheringMenuExpanded) return;
    gatheringMenuExpanded = true;
  });

  $effect(() => {
    if (!canShowEnvironments) {
      selectedGatheringTaskId = '';
      selectedGatheringDropId = '';
      return;
    }
    if (selectedGatheringTaskId && gatheringTaskDefinitions.some(task => task.id === selectedGatheringTaskId)) return;
    selectedGatheringTaskId = gatheringTaskDefinitions[0]?.id || '';
  });

  $effect(() => {
    if (!canShowEnvironments) {
      selectedGatheringEventId = '';
      return;
    }
    if (selectedGatheringEventId && gatheringEventDefinitions.some(event => event.id === selectedGatheringEventId)) return;
    selectedGatheringEventId = gatheringEventDefinitions[0]?.id || '';
  });

  $effect(() => {
    if (!editingGatheringTask) {
      selectedGatheringDropId = '';
      return;
    }
    const rows = gatheringTaskDropRows(editingGatheringTask);
    if (selectedGatheringDropId && rows.some(row => row.id === selectedGatheringDropId)) return;
    selectedGatheringDropId = rows[0]?.id || '';
  });

  $effect(() => {
    services?.registerEssenceDirtyGuard?.(() => confirmEssenceRouteExit('close'));
    return () => services?.registerEssenceDirtyGuard?.(null);
  });

  $effect(() => {
    if (toolsComponentPageIndex > 0 && toolsComponentPageIndex * toolsComponentPageSize >= toolsFilteredComponentCards.length) toolsComponentPageIndex = 0;
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function toolsComponentCardImage(item) {
    return item?.img || 'icons/svg/item-bag.svg';
  }

  function toolsComponentDescription(item) {
    return String(item?.description || '').trim();
  }

  function onToolsComponentSearchInput(event) {
    toolsComponentSearchTerm = event.currentTarget.value;
    toolsComponentPageIndex = 0;
  }

  function onToolsComponentDragStart(item, event) {
    const componentId = String(item?.id || '').trim();
    if (!componentId) return;
    event.dataTransfer?.setData?.('text/plain', JSON.stringify({ type: 'FabricateManagedComponent', componentId }));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }

  function gatheringDropModeLabel(mode) {
    const labels = {
      highestRankedDrop: text('FABRICATE.Admin.Manager.Environment.Rules.HighestRankedDrop', 'Highest ranked successful drop'),
      allDrops: text('FABRICATE.Admin.Manager.Environment.Rules.AllDrops', 'All successful drops'),
      limitedDrops: text('FABRICATE.Admin.Manager.Environment.Rules.LimitedDrops', 'Limit successful drops')
    };
    return labels[mode] || labels.highestRankedDrop;
  }

  function gatheringEventPolicyLabel(policy) {
    return policy === 'failureWithEvent'
      ? text('FABRICATE.Admin.Manager.Environment.Rules.GatheringFails', 'Gathering fails')
      : text('FABRICATE.Admin.Manager.Environment.Rules.GatheringSucceeds', 'Gathering succeeds');
  }

  function updateSelectedGatheringRules(updates) {
    if (!selectedSystemId) return;
    store.updateGatheringRules?.(selectedSystemId, updates);
  }

  function updateSelectedGatheringCondition(kind, value) {
    if (!selectedSystemId || !kind) return;
    store.updateGatheringConditions?.({ [kind]: value, systemId: selectedSystemId });
  }

  function adjustGatheringRuleLimit(field, delta) {
    const current = Number(selectedGatheringRules?.[field] || 1);
    updateSelectedGatheringRules({ [field]: Math.max(1, Math.floor(current + delta)) });
  }

  function formatCount(keySingular, fallbackSingular, keyPlural, fallbackPlural, count) {
    const key = count === 1 ? keySingular : keyPlural;
    const fallback = count === 1 ? fallbackSingular : fallbackPlural;
    return `${count} ${text(key, fallback)}`;
  }

  // The recipe editor's header subline: "<category> · <resolution mode>". The mode is
  // the SYSTEM's, restated here because it dictates the editor's whole shape; the
  // banner on each tab is where the GM goes to change it.
  function recipeEditSubtitle() {
    const category = getRecipeCategoryLabel(normalizeRecipeCategory(recipeDraft?.category), localize);
    const mode = resolutionModeLabel(selectedSystem?.resolutionMode);
    // "⟨category⟩ · ⟨mode⟩ · DC ⟨n⟩" (§F4): resolve the check DC from the same
    // projected `checkSummary` the browser row's check pill reads. A DC-kind check
    // shows its number; a check-bearing system with no usable check shows "—";
    // dynamic / progressive / by-ingredients modes carry no DC and omit the segment.
    const summary = selectedRecipe?.checkSummary || null;
    let dcSuffix = '';
    if (summary?.kind === 'dc' && Number.isFinite(Number(summary.dc))) {
      dcSuffix = ` · ${text('FABRICATE.Admin.Manager.Recipe.CheckDcShort', 'DC')} ${summary.dc}`;
    } else if (summary?.kind === 'none') {
      dcSuffix = ` · ${text('FABRICATE.Admin.Manager.Recipe.CheckDcShort', 'DC')} —`;
    }
    return `${category} · ${mode}${dcSuffix}`;
  }

  // The component editor's header subline: "<category> · Linked <source>" (issue 676,
  // decision 4). The SOURCE segment names where the linked item lives — the same origin
  // the browser row's status pill reports — because the editor's whole premise is that
  // name, image and description follow that item. An unlinked component says so.
  function componentEditSubtitle() {
    const category = getComponentCategoryLabel(
      normalizeComponentCategory(componentForEdit?.category),
      localize
    );
    return `${category} · ${componentEditSourceSegment()}`;
  }

  function componentEditSourceSegment() {
    if (!componentForEdit?.hasRegisteredItemUuid) {
      return text('FABRICATE.Admin.Manager.Component.UnlinkedBadge', 'Not linked');
    }
    if (componentForEdit?.sourceMissing) {
      return text('FABRICATE.Admin.Manager.Component.SourceOriginMissing', 'Missing');
    }
    const origin = componentForEdit?.sourceOrigin || '';
    const sourceLabel = componentForEdit?.sourceOriginLabel
      || (origin === 'compendium'
        ? text('FABRICATE.Admin.Manager.Component.SourceOriginCompendium', 'Compendium')
        : origin === 'world'
          ? text('FABRICATE.Admin.Manager.Component.SourceOriginWorld', 'Items Directory')
          : text('FABRICATE.Admin.Manager.Component.SourceOriginUnknown', 'Unknown'));
    return `${text('FABRICATE.Admin.Manager.Component.LinkedBadge', 'Linked')} ${sourceLabel}`;
  }

  function resolutionModeLabel(mode) {
    const labels = {
      simple: text('FABRICATE.Admin.SystemSettings.ResolutionSimple', 'Simple'),
      routedByIngredients: text('FABRICATE.Admin.Manager.ResolutionRoutedByIngredients', 'Routed by ingredients'),
      routedByCheck: text('FABRICATE.Admin.Manager.ResolutionRoutedByCheck', 'Routed by check'),
      progressive: text('FABRICATE.Admin.SystemSettings.ResolutionProgressive', 'Progressive'),
      alchemy: text('FABRICATE.Admin.SystemSettings.ResolutionAlchemy', 'Alchemy')
    };
    return labels[mode] || mode || text('FABRICATE.Admin.SystemSettings.ResolutionSimple', 'Simple');
  }

  // The titlebar's right-hand status line. Resolution mode is a SYSTEM property, so
  // this reports the selected system's mode — and, only when that mode actually
  // routes by outcome tier, how many tiers the GM has authored on its routed check.
  // A `simple`/`progressive`/`alchemy` system has no tiers to count, and a routed
  // system with none yet says so by omission rather than by printing "0".
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

  function featureLabels(system) {
    if (!system?.features) return [];
    const featureMap = [
      ['gathering', 'FABRICATE.Admin.Manager.Feature.Gathering', 'Gathering'],
      ['essences', 'FABRICATE.Admin.Manager.Feature.Essences', 'Essences'],
      ['multiStepRecipes', 'FABRICATE.Admin.Manager.Feature.MultiStepRecipes', 'Multi-step recipes'],
      ['craftingChecks', 'FABRICATE.Admin.Manager.Feature.CraftingChecks', 'Crafting checks'],
      ['outcomeRouting', 'FABRICATE.Admin.Manager.Feature.OutcomeRouting', 'Outcome routing'],
      ['effectTransfer', 'FABRICATE.Admin.Manager.Feature.EffectTransfer', 'Effect transfer'],
      ['propertyMacros', 'FABRICATE.Admin.Manager.Feature.PropertyMacros', 'Property macros']
    ];
    return featureMap
      .filter(([key]) => system.features[key] === true)
      .map(([, key, fallback]) => text(key, fallback));
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  }

  function buildSelectedCountFacts(counts) {
    const offLabel = text('FABRICATE.Admin.Manager.Off', 'Off');
    return [
      {
        id: 'components',
        label: text('FABRICATE.Admin.Manager.Column.Components', 'Components'),
        value: counts.components
      },
      {
        id: 'recipes',
        label: text('FABRICATE.Admin.Manager.Column.Recipes', 'Recipes'),
        value: counts.recipes
      },
      counts.environments == null
        ? {
          id: 'environments',
          label: text('FABRICATE.Admin.Manager.GatheringEnvironments', 'Gathering environments'),
          value: offLabel,
          isOff: true
        }
        : {
          id: 'environments',
          label: text('FABRICATE.Admin.Manager.GatheringEnvironments', 'Gathering environments'),
          value: counts.environments
        },
      {
        id: 'essences',
        label: text('FABRICATE.Admin.Manager.Nav.Essences', 'Essences'),
        value: counts.essences
      },
      {
        id: 'item-tags',
        label: text('FABRICATE.Admin.Manager.Feature.ItemTags', 'Item tags'),
        value: counts.itemTags
      },
      {
        id: 'recipe-categories',
        label: text('FABRICATE.Admin.Manager.Feature.RecipeCategories', 'Recipe categories'),
        value: counts.recipeCategories
      }
    ];
  }

  function buildSelectedGatheringConditionShortcuts(system, gatheringConfig) {
    if (system?.features?.gathering !== true) return [];
    const systemConditions = gatheringConfig?.systems?.[system.id]?.conditions || {};
    return [
      {
        kind: 'timeOfDay',
        icon: 'fas fa-clock',
        label: text('FABRICATE.Admin.Manager.CurrentTimeOfDay', 'Current time of day'),
        setting: systemConditions.timeOfDay || {
          enabled: true,
          current: gatheringConfig?.conditions?.timeOfDay || 'day',
          values: gatheringConfig?.vocabularies?.timeOfDay || []
        }
      },
      {
        kind: 'weather',
        icon: 'fas fa-cloud-sun',
        label: text('FABRICATE.Admin.Manager.CurrentWeather', 'Current weather'),
        setting: systemConditions.weather || {
          enabled: true,
          current: gatheringConfig?.conditions?.weather || 'clear',
          values: gatheringConfig?.vocabularies?.weather || []
        }
      }
    ].filter(condition => condition.setting?.enabled !== false && conditionValues(condition.setting).length > 0);
  }

  function conditionId(option) {
    if (option && typeof option === 'object') return String(option.id || '').trim();
    return String(option || '').trim();
  }

  function conditionLabel(option) {
    if (option && typeof option === 'object') return String(option.label || option.id || '').trim();
    return String(option || '').trim();
  }

  function conditionValues(setting) {
    return Array.isArray(setting?.values) ? setting.values : [];
  }

  function normalizedActiveView(view, system, environmentsAvailable, essencesAvailable) {
    // The standalone `system-overview` route was folded into the `system-edit`
    // page's Validation tab; a stale value (no system selected) falls through to
    // the `systems` library here.
    if (!system) return 'systems';
    if (view === 'system-overview') return 'system-edit';
    if ((view === 'environments' || view === 'environment-edit' || view === 'gathering-task-edit' || view === 'gathering-event-edit') && !environmentsAvailable) return 'systems';
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

  function viewTitle() {
    if (currentView === 'recipes') return text('FABRICATE.Admin.Manager.Recipe.Title', 'Recipes');
    if (currentView === 'recipe-edit') return text('FABRICATE.Admin.Manager.Recipe.EditTitle', 'Edit recipe');
    if (currentView === 'crafting-settings') return text('FABRICATE.Admin.Manager.Crafting.CraftingTabs.SettingsPlaceholderTitle', 'Crafting settings');
    if (currentView === 'access') return text('FABRICATE.Admin.Manager.Access.Title', 'Recipe access');
    if (currentView === 'books-scrolls') return text('FABRICATE.Admin.Manager.BooksScrolls.Title', 'Books & Scrolls');
    if (currentView === 'recipe-item-edit') return text('FABRICATE.Admin.Manager.RecipeItem.EditTitle', 'Edit recipe item');
    if (currentView === 'components') return text('FABRICATE.Admin.Manager.Component.Title', 'Components');
    if (currentView === 'component-edit') return text('FABRICATE.Admin.Manager.Component.EditTitle', 'Edit component');
    if (currentView === 'tags') return text('FABRICATE.Admin.Manager.TagsCategories.Title', 'Tags & Categories');
    if (currentView === 'essences') return text('FABRICATE.Admin.Manager.Essence.Title', 'Essences');
    if (currentView === 'essence-edit') return isCreatingEssenceDraft
      ? text('FABRICATE.Admin.Manager.Essence.CreateTitle', 'Create essence')
      : text('FABRICATE.Admin.Manager.Essence.EditTitle', 'Edit essence');
    if (currentView === 'environments' && activeGatheringTab === 'tasks') return text('FABRICATE.Admin.Manager.Environment.GatheringTabs.TasksTitle', 'Gathering Tasks');
    if (currentView === 'environments' && activeGatheringTab === 'travel') return text('FABRICATE.Admin.Manager.Environment.GatheringTabs.TravelTitle', 'Travel and parties');
    if (currentView === 'tools') return text('FABRICATE.Admin.Manager.Tools.Title', 'Tools');
    if (currentView === 'checks') return text('FABRICATE.Admin.Manager.Checks.Title', 'Checks');
    if (currentView === 'environments') return text('FABRICATE.Admin.Manager.Environment.Title', 'Environments');
    if (currentView === 'environment-edit') return text('FABRICATE.Admin.Manager.Environment.EditTitle', 'Edit environment');
    if (currentView === 'gathering-task-edit') return text('FABRICATE.Admin.Manager.Environment.Tasks.EditTitle', 'Edit gathering task');
    if (currentView === 'gathering-event-edit') return text('FABRICATE.Admin.Manager.Environment.Events.EditTitle', 'Edit gathering event');
    if (currentView === 'system-edit') return text('FABRICATE.Admin.Manager.SystemEdit.PageTitle', 'System Overview');
    return text('FABRICATE.Admin.Manager.Title', 'Crafting systems');
  }

  function viewSubtitle() {
    if (currentView === 'recipes') return text('FABRICATE.Admin.Manager.Recipe.Subtitle', 'Manage recipes for the selected crafting system.');
    if (currentView === 'recipe-edit') return recipeEditSubtitle();
    if (currentView === 'crafting-settings') return text('FABRICATE.Admin.Manager.Crafting.CraftingTabs.SettingsHint', 'System-level crafting rules: resolution mode and recipe visibility.');
    if (currentView === 'access') return text('FABRICATE.Admin.Manager.Access.Subtitle', 'Grant individual recipes to specific characters or players.');
    if (currentView === 'books-scrolls') return text('FABRICATE.Admin.Manager.BooksScrolls.Subtitle', 'Review every recipe item in this system with its linked recipes and open one to set its use and learn caps.');
    if (currentView === 'recipe-item-edit') return text('FABRICATE.Admin.Manager.RecipeItem.EditSubtitle', 'Link a world item and recipes, then set its use and learn caps.');
    if (currentView === 'components') return text('FABRICATE.Admin.Manager.Component.Subtitle', 'Manage item-backed components for the selected crafting system.');
    if (currentView === 'component-edit' && componentForEdit) return componentEditSubtitle();
    if (currentView === 'component-edit') return text('FABRICATE.Admin.Manager.Component.EditSubtitle', 'Update tags, essences, and source linkage for this component.');
    if (currentView === 'tags') return text('FABRICATE.Admin.Manager.TagsCategories.Subtitle', 'Manage recipe category and item tag vocabulary for the selected crafting system.');
    if (currentView === 'essences') return text('FABRICATE.Admin.Manager.Essence.Subtitle', 'Manage essence definitions for the selected crafting system.');
    if (currentView === 'essence-edit' && isCreatingEssenceDraft && showEssenceSourceUi) return text('FABRICATE.Admin.Manager.Essence.CreateSubtitle', 'Define identity, icon, and source linkage for a new essence.');
    if (currentView === 'essence-edit' && isCreatingEssenceDraft) return text('FABRICATE.Admin.Manager.Essence.CreateNoSourceSubtitle', 'Define identity and icon for a new essence.');
    if (currentView === 'essence-edit' && showEssenceSourceUi) return text('FABRICATE.Admin.Manager.Essence.EditSubtitle', 'Update identity, icon, and source linkage for this essence.');
    if (currentView === 'essence-edit') return text('FABRICATE.Admin.Manager.Essence.EditNoSourceSubtitle', 'Update identity and icon for this essence.');
    if (currentView === 'environments' && activeGatheringTab === 'tasks') return text('FABRICATE.Admin.Manager.Environment.GatheringTabs.TasksHint', 'Browse gathering tasks before attaching them to environments.');
    if (currentView === 'environments' && activeGatheringTab === 'travel') return text('FABRICATE.Admin.Manager.Travel.Subtitle', 'Manage Fabricate parties and set the current realm for the selected crafting system.');
    if (currentView === 'tools') return text('FABRICATE.Admin.Manager.Tools.Subtitle', 'Manage reusable gathering tools and configure how they behave when required by tasks.');
    if (currentView === 'checks') return text('FABRICATE.Admin.Manager.Checks.Subtitle', 'Configure how crafting, salvage, and gathering attempts are checked for the selected crafting system.');
    if (currentView === 'environments') return text('FABRICATE.Admin.Manager.Environment.Subtitle', 'Manage gathering environments for the selected crafting system.');
    if (currentView === 'environment-edit') return text('FABRICATE.Admin.Manager.Environment.EditSubtitle', 'Edit scene linkage, identity, tasks, events, tools, and validation for the selected environment.');
    if (currentView === 'gathering-task-edit') return text('FABRICATE.Admin.Manager.Environment.Tasks.EditSubtitle', 'Edit availability, identity, and drop rules for the selected gathering task.');
    if (currentView === 'gathering-event-edit') return text('FABRICATE.Admin.Manager.Environment.Events.EditSubtitle', 'Edit identity, availability, danger, and modifiers for the selected event.');
    if (currentView === 'system-edit') return text('FABRICATE.Admin.Manager.SystemEdit.PageSubtitle', 'Edit base settings and review validation issues for the selected crafting system.');
    return text('FABRICATE.Admin.Manager.Subtitle', 'Manage the system definitions that organize Fabricate components, recipes, gathering, and feature rules.');
  }

  function isViewAvailableForSystem(view, system) {
    // Issue 745: the Graph placeholder is advertised only behind the experimental toggle.
    if (view.id === 'graph') return experimentalFeaturesEnabled;
    if (!view.feature) return true;
    return system?.features?.[view.feature] === true;
  }

  function isSelectedRecipe(recipe) {
    return selectedRecipe?.id === recipe.id;
  }

  function isPromise(value) {
    return value && typeof value.then === 'function';
  }

  function afterTruthyResult(result, callback) {
    if (isPromise(result)) {
      return result.then(value => {
        if (value !== false) callback();
        return value;
      });
    }
    if (result !== false) callback();
    return result;
  }

  function headerActionsLabel() {
    if (currentView === 'recipes') return text('FABRICATE.Admin.Manager.Recipe.Actions', 'Recipe actions');
    if (currentView === 'components' || currentView === 'component-edit') return text('FABRICATE.Admin.Manager.Component.Actions', 'Component actions');
    if (currentView === 'tags') return text('FABRICATE.Admin.Manager.TagsCategories.Actions', 'Tags and categories actions');
    if (currentView === 'essences' || currentView === 'essence-edit') return text('FABRICATE.Admin.Manager.Essence.Actions', 'Essence actions');
    if (currentView === 'environments' && activeGatheringTab === 'tasks') return text('FABRICATE.Admin.Manager.Environment.Tasks.Actions', 'Gathering task actions');
    if (currentView === 'environments' && activeGatheringTab === 'travel') return text('FABRICATE.Admin.Manager.Environment.GatheringTabs.TravelActions', 'Travel and party actions');
    if (currentView === 'tools') return text('FABRICATE.Admin.Manager.Tools.Actions', 'Tools actions');
    if (currentView === 'checks') return text('FABRICATE.Admin.Manager.Checks.Actions', 'Checks actions');
    if (currentView === 'environments' || currentView === 'environment-edit' || currentView === 'gathering-task-edit' || currentView === 'gathering-event-edit') return text('FABRICATE.Admin.Manager.Environment.Actions', 'Environment actions');
    if (currentView === 'system-edit') return text('FABRICATE.Admin.Manager.SystemEdit.Actions', 'System edit actions');
    return text('FABRICATE.Admin.Manager.SystemActions', 'System actions');
  }

  function inspectorLabel() {
    if (currentView === 'recipe-edit') return text('FABRICATE.Admin.Manager.Recipe.RecipeItem', 'Recipe item');
    if (currentView === 'component-edit') return text('FABRICATE.Admin.Manager.Component.SourceCard.Title', 'Linked Source Item');
    if (currentView === 'access') return text('FABRICATE.Admin.Manager.Access.Inspector', 'Grant access inspector');
    if (currentView === 'books-scrolls') return text('FABRICATE.Admin.Manager.BooksScrolls.Inspector', 'Selected recipe item inspector');
    if (currentView === 'recipes') return text('FABRICATE.Admin.Manager.Recipe.Inspector', 'Selected recipe inspector');
    if (currentView === 'components') return text('FABRICATE.Admin.Manager.Component.Inspector', 'Selected component inspector');
    if (currentView === 'tags') return text('FABRICATE.Admin.Manager.TagsCategories.Inspector', 'Tags and categories inspector');
    if (currentView === 'essences' || currentView === 'essence-edit') return text('FABRICATE.Admin.Manager.Essence.Inspector', 'Selected essence inspector');
    if (currentView === 'environments' && activeGatheringTab === 'tasks') return text('FABRICATE.Admin.Manager.Environment.Tasks.Inspector', 'Selected gathering task inspector');
    if (currentView === 'environments' && activeGatheringTab === 'travel') return text('FABRICATE.Admin.Manager.Environment.GatheringTabs.TravelInspector', 'Selected party inspector');
    if (currentView === 'tools') return text('FABRICATE.Admin.Manager.Tools.Inspector', 'Selected tool inspector');
    if (currentView === 'environments') return text('FABRICATE.Admin.Manager.Environment.Inspector', 'Selected environment inspector');
    return text('FABRICATE.Admin.Manager.SelectedSystemInspector', 'Selected system inspector');
  }

  async function finishEnvironmentRouteExit(action) {
    if (action === 'cancel' || action === false) return false;
    if (action === 'save') {
      const result = await store.saveEnvironmentDraft?.();
      return !(result && result.ok === false);
    }
    await store.cancelEnvironmentDraft?.();
    return true;
  }

  async function finishEssenceRouteExit(action) {
    if (action === 'cancel' || action === false) return false;
    if (action === 'save') {
      if (!essenceEditDraft || essenceEditDraft.validName !== true) return false;
      const result = await saveEssenceEdit(essenceEditDraft.id || null, essenceEditDraft.updates);
      return result !== false;
    }
    essenceEditDirty = false;
    essenceEditDraft = null;
    return true;
  }

  async function finishSystemDetailsRouteExit(action) {
    if (action === 'cancel' || action === false) return false;
    if (action === 'save') {
      const result = await store.saveSystemDetails?.(
        systemDetailsDraft.name,
        systemDetailsDraft.description
      );
      return result !== false;
    }
    // Discard: clear the dirty flag and bump the reseed nonce so `SystemEditView`
    // reverts its local inputs to the persisted values, then let navigation proceed.
    //
    // The nonce bump is intentional defence-in-depth and is currently REDUNDANT: every
    // path that reaches this discard branch either navigates away (unmounting the view,
    // which re-seeds on remount) or changes the system id (which the identity gate
    // re-seeds on). It exists so a future in-place discard affordance — one that keeps
    // the form mounted on the same system — reverts the inputs correctly. Do not delete
    // it as dead code just because removing it leaves the tests green.
    systemDetailsDirty = false;
    systemDetailsReseedNonce += 1;
    return true;
  }

  async function finishRecipeRouteExit(action) {
    if (action === 'cancel' || action === false) return false;
    if (action === 'save') {
      const result = await saveRecipeDraft();
      return result !== false;
    }
    // Discard: roll the draft back to the last-persisted baseline so the dirty
    // flag clears, then let the caller proceed with navigation.
    recipeDraft = cloneRecipeDraft(recipeDraftBaseline);
    return true;
  }

  async function finishRecipeItemRouteExit(action) {
    if (action === 'cancel' || action === false) return false;
    if (action === 'save') {
      const result = await saveRecipeItemDraft();
      return result !== false;
    }
    // Discard: roll the draft back to the last-persisted baseline so the dirty
    // flag clears, then let the caller proceed with navigation.
    recipeItemDraft = cloneRecipeItemDraft(recipeItemDraftBaseline);
    return true;
  }

  async function finishComponentRouteExit(action) {
    if (action === 'cancel' || action === false) return false;
    if (action === 'save') {
      if (!componentEditDraft || !componentEditDraft.id) return false;
      const result = await saveComponentEdit(componentEditDraft.id, componentEditDraft.updates);
      return result !== false;
    }
    componentEditDirty = false;
    componentEditDraft = null;
    return true;
  }

  async function finishGatheringTaskRouteExit(action) {
    if (action === 'cancel' || action === false) return false;
    if (action === 'save') {
      const saved = await saveGatheringTaskDraft();
      if (saved === false) return false;
    }
    clearGatheringTaskDraft();
    return true;
  }

  async function finishGatheringEventRouteExit(action) {
    if (action === 'cancel' || action === false) return false;
    if (action === 'save') {
      const saved = await saveGatheringEventDraft();
      if (saved === false) return false;
    }
    clearGatheringEventDraft();
    return true;
  }

  function confirmGatheringEventRouteExit(nextView) {
    if (activeView !== 'gathering-event-edit') return true;
    if (!gatheringEventDraftDirty) return finishGatheringEventRouteExit(true);
    const confirmed = store.confirmDiscardDirtyGatheringEventDraft?.() ?? false;
    if (isPromise(confirmed)) return confirmed.then(finishGatheringEventRouteExit);
    return finishGatheringEventRouteExit(confirmed);
  }

  function confirmComponentRouteExit(nextView) {
    if (activeView !== 'component-edit') return true;
    if (componentEditCombinedDirty !== true) return true;
    const confirmed = store.confirmDiscardDirtyComponentDraft?.() ?? false;
    if (isPromise(confirmed)) return confirmed.then(finishComponentRouteExit);
    return finishComponentRouteExit(confirmed);
  }

  function confirmEnvironmentRouteExit(nextView) {
    if (activeView !== 'environment-edit' || nextView === 'environment-edit') return true;
    if ($viewState.environmentDraftDirty !== true) return true;
    const confirmed = store.confirmDiscardDirtyEnvironmentDraft?.();
    if (isPromise(confirmed)) return confirmed.then(finishEnvironmentRouteExit);
    return finishEnvironmentRouteExit(confirmed);
  }

  function confirmEssenceRouteExit(nextView) {
    if (activeView !== 'essence-edit') return true;
    if (essenceEditDirty !== true) return true;
    const confirmed = store.confirmDiscardDirtyEssenceDraft?.() ?? false;
    if (isPromise(confirmed)) return confirmed.then(finishEssenceRouteExit);
    return finishEssenceRouteExit(confirmed);
  }

  function runSystemDetailsDiscardPrompt() {
    const confirmed = store.confirmDiscardDirtySystemDetailsDraft?.() ?? 'cancel';
    if (isPromise(confirmed)) return confirmed.then(finishSystemDetailsRouteExit);
    return finishSystemDetailsRouteExit(confirmed);
  }

  // Same-view navigation keeps the identity form mounted on the SAME system, so the
  // lifted draft survives and must NOT prompt: `showSystemOverview` (the validation
  // blocker link) and `editSystem` on the already-selected system both re-enter
  // `system-edit`. Mirrors the `nextView` skip in `confirmRecipeRouteExit`.
  //
  // A scope-select SYSTEM swap also keeps the `system-edit` token (system-edit has no
  // SCOPE_BROWSER_BY_VIEW entry), and there the draft genuinely is at risk — that case
  // is guarded explicitly by `confirmSystemDetailsScopeChange`, not here.
  function confirmSystemDetailsRouteExit(nextView) {
    if (activeView !== 'system-edit' || nextView === 'system-edit') return true;
    if (systemDetailsDirty !== true) return true;
    return runSystemDetailsDiscardPrompt();
  }

  // Scope-select swaps the SYSTEM while keeping the view token, so the same-view skip
  // above would let a dirty identity draft through. The draft belongs to the outgoing
  // system, so a real switch must still prompt.
  function confirmSystemDetailsScopeChange(systemId) {
    if (activeView !== 'system-edit') return true;
    if (systemId === selectedSystemId || systemDetailsDirty !== true) return true;
    return runSystemDetailsDiscardPrompt();
  }

  function confirmRecipeRouteExit(nextView) {
    if (activeView !== 'recipe-edit' || nextView === 'recipe-edit') return true;
    if (recipeEditDirty !== true) return true;
    const confirmed = store.confirmDiscardDirtyRecipeDraft?.() ?? false;
    if (isPromise(confirmed)) return confirmed.then(finishRecipeRouteExit);
    return finishRecipeRouteExit(confirmed);
  }

  function confirmRecipeItemRouteExit(nextView) {
    if (activeView !== 'recipe-item-edit' || nextView === 'recipe-item-edit') return true;
    if (recipeItemEditDirty !== true) return true;
    const confirmed = store.confirmDiscardDirtyRecipeItemDraft?.() ?? false;
    if (isPromise(confirmed)) return confirmed.then(finishRecipeItemRouteExit);
    return finishRecipeItemRouteExit(confirmed);
  }

  function confirmGatheringTaskRouteExit(nextView) {
    if (activeView !== 'gathering-task-edit') return true;
    if (!gatheringTaskDraftDirty) return finishGatheringTaskRouteExit(true);
    const confirmed = store.confirmDiscardDirtyGatheringTaskDraft?.() ?? false;
    if (isPromise(confirmed)) return confirmed.then(finishGatheringTaskRouteExit);
    return finishGatheringTaskRouteExit(confirmed);
  }

  function confirmRouteExit(nextView) {
    const environmentConfirmed = confirmEnvironmentRouteExit(nextView);
    if (isPromise(environmentConfirmed)) {
      return environmentConfirmed.then(value => {
        if (value === false) return false;
        const essenceResult = confirmEssenceRouteExit(nextView);
        if (isPromise(essenceResult)) {
          return essenceResult.then(essenceValue => essenceValue === false
            ? false
            : continueRouteExitAfterEssence(nextView));
        }
        return essenceResult === false ? false : continueRouteExitAfterEssence(nextView);
      });
    }
    if (environmentConfirmed === false) return false;
    const essenceResult = confirmEssenceRouteExit(nextView);
    if (isPromise(essenceResult)) {
      return essenceResult.then(value => value === false ? false : continueRouteExitAfterEssence(nextView));
    }
    if (essenceResult === false) return false;
    return continueRouteExitAfterEssence(nextView);
  }

  function continueRouteExitAfterEssence(nextView) {
    const recipeResult = confirmRecipeRouteExit(nextView);
    if (isPromise(recipeResult)) {
      return recipeResult.then(value => value === false ? false : continueRouteExitAfterRecipe(nextView));
    }
    if (recipeResult === false) return false;
    return continueRouteExitAfterRecipe(nextView);
  }

  function continueRouteExitAfterRecipe(nextView) {
    const recipeItemResult = confirmRecipeItemRouteExit(nextView);
    if (isPromise(recipeItemResult)) {
      return recipeItemResult.then(value => value === false ? false : continueRouteExitAfterRecipeItem(nextView));
    }
    if (recipeItemResult === false) return false;
    return continueRouteExitAfterRecipeItem(nextView);
  }

  function continueRouteExitAfterRecipeItem(nextView) {
    const componentResult = confirmComponentRouteExit(nextView);
    if (isPromise(componentResult)) {
      return componentResult.then(value => value === false ? false : continueRouteExitAfterComponent(nextView));
    }
    if (componentResult === false) return false;
    return continueRouteExitAfterComponent(nextView);
  }

  function continueRouteExitAfterComponent(nextView) {
    const taskResult = confirmGatheringTaskRouteExit(nextView);
    if (isPromise(taskResult)) {
      return taskResult.then(value => value === false ? false : continueRouteExitAfterTask(nextView));
    }
    if (taskResult === false) return false;
    return continueRouteExitAfterTask(nextView);
  }

  function continueRouteExitAfterTask(nextView) {
    const eventResult = confirmGatheringEventRouteExit(nextView);
    if (isPromise(eventResult)) {
      return eventResult.then(value => value === false ? false : continueRouteExitAfterTools(nextView));
    }
    if (eventResult === false) return false;
    return continueRouteExitAfterTools(nextView);
  }

  function continueRouteExitAfterTools(nextView) {
    const toolsResult = confirmToolsRouteExit(nextView);
    if (isPromise(toolsResult)) {
      return toolsResult.then(value => value === false ? false : confirmSystemDetailsRouteExit(nextView));
    }
    if (toolsResult === false) return false;
    return confirmSystemDetailsRouteExit(nextView);
  }

  // When a "Save all" is blocked by a tool that fails validation (after blank,
  // unmodified new drafts are discarded by the store), tell the user why and
  // focus the offending tool, instead of silently aborting the save and leaving
  // them stranded on the tools page (issue 297).
  function surfaceToolsSaveValidationError() {
    const validation = store?.validateToolsDraft?.() ?? { valid: true, errors: [] };
    if (validation.valid) return;
    const firstInvalidId = validation.errors?.[0]?.id;
    if (firstInvalidId) store?.selectDraftTool?.(firstInvalidId);
    notifyWarn(localize('FABRICATE.Admin.Manager.Tools.SaveBlockedInvalid'));
  }

  async function finishToolsRouteExit(action) {
    if (action === 'save') {
      const saved = await store?.saveAllDirtyToolDrafts?.();
      if (saved === false) {
        surfaceToolsSaveValidationError();
        return false;
      }
      store?.cancelToolsDraft?.();
      return true;
    }
    if (action === 'discard' || action === true) {
      store?.cancelToolsDraft?.();
      return true;
    }
    return false;
  }

  function confirmToolsRouteExit(nextView) {
    if (activeView !== 'tools') return true;
    if (nextView === 'tools') return true;
    if (!store?.isToolsDraftDirty?.()) {
      store?.cancelToolsDraft?.();
      return true;
    }
    const confirmation = services?.confirmDirtyToolsNavigation
      ? services.confirmDirtyToolsNavigation({ dirtyCount: dirtyToolIds.length })
      : store?.confirmDiscardDirtyToolsDraft?.();
    if (isPromise(confirmation)) return confirmation.then(finishToolsRouteExit);
    return finishToolsRouteExit(confirmation);
  }

  function setView(view) {
    if ((view === 'recipes' || view === 'components' || view === 'component-edit' || view === 'tags' || view === 'system-edit' || view === 'tools' || view === 'checks') && !selectedSystem) return;
    if ((view === 'environments' || view === 'environment-edit' || view === 'gathering-task-edit' || view === 'gathering-event-edit') && !canShowEnvironments) return;
    if ((view === 'essences' || view === 'essence-edit') && !canShowEssences) return;
    afterTruthyResult(confirmRouteExit(view), () => {
      activeView = view;
      if (view === 'tools') store?.enterToolsDraft?.(selectedSystemId);
    });
  }

  function selectSystem(systemId, nextView = 'systems') {
    const runSelection = () => {
      const selected = store.selectSystem?.(systemId);
      if (isPromise(selected)) return selected.then(value => value !== false);
      return selected !== false;
    };
    if (systemId === selectedSystemId) {
      const confirmed = confirmRouteExit(nextView);
      if (isPromise(confirmed)) return confirmed.then(value => value === false ? false : runSelection());
      if (confirmed === false) return false;
    }
    return runSelection();
  }

  // A per-record editor/detail view is bound to ONE system's record, so switching the
  // crafting system from the rail scope-select must return the GM to the corresponding
  // studio BROWSER for the new system rather than stranding them in an editor for a
  // record that does not exist under the new system (e.g. recipe-edit → recipes). Browser,
  // list, and settings views are not listed and stay put — they simply reload for the new
  // system, which is the desired behaviour.
  const SCOPE_BROWSER_BY_VIEW = {
    'recipe-edit': 'recipes',
    'recipe-item-edit': 'books-scrolls',
    'component-edit': 'components',
    'essence-edit': 'essences',
  };

  function browserViewForScopeChange(view) {
    return SCOPE_BROWSER_BY_VIEW[view] || view;
  }

  // Scope-select change: route to the corresponding browser for the new system, running
  // the dirty-exit guard first (the different-system path in selectSystem skips it), so
  // an unsaved editor still prompts before the switch.
  function changeScopeSystem(systemId) {
    if (!systemId) return;
    const target = browserViewForScopeChange(currentView);
    // The system-details guard skips same-view exits, so a `system-edit` scope swap
    // (same view token, different system) is guarded explicitly first.
    afterTruthyResult(confirmSystemDetailsScopeChange(systemId), () => {
      afterTruthyResult(confirmRouteExit(target), () => {
        const selected = store.selectSystem?.(systemId);
        const landed = isPromise(selected) ? selected.then((value) => value !== false) : selected !== false;
        afterTruthyResult(landed, () => { activeView = target; });
      });
    });
  }

  function selectSystemAndShowBrowser(systemId = selectedSystemId) {
    const selected = systemId ? selectSystem(systemId, 'systems') : confirmRouteExit('systems');
    afterTruthyResult(selected, () => { activeView = 'systems'; });
  }

  // Open the System Overview page (`system-edit`) on a specific tab. Bumping the
  // nonce re-applies the requested tab in the child even when the page is already
  // shown or the same system is re-selected, so deep links and the blocker banner
  // can force the Validation tab open.
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

  // The standalone overview route was folded into the System Overview page's
  // Validation tab. Anything that asked for the old overview now opens this page
  // with the Validation tab active.
  function showSystemOverview() {
    if (!selectedSystem) return;
    afterTruthyResult(confirmRouteExit('system-edit'), () => {
      requestSystemTab('validation');
      activeView = 'system-edit';
    });
  }

  // Maps a system-validation issue `kind` to the manager's deep-link selection
  // helper + the view it routes to. This is the single source of truth the
  // overview deep-links and the deep-link drift test both read, so an issue
  // `nav.view`/`kind` the aggregator can emit always resolves to a real view
  // token (the `system` kind is the overview itself and carries no deep link).
  //
  // `targetId(issue)` picks the id the selection helper can actually resolve:
  // recipe/salvage use the entity's own id, but the environment editor selects
  // by ENVIRONMENT id, so environment/task/event deep-links use the issue's
  // `environmentId` (the task/event record id never resolves through
  // `selectEnvironment`).
  const OVERVIEW_DEEP_LINKS = {
    recipe: { view: 'recipe-edit', targetId: (issue) => issue.entityId, open: (id) => editRecipe(id) },
    environment: { view: 'environment-edit', targetId: (issue) => issue.environmentId, open: (id) => editEnvironment(id) },
    task: { view: 'environment-edit', targetId: (issue) => issue.environmentId, open: (id) => editEnvironment(id) },
    event: { view: 'environment-edit', targetId: (issue) => issue.environmentId, open: (id) => editEnvironment(id) },
    salvage: { view: 'component-edit', targetId: (issue) => issue.entityId, open: (id) => editComponent(id) }
  };

  function selectOverviewIssue(issue) {
    if (!issue) return;
    const target = OVERVIEW_DEEP_LINKS[issue.kind];
    if (!target) return;
    const id = target.targetId(issue);
    if (!id) return;
    target.open(id);
  }

  function backToSystemsBrowser() {
    afterTruthyResult(confirmRouteExit('systems'), () => { activeView = 'systems'; });
  }

  function backToEnvironmentsBrowse() {
    afterTruthyResult(confirmRouteExit('environments'), () => {
      activeView = canShowEnvironments ? 'environments' : 'systems';
      if (canShowEnvironments) gatheringMenuExpanded = true;
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
    return isCreatingEssenceDraft
      ? text('FABRICATE.Admin.Manager.Essence.Create', 'Create essence')
      : text('FABRICATE.Admin.Manager.Essence.Save', 'Save essence');
  }


  function selectRecipe(recipeId) {
    selectedRecipeId = recipeId;
  }

  // Deep PLAIN clone for the recipe draft + baseline. Mirrors the gathering-task /
  // event draft helpers: JSON round-trip strips reactivity and shared references so
  // the dirty comparison and discard-revert are stable.
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
      const source = ($viewState.recipes || []).find(recipe => recipe.id === recipeId) || null;
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

  // Commit the staged draft in a single updateRecipe call. allowIncomplete keeps a
  // shell's empty ingredients/results from blocking the save. On success the
  // baseline advances (clearing dirty) and we return to the browser; on failure the
  // store toasts and we surface an in-view warning.
  async function saveRecipeDraft() {
    if (recipeEditSaving) return false;
    if (!recipeDraft?.id) return false;
    recipeEditSaving = true;
    recipeSaveFailed = false;
    try {
      // notify:false — an editor save is the GM's own explicit action (the view
      // returns to the browser on success), so a "Recipe updated" toast is noise.
      const result = await store.updateRecipe?.(recipeDraft.id, recipeDraft, { allowIncomplete: true, notify: false });
      if (result === false) {
        recipeSaveFailed = true;
        return false;
      }
      recipeDraftBaseline = cloneRecipeDraft(recipeDraft);
      activeView = 'recipes';
      return result;
    } catch (err) {
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

  // The on/off toggle is the one immediate exception: enabling validates against the
  // PERSISTED recipe, so it commits straight away (no staging, no dirty). On success
  // both draft and baseline sync to the new state so it never registers as dirty; on
  // failure the store toasts and we leave the toggle as-is.
  async function handleToggleRecipeEnabled() {
    if (!recipeDraft?.id) return;
    const next = recipeDraft.enabled === false;
    const ok = await store.toggleRecipeEnabled?.(recipeDraft.id, next);
    if (ok === false) return;
    recipeDraft = { ...recipeDraft, enabled: next };
    recipeDraftBaseline = recipeDraftBaseline ? { ...recipeDraftBaseline, enabled: next } : recipeDraftBaseline;
  }

  // Deep-link from the recipe editor's context rail to the Access screen, with THIS
  // recipe selected. The rail is read-only: authoring a grant lives on the Access tab,
  // which owns the canonical `recipe.access` editor.
  function openRecipeAccess() {
    if (recipeDraft?.id) selectedRecipeIdForAccess = recipeDraft.id;
    openCraftingSection('access');
  }

  // Remove ONE book from this recipe's membership (issue 511 many-to-many) — used
  // by the Books & Scrolls tab's per-book unlink. Other linked books are kept. ADDING a
  // recipe to a book is authored on Books & Scrolls, not here.
  async function handleRemoveRecipeItem(recipeItemId) {
    const rid = recipeDraft?.id;
    if (!rid || !recipeItemId) return false;
    const liveRecipe = ($viewState.recipes || []).find((r) => String(r?.id) === String(rid));
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

  // Enter multi-step: seed Step 1 from the draft's current top-level ingredients /
  // results / tools so an already-craftable recipe stays craftable (the engine only
  // falls back to top-level fields when the steps array is empty). New/empty recipes
  // simply start with one named, empty step.
  // Draft-staged steps need a stable id up front: step-scoped edits (ingredient
  // sets, results, tools, duration) route by step id, and the store only assigns
  // ids on save. Without one, an id-less step's edits misroute to the recipe scope.
  function newStepId() {
    return globalThis.foundry?.utils?.randomID?.() || `step-${Math.random().toString(36).slice(2, 10)}`;
  }

  function handleEnterMultiStep() {
    if (!recipeDraft) return false;
    const seeded = {
      id: newStepId(),
      name: `${text('FABRICATE.Admin.Manager.Recipe.StepLabel', 'Step')} 1`,
      description: '',
      ingredientSets: recipeDraft.ingredientSets || [],
      resultGroups: recipeDraft.resultGroups || [],
      toolIds: recipeDraft.toolIds || []
    };
    patchRecipeDraft({ steps: [seeded] });
    return true;
  }

  // Reverting multi-step → single-step discards the per-step authoring, so warn
  // before staging the empty steps array (engine falls back to top-level fields).
  async function handleRevertToSingleStep() {
    if (!recipeDraft) return false;
    const name = String(recipeDraft.name || '').trim() || text('FABRICATE.Admin.Manager.Recipe.UnnamedRecipe', 'this recipe');
    const confirmed = await store.confirmRecipeAction?.({
      title: localize('FABRICATE.Admin.Manager.Recipe.RevertToSingleStepTitle'),
      content: localize('FABRICATE.Admin.Manager.Recipe.RevertToSingleStepContent', { name })
    });
    if (!confirmed) return false;
    patchRecipeDraft({ steps: [] });
    return true;
  }


  function currentSteps() {
    return Array.isArray(recipeDraft?.steps) ? [...recipeDraft.steps] : [];
  }

  // Locking persists immediately (like enable) and is NEVER gated in either
  // direction — a GM locks a recipe precisely while it is unfinished, which is the
  // explicit contrast with toggleRecipeEnabled. Draft AND baseline both advance so a
  // lock never registers as an unsaved recipe edit.
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
    steps.push({ id: newStepId(), name: `${text('FABRICATE.Admin.Manager.Recipe.StepLabel', 'Step')} ${steps.length + 1}`, description: '' });
    patchRecipeDraft({ steps });
    return true;
  }

  function handleReorderSteps(from, to) {
    if (!recipeDraft) return false;
    const steps = currentSteps();
    if (from < 0 || to < 0 || from >= steps.length || to >= steps.length || from === to) return false;
    const [moved] = steps.splice(from, 1);
    steps.splice(to, 0, moved);
    patchRecipeDraft({ steps });
    return true;
  }

  function handleUpdateStep(stepId, patch) {
    if (!recipeDraft || !patch) return false;
    const steps = currentSteps().map(step => (step.id === stepId ? { ...step, ...patch } : step));
    patchRecipeDraft({ steps });
    return true;
  }

  // Deleting a step removes the whole step (its ingredients, results, and tools), so
  // warn with wording contextual to the tab the delete came from
  // ('overview' | 'ingredients' | 'results' | 'tools'). Removing the last step
  // reverts to single-step (empty steps array → top-level fallback). Then stage it.
  async function handleDeleteStep(stepId, context = 'overview') {
    if (!recipeDraft) return false;
    const steps = currentSteps();
    const step = steps.find(entry => entry?.id === stepId);
    if (!step) return false;
    const name = String(step.name || '').trim() || text('FABRICATE.Admin.Manager.Recipe.UnnamedStep', 'this step');
    const alsoDeleted = localize({
      ingredients: 'FABRICATE.Admin.Manager.Recipe.DeleteStepAlsoIngredients',
      results: 'FABRICATE.Admin.Manager.Recipe.DeleteStepAlsoResults',
      tools: 'FABRICATE.Admin.Manager.Recipe.DeleteStepAlsoTools'
    }[context] || 'FABRICATE.Admin.Manager.Recipe.DeleteStepAlsoAll');
    const confirmed = await store.confirmRecipeAction?.({
      title: localize('FABRICATE.Admin.Manager.Recipe.DeleteStepTitle'),
      content: localize('FABRICATE.Admin.Manager.Recipe.DeleteStepContent', { name, alsoDeleted })
    });
    if (!confirmed) return false;
    patchRecipeDraft({ steps: steps.filter(entry => entry?.id !== stepId) });
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

  function createEssenceDraft() {
    if (!canShowEssences) return;
    afterTruthyResult(confirmRouteExit('essence-edit'), () => {
      selectedEssenceId = '';
      essenceEditDirty = false;
      essenceEditDraft = null;
      activeView = 'essence-edit';
    });
  }

  function editEssence(essenceId = selectedEssence?.id) {
    if (!essenceId || !canShowEssences) return;
    if (currentView === 'essence-edit' && essenceId === selectedEssenceId) return;
    afterTruthyResult(confirmRouteExit('essence-edit'), () => {
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

  function createSystem() {
    store.createSystem?.();
  }

  function importSystem() {
    store.importSystem?.();
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

  // Enabling is GATED: an incomplete recipe (or one with a conflicting signature) is
  // refused. `options.onBlocked` is the library row's in-window flash claiming that
  // refusal message; supplying it makes the store SUPPRESS its Foundry notification,
  // so the GM is never told the same thing twice.
  function toggleRecipeEnabled(recipeId, enabled, options) {
    store.toggleRecipeEnabled?.(recipeId, enabled, options);
  }

  function dropComponent(data) {
    services?.onDropItem?.(data);
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
    afterTruthyResult(confirmRouteExit('components'), () => { activeView = 'components'; });
  }

  // The salvage DC control's "Manage presets" deep link (issue 676, decision 7).
  // Routed through setView so it passes confirmRouteExit like every other navigation
  // — never by assigning `activeView`, which would silently discard a dirty draft.
  function openSalvageCheckPresets() {
    setView('checks');
  }

  function cancelComponentEdit() {
    backToComponentsBrowse();
  }

  function handleComponentDraftChange(draft) {
    componentEditDraft = draft || null;
    componentEditDirty = draft?.dirty === true;
  }

  async function saveComponentEdit(itemId, updates) {
    if (componentEditSaving || !itemId) return false;
    componentEditSaving = true;
    try {
      // Fold the staged progressive-difficulty value into the same update so it
      // persists through the editor's Save flow (only when the difficulty input
      // is shown for this progressive system).
      const merged = componentDifficultyShown
        ? { ...(updates || {}), difficulty: normalizeComponentDifficulty(componentDifficultyDraft) }
        : updates;
      const result = await store.updateComponent?.(itemId, merged);
      if (result === false) return false;
      componentEditDirty = false;
      componentEditDraft = null;
      activeView = 'components';
      return true;
    } catch (err) {
      return false;
    } finally {
      componentEditSaving = false;
    }
  }

  function replaceComponentSource(itemId, data) {
    if (!itemId) return;
    services?.onReplaceSource?.(itemId, data);
  }

  // Coerce a raw difficulty value to the persisted shape: an integer >= 1, or
  // null (cleared) for blank / sub-1 / non-integer / invalid input. Used to both
  // stage and compare the draft against the persisted component value.
  function normalizeComponentDifficulty(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const numeric = Math.trunc(Number(value));
    return Number.isFinite(numeric) && numeric >= 1 ? numeric : null;
  }

  // Stage a progressive-difficulty edit from the right inspector. This does NOT
  // persist — the value rides along with the component editor's draft and is
  // written on Save (see saveComponentEdit), so its dirty state and the Save
  // button stay in sync with the rest of the editor.
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
    return text('FABRICATE.Admin.Manager.Component.SaveComponent', 'Save Component');
  }

  function deleteComponent(itemId = selectedComponent?.id) {
    if (!itemId) return;
    store.deleteComponent?.(itemId);
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
          showEssenceSourceUi ? updates.sourceComponentId || null : null
        );
      if (result === false) return false;
      essenceEditDirty = false;
      essenceEditDraft = null;
      activeView = canShowEssences ? 'essences' : 'systems';
      return result;
    } catch (err) {
      return false;
    } finally {
      essenceEditSaving = false;
    }
  }

  function cancelEssenceEdit() {
    afterTruthyResult(confirmRouteExit('essences'), () => {
      activeView = canShowEssences ? 'essences' : 'systems';
    });
  }

  function handleEssenceDraftChange(draft) {
    essenceEditDraft = draft || null;
    essenceEditDirty = draft?.dirty === true;
  }

  function removeEssence(essenceId = selectedEssence?.id) {
    if (!essenceId) return;
    const essence = essenceCards.find(card => card.id === essenceId);
    if (essence?.deleteBlocked) return;
    store.removeEssence?.(essenceId);
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

  function selectEnvironment(environmentId = selectedEnvironment?.id) {
    if (!environmentId) return;
    store.selectEnvironment?.(environmentId);
  }

  function editEnvironment(environmentId = selectedEnvironment?.id) {
    if (!environmentId || !canShowEnvironments) return;
    afterTruthyResult(store.selectEnvironment?.(environmentId), () => { activeView = 'environment-edit'; });
  }

  function createEnvironment() {
    if (!canShowEnvironments) return;
    const created = store.createEnvironmentDraft?.();
    if (isPromise(created)) {
      created.then(value => {
        if (value !== false && value !== null) activeView = 'environment-edit';
      });
      return;
    }
    if (created !== false && created !== null) activeView = 'environment-edit';
  }

  function toggleEnvironmentEnabled(environmentId, enabled) {
    if (!environmentId) return;
    store.toggleEnvironmentEnabled?.(environmentId, enabled);
  }

  function duplicateEnvironment(environmentId = selectedEnvironment?.id) {
    if (!environmentId) return;
    store.duplicateEnvironmentDraft?.(environmentId);
  }

  function deleteEnvironment(environmentId = selectedEnvironment?.id) {
    if (!environmentId) return;
    store.deleteEnvironmentDraft?.(environmentId);
  }

  function selectGatheringTask(taskId = selectedGatheringTask?.id) {
    selectedGatheringTaskId = taskId || '';
  }

  function createGatheringTask(systemId = selectedSystemId) {
    if (!systemId) return;
    const created = store.addGatheringLibraryTask?.(systemId);
    if (isPromise(created)) {
      created.then(task => {
        if (task?.id) selectedGatheringTaskId = task.id;
      });
      return;
    }
    if (created?.id) selectedGatheringTaskId = created.id;
  }

  function editGatheringTask(taskId = selectedGatheringTask?.id) {
    if (!taskId || !canShowEnvironments) return;
    selectedGatheringTaskId = taskId;
    const source = gatheringTaskDefinitions.find(task => task.id === taskId) || null;
    const snapshot = source ? JSON.parse(JSON.stringify(source)) : null;
    gatheringTaskDraft = snapshot;
    gatheringTaskDraftBaseline = snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
    gatheringTaskSaveError = '';
    activeGatheringTab = 'tasks';
    gatheringMenuExpanded = true;
    activeView = 'gathering-task-edit';
  }

  function clearGatheringTaskDraft() {
    gatheringTaskDraft = null;
    gatheringTaskDraftBaseline = null;
    gatheringTaskSaveError = '';
  }

  function backToGatheringTaskLibrary() {
    afterTruthyResult(confirmRouteExit('environments'), () => {
      activeGatheringTab = 'tasks';
      gatheringMenuExpanded = true;
      activeView = 'environments';
    });
  }

  async function saveGatheringTaskDraft() {
    if (!gatheringTaskDraft || !selectedSystemId || !selectedGatheringTaskId) return false;
    const { valid, errors } = gatheringTaskValidation;
    if (!valid) {
      gatheringTaskSaveError = errors[0] || '';
      return false;
    }
    const proceed = await store.confirmGatheringLibraryTaskCompositionLoss?.(selectedSystemId, selectedGatheringTaskId, gatheringTaskDraft) ?? true;
    if (!proceed) return false; // GM cancelled the match-loss warning — keep editing, no save error
    gatheringTaskSaving = true;
    try {
      const ok = await store.updateGatheringLibraryTask?.(selectedSystemId, selectedGatheringTaskId, gatheringTaskDraft);
      if (ok) {
        gatheringTaskDraftBaseline = JSON.parse(JSON.stringify(gatheringTaskDraft));
        gatheringTaskSaveError = '';
        return true;
      }
      gatheringTaskSaveError = text('FABRICATE.Admin.Manager.Environment.Tasks.SaveFailed', 'Save failed. Try again.');
      return false;
    } catch (error) {
      console.error('Failed to save gathering task draft', error);
      gatheringTaskSaveError = text('FABRICATE.Admin.Manager.Environment.Tasks.SaveFailed', 'Save failed. Try again.');
      return false;
    } finally {
      gatheringTaskSaving = false;
    }
  }

  async function deleteGatheringTaskDraft() {
    if (!selectedSystemId || !selectedGatheringTaskId) return;
    const deletedTaskId = selectedGatheringTaskId;
    const result = await store.deleteGatheringLibraryTask?.(selectedSystemId, deletedTaskId);
    if (result === false) return;
    if (selectedGatheringTaskId === deletedTaskId) selectedGatheringTaskId = '';
    gatheringTaskDraft = null;
    gatheringTaskDraftBaseline = null;
    gatheringTaskSaveError = '';
    activeGatheringTab = 'tasks';
    gatheringMenuExpanded = true;
    activeView = 'environments';
  }

  function duplicateGatheringTask(systemId = selectedSystemId, taskId = selectedGatheringTask?.id) {
    if (!systemId || !taskId) return;
    const duplicated = store.duplicateGatheringLibraryTask?.(systemId, taskId);
    if (isPromise(duplicated)) {
      duplicated.then(task => {
        if (task?.id) selectedGatheringTaskId = task.id;
      });
      return;
    }
    if (duplicated?.id) selectedGatheringTaskId = duplicated.id;
  }

  function deleteGatheringTask(systemId = selectedSystemId, taskId = selectedGatheringTask?.id) {
    if (!systemId || !taskId) return;
    const deleted = store.deleteGatheringLibraryTask?.(systemId, taskId);
    if (isPromise(deleted)) {
      deleted.then(value => {
        if (value !== false && selectedGatheringTaskId === taskId) selectedGatheringTaskId = '';
      });
      return;
    }
    if (deleted !== false && selectedGatheringTaskId === taskId) selectedGatheringTaskId = '';
  }

  function toggleGatheringTaskEnabled(systemId = selectedSystemId, taskId = selectedGatheringTask?.id, enabled = true) {
    if (!systemId || !taskId) return;
    store.updateGatheringLibraryTask?.(systemId, taskId, { enabled });
  }

  function selectGatheringEvent(eventId = selectedGatheringEvent?.id) {
    selectedGatheringEventId = eventId || '';
  }

  function createGatheringEvent(systemId = selectedSystemId) {
    if (!systemId) return;
    const created = store.addGatheringLibraryEvent?.(systemId);
    if (isPromise(created)) {
      created.then(event => {
        if (event?.id) selectedGatheringEventId = event.id;
      });
      return;
    }
    if (created?.id) selectedGatheringEventId = created.id;
  }

  function editGatheringEvent(eventId = selectedGatheringEvent?.id) {
    if (!eventId || !canShowEnvironments) return;
    selectedGatheringEventId = eventId;
    const source = gatheringEventDefinitions.find(event => event.id === eventId) || null;
    const snapshot = source ? JSON.parse(JSON.stringify(source)) : null;
    gatheringEventDraft = snapshot;
    gatheringEventDraftBaseline = snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
    gatheringEventSaveError = '';
    activeGatheringTab = 'encounters';
    gatheringMenuExpanded = true;
    activeView = 'gathering-event-edit';
  }

  function clearGatheringEventDraft() {
    gatheringEventDraft = null;
    gatheringEventDraftBaseline = null;
    gatheringEventSaveError = '';
    gatheringEventSaving = false;
  }

  function backToGatheringEventLibrary() {
    afterTruthyResult(confirmRouteExit('environments'), () => {
      activeGatheringTab = 'encounters';
      gatheringMenuExpanded = true;
      activeView = 'environments';
    });
  }

  async function saveGatheringEventDraft() {
    if (!gatheringEventDraft || !selectedSystemId || !selectedGatheringEventId) return false;
    const { valid, errors } = gatheringEventValidation;
    if (!valid) {
      gatheringEventSaveError = errors[0] || '';
      return false;
    }
    const proceed = await store.confirmGatheringLibraryEventCompositionLoss?.(selectedSystemId, selectedGatheringEventId, gatheringEventDraft) ?? true;
    if (!proceed) return false; // GM cancelled the match-loss warning — keep editing, no save error
    gatheringEventSaving = true;
    try {
      const ok = await store.updateGatheringLibraryEvent?.(selectedSystemId, selectedGatheringEventId, gatheringEventDraft);
      if (ok !== false) {
        gatheringEventDraftBaseline = JSON.parse(JSON.stringify(gatheringEventDraft));
        gatheringEventSaveError = '';
        return true;
      }
      return false;
    } finally {
      gatheringEventSaving = false;
    }
  }

  async function deleteGatheringEventDraft() {
    if (!selectedGatheringEventId || !selectedSystemId) return;
    const message = text(
      'FABRICATE.Admin.Manager.Environment.Events.DeleteConfirm',
      'Delete this event? This cannot be undone.'
    );
    const confirmed = typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : true;
    if (confirmed === false) return;
    const deletedId = selectedGatheringEventId;
    await store.deleteGatheringLibraryEvent?.(selectedSystemId, deletedId);
    if (selectedGatheringEventId === deletedId) selectedGatheringEventId = '';
    clearGatheringEventDraft();
    activeGatheringTab = 'encounters';
    gatheringMenuExpanded = true;
    activeView = 'environments';
  }

  function duplicateGatheringEvent(systemId = selectedSystemId, eventId = selectedGatheringEvent?.id) {
    if (!systemId || !eventId) return;
    const duplicated = store.duplicateGatheringLibraryEvent?.(systemId, eventId);
    if (isPromise(duplicated)) {
      duplicated.then(event => {
        if (event?.id) selectedGatheringEventId = event.id;
      });
      return;
    }
    if (duplicated?.id) selectedGatheringEventId = duplicated.id;
  }

  function deleteGatheringEvent(systemId = selectedSystemId, eventId = selectedGatheringEvent?.id) {
    if (!systemId || !eventId) return;
    const deleted = store.deleteGatheringLibraryEvent?.(systemId, eventId);
    if (isPromise(deleted)) {
      deleted.then(value => {
        if (value !== false && selectedGatheringEventId === eventId) selectedGatheringEventId = '';
      });
      return;
    }
    if (deleted !== false && selectedGatheringEventId === eventId) selectedGatheringEventId = '';
  }

  function toggleGatheringEventEnabled(systemId = selectedSystemId, eventId = selectedGatheringEvent?.id, enabled = true) {
    if (!systemId || !eventId) return;
    store.updateGatheringLibraryEvent?.(systemId, eventId, { enabled });
  }

  function updateSelectedGatheringEvent(updates = {}) {
    if (gatheringEventDraft) {
      gatheringEventDraft = { ...gatheringEventDraft, ...updates };
      return true;
    }
    if (!selectedSystemId || !selectedGatheringEvent?.id) return false;
    return store.updateGatheringLibraryEvent?.(selectedSystemId, selectedGatheringEvent.id, updates);
  }

  function updateSelectedGatheringTask(updates = {}) {
    if (gatheringTaskDraft) {
      gatheringTaskDraft = { ...gatheringTaskDraft, ...updates };
      return true;
    }
    if (!selectedSystemId || !selectedGatheringTask?.id) return false;
    return store.updateGatheringLibraryTask?.(selectedSystemId, selectedGatheringTask.id, updates);
  }

  function addToolReferenceToSelectedTask(toolId) {
    if (!editingGatheringTask || !toolId) return;
    const existing = Array.isArray(editingGatheringTask.toolIds) ? editingGatheringTask.toolIds : [];
    if (existing.includes(toolId)) return;
    updateSelectedGatheringTask({ toolIds: [...existing, toolId] });
  }

  function removeToolReferenceFromSelectedTask(toolId) {
    if (!editingGatheringTask || !toolId) return;
    const existing = Array.isArray(editingGatheringTask.toolIds) ? editingGatheringTask.toolIds : [];
    updateSelectedGatheringTask({ toolIds: existing.filter(id => id !== toolId) });
  }

  function gatheringDropRowId() {
    return `drop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function addGatheringTaskDrop() {
    if (!editingGatheringTask) return;
    const row = {
      id: gatheringDropRowId(),
      name: '',
      componentId: '',
      itemUuid: '',
      quantity: 1,
      dropRate: 25,
      conditionModifiers: { biome: [], timeOfDay: [], weather: [] },
      enabled: false
    };
    selectedGatheringDropId = row.id;
    updateSelectedGatheringTask({ dropRows: [...gatheringTaskDropRows(editingGatheringTask), row] });
  }

  function updateGatheringTaskDrop(rowId, updates = {}) {
    if (!editingGatheringTask || !rowId) return;
    const rows = gatheringTaskDropRows(editingGatheringTask).map(row => row.id === rowId ? { ...row, ...updates } : row);
    const patch = store.gatheringTaskAutopopulateFromComponent?.(selectedSystemId, editingGatheringTask, rows) || {};
    updateSelectedGatheringTask({ dropRows: rows, ...patch });
  }

  function duplicateGatheringTaskDrop(rowId = selectedGatheringDrop?.id) {
    if (!editingGatheringTask || !rowId) return;
    const rows = gatheringTaskDropRows(editingGatheringTask);
    const index = rows.findIndex(row => row.id === rowId);
    if (index < 0) return;
    const duplicate = { ...JSON.parse(JSON.stringify(rows[index])), id: gatheringDropRowId() };
    selectedGatheringDropId = duplicate.id;
    updateSelectedGatheringTask({ dropRows: [...rows.slice(0, index + 1), duplicate, ...rows.slice(index + 1)] });
  }

  function deleteGatheringTaskDrop(rowId = selectedGatheringDrop?.id) {
    if (!editingGatheringTask || !rowId) return;
    const rows = gatheringTaskDropRows(editingGatheringTask);
    const index = rows.findIndex(row => row.id === rowId);
    const nextRows = rows.filter(row => row.id !== rowId);
    selectedGatheringDropId = nextRows[Math.min(index, nextRows.length - 1)]?.id || '';
    updateSelectedGatheringTask({ dropRows: nextRows });
  }

  function moveGatheringTaskDrop(rowId, direction) {
    if (!editingGatheringTask || !rowId) return;
    const rows = gatheringTaskDropRows(editingGatheringTask);
    const index = rows.findIndex(row => row.id === rowId);
    if (index < 0) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    updateSelectedGatheringTask({ dropRows: next });
  }

  async function importGatheringTaskDrop(rowId, data) {
    if (!rowId) return false;
    const item = await services?.importSingleManagedItemFromDrop?.(data);
    if (!item?.id) return false;
    updateGatheringTaskDrop(rowId, { componentId: item.id, itemUuid: '', name: '', enabled: true });
    selectedGatheringDropId = rowId;
    return true;
  }

  async function addToolFromDrop(data) {
    if (!data) return false;
    // A managed-component drop still links the tool to that component (whetstone / component-
    // linked tool).
    if (data.type === 'FabricateManagedComponent') {
      const componentId = data.componentId || data.id;
      if (!componentId) return false;
      return store.addToolToDraft?.({ componentId }) ?? false;
    }
    // A raw Item drop creates a FIRST-CLASS item-sourced tool from the Item uuid (issue 561,
    // B1) — no component import. The tool carries its own source refs + snapshot and a null
    // componentId.
    if (!data.uuid) return false;
    return (await store.addToolFromUuidToDraft?.(data.uuid)) ?? false;
  }

  function gatheringConditionOptions(kind) {
    const setting = selectedGatheringSystemConfig.conditions?.[kind] || {};
    return Array.isArray(setting.values) ? setting.values : [];
  }

  function gatheringVocabularyOptions(kind) {
    const vocabulary = selectedGatheringSystemConfig.vocabularies?.[kind] || {};
    return Array.isArray(vocabulary.values) ? vocabulary.values : [];
  }

  function gatheringConditionModifierRows(row, kind) {
    const values = row?.conditionModifiers?.[kind];
    return Array.isArray(values) ? values : [];
  }

  function gatheringConditionAvailableOptions(row, kind) {
    const options = kind === 'biome' ? gatheringVocabularyOptions('biomes') : gatheringConditionOptions(kind);
    if (!row) return options;
    const attached = new Set(gatheringConditionModifierRows(row, kind).map(modifier => modifier.conditionId));
    return options.filter(option => !attached.has(option.id));
  }

  function gatheringConditionModifierGroups(row) {
    return {
      timeOfDay: gatheringConditionModifierRows(row, 'timeOfDay'),
      weather: gatheringConditionModifierRows(row, 'weather'),
      biome: gatheringConditionModifierRows(row, 'biome')
    };
  }

  function updateGatheringDropModifier(rowId, kind, modifierId, updates = {}) {
    if (!editingGatheringTask || !rowId || !kind || !modifierId) return;
    const row = gatheringTaskDropRows(editingGatheringTask).find(entry => entry.id === rowId);
    if (!row) return;
    const conditionModifiers = gatheringConditionModifierGroups(row);
    conditionModifiers[kind] = conditionModifiers[kind].map(modifier => modifier.id === modifierId ? { ...modifier, ...updates } : modifier);
    updateGatheringTaskDrop(rowId, { conditionModifiers });
  }

  function addGatheringDropModifier(rowId, kind, conditionId) {
    if (!editingGatheringTask || !rowId || !kind || !conditionId) return;
    const row = gatheringTaskDropRows(editingGatheringTask).find(entry => entry.id === rowId);
    if (!row) return;
    const conditionModifiers = gatheringConditionModifierGroups(row);
    if (conditionModifiers[kind].some(modifier => modifier.conditionId === conditionId)) return;
    conditionModifiers[kind] = [
      ...conditionModifiers[kind],
      { id: `${kind}-${gatheringDropRowId()}`, conditionId, operator: '+', value: 0 }
    ];
    updateGatheringTaskDrop(rowId, { conditionModifiers });
  }

  function deleteGatheringDropModifier(rowId, kind, modifierId) {
    if (!editingGatheringTask || !rowId || !kind || !modifierId) return;
    const row = gatheringTaskDropRows(editingGatheringTask).find(entry => entry.id === rowId);
    if (!row) return;
    const conditionModifiers = gatheringConditionModifierGroups(row);
    conditionModifiers[kind] = conditionModifiers[kind].filter(modifier => modifier.id !== modifierId);
    updateGatheringTaskDrop(rowId, { conditionModifiers });
  }

  function addGatheringEventConditionModifier(kind, conditionId) {
    if (!editingGatheringEvent?.id || !kind || !conditionId) return;
    const conditionModifiers = gatheringConditionModifierGroups(editingGatheringEvent);
    if (conditionModifiers[kind].some(modifier => modifier.conditionId === conditionId)) return;
    conditionModifiers[kind] = [
      ...conditionModifiers[kind],
      { id: `${kind}-${gatheringDropRowId()}`, conditionId, operator: '+', value: 0 }
    ];
    updateSelectedGatheringEvent({ conditionModifiers });
  }

  function updateGatheringEventConditionModifier(kind, modifierId, updates = {}) {
    if (!editingGatheringEvent?.id || !kind || !modifierId) return;
    const conditionModifiers = gatheringConditionModifierGroups(editingGatheringEvent);
    conditionModifiers[kind] = conditionModifiers[kind].map(modifier => modifier.id === modifierId ? { ...modifier, ...updates } : modifier);
    updateSelectedGatheringEvent({ conditionModifiers });
  }

  function deleteGatheringEventConditionModifier(kind, modifierId) {
    if (!editingGatheringEvent?.id || !kind || !modifierId) return;
    const conditionModifiers = gatheringConditionModifierGroups(editingGatheringEvent);
    conditionModifiers[kind] = conditionModifiers[kind].filter(modifier => modifier.id !== modifierId);
    updateSelectedGatheringEvent({ conditionModifiers });
  }

  function pickCharacterModifierForEvent(modifierId) {
    if (!editingGatheringEvent?.id || !modifierId) return;
    const refs = Array.isArray(editingGatheringEvent.characterModifiers) ? editingGatheringEvent.characterModifiers : [];
    if (refs.some(ref => ref.modifierId === modifierId)) return;
    characterModifierSearchTerm = '';
    const newRef = {
      id: `char-mod-${modifierId}-${refs.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
      modifierId,
      operator: '+',
      min: null,
      max: null,
      expressionOverride: ''
    };
    updateSelectedGatheringEvent({ characterModifiers: [...refs, newRef] });
  }

  function onUpdateEventCharacterModifier(refId, patch) {
    if (!editingGatheringEvent?.id || !refId) return;
    const refs = Array.isArray(editingGatheringEvent.characterModifiers) ? editingGatheringEvent.characterModifiers : [];
    const next = refs.map(ref => ref.id === refId ? { ...ref, ...patch } : ref);
    updateSelectedGatheringEvent({ characterModifiers: next });
  }

  function onDeleteEventCharacterModifier(refId) {
    if (!editingGatheringEvent?.id || !refId) return;
    const refs = Array.isArray(editingGatheringEvent.characterModifiers) ? editingGatheringEvent.characterModifiers : [];
    updateSelectedGatheringEvent({ characterModifiers: refs.filter(ref => ref.id !== refId) });
  }

  function setEventCharacterModifierOverrideEnabled(ref, enabled, libraryEntry) {
    const expressionOverride = enabled ? (libraryEntry?.expression || '') : '';
    onUpdateEventCharacterModifier(ref.id, { expressionOverride });
  }

  function moveEnvironment(environmentId = selectedEnvironment?.id, direction) {
    if (!environmentId || !direction) return;
    store.moveEnvironmentDraft?.(environmentId, direction);
  }

  function selectGatheringTab(tabId) {
    activeGatheringTab = visibleGatheringNavItems.some(tab => tab.id === tabId) ? tabId : 'environments';
    gatheringMenuExpanded = true;
  }

  function openGatheringSection(tabId = 'environments') {
    if (!canShowEnvironments) return;
    const nextTab = visibleGatheringNavItems.some(tab => tab.id === tabId) ? tabId : 'environments';
    afterTruthyResult(confirmRouteExit('environments'), () => {
      activeGatheringTab = nextTab;
      gatheringMenuExpanded = true;
      activeView = 'environments';
    });
  }

  async function saveSelectedToolDraft() {
    const toolId = $viewState.toolsDraftSelectedToolId;
    if (!toolId || !store?.saveToolDraft) return;
    await store.saveToolDraft(toolId);
  }

  function deleteSelectedLibraryTool() {
    const toolId = $viewState.toolsDraftSelectedToolId;
    if (!toolId) return;
    store?.deleteToolFromDraft?.(toolId);
  }

  function activateGatheringParent() {
    if (isActiveGatheringChildRoute) {
      gatheringMenuExpanded = true;
      return;
    }
    openGatheringSection('environments');
  }

  function toggleGatheringMenu(event) {
    event?.stopPropagation?.();
    if (isActiveGatheringChildRoute) {
      gatheringMenuExpanded = true;
      return;
    }
    gatheringMenuExpanded = !gatheringMenuExpanded;
  }

  // Crafting nav group handlers (issue 511), mirroring the gathering group. Route
  // exit runs through `confirmRouteExit` (the Manager confirm-discard guard) via
  // `setView`/`afterTruthyResult`.
  function openCraftingSection(tabId = 'recipes') {
    const item = craftingNavItems.find(tab => tab.id === tabId) || craftingNavItems[0];
    const nextView = item?.view || 'recipes';
    afterTruthyResult(confirmRouteExit(nextView), () => {
      activeView = nextView;
      craftingMenuExpanded = true;
    });
  }

  function activateCraftingParent() {
    if (isCraftingRoute) {
      craftingMenuExpanded = true;
      return;
    }
    openCraftingSection('recipes');
  }

  // ---- Books & Scrolls surface handlers (issue 511, PR-B redesign) ----------
  // Select a recipe item row (opens the ItemPageInspector aside).
  function selectRecipeItem(recipeItemId) {
    selectedRecipeItemId = recipeItemId;
  }

  // The ItemPageInspector quick-limit toggle emits a boolean; turn it into the
  // right caps patch for the active visibility mode (live-apply, no draft). Item
  // mode caps uses; every other mode caps learning.
  function toggleRecipeItemQuickLimit(recipeItemId, limited) {
    const patch = craftingVisibilityMode === 'item'
      ? { item: { limitUses: limited === true, maxUses: 1 } }
      : { learn: { limitLearning: limited === true, learnScope: 'perInstance', learnsAllowed: 1 } };
    store.updateRecipeItemCaps?.(recipeItemId, patch);
  }

  // Deep PLAIN clone for the recipe-item draft + baseline. Mirrors the recipe
  // draft helpers: JSON round-trip strips reactivity and shared references so the
  // dirty comparison and discard-revert are stable.
  function cloneRecipeItemDraft(source) {
    return source ? JSON.parse(JSON.stringify(source)) : null;
  }

  // Recursively deep-merge a partial patch into the recipe-item draft. The editor
  // emits nested caps patches (`{ caps: { item|learn: {...} } }`), so a shallow
  // spread would clobber sibling cap fields; merge object values, replace scalars.
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

  // Open the full-window recipe-item editor for a definition (recipe-item-edit
  // route). Seeds both draft and baseline from the persisted projection and loads
  // the world-item options so the Overview tab's item picker has candidates.
  function editRecipeItem(recipeItemId) {
    afterTruthyResult(confirmRouteExit('recipe-item-edit'), () => {
      selectedRecipeItemId = recipeItemId;
      recipeItemEditSaving = false;
      recipeItemSaveFailed = false;
      recipeItemActiveTab = 'overview';
      const source = (recipeItemDefinitions || []).find((def) => def.id === recipeItemId) || null;
      recipeItemDraft = cloneRecipeItemDraft(source);
      recipeItemDraftBaseline = cloneRecipeItemDraft(source);
      activeView = 'recipe-item-edit';
      craftingMenuExpanded = true;
      Promise.resolve(services?.getWorldItemOptions?.()).then((options) => {
        worldItemOptions = options || [];
      });
    });
  }

  function clearRecipeItemDraft() {
    recipeItemDraft = null;
    recipeItemDraftBaseline = null;
    recipeItemSaveFailed = false;
  }

  // Commit the staged recipe-item draft in a single updateRecipeItemDefinition
  // call (via the store's saveRecipeItem wrapper). On success the baseline advances
  // (clearing dirty) and we return to Books & Scrolls; on failure we surface a flag.
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
    } catch (err) {
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
  function linkRecipeItemSource(uuid) {
    patchRecipeItemDraft({ originItemUuid: uuid || null });
  }

  function unlinkRecipeItemSource() {
    patchRecipeItemDraft({ originItemUuid: null });
  }

  // Add / remove a recipe on the edited book. Membership lives on the book, so these
  // STAGE into the recipe-item draft's `recipeIds` (persisted on Save, reverted on
  // Discard) rather than editing the recipe directly — no "Recipe updated" toast.
  function linkRecipeToItem(recipeId) {
    if (!recipeItemDraft?.id || !recipeId) return;
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

  // Create a new recipe item: open the world-item picker, add the picked item as a
  // definition, then open its editor. Live side effect + navigation.
  async function createRecipeItem() {
    worldItemOptions = (await services?.getWorldItemOptions?.()) || [];
    itemPickerOpen = true;
  }

  async function pickRecipeItemFromUuid(uuid) {
    itemPickerOpen = false;
    if (!uuid) return;
    const created = await store.addRecipeItemFromUuid?.(selectedSystemId, uuid);
    const newId = typeof created === 'string' ? created : created?.item?.id || created?.id;
    if (newId) editRecipeItem(newId);
  }

  function toggleCraftingMenu(event) {
    event?.stopPropagation?.();
    if (isCraftingRoute) {
      craftingMenuExpanded = true;
      return;
    }
    craftingMenuExpanded = !craftingMenuExpanded;
  }

  function environmentListIndex(environmentId) {
    return environmentList.findIndex(environment => environment.id === environmentId);
  }

  function canMoveEnvironmentUp(environmentId) {
    return environmentListIndex(environmentId) > 0;
  }

  function canMoveEnvironmentDown(environmentId) {
    const index = environmentListIndex(environmentId);
    return index >= 0 && index < environmentList.length - 1;
  }

  function copyComponentSource(uuid = selectedComponent?.registeredItemUuidDisplay) {
    if (!uuid) return;
    services?.onCopySourceUuid?.(uuid);
  }

  function selectedEssenceSourceUuid() {
    if (!selectedEssenceForInspector?.associatedItem) return '';
    return selectedEssenceForInspector.sourceItemUuid || selectedEssenceForInspector.associatedItem.originItemUuid || '';
  }

  function copySelectedEssenceSource() {
    const uuid = selectedEssenceSourceUuid();
    if (!uuid) return;
    services?.onCopySourceUuid?.(uuid);
  }

  function componentImage(item) {
    return item?.img || 'icons/svg/item-bag.svg';
  }

  const INSPECTOR_DESCRIPTION_LIMIT = 160;

  function truncateDescription(description) {
    if (typeof description !== 'string') return '';
    const trimmed = description.trim();
    if (trimmed.length <= INSPECTOR_DESCRIPTION_LIMIT) return trimmed;
    return `${trimmed.slice(0, INSPECTOR_DESCRIPTION_LIMIT).trimEnd()}…`;
  }

  function environmentName(environment) {
    const explicitName = typeof environment?.name === 'string' ? environment.name.trim() : '';
    if (explicitName) return explicitName;
    return text('FABRICATE.Admin.Environments.NewDraftTitle', 'New Gathering Environment');
  }

  function environmentSceneImage(environment) {
    const linkedScene = linkedSceneForEnvironment(environment);
    return linkedScene?.img || linkedScene?.thumbnail || linkedScene?.thumb || '';
  }

  function environmentImage(environment) {
    // A linked scene's thumbnail takes the place of the environment's own image; the stored
    // `img` is kept as a fallback for when the scene is unlinked.
    const sceneImage = environmentSceneImage(environment);
    if (sceneImage) return sceneImage;
    return String(environment?.img || '').trim() || DEFAULT_GATHERING_ENVIRONMENT_IMG;
  }

  function hasEnvironmentImage(environment) {
    return Boolean(environmentSceneImage(environment) || String(environment?.img || '').trim());
  }

  function linkedSceneForEnvironment(environment) {
    const sceneUuid = environment?.sceneUuid || '';
    if (!sceneUuid) return null;
    return (selectedSystem?.sceneOptions || []).find(scene => scene.uuid === sceneUuid) || null;
  }

  function environmentSelectionModeLabel(environment) {
    return environment?.selectionMode === 'blind'
      ? text('FABRICATE.Admin.Environments.SelectionBlind', 'Blind')
      : text('FABRICATE.Admin.Environments.SelectionTargeted', 'Targeted');
  }

  function environmentStatusLabel(environment) {
    return environment?.enabled === false
      ? text('FABRICATE.Admin.Manager.StatusDisabled', 'Disabled')
      : text('FABRICATE.Admin.Manager.StatusActive', 'Active');
  }

  function environmentSceneState(environment) {
    if (!environment?.sceneUuid) {
      return {
        id: 'none',
        label: text('FABRICATE.Admin.Manager.Environment.SceneNone', 'No scene'),
        className: 'is-disabled'
      };
    }
    const scene = linkedSceneForEnvironment(environment);
    if (!scene) {
      return {
        id: 'missing',
        label: text('FABRICATE.Admin.Manager.Environment.SceneMissing', 'Scene unresolved'),
        className: 'is-warning'
      };
    }
    return {
      id: 'linked',
      label: text('FABRICATE.Admin.Manager.Environment.SceneLinked', 'Linked scene'),
      name: scene.name || environment.sceneUuid,
      className: 'is-active'
    };
  }

  function environmentComposedIds(environment, kind) {
    const enabledKey = kind === 'event' ? 'enabledEventIds' : 'enabledTaskIds';
    const forcedKey = kind === 'event' ? 'forcedEventIds' : 'forcedTaskIds';
    const disabledKey = kind === 'event' ? 'disabledEventIds' : 'disabledTaskIds';
    const enabled = Array.isArray(environment?.[enabledKey]) ? environment[enabledKey] : [];
    const forced = Array.isArray(environment?.[forcedKey]) ? environment[forcedKey] : [];
    const disabled = new Set(Array.isArray(environment?.[disabledKey]) ? environment[disabledKey] : []);
    return Array.from(new Set([...enabled, ...forced])).filter(id => !disabled.has(id));
  }

  function environmentComposedTaskCount(environment) {
    const stored = $viewState.environmentTaskCounts?.[String(environment?.id || '')]?.availableTaskCount;
    return Number.isFinite(stored) ? stored : environmentComposedIds(environment, 'task').length;
  }

  function environmentComposedEventCount(environment) {
    const stored = $viewState.environmentTaskCounts?.[String(environment?.id || '')]?.availableEventCount;
    return Number.isFinite(stored) ? stored : environmentComposedIds(environment, 'event').length;
  }

  function environmentRequiredToolCount(environment) {
    const taskIds = new Set(environmentComposedIds(environment, 'task'));
    if (taskIds.size === 0) return 0;
    const toolIds = new Set();
    for (const task of gatheringTaskDefinitions) {
      if (!taskIds.has(task?.id)) continue;
      const refs = Array.isArray(task?.toolIds) ? task.toolIds : [];
      for (const ref of refs) {
        const str = String(ref || '').trim();
        if (str) toolIds.add(str);
      }
    }
    return toolIds.size;
  }

  function gatheringTaskName(task) {
    return String(task?.name || text('FABRICATE.Admin.Manager.Environment.Tasks.UnnamedTask', 'Unnamed gathering task')).trim();
  }

  function gatheringTaskImage(task) {
    return task?.img || DEFAULT_GATHERING_TASK_IMG;
  }

  function gatheringTaskDropRows(task) {
    return Array.isArray(task?.dropRows) ? task.dropRows : [];
  }

  function gatheringManagedItemLabel(componentId) {
    const item = (selectedSystem?.managedItemOptions || []).find(option => String(option.id || '') === String(componentId || ''));
    return item?.name || componentId || '';
  }

  function gatheringManagedItemImage(componentId) {
    const item = (selectedSystem?.managedItemOptions || []).find(option => String(option.id || '') === String(componentId || ''));
    return item?.img || 'icons/svg/item-bag.svg';
  }

  function gatheringDropName(row) {
    return row?.name || gatheringManagedItemLabel(row?.componentId) || row?.itemUuid || text('FABRICATE.Admin.Manager.Environment.Tasks.UnresolvedDrop', 'Unresolved drop');
  }

  function gatheringDropImage(row) {
    return row?.img || gatheringManagedItemImage(row?.componentId) || 'icons/svg/item-bag.svg';
  }

  function gatheringTaskDropLabel(row) {
    const name = gatheringDropName(row);
    return `${name} x${row?.quantity || 1} (${row?.dropRate ?? 1}%)`;
  }

  function gatheringOptionLabel(kind, id) {
    const options = selectedGatheringSystemConfig.vocabularies?.biomes?.values;
    const option = (Array.isArray(options) ? options : []).find(value => String(value?.id || value) === String(id || ''));
    return String(option?.label || option?.id || id || '').trim();
  }

  function gatheringConditionLabel(kind, id) {
    if (kind === 'biome') return gatheringOptionLabel('biome', id) || String(id || '');
    const setting = selectedGatheringSystemConfig.conditions?.[kind] || {};
    const option = (Array.isArray(setting.values) ? setting.values : [])
      .find(value => String(value?.id || value) === String(id || ''));
    return String(option?.label || option?.id || id || '').trim();
  }

  function gatheringModifierKindIcon(kind, conditionId = '') {
    if (kind === 'weather') return 'fas fa-cloud-sun';
    if (kind === 'timeOfDay') return 'fas fa-clock';
    const option = gatheringVocabularyOptions('biomes').find(value => String(value?.id || value) === String(conditionId || ''));
    return String(option?.icon || '').trim() || 'fas fa-mountain-sun';
  }

  function gatheringModifierCardTitle(kind, scope = 'task') {
    if (kind === 'biome') {
      return scope === 'event'
        ? text('FABRICATE.Admin.Manager.Environment.Events.BiomeModifiers', 'Biome modifiers')
        : text('FABRICATE.Admin.Manager.Environment.Tasks.BiomeModifiers', 'Biome modifiers');
    }
    if (kind === 'weather') return text('FABRICATE.Admin.Manager.Environment.Tasks.WeatherModifiers', 'Weather modifiers');
    return text('FABRICATE.Admin.Manager.Environment.Tasks.TimeModifiers', 'Time modifiers');
  }

  function gatheringModifierCardHint(kind, scope = 'task') {
    if (scope === 'event') {
      if (kind === 'biome') return text('FABRICATE.Admin.Manager.Environment.Events.BiomeModifiersHint', "Adjust this event's chance based on the gathering environment's biomes.");
      if (kind === 'weather') return text('FABRICATE.Admin.Manager.Environment.Events.WeatherModifiersHint', "Adjust this event's chance based on the active weather condition.");
      return text('FABRICATE.Admin.Manager.Environment.Events.TimeModifiersHint', "Adjust this event's chance based on the active time of day.");
    }
    if (kind === 'biome') return text('FABRICATE.Admin.Manager.Environment.Tasks.BiomeModifiersHint', "Adjust this drop's chance based on the gathering environment's biomes.");
    if (kind === 'weather') return text('FABRICATE.Admin.Manager.Environment.Tasks.WeatherModifiersHint', "Adjust this drop's chance based on the active weather condition.");
    return text('FABRICATE.Admin.Manager.Environment.Tasks.TimeModifiersHint', "Adjust this drop's chance based on the active time of day.");
  }

  function gatheringDropRateValue(row) {
    const number = Math.trunc(Number(row?.dropRate ?? 1));
    if (!Number.isFinite(number)) return 1;
    return Math.min(100, Math.max(0, number));
  }

  function gatheringDropCountValue(row) {
    const number = Math.trunc(Number(row?.quantity ?? 1));
    if (!Number.isFinite(number)) return 1;
    return Math.min(999, Math.max(1, number));
  }

  function gatheringDropRateTierClass(value) {
    const rate = gatheringDropRateValue({ dropRate: value });
    if (rate === 0) return 'is-none';
    if (rate >= 100) return 'is-guaranteed';
    if (rate >= 70) return 'is-common';
    if (rate >= 35) return 'is-uncommon';
    if (rate >= 15) return 'is-rare';
    if (rate >= 5) return 'is-very-rare';
    return 'is-legendary';
  }

  function gatheringDropRateTierColor(value) {
    const rate = gatheringDropRateValue({ dropRate: value });
    if (rate === 0) return 'var(--fab-drop-rate-none)';
    if (rate >= 100) return 'var(--fab-drop-rate-guaranteed)';
    if (rate >= 70) return 'var(--fab-drop-rate-common)';
    if (rate >= 35) return 'var(--fab-drop-rate-uncommon)';
    if (rate >= 15) return 'var(--fab-drop-rate-rare)';
    if (rate >= 5) return 'var(--fab-drop-rate-very-rare)';
    return 'var(--fab-drop-rate-legendary)';
  }

  function onGatheringDropRateInput(rowId, event) {
    const input = event.currentTarget;
    const normalized = String(input.value || '').replace(/\D+/g, '').replace(/^0+(?=\d)/, '');
    input.value = normalized;
    const dropRate = Number(normalized);
    if (normalized !== '' && Number.isInteger(dropRate) && dropRate >= 0 && dropRate <= 100) {
      updateGatheringTaskDrop(rowId, { dropRate });
    }
  }

  function onGatheringDropRateBlur(row, event) {
    const input = event.currentTarget;
    const normalized = String(input.value || '').replace(/\D+/g, '').replace(/^0+(?=\d)/, '');
    const dropRate = Number(normalized);
    if (normalized !== '' && Number.isInteger(dropRate) && dropRate >= 0 && dropRate <= 100) {
      input.value = String(dropRate);
      updateGatheringTaskDrop(row.id, { dropRate });
      return;
    }
    input.value = String(gatheringDropRateValue(row));
  }

  function onGatheringDropRateKeydown(row, event) {
    event.stopPropagation();
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const currentValue = event.currentTarget.value === '' ? gatheringDropRateValue(row) : Number(event.currentTarget.value);
    const dropRate = gatheringDropRateValue({ dropRate: (Number.isFinite(currentValue) ? currentValue : gatheringDropRateValue(row)) + (event.key === 'ArrowUp' ? 1 : -1) });
    event.currentTarget.value = String(dropRate);
    updateGatheringTaskDrop(row.id, { dropRate });
  }

  function onGatheringDropCountInput(rowId, event) {
    const input = event.currentTarget;
    const normalized = String(input.value || '').replace(/\D+/g, '').replace(/^0+/, '');
    input.value = normalized;
    const quantity = Number(normalized);
    if (Number.isInteger(quantity) && quantity >= 1 && quantity <= 999) updateGatheringTaskDrop(rowId, { quantity });
  }

  function onGatheringDropCountBlur(row, event) {
    const input = event.currentTarget;
    const normalized = String(input.value || '').replace(/\D+/g, '').replace(/^0+/, '');
    const quantity = Number(normalized);
    if (normalized !== '' && Number.isInteger(quantity) && quantity >= 1 && quantity <= 999) {
      input.value = String(quantity);
      updateGatheringTaskDrop(row.id, { quantity });
      return;
    }
    input.value = String(gatheringDropCountValue(row));
  }

  function onGatheringDropCountKeydown(row, event) {
    event.stopPropagation();
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const currentValue = event.currentTarget.value === '' ? gatheringDropCountValue(row) : Number(event.currentTarget.value);
    const quantity = gatheringDropCountValue({ quantity: (Number.isFinite(currentValue) ? currentValue : gatheringDropCountValue(row)) + (event.key === 'ArrowUp' ? 1 : -1) });
    event.currentTarget.value = String(quantity);
    updateGatheringTaskDrop(row.id, { quantity });
  }

  function gatheringTaskAvailability(task) {
    const timeValues = Array.isArray(task?.timeOfDay) ? task.timeOfDay : [];
    const weatherValues = Array.isArray(task?.weather) ? task.weather : [];
    const times = timeValues.length > 0
      ? timeValues.map(id => gatheringConditionLabel('timeOfDay', id)).filter(Boolean).join(', ')
      : text('FABRICATE.Admin.Manager.Environment.Tasks.AnyTime', 'Any time');
    const weather = weatherValues.length > 0
      ? weatherValues.map(id => gatheringConditionLabel('weather', id)).filter(Boolean).join(', ')
      : text('FABRICATE.Admin.Manager.Environment.Tasks.AnyWeather', 'Any weather');
    return `${times}, ${weather}`;
  }

  function gatheringTaskAllowedInEnvironment(task, environment) {
    const enabledIds = Array.isArray(environment?.enabledTaskIds) ? environment.enabledTaskIds.map(String) : [];
    const disabledIds = Array.isArray(environment?.disabledTaskIds) ? environment.disabledTaskIds.map(String) : [];
    if (disabledIds.includes(String(task?.id))) return false;
    if (enabledIds.length > 0 && !enabledIds.includes(String(task?.id))) return false;
    return true;
  }

  const DANGER_LEVEL_ORDER = ['safe', 'unsafe', 'hazardous', 'dangerous', 'deadly', 'extreme'];

  function sortedDangerTags(tags) {
    if (!Array.isArray(tags)) return [];
    return [...tags].sort((a, b) => {
      const ai = DANGER_LEVEL_ORDER.indexOf(a);
      const bi = DANGER_LEVEL_ORDER.indexOf(b);
      const aRank = ai === -1 ? DANGER_LEVEL_ORDER.length : ai;
      const bRank = bi === -1 ? DANGER_LEVEL_ORDER.length : bi;
      if (aRank !== bRank) return aRank - bRank;
      return String(a).localeCompare(String(b));
    });
  }

  function gatheringTaskReferencingEnvironments(task) {
    if (!task?.id) return [];
    const taskId = String(task.id);
    return environmentList.filter(environment => {
      if (String(environment?.craftingSystemId || '') !== String(selectedSystemId || '')) return false;
      const enabledIds = Array.isArray(environment?.enabledTaskIds) ? environment.enabledTaskIds.map(String) : [];
      return enabledIds.includes(taskId);
    });
  }

  function gatheringEventReferencingEnvironments(event) {
    if (!event?.id) return [];
    const eventId = String(event.id);
    return environmentList.filter(environment => {
      if (String(environment?.craftingSystemId || '') !== String(selectedSystemId || '')) return false;
      const enabledIds = Array.isArray(environment?.enabledEventIds) ? environment.enabledEventIds.map(String) : [];
      return enabledIds.includes(eventId);
    });
  }

  function activeGatheringTaskEnvironmentCount(task) {
    if (!task || task.enabled === false) return 0;
    const weatherSetting = selectedGatheringSystemConfig.conditions?.weather || {};
    const timeSetting = selectedGatheringSystemConfig.conditions?.timeOfDay || {};
    const taskBiomes = Array.isArray(task.biomes) ? task.biomes : [];
    const taskWeather = Array.isArray(task.weather) ? task.weather : [];
    const taskTime = Array.isArray(task.timeOfDay) ? task.timeOfDay : [];
    return environmentList.filter(environment => {
      if (environment?.enabled === false) return false;
      if (String(environment?.craftingSystemId || selectedSystemId) !== String(selectedSystemId || '')) return false;
      if (!gatheringTaskAllowedInEnvironment(task, environment)) return false;
      const environmentBiomes = Array.isArray(environment?.biomes)
        ? environment.biomes
        : (environment?.biome ? [environment.biome] : []);
      if (taskBiomes.length > 0 && !taskBiomes.some(biome => environmentBiomes.includes(biome))) return false;
      if (weatherSetting.enabled !== false && taskWeather.length > 0 && !taskWeather.includes(weatherSetting.current)) return false;
      if (timeSetting.enabled !== false && taskTime.length > 0 && !taskTime.includes(timeSetting.current)) return false;
      return true;
    }).length;
  }

  function environmentFacts(environment) {
    if (!environment) return [];
    return [
      {
        id: 'tasks',
        label: text('FABRICATE.Admin.Environments.Tasks', 'Tasks'),
        value: environmentComposedTaskCount(environment)
      },
      {
        id: 'events',
        label: text('FABRICATE.Admin.Environments.Events', 'Events'),
        value: environmentComposedEventCount(environment)
      },
      {
        id: 'required-tools',
        label: text('FABRICATE.Admin.Environments.RequiredTools', 'Required tools'),
        value: environmentRequiredToolCount(environment)
      },
      {
        id: 'mode',
        label: text('FABRICATE.Admin.Environments.SelectionMode', 'Selection mode'),
        value: environmentSelectionModeLabel(environment)
      }
    ];
  }

  function environmentDirtyFor(environment) {
    return environment?.id && $viewState.environmentDraft?.id === environment.id && $viewState.environmentDraftDirty === true;
  }

  function environmentInvalidFor(environment) {
    return environment?.id && $viewState.environmentDraft?.id === environment.id && environmentValidationCount > 0;
  }

  function environmentDisplay(environment) {
    if (!environment) return null;
    if (shouldUseEnvironmentDraftForDisplay && environmentDraftForDisplay?.id === environment.id) {
      return environmentDraftForDisplay;
    }
    return environment;
  }

  // `componentSourceState` lived here to tone the inline components inspector's source
  // chip. That inspector is now `ComponentBrowserInspector` (issue 676), which derives
  // its own linked badge, and the browser row derives its origin pill in
  // `ComponentsBrowserView` — so the helper had no callers left.

  function componentEvidenceItems(item) {
    const evidence = [];
    if (!item) return evidence;
    if (Object.prototype.hasOwnProperty.call(item, 'difficulty')) {
      evidence.push({
        id: 'difficulty',
        label: text('FABRICATE.Admin.Manager.Component.ProgressiveDifficulty', 'Progressive difficulty'),
        value: item.difficulty
      });
    }
    if (item.salvageSummary) {
      evidence.push({
        id: 'salvage',
        label: text('FABRICATE.Admin.Manager.Component.Salvage', 'Salvage'),
        value: salvageSummaryLabel(item.salvageSummary)
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
      salvage: text('FABRICATE.Admin.Manager.Component.UsageSalvage', 'Salvage usage')
    };
    return Object.entries(item.usageCounts)
      .filter(([, count]) => Number.isFinite(Number(count)))
      .map(([key, count]) => ({
        id: `usage-${key}`,
        label: labels[key] || key,
        value: Number(count)
      }));
  }

  function salvageSummaryLabel(summary) {
    const parts = [
      text('FABRICATE.Admin.Manager.Component.SalvageQuantity', '{count} required')
        .replace('{count}', summary.quantityRequired ?? 1)
    ];
    if (summary.toolCount > 0) parts.push(text('FABRICATE.Admin.Manager.Component.SalvageTools', '{count} tools').replace('{count}', summary.toolCount));
    if (summary.resultGroupCount > 0) parts.push(text('FABRICATE.Admin.Manager.Component.SalvageResults', '{count} result groups').replace('{count}', summary.resultGroupCount));
    if (summary.outcomeCount > 0) parts.push(text('FABRICATE.Admin.Manager.Component.SalvageOutcomes', '{count} outcomes').replace('{count}', summary.outcomeCount));
    if (summary.hasTimeRequirement) parts.push(text('FABRICATE.Admin.Manager.Component.SalvageTime', 'time'));
    if (summary.hasCurrencyRequirement) parts.push(text('FABRICATE.Admin.Manager.Component.SalvageCost', 'cost'));
    return parts.join(', ');
  }

  function stackedLabel(key, fallback) {
    return `${text(key, fallback)}:`;
  }

  function normalizeVocabularyKey(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized || 'general';
  }

  // Reference counting delegates to the pure `buildVocabularyUsage` helper (issue
  // 689), which — unlike the pre-689 inline count — also credits a tag for every
  // recipe tag-placeholder ingredient (`match.type === 'tags'`) that names it, so a
  // tag only ever used as an ingredient filter no longer reads as "Unused".
  function buildTagCategoryUsage(system, recipes, items) {
    return buildVocabularyUsage(recipes, items);
  }

  function buildCategoryRows(categories, usage, icons) {
    const generalName = text('FABRICATE.Admin.Manager.Recipe.General', 'General');
    const customRows = uniqueSorted(categories || []).map(category => {
      const key = normalizeVocabularyKey(category);
      const recipeUsageCount = usage.get(key) || 0;
      return {
        id: key,
        kind: 'category',
        name: category,
        icon: categoryIconFor(icons, category),
        recipeUsageCount,
        totalUsage: recipeUsageCount,
        locked: false
      };
    });
    return [
      {
        id: 'general',
        kind: 'category',
        name: generalName,
        icon: categoryIconFor(icons, 'general'),
        recipeUsageCount: usage.get('general') || 0,
        totalUsage: usage.get('general') || 0,
        locked: true
      },
      ...customRows
    ];
  }

  // Component-category rows (issue 676). Shaped exactly like buildCategoryRows so the
  // Tags & Categories screen can render both sections through one row component, but
  // fed from its own vocabulary and its own usage map. `kind` distinguishes them for
  // the removal-confirmation copy.
  function buildComponentCategoryRows(categories, usage, icons) {
    const generalName = text('FABRICATE.Common.General', 'General');
    const customRows = uniqueSorted(categories || []).map(category => {
      const key = normalizeVocabularyKey(category);
      const componentUsageCount = usage.get(key) || 0;
      return {
        id: key,
        kind: 'component-category',
        name: category,
        icon: categoryIconFor(icons, category),
        componentUsageCount,
        totalUsage: componentUsageCount,
        locked: false
      };
    });
    return [
      {
        id: 'general',
        kind: 'component-category',
        name: generalName,
        icon: categoryIconFor(icons, 'general'),
        componentUsageCount: usage.get('general') || 0,
        totalUsage: usage.get('general') || 0,
        locked: true
      },
      ...customRows
    ];
  }

  function buildTagRows(tags, usage) {
    return uniqueSorted(tags || []).map(tag => {
      const key = normalizeVocabularyKey(tag);
      const componentUsageCount = usage.get(key) || 0;
      return {
        id: key,
        kind: 'tag',
        name: tag,
        componentUsageCount,
        totalUsage: componentUsageCount
      };
    });
  }

  function countLabelParts(label) {
    const normalized = String(label ?? '').trim().replace(/\s+/g, ' ');
    const firstSpace = normalized.indexOf(' ');
    if (firstSpace === -1) return { lead: normalized, rest: '' };
    return {
      lead: normalized.slice(0, firstSpace),
      rest: normalized.slice(firstSpace + 1)
    };
  }

</script>

<div class="fabricate-manager" data-manager-view={currentView}>
  <!--
    The manager titlebar: a thin, always-present identity strip above the header.
    It answers "which crafting system am I editing, and how does it resolve?" from
    every screen, so the gold badge carries the SELECTED SYSTEM's name (user-authored
    text — hence max-width + ellipsis + title) and never a theme or product name.
  -->
  <div class="manager-titlebar" data-manager-titlebar aria-label={text('FABRICATE.Admin.Manager.Titlebar.Label', 'Crafting manager')}>
    <!--
      The layer-group icon and "Crafting Systems" product label used to lead this
      strip, but the Foundry window's own title bar already names the app — a second
      copy inside the window was duplicated chrome (issue 643). The gold SYSTEM badge
      is now the left-most element, and the resolution status stays right-aligned.
    -->
    {#if selectedSystem}
      <span
        class="manager-titlebar-badge"
        data-manager-titlebar-system
        title={selectedSystem.name}
        aria-label={text('FABRICATE.Admin.Manager.Titlebar.SystemBadge', 'Selected crafting system')}
      >{selectedSystem.name}</span>
      <span
        class="manager-titlebar-status"
        data-manager-titlebar-status
        title={titlebarStatusLabel()}
        aria-label={text('FABRICATE.Admin.Manager.Titlebar.Status', 'Selected system resolution')}
      >
        <i class="fas fa-dice-d20 manager-titlebar-status-icon" aria-hidden="true"></i>
        <span class="manager-titlebar-status-text">{titlebarStatusLabel()}</span>
      </span>
    {/if}
  </div>

  <header class="manager-header">
    <div class="manager-heading">
      <nav class="manager-breadcrumbs" aria-label={text('FABRICATE.Admin.Manager.Breadcrumbs', 'Breadcrumbs')}>
        <button type="button" onclick={() => selectSystemAndShowBrowser()}>{text('FABRICATE.Admin.Manager.Nav.Systems', 'Crafting Systems')}</button>
        {#if selectedSystem && currentView !== 'systems'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={() => editSystem(selectedSystem.id)}>{selectedSystem.name}</button>
        {/if}
        {#if currentView === 'recipes'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={() => openCraftingSection('recipes')}>{text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting')}</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Nav.Recipes', 'Recipes')}</span>
        {/if}
        {#if currentView === 'crafting-settings'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={() => openCraftingSection('recipes')}>{text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting')}</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Crafting.CraftingTabs.Settings', 'Settings')}</span>
        {/if}
        {#if currentView === 'access'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={() => openCraftingSection('recipes')}>{text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting')}</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Nav.Access', 'Access')}</span>
        {/if}
        {#if currentView === 'books-scrolls'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={() => openCraftingSection('recipes')}>{text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting')}</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Nav.BooksScrolls', 'Books & Scrolls')}</span>
        {/if}
        {#if currentView === 'recipe-item-edit'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={() => openCraftingSection('recipes')}>{text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting')}</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={backToBooksScrolls}>{text('FABRICATE.Admin.Manager.Nav.BooksScrolls', 'Books & Scrolls')}</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.RecipeItem.EditBreadcrumb', 'Edit recipe item')}</span>
        {/if}
        {#if currentView === 'components'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Nav.Components', 'Components')}</span>
        {/if}
        {#if currentView === 'tags'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Nav.TagsCategories', 'Tags & Categories')}</span>
        {/if}
        {#if currentView === 'essences'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Nav.Essences', 'Essences')}</span>
        {/if}
        {#if currentView === 'essence-edit'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={backToEssencesBrowse}>{text('FABRICATE.Admin.Manager.Nav.Essences', 'Essences')}</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{isCreatingEssenceDraft
            ? text('FABRICATE.Admin.Manager.Essence.CreateBreadcrumb', 'Create essence')
            : text('FABRICATE.Admin.Manager.Essence.EditBreadcrumb', 'Edit essence')}</span>
        {/if}
        {#if currentView === 'recipe-edit'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={() => openCraftingSection('recipes')}>{text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting')}</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={backToRecipesBrowse}>{text('FABRICATE.Admin.Manager.Nav.Recipes', 'Recipes')}</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <!-- Name the recipe (§F5), not the generic "Edit recipe". -->
          <span>{recipeDraft?.name || text('FABRICATE.Admin.Manager.Recipe.EditBreadcrumb', 'Edit recipe')}</span>
        {/if}
        {#if currentView === 'component-edit'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={backToComponentsBrowse}>{text('FABRICATE.Admin.Manager.Nav.Components', 'Components')}</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <!-- Name the component, not the generic "Edit component" — the same rule the
               recipe breadcrumb follows. -->
          <span>{componentForEdit?.name || text('FABRICATE.Admin.Manager.Component.EditBreadcrumb', 'Edit component')}</span>
        {/if}
        {#if currentView === 'environments'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Nav.Environments', 'Gathering')}</span>
        {/if}
        {#if currentView === 'environment-edit'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={backToEnvironmentsBrowse}>{text('FABRICATE.Admin.Manager.Nav.Environments', 'Gathering')}</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.EditBreadcrumb', 'Edit environment')}</span>
        {/if}
        {#if currentView === 'gathering-task-edit'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={backToGatheringTaskLibrary}>{text('FABRICATE.Admin.Manager.Environment.GatheringTabs.Tasks', 'Tasks')}</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.EditBreadcrumb', 'Edit gathering task')}</span>
        {/if}
        {#if currentView === 'gathering-event-edit'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={backToGatheringEventLibrary}>{text('FABRICATE.Admin.Manager.Environment.GatheringTabs.Encounters', 'Events')}</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Events.EditBreadcrumb', 'Edit gathering event')}</span>
        {/if}
        {#if currentView === 'tools'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Nav.Tools', 'Tools')}</span>
        {/if}
        {#if currentView === 'checks'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Nav.Checks', 'Checks')}</span>
        {/if}
        {#if currentView === 'system-edit'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.SystemEdit.PageBreadcrumb', 'System Overview')}</span>
        {/if}
      </nav>
      {#if currentView === 'recipe-edit' && recipeDraft}
        <!-- The recipe editor's identity header: the recipe's real image (never a
             glyph-only avatar — a recipe HAS an img), its name, and the
             "<category> · <resolution mode>" subline. -->
        <div class="manager-recipe-edit-heading" data-recipe-edit-heading>
          <Medallion src={resolveRecipeImage(recipeDraft)} icon="fas fa-scroll" size={44} />
          <div class="manager-recipe-edit-heading-copy">
            <h1 class="manager-title" title={recipeDraft.name || ''}>{recipeDraft.name || viewTitle()}</h1>
            <p class="manager-subtitle" data-recipe-edit-subline>{viewSubtitle()}</p>
          </div>
        </div>
      {:else if currentView === 'component-edit' && componentForEdit}
        <!-- The component editor's identity header (issue 676, decision 4 — it must match
             the recipe editor's exactly, and was never implemented: this route fell
             through to the generic static "Edit component" heading below). The linked
             item's real image, its NAME, and the "<category> · Linked <source>" subline.
             It reuses the recipe heading's classes wholesale — same shape, same CSS. -->
        <div class="manager-recipe-edit-heading" data-component-edit-heading>
          <Medallion src={componentForEdit.img} icon="fas fa-cube" size={44} />
          <div class="manager-recipe-edit-heading-copy">
            <h1 class="manager-title" title={componentForEdit.name || ''}>{componentForEdit.name || viewTitle()}</h1>
            <p class="manager-subtitle" data-component-edit-subline>{viewSubtitle()}</p>
          </div>
        </div>
      {:else}
        <h1 class="manager-title">{viewTitle()}</h1>
        <p class="manager-subtitle">{viewSubtitle()}</p>
      {/if}
      {#if currentView === 'environment-edit' && environmentDraftForDisplay}
        <div class="manager-environment-header-pills" data-environment-status-pills>
          <span class={`manager-chip ${environmentDraftForDisplay.enabled === false ? 'is-neutral' : 'is-active'}`} data-status-pill="active">
            {environmentDraftForDisplay.enabled === false ? text('FABRICATE.Admin.Manager.StatusOff', 'Off') : text('FABRICATE.Admin.Manager.StatusOn', 'On')}
          </span>
          <span class="manager-chip is-info" data-status-pill="selection">
            {environmentDraftForDisplay.selectionMode === 'blind' ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Blind', 'Blind') : text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Targeted', 'Targeted')}
          </span>
          <span class="manager-chip is-info" data-status-pill="composition">
            {environmentDraftForDisplay.compositionMode === 'manual' ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Manual', 'Manual') : text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Automatic', 'Automatic')}
          </span>
        </div>
      {/if}
    </div>
    {#if currentView !== 'tools'}
    <div class="manager-header-actions" aria-label={headerActionsLabel()}>
      {#if currentView === 'recipes'}
        <button type="button" class="manager-button is-primary" onclick={createRecipe} disabled={!selectedSystemId}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Recipe.Create', 'Create recipe')}</span>
        </button>
      {:else if currentView === 'recipe-edit'}
        {#if recipeEditDirty}
          <span class="manager-chip is-warning">{text('FABRICATE.Admin.Manager.Recipe.Dirty', 'Unsaved')}</span>
        {/if}
        <button type="button" class="manager-button is-ghost" onclick={backToRecipesBrowse} disabled={recipeEditSaving}>
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Recipe.BackToBrowse', 'Back to recipes')}</span>
        </button>
        <button type="button" class="manager-button is-danger" onclick={deleteRecipeFromEdit} disabled={!selectedRecipeId || recipeEditSaving} title={text('FABRICATE.Admin.Manager.Recipe.Delete', 'Delete recipe')}>
          <i class="fas fa-trash" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Recipe.Delete', 'Delete recipe')}</span>
        </button>
        <button type="button" class="manager-button is-primary" onclick={saveRecipeDraft} disabled={!canSaveRecipeEdit}>
          <i class={recipeEditSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i>
          <span>{recipeEditSaveLabel()}</span>
        </button>
      {:else if currentView === 'recipe-item-edit'}
        {#if recipeItemEditDirty}
          <span class="manager-chip is-warning" data-recipe-item-dirty>{text('FABRICATE.Admin.Manager.RecipeItem.Dirty', 'Unsaved')}</span>
        {/if}
        <button type="button" class="manager-button" data-recipe-item-back onclick={backToBooksScrolls} disabled={recipeItemEditSaving}>
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.RecipeItem.BackToBrowse', 'Back to Books & Scrolls')}</span>
        </button>
        <button type="button" class="manager-button is-danger" data-recipe-item-delete onclick={deleteRecipeItemFromEdit} disabled={!recipeItemDraft?.id || recipeItemEditSaving} title={text('FABRICATE.Admin.Manager.RecipeItem.Delete', 'Delete recipe item')}>
          <i class="fas fa-trash" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.RecipeItem.Delete', 'Delete recipe item')}</span>
        </button>
        <button type="button" class="manager-button is-primary" data-recipe-item-save onclick={saveRecipeItemDraft} disabled={!canSaveRecipeItemEdit}>
          <i class={recipeItemEditSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.RecipeItem.Save', 'Save recipe item')}</span>
        </button>
      {:else if currentView === 'components'}
        <!-- no header actions for the components list -->
      {:else if currentView === 'component-edit'}
        <ComponentEditorHeader
          dirty={componentEditCombinedDirty}
          saving={componentEditSaving}
          canSave={canSaveComponentEdit}
          formId="manager-component-edit-form"
          dirtyLabel={text('FABRICATE.Admin.Manager.Component.Dirty', 'Unsaved')}
          backLabel={text('FABRICATE.Admin.Manager.Component.Back', 'Back')}
          saveLabel={componentEditSaveLabel()}
          onBack={backToComponentsBrowse}
        />
      {:else if currentView === 'tags'}
        <!-- no header actions for the tags view -->
      {:else if currentView === 'checks'}
        {#if checksDirty}
          <span class="manager-chip is-warning">{text('FABRICATE.Admin.Manager.Checks.Dirty', 'Unsaved')}</span>
        {/if}
        <button type="button" class="manager-button is-primary" data-checks-save onclick={saveChecks} disabled={!checksDirty || checksSaving}>
          <i class={checksSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Checks.Save', 'Save check')}</span>
        </button>
      {:else if currentView === 'essences'}
        <button type="button" class="manager-button is-primary" onclick={createEssenceDraft}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Essence.Create', 'Create essence')}</span>
        </button>
      {:else if currentView === 'essence-edit'}
        {#if essenceEditDirty}
          <span class="manager-chip is-warning">{text('FABRICATE.Admin.Manager.Essence.Dirty', 'Unsaved')}</span>
        {/if}
        <button type="button" class="manager-button" onclick={cancelEssenceEdit} disabled={essenceEditSaving}>
          <i class="fas fa-times" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Essence.Cancel', 'Cancel')}</span>
        </button>
        <button type="submit" form="manager-essence-edit-form" class="manager-button is-primary" disabled={!canSaveEssenceEdit}>
          <i class={essenceEditSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i>
          <span>{essenceEditSaveLabel()}</span>
        </button>
      {:else if currentView === 'environments' && activeGatheringTab === 'tasks'}
        <button type="button" class="manager-button is-primary" onclick={() => createGatheringTask(selectedSystemId)} disabled={!canShowEnvironments}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.Create', 'Create gathering task')}</span>
        </button>
      {:else if currentView === 'environments' && activeGatheringTab === 'encounters'}
        <button type="button" class="manager-button is-primary" onclick={() => createGatheringEvent(selectedSystemId)} disabled={!canShowEnvironments}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Events.Create', 'Create gathering event')}</span>
        </button>
      {:else if currentView === 'environments' && activeGatheringTab === 'travel' && activeTravelTab === 'parties'}
        <button type="button" class="manager-button is-primary" onclick={() => store.createParty?.()} disabled={!canShowEnvironments || $viewState.travelSaving}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Travel.CreateParty', 'Create party')}</span>
        </button>
      {:else if currentView === 'environments' && activeGatheringTab === 'travel' && activeTravelTab === 'realms'}
        <button type="button" class="manager-button is-primary" onclick={async () => { const created = await store.createRealmQuick?.(selectedSystemId, text('FABRICATE.Admin.Manager.Travel.DefaultRealmName', 'New realm')); if (typeof created === 'string' && created) selectedTravelRealmId = created; }} disabled={!canShowEnvironments || !selectedSystemId || $viewState.travelSaving}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Travel.CreateRealm', 'Create realm')}</span>
        </button>
      {:else if currentView === 'environments' && activeGatheringTab === 'travel'}
        <!-- Map Region Links tab has no create action. -->
      {:else if currentView === 'environments'}
        <button type="button" class="manager-button is-primary" onclick={createEnvironment} disabled={!canShowEnvironments}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Create', 'Create environment')}</span>
        </button>
      {:else if currentView === 'environment-edit'}
        {#if $viewState.environmentDraftDirty}
          <span class="manager-chip is-warning">{text('FABRICATE.Admin.Manager.Environment.Dirty', 'Unsaved')}</span>
        {/if}
        <button type="button" class="manager-button" onclick={backToEnvironmentsBrowse} disabled={$viewState.environmentSaving}>
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.BackToBrowse', 'Back to environments')}</span>
        </button>
        <button type="button" class="manager-button is-danger" data-action="delete-environment" onclick={() => store.deleteEnvironmentDraft?.()} disabled={$viewState.environmentDraftIsNew || $viewState.environmentSaving}>
          <i class="fas fa-trash" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Delete', 'Delete environment')}</span>
        </button>
        <button type="button" class="manager-button is-primary" onclick={saveEnvironmentEdit} disabled={!$viewState.environmentDraftDirty || $viewState.environmentSaving}>
          <i class={$viewState.environmentSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Environments.Save', 'Save')}</span>
        </button>
      {:else if currentView === 'gathering-task-edit'}
        {#if gatheringTaskDraftDirty}
          <span class="manager-chip is-warning">{text('FABRICATE.Admin.Manager.Environment.Tasks.Dirty', 'Unsaved')}</span>
        {/if}
        <button type="button" class="manager-button" onclick={backToGatheringTaskLibrary}>
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.BackToLibrary', 'Back to task library')}</span>
        </button>
        <button
          type="button"
          class="manager-button is-danger"
          onclick={deleteGatheringTaskDraft}
          disabled={!selectedGatheringTaskId || gatheringTaskSaving}
          title={text('FABRICATE.Admin.Manager.Environment.Tasks.Delete', 'Delete gathering task')}
        >
          <i class="fas fa-trash" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.Delete', 'Delete gathering task')}</span>
        </button>
        <button
          type="button"
          class="manager-button is-primary"
          onclick={saveGatheringTaskDraft}
          disabled={!gatheringTaskDraftDirty || !gatheringTaskValidation.valid || gatheringTaskSaving}
          title={gatheringTaskValidation.valid ? '' : gatheringTaskValidation.errors.join('\n')}
        >
          <i class={gatheringTaskSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.Save', 'Save task')}</span>
        </button>
      {:else if currentView === 'gathering-event-edit'}
        {#if gatheringEventDraftDirty}
          <span class="manager-chip is-warning">{text('FABRICATE.Admin.Manager.Environment.Events.Dirty', 'Unsaved')}</span>
        {/if}
        <button type="button" class="manager-button" onclick={backToGatheringEventLibrary}>
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Events.BackToLibrary', 'Back to event library')}</span>
        </button>
        <button
          type="button"
          class="manager-button is-danger"
          onclick={deleteGatheringEventDraft}
          disabled={!selectedGatheringEventId || gatheringEventSaving}
          title={text('FABRICATE.Admin.Manager.Environment.Events.Delete', 'Delete event')}
        >
          <i class="fas fa-trash" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Events.Delete', 'Delete event')}</span>
        </button>
        <button
          type="button"
          class="manager-button is-primary"
          onclick={saveGatheringEventDraft}
          disabled={!gatheringEventDraftDirty || !gatheringEventValidation.valid || gatheringEventSaving}
          title={gatheringEventValidation.valid ? '' : gatheringEventValidation.errors.join('\n')}
        >
          <i class={gatheringEventSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Events.Save', 'Save event')}</span>
        </button>
      {:else if currentView === 'system-edit'}
        <button type="button" class="manager-button" onclick={backToSystemsBrowser}>
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.SystemEdit.BackToSystems', 'Back to systems')}</span>
        </button>
      {:else}
        <button type="button" class="manager-button" onclick={importSystem}>
          <i class="fas fa-file-import" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Import', 'Import')}</span>
        </button>
        <button type="button" class="manager-button" onclick={() => exportSystem()} disabled={!selectedSystemId}>
          <i class="fas fa-file-export" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Export', 'Export')}</span>
        </button>
        <button type="button" class="manager-button is-primary" onclick={createSystem}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Create', 'Create')}</span>
        </button>
      {/if}
    </div>
    {/if}
  </header>

  <div class={`manager-body ${railCollapsed ? 'is-rail-collapsed' : ''}`}>
    <aside class="manager-rail" aria-label={text('FABRICATE.Admin.Manager.Navigation', 'Crafting manager navigation')}>
      <button
        type="button"
        class="manager-rail-toggle"
        aria-pressed={railCollapsed}
        aria-label={railCollapsed
          ? text('FABRICATE.Admin.Manager.Nav.ExpandRail', 'Expand navigation rail')
          : text('FABRICATE.Admin.Manager.Nav.CollapseRail', 'Collapse navigation rail')}
        title={railCollapsed
          ? text('FABRICATE.Admin.Manager.Nav.ExpandRail', 'Expand navigation rail')
          : text('FABRICATE.Admin.Manager.Nav.CollapseRail', 'Collapse navigation rail')}
        onclick={toggleManagerRail}
      >
        <i class={railCollapsed ? 'fas fa-angles-right' : 'fas fa-angles-left'} aria-hidden="true"></i>
      </button>
      <!--
        The rail's crafting-system card. The kicker names what the card CONTAINS
        ("Crafting system"), not the product — the product name is already on the
        titlebar. The card is a real `<select>`, so the rail can switch system without
        a round trip through the system library, and a back link out to that library.
        The "GM management workspace" caption that used to hang below it is gone: the
        section label beneath the card already says GM management.
      -->
      <section class="manager-rail-block" aria-label={text('FABRICATE.Admin.Manager.ManagerScope', 'Manager scope')}>
        {#if selectedSystem}
          <div class="manager-scope-card">
            <p class="manager-kicker">{text('FABRICATE.Admin.Manager.CraftingSystem', 'Crafting system')}</p>
            <select
              class="manager-scope-select"
              data-manager-scope-select
              value={selectedSystem.id}
              aria-label={text('FABRICATE.Admin.Manager.SelectSystem', 'Select a system')}
              onchange={(event) => changeScopeSystem(event.currentTarget.value)}
            >
              {#each $viewState.systems || [] as system (system.id)}
                <option value={system.id}>{system.name}</option>
              {/each}
            </select>
            <!--
              The systems browser IS the destination this link returns to, so on that
              view there is nowhere to go back to (issue 643): it renders faded and
              inert (`disabled` + `aria-disabled` + `pointer-events: none`), and stays a
              live control on every other view.
            -->
            <button
              type="button"
              class={`manager-scope-return ${currentView === 'systems' ? 'is-disabled' : ''}`}
              disabled={currentView === 'systems'}
              aria-disabled={currentView === 'systems'}
              aria-label={text('FABRICATE.Admin.Manager.ReturnToSystemLibrary', 'Return to System Library')}
              title={text('FABRICATE.Admin.Manager.ReturnToSystemLibrary', 'Return to System Library')}
              onclick={backToSystemsBrowser}
            >
              <i class="fas fa-arrow-left-long" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.AllCraftingSystems', 'All crafting systems')}</span>
            </button>
          </div>
        {:else}
          <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Product', 'Fabricate')}</p>
          <h2 class="manager-title">{text('FABRICATE.Admin.Manager.Nav.Systems', 'Crafting Systems')}</h2>
        {/if}
      </section>

      <!--
        The rail's uppercase section label. Hidden entirely in the 56px collapsed
        rail (with the scope card and the count badges) so the icon gutter stays the
        only thing that has to fit.
      -->
      <p class="manager-rail-title" data-manager-rail-section>{text('FABRICATE.Admin.Manager.Nav.SectionLabel', 'GM management')}</p>

      <nav class="manager-nav" aria-label={text('FABRICATE.Admin.Manager.ManagerSections', 'Manager sections')}>
        {#if selectedSystem}
          <button type="button" class={`manager-nav-button ${currentView === 'system-edit' ? 'is-active' : ''}`} aria-current={currentView === 'system-edit' ? 'page' : undefined} data-nav-system-edit onclick={() => editSystem(selectedSystem.id)}>
            <i class="fas fa-clipboard-check" aria-hidden="true"></i>
            <span class="manager-nav-label">{text('FABRICATE.Admin.Manager.SystemEdit.Nav', 'System Overview')}</span>
            {#if systemOverviewCount > 0}
              <span class="manager-nav-count" aria-label={text('FABRICATE.Admin.Manager.SystemOverview.CountBadgeAria', 'Open validation issues')}>{systemOverviewCount}</span>
            {/if}
          </button>
          <!-- Crafting group is unconditional as of issue 745 (v1.3 headline). -->
          <div class={`manager-nav-group ${craftingMenuExpanded ? 'is-expanded' : ''}`}>
            <button
              type="button"
              class="manager-nav-button manager-nav-parent"
              id="manager-nav-crafting"
              aria-current={isCraftingRoute ? 'page' : undefined}
              aria-expanded={craftingMenuExpanded}
              onclick={activateCraftingParent}
            >
              <i class="fas fa-hammer" aria-hidden="true"></i>
              <span class="manager-nav-label">{text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting')}</span>
              <span class="manager-nav-count">{craftingNavCount}</span>
            </button>
            <button
              type="button"
              class="manager-nav-toggle"
              aria-label={craftingMenuExpanded
                ? text('FABRICATE.Admin.Manager.Nav.CollapseCrafting', 'Collapse crafting menu')
                : text('FABRICATE.Admin.Manager.Nav.ExpandCrafting', 'Expand crafting menu')}
              aria-controls="manager-crafting-submenu"
              aria-expanded={craftingMenuExpanded}
              onclick={toggleCraftingMenu}
            >
              <i class={craftingMenuExpanded ? 'fas fa-chevron-up' : 'fas fa-chevron-down'} aria-hidden="true"></i>
            </button>
            {#if craftingMenuExpanded}
              <div class="manager-nav-submenu" id="manager-crafting-submenu" aria-label={text('FABRICATE.Admin.Manager.Crafting.CraftingTabs.Label', 'Crafting sections')}>
                {#each craftingNavItems as craftingItem (craftingItem.id)}
                  <button
                    type="button"
                    class={`manager-nav-subitem ${isCraftingRoute && activeCraftingTab === craftingItem.id ? 'is-active' : ''}`}
                    id={`manager-crafting-nav-${craftingItem.id}`}
                    aria-current={isCraftingRoute && activeCraftingTab === craftingItem.id ? 'page' : undefined}
                    onclick={() => openCraftingSection(craftingItem.id)}
                  >
                    <i class={craftingItem.icon} aria-hidden="true"></i>
                    <span class="manager-nav-label">{text(craftingItem.labelKey, craftingItem.labelFallback)}</span>
                    {#if craftingItem.count != null}
                      <span class="manager-nav-count">{craftingItem.count}</span>
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
          <button type="button" class={`manager-nav-button ${currentView === 'components' || currentView === 'component-edit' ? 'is-active' : ''}`} aria-current={currentView === 'components' || currentView === 'component-edit' ? 'page' : undefined} onclick={() => setView('components')}>
            <i class="fas fa-boxes" aria-hidden="true"></i>
            <span class="manager-nav-label">{text('FABRICATE.Admin.Manager.Nav.Components', 'Components')}</span>
            <span class="manager-nav-count">{selectedCounts.components}</span>
          </button>
          <button type="button" class={`manager-nav-button ${currentView === 'tags' ? 'is-active' : ''}`} aria-current={currentView === 'tags' ? 'page' : undefined} onclick={() => setView('tags')}>
            <i class="fas fa-tags" aria-hidden="true"></i>
            <span class="manager-nav-label">{text('FABRICATE.Admin.Manager.Nav.TagsCategories', 'Tags & Categories')}</span>
            <span class="manager-nav-count">{selectedCounts.itemTags + selectedCounts.recipeCategories}</span>
          </button>
          {#if canShowEssences}
            <button type="button" class={`manager-nav-button ${currentView === 'essences' || currentView === 'essence-edit' ? 'is-active' : ''}`} aria-current={currentView === 'essences' || currentView === 'essence-edit' ? 'page' : undefined} onclick={() => setView('essences')}>
              <i class="fas fa-mortar-pestle" aria-hidden="true"></i>
              <span class="manager-nav-label">{text('FABRICATE.Admin.Manager.Nav.Essences', 'Essences')}</span>
              <span class="manager-nav-count">{selectedCounts.essences}</span>
            </button>
          {/if}
          <button type="button" class={`manager-nav-button ${currentView === 'tools' ? 'is-active' : ''}`} aria-current={currentView === 'tools' ? 'page' : undefined} onclick={() => setView('tools')}>
            <i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>
            <span class="manager-nav-label">{text('FABRICATE.Admin.Manager.Nav.Tools', 'Tools')}</span>
            <span class="manager-nav-count">{toolsNavCount}</span>
          </button>
          <button type="button" class={`manager-nav-button ${currentView === 'checks' ? 'is-active' : ''}`} aria-current={currentView === 'checks' ? 'page' : undefined} onclick={() => setView('checks')}>
            <i class="fas fa-dice-d20" aria-hidden="true"></i>
            <span class="manager-nav-label">{text('FABRICATE.Admin.Manager.Nav.Checks', 'Checks')}</span>
          </button>
          {#if canShowEnvironments}
            <div class={`manager-nav-group ${gatheringMenuExpanded ? 'is-expanded' : ''}`}>
              <button
                type="button"
                class="manager-nav-button manager-nav-parent"
                id="manager-nav-gathering"
                aria-current={isGatheringRoute ? 'page' : undefined}
                aria-expanded={gatheringMenuExpanded}
                onclick={activateGatheringParent}
              >
                <i class="fas fa-seedling" aria-hidden="true"></i>
                <span class="manager-nav-label">{text('FABRICATE.Admin.Manager.Nav.Environments', 'Gathering')}</span>
                <span class="manager-nav-count">{gatheringNavCounts.total}</span>
              </button>
              <button
                type="button"
                class="manager-nav-toggle"
                aria-label={gatheringMenuExpanded
                  ? text('FABRICATE.Admin.Manager.Nav.CollapseGathering', 'Collapse gathering menu')
                  : text('FABRICATE.Admin.Manager.Nav.ExpandGathering', 'Expand gathering menu')}
                aria-controls="manager-gathering-submenu"
                aria-expanded={gatheringMenuExpanded}
                onclick={toggleGatheringMenu}
              >
                <i class={gatheringMenuExpanded ? 'fas fa-chevron-up' : 'fas fa-chevron-down'} aria-hidden="true"></i>
              </button>
              {#if gatheringMenuExpanded}
                <div class="manager-nav-submenu" id="manager-gathering-submenu" aria-label={text('FABRICATE.Admin.Manager.Environment.GatheringTabs.Label', 'Gathering sections')}>
                  {#each visibleGatheringNavItems as gatheringItem (gatheringItem.id)}
                    <button
                      type="button"
                      class={`manager-nav-subitem ${isGatheringRoute && activeGatheringTab === gatheringItem.id ? 'is-active' : ''}`}
                      id={`manager-gathering-nav-${gatheringItem.id}`}
                      aria-current={isGatheringRoute && activeGatheringTab === gatheringItem.id ? 'page' : undefined}
                      onclick={() => openGatheringSection(gatheringItem.id)}
                    >
                      <i class={gatheringItem.icon} aria-hidden="true"></i>
                      <span class="manager-nav-label">{text(gatheringItem.labelKey, gatheringItem.labelFallback)}</span>
                      {#if gatheringNavCounts[gatheringItem.id] != null}
                        <span class="manager-nav-count">{gatheringNavCounts[gatheringItem.id]}</span>
                      {/if}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        {/if}
        {#each visiblePlaceholderViews as view (view.labelKey)}
          <button type="button" class="manager-nav-button" disabled title={text('FABRICATE.Admin.Manager.PlannedView', '{view} is planned for a future release.').replace('{view}', text(view.labelKey, view.fallback))}>
            <i class={view.icon} aria-hidden="true"></i>
            <span class="manager-nav-label">{text(view.labelKey, view.fallback)}</span>
            <span class="manager-nav-count">{text('FABRICATE.Admin.Manager.Soon', 'Soon')}</span>
          </button>
        {/each}
      </nav>
    </aside>

    {#if currentView === 'environments'}
      <EnvironmentsBrowserView
        environments={environmentList}
        environmentsLoading={$viewState.environmentsLoading}
        environmentsError={$viewState.environmentsError}
        environmentDraft={environmentDraftForDisplay}
        environmentDraftDirty={$viewState.environmentDraftDirty}
        {environmentValidationCount}
        {selectedEnvironmentId}
        selectedSystemName={selectedSystem?.name || ''}
        {selectedSystemId}
        gatheringConfig={$viewState.gatheringConfig}
        sceneOptions={selectedSystem?.sceneOptions || []}
        environmentTaskCounts={$viewState.environmentTaskCounts || {}}
        {shouldUseEnvironmentDraftForDisplay}
        {activeGatheringTab}
        {activeTravelTab}
        onSelectTravelTab={selectTravelTab}
        selectedTaskId={selectedGatheringTask?.id || selectedGatheringTaskId}
        selectedEventId={selectedGatheringEvent?.id || selectedGatheringEventId}
        managedItemOptions={selectedSystem?.managedItemOptions || []}
        {services}
        onSelectGatheringTab={selectGatheringTab}
        onSelectGatheringTask={selectGatheringTask}
        onCreateGatheringTask={createGatheringTask}
        onEditGatheringTask={editGatheringTask}
        onDuplicateGatheringTask={duplicateGatheringTask}
        onDeleteGatheringTask={deleteGatheringTask}
        onToggleGatheringTaskEnabled={toggleGatheringTaskEnabled}
        onSelectGatheringEvent={selectGatheringEvent}
        onCreateGatheringEvent={createGatheringEvent}
        onEditGatheringEvent={editGatheringEvent}
        onDuplicateGatheringEvent={duplicateGatheringEvent}
        onDeleteGatheringEvent={deleteGatheringEvent}
        onToggleGatheringEventEnabled={toggleGatheringEventEnabled}
        onSelectEnvironment={(id) => selectEnvironment(id)}
        onEditEnvironment={(id) => editEnvironment(id)}
        onCreateEnvironment={createEnvironment}
        onDuplicateEnvironment={(id) => duplicateEnvironment(id)}
        onDeleteEnvironment={(id) => deleteEnvironment(id)}
        onToggleEnvironmentEnabled={(id, enabled) => toggleEnvironmentEnabled(id, enabled)}
        onUpdateGatheringConditions={store.updateGatheringConditions}
        onToggleGatheringConditionEnabled={store.toggleGatheringConditionEnabled}
        onAddGatheringConditionValue={store.addGatheringConditionValue}
        onUpdateGatheringConditionValue={store.updateGatheringConditionValue}
        onDeleteGatheringConditionValue={store.deleteGatheringConditionValue}
        onAddGatheringVocabularyValue={store.addGatheringVocabularyValue}
        onUpdateGatheringVocabularyValue={store.updateGatheringVocabularyValue}
        onDeleteGatheringVocabularyValue={store.deleteGatheringVocabularyValue}
        gatheringRealmSettings={$viewState.gatheringRealmSettings || { enabled: false }}
        onSetGatheringRealmsEnabled={(sys, enabled) => store.setGatheringRealmsEnabled?.(sys, enabled)}
        onPickImagePath={services?.pickImagePath}
        travelParties={travelParties}
        travelSelectedPartyId={selectedTravelPartyId}
        travelSaving={$viewState.travelSaving === true}
        travelError={$viewState.travelError}
        travelFieldErrors={$viewState.travelFieldErrors || {}}
        travelActorOptions={$viewState.actorOptions || []}
        travelSystemRealms={$viewState.selectedSystemRealms || []}
        travelSelectedRealmId={selectedTravelRealmId}
        onSelectRealm={(id) => selectedTravelRealmId = id}
        onAddEnvironmentToRealm={(envId, realmId) => store.setEnvironmentRealmMembership?.(envId, realmId, true)}
        onRemoveEnvironmentFromRealm={(envId, realmId) => store.setEnvironmentRealmMembership?.(envId, realmId, false)}
        onSelectParty={(id) => store.selectParty?.(id)}
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
        onDropStaleOverrideRealm={(id, sys, realmId) => store.dropStaleOverrideRealm?.(id, sys, realmId)}
        onCreateRealmQuick={(sys, name) => store.createRealmQuick?.(sys, name)}
        onRenameRealm={(sys, id, name) => store.renameRealm?.(sys, id, name)}
        onToggleRealmEnabled={(sys, id, enabled) => store.toggleRealmEnabled?.(sys, id, enabled)}
        onUpdateRealm={(sys, id, patch) => store.updateRealm?.(sys, id, patch)}
        onDeleteRealm={(sys, id) => store.deleteRealm?.(sys, id)}
        travelCurrentSceneRegions={mapCurrentSceneRegions}
        travelCurrentSceneUuid={$viewState.currentSceneUuid || ''}
        mapSelectedRegionUuid={selectedMapRegionUuid}
        onSelectMapRegion={(uuid) => selectedMapRegionUuid = uuid}
        onSetMapRegionLink={(sceneRegionUuid, realmId) => store.setMapRegionLink?.(sceneRegionUuid, realmId)}
      />
    {:else if currentView === 'environment-edit' && selectedSystem}
      <main class="manager-main manager-environment-edit-main" aria-label={text('FABRICATE.Admin.Manager.Environment.EditTitle', 'Edit environment')}>
        <section class="manager-environment-editor-shell">
          <EnvironmentEditView
            environmentDraft={$viewState.environmentDraft}
            composition={$viewState.environmentComposition}
            eventSelectionMode={selectedGatheringRules.eventSelectionMode}
            isNew={$viewState.environmentDraftIsNew}
            linkedSceneImage={environmentSceneImage($viewState.environmentDraft)}
            realmRecords={$viewState.selectedSystemRealms || []}
            realmsEnabled={gatheringRealmsEnabled}
            biomeOptions={gatheringVocabularyOptions('biomes')}
            dangerOptions={gatheringVocabularyOptions('danger')}
            onPickImagePath={services?.pickImagePath}
            onUpdateEnvironment={store.updateEnvironmentDraft}
            onSetCompositionMode={store.setEnvironmentCompositionMode}
            onIncludeRecord={store.includeEnvironmentRecord}
            onForceIncludeRecord={store.forceIncludeEnvironmentRecord}
            onExcludeRecord={store.excludeEnvironmentRecord}
            onRestoreRecord={store.restoreEnvironmentRecord}
            onReorderRecord={store.reorderEnvironmentRecord}
            onOpenSourceTask={(id) => editGatheringTask(id)}
            onOpenSourceEvent={(id) => editGatheringEvent(id)}
          />
        </section>
      </main>
    {:else if currentView === 'checks' && selectedSystem}
      <main class="manager-main manager-environment-edit-main" aria-label={text('FABRICATE.Admin.Manager.Checks.Title', 'Checks')}>
        <section class="manager-environment-editor-shell">
          <ChecksView
            resolutionMode={selectedSystem?.resolutionMode || 'simple'}
            alchemyCheckMode={selectedSystem?.alchemy?.checkMode || 'none'}
            craftingCheck={checkRoutedDraft}
            craftingCheckSimple={checkSimpleDraft}
            craftingCheckProgressive={checkProgressiveDraft}
            craftingConsumption={selectedSystem?.craftingCheck?.consumption || null}
            alchemyLearnOnCraft={selectedSystem?.alchemy?.learnOnCraft === true}
            alchemyConsumeOnFail={selectedSystem?.alchemy?.consumeOnFail !== false}
            alchemyShowAttemptHistory={selectedSystem?.alchemy?.showAttemptHistoryToPlayers !== false}
            {salvageResolutionMode}
            salvageCheckSimple={salvageSimpleDraft}
            salvageCheckRouted={salvageRoutedDraft}
            salvageCheckProgressive={salvageProgressiveDraft}
            {gatheringResolutionMode}
            gatheringCheckProgressive={gatheringProgressiveDraft}
            gatheringCheckRouted={gatheringRoutedDraft}
            breakageAuthority={selectedSystem?.toolBreakage?.authority || 'toolSpecific'}
            features={selectedSystem?.features || {}}
            activation={checkActivation}
            {onUpdateCraftingCheck}
            {onUpdateCraftingCheckSimple}
            {onUpdateCraftingCheckProgressive}
            {onUpdateSalvageCheckSimple}
            {onUpdateSalvageCheckRouted}
            {onUpdateSalvageCheckProgressive}
            {onUpdateGatheringCheckProgressive}
            {onUpdateGatheringCheckRouted}
            onSetAlchemyCheckMode={(m) => store.setAlchemyCheckMode?.(m)}
            onUpdateCraftingConsumption={(patch) => store.saveCraftingCheckConsumption?.(patch)}
            {onUpdateAlchemyFlags}
            onTabChange={(tab) => { checksActiveTab = tab; }}
            {onToggleCheckActive}
          />
        </section>
      </main>
    {:else if currentView === 'gathering-task-edit' && selectedSystem}
      <GatheringTaskEditView
        task={editingGatheringTask}
        staminaEnabled={selectedGatheringTaskStaminaEnabled}
        nodesEnabled={selectedGatheringTaskNodesEnabled}
        resolutionMode={gatheringResolutionMode}
        {itemCards}
        managedItemOptions={selectedSystem.managedItemOptions || []}
        weatherOptions={gatheringConditionOptions('weather')}
        timeOfDayOptions={gatheringConditionOptions('timeOfDay')}
        biomeOptions={gatheringVocabularyOptions('biomes')}
        selectedDropId={selectedGatheringDrop?.id || selectedGatheringDropId}
        rewardRules={selectedGatheringRules}
        characterModifierLibrary={selectedGatheringCharacterModifiers}
        libraryTools={selectedGatheringSystemTools}
        environmentOptions={selectedSystemEnvironmentOptions}
        onPickImagePath={services?.pickImagePath}
        onUpdateTask={updateSelectedGatheringTask}
        onSelectDrop={(rowId) => { selectedGatheringDropId = rowId; }}
        onAddDrop={addGatheringTaskDrop}
        onUpdateDrop={updateGatheringTaskDrop}
        onMoveDrop={moveGatheringTaskDrop}
        onImportDrop={importGatheringTaskDrop}
        onAddModifier={addGatheringDropModifier}
        onUpdateModifier={updateGatheringDropModifier}
        onDeleteModifier={deleteGatheringDropModifier}
        onAddToolReference={addToolReferenceToSelectedTask}
        onRemoveToolReference={removeToolReferenceFromSelectedTask}
      />
    {:else if currentView === 'gathering-event-edit' && selectedSystem}
      <GatheringEventEditView
        event={editingGatheringEvent}
        weatherOptions={gatheringConditionOptions('weather')}
        timeOfDayOptions={gatheringConditionOptions('timeOfDay')}
        biomeOptions={gatheringVocabularyOptions('biomes')}
        onPickImagePath={services?.pickImagePath}
        onUpdateEvent={updateSelectedGatheringEvent}
      />
    {:else if currentView === 'tools' && selectedSystem}
      <ToolsBrowserView
        tools={$viewState.toolsDraft || []}
        selectedToolId={$viewState.toolsDraftSelectedToolId || ''}
        expandedToolId={$viewState.toolsDraftExpandedToolId || ''}
        dirtyToolIds={dirtyToolIds}
        managedItemOptions={selectedSystem?.managedItemOptions || []}
        breakageAuthority={selectedSystem?.toolBreakage?.authority || 'toolSpecific'}
        onSelectTool={(id) => store.selectDraftTool?.(id)}
        onExpandTool={(id) => store.setExpandedDraftTool?.(id)}
        onToggleExpand={(id) => store.setExpandedDraftTool?.(id === $viewState.toolsDraftExpandedToolId ? '' : id)}
        onAddTool={(initialPatch) => initialPatch ? store.addToolToDraft?.(initialPatch) : store.addToolToDraft?.()}
        onAddToolDrop={addToolFromDrop}
        onUpdateTool={(id, patch) => store.updateToolInDraft?.(id, patch)}
        onDeleteTool={(id) => store.deleteToolFromDraft?.(id)}
        onSetBreakageAuthority={(authority) => store.setToolBreakageAuthority?.(authority)}
      />
    {:else if currentView === 'essences' && selectedSystem}
      <EssenceBrowserView
        {essenceCards}
        showSourceUi={showEssenceSourceUi}
        selectedEssenceId={selectedEssence?.id || selectedEssenceId}
        onSelectEssence={selectEssence}
        onEditEssence={editEssence}
        onRemoveEssence={removeEssence}
      />
    {:else if currentView === 'essence-edit' && selectedSystem}
      <EssenceEditView
        essence={selectedEssenceId ? selectedEssenceStrict : null}
        managedItemOptions={selectedSystem.managedItemOptions || []}
        showSourceUi={showEssenceSourceUi}
        saving={essenceEditSaving}
        onSave={saveEssenceEdit}
        onDirtyChange={(dirty) => { essenceEditDirty = dirty; }}
        onDraftChange={handleEssenceDraftChange}
        onImportSourceDrop={importEssenceSourceDrop}
      />
    {:else if currentView === 'tags' && selectedSystem}
      <TagsCategoriesView
        {categoryRows}
        {componentCategoryRows}
        {tagRows}
        counts={tagCategoryCounts}
        activeTab={tagsActiveTab}
        onTabChange={(id) => (tagsActiveTab = id)}
        onAddCategory={addCategory}
        onRemoveCategory={removeCategory}
        onAddComponentCategory={addComponentCategory}
        onRemoveComponentCategory={removeComponentCategory}
        onAddTag={addTag}
        onRemoveTag={removeTag}
        onSetCategoryIcon={setCategoryIcon}
        onSetComponentCategoryIcon={setComponentCategoryIcon}
      />
    {:else if currentView === 'component-edit' && selectedSystem}
      {#if componentForEdit}
      <ComponentEditView
        component={componentForEdit}
        tagOptions={componentEditTagOptions}
        essenceOptions={componentEditEssenceOptions}
        showTags={componentEditShowTags}
        showEssences={componentEditShowEssences}
        showSalvage={componentSalvageEnabled}
        categoryOptions={selectedSystem?.componentCategories || []}
        salvageResolutionMode={salvageResolutionMode}
        salvageOutcomeNames={salvageOutcomeNames}
        {salvageCheckEnabled}
        {salvageCheckTiers}
        {salvageCheckDcMode}
        {salvageCheckDc}
        componentOptions={salvageComponentOptions}
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
        onSave={saveComponentEdit}
        onDirtyChange={(dirty) => { componentEditDirty = dirty; }}
        onDraftChange={handleComponentDraftChange}
      />
      {:else}
        <main class="manager-main" aria-label={text('FABRICATE.Admin.Manager.Component.EditTitle', 'Edit component')}>
          <div class="manager-empty">
            <div>
              <i class="fas fa-boxes" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.Manager.Component.SelectComponent', 'Select a component')}</h3>
              <p>{text('FABRICATE.Admin.Manager.Component.EditMissingHint', 'Pick a component from the browser to edit its tags, essences, and source linkage.')}</p>
            </div>
          </div>
        </main>
      {/if}
    {:else if currentView === 'components'}
      <ComponentsBrowserView
        {itemCards}
        itemSearchTerm={$viewState.itemSearchTerm || ''}
        selectedComponentId={selectedComponent?.id || ''}
        {selectedSystemId}
        selectedSystemResolutionMode={selectedSystem?.resolutionMode || 'simple'}
        categoryVocabulary={selectedSystem?.componentCategories || []}
        bind:browserState={componentBrowserState}
        dropEnabled={!!selectedSystemId && !!services?.onDropItem}
        onSearchChange={(term) => store.setItemSearch?.(term)}
        onSelectComponent={(id) => selectComponent(id)}
        onDropComponent={(data) => dropComponent(data)}
        onEditComponent={(id) => editComponent(id)}
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
        essenceOptions={selectedSystem?.features?.essences ? (selectedSystem?.essenceDefinitions || []) : []}
        itemTags={selectedSystem?.itemTags || []}
        checkTierOptions={recipeCheckTierOptions}
        minSuccessTierOptions={recipeMinSuccessTierOptions}
        categories={selectedSystem?.categories || []}
        onSetCategory={handleSetRecipeCategory}
        routingProvider={recipeRoutingProvider}
        routedOutcomeTierOptions={recipeRoutedOutcomeTierOptions}
        routedOutcomeTiersDefined={recipeRoutedHasOutcomeTiers}
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
        selectedSystemName={selectedSystem?.name || ''}
        onSearchChange={(term) => store.setRecipeSearch?.(term)}
        onSelectRecipe={(id) => selectedRecipeIdForAccess = id}
      />
    {:else if currentView === 'books-scrolls' && selectedSystem}
      <BooksScrollsView
        recipeItems={recipeItemDefinitions}
        selectedSystemName={selectedSystem?.name || ''}
        visibilityMode={craftingVisibilityMode}
        {selectedRecipeItemId}
        onSelectRecipeItem={(id) => selectRecipeItem(id)}
        onOpenRecipeItem={(id) => editRecipeItem(id)}
        onCreateRecipeItem={createRecipeItem}
        onToggleEnabled={(id, enabled) => store.setRecipeItemEnabled?.(id, enabled)}
      />
    {:else if currentView === 'recipe-item-edit' && selectedSystem}
      <RecipeItemEditor
        recipeItem={recipeItemDraft}
        linkedItem={recipeItemEditorLinkedItem}
        linkedRecipes={recipeItemEditorLinkedRecipes}
        availableRecipes={recipeItemEditorAvailableRecipes}
        characterPrerequisites={selectedCharacterPrerequisites}
        worldItems={worldItemOptions}
        visibilityMode={craftingVisibilityMode}
        activeTab={recipeItemActiveTab}
        onSelectTab={(tab) => recipeItemActiveTab = tab}
        onPatch={(patch) => patchRecipeItemDraft(patch)}
        onLinkItem={(uuid) => linkRecipeItemSource(uuid)}
        onUnlinkItem={() => unlinkRecipeItemSource()}
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
      />
    {:else if currentView === 'system-edit' && selectedSystem}
      <main class="manager-main manager-environment-edit-main" aria-label={text('FABRICATE.Admin.Manager.SystemEdit.Title', 'System settings')}>
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
        onDetailsChange={(name, description) => { systemDetailsDraft = { name, description }; }}
        onDirtyChange={(dirty) => { systemDetailsDirty = dirty; }}
        reseedNonce={systemDetailsReseedNonce}
        onToggleFeature={(storeKey, checked) => store.toggleFeature?.(storeKey, checked)}
        characterModifierLibrary={selectedGatheringCharacterModifiers}
        {characterModifierPresetsSupported}
        onAddCharacterModifier={onAddCharacterModifier}
        onUpdateCharacterModifier={onUpdateCharacterModifier}
        onDeleteCharacterModifier={onDeleteCharacterModifier}
        onSeedCharacterModifierPresets={onSeedCharacterModifierPresets}
        characterPrerequisiteLibrary={selectedCharacterPrerequisites}
        {characterPrerequisitePresetsSupported}
        onAddCharacterPrerequisite={onAddCharacterPrerequisite}
        onUpdateCharacterPrerequisite={onUpdateCharacterPrerequisite}
        onDeleteCharacterPrerequisite={onDeleteCharacterPrerequisite}
        onSeedCharacterPrerequisitePresets={onSeedCharacterPrerequisitePresets}
        currencyUnits={selectedCurrencyUnits}
        {currencyPresetsSupported}
        {currencySpendStrategy}
        {currencyProviderId}
        {currencyMacros}
        {currencyProviderOptions}
        onAddCurrencyUnit={onAddCurrencyUnit}
        onUpdateCurrencyUnit={onUpdateCurrencyUnit}
        onDeleteCurrencyUnit={onDeleteCurrencyUnit}
        onAddCurrencySubUnit={onAddCurrencySubUnit}
        onUpdateCurrencySubUnit={onUpdateCurrencySubUnit}
        onDeleteCurrencySubUnit={onDeleteCurrencySubUnit}
        onSeedCurrencyPresets={onSeedCurrencyPresets}
        onSetCurrencySpendStrategy={onSetCurrencySpendStrategy}
        onSetCurrencyProvider={onSetCurrencyProvider}
        onSetCurrencyMacro={onSetCurrencyMacro}
        onClearCurrencyMacro={onClearCurrencyMacro}
        onToggleCurrency={(next) => store.toggleRequirement?.('currency', next)}
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
      />
    {/if}

    <!-- Suppressing the aside here and releasing the column in `styles/fabricate.css`
         are ONE decision expressed twice — do only the first and a 300px empty box still
         holds the strip open; do only the second and this (empty) aside wraps to an
         implicit grid row underneath the editor. Keep the two lists in step.

         `recipe-edit` joined this list in issue 676, the same route `component-edit`
         took in decision 4: its context rail is deleted and its content became real
         tabs (Access, Books & Scrolls) and an Overview control (Step mode), so the
         editor has nothing to put in a third column and the tabs take the width back. -->
    {#if currentView !== 'environment-edit' && currentView !== 'checks' && currentView !== 'system-edit' && currentView !== 'crafting-settings' && currentView !== 'recipe-item-edit' && currentView !== 'component-edit' && currentView !== 'recipe-edit'}
    <aside class="manager-inspector" aria-label={inspectorLabel()}>
      {#if currentView === 'tags' && selectedSystem}
        <section class="manager-inspector-card" data-tags-evidence="at-a-glance">
          <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.TagsCategories.AtAGlance', 'Vocabulary at a glance')}</h3>
          <div class="manager-fact-grid">
            <div class="manager-fact" data-tags-category-fact="recipe-categories">
              <span class="manager-fact-line"><strong>{tagCategoryCounts.customCategories}</strong> <span class="manager-fact-label">{text('FABRICATE.Admin.Manager.TagsCategories.RecipeCategories', 'Recipe categories')}</span></span>
            </div>
            <div class="manager-fact" data-tags-category-fact="component-categories">
              <span class="manager-fact-line"><strong>{tagCategoryCounts.customComponentCategories}</strong> <span class="manager-fact-label">{text('FABRICATE.Admin.Manager.TagsCategories.ComponentCategories', 'Component categories')}</span></span>
            </div>
            <div class="manager-fact" data-tags-category-fact="item-tags">
              <span class="manager-fact-line"><strong>{tagCategoryCounts.itemTags}</strong> <span class="manager-fact-label">{text('FABRICATE.Admin.Manager.TagsCategories.ItemTags', 'Component tags')}</span></span>
            </div>
            <div class="manager-fact" data-tags-category-fact="references">
              <span class="manager-fact-line"><strong>{tagCategoryCounts.categoryReferences + tagCategoryCounts.componentCategoryReferences + tagCategoryCounts.tagReferences}</strong> <span class="manager-fact-label">{text('FABRICATE.Admin.Manager.TagsCategories.TotalReferences', 'Total references')}</span></span>
            </div>
          </div>
        </section>

        <section class="manager-inspector-card" data-tags-evidence="how-it-works">
          <h3 class="manager-card-title">{tagsHelp.title}</h3>
          <ul class="manager-evidence-list">
            {#each tagsHelp.items as tip (tip)}
              <li>{tip}</li>
            {/each}
          </ul>
        </section>

        <section class="manager-inspector-card" data-tags-evidence="reference-safe">
          <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.TagsCategories.ReferenceSafeTitle', 'Reference-safe by default')}</h3>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.TagsCategories.ReferenceSafeHint', 'Deleting a referenced category reassigns its recipes and components to General; deleting a referenced tag strips it from the components that carry it. Nothing is left dangling.')}</p>
        </section>
      {:else if currentView === 'environments' || currentView === 'environment-edit' || currentView === 'gathering-task-edit' || currentView === 'gathering-event-edit'}
        {#if (currentView === 'environments' && activeGatheringTab === 'tasks') || currentView === 'gathering-task-edit'}
          {#if selectedGatheringTask}
            {#if currentView !== 'gathering-task-edit'}
            <section class="manager-inspector-card" data-gathering-task-inspector>
              <div class="manager-inspector-title-row is-hero-large">
                <img class="manager-recipe-preview" src={gatheringTaskImage(selectedGatheringTask)} alt="" />
                <div class="manager-inspector-copy">
                  <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Environment.Tasks.Selected', 'Selected gathering task')}</p>
                  <h2 class="manager-inspector-name" title={gatheringTaskName(selectedGatheringTask)}>{gatheringTaskName(selectedGatheringTask)}</h2>
                  <div class="manager-chip-row">
                    <span class={`manager-chip ${selectedGatheringTask.enabled === false ? 'is-disabled' : 'is-active'}`}>
                      {selectedGatheringTask.enabled === false ? text('FABRICATE.Admin.Manager.StatusDisabled', 'Disabled') : text('FABRICATE.Admin.Manager.StatusActive', 'Active')}
                    </span>
                    <span class="manager-chip">{gatheringTaskAvailability(selectedGatheringTask)}</span>
                  </div>
                </div>
              </div>

              <p class="manager-muted">
                {truncateDescription(selectedGatheringTask.description) || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
              </p>
            </section>

            <section class="manager-inspector-card">
              <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Environment.Tasks.Details', 'Gathering task details')}</h3>
              <div class="manager-fact-grid">
                <div class="manager-fact" data-gathering-task-fact="biomes">
                  <span class="manager-fact-line"><strong>{Array.isArray(selectedGatheringTask.biomes) && selectedGatheringTask.biomes.length > 0 ? selectedGatheringTask.biomes.length : text('FABRICATE.Admin.Manager.Environment.Tasks.AnyBiome', 'Any biome')}</strong>{#if Array.isArray(selectedGatheringTask.biomes) && selectedGatheringTask.biomes.length > 0}{' '}<span class="manager-fact-label">{text('FABRICATE.Admin.Manager.Environment.Biome', 'Biome')}</span>{/if}</span>
                </div>
                <div class="manager-fact" data-gathering-task-fact="drops">
                  <span class="manager-fact-line"><strong>{gatheringTaskDropRows(selectedGatheringTask).length}</strong> <span class="manager-fact-label">{text('FABRICATE.Admin.Manager.Environment.Tasks.Drops', 'Drops')}</span></span>
                </div>
                <div class="manager-fact" data-gathering-task-fact="environments">
                  <span class="manager-fact-line"><strong>{activeGatheringTaskEnvironmentCount(selectedGatheringTask)}</strong> <span class="manager-fact-label">{text('FABRICATE.Admin.Manager.Environment.Tasks.ActiveEnvironments', 'Active environments')}</span></span>
                </div>
              </div>
            </section>

            <section class="manager-inspector-card manager-task-drops-summary-card" data-task-drops-summary>
              <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Environment.Tasks.DropsSummary', 'Drops summary')}</h3>
              {#if gatheringTaskDropRows(selectedGatheringTask).length === 0}
                <p class="manager-muted" data-task-drops-summary-empty>{text('FABRICATE.Admin.Manager.Environment.Tasks.NoDropsConfigured', 'No drops configured yet.')}</p>
              {:else}
                <div class="manager-task-drops-summary-list" data-task-drops-summary-list>
                  {#each gatheringTaskDropRows(selectedGatheringTask) as drop (drop.id)}
                    <span class="manager-task-drop-summary-chip" data-task-drop-summary-chip>
                      <img class="manager-task-drop-summary-thumb" src={gatheringDropImage(drop)} alt="" />
                      <span class="manager-task-drop-summary-label" title={gatheringDropName(drop)}>{gatheringDropName(drop)}</span>
                      <strong class="manager-task-drop-summary-percent">{Math.max(1, Math.min(100, Math.floor(Number(drop?.dropRate ?? 1))))}%</strong>
                    </span>
                  {/each}
                </div>
              {/if}
            </section>

            <section class="manager-inspector-card manager-task-environment-usage-card" data-task-environment-usage>
              <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Environment.Tasks.UsedInEnvironmentsCard', 'Used in environments')}</h3>
              {#if gatheringTaskReferencingEnvironments(selectedGatheringTask).length === 0}
                <p class="manager-muted" data-task-environment-usage-empty>{text('FABRICATE.Admin.Manager.Environment.Tasks.NotUsedInEnvironments', 'Not used in any environments yet.')}</p>
              {:else}
                <div class="manager-task-environment-usage-grid" data-task-environment-usage-chips>
                  {#each gatheringTaskReferencingEnvironments(selectedGatheringTask) as environment (environment.id)}
                    <article class="manager-task-environment-usage-card">
                      <img class="manager-task-environment-usage-thumb" src={environmentImage(environment)} alt="" />
                      <span class="manager-task-environment-usage-name" title={environmentName(environment)}>{environmentName(environment)}</span>
                    </article>
                  {/each}
                </div>
              {/if}
            </section>
            {/if}

            {#if currentView === 'gathering-task-edit'}
            {#if selectedGatheringDrop}
            <div class="manager-drop-inspector-stack" data-gathering-task-drop-inspector>
            <section class="manager-inspector-card manager-drop-editor-header-card">
              <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Environment.Tasks.SelectedDrop', 'Selected drop rule')}</h3>
              <div class="manager-inspector-title-row">
                <img class="manager-recipe-preview" src={gatheringDropImage(selectedGatheringDrop)} alt="" />
                <div class="manager-inspector-copy">
                  <h2 class="manager-inspector-name">{gatheringDropName(selectedGatheringDrop)}</h2>
                  <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Tasks.ModifiersApplyOnlyThisDrop', 'Modifiers below apply only to this drop.')}</p>
                </div>
              </div>
              <div class="manager-drop-editor-actions">
                <button type="button" class="manager-button" aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.DuplicateDrop', 'Duplicate')} onclick={() => duplicateGatheringTaskDrop(selectedGatheringDrop.id)}>
                  <i class="fas fa-copy" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.DuplicateDrop', 'Duplicate')}</span>
                </button>
                <button type="button" class="manager-button is-danger" aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.DeleteDrop', 'Delete')} onclick={() => deleteGatheringTaskDrop(selectedGatheringDrop.id)}>
                  <i class="fas fa-trash" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.DeleteDrop', 'Delete')}</span>
                </button>
              </div>
            </section>

            <div class="manager-drop-inspector-divider" aria-hidden="true"></div>

            <div class="manager-drop-inspector-scroll">
            <section class="manager-inspector-card manager-drop-editor-card">
              <div class="manager-drop-editor-values">
                <label class="manager-field manager-drop-rate-editor" data-gathering-drop-inspector-rate>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.DropChance', 'Drop chance')}</span>
                  <span class="manager-drop-rate-value">
                    <span class="manager-drop-rate-percent">
                      <input type="text" inputmode="numeric" pattern="[0-9]*" value={gatheringDropRateValue(selectedGatheringDrop)} aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.DropChancePercent', 'Drop chance percent')} oninput={(event) => onGatheringDropRateInput(selectedGatheringDrop.id, event)} onblur={(event) => onGatheringDropRateBlur(selectedGatheringDrop, event)} onkeydown={(event) => onGatheringDropRateKeydown(selectedGatheringDrop, event)} />
                      <span aria-hidden="true">%</span>
                    </span>
                    <span class={`manager-drop-rate-control ${gatheringDropRateTierClass(selectedGatheringDrop.dropRate)}`} style={`--fab-drop-rate-value: ${gatheringDropRateValue(selectedGatheringDrop)}%; --fab-drop-rate-color: ${gatheringDropRateTierColor(selectedGatheringDrop.dropRate)};`}>
                      <span class="manager-drop-rate-track" aria-hidden="true">
                        <span class="manager-drop-rate-fill"></span>
                      </span>
                      <input type="range" min="0" max="100" step="1" value={gatheringDropRateValue(selectedGatheringDrop)} aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.DropChance', 'Drop chance')} oninput={(event) => updateGatheringTaskDrop(selectedGatheringDrop.id, { dropRate: Number(event.currentTarget.value) })} onkeydown={(event) => event.stopPropagation()} />
                    </span>
                  </span>
                </label>

                <label class="manager-field manager-drop-count-editor" data-gathering-drop-inspector-count>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.DropQuantityColumn', 'Count')}</span>
                  <input type="text" inputmode="numeric" pattern={'[1-9][0-9]{0,2}'} value={gatheringDropCountValue(selectedGatheringDrop)} aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.DropQuantityColumn', 'Count')} oninput={(event) => onGatheringDropCountInput(selectedGatheringDrop.id, event)} onblur={(event) => onGatheringDropCountBlur(selectedGatheringDrop, event)} onkeydown={(event) => onGatheringDropCountKeydown(selectedGatheringDrop, event)} />
                </label>
              </div>
            </section>

            {#each ['biome', 'timeOfDay', 'weather'] as kind (kind)}
              {@const cardTitle = gatheringModifierCardTitle(kind, 'task')}
              {@const cardHint = gatheringModifierCardHint(kind, 'task')}
              {@const availableConditions = gatheringConditionAvailableOptions(selectedGatheringDrop, kind)}
              {@const pickerSelection = gatheringDropModifierPickerSelection(kind)}
              {@const attachedModifiers = gatheringConditionModifierRows(selectedGatheringDrop, kind)}
              <section class="manager-inspector-card manager-drop-editor-condition-modifier-card" data-gathering-drop-condition-modifiers={kind}>
                <header class="manager-character-modifier-row-card-header">
                  <div class="manager-character-modifier-row-card-heading">
                    <h3 class="manager-card-title">{cardTitle}</h3>
                    <p class="manager-muted">{cardHint}</p>
                  </div>
                </header>
                <div class="manager-condition-modifier-add-row" data-gathering-drop-condition-modifier-picker={kind}>
                  <label class="manager-field manager-condition-modifier-picker">
                    <span class="visually-hidden">{text('FABRICATE.Admin.Manager.Environment.Tasks.ConditionPickerLabel', 'Condition')}</span>
                    <select
                      value={pickerSelection}
                      disabled={availableConditions.length === 0}
                      data-tooltip={availableConditions.length === 0 ? text('FABRICATE.Admin.Manager.Environment.Tasks.AllConditionsAdded', 'All conditions already added.') : null}
                      onchange={(event) => setGatheringDropModifierPickerSelection(kind, event.currentTarget.value)}
                    >
                      {#each availableConditions as option (option.id)}
                        <option value={option.id}>{option.label || option.id}</option>
                      {/each}
                    </select>
                  </label>
                  <button
                    type="button"
                    class="manager-icon-button"
                    aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.AddConditionModifier', 'Add modifier')}
                    title={text('FABRICATE.Admin.Manager.Environment.Tasks.AddConditionModifier', 'Add modifier')}
                    disabled={availableConditions.length === 0 || !pickerSelection}
                    data-tooltip={availableConditions.length === 0 ? text('FABRICATE.Admin.Manager.Environment.Tasks.AllConditionsAdded', 'All conditions already added.') : null}
                    onclick={() => addGatheringDropModifier(selectedGatheringDrop.id, kind, pickerSelection)}
                  >
                    <i class="fas fa-plus" aria-hidden="true"></i>
                  </button>
                </div>
                <div class="manager-condition-modifier-row-list">
                  {#each attachedModifiers as modifier (modifier.id)}
                    <article class={`manager-condition-modifier-row-reference ${gatheringModifierValueClass(modifier)}`} data-gathering-drop-modifier-id={modifier.id}>
                      <header class="manager-character-modifier-row-reference-header">
                        <span class="manager-character-modifier-icon">
                          <i class={gatheringModifierKindIcon(kind, modifier.conditionId)} aria-hidden="true"></i>
                        </span>
                        <span class="manager-character-modifier-row-reference-label">{gatheringConditionLabel(kind, modifier.conditionId) || modifier.conditionId}</span>
                        <label class="manager-condition-modifier-value">
                          <span class="visually-hidden">{text('FABRICATE.Admin.Manager.Environment.Tasks.ModifierValue', 'Modifier value')}</span>
                          <input
                            type="text"
                            inputmode="numeric"
                            value={gatheringModifierDisplayValue(modifier)}
                            aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.ModifierValue', 'Modifier value')}
                            oninput={(event) => updateGatheringDropModifier(selectedGatheringDrop.id, kind, modifier.id, signedToOperatorValue(event.currentTarget.value))}
                            onkeydown={(event) => onGatheringDropModifierKeydown(selectedGatheringDrop.id, kind, modifier, event)}
                          />
                          <span aria-hidden="true">%</span>
                        </label>
                        <button
                          type="button"
                          class="manager-icon-button is-danger manager-character-modifier-row-reference-delete"
                          aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.DeleteModifier', 'Delete modifier')}
                          onclick={() => deleteGatheringDropModifier(selectedGatheringDrop.id, kind, modifier.id)}
                        >
                          <i class="fas fa-trash" aria-hidden="true"></i>
                        </button>
                      </header>
                    </article>
                  {:else}
                    <p class="manager-muted manager-condition-modifier-row-empty">{text('FABRICATE.Admin.Manager.Environment.Tasks.NoConditionModifiers', 'No modifiers attached.')}</p>
                  {/each}
                </div>
              </section>
            {/each}

            <section class="manager-inspector-card manager-character-modifier-row-card" data-gathering-drop-character-modifiers>
              <header class="manager-character-modifier-row-card-header">
                <div class="manager-character-modifier-row-card-heading">
                  <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RowSectionTitle', 'Character modifiers')}</h3>
                  <p class="manager-muted">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RowSectionHint', 'Modifiers adjust the final chance based on the attempting character.')}</p>
                </div>
              </header>
              <div class="manager-character-modifier-add-search-row">
                <label bind:this={characterModifierSearchAnchor} class="manager-search is-compact manager-character-modifier-add-search" data-gathering-drop-character-modifier-search>
                  <i class="fas fa-search" aria-hidden="true"></i>
                  <input type="search"
                         value={characterModifierSearchTerm}
                         oninput={(event) => { characterModifierSearchTerm = event.currentTarget.value; }}
                         placeholder={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.AddSearchPlaceholder', 'Search character modifiers...')}
                         aria-label={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.AddSearchLabel', 'Search character modifiers to add')}
                         disabled={selectedGatheringCharacterModifiers.length === 0}
                         data-tooltip={selectedGatheringCharacterModifiers.length === 0 ? text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.LibraryEmptyHint', 'Add a modifier to the system library first to reference it here.') : null} />
                  {#if characterModifierSearchSuggestions.length > 0}
                    <div class="manager-tag-suggestions manager-character-modifier-add-suggestions" class:is-above={characterModifierSearchOpenUp} data-gathering-drop-character-modifier-suggestions>
                      {#each characterModifierSearchSuggestions as option (option.id)}
                        <button type="button"
                                class="manager-tag-suggestion manager-character-modifier-add-suggestion"
                                data-gathering-drop-character-modifier-suggestion={option.id}
                                onclick={() => pickCharacterModifierForRow(selectedGatheringDrop.id, option.id)}>
                          <i class={option.icon || 'fa-solid fa-user'} aria-hidden="true"></i>
                          <span>{option.label || option.id}</span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                </label>
              </div>
              <div class="manager-character-modifier-row-list">
                {#each rowCharacterModifiers(selectedGatheringDrop) as ref (ref.id)}
                  {@const libraryEntry = characterModifierLibraryEntry(ref.modifierId)}
                  {@const hasOverride = characterModifierIsCustomized(ref)}
                  {@const operatorClass = characterModifierOperatorClass(ref.operator)}
                  <article class="manager-character-modifier-row-reference" data-gathering-drop-character-modifier-ref={ref.id}>
                    <header class="manager-character-modifier-row-reference-header">
                      <span class="manager-character-modifier-icon"><i class={characterModifierIconForRef(ref)} aria-hidden="true"></i></span>
                      <span class="manager-character-modifier-row-reference-label">{characterModifierLabelForRef(ref)}</span>
                      {#if !libraryEntry}
                        <span class="manager-character-modifier-stale-warning" data-tooltip={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.UnknownModifier', 'Unknown modifier ({id})').replace('{id}', ref.modifierId)}>
                          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                        </span>
                      {/if}
                      <label class={`manager-character-modifier-operator-select ${operatorClass}`}>
                        <span class="visually-hidden">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Operator', 'Operator')}</span>
                        <select value={ref.operator || '+'} onchange={(event) => onUpdateDropCharacterModifier(selectedGatheringDrop.id, ref.id, { operator: event.currentTarget.value })}>
                          <option value="+">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OperatorPositive', 'Positive')}</option>
                          <option value="-">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OperatorNegative', 'Negative')}</option>
                        </select>
                      </label>
                      <button type="button" class="manager-icon-button is-danger manager-character-modifier-row-reference-delete" aria-label={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.DeleteRowReference', 'Delete character modifier reference')} onclick={() => onDeleteDropCharacterModifier(selectedGatheringDrop.id, ref.id)}>
                        <i class="fas fa-trash" aria-hidden="true"></i>
                      </button>
                    </header>
                    <div class="manager-character-modifier-row-bounds">
                      <label class="manager-field">
                        <span>{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Min', 'Min')}</span>
                        <input type="number" step="1" value={ref.min ?? ''} oninput={(event) => onUpdateDropCharacterModifier(selectedGatheringDrop.id, ref.id, { min: event.currentTarget.value === '' ? null : Number(event.currentTarget.value) })} />
                      </label>
                      <label class="manager-field">
                        <span>{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Max', 'Max')}</span>
                        <input type="number" step="1" value={ref.max ?? ''} oninput={(event) => onUpdateDropCharacterModifier(selectedGatheringDrop.id, ref.id, { max: event.currentTarget.value === '' ? null : Number(event.currentTarget.value) })} />
                      </label>
                    </div>
                    <div class="manager-character-modifier-override-row">
                      <button
                        type="button"
                        class={`manager-status-toggle ${hasOverride ? 'is-on' : 'is-off'}`}
                        aria-pressed={hasOverride}
                        aria-label={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideToggle', 'Override?')}
                        onclick={() => setCharacterModifierOverrideEnabled(selectedGatheringDrop.id, ref, !hasOverride, libraryEntry)}
                      >
                        <span class="manager-status-toggle-track" aria-hidden="true">
                          <span class="manager-status-toggle-knob"></span>
                        </span>
                        <span class="manager-status-toggle-label">
                          {hasOverride
                            ? text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideToggleOn', 'Overridden')
                            : text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideToggle', 'Override?')}
                        </span>
                      </button>
                    </div>
                    {#if hasOverride}
                      <p class="manager-muted manager-character-modifier-override-hint">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideHint', 'Overrides the library expression for this row.')}</p>
                      <label class="manager-field" for={`drop-${selectedGatheringDrop.id}-character-modifier-${ref.id}-expression`}>
                        <span>{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Expression', 'Expression')}</span>
                        <input
                          type="text"
                          id={`drop-${selectedGatheringDrop.id}-character-modifier-${ref.id}-expression`}
                          value={ref.expressionOverride || ''}
                          oninput={(event) => onUpdateDropCharacterModifier(selectedGatheringDrop.id, ref.id, { expressionOverride: event.currentTarget.value })}
                        />
                      </label>
                    {/if}
                  </article>
                {:else}
                  <p class="manager-muted manager-character-modifier-row-empty">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RowEmpty', 'No character modifiers attached.')}</p>
                {/each}
              </div>
            </section>
            </div>
            </div>
            {:else}
            <section class="manager-inspector-card" data-gathering-task-drop-inspector>
              <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Environment.Tasks.SelectedDrop', 'Selected drop rule')}</h3>
              <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Tasks.NoDrops', 'No drops have been added.')}</p>
            </section>
            {/if}
            {/if}

          {:else}
            <div class="manager-empty">
              <div>
                <i class="fas fa-list-check" aria-hidden="true"></i>
                <h3>{text('FABRICATE.Admin.Manager.Environment.Tasks.SelectTask', 'Select a gathering task')}</h3>
                <p>{text('FABRICATE.Admin.Manager.Environment.Tasks.InspectorHint', 'The inspector shows gathering task availability, active environment matches, and drop summaries for the selected row.')}</p>
              </div>
            </div>
          {/if}
        {:else if (currentView === 'environments' && activeGatheringTab === 'encounters') || currentView === 'gathering-event-edit'}
          {#if currentView === 'gathering-event-edit' && editingGatheringEvent}
            <div class="manager-drop-inspector-stack" data-gathering-event-inspector-stack>
              <div class="manager-drop-inspector-scroll">
              {#each ['biome', 'timeOfDay', 'weather'] as kind (kind)}
                {@const cardTitle = gatheringModifierCardTitle(kind, 'event')}
                {@const cardHint = gatheringModifierCardHint(kind, 'event')}
                {@const availableConditions = gatheringConditionAvailableOptions(editingGatheringEvent, kind)}
                {@const pickerSelection = gatheringEventModifierPickerSelection(kind)}
                {@const attachedModifiers = gatheringConditionModifierRows(editingGatheringEvent, kind)}
                <section class="manager-inspector-card manager-drop-editor-condition-modifier-card" data-gathering-event-condition-modifiers={kind}>
                  <header class="manager-character-modifier-row-card-header">
                    <div class="manager-character-modifier-row-card-heading">
                      <h3 class="manager-card-title">{cardTitle}</h3>
                      <p class="manager-muted">{cardHint}</p>
                    </div>
                  </header>
                  <div class="manager-condition-modifier-add-row" data-gathering-event-condition-modifier-picker={kind}>
                    <label class="manager-field manager-condition-modifier-picker">
                      <span class="visually-hidden">{text('FABRICATE.Admin.Manager.Environment.Tasks.ConditionPickerLabel', 'Condition')}</span>
                      <select
                        value={pickerSelection}
                        disabled={availableConditions.length === 0}
                        data-tooltip={availableConditions.length === 0 ? text('FABRICATE.Admin.Manager.Environment.Tasks.AllConditionsAdded', 'All conditions already added.') : null}
                        onchange={(event) => setGatheringEventModifierPickerSelection(kind, event.currentTarget.value)}
                      >
                        {#each availableConditions as option (option.id)}
                          <option value={option.id}>{option.label || option.id}</option>
                        {/each}
                      </select>
                    </label>
                    <button
                      type="button"
                      class="manager-icon-button"
                      aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.AddConditionModifier', 'Add modifier')}
                      title={text('FABRICATE.Admin.Manager.Environment.Tasks.AddConditionModifier', 'Add modifier')}
                      disabled={availableConditions.length === 0 || !pickerSelection}
                      data-tooltip={availableConditions.length === 0 ? text('FABRICATE.Admin.Manager.Environment.Tasks.AllConditionsAdded', 'All conditions already added.') : null}
                      onclick={() => addGatheringEventConditionModifier(kind, pickerSelection)}
                    >
                      <i class="fas fa-plus" aria-hidden="true"></i>
                    </button>
                  </div>
                  <div class="manager-condition-modifier-row-list">
                    {#each attachedModifiers as modifier (modifier.id)}
                      <article class={`manager-condition-modifier-row-reference ${gatheringModifierValueClass(modifier)}`} data-gathering-event-modifier-id={modifier.id}>
                        <header class="manager-character-modifier-row-reference-header">
                          <span class="manager-character-modifier-icon">
                            <i class={gatheringModifierKindIcon(kind, modifier.conditionId)} aria-hidden="true"></i>
                          </span>
                          <span class="manager-character-modifier-row-reference-label">{gatheringConditionLabel(kind, modifier.conditionId) || modifier.conditionId}</span>
                          <label class="manager-condition-modifier-value">
                            <span class="visually-hidden">{text('FABRICATE.Admin.Manager.Environment.Tasks.ModifierValue', 'Modifier value')}</span>
                            <input
                              type="text"
                              inputmode="numeric"
                              value={gatheringModifierDisplayValue(modifier)}
                              aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.ModifierValue', 'Modifier value')}
                              oninput={(event) => updateGatheringEventConditionModifier(kind, modifier.id, signedToOperatorValue(event.currentTarget.value))}
                              onkeydown={(event) => onGatheringEventModifierKeydown(kind, modifier, event)}
                            />
                            <span aria-hidden="true">%</span>
                          </label>
                          <button
                            type="button"
                            class="manager-icon-button is-danger manager-character-modifier-row-reference-delete"
                            aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.DeleteModifier', 'Delete modifier')}
                            onclick={() => deleteGatheringEventConditionModifier(kind, modifier.id)}
                          >
                            <i class="fas fa-trash" aria-hidden="true"></i>
                          </button>
                        </header>
                      </article>
                    {/each}
                  </div>
                </section>
              {/each}

              <section class="manager-inspector-card manager-character-modifier-row-card" data-gathering-event-character-modifiers>
                <header class="manager-character-modifier-row-card-header">
                  <div class="manager-character-modifier-row-card-heading">
                    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RowSectionTitle', 'Character modifiers')}</h3>
                    <p class="manager-muted">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RowSectionHint', 'Modifiers adjust the final chance based on the attempting character.')}</p>
                  </div>
                </header>
                <div class="manager-character-modifier-add-search-row">
                  <label bind:this={characterModifierSearchAnchor} class="manager-search is-compact manager-character-modifier-add-search" data-gathering-event-character-modifier-search>
                    <i class="fas fa-search" aria-hidden="true"></i>
                    <input
                      type="search"
                      value={characterModifierSearchTerm}
                      oninput={(event) => { characterModifierSearchTerm = event.currentTarget.value; }}
                      placeholder={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.AddSearchPlaceholder', 'Search character modifiers...')}
                      aria-label={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.AddSearchLabel', 'Search character modifiers to add')}
                      disabled={selectedGatheringCharacterModifiers.length === 0}
                      data-tooltip={selectedGatheringCharacterModifiers.length === 0 ? text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.LibraryEmptyHint', 'Add a modifier to the system library first to reference it here.') : null}
                    />
                    {#if eventCharacterModifierSearchSuggestions.length > 0}
                      <div class="manager-tag-suggestions manager-character-modifier-add-suggestions" class:is-above={characterModifierSearchOpenUp} data-gathering-event-character-modifier-suggestions>
                        {#each eventCharacterModifierSearchSuggestions as option (option.id)}
                          <button
                            type="button"
                            class="manager-tag-suggestion manager-character-modifier-add-suggestion"
                            data-gathering-event-character-modifier-suggestion={option.id}
                            onclick={() => pickCharacterModifierForEvent(option.id)}
                          >
                            <i class={option.icon || 'fa-solid fa-user'} aria-hidden="true"></i>
                            <span>{option.label || option.id}</span>
                          </button>
                        {/each}
                      </div>
                    {/if}
                  </label>
                </div>
                <div class="manager-character-modifier-row-list">
                  {#each rowCharacterModifiers(editingGatheringEvent) as ref (ref.id)}
                    {@const libraryEntry = characterModifierLibraryEntry(ref.modifierId)}
                    {@const hasOverride = characterModifierIsCustomized(ref)}
                    {@const operatorClass = characterModifierOperatorClass(ref.operator)}
                    <article class="manager-character-modifier-row-reference" data-gathering-event-character-modifier-ref={ref.id}>
                      <header class="manager-character-modifier-row-reference-header">
                        <span class="manager-character-modifier-icon"><i class={characterModifierIconForRef(ref)} aria-hidden="true"></i></span>
                        <span class="manager-character-modifier-row-reference-label">{characterModifierLabelForRef(ref)}</span>
                        {#if !libraryEntry}
                          <span class="manager-character-modifier-stale-warning" data-tooltip={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.UnknownModifier', 'Unknown modifier ({id})').replace('{id}', ref.modifierId)}>
                            <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                          </span>
                        {/if}
                        <label class={`manager-character-modifier-operator-select ${operatorClass}`}>
                          <span class="visually-hidden">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Operator', 'Operator')}</span>
                          <select value={ref.operator || '+'} onchange={(event) => onUpdateEventCharacterModifier(ref.id, { operator: event.currentTarget.value })}>
                            <option value="+">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OperatorPositive', 'Positive')}</option>
                            <option value="-">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OperatorNegative', 'Negative')}</option>
                          </select>
                        </label>
                        <button type="button" class="manager-icon-button is-danger manager-character-modifier-row-reference-delete" aria-label={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.DeleteRowReference', 'Delete character modifier reference')} onclick={() => onDeleteEventCharacterModifier(ref.id)}>
                          <i class="fas fa-trash" aria-hidden="true"></i>
                        </button>
                      </header>
                      <div class="manager-character-modifier-row-bounds">
                        <label class="manager-field">
                          <span>{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Min', 'Min')}</span>
                          <input type="number" step="1" value={ref.min ?? ''} oninput={(event) => onUpdateEventCharacterModifier(ref.id, { min: event.currentTarget.value === '' ? null : Number(event.currentTarget.value) })} />
                        </label>
                        <label class="manager-field">
                          <span>{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Max', 'Max')}</span>
                          <input type="number" step="1" value={ref.max ?? ''} oninput={(event) => onUpdateEventCharacterModifier(ref.id, { max: event.currentTarget.value === '' ? null : Number(event.currentTarget.value) })} />
                        </label>
                      </div>
                      <div class="manager-character-modifier-override-row">
                        <button
                          type="button"
                          class={`manager-status-toggle ${hasOverride ? 'is-on' : 'is-off'}`}
                          aria-pressed={hasOverride}
                          aria-label={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideToggle', 'Override?')}
                          onclick={() => setEventCharacterModifierOverrideEnabled(ref, !hasOverride, libraryEntry)}
                        >
                          <span class="manager-status-toggle-track" aria-hidden="true">
                            <span class="manager-status-toggle-knob"></span>
                          </span>
                          <span class="manager-status-toggle-label">
                            {hasOverride
                              ? text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideToggleOn', 'Overridden')
                              : text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideToggle', 'Override?')}
                          </span>
                        </button>
                      </div>
                      {#if hasOverride}
                        <p class="manager-muted manager-character-modifier-override-hint">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideHint', 'Overrides the library expression for this row.')}</p>
                        <label class="manager-field" for={`event-${editingGatheringEvent.id}-character-modifier-${ref.id}-expression`}>
                          <span>{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Expression', 'Expression')}</span>
                          <input
                            id={`event-${editingGatheringEvent.id}-character-modifier-${ref.id}-expression`}
                            type="text"
                            value={ref.expressionOverride || ''}
                            oninput={(event) => onUpdateEventCharacterModifier(ref.id, { expressionOverride: event.currentTarget.value })}
                          />
                        </label>
                      {/if}
                    </article>
                  {:else}
                    <p class="manager-muted manager-character-modifier-row-empty">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RowEmpty', 'No character modifiers attached.')}</p>
                  {/each}
                </div>
              </section>
              </div>
            </div>
          {:else if selectedGatheringEvent && currentView !== 'gathering-event-edit'}
            <section class="manager-inspector-card" data-gathering-event-inspector>
              <div class="manager-inspector-title-row is-hero-large">
                <img class="manager-recipe-preview" src={selectedGatheringEvent.img || DEFAULT_GATHERING_EVENT_IMG} alt="" />
                <div class="manager-inspector-copy">
                  <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Environment.Events.Selected', 'Selected gathering event')}</p>
                  <h2 class="manager-inspector-name" title={selectedGatheringEvent.name || ''}>{selectedGatheringEvent.name || text('FABRICATE.Admin.Manager.Environment.Events.UnnamedEvent', 'Unnamed event')}</h2>
                  <div class="manager-chip-row">
                    <span class={`manager-chip ${selectedGatheringEvent.enabled === false ? 'is-disabled' : 'is-active'}`}>
                      {selectedGatheringEvent.enabled === false ? text('FABRICATE.Admin.Manager.StatusDisabled', 'Disabled') : text('FABRICATE.Admin.Manager.StatusActive', 'Active')}
                    </span>
                    {#if Array.isArray(selectedGatheringEvent.dangerTags) && selectedGatheringEvent.dangerTags.length > 0}
                      <span class="manager-chip">{sortedDangerTags(selectedGatheringEvent.dangerTags).join(', ')}</span>
                    {/if}
                  </div>
                </div>
              </div>

              <p class="manager-muted">
                {truncateDescription(selectedGatheringEvent.description) || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
              </p>
            </section>

            <section class="manager-inspector-card">
              <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Environment.Events.Details', 'Event details')}</h3>
              <div class="manager-fact-grid">
                <div class="manager-fact" data-gathering-event-fact="biomes">
                  <span class="manager-fact-line"><strong>{Array.isArray(selectedGatheringEvent.biomes) && selectedGatheringEvent.biomes.length > 0 ? selectedGatheringEvent.biomes.length : text('FABRICATE.Admin.Manager.Environment.Events.AnyBiome', 'Any biome')}</strong>{#if Array.isArray(selectedGatheringEvent.biomes) && selectedGatheringEvent.biomes.length > 0}{' '}<span class="manager-fact-label">{text('FABRICATE.Admin.Manager.Environment.Biome', 'Biome')}</span>{/if}</span>
                </div>
                <div class="manager-fact" data-gathering-event-fact="drop-rate">
                  <span class="manager-fact-line"><strong>{(() => {
                    const rate = Number(selectedGatheringEvent.dropRate);
                    if (!Number.isFinite(rate)) return '—';
                    return `${Math.max(1, Math.min(100, Math.floor(rate)))}%`;
                  })()}</strong> <span class="manager-fact-label">{text('FABRICATE.Admin.Manager.Environment.Events.DropRate', 'Drop rate')}</span></span>
                </div>
                <div class="manager-fact" data-gathering-event-fact="environments">
                  <span class="manager-fact-line"><strong>{(() => {
                    if (!selectedGatheringEvent?.id) return 0;
                    const eventId = String(selectedGatheringEvent.id);
                    return environmentList.filter(env => {
                      if (String(env?.craftingSystemId || '') !== String(selectedSystemId || '')) return false;
                      const ids = Array.isArray(env?.enabledEventIds) ? env.enabledEventIds.map(String) : [];
                      return ids.includes(eventId);
                    }).length;
                  })()}</strong> <span class="manager-fact-label">{text('FABRICATE.Admin.Manager.Environment.Events.ActiveEnvironments', 'Active environments')}</span></span>
                </div>
              </div>
            </section>

            <section class="manager-inspector-card manager-event-environment-usage-card" data-event-environment-usage>
              <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Environment.Events.UsedInEnvironmentsCard', 'Used in environments')}</h3>
              {#if gatheringEventReferencingEnvironments(selectedGatheringEvent).length === 0}
                <p class="manager-muted" data-event-environment-usage-empty>{text('FABRICATE.Admin.Manager.Environment.Events.NotUsedInEnvironments', 'Not used in any environments yet.')}</p>
              {:else}
                <div class="manager-event-environment-usage-grid" data-event-environment-usage-chips>
                  {#each gatheringEventReferencingEnvironments(selectedGatheringEvent) as environment (environment.id)}
                    <article class="manager-event-environment-usage-card">
                      <img class="manager-event-environment-usage-thumb" src={environmentImage(environment)} alt="" />
                      <span class="manager-event-environment-usage-name" title={environmentName(environment)}>{environmentName(environment)}</span>
                    </article>
                  {/each}
                </div>
              {/if}
            </section>
          {:else if currentView !== 'gathering-event-edit'}
            <div class="manager-empty">
              <div>
                <i class="fas fa-masks-theater" aria-hidden="true"></i>
                <h3>{text('FABRICATE.Admin.Manager.Environment.Events.SelectEvent', 'Select a gathering event')}</h3>
                <p>{text('FABRICATE.Admin.Manager.Environment.Events.InspectorHint', 'The inspector shows event availability, danger tags, drop rate, and active environment usage for the selected row.')}</p>
              </div>
            </div>
          {/if}
        {:else if currentView === 'environments' && activeGatheringTab === 'settings'}
          <section class="manager-inspector-card manager-gathering-rules-card" data-gathering-inspector-rules>
            <div class="manager-inspector-title-row">
              <span class="manager-inspector-icon" aria-hidden="true">
                <i class="fas fa-scale-balanced"></i>
              </span>
              <div class="manager-inspector-copy">
                <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Environment.Rules.Kicker', 'Gathering rules')}</p>
                <h2 class="manager-inspector-name">{text('FABRICATE.Admin.Manager.Environment.Rules.Title', 'Rules')}</h2>
              </div>
            </div>

            <div class="manager-rules-stack">
              <div class="manager-rule-row">
                <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-gift"></i></span>
                <label class="manager-rule-copy" for="manager-gathering-rule-rewards">
                  <strong>{text('FABRICATE.Admin.Manager.Environment.Rules.Rewards', 'Rewards')}</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Rules.RewardsDescription', 'Choose how rewards are granted.')}</span>
                </label>
                <span class="manager-rule-field">
                  <select id="manager-gathering-rule-rewards" value={selectedGatheringRules.rewardSelectionMode} onchange={(event) => updateSelectedGatheringRules({ rewardSelectionMode: event.target.value })}>
                    <option value="highestRankedDrop">{text('FABRICATE.Admin.Manager.Environment.Rules.HighestRankedDrop', 'Highest ranked successful drop')}</option>
                    <option value="allDrops">{text('FABRICATE.Admin.Manager.Environment.Rules.AllDrops', 'All successful drops')}</option>
                    <option value="limitedDrops">{text('FABRICATE.Admin.Manager.Environment.Rules.LimitedDrops', 'Limit successful drops')}</option>
                  </select>
                </span>
              </div>
              {#if selectedGatheringRules.rewardSelectionMode === 'limitedDrops'}
                <div class="manager-rule-stepper" data-gathering-rule-stepper="rewardLimit">
                  <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Environment.Rules.DecreaseRewardLimit', 'Decrease reward limit')} onclick={() => adjustGatheringRuleLimit('rewardLimit', -1)}><i class="fas fa-minus" aria-hidden="true"></i></button>
                  <input type="number" min="1" step="1" value={selectedGatheringRules.rewardLimit} aria-label={text('FABRICATE.Admin.Manager.Environment.Rules.RewardLimit', 'Reward limit')} oninput={(event) => updateSelectedGatheringRules({ rewardLimit: Number(event.target.value || 1) })} />
                  <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Environment.Rules.IncreaseRewardLimit', 'Increase reward limit')} onclick={() => adjustGatheringRuleLimit('rewardLimit', 1)}><i class="fas fa-plus" aria-hidden="true"></i></button>
                </div>
              {/if}

              <div class="manager-rule-row">
                <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-percent"></i></span>
                <label class="manager-rule-copy" for="manager-gathering-rule-drop-modifier-mode">
                  <strong>{text('FABRICATE.Admin.Manager.Environment.Rules.DropModifierMode', 'Modifier mode')}</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Rules.DropModifierModeDescription', 'Choose how all drop and event modifiers (character, weather, time of day, biome) adjust a chance. This applies system-wide and cannot be overridden per modifier.')}</span>
                </label>
                <span class="manager-rule-field">
                  <select id="manager-gathering-rule-drop-modifier-mode" value={selectedGatheringRules.dropModifierMode ?? 'additive'} onchange={(event) => updateSelectedGatheringRules({ dropModifierMode: event.target.value })}>
                    <option value="additive">{text('FABRICATE.Admin.Manager.Environment.Rules.DropModifierModeAdditive', 'Additive (percentage points)')}</option>
                    <option value="multiplicative">{text('FABRICATE.Admin.Manager.Environment.Rules.DropModifierModeMultiplicative', 'Multiplicative (scale by percentage)')}</option>
                  </select>
                </span>
              </div>

              <div class="manager-rule-row">
                <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-masks-theater"></i></span>
                <label class="manager-rule-copy" for="manager-gathering-rule-events">
                  <strong>{text('FABRICATE.Admin.Manager.Environment.Rules.Events', 'Events')}</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Rules.EventsDescription', 'Choose how matching events are applied after a gathering roll.')}</span>
                </label>
                <span class="manager-rule-field">
                  <select id="manager-gathering-rule-events" value={selectedGatheringRules.eventSelectionMode} onchange={(event) => updateSelectedGatheringRules({ eventSelectionMode: event.target.value })}>
                    <option value="highestRankedDrop">{text('FABRICATE.Admin.Manager.Environment.Rules.EventHighestRankedDrop', 'Highest ranked triggered event')}</option>
                    <option value="allDrops">{text('FABRICATE.Admin.Manager.Environment.Rules.EventAllDrops', 'All triggered events')}</option>
                    <option value="limitedDrops">{text('FABRICATE.Admin.Manager.Environment.Rules.EventLimitedDrops', 'Limit triggered events')}</option>
                  </select>
                </span>
              </div>
              {#if selectedGatheringRules.eventSelectionMode === 'limitedDrops'}
                <div class="manager-rule-stepper" data-gathering-rule-stepper="eventLimit">
                  <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Environment.Rules.DecreaseEventLimit', 'Decrease event limit')} onclick={() => adjustGatheringRuleLimit('eventLimit', -1)}><i class="fas fa-minus" aria-hidden="true"></i></button>
                  <input type="number" min="1" step="1" value={selectedGatheringRules.eventLimit} aria-label={text('FABRICATE.Admin.Manager.Environment.Rules.EventLimit', 'Event limit')} oninput={(event) => updateSelectedGatheringRules({ eventLimit: Number(event.target.value || 1) })} />
                  <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Environment.Rules.IncreaseEventLimit', 'Increase event limit')} onclick={() => adjustGatheringRuleLimit('eventLimit', 1)}><i class="fas fa-plus" aria-hidden="true"></i></button>
                </div>
              {/if}

              <div class="manager-rule-row">
                <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-scale-balanced"></i></span>
                <label class="manager-rule-copy" for="manager-gathering-rule-outcome">
                  <strong>{text('FABRICATE.Admin.Manager.Environment.Rules.EventOutcome', 'Event outcome')}</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Rules.EventOutcomeDescription', 'Decide whether rolling an event still allows the gathering attempt to succeed.')}</span>
                </label>
                <span class="manager-rule-field">
                  <select id="manager-gathering-rule-outcome" value={selectedGatheringRules.eventPolicy} onchange={(event) => updateSelectedGatheringRules({ eventPolicy: event.target.value })}>
                    <option value="successWithEvent">{text('FABRICATE.Admin.Manager.Environment.Rules.GatheringSucceeds', 'Gathering succeeds')}</option>
                    <option value="failureWithEvent">{text('FABRICATE.Admin.Manager.Environment.Rules.GatheringFails', 'Gathering fails')}</option>
                  </select>
                </span>
              </div>

              <div class="manager-rule-row">
                <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-eye"></i></span>
                <label class="manager-rule-copy" for="manager-gathering-rule-event-visibility">
                  <strong>{text('FABRICATE.Admin.Manager.Environment.Rules.EventVisibility', 'Event visibility')}</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Rules.EventVisibilityDescription', 'Control how much event information players see.')}</span>
                </label>
                <span class="manager-rule-field">
                  <select id="manager-gathering-rule-event-visibility" value={selectedGatheringRules.eventVisibility ?? 'encounterChance'} onchange={(event) => updateSelectedGatheringRules({ eventVisibility: event.target.value })}>
                    <option value="dangerLevelOnly">{text('FABRICATE.Admin.Manager.Environment.Rules.EventVisibilityDangerOnly', 'Danger level only')}</option>
                    <option value="encounterChance">{text('FABRICATE.Admin.Manager.Environment.Rules.EventVisibilityEncounter', 'Encounter chance')}</option>
                    <option value="full">{text('FABRICATE.Admin.Manager.Environment.Rules.EventVisibilityFull', 'Full details')}</option>
                  </select>
                </span>
              </div>

              <div class="manager-rule-row">
                <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-screwdriver-wrench"></i></span>
                <label class="manager-rule-copy" for="manager-gathering-rule-tool-breakage">
                  <strong>{text('FABRICATE.Admin.Manager.Environment.Rules.ToolBreakageOutcome', 'Tool breakage outcome')}</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Rules.ToolBreakageDescription', 'Decide whether a broken tool fails the gathering attempt or only reports the breakage.')}</span>
                </label>
                <span class="manager-rule-field">
                  <select id="manager-gathering-rule-tool-breakage" value={selectedGatheringRules.toolBreakagePolicy ?? 'failureOnBreak'} onchange={(event) => updateSelectedGatheringRules({ toolBreakagePolicy: event.target.value })}>
                    <option value="failureOnBreak">{text('FABRICATE.Admin.Manager.Environment.Rules.ToolFailureOnBreak', 'Attempt fails on break')}</option>
                    <option value="successDespiteBreak">{text('FABRICATE.Admin.Manager.Environment.Rules.ToolSuccessDespiteBreak', 'Attempt succeeds despite break')}</option>
                  </select>
                </span>
              </div>

              <div class="manager-rule-row">
                <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-mountain-sun"></i></span>
                <label class="manager-rule-copy" for="manager-gathering-rule-biome-aggregation">
                  <strong>{text('FABRICATE.Admin.Manager.Environment.Rules.BiomeModifiers', 'Biome modifiers')}</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Rules.BiomeModifiersDescription', "Decide how multiple matching biome modifiers combine into one drop-rate adjustment.")}</span>
                </label>
                <span class="manager-rule-field">
                  <select id="manager-gathering-rule-biome-aggregation" value={selectedGatheringRules.biomeModifierAggregation ?? 'strongestOfEach'} onchange={(event) => updateSelectedGatheringRules({ biomeModifierAggregation: event.target.value })}>
                    <option value="strongestOfEach">{text('FABRICATE.Admin.Manager.Environment.Rules.BiomeAggregationStrongestOfEach', 'Strongest of each')}</option>
                    <option value="cumulative">{text('FABRICATE.Admin.Manager.Environment.Rules.BiomeAggregationCumulative', 'Cumulative')}</option>
                    <option value="dominant">{text('FABRICATE.Admin.Manager.Environment.Rules.BiomeAggregationDominant', 'Dominant biome')}</option>
                  </select>
                </span>
              </div>

              <div class="manager-rule-row">
                <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-eye-slash"></i></span>
                <label class="manager-rule-copy" for="manager-gathering-rule-blind-gate">
                  <strong>{text('FABRICATE.Admin.Manager.Environment.Rules.BlindCandidateGate', 'Blind candidate gate')}</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Rules.BlindCandidateGateDescription', 'In blind mode, choose whether the generic gather only resolves to tasks the character can attempt, or to any matching task.')}</span>
                </label>
                <span class="manager-rule-field">
                  <select id="manager-gathering-rule-blind-gate" value={selectedGatheringRules.blindCandidateGate ?? 'attemptableOnly'} onchange={(event) => updateSelectedGatheringRules({ blindCandidateGate: event.target.value })}>
                    <option value="attemptableOnly">{text('FABRICATE.Admin.Manager.Environment.Rules.BlindGateAttemptableOnly', 'Only attemptable tasks')}</option>
                    <option value="allMatching">{text('FABRICATE.Admin.Manager.Environment.Rules.BlindGateAllMatching', 'Any matching task')}</option>
                  </select>
                </span>
              </div>

              <div class="manager-rule-row">
                <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-wand-sparkles"></i></span>
                <label class="manager-rule-copy" for="manager-gathering-rule-reveal-policy">
                  <strong>{text('FABRICATE.Admin.Manager.Environment.Rules.RevealPolicy', 'Blind reveal')}</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Rules.RevealPolicyDescription', 'Decide whether a blind task is revealed to the player after they attempt it.')}</span>
                </label>
                <span class="manager-rule-field">
                  <select id="manager-gathering-rule-reveal-policy" value={selectedGatheringRules.revealPolicy ?? 'never'} onchange={(event) => updateSelectedGatheringRules({ revealPolicy: event.target.value })}>
                    <option value="never">{text('FABRICATE.Admin.Manager.Environment.Rules.RevealNever', 'Never reveal')}</option>
                    <option value="onSuccess">{text('FABRICATE.Admin.Manager.Environment.Rules.RevealOnSuccess', 'Reveal on success')}</option>
                    <option value="onAttempt">{text('FABRICATE.Admin.Manager.Environment.Rules.RevealOnAttempt', 'Reveal on any attempt')}</option>
                  </select>
                </span>
              </div>

              <div class="manager-rule-row">
                <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-users-viewfinder"></i></span>
                <label class="manager-rule-copy" for="manager-gathering-rule-reveal-scope">
                  <strong>{text('FABRICATE.Admin.Manager.Environment.Rules.RevealScope', 'Reveal scope')}</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Rules.RevealScopeDescription', 'Who learns the revealed task: just the actor, the controlling user, the party, or everyone.')}</span>
                </label>
                <span class="manager-rule-field">
                  <select id="manager-gathering-rule-reveal-scope" value={selectedGatheringRules.revealScope ?? 'actor'} onchange={(event) => updateSelectedGatheringRules({ revealScope: event.target.value })}>
                    <option value="actor">{text('FABRICATE.Admin.Manager.Environment.Rules.RevealScopeActor', 'Actor')}</option>
                    <option value="user">{text('FABRICATE.Admin.Manager.Environment.Rules.RevealScopeUser', 'User')}</option>
                    <option value="party">{text('FABRICATE.Admin.Manager.Environment.Rules.RevealScopeParty', 'Party')}</option>
                    <option value="global">{text('FABRICATE.Admin.Manager.Environment.Rules.RevealScopeGlobal', 'Everyone')}</option>
                  </select>
                </span>
              </div>
            </div>
          </section>
        {:else if currentView === 'environments' && activeGatheringTab === 'travel'}
          <section class="manager-inspector-card manager-travel-inspector" data-gathering-inspector-travel data-travel-inspector={activeTravelTab}>
            {#if activeTravelTab === 'parties'}
              {#if selectedTravelParty}
                <div class="manager-inspector-title-row">
                  <span class="manager-inspector-icon" aria-hidden="true">
                    {#if selectedTravelParty.travelActor?.img}
                      <img class="manager-travel-parties-thumb" src={selectedTravelParty.travelActor.img} alt="" />
                    {:else}
                      <i class="fas fa-people-group"></i>
                    {/if}
                  </span>
                  <div class="manager-inspector-copy">
                    <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Travel.InspectorKicker', 'Selected party')}</p>
                    <h2 class="manager-inspector-name">{selectedTravelParty.name}</h2>
                  </div>
                </div>

                <section class="manager-inspector-card">
                  <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Travel.EvidenceLabel', 'Current realm')}</h3>
                  {#if selectedTravelParty.currentRealmEvidence.realms.length > 0}
                    <ul class="manager-travel-evidence-realms">
                      {#each selectedTravelParty.currentRealmEvidence.realms as realm (realm.id)}
                        <li>
                          {realm.name}
                          {#if !realm.enabled}
                            <span class="manager-chip is-disabled">{text('FABRICATE.Admin.Manager.Travel.DisabledRealmChip', 'Disabled')}</span>
                          {/if}
                        </li>
                      {/each}
                    </ul>
                  {:else}
                    <p class="manager-muted">{text('FABRICATE.Admin.Manager.Travel.EvidenceNoRealms', 'No current realm set for this system.')}</p>
                  {/if}
                </section>

                <div class="manager-travel-inspector-actions">
                  {#if selectedTravelParty.enabled}
                    <button
                      type="button"
                      class="manager-button manager-party-enable-toggle is-on"
                      disabled={$viewState.travelSaving === true}
                      onclick={() => store.setPartyEnabled?.(selectedTravelParty.id, false)}
                    >
                      <i class="fas fa-toggle-on" aria-hidden="true"></i>
                      <span>{text('FABRICATE.Admin.Manager.Travel.Parties.Disable', 'Disable')}</span>
                    </button>
                  {:else}
                    <button
                      type="button"
                      class="manager-button manager-party-enable-toggle is-off"
                      disabled={$viewState.travelSaving === true || !selectedTravelParty.travelActorUuid}
                      title={selectedTravelParty.travelActorUuid
                        ? undefined
                        : text('FABRICATE.Admin.Manager.Travel.Parties.EnableNeedsTravelActor', 'Assign a travel actor to enable this party.')}
                      onclick={() => store.setPartyEnabled?.(selectedTravelParty.id, true)}
                    >
                      <i class="fas fa-toggle-off" aria-hidden="true"></i>
                      <span>{text('FABRICATE.Admin.Manager.Travel.Parties.Enable', 'Enable')}</span>
                    </button>
                  {/if}
                  <button
                    type="button"
                    class="manager-button is-danger"
                    disabled={$viewState.travelSaving === true}
                    onclick={() => store.deleteParty?.(selectedTravelParty.id)}
                  >
                    <i class="fas fa-trash" aria-hidden="true"></i>
                    <span>{text('FABRICATE.Admin.Manager.Travel.Parties.Delete', 'Delete party')}</span>
                  </button>
                </div>
              {:else}
                <p class="manager-muted">{text('FABRICATE.Admin.Manager.Travel.Inspector.PartiesPlaceholder', 'Select a party to see its details.')}</p>
              {/if}
            {:else if activeTravelTab === 'realms'}
              {#if selectedTravelRealm}
                <div class="manager-inspector-title-row">
                  <span class="manager-inspector-icon" aria-hidden="true">
                    <i class="fas fa-map-location-dot"></i>
                  </span>
                  <div class="manager-inspector-copy">
                    <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Travel.Realms.InspectorKicker', 'Selected realm')}</p>
                    <h2 class="manager-inspector-name">{selectedTravelRealm.name}</h2>
                  </div>
                </div>

                <div class="manager-travel-inspector-actions">
                  <button
                    type="button"
                    class="manager-button is-danger"
                    disabled={$viewState.travelSaving === true}
                    onclick={() => store.deleteRealm?.(selectedSystemId, selectedTravelRealm.id)}
                  >
                    <i class="fas fa-trash" aria-hidden="true"></i>
                    <span>{text('FABRICATE.Admin.Manager.Travel.Realms.Delete', 'Delete realm')}</span>
                  </button>
                </div>

                <section class="manager-inspector-card">
                  <RealmNameField
                    name={selectedTravelRealm.name}
                    disabled={$viewState.travelSaving === true}
                    onRename={(name) => store.renameRealm?.(selectedSystemId, selectedTravelRealm.id, name)}
                  />
                </section>

                <section class="manager-inspector-card">
                  <h3 class="manager-card-title"><i class="fas fa-seedling" aria-hidden="true"></i> {text('FABRICATE.Admin.Manager.Travel.Realms.EnvironmentsCardTitle', 'Environments')}</h3>
                  {#if selectedTravelRealm.environments.length > 0}
                    <ul class="manager-travel-region-environments">
                      {#each selectedTravelRealm.environments as environment (environment.id)}
                        <li>
                          <span class="manager-travel-region-thumb" aria-hidden="true">
                            {#if environment.img}<img src={environment.img} alt="" />{:else}<i class="fas fa-seedling"></i>{/if}
                          </span>
                          <span class="manager-travel-region-item-name">{environment.name}</span>
                        </li>
                      {/each}
                    </ul>
                  {:else}
                    <p class="manager-muted">{text('FABRICATE.Admin.Manager.Travel.Realms.NoEnvironments', 'No environments include this realm yet.')}</p>
                  {/if}
                </section>

                <section class="manager-inspector-card">
                  <h3 class="manager-card-title"><i class="fas fa-people-group" aria-hidden="true"></i> {text('FABRICATE.Admin.Manager.Travel.Realms.PartiesCardTitle', 'Parties in this realm')}</h3>
                  {#if selectedTravelRealm.parties.length > 0}
                    <ul class="manager-travel-region-parties">
                      {#each selectedTravelRealm.parties as party (party.id)}
                        <li>
                          <span class="manager-travel-region-thumb" aria-hidden="true">
                            {#if party.img}<img src={party.img} alt="" />{:else}<i class="fas fa-people-group"></i>{/if}
                          </span>
                          <span class="manager-travel-region-item-name">{party.name}</span>
                        </li>
                      {/each}
                    </ul>
                  {:else}
                    <p class="manager-muted">{text('FABRICATE.Admin.Manager.Travel.Realms.NoParties', 'No parties are currently in this realm.')}</p>
                  {/if}
                </section>
              {:else}
                <p class="manager-muted">{text('FABRICATE.Admin.Manager.Travel.Inspector.RealmsPlaceholder', 'Select a realm to see its details.')}</p>
              {/if}
            {:else if activeTravelTab === 'map'}
              {#if selectedMapRegion}
                <section class="manager-inspector-card manager-map-link-region-card">
                  <div class="manager-inspector-title-row">
                    <span class="manager-inspector-icon manager-map-link-inspector-swatch" aria-hidden="true" style={selectedMapRegion.color ? `background:${selectedMapRegion.color};` : ''}></span>
                    <div class="manager-inspector-copy">
                      <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Travel.MapLinks.InspectorKicker', 'Selected map region')}</p>
                      <h2 class="manager-inspector-name">{selectedMapRegion.name || text('FABRICATE.Admin.Manager.Travel.MapLinks.UnnamedRegion', 'Unnamed region')}</h2>
                    </div>
                  </div>
                </section>

                <section class="manager-inspector-card">
                  <h3 class="manager-card-title"><i class="fas fa-link" aria-hidden="true"></i> {text('FABRICATE.Admin.Manager.Travel.MapLinks.LinkSectionTitle', 'Linked Fabricate realm')}</h3>
                  {#if selectedMapRegion.linkedRegionId}
                    {@const linkedRealm = travelSystemRealms.find(realm => realm.id === selectedMapRegion.linkedRegionId)}
                    <ul class="manager-travel-region-parties">
                      <li>
                        <span class="manager-travel-region-thumb" aria-hidden="true"><i class="fas fa-map-location-dot"></i></span>
                        <span class="manager-travel-region-item-name">{linkedRealm?.name || text('FABRICATE.Admin.Manager.Travel.MapLinks.Stale', 'Unknown realm')}</span>
                        {#if linkedRealm && !linkedRealm.enabled}
                          <span class="manager-chip is-disabled">{text('FABRICATE.Admin.Manager.Travel.DisabledChip', 'Disabled')}</span>
                        {/if}
                      </li>
                    </ul>
                  {:else}
                    <p class="manager-muted">{text('FABRICATE.Admin.Manager.Travel.MapLinks.NotLinked', 'This map region isn’t linked to a Fabricate realm.')}</p>
                  {/if}
                </section>

                <section class="manager-inspector-card">
                  <h3 class="manager-card-title"><i class="fas fa-map-location-dot" aria-hidden="true"></i> {text('FABRICATE.Admin.Manager.Travel.MapLinks.PartiesInMapRegionTitle', 'Parties in this map region')}</h3>
                  {#if selectedMapRegion.partiesInMapRegion?.length > 0}
                    <ul class="manager-travel-region-parties">
                      {#each selectedMapRegion.partiesInMapRegion as party (party.id)}
                        <li>
                          <span class="manager-travel-region-thumb" aria-hidden="true">
                            {#if party.img}<img src={party.img} alt="" />{:else}<i class="fas fa-people-group"></i>{/if}
                          </span>
                          <span class="manager-travel-region-item-name">{party.name}</span>
                        </li>
                      {/each}
                    </ul>
                  {:else}
                    <p class="manager-muted">{text('FABRICATE.Admin.Manager.Travel.MapLinks.NoPartiesInMapRegion', 'No party travel markers are in this map region.')}</p>
                  {/if}
                </section>

                <section class="manager-inspector-card">
                  <h3 class="manager-card-title"><i class="fas fa-people-group" aria-hidden="true"></i> {text('FABRICATE.Admin.Manager.Travel.MapLinks.PartiesInFabricateRegionTitle', 'Parties in this Fabricate realm')}</h3>
                  {#if !selectedMapRegion.linkedRegionId}
                    <p class="manager-muted">{text('FABRICATE.Admin.Manager.Travel.MapLinks.NotLinked', 'This map region isn’t linked to a Fabricate realm.')}</p>
                  {:else if selectedMapRegion.partiesInFabricateRealm?.length > 0}
                    <ul class="manager-travel-region-parties">
                      {#each selectedMapRegion.partiesInFabricateRealm as party (party.id)}
                        <li>
                          <span class="manager-travel-region-thumb" aria-hidden="true">
                            {#if party.img}<img src={party.img} alt="" />{:else}<i class="fas fa-people-group"></i>{/if}
                          </span>
                          <span class="manager-travel-region-item-name">{party.name}</span>
                        </li>
                      {/each}
                    </ul>
                  {:else}
                    <p class="manager-muted">{text('FABRICATE.Admin.Manager.Travel.MapLinks.NoPartiesInFabricateRegion', 'No parties are in this Fabricate realm.')}</p>
                  {/if}
                </section>
              {:else}
                <p class="manager-muted">{text('FABRICATE.Admin.Manager.Travel.Inspector.MapLinksPlaceholder', 'Select a region to map it to Scene Regions.')}</p>
              {/if}
            {/if}
          </section>
        {:else if currentView === 'environments' && activeGatheringInspectorTab}
          <section class="manager-inspector-card" data-gathering-inspector-placeholder={activeGatheringInspectorTab.id}>
            <div class="manager-inspector-title-row is-hero-large">
              <span class="manager-inspector-icon is-hero-large" aria-hidden="true">
                <i class={activeGatheringInspectorTab.icon}></i>
              </span>
              <div class="manager-inspector-copy">
                <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Environment.GatheringTabs.Label', 'Gathering sections')}</p>
                <h2 class="manager-inspector-name">
                  {text(activeGatheringInspectorTab.titleKey, activeGatheringInspectorTab.titleFallback)}
                </h2>
              </div>
            </div>
            <p class="manager-muted">
              {text(activeGatheringInspectorTab.hintKey, activeGatheringInspectorTab.hintFallback)}
            </p>
          </section>
        {:else if selectedEnvironment}
          <section class="manager-inspector-card">
            <img class={`manager-environment-preview ${hasEnvironmentImage(selectedEnvironment) ? '' : 'is-fallback'}`} src={environmentImage(selectedEnvironment)} alt="" />
            <div class="manager-inspector-copy">
              <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Environment.Selected', 'Selected environment')}</p>
              <h2 class="manager-inspector-name" title={environmentName(selectedEnvironment)}>{environmentName(selectedEnvironment)}</h2>
              <div class="manager-chip-row">
                <span class={`manager-chip ${selectedEnvironment.enabled === false ? 'is-disabled' : 'is-active'}`}>{environmentStatusLabel(selectedEnvironment)}</span>
                <span class="manager-chip">{environmentSelectionModeLabel(selectedEnvironment)}</span>
                <span class={`manager-chip ${selectedEnvironmentSceneState.className}`}>{selectedEnvironmentSceneState.label}</span>
              </div>
            </div>

            <p class="manager-muted">
              {truncateDescription(selectedEnvironment.description) || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
            </p>
          </section>

          <section class="manager-inspector-card">
            <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Environment.Details', 'Environment details')}</h3>
            <div class="manager-fact-grid">
              {#each selectedEnvironmentFacts as fact (fact.id)}
                <div class="manager-fact" data-environment-fact={fact.id}>
                  <span class="manager-fact-line"><strong>{fact.value}</strong> <span class="manager-fact-label">{fact.label}</span></span>
                </div>
              {/each}
              {#if selectedEnvironment.sceneUuid}
                <div class="manager-fact" data-environment-fact="scene">
                  <span class="manager-fact-line"><strong>{selectedEnvironmentSceneState.name || selectedEnvironment.sceneUuid}</strong> <span class="manager-fact-label">{text('FABRICATE.Admin.Manager.Environment.Scene', 'Scene')}</span></span>
                </div>
              {/if}
            </div>
          </section>

          {#if environmentDirtyFor(selectedEnvironment) || environmentInvalidFor(selectedEnvironment) || $viewState.environmentSaveError}
            <section class="manager-inspector-card">
              <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Environment.DraftState', 'Draft state')}</h3>
              <div class="manager-feature-list">
                {#if environmentDirtyFor(selectedEnvironment)}
                  <span class="manager-chip is-warning">{text('FABRICATE.Admin.Manager.Environment.Dirty', 'Unsaved')}</span>
                {/if}
                {#if environmentInvalidFor(selectedEnvironment)}
                  <span class="manager-chip is-danger">{text('FABRICATE.Admin.Manager.Environment.ValidationCount', '{count} validation issues').replace('{count}', environmentValidationCount)}</span>
                {/if}
              </div>
              {#if $viewState.environmentSaveError}
                <p class="manager-muted">{$viewState.environmentSaveError}</p>
              {/if}
            </section>
          {/if}

        {:else if environmentList.length === 0}
          <section class="manager-setup-card" aria-label={text('FABRICATE.Admin.Manager.Environment.EmptySetup.Title', 'Plan gathering content')}>
            <div class="manager-setup-card-header">
              <i class="fas fa-seedling" aria-hidden="true"></i>
              <div>
                <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Environment.EmptySetup.Kicker', 'Gathering setup')}</p>
                <h3>{text('FABRICATE.Admin.Manager.Environment.EmptySetup.Title', 'Plan gathering content')}</h3>
              </div>
            </div>
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.EmptySetup.Hint', 'Gathering tasks and events give environments consistent activities, risks, and rewards across gathering locations.')}</p>
            <ol class="manager-setup-list">
              <li>{text('FABRICATE.Admin.Manager.Environment.EmptySetup.StepTasks', 'Define gathering tasks with their checks, timing, result groups, and failure outcomes.')}</li>
              <li>{text('FABRICATE.Admin.Manager.Environment.EmptySetup.StepEvents', 'Prepare event options that can be reused across your locations.')}</li>
              <li>{text('FABRICATE.Admin.Manager.Environment.EmptySetup.StepCreate', 'Create environments after the gathering task and event libraries are ready to attach.')}</li>
            </ol>
            <div class="manager-setup-links" aria-label={text('FABRICATE.Admin.Manager.Environment.EmptySetup.Resources', 'Environment resources')}>
              <a class="manager-button" href="https://mistersilver-uk.github.io/fabricate/gathering-environments" target="_blank" rel="noreferrer">
                <i class="fas fa-book-open" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.Environment.EmptySetup.GatheringDocs', 'Gathering docs')}</span>
              </a>
              <a class="manager-button" href="https://mistersilver-uk.github.io/fabricate/quickstart" target="_blank" rel="noreferrer">
                <i class="fas fa-circle-question" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.Environment.EmptySetup.Quickstart', 'Quickstart')}</span>
              </a>
            </div>
          </section>
        {:else}
          <div class="manager-empty">
            <div>
              <i class="fas fa-seedling" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.Manager.Environment.SelectEnvironment', 'Select an environment')}</h3>
              <p>{text('FABRICATE.Admin.Manager.Environment.InspectorHint', 'The inspector shows scene imagery, task evidence, draft state, and existing actions for the selected row.')}</p>
            </div>
          </div>
        {/if}
      {:else if currentView === 'essences' || currentView === 'essence-edit'}
        {#if selectedEssenceForInspector}
          <section class="manager-inspector-card">
            <div class="manager-inspector-title-row is-hero-large">
              <span class="manager-inspector-icon is-hero-large" aria-hidden="true">
                <i class={selectedEssenceForInspector.icon || 'fas fa-mortar-pestle'}></i>
              </span>
              <div class="manager-inspector-copy">
                <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Essence.Selected', 'Selected essence')}</p>
                <h2 class="manager-inspector-name" title={selectedEssenceForInspector.name}>{selectedEssenceForInspector.name}</h2>
                <div class="manager-chip-row">
                  {#if selectedEssenceForInspector.deleteBlocked}
                    <span class="manager-chip is-warning">{text('FABRICATE.Admin.Manager.Essence.DeleteBlockedShort', 'In use')}</span>
                  {/if}
                </div>
              </div>
            </div>
            <p class="manager-muted">
              {truncateDescription(selectedEssenceForInspector.description) || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
            </p>
          </section>

          {#if currentView === 'essence-edit' && (essenceEditDirty || essenceEditSaving)}
            <section class="manager-inspector-card">
              <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Essence.DraftState', 'Draft state')}</h3>
              <div class="manager-feature-list">
                {#if essenceEditDirty}
                  <span class="manager-chip is-warning">{text('FABRICATE.Admin.Manager.Essence.Dirty', 'Unsaved')}</span>
                {/if}
                {#if essenceEditSaving}
                  <span class="manager-chip">{text('FABRICATE.Admin.Manager.Essence.Saving', 'Saving...')}</span>
                {/if}
              </div>
            </section>
          {/if}

          {#if showEssenceSourceUi && currentView !== 'essence-edit'}
          <section class="manager-inspector-card" data-essence-section="source">
            <div class="manager-edit-card-heading">
              <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Essence.Source', 'Source')}</h3>
            </div>
            {#if selectedEssenceForInspector.associatedItem}
              <div class="manager-essence-source-summary manager-essence-inspector-source-summary">
                <img class="manager-essence-source-thumb" src={selectedEssenceForInspector.associatedItem.img || 'icons/svg/item-bag.svg'} alt="" />
                <div class="manager-essence-source-copy">
                  <strong>{selectedEssenceForInspector.associatedItem.name || selectedEssenceForInspector.sourceName}</strong>
                </div>
              </div>
              <div class="manager-essence-inspector-source-actions">
                <button type="button" class="manager-button" data-essence-action="copy-source" title={selectedEssenceSourceUuid() || text('FABRICATE.Admin.Manager.Essence.SourceNoUuid', 'This component has no source item UUID.')} disabled={!selectedEssenceSourceUuid()} onclick={copySelectedEssenceSource}>
                  <i class="fas fa-copy" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.Manager.Essence.CopySource', 'Copy source UUID')}</span>
                </button>
                <button type="button" class="manager-button is-warning-action" data-essence-action="unlink-source" onclick={unlinkSelectedEssenceSource}>
                  <i class="fas fa-unlink" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.Manager.Essence.UnlinkSource', 'Unlink Source')}</span>
                </button>
              </div>
            {:else}
              <div class="manager-essence-source-drop-zone manager-essence-inspector-source-drop-zone">
                <EssenceSourceSelector
                  value={null}
                  items={selectedSystem?.managedItemOptions || []}
                  onDrop={handleInspectorEssenceSourceDrop}
                  onSelect={handleInspectorEssenceSourceSelect}
                  onClear={() => updateSelectedEssenceSource(null)}
                />
              </div>
            {/if}
          </section>
          {/if}

          <section class="manager-inspector-card" data-essence-section="usage">
            <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Essence.Usage', 'Usage')}</h3>
            <div class="manager-requirements-list">
              <div class="manager-requirement-row">
                <span>{text('FABRICATE.Admin.Manager.Essence.Usage', 'Usage')}</span>
                <strong>{text('FABRICATE.Admin.Manager.Essence.ComponentUsageCount', '{count} components').replace('{count}', selectedEssenceForInspector.componentUsageCount || 0)}</strong>
              </div>
            </div>
            {#if Array.isArray(selectedEssenceForInspector.componentUsageItems) && selectedEssenceForInspector.componentUsageItems.length > 0}
              <div class="manager-essence-usage-grid" aria-label={text('FABRICATE.Admin.Manager.Essence.ComponentUsageGrid', 'Components using this essence')}>
                {#each selectedEssenceForInspector.componentUsageItems as component (component.id)}
                  <button type="button" class="manager-essence-usage-item" title={component.name} aria-label={text('FABRICATE.Admin.Manager.Component.EditNamed', 'Edit {name}').replace('{name}', component.name)} onclick={() => editComponent(component.id)}>
                    <img src={componentImage(component)} alt="" />
                  </button>
                {/each}
              </div>
            {/if}
          </section>

          {#if selectedEssenceForInspector.deleteBlocked}
            <section class="manager-inspector-card">
              <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Essence.UsageBlockedTitle', 'Deletion blocked')}</h3>
              <p class="manager-muted">{text('FABRICATE.Admin.Manager.Essence.UsageBlockedHint', 'Remove this essence from components before deleting the definition.')}</p>
            </section>
          {/if}

        {:else if currentView === 'essences' && essenceCards.length === 0}
          <section class="manager-setup-card" aria-label={text('FABRICATE.Admin.Manager.Essence.EmptySetup.Title', 'Set up essences')}>
            <div class="manager-setup-card-header">
              <i class="fas fa-mortar-pestle" aria-hidden="true"></i>
              <div>
                <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Essence.EmptySetup.Kicker', 'Essence setup')}</p>
                <h3>{text('FABRICATE.Admin.Manager.Essence.EmptySetup.Title', 'Set up essences')}</h3>
              </div>
            </div>
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Essence.EmptySetup.Hint', 'Create the first essence definition for this system, then assign quantities to components that should contribute that essence.')}</p>
            <ol class="manager-setup-list">
              <li>{text('FABRICATE.Admin.Manager.Essence.EmptySetup.StepCreate', 'Create an essence with a clear name, icon, and description.')}</li>
              <li>{text('FABRICATE.Admin.Manager.Essence.EmptySetup.StepAssign', 'Edit components to assign essence quantities that recipes can require.')}</li>
              <li>{text('FABRICATE.Admin.Manager.Essence.EmptySetup.StepTransfer', 'If effect transfer is enabled, link source components whose effects should carry to crafted results.')}</li>
            </ol>
            <div class="manager-setup-links" aria-label={text('FABRICATE.Admin.Manager.Essence.EmptySetup.Resources', 'Essence resources')}>
              <a class="manager-button" href="https://mistersilver-uk.github.io/fabricate/essences" target="_blank" rel="noreferrer">
                <i class="fas fa-book-open" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.Essence.EmptySetup.EssenceDocs', 'Essence docs')}</span>
              </a>
              <a class="manager-button" href="https://mistersilver-uk.github.io/fabricate/effect-transfer" target="_blank" rel="noreferrer">
                <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.Essence.EmptySetup.EffectTransferDocs', 'Effect transfer')}</span>
              </a>
            </div>
          </section>
        {:else}
          <div class="manager-empty">
            <div>
              <i class="fas fa-mortar-pestle" aria-hidden="true"></i>
              <h3>{currentView === 'essence-edit'
                ? text('FABRICATE.Admin.Manager.Essence.CreateInspectorTitle', 'New essence draft')
                : text('FABRICATE.Admin.Manager.Essence.SelectEssence', 'Select an essence')}</h3>
              <p>{currentView === 'essence-edit'
                ? text('FABRICATE.Admin.Manager.Essence.CreateInspectorHint', 'The inspector will show the essence ID after the draft is saved.')
                : showEssenceSourceUi
                ? text('FABRICATE.Admin.Manager.Essence.InspectorHint', 'The inspector shows source linkage and component usage for the selected essence.')
                : text('FABRICATE.Admin.Manager.Essence.InspectorNoSourceHint', 'The inspector shows identity and component usage for the selected essence.')}</p>
            </div>
          </div>
        {/if}
      {:else if currentView === 'components'}
        {#if selectedComponent}
          <ComponentBrowserInspector
            {selectedComponent}
            showTags={showComponentTags}
            showEssences={showComponentEssences}
            onEdit={() => editComponent(selectedComponent?.id)}
            onCopySourceUuid={(uuid) => copyComponentSource(uuid)}
            onUnlink={(id) => unlinkComponentSource(id)}
            onDelete={(id) => deleteComponent(id)}
          />
        {:else if itemCards.length === 0}
          <section class="manager-setup-card" aria-label={text('FABRICATE.Admin.Manager.Component.EmptySetup.Title', 'Set up components')}>
            <div class="manager-setup-card-header">
              <i class="fas fa-box-open" aria-hidden="true"></i>
              <div>
                <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Component.EmptySetup.Kicker', 'Component setup')}</p>
                <h3>{text('FABRICATE.Admin.Manager.Component.EmptySetup.Title', 'Set up components')}</h3>
              </div>
            </div>
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.EmptySetup.Hint', 'Import item-backed components before recipes can reference ingredients, tools, results, or essence sources.')}</p>
            <ol class="manager-setup-list">
              <li>{text('FABRICATE.Admin.Manager.Component.EmptySetup.StepImport', 'Drop world, compendium, pack, or folder items into the component browser.')}</li>
              <li>{text('FABRICATE.Admin.Manager.Component.EmptySetup.StepOrganize', 'Add tags, essences, source links, and difficulty metadata where the selected system uses them.')}</li>
              <li>{text('FABRICATE.Admin.Manager.Component.EmptySetup.StepRecipes', 'Use the managed components as recipe requirements, tools, and results.')}</li>
            </ol>
            <div class="manager-setup-links" aria-label={text('FABRICATE.Admin.Manager.Component.EmptySetup.Resources', 'Component resources')}>
              <a class="manager-button" href="https://mistersilver-uk.github.io/fabricate/crafting-systems#components" target="_blank" rel="noreferrer">
                <i class="fas fa-book-open" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.Component.EmptySetup.ComponentDocs', 'Component docs')}</span>
              </a>
              <a class="manager-button" href="https://mistersilver-uk.github.io/fabricate/quickstart" target="_blank" rel="noreferrer">
                <i class="fas fa-circle-question" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.Component.EmptySetup.Quickstart', 'Quickstart')}</span>
              </a>
            </div>
          </section>
        {:else}
          <div class="manager-empty">
            <div>
              <i class="fas fa-boxes" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.Manager.Component.SelectComponent', 'Select a component')}</h3>
              <p>{text('FABRICATE.Admin.Manager.Component.InspectorHint', 'The inspector shows component identity, origin, tags, essences, and source copy context for the selected row.')}</p>
            </div>
          </div>
        {/if}
      {:else if currentView === 'recipes'}
        <RecipeBrowserInspector
          {selectedRecipe}
          resolutionMode={selectedSystem?.resolutionMode || 'simple'}
          outcomeTiers={recipeAllOutcomeTierOptions}
          recipeCount={($viewState.recipes || []).length}
          componentCount={selectedCounts.components}
          componentOptions={selectedSystem?.managedItemOptions || []}
          essenceOptions={selectedSystem?.features?.essences ? (selectedSystem?.essenceDefinitions || []) : []}
          {showRecipeCategories}
          showVisibilitySummary={$viewState.showVisibilitySummary}
          onEdit={() => editRecipe(selectedRecipe?.id)}
          onDuplicate={() => duplicateRecipe()}
          onDelete={() => deleteRecipe()}
          onAddComponents={() => setView('components')}
        />
      {:else if currentView === 'tools'}
        {#if selectedLibraryTool}
          {@const toolImageSrc = (selectedSystem?.managedItemOptions || []).find(item => String(item.id) === String(selectedLibraryTool.componentId))?.img || 'icons/svg/item-bag.svg'}
          {@const toolComponent = (selectedSystem?.managedItemOptions || []).find(item => String(item.id) === String(selectedLibraryTool.componentId))}
          <section class="manager-inspector-card" data-manager-tool-inspector>
            <div class="manager-inspector-title-row is-hero-large">
              <img class="manager-recipe-preview" src={toolImageSrc} alt="" />
              <div class="manager-inspector-copy">
                <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.SelectedKicker', 'Selected tool')}</p>
                <div class="manager-tool-inspector-heading">
                  <h2 class="manager-inspector-name" title={selectedLibraryTool.label || toolComponent?.name || ''}>{selectedLibraryTool.label || toolComponent?.name || text('FABRICATE.Admin.Manager.Tools.OverviewComponentMissing', 'Not set')}</h2>
                  {#if selectedLibraryToolDirty}
                    <span class="manager-chip is-warning manager-tools-dirty-chip">
                      <i class="fas fa-save" aria-hidden="true"></i>
                      <span>{text('FABRICATE.Admin.Manager.Tools.Dirty', 'Unsaved')}</span>
                    </span>
                  {/if}
                </div>
              </div>
            </div>
            <div class="manager-tool-inspector-actions">
              <button type="button"
                class="manager-button is-danger"
                onclick={deleteSelectedLibraryTool}
                disabled={$viewState.toolsDraftSaving}>
                <i class="fas fa-trash" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.Tools.Delete', 'Delete tool')}</span>
              </button>
              <button type="button"
                class="manager-button is-primary"
                onclick={saveSelectedToolDraft}
                disabled={!selectedLibraryToolDirty || !selectedToolDraftValidation.valid || $viewState.toolsDraftSaving}
                title={selectedToolDraftValidation.valid ? '' : selectedToolDraftValidation.errors.join('; ')}>
                <i class={$viewState.toolsDraftSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.Tools.Save', 'Save changes')}</span>
              </button>
            </div>
          </section>

          <section class="manager-inspector-card manager-tools-component-browser-card" data-manager-tools-component-browser>
            <div class="manager-tools-component-browser-header">
              <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Environment.Tasks.ComponentBrowser', 'Components')}</h3>
              <label class="manager-search is-compact" data-manager-tools-component-search>
                <i class="fas fa-search" aria-hidden="true"></i>
                <input type="search"
                  value={toolsComponentSearchTerm}
                  oninput={onToolsComponentSearchInput}
                  placeholder={text('FABRICATE.Admin.Manager.Environment.Tasks.SearchComponentsPlaceholder', 'Search components...')}
                  aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.SearchComponentsByName', 'Search component names')} />
              </label>
            </div>

            <div class="manager-tools-component-browser-scroll">
              {#if toolsComponentCards.length === 0}
                <div class="manager-empty is-compact">
                  <div>
                    <i class="fas fa-box-open" aria-hidden="true"></i>
                    <h3>{text('FABRICATE.Admin.Manager.Environment.Tasks.NoComponents', 'No components available')}</h3>
                  </div>
                </div>
              {:else if toolsFilteredComponentCards.length === 0}
                <div class="manager-empty is-compact">
                  <div>
                    <i class="fas fa-search" aria-hidden="true"></i>
                    <h3>{text('FABRICATE.Admin.Manager.Environment.Tasks.EmptyComponentSearchTitle', 'No components match these filters')}</h3>
                  </div>
                </div>
              {:else}
                <div class="manager-tools-component-grid" role="list">
                  {#each toolsPaginatedComponentCards as item (item.id)}
                    <div class="manager-task-component-card"
                      role="listitem"
                      draggable="true"
                      data-manager-tools-component-card={item.id}
                      ondragstart={(event) => onToolsComponentDragStart(item, event)}>
                      <img class="manager-task-component-card-image" src={toolsComponentCardImage(item)} alt="" />
                      <span class="manager-task-component-card-copy">
                        <strong>{item.name}</strong>
                        <span>{toolsComponentDescription(item) || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}</span>
                        {#if Array.isArray(item.tags) && item.tags.length > 0}
                          <span class="manager-task-component-card-tags">
                            {#each item.tags.slice(0, 3) as tag (tag)}
                              <small>{tag}</small>
                            {/each}
                          </span>
                        {/if}
                      </span>
                      <span class="manager-task-component-card-grip" aria-hidden="true">⋮⋮</span>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>

            <div class="manager-tools-component-browser-footer">
              <Pagination
                totalCount={toolsFilteredComponentCards.length}
                pageSize={toolsComponentPageSize}
                pageIndex={toolsComponentPageIndex}
                pageSizeOptions={[6, 9, 12]}
                onPageChange={(next) => toolsComponentPageIndex = next}
                onPageSizeChange={(next) => { toolsComponentPageSize = next; toolsComponentPageIndex = 0; }}
              />
            </div>
          </section>
        {:else}
          <div class="manager-empty">
            <div>
              <i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.Manager.Tools.SelectEmpty', 'Select a tool to inspect.')}</h3>
            </div>
          </div>
        {/if}
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
        />
      {:else if currentView === 'books-scrolls'}
        <ItemPageInspector
          item={selectedRecipeItem}
          visibilityMode={craftingVisibilityMode}
          onOpenRecipeItem={(id) => editRecipeItem(id)}
          onToggleEnabled={(id, enabled) => store.setRecipeItemEnabled?.(id, enabled)}
          onToggleQuickLimit={(id, limited) => toggleRecipeItemQuickLimit(id, limited)}
        />
      {:else if selectedSystem}
        <section class="manager-inspector-card">
          <div class="manager-inspector-title-row is-hero-large">
            <span class="manager-inspector-icon is-hero-large" aria-hidden="true">
              <i class="fas fa-layer-group"></i>
            </span>
            <div class="manager-inspector-copy">
              <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Column.System', 'System')}</p>
              <h2 class="manager-inspector-name" title={selectedSystem.name}>{selectedSystem.name}</h2>
              <div class="manager-chip-row">
                <span class="manager-chip is-active">{resolutionModeLabel(selectedSystem.resolutionMode)}</span>
                <span class={`manager-chip ${selectedSystem.enabled === false ? 'is-disabled' : 'is-active'}`}>
                  {selectedSystem.enabled === false ? text('FABRICATE.Admin.Manager.StatusDisabled', 'Disabled') : text('FABRICATE.Admin.Manager.StatusActive', 'Active')}
                </span>
              </div>
            </div>
          </div>

          <p class="manager-muted">
            {selectedSystem.description || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
          </p>
        </section>

        <section class="manager-inspector-card">
          <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Counts', 'Counts')}</h3>
          <div class="manager-fact-grid">
            {#each selectedCountFacts as fact (fact.id)}
              {@const labelParts = countLabelParts(fact.label)}
              <div class="manager-fact" class:is-off={fact.isOff} data-count-id={fact.id}>
                {#if fact.isOff}
                  <span class="manager-fact-line">
                    <span class="manager-fact-label">{fact.label}</span>
                    <strong class="is-disabled">{fact.value}</strong>
                  </span>
                {:else}
                  <span class="manager-fact-line">
                    <span class="manager-fact-leading"><strong>{fact.value}</strong> {labelParts.lead}</span>{#if labelParts.rest}{' '}<span class="manager-fact-label">{labelParts.rest}</span>{/if}
                  </span>
                {/if}
              </div>
            {/each}
          </div>
        </section>

        <section class="manager-inspector-card" aria-label={text('FABRICATE.Admin.Manager.EnabledFeatures', 'Enabled features')}>
          <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.EnabledFeatures', 'Enabled features')}</h3>
          {#if enabledFeatureLabels.length > 0}
            <div class="manager-feature-list">
              {#each enabledFeatureLabels as feature (feature)}
                <span class="manager-chip is-active">{feature}</span>
              {/each}
            </div>
          {:else}
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.NoOptionalFeatures', 'No optional features enabled.')}</p>
          {/if}
        </section>

        {#if selectedGatheringConditionShortcuts.length > 0}
          <section class="manager-inspector-card manager-condition-shortcut-card" data-systems-gathering-conditions aria-label={text('FABRICATE.Admin.Manager.GlobalConditions', 'Global conditions')}>
            <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.GlobalConditions', 'Global conditions')}</h3>
            <div class="manager-condition-shortcut-list">
              {#each selectedGatheringConditionShortcuts as condition (condition.kind)}
                <label class="manager-field manager-condition-shortcut" data-systems-gathering-condition={condition.kind}>
                  <span class="manager-condition-shortcut-label">
                    <i class={condition.icon} aria-hidden="true"></i>
                    <span>{condition.label}</span>
                  </span>
                  <select value={condition.setting.current} onchange={(event) => updateSelectedGatheringCondition(condition.kind, event.currentTarget.value)}>
                    {#each conditionValues(condition.setting) as option (conditionId(option))}
                      <option value={conditionId(option)}>{conditionLabel(option)}</option>
                    {/each}
                  </select>
                </label>
              {/each}
            </div>
          </section>
        {/if}

      {:else if systemsLoading}
        <section class="manager-setup-card" aria-label={text('FABRICATE.Admin.Manager.LoadingSystems', 'Loading crafting systems...')}>
          <div class="manager-setup-card-header">
            <i class="fas fa-spinner" aria-hidden="true"></i>
            <div>
              <p class="manager-kicker">{text('FABRICATE.Admin.Manager.LoadingSystemsKicker', 'Startup')}</p>
              <h3>{text('FABRICATE.Admin.Manager.LoadingSystems', 'Loading crafting systems...')}</h3>
            </div>
          </div>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.LoadingSystemsHint', 'Fabricate is finishing startup before the system library is shown.')}</p>
        </section>
      {:else if ($viewState.systems || []).length === 0}
        <section class="manager-setup-card" aria-label={text('FABRICATE.Admin.Manager.EmptySetup.Title', 'Set up your first system')}>
          <div class="manager-setup-card-header">
            <i class="fas fa-compass" aria-hidden="true"></i>
            <div>
              <p class="manager-kicker">{text('FABRICATE.Admin.Manager.EmptySetup.Kicker', 'First run')}</p>
              <h3>{text('FABRICATE.Admin.Manager.EmptySetup.Title', 'Set up your first system')}</h3>
            </div>
          </div>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.EmptySetup.Hint', 'Create a crafting system, add item-backed components, then build recipes from those components.')}</p>
          <ol class="manager-setup-list">
            <li>{text('FABRICATE.Admin.Manager.EmptySetup.StepSystem', 'Create a system for one crafting discipline or ruleset.')}</li>
            <li>{text('FABRICATE.Admin.Manager.EmptySetup.StepComponents', 'Import world or compendium items as reusable components.')}</li>
            <li>{text('FABRICATE.Admin.Manager.EmptySetup.StepRecipes', 'Add recipes that consume components and award results.')}</li>
          </ol>
          <div class="manager-setup-links" aria-label={text('FABRICATE.Admin.Manager.EmptySetup.Resources', 'Resources')}>
            <a class="manager-button" href="https://mistersilver-uk.github.io/fabricate/quickstart" target="_blank" rel="noreferrer">
              <i class="fas fa-book-open" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.EmptySetup.Quickstart', 'Quickstart')}</span>
            </a>
            <a class="manager-button" href="https://mistersilver-uk.github.io/fabricate" target="_blank" rel="noreferrer">
              <i class="fas fa-circle-question" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.EmptySetup.Docs', 'Docs')}</span>
            </a>
          </div>
        </section>
      {:else}
        <div class="manager-empty">
          <div>
            <i class="fas fa-arrow-pointer" aria-hidden="true"></i>
            <h3>{text('FABRICATE.Admin.Manager.SelectSystem', 'Select a system')}</h3>
            <p>{text('FABRICATE.Admin.Manager.InspectorHint', 'The inspector shows counts, resolution mode, and enabled features for the selected system.')}</p>
          </div>
        </div>
      {/if}
    </aside>
    {/if}
  </div>

  <ItemPickerModal
    open={itemPickerOpen}
    items={worldItemOptions}
    titleKey="FABRICATE.Admin.Manager.BooksScrolls.PickItemTitle"
    titleFallback="Select an item"
    onPick={(uuid) => pickRecipeItemFromUuid(uuid)}
    onClose={() => itemPickerOpen = false}
  />
</div>
