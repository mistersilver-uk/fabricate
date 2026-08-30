<!-- Svelte 5 runes mode -->
<script>
  import { onDestroy } from 'svelte';
  import ChanceSlider from '../../components/ChanceSlider.svelte';
  import CharacterModifierBoundsRow from './environment/CharacterModifierBoundsRow.svelte';
  import GatheringRuleLimitStepper from './environment/GatheringRuleLimitStepper.svelte';
  import Chip from './Chip.svelte';
  import EmptyState from './EmptyState.svelte';
  import ExplainerCard from './ExplainerCard.svelte';
  import {
    DEFAULT_GATHERING_ENVIRONMENT_IMG,
    DEFAULT_GATHERING_EVENT_IMG,
    DEFAULT_GATHERING_TASK_IMG,
  } from '../../../../gatheringImageDefaults.js';
  import { isGameMaster, localize, notifyInfo, notifyWarn } from '../../util/foundryBridge.js';
  import { announceAfterFocusMove } from '../../util/announceAfterFocus.js';
  import { resolveDropUuid } from '../../util/dropUtils.js';
  import { permitsFailureResults } from '../../../../utils/failureResultPolicy.js';
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
  // ── COMPLICATIONS: the trigger picker's option labels (issue 1286) ───────────────────
  // A check trigger carries no authored name — `_normalizeUnifiedTrigger` drops `label`
  // deliberately — so what NAMES one is its condition sentence, and the Checks Studio's own
  // trigger cards already build that sentence from these three modules. The complications
  // picker reuses them rather than composing a second sentence for the same trigger.
  import { parseDiceGroups } from '../../../../utils/craftingCheckExpression.js';
  import { interpolate } from './checks/checksCopy.js';
  import { summariseCondition } from './checks/checkTriggerSummary.js';
  import { normalizePreviewSandbox } from '../../../../systems/progressiveCheckSandbox.js';
  import { activeEnvironmentsForRecord } from '../../../../systems/gatheringComposition.js';
  import { buildVocabularyUsage } from '../../../../utils/vocabularyUsage.js';
  import { createRecipeBrowserState } from '../../../../utils/recipeBrowserModel.js';
  import {
    componentCategoryOptions,
    createComponentBrowserState,
  } from '../../../../utils/componentBrowserModel.js';
  import {
    createComponentBulkDraft,
    toBulkComponentEdit,
  } from '../../../../utils/componentBulkEditModel.js';
  import {
    countBlockedRecipeEnables,
    countRecipeBookMembership,
    createRecipeBulkDraft,
    describeRecipeCheckTierAxis,
    toBulkRecipeEdit,
  } from '../../../../utils/recipeBulkEditModel.js';
  import { createEssenceBrowserState } from '../../../../utils/essenceBrowserModel.js';
  import {
    createEssenceBulkDraft,
    toBulkEssenceEdit,
  } from '../../../../utils/essenceBulkEditModel.js';
  import { resolveRecipeImage } from '../../util/craftingImageDefaults.js';
  import Medallion from '../../components/Medallion.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import { buildComponentEditorState } from '../../util/componentEditor.js';
  import { getCurrencyProvidersForFoundrySystem } from '../../../../config/currencyProviders.js';
  import ComponentEditView from './ComponentEditView.svelte';
  import ComponentEditorHeader from './component/ComponentEditorHeader.svelte';
  import ComponentsBrowserView from './ComponentsBrowserView.svelte';
  import ChecksView from './checks/ChecksView.svelte';
  import EnvironmentEditView from './EnvironmentEditView.svelte';
  import EnvironmentsBrowserView from './EnvironmentsBrowserView.svelte';
  import GatheringRealmsTab from './GatheringRealmsTab.svelte';
  import GatheringMapLinksTab from './GatheringMapLinksTab.svelte';
  import EssenceBrowserView from './EssenceBrowserView.svelte';
  import EssenceEditView from './EssenceEditView.svelte';
  // The essence library's rail halves and the editor's live preview (issue 1036), extracted
  // out of this file. `essences/` is the BROWSER's directory, which the screenshot evidence
  // map globs for the essence views.
  import EssenceBrowserInspector from './essences/EssenceBrowserInspector.svelte';
  import EssenceBulkEditPanel from './essences/EssenceBulkEditPanel.svelte';
  import EssenceBehaviorPreview from './essences/EssenceBehaviorPreview.svelte';
  import GatheringTaskEditView from './GatheringTaskEditView.svelte';
  import GatheringEventEditView from './GatheringEventEditView.svelte';
  import RealmNameField from './RealmNameField.svelte';
  import ToolEditView from './ToolEditView.svelte';
  import ToolsBrowserView from './ToolsBrowserView.svelte';
  import ToolBrowserInspector from './tools/ToolBrowserInspector.svelte';
  import RecipesBrowserView from './RecipesBrowserView.svelte';
  import RecipeBrowserInspector from './recipes/RecipeBrowserInspector.svelte';
  // The recipe library's bulk edit panel (issue 1010) — the sibling of the above, and
  // under `recipes/` for the same reason: `recipe/` is the EDITOR's directory, which the
  // screenshot map globs for the five recipe-editor frames.
  import RecipeBulkEditPanel from './recipes/RecipeBulkEditPanel.svelte';
  // The component library's inspector (issue 676) — the sibling of the above. It lives
  // under `components/` (the BROWSER's dir), NOT `component/`, which the screenshot map
  // globs for the component EDITOR's frames.
  import ComponentBrowserInspector from './components/ComponentBrowserInspector.svelte';
  import ComponentBulkEditPanel from './components/ComponentBulkEditPanel.svelte';
  import BooksScrollsView from './BooksScrollsView.svelte';
  import KnowledgeView from './KnowledgeView.svelte';
  import CraftingSettingsView from './CraftingSettingsView.svelte';
  import AccessTabView from './AccessTabView.svelte';
  import GrantAccessInspector from './GrantAccessInspector.svelte';
  import ItemPageInspector from './ItemPageInspector.svelte';
  import RecipeItemEditor from './RecipeItemEditor.svelte';
  import ImportFolderMappingModal from './ImportFolderMappingModal.svelte';
  import ImportReportModal from './ImportReportModal.svelte';
  import {
    buildCraftingNavItems,
    activeCraftingTab as resolveActiveCraftingTab,
    isCraftingRoute as isCraftingView,
    isCraftingViewAvailable,
    resolveCraftingRedirect,
  } from './crafting/craftingNav.js';
  import {
    CHECKS_VIEWS,
    activeChecksTab as resolveActiveChecksTab,
    buildChecksNavItems,
    checksNavIssueTotal,
    isChecksRoute as isChecksView,
    resolveChecksRedirect,
  } from './checks/checksNav.js';
  import { evaluateCheckReadiness, readinessModeForSlot } from './checks/checksReadiness.js';
  import {
    buildCheckModifierContext,
    resolveActiveCraftingCheckFormula,
    resolveActiveGatheringCheckFormula,
    resolveActiveSalvageCheckFormula,
  } from '../../../../systems/checkModifierResolver.js';
  import RecipeEditView from './RecipeEditView.svelte';
  import { craftingEffect } from './crafting/craftingVisibility.js';
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
  import WorldDowntimeExtensionHost from './downtime/WorldDowntimeExtensionHost.svelte';
  import WorldCurrencyTab from './world/WorldCurrencyTab.svelte';
  import WorldModifiersTab from './world/WorldModifiersTab.svelte';
  import WorldPrerequisitesTab from './world/WorldPrerequisitesTab.svelte';
  import { WORLD_DOWNTIME_PREVIEW_PROVIDER } from './downtime/worldDowntimePreviewProvider.js';
  import { createRouteChromeChannel } from './downtime/routeChromeChannel.js';
  import {
    managerHeaderActionClass,
    WORLD_DOWNTIME_SURFACE_ID,
  } from '../../../managerExtensions.js';
  import { resolveNavTabBadge, navTabBadgeTotal } from '../../../navTabBadgeStore.js';
  import {
    mapModifierToPrerequisite,
    mapPrerequisiteToModifier,
  } from '../../../../systems/characterModifierPrerequisiteCopy.js';

  let { store, services = null, managerExtensions = null, playerExtensions = null } = $props();
  let downtimeExtensionHost = $state(null);
  const PATREON_URL = 'https://www.patreon.com/c/mistersilver';
  // Which provider currently holds the Downtime surface, and which one has already failed
  // to mount. The shell owns both because the rail renders the active tab set while the
  // host is unmounted, and a fault has to move the rail as well as the panel.
  let downtimeProviderSnapshot = $state(null);
  let downtimeFaultedProvider = $state(null);
  // Bumped by `context.requestRemount()`. The host's mount effect keys on the context
  // object, so a new identity is the whole re-render mechanism.
  let downtimeContextRevision = $state(0);
  // The chrome the live companion mount has asked Core to render, or null for "use what the
  // active tab declared at registration". Assigned ONLY by the channel below.
  //
  // This is the whole no-remount mechanism, and it is a mechanism of OMISSION: nothing in
  // `worldDowntimeContext` reads this state, so writing it re-renders the header and moves
  // neither the context identity nor the host's mount effect. A reader added to the context
  // derivation would silently turn every chrome update into a remount, which is precisely the
  // failure the runtime channel exists to avoid — so keep chrome out of the context.
  let downtimeRouteChrome = $state(null);
  // Whether the live mount can be asked to pop one level, which the breadcrumb's tab crumb
  // reads. Its own signal rather than a field on the chrome above, because it is a separate
  // fact: chrome is what the header SAYS and this is what one of its controls can DO.
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
  // Every surface a companion currently claims, not just Core's Downtime one. The title bar
  // reports the MODULE, so it must not be keyed on one route: a premium module whose only
  // surface is one Core has never heard of is still installed and still working.
  //
  // …and for the same reason it must not be keyed on one REGISTRY either (issue 1198). A
  // companion whose only surface is a player-window one is just as installed, so each
  // registry publishes into its own private array and the pair are unioned below. Widening
  // the SOURCE rather than the predicate is deliberate: `premiumInstalled` already means
  // "read the whole registered surface set", so there is nothing about the flag to change.
  let managerRegisteredSurfaceIds = $state([]);
  let playerRegisteredSurfaceIds = $state([]);
  // The runtime side of a Downtime tab's badge (issue 1302): a frozen, null-prototype record
  // keyed by tab id, one snapshot per publication. Registration-scoped, not mount-scoped — see
  // `navTabBadgeStore.js` — so it is read here rather than by the (mount-scoped) extension host.
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

  // The runtime badge channel. This is THE CAPABILITY (issue 1302): an implementation that
  // renders only a tab's REGISTERED `badge` and never subscribes would satisfy every
  // registry-level criterion while shipping `setWorldNavTabBadge` as a write-only sink.
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

  // A provider whose mount threw is set aside rather than unregistered: it keeps its
  // registration (and its unregister handle stays the companion's), Core simply renders its
  // own surface until the next snapshot arrives.
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
  // `downtimeCoreFallback` is the one discriminator between the two readings — the rule the
  // rail's Downtime sub-items already apply to `label` / `tooltip`, applied to route chrome too.
  // The two defaults are genuinely different values, not one repeated. `coreDefault` is what
  // Core shows when its OWN lang key is missing. `providerDefault` is what Core shows over a
  // companion's screens when that companion declared no chrome, and it must never be Core's
  // preview copy: a raw English marketing sentence under someone else's UI is exactly the
  // defect this seam exists to remove.
  //
  // THREE LAYERS, in one order, everywhere: the live mount's runtime chrome, then the active
  // tab's registered chrome, then Core's own string. Unsetting is therefore not a separate
  // path — a runtime update that omits a field simply does not shadow the layer below it, so a
  // companion that never calls `setRouteChrome` reads exactly as it did before the channel
  // existed and one that clears it lands back on its registered chrome with no further work.
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
  //
  // `downtimeChrome` reads the runtime layer FIRST, which is right for the page title and the
  // subtitle — a companion's detail screen should own those outright. It is wrong for the
  // breadcrumb, because a trail is a PATH: the detail belongs BELOW the tab it was reached
  // through rather than in place of it. Shadowing it there left a GM inside a faction reading
  // `World > Downtime > Emberwatch`, with the Factions tab absent from its own trail.
  //
  // So the tab crumb deliberately does NOT go through `downtimeChrome`: it reads the two lower
  // layers only, in the same order, and the runtime value becomes a crumb of its own beneath.
  const downtimeTabCrumb = $derived.by(() => {
    const value = activeDowntimeTab?.breadcrumb;
    if (downtimeCoreFallback) return value ? text(value, worldDowntimeTabId) : worldDowntimeTabId;
    return value || downtimeTabText(activeDowntimeTab, 'label');
  });

  // The companion's own leaf, or the empty string when there is nothing further to say.
  //
  // EMPTY WHEN IT MATCHES THE TAB CRUMB, which is not a tidy-up: the Tracking tab's board
  // screen restates its registered chrome at runtime, so a leaf drawn unconditionally would
  // read `... > Tracking > Tracking` on the screen a GM lands on.
  const downtimeLeafCrumb = $derived.by(() => {
    const runtime = downtimeRuntimeChrome?.breadcrumb;
    if (!runtime || runtime === downtimeTabCrumb) return '';
    return runtime;
  });

  // Whether the tab crumb is worth pressing. `reselect` is offered to the live mount and Core
  // has nothing of its own to do, so a companion that registered no handler would get a button
  // that visibly does nothing — and there is nothing to go back UP to when the leaf is absent,
  // because the tab crumb is then the screen the GM is already on.
  const downtimeTabCrumbNavigable = $derived(downtimeLeafCrumb !== '' && downtimeCanReselect);

  // The ApplicationV2 shell calls this before it unmounts the Svelte root, while a
  // companion target is still connected. `onDestroy` remains the safety net for
  // direct Svelte teardown paths that do not go through the application shell.
  export function disposeDowntimeProviderBeforeRemoval() {
    downtimeExtensionHost?.disposeBeforeRemoval?.();
  }

  onDestroy(disposeDowntimeProviderBeforeRemoval);

  // svelte-ignore state_referenced_locally
  const viewState = store.viewState;

  let activeView = $state('systems');
  // The tab the System Overview page (`system-edit`) should open on. The standalone
  // overview route was folded into this page as its Validation tab; bumping
  // `requestedSystemTabNonce` alongside `requestedSystemTab` lets a deep link (or the
  // blocker banner) force the Validation tab open even when the page is already shown.
  let requestedSystemTab = $state('settings');
  let requestedSystemTabNonce = $state(0);
  // Deep link into the System Overview page's Modifiers section (issue 1117). The Checks
  // screen renders the modifier library read-only for every activity and links here, which
  // is the one navigation that replaces the authoring the Checks card used to do.
  let requestedSystemModifierSectionNonce = $state(0);
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
  // The staged-but-unwritten bulk edit (issue 772). The ROOT owns it, not the panel: the
  // panel is unmounted the moment the selection empties, so a panel-owned draft would be
  // destroyed by the very transition that is supposed to DISCARD it — indistinguishable
  // from working, until the panel is kept alive for any other reason. The selection itself
  // lives on the lifted `componentBrowserState`, beside the browser's other view-state.
  let componentBulkDraft = $state(createComponentBulkDraft());
  let componentBulkApplying = $state(false);
  // The armed bulk delete (issue 1129). `…Armed` is the single armed token for the whole
  // selection — the target is the set, not a row — and it is cleared by the selection effect
  // below on ANY change to the set.
  let componentBulkDeleting = $state(false);
  let componentBulkDeleteArmed = $state(false);
  // The recipe library's twin (issue 1010), owned here for the identical reason: the
  // recipe bulk panel is unmounted the moment the selection empties, so a panel-owned
  // draft would be destroyed by the very transition that is supposed to DISCARD it. The
  // selection itself lives on the lifted `recipeBrowserState`.
  let recipeBulkDraft = $state(createRecipeBulkDraft());
  let recipeBulkApplying = $state(false);
  // The recipe library's armed bulk delete (issue 1132), the third and last studio to get
  // one. `…Deleting` is the caller's OWN in-flight flag and is what the card's busy face
  // derives from — never `…Armed`. Disabling a focused button fires blur in Chromium and
  // Firefox and `ArmedDangerButton` disarms on blur, so a busy face keyed off the arm flips
  // back to idle for the whole duration of the write; happy-dom does not fire that blur, so
  // a mounted assertion would pass on behaviour that does not hold in Foundry.
  let recipeBulkDeleting = $state(false);
  let recipeBulkDeleteArmed = $state(false);
  // What a FINISHED delete that left the card mounted has to say for itself. Confirming
  // disables the control, which moves focus to `document.body` and empties the card's live
  // region, so on the refused or no-op path an assistive-technology user is left on `<body>`
  // beside a re-enabled button with nothing announced — the Foundry error toast is not a
  // live region this module controls. The card announces this and takes focus back; it is
  // cleared on the next arm so a second refusal speaks again.
  let recipeBulkDeleteOutcome = $state('');
  // Its two twins (issue 1157, review round). The Component and Essence panels rendered the
  // same card and never passed it a sentence, so their refused deletes landed on `<body>`
  // and said nothing at all — the half of the paragraph above that had only ever been
  // implemented once.
  let componentBulkDeleteOutcome = $state('');
  let essenceBulkDeleteOutcome = $state('');
  // The essence library's lifted view-state (issue 1036) — the third and last studio to get
  // one, and the fix for criterion 12. Search, status, source, sort, view mode, page and
  // the bulk selection all lived inside `EssenceBrowserView`, so opening an essence
  // unmounted the browser and coming back reset every one of them.
  let essenceBrowserState = $state(createEssenceBrowserState());
  // The staged-but-unwritten essence bulk edit, owned HERE for the reason its two siblings
  // are: the panel is unmounted the moment the selection empties, so a panel-owned draft
  // would be destroyed by the very transition that is supposed to DISCARD it.
  let essenceBulkDraft = $state(createEssenceBulkDraft());
  let essenceBulkApplying = $state(false);
  let essenceBulkDeleting = $state(false);
  // The bulk delete's ARMED latch (the maintainer's binding decision for this action). It
  // is a single boolean rather than a token map because exactly one bulk delete exists on
  // the screen at a time; `ArmedDangerButton` still reports its own Escape and blur
  // disarms, and the selection changing disarms it too — an arm is a statement about a
  // specific set, so it must not survive that set changing.
  let essenceBulkDeleteArmed = $state(false);
  let activeGatheringTab = $state('environments');
  // `activeTravelTab` serves World > Parties ALONE now (issue 1282). It used to be one
  // variable behind two routes — the World route and the selected-system Travel route — which
  // is why entering Parties also had to set `activeGatheringTab = 'travel'`. World > Travel
  // owns `worldTravelTab` below, so neither route can move the other's selection any more.
  let activeTravelTab = $state('parties');
  // World > Travel's destination: `realms` or `map`. Realms is the landing tab.
  let worldTravelTab = $state('realms');
  // ── Rail group expansion: USER INTENT only (issue 1185) ──────────────────────────────
  //
  // The five collapsible rail groups used to hold user intent and route-derived state in
  // ONE variable each, and the two overwrote one another in both directions. Four groups
  // ran an effect that read its own flag to guard itself (`if (!onRoute || expanded)
  // return; expanded = true`), so collapsing the group changed the effect's own dependency,
  // re-ran it, passed the now-false guard and forced the group back open — a chevron that
  // visibly did nothing. Crafting had the mirror defect: `craftingMenuExpanded =
  // isCraftingRoute` never read its own flag, so a collapse stuck, but leaving the category
  // force-CLOSED a group the GM had deliberately opened.
  //
  // The fix is to stop conflating the two. This map is intent and nothing else: only the
  // disclosure toggle, a navigation that opens a group, and the auto-open effect below ever
  // write it. Whether a group is DISPLAYED expanded is `railGroupExpanded`, which ORs this
  // with `railGroupLockedOpen` — see the block beside the route predicates.
  const RAIL_GROUP_IDS = Object.freeze([
    'crafting',
    'checks',
    'gathering',
    'worldTravel',
    'worldRules',
    'worldDowntime',
  ]);
  let railGroupUserExpanded = $state({
    crafting: false,
    checks: false,
    gathering: false,
    worldTravel: false,
    worldRules: false,
    worldDowntime: false,
  });
  // The selected Downtime preview is owned here rather than inside the extension host
  // because the rail, the page header and the breadcrumb all name it.
  let worldDowntimeTabId = $state('tracking');
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
  let recipeItemLinkedSourceSnapshot = $state(null);
  let recipeItemEditSaving = $state(false);
  // Set on every failed recipe-item save. Read by the header toolbar, which renders the
  // localized failure alert beside Save (issue 919 — before that this had no reader at all
  // and a GM whose save failed was shown nothing).
  let recipeItemSaveFailed = $state(false);
  let recipeItemActiveTab = $state('overview');
  // World-item options fed to the recipe-item editor's Overview link picker. (The
  // Books & Scrolls creation flow is a drop-zone now — issue 844 — so this no longer
  // backs a create-recipe-item modal.)
  let worldItemOptions = $state([]);
  // Folder-aware import mapping modal (issue 771): opened before a folder / whole-pack
  // component drop commits, seeded with the per-folder groups the drop resolved to.
  let importMappingOpen = $state(false);
  let importMappingFolders = $state([]);
  // Post-import reference report (issue 877): the store resolves the assembled
  // `buildImportReportContent` output once a system import completes, and this renders
  // it in the same ManagerModal chrome the mapping step above uses.
  let importReportContent = $state(null);
  // svelte-ignore state_referenced_locally
  let railCollapsed = $state(services?.getSetting?.('managerRailCollapsed') === true);

  function toggleManagerRail() {
    // Belt and braces beside the `disabled` attribute, exactly as `toggleRailGroup` does it:
    // the rail lock (issue 1213) is a rule about state, not about one control.
    if (railLockedOpen) return;
    railCollapsed = !railCollapsed;
    services?.setSetting?.('managerRailCollapsed', railCollapsed);
  }

  let selectedGatheringTaskId = $state('');
  let selectedGatheringEventId = $state('');
  let selectedGatheringDropId = $state('');
  let gatheringTaskDraft = $state(null);
  let gatheringTaskDraftBaseline = $state(null);
  let gatheringTaskSaving = $state(false);
  // User-facing failure text for the gathering-task editor, rendered by the header toolbar
  // beside Save (issue 919).
  let gatheringTaskSaveError = $state('');
  let gatheringEventDraft = $state(null);
  let gatheringEventDraftBaseline = $state(null);
  let gatheringEventSaving = $state(false);
  // User-facing failure text for the gathering-event editor, rendered by the header toolbar
  // beside Save (issue 919).
  let gatheringEventSaveError = $state('');
  let toolEditorActiveTab = $state('overview');
  let toolValidationFocusNonce = $state(0);

  // Per-check unified trigger block (issue 419), carried on every check draft so
  // authoring it persists. Deep-clone the persisted block or seed the empty default.
  //
  // This is an ALLOWLIST, and that makes it the highest-consequence line in the
  // editor's draft plumbing: a trigger key missing here is dropped on every editor
  // load, so a GM authors the effect, sees it, saves — and it vanishes with no error.
  // `checkRoutedDirty` compares the JSON of two values that BOTH pass through here,
  // so the editor also looks clean. Every trigger key must be listed.
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
            breakTools: trigger?.breakTools === true,
            // The third effect (issue 975). Copied, not normalized: the draft holds
            // what the GM authored and `_normalizeTierStep` clamps it on save.
            tierStep:
              trigger?.tierStep && typeof trigger.tierStep === 'object'
                ? { ...trigger.tierStep }
                : { mode: 'none', steps: 1, tierId: null },
          }))
        : [],
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
      checkBreakage: cloneCheckBreakage(source.checkBreakage),
    };
  }
  let checkRoutedDraft = $state(cloneRoutedCheck($viewState.selectedSystem?.craftingCheck?.routed));
  let checkRoutedBaseline = $state(
    cloneRoutedCheck($viewState.selectedSystem?.craftingCheck?.routed)
  );
  let lastChecksSystemId = $viewState.selectedSystem?.id || '';
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
      checkBreakage: cloneCheckBreakage(source.checkBreakage),
    };
  }
  let checkSimpleDraft = $state(cloneSimpleCheck($viewState.selectedSystem?.craftingCheck?.simple));
  let checkSimpleBaseline = $state(
    cloneSimpleCheck($viewState.selectedSystem?.craftingCheck?.simple)
  );
  let checkSimpleSaving = $state(false);
  const checkSimpleDirty = $derived(
    JSON.stringify(checkSimpleDraft) !== JSON.stringify(checkSimpleBaseline)
  );

  // THE ALCHEMY CHECK MODE IS A STAGED DRAFT, not a live write.
  //
  // It is a Checks Studio control like every other one on The roll, so it belongs to the
  // same stage → Unsaved → `Save checks` → applied lifecycle. It used to call
  // `store.setAlchemyCheckMode` straight from the radio's `onChange`, which persisted on
  // click: the studio showed no Unsaved chip, the route-exit guard had nothing to guard,
  // and `Save checks` stayed disabled over a change that had already landed. Worse, it
  // could not be undone — the Discard branch of the exit prompt reset every OTHER draft
  // and left this one applied.
  //
  // `none` IS THE OFF STATE, and that is the whole reason this is one value rather than a
  // mode plus a flag. The persisted enum stays `none | simple | tiered` (the engine's own
  // vocabulary, unchanged), but the studio presents it as a two-option mode — Simple or
  // Tiered — plus the rail's Active toggle, which writes `simple` on and `none` off. A
  // separate `enabled` flag beside the mode would be a second spelling of a state the enum
  // already has, and the two would drift the first time one was written without the other.
  //
  // NOT `craftingCheck.enabled`. That flag is the generic `checksEnabled` master toggle,
  // and the engine deliberately does NOT read it for alchemy — alchemy dispatches on
  // `alchemy.checkMode` alone (`CraftingEngine.js`, the `mode === 'alchemy'` branch of
  // `_runCraftingCheck`). Wiring the Active toggle to `enabled` here would have moved a
  // switch the engine never consults.
  let alchemyCheckModeDraft = $state($viewState.selectedSystem?.alchemy?.checkMode || 'none');
  let alchemyCheckModeBaseline = $state($viewState.selectedSystem?.alchemy?.checkMode || 'none');
  let alchemyCheckModeSaving = $state(false);
  const alchemyCheckModeDirty = $derived(alchemyCheckModeDraft !== alchemyCheckModeBaseline);

  // THE OTHER THREE ACTIVE SWITCHES STAGE TOO — the `enabled` flag of each activity's check.
  //
  // The alchemy switch above was staged first because its off state IS a check mode. That
  // left the studio with ONE CONTROL ON TWO LIFECYCLES: the same switch, on the same screen,
  // staged on an alchemy crafting route and wrote through on click everywhere else. A GM who
  // flipped Active on Salvage got no Unsaved chip, a disabled `Save checks`, nothing for the
  // route-exit guard to guard, and a Discard that could not put it back — while the identical
  // control one route over behaved correctly. Two contracts behind one affordance is worse
  // than either contract, so all four now stage.
  //
  // CRAFTING'S IS THE NON-ALCHEMY ONE. An alchemy system's switch never touches this draft
  // (`onToggleCheckActive` returns before it), so the flag stays at its baseline and is never
  // written for a system whose engine ignores it.
  function readCheckActive(config) {
    return config?.enabled === true;
  }
  let craftingCheckActiveDraft = $state(readCheckActive($viewState.selectedSystem?.craftingCheck));
  let craftingCheckActiveBaseline = $state(
    readCheckActive($viewState.selectedSystem?.craftingCheck)
  );
  let craftingCheckActiveSaving = $state(false);
  const craftingCheckActiveDirty = $derived(
    craftingCheckActiveDraft !== craftingCheckActiveBaseline
  );
  let salvageCheckActiveDraft = $state(
    readCheckActive($viewState.selectedSystem?.salvageCraftingCheck)
  );
  let salvageCheckActiveBaseline = $state(
    readCheckActive($viewState.selectedSystem?.salvageCraftingCheck)
  );
  let salvageCheckActiveSaving = $state(false);
  const salvageCheckActiveDirty = $derived(salvageCheckActiveDraft !== salvageCheckActiveBaseline);
  let gatheringCheckActiveDraft = $state(
    readCheckActive($viewState.selectedSystem?.gatheringCraftingCheck)
  );
  let gatheringCheckActiveBaseline = $state(
    readCheckActive($viewState.selectedSystem?.gatheringCraftingCheck)
  );
  let gatheringCheckActiveSaving = $state(false);
  const gatheringCheckActiveDirty = $derived(
    gatheringCheckActiveDraft !== gatheringCheckActiveBaseline
  );

  // Progressive crafting check draft — same staged pattern, used for progressive
  // resolution mode. Only the roll formula and crit table are edited here; the
  // award setting (awardMode) is carried through untouched so a save never drops it.
  function cloneProgressiveCheck(progressive) {
    const source = progressive && typeof progressive === 'object' ? progressive : {};
    // The Checks Studio's PREVIEW SANDBOX (issue 1097). This clone is the SECOND allowlist
    // rebuild the block passes through — the manager's `_normalizeProgressiveCraftingCheck`
    // is the first — and a draft that dropped the key would carry the GM's experiment for
    // exactly as long as the panel stayed open, then write a block without it. It is
    // normalized through the SAME derivation the persistence path uses, so a value the
    // draft holds is a value that survives the save.
    const preview = normalizePreviewSandbox(source.preview);
    const draft = {
      awardMode: ['partial', 'equal', 'exceed'].includes(source.awardMode)
        ? source.awardMode
        : 'equal',
      rollFormula: typeof source.rollFormula === 'string' ? source.rollFormula : '',
      checkBreakage: cloneCheckBreakage(source.checkBreakage),
    };
    // Attached rather than spread, so an absent experiment stays absent — and so the
    // baseline and the draft, both built here, produce the same key order for the
    // `JSON.stringify` dirty comparison.
    if (preview) draft.preview = preview;
    return draft;
  }
  let checkProgressiveDraft = $state(
    cloneProgressiveCheck($viewState.selectedSystem?.craftingCheck?.progressive)
  );
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
  let salvageSimpleDraft = $state(cloneSimpleCheck(sysSalvage?.simple));
  let salvageSimpleBaseline = $state(cloneSimpleCheck(sysSalvage?.simple));
  let salvageRoutedDraft = $state(cloneRoutedCheck(sysSalvage?.routed));
  let salvageRoutedBaseline = $state(cloneRoutedCheck(sysSalvage?.routed));
  let salvageProgressiveDraft = $state(cloneProgressiveCheck(sysSalvage?.progressive));
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
  let gatheringProgressiveDraft = $state(cloneProgressiveCheck(sysGathering?.progressive));
  let gatheringProgressiveBaseline = $state(cloneProgressiveCheck(sysGathering?.progressive));
  let gatheringRoutedDraft = $state(cloneRoutedCheck(sysGathering?.routed));
  let gatheringRoutedBaseline = $state(cloneRoutedCheck(sysGathering?.routed));
  let gatheringProgressiveSaving = $state(false);
  let gatheringRoutedSaving = $state(false);
  const gatheringProgressiveDirty = $derived(
    JSON.stringify(gatheringProgressiveDraft) !== JSON.stringify(gatheringProgressiveBaseline)
  );
  const gatheringRoutedDirty = $derived(
    JSON.stringify(gatheringRoutedDraft) !== JSON.stringify(gatheringRoutedBaseline)
  );
  // Which Checks child route is open (crafting | salvage | gathering | validation).
  // It is DERIVED from the route now (issue 1096), not held: the four activities became
  // rail routes, so a second copy of "which one is open" would be a source of truth the
  // rail highlight and the breadcrumb could disagree with.
  // Which section of that route is open, for a Validation deep link.
  // Empty until the router asks for one, so the very first deep link TO the roll section is
  // still a new request rather than one the view has already honoured at mount.
  let checksActiveSection = $state('');
  // The REQUEST's identity, bumped on every deep link. `ChecksView` latches on this rather
  // than on the section name, so asking twice for the same section is two requests: leave
  // `roll` for Triggers, deep-link to `roll` again, and the second one still lands. Without
  // it the repeat equalled the latch and was swallowed, stranding the GM on Triggers.
  let checksSectionRequestNonce = $state(0);
  // The Graph surface (issue 442) is unimplemented; it stays a disabled placeholder
  // and, as of issue 745, renders only when experimental features are enabled.
  const placeholderViews = [
    {
      id: 'graph',
      // The rail id, as a COMPLETE LITERAL rather than a `manager-nav-${view.id}` template.
      // Both harnesses target every rail entry by id since issue 1362, and an interpolated one
      // is invisible to the source gate that checks the id is rendered at all — the same
      // weakening the View Lab's own hook scan records for a stem-built selector.
      navId: 'manager-nav-graph',
      icon: 'fas fa-project-diagram',
      labelKey: 'FABRICATE.Admin.Manager.Nav.Graph',
      fallback: 'Graph',
    },
  ];

  const selectedSystem = $derived($viewState.selectedSystem);
  const selectedSystemId = $derived(selectedSystem?.id || '');
  const systemsLoading = $derived($viewState.systemsLoading === true);
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
  // The essence property-macro gate (issue 1036). `features.propertyMacros` defaults to
  // FALSE, and it gates the editor's Macro section, the row's Macro capability pill and the
  // preview's macro row — the same way `effectTransfer` gates the source half. With both
  // off the On-craft tab renders an explanatory empty state rather than an empty tab.
  const showEssencePropertyMacroUi = $derived(selectedSystem?.features?.propertyMacros === true);
  const currentView = $derived(
    normalizedActiveView(activeView, selectedSystem, canShowEnvironments, canShowEssences)
  );
  const isToolStudioRoute = $derived(currentView === 'tools' || currentView === 'tool-edit');

  $effect(() => {
    if (!isToolStudioRoute) return;
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

  // The pure `evaluateSystemValidation` report, computed in the admin store from
  // the selected system's recipes/environments/components. Drives the GM system
  // overview view, its rail count badge, and the system-blocker banner.
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

  // Per-check activation state for the right-menu "Active" card. A check is only
  // toggleable when its resolution mode makes it optional (Simple); otherwise the
  // mode requires it and the card explains that.
  const checkActivation = $derived({
    crafting: {
      mode: selectedSystem?.resolutionMode || 'simple',
      // The crafting check is optional in simple and routedByIngredients (it runs
      // only when a roll formula is authored and checks are enabled); routedByCheck
      // and progressive REQUIRE it.
      //
      // ALCHEMY IS OPTIONAL AT `simple` AND REQUIRED AT `tiered`, read from the DRAFT
      // check mode so the rail's switch reflects what the GM has staged rather than what
      // was last saved. Alchemy used to report `optional: false` for all three modes,
      // which is what put the "cannot be turned off here" hint on a Simple check that has
      // a perfectly good off state — `checkMode: 'none'` — and left the GM no way to reach
      // it once "No check" stopped being a mode you pick. Tiered keeps the locked
      // always-on indicator: it routes result groups by outcome tier, so it cannot resolve
      // without a roll (see `_isCheckOutcomeSatisfied`).
      //
      // `enabled` IS THE MODE, not `craftingCheck.enabled`. The engine ignores that flag
      // for alchemy and dispatches on `alchemy.checkMode` alone, so reading it here would
      // have shown a switch position the engine never honours.
      optional:
        (selectedSystem?.resolutionMode || 'simple') === 'alchemy'
          ? alchemyCheckModeDraft !== 'tiered'
          : ['simple', 'routedByIngredients'].includes(selectedSystem?.resolutionMode || 'simple'),
      enabled:
        selectedSystem?.resolutionMode === 'alchemy'
          ? alchemyCheckModeDraft !== 'none'
          : craftingCheckActiveDraft,
    },
    salvage: {
      mode: selectedSystem?.salvageResolutionMode || 'simple',
      optional: (selectedSystem?.salvageResolutionMode || 'simple') === 'simple',
      enabled: salvageCheckActiveDraft,
    },
    // The system-level gathering check's shape is the gathering economy's
    // resolution mode. d100 is the fixed roll (optional/no enable toggle);
    // progressive/routed are editable checks with an Active toggle.
    gathering: {
      mode: gatheringResolutionMode,
      optional: gatheringResolutionMode === 'd100',
      enabled: gatheringCheckActiveDraft,
    },
  });

  // WHICH `craftingCheck` sub-config this system actually rolls — the SLOT — and therefore
  // which draft is edited, tracked dirty, saved by the top-right Save button, and read for
  // the recipe editor's "Check tier" options.
  //
  // IT IS THE ENGINE'S OWN ANSWER (issue 1096), not a second mapping beside it.
  // `checkModifierResolver` owns `CRAFTING_CHECK_SLOTS` / `ALCHEMY_CHECK_SLOTS`, and the copy
  // that stood here disagreed with it for exactly one configuration: alchemy at
  // `checkMode: 'tiered'`, which rolls the ROUTED slot. The Checks route renders the routed
  // editor there (its own derivation reads `alchemy.checkMode`), so a GM could edit that
  // draft — while this said `simple`, so the edit was never marked dirty and Save never
  // wrote it. The rail's readiness badge meanwhile evaluated the untouched simple draft
  // under routed rules. One derivation is the only way those cannot disagree.
  //
  // `null` means the mode rolls NO check: alchemy `checkMode: 'none'`, and any resolution
  // mode outside the canonical set. Nothing is dirty, nothing is saved and no tier options
  // are offered, which is the honest answer for a check that never runs.
  //
  // Only `routedByCheck` authors the tier-routing routed check; `routedByIngredients` shares
  // the simple pass/fail slot with `simple`. Collapsing those two here costs nothing
  // elsewhere, because the multi-set and routing behaviours are derived separately from the
  // RAW `resolutionMode` rather than from this value: `recipeMultiSetAllowed` gates more than
  // one ingredient/result set, and `recipeRoutingProvider` picks the routing basis ('check'
  // for routedByCheck, 'ingredientSet' for routedByIngredients). Both routed modes stay
  // covered there.
  // RESOLVED AGAINST THE DRAFT ALCHEMY MODE, not the persisted one, and only alchemy's
  // input is substituted (every other mode reads the same system it always did).
  //
  // The slot decides which draft is dirty-tracked and which one `Save checks` writes, so
  // resolving it from persisted state stranded the draft it was staged beside. Turn the
  // alchemy check ON and author a formula in one visit: the persisted mode is still `none`,
  // which resolves to slot `null`, so `craftingCheckDirty` read false for the simple draft
  // and Save wrote the mode but dropped the formula the GM had just typed. The two have to
  // be resolved from the same value to be saved together.
  const craftingCheckMode = $derived(
    resolveActiveCraftingCheckFormula(
      selectedSystem?.resolutionMode === 'alchemy'
        ? {
            ...selectedSystem,
            alchemy: { ...(selectedSystem?.alchemy || {}), checkMode: alchemyCheckModeDraft },
          }
        : selectedSystem
    ).slot
  );
  const craftingCheckDirty = $derived(
    alchemyCheckModeDirty ||
      craftingCheckActiveDirty ||
      (craftingCheckMode === 'routed' && checkRoutedDirty) ||
      (craftingCheckMode === 'simple' && checkSimpleDirty) ||
      (craftingCheckMode === 'progressive' && checkProgressiveDirty)
  );
  const craftingCheckSaving = $derived(
    checkRoutedSaving ||
      checkSimpleSaving ||
      checkProgressiveSaving ||
      alchemyCheckModeSaving ||
      craftingCheckActiveSaving
  );

  // The salvage check editor shown is selected by the salvage resolution mode.
  const salvageResolutionMode = $derived(selectedSystem?.salvageResolutionMode || 'simple');
  const salvageCheckDirty = $derived(
    salvageCheckActiveDirty ||
      (salvageResolutionMode === 'routed' && salvageRoutedDirty) ||
      (salvageResolutionMode === 'progressive' && salvageProgressiveDirty) ||
      (salvageResolutionMode === 'simple' && salvageSimpleDirty)
  );
  const salvageCheckSaving = $derived(
    salvageSimpleSaving ||
      salvageRoutedSaving ||
      salvageProgressiveSaving ||
      salvageCheckActiveSaving
  );

  // The gathering check editor shown is selected by the gathering economy's
  // resolution mode; d100 has no editable draft, so it is never dirty/saving.
  const gatheringCheckDirty = $derived(
    gatheringCheckActiveDirty ||
      (gatheringResolutionMode === 'routed' && gatheringRoutedDirty) ||
      (gatheringResolutionMode === 'progressive' && gatheringProgressiveDirty)
  );
  const gatheringCheckSaving = $derived(
    gatheringProgressiveSaving || gatheringRoutedSaving || gatheringCheckActiveSaving
  );

  // THE DRAFT MODEL LIVES ABOVE THE ROUTE (issue 1096).
  //
  // It used to be tab-aware: `checksDirty` reported only the ACTIVE sub-tab, and the header
  // Save persisted only that one. That was safe while the four activities were tabs inside
  // one view, because a switch between them never left the surface. They are ROUTES now, and
  // one click on `Components` leaves it — so a per-route dirty flag would have let an unsaved
  // crafting edit walk out of the building while the GM stood on Gathering, with the Unsaved
  // chip already gone.
  //
  // So: ONE dirty set across the four activities, and one plural `Save checks` that persists
  // every dirty one. The per-activity flags survive as the rail's own markers.
  const checksDirtyActivities = $derived(
    [
      craftingCheckDirty ? 'crafting' : '',
      salvageCheckDirty ? 'salvage' : '',
      gatheringCheckDirty ? 'gathering' : '',
    ].filter(Boolean)
  );
  const checksDirty = $derived(checksDirtyActivities.length > 0);
  const checksSaving = $derived(craftingCheckSaving || salvageCheckSaving || gatheringCheckSaving);

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
    resolveRecipeFixedOutcomeTierOptions(
      selectedSystem?.craftingCheck,
      selectedSystem?.resolutionMode
    )
  );

  // Why the system's active crafting check applies no check modifiers, or '' when it
  // does. Consumes the inert-cause derivation from the store's `craftingCheck`
  // projection (issue 1055), which resolves it from the PERSISTED system through the
  // shared five-mode selector. The recipe editor is not the surface authoring those formulas,
  // so the Checks-tab drafts are not in play here and the saved state is the truthful
  // one. Either cause makes a per-recipe override inert, so the Overview tab replaces
  // its control with a banner naming which; a bare boolean cannot say which. See
  // ChecksView.svelte's separate derivation for the draft-based consumer.
  const recipeCraftingModifierInertCause = $derived(
    selectedSystem?.craftingCheck?.modifierFormulaInertCause || ''
  );

  // Routed-check outcome tiers (active type) offered to the recipe editor's
  // check-mode result-set assignment control as {id, name}. Failure tiers are
  // excluded — a failed check produces no result set to route to.
  // POLICY-CONDITIONAL since issue 1098 (decision 7): success-filtered when the crafting
  // failure-result policy forbids failure results, unfiltered when it permits them, so a
  // GM can bind a result group to a failure-marked tier exactly where the engine will
  // route one. It is a SWAP between two functions the codebase already had, and
  // `systemValidation` feeds `recipeReadiness` from the same swap — the picker and the
  // readiness warnings can never disagree about which tiers are assignable.
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
  // Whether ANY outcome tier is defined (even failure-only). Lets the recipe
  // editor tell "no tiers authored" apart from "tiers exist but none is Success"
  // — both empty the option list above, but each needs a different hint.
  const recipeRoutedHasOutcomeTiers = $derived.by(() =>
    routedHasOutcomeTiers(selectedSystem?.craftingCheck?.routed)
  );
  // Whether this system's crafting failure-result policy permits results on a failed check
  // (issue 1098). Read through the shared predicate rather than compared to a literal, so
  // the editor's third empty hint and the engine's routing decision cannot disagree about
  // what an absent or unrecognized value means.
  const recipeFailureResultsAllowed = $derived(
    permitsFailureResults(selectedSystem?.craftingCheck?.failureResultPolicy)
  );

  // Salvage feature gate + the inputs the per-component salvage editor needs.
  const componentSalvageEnabled = $derived(selectedSystem?.features?.salvage === true);
  // Routed-salvage outcome tier NAMES (active type), used by the per-component
  // outcome-routing selects. Names map to result-group ids in component.salvage.
  // Policy-conditional on the same terms (issue 1098). Unfiltered until that issue, so it
  // offered failure tier names as DEAD OPTIONS: `salvage()` returned before
  // `_resolveSalvageResultGroups` on a failed check, and nothing ever routed through them.
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

  // ── COMPLICATIONS: the SYSTEM-scoped bag the component editor cannot derive (issue 1286) ─
  //
  // Which activities THIS system resolves progressively. The editor already holds
  // `salvageResolutionMode`, so left to itself it derives the salvage axis and nothing else —
  // which lit the complications section up for progressive-SALVAGE systems only and offered a
  // progressive-CRAFTING system no complications at all. Crafting's and gathering's modes live
  // on the system record and the gathering economy, neither of which reaches a component.
  //
  // `gatheringProgressive` is the SAME economy read `componentDifficultyAxisProgressive`
  // makes, so the three progressive axes agree across every surface that asks. Progressive
  // gathering is dormant pending issue 683; the section's own "· not progressive" annotation
  // is what tells the GM a complication authored for it is stored and will not fire.
  const complicationActivities = $derived({
    crafting: selectedSystem?.resolutionMode === 'progressive',
    salvage: salvageResolutionMode === 'progressive',
    gathering: gatheringProgressive,
  });

  // The named triggers on the three PROGRESSIVE check blocks, as `{ id, label, activity }`.
  //
  // Each activity's check block owns its OWN trigger id space, so an option that did not name
  // its activity would make two triggers reading "Roll total is at least 15" — one on
  // crafting, one on salvage — indistinguishable in the picker, and a GM could not tell which
  // one a complication was bound to.
  //
  // Only the PROGRESSIVE block of each activity is offered: a complication fires from a
  // progressive stage outcome, so a trigger on the simple or routed block has no moment to
  // reach it.
  const complicationTriggerOptions = $derived([
    ...complicationTriggersFor('crafting', selectedSystem?.craftingCheck?.progressive),
    ...complicationTriggersFor('salvage', selectedSystem?.salvageCraftingCheck?.progressive),
    ...complicationTriggersFor('gathering', selectedSystem?.gatheringCraftingCheck?.progressive),
  ]);

  /**
   * Resolve one summary FRAGMENT to a sentence. `summariseCondition` returns
   * `{ key, fallback, data }` and a datum may itself be a fragment (the comparator and
   * aggregate words are), so the nested ones are localized first — the same two-step
   * `CheckTriggers.phrase()` performs, because a one-step fill would render "[object Object]"
   * inside the sentence.
   */
  function complicationTriggerPhrase(fragment) {
    const data = Object.fromEntries(
      Object.entries(fragment.data ?? {}).map(([key, entry]) => [
        key,
        entry && typeof entry === 'object' ? text(entry.key, entry.fallback) : entry,
      ])
    );
    return interpolate(text(fragment.key, fragment.fallback), data);
  }

  /**
   * The `{ id, label, activity }` options for ONE activity's progressive check block.
   *
   * The label is the trigger's CONDITION SENTENCE, built by the very builder the Checks
   * Studio's trigger cards use. A trigger has no authored name, so an id would name nothing
   * to a GM, and a second sentence composed here would drift from the Studio's the first time
   * either is retuned. `parseDiceGroups` over the block's own roll formula is what lets a
   * per-die condition read "Lowest of 1d20 is 1" rather than naming a group number.
   */
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

  // The macro picker's options. The store already publishes `availableScriptMacros`
  // `type === 'script'`-filtered and name-sorted, so this is a pass-through and deliberately
  // NOT a second projection: a macro a GM can link here is exactly a macro the essence
  // property-macro picker can link, and two lists would disagree the first time either
  // filter moved.
  const complicationMacroOptions = $derived(selectedSystem?.availableScriptMacros || []);

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
    const resolutionModeChanged = !systemChanged && resolutionMode !== lastChecksResolutionMode;
    if (!systemChanged && !resolutionModeChanged) return;
    lastChecksSystemId = selectedSystemId;
    lastChecksResolutionMode = resolutionMode;
    checkRoutedDraft = cloneRoutedCheck(selectedSystem?.craftingCheck?.routed);
    checkRoutedBaseline = cloneRoutedCheck(selectedSystem?.craftingCheck?.routed);
    checkSimpleDraft = cloneSimpleCheck(selectedSystem?.craftingCheck?.simple);
    checkSimpleBaseline = cloneSimpleCheck(selectedSystem?.craftingCheck?.simple);
    checkProgressiveDraft = cloneProgressiveCheck(selectedSystem?.craftingCheck?.progressive);
    checkProgressiveBaseline = cloneProgressiveCheck(selectedSystem?.craftingCheck?.progressive);
    // Reseeded on a system switch alongside the three slot drafts. NOT on every refresh:
    // the guard above is what keeps a `Save checks` — which refreshes the store — from
    // clobbering a draft the GM is still editing, and this value needs that protection
    // exactly as much as the formulas do.
    alchemyCheckModeDraft = selectedSystem?.alchemy?.checkMode || 'none';
    alchemyCheckModeBaseline = selectedSystem?.alchemy?.checkMode || 'none';
    craftingCheckActiveDraft = readCheckActive(selectedSystem?.craftingCheck);
    craftingCheckActiveBaseline = readCheckActive(selectedSystem?.craftingCheck);
    // A same-system resolution-mode change never touches the salvage/gathering
    // checks; only reseed those on a genuine system switch so an open salvage/
    // gathering draft is not clobbered by a crafting-mode change.
    if (!systemChanged) return;
    const nextSalvage = selectedSystem?.salvageCraftingCheck;
    salvageCheckActiveDraft = readCheckActive(nextSalvage);
    salvageCheckActiveBaseline = readCheckActive(nextSalvage);
    salvageSimpleDraft = cloneSimpleCheck(nextSalvage?.simple);
    salvageSimpleBaseline = cloneSimpleCheck(nextSalvage?.simple);
    salvageRoutedDraft = cloneRoutedCheck(nextSalvage?.routed);
    salvageRoutedBaseline = cloneRoutedCheck(nextSalvage?.routed);
    salvageProgressiveDraft = cloneProgressiveCheck(nextSalvage?.progressive);
    salvageProgressiveBaseline = cloneProgressiveCheck(nextSalvage?.progressive);
    const nextGathering = selectedSystem?.gatheringCraftingCheck;
    gatheringCheckActiveDraft = readCheckActive(nextGathering);
    gatheringCheckActiveBaseline = readCheckActive(nextGathering);
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

  /**
   * Run ONE check save and ANSWER WHETHER IT LANDED (issue 1096).
   *
   * Every check save used to be `await store?.save…()` and nothing else, which made "did that
   * work?" an unanswerable question: a store no-op and a rejected `updateSystem` were both
   * indistinguishable from success, so the route-exit guard's Save branch navigated away from
   * unsaved work and a rejection escaped as an unhandled promise. The shipped essence and
   * system-details guards answer it with `result !== false` and are the pattern followed
   * here, with the rejection caught as well because the three check savers are the only ones
   * whose store call can reject rather than return.
   *
   * The draft is RE-BASELINED only on success, so a failed save leaves the activity dirty —
   * which is what keeps the rail marker, the Save button and the exit prompt all still
   * saying there is something to save.
   *
   * @param {{ save: () => unknown, rebaseline: () => void, setSaving: (on: boolean) => void }} steps
   * @returns {Promise<boolean>}
   */
  async function persistCheckDraft({ save, rebaseline, setSaving }) {
    setSaving(true);
    try {
      if ((await save()) === false) return false;
      rebaseline();
      return true;
    } catch (error) {
      console.error('Failed to save check draft', error);
      return false;
    } finally {
      setSaving(false);
    }
  }

  /**
   * Persist the staged alchemy check mode, if it moved.
   *
   * Runs BEFORE the slot draft below, and the order matters: the slot write reseeds the
   * store, and a mode that had not landed yet would be re-read as its old value. Both are
   * awaited inside one `saveCraftingCheck` so the pair lands under a single `Save checks`.
   */
  async function saveAlchemyCheckMode() {
    if (!alchemyCheckModeDirty) return true;
    return persistCheckDraft({
      save: () => store?.setAlchemyCheckMode?.(alchemyCheckModeDraft),
      rebaseline: () => {
        alchemyCheckModeBaseline = alchemyCheckModeDraft;
      },
      setSaving: (on) => {
        alchemyCheckModeSaving = on;
      },
    });
  }

  /**
   * Persist one activity's staged Active flag.
   *
   * The three share a shape, so they share a function: `enabled` is one boolean per activity
   * and the only thing that differs is which store action writes it.
   *
   * THE CALLER GUARDS ON DIRTY, and that is a timing contract rather than a style choice. Each
   * activity's save runs its flag before its slot draft, so an UNCONDITIONAL `await` here
   * would push every ordinary formula save one microtask later — enough to break the shipped
   * mounted tests that click Save and assert the store call on the next tick. Guarding at the
   * call site means a save with a clean switch awaits nothing extra at all.
   */
  async function persistCheckActive({ save, rebaseline, setSaving }) {
    return persistCheckDraft({ save, rebaseline, setSaving });
  }

  async function saveCraftingCheckActive() {
    return persistCheckActive({
      save: () => store?.saveCraftingCheckActive?.(craftingCheckActiveDraft),
      rebaseline: () => {
        craftingCheckActiveBaseline = craftingCheckActiveDraft;
      },
      setSaving: (on) => {
        craftingCheckActiveSaving = on;
      },
    });
  }

  async function saveCraftingCheck() {
    if (!selectedSystemId || craftingCheckSaving || !craftingCheckDirty) return true;
    // The mode and its slot draft are one save. `&&` is deliberate over an early return:
    // a failed mode write must not skip the formula the GM staged beside it, exactly as
    // `saveChecks` attempts every dirty activity rather than stopping at the first failure.
    let modeSaved = true;
    if (alchemyCheckModeDirty) modeSaved = await saveAlchemyCheckMode();
    if (craftingCheckActiveDirty) modeSaved = (await saveCraftingCheckActive()) && modeSaved;
    // EACH SLOT IS GUARDED ON ITS OWN DIRTY FLAG. The outer guard used to be enough, because
    // `craftingCheckDirty` meant "the active slot draft moved" and nothing else. It now also
    // reports a moved MODE, so an unguarded branch would write an untouched formula block —
    // one redundant `updateSystem` plus its store refresh — every time the GM only flipped
    // the Active switch.
    if (craftingCheckMode === 'routed' && checkRoutedDirty) {
      return (
        (await persistCheckDraft({
          save: () => store?.saveCraftingCheckRouted?.(checkRoutedDraft),
          rebaseline: () => {
            checkRoutedBaseline = cloneRoutedCheck(checkRoutedDraft);
          },
          setSaving: (on) => {
            checkRoutedSaving = on;
          },
        })) && modeSaved
      );
    }
    if (craftingCheckMode === 'simple' && checkSimpleDirty) {
      return (
        (await persistCheckDraft({
          save: () => store?.saveCraftingCheckSimple?.(checkSimpleDraft),
          rebaseline: () => {
            checkSimpleBaseline = cloneSimpleCheck(checkSimpleDraft);
          },
          setSaving: (on) => {
            checkSimpleSaving = on;
          },
        })) && modeSaved
      );
    }
    if (craftingCheckMode === 'progressive' && checkProgressiveDirty) {
      return (
        (await persistCheckDraft({
          save: () => store?.saveCraftingCheckProgressive?.(checkProgressiveDraft),
          rebaseline: () => {
            checkProgressiveBaseline = cloneProgressiveCheck(checkProgressiveDraft);
          },
          setSaving: (on) => {
            checkProgressiveSaving = on;
          },
        })) && modeSaved
      );
    }
    // No dirty slot draft: either this resolution mode rolls no crafting check, or the only
    // thing that moved was the alchemy check mode, which `saveAlchemyCheckMode` has answered.
    return modeSaved;
  }

  async function saveSalvageCheck() {
    if (!selectedSystemId || salvageCheckSaving || !salvageCheckDirty) return true;
    // The Active flag first, then the slot draft — and each slot guarded on its OWN dirty
    // flag, because `salvageCheckDirty` now also reports a moved switch. Without the guard a
    // GM who only flipped Active would rewrite an untouched formula block and pay a second
    // store refresh for it.
    let activeSaved = true;
    if (salvageCheckActiveDirty) {
      activeSaved = await persistCheckActive({
        save: () => store?.saveSalvageCheckActive?.(salvageCheckActiveDraft),
        rebaseline: () => {
          salvageCheckActiveBaseline = salvageCheckActiveDraft;
        },
        setSaving: (on) => {
          salvageCheckActiveSaving = on;
        },
      });
    }
    if (salvageResolutionMode === 'routed' && salvageRoutedDirty) {
      return (
        (await persistCheckDraft({
          save: () => store?.saveSalvageCheckRouted?.(salvageRoutedDraft),
          rebaseline: () => {
            salvageRoutedBaseline = cloneRoutedCheck(salvageRoutedDraft);
          },
          setSaving: (on) => {
            salvageRoutedSaving = on;
          },
        })) && activeSaved
      );
    }
    if (salvageResolutionMode === 'progressive' && salvageProgressiveDirty) {
      return (
        (await persistCheckDraft({
          save: () => store?.saveSalvageCheckProgressive?.(salvageProgressiveDraft),
          rebaseline: () => {
            salvageProgressiveBaseline = cloneProgressiveCheck(salvageProgressiveDraft);
          },
          setSaving: (on) => {
            salvageProgressiveSaving = on;
          },
        })) && activeSaved
      );
    }
    if (salvageResolutionMode === 'simple' && salvageSimpleDirty) {
      return (
        (await persistCheckDraft({
          save: () => store?.saveSalvageCheckSimple?.(salvageSimpleDraft),
          rebaseline: () => {
            salvageSimpleBaseline = cloneSimpleCheck(salvageSimpleDraft);
          },
          setSaving: (on) => {
            salvageSimpleSaving = on;
          },
        })) && activeSaved
      );
    }
    return activeSaved;
  }

  async function saveGatheringCheck() {
    if (!selectedSystemId || gatheringCheckSaving || !gatheringCheckDirty) return true;
    let activeSaved = true;
    if (gatheringCheckActiveDirty) {
      activeSaved = await persistCheckActive({
        save: () => store?.saveGatheringCheckActive?.(gatheringCheckActiveDraft),
        rebaseline: () => {
          gatheringCheckActiveBaseline = gatheringCheckActiveDraft;
        },
        setSaving: (on) => {
          gatheringCheckActiveSaving = on;
        },
      });
    }
    if (gatheringResolutionMode === 'routed' && gatheringRoutedDirty) {
      return (
        (await persistCheckDraft({
          save: () => store?.saveGatheringCheckRouted?.(gatheringRoutedDraft),
          rebaseline: () => {
            gatheringRoutedBaseline = cloneRoutedCheck(gatheringRoutedDraft);
          },
          setSaving: (on) => {
            gatheringRoutedSaving = on;
          },
        })) && activeSaved
      );
    }
    if (gatheringResolutionMode === 'progressive' && gatheringProgressiveDirty) {
      return (
        (await persistCheckDraft({
          save: () => store?.saveGatheringCheckProgressive?.(gatheringProgressiveDraft),
          rebaseline: () => {
            gatheringProgressiveBaseline = cloneProgressiveCheck(gatheringProgressiveDraft);
          },
          setSaving: (on) => {
            gatheringProgressiveSaving = on;
          },
        })) && activeSaved
      );
    }
    // d100 has no editable slot draft — its Active flag above is the only thing to persist.
    return activeSaved;
  }

  // The shared Checks header Save persists EVERY dirty activity (issue 1096), not just the
  // route in view. Sequential rather than concurrent: each of the three saves through the
  // store and re-baselines its own draft, and the store's publish is a two-phase projection
  // rebuild that three overlapping writers would race.
  //
  // It ANSWERS, and the answer is the conjunction rather than the last one: a Save that
  // persisted crafting and failed salvage has not saved the checks, and the route-exit guard
  // must not navigate away from the half that is still dirty. Every dirty activity is still
  // ATTEMPTED — a crafting failure does not cancel the salvage write — because the GM asked
  // to save all of them and stopping early would leave a second, unexplained casualty.
  async function saveChecks() {
    let saved = true;
    if (craftingCheckDirty) saved = (await saveCraftingCheck()) && saved;
    if (salvageCheckDirty) saved = (await saveSalvageCheck()) && saved;
    if (gatheringCheckDirty) saved = (await saveGatheringCheck()) && saved;
    return saved;
  }

  /**
   * The rail's Active switch, for all four activities. EVERY ONE STAGES — flip it and the
   * studio reports Unsaved, `Save checks` lights up, and Discard puts it back.
   *
   * ALCHEMY WRITES A CHECK MODE, not the `enabled` flag. Its on/off IS `alchemy.checkMode`,
   * which is what the engine dispatches on; the generic `craftingCheck.enabled` flag is
   * ignored for alchemy, so routing this switch there would have moved a control the engine
   * never consults while the brew rolled anyway.
   */
  function onToggleCheckActive(kind, enabled) {
    const on = enabled === true;
    if (kind === 'crafting' && selectedSystem?.resolutionMode === 'alchemy') {
      // `simple` is the only mode "on" can mean here. Tiered reports `optional: false`, so it
      // renders the locked indicator and never reaches this handler.
      alchemyCheckModeDraft = on ? 'simple' : 'none';
      return;
    }
    if (kind === 'crafting') craftingCheckActiveDraft = on;
    else if (kind === 'salvage') salvageCheckActiveDraft = on;
    else if (kind === 'gathering') gatheringCheckActiveDraft = on;
  }
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
  // `buildVocabularyUsage` helper (issue 689), which — unlike the pre-689 inline count —
  // also credits a tag for every recipe tag-placeholder ingredient (`match.type === 'tags'`)
  // that names it, so a tag only ever used as an ingredient filter no longer reads as
  // "Unused".
  //
  // The recipe half of that tag count arrives PRE-COUNTED from the store (issue 1081). This
  // derivation feeds the left nav rail's Tags & Categories badge, which is a sibling of the
  // view switch rather than a child of one, so it is evaluated on every render of the
  // manager in every view. Counting the placeholders here read `ingredientSets` and `steps`
  // off each projected row, and those are detail-tier fields sharing one memoized producer
  // — so an always-mounted badge deep-cloned the whole library before first paint. The
  // recipe CATEGORY count below stays here because `category` is a summary-tier field.
  // Passed RAW, with no `|| {}` default: an empty record is a legitimate pre-count (a system
  // with no tag placeholders at all), so `buildVocabularyUsage` has to treat `{}` as
  // authoritative — which means a defensive `|| {}` here would make its documented
  // "omit it and the walk runs here" fallback unreachable and turn "not published" into
  // "there are none". A tag referenced only by a recipe ingredient placeholder would then
  // read as unused and be offered for one-click deletion with no confirm strip.
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
  // Every category counter on the Tags & Categories screen reports the WHOLE vocabulary
  // — the GM's own entries plus the reserved General bucket — because General is a real,
  // referenceable category that recipes and components genuinely fall under (issue 878).
  // `buildCategoryRows` / `buildComponentCategoryRows` both emit General first, so a row
  // array's length already IS that total. The previous `custom*` fields subtracted
  // General here and fed the tab badge and the at-a-glance tile, while `VocabularyPanel`
  // counted it independently for its own entry chip — one screen, three numbers, two
  // meanings. The `baseCategories: 1` companion field was read by nothing and is gone
  // rather than left to invite a double count against these now-inclusive totals.
  const tagCategoryCounts = $derived({
    recipeCategories: categoryRows.length,
    componentCategories: componentCategoryRows.length,
    itemTags: tagRows.length,
    categoryReferences: tagCategoryUsage.categoryReferenceCount,
    componentCategoryReferences: tagCategoryUsage.componentCategoryReferenceCount,
    tagReferences: tagCategoryUsage.tagReferenceCount,
  });
  // The Tags & Categories screen shows one vocabulary tab at a time; the active tab
  // is owned here so the inspector's contextual help can follow it (the view is a
  // controlled component over this state). Each help block is a title plus three
  // glyph-led rows, rendered by the shared `ExplainerCard` (issue 881) — the same
  // primitive the Tool Studio's "How Tools work in Fabricate" card renders, so the two
  // right-hand panels no longer state one meaning at two heading and body scales.
  let tagsActiveTab = $state('recipe');
  const tagsHelp = $derived.by(() => {
    if (tagsActiveTab === 'component') {
      return {
        title: text(
          'FABRICATE.Admin.Manager.TagsCategories.ComponentHelpTitle',
          'How component categories work'
        ),
        items: [
          {
            icon: 'fas fa-cubes',
            text: text(
              'FABRICATE.Admin.Manager.TagsCategories.ComponentHelp1',
              'Every component belongs to General until you add categories to group them.'
            ),
          },
          {
            icon: 'fas fa-scroll',
            text: text(
              'FABRICATE.Admin.Manager.TagsCategories.ComponentHelp2',
              'Component categories are independent of recipe categories.'
            ),
          },
          {
            icon: 'fas fa-arrow-rotate-left',
            text: text(
              'FABRICATE.Admin.Manager.TagsCategories.ComponentHelp3',
              'Deleting a category reassigns its components back to General.'
            ),
          },
        ],
      };
    }
    if (tagsActiveTab === 'tag') {
      return {
        title: text(
          'FABRICATE.Admin.Manager.TagsCategories.TagHelpTitle',
          'How component tags work'
        ),
        items: [
          {
            icon: 'fas fa-tag',
            text: text(
              'FABRICATE.Admin.Manager.TagsCategories.TagHelp1',
              'Tags appear on components and on tag-placeholder ingredients in recipes.'
            ),
          },
          {
            icon: 'fas fa-font',
            text: text(
              'FABRICATE.Admin.Manager.TagsCategories.TagHelp2',
              'Tag names are normalised to lowercase so they stay consistent.'
            ),
          },
          {
            icon: 'fas fa-list-check',
            text: text(
              'FABRICATE.Admin.Manager.TagsCategories.TagHelp3',
              'A recipe can require any component carrying a tag instead of a specific item.'
            ),
          },
        ],
      };
    }
    return {
      title: text(
        'FABRICATE.Admin.Manager.TagsCategories.RecipeHelpTitle',
        'How recipe categories work'
      ),
      items: [
        {
          icon: 'fas fa-folder-tree',
          text: text(
            'FABRICATE.Admin.Manager.TagsCategories.RecipeHelp1',
            'Categories are flat — each recipe picks one, with no parent or child folders.'
          ),
        },
        {
          icon: 'fas fa-lock',
          text: text(
            'FABRICATE.Admin.Manager.TagsCategories.RecipeHelp2',
            'General is the reserved fallback for recipes without a custom category.'
          ),
        },
        {
          icon: 'fas fa-scroll',
          text: text(
            'FABRICATE.Admin.Manager.TagsCategories.RecipeHelp3',
            'Adding a category makes it selectable in the recipe editor immediately.'
          ),
        },
      ],
    };
  });
  // The reference-safety reassurance was a bare `.manager-muted` paragraph under its own
  // card title — the third re-derivation of the explainer (issue 881). One glyph-led row
  // in the shared card says the same thing at the shared scale.
  const tagsReferenceSafeItems = $derived([
    {
      icon: 'fas fa-shield-halved',
      text: text(
        'FABRICATE.Admin.Manager.TagsCategories.ReferenceSafeHint',
        'Deleting a referenced category reassigns its recipes and components to General; deleting a referenced tag strips it from the components that carry it. Nothing is left dangling.'
      ),
    },
  ]);
  const selectedCountFacts = $derived(buildSelectedCountFacts(selectedCounts));
  const enabledFeatureLabels = $derived(featureLabels(selectedSystem));
  const selectedGatheringConditionShortcuts = $derived(
    buildSelectedGatheringConditionShortcuts(selectedSystem, $viewState.gatheringConfig)
  );
  // The ONE authored modifier library (issue 1117). It is projected off the SYSTEM, not
  // the gathering config: crafting, salvage and gathering checks select over it, and the
  // gathering d100 drop rows, events and stamina costs reference it. Every surface that
  // reads a modifier reads this one derivation.
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
  // Units exist world-wide regardless of any one system, so the recipe editor must gate cost
  // affordances on the SYSTEM's explicit enable flag, not on unit presence. Threaded alongside
  // the units so existing requirements can render read-only (rather than vanish) when the
  // selected system has currency off.
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
  // How many crafting systems actually opt into the world's currency. The World > Currency
  // subtitle reports it so a GM who has configured a ladder that NO system uses can see that
  // immediately — the commonest way this feature looks broken when it is merely unadopted.
  const allSystems = $derived($viewState.systems || []);
  // Reads the projected `currencyEnabled` flag, NOT `requirements.currency.enabled`: the system
  // list is a deliberate allowlist projection that does not carry `requirements`, so the deep
  // read counted zero for every world and the subtitle reported every ladder as unadopted.
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
  // crafting system to be SELECTED. That second half is the part that is easy to get wrong — the
  // old `if (!selectedSystemId) return;` guards were correct while the library belonged to a
  // system and become a silent no-op once it does not, so a GM editing the library with no system
  // selected would click Add and watch nothing happen. Currency's handlers below dropped the same
  // guard for the same reason.
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

  // Currency is WORLD scope (issue 1278): none of these take a system id, and none of them
  // require a selected crafting system — a GM configures the world's coins from the World tab
  // before any system opts in.
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

  function characterModifierLibraryEntry(modifierId) {
    if (!modifierId) return null;
    return selectedSystemModifiers.find((entry) => entry.id === modifierId) || null;
  }

  function characterModifierLabelForRef(ref) {
    const entry = characterModifierLibraryEntry(ref?.modifierId);
    if (entry) return entry.label || entry.id;
    return text(
      'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.UnknownModifier',
      'Unknown modifier ({id})'
    ).replace('{id}', ref?.modifierId || '');
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
    const id = modifierId ?? selectedSystemModifiers[0]?.id ?? '';
    if (!id) return;
    const rows = gatheringTaskDropRows(editingGatheringTask);
    const row = rows.find((entry) => entry.id === rowId);
    if (!row) return;
    const refs = Array.isArray(row.characterModifiers) ? row.characterModifiers : [];
    const newRef = {
      id: `char-mod-${id}-${refs.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
      modifierId: id,
      operator: '+',
      min: null,
      max: null,
      expressionOverride: '',
    };
    updateGatheringTaskDrop(rowId, { characterModifiers: [...refs, newRef] });
  }

  let characterModifierSearchTerm = $state('');
  const characterModifierSearchSuggestions = $derived.by(() => {
    const term = characterModifierSearchTerm.trim().toLowerCase();
    if (!term) return [];
    const attached = new Set(
      (selectedGatheringDrop?.characterModifiers || []).map((ref) => ref.modifierId).filter(Boolean)
    );
    return selectedSystemModifiers.filter((entry) => {
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
    const attached = new Set(
      (editingGatheringEvent?.characterModifiers || []).map((ref) => ref.modifierId).filter(Boolean)
    );
    return selectedSystemModifiers.filter((entry) => {
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
    const viewportBottom =
      Number(globalThis.innerHeight || windowRef.innerHeight) ||
      documentRef?.documentElement?.clientHeight ||
      0;
    let parent = node?.parentElement;
    while (parent && parent !== documentRef?.documentElement) {
      const style = globalThis.getComputedStyle?.(parent);
      const overflow = `${style?.overflow || ''} ${style?.overflowY || ''} ${style?.overflowX || ''}`;
      if (/(auto|scroll|hidden|clip)/.test(overflow)) {
        const rect = parent.getBoundingClientRect?.();
        if (rect) {
          return {
            top: Math.max(viewportTop, rect.top),
            bottom: Math.min(viewportBottom || rect.bottom, rect.bottom),
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
    if (!biomeAvailable.some((option) => option.id === gatheringBiomePickerSelection)) {
      gatheringBiomePickerSelection = biomeAvailable[0]?.id || '';
    }
    const timeAvailable = gatheringConditionAvailableOptions(selectedGatheringDrop, 'timeOfDay');
    if (!timeAvailable.some((option) => option.id === gatheringTimeOfDayPickerSelection)) {
      gatheringTimeOfDayPickerSelection = timeAvailable[0]?.id || '';
    }
    const weatherAvailable = gatheringConditionAvailableOptions(selectedGatheringDrop, 'weather');
    if (!weatherAvailable.some((option) => option.id === gatheringWeatherPickerSelection)) {
      gatheringWeatherPickerSelection = weatherAvailable[0]?.id || '';
    }
  });

  let gatheringEventTimeOfDayPickerSelection = $state('');
  let gatheringEventWeatherPickerSelection = $state('');
  let gatheringEventBiomePickerSelection = $state('');
  $effect(() => {
    const biomeAvailable = gatheringConditionAvailableOptions(editingGatheringEvent, 'biome');
    if (!biomeAvailable.some((option) => option.id === gatheringEventBiomePickerSelection)) {
      gatheringEventBiomePickerSelection = biomeAvailable[0]?.id || '';
    }
    const timeAvailable = gatheringConditionAvailableOptions(editingGatheringEvent, 'timeOfDay');
    if (!timeAvailable.some((option) => option.id === gatheringEventTimeOfDayPickerSelection)) {
      gatheringEventTimeOfDayPickerSelection = timeAvailable[0]?.id || '';
    }
    const weatherAvailable = gatheringConditionAvailableOptions(editingGatheringEvent, 'weather');
    if (!weatherAvailable.some((option) => option.id === gatheringEventWeatherPickerSelection)) {
      gatheringEventWeatherPickerSelection = weatherAvailable[0]?.id || '';
    }
  });

  function gatheringEventModifierPickerSelection(kind) {
    if (kind === 'biome') return gatheringEventBiomePickerSelection;
    return kind === 'weather'
      ? gatheringEventWeatherPickerSelection
      : gatheringEventTimeOfDayPickerSelection;
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
    return (
      (modifier?.operator === '-' ? -1 : 1) * Math.abs(Math.trunc(Number(modifier?.value || 0)))
    );
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
    const next = signedToOperatorValue(
      String(gatheringModifierSignedValue(modifier) + (event.key === 'ArrowUp' ? 1 : -1))
    );
    event.currentTarget.value = gatheringModifierDisplayValue(next);
    updateGatheringDropModifier(rowId, kind, modifier.id, next);
  }

  function onGatheringEventModifierKeydown(kind, modifier, event) {
    event.stopPropagation();
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const next = signedToOperatorValue(
      String(gatheringModifierSignedValue(modifier) + (event.key === 'ArrowUp' ? 1 : -1))
    );
    event.currentTarget.value = gatheringModifierDisplayValue(next);
    updateGatheringEventConditionModifier(kind, modifier.id, next);
  }

  async function setCharacterModifierOverrideEnabled(rowId, ref, enabled, libraryEntry) {
    const expressionOverride = enabled ? libraryEntry?.expression || '' : '';
    await onUpdateDropCharacterModifier(rowId, ref.id, { expressionOverride });
  }

  async function onUpdateDropCharacterModifier(rowId, refId, patch) {
    if (!editingGatheringTask?.id || !rowId || !refId) return;
    const rows = gatheringTaskDropRows(editingGatheringTask);
    const row = rows.find((entry) => entry.id === rowId);
    if (!row) return;
    const refs = Array.isArray(row.characterModifiers) ? row.characterModifiers : [];
    const nextRefs = refs.map((ref) => (ref.id === refId ? { ...ref, ...patch } : ref));
    updateGatheringTaskDrop(rowId, { characterModifiers: nextRefs });
  }

  async function onDeleteDropCharacterModifier(rowId, refId) {
    if (!editingGatheringTask?.id || !rowId || !refId) return;
    const rows = gatheringTaskDropRows(editingGatheringTask);
    const row = rows.find((entry) => entry.id === rowId);
    if (!row) return;
    const refs = Array.isArray(row.characterModifiers) ? row.characterModifiers : [];
    const nextRefs = refs.filter((ref) => ref.id !== refId);
    if (nextRefs.length === refs.length) return;
    updateGatheringTaskDrop(rowId, { characterModifiers: nextRefs });
  }

  const visiblePlaceholderViews = $derived(
    selectedSystem
      ? placeholderViews.filter((view) => isViewAvailableForSystem(view, selectedSystem))
      : []
  );
  const showRecipeCategories = $derived(!!selectedSystem);
  const selectedRecipe = $derived(
    ($viewState.recipes || []).find((recipe) => recipe.id === selectedRecipeId) ||
      ($viewState.recipes || [])[0] ||
      null
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
  const recipeVisibilityEffect = $derived(
    craftingEffect(selectedSystem?.visibilityMode || 'knowledge')
  );
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
  const recipeEditDirty = $derived(
    Boolean(recipeDraft) && JSON.stringify(recipeDraft) !== JSON.stringify(recipeDraftBaseline)
  );
  const showComponentTags = $derived(
    itemCards.some((item) => item.showTags || (Array.isArray(item.tags) && item.tags.length > 0))
  );
  const showComponentEssences = $derived(
    itemCards.some(
      (item) => item.showEssences || (Array.isArray(item.essences) && item.essences.length > 0)
    )
  );
  const selectedComponent = $derived(
    itemCards.find((item) => item.id === selectedComponentId) || itemCards[0] || null
  );
  const essenceCards = $derived(
    $viewState.essenceCards || selectedSystem?.essenceDefinitions || []
  );
  const selectedEssenceStrict = $derived(
    essenceCards.find((essence) => essence.id === selectedEssenceId) || null
  );
  const isCreatingEssenceDraft = $derived(currentView === 'essence-edit' && !selectedEssenceId);
  const selectedEssence = $derived(selectedEssenceStrict || essenceCards[0] || null);
  const selectedEssenceForInspector = $derived(
    currentView === 'essence-edit' ? essenceEditDraft : selectedEssence
  );
  const canSaveEssenceEdit = $derived(
    essenceEditDirty === true && essenceEditDraft?.validName === true && essenceEditSaving !== true
  );
  // ── The essence bulk selection (issue 1036) ──────────────────────────────────────
  // Read straight off the LIFTED browser state, which `EssenceBrowserView` binds: the
  // browser assigns a NEW `Set` on every mutation, so this re-derives without a callback
  // prop or a second copy of the truth. The Component and Recipe Studio blocks are twins.
  const essenceBulkSelectedIds = $derived(essenceBrowserState.bulkSelectedEssenceIds ?? new Set());
  const essenceBulkSelectionCount = $derived(essenceBulkSelectedIds.size);
  // The PROJECTED rows, not the ids: the delete-impact statement unions carrier IDENTITIES
  // (`componentUsageItems` and `recipeUsageIds`), which live on the projection, and a sum of
  // per-essence counts would over-report every shared carrier.
  const essenceBulkSelectedRows = $derived(
    essenceCards.filter((essence) => essenceBulkSelectedIds.has(essence.id))
  );
  // Discard the staged draft when the selection empties — a clear, a system switch, a prune
  // that removed the last id, or a successful apply — and DISARM the delete whenever the
  // selection changes at all. An arm is a statement about a SPECIFIC set: once the set
  // moves, the impact sentence the GM read before arming is no longer the impact of
  // confirming, so the second click must not still be a confirmation.
  //
  // It reads the SET, not its size. The browser assigns a NEW `Set` on every mutation, so
  // the set identity is what "changes at all" actually means; a size dependency cannot see
  // a same-size swap, and every control happening to change the size today is a property of
  // the current controls rather than of this rule.
  $effect(() => {
    const selectedIds = essenceBulkSelectedIds;
    if (selectedIds.size === 0) essenceBulkDraft = createEssenceBulkDraft();
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
  // The expensive half of a component card — its linked source document, the "Missing"
  // verdict and the live description fallback — resolves on demand (issue 1081), and
  // `ComponentsBrowserView` only ever asks for the page it renders. Both cards above are
  // resolved from the WHOLE cohort rather than from that page, so unless this asks, nothing
  // does. Three independent routes reach an un-asked-for card:
  //   - first open, where `selectedComponentId` is still empty so the inspector falls back
  //     to `itemCards[0]` — the manager's STORED order, while the browser renders the
  //     name-sorted page 1, so on any library past one page the default selection is
  //     off-page from the moment the studio opens;
  //   - a selection made on one page and still held after paging elsewhere, because every
  //     refresh rebuilds every card un-hydrated and only the rendered page is re-asked;
  //   - the component editor, which UNMOUNTS the browser entirely — and Replace source /
  //     Unlink source refresh without navigating away from it.
  // Left un-asked, all three render the pre-hydration reading permanently: "No description
  // has been added." for a compendium-linked component whose prose lives on the source
  // document, which is the regression issue 676 filed and issue 800 preserved, and an accent
  // `Compendium` / `Items Directory` pill telling the GM a dangling link is healthy.
  //
  // Called off the card rather than through the projection's `hydrateItemCards` helper for
  // the reason `ComponentsBrowserView` states at its own effect: importing that store module
  // here would pull it into the dependency closure of every mounted suite rendering this
  // tree, where a module missing from the harness allowlist HANGS the suite rather than
  // failing it. A card with no `hydrate` — a fixture's plain object — is left as it is.
  //
  // The rejection is swallowed deliberately: a card that could not resolve keeps its
  // un-hydrated reading, which renders correctly rather than blankly, and the projection
  // drops its memo on rejection so the next render retries rather than re-throwing forever.
  $effect(() => {
    for (const card of [selectedComponent, componentForEdit]) {
      card?.hydrate?.()?.catch?.(() => {});
    }
  });
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
    $viewState.gatheringConfig?.systems?.[selectedSystemId]?.economy?.resolutionMode ===
      'progressive'
  );
  // The SYSTEM-scoped half of that question, extracted so three surfaces can share it
  // (issue 772): the single-component editor control, the browser row's read-only DC
  // badge, and the browser's bulk-edit progressive-DC section. It carries NO view and NO
  // selection term — `componentDifficultyShown` below adds those back for the editor —
  // because the two browser surfaces are, by definition, not in the editor: reusing the
  // view-scoped predicate there would render both of them NEVER, and pass vacuously.
  const componentDifficultyAxisProgressive = $derived(
    selectedSystem?.resolutionMode === 'progressive' ||
      salvageResolutionMode === 'progressive' ||
      gatheringProgressive
  );
  // Behaviour-preserving by construction: the same three axes ANDed with the same two view
  // terms this derivation always had. It gates the editor control's VISIBILITY and the
  // difficulty fold-in on the SAVE path (`saveComponentEdit`), so the rewrite has to hold
  // for both — nothing under `tests/` names it.
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
  // ── The bulk selection (issue 772) ───────────────────────────────────────────────
  // Read straight off the LIFTED browser state, which `ComponentsBrowserView` binds: the
  // browser assigns a NEW `Set` on every mutation, so this re-derives without a callback
  // prop or a second copy of the truth.
  const componentBulkSelectedIds = $derived(
    componentBrowserState.bulkSelectedComponentIds ?? new Set()
  );
  const componentBulkSelectionCount = $derived(componentBulkSelectedIds.size);
  const componentBulkSelectedCards = $derived(
    itemCards.filter((item) => componentBulkSelectedIds.has(item.id))
  );
  const componentBulkCategoryOptions = $derived(
    componentCategoryOptions(itemCards, selectedSystem?.componentCategories || [])
  );
  // What deleting the current selection would do (issue 1129). Derived from the STORE rather
  // than from the selected cards, because the "recipes disabled" number depends on the whole
  // selection against real recipe bodies — see `adminStore.describeComponentDelete`.
  const componentBulkDeleteImpact = $derived(
    store.describeComponentDelete?.(componentBulkSelectedIds) ?? {
      deletable: 0,
      deletableIds: [],
      recipesRewritten: 0,
      recipesDisabled: 0,
    }
  );
  // Discard the staged draft when the selection empties — a clear, a system switch, a prune
  // that removed the last id, or a successful apply — and DISARM the delete whenever the
  // selection changes at all. An arm is a statement about a SPECIFIC set: once the set moves,
  // the impact sentence the GM read before arming is no longer the impact of confirming, so
  // the second click must not still be a confirmation. The Essence Studio's twin above is
  // where this rule is stated at length.
  //
  // It reads the SET, not its size, for the reason recorded there: the browser assigns a NEW
  // `Set` on every mutation, so set identity is what "changes at all" means, and a size
  // dependency cannot see a same-size swap.
  $effect(() => {
    const selectedIds = componentBulkSelectedIds;
    if (selectedIds.size === 0) componentBulkDraft = createComponentBulkDraft();
    componentBulkDeleteArmed = false;
  });
  // ── The recipe bulk selection (issue 1010) ───────────────────────────────────────
  // Read straight off the LIFTED browser state, which `RecipesBrowserView` binds: the
  // browser assigns a NEW `Set` on every mutation, so this re-derives without a callback
  // prop or a second copy of the truth. The Component Studio's block above is the twin.
  const recipeBulkSelectedIds = $derived(recipeBrowserState.bulkSelectedRecipeIds ?? new Set());
  const recipeBulkSelectionCount = $derived(recipeBulkSelectedIds.size);
  // The PROJECTED rows, not the ids: the blocked-enable forecast reads `enableBlocked` and
  // `enabled`, both of which live on the projection the browser renders.
  const recipeBulkSelectedRows = $derived(
    ($viewState.recipes || []).filter((recipe) => recipeBulkSelectedIds.has(recipe.id))
  );
  // The SAME predicate the row's `Can't enable` pill reads, so the panel's count and the
  // pilled rows are one set by construction rather than by convention. It is 0 unless
  // `Enable` is actually staged — nothing can be refused by a disable or a leave-alone.
  const recipeBulkBlockedCount = $derived(
    countBlockedRecipeEnables(recipeBulkSelectedRows, recipeBulkDraft?.status)
  );
  // How many of the SELECTED recipes each recipe book holds — the `holds n of {total}`
  // figure the bulk panel's book picker states, and what its Add / Remove counts and
  // disabled states are derived from.
  //
  // Derived from the same PROJECTED ROWS, and that is the load-bearing part. Each row's
  // `recipeItemIds` comes from `recipeItemDefinitionsContaining`, which takes the system's
  // `membershipResolvesByRecipeIds` marker as a parameter and is therefore basis-aware.
  // Counting from `recipeItemDefinitions[].recipeIds` instead would report "holds none
  // selected" on every legacy-basis system — where membership still resolves through the
  // `recipe.recipeItemId` scalar and a book's own array is empty — and would disable Remove
  // on exactly the worlds this axis exists to fix.
  const recipeBulkBookMembership = $derived(countRecipeBookMembership(recipeBulkSelectedRows));
  // The axis gate reuses the EXISTING `recipeCheckTierOptions` derived rather than
  // re-resolving the tier list: `resolveRecipeCheckTierOptions` is the single source of
  // truth for which tiers a system offers, and this helper only explains an empty list.
  const recipeBulkCheckTierAxis = $derived(
    describeRecipeCheckTierAxis({
      craftingCheck: selectedSystem?.craftingCheck,
      craftingCheckMode,
      tierOptions: recipeCheckTierOptions,
    })
  );
  // The system's AUTHORED vocabulary, which is what the single-recipe editor's own select
  // offers — not the browser filter's in-use tally, which would make an authored but
  // currently unused category unreachable as an assignment target.
  const recipeBulkCategoryOptions = $derived(
    getEffectiveRecipeCategories(selectedSystem?.categories || [])
  );
  // What deleting the current selection would do (issue 1132). Derived from the STORE, not
  // from the projected rows: the learner count needs actor flags and the recipe-item count
  // needs the system's definitions with its membership basis, neither of which is in the
  // row projection — and the store counts through the SAME leaf the write executes
  // through, so the stated numbers cannot drift from the performed ones.
  //
  // THE `$viewState` READ IS A DEPENDENCY, NOT A LEFTOVER (review round). Everything
  // `describeRecipeDelete` consults is invisible to the rune graph — `get(selectedSystemId)`
  // is a `svelte/store` read, `getSystem()` walks a plain Map, and the learner index is a
  // plain `let` — so the selection was the derivation's ONLY trigger. Concretely: select
  // three recipes, stage "add to Book X" in this same panel, Apply (the selection survives;
  // only a count reaching zero discards state) and the card still read "Will be removed
  // from 1 book or scroll" while the confirm pruned two. Taking the projection the store
  // republishes on every `refresh()` makes the card recompute whenever the world it counts
  // over has been re-read. It does NOT make the card recompute on an external actor-flag
  // write with no refresh behind it — the store's stale-index marker is the other half of
  // that, see `adminStore.markLearnedRecipeIndexStale`.
  //
  // Deliberately NOT applied to `componentBulkDeleteImpact` above: that path ships as it is,
  // and widening its dependency is a change to a shipped studio this change does not owe.
  const recipeBulkDeleteImpact = $derived.by(() => {
    void $viewState;
    return (
      store.describeRecipeDelete?.(recipeBulkSelectedIds) ?? {
        deletable: 0,
        deletableIds: [],
        recipeItemsAffected: 0,
        recipeItemIds: [],
        learnersAffected: 0,
        learnerIds: [],
      }
    );
  });
  // Discard the staged draft whenever the selection empties — a clear, a system switch, a
  // prune that removed the last id, or a successful apply. The panel is unmounted at that
  // point, so this is the only place the discard can honestly happen.
  //
  // It reads the COUNT, and that is deliberate rather than an oversight: retargeting it to
  // the Set identity — as the Component Studio's single combined effect is keyed — would
  // discard a staged draft on every selection change, which is a regression of issue 1010's
  // whole staging model. The arm needs the other dependency, so it gets its own effect
  // below rather than folding into this one.
  $effect(() => {
    if (recipeBulkSelectionCount === 0) recipeBulkDraft = createRecipeBulkDraft();
  });
  // DISARM the delete whenever the selection changes at all. An arm is a statement about a
  // SPECIFIC set: once the set moves, the impact sentence the GM read before arming is no
  // longer the impact of confirming, so the second click must not still be a confirmation.
  //
  // It reads the SET, not its size, and the honest reason is narrower than the one issue
  // 1132's delta gives. The delta motivates it as "a size dependency cannot see a same-size
  // swap"; MEASURED AGAINST THE SHIPPED BROWSER, no such swap is reachable. Every mutation
  // `RecipesBrowserView` performs changes the count — untick then tick is two flushes, the
  // phantom-id prune assigns only `if (pruned.size !== current.size)`, and
  // `Select all N results` is hidden once every filtered row is selected. So a
  // count-keyed disarm would behave identically today, and the mutation proof for that
  // claim comes back GREEN. What the Set dependency actually buys is that this effect is
  // keyed on the reactive unit the state IS — `bulkSelectedRecipeIds` is reassigned, never
  // mutated — so it stays correct if a future republish does produce an equal-sized set,
  // and it matches the Component Studio's shipped effect rather than inventing a second
  // convention. It is robustness and consistency, not a live defect fix; the test below
  // says the same rather than dressing an unreachable case up as coverage.
  //
  // It is a SECOND effect rather than a clause added to the one above, and that part is
  // load-bearing: folding the disarm in would either leave the draft discard keyed on the
  // count (fine) or retarget the draft discard to the Set (a regression of issue 1010,
  // discarding a staged draft on every selection change).
  $effect(() => {
    void recipeBulkSelectedIds;
    recipeBulkDeleteArmed = false;
  });
  const environmentList = $derived($viewState.environments || []);
  const environmentValidationCount = $derived(
    Array.isArray($viewState.environmentValidationState?.errors)
      ? $viewState.environmentValidationState.errors.length
      : 0
  );
  const selectedEnvironmentId = $derived(
    $viewState.selectedEnvironmentId || $viewState.environmentDraft?.id || ''
  );
  const environmentDraftForDisplay = $derived($viewState.environmentDraft || null);
  const shouldUseEnvironmentDraftForDisplay = $derived(
    Boolean(environmentDraftForDisplay) &&
      (currentView === 'environment-edit' ||
        $viewState.environmentDraftDirty === true ||
        $viewState.environmentDraftIsNew === true ||
        environmentDraftForDisplay.id === selectedEnvironmentId)
  );
  const selectedEnvironment = $derived(
    shouldUseEnvironmentDraftForDisplay
      ? environmentDraftForDisplay
      : environmentList.find((environment) => environment.id === selectedEnvironmentId) ||
          environmentList.find(
            (environment) => environment.id === environmentDraftForDisplay?.id
          ) ||
          environmentList[0] ||
          null
  );
  const selectedEnvironmentFacts = $derived(environmentFacts(selectedEnvironment));
  const selectedEnvironmentSceneState = $derived(environmentSceneState(selectedEnvironment));
  const gatheringNavItems = [
    {
      id: 'environments',
      icon: 'fas fa-seedling',
      labelKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.Environments',
      labelFallback: 'Environments',
    },
    {
      id: 'tasks',
      icon: 'fas fa-list-check',
      labelKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.Tasks',
      labelFallback: 'Tasks',
      titleKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.TasksTitle',
      titleFallback: 'Gathering Tasks',
      hintKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.TasksHint',
      hintFallback: 'Browse gathering tasks before attaching them to environments.',
    },
    {
      id: 'encounters',
      icon: 'fas fa-masks-theater',
      labelKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.Encounters',
      labelFallback: 'Events',
      titleKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersTitle',
      titleFallback: 'Gathering events',
      hintKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersHint',
      hintFallback: 'Browse reusable events before attaching them to environments.',
    },
    {
      id: 'settings',
      icon: 'fas fa-sliders',
      labelKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.Settings',
      labelFallback: 'Settings',
      titleKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.SettingsPlaceholderTitle',
      titleFallback: 'Gathering settings',
      hintKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.SettingsPlaceholderHint',
      hintFallback: 'Set system-level rules for gathering.',
    },
  ];
  // The SELECTED SYSTEM's participation in Travel & Realms (issue 1282). It no longer gates a
  // route: the realm library is world scope and World > Travel is always reachable. What it
  // still gates is this system's environment realm controls and its party overrides.
  const gatheringRealmsEnabled = $derived($viewState.gatheringRealmSettings?.enabled === true);
  // A party's current-realm override is per-selected-system, so it needs that system to take
  // part: the gathering feature AND its Travel & Realms toggle. `adminStore`'s
  // `canUsePartyRealmOverrides` states the same rule on the write side; re-stating it here
  // against the LIVE projection is what stops a stale flag outliving the capability when
  // gathering is switched off or the selection is cleared under the GM.
  const partyRealmOverridesAvailable = $derived(
    canShowEnvironments &&
      gatheringRealmsEnabled &&
      $viewState.partyRealmOverridesAvailable === true
  );
  const partyRealmOverridesUnavailableHint = $derived(
    !selectedSystem || selectedSystem?.features?.gathering !== true
      ? text(
          'FABRICATE.Admin.Manager.World.PartyOverrideGatheringRequired',
          'Select a crafting system with Gathering enabled to set a current-realm override.'
        )
      : !gatheringRealmsEnabled
        ? text(
            'FABRICATE.Admin.Manager.World.PartyOverrideTravelRequired',
            'Enable Travel & Realms in this system\u2019s settings to set a current-realm override.'
          )
        : ''
  );
  const displayedGatheringTab = $derived(activeGatheringTab);
  const visibleGatheringNavItems = gatheringNavItems;
  const gatheringInspectorTabs = $derived(
    visibleGatheringNavItems.filter((tab) => tab.id !== 'environments')
  );
  const isWorldRoute = $derived(currentView === 'world');
  const isWorldDowntimeRoute = $derived(currentView === 'world-downtime');
  // World > Currency (issue 1278). UNGATED, like Parties and unlike experimental-gated Downtime:
  // a GM has to be able to configure the world's coins BEFORE any crafting system opts in, so
  // gating this on a system having currency enabled would be a chicken-and-egg lock-out.
  const isWorldCurrencyRoute = $derived(currentView === 'world-currency');
  // World > Rules & Resources (issue 1311). THREE SIBLING ROUTES under one rail group, rather
  // than one route with a sub-tab variable as Travel and Downtime use. The reason is concrete:
  // Travel's model would force a rename of `world-currency`, churning three View Lab cases and
  // their `expectView` assertions, the route-scoped CSS, the spec section and the docs page, for
  // nothing a GM could see. The Checks group is the precedent for a group whose children are
  // real routes.
  const isWorldPrerequisitesRoute = $derived(currentView === 'world-prerequisites');
  const isWorldModifiersRoute = $derived(currentView === 'world-modifiers');
  const isWorldRulesRoute = $derived(
    isWorldCurrencyRoute || isWorldPrerequisitesRoute || isWorldModifiersRoute
  );
  // -- World scoped-entity routes (issue 1362, epic 1357) --------------------------------
  //
  // SEVEN NEW TOKENS, and the system tokens (`components`, `essences`, `tools`, `tags`) are
  // PRESERVED unrenamed: those screens get new TITLES in this change, not new routes, so
  // every deep link, every `expectView` and every stored `activeView` keeps resolving.
  //
  // Six of the seven are the component / essence / tool pairs -- a catalogue and an entry
  // editor each. The seventh, `world-vocabulary`, is the World Vocabulary and is deliberately
  // NOT a scoped-entity layer: it holds the category and tag vocabularies those entities draw
  // FROM, which is why it carries its own spec requirement rather than sharing theirs.
  //
  // EVERY ONE IS REACHABLE WITH NO CRAFTING SYSTEM SELECTED, which is the normal state for a
  // world screen. That is why they join the world pass-through in `normalizedActiveView`
  // AHEAD of its `if (!system) return 'systems'` fallthrough, are absent from `setView`'s
  // `!selectedSystem` refusal, and are absent from `SCOPE_BROWSER_BY_VIEW` -- a world route
  // has no per-system record to be stranded on when the scope select changes.
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
  // The world corpus behind the rail leaves' count badges. Read from the store's TOP-LEVEL
  // `worldScope` key rather than from `selectedSystem`, because on these routes there may be
  // no selected system at all.
  const worldScopeState = $derived($viewState.worldScope || {});
  const worldScopedCounts = $derived({
    components: worldScopeState.component?.entities?.length ?? 0,
    essences: worldScopeState.essence?.entities?.length ?? 0,
    tools: worldScopeState.tool?.entities?.length ?? 0,
    // The World Vocabulary count, WIRED NOW even though its corpus arrives with PR 7, and the
    // reason is a one-way door: `### GM World Scoped Entity Routes` requirement 7 bars every
    // later PR in this epic from touching this file, so a badge omitted here could never be
    // added.
    //
    // BOTH HALVES ARE WIRED, not just this one. `worldScopeProjection.js` publishes
    // `worldScope.vocabulary.total` today — 0 until a vocabulary store exists — and
    // `adminStore`'s `_worldScopeStores` already reads an optional fourth `vocabulary` leg, so
    // PR 7 registers its store and its projection without reopening either gateway file. The
    // field name `total` is the contract between the two; `### GM World Vocabulary Route`
    // names it and `tests/world-scope-projection.test.js` pins it.
    vocabulary: worldScopeState.vocabulary?.total ?? 0,
  });

  // ── THE WORLD-SCOPE DATA SEAM (issue 1374) ─────────────────────────────────────────────
  //
  // Everything a scoped-entity screen needs to draw itself against the world corpus, bundled
  // once per entity type and spread at each of the TWELVE call sites that take one: the six
  // world entity pages and the six system-scope entity views.
  //
  // IT IS HERE BECAUSE THERE IS NOWHERE ELSE. This corpus registers no component context and
  // exports no store singleton, and no manager component imports a store module, so a DECLARED
  // PROP is the only route a value has into a child. Requirement 7 of
  // `### GM World Scoped Entity Routes` closes this file to the lanes that draw those screens,
  // which is exactly why the seam they read is wired once, here, ahead of them.
  //
  // THREE BUNDLES, NOT THIRTEEN LITERAL BLOCKS. Thirteen near-identical four-line prop blocks
  // in one file is the shape SonarCloud's new-code duplication gate counts, and `.svelte` IS
  // duplication-analysed.
  //
  // PER ENTITY TYPE, NEVER THE WHOLE FAMILY. Handing a page `store.worldScope` would let a
  // component screen address `worldScope.tool.setEnabled`. A family's KEY SET is part of its
  // contract — only the component family has `setWorldTags`, and none of them has a
  // `setEnabled` the component path must not offer — so each screen gets its own family and
  // `'setEnabled' in actions` stays false where a screen tests it.
  //
  // `systemId` ON A WORLD PAGE IS NOT A LEAK. The bundle is ONE concept, and a world ENTRY
  // editor legitimately marks the row for the system the GM is working in. A page that does
  // not need it ignores it, exactly as today's placeholders ignore `onOpenEntry`.
  //
  // EVERY FIELD TOLERATES ABSENCE. `adminStore` seeds the full `worldScope` shape on its very
  // first publish, so in production none of these fallbacks fires; the case they exist for is
  // a mounted test driving a hand-written `viewState`.
  const worldScopeSystems = $derived(allSystems);
  const componentScopeProps = $derived({
    scope: worldScopeState.component ?? null,
    actions: store?.worldScope?.component ?? null,
    systems: worldScopeSystems,
    systemId: selectedSystemId || '',
  });
  const essenceScopeProps = $derived({
    scope: worldScopeState.essence ?? null,
    actions: store?.worldScope?.essence ?? null,
    systems: worldScopeSystems,
    systemId: selectedSystemId || '',
  });
  const toolScopeProps = $derived({
    scope: worldScopeState.tool ?? null,
    actions: store?.worldScope?.tool ?? null,
    systems: worldScopeSystems,
    systemId: selectedSystemId || '',
  });

  // WHICH WORLD ENTITY AN ENTRY ROUTE IS OPEN ON (issue 1362).
  //
  // The three entry routes are the only World screens whose trail is THREE crumbs — the
  // prototype's `crumbFor` maps an entry to `[World, <catalogue>, <entity name>]`, with the
  // middle crumb clickable back to the catalogue. That middle crumb is the only way back out
  // of an entry editor, which is released to full width and so has no inspector to carry one.
  //
  // IT IS ROOT STATE BECAUSE THE BREADCRUMB IS SHELL CHROME. A page cannot render a crumb, and
  // requirement 7 of `### GM World Scoped Entity Routes` closes this file to PRs 6a, 6b and 6c
  // — so the subject a later lane will choose has to be expressible through a prop it already
  // has. `onOpenEntry` is that prop: a catalogue row calls it with the entity id, this shell
  // performs the navigation, and the third crumb follows from the published corpus with no
  // further edit here.
  let worldScopedEntryId = $state('');
  const worldScopedEntryRoute = $derived(scopedEntryRoute(currentView));
  const worldScopedEntryCrumb = $derived(
    scopedEntryName(
      worldScopeState[worldScopedEntryRoute?.entityType]?.entities,
      worldScopedEntryId
    )
  );

  // Open an entry route ON a world entity. Routed through the same confirm-discard gate every
  // other navigation passes, and the subject is recorded only once that gate has allowed the
  // move — a refused exit must not leave the shell naming a record it did not navigate to.
  function openWorldScopedEntry(view, entityId) {
    const nextEntryId = typeof entityId === 'string' ? entityId : String(entityId ?? '');
    return afterTruthyResult(confirmRouteExit(view), () => {
      worldScopedEntryId = nextEntryId;
      activeView = view;
    });
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
  const FULL_WIDTH_VIEWS = Object.freeze([
    {
      id: 'environment-edit',
      layoutClass: 'full-width-2-track',
      selector: '.fabricate-manager[data-manager-view="environment-edit"] .manager-body',
      predicate: (view) => view === 'environment-edit',
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
    // The seven world scoped-entity routes. Written OUT rather than mapped from
    // `WORLD_SCOPED_VIEWS`: the gate parses this file's SOURCE for literal selector strings,
    // and an interpolated one would yield nothing to compare against the stylesheet -- the
    // same weakening an interpolated id inflicts on the View Lab source-hook check.
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
  // The ONE read of the set. `null` means the route keeps its inspector.
  const fullWidthLayout = $derived(
    FULL_WIDTH_VIEWS.find((entry) =>
      entry.predicate(currentView, { travelTab: activeTravelTab })
    ) ?? null
  );
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
  // World > Travel (issue 1282). UNGATED for the same reason World > Currency is: the realm
  // library is world geography, and a GM has to be able to author a valley before deciding
  // which crafting systems care about it. The per-system Travel & Realms toggle governs
  // consumption — environment gating and party overrides — never reachability of this page.
  const isWorldTravelRoute = $derived(currentView === 'world-travel');
  // ONE attribute answering "which World travel destination is on screen", written once so
  // the markup carries no nested ternary. Parties still reports through `activeTravelTab`
  // because World > Parties has not moved off it yet.
  const worldTravelTabAttribute = $derived.by(() => {
    if (isWorldTravelRoute) return worldTravelTab;
    return isWorldRoute ? activeTravelTab : undefined;
  });
  // THE WORLD > DOWNTIME EXPERIMENTAL GATE (issue 1257), and it is TEMPORARY.
  //
  // The route exists to host the premium Downtime Studio, and the Studio is unreleased: both
  // seams it needs are on `main` and in no published version. Until it ships, the route and
  // everything that advertises it — including the premium call to action Core renders when no
  // companion is installed — are shown only to a GM who has opted into experimental features,
  // exactly as the unimplemented Graph placeholder is (issue 745, `isViewAvailableForSystem`).
  // Delete this pair and its readers when the Studio releases; nothing here is a design rule.
  //
  // ONE PREDICATE, read in three places and DELIBERATELY NOT IN A FOURTH. The rail group's
  // `{#if}` and the two route entries are what make the route unreachable: nothing can produce a
  // `world-downtime` token without passing an entry, and every entry consults this. Adding the
  // read to `normalizedActiveView` as well looks like defence in depth and is not — that function
  // has one caller and is always handed `activeView`, so the branch is unreachable on arrival,
  // and the only state it CAN act on is the one below, where acting is the wrong thing to do.
  //
  // TURNING THE SETTING OFF UNDER A GM WHO IS ON THE ROUTE HIDES THE RAIL ENTRY AND LEAVES THE
  // PANEL. `currentView` is a `$derived`, so a gate read in the normalizer would resolve the
  // route away in the same flush the setting moved in — unmounting the extension host, which runs
  // a mounted companion's cleanup and destroys its unsaved work without ever consulting the
  // `onBeforeNavigate` guard every other exit from this route honours. A GM's in-progress edit is
  // not ours to discard because a setting changed. So the open panel stays until the GM navigates
  // away, and that navigation is the ordinary guarded exit it has always been. They cannot come
  // back: the rail entry is gone and both entries refuse.
  const worldDowntimeAvailable = $derived(experimentalFeaturesEnabled);
  // A registered provider holds the surface until it faults; otherwise Core's own preview
  // does. `WORLD_DOWNTIME_PREVIEW_PROVIDER` is one implementation of the same interface, so
  // the rail, the route chrome and — in core-fallback only — the preview's tab strip all read
  // ONE tab list either way.
  const downtimeProvider = $derived(
    downtimeProviderSnapshot && downtimeProviderSnapshot !== downtimeFaultedProvider
      ? downtimeProviderSnapshot
      : null
  );
  const downtimeCoreFallback = $derived(downtimeProvider === null);
  // The union of both registries' claimed surfaces. The two id namespaces are separate by
  // design (one companion may claim `downtime` in both windows), so this is a concatenation
  // and never a set: it is only ever read for its length.
  const registeredSurfaceIds = $derived([
    ...managerRegisteredSurfaceIds,
    ...playerRegisteredSurfaceIds,
  ]);
  // The title bar's premium signal (issue 1185). It is deliberately BROADER than
  // `downtimeCoreFallback`: that flag answers "who owns the Downtime route", while this one
  // answers "is a companion module registered at all", which is the claim the strip makes.
  // Reading it off the surface SET rather than off Core's one surface id is what lets a
  // premium module that ships some future surface light the same badge with no change here.
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
  // The rail's Downtime children render the active tab set. In core-fallback they are one of
  // TWO renderings of it — the preview's own tab strip is the other — and in provider mode
  // they are the only one, because a companion's screens carry no strip (issue 1213). Either
  // way they read the same list, so a rail label and a tab label can never drift apart.
  const downtimeNavItems = $derived(downtimeTabs);
  // The rail sub-item BUTTON's element id. It is the click target the mounted suite drives and
  // the anchor the group's markup is keyed on.
  const downtimeNavItemId = (tabId) => `manager-downtime-nav-${tabId}`;
  // The id of the element carrying the sub-item's VISIBLE LABEL, stated once and used twice:
  // the rail stamps it, and the extension host reads it for the companion panel's
  // `aria-labelledby` (issue 1213). A second literal here and there would be a mirror across a
  // component boundary with nothing to catch its drift.
  //
  // It names the LABEL SPAN rather than the button deliberately. The button carries the fuller
  // `aria-label` — the tab's `accessibleName`, which reads as an instruction ("Open the
  // downtime ledger") because it names an action — and a landmark inherits the whole accessible
  // name of whatever it points at, so pointing at the button would announce the region as
  // "Open the downtime ledger, region". A landmark takes the name of the SCREEN, so it points
  // at the span that holds exactly that: "Ledger".
  const downtimeNavLabelId = (tabId) => `manager-downtime-nav-label-${tabId}`;
  // The id of the sub-item's badge element (issue 1302) — the `aria-describedby` target, and
  // never a descendant of `downtimeNavLabelId`'s span, which names the companion panel region.
  const downtimeNavBadgeId = (tabId) => `manager-downtime-nav-badge-${tabId}`;
  // The badge Core renders for one sub-item, in provider mode only: Core's own preview tabs
  // never carry a `badge`, but a runtime badge CAN be stored against one of their ids (the
  // faulted-provider case), so the mode guard is load-bearing here and not merely defensive.
  function downtimeSubitemBadge(item) {
    return downtimeCoreFallback ? null : resolveNavTabBadge(item, downtimeNavTabBadges);
  }
  // Gated on provider mode rather than merely on the channel being empty. The channel already
  // releases itself on every path that ends a mount, so this is belt and braces — but Core's
  // preview is CORE's screen, and no reachable ordering may ever let a companion's copy,
  // artwork or Save button land on it.
  const downtimeRuntimeChrome = $derived(downtimeCoreFallback ? null : downtimeRouteChrome);
  // Header actions belong to the live mount, then to the active TAB, then to the provider's
  // own list; Core keeps its bespoke premium anchor rather than routing it through a public
  // descriptor. `??` and not `||`: an EMPTY runtime array means "this screen has no actions",
  // which a truthiness test would read as "say nothing" and answer with the tab's own list —
  // leaving a companion's editor wearing its list screen's buttons.
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
  // Header artwork, opt-in per update. Absent it, this route's header keeps the plain heading
  // it has carried since issue 1185 removed the prototype's glyph tile from it; present, it
  // renders the identity block Fabricate's own recipe and component editors use, which is what
  // makes a companion's drill-down look like a drill-down.
  const downtimeHeaderArtwork = $derived(
    downtimeRuntimeChrome?.icon || downtimeRuntimeChrome?.image ? downtimeRuntimeChrome : null
  );
  const worldDowntimeContext = $derived.by(() => {
    // Read the revision so `requestRemount()` yields a NEW frozen identity, which is what
    // the host's mount effect keys on. Nothing here is a Core store, document or component.
    const revision = downtimeContextRevision;
    // The context object is its own mount's identity token, which is why the two channel
    // functions close over a holder rather than being stated once outside this derivation.
    // A stable function has no way to say WHICH mount called it, so a companion holding a
    // retired context could repaint the screen the GM moved on to; bound this way, a call
    // from a dead mount is simply refused. The holder is written once, immediately below,
    // and never again — this derivation stays pure.
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
  const isActiveGatheringChildRoute = $derived(
    isGatheringRoute && visibleGatheringNavItems.some((tab) => tab.id === displayedGatheringTab)
  );
  const activeGatheringInspectorTab = $derived(
    gatheringInspectorTabs.find((tab) => tab.id === displayedGatheringTab) || null
  );
  // Gathering's tab set is fixed, but a restored token can still name a section that no
  // longer exists — including the retired `travel` one, which is now the World > Travel route.
  $effect(() => {
    if (!visibleGatheringNavItems.some((tab) => tab.id === activeGatheringTab)) {
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
  // The Knowledge surface's gate is wider than Books & Scrolls': it is also shown
  // for an alchemy system under ANY visibility mode, because `learnRecipeOnCraft`
  // writes learned recipes regardless and under `global` alchemy they are the sole
  // reveal source (issue 785).
  const craftingResolutionMode = $derived(selectedSystem?.resolutionMode || '');
  const recipeCount = $derived($viewState.recipes?.length || 0);
  const recipeItemCount = $derived(recipeItemDefinitions.length);
  // ONE argument bag, read by the rail AND by route reconciliation in
  // `normalizedActiveView` (issue 1151), mirroring `checksNavArgs`/`checksNavItems`
  // below. Two bags could disagree about what the selected system offers, which is
  // the defect: the rail would drop the entry while the router kept rendering it.
  //
  // `visibilityMode` is the DEFAULTED `craftingVisibilityMode`, not a bare
  // `selectedSystem?.visibilityMode`. The difference is invisible to
  // `buildCraftingNavItems` (`craftingEffect` resolves undefined to `knowledge`
  // anyway), but this same derived is the prop source for BooksScrollsView,
  // RecipeItemEditor and ItemPageInspector, and RecipeItemEditor's own prop default
  // is `'item'` — so feeding an undefined-bearing field through would silently flip
  // its Limits card from learning caps to use caps for a system with no persisted
  // mode. None of the four inputs reads `currentView`, so the graph stays acyclic.
  const craftingNavArgs = $derived({
    visibilityMode: craftingVisibilityMode,
    resolutionMode: craftingResolutionMode,
    recipeCount,
    recipeItemCount,
  });
  const craftingNavItems = $derived(buildCraftingNavItems(craftingNavArgs));
  // The Crafting parent-group badge totals its visible sub-tabs (Recipes + Books &
  // Scrolls where that surface applies), mirroring the gathering group's total, so
  // the collapsed group count reflects everything inside it — not recipes alone.
  const craftingNavCount = $derived(
    craftingNavItems.reduce((sum, item) => sum + (item.count || 0), 0)
  );
  const isCraftingRoute = $derived(isCraftingView(currentView));
  const activeCraftingTab = $derived(resolveActiveCraftingTab(currentView));

  // ── The Checks rail GROUP (issue 1096) ───────────────────────────────────────────────
  //
  // `Checks` was one flat rail button holding four tabs; it is an expandable group whose
  // children are routes, exactly like the Gathering group above.
  //
  // The badges are a DRAFT PREVIEW: readiness is evaluated against the live drafts the GM
  // is editing, so a badge clears the moment the edit that clears it is made rather than
  // when it is saved. The ENABLE gate is a different question and reads committed state —
  // see the Validation hero, which says so rather than claiming "Ready to enable" for
  // unsaved work.
  const checksDraftSystem = $derived({
    modifiers: selectedSystemModifiers,
    craftingCheck: selectedSystem?.craftingCheck || {},
    salvageCraftingCheck: selectedSystem?.salvageCraftingCheck || {},
    gatheringCraftingCheck: selectedSystem?.gatheringCraftingCheck || {},
  });
  // ONE slot per activity decides BOTH halves of every badge: which draft is evaluated, and
  // which rules it is evaluated under. Two derivations answered those two questions before
  // (issue 1096) and disagreed for alchemy at `checkMode: 'tiered'` — the badge evaluated the
  // untouched SIMPLE draft under ROUTED rules, so it hid criticals the Validation route
  // reported, breaking the invariant that the dot, the badge and Validation cannot disagree.
  const salvageCheckSlot = $derived(
    resolveActiveSalvageCheckFormula({
      salvageResolutionMode,
      salvageCraftingCheck: {
        simple: salvageSimpleDraft,
        routed: salvageRoutedDraft,
        progressive: salvageProgressiveDraft,
      },
    }).slot
  );
  const gatheringCheckSlot = $derived(
    resolveActiveGatheringCheckFormula(
      {
        gatheringCraftingCheck: {
          progressive: gatheringProgressiveDraft,
          routed: gatheringRoutedDraft,
        },
      },
      gatheringResolutionMode
    ).slot
  );
  function draftForSlot(slot, drafts) {
    return slot ? (drafts[slot] ?? null) : null;
  }
  /**
   * A SWITCHED-OFF check reports NO issues, and this is the same predicate the route renders
   * by (`ChecksView`'s `routeIsOff`), restated here because the badge is drawn by the rail
   * rather than by the route.
   *
   * Without it the two disagree, and the disagreement is unresolvable from the screen: an off
   * check's route collapses to the single "Turn this check on" panel with no sections, no
   * dots and no Modifiers card — while the rail child still badged the issues that panel no
   * longer renders anywhere. The reachable case is an alchemy system with an authored
   * check-modifier selection: switching the check off raised `modifiersInertNoCheck`, badged
   * "1", and left the GM no control anywhere on the route that could clear it.
   *
   * It is right on the merits too, not just for agreement: readiness answers "will this check
   * work when it runs", and a check that has been turned off does not run.
   */
  function checksActivityIsOff(activity) {
    const state = checkActivation?.[activity];
    if (!state || state.enabled === true) return false;
    if (activity === 'gathering') return state.mode !== 'd100';
    return state.optional === true;
  }
  function checksIssueCount(activity, slot, drafts) {
    if (checksActivityIsOff(activity)) return 0;
    return evaluateCheckReadiness(draftForSlot(slot, drafts) || {}, {
      mode: readinessModeForSlot(slot),
      modifierContext: buildCheckModifierContext(checksDraftSystem, activity, null),
      activity,
    }).issues.length;
  }
  const checksIssueCounts = $derived({
    crafting: checksIssueCount('crafting', craftingCheckMode, {
      simple: checkSimpleDraft,
      routed: checkRoutedDraft,
      progressive: checkProgressiveDraft,
    }),
    salvage: checksIssueCount('salvage', salvageCheckSlot, {
      simple: salvageSimpleDraft,
      routed: salvageRoutedDraft,
      progressive: salvageProgressiveDraft,
    }),
    gathering: checksIssueCount('gathering', gatheringCheckSlot, {
      progressive: gatheringProgressiveDraft,
      routed: gatheringRoutedDraft,
    }),
  });
  const checksNavArgs = $derived({
    features: selectedSystem?.features || {},
    resolutionMode: selectedSystem?.resolutionMode || 'simple',
    salvageResolutionMode,
    gatheringResolutionMode,
    issueCounts: checksIssueCounts,
    dirtyActivities: {
      crafting: craftingCheckDirty,
      salvage: salvageCheckDirty,
      gathering: gatheringCheckDirty,
    },
  });
  const checksNavItems = $derived(buildChecksNavItems(checksNavArgs));
  // The PARENT badge sums the three ACTIVITY children only. Validation's badge is that
  // same total restated, so adding it in would report every issue twice.
  const checksNavCount = $derived(checksNavIssueTotal(checksNavItems));
  const isChecksRoute = $derived(isChecksView(currentView));
  const checksActiveTab = $derived(resolveActiveChecksTab(currentView) || 'crafting');

  // ── Rail group expansion: the LOCK, and what the rail actually renders (issue 1185) ───
  //
  // One rule, stated once for all five groups: a group is expanded when the GM expanded it
  // (`railGroupUserExpanded`) OR when collapsing it would hide the screen they are standing
  // on (`railGroupLockedOpen`). The lock is the ONLY exception to "every group collapses in
  // any state", and it is why the disclosure control renders genuinely `disabled` there
  // rather than swallowing the click — a chevron that visibly does nothing is what the
  // whole defect read as.
  //
  // "Locked" means "the current view BELONGS to this group", and an editor detail route
  // belongs to the group whose sub-item opened it: `recipe-edit` is reached from Recipes and
  // is read as part of Recipes, so the group that owns it stays open while the GM is in it.
  // That is why the lock keys on the group's route CATEGORY (`isCraftingView` covers
  // `CRAFTING_VIEWS`, which carries `recipe-edit` and `recipe-item-edit`) rather than on the
  // narrower "is a rendered rail entry" test.
  //
  // The rule is deliberately uniform across all five groups. Gathering already behaved this
  // way — `isActiveGatheringChildRoute` is true throughout `environment-edit`,
  // `gathering-task-edit` and `gathering-event-edit` — and Crafting and Checks were the
  // outliers, releasing their group the moment an editor opened.
  // Downtime's every sub-tab IS the one `world-downtime` route (the tab is panel state, not
  // a route), and that holds for a companion's tab set exactly as it does for Core's four —
  // nothing here reads a tab id.
  const railGroupLockedOpen = $derived({
    crafting: isCraftingRoute,
    checks: isChecksRoute,
    gathering: isActiveGatheringChildRoute,
    worldTravel: isWorldTravelRoute,
    worldRules: isWorldRulesRoute,
    worldDowntime: isWorldDowntimeRoute,
  });
  const railGroupExpanded = $derived({
    crafting: railGroupUserExpanded.crafting || railGroupLockedOpen.crafting,
    checks: railGroupUserExpanded.checks || railGroupLockedOpen.checks,
    gathering: railGroupUserExpanded.gathering || railGroupLockedOpen.gathering,
    worldTravel: railGroupUserExpanded.worldTravel || railGroupLockedOpen.worldTravel,
    worldRules: railGroupUserExpanded.worldRules || railGroupLockedOpen.worldRules,
    worldDowntime: railGroupUserExpanded.worldDowntime || railGroupLockedOpen.worldDowntime,
  });
  // Entering a sub-tab also records the INTENT, so the group stays open when the GM later
  // navigates away instead of snapping shut behind them.
  //
  // This effect reads `railGroupLockedOpen` and NEVER `railGroupUserExpanded`. That is the
  // whole fix for the re-assert loop: a write to a state this effect does not read cannot
  // re-trigger it, so a collapse the GM makes is final until the lock itself changes.
  $effect(() => {
    const locked = railGroupLockedOpen;
    for (const group of RAIL_GROUP_IDS) {
      if (locked[group]) railGroupUserExpanded[group] = true;
    }
  });
  // The Tool Studio is a TOP-LEVEL rail entry that presents as Crafting context — its
  // breadcrumb reads "<system> › Crafting › Tools" — so entering it opens the Crafting group,
  // as it has since issue 784. What changed is the mechanism: it records INTENT here instead
  // of ORing `isToolStudioRoute` into the rendered expansion. Tools is not one of Crafting's
  // rail sub-items, so it must not LOCK the group; the old form pinned the group open and
  // left its chevron inert, which is one of the five faces of the issue 1185 report.
  // Reads only the route, never the flag, so a collapse from here is final.
  $effect(() => {
    if (isToolStudioRoute) railGroupUserExpanded.crafting = true;
  });
  function toggleRailGroup(group, event) {
    event?.stopPropagation?.();
    // Belt and braces beside the `disabled` attribute: the lock is a rule about state, not
    // about one control, so it holds for a programmatic call too.
    if (railGroupLockedOpen[group]) return;
    railGroupUserExpanded[group] = !railGroupUserExpanded[group];
  }
  // ONE sentence for all five groups, and deliberately generic: the Downtime group's
  // children come from whichever provider holds the surface, so this cannot name a section.
  const railGroupLockedTitle = $derived(
    text(
      'FABRICATE.Admin.Manager.Nav.LockedOpen',
      'This section stays open while you are on one of its pages.'
    )
  );
  // THE WHOLE RAIL LOCKS OPEN OVER A COMPANION'S DOWNTIME SURFACE (issue 1213).
  //
  // MODE-scoped, not route-scoped. Provider mode renders no tab strip, and the 56px rail hides
  // `.manager-nav-submenu` outright — measured with the strip suppressed, the number of
  // reachable tab switchers was ZERO. `display: none` also removes them from the accessibility
  // tree, so a collapsed rail there is a keyboard and screen-reader dead end and not merely a
  // pointer one. Core's fallback keeps its strip, is never stranded, and therefore keeps its
  // collapsible rail — which is also what protects the `manager-world-downtime-collapsed`
  // View Lab frame.
  //
  // The lock flips live when a provider registers or deregisters mid-session, so a GM sitting
  // on this route with a collapsed rail sees it snap open in the same frame as the swap. That
  // is strand-avoidance working, not a glitch.
  const railLockedOpen = $derived(isWorldDowntimeRoute && !downtimeCoreFallback);
  // DISPLAY-ONLY. `railCollapsed` is seeded from and written back to a `client`-scoped setting
  // — localStorage, per device, surviving reload — so the group lock's template is the WRONG
  // one here: `toggleRailGroup` resolves its lock by writing intent into `railGroupUserExpanded`,
  // which is safe only because that map is in-memory. Copying it would mean merely VISITING
  // World Downtime permanently un-collapses the GM's rail on every other route and in every
  // future session. Derive what is DISPLAYED instead and leave the stored preference alone, so
  // leaving the route restores it.
  const railCollapsedDisplay = $derived(railCollapsed && !railLockedOpen);
  // The Downtime parent rollup total (issue 1302) — Core's own summary of what is hidden
  // behind a closed disclosure, never registered-plus-runtime added together (`navTabBadgeTotal`
  // sums the RESOLVED value once per tab). Zero in core-fallback: Core's preview tabs never
  // carry a badge, so there is nothing of the companion's to summarise there.
  const downtimeNavRollupTotal = $derived(
    downtimeCoreFallback ? 0 : navTabBadgeTotal(downtimeTabs, downtimeNavTabBadges)
  );
  // Renders only while the children are hidden — BOTH disjuncts are load-bearing. The first
  // covers the default state (the group closed on a fresh Manager); the second covers the GM
  // who expanded the group this session and then collapsed the rail, where the submenu is
  // `display: none` and the rollup is the only surviving signal left.
  const downtimeNavRollupVisible = $derived(
    !downtimeCoreFallback &&
      downtimeNavRollupTotal > 0 &&
      (!railGroupExpanded.worldDowntime || railCollapsedDisplay)
  );
  // "{count} update" / "{count} updates" — Core's own generic word, because Core cannot know
  // whether a companion is counting records or demands and the summed value is heterogeneous
  // across tabs by construction. Deliberately not "issue": that borrows Checks' severity claim
  // about data Core cannot inspect.
  //
  // Two full literal keys, not a composed base — the repo's lang-key-literal guard pins the
  // exact count of dynamic `` `${base}.${suffix}` `` namespace bases project-wide, and this key
  // pair has exactly two shapes, so naming both in full costs nothing and adds no new base.
  function downtimeRollupName(count) {
    const key =
      count === 1
        ? 'FABRICATE.Admin.Manager.World.Downtime.BadgeTotalOne'
        : 'FABRICATE.Admin.Manager.World.Downtime.BadgeTotalOther';
    const fallback = count === 1 ? '{count} update' : '{count} updates';
    return text(key, fallback).replace('{count}', String(count));
  }
  // The parent row's composed accessible name while the rollup shows. The row's `aria-label`
  // replaces its subtree, so a `role="img"` rollup inside it would otherwise be silent — the
  // same reason the shipped `PREMIUM` chip already is. One Core-owned key carries both tokens
  // in the translator's word order; `{label}` is SUBSTITUTED from the same value the visible
  // label renders (never hard-coded), so the row's noun has exactly one source.
  function downtimeParentName(count) {
    const key =
      count === 1
        ? 'FABRICATE.Admin.Manager.World.Downtime.NavWithBadgeOne'
        : 'FABRICATE.Admin.Manager.World.Downtime.NavWithBadgeOther';
    const fallback = count === 1 ? '{label}, {count} update' : '{label}, {count} updates';
    const label = text('FABRICATE.Admin.Manager.World.Downtime.Nav', 'Downtime');
    return text(key, fallback).replace('{label}', label).replace('{count}', String(count));
  }
  // Every rail-toggle attribute reads the DISPLAY value, never the stored one. Forcing the rail
  // open without them gives a GM who arrived collapsed an expanded rail whose control reports
  // `aria-pressed="true"`, is labelled "Expand navigation rail", points its chevron the wrong
  // way and does nothing when clicked — the same defect class as issue 1185, in the same widget,
  // one route over. Stated once here because two scope-card branches render the control.
  const railToggleLabel = $derived(
    railCollapsedDisplay
      ? text('FABRICATE.Admin.Manager.Nav.ExpandRail', 'Expand navigation rail')
      : text('FABRICATE.Admin.Manager.Nav.CollapseRail', 'Collapse navigation rail')
  );
  // Its own string, not the group lock's: `Nav.LockedOpen` is section-worded and wrong for the
  // whole sidebar.
  const railToggleTitle = $derived(
    railLockedOpen
      ? text('FABRICATE.Admin.Manager.Nav.RailLockedOpen', 'The sidebar stays open on this page.')
      : railToggleLabel
  );
  const railToggleIcon = $derived(
    railCollapsedDisplay ? 'fas fa-angles-right' : 'fas fa-angles-left'
  );
  // REVEAL THE SWITCHER ON ROUTE ENTRY (issue 1213). Measured at a 1330x900 Manager, the nav
  // scrollport ends at y=977 while the three Downtime sub-items render at 983-1083: with the
  // strip gone, the route's FIRST VISIBLE STATE offered no visible way to change screen. They
  // are reachable by scrolling, so this is not the stranding the rail lock exists to prevent —
  // it is the one real cost of deleting the strip, and one scroll removes it.
  //
  // `nearest` so a switcher already in view does not move the rail at all. Provider mode only:
  // core-fallback keeps its strip at the top of the panel and needs no help.
  //
  // `revealedDowntimeNavId` is DEFENSIVE, not load-bearing, and the distinction was measured
  // rather than assumed. An earlier version of this comment said the rail "re-renders on far
  // more than a route change and a repeat would yank the pane back", which misstates Svelte 5:
  // the effect re-runs on DEPENDENCY change, not on re-render, and every path that changes a
  // dependency either changes `worldDowntimeTabId` (re-scroll wanted) or resets this to null
  // (re-scroll wanted). The keyed each-block keeps `bind:this` node identity stable, so
  // `downtimeNavNodes[tabId]` does not churn either. No re-entry it prevents could be
  // constructed, and deleting it broke no test — so it stays as cheap insurance against a
  // future dependency being added, and nothing claims to gate it.
  const downtimeNavNodes = $state({});
  let revealedDowntimeNavId = null;
  $effect(() => {
    if (!railLockedOpen || !railGroupExpanded.worldDowntime) {
      revealedDowntimeNavId = null;
      return;
    }
    const tabId = worldDowntimeTabId;
    if (revealedDowntimeNavId === tabId) return;
    const node = downtimeNavNodes[tabId];
    if (!node) return;
    revealedDowntimeNavId = tabId;
    // happy-dom does not implement it, hence the optional call.
    node.scrollIntoView?.({ block: 'nearest' });
  });
  // The Knowledge surface's projection is published TOP-LEVEL, never hung off
  // `selectedSystem` (issue 785): hanging it there would force a `selectedSystem`
  // reference rebuild on every knowledge publish and let a late phase-2 publish
  // clobber freshly projected rows.
  const knowledgeState = $derived($viewState.knowledge || null);
  // Entering the surface arms the store's whole-world scan; leaving it makes
  // `refreshKnowledge` a total no-op again and drops the cached snapshot. Without
  // this gate the scan would have to join `refresh()`, which ~40 mutation paths
  // call and which has no cheap invalidation signature for actors × items.
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
  // The linked linked world item for the editor's Overview preview: resolve from the
  // DRAFT's originItemUuid (so a staged link change updates the preview) against the
  // projected recipe item's resolved fields, then the world-item options.
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
  const selectedGatheringRules = $derived(
    $viewState.gatheringConfig?.systems?.[selectedSystemId]?.rules || {
      rewardSelectionMode: 'highestRankedDrop',
      rewardLimit: 1,
      eventSelectionMode: 'allDrops',
      eventLimit: 1,
      eventPolicy: 'successWithEvent',
      toolBreakagePolicy: 'failureOnBreak',
      biomeModifierAggregation: 'strongestOfEach',
      eventVisibility: 'encounterChance',
    }
  );
  const selectedGatheringSystemConfig = $derived(
    $viewState.gatheringConfig?.systems?.[selectedSystemId] || {}
  );
  // Two independent limitation flags. Honor key-presence precedence: a present
  // `enabled` flag wins over a stale legacy `mode` (mirrors the service / GM
  // economy-view read-compat mapping) so a disabled limit can't be resurrected.
  const selectedGatheringEconomy = $derived(selectedGatheringSystemConfig.economy || {});
  // The gathering check editor shown is selected by the gathering economy's
  // resolution mode (d100 → fixed, not editable; progressive/routed → editable).
  const gatheringResolutionMode = $derived(selectedGatheringEconomy.resolutionMode || 'd100');
  const selectedGatheringTaskStaminaEnabled = $derived(
    selectedGatheringEconomy.stamina != null &&
      Object.prototype.hasOwnProperty.call(selectedGatheringEconomy.stamina, 'enabled')
      ? selectedGatheringEconomy.stamina.enabled === true
      : selectedGatheringEconomy.mode === 'stamina'
  );
  const selectedGatheringTaskNodesEnabled = $derived(
    selectedGatheringEconomy.nodes != null &&
      Object.prototype.hasOwnProperty.call(selectedGatheringEconomy.nodes, 'enabled')
      ? selectedGatheringEconomy.nodes.enabled === true
      : selectedGatheringEconomy.mode === 'nodes'
  );
  // ─────────────────────────────────────────────────────────────────────────────────────────
  // BREADCRUMB LEAVES: the SUBJECT of an editor, not the act of editing it (issue 1328).
  //
  // The recipe, component and tool editors have always named their subject — "Ravenglass Ink",
  // not "Edit recipe" — and four editors did not: the environment, the gathering task, the
  // gathering event and the recipe item each read `Edit <type>`. That is a trail that says what
  // KIND of screen you are on when you can already see the screen, and withholds the one fact
  // only the trail can carry, which is WHICH of them you opened. Four rungs of a ladder all
  // reading `Edit gathering task` are four identical trails over four different subjects.
  //
  // Each falls back to the type name for the case the subject has none yet: a draft a GM has
  // created and not named. `.trim()` matters there — a field cleared to spaces is not a name,
  // and `||` alone would put a run of blanks in the trail.
  const crumbSubject = (name, key, fallback) => {
    const trimmed = String(name ?? '').trim();
    return trimmed || text(key, fallback);
  };
  const environmentCrumb = $derived(
    crumbSubject(
      environmentDraftForDisplay?.name,
      'FABRICATE.Admin.Manager.Environment.EditBreadcrumb',
      'Edit environment'
    )
  );
  const gatheringTaskCrumb = $derived(
    crumbSubject(
      gatheringTaskDraft?.name,
      'FABRICATE.Admin.Manager.Environment.Tasks.EditBreadcrumb',
      'Edit gathering task'
    )
  );
  const gatheringEventCrumb = $derived(
    crumbSubject(
      gatheringEventDraft?.name,
      'FABRICATE.Admin.Manager.Environment.Events.EditBreadcrumb',
      'Edit gathering event'
    )
  );
  // THE LINKED ITEM'S name rather than a field on the draft, because a recipe item HAS no name
  // of its own: it is a world item plus the recipes it contains, and `recipeItemEditorLinkedItem`
  // is the one resolution of that already used by the editor's own Overview preview. A second
  // resolution here would be a second answer to "what is this thing called".
  const recipeItemCrumb = $derived(
    crumbSubject(
      recipeItemEditorLinkedItem?.name,
      'FABRICATE.Admin.Manager.RecipeItem.EditBreadcrumb',
      'Edit recipe item'
    )
  );

  // WHICH GATHERING SUB-TAB IS ON SCREEN, in the label the rail gives it.
  //
  // Gathering is a group of four screens — Environments, Tasks, Events, Settings — and its trail
  // named only the group, so all four read `<system> > Gathering` and the trail could not tell
  // you which one you were looking at. Checks already names its own sub-tab; this is the same
  // rule applied to the other group that has one.
  //
  // Read off `gatheringNavItems` rather than written out, so the crumb is the same string as the
  // rail item it corresponds to and a fifth tab needs nothing here.
  const gatheringTabLabel = $derived.by(() => {
    const item = gatheringNavItems.find((entry) => entry.id === activeGatheringTab);
    return item ? text(item.labelKey, item.labelFallback) : '';
  });

  const gatheringTaskDefinitions = $derived(
    Array.isArray(selectedGatheringSystemConfig.tasks) ? selectedGatheringSystemConfig.tasks : []
  );
  const gatheringEventDefinitions = $derived(
    Array.isArray(selectedGatheringSystemConfig.events) ? selectedGatheringSystemConfig.events : []
  );
  // Tools are system-owned: read the canonical library from the selected
  // crafting system (surfaced on $viewState.selectedSystem.tools by the store)
  // rather than the gathering-config copy.
  const selectedGatheringSystemTools = $derived(
    Array.isArray($viewState.selectedSystem?.tools) ? $viewState.selectedSystem.tools : []
  );
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
      .filter(
        (environment) =>
          String(environment?.craftingSystemId || '') === String(selectedSystemId || '')
      )
      .map((environment) => ({
        id: String(environment.id),
        name: String(environment.name || environment.id),
      }))
  );
  const travelParties = $derived($viewState.travelParties || []);

  // World > Parties page-header subtitle (issue 1182). `enabled` counts `enabled === true`
  // and NOT the prototype's `enabled && members.length`: an enabled party resolves its
  // travel actor's current realm with or without members (gathering-and-harvesting req 6),
  // and an enabled party with neither members nor a travel actor is still the record a
  // downtime group is grouped by, so a member-less enabled party is in use.
  //
  // `assigned` / `total` are PLAYER CHARACTERS only, each counted once across all parties.
  // Travel actors are deliberately outside the numerator — a currently linked one is
  // offered by its picker whether or not its type is configured, so a vehicle standing in
  // as one would otherwise be counted against a player-character denominator and render
  // "5 of 4 characters assigned". Stale member
  // uuids resolve to no projected actor and drop out for the same reason.
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
  // Rows for the Realms tab's per-realm environment editor. Projected here rather than inside
  // `EnvironmentsBrowserView`, which no longer hosts the Realms surface at all: World > Travel
  // renders `GatheringRealmsTab` straight from this root.
  const worldTravelEnvironmentOptions = $derived(
    environmentList.map((environment) => ({
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
  const gatheringNavCounts = $derived({
    environments: environmentList.length,
    tasks: gatheringTaskDefinitions.length,
    encounters: gatheringEventDefinitions.length,
    total:
      environmentList.length + gatheringTaskDefinitions.length + gatheringEventDefinitions.length,
  });
  const selectedGatheringTask = $derived(
    gatheringTaskDefinitions.find((task) => task.id === selectedGatheringTaskId) ||
      gatheringTaskDefinitions[0] ||
      null
  );
  const selectedGatheringEvent = $derived(
    gatheringEventDefinitions.find((event) => event.id === selectedGatheringEventId) ||
      gatheringEventDefinitions[0] ||
      null
  );
  const editingGatheringTask = $derived(gatheringTaskDraft || selectedGatheringTask);
  const selectedGatheringDrop = $derived(
    gatheringTaskDropRows(editingGatheringTask).find((row) => row.id === selectedGatheringDropId) ||
      gatheringTaskDropRows(editingGatheringTask)[0] ||
      null
  );
  const gatheringTaskDraftDirty = $derived(
    !!(
      gatheringTaskDraft &&
      gatheringTaskDraftBaseline &&
      JSON.stringify(gatheringTaskDraft) !== JSON.stringify(gatheringTaskDraftBaseline)
    )
  );
  const gatheringTaskValidation = $derived(
    gatheringTaskDraft
      ? store.validateGatheringLibraryTask?.(gatheringTaskDraft) || { valid: true, errors: [] }
      : { valid: true, errors: [] }
  );

  const editingGatheringEvent = $derived(gatheringEventDraft || selectedGatheringEvent);
  const gatheringEventDraftDirty = $derived(
    !!(
      gatheringEventDraft &&
      gatheringEventDraftBaseline &&
      JSON.stringify(gatheringEventDraft) !== JSON.stringify(gatheringEventDraftBaseline)
    )
  );
  const gatheringEventValidation = $derived(validateGatheringEventDraft(gatheringEventDraft));

  function validateGatheringEventDraft(draft) {
    if (!draft) return { valid: true, errors: [] };
    const errors = [];
    if (!String(draft?.name || '').trim()) {
      errors.push(
        text('FABRICATE.Admin.Manager.Environment.Events.NameRequired', 'Name is required.')
      );
    }
    const rate = Number(draft?.dropRate);
    if (!Number.isFinite(rate) || rate < 1 || rate > 100) {
      errors.push(
        text(
          'FABRICATE.Admin.Manager.Environment.Events.DropRateInvalid',
          'Drop rate must be between 1 and 100.'
        )
      );
    }
    return { valid: errors.length === 0, errors };
  }

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
    railGroupUserExpanded.gathering = isGatheringRoute;
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
    if (!canShowEnvironments) {
      selectedGatheringTaskId = '';
      selectedGatheringDropId = '';
      return;
    }
    if (
      selectedGatheringTaskId &&
      gatheringTaskDefinitions.some((task) => task.id === selectedGatheringTaskId)
    )
      return;
    selectedGatheringTaskId = gatheringTaskDefinitions[0]?.id || '';
  });

  $effect(() => {
    if (!canShowEnvironments) {
      selectedGatheringEventId = '';
      return;
    }
    if (
      selectedGatheringEventId &&
      gatheringEventDefinitions.some((event) => event.id === selectedGatheringEventId)
    )
      return;
    selectedGatheringEventId = gatheringEventDefinitions[0]?.id || '';
  });

  $effect(() => {
    if (!editingGatheringTask) {
      selectedGatheringDropId = '';
      return;
    }
    const rows = gatheringTaskDropRows(editingGatheringTask);
    if (selectedGatheringDropId && rows.some((row) => row.id === selectedGatheringDropId)) return;
    selectedGatheringDropId = rows[0]?.id || '';
  });

  $effect(() => {
    services?.registerEssenceDirtyGuard?.(() => confirmEssenceRouteExit('close'));
    return () => services?.registerEssenceDirtyGuard?.(null);
  });

  $effect(() => {
    services?.registerToolDirtyGuard?.(() => confirmToolsRouteExit('close'));
    return () => services?.registerToolDirtyGuard?.(null);
  });

  // The companion's own window-close guard. Registered unconditionally and SELF-SCOPING: the
  // channel answers `undefined` unless a live mount holds a guard, and a live mount only
  // exists while the GM is on the Downtime route with a companion panel on screen. Nothing
  // here needs to know the active route, and nothing fires on any other one.
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

  function updateSelectedGatheringRules(updates) {
    if (!selectedSystemId) return;
    store.updateGatheringRules?.(selectedSystemId, updates);
  }

  function updateSelectedGatheringCondition(kind, value) {
    if (!selectedSystemId || !kind) return;
    store.updateGatheringConditions?.({ [kind]: value, systemId: selectedSystemId });
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
    const category = getRecipeCategoryLabel(
      normalizeRecipeCategory(recipeDraft?.category),
      localize
    );
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
    const sourceLabel =
      componentForEdit?.sourceOriginLabel ||
      (origin === 'compendium'
        ? text('FABRICATE.Admin.Manager.Component.SourceOriginCompendium', 'Compendium')
        : origin === 'world'
          ? text('FABRICATE.Admin.Manager.Component.SourceOriginWorld', 'Items Directory')
          : text('FABRICATE.Admin.Manager.Component.SourceOriginUnknown', 'Unknown'));
    return `${text('FABRICATE.Admin.Manager.Component.LinkedBadge', 'Linked')} ${sourceLabel}`;
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
      [
        'multiStepRecipes',
        'FABRICATE.Admin.Manager.Feature.MultiStepRecipes',
        'Multi-step recipes',
      ],
      ['craftingChecks', 'FABRICATE.Admin.Manager.Feature.CraftingChecks', 'Crafting checks'],
      ['outcomeRouting', 'FABRICATE.Admin.Manager.Feature.OutcomeRouting', 'Outcome routing'],
      ['effectTransfer', 'FABRICATE.Admin.Manager.Feature.EffectTransfer', 'Effect transfer'],
      ['propertyMacros', 'FABRICATE.Admin.Manager.Feature.PropertyMacros', 'Property macros'],
    ];
    return featureMap
      .filter(([key]) => system.features[key] === true)
      .map(([, key, fallback]) => text(key, fallback));
  }

  function uniqueSorted(values) {
    return Array.from(
      new Set(values.map((value) => String(value || '').trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }

  function buildSelectedCountFacts(counts) {
    const offLabel = text('FABRICATE.Admin.Manager.Off', 'Off');
    return [
      {
        id: 'components',
        label: text('FABRICATE.Admin.Manager.Column.Components', 'Components'),
        value: counts.components,
      },
      {
        id: 'recipes',
        label: text('FABRICATE.Admin.Manager.Column.Recipes', 'Recipes'),
        value: counts.recipes,
      },
      counts.environments == null
        ? {
            id: 'environments',
            label: text('FABRICATE.Admin.Manager.GatheringEnvironments', 'Gathering environments'),
            value: offLabel,
            isOff: true,
          }
        : {
            id: 'environments',
            label: text('FABRICATE.Admin.Manager.GatheringEnvironments', 'Gathering environments'),
            value: counts.environments,
          },
      {
        id: 'essences',
        label: text('FABRICATE.Admin.Manager.Nav.Essences', 'Essences'),
        value: counts.essences,
      },
      {
        id: 'item-tags',
        label: text('FABRICATE.Admin.Manager.Feature.ItemTags', 'Item tags'),
        value: counts.itemTags,
      },
      {
        id: 'recipe-categories',
        label: text('FABRICATE.Admin.Manager.Feature.RecipeCategories', 'Recipe categories'),
        value: counts.recipeCategories,
      },
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
          values: gatheringConfig?.vocabularies?.timeOfDay || [],
        },
      },
      {
        kind: 'weather',
        icon: 'fas fa-cloud-sun',
        label: text('FABRICATE.Admin.Manager.CurrentWeather', 'Current weather'),
        setting: systemConditions.weather || {
          enabled: true,
          current: gatheringConfig?.conditions?.weather || 'clear',
          values: gatheringConfig?.vocabularies?.weather || [],
        },
      },
    ].filter(
      (condition) =>
        condition.setting?.enabled !== false && conditionValues(condition.setting).length > 0
    );
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
    // `checks` is RETAINED as a redirect to the first available child (issue 1096), so
    // existing deep links, the salvage editor's "Manage presets" link and every View Lab
    // `expectView: 'checks'` still have a defined answer after the split. The target is
    // resolved from the same nav model the rail renders, so "first available" cannot mean
    // two different things.
    if (system && view === 'checks') return resolveChecksRedirect(checksNavArgs);
    // A child whose feature was switched off while it was open falls back to the same
    // redirect rather than rendering a route the rail no longer offers.
    if (system && CHECKS_VIEWS.includes(view) && !checksNavItems.some((item) => item.view === view))
      return resolveChecksRedirect(checksNavArgs);
    // The same reconciliation for the Crafting group (issue 1151): a crafting-system
    // scope change or a `visibilityMode` edit must not leave the GM rendering a
    // mode-conditional entry the selected system no longer offers, with no rail entry
    // to return to it.
    //
    // The membership test is taken over the entry that OWNS the view, not over the
    // view — `isCraftingViewAvailable` maps through `activeCraftingTab` — so
    // `recipes`, `recipe-edit` and `crafting-settings` are never caught, and
    // `recipe-item-edit` follows its Books & Scrolls parent. The Checks clause above
    // can compare views directly because every Checks child IS a view; the crafting
    // model's ids and views deliberately differ.
    //
    // This is a read-time normalization, so it invokes no route-exit guard and does
    // not weaken one: every path reaching it has already passed the guard. A scope
    // change maps an editor route to its browser through `SCOPE_BROWSER_BY_VIEW` and
    // prompts BEFORE `selectSystem`, and `setVisibilityMode` is reachable only from
    // the unconditional Settings entry.
    if (system && isCraftingView(view) && !isCraftingViewAvailable(view, craftingNavArgs))
      return resolveCraftingRedirect(craftingNavArgs);
    // The standalone `system-overview` route was folded into the `system-edit`
    // page's Validation tab; a stale value (no system selected) falls through to
    // the `systems` library here.
    if (
      view === 'world' ||
      view === 'world-downtime' ||
      view === 'world-currency' ||
      view === 'world-prerequisites' ||
      view === 'world-modifiers' ||
      view === 'world-travel' ||
      // The seven scoped-entity routes join the world pass-through (issue 1362) and MUST be
      // above the fallthrough below: a world screen's normal state is that no crafting
      // system is selected, so `if (!system) return 'systems'` would bounce every one of
      // them the moment the GM had not picked a system first.
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

  function viewTitle() {
    if (currentView === 'recipes') return text('FABRICATE.Admin.Manager.Recipe.Title', 'Recipes');
    if (currentView === 'recipe-edit')
      return text('FABRICATE.Admin.Manager.Recipe.EditTitle', 'Edit recipe');
    if (currentView === 'crafting-settings')
      return text(
        'FABRICATE.Admin.Manager.Crafting.CraftingTabs.SettingsPlaceholderTitle',
        'Crafting settings'
      );
    if (currentView === 'access')
      return text('FABRICATE.Admin.Manager.Access.Title', 'Recipe access');
    if (currentView === 'books-scrolls')
      return text('FABRICATE.Admin.Manager.BooksScrolls.Title', 'Books & Scrolls');
    if (currentView === 'knowledge')
      return text('FABRICATE.Admin.Manager.Knowledge.Title', 'Knowledge');
    if (currentView === 'recipe-item-edit')
      return text('FABRICATE.Admin.Manager.RecipeItem.EditTitle', 'Edit recipe item');
    if (currentView === 'components')
      return text('FABRICATE.Admin.Manager.Nav.ComponentRules', 'Component Rules');
    if (currentView === 'component-edit')
      return text('FABRICATE.Admin.Manager.Component.EditTitle', 'Edit component');
    if (currentView === 'tags')
      return text('FABRICATE.Admin.Manager.TagsCategories.Title', 'Tags & Categories');
    if (currentView === 'essences')
      return text('FABRICATE.Admin.Manager.Nav.EssenceRules', 'Essence Rules');
    if (currentView === 'essence-edit')
      return isCreatingEssenceDraft
        ? text('FABRICATE.Admin.Manager.Essence.CreateTitle', 'Create essence')
        : text('FABRICATE.Admin.Manager.Essence.EditTitle', 'Edit essence');
    if (currentView === 'environments' && displayedGatheringTab === 'tasks')
      return text(
        'FABRICATE.Admin.Manager.Environment.GatheringTabs.TasksTitle',
        'Gathering Tasks'
      );
    if (currentView === 'world')
      return text('FABRICATE.Admin.Manager.World.PartiesTitle', 'World Parties');
    // The seven world scoped-entity routes (issue 1362). Titles are the PROTOTYPE'S, verbatim
    // — including the lowercase `c` in `Component catalogue` and the plural `Tools Catalogue`.
    if (currentView === 'world-components')
      return text('FABRICATE.Admin.Manager.Scoped.ComponentCatalogueTitle', 'Component catalogue');
    if (currentView === 'world-component-entry')
      return text('FABRICATE.Admin.Manager.Scoped.ComponentEntryTitle', 'Component entry');
    if (currentView === 'world-essences')
      return text('FABRICATE.Admin.Manager.Scoped.EssenceCatalogueTitle', 'Essence Catalogue');
    if (currentView === 'world-essence-entry')
      return text('FABRICATE.Admin.Manager.Scoped.EssenceEntryTitle', 'Essence entry');
    if (currentView === 'world-tools')
      return text('FABRICATE.Admin.Manager.Scoped.ToolCatalogueTitle', 'Tools Catalogue');
    if (currentView === 'world-tool-entry')
      return text('FABRICATE.Admin.Manager.Scoped.ToolEntryTitle', 'Tool entry');
    if (currentView === 'world-vocabulary')
      return text('FABRICATE.Admin.Manager.Scoped.VocabularyTitle', 'Tags & Categories');
    if (isWorldRulesRoute) return worldRulesPageTitle;
    if (currentView === 'world-travel') {
      if (worldTravelTab === 'map')
        return text('FABRICATE.Admin.Manager.Travel.MapLinksTitle', 'Map Region Links');
      return text('FABRICATE.Admin.Manager.Travel.RealmsTitle', 'Realms');
    }
    // The Downtime route titles itself after the tab on screen, not after the route: a GM
    // switching sub-tabs must see the page name change with them, and a companion's screens
    // must not wear Core's preview copy.
    if (currentView === 'world-downtime')
      return downtimeChrome(
        'title',
        'Downtime',
        text('FABRICATE.Admin.Manager.World.Downtime.Title', 'Downtime')
      );
    if (currentView === 'tools') return text('FABRICATE.Admin.Manager.Tools.Title', 'Tools');
    if (currentView === 'tool-edit')
      return text('FABRICATE.Admin.Manager.Tools.EditTitle', 'Edit Tool');
    // Written as a LOOKUP over four whole keys rather than one interpolated template ending
    // at the `Checks` segment: `tests/lang-keys-no-orphans.test.js` credits an interpolation
    // base as a covering PREFIX over its whole subtree, so that single template would have
    // silently un-orphaned every dead key under the Checks namespace — including the
    // nineteen this repo tracks deliberately in `tests/lang-known-orphans.js`. The scan reads
    // COMMENTS too, so this note must not spell that prefix out either.
    if (isChecksRoute) return text(CHECKS_ROUTE_TITLE_KEYS[checksActiveTab], 'Checks');
    if (currentView === 'environments')
      return text('FABRICATE.Admin.Manager.Environment.Title', 'Environments');
    if (currentView === 'environment-edit')
      return text('FABRICATE.Admin.Manager.Environment.EditTitle', 'Edit environment');
    if (currentView === 'gathering-task-edit')
      return text('FABRICATE.Admin.Manager.Environment.Tasks.EditTitle', 'Edit gathering task');
    if (currentView === 'gathering-event-edit')
      return text('FABRICATE.Admin.Manager.Environment.Events.EditTitle', 'Edit gathering event');
    if (currentView === 'system-edit')
      return text('FABRICATE.Admin.Manager.SystemEdit.PageTitle', 'System Overview');
    return text('FABRICATE.Admin.Manager.Title', 'Crafting systems');
  }

  // ONE derivation for each world scoped-entity route's subtitle, keyed by route, so a page
  // and the placeholder body inside it cannot drift into saying two different things.
  //
  // COMPLETE LITERAL KEYS, never a `${...}` suffix on a shared base. An interpolated key is
  // invisible to the lang-key resolution gate and to the orphan scan, so a missing string ships
  // silently and every one of these seven would read as an unreferenced key.
  function worldScopedSubtitle() {
    if (currentView === 'world-components')
      return text('FABRICATE.Admin.Manager.Scoped.ComponentCatalogueSubtitle', '');
    if (currentView === 'world-component-entry')
      return text('FABRICATE.Admin.Manager.Scoped.ComponentEntrySubtitle', '');
    if (currentView === 'world-essences')
      return text('FABRICATE.Admin.Manager.Scoped.EssenceCatalogueSubtitle', '');
    if (currentView === 'world-essence-entry')
      return text('FABRICATE.Admin.Manager.Scoped.EssenceEntrySubtitle', '');
    if (currentView === 'world-tools')
      return text('FABRICATE.Admin.Manager.Scoped.ToolCatalogueSubtitle', '');
    if (currentView === 'world-tool-entry')
      return text('FABRICATE.Admin.Manager.Scoped.ToolEntrySubtitle', '');
    if (currentView === 'world-vocabulary')
      return text('FABRICATE.Admin.Manager.Scoped.VocabularySubtitle', '');
    return '';
  }

  function viewSubtitle() {
    // The seven world scoped-entity routes (issue 1362). Without a branch of its own a route
    // falls through to the generic system-library subtitle, which describes crafting systems
    // — the one thing these screens deliberately do not have.
    if (isWorldScopedRoute) return worldScopedSubtitle();
    if (currentView === 'recipes')
      return text(
        'FABRICATE.Admin.Manager.Recipe.Subtitle',
        'Manage recipes for the selected crafting system.'
      );
    if (currentView === 'recipe-edit') return recipeEditSubtitle();
    if (currentView === 'crafting-settings')
      return text(
        'FABRICATE.Admin.Manager.Crafting.CraftingTabs.SettingsHint',
        'System-level crafting rules: resolution mode and recipe visibility.'
      );
    if (currentView === 'access')
      return text(
        'FABRICATE.Admin.Manager.Access.Subtitle',
        'Grant individual recipes to specific characters or players.'
      );
    if (currentView === 'books-scrolls')
      return text(
        'FABRICATE.Admin.Manager.BooksScrolls.Subtitle',
        'Review every recipe item in this system with its linked recipes and open one to set its use and learn caps.'
      );
    if (currentView === 'knowledge')
      return text(
        'FABRICATE.Admin.Manager.Knowledge.Subtitle',
        'Audit and correct what each character carries and has learned in the selected crafting system.'
      );
    if (currentView === 'recipe-item-edit')
      return text(
        'FABRICATE.Admin.Manager.RecipeItem.EditSubtitle',
        'Link a world item and recipes, then set its use and learn caps.'
      );
    if (currentView === 'components')
      return text(
        'FABRICATE.Admin.Manager.Component.Subtitle',
        'Manage item-backed components for the selected crafting system.'
      );
    if (currentView === 'component-edit' && componentForEdit) return componentEditSubtitle();
    if (currentView === 'component-edit')
      return text(
        'FABRICATE.Admin.Manager.Component.EditSubtitle',
        'Update tags, essences, and source linkage for this component.'
      );
    if (currentView === 'tags')
      return text(
        'FABRICATE.Admin.Manager.TagsCategories.Subtitle',
        'Manage recipe category and item tag vocabulary for the selected crafting system.'
      );
    if (currentView === 'essences')
      return text(
        'FABRICATE.Admin.Manager.Essence.Subtitle',
        'Manage essence definitions for the selected crafting system.'
      );
    if (currentView === 'essence-edit' && isCreatingEssenceDraft && showEssenceSourceUi)
      return text(
        'FABRICATE.Admin.Manager.Essence.CreateSubtitle',
        'Define identity, icon, and source linkage for a new essence.'
      );
    if (currentView === 'essence-edit' && isCreatingEssenceDraft)
      return text(
        'FABRICATE.Admin.Manager.Essence.CreateNoSourceSubtitle',
        'Define identity and icon for a new essence.'
      );
    if (currentView === 'essence-edit' && showEssenceSourceUi)
      return text(
        'FABRICATE.Admin.Manager.Essence.EditSubtitle',
        'Update identity, icon, and source linkage for this essence.'
      );
    if (currentView === 'essence-edit')
      return text(
        'FABRICATE.Admin.Manager.Essence.EditNoSourceSubtitle',
        'Update identity and icon for this essence.'
      );
    if (currentView === 'environments' && displayedGatheringTab === 'tasks')
      return text(
        'FABRICATE.Admin.Manager.Environment.GatheringTabs.TasksHint',
        'Browse gathering tasks before attaching them to environments.'
      );
    if (currentView === 'world') {
      if (travelParties.length === 0)
        return text(
          'FABRICATE.Admin.Manager.World.Parties.SubtitleEmpty',
          'No parties yet · world-level, shared by gathering and travel in every system'
        );
      const template =
        travelParties.length === 1
          ? text(
              'FABRICATE.Admin.Manager.World.Parties.SubtitleOne',
              '1 party · {enabled} enabled · {assigned} of {total} characters assigned'
            )
          : text(
              'FABRICATE.Admin.Manager.World.Parties.Subtitle',
              '{count} parties · {enabled} enabled · {assigned} of {total} characters assigned'
            );
      return template
        .replace('{count}', String(travelParties.length))
        .replace('{enabled}', String(enabledPartyCount))
        .replace('{assigned}', String(assignedCharacterCount))
        .replace('{total}', String(playerCharacterUuids.size));
    }
    if (currentView === 'world-currency') {
      if (selectedCurrencyUnits.length === 0)
        return text(
          'FABRICATE.Admin.Manager.World.Currency.SubtitleEmpty',
          'No coins yet · world-level, shared by every crafting system that enables currency'
        );
      const template =
        selectedCurrencyUnits.length === 1
          ? text(
              'FABRICATE.Admin.Manager.World.Currency.SubtitleOne',
              '1 coin · used by {systems} of {total} crafting systems'
            )
          : text(
              'FABRICATE.Admin.Manager.World.Currency.Subtitle',
              '{count} coins · used by {systems} of {total} crafting systems'
            );
      return template
        .replace('{count}', String(selectedCurrencyUnits.length))
        .replace('{systems}', String(currencyEnabledSystemCount))
        .replace('{total}', String(allSystems.length));
    }
    if (currentView === 'world-prerequisites') {
      const count = selectedCharacterPrerequisites.length;
      const template =
        count === 0
          ? text(
              'FABRICATE.Admin.Manager.World.Prerequisites.SubtitleEmpty',
              'No prerequisites yet · shared by every crafting system'
            )
          : count === 1
            ? text(
                'FABRICATE.Admin.Manager.World.Prerequisites.SubtitleOne',
                '1 prerequisite · shared by every crafting system'
              )
            : text(
                'FABRICATE.Admin.Manager.World.Prerequisites.Subtitle',
                '{count} prerequisites · shared by every crafting system'
              );
      return template.replace('{count}', String(count));
    }
    if (currentView === 'world-modifiers') {
      const count = selectedSystemModifiers.length;
      const template =
        count === 0
          ? text(
              'FABRICATE.Admin.Manager.World.Modifiers.SubtitleEmpty',
              'No modifiers yet · shared by every crafting system'
            )
          : count === 1
            ? text(
                'FABRICATE.Admin.Manager.World.Modifiers.SubtitleOne',
                '1 modifier · shared by every crafting system'
              )
            : text(
                'FABRICATE.Admin.Manager.World.Modifiers.Subtitle',
                '{count} modifiers · shared by every crafting system'
              );
      return template.replace('{count}', String(count));
    }
    if (currentView === 'world-downtime')
      return downtimeChrome(
        'subtitle',
        'Fabricate Premium · Your party-wide command board for every activity and shared project.',
        ''
      );
    if (currentView === 'world-travel') {
      if (worldTravelTab === 'map')
        return text(
          'FABRICATE.Admin.Manager.Travel.MapLinksHint',
          'Link the active scene\u2019s Foundry Scene Regions to the world\u2019s realms.'
        );
      return text(
        'FABRICATE.Admin.Manager.Travel.RealmsHint',
        'Author the world\u2019s realms \u00b7 shared by every crafting system that enables Travel & Realms.'
      );
    }
    if (currentView === 'tools')
      return text(
        'FABRICATE.Admin.Manager.Tools.Subtitle',
        'Manage reusable gathering tools and configure how they behave when required by tasks.'
      );
    if (currentView === 'tool-edit')
      return text(
        'FABRICATE.Admin.Manager.Tools.EditSubtitle',
        'Configure Tool identity, breakage, requirements, and validation.'
      );
    if (isChecksRoute)
      return text(
        'FABRICATE.Admin.Manager.Checks.Subtitle',
        'Configure how crafting, salvage, and gathering attempts are checked for the selected crafting system.'
      );
    if (currentView === 'environments')
      return text(
        'FABRICATE.Admin.Manager.Environment.Subtitle',
        'Manage gathering environments for the selected crafting system.'
      );
    if (currentView === 'environment-edit')
      return text(
        'FABRICATE.Admin.Manager.Environment.EditSubtitle',
        'Edit scene linkage, identity, tasks, events, tools, and validation for the selected environment.'
      );
    if (currentView === 'gathering-task-edit')
      return text(
        'FABRICATE.Admin.Manager.Environment.Tasks.EditSubtitle',
        'Edit availability, identity, and drop rules for the selected gathering task.'
      );
    if (currentView === 'gathering-event-edit')
      return text(
        'FABRICATE.Admin.Manager.Environment.Events.EditSubtitle',
        'Edit identity, availability, danger, and modifiers for the selected event.'
      );
    if (currentView === 'system-edit')
      return text(
        'FABRICATE.Admin.Manager.SystemEdit.PageSubtitle',
        'Edit base settings and review validation issues for the selected crafting system.'
      );
    return text(
      'FABRICATE.Admin.Manager.Subtitle',
      'Manage the system definitions that organize Fabricate components, recipes, gathering, and feature rules.'
    );
  }

  function isViewAvailableForSystem(view, system) {
    // Issue 745: the Graph placeholder is advertised only behind the experimental toggle.
    if (view.id === 'graph') return experimentalFeaturesEnabled;
    if (!view.feature) return true;
    return system?.features?.[view.feature] === true;
  }

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

  function headerActionsLabel() {
    if (currentView === 'recipes')
      return text('FABRICATE.Admin.Manager.Recipe.Actions', 'Recipe actions');
    if (currentView === 'components' || currentView === 'component-edit')
      return text('FABRICATE.Admin.Manager.Component.Actions', 'Component actions');
    if (currentView === 'tags')
      return text('FABRICATE.Admin.Manager.TagsCategories.Actions', 'Tags and categories actions');
    if (currentView === 'essences' || currentView === 'essence-edit')
      return text('FABRICATE.Admin.Manager.Essence.Actions', 'Essence actions');
    if (currentView === 'environments' && displayedGatheringTab === 'tasks')
      return text('FABRICATE.Admin.Manager.Environment.Tasks.Actions', 'Gathering task actions');
    if (currentView === 'world')
      return text('FABRICATE.Admin.Manager.World.PartiesActions', 'World party actions');
    if (currentView === 'world-downtime')
      return downtimeChrome(
        'actionsLabel',
        'Downtime actions',
        text('FABRICATE.Admin.Manager.World.Downtime.Actions', 'Downtime actions')
      );
    if (currentView === 'world-travel')
      return worldTravelTab === 'map'
        ? text('FABRICATE.Admin.Manager.Travel.MapLinksActions', 'Map region link actions')
        : text('FABRICATE.Admin.Manager.Travel.RealmsActions', 'Realm actions');
    if (currentView === 'tools')
      return text('FABRICATE.Admin.Manager.Tools.Actions', 'Tools actions');
    if (currentView === 'knowledge')
      return text('FABRICATE.Admin.Manager.Knowledge.Actions', 'Knowledge actions');
    if (isChecksRoute) return text('FABRICATE.Admin.Manager.Checks.Actions', 'Checks actions');
    if (
      currentView === 'environments' ||
      currentView === 'environment-edit' ||
      currentView === 'gathering-task-edit' ||
      currentView === 'gathering-event-edit'
    )
      return text('FABRICATE.Admin.Manager.Environment.Actions', 'Environment actions');
    if (currentView === 'system-edit')
      return text('FABRICATE.Admin.Manager.SystemEdit.Actions', 'System edit actions');
    return text('FABRICATE.Admin.Manager.SystemActions', 'System actions');
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
    if (currentView === 'tags')
      return text(
        'FABRICATE.Admin.Manager.TagsCategories.Inspector',
        'Tags and categories inspector'
      );
    if (currentView === 'essences' || currentView === 'essence-edit')
      return text('FABRICATE.Admin.Manager.Essence.Inspector', 'Selected essence inspector');
    if (currentView === 'environments' && displayedGatheringTab === 'tasks')
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
    // DISCARD. `store.cancelEssenceDraft` (issue 1036, criterion 23) is the store's half:
    // it writes NOTHING and republishes the persisted projections, so the browser and the
    // inspector show what is actually stored rather than whatever the abandoned draft last
    // rendered. It exists for the same reason `cancelEnvironmentDraft` and
    // `cancelToolsDraft` do — the guard's discard branch and the editor's Back button must
    // reach ONE function rather than each re-deriving what cancelling means.
    essenceEditDirty = false;
    essenceEditDraft = null;
    store.cancelEssenceDraft?.();
    return true;
  }

  // Apply the three-way discard choice for the identity sub-form and answer whether
  // navigation may proceed (`true`) or must stay put (`false`). Save persists from the
  // ROOT-LIFTED draft, not from `SystemEditView`'s local inputs: on a Save-and-navigate
  // the view is still mounted but the root is the only holder the guard can read.
  // Navigation is gated on `result !== false`, so only an explicit `false` from
  // `saveSystemDetails` (its no-selected-system no-op) blocks the exit.
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
    recipeItemLinkedSourceSnapshot = recipeItemSourceSnapshot(recipeItemDraftBaseline);
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

  async function finishGatheringTaskRouteExit(action, nextView) {
    if (action === 'cancel' || action === false) return false;
    if (action === 'save') {
      const saved = await saveGatheringTaskDraft();
      if (saved === false) return false;
    }
    clearGatheringTaskDraft();
    if (nextView) activeView = nextView;
    return true;
  }

  async function finishGatheringEventRouteExit(action, nextView) {
    if (action === 'cancel' || action === false) return false;
    if (action === 'save') {
      const saved = await saveGatheringEventDraft();
      if (saved === false) return false;
    }
    clearGatheringEventDraft();
    if (nextView) activeView = nextView;
    return true;
  }

  function confirmGatheringEventRouteExit(nextView) {
    if (activeView !== 'gathering-event-edit') return true;
    if (!gatheringEventDraftDirty) return finishGatheringEventRouteExit(true, nextView);
    const confirmed = store.confirmDiscardDirtyGatheringEventDraft?.() ?? false;
    if (isPromise(confirmed))
      return confirmed.then((action) => finishGatheringEventRouteExit(action, nextView));
    return finishGatheringEventRouteExit(confirmed, nextView);
  }

  function confirmComponentRouteExit(_nextView) {
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

  // The SAME-VIEW SKIP (issue 1036, criterion 23), comparing the ESSENCE and not only the
  // view token. This guard ignored its argument, unlike the recipe, component, recipe-item
  // and system guards, so re-entering the essence editor from the essence editor raised a
  // discard prompt for a navigation that never leaves the route. `SCOPE_BROWSER_BY_VIEW`
  // already maps `essence-edit` to `essences`, so skipping is safe: this is not the
  // `environment-edit` hazard, whose scope key differs.
  //
  // But `essence-edit` is a "same token, different subject" route, exactly like `tool-edit`
  // and `system-edit`, and both of those learned it the hard way. `editEssence` already
  // early-returns on an unchanged id, so EVERY call that reaches this guard from inside the
  // editor is a switch to a different essence — or `createEssenceDraft`, which switches to
  // no essence at all — and a bare `nextView === 'essence-edit'` skip returned `true` for
  // all of them, after which `editEssence` clears `essenceEditDraft` with the draft
  // unsaved, no prompt, and `store.cancelEssenceDraft()` never called.
  // `confirmToolsRouteExit` compares ids for this reason; so does
  // `confirmSystemDetailsScopeChange`.
  function confirmEssenceRouteExit(nextView, nextEssenceId = '') {
    if (activeView !== 'essence-edit') return true;
    if (nextView === 'essence-edit' && nextEssenceId && nextEssenceId === selectedEssenceId)
      return true;
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
    if (!gatheringTaskDraftDirty) return finishGatheringTaskRouteExit(true, nextView);
    const confirmed = store.confirmDiscardDirtyGatheringTaskDraft?.() ?? false;
    if (isPromise(confirmed))
      return confirmed.then((action) => finishGatheringTaskRouteExit(action, nextView));
    return finishGatheringTaskRouteExit(confirmed, nextView);
  }

  // `nextRouteId` is the identity of the SUBJECT the caller is navigating to, for the
  // routes whose view token does not change when the subject does. Inside this cascade only
  // the essence guard reads it; `confirmRouteExit` also reads it for the Downtime tab a
  // companion's navigation guard is being asked about. Every other caller keeps its
  // one-argument shape.
  function confirmRouteExitGuards(nextView, nextRouteId = '') {
    const environmentConfirmed = confirmEnvironmentRouteExit(nextView);
    if (isPromise(environmentConfirmed)) {
      return environmentConfirmed.then((value) => {
        if (value === false) return false;
        const essenceResult = confirmEssenceRouteExit(nextView, nextRouteId);
        if (isPromise(essenceResult)) {
          return essenceResult.then((essenceValue) =>
            essenceValue === false ? false : continueRouteExitAfterEssence(nextView)
          );
        }
        return essenceResult === false ? false : continueRouteExitAfterEssence(nextView);
      });
    }
    if (environmentConfirmed === false) return false;
    const essenceResult = confirmEssenceRouteExit(nextView, nextRouteId);
    if (isPromise(essenceResult)) {
      return essenceResult.then((value) =>
        value === false ? false : continueRouteExitAfterEssence(nextView)
      );
    }
    if (essenceResult === false) return false;
    return continueRouteExitAfterEssence(nextView);
  }

  /**
   * Ask a mounted companion whether the GM may leave the screen it is showing.
   *
   * `undefined` — never `true` — means there is nothing to ask, and every caller reads it
   * as "run the path you ran before this seam existed". That is what makes a companion which
   * never registers a guard cost exactly nothing: no prompt, no `await`, no extra microtask,
   * and no change to the promise identity `confirmRouteExit` is careful to preserve.
   *
   * The DESTINATION decides whether this is a navigation at all. `nextRouteId` already carries
   * "the identity of the subject the caller is navigating to, for the routes whose view token
   * does not change when the subject does" — which is exactly what a Downtime tab is — so the
   * Downtime tab id travels on the parameter that exists for it rather than on a second one.
   * Re-entering the route the GM is already on (the parent rail item, which states no tab)
   * leaves nothing, so it must not prompt.
   *
   * @param {string} nextView Route token the caller is navigating to.
   * @param {string} nextRouteId Destination Downtime tab id, when the caller states one.
   * @returns {undefined|boolean|Promise<boolean>} `undefined` when there is nothing to ask.
   */
  function confirmDowntimeCompanionNavigation(nextView, nextRouteId) {
    if (activeView !== 'world-downtime') return undefined;
    if (nextView === 'world-downtime' && (!nextRouteId || nextRouteId === worldDowntimeTabId))
      return undefined;
    return downtimeChromeChannel.confirmNavigation(nextView === 'world-downtime' ? 'tab' : 'route');
  }

  /**
   * Core's own route-exit cascade, plus the Downtime host disposal that follows it.
   *
   * Split out of `confirmRouteExit` so the companion guard can gate the WHOLE of it: a
   * companion that vetoes must leave Core's drafts untouched and its host mounted, and a
   * guard placed inside the cascade would have Core prompting — or saving — first.
   *
   * @param {string} nextView Route token the caller is navigating to.
   * @param {string} nextRouteId Destination subject id, for same-token routes.
   * @returns {boolean|Promise<boolean>} Whether the navigation may proceed.
   */
  function finishRouteExit(nextView, nextRouteId) {
    const result = confirmRouteExitGuards(nextView, nextRouteId);
    if (activeView !== 'world-downtime' || nextView === 'world-downtime') return result;

    // Keep the original route-guard promise identity. `afterTruthyResult` already subscribes to
    // it immediately; wrapping it would put route activation one microtask later and regress
    // every existing async discard path. Reactions run in registration order, so this cleanup
    // still happens before the caller's route activation removes the host target.
    const disposeDowntime = (confirmed) => {
      if (confirmed !== false) downtimeExtensionHost?.disposeBeforeRemoval?.();
    };
    if (isPromise(result)) result.then(disposeDowntime);
    else disposeDowntime(result);
    return result;
  }

  // The companion is asked FIRST, and only about navigations that end its mount. Every Core
  // guard below is route-gated, so on `world-downtime` the whole Core cascade is already a
  // synchronous `true` — asking the companion first therefore reorders nothing, and it means
  // a veto costs no Core write at all, where asking Core first could persist an environment
  // or a tool for a navigation the companion then refuses.
  function confirmRouteExit(nextView, nextRouteId = '') {
    const companion = confirmDowntimeCompanionNavigation(nextView, nextRouteId);
    // Returned UNTOUCHED, not wrapped: `afterTruthyResult` subscribes to this value
    // immediately, and wrapping it would put every existing route activation one microtask
    // later. Only the new path, where a companion actually holds a guard, composes.
    if (companion === undefined) return finishRouteExit(nextView, nextRouteId);
    if (isPromise(companion))
      return companion.then((allowed) =>
        allowed === false ? false : finishRouteExit(nextView, nextRouteId)
      );
    return companion === false ? false : finishRouteExit(nextView, nextRouteId);
  }

  function continueRouteExitAfterEssence(nextView) {
    const recipeResult = confirmRecipeRouteExit(nextView);
    if (isPromise(recipeResult)) {
      return recipeResult.then((value) =>
        value === false ? false : continueRouteExitAfterRecipe(nextView)
      );
    }
    if (recipeResult === false) return false;
    return continueRouteExitAfterRecipe(nextView);
  }

  function continueRouteExitAfterRecipe(nextView) {
    const recipeItemResult = confirmRecipeItemRouteExit(nextView);
    if (isPromise(recipeItemResult)) {
      return recipeItemResult.then((value) =>
        value === false ? false : continueRouteExitAfterRecipeItem(nextView)
      );
    }
    if (recipeItemResult === false) return false;
    return continueRouteExitAfterRecipeItem(nextView);
  }

  function continueRouteExitAfterRecipeItem(nextView) {
    const componentResult = confirmComponentRouteExit(nextView);
    if (isPromise(componentResult)) {
      return componentResult.then((value) =>
        value === false ? false : continueRouteExitAfterComponent(nextView)
      );
    }
    if (componentResult === false) return false;
    return continueRouteExitAfterComponent(nextView);
  }

  function continueRouteExitAfterComponent(nextView) {
    const taskResult = confirmGatheringTaskRouteExit(nextView);
    if (isPromise(taskResult)) {
      return taskResult.then((value) =>
        value === false ? false : continueRouteExitAfterTask(nextView)
      );
    }
    if (taskResult === false) return false;
    return continueRouteExitAfterTask(nextView);
  }

  function continueRouteExitAfterTask(nextView) {
    const eventResult = confirmGatheringEventRouteExit(nextView);
    if (isPromise(eventResult)) {
      return eventResult.then((value) =>
        value === false ? false : continueRouteExitAfterTools(nextView)
      );
    }
    if (eventResult === false) return false;
    return continueRouteExitAfterTools(nextView);
  }

  // Tail of the route-exit cascade: tools, then system-details. `system-details` is
  // evaluated LAST because it is the only kind whose "editor" is a sub-form of a page the
  // GM may also be leaving for another reason, so a real editor draft gets first refusal
  // on the exit. Same promise / `false`-short-circuit shape as the other links.
  function continueRouteExitAfterTools(nextView) {
    const toolsResult = confirmToolsRouteExit(nextView);
    if (isPromise(toolsResult)) {
      return toolsResult.then((value) =>
        value === false ? false : continueRouteExitAfterChecks(nextView)
      );
    }
    if (toolsResult === false) return false;
    return continueRouteExitAfterChecks(nextView);
  }

  function continueRouteExitAfterChecks(nextView) {
    const checksResult = confirmChecksRouteExit(nextView);
    if (isPromise(checksResult)) {
      return checksResult.then((value) =>
        value === false ? false : confirmSystemDetailsRouteExit(nextView)
      );
    }
    if (checksResult === false) return false;
    return confirmSystemDetailsRouteExit(nextView);
  }

  /** Reset every check draft to its last saved baseline. */
  function discardChecksDrafts() {
    alchemyCheckModeDraft = alchemyCheckModeBaseline;
    craftingCheckActiveDraft = craftingCheckActiveBaseline;
    salvageCheckActiveDraft = salvageCheckActiveBaseline;
    gatheringCheckActiveDraft = gatheringCheckActiveBaseline;
    checkRoutedDraft = cloneRoutedCheck(checkRoutedBaseline);
    checkSimpleDraft = cloneSimpleCheck(checkSimpleBaseline);
    checkProgressiveDraft = cloneProgressiveCheck(checkProgressiveBaseline);
    salvageSimpleDraft = cloneSimpleCheck(salvageSimpleBaseline);
    salvageRoutedDraft = cloneRoutedCheck(salvageRoutedBaseline);
    salvageProgressiveDraft = cloneProgressiveCheck(salvageProgressiveBaseline);
    gatheringProgressiveDraft = cloneProgressiveCheck(gatheringProgressiveBaseline);
    gatheringRoutedDraft = cloneRoutedCheck(gatheringRoutedBaseline);
  }

  async function finishChecksRouteExit(action) {
    if (action === 'save') {
      // Navigation is gated on the SAVE, exactly as the essence and system-details guards
      // gate theirs: a Save that did not land leaves the GM on the studio with the edit
      // still in front of them, rather than navigating away from work nothing persisted.
      return await saveChecks();
    }
    if (action === 'discard' || action === true) {
      discardChecksDrafts();
      return true;
    }
    return false;
  }

  /**
   * The Checks Studio's route-exit prompt (issue 1096).
   *
   * Navigating BETWEEN Checks children never prompts: the drafts live above the route, so
   * moving from Crafting to Salvage and back preserves them. Leaving the studio for a
   * non-Checks route with any activity dirty raises the three-way prompt, which names the
   * dirty activities — the GM may be standing on Gathering while the unsaved edit is on
   * Crafting.
   */
  function confirmChecksRouteExit(nextView) {
    if (!isChecksRoute || isChecksView(nextView)) return true;
    if (!checksDirty) return true;
    const names = checksDirtyActivities.map((activity) =>
      text(
        `FABRICATE.Admin.Manager.Checks.Tabs.${activity[0].toUpperCase()}${activity.slice(1)}`,
        activity
      )
    );
    const confirmation = store?.confirmDiscardDirtyChecksDraft?.(names);
    if (isPromise(confirmation)) return confirmation.then(finishChecksRouteExit);
    return finishChecksRouteExit(confirmation);
  }

  function surfaceToolsSaveValidationError() {
    toolEditorActiveTab = 'validation';
    toolValidationFocusNonce += 1;
    notifyWarn(localize('FABRICATE.Admin.Manager.Tools.SaveBlockedInvalid'));
  }

  async function finishToolsRouteExit(action) {
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
  }

  function confirmToolsRouteExit(nextView, nextToolId = '') {
    if (activeView !== 'tool-edit') return true;
    const currentToolId = String(focusedToolDraft?.id || '');
    if (nextView === 'tool-edit' && nextToolId && nextToolId === currentToolId) return true;
    if ($viewState.toolDraftDirty !== true) {
      store?.cancelToolsDraft?.();
      return true;
    }
    const confirmation = services?.confirmDirtyToolsNavigation
      ? services.confirmDirtyToolsNavigation({ toolId: currentToolId })
      : store?.confirmDiscardDirtyToolsDraft?.();
    if (isPromise(confirmation)) return confirmation.then(finishToolsRouteExit);
    return finishToolsRouteExit(confirmation);
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

  // A per-record editor/detail view is bound to ONE system's record, so switching the
  // crafting system from the rail scope-select must return the GM to the corresponding
  // studio BROWSER for the new system rather than stranding them in an editor for a
  // record that does not exist under the new system (e.g. recipe-edit → recipes).
  //
  // Browser, list, and settings views are not listed here, but "they simply reload for
  // the new system" is only true once the ROUTER has reconciled them (issue 1151): a
  // mode-conditional Crafting browser such as `access` or `books-scrolls` may not exist
  // under the new system at all. `normalizedActiveView` owns that answer, so this map
  // stays a per-record editor concern and every entry path — a scope change, a
  // `visibilityMode` edit, a restored stale `activeView` — is reconciled in one place.
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

  // Open the System Overview page on its Settings tab with the Modifiers section expanded
  // and scrolled to (issue 1117). It goes through the SAME route-exit guard every other
  // navigation here does, so leaving a dirty Checks draft still prompts.
  function showSystemModifiers() {
    if (!selectedSystem) return;
    afterTruthyResult(confirmRouteExit('system-edit'), () => {
      requestSystemTab('settings');
      requestedSystemModifierSectionNonce += 1;
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
    recipe: {
      view: 'recipe-edit',
      targetId: (issue) => issue.entityId,
      open: (id) => editRecipe(id),
    },
    environment: {
      view: 'environment-edit',
      targetId: (issue) => issue.environmentId,
      open: (id) => editEnvironment(id),
    },
    task: {
      view: 'environment-edit',
      targetId: (issue) => issue.environmentId,
      open: (id) => editEnvironment(id),
    },
    event: {
      view: 'environment-edit',
      targetId: (issue) => issue.environmentId,
      open: (id) => editEnvironment(id),
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

  // "{count} issue" / "{count} issues" — the badge must NAME its unit, because a bare
  // numeral in this column is the record count every other rail entry renders there.
  const CHECKS_ROUTE_TITLE_KEYS = {
    crafting: 'FABRICATE.Admin.Manager.Checks.Crafting.PageTitle',
    salvage: 'FABRICATE.Admin.Manager.Checks.Salvage.PageTitle',
    gathering: 'FABRICATE.Admin.Manager.Checks.Gathering.PageTitle',
    validation: 'FABRICATE.Admin.Manager.Checks.Validation.Title',
  };

  function checksIssueName(count) {
    const key = count === 1 ? 'IssueCountOne' : 'IssueCountOther';
    const fallback = count === 1 ? '{count} issue' : '{count} issues';
    return text(`FABRICATE.Admin.Manager.Checks.Sections.${key}`, fallback).replace(
      '{count}',
      String(count)
    );
  }

  // Activating the PARENT opens the group and routes to the first available child, which is
  // what makes the retained `checks` id a redirect rather than a dead route.
  function activateChecksParent() {
    railGroupUserExpanded.checks = true;
    setView(resolveChecksRedirect(checksNavArgs));
  }

  function backToSystemsBrowser() {
    afterTruthyResult(confirmRouteExit('systems'), () => {
      activeView = 'systems';
    });
  }

  function backToEnvironmentsBrowse() {
    afterTruthyResult(confirmRouteExit('environments'), () => {
      activeView = canShowEnvironments ? 'environments' : 'systems';
      if (canShowEnvironments) railGroupUserExpanded.gathering = true;
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
    recipeDraftBaseline = recipeDraftBaseline
      ? { ...recipeDraftBaseline, enabled: next }
      : recipeDraftBaseline;
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

  // Enter multi-step: seed Step 1 from the draft's current top-level ingredients /
  // results / tools so an already-craftable recipe stays craftable (the engine only
  // falls back to top-level fields when the steps array is empty). New/empty recipes
  // simply start with one named, empty step.
  // Draft-staged steps need a stable id up front: step-scoped edits (ingredient
  // sets, results, tools, duration) route by step id, and the store only assigns
  // ids on save. Without one, an id-less step's edits misroute to the recipe scope.
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

  // Deleting a step removes the whole step (its ingredients, results, and tools), so
  // warn with wording contextual to the tab the delete came from
  // ('overview' | 'ingredients' | 'results' | 'tools'). Removing the last step
  // reverts to single-step (empty steps array → top-level fallback). Then stage it.
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
    // The target id is what lets the essence guard tell "re-entering this editor" from
    // "switching to a different essence"; without it the guard would skip the discard
    // prompt for the switch.
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

  // A newly created system is already SELECTED by the store, but the GM was left on the
  // systems library looking at a list — one more click from the thing they just asked for,
  // and with no signal about which row is the new one. Open its System Overview instead,
  // on the Settings tab, exactly as `editSystem` does: a new system's first job is to be
  // configured, and that is the page that configures it.
  //
  // This depends on the store's refresh staleness guard. The manager fires
  // `fabricate.craftingSystemsChanged` from inside its own write, which schedules a refresh
  // holding the PREVIOUS selection; before that guard existed the older run could publish
  // last, so the new system appeared and then flicked back and this navigation landed on
  // the system the GM started from.
  function createSystem() {
    afterTruthyResult(store.createSystem?.(), () => {
      requestSystemTab('settings');
      activeView = 'system-edit';
    });
  }

  // The store resolves the post-import report content (or null when the import was
  // cancelled, failed, or skipped an existing system). Opening the report is driven by
  // that content being present, so there is no separate open flag to fall out of sync.
  async function importSystem() {
    importReportContent = (await store.importSystem?.()) ?? null;
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

  // A folder / whole-pack drop opens the mapping modal BEFORE importing so the GM can
  // categorize + tag per folder; every other drop (single item, an empty or folderless
  // drop) falls through to the unchanged one-shot import path in services.onDropItem.
  async function dropComponent(data) {
    const plan = (await services?.collectImportFolderGroups?.(data)) || null;
    if (plan?.groups?.length) {
      importMappingFolders = plan.groups;
      importMappingOpen = true;
      return;
    }
    // `handled` means the collector already notified (e.g. a compendium-directory folder
    // groups packs, not items) and there is nothing to import — do NOT fall through to
    // onDropItem, or it would fire a second toast for the same drop.
    if (plan?.handled) return;
    services?.onDropItem?.(data);
  }

  async function commitImportFolderMapping(decisions) {
    importMappingOpen = false;
    if (!Array.isArray(decisions) || decisions.length === 0) return;
    await services?.commitImportFolderMapping?.(selectedSystemId, decisions);
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
  // Routed through setView so it passes confirmRouteExit like every other navigation
  // — never by assigning `activeView`, which would silently discard a dirty draft.
  function openSalvageCheckPresets() {
    setView('checks');
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

  // ── EMPTYING A BULK SELECTION (issue 1157) ───────────────────────────────────────
  //
  // Every action that empties a bulk selection unmounts the panel it was performed FROM.
  // The three that do it are Clear (the toolbar's and the panel header's, which are one
  // action reached two ways), a successful set delete, and a successful Apply — and all
  // three left the GM with focus on `document.body` and nothing announced.
  //
  // Both halves are owned HERE rather than by a panel or a browser, and for the same
  // reason the bulk drafts are: the panel is destroyed by the very transition that has to
  // be reported. `BulkDeleteCard`'s own region closed the FAILURE half only, because on
  // that path the card survives; on the success path there was nowhere left to speak
  // from. This root outlives every one of them.
  //
  // ── THE REGION ───────────────────────────────────────────────────────────────────
  // ONE polite region for the whole manager, rendered at the end of `.fabricate-manager`
  // (see the markup) and mounted for the manager's whole life. Two live-region facts
  // shape it, and both are already recorded on `BulkDeleteCard`:
  //
  //  - a region inserted into the DOM together with its text is not announced by most
  //    screen readers, so this one exists from mount and is EMPTY until something is
  //    said;
  //  - re-inserting identical text announces nothing the second time, and "Selection
  //    cleared." twice running is an ordinary GM gesture. The card solves this by having
  //    its owner clear the outcome on the next arm; there is no equivalent moment here,
  //    so the announcement is a NEW OBJECT every time and the markup keys its child node
  //    on it. The node is destroyed and recreated rather than having its text rewritten,
  //    which is a genuine insertion into the region on every announcement — the same
  //    device a per-message node gives a live announcer.
  //
  // It is deliberately NOT a component. A new `.svelte` under `apps/manager/` is claimed
  // by four hand-maintained mirrors (the view-lab case registry, the screenshot evidence
  // map and its pinning test, and this suite's compile list), and one region rendered at
  // one site is not the repeated control the shared-primitive rule exists for.
  let bulkSelectionAnnouncement = $state(null);
  // Orders the deferred announcements below against each other; see
  // `announceBulkSelectionEmptied`. Plain, not `$state`: nothing renders it.
  let bulkAnnouncementTicket = 0;

  // The focus target: the studio's TOOLBAR — the `<section>` holding the filter rows and,
  // as its last row, the selection register. It is a landmark with a per-studio accessible
  // name ("Essence filters"), it is rendered whether or not anything is selected, and it
  // survives every transition below, where the panel, the delete card and the toolbar's own
  // Clear are all gone by the time focus needs somewhere to land.
  //
  // IT IS AN INERT TARGET, AND THAT IS THE POINT (review round, issue 1157). The hop first
  // went to the toolbar's page-selection box, which is a real `<input type="checkbox">`
  // whose `onchange` selects every rendered row: a GM who clicked Clear with the mouse and
  // then pressed Space to scroll would have silently re-selected the whole page, with no
  // visible focus indicator, because the box's only ring is `:focus-visible` and Chrome does
  // not match that for programmatic focus after a pointer interaction. Landing on a
  // `tabindex="-1"` section instead announces where the GM now is, leaves Space as scroll,
  // and leaves every control of the register one Tab away.
  //
  // `tabindex="-1"` is also why the browser's results count was wrongly ruled out earlier as
  // "a `<span>` nothing can focus": that attribute is the standard device for making a
  // non-actionable element a focus target. The toolbar wins on the accessible name, not on
  // focusability.
  //
  // These three are a hand-maintained mirror of the hooks the browser views put on their own
  // toolbars; `manager-mounted.test.js` fails if one drifts.
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
   * ONLY RESCUE FOCUS THE RE-RENDER ACTUALLY DROPPED. A GM who tabbed into the search field
   * while an awaited write was in flight keeps their place; a control the re-render has
   * detached is not somewhere they can still be, whatever the engine left `activeElement`
   * pointing at (Chromium moves it to `<body>`, happy-dom can strand it on the removed node
   * — `recipe-bulk-edit-panel-mounted.test.js` reports both shapes for exactly this reason).
   *
   * @returns {boolean} true only when focus was moved, which is what decides whether the
   *   announcement has a focus utterance to queue behind.
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
   * Report an emptied bulk selection: put the keyboard back on `studio`'s toolbar and
   * announce `message` through the manager's region, IN THAT ORDER.
   *
   * The order is the whole point and it is not the obvious one — see
   * `util/announceAfterFocus.js`, which owns it for this and for `BulkDeleteCard`. Assigning
   * the announcement here, synchronously, is what the first cut did, and it puts a queued
   * `polite` utterance in front of a focus change that cancels it.
   */
  function announceBulkSelectionEmptied(studio, message) {
    const spoken = String(message || '');
    // The ticket is what the delay costs: a sentence still waiting must never land on top of
    // one asked for after it, or two actions inside the delay would leave the region holding
    // the OLDER of the two — with a new node under it, so the GM would hear the wrong
    // sentence rather than nothing. `BulkDeleteCard` carries the same guard.
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

  // ── Bulk edit (issue 772) ────────────────────────────────────────────────────────
  // The panel stages into a draft this root owns; NOTHING is written until Apply. The
  // model's helpers are immutable, so the panel hands back a NEW draft rather than
  // mutating this one — an in-place assumption would compile and silently do nothing.
  function stageComponentBulkDraft(next) {
    componentBulkDraft = next || createComponentBulkDraft();
  }

  // Clearing the selection is the documented escape from a mode that hides unlink, delete
  // and copy-source-UUID; the count reaching zero also discards the draft (see the effect
  // above) and returns the rail to the single-component inspector.
  //
  // Every caller that empties the selection routes through here, so the announcement and
  // the focus hop cannot be had by one exit and missed by another. `message` defaults to
  // the noun-free clear sentence and is overridden by the delete and apply paths with the
  // sentence they are already toasting, so the two audiences are told the same thing.
  function clearComponentBulkSelection(message = selectionClearedAnnouncement()) {
    componentBrowserState.bulkSelectedComponentIds = new Set();
    announceBulkSelectionEmptied('components', message);
  }

  async function applyComponentBulkEdit() {
    if (componentBulkApplying) return false;
    const ids = componentBulkSelectedIds;
    if (ids.size === 0) return false;
    // An unstaged axis is never sent. `essences` is present IFF the essence axis is
    // staged and `difficulty` IFF the DC axis is — a staged all-zero map and a staged 0
    // are REAL edits meaning "clear", so the write primitive tests key presence rather
    // than truthiness and this projection must give it something to test.
    const edit = toBulkComponentEdit(componentBulkDraft);
    if (Object.keys(edit).length === 0) return false;
    componentBulkApplying = true;
    try {
      // The store returns the write RESULT, never a bare boolean, so a `null` covers every
      // no-write case in one test — including the optional call resolving to `undefined`
      // because the action is absent, which a `=== false` check would have read as success.
      const result = await store.applyComponentBulkEdit?.(ids, edit);
      if (!result) return false;
      // The count the GM is told is the count that actually CHANGED, not the count they
      // ticked: the write primitive compares each component before and after, so adding a
      // tag three of five already carry updates two. Naming the selection size instead
      // would report work that did not happen.
      const count = result.updated;
      const message = componentBulkAppliedMessage(count);
      // One `save()` and one `refresh()` happened inside the store action, so the rows are
      // already re-rendering; clearing the selection returns the rail to the inspector and
      // the count-to-zero effect discards the draft. It also announces and re-homes focus,
      // because the apply is one of the three actions that empties the selection.
      clearComponentBulkSelection(message);
      notifyInfo(message);
      return true;
    } finally {
      componentBulkApplying = false;
    }
  }

  // Singular, on the same terms as the panel's own heading and Apply label: the threshold is
  // `> 0`, so ONE ticked row is the advertised case, and this sentence is the only feedback
  // that survives the panel unmounting on a successful apply — as a toast for the GM reading
  // the screen and through the manager's live region for the one who is not.
  //
  // Zero is its own message rather than "applied to 0 components", which reads as a failure
  // for what is a legitimate outcome — every selected component already matched the staged
  // values. A guard chain rather than a nested ternary, which the SonarCloud gate reports as
  // a new code smell.
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

  // The ARMED bulk delete's confirm step (issue 1129). The impact statement is rendered by
  // the panel from `componentBulkDeleteImpact`; this only performs the write and reports what
  // happened. The delete is warned, not blocked, so every selected component is deleted and
  // nothing is skipped.
  async function deleteSelectedComponents(ids) {
    if (componentBulkDeleting) return false;
    const targets = Array.isArray(ids) ? ids : [];
    if (targets.length === 0) return false;
    componentBulkDeleting = true;
    try {
      const result = await store.deleteComponents?.(targets);
      // A FAILED write returns the store's zero result, which is an OBJECT and therefore
      // truthy — `if (!result)` alone caught only the absent-action case and let a failed
      // delete clear the selection and report "Deleted 0 component(s)" on top of the error
      // toast the store already raised. Nothing was deleted, so nothing is announced and the
      // selection stays put; the arm is dropped either way, because the GM's confirmation has
      // been spent and a still-armed button would delete on the next single click.
      const deleted = Number(result?.deleted) || 0;
      if (deleted === 0) {
        // The card SURVIVES this path, so it is the one place the outcome can be spoken and
        // the one control focus can be returned to. The sentence is the neutral one the
        // recipe twin uses, because the two outcomes folded into this branch — a refused
        // write, already toasted, and a concurrent client having deleted the same components
        // — are indistinguishable from here, and "Failed" is false on the more reachable of
        // the two.
        componentBulkDeleteOutcome = text(
          'FABRICATE.Admin.Manager.BulkEdit.DeleteNoneDeleted',
          'Nothing was deleted. The selection is unchanged.'
        );
        return false;
      }
      const message = componentBulkDeletedMessage(result);
      clearComponentBulkSelection(message);
      notifyInfo(message);
      return true;
    } catch (err) {
      // The store catches its own write failures, so reaching here means the failure was
      // elsewhere. Swallowing it at the boundary keeps an unhandled rejection out of a click
      // handler that has no caller to receive it.
      console.error('Fabricate | Failed to delete the selected components:', err);
      return false;
    } finally {
      // Both live here so the comment above stays true on EVERY exit. `store.deleteComponents`
      // catches its own write failures, but it resolves the system and its managed items
      // OUTSIDE that try, so a rejection can reach this function — and a disarm sitting in the
      // `try` after the await would be skipped, leaving an armed button that deletes on the
      // next single click.
      componentBulkDeleteArmed = false;
      componentBulkDeleting = false;
    }
  }

  // `recipesDisabled` is the most consequential outcome of the three — recipes the GM's
  // players could craft this morning and cannot craft now — and the toast is the ONLY
  // feedback that survives the panel unmounting on a successful delete. It is reported when
  // non-zero, and the zero case takes the shorter sentence rather than trailing ", disabling
  // 0 of them", which reads as a warning about nothing.
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

  // ── Recipe bulk edit (issue 1010) ────────────────────────────────────────────────
  // The twin of the block above. The panel stages into a draft this root owns; NOTHING is
  // written until Apply, and the model's helpers are immutable, so the panel hands back a
  // NEW draft rather than mutating this one.
  function stageRecipeBulkDraft(next) {
    recipeBulkDraft = next || createRecipeBulkDraft();
  }

  // Clearing the selection is the documented escape from a mode that hides Edit, Duplicate
  // and Delete; the count reaching zero also discards the draft (see the effect above) and
  // returns the rail to the single-recipe inspector.
  //
  // The twin of `clearComponentBulkSelection` above, including its announcement and focus
  // hop: see that function for why every exit that empties the selection routes through one
  // place per studio.
  function clearRecipeBulkSelection(message = selectionClearedAnnouncement()) {
    recipeBrowserState.bulkSelectedRecipeIds = new Set();
    announceBulkSelectionEmptied('recipes', message);
  }

  // Singular / plural over one count, so the three post-apply sentences below do not each
  // grow their own ternary pair.
  function bulkRecipeCountText(count, oneKey, oneFallback, manyKey, manyFallback) {
    if (count === 1) return text(oneKey, oneFallback);
    return text(manyKey, manyFallback).replace('{count}', count);
  }

  // The book half of the post-apply report, reporting membership EDGES rather than the
  // DEFINITIONS `booksUpdated` counts: the GM asked to put these recipes in that book, so
  // "4 additions and 2 removals" answers them where "1 book updated" does not.
  //
  // Returns `''` when the batch created no edges, including for an unstaged book axis, so
  // the caller composes it in exactly as it does the blocked and rejected sentences.
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
    // Three WHOLE sentences rather than one assembled around a localized " and ": a join
    // word is the part of this string a translator is least able to place, and two of the
    // three shapes never need one.
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

  // The post-apply report, and the AUTHORITY on the blocked count — the panel's pre-flight
  // figure is only a lower bound, because it cannot see collisions the batch itself
  // creates. `rejected` is named separately and is not an expected outcome: it counts
  // recipes a persistence failure excluded from the batch entirely, each of which the write
  // primitive logs, which is what makes "see the console" point at something real.
  //
  // Every sentence COMPOSES; none replaces another. The prototype swaps its books message
  // in for its blocked message with a ternary, which would let a batch that touched books
  // silently swallow the report that some recipes stayed off — the one outcome the GM
  // cannot see by looking at the rows they just deselected.
  function recipeBulkAppliedMessage(result) {
    const updated = Number(result?.updated) || 0;
    const blocked = Number(result?.blockedEnables) || 0;
    const rejected = Number(result?.rejected) || 0;
    const books = recipeBulkBooksMessage(result);
    // Zero is its own message rather than "applied to 0 recipes", which reads as a failure
    // for what is a legitimate outcome — every selected recipe already matched. It is
    // SUPPRESSED when the batch moved book membership: `updated` counts recipes whose own
    // fields changed, so a book-only edit legitimately changes none, and leading with "No
    // recipes needed changing" ahead of "4 additions" reads as a contradiction rather than
    // as the two distinct facts it is.
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

  // The ARMED bulk delete's confirm step (issue 1132). The impact statement is rendered by
  // the panel from `recipeBulkDeleteImpact`; this only performs the write and reports what
  // happened. The delete is warned, not blocked, so every resolvable selected recipe is
  // deleted and nothing is skipped.
  //
  // FAILURE IS NOT SILENT, and this path is genuinely reachable: a GM whose
  // `SETTINGS_MODIFY` has been explicitly revoked passes the client-side `_assertGM` gate
  // and is then refused by the server. The store raises the error toast; this returns the
  // card to IDLE — disarmed, not busy — with the selection intact, so the GM can see what
  // they were about to delete and try again. A stuck spinner over a live selection would be
  // worse than the failure.
  // Arming CLEARS the previous outcome, so the card's live region is free to announce the
  // next one. Without it a second refusal would re-insert identical text, which a live
  // region does not speak.
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
      // A FAILED write returns the store's zero result, which is an OBJECT and therefore
      // truthy — `if (!result)` would catch only the absent-action case and let a failed
      // delete clear the selection and report "Deleted 0 recipe(s)" on top of the error
      // toast the store already raised.
      const deleted = Number(result?.deleted) || 0;
      if (deleted === 0) {
        // The card survives this path, so the outcome is announced through the card's own
        // live region and focus goes back to the control. The store has already raised the
        // Foundry toast; a toast is not a live region, so without this the GM's keyboard is
        // on `<body>` and nothing at all has been said.
        //
        // This branch covers TWO outcomes the store's own `deleteRecipes` cannot let this
        // caller tell apart: a concurrent client already deleted the same recipes (a
        // WARNING — nothing failed), and a refused write (an ERROR, already toasted). Both
        // return the identical zero result, so a single neutral sentence is used rather than
        // the "Failed" wording that was false on the more reachable of the two (issue 1132,
        // review round 2).
        recipeBulkDeleteOutcome = text(
          'FABRICATE.Admin.Manager.BulkEdit.DeleteNoneDeleted',
          'Nothing was deleted. The selection is unchanged.'
        );
        return false;
      }
      const message = recipeBulkDeletedMessage(result);
      clearRecipeBulkSelection(message);
      notifyInfo(message);
      return true;
    } catch (err) {
      // The store catches its own write failures, so reaching here means the failure was
      // elsewhere. Swallowing it at the boundary keeps an unhandled rejection out of a
      // click handler that has no caller to receive it.
      console.error('Fabricate | Failed to delete the selected recipes:', err);
      recipeBulkDeleteOutcome = text(
        'FABRICATE.Admin.Manager.Recipe.BulkEdit.DeleteFailed',
        'Failed to delete the selected recipes.'
      );
      return false;
    } finally {
      // Both live here so the paragraph above stays true on EVERY exit. A disarm sitting in
      // the `try` after the await would be skipped by a rejection, leaving an armed button
      // that deletes on the next single click.
      recipeBulkDeleteArmed = false;
      recipeBulkDeleting = false;
    }
  }

  // The post-delete report, and the only feedback that survives the panel unmounting on a
  // successful delete. Every NON-ZERO outcome is named, and each is omitted when zero rather
  // than stated as ", removing them from 0 books & scrolls", which reads as a warning about
  // nothing. The four-way table is explicit rather than assembled from a localized join
  // word, which is the part of a sentence a translator is least able to place.
  //
  // IT REPORTS `recipeItemsAffected`, THE NUMBER THE CARD PROMISED — not
  // `recipeItemsRewritten`, the definitions the write actually rewrote (review round). The
  // two-number design is right and both names are right; surfacing the IMPLEMENTATION figure
  // to the GM was the defect. On a legacy-basis system membership lives on the recipe and
  // dies with it, so nothing is rewritten while the books really do stop containing the
  // recipes: the card read "Will be removed from 1 book or scroll" and the toast then
  // dropped the clause, making the operation look as though it had done less than it said.
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
    const ids = recipeBulkSelectedIds;
    if (ids.size === 0) return false;
    // An unstaged axis is never sent. Three of the projected keys are FALSY BUT REAL —
    // `enabled: false`, `locked: false` and `checkTierId: null` — so the write primitive
    // tests key PRESENCE rather than truthiness, and this projection is what gives it
    // something to test.
    const edit = toBulkRecipeEdit(recipeBulkDraft);
    if (Object.keys(edit).length === 0) return false;
    recipeBulkApplying = true;
    try {
      // The store returns the write RESULT, never a bare boolean, so a `null` covers every
      // no-write case in one test — including the optional call resolving to `undefined`
      // because the action is absent, which a `=== false` check would have read as success.
      const result = await store.applyRecipeBulkEdit?.(ids, edit);
      if (!result) return false;
      // One save and one refresh happened inside the store action, so the rows are already
      // re-rendering; clearing the selection returns the rail to the single-recipe
      // inspector and the count-to-zero effect discards the draft. The sentence below is the
      // only feedback that survives the panel unmounting on a successful apply, so it is both
      // toasted and announced through the manager's live region.
      const message = recipeBulkAppliedMessage(result);
      clearRecipeBulkSelection(message);
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
            // …and so do the two fields issue 1036 added, for exactly the same reason: the
            // editor can author both BEFORE the first save, so a create call that dropped
            // them would silently discard an Enabled switch the GM turned off and a macro
            // they had already dropped. Presence-gated on `Object.hasOwn` downstream, so
            // `enabled: false` and a null macro are real instructions rather than absences.
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
      // A CLEAN draft never reaches `finishEssenceRouteExit`, so its `cancelEssenceDraft`
      // call does not run for it. Calling it here too means Back always republishes the
      // persisted projections, whichever branch the guard took.
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
    // `deleteEssence` (issue 1036) — the store's singular delete, renamed from
    // `removeEssence` so it pairs with the new `deleteEssences` set delete. It returns a
    // boolean and owns the impact-aware confirm dialog: the delete is warned, not blocked,
    // so there is no component-usage guard to gate this call on.
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

  // The row's enable switch. It routes through the store's `setEssenceEnabled`, which is
  // ONE manager write and which REPORTS how many already-enabled recipes the disable just
  // invalidated — disabling does not retro-disable a recipe, so without that count the
  // consequence would be invisible until someone tried to re-enable one.
  function toggleEssenceEnabled(essenceId, enabled) {
    if (!essenceId) return;
    store.setEssenceEnabled?.(essenceId, enabled === true);
  }

  async function duplicateSelectedEssence(essenceId = selectedEssence?.id) {
    if (!essenceId) return false;
    const nextId = await store.duplicateEssence?.(essenceId);
    if (!nextId) return false;
    // Select the COPY. A duplicate the GM cannot see is indistinguishable from one that
    // was not made, and the copy is what they are about to edit.
    selectedEssenceId = nextId;
    return true;
  }

  // ── Essence bulk edit (issue 1036) ───────────────────────────────────────────────
  // The panel stages into a draft this root owns; NOTHING is written until Apply, and the
  // model's helpers are immutable, so the panel hands back a NEW draft rather than mutating
  // this one. An in-place call would compile, run, and silently do nothing.
  function stageEssenceBulkDraft(next) {
    essenceBulkDraft = next || createEssenceBulkDraft();
  }

  // The third twin of `clearComponentBulkSelection`, announcement and focus hop included.
  function clearEssenceBulkSelection(message = selectionClearedAnnouncement()) {
    essenceBrowserState.bulkSelectedEssenceIds = new Set();
    announceBulkSelectionEmptied('essences', message);
  }

  async function applyEssenceBulkEdit() {
    if (essenceBulkApplying) return false;
    const ids = essenceBulkSelectedIds;
    if (ids.size === 0) return false;
    // An unstaged axis is never sent. Two of the projected keys are FALSY BUT REAL —
    // `colorToken: null` (Clear colour) and `enabled: false` (Disable) — so the write
    // primitive tests key PRESENCE rather than truthiness, and this projection is what
    // gives it something to test.
    const edit = toBulkEssenceEdit(essenceBulkDraft);
    if (Object.keys(edit).length === 0) return false;
    essenceBulkApplying = true;
    try {
      const result = await store.applyEssenceBulkEdit?.(ids, edit);
      if (!result) return false;
      const message = essenceBulkAppliedMessage(Number(result.updated) || 0);
      clearEssenceBulkSelection(message);
      notifyInfo(message);
      return true;
    } finally {
      essenceBulkApplying = false;
    }
  }

  // The third of the three apply reports, on the same terms as its two siblings.
  //
  // ZERO IS ITS OWN SENTENCE (review round, issue 1157). `updated: 0` is reachable — every
  // selected essence already matched the staged values — and it used to fall through to the
  // plural branch and say "Updated 0 essences.", which reads as a failure for a legitimate
  // outcome. That was survivable while the sentence was only a toast; this change makes it
  // the SOLE SPOKEN OUTCOME of a successful action, so the branch both siblings already had
  // is no longer optional here.
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

  // The ARMED bulk delete's confirm step. The impact statement is rendered by the panel
  // from the same rows; this only performs the write and reports what happened. The delete
  // is warned, not blocked, so every selected essence is deleted and nothing is skipped.
  async function deleteSelectedEssences(ids) {
    if (essenceBulkDeleting) return false;
    const targets = Array.isArray(ids) ? ids : [];
    if (targets.length === 0) return false;
    essenceBulkDeleting = true;
    try {
      const result = await store.deleteEssences?.(targets);
      // A FAILED write returns the store's zero result, which is an OBJECT and therefore
      // truthy — `if (!result)` caught only the absent-action case and let a failed delete
      // clear the selection and report "Deleted 0 essence(s)" on top of the error toast the
      // store already raised. The component and recipe twins in this file carry the
      // identical guard; nothing was deleted, so nothing is announced and the selection
      // stays put.
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
      clearEssenceBulkSelection(message);
      notifyInfo(message);
      return true;
    } catch (err) {
      // The store catches its own write failures, so reaching here means the failure was
      // elsewhere. Swallowing it at the boundary keeps an unhandled rejection out of a
      // click handler that has no caller to receive it.
      console.error('Fabricate | Failed to delete the selected essences:', err);
      return false;
    } finally {
      // The disarm lives HERE rather than in the `try` after the await: a rejection would
      // otherwise skip it and leave an armed button that deletes on the next single click.
      essenceBulkDeleteArmed = false;
      essenceBulkDeleting = false;
    }
  }

  // `recipesDisabled` is the most consequential outcome of the three — recipes the GM's
  // players could craft this morning and cannot craft now — and the toast is the ONLY
  // feedback that survives the panel unmounting on a successful delete. It is reported when
  // non-zero, and the zero case takes the shorter sentence rather than trailing ", disabling
  // 0 of them", which reads as a warning about nothing. Mirrors `componentBulkDeletedMessage`.
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

  function selectEnvironment(environmentId = selectedEnvironment?.id) {
    if (!environmentId) return;
    store.selectEnvironment?.(environmentId);
  }

  function editEnvironment(environmentId = selectedEnvironment?.id) {
    if (!environmentId || !canShowEnvironments) return;
    afterTruthyResult(store.selectEnvironment?.(environmentId), () => {
      activeView = 'environment-edit';
    });
  }

  function createEnvironment() {
    if (!canShowEnvironments) return;
    const created = store.createEnvironmentDraft?.();
    if (isPromise(created)) {
      created.then((value) => {
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
      created.then((task) => {
        if (task?.id) selectedGatheringTaskId = task.id;
      });
      return;
    }
    if (created?.id) selectedGatheringTaskId = created.id;
  }

  function editGatheringTask(taskId = selectedGatheringTask?.id) {
    if (!taskId || !canShowEnvironments) return;
    selectedGatheringTaskId = taskId;
    const source = gatheringTaskDefinitions.find((task) => task.id === taskId) || null;
    const snapshot = source ? JSON.parse(JSON.stringify(source)) : null;
    gatheringTaskDraft = snapshot;
    gatheringTaskDraftBaseline = snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
    gatheringTaskSaveError = '';
    activeGatheringTab = 'tasks';
    railGroupUserExpanded.gathering = true;
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
      railGroupUserExpanded.gathering = true;
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
    const proceed =
      (await store.confirmGatheringLibraryTaskCompositionLoss?.(
        selectedSystemId,
        selectedGatheringTaskId,
        gatheringTaskDraft
      )) ?? true;
    if (!proceed) return false; // GM cancelled the match-loss warning — keep editing, no save error
    // Cleared here — once an attempt is actually committed to, and before the awaited store call
    // (mirrors saveRecipeItemDraft). A retry that fails the same way writes a byte-identical
    // string, which $state treats as clean, so the role="alert" region is never re-inserted and a
    // screen reader announces nothing. Dropping it before the await lets the alert leave the DOM
    // while the save is in flight and be re-inserted when the same failure recurs. It is
    // deliberately NOT at the top of the function: the early returns above make no new attempt,
    // and quietly removing a standing failure notice announces nothing at all in its place.
    gatheringTaskSaveError = '';
    gatheringTaskSaving = true;
    try {
      const ok = await store.updateGatheringLibraryTask?.(
        selectedSystemId,
        selectedGatheringTaskId,
        gatheringTaskDraft
      );
      if (ok) {
        gatheringTaskDraftBaseline = JSON.parse(JSON.stringify(gatheringTaskDraft));
        gatheringTaskSaveError = '';
        return true;
      }
      gatheringTaskSaveError = text(
        'FABRICATE.Admin.Manager.Environment.Tasks.SaveFailed',
        'Save failed. Try again.'
      );
      return false;
    } catch (error) {
      console.error('Failed to save gathering task draft', error);
      gatheringTaskSaveError = text(
        'FABRICATE.Admin.Manager.Environment.Tasks.SaveFailed',
        'Save failed. Try again.'
      );
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
    railGroupUserExpanded.gathering = true;
    activeView = 'environments';
  }

  function duplicateGatheringTask(systemId = selectedSystemId, taskId = selectedGatheringTask?.id) {
    if (!systemId || !taskId) return;
    const duplicated = store.duplicateGatheringLibraryTask?.(systemId, taskId);
    if (isPromise(duplicated)) {
      duplicated.then((task) => {
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
      deleted.then((value) => {
        if (value !== false && selectedGatheringTaskId === taskId) selectedGatheringTaskId = '';
      });
      return;
    }
    if (deleted !== false && selectedGatheringTaskId === taskId) selectedGatheringTaskId = '';
  }

  function toggleGatheringTaskEnabled(
    systemId = selectedSystemId,
    taskId = selectedGatheringTask?.id,
    enabled = true
  ) {
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
      created.then((event) => {
        if (event?.id) selectedGatheringEventId = event.id;
      });
      return;
    }
    if (created?.id) selectedGatheringEventId = created.id;
  }

  function editGatheringEvent(eventId = selectedGatheringEvent?.id) {
    if (!eventId || !canShowEnvironments) return;
    selectedGatheringEventId = eventId;
    const source = gatheringEventDefinitions.find((event) => event.id === eventId) || null;
    const snapshot = source ? JSON.parse(JSON.stringify(source)) : null;
    gatheringEventDraft = snapshot;
    gatheringEventDraftBaseline = snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
    gatheringEventSaveError = '';
    activeGatheringTab = 'encounters';
    railGroupUserExpanded.gathering = true;
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
      railGroupUserExpanded.gathering = true;
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
    const proceed =
      (await store.confirmGatheringLibraryEventCompositionLoss?.(
        selectedSystemId,
        selectedGatheringEventId,
        gatheringEventDraft
      )) ?? true;
    if (!proceed) return false; // GM cancelled the match-loss warning — keep editing, no save error
    // Cleared at the same point, and for the same reason, as in saveGatheringTaskDraft: an
    // unchanged error string is not a DOM mutation, so a repeated identical failure would never
    // re-announce — and the early returns above are left alone so a cancelled confirmation does
    // not wipe a failure notice the GM has not yet acted on.
    gatheringEventSaveError = '';
    gatheringEventSaving = true;
    try {
      const ok = await store.updateGatheringLibraryEvent?.(
        selectedSystemId,
        selectedGatheringEventId,
        gatheringEventDraft
      );
      if (ok !== false) {
        gatheringEventDraftBaseline = JSON.parse(JSON.stringify(gatheringEventDraft));
        gatheringEventSaveError = '';
        return true;
      }
      gatheringEventSaveError = text(
        'FABRICATE.Admin.Manager.Environment.Events.SaveFailed',
        'Save failed. Try again.'
      );
      return false;
    } catch (error) {
      // Until issue 919 this `try` had no `catch` at all, so a rejected store call escaped
      // as an unhandled rejection and the GM saw nothing. Mirrors saveGatheringTaskDraft.
      console.error('Failed to save gathering event draft', error);
      gatheringEventSaveError = text(
        'FABRICATE.Admin.Manager.Environment.Events.SaveFailed',
        'Save failed. Try again.'
      );
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
    railGroupUserExpanded.gathering = true;
    activeView = 'environments';
  }

  function duplicateGatheringEvent(
    systemId = selectedSystemId,
    eventId = selectedGatheringEvent?.id
  ) {
    if (!systemId || !eventId) return;
    const duplicated = store.duplicateGatheringLibraryEvent?.(systemId, eventId);
    if (isPromise(duplicated)) {
      duplicated.then((event) => {
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
      deleted.then((value) => {
        if (value !== false && selectedGatheringEventId === eventId) selectedGatheringEventId = '';
      });
      return;
    }
    if (deleted !== false && selectedGatheringEventId === eventId) selectedGatheringEventId = '';
  }

  function toggleGatheringEventEnabled(
    systemId = selectedSystemId,
    eventId = selectedGatheringEvent?.id,
    enabled = true
  ) {
    if (!systemId || !eventId) return;
    store.updateGatheringLibraryEvent?.(systemId, eventId, { enabled });
  }

  function updateSelectedGatheringEvent(updates = {}) {
    if (gatheringEventDraft) {
      gatheringEventDraft = { ...gatheringEventDraft, ...updates };
      return true;
    }
    if (!selectedSystemId || !selectedGatheringEvent?.id) return false;
    return store.updateGatheringLibraryEvent?.(
      selectedSystemId,
      selectedGatheringEvent.id,
      updates
    );
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
    const existing = Array.isArray(editingGatheringTask.toolIds)
      ? editingGatheringTask.toolIds
      : [];
    if (existing.includes(toolId)) return;
    updateSelectedGatheringTask({ toolIds: [...existing, toolId] });
  }

  function removeToolReferenceFromSelectedTask(toolId) {
    if (!editingGatheringTask || !toolId) return;
    const existing = Array.isArray(editingGatheringTask.toolIds)
      ? editingGatheringTask.toolIds
      : [];
    updateSelectedGatheringTask({ toolIds: existing.filter((id) => id !== toolId) });
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
      enabled: false,
    };
    selectedGatheringDropId = row.id;
    updateSelectedGatheringTask({
      dropRows: [...gatheringTaskDropRows(editingGatheringTask), row],
    });
  }

  function updateGatheringTaskDrop(rowId, updates = {}) {
    if (!editingGatheringTask || !rowId) return;
    const rows = gatheringTaskDropRows(editingGatheringTask).map((row) =>
      row.id === rowId ? { ...row, ...updates } : row
    );
    const patch =
      store.gatheringTaskAutopopulateFromComponent?.(
        selectedSystemId,
        editingGatheringTask,
        rows
      ) || {};
    updateSelectedGatheringTask({ dropRows: rows, ...patch });
  }

  function duplicateGatheringTaskDrop(rowId = selectedGatheringDrop?.id) {
    if (!editingGatheringTask || !rowId) return;
    const rows = gatheringTaskDropRows(editingGatheringTask);
    const index = rows.findIndex((row) => row.id === rowId);
    if (index < 0) return;
    const duplicate = { ...JSON.parse(JSON.stringify(rows[index])), id: gatheringDropRowId() };
    selectedGatheringDropId = duplicate.id;
    updateSelectedGatheringTask({
      dropRows: [...rows.slice(0, index + 1), duplicate, ...rows.slice(index + 1)],
    });
  }

  function deleteGatheringTaskDrop(rowId = selectedGatheringDrop?.id) {
    if (!editingGatheringTask || !rowId) return;
    const rows = gatheringTaskDropRows(editingGatheringTask);
    const index = rows.findIndex((row) => row.id === rowId);
    const nextRows = rows.filter((row) => row.id !== rowId);
    selectedGatheringDropId = nextRows[Math.min(index, nextRows.length - 1)]?.id || '';
    updateSelectedGatheringTask({ dropRows: nextRows });
  }

  function moveGatheringTaskDrop(rowId, direction) {
    if (!editingGatheringTask || !rowId) return;
    const rows = gatheringTaskDropRows(editingGatheringTask);
    const index = rows.findIndex((row) => row.id === rowId);
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
    const uuid = resolveDropUuid(data);
    if (!uuid) return false;
    const source = await services?.resolveToolSource?.(uuid);
    if (!source) return false;
    const created = store.createToolDraft?.({}, selectedSystemId);
    if (!created) return false;
    store.stageToolDraftSource?.(source.uuid || uuid, source);
    toolEditorActiveTab = 'overview';
    activeView = 'tool-edit';
    return true;
  }

  async function stageToolEditorSourceDrop(data) {
    const uuid = resolveDropUuid(data);
    if (!uuid) return false;
    const snapshot = await services?.resolveToolSource?.(uuid);
    if (!snapshot) return false;
    store.stageToolDraftSource?.(snapshot.uuid || uuid, snapshot);
    return true;
  }

  async function toggleFocusedToolEnabled(enabled) {
    if (!focusedToolDraft?.id || $viewState.toolDraftBaseline === null) return false;
    return store.toggleToolEnabled?.(focusedToolDraft.id, enabled, selectedSystemId);
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
    const options =
      kind === 'biome' ? gatheringVocabularyOptions('biomes') : gatheringConditionOptions(kind);
    if (!row) return options;
    const attached = new Set(
      gatheringConditionModifierRows(row, kind).map((modifier) => modifier.conditionId)
    );
    return options.filter((option) => !attached.has(option.id));
  }

  function gatheringConditionModifierGroups(row) {
    return {
      timeOfDay: gatheringConditionModifierRows(row, 'timeOfDay'),
      weather: gatheringConditionModifierRows(row, 'weather'),
      biome: gatheringConditionModifierRows(row, 'biome'),
    };
  }

  function updateGatheringDropModifier(rowId, kind, modifierId, updates = {}) {
    if (!editingGatheringTask || !rowId || !kind || !modifierId) return;
    const row = gatheringTaskDropRows(editingGatheringTask).find((entry) => entry.id === rowId);
    if (!row) return;
    const conditionModifiers = gatheringConditionModifierGroups(row);
    conditionModifiers[kind] = conditionModifiers[kind].map((modifier) =>
      modifier.id === modifierId ? { ...modifier, ...updates } : modifier
    );
    updateGatheringTaskDrop(rowId, { conditionModifiers });
  }

  function addGatheringDropModifier(rowId, kind, conditionId) {
    if (!editingGatheringTask || !rowId || !kind || !conditionId) return;
    const row = gatheringTaskDropRows(editingGatheringTask).find((entry) => entry.id === rowId);
    if (!row) return;
    const conditionModifiers = gatheringConditionModifierGroups(row);
    if (conditionModifiers[kind].some((modifier) => modifier.conditionId === conditionId)) return;
    conditionModifiers[kind] = [
      ...conditionModifiers[kind],
      { id: `${kind}-${gatheringDropRowId()}`, conditionId, operator: '+', value: 0 },
    ];
    updateGatheringTaskDrop(rowId, { conditionModifiers });
  }

  function deleteGatheringDropModifier(rowId, kind, modifierId) {
    if (!editingGatheringTask || !rowId || !kind || !modifierId) return;
    const row = gatheringTaskDropRows(editingGatheringTask).find((entry) => entry.id === rowId);
    if (!row) return;
    const conditionModifiers = gatheringConditionModifierGroups(row);
    conditionModifiers[kind] = conditionModifiers[kind].filter(
      (modifier) => modifier.id !== modifierId
    );
    updateGatheringTaskDrop(rowId, { conditionModifiers });
  }

  function addGatheringEventConditionModifier(kind, conditionId) {
    if (!editingGatheringEvent?.id || !kind || !conditionId) return;
    const conditionModifiers = gatheringConditionModifierGroups(editingGatheringEvent);
    if (conditionModifiers[kind].some((modifier) => modifier.conditionId === conditionId)) return;
    conditionModifiers[kind] = [
      ...conditionModifiers[kind],
      { id: `${kind}-${gatheringDropRowId()}`, conditionId, operator: '+', value: 0 },
    ];
    updateSelectedGatheringEvent({ conditionModifiers });
  }

  function updateGatheringEventConditionModifier(kind, modifierId, updates = {}) {
    if (!editingGatheringEvent?.id || !kind || !modifierId) return;
    const conditionModifiers = gatheringConditionModifierGroups(editingGatheringEvent);
    conditionModifiers[kind] = conditionModifiers[kind].map((modifier) =>
      modifier.id === modifierId ? { ...modifier, ...updates } : modifier
    );
    updateSelectedGatheringEvent({ conditionModifiers });
  }

  function deleteGatheringEventConditionModifier(kind, modifierId) {
    if (!editingGatheringEvent?.id || !kind || !modifierId) return;
    const conditionModifiers = gatheringConditionModifierGroups(editingGatheringEvent);
    conditionModifiers[kind] = conditionModifiers[kind].filter(
      (modifier) => modifier.id !== modifierId
    );
    updateSelectedGatheringEvent({ conditionModifiers });
  }

  function pickCharacterModifierForEvent(modifierId) {
    if (!editingGatheringEvent?.id || !modifierId) return;
    const refs = Array.isArray(editingGatheringEvent.characterModifiers)
      ? editingGatheringEvent.characterModifiers
      : [];
    if (refs.some((ref) => ref.modifierId === modifierId)) return;
    characterModifierSearchTerm = '';
    const newRef = {
      id: `char-mod-${modifierId}-${refs.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
      modifierId,
      operator: '+',
      min: null,
      max: null,
      expressionOverride: '',
    };
    updateSelectedGatheringEvent({ characterModifiers: [...refs, newRef] });
  }

  function onUpdateEventCharacterModifier(refId, patch) {
    if (!editingGatheringEvent?.id || !refId) return;
    const refs = Array.isArray(editingGatheringEvent.characterModifiers)
      ? editingGatheringEvent.characterModifiers
      : [];
    const next = refs.map((ref) => (ref.id === refId ? { ...ref, ...patch } : ref));
    updateSelectedGatheringEvent({ characterModifiers: next });
  }

  function onDeleteEventCharacterModifier(refId) {
    if (!editingGatheringEvent?.id || !refId) return;
    const refs = Array.isArray(editingGatheringEvent.characterModifiers)
      ? editingGatheringEvent.characterModifiers
      : [];
    updateSelectedGatheringEvent({ characterModifiers: refs.filter((ref) => ref.id !== refId) });
  }

  function setEventCharacterModifierOverrideEnabled(ref, enabled, libraryEntry) {
    const expressionOverride = enabled ? libraryEntry?.expression || '' : '';
    onUpdateEventCharacterModifier(ref.id, { expressionOverride });
  }

  function selectGatheringTab(tabId) {
    activeGatheringTab = visibleGatheringNavItems.some((tab) => tab.id === tabId)
      ? tabId
      : 'environments';
    railGroupUserExpanded.gathering = true;
  }

  function openWorldParties() {
    return afterTruthyResult(confirmRouteExit('world'), () => {
      activeTravelTab = 'parties';
      activeView = 'world';
    });
  }

  // World > Rules & Resources (issue 1311). UNGATED, exactly like Currency was on its own and
  // like Travel, and for the same reason: the libraries have to be authorable before any
  // crafting system references them.
  //
  // The destination travels as the route-exit subject id, because a Rules & Resources page is
  // the "same group, different subject" case that parameter exists for — without it a
  // navigation guard could not tell a real move apart from re-entering the page the GM is
  // already on.
  const WORLD_RULES_ROUTES = Object.freeze({
    currency: 'world-currency',
    prerequisites: 'world-prerequisites',
    modifiers: 'world-modifiers',
  });
  function openWorldRulesDestination(destination = 'currency') {
    const view = WORLD_RULES_ROUTES[destination];
    if (!view) return;
    return afterTruthyResult(confirmRouteExit(view, destination), () => {
      railGroupUserExpanded.worldRules = true;
      activeView = view;
    });
  }

  function activateWorldRulesParent() {
    railGroupUserExpanded.worldRules = true;
    if (isWorldRulesRoute) return;
    openWorldRulesDestination('currency');
  }

  // The cross-copy between the two libraries (issue 1308's `characterModifierPrerequisiteCopy`)
  // used to be an in-page affair: both lists rendered on System Settings, so copying expanded
  // the other section and scrolled to the new row. Across two sibling routes it is a
  // NAVIGATION, which a page component cannot perform — so each page hands the source entry up
  // and this pair owns the mapping, the write, the route change and the open request.
  //
  // The nonce is what makes the request re-assertable: copying the same entry twice must open it
  // both times, and an id alone cannot say that it was asked for again.
  let worldRulesRequestOpenId = $state('');
  let worldRulesRequestOpenNonce = $state(0);

  // The copy announcement moved up here with the handler. It used to live on the System Settings
  // page beside both lists; once the copy became a NAVIGATION the source page unmounts, so an
  // announcement rendered there would be torn down before a screen reader read it. The
  // destination page scrolls to and focuses the new row, which is the sighted half of the same
  // confirmation — this is the other half.
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
    // Issue 1257. The rail row does not render while the gate is shut, so this refusal is for
    // every OTHER caller — a restored token, a future deep link, a test — and it is stated on
    // the navigation rather than only on the markup for the same reason
    // `openWorldTravelDestination` states its own destination allowlist.
    if (!worldDowntimeAvailable) return;
    return afterTruthyResult(confirmRouteExit('world-downtime'), () => {
      railGroupUserExpanded.worldDowntime = true;
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
    // RE-ACTIVATION, not navigation. Clicking the sub-item for the tab already on screen used
    // to do nothing at all, because Core had nothing to navigate to — but a companion whose
    // tab is a list that drills into an editor does: the GM asking for a screen they are
    // notionally already on means "take me back up to it".
    //
    // Core cannot act on that itself. The drill-down is inside the companion's own target and
    // Core neither knows the level nor could restore it, so the click is OFFERED to the mount
    // through a handler it registered, and Core's own behaviour is unchanged when no companion
    // took it. That handler is what makes this DISTINGUISHABLE from a first mount, which is
    // the property the seam needs: a re-activation pops one level, a mount initialises, and a
    // signal a companion had to disambiguate by remembering whether it had mounted before
    // would be wrong the first time a remount followed a drill-down.
    //
    // Deliberately NOT routed through `confirmRouteExit`: no route is being exited and no
    // Core draft is at risk. Whether the companion's own unsaved work should stop it is the
    // companion's question to ask, inside its handler.
    if (isWorldDowntimeRoute && worldDowntimeTabId === tabId) {
      downtimeChromeChannel.reselect();
      return;
    }
    // The destination TAB travels as the route-exit subject id, because a Downtime tab is
    // precisely the "same view token, different subject" case that parameter exists for. Without
    // it a companion's navigation guard could not tell this apart from the parent rail item
    // re-entering the route the GM is already on, which navigates nowhere and must not prompt.
    return afterTruthyResult(confirmRouteExit('world-downtime', tabId), () => {
      worldDowntimeTabId = tabId;
      railGroupUserExpanded.worldDowntime = true;
      activeView = 'world-downtime';
    });
  }

  /**
   * A mounted companion asking Core to take the GM to another of its OWN tabs (issue 1332).
   *
   * ROUTED THROUGH THE RAIL'S OWN HANDLER, never around it. A companion's programmatic request
   * and a GM's click are the same navigation and must not come to mean different things: the
   * tab already on screen re-activates rather than remounting, any other tab is offered to the
   * companion's own `onBeforeNavigate` guard with reason `'tab'`, and an allowed move expands
   * the group and commits the route. A second implementation would be a second set of those
   * rules, correct on the day it was written.
   *
   * MEMBERSHIP COMES FROM THE REGISTERED PROVIDER, never from `downtimeTabs`. That chain
   * answers "what is Core RENDERING", and it falls back to Core's own preview tab ids — which
   * no companion registered. The window where the two differ is real rather than theoretical:
   * between a companion's `unregister()` and Core's next render its mount is still the live
   * one, and reading the rendered list there would hand a provider that no longer exists a
   * working route onto Core's own screens.
   *
   * The two REFUSALS below are stated here rather than read back out of the handler, because
   * the handler reports both by returning `undefined`, which is also what it returns when it
   * re-activates and when there is no guard to ask. Reading its return for them would make a
   * refusal indistinguishable from the two things that did exactly what was asked.
   *
   * @param {string} tabId A tab id the live mount's own provider registered.
   * @returns {boolean|Promise<boolean>} Whether the GM moved; a promise when the companion's
   *   own guard answers asynchronously, so the answer is never a claim about an open dialog.
   */
  function navigateWorldDowntimeTab(tabId) {
    // A well-formed id this provider does not declare is `false`, not a throw: the tab set is a
    // runtime fact that moves under a companion — a provider may re-register with a different
    // one, and a conditional tab may not exist yet — so this is a question, not a defect. The
    // channel has already thrown on a malformed id, which never is one.
    if (!downtimeProvider?.tabs?.some((tab) => tab.id === tabId)) return false;
    // Issue 1257's gate, restated for the same reason `openWorldDowntime` restates it: the
    // route is unreachable while the gate is shut, so a companion cannot be routed onto it.
    if (!worldDowntimeAvailable) return false;
    const moved = openWorldDowntimePreview(tabId);
    // `undefined` reaches here only from the re-activation branch or from a route exit with
    // nothing to ask — both did what the companion asked, so both are `true`. Only an explicit
    // `false` is a veto, which is the `=== false` reading every guard on this route uses.
    if (isPromise(moved)) return moved.then((value) => value !== false);
    return moved !== false;
  }

  // World > Travel (issue 1282). No availability refusal: the route is ungated, exactly like
  // World > Currency and unlike experimental-gated Downtime.
  function openWorldTravelDestination(destination = 'realms') {
    if (!['realms', 'map'].includes(destination)) return;
    return afterTruthyResult(confirmRouteExit('world-travel', destination), () => {
      worldTravelTab = destination;
      railGroupUserExpanded.worldTravel = true;
      activeView = 'world-travel';
    });
  }

  function activateWorldTravelParent() {
    railGroupUserExpanded.worldTravel = true;
    if (isWorldTravelRoute) return;
    openWorldTravelDestination('realms');
  }

  function openGatheringSection(tabId = 'environments') {
    if (!canShowEnvironments) return;
    const nextTab = visibleGatheringNavItems.some((tab) => tab.id === tabId)
      ? tabId
      : 'environments';
    afterTruthyResult(confirmRouteExit('environments'), () => {
      activeGatheringTab = nextTab;
      railGroupUserExpanded.gathering = true;
      activeView = 'environments';
    });
  }

  function enterToolEditor() {
    toolEditorActiveTab = 'overview';
    activeView = 'tool-edit';
  }

  function openToolEditor(toolId) {
    const id = String(toolId || '');
    if (!id) return false;
    if (currentView === 'tool-edit' && String(focusedToolDraft?.id || '') === id) return true;
    afterTruthyResult(confirmToolsRouteExit('tool-edit', id), () => {
      if (store?.openToolDraft?.(id, selectedSystemId) === false) return;
      enterToolEditor();
    });
    return true;
  }

  function selectLibraryTool(toolId) {
    if (!toolId) return false;
    return store?.openToolDraft?.(toolId, selectedSystemId) ?? false;
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

  async function deleteSelectedLibraryTool() {
    if (!focusedToolDraft) return false;
    const confirmed = await services?.confirmDeleteTool?.({ tool: focusedToolDraft });
    if (confirmed !== true) return false;
    const deleted = await store?.deleteToolDraft?.();
    if (deleted !== true) return false;
    activeView = 'tools';
    return true;
  }

  function activateGatheringParent() {
    if (isActiveGatheringChildRoute) {
      railGroupUserExpanded.gathering = true;
      return;
    }
    openGatheringSection('environments');
  }

  // Crafting nav group handlers (issue 511), mirroring the gathering group. Route
  // exit runs through `confirmRouteExit` (the Manager confirm-discard guard) via
  // `setView`/`afterTruthyResult`.
  function openCraftingSection(tabId = 'recipes') {
    const item = craftingNavItems.find((tab) => tab.id === tabId) || craftingNavItems[0];
    const nextView = item?.view || 'recipes';
    afterTruthyResult(confirmRouteExit(nextView), () => {
      activeView = nextView;
      railGroupUserExpanded.crafting = true;
    });
  }

  function activateCraftingParent() {
    if (isCraftingRoute) {
      railGroupUserExpanded.crafting = true;
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
    const patch =
      craftingVisibilityMode === 'item'
        ? { item: { limitUses: limited === true, maxUses: 1 } }
        : {
            learn: { limitLearning: limited === true, learnScope: 'perInstance', learnsAllowed: 1 },
          };
    store.updateRecipeItemCaps?.(recipeItemId, patch);
  }

  // Deep PLAIN clone for the recipe-item draft + baseline. Mirrors the recipe
  // draft helpers: JSON round-trip strips reactivity and shared references so the
  // dirty comparison and discard-revert are stable.
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
      recipeItemLinkedSourceSnapshot = recipeItemSourceSnapshot(source);
      activeView = 'recipe-item-edit';
      railGroupUserExpanded.crafting = true;
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

  // Add / remove a recipe on the edited book. Membership lives on the book, so these
  // STAGE into the recipe-item draft's `recipeIds` (persisted on Save, reverted on
  // Discard) rather than editing the recipe directly — no "Recipe updated" toast.
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

  // Create a recipe item from a dropped world/compendium Item (issue 844). The
  // Books & Scrolls surface resolves the drop to a UUID via `resolveDropData` and
  // hands it here; we add + link the definition, then open its editor. This replaced
  // the former picker modal, which was seeded only from the world-item list and so
  // rendered an empty/unusable window in a fresh world with no world items.
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
    return (selectedSystem?.sceneOptions || []).find((scene) => scene.uuid === sceneUuid) || null;
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
        tone: 'disabled',
      };
    }
    const scene = linkedSceneForEnvironment(environment);
    if (!scene) {
      return {
        id: 'missing',
        label: text('FABRICATE.Admin.Manager.Environment.SceneMissing', 'Scene unresolved'),
        tone: 'warning',
      };
    }
    return {
      id: 'linked',
      label: text('FABRICATE.Admin.Manager.Environment.SceneLinked', 'Linked scene'),
      name: scene.name || environment.sceneUuid,
      tone: 'active',
    };
  }

  /**
   * One of the three environment inspector counts, as the store computed it.
   *
   * All three now read a stored number with a zero fallback — the pattern
   * `EnvironmentsBrowserView.svelte:340-345` already uses for the same fact. The
   * `environmentComposedIds` fallback these three used to share is deleted, not moved:
   *
   * - It was **unreachable in practice.** `adminStore.js`'s `_buildEnvironmentState` writes a
   *   finite entry into `environmentTaskCounts` for every environment in the same `listBySystem`
   *   result this component iterates as `environmentList`, so the fallback arm could only be
   *   taken for an environment absent from that map — never true for one the UI is rendering a
   *   row for. No test exercises `data-environment-fact` at all.
   * - Where it did run it was **wrong.** It worked only from the three id lists on the
   *   environment object: structurally match-blind (no biome, danger, or condition evaluation)
   *   and mode-blind (it unioned `enabled*Ids` with `forced*Ids` in both composition modes). It
   *   was one of the disagreeing copies of the composition rule that issue 1321 collapses, and
   *   this component cannot host the correct rule — it imports no gathering library data.
   *
   * Fixing it here would have meant new data wiring for an arm nothing reaches; the honest
   * outcome is that the store is the single answer and this is a read of it.
   */
  function environmentStoredCount(environment, key) {
    const stored = $viewState.environmentTaskCounts?.[String(environment?.id || '')]?.[key];
    return Number.isFinite(stored) ? stored : 0;
  }

  function environmentComposedTaskCount(environment) {
    return environmentStoredCount(environment, 'availableTaskCount');
  }

  function environmentComposedEventCount(environment) {
    return environmentStoredCount(environment, 'availableEventCount');
  }

  function environmentRequiredToolCount(environment) {
    return environmentStoredCount(environment, 'requiredToolCount');
  }

  function gatheringTaskName(task) {
    return String(
      task?.name ||
        text('FABRICATE.Admin.Manager.Environment.Tasks.UnnamedTask', 'Unnamed gathering task')
    ).trim();
  }

  function gatheringTaskImage(task) {
    return task?.img || DEFAULT_GATHERING_TASK_IMG;
  }

  function gatheringTaskDropRows(task) {
    return Array.isArray(task?.dropRows) ? task.dropRows : [];
  }

  function gatheringManagedItemLabel(componentId) {
    const item = (selectedSystem?.managedItemOptions || []).find(
      (option) => String(option.id || '') === String(componentId || '')
    );
    return item?.name || componentId || '';
  }

  function gatheringManagedItemImage(componentId) {
    const item = (selectedSystem?.managedItemOptions || []).find(
      (option) => String(option.id || '') === String(componentId || '')
    );
    return item?.img || 'icons/svg/item-bag.svg';
  }

  function gatheringDropName(row) {
    return (
      row?.name ||
      gatheringManagedItemLabel(row?.componentId) ||
      row?.itemUuid ||
      text('FABRICATE.Admin.Manager.Environment.Tasks.UnresolvedDrop', 'Unresolved drop')
    );
  }

  function gatheringDropImage(row) {
    return row?.img || gatheringManagedItemImage(row?.componentId) || 'icons/svg/item-bag.svg';
  }

  function gatheringOptionLabel(kind, id) {
    const options = selectedGatheringSystemConfig.vocabularies?.biomes?.values;
    const option = (Array.isArray(options) ? options : []).find(
      (value) => String(value?.id || value) === String(id || '')
    );
    return String(option?.label || option?.id || id || '').trim();
  }

  function gatheringConditionLabel(kind, id) {
    if (kind === 'biome') return gatheringOptionLabel('biome', id) || String(id || '');
    const setting = selectedGatheringSystemConfig.conditions?.[kind] || {};
    const option = (Array.isArray(setting.values) ? setting.values : []).find(
      (value) => String(value?.id || value) === String(id || '')
    );
    return String(option?.label || option?.id || id || '').trim();
  }

  function gatheringModifierKindIcon(kind, conditionId = '') {
    if (kind === 'weather') return 'fas fa-cloud-sun';
    if (kind === 'timeOfDay') return 'fas fa-clock';
    const option = gatheringVocabularyOptions('biomes').find(
      (value) => String(value?.id || value) === String(conditionId || '')
    );
    return String(option?.icon || '').trim() || 'fas fa-mountain-sun';
  }

  function gatheringModifierCardTitle(kind, scope = 'task') {
    if (kind === 'biome') {
      return scope === 'event'
        ? text('FABRICATE.Admin.Manager.Environment.Events.BiomeModifiers', 'Biome modifiers')
        : text('FABRICATE.Admin.Manager.Environment.Tasks.BiomeModifiers', 'Biome modifiers');
    }
    if (kind === 'weather')
      return text(
        'FABRICATE.Admin.Manager.Environment.Tasks.WeatherModifiers',
        'Weather modifiers'
      );
    return text('FABRICATE.Admin.Manager.Environment.Tasks.TimeModifiers', 'Time modifiers');
  }

  function gatheringModifierCardHint(kind, scope = 'task') {
    if (scope === 'event') {
      if (kind === 'biome')
        return text(
          'FABRICATE.Admin.Manager.Environment.Events.BiomeModifiersHint',
          "Adjust this event's chance based on the gathering environment's biomes."
        );
      if (kind === 'weather')
        return text(
          'FABRICATE.Admin.Manager.Environment.Events.WeatherModifiersHint',
          "Adjust this event's chance based on the active weather condition."
        );
      return text(
        'FABRICATE.Admin.Manager.Environment.Events.TimeModifiersHint',
        "Adjust this event's chance based on the active time of day."
      );
    }
    if (kind === 'biome')
      return text(
        'FABRICATE.Admin.Manager.Environment.Tasks.BiomeModifiersHint',
        "Adjust this drop's chance based on the gathering environment's biomes."
      );
    if (kind === 'weather')
      return text(
        'FABRICATE.Admin.Manager.Environment.Tasks.WeatherModifiersHint',
        "Adjust this drop's chance based on the active weather condition."
      );
    return text(
      'FABRICATE.Admin.Manager.Environment.Tasks.TimeModifiersHint',
      "Adjust this drop's chance based on the active time of day."
    );
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

  // The drop-rate input/blur/keydown trio that used to live here is gone with the
  // hand-rolled slider it drove (issue 883). `ChanceSlider` owns those three handlers now,
  // including the commit-on-blur behaviour: an empty field reverts to the model value on
  // blur rather than being committed. The COUNT field below still hand-rolls them, because
  // it is a bare numeric field with no slider and no shared control to render through.
  function onGatheringDropCountInput(rowId, event) {
    const input = event.currentTarget;
    const normalized = String(input.value || '')
      .replace(/\D+/g, '')
      .replace(/^0+/, '');
    input.value = normalized;
    const quantity = Number(normalized);
    if (Number.isInteger(quantity) && quantity >= 1 && quantity <= 999)
      updateGatheringTaskDrop(rowId, { quantity });
  }

  function onGatheringDropCountBlur(row, event) {
    const input = event.currentTarget;
    const normalized = String(input.value || '')
      .replace(/\D+/g, '')
      .replace(/^0+/, '');
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
    const currentValue =
      event.currentTarget.value === ''
        ? gatheringDropCountValue(row)
        : Number(event.currentTarget.value);
    const quantity = gatheringDropCountValue({
      quantity:
        (Number.isFinite(currentValue) ? currentValue : gatheringDropCountValue(row)) +
        (event.key === 'ArrowUp' ? 1 : -1),
    });
    event.currentTarget.value = String(quantity);
    updateGatheringTaskDrop(row.id, { quantity });
  }

  function gatheringTaskAvailability(task) {
    const timeValues = Array.isArray(task?.timeOfDay) ? task.timeOfDay : [];
    const weatherValues = Array.isArray(task?.weather) ? task.weather : [];
    const times =
      timeValues.length > 0
        ? timeValues
            .map((id) => gatheringConditionLabel('timeOfDay', id))
            .filter(Boolean)
            .join(', ')
        : text('FABRICATE.Admin.Manager.Environment.Tasks.AnyTime', 'Any time');
    const weather =
      weatherValues.length > 0
        ? weatherValues
            .map((id) => gatheringConditionLabel('weather', id))
            .filter(Boolean)
            .join(', ')
        : text('FABRICATE.Admin.Manager.Environment.Tasks.AnyWeather', 'Any weather');
    return `${times}, ${weather}`;
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
    return environmentList.filter((environment) => {
      if (String(environment?.craftingSystemId || '') !== String(selectedSystemId || ''))
        return false;
      const enabledIds = Array.isArray(environment?.enabledTaskIds)
        ? environment.enabledTaskIds.map(String)
        : [];
      return enabledIds.includes(taskId);
    });
  }

  function gatheringEventReferencingEnvironments(event) {
    if (!event?.id) return [];
    const eventId = String(event.id);
    return environmentList.filter((environment) => {
      if (String(environment?.craftingSystemId || '') !== String(selectedSystemId || ''))
        return false;
      const enabledIds = Array.isArray(environment?.enabledEventIds)
        ? environment.enabledEventIds.map(String)
        : [];
      return enabledIds.includes(eventId);
    });
  }

  /**
   * The environments a library gathering record is active in right now — the shared
   * `activeEnvironmentsForRecord` seam, which owns composition (mode, match, forces,
   * exclusions) AND the runtime weather/time-of-day gate.
   *
   * This is the single answer behind BOTH "Active environments" facts. They previously
   * disagreed twice over: the task fact hand-rolled biome, weather and time inline over a
   * `gatheringTaskAllowedInEnvironment` helper that applied `enabledTaskIds` as an allow-list in
   * every mode and never read `forcedTaskIds`, and the event fact was `enabledEventIds.includes`
   * and nothing else. Both are deleted; see issue 1321.
   *
   * Only the two SCOPING filters stay here, because they answer "which environments is this GM
   * looking at" rather than "does this record compose": the disabled-environment filter and the
   * system filter. The seam deliberately applies neither.
   *
   * `conditionSettings` is handed the raw SETTINGS object (`{weather: {enabled, current}, …}`),
   * not a current-conditions shape — the module owns that conversion and needs the `enabled`
   * flags the current shape does not carry.
   *
   * @param {object} record Library task or event.
   * @param {'task' | 'event'} kind
   * @param {object[]} scopedEnvironments Caller-scoped; see above.
   */
  function activeEnvironmentsForGatheringRecord(record, kind, scopedEnvironments) {
    return activeEnvironmentsForRecord(record, scopedEnvironments, kind, {
      conditionSettings: selectedGatheringSystemConfig.conditions,
    });
  }

  // The `task.enabled === false` early return this used to open with is gone rather than kept as
  // a second gate: `activeEnvironmentsForRecord` returns `[]` for a library-disabled record
  // without inspecting an environment.
  //
  // The `|| selectedSystemId` in the system filter is PRESERVED from the shipped code, and is a
  // deliberate asymmetry with the event fact below, which has no such fallback: a legacy
  // environment with no `craftingSystemId` counts for tasks and not for events. Unifying the two
  // would be a third behaviour change on top of this fact's two, and it is not this change's.
  function activeGatheringTaskEnvironmentCount(task) {
    return activeEnvironmentsForGatheringRecord(
      task,
      'task',
      environmentList.filter(
        (environment) =>
          environment?.enabled !== false &&
          String(environment?.craftingSystemId || selectedSystemId) ===
            String(selectedSystemId || '')
      )
    ).length;
  }

  // Site 10's fact. Extracted from an inline IIFE in the markup so it sits beside the task fact
  // it now shares a definition with, and so the two are read together when either changes.
  function activeGatheringEventEnvironmentCount(event) {
    return activeEnvironmentsForGatheringRecord(
      event,
      'event',
      environmentList.filter(
        (environment) =>
          environment?.enabled !== false &&
          String(environment?.craftingSystemId || '') === String(selectedSystemId || '')
      )
    ).length;
  }

  function environmentFacts(environment) {
    if (!environment) return [];
    return [
      {
        id: 'tasks',
        label: text('FABRICATE.Admin.Environments.Tasks', 'Tasks'),
        value: environmentComposedTaskCount(environment),
      },
      {
        id: 'events',
        label: text('FABRICATE.Admin.Environments.Events', 'Events'),
        value: environmentComposedEventCount(environment),
      },
      {
        id: 'required-tools',
        label: text('FABRICATE.Admin.Environments.RequiredTools', 'Required tools'),
        value: environmentRequiredToolCount(environment),
      },
      {
        id: 'mode',
        label: text('FABRICATE.Admin.Environments.SelectionMode', 'Selection mode'),
        value: environmentSelectionModeLabel(environment),
      },
    ];
  }

  function environmentDirtyFor(environment) {
    return (
      environment?.id &&
      $viewState.environmentDraft?.id === environment.id &&
      $viewState.environmentDraftDirty === true
    );
  }

  function environmentInvalidFor(environment) {
    return (
      environment?.id &&
      $viewState.environmentDraft?.id === environment.id &&
      environmentValidationCount > 0
    );
  }

  // `componentSourceState` lived here to tone the inline components inspector's source
  // chip. That inspector is now `ComponentBrowserInspector` (issue 676), which derives
  // its own linked badge, and the browser row derives its origin pill in
  // `ComponentsBrowserView` — so the helper had no callers left.

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

  function normalizeVocabularyKey(value) {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    return normalized || 'general';
  }

  function buildCategoryRows(categories, usage, icons) {
    const generalName = text('FABRICATE.Admin.Manager.Recipe.General', 'General');
    const customRows = uniqueSorted(categories || []).map((category) => {
      const key = normalizeVocabularyKey(category);
      const recipeUsageCount = usage.get(key) || 0;
      return {
        id: key,
        kind: 'category',
        name: category,
        icon: categoryIconFor(icons, category),
        recipeUsageCount,
        totalUsage: recipeUsageCount,
        locked: false,
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
        locked: true,
      },
      ...customRows,
    ];
  }

  // Component-category rows (issue 676). Shaped exactly like buildCategoryRows so the
  // Tags & Categories screen can render both sections through one row component, but
  // fed from its own vocabulary and its own usage map. `kind` distinguishes them for
  // the removal-confirmation copy.
  function buildComponentCategoryRows(categories, usage, icons) {
    const generalName = text('FABRICATE.Common.General', 'General');
    const customRows = uniqueSorted(categories || []).map((category) => {
      const key = normalizeVocabularyKey(category);
      const componentUsageCount = usage.get(key) || 0;
      return {
        id: key,
        kind: 'component-category',
        name: category,
        icon: categoryIconFor(icons, category),
        componentUsageCount,
        totalUsage: componentUsageCount,
        locked: false,
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
        locked: true,
      },
      ...customRows,
    ];
  }

  function buildTagRows(tags, usage) {
    return uniqueSorted(tags || []).map((tag) => {
      const key = normalizeVocabularyKey(tag);
      const componentUsageCount = usage.get(key) || 0;
      return {
        id: key,
        kind: 'tag',
        name: tag,
        componentUsageCount,
        totalUsage: componentUsageCount,
      };
    });
  }

  function countLabelParts(label) {
    const normalized = String(label ?? '')
      .trim()
      .replace(/\s+/g, ' ');
    const firstSpace = normalized.indexOf(' ');
    if (firstSpace === -1) return { lead: normalized, rest: '' };
    return {
      lead: normalized.slice(0, firstSpace),
      rest: normalized.slice(firstSpace + 1),
    };
  }
</script>

<div
  class="fabricate-manager"
  data-manager-view={currentView}
  data-world-travel-tab={worldTravelTabAttribute}
  data-world-rules-tab={isWorldRulesRoute ? worldRulesTab : undefined}
>
  <!--
    The manager titlebar: a thin, always-present identity strip above the header.
    Its right-hand end answers "how does the selected system resolve?" from every screen.
    Its gold badge is the PREMIUM signal, and it appears only when a companion module has
    registered with `managerExtensions` — in the free module the slot is simply empty.
  -->
  {#if !isToolStudioRoute}
    <div
      class="manager-titlebar"
      data-manager-titlebar
      aria-label={text('FABRICATE.Admin.Manager.Titlebar.Label', 'Crafting manager')}
    >
      <!--
      The layer-group icon and "Crafting Systems" product label used to lead this
      strip, but the Foundry window's own title bar already names the app — a second
      copy inside the window was duplicated chrome (issue 643).

      The gold badge used to carry the SELECTED SYSTEM's name and no longer does (issue
      1185): the rail's crafting-system card already names the selected system on every
      screen, so the strip was repeating it. The slot now carries the one thing nothing
      else in the chrome says — that a premium companion module is installed and connected
      — and the rail's own PREMIUM chip steps down to a quiet marker in that state, so the
      loud signal is stated exactly once.
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
          <i class="fas fa-dice-d20 manager-titlebar-status-icon" aria-hidden="true"></i>
          <span class="manager-titlebar-status-text">{titlebarStatusLabel()}</span>
        </span>
      {/if}
    </div>
  {/if}

  {#if !isToolStudioRoute}
    <!--
      Two children, always: the heading block and the trailing actions. The Downtime route
      briefly led this header with a 42px glyph tile from the prototype, and it was removed
      (issue 1185) because no other Manager route has one — consistency across the app beats
      parity with one screen's mockup. It is also why `.manager-header`'s `space-between` can
      be trusted again: a third child parked the heading in the middle of the row.
    -->
    <header class="manager-header">
      <div class="manager-heading">
        <nav
          class="manager-breadcrumbs"
          aria-label={text('FABRICATE.Admin.Manager.Breadcrumbs', 'Breadcrumbs')}
        >
          <!--
            TWO ROOTS, NOT ONE (issue 1322). `Crafting Systems` used to lead every trail in the
            Manager, including the World ones, so a GM configuring their world's parties or
            downtime read `Crafting Systems > World > ...` — which says World is a page inside a
            crafting system. It is not: World routes are `every system`, as the rail's own
            micro-label says, and several of them (Parties, Currency, Travel) are reachable
            before any crafting system has opted into anything.

            So the trail has two possible roots and this is the fork between them. A World route
            is rooted at `World`; everything else is rooted at `Crafting Systems`. Neither is
            nested under the other.
          -->
          {#if isWorldRoute || isWorldDowntimeRoute || isWorldRulesRoute || isWorldTravelRoute || isWorldScopedRoute}
            <!--
              `World.Heading` is the RAIL's micro-label and is authored in caps for the
              letter-spaced treatment there. A breadcrumb carries no `text-transform`, so
              reusing it printed a literal "WORLD" mid-trail; this crumb has its own
              Title Case key and the rail keeps its shout.

              A BUTTON WHEREVER IT IS NOT THE LEAF, which is the same rule every other crumb in
              this trail follows: an intermediate crumb navigates and the last one does not. On
              World > Parties it IS the leaf and stays a span.
            -->
            {#if isWorldRoute}
              <span data-breadcrumb-world
                >{text('FABRICATE.Admin.Manager.World.Breadcrumb', 'World')}</span
              >
            {:else}
              <button type="button" data-breadcrumb-world onclick={() => openWorldParties()}
                >{text('FABRICATE.Admin.Manager.World.Breadcrumb', 'World')}</button
              >
            {/if}
            {#if isWorldScopedRoute}
              <!--
                A CATALOGUE IS TWO CRUMBS AND AN ENTRY IS THREE, which is the prototype's own
                `crumbFor` shape: a catalogue is `World > <screen>` because it IS a world screen
                rather than a destination inside a group, and an entry is
                `World > <catalogue> > <entity>` with the catalogue crumb CLICKABLE.

                The middle crumb is not decoration. An entry editor is released to full width
                and therefore renders no inspector, so this crumb is the only affordance that
                takes the GM back to the list they came from — the same "a button wherever it is
                not the leaf" rule the World crumb above follows.
              -->
              <i class="fas fa-chevron-right" aria-hidden="true"></i>
              {#if worldScopedEntryRoute}
                <button
                  type="button"
                  data-breadcrumb-world-scoped-catalogue={worldScopedEntryRoute.catalogueView}
                  onclick={() => setView(worldScopedEntryRoute.catalogueView)}
                  >{text(
                    worldScopedEntryRoute.catalogueTitleKey,
                    worldScopedEntryRoute.catalogueTitleFallback
                  )}</button
                >
                <i class="fas fa-chevron-right" aria-hidden="true"></i>
                <!-- The entity's OWN name when the corpus can supply one, falling back to the
                     screen's title: an entry route with no subject chosen yet, or a subject the
                     corpus no longer holds, has nothing to name and must not print an empty
                     crumb. -->
                <span data-breadcrumb-world-scoped={currentView} title={worldScopedEntryCrumb}
                  >{worldScopedEntryCrumb || viewTitle()}</span
                >
              {:else}
                <span data-breadcrumb-world-scoped={currentView}>{viewTitle()}</span>
              {/if}
            {/if}
            {#if isWorldRulesRoute}
              <i class="fas fa-chevron-right" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.World.RulesNav', 'Rules & Resources')}</span>
              <i class="fas fa-chevron-right" aria-hidden="true"></i>
              <span data-breadcrumb-world-rules-tab={worldRulesTab}>{worldRulesPageTitle}</span>
            {/if}
            {#if isWorldTravelRoute}
              <i class="fas fa-chevron-right" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.World.TravelNav', 'Travel')}</span>
              <i class="fas fa-chevron-right" aria-hidden="true"></i>
              <span data-breadcrumb-world-travel-tab={worldTravelTab}
                >{worldTravelTab === 'map'
                  ? text('FABRICATE.Admin.Manager.Travel.Tabs.MapLinks', 'Map Region Links')
                  : text('FABRICATE.Admin.Manager.Travel.Tabs.Realms', 'Realms')}</span
              >
            {/if}
            {#if isWorldDowntimeRoute}
              <i class="fas fa-chevron-right" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.World.Downtime.Title', 'Downtime')}</span>
              <i class="fas fa-chevron-right" aria-hidden="true"></i>
              <!--
                THE TAB CRUMB NAMES THE TAB, so it belongs to whoever owns the tab. The crumb
                above it names the Downtime ROUTE, which Core owns in the rail too.

                IT IS THE TAB'S REGISTERED BREADCRUMB AND NEVER THE RUNTIME ONE (issue 1322).
                A companion whose tab is a list drilling into a detail publishes the detail's
                name at runtime, and that used to REPLACE this crumb rather than extend it: a
                GM inside a faction read `World > Downtime > Emberwatch`, with the tab they
                were in missing from its own trail and nothing between Downtime and the leaf.
                So this crumb reads past the runtime layer to the registration underneath,
                which is what makes the trail grow by one instead of changing its last word.

                AND IT IS A BUTTON, because a crumb that names a screen the GM can go back to
                should take them there. Core cannot do that itself — the drill-down is inside
                the companion's own target, and Core neither knows the level nor could restore
                it — so this is the same re-activation the rail already offers when the GM
                clicks the sub-item for the tab they are on, through the same channel. A
                companion that registered no handler gets Core's own behaviour, which is
                nothing, and the crumb is a span for that case rather than a button that does
                nothing when pressed.
              -->
              {#if downtimeTabCrumbNavigable}
                <button
                  type="button"
                  data-breadcrumb-downtime-tab={worldDowntimeTabId}
                  onclick={() => downtimeChromeChannel.reselect()}>{downtimeTabCrumb}</button
                >
              {:else}
                <span data-breadcrumb-downtime-tab={worldDowntimeTabId}>{downtimeTabCrumb}</span>
              {/if}
              <!--
                AND THE COMPANION'S OWN LEAF UNDER IT, when there is one and it says something
                the tab crumb does not. A screen that restates the tab's own breadcrumb — which
                is what the Tracking board does — must not draw the same word twice.
              -->
              {#if downtimeLeafCrumb}
                <i class="fas fa-chevron-right" aria-hidden="true"></i>
                <span data-breadcrumb-downtime-leaf>{downtimeLeafCrumb}</span>
              {/if}
            {/if}
          {:else}
            <button type="button" onclick={() => selectSystemAndShowBrowser()}
              >{text('FABRICATE.Admin.Manager.Nav.Systems', 'Crafting Systems')}</button
            >
            {#if selectedSystem && currentView !== 'systems'}
              <i class="fas fa-chevron-right" aria-hidden="true"></i>
              <button type="button" onclick={() => editSystem(selectedSystem.id)}
                >{selectedSystem.name}</button
              >
            {/if}
          {/if}
          {#if currentView === 'recipes'}
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <button type="button" onclick={() => openCraftingSection('recipes')}
              >{text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting')}</button
            >
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.Nav.Recipes', 'Recipes')}</span>
          {/if}
          {#if currentView === 'crafting-settings'}
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <button type="button" onclick={() => openCraftingSection('recipes')}
              >{text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting')}</button
            >
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.Crafting.CraftingTabs.Settings', 'Settings')}</span
            >
          {/if}
          {#if currentView === 'access'}
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <button type="button" onclick={() => openCraftingSection('recipes')}
              >{text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting')}</button
            >
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.Nav.Access', 'Access')}</span>
          {/if}
          {#if currentView === 'books-scrolls'}
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <button type="button" onclick={() => openCraftingSection('recipes')}
              >{text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting')}</button
            >
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.Nav.BooksScrolls', 'Books & Scrolls')}</span>
          {/if}
          {#if currentView === 'knowledge'}
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <button type="button" onclick={() => openCraftingSection('recipes')}
              >{text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting')}</button
            >
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.Nav.Knowledge', 'Knowledge')}</span>
          {/if}
          {#if currentView === 'recipe-item-edit'}
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <button type="button" onclick={() => openCraftingSection('recipes')}
              >{text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting')}</button
            >
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <button type="button" onclick={backToBooksScrolls}
              >{text('FABRICATE.Admin.Manager.Nav.BooksScrolls', 'Books & Scrolls')}</button
            >
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <!-- Name the item, not the generic "Edit recipe item" — the same rule the recipe
               and component breadcrumbs already follow. -->
            <span title={recipeItemCrumb}>{recipeItemCrumb}</span>
          {/if}
          {#if currentView === 'components'}
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.Nav.ComponentRules', 'Component Rules')}</span>
          {/if}
          {#if currentView === 'tags'}
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.Nav.TagsCategories', 'Tags & Categories')}</span>
          {/if}
          {#if currentView === 'essences'}
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.Nav.EssenceRules', 'Essence Rules')}</span>
          {/if}
          {#if currentView === 'essence-edit'}
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <button type="button" onclick={backToEssencesBrowse}
              >{text('FABRICATE.Admin.Manager.Nav.EssenceRules', 'Essence Rules')}</button
            >
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <span
              >{isCreatingEssenceDraft
                ? text('FABRICATE.Admin.Manager.Essence.CreateBreadcrumb', 'Create essence')
                : text('FABRICATE.Admin.Manager.Essence.EditBreadcrumb', 'Edit essence')}</span
            >
          {/if}
          {#if currentView === 'recipe-edit'}
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <button type="button" onclick={() => openCraftingSection('recipes')}
              >{text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting')}</button
            >
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <button type="button" onclick={backToRecipesBrowse}
              >{text('FABRICATE.Admin.Manager.Nav.Recipes', 'Recipes')}</button
            >
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <!-- Name the recipe (§F5), not the generic "Edit recipe". -->
            <span
              >{recipeDraft?.name ||
                text('FABRICATE.Admin.Manager.Recipe.EditBreadcrumb', 'Edit recipe')}</span
            >
          {/if}
          {#if currentView === 'component-edit'}
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <button type="button" onclick={backToComponentsBrowse}
              >{text('FABRICATE.Admin.Manager.Nav.ComponentRules', 'Component Rules')}</button
            >
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <!-- Name the component, not the generic "Edit component" — the same rule the
               recipe breadcrumb follows. -->
            <span
              >{componentForEdit?.name ||
                text('FABRICATE.Admin.Manager.Component.EditBreadcrumb', 'Edit component')}</span
            >
          {/if}
          {#if currentView === 'environments'}
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <!-- THE GROUP, THEN THE SCREEN. Gathering is four screens under one name, so a trail
               that stopped at the group read identically on all four. Checks already names its
               own sub-tab; this is that rule applied to the other group that has one.

               A SPAN HERE AND A BUTTON IN THE EDITORS BELOW, which is one rule rather than two:
               a crumb is a control when pressing it goes somewhere the GM is not. From the
               library, `Gathering` names the screen already on the screen — `backToEnvironmentsBrowse`
               returns to this route and leaves the active tab where it is, so a button would sit
               there doing nothing. From an editor it really does leave, so there it is a control.
               Same rule the Downtime tab crumb follows. -->
            <span>{text('FABRICATE.Admin.Manager.Nav.Environments', 'Gathering')}</span>
            {#if gatheringTabLabel}
              <i class="fas fa-chevron-right" aria-hidden="true"></i>
              <span data-breadcrumb-gathering-tab={activeGatheringTab}>{gatheringTabLabel}</span>
            {/if}
          {/if}
          {#if currentView === 'environment-edit'}
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <button type="button" onclick={backToEnvironmentsBrowse}
              >{text('FABRICATE.Admin.Manager.Nav.Environments', 'Gathering')}</button
            >
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <button type="button" onclick={backToEnvironmentsBrowse}
              >{text(
                'FABRICATE.Admin.Manager.Environment.GatheringTabs.Environments',
                'Environments'
              )}</button
            >
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <span title={environmentCrumb}>{environmentCrumb}</span>
          {/if}
          {#if currentView === 'gathering-task-edit'}
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <!-- THE GROUP IS NOT SKIPPED. `Tasks` is a screen INSIDE Gathering, so a trail that
               jumped from the system straight to it described a path that does not exist. -->
            <button type="button" onclick={backToEnvironmentsBrowse}
              >{text('FABRICATE.Admin.Manager.Nav.Environments', 'Gathering')}</button
            >
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <button type="button" onclick={backToGatheringTaskLibrary}
              >{text('FABRICATE.Admin.Manager.Environment.GatheringTabs.Tasks', 'Tasks')}</button
            >
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <span title={gatheringTaskCrumb}>{gatheringTaskCrumb}</span>
          {/if}
          {#if currentView === 'gathering-event-edit'}
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <button type="button" onclick={backToEnvironmentsBrowse}
              >{text('FABRICATE.Admin.Manager.Nav.Environments', 'Gathering')}</button
            >
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <button type="button" onclick={backToGatheringEventLibrary}
              >{text(
                'FABRICATE.Admin.Manager.Environment.GatheringTabs.Encounters',
                'Events'
              )}</button
            >
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <span title={gatheringEventCrumb}>{gatheringEventCrumb}</span>
          {/if}
          {#if isChecksRoute}
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.Nav.Checks', 'Checks')}</span>
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <span
              >{text(
                `FABRICATE.Admin.Manager.Checks.Tabs.${checksActiveTab[0].toUpperCase()}${checksActiveTab.slice(1)}`,
                checksActiveTab
              )}</span
            >
          {/if}
          {#if currentView === 'system-edit'}
            <i class="fas fa-chevron-right" aria-hidden="true"></i>
            <span
              >{text('FABRICATE.Admin.Manager.SystemEdit.PageBreadcrumb', 'System Overview')}</span
            >
          {/if}
        </nav>
        {#if currentView === 'recipe-edit' && recipeDraft}
          <!-- The recipe editor's identity header: the recipe's real image (never a
             glyph-only avatar — a recipe HAS an img), its name, and the
             "<category> · <resolution mode>" subline. -->
          <div class="manager-recipe-edit-heading" data-recipe-edit-heading>
            <Medallion src={resolveRecipeImage(recipeDraft)} icon="fas fa-scroll" size={44} />
            <div class="manager-recipe-edit-heading-copy">
              <h1 class="manager-title" title={recipeDraft.name || ''}>
                {recipeDraft.name || viewTitle()}
              </h1>
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
              <h1 class="manager-title" title={componentForEdit.name || ''}>
                {componentForEdit.name || viewTitle()}
              </h1>
              <p class="manager-subtitle" data-component-edit-subline>{viewSubtitle()}</p>
            </div>
          </div>
        {:else if isWorldDowntimeRoute && downtimeHeaderArtwork}
          <!-- A companion's drill-down identity, rendered in CORE'S header rather than inside
             the companion's panel. It reuses the recipe editor's heading block wholesale —
             same classes, same `Medallion`, same 44px — because the point is that a
             companion's editor is indistinguishable from one of Fabricate's own, and a
             parallel block would be a second implementation of the identity header that
             agreed with the first only until one of them changed.

             `image` and `icon` are validated as mutually exclusive, so `Medallion` never has
             to choose: with `image` set it renders the picture, and with only `icon` set `src`
             is empty and it falls back to the glyph. The default glyph is the Downtime
             route's own, so a companion that names neither still cannot reach this branch. -->
          <div class="manager-recipe-edit-heading" data-downtime-chrome-heading>
            <Medallion
              src={downtimeHeaderArtwork.image ?? ''}
              icon={downtimeHeaderArtwork.icon ?? 'fas fa-hourglass-half'}
              size={44}
            />
            <div class="manager-recipe-edit-heading-copy">
              <h1 class="manager-title" title={viewTitle()}>{viewTitle()}</h1>
              <p class="manager-subtitle" data-downtime-chrome-subline>{viewSubtitle()}</p>
            </div>
          </div>
        {:else if currentView !== 'tool-edit'}
          <h1 class="manager-title">{viewTitle()}</h1>
          <p class="manager-subtitle">{viewSubtitle()}</p>
        {/if}
        {#if currentView === 'environment-edit' && environmentDraftForDisplay}
          <div class="manager-environment-header-pills" data-environment-status-pills>
            <Chip
              tone={environmentDraftForDisplay.enabled === false ? 'neutral' : 'active'}
              data-status-pill="active"
            >
              {environmentDraftForDisplay.enabled === false
                ? text('FABRICATE.Admin.Manager.StatusOff', 'Off')
                : text('FABRICATE.Admin.Manager.StatusOn', 'On')}
            </Chip>
            <Chip tone="info" data-status-pill="selection">
              {environmentDraftForDisplay.selectionMode === 'blind'
                ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Blind', 'Blind')
                : text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Targeted', 'Targeted')}
            </Chip>
            <Chip tone="info" data-status-pill="composition">
              {environmentDraftForDisplay.compositionMode === 'manual'
                ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Manual', 'Manual')
                : text(
                    'FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Automatic',
                    'Automatic'
                  )}
            </Chip>
          </div>
        {/if}
      </div>
      <!--
        World > Currency renders NO page-header actions (issue 1278). Its own two actions, Add
        currency unit and Seed presets, live on the card header where they always did and where
        the read-only provider gating that hides them is computed. Without this exclusion the
        route falls through to the final `{:else}` below and offers Import / Export / Create —
        which act on CRAFTING SYSTEMS, so "Create" on the currency page would create a crafting
        system and "Export" would sit disabled against a selected-system id the route does not
        even have.
      -->
      <!--
        The world scoped-entity routes join that exclusion (issue 1362), for the identical
        reason and with the identical consequence: they have no selected crafting system by
        design, so the fallthrough's Create would create a crafting system and its Export would
        sit permanently disabled against an id the route does not have. Each screen's own
        actions belong on the surface that owns them, which PRs 6a-c and 7 build.
      -->
      {#if currentView !== 'tools' && currentView !== 'tool-edit' && !isWorldRulesRoute && !isWorldScopedRoute}
        <div class="manager-header-actions" aria-label={headerActionsLabel()}>
          {#if currentView === 'world-downtime'}
            {#if downtimeCoreFallback}
              <!--
                The design puts this promotional pill at the top of every Downtime screen, in
                ADDITION to the hero's Patreon CTA. It is inert in the mockup — a fixed canvas
                has nowhere to go — but a shipped control labelled "Unlock with Premium" that
                does nothing is dead UI, so it carries the same subscription link as the hero.
                It stays Core's own markup rather than a public action descriptor: its premium
                treatment is Core copy about Core's product, not a shape to ask a companion for.
              -->
              <ManagerButton
                tag="a"
                class="manager-downtime-unlock"
                data-downtime-unlock
                href={PATREON_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <i class="fas fa-crown" aria-hidden="true"></i>
                <span
                  >{text(
                    'FABRICATE.Admin.Manager.World.Downtime.Unlock',
                    'Unlock with Premium'
                  )}</span
                >
              </ManagerButton>
            {:else}
              <!--
                The status chip leads the group, exactly where every Core editor puts its own
                "Unsaved" chip, and renders through the SAME `Chip` primitive with the same
                `truncate` — a companion's staged-changes indicator has to be the manager's
                one chip, not a lookalike. Its text is already localized: Core renders the
                strings a companion gives it, as it does for `title` and `subtitle`.
              -->
              {#if downtimeHeaderStatus}
                <Chip
                  tone={downtimeHeaderStatus.tone}
                  truncate
                  density="action"
                  data-downtime-chrome-status
                  title={downtimeHeaderStatus.tooltip ?? downtimeHeaderStatus.label}
                  >{downtimeHeaderStatus.label}</Chip
                >
              {/if}
              {#each downtimeHeaderActions as action (action.id)}
                {#if action.href}
                  <a
                    class={managerHeaderActionClass(action)}
                    data-manager-header-action={action.id}
                    href={action.href}
                    title={action.tooltip}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {#if action.icon}<i class={action.icon} aria-hidden="true"></i>{/if}
                    <span>{action.label}</span>
                  </a>
                {:else}
                  <button
                    type="button"
                    class={managerHeaderActionClass(action)}
                    data-manager-header-action={action.id}
                    title={action.tooltip}
                    disabled={action.disabled === true}
                    onclick={() => runDowntimeHeaderAction(action)}
                  >
                    {#if action.icon}<i class={action.icon} aria-hidden="true"></i>{/if}
                    <span>{action.label}</span>
                  </button>
                {/if}
              {/each}
            {/if}
          {:else if currentView === 'recipes'}
            <ManagerButton role="primary" onclick={createRecipe} disabled={!selectedSystemId}>
              <i class="fas fa-plus" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.Recipe.Create', 'Create recipe')}</span>
            </ManagerButton>
          {:else if currentView === 'recipe-edit'}
            {#if recipeEditDirty}
              <Chip
                tone="warning"
                truncate
                density="action"
                title={text('FABRICATE.Admin.Manager.Recipe.Dirty', 'Unsaved')}
                >{text('FABRICATE.Admin.Manager.Recipe.Dirty', 'Unsaved')}</Chip
              >
            {/if}
            <ManagerButton role="ghost" onclick={backToRecipesBrowse} disabled={recipeEditSaving}>
              <i class="fas fa-arrow-left" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.Recipe.BackToBrowse', 'Back to recipes')}</span>
            </ManagerButton>
            <ManagerButton
              role="danger"
              onclick={deleteRecipeFromEdit}
              disabled={!selectedRecipeId || recipeEditSaving}
              title={text('FABRICATE.Admin.Manager.Recipe.Delete', 'Delete recipe')}
            >
              <i class="fas fa-trash" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.Recipe.Delete', 'Delete recipe')}</span>
            </ManagerButton>
            <ManagerButton role="primary" onclick={saveRecipeDraft} disabled={!canSaveRecipeEdit}>
              <i
                class={recipeEditSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'}
                aria-hidden="true"
              ></i>
              <span>{recipeEditSaveLabel()}</span>
            </ManagerButton>
          {:else if currentView === 'recipe-item-edit'}
            {#if recipeItemEditDirty}
              <Chip
                tone="warning"
                truncate
                density="action"
                data-recipe-item-dirty
                title={text('FABRICATE.Admin.Manager.RecipeItem.Dirty', 'Unsaved')}
                >{text('FABRICATE.Admin.Manager.RecipeItem.Dirty', 'Unsaved')}</Chip
              >
            {/if}
            <ManagerButton
              role="ghost"
              data-recipe-item-back
              onclick={backToBooksScrolls}
              disabled={recipeItemEditSaving}
            >
              <i class="fas fa-arrow-left" aria-hidden="true"></i>
              <span
                >{text(
                  'FABRICATE.Admin.Manager.RecipeItem.BackToBrowse',
                  'Back to Books & Scrolls'
                )}</span
              >
            </ManagerButton>
            <ManagerButton
              role="danger"
              data-recipe-item-delete
              onclick={deleteRecipeItemFromEdit}
              disabled={!recipeItemDraft?.id || recipeItemEditSaving}
              title={text('FABRICATE.Admin.Manager.RecipeItem.Delete', 'Delete recipe item')}
            >
              <i class="fas fa-trash" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.RecipeItem.Delete', 'Delete recipe item')}</span>
            </ManagerButton>
            <ManagerButton
              role="primary"
              data-recipe-item-save
              onclick={saveRecipeItemDraft}
              disabled={!canSaveRecipeItemEdit}
            >
              <i
                class={recipeItemEditSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'}
                aria-hidden="true"
              ></i>
              <span>{text('FABRICATE.Admin.Manager.RecipeItem.Save', 'Save recipe item')}</span>
            </ManagerButton>
            <!--
          An attempted-and-failed save is announced beside the control the GM just clicked
          (issue 919). It trails the Save button so the wrapping toolbar drops it onto its
          own line instead of shoving the "Unsaved" chip out of the row.
        -->
            {#if recipeItemSaveFailed}
              <p class="manager-header-save-error" role="alert" data-recipe-item-save-error>
                {text('FABRICATE.Admin.Manager.RecipeItem.SaveFailed', 'Save failed. Try again.')}
              </p>
            {/if}
          {:else if currentView === 'components'}
            <!-- no header actions for the components list -->
          {:else if currentView === 'knowledge'}
            <!-- The Knowledge surface's only actions are per-character: they live in the
             detail-pane header, next to the character they act on. -->
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
          {:else if isChecksRoute}
            {#if checksDirty}
              <Chip tone="warning" density="action"
                >{text('FABRICATE.Admin.Manager.Checks.Dirty', 'Unsaved')}</Chip
              >
            {/if}
            <ManagerButton
              role="primary"
              data-checks-save
              onclick={saveChecks}
              disabled={!checksDirty || checksSaving}
            >
              <i class={checksSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"
              ></i>
              <span>{text('FABRICATE.Admin.Manager.Checks.Save', 'Save checks')}</span>
            </ManagerButton>
          {:else if currentView === 'essences'}
            <ManagerButton role="primary" onclick={createEssenceDraft}>
              <i class="fas fa-plus" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.Essence.Create', 'Create essence')}</span>
            </ManagerButton>
          {:else if currentView === 'essence-edit'}
            <!-- The SHARED editor header (issue 1036), wearing this studio's own three data
                 hooks. Its own note said "extract when a second studio wants it"; this is
                 that studio, and the extraction is a parameterization rather than a fork.
                 For the control inventory the shipped sibling wins over the prototype —
                 Back rather than Cancel, and a dirty-only chip rather than a persistent
                 "All changes saved" indicator — because seven editors share it. -->
            <ComponentEditorHeader
              dirty={essenceEditDirty}
              saving={essenceEditSaving}
              canSave={canSaveEssenceEdit}
              formId="manager-essence-edit-form"
              dirtyAttr="data-essence-edit-dirty"
              backAttr="data-essence-edit-back"
              saveAttr="data-essence-edit-save"
              dirtyLabel={text('FABRICATE.Admin.Manager.Essence.Dirty', 'Unsaved')}
              backLabel={text('FABRICATE.Admin.Manager.Essence.Back', 'Back')}
              saveLabel={essenceEditSaveLabel()}
              onBack={cancelEssenceEdit}
            />
          {:else if currentView === 'environments' && displayedGatheringTab === 'tasks'}
            <ManagerButton
              role="primary"
              onclick={() => createGatheringTask(selectedSystemId)}
              disabled={!canShowEnvironments}
            >
              <i class="fas fa-plus" aria-hidden="true"></i>
              <span
                >{text(
                  'FABRICATE.Admin.Manager.Environment.Tasks.Create',
                  'Create gathering task'
                )}</span
              >
            </ManagerButton>
          {:else if currentView === 'environments' && displayedGatheringTab === 'encounters'}
            <ManagerButton
              role="primary"
              onclick={() => createGatheringEvent(selectedSystemId)}
              disabled={!canShowEnvironments}
            >
              <i class="fas fa-plus" aria-hidden="true"></i>
              <span
                >{text(
                  'FABRICATE.Admin.Manager.Environment.Events.Create',
                  'Create gathering event'
                )}</span
              >
            </ManagerButton>
          {:else if currentView === 'world'}
            <ManagerButton
              role="primary"
              onclick={() => store.createParty?.()}
              disabled={$viewState.travelSaving}
            >
              <i class="fas fa-plus" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.World.Parties.CreateAction', 'New party')}</span>
            </ManagerButton>
          {:else if isWorldTravelRoute && worldTravelTab === 'realms'}
            <ManagerButton
              role="primary"
              onclick={async () => {
                const created = await store.createRealmQuick?.(
                  text('FABRICATE.Admin.Manager.Travel.DefaultRealmName', 'New realm')
                );
                if (typeof created === 'string' && created) selectedTravelRealmId = created;
              }}
              disabled={$viewState.travelSaving}
            >
              <i class="fas fa-plus" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.Travel.CreateRealm', 'Create realm')}</span>
            </ManagerButton>
          {:else if isWorldTravelRoute}
            <!-- Map Region Links has no create action: a Scene Region is authored in Foundry. -->
          {:else if currentView === 'environments'}
            <ManagerButton
              role="primary"
              onclick={createEnvironment}
              disabled={!canShowEnvironments}
            >
              <i class="fas fa-plus" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.Environment.Create', 'Create environment')}</span
              >
            </ManagerButton>
          {:else if currentView === 'environment-edit'}
            {#if $viewState.environmentDraftDirty}
              <Chip tone="warning" density="action"
                >{text('FABRICATE.Admin.Manager.Environment.Dirty', 'Unsaved')}</Chip
              >
            {/if}
            <ManagerButton
              role="ghost"
              data-environment-edit-back
              onclick={backToEnvironmentsBrowse}
              disabled={$viewState.environmentSaving}
            >
              <i class="fas fa-arrow-left" aria-hidden="true"></i>
              <span
                >{text(
                  'FABRICATE.Admin.Manager.Environment.BackToBrowse',
                  'Back to environments'
                )}</span
              >
            </ManagerButton>
            <ManagerButton
              role="danger"
              data-action="delete-environment"
              onclick={() => store.deleteEnvironmentDraft?.()}
              disabled={$viewState.environmentDraftIsNew || $viewState.environmentSaving}
            >
              <i class="fas fa-trash" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.Environment.Delete', 'Delete environment')}</span
              >
            </ManagerButton>
            <ManagerButton
              role="primary"
              onclick={saveEnvironmentEdit}
              disabled={!$viewState.environmentDraftDirty || $viewState.environmentSaving}
            >
              <i
                class={$viewState.environmentSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'}
                aria-hidden="true"
              ></i>
              <span>{text('FABRICATE.Admin.Environments.Save', 'Save')}</span>
            </ManagerButton>
          {:else if currentView === 'gathering-task-edit'}
            {#if gatheringTaskDraftDirty}
              <Chip tone="warning" density="action"
                >{text('FABRICATE.Admin.Manager.Environment.Tasks.Dirty', 'Unsaved')}</Chip
              >
            {/if}
            <ManagerButton
              role="ghost"
              data-gathering-task-back
              onclick={backToGatheringTaskLibrary}
            >
              <i class="fas fa-arrow-left" aria-hidden="true"></i>
              <span
                >{text(
                  'FABRICATE.Admin.Manager.Environment.Tasks.BackToLibrary',
                  'Back to task library'
                )}</span
              >
            </ManagerButton>
            <ManagerButton
              role="danger"
              data-gathering-task-delete
              onclick={deleteGatheringTaskDraft}
              disabled={!selectedGatheringTaskId || gatheringTaskSaving}
              title={text(
                'FABRICATE.Admin.Manager.Environment.Tasks.Delete',
                'Delete gathering task'
              )}
            >
              <i class="fas fa-trash" aria-hidden="true"></i>
              <span
                >{text(
                  'FABRICATE.Admin.Manager.Environment.Tasks.Delete',
                  'Delete gathering task'
                )}</span
              >
            </ManagerButton>
            <ManagerButton
              role="primary"
              onclick={saveGatheringTaskDraft}
              disabled={!gatheringTaskDraftDirty ||
                !gatheringTaskValidation.valid ||
                gatheringTaskSaving}
              title={gatheringTaskValidation.valid ? '' : gatheringTaskValidation.errors.join('\n')}
            >
              <i
                class={gatheringTaskSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'}
                aria-hidden="true"
              ></i>
              <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.Save', 'Save task')}</span>
            </ManagerButton>
            <!-- See the recipe-item branch above: same failed-save alert, same placement (issue 919). -->
            {#if gatheringTaskSaveError}
              <p class="manager-header-save-error" role="alert" data-gathering-task-save-error>
                {gatheringTaskSaveError}
              </p>
            {/if}
          {:else if currentView === 'gathering-event-edit'}
            {#if gatheringEventDraftDirty}
              <Chip tone="warning" density="action"
                >{text('FABRICATE.Admin.Manager.Environment.Events.Dirty', 'Unsaved')}</Chip
              >
            {/if}
            <ManagerButton
              role="ghost"
              data-gathering-event-back
              onclick={backToGatheringEventLibrary}
            >
              <i class="fas fa-arrow-left" aria-hidden="true"></i>
              <span
                >{text(
                  'FABRICATE.Admin.Manager.Environment.Events.BackToLibrary',
                  'Back to event library'
                )}</span
              >
            </ManagerButton>
            <ManagerButton
              role="danger"
              onclick={deleteGatheringEventDraft}
              disabled={!selectedGatheringEventId || gatheringEventSaving}
              title={text('FABRICATE.Admin.Manager.Environment.Events.Delete', 'Delete event')}
            >
              <i class="fas fa-trash" aria-hidden="true"></i>
              <span
                >{text('FABRICATE.Admin.Manager.Environment.Events.Delete', 'Delete event')}</span
              >
            </ManagerButton>
            <ManagerButton
              role="primary"
              onclick={saveGatheringEventDraft}
              disabled={!gatheringEventDraftDirty ||
                !gatheringEventValidation.valid ||
                gatheringEventSaving}
              title={gatheringEventValidation.valid
                ? ''
                : gatheringEventValidation.errors.join('\n')}
            >
              <i
                class={gatheringEventSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'}
                aria-hidden="true"
              ></i>
              <span>{text('FABRICATE.Admin.Manager.Environment.Events.Save', 'Save event')}</span>
            </ManagerButton>
            <!-- See the recipe-item branch above: same failed-save alert, same placement (issue 919). -->
            {#if gatheringEventSaveError}
              <p class="manager-header-save-error" role="alert" data-gathering-event-save-error>
                {gatheringEventSaveError}
              </p>
            {/if}
          {:else if currentView === 'system-edit'}
            <!--
              `ghost` here rests on the VERB, not on a neighbour. Every other Back in this
              container is a peer of a Save that outranks it, and is painted `ghost` for that
              reason: the `recipe-edit` branch above, `ComponentEditorHeader` (which renders
              its own Back into THIS div, for `component-edit` and `essence-edit`), and
              `ToolEditView`, the maintainer's authority for what a manager button looks
              like. The system editor has no Save to sit beside — it saves per field — so
              Back is the lone action on this route. It is still the same verb, and a Back
              that is neutral here and ghost on every other route is the drift this sweep
              exists to end.
            -->
            <ManagerButton role="ghost" data-system-edit-back onclick={backToSystemsBrowser}>
              <i class="fas fa-arrow-left" aria-hidden="true"></i>
              <span
                >{text('FABRICATE.Admin.Manager.SystemEdit.BackToSystems', 'Back to systems')}</span
              >
            </ManagerButton>
          {:else}
            <!-- data-manager-import-system: a zero-behaviour hook. The only other handle on
                 this button is `manager-button`, which a dozen header controls share, so a
                 screenshot case could not name it without matching whichever came first. -->
            <ManagerButton data-manager-import-system onclick={importSystem}>
              <i class="fas fa-file-import" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.Import', 'Import')}</span>
            </ManagerButton>
            <ManagerButton onclick={() => exportSystem()} disabled={!selectedSystemId}>
              <i class="fas fa-file-export" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.Export', 'Export')}</span>
            </ManagerButton>
            <ManagerButton role="primary" onclick={createSystem}>
              <i class="fas fa-plus" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.Create', 'Create')}</span>
            </ManagerButton>
          {/if}
        </div>
      {/if}
    </header>
  {/if}

  {#if currentView === 'tools' && selectedSystem}
    <header class="manager-header manager-tools-context-header" data-tool-library-context>
      <div class="manager-heading">
        <nav
          class="manager-breadcrumbs"
          aria-label={text('FABRICATE.Admin.Manager.Breadcrumbs', 'Breadcrumbs')}
        >
          <!-- THE ROOT, WHICH THIS TRAIL ALONE WAS MISSING (issue 1328). The Tool LIBRARY has its
             own header rather than sharing the root nav above, and it began at the system name —
             so of the two Tool screens, the EDITOR carried `Crafting Systems` and the library did
             not. Two screens one press apart disagreed about how deep they were. -->
          <button type="button" onclick={() => selectSystemAndShowBrowser()}
            >{text('FABRICATE.Admin.Manager.Nav.Systems', 'Crafting Systems')}</button
          >
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={() => editSystem(selectedSystem.id)}
            >{selectedSystem.name}</button
          >
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={() => openCraftingSection('recipes')}
            >{text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting')}</button
          >
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Nav.ToolRules', 'Tool Rules')}</span>
        </nav>
        <h1 class="manager-title">
          {text('FABRICATE.Admin.Manager.Tools.LibraryTitle', 'Tool Studio')}
        </h1>
        <p class="manager-subtitle">
          {text(
            'FABRICATE.Admin.Manager.Tools.LibrarySubtitle',
            'Tools that recipes can require — from hand-held gear to fixed stations and places of power. Set how they break and who may wield them.'
          )}
        </p>
      </div>
    </header>
  {/if}

  <div class={`manager-body ${railCollapsedDisplay ? 'is-rail-collapsed' : ''}`}>
    <aside
      class="manager-rail"
      aria-label={text('FABRICATE.Admin.Manager.Navigation', 'Crafting manager navigation')}
    >
      <!--
        Name the workspace before its scope controls. Every manager route, including
        the Tool library/editor, shares this one rail branch.
      -->
      <p class="manager-rail-title" data-manager-rail-section>
        {text('FABRICATE.Admin.Manager.Nav.SectionLabel', 'GM management')}
      </p>

      <!--
        The rail's crafting-system card. The kicker names what the card CONTAINS
        ("Crafting system"), not the product — the product name is already on the
        titlebar. The card is a real `<select>`, so the rail can switch system without
        a round trip through the system library, and a back link out to that library.
        The "GM management workspace" caption that used to hang below it is gone: the
        rail's section label already names the workspace above this card.
      -->
      <section
        class="manager-rail-block"
        aria-label={text('FABRICATE.Admin.Manager.ManagerScope', 'Manager scope')}
      >
        {#if selectedSystem}
          <div class="manager-scope-card">
            <div class="manager-scope-card-head">
              <p class="manager-kicker">
                {text('FABRICATE.Admin.Manager.CraftingSystem', 'Crafting system')}
              </p>
              <button
                type="button"
                class="manager-rail-toggle manager-scope-collapse"
                data-manager-rail-toggle
                aria-pressed={railCollapsedDisplay}
                aria-label={railToggleLabel}
                title={railToggleTitle}
                disabled={railLockedOpen}
                aria-disabled={railLockedOpen}
                onclick={toggleManagerRail}
              >
                <i class={railToggleIcon} aria-hidden="true"></i>
              </button>
            </div>
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
              aria-label={text(
                'FABRICATE.Admin.Manager.ReturnToSystemLibrary',
                'Return to System Library'
              )}
              title={text(
                'FABRICATE.Admin.Manager.ReturnToSystemLibrary',
                'Return to System Library'
              )}
              onclick={backToSystemsBrowser}
            >
              <i class="fas fa-arrow-left-long" aria-hidden="true"></i>
              <span
                >{text('FABRICATE.Admin.Manager.AllCraftingSystems', 'All crafting systems')}</span
              >
            </button>
          </div>
        {:else}
          <div class="manager-scope-card">
            <div class="manager-scope-card-head">
              <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Product', 'Fabricate')}</p>
              <button
                type="button"
                class="manager-rail-toggle manager-scope-collapse"
                data-manager-rail-toggle
                aria-pressed={railCollapsedDisplay}
                aria-label={railToggleLabel}
                title={railToggleTitle}
                disabled={railLockedOpen}
                aria-disabled={railLockedOpen}
                onclick={toggleManagerRail}
              >
                <i class={railToggleIcon} aria-hidden="true"></i>
              </button>
            </div>
            <h2 class="manager-title">
              {text('FABRICATE.Admin.Manager.Nav.Systems', 'Crafting Systems')}
            </h2>
          </div>
        {/if}
      </section>

      <nav
        class="manager-nav"
        aria-label={text('FABRICATE.Admin.Manager.ManagerSections', 'Manager sections')}
      >
        {#if selectedSystem}
          <button
            type="button"
            class={`manager-nav-button ${currentView === 'system-edit' ? 'is-active' : ''}`}
            id="manager-nav-system-overview"
            aria-current={currentView === 'system-edit' ? 'page' : undefined}
            data-nav-system-edit
            onclick={() => editSystem(selectedSystem.id)}
          >
            <i class="fas fa-clipboard-check" aria-hidden="true"></i>
            <span class="manager-nav-label"
              >{text('FABRICATE.Admin.Manager.SystemEdit.Nav', 'System Overview')}</span
            >
            {#if systemOverviewCount > 0}
              <span
                class="manager-nav-count"
                aria-label={text(
                  'FABRICATE.Admin.Manager.SystemOverview.CountBadgeAria',
                  'Open validation issues'
                )}>{systemOverviewCount}</span
              >
            {/if}
          </button>
          <!--
            Crafting group is unconditional as of issue 745 (v1.3 headline).

            The Tool Studio used to force this group open (`|| isToolStudioRoute`, issue
            784) even though Tools is a top-level rail entry and has never been a Crafting
            child. That pinned the group open on a screen that is not in it and left its
            chevron inert — one of the five faces of the "refuses to minimize" report
            (issue 1185). The rule is uniform now: only a Crafting SUB-ITEM locks it.
          -->
          <div class={`manager-nav-group ${railGroupExpanded.crafting ? 'is-expanded' : ''}`}>
            <button
              type="button"
              class="manager-nav-button manager-nav-parent"
              id="manager-nav-crafting"
              aria-current={isCraftingRoute ? 'page' : undefined}
              aria-expanded={railGroupExpanded.crafting}
              onclick={activateCraftingParent}
            >
              <i class="fas fa-hammer" aria-hidden="true"></i>
              <span class="manager-nav-label"
                >{text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting')}</span
              >
              <span class="manager-nav-count">{craftingNavCount}</span>
            </button>
            <!--
              Locked ⇒ genuinely `disabled`, with the reason on the control. A collapse that
              would hide the screen the GM is standing on is the ONE case the rule forbids,
              and a chevron that silently swallowed the click is what made the old behaviour
              read as a bug rather than a constraint.
            -->
            <button
              type="button"
              class="manager-nav-toggle"
              aria-label={railGroupExpanded.crafting
                ? text('FABRICATE.Admin.Manager.Nav.CollapseCrafting', 'Collapse crafting menu')
                : text('FABRICATE.Admin.Manager.Nav.ExpandCrafting', 'Expand crafting menu')}
              aria-controls="manager-crafting-submenu"
              aria-expanded={railGroupExpanded.crafting}
              disabled={railGroupLockedOpen.crafting}
              aria-disabled={railGroupLockedOpen.crafting}
              title={railGroupLockedOpen.crafting ? railGroupLockedTitle : undefined}
              onclick={(event) => toggleRailGroup('crafting', event)}
            >
              <i
                class={railGroupExpanded.crafting ? 'fas fa-chevron-up' : 'fas fa-chevron-down'}
                aria-hidden="true"
              ></i>
            </button>
            {#if railGroupExpanded.crafting}
              <div
                class="manager-nav-submenu"
                id="manager-crafting-submenu"
                aria-label={text(
                  'FABRICATE.Admin.Manager.Crafting.CraftingTabs.Label',
                  'Crafting sections'
                )}
              >
                {#each craftingNavItems as craftingItem (craftingItem.id)}
                  <button
                    type="button"
                    class={`manager-nav-subitem ${isCraftingRoute && activeCraftingTab === craftingItem.id ? 'is-active' : ''}`}
                    id={`manager-crafting-nav-${craftingItem.id}`}
                    aria-current={isCraftingRoute && activeCraftingTab === craftingItem.id
                      ? 'page'
                      : undefined}
                    onclick={() => openCraftingSection(craftingItem.id)}
                  >
                    <i class={craftingItem.icon} aria-hidden="true"></i>
                    <span class="manager-nav-label"
                      >{text(craftingItem.labelKey, craftingItem.labelFallback)}</span
                    >
                    {#if craftingItem.count != null}
                      <span class="manager-nav-count">{craftingItem.count}</span>
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
          <!--
            SCREEN TITLE, NOT A DOMAIN NOUN (issue 1362). The three system entries are relabelled
            `Component Rules` / `Essence Rules` / `Tool Rules` after the prototype, because the
            world scope now owns a `Component catalogue` and a `Tools Catalogue` and an
            unqualified `Components` no longer says which scope it means. The relation these
            screens edit is a System Membership Record: no route token, setting key, code
            identifier or persisted field takes the spelling `rules` for it, and the ROUTE
            TOKENS are preserved unrenamed.
          -->
          <button
            type="button"
            class={`manager-nav-button ${currentView === 'components' || currentView === 'component-edit' ? 'is-active' : ''}`}
            id="manager-nav-component-rules"
            aria-current={currentView === 'components' || currentView === 'component-edit'
              ? 'page'
              : undefined}
            onclick={() => setView('components')}
          >
            <i class="fas fa-boxes" aria-hidden="true"></i>
            <span class="manager-nav-label"
              >{text('FABRICATE.Admin.Manager.Nav.ComponentRules', 'Component Rules')}</span
            >
            <span class="manager-nav-count">{selectedCounts.components}</span>
          </button>
          <button
            type="button"
            class={`manager-nav-button ${currentView === 'tags' ? 'is-active' : ''}`}
            id="manager-nav-tags"
            aria-current={currentView === 'tags' ? 'page' : undefined}
            onclick={() => setView('tags')}
          >
            <i class="fas fa-tags" aria-hidden="true"></i>
            <span class="manager-nav-label"
              >{text('FABRICATE.Admin.Manager.Nav.TagsCategories', 'Tags & Categories')}</span
            >
            <!--
              The rail badge is the whole screen's vocabulary, so it sums the SAME
              inclusive projection the tab badges and at-a-glance tiles read (issue 878).
              It previously summed `selectedCounts`, which counts raw persisted arrays:
              General was absent and component categories were omitted entirely, so the
              rail read 5 beside tab badges of 3 / 1 / 3.
            -->
            <span class="manager-nav-count"
              >{tagCategoryCounts.recipeCategories +
                tagCategoryCounts.componentCategories +
                tagCategoryCounts.itemTags}</span
            >
          </button>
          {#if canShowEssences}
            <button
              type="button"
              class={`manager-nav-button ${currentView === 'essences' || currentView === 'essence-edit' ? 'is-active' : ''}`}
              id="manager-nav-essence-rules"
              aria-current={currentView === 'essences' || currentView === 'essence-edit'
                ? 'page'
                : undefined}
              onclick={() => setView('essences')}
            >
              <i class="fas fa-mortar-pestle" aria-hidden="true"></i>
              <span class="manager-nav-label"
                >{text('FABRICATE.Admin.Manager.Nav.EssenceRules', 'Essence Rules')}</span
              >
              <span class="manager-nav-count">{selectedCounts.essences}</span>
            </button>
          {/if}
          <button
            type="button"
            class={`manager-nav-button ${currentView === 'tools' || currentView === 'tool-edit' ? 'is-active' : ''}`}
            id="manager-nav-tool-rules"
            aria-current={currentView === 'tools' || currentView === 'tool-edit'
              ? 'page'
              : undefined}
            onclick={() => setView('tools')}
          >
            <i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>
            <span class="manager-nav-label"
              >{text('FABRICATE.Admin.Manager.Nav.ToolRules', 'Tool Rules')}</span
            >
            <span class="manager-nav-count">{toolsNavCount}</span>
          </button>
          <div class={`manager-nav-group ${railGroupExpanded.checks ? 'is-expanded' : ''}`}>
            <button
              type="button"
              class={`manager-nav-button manager-nav-parent ${isChecksRoute ? 'is-active' : ''}`}
              id="manager-nav-checks"
              aria-current={isChecksRoute ? 'page' : undefined}
              aria-expanded={railGroupExpanded.checks}
              onclick={activateChecksParent}
            >
              <i class="fas fa-dice-d20" aria-hidden="true"></i>
              <span class="manager-nav-label"
                >{text('FABRICATE.Admin.Manager.Nav.Checks', 'Checks')}</span
              >
              <!-- The parent badge is an ISSUE COUNT, not a record count, so it wears the
                   pill treatment and names its unit. A collapsed rail still renders it —
                   that is the only signal left when the children are hidden. -->
              {#if checksNavCount > 0}
                <span
                  class="manager-nav-issue-badge"
                  data-checks-nav-issues="checks"
                  role="img"
                  aria-label={checksIssueName(checksNavCount)}>{checksNavCount}</span
                >
              {/if}
            </button>
            <button
              type="button"
              class="manager-nav-toggle"
              aria-label={railGroupExpanded.checks
                ? text('FABRICATE.Admin.Manager.Nav.CollapseChecks', 'Collapse checks menu')
                : text('FABRICATE.Admin.Manager.Nav.ExpandChecks', 'Expand checks menu')}
              aria-controls="manager-checks-submenu"
              aria-expanded={railGroupExpanded.checks}
              disabled={railGroupLockedOpen.checks}
              aria-disabled={railGroupLockedOpen.checks}
              title={railGroupLockedOpen.checks ? railGroupLockedTitle : undefined}
              onclick={(event) => toggleRailGroup('checks', event)}
            >
              <i
                class={railGroupExpanded.checks ? 'fas fa-chevron-up' : 'fas fa-chevron-down'}
                aria-hidden="true"
              ></i>
            </button>
            {#if railGroupExpanded.checks}
              <div
                class="manager-nav-submenu"
                id="manager-checks-submenu"
                aria-label={text('FABRICATE.Admin.Manager.Checks.Tabs.Label', 'Checks sections')}
              >
                {#each checksNavItems as checksItem (checksItem.id)}
                  <button
                    type="button"
                    class={`manager-nav-subitem ${currentView === checksItem.view ? 'is-active' : ''}`}
                    id={`manager-checks-nav-${checksItem.id}`}
                    data-checks-nav-item={checksItem.id}
                    aria-current={currentView === checksItem.view ? 'page' : undefined}
                    onclick={() => setView(checksItem.view)}
                  >
                    <i class={checksItem.icon} aria-hidden="true"></i>
                    <span class="manager-nav-label"
                      >{text(checksItem.labelKey, checksItem.labelFallback)}</span
                    >
                    <!-- THREE distinguishable markers can land in this column, and they must
                         not be confusable: a record-count numeral (`.manager-nav-count`,
                         which Checks never has), an ISSUE badge (a pill naming its unit),
                         and an UNSAVED marker (a different SHAPE with its own name, not the
                         same dot in another colour). -->
                    {#if checksItem.dirty}
                      <span
                        class="manager-nav-dirty-marker"
                        data-checks-nav-dirty={checksItem.id}
                        role="img"
                        aria-label={text(
                          'FABRICATE.Admin.Manager.Checks.Nav.Unsaved',
                          'Unsaved changes'
                        )}
                      ></span>
                    {/if}
                    {#if checksItem.issueCount > 0}
                      <span
                        class="manager-nav-issue-badge"
                        data-checks-nav-issues={checksItem.id}
                        role="img"
                        aria-label={checksIssueName(checksItem.issueCount)}
                        >{checksItem.issueCount}</span
                      >
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
          {#if canShowEnvironments}
            <div class={`manager-nav-group ${railGroupExpanded.gathering ? 'is-expanded' : ''}`}>
              <button
                type="button"
                class="manager-nav-button manager-nav-parent"
                id="manager-nav-gathering"
                aria-current={isGatheringRoute ? 'page' : undefined}
                aria-expanded={railGroupExpanded.gathering}
                onclick={activateGatheringParent}
              >
                <i class="fas fa-seedling" aria-hidden="true"></i>
                <span class="manager-nav-label"
                  >{text('FABRICATE.Admin.Manager.Nav.Environments', 'Gathering')}</span
                >
                <span class="manager-nav-count">{gatheringNavCounts.total}</span>
              </button>
              <button
                type="button"
                class="manager-nav-toggle"
                aria-label={railGroupExpanded.gathering
                  ? text('FABRICATE.Admin.Manager.Nav.CollapseGathering', 'Collapse gathering menu')
                  : text('FABRICATE.Admin.Manager.Nav.ExpandGathering', 'Expand gathering menu')}
                aria-controls="manager-gathering-submenu"
                aria-expanded={railGroupExpanded.gathering}
                disabled={railGroupLockedOpen.gathering}
                aria-disabled={railGroupLockedOpen.gathering}
                title={railGroupLockedOpen.gathering ? railGroupLockedTitle : undefined}
                onclick={(event) => toggleRailGroup('gathering', event)}
              >
                <i
                  class={railGroupExpanded.gathering ? 'fas fa-chevron-up' : 'fas fa-chevron-down'}
                  aria-hidden="true"
                ></i>
              </button>
              {#if railGroupExpanded.gathering}
                <div
                  class="manager-nav-submenu"
                  id="manager-gathering-submenu"
                  aria-label={text(
                    'FABRICATE.Admin.Manager.Environment.GatheringTabs.Label',
                    'Gathering sections'
                  )}
                >
                  {#each visibleGatheringNavItems as gatheringItem (gatheringItem.id)}
                    <button
                      type="button"
                      class={`manager-nav-subitem ${isGatheringRoute && displayedGatheringTab === gatheringItem.id ? 'is-active' : ''}`}
                      id={`manager-gathering-nav-${gatheringItem.id}`}
                      aria-current={isGatheringRoute && displayedGatheringTab === gatheringItem.id
                        ? 'page'
                        : undefined}
                      onclick={() => openGatheringSection(gatheringItem.id)}
                    >
                      <i class={gatheringItem.icon} aria-hidden="true"></i>
                      <span class="manager-nav-label"
                        >{text(gatheringItem.labelKey, gatheringItem.labelFallback)}</span
                      >
                      {#if gatheringNavCounts[gatheringItem.id] != null}
                        <span class="manager-nav-count">{gatheringNavCounts[gatheringItem.id]}</span
                        >
                      {/if}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        {/if}
        {#each visiblePlaceholderViews as view (view.labelKey)}
          <!-- A stable id here too (issue 1362). Both harnesses target every rail entry by id,
               and a planned-view placeholder is still a rail entry the smoke's membership loop
               names. -->
          <button
            type="button"
            class="manager-nav-button"
            id={view.navId}
            disabled
            title={text(
              'FABRICATE.Admin.Manager.PlannedView',
              '{view} is planned for a future release.'
            ).replace('{view}', text(view.labelKey, view.fallback))}
          >
            <i class={view.icon} aria-hidden="true"></i>
            <span class="manager-nav-label">{text(view.labelKey, view.fallback)}</span>
            <span class="manager-nav-count">{text('FABRICATE.Admin.Manager.Soon', 'Soon')}</span>
          </button>
        {/each}
        <section
          class="manager-world-nav"
          data-world-nav-section
          aria-labelledby="manager-world-heading"
        >
          <div class="manager-world-heading-row">
            <h2 id="manager-world-heading">
              {text('FABRICATE.Admin.Manager.World.Heading', 'WORLD')}
            </h2>
            <span id="manager-world-scope">
              {text('FABRICATE.Admin.Manager.World.Scope', 'every system')}
            </span>
          </div>
          <!--
            The four world scoped-entity leaves (issue 1362, epic 1357), ABOVE Parties and in
            the PROTOTYPE'S AUTHORED ORDER — Component catalogue, Tags & Categories, Essence
            Catalogue, Tools Catalogue.

            THREE ODDITIES IN THESE LABELS READ AS TYPOS AND NONE IS. `Component catalogue`
            carries a lowercase `c` (authored three times in the prototype, including in its
            breadcrumb map); `Tools Catalogue` is PLURAL where its siblings are singular; and
            `Tags & Categories` is CHARACTER-FOR-CHARACTER IDENTICAL to the system-scope entry
            further up this rail. The prototype is the authority for rail labels and order, and
            `scripts/visual-parity/inventory.mjs` asserts landmark ORDER, so "correcting" any
            of the three reds the parity gate this epic exists to establish.

            The exact duplicate is also why NEITHER HARNESS may match a rail entry by visible
            text any more: `:has-text("Tags")` now matches two buttons, `:has-text("Tools")`
            matches `Tools Catalogue` as a substring, and `Components` has become
            `Component Rules` while a `Component`-prefixed entry exists in both scopes. Every
            rail button therefore carries a stable `id`, and both harnesses target those.

            UNGATED and reachable with NO crafting system selected, like Parties, Travel and
            Rules & Resources: the world catalogue has to be authorable before any system opts
            into anything.

            EVERY LEAF CARRIES AN EXPLICIT `aria-label`, which is not belt-and-braces here. The
            collapsed rail hides BOTH `.manager-nav-label` and `.manager-nav-count`
            (`styles/fabricate.css`), leaving only an `aria-hidden` glyph — so without one the
            button's accessible name is EMPTY at 56px, which is a state this PR ships a frame
            of. Parties, Travel, Rules & Resources and Downtime all do the same.
          -->
          <button
            type="button"
            class={`manager-nav-button manager-world-nav-item ${currentView === 'world-components' || currentView === 'world-component-entry' ? 'is-active' : ''}`}
            id="manager-world-nav-component-catalogue"
            data-world-nav-item="component-catalogue"
            aria-label={text(
              'FABRICATE.Admin.Manager.Scoped.ComponentCatalogueTitle',
              'Component catalogue'
            )}
            aria-current={currentView === 'world-components' ||
            currentView === 'world-component-entry'
              ? 'page'
              : undefined}
            onclick={() => setView('world-components')}
          >
            <i class="fas fa-cubes-stacked" aria-hidden="true"></i>
            <span class="manager-nav-label">
              {text(
                'FABRICATE.Admin.Manager.Scoped.ComponentCatalogueTitle',
                'Component catalogue'
              )}
            </span>
            <span class="manager-nav-count">{worldScopedCounts.components}</span>
          </button>
          <button
            type="button"
            class={`manager-nav-button manager-world-nav-item ${currentView === 'world-vocabulary' ? 'is-active' : ''}`}
            id="manager-world-nav-vocabulary"
            data-world-nav-item="vocabulary"
            aria-label={text('FABRICATE.Admin.Manager.Scoped.VocabularyTitle', 'Tags & Categories')}
            aria-current={currentView === 'world-vocabulary' ? 'page' : undefined}
            onclick={() => setView('world-vocabulary')}
          >
            <i class="fas fa-tags" aria-hidden="true"></i>
            <span class="manager-nav-label">
              {text('FABRICATE.Admin.Manager.Scoped.VocabularyTitle', 'Tags & Categories')}
            </span>
            <span class="manager-nav-count">{worldScopedCounts.vocabulary}</span>
          </button>
          <button
            type="button"
            class={`manager-nav-button manager-world-nav-item ${currentView === 'world-essences' || currentView === 'world-essence-entry' ? 'is-active' : ''}`}
            id="manager-world-nav-essence-catalogue"
            data-world-nav-item="essence-catalogue"
            aria-label={text(
              'FABRICATE.Admin.Manager.Scoped.EssenceCatalogueTitle',
              'Essence Catalogue'
            )}
            aria-current={currentView === 'world-essences' || currentView === 'world-essence-entry'
              ? 'page'
              : undefined}
            onclick={() => setView('world-essences')}
          >
            <i class="fas fa-flask-vial" aria-hidden="true"></i>
            <span class="manager-nav-label">
              {text('FABRICATE.Admin.Manager.Scoped.EssenceCatalogueTitle', 'Essence Catalogue')}
            </span>
            <span class="manager-nav-count">{worldScopedCounts.essences}</span>
          </button>
          <button
            type="button"
            class={`manager-nav-button manager-world-nav-item ${currentView === 'world-tools' || currentView === 'world-tool-entry' ? 'is-active' : ''}`}
            id="manager-world-nav-tool-catalogue"
            data-world-nav-item="tool-catalogue"
            aria-label={text(
              'FABRICATE.Admin.Manager.Scoped.ToolCatalogueTitle',
              'Tools Catalogue'
            )}
            aria-current={currentView === 'world-tools' || currentView === 'world-tool-entry'
              ? 'page'
              : undefined}
            onclick={() => setView('world-tools')}
          >
            <i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>
            <span class="manager-nav-label">
              {text('FABRICATE.Admin.Manager.Scoped.ToolCatalogueTitle', 'Tools Catalogue')}
            </span>
            <span class="manager-nav-count">{worldScopedCounts.tools}</span>
          </button>
          <button
            type="button"
            class={`manager-nav-button manager-world-nav-item ${isWorldRoute ? 'is-active' : ''}`}
            id="manager-world-nav-parties"
            data-world-nav-item="parties"
            aria-label={text('FABRICATE.Admin.Manager.Travel.Tabs.Parties', 'Parties')}
            aria-current={isWorldRoute ? 'page' : undefined}
            onclick={openWorldParties}
          >
            <i class="fas fa-users" aria-hidden="true"></i>
            <span class="manager-nav-label">
              {text('FABRICATE.Admin.Manager.Travel.Tabs.Parties', 'Parties')}
            </span>
            <span class="manager-nav-count">{travelParties.length}</span>
          </button>
          <!--
            World > Travel (issue 1282). A GROUP, not a leaf, for the reason Downtime is one:
            the route has two destinations — Realms and Map Region Links — and the rail is
            where this Manager has always put a route's destinations. The group moved here
            wholesale from the selected-system rail, because realms are world geography and a
            crafting system now only decides whether it PARTICIPATES.

            UNGATED, like Parties and Currency: the library has to be authorable before any
            system opts into it.
          -->
          <div
            class={`manager-nav-group manager-world-travel-group ${railGroupExpanded.worldTravel ? 'is-expanded' : ''}`}
            data-world-travel-section
          >
            <button
              type="button"
              class={`manager-nav-button manager-nav-parent manager-world-nav-item ${isWorldTravelRoute ? 'is-active' : ''}`}
              id="manager-world-nav-travel"
              data-world-nav-item="travel"
              aria-label={text('FABRICATE.Admin.Manager.World.TravelNav', 'Travel')}
              aria-current={isWorldTravelRoute ? 'page' : undefined}
              aria-controls="manager-travel-submenu"
              aria-expanded={railGroupExpanded.worldTravel}
              onclick={activateWorldTravelParent}
            >
              <i class="fas fa-route" aria-hidden="true"></i>
              <span class="manager-nav-label">
                {text('FABRICATE.Admin.Manager.World.TravelNav', 'Travel')}
              </span>
              <span class="manager-nav-count">{worldRealms.length}</span>
            </button>
            <button
              type="button"
              class="manager-nav-toggle"
              id="manager-travel-toggle"
              data-world-travel-toggle
              aria-label={railGroupExpanded.worldTravel
                ? text('FABRICATE.Admin.Manager.World.CollapseTravel', 'Collapse Travel')
                : text('FABRICATE.Admin.Manager.World.ExpandTravel', 'Expand Travel')}
              aria-controls="manager-travel-submenu"
              aria-expanded={railGroupExpanded.worldTravel}
              disabled={railGroupLockedOpen.worldTravel}
              aria-disabled={railGroupLockedOpen.worldTravel}
              title={railGroupLockedOpen.worldTravel ? railGroupLockedTitle : undefined}
              onclick={(event) => toggleRailGroup('worldTravel', event)}
            >
              <i
                class={railGroupExpanded.worldTravel ? 'fas fa-chevron-up' : 'fas fa-chevron-down'}
                aria-hidden="true"
              ></i>
            </button>
            {#if railGroupExpanded.worldTravel}
              <div
                class="manager-nav-submenu"
                id="manager-travel-submenu"
                data-world-travel-submenu
                aria-label={text(
                  'FABRICATE.Admin.Manager.World.TravelDestinations',
                  'Travel destinations'
                )}
              >
                <button
                  type="button"
                  class={`manager-nav-subitem ${isWorldTravelRoute && worldTravelTab === 'realms' ? 'is-active' : ''}`}
                  id="manager-travel-nav-realms"
                  data-world-travel-item="realms"
                  aria-current={isWorldTravelRoute && worldTravelTab === 'realms'
                    ? 'page'
                    : undefined}
                  onclick={() => openWorldTravelDestination('realms')}
                >
                  <i class="fas fa-mountain-sun" aria-hidden="true"></i>
                  <span class="manager-nav-label">
                    {text('FABRICATE.Admin.Manager.Travel.Tabs.Realms', 'Realms')}
                  </span>
                </button>
                <button
                  type="button"
                  class={`manager-nav-subitem ${isWorldTravelRoute && worldTravelTab === 'map' ? 'is-active' : ''}`}
                  id="manager-travel-nav-map"
                  data-world-travel-item="map"
                  aria-current={isWorldTravelRoute && worldTravelTab === 'map' ? 'page' : undefined}
                  onclick={() => openWorldTravelDestination('map')}
                >
                  <i class="fas fa-map-location-dot" aria-hidden="true"></i>
                  <span class="manager-nav-label">
                    {text('FABRICATE.Admin.Manager.Travel.Tabs.MapLinks', 'Map Region Links')}
                  </span>
                </button>
              </div>
            {/if}
          </div>
          <!--
            World > Rules & Resources (issue 1311). A GROUP, for the reason Travel and Downtime
            are: the route has several destinations, and the rail is where this Manager has
            always put a route's destinations. Currency was a leaf only because it was the first
            of the three to move to world scope; the character prerequisite library and the
            modifier library joined it in issue 1308 and the three are one kind of thing.

            UNGATED, like Parties and Travel: every one of these libraries has to be authorable
            before any crafting system references it.

            The count is the total across all three, because the parent stands for the group
            rather than for any one destination.
          -->
          <div
            class={`manager-nav-group manager-world-rules-group ${railGroupExpanded.worldRules ? 'is-expanded' : ''}`}
            data-world-rules-section
          >
            <button
              type="button"
              class={`manager-nav-button manager-nav-parent manager-world-nav-item ${isWorldRulesRoute ? 'is-active' : ''}`}
              id="manager-world-nav-rules"
              data-world-nav-item="rules"
              aria-label={text('FABRICATE.Admin.Manager.World.RulesNav', 'Rules & Resources')}
              aria-current={isWorldRulesRoute ? 'page' : undefined}
              aria-controls="manager-rules-submenu"
              aria-expanded={railGroupExpanded.worldRules}
              onclick={activateWorldRulesParent}
            >
              <i class="fas fa-scale-balanced" aria-hidden="true"></i>
              <span class="manager-nav-label">
                {text('FABRICATE.Admin.Manager.World.RulesNav', 'Rules & Resources')}
              </span>
              <span class="manager-nav-count">
                {selectedCurrencyUnits.length +
                  selectedCharacterPrerequisites.length +
                  selectedSystemModifiers.length}
              </span>
            </button>
            <button
              type="button"
              class="manager-nav-toggle"
              id="manager-rules-toggle"
              data-world-rules-toggle
              aria-label={railGroupExpanded.worldRules
                ? text('FABRICATE.Admin.Manager.World.CollapseRules', 'Collapse Rules & Resources')
                : text('FABRICATE.Admin.Manager.World.ExpandRules', 'Expand Rules & Resources')}
              aria-controls="manager-rules-submenu"
              aria-expanded={railGroupExpanded.worldRules}
              disabled={railGroupLockedOpen.worldRules}
              aria-disabled={railGroupLockedOpen.worldRules}
              title={railGroupLockedOpen.worldRules ? railGroupLockedTitle : undefined}
              onclick={(event) => toggleRailGroup('worldRules', event)}
            >
              <i
                class={railGroupExpanded.worldRules ? 'fas fa-chevron-up' : 'fas fa-chevron-down'}
                aria-hidden="true"
              ></i>
            </button>
            {#if railGroupExpanded.worldRules}
              <div
                class="manager-nav-submenu"
                id="manager-rules-submenu"
                data-world-rules-submenu
                aria-label={text(
                  'FABRICATE.Admin.Manager.World.RulesDestinations',
                  'Rules & Resources'
                )}
              >
                <button
                  type="button"
                  class={`manager-nav-subitem ${isWorldCurrencyRoute ? 'is-active' : ''}`}
                  id="manager-rules-nav-currency"
                  data-world-rules-item="currency"
                  aria-current={isWorldCurrencyRoute ? 'page' : undefined}
                  onclick={() => openWorldRulesDestination('currency')}
                >
                  <i class="fas fa-coins" aria-hidden="true"></i>
                  <span class="manager-nav-label">
                    {text('FABRICATE.Admin.Manager.World.CurrencyNav', 'Currency')}
                  </span>
                </button>
                <button
                  type="button"
                  class={`manager-nav-subitem ${isWorldPrerequisitesRoute ? 'is-active' : ''}`}
                  id="manager-rules-nav-prerequisites"
                  data-world-rules-item="prerequisites"
                  aria-current={isWorldPrerequisitesRoute ? 'page' : undefined}
                  onclick={() => openWorldRulesDestination('prerequisites')}
                >
                  <i class="fas fa-user-shield" aria-hidden="true"></i>
                  <span class="manager-nav-label">
                    {text(
                      'FABRICATE.Admin.Manager.CharacterPrerequisites.Title',
                      'Character prerequisites'
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  class={`manager-nav-subitem ${isWorldModifiersRoute ? 'is-active' : ''}`}
                  id="manager-rules-nav-modifiers"
                  data-world-rules-item="modifiers"
                  aria-current={isWorldModifiersRoute ? 'page' : undefined}
                  onclick={() => openWorldRulesDestination('modifiers')}
                >
                  <i class="fas fa-user-gear" aria-hidden="true"></i>
                  <span class="manager-nav-label">
                    {text('FABRICATE.Admin.Manager.Modifiers.Title', 'Modifiers')}
                  </span>
                </button>
              </div>
            {/if}
          </div>
          <!--
            Downtime is a GROUP, not a leaf: the design nests the same four previews under it
            that Core's own tab strip offers, each carrying a premium padlock. The structure
            follows the shipped Travel group exactly — parent, disclosure toggle, submenu —
            so the collapsed 56px rail hides the labels, the toggle and the whole submenu
            without a rule of its own, and the premium badge rides `.manager-nav-count` for
            the same reason.

            THE WHOLE GROUP IS EXPERIMENTAL-GATED (issue 1257), parent row, disclosure toggle
            and submenu alike, and everything premium that rides them goes with it: the
            `.manager-nav-count` PREMIUM badge is a child of the parent button, the padlocks
            are children of the sub-items, and the PREMIUM PREVIEW callout is a child of the
            submenu. Nothing outside this group names Downtime — the title-bar badge answers
            "is a companion module registered at all" across BOTH registries and is not this
            route's signal, so it stays.
          -->
          {#if worldDowntimeAvailable}
            <div
              class={`manager-nav-group manager-world-downtime-group ${railGroupExpanded.worldDowntime ? 'is-expanded' : ''}`}
              data-world-downtime-section
            >
              <button
                type="button"
                class={`manager-nav-button manager-nav-parent manager-world-nav-item ${isWorldDowntimeRoute ? 'is-active' : ''}`}
                id="manager-world-nav-downtime"
                data-world-nav-item="downtime"
                title={downtimeCoreFallback
                  ? text(
                      'FABRICATE.Admin.Manager.World.Downtime.PremiumTooltip',
                      'Unlock Downtime Studio with Fabricate Premium'
                    )
                  : text(
                      'FABRICATE.Admin.Manager.World.Downtime.InstalledTooltip',
                      'Downtime Studio is unlocked by Fabricate Premium'
                    )}
                aria-label={downtimeNavRollupVisible
                  ? downtimeParentName(downtimeNavRollupTotal)
                  : text('FABRICATE.Admin.Manager.World.Downtime.Nav', 'Downtime')}
                aria-current={isWorldDowntimeRoute ? 'page' : undefined}
                aria-controls="manager-downtime-submenu"
                aria-expanded={railGroupExpanded.worldDowntime}
                onclick={openWorldDowntime}
              >
                <i class="fas fa-hourglass-half" aria-hidden="true"></i>
                <span class="manager-nav-label">
                  {text('FABRICATE.Admin.Manager.World.Downtime.Nav', 'Downtime')}
                </span>
                <!--
                The chip is MUTED, never removed, once a companion holds the surface (issue
                1185) — EXCEPT while a nonzero rollup shows (issue 1302), which REPLACES it
                outright: the parent row's single trailing track carries either the chip or
                the rollup, never both, so a second grid item never auto-places into an
                implicit row under the icon. With premium installed the title bar carries the
                loud gold signal, and two shouts of the same word is one too many — but the
                rail still has to say which route premium provides. `is-installed` re-tones
                the chip to a quiet accent marker and leaves its geometry alone.
              -->
                {#if !downtimeNavRollupVisible}
                  <span
                    class={`manager-nav-count manager-nav-premium ${downtimeCoreFallback ? '' : 'is-installed'}`}
                    data-world-nav-premium
                    data-world-nav-premium-state={downtimeCoreFallback ? 'preview' : 'installed'}
                    >{text('FABRICATE.Admin.Manager.World.Downtime.Premium', 'PREMIUM')}</span
                  >
                {/if}
                <!--
                The rollup — Core's own summary of what the closed disclosure is hiding,
                identical in shape to the Checks parent badge. Renders in provider mode only,
                and only while the children are hidden, in the parent's one trailing track.
              -->
                {#if !downtimeCoreFallback}
                  {#if downtimeNavRollupVisible}
                    <span
                      class="manager-nav-issue-badge"
                      data-world-downtime-badge-total
                      role="img"
                      aria-label={downtimeRollupName(downtimeNavRollupTotal)}
                      >{downtimeNavRollupTotal}</span
                    >
                  {/if}
                {/if}
              </button>
              <button
                type="button"
                class="manager-nav-toggle"
                id="manager-downtime-toggle"
                data-world-downtime-toggle
                aria-label={railGroupExpanded.worldDowntime
                  ? text('FABRICATE.Admin.Manager.World.Downtime.CollapseNav', 'Collapse Downtime')
                  : text('FABRICATE.Admin.Manager.World.Downtime.ExpandNav', 'Expand Downtime')}
                aria-controls="manager-downtime-submenu"
                aria-expanded={railGroupExpanded.worldDowntime}
                disabled={railGroupLockedOpen.worldDowntime}
                aria-disabled={railGroupLockedOpen.worldDowntime}
                title={railGroupLockedOpen.worldDowntime ? railGroupLockedTitle : undefined}
                onclick={(event) => toggleRailGroup('worldDowntime', event)}
              >
                <i
                  class={railGroupExpanded.worldDowntime
                    ? 'fas fa-chevron-up'
                    : 'fas fa-chevron-down'}
                  aria-hidden="true"
                ></i>
              </button>
              {#if railGroupExpanded.worldDowntime}
                <div
                  class="manager-nav-submenu"
                  id="manager-downtime-submenu"
                  data-world-downtime-submenu
                  aria-label={text(
                    'FABRICATE.Admin.Manager.World.Downtime.NavSections',
                    'Downtime previews'
                  )}
                >
                  {#each downtimeNavItems as item (item.id)}
                    <!--
                    `accessibleName` and `tooltip` LAND HERE in provider mode (issue 1213).
                    With no tab strip over a companion's screens this button is the only
                    control naming the active screen, so the two fields the seam requires have
                    to be consumed by it or Core would validate them and throw them away.
                    `aria-label` REPLACES the visible label as the button's accessible name —
                    the same contract the player seam's rail button already ships — so a
                    provider's `accessibleName` must contain the label's text. In core-fallback
                    it stays `undefined`: Core's preview keeps its strip, which is where Core's
                    own accessible names and keyboard-visible tooltips already live, and this
                    change touches nothing in that mode.
                  -->
                    <button
                      type="button"
                      class={`manager-nav-subitem manager-downtime-subitem ${isWorldDowntimeRoute && worldDowntimeTabId === item.id ? 'is-active' : ''}`}
                      id={downtimeNavItemId(item.id)}
                      bind:this={downtimeNavNodes[item.id]}
                      data-world-downtime-item={item.id}
                      title={downtimeTabText(item, 'tooltip')}
                      aria-label={downtimeCoreFallback
                        ? undefined
                        : downtimeTabText(item, 'accessibleName')}
                      aria-current={isWorldDowntimeRoute && worldDowntimeTabId === item.id
                        ? 'true'
                        : undefined}
                      aria-describedby={downtimeSubitemBadge(item)
                        ? downtimeNavBadgeId(item.id)
                        : undefined}
                      onclick={() => openWorldDowntimePreview(item.id)}
                    >
                      <i class={item.icon} aria-hidden="true"></i>
                      <span class="manager-nav-label" id={downtimeNavLabelId(item.id)}
                        >{downtimeTabText(item, 'label')}</span
                      >
                      <!--
                      A badge is a DESCRIPTION, never a name: it is a sibling of the label
                      span above, and it is never nested inside it, because that span names
                      the whole companion panel region (issue 1213) and a nested badge would
                      silently rename the region. No `aria-describedby` is present above when
                      no badge renders here — no dangling IDREF on a 3 → 0 transition.
                    -->
                      {#if !downtimeCoreFallback}
                        {@const badge = downtimeSubitemBadge(item)}
                        {#if badge}
                          <span
                            class="manager-nav-count"
                            data-world-downtime-badge={item.id}
                            id={downtimeNavBadgeId(item.id)}
                            role="img"
                            aria-label={badge.accessibleName}>{badge.count}</span
                          >
                        {/if}
                      {/if}
                      <!--
                      The padlock and the premium note below advertise CORE'S preview. A
                      companion owning the surface has nothing locked, so neither renders.
                    -->
                      {#if downtimeCoreFallback}
                        <span class="manager-nav-lock" data-world-downtime-lock
                          ><i class="fas fa-lock" aria-hidden="true"></i></span
                        >
                      {/if}
                    </button>
                  {/each}
                </div>
                {#if downtimeCoreFallback}
                  <p class="manager-nav-callout" data-world-downtime-callout>
                    <span class="manager-nav-callout-kicker">
                      <i class="fas fa-lock" aria-hidden="true"></i>
                      {text('FABRICATE.Admin.Manager.World.Downtime.RailKicker', 'PREMIUM PREVIEW')}
                    </span>
                    {text(
                      'FABRICATE.Admin.Manager.World.Downtime.RailNote',
                      'Open any Downtime page to preview how Fabricate Premium can help you run downtime.'
                    )}
                  </p>
                {/if}
              {/if}
            </div>
          {/if}
        </section>
      </nav>
    </aside>

    {#if currentView === 'world-components'}
      <!--
        The seven world scoped-entity routes (issue 1362). Each renders its own
        `<main class="manager-main">` through the shared `ScopedPlaceholderPage`, carrying a
        per-page `data-scoped-page` hook. These SEVEN FILES are what PRs 6a, 6b, 6c and 7
        replace, which is the whole reason they are separate components rather than seven
        branches of markup here.

        AND THE ROUTE SEAM THOSE LANES CONSUME. A catalogue takes `onOpenEntry(entityId)` and an
        entry takes the `entityId` it was opened on plus the way back to its catalogue. The
        placeholder bodies use none of the four — they render an empty state — but the wiring is
        here rather than in 6a/6b/6c because it is the SHELL that owns routing, the breadcrumb
        and the confirm-discard gate.

        AND THE DATA SEAM, ADDED HERE (issue 1374) FOR THE SAME REASON THE ROUTE SEAM WAS.
        Issue 1362 wired the routes and handed the pages nothing to read: this corpus registers
        no component context and exports no store singleton, so a declared prop is the only way
        a page reaches the published world corpus or the world-scope write path. Six of the
        seven take one of the three bundles declared above; the seventh, World Vocabulary, is
        NOT a scoped entity — `### GM World Vocabulary Route` says so — so it takes its own
        published state under its own name rather than a `scope`.

        THE PLACEHOLDER BODIES DECLARE NO PROPS AT ALL, so every one of these values is inert
        until the lane that replaces a body declares the ones it wants. That is the point: the
        seam is open before the screens arrive, and no later lane has to reopen this file to
        open it.
      -->
      <WorldComponentCataloguePage
        {...componentScopeProps}
        onOpenEntry={(entityId) => openWorldScopedEntry('world-component-entry', entityId)}
      />
    {:else if currentView === 'world-component-entry'}
      <WorldComponentEntryPage
        {...componentScopeProps}
        entityId={worldScopedEntryId}
        onBackToCatalogue={() => setView('world-components')}
      />
    {:else if currentView === 'world-essences'}
      <WorldEssenceCataloguePage
        {...essenceScopeProps}
        onOpenEntry={(entityId) => openWorldScopedEntry('world-essence-entry', entityId)}
      />
    {:else if currentView === 'world-essence-entry'}
      <WorldEssenceEntryPage
        {...essenceScopeProps}
        entityId={worldScopedEntryId}
        onBackToCatalogue={() => setView('world-essences')}
      />
    {:else if currentView === 'world-tools'}
      <WorldToolCataloguePage
        {...toolScopeProps}
        onOpenEntry={(entityId) => openWorldScopedEntry('world-tool-entry', entityId)}
      />
    {:else if currentView === 'world-tool-entry'}
      <WorldToolEntryPage
        {...toolScopeProps}
        entityId={worldScopedEntryId}
        onBackToCatalogue={() => setView('world-tools')}
      />
    {:else if currentView === 'world-vocabulary'}
      <WorldVocabularyPage
        vocabulary={worldScopeState.vocabulary ?? null}
        actions={store?.worldScope?.vocabulary ?? null}
        systems={worldScopeSystems}
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
        World > Currency renders its own `manager-main` straight from the root, following the
        Downtime route rather than Parties: Parties reuses `EnvironmentsBrowserView` as its
        container, which is a leftover from when it was a Travel tab and not a shape to copy.
        There is no right-hand inspector — the unit editors expand in place, as they did on the
        Settings tab they came from.
      -->
      <main
        class="manager-main"
        aria-label={text('FABRICATE.Admin.Manager.World.CurrencyTitle', 'World Currency')}
      >
        <WorldCurrencyTab
          currencyUnits={selectedCurrencyUnits}
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
        Same shape as Currency above and for the same reasons: its own `manager-main` from the
        root, no right-hand inspector, and the entry editors expand in place.
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
        World > Travel renders its own `manager-main` straight from the root, following
        Currency and Downtime rather than Parties: Parties reuses `EnvironmentsBrowserView`
        as its container, which is a leftover from when it was a Travel tab and not a shape
        to copy.

        Unlike Currency it KEEPS the right-hand inspector, because the realm detail pane IS
        the authoring surface here — currency's unit editors expand in place, whereas a realm
        is renamed, described and deleted from the inspector.
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
          />
        {/if}
      </main>
    {:else if currentView === 'environments' || currentView === 'world'}
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
        activeGatheringTab={isWorldRoute ? 'travel' : displayedGatheringTab}
        activeTravelTab={isWorldRoute ? 'parties' : activeTravelTab}
        worldParties={isWorldRoute}
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
        onPickImagePath={services?.pickImagePath}
        {travelParties}
        travelSaving={$viewState.travelSaving === true}
        travelError={$viewState.travelError}
        travelFieldErrors={$viewState.travelFieldErrors || {}}
        travelActorOptions={$viewState.actorOptions || []}
        {worldRealms}
        {partyRealmOverridesAvailable}
        {partyRealmOverridesUnavailableHint}
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
            eventSelectionMode={selectedGatheringRules.eventSelectionMode}
            isNew={$viewState.environmentDraftIsNew}
            linkedSceneImage={environmentSceneImage($viewState.environmentDraft)}
            realmRecords={worldRealms}
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
            alchemyCheckMode={alchemyCheckModeDraft}
            craftingCheck={checkRoutedDraft}
            craftingCheckSimple={checkSimpleDraft}
            craftingCheckProgressive={checkProgressiveDraft}
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
            salvageCheckSimple={salvageSimpleDraft}
            salvageCheckRouted={salvageRoutedDraft}
            salvageCheckProgressive={salvageProgressiveDraft}
            {gatheringResolutionMode}
            gatheringCheckProgressive={gatheringProgressiveDraft}
            gatheringCheckRouted={gatheringRoutedDraft}
            breakageAuthority={selectedSystem?.toolBreakage?.authority || 'toolSpecific'}
            features={selectedSystem?.features || {}}
            activation={checkActivation}
            activity={checksActiveTab}
            requestedSection={checksActiveSection}
            requestedSectionNonce={checksSectionRequestNonce}
            dirty={checksDirty}
            dirtyActivities={checksDirtyActivities}
            {onUpdateCraftingCheck}
            {onUpdateCraftingCheckSimple}
            {onUpdateCraftingCheckProgressive}
            {onUpdateSalvageCheckSimple}
            {onUpdateSalvageCheckRouted}
            {onUpdateSalvageCheckProgressive}
            {onUpdateGatheringCheckProgressive}
            {onUpdateGatheringCheckRouted}
            onSetAlchemyCheckMode={(m) => {
              alchemyCheckModeDraft = m;
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
            {onUpdateAlchemyFlags}
            onOpenActivity={(activity, section) => {
              checksActiveSection = section || 'roll';
              checksSectionRequestNonce += 1;
              setView(`checks-${activity}`);
            }}
            onOpenModifierLibrary={showSystemModifiers}
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
        characterModifierLibrary={selectedSystemModifiers}
        checkModifierOptions={selectedSystemModifiers}
        gatheringModifierPolicy={selectedSystem?.gatheringCraftingCheck?.defaultModifierPolicy ||
          'addAll'}
        gatheringModifierMaxPicks={selectedSystem?.gatheringCraftingCheck?.maxModifierPicks ?? null}
        gatheringModifierDefaultIds={selectedSystem?.gatheringCraftingCheck?.defaultModifierIds ||
          []}
        libraryTools={selectedGatheringSystemTools}
        environmentOptions={selectedSystemEnvironmentOptions}
        onPickImagePath={services?.pickImagePath}
        onUpdateTask={updateSelectedGatheringTask}
        onSelectDrop={(rowId) => {
          selectedGatheringDropId = rowId;
        }}
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
        {...toolScopeProps}
        tools={libraryToolsList}
        selectedToolId={focusedToolDraft?.id || ''}
        managedItemOptions={selectedSystem?.managedItemOptions || []}
        breakageAuthority={selectedSystem?.toolBreakage?.authority || 'toolSpecific'}
        breakageSource={selectedSystem?.toolBreakage?.source || 'default'}
        onSelectTool={selectLibraryTool}
        onEditTool={openToolEditor}
        onCreateToolDrop={addToolFromDrop}
        onToggleToolEnabled={(id, enabled) =>
          store.toggleToolEnabled?.(id, enabled, selectedSystemId)}
        onSetBreakageAuthority={(authority) => store.setToolBreakageAuthority?.(authority)}
      />
    {:else if currentView === 'tool-edit' && selectedSystem && focusedToolDraft}
      <ToolEditView
        {...toolScopeProps}
        tool={focusedToolDraft}
        systemName={selectedSystem.name}
        validation={focusedToolValidation}
        dirty={$viewState.toolDraftDirty === true}
        persisted={$viewState.toolDraftBaseline !== null}
        saving={$viewState.toolDraftSaving === true}
        saveError={$viewState.toolDraftSaveError}
        activeTab={toolEditorActiveTab}
        focusValidationNonce={toolValidationFocusNonce}
        worldItems={worldItemOptions}
        managedItems={selectedSystem?.managedItemOptions || []}
        itemTags={selectedSystem?.itemTags || []}
        essenceOptions={selectedSystem?.features?.essences === true
          ? selectedSystem?.essenceDefinitions || []
          : []}
        currencyUnits={selectedCurrencyUnits}
        currencyEnabled={selectedCurrencyEnabled}
        prerequisiteOptions={selectedCharacterPrerequisites}
        authority={selectedSystem?.toolBreakage?.authority || 'toolSpecific'}
        onOpenSystems={selectSystemAndShowBrowser}
        onOpenSystem={() => editSystem(selectedSystem.id)}
        onOpenTools={backToToolsBrowser}
        onBack={backToToolsBrowser}
        onDelete={deleteSelectedLibraryTool}
        onSave={saveSelectedToolDraft}
        onTabChange={(tab) => {
          toolEditorActiveTab = tab;
        }}
        onPatch={(patch) => store.patchToolDraft?.(patch)}
        onSourceDrop={stageToolEditorSourceDrop}
        onToggleEnabled={toggleFocusedToolEnabled}
        onCopySourceUuid={(uuid) => copyComponentSource(uuid)}
        onUnlinkSource={() => store.unlinkToolDraftSource?.()}
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
        onSelectionCleared={() =>
          announceBulkSelectionEmptied('essences', selectionClearedAnnouncement())}
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
        selectedComponentId={selectedComponent?.id || ''}
        {selectedSystemId}
        selectedSystemResolutionMode={selectedSystem?.resolutionMode || 'simple'}
        difficultyAxisProgressive={componentDifficultyAxisProgressive}
        categoryVocabulary={selectedSystem?.componentCategories || []}
        bind:browserState={componentBrowserState}
        dropEnabled={!!selectedSystemId && !!services?.onDropItem}
        onSearchChange={(term) => store.setItemSearch?.(term)}
        onSelectComponent={(id) => selectComponent(id)}
        onDropComponent={(data) => dropComponent(data)}
        onEditComponent={(id) => editComponent(id)}
        onSelectionCleared={() =>
          announceBulkSelectionEmptied('components', selectionClearedAnnouncement())}
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
        selectedSystemName={selectedSystem?.name || ''}
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
        onSelectionCleared={() =>
          announceBulkSelectionEmptied('recipes', selectionClearedAnnouncement())}
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
        {#if currentView === 'tags' && selectedSystem}
          <section class="manager-inspector-card" data-tags-evidence="at-a-glance">
            <h3 class="manager-card-title">
              {text('FABRICATE.Admin.Manager.TagsCategories.AtAGlance', 'Vocabulary at a glance')}
            </h3>
            <div class="manager-fact-grid">
              <div class="manager-fact" data-tags-category-fact="recipe-categories">
                <span class="manager-fact-line"
                  ><strong>{tagCategoryCounts.recipeCategories}</strong>
                  <span class="manager-fact-label"
                    >{text(
                      'FABRICATE.Admin.Manager.TagsCategories.RecipeCategories',
                      'Recipe categories'
                    )}</span
                  ></span
                >
              </div>
              <div class="manager-fact" data-tags-category-fact="component-categories">
                <span class="manager-fact-line"
                  ><strong>{tagCategoryCounts.componentCategories}</strong>
                  <span class="manager-fact-label"
                    >{text(
                      'FABRICATE.Admin.Manager.TagsCategories.ComponentCategories',
                      'Component categories'
                    )}</span
                  ></span
                >
              </div>
              <div class="manager-fact" data-tags-category-fact="item-tags">
                <span class="manager-fact-line"
                  ><strong>{tagCategoryCounts.itemTags}</strong>
                  <span class="manager-fact-label"
                    >{text(
                      'FABRICATE.Admin.Manager.TagsCategories.ItemTags',
                      'Component tags'
                    )}</span
                  ></span
                >
              </div>
              <div class="manager-fact" data-tags-category-fact="references">
                <span class="manager-fact-line"
                  ><strong
                    >{tagCategoryCounts.categoryReferences +
                      tagCategoryCounts.componentCategoryReferences +
                      tagCategoryCounts.tagReferences}</strong
                  >
                  <span class="manager-fact-label"
                    >{text(
                      'FABRICATE.Admin.Manager.TagsCategories.TotalReferences',
                      'Total references'
                    )}</span
                  ></span
                >
              </div>
            </div>
          </section>

          <ExplainerCard
            icon="fas fa-circle-question"
            title={tagsHelp.title}
            items={tagsHelp.items}
            dataAttr="data-tags-evidence"
            dataValue="how-it-works"
          />

          <ExplainerCard
            icon="fas fa-shield-halved"
            title={text(
              'FABRICATE.Admin.Manager.TagsCategories.ReferenceSafeTitle',
              'Reference-safe by default'
            )}
            items={tagsReferenceSafeItems}
            dataAttr="data-tags-evidence"
            dataValue="reference-safe"
          />
          <!-- `world-travel` belongs in this list even though it renders its own `manager-main`:
             the travel inspector is a BRANCH of the chain nested inside here, so leaving the
             route out makes that branch unreachable and the aside falls through to nothing.
             The symptom is silent — the route commits, its panel renders, and only the detail
             pane is missing, which is why only the view lab caught it. -->
        {:else if currentView === 'world' || currentView === 'environments' || currentView === 'environment-edit' || currentView === 'gathering-task-edit' || currentView === 'gathering-event-edit' || isWorldTravelRoute}
          {#if (currentView === 'environments' && displayedGatheringTab === 'tasks') || currentView === 'gathering-task-edit'}
            {#if selectedGatheringTask}
              {#if currentView !== 'gathering-task-edit'}
                <section class="manager-inspector-card" data-gathering-task-inspector>
                  <div class="manager-inspector-title-row is-hero-large">
                    <img
                      class="manager-recipe-preview"
                      src={gatheringTaskImage(selectedGatheringTask)}
                      alt=""
                    />
                    <div class="manager-inspector-copy">
                      <p class="manager-kicker">
                        {text(
                          'FABRICATE.Admin.Manager.Environment.Tasks.Selected',
                          'Selected gathering task'
                        )}
                      </p>
                      <h2
                        class="manager-inspector-name"
                        title={gatheringTaskName(selectedGatheringTask)}
                      >
                        {gatheringTaskName(selectedGatheringTask)}
                      </h2>
                      <div class="manager-chip-row">
                        <Chip
                          tone={selectedGatheringTask.enabled === false ? 'disabled' : 'active'}
                        >
                          {selectedGatheringTask.enabled === false
                            ? text('FABRICATE.Admin.Manager.StatusDisabled', 'Disabled')
                            : text('FABRICATE.Admin.Manager.StatusActive', 'Active')}
                        </Chip>
                        <Chip>{gatheringTaskAvailability(selectedGatheringTask)}</Chip>
                      </div>
                    </div>
                  </div>

                  <p class="manager-muted">
                    {truncateDescription(selectedGatheringTask.description) ||
                      text(
                        'FABRICATE.Admin.Manager.NoDescriptionAdded',
                        'No description has been added.'
                      )}
                  </p>
                </section>

                <section class="manager-inspector-card">
                  <h3 class="manager-card-title">
                    {text(
                      'FABRICATE.Admin.Manager.Environment.Tasks.Details',
                      'Gathering task details'
                    )}
                  </h3>
                  <div class="manager-fact-grid">
                    <div class="manager-fact" data-gathering-task-fact="biomes">
                      <!-- `{' '}` is the separator, not a literal space: a literal one is the last token -->
                      <!-- inside the `{#if}` and Svelte trims block-trailing whitespace, rendering "3Biome". -->
                      <!-- `prettier-ignore` preserves the LINE ANCHOR of the directive below, not -->
                      <!-- the render (issue 923): Prettier splits a `<span>` holding an `{#if}` -->
                      <!-- across several lines whatever the width, which moves the mustache off -->
                      <!-- the line `eslint-disable-next-line` is anchored to, so the suppression -->
                      <!-- stops applying and the violation resurfaces. The fence must be the LAST -->
                      <!-- comment before the element to take effect. The durable guard for this -->
                      <!-- whole class is `reportUnusedDisableDirectives: 'error'` in eslint.config.js. -->
                      <!-- eslint-disable-next-line svelte/no-useless-mustaches --><!-- prettier-ignore -->
                      <span class="manager-fact-line"><strong>{Array.isArray(selectedGatheringTask.biomes) && selectedGatheringTask.biomes.length > 0 ? selectedGatheringTask.biomes.length : text('FABRICATE.Admin.Manager.Environment.Tasks.AnyBiome', 'Any biome')}</strong>{#if Array.isArray(selectedGatheringTask.biomes) && selectedGatheringTask.biomes.length > 0}{' '}<span class="manager-fact-label">{text('FABRICATE.Admin.Manager.Environment.Biome', 'Biome')}</span>{/if}</span>
                    </div>
                    <div class="manager-fact" data-gathering-task-fact="drops">
                      <span class="manager-fact-line"
                        ><strong>{gatheringTaskDropRows(selectedGatheringTask).length}</strong>
                        <span class="manager-fact-label"
                          >{text('FABRICATE.Admin.Manager.Environment.Tasks.Drops', 'Drops')}</span
                        ></span
                      >
                    </div>
                    <div class="manager-fact" data-gathering-task-fact="environments">
                      <span class="manager-fact-line"
                        ><strong
                          >{activeGatheringTaskEnvironmentCount(selectedGatheringTask)}</strong
                        >
                        <span class="manager-fact-label"
                          >{text(
                            'FABRICATE.Admin.Manager.Environment.Tasks.ActiveEnvironments',
                            'Active environments'
                          )}</span
                        ></span
                      >
                    </div>
                  </div>
                </section>

                <section class="manager-inspector-card" data-task-drops-summary>
                  <h3 class="manager-card-title">
                    {text(
                      'FABRICATE.Admin.Manager.Environment.Tasks.DropsSummary',
                      'Drops summary'
                    )}
                  </h3>
                  {#if gatheringTaskDropRows(selectedGatheringTask).length === 0}
                    <p class="manager-muted" data-task-drops-summary-empty>
                      {text(
                        'FABRICATE.Admin.Manager.Environment.Tasks.NoDropsConfigured',
                        'No drops configured yet.'
                      )}
                    </p>
                  {:else}
                    <div class="manager-task-drops-summary-list" data-task-drops-summary-list>
                      {#each gatheringTaskDropRows(selectedGatheringTask) as drop (drop.id)}
                        <span class="manager-task-drop-summary-chip" data-task-drop-summary-chip>
                          <img
                            class="manager-task-drop-summary-thumb"
                            src={gatheringDropImage(drop)}
                            alt=""
                          />
                          <span
                            class="manager-task-drop-summary-label"
                            title={gatheringDropName(drop)}>{gatheringDropName(drop)}</span
                          >
                          <strong class="manager-task-drop-summary-percent"
                            >{Math.max(
                              1,
                              Math.min(100, Math.floor(Number(drop?.dropRate ?? 1)))
                            )}%</strong
                          >
                        </span>
                      {/each}
                    </div>
                  {/if}
                </section>

                <section
                  class="manager-inspector-card manager-task-environment-usage-card"
                  data-task-environment-usage
                >
                  <h3 class="manager-card-title">
                    {text(
                      'FABRICATE.Admin.Manager.Environment.Tasks.UsedInEnvironmentsCard',
                      'Used in environments'
                    )}
                  </h3>
                  {#if gatheringTaskReferencingEnvironments(selectedGatheringTask).length === 0}
                    <p class="manager-muted" data-task-environment-usage-empty>
                      {text(
                        'FABRICATE.Admin.Manager.Environment.Tasks.NotUsedInEnvironments',
                        'Not used in any environments yet.'
                      )}
                    </p>
                  {:else}
                    <div
                      class="manager-task-environment-usage-grid"
                      data-task-environment-usage-chips
                    >
                      {#each gatheringTaskReferencingEnvironments(selectedGatheringTask) as environment (environment.id)}
                        <article class="manager-task-environment-usage-card">
                          <img
                            class="manager-task-environment-usage-thumb"
                            src={environmentImage(environment)}
                            alt=""
                          />
                          <span
                            class="manager-task-environment-usage-name"
                            title={environmentName(environment)}
                            >{environmentName(environment)}</span
                          >
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
                      <h3 class="manager-card-title">
                        {text(
                          'FABRICATE.Admin.Manager.Environment.Tasks.SelectedDrop',
                          'Selected drop rule'
                        )}
                      </h3>
                      <div class="manager-inspector-title-row">
                        <img
                          class="manager-recipe-preview"
                          src={gatheringDropImage(selectedGatheringDrop)}
                          alt=""
                        />
                        <div class="manager-inspector-copy">
                          <h2 class="manager-inspector-name">
                            {gatheringDropName(selectedGatheringDrop)}
                          </h2>
                          <p class="manager-muted">
                            {text(
                              'FABRICATE.Admin.Manager.Environment.Tasks.ModifiersApplyOnlyThisDrop',
                              'Modifiers below apply only to this drop.'
                            )}
                          </p>
                        </div>
                      </div>
                      <div class="manager-drop-editor-actions">
                        <ManagerButton
                          aria-label={text(
                            'FABRICATE.Admin.Manager.Environment.Tasks.DuplicateDrop',
                            'Duplicate'
                          )}
                          onclick={() => duplicateGatheringTaskDrop(selectedGatheringDrop.id)}
                        >
                          <i class="fas fa-copy" aria-hidden="true"></i>
                          <span
                            >{text(
                              'FABRICATE.Admin.Manager.Environment.Tasks.DuplicateDrop',
                              'Duplicate'
                            )}</span
                          >
                        </ManagerButton>
                        <ManagerButton
                          role="danger"
                          aria-label={text(
                            'FABRICATE.Admin.Manager.Environment.Tasks.DeleteDrop',
                            'Delete'
                          )}
                          onclick={() => deleteGatheringTaskDrop(selectedGatheringDrop.id)}
                        >
                          <i class="fas fa-trash" aria-hidden="true"></i>
                          <span
                            >{text(
                              'FABRICATE.Admin.Manager.Environment.Tasks.DeleteDrop',
                              'Delete'
                            )}</span
                          >
                        </ManagerButton>
                      </div>
                    </section>

                    <div class="manager-drop-inspector-divider" aria-hidden="true"></div>

                    <div class="manager-drop-inspector-scroll">
                      <section class="manager-inspector-card manager-drop-editor-card">
                        <div class="manager-drop-editor-values">
                          <label
                            class="manager-field manager-drop-rate-editor"
                            data-gathering-drop-inspector-rate
                          >
                            <span
                              >{text(
                                'FABRICATE.Admin.Manager.Environment.Tasks.DropChance',
                                'Drop chance'
                              )}</span
                            >
                            <!--
                    The shared control (issue 883). This inspector used to hand-roll the same
                    track/fill/range structure the drop ROWS render through `ChanceSlider`, and
                    re-derive the same `--fab-drop-rate-value` / `--fab-drop-rate-color` inline.
                    `min` stays 0 here: a task drop has a real "none" tier at 0, unlike a
                    gathering event.
                  -->
                            <ChanceSlider
                              value={gatheringDropRateValue(selectedGatheringDrop)}
                              numberLabel={text(
                                'FABRICATE.Admin.Manager.Environment.Tasks.DropChancePercent',
                                'Drop chance percent'
                              )}
                              rangeLabel={text(
                                'FABRICATE.Admin.Manager.Environment.Tasks.DropChance',
                                'Drop chance'
                              )}
                              resolveColor={gatheringDropRateTierColor}
                              controlClass={gatheringDropRateTierClass(
                                selectedGatheringDrop.dropRate
                              )}
                              stopPropagation={true}
                              onChange={(dropRate) =>
                                updateGatheringTaskDrop(selectedGatheringDrop.id, { dropRate })}
                            />
                          </label>

                          <label
                            class="manager-field manager-drop-count-editor"
                            data-gathering-drop-inspector-count
                          >
                            <span
                              >{text(
                                'FABRICATE.Admin.Manager.Environment.Tasks.DropQuantityColumn',
                                'Count'
                              )}</span
                            >
                            <input
                              type="text"
                              inputmode="numeric"
                              pattern={'[1-9][0-9]{0,2}'}
                              value={gatheringDropCountValue(selectedGatheringDrop)}
                              aria-label={text(
                                'FABRICATE.Admin.Manager.Environment.Tasks.DropQuantityColumn',
                                'Count'
                              )}
                              oninput={(event) =>
                                onGatheringDropCountInput(selectedGatheringDrop.id, event)}
                              onblur={(event) =>
                                onGatheringDropCountBlur(selectedGatheringDrop, event)}
                              onkeydown={(event) =>
                                onGatheringDropCountKeydown(selectedGatheringDrop, event)}
                            />
                          </label>
                        </div>
                      </section>

                      {#each ['biome', 'timeOfDay', 'weather'] as kind (kind)}
                        {@const cardTitle = gatheringModifierCardTitle(kind, 'task')}
                        {@const cardHint = gatheringModifierCardHint(kind, 'task')}
                        {@const availableConditions = gatheringConditionAvailableOptions(
                          selectedGatheringDrop,
                          kind
                        )}
                        {@const pickerSelection = gatheringDropModifierPickerSelection(kind)}
                        {@const attachedModifiers = gatheringConditionModifierRows(
                          selectedGatheringDrop,
                          kind
                        )}
                        <section
                          class="manager-inspector-card manager-drop-editor-condition-modifier-card"
                          data-gathering-drop-condition-modifiers={kind}
                        >
                          <header class="manager-character-modifier-row-card-header">
                            <div class="manager-character-modifier-row-card-heading">
                              <h3 class="manager-card-title">{cardTitle}</h3>
                              <p class="manager-muted">{cardHint}</p>
                            </div>
                          </header>
                          <div
                            class="manager-condition-modifier-add-row"
                            data-gathering-drop-condition-modifier-picker={kind}
                          >
                            <label class="manager-field manager-condition-modifier-picker">
                              <span class="visually-hidden"
                                >{text(
                                  'FABRICATE.Admin.Manager.Environment.Tasks.ConditionPickerLabel',
                                  'Condition'
                                )}</span
                              >
                              <select
                                value={pickerSelection}
                                disabled={availableConditions.length === 0}
                                data-tooltip={availableConditions.length === 0
                                  ? text(
                                      'FABRICATE.Admin.Manager.Environment.Tasks.AllConditionsAdded',
                                      'All conditions already added.'
                                    )
                                  : null}
                                onchange={(event) =>
                                  setGatheringDropModifierPickerSelection(
                                    kind,
                                    event.currentTarget.value
                                  )}
                              >
                                {#each availableConditions as option (option.id)}
                                  <option value={option.id}>{option.label || option.id}</option>
                                {/each}
                              </select>
                            </label>
                            <button
                              type="button"
                              class="manager-icon-button"
                              aria-label={text(
                                'FABRICATE.Admin.Manager.Environment.Tasks.AddConditionModifier',
                                'Add modifier'
                              )}
                              title={text(
                                'FABRICATE.Admin.Manager.Environment.Tasks.AddConditionModifier',
                                'Add modifier'
                              )}
                              disabled={availableConditions.length === 0 || !pickerSelection}
                              data-tooltip={availableConditions.length === 0
                                ? text(
                                    'FABRICATE.Admin.Manager.Environment.Tasks.AllConditionsAdded',
                                    'All conditions already added.'
                                  )
                                : null}
                              onclick={() =>
                                addGatheringDropModifier(
                                  selectedGatheringDrop.id,
                                  kind,
                                  pickerSelection
                                )}
                            >
                              <i class="fas fa-plus" aria-hidden="true"></i>
                            </button>
                          </div>
                          <div class="manager-condition-modifier-row-list">
                            {#each attachedModifiers as modifier (modifier.id)}
                              <article
                                class={`manager-condition-modifier-row-reference ${gatheringModifierValueClass(modifier)}`}
                                data-gathering-drop-modifier-id={modifier.id}
                              >
                                <header class="manager-character-modifier-row-reference-header">
                                  <span class="manager-character-modifier-icon">
                                    <i
                                      class={gatheringModifierKindIcon(kind, modifier.conditionId)}
                                      aria-hidden="true"
                                    ></i>
                                  </span>
                                  <span class="manager-character-modifier-row-reference-label"
                                    >{gatheringConditionLabel(kind, modifier.conditionId) ||
                                      modifier.conditionId}</span
                                  >
                                  <label class="manager-condition-modifier-value">
                                    <span class="visually-hidden"
                                      >{text(
                                        'FABRICATE.Admin.Manager.Environment.Tasks.ModifierValue',
                                        'Modifier value'
                                      )}</span
                                    >
                                    <input
                                      type="text"
                                      inputmode="numeric"
                                      value={gatheringModifierDisplayValue(modifier)}
                                      aria-label={text(
                                        'FABRICATE.Admin.Manager.Environment.Tasks.ModifierValue',
                                        'Modifier value'
                                      )}
                                      oninput={(event) =>
                                        updateGatheringDropModifier(
                                          selectedGatheringDrop.id,
                                          kind,
                                          modifier.id,
                                          signedToOperatorValue(event.currentTarget.value)
                                        )}
                                      onkeydown={(event) =>
                                        onGatheringDropModifierKeydown(
                                          selectedGatheringDrop.id,
                                          kind,
                                          modifier,
                                          event
                                        )}
                                    />
                                    <span aria-hidden="true">%</span>
                                  </label>
                                  <button
                                    type="button"
                                    class="manager-icon-button is-danger manager-character-modifier-row-reference-delete"
                                    aria-label={text(
                                      'FABRICATE.Admin.Manager.Environment.Tasks.DeleteModifier',
                                      'Delete modifier'
                                    )}
                                    onclick={() =>
                                      deleteGatheringDropModifier(
                                        selectedGatheringDrop.id,
                                        kind,
                                        modifier.id
                                      )}
                                  >
                                    <i class="fas fa-trash" aria-hidden="true"></i>
                                  </button>
                                </header>
                              </article>
                            {:else}
                              <EmptyState
                                compact
                                icon="fas fa-sliders"
                                title={text(
                                  'FABRICATE.Admin.Manager.Environment.Tasks.NoConditionModifiers',
                                  'No modifiers attached.'
                                )}
                              />
                            {/each}
                          </div>
                        </section>
                      {/each}

                      <section
                        class="manager-inspector-card manager-character-modifier-row-card"
                        data-gathering-drop-character-modifiers
                      >
                        <header class="manager-character-modifier-row-card-header">
                          <div class="manager-character-modifier-row-card-heading">
                            <h3 class="manager-card-title">
                              {text(
                                'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RowSectionTitle',
                                'Character modifiers'
                              )}
                            </h3>
                            <p class="manager-muted">
                              {text(
                                'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RowSectionHint',
                                'Modifiers adjust the final chance based on the attempting character.'
                              )}
                            </p>
                          </div>
                        </header>
                        <div class="manager-character-modifier-add-search-row">
                          <label
                            bind:this={characterModifierSearchAnchor}
                            class="manager-search is-compact manager-character-modifier-add-search"
                            data-gathering-drop-character-modifier-search
                          >
                            <i class="fas fa-search" aria-hidden="true"></i>
                            <input
                              type="search"
                              value={characterModifierSearchTerm}
                              oninput={(event) => {
                                characterModifierSearchTerm = event.currentTarget.value;
                              }}
                              placeholder={text(
                                'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.AddSearchPlaceholder',
                                'Search character modifiers...'
                              )}
                              aria-label={text(
                                'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.AddSearchLabel',
                                'Search character modifiers to add'
                              )}
                              disabled={selectedSystemModifiers.length === 0}
                              data-tooltip={selectedSystemModifiers.length === 0
                                ? text(
                                    'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.LibraryEmptyHint',
                                    'Add a modifier to the system library first to reference it here.'
                                  )
                                : null}
                            />
                            {#if characterModifierSearchSuggestions.length > 0}
                              <div
                                class="manager-tag-suggestions manager-character-modifier-add-suggestions"
                                class:is-above={characterModifierSearchOpenUp}
                                data-gathering-drop-character-modifier-suggestions
                              >
                                {#each characterModifierSearchSuggestions as option (option.id)}
                                  <button
                                    type="button"
                                    class="manager-tag-suggestion manager-character-modifier-add-suggestion"
                                    data-gathering-drop-character-modifier-suggestion={option.id}
                                    onclick={() =>
                                      pickCharacterModifierForRow(
                                        selectedGatheringDrop.id,
                                        option.id
                                      )}
                                  >
                                    <i class={option.icon || 'fa-solid fa-user'} aria-hidden="true"
                                    ></i>
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
                            <article
                              class="manager-character-modifier-row-reference"
                              data-gathering-drop-character-modifier-ref={ref.id}
                            >
                              <header class="manager-character-modifier-row-reference-header">
                                <span class="manager-character-modifier-icon"
                                  ><i class={characterModifierIconForRef(ref)} aria-hidden="true"
                                  ></i></span
                                >
                                <span class="manager-character-modifier-row-reference-label"
                                  >{characterModifierLabelForRef(ref)}</span
                                >
                                {#if !libraryEntry}
                                  <span
                                    class="manager-character-modifier-stale-warning"
                                    data-tooltip={text(
                                      'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.UnknownModifier',
                                      'Unknown modifier ({id})'
                                    ).replace('{id}', ref.modifierId)}
                                  >
                                    <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"
                                    ></i>
                                  </span>
                                {/if}
                                <label
                                  class={`manager-character-modifier-operator-select ${operatorClass}`}
                                >
                                  <span class="visually-hidden"
                                    >{text(
                                      'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Operator',
                                      'Operator'
                                    )}</span
                                  >
                                  <select
                                    value={ref.operator || '+'}
                                    onchange={(event) =>
                                      onUpdateDropCharacterModifier(
                                        selectedGatheringDrop.id,
                                        ref.id,
                                        { operator: event.currentTarget.value }
                                      )}
                                  >
                                    <option value="+"
                                      >{text(
                                        'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OperatorPositive',
                                        'Positive'
                                      )}</option
                                    >
                                    <option value="-"
                                      >{text(
                                        'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OperatorNegative',
                                        'Negative'
                                      )}</option
                                    >
                                  </select>
                                </label>
                                <button
                                  type="button"
                                  class="manager-icon-button is-danger manager-character-modifier-row-reference-delete"
                                  aria-label={text(
                                    'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.DeleteRowReference',
                                    'Delete character modifier reference'
                                  )}
                                  onclick={() =>
                                    onDeleteDropCharacterModifier(selectedGatheringDrop.id, ref.id)}
                                >
                                  <i class="fas fa-trash" aria-hidden="true"></i>
                                </button>
                              </header>
                              <CharacterModifierBoundsRow
                                min={ref.min}
                                max={ref.max}
                                onChange={(patch) =>
                                  onUpdateDropCharacterModifier(
                                    selectedGatheringDrop.id,
                                    ref.id,
                                    patch
                                  )}
                              />
                              <div class="manager-character-modifier-override-row">
                                <button
                                  type="button"
                                  class={`manager-status-toggle ${hasOverride ? 'is-on' : 'is-off'}`}
                                  aria-pressed={hasOverride}
                                  aria-label={text(
                                    'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideToggle',
                                    'Override?'
                                  )}
                                  onclick={() =>
                                    setCharacterModifierOverrideEnabled(
                                      selectedGatheringDrop.id,
                                      ref,
                                      !hasOverride,
                                      libraryEntry
                                    )}
                                >
                                  <span class="manager-status-toggle-track" aria-hidden="true">
                                    <span class="manager-status-toggle-knob"></span>
                                  </span>
                                  <span class="manager-status-toggle-label">
                                    {hasOverride
                                      ? text(
                                          'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideToggleOn',
                                          'Overridden'
                                        )
                                      : text(
                                          'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideToggle',
                                          'Override?'
                                        )}
                                  </span>
                                </button>
                              </div>
                              {#if hasOverride}
                                <p class="manager-muted manager-character-modifier-override-hint">
                                  {text(
                                    'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideHint',
                                    'Overrides the library expression for this row.'
                                  )}
                                </p>
                                <label
                                  class="manager-field"
                                  for={`drop-${selectedGatheringDrop.id}-character-modifier-${ref.id}-expression`}
                                >
                                  <span
                                    >{text(
                                      'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Expression',
                                      'Expression'
                                    )}</span
                                  >
                                  <input
                                    type="text"
                                    id={`drop-${selectedGatheringDrop.id}-character-modifier-${ref.id}-expression`}
                                    value={ref.expressionOverride || ''}
                                    oninput={(event) =>
                                      onUpdateDropCharacterModifier(
                                        selectedGatheringDrop.id,
                                        ref.id,
                                        { expressionOverride: event.currentTarget.value }
                                      )}
                                  />
                                </label>
                              {/if}
                            </article>
                          {:else}
                            <EmptyState
                              compact
                              icon="fas fa-sliders"
                              title={text(
                                'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RowEmpty',
                                'No character modifiers attached.'
                              )}
                            />
                          {/each}
                        </div>
                      </section>
                    </div>
                  </div>
                {:else}
                  <section class="manager-inspector-card" data-gathering-task-drop-inspector>
                    <h3 class="manager-card-title">
                      {text(
                        'FABRICATE.Admin.Manager.Environment.Tasks.SelectedDrop',
                        'Selected drop rule'
                      )}
                    </h3>
                    <p class="manager-muted">
                      {text(
                        'FABRICATE.Admin.Manager.Environment.Tasks.NoDrops',
                        'No drops have been added.'
                      )}
                    </p>
                  </section>
                {/if}
              {/if}
            {:else}
              <EmptyState
                icon="fas fa-list-check"
                title={text(
                  'FABRICATE.Admin.Manager.Environment.Tasks.SelectTask',
                  'Select a gathering task'
                )}
                hint={text(
                  'FABRICATE.Admin.Manager.Environment.Tasks.InspectorHint',
                  'The inspector shows gathering task availability, active environment matches, and drop summaries for the selected row.'
                )}
              />
            {/if}
          {:else if (currentView === 'environments' && displayedGatheringTab === 'encounters') || currentView === 'gathering-event-edit'}
            {#if currentView === 'gathering-event-edit' && editingGatheringEvent}
              <div class="manager-drop-inspector-stack" data-gathering-event-inspector-stack>
                <div class="manager-drop-inspector-scroll">
                  {#each ['biome', 'timeOfDay', 'weather'] as kind (kind)}
                    {@const cardTitle = gatheringModifierCardTitle(kind, 'event')}
                    {@const cardHint = gatheringModifierCardHint(kind, 'event')}
                    {@const availableConditions = gatheringConditionAvailableOptions(
                      editingGatheringEvent,
                      kind
                    )}
                    {@const pickerSelection = gatheringEventModifierPickerSelection(kind)}
                    {@const attachedModifiers = gatheringConditionModifierRows(
                      editingGatheringEvent,
                      kind
                    )}
                    <section
                      class="manager-inspector-card manager-drop-editor-condition-modifier-card"
                      data-gathering-event-condition-modifiers={kind}
                    >
                      <header class="manager-character-modifier-row-card-header">
                        <div class="manager-character-modifier-row-card-heading">
                          <h3 class="manager-card-title">{cardTitle}</h3>
                          <p class="manager-muted">{cardHint}</p>
                        </div>
                      </header>
                      <div
                        class="manager-condition-modifier-add-row"
                        data-gathering-event-condition-modifier-picker={kind}
                      >
                        <label class="manager-field manager-condition-modifier-picker">
                          <span class="visually-hidden"
                            >{text(
                              'FABRICATE.Admin.Manager.Environment.Tasks.ConditionPickerLabel',
                              'Condition'
                            )}</span
                          >
                          <select
                            value={pickerSelection}
                            disabled={availableConditions.length === 0}
                            data-tooltip={availableConditions.length === 0
                              ? text(
                                  'FABRICATE.Admin.Manager.Environment.Tasks.AllConditionsAdded',
                                  'All conditions already added.'
                                )
                              : null}
                            onchange={(event) =>
                              setGatheringEventModifierPickerSelection(
                                kind,
                                event.currentTarget.value
                              )}
                          >
                            {#each availableConditions as option (option.id)}
                              <option value={option.id}>{option.label || option.id}</option>
                            {/each}
                          </select>
                        </label>
                        <button
                          type="button"
                          class="manager-icon-button"
                          aria-label={text(
                            'FABRICATE.Admin.Manager.Environment.Tasks.AddConditionModifier',
                            'Add modifier'
                          )}
                          title={text(
                            'FABRICATE.Admin.Manager.Environment.Tasks.AddConditionModifier',
                            'Add modifier'
                          )}
                          disabled={availableConditions.length === 0 || !pickerSelection}
                          data-tooltip={availableConditions.length === 0
                            ? text(
                                'FABRICATE.Admin.Manager.Environment.Tasks.AllConditionsAdded',
                                'All conditions already added.'
                              )
                            : null}
                          onclick={() => addGatheringEventConditionModifier(kind, pickerSelection)}
                        >
                          <i class="fas fa-plus" aria-hidden="true"></i>
                        </button>
                      </div>
                      <div class="manager-condition-modifier-row-list">
                        {#each attachedModifiers as modifier (modifier.id)}
                          <article
                            class={`manager-condition-modifier-row-reference ${gatheringModifierValueClass(modifier)}`}
                            data-gathering-event-modifier-id={modifier.id}
                          >
                            <header class="manager-character-modifier-row-reference-header">
                              <span class="manager-character-modifier-icon">
                                <i
                                  class={gatheringModifierKindIcon(kind, modifier.conditionId)}
                                  aria-hidden="true"
                                ></i>
                              </span>
                              <span class="manager-character-modifier-row-reference-label"
                                >{gatheringConditionLabel(kind, modifier.conditionId) ||
                                  modifier.conditionId}</span
                              >
                              <label class="manager-condition-modifier-value">
                                <span class="visually-hidden"
                                  >{text(
                                    'FABRICATE.Admin.Manager.Environment.Tasks.ModifierValue',
                                    'Modifier value'
                                  )}</span
                                >
                                <input
                                  type="text"
                                  inputmode="numeric"
                                  value={gatheringModifierDisplayValue(modifier)}
                                  aria-label={text(
                                    'FABRICATE.Admin.Manager.Environment.Tasks.ModifierValue',
                                    'Modifier value'
                                  )}
                                  oninput={(event) =>
                                    updateGatheringEventConditionModifier(
                                      kind,
                                      modifier.id,
                                      signedToOperatorValue(event.currentTarget.value)
                                    )}
                                  onkeydown={(event) =>
                                    onGatheringEventModifierKeydown(kind, modifier, event)}
                                />
                                <span aria-hidden="true">%</span>
                              </label>
                              <button
                                type="button"
                                class="manager-icon-button is-danger manager-character-modifier-row-reference-delete"
                                aria-label={text(
                                  'FABRICATE.Admin.Manager.Environment.Tasks.DeleteModifier',
                                  'Delete modifier'
                                )}
                                onclick={() =>
                                  deleteGatheringEventConditionModifier(kind, modifier.id)}
                              >
                                <i class="fas fa-trash" aria-hidden="true"></i>
                              </button>
                            </header>
                          </article>
                        {/each}
                      </div>
                    </section>
                  {/each}

                  <section
                    class="manager-inspector-card manager-character-modifier-row-card"
                    data-gathering-event-character-modifiers
                  >
                    <header class="manager-character-modifier-row-card-header">
                      <div class="manager-character-modifier-row-card-heading">
                        <h3 class="manager-card-title">
                          {text(
                            'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RowSectionTitle',
                            'Character modifiers'
                          )}
                        </h3>
                        <p class="manager-muted">
                          {text(
                            'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RowSectionHint',
                            'Modifiers adjust the final chance based on the attempting character.'
                          )}
                        </p>
                      </div>
                    </header>
                    <div class="manager-character-modifier-add-search-row">
                      <label
                        bind:this={characterModifierSearchAnchor}
                        class="manager-search is-compact manager-character-modifier-add-search"
                        data-gathering-event-character-modifier-search
                      >
                        <i class="fas fa-search" aria-hidden="true"></i>
                        <input
                          type="search"
                          value={characterModifierSearchTerm}
                          oninput={(event) => {
                            characterModifierSearchTerm = event.currentTarget.value;
                          }}
                          placeholder={text(
                            'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.AddSearchPlaceholder',
                            'Search character modifiers...'
                          )}
                          aria-label={text(
                            'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.AddSearchLabel',
                            'Search character modifiers to add'
                          )}
                          disabled={selectedSystemModifiers.length === 0}
                          data-tooltip={selectedSystemModifiers.length === 0
                            ? text(
                                'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.LibraryEmptyHint',
                                'Add a modifier to the system library first to reference it here.'
                              )
                            : null}
                        />
                        {#if eventCharacterModifierSearchSuggestions.length > 0}
                          <div
                            class="manager-tag-suggestions manager-character-modifier-add-suggestions"
                            class:is-above={characterModifierSearchOpenUp}
                            data-gathering-event-character-modifier-suggestions
                          >
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
                        <article
                          class="manager-character-modifier-row-reference"
                          data-gathering-event-character-modifier-ref={ref.id}
                        >
                          <header class="manager-character-modifier-row-reference-header">
                            <span class="manager-character-modifier-icon"
                              ><i class={characterModifierIconForRef(ref)} aria-hidden="true"
                              ></i></span
                            >
                            <span class="manager-character-modifier-row-reference-label"
                              >{characterModifierLabelForRef(ref)}</span
                            >
                            {#if !libraryEntry}
                              <span
                                class="manager-character-modifier-stale-warning"
                                data-tooltip={text(
                                  'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.UnknownModifier',
                                  'Unknown modifier ({id})'
                                ).replace('{id}', ref.modifierId)}
                              >
                                <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                              </span>
                            {/if}
                            <label
                              class={`manager-character-modifier-operator-select ${operatorClass}`}
                            >
                              <span class="visually-hidden"
                                >{text(
                                  'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Operator',
                                  'Operator'
                                )}</span
                              >
                              <select
                                value={ref.operator || '+'}
                                onchange={(event) =>
                                  onUpdateEventCharacterModifier(ref.id, {
                                    operator: event.currentTarget.value,
                                  })}
                              >
                                <option value="+"
                                  >{text(
                                    'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OperatorPositive',
                                    'Positive'
                                  )}</option
                                >
                                <option value="-"
                                  >{text(
                                    'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OperatorNegative',
                                    'Negative'
                                  )}</option
                                >
                              </select>
                            </label>
                            <button
                              type="button"
                              class="manager-icon-button is-danger manager-character-modifier-row-reference-delete"
                              aria-label={text(
                                'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.DeleteRowReference',
                                'Delete character modifier reference'
                              )}
                              onclick={() => onDeleteEventCharacterModifier(ref.id)}
                            >
                              <i class="fas fa-trash" aria-hidden="true"></i>
                            </button>
                          </header>
                          <CharacterModifierBoundsRow
                            min={ref.min}
                            max={ref.max}
                            onChange={(patch) => onUpdateEventCharacterModifier(ref.id, patch)}
                          />
                          <div class="manager-character-modifier-override-row">
                            <button
                              type="button"
                              class={`manager-status-toggle ${hasOverride ? 'is-on' : 'is-off'}`}
                              aria-pressed={hasOverride}
                              aria-label={text(
                                'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideToggle',
                                'Override?'
                              )}
                              onclick={() =>
                                setEventCharacterModifierOverrideEnabled(
                                  ref,
                                  !hasOverride,
                                  libraryEntry
                                )}
                            >
                              <span class="manager-status-toggle-track" aria-hidden="true">
                                <span class="manager-status-toggle-knob"></span>
                              </span>
                              <span class="manager-status-toggle-label">
                                {hasOverride
                                  ? text(
                                      'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideToggleOn',
                                      'Overridden'
                                    )
                                  : text(
                                      'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideToggle',
                                      'Override?'
                                    )}
                              </span>
                            </button>
                          </div>
                          {#if hasOverride}
                            <p class="manager-muted manager-character-modifier-override-hint">
                              {text(
                                'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideHint',
                                'Overrides the library expression for this row.'
                              )}
                            </p>
                            <label
                              class="manager-field"
                              for={`event-${editingGatheringEvent.id}-character-modifier-${ref.id}-expression`}
                            >
                              <span
                                >{text(
                                  'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Expression',
                                  'Expression'
                                )}</span
                              >
                              <input
                                id={`event-${editingGatheringEvent.id}-character-modifier-${ref.id}-expression`}
                                type="text"
                                value={ref.expressionOverride || ''}
                                oninput={(event) =>
                                  onUpdateEventCharacterModifier(ref.id, {
                                    expressionOverride: event.currentTarget.value,
                                  })}
                              />
                            </label>
                          {/if}
                        </article>
                      {:else}
                        <EmptyState
                          compact
                          icon="fas fa-sliders"
                          title={text(
                            'FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RowEmpty',
                            'No character modifiers attached.'
                          )}
                        />
                      {/each}
                    </div>
                  </section>
                </div>
              </div>
            {:else if selectedGatheringEvent && currentView !== 'gathering-event-edit'}
              <section class="manager-inspector-card" data-gathering-event-inspector>
                <div class="manager-inspector-title-row is-hero-large">
                  <img
                    class="manager-recipe-preview"
                    src={selectedGatheringEvent.img || DEFAULT_GATHERING_EVENT_IMG}
                    alt=""
                  />
                  <div class="manager-inspector-copy">
                    <p class="manager-kicker">
                      {text(
                        'FABRICATE.Admin.Manager.Environment.Events.Selected',
                        'Selected gathering event'
                      )}
                    </p>
                    <h2 class="manager-inspector-name" title={selectedGatheringEvent.name || ''}>
                      {selectedGatheringEvent.name ||
                        text(
                          'FABRICATE.Admin.Manager.Environment.Events.UnnamedEvent',
                          'Unnamed event'
                        )}
                    </h2>
                    <div class="manager-chip-row">
                      <Chip tone={selectedGatheringEvent.enabled === false ? 'disabled' : 'active'}>
                        {selectedGatheringEvent.enabled === false
                          ? text('FABRICATE.Admin.Manager.StatusDisabled', 'Disabled')
                          : text('FABRICATE.Admin.Manager.StatusActive', 'Active')}
                      </Chip>
                      {#if Array.isArray(selectedGatheringEvent.dangerTags) && selectedGatheringEvent.dangerTags.length > 0}
                        <Chip>{sortedDangerTags(selectedGatheringEvent.dangerTags).join(', ')}</Chip
                        >
                      {/if}
                    </div>
                  </div>
                </div>

                <p class="manager-muted">
                  {truncateDescription(selectedGatheringEvent.description) ||
                    text(
                      'FABRICATE.Admin.Manager.NoDescriptionAdded',
                      'No description has been added.'
                    )}
                </p>
              </section>

              <section class="manager-inspector-card">
                <h3 class="manager-card-title">
                  {text('FABRICATE.Admin.Manager.Environment.Events.Details', 'Event details')}
                </h3>
                <div class="manager-fact-grid">
                  <div class="manager-fact" data-gathering-event-fact="biomes">
                    <!-- `{' '}` is the separator, not a literal space: a literal one is the last token -->
                    <!-- inside the `{#if}` and Svelte trims block-trailing whitespace, rendering "3Biome". -->
                    <!-- `prettier-ignore` preserves the LINE ANCHOR of the directive below, not -->
                    <!-- the render (issue 923): Prettier splits a `<span>` holding an `{#if}` -->
                    <!-- across several lines whatever the width, which moves the mustache off -->
                    <!-- the line `eslint-disable-next-line` is anchored to, so the suppression -->
                    <!-- stops applying and the violation resurfaces. The fence must be the LAST -->
                    <!-- comment before the element to take effect. The durable guard for this -->
                    <!-- whole class is `reportUnusedDisableDirectives: 'error'` in eslint.config.js. -->
                    <!-- eslint-disable-next-line svelte/no-useless-mustaches --><!-- prettier-ignore -->
                    <span class="manager-fact-line"><strong>{Array.isArray(selectedGatheringEvent.biomes) && selectedGatheringEvent.biomes.length > 0 ? selectedGatheringEvent.biomes.length : text('FABRICATE.Admin.Manager.Environment.Events.AnyBiome', 'Any biome')}</strong>{#if Array.isArray(selectedGatheringEvent.biomes) && selectedGatheringEvent.biomes.length > 0}{' '}<span class="manager-fact-label">{text('FABRICATE.Admin.Manager.Environment.Biome', 'Biome')}</span>{/if}</span>
                  </div>
                  <div class="manager-fact" data-gathering-event-fact="drop-rate">
                    <span class="manager-fact-line"
                      ><strong
                        >{(() => {
                          const rate = Number(selectedGatheringEvent.dropRate);
                          if (!Number.isFinite(rate)) return '—';
                          return `${Math.max(1, Math.min(100, Math.floor(rate)))}%`;
                        })()}</strong
                      >
                      <span class="manager-fact-label"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Events.DropRate',
                          'Drop rate'
                        )}</span
                      ></span
                    >
                  </div>
                  <div class="manager-fact" data-gathering-event-fact="environments">
                    <span class="manager-fact-line"
                      ><strong
                        >{activeGatheringEventEnvironmentCount(selectedGatheringEvent)}</strong
                      >
                      <span class="manager-fact-label"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Events.ActiveEnvironments',
                          'Active environments'
                        )}</span
                      ></span
                    >
                  </div>
                </div>
              </section>

              <section
                class="manager-inspector-card manager-event-environment-usage-card"
                data-event-environment-usage
              >
                <h3 class="manager-card-title">
                  {text(
                    'FABRICATE.Admin.Manager.Environment.Events.UsedInEnvironmentsCard',
                    'Used in environments'
                  )}
                </h3>
                {#if gatheringEventReferencingEnvironments(selectedGatheringEvent).length === 0}
                  <p class="manager-muted" data-event-environment-usage-empty>
                    {text(
                      'FABRICATE.Admin.Manager.Environment.Events.NotUsedInEnvironments',
                      'Not used in any environments yet.'
                    )}
                  </p>
                {:else}
                  <div
                    class="manager-event-environment-usage-grid"
                    data-event-environment-usage-chips
                  >
                    {#each gatheringEventReferencingEnvironments(selectedGatheringEvent) as environment (environment.id)}
                      <article class="manager-event-environment-usage-card">
                        <img
                          class="manager-event-environment-usage-thumb"
                          src={environmentImage(environment)}
                          alt=""
                        />
                        <span
                          class="manager-event-environment-usage-name"
                          title={environmentName(environment)}>{environmentName(environment)}</span
                        >
                      </article>
                    {/each}
                  </div>
                {/if}
              </section>
            {:else if currentView !== 'gathering-event-edit'}
              <EmptyState
                icon="fas fa-masks-theater"
                title={text(
                  'FABRICATE.Admin.Manager.Environment.Events.SelectEvent',
                  'Select a gathering event'
                )}
                hint={text(
                  'FABRICATE.Admin.Manager.Environment.Events.InspectorHint',
                  'The inspector shows event availability, danger tags, drop rate, and active environment usage for the selected row.'
                )}
              />
            {/if}
          {:else if currentView === 'environments' && displayedGatheringTab === 'settings'}
            <section
              class="manager-inspector-card manager-gathering-rules-card"
              data-gathering-inspector-rules
            >
              <div class="manager-inspector-title-row">
                <span class="manager-inspector-icon" aria-hidden="true">
                  <i class="fas fa-scale-balanced"></i>
                </span>
                <div class="manager-inspector-copy">
                  <p class="manager-kicker">
                    {text('FABRICATE.Admin.Manager.Environment.Rules.Kicker', 'Gathering rules')}
                  </p>
                  <h2 class="manager-inspector-name">
                    {text('FABRICATE.Admin.Manager.Environment.Rules.Title', 'Rules')}
                  </h2>
                </div>
              </div>

              <div class="manager-rules-stack">
                <div class="manager-rule-row">
                  <span class="manager-rule-icon" aria-hidden="true"
                    ><i class="fas fa-gift"></i></span
                  >
                  <label class="manager-rule-copy" for="manager-gathering-rule-rewards">
                    <strong
                      >{text(
                        'FABRICATE.Admin.Manager.Environment.Rules.Rewards',
                        'Rewards'
                      )}</strong
                    >
                    <span
                      >{text(
                        'FABRICATE.Admin.Manager.Environment.Rules.RewardsDescription',
                        'Choose how rewards are granted.'
                      )}</span
                    >
                  </label>
                  <span class="manager-rule-field">
                    <select
                      id="manager-gathering-rule-rewards"
                      value={selectedGatheringRules.rewardSelectionMode}
                      onchange={(event) =>
                        updateSelectedGatheringRules({ rewardSelectionMode: event.target.value })}
                    >
                      <option value="highestRankedDrop"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.HighestRankedDrop',
                          'Highest ranked successful drop'
                        )}</option
                      >
                      <option value="allDrops"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.AllDrops',
                          'All successful drops'
                        )}</option
                      >
                      <option value="limitedDrops"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.LimitedDrops',
                          'Limit successful drops'
                        )}</option
                      >
                    </select>
                  </span>
                </div>
                {#if selectedGatheringRules.rewardSelectionMode === 'limitedDrops'}
                  <GatheringRuleLimitStepper
                    rule="rewardLimit"
                    value={selectedGatheringRules.rewardLimit}
                    onChange={(rewardLimit) => updateSelectedGatheringRules({ rewardLimit })}
                  />
                {/if}

                <div class="manager-rule-row">
                  <span class="manager-rule-icon" aria-hidden="true"
                    ><i class="fas fa-percent"></i></span
                  >
                  <label class="manager-rule-copy" for="manager-gathering-rule-drop-modifier-mode">
                    <strong
                      >{text(
                        'FABRICATE.Admin.Manager.Environment.Rules.DropModifierMode',
                        'Modifier mode'
                      )}</strong
                    >
                    <span
                      >{text(
                        'FABRICATE.Admin.Manager.Environment.Rules.DropModifierModeDescription',
                        'Choose how all drop and event modifiers (character, weather, time of day, biome) adjust a chance. This applies system-wide and cannot be overridden per modifier.'
                      )}</span
                    >
                  </label>
                  <span class="manager-rule-field">
                    <select
                      id="manager-gathering-rule-drop-modifier-mode"
                      value={selectedGatheringRules.dropModifierMode ?? 'additive'}
                      onchange={(event) =>
                        updateSelectedGatheringRules({ dropModifierMode: event.target.value })}
                    >
                      <option value="additive"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.DropModifierModeAdditive',
                          'Additive (percentage points)'
                        )}</option
                      >
                      <option value="multiplicative"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.DropModifierModeMultiplicative',
                          'Multiplicative (scale by percentage)'
                        )}</option
                      >
                    </select>
                  </span>
                </div>

                <div class="manager-rule-row">
                  <span class="manager-rule-icon" aria-hidden="true"
                    ><i class="fas fa-masks-theater"></i></span
                  >
                  <label class="manager-rule-copy" for="manager-gathering-rule-events">
                    <strong
                      >{text('FABRICATE.Admin.Manager.Environment.Rules.Events', 'Events')}</strong
                    >
                    <span
                      >{text(
                        'FABRICATE.Admin.Manager.Environment.Rules.EventsDescription',
                        'Choose how matching events are applied after a gathering roll.'
                      )}</span
                    >
                  </label>
                  <span class="manager-rule-field">
                    <select
                      id="manager-gathering-rule-events"
                      value={selectedGatheringRules.eventSelectionMode}
                      onchange={(event) =>
                        updateSelectedGatheringRules({ eventSelectionMode: event.target.value })}
                    >
                      <option value="highestRankedDrop"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.EventHighestRankedDrop',
                          'Highest ranked triggered event'
                        )}</option
                      >
                      <option value="allDrops"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.EventAllDrops',
                          'All triggered events'
                        )}</option
                      >
                      <option value="limitedDrops"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.EventLimitedDrops',
                          'Limit triggered events'
                        )}</option
                      >
                    </select>
                  </span>
                </div>
                {#if selectedGatheringRules.eventSelectionMode === 'limitedDrops'}
                  <GatheringRuleLimitStepper
                    rule="eventLimit"
                    value={selectedGatheringRules.eventLimit}
                    onChange={(eventLimit) => updateSelectedGatheringRules({ eventLimit })}
                  />
                {/if}

                <div class="manager-rule-row">
                  <span class="manager-rule-icon" aria-hidden="true"
                    ><i class="fas fa-scale-balanced"></i></span
                  >
                  <label class="manager-rule-copy" for="manager-gathering-rule-outcome">
                    <strong
                      >{text(
                        'FABRICATE.Admin.Manager.Environment.Rules.EventOutcome',
                        'Event outcome'
                      )}</strong
                    >
                    <span
                      >{text(
                        'FABRICATE.Admin.Manager.Environment.Rules.EventOutcomeDescription',
                        'Decide whether rolling an event still allows the gathering attempt to succeed.'
                      )}</span
                    >
                  </label>
                  <span class="manager-rule-field">
                    <select
                      id="manager-gathering-rule-outcome"
                      value={selectedGatheringRules.eventPolicy}
                      onchange={(event) =>
                        updateSelectedGatheringRules({ eventPolicy: event.target.value })}
                    >
                      <option value="successWithEvent"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.GatheringSucceeds',
                          'Gathering succeeds'
                        )}</option
                      >
                      <option value="failureWithEvent"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.GatheringFails',
                          'Gathering fails'
                        )}</option
                      >
                    </select>
                  </span>
                </div>

                <div class="manager-rule-row">
                  <span class="manager-rule-icon" aria-hidden="true"
                    ><i class="fas fa-eye"></i></span
                  >
                  <label class="manager-rule-copy" for="manager-gathering-rule-event-visibility">
                    <strong
                      >{text(
                        'FABRICATE.Admin.Manager.Environment.Rules.EventVisibility',
                        'Event visibility'
                      )}</strong
                    >
                    <span
                      >{text(
                        'FABRICATE.Admin.Manager.Environment.Rules.EventVisibilityDescription',
                        'Control how much event information players see.'
                      )}</span
                    >
                  </label>
                  <span class="manager-rule-field">
                    <select
                      id="manager-gathering-rule-event-visibility"
                      value={selectedGatheringRules.eventVisibility ?? 'encounterChance'}
                      onchange={(event) =>
                        updateSelectedGatheringRules({ eventVisibility: event.target.value })}
                    >
                      <option value="dangerLevelOnly"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.EventVisibilityDangerOnly',
                          'Danger level only'
                        )}</option
                      >
                      <option value="encounterChance"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.EventVisibilityEncounter',
                          'Encounter chance'
                        )}</option
                      >
                      <option value="full"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.EventVisibilityFull',
                          'Full details'
                        )}</option
                      >
                    </select>
                  </span>
                </div>

                <div class="manager-rule-row">
                  <span class="manager-rule-icon" aria-hidden="true"
                    ><i class="fas fa-screwdriver-wrench"></i></span
                  >
                  <label class="manager-rule-copy" for="manager-gathering-rule-tool-breakage">
                    <strong
                      >{text(
                        'FABRICATE.Admin.Manager.Environment.Rules.ToolBreakageOutcome',
                        'Tool breakage outcome'
                      )}</strong
                    >
                    <span
                      >{text(
                        'FABRICATE.Admin.Manager.Environment.Rules.ToolBreakageDescription',
                        'Decide whether a broken tool fails the gathering attempt or only reports the breakage.'
                      )}</span
                    >
                  </label>
                  <span class="manager-rule-field">
                    <select
                      id="manager-gathering-rule-tool-breakage"
                      value={selectedGatheringRules.toolBreakagePolicy ?? 'failureOnBreak'}
                      onchange={(event) =>
                        updateSelectedGatheringRules({ toolBreakagePolicy: event.target.value })}
                    >
                      <option value="failureOnBreak"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.ToolFailureOnBreak',
                          'Attempt fails on break'
                        )}</option
                      >
                      <option value="successDespiteBreak"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.ToolSuccessDespiteBreak',
                          'Attempt succeeds despite break'
                        )}</option
                      >
                    </select>
                  </span>
                </div>

                <div class="manager-rule-row">
                  <span class="manager-rule-icon" aria-hidden="true"
                    ><i class="fas fa-mountain-sun"></i></span
                  >
                  <label class="manager-rule-copy" for="manager-gathering-rule-biome-aggregation">
                    <strong
                      >{text(
                        'FABRICATE.Admin.Manager.Environment.Rules.BiomeModifiers',
                        'Biome modifiers'
                      )}</strong
                    >
                    <span
                      >{text(
                        'FABRICATE.Admin.Manager.Environment.Rules.BiomeModifiersDescription',
                        'Decide how multiple matching biome modifiers combine into one drop-rate adjustment.'
                      )}</span
                    >
                  </label>
                  <span class="manager-rule-field">
                    <select
                      id="manager-gathering-rule-biome-aggregation"
                      value={selectedGatheringRules.biomeModifierAggregation ?? 'strongestOfEach'}
                      onchange={(event) =>
                        updateSelectedGatheringRules({
                          biomeModifierAggregation: event.target.value,
                        })}
                    >
                      <option value="strongestOfEach"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.BiomeAggregationStrongestOfEach',
                          'Strongest of each'
                        )}</option
                      >
                      <option value="cumulative"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.BiomeAggregationCumulative',
                          'Cumulative'
                        )}</option
                      >
                      <option value="dominant"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.BiomeAggregationDominant',
                          'Dominant biome'
                        )}</option
                      >
                    </select>
                  </span>
                </div>

                <div class="manager-rule-row">
                  <span class="manager-rule-icon" aria-hidden="true"
                    ><i class="fas fa-eye-slash"></i></span
                  >
                  <label class="manager-rule-copy" for="manager-gathering-rule-blind-gate">
                    <strong
                      >{text(
                        'FABRICATE.Admin.Manager.Environment.Rules.BlindCandidateGate',
                        'Blind candidate gate'
                      )}</strong
                    >
                    <span
                      >{text(
                        'FABRICATE.Admin.Manager.Environment.Rules.BlindCandidateGateDescription',
                        'In blind mode, choose whether the generic gather only resolves to tasks the character can attempt, or to any matching task.'
                      )}</span
                    >
                  </label>
                  <span class="manager-rule-field">
                    <select
                      id="manager-gathering-rule-blind-gate"
                      value={selectedGatheringRules.blindCandidateGate ?? 'attemptableOnly'}
                      onchange={(event) =>
                        updateSelectedGatheringRules({ blindCandidateGate: event.target.value })}
                    >
                      <option value="attemptableOnly"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.BlindGateAttemptableOnly',
                          'Only attemptable tasks'
                        )}</option
                      >
                      <option value="allMatching"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.BlindGateAllMatching',
                          'Any matching task'
                        )}</option
                      >
                    </select>
                  </span>
                </div>

                <div class="manager-rule-row">
                  <span class="manager-rule-icon" aria-hidden="true"
                    ><i class="fas fa-wand-sparkles"></i></span
                  >
                  <label class="manager-rule-copy" for="manager-gathering-rule-reveal-policy">
                    <strong
                      >{text(
                        'FABRICATE.Admin.Manager.Environment.Rules.RevealPolicy',
                        'Blind reveal'
                      )}</strong
                    >
                    <span
                      >{text(
                        'FABRICATE.Admin.Manager.Environment.Rules.RevealPolicyDescription',
                        'Decide whether a blind task is revealed to the player after they attempt it.'
                      )}</span
                    >
                  </label>
                  <span class="manager-rule-field">
                    <select
                      id="manager-gathering-rule-reveal-policy"
                      value={selectedGatheringRules.revealPolicy ?? 'never'}
                      onchange={(event) =>
                        updateSelectedGatheringRules({ revealPolicy: event.target.value })}
                    >
                      <option value="never"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.RevealNever',
                          'Never reveal'
                        )}</option
                      >
                      <option value="onSuccess"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.RevealOnSuccess',
                          'Reveal on success'
                        )}</option
                      >
                      <option value="onAttempt"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.RevealOnAttempt',
                          'Reveal on any attempt'
                        )}</option
                      >
                    </select>
                  </span>
                </div>

                <div class="manager-rule-row">
                  <span class="manager-rule-icon" aria-hidden="true"
                    ><i class="fas fa-users-viewfinder"></i></span
                  >
                  <label class="manager-rule-copy" for="manager-gathering-rule-reveal-scope">
                    <strong
                      >{text(
                        'FABRICATE.Admin.Manager.Environment.Rules.RevealScope',
                        'Reveal scope'
                      )}</strong
                    >
                    <span
                      >{text(
                        'FABRICATE.Admin.Manager.Environment.Rules.RevealScopeDescription',
                        'Who learns the revealed task: just the actor, the controlling user, the party, or everyone.'
                      )}</span
                    >
                  </label>
                  <span class="manager-rule-field">
                    <select
                      id="manager-gathering-rule-reveal-scope"
                      value={selectedGatheringRules.revealScope ?? 'actor'}
                      onchange={(event) =>
                        updateSelectedGatheringRules({ revealScope: event.target.value })}
                    >
                      <option value="actor"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.RevealScopeActor',
                          'Actor'
                        )}</option
                      >
                      <option value="user"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.RevealScopeUser',
                          'User'
                        )}</option
                      >
                      <option value="party"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.RevealScopeParty',
                          'Party'
                        )}</option
                      >
                      <option value="global"
                        >{text(
                          'FABRICATE.Admin.Manager.Environment.Rules.RevealScopeGlobal',
                          'Everyone'
                        )}</option
                      >
                    </select>
                  </span>
                </div>
              </div>
            </section>
          {:else if isWorldTravelRoute}
            <section
              class="manager-inspector-card manager-travel-inspector"
              data-gathering-inspector-travel
              data-travel-inspector={worldTravelTab}
              aria-label={worldTravelTab === 'map'
                ? text(
                    'FABRICATE.Admin.Manager.Travel.MapLinksInspector',
                    'Selected map region link'
                  )
                : text('FABRICATE.Admin.Manager.Travel.RealmsInspector', 'Selected realm')}
            >
              {#if worldTravelTab === 'realms'}
                {#if selectedTravelRealm}
                  <div class="manager-inspector-title-row">
                    <span class="manager-inspector-icon" aria-hidden="true">
                      <i class="fas fa-map-location-dot"></i>
                    </span>
                    <div class="manager-inspector-copy">
                      <p class="manager-kicker">
                        {text(
                          'FABRICATE.Admin.Manager.Travel.Realms.InspectorKicker',
                          'Selected realm'
                        )}
                      </p>
                      <h2 class="manager-inspector-name">{selectedTravelRealm.name}</h2>
                    </div>
                  </div>

                  <div class="manager-travel-inspector-actions">
                    <ManagerButton
                      role="danger"
                      disabled={$viewState.travelSaving === true}
                      onclick={() => store.deleteRealm?.(selectedTravelRealm.id)}
                    >
                      <i class="fas fa-trash" aria-hidden="true"></i>
                      <span
                        >{text(
                          'FABRICATE.Admin.Manager.Travel.Realms.Delete',
                          'Delete realm'
                        )}</span
                      >
                    </ManagerButton>
                  </div>

                  <section class="manager-inspector-card">
                    <RealmNameField
                      name={selectedTravelRealm.name}
                      disabled={$viewState.travelSaving === true}
                      onRename={(name) => store.renameRealm?.(selectedTravelRealm.id, name)}
                    />
                  </section>

                  <section class="manager-inspector-card">
                    <h3 class="manager-card-title">
                      <i class="fas fa-seedling" aria-hidden="true"></i>
                      {text(
                        'FABRICATE.Admin.Manager.Travel.Realms.EnvironmentsCardTitle',
                        'Environments'
                      )}
                    </h3>
                    {#if selectedTravelRealm.environments.length > 0}
                      <ul class="manager-travel-region-environments">
                        {#each selectedTravelRealm.environments as environment (environment.id)}
                          <li>
                            <span class="manager-travel-region-thumb" aria-hidden="true">
                              {#if environment.img}<img src={environment.img} alt="" />{:else}<i
                                  class="fas fa-seedling"
                                ></i>{/if}
                            </span>
                            <span class="manager-travel-region-item-name">{environment.name}</span>
                          </li>
                        {/each}
                      </ul>
                    {:else}
                      <p class="manager-muted">
                        {text(
                          'FABRICATE.Admin.Manager.Travel.Realms.NoEnvironments',
                          'No environments include this realm yet.'
                        )}
                      </p>
                    {/if}
                  </section>

                  <section class="manager-inspector-card">
                    <h3 class="manager-card-title">
                      <i class="fas fa-people-group" aria-hidden="true"></i>
                      {text(
                        'FABRICATE.Admin.Manager.Travel.Realms.PartiesCardTitle',
                        'Parties in this realm'
                      )}
                    </h3>
                    {#if selectedTravelRealm.parties.length > 0}
                      <ul class="manager-travel-region-parties">
                        {#each selectedTravelRealm.parties as party (party.id)}
                          <li>
                            <span class="manager-travel-region-thumb" aria-hidden="true">
                              {#if party.img}<img src={party.img} alt="" />{:else}<i
                                  class="fas fa-people-group"
                                ></i>{/if}
                            </span>
                            <span class="manager-travel-region-item-name">{party.name}</span>
                          </li>
                        {/each}
                      </ul>
                    {:else}
                      <p class="manager-muted">
                        {text(
                          'FABRICATE.Admin.Manager.Travel.Realms.NoParties',
                          'No parties are currently in this realm.'
                        )}
                      </p>
                    {/if}
                  </section>
                {:else}
                  <p class="manager-muted">
                    {text(
                      'FABRICATE.Admin.Manager.Travel.Inspector.RealmsPlaceholder',
                      'Select a realm to see its details.'
                    )}
                  </p>
                {/if}
              {:else if worldTravelTab === 'map'}
                {#if selectedMapRegion}
                  <section class="manager-inspector-card manager-map-link-region-card">
                    <div class="manager-inspector-title-row">
                      <span
                        class="manager-inspector-icon manager-map-link-inspector-swatch"
                        aria-hidden="true"
                        style={selectedMapRegion.color
                          ? `background:${selectedMapRegion.color};`
                          : ''}
                      ></span>
                      <div class="manager-inspector-copy">
                        <p class="manager-kicker">
                          {text(
                            'FABRICATE.Admin.Manager.Travel.MapLinks.InspectorKicker',
                            'Selected map region'
                          )}
                        </p>
                        <h2 class="manager-inspector-name">
                          {selectedMapRegion.name ||
                            text(
                              'FABRICATE.Admin.Manager.Travel.MapLinks.UnnamedRegion',
                              'Unnamed region'
                            )}
                        </h2>
                      </div>
                    </div>
                  </section>

                  <section class="manager-inspector-card">
                    <h3 class="manager-card-title">
                      <i class="fas fa-link" aria-hidden="true"></i>
                      {text(
                        'FABRICATE.Admin.Manager.Travel.MapLinks.LinkSectionTitle',
                        'Linked Fabricate realm'
                      )}
                    </h3>
                    {#if selectedMapRegion.linkedRegionId}
                      {@const linkedRealm = worldRealms.find(
                        (realm) => realm.id === selectedMapRegion.linkedRegionId
                      )}
                      <ul class="manager-travel-region-parties">
                        <li>
                          <span class="manager-travel-region-thumb" aria-hidden="true"
                            ><i class="fas fa-map-location-dot"></i></span
                          >
                          <span class="manager-travel-region-item-name"
                            >{linkedRealm?.name ||
                              text(
                                'FABRICATE.Admin.Manager.Travel.MapLinks.Stale',
                                'Unknown realm'
                              )}</span
                          >
                          {#if linkedRealm && !linkedRealm.enabled}
                            <Chip tone="disabled"
                              >{text(
                                'FABRICATE.Admin.Manager.Travel.DisabledChip',
                                'Disabled'
                              )}</Chip
                            >
                          {/if}
                        </li>
                      </ul>
                    {:else}
                      <p class="manager-muted">
                        {text(
                          'FABRICATE.Admin.Manager.Travel.MapLinks.NotLinked',
                          'This map region isn’t linked to a Fabricate realm.'
                        )}
                      </p>
                    {/if}
                  </section>

                  <section class="manager-inspector-card">
                    <h3 class="manager-card-title">
                      <i class="fas fa-map-location-dot" aria-hidden="true"></i>
                      {text(
                        'FABRICATE.Admin.Manager.Travel.MapLinks.PartiesInMapRegionTitle',
                        'Parties in this map region'
                      )}
                    </h3>
                    {#if selectedMapRegion.partiesInMapRegion?.length > 0}
                      <ul class="manager-travel-region-parties">
                        {#each selectedMapRegion.partiesInMapRegion as party (party.id)}
                          <li>
                            <span class="manager-travel-region-thumb" aria-hidden="true">
                              {#if party.img}<img src={party.img} alt="" />{:else}<i
                                  class="fas fa-people-group"
                                ></i>{/if}
                            </span>
                            <span class="manager-travel-region-item-name">{party.name}</span>
                          </li>
                        {/each}
                      </ul>
                    {:else}
                      <p class="manager-muted">
                        {text(
                          'FABRICATE.Admin.Manager.Travel.MapLinks.NoPartiesInMapRegion',
                          'No party travel actors are in this map region.'
                        )}
                      </p>
                    {/if}
                  </section>

                  <section class="manager-inspector-card">
                    <h3 class="manager-card-title">
                      <i class="fas fa-people-group" aria-hidden="true"></i>
                      {text(
                        'FABRICATE.Admin.Manager.Travel.MapLinks.PartiesInFabricateRegionTitle',
                        'Parties in this Fabricate realm'
                      )}
                    </h3>
                    {#if !selectedMapRegion.linkedRegionId}
                      <p class="manager-muted">
                        {text(
                          'FABRICATE.Admin.Manager.Travel.MapLinks.NotLinked',
                          'This map region isn’t linked to a Fabricate realm.'
                        )}
                      </p>
                    {:else if selectedMapRegion.partiesInFabricateRealm?.length > 0}
                      <ul class="manager-travel-region-parties">
                        {#each selectedMapRegion.partiesInFabricateRealm as party (party.id)}
                          <li>
                            <span class="manager-travel-region-thumb" aria-hidden="true">
                              {#if party.img}<img src={party.img} alt="" />{:else}<i
                                  class="fas fa-people-group"
                                ></i>{/if}
                            </span>
                            <span class="manager-travel-region-item-name">{party.name}</span>
                          </li>
                        {/each}
                      </ul>
                    {:else}
                      <p class="manager-muted">
                        {text(
                          'FABRICATE.Admin.Manager.Travel.MapLinks.NoPartiesInFabricateRegion',
                          'No parties are in this Fabricate realm.'
                        )}
                      </p>
                    {/if}
                  </section>
                {:else}
                  <p class="manager-muted">
                    {text(
                      'FABRICATE.Admin.Manager.Travel.Inspector.MapLinksPlaceholder',
                      'Select a region to map it to Scene Regions.'
                    )}
                  </p>
                {/if}
              {/if}
            </section>
          {:else if currentView === 'environments' && activeGatheringInspectorTab}
            <section
              class="manager-inspector-card"
              data-gathering-inspector-placeholder={activeGatheringInspectorTab.id}
            >
              <div class="manager-inspector-title-row is-hero-large">
                <span class="manager-inspector-icon is-hero-large" aria-hidden="true">
                  <i class={activeGatheringInspectorTab.icon}></i>
                </span>
                <div class="manager-inspector-copy">
                  <p class="manager-kicker">
                    {text(
                      'FABRICATE.Admin.Manager.Environment.GatheringTabs.Label',
                      'Gathering sections'
                    )}
                  </p>
                  <h2 class="manager-inspector-name">
                    {text(
                      activeGatheringInspectorTab.titleKey,
                      activeGatheringInspectorTab.titleFallback
                    )}
                  </h2>
                </div>
              </div>
              <p class="manager-muted">
                {text(
                  activeGatheringInspectorTab.hintKey,
                  activeGatheringInspectorTab.hintFallback
                )}
              </p>
            </section>
          {:else if selectedEnvironment}
            <section class="manager-inspector-card">
              <img
                class={`manager-environment-preview ${hasEnvironmentImage(selectedEnvironment) ? '' : 'is-fallback'}`}
                src={environmentImage(selectedEnvironment)}
                alt=""
              />
              <div class="manager-inspector-copy">
                <p class="manager-kicker">
                  {text('FABRICATE.Admin.Manager.Environment.Selected', 'Selected environment')}
                </p>
                <h2 class="manager-inspector-name" title={environmentName(selectedEnvironment)}>
                  {environmentName(selectedEnvironment)}
                </h2>
                <div class="manager-chip-row">
                  <Chip tone={selectedEnvironment.enabled === false ? 'disabled' : 'active'}
                    >{environmentStatusLabel(selectedEnvironment)}</Chip
                  >
                  <Chip>{environmentSelectionModeLabel(selectedEnvironment)}</Chip>
                  <Chip tone={selectedEnvironmentSceneState.tone}
                    >{selectedEnvironmentSceneState.label}</Chip
                  >
                </div>
              </div>

              <p class="manager-muted">
                {truncateDescription(selectedEnvironment.description) ||
                  text(
                    'FABRICATE.Admin.Manager.NoDescriptionAdded',
                    'No description has been added.'
                  )}
              </p>
            </section>

            <section class="manager-inspector-card">
              <h3 class="manager-card-title">
                {text('FABRICATE.Admin.Manager.Environment.Details', 'Environment details')}
              </h3>
              <div class="manager-fact-grid">
                {#each selectedEnvironmentFacts as fact (fact.id)}
                  <div class="manager-fact" data-environment-fact={fact.id}>
                    <span class="manager-fact-line"
                      ><strong>{fact.value}</strong>
                      <span class="manager-fact-label">{fact.label}</span></span
                    >
                  </div>
                {/each}
                {#if selectedEnvironment.sceneUuid}
                  <div class="manager-fact" data-environment-fact="scene">
                    <span class="manager-fact-line"
                      ><strong
                        >{selectedEnvironmentSceneState.name ||
                          selectedEnvironment.sceneUuid}</strong
                      >
                      <span class="manager-fact-label"
                        >{text('FABRICATE.Admin.Manager.Environment.Scene', 'Scene')}</span
                      ></span
                    >
                  </div>
                {/if}
              </div>
            </section>

            {#if environmentDirtyFor(selectedEnvironment) || environmentInvalidFor(selectedEnvironment) || $viewState.environmentSaveError}
              <section class="manager-inspector-card">
                <h3 class="manager-card-title">
                  {text('FABRICATE.Admin.Manager.Environment.DraftState', 'Draft state')}
                </h3>
                <div class="manager-feature-list">
                  {#if environmentDirtyFor(selectedEnvironment)}
                    <Chip tone="warning"
                      >{text('FABRICATE.Admin.Manager.Environment.Dirty', 'Unsaved')}</Chip
                    >
                  {/if}
                  {#if environmentInvalidFor(selectedEnvironment)}
                    <Chip tone="danger"
                      >{text(
                        'FABRICATE.Admin.Manager.Environment.ValidationCount',
                        '{count} validation issues'
                      ).replace('{count}', environmentValidationCount)}</Chip
                    >
                  {/if}
                </div>
                {#if $viewState.environmentSaveError}
                  <p class="manager-muted">{$viewState.environmentSaveError}</p>
                {/if}
              </section>
            {/if}
          {:else if environmentList.length === 0}
            <section
              class="manager-setup-card"
              aria-label={text(
                'FABRICATE.Admin.Manager.Environment.EmptySetup.Title',
                'Plan gathering content'
              )}
            >
              <div class="manager-setup-card-header">
                <i class="fas fa-seedling" aria-hidden="true"></i>
                <div>
                  <p class="manager-kicker">
                    {text(
                      'FABRICATE.Admin.Manager.Environment.EmptySetup.Kicker',
                      'Gathering setup'
                    )}
                  </p>
                  <h3>
                    {text(
                      'FABRICATE.Admin.Manager.Environment.EmptySetup.Title',
                      'Plan gathering content'
                    )}
                  </h3>
                </div>
              </div>
              <p class="manager-muted">
                {text(
                  'FABRICATE.Admin.Manager.Environment.EmptySetup.Hint',
                  'Gathering tasks and events give environments consistent activities, risks, and rewards across gathering locations.'
                )}
              </p>
              <ol class="manager-setup-list">
                <li>
                  {text(
                    'FABRICATE.Admin.Manager.Environment.EmptySetup.StepTasks',
                    'Define gathering tasks with their checks, timing, result groups, and failure outcomes.'
                  )}
                </li>
                <li>
                  {text(
                    'FABRICATE.Admin.Manager.Environment.EmptySetup.StepEvents',
                    'Prepare event options that can be reused across your locations.'
                  )}
                </li>
                <li>
                  {text(
                    'FABRICATE.Admin.Manager.Environment.EmptySetup.StepCreate',
                    'Create environments after the gathering task and event libraries are ready to attach.'
                  )}
                </li>
              </ol>
              <div
                class="manager-setup-links"
                aria-label={text(
                  'FABRICATE.Admin.Manager.Environment.EmptySetup.Resources',
                  'Environment resources'
                )}
              >
                <ManagerButton
                  tag="a"
                  href="https://mistersilver-uk.github.io/fabricate/gathering/environments"
                  target="_blank"
                  rel="noreferrer"
                >
                  <i class="fas fa-book-open" aria-hidden="true"></i>
                  <span
                    >{text(
                      'FABRICATE.Admin.Manager.Environment.EmptySetup.GatheringDocs',
                      'Gathering docs'
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
                      'FABRICATE.Admin.Manager.Environment.EmptySetup.Quickstart',
                      'Quickstart'
                    )}</span
                  >
                </ManagerButton>
              </div>
            </section>
          {:else}
            <EmptyState
              icon="fas fa-seedling"
              title={text(
                'FABRICATE.Admin.Manager.Environment.SelectEnvironment',
                'Select an environment'
              )}
              hint={text(
                'FABRICATE.Admin.Manager.Environment.InspectorHint',
                'The inspector shows scene imagery, task evidence, draft state, and existing actions for the selected row.'
              )}
            />
          {/if}
        {:else if currentView === 'essences' || currentView === 'essence-edit'}
          <!--
          Three mutually exclusive rail states, in priority order (issue 1036):

           1. the EDITOR's live preview, which is where the prototype's 330px panel sits —
              the shell already owns this column, so the editor does not grow a second one;
           2. the BULK EDIT panel, which REPLACES the single-essence inspector for as long
              as the selection is non-empty, at the same `> 0` threshold the Component and
              Recipe Studios use;
           3. `EssenceBrowserInspector`, extracted out of ~200 lines that used to be inlined
              here.

          The setup card and the no-selection empty state are unchanged and still last.
        -->
          {#if currentView === 'essence-edit' && essenceEditDraft}
            <EssenceBehaviorPreview
              essence={essenceEditDraft}
              effectTransferEnabled={showEssenceSourceUi}
              propertyMacrosEnabled={showEssencePropertyMacroUi}
              sourceName={essenceEditDraft.sourceName || ''}
              macroName={essenceEditDraft.macroName || ''}
              sampleComponentName={essenceEditDraft.componentUsageItems?.[0]?.name || ''}
            />
          {:else if currentView === 'essences' && essenceBulkSelectionCount > 0}
            <EssenceBulkEditPanel
              count={essenceBulkSelectionCount}
              selectedRows={essenceBulkSelectedRows}
              draft={essenceBulkDraft}
              applying={essenceBulkApplying}
              deleting={essenceBulkDeleting}
              deleteArmed={essenceBulkDeleteArmed}
              deleteOutcome={essenceBulkDeleteOutcome}
              onDraftChange={(next) => stageEssenceBulkDraft(next)}
              onClearSelection={() => clearEssenceBulkSelection()}
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
              onEdit={(id) => editEssence(id)}
              onDuplicate={(id) => duplicateSelectedEssence(id)}
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
          The bulk panel REPLACES the single-component inspector while the selection is
          non-empty (issue 772) — the prototype's `bulkOn` / `bulkOff` swap, at its
          `> 0` threshold. It sits FIRST so it wins over `selectedComponent`, which is
          always truthy once the library has rows. The setup card below cannot be masked by
          it: an empty `itemCards` forces an empty pruned selection.
        -->
          {#if componentBulkSelectionCount > 0}
            <ComponentBulkEditPanel
              count={componentBulkSelectionCount}
              categoryOptions={componentBulkCategoryOptions}
              tags={selectedSystem?.itemTags || []}
              showEssences={selectedSystem?.features?.essences === true}
              essenceDefinitions={selectedSystem?.essenceDefinitions || []}
              showProgressiveDifficulty={componentDifficultyAxisProgressive}
              selectedCards={componentBulkSelectedCards}
              draft={componentBulkDraft}
              applying={componentBulkApplying}
              deleting={componentBulkDeleting}
              deleteArmed={componentBulkDeleteArmed}
              deleteImpact={componentBulkDeleteImpact}
              deleteOutcome={componentBulkDeleteOutcome}
              onDraftChange={(next) => stageComponentBulkDraft(next)}
              onClearSelection={() => clearComponentBulkSelection()}
              onApply={() => applyComponentBulkEdit()}
              onArmDelete={() => armComponentBulkDelete()}
              onDisarmDelete={() => (componentBulkDeleteArmed = false)}
              onDelete={(ids) => deleteSelectedComponents(ids)}
            />
          {:else if selectedComponent}
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
          The bulk panel REPLACES the single-recipe inspector while the selection is
          non-empty (issue 1010), at the same `> 0` threshold the Component Studio uses. It
          sits FIRST so it wins over `selectedRecipe`, which is always truthy once the
          library has rows.
        -->
          {#if recipeBulkSelectionCount > 0}
            <RecipeBulkEditPanel
              count={recipeBulkSelectionCount}
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
              onClearSelection={() => clearRecipeBulkSelection()}
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
            tool={selectedLibraryTool}
            managedItems={selectedSystem?.managedItemOptions || []}
            prerequisiteOptions={selectedCharacterPrerequisites}
            authority={selectedSystem?.toolBreakage?.authority || 'toolSpecific'}
            onEdit={openToolEditor}
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
                <p class="manager-kicker">
                  {text('FABRICATE.Admin.Manager.Column.System', 'System')}
                </p>
                <h2 class="manager-inspector-name" title={selectedSystem.name}>
                  {selectedSystem.name}
                </h2>
                <div class="manager-chip-row">
                  <Chip tone="active">{resolutionModeLabel(selectedSystem.resolutionMode)}</Chip>
                  <Chip tone={selectedSystem.enabled === false ? 'disabled' : 'active'}>
                    {selectedSystem.enabled === false
                      ? text('FABRICATE.Admin.Manager.StatusDisabled', 'Disabled')
                      : text('FABRICATE.Admin.Manager.StatusActive', 'Active')}
                  </Chip>
                </div>
              </div>
            </div>

            <p class="manager-muted">
              {selectedSystem.description ||
                text(
                  'FABRICATE.Admin.Manager.NoDescriptionAdded',
                  'No description has been added.'
                )}
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
                    <!-- prettier-ignore -->
                    <span class="manager-fact-line">
                      <!-- `{' '}` is the separator between the leading span and the trailing label: -->
                      <!-- a literal space is the first token inside the `{#if}` and Svelte trims -->
                      <!-- block-leading whitespace, so the two would run together. -->
                      <!-- The fence above preserves the LINE ANCHOR of the directive below, not -->
                      <!-- the render (issue 923): Prettier splits the line below across three, -->
                      <!-- which moves the mustache off the line the directive is anchored to, -->
                      <!-- and the suppression stops applying. The durable guard for this whole -->
                      <!-- class is `reportUnusedDisableDirectives: 'error'` in eslint.config.js. -->
                      <!-- eslint-disable-next-line svelte/no-useless-mustaches -->
                      <span class="manager-fact-leading"><strong>{fact.value}</strong> {labelParts.lead}</span>{#if labelParts.rest}{' '}<span class="manager-fact-label">{labelParts.rest}</span>{/if}
                    </span>
                  {/if}
                </div>
              {/each}
            </div>
          </section>

          <section
            class="manager-inspector-card"
            aria-label={text('FABRICATE.Admin.Manager.EnabledFeatures', 'Enabled features')}
          >
            <h3 class="manager-card-title">
              {text('FABRICATE.Admin.Manager.EnabledFeatures', 'Enabled features')}
            </h3>
            {#if enabledFeatureLabels.length > 0}
              <div class="manager-feature-list">
                {#each enabledFeatureLabels as feature (feature)}
                  <Chip tone="active">{feature}</Chip>
                {/each}
              </div>
            {:else}
              <p class="manager-muted">
                {text(
                  'FABRICATE.Admin.Manager.NoOptionalFeatures',
                  'No optional features enabled.'
                )}
              </p>
            {/if}
          </section>

          {#if selectedGatheringConditionShortcuts.length > 0}
            <section
              class="manager-inspector-card manager-condition-shortcut-card"
              data-systems-gathering-conditions
              aria-label={text('FABRICATE.Admin.Manager.GlobalConditions', 'Global conditions')}
            >
              <h3 class="manager-card-title">
                {text('FABRICATE.Admin.Manager.GlobalConditions', 'Global conditions')}
              </h3>
              <div class="manager-condition-shortcut-list">
                {#each selectedGatheringConditionShortcuts as condition (condition.kind)}
                  <label
                    class="manager-field manager-condition-shortcut"
                    data-systems-gathering-condition={condition.kind}
                  >
                    <span class="manager-condition-shortcut-label">
                      <i class={condition.icon} aria-hidden="true"></i>
                      <span>{condition.label}</span>
                    </span>
                    <select
                      value={condition.setting.current}
                      onchange={(event) =>
                        updateSelectedGatheringCondition(condition.kind, event.currentTarget.value)}
                    >
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
          <section
            class="manager-setup-card"
            aria-label={text(
              'FABRICATE.Admin.Manager.LoadingSystems',
              'Loading crafting systems...'
            )}
          >
            <div class="manager-setup-card-header">
              <i class="fas fa-spinner" aria-hidden="true"></i>
              <div>
                <p class="manager-kicker">
                  {text('FABRICATE.Admin.Manager.LoadingSystemsKicker', 'Startup')}
                </p>
                <h3>
                  {text('FABRICATE.Admin.Manager.LoadingSystems', 'Loading crafting systems...')}
                </h3>
              </div>
            </div>
            <p class="manager-muted">
              {text(
                'FABRICATE.Admin.Manager.LoadingSystemsHint',
                'Fabricate is finishing startup before the system library is shown.'
              )}
            </p>
          </section>
        {:else if ($viewState.systems || []).length === 0}
          <section
            class="manager-setup-card"
            aria-label={text(
              'FABRICATE.Admin.Manager.EmptySetup.Title',
              'Set up your first system'
            )}
          >
            <div class="manager-setup-card-header">
              <i class="fas fa-compass" aria-hidden="true"></i>
              <div>
                <p class="manager-kicker">
                  {text('FABRICATE.Admin.Manager.EmptySetup.Kicker', 'First run')}
                </p>
                <h3>
                  {text('FABRICATE.Admin.Manager.EmptySetup.Title', 'Set up your first system')}
                </h3>
              </div>
            </div>
            <p class="manager-muted">
              {text(
                'FABRICATE.Admin.Manager.EmptySetup.Hint',
                'Create a crafting system, add item-backed components, then build recipes from those components.'
              )}
            </p>
            <ol class="manager-setup-list">
              <li>
                {text(
                  'FABRICATE.Admin.Manager.EmptySetup.StepSystem',
                  'Create a system for one crafting discipline or ruleset.'
                )}
              </li>
              <li>
                {text(
                  'FABRICATE.Admin.Manager.EmptySetup.StepComponents',
                  'Import world or compendium items as reusable components.'
                )}
              </li>
              <li>
                {text(
                  'FABRICATE.Admin.Manager.EmptySetup.StepRecipes',
                  'Add recipes that consume components and award results.'
                )}
              </li>
            </ol>
            <div
              class="manager-setup-links"
              aria-label={text('FABRICATE.Admin.Manager.EmptySetup.Resources', 'Resources')}
            >
              <ManagerButton
                tag="a"
                href="https://mistersilver-uk.github.io/fabricate/help/quickstart"
                target="_blank"
                rel="noreferrer"
              >
                <i class="fas fa-book-open" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.EmptySetup.Quickstart', 'Quickstart')}</span>
              </ManagerButton>
              <ManagerButton
                tag="a"
                href="https://mistersilver-uk.github.io/fabricate"
                target="_blank"
                rel="noreferrer"
              >
                <i class="fas fa-circle-question" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.EmptySetup.Docs', 'Docs')}</span>
              </ManagerButton>
            </div>
          </section>
        {:else}
          <EmptyState
            icon="fas fa-arrow-pointer"
            title={text('FABRICATE.Admin.Manager.SelectSystem', 'Select a system')}
            hint={text(
              'FABRICATE.Admin.Manager.InspectorHint',
              'The inspector shows counts, resolution mode, and enabled features for the selected system.'
            )}
          />
        {/if}
      </aside>
    {/if}
  </div>

  <ImportFolderMappingModal
    open={importMappingOpen}
    folders={importMappingFolders}
    componentCategories={selectedSystem?.componentCategories || []}
    itemTags={selectedSystem?.itemTags || []}
    onAddCategory={addComponentCategory}
    onCommit={commitImportFolderMapping}
    onClose={() => (importMappingOpen = false)}
  />

  <ImportReportModal
    open={importReportContent !== null}
    content={importReportContent}
    onClose={() => (importReportContent = null)}
  />

  <!--
    THE MANAGER'S ONE PERSISTENT LIVE REGION (issue 1157). It is the LAST child of
    `.fabricate-manager` and is never conditionally rendered, so it outlives every view, every
    browser and every bulk panel — which is the whole point: the actions it reports are the
    ones that destroy the surface they were performed from.

    It is EMPTY on mount. A region inserted into the DOM together with its text is not
    announced by most screen readers, so the region has to be there first and the text has to
    arrive later.

    The child is KEYED ON THE ANNOUNCEMENT OBJECT, which `announceBulkSelectionEmptied`
    replaces on every call. That is what makes "Selection cleared." speak the SECOND time:
    re-inserting identical text announces nothing, so the node is destroyed and recreated
    rather than having its text rewritten, and each announcement is a genuine insertion.
    `aria-atomic` then has the region read as one sentence rather than as a diff.

    `.visually-hidden` is declared under `.fabricate-manager` in `styles/fabricate.css`, which
    this element is inside; do not lift this region out of that root.
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
