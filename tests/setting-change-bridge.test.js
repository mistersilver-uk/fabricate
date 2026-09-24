import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { handleFabricateSettingChange } from '../src/config/settingChangeBridge.js';
import { SETTING_KEYS } from '../src/config/settings.js';
import { handlerOf } from './helpers/bootContractProbes.js';
import { withFabricateLifecycleReplay } from './helpers/extension-composition-harness.js';

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
      // The scoped signal rides beside the published hook on BOTH replication branches (issue 1078
      // part B1).
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

  // World currency (issue 1278) ----------------------------------------------------- Currency used
  // to be per-system state, so editing it wrote `requirements` on a crafting system and the systems
  // branch above announced `resolution-config` for THAT system.
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
      // The manager republish comes first and is unconditional: a second GM's World > Currency
      // tab is stale whether or not any crafting system currently participates.
      [
        'fabricate.craftingSystemsChanged',
        [
          { id: 'on', requirements: { currency: { enabled: true } } },
          { id: 'off', requirements: { currency: { enabled: false } } },
          { id: 'none', requirements: {} },
        ],
      ],
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

  // The WORLD travel leg (issue 1282). Realms left the crafting system record, so the systems
  // branch above can no longer announce a realm edit through `SYSTEM_FIELD_DOMAINS`.
  it('reloads the world realm library and scopes the change to PARTICIPATING systems', () => {
    const emitted = [];
    const order = [];
    const handled = handleFabricateSettingChange('fabricate.travelConfig', {
      travelStore: {
        load: () => order.push('load'),
      },
      craftingSystemManager: {
        getSystems: () => [
          { id: 'on', gatheringRealmSettings: { enabled: true } },
          { id: 'off', gatheringRealmSettings: { enabled: false } },
          { id: 'none' },
        ],
      },
      callAll: (hook, payload) => {
        order.push(hook);
        emitted.push([hook, payload]);
      },
    });

    assert.equal(handled, true);
    // ORDERING IS A MUST: a consumer that reacts reads the library back through the store.
    assert.equal(order[0], 'load', 'the library is re-read BEFORE anything is announced');

    const [republish, change] = emitted;
    assert.equal(republish[0], 'fabricate.craftingSystemsChanged');
    assert.equal(change[0], 'fabricate.craftingDataChanged');
    assert.deepEqual(
      change[1].scopes,
      // Only the participating system. One with Travel & Realms off gates nothing on location,
      // and a system carrying no settings at all answers the same.
      [{ systemId: 'on', domains: ['resolution-config'] }],
      'the realm edit is attributed to the systems that can resolve against it'
    );
  });

  it('travel: tolerates a missing realm store and still claims the key', () => {
    const emitted = [];
    const handled = handleFabricateSettingChange('fabricate.travelConfig', {
      callAll: (hook, payload) => emitted.push([hook, payload]),
    });

    assert.equal(handled, true, 'the key is still claimed, so nothing else tries to handle it');
    assert.deepEqual(emitted, [['fabricate.craftingSystemsChanged', []]]);
  });

  // The WORLD character libraries leg (issue 1308).
  it('reloads the character-libraries store and announces the UNION of all three domains', () => {
    const emitted = [];
    const order = [];
    const handled = handleFabricateSettingChange('fabricate.characterLibraries', {
      characterLibrariesStore: {
        load: () => order.push('load'),
      },
      craftingSystemManager: {
        getSystems: () => [{ id: 'alpha' }, { id: 'beta' }],
      },
      callAll: (hook, payload) => {
        order.push(hook);
        emitted.push([hook, payload]);
      },
    });

    assert.equal(handled, true);
    // ORDERING IS A MUST, not an accident.
    assert.equal(order[0], 'load', 'the store is re-read BEFORE anything is announced');

    const [republish, change] = emitted;
    assert.equal(republish[0], 'fabricate.craftingSystemsChanged');
    assert.equal(change[0], 'fabricate.craftingDataChanged');
    assert.deepEqual(
      change[1].scopes,
      [
        // EVERY system, not just participants: there is no participation flag here by design, so
        // any system may reference any entry by id.
        { systemId: 'alpha', domains: ['labelling', 'resolution-config', 'access-and-knowledge'] },
        { systemId: 'beta', domains: ['labelling', 'resolution-config', 'access-and-knowledge'] },
      ],
      'every system, carrying the union of the three domains the two libraries used to carry'
    );
  });

  it('character libraries: emits NOTHING in a world with no crafting systems', () => {
    // Same reasoning as the currency leg's zero-participant case: an empty scope list poisons
    // `craftingDataChange` into a broad invalidation of every shell in the world.
    const emitted = [];
    const handled = handleFabricateSettingChange('fabricate.characterLibraries', {
      characterLibrariesStore: { load: () => {} },
      craftingSystemManager: { getSystems: () => [] },
      callAll: (hook, payload) => emitted.push([hook, payload]),
    });

    assert.equal(handled, true);
    assert.deepEqual(
      emitted.map(([hook]) => hook),
      ['fabricate.craftingSystemsChanged'],
      'the manager republish still fires; the scoped change does not'
    );
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
    assert.deepEqual(
      emitted,
      [['fabricate.craftingSystemsChanged', [{ id: 'off', requirements: {} }]]],
      'the manager still republishes; only the scoped shell signal is withheld'
    );
  });

  it('tolerates a missing currency store and a manager that cannot list systems', () => {
    const emitted = [];
    const handled = handleFabricateSettingChange('fabricate.currencyConfig', {
      callAll: (hook, payload) => emitted.push([hook, payload]),
    });
    assert.equal(handled, true, 'the key is still claimed, so nothing else tries to handle it');
    assert.deepEqual(emitted, [['fabricate.craftingSystemsChanged', []]]);
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

// World scope stores (issue 1359, epic 1357) --------------------------------------------- A client
// that booted before the migrating GM wrote keeps `isSeeded() === false` for the whole session.
describe('the world scope legs', () => {
  // FOUR LEGS SINCE ISSUE 1392, and the fourth is not a scoped-entity store.
  const SCOPES = [
    {
      name: 'componentScope',
      key: 'fabricate.componentScope',
      target: 'componentScopeStore',
      module: '../src/systems/worldScopeStores.js',
      factory: 'createComponentScopeStore',
      subKey: 'entities',
      payload: { entities: [{ id: 'w1', name: 'Replicated' }] },
      ids: (store) => store.listEntities().map((entity) => entity.id),
    },
    {
      name: 'essenceScope',
      key: 'fabricate.essenceScope',
      target: 'essenceScopeStore',
      module: '../src/systems/worldScopeStores.js',
      factory: 'createEssenceScopeStore',
      subKey: 'entities',
      payload: { entities: [{ id: 'w1', name: 'Replicated' }] },
      ids: (store) => store.listEntities().map((entity) => entity.id),
    },
    {
      name: 'toolScope',
      key: 'fabricate.toolScope',
      target: 'toolScopeStore',
      module: '../src/systems/worldScopeStores.js',
      factory: 'createToolScopeStore',
      subKey: 'entities',
      payload: { entities: [{ id: 'w1', name: 'Replicated' }] },
      ids: (store) => store.listEntities().map((entity) => entity.id),
    },
    {
      name: 'worldVocabulary',
      key: 'fabricate.worldVocabulary',
      target: 'worldVocabularyStore',
      module: '../src/systems/WorldVocabularyStore.js',
      factory: 'createWorldVocabularyStore',
      subKey: 'componentTags',
      payload: { componentTags: [{ id: 'w1', name: 'w1' }] },
      ids: (store) => store.list('componentTags').map((entry) => entry.id),
    },
  ];

  for (const scope of SCOPES) {
    it(`reloads the ${scope.name} store BEFORE announcing, so a consumer reads the post-edit corpus`, async () => {
      // THE ORDER IS THE WHOLE POINT. Every consumer that reacts reads the corpus back through the
      // store, so announcing first hands it the pre-edit value and caches that as the new truth.
      const module = await import(scope.module);
      const values = new Map();
      const store = module[scope.factory]({
        getSetting: (key) => values.get(key),
        setSetting: async (key, value) => values.set(key, value),
      });
      store.load();
      assert.equal(store.isSeeded(scope.subKey), false, 'unwritten before the replicated write');

      // The replicated write lands in the settings store first; the hook fires afterwards.
      values.set(scope.name, scope.payload);

      const observed = [];
      const handled = handleFabricateSettingChange(scope.key, {
        [scope.target]: store,
        craftingSystemManager: { getSystems: () => [{ id: 's1' }] },
        callAll: () => {
          observed.push({ seeded: store.isSeeded(scope.subKey), ids: scope.ids(store) });
        },
      });

      assert.equal(handled, true);
      assert.ok(observed.length > 0, 'the leg announced at least once');
      for (const seen of observed) {
        assert.equal(seen.seeded, true, 'isSeeded() is RE-DERIVED before any consumer is told');
        assert.deepEqual(seen.ids, ['w1'], 'and the corpus is the post-edit one');
      }
    });

    it(`tolerates a missing ${scope.name} store`, () => {
      assert.equal(handleFabricateSettingChange(scope.key, { callAll: () => {} }), true);
    });
  }
});

// The listener `src/bootstrap/hooks.js` registers for BOTH setting hooks (one handler, the boot
// contract's `createSettingSharesUpdateSettingListener`), called after a real boot as core calls
// `createSetting`: `(document, options, userId)`.

/** The collaborator each replicated key reloads, named by its `game.fabricate` field. */
const RELOADED_BY_KEY = Object.freeze({
  'fabricate.craftingSystems': ['craftingSystemManager.reload'],
  'fabricate.recipes': ['recipeManager.reload'],
  'fabricate.gatheringEnvironments': ['gatheringEnvironmentStore.load'],
  'fabricate.currencyConfig': ['currencyConfigStore.load'],
  'fabricate.travelConfig': ['gatheringRealmStore.load'],
  'fabricate.characterLibraries': ['characterLibrariesStore.load'],
  'fabricate.componentScope': ['componentScopeStore.load'],
  'fabricate.essenceScope': ['essenceScopeStore.load'],
  'fabricate.toolScope': ['toolScopeStore.load'],
  'fabricate.worldVocabulary': ['worldVocabularyStore.load'],
});

/** Swap every object-valued facade field for a recorder AFTER the boot, logging each read. */
function recordFacadeFields(facade) {
  const read = new Set();
  const reached = [];
  const restores = [];
  for (const name of Object.keys(facade)) {
    const own = Object.getOwnPropertyDescriptor(facade, name);
    if (typeof own.value !== 'object' || own.value === null) continue;
    const recorder = {
      getSystems: () => [],
      load: () => reached.push(`${name}.load`),
      reload: () => reached.push(`${name}.reload`) && false,
    };
    Object.defineProperty(facade, name, {
      get: () => read.add(name) && recorder,
      configurable: true,
    });
    restores.push(() => Object.defineProperty(facade, name, own));
  }
  return { read, reached, restore: () => restores.forEach((restore) => restore()) };
}

describe('the boot-registered settings listener', () => {
  it('reloads the LIVE collaborator each key names, and hands the bridge nothing without a key', { timeout: 300000 }, async () => {
    await withFabricateLifecycleReplay(async ({ ready, loadModule }) => {
      const { default: facade } = await loadModule('/src/main.js');
      await ready();
      const listener = handlerOf('createSetting');
      const hooks = globalThis.Hooks;
      const { callAll } = hooks;
      const emitted = [];
      hooks.callAll = (hook) => emitted.push(hook);
      const fields = recordFacadeFields(facade);
      const change = (key) => {
        fields.reached.length = 0;
        emitted.length = 0;
        listener({ key, value: null }, {}, 'user-lab-gm');
        return { reached: [...fields.reached], emitted: [...emitted] };
      };
      try {
        fields.read.clear();
        change('fabricate.theme');
        const handed = [...fields.read].sort();

        const reloadedByKey = {};
        for (const setting of Object.values(SETTING_KEYS)) {
          const { reached } = change(`fabricate.${setting}`);
          if (reached.length > 0) reloadedByKey[`fabricate.${setting}`] = reached;
        }
        assert.deepEqual(reloadedByKey, RELOADED_BY_KEY);
        const reloaded = new Set(Object.values(reloadedByKey).flatMap((calls) => calls));
        assert.deepEqual(
          handed,
          [...reloaded].map((call) => call.split('.')[0]).sort(),
          'every collaborator the listener hands the bridge is reloaded by some key; one with no ' +
            'leg would no-op silently'
        );

        assert.deepEqual(change('fabricate.currencyConfig').emitted, [
          'fabricate.craftingSystemsChanged',
        ]);
        assert.deepEqual(
          change(`fabricate.${SETTING_KEYS.ADDITIONAL_PLAYER_CHARACTER_ACTOR_TYPES}`).emitted,
          ['fabricate.playerCharacterTypesChanged'],
          'the create leg carries the player-character types too, on the live Hooks.callAll'
        );
      } finally {
        fields.restore();
        hooks.callAll = callAll;
      }
    });
  });
});
