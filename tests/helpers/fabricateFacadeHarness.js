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

import { isGatheringActorSelectableByUser } from '../../src/config/preferencesCleanup.js';
import { AlchemyListingBuilder } from '../../src/systems/AlchemyListingBuilder.js';
import { resolveAlchemySubmissions } from '../../src/utils/alchemySubmissions.js';
import { findById, getDefinitionIndex } from '../../src/utils/definitionIndex.js';

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
 * The body of ONE `src/main.js` method, BOUNDED at its own closing brace.
 *
 * Bounding is the point. The alchemy suite's `MAIN_SOURCE.slice(indexOf(...))` runs to
 * the end of the file, which is harmless for a "must CONTAIN" assertion and permanently
 * red for a "must NOT contain" one — every helper the rest of the class legitimately
 * uses is inside an unbounded slice. Single-sourcing the strategy here is also what
 * stops the unbounded form being the pattern the next author copies.
 *
 * The bound is the first line that is exactly two-space-indented `}`, which is a class
 * member's closing brace in this file's formatting. Every deeper brace is indented
 * further, so a nested arrow, object literal or `try` block cannot end the slice early.
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
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`main.js declares no \`${signature}\``);
  const end = source.indexOf('\n  }\n', start);
  if (end < 0) throw new Error(`\`${signature}\` has no member-level closing brace`);
  return source.slice(start, end + '\n  }'.length);
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
  constructor({
    alchemyListingBuilder,
    craftingEngine,
    craftingSystemManager,
    ready,
    bulkSalvageService = null,
    bulkDestroyService = null,
  }) {
    this._alchemyListingBuilder = alchemyListingBuilder;
    this.craftingEngine = craftingEngine;
    this.craftingSystemManager = craftingSystemManager;
    this.ready = ready;
    // Injected rather than lazily built: `_getBulkSalvageService` / `_getBulkDestroyService`
    // exist only to wire Foundry collaborators, which this harness has none of. The gate,
    // the merge and the refusal row — the parts with behaviour worth pinning — are copied
    // faithfully below.
    this._bulkSalvageService = bulkSalvageService;
    this._bulkDestroyService = bulkDestroyService;
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
    const component = findById(getDefinitionIndex(system?.components), target?.componentId);
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
