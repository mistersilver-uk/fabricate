/**
 * Pins the observable revision, attribution and reload-delta behaviour of both crafting-data
 * managers (issue 1694), so the same assertions prove the `RevisionBookkeeping` extraction
 * changed nothing. Authored against the unchanged managers and unmodified afterwards.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CRAFTING_DATA_CHANGED_HOOK } from '../../src/systems/craftingDataChange.js';
import { ALL_INVALIDATION_DOMAINS } from '../../src/systems/invalidationDomains.js';
import {
  CraftingSystemManager,
  persistedRecipe,
  RecipeManager,
  REVISION_SCOPES,
  storedRecipes,
  storedSystems,
  SYS_A,
  SYS_B,
  twoSystemWorld,
  withRecipe,
  withSystem,
} from '../helpers/scopedInvalidationWorld.js';

const DOMAINS = [...ALL_INVALIDATION_DOMAINS];
const LABELLING = ['labelling'];
const NARRATIVE = ['narrative'];

/** A system id no fixture owns, so an over-broad advance is visible rather than suspected. */
const SYS_ABSENT = 'sys-absent';
const WORLD = [SYS_A, SYS_B, SYS_ABSENT];

const SYSTEM_SCOPES = { entity: REVISION_SCOPES.systems, narrow: REVISION_SCOPES.system };
const RECIPE_SCOPES = { entity: REVISION_SCOPES.recipes, narrow: REVISION_SCOPES.recipesOfSystem };

/** Every scope either manager can advance for the fixture world, enumerated so a diff is exact. */
function allScopes() {
  const scopes = [REVISION_SCOPES.recipes, REVISION_SCOPES.systems];
  for (const systemId of WORLD) {
    scopes.push(REVISION_SCOPES.system(systemId), REVISION_SCOPES.recipesOfSystem(systemId));
    for (const domain of DOMAINS) scopes.push(REVISION_SCOPES.facts(domain, systemId));
  }
  return scopes;
}

const snapshot = (manager) => new Map(allScopes().map((scope) => [scope, manager.revision(scope)]));

/** The scopes whose token moved since `before`, sorted, so an assertion names the exact set. */
function advancedSince(manager, before) {
  const moved = [...before]
    .filter(([scope, token]) => manager.revision(scope) !== token)
    .map(([scope]) => scope);
  return moved.sort();
}

/** The scopes a mutation of `systemIds` attributed to `domains` must advance, and no others. */
function expected({ entity, narrow }, systemIds, domains) {
  const scopes = [entity];
  for (const systemId of systemIds) {
    scopes.push(narrow(systemId));
    for (const domain of domains) scopes.push(REVISION_SCOPES.facts(domain, systemId));
  }
  return [...new Set(scopes)].sort();
}

/**
 * Run `work` over a stub bus, handing it the live call log and returning it. The managers pass no
 * emitter to `emitCraftingDataChanged`, so `globalThis.Hooks` read at call time is the only seam.
 */
async function onHookBus(work) {
  const previous = globalThis.Hooks;
  const calls = [];
  globalThis.Hooks = { callAll: (hook, payload) => calls.push([hook, payload]) };
  try {
    await work(calls);
  } finally {
    globalThis.Hooks = previous;
  }
  return calls;
}

const announcements = (calls) =>
  calls.filter(([hook]) => hook === CRAFTING_DATA_CHANGED_HOOK).map(([, payload]) => payload);

/** A recipe no fixture holds, born disabled so the alchemy signature gate is not the subject. */
const newRecipe = () => persistedRecipe('r-new', SYS_A, `${SYS_A}-c0`, { enabled: false });

/** A repository seam whose replicated snapshot a test can WITHDRAW between two reloads. */
function withdrawable(records) {
  const seam = { snapshot: records, readReplicatedSnapshot: () => seam.snapshot };
  return seam;
}

describe('CraftingSystemManager save advances exactly the scopes its change names', () => {
  it('advances every stored system for the whole-corpus save, which names nothing', async () => {
    const { systemManager } = twoSystemWorld();
    const before = snapshot(systemManager);

    await systemManager.save();

    assert.deepEqual(
      advancedSince(systemManager, before),
      expected(SYSTEM_SCOPES, [SYS_A, SYS_B], DOMAINS)
    );
  });

  it('advances one system and one domain for a named put', async () => {
    const { systemManager } = twoSystemWorld();
    const before = snapshot(systemManager);

    await systemManager.save({ put: systemManager.getSystem(SYS_A), domains: LABELLING });

    assert.deepEqual(
      advancedSince(systemManager, before),
      expected(SYSTEM_SCOPES, [SYS_A], LABELLING)
    );
  });

  it('advances the deleted system alone', async () => {
    const { systemManager } = twoSystemWorld();
    const before = snapshot(systemManager);

    await systemManager.save({ delete: SYS_B, domains: NARRATIVE });

    assert.deepEqual(
      advancedSince(systemManager, before),
      expected(SYSTEM_SCOPES, [SYS_B], NARRATIVE)
    );
  });

  it('applies a batch domain map PER RECORD rather than to every record', async () => {
    const { systemManager } = twoSystemWorld();
    const before = snapshot(systemManager);

    await systemManager.save({
      batch: [systemManager.getSystem(SYS_A), systemManager.getSystem(SYS_B)],
      domains: { [SYS_A]: LABELLING, [SYS_B]: NARRATIVE },
    });

    assert.deepEqual(
      advancedSince(systemManager, before),
      [
        ...new Set([
          ...expected(SYSTEM_SCOPES, [SYS_A], LABELLING),
          ...expected(SYSTEM_SCOPES, [SYS_B], NARRATIVE),
        ]),
      ].sort()
    );
  });
});

describe('RecipeManager records every map mutation', () => {
  it('advances every domain of the owning system for a create', async () => {
    const { recipeManager } = twoSystemWorld();
    const before = snapshot(recipeManager);

    await recipeManager.createRecipe(newRecipe(), {
      emitChange: false,
    });

    assert.deepEqual(
      advancedSince(recipeManager, before),
      expected(RECIPE_SCOPES, [SYS_A], DOMAINS)
    );
  });

  it('narrows an edit to the domains the moved fields belong to', async () => {
    const { recipeManager } = twoSystemWorld();
    const before = snapshot(recipeManager);

    await recipeManager.updateRecipe('r-a1', { name: 'Renamed' }, { emitChange: false });

    assert.deepEqual(
      advancedSince(recipeManager, before),
      expected(RECIPE_SCOPES, [SYS_A], LABELLING)
    );
  });

  it('names BOTH systems when an edit moves a recipe between them', async () => {
    const { recipeManager } = twoSystemWorld();
    const before = snapshot(recipeManager);

    await recipeManager.updateRecipe(
      'r-a1',
      { craftingSystemId: SYS_B },
      { emitChange: false, allowIncomplete: true }
    );

    assert.deepEqual(
      advancedSince(recipeManager, before),
      expected(RECIPE_SCOPES, [SYS_A, SYS_B], DOMAINS)
    );
  });

  it('advances every domain of the owning system for a delete', async () => {
    const { recipeManager } = twoSystemWorld();
    const before = snapshot(recipeManager);

    await recipeManager.deleteRecipe('r-b1', { emitChange: false });

    assert.deepEqual(
      advancedSince(recipeManager, before),
      expected(RECIPE_SCOPES, [SYS_B], DOMAINS)
    );
  });

  it('attributes WITHOUT advancing the entity scopes on the public notify seam', async () => {
    const { recipeManager } = twoSystemWorld();
    const before = snapshot(recipeManager);

    await onHookBus(() =>
      recipeManager.notifyRecipesChanged({ domains: LABELLING, systemIds: [SYS_A] })
    );

    assert.deepEqual(advancedSince(recipeManager, before), [
      REVISION_SCOPES.facts('labelling', SYS_A),
    ]);
  });
});

describe('an argument-less revision() reads the manager OWN entity scope', () => {
  it('defaults to the recipes scope on RecipeManager', async () => {
    const { recipeManager } = twoSystemWorld();

    await recipeManager.updateRecipe('r-a1', { name: 'Renamed' }, { emitChange: false });

    assert.equal(recipeManager.revision(), recipeManager.revision(REVISION_SCOPES.recipes));
    assert.notEqual(recipeManager.revision(), recipeManager.revision(REVISION_SCOPES.systems));
  });

  it('defaults to the systems scope on CraftingSystemManager', async () => {
    const { systemManager } = twoSystemWorld();

    await systemManager.save({ put: systemManager.getSystem(SYS_A), domains: LABELLING });

    assert.equal(systemManager.revision(), systemManager.revision(REVISION_SCOPES.systems));
    assert.notEqual(systemManager.revision(), systemManager.revision(REVISION_SCOPES.recipes));
  });
});

describe('a reload advances only what moved', () => {
  it('advances nothing when the replicated corpus is identical', () => {
    const { systemManager } = twoSystemWorld();
    const before = snapshot(systemManager);

    assert.equal(systemManager.reload(), false);

    assert.deepEqual(advancedSince(systemManager, before), []);
  });

  it('advances the changed system and the domains its moved fields belong to', () => {
    const { env, systemManager, write } = twoSystemWorld();
    const before = snapshot(systemManager);

    write(withSystem(env, SYS_A, (system) => ({ ...system, name: 'Renamed' })));

    assert.equal(systemManager.reload(), true);
    assert.deepEqual(
      advancedSince(systemManager, before),
      expected(SYSTEM_SCOPES, [SYS_A], LABELLING)
    );
  });

  it('advances every system and every fact scope for a REORDERING, and replicates no scope', () => {
    const { env, systemManager, write } = twoSystemWorld();
    const before = snapshot(systemManager);

    write([...storedSystems(env)].reverse());

    assert.equal(systemManager.reload(), true);
    assert.deepEqual(
      advancedSince(systemManager, before),
      expected(SYSTEM_SCOPES, [SYS_A, SYS_B], DOMAINS)
    );
    assert.deepEqual(
      systemManager.consumeReplicatedChangeScopes(),
      [],
      'a reordering is attributable to no record, so every consumer routes broadly'
    );
  });

  it('advances both systems for a recipe that moved between them', () => {
    const { env, recipeManager, write } = twoSystemWorld();
    const before = snapshot(recipeManager);

    write(null, withRecipe(env, 'r-a1', (recipe) => ({ ...recipe, craftingSystemId: SYS_B })));

    assert.equal(recipeManager.reload(), true);
    assert.deepEqual(
      advancedSince(recipeManager, before),
      expected(RECIPE_SCOPES, [SYS_A, SYS_B], DOMAINS)
    );
  });
});

describe('the reload delta is one-shot', () => {
  it('is null on a freshly constructed manager of either kind', () => {
    twoSystemWorld();
    const recipeManager = new RecipeManager();

    assert.equal(recipeManager.consumeReloadDelta(), null);
    assert.equal(new CraftingSystemManager(recipeManager).consumeReloadDelta(), null);
  });

  it('is cleared by the read that consumes it', () => {
    const { env, systemManager, write } = twoSystemWorld();

    write(withSystem(env, SYS_A, (system) => ({ ...system, name: 'Renamed' })));
    systemManager.reload();

    assert.equal(systemManager.consumeReloadDelta()?.changed, true);
    assert.equal(systemManager.consumeReloadDelta(), null);
  });

  it('is replaced by a later reload, so no stale delta survives an unconsumed one', () => {
    const { env, recipeManager, write } = twoSystemWorld();

    write(null, withRecipe(env, 'r-a1', (recipe) => ({ ...recipe, name: 'Renamed' })));
    recipeManager.reload();
    recipeManager.reload();

    assert.deepEqual(recipeManager.consumeReplicatedChangeScopes(), []);
  });

  it('leaves nothing readable when the reload reads no snapshot at all', () => {
    twoSystemWorld();
    const seam = withdrawable([{ id: SYS_A, name: 'A' }]);
    const systemManager = new CraftingSystemManager(new RecipeManager(), { repository: seam });

    assert.equal(systemManager.reload(), true);
    seam.snapshot = null;

    assert.equal(systemManager.reload(), false);
    assert.equal(systemManager.consumeReloadDelta(), null);
  });
});

describe('the replicated change scopes name every owner the change touched', () => {
  it('names the system a recipe LEFT and the one it joined', () => {
    const { env, recipeManager, write } = twoSystemWorld();

    write(null, withRecipe(env, 'r-a1', (recipe) => ({ ...recipe, craftingSystemId: SYS_B })));
    recipeManager.reload();

    assert.deepEqual(recipeManager.consumeReplicatedChangeScopes(), [
      { systemId: SYS_A, domains: DOMAINS },
      { systemId: SYS_B, domains: DOMAINS },
    ]);
  });

  it('names the changed system and its moved domains on the systems side', () => {
    const { env, systemManager, write } = twoSystemWorld();

    write(withSystem(env, SYS_A, (system) => ({ ...system, description: 'Prose' })));
    systemManager.reload();

    assert.deepEqual(systemManager.consumeReplicatedChangeScopes(), [
      { systemId: SYS_A, domains: NARRATIVE },
    ]);
  });
});

describe('an edit with a missing side falls back to every domain', () => {
  it('falls back on both sides for a recipe edit', () => {
    const { recipeManager } = twoSystemWorld();
    const recipe = recipeManager.getRecipe('r-a1');

    assert.deepEqual(recipeManager._domainsForRecipeEdit(null, recipe), DOMAINS);
    assert.deepEqual(recipeManager._domainsForRecipeEdit(recipe, null), DOMAINS);
  });

  it('falls back on both sides for a system edit, and narrows a real one', () => {
    const { systemManager } = twoSystemWorld();
    const system = systemManager.getSystem(SYS_A);

    assert.deepEqual(systemManager._domainsForSystemEdit(null, system), DOMAINS);
    assert.deepEqual(
      systemManager._domainsForSystemEdit(system, { ...system, name: 'Renamed' }),
      LABELLING
    );
  });
});

describe('the announcement carries exactly what was attributed since the last one', () => {
  it('drains a systems save into the very next announcement', async () => {
    const { systemManager } = twoSystemWorld();

    const calls = await onHookBus(async () => {
      await systemManager.save({ put: systemManager.getSystem(SYS_A), domains: LABELLING });
      systemManager._notifySystemsChanged();
    });

    assert.deepEqual(announcements(calls), [
      { source: 'systems', scopes: [{ systemId: SYS_A, domains: LABELLING }] },
    ]);
  });

  it('announces nothing for a save whose notifier never comes, carrying it on', async () => {
    const { systemManager } = twoSystemWorld();
    let beforeAnyNotifier = [];

    const calls = await onHookBus(async (log) => {
      await systemManager.save({ put: systemManager.getSystem(SYS_A), domains: LABELLING });
      await systemManager.save({ put: systemManager.getSystem(SYS_B), domains: NARRATIVE });
      beforeAnyNotifier = announcements(log);
      systemManager._notifySystemsChanged();
    });

    assert.deepEqual(beforeAnyNotifier, [], 'save records; the notifier announces');
    assert.deepEqual(announcements(calls), [
      {
        source: 'systems',
        scopes: [
          { systemId: SYS_A, domains: LABELLING },
          { systemId: SYS_B, domains: NARRATIVE },
        ],
      },
    ]);
  });

  it('carries NOTHING on a second announcement with nothing attributed since', async () => {
    const { systemManager } = twoSystemWorld();

    const calls = await onHookBus(async () => {
      await systemManager.save({ put: systemManager.getSystem(SYS_A), domains: LABELLING });
      systemManager._notifySystemsChanged();
      systemManager._notifySystemsChanged();
    });

    assert.deepEqual(announcements(calls).at(-1), { source: 'systems', scopes: [] });
  });

  it('is unmoved by a replicated reload landing between a save and its notifier', async () => {
    const { env, systemManager, write } = twoSystemWorld();

    const calls = await onHookBus(async () => {
      await systemManager.save({ put: systemManager.getSystem(SYS_A), domains: LABELLING });
      write(withSystem(env, SYS_B, (system) => ({ ...system, description: 'Prose' })));
      assert.equal(systemManager.reload(), true, 'the interleaved reload must be a real one');
      systemManager._notifySystemsChanged();
    });

    assert.deepEqual(
      announcements(calls),
      [{ source: 'systems', scopes: [{ systemId: SYS_A, domains: LABELLING }] }],
      'a replicated change is announced from the delta, never from the pending set'
    );
  });

  it('poisons the whole payload when one leg is attributable to nothing', async () => {
    const { systemManager } = twoSystemWorld();

    const calls = await onHookBus(async () => {
      await systemManager.save({ put: systemManager.getSystem(SYS_A), domains: LABELLING });
      await systemManager.save({ put: systemManager.getSystem(SYS_B), domains: [] });
      systemManager._notifySystemsChanged();
    });

    assert.deepEqual(announcements(calls), [{ source: 'systems', scopes: [] }]);
  });

  it('drains a recipe mutation into the next announcement, and resets after it', async () => {
    const { recipeManager } = twoSystemWorld();

    const calls = await onHookBus(async () => {
      await recipeManager.createRecipe(newRecipe(), {
        emitChange: false,
      });
      recipeManager.notifyRecipesChanged({ action: 'external' });
      recipeManager.notifyRecipesChanged({ action: 'external' });
    });

    assert.deepEqual(announcements(calls), [
      { source: 'recipes', scopes: [{ systemId: SYS_A, domains: DOMAINS }] },
      { source: 'recipes', scopes: [] },
    ]);
  });

  it('poisons a recipe announcement whose attribution names no domain at all', async () => {
    const { recipeManager } = twoSystemWorld();

    const calls = await onHookBus(async () => {
      await recipeManager.updateRecipe('r-a1', { name: 'Renamed' }, { emitChange: false });
      recipeManager.notifyRecipesChanged({ domains: [], systemIds: [SYS_B] });
    });

    assert.deepEqual(announcements(calls), [{ source: 'recipes', scopes: [] }]);
  });
});

describe('two managers in one process share no counters', () => {
  it('leaves a second manager of the same kind untouched', async () => {
    const { recipeManager } = twoSystemWorld();
    const second = new RecipeManager();
    const secondBefore = snapshot(second);
    const firstBefore = snapshot(recipeManager);

    await recipeManager.updateRecipe('r-a1', { name: 'Renamed' }, { emitChange: false });

    assert.deepEqual(
      advancedSince(recipeManager, firstBefore),
      expected(RECIPE_SCOPES, [SYS_A], LABELLING)
    );
    assert.deepEqual(advancedSince(second, secondBefore), []);
  });
});

describe('the fixture world is what these assertions assume', () => {
  it('holds both systems and three recipes before any test mutates it', () => {
    const { env, recipeManager, systemManager } = twoSystemWorld();

    assert.deepEqual(
      systemManager.getSystems().map((system) => system.id),
      [SYS_A, SYS_B]
    );
    assert.equal(recipeManager.getRecipes().length, 3);
    assert.equal(storedRecipes(env).length, 3);
  });
});
