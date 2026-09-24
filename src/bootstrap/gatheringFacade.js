/**
 * The gathering half of the `game.fabricate` facade, installed on `Fabricate.prototype`. Method
 * shorthand, never arrows: an arrow loses `this` and the shape `facade-delegation-arity` scans for.
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
  /** Player-callable and redaction-safe: display data only, never a secret realm record. */
  getGatheringLocationForActor({ actorId = null, actor = null, systemId = null } = {}) {
    this._requireReady();
    const resolvedActor = actor || (actorId ? game.actors?.get(actorId) : null);
    if (!resolvedActor || !systemId) return null;
    if (!isGatheringRealmsEnabled(this.craftingSystemManager?.getSystem(systemId))) return null;
    const context = this.gatheringLocationService?.buildCurrentRealmContext({
      actor: resolvedActor,
    });
    if (!context) return null;
    const isGM = game.user?.isGM === true;
    // Reveal mode and discovery are world facts (issue 1282); `systemId` is only the gate.
    const revealMode = getRealmRevealMode(this.gatheringRealmStore?.get?.());
    const discoveredRealmIds = getDiscoveredRealmIds(resolvedActor);
    return buildLocationSummaryForViewer({ context, isGM, revealMode, discoveredRealmIds });
  },

  /** GM-only. A party has one override (issue 1282), so `systemId` only gates the write. */
  setGatheringPartyRealmOverride({ partyId = null, systemId = null, realmIds = [] } = {}) {
    this._requireReady();
    this._requireGM();
    if (!partyId || !systemId) return null;
    if (!isGatheringRealmsEnabled(this.craftingSystemManager?.getSystem(systemId))) return null;
    return this.gatheringPartyStore?.setCurrentRealmOverride(partyId, realmIds);
  },

  /** @deprecated Use `setGatheringPartyRealmOverride`. */
  setGatheringPartyRegionOverride({ partyId = null, systemId = null, regionIds = [] } = {}) {
    deprecate('setGatheringPartyRegionOverride', 'setGatheringPartyRealmOverride');
    return this.setGatheringPartyRealmOverride({ partyId, systemId, realmIds: regionIds });
  },

  clearGatheringPartyRealmOverride({ partyId = null, systemId = null } = {}) {
    this._requireReady();
    this._requireGM();
    if (!partyId || !systemId) return null;
    if (!isGatheringRealmsEnabled(this.craftingSystemManager?.getSystem(systemId))) return null;
    return this.gatheringPartyStore?.clearCurrentRealmOverride(partyId);
  },

  /** @deprecated Use `clearGatheringPartyRealmOverride`. */
  clearGatheringPartyRegionOverride({ partyId = null, systemId = null } = {}) {
    deprecate('clearGatheringPartyRegionOverride', 'clearGatheringPartyRealmOverride');
    return this.clearGatheringPartyRealmOverride({ partyId, systemId });
  },

  /** GM-only; `systemId` gates participation, and the realm must exist in the world library. */
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
    if (!isGatheringRealmsEnabled(system)) return Promise.resolve(false);
    // The discovery it writes is world-wide (issue 1282).
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
   * The current user is always the viewer. An omitted `rememberedActorId` falls back to the
   * persisted selection, resolved against the ownership list, not the player-character one.
   */
  listGatheringForActor(options = {}) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    const withRememberedActor = this._withRememberedActorDefault(options);

    return callGatheringRuntimeWithCurrentViewer(
      getGatheringEngine(),
      'listForActor',
      withRememberedActor,
      () => game.user
    );
  },

  /**
   * The actor bar's player characters, owned for a non-GM and all for a GM; display data only. It
   * is distinct from gathering attempt authorization and does not expand it.
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

  // eslint-disable-next-line unicorn/prefer-short-arrow-method -- a slice member is installed on the prototype and must stay method shorthand; an arrow loses `this`.
  setSelectedGatheringActorId(id) {
    return setSetting(SETTING_KEYS.LAST_GATHERING_ACTOR, id ?? '');
  },

  /**
   * The engine stays module-internal, so every public attempt enforces the current user as viewer.
   * `interactive` prompts on the routed and progressive paths only.
   */
  startGatheringAttempt(options = {}) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    // The listing's actor; the engine's `selectableActors[0]` fallback silently mis-gates.
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

    // `requestStart` routes a blind timed start to the active GM before any draw (issue 901).
    // `lifecycleVersion: 1` parks a ready attempt awaiting execution, so `executePublicGather`
    // finishes it in one call rather than awarding nothing (issue 1759).
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
      // A required check still opens its dialog; an omitted flag stays silent (issue 1780).
      interactive: withRememberedActor.interactive === true,
    });
  },

  /** The "What you might find" breakdown; the current user is the viewer. */
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

  setGatheringWeather(weatherTag) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setWeather(weatherTag);
  },

  setGatheringTimeOfDay(timeOfDayTag) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setTimeOfDay(timeOfDayTag);
  },

  /** Atomic; an omitted field keeps its value, and the service validates the tags. */
  setGatheringConditions(conditions = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setConditions(conditions);
  },

  setGatheringStamina(options = {}) {
    this._requireReady();
    this._requireGM();
    const actor = options.actor || (options.actorId ? game.actors?.get(options.actorId) : null);
    // A legacy `{ provider: 'external' }` maps to a read-only max at this boundary.
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

  /** Player-safe: mode and regen cadence. */
  getGatheringEconomy(options = {}) {
    this._requireReady();
    return this.gatheringRichStateService?.systemEconomy(options.systemId) ?? null;
  },

  setGatheringEconomy(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setSystemEconomy(options);
  },

  /** Player-owned actors' pools for the GM Gathering State panel. */
  getGatheringStaminaState(options = {}) {
    this._requireReady();
    this._requireGM();
    const systemId = options.systemId;
    const service = this.gatheringRichStateService;
    if (!service || !systemId) return [];
    // Per the configured player-character types (issue 1024); an unrolled pool has `max: null`.
    return [...(game.actors?.contents ?? [])]
      .filter((actor) => isPlayerCharacterActor(actor))
      .map((actor) => {
        const stamina = service.getActorStamina(actor, systemId);
        return { actorId: actor.id, name: actor.name, img: actor.img, ...stamina };
      });
  },

  /** Roll or re-roll a character's pool from the system templates and persist it. */
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
