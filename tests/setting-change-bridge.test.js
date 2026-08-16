import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  RECIPE_RECORD_SETTING_KEY_PREFIX,
  createRecipeRefreshCoalescer,
  handleFabricateSettingChange,
} from '../src/config/settingChangeBridge.js';

/**
 * A recipe manager that reports every per-record change as a real change.
 *
 * Deliberately NOT a `RecipeManager`: this suite is about which keys the bridge routes and
 * how many signals it emits, and a real manager would make the count depend on recipe
 * equality — which `tests/recipe-manager-per-record-persistence.test.js` covers separately.
 *
 * @param {object[]} [recipes]
 */
function perRecordRecipeManagerDouble(recipes = []) {
  const seen = [];
  return {
    seen,
    reload: () => {
      throw new Error('reload() must not be reached for a per-record key');
    },
    getRecipes: () => recipes,
    applyReplicatedRecordChange: (change) => {
      seen.push(change);
      return true;
    },
  };
}

describe('handleFabricateSettingChange', () => {
  it('reloads systems and re-emits craftingSystemsChanged when the setting changed', () => {
    const emitted = [];
    const craftingSystemManager = { reload: () => true, getSystems: () => [{ id: 's1' }] };
    const handled = handleFabricateSettingChange('fabricate.craftingSystems', {
      craftingSystemManager,
      callAll: (hook, payload) => emitted.push([hook, payload]),
    });
    assert.equal(handled, true);
    assert.deepEqual(emitted, [['fabricate.craftingSystemsChanged', [{ id: 's1' }]]]);
  });

  it('reloads but does NOT re-emit when systems are unchanged (writing-client no-op)', () => {
    const emitted = [];
    let reloadCalls = 0;
    const craftingSystemManager = {
      reload: () => {
        reloadCalls += 1;
        return false;
      },
      getSystems: () => [],
    };
    const handled = handleFabricateSettingChange('fabricate.craftingSystems', {
      craftingSystemManager,
      callAll: (hook, payload) => emitted.push([hook, payload]),
    });
    assert.equal(handled, true);
    assert.equal(reloadCalls, 1, 'the manager is still reloaded');
    assert.equal(emitted.length, 0, 'no redundant hook re-emitted');
  });

  it('reloads recipes and re-emits recipesChanged with an external-action payload', () => {
    const emitted = [];
    const recipeManager = { reload: () => true, getRecipes: () => [{ id: 'r1' }] };
    handleFabricateSettingChange('fabricate.recipes', {
      recipeManager,
      callAll: (hook, payload) => emitted.push([hook, payload]),
    });
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0][0], 'fabricate.recipesChanged');
    assert.deepEqual(emitted[0][1], { action: 'external', recipes: [{ id: 'r1' }] });
  });

  it('reloads the gathering environment store and re-emits the change hook', () => {
    // The reload alone is invisible: a player whose gather was applied BY THE GM has
    // no other signal that their node counts moved, so open views must be told.
    const emitted = [];
    let loadCalls = 0;
    const handled = handleFabricateSettingChange('fabricate.gatheringEnvironments', {
      gatheringEnvironmentStore: {
        load: () => {
          loadCalls += 1;
          return [];
        },
      },
      callAll: (hook, payload) => emitted.push([hook, payload]),
    });
    assert.equal(handled, true);
    assert.equal(loadCalls, 1, 'the store re-reads the replicated setting');
    assert.deepEqual(
      emitted.map(([hook]) => hook),
      ['fabricate.gatheringEnvironmentsChanged']
    );
  });

  it('reloads the store BEFORE emitting, so subscribers read fresh environments', () => {
    const order = [];
    handleFabricateSettingChange('fabricate.gatheringEnvironments', {
      gatheringEnvironmentStore: { load: () => order.push('load') },
      callAll: () => order.push('emit'),
    });
    assert.deepEqual(order, ['load', 'emit']);
  });

  it('tolerates a missing gathering environment store', () => {
    assert.equal(
      handleFabricateSettingChange('fabricate.gatheringEnvironments', { callAll: () => {} }),
      true
    );
  });

  it('ignores unrelated settings without touching the managers', () => {
    const emitted = [];
    let reloadCalls = 0;
    const handled = handleFabricateSettingChange('fabricate.theme', {
      craftingSystemManager: {
        reload: () => {
          reloadCalls += 1;
          return true;
        },
        getSystems: () => [],
      },
      callAll: (hook, payload) => emitted.push([hook, payload]),
    });
    assert.equal(handled, false);
    assert.equal(reloadCalls, 0);
    assert.equal(emitted.length, 0);
  });
});

describe('per-record recipe replication (issue 1080 -b)', () => {
  it('exposes the record prefix WITH its trailing separator', () => {
    assert.equal(RECIPE_RECORD_SETTING_KEY_PREFIX, 'fabricate.recipe.');
  });

  it('routes a per-record key to the manager and emits one recipesChanged', () => {
    const emitted = [];
    const recipeManager = perRecordRecipeManagerDouble([{ id: 'r1' }]);
    const document = { key: 'fabricate.recipe.r1' };
    const handled = handleFabricateSettingChange('fabricate.recipe.r1', {
      recipeManager,
      callAll: (hook, payload) => emitted.push([hook, payload]),
      operation: 'create',
      document,
    });
    assert.equal(handled, true);
    assert.deepEqual(recipeManager.seen, [
      { key: 'fabricate.recipe.r1', operation: 'create', document },
    ]);
    assert.deepEqual(emitted, [
      ['fabricate.recipesChanged', { action: 'external', recipes: [{ id: 'r1' }] }],
    ]);
  });

  it('carries the delete operation through, because the document is already gone', () => {
    const recipeManager = perRecordRecipeManagerDouble();
    handleFabricateSettingChange('fabricate.recipe.r1', {
      recipeManager,
      callAll: () => {},
      operation: 'delete',
      document: { key: 'fabricate.recipe.r1' },
    });
    assert.equal(recipeManager.seen[0].operation, 'delete');
  });

  it('emits nothing when the manager reports no change (the writing client)', () => {
    // The same no-double-refresh property `reload()` gives the whole-corpus branches: the
    // writer's map already holds the record, so its own single change hook stays single.
    const emitted = [];
    const handled = handleFabricateSettingChange('fabricate.recipe.r1', {
      recipeManager: {
        getRecipes: () => [{ id: 'r1' }],
        applyReplicatedRecordChange: () => false,
      },
      callAll: (hook, payload) => emitted.push([hook, payload]),
    });
    assert.equal(handled, true, 'still a handled Fabricate key');
    assert.equal(emitted.length, 0);
  });

  it('tolerates a manager with no per-record support', () => {
    const emitted = [];
    const handled = handleFabricateSettingChange('fabricate.recipe.r1', {
      recipeManager: { reload: () => true, getRecipes: () => [] },
      callAll: (hook, payload) => emitted.push([hook, payload]),
    });
    assert.equal(handled, true);
    assert.equal(emitted.length, 0);
  });

  // ---- The prefix boundary ------------------------------------------------------------
  //
  // The defect this whole task exists to prevent is SILENT: matching `fabricate.recipe`
  // without the separator swallows three live keys, and matching `fabricate.recipes` (the
  // shipped comparison) matches no record at all. Neither raises anything, so the boundary
  // is asserted directly rather than inferred from a happy path.

  // The legacy key is protected TWICE over — by the exact-match branch that precedes the
  // prefix test, and by the separator — so removing the separator leaves this one green and
  // turns the two storage keys below red. That is where the separator's mutation proof
  // lands, and it is why all three are asserted rather than just this one.
  it('does NOT mistake the legacy whole-corpus key for a record', () => {
    let reloads = 0;
    const seen = [];
    const handled = handleFabricateSettingChange('fabricate.recipes', {
      recipeManager: {
        reload: () => {
          reloads += 1;
          return false;
        },
        getRecipes: () => [],
        applyReplicatedRecordChange: (change) => {
          seen.push(change);
          return true;
        },
      },
      callAll: () => {},
    });
    assert.equal(handled, true);
    assert.equal(reloads, 1, 'the legacy key still routes to the whole-corpus reload');
    assert.deepEqual(seen, [], 'and never to the per-record path');
  });

  for (const key of ['fabricate.recipeStorageLayout', 'fabricate.recipeStorageTarget']) {
    it(`does NOT mistake ${key} for a record, and signals the flip`, () => {
      const emitted = [];
      const seen = [];
      const handled = handleFabricateSettingChange(key, {
        recipeManager: {
          reload: () => {
            throw new Error('a storage key must not reload the corpus');
          },
          getRecipes: () => [],
          applyReplicatedRecordChange: (change) => {
            seen.push(change);
            return true;
          },
        },
        callAll: (hook, payload) => emitted.push([hook, payload]),
      });
      assert.equal(handled, true, 'the layout keys are in the handled set');
      assert.deepEqual(seen, [], 'and are never parsed as records');
      assert.deepEqual(emitted, [['fabricate.recipeStorageLayoutChanged', { key }]]);
    });
  }

  it('leaves a prefix-shaped key with no separator unhandled', () => {
    const seen = [];
    const handled = handleFabricateSettingChange('fabricate.recipeSomethingElse', {
      recipeManager: {
        getRecipes: () => [],
        applyReplicatedRecordChange: (change) => {
          seen.push(change);
          return true;
        },
      },
      callAll: () => {},
    });
    assert.equal(handled, false);
    assert.deepEqual(seen, []);
  });
});

describe('createRecipeRefreshCoalescer (issue 1080 -b)', () => {
  /** Run every callback the coalescer deferred, standing in for the microtask queue. */
  function manualScheduler() {
    const queued = [];
    return {
      schedule: (callback) => queued.push(callback),
      drain: () => {
        while (queued.length > 0) queued.shift()();
      },
      get depth() {
        return queued.length;
      },
    };
  }

  it('emits ONE signal for a batch spanning three bulk calls and fifty records', async () => {
    // The shape of a real flush: creates, then updates, then deletes, each awaited. This is
    // exactly what microtask coalescing cannot collapse — an `await` ends the microtask —
    // so the assertion is one signal, not one per record and not one per bulk call.
    const emitted = [];
    const recipeManager = perRecordRecipeManagerDouble([{ id: 'r1' }]);
    const recipeRefresh = createRecipeRefreshCoalescer();
    const deliver = (id) =>
      handleFabricateSettingChange(`fabricate.recipe.${id}`, {
        recipeManager,
        callAll: (hook, payload) => emitted.push([hook, payload]),
        recipeRefresh,
      });

    recipeRefresh.open();
    for (let index = 0; index < 30; index += 1) deliver(`created-${index}`);
    await Promise.resolve();
    for (let index = 0; index < 15; index += 1) deliver(`updated-${index}`);
    await Promise.resolve();
    for (let index = 0; index < 5; index += 1) deliver(`deleted-${index}`);
    await Promise.resolve();
    assert.equal(emitted.length, 0, 'nothing is emitted while the bracket is open');
    recipeRefresh.close();

    assert.equal(recipeManager.seen.length, 50, 'every record was applied to the map');
    assert.deepEqual(emitted, [
      ['fabricate.recipesChanged', { action: 'external', recipes: [{ id: 'r1' }] }],
    ]);
  });

  it('emits once per burst outside a bracket, not once per record', () => {
    const emitted = [];
    const scheduler = manualScheduler();
    const recipeManager = perRecordRecipeManagerDouble();
    const recipeRefresh = createRecipeRefreshCoalescer({ schedule: scheduler.schedule });
    for (const id of ['a', 'b', 'c']) {
      handleFabricateSettingChange(`fabricate.recipe.${id}`, {
        recipeManager,
        callAll: (hook) => emitted.push(hook),
        recipeRefresh,
      });
    }
    assert.equal(emitted.length, 0, 'deferred to the end of the synchronous burst');
    assert.equal(scheduler.depth, 1, 'and scheduled exactly once for the whole burst');
    scheduler.drain();
    assert.deepEqual(emitted, ['fabricate.recipesChanged']);
  });

  it('only the outermost close emits, so nested brackets do not double-signal', () => {
    const emitted = [];
    const coalescer = createRecipeRefreshCoalescer();
    coalescer.open();
    coalescer.open();
    coalescer.signal(() => emitted.push('a'));
    coalescer.close();
    assert.equal(emitted.length, 0, 'the inner close does not emit');
    assert.equal(coalescer.isOpen(), true);
    coalescer.close();
    assert.deepEqual(emitted, ['a']);
  });

  it('holds a scheduled signal when a bracket opens before the microtask runs', () => {
    const emitted = [];
    const scheduler = manualScheduler();
    const coalescer = createRecipeRefreshCoalescer({ schedule: scheduler.schedule });
    coalescer.signal(() => emitted.push('early'));
    coalescer.open();
    scheduler.drain();
    assert.equal(emitted.length, 0, 'the pending signal is not flushed mid-batch');
    coalescer.signal(() => emitted.push('late'));
    coalescer.close();
    assert.deepEqual(emitted, ['late'], 'exactly one signal, describing the finished batch');
  });

  it('emits immediately when no coalescer is supplied', () => {
    const emitted = [];
    handleFabricateSettingChange('fabricate.recipe.r1', {
      recipeManager: perRecordRecipeManagerDouble([{ id: 'r1' }]),
      callAll: (hook) => emitted.push(hook),
    });
    assert.deepEqual(emitted, ['fabricate.recipesChanged']);
  });
});

// --- main.js hook wiring (source pins) ------------------------------------------------
//
// The three registrations live in a `ready` callback that no test under the `npm test`
// glob can reach — nothing calls `fabricate.initialize()` — so they are pinned at the
// source, which is the convention `player-character-actor-types.test.js` established for
// exactly this edge. Each pin below was mutation-proved: the line was removed or altered
// and the assertion went red before being restored.
describe('main.js settings hook wiring (issue 1080 -b)', () => {
  const mainSource = readFileSync(resolve(import.meta.dirname, '..', 'src/main.js'), 'utf8');

  it('registers all THREE settings hooks', () => {
    assert.match(mainSource, /Hooks\.on\('updateSetting', handleFabricateSettingDocumentChange\);/);
    assert.match(mainSource, /Hooks\.on\('createSetting', handleFabricateSettingDocumentChange\);/);
    // Never wired before this change. Under the per-record backend a recipe DELETION is a
    // document delete, so without this leg a removed recipe stays visible on every other
    // client until reload, silently.
    assert.match(mainSource, /Hooks\.on\('deleteSetting', handleFabricateSettingDocumentDelete\);/);
  });

  it('gives the delete leg its own one-parameter listener naming the delete operation', () => {
    // One parameter because `deleteSetting` emits `(doc, options, userId)` — a second
    // positional parameter would receive `options`, which is the defect issue 1024 pinned
    // for the shared listener and which applies identically here.
    assert.match(mainSource, /const handleFabricateSettingDocumentDelete = \(setting\) => \{/);
    assert.match(mainSource, /operation: 'delete'/);
  });

  it('creates exactly ONE batch coalescer, outside the listeners', () => {
    // Per event it would collapse nothing: a flush spans three awaited bulk calls, so the
    // bracket has to outlive any single event to coalesce them into one refresh.
    const occurrences = mainSource.split('createRecipeRefreshCoalescer()').length - 1;
    assert.equal(occurrences, 1, 'one coalescer, created once');
    assert.match(mainSource, /const recipeRefresh = createRecipeRefreshCoalescer\(\);/);
    assert.match(mainSource, /\brecipeRefresh\b/);
  });
});
