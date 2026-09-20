/**
 * The gathering half of the `game.fabricate` facade, installed on `Fabricate.prototype` by
 * `./Fabricate.js`. Method shorthand and never arrows: every member runs with `this` bound to the
 * singleton, and an arrow would also lose the shape `tests/facade-delegation-arity.test.js` scans.
 */

import { isPlayerCharacterActor } from '../config/playerCharacterTypes.js';
import { setSetting, SETTING_KEYS } from '../config/settings.js';
import { callGatheringRuntimeWithCurrentViewer } from '../gatheringBootstrapAdapters.js';
import { buildLocationSummaryForViewer } from '../systems/gatheringLocation.js';
import {
  revealGatheringRealm,
  hideGatheringRealm,
  getDiscoveredRealmIds,
} from '../systems/gatheringRealmDiscovery.js';
import { getRealmRevealMode, isGatheringRealmsEnabled } from '../systems/gatheringRealms.js';
import { executePublicGather } from '../systems/journalRunCommands.js';

import {
  deprecate,
  getGatheringEngine,
  getBarSelectableActors,
  getGatheringSelectableActors,
} from './gatheringRuntime.js';

export const gatheringFacade = {
  /**
   * Read redaction-safe current-realm evidence for a selected actor, gated on a system and
   * player-callable: the resolved source token and display data only, never a secret realm record.
   */
  getGatheringLocationForActor({ actorId = null, actor = null, systemId = null } = {}) {
    this._requireReady();
    const resolvedActor = actor || (actorId ? game.actors?.get(actorId) : null);
    if (!resolvedActor || !systemId) return null;
    // Realm/travel disabled for this system: no location surface at all.
    if (!isGatheringRealmsEnabled(this.craftingSystemManager?.getSystem(systemId))) return null;
    const context = this.gatheringLocationService?.buildCurrentRealmContext({
      actor: resolvedActor,
    });
    if (!context) return null;
    const isGM = game.user?.isGM === true;
    // Reveal mode and realm discovery are both WORLD facts now (issue 1282). `systemId` above
    // remains the GATE — whether this system surfaces a location at all — and nothing more.
    const revealMode = getRealmRevealMode(this.gatheringRealmStore?.get?.());
    const discoveredRealmIds = getDiscoveredRealmIds(resolvedActor);
    return buildLocationSummaryForViewer({ context, isGM, revealMode, discoveredRealmIds });
  },

  /**
   * Set a party's manual current-realm override. GM-only, and a party has ONE override since issue
   * 1282, so `systemId` gates the write rather than selecting which one is written.
   */
  setGatheringPartyRealmOverride({ partyId = null, systemId = null, realmIds = [] } = {}) {
    this._requireReady();
    this._requireGM();
    if (!partyId || !systemId) return null;
    // Realm/travel disabled: no-op, and no override writes.
    if (!isGatheringRealmsEnabled(this.craftingSystemManager?.getSystem(systemId))) return null;
    return this.gatheringPartyStore?.setCurrentRealmOverride(partyId, realmIds);
  },

  /** @deprecated Use `setGatheringPartyRealmOverride`. */
  setGatheringPartyRegionOverride({ partyId = null, systemId = null, regionIds = [] } = {}) {
    deprecate('setGatheringPartyRegionOverride', 'setGatheringPartyRealmOverride');
    return this.setGatheringPartyRealmOverride({ partyId, systemId, realmIds: regionIds });
  },

  /** Clear a party's current-realm override for one crafting system. GM-only. */
  clearGatheringPartyRealmOverride({ partyId = null, systemId = null } = {}) {
    this._requireReady();
    this._requireGM();
    if (!partyId || !systemId) return null;
    // Realm/travel disabled: no-op, and no override writes.
    if (!isGatheringRealmsEnabled(this.craftingSystemManager?.getSystem(systemId))) return null;
    return this.gatheringPartyStore?.clearCurrentRealmOverride(partyId);
  },

  /** @deprecated Use `clearGatheringPartyRealmOverride`. */
  clearGatheringPartyRegionOverride({ partyId = null, systemId = null } = {}) {
    deprecate('clearGatheringPartyRegionOverride', 'clearGatheringPartyRealmOverride');
    return this.clearGatheringPartyRealmOverride({ partyId, systemId });
  },

  /**
   * Reveal a realm's discovery on an actor. GM-only, the realm must exist in the WORLD library, and
   * `systemId` is the participation gate rather than an ownership claim.
   */
  revealGatheringRealmForActor({
    actorId = null,
    actor = null,
    systemId = null,
    realmId = null,
    source = 'manual',
    partyId = null,
  } = {}) {
    this._requireReady();
    this._requireGM();
    const resolvedActor = actor || (actorId ? game.actors?.get(actorId) : null);
    if (!resolvedActor || !systemId || !realmId) return Promise.resolve(false);
    const system = this.craftingSystemManager?.getSystem(systemId);
    // Realm/travel disabled: no-op, and no discovery writes.
    if (!isGatheringRealmsEnabled(system)) return Promise.resolve(false);
    // `systemId` above stays the GATE — whether this system surfaces travel at all. The realm is
    // validated against the WORLD library (issue 1282), and the discovery it writes is world-wide.
    return revealGatheringRealm(resolvedActor, {
      realmId,
      source,
      partyId,
      validateRealmExists: this.gatheringRealmStore?.get?.(),
      now: () => Date.now(),
    });
  },

  /** @deprecated Use `revealGatheringRealmForActor`. */
  revealGatheringRegionForActor({
    actorId = null,
    actor = null,
    systemId = null,
    regionId = null,
    source = 'manual',
    partyId = null,
  } = {}) {
    deprecate('revealGatheringRegionForActor', 'revealGatheringRealmForActor');
    return this.revealGatheringRealmForActor({
      actorId,
      actor,
      systemId,
      realmId: regionId,
      source,
      partyId,
    });
  },

  /** Hide a realm's discovery on an actor. GM-only. */
  hideGatheringRealmForActor({
    actorId = null,
    actor = null,
    systemId = null,
    realmId = null,
  } = {}) {
    this._requireReady();
    this._requireGM();
    const resolvedActor = actor || (actorId ? game.actors?.get(actorId) : null);
    if (!resolvedActor || !systemId || !realmId) return Promise.resolve(false);
    // Realm/travel disabled: no-op, and no discovery writes.
    if (!isGatheringRealmsEnabled(this.craftingSystemManager?.getSystem(systemId)))
      return Promise.resolve(false);
    return hideGatheringRealm(resolvedActor, { realmId });
  },

  /** @deprecated Use `hideGatheringRealmForActor`. */
  hideGatheringRegionForActor({
    actorId = null,
    actor = null,
    systemId = null,
    regionId = null,
  } = {}) {
    deprecate('hideGatheringRegionForActor', 'hideGatheringRealmForActor');
    return this.hideGatheringRealmForActor({ actorId, actor, systemId, realmId: regionId });
  },

  /**
   * List gathering environments and tasks for the current user and selected actor; the engine always
   * receives the current Foundry user as viewer. An omitted `rememberedActorId` falls back to the
   * persisted selection, resolved against the OWNERSHIP list rather than the player-character one.
   */
  listGatheringForActor(options = {}) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    // Resolve against the persisted last-gathering selection by default; an explicit truthy id
    // still overrides.
    const withRememberedActor = this._withRememberedActorDefault(options);

    return callGatheringRuntimeWithCurrentViewer(
      getGatheringEngine(),
      'listForActor',
      withRememberedActor,
      () => game.user
    );
  },

  /**
   * The actors the current user may select in the unified-window actor selection bar: selectable
   * PLAYER CHARACTERS, owned for a non-GM and all for a GM. Display data only. This predicate is
   * DISTINCT from gathering attempt authorization and does not expand it.
   */
  listSelectableActors() {
    this._requireReady();
    return getBarSelectableActors({ viewer: game.user }).map((actor) => ({
      id: actor?.id ?? actor?.uuid ?? null,
      uuid: actor?.uuid ?? null,
      name: actor?.name ?? '',
      img: actor?.img ?? null,
    }));
  },

  /** Persist the remembered gathering-actor selection to the existing client setting. */
  // eslint-disable-next-line unicorn/prefer-short-arrow-method -- a slice member is installed on the prototype and must stay method shorthand; an arrow loses `this`.
  setSelectedGatheringActorId(id) {
    return setSetting(SETTING_KEYS.LAST_GATHERING_ACTOR, id ?? '');
  },

  /**
   * Start a gathering attempt for the current user; the raw GatheringEngine stays module-internal so
   * every public attempt carries current-user viewer enforcement. `interactive` prompts on the
   * routed and progressive paths only.
   */
  startGatheringAttempt(options = {}) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    // Resolve the SAME actor the listing was computed for. Without this the engine falls back to
    // `selectableActors[0]` and silently mis-gates the attempt — the "nothing happens" bug.
    const withRememberedActor = this._withRememberedActorDefault(options);
    const selectableActors = getGatheringSelectableActors({ viewer: game.user });
    const selectedActor =
      withRememberedActor.actor ??
      (withRememberedActor.rememberedActorId
        ? (selectableActors.find((actor) =>
            [actor?.id, actor?.uuid].includes(withRememberedActor.rememberedActorId)
          ) ?? null)
        : (selectableActors[0] ?? null));
    Object.assign(withRememberedActor, { actor: selectedActor, lifecycleVersion: 1 });

    // `requestStart`, not `startAttempt`: a blind timed start this client may not write is routed to
    // the active GM before any task is drawn (issue 901). Wrapped in `executePublicGather` so a
    // READY attempt still finishes in one call — the `lifecycleVersion: 1` stamped above routes it
    // into a started run awaiting execution, so without this the public API answers
    // `accepted: true` and awards nothing (issue 1759). A waiting or timed attempt is untouched.
    return executePublicGather({
      requestStart: () =>
        callGatheringRuntimeWithCurrentViewer(
          getGatheringEngine(),
          'requestStart',
          withRememberedActor,
          () => game.user
        ),
      actor: selectedActor,
      executeCommand: (command, commandOptions) =>
        this.executeJournalRunCommand(command, commandOptions),
      // The gathering screen's `interactive: true` reaches the execute, so a required check still
      // opens its roll dialog; a macro's omitted flag stays the silent route (issue 1780).
      interactive: withRememberedActor.interactive === true,
    });
  },

  /**
   * The per-drop "What you might find" breakdown for one opened task, defaulting the remembered actor
   * to the persisted selection and enforcing the current user as viewer.
   */
  getGatheringDropBreakdown(options = {}) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    const withRememberedActor = this._withRememberedActorDefault(options);

    return callGatheringRuntimeWithCurrentViewer(
      getGatheringEngine(),
      'getTaskDropBreakdown',
      withRememberedActor,
      () => game.user
    );
  },

  inspectGatheringEnvironmentState(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.inspectEnvironment(options.environmentId) ?? null;
  },

  restockGatheringNode(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.restockNode(options);
  },

  updateGatheringConditions(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.updateConditions(options);
  },

  /** Set the current global gathering weather tag. */
  setGatheringWeather(weatherTag) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setWeather(weatherTag);
  },

  /** Set the current global gathering time-of-day tag. */
  setGatheringTimeOfDay(timeOfDayTag) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setTimeOfDay(timeOfDayTag);
  },

  /**
   * Atomically update global gathering conditions, an omitted field keeping its value. A mutation
   * requires a GM and validates its tags through the rich state service.
   */
  setGatheringConditions(conditions = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setConditions(conditions);
  },

  setGatheringStamina(options = {}) {
    this._requireReady();
    this._requireGM();
    const actor = options.actor || (options.actorId ? game.actors?.get(options.actorId) : null);
    // Legacy back-compat: a `{ provider: 'external' }` argument maps to a read-only max. The service
    // tolerates the legacy value too, but mapping it here keeps the boundary on `maxReadOnly`.
    const { provider, ...rest } = options;
    const mapped =
      provider === undefined ? rest : { ...rest, maxReadOnly: provider === 'external' };
    return this.gatheringRichStateService?.setActorStamina(actor, mapped);
  },

  adjustGatheringStamina(options = {}) {
    this._requireReady();
    this._requireGM();
    const actor = options.actor || (options.actorId ? game.actors?.get(options.actorId) : null);
    return this.gatheringRichStateService?.adjustActorStamina(actor, options);
  },

  /** Read a crafting system's gathering economy block. Player-safe: mode and regen cadence. */
  getGatheringEconomy(options = {}) {
    this._requireReady();
    return this.gatheringRichStateService?.systemEconomy(options.systemId) ?? null;
  },

  /** Set a crafting system's gathering economy block. GM-only. */
  setGatheringEconomy(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setSystemEconomy(options);
  },

  /** The stamina pools of player-owned actors for one system, for the GM Gathering State panel. */
  getGatheringStaminaState(options = {}) {
    this._requireReady();
    this._requireGM();
    const systemId = options.systemId;
    const service = this.gatheringRichStateService;
    if (!service || !systemId) return [];
    // Player characters only, per the CONFIGURED player-character actor types (issue 1024), so a
    // Fallout `robot` appears once the GM ticks it. No rolled pool reports `max: null`.
    return [...(game.actors?.contents ?? [])]
      .filter((actor) => isPlayerCharacterActor(actor))
      .map((actor) => {
        const stamina = service.getActorStamina(actor, systemId);
        return { actorId: actor.id, name: actor.name, img: actor.img, ...stamina };
      });
  },

  /** (Re)roll a character's stamina pool from the system templates and persist it. GM-only. */
  rollGatheringStamina(options = {}) {
    this._requireReady();
    this._requireGM();
    const actor = options.actor || (options.actorId ? game.actors?.get(options.actorId) : null);
    if (!actor) return null;
    return this.gatheringRichStateService?.seedActorStaminaIfNeeded({
      actor,
      systemId: options.systemId,
      force: true,
    });
  },

  revealGatheringTask(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.revealTask(options.actor, options);
  },

  clearGatheringTaskReveal(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.clearReveal(options.actor, options);
  },
};
