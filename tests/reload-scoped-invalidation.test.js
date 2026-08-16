/**
 * Scoped reload invalidation and container identity (issue 1078 part A, under #1070).
 *
 * ## What was broken, and why it did not look broken
 *
 * A world setting replicates as ONE `Setting` document whose entire value is a JSON string.
 * A remote client re-parses the whole corpus, so NO object reference survives the wire — and
 * both managers' `reload()` then replaced their in-memory map outright and advanced every
 * system's revision token whenever anything changed at all.
 *
 * The consequence is not subtle once stated: every retained guard this programme shipped
 * missed unconditionally on every client except the writer's. `signatureGuardsMatch` compares
 * `previous.recipeMap === next.recipeMap` and `previous.components === next.components`;
 * `getDefinitionIndex` is a `WeakMap` keyed on the candidate ARRAY OBJECT. A replaced map and
 * a freshly parsed component array fail all three by construction, on every reload, for any
 * edit anywhere in the world. Two landed optimisations did nothing for any player.
 *
 * Every test below fails on the parent commit. They are grouped by the three axes a reload
 * now decides separately — what it invalidates, what it advances, and what identity it
 * preserves — because the failure that matters is one axis silently going broad.
 *
 * ## The reuse licence, stated once
 *
 * A record is eligible for identity preservation ONLY when the delta reports it structurally
 * equal, which is `jsonEquals` over the whole record. Anything coarser — reusing arrays
 * because the id set is unchanged — hands back a same-object, same-length array whose
 * ELEMENTS moved, and that is precisely the hole clause 3 of `definitionIndex`'s invalidation
 * rule exists to close. The constant-length element replacement is therefore its own named
 * test, and it asserts the index MISSES.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SETTING_KEYS } from '../src/config/settings.js';

import { installFoundryEnv } from './helpers/foundryEnv.js';

installFoundryEnv();

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { Recipe } = await import('../src/models/Recipe.js');
const { REVISION_SCOPES } = await import('../src/systems/revisionTokens.js');
const { getDefinitionIndex } = await import('../src/utils/definitionIndex.js');
const { readSignatureCounters, resetSignatureCounters } =
  await import('../src/systems/SignatureValidator.js');

const SYS_A = 'sys-a';
const SYS_B = 'sys-b';

/** One crafting system in its PERSISTED shape, with a named component library. */
function persistedSystem(id, componentNames) {
  return {
    id,
    name: `System ${id}`,
    resolutionMode: 'alchemy',
    items: componentNames.map((name, index) => ({
      id: `${id}-c${index}`,
      name,
      registeredItemUuid: `Item.${id}-c${index}`,
    })),
  };
}

/** One recipe in its persisted shape, requiring the named component. */
function persistedRecipe(id, systemId, componentId, overrides = {}) {
  return Recipe.fromJSON({
    id,
    name: `Recipe ${id}`,
    craftingSystemId: systemId,
    enabled: true,
    ingredientSets: [
      {
        id: `${id}-set`,
        ingredientGroups: [
          { id: `${id}-grp`, name: 'Ingredients', options: [{ componentId, quantity: 1 }] },
        ],
        essences: {},
      },
    ],
    resultGroups: [
      { id: `${id}-rg`, results: [{ id: `${id}-res`, itemUuid: 'Item.result', quantity: 1 }] },
    ],
    ...overrides,
  }).toJSON();
}

/**
 * A wired manager pair over one settings-backed world, loaded from the persisted corpus
 * exactly as a REMOTE client loads: through `reload()`, from the replicated setting.
 *
 * @param {object} [world]
 * @param {object[]} [world.systems] persisted systems.
 * @param {object[]} [world.recipes] persisted recipes.
 * @returns {{env: object, recipeManager: object, systemManager: object, write: Function}}
 */
function remoteClient({ systems = [], recipes = [] } = {}) {
  const env = installFoundryEnv();
  // A holder rather than two locals: the pair is mutually referential in production too —
  // the recipe manager resolves its system-manager collaborator lazily through a thunk.
  const pair = {};
  pair.recipeManager = new RecipeManager({ getCraftingSystemManager: () => pair.systemManager });
  pair.systemManager = new CraftingSystemManager(pair.recipeManager);

  /** Replicate a new corpus into the world settings, as another client's save would. */
  const write = (nextSystems, nextRecipes) => {
    if (nextSystems) env.settings.set(SETTING_KEYS.CRAFTING_SYSTEMS, nextSystems);
    if (nextRecipes) env.settings.set(SETTING_KEYS.RECIPES, nextRecipes);
  };

  write(systems, recipes);
  pair.systemManager.reload();
  pair.recipeManager.reload();
  return { env, ...pair, write };
}

/** The default two-system, two-recipe world every guard test below reads. */
function twoSystemWorld() {
  return remoteClient({
    systems: [
      persistedSystem(SYS_A, ['Iron Ore', 'Copper Ore']),
      persistedSystem(SYS_B, ['Tin Ore']),
    ],
    recipes: [
      persistedRecipe('r-a1', SYS_A, `${SYS_A}-c0`),
      persistedRecipe('r-a2', SYS_A, `${SYS_A}-c1`),
      persistedRecipe('r-b1', SYS_B, `${SYS_B}-c0`),
    ],
  });
}

/** The persisted corpus currently in the world settings. */
const storedSystems = (env) => env.settings.get(SETTING_KEYS.CRAFTING_SYSTEMS);
const storedRecipes = (env) => env.settings.get(SETTING_KEYS.RECIPES);

/** How many full signature audits have been compiled since the last reset. */
const audits = () => readSignatureCounters().reportBuilds;

// ---------------------------------------------------------------------------
// The repair: two shipped guards that missed on every remote client
// ---------------------------------------------------------------------------

describe('issue 1078 — a no-op remote reload no longer defeats the shipped guards', () => {
  it("preserves the recipe map identity, so signatureGuardsMatch's recipeMap clause holds", () => {
    const { recipeManager } = twoSystemWorld();
    const before = recipeManager.recipes;

    assert.equal(recipeManager.reload(), false, 'an identical corpus is not a change');

    assert.ok(
      recipeManager.recipes === before,
      'the map object must survive: clause 2 of the signature guard compares it by identity, ' +
        'and a replaced map made every retained report on every remote client miss'
    );
  });

  it('preserves every recipe OBJECT, so the guard members clause holds', () => {
    const { recipeManager } = twoSystemWorld();
    const before = recipeManager.getRecipe('r-a1');

    recipeManager.reload();

    assert.ok(
      recipeManager.getRecipe('r-a1') === before,
      'clause 3 walks the enabled cohort by object identity; a re-hydrated recipe fails it'
    );
  });

  it("preserves each system's components array, so the guard components clause holds", () => {
    const { systemManager } = twoSystemWorld();
    const before = systemManager.getSystem(SYS_A).components;

    assert.equal(systemManager.reload(), false);

    assert.ok(
      systemManager.getSystem(SYS_A).components === before,
      'a freshly normalized array is a different object and fails clause 4 unconditionally'
    );
  });

  it('does NOT recompile the alchemy signature report across a no-op reload', () => {
    // The end-to-end statement of the repair, through the public gate rather than the
    // private cache: a full audit is what the guard exists to avoid, and `reportBuilds`
    // counts exactly those.
    const { recipeManager, systemManager } = twoSystemWorld();
    resetSignatureCounters();
    recipeManager.canActivateRecipe('r-a1');
    assert.equal(audits(), 1, 'the cold read compiles exactly one report');

    systemManager.reload();
    recipeManager.reload();
    recipeManager.canActivateRecipe('r-a1');

    assert.equal(
      audits(),
      1,
      'a reload that changed nothing must not cost a second full audit — before this fix ' +
        'every remote client paid one per reload, for every edit anywhere in the world'
    );
  });

  it('returns the SAME definition index object across a no-op reload', () => {
    const { systemManager } = twoSystemWorld();
    const before = getDefinitionIndex(systemManager.getSystem(SYS_A).components);

    systemManager.reload();

    assert.ok(
      getDefinitionIndex(systemManager.getSystem(SYS_A).components) === before,
      'the index is a WeakMap keyed on the candidate array, so preserving that array IS ' +
        'preserving the index'
    );
  });
});

// ---------------------------------------------------------------------------
// Narrowing: an edit in one system leaves another alone
// ---------------------------------------------------------------------------

describe('issue 1078 — a reload advances only the systems that actually changed', () => {
  it('leaves an unrelated system token, record and index untouched by a system edit', () => {
    const { systemManager, env, write } = twoSystemWorld();
    const untouchedRecord = systemManager.getSystem(SYS_B);
    const untouchedIndex = getDefinitionIndex(untouchedRecord.components);
    const tokens = {
      a: systemManager.revision(REVISION_SCOPES.system(SYS_A)),
      b: systemManager.revision(REVISION_SCOPES.system(SYS_B)),
    };

    const next = storedSystems(env).map((system) =>
      system.id === SYS_A ? { ...system, name: 'System A renamed' } : system
    );
    write(next, null);
    assert.equal(systemManager.reload(), true);

    assert.notEqual(
      systemManager.revision(REVISION_SCOPES.system(SYS_A)),
      tokens.a,
      'the edited system advances'
    );
    assert.equal(
      systemManager.revision(REVISION_SCOPES.system(SYS_B)),
      tokens.b,
      'and the untouched one does not — the whole point of the narrow scope'
    );
    assert.ok(systemManager.getSystem(SYS_B) === untouchedRecord);
    assert.ok(getDefinitionIndex(systemManager.getSystem(SYS_B).components) === untouchedIndex);
    assert.equal(systemManager.getSystem(SYS_A).name, 'System A renamed');
  });

  it('leaves an unrelated system untouched by a recipe edit', () => {
    const { recipeManager, env, write } = twoSystemWorld();
    const untouched = recipeManager.getRecipe('r-b1');
    const tokens = {
      a: recipeManager.revision(REVISION_SCOPES.recipesOfSystem(SYS_A)),
      b: recipeManager.revision(REVISION_SCOPES.recipesOfSystem(SYS_B)),
    };

    write(
      null,
      storedRecipes(env).map((recipe) =>
        recipe.id === 'r-a1' ? { ...recipe, name: 'Renamed' } : recipe
      )
    );
    assert.equal(recipeManager.reload(), true);

    assert.notEqual(recipeManager.revision(REVISION_SCOPES.recipesOfSystem(SYS_A)), tokens.a);
    assert.equal(
      recipeManager.revision(REVISION_SCOPES.recipesOfSystem(SYS_B)),
      tokens.b,
      'a recipe edit in system A must not invalidate a consumer scoped to system B'
    );
    assert.ok(recipeManager.getRecipe('r-b1') === untouched);
    assert.equal(recipeManager.getRecipe('r-a1').name, 'Renamed');
  });

  it('names both systems when a recipe MOVES between them', () => {
    const { recipeManager, env, write } = twoSystemWorld();
    const tokens = {
      a: recipeManager.revision(REVISION_SCOPES.recipesOfSystem(SYS_A)),
      b: recipeManager.revision(REVISION_SCOPES.recipesOfSystem(SYS_B)),
    };

    write(
      null,
      storedRecipes(env).map((recipe) =>
        recipe.id === 'r-a1' ? { ...recipe, craftingSystemId: SYS_B } : recipe
      )
    );
    assert.equal(recipeManager.reload(), true);

    assert.notEqual(
      recipeManager.revision(REVISION_SCOPES.recipesOfSystem(SYS_A)),
      tokens.a,
      'a consumer watching the system the recipe LEFT must stop trusting its cache'
    );
    assert.notEqual(recipeManager.revision(REVISION_SCOPES.recipesOfSystem(SYS_B)), tokens.b);
  });
});

// ---------------------------------------------------------------------------
// The reuse licence, and the cases that must NOT reuse
// ---------------------------------------------------------------------------

describe('issue 1078 — identity is preserved only where the record is structurally equal', () => {
  it('does NOT reuse a system whose component changed under a CONSTANT-LENGTH array', () => {
    // The named case. The array keeps its object shape and its length; only a field of one
    // element moved. Neither the array-identity clause nor the length clause can see that,
    // which is why the licence is record-level structural equality and nothing coarser.
    const { systemManager, env, write } = twoSystemWorld();
    const staleArray = systemManager.getSystem(SYS_A).components;
    const staleIndex = getDefinitionIndex(staleArray);
    assert.equal(staleIndex.byName.get('Iron Ore')?.id, `${SYS_A}-c0`);

    const next = storedSystems(env).map((system) =>
      system.id === SYS_A
        ? {
            ...system,
            items: system.items.map((component, index) =>
              index === 0 ? { ...component, name: 'Iron Ore Refined' } : component
            ),
          }
        : system
    );
    assert.equal(next[0].items.length, staleArray.length, 'the length is deliberately equal');
    write(next, null);
    assert.equal(systemManager.reload(), true);

    const fresh = systemManager.getSystem(SYS_A).components;
    assert.ok(fresh !== staleArray, 'a changed record must NOT donate its arrays to the next map');
    const index = getDefinitionIndex(fresh);
    assert.ok(index !== staleIndex, 'and the index must therefore miss');
    assert.equal(index.byName.get('Iron Ore Refined')?.id, `${SYS_A}-c0`);
    assert.ok(!index.byName.get('Iron Ore'), 'the old name must no longer resolve');
  });

  it('does not reuse an INSERTED or DELETED record, and advances its owning system', () => {
    const { recipeManager, env, write } = twoSystemWorld();
    const survivor = recipeManager.getRecipe('r-a2');
    const tokens = {
      a: recipeManager.revision(REVISION_SCOPES.recipesOfSystem(SYS_A)),
      b: recipeManager.revision(REVISION_SCOPES.recipesOfSystem(SYS_B)),
    };

    const stored = storedRecipes(env);
    write(null, [
      stored[0],
      persistedRecipe('r-a3', SYS_A, `${SYS_A}-c0`),
      ...stored.slice(1, 2),
      stored[2],
    ]);
    assert.equal(recipeManager.reload(), true);

    assert.notEqual(recipeManager.revision(REVISION_SCOPES.recipesOfSystem(SYS_A)), tokens.a);
    assert.equal(
      recipeManager.revision(REVISION_SCOPES.recipesOfSystem(SYS_B)),
      tokens.b,
      'an insertion into system A says nothing about system B'
    );
    assert.ok(recipeManager.getRecipe('r-a3'), 'the inserted recipe is present');
    assert.ok(
      recipeManager.getRecipe('r-a2') === survivor,
      'and a record the insertion merely SHIFTED is unchanged — index pairing would have ' +
        'reported the whole tail as changed'
    );
    assert.deepEqual(
      [...recipeManager.recipes.keys()],
      ['r-a1', 'r-a3', 'r-a2', 'r-b1'],
      'the map keeps the persisted order, so the next save cannot replicate a reordering'
    );
  });

  it('preserves the ids and order of a corpus after a DELETION', () => {
    const { recipeManager, env, write } = twoSystemWorld();
    const survivor = recipeManager.getRecipe('r-b1');

    write(
      null,
      storedRecipes(env).filter((recipe) => recipe.id !== 'r-a1')
    );
    assert.equal(recipeManager.reload(), true);

    assert.deepEqual([...recipeManager.recipes.keys()], ['r-a2', 'r-b1']);
    assert.ok(recipeManager.getRecipe('r-b1') === survivor);
  });

  it('routes a pure REORDERING broadly on all three axes', () => {
    const { systemManager, env, write } = twoSystemWorld();
    const staleA = systemManager.getSystem(SYS_A);
    const staleMap = systemManager.systems;
    const staleIndex = getDefinitionIndex(staleA.components);
    const tokens = {
      a: systemManager.revision(REVISION_SCOPES.system(SYS_A)),
      b: systemManager.revision(REVISION_SCOPES.system(SYS_B)),
    };

    write(storedSystems(env).toReversed(), null);
    assert.equal(systemManager.reload(), true, 'order is significant, so a reorder IS a change');

    const delta = systemManager.consumeReloadDelta();
    assert.equal(delta.reordered, true);
    assert.equal(delta.perRecord.size, 0, 'nothing is attributable to an individual record');
    assert.notEqual(
      systemManager.revision(REVISION_SCOPES.system(SYS_A)),
      tokens.a,
      'axis 1: every system advances'
    );
    assert.notEqual(systemManager.revision(REVISION_SCOPES.system(SYS_B)), tokens.b);
    assert.ok(systemManager.systems !== staleMap, 'axis 2: the map is replaced');
    assert.ok(systemManager.getSystem(SYS_A) !== staleA, 'axis 3: no identity is preserved');
    assert.ok(getDefinitionIndex(systemManager.getSystem(SYS_A).components) !== staleIndex);
  });
});

// ---------------------------------------------------------------------------
// consumeReloadDelta
// ---------------------------------------------------------------------------

describe('issue 1078 — consumeReloadDelta is one-shot and reload keeps its boolean', () => {
  it('returns the delta once and then nothing', () => {
    const { recipeManager, env, write } = twoSystemWorld();
    write(
      null,
      storedRecipes(env).map((recipe) =>
        recipe.id === 'r-a1' ? { ...recipe, name: 'Renamed' } : recipe
      )
    );
    assert.equal(recipeManager.reload(), true, 'the boolean contract is unchanged');

    const delta = recipeManager.consumeReloadDelta();

    assert.deepEqual([...delta.perRecord.keys()], ['r-a1']);
    assert.deepEqual(delta.perRecord.get('r-a1').fields, ['name']);
    assert.equal(
      recipeManager.consumeReloadDelta(),
      null,
      'a delta describes ONE transition; re-reading it would invalidate work twice'
    );
  });

  it('replaces a delta nobody consumed rather than letting a stale one be read', () => {
    const { systemManager, env, write } = twoSystemWorld();
    write(
      storedSystems(env).map((system) =>
        system.id === SYS_A ? { ...system, name: 'First edit' } : system
      ),
      null
    );
    systemManager.reload();

    systemManager.reload();

    const delta = systemManager.consumeReloadDelta();
    assert.equal(delta.changed, false, 'the SECOND reload found nothing, and that is what reads');
    assert.equal(delta.perRecord.size, 0);
  });

  it('has no delta to hand back before any reload has run', () => {
    installFoundryEnv();
    assert.equal(new RecipeManager({}).consumeReloadDelta(), null);
    assert.equal(new CraftingSystemManager(new RecipeManager({})).consumeReloadDelta(), null);
  });
});

// ---------------------------------------------------------------------------
// The two narrowed bare saves
// ---------------------------------------------------------------------------

describe('issue 1078 — the item-sync metadata refresh names the systems it touched', () => {
  it('does not advance an unrelated system when a GM renames a source item', async () => {
    // On the `updateItem` hook this is bound to, the bare `save()` this replaces took
    // `save()`'s whole-corpus branch — so every GM item rename, image or description edit in
    // the world advanced every crafting system's token.
    const { systemManager } = twoSystemWorld();
    const tokens = {
      a: systemManager.revision(REVISION_SCOPES.system(SYS_A)),
      b: systemManager.revision(REVISION_SCOPES.system(SYS_B)),
      domain: systemManager.revision(REVISION_SCOPES.systems),
    };

    const result = await systemManager.refreshComponentMetadataForUpdatedItem(
      { uuid: `Item.${SYS_A}-c0`, name: 'Iron Ore Renamed' },
      { name: 'Iron Ore Renamed' }
    );

    assert.equal(result.updated, 1, 'exactly one component carried that source reference');
    assert.equal(systemManager.getSystem(SYS_A).components[0].name, 'Iron Ore Renamed');
    assert.notEqual(
      systemManager.revision(REVISION_SCOPES.system(SYS_A)),
      tokens.a,
      'the system whose component was rewritten advances'
    );
    assert.equal(
      systemManager.revision(REVISION_SCOPES.system(SYS_B)),
      tokens.b,
      'and a system the walk merely visited does not'
    );
    assert.notEqual(
      systemManager.revision(REVISION_SCOPES.systems),
      tokens.domain,
      'the domain scope still advances, because a consumer that cannot attribute its cache ' +
        'to one system watches it'
    );
  });

  it('persists the rewritten component exactly as the whole-corpus save did', async () => {
    const { systemManager, env } = twoSystemWorld();

    await systemManager.refreshComponentMetadataForUpdatedItem(
      { uuid: `Item.${SYS_A}-c0`, name: 'Iron Ore Renamed' },
      { name: 'Iron Ore Renamed' }
    );

    const persisted = storedSystems(env);
    assert.equal(persisted.length, 2, 'the batch write still carries the whole corpus');
    assert.equal(
      persisted.find((system) => system.id === SYS_A).components[0].name,
      'Iron Ore Renamed'
    );
  });

  it('writes nothing and advances nothing when no component matched', async () => {
    const { systemManager } = twoSystemWorld();
    const before = systemManager.revision(REVISION_SCOPES.systems);

    const result = await systemManager.refreshComponentMetadataForUpdatedItem(
      { uuid: 'Item.unrelated', name: 'Something Else' },
      { name: 'Something Else' }
    );

    assert.equal(result.updated, 0);
    assert.equal(systemManager.revision(REVISION_SCOPES.systems), before);
  });
});
