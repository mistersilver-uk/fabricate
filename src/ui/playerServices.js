/**
 * The player shell's Foundry-facing service bag (issue 1906, Phase 4 of issue 1674).
 *
 * `createPlayerServices` is rebuilt on every `_buildServices()` call, so each window owns its own six
 * stores. The shell's instance state arrives as call-time accessors, because the station tool and
 * the interactable ref change on a re-show; every entry reads the world when it is called.
 */
// Reused rather than re-authored, so the bulk salvage/destroy progress toast cannot drift from the
// compendium import's (issue 859).
import { createDefaultProgressReporter } from '../systems/CompendiumImporter.js';
import {
  authorityUnavailableAvailability,
  authorityUnavailableRefusal,
} from '../systems/journalRunCommands.js';
import { withStationPresence } from '../systems/stationPresence.js';

import { projectRetainedClaim } from './presenters/retainedClaimProjection.js';
import { offerReleaseForRefusal } from './svelte/apps/journal/runRecovery.js';
import { createActorBarStore } from './svelte/stores/actorBarStore.svelte.js';
import { createAlchemyStore } from './svelte/stores/alchemyStore.svelte.js';
import { createCraftingSourcesStore } from './svelte/stores/craftingSourcesStore.svelte.js';
import { createCraftingStore } from './svelte/stores/craftingStore.svelte.js';
import { createInventoryStore } from './svelte/stores/inventoryStore.svelte.js';
import { createJournalStore } from './svelte/stores/journalStore.svelte.js';
import { confirmDialog, isGameMaster, localize, notifyWarn } from './svelte/util/foundryBridge.js';

/** Open run `runId` in the Journal, as a crafting outcome that left a reward to pick does
 *  (issue 1773). */
function journalRunNavigator(services, selectTab) {
  return (runId) => {
    if (runId) services.journal?.select?.(runId, 'crafting');
    selectTab('journal');
  };
}

// componentId is a per-system id, so the system is carried with it: a station from system A must
// not satisfy a system-B Tool sharing the string. The library Tool id is carried too (issue 1119),
// since an item-sourced Tool has no componentId.
function presentToolsFor(activeCanvasTool) {
  const { componentId, toolId, systemId } = activeCanvasTool ?? {};
  if (!systemId || (!componentId && !toolId)) return null;
  return {
    systemId,
    componentIds: componentId ? [componentId] : [],
    toolIds: toolId ? [toolId] : [],
  };
}

// The station rides every crafting and gathering Journal command as that command's own payload;
// nothing else carries it to the active GM (issues 2265, 2275).
function withStationCommand(command, presentTools) {
  if (!presentTools || !['crafting', 'gathering'].includes(command?.runType)) return command;
  return { ...command, payload: { ...command.payload, presentTools } };
}

// A per-call station view, so the shopping list's Tool consults agree with recipe detail.
function stationRecipeManager(presentTools) {
  return withStationPresence(game?.fabricate?.getRecipeManager?.() ?? null, presentTools);
}

/** A facade command the active GM runs; an absent facade answers the authority-unavailable refusal. */
function activeGmCommand(name) {
  return (opts = {}) =>
    game?.fabricate?.[name]?.(opts) ?? Promise.resolve(authorityUnavailableRefusal());
}

/** The seams that forward straight to `game.fabricate` and read none of the shell's state. */
function gameForwardingServices() {
  return {
    getCraftingSystemManager: () => game?.fabricate?.getCraftingSystemManager?.() ?? null,
    getGatheringDropBreakdown: (opts = {}) =>
      game?.fabricate?.getGatheringDropBreakdown?.(opts) ?? null,
    listInventoryForActor: (opts = {}) => game?.fabricate?.listInventoryForActor?.(opts) ?? null,
    // Learn one recipe from an owned recipe-item book (Inventory learn button).
    learnRecipeFromInventory: (opts = {}) =>
      game?.fabricate?.learnRecipeFromInventory?.(opts) ?? null,
    // An ACTOR ID, never a uuid, so the facade's `_resolveCraftingSources` gate — the only
    // ownership check on this path — is not bypassed (issue 675).
    salvageComponent: (opts = {}) => game?.fabricate?.salvageComponent?.(opts) ?? null,
    salvageComponents: (opts = {}) => game?.fabricate?.salvageComponents?.(opts) ?? null,
    destroyComponents: (opts = {}) => game?.fabricate?.destroyComponents?.(opts) ?? null,
    // A pure pass-through, exposed identically by the manager app: bulk destroy's consequence
    // sentence cannot fit a button label, so the caller composes the full confirm copy.
    confirmDialog: (options) => confirmDialog(options),
    // FRESH per bulk run, never a shared singleton: a second run would otherwise update the
    // first run's already-dismissed toast (issue 859).
    createProgressReporter: () => createDefaultProgressReporter(),
    listAlchemyForActor: (opts = {}) => game?.fabricate?.listAlchemyForActor?.(opts) ?? null,
    getSelectedAlchemySystemId: () => game?.fabricate?.getSelectedAlchemySystemId?.() ?? '',
    setSelectedAlchemySystemId: (id) => game?.fabricate?.setSelectedAlchemySystemId?.(id),
    listCraftingSourceActors: () => game?.fabricate?.listCraftingSourceActors?.() ?? [],
    getCraftingSourceActors: () => game?.fabricate?.getCraftingSourceActors?.() ?? [],
    getSelectedCraftingActorId: () => game?.fabricate?.getSelectedCraftingActorId?.() ?? '',
    setSelectedCraftingActorId: (id) => game?.fabricate?.setSelectedCraftingActorId?.(id),
    getCraftingComponentSourceIds: () => game?.fabricate?.getCraftingComponentSourceIds?.() ?? [],
    setCraftingComponentSourceIds: (ids) => game?.fabricate?.setCraftingComponentSourceIds?.(ids),
    getFavouriteRecipeIds: () => game?.fabricate?.getFavouriteRecipeIds?.() ?? [],
    toggleFavouriteRecipe: (id) => game?.fabricate?.toggleFavouriteRecipe?.(id) ?? [],
    // The setter's promise is RETURNED, not dropped: under `scope: user` this is a replicated
    // document write that can reject, and the store's revert-and-announce path needs to see it.
    getProgressiveResultOrder: () => game?.fabricate?.getProgressiveResultOrder?.() ?? {},
    setProgressiveResultOrder: (key, order) =>
      game?.fabricate?.setProgressiveResultOrder?.(key, order),
    // A live region, because a keyboard user reordering by chevron never sees a toast.
    progressiveOrderRevertMessage: () =>
      localize('FABRICATE.App.Crafting.Detail.StageOrderSaveFailed'),
    // Player-facing notification seam (a failed craft surfaces as a warning).
    notify: (message) => notifyWarn(message),
    // For a THROWN craft: the engine can throw on the currency-payment macro path, with no
    // result message to report.
    craftErrorMessage: () => localize('FABRICATE.App.Crafting.Notify.CraftFailed'),
    // The stores stay Foundry-free, so the i18n lookup an authority refusal needs
    // (`{success:false, reason}` carries no `message`) arrives as a seam too.
    localize: (key, data) => localize(key, data),
    listSelectableActors: () => game?.fabricate?.listSelectableActors?.() ?? [],
    getSelectedActorId: () => game?.fabricate?.getSelectedGatheringActorId?.() ?? '',
    setSelectedActorId: (id) => game?.fabricate?.setSelectedGatheringActorId?.(id),
    // CLIENT-scoped, so it persists per device rather than per user account; the getter defaults
    // to false, showing all, when the facade is unavailable.
    getHideUnavailableEnvironments: () =>
      game?.fabricate?.getHideUnavailableEnvironments?.() ?? false,
    setHideUnavailableEnvironments: (value) =>
      game?.fabricate?.setHideUnavailableEnvironments?.(value),
    getGatheringConditions: () => game?.fabricate?.getGatheringConditions?.() ?? null,
    dismissJournalRun: (opts = {}) => game?.fabricate?.dismissJournalRun?.(opts) ?? null,
    getDismissedJournalRunKeys: (opts = {}) =>
      game?.fabricate?.getDismissedJournalRunKeys?.(opts) ?? new Set(),
    getJournalRunAuthorityAvailability: () =>
      game?.fabricate?.getJournalRunAuthorityAvailability?.() ?? authorityUnavailableAvailability(),
    // The cached retained claim a GM may release, `null` for a player or when none is retained;
    // `reconcileJournalRunAuthority` stays the authorization boundary.
    getRetainedJournalClaim: () =>
      isGameMaster()
        ? projectRetainedClaim(game?.fabricate?.getJournalRunAuthorityAvailability?.()?.retained)
        : null,
    // Active-GM manual dispositions of a retained claim (issue 1648) and of an uncertain legacy
    // run. Each command refuses a non-active-GM caller, so these seams add no authorization.
    reconcileJournalRunAuthority: activeGmCommand('reconcileJournalRunAuthority'),
    reconcileUncertainJournalRun: activeGmCommand('reconcileUncertainJournalRun'),
    cancelCraftingRun: (opts = {}) => game?.fabricate?.cancelCraftingRun?.(opts) ?? null,
    getWorldTime: () => game?.fabricate?.getWorldTime?.() ?? 0,
    getWorldTimeComponents: (worldTime) =>
      game?.fabricate?.getWorldTimeComponents?.(worldTime) ?? null,
    getGatheringEconomy: (opts = {}) => game?.fabricate?.getGatheringEconomy?.(opts) ?? null,
    setGatheringEconomy: (opts = {}) => game?.fabricate?.setGatheringEconomy?.(opts),
    getGatheringStaminaState: (opts = {}) =>
      game?.fabricate?.getGatheringStaminaState?.(opts) ?? [],
    setGatheringStamina: (opts = {}) => game?.fabricate?.setGatheringStamina?.(opts),
    adjustGatheringStamina: (opts = {}) => game?.fabricate?.adjustGatheringStamina?.(opts),
    restockGatheringNode: (opts = {}) => game?.fabricate?.restockGatheringNode?.(opts),
    // Lets the gathering view re-resolve the live region only when a real travel marker moves.
    isTravelMarkerActor: (actorUuid) => {
      if (!actorUuid) return false;
      const parties = game?.fabricate?.getGatheringPartyStore?.()?.list?.() ?? [];
      return (Array.isArray(parties) ? parties : []).some(
        (party) => party?.travelActorUuid && String(party.travelActorUuid) === String(actorUuid)
      );
    },
  };
}

/**
 * @param {{ activeCanvasTool: () => object|null, scopedInteractableRef: () => object|null,
 *   selectTab: (tab: string) => void }} io the shell's state, read at call time
 */
export function createPlayerServices({ activeCanvasTool, scopedInteractableRef, selectTab }) {
  // Read per call, so every seam follows a re-show or close of the station session.
  const presentTools = () => presentToolsFor(activeCanvasTool());
  const withStation = (opts) => ({ ...opts, presentTools: presentTools() });
  const services = {
    getRecipeManager: () => stationRecipeManager(presentTools()),
    getActiveCanvasTool: () => activeCanvasTool() ?? null,
    listGatheringForActor: (opts = {}) =>
      game?.fabricate?.listGatheringForActor?.({
        presentTools: presentTools(),
        // The same ref the attempt carries, so the listing shows and gates on the pool the attempt
        // will decrement (issue 2048). Read per call, so a refresh follows a re-show or close.
        interactableRef: scopedInteractableRef(),
        ...opts,
      }) ?? null,
    startGatheringAttempt: (opts = {}) =>
      game?.fabricate?.startGatheringAttempt?.({
        presentTools: presentTools(),
        // Inert when null, where the engine uses the environment scope instead (issue 302).
        interactableRef: scopedInteractableRef(),
        ...opts,
      }) ?? null,
    // Every Foundry-facing call routes through the `game.fabricate` facade, so stores stay
    // Foundry-free. That is the rule for every seam in this bag.
    listCraftingForActor: (opts = {}) =>
      game?.fabricate?.listCraftingForActor?.(withStation(opts)) ?? null,
    // Synchronous, because the store's `selectedRecipe` $derived reads it without an async
    // round-trip; null when the facade is absent or the viewer may not see the recipe.
    hydrateCraftingRecipe: (opts = {}) =>
      game?.fabricate?.hydrateCraftingRecipe?.(withStation(opts)) ?? null,
    craftRecipe: (opts = {}) => game?.fabricate?.craftRecipe?.(withStation(opts)) ?? null,
    // Synchronous, so the store's `selectedCraftability` $derived reads it without a round-trip.
    evaluateSelectedSet: (opts = {}) =>
      game?.fabricate?.evaluateSelectedSet?.(withStation(opts)) ?? null,
    submitAlchemyAttempt: (opts = {}) =>
      game?.fabricate?.submitAlchemyAttempt?.(withStation(opts)) ?? null,
    listJournalForActor: (opts = {}) =>
      game?.fabricate?.listJournalForActor?.(withStation(opts)) ?? null,
    executeJournalRunCommand: (opts = {}) =>
      game?.fabricate?.executeJournalRunCommand?.(withStationCommand(opts, presentTools())) ?? null,
    advanceCraftingRun: (opts = {}) =>
      game?.fabricate?.advanceCraftingRun?.(withStation(opts)) ?? null,
    ...gameForwardingServices(),
    // The stores stay clear of `apps/journal/`, so the GM's release prompt reaches them as a seam.
    offerReleaseForRefusal: (result) => offerReleaseForRefusal({ result, services, localize }),
  };
  // One instance across renders, so the shell and the gathering tab share one selection state.
  services.actorBar = createActorBarStore({ services });
  // The component-sources store is created FIRST, so the crafting store can read the current
  // source ids off it as it loads.
  services.craftingSources = createCraftingSourcesStore({ services });
  services.crafting = createCraftingStore({ services });
  services.inventory = createInventoryStore({ services });
  // All three tab stores read the SAME actor and source selection, so they agree on what the
  // player owns; only the workbench and discipline state is local to this one.
  services.alchemy = createAlchemyStore({ services });
  // Both stores are the Crafting tab's singletons, so the selection lands before it renders.
  services.navigateToCraftingRecipe = (recipeId) => {
    if (recipeId) services.crafting?.select?.(recipeId);
    selectTab('crafting');
  };
  services.journal = createJournalStore({ services });
  services.navigateToJournalRun = journalRunNavigator(services, (tab) => selectTab(tab));
  return services;
}
