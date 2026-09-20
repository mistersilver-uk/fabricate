/**
 * Regression guard for issue #642: the PUBLIC `game.fabricate.exportSystem()` dropped the gathering
 * authoring bundle because its `buildExportPayload(...)` call passed only three arguments,
 * defaulting `gatheringEnvironments` to `[]` and `gatheringConfig` to `{}`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  makeHarness,
  exportViaPublicApiResolution,
  exportViaAdminStoreResolution,
} from './helpers/authoringExportHarness.js';
import { buildExportPayload } from '../src/systems/CraftingSystemExporter.js';
import { buildFullAuthoringFixture, FIXTURE_SYSTEM_ID } from './helpers/fullAuthoringFixture.js';
import { collectSources, repoRoot } from './helpers/sourceScan.js';

// The entry and the `src/bootstrap/` modules it split into (issue 1715), read through ONE call.
const FABRICATE_ENTRY_SOURCES = collectSources(resolve(repoRoot, 'src'), { extensions: ['.js'] });
const FABRICATE_ENTRY_SOURCE = Object.keys(FABRICATE_ENTRY_SOURCES)
  .filter((file) => file.startsWith('src/bootstrap/') || file === 'src/main.js')
  .sort()
  .map((file) => FABRICATE_ENTRY_SOURCES[file])
  .join('\n');


const __dirname = dirname(fileURLToPath(import.meta.url));
const mainSource = FABRICATE_ENTRY_SOURCE;
const adminStoreSource = readFileSync(
  resolve(__dirname, '../src/ui/svelte/stores/adminStore.js'),
  'utf8'
);
const exporterSource = readFileSync(
  resolve(__dirname, '../src/systems/CraftingSystemExporter.js'),
  'utf8'
);

// The comparison the acceptance calls for: every authoring-bearing field EXCEPT
// the volatile `exportedAt` timestamp (which differs between two invocations).
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

test('public-API export carries the gathering authoring bundle (non-empty)', () => {
  const fixture = buildFullAuthoringFixture();
  const sourceTask = fixture.gatheringConfig.systems[FIXTURE_SYSTEM_ID].tasks[0];
  sourceTask.resolutionMode = 'routed';
  sourceTask.resultGroups = [
    {
      id: 'route-rich',
      name: 'Rich',
      results: [{ id: 'result-herb', componentId: 'comp-herb', quantity: 2 }]
    }
  ];
  const h = makeHarness(fixture);

  const envelope = exportViaPublicApiResolution(h, FIXTURE_SYSTEM_ID);

  // The environments for this system rode along (the fixture seeds two).
  assert.ok(Array.isArray(envelope.gatheringEnvironments), 'gatheringEnvironments is an array');
  assert.ok(
    envelope.gatheringEnvironments.length > 0,
    'gatheringEnvironments is populated, not the dropped [] default'
  );
  // The per-system gatheringConfig slice rode along (tasks/events/rules present).
  assert.ok(
    envelope.gatheringConfig && typeof envelope.gatheringConfig === 'object',
    'gatheringConfig is an object'
  );
  assert.ok(
    Object.keys(envelope.gatheringConfig.system).length > 0,
    'gatheringConfig.system is populated, not the dropped {} default'
  );
  assert.ok(
    (envelope.gatheringConfig.system.tasks?.length ?? 0) > 0,
    'the exported gatheringConfig slice retains the system tasks'
  );
  assert.equal(envelope.gatheringConfig.system.tasks[0].resolutionMode, 'routed');
  assert.deepEqual(envelope.gatheringConfig.system.tasks[0].resultGroups, sourceTask.resultGroups);
});

test('public-API and admin-store export paths emit equivalent envelopes (excluding exportedAt)', () => {
  const fixture = buildFullAuthoringFixture();
  const h = makeHarness(fixture);

  const viaPublic = exportViaPublicApiResolution(h, FIXTURE_SYSTEM_ID);
  const viaAdminStore = exportViaAdminStoreResolution(h, FIXTURE_SYSTEM_ID);

  // The volatile timestamp legitimately differs between invocations.
  assert.notEqual(typeof viaPublic.exportedAt, 'undefined', 'export stamps exportedAt');
  assert.deepEqual(
    pickComparedFields(viaPublic),
    pickComparedFields(viaAdminStore),
    'the two export paths must produce equivalent envelopes for the same system'
  );
});

test('the dropped 3-arg call is exactly what emptied the bundle (defect reproduction)', () => {
  const fixture = buildFullAuthoringFixture();
  const h = makeHarness(fixture);

  const system = h.systemManager.getSystem(FIXTURE_SYSTEM_ID);
  const recipes = h.recipeManager
    .getRecipes({ craftingSystemId: FIXTURE_SYSTEM_ID })
    .map((r) => r.toJSON());

  // The pre-fix public path: three args → gathering authoring defaults away.
  const threeArg = buildExportPayload(system, recipes, '9.9.9');
  const fiveArg = exportViaPublicApiResolution(h, FIXTURE_SYSTEM_ID);

  assert.equal(threeArg.gatheringEnvironments.length, 0, '3-arg drops every environment');
  assert.equal(Object.keys(threeArg.gatheringConfig.system).length, 0, '3-arg drops the config slice');
  assert.ok(fiveArg.gatheringEnvironments.length > 0, '5-arg restores the environments');
  assert.ok(
    Object.keys(fiveArg.gatheringConfig.system).length > 0,
    '5-arg restores the config slice'
  );
});

test('source contract: game.fabricate.exportSystem passes the gathering args to buildExportPayload', () => {
  // Isolate the public-API closure so the guard cannot pass on some other caller.
  const closure = mainSource.slice(
    mainSource.indexOf('function buildExportSystem(fabricate) {'),
    mainSource.indexOf('function buildImportSystem(fabricate) {')
  );
  assert.ok(closure.length > 0, 'located the exportSystem builder in src/bootstrap/publicApi.js');

  // Resolution mirrors the admin-store path (issue #642 fix).
  assert.ok(
    closure.includes('fabricate.gatheringEnvironmentStore?.list?.() ?? []'),
    'exportSystem should resolve gatheringEnvironments from the environment store'
  );
  assert.ok(
    closure.includes('getSetting(SETTING_KEYS.GATHERING_CONFIG) || {}'),
    'exportSystem should resolve gatheringConfig from the GATHERING_CONFIG setting'
  );

  // The SEVEN-arg call is the mutation-sensitive assertion: the pre-fix 3-arg
  // `buildExportPayload(system, recipes, version)` does NOT match and fails here, and neither does
  // the five-arg call that dropped the world currency ladder (issue 1278) nor the six-arg call that
  // dropped the world realm library (issue 1282).
  assert.match(
    closure,
    /buildExportPayload\(\s*system,\s*recipes,\s*version,\s*gatheringEnvironments,\s*gatheringConfig,\s*currencyConfig,\s*travelConfig,\s*characterLibraries,\s*componentScope,\s*essenceScope,\s*toolScope\s*\)/,
    'exportSystem must hand every world slice to buildExportPayload'
  );
  assert.ok(
    closure.includes('fabricate.currencyConfigStore?.get?.() ?? {}'),
    'exportSystem should resolve the ladder from the world currency config store'
  );
  assert.ok(
    closure.includes('fabricate.gatheringRealmStore?.get?.() ?? {}'),
    'exportSystem should resolve the realm library from the world travel store'
  );
  assert.ok(
    closure.includes('fabricate.characterLibrariesStore?.get?.() ?? {}'),
    'exportSystem should resolve both character libraries from the world store'
  );
  // The three world-scope entity stores (issue 1364) are reached through the READY-UNGATED
  // accessors, not through the raw instance fields the four slices above use, because those
  // accessors are what `CraftingSystemManager` itself reads them through.
  for (const accessor of [
    'getComponentScopeStore',
    'getEssenceScopeStore',
    'getToolScopeStore',
  ]) {
    assert.ok(
      closure.includes(`fabricate.${accessor}?.()?.get?.() ?? {}`),
      `exportSystem should resolve the world scope through ${accessor}`
    );
  }
});

test("source contract: the Manager's Export button passes the same args as the public API", () => {
  // The OTHER half of issue #642, and the half that had no guard at all until issue 1282 found it
  // drifting again. Every parameter of `buildExportPayload` after `version` is DEFAULTED, so
  // neither drift throws.
  const closure = adminStoreSource.slice(
    adminStoreSource.indexOf('async function exportSystem(systemId) {'),
    adminStoreSource.indexOf('async function importSystem() {')
  );
  assert.ok(closure.length > 0, 'located the adminStore exportSystem function');

  assert.match(
    closure,
    /buildExportPayload\(\s*system,\s*recipes,\s*version,\s*gatheringEnvironments,\s*gatheringConfig,\s*currencyConfig,\s*travelConfig,\s*characterLibraries,\s*componentScope,\s*essenceScope,\s*toolScope\s*\)/,
    'the Manager export must hand every authoring slice to buildExportPayload'
  );
  assert.ok(
    closure.includes('services.getCurrencyConfigStore?.()?.get?.() || {}'),
    'the Manager export resolves the ladder from the world currency config store'
  );
  assert.ok(
    closure.includes('services.getGatheringRealmStore?.()?.get?.() || {}'),
    'the Manager export resolves the realm library from the world travel store'
  );
  assert.ok(
    closure.includes('services.getCharacterLibrariesStore?.()?.get?.() || {}'),
    'the Manager export resolves both character libraries from the world store'
  );
  for (const accessor of [
    'getComponentScopeStore',
    'getEssenceScopeStore',
    'getToolScopeStore',
  ]) {
    assert.ok(
      closure.includes(`services.${accessor}?.()?.get?.() || {}`),
      `the Manager export resolves the world scope through ${accessor}`
    );
  }
});

test('both export call sites pass every parameter the exporter declares', () => {
  // A guard on the guards. The two source contracts above name their arguments literally, so a NEW
  // slice added to `buildExportPayload` would leave both of them green while both call sites
  // silently defaulted it — the same failure mode one level up (issue 1278).
  const signature = /export function buildExportPayload\(([\s\S]*?)\n\) \{/.exec(exporterSource);
  assert.ok(signature, "located buildExportPayload's declaration");
  const declared = signature[1]
    // The declaration carries a `//` rationale above two of its parameters, so the comments go
    // before the split — otherwise a comma inside one reads as a parameter boundary.
    .replaceAll(/\/\/[^\n]*/g, '')
    .split(',')
    .map((parameter) => parameter.split('=')[0].trim())
    .filter(Boolean);
  assert.deepEqual(
    declared,
    [
      'system',
      'recipes',
      'fabricateVersion',
      'gatheringEnvironments',
      'gatheringConfig',
      'currencyConfig',
      'travelConfig',
      'characterLibraries',
      'componentScope',
      'essenceScope',
      'toolScope',
    ],
    'buildExportPayload gained or lost a parameter — pin it in BOTH call-site guards above ' +
      'before updating this list, or the new slice exports empty from one path and full from ' +
      'the other'
  );
});
