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

import { isGatheringActorSelectableByUser } from '../../src/config/preferencesCleanup.js';
import { AlchemyListingBuilder } from '../../src/systems/AlchemyListingBuilder.js';
import { resolveAlchemySubmissions } from '../../src/utils/alchemySubmissions.js';

/** Minimal `foundry.utils` shim the builder's flag reads use at call time. */
function installFoundryShim() {
  globalThis.foundry = globalThis.foundry ?? {
    utils: {
      randomID: () => `id-${Math.random().toString(36).slice(2)}`,
      getProperty: (object, path) =>
        String(path || '')
          .split('.')
          .reduce((value, key) => (value == null ? undefined : value[key]), object),
    },
  };
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
 * @returns {{ game: object, setCurrentUser: (user: object) => void }}
 */
export function installFacadeGame({
  user,
  actors = [],
  selectedCraftingActorId = null,
  componentSourceActorIds = [],
}) {
  installFoundryShim();
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
class FabricateFacadeUnderTest {
  constructor({ alchemyListingBuilder, craftingEngine, craftingSystemManager, ready }) {
    this._alchemyListingBuilder = alchemyListingBuilder;
    this.craftingEngine = craftingEngine;
    this.craftingSystemManager = craftingSystemManager;
    this.ready = ready;
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
  });
  return { facade, game, setCurrentUser, craftAlchemyCalls };
}
