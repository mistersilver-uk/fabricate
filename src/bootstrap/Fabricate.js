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
  // The startup performance marks, opened and closed phase by phase by the composition root.
  _startupMarks = null;
  // Lazily-built player-facing listing projectors, built on first read.
  _craftingListingBuilder = null;
  _inventoryListingBuilder = null;
  _runJournalBuilder = null;
  // Lazily-built bulk salvage and destroy collaborators (issue 859), cached like the listing
  // builders and deliberately NOT on `game.fabricate`: `salvageComponents` and `destroyComponents`
  // are the only supported entry points, because that is where the per-target ownership gate is.
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

  /** Initialize the module: the composition root builds every collaborator, in phase order. */
  async initialize() {
    return composeFabricateServices(this);
  }

  /** Run versioned startup data migrations via MigrationRunner. */
  async _runMigrations() {
    return runMigrations(this);
  }

  /**
   * The thin Foundry edge for the GM migration-abort recovery prompt, retained on the prototype so
   * the runner's `promptRecovery` seam still resolves through the instance.
   */
  async _promptMigrationRecovery(context) {
    return promptMigrationRecovery(context);
  }

  /** Register module settings. */
  registerSettings() {
    registerFabricateSettings();
  }

  /** Get the recipe manager instance. */
  getRecipeManager() {
    return this.recipeManager;
  }

  /**
   * Get the crafting engine instance. `COMPANION`'s `handle` tier (issue 1289), whose one carve-out
   * is `findComponentItems`; ungated, per § The Ungated Handle Accessors.
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
   * states its `1.30.0` sibling `remapWorldScopeIdentityFlags` serves. Active-GM only, and it WARNS
   * rather than returning silently, a silent `null` reading as success. Idempotent.
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

  /** Get the crafting system manager instance. */
  getCraftingSystemManager() {
    return this.craftingSystemManager;
  }

  /** Get the crafting run manager instance. */
  getCraftingRunManager() {
    return this.craftingRunManager;
  }

  getSalvageRunManager() {
    return this.salvageRunManager;
  }

  /** Get the gathering environment store, without exposing the module-internal GatheringEngine. */
  getGatheringEnvironmentStore() {
    return this.gatheringEnvironmentStore;
  }

  /** Get the Fabricate-managed gathering party store (world-level parties). */
  getGatheringPartyStore() {
    this._requireReady();
    return this.gatheringPartyStore;
  }

  /**
   * Get the world currency configuration store (issue 1278). World scope: a world runs one game
   * system and so has one way actors store coins. UNGATED, per § The Ungated Handle Accessors.
   */
  getCurrencyConfigStore() {
    return this.currencyConfigStore ?? null;
  }

  /**
   * Get the world character libraries store (issue 1308). World scope, both libraries resolving
   * against the acting CHARACTER. UNGATED, per § The Ungated Handle Accessors.
   */
  getCharacterLibrariesStore() {
    return this.characterLibrariesStore ?? null;
  }

  /**
   * Get the world COMPONENT scope store (issue 1359). UNGATED, per § The Ungated Handle Accessors,
   * and emphatically NOT like `getGatheringRealmStore`: a throw here crashes `_normalizeSystem`.
   */
  getComponentScopeStore() {
    return this.componentScopeStore ?? null;
  }

  /** Get the world ESSENCE scope store (issue 1359). Ungated, for `getComponentScopeStore`'s reason. */
  getEssenceScopeStore() {
    return this.essenceScopeStore ?? null;
  }

  /** The world TOOL scope store (1359), ungated; it carries the WORLD tool-breakage authority. */
  getToolScopeStore() {
    return this.toolScopeStore ?? null;
  }

  /**
   * Get the world VOCABULARY store (issue 1392). UNGATED for its OWN reason: nothing normalizes
   * against it, but `worldScopeProjection`'s `readCorpus` converts ANY throw into a legitimate
   * `{available: false, total: 0}`, so a readiness throw would silently blank Tags & Categories.
   * THE NAME IS FIXED BY ITS CONSUMER, `adminStore`.
   */
  getVocabularyScopeStore() {
    return this.worldVocabularyStore ?? null;
  }

  /** Get the per-system gathering realm store. */
  getGatheringRealmStore() {
    this._requireReady();
    return this.gatheringRealmStore;
  }

  /** @deprecated Use `getGatheringRealmStore`. */
  getGatheringRegionStore() {
    deprecate('getGatheringRegionStore', 'getGatheringRealmStore');
    return this.getGatheringRealmStore();
  }

  /** Get the current-realm resolver used for location-aware gathering. */
  getGatheringLocationService() {
    this._requireReady();
    return this.gatheringLocationService;
  }

  /** Get the gathering run manager. */
  getGatheringRunManager() {
    return this.gatheringRunManager;
  }

  /** Get the gathering gate/check evaluator. */
  getGatheringGateAndCheckEvaluator() {
    return this.gatheringGateAndCheckEvaluator;
  }

  getGatheringRichStateService() {
    return this.gatheringRichStateService;
  }

  /** Get the recipe visibility service instance. */
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
   * Get the `actorInventory` strategy's coin spender. `COMPANION`'s `handle` tier (issue 1289),
   * ungated per § The Ungated Handle Accessors.
   */
  getActorInventoryCoinSpender() {
    return this.actorInventoryCoinSpender;
  }

  /**
   * Get the `actorProperty` strategy's coin spender. `COMPANION`'s `handle` tier (issue 1289),
   * ungated per § The Ungated Handle Accessors.
   */
  getActorPropertyCoinSpender() {
    return this.actorPropertyCoinSpender;
  }

  getCompendiumImporter() {
    return this.compendiumImporter;
  }

  /**
   * Merge caller `options` with the persisted remembered-actor default: a TRUTHY id overrides and a
   * null or empty one falls back. IT MUST COALESCE, NOT SPREAD — the UI passes
   * `store.selectedActorId ?? null`, which on a fresh open is `null` before the actor bar settles.
   */
  _withRememberedActorDefault(options = {}) {
    return {
      ...options,
      rememberedActorId: options.rememberedActorId || this.getSelectedGatheringActorId() || null,
    };
  }

  /**
   * List Fabricate's curated icon vocabulary. ONE vocabulary serves every icon field, published here
   * so a companion binds to it instead of hand-curating a second list that drifts. It is measured
   * from the Font Awesome bundle a Foundry install ships rather than from Font Awesome's metadata.
   * `Curated` is the qualifier because the unfiltered catalogue is deliberately NOT published.
   * READY-GATED BY THROWING rather than answering an empty list, as every other `list…` is: an empty
   * vocabulary is indistinguishable from one that lost its contents.
   * THE RECORDS ARE FRESHLY BUILT PER CALL, so a caller may sort or mutate them; `aliases` is
   * published because there is one entry per GLYPH and not per name, and the other names are what a
   * caller needs to read data a GM already saved.
   */
  listCuratedIcons() {
    this._requireReady();
    return listCuratedIconVocabulary();
  }

  /**
   * Resolve one icon name against the curated vocabulary, under its offered name or any alias. A
   * companion holding `fas fa-cog` gets the `gear` row; a typo or an uncurated icon gets `null`.
   * `find…` rather than `get…` because the lookup can miss — a `get…` sibling would suggest a value
   * always comes back. READY-GATED BY THROWING, like its sibling: `null` says the vocabulary does
   * not offer that name and must not also mean it was not there to ask.
   * PUBLISHED AS WELL AS `aliases`, which is for OFFERING and SEARCHING where this is for
   * INTERPRETING a persisted value, O(1) against a prebuilt index — and because the obvious
   * `some(({ iconCode }) => iconCode === name)` reports a saved `cog` as unknown.
   */
  findCuratedIcon(iconName) {
    this._requireReady();
    return findCuratedIconRecord(iconName);
  }

  /** Read the persisted remembered gathering-actor selection; an empty string when unset. */
  getSelectedGatheringActorId() {
    return getSetting(SETTING_KEYS.LAST_GATHERING_ACTOR) || '';
  }

  /** Read the persisted last-selected alchemy system; an empty string when unset. */
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

  /** Read the persisted remembered crafting-actor selection; an empty string when unset. */
  getSelectedCraftingActorId() {
    return getSetting(SETTING_KEYS.LAST_CRAFTING_ACTOR) || '';
  }

  /** Read the persisted component-source actor ids. */
  getCraftingComponentSourceIds() {
    const ids = getSetting(SETTING_KEYS.LAST_COMPONENT_SOURCES);
    return Array.isArray(ids) ? ids : [];
  }

  /** The player's favourite recipe ids (client-scoped). */
  getFavouriteRecipeIds() {
    const ids = getSetting(SETTING_KEYS.FAVOURITE_RECIPES);
    return Array.isArray(ids) ? ids : [];
  }

  /**
   * The player's stored progressive result orders. USER-scoped, NOT client-scoped: per user PER
   * WORLD, so another world gets a fresh map. The `getFavouriteRecipeIds` neighbour IS client-scoped.
   */
  getProgressiveResultOrder() {
    const stored = getSetting(SETTING_KEYS.PROGRESSIVE_RESULT_ORDER);
    return stored && typeof stored === 'object' ? stored : {};
  }

  /**
   * The Foundry edge for the `getPlayerResultOrder` seam (issue 651): a settings read answering DATA,
   * the reconciliation living in `applyPlayerResultOrder`.
   */
  _readPlayerResultOrder(entry) {
    const key = progressiveOrderKey(entry);
    if (!key) return null;
    const order = this.getProgressiveResultOrder()[key];
    return Array.isArray(order) ? order : null;
  }

  /**
   * Whether the player hides unavailable gathering environments. `scope: 'client'`, so it persists in
   * that browser's `localStorage`, per device rather than per user.
   */
  getHideUnavailableEnvironments() {
    // `Boolean()` rather than `=== true`: the setting is registered `type: Boolean`, and the
    // strict compare trips a static-analysis false positive.
    return Boolean(getSetting(SETTING_KEYS.GATHERING_HIDE_UNAVAILABLE));
  }

  /**
   * Read current gathering conditions and configured tag vocabularies. Player-safe: weather,
   * time-of-day and the available tags, but no GM-only library internals.
   */
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
 * Every slice member, as installed on the prototype and never on the instance. A declaration
 * rather than five bare calls, so the module has no top-level side effect, and exported so
 * `tests/facade-delegation-arity.test.js` asserts the install ran rather than inferring it.
 */
export const INSTALLED_FACADE_MEMBERS = Object.freeze(
  [craftingFacade, gatheringFacade, companionFacade, bulkFacade, journalFacade].flatMap(
    installFacadeSlice
  )
);

export { Fabricate };
