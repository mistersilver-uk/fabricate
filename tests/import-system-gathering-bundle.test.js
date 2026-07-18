/**
 * Regression guard for issue #699: the PUBLIC import surface
 * (`game.fabricate.importSystemFromFile` / `importFromPack` /
 * `getCompendiumImporter`) silently dropped the gathering authoring bundle because
 * `src/main.js` built the SHARED `CompendiumImporter` with no persistence seams —
 * `_persistEnvironments` and `_persistGatheringConfig` early-return without them,
 * yet `_importGatheringAuthoring` still pushed the gathering reference dispositions
 * into the report, implying the bundle was processed while both persists no-op.
 *
 * The GM UI path (SvelteCraftingSystemManagerApp) wires the seams and works, so the
 * fix wires the same seams into the shared importer. The construction-order trap
 * (the environment store is built AFTER the importer in `src/main.js`) is resolved
 * with a thin delegating object that resolves the store lazily, mirroring the
 * exportSystem lazy-read idiom.
 *
 * WHY NOT `import '../src/main.js'`: `src/main.js` imports the global stylesheet and
 * the compiled Svelte apps at module load, so it cannot be imported under plain
 * `node --test`. This suite therefore combines:
 *   1. a BEHAVIOURAL test that drives the REAL GatheringEnvironmentStore through a
 *      thin delegating seam assigned AFTER the importer is constructed (the exact
 *      construction-order trap), proving persistence still runs; and
 *   2. a SOURCE-CONTRACT guard pinned to `src/main.js`'s actual importer
 *      construction — the assertion that FAILS on the pre-fix seamless code.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { makeHarness, exportCurrent } = await import('./helpers/authoringExportHarness.js');
const { prepareForImport } = await import('../src/systems/CraftingSystemExporter.js');
const { CompendiumImporter } = await import('../src/systems/CompendiumImporter.js');
const { buildFullAuthoringFixture, FIXTURE_SYSTEM_ID } =
  await import('./helpers/fullAuthoringFixture.js');

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainSource = readFileSync(resolve(__dirname, '../src/main.js'), 'utf8');

// A thin delegating environment store that resolves its target lazily, reproducing
// the exact seam `src/main.js` passes when the real store does not exist yet.
function makeLazyEnvironmentStoreSeam(holder) {
  return {
    list: () => holder.store?.list?.() ?? [],
    load: () => holder.store?.load?.() ?? [],
    save: (environments) => holder.store?.save?.(environments),
  };
}

test('#699 API-path import persists gatheringEnvironments + gatheringConfig through the shared importer', async () => {
  const fixture = buildFullAuthoringFixture();
  const source = makeHarness(fixture);
  const exported = exportCurrent(source, FIXTURE_SYSTEM_ID);

  // Blank the target world's gathering persistence so a successful import can only
  // come from the seams actually running (not pre-seeded state).
  const target = makeHarness(fixture);
  target.settings.set('gatheringEnvironments', []);
  target.environmentStore.load();
  target.settings.delete('gatheringConfig');
  assert.equal(target.environmentStore.list().length, 0, 'target starts with no environments');

  // Construction-order trap: build the importer BEFORE the store exists, exactly
  // like src/main.js. The delegating seam resolves the store lazily.
  const holder = { store: undefined };
  const importer = new CompendiumImporter(target.systemManager, target.recipeManager, {
    environmentStore: makeLazyEnvironmentStoreSeam(holder),
    getSetting: target.getSetting,
    setSetting: target.setSetting,
    isGM: () => true,
  });
  // The real store is only wired up now (post-construction).
  holder.store = target.environmentStore;

  const packData = prepareForImport(exported, 'keep');
  const summary = await importer.importFromPackData(packData, { overwriteExisting: true });

  // Environments persisted (replace-by-system-id) — spec.md:87.
  const persistedEnvironments = target.environmentStore.list();
  assert.equal(
    persistedEnvironments.length,
    exported.gatheringEnvironments.length,
    'imported environments persisted through the lazy seam'
  );
  assert.ok(
    persistedEnvironments.every((env) => env.craftingSystemId === FIXTURE_SYSTEM_ID),
    'only the imported system’s environments are present'
  );

  // gatheringConfig persisted under the system id.
  const persistedConfig = target.getSetting('gatheringConfig');
  assert.ok(persistedConfig && typeof persistedConfig === 'object', 'gatheringConfig persisted');
  assert.ok(
    persistedConfig.systems?.[FIXTURE_SYSTEM_ID],
    'gatheringConfig slice persisted under the imported system id'
  );

  // Report honesty: the gathering source-item references the report claims were
  // handled correspond to a run that actually persisted (no processed-looking
  // report over a no-op persist).
  assert.ok(Array.isArray(summary.unresolvedReferences), 'summary carries a reference report');
});

test('#699 replace-by-system-id keeps other systems’ environments on an API-path import', async () => {
  const fixture = buildFullAuthoringFixture();
  const h = makeHarness(fixture);
  await h.systemManager.createSystem({ id: 'other-system', name: 'Other', gatheringRealms: [] });
  const foreign = {
    id: 'env-foreign',
    craftingSystemId: 'other-system',
    name: 'Foreign Env',
    enabled: false,
    selectionMode: 'targeted',
    compositionMode: 'automatic',
  };
  h.settings.set('gatheringEnvironments', structuredClone([...h.environmentStore.list(), foreign]));
  h.environmentStore.load();

  const exported = exportCurrent(h, FIXTURE_SYSTEM_ID);
  const holder = { store: undefined };
  const importer = new CompendiumImporter(h.systemManager, h.recipeManager, {
    environmentStore: makeLazyEnvironmentStoreSeam(holder),
    getSetting: h.getSetting,
    setSetting: h.setSetting,
    isGM: () => true,
  });
  holder.store = h.environmentStore;

  await importer.importFromPackData(prepareForImport(exported, 'keep'), {
    overwriteExisting: true,
  });

  assert.ok(
    h.environmentStore.list().some((env) => env.id === 'env-foreign'),
    'the other system’s environment survives the API-path import (spec.md:87)'
  );
});

test('#699 defect reproduction: a seamless importer drops the gathering bundle', async () => {
  const fixture = buildFullAuthoringFixture();
  const source = makeHarness(fixture);
  const exported = exportCurrent(source, FIXTURE_SYSTEM_ID);

  const target = makeHarness(fixture);
  target.settings.set('gatheringEnvironments', []);
  target.environmentStore.load();
  target.settings.delete('gatheringConfig');

  // The PRE-FIX construction: no persistence seams at all.
  const importer = new CompendiumImporter(target.systemManager, target.recipeManager);
  await importer.importFromPackData(prepareForImport(exported, 'keep'), {
    overwriteExisting: true,
  });

  assert.equal(
    target.environmentStore.list().length,
    0,
    'without seams the environments are silently dropped'
  );
  assert.equal(
    target.getSetting('gatheringConfig'),
    undefined,
    'without seams the gatheringConfig is silently dropped'
  );
});

test('#699 keep-mode API-path round-trip preserves the gathering authoring bundle', async () => {
  const fixture = buildFullAuthoringFixture();
  const h = makeHarness(fixture);

  const first = exportCurrent(h, FIXTURE_SYSTEM_ID);

  const holder = { store: h.environmentStore };
  const importer = new CompendiumImporter(h.systemManager, h.recipeManager, {
    environmentStore: makeLazyEnvironmentStoreSeam(holder),
    getSetting: h.getSetting,
    setSetting: h.setSetting,
    isGM: () => true,
  });
  await importer.importFromPackData(prepareForImport(first, 'keep'), { overwriteExisting: true });

  const second = exportCurrent(h, FIXTURE_SYSTEM_ID);

  // Equivalence modulo the volatile envelope fields (spec.md:92).
  assert.deepEqual(second.gatheringEnvironments, first.gatheringEnvironments);
  assert.deepEqual(second.gatheringConfig, first.gatheringConfig);
});

test('source contract: src/main.js builds the shared CompendiumImporter with the gathering seams', () => {
  const marker = 'this.compendiumImporter = new CompendiumImporter(';
  const start = mainSource.indexOf(marker);
  assert.ok(start >= 0, 'located the shared CompendiumImporter construction in src/main.js');
  const closure = mainSource.slice(
    start,
    mainSource.indexOf('this.craftingEngine = new CraftingEngine(')
  );
  assert.ok(closure.length > 0, 'isolated the importer construction closure');

  // The mutation-sensitive assertion: the pre-fix 2-arg seamless construction
  // (`new CompendiumImporter(this.craftingSystemManager, this.recipeManager);`)
  // does NOT match and fails here.
  assert.match(
    closure,
    /new CompendiumImporter\(\s*this\.craftingSystemManager,\s*this\.recipeManager,\s*\{/,
    'the shared importer must be constructed with a seams object'
  );

  // Lazy resolution of the environment store (constructed AFTER the importer).
  assert.ok(
    closure.includes('this.gatheringEnvironmentStore?.list'),
    'environmentStore seam must resolve this.gatheringEnvironmentStore lazily'
  );
  assert.match(closure, /environmentStore:/, 'wires the environmentStore seam');
  assert.match(
    closure,
    /getSetting:\s*\(key\)\s*=>\s*getSetting\(key\)/,
    'wires the getSetting seam'
  );
  assert.match(
    closure,
    /setSetting:\s*\(key,\s*value\)\s*=>\s*setSetting\(key,\s*value\)/,
    'wires the setSetting seam'
  );
  assert.match(closure, /isGM:\s*\(\)\s*=>\s*game\.user\?\.isGM === true/, 'wires the isGM gate');
});
