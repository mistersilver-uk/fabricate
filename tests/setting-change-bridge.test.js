import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { handleFabricateSettingChange } from '../src/config/settingChangeBridge.js';

describe('handleFabricateSettingChange', () => {
  it('reloads systems and re-emits craftingSystemsChanged when the setting changed', () => {
    const emitted = [];
    const craftingSystemManager = { reload: () => true, getSystems: () => [{ id: 's1' }] };
    const handled = handleFabricateSettingChange('fabricate.craftingSystems', {
      craftingSystemManager,
      callAll: (hook, payload) => emitted.push([hook, payload]),
    });
    assert.equal(handled, true);
    assert.deepEqual(emitted, [
      ['fabricate.craftingSystemsChanged', [{ id: 's1' }]],
      // The scoped signal rides beside the published hook on BOTH replication branches (issue
      // 1078 part B1). This double reports no scopes, so the payload is the unattributable one
      // every consumer routes broadly — the safe answer for a manager that cannot name a delta.
      ['fabricate.craftingDataChanged', { source: 'systems', scopes: [] }],
    ]);
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
    assert.equal(emitted.length, 2);
    assert.equal(emitted[0][0], 'fabricate.recipesChanged');
    assert.deepEqual(emitted[0][1], { action: 'external', recipes: [{ id: 'r1' }] });
    assert.deepEqual(emitted[1], ['fabricate.craftingDataChanged', { source: 'recipes', scopes: [] }]);
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

  // --- World currency (issue 1278) -----------------------------------------------------
  // Currency used to be per-system state, so editing it wrote `requirements` on a crafting
  // system and the systems branch above announced `resolution-config` for THAT system. The
  // ladder is world scope now and no system record changes, so this branch is the ONLY thing
  // that tells a connected player's shell a GM moved the coins.
  it('reloads the world currency store and scopes the change to PARTICIPATING systems', () => {
    const emitted = [];
    let loadCalls = 0;
    const handled = handleFabricateSettingChange('fabricate.currencyConfig', {
      currencyConfigStore: {
        load: () => {
          loadCalls += 1;
        },
      },
      craftingSystemManager: {
        getSystems: () => [
          { id: 'on', requirements: { currency: { enabled: true } } },
          { id: 'off', requirements: { currency: { enabled: false } } },
          { id: 'none', requirements: {} },
        ],
      },
      callAll: (hook, payload) => emitted.push([hook, payload]),
    });

    assert.equal(handled, true);
    assert.equal(loadCalls, 1, 'the replicated ladder is re-read into the cache');
    assert.deepEqual(emitted, [
      [
        'fabricate.craftingDataChanged',
        {
          source: 'systems',
          // Only the participating system. A system with currency off resolves nothing against
          // the ladder, so re-narrowing it could not produce an observable difference.
          scopes: [{ systemId: 'on', domains: ['resolution-config'] }],
        },
      ],
    ]);
  });

  it('emits NOTHING when no system participates, rather than an unattributable payload', () => {
    // `craftingDataChange` treats an empty domain set as poisoning the whole payload into a
    // broad invalidation, so emitting an empty-scope change here would invalidate every shell
    // in the world for an edit that can affect none of them.
    const emitted = [];
    const handled = handleFabricateSettingChange('fabricate.currencyConfig', {
      currencyConfigStore: { load: () => {} },
      craftingSystemManager: { getSystems: () => [{ id: 'off', requirements: {} }] },
      callAll: (hook, payload) => emitted.push([hook, payload]),
    });

    assert.equal(handled, true);
    assert.deepEqual(emitted, []);
  });

  it('tolerates a missing currency store and a manager that cannot list systems', () => {
    const emitted = [];
    const handled = handleFabricateSettingChange('fabricate.currencyConfig', {
      callAll: (hook, payload) => emitted.push([hook, payload]),
    });
    assert.equal(handled, true, 'the key is still claimed, so nothing else tries to handle it');
    assert.deepEqual(emitted, []);
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

// The registrations live in a `ready` callback that no test under the `npm test` glob can
// reach — nothing calls `fabricate.initialize()` — so they are pinned at the source, which is
// the convention `player-character-actor-types.test.js` established for exactly this edge.
// Each pin below was mutation-proved: the line was removed or altered and the assertion went
// red before being restored.
describe('main.js settings hook wiring', () => {
  const mainSource = readFileSync(resolve(import.meta.dirname, '..', 'src/main.js'), 'utf8');

  it('registers BOTH settings hooks on ONE shared listener', () => {
    // The first-ever write to a world setting is a CREATE, not an update (issue 1024), so a
    // world that has never stored `fabricate.recipes` propagates its first GM edit to nobody
    // until reload without the `createSetting` leg. They share one listener so the two cannot
    // drift, which `player-character-actor-types.test.js` and `item-stack-quantity.test.js`
    // both depend on.
    assert.match(mainSource, /Hooks\.on\('updateSetting', handleFabricateSettingDocumentChange\);/);
    assert.match(mainSource, /Hooks\.on\('createSetting', handleFabricateSettingDocumentChange\);/);
  });

  it('hands the bridge the LIVE collaborators, resolved per call', () => {
    // `fabricate.recipeManager` is assembled during `ready`, so a value captured at wiring
    // time would be stale for the rest of the session. The factory is a thunk for that
    // reason, and the listener must call it rather than close over a snapshot.
    const targetsStart = mainSource.indexOf('const fabricateSettingChangeTargets = () => ({');
    assert.ok(targetsStart > -1, 'the targets factory is still present');
    // Anchored on the closing LINE (newline + the two-space indent), not on a bare `});`.
    // A comment inside the factory containing `});` would otherwise truncate the slice and
    // redden this test with the property untouched.
    const targetsBody = mainSource.slice(
      targetsStart,
      mainSource.indexOf('\n  });', targetsStart) + 6
    );
    for (const property of [
      'craftingSystemManager',
      'recipeManager',
      'gatheringEnvironmentStore',
      'callAll',
    ]) {
      assert.ok(
        targetsBody.includes(`\n    ${property}: `),
        `the targets factory must carry ${property}`
      );
    }
    // And the listener must INVOKE it. Pinning only where the property lives says nothing
    // about whether a leg uses it: deleting the call left this suite fully green while every
    // replicated GM edit stopped reaching any manager, because the bridge's behavioural tests
    // build their targets locally and nothing else can see a wiring regression here.
    assert.match(
      mainSource,
      /handleFabricateSettingChange\(key, fabricateSettingChangeTargets\(\)\);/,
      'the shared listener must call the factory, not close over a snapshot'
    );
  });
});
