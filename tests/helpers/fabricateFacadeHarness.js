/**
 * fabricateFacadeHarness — stands up the `game.fabricate` facade's owner-gated
 * read/submit path with a mock `game`/`user`/`actors`, so tests can drive the
 * viewer -> actor resolution that `src/main.js`'s `Fabricate` facade performs and
 * assert OWNER vs NON-OWNER vs GM behaviour directly (issue 569).
 *
 * WHY A REPRODUCTION (and not the real `Fabricate` class): `src/main.js` imports
 * the global stylesheet and Svelte UI modules at module load, so it cannot be
 * imported under plain `node --test`. This harness therefore composes the SAME
 * real collaborators the facade wires:
 *  - the real ownership predicate `isGatheringActorSelectableByUser`
 *    (`src/config/preferencesCleanup.js`) — the actual security boundary;
 *  - the real `AlchemyListingBuilder` (`src/systems/AlchemyListingBuilder.js`) —
 *    the leak-safe projection that fails closed on a null crafting actor;
 *  - the real `resolveAlchemySubmissions` (`src/utils/alchemySubmissions.js`) —
 *    the submit-path collector;
 * behind a faithful copy of the facade's `_resolveCraftingActor` /
 * `_resolveCraftingSources` resolver. That copy is pinned against the real
 * `src/main.js` source by a source-contract guard in
 * `tests/fabricate-facade-alchemy-owner-gate.test.js`, so weakening the real
 * gate (e.g. dropping the ownership predicate or the GM bypass) fails the suite.
 *
 * The generic pieces (`installFacadeGame`, `makeFacadeActor`, and the shared
 * resolver on the returned facade) are deliberately decoupled from the alchemy
 * methods so the `listCraftingForActor` / gathering facade gates can adopt this
 * harness too.
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getFabricateFlag, setFabricateFlag } from '../../src/config/flags.js';
import { isGatheringActorSelectableByUser } from '../../src/config/preferencesCleanup.js';
import { AlchemyListingBuilder } from '../../src/systems/AlchemyListingBuilder.js';
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
import { classMemberSource } from './boundedSource.js';

/**
 * `src/main.js` as text, read once. Every owner-gate suite pins its faithful copy above
 * against this, because the module itself cannot be imported under `node --test`.
 *
 * @type {string}
 */
export const MAIN_SOURCE = readFileSync(resolve(import.meta.dirname, '../../src/main.js'), 'utf8');

/**
 * THIS FILE as text, so a "faithful copy" claim can be checked rather than trusted.
 *
 * The copies below are hand-maintained against `src/main.js`, and every existing
 * source-contract guard pins the PRODUCTION text only — which catches production
 * weakening and says nothing about the mirror drifting away from it. A divergence that
 * is behaviourally identical on the fixtures at hand (issue 1202 hit exactly this: an
 * indexed lookup in production against a surviving `.find(` scan here) is invisible to
 * every behavioural test in the suite.
 *
 * Slicing this with {@link mainMethodSource} works because the copies are class members
 * at the same two-space indentation `src/main.js` uses, which is what that helper bounds
 * on.
 *
 * @type {string}
 */
export const HARNESS_SOURCE = readFileSync(import.meta.filename, 'utf8');

/**
 * Faithful copy of `src/main.js`'s hoisted `ROLL_ACTOR_CHECK_GATE_KEYS`.
 *
 * Hoisted on both sides so each delegator reads `this._requireGmActor(actorId, KEYS)` on one
 * line rather than restating a four-line object literal in two files.
 */
const ROLL_ACTOR_CHECK_GATE_KEYS = Object.freeze({
  gmOnlyKey: CHECK_ROLL_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
  noActorKey: CHECK_ROLL_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor],
});

/**
 * Faithful copies of `src/main.js`'s hoisted `AWARD_COMPONENTS_GATE_KEYS` and
 * `CREDIT_CURRENCY_GATE_KEYS` (issue 1301).
 *
 * Two pairs on this side as well, reading from each member's OWN key table — and what that
 * buys is SOURCE FIDELITY over a value that is currently INERT, not a behavioural guard. Both
 * delegators read `gate.outcome` and discard `gate.message`, and their result builders derive
 * `message` from their own tables, so swapping a pair's strings today changes no answer either
 * member gives. `_requireGmActor`'s `message` is read at exactly one site in `src/main.js`,
 * `resetActorKnowledge`, which answers with it directly.
 *
 * The pair is still worth copying faithfully and still worth pinning: the parameter is part of
 * the preamble's published shape, a fifth member could answer with it tomorrow the way
 * `resetActorKnowledge` does today, and a mirror carrying another member's strings is drift in
 * the one artefact this whole change's facade-level evidence rests on. What must not be said —
 * and was said here before — is that the swap makes a refused award report itself in the
 * grant's words. It does not.
 */
const AWARD_COMPONENTS_GATE_KEYS = Object.freeze({
  gmOnlyKey: COMPONENT_AWARD_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
  noActorKey: COMPONENT_AWARD_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor],
});

const CREDIT_CURRENCY_GATE_KEYS = Object.freeze({
  gmOnlyKey: CURRENCY_CREDIT_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
  noActorKey: CURRENCY_CREDIT_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor],
});

/**
 * The two pooled members carry NO hoisted refusal-string trio, on either side (issue 1342).
 *
 * The pairs above exist because the SINGULAR preamble's `message` is read — `resetActorKnowledge`
 * answers it verbatim. The SET-valued preamble's is not: both pooled delegators branch on
 * `gate.outcome` alone and answer through their own result builder, which resolves the member's
 * own message table by outcome. A key threaded through the gate could only restate the string
 * the builder is about to derive, so production carries none and this mirror carries none.
 */

/**
 * The body of ONE `src/main.js` method, BOUNDED at its own closing brace.
 *
 * A thin naming of {@link classMemberSource} for this file's default source, kept because
 * `mainMethodSource(SIGNATURE)` is what the owner-gate suites already read as. The bounding
 * strategy itself — and the reason an unbounded `indexOf`/`slice` pair is a hazard rather
 * than a shortcut — lives in `boundedSource.js`, which is where any other suite reaches for
 * it rather than re-deriving it here.
 *
 * @param {string} signature The method signature exactly as authored, INCLUDING its
 *   opening brace — e.g. `_gateBulkTargets(targets, actorId) {`. Passing a bare name
 *   would match a call site as readily as the declaration.
 * @param {string} [source]
 * @returns {string} The method's own text, closing brace included.
 * @throws {Error} When the signature is not found, or has no closing brace — either
 *   means the pin is now vacuous, which must fail loudly rather than assert on ''.
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
 * ADDRESS-keyed and nothing else, because that is the whole reason the pooled members take a
 * UUID: a synthetic token actor's `id` IS its world prototype's, so a double that resolved by id
 * would agree with the very confusion the address exists to remove. A caller can therefore hand
 * in a token-scoped actor and a world one that share an `id` and see them stay apart.
 *
 * It answers `null` for an address it does not hold, which is what makes the `noActor` and
 * partly-resolved refusals reachable: a resolver that answered something for every string would
 * be a seam that cannot refuse, and the gate above it would be untestable.
 *
 * @param {Array<object>} documents Everything addressable, each carrying its own `uuid`.
 */
function installUuidResolver(documents) {
  const byUuid = new Map();
  for (const document of documents) {
    if (typeof document?.uuid !== 'string' || document.uuid === '') continue;
    byUuid.set(document.uuid, document);
    // A document may answer to SEVERAL addresses, and it is the IDENTICAL object at each one.
    // That is not a convenience for tests: `Token#actor` returns `this.baseActor` for a LINKED
    // token, so `Actor.x` and `Scene.s.Token.t.Actor.x` are two well-formed, visibly different
    // addresses for one document. A resolver that answered a copy would make the pooled gate's
    // distinctness rule untestable in the direction that actually bites.
    for (const alias of Array.isArray(document.uuidAliases) ? document.uuidAliases : []) {
      if (typeof alias === 'string' && alias !== '') byUuid.set(alias, document);
    }
  }
  globalThis.fromUuidSync = (uuid) => byUuid.get(uuid) ?? null;
}

/**
 * Build a builder-compatible mock actor whose ownership is resolved PER user, so
 * one actor can read as owned by user A and not-owned by user B — the exact axis
 * the owner gate turns on.
 *
 * @param {string} id Actor id (the key `game.actors.get` resolves).
 * @param {object} [options]
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
    // document which is not an actor. A double without it would make that gate untestable in
    // the passing direction — the counterpart to a double that is LOOSER than the real thing.
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
 * A {@link makeFacadeActor} that can also DELETE its own embedded Items — what
 * `destroyComponents` ultimately drives (issue 859).
 *
 * `deleteEmbeddedDocuments` RETURNS the removed documents, as core does, because
 * `BulkDestroyService` derives `unitsDeleted` from the return and never from the
 * request. A stand-in that returned nothing would report every row as vetoed.
 *
 * @param {string} id
 * @param {object} [options]
 * @param {string[]} [options.ownerUserIds]
 * @param {Array<{id: string, name?: string, system?: object}>} [options.documents]
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
 * Install a mock `globalThis.game` (and `foundry` shim) exposing the current
 * `user`, an `actors` collection with `.get(id)`, and a settings-backed
 * crafting-actor / component-source selection. Returns controls to swap the
 * current user (owner -> non-owner) without rebuilding the facade.
 *
 * @param {object} options
 * @param {object} options.user The current `game.user` (`{ id, isGM }`).
 * @param {Array<object>} [options.actors] Mock actors (each with an `id`).
 * @param {string|null} [options.selectedCraftingActorId] Persisted `LAST_CRAFTING_ACTOR`.
 * @param {string[]} [options.componentSourceActorIds] Persisted `LAST_COMPONENT_SOURCES`.
 * @param {Array<object>} [options.documents] Extra documents `fromUuidSync` can address —
 *   a token-scoped synthetic actor, or a non-Actor document a mistyped address names.
 * @returns {{ game: object, setCurrentUser: (user: object) => void }}
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
 * The facade under test: a faithful reproduction of the owner-gated resolution +
 * alchemy read/submit surface of `src/main.js`'s `Fabricate`, wired to the REAL
 * ownership predicate, `AlchemyListingBuilder`, and `resolveAlchemySubmissions`.
 * Reads `globalThis.game` live so a mid-test user swap takes effect.
 */
export class FabricateFacadeUnderTest {
  constructor({
    alchemyListingBuilder,
    craftingEngine = null,
    craftingSystemManager = null,
    ready = false,
    bulkSalvageService = null,
    bulkDestroyService = null,
    // The collaborators the companion-contract members reach. Every default here mirrors
    // what `Fabricate`'s CONSTRUCTOR leaves them as before `initialize()` runs, which is the
    // state the `handle` tier's "answers `null` before readiness" promise is made about —
    // `null` for the three assigned in the constructor, and deliberately UNSET for
    // `currencyConfigStore`, which production never initialises and normalizes with `?? null`
    // at its accessor instead.
    recipeManager = null,
    recipeVisibilityService = null,
    currencyConfigStore = undefined,
    actorPropertyCoinSpender = null,
    actorInventoryCoinSpender = null,
    // The Standalone Check Roll seam bag (issue 1293), INJECTED rather than reproduced. Every
    // seam in production's own `_companionCheckSeams()` is a Foundry collaborator this harness
    // has none of, and the two members' criteria turn on counting prompt and runner calls, so
    // the bag is what a test substitutes. The two DELEGATORS below are faithful copies and are
    // pinned against the production text; the bag they read is not part of that claim.
    companionCheckSeams = null,
    // The Component Award seam bag (issue 1301), INJECTED for the same reason and NOT part of
    // the fidelity claim: production's `_componentAwardSeams()` reaches `fromUuid`, the live
    // crafting-system manager and the real engine, none of which exist here. The DELEGATOR
    // below is a faithful copy and is pinned; the bag it reads is what a test substitutes.
    componentAwardSeams = null,
    // The two Pooled Holdings seam bags (issue 1342), INJECTED for the same reason and NOT part
    // of the fidelity claim: production's `_pooledHoldingsSeams()` and
    // `_pooledConsumptionSeams()` reach the live crafting-system manager, the real engine and
    // `game.users`, none of which exist here. Both DELEGATORS below are faithful copies and are
    // pinned; the bags they read are what a test substitutes.
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
    // Injected rather than lazily built: `_getBulkSalvageService` / `_getBulkDestroyService`
    // exist only to wire Foundry collaborators, which this harness has none of. The gate,
    // the merge and the refusal row — the parts with behaviour worth pinning — are copied
    // faithfully below.
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

  // --- Faithful copy of Fabricate#_requireGmActor (issue 1289) ---------------
  //
  // The one authorization rule three facade members share, in D9's normative order:
  // GM -> actor -> (readiness, tested by each MEMBER afterwards, because `_requireReady()`
  // throws and a `stable` contract member may not). The message keys are parameters so a
  // failed grant is never reported in the words of a failed reset.
  //
  // `tests/companion-facade.test.js` pins this copy against the production text in BOTH
  // directions, so neither side can lose a gate without the suite going red.
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

  // --- Faithful copy of Fabricate#_requireGmActors (issue 1342) --------------
  //
  // The SET-valued extension of the preamble above, for the two pooled members. The GM half is
  // the same rule in the same words and runs first; everything below it is DELEGATED to the one
  // place that rule exists, `gatePooledActorUuids` in the contract leaf — which is what keeps
  // the bound, the shape and the `noActor`/`invalidActorUuids` split out of this copy entirely.
  //
  // Addressed by UUID and never by id, because `game.actors.get` cannot tell an unlinked token
  // actor from its world prototype and this pair feeds a member that DELETES. The
  // `documentName` test is what stops an address naming an Item being scanned and written to as
  // if it were an actor, and the `inCompendium` test beside it is what stops a pack TEMPLATE
  // being deleted from once anything has loaded that pack — `fromUuidSync` answers an index
  // entry before the load and a real Actor after it, so without that test the member that
  // deletes would behave differently depending on what else the world had touched.
  //
  // It takes NO refusal strings on either side. See the comment where the trios used to be.
  //
  // One incidental asymmetry, of the class this file already carries: production reads the bare
  // `game` global where this copy hoists `this._game` first, exactly as `_requireGmActor` above
  // does. The resolver expression is VERBATIM on both sides, `globalThis.` and all — production
  // spells it that way because optional chaining does not rescue an undeclared identifier, and
  // this suite's own resolver is installed on the same global.
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

  // --- Faithful copies of the four `handle` accessors (issue 1289) -----------
  //
  // One line each in production too. They are reproduced rather than stubbed because the
  // contract's member-resolution assertion reads every member THROUGH its declared host and
  // path, and because the `null`-before-readiness half of the `handle` promise is a claim
  // about exactly these four bodies. Note `getCurrencyConfigStore` normalizes with `?? null`
  // where the other three return a constructor-assigned `null` directly — production differs
  // the same way, and the promise is true of all four for that reason rather than by luck.
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

  // --- Faithful copy of Fabricate#grantRecipeKnowledge (issue 1289) ----------
  //
  // The delegator only: the grant itself is the REAL free function, wired to the REAL flag
  // seams, so what this copy reproduces is exactly the part that lives in `src/main.js` —
  // the shared preamble, the single readiness guard, and the four injected seams.
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

  // --- Faithful copy of Fabricate#_worldCurrencySeams (issue 1301) -----------
  //
  // REPRODUCED rather than injected, unlike the two seam bags above it: every seam here is a
  // field this harness already carries, so the copy costs nothing and the mirror can be pinned
  // against production key for key. The mutation that matters is an omission — drop
  // `actorInventoryCoinSpender` here and every facade-level currency case that does not use
  // that strategy stays green while the mirror has silently stopped mirroring.
  //
  // `isElectedExecutor` is absent on both sides: the check gates on no call site, and
  // `creditCurrency` spreads this bag and adds its own.
  _worldCurrencySeams() {
    return {
      getCurrencyConfig: () => this.currencyConfigStore?.get?.() ?? null,
      actorPropertyCoinSpender: this.actorPropertyCoinSpender,
      actorInventoryCoinSpender: this.actorInventoryCoinSpender,
    };
  }

  // --- Faithful copy of Fabricate#creditCurrency (issue 1301) ----------------
  //
  // Sited HERE, beside `checkAffordability` and the bag they share, because production sites it
  // here — the mirror follows production's member order as well as its text, and that order is
  // what keeps the two new delegators from concatenating into one over-the-bar duplicated run
  // across the two files.
  //
  // One incidental asymmetry, of the class this file already carries: production reads the
  // election off the bare `game` global and this copy reads it off `this._game`, exactly as
  // `resolveBulkCheckDecision` above does. The EXPRESSION is otherwise identical, and the
  // election is added by this member rather than by `_worldCurrencySeams()` on both sides.
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

  // --- Faithful copy of Fabricate#readPooledHoldings (issue 1342) ------------
  //
  // The delegator only: the read itself is the REAL leaf, so what this copy reproduces is
  // exactly the part that lives in `src/main.js` — the SET-valued preamble with this member's
  // OWN hoisted keys, the single readiness guard, the gate's own `messageData` carried onto the
  // refusal, and the RESOLVED actor documents passed through as the leaf's FIRST argument.
  //
  // Sited HERE, beside `creditCurrency` and the world-currency bag production's own version
  // spreads, because production sites it here — the mirror follows production's member order as
  // well as its text, and that order is what keeps the two pooled delegators from concatenating
  // into one over-the-bar duplicated run across the two files.
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

  // --- Faithful copy of Fabricate#rollActorCheck (issue 1293) ----------------
  //
  // The delegator only: the roll itself is the REAL free function. It reuses the shared
  // preamble VERBATIM and passes `gate.actor` straight into the leaf, so no second actor
  // resolver exists to disagree with the first.
  //
  // DO NOT "TIDY" THIS COPY TOWARDS `src/main.js`'s FORMATTING, and read the numbers before
  // deciding otherwise (issue 1293, D12).
  //
  // The duplicated run against `src/main.js` measures 98 tokens as shipped — under SonarJS's
  // 100-token minimum, and under the SonarCloud new-code duplication gate that follows from
  // it. That margin is NOMINAL, not comfortable. It is held by two INDEPENDENT incidental
  // asymmetries between this copy and production, and removing EITHER one alone crosses the
  // threshold:
  //
  //   as shipped                                                            98
  //   the trailing comma on `rollDecision = null,` below, normalised       133
  //   `this._game.user` in `resolveBulkCheckDecision` written `game.user`  152
  //   both                                                                 187
  //
  // (133 is the NORMALISED adjacency figure: 98 plus the 35-token destructuring head that
  // joins the two runs once the comma stops separating them.)
  //
  // The live risk is therefore not someone rewriting this file. It is a Prettier SCOPE
  // change. `.prettierrc.json` is `printWidth: 100` with `trailingComma: 'es5'`, and
  // `src/main.js` is currently OUTSIDE the `format`/`format:check` globs in `package.json`.
  // Bringing it inside them wraps production's ~165-character `rollActorCheck` signature into
  // the same multi-line destructuring head this copy uses AND adds the trailing comma —
  // mechanically producing a run of at least 134 tokens. `AGENTS.md` already contemplates
  // widening those globs and warns that reformatting counts as NEW code, so that PR would
  // inherit a >100-token duplicated block it did not write. Whoever widens the globs owns
  // splitting this run, and the cheapest split is the one already used for the gate keys:
  // hoist the shared shape out of both files rather than paraphrasing either.
  //
  // MEASURE AT YOUR OWN MERGE BASE; DO NOT QUOTE THIS COMMENT'S PREDECESSOR, OR ANY OTHER
  // CHANGE'S PROSE, AS A BASELINE. What stood here was a snapshot — "a whole-repo sweep at a
  // 100-token floor finds exactly one >=100 run anywhere in the tree" — and it was false when
  // it was written: `tests/companion-facade.test.js:926` records a 139-token grant-delegator
  // run, and it landed in the SAME commit. Three consecutive changes then reasoned from it.
  //
  // The durable facts are about METHOD, not magnitude. The tree carries many runs at this
  // floor, and the pairwise `src/main.js` <-> this-file scope carries several delegator runs of
  // its own, because that is what a hand-maintained mirror IS. So a change that touches these
  // copies runs the sweep itself, at BOTH scopes, at its own merge base AND at its tip, and is
  // judged on the DELTA — SonarCloud gates new-code duplication, not a tree with pre-existing
  // runs. Record the full enumerations in the change's own deviations, never here: a fresh set
  // of numbers in this comment block would only mint the next false record.
  //
  // The mitigation, when a delta does appear, is always the same one: hoist the shared shape
  // out of BOTH files — as the gate-key constants and the two seam bags already are — and
  // never paraphrase either copy to break a run, because a paraphrase makes the fidelity claim
  // this mirror rests on false.
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

  // --- Faithful copy of Fabricate#resolveBulkCheckDecision (issue 1293) ------
  //
  // GM-gated INLINE rather than through `_requireGmActor`, because this member takes no
  // `actorId`: `_resolveCraftingActor(null)` returns `null`, so the shared preamble would
  // always answer `noActor` for a member that reads no actor and can never emit one.
  async resolveBulkCheckDecision({ callSite = null, formulas = null } = {}) {
    const gmOnly = this._game.user?.isGM !== true ? COMPANION_OUTCOMES.gmOnly : null;
    if (gmOnly || this.ready !== true) {
      return bulkCheckDecisionResult(gmOnly ?? COMPANION_OUTCOMES.notReady);
    }
    return await resolveStandaloneBulkCheckDecision(
      { callSite, formulas },
      this._companionCheckSeams()
    );
  }

  // --- Faithful copy of Fabricate#awardComponents (issue 1301) ---------------
  //
  // The delegator only: the award itself is the REAL free function, so what this copy
  // reproduces is exactly the part that lives in `src/main.js` — the shared preamble with this
  // member's OWN hoisted keys, the single readiness guard, and the resolved actor passed
  // through as the leaf's FIRST argument, which is what makes a caller-supplied `actor` in the
  // request structurally unable to reach a seam.
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

  // --- Faithful copy of Fabricate#consumePooledHoldings (issue 1342) ---------
  //
  // The delegator only: the take itself is the REAL leaf, which owns the call-site gate, the
  // election, the `costs` validation, the components-first ordering and the rollback.
  //
  // Sited HERE, after `awardComponents` and well away from the read above, because production
  // sites it here for the measured duplicated-run reason recorded on `rollActorCheck` — the two
  // pooled delegators are near-identical, so adjacency would concatenate them into one run
  // across this file and `src/main.js` that neither member reaches alone.
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

  // --- Faithful copy of Fabricate#_gateBulkTargets (issue 859) ---------------
  //
  // There is deliberately NO `?? this.getSelectedCraftingActorId()` tail here, unlike
  // `_resolveCraftingSources` above. A bulk run may span actors, so a persisted-selection
  // fallback would silently RETARGET a row whose own actor did not resolve onto whichever
  // actor the player last selected — salvaging or destroying the wrong character's items
  // with no error anywhere. `tests/fabricate-facade-bulk-owner-gate.test.js` pins that
  // absence against the real source.
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

  // --- Faithful copy of Fabricate#_buildNotPermittedRow ----------------------
  // The component lookup uses the REAL `definitionIndex` helpers, exactly as production
  // does (issue 1202). Keeping a raw `.find(` scan here would have been behaviourally
  // identical for unique ids and so invisible, which is precisely why
  // `fabricate-facade-bulk-owner-gate.test.js` now pins both texts: a copy that claims
  // fidelity has to be checkable, not merely asserted in a comment.
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

  // --- Faithful copy of Fabricate#salvageComponents --------------------------
  //
  // `onProgress` is accepted and FORWARDED, exactly as the real facade does. A mirror
  // that quietly dropped it would report a frozen `0 of N` here while the real facade
  // ticked — and, worse, would let a test assert progress behaviour that the copy was
  // supplying rather than the code under test.
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
 *
 * @param {Array<{ system: object, recipes: object[] }>} entries
 * @returns {{ craftingSystemManager: object, recipeManager: object }}
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
 * Stand up the facade under test with the REAL `AlchemyListingBuilder` wired to
 * the supplied managers, plus a spy crafting engine whose `craftAlchemy` calls
 * are recorded so a test can assert the submit path never reaches the engine for
 * a non-owner (no mutation).
 *
 * @param {object} options
 * @param {object} options.user Current `game.user` (`{ id, isGM }`).
 * @param {Array<object>} options.actors Mock actors (see {@link makeFacadeActor}).
 * @param {Array<{ system: object, recipes: object[] }>} [options.systems] Alchemy fixtures.
 * @param {object} [options.recipeVisibility] Optional reveal collaborator (defaults to learned-map/GM-all).
 * @param {(result: object) => object} [options.craftAlchemyResult] Value the spy engine returns on a resolved brew.
 * @param {string|null} [options.selectedCraftingActorId] Persisted selection.
 * @param {string[]} [options.componentSourceActorIds] Persisted component sources.
 * @param {boolean} [options.ready] `Fabricate.ready` flag (defaults true).
 * @returns {{
 *   facade: FabricateFacadeUnderTest,
 *   game: object,
 *   setCurrentUser: (user: object) => void,
 *   craftAlchemyCalls: Array<object>,
 * }}
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
