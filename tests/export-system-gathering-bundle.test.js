/**
 * Regression guard for issue #642: the PUBLIC `game.fabricate.exportSystem()`
 * dropped the gathering authoring bundle because its `buildExportPayload(...)`
 * call passed only three arguments, defaulting `gatheringEnvironments` to `[]` and
 * `gatheringConfig` to `{}`. The admin-store UI path passed all five, so the two
 * export paths diverged and the public-API round-trip became lossy in the export
 * direction only.
 *
 * WHY NOT `import '../src/main.js'`: `src/main.js` imports the global stylesheet
 * (`../styles/fabricate.css`) and the compiled Svelte apps at module load, so it
 * cannot be imported under plain `node --test` (documented in
 * `tests/helpers/fabricateFacadeHarness.js`). This suite therefore combines the
 * repo's established pattern for that constraint:
 *   1. a BEHAVIOURAL parity test that drives the REAL `GatheringEnvironmentStore`
 *      + real `buildExportPayload` through faithful reproductions of BOTH export
 *      paths' argument resolution (public API vs admin store), and
 *   2. a SOURCE-CONTRACT guard pinned to `src/main.js`'s actual `exportSystem`
 *      closure — the assertion that FAILS on the pre-fix 3-arg code and passes
 *      after the fix (mutation-sensitive to the dropped args).
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainSource = readFileSync(resolve(__dirname, '../src/main.js'), 'utf8');

// The comparison the acceptance calls for: every authoring-bearing field EXCEPT
// the volatile `exportedAt` timestamp (which differs between two invocations).
const COMPARED_FIELDS = ['schemaVersion', 'system', 'recipes', 'gatheringEnvironments', 'gatheringConfig'];
function pickComparedFields(envelope) {
  return Object.fromEntries(COMPARED_FIELDS.map((key) => [key, envelope[key]]));
}

test('public-API export carries the gathering authoring bundle (non-empty)', () => {
  const fixture = buildFullAuthoringFixture();
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
    mainSource.indexOf('game.fabricate.exportSystem = (systemId) =>'),
    mainSource.indexOf('game.fabricate.importSystemFromFile =')
  );
  assert.ok(closure.length > 0, 'located the game.fabricate.exportSystem closure in src/main.js');

  // Resolution mirrors the admin-store path (issue #642 fix).
  assert.ok(
    closure.includes('fabricate.gatheringEnvironmentStore?.list?.() ?? []'),
    'exportSystem should resolve gatheringEnvironments from the environment store'
  );
  assert.ok(
    closure.includes('getSetting(SETTING_KEYS.GATHERING_CONFIG) || {}'),
    'exportSystem should resolve gatheringConfig from the GATHERING_CONFIG setting'
  );

  // The five-arg call is the mutation-sensitive assertion: the pre-fix 3-arg
  // `buildExportPayload(system, recipes, version)` does NOT match and fails here.
  assert.match(
    closure,
    /buildExportPayload\(\s*system,\s*recipes,\s*version,\s*gatheringEnvironments,\s*gatheringConfig\s*\)/,
    'exportSystem must hand gatheringEnvironments + gatheringConfig to buildExportPayload'
  );
});
