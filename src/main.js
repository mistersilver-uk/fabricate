// Import global stylesheet so Vite includes it in the module graph for HMR.
// In production builds, a Vite plugin resolves this to a no-op since Foundry
// loads the stylesheet via module.json's "styles" field instead.
import '../styles/fabricate.css';

import {
  TOOL_IMAGE_SENTINEL,
  linkedComponentFor,
  resolveToolDisplayImage,
  resolveToolDisplayName,
} from './models/toolDisplay.js';
import { findById, getDefinitionIndex } from './utils/definitionIndex.js';
import { RecipeManager } from './systems/RecipeManager.js';
import { CompendiumImporter, scopeStoreDelegate } from './systems/CompendiumImporter.js';
import { CraftingEngine } from './systems/CraftingEngine.js';
import { CraftingSystemManager } from './systems/CraftingSystemManager.js';
import { CraftingRunManager } from './systems/CraftingRunManager.js';
import { RunJournalBuilder } from './systems/RunJournalBuilder.js';
import { SalvageRunManager } from './systems/SalvageRunManager.js';
import { runContainersChanged } from './systems/runFlagInvalidation.js';
import { GatheringEnvironmentStore } from './systems/GatheringEnvironmentStore.js';
import { GatheringRealmStore } from './systems/GatheringRealmStore.js';
import { CharacterLibrariesStore } from './systems/CharacterLibrariesStore.js';
import {
  createComponentScopeStore,
  createEssenceScopeStore,
  createToolScopeStore
} from './systems/worldScopeStores.js';
import { CurrencyConfigStore } from './systems/CurrencyConfigStore.js';
import { GatheringPartyStore } from './systems/GatheringPartyStore.js';
import { GatheringLocationService } from './systems/GatheringLocationService.js';
import { revealGatheringRealm, hideGatheringRealm, getDiscoveredRealmIds } from './systems/gatheringRealmDiscovery.js';
import { buildLocationSummaryForViewer } from './systems/gatheringLocation.js';
import { getRealmRevealMode, isGatheringRealmsEnabled } from './systems/gatheringRealms.js';
import { GatheringRunManager } from './systems/GatheringRunManager.js';
import { GatheringGateAndCheckEvaluator } from './systems/GatheringGateAndCheckEvaluator.js';
import { GatheringRichStateService } from './systems/GatheringRichStateService.js';
import { secondsPerUnitFromCalendar, daysPerYearFromCalendar } from './systems/foundryCalendar.js';
import { resolveAdvanceSources } from './systems/advanceCraftingSources.js';
import { GatheringEngine } from './systems/GatheringEngine.js';
import { GatheringHookPublisher } from './systems/GatheringHookPublisher.js';
import { EVENT_SCENE_SOCKET, createEventSceneTrigger, routeEventSceneSocketMessage } from './systems/eventSceneCoordinator.js';
import { createDepletionRateLimiter, createGatheringNodeDepletionWriter, routeGatheringNodeDepleteMessage } from './systems/gatheringNodeSocket.js';
import { GatheringBlindRunStore } from './systems/GatheringBlindRunStore.js';
import { createBlindStartRateLimiter, createGatheringBlindStartWriter, routeGatheringBlindStartMessage } from './systems/gatheringBlindRunSocket.js';
import { applyAuthoredComplications, buildComplicationMacroContext, createComplicationDeliveryDedupe, createComplicationDeliveryWriter, createComplicationRateLimiter, isRunnableComplicationMacro, routeComplicationDeliveryMessage } from './systems/complicationSocket.js';
import { buildGmComplicationCardContent, gmComplicationCardEntries, rollGmComplicationEffect } from './systems/complicationRuntime.js';
import { renderDialog, viewScene, localize as bridgeLocalize, enrichToHtml, primeEnricherCache } from './ui/svelte/util/foundryBridge.js';
import { buildInteractiveRollOptions, promptBulkCheckRoll, promptCheckRoll } from './ui/svelte/apps/crafting/rollPrompt.js';
import { RecipeVisibilityService } from './systems/RecipeVisibilityService.js';
import { runStartupMaintenance } from './systems/startupMaintenance.js';
import { composeStartupPassList } from './systems/startupPassComposition.js';
import { ResolutionModeService } from './systems/ResolutionModeService.js';
import { CraftingListingBuilder } from './systems/CraftingListingBuilder.js';
import { activeRunStepState, buildStepRecipeView, resolveStepIngredientSet } from './systems/stepRecipeView.js';
import { InventoryListingBuilder } from './systems/InventoryListingBuilder.js';
import { BulkSalvageService } from './systems/BulkSalvageService.js';
import { BulkDestroyService } from './systems/BulkDestroyService.js';
import { applyBulkChatVisibility } from './systems/bulkChatVisibility.js';
import { AlchemyListingBuilder } from './systems/AlchemyListingBuilder.js';
import { resolveCheckFormulaDisplay, runFormulaPassFail, runFormulaProgressive } from './systems/checkRoll.js';
import { SignatureValidator } from './systems/SignatureValidator.js';
import { Recipe } from './models/Recipe.js';
import { Ingredient } from './models/Ingredient.js';
import { IngredientGroup } from './models/IngredientGroup.js';
import { findCuratedIconRecord, listCuratedIconVocabulary } from './utils/iconVocabulary.js';
import { MacroExecutor } from './utils/MacroExecutor.js';
import {
  createGatheringResultCreator,
  resolveGatheringResultSource,
  gatheringRunItemRef
} from './gatheringResultCreation.js';
import { resolveAlchemySubmissions } from './utils/alchemySubmissions.js';
// The item -> managed-component resolver the crafting listing's summary phase tallies held
// stacks with (issue 1075), shared with InventoryListingBuilder's owned-row matching.
import { findMatchingComponent } from './utils/essenceResolver.js';
import { progressiveOrderKey } from './utils/progressiveResultOrder.js';
import { findStackableMatch } from './utils/sourceUuid.js';
import { STARTUP_PHASES, createStartupMarks } from './utils/startupMarks.js';
import {
  callGatheringRuntimeWithCurrentViewer,
  createGatheringSceneAccess,
  createGatheringSelectableActorsGetter,
  evaluateGatheringExpression,
  processWorldTimeCallbacksSafely,
} from './gatheringBootstrapAdapters.js';
import { sceneRegionUuidsContainingToken } from './canvas/regionHitTest.js';
import {
  createGatheringToolAvailability,
  matchGatheringTools
} from './gatheringToolRuntime.js';
import { createToolBreakageRuntime } from './toolBreakageRuntime.js';
import {
  getFabricateAppClass,
  getCraftingSystemManagerAppClass,
  getInteractableBrowserAppClass,
  getInteractableConfigAppClass,
  getInteractablesManagerAppClass
} from './ui/appFactory.js';
import { addInteractableSceneControl } from './ui/interactableSceneControl.js';
import { managerExtensions } from './ui/managerExtensions.js';
import { playerExtensions } from './ui/playerExtensions.js';
import { applyCurrentFabricateTheme } from './ui/theme.js';
import { findItemsDirectoryActionsContainer, syncGatheringDirectoryButton } from './ui/itemsDirectoryButtons.js';
import { buildCompendiumImportContextOption, promptSelectCraftingSystem } from './ui/compendiumDirectoryContext.js';
import { registerFabricateSettings, getSetting, setSetting, SETTING_KEYS, FABRICATE_SETTINGS_NAMESPACE, RECIPE_ITEM_FLAG_STAMP_TARGET, COMPONENT_FLAG_STAMP_TARGET, TOOL_FLAG_STAMP_TARGET, OWNED_ITEM_COMPONENT_STAMP_TARGET, WORLD_SCOPE_IDENTITY_FLAG_TARGET } from './config/settings.js';
import { notifyUnresolvedItemDescriptions } from './config/repairItemData.js';
import { getFabricateFlag, setFabricateFlag } from './config/flags.js';
import { isPlayerCharacterActor } from './config/playerCharacterTypes.js';
import { handleFabricateSettingChange } from './config/settingChangeBridge.js';
import { configureItemStackQuantityPath, probeStackQuantityPath, stackQuantityAdvisory } from './systems/itemStackQuantity.js';
import { stackQuantityPathPresetFor } from './config/stackQuantityPathPresets.js';
import { FABRICATE_HOOKS } from './config/hooks.js';
import { MIGRATION_DEFERRAL_REASONS, MigrationRunner } from './migration/MigrationRunner.js';
// ALIASED, because the facade below exposes a PUBLIC method of the same name that wraps this
// one with the active-GM gate and the pending-map check. Two same-named callables in one
// module is a readability trap on a public surface: a reader of `applyWorldScope...` cannot
// tell which is which, and the wrong one is the ungated one.
import {
  mayClearWorldScopeRekeyMap,
  remapCompletedCleanly,
  remapWorldScopeIdentityFlags as remapIdentityFlagsAcrossActors,
} from './migration/remapWorldScopeIdentityFlags.js';
import { hasPendingWorldScopeRekey } from './systems/worldScopeRekeyPending.js';
import { readPersistedCraftingSystems } from './systems/SettingsCraftingDefinitionRepository.js';
import { reportWorldIdentityDrift } from './systems/worldIdentityDrift.js';
import { restampOwnedItemComponentIdentity } from './migration/restampOwnedItemComponentIdentity.js';
import { buildWorldIdentityDriftNotice, buildWorldScopeEntityNotice, buildWorldScopeIdentityRemapNotice } from './migration/worldScopeEntityNotice.js';
import { buildMigrationRecoveryPrompt } from './migration/migrationRecoveryPrompt.js';
import { buildRetiredCraftingModNotice } from './migration/migrateRetireCraftingModToken.js';
import { ItemPilesIntegration } from './integrations/ItemPilesIntegration.js';
import {
  ActorInventoryCoinSpender,
  ActorPropertyCoinSpender,
} from './systems/CoinSpenders.js';
import { Pf2eInventoryCoinAdapter } from './systems/Pf2eInventoryCoinAdapter.js';
import {
  AFFORDABILITY_MESSAGE_KEYS,
  CHECK_ROLL_MESSAGE_KEYS,
  COMPANION_CONTRACT,
  COMPANION_OUTCOMES,
  COMPONENT_AWARD_MESSAGE_KEYS,
  CURRENCY_CREDIT_MESSAGE_KEYS,
  KNOWLEDGE_GRANT_MESSAGE_KEYS,
  affordabilityResult,
  bulkCheckDecisionResult,
  checkRollResult,
  componentAwardResult,
  currencyCreditResult,
  gatePooledActorUuids,
  knowledgeGrantResult,
  pooledHoldingsConsumeResult,
  pooledHoldingsReadResult
} from './systems/companionContract.js';
// Aliased on import because the facade delegator below carries the SAME name. A class
// method is not a bare identifier in its own body, so the unaliased import would resolve
// correctly and read as a recursive call to every human who met it.
import { grantRecipeKnowledge as grantRecipeKnowledgeToActor } from './systems/companionKnowledgeGrant.js';
// Aliased for the same reason as the grant above.
import { awardComponents as awardComponentsToActor } from './systems/companionComponentAward.js';
// Aliased for the same reason as the grant above: both facade delegators carry the SAME
// names as the free functions they delegate to.
import {
  resolveBulkCheckDecision as resolveStandaloneBulkCheckDecision,
  rollActorCheck as rollStandaloneActorCheck
} from './systems/companionCheckRoll.js';
// Aliased for the same reason again (issue 1342): both facade delegators carry the SAME names
// as the leaves they delegate to, and the alias says which side of the boundary is which.
import { readPooledHoldings as readPooledHoldingsAcrossActors } from './systems/companionPooledHoldings.js';
import { consumePooledHoldings as consumePooledHoldingsFromActors } from './systems/companionPooledConsumption.js';

/**
 * `rollActorCheck`'s OWN refusal strings for the shared authorization preamble.
 *
 * Hoisted to module scope so the delegator reads `this._requireGmActor(actorId, KEYS)` on one
 * line rather than restating a four-line object literal — the same duplicated run between
 * `src/main.js` and its harness mirror that the shipped two members already carry.
 *
 * There is deliberately NO second pair for `resolveBulkCheckDecision`: that member takes no
 * `actorId`, never reaches the preamble, and derives its own `gmOnly` string from its message
 * table, so a pair for it would be dead.
 */
const ROLL_ACTOR_CHECK_GATE_KEYS = Object.freeze({
  gmOnlyKey: CHECK_ROLL_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
  noActorKey: CHECK_ROLL_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor]
});

/**
 * `awardComponents`' and `creditCurrency`'s OWN refusal strings, hoisted for the same reason
 * (issue 1301).
 *
 * Two pairs and not one: the whole point of parameterising the preamble is that a refused
 * award reports itself in the award's words and a refused credit in the credit's, and a shared
 * pair would be the cross-member vocabulary leak the parameter exists to prevent.
 */
const AWARD_COMPONENTS_GATE_KEYS = Object.freeze({
  gmOnlyKey: COMPONENT_AWARD_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
  noActorKey: COMPONENT_AWARD_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor]
});

const CREDIT_CURRENCY_GATE_KEYS = Object.freeze({
  gmOnlyKey: CURRENCY_CREDIT_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
  noActorKey: CURRENCY_CREDIT_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor]
});

/**
 * The two pooled members carry NO hoisted refusal-string trio, and that absence is deliberate
 * (issue 1342).
 *
 * Every member above hands its preamble its own keys because the SINGULAR preamble's `message`
 * is read: `resetActorKnowledge` answers `{ success: false, message: gate.message }` verbatim.
 * The SET-valued preamble's is not. Both pooled delegators branch on `gate.outcome` alone and
 * answer through their own result builder, which resolves the member's own message table by
 * outcome — so a key threaded through the gate could only ever restate, in a second place, the
 * string the builder is about to derive. Three parameters, two frozen constants and a mirror
 * copy of both bought exactly one failure mode: someone editing a string. The builder is the one
 * home of a member's words, and the gate now answers `{ actors, outcome, messageData }`.
 */
import { checkWorldCurrencyAffordability, creditWorldCurrency } from './systems/currencyAffordance.js';
import { isGatheringActorSelectableByUser } from './config/preferencesCleanup.js';
import { registerFragmentDiscoveryHook } from './systems/FragmentDiscoveryHook.js';
import { registerRecipeItemLearningHook } from './systems/RecipeItemLearningHook.js';
import { InteractableManager } from './canvas/InteractableManager.js';
import {
  handleInteractableSocketMessage,
  applyInteractableBehaviorUpdate,
  resolveInteractableBehaviorByRef,
  writeInteractableBehaviorNode
} from './canvas/interactableSocketBridge.js';
import { registerInteractableRegionBehavior } from './canvas/regions/FabricateInteractableRegionBehavior.js';
import {
  evaluateInteractableCreate,
  neutralizeInheritedLinkedVisual,
  buildUnconfiguredSentinelPatch
} from './canvas/regions/interactableCreationGuard.js';
import {
  isInteractableRegionBehavior,
  readInteractableBehaviorSystem
} from './canvas/regions/interactableRegionFlags.js';
import { syncInteractableMarkers } from './canvas/regions/interactableMarkerDepletion.js';
import {
  decideWorldInteractableCleanup,
  executeWorldInteractableCleanup,
  planHasWork
} from './canvas/regions/interactableCleanup.js';
import {
  assignInteractableConfigSheet,
  resolveInteractableConfigTarget,
  shouldOfferInteractableConfigEntry
} from './canvas/regions/interactableConfigSheet.js';
import * as CraftingSystemExporter from './systems/CraftingSystemExporter.js';
import './ui/SvelteFabricateApp.svelte.js';
import './ui/InteractableBrowserApp.svelte.js';
import './ui/InteractionPromptApp.svelte.js';
import './ui/InteractableConfigApp.svelte.js';
import './ui/InteractablesManagerApp.svelte.js';

let gatheringEngine = null;

// Per-sender throttle for inbound gathering node depletions, held at module scope so
// the window survives across socket messages (a per-message limiter would never
// refuse anything). Only the active GM ever consults it.
const gatheringDepletionRateLimiter = createDepletionRateLimiter();
// Separate budget for the blind-start relay (issue 901) so a burst of gathers and
// a burst of starts cannot starve one another through a shared allowance.
const gatheringBlindStartRateLimiter = createBlindStartRateLimiter();
// Third budget, for the complication relay (issue 1286). Charged per MESSAGE, and one
// resolution — including a whole bulk salvage — emits exactly one.
const complicationDeliveryRateLimiter = createComplicationRateLimiter();
// Suppresses a complication re-delivered to THIS context. Module scope for the same
// reason the limiters are: a per-message set would remember nothing. It cannot cover an
// elected GM with the world open in two tabs — two realms, two sets — which is a stated,
// accepted residual rather than an oversight (see `complicationSocket.js`).
const complicationDeliveryDedupe = createComplicationDeliveryDedupe();

// The GM notice for each way a startup migration pass can DEFER (issue 1242): a corpus
// could not be read, or could not be written. One complete localized sentence per reason,
// selected by a positive lookup, because the two differ in what the GM must do — only the
// writeback failure instructs a reload, since only that path leaves this session holding a
// transformed copy of data that was never saved.
const MIGRATION_DEFERRAL_NOTICES = Object.freeze({
  [MIGRATION_DEFERRAL_REASONS.CORPUS_READ_FAILED]: 'FABRICATE.Migration.Deferred.CorpusUnreadable',
  [MIGRATION_DEFERRAL_REASONS.WRITEBACK_FAILED]: 'FABRICATE.Migration.Deferred.WritebackFailed'
});

// The GM-only crafting system manager app is deferred to a lazy chunk so
// non-GM players never download/parse its subtree at module init. The dynamic
// import runs the module's bottom-of-file registerCraftingSystemManagerApp(...)
// side effect exactly once; subsequent opens reuse the memoized promise.
let _craftingSystemManagerAppLoad = null;

/**
 * Lazily load and register the GM crafting system manager app class.
 * Memoizes the dynamic import so repeated opens do not re-enter import().
 * @returns {Promise<Function>} the registered app class
 */
function loadCraftingSystemManagerAppClass() {
  if (!_craftingSystemManagerAppLoad) {
    _craftingSystemManagerAppLoad = import('./ui/SvelteCraftingSystemManagerApp.svelte.js').then(
      () => getCraftingSystemManagerAppClass()
    );
  }
  return _craftingSystemManagerAppLoad;
}

/**
 * Resolve a stored gathering actor preference against Foundry's actor collection.
 *
 * @param {string} actorId Actor id from the client preference.
 * @returns {Actor|null} Resolved actor, or null when stale.
 */
function resolveGatheringActor(actorId) {
  return game.actors?.get?.(actorId) ?? null;
}

/**
 * Check whether the current user may select an actor for gathering.
 *
 * @param {Actor} actor Candidate gathering actor.
 * @returns {boolean} True when the actor is selectable by the current user.
 */
function isSelectableGatheringActor(actor) {
  return isGatheringActorSelectableByUser(actor, game.user);
}

const getGatheringSelectableActors = createGatheringSelectableActorsGetter({
  getActors: () => game.actors,
  getCurrentUser: () => game.user,
  isSelectable: isGatheringActorSelectableByUser
});

/**
 * Selection predicate for the actor-selection top bar.
 *
 * Combines the ownership rule reused for gathering attempt authorization
 * (`isGatheringActorSelectableByUser`: player owns / GM sees all) AND the
 * player-character concept (`isPlayerCharacterActor`). This narrows the bar's
 * list to player characters WITHOUT modifying attempt authorization — an owned
 * non-player-character actor stays attempt-authorized but is absent from the bar.
 *
 * @param {object} payload
 * @param {Actor} payload.actor Candidate actor.
 * @param {User} payload.viewer Foundry user the selection is for.
 * @returns {boolean} True when the actor is a selectable player character.
 */
function isSelectableBarActor({ actor, viewer } = {}) {
  return isGatheringActorSelectableByUser(actor, viewer) && isPlayerCharacterActor(actor);
}

const getBarSelectableActors = createGatheringSelectableActorsGetter({
  getActors: () => game.actors,
  getCurrentUser: () => game.user,
  isSelectable: (actor, viewer) => isSelectableBarActor({ actor, viewer })
});

/**
 * Push the configured item stack-quantity path into the accessor, then optionally probe
 * it against the world's items and warn the GM when it looks wrong (issue 1024).
 *
 * ORDER IS LOAD-BEARING: the re-configure happens BEFORE the probe. Without that, a GM
 * editing the path mid-session would get a notification reporting counts for the NEW
 * path while every engine read and write continued on the OLD one until reload — an
 * advisory asserting a state that is not live, which is worse than no advisory at all
 * for a setting whose entire justification is data-loss avoidance.
 *
 * The re-configure is UNGATED (the engine path has to be live on every client), while
 * the notification is GM-only: a permanent toast about a misconfiguration is actionable
 * for the GM who just saved it and pure noise for a player who cannot change it.
 *
 * @param {object} [options]
 * @param {boolean} [options.notify=false] Whether to run the probe and notify.
 * @returns {string} The path now in force.
 */
function applyItemStackQuantityPathSetting({ notify = false } = {}) {
  let stored = null;
  try {
    stored = getSetting(SETTING_KEYS.ITEM_STACK_QUANTITY_PATH);
  } catch {
    // Unregistered or unreadable: `configureItemStackQuantityPath` keeps the current
    // path rather than storing a falsy one, and never throws.
  }
  const path = configureItemStackQuantityPath(stored);
  if (!notify || game.user?.isGM !== true) return path;

  // `game.items` only. This is a bounded, synchronous, read-only scan of the world item
  // directory — it resolves nothing and rewrites nothing.
  //
  // That scope is a REAL LIMIT, not just an implementation note: a world whose items all
  // live in compendia and on actor sheets yields `total === 0`, verdict `'no-items'`, and
  // no warning at all — while every craft, salvage and alchemy consume on those same
  // actor-owned items is destroying stacks. A `'no-items'` verdict is SILENCE, never a
  // clean bill of health. Widening the scan to actors and packs would make module startup
  // walk the whole world, which is why it is not done here.
  //
  // The suggested correction is the ACTIVE SYSTEM's preset, not the built-in default. On
  // tormenta20 those differ, and passing the built-in would print "system.quantity" as
  // "your game system's usual field" on the one system this whole feature exists for —
  // contradicting the setting's own hint, which is formatted from the same preset.
  const report = probeStackQuantityPath(game.items ?? [], {
    path,
    defaultPath: stackQuantityPathPresetFor(game.system?.id),
  });
  const message = describeStackQuantityProbe(report);
  // PERMANENT: subject to the scope caveat above, this notification is the remaining
  // defence against a typo'd path destroying stacks. The object-valued write guard cannot
  // see the failure, because all four consume sites take `item.delete()` INSTEAD of
  // `item.update(...)`.
  if (message) ui.notifications?.warn?.(message, { permanent: true });
  return path;
}

/**
 * The GM-facing advisory for a stack-quantity probe result, or `null` when healthy.
 *
 * The DECISION — which of the three strings applies, and with what data — belongs to
 * `stackQuantityAdvisory` in the accessor module, where it is a pure function and can be
 * tested against a report. This wrapper is only the i18n edge, because the accessor module
 * never touches `game`.
 *
 * The chosen string names the CONSEQUENCE in plain language, not just the counts. A GM
 * reading "0 of 412" has no reason to connect it to inventory destruction and may
 * reasonably read it as "nothing has this field yet — fine, I just set it up".
 *
 * @param {object} report A `probeStackQuantityPath` report.
 * @returns {string|null} The notification text, or `null`.
 */
function describeStackQuantityProbe(report) {
  const advisory = stackQuantityAdvisory(report);
  if (!advisory) return null;
  return game.i18n?.format?.(advisory.key, advisory.data) ?? advisory.key;
}

function getGatheringRunViewer({ run } = {}) {
  const userId = run?.userId;
  return game.users?.get?.(userId) ?? { id: userId ?? null, isGM: false };
}

function isCurrentWorldPaused() {
  return game.paused === true;
}

/**
 * ACTIVE-GM edge for a relayed BLIND gathering start (issue 901).
 *
 * The GM re-runs the WHOLE attempt with the REQUESTING USER as the viewer rather
 * than itself. That matters twice over: every gate the player would have faced
 * (actor ownership via `isActorSelectable`, scene presence, task visibility,
 * tools, stamina, and node availability net of outstanding reservations) is
 * re-evaluated GM-side against the player who asked, and `_isOpaqueBlindTask`
 * stays TRUE so the run is persisted blind. Running it as the GM's own viewer
 * would silently write the real task id back onto the actor flag.
 *
 * The `senderId` is Foundry's server-attested socket sender, never a payload
 * field, so a forged message cannot impersonate another user.
 *
 * @param {object} payload Validated blind-start request plus the attested sender.
 * @returns {Promise<object|null>} The start result, or null when unresolvable.
 */
async function applyGatheringBlindStart({ senderId, environmentId, actorUuid, taskId = null, interactableRef = null } = {}) {
  const requester = game.users?.get?.(senderId) ?? null;
  if (!requester) return null;
  const resolve = globalThis.fromUuidSync;
  let startActor = null;
  try { startActor = typeof resolve === 'function' ? resolve(String(actorUuid)) : null; } catch (_) { startActor = null; }
  if (!startActor) return null;
  // `interactive: false`: the situational-modifier dialog belongs to the player's
  // client, never the GM's. A timed blind run does not roll at start anyway.
  return gatheringEngine?.startAttempt({
    viewer: requester,
    actor: startActor,
    environmentId,
    taskId,
    interactableRef,
    interactive: false
  });
}

/**
 * Resolve an addressed actor synchronously, or `null` when it names nothing reachable.
 *
 * @param {string} actorUuid
 * @returns {object|null}
 */
function resolveComplicationActor(actorUuid) {
  const resolve = globalThis.fromUuidSync;
  if (typeof resolve !== 'function' || !actorUuid) return null;
  try { return resolve(String(actorUuid)) ?? null; } catch (_) { return null; }
}

/**
 * The components the ADDRESSED crafting system holds on THIS client — the corpus the
 * GM-side re-read resolves against (issue 1286).
 *
 * Split out so `applyComplicationDelivery` reads as authorize-then-apply and so the
 * addressing-only contract itself is enforced by `findAuthoredComplication`, which is pure
 * and lives in `complicationSocket.js` where it can be driven with real inputs.
 *
 * @param {string} craftingSystemId
 * @returns {object[]}
 */
function complicationComponentsFor(craftingSystemId) {
  return fabricate.craftingSystemManager?.getComponentsForSystem?.(craftingSystemId) ?? [];
}

/**
 * The token and speaker the GM side resolves for an addressed actor, NEVER read from the
 * payload — a payload carries no speaker, so a forged one cannot make the GM's card or a
 * macro's scope speak as anything.
 *
 * Guarded because it is on the delivery path: a `getSpeaker` that threw would otherwise
 * reject out of the writer's fire-and-forget local apply, where nothing catches it.
 *
 * @param {object|null} actor
 * @returns {{token: object|null, speaker: object|null}}
 */
function resolveComplicationSpeaker(actor) {
  try {
    const token = actor?.token ?? actor?.getActiveTokens?.(false, true)?.[0] ?? null;
    return { token, speaker: globalThis.ChatMessage?.getSpeaker?.({ actor, token }) ?? null };
  } catch (error) {
    console.warn('Fabricate | Could not resolve a complication speaker', error);
    return { token: null, speaker: null };
  }
}

/**
 * Run one complication's authored macro on this (elected GM) client, and REPORT what
 * happened. Never throws: one bad complication must not cost a resolution its others.
 *
 * The `type === 'script'` gate is a CALL-SITE check and this is the call site. It sits HERE
 * rather than on the acting client because compendium ownership is GM-configurable per role,
 * so a player's `fromUuid` can miss a macro the GM resolves fine, which would silently drop a
 * valid macro. The uuid is resolved here AND again inside `MacroExecutor.run` for the reason
 * the essence-property macro records: only settling "is this a script macro at all" before the
 * try can tell a broken link from a macro that blew up.
 *
 * The return is a REPORT rather than the macro's own return value, for two reasons. Nothing in
 * Fabricate may read a macro's return (`recipes-and-steps/spec.md` § Extend, never constitute),
 * and the miss has to be reportable: `recipes-and-steps/spec.md` § "The `script` gate is a
 * call-site check" requires a uuid that does not resolve to a script macro to be "skipped and
 * reported on the GM-facing output", and a `console.warn` on the one client that can fix the
 * link is not a report.
 *
 * @param {object} args
 * @returns {Promise<{status: 'none'|'skipped'|'ran'|'failed', macroUuid: string|null}>}
 */
async function runComplicationMacro({ craftingSystemId, component, complication, entry, actor, token, speaker, senderUser, resolutionId }) {
  const macroUuid = complication.macroUuid;
  if (!macroUuid) return { status: 'none', macroUuid: null };
  let macro;
  try {
    macro = await fromUuid(macroUuid);
  } catch {
    macro = null;
  }
  if (!isRunnableComplicationMacro(macro)) {
    console.warn(
      `Fabricate | Complication "${complication.name || complication.id}" names a macro that could not be resolved to a script macro and was skipped (${macroUuid})`
    );
    return { status: 'skipped', macroUuid };
  }
  try {
    await MacroExecutor.run(macroUuid, buildComplicationMacroContext({
      craftingSystemId, component, complication, entry, actor, token, speaker, senderUser, resolutionId
    }));
    return { status: 'ran', macroUuid };
  } catch (error) {
    console.error(`Fabricate | Complication macro failed (${macroUuid})`, error);
    return { status: 'failed', macroUuid };
  }
}

/**
 * Everything the elected GM DOES for one re-read complication: roll a `gmOnly` effect roll,
 * then run the macro.
 *
 * Both are effects of the same authored complication and are independent of each other, so
 * each carries its own guard and neither can cost the other. The effect roll goes first only
 * because the card reports it; the macro is explicitly unordered relative to any chat output.
 *
 * @param {object} args
 * @returns {Promise<{effect: object, macro: object}>}
 */
async function runComplicationDelivery({ craftingSystemId, component, complication, entry, actor, token, speaker, senderUser, resolutionId }) {
  const effect = await rollGmComplicationEffect({ complication, actor, speaker });
  const macro = await runComplicationMacro({
    craftingSystemId, component, complication, entry, actor, token, speaker, senderUser, resolutionId
  });
  return { effect, macro };
}

/**
 * Whether the ADDRESSED crafting system narrates to chat at all (issue 1286).
 *
 * `features.chatOutput` is a per-system GM toggle and every other Fabricate chat poster
 * consults it — `CraftingEngine#_postCraftChatMessage`, its salvage sibling,
 * `GatheringEngine`'s poster and `BulkSalvageService#_postAggregateCard`. The GM
 * complication card is unambiguously chat, so it consults it too; a GM who turned Fabricate's
 * narration off would otherwise still be whispered a card per resolution.
 *
 * NEITHER the macro NOR the effect roll is gated by this, and the rule is card-vs-dice-message
 * rather than chat-vs-not-chat. `features.chatOutput` has only ever gated the cards Fabricate
 * composes about its own resolutions; it has never gated a die. `evaluateCheckRoll` posts a
 * crafting check roll on `options.interactive` alone (`checkRoll.js`), so a `chatOutput: false`
 * system already puts check rolls in chat with no card, and gating a complication's effect roll
 * would make this one path stricter than every other roll in the module. The effect roll is not
 * orphaned without the card either: its message carries `flavor: effectRoll.label ||
 * complication.name`, so the GM can attribute it.
 *
 * Note the argument is NOT "the roll and its posting are one call, so gating would suppress the
 * roll itself". That is false here — `evaluateSideRoll` takes an explicit `post` option and a
 * gated variant that evaluates without posting is one argument away. The reason is the rule
 * above, not an inability to separate them.
 *
 * The toggle is NARROWER than "the card is chat", and deliberately so. What it suppresses is
 * the result NARRATION Fabricate composes about its own resolutions; it has never been a
 * request to stop being told that a configuration is broken. A `macroUuid` that does not
 * resolve to a script macro is a configuration error only the GM can repair, and
 * `recipes-and-steps/spec.md` § "The `script` gate is a call-site check" requires it to be
 * "reported on the GM-facing output" without qualifying that on any toggle. So this predicate
 * does not veto the card: {@link postGmComplicationCard} consults it to choose which ROWS the
 * card is built from, and a faulted row is reported whichever way it answers.
 *
 * Read from THIS client's own copy of the world setting, like every other GM-side re-read on
 * this path, and defaulted CLOSED for a system that does not resolve — an addressing that
 * names no system on this client has nothing to narrate about.
 *
 * @param {string} craftingSystemId
 * @returns {boolean}
 */
function complicationChatOutputEnabled(craftingSystemId) {
  return fabricate.craftingSystemManager?.getSystem?.(craftingSystemId)?.features?.chatOutput === true;
}

/**
 * Whether one delivered row's macro reports a CONFIGURATION FAULT rather than an outcome.
 *
 * `skipped` is a `macroUuid` that did not resolve to a script macro — a broken link, a pack
 * this client cannot see, or a `chat`-type macro authored where a `script` was meant. `failed`
 * is a script macro whose body threw. Both are the GM's OWN authorship to repair, and both are
 * invisible everywhere else: the acting client is never told, and {@link runComplicationMacro}'s
 * `console.warn` and `console.error` reach only the elected GM's dev tools. `none` (no macro
 * authored) and `ran` are outcomes rather than faults and report nothing on their own.
 *
 * @param {{report?: {macro?: {status?: string}}}} row One applied-complication row.
 * @returns {boolean}
 */
function hasComplicationMacroFault(row) {
  const status = row?.report?.macro?.status;
  return status === 'skipped' || status === 'failed';
}

/**
 * The GM-only chat card for one delivered resolution — the OUTPUT half of a `gmOnly`
 * complication (issue 1286).
 *
 * `gmOnly` is the AUTHORED DEFAULT, so this is the common case rather than an edge: without
 * it a `gmOnly` complication with no macro fires, pays the whole socket cost, and produces
 * nothing observable anywhere.
 *
 * ## Every DELIVERED complication gets a row, not only the `gmOnly` ones
 *
 * A delivery only reaches this client for a complication that is `gmOnly` OR carries a macro,
 * so the `visible` rows here are exactly the ones that asked this GM to run something. Their
 * macro outcome has to be reported somewhere — `recipes-and-steps/spec.md` says the GM-facing
 * output — and a card reporting "macro skipped" against a complication it does not name would
 * be unreadable. One whisper per resolution is the price; the alternative is a report the GM
 * cannot act on.
 *
 * ## `features.chatOutput` selects the ROWS; it does not veto the card
 *
 * The toggle suppresses per-resolution NARRATION — a card carrying a row for every
 * complication this GM was asked to run. It is not a request to stop being told that a macro
 * link is broken. `recipes-and-steps/spec.md` § "The `script` gate is a call-site check"
 * states without qualification that a uuid which does not resolve to a script macro "is
 * skipped and reported on the GM-facing output", and this card is the only GM-facing output
 * there is; a gate that vetoed the card outright left that report in the elected GM's console,
 * which is the very thing {@link runComplicationMacro}'s docblock refuses to call a report.
 *
 * So the gate chooses the SET OF ROWS the card is built from: every delivered row when the
 * system narrates, and the faulted rows ALONE when it does not. A GM who switched narration
 * off and has a broken link is whispered a card naming exactly the complications whose macros
 * did not run, and nothing about the ones that did. `failed` joins `skipped` in
 * {@link hasComplicationMacroFault} because a macro body that threw is equally the GM's own
 * authorship to repair and equally invisible anywhere else.
 *
 * A surviving row is NOT re-projected for that case, and the residual is stated rather than
 * hidden: it still carries the acting client's claimed stage and this client's effect roll,
 * which are narration. That is accepted for two reasons. A fault row naming only a uuid could
 * not be acted on — the GM has to locate that complication, on that component, in the editor
 * to fix it — so the identity fields have to survive anyway; and a second, hand-rolled row
 * model would sit in `main.js`, which cannot be imported under `node --test` and could
 * therefore only ever be pinned by a text search. The bound that matters is met: this is one
 * row per broken link, not one card per resolution.
 *
 * ## Four steps, in an order that is load-bearing
 *
 * 1. **The `chatOutput` gate first, over the ROW SET rather than over the card** — see
 *    {@link complicationChatOutputEnabled} and the section above. A gated-off system with
 *    nothing faulted still costs this client nothing at all: the selection is taken from
 *    `applied` itself, so that case returns before the projection and before any
 *    localization. The gate has never reached the macro, which has already run by the time
 *    this is called.
 * 2. **Speaker before the visibility pass.** `applyBulkChatVisibility` states as a caller
 *    contract that `chatData.speaker` is already set, so the speaker is built onto `chatData`
 *    at its construction rather than after it. (V14's `applyMode` reads `speaker.actor` only
 *    inside its `ic` branch, which the literal `'gmroll'` below cannot reach — the ordering
 *    is the module's contract, not a live crash on this call site.)
 * 3. **Visibility before `create`**, through `applyBulkChatVisibility` with an EXPLICIT
 *    `gmroll` — never `core.rollMode`, which is `scope: "client"` and would be the GM's own
 *    selector. The legacy `rollMode` CREATE OPTION is honoured only for a message carrying
 *    rolls and this card carries none, so passing it to `create` would post the card publicly.
 * 4. **`create` inside the same guard**, so a token the running Foundry cannot map throws
 *    BEFORE the message exists. Failing closed matters here in a way it does not for the bulk
 *    card: a GM-only card that could not be made GM-only must not be posted at all.
 *
 * The row MODEL is `gmComplicationCardEntries`, in `complicationRuntime.js`, so that a suite
 * can drive it with rows that disagree; what is left here is the Foundry edge only.
 *
 * The whole body is contained, because a complication is strictly downstream of a committed
 * award and a chat failure must never propagate — and there is nothing to propagate it TO: the
 * acting client has already returned.
 *
 * @param {object} args
 * @returns {Promise<object|null>} the created message, or null when none was posted.
 */
async function postGmComplicationCard({ craftingSystemId, actor, speaker, senderUser, applied = [] }) {
  try {
    // The toggle SELECTS rows; it does not veto the card. A configuration error is reported
    // whatever it says, narration is not. The filter runs over `applied` rather than over the
    // projected entries so that the suppressed case — gate off, nothing faulted — still
    // returns before any projection or localization, which is what made an early gate worth
    // having in the first place.
    const delivered = Array.isArray(applied) ? applied : [];
    const reported = complicationChatOutputEnabled(craftingSystemId)
      ? delivered
      : delivered.filter((row) => hasComplicationMacroFault(row));
    if (reported.length === 0) return null;
    // `gmComplicationCardEntries` — the GM-facing projection (the counterpart to
    // `publicComplications`, and deliberately the only one that may carry an authored
    // description or a severity to a GM surface) augmented with what THIS client did, which
    // is the half no projection of the acting client's report could ever hold.
    const entries = gmComplicationCardEntries(reported);
    const content = buildGmComplicationCardContent(
      { entries, actorName: actor?.name ?? '', reporterName: senderUser?.name ?? '' },
      (key) => game.i18n?.localize?.(key) ?? key
    );
    if (!content) return null;

    const chatData = { author: game.user?.id, speaker, content };
    applyBulkChatVisibility(chatData, 'gmroll');
    return await ChatMessage.create(chatData);
  } catch (error) {
    console.error('Fabricate | Failed to post the GM complication card', error);
    return null;
  }
}

/**
 * ELECTED-GM edge for a relayed complication delivery (issue 1286).
 *
 * Runs strictly downstream of an award the acting client has already committed, so it
 * never influences one and never reports back: the acting client has returned. What it
 * adds is AUTHORITY — the macro runs on a GM client, the GM-only card is authored by a GM,
 * and both come from the complication the GM's OWN world setting holds.
 *
 * The `senderId` is Foundry's server-attested socket sender, never a payload field, and
 * the actor is re-authorized against THAT user rather than against this client's own
 * ambient permissions. Each complication is isolated: one that resolves to nothing is
 * dropped and the rest still run.
 *
 * This function is the Foundry EDGE only. The addressing-only re-read, the `script`
 * discriminant, the macro scope and the per-entry isolation are pure and live in
 * `complicationSocket.js`, where a test can drive them with real inputs — a source-text pin
 * on this file cannot tell an exact id match apart from one with a positional fallback.
 *
 * @param {object} payload Validated delivery request plus the attested sender.
 * @returns {Promise<Array<{component: object, complication: object, entry: object,
 *   report: ?object}>|null>} One row per complication that RESOLVED against this client's
 *   own record, or null when the delivery was refused outright. Returned for testability and
 *   symmetry only: the acting client has already returned and nothing reads this.
 */
async function applyComplicationDelivery({ senderId, craftingSystemId, actorUuid, resolutionId, complications = [] } = {}) {
  const senderUser = game.users?.get?.(senderId) ?? null;
  if (!senderUser) return null;
  const actor = resolveComplicationActor(actorUuid);
  // Failing CLOSED is right — nothing may run against an actor whose permissions cannot be
  // asked — but the drop has to be VISIBLE. `fromUuidSync` resolves a compendium uuid to a
  // plain index entry, which carries no `testUserPermission` at all, so a perfectly
  // well-formed delivery addressed at a compendium actor is refused here with no roll, no
  // macro, no card and, until this line, no trace anywhere for the one client that could
  // diagnose it.
  if (!actor || typeof actor.testUserPermission !== 'function') {
    console.warn('Fabricate | Refused a complication delivery: the addressed actor could not be resolved to a permission-testable document', {
      senderId, actorUuid
    });
    return null;
  }
  // Ask the ATTESTED SENDER's own permission, directly. Any predicate whose first
  // disjunct reads `actor.isOwner` resolves that disjunct against the AMBIENT
  // `game.user`, which on the elected GM's client (the only client that runs this) owns
  // every actor in the world. Such a predicate passes for a sender who owns nothing and
  // never consults the sender at all, reintroducing exactly the escalation the
  // addressing-only contract exists to remove. The blind-gather relay shipped with that
  // defect and issue 1288 removed it from `isGatheringActorSelectableByUser`; the rule
  // it recorded is that NO ownership predicate on a GM-side apply path may read
  // `isOwner`, so do not reintroduce one here either.
  if (actor.testUserPermission(senderUser, 'OWNER') !== true) {
    console.warn('Fabricate | Refused a complication delivery: the sender does not own the addressed actor', {
      senderId, actorUuid
    });
    return null;
  }
  const { token, speaker } = resolveComplicationSpeaker(actor);
  const applied = await applyAuthoredComplications({
    components: complicationComponentsFor(craftingSystemId),
    complications,
    execute: ({ component, complication, entry }) => runComplicationDelivery({
      craftingSystemId, component, complication, entry, actor, token, speaker, senderUser, resolutionId
    })
  });
  await postGmComplicationCard({ craftingSystemId, actor, speaker, senderUser, applied });
  return applied;
}

/**
 * Execute a gathering macro through the shared macro runner.
 *
 * @param {string} macroUuid Macro document UUID.
 * @param {object} context Gathering macro context.
 * @returns {Promise<*>} Macro result.
 */
async function runGatheringMacro(macroUuid, context = {}) {
  return MacroExecutor.run(macroUuid, context);
}

function createGatheringToolBreakage({ craftingSystemManager, evaluateExpression }) {
  return createToolBreakageRuntime({
    matchTools: ({ actor, system, task, tools = [], presentTools = null }) =>
      matchGatheringTools({ actor, system, task, tools, craftingSystemManager, presentTools }),
    buildItemRef: (actor, item) => gatheringRunItemRef(actor, item),
    resolveReplacementSource: ({ componentId, system }) =>
      resolveGatheringResultSource({ componentId, quantity: 1 }, system, craftingSystemManager),
    resolveItemUuid: (uuid) => fromUuid(uuid),
    evaluateExpression
  });
}

function createGatheringFailureFeedback() {
  return {
    async apply({ failureOutcome, actor, viewer, system, environment, task, outcome, checkResult } = {}) {
      if (failureOutcome?.mode === 'macro') {
        try {
          return await runGatheringMacro(failureOutcome.macroUuid, {
            kind: 'gatheringFailure',
            actor,
            viewer,
            system,
            environment,
            task,
            outcome,
            checkResult
          });
        } catch (err) {
          console.error('Fabricate | Gathering failure-feedback macro failed:', err);
          const fallback = game.i18n?.localize?.('FABRICATE.Gathering.FailureDefault') || 'Gathering produced no results.';
          ui.notifications?.warn?.(fallback);
          return { message: fallback, error: err?.message || 'Macro threw' };
        }
      }
      const message = failureOutcome?.text || game.i18n?.localize?.('FABRICATE.Gathering.FailureDefault') || 'Gathering produced no results.';
      ui.notifications?.warn?.(message);
      return { message };
    }
  };
}

function fabricateEscapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function eventScenePromptText(key, fallback, data) {
  const i18n = game?.i18n;
  if (!i18n) return fallback;
  if (data) return i18n.format?.(key, data) ?? fallback;
  const out = i18n.localize?.(key);
  return out && out !== key ? out : fallback;
}

// GM-side prompt: choose which active players to pull to a dropped event's
// linked scene. The GM also views the scene; selected players are pulled via
// the module socket. Lives here (not the engine) because it is Foundry glue.
async function showEventScenePrompt({ sceneUuid, eventName } = {}) {
  const scene = typeof fromUuid === 'function' ? await fromUuid(sceneUuid) : null;
  if (!scene) {
    ui.notifications?.warn?.(eventScenePromptText(
      'FABRICATE.Admin.Manager.Environment.Events.EventScenePrompt.Missing',
      'The event\'s linked scene could not be found.'
    ));
    return;
  }
  const sceneName = scene.name || sceneUuid;
  const players = Array.from(game.users?.contents || []).filter(user => user?.active && !user?.isGM);
  const intro = eventScenePromptText(
    'FABRICATE.Admin.Manager.Environment.Events.EventScenePrompt.Intro',
    `${eventName || 'An event'} dropped. Move players to ${sceneName}?`,
    { event: eventName || 'An event', scene: sceneName }
  );
  const rows = players.length === 0
    ? `<p class="notes">${fabricateEscapeHtml(eventScenePromptText('FABRICATE.Admin.Manager.Environment.Events.EventScenePrompt.NoPlayers', 'No active players to move.'))}</p>`
    : players.map(user => `<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" class="fab-pull-player" value="${fabricateEscapeHtml(user.id)}" checked /> ${fabricateEscapeHtml(user.name)}</label>`).join('');
  const content = `<div style="display:flex;flex-direction:column;gap:6px;"><p>${fabricateEscapeHtml(intro)}</p>${rows}</div>`;
  renderDialog({
    title: eventScenePromptText('FABRICATE.Admin.Manager.Environment.Events.EventScenePrompt.Title', 'An event occurred'),
    content,
    default: 'move',
    buttons: {
      move: {
        label: eventScenePromptText('FABRICATE.Admin.Manager.Environment.Events.EventScenePrompt.Move', 'Move players'),
        callback: (html) => {
          const root = html?.[0] ?? html;
          const userIds = root
            ? Array.from(root.querySelectorAll('.fab-pull-player:checked')).map(input => input.value)
            : [];
          void viewScene(sceneUuid);
          if (userIds.length > 0) {
            game.socket?.emit(EVENT_SCENE_SOCKET, { action: 'pullToScene', sceneUuid, userIds });
          }
        }
      },
      cancel: {
        label: eventScenePromptText('FABRICATE.Admin.Manager.Environment.Events.EventScenePrompt.Cancel', 'Cancel')
      }
    }
  });
}

function localizeGathering(key, data = {}) {
  return game.i18n?.format?.(key, data) ?? game.i18n?.localize?.(key) ?? key;
}

/**
 * Dispatch startup/updateWorldTime processing for crafting, salvage, and gathering.
 *
 * Gathering timed completion is delegated to the module-internal GatheringEngine;
 * the raw engine is intentionally not exposed through `game.fabricate`.
 *
 * @param {number} worldTime Current Foundry world time.
 * @returns {Promise<void[]>} Promise that settles after every guarded processor settles.
 */
function processFabricateWorldTime(worldTime = Number(game.time?.worldTime || 0)) {
  return Promise.all(processWorldTimeCallbacksSafely([
    {
      label: 'Crafting',
      callback: () => game.fabricate?.getCraftingRunManager?.()?.processWorldTime?.(worldTime)
    },
    {
      label: 'Salvage',
      callback: () => game.fabricate?.getCraftingEngine?.()?.processPendingSalvageRuns?.(worldTime)
    },
    {
      label: 'Gathering',
      callback: () => gatheringEngine?.processWorldTime?.(worldTime)
    }
  ]));
}

/**
 * Fabricate - Universal Crafting System
 * Main module entry point
 */

// Tracks which deprecated API names have already warned so the notice fires
// once per old name rather than on every call.
const _deprecationWarned = new Set();

/**
 * Emit a one-time console deprecation notice for a renamed public API method.
 * Used by the `*Region*` → `*Realm*` delegates so existing macros/modules keep
 * working while nudging callers to the canonical name. Never throws.
 *
 * @param {string} oldName the deprecated method/helper name
 * @param {string} newName the canonical replacement
 */
function deprecate(oldName, newName) {
  if (_deprecationWarned.has(oldName)) return;
  _deprecationWarned.add(oldName);
  console.warn(`Fabricate: ${oldName} is deprecated; use ${newName} instead.`);
}

class Fabricate {
  constructor() {
    this.recipeManager = null;
    this.craftingEngine = null;
    this.craftingSystemManager = null;
    this.craftingRunManager = null;
    this.salvageRunManager = null;
    this._runJournalBuilder = null;
    this.gatheringEnvironmentStore = null;
    this.gatheringNodeDepletionWriter = null;
    this.gatheringBlindRunStore = null;
    this.gatheringBlindStartWriter = null;
    this.gatheringRichStateService = null;
    this.gatheringRunManager = null;
    this.gatheringGateAndCheckEvaluator = null;
    this.recipeVisibilityService = null;
    this.resolutionModeService = null;
    // Lazily-built player-facing crafting listing projector (issue: player
    // Crafting tab). Constructed on first read once the managers exist.
    this._craftingListingBuilder = null;
    // Lazily-built player-facing inventory listing projector (player Inventory
    // tab). Constructed on first read once the managers exist.
    this._inventoryListingBuilder = null;
    // Lazily-built bulk salvage / bulk destroy collaborators (issue 859), cached
    // exactly like the listing builders above. Deliberately NOT exported onto
    // `game.fabricate`: `salvageComponents` and `destroyComponents` are the only
    // supported entry points, because they are where the per-target ownership gate is.
    this._bulkSalvageService = null;
    this._bulkDestroyService = null;
    this.itemPilesIntegration = null;
    this.actorInventoryCoinSpender = null;
    this.actorPropertyCoinSpender = null;
    this.compendiumImporter = null;
    this.ready = false;
    // Replay-safe readiness signal: resolves once `initialize()` completes and
    // `this.ready` flips true. Unlike the one-shot `fabricate.ready` Hook, awaiting
    // this settled promise works even when readiness was reached before the caller
    // subscribed — so a late manager launch can never latch on a spent event.
    this._readyPromise = new Promise((resolve) => {
      this._resolveReady = resolve;
    });
  }

  /**
   * Replay-safe readiness: resolves when the module has finished initializing.
   * Resolves immediately if startup already completed.
   * @returns {Promise<void>}
   */
  whenReady() {
    return this._readyPromise;
  }

  /**
   * Initialize the module
   */
  async initialize() {
    console.log('Fabricate | Initializing...');

    // Explicit performance boundaries around startup (issue 1073). The Foundry perf profile
    // reports "ready time attributable to Fabricate"; without marks that attribution is a guess,
    // because a stopwatch around the `ready` hook also times Foundry, the game system and every
    // other active module. `createStartupMarks` is total — an absent or partial `performance`
    // degrades to a no-op — so this can never fail a boot.
    this._startupMarks = createStartupMarks();
    this._startupMarks.begin(STARTUP_PHASES.INITIALIZE);

    // Register settings
    this.registerSettings();
    applyCurrentFabricateTheme(getSetting, SETTING_KEYS.THEME);
    // Push the configured item stack-quantity path into the accessor BEFORE anything
    // reads or writes a stack. It has to precede `_runMigrations()` because a migration
    // may touch owned items, and it has to follow `registerSettings()` because the key
    // is not readable until it is registered. There is no MIGRATIONS entry for this
    // key: it is brand new, so no prior stored value exists to migrate.
    applyItemStackQuantityPathSetting();
    // Run data migrations before managers load persisted data
    this._startupMarks.begin(STARTUP_PHASES.MIGRATIONS);
    await this._runMigrations();
    this._startupMarks.end(STARTUP_PHASES.MIGRATIONS);
    // Create managers
    // Both seams are lazy closures because `craftingSystemManager` is constructed on the
    // next statement — it needs `recipeManager` in ITS constructor, so one of the two has
    // to be resolved late. `getCraftingSystemManager` (issue 1072) is what the twelve
    // paths inside RecipeManager that used to read `game.fabricate` directly now go
    // through, which is why they no longer depend on the `ready`-hook global at all.
    // The world currency configuration (issue 1278). Constructed FIRST because both the
    // recipe manager and the crafting engine take it as a collaborator: currency is world
    // scope, so the ladder is resolved once here rather than per crafting system. It reads
    // only settings, so it has no dependency of its own to wait for.
    this.currencyConfigStore = new CurrencyConfigStore({
      getSetting,
      setSetting,
      randomID: () => foundry.utils.randomID()
    });
    this.currencyConfigStore.load();
    // Issue 1308: the world character libraries — the character-prerequisite library and the
    // modifier library. Constructed and loaded HERE, before both managers, because
    // `CraftingSystemManager` derives its Valid Id Basis from this store on every normalize; a
    // manager built ahead of it would prune every reference against an empty basis.
    //
    // Note this is NOT where the travel store sits (it is constructed well after the manager).
    // Copying that placement would be wrong: realms are read on demand, whereas these libraries
    // are read during normalization itself.
    this.characterLibrariesStore = new CharacterLibrariesStore({
      getSetting,
      setSetting,
      randomID: () => foundry.utils.randomID()
    });
    this.characterLibrariesStore.load();
    // Issue 1359 (epic 1357): the three WORLD-SCOPE entity stores. Constructed and loaded HERE —
    // AFTER `registerSettings()`, AFTER `await this._runMigrations()`, and BEFORE both managers —
    // and the ORDER IS SILENT WHEN WRONG, which is why it is stated rather than left to the
    // reader. Reading an unregistered key throws inside `ClientSettings##assertSetting`; because
    // `load()` is guarded, a mis-ordering degrades to a permanently UNSEEDED store and a `null`
    // Valid Id Basis with no crash and nothing in the console. `CraftingSystemManager` derives
    // that basis on every normalize, so a manager built ahead of these would prune every world
    // reference against an empty basis.
    //
    // A source-order assertion in `tests/scoped-definition-read-and-basis.test.js` pins it,
    // because `src/main.js` is not otherwise reachable by a unit test.
    this.componentScopeStore = createComponentScopeStore({ getSetting, setSetting });
    this.componentScopeStore.load();
    this.essenceScopeStore = createEssenceScopeStore({ getSetting, setSetting });
    this.essenceScopeStore.load();
    this.toolScopeStore = createToolScopeStore({ getSetting, setSetting });
    this.toolScopeStore.load();
    // 1.30.0 (issue 1370, epic 1357): THE WORLD IDENTITY DRIFT AUDIT, run once per session.
    //
    // HERE, AND NOT IN THE MIGRATION'S NOTICE SLOT. That slot sits inside `_runMigrations()`,
    // which has already returned by the time these three stores load, returns early on a
    // non-active-GM client, and is guarded on a report that is `null` unless the migration ran
    // this session. Drift is not a migration event: it appears on the GM's FIRST identity edit
    // after the migration and every session thereafter, so the audit belongs after the loads and
    // before either manager — which is also the last point at which nothing has read the union.
    //
    // ACTIVE GM, NOT `isGM`. `User#isGM` is `hasRole(ASSISTANT)`, so an `isGM` gate posts this
    // notice once per assistant as well as once for the full GM.
    //
    // INFO, NEVER WARN. Nothing is wrong: the read union re-derives identity from the in-system
    // record, so this discloses which of the GM's edits the shared world record has not caught up
    // with. A permanent warning would also redden every View Lab capture, which runs this path on
    // every build.
    //
    // The COMPOSITION is not here, for the same reason the migration's is not: nothing in this
    // file can be executed by a unit test, and a source-text grep can pin a DISPATCH but never
    // a SUM.
    if (game.users?.activeGM?.id === game.user?.id) {
      const worldIdentityDrift = reportWorldIdentityDrift(readPersistedCraftingSystems(), {
        components: this.componentScopeStore.corpus(),
        essences: this.essenceScopeStore.corpus(),
        tools: this.toolScopeStore.corpus()
      });
      const driftNotice = buildWorldIdentityDriftNotice(worldIdentityDrift, (key, data) =>
        data ? game.i18n?.format?.(key, data) : game.i18n?.localize?.(key)
      );
      if (driftNotice) ui.notifications?.info?.(driftNotice);
    }
    this.recipeManager = new RecipeManager({
      getCraftingSystem: (systemId) => this.craftingSystemManager?.getSystem?.(systemId) ?? null,
      getCraftingSystemManager: () => this.craftingSystemManager ?? null,
      currencyConfigStore: this.currencyConfigStore,
    });
    // Issue 800: the manager RESOLVES source descriptions through Foundry's own
    // enricher at its async ingestion boundaries, so a content link is stored as the
    // referenced document's name rather than raw `@UUID[…]` text. Both seams default
    // to pass-throughs (`enrichHTML` cannot run under happy-dom), so wiring the real
    // implementations here is what makes the production path resolve at all.
    this.craftingSystemManager = new CraftingSystemManager(this.recipeManager, {
      enrichToHtml: (raw, options) => enrichToHtml(raw, options),
      primeEnricherCache: (rawTexts) => primeEnricherCache(rawTexts)
    });
    // Wire the real primary-GM check into the timed world-time resume paths (issue
    // 656). Both managers — and the gathering engine's `resumeTimedRuns` below —
    // default this to `() => true` (fail-open, so unit fixtures resume), so passing
    // the real `activeGM` check here is load-bearing: it gates the synced-hook
    // `setFlag` writes, item creation and node depletion to exactly one client.
    const isPrimaryGM = () => game.users?.activeGM?.id === game.user?.id;
    this.craftingRunManager = new CraftingRunManager({ isPrimaryGM });
    this.salvageRunManager = new SalvageRunManager({ isPrimaryGM });
    this.gatheringRunManager = new GatheringRunManager();
    this.gatheringGateAndCheckEvaluator = new GatheringGateAndCheckEvaluator({
      evaluateExpression: evaluateGatheringExpression
    });
    this.recipeVisibilityService = new RecipeVisibilityService(
      this.recipeManager,
      this.craftingSystemManager,
      undefined,
      // A per-pass INVENTORY SNAPSHOT collaborator, not a visibility one (issue 1228). Every
      // production snapshot is built with the same identity pair, so the one this service
      // hands down is interchangeable with the crafting listing's rather than a half of one.
      findMatchingComponent
    );
    this.resolutionModeService = new ResolutionModeService(this.craftingSystemManager, {
      getPlayerResultOrder: entry => this._readPlayerResultOrder(entry)
    });
    this.itemPilesIntegration = new ItemPilesIntegration();
    this.itemPilesIntegration.detect();
    // The generic actor-inventory spender resolves a per-system coin adapter by
    // game.system.id; pf2e is the sole registered adapter (an internal map, not a plugin
    // registry). The actor-property spender is generic and needs no system-specific wiring.
    this.actorInventoryCoinSpender = new ActorInventoryCoinSpender({
      adapters: new Map([['pf2e', new Pf2eInventoryCoinAdapter()]]),
    });
    this.actorPropertyCoinSpender = new ActorPropertyCoinSpender();
    // Wire the gathering persistence seams the GM UI path already passes
    // (SvelteCraftingSystemManagerApp) so the public API surface
    // (importSystemFromFile / importFromPack / getCompendiumImporter) persists the
    // gathering authoring bundle instead of silently dropping it (issue #699). The
    // environment store is constructed AFTER this importer (below), so resolve it
    // lazily through a thin delegating object — matching the exportSystem
    // lazy-read idiom — rather than capturing the still-undefined field here.
    this.compendiumImporter = new CompendiumImporter(this.craftingSystemManager, this.recipeManager, {
      environmentStore: {
        list: () => this.gatheringEnvironmentStore?.list?.() ?? [],
        load: () => this.gatheringEnvironmentStore?.load?.() ?? [],
        save: (environments) => this.gatheringEnvironmentStore?.save?.(environments)
      },
      getSetting: (key) => getSetting(key),
      setSetting: (key, value) => setSetting(key, value),
      isGM: () => game.user?.isGM === true,
      // The three world-scope entity stores (issue 1364) resolve lazily through thin delegating
      // objects, for the environment store's reason above and one of its own. The merge fails
      // CLOSED on an absent store, so a seam that captured a still-undefined field would make
      // every world-scope import merge NOTHING and still report success — which is exactly the
      // failure deleting the `game.fabricate` accessor mirror was meant to end. A delegator closes
      // over the FIELD rather than an accessor name, so it needs no ordering comment to stay true
      // and a rename cannot slip past it.
      componentScopeStore: scopeStoreDelegate(() => this.componentScopeStore),
      essenceScopeStore: scopeStoreDelegate(() => this.essenceScopeStore),
      toolScopeStore: scopeStoreDelegate(() => this.toolScopeStore)
    });
    this.craftingEngine = new CraftingEngine(
      this.recipeManager,
      this.craftingRunManager,
      this.resolutionModeService,
      this.itemPilesIntegration,
      this.salvageRunManager,
      this.actorInventoryCoinSpender,
      this.actorPropertyCoinSpender,
      {
        getPlayerResultOrder: entry => this._readPlayerResultOrder(entry),
        getCraftingSystem: systemId => this.craftingSystemManager.getSystem(systemId),
        resolveItemUuid: uuid => fromUuid(uuid),
        currencyConfigStore: this.currencyConfigStore
      }
    );

    // Initialize recipe manager. Both `initialize()` calls deserialize a whole world-setting
    // payload, so this span is the corpus-proportional half of startup.
    this._startupMarks.begin(STARTUP_PHASES.DATA_LOAD);
    await this.recipeManager.initialize();
    await this.craftingSystemManager.initialize();
    this._startupMarks.end(STARTUP_PHASES.DATA_LOAD);
    // The WORLD travel configuration (issue 1282): the realm library, the reveal mode and the
    // modifier visibility. Constructed FIRST because the environment store validates realm
    // references against it, and the resolver and engine both read realms through it.
    this.gatheringRealmStore = new GatheringRealmStore({
      getSetting,
      setSetting,
      randomID: () => foundry.utils.randomID()
    });
    this.gatheringRealmStore.load();
    this.gatheringEnvironmentStore = new GatheringEnvironmentStore({
      systemManager: this.craftingSystemManager,
      travelStore: this.gatheringRealmStore,
      runCleanup: {
        removeRunsForSystem: (systemId) => this.gatheringRunManager.removeRunsForSystem(systemId),
        removeRunsForEnvironment: (environmentId) => this.gatheringRunManager.removeRunsForEnvironment(environmentId),
        removeRunsForTask: (taskId, options) => this.gatheringRunManager.removeRunsForTask(taskId, options)
      }
    });
    this.gatheringEnvironmentStore.load();
    // Fabricate-managed parties + the current-realm resolver for location-aware gathering.
    // Both are world scope; the resolver is constructor-injected into the engine, never
    // imported, so the engine stays testable without Foundry.
    this.gatheringPartyStore = new GatheringPartyStore({
      getSetting,
      setSetting,
      randomID: () => foundry.utils.randomID(),
      getUserId: () => game.user?.id || null,
      now: () => Date.now()
    });
    this.gatheringPartyStore.load();
    this.gatheringLocationService = new GatheringLocationService({
      partyStore: this.gatheringPartyStore,
      travelStore: this.gatheringRealmStore,
      // Live token-derived sensing: which Scene Region UUIDs the party's travel
      // marker token currently sits inside, across the marker's own scene(s).
      // Prefer Foundry's AUTHORITATIVE membership (V13 `TokenDocument#regions`),
      // maintained by the core region system and not subject to the move-animation
      // lag that makes position hit-testing report the region the token just left.
      // Fall back to position hit-testing only when membership is unavailable.
      senseSceneRegions: (travelActorUuid) => {
        const resolve = globalThis.fromUuidSync;
        if (typeof resolve !== 'function' || !travelActorUuid) return [];
        let actor = null;
        try { actor = resolve(String(travelActorUuid)); } catch (_) { actor = null; }
        const tokens = actor?.getActiveTokens?.(false, true) || [];
        const uuids = new Set();
        for (const token of tokens) {
          const memberRegions = token?.regions;
          let matched = false;
          if (memberRegions && typeof memberRegions[Symbol.iterator] === 'function') {
            for (const region of memberRegions) {
              if (region?.uuid) { uuids.add(String(region.uuid)); matched = true; }
            }
          }
          if (matched) continue;
          const scene = token?.parent ?? token?.scene ?? null;
          for (const uuid of sceneRegionUuidsContainingToken({ scene, token })) uuids.add(uuid);
        }
        return uuids;
      }
    });
    // Environment resource-node pools live in `environment.nodeRuntime[taskId]`,
    // persisted in the `gatheringEnvironments` WORLD setting — and Foundry lets only
    // a GM update a world Setting document. A player who gathers from a node-backed
    // task therefore cannot write their own decrement; without this relay the write
    // rejects with "User <name> lacks permission to update Setting [...]" and the
    // pool never depletes. Route it to the active GM over the same `module.fabricate`
    // channel issue 302 already uses for interactable-scoped pools. On a GM client
    // the writer applies locally (a socket emit never reaches the emitter).
    this.gatheringNodeDepletionWriter = createGatheringNodeDepletionWriter({
      isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
      // `Users#activeGM` is null when no GM is connected, so nobody would apply the
      // relayed write. Report it rather than emitting into the void: the gather still
      // succeeds (it never gated on this write), the pool just does not deplete.
      hasActiveGM: () => !!game.users?.activeGM,
      onUnroutable: ({ environmentId, taskId }) => console.warn(
        'Fabricate | Gathering node depletion was not applied: no active GM is connected to write the world setting',
        { environmentId, taskId }
      ),
      emitDeplete: (message) => game.socket?.emit(EVENT_SCENE_SOCKET, message),
      applyDeplete: (payload) => this.gatheringRichStateService?.applyEnvironmentNodeDepletion(payload)
    });
    this.gatheringRichStateService = new GatheringRichStateService({
      environmentStore: this.gatheringEnvironmentStore,
      depleteEnvironmentNode: (payload) => this.gatheringNodeDepletionWriter.deplete(payload),
      getSetting,
      setSetting,
      settingKey: SETTING_KEYS.GATHERING_CONFIG,
      nowWorldTime: () => Number(game.time?.worldTime || 0),
      getUserId: () => game.user?.id || null,
      hooks: Hooks,
      evaluateExpression: evaluateGatheringExpression,
      // Calendar-aware regen/respawn intervals: day/week lengths track the active
      // Foundry V13 world calendar (falls back to the Earth table when none).
      // Resolved per call so a mid-session calendar reconfig is picked up.
      secondsPerUnit: (unit) => secondsPerUnitFromCalendar(unit, game.time?.calendar ?? null),
      // Interactable-scoped node seams (issue 302): resolve a behaviour by ref and
      // route its scoped-node write through the active GM.
      resolveRegionBehavior: (ref) => resolveInteractableBehaviorByRef(ref),
      writeInteractableBehavior: (ref, patch) => writeInteractableBehaviorNode(ref, patch)
    });
    gatheringEngine = new GatheringEngine({
      // Load-bearing: without it every connected client resumes the same matured
      // timed run and double-applies its items, tool wear and node depletion.
      resumeTimedRuns: isPrimaryGM,
      environmentStore: this.gatheringEnvironmentStore,
      runManager: this.gatheringRunManager,
      richState: this.gatheringRichStateService,
      evaluator: this.gatheringGateAndCheckEvaluator,
      systemManager: this.craftingSystemManager,
      getSelectableActors: getGatheringSelectableActors,
      isActorSelectable: ({ actor, viewer }) => isGatheringActorSelectableByUser(actor, viewer),
      isGamePaused: isCurrentWorldPaused,
      sceneAccess: createGatheringSceneAccess({
        getCurrentScene: () => game.scenes?.current ?? game.scene ?? globalThis.canvas?.scene ?? null
      }),
      toolAvailability: createGatheringToolAvailability({
        craftingSystemManager: this.craftingSystemManager,
        evaluator: this.gatheringGateAndCheckEvaluator
      }),
      resultCreator: createGatheringResultCreator(this.craftingSystemManager),
      toolBreakage: createGatheringToolBreakage({
        craftingSystemManager: this.craftingSystemManager,
        evaluateExpression: evaluateGatheringExpression
      }),
      failureFeedback: createGatheringFailureFeedback(),
      // Publishes the documented public `fabricate.gathering.*` integration hooks
      // on terminal completion for other module authors to subscribe to.
      hookPublisher: new GatheringHookPublisher({
        hooks: Hooks,
        nowWorldTime: () => Number(game.time?.worldTime || 0)
      }),
      eventSceneTrigger: createEventSceneTrigger({
        isGM: () => !!game.user?.isGM,
        emitPrompt: ({ sceneUuid, eventName }) => game.socket?.emit(EVENT_SCENE_SOCKET, {
          action: 'eventScenePrompt', sceneUuid, eventName, requestedBy: game.user?.id
        }),
        showPrompt: showEventScenePrompt
      }),
      getRunViewer: getGatheringRunViewer,
      locationResolver: this.gatheringLocationService,
      travelStore: this.gatheringRealmStore,
      localize: localizeGathering,
      // Interactable-scoped node respawn enumeration (issue 302): scan scenes for
      // scoped-node behaviours and route the changed `system.node` write through the
      // active GM (same edge the config panel uses).
      scenes: () => game.scenes ?? null,
      applyInteractableBehaviorUpdate: (ref, update) =>
        applyInteractableBehaviorUpdate({
          sceneId: ref?.sceneId,
          regionId: ref?.regionId,
          behaviorId: ref?.behaviorId,
          update
        })
    });
    // Issue 901. A blind run's secret state — the drawn task, its start-time
    // snapshot, and its provisional node reservation — lives in the
    // `gatheringBlindRuns` WORLD setting, which only a GM may update. That is the
    // integrity boundary: a player can still READ world state (Foundry has no
    // server-side read authorization) but can no longer FORGE the task their run
    // will yield, which they could when it sat on an Actor flag they own.
    this.gatheringBlindRunStore = new GatheringBlindRunStore({
      getSetting,
      setSetting,
      settingKey: SETTING_KEYS.GATHERING_BLIND_RUNS,
      // Load-bearing: the active GM is the SINGLE writer. `game.settings.set`
      // replaces rather than merges and there is no compare-and-set anywhere, so a
      // second concurrent writer would clobber another run's record.
      isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
      // Liveness: a record only counts while its run is still active. This is what
      // keeps a reservation PROVISIONAL under every path that never reaches the
      // maturity release — a GM deleting the environment, task, or actor.
      isRunActive: ({ actorUuid, runId }) => {
        const resolve = globalThis.fromUuidSync;
        if (typeof resolve !== 'function' || !actorUuid || !runId) return true;
        let runActor = null;
        try { runActor = resolve(String(actorUuid)); } catch (_) { runActor = null; }
        if (!runActor) return false;
        return Boolean(this.gatheringRunManager?.getActiveRun?.(runActor, runId));
      },
      nowWorldTime: () => Number(game.time?.worldTime || 0)
    });
    // Only a GM may write that setting, and — more importantly — the blind DRAW
    // must happen somewhere the acting player cannot rig it. A player's blind
    // timed start is therefore routed to the active GM over the same
    // `module.fabricate` channel the node-depletion relay already uses (issue 983),
    // and the GM re-runs the whole attempt with the requesting user as the viewer.
    this.gatheringBlindStartWriter = createGatheringBlindStartWriter({
      isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
      hasActiveGM: () => !!game.users?.activeGM,
      onUnroutable: ({ environmentId }) => console.warn(
        'Fabricate | Blind gathering start was not applied: no active GM is connected to write the world setting',
        { environmentId }
      ),
      emitStart: (message) => game.socket?.emit(EVENT_SCENE_SOCKET, message),
      // The local-apply branch (this client IS the active GM) has no socket sender
      // to attest, so supply the current user. Reached only if a GM ever routes its
      // own start; the engine short-circuits before that, because a client that may
      // write the setting never relays.
      applyStart: (payload) => applyGatheringBlindStart({ senderId: game.user?.id, ...payload })
    });
    gatheringEngine.installBlindRunRelay({
      store: this.gatheringBlindRunStore,
      relayStart: (args) => this.gatheringBlindStartWriter.start(args)
    });
    // A complication's GM-only card and its macro must happen on a GM client: a player
    // cannot author a message as the GM (it would render in the player's own sidebar),
    // and a macro run on the acting client would carry the acting client's authority.
    // Relayed over the same `module.fabricate` channel, addressing only — the elected GM
    // re-reads the authored complication from its own `craftingSystems` record (issue
    // 1286). On the elected GM's own client the writer applies locally, because a
    // broadcast excludes the emitter.
    this.complicationDeliveryWriter = createComplicationDeliveryWriter({
      isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
      hasActiveGM: () => !!game.users?.activeGM,
      // Unlike the blind-start relay this DROPS rather than blocks: a complication is
      // strictly downstream of a committed award, so refusing it would strand a
      // completed craft. The award, the player-facing card and the run record are
      // already written and stay unaffected; only the GM-only card and the macro are
      // lost, and there is no store to defer them into.
      onUnroutable: ({ resolutionId }) => console.warn(
        'Fabricate | Complications were not delivered: no active GM is connected to run them',
        { resolutionId }
      ),
      // Minted here rather than inside the socket module, which touches no Foundry
      // global. `randomID` and not `Math.random()`.
      mintResolutionId: () => globalThis.foundry?.utils?.randomID?.(),
      emitComplications: (message) => game.socket?.emit(EVENT_SCENE_SOCKET, message),
      // The local-apply branch (this client IS the elected GM) has no socket sender to
      // attest, so supply the current user — who is, on that branch, the acting user.
      applyComplications: (payload) => applyComplicationDelivery({ senderId: game.user?.id, ...payload })
    });
    // EXPLICIT injection into both engines that fire complications. Each engine also falls
    // back to `game.fabricate.complicationDeliveryWriter`, but a seam only the fallback ever
    // satisfies is not a seam: it cannot be substituted in a test that constructs its own
    // engine, and it makes the wiring invisible at the bootstrap site. Optional-chained
    // because `craftingEngine` is assigned during `initialize()` and a future reorder must
    // not be able to take the whole boot down over a narrative beat.
    this.craftingEngine?.installComplicationDelivery({ writer: this.complicationDeliveryWriter });
    gatheringEngine?.installComplicationDelivery({ writer: this.complicationDeliveryWriter });
    // Housekeeping that drops entries naming deleted content. Each pass is
    // INDEPENDENTLY guarded (issue 970): they write to actor documents, and a
    // refused or otherwise failed write must never prevent `this.ready` below —
    // every facade method throws through `_requireReady()`, so one stale entry
    // Foundry declined to clean would take the whole module down for that client.
    // Each pass is also scoped to the actors this client owns (see
    // `selectWritableActors`), so a refusal should no longer be reachable at all;
    // this guard is the belt to that braces.
    //
    // The pass list itself is composed by `composeStartupPassList` (issue 1224), which
    // computes the valid-id sets and omits any pass no entity kind declares. The call sits
    // BELOW both `initialize()` calls so the id sets are derived from the corpus this boot
    // actually loaded, and `getSetting` is passed as the ACCESSOR rather than a value read
    // earlier in this method.
    this._startupMarks.begin(STARTUP_PHASES.STARTUP_MAINTENANCE);
    await runStartupMaintenance(composeStartupPassList({
      recipeManager: this.recipeManager,
      craftingSystemManager: this.craftingSystemManager,
      craftingRunManager: this.craftingRunManager,
      salvageRunManager: this.salvageRunManager,
      recipeVisibilityService: this.recipeVisibilityService,
      getSetting,
      setSetting,
      resolveGatheringActor,
      isSelectableGatheringActor
    }));
    this._startupMarks.end(STARTUP_PHASES.STARTUP_MAINTENANCE);

    registerFragmentDiscoveryHook(this.craftingSystemManager, this.recipeVisibilityService);
    registerRecipeItemLearningHook(this.recipeVisibilityService);

    // Close the outer span BEFORE readiness is announced, so anything waiting on
    // `whenReady()` observes a complete `fabricate:initialize` measure. It sits ABOVE
    // `this.ready = true` deliberately: `tests/components/manager-launch-readiness.test.js`
    // pins `this.ready = true;` and `this._resolveReady?.();` as adjacent lines, and that
    // adjacency is the guard against readiness drifting away from the flag it announces.
    this._startupMarks.end(STARTUP_PHASES.INITIALIZE);
    this.ready = true;
    this._resolveReady?.();
    console.log('Fabricate | Ready');
  }


  /**
   * Run versioned startup data migrations via MigrationRunner.
   *
   * @returns {Promise<void>}
   */
  async _runMigrations() {
    // Primary-GM only, so exactly one client runs the migration pass in a multi-GM
    // world and no player/assistant races the world-scoped setting writes. `isGM` is
    // true for assistant GMs too (they hold SETTINGS_MODIFY), so an `isGM` gate would
    // let the full GM AND every assistant transform-and-write concurrently
    // (last-writer-wins); `activeGM` fires on exactly one client. Mirrors the
    // primary-GM startup writers below (runRecipeItemFlagAutoStamp et al.).
    if (game.users?.activeGM?.id !== game.user?.id) return;
    const runner = new MigrationRunner({
      getSetting,
      setSetting,
      // GM-only interactive recovery prompt (DialogV2). The runner invokes this
      // seam on a fatal abort with { downgradeTo, documents, label }; we build a
      // Foundry-free config via the pure helper and open DialogV2 here. The
      // "Keep existing data" choice is the default and matches the runner's
      // already-applied behavior (rollback, persist nothing, version unchanged).
      // The fix/retry choice is informational only: retry is explicit and
      // user-initiated — the GM fixes/deletes the failed documents and RELOADS
      // Foundry, at which point migrations re-run automatically because
      // migrationVersion was not advanced. There is NO same-pass auto-retry.
      promptRecovery: (context) => this._promptMigrationRecovery(context)
    });
    const summary = await runner.run();

    // Deferred pass (issue 1242): a corpus could not be read, or a writeback
    // leg failed, so the pass persisted nothing and left `migrationVersion` where it found it.
    // This is NOT an abort — there is no failed document to remediate and no downgrade target
    // to recommend — so it gets its own permanent GM notice rather than the recovery dialog.
    // Placed ABOVE the abort branch because a deferred summary reports `aborted: false`.
    if (summary?.deferred === true) {
      console.error(`Fabricate | migration pass deferred (${summary.deferredReason})`, summary.deferredError ?? '');
      if (game.user?.isGM) {
        // A COMPLETE localized sentence per reason; only the writeback failure instructs a
        // reload, and that distinction is the point. On a writeback failure the migrations
        // have already transformed this session's live setting values, so a GM who keeps
        // working writes migrated records back under an un-advanced version. The read
        // failure refuses before any migration runs, so nothing in the session was touched.
        const key = MIGRATION_DEFERRAL_NOTICES[summary.deferredReason] ?? MIGRATION_DEFERRAL_NOTICES[MIGRATION_DEFERRAL_REASONS.CORPUS_READ_FAILED];
        const message = game.i18n?.localize?.(key) || key;
        ui.notifications?.error?.(message, { permanent: true });
      }
      return;
    }

    // Aborted pass: a fatal migration error rolled the in-memory data back and
    // persisted nothing (migrationVersion is unchanged). Surface a GM-facing error
    // notification and return early WITHOUT firing any success notices. Detailed
    // per-document recovery guidance is already emitted to the console by the runner.
    if (summary?.aborted === true) {
      if (game.user?.isGM) {
        const message = game.i18n?.localize?.('FABRICATE.Migration.Aborted.Notice')
          || "Fabricate migration aborted. This pass saved nothing: your stored data is exactly as it was before this startup. Reload Foundry to discard this session's partly-migrated copy, then see the console (F12) for per-document recovery guidance.";
        ui.notifications?.error?.(message);
      }
      return;
    }

    // One-time GM-facing notice: when the 0.6.0 migration actually converted catalysts into
    // shared library Tools, tell the GM (so they know where the catalyst data went). GM-only
    // and only when something was migrated; the pure migration stays free of edge effects.
    const migratedCount = Number(summary?.migratedCatalystCount || 0);
    if (migratedCount > 0 && game.user?.isGM) {
      const message = game.i18n?.format?.('FABRICATE.Migration.CatalystsToTools.Notice', { count: migratedCount })
        || `Fabricate migrated ${migratedCount} catalyst(s) to the Tools library. Find them under the Tools tab.`;
      ui.notifications?.info?.(message);
    }

    // One-time GM-facing notice: when the 0.9.0 migration unified legacy realms on
    // one or more systems, name them so the GM can re-enable Travel & Realms (the
    // subsystem stays disabled by default) and knows realm-scoped records may now
    // appear in more environments. GM-only; only when something was migrated.
    const unifiedRegionSystems = Array.isArray(summary?.unifiedRegionSystems) ? summary.unifiedRegionSystems : [];
    if (unifiedRegionSystems.length > 0 && game.user?.isGM) {
      const systemList = unifiedRegionSystems.join(', ');
      const message = game.i18n?.format?.('FABRICATE.Migration.UnifyRegions.Notice', { systems: systemList })
        || `Fabricate unified gathering realms for: ${systemList}. Travel & Realms is disabled by default — enable it per system. Realm-scoped tasks/events may now appear in more environments.`;
      ui.notifications?.info?.(message);
    }

    // One-time GM-facing notice: when the 1.6.0 migration removed the legacy routed
    // result-selection providers, dropping roll-table references (the draw mechanism
    // is gone) and stripping gathering-task result selections. Name the affected
    // recipes/tasks so the GM can reconfigure them; routed gathering tasks now resolve
    // via the system gathering check, so the GM must populate
    // `gatheringCraftingCheck.routed.rollFormula` for any stripped task. GM-only; only
    // when something was actually dropped or stripped.
    const removedProviders = summary?.removedResultSelectionProviders ?? null;
    const droppedRollTableRecipes = Array.isArray(removedProviders?.droppedRollTableRecipes)
      ? removedProviders.droppedRollTableRecipes : [];
    const strippedGatheringTasks = Array.isArray(removedProviders?.strippedGatheringTasks)
      ? removedProviders.strippedGatheringTasks : [];
    if ((droppedRollTableRecipes.length > 0 || strippedGatheringTasks.length > 0) && game.user?.isGM) {
      // Console recovery log naming the affected recipes/tasks. Routed gathering tasks now
      // resolve via the system gathering check, so the GM must populate
      // `gatheringCraftingCheck.routed.rollFormula` for any stripped task. The localized GM
      // toast + lang key ride PR-2 of #424 (the UI PR that carries screenshot evidence).
      console.warn(
        'Fabricate | 1.6.0 migration removed legacy result-selection providers. ' +
          'Populate gatheringCraftingCheck.routed.rollFormula for any stripped gathering task. Affected items:',
        { droppedRollTableRecipes, strippedGatheringTasks }
      );
    }

    // One-time GM-facing notice: when the 1.17.0 essence-group migration disabled
    // recipes to clear a newly-introduced alchemy signature collision (folding
    // per-set essences into signature-bearing groups can overlap two sets). Name the
    // disabled recipes so the GM can rework and re-enable them.
    const essenceCollisionDisabledRecipes = Array.isArray(summary?.essenceCollisionDisabledRecipes)
      ? summary.essenceCollisionDisabledRecipes
      : [];
    if (essenceCollisionDisabledRecipes.length > 0 && game.user?.isGM) {
      const recipeList = essenceCollisionDisabledRecipes.join(', ');
      const message = game.i18n?.format?.('FABRICATE.Migration.EssenceGroups.CollisionNotice', {
        recipes: recipeList,
      }) || `Fabricate disabled ${essenceCollisionDisabledRecipes.length} alchemy recipe(s) whose essence requirements now collide: ${recipeList}. Rework their ingredients and re-enable them.`;
      ui.notifications?.warn?.(message);
    }

    // One-time GM-facing notice: the 1.21.0 migration retired the check-modifier
    // roll-formula placeholder, and its consequences are behaviour changes rather than
    // no-ops. PRIMARY-GM ONLY, not merely GM-only: `_runMigrations` returns early unless
    // `game.users?.activeGM?.id === game.user?.id`, so exactly one client in a multi-GM
    // world posts this and an assistant GM (who holds `isGM`) never does.
    //
    // THE COMPOSITION IS NOT HERE. Totals, clause selection, the systems list and the
    // severity all live in `buildRetiredCraftingModNotice`, because nothing in this file
    // can be executed by a unit test and a source-text grep can pin a DISPATCH but never a
    // SUM — three semantic mutations to that arithmetic survived a green suite while it
    // lived inline. What remains here is the Foundry edge: the GM gate, the localizer, and
    // which notification channel the composed severity selects.
    const retiredCraftingModCounts = Array.isArray(summary?.retiredCraftingModCounts)
      ? summary.retiredCraftingModCounts : [];
    if (retiredCraftingModCounts.length > 0 && game.user?.isGM) {
      const notice = buildRetiredCraftingModNotice(
        retiredCraftingModCounts,
        (key, data) => game.i18n?.format?.(key, data)
      );
      if (notice.severity === 'warn') ui.notifications?.warn?.(notice.message, { permanent: true });
      else ui.notifications?.info?.(notice.message);
    }

    // One-time GM-facing notice: the 1.23.0 migration merged each system's two modifier
    // libraries into one, and where the same id was authored in BOTH the gathering entry
    // was RE-KEYED. That is a visible rename in the authoring surface — the GM opens
    // Modifiers and finds `strength-gathering` beside `strength` — so it is reported
    // rather than left to be discovered. Only systems that actually collided are listed;
    // a clean merge is silent. PRIMARY-GM ONLY, like every notice above it, because
    // `_runMigrations` returns early unless this client is the active GM.
    const unifiedModifierCollisions = Array.isArray(summary?.unifiedModifierCollisions)
      ? summary.unifiedModifierCollisions : [];
    if (unifiedModifierCollisions.length > 0 && game.user?.isGM) {
      const total = unifiedModifierCollisions.reduce((sum, entry) => sum + entry.collisions, 0);
      const systemList = unifiedModifierCollisions.map((entry) => entry.system).join(', ');
      const message = game.i18n?.format?.('FABRICATE.Migration.UnifyModifiers.CollisionNotice', {
        count: total,
        systems: systemList,
      }) || `Fabricate merged each system's check modifiers and gathering character modifiers into one Modifiers library. ${total} gathering modifier(s) in ${systemList} shared an id with a check modifier and were renamed with a "-gathering" suffix; every reference to them was updated. Review them under System settings › Modifiers.`;
      ui.notifications?.warn?.(message, { permanent: true });
    }

    // 1.28.0 (issue 1308): the character-library id collisions where two systems disagreed about
    // what an id MEANS. Identical copies are filtered out upstream, so everything here changed a
    // real rule — and the change is INVISIBLE without this notice, because the reference still
    // resolves. It resolves to the other system's definition, so a book that gated learning at
    // rank 2 now gates at rank 1 with nothing on screen to say so. The migration's own label
    // promises the GM this report by name; permanent, for the reason the sibling above is.
    const characterLibraryCollisions = Array.isArray(summary?.characterLibraryCollisions)
      ? summary.characterLibraryCollisions : [];
    if (characterLibraryCollisions.length > 0 && game.user?.isGM) {
      const names = [...new Set(characterLibraryCollisions.map((entry) => entry.entryId))].join(', ');
      const message = game.i18n?.format?.('FABRICATE.Migration.CharacterLibraries.CollisionNotice', {
        count: characterLibraryCollisions.length,
        entries: names,
      }) || `Fabricate merged every crafting system's character prerequisites and modifiers into one world library. ${characterLibraryCollisions.length} entr(ies) shared an id across systems but were defined differently, so only one definition survived: ${names}. Every reference still resolves, but it now resolves to the surviving rule — review them under World › Rules & Resources.`;
      ui.notifications?.warn?.(message, { permanent: true });
    }

    // 1.30.0 (issue 1363): what the world-scope entity migration actually did. The composition
    // is NOT here — the counts, the rename list, the refusals and the references that already
    // resolve to nothing (which the pass REPORTS and never prunes) all live in
    // `buildWorldScopeEntityNotice`, because nothing in this file can be executed by
    // a unit test and a source-text grep can pin a DISPATCH but never a SUM. What remains here is
    // the Foundry edge: the GM gate, the localizer, and the channel.
    //
    // The report is `null` unless the migration ran, and this consumer is guarded on it, so an
    // omission anywhere in the four threading legs fails SILENT and the notice simply never
    // appears — which is why the notice's PRESENCE is asserted by test rather than inferred.
    const worldScopeEntityReport = summary?.worldScopeEntityReport ?? null;
    if (worldScopeEntityReport && game.user?.isGM) {
      const notice = buildWorldScopeEntityNotice(worldScopeEntityReport, (key, data) =>
        data ? game.i18n?.format?.(key, data) : game.i18n?.localize?.(key)
      );
      if (notice.message) {
        if (notice.severity === 'warn') ui.notifications?.warn?.(notice.message, { permanent: true });
        else ui.notifications?.info?.(notice.message);
      }
    }
  }

  /**
   * Thin Foundry edge for the GM migration-abort recovery prompt.
   *
   * GM-only and defensive (never throws): a failure to open the dialog must not
   * break startup — the console guidance and the aborted error notification
   * already covered the GM. Builds the dialog config via the pure
   * `buildMigrationRecoveryPrompt` helper, then opens `DialogV2` with both
   * choices and "Keep existing data" pre-selected as the default.
   *
   * @param {{ downgradeTo?: string|null, documents?: object[], label?: string }} context
   *   abort context from the MigrationRunner `promptRecovery` seam.
   */
  async _promptMigrationRecovery(context) {
    try {
      if (!game.user?.isGM) return;
      const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
      if (!DialogV2?.wait && !DialogV2?.prompt) return;

      const localize = (key, data) =>
        data ? game.i18n?.format?.(key, data) ?? key : game.i18n?.localize?.(key) ?? key;
      const config = buildMigrationRecoveryPrompt(context, localize);

      const buttons = config.buttons.map((button) => ({
        action: button.action,
        label: button.label,
        default: button.default
      }));

      // DialogV2.wait resolves to the chosen action; both choices are
      // informational here (the runner already kept existing data). Closing the
      // dialog is equivalent to "Keep existing data".
      await DialogV2.wait({
        window: { title: config.title },
        content: config.content,
        buttons,
        default: config.default,
        rejectClose: false
      });
    } catch (error) {
      console.warn(`Fabricate | Failed to present migration recovery prompt: ${error?.message ?? error}`);
    }
  }

  /**
   * Register module settings
   */
  registerSettings() {
    registerFabricateSettings();
  }

  /**
   * Get the recipe manager instance
   */
  getRecipeManager() {
    return this.recipeManager;
  }

  /**
   * Get the crafting engine instance.
   *
   * `COMPANION`'s `handle` tier (issue 1289): the promise is the accessor's name and that it
   * answers the object Fabricate itself uses, or `null` before {@link Fabricate#initialize}
   * has run, not a promise about `CraftingEngine`'s method surface. The one carved-out
   * exception is `findComponentItems`, declared at the same tier with its own deviations —
   * it takes documents, not ids, and throws on a null actor or a null component.
   *
   * `craftingEngine` is `null` from the constructor and reassigned in `initialize()`, so this
   * answers `null` before readiness because it is never ready-gated, not because it checks.
   *
   * @returns {CraftingEngine|null}
   */
  getCraftingEngine() {
    return this.craftingEngine;
  }

  /**
   * Re-run the `1.30.0` world-scope identity-flag repair (issue 1363).
   *
   * A GM-FACING RECOVERY ACTION, not a test hook. It is reachable exactly when the boot-time
   * one-shot has WITHHELD itself, which it does in two states it reports rather than hides:
   *
   * - a TORN MIGRATION leaves the re-key map pending, and the pass declines to consume a
   *   decision record the next boot may still need;
   * - a PARTIAL REMAP - one or more documents whose write was rejected, counted as
   *   `skippedErrors` - withholds the clear too, because a transient rejection is a failure a
   *   re-run can genuinely fix.
   *
   * Both states leave the map PENDING, which is what makes this method reachable at all: once
   * the boot pass clears the map there is nothing left to remap and this answers `null`. A
   * LOCKED-PACK skip is deliberately not one of those states - a locked compendium is a standing
   * condition a re-run cannot improve, so it is reported and the map is still cleared.
   *
   * **ACTIVE-GM ONLY**, matching {@link runWorldScopeIdentityFlagRemap}. That is a
   * SINGLE-WRITER rule rather than a permission check: `game.fabricate` is bound on every
   * client and the pass walks the UNFILTERED actor collection, so a player invoking it would
   * have every write it does not own rejected by the server - one red toast per refusal, and
   * every one of them mis-booked as a locked-pack skip.
   *
   * IDEMPOTENT. It performs the remap ONLY; it does not clear the map or advance the one-shot
   * version, so the ordinary boot-time gating still decides when the decision record may be
   * destroyed.
   *
   * @returns {Promise<object|null>} the pass summary; `null` when this client is not the active
   *   GM, or when no re-key is pending.
   */
  async remapWorldScopeIdentityFlags() {
    if (game.users?.activeGM?.id !== game.user?.id) {
      console.warn(
        'Fabricate | world-scope identity repair declined: it writes across every actor in the world, so it runs on the ACTIVE GM alone. Ask the active GM to run it, or take over as active GM first.'
      );
      return null;
    }
    const rekeyMap = getSetting(SETTING_KEYS.WORLD_SCOPE_REKEY_MAP) ?? {};
    if (!hasPendingWorldScopeRekey(() => rekeyMap)) return null;
    return applyWorldScopeIdentityFlagRemap(rekeyMap);
  }

  /**
   * Get the crafting system manager instance
   */
  getCraftingSystemManager() {
    return this.craftingSystemManager;
  }

  /**
   * Get the crafting run manager instance
   */
  getCraftingRunManager() {
    return this.craftingRunManager;
  }

  getSalvageRunManager() {
    return this.salvageRunManager;
  }

  /**
   * Get the gathering environment store.
   *
   * This exposes persisted environment management without exposing the
   * module-internal GatheringEngine.
   *
   * @returns {GatheringEnvironmentStore|null}
   */
  getGatheringEnvironmentStore() {
    return this.gatheringEnvironmentStore;
  }

  /**
   * Get the Fabricate-managed gathering party store (world-level parties).
   *
   * @returns {GatheringPartyStore|null}
   */
  getGatheringPartyStore() {
    this._requireReady();
    return this.gatheringPartyStore;
  }

  /**
   * Get the world currency configuration store (issue 1278).
   *
   * World scope, not per crafting system: a world runs one Foundry game system and so has
   * one way actors store coins. A crafting system decides only whether it participates.
   *
   * DELIBERATELY NOT `_requireReady()`-gated, matching the coin-spender accessors below and
   * for the same reason: this is the global fallback `getCurrencyRequirementConfig` reads when
   * no seam was injected. That resolver guards the call with optional chaining, which catches an
   * absent accessor but NOT a thrown error, so a readiness throw here would surface as a crash on
   * the craftability path rather than the empty ladder the resolver is written to tolerate.
   *
   * @returns {CurrencyConfigStore|null}
   */
  getCurrencyConfigStore() {
    return this.currencyConfigStore ?? null;
  }

  /**
   * Get the world character libraries store (issue 1308): the character-prerequisite library and
   * the modifier library.
   *
   * World scope, not per crafting system, because both resolve against the acting CHARACTER.
   * Nothing stays per system — there is no participation flag to consult.
   *
   * DELIBERATELY NOT `_requireReady()`-gated, for the reason `getCurrencyConfigStore` above is
   * not: these libraries gate craftability, learning and tool usability, and every call site
   * guards with optional chaining, which catches an absent accessor but NOT a throw. A readiness
   * throw here would surface as a crash on the craftability path rather than the unknown basis
   * those callers are written to tolerate.
   *
   * @returns {CharacterLibrariesStore|null}
   */
  getCharacterLibrariesStore() {
    return this.characterLibrariesStore ?? null;
  }

  /**
   * Get the world COMPONENT scope store (issue 1359, epic 1357).
   *
   * DELIBERATELY NOT `_requireReady()`-gated, matching {@link Fabricate#getCurrencyConfigStore} and
   * {@link Fabricate#getCharacterLibrariesStore} and emphatically NOT
   * {@link Fabricate#getGatheringRealmStore}: `CraftingSystemManager` resolves this lazily during
   * `initialize()`, and its call site guards with optional chaining, which absorbs an ABSENT
   * accessor but not a THROW. A readiness throw here would surface as a crash inside
   * `_normalizeSystem` — the issue-970 shape, where the manager never initializes at all — rather
   * than as the unknown basis that call site is written to tolerate.
   *
   * @returns {object|null}
   */
  getComponentScopeStore() {
    return this.componentScopeStore ?? null;
  }

  /**
   * Get the world ESSENCE scope store (issue 1359). Ungated, for
   * {@link Fabricate#getComponentScopeStore}'s reason.
   *
   * @returns {object|null}
   */
  getEssenceScopeStore() {
    return this.essenceScopeStore ?? null;
  }

  /**
   * Get the world TOOL scope store (issue 1359). Ungated, for
   * {@link Fabricate#getComponentScopeStore}'s reason. It carries the WORLD tool-breakage
   * authority beside the three sub-keys.
   *
   * @returns {object|null}
   */
  getToolScopeStore() {
    return this.toolScopeStore ?? null;
  }

  /**
   * Get the per-system gathering realm store.
   *
   * @returns {GatheringRealmStore|null}
   */
  getGatheringRealmStore() {
    this._requireReady();
    return this.gatheringRealmStore;
  }

  /**
   * @deprecated Use {@link getGatheringRealmStore}.
   * @returns {GatheringRealmStore|null}
   */
  getGatheringRegionStore() {
    deprecate('getGatheringRegionStore', 'getGatheringRealmStore');
    return this.getGatheringRealmStore();
  }

  /**
   * Get the current-realm resolver used for location-aware gathering.
   *
   * @returns {GatheringLocationService|null}
   */
  getGatheringLocationService() {
    this._requireReady();
    return this.gatheringLocationService;
  }

  /**
   * Read redaction-safe current-realm evidence for a selected actor, gated on a system.
   * Player-callable: the result reports only the resolved source token and
   * disclosure-safe realm display data, never raw secret realm records.
   *
   * @param {{ actorId?: string, actor?: object, systemId: string }} options
   * @returns {{ resolved: boolean, source: string, realms: object[], realmIds: string[], staleRealmIds: string[] }|null}
   */
  getGatheringLocationForActor({ actorId = null, actor = null, systemId = null } = {}) {
    this._requireReady();
    const resolvedActor = actor || (actorId ? game.actors?.get(actorId) : null);
    if (!resolvedActor || !systemId) return null;
    // Realm/travel disabled for this system ⇒ no location surface at all.
    if (!isGatheringRealmsEnabled(this.craftingSystemManager?.getSystem(systemId))) return null;
    const context = this.gatheringLocationService?.buildCurrentRealmContext({ actor: resolvedActor });
    if (!context) return null;
    const isGM = game.user?.isGM === true;
    // Reveal mode and realm discovery are both WORLD facts now (issue 1282). `systemId` above
    // remains the GATE — whether this system surfaces a location at all — and nothing more.
    const revealMode = getRealmRevealMode(this.gatheringRealmStore?.get?.());
    const discoveredRealmIds = getDiscoveredRealmIds(resolvedActor);
    return buildLocationSummaryForViewer({ context, isGM, revealMode, discoveredRealmIds });
  }

  /**
   * Set a party's manual current-realm override. GM-only.
   *
   * A party has ONE override since issue 1282, so `systemId` gates the write — whether that
   * system participates in travel — rather than selecting which override is written.
   *
   * @param {{ partyId: string, systemId: string, realmIds?: string[] }} options
   * @returns {Promise<object|null>}
   */
  setGatheringPartyRealmOverride({ partyId = null, systemId = null, realmIds = [] } = {}) {
    this._requireReady();
    this._requireGM();
    if (!partyId || !systemId) return null;
    // Realm/travel disabled ⇒ no-op (no override writes).
    if (!isGatheringRealmsEnabled(this.craftingSystemManager?.getSystem(systemId))) return null;
    return this.gatheringPartyStore?.setCurrentRealmOverride(partyId, realmIds);
  }

  /**
   * @deprecated Use {@link setGatheringPartyRealmOverride}.
   * @param {{ partyId: string, systemId: string, regionIds?: string[] }} options
   * @returns {Promise<object|null>}
   */
  setGatheringPartyRegionOverride({ partyId = null, systemId = null, regionIds = [] } = {}) {
    deprecate('setGatheringPartyRegionOverride', 'setGatheringPartyRealmOverride');
    return this.setGatheringPartyRealmOverride({ partyId, systemId, realmIds: regionIds });
  }

  /**
   * Clear a party's current-realm override for one crafting system (stamped,
   * empties realmIds). GM-only.
   *
   * @param {{ partyId: string, systemId: string }} options
   * @returns {Promise<object|null>}
   */
  clearGatheringPartyRealmOverride({ partyId = null, systemId = null } = {}) {
    this._requireReady();
    this._requireGM();
    if (!partyId || !systemId) return null;
    // Realm/travel disabled ⇒ no-op (no override writes).
    if (!isGatheringRealmsEnabled(this.craftingSystemManager?.getSystem(systemId))) return null;
    return this.gatheringPartyStore?.clearCurrentRealmOverride(partyId);
  }

  /**
   * @deprecated Use {@link clearGatheringPartyRealmOverride}.
   * @param {{ partyId: string, systemId: string }} options
   * @returns {Promise<object|null>}
   */
  clearGatheringPartyRegionOverride({ partyId = null, systemId = null } = {}) {
    deprecate('clearGatheringPartyRegionOverride', 'clearGatheringPartyRealmOverride');
    return this.clearGatheringPartyRealmOverride({ partyId, systemId });
  }

  /**
   * Reveal a realm's discovery on an actor. GM-only; validates the realm exists in the WORLD
   * library before writing. `systemId` is the participation gate, not an ownership claim.
   *
   * @param {{ actorId?: string, actor?: object, systemId: string, realmId: string, source?: string, partyId?: string }} options
   * @returns {Promise<boolean>}
   */
  revealGatheringRealmForActor({ actorId = null, actor = null, systemId = null, realmId = null, source = 'manual', partyId = null } = {}) {
    this._requireReady();
    this._requireGM();
    const resolvedActor = actor || (actorId ? game.actors?.get(actorId) : null);
    if (!resolvedActor || !systemId || !realmId) return Promise.resolve(false);
    const system = this.craftingSystemManager?.getSystem(systemId);
    // Realm/travel disabled ⇒ no-op (no discovery writes).
    if (!isGatheringRealmsEnabled(system)) return Promise.resolve(false);
    // `systemId` above stays the GATE — whether this system surfaces travel at all. The realm
    // itself is validated against the WORLD library (issue 1282), and the discovery it writes
    // is world-wide.
    return revealGatheringRealm(resolvedActor, {
      realmId,
      source,
      partyId,
      validateRealmExists: this.gatheringRealmStore?.get?.(),
      now: () => Date.now()
    });
  }

  /**
   * @deprecated Use {@link revealGatheringRealmForActor}.
   * @param {{ actorId?: string, actor?: object, systemId: string, regionId: string, source?: string, partyId?: string }} options
   * @returns {Promise<boolean>}
   */
  revealGatheringRegionForActor({ actorId = null, actor = null, systemId = null, regionId = null, source = 'manual', partyId = null } = {}) {
    deprecate('revealGatheringRegionForActor', 'revealGatheringRealmForActor');
    return this.revealGatheringRealmForActor({ actorId, actor, systemId, realmId: regionId, source, partyId });
  }

  /**
   * Hide (remove) a realm's discovery on an actor. GM-only.
   *
   * @param {{ actorId?: string, actor?: object, systemId: string, realmId: string }} options
   * @returns {Promise<boolean>}
   */
  hideGatheringRealmForActor({ actorId = null, actor = null, systemId = null, realmId = null } = {}) {
    this._requireReady();
    this._requireGM();
    const resolvedActor = actor || (actorId ? game.actors?.get(actorId) : null);
    if (!resolvedActor || !systemId || !realmId) return Promise.resolve(false);
    // Realm/travel disabled ⇒ no-op (no discovery writes).
    if (!isGatheringRealmsEnabled(this.craftingSystemManager?.getSystem(systemId))) return Promise.resolve(false);
    return hideGatheringRealm(resolvedActor, { realmId });
  }

  /**
   * @deprecated Use {@link hideGatheringRealmForActor}.
   * @param {{ actorId?: string, actor?: object, systemId: string, regionId: string }} options
   * @returns {Promise<boolean>}
   */
  hideGatheringRegionForActor({ actorId = null, actor = null, systemId = null, regionId = null } = {}) {
    deprecate('hideGatheringRegionForActor', 'hideGatheringRealmForActor');
    return this.hideGatheringRealmForActor({ actorId, actor, systemId, realmId: regionId });
  }

  /**
   * Get the gathering run manager.
   *
   * @returns {GatheringRunManager|null}
   */
  getGatheringRunManager() {
    return this.gatheringRunManager;
  }

  /**
   * Get the gathering gate/check evaluator.
   *
   * @returns {GatheringGateAndCheckEvaluator|null}
   */
  getGatheringGateAndCheckEvaluator() {
    return this.gatheringGateAndCheckEvaluator;
  }

  getGatheringRichStateService() {
    return this.gatheringRichStateService;
  }

  /**
   * Get the recipe visibility service instance
   */
  getRecipeVisibilityService() {
    return this.recipeVisibilityService;
  }

  getResolutionModeService() {
    return this.resolutionModeService;
  }

  getItemPilesIntegration() {
    return this.itemPilesIntegration;
  }

  /**
   * Get the `actorInventory` strategy's coin spender.
   *
   * `COMPANION`'s `handle` tier (issue 1289): the promise is the accessor's name and that it
   * answers the object Fabricate itself uses, or `null` before readiness, not a promise about
   * `ActorInventoryCoinSpender`'s method surface.
   *
   * DELIBERATELY NOT `_requireReady()`-gated, matching {@link Fabricate#getCurrencyConfigStore}
   * and for the same reason: `actorInventoryCoinSpender` is `null` from the constructor and
   * reassigned in `initialize()`, so a pre-readiness read answers `null` rather than throwing.
   *
   * @returns {ActorInventoryCoinSpender|null}
   */
  getActorInventoryCoinSpender() {
    return this.actorInventoryCoinSpender;
  }

  /**
   * Get the `actorProperty` strategy's coin spender.
   *
   * `COMPANION`'s `handle` tier (issue 1289): the promise is the accessor's name and that it
   * answers the object Fabricate itself uses, or `null` before readiness, not a promise about
   * `ActorPropertyCoinSpender`'s method surface.
   *
   * DELIBERATELY NOT `_requireReady()`-gated, matching {@link Fabricate#getCurrencyConfigStore}
   * and for the same reason: `actorPropertyCoinSpender` is `null` from the constructor and
   * reassigned in `initialize()`, so a pre-readiness read answers `null` rather than throwing.
   *
   * @returns {ActorPropertyCoinSpender|null}
   */
  getActorPropertyCoinSpender() {
    return this.actorPropertyCoinSpender;
  }

  getCompendiumImporter() {
    return this.compendiumImporter;
  }

  /**
   * Merge caller `options` with the persisted remembered-actor default.
   *
   * A TRUTHY `options.rememberedActorId` overrides; a `null`/`undefined`/empty
   * id falls back to the persisted last-gathering selection
   * ({@link Fabricate#getSelectedGatheringActorId}). This matters because the UI
   * passes `rememberedActorId: store.selectedActorId ?? null`, and on a fresh
   * open that selection is `null` before the actor bar settles. Previously a
   * spread (`{ rememberedActorId: persisted, ...options }`) let that explicit
   * `null` clobber the persisted default, so the engine resolved its last-resort
   * `selectableActors[0]` (an arbitrary first actor) instead of the displayed
   * one — the wrong-actor bug where every required tool reads "missing" until you
   * reselect the actor. Coalescing here keeps the displayed/persisted actor as
   * the default for the listing, the attempt, and the drop breakdown alike.
   *
   * @param {object} [options]
   * @returns {object} `options` with `rememberedActorId` defaulted.
   */
  _withRememberedActorDefault(options = {}) {
    return {
      ...options,
      rememberedActorId: options.rememberedActorId || this.getSelectedGatheringActorId() || null,
    };
  }

  /**
   * List gathering environments/tasks for the current user and selected actor.
   *
   * The internal GatheringEngine receives the current Foundry user as viewer,
   * regardless of any viewer supplied by the caller.
   *
   * When `options.rememberedActorId` is omitted (or otherwise absent), it
   * defaults to the persisted last-gathering selection
   * ({@link Fabricate#getSelectedGatheringActorId}) so a fresh listing honors
   * the remembered actor. A truthy `rememberedActorId` in `options` overrides
   * that default; a `null` or omitted id falls back to the persisted selection
   * (it does NOT force the engine's arbitrary first-selectable-actor fallback).
   * The engine resolves the id against its OWNERSHIP
   * selectable list, not the narrower player-character list used by the actor
   * selection bar, so a legacy persisted owned non-player-character id is still
   * honored for that fetch.
   *
   * @param {object} [options] Gathering listing options.
   * @param {string|null} [options.rememberedActorId] Actor id to list for;
   *   defaults to the persisted last-gathering selection when omitted.
   * @returns {*} Gathering listing result with attemptability metadata.
   */
  listGatheringForActor(options = {}) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    // Resolve against the persisted last-gathering selection by default; an
    // explicit (truthy) actor id still overrides. See _withRememberedActorDefault.
    const withRememberedActor = this._withRememberedActorDefault(options);

    return callGatheringRuntimeWithCurrentViewer(gatheringEngine, 'listForActor', withRememberedActor, () => game.user);
  }

  /**
   * List the actors the current user may select as a gathering actor in the
   * unified-window actor selection bar.
   *
   * Returns the user's selectable **player characters** — owned for non-GM
   * users, all for GMs, narrowed by the player-character concept
   * ({@link isPlayerCharacterActor}). The result is redaction-safe display data:
   * each record contains ONLY `{ id, uuid, name, img }` and no other actor
   * internals. This selection predicate is distinct from gathering attempt
   * authorization and does not expand it.
   *
   * @returns {Array<{id: string|null, uuid: string|null, name: string, img: string|null}>}
   */
  listSelectableActors() {
    this._requireReady();
    return getBarSelectableActors({ viewer: game.user }).map((actor) => ({
      id: actor?.id ?? actor?.uuid ?? null,
      uuid: actor?.uuid ?? null,
      name: actor?.name ?? '',
      img: actor?.img ?? null
    }));
  }

  /**
   * List Fabricate's curated icon vocabulary.
   *
   * ONE vocabulary serves every icon field in Fabricate — essences, categories, biomes — and it
   * is published here so a companion module binds to it instead of hand-curating a second list
   * that drifts. It is measured from the Font Awesome bundle a Foundry install ships rather than
   * from Font Awesome's published metadata, so its names are the ones that bundle draws, and it
   * is curated to serve any fiction rather than fantasy alone.
   *
   * Named for its siblings: `list…` is what this facade calls a method answering with a
   * collection of plain display records ({@link Fabricate#listSelectableActors},
   * `listCraftingSourceActors`), as against `get…`, which answers with one thing.
   * `Curated` is the qualifier because the unfiltered catalogue is deliberately NOT published:
   * no Fabricate picker renders it.
   *
   * Ready-gated by throwing, as every other `list…` method on this facade is, rather than
   * answering with an empty list: an empty vocabulary is indistinguishable from a vocabulary
   * that lost its contents, and a companion's composition edge already wraps these calls and
   * degrades on throw.
   *
   * The records are freshly built per call, down to the `aliases` array, so a caller may keep,
   * sort or mutate them. The vocabulary's own rows are frozen entry by entry, which is why the
   * copy is about ownership rather than defence: a frozen array cannot be sorted and a frozen
   * record cannot be edited, and that freezing lives in a generated file rather than in this
   * contract.
   *
   * `aliases` is published rather than dropped because there is one entry per GLYPH and not per
   * name. A GM's saved `fas fa-cog` names the row offered as `gear`, so a record without the
   * other names would be a lossy view of a deduplicated set, and the lost part is exactly what a
   * caller needs to read data a GM already saved.
   *
   * @returns {Array<{iconCode: string, label: string, aliases: string[]}>} the curated icons in
   *   the set's own order, alphabetical by `iconCode`; the code is bare (`mortar-pestle`), and
   *   `aliases` carries every other name the same glyph answers to.
   */
  listCuratedIcons() {
    this._requireReady();
    return listCuratedIconVocabulary();
  }

  /**
   * Resolve one icon name against the curated vocabulary, under its offered name or any alias.
   *
   * Answers the question {@link Fabricate#listCuratedIcons} makes possible but awkward: is the
   * icon a GM saved still one this vocabulary offers, and which row is it? A companion holding
   * `fas fa-cog` gets the `gear` row back; a companion holding a typo, a name Foundry cannot
   * draw, or a real icon the curation leaves out gets `null`.
   *
   * `find…` rather than `get…` because the lookup can miss, which is what `null` says here and
   * what `Array.prototype.find` has always meant. It is a third naming family on this facade, and
   * a deliberate one: a `get…` sibling would suggest a value always comes back.
   *
   * Ready-gated by throwing, like its sibling. A miss and a premature call are different answers:
   * `null` says the vocabulary does not offer that name, and it must not also mean that the
   * vocabulary was not there to ask.
   *
   * Published as well as `aliases`, because the two answer different questions. `aliases` is for
   * OFFERING and SEARCHING — a companion's own picker needs the names a GM might type, which is
   * what Fabricate's picker puts in its own search text. This is for INTERPRETING a persisted
   * value, and it is O(1) against a prebuilt index rather than a scan of 1879 rows with an
   * `includes` on each. Both are derivable from the list alone; the derivation for THIS one is
   * the line a caller gets subtly wrong, because the obvious
   * `list.some(({ iconCode }) => iconCode === name)` reports a valid saved `cog` as unknown.
   *
   * The vocabulary's `isExcludedIconName` is still NOT published, and the original reason holds:
   * it consults no catalogue, so it answers "not excluded" for a name Foundry cannot render. This
   * resolves against the catalogue and cannot make that mistake.
   *
   * @param {string} iconName a bare Font Awesome icon name, such as `cog` or `gear`
   * @returns {{iconCode: string, label: string, aliases: string[]}|null} the curated record, or
   *   `null` when the vocabulary does not offer that name.
   */
  findCuratedIcon(iconName) {
    this._requireReady();
    return findCuratedIconRecord(iconName);
  }

  /**
   * Read the persisted remembered gathering-actor selection.
   *
   * Reads the existing `LAST_GATHERING_ACTOR` client setting; no new key is
   * introduced. Returns an empty string when unset.
   *
   * @returns {string} The persisted actor id, or '' when unset.
   */
  getSelectedGatheringActorId() {
    return getSetting(SETTING_KEYS.LAST_GATHERING_ACTOR) || '';
  }

  /**
   * Persist the remembered gathering-actor selection.
   *
   * Writes the existing `LAST_GATHERING_ACTOR` client setting; no new key is
   * introduced.
   *
   * @param {string} id Actor id to persist.
   * @returns {*} The setSetting result.
   */
  setSelectedGatheringActorId(id) {
    return setSetting(SETTING_KEYS.LAST_GATHERING_ACTOR, id ?? '');
  }

  /**
   * Lazily build (and cache) the {@link CraftingListingBuilder} that projects the
   * crafting backend into redaction-safe player listing models. Mirrors the
   * gathering listing path: a one-directional read-side collaborator wired with
   * the existing managers/services so GM and player viewers resolve through one
   * code path. The builder imports no Foundry globals — `localize` and
   * `nowWorldTime` are injected here.
   *
   * @returns {CraftingListingBuilder}
   * @private
   */
  _getCraftingListingBuilder() {
    if (this._craftingListingBuilder) return this._craftingListingBuilder;
    this._craftingListingBuilder = new CraftingListingBuilder({
      recipeManager: this.recipeManager,
      recipeVisibility: this.recipeVisibilityService,
      resolutionModeService: this.resolutionModeService,
      craftingSystemManager: this.craftingSystemManager,
      // Read ONLY for `findActiveRunForRecipe`, so the projection can name the step a
      // run is parked on (issue 917). Safe to capture in the cached builder:
      // `this.craftingRunManager` is constructed once during init and never
      // reassigned, so a cached builder can never hold a stale manager.
      craftingRunManager: this.craftingRunManager,
      localize: (key, data) =>
        data !== undefined
          ? (game.i18n?.format?.(key, data) ?? key)
          : (game.i18n?.localize?.(key) ?? key),
      nowWorldTime: () => game.time?.worldTime ?? 0,
      resolveCheckFormula: (formula, actor, craftingModifier) =>
        resolveCheckFormulaDisplay(formula, actor, craftingModifier),
      // How a held document resolves to a managed component, for the summary phase's
      // per-pass inventory tallies (issue 1075). The SAME full resolver
      // `InventoryListingBuilder` matches owned stacks with, so the crafting row's
      // "looks makeable" and the inventory tab's owned count cannot disagree about what
      // the player is holding. Injected rather than imported by the builder so its matcher
      // graph stays out of the mounted-component harness.
      resolveComponentForItem: findMatchingComponent,
    });
    return this._craftingListingBuilder;
  }

  /**
   * Resolve a stored crafting actor preference against Foundry's actor
   * collection. Returns null when the id is empty or stale.
   *
   * Defense-in-depth: for a non-GM viewer the resolved actor must pass the same
   * ownership predicate the gathering attempt path uses, so a stale or
   * console-supplied id the current user does not own can never have its
   * inventory read by the listing projection. A GM resolves any extant actor.
   *
   * @param {string|null} actorId
   * @returns {Actor|null}
   * @private
   */
  _resolveCraftingActor(actorId) {
    const actor = actorId ? (game.actors?.get?.(actorId) ?? null) : null;
    if (!actor) return null;
    if (game.user?.isGM === true) return actor;
    return isGatheringActorSelectableByUser(actor, game.user) ? actor : null;
  }

  /**
   * Resolve the effective crafting actor + component-source actors for a listing
   * or craft, applying the persisted defaults. A truthy `rememberedActorId`
   * overrides the persisted selection; component-source ids default to the
   * persisted set. Stale/non-extant ids resolve to nothing.
   *
   * @param {object} [options]
   * @param {string|null} [options.rememberedActorId]
   * @param {string[]|null} [options.componentSourceActorIds]
   * @returns {{ craftingActor: Actor|null, componentSourceActors: Actor[] }}
   * @private
   */
  _resolveCraftingSources({ rememberedActorId = null, componentSourceActorIds = null } = {}) {
    const actorId = rememberedActorId || this.getSelectedCraftingActorId() || null;
    const craftingActor = this._resolveCraftingActor(actorId);
    const sourceIds = Array.isArray(componentSourceActorIds)
      ? componentSourceActorIds
      : this.getCraftingComponentSourceIds();
    const componentSourceActors = sourceIds
      .map((id) => this._resolveCraftingActor(id))
      .filter(Boolean);
    return { craftingActor, componentSourceActors };
  }

  /**
   * Build the player-facing Crafting listing for the current user and selected
   * crafting actor + component sources. The current Foundry user is always the
   * viewer (GM bypass is honoured by the visibility service), regardless of any
   * caller-supplied viewer.
   *
   * @param {object} [options]
   * @param {string|null} [options.rememberedActorId] Crafting actor id; defaults
   *   to the persisted last-crafting selection when omitted.
   * @param {string[]|null} [options.componentSourceActorIds] Additional inventory
   *   source actor ids; defaults to the persisted component-source set.
   * @returns {object} Redaction-safe crafting listing model.
   */
  listCraftingForActor(options = {}) {
    this._requireReady();
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources(options);
    return this._getCraftingListingBuilder().buildListing({
      craftingActor,
      componentSourceActors,
      viewer: game.user,
    });
  }

  /**
   * DETAIL PHASE — the exact rich model for ONE recipe (issue 1075).
   *
   * The companion of {@link Fabricate#listCraftingForActor}, which since #1075 returns cheap
   * summary rows. The player app calls this for the selected recipe only, so the exact
   * per-set craftability, ingredient assignment, check resolution, outcome tiers, steps and
   * progressive stages are computed for what is on screen rather than for the whole corpus.
   *
   * `recipeId` arrives from a client and is NOT trusted: the actor and component sources are
   * re-resolved through the same ownership-gated `_resolveCraftingSources` every other player
   * seam uses, and the builder re-evaluates visibility and the system block for the recipe
   * itself. An id the viewer may not see answers `null`, never a model.
   *
   * @param {object} [options]
   * @param {string|null} [options.recipeId] The recipe to hydrate.
   * @param {string|null} [options.actorId] Crafting actor id; defaults to the persisted
   *   last-crafting selection. Named as `evaluateSelectedSet`'s is, since the two are the
   *   player app's pair of on-demand per-recipe reads.
   * @param {string[]|null} [options.componentSourceActorIds] Additional inventory source
   *   actor ids; defaults to the persisted component-source set.
   * @returns {object|null} The redaction-safe `RecipeListingModel`, or null.
   */
  hydrateCraftingRecipe({ recipeId = null, actorId = null, componentSourceActorIds = null } = {}) {
    this._requireReady();
    if (!recipeId) return null;
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources({
      rememberedActorId: actorId,
      componentSourceActorIds,
    });
    return this._getCraftingListingBuilder().buildRecipeDetail({
      recipeId,
      craftingActor,
      componentSourceActors,
      viewer: game.user,
    });
  }

  /**
   * Lazily build (and cache) the {@link InventoryListingBuilder} that projects the
   * owned-component view for the player Inventory tab. Mirrors
   * {@link Fabricate#_getCraftingListingBuilder}: a Foundry-global-free read-side
   * collaborator wired with the existing managers — `localize` and `nowWorldTime`
   * are injected here. `recipeVisibility` is injected so a non-GM viewer's used-by
   * list never names an undiscovered (teaser) recipe.
   *
   * @returns {InventoryListingBuilder}
   * @private
   */
  _getInventoryListingBuilder() {
    if (this._inventoryListingBuilder) return this._inventoryListingBuilder;
    this._inventoryListingBuilder = new InventoryListingBuilder({
      recipeManager: this.recipeManager,
      craftingSystemManager: this.craftingSystemManager,
      recipeVisibility: this.recipeVisibilityService,
      localize: (key, data) =>
        data !== undefined
          ? (game.i18n?.format?.(key, data) ?? key)
          : (game.i18n?.localize?.(key) ?? key),
      nowWorldTime: () => game.time?.worldTime ?? 0,
      // Gathering tasks live in the `gatheringConfig` setting (keyed by system id),
      // not on the system object — surface them for the "produced by" gathering index.
      getGatheringTasksForSystem: (systemId) => {
        const config = getSetting(SETTING_KEYS.GATHERING_CONFIG);
        const tasks = config?.systems?.[systemId]?.tasks;
        return Array.isArray(tasks) ? tasks : [];
      },
    });
    return this._inventoryListingBuilder;
  }

  /**
   * Build the player-facing Inventory listing for the current user's selected
   * crafting actor + component-source actors. Reuses the crafting selection
   * (same persisted actor + component sources) so the Inventory and Crafting tabs
   * agree on what the player owns. The current Foundry user is always the viewer.
   *
   * @param {object} [options]
   * @param {string|null} [options.rememberedActorId] Crafting actor id; defaults
   *   to the persisted last-crafting selection when omitted.
   * @param {string[]|null} [options.componentSourceActorIds] Additional inventory
   *   source actor ids; defaults to the persisted component-source set.
   * @returns {object} Inventory listing model (owned components + essence rows).
   */
  listInventoryForActor(options = {}) {
    this._requireReady();
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources(options);
    return this._getInventoryListingBuilder().buildListing({
      craftingActor,
      componentSourceActors,
      viewer: game.user,
    });
  }

  /**
   * Learn one recipe from an owned recipe-item "book" for the player Inventory
   * learn affordance. Resolves the crafting actor + component sources (same scope
   * the inventory listing was computed for), then delegates to the visibility
   * service, which enforces the per-document learn budget for capped systems and
   * leaves uncapped books intact.
   *
   * @param {object} options
   * @param {string|null} [options.actorId] Crafting actor id (defaults to the
   *   persisted selection).
   * @param {string} options.recipeId Recipe to learn.
   * @param {string[]|null} [options.componentSourceActorIds] Source actor ids.
   * @returns {Promise<{success: boolean, message: string, messageData?: object}>}
   */
  async learnRecipeFromInventory({ actorId = null, recipeId = null, componentSourceActorIds = null } = {}) {
    this._requireReady();
    const recipe = this.recipeManager?.getRecipe?.(recipeId);
    if (!recipe) {
      return { success: false, message: 'FABRICATE.Knowledge.NoMatchingItem' };
    }
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources({
      rememberedActorId: actorId,
      componentSourceActorIds,
    });
    return this.recipeVisibilityService.learnRecipeFromOwnedBook({
      recipe,
      craftingActor,
      componentSourceActors,
    });
  }

  /**
   * The ONE authorization rule every GM-gated, actor-targeted facade member applies:
   * the caller is a GM, and the `actorId` resolves to an actor the caller may act as
   * (issue 1289, D9).
   *
   * The order is normative and it is **GM -> actor -> readiness**, with readiness tested by
   * each member AFTER this preamble rather than inside it. `_requireReady()` THROWS, and
   * `recipe-visibility/spec.md` states that `resetActorKnowledge` returns its outcome without
   * throwing, so a readiness-first preamble would make a pre-`ready` non-GM call throw where it
   * returns `gmOnly` today. Neither gate here needs readiness: `game.user` and `game.actors`
   * are both live from `init`.
   *
   * The message keys are PARAMETERS rather than constants, because a failed grant must not
   * report itself in the words of a failed reset. Two representations of the one refusal come
   * back, because this facade answers in two conventions: the legacy `{ success, message }`
   * shape reads `message`, and the companion contract's `{ success, outcome, message }` builders
   * read `outcome` and re-derive the identical key from their own table.
   *
   * Resolution goes through {@link Fabricate#_resolveCraftingActor}, whose predicate is a generic
   * may-this-user-act-as-this-actor test with a GM bypass. Because the GM gate above has already
   * passed, that bypass makes it exactly `game.actors.get` for every reachable caller — so
   * adopting it here is a behavioural no-op that stops the resolver disagreeing with itself
   * between members.
   *
   * A SECOND copy of this rule lives on the GM Knowledge surface's shell
   * (`SvelteCraftingSystemManagerApp.svelte.js`'s `_knowledgeActor`). Unifying the two crosses
   * the facade/UI-shell boundary and is a follow-up; this comment names it so the author of a
   * THIRD copy meets it at the site.
   *
   * @param {string|null} actorId The target actor id (never an actor uuid).
   * @param {{gmOnlyKey: string, noActorKey: string}} keys This member's own refusal strings.
   * @returns {{actor: Actor|null, outcome: string|null, message: string|null}}
   * @private
   */
  _requireGmActor(actorId, { gmOnlyKey, noActorKey }) {
    if (game.user?.isGM !== true) {
      return { actor: null, outcome: COMPANION_OUTCOMES.gmOnly, message: gmOnlyKey };
    }
    const actor = this._resolveCraftingActor(actorId);
    if (!actor) {
      return { actor: null, outcome: COMPANION_OUTCOMES.noActor, message: noActorKey };
    }
    return { actor, outcome: null, message: null };
  }

  /**
   * The SET-VALUED extension of {@link Fabricate#_requireGmActor}, for the two pooled members
   * (issue 1342).
   *
   * An extension rather than a parallel gate: the GM half is the same rule in the same words and
   * runs first, and everything below it — the bound, the shape, the split between "not one
   * resolved" and "the request was wrong" — is DELEGATED to the one place that rule exists,
   * {@link gatePooledActorUuids} in the Foundry-free contract leaf. This method owns exactly the
   * two things a leaf may not touch: `game.user`, and the Foundry resolver.
   *
   * **Addressed by UUID, and never by id.** Every member above resolves an `actorId` through
   * `game.actors.get`, which CANNOT distinguish an unlinked token actor from its world
   * prototype — a synthetic token actor's `id` IS the base actor's. That is a tolerable ambiguity
   * for a member that GIVES and a corrupting one for a member that DELETES: deleting from the
   * prototype damages every other token derived from it while the token that should have paid
   * keeps its items. So these two take addresses, and the read takes the same addresses the
   * consume will, so the two can never disagree about which documents the answer was about.
   *
   * The resolved document must BE an actor, and must be a WORLD actor. `fromUuidSync` answers
   * whatever the address names, and an Item or a Scene handed to the pooled leaves would be
   * scanned for components and then written to; a `documentName` test is what makes a mistyped
   * address a refusal rather than a write against the wrong document.
   *
   * The compendium test beside it is the same rule about a different mistake, and it guards the
   * member that DELETES. `fromUuidSync` resolves a pack address as
   * `collection.get(id) ?? collection.index.get(id)`, so the answer depends on whether anything
   * has loaded that pack: an index entry is a plain object with no `documentName` and is refused,
   * while the SAME address answers a real `Actor` once the pack is loaded — and the consume would
   * then issue `deleteEmbeddedDocuments` against a compendium TEMPLATE. The pack's `locked` flag
   * does not save it; that is a client-side guard on the collection's own management methods and
   * the server backend never consults it. `Document#inCompendium` is `!!this.pack` and is
   * documented from v13, which is this module's declared minimum.
   *
   * `globalThis.fromUuidSync` rather than the bare global this file uses elsewhere, for the
   * reason recorded on {@link Fabricate#_postBulkSalvageChatMessage}: optional chaining does not
   * rescue an UNDECLARED identifier, so a bare `fromUuidSync?.()` still throws a ReferenceError
   * where the global has not been installed — and a `stable` member may not throw. The throw that
   * a shipped world actually reaches is a different one and is handled a layer down, by
   * `resolveOnePooledActor`'s `try`: `fromUuidSync` RAISES on a pack-sourced embedded address
   * such as `Compendium.<pack>.Actor.<id>.Item.<id>`, because its `strict` parameter defaults to
   * `true` on both v13.350 and v14.365.
   *
   * It takes NO refusal strings. See the comment where the pooled trios used to be hoisted: this
   * preamble's `message` was read by nobody, because each pooled delegator answers through its
   * own result builder and that builder is the one home of the member's words.
   *
   * @param {*} actorUuids The target actors, by UUID (never by id).
   * @returns {{actors: Array<Actor>|null, outcome: string|null, messageData: object|null}}
   * @private
   */
  _requireGmActors(actorUuids) {
    if (game.user?.isGM !== true) {
      return { actors: null, outcome: COMPANION_OUTCOMES.gmOnly, messageData: null };
    }
    return gatePooledActorUuids(actorUuids, {
      resolveActor: (uuid) => {
        const addressed = globalThis.fromUuidSync?.(uuid) ?? null;
        if (addressed?.documentName !== 'Actor') return null;
        return addressed.inCompendium === true ? null : addressed;
      }
    });
  }

  /**
   * GM-only crafting-knowledge reset (issue 773). This is the GM API that the
   * Knowledge surface's per-character reset control routes through (issue 785, both
   * the "This system" and "All systems" grains), and it remains available to macros
   * and the console for the same reset outside the manager UI. Clears one actor's
   * learned recipes (and their scoped discovery progress) for one crafting system
   * (`systemId`) or, when `systemId` is null, across every system, delegating to the
   * shared {@link RecipeVisibilityService#forgetLearnedRecipes} deletion primitive.
   *
   * Explicitly GM-gated even though it is GM-only: it mutates player-owned actor
   * state and, for `total`-scope books, a world setting. Takes an `actorId` (never an
   * actor uuid), resolves it through the shared {@link Fabricate#_requireGmActor} preamble,
   * and never throws — it returns the `{ success, message }` facade convention so a macro can
   * branch on the outcome. That preamble is a behavioural no-op here: this member's own gate
   * was the first of the two copies the preamble unified, and its resolver's ownership
   * predicate is bypassed for the GM this method already requires.
   *
   * @param {object} options
   * @param {string} options.actorId The actor whose knowledge is reset.
   * @param {string|null} [options.systemId] Limit to one crafting system, or null for all.
   * @param {boolean} [options.freeLearnBudget=true] Free the consumed learn budget so
   *   capped books permit re-learning.
   * @returns {Promise<{ success: boolean, message: string, messageData?: object }>}
   */
  async resetActorKnowledge({ actorId = null, systemId = null, freeLearnBudget = true } = {}) {
    const gate = this._requireGmActor(actorId, {
      gmOnlyKey: 'FABRICATE.Knowledge.Reset.GMOnly',
      noActorKey: 'FABRICATE.Knowledge.Reset.NoActor'
    });
    if (gate.outcome) return { success: false, message: gate.message };
    const actor = gate.actor;
    const service = this.recipeVisibilityService;
    const result = systemId
      ? await service.forgetSystemLearnedRecipes(actor, systemId, { freeLearnBudget })
      : await service.forgetAllLearnedRecipes(actor, { freeLearnBudget });
    return {
      success: result.success === true,
      message: 'FABRICATE.Knowledge.Reset.Success',
      messageData: { actor: actor.name, count: result.count || 0, systemId },
    };
  }

  /**
   * `COMPANION.grantRecipeKnowledge` — teach one actor one recipe with NO owned book
   * required (issue 1289).
   *
   * A downtime activity's reward is "you learned this by doing the work", and every write path
   * Fabricate already had onto `learnedRecipes` is anchored on a real owned recipe item. This
   * one is unbounded by design, which is why the behaviour lives in a free function
   * ({@link grantRecipeKnowledgeToActor}) rather than on `RecipeVisibilityService`: that service
   * is handed out LIVE and UNGATED by `getRecipeVisibilityService()`, so an unbounded
   * self-benefiting write placed there would be reachable by any player from the console.
   *
   * This member owns preconditions 1-3 only — GM, actor, readiness, in that order — and injects
   * the four seams the grant needs. `notReady` is a refusal rather than a throw because a
   * `stable` contract member is called inside a GM's automation tick, where a throw aborts work
   * mid-flight; callers steer through `whenReady()`.
   *
   * @param {object} options
   * @param {string|null} [options.actorId] The actor to teach (never an actor uuid).
   * @param {string|null} [options.recipeId] The recipe to grant, by id.
   * @param {*} [options.grantedBy] Optional provenance label; refused, never coerced.
   * @returns {Promise<Readonly<{success: boolean, outcome: string, message: string,
   *   messageData?: object}>>}
   */
  async grantRecipeKnowledge({ actorId = null, recipeId = null, grantedBy = null } = {}) {
    const gate = this._requireGmActor(actorId, {
      gmOnlyKey: KNOWLEDGE_GRANT_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
      noActorKey: KNOWLEDGE_GRANT_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor]
    });
    // ONE guard, holding D5's normative order: the preamble's refusal decides first and
    // readiness only where it passed, because `_requireReady()` throws and this member may not.
    if (gate.outcome || this.ready !== true) {
      return knowledgeGrantResult(gate.outcome ?? COMPANION_OUTCOMES.notReady);
    }
    return await grantRecipeKnowledgeToActor({ actor: gate.actor, recipeId, grantedBy }, {
      resolveRecipe: (id) => this.recipeManager?.getRecipe?.(id) ?? null,
      resolveSystem: (recipe) => this.craftingSystemManager?.getSystem?.(recipe?.craftingSystemId) ?? null,
      isObservable: (system) => this.recipeVisibilityService?.isLearnedKnowledgeObservable?.(system) === true,
      readFlag: (actor, key, fallback) => getFabricateFlag(actor, key, fallback),
      writeFlag: (actor, key, value) => setFabricateFlag(actor, key, value)
    });
  }

  /**
   * `COMPANION.checkAffordability` — can this actor afford `amount` of `unitId` against the
   * WORLD coin ladder (issue 1289)?
   *
   * World scope, never a crafting system: a downtime activity is not a recipe and belongs to no
   * system, so the answer consults no `requirements.currency` toggle and reaches no system
   * manager. Ladder-aware, so one `{ unitId, amount }` is compared against the actor's total
   * base value and the caller aggregates nothing. Performs no write.
   *
   * GM-gated for the same one reason the grant is, plus one of its own: on a `macro`-strategy
   * world the check triggers GM-authored macro code with caller-chosen arguments, and a
   * player-reachable trigger for that is a new hazard rather than a new convenience.
   *
   * @param {object} options
   * @param {string|null} [options.actorId] The actor whose purse is read (never an actor uuid).
   * @param {string|null} [options.unitId] The coin unit the cost is denominated in.
   * @param {number|null} [options.amount] How many of that unit, positive and finite.
   * @returns {Promise<Readonly<{success: boolean, affordable: boolean|null, outcome: string,
   *   message: string, messageData?: object}>>}
   */
  async checkAffordability({ actorId = null, unitId = null, amount = null } = {}) {
    const gate = this._requireGmActor(actorId, {
      gmOnlyKey: AFFORDABILITY_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
      noActorKey: AFFORDABILITY_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor]
    });
    if (gate.outcome || this.ready !== true) {
      return affordabilityResult(gate.outcome ?? COMPANION_OUTCOMES.notReady);
    }
    return await checkWorldCurrencyAffordability(gate.actor, { unitId, amount }, this._worldCurrencySeams());
  }

  /**
   * The ONE seam bag both WORLD-scoped currency members inject (issue 1301).
   *
   * Hoisted for the reason {@link Fabricate#_companionCheckSeams} is: neither delegator
   * restates it, and the harness mirror has one thing to keep faithful rather than two. It
   * removes an existing duplicated run as well as shortening both bodies — this literal was
   * already spelled twice, here and in the mirror.
   *
   * `isElectedExecutor` is deliberately NOT here. The check does not gate on a call site — it
   * writes nothing, so N clients answering the same question is harmless — and a seam present
   * in the bag but read by only one of its two consumers is how a gate ends up being assumed
   * rather than declared. `creditCurrency` spreads this bag and adds it.
   *
   * @returns {object}
   * @private
   */
  _worldCurrencySeams() {
    return {
      getCurrencyConfig: () => this.currencyConfigStore?.get?.() ?? null,
      actorPropertyCoinSpender: this.actorPropertyCoinSpender,
      actorInventoryCoinSpender: this.actorInventoryCoinSpender
    };
  }

  /**
   * `COMPANION.creditCurrency` — credit `amount` of `unitId` to an actor against the WORLD coin
   * ladder (issue 1301).
   *
   * Sited beside {@link Fabricate#checkAffordability} and the bag they share, rather than after
   * `awardComponents`, so the two WORLD-CURRENCY members read together — and so the two new
   * delegators are not adjacent in either this file or its harness mirror. That second effect
   * is measured rather than incidental: adjacent, near-identical delegators concatenate into
   * ONE duplicated run across the two files, and the pair measured over the bar while each
   * member alone measures under it.
   *
   * World scope, never a crafting system, exactly as {@link Fabricate#checkAffordability} is —
   * the two share their request resolution through {@link Fabricate#_worldCurrencySeams} and
   * the leaf's own shared resolver, so they can never disagree about what `50 gp` means.
   *
   * It routes through the resolved spender's `refund`, which under `spendStrategy: 'macro'`
   * runs the GM's `increment` macro — a macro that until now ran only on the player-cancel
   * refund. The `caller: 'award'` token the leaf passes is what lets that macro tell a
   * companion credit from a cancelled craft.
   *
   * NOT IDEMPOTENT, for the same reason the award is not: crediting 50 gp twice is legitimately
   * 100 gp, and nothing Fabricate can read tells a duplicate from a second, intended credit.
   *
   * @param {object} options the CLOSED request key set; nothing else is read
   * @param {string|null} [options.actorId] The actor to credit (never an actor uuid).
   * @param {string|null} [options.unitId] The coin unit the credit is denominated in.
   * @param {number|string|null} [options.amount] A whole positive number of that unit.
   * @param {string|null} [options.callSite] `'gmAction'` or `'broadcast'`; required, no default.
   * @returns {Promise<Readonly<object>>}
   */
  async creditCurrency({ actorId = null, unitId = null, amount = null, callSite = null } = {}) {
    const gate = this._requireGmActor(actorId, CREDIT_CURRENCY_GATE_KEYS);
    if (gate.outcome || this.ready !== true) {
      return currencyCreditResult(gate.outcome ?? COMPANION_OUTCOMES.notReady);
    }
    return await creditWorldCurrency(gate.actor, { unitId, amount, callSite }, {
      ...this._worldCurrencySeams(),
      isElectedExecutor: () => game.users?.activeGM?.id === game.user?.id
    });
  }

  /**
   * The seam bag {@link Fabricate#readPooledHoldings} injects (issue 1342).
   *
   * It SPREADS {@link Fabricate#_worldCurrencySeams} rather than restating the coin bindings,
   * because the read's currency axis is the same WORLD ladder `checkAffordability` reads and a
   * second spelling of that resolution is how the two come to disagree about what `50 gp` means.
   *
   * `findComponentItems` is the PUBLISHED matcher a companion can already reach for itself,
   * which is what keeps what this read COUNTS and what the consume TAKES from disagreeing. The
   * `?? []` floor mirrors the award bag's: the engine is `null` before readiness, and the
   * member's own readiness refusal runs first.
   *
   * `craftingSystemManager` is the raw collaborator rather than a function, because the tool
   * classifier this read drives takes the manager itself.
   *
   * Three seams the leaf declares are deliberately ABSENT — `classifyToolStates`,
   * `readCurrencyBalance` and `resolveUnitByName` — for the reason `createOrStack` is absent
   * from the award bag: the leaf defaults each to the shipped collaborator, so binding them here
   * would give a shipped primitive two spellings. They stay injectable for tests.
   *
   * @returns {object}
   * @private
   */
  _pooledHoldingsSeams() {
    return {
      ...this._worldCurrencySeams(),
      listSystems: () => this.craftingSystemManager?.getSystems?.() ?? [],
      craftingSystemManager: this.craftingSystemManager,
      findComponentItems: (actor, component, system) => this.craftingEngine?.findComponentItems?.(actor, component, system) ?? []
    };
  }

  /**
   * `COMPANION.readPooledHoldings` — what a SET of characters holds between them (issue 1342).
   *
   * Sited HERE, beside the world-currency members whose bag it spreads, rather than beside the
   * consume it pairs with. That siting is measured rather than aesthetic, and it is the same
   * decision recorded on {@link Fabricate#creditCurrency}: adjacent, near-identical delegators
   * concatenate into ONE duplicated run across this file and its harness mirror, and the pair
   * measures over the bar where each member alone measures under it.
   *
   * The first member that answers over a set of actors, and the first addressed by actor UUID —
   * see {@link Fabricate#_requireGmActors} for why the address rather than the id. It owns
   * preconditions 1-3 only — GM, actors, readiness, in that order — and hands the RESOLVED actor
   * documents plus the seam bag to the leaf, which owns the `costs` validation, the per-axis
   * resolution and every per-cost refusal, because those are request validation and sit where
   * every other member's request validation sits.
   *
   * **It writes nothing, takes no `callSite`, and is NOT a reservation.** The election gate
   * exists to stop N clients each applying a consequence Fabricate cannot reconcile, and N
   * clients answering the same question is harmless; nothing stops an item moving between this
   * answer and a consume, so a caller that must not overdraw reads the CONSUME's refusal.
   *
   * @param {object} options the CLOSED request key set; nothing else is read
   * @param {Array<string>|null} [options.actorUuids] The party, by actor UUID (never by id).
   * @param {Array<object>|null} [options.costs] `{ type, name, quantity }` entries, in order.
   * @returns {Promise<Readonly<object>>}
   */
  async readPooledHoldings({ actorUuids = null, costs = null } = {}) {
    const gate = this._requireGmActors(actorUuids);
    if (gate.outcome || this.ready !== true) {
      return pooledHoldingsReadResult(gate.outcome ?? COMPANION_OUTCOMES.notReady, gate.messageData);
    }
    return await readPooledHoldingsAcrossActors(gate.actors, { costs }, this._pooledHoldingsSeams());
  }

  /**
   * The ONE seam bag both Standalone Check Roll members inject.
   *
   * Hoisted to a single private so neither delegator restates it, and so the harness mirror
   * has one thing to substitute rather than two. Seven seams, and `resolveActor` and `isGm`
   * are deliberately ABSENT from it: both gates live in the facade, so the leaf resolves
   * nothing and reads no collection — there is no second resolver to disagree with the first.
   *
   * `prompt` and `promptBulk` exist because both prompt functions AUTO-CONFIRM where there is
   * no `DialogV2`. Without the seams, the dismissal case — the one property this capability
   * exists to preserve — would be unreachable under test.
   *
   * `localize` is here because the leaf may not touch `game.i18n`: it needs the default label
   * localized, and `foundryBridge.localize` answers the KEY when there is no `game.i18n` (as
   * Foundry's own `localize` does for a missing string), so the fallback is applied at the one
   * seam that needs it.
   *
   * @returns {object}
   * @private
   */
  _companionCheckSeams() {
    return {
      isElectedExecutor: () => game.users?.activeGM?.id === game.user?.id,
      hasDiceEngine: () => typeof globalThis.Roll === 'function',
      localize: (key, fallback) => {
        const resolved = bridgeLocalize(key);
        return typeof resolved === 'string' && resolved !== '' && resolved !== key ? resolved : fallback;
      },
      prompt: promptCheckRoll,
      promptBulk: promptBulkCheckRoll,
      runPassFail: runFormulaPassFail,
      runProgressive: runFormulaProgressive,
      buildRollOptions: buildInteractiveRollOptions
    };
  }

  /**
   * `COMPANION.rollActorCheck` — roll ONE formula for ONE actor, graded against a `dc` or
   * ungraded, and answer what was rolled (issue 1293).
   *
   * A **Standalone Check Roll**: the check-roll mechanics without a crafting system's derived
   * terms. See {@link rollStandaloneActorCheck} for what that does and does not include.
   *
   * This member owns preconditions 1-3 only — GM, actor, readiness, in that order, reusing the
   * shared preamble VERBATIM — and hands the resolved actor plus the seam bag to the leaf,
   * which owns the call-site and election gates because they are request validation and sit
   * where every other member's request validation sits.
   *
   * @param {object} options the CLOSED request key set; nothing else is read
   * @param {string|null} [options.actorId] The rolling actor (never an actor uuid).
   * @param {string|null} [options.callSite] `'gmAction'` or `'broadcast'`; required, no default.
   * @param {string|null} [options.formula] The authored roll formula.
   * @param {number|null} [options.dc] A finite DC selects the graded arm.
   * @param {string|null} [options.compare] `'meet'` (default) or `'exceed'`.
   * @param {string|null} [options.label] Display label; defaults to a localized activity noun.
   * @param {boolean} [options.interactive] Open the roll prompt; defaults to false.
   * @param {object|null} [options.rollDecision] A pre-resolved decision; refused unless interactive.
   * @returns {Promise<Readonly<object>>}
   */
  async rollActorCheck({ actorId = null, callSite = null, formula = null, dc = null, compare = null, label = null, interactive = false, rollDecision = null } = {}) {
    const gate = this._requireGmActor(actorId, ROLL_ACTOR_CHECK_GATE_KEYS);
    if (gate.outcome || this.ready !== true) {
      return checkRollResult(gate.outcome ?? COMPANION_OUTCOMES.notReady);
    }
    return await rollStandaloneActorCheck({ actor: gate.actor, callSite, formula, dc, compare, label, interactive, rollDecision }, this._companionCheckSeams());
  }

  /**
   * `COMPANION.resolveBulkCheckDecision` — answer ONE roll decision to be applied to N rolls
   * the caller will make (issue 1293). It rolls nothing.
   *
   * GM-gated INLINE rather than through {@link Fabricate#_requireGmActor}, and that is not a
   * second copy of the rule: the shared preamble is scoped by its own comment to every
   * GM-gated, ACTOR-TARGETED facade member, and this member targets no actor. It cannot use
   * the preamble in any case — `_resolveCraftingActor(null)` returns `null`, so
   * `_requireGmActor(undefined, …)` would always answer `noActor` for a member that reads no
   * actor and can never legitimately emit one.
   *
   * @param {object} options the CLOSED request key set; nothing else is read
   * @param {string|null} [options.callSite] `'gmAction'` or `'broadcast'`; required, no default.
   * @param {Array<string>|null} [options.formulas] The batch's authored formulas, in order.
   * @returns {Promise<Readonly<object>>}
   */
  async resolveBulkCheckDecision({ callSite = null, formulas = null } = {}) {
    const gmOnly = game.user?.isGM !== true ? COMPANION_OUTCOMES.gmOnly : null;
    if (gmOnly || this.ready !== true) {
      return bulkCheckDecisionResult(gmOnly ?? COMPANION_OUTCOMES.notReady);
    }
    return await resolveStandaloneBulkCheckDecision({ callSite, formulas }, this._companionCheckSeams());
  }

  /**
   * The seam bag {@link Fabricate#awardComponents} injects (issue 1301).
   *
   * FIVE seams, and the sixth the leaf declares — `createOrStack` — is deliberately absent:
   * the leaf defaults it to the shared `createOrStackComponentItem` import, so passing it here
   * would give the create primitive two spellings and let a facade change silently route the
   * award past the seam whose `[created] ?? null` normalisation the answer's truthfulness rests
   * on. It stays injectable for tests and defaulted in production.
   *
   * `findComponentItems` is the PUBLISHED resolver a companion can already reach for itself,
   * which is what keeps what an award stacks onto and what salvage consumes from disagreeing.
   * It is guarded with `?? []` because the engine is `null` before readiness — the member's own
   * readiness refusal runs first, so this is a floor rather than a path.
   *
   * @returns {object}
   * @private
   */
  _componentAwardSeams() {
    return {
      resolveSystem: (systemId) => this.craftingSystemManager?.getSystem?.(systemId) ?? null,
      resolveComponent: (system, componentId) => findById(getDefinitionIndex(resolvedComponentsFor(system)), componentId) ?? null,
      findComponentItems: (actor, component, system) => this.craftingEngine?.findComponentItems?.(actor, component, system) ?? [],
      resolveSourceItem: (uuid) => fromUuid(uuid),
      isElectedExecutor: () => game.users?.activeGM?.id === game.user?.id
    };
  }

  /**
   * `COMPANION.awardComponents` — place one or more of a crafting system's components onto an
   * actor's sheet (issue 1301).
   *
   * The write half of a pair the contract has published half of since issue 1289:
   * `getCraftingEngine().findComponentItems` resolves an actor's existing stacks "so an award
   * can stack rather than duplicate", and until now nothing published could perform that award.
   *
   * This member owns preconditions 1-3 only — GM, actor, readiness, in that order, reusing the
   * shared preamble VERBATIM — and hands the resolved actor plus the seam bag to the leaf,
   * which owns the call-site gate, the election, the `awards` validation and the per-entry
   * quantity domain, because those are request validation and sit where every other member's
   * request validation sits.
   *
   * NOT IDEMPOTENT, and deliberately: an award has no natural key, so awarding three hides
   * twice is legitimately six hides. The caller owns not double-awarding.
   *
   * @param {object} options the CLOSED request key set; nothing else is read
   * @param {string|null} [options.actorId] The actor to award to (never an actor uuid).
   * @param {string|null} [options.systemId] The crafting system every entry resolves within.
   * @param {Array<object>|null} [options.awards] `{ componentId, quantity }` entries, in order.
   * @param {string|null} [options.callSite] `'gmAction'` or `'broadcast'`; required, no default.
   * @returns {Promise<Readonly<object>>}
   */
  async awardComponents({ actorId = null, systemId = null, awards = null, callSite = null } = {}) {
    const gate = this._requireGmActor(actorId, AWARD_COMPONENTS_GATE_KEYS);
    if (gate.outcome || this.ready !== true) {
      return componentAwardResult(gate.outcome ?? COMPANION_OUTCOMES.notReady);
    }
    return await awardComponentsToActor(gate.actor, { systemId, awards, callSite }, this._componentAwardSeams());
  }

  /**
   * The seam bag {@link Fabricate#consumePooledHoldings} injects (issue 1342).
   *
   * It spreads {@link Fabricate#_worldCurrencySeams} for the reason the read's bag does — the
   * coin the take debits and the coin it gives back are the same WORLD ladder every other
   * currency member reads — and adds the election, exactly as {@link Fabricate#creditCurrency}
   * does, because this member WRITES and a broadcast handler fires on every connected client.
   *
   * The component trio is bound identically to the award's, and that identity is the point
   * rather than a copy: what an award STACKS ONTO, what salvage consumes and what this TAKES
   * must resolve through one matcher, or a read predicts a write against a different set of
   * documents. `resolveSourceItem` is absent because nothing here creates from a template.
   *
   * @returns {object}
   * @private
   */
  _pooledConsumptionSeams() {
    return {
      ...this._worldCurrencySeams(),
      isElectedExecutor: () => game.users?.activeGM?.id === game.user?.id,
      resolveSystem: (systemId) => this.craftingSystemManager?.getSystem?.(systemId) ?? null,
      resolveComponent: (system, componentId) => findById(getDefinitionIndex(resolvedComponentsFor(system)), componentId) ?? null,
      findComponentItems: (actor, component, system) => this.craftingEngine?.findComponentItems?.(actor, component, system) ?? []
    };
  }

  /**
   * `COMPANION.consumePooledHoldings` — take a set of costs from what a SET of characters holds
   * between them (issue 1342).
   *
   * The first published member that REMOVES value rather than placing it. Every companion writer
   * before it gives: the grant teaches, the award places, the credit pays.
   *
   * Sited HERE rather than beside the read it pairs with, for the duplicated-run reason recorded
   * on {@link Fabricate#readPooledHoldings} and first measured for {@link Fabricate#creditCurrency}.
   *
   * It owns preconditions 1-3 only — GM, actors, readiness, in that order, through the same
   * set-valued preamble the read uses, answering in its OWN words through its OWN result builder
   * rather than through a refusal string threaded into that preamble — and hands the RESOLVED
   * actor documents plus the seam bag to the leaf, which owns the call-site gate, the election,
   * the `costs` validation, the components-first ordering and the rollback.
   *
   * **Costs arrive as RESOLVED IDS**, which is what the read hands back, and the pair is designed
   * to be called in that order. **NOT IDEMPOTENT**: calling it twice takes twice, and there is no
   * natural key to absorb a repeat, so not double-consuming is the caller's own obligation.
   *
   * @param {object} options the CLOSED request key set; nothing else is read
   * @param {Array<string>|null} [options.actorUuids] The party, by actor UUID (never by id).
   * @param {string|null} [options.callSite] `'gmAction'` or `'broadcast'`; required, no default.
   * @param {Array<object>|null} [options.costs] The costs to take, by resolved id, in order.
   * @returns {Promise<Readonly<object>>}
   */
  async consumePooledHoldings({ actorUuids = null, callSite = null, costs = null } = {}) {
    const gate = this._requireGmActors(actorUuids);
    if (gate.outcome || this.ready !== true) {
      return pooledHoldingsConsumeResult(gate.outcome ?? COMPANION_OUTCOMES.notReady, gate.messageData);
    }
    return await consumePooledHoldingsFromActors(gate.actors, { callSite, costs }, this._pooledConsumptionSeams());
  }


  /**
   * Craft a recipe for the current selection, delegating to {@link Fabricate#craft}.
   * Resolves the crafting actor + component sources from the supplied ids (or the
   * persisted defaults) so the attempt uses the same inventory scope the listing
   * was computed for.
   *
   * @param {object} options
   * @param {string|null} [options.actorId] Crafting actor id.
   * @param {string} options.recipeId Recipe id.
   * @param {string|null} [options.ingredientSetId] Chosen ingredient set id.
   * @param {{stepId: string|null, ingredientSetId: string|null,
   *   allocation: Record<string, number>}|null} [options.ingredientEssenceAllocation]
   *   The player's funding for the set's shared essence block (issue 917), scoped to
   *   the step and set the rail was computed against. Passed straight through: the
   *   ENGINE drops it when either id disagrees with the step it resolves from the
   *   active run, because a facade-side guard would check an index that can move
   *   between the derived rail and the click. Omitted (null) is today's behaviour.
   * @param {string[]|null} [options.componentSourceActorIds] Source actor ids.
   * @param {boolean} [options.interactive] When true, prompt the player with the
   *   confirm-roll dialog (optional situational modifier) and post the roll to chat
   *   so Dice So Nice animates it. Defaults to false so macros and automation keep
   *   the original silent behaviour. The Fabricate Crafting tab passes true. A
   *   dismissed prompt returns `{ success: false, cancelled: true }` with zero
   *   mutation (no ingredients, currency, or tools consumed, no run created).
   * @returns {Promise<{success: boolean, results: Array|null, message: string, cancelled?: boolean}>}
   */
  async craftRecipe({ actorId = null, recipeId, ingredientSetId = null, ingredientOptionOverrides = null, ingredientEssenceAllocation = null, componentSourceActorIds = null, interactive = false } = {}) {
    this._requireReady();
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources({
      rememberedActorId: actorId,
      componentSourceActorIds,
    });
    if (!craftingActor) {
      return { success: false, results: null, message: 'No crafting actor selected' };
    }
    const sources = componentSourceActors.length > 0 ? componentSourceActors : [craftingActor];
    // `interactive` (UI-triggered craft) opts into the confirm-roll dialog + chat
    // post; omitted/false for macros/automation so they stay silent (no API break).
    return await this.craft(craftingActor, recipeId, {
      componentSourceActors: sources,
      ingredientSetId,
      // Per-group player option overrides (issue 552); null keeps default resolution.
      ingredientOptionOverrides,
      // Scoped essence-block funding (issue 917); null keeps the allocator's suggestion.
      ingredientEssenceAllocation,
      interactive,
    });
  }

  /**
   * Salvage one owned component for the current selection (issue 675) — the seam
   * behind the player Inventory tab's Salvage panel, and the first UI caller of
   * `CraftingEngine.salvage`.
   *
   * TAKES AN `actorId`, NEVER AN `actorUuid`. `CraftingEngine.salvage` performs NO
   * ownership check of its own; `_resolveCraftingActor` — reached here through
   * `_resolveCraftingSources` — is the ONLY ownership gate on this path, which is
   * why every player facade (`craftRecipe`, `listInventoryForActor`, the alchemy
   * pair) takes an id. A uuid would go straight to `fromUuid()` and the engine would
   * mutate Items directly; a stale, console-supplied, or foreign uuid would reach
   * the server and THROW rather than return the `{ success: false, message }` a
   * store expects. Exact `craftRecipe` parity on that gate is the contract.
   *
   * Note there is deliberately no public `Fabricate#salvage` delegator to mirror
   * `craftRecipe`'s `this.craft`: this routes to the engine directly.
   *
   * @param {object} options
   * @param {string|null} [options.actorId] Crafting actor id; defaults to the
   *   persisted last-crafting selection.
   * @param {string} options.systemId Crafting system id.
   * @param {string} options.componentId Id of the component to salvage.
   * @param {boolean} [options.interactive] When true, prompt the player with the
   *   confirm-roll dialog (optional situational modifier) and post the roll to chat
   *   so Dice So Nice animates it. Defaults to false so macros and automation stay
   *   silent. A dismissed prompt returns `{ success: false, cancelled: true, results:
   *   null }` with zero mutation.
   * @returns {Promise<{success: boolean, results: Array|null, message: string, value?: number|null, salvageRun?: object|null, cancelled?: boolean}>}
   */
  async salvageComponent({ actorId = null, systemId, componentId, interactive = false } = {}) {
    this._requireReady();
    const { craftingActor } = this._resolveCraftingSources({ rememberedActorId: actorId });
    if (!craftingActor) {
      return { success: false, results: null, message: 'No crafting actor selected' };
    }
    return await this.craftingEngine.salvage(craftingActor.uuid, systemId, componentId, {
      interactive
    });
  }

  /**
   * Lazily build (and cache) the {@link BulkSalvageService} behind
   * {@link Fabricate#salvageComponents} (issue 859). Mirrors
   * {@link Fabricate#_getCraftingListingBuilder}: every collaborator the service needs
   * is injected here, so the service itself reaches no Foundry global and stays
   * unit-testable against plain objects.
   *
   * Safe to cache because every collaborator below is read off `this` at CALL time and
   * none is captured at construction time. That — not immutability — is what makes the
   * cache sound: `this.craftingEngine` is assigned twice (`null` in the constructor, then
   * the real engine in `initialize()`), so a service that had captured the field's value
   * instead of the receiver could hold `null` forever.
   * {@link Fabricate#_getBulkDestroyService} states the same rule for the same reason.
   *
   * @returns {BulkSalvageService}
   * @private
   */
  _getBulkSalvageService() {
    if (this._bulkSalvageService) return this._bulkSalvageService;
    this._bulkSalvageService = new BulkSalvageService({
      salvage: (actorUuid, systemId, componentId, options) =>
        this.craftingEngine.salvage(actorUuid, systemId, componentId, options),
      getCraftingSystem: (systemId) => this.craftingSystemManager.getSystem(systemId),
      promptRollDecision: promptBulkCheckRoll,
      postChatMessage: (message) => this._postBulkSalvageChatMessage(message),
      // The BATCHED complication relay (issue 1286). Read off `this` at call time like every
      // other collaborator here, because the writer is composed during `initialize()` and
      // this service is cached. The service collects each row's addressing-only requests and
      // hands them over as one message per addressed (system, actor) pair, rather than the
      // engine emitting per ROW. The pair is the batching unit because both halves of it are
      // GM-side authorization inputs; `COMPLICATION_RATE_LIMIT` is sized against the
      // fanned-out pair count a 25-target selection can produce, not against the row count.
      deliverComplications: (message) => this.complicationDeliveryWriter?.deliver(message),
      // The executing user's stored progressive stage order, read through the SAME edge
      // `ResolutionModeService` and `CraftingEngine` are given (issue 1286). The bulk
      // pre-run forecast consumes it to list a row's complications in the order the roll
      // will actually be spent down; the RUN path never reads it here, because the order a
      // row is resolved against is the one its own run captured at start.
      //
      // Left unwired the service falls back to `() => null` and the forecast quietly reads
      // the AUTHORED order while the run reads the player's — a divergence with no symptom
      // beyond a preview listing the right complications against the wrong stages.
      getPlayerResultOrder: entry => this._readPlayerResultOrder(entry),
      // Key-only, matching every card module's `localize` contract; the aggregate card
      // substitutes its own counts.
      localize: (key) => game.i18n?.localize?.(key) ?? key
    });
    return this._bulkSalvageService;
  }

  /**
   * Lazily build (and cache) the {@link BulkDestroyService} behind
   * {@link Fabricate#destroyComponents} (issue 859).
   *
   * @returns {BulkDestroyService}
   * @private
   */
  _getBulkDestroyService() {
    if (this._bulkDestroyService) return this._bulkDestroyService;
    this._bulkDestroyService = new BulkDestroyService({
      getCraftingSystem: (systemId) => this.craftingSystemManager.getSystem(systemId),
      // Destroy MUST resolve documents through the identical matcher salvage uses,
      // including its case-SENSITIVE name fallback: a destroy that matched more broadly
      // than salvage would delete things the player was shown as a different component.
      // Read off `this.craftingEngine` at CALL time, not at construction time, because
      // this service is cached and the engine is assigned during `initialize()` — the
      // constructor leaves the field `null`.
      findComponentItems: (actor, component, system) =>
        this.craftingEngine.findComponentItems(actor, component, system),
      // Must RETURN the deleted documents: the service derives `unitsDeleted` from what
      // came back, never from what it asked for, because a `preDeleteItem` hook can veto
      // individual ids silently while the rest of the batch deletes.
      deleteItems: (actor, itemIds) => actor.deleteEmbeddedDocuments('Item', itemIds)
    });
    return this._bulkDestroyService;
  }

  /**
   * Post the ONE aggregated bulk-salvage chat card: speaker → visibility → create.
   *
   * ## The order of the three steps is load-bearing
   *
   * 1. **Speaker first**, because `ChatMessage.applyMode`'s `ic` branch reads
   *    `chatData.speaker.actor` unguarded — a visibility pass over speaker-less data
   *    throws for a player whose client default is In-Character.
   * 2. **Visibility before `create`**, because the legacy `rollMode` CREATE OPTION is
   *    honoured only for a message carrying rolls and this card carries none. See
   *    {@link module:src/systems/bulkChatVisibility.applyBulkChatVisibility}, which owns
   *    the V13/V14 probe and vocabulary.
   * 3. **`create` last**, with `author` — the V14 schema defines `author` and has no
   *    `user` field and no shim, so the `user` key the single-salvage poster still
   *    passes is silently discarded there and works only by defaulting.
   *
   * ## Why the speaker is built rather than inferred
   *
   * `ChatMessage.getSpeaker()` with no actor falls through to the CONTROLLED TOKENS on
   * the canvas, so a GM running a bulk salvage with an unrelated NPC selected would have
   * the card attributed to that NPC. A one-actor run therefore names its actor
   * explicitly, and a multi-actor run — which has no single speaker to name — builds the
   * same shape `_getSpeakerFromUser` produces, with an explicit alias, so the card speaks
   * as the acting user rather than as whatever happened to be selected.
   *
   * @param {object} message
   * @param {string} message.content The card markup (already built and escaped).
   * @param {string|null} message.rollMode The LEGACY token the player chose, or null when
   *   nothing prompted — in which case the client's own `core.rollMode` decides. Never
   *   reads `core.messageMode`: `ClientSettings#assertSetting` throws for an unregistered
   *   key on V13, and `??` does not catch a throw.
   * @param {string|null} message.actorUuid Set only for a single-actor run.
   * @param {string[]} [message.actorNames] The acting actors, used for the alias.
   * @returns {Promise<object|undefined>} The created message.
   * @private
   */
  async _postBulkSalvageChatMessage({ content, rollMode, actorUuid, actorNames = [] }) {
    // `globalThis.` rather than the bare global `fromUuid` this file uses elsewhere:
    // optional chaining does not rescue an UNDECLARED identifier, so a bare
    // `fromUuidSync?.()` would still throw a ReferenceError under a harness that has not
    // installed it, and this poster must never be the thing that costs a completed run
    // its report.
    const actor = actorUuid ? (globalThis.fromUuidSync?.(actorUuid) ?? null) : null;
    const alias = actorNames.filter(Boolean).join(', ') || game.user?.name || '';
    const speaker = actor
      ? ChatMessage.getSpeaker({ actor })
      : { scene: game.scenes?.current?.id ?? null, actor: null, token: null, alias };

    const chatData = { author: game.user?.id, speaker, content };
    applyBulkChatVisibility(chatData, rollMode || game.settings?.get?.('core', 'rollMode'));
    return await ChatMessage.create(chatData);
  }

  /**
   * Gate a bulk target list, resolving ONE actor per row.
   *
   * ## `target.actorId ?? actorId`, and nothing else
   *
   * There is deliberately no `?? this.getSelectedCraftingActorId()` tail here, unlike
   * {@link Fabricate#_resolveCraftingSources}. A bulk run may span actors, so a
   * persisted-selection fallback would silently RETARGET a row whose own actor did not
   * resolve onto whichever actor the player last selected — salvaging or destroying the
   * wrong character's items with no error anywhere. A row that names no resolvable actor
   * is refused, never redirected.
   *
   * @param {Array<object>} targets
   * @param {string|null} actorId The run-level default for rows that name no actor.
   * @returns {Array<{target: object, actor: Actor|null}>} Input order, preserved.
   * @private
   */
  _gateBulkTargets(targets, actorId) {
    return (targets || []).filter(Boolean).map((target) => ({
      target,
      actor: this._resolveCraftingActor(target.actorId ?? actorId)
    }));
  }

  /**
   * Weave a service's result rows back into the caller's ORIGINAL target order,
   * substituting a refusal row wherever the gate resolved no actor.
   *
   * Order is preserved end to end because the in-panel report and the chat card line up
   * with the queue the player committed; a run that reordered its own rows would make
   * "the third one failed" unreadable.
   *
   * @param {Array<{target: object, actor: Actor|null}>} gated
   * @param {Array<object>} ranItems The service's rows, in gated-and-runnable order.
   * @param {(target: object) => object} buildRefusedRow
   * @returns {Array<object>}
   * @private
   */
  _mergeBulkRows(gated, ranItems, buildRefusedRow) {
    const rows = [];
    let next = 0;
    for (const entry of gated) {
      if (entry.actor && next < ranItems.length) {
        rows.push(ranItems[next]);
        next += 1;
      } else {
        rows.push(buildRefusedRow(entry.target));
      }
    }
    return rows;
  }

  /**
   * The identity fields every refusal row carries. The component's name and image are
   * resolved from the crafting system so a refused row still READS as the thing the
   * player selected, rather than as a blank line they cannot connect to anything.
   *
   * @param {object} target
   * @returns {object}
   * @private
   */
  _buildNotPermittedRow(target) {
    const system = this.craftingSystemManager?.getSystem?.(target?.systemId) ?? null;
    const component = findById(getDefinitionIndex(resolvedComponentsFor(system)), target?.componentId);
    return {
      actorId: target?.actorId ?? null,
      actorName: '',
      systemId: target?.systemId ?? null,
      componentId: target?.componentId ?? null,
      name: component?.name || '',
      img: component?.img || '',
      // The facade's own outcome, added to the service vocabulary rather than folded
      // into `skipped`: "you may not act on this actor" and "this row was not runnable"
      // are different answers and the panel gives them different chips.
      outcome: 'notPermitted',
      skipReason: null
    };
  }

  /**
   * Salvage MANY owned components in one gesture (issue 859) — the seam behind the
   * player Inventory tab's bulk panel.
   *
   * TAKES AN `actorId` PER TARGET, NEVER AN `actorUuid`, AT ANY NESTING LEVEL.
   * `CraftingEngine.salvage` performs no ownership check of its own and
   * `BulkSalvageService` performs none either — it receives a facade-derived uuid — so
   * the per-target `_resolveCraftingActor` below is the ONLY gate on this path. It
   * resolves through `game.actors` (world actors only), which closes two Foundry paths
   * for free and is stated so a future "just accept a uuid" change knows what it would
   * open: a compendium-backed actor can never be a target, and an unlinked token actor
   * is not in `game.actors` either.
   *
   * An unresolvable actor becomes an `outcome: 'notPermitted'` ROW. It never throws and
   * never retargets, so one refused row costs the player none of the others.
   *
   * @param {object} options
   * @param {string|null} [options.actorId] The run-level actor id, used for any target
   *   that names none of its own.
   * @param {Array<{actorId?: string, systemId: string, componentId: string}>}
   *   [options.targets] The queue, in the order the player committed it.
   * @param {boolean} [options.interactive] When true the run opens ONE roll prompt and
   *   applies the player's answer to every roll. Defaults true — this facade exists for
   *   a player gesture, unlike the automation-facing {@link Fabricate#salvageComponent}.
   * @param {Function} [options.onProgress] Called `(completed, total)` after each target
   *   resolves, so a caller can render determinate progress for a run that is knowable
   *   precisely because it is sequential. OPTIONAL, and a listener that throws never
   *   costs the run — see the service's own `reportBulkProgress`.
   *
   *   STATED LIMIT: `total` counts the rows the SERVICE was given, which is this call's
   *   targets MINUS any the gate refused. A run containing a `notPermitted` row
   *   therefore finishes below the caller's own denominator rather than reporting a
   *   refusal as work; the caller owns its terminal state either way.
   * @returns {Promise<{cancelled: boolean, items: object[], counts: object,
   *   posted: boolean}>} Plain models only, in the caller's target order.
   */
  async salvageComponents({ actorId = null, targets = [], interactive = true, onProgress = null } = {}) {
    this._requireReady();
    const gated = this._gateBulkTargets(targets, actorId);
    const runnable = gated.filter((entry) => entry.actor);

    const result = await this._getBulkSalvageService().run({
      targets: runnable.map(({ target, actor }) => ({
        actorUuid: actor.uuid,
        actorId: actor.id,
        actorName: actor.name,
        systemId: target.systemId,
        componentId: target.componentId
      })),
      interactive,
      onProgress
    });
    // A dismissed prompt returns before the first engine call, so nothing ran and there
    // is no per-row story to tell — pass the service's zero-mutation shape straight
    // through rather than reporting refusals for a run the player cancelled.
    if (result.cancelled) return result;

    const items = this._mergeBulkRows(gated, result.items, (target) => ({
      ...this._buildNotPermittedRow(target),
      rollValue: null,
      tierStep: null,
      message: '',
      results: [],
      consumed: [],
      tools: []
    }));
    return {
      cancelled: false,
      items,
      counts: {
        ...result.counts,
        total: items.length,
        notPermitted: items.length - result.items.length
      },
      posted: result.posted
    };
  }

  /**
   * Permanently destroy MANY owned components in one gesture (issue 859).
   *
   * Same gate as {@link Fabricate#salvageComponents} — an `actorId` per target, never a
   * uuid, no persisted-selection fallback, an unresolvable actor refused as
   * `notPermitted` rather than retargeted — and the same order-preserving merge.
   *
   * Destroy deletes WHOLE STACKS on the target actor and is deliberately NOT gated on
   * `features.salvage` or a component's `salvage.enabled`: a player can already delete
   * their own owned Items from the Foundry sheet, so this adds ergonomics, not
   * capability, and a blocked-for-salvage row is often exactly the row they want gone.
   * There is no chat card — a result card reports what an activity produced.
   *
   * The caller owns the confirmation. This facade executes against the snapshot the
   * confirmation named and does not re-prompt.
   *
   * @param {object} options
   * @param {string|null} [options.actorId] The run-level actor id.
   * @param {Array<{actorId?: string, systemId: string, componentId: string}>}
   *   [options.targets]
   * @param {Function} [options.onProgress] Called `(completed, total)` after each target
   *   is destroyed, under the same optional-and-cannot-break-the-run contract — and the
   *   same stated limit about refused rows — as {@link Fabricate#salvageComponents}.
   * @returns {Promise<{items: object[], unitsDeleted: number, documentsDeleted: number}>}
   */
  async destroyComponents({ actorId = null, targets = [], onProgress = null } = {}) {
    this._requireReady();
    const gated = this._gateBulkTargets(targets, actorId);
    const runnable = gated.filter((entry) => entry.actor);

    const result = await this._getBulkDestroyService().run({
      targets: runnable.map(({ target, actor }) => ({
        // The RESOLVED document, not an id: the service's matcher and delete both need
        // the actor itself, and re-resolving it there would be a second gate to keep
        // honest. Resolution and the ownership decision stay in one place.
        actor,
        actorId: actor.id,
        actorName: actor.name,
        systemId: target.systemId,
        componentId: target.componentId
      })),
      onProgress
    });

    const items = this._mergeBulkRows(gated, result.items, (target) => ({
      ...this._buildNotPermittedRow(target),
      requested: 0,
      unitsDeleted: 0,
      documentsDeleted: 0,
      staleIds: 0,
      items: [],
      vetoed: []
    }));
    return { items, unitsDeleted: result.unitsDeleted, documentsDeleted: result.documentsDeleted };
  }

  /**
   * Re-evaluate the craftability of ONE ingredient set with in-session per-group
   * option overrides applied (issue 552). Backs the crafting store's
   * `selectedCraftability` recompute when the player picks a non-default option, so
   * the ingredient tiles reflect the chosen option/stack through the SAME
   * `RecipeManager.evaluateCraftability` → `resolveIngredientSelection` seam the
   * engine consumes. Synchronous (the store reads it from a `$derived`).
   *
   * @param {object} options
   * @param {string|null} [options.recipeId]
   * @param {string|null} [options.setId] The ingredient set to re-evaluate.
   * @param {object|null} [options.optionOverrides] `{ [groupId]: {optionIndex, heldItemId?} }`.
   * @param {object|null} [options.essenceAllocation] `{ [itemKey]: units }` — the
   *   player's funding for the set's shared essence block (issue 917), so the rail
   *   shows exactly what a craft would consume.
   * @param {string|null} [options.stepId] Which execution step's set to resolve.
   *   Omitted, the ACTIVE step decides (see below).
   * @param {string|null} [options.actorId] Crafting actor id (defaults to persisted).
   * @param {string[]|null} [options.componentSourceActorIds]
   * @returns {object|null} Fresh single-set craftability, or null when unresolvable.
   */
  evaluateSelectedSet({ recipeId = null, setId = null, optionOverrides = null, essenceAllocation = null, stepId = null, actorId = null, componentSourceActorIds = null } = {}) {
    this._requireReady();
    const recipe = this.recipeManager?.getRecipe?.(recipeId);
    if (!recipe) return null;
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources({
      rememberedActorId: actorId,
      componentSourceActorIds,
    });
    const sources = componentSourceActors.length > 0
      ? componentSourceActors
      : (craftingActor ? [craftingActor] : []);
    if (sources.length === 0) return null;
    // Resolve through the EXECUTION STEPS, not `recipe.ingredientSets`. That array is
    // EMPTY for every explicit multi-step recipe (its sets live on `steps[]`), so the
    // previous top-level scan returned null for all of them and the issue-552 per-group
    // option overrides were silently dead on stepped recipes. `resolveStepIngredientSet`
    // also enforces the two rules that make this safe: with no `stepId` the ACTIVE step
    // decides (never step 0), and a set id is only matched WITHIN the resolved step —
    // set ids are `randomID()`, so a cross-step scan could evaluate a different step.
    const resolved = resolveStepIngredientSet({
      steps: this.resolutionModeService?.getExecutionSteps?.(recipe) ?? [],
      stepId,
      activeStepIndex: activeRunStepState(this.craftingRunManager, craftingActor, recipe.id).index,
      setId,
    });
    if (!resolved) return null;
    // Narrow the evaluation to the one selected set through the SHARED step view the
    // engine crafts against (so the step's tool union applies), keeping the recipe's
    // data fields and the IngredientSet instance methods.
    const singleSetRecipe = {
      ...buildStepRecipeView(recipe, resolved.step),
      ingredientSets: [resolved.set],
    };
    return this.recipeManager.evaluateCraftability(sources, singleSetRecipe, {
      craftingActor,
      optionOverrides,
      essenceAllocation,
    }) ?? null;
  }

  /**
   * Lazily build (and cache) the {@link AlchemyListingBuilder} that projects the
   * leak-safe player Alchemy workbench view. Mirrors
   * {@link Fabricate#_getCraftingListingBuilder}: a Foundry-global-free read-side
   * collaborator wired with the existing managers. `localize` is injected here.
   *
   * @returns {AlchemyListingBuilder}
   * @private
   */
  _getAlchemyListingBuilder() {
    if (this._alchemyListingBuilder) return this._alchemyListingBuilder;
    this._alchemyListingBuilder = new AlchemyListingBuilder({
      recipeManager: this.recipeManager,
      craftingSystemManager: this.craftingSystemManager,
      recipeVisibility: this.recipeVisibilityService,
      localize: (key, data) =>
        data !== undefined
          ? (game.i18n?.format?.(key, data) ?? key)
          : (game.i18n?.localize?.(key) ?? key),
      // The per-pass inventory snapshot's component resolver (issue 1228). The workbench
      // never reads component tallies itself; this is here so its snapshot is the same
      // complete value every other pass builds.
      resolveComponentForItem: findMatchingComponent,
    });
    return this._alchemyListingBuilder;
  }

  /**
   * Build the leak-safe player Alchemy workbench listing for the current user and
   * selected crafting actor + component sources, scoped to `craftingSystemId`. The
   * current Foundry user is always the viewer (GM bypass honoured by the builder),
   * and the actor is resolved through the SAME owner gate as crafting
   * ({@link Fabricate#_resolveCraftingActor}) — a non-owner viewer's actor resolves
   * to null, so the builder returns a denied, empty listing (never another user's
   * inventory or fizzle memory).
   *
   * @param {object} [options]
   * @param {string|null} [options.actorId] Crafting actor id; defaults to the
   *   persisted last-crafting selection when omitted.
   * @param {string|null} [options.craftingSystemId] The chosen alchemy (crafting) system.
   * @param {string[]|null} [options.componentSourceActorIds] Additional inventory
   *   source actor ids; defaults to the persisted component-source set.
   * @returns {object} Leak-safe alchemy listing model.
   */
  listAlchemyForActor({ actorId = null, craftingSystemId = null, componentSourceActorIds = null } = {}) {
    this._requireReady();
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources({
      rememberedActorId: actorId,
      componentSourceActorIds,
    });
    return this._getAlchemyListingBuilder().buildListing({
      craftingActor,
      componentSourceActors,
      viewer: game.user,
      craftingSystemId,
    });
  }

  /**
   * Submit a workbench of components as an alchemy brew attempt. Owner-scoped like
   * {@link Fabricate#craftRecipe}: resolves the crafting actor + component sources
   * (or persisted defaults), maps each submitted component id to an owned item unit
   * on the sources, then delegates to {@link CraftingEngine#craftAlchemy}, which is
   * authoritative — it matches against ALL enabled recipes (known + undiscovered),
   * discovers + consumes + produces on a match, and fizzles (no check, no roll,
   * `disposition:'no-match'`) otherwise.
   *
   * @param {object} options
   * @param {string|null} [options.actorId] Crafting actor id.
   * @param {string} options.craftingSystemId Alchemy system to match against.
   * @param {string[]} [options.submittedComponentIds] One component id per placed
   *   unit (a stack of N contributes the id N times).
   * @param {string[]|null} [options.componentSourceActorIds] Source actor ids.
   * @param {boolean} [options.interactive] Prompt an interactive roll on a matched
   *   brew (the workbench passes true). Defaults to false for API/automation. A
   *   fizzle runs no check, so this flag never triggers a roll on the fizzle path.
   * @returns {Promise<object>} The craftAlchemy result.
   */
  async submitAlchemyAttempt({
    actorId = null,
    craftingSystemId = null,
    submittedComponentIds = [],
    componentSourceActorIds = null,
    interactive = false,
  } = {}) {
    this._requireReady();
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources({
      rememberedActorId: actorId,
      componentSourceActorIds,
    });
    if (!craftingActor) {
      return { success: false, results: null, message: 'No crafting actor selected', disposition: 'error' };
    }
    const sources = componentSourceActors.length > 0 ? componentSourceActors : [craftingActor];
    const system = this.craftingSystemManager?.getSystem?.(craftingSystemId) ?? null;
    const components = resolvedComponentsFor(system);
    const submittedItems = resolveAlchemySubmissions(
      sources,
      components,
      submittedComponentIds,
      craftingSystemId
    );
    if (submittedItems.length === 0) {
      return { success: false, results: null, message: 'FABRICATE.App.Alchemy.NoIngredients', disposition: 'error' };
    }
    return await this.craftingEngine.craftAlchemy(craftingActor, sources, submittedItems, {
      craftingSystemId,
      interactive,
    });
  }

  /**
   * Read the persisted last-selected alchemy system (`LAST_ALCHEMY_SYSTEM` client
   * setting). Returns an empty string when unset.
   *
   * @returns {string}
   */
  getSelectedAlchemySystemId() {
    return getSetting(SETTING_KEYS.LAST_ALCHEMY_SYSTEM) || '';
  }

  /**
   * Persist the selected alchemy system (`LAST_ALCHEMY_SYSTEM`).
   *
   * @param {string} id Crafting system id to persist.
   * @returns {*}
   */
  setSelectedAlchemySystemId(id) {
    return setSetting(SETTING_KEYS.LAST_ALCHEMY_SYSTEM, id ?? '');
  }

  /**
   * List the actors the current user may select as crafting/component-source
   * actors. Filtered exactly like the actor-selection bar
   * (`getBarSelectableActors` → owned player characters; a GM sees all) so the
   * component-source picker offers the same characters as the crafting-actor
   * selector — not owned non-character actors. Returns redaction-safe display data
   * only — each record carries `{ id, uuid, name, img }`.
   *
   * @returns {Array<{id: string|null, uuid: string|null, name: string, img: string|null}>}
   */
  listCraftingSourceActors() {
    this._requireReady();
    return getBarSelectableActors({ viewer: game.user }).map((actor) => ({
      id: actor?.id ?? actor?.uuid ?? null,
      uuid: actor?.uuid ?? null,
      name: actor?.name ?? '',
      img: actor?.img ?? null,
    }));
  }

  /**
   * Resolve the current selection's component-source actors as real Foundry actor
   * objects (crafting actor + persisted sources), for the pure shopping-list
   * aggregator. Owner-scoped via the persisted ids only — no widening of access.
   *
   * @returns {Actor[]}
   */
  getCraftingSourceActors() {
    this._requireReady();
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources();
    const actors = componentSourceActors.length > 0 ? componentSourceActors : [];
    if (craftingActor && !actors.includes(craftingActor)) actors.unshift(craftingActor);
    return actors;
  }

  /**
   * Read the persisted remembered crafting-actor selection (`LAST_CRAFTING_ACTOR`
   * client setting). Returns an empty string when unset.
   *
   * @returns {string}
   */
  getSelectedCraftingActorId() {
    return getSetting(SETTING_KEYS.LAST_CRAFTING_ACTOR) || '';
  }

  /**
   * Persist the remembered crafting-actor selection (`LAST_CRAFTING_ACTOR`).
   *
   * @param {string} id Actor id to persist.
   * @returns {*}
   */
  setSelectedCraftingActorId(id) {
    return setSetting(SETTING_KEYS.LAST_CRAFTING_ACTOR, id ?? '');
  }

  /**
   * Read the persisted component-source actor ids (`LAST_COMPONENT_SOURCES`).
   *
   * @returns {string[]}
   */
  getCraftingComponentSourceIds() {
    const ids = getSetting(SETTING_KEYS.LAST_COMPONENT_SOURCES);
    return Array.isArray(ids) ? ids : [];
  }

  /**
   * Persist the component-source actor ids (`LAST_COMPONENT_SOURCES`).
   *
   * @param {string[]} ids Actor ids to persist.
   * @returns {*}
   */
  setCraftingComponentSourceIds(ids) {
    return setSetting(SETTING_KEYS.LAST_COMPONENT_SOURCES, Array.isArray(ids) ? ids : []);
  }

  /**
   * The player's favourite recipe ids (client-scoped, `FAVOURITE_RECIPES`).
   *
   * @returns {string[]}
   */
  getFavouriteRecipeIds() {
    const ids = getSetting(SETTING_KEYS.FAVOURITE_RECIPES);
    return Array.isArray(ids) ? ids : [];
  }

  /**
   * Toggle a recipe's favourite state and persist the updated id list.
   *
   * @param {string} recipeId The recipe id to add/remove.
   * @returns {string[]} The updated favourite id list (unchanged if `recipeId` is falsy).
   */
  toggleFavouriteRecipe(recipeId) {
    const current = this.getFavouriteRecipeIds();
    if (!recipeId) return current;
    const next = current.includes(recipeId)
      ? current.filter((id) => id !== recipeId)
      : [...current, recipeId];
    setSetting(SETTING_KEYS.FAVOURITE_RECIPES, next);
    return next;
  }

  /**
   * The player's stored progressive result orders, keyed `recipe:<id>` / `salvage:<id>`
   * (`PROGRESSIVE_RESULT_ORDER`).
   *
   * USER-scoped, NOT client-scoped: this preference is per user PER WORLD. It reaches
   * that user on any device they open THIS world from, and the same player in another
   * world gets a fresh map. It does NOT follow the account globally — that phrasing is
   * wrong for `scope: 'user'` and is banned in `AGENTS.md` for exactly this reason.
   * (The `getFavouriteRecipeIds` neighbour above IS client-scoped, i.e. per device; do
   * not read its JSDoc as describing this one.)
   *
   * @returns {Record<string, string[]>}
   */
  getProgressiveResultOrder() {
    const stored = getSetting(SETTING_KEYS.PROGRESSIVE_RESULT_ORDER);
    return stored && typeof stored === 'object' ? stored : {};
  }

  /**
   * The Foundry edge for the `getPlayerResultOrder` seam injected into
   * `ResolutionModeService` and `CraftingEngine` (issue 651 D1).
   *
   * Deliberately a one-line settings read returning DATA (an id list), not a sorted
   * array: the reconciliation itself lives in the pure `applyPlayerResultOrder`, so the
   * ordering logic is unit-testable with no settings stub.
   *
   * @param {{ scope: 'recipe'|'salvage', id: string }} entry
   * @returns {string[]|null} The executing user's stored order, or null when there is none.
   */
  _readPlayerResultOrder(entry) {
    const key = progressiveOrderKey(entry);
    if (!key) return null;
    const order = this.getProgressiveResultOrder()[key];
    return Array.isArray(order) ? order : null;
  }

  /**
   * Persist the player's preferred result order for one namespaced key.
   *
   * ASYNC AND MUST BE AWAITED. Under `user` scope `set` is a real, replicated document
   * write that can REJECT — unlike the fire-and-forget `setSetting(...)` used by
   * `toggleFavouriteRecipe` above, which is correct only because that setting is
   * client-scoped (a synchronous localStorage write that cannot fail). Swallowing the
   * promise here would let a caller believe an order that was never stored.
   *
   * @param {string} key Namespaced key from `progressiveOrderKey` (`recipe:<id>`/`salvage:<id>`).
   * @param {string[]} orderedIds The player's preferred result ids.
   * @returns {Promise<Record<string, string[]>>} The updated map.
   */
  async setProgressiveResultOrder(key, orderedIds) {
    const current = this.getProgressiveResultOrder();
    if (!key) return current;
    const next = { ...current, [key]: Array.isArray(orderedIds) ? orderedIds : [] };
    await setSetting(SETTING_KEYS.PROGRESSIVE_RESULT_ORDER, next);
    return next;
  }

  /**
   * Whether the player has opted to hide unavailable (locked) gathering
   * environments in the Environments column.
   *
   * Backed by the `GATHERING_HIDE_UNAVAILABLE` setting, which is
   * `scope: 'client'`. A client-scoped setting persists in that browser's
   * `localStorage`, so this preference is per client/device, not per user.
   * The same account on a second device or browser starts at the default
   * (off). Defaults to false (show all).
   *
   * @returns {boolean}
   */
  getHideUnavailableEnvironments() {
    // Boolean() rather than `=== true`: the setting is registered `type: Boolean`
    // so the value is already boolean, and the strict compare trips a static-analysis
    // false positive (game.settings.get is not typed as boolean).
    return Boolean(getSetting(SETTING_KEYS.GATHERING_HIDE_UNAVAILABLE));
  }

  /**
   * Persist the player's "hide unavailable environments" preference.
   *
   * Writes the client-scoped `GATHERING_HIDE_UNAVAILABLE` setting, so the
   * choice is remembered per client/device (`localStorage`) and does not
   * follow the user account to another device. This is a view-only preference
   * and changes no saved data, the engine listing, or GM configuration.
   *
   * @param {boolean} value Whether to hide unavailable (locked) environments.
   * @returns {Promise<boolean>}
   */
  setHideUnavailableEnvironments(value) {
    return setSetting(SETTING_KEYS.GATHERING_HIDE_UNAVAILABLE, value === true);
  }

  /**
   * Start a gathering attempt for the current user.
   *
   * The raw GatheringEngine remains module-internal so all public attempts use
   * current-user viewer enforcement.
   *
   * @param {object} options Gathering start-attempt options.
   * @param {boolean} [options.interactive] When true, prompt the player with the
   *   confirm-roll dialog (optional situational modifier) and post the roll to chat
   *   so Dice So Nice animates it, for the routed and progressive check paths.
   *   Defaults to false so macros and automation stay silent. The Fabricate
   *   Gathering view passes true. The d100 immediate gathering mode never prompts
   *   (its roll runs outside the shared check seam), and timed gathering tasks never
   *   prompt (they resolve at GM-gated world-time maturation). A dismissed prompt
   *   returns a quiet `{ accepted: false, cancelled: true }` result with zero
   *   mutation and no notification.
   * @returns {*} Gathering start-attempt result.
   */
  startGatheringAttempt(options = {}) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    // Resolve the SAME actor the listing/availability was computed for: default
    // to the persisted selection, an explicit (truthy) id overrides. Without this
    // the engine falls back to selectableActors[0] and silently mis-gates the
    // attempt — the player-app "nothing happens" bug. See _withRememberedActorDefault.
    const withRememberedActor = this._withRememberedActorDefault(options);

    // `requestStart`, not `startAttempt`: a blind timed start this client may not
    // write is routed to the active GM before any task is drawn (issue 901). Every
    // other start delegates straight to `startAttempt` and is unchanged.
    return callGatheringRuntimeWithCurrentViewer(gatheringEngine, 'requestStart', withRememberedActor, () => game.user);
  }

  /**
   * Lazily compute the per-drop "What you might find" breakdown for one task the
   * player has opened in the gathering inspector. Defaults the remembered actor
   * to the persisted selection (explicit `rememberedActorId` overrides) and
   * enforces the current Foundry user as the viewer.
   *
   * @param {object} options { environmentId, taskId, rememberedActorId? }
   * @returns {*} Drop-breakdown result ({ resolutionMode, awardMode, awardLimit, eventPolicy, drops }).
   */
  getGatheringDropBreakdown(options = {}) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    const withRememberedActor = this._withRememberedActorDefault(options);

    return callGatheringRuntimeWithCurrentViewer(gatheringEngine, 'getTaskDropBreakdown', withRememberedActor, () => game.user);
  }

  inspectGatheringEnvironmentState(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.inspectEnvironment(options.environmentId) ?? null;
  }

  restockGatheringNode(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.restockNode(options);
  }

  updateGatheringConditions(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.updateConditions(options);
  }

  /**
   * Read current gathering conditions and configured tag vocabularies.
   *
   * This public API is safe for player-facing callers. It exposes global
   * weather/time-of-day state and available gathering tags, but not GM-only
   * library internals.
   *
   * @returns {{weather: string, timeOfDay: string, vocabularies: object}|undefined}
   */
  getGatheringConditions() {
    this._requireReady();
    return this.gatheringRichStateService?.getConditions();
  }

  /**
   * Set the current global gathering weather tag.
   *
   * @param {string} weatherTag Configured weather tag.
   * @returns {*} Updated gathering conditions.
   */
  setGatheringWeather(weatherTag) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setWeather(weatherTag);
  }

  /**
   * Set the current global gathering time-of-day tag.
   *
   * @param {string} timeOfDayTag Configured time-of-day tag.
   * @returns {*} Updated gathering conditions.
   */
  setGatheringTimeOfDay(timeOfDayTag) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setTimeOfDay(timeOfDayTag);
  }

  /**
   * Atomically update global gathering conditions.
   *
   * Omitted fields keep their current values. Mutations require a GM user,
   * validate tags through the rich state service, persist the setting, and
   * dispatch the gathering condition update hook.
   *
   * @param {{weather?: string, timeOfDay?: string}} conditions Condition updates.
   * @returns {*} Updated gathering conditions.
   */
  setGatheringConditions(conditions = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setConditions(conditions);
  }

  setGatheringStamina(options = {}) {
    this._requireReady();
    this._requireGM();
    const actor = options.actor || (options.actorId ? game.actors?.get(options.actorId) : null);
    // Legacy API back-compat: a `{ provider: 'external' }` argument maps to a
    // read-only max. The service also tolerates the legacy value, but mapping
    // it here keeps the public boundary on the `maxReadOnly` vocabulary.
    const { provider, ...rest } = options;
    const mapped =
      provider === undefined ? rest : { ...rest, maxReadOnly: provider === 'external' };
    return this.gatheringRichStateService?.setActorStamina(actor, mapped);
  }

  adjustGatheringStamina(options = {}) {
    this._requireReady();
    this._requireGM();
    const actor = options.actor || (options.actorId ? game.actors?.get(options.actorId) : null);
    return this.gatheringRichStateService?.adjustActorStamina(actor, options);
  }

  /**
   * Read a crafting system's gathering economy block (mode + stamina regen).
   * Player-safe — the mode and regen cadence are surfaced in the player UI.
   *
   * @param {{systemId: string}} options
   * @returns {{mode: string, stamina: {regen: object}}|null}
   */
  getGatheringEconomy(options = {}) {
    this._requireReady();
    return this.gatheringRichStateService?.systemEconomy(options.systemId) ?? null;
  }

  /**
   * Set a crafting system's gathering economy block. GM-only.
   *
   * @param {{systemId: string, economy: object}} options
   * @returns {Promise<object|null>} The normalized economy block.
   */
  setGatheringEconomy(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setSystemEconomy(options);
  }

  /**
   * List the stamina pools of player-owned actors for one crafting system, for
   * the GM "Gathering State" panel. GM-only.
   *
   * @param {{systemId: string}} options
   * @returns {Array<{actorId: string, name: string, img: string, current: number|null, max: number|null, maxReadOnly: boolean}>}
   */
  getGatheringStaminaState(options = {}) {
    this._requireReady();
    this._requireGM();
    const systemId = options.systemId;
    const service = this.gatheringRichStateService;
    if (!service || !systemId) return [];
    // Player characters only, per the CONFIGURED player-character actor types
    // (issue 1024) — so a Fallout `robot` appears here once the GM ticks it, and a
    // dnd5e `npc` never does. A player character with no rolled pool yet reports
    // max: null (the panel offers Roll).
    return Array.from(game.actors?.contents ?? [])
      .filter(actor => isPlayerCharacterActor(actor))
      .map(actor => {
        const stamina = service.getActorStamina(actor, systemId);
        return { actorId: actor.id, name: actor.name, img: actor.img, ...stamina };
      });
  }

  /**
   * (Re)roll a character's stamina pool from the system max/start expression
   * templates and persist it. GM-only; used by the panel's Roll/Reset control.
   *
   * @param {{systemId: string, actorId: string}} options
   * @returns {Promise<object|null>} The materialized pool, or null.
   */
  rollGatheringStamina(options = {}) {
    this._requireReady();
    this._requireGM();
    const actor = options.actor || (options.actorId ? game.actors?.get(options.actorId) : null);
    if (!actor) return null;
    return this.gatheringRichStateService?.seedActorStaminaIfNeeded({ actor, systemId: options.systemId, force: true });
  }

  revealGatheringTask(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.revealTask(options.actor, options);
  }

  clearGatheringTaskReveal(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.clearReveal(options.actor, options);
  }

  _requireReady() {
    if (!this.ready) throw new Error('Fabricate not initialized');
  }

  _requireGM() {
    if (game.user?.isGM !== true) throw new Error('Gathering rich state changes require a GM user');
  }

  /**
   * Current world time in seconds (the Foundry-facing read seam). Lives on this
   * edge so the Journal store and pure UI utils stay free of `game.*`.
   *
   * @returns {number}
   */
  getWorldTime() {
    return Number(game.time?.worldTime || 0);
  }

  /**
   * Calendar components (`{ year, day, hour, minute, … }`) for an absolute world
   * time, via the V13 calendar's `timeToComponents`. Augmented with `daysPerYear`
   * (when derivable) so the pure {@link worldTimeLabel} util can compose a
   * monotonic, 1-based absolute campaign day from the within-year `day` (which
   * resets each year) without itself touching `game.*`. Returns null when no
   * calendar is configured.
   *
   * @param {number} [worldTime] Defaults to the current world time.
   * @returns {object|null}
   */
  getWorldTimeComponents(worldTime = this.getWorldTime()) {
    const calendar = game.time?.calendar ?? null;
    if (typeof calendar?.timeToComponents !== 'function') return null;
    try {
      const components = calendar.timeToComponents(Number(worldTime) || 0);
      if (!components || typeof components !== 'object') return null;
      const daysPerYear = daysPerYearFromCalendar(calendar);
      if (daysPerYear !== null) components.daysPerYear = daysPerYear;
      return components;
    } catch {
      return null;
    }
  }

  /**
   * Lazily construct the singleton {@link RunJournalBuilder}, wired to the real
   * run managers and services. Held on the instance so a fresh builder is not
   * rebuilt per listing call.
   * @private
   * @returns {RunJournalBuilder}
   */
  _getRunJournalBuilder() {
    if (!this._runJournalBuilder) {
      this._runJournalBuilder = new RunJournalBuilder({
        craftingRunManager: this.craftingRunManager,
        salvageRunManager: this.salvageRunManager,
        gatheringRunSource: this.gatheringRunManager,
        recipeManager: this.recipeManager,
        resolutionModeService: this.resolutionModeService,
        recipeVisibility: this.recipeVisibilityService,
        getSystem: (systemId) => this.craftingSystemManager?.getSystem(systemId) ?? null,
        getTool: (systemId, toolId) => this._resolveJournalTool(systemId, toolId),
        getGatheringTask: (environmentId, taskId) =>
          this._resolveJournalGatheringTask(environmentId, taskId),
        // GM-only secret preview of an in-flight blind run's drawn task (issue 901).
        // The builder consults it only for a GM viewer; a player's journal shows the
        // generic blind label, which is what the run record itself now carries.
        getGatheringBlindSecret: (runId) => this.gatheringBlindRunStore?.get(runId) ?? null,
        getResultItem: (itemUuid) => this._resolveJournalResultItem(itemUuid),
        getComponent: (systemId, componentId) =>
          this._resolveJournalComponent(systemId, componentId),
        getViewer: () => game.user,
        localize: (key, data) => localizeGathering(key, data),
        nowWorldTime: () => this.getWorldTime(),
        // The per-pass inventory snapshot's component resolver (issue 1228). The Journal
        // never reads component tallies itself; this is here so its snapshot is the same
        // complete value every other pass builds.
        resolveComponentForItem: findMatchingComponent,
      });
    }
    return this._runJournalBuilder;
  }

  /**
   * Resolve a system library tool to `{ id, name, img }` for the Journal step
   * detail, through the shared `data-models` requirement-13 precedence: authored
   * label, then the registration snapshot, then the referenced component, then the
   * raw id. The snapshot rung is load-bearing — without it an item-sourced Tool
   * (`componentId: null` by construction) printed its raw id (issue 1119).
   * @private
   */
  _resolveJournalTool(systemId, toolId) {
    const system = this.craftingSystemManager?.getSystem(systemId);
    if (!system || !toolId) return null;
    const tool = resolvedToolsFor(system).find((entry) => entry?.id === toolId);
    if (!tool) return null;
    const component = linkedComponentFor(tool, resolvedComponentsFor(system));
    const img = resolveToolDisplayImage(tool, component);
    return {
      id: tool.id,
      name: resolveToolDisplayName(tool, component, tool.id),
      // The Journal renders its own default artwork, so the generic sentinel stays
      // null rather than being baked in here.
      img: img === TOOL_IMAGE_SENTINEL ? null : img,
    };
  }

  /**
   * Resolve a gathering run's task to `{ name, img }` for the Journal, via the
   * COMPOSED environment (`_findEnvironment`), which carries the authored task
   * name/image — the raw environment store does not. Mirrors how a crafting run
   * resolves its recipe name/image. Returns null when the environment or task
   * cannot be resolved (the Journal then falls back to the raw task id + default).
   * @private
   */
  _resolveJournalGatheringTask(environmentId, taskId) {
    if (!environmentId || !taskId) return null;
    const environment = gatheringEngine?._findEnvironment?.(environmentId);
    const tasks = Array.isArray(environment?.tasks) ? environment.tasks : [];
    const task = tasks.find((entry) => entry?.id === taskId);
    return task ? { name: task.name, img: task.img } : null;
  }

  /**
   * Resolve a run's awarded/created result item to `{ name, img }` by its recorded
   * uuid, so the Journal can label produced items — including history recorded
   * before name/img were captured at award time. Best-effort + synchronous
   * (`fromUuidSync`); returns null when the item is gone or unresolvable.
   * @private
   */
  _resolveJournalResultItem(itemUuid) {
    if (!itemUuid || typeof fromUuidSync !== 'function') return null;
    let doc = null;
    try {
      doc = fromUuidSync(itemUuid);
    } catch {
      doc = null;
    }
    return doc ? { name: doc.name ?? null, img: doc.img ?? null } : null;
  }

  /**
   * Resolve a system component to `{ name, img }` for the Journal. Powers a salvage
   * run's title (from the source `componentId`) and the name/img fallback for a
   * salvage created-result that captured neither. Returns null when the system or
   * component cannot be resolved (the Journal then falls back to the raw id + default
   * image, or — for a result — the uuid resolution / bare componentId).
   * @private
   */
  _resolveJournalComponent(systemId, componentId) {
    if (!systemId || !componentId) return null;
    const system = this.craftingSystemManager?.getSystem(systemId);
    const component = findById(getDefinitionIndex(resolvedComponentsFor(system)), componentId);
    return component ? { name: component.name ?? null, img: component.img ?? null } : null;
  }

  /**
   * Resolve the selected actor for the Journal against the bar-selectable list,
   * preferring a remembered id (by `id` or `uuid`), then the first selectable.
   * Mirrors the gathering listing's remembered-actor seam.
   * @private
   */
  _resolveJournalActor(rememberedActorId) {
    const selectable = getBarSelectableActors({ viewer: game.user });
    if (selectable.length === 0) return null;
    if (rememberedActorId) {
      const wanted = String(rememberedActorId);
      const match = selectable.find((actor) => actor?.id === wanted || actor?.uuid === wanted);
      if (match) return match;
    }
    return selectable[0];
  }

  /**
   * Build the unified Journal listing (active + terminal runs) for the current
   * user's selected actor. Resolves the actor via the same remembered-actor seam
   * as {@link Fabricate#listGatheringForActor}.
   *
   * @param {object} [options]
   * @param {string|null} [options.rememberedActorId] Actor id to list for.
   * @returns {object} The JournalListing.
   */
  listJournalForActor(options = {}) {
    this._requireReady();
    const { rememberedActorId } = this._withRememberedActorDefault(options);
    const actor = this._resolveJournalActor(rememberedActorId);
    return this._getRunJournalBuilder().buildListing({ actor, viewer: game.user });
  }

  /**
   * Advance a crafting run's current step — the single player-triggerable run
   * advance boundary. The run's persisted `componentSourceActorUuids` are UUIDs
   * (NOT ids), so they resolve via `fromUuidSync` (falsy entries filtered, with an
   * `[actor]` fallback when none resolve). Because `craft()` writes directly to
   * the source actors (no socket-to-GM relay), a non-owner of any source actor
   * cannot advance the run — that case returns a clear "needs owner" message
   * instead of throwing.
   *
   * The recipe comes from the RESOLVED RUN, never from the caller (issue 966). The
   * Journal redacts `recipeId` to null for a run whose recipe the viewer cannot see,
   * so a client-supplied id cannot be trusted to be present — and trusting it at all
   * let a caller advance run X while naming recipe Y, resolving Y's steps against X's
   * persisted state. The `recipeId` parameter is retained for macro back-compat and
   * ignored.
   *
   * @param {object} options
   * @param {string} options.actorId World-actor id the run is keyed to.
   * @param {string} options.runId Active run id.
   * @param {string} [options.recipeId] Ignored; retained for back-compat.
   * @param {boolean} [options.interactive] When true (a player "Trigger Next Step"
   *   click), prompt the interactive roll dialog + post the roll to chat. Defaults
   *   false so automated/headless advances stay silent.
   * @returns {Promise<object>} The craft result, or a `{ success: false, message }`.
   */
  async advanceCraftingRun({ actorId, runId, interactive = false } = {}) {
    this._requireReady();
    const actor = game.actors?.get(actorId);
    const run = actor ? (this.craftingRunManager?.getActiveRun(actor, runId) ?? null) : null;
    const resolved = resolveAdvanceSources({ actor, run, fromUuid: globalThis.fromUuidSync });
    if (resolved.blocked) {
      return { success: false, message: localizeGathering('FABRICATE.App.Journal.Actions.NeedsOwner') };
    }
    // A run that vanished between render and click (a concurrent cancel, a GM
    // deleting the system) has no recipe to resolve. Report it rather than falling
    // through to `craft()`, which would treat the missing run as a fresh craft.
    if (!run?.recipeId) {
      return { success: false, message: localizeGathering('FABRICATE.App.Journal.Actions.NoRun') };
    }
    return this.craft(actor, run.recipeId, {
      runId,
      componentSourceActors: resolved.componentSourceActors,
      interactive,
    });
  }

  /**
   * Cancel a player's in-progress craft (issue 848) — the owner-scoped counterpart of
   * {@link advanceCraftingRun}. Reuses the SAME ownership guard: because `cancelCraft`
   * restores items to the source actors and reads/updates the crafting actor, a
   * non-owner of any of them is blocked gracefully with a "needs owner" message rather
   * than an ungraceful Foundry permission throw. On success the engine removes the run
   * and — when the system's `features.refundOnPlayerCancel` flag is on (default) —
   * restores the consumed ingredients and refunds the spent currency.
   *
   * @param {object} options
   * @param {string} options.actorId World-actor id the run is keyed to.
   * @param {string} options.runId Active run id to cancel.
   * @returns {Promise<object>} The cancel result, or a `{ success: false, message }`.
   */
  async cancelCraftingRun({ actorId, runId } = {}) {
    this._requireReady();
    const actor = game.actors?.get(actorId);
    const run = actor ? (this.craftingRunManager?.getActiveRun(actor, runId) ?? null) : null;
    const resolved = resolveAdvanceSources({ actor, run, fromUuid: globalThis.fromUuidSync });
    if (resolved.blocked) {
      return {
        success: false,
        message: localizeGathering('FABRICATE.App.Journal.Actions.NeedsOwner'),
      };
    }
    const result = await this.craftingEngine.cancelCraft(
      actor,
      resolved.componentSourceActors,
      runId
    );
    if (result?.success && result.cancelled) {
      let key = 'FABRICATE.App.Journal.Actions.Cancelled';
      if (result.refunded) {
        key = 'FABRICATE.App.Journal.Actions.CancelledRefunded';
      } else if (result.partialRefund) {
        // A partial reversal must not claim a full return: some inputs came back but
        // others (or the currency refund) could not be restored.
        key = 'FABRICATE.App.Journal.Actions.CancelledPartial';
      }
      return { ...result, message: localizeGathering(key) };
    }
    return result;
  }

  /**
   * Quick craft helper - craft a recipe for an actor
   * @param {Actor} actor - The actor performing the craft
   * @param {string|Recipe} recipe - Recipe ID or Recipe object
   * @param {Object} options - Crafting options
   */
  async craft(actor, recipe, options = {}) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    // Get recipe object if ID was provided. Capture the id BEFORE the reassignment
    // so the not-found message names it — reading `recipe` after the lookup always
    // reported "Recipe undefined not found".
    if (typeof recipe === 'string') {
      const recipeId = recipe;
      recipe = this.recipeManager.getRecipe(recipeId);
      if (!recipe) {
        throw new Error(`Recipe ${recipeId} not found`);
      }
    }

    const componentSourceActors = Array.isArray(options.componentSourceActors)
      ? options.componentSourceActors.filter(Boolean)
      : [actor];

    const ingredientSetId = options.ingredientSetId || null;

    return await this.craftingEngine.craft(
      actor,
      componentSourceActors,
      recipe,
      ingredientSetId,
      options
    );
  }

  /**
   * Delete a recipe by ID.
   *
   * Routes through `CraftingSystemManager.deleteRecipes` (issue 1132) so this documented
   * public API and the GM studio cannot disagree about what deleting a recipe reaches: the
   * recipe-item membership prune cascades here too, in one `recipes` write, at most one
   * `craftingSystems` write and one actor-flag clean-up (itself two writable-actor walks,
   * not one pass). The singular `ui.notifications.info` is unchanged —
   * `RecipeManager.deleteRecipes` raises it for a one-recipe set.
   *
   * The system id comes from the recipe itself; a recipe whose `craftingSystemId` names no
   * system still deletes, and prunes nothing.
   *
   * **API change:** this used to return `undefined`.
   *
   * @param {string} recipeId - The recipe ID to delete
   * @returns {Promise<{deleted: number, recipeIds: string[], recipeItemsAffected: number,
   *   recipeItemsRewritten: number, learnersAffected: number}>}
   * @throws {Error} When Fabricate is not initialized, or `recipeId` names no recipe.
   */
  async deleteRecipe(recipeId) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    const recipe = this.recipeManager.getRecipe(recipeId);
    if (!recipe) {
      throw new Error(`Recipe ${recipeId} not found`);
    }

    return await this.craftingSystemManager.deleteRecipes(recipe.craftingSystemId, [recipeId]);
  }
}

// Create global instance
const fabricate = new Fabricate();

// Register the init-time Foundry CONFIG entries for the canvas Interactable
// foundation. Defensive + idempotent: every call no-ops when the underlying API is
// missing or already registered, so it is safe to run from BOTH the `init` and
// `ready` hooks — the latter is a backstop for when a late module evaluation (e.g.
// the Vite dev server delivering the source entry after Foundry's `init` event)
// causes the `init` hook callback to be registered for an already-spent event and
// never run.
function registerFabricateConfig() {
  // Register the region-first `fabricate.interactable` Region Behaviour data model
  // + its type icon/label. Defensive + idempotent: no-ops when the Foundry region
  // APIs are unavailable (e.g. an older core), so it is safe to call unconditionally.
  registerInteractableRegionBehavior(CONFIG);

  // Register the CORE schema-driven RegionBehaviorConfig as the document sheet for
  // the `fabricate.interactable` RegionBehavior subtype (V13). Our rich
  // `InteractableConfigApp` is an ApplicationV2 + SvelteApplicationMixin, NOT a
  // DocumentSheet, so registering it left `behavior.sheet` null and broke the edit
  // pencil. The core sheet renders our behaviour fields (plus the `events`
  // multi-select) and makes `behavior.sheet` resolve. Our rich panel stays
  // reachable via the Tile/Token HUD entry + scene-control opener
  // (`getInteractableConfigAppClass().show(ref)`). Resolved defensively via
  // globalThis — a no-op when the API shape differs, so it never throws into init.
  try {
    const DocumentSheetConfig = foundry?.applications?.apps?.DocumentSheetConfig
      ?? globalThis.DocumentSheetConfig;
    const RegionBehavior = foundry?.documents?.RegionBehavior
      ?? CONFIG?.RegionBehavior?.documentClass
      ?? globalThis.RegionBehavior;
    const RegionBehaviorConfig = globalThis.foundry?.applications?.sheets?.RegionBehaviorConfig;
    if (typeof RegionBehaviorConfig === 'function') {
      assignInteractableConfigSheet({
        registrar: DocumentSheetConfig,
        RegionBehavior,
        SheetClass: RegionBehaviorConfig
      });
    }
  } catch (_error) {
    // Defensive: a sheet-registration shape mismatch must not break init.
  }
}

// Bind the public Fabricate API onto the live `game.fabricate` global. Pure
// assignment, so it is idempotent and safe to call from BOTH the `init` and `ready`
// hooks. The `ready` call is the backstop that fixes the "still loading" stall: if a
// late module evaluation makes the `init` hook callback fire-for-an-already-spent
// event (so `game.fabricate` is never assigned), the manager would otherwise read an
// undefined global forever despite `fabricate.initialize()` having completed.
function bindFabricateGlobal() {
  // Make API available globally
  game.fabricate = fabricate;
  // Expose the canvas interactable manager singleton so the region behaviour event
  // handlers (`FabricateInteractableRegionBehavior.static events`) can resolve
  // `game.fabricate.interactableManager` to dispatch onRegionEnter/onRegionExit.
  // The handler bodies are added in Phase 1c; the reference must resolve now.
  game.fabricate.interactableManager = InteractableManager.instance;
  game.fabricate.gathering = {
    getConditions: () => fabricate.getGatheringConditions(),
    setWeather: (weatherTag) => fabricate.setGatheringWeather(weatherTag),
    setTimeOfDay: (timeOfDayTag) => fabricate.setGatheringTimeOfDay(timeOfDayTag),
    setConditions: (conditions) => fabricate.setGatheringConditions(conditions),
    getPartyStore: () => fabricate.getGatheringPartyStore(),
    getRealmStore: () => fabricate.getGatheringRealmStore(),
    getLocationService: () => fabricate.getGatheringLocationService(),
    getLocationForActor: (options) => fabricate.getGatheringLocationForActor(options),
    setPartyRealmOverride: (options) => fabricate.setGatheringPartyRealmOverride(options),
    clearPartyRealmOverride: (options) => fabricate.clearGatheringPartyRealmOverride(options),
    revealRealmForActor: (options) => fabricate.revealGatheringRealmForActor(options),
    hideRealmForActor: (options) => fabricate.hideGatheringRealmForActor(options),
    // DEPRECATED region-named helper aliases — forward to the realm method and
    // warn once. Kept so existing macros/modules keep working.
    getRegionStore: () => { deprecate('gathering.getRegionStore', 'gathering.getRealmStore'); return fabricate.getGatheringRealmStore(); },
    setPartyRegionOverride: (options) => { deprecate('gathering.setPartyRegionOverride', 'gathering.setPartyRealmOverride'); return fabricate.setGatheringPartyRealmOverride({ ...options, realmIds: options?.realmIds ?? options?.regionIds }); },
    clearPartyRegionOverride: (options) => { deprecate('gathering.clearPartyRegionOverride', 'gathering.clearPartyRealmOverride'); return fabricate.clearGatheringPartyRealmOverride(options); },
    revealRegionForActor: (options) => { deprecate('gathering.revealRegionForActor', 'gathering.revealRealmForActor'); return fabricate.revealGatheringRealmForActor({ ...options, realmId: options?.realmId ?? options?.regionId }); },
    hideRegionForActor: (options) => { deprecate('gathering.hideRegionForActor', 'gathering.hideRealmForActor'); return fabricate.hideGatheringRealmForActor({ ...options, realmId: options?.realmId ?? options?.regionId }); }
  };

  // Expose classes for advanced users
  game.fabricate.api = {
    Recipe,
    Ingredient,
    IngredientGroup,
    RecipeManager,
    CraftingEngine,
    getFabricateAppClass,
    loadCraftingSystemManagerAppClass,
    getCraftingSystemManagerAppClass,
    getInteractableConfigAppClass,
    getInteractablesManagerAppClass,
    CraftingSystemManager,
    CraftingRunManager,
    SalvageRunManager,
    GatheringEnvironmentStore,
    GatheringRealmStore,
    // DEPRECATED alias for backwards compatibility — same class.
    GatheringRegionStore: GatheringRealmStore,
    GatheringPartyStore,
    CurrencyConfigStore,
    GatheringLocationService,
    GatheringRunManager,
    GatheringGateAndCheckEvaluator,
    GatheringEngine,
    RecipeVisibilityService,
    ResolutionModeService,
    SignatureValidator,
    ItemPilesIntegration,
    CompendiumImporter,
    CraftingSystemExporter,
    // Public hook names module authors can subscribe to, e.g.
    // `Hooks.on(game.fabricate.api.HOOKS.gathering.ATTEMPT_COMPLETED, handler)`.
    HOOKS: FABRICATE_HOOKS,
    // The named, versioned contract for outbound BEHAVIOURAL consumption (issue 1289):
    // `{ schemaVersion, members, outcomes, callSites }`, frozen at module load. `callSites`
    // was added by issue 1293 with no `schemaVersion` bump — the compatibility promise
    // permits GAINING a field, never losing one. Assigned here and
    // NOWHERE else, so its version is readable from Fabricate's own `init` onward, before
    // any collaborator exists — that is the whole affordance, and it is what lets a
    // companion version-check before it calls.
    //
    // The `stable` behavioural members it declares — `grantRecipeKnowledge` and
    // `checkAffordability` from issue 1289, `rollActorCheck` and `resolveBulkCheckDecision`
    // from issue 1293, `awardComponents` and `creditCurrency` from issue 1301, and
    // `readPooledHoldings` and `consumePooledHoldings` from issue 1342 — are METHODS ON
    // THE FACADE, not entries in this class bag, and
    // deliberately so: everything above is a constructor a caller instantiates, while
    // `grantRecipeKnowledge` is an unbounded, GM-gated write whose only authorised route is
    // the gated facade method. Publishing a grant symbol beside these classes would hand out
    // the same capability without the gate — the exact defect that keeps it off
    // `RecipeVisibilityService` in the first place.
    COMPANION: COMPANION_CONTRACT
  };
  managerExtensions.bindPublicApi(game.fabricate.api);
  // Both registries are page-session singletons imported at module scope, so the init and
  // ready replays of this function re-publish the SAME registry rather than recreating it:
  // a companion provider registered during its own `init` survives the ready rebind.
  playerExtensions.bindPublicApi(game.fabricate.api);

  game.fabricate.importFromPack = (packData, options) =>
    fabricate.compendiumImporter?.importFromPackData(packData, options);
  game.fabricate.getCompendiumImporter = () => fabricate.compendiumImporter;

  game.fabricate.exportSystem = (systemId) => {
    const systemManager = fabricate.craftingSystemManager;
    const recipeManager = fabricate.recipeManager;
    if (!systemManager || !recipeManager) throw new Error('Fabricate not initialized');
    const system = systemManager.getSystem(systemId);
    if (!system) throw new Error(`System "${systemId}" not found`);
    const recipes = recipeManager.getRecipes({ craftingSystemId: systemId }).map(r => r.toJSON());
    const version = game.modules?.get('fabricate')?.version || '0.0.0';
    // Gathering authoring rides along, mirroring adminStore.exportSystem: the FULL
    // global environment array (the exporter filters to this system) plus the whole
    // gatheringConfig setting (the exporter slices this system's block + shared
    // vocabularies). Passing three args here dropped both, making the public-API
    // export lossy versus the import path (issue #642).
    const gatheringEnvironments = fabricate.gatheringEnvironmentStore?.list?.() ?? [];
    const gatheringConfig = getSetting(SETTING_KEYS.GATHERING_CONFIG) || {};
    // The world currency ladder rides along too (issue 1278). It is WORLD scope, so unlike the
    // gathering slice there is nothing on the system to fall back on: omit it and the export
    // carries an empty ladder, and every currency cost in it lands in the destination world as
    // an unresolvable unit id.
    const currencyConfig = fabricate.currencyConfigStore?.get?.() ?? {};
    // The world realm library rides along too (issue 1282), for the same reason and with the
    // same consequence: realms are WORLD scope, so omitting this exports an empty library and
    // every realm-gated environment in the payload lands in the destination world citing realm
    // ids that name nothing.
    const travelConfig = fabricate.gatheringRealmStore?.get?.() ?? {};
    // And the world character libraries (issue 1308), for the same reason and with the same
    // consequence: omit them and the export carries empty libraries, so every learning gate,
    // tool requirement and check modifier in the payload lands unresolvable.
    const characterLibraries = fabricate.characterLibrariesStore?.get?.() ?? {};
    // And the three WORLD-SCOPE ENTITY settings (issue 1364), for the same reason and with a
    // sharper consequence: these slices are membership-filtered to this system, so omitting them
    // exports a system whose world roster, world defaults and membership records are all empty —
    // and the destination's world corpus learns nothing about the system it just imported.
    const componentScope = fabricate.getComponentScopeStore?.()?.get?.() ?? {};
    const essenceScope = fabricate.getEssenceScopeStore?.()?.get?.() ?? {};
    const toolScope = fabricate.getToolScopeStore?.()?.get?.() ?? {};
    return CraftingSystemExporter.buildExportPayload(
      system,
      recipes,
      version,
      gatheringEnvironments,
      gatheringConfig,
      currencyConfig,
      travelConfig,
      characterLibraries,
      componentScope,
      essenceScope,
      toolScope
    );
  };

  game.fabricate.importSystemFromFile = async (file, options = {}) => {
    const text = typeof file === 'string' ? file : await file.text();
    const data = JSON.parse(text);
    const validation = CraftingSystemExporter.validateImportData(data);
    if (!validation.valid) throw new Error(`Invalid import data: ${validation.errors.join('; ')}`);
    const mode = options.copyMode ? 'copy' : 'keep';
    // The DESTINATION world's entity roster (issue 1364). Copy mode REQUIRES it and never defaults
    // it: without it every incoming component would mint a fresh id, creating a second world
    // record for every item this world already holds.
    const worldEntityIndex = buildWorldEntityIndex(fabricate);
    const packData = CraftingSystemExporter.prepareForImport(data, mode, { worldEntityIndex });
    return fabricate.compendiumImporter.importFromPackData(packData, {
      overwriteExisting: options.overwriteExisting || false
    });
  };

  // GM "prepare for uninstall" cleanup (issue 535). `fabricate.interactable` is a
  // module-defined RegionBehavior sub-type; Foundry does NOT remove it when Fabricate
  // is disabled/uninstalled, so it errors on every scene load (and, on Foundry
  // < 14.360, cascade-invalidates the parent Region + Scene). This GM-invocable API
  // strips ONLY what Fabricate owns — its `fabricate.interactable` behaviours + its own
  // Tile/Drawing markers — and clears its region-ownership + Token reverse flags,
  // NEVER deleting a parent Region, a foreign behaviour, or a GM's own Token marker.
  // Exposed as a plain API method (no rendered UI control) so a GM can run it from a
  // macro/console; see docs/canvas-interactables.md "Uninstalling Fabricate cleanly".
  game.fabricate.cleanupInteractables = () => runInteractableWorldCleanup();
}

/**
 * The DESTINATION world's entity roster, read from the three world-scope entity stores
 * (issue 1364).
 *
 * A copy-mode import matches every incoming entity's SOURCE REFERENCES against this, binding to
 * the world entity the destination already holds rather than minting a duplicate for the same
 * item. An absent or unseeded store answers an empty list, which simply means every incoming
 * entity mints — the correct behaviour for an unmigrated world, whose scope settings an import
 * never seeds.
 *
 * @param {object} fabricate
 * @returns {{components: object[], essences: object[], tools: object[]}}
 */
function buildWorldEntityIndex(fabricate) {
  return {
    components: fabricate?.getComponentScopeStore?.()?.listEntities?.() ?? [],
    essences: fabricate?.getEssenceScopeStore?.()?.listEntities?.() ?? [],
    tools: fabricate?.getToolScopeStore?.()?.listEntities?.() ?? [],
  };
}

/**
 * The GM-invocable uninstall-safe interactable cleanup edge. Gathers the world's
 * scenes, computes the pure removal plan, confirms with the GM, applies it, and
 * reports a summary. GM-gated and no-throw. Returns the applied counts, or `null`
 * when it was not run (non-GM, nothing to do, or the GM cancelled).
 *
 * @returns {Promise<object|null>}
 */
async function runInteractableWorldCleanup() {
  const t = (key, fallback, data) => {
    const i18n = globalThis.game?.i18n;
    if (data && typeof i18n?.format === 'function') {
      const out = i18n.format(key, data);
      if (out && out !== key) return out;
    } else if (typeof i18n?.localize === 'function') {
      const out = i18n.localize(key);
      if (out && out !== key) return out;
    }
    return fallback;
  };

  if (globalThis.game?.user?.isGM !== true) {
    globalThis.ui?.notifications?.warn?.(
      t('FABRICATE.Canvas.Cleanup.NotGM', 'Only a GM can run Fabricate interactable cleanup.')
    );
    return null;
  }

  const scenes = [...(globalThis.game?.scenes ?? [])];
  const plan = decideWorldInteractableCleanup(scenes);
  if (!planHasWork(plan)) {
    globalThis.ui?.notifications?.info?.(
      t('FABRICATE.Canvas.Cleanup.NothingToDo', 'No Fabricate interactables found. Nothing to clean up.')
    );
    return plan.summary;
  }

  const { summary } = plan;
  const confirmed = await globalThis.foundry?.applications?.api?.DialogV2?.confirm?.({
    window: { title: t('FABRICATE.Canvas.Cleanup.Title', 'Remove Fabricate interactables') },
    content: `<p>${t(
      'FABRICATE.Canvas.Cleanup.Prompt',
      'Remove {behaviors} Fabricate interactable(s) and {markers} marker(s) across {scenes} scene(s)? Your regions, tokens, and any other region behaviours are kept. Run this BEFORE disabling or uninstalling Fabricate.',
      {
        behaviors: summary.behaviorsRemoved,
        markers: summary.visualsDeleted,
        scenes: summary.scenesTouched
      }
    )}</p>`,
    yes: { label: t('FABRICATE.Canvas.Cleanup.Confirm', 'Remove them') },
    no: { label: t('FABRICATE.Canvas.Cleanup.Cancel', 'Cancel') }
  });
  if (confirmed !== true) return null;

  const applied = await executeWorldInteractableCleanup(scenes, plan);
  globalThis.ui?.notifications?.info?.(
    t(
      'FABRICATE.Canvas.Cleanup.Done',
      'Removed {behaviors} Fabricate interactable(s) and {markers} marker(s). You can now safely disable or uninstall Fabricate.',
      { behaviors: applied.behaviorsRemoved, markers: applied.visualsDeleted }
    )
  );
  return applied;
}

// Hook into Foundry's initialization
Hooks.once('init', async () => {
  console.log('Fabricate | Init Hook');
  registerFabricateConfig();
  bindFabricateGlobal();
});

// GM-only Compendium Directory bulk-import action. Registered at module
// top-level (NOT in the `ready` body): the CompendiumDirectory entry context
// menu is built exactly once in `_onFirstRender`, which runs during the sidebar
// force-render BEFORE `Hooks.callAll('ready')`, so a `ready`-body listener could
// miss the one-time build. This differs from the `renderItemDirectory`
// header-button wiring below, which legitimately re-runs on every render.
// The listener MUTATES `contextOptions` in place and returns nothing.
Hooks.on('getCompendiumContextOptions', (application, contextOptions) => {
  contextOptions.push(buildCompendiumImportContextOption({
    localize: bridgeLocalize,
    isGM: () => game.user?.isGM,
    isItemPack: (id) => game.packs.get(id)?.documentName === 'Item',
    getPackName: (id) => {
      const pack = game.packs.get(id);
      return pack?.title ?? pack?.metadata?.label ?? id;
    },
    getSystems: () => game.fabricate?.getCraftingSystemManager?.()?.getSystems?.() ?? [],
    promptSelectSystem: promptSelectCraftingSystem,
    importPack: (systemId, packId) => game.fabricate.getCraftingSystemManager().addItemsFromPack(systemId, packId),
    notify: ui.notifications
  }));
});

// Hook into Foundry's ready event
Hooks.once('ready', async () => {
  // Backstop for a missed `init` (e.g. the Vite dev server evaluating the source
  // entry after Foundry's `init` event already fired, so the `init` hook callback
  // was registered for a spent event and never ran). Both helpers are idempotent, so
  // re-running them here guarantees `game.fabricate` and the canvas Interactable
  // CONFIG are always present before `initialize()` flips readiness — otherwise the
  // manager would read an undefined global and stall on "still loading" forever.
  registerFabricateConfig();
  bindFabricateGlobal();
  await fabricate.initialize();
  await processFabricateWorldTime();
  await runRecipeItemFlagAutoStamp();
  await runComponentFlagAutoStamp();
  // MUST run after the MigrationRunner (which persists the 1.15.0 tool source-ref migration
  // at init) and after the component stamp — it reads the migration-populated tool refs.
  await runToolFlagAutoStamp();
  // #540 Phase 2 (issue 600): re-stamp durable component identity onto owned actor items
  // that currently resolve to a component by name only. Runs after the source-side component
  // stamp so a fresh drag inherits the flag first, and reaches the copies already in
  // inventories that predate it.
  await runOwnedItemComponentIdentityRestamp();
  // Issue 1363 (epic 1357, PR 3): remap the durable identity flags the 1.30.0 world-scope re-key
  // invalidated. MUST run after the source-side component/tool stamps, whose targets this release
  // bumps so a stale SOURCE leaf is rewritten by the stamp itself, and after the owned-item
  // restamp, which never reaches this population because its planner returns early for any item
  // already carrying a durable identity flag.
  await runWorldScopeIdentityFlagRemap();

  // Issue 800: GM-only cue for a world whose stored descriptions predate write-time
  // resolution and still show raw `@UUID[…]` text. A DETECTOR only — it scans
  // already-loaded descriptions synchronously, resolves nothing, rewrites nothing,
  // and self-clears once the GM has run Repair Item Data.
  notifyUnresolvedItemDescriptions();

  // Issue 1024: GM-only advisory for a stack-quantity path that resolves nothing (or
  // reads on the prepared document but is absent from `_source`, so every write is
  // silently discarded by the system's schema cleaner). The path itself was already
  // configured during `initialize()`; this re-applies it and adds the world scan, which
  // needs `game.items` populated. Same call as the setting listener uses, so startup and
  // mid-session edits report identically.
  applyItemStackQuantityPathSetting({ notify: true });

  // Wire the canvas Interactable foundation (region-first: drop interception
  // that spawns a Scene Region + `fabricate.interactable` behaviour + linked
  // marker, the region-enter presence prompt, the controlToken re-trigger, and
  // the "interact here" keybinding). Idempotent — register() no-ops on repeat
  // calls.
  InteractableManager.instance.register();

  game.socket?.on(EVENT_SCENE_SOCKET, (payload, senderId) => {
    // `senderId` is Foundry's server-attested sender user id (the trusted 2nd
    // callback arg of a custom module socket broadcast — set from the authenticated
    // session in `dist/server/sockets.mjs handleCustomSocket`, NOT from the client
    // payload). The interactable handler authenticates privileged edges against it
    // (issue 593); payload `userId` fields are client-supplied and spoofable.
    // Defensive: the event router shares the `module.fabricate` channel with the
    // canvas Interactable round-trip. Guard it so a throw on an event payload can
    // never prevent a non-event Interactable payload from reaching
    // handleInteractableSocketMessage below.
    try {
      routeEventSceneSocketMessage(payload, {
        currentUserId: () => game.user?.id,
        isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
        showPrompt: showEventScenePrompt,
        viewSceneForSelf: (uuid) => viewScene(uuid)
      });
    } catch (_error) {
      // Defensive: an event-route throw must never block the Interactable payload
      // from reaching handleInteractableSocketMessage below.
    }
    // Same channel carries the gathering ENVIRONMENT node depletion a player emits
    // when they gather from a node-backed task: only the active GM may write the
    // `gatheringEnvironments` world setting, so it applies the single-unit decrement
    // here, recomputed from its own stored state. Guarded for the same reason as the
    // event route above — a throw must not starve the Interactable payload.
    try {
      routeGatheringNodeDepleteMessage(payload, {
        isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
        senderId,
        // Bounds the residual denial-of-resource surface: the applier re-checks the
        // node economy but not whether the sender could actually reach that task, so
        // throttle each sender to human gathering speed.
        allowSender: gatheringDepletionRateLimiter,
        applyDeplete: (args) => {
          // The apply is async and nothing awaits a socket handler, so a failed
          // world-setting write must be caught here or it lands as an unhandled
          // rejection on the GM's client.
          Promise.resolve(fabricate.gatheringRichStateService?.applyEnvironmentNodeDepletion(args))
            .catch(error => console.warn('Fabricate | Gathering node depletion failed', error));
        }
      });
    } catch (_error) {
      // Defensive: never block the Interactable payload below.
    }
    // Same channel carries a player's BLIND gathering start (issue 901): only the
    // active GM may write the `gatheringBlindRuns` world setting, and only a client
    // the player does not control may draw the task without the player being able
    // to rig it. Guarded for the same reason as the routes above.
    try {
      routeGatheringBlindStartMessage(payload, {
        isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
        senderId,
        allowSender: gatheringBlindStartRateLimiter,
        applyStart: (args) => {
          // Nothing awaits a socket handler, so a rejected start must be caught
          // here or it lands as an unhandled rejection on the GM's client.
          Promise.resolve(applyGatheringBlindStart(args))
            .catch(error => console.warn('Fabricate | Blind gathering start failed', error));
        }
      });
    } catch (_error) {
      // Defensive: never block the Interactable payload below.
    }
    // Same channel carries a relayed COMPLICATION delivery (issue 1286): the GM-only
    // card and the macro must run on a GM client, from the complication the GM's OWN
    // `craftingSystems` record holds. Addressing only — nothing on the wire names a
    // macro, a visibility or any content. Guarded for the same reason as the routes
    // above: a throw here must not starve the Interactable payload.
    try {
      routeComplicationDeliveryMessage(payload, {
        isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
        senderId,
        // Applied LAST of the refusal gates, so a malformed or unauthenticated message
        // never consumes a sender's budget. Charged per MESSAGE: one resolution — a whole
        // bulk salvage included — emits exactly one.
        allowSender: complicationDeliveryRateLimiter,
        // An elected GM holding two sockets in ONE context receives the same message
        // twice; two tabs are two contexts and remain a stated, accepted residual.
        isFreshDelivery: complicationDeliveryDedupe,
        applyComplications: (args) => {
          // Nothing awaits a socket handler, so a rejected apply must be caught here or
          // it lands as an unhandled rejection on the GM's client.
          Promise.resolve(applyComplicationDelivery(args))
            .catch(error => console.warn('Fabricate | Complication delivery failed', error));
        }
      });
    } catch (_error) {
      // Defensive: never block the Interactable payload below.
    }
    // Same `module.fabricate` channel also carries the canvas Interactable
    // node-update action (player → active GM token-flag write) AND the region-first
    // activation round-trip. Only the active GM applies node/behaviour writes +
    // validates activation; only the targeted user opens a granted session. The
    // validate/grant + open bodies are the manager's region-first activation seams.
    handleInteractableSocketMessage(payload, {
      senderId,
      isSenderGM: (id) => game.users?.get(id)?.isGM === true,
      validateAndGrant: (request) => InteractableManager.instance.validateAndGrant(request),
      openGrant: (grant) => InteractableManager.instance.openGrant(grant),
      notifyDenied: (reason) => InteractableManager.instance.notifyActivationDenied(reason)
    });
  });

  addModuleButtonsToItemsDirectory();
  Hooks.on('fabricate.craftingSystemsChanged', () => addModuleButtonsToItemsDirectory());
  Hooks.on('renderItemDirectory', () => addModuleButtonsToItemsDirectory());
  Hooks.on('updateItem', (item, changes) => {
    void fabricate.craftingSystemManager?.refreshComponentMetadataForUpdatedItem(item, changes);
  });

  // Env-node-driven marker swap: when an environment's task node depletes (or
  // recharges) every linked Tile marker for that (environment, task) flips its
  // image to/from the task's `depletedBehavior.swapImage`. The env `nodeRuntime`
  // is persisted under the `fabricate.gatheringEnvironments` world setting — both a
  // gather decrement and the world-time respawn write it — so reacting to that
  // setting change covers depletion AND recharge. canvasReady does the initial sync
  // to the current node state when a scene loads. Active-GM-gated inside the sync.
  //
  // The handler takes the `Setting` DOCUMENT ONLY. `createSetting` emits
  // `(doc, options, userId)` and `updateSetting` emits `(doc, change, options, userId)`,
  // so a handler written as `(setting, changed) => …` would receive `options` in
  // `changed` on the create leg.
  // The whole body is wrapped in try/catch, but NOT because a throw here would kill the
  // `updateSetting` broadcast — `Hooks.#call` wraps every listener in its own try/catch
  // and routes a throw to `Hooks.onError` (byte-identical in 13.351 and 14.361), so the
  // remaining listeners still run. That "a throw escapes and kills the broadcast" hazard
  // is real for a `SettingConfig.onChange` callback, which runs inside `doc._onUpdate`
  // ahead of `Hooks.callAll` — and it is documented where it applies, beside the two
  // `onChange`-free registrations in `settings.js`.
  //
  // What this try/catch buys is a Fabricate-owned failure signal. Without it the error
  // surfaces as a core `Hooks.onError` line naming this handler (a named `const`, so the
  // line is not anonymous), with no clue which of the four branches below failed or
  // which setting triggered it.
  //
  // The live collaborators every leg hands the bridge. Resolved per call, because
  // `fabricate.recipeManager` is assembled during `ready` and a value captured here would be
  // stale for the rest of the session. Shared by both listeners so they cannot drift into
  // passing different managers.
  const fabricateSettingChangeTargets = () => ({
    craftingSystemManager: fabricate.craftingSystemManager,
    recipeManager: fabricate.recipeManager,
    gatheringEnvironmentStore: fabricate.gatheringEnvironmentStore,
    currencyConfigStore: fabricate.currencyConfigStore,
    travelStore: fabricate.gatheringRealmStore,
    characterLibrariesStore: fabricate.characterLibrariesStore,
    // Issue 1359. Without these three the bridge legs receive `undefined` and NO-OP silently: the
    // key is still "handled", so nothing reports the miss, and the client's world corpus stays at
    // whatever it read at boot for the rest of the session.
    componentScopeStore: fabricate.componentScopeStore,
    essenceScopeStore: fabricate.essenceScopeStore,
    toolScopeStore: fabricate.toolScopeStore,
    callAll: (hook, payload) => Hooks.callAll(hook, payload)
  });
  const handleFabricateSettingDocumentChange = (setting) => {
    try {
      const key = setting?.key ?? `${setting?.namespace ?? ''}.${setting?.id ?? ''}`;
      if (key === `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.GATHERING_ENVIRONMENTS}`) {
        void runInteractableMarkerSync();
      }
      if (key === `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.ITEM_STACK_QUANTITY_PATH}`) {
        // Re-configure, THEN probe. The setting is runtime-mutable, and a startup-only
        // probe would separate the advisory from the typo by an arbitrary amount of
        // destroyed inventory.
        applyItemStackQuantityPathSetting({ notify: true });
      }
      // Cross-client refresh: `craftingSystemsChanged` / `recipesChanged` are local
      // `Hooks.callAll`s fired only on the GM's client. The setting hooks fire on every
      // client when the replicated world setting lands, so reload the stale in-memory
      // manager here and re-emit the local change hook so open player apps refresh.
      handleFabricateSettingChange(key, fabricateSettingChangeTargets());
    } catch (error) {
      console.error('Fabricate | Failed to handle a Fabricate setting change', error);
    }
  };
  Hooks.on('updateSetting', handleFabricateSettingDocumentChange);
  // The FIRST EVER write to a world setting is a CREATE, not an update (issue 1024).
  // `ClientSettings#set` calls `current.update(...)` only when a `Setting` document
  // already exists; `get()` synthesises a detached document with no `_id` when nothing
  // is stored. So a GM ticking a new player-character actor type for the first time
  // emits `createSetting` and never `updateSetting`, and without this line the change
  // propagates to nobody until reload. Wiring it at the shared handler also closes the
  // same latent first-write hole for the `craftingSystems`, `recipes`, and
  // `gatheringEnvironments` branches.
  //
  // Both legs share ONE listener, which `player-character-actor-types.test.js` and
  // `item-stack-quantity.test.js` both pin precisely so they cannot drift apart. Nothing
  // downstream distinguishes a create from an update: both deliver the new value in the
  // document, and every branch reacts by re-reading the key.
  Hooks.on('createSetting', handleFabricateSettingDocumentChange);
  Hooks.on('canvasReady', () => {
    void runInteractableMarkerSync();
  });
  void runInteractableMarkerSync();

  Hooks.callAll('fabricate.ready');
});

/**
 * Issue 555 R3 (repurposed by issue 567) — one-shot, primary-GM-gated backfill that stamps
 * the durable per-system recipe-item identity `flags.fabricate.roles[systemId].recipeItemDefinitionId`
 * (and strips stale `_stats.duplicateSource`) on every registered recipe-item definition's
 * writable source Item, per owning system, so a source registered in two systems lands both
 * leaves. Keyed by the `RECIPE_ITEM_FLAG_STAMP_VERSION` world setting (target bumped 1 → 2), so
 * a world already stamped at v1 (the retired scalar) re-runs once to backfill the `roles` map;
 * a fresh world runs once. Sources only — owned copies inherit the flag on future drags and are
 * otherwise covered by the manual "Repair item data" action. This is NOT a MigrationRunner entry:
 * that runner reads and writes only settings-data payloads and has no Item handle, so it cannot
 * write Item flags.
 */
async function runRecipeItemFlagAutoStamp() {
  try {
    // Primary-GM only, so exactly one client performs the write in a multi-GM world.
    if (game.users?.activeGM?.id !== game.user?.id) return;
    if (Number(getSetting(SETTING_KEYS.RECIPE_ITEM_FLAG_STAMP_VERSION)) >= RECIPE_ITEM_FLAG_STAMP_TARGET) {
      return;
    }
    const manager = fabricate?.getCraftingSystemManager?.();
    if (!manager?.autoStampRecipeItemSources) return;
    const summary = await manager.autoStampRecipeItemSources();
    console.debug?.('Fabricate | recipe-item durable-flag auto-stamp complete', summary);
    await setSetting(SETTING_KEYS.RECIPE_ITEM_FLAG_STAMP_VERSION, RECIPE_ITEM_FLAG_STAMP_TARGET);
  } catch (error) {
    console.error('Fabricate | recipe-item durable-flag auto-stamp failed', error);
  }
}

/**
 * Issue 556 — one-shot, primary-GM-gated backfill that stamps the durable per-system
 * `flags.fabricate.roles[system.id].componentId` (and strips a clone's stale
 * `_stats.duplicateSource`) on every registered component's writable source Item. Keyed
 * by the `COMPONENT_FLAG_STAMP_VERSION` world setting so it runs exactly once per world.
 * Placed BEFORE the `updateItem` hook registers, so restamp writes cannot trigger a
 * metadata-refresh storm. Sources only — owned copies inherit the flag on future drags
 * and are otherwise covered by the manual "Repair item data" action. NOT a MigrationRunner
 * entry: that runner reads/writes only settings-data payloads and cannot write Item flags.
 *
 * ITS VERSION ADVANCE IS WITHHELD while the `1.30.0` migration has not completed (issue 1363).
 * The target was bumped 1 -> 2 by that release so this pass repairs the source-side leaves the
 * re-key invalidated, which makes it a one-shot that CONSUMES a migration's output — and any
 * such pass must gate its irreversible step on migration completion rather than on a corpus
 * predicate, because the deferred branch of the migration pass returns normally.
 */
async function runComponentFlagAutoStamp() {
  try {
    // Primary-GM only, so exactly one client performs the write in a multi-GM world.
    if (game.users?.activeGM?.id !== game.user?.id) return;
    if (Number(getSetting(SETTING_KEYS.COMPONENT_FLAG_STAMP_VERSION)) >= COMPONENT_FLAG_STAMP_TARGET) {
      return;
    }
    const manager = fabricate?.getCraftingSystemManager?.();
    if (!manager?.autoStampComponentSources) return;
    const summary = await manager.autoStampComponentSources();
    console.debug?.('Fabricate | component durable-flag auto-stamp complete', summary);
    // ISSUE 1363 — WITHHOLD THE VERSION ADVANCE UNTIL THE PRODUCING MIGRATION HAS COMPLETED.
    // This release bumps the stamp target precisely so this pass REPAIRS every source Item
    // whose `roles[<systemId>]` leaf names an id `1.30.0` re-keyed. But a deferred migration
    // returns NORMALLY, so this pass runs on the SAME BOOT as a torn one — against the OLD
    // ids, changing nothing — and an unconditional advance would then gate it off FOREVER.
    // `remapWorldScopeIdentityFlags` never touches source Items, so nothing else would ever
    // repair them, and every later drag would copy the stale flag onto an owned item the
    // owned-item restamp refuses because it already carries a durable identity flag.
    if (!mayClearWorldScopeRekeyMap(getSetting(SETTING_KEYS.MIGRATION_VERSION))) return;
    await setSetting(SETTING_KEYS.COMPONENT_FLAG_STAMP_VERSION, COMPONENT_FLAG_STAMP_TARGET);
  } catch (error) {
    console.error('Fabricate | component durable-flag auto-stamp failed', error);
  }
}

/**
 * Issue 561 — one-shot, primary-GM-gated backfill that stamps the durable per-system
 * `flags.fabricate.roles[system.id].toolId` on every registered tool's writable source Item.
 * Keyed by the `TOOL_FLAG_STAMP_VERSION` world setting so it runs exactly once per world, and
 * its advance is WITHHELD until the `1.30.0` migration has completed, for the reason
 * {@link runComponentFlagAutoStamp} states.
 * MUST run AFTER the `1.15.0` settings-data migration (`migrateToolsToFirstClass`) populates
 * each tool's source refs — the migration persists at init, this reads the live normalized
 * systems in the `ready` body — and BEFORE the `updateItem` hook registers. Sources only —
 * owned copies inherit the flag on future drags and are otherwise covered by the manual
 * "Repair item data" action. NOT a MigrationRunner entry: that runner cannot write Item flags.
 */
async function runToolFlagAutoStamp() {
  try {
    // Primary-GM only, so exactly one client performs the write in a multi-GM world.
    if (game.users?.activeGM?.id !== game.user?.id) return;
    if (Number(getSetting(SETTING_KEYS.TOOL_FLAG_STAMP_VERSION)) >= TOOL_FLAG_STAMP_TARGET) {
      return;
    }
    const manager = fabricate?.getCraftingSystemManager?.();
    if (!manager?.autoStampToolSources) return;
    const summary = await manager.autoStampToolSources();
    console.debug?.('Fabricate | tool durable-flag auto-stamp complete', summary);
    // ISSUE 1363 — WITHHOLD THE VERSION ADVANCE UNTIL THE PRODUCING MIGRATION HAS COMPLETED.
    // This release bumps the stamp target precisely so this pass REPAIRS every source Item
    // whose `roles[<systemId>]` leaf names an id `1.30.0` re-keyed. But a deferred migration
    // returns NORMALLY, so this pass runs on the SAME BOOT as a torn one — against the OLD
    // ids, changing nothing — and an unconditional advance would then gate it off FOREVER.
    // `remapWorldScopeIdentityFlags` never touches source Items, so nothing else would ever
    // repair them, and every later drag would copy the stale flag onto an owned item the
    // owned-item restamp refuses because it already carries a durable identity flag.
    if (!mayClearWorldScopeRekeyMap(getSetting(SETTING_KEYS.MIGRATION_VERSION))) return;
    await setSetting(SETTING_KEYS.TOOL_FLAG_STAMP_VERSION, TOOL_FLAG_STAMP_TARGET);
  } catch (error) {
    console.error('Fabricate | tool durable-flag auto-stamp failed', error);
  }
}

/**
 * Issue 600 (#540 Phase 2) — one-shot, active-GM-gated re-stamp that writes the durable
 * per-system `flags.fabricate.roles[systemId].componentId` onto OWNED ACTOR items that
 * currently resolve to a system component by NAME ONLY, so they stop depending on the
 * deprecated name fallback (Phase 3 removal deferred to issue 601). The owned-copy analogue
 * of {@link runComponentFlagAutoStamp} (which stamps registered component SOURCES): those
 * cover future drags, this reaches the copies already in inventories. Keyed by the
 * `OWNED_ITEM_COMPONENT_STAMP_VERSION` world setting so it runs exactly once per world.
 *
 * SCOPE DECISION: it scans the world's `game.actors` collection (fully hydrated at `ready`)
 * and NOT unlinked synthetic-token actors (`scene.tokens` with `actorLink:false`). A LINKED
 * token shares its world actor document, so `game.actors` already covers it; an unlinked
 * token actor is an ephemeral, delta-based synthetic whose items are frequently transient
 * NPC/monster overrides, and writing flags through the token-delta model is fragile — so it
 * is deliberately excluded (conservative, "never touch a doc you can't safely resolve").
 * Actors/scenes not hydrated at `ready` are likewise never force-loaded. Idempotent,
 * merge-safe per role leaf, dotted-id safe, and no-throw-per-item (see the migration module).
 *
 * NOT a MigrationRunner entry: that runner reads/writes only settings-data payloads and has
 * no Item handle, so it cannot write Item flags — identical to the source-side stamps.
 */
async function runOwnedItemComponentIdentityRestamp() {
  try {
    // Active-GM only, so exactly one client performs the inventory writes.
    if (game.users?.activeGM?.id !== game.user?.id) return;
    if (
      Number(getSetting(SETTING_KEYS.OWNED_ITEM_COMPONENT_STAMP_VERSION)) >=
      OWNED_ITEM_COMPONENT_STAMP_TARGET
    ) {
      return;
    }
    const manager = fabricate?.getCraftingSystemManager?.();
    const systems = manager?.getSystems?.() ?? [];
    const summary = await restampOwnedItemComponentIdentity({
      actors: game.actors ?? [],
      systems,
      writeFlag: (item, flagKey, componentId) => setFabricateFlag(item, flagKey, componentId),
    });
    console.debug?.('Fabricate | owned-item component identity re-stamp complete', summary);
    await setSetting(
      SETTING_KEYS.OWNED_ITEM_COMPONENT_STAMP_VERSION,
      OWNED_ITEM_COMPONENT_STAMP_TARGET
    );
  } catch (error) {
    console.error('Fabricate | owned-item component identity re-stamp failed', error);
  }
}

/**
 * Issue 1363 (epic 1357, PR 3) — one-shot, active-GM-gated pass that remaps every durable
 * identity flag the `1.30.0` world-scope re-key invalidated, driven by the persisted
 * `fabricate.worldScopeRekeyMap`. The pure logic lives in `remapWorldScopeIdentityFlags.js`;
 * what is here is the Foundry edge and the two gates, which are DIFFERENT gates and must stay so.
 *
 * WHETHER THE PASS RUNS is corpus-derived — the world scope is seeded — plus its own Number
 * version. WHETHER IT MAY CLEAR THE MAP is gated separately, on the producing migration having
 * COMPLETED. That separation is not defensive style; it is the only thing that keeps a torn
 * migration recoverable. `_runMigrations()` is awaited at startup and its DEFERRED branch returns
 * NORMALLY, so this pass runs on the SAME BOOT as a torn migration. The reachable sequence
 * without the gate: the three scope legs land (they precede `craftingSystems`), so the corpus
 * reads as seeded; this pass remaps, clears the map and advances its version; the next boot finds
 * an already-re-keyed `craftingSystems`, re-derives an EMPTY map, and NEVER rewrites
 * `gatheringConfig`'s old ids — which are then permanently unrepairable, because the map that
 * recorded what to rewrite is gone and this pass will not re-run either, its version having been
 * advanced. (The loss is the lost DECISION RECORD, not a prune: nothing prunes those references at
 * `1.30.0` — see the migration registry's requirement 18. They simply stop resolving, for good.)
 *
 * THE COMPARISON MUST BE `compareSemver`, NEVER A BARE JS `>=`. `migrationVersion` is a STRING
 * setting, so `migrationVersion >= '1.30.0'` is LEXICOGRAPHIC and is TRUE for `'1.4.0'` through
 * `'1.9.0'` — all six are registered migration versions, and they are the worlds running the
 * longest multi-migration pass, i.e. the most tear-prone population there is. The gate would be
 * defeated exactly where it is needed.
 *
 * AND WHEN THE CLEAR IS WITHHELD, THE VERSION ADVANCE IS WITHHELD WITH IT. The shipped one-shot
 * precedent writes its version unconditionally at the end; a pass that skips the clear but
 * advances its version short-circuits on every later boot and NEVER clears, leaving
 * `fabricate.worldScopeRekeyMap` a permanently orphaned world setting. With both withheld the
 * pass genuinely re-runs on a later boot and clears then, and re-running the remap is safe by the
 * map-disjointness property the migration enforces.
 */
async function runWorldScopeIdentityFlagRemap() {
  try {
    // Active-GM only, so exactly one client performs the writes.
    if (game.users?.activeGM?.id !== game.user?.id) return;
    if (
      Number(getSetting(SETTING_KEYS.WORLD_SCOPE_IDENTITY_FLAG_VERSION)) >=
      WORLD_SCOPE_IDENTITY_FLAG_TARGET
    ) {
      return;
    }
    // THE RUN GATE IS CORPUS-DERIVED, and THIS is that predicate. It is equivalent-or-stronger
    // than the `isSeeded('entities')` form the design names: a seeded scope with no pending map
    // means the migration either re-keyed nothing or the map has already been consumed, and in
    // both cases there is nothing here to remap. It also needs no store handle.
    //
    // A world with NOTHING to remap still falls through to the version advance below rather
    // than returning here, so it stops re-checking on every boot forever. That advance is
    // itself gated on migration completion, so a world whose migration deferred BEFORE writing
    // the map re-runs on a later boot rather than short-circuiting.
    const rekeyMap = getSetting(SETTING_KEYS.WORLD_SCOPE_REKEY_MAP) ?? {};
    let summary = null;
    if (hasPendingWorldScopeRekey(() => rekeyMap)) {
      summary = await applyWorldScopeIdentityFlagRemap(rekeyMap);
    }

    // THE CLEAR, and the version advance, share ONE gate. See the docblock. The predicate lives
    // in the pure module, on `compareSemver`, so it is unit-testable and so no reader can
    // re-derive it as a bare JS `>=` on what is a STRING setting.
    if (!mayClearWorldScopeRekeyMap(getSetting(SETTING_KEYS.MIGRATION_VERSION))) {
      console.warn(
        'Fabricate | world-scope re-key map RETAINED: the 1.30.0 migration has not completed on this world yet, so the decision record it may still need is not destroyed. This pass will run again after a successful migration pass.'
      );
      return;
    }
    // THE SECOND WITHHOLD, and it is a different question from the first. The gate above asks
    // whether the PRODUCING migration completed; this asks whether THIS pass did. A rejected
    // write leaves that actor naming retired ids, and destroying the map here would both strand
    // it and un-withhold the startup prune that then deletes its runs on the next boot.
    if (!remapCompletedCleanly(summary)) {
      console.warn(
        `Fabricate | world-scope re-key map RETAINED: ${summary.skippedErrors} document(s) could not be updated, so the repair is incomplete and its decision record is not destroyed. Fix the cause and reload, or run game.fabricate.remapWorldScopeIdentityFlags().`
      );
      return;
    }
    await setSetting(SETTING_KEYS.WORLD_SCOPE_REKEY_MAP, {});
    await setSetting(
      SETTING_KEYS.WORLD_SCOPE_IDENTITY_FLAG_VERSION,
      WORLD_SCOPE_IDENTITY_FLAG_TARGET
    );
  } catch (error) {
    console.error('Fabricate | world-scope identity flag remap failed', error);
  }
}

/**
 * Apply the remap itself and post its GM notice. Split out of the gating above so the two are
 * separately readable: everything here is WORK, everything there is a DECISION.
 *
 * @param {object} rekeyMap The pending `fabricate.worldScopeRekeyMap`.
 */
async function applyWorldScopeIdentityFlagRemap(rekeyMap) {
    const summary = await remapIdentityFlagsAcrossActors({
      actors: game.actors ?? [],
      rekeyMap,
      // Two depths, deliberately: the crafting and salvage containers, the roles map, the legacy
      // scalar and `alchemyDeadEnds` are DOUBLY nested under `flags.fabricate.fabricate.<key>`,
      // while `gatheringRuns` is written with a bare `setFlag` and lives at the SINGLE-scope
      // `flags.fabricate.gatheringRuns`.
      readFlag: (document, key, fallback = null, options = {}) =>
        options.bare
          ? (document?.getFlag?.('fabricate', key) ?? fallback)
          : getFabricateFlag(document, key, fallback),
      writeFabricateFlag: (document, key, value) => setFabricateFlag(document, key, value),
      writeBareFlag: (document, key, value) => document?.setFlag?.('fabricate', key, value),
    });
    console.debug?.('Fabricate | world-scope identity flag remap complete', summary);

    const notice = buildWorldScopeIdentityRemapNotice(summary, (key, data) =>
      data ? game.i18n?.format?.(key, data) : game.i18n?.localize?.(key)
    );
    if (notice && game.user?.isGM) ui.notifications?.warn?.(notice, { permanent: true });
    return summary;
}

/**
 * Run the env-node-driven marker image sync across all scenes. Resolves the live
 * environment from the gathering env store and the library task from the gathering
 * config setting (mirroring InteractableManager's task resolution), and applies the
 * tile texture/flag write directly as the active GM (no-op for non-GM clients).
 */
async function runInteractableMarkerSync() {
  try {
    const environmentStore = fabricate?.getGatheringEnvironmentStore?.() ?? null;
    await syncInteractableMarkers({
      scenes: game.scenes,
      isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
      resolveEnvironment: (environmentId) => environmentStore?.get?.(environmentId) ?? null,
      resolveTask: (systemId, taskId) => {
        const config = getSetting(SETTING_KEYS.GATHERING_CONFIG);
        const tasks = config?.systems?.[systemId]?.tasks;
        return (Array.isArray(tasks) ? tasks : []).find(task => task?.id === taskId) ?? null;
      },
      applyTileImage: (tile, update) => tile?.update?.(update)
    });
  } catch (_error) {
    // Defensive: marker sync must never throw into a hook body.
  }
}

Hooks.on('updateWorldTime', (worldTime) => {
  void processFabricateWorldTime(worldTime);
});

// Cross-client run-cache coherence (issues 733 + 739): the run managers cache an
// actor's runs in memory and never learn about a write another client (or the
// primary-GM world-time resume) made to the actor's run flags. `updateActor` fires on
// every client when the synced document lands — key-filtered to the run-container flag
// paths (updateActor also fires on every HP tick, so the filter is load-bearing) — so
// we drop the stale cache and the next read reflects the persisted document. Firing on
// the origin client too is harmless: its next read simply re-reads the live flag.
Hooks.on('updateActor', (actor, changes) => {
  invalidateRunCachesForActorUpdate(actor, changes);
});

function invalidateRunCachesForActorUpdate(actor, changes) {
  if (!actor?.id) return;
  const changed = runContainersChanged(changes, foundry.utils.hasProperty);
  if (changed.length === 0) return;
  // The crafting/salvage caches are keyed by `actor.id`; the gathering cache is keyed
  // by the actor uuid (its `actorKey`), so pass each manager the key it stores under.
  const invalidators = {
    crafting: () => fabricate.craftingRunManager?.invalidateCache(actor.id),
    salvage: () => fabricate.salvageRunManager?.invalidateCache(actor.id),
    gathering: () => fabricate.gatheringRunManager?.invalidateCache(actor.uuid ?? actor.id),
  };
  for (const key of changed) {
    invalidators[key]?.();
  }
}

// GM-only scene-control button (Phase 7): adds a Fabricate control group whose
// single button launches the Interactable browser app. Foundry V13 passes
// `controls` as an OBJECT-of-controls (keyed record), NOT the pre-V13 array; the
// pure `addInteractableSceneControl` seam mutates that record. The hook body
// here is the thin edge supplying the GM gate, the localizer, and the launch
// callback.
Hooks.on('getSceneControlButtons', (controls) => {
  addInteractableSceneControl(controls, {
    isGM: game.user?.isGM === true,
    onClick: () => getInteractableBrowserAppClass().show(),
    // The Manage Interactables panel (issue 335): a sibling GM-only tool that
    // lists/manages every interactable on the scene and promotes regions.
    onManageClick: () => getInteractablesManagerAppClass().show(),
    localize: (key, fallback) => {
      const out = game.i18n?.localize?.(key);
      return out && out !== key ? out : fallback;
    }
  });
});

// GM-only discoverability: a "Configure Fabricate Interactable" button on a
// placeable's HUD when that placeable is a linked Fabricate interactable visual.
// It resolves the owning behaviour from the document's reverse linked-visual flags
// and opens the rich config panel. The pure gate + target resolution live in
// `interactableConfigSheet.js`; this helper is the thin Foundry edge shared by the
// Tile HUD (Phase 2) and the Token HUD (Phase 5) — only the host HUD + the
// localization key differ. This NEVER touches a token's actor: it only opens the
// behaviour config panel.
function installInteractableConfigHudEntry(hud, element, { localizeKey }) {
  try {
    const document = hud?.object?.document ?? hud?.document ?? null;
    if (!shouldOfferInteractableConfigEntry(document, { isGM: game.user?.isGM === true })) return;

    const target = resolveInteractableConfigTarget(document, {
      resolveRegion: (regionUuid) => {
        const region = fromUuidSync?.(regionUuid) ?? null;
        const regionId = region?.id ?? region?._id ?? null;
        const sceneId = region?.parent?.id ?? region?.parent?._id ?? null;
        return regionId && sceneId ? { sceneId, regionId } : null;
      }
    });
    if (!target) return;

    const root = element instanceof HTMLElement ? element : element?.[0] ?? null;
    const column = root?.querySelector?.('.col.left') ?? root?.querySelector?.('.col') ?? root;
    if (!column?.appendChild) return;

    const out = game.i18n?.localize?.(localizeKey);
    const label = out && out !== localizeKey ? out : 'Configure Fabricate Interactable';

    const button = window.document.createElement('button');
    button.type = 'button';
    button.className = 'control-icon fabricate-interactable-config-hud';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = '<i class="fas fa-sliders"></i>';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      void getInteractableConfigAppClass().show(target);
    });
    column.appendChild(button);
  } catch (_error) {
    // Defensive: a HUD augmentation must never throw into Foundry's render.
  }
}

Hooks.on('renderTileHUD', (hud, element) => {
  installInteractableConfigHudEntry(hud, element, { localizeKey: 'FABRICATE.Canvas.Interactable.Config.OpenFromTile' });
});

Hooks.on('renderTokenHUD', (hud, element) => {
  installInteractableConfigHudEntry(hud, element, { localizeKey: 'FABRICATE.Canvas.Interactable.Config.OpenFromToken' });
});

// `fabricate.interactable` Region Behaviour creation edge (issues 334 + 342).
//
// The native Region → Behaviors "+ Add Behavior → Fabricate Interactable" path
// instantiates the DataModel with an empty `system`. Since issue 342 the three
// identity fields carry unconfigured-sentinel `initial`s, so this instantiates a
// VALID-but-UNCONFIGURED behaviour (no DataModelValidationError). This edge now
// ALLOWS that create (it reverses #334's cancellation): it defensively stamps the
// sentinel (belt-and-suspenders if Foundry's empty-system instantiation does not
// apply the nested initials) and shows the GM an INFO notice pointing at the
// Interactable config panel. The behaviour is born inert (concealed, never grants
// activation) until the GM configures its identity there.
//
// Foundry's region duplication still clones an interactable behaviour's
// `linkedVisual` verbatim, so the copy would point at the original's marker; that
// inherited link is neutralised here (the region-duplication footgun is KEPT). All
// decisions are pure (`interactableCreationGuard.js` / `interactableRegionFlags.js`);
// this is the thin, no-throw Foundry edge. NEVER interferes with any
// non-interactable behaviour subtype.
Hooks.on('preCreateRegionBehavior', (document) => {
  try {
    // The decision seam is always allow-through now; reference it so the edge
    // keeps a single decision point (and a future cancellation policy has a home).
    evaluateInteractableCreate(document);
    if (!isInteractableRegionBehavior(document)) {
      return undefined;
    }

    // Defensively stamp the unconfigured sentinel + notify, then neutralise an
    // inherited marker link. Each step is a thin local orchestrator over a pure
    // decision helper, so this edge stays simple and no-throw.
    if (applyUnconfiguredSentinelStamp(document)) {
      notifyUnconfiguredInteractableCreated();
    }
    neutralizeInheritedInteractableLink(document);
    return undefined;
  } catch (_error) {
    // Defensive: a guard error must never block an unrelated behaviour creation.
    return undefined;
  }
});

/**
 * Defensively stamp the unconfigured sentinel onto any identity field the
 * empty-system instantiation left empty, so the persisted behaviour is always a
 * recognisable UNCONFIGURED interactable. `updateSource` is the correct preCreate
 * mutation seam in V13 (preCreate hooks mutate the document source in place; they
 * do not return create data).
 *
 * @param {object} document  The preCreate `RegionBehavior` document.
 * @returns {boolean}  `true` when an unconfigured sentinel patch was applied.
 */
function applyUnconfiguredSentinelStamp(document) {
  const system = readInteractableBehaviorSystem(document) ?? document?.system ?? {};
  const sentinel = buildUnconfiguredSentinelPatch(system);
  if (!sentinel.changed || typeof document?.updateSource !== 'function') {
    return false;
  }
  document.updateSource(sentinel.patch);
  return true;
}

/**
 * Guide the GM to the supported configuration surface. INFO (not an error):
 * creation succeeded; the interactable just needs configuring.
 */
function notifyUnconfiguredInteractableCreated() {
  const out = game.i18n?.localize?.('FABRICATE.Canvas.Interactable.Create.Unconfigured');
  const message =
    out && out !== 'FABRICATE.Canvas.Interactable.Create.Unconfigured'
      ? out
      : 'Created an unconfigured Fabricate interactable. Configure its source (type, system, tool/task) from the Interactable config panel; it stays inert until then.';
  ui.notifications?.info?.(message);
}

/**
 * Product rule: a freshly-created interactable never inherits another
 * interactable's marker link (region-duplication case). Clear an inherited
 * linkedVisual link so the copy is born region-only. The pure neutralisation
 * helper is type-agnostic, so it is gated to interactable behaviours by the caller.
 *
 * @param {object} document  The preCreate `RegionBehavior` document.
 */
function neutralizeInheritedInteractableLink(document) {
  const neutralised = neutralizeInheritedLinkedVisual(document?.system);
  if (neutralised.changed && typeof document?.updateSource === 'function') {
    document.updateSource({
      'system.linkedVisual.uuid': neutralised.patch.linkedVisual.uuid,
      'system.linkedVisual.documentName': neutralised.patch.linkedVisual.documentName
    });
  }
}

/**
 * System-agnostic crafting button integration
 * Add Craft button to Items Directory sidebar (works with all game systems)
 */

/**
 * Add the Craft button to Items Directory header
 * Since sidebar is already rendered at module init, we inject directly
 */
function addModuleButtonsToItemsDirectory() {
  const itemsDir = ui.items;
  if (!itemsDir?.element) {
    console.error('Fabricate | Items directory not found or not rendered');
    return;
  }

  const header = itemsDir.element.querySelector('.directory-header, header');
  if (!header) {
    console.error('Fabricate | Items directory header not found');
    return;
  }

  const actionsContainer = findItemsDirectoryActionsContainer(itemsDir, document);
  if (!actionsContainer) {
    console.error('Fabricate | Items directory actions container not found');
    return;
  }

  // Add craft button for all users
  const craftExists = Array.from(actionsContainer.querySelectorAll('button.create-document'))
    .some(btn =>
      btn.dataset.fabricateAction === 'craft' ||
      btn.textContent?.includes('Craft Item')
    );
  if (!craftExists) {
    const craftButton = createHeaderButton('Craft Item', 'fas fa-hammer', 'craft', () => getFabricateAppClass().show('crafting'));
    actionsContainer.insertBefore(craftButton, actionsContainer.firstChild);
  }

  syncGatheringDirectoryButton({
    itemsDirectory: itemsDir,
    enabled: hasGatheringEnabledSystems(),
    createButton: () => createHeaderButton('Gathering', 'fas fa-leaf', 'gathering', () => getFabricateAppClass().show('gathering')),
    documentRef: document
  });

  // Add recipe manager button for GMs only
  if (game.user?.isGM) {
    const managerExists = Array.from(actionsContainer.querySelectorAll('button.create-document'))
      .some(btn =>
        btn.dataset.fabricateAction === 'manage' ||
        btn.textContent?.includes('Manage Crafting Systems')
      );
    if (!managerExists) {
      const managerButton = createHeaderButton(
        'Manage Crafting Systems',
        'fas fa-book',
        'manage',
        () => {
          void loadCraftingSystemManagerAppClass().then((AppClass) => AppClass.show());
        }
      );
      actionsContainer.insertBefore(managerButton, actionsContainer.firstChild);
    }
  }
}

function hasGatheringEnabledSystems() {
  const systems = game.fabricate?.getCraftingSystemManager?.()?.getSystems?.() ?? [];
  return Array.from(systems).some(system => system?.features?.gathering === true);
}

/**
 * Create a sidebar header button that matches Foundry style
 * @private
 */
function createHeaderButton(labelText, iconClass, actionId, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'create-document';
  button.dataset.tooltip = labelText;
  button.dataset.fabricateAction = actionId;
  button.setAttribute('aria-label', labelText);

  const icon = document.createElement('i');
  icon.className = iconClass;
  button.appendChild(icon);

  const label = document.createElement('span');
  label.textContent = labelText;
  button.appendChild(label);

  button.addEventListener('click', (event) => {
    event.preventDefault();
    onClick();
  });

  return button;
}

// Chat command for quick crafting (for testing)
Hooks.on('chatMessage', (chatLog, message, chatData) => {
  // Check for /craft command
  if (message.startsWith('/craft')) {
    const parts = message.split(' ');
    if (parts.length < 2) {
      ui.notifications.warn('Usage: /craft <recipe-name>');
      return false;
    }

    const recipeName = parts.slice(1).join(' ');
    const actor = game.user.character;

    if (!actor) {
      ui.notifications.error('No character selected');
      return false;
    }

    // Find recipe by name
    const recipes = fabricate.recipeManager.getRecipes({ search: recipeName });
    if (recipes.length === 0) {
      ui.notifications.error(`Recipe "${recipeName}" not found`);
      return false;
    }

    const recipe = recipes[0];

    // Attempt to craft
    fabricate.craft(actor, recipe).then(result => {
      if (result.success) {
        ui.notifications.info(result.message);
      } else {
        ui.notifications.error(result.message);
      }
    }).catch(err => {
      ui.notifications.error(err.message);
      console.error('Fabricate | Crafting error:', err);
    });

    return false; // Prevent the message from being sent to chat
  }
});

// Macro helper
globalThis.fabricate = {
  /**
   * Create a simple recipe
   * @example
   * fabricate.createSimpleRecipe('Iron Sword', [
   *   { itemId: 'ironIngot', quantity: 2 },
   *   { itemId: 'wood', quantity: 1 }
   * ], { itemId: 'ironSword', quantity: 1 });
   */
  createSimpleRecipe: async (name, ingredients, result) => {
    const { Recipe } = game.fabricate.api;
    const recipe = Recipe.createSimple(name, ingredients, result);
    return await game.fabricate.getRecipeManager().createRecipe(recipe.toJSON());
  },

  /**
   * Craft an item
   * @example
   * fabricate.craft(game.user.character, 'recipeId');
   */
  craft: async (actor, recipeId, options) => {
    return await game.fabricate.craft(actor, recipeId, options);
  },

  /**
   * List all recipes
   */
  listRecipes: (filters = {}) => {
    return game.fabricate.getRecipeManager().getRecipes(filters);
  },

  /**
   * Delete a recipe by ID
   */
  deleteRecipe: async (recipeId) => {
    return await game.fabricate.deleteRecipe(recipeId);
  },

  /**
   * Get recipes available to an actor
   */
  getAvailableRecipes: (actorOrActors) => {
    const actors = Array.isArray(actorOrActors) ? actorOrActors : [actorOrActors];
    return game.fabricate.getRecipeManager().getAvailableRecipes(actors.filter(Boolean));
  },

  /**
   * Open the GM crafting system manager
   */
  openRecipeManager: () => {
    return loadCraftingSystemManagerAppClass().then((AppClass) => AppClass.show());
  },

  /**
   * List crafting systems
   */
  listCraftingSystems: () => {
    return game.fabricate.getCraftingSystemManager().getSystems();
  },

  exportSystem: (systemId) => {
    return game.fabricate.exportSystem(systemId);
  },

  importSystemFromFile: async (file, options) => {
    return game.fabricate.importSystemFromFile(file, options);
  }
};

export const __test = {
  createGatheringToolAvailability,
  createGatheringToolBreakage,
  createGatheringResultCreator,
  matchGatheringTools
};

/**
 * The rest of the `ready` startup, exported so a Foundry-free host can run it.
 *
 * `initialize()` is not the whole of startup. The `ready` hook also matures world time and runs four
 * flag auto-stamps, and those populate the tier-1 `roles` identity that `sourceUuid.js` resolves
 * against before any name-matching fallback. A host that calls only `initialize()` gets a world
 * where every tool and component resolves through a tier production never reaches.
 *
 * Exported as a BLOCK rather than by prefixing each declaration, deliberately: several tests assert
 * against the literal source text of those functions, and moving the keyword onto the declaration
 * line breaks those patterns for no behavioural gain.
 *
 * The View Lab calls these directly rather than dispatching `ready`, because the same hook body also
 * injects a button into Foundry's Items sidebar, which a Foundry-free host cannot honestly provide.
 * Call them in this order: the tool stamp reads refs the component stamp and the migration runner
 * write, and the owned-item restamp reads what the component stamp produced.
 */
export {
  processFabricateWorldTime,
  runRecipeItemFlagAutoStamp,
  runComponentFlagAutoStamp,
  runToolFlagAutoStamp,
  runOwnedItemComponentIdentityRestamp,
  runWorldScopeIdentityFlagRemap,
};

export default fabricate;
