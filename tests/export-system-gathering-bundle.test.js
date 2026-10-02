/**
 * Regression guard for issue #642: the PUBLIC `game.fabricate.exportSystem()` dropped the gathering
 * authoring bundle because its `buildExportPayload(...)` call passed only three arguments,
 * defaulting `gatheringEnvironments` to `[]` and `gatheringConfig` to `{}`. Both shipped export
 * paths are driven: the published API and the Manager's admin store.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { bindFabricateGlobal } from '../src/bootstrap/publicApi.js';
import { buildExportPayload } from '../src/systems/CraftingSystemExporter.js';
import { createAdminStore } from '../src/ui/svelte/stores/adminStore.js';
import { makeHarness } from './helpers/authoringExportHarness.js';
import { buildFullAuthoringFixture, FIXTURE_SYSTEM_ID } from './helpers/fullAuthoringFixture.js';

const VERSION = '9.9.9';

// Every authoring-bearing field EXCEPT the volatile `exportedAt` timestamp.
const COMPARED_FIELDS = [
  'schemaVersion',
  'system',
  'recipes',
  'gatheringEnvironments',
  'gatheringConfig',
  'currencyConfig',
  'travelConfig',
  'characterLibraries',
  'componentScope',
  'essenceScope',
  'toolScope',
];
function pickComparedFields(envelope) {
  return Object.fromEntries(COMPARED_FIELDS.map((key) => [key, envelope[key]]));
}

/** A world-scope setting whose one entity is a member of the fixture system. */
function scopeWith(entityId) {
  return {
    entities: [{ id: entityId, name: entityId }],
    defaults: {},
    membership: {
      [`${entityId}|${FIXTURE_SYSTEM_ID}`]: {
        entityId,
        systemId: FIXTURE_SYSTEM_ID,
        inherit: {},
      },
    },
  };
}

/** The full fixture, plus the world slices it does not seed, each distinct from its siblings. */
function worldHarness(fixture = buildFullAuthoringFixture()) {
  const h = makeHarness(fixture);
  h.settings.set('currencyConfig', {
    spendStrategy: 'macro',
    providerId: 'probe-provider',
    units: [{ id: 'gp', name: 'Gold' }],
  });
  h.settings.set('componentScope', scopeWith('world-component'));
  h.settings.set('essenceScope', scopeWith('world-essence'));
  h.settings.set('toolScope', scopeWith('world-tool'));
  return h;
}

/** A world store over one harness setting, answering it through `get()`. */
const settingStore = (h, key) => ({ get: () => h.getSetting(key) });

/** `game.fabricate.exportSystem`, as `bindFabricateGlobal` publishes it over the harness world. */
function exportThroughPublicApi(h, systemId) {
  globalThis.game = {
    user: { id: 'gm', isGM: true },
    modules: { get: () => ({ version: VERSION }) },
    settings: { get: (_namespace, key) => h.getSetting(key) },
  };
  bindFabricateGlobal(
    {
      craftingSystemManager: h.systemManager,
      recipeManager: h.recipeManager,
      gatheringEnvironmentStore: h.environmentStore,
      currencyConfigStore: settingStore(h, 'currencyConfig'),
      gatheringRealmStore: settingStore(h, 'travelConfig'),
      characterLibrariesStore: settingStore(h, 'characterLibraries'),
      getComponentScopeStore: () => settingStore(h, 'componentScope'),
      getEssenceScopeStore: () => settingStore(h, 'essenceScope'),
      getToolScopeStore: () => settingStore(h, 'toolScope'),
    },
    {}
  );
  return globalThis.game.fabricate.exportSystem(systemId);
}

/** The Manager's Export button: the admin store's `exportSystem`, downloading its JSON. */
async function exportThroughAdminStore(h, systemId) {
  let downloaded = null;
  const store = createAdminStore({
    getSetting: (key) => h.getSetting(key),
    getCraftingSystemManager: () => h.systemManager,
    getRecipeManager: () => h.recipeManager,
    getModuleVersion: () => VERSION,
    getGatheringEnvironmentStore: () => h.environmentStore,
    getCurrencyConfigStore: () => settingStore(h, 'currencyConfig'),
    getGatheringRealmStore: () => settingStore(h, 'travelConfig'),
    getCharacterLibrariesStore: () => settingStore(h, 'characterLibraries'),
    getComponentScopeStore: () => settingStore(h, 'componentScope'),
    getEssenceScopeStore: () => settingStore(h, 'essenceScope'),
    getToolScopeStore: () => settingStore(h, 'toolScope'),
    downloadFile: async (json) => {
      downloaded = JSON.parse(json);
    },
    notify: { info: () => {}, warn: () => {}, error: () => {} },
  });
  await store.exportSystem(systemId);
  return downloaded;
}

test('public-API export carries the gathering authoring bundle (non-empty)', () => {
  const fixture = buildFullAuthoringFixture();
  const sourceTask = fixture.gatheringConfig.systems[FIXTURE_SYSTEM_ID].tasks[0];
  sourceTask.resolutionMode = 'routed';
  sourceTask.resultGroups = [
    {
      id: 'route-rich',
      name: 'Rich',
      results: [{ id: 'result-herb', componentId: 'comp-herb', quantity: 2 }],
    },
  ];
  const envelope = exportThroughPublicApi(worldHarness(fixture), FIXTURE_SYSTEM_ID);

  assert.ok(
    envelope.gatheringEnvironments.length > 0,
    'gatheringEnvironments is populated, not the dropped [] default'
  );
  assert.ok(
    (envelope.gatheringConfig.system.tasks?.length ?? 0) > 0,
    'the exported gatheringConfig slice retains the system tasks'
  );
  assert.equal(envelope.gatheringConfig.system.tasks[0].resolutionMode, 'routed');
  assert.deepEqual(envelope.gatheringConfig.system.tasks[0].resultGroups, sourceTask.resultGroups);
});

test('both shipped export paths hand the exporter every world slice it emits', async () => {
  // A slice added to `buildExportPayload` is DEFAULTED by a call site that forgets it, so neither
  // path throws: each would export it empty. Hence the envelope's keys are pinned, and every slice
  // is shown to differ from what the dropped three-argument call produces.
  const h = worldHarness();
  const system = h.systemManager.getSystem(FIXTURE_SYSTEM_ID);
  const recipes = h.recipeManager
    .getRecipes({ craftingSystemId: FIXTURE_SYSTEM_ID })
    .map((recipe) => recipe.toJSON());
  const dropped = buildExportPayload(system, recipes, VERSION);

  const viaPublic = exportThroughPublicApi(h, FIXTURE_SYSTEM_ID);
  const viaAdminStore = await exportThroughAdminStore(h, FIXTURE_SYSTEM_ID);
  assert.deepEqual(
    Object.keys(viaPublic).sort(),
    [...COMPARED_FIELDS, 'exportedAt', 'fabricateVersion', 'runtimeStateIncluded'].sort(),
    'the exporter gained or lost a slice: add it to both call sites and to this list'
  );
  for (const field of COMPARED_FIELDS.slice(3)) {
    assert.notDeepEqual(viaPublic[field], dropped[field], `the public API carries ${field}`);
  }
  assert.deepEqual(
    pickComparedFields(viaAdminStore),
    pickComparedFields(viaPublic),
    'the two export paths must produce equivalent envelopes for the same system'
  );
  assert.equal(viaAdminStore.fabricateVersion, viaPublic.fabricateVersion);
});

test('the dropped 3-arg call is exactly what emptied the bundle (defect reproduction)', () => {
  const h = worldHarness();
  const system = h.systemManager.getSystem(FIXTURE_SYSTEM_ID);
  const recipes = h.recipeManager
    .getRecipes({ craftingSystemId: FIXTURE_SYSTEM_ID })
    .map((r) => r.toJSON());

  const threeArg = buildExportPayload(system, recipes, VERSION);
  const published = exportThroughPublicApi(h, FIXTURE_SYSTEM_ID);

  assert.equal(threeArg.gatheringEnvironments.length, 0, '3-arg drops every environment');
  assert.equal(Object.keys(threeArg.gatheringConfig.system).length, 0, '3-arg drops the slice');
  assert.ok(published.gatheringEnvironments.length > 0, 'the published export restores them');
  assert.ok(Object.keys(published.gatheringConfig.system).length > 0, 'and the config slice');
});
