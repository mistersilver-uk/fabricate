import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { makeWorldScopeStoreFake } from './helpers/worldScopeStoreFixture.js';

globalThis.foundry = {
  utils: {
    randomID: () => `id-${Math.random().toString(36).slice(2)}`
  }
};

globalThis.game = {
  user: { isGM: true },
  settings: {
    register: () => {},
    get: () => undefined,
    set: async () => undefined
  }
};

const {
  FABRICATE_SETTINGS_NAMESPACE,
  SETTING_KEYS,
  registerFabricateSettings
} = await import('../src/config/settings.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { createAdminStore } = await import('../src/ui/svelte/stores/adminStore.js');
const { createServices, makeRecipe, makeSystem } = await import('./helpers/adminStoreServices.js');
const { gatheringTaskReadiness } = await import(
  '../src/ui/svelte/apps/manager/gathering-task/gatheringTaskReadiness.js'
);

function makeManager() {
  return new CraftingSystemManager({ getRecipes: () => [] });
}

test('registerFabricateSettings registers gathering settings with canonical scopes and defaults', () => {
  const registrations = [];
  globalThis.game.settings.register = (namespace, key, definition) => {
    registrations.push({ namespace, key, definition });
  };

  registerFabricateSettings();

  const gatheringEnvironments = registrations.find(entry => entry.key === SETTING_KEYS.GATHERING_ENVIRONMENTS);
  assert.ok(gatheringEnvironments, 'gatheringEnvironments should be registered');
  assert.equal(gatheringEnvironments.namespace, FABRICATE_SETTINGS_NAMESPACE);
  assert.equal(gatheringEnvironments.definition.scope, 'world');
  assert.equal(gatheringEnvironments.definition.type, Array);
  assert.deepEqual(gatheringEnvironments.definition.default, []);

  const lastGatheringActor = registrations.find(entry => entry.key === SETTING_KEYS.LAST_GATHERING_ACTOR);
  assert.ok(lastGatheringActor, 'lastGatheringActor should be registered');
  assert.equal(lastGatheringActor.namespace, FABRICATE_SETTINGS_NAMESPACE);
  assert.equal(lastGatheringActor.definition.scope, 'client');
  assert.equal(lastGatheringActor.definition.type, String);
  assert.equal(lastGatheringActor.definition.default, '');
});

test('features.gathering defaults to false when omitted', () => {
  const manager = makeManager();
  const normalized = manager._normalizeFeatures({});

  assert.equal(normalized.gathering, false);
});

test('features.gathering is enabled only for the literal boolean true', () => {
  const manager = makeManager();

  assert.equal(manager._normalizeFeatures({ features: { gathering: true } }).gathering, true);
  assert.equal(manager._normalizeFeatures({ features: { gathering: 1 } }).gathering, false);
  assert.equal(manager._normalizeFeatures({ features: { gathering: 'true' } }).gathering, false);
});

test('features.gathering safely normalizes absent or legacy feature objects', () => {
  const manager = makeManager();

  assert.equal(manager._normalizeFeatures({ features: null, enableTags: true }).gathering, false);
  assert.equal(manager._normalizeSystem({ name: 'Legacy System', enableCategories: true }).features.gathering, false);
});

test('recipe categories and item tags normalize on despite legacy disabled flags', () => {
  const manager = makeManager();
  const normalized = manager._normalizeSystem({
    name: 'Legacy Disabled System',
    enableCategories: false,
    enableTags: false,
    features: {
      recipeCategories: false,
      categories: false,
      itemTags: false
    }
  });

  assert.equal(normalized.features.recipeCategories, true);
  assert.equal(normalized.features.categories, true);
  assert.equal(normalized.features.itemTags, true);
  assert.equal(normalized.enableCategories, true);
  assert.equal(normalized.enableTags, true);
});

test('updateSystem ignores recipe category and item tag disable attempts', async () => {
  const manager = makeManager();
  const system = await manager.createSystem({
    id: 'sys-tags',
    name: 'Tags',
    features: {
      recipeCategories: false,
      itemTags: false
    }
  });

  assert.equal(system.features.recipeCategories, true);
  assert.equal(system.features.itemTags, true);

  const updated = await manager.updateSystem('sys-tags', {
    enableCategories: false,
    enableTags: false,
    features: {
      recipeCategories: false,
      categories: false,
      itemTags: false
    }
  });

  assert.equal(updated.features.recipeCategories, true);
  assert.equal(updated.features.categories, true);
  assert.equal(updated.features.itemTags, true);
  assert.equal(updated.enableCategories, true);
  assert.equal(updated.enableTags, true);
});

test('admin gathering task load and save preserve task mode and canonical result groups', async () => {
  let gatheringConfig = {
    systems: {
      sys1: {
        economy: { resolutionMode: 'd100' },
        tasks: [
          {
            id: 'task-routed',
            name: 'Route Herbs',
            resolutionMode: 'routed',
            dropRows: [],
            resultGroups: [
              {
                id: 'group-rich',
                name: 'Rich',
                results: [
                  {
                    id: 'result-herb',
                    systemItemId: 'herb',
                    quantity: 3,
                    propertyMacroUuid: 'Macro.properties'
                  }
                ]
              }
            ]
          }
        ]
      }
    }
  };
  const services = createServices(makeSystem({ features: { gathering: true } }), [], [], {
    getSetting: key => (key === 'gatheringConfig' ? gatheringConfig : ''),
    setSetting: async (key, value) => {
      if (key === 'gatheringConfig') gatheringConfig = structuredClone(value);
    }
  });
  const store = createAdminStore(services);

  await store.selectSystem('sys1');
  let task = get(store.viewState).gatheringConfig.systems.sys1.tasks[0];
  assert.equal(task.resolutionMode, 'routed');
  assert.deepEqual(task.resultGroups[0].results[0], {
    id: 'result-herb',
    componentId: 'herb',
    systemItemId: 'herb',
    itemUuid: null,
    quantity: 3,
    propertyMacroUuid: 'Macro.properties'
  });

  assert.equal(
    await store.updateGatheringLibraryTask('sys1', 'task-routed', { name: 'Saved' }),
    true
  );
  task = gatheringConfig.systems.sys1.tasks[0];
  assert.equal(task.resolutionMode, 'routed');
  assert.equal(task.resultGroups[0].results[0].componentId, 'herb');
  assert.equal(task.resultGroups[0].results[0].propertyMacroUuid, 'Macro.properties');
});

test('admin gathering task validation reads only the selected result source', async () => {
  const system = makeSystem({
    features: { gathering: true },
    gatheringCraftingCheck: {
      failureResultPolicy: 'never',
      routed: {
        type: 'relative',
        relativeOutcomes: [
          { id: 'rich', name: 'Rich Vein', success: true, dc: 5 },
          { id: 'miss', name: 'Miss', success: false, dc: 0 }
        ],
        fixedOutcomes: []
      }
    }
  });
  const store = createAdminStore(createServices(system));
  await store.selectSystem('sys1');

  const invalidInactiveDrops = [{ id: 'inactive', enabled: false, quantity: 1 }];
  const richResult = { id: 'ore', componentId: 'ore', quantity: 2 };
  const straight = {
    id: 'straight',
    name: 'Mine ore',
    resolutionMode: 'straight',
    dropRows: invalidInactiveDrops,
    resultGroups: [{ id: 'results', name: 'Ore', results: [richResult] }]
  };
  assert.deepEqual(store.validateGatheringLibraryTask(straight), {
    valid: true,
    errors: [],
    nameErrors: [],
    resultErrors: []
  });

  const invalidD100Results = {
    ...straight,
    resolutionMode: 'd100',
    dropRows: [{ id: 'drop', itemUuid: 'Item.ore', quantity: 1, dropRate: 100 }],
    resultGroups: [{ id: 'ignored', name: '', results: [{ quantity: 0 }] }]
  };
  assert.deepEqual(store.validateGatheringLibraryTask(invalidD100Results), {
    valid: true,
    errors: [],
    nameErrors: [],
    resultErrors: []
  });

  const routed = {
    ...straight,
    resolutionMode: 'routed',
    resultGroups: [{ id: 'rich', name: '  rich vein  ', results: [richResult] }]
  };
  assert.equal(
    store.validateGatheringLibraryTask(routed).valid,
    true,
    'a failure tier may have no result group'
  );
  const duplicate = store.validateGatheringLibraryTask({
    ...routed,
    resultGroups: [...routed.resultGroups, { ...routed.resultGroups[0], id: 'rich-copy' }]
  });
  assert.equal(duplicate.valid, false);
  assert.ok(duplicate.resultErrors.some(error => error.includes('Rich Vein')));

  for (const quantity of [-1, '2', Number.POSITIVE_INFINITY]) {
    const invalidQuantity = store.validateGatheringLibraryTask({
      ...routed,
      resultGroups: [
        {
          ...routed.resultGroups[0],
          results: [{ ...richResult, quantity }]
        }
      ]
    });
    assert.equal(invalidQuantity.valid, false, `quantity ${String(quantity)} is invalid`);
  }
  assert.equal(
    store.validateGatheringLibraryTask({
      ...straight,
      resultGroups: [{ id: 'empty', name: 'Empty', results: [] }]
    }).valid,
    false,
    'Direct requires its one result group to contain a result'
  );
  assert.equal(
    store.validateGatheringLibraryTask({
      ...straight,
      resultGroups: [straight.resultGroups[0], { ...straight.resultGroups[0], id: 'second' }]
    }).valid,
    false,
    'Direct rejects multiple result groups'
  );

  system.gatheringCraftingCheck.failureResultPolicy = 'perRecord';
  const withFailure = {
    ...routed,
    resultGroups: [
      ...routed.resultGroups,
      { id: 'miss', name: 'Miss', results: [{ id: 'dust', componentId: 'dust', quantity: 1 }] }
    ]
  };
  assert.equal(store.validateGatheringLibraryTask(withFailure).valid, true);
  const duplicateFailure = store.validateGatheringLibraryTask({
    ...withFailure,
    resultGroups: [...withFailure.resultGroups, { ...withFailure.resultGroups[1], id: 'miss-copy' }]
  });
  assert.equal(duplicateFailure.valid, false);
  assert.ok(duplicateFailure.resultErrors.some(error => error.includes('failure tier "Miss"')));
});

test('1522: the store files a blank name apart from the result errors, and the editor routes on that field', async () => {
  const system = makeSystem({
    features: { gathering: true },
    gatheringCraftingCheck: {
      failureResultPolicy: 'never',
      routed: {
        type: 'relative',
        relativeOutcomes: [{ id: 'rich', name: 'Rich Vein', success: true, dc: 5 }],
        fixedOutcomes: []
      }
    }
  });
  const store = createAdminStore(createServices(system));
  await store.selectSystem('sys1');
  const NAME = 'Task name is required';
  const cases = {
    d100: { id: 'd', name: ' ', resolutionMode: 'd100', dropRows: [{ id: 'drop', quantity: 1, dropRate: 100 }] },
    routed: { id: 'r', name: '', resolutionMode: 'routed', dropRows: [], resultGroups: [] }
  };
  for (const [mode, task] of Object.entries(cases)) {
    const validation = store.validateGatheringLibraryTask(task);
    assert.deepEqual(validation.nameErrors, [NAME], `${mode}: the name error has its own field`);
    const others = validation.errors.filter(error => error !== NAME);
    assert.ok(others.length > 0, `${mode}: precondition, the task has result errors too`);
    assert.deepEqual(validation.errors, [NAME, ...others], `${mode}: errors stays the union`);
    assert.equal(validation.valid, false);

    const { rows, counts } = gatheringTaskReadiness({ task, mode, validation });
    const blocking = rows.filter(row => row.status === 'block');
    assert.deepEqual(
      blocking.filter(row => row.group === 'overview').map(row => [row.id, row.message]),
      [['name', NAME]],
      `${mode}: one Overview row`
    );
    assert.deepEqual(
      blocking.filter(row => row.group === 'results').map(row => row.message),
      others,
      `${mode}: one Results row per result error`
    );
    assert.equal(counts.blocking, validation.errors.length);
  }
  const routedError = store.validateGatheringLibraryTask(cases.routed).errors[1];
  assert.match(routedError, /check tier "Rich Vein" requires exactly one matching result group/);
});

test('1522: the editor blocks exactly when the store refuses Save', async () => {
  const store = createAdminStore(createServices(makeSystem({ features: { gathering: true } })));
  await store.selectSystem('sys1');
  const ore = { id: 'ore', componentId: 'ore', quantity: 1 };
  const straight = { id: 's', name: 'Ore', resolutionMode: 'straight', dropRows: [] };
  const tasks = [
    { ...straight, resultGroups: [{ id: 'g', name: 'Ore', results: [ore] }] },
    { ...straight, resultGroups: [] },
    { ...straight, name: '', resultGroups: [{ id: 'g', name: 'Ore', results: [ore] }] },
    { id: 'd', name: 'Forage', resolutionMode: 'd100', dropRows: [] },
    { id: 'p', name: '', resolutionMode: 'progressive' }
  ];
  for (const task of tasks) {
    const validation = store.validateGatheringLibraryTask(task);
    const { counts } = gatheringTaskReadiness({ task, mode: task.resolutionMode, validation });
    assert.equal(counts.blocking > 0, !validation.valid, JSON.stringify(validation.errors));
  }
});

test('admin gathering task validation rejects invalid active results before persistence', async () => {
  let gatheringConfig = {
    systems: {
      sys1: {
        tasks: [
          {
            id: 'task-straight',
            name: 'Mine ore',
            resolutionMode: 'straight',
            dropRows: [],
            resultGroups: [
              {
                id: 'results',
                name: 'Ore',
                results: [{ id: 'ore', componentId: 'ore', quantity: 0 }]
              }
            ]
          }
        ]
      }
    }
  };
  let writeCount = 0;
  const services = createServices(makeSystem({ features: { gathering: true } }), [], [], {
    getSetting: key => (key === 'gatheringConfig' ? gatheringConfig : ''),
    setSetting: async (key, value) => {
      if (key !== 'gatheringConfig') return;
      writeCount += 1;
      gatheringConfig = structuredClone(value);
    }
  });
  const store = createAdminStore(services);
  await store.selectSystem('sys1');
  const normalized = get(store.viewState).gatheringConfig.systems.sys1.tasks[0];

  const validation = store.validateGatheringLibraryTask(normalized);
  assert.equal(validation.valid, false);
  assert.ok(validation.resultErrors.some(error => error.includes('positive finite number')));
  assert.equal(
    await store.updateGatheringLibraryTask('sys1', 'task-straight', { name: 'Still invalid' }),
    false
  );
  assert.equal(writeCount, 0, 'an invalid active result never reaches persistence');
});

test('1645: an imported rolled gathering amount is validated against the same rollability floor', async () => {
  const { seededRollClass } = await import('./helpers/seededRoll.js');
  const { Roll } = seededRollClass({ maxima: { '1d4+1': 5, '1d4 - 10': -6 }, unparsable: ['1d4]'] });
  const previous = globalThis.Roll;
  globalThis.Roll = Roll;
  try {
    const store = createAdminStore(createServices(makeSystem({ features: { gathering: true } })));
    await store.selectSystem('sys1');
    const task = quantityFormula => ({
      id: 'rolled',
      name: 'Mine ore',
      resolutionMode: 'straight',
      dropRows: [],
      resultGroups: [
        { id: 'results', name: 'Ore', results: [{ id: 'ore', componentId: 'ore', quantity: 1, quantityFormula }] }
      ]
    });

    assert.equal(store.validateGatheringLibraryTask(task('1d4+1')).valid, true, 'a rollable amount');
    const never = store.validateGatheringLibraryTask(task('1d4 - 10'));
    assert.equal(never.valid, false, 'an amount that can never award anything');
    assert.ok(never.resultErrors.some(error => error.includes('positive amount')));
    assert.equal(store.validateGatheringLibraryTask(task('1d4]')).valid, false, 'an unrollable one');
  } finally {
    if (previous === undefined) delete globalThis.Roll;
    else globalThis.Roll = previous;
  }
});

test('admin production reporting reads only the active gathering result source', async () => {
  const gatheringConfig = {
    systems: {
      sys1: {
        tasks: [
          {
            id: 'task-straight',
            name: 'Straight Herbs',
            resolutionMode: 'straight',
            dropRows: [{ id: 'inactive', componentId: 'inactive-drop', quantity: 1 }],
            resultGroups: [
              {
                id: 'group-active',
                name: 'Herbs',
                results: [{ id: 'active', componentId: 'active-result', quantity: 1 }]
              }
            ]
          },
          {
            id: 'task-legacy',
            name: 'Legacy Drops',
            dropRows: [{ id: 'legacy', componentId: 'legacy-drop', quantity: 1 }],
            resultGroups: [
              {
                id: 'inactive-group',
                name: 'Inactive',
                results: [{ id: 'ignored', componentId: 'inactive-result', quantity: 1 }]
              }
            ]
          }
        ]
      }
    }
  };
  const scope = makeWorldScopeStoreFake(
    ['active-result', 'inactive-drop', 'legacy-drop', 'inactive-result'].map(id => ({
      id,
      name: id
    }))
  );
  const services = createServices(makeSystem({ features: { gathering: true } }), [], [], {
    getSetting: key => (key === 'gatheringConfig' ? gatheringConfig : ''),
    getComponentScopeStore: () => scope.store
  });
  const store = createAdminStore(services);

  await store.selectSystem('sys1');
  const entries = get(store.viewState).worldScope.component.entries;
  const producers = id => entries.find(entry => entry.id === id)?.producedBy ?? [];

  assert.deepEqual(producers('active-result').map(entry => entry.id), ['task-straight']);
  assert.deepEqual(producers('legacy-drop').map(entry => entry.id), ['task-legacy']);
  assert.deepEqual(producers('inactive-drop'), []);
  assert.deepEqual(producers('inactive-result'), []);
});

test('admin production reporting counts a component a recipe offers only as an alternative', async () => {
  const choice = {
    id: 'cg',
    alternatives: [
      { id: 'a', componentId: 'ingot', quantity: 1 },
      { id: 'b', componentId: 'gem', quantity: 1 }
    ]
  };
  const recipe = makeRecipe({ id: 'r-either', resultGroups: [{ id: 'g', results: [choice] }] });
  const scope = makeWorldScopeStoreFake(['ingot', 'gem'].map(id => ({ id, name: id })));
  const services = createServices(makeSystem(), [recipe], [], {
    getComponentScopeStore: () => scope.store
  });
  const store = createAdminStore(services);

  await store.selectSystem('sys1');
  const entries = get(store.viewState).worldScope.component.entries;
  const gem = entries.find(entry => entry.id === 'gem');
  assert.deepEqual(gem?.producedBy?.map(entry => entry.id), ['r-either']);
  assert.equal(gem?.recipeCount, 1, 'an alternative alone is a reference the delete guard sees');
});
