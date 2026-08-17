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

describe('a whole-corpus setting DELETE is handled and deliberately inert (issue 1080 -b)', () => {
  /**
   * Every collaborator throws. A delete of one of these keys must reach none of them: the
   * document is already out of the collection when the hook fires, so a re-read is answered
   * with the REGISTERED DEFAULT — `[]` — and acting on it patches the client's map empty and
   * tells every open view the corpus is gone.
   */
  function refusingTargets(emitted) {
    return {
      craftingSystemManager: {
        reload: () => {
          throw new Error('a deleted whole-corpus key must not be re-read');
        },
        getSystems: () => [],
      },
      recipeManager: {
        reload: () => {
          throw new Error('a deleted whole-corpus key must not be re-read');
        },
        getRecipes: () => [],
      },
      gatheringEnvironmentStore: {
        load: () => {
          throw new Error('a deleted whole-corpus key must not be re-read');
        },
      },
      callAll: (hook, payload) => emitted.push([hook, payload]),
    };
  }

  const WHOLE_CORPUS_KEYS = [
    'fabricate.craftingSystems',
    'fabricate.recipes',
    'fabricate.gatheringEnvironments',
  ];

  for (const key of WHOLE_CORPUS_KEYS) {
    it(`ignores a delete of ${key} rather than reloading it to its default`, () => {
      // `deleteSetting` is wired for the first time by this change and is registered
      // UNCONDITIONALLY, so this leg is live on every world today. It becomes reachable at
      // -c's conversion step 4, which retires `fabricate.recipes` while other clients may
      // still be reading through it.
      const emitted = [];
      const handled = handleFabricateSettingChange(key, {
        ...refusingTargets(emitted),
        operation: 'delete',
        document: null,
      });
      assert.equal(handled, true, 'still a handled Fabricate key, just not an actionable one');
      assert.deepEqual(emitted, [], 'and nothing is told the corpus emptied');
    });
  }

  it('guards the delete leg ONLY, so a delivering leg still reloads and re-emits', () => {
    // The guard must not become a way for a write to go unnoticed. `createSetting` and
    // `updateSetting` both report `'update'` — the seam's question is whether a record was
    // delivered, not which hook delivered it — so this one case covers both legs, including
    // the FIRST-ever write issue 1024 wired `createSetting` for.
    const emitted = [];
    const handled = handleFabricateSettingChange('fabricate.recipes', {
      recipeManager: { reload: () => true, getRecipes: () => [{ id: 'r1' }] },
      callAll: (hook, payload) => emitted.push([hook, payload]),
      operation: 'update',
    });
    assert.equal(handled, true);
    assert.deepEqual(emitted, [
      ['fabricate.recipesChanged', { action: 'external', recipes: [{ id: 'r1' }] }],
    ]);
  });

  it('does not swallow a delete of a key outside the whole-corpus set', () => {
    // The two storage keys and the per-record keys have their own delete semantics, and the
    // record branch in particular DEPENDS on the delete reaching it.
    const recipeManager = perRecordRecipeManagerDouble();
    handleFabricateSettingChange('fabricate.recipe.r1', {
      recipeManager,
      callAll: () => {},
      operation: 'delete',
      document: { key: 'fabricate.recipe.r1' },
    });
    assert.deepEqual(
      recipeManager.seen.map((change) => change.operation),
      ['delete'],
      'a per-record delete is the one signal the record branch cannot infer any other way'
    );
    const emitted = [];
    handleFabricateSettingChange('fabricate.recipeStorageTarget', {
      recipeManager: { getRecipes: () => [] },
      callAll: (hook, payload) => emitted.push([hook, payload]),
      operation: 'delete',
    });
    assert.deepEqual(emitted, [
      ['fabricate.recipeStorageLayoutChanged', { key: 'fabricate.recipeStorageTarget' }],
    ]);
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
      operation: 'update',
      document,
    });
    assert.equal(handled, true);
    assert.deepEqual(recipeManager.seen, [
      { key: 'fabricate.recipe.r1', operation: 'update', document },
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

  it('emits only the two operations the bridge declares, and never a third', () => {
    // The seam is `'update'|'delete'`: was a record DELIVERED, or REMOVED? The create and
    // update legs answer that question identically, so they share one listener and one
    // reported operation — and an earlier revision's `'create'`, which the JSDoc declared
    // and no leg ever emitted, is gone from both sides rather than left as a path four
    // tests could drive and production could not reach.
    const operations = [...mainSource.matchAll(/\boperation: '([a-z]+)'/g)].map(
      (match) => match[1]
    );
    assert.deepEqual(
      [...new Set(operations)].sort(),
      ['delete', 'update'],
      'main.js must not emit an operation the bridge does not declare'
    );
  });

  it('creates exactly ONE batch coalescer, hands it to the bridge, and exposes it', () => {
    // Per event it would collapse nothing: a flush spans three awaited bulk calls, so the
    // bracket has to outlive any single event to coalesce them into one refresh.
    const occurrences = mainSource.split('createRecipeRefreshCoalescer()').length - 1;
    assert.equal(occurrences, 1, 'one coalescer, created once');
    // Created and published at MODULE SCOPE, not inside the `ready` handler. `initialize()`
    // is awaited from that handler well before it reaches this wiring, and
    // -c's Storage Layout Conversion runs inside `_runMigrations` under `initialize()`. A
    // bracket published in the handler would still be `undefined` when the conversion opened
    // it, `?.open()` would no-op, and the only symptom would be three refresh bursts instead
    // of one. Pinned by ORDER so a move back into the handler reddens.
    const creationAt = mainSource.indexOf('fabricate.recipeRefresh = createRecipeRefreshCoalescer();');
    const readyAt = mainSource.indexOf("Hooks.once('ready'");
    assert.ok(creationAt > -1, 'the coalescer is created and published in one statement');
    assert.ok(readyAt > -1, 'the ready handler is still present');
    assert.ok(
      creationAt < readyAt,
      'the coalescer must be published before the ready handler, because initialize() runs inside it'
    );
    // Scoped to the factory AND line-anchored. The two constraints fix different holes and
    // an earlier form had one each: `[^}]*` spanned comments inside the literal, so a
    // deleted property with a comment mentioning it stayed green; a bare line anchor over
    // the whole file stopped proving the property is in the factory at all, so relocating
    // it elsewhere stayed green. Slicing first, then anchoring, closes both.
    const targetsStart = mainSource.indexOf('const fabricateSettingChangeTargets = () => ({');
    assert.ok(targetsStart > -1, 'the targets factory is still present');
    // Anchored on the closing LINE (newline + the two-space indent), not on a bare `});`.
    // A comment inside the factory containing `});` would otherwise truncate the slice and
    // redden this test with the property untouched - a spurious red rather than a hole, but
    // still a test that fails for the wrong reason.
    const targetsBody = mainSource.slice(
      targetsStart,
      mainSource.indexOf('\n  });', targetsStart) + 6
    );
    assert.match(
      targetsBody,
      /^\s+recipeRefresh,?\s*$/m,
      'the coalescer is a property of the targets factory'
    );
    // And every leg actually SPREADS that factory. The pin above proves only where the
    // property lives; it says nothing about whether a leg uses it. Deleting the spread from
    // the delete leg strips it of `craftingSystemManager`, `recipeManager`,
    // `gatheringEnvironmentStore`, `callAll` AND `recipeRefresh` at once, and left this
    // suite fully green — the failure the sibling case at the top of this file describes as
    // "a removed recipe stays visible on every other client until reload, silently". The
    // bridge's own behavioural tests build their targets locally, so nothing else can see a
    // wiring regression here.
    assert.equal(
      mainSource.split('...fabricateSettingChangeTargets(),').length - 1,
      2,
      'both the shared listener and the delete leg must spread the targets factory'
    );
    // And published, because the bracket does no work for the client that WROTE the batch —
    // `applyReplicatedRecordChange` returns false there, so it never signals — while every
    // client it does work for is one this `ready` closure is invisible to. Without a route
    // to a caller, `open`/`close` is a contract with no implementation.
    // Anchored for the same reason: unanchored, a commented-out publish line still matches.
    assert.match(mainSource, /^fabricate\.recipeRefresh = createRecipeRefreshCoalescer\(\);$/m);
    // The middle link. The pins above prove the coalescer is created and published, and that
    // the factory carries the property - but nothing tied the local binding to the published
    // bracket, so `const recipeRefresh = null;` left every leg receiving null and shipped
    // green.
    assert.match(mainSource, /^\s+const recipeRefresh = fabricate\.recipeRefresh;$/m);
  });
});
