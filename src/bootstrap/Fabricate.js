/**
 * The `game.fabricate` facade class, composed from the five slices. Every slice member goes on the
 * PROTOTYPE as a non-enumerable, writable, configurable property — what a class method is; the
 * instance, or `Object.assign`, would change the descriptors the boot-contract suite pins.
 */

import { registerFabricateSettings, getSetting, SETTING_KEYS } from '../config/settings.js';
import { authorityUnavailableAvailability } from '../systems/journalRunCommands.js';
import { hasPendingWorldEssenceMerge } from '../systems/remapWorldScopeIdentityFlags.js';
import { hasPendingWorldScopeRekey } from '../systems/worldScopeRekeyPending.js';
import { findCuratedIconRecord, listCuratedIconVocabulary } from '../utils/iconVocabulary.js';
import { progressiveOrderKey } from '../utils/progressiveResultOrder.js';

import { bulkFacade } from './bulkFacade.js';
import { companionFacade } from './companionFacade.js';
import { composeFabricateServices } from './composeServices.js';
import { craftingFacade } from './craftingFacade.js';
import { gatheringFacade } from './gatheringFacade.js';
import { deprecate, getBarSelectableActors } from './gatheringRuntime.js';
import { journalFacade } from './journalFacade.js';
import {
  applyWorldEssenceMergeFlagRemap,
  applyWorldScopeIdentityFlagRemap,
  promptMigrationRecovery,
  runMigrations,
} from './migrations.js';

class Fabricate {
  // Every collaborator `game.fabricate` publishes, declared here and assigned by
  // `./composeServices.js`. A plain class field is an own, enumerable, writable, configurable
  // property, which is exactly what `tests/bootstrap/fabricate-boot-contract.test.js` pins.
  recipeManager = null;
  craftingEngine = null;
  craftingSystemManager = null;
  craftingRunManager = null;
  salvageRunManager = null;
  journalRunCommands = null;
  gatheringEnvironmentStore = null;
  gatheringNodeDepletionWriter = null;
  gatheringBlindRunStore = null;
  gatheringBlindStartWriter = null;
  gatheringRichStateService = null;
  gatheringRunManager = null;
  gatheringGateAndCheckEvaluator = null;
  gatheringRealmStore = null;
  gatheringPartyStore = null;
  gatheringLocationService = null;
  recipeVisibilityService = null;
  resolutionModeService = null;
  currencyConfigStore = null;
  characterLibrariesStore = null;
  componentScopeStore = null;
  essenceScopeStore = null;
  toolScopeStore = null;
  worldVocabularyStore = null;
  complicationDeliveryWriter = null;
  itemPilesIntegration = null;
  actorInventoryCoinSpender = null;
  actorPropertyCoinSpender = null;
  compendiumImporter = null;
  ready = false;
  _startupMarks = null;
  _craftingListingBuilder = null;
  _inventoryListingBuilder = null;
  _runJournalBuilder = null;
  // Lazy and not on `game.fabricate`: `salvageComponents` and `destroyComponents` are the only
  // entry points, because they carry the per-target ownership gate (issue 859).
  _bulkSalvageService = null;
  _bulkDestroyService = null;
  // Replay-safe readiness signal: unlike the one-shot `fabricate.ready` Hook, awaiting this settled
  // promise works even when readiness was reached before the caller subscribed.
  _resolveReady = null;
  _readyPromise = new Promise((resolve) => {
    this._resolveReady = resolve;
  });

  /** Replay-safe readiness: resolves when initialization finished, immediately if it already had. */
  whenReady() {
    return this._readyPromise;
  }

  async initialize() {
    return composeFabricateServices(this);
  }

  async _runMigrations() {
    return runMigrations(this);
  }

  /** Kept on the prototype so the runner's `promptRecovery` seam resolves through the instance. */
  async _promptMigrationRecovery(context) {
    return promptMigrationRecovery(context);
  }

  registerSettings() {
    registerFabricateSettings();
  }

  getRecipeManager() {
    return this.recipeManager;
  }

  /**
   * `COMPANION`'s `handle` tier (issue 1289), whose one carve-out is `findComponentItems`;
   * ungated, per `companion-api/spec.md` § The Ungated Handle Accessors.
   */
  getCraftingEngine() {
    return this.craftingEngine;
  }

  /**
   * Re-run the `1.30.0` world-scope identity-flag repair (issue 1363). A GM-FACING RECOVERY ACTION,
   * not a test hook, reachable exactly when the boot-time one-shot WITHHELD itself: a TORN MIGRATION
   * or a PARTIAL REMAP, both of which leave the map PENDING; a LOCKED-PACK skip is not one of them.
   * ACTIVE-GM ONLY, a SINGLE-WRITER rule rather than a permission check, the pass walking the
   * UNFILTERED actor collection. IDEMPOTENT: it remaps only, clearing and advancing nothing.
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
   * Re-run the `1.34.0` equivalent-essence merge's durable-flag repair (issue 1654), for the two
   * states its `1.30.0` sibling serves. Active-GM only; it warns on refusal, since a silent `null`
   * reads as success. Idempotent.
   */
  async remapWorldEssenceIdentityFlags() {
    if (game.users?.activeGM?.id !== game.user?.id) {
      console.warn(
        'Fabricate | world essence merge repair declined: it writes across every actor in the world, so it runs on the ACTIVE GM alone. Ask the active GM to run it, or take over as active GM first.'
      );
      return null;
    }
    const mergeMap = getSetting(SETTING_KEYS.WORLD_ESSENCE_MERGE_MAP) ?? {};
    if (!hasPendingWorldEssenceMerge(mergeMap)) return null;
    return applyWorldEssenceMergeFlagRemap(mergeMap);
  }

  getCraftingSystemManager() {
    return this.craftingSystemManager;
  }

  getCraftingRunManager() {
    return this.craftingRunManager;
  }

  getSalvageRunManager() {
    return this.salvageRunManager;
  }

  /** Exposes the store without the module-internal GatheringEngine. */
  getGatheringEnvironmentStore() {
    return this.gatheringEnvironmentStore;
  }

  getGatheringPartyStore() {
    this._requireReady();
    return this.gatheringPartyStore;
  }

  // The six world-scope accessors below are ungated and answer `null` before ready, per
  // `companion-api/spec.md` § The Ungated Handle Accessors.

  /** World scope (issue 1278): a world runs one game system, so one way actors store coins. */
  getCurrencyConfigStore() {
    return this.currencyConfigStore ?? null;
  }

  /** World scope (issue 1308); both libraries resolve against the acting character. */
  getCharacterLibrariesStore() {
    return this.characterLibrariesStore ?? null;
  }

  /** Unlike `getGatheringRealmStore`, never gated: a throw here crashes `_normalizeSystem`. */
  getComponentScopeStore() {
    return this.componentScopeStore ?? null;
  }

  getEssenceScopeStore() {
    return this.essenceScopeStore ?? null;
  }

  /** Carries the world tool-breakage authority (issue 1359). */
  getToolScopeStore() {
    return this.toolScopeStore ?? null;
  }

  /**
   * Ungated because `worldScopeProjection`'s `readCorpus` turns any throw into a legitimate
   * `{available: false, total: 0}`, blanking Tags & Categories. `adminStore` fixes the name.
   */
  getVocabularyScopeStore() {
    return this.worldVocabularyStore ?? null;
  }

  getGatheringRealmStore() {
    this._requireReady();
    return this.gatheringRealmStore;
  }

  /** @deprecated Use `getGatheringRealmStore`. */
  getGatheringRegionStore() {
    deprecate('getGatheringRegionStore', 'getGatheringRealmStore');
    return this.getGatheringRealmStore();
  }

  getGatheringLocationService() {
    this._requireReady();
    return this.gatheringLocationService;
  }

  getGatheringRunManager() {
    return this.gatheringRunManager;
  }

  getGatheringGateAndCheckEvaluator() {
    return this.gatheringGateAndCheckEvaluator;
  }

  getGatheringRichStateService() {
    return this.gatheringRichStateService;
  }

  getRecipeVisibilityService() {
    return this.recipeVisibilityService;
  }

  getResolutionModeService() {
    return this.resolutionModeService;
  }

  getItemPilesIntegration() {
    return this.itemPilesIntegration;
  }

  /** `COMPANION`'s `handle` tier (issue 1289), ungated like the world-scope accessors. */
  getActorInventoryCoinSpender() {
    return this.actorInventoryCoinSpender;
  }

  /** `COMPANION`'s `handle` tier (issue 1289), ungated like the world-scope accessors. */
  getActorPropertyCoinSpender() {
    return this.actorPropertyCoinSpender;
  }

  getCompendiumImporter() {
    return this.compendiumImporter;
  }

  /**
   * A truthy caller id overrides the remembered actor; null or empty falls back. It must coalesce,
   * not spread: the UI passes `null` on a fresh open, before the actor bar settles.
   */
  _withRememberedActorDefault(options = {}) {
    return {
      ...options,
      rememberedActorId: options.rememberedActorId || this.getSelectedGatheringActorId() || null,
    };
  }

  /**
   * The one curated icon vocabulary (`docs/api/index.md` § Icon Vocabulary). Ready-gated by
   * throwing, unlike other `list…` members, because an empty vocabulary is indistinguishable from
   * one that lost its contents. Records are built fresh per call, one row per glyph with `aliases`.
   */
  listCuratedIcons() {
    this._requireReady();
    return listCuratedIconVocabulary();
  }

  /**
   * Resolve a name or alias to its row, or `null`, so a saved `cog` finds `gear`. Ready-gated by
   * throwing, so `null` only ever means the vocabulary does not offer that name.
   */
  findCuratedIcon(iconName) {
    this._requireReady();
    return findCuratedIconRecord(iconName);
  }

  getSelectedGatheringActorId() {
    return getSetting(SETTING_KEYS.LAST_GATHERING_ACTOR) || '';
  }

  getSelectedAlchemySystemId() {
    return getSetting(SETTING_KEYS.LAST_ALCHEMY_SYSTEM) || '';
  }

  /**
   * The actors the current user may select as crafting or component-source actors, filtered like the
   * actor-selection bar so the two pickers agree. Display data only.
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
   * Resolve the current selection's component-source actors as real Foundry actors for the pure
   * shopping-list aggregator. Owner-scoped via the persisted ids only; it widens no access.
   */
  getCraftingSourceActors() {
    this._requireReady();
    // `_resolveCraftingSources` is installed from `./craftingFacade.js` onto the prototype.
    // eslint-disable-next-line unicorn/no-undeclared-class-members
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources();
    const actors = componentSourceActors.length > 0 ? componentSourceActors : [];
    if (craftingActor && !actors.includes(craftingActor)) actors.unshift(craftingActor);
    return actors;
  }

  getSelectedCraftingActorId() {
    return getSetting(SETTING_KEYS.LAST_CRAFTING_ACTOR) || '';
  }

  getCraftingComponentSourceIds() {
    const ids = getSetting(SETTING_KEYS.LAST_COMPONENT_SOURCES);
    return Array.isArray(ids) ? ids : [];
  }

  /** Client-scoped. */
  getFavouriteRecipeIds() {
    const ids = getSetting(SETTING_KEYS.FAVOURITE_RECIPES);
    return Array.isArray(ids) ? ids : [];
  }

  /** User-scoped, so per user per world, unlike the client-scoped favourites. */
  getProgressiveResultOrder() {
    const stored = getSetting(SETTING_KEYS.PROGRESSIVE_RESULT_ORDER);
    return stored && typeof stored === 'object' ? stored : {};
  }

  /** The `getPlayerResultOrder` seam (issue 651); `applyPlayerResultOrder` reconciles. */
  _readPlayerResultOrder(entry) {
    const key = progressiveOrderKey(entry);
    if (!key) return null;
    const order = this.getProgressiveResultOrder()[key];
    return Array.isArray(order) ? order : null;
  }

  /** Client-scoped, so per device rather than per user. */
  getHideUnavailableEnvironments() {
    return Boolean(getSetting(SETTING_KEYS.GATHERING_HIDE_UNAVAILABLE));
  }

  /** Player-safe: weather, time of day and the available tags, no GM-only library internals. */
  getGatheringConditions() {
    this._requireReady();
    return this.gatheringRichStateService?.getConditions();
  }

  _requireReady() {
    if (!this.ready) throw new Error('Fabricate not initialized');
  }

  _requireGM() {
    if (game.user?.isGM !== true) throw new Error('Gathering rich state changes require a GM user');
  }

  /** Cached authority availability; it neither provisions a ledger nor releases a claim. */
  getJournalRunAuthorityAvailability() {
    return (
      this.journalRunCommands?.getJournalRunAuthorityAvailability() ??
      authorityUnavailableAvailability()
    );
  }

  /** Current world time in seconds, on this edge so the Journal store stays free of `game.*`. */
  getWorldTime() {
    return Number(game.time?.worldTime || 0);
  }
}

/** Install one facade slice as prototype methods, matching the descriptors a class method carries. */
function installFacadeSlice(slice) {
  const descriptors = {};
  for (const [name, value] of Object.entries(slice)) {
    descriptors[name] = { value, enumerable: false, writable: true, configurable: true };
  }
  Object.defineProperties(Fabricate.prototype, descriptors);
  return Object.keys(descriptors);
}

/**
 * Every slice member, installed on the prototype. A declaration, so the module has no top-level
 * side effect; exported so `tests/facade-delegation-arity.test.js` asserts the install ran.
 */
export const INSTALLED_FACADE_MEMBERS = Object.freeze(
  [craftingFacade, gatheringFacade, companionFacade, bulkFacade, journalFacade].flatMap(
    installFacadeSlice
  )
);

export { Fabricate };
