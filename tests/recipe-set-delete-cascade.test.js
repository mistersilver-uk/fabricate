/**
 * `CraftingSystemManager.deleteRecipes` — the batched recipe delete and the cascade every
 * GM-initiated recipe deletion routes through (issue 1132).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { installFoundryEnv } from './helpers/foundryEnv.js';
import { defineStructureContract } from './helpers/structureContract.js';
import { describeRecipeDeleteImpact } from '../src/utils/recipeDeleteImpact.js';

installFoundryEnv();

const { SETTING_KEYS } = await import('../src/config/settings.js');
const { Recipe } = await import('../src/models/Recipe.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { RecipeVisibilityService } = await import('../src/systems/RecipeVisibilityService.js');
const { CompendiumImporter } = await import('../src/systems/CompendiumImporter.js');

const SYSTEM_ID = 'sys1';
const hookCalls = [];

// `createRecipe`/`updateRecipe` log a debug line per recipe; the batch would drown the reporter.
console.debug = () => {};

// Fixtures

function recipeData(id, overrides = {}) {
  return {
    id,
    name: `Recipe ${id}`,
    craftingSystemId: SYSTEM_ID,
    category: 'general',
    enabled: false,
    locked: false,
    ingredientSets: [
      {
        id: `${id}-set`,
        ingredientGroups: [
          { id: `${id}-grp`, name: 'Ingredients', options: [{ componentId: 'comp-a', quantity: 1 }] },
        ],
        essences: {},
      },
    ],
    resultGroups: [
      { id: `${id}-rg`, results: [{ id: `${id}-res`, itemUuid: 'Item.result', quantity: 1 }] },
    ],
    ...overrides,
  };
}

/** Two ingredient sets — the shape `routed → simple` cannot migrate, so it is deleted. */
function multiSetRecipeData(id, overrides = {}) {
  const base = recipeData(id, overrides);
  return {
    ...base,
    ingredientSets: [...base.ingredientSets, { id: `${id}-set-2`, ingredientGroups: [], essences: {} }],
  };
}

function bookDefinition(id, recipeIds = []) {
  return {
    id,
    name: `Book ${id}`,
    img: `icons/${id}.webp`,
    originItemUuid: `Item.${id}`,
    recipeIds,
    caps: { item: {}, learn: {} },
  };
}

function systemData({ definitions = [bookDefinition('book-a'), bookDefinition('book-b')], marker = true, resolutionMode = 'simple' } = {}) {
  const system = {
    id: SYSTEM_ID,
    name: 'Arcana',
    resolutionMode,
    items: [{ id: 'comp-a', name: 'Aqua Vitae', tags: [] }],
    recipeItemDefinitions: definitions,
  };
  if (marker) system.membershipResolvesByRecipeIds = true;
  return system;
}

/**
 * An actor carrying learned knowledge at the doubly-nested path every writer persists it
 * at, whose `update` applies the `-=` key deletions the real cleanup issues and records
 * every call — so "no actor flags were mutated" is a recorded fact rather than an absence
 * a stub could not have shown either way.
 */
function learnerActor(id, learnedIds, { isOwner = true } = {}) {
  const learned = Object.fromEntries(learnedIds.map((rid) => [rid, { learnedAt: 1 }]));
  const updates = [];
  return {
    id,
    isOwner,
    updates,
    learned,
    getFlag: (scope, key) =>
      scope === 'fabricate' && key === 'fabricate.learnedRecipes' ? learned : undefined,
    async update(data) {
      updates.push(data);
      for (const key of Object.keys(data || {})) {
        const match = /learnedRecipes\.-=(.+)$/.exec(key);
        if (match) delete learned[match[1]];
      }
      return this;
    },
  };
}

function makeFixture({
  recipes = [recipeData('r1'), recipeData('r2'), recipeData('r3')],
  system = systemData(),
  actors = [],
  canModifySettings = true,
} = {}) {
  hookCalls.length = 0;
  const env = installFoundryEnv({ actors, canModifySettings });
  // THE SETTINGS SEAM TAKES A SNAPSHOT, WHICH IS WHAT MAKES "PERSISTED" MEAN ANYTHING HERE (issue
  // 1132).
  const realSet = globalThis.game.settings.set.bind(globalThis.game.settings);
  globalThis.game.settings.set = (namespace, key, value) =>
    realSet(namespace, key, value === undefined ? value : JSON.parse(JSON.stringify(value)));
  globalThis.Hooks = {
    callAll: (name, payload) => {
      hookCalls.push({ name, payload });
    },
  };

  const recipeManager = new RecipeManager();
  recipeManager.initialized = true;
  for (const data of recipes) recipeManager.recipes.set(data.id, new Recipe(data));
  // Seed the world settings directly so the persisted state matches the in-memory state
  // before the first write — a refusing client can never write its own seed.
  env.settings.set(
    SETTING_KEYS.RECIPES,
    [...recipeManager.recipes.values()].map((recipe) => recipe.toJSON())
  );

  const manager = new CraftingSystemManager(recipeManager);
  manager.systems.set(SYSTEM_ID, manager._normalizeSystem(system));
  manager.initialized = true;
  // Round-tripped through JSON the way the recipes seed above already is via `toJSON()` —
  // `env.settings` is a bare `Map`, so seeding the LIVE system objects directly would let a
  // reader that walks the "persisted" array see `_deleteRecipeSet`'s in-memory mutations
  // whether or not `save()` had actually run, which is exactly the hole this fixture exists
  // to close (issue 1132, review round 2).
  env.settings.set(
    SETTING_KEYS.CRAFTING_SYSTEMS,
    JSON.parse(JSON.stringify([...manager.systems.values()]))
  );

  const visibility = new RecipeVisibilityService(recipeManager, manager);
  let flagPasses = 0;
  const realCleanup = visibility.cleanupLearnedRecipes.bind(visibility);
  visibility.cleanupLearnedRecipes = async (validRecipeIds) => {
    flagPasses += 1;
    return await realCleanup(validRecipeIds);
  };

  globalThis.game.fabricate = {
    getCraftingSystemManager: () => manager,
    getRecipeVisibilityService: () => visibility,
  };

  return {
    env,
    manager,
    recipeManager,
    actors,
    flagPasses: () => flagPasses,
    writesOf: (key) => env.writes.filter((write) => write.key === key).length,
    persistedRecipeIds: () =>
      (env.settings.get(SETTING_KEYS.RECIPES) || []).map((recipe) => recipe.id),
    persistedSystem: () =>
      (env.settings.get(SETTING_KEYS.CRAFTING_SYSTEMS) || []).find((row) => row.id === SYSTEM_ID),
  };
}

function hooksNamed(name) {
  return hookCalls.filter((call) => call.name === name);
}

function persistedMembership(fixture, definitionId) {
  return fixture
    .persistedSystem()
    .recipeItemDefinitions.find((definition) => definition.id === definitionId).recipeIds;
}

// ---------------------------------------------------------------------------

describe('CraftingSystemManager.deleteRecipes — the bounded write', () => {
  it('issues ONE write of each setting, ONE flag pass and BOTH change hooks', async () => {
    const fixture = makeFixture({
      system: systemData({
        definitions: [bookDefinition('book-a', ['r1', 'r2', 'r3']), bookDefinition('book-b', ['r2'])],
      }),
      actors: [learnerActor('a1', ['r1']), learnerActor('a2', ['r1', 'r2'])],
    });

    const result = await fixture.manager.deleteRecipes(SYSTEM_ID, ['r1', 'r2']);

    assert.deepEqual(result, {
      deleted: 2,
      recipeIds: ['r1', 'r2'],
      // BOTH recipe-item numbers, because they answer different questions and the GM was
      // promised the first. Here they agree; `the membership prune` suite below is where
      // they are pinned apart.
      recipeItemsAffected: 2,
      recipeItemsRewritten: 2,
      learnersAffected: 2,
    });
    assert.equal(fixture.writesOf(SETTING_KEYS.RECIPES), 1, 'one `recipes` write');
    assert.equal(fixture.writesOf(SETTING_KEYS.CRAFTING_SYSTEMS), 1, 'one `craftingSystems` write');
    // ONE LEARNED-RECIPES pass, which is what this counter measures.
    assert.equal(fixture.flagPasses(), 1, 'one learned-recipes flag pass for the whole set');

    // BOTH signals. `deleteComponents` and `deleteEssences` each rewrite recipes and emit only the
    // systems one; on the writing client `reload()` returns false, so the `updateSetting` bridge
    // re-emits nothing locally and the missing hook leaves the acting GM's own other windows stale.
    assert.equal(hooksNamed('fabricate.craftingSystemsChanged').length, 1);
    const recipesChanged = hooksNamed('fabricate.recipesChanged');
    assert.equal(recipesChanged.length, 1);
    assert.deepEqual(
      recipesChanged[0].payload.recipeIds,
      ['r1', 'r2'],
      'the singular `{recipeId}` payload shape carries the id SET here'
    );
    assert.equal(
      Object.hasOwn(recipesChanged[0].payload, 'recipeId'),
      false,
      'and a SET carries no singular key, which would name one of two arbitrarily'
    );
  });

  // The same hook is still emitted with a singular `{recipeId}` by `RecipeManager.deleteRecipe`,
  // which stays live for `deleteSystem` and the compendium importer.
  it('carries BOTH payload keys for a one-recipe set, so the shape is not path-dependent', async () => {
    const fixture = makeFixture({
      system: systemData({ definitions: [bookDefinition('book-a', ['r1'])] }),
    });

    await fixture.manager.deleteRecipes(SYSTEM_ID, ['r1']);

    const [changed] = hooksNamed('fabricate.recipesChanged');
    assert.deepEqual(changed.payload.recipeIds, ['r1']);
    assert.equal(changed.payload.recipeId, 'r1', 'the singular key the leaf delete emits');
    assert.equal(changed.payload.action, 'delete');
  });

  it('holds those counts at any set size', async () => {
    const fixture = makeFixture({
      system: systemData({ definitions: [bookDefinition('book-a', ['r1', 'r2', 'r3'])] }),
    });

    await fixture.manager.deleteRecipes(SYSTEM_ID, ['r1', 'r2', 'r3']);

    assert.equal(fixture.writesOf(SETTING_KEYS.RECIPES), 1);
    assert.equal(fixture.writesOf(SETTING_KEYS.CRAFTING_SYSTEMS), 1);
    assert.equal(fixture.flagPasses(), 1);
    assert.deepEqual(fixture.persistedRecipeIds(), []);
  });

  it('raises the singular notification for a one-recipe set', async () => {
    const fixture = makeFixture();
    await fixture.manager.deleteRecipes(SYSTEM_ID, ['r1']);
    assert.deepEqual(fixture.env.notifications, ['Recipe "Recipe r1" deleted']);
  });

  it('skips an id that resolves to no recipe rather than throwing', async () => {
    const fixture = makeFixture();
    const result = await fixture.manager.deleteRecipes(SYSTEM_ID, ['r1', 'ghost']);
    assert.equal(result.deleted, 1);
    assert.deepEqual(result.recipeIds, ['r1']);
  });

  it('writes nothing at all when no id resolves', async () => {
    const fixture = makeFixture();
    const result = await fixture.manager.deleteRecipes(SYSTEM_ID, ['ghost']);
    assert.equal(result.deleted, 0);
    assert.equal(fixture.env.writes.length, 0);
    assert.equal(fixture.flagPasses(), 0);
  });

  it('deletes an orphan whose crafting system no longer resolves, and prunes nothing', async () => {
    // `game.fabricate.deleteRecipe` derives the system id from the recipe, so a dangling
    // `craftingSystemId` must not make the orphan undeletable.
    const fixture = makeFixture();
    const result = await fixture.manager.deleteRecipes('no-such-system', ['r1']);
    assert.equal(result.deleted, 1);
    assert.equal(result.recipeItemsAffected, 0);
    assert.equal(result.recipeItemsRewritten, 0);
    assert.equal(fixture.writesOf(SETTING_KEYS.CRAFTING_SYSTEMS), 0);
  });

  it('requires a GM', async () => {
    const fixture = makeFixture();
    game.user.isGM = false;
    await assert.rejects(
      () => fixture.manager.deleteRecipes(SYSTEM_ID, ['r1']),
      /GM permissions required/
    );
    assert.equal(fixture.env.writes.length, 0);
    game.user.isGM = true;
  });
});

describe('CraftingSystemManager.deleteRecipes — the membership prune', () => {
  it('removes the id from every definition that contained it, on the PERSISTED array', async () => {
    const fixture = makeFixture({
      system: systemData({
        definitions: [
          bookDefinition('book-a', ['r1', 'r2', 'r3']),
          bookDefinition('book-b', ['r2']),
        ],
      }),
    });

    await fixture.manager.deleteRecipes(SYSTEM_ID, ['r1', 'r2']);

    assert.deepEqual(persistedMembership(fixture, 'book-a'), ['r3']);
    assert.deepEqual(persistedMembership(fixture, 'book-b'), []);
  });

  it('leaves the basis marker exactly as it found it — including when the prune empties the last array', async () => {
    // The one non-trivial marker case.
    const fixture = makeFixture({
      system: systemData({ definitions: [bookDefinition('book-a', ['r1']), bookDefinition('book-b')] }),
    });

    await fixture.manager.deleteRecipes(SYSTEM_ID, ['r1']);

    const system = fixture.manager.getSystem(SYSTEM_ID);
    assert.deepEqual(
      system.recipeItemDefinitions.map((definition) => definition.recipeIds),
      [[], []],
      'the fixture shape is pinned: no non-empty array survives, so the inference would say false'
    );
    assert.equal(system.membershipResolvesByRecipeIds, true, 'the normalized in-memory marker');
    assert.equal(fixture.persistedSystem().membershipResolvesByRecipeIds, true, 'and the persisted one');
  });

  it('does not FLIP a legacy-basis system, and rewrites nothing there', async () => {
    // A legacy-basis system is by construction one where every `recipeIds` is empty, so
    // `recipeItemsRewritten === 0` is a THEOREM of the marker inference and holds for any
    // implementation — including one with no basis awareness at all.
    const recipes = [recipeData('r1', { recipeItemId: 'book-a' }), recipeData('r2')];
    const fixture = makeFixture({
      recipes,
      system: systemData({ marker: false }),
    });
    assert.notEqual(
      fixture.manager.getSystem(SYSTEM_ID).membershipResolvesByRecipeIds,
      true,
      'the fixture really is legacy-basis'
    );

    const stated = describeRecipeDeleteImpact(['r1'], {
      recipes,
      recipeItemDefinitions: fixture.manager.getSystem(SYSTEM_ID).recipeItemDefinitions,
      membershipResolvesByRecipeIds: false,
    });
    const result = await fixture.manager.deleteRecipes(SYSTEM_ID, ['r1']);

    assert.equal(stated.recipeItemsAffected, 1, 'the book does stop containing it');
    assert.equal(result.recipeItemsRewritten, 0, 'and no definition is rewritten');
    // THE NUMBER THE GM IS SHOWN, RETURNED BY THE WRITE (issue 1132).
    assert.equal(
      result.recipeItemsAffected,
      stated.recipeItemsAffected,
      'the write returns the STATED figure beside the rewritten one, so the toast can read it'
    );
    assert.equal(fixture.writesOf(SETTING_KEYS.CRAFTING_SYSTEMS), 0);
    assert.equal(hooksNamed('fabricate.craftingSystemsChanged').length, 0);
    assert.notEqual(
      fixture.manager.getSystem(SYSTEM_ID).membershipResolvesByRecipeIds,
      true,
      'an unauthored, irreversible basis flip is not an acceptable side effect of a delete'
    );
  });

  it('states and performs the same number on a modern-basis system', async () => {
    const recipes = [recipeData('r1'), recipeData('r2'), recipeData('r3')];
    const definitions = [bookDefinition('book-a', ['r1', 'r2']), bookDefinition('book-b', ['r3'])];
    const fixture = makeFixture({ recipes, system: systemData({ definitions }) });

    const stated = describeRecipeDeleteImpact(['r1', 'r2'], {
      recipes,
      recipeItemDefinitions: fixture.manager.getSystem(SYSTEM_ID).recipeItemDefinitions,
      membershipResolvesByRecipeIds: true,
    });
    const result = await fixture.manager.deleteRecipes(SYSTEM_ID, ['r1', 'r2']);

    assert.equal(stated.recipeItemsAffected, 1, 'two recipes in one book is ONE book');
    assert.equal(result.recipeItemsRewritten, 1);
    assert.equal(result.recipeItemsAffected, 1, 'and the two agree on a modern-basis system');
  });
});

describe('CraftingSystemManager.deleteRecipes — a refused world write', () => {
  it('mutates no actor flags, keeps the recipes, and leaves the map agreeing with the setting', async () => {
    const actors = [learnerActor('a1', ['r1']), learnerActor('a2', ['r2'])];
    const fixture = makeFixture({
      system: systemData({ definitions: [bookDefinition('book-a', ['r1', 'r2'])] }),
      actors,
      canModifySettings: false,
    });

    // The reachable configuration: the client-side gate passes and the SERVER refuses.
    assert.equal(game.user.isGM, true);

    await assert.rejects(
      () => fixture.manager.deleteRecipes(SYSTEM_ID, ['r1', 'r2']),
      /lacks permission to update Setting/,
      'the refusal is not swallowed'
    );

    assert.deepEqual(fixture.env.refused, [SETTING_KEYS.RECIPES], 'it failed at the FIRST write');
    assert.equal(fixture.flagPasses(), 0, 'no actor-flag pass ran');
    for (const actor of actors) {
      assert.equal(actor.updates.length, 0, `${actor.id} was not written to`);
    }
    assert.deepEqual(
      fixture.recipeManager.getRecipes({}).map((recipe) => recipe.id),
      ['r1', 'r2', 'r3'],
      'getRecipes() still returns the recipes'
    );
    // THE MAP GUARD. `deleteRecipe` deletes from `this.recipes` before it persists, so
    // without the restore the map would have lost recipes the world setting still holds —
    // and the next unrelated successful `save()` would persist a deletion that failed.
    assert.deepEqual(
      fixture.recipeManager.getRecipes({}).map((recipe) => recipe.id),
      fixture.persistedRecipeIds(),
      'the in-memory map agrees with the persisted setting'
    );
    assert.deepEqual(
      persistedMembership(fixture, 'book-a'),
      ['r1', 'r2'],
      'and no membership was rewritten'
    );
    assert.equal(hookCalls.length, 0, 'nothing was announced');
  });
});

describe('the resolution-mode migration calls the SET form once', () => {
  it('issues one `recipes` write, one `craftingSystems` write after it, one flag pass and one terminal systems emission', async () => {
    const fixture = makeFixture({
      recipes: [multiSetRecipeData('doomed-1'), multiSetRecipeData('doomed-2')],
      system: systemData({
        resolutionMode: 'routed',
        definitions: [bookDefinition('book-a', ['doomed-1', 'doomed-2'])],
      }),
      actors: [learnerActor('a1', ['doomed-1'])],
    });

    await fixture.manager.updateSystem(SYSTEM_ID, { resolutionMode: 'simple' });

    assert.deepEqual(fixture.persistedRecipeIds(), [], 'both un-migratable recipes went');
    assert.equal(fixture.writesOf(SETTING_KEYS.RECIPES), 1, 'one `recipes` write for the whole set');
    assert.equal(fixture.flagPasses(), 1, 'one learned-recipes flag pass for the whole set');

    // `updateSystem` persists the merged system BEFORE the migration runs, so the claim is
    // about the writes the DELETE adds: exactly one, after the recipes write.
    const recipesWriteAt = fixture.env.writes.findIndex(
      (write) => write.key === SETTING_KEYS.RECIPES
    );
    const systemWritesAfter = fixture.env.writes
      .slice(recipesWriteAt)
      .filter((write) => write.key === SETTING_KEYS.CRAFTING_SYSTEMS).length;
    assert.equal(systemWritesAfter, 1);

    // The half-migrated-system fault: routing the loop through a cascading singular would
    // publish the system once per un-migratable recipe.
    assert.equal(
      hooksNamed('fabricate.craftingSystemsChanged').length,
      1,
      "only `updateSystem`'s terminal emission"
    );
    assert.equal(
      hooksNamed('fabricate.recipesChanged').length,
      1,
      "only the migration's own aggregate"
    );
    assert.equal(hooksNamed('fabricate.recipesChanged')[0].payload.action, 'mode-change');

    // The prune mutated the LIVE `merged` system, so `updateSystem`'s later saves carried
    // it rather than clobbering it.
    assert.deepEqual(persistedMembership(fixture, 'book-a'), []);
  });
});

describe('the routed callers', () => {
  // The pack owns the whole definition set it just wrote in phase 3, and the prune deliberately
  // batches to a single `recipes` write, which a per-delete `craftingSystems` write would break.
  it("exempts the compendium importer's ORPHAN-PRUNE PHASE, which calls the leaf", async () => {
    const deleted = [];
    const recipeManager = {
      getRecipes: () => [
        { id: 'kept', importSource: { systemId: 'pack-sys' } },
        { id: 'orphan', importSource: { systemId: 'pack-sys' } },
        { id: 'foreign', importSource: { systemId: 'other-pack' } },
      ],
      deleteRecipe: async (id, options) => deleted.push([id, options]),
    };
    const summary = { recipes: { pruned: 0 }, orphans: [] };
    await CompendiumImporter.prototype._pruneOrphanedRecipes.call(
      { _recipeManager: recipeManager },
      { id: SYSTEM_ID },
      [{ id: 'kept' }],
      'pack-sys',
      summary
    );
    assert.deepEqual(deleted, [
      ['orphan', { notify: false, emitChange: false, persist: false, cleanupFlags: false }],
    ]);
    assert.equal(summary.recipes.pruned, 1);
  });

  defineStructureContract(
    'and nothing in the importer routes through the cascading set form',
    'src/systems/CompendiumImporter.js',
    { callsNo: ['deleteRecipes'] }
  );

  it('keeps the leaf non-cascading: the membership prune belongs to the set form', async () => {
    const fixture = makeFixture({
      system: systemData({ definitions: [bookDefinition('book-a', ['r1', 'r2'])] }),
    });
    await fixture.recipeManager.deleteRecipe('r1', { notify: false });
    assert.deepEqual(fixture.persistedRecipeIds(), ['r2', 'r3'], 'the leaf deletes the recipe');
    assert.deepEqual(persistedMembership(fixture, 'book-a'), ['r1', 'r2'], 'but prunes nothing');
    assert.equal(fixture.writesOf(SETTING_KEYS.CRAFTING_SYSTEMS), 0, 'nor writes the systems');
  });
});
