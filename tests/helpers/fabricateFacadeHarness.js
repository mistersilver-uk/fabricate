/**
 * fabricateFacadeHarness — stands up the `game.fabricate` facade's owner-gated read/submit path
 * with a mock `game`/`user`/`actors`, so tests can drive the viewer -> actor resolution that
 * `src/main.js`'s `Fabricate` facade performs and assert OWNER vs NON-OWNER vs GM behaviour
 * directly (issue 569).
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getFabricateFlag, setFabricateFlag } from '../../src/config/flags.js';
import { isGatheringActorSelectableByUser } from '../../src/config/preferencesCleanup.js';
import { AlchemyListingBuilder } from '../../src/ui/presenters/AlchemyListingBuilder.js';
import {
  resolveBulkCheckDecision as resolveStandaloneBulkCheckDecision,
  rollActorCheck as rollStandaloneActorCheck,
} from '../../src/systems/companionCheckRoll.js';
import { awardComponents as awardComponentsToActor } from '../../src/systems/companionComponentAward.js';
import {
  AFFORDABILITY_MESSAGE_KEYS,
  CHECK_ROLL_MESSAGE_KEYS,
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
  pooledHoldingsReadResult,
} from '../../src/systems/companionContract.js';
import { grantRecipeKnowledge as grantRecipeKnowledgeToActor } from '../../src/systems/companionKnowledgeGrant.js';
import { consumePooledHoldings as consumePooledHoldingsFromActors } from '../../src/systems/companionPooledConsumption.js';
import { readPooledHoldings as readPooledHoldingsAcrossActors } from '../../src/systems/companionPooledHoldings.js';
import { resolvedComponentsFor } from '../../src/systems/scopedEntityReads.js';
import {
  checkWorldCurrencyAffordability,
  creditWorldCurrency,
} from '../../src/systems/currencyAffordance.js';
import { resolveAlchemySubmissions } from '../../src/utils/alchemySubmissions.js';
import { findById, getDefinitionIndex } from '../../src/utils/definitionIndex.js';
import { FABRICATE_ENTRY_SOURCE } from './bootstrapEntrySource.js';
import { classMemberSource } from './boundedSource.js';

/**
 * The entry and the `src/bootstrap/` modules it composes, joined (issue 1715). Every owner-gate
 * suite pins its faithful copy above against this.
 */
export const MAIN_SOURCE = FABRICATE_ENTRY_SOURCE;

/**
 * THIS FILE as text, so a "faithful copy" claim can be checked rather than trusted (issue 1202).
 */
export const HARNESS_SOURCE = readFileSync(import.meta.filename, 'utf8');

/** Faithful copy of `src/main.js`'s hoisted `ROLL_ACTOR_CHECK_GATE_KEYS`. */
const ROLL_ACTOR_CHECK_GATE_KEYS = Object.freeze({
  gmOnlyKey: CHECK_ROLL_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
  noActorKey: CHECK_ROLL_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor],
});

/**
 * Faithful copies of `src/main.js`'s hoisted `AWARD_COMPONENTS_GATE_KEYS` and
 * `CREDIT_CURRENCY_GATE_KEYS` (issue 1301).
 */
const AWARD_COMPONENTS_GATE_KEYS = Object.freeze({
  gmOnlyKey: COMPONENT_AWARD_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
  noActorKey: COMPONENT_AWARD_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor],
});

const CREDIT_CURRENCY_GATE_KEYS = Object.freeze({
  gmOnlyKey: CURRENCY_CREDIT_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
  noActorKey: CURRENCY_CREDIT_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor],
});

/** The two pooled members carry NO hoisted refusal-string trio, on either side (issue 1342). */

/**
 * The body of ONE `src/main.js` method, BOUNDED at its own closing brace.
 *
 * @param {string} signature The method signature exactly as authored, INCLUDING its opening brace —
 * e.g. `_gateBulkTargets(targets, actorId) {`. Passing a bare name would match a call site as
 * readily as the declaration.
 * @returns {string} The method's own text, closing brace included.
 * @throws {Error} When the signature is not found, or has no closing brace — either means the pin
 * is now vacuous, which must fail loudly rather than assert on ''.
 */
export function mainMethodSource(signature, source = MAIN_SOURCE) {
  return classMemberSource(source, signature, 'main.js');
}

/** Minimal `foundry.utils` shim the builder's flag reads use at call time. */
function installFoundryShim() {
  globalThis.foundry = globalThis.foundry ?? {
    utils: {
      randomID: () => `id-${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      getProperty: (object, path) =>
        String(path || '')
          .split('.')
          .reduce((value, key) => (value == null ? undefined : value[key]), object),
    },
  };
}

/**
 * Install the `globalThis.fromUuidSync` the pooled preamble addresses its actors through.
 *
 * @param {Array<object>} documents Everything addressable, each carrying its own `uuid`.
 */
function installUuidResolver(documents) {
  const byUuid = new Map();
  for (const document of documents) {
    if (typeof document?.uuid !== 'string' || document.uuid === '') continue;
    byUuid.set(document.uuid, document);
    // A document may answer to SEVERAL addresses, and it is the IDENTICAL object at each one.
    for (const alias of Array.isArray(document.uuidAliases) ? document.uuidAliases : []) {
      if (typeof alias === 'string' && alias !== '') byUuid.set(alias, document);
    }
  }
  globalThis.fromUuidSync = (uuid) => byUuid.get(uuid) ?? null;
}

/**
 * Build a builder-compatible mock actor whose ownership is resolved PER user, so one actor can read
 * as owned by user A and not-owned by user B — the exact axis the owner gate turns on.
 *
 * @param {string} id Actor id (the key `game.actors.get` resolves).
 * @param {string[]} [options.ownerUserIds] User ids that OWN this actor.
 * @param {object} [options.learned] `{ [recipeId]: {...} }` learned-recipe flag store.
 * @param {object} [options.deadEnds] `{ [systemId]: string[] }` fizzle-key flag store.
 * @param {object} [options.owned] `{ [itemName]: quantity }` owned inventory items.
 * @returns {object} A mock actor with `id`, `items`, `getFlag`, `testUserPermission`, `isOwner`.
 */
export function makeFacadeActor(
  id,
  { ownerUserIds = [], learned = {}, deadEnds = {}, owned = {} } = {}
) {
  // setFabricateFlag persists doubly-nested (`flags.fabricate.fabricate.<key>`).
  const flags = {
    fabricate: { fabricate: { learnedRecipes: learned, alchemyDeadEnds: deadEnds } },
  };
  const items = Object.entries(owned).map(([name, quantity]) => ({ name, system: { quantity } }));
  const owners = new Set(ownerUserIds);
  const getFlag = (scope, key) =>
    String(key || '')
      .split('.')
      .reduce((value, part) => (value == null ? undefined : value[part]), flags[scope]);
  return {
    id,
    // The bulk facades read `uuid` and `name` off the RESOLVED actor: `salvageComponents`
    // derives the uuid the service receives (the seam itself never takes one) and both
    // report `actorName` on every row.
    uuid: `Actor.${id}`,
    // Every real Actor carries this, and `_requireGmActors` reads it: `fromUuidSync` answers
    // whatever the address names, so the pooled preamble refuses an address that resolves to a
    // document which is not an actor.
    documentName: 'Actor',
    name: `Actor ${id}`,
    items,
    getFlag,
    // Foundry's per-user ownership seam the real predicate calls.
    testUserPermission: (user, level) => level === 'OWNER' && owners.has(user?.id),
    // Foundry's `isOwner` is ownership relative to the CURRENT user.
    get isOwner() {
      return owners.has(globalThis.game?.user?.id);
    },
  };
}

/**
 * A {@link makeFacadeActor} that can also DELETE its own embedded Items — what `destroyComponents`
 * ultimately drives (issue 859).
 *
 * @returns {object} The actor, with `deletedIds` recording every submitted batch.
 */
export function makeDeletableFacadeActor(id, { ownerUserIds = [], documents = [] } = {}) {
  const actor = makeFacadeActor(id, { ownerUserIds });
  const held = new Map(documents.map((document) => [document.id, document]));
  actor.deletedIds = [];
  actor.items = {
    has: (itemId) => held.has(itemId),
    get: (itemId) => held.get(itemId) ?? null,
    contents: [...held.values()],
  };
  actor.heldDocuments = held;
  actor.deleteEmbeddedDocuments = async (type, itemIds) => {
    actor.deletedIds.push({ type, itemIds: [...itemIds] });
    const removed = [];
    for (const itemId of itemIds) {
      const document = held.get(itemId);
      if (!document) continue;
      held.delete(itemId);
      removed.push(document);
    }
    return removed;
  };
  return actor;
}

/**
 * Install a mock `globalThis.game` (and `foundry` shim) exposing the current `user`, an `actors`
 * collection with `.get(id)`, and a settings-backed crafting-actor / component-source selection.
 *
 * @param {object} options.user The current `game.user` (`{ id, isGM }`).
 * @param {Array<object>} [options.actors] Mock actors (each with an `id`).
 * @param {string|null} [options.selectedCraftingActorId] Persisted `LAST_CRAFTING_ACTOR`.
 * @param {string[]} [options.componentSourceActorIds] Persisted `LAST_COMPONENT_SOURCES`.
 * @param {Array<object>} [options.documents] Extra documents `fromUuidSync` can address — a
 * token-scoped synthetic actor, or a non-Actor document a mistyped address names.
 */
export function installFacadeGame({
  user,
  actors = [],
  selectedCraftingActorId = null,
  componentSourceActorIds = [],
  documents = [],
}) {
  installFoundryShim();
  installUuidResolver([...actors, ...documents]);
  const actorsById = new Map(actors.map((actor) => [actor.id, actor]));
  const settings = new Map([
    ['lastCraftingActor', selectedCraftingActorId ?? ''],
    ['lastComponentSources', Array.isArray(componentSourceActorIds) ? componentSourceActorIds : []],
  ]);
  const game = {
    user,
    actors: { get: (id) => actorsById.get(id) ?? null },
    settings: {
      get: (_namespace, key) => settings.get(key),
      set: (_namespace, key, value) => {
        settings.set(key, value);
        return value;
      },
    },
    i18n: { localize: (key) => key, format: (key) => key },
  };
  globalThis.game = game;
  return {
    game,
    setCurrentUser: (nextUser) => {
      game.user = nextUser;
    },
  };
}

/**
 * The facade under test: a faithful reproduction of the owner-gated resolution + alchemy
 * read/submit surface of `src/main.js`'s `Fabricate`, wired to the REAL ownership predicate,
 * `AlchemyListingBuilder`, and `resolveAlchemySubmissions`.
 */
export class FabricateFacadeUnderTest {
  constructor({
    alchemyListingBuilder,
    craftingEngine = null,
    craftingSystemManager = null,
    ready = false,
    bulkSalvageService = null,
    bulkDestroyService = null,
    // The collaborators the companion-contract members reach.
    recipeManager = null,
    recipeVisibilityService = null,
    currencyConfigStore = undefined,
    actorPropertyCoinSpender = null,
    actorInventoryCoinSpender = null,
    // The Standalone Check Roll seam bag (issue 1293), INJECTED rather than reproduced.
    companionCheckSeams = null,
    // The Component Award seam bag (issue 1301), INJECTED for the same reason and NOT part of the
    // fidelity claim: production's `_componentAwardSeams()` reaches `fromUuid`, the live
    // crafting-system manager and the real engine, none of which exist here.
    componentAwardSeams = null,
    // The two Pooled Holdings seam bags (issue 1342), INJECTED for the same reason and NOT part of
    // the fidelity claim: production's `_pooledHoldingsSeams()` and `_pooledConsumptionSeams()`
    // reach the live crafting-system manager, the real engine and `game.users`, none of which exist
    // here.
    pooledHoldingsSeams = null,
    pooledConsumptionSeams = null,
  } = {}) {
    this._alchemyListingBuilder = alchemyListingBuilder;
    this.craftingEngine = craftingEngine;
    this.craftingSystemManager = craftingSystemManager;
    this.ready = ready;
    this.recipeManager = recipeManager;
    this.recipeVisibilityService = recipeVisibilityService;
    this.currencyConfigStore = currencyConfigStore;
    this.actorPropertyCoinSpender = actorPropertyCoinSpender;
    this.actorInventoryCoinSpender = actorInventoryCoinSpender;
    // Injected rather than lazily built: `_getBulkSalvageService` / `_getBulkDestroyService` exist
    // only to wire Foundry collaborators, which this harness has none of.
    this._bulkSalvageService = bulkSalvageService;
    this._bulkDestroyService = bulkDestroyService;
    this._companionCheckSeamBag = companionCheckSeams;
    this._componentAwardSeamBag = componentAwardSeams;
    this._pooledHoldingsSeamBag = pooledHoldingsSeams;
    this._pooledConsumptionSeamBag = pooledConsumptionSeams;
  }

  get _game() {
    return globalThis.game;
  }

  _requireReady() {
    if (!this.ready) throw new Error('Fabricate not initialized');
  }

  getSelectedCraftingActorId() {
    return this._game?.settings?.get?.('fabricate', 'lastCraftingActor') || '';
  }

  getCraftingComponentSourceIds() {
    const ids = this._game?.settings?.get?.('fabricate', 'lastComponentSources');
    return Array.isArray(ids) ? ids : [];
  }

  // --- Owner gate (faithful copy of Fabricate#_resolveCraftingActor) ---------
  _resolveCraftingActor(actorId) {
    const game = this._game;
    const actor = actorId ? (game.actors?.get?.(actorId) ?? null) : null;
    if (!actor) return null;
    if (game.user?.isGM === true) return actor;
    return isGatheringActorSelectableByUser(actor, game.user) ? actor : null;
  }

  // Faithful copy of Fabricate#_requireGmActor (issue 1289). The one authorization rule three
  // facade members share, in D9's normative order: GM -> actor -> (readiness, tested by each MEMBER
  // afterwards, because `_requireReady()` throws and a `stable` contract member may not).
  _requireGmActor(actorId, { gmOnlyKey, noActorKey }) {
    const game = this._game;
    if (game.user?.isGM !== true) {
      return { actor: null, outcome: COMPANION_OUTCOMES.gmOnly, message: gmOnlyKey };
    }
    const actor = this._resolveCraftingActor(actorId);
    if (!actor) {
      return { actor: null, outcome: COMPANION_OUTCOMES.noActor, message: noActorKey };
    }
    return { actor, outcome: null, message: null };
  }

  // Faithful copy of Fabricate#_requireGmActors (issue 1342). The SET-valued extension of the
  // preamble above, for the two pooled members.
  _requireGmActors(actorUuids) {
    const game = this._game;
    if (game.user?.isGM !== true) {
      return { actors: null, outcome: COMPANION_OUTCOMES.gmOnly, messageData: null };
    }
    return gatePooledActorUuids(actorUuids, {
      resolveActor: (uuid) => {
        const addressed = globalThis.fromUuidSync?.(uuid) ?? null;
        if (addressed?.documentName !== 'Actor') return null;
        return addressed.inCompendium === true ? null : addressed;
      },
    });
  }

  // Faithful copies of the four `handle` accessors (issue 1289). One line each in production too.
  getCraftingEngine() {
    return this.craftingEngine;
  }

  getCurrencyConfigStore() {
    return this.currencyConfigStore ?? null;
  }

  getActorInventoryCoinSpender() {
    return this.actorInventoryCoinSpender;
  }

  getActorPropertyCoinSpender() {
    return this.actorPropertyCoinSpender;
  }

  // Faithful copy of Fabricate#grantRecipeKnowledge (issue 1289). The delegator only: the grant
  // itself is the REAL free function, wired to the REAL flag seams, so what this copy reproduces is
  // exactly the part that lives in `src/main.js` — the shared preamble, the single readiness guard,
  // and the four injected seams.
  async grantRecipeKnowledge({ actorId = null, recipeId = null, grantedBy = null } = {}) {
    const gate = this._requireGmActor(actorId, {
      gmOnlyKey: KNOWLEDGE_GRANT_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
      noActorKey: KNOWLEDGE_GRANT_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor],
    });
    if (gate.outcome || this.ready !== true) {
      return knowledgeGrantResult(gate.outcome ?? COMPANION_OUTCOMES.notReady);
    }
    return await grantRecipeKnowledgeToActor(
      { actor: gate.actor, recipeId, grantedBy },
      {
        resolveRecipe: (id) => this.recipeManager?.getRecipe?.(id) ?? null,
        resolveSystem: (recipe) =>
          this.craftingSystemManager?.getSystem?.(recipe?.craftingSystemId) ?? null,
        isObservable: (system) =>
          this.recipeVisibilityService?.isLearnedKnowledgeObservable?.(system) === true,
        readFlag: (actor, key, fallback) => getFabricateFlag(actor, key, fallback),
        writeFlag: (actor, key, value) => setFabricateFlag(actor, key, value),
      }
    );
  }

  // --- Faithful copy of Fabricate#checkAffordability (issue 1289) ------------
  async checkAffordability({ actorId = null, unitId = null, amount = null } = {}) {
    const gate = this._requireGmActor(actorId, {
      gmOnlyKey: AFFORDABILITY_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
      noActorKey: AFFORDABILITY_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor],
    });
    if (gate.outcome || this.ready !== true) {
      return affordabilityResult(gate.outcome ?? COMPANION_OUTCOMES.notReady);
    }
    return await checkWorldCurrencyAffordability(
      gate.actor,
      { unitId, amount },
      this._worldCurrencySeams()
    );
  }

  // Faithful copy of Fabricate#_worldCurrencySeams (issue 1301). REPRODUCED rather than injected,
  // unlike the two seam bags above it: every seam here is a field this harness already carries, so
  // the copy costs nothing and the mirror can be pinned against production key for key.
  _worldCurrencySeams() {
    return {
      getCurrencyConfig: () => this.currencyConfigStore?.get?.() ?? null,
      actorPropertyCoinSpender: this.actorPropertyCoinSpender,
      actorInventoryCoinSpender: this.actorInventoryCoinSpender,
    };
  }

  // Faithful copy of Fabricate#creditCurrency (issue 1301). Sited HERE, beside `checkAffordability`
  // and the bag they share, because production sites it here — the mirror follows production's
  // member order as well as its text, and that order is what keeps the two new delegators from
  // concatenating into one over-the-bar duplicated run across the two files.
  async creditCurrency({ actorId = null, unitId = null, amount = null, callSite = null } = {}) {
    const gate = this._requireGmActor(actorId, CREDIT_CURRENCY_GATE_KEYS);
    if (gate.outcome || this.ready !== true) {
      return currencyCreditResult(gate.outcome ?? COMPANION_OUTCOMES.notReady);
    }
    return await creditWorldCurrency(
      gate.actor,
      { unitId, amount, callSite },
      {
        ...this._worldCurrencySeams(),
        isElectedExecutor: () => this._game.users?.activeGM?.id === this._game.user?.id,
      }
    );
  }

  // --- The Pooled Holdings read seam bag (INJECTED, see the constructor) ------
  _pooledHoldingsSeams() {
    return this._pooledHoldingsSeamBag;
  }

  // Faithful copy of Fabricate#readPooledHoldings (issue 1342). The delegator only: the read itself
  // is the REAL leaf, so what this copy reproduces is exactly the part that lives in `src/main.js`
  // — the SET-valued preamble with this member's OWN hoisted keys, the single readiness guard, the
  // gate's own `messageData` carried onto the refusal, and the RESOLVED actor documents passed
  // through as the leaf's FIRST argument.
  async readPooledHoldings({ actorUuids = null, costs = null } = {}) {
    const gate = this._requireGmActors(actorUuids);
    if (gate.outcome || this.ready !== true) {
      return pooledHoldingsReadResult(
        gate.outcome ?? COMPANION_OUTCOMES.notReady,
        gate.messageData
      );
    }
    return await readPooledHoldingsAcrossActors(
      gate.actors,
      { costs },
      this._pooledHoldingsSeams()
    );
  }

  // --- The Standalone Check Roll seam bag (INJECTED, see the constructor) -----
  _companionCheckSeams() {
    return this._companionCheckSeamBag;
  }

  // --- The Component Award seam bag (INJECTED, see the constructor) -----------
  _componentAwardSeams() {
    return this._componentAwardSeamBag;
  }

  // Faithful copy of Fabricate#rollActorCheck (issue 1293). The delegator only: the roll itself is
  // the REAL free function. The durable facts are about METHOD, not magnitude.
  async rollActorCheck({
    actorId = null,
    callSite = null,
    formula = null,
    dc = null,
    compare = null,
    label = null,
    interactive = false,
    rollDecision = null,
  } = {}) {
    const gate = this._requireGmActor(actorId, ROLL_ACTOR_CHECK_GATE_KEYS);
    if (gate.outcome || this.ready !== true) {
      return checkRollResult(gate.outcome ?? COMPANION_OUTCOMES.notReady);
    }
    return await rollStandaloneActorCheck(
      { actor: gate.actor, callSite, formula, dc, compare, label, interactive, rollDecision },
      this._companionCheckSeams()
    );
  }

  // Faithful copy of Fabricate#resolveBulkCheckDecision (issue 1293). GM-gated INLINE rather than
  // through `_requireGmActor`, because this member takes no `actorId`:
  // `_resolveCraftingActor(null)` returns `null`, so the shared preamble would always answer
  // `noActor` for a member that reads no actor and can never emit one.
  async resolveBulkCheckDecision({ callSite = null, formulas = null } = {}) {
    const gmOnly = this._game.user?.isGM === true ? null : COMPANION_OUTCOMES.gmOnly;
    if (gmOnly || this.ready !== true) {
      return bulkCheckDecisionResult(gmOnly ?? COMPANION_OUTCOMES.notReady);
    }
    return await resolveStandaloneBulkCheckDecision(
      { callSite, formulas },
      this._companionCheckSeams()
    );
  }

  // Faithful copy of Fabricate#awardComponents (issue 1301). The delegator only: the award itself
  // is the REAL free function, so what this copy reproduces is exactly the part that lives in
  // `src/main.js` — the shared preamble with this member's OWN hoisted keys, the single readiness
  // guard, and the resolved actor passed through as the leaf's FIRST argument, which is what makes
  // a caller-supplied `actor` in the request structurally unable to reach a seam.
  async awardComponents({ actorId = null, systemId = null, awards = null, callSite = null } = {}) {
    const gate = this._requireGmActor(actorId, AWARD_COMPONENTS_GATE_KEYS);
    if (gate.outcome || this.ready !== true) {
      return componentAwardResult(gate.outcome ?? COMPANION_OUTCOMES.notReady);
    }
    return await awardComponentsToActor(
      gate.actor,
      { systemId, awards, callSite },
      this._componentAwardSeams()
    );
  }

  // --- The Pooled Holdings consume seam bag (INJECTED, see the constructor) ---
  _pooledConsumptionSeams() {
    return this._pooledConsumptionSeamBag;
  }

  // Faithful copy of Fabricate#consumePooledHoldings (issue 1342). The delegator only: the take
  // itself is the REAL leaf, which owns the call-site gate, the election, the `costs` validation,
  // the components-first ordering and the rollback.
  async consumePooledHoldings({ actorUuids = null, callSite = null, costs = null } = {}) {
    const gate = this._requireGmActors(actorUuids);
    if (gate.outcome || this.ready !== true) {
      return pooledHoldingsConsumeResult(
        gate.outcome ?? COMPANION_OUTCOMES.notReady,
        gate.messageData
      );
    }
    return await consumePooledHoldingsFromActors(
      gate.actors,
      { callSite, costs },
      this._pooledConsumptionSeams()
    );
  }

  // --- Faithful copy of Fabricate#_resolveCraftingSources --------------------
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

  // Faithful copy of Fabricate#_gateBulkTargets (issue 859). There is deliberately NO `??
  // this.getSelectedCraftingActorId()` tail here, unlike `_resolveCraftingSources` above.
  _gateBulkTargets(targets, actorId) {
    return (targets || []).filter(Boolean).map((target) => ({
      target,
      actor: this._resolveCraftingActor(target.actorId ?? actorId),
    }));
  }

  // --- Faithful copy of Fabricate#_mergeBulkRows -----------------------------
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

  // Faithful copy of Fabricate#_buildNotPermittedRow ---------------------- The component lookup
  // uses the REAL `definitionIndex` helpers, exactly as production does (issue 1202).
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
      outcome: 'notPermitted',
      skipReason: null,
    };
  }

  // Faithful copy of Fabricate#salvageComponents. `onProgress` is accepted and FORWARDED, exactly
  // as the real facade does.
  async salvageComponents({
    actorId = null,
    targets = [],
    interactive = true,
    onProgress = null,
  } = {}) {
    this._requireReady();
    const gated = this._gateBulkTargets(targets, actorId);
    const runnable = gated.filter((entry) => entry.actor);

    const result = await this._bulkSalvageService.run({
      targets: runnable.map(({ target, actor }) => ({
        actorUuid: actor.uuid,
        actorId: actor.id,
        actorName: actor.name,
        systemId: target.systemId,
        componentId: target.componentId,
      })),
      interactive,
      onProgress,
    });
    if (result.cancelled) return result;

    const items = this._mergeBulkRows(gated, result.items, (target) => ({
      ...this._buildNotPermittedRow(target),
      rollValue: null,
      tierStep: null,
      message: '',
      results: [],
      consumed: [],
      tools: [],
    }));
    return {
      cancelled: false,
      items,
      counts: {
        ...result.counts,
        total: items.length,
        notPermitted: items.length - result.items.length,
      },
      posted: result.posted,
    };
  }

  // --- Faithful copy of Fabricate#destroyComponents --------------------------
  async destroyComponents({ actorId = null, targets = [], onProgress = null } = {}) {
    this._requireReady();
    const gated = this._gateBulkTargets(targets, actorId);
    const runnable = gated.filter((entry) => entry.actor);

    const result = await this._bulkDestroyService.run({
      targets: runnable.map(({ target, actor }) => ({
        actor,
        actorId: actor.id,
        actorName: actor.name,
        systemId: target.systemId,
        componentId: target.componentId,
      })),
      onProgress,
    });

    const items = this._mergeBulkRows(gated, result.items, (target) => ({
      ...this._buildNotPermittedRow(target),
      requested: 0,
      unitsDeleted: 0,
      documentsDeleted: 0,
      staleIds: 0,
      items: [],
      vetoed: [],
    }));
    return { items, unitsDeleted: result.unitsDeleted, documentsDeleted: result.documentsDeleted };
  }

  // --- Faithful copy of Fabricate#listAlchemyForActor ------------------------
  listAlchemyForActor({
    actorId = null,
    craftingSystemId = null,
    componentSourceActorIds = null,
  } = {}) {
    this._requireReady();
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources({
      rememberedActorId: actorId,
      componentSourceActorIds,
    });
    return this._alchemyListingBuilder.buildListing({
      craftingActor,
      componentSourceActors,
      viewer: this._game.user,
      craftingSystemId,
    });
  }

  // --- Faithful copy of Fabricate#submitAlchemyAttempt -----------------------
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
      return {
        success: false,
        results: null,
        message: 'No crafting actor selected',
        disposition: 'error',
      };
    }
    const sources = componentSourceActors.length > 0 ? componentSourceActors : [craftingActor];
    const system = this.craftingSystemManager?.getSystem?.(craftingSystemId) ?? null;
    const components = Array.isArray(system?.components) ? system.components : [];
    const submittedItems = resolveAlchemySubmissions(
      sources,
      components,
      submittedComponentIds,
      craftingSystemId
    );
    if (submittedItems.length === 0) {
      return {
        success: false,
        results: null,
        message: 'FABRICATE.App.Alchemy.NoIngredients',
        disposition: 'error',
      };
    }
    return await this.craftingEngine.craftAlchemy(craftingActor, sources, submittedItems, {
      craftingSystemId,
      interactive,
    });
  }
}

/**
 * Build managers over a set of `{ system, recipes }` entries, matching the shape
 * `AlchemyListingBuilder` reads (`getSystems`/`getSystem`, `getRecipes`).
 */
export function makeFacadeManagers(entries) {
  const bySystem = new Map(entries.map((entry) => [entry.system.id, entry.recipes]));
  const craftingSystemManager = {
    getSystems: () => entries.map((entry) => entry.system),
    getSystem: (id) => entries.find((entry) => entry.system.id === id)?.system ?? null,
  };
  const recipeManager = {
    getRecipes: ({ craftingSystemId, enabled } = {}) => {
      let list = bySystem.get(craftingSystemId) ?? [];
      if (enabled !== undefined) list = list.filter((recipe) => recipe.enabled === enabled);
      return list;
    },
  };
  return { craftingSystemManager, recipeManager };
}

/**
 * Stand up the facade under test with the REAL `AlchemyListingBuilder` wired to the supplied
 * managers, plus a spy crafting engine whose `craftAlchemy` calls are recorded so a test can assert
 * the submit path never reaches the engine for a non-owner (no mutation).
 *
 * @param {object} options.user Current `game.user` (`{ id, isGM }`).
 * @param {Array<object>} options.actors Mock actors (see {@link makeFacadeActor}).
 * @param {Array<{ system: object, recipes: object[] }>} [options.systems] Alchemy fixtures.
 * @param {object} [options.recipeVisibility] Optional reveal collaborator (defaults to
 * learned-map/GM-all).
 * @param {(result: object) => object} [options.craftAlchemyResult] Value the spy engine returns on
 * a resolved brew.
 * @param {string|null} [options.selectedCraftingActorId] Persisted selection.
 * @param {string[]} [options.componentSourceActorIds] Persisted component sources.
 * @param {boolean} [options.ready] `Fabricate.ready` flag (defaults true).
 */
export function createFabricateFacadeHarness({
  user,
  actors = [],
  systems = [],
  recipeVisibility = null,
  craftAlchemyResult = { success: true, disposition: 'success', results: [] },
  selectedCraftingActorId = null,
  componentSourceActorIds = [],
  ready = true,
  bulkSalvageService = null,
  bulkDestroyService = null,
} = {}) {
  const { game, setCurrentUser } = installFacadeGame({
    user,
    actors,
    selectedCraftingActorId,
    componentSourceActorIds,
  });
  const { craftingSystemManager, recipeManager } = makeFacadeManagers(systems);
  const alchemyListingBuilder = new AlchemyListingBuilder({
    recipeManager,
    craftingSystemManager,
    recipeVisibility,
  });
  const craftAlchemyCalls = [];
  const craftingEngine = {
    craftAlchemy: async (craftingActor, sources, submittedItems, options) => {
      craftAlchemyCalls.push({ craftingActor, sources, submittedItems, options });
      return craftAlchemyResult;
    },
  };
  const facade = new FabricateFacadeUnderTest({
    alchemyListingBuilder,
    craftingEngine,
    craftingSystemManager,
    ready,
    bulkSalvageService,
    bulkDestroyService,
  });
  return { facade, game, setCurrentUser, craftAlchemyCalls };
}
