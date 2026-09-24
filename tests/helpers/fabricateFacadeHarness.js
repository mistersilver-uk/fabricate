/**
 * fabricateFacadeHarness — stands the REAL `Fabricate` class from `src/bootstrap/Fabricate.js` up
 * over a mock `game`/`user`/`actors`, so tests drive production's viewer -> actor resolution and
 * owner-gated members and assert OWNER vs NON-OWNER vs GM behaviour directly (issues 569, 1933).
 */

import { randomUUID } from 'node:crypto';

import { Fabricate } from '../../src/bootstrap/Fabricate.js';
import { AlchemyListingBuilder } from '../../src/ui/presenters/AlchemyListingBuilder.js';

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

/** Each injectable seam bag and the production member it replaces on the instance. */
const SEAM_BAG_MEMBERS = Object.freeze({
  companionCheckSeams: '_companionCheckSeams',
  componentAwardSeams: '_componentAwardSeams',
  pooledHoldingsSeams: '_pooledHoldingsSeams',
  pooledConsumptionSeams: '_pooledConsumptionSeams',
});

/**
 * The real `Fabricate`, its collaborators assigned as `composeFabricateServices` would. A supplied
 * seam bag replaces that one production bag on the instance, because the real bags reach `fromUuid`,
 * the live managers and `game.users`; an omitted bag leaves production's own in place.
 */
export class FabricateFacadeUnderTest extends Fabricate {
  constructor({
    alchemyListingBuilder = null,
    bulkSalvageService = null,
    bulkDestroyService = null,
    ...collaborators
  } = {}) {
    super();
    for (const [option, member] of Object.entries(SEAM_BAG_MEMBERS)) {
      const bag = collaborators[option];
      delete collaborators[option];
      if (bag) this[member] = () => bag;
    }
    Object.assign(this, { ready: false, ...collaborators });
    this._alchemyListingBuilder = alchemyListingBuilder;
    this._bulkSalvageService = bulkSalvageService;
    this._bulkDestroyService = bulkDestroyService;
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
