/**
 * `CraftingSystemManager.deleteRecipes` — the batched recipe delete and the cascade every
 * GM-initiated recipe deletion routes through (issue 1132).
 *
 * Both managers are REAL here and so is the settings store: `save()` is NOT replaced by a
 * counter, because three of the claims under test are about what is PERSISTED (the pruned
 * membership array, the untouched basis marker, and the in-memory map still agreeing with
 * the world setting after a refused write). Writes are counted at the `game.settings.set`
 * seam instead, which is also the only object in this suite capable of saying no — every
 * other persistence fake in the repo is omnipotent, which is exactly what makes "the write
 * was refused" a structurally invisible defect class.
 *
 * The recipe-visibility service is real too, so the actor-flag pass genuinely walks
 * `selectWritableActors(game.actors)` and issues real `-=` deletions through `Actor#update`.
 * "Mutates no actor flags" is therefore asserted against recorded updates, not against a
 * recorder standing in for the pass.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { installFoundryEnv } from './helpers/foundryEnv.js';
import { describeRecipeDeleteImpact } from '../src/utils/recipeDeleteImpact.js';

installFoundryEnv();

const { SETTING_KEYS } = await import('../src/config/settings.js');
const { Recipe } = await import('../src/models/Recipe.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { RecipeVisibilityService } = await import('../src/systems/RecipeVisibilityService.js');

const SYSTEM_ID = 'sys1';
const hookCalls = [];

// `createRecipe`/`updateRecipe` log a debug line per recipe; the batch would drown the
// reporter.
console.debug = () => {};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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
  env.settings.set(SETTING_KEYS.CRAFTING_SYSTEMS, [...manager.systems.values()]);

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
      recipeItemsPruned: 2,
      learnersAffected: 2,
    });
    assert.equal(fixture.writesOf(SETTING_KEYS.RECIPES), 1, 'one `recipes` write');
    assert.equal(fixture.writesOf(SETTING_KEYS.CRAFTING_SYSTEMS), 1, 'one `craftingSystems` write');
    assert.equal(fixture.flagPasses(), 1, 'one actor-flag pass');

    // BOTH signals. `deleteComponents` and `deleteEssences` each rewrite recipes and emit
    // only the systems one; on the writing client `reload()` returns false, so the
    // `updateSetting` bridge re-emits nothing locally and the missing hook leaves the
    // acting GM's own other windows stale.
    assert.equal(hooksNamed('fabricate.craftingSystemsChanged').length, 1);
    const recipesChanged = hooksNamed('fabricate.recipesChanged');
    assert.equal(recipesChanged.length, 1);
    assert.deepEqual(
      recipesChanged[0].payload.recipeIds,
      ['r1', 'r2'],
      'the singular `{recipeId}` payload shape carries the id SET here'
    );
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
    assert.equal(result.recipeItemsPruned, 0);
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
    // The one non-trivial marker case. `_normalizeSystem` INFERS the marker as
    // `persisted === true || some(def.recipeIds.length > 0)`, so after this prune the
    // inference yields FALSE and only the persisted `true` carries the basis forward.
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
    // `recipeItemsPruned === 0` is a THEOREM of the marker inference and holds for any
    // implementation — including one with no basis awareness at all. The load-bearing
    // claim is the other half: the STATED count is still the number of recipe items that
    // will no longer contain them, because membership dies with the recipe.
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
    assert.equal(result.recipeItemsPruned, 0, 'and no definition is rewritten');
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
    assert.equal(result.recipeItemsPruned, 1);
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
    assert.equal(fixture.flagPasses(), 1, 'one actor-flag pass for the whole set');

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
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const source = (relative) => readFileSync(resolve(__dirname, relative), 'utf8');

  it("exempts the compendium importer's ORPHAN-PRUNE PHASE, and only that phase", () => {
    // The pack owns the whole definition set it just wrote in phase 3, and the prune
    // deliberately batches to a single `recipes` write, which a per-delete
    // `craftingSystems` write would break. An overwrite import that changes resolution
    // mode still reaches the cascade transitively and correctly, through
    // `updateSystem` → `_migrateRecipesForModeChange`.
    const importer = source('../src/systems/CompendiumImporter.js');
    assert.ok(
      /_pruneOrphanedRecipes[\s\S]*?this\._recipeManager\.deleteRecipe\(/.test(importer),
      'the prune phase still calls the non-cascading leaf'
    );
    assert.ok(
      !importer.includes('deleteRecipes('),
      'and nothing in the importer routes through the cascading set form'
    );
  });

  it('records on the leaf that it does NOT cascade, and names the entry point that does', () => {
    const recipeManager = source('../src/systems/RecipeManager.js');
    assert.ok(
      /This is the LEAF, and it does NOT cascade[\s\S]{0,900}deleteRecipes/.test(recipeManager),
      'RecipeManager.deleteRecipe carries the non-cascading note'
    );
  });
});
