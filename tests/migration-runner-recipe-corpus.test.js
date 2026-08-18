/**
 * Issue 1242 — the startup migration pass reads and writes the recipe corpus through an
 * ARRANGEMENT-AWARE seam.
 *
 * Every test here is written against one specific way the guard could be vacuous, because
 * this issue's own first acceptance draft contained an ANTI-guard: "assert `setSetting` was
 * never called with the recipes key" is GREEN on the unimplemented tree — the runner reads
 * `[]` from the legacy key on a converted world, no migration turns `[]` into anything, the
 * write is gated on a change that never happens, and the assertion passes precisely because
 * of the defect it exists to detect. It is merged into one item with a positive half here,
 * and that pairing must never be split.
 *
 * The instrument preconditions are equally load-bearing:
 *
 * - `tests/helpers/settingDocumentHost.js` memoizes `SettingDouble.value`, mirroring
 *   `DataModel#_initialize`. Without that, the detachment defect of `hydrate: structuredClone`
 *   is UNREPRESENTABLE: a re-parsing double hands out a fresh object per read, so an identity
 *   `hydrate` looks correct while production silently writes nothing.
 * - a tear assertion reads the recorded call log or the payload captured AT CALL TIME, never
 *   the store's contents: the migrations transform their input in place, so the store already
 *   carries the migrated field even in a run whose write threw.
 * - anything driven through `run()` stores a `migrationVersion` BELOW the migration under
 *   test, because `run()` returns early with no reads at all when nothing is pending.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { DEFINITION_STORAGE_LAYOUTS, SETTING_KEYS } from '../src/config/settings.js';
import {
  MIGRATION_DEFERRAL_REASONS,
  MigrationRunner,
} from '../src/migration/MigrationRunner.js';
import { DefinitionStorageArrangementError } from '../src/systems/definitionStorageArrangement.js';
import { deriveSettingDocumentId } from '../src/systems/PerRecordCraftingDefinitionRepository.js';
import {
  createRecipeCorpus,
  RecipeCorpusShrinkError,
  RecipeCorpusUnreadableError,
} from '../src/systems/recipeCorpus.js';

import { SettingDouble, SettingHost } from './helpers/settingDocumentHost.js';

const RECIPE_KEY_PREFIX = 'fabricate.recipe.';

/**
 * A world whose recipes live in per-record `Setting` documents.
 *
 * `log` is the UNIFIED ordered record of every storage operation the pass issues — the
 * seam's document calls and the whole-array `setSetting` calls alike. The write-order pin
 * cannot be stated over two separate logs.
 *
 * @param {object} options
 * @param {object[]} [options.records] recipe records, seeded in the given order
 * @param {string} [options.layout] the recipe Definition Storage Layout this world reports
 * @param {object} [options.settings] seed values for the whole-array settings
 * @param {() => string} [options.readLayout] overrides `layout` with a live reader, so a
 *   test can flip the layout mid-pass
 */
function makeGranularWorld({ records = [], layout, settings = {}, readLayout } = {}) {
  const host = new SettingHost();
  for (const record of records) seedRecord(host, record);

  const store = new Map(
    Object.entries({
      recipes: [],
      craftingSystems: [],
      gatheringConfig: {},
      migrationVersion: '0.0.0',
      ...settings,
    })
  );
  const log = [];
  const getSetting = (key) => {
    if (key === SETTING_KEYS.RECIPE_STORAGE_LAYOUT) {
      return readLayout ? readLayout() : (layout ?? null);
    }
    return store.get(key) ?? null;
  };
  const setSetting = async (key, value) => {
    log.push({ kind: 'setting', key });
    store.set(key, value);
    return value;
  };

  const documentClass = {
    createDocuments: async (data, options) => {
      log.push({ kind: 'record', leg: 'create' });
      return host.documentClass.createDocuments(data, options);
    },
    updateDocuments: async (data) => {
      log.push({ kind: 'record', leg: 'update' });
      return host.documentClass.updateDocuments(data);
    },
    deleteDocuments: async (ids) => {
      log.push({ kind: 'record', leg: 'delete' });
      return host.documentClass.deleteDocuments(ids);
    },
  };

  const recipeCorpus = createRecipeCorpus({
    getSetting,
    setSetting,
    documentClass: () => documentClass,
    collection: () => host.collection,
  });

  return { host, store, log, getSetting, setSetting, recipeCorpus };
}

/** Seed one record document, keyed and id-derived exactly as the adapter would. */
function seedRecord(host, record) {
  const key = `${RECIPE_KEY_PREFIX}${record.id}`;
  const _id = deriveSettingDocumentId(key);
  host.collection.documents.set(_id, new SettingDouble({ _id, key, value: record }));
}

/**
 * Every value a write leg was ASKED to persist, flattened across legs.
 *
 * Reads `sent`, the payload the host snapshotted at call time. The collection's own contents
 * are not evidence: the migrations mutate their input in place, so a document can carry a
 * migrated field in a run whose write never landed.
 */
function sentRecordValues(host) {
  return host.calls
    .filter((call) => call.leg === 'create' || call.leg === 'update')
    .flatMap((call) => call.sent.map((entry) => entry.value));
}

/** The ordered leg names the seam issued, ignoring whole-array writes. */
function recordLegs(log) {
  return log.filter((entry) => entry.kind === 'record').map((entry) => entry.leg);
}

/** The ordered whole-array setting keys the pass wrote. */
function settingKeys(log) {
  return log.filter((entry) => entry.kind === 'setting').map((entry) => entry.key);
}

/** A world-scoped runner over a granular world. */
function granularRunner(world, overrides = {}) {
  return new MigrationRunner({
    getSetting: world.getSetting,
    setSetting: world.setSetting,
    recipeCorpus: world.recipeCorpus,
    ...overrides,
  });
}

/** A recipe carrying the 0.6.0 migration's entire input. */
function catalystRecipe(id, systemId = 'sys-1') {
  return {
    id,
    craftingSystemId: systemId,
    catalysts: [{ componentId: 'forge', degradesOnUse: false }],
  };
}

// ---------------------------------------------------------------------------
// 1. The corpus reaches the migrations AND the legacy key is never written
// ---------------------------------------------------------------------------

test('the granular corpus reaches the migrations and the legacy key is never written', async () => {
  const world = makeGranularWorld({
    layout: DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
    records: [catalystRecipe('r1')],
    settings: { migrationVersion: '0.5.0', craftingSystems: [{ id: 'sys-1' }] },
  });

  const summary = await granularRunner(world).run();

  // (a) THE POSITIVE HALF. Without it (b) is satisfied by the defect: on the unimplemented
  // tree the read answers `[]`, nothing changes, and no legacy write is ever attempted.
  const persisted = sentRecordValues(world.host);
  assert.equal(persisted.length, 1, 'the migrated record was written back');
  assert.deepEqual(
    persisted[0].toolIds?.length,
    1,
    'the 0.6.0 catalyst conversion reached the record the seam read'
  );
  assert.equal('catalysts' in persisted[0], false, 'the consumed source field is gone');
  assert.equal(world.store.get('craftingSystems')[0].tools.length, 1, 'the tool body landed');

  // (b) THE NEGATIVE HALF, which must never stand alone.
  assert.equal(
    settingKeys(world.log).includes(SETTING_KEYS.RECIPES),
    false,
    'the legacy whole-array recipes key was never written on a converted world'
  );
  assert.equal(summary.aborted, false);
  assert.equal(world.store.get('migrationVersion'), '1.25.0');
});

// ---------------------------------------------------------------------------
// 2. The alchemy reduction, with all four fixture constraints
// ---------------------------------------------------------------------------

test('the alchemy check-mode reduction sees the whole granular corpus', async () => {
  // (i) the system carries NO checkMode, so the seed is not skipped for idempotency;
  // (ii) it is not pre-seeded 'none' either, which is itself a valid mode;
  // (iii) at least one recipe matches the system and carries provider 'check';
  // (iv) a second such recipe carries MORE THAN ONE result group with checkOutcomeIds, so
  //      the reduction can reach 'tiered' — the assertion is `=== 'tiered'`, never
  //      `!== 'none'`, because a PARTIAL read yields 'simple' and would pass that.
  const world = makeGranularWorld({
    layout: DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
    records: [
      { id: 'r1', craftingSystemId: 'alch-1', resultSelection: { provider: 'check' } },
      {
        id: 'r2',
        craftingSystemId: 'alch-1',
        resultSelection: { provider: 'check' },
        resultGroups: [{ checkOutcomeIds: ['a'] }, { checkOutcomeIds: ['b'] }],
      },
    ],
    settings: {
      migrationVersion: '1.13.0',
      craftingSystems: [{ id: 'alch-1', resolutionMode: 'alchemy' }],
    },
  });

  await granularRunner(world).run();

  assert.equal(
    world.store.get('craftingSystems')[0].alchemy.checkMode,
    'tiered',
    "an empty read yields 'none' and a partial read yields 'simple'"
  );
});

// ---------------------------------------------------------------------------
// 3. The routed tie-break, which no "not none" assertion can express
// ---------------------------------------------------------------------------

test('the routed resolution-mode tie-break counts the whole granular corpus', async () => {
  const world = makeGranularWorld({
    layout: DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
    records: [
      { id: 'r1', craftingSystemId: 'sys-1', resultSelection: { provider: 'check' } },
      { id: 'r2', craftingSystemId: 'sys-1', resultSelection: { provider: 'check' } },
      { id: 'r3', craftingSystemId: 'sys-1', resultSelection: { provider: 'ingredientSet' } },
    ],
    settings: {
      migrationVersion: '1.8.0',
      craftingSystems: [{ id: 'sys-1', resolutionMode: 'routed' }],
    },
  });

  await granularRunner(world).run();

  // Zero voters tie-break to `routedByIngredients`, which is the silently wrong answer an
  // empty or partial read produces. No "not none"-shaped assertion can express this.
  assert.equal(world.store.get('craftingSystems')[0].resolutionMode, 'routedByCheck');
});

// ---------------------------------------------------------------------------
// 4. Records are detached, and skipUnchanged compares migrated against stored bytes
// ---------------------------------------------------------------------------

test('loadAll returns records detached from their stored documents', async () => {
  const world = makeGranularWorld({
    layout: DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
    records: [{ id: 'r1', name: 'Original' }],
  });

  const [record] = await world.recipeCorpus.loadAll();
  const [document] = [...world.host.collection.documents.values()];

  assert.equal(
    record === document.value,
    false,
    'a record is not the stored document’s own initialized value'
  );
  record.name = 'Mutated';
  assert.equal(document.value.name, 'Original', 'mutating a record leaves the document alone');
});

test('a migration editing one record of four issues exactly one update', async () => {
  const world = makeGranularWorld({
    layout: DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
    records: [
      { id: 'r1', name: 'A' },
      { id: 'r2', name: 'B' },
      { id: 'r3', name: 'C' },
      { id: 'r4', name: 'D' },
    ],
    settings: { migrationVersion: '9.0.0' },
  });

  const runner = granularRunner(world, {
    migrations: [
      {
        version: '9.1.0',
        label: 'rename one record',
        migrate: (data) => {
          data.recipes.find((recipe) => recipe.id === 'r3').name = 'C-renamed';
          return data;
        },
      },
    ],
  });
  await runner.run();

  const updates = world.host.calls.filter((call) => call.leg === 'update');
  assert.equal(updates.length, 1, 'one update leg');
  assert.equal(updates[0].count, 1, 'carrying exactly one record');
  assert.equal(updates[0].sent[0].value.name, 'C-renamed');
  // Under identity hydration every record would compare equal to ITSELF, all four would be
  // skipped, and the version would advance over an empty writeback.
  assert.equal(world.store.get('migrationVersion'), '9.1.0');
});

// ---------------------------------------------------------------------------
// 5. The key-order caveat, pinned as known rather than fixed
// ---------------------------------------------------------------------------

test('KNOWN COST: rebuilding a record with a different key order issues an update', async () => {
  const world = makeGranularWorld({
    layout: DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
    records: [{ id: 'r1', name: 'A', note: 'n' }],
    settings: { migrationVersion: '9.0.0' },
  });

  const runner = granularRunner(world, {
    migrations: [
      {
        version: '9.1.0',
        label: 'rebuild the record with a different key order',
        migrate: (data) => ({
          ...data,
          recipes: data.recipes.map((recipe) => ({
            note: recipe.note,
            name: recipe.name,
            id: recipe.id,
          })),
        }),
      },
    ],
  });
  await runner.run();

  // The stored-value comparison is `JSON.stringify` output, so it is key-order sensitive.
  // This is a cost, never a correctness fault: the record persisted is semantically identical.
  const updates = world.host.calls.filter((call) => call.leg === 'update');
  assert.equal(updates.length, 1, 'the skip is defeated by a permuted key order');
});

// ---------------------------------------------------------------------------
// 6. `unsettled` refuses the pass outright
// ---------------------------------------------------------------------------

test('an unsettled layout defers the pass: nothing read, nothing written, version unmoved', async () => {
  const world = makeGranularWorld({
    layout: DEFINITION_STORAGE_LAYOUTS.UNSETTLED,
    records: [catalystRecipe('r1')],
    settings: { migrationVersion: '0.5.0', craftingSystems: [{ id: 'sys-1' }] },
  });

  const summary = await granularRunner(world).run();

  assert.equal(summary.deferred, true);
  assert.equal(summary.deferredReason, MIGRATION_DEFERRAL_REASONS.UNSETTLED_STORAGE);
  assert.equal(summary.aborted, false, 'a deferral is not an abort');
  assert.equal(summary.ran, 0);
  assert.deepEqual(world.log, [], 'no write of any kind was issued');
  assert.equal(world.host.calls.length, 0, 'no record document was even read for writing');
  assert.equal(world.store.get('migrationVersion'), '0.5.0');
  assert.equal(
    world.store.get('craftingSystems')[0].tools,
    undefined,
    'no migration ran over a partial corpus'
  );
});

// ---------------------------------------------------------------------------
// 7. An unreadable layout takes the legacy path — both shapes the suite produces
// ---------------------------------------------------------------------------

for (const [label, answer] of [
  ['null', null],
  ['an empty array, which is TRUTHY', []],
]) {
  test(`a layout key answering ${label} takes the legacy arrangement`, async () => {
    const store = new Map(
      Object.entries({
        recipes: [catalystRecipe('r1')],
        craftingSystems: [{ id: 'sys-1' }],
        gatheringConfig: {},
        migrationVersion: '0.5.0',
      })
    );
    const written = [];
    const recipeCorpus = createRecipeCorpus({
      getSetting: (key) =>
        key === SETTING_KEYS.RECIPE_STORAGE_LAYOUT ? answer : (store.get(key) ?? null),
      setSetting: async (key, value) => {
        written.push(key);
        store.set(key, value);
      },
      // A granular arm would throw here rather than answering an empty corpus, so routing
      // onto it is loudly visible instead of silently wrong.
      collection: () => null,
    });

    assert.deepEqual(await recipeCorpus.loadAll(), [catalystRecipe('r1')]);
    await recipeCorpus.createOrUpdateAll([{ id: 'r1' }]);
    assert.deepEqual(written, [SETTING_KEYS.RECIPES]);
  });
}

// ---------------------------------------------------------------------------
// 8. Behaviour-neutral on `singleArray`
// ---------------------------------------------------------------------------

test('the singleArray arm is the legacy whole-array accessor', async () => {
  const store = new Map(
    Object.entries({
      recipes: [catalystRecipe('r1')],
      craftingSystems: [{ id: 'sys-1' }],
      gatheringConfig: {},
      migrationVersion: '0.5.0',
    })
  );
  const written = [];
  const recipeCorpus = createRecipeCorpus({
    getSetting: (key) =>
      key === SETTING_KEYS.RECIPE_STORAGE_LAYOUT
        ? DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY
        : (store.get(key) ?? null),
    setSetting: async (key, value) => {
      written.push({ key, value });
      store.set(key, value);
    },
  });
  const runner = new MigrationRunner({
    getSetting: (key) => store.get(key) ?? null,
    setSetting: async (key, value) => {
      written.push({ key, value });
      store.set(key, value);
    },
    recipeCorpus,
  });

  await runner.run();

  assert.equal(written[0].key, SETTING_KEYS.RECIPES, 'the recipes leg is still a whole-array write');
  assert.equal(written[0].value[0].toolIds.length, 1);
  assert.equal(store.get('migrationVersion'), '1.25.0');
});

test("the runner's DEFAULT corpus accessor is today's legacy path, unguarded", async () => {
  const store = new Map(
    Object.entries({
      recipes: [catalystRecipe('r1')],
      craftingSystems: [{ id: 'sys-1' }],
      gatheringConfig: {},
      migrationVersion: '0.5.0',
    })
  );
  const written = [];
  // No `recipeCorpus` injected, and the layout key answers `perRecord` — which the default
  // accessor must ignore entirely, because it does not read the layout at all. That is what
  // keeps the several dozen existing runner fixtures byte-identical to today.
  const runner = new MigrationRunner({
    getSetting: (key) =>
      key === SETTING_KEYS.RECIPE_STORAGE_LAYOUT
        ? DEFINITION_STORAGE_LAYOUTS.PER_RECORD
        : (store.get(key) ?? null),
    setSetting: async (key, value) => {
      written.push(key);
      store.set(key, value);
    },
  });

  await runner.run();

  assert.equal(written[0], SETTING_KEYS.RECIPES);
  assert.equal(store.get('recipes')[0].toolIds.length, 1);
});

// ---------------------------------------------------------------------------
// 9. The arrangement write guard fires on the seam, on BOTH arms
// ---------------------------------------------------------------------------

test('the granular arm refuses a write once the layout has flipped mid-pass', async () => {
  let reported = DEFINITION_STORAGE_LAYOUTS.PER_RECORD;
  const world = makeGranularWorld({
    readLayout: () => reported,
    records: [catalystRecipe('r1')],
    settings: { migrationVersion: '0.5.0', craftingSystems: [{ id: 'sys-1' }] },
  });
  // The pass has already resolved the layout and read the corpus; a remote GM's conversion
  // now moves it underneath. The guard reads LIVE, so it can still see this.
  const [record] = await world.recipeCorpus.loadAll();
  reported = DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY;

  await assert.rejects(
    () => world.recipeCorpus.createOrUpdateAll([{ ...record, name: 'edited' }]),
    DefinitionStorageArrangementError
  );
  assert.equal(world.host.calls.length, 0, 'no document call was issued');
});

test('the legacy arm refuses a write once the layout has flipped mid-pass', async () => {
  let reported = DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY;
  const written = [];
  const recipeCorpus = createRecipeCorpus({
    getSetting: (key) => (key === SETTING_KEYS.RECIPE_STORAGE_LAYOUT ? reported : []),
    setSetting: async (key) => {
      written.push(key);
    },
  });
  await recipeCorpus.loadAll();
  reported = DEFINITION_STORAGE_LAYOUTS.PER_RECORD;

  await assert.rejects(
    () => recipeCorpus.createOrUpdateAll([{ id: 'r1' }]),
    DefinitionStorageArrangementError
  );
  assert.deepEqual(written, [], 'the legacy document was not re-created');
});

test('a refused write defers the pass and leaves the version un-advanced', async () => {
  let reported = DEFINITION_STORAGE_LAYOUTS.PER_RECORD;
  const world = makeGranularWorld({
    readLayout: () => reported,
    records: [catalystRecipe('r1')],
    settings: { migrationVersion: '0.5.0', craftingSystems: [{ id: 'sys-1' }] },
  });
  const runner = granularRunner(world, {
    migrations: [
      {
        version: '9.1.0',
        label: 'flip the layout, then edit a recipe',
        migrate: (data) => {
          reported = DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY;
          data.recipes[0].name = 'edited';
          return data;
        },
      },
    ],
  });

  const summary = await runner.run();

  assert.equal(summary.deferred, true);
  assert.equal(summary.deferredReason, MIGRATION_DEFERRAL_REASONS.WRITEBACK_FAILED);
  assert.equal(summary.deferredError.name, 'DefinitionStorageArrangementError');
  assert.equal(world.store.get('migrationVersion'), '0.5.0');
});

// ---------------------------------------------------------------------------
// 10. A shrunk corpus is refused, by id-set containment rather than by count
// ---------------------------------------------------------------------------

test('a writeback that drops a record the read observed is refused', async () => {
  const world = makeGranularWorld({
    layout: DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
    records: [{ id: 'r1' }, { id: 'r2' }],
  });
  await world.recipeCorpus.loadAll();

  await assert.rejects(
    () => world.recipeCorpus.createOrUpdateAll([{ id: 'r1' }]),
    RecipeCorpusShrinkError
  );
  assert.equal(world.host.calls.length, 0, 'no document call was issued');
});

test('a remove-plus-add keeps the COUNT and is still refused', async () => {
  const world = makeGranularWorld({
    layout: DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
    records: [{ id: 'r1' }, { id: 'r2' }],
  });
  await world.recipeCorpus.loadAll();

  // Two in, two out. A length check passes this and loses `r2` forever.
  await assert.rejects(
    () => world.recipeCorpus.createOrUpdateAll([{ id: 'r1' }, { id: 'r3' }]),
    (error) => error instanceof RecipeCorpusShrinkError && error.missingIds.includes('r2')
  );
});

test('a shrinking migration defers the pass and leaves the version un-advanced', async () => {
  const world = makeGranularWorld({
    layout: DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
    records: [{ id: 'r1' }, { id: 'r2' }],
    settings: { migrationVersion: '9.0.0' },
  });
  const runner = granularRunner(world, {
    migrations: [
      {
        version: '9.1.0',
        label: 'drop a recipe',
        migrate: (data) => ({ ...data, recipes: data.recipes.filter((r) => r.id !== 'r2') }),
      },
    ],
  });

  const summary = await runner.run();

  assert.equal(summary.deferred, true);
  assert.equal(summary.deferredError.name, 'RecipeCorpusShrinkError');
  assert.equal(world.host.calls.length, 0);
  assert.equal(world.store.get('migrationVersion'), '9.0.0');
});

// ---------------------------------------------------------------------------
// 11. Read failure is contained, and EMPTY is distinguished from UNREADABLE
// ---------------------------------------------------------------------------

test('an unparseable record document defers the pass rather than escaping run()', async () => {
  const world = makeGranularWorld({
    layout: DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
    records: [{ id: 'r1' }],
    settings: { migrationVersion: '0.5.0', craftingSystems: [{ id: 'sys-1' }] },
  });
  for (const document of world.host.collection.documents.values()) document._raw = '{oops';

  const summary = await granularRunner(world).run();

  assert.equal(summary.deferred, true);
  assert.equal(summary.deferredReason, MIGRATION_DEFERRAL_REASONS.CORPUS_READ_FAILED);
  assert.deepEqual(world.log, [], 'nothing was written');
  assert.equal(world.store.get('migrationVersion'), '0.5.0');
});

test('an unresolvable setting collection is UNREADABLE, never an empty corpus', async () => {
  const store = new Map(
    Object.entries({
      craftingSystems: [{ id: 'alch-1', resolutionMode: 'alchemy' }],
      gatheringConfig: {},
      migrationVersion: '1.13.0',
    })
  );
  const written = [];
  const recipeCorpus = createRecipeCorpus({
    getSetting: (key) =>
      key === SETTING_KEYS.RECIPE_STORAGE_LAYOUT
        ? DEFINITION_STORAGE_LAYOUTS.PER_RECORD
        : (store.get(key) ?? null),
    setSetting: async (key, value) => {
      written.push(key);
      store.set(key, value);
    },
    collection: () => null,
  });

  await assert.rejects(() => recipeCorpus.loadAll(), RecipeCorpusUnreadableError);

  const summary = await new MigrationRunner({
    getSetting: (key) => store.get(key) ?? null,
    setSetting: async (key, value) => {
      written.push(key);
      store.set(key, value);
    },
    recipeCorpus,
  }).run();

  assert.equal(summary.deferred, true);
  assert.equal(summary.deferredReason, MIGRATION_DEFERRAL_REASONS.CORPUS_READ_FAILED);
  assert.deepEqual(written, [], 'nothing was written');
  // A `?? []` on this arm would report a clean empty corpus and seed every alchemy system
  // `'none'` — the exact silent failure this issue exists to remove.
  assert.equal(store.get('craftingSystems')[0].alchemy, undefined);
  assert.equal(store.get('migrationVersion'), '1.13.0');
});

// ---------------------------------------------------------------------------
// 12. Write failure is contained
// ---------------------------------------------------------------------------

test('a vetoed record document defers the pass rather than escaping run()', async () => {
  const world = makeGranularWorld({
    layout: DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
    records: [catalystRecipe('r1')],
    settings: { migrationVersion: '0.5.0', craftingSystems: [{ id: 'sys-1' }] },
  });
  // A `preCreateSetting`/`preUpdateSetting` hook dropping one document is what makes a SHORT
  // RETURN a real outcome rather than a theoretical one.
  world.host.documentClass.updateDocuments = async () => [];

  const summary = await granularRunner(world).run();

  assert.equal(summary.deferred, true);
  assert.equal(summary.deferredReason, MIGRATION_DEFERRAL_REASONS.WRITEBACK_FAILED);
  assert.equal(
    settingKeys(world.log).includes(SETTING_KEYS.MIGRATION_VERSION),
    false,
    'the version bump was abandoned'
  );
  assert.equal(world.store.get('migrationVersion'), '0.5.0');
});

test('a rejection on the craftingSystems write defers the pass — reachable with no conversion', async () => {
  const store = new Map(
    Object.entries({
      recipes: [catalystRecipe('r1')],
      craftingSystems: [{ id: 'sys-1' }],
      gatheringConfig: {},
      migrationVersion: '0.5.0',
    })
  );
  const written = [];
  const setSetting = async (key, value) => {
    written.push(key);
    if (key === SETTING_KEYS.CRAFTING_SYSTEMS) throw new Error('tear on craftingSystems');
    store.set(key, value);
  };
  const runner = new MigrationRunner({ getSetting: (key) => store.get(key) ?? null, setSetting });

  const summary = await runner.run();

  assert.equal(summary.deferred, true, 'the rejection did not escape run()');
  assert.equal(summary.deferredReason, MIGRATION_DEFERRAL_REASONS.WRITEBACK_FAILED);
  assert.deepEqual(written, [SETTING_KEYS.RECIPES, SETTING_KEYS.CRAFTING_SYSTEMS]);
  assert.equal(store.get('migrationVersion'), '0.5.0');
});

test('only the write-failure notice instructs a reload', () => {
  const strings = JSON.parse(
    readFileSync(new URL('../lang/en.json', import.meta.url), 'utf8')
  ).FABRICATE.Migration.Deferred;

  // Only the writeback failure has already transformed this session's live setting values,
  // so only it can leave a GM writing migrated records back under an un-advanced version.
  assert.match(strings.WritebackFailed, /reload foundry now/i);
  assert.equal(/reload/i.test(strings.MidConversion), false);
  assert.equal(/reload/i.test(strings.CorpusUnreadable), false);
});

// ---------------------------------------------------------------------------
// 13. The write order is pinned
// ---------------------------------------------------------------------------

test('every recipe-corpus operation precedes the first whole-array write', async () => {
  const world = makeGranularWorld({
    layout: DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
    records: [catalystRecipe('r1')],
    settings: { migrationVersion: '0.5.0', craftingSystems: [{ id: 'sys-1' }] },
  });

  await granularRunner(world).run();

  const lastRecord = world.log.findLastIndex((entry) => entry.kind === 'record');
  const firstSetting = world.log.findIndex((entry) => entry.kind === 'setting');
  assert.ok(lastRecord >= 0 && firstSetting >= 0, 'the pass issued both kinds of write');
  // THE PIN. The recipe corpus is the only leg that can partially commit, so it is issued
  // first to minimise the set of cross-setting states a tear can produce.
  assert.ok(lastRecord < firstSetting, 'the corpus leg is issued before any whole-array write');
  // Belt and braces only: this cannot fail while the version bump stays unconditional and
  // last, so it is NOT the ordering guard.
  const versionAt = settingKeys(world.log).indexOf(SETTING_KEYS.MIGRATION_VERSION);
  assert.equal(versionAt, settingKeys(world.log).length - 1);
});

test('on the singleArray arm the recipes key precedes every other whole-array write', async () => {
  const store = new Map(
    Object.entries({
      recipes: [catalystRecipe('r1')],
      craftingSystems: [{ id: 'sys-1' }],
      gatheringConfig: {},
      migrationVersion: '0.5.0',
    })
  );
  const written = [];
  const runner = new MigrationRunner({
    getSetting: (key) => store.get(key) ?? null,
    setSetting: async (key, value) => {
      written.push(key);
      store.set(key, value);
    },
  });

  await runner.run();

  assert.ok(written.indexOf(SETTING_KEYS.RECIPES) < written.indexOf(SETTING_KEYS.CRAFTING_SYSTEMS));
  assert.ok(
    written.indexOf(SETTING_KEYS.RECIPES) < written.indexOf(SETTING_KEYS.MIGRATION_VERSION)
  );
});

// ---------------------------------------------------------------------------
// 14. Cross-key integrity is asserted by a TEAR, not by a clean run
// ---------------------------------------------------------------------------

for (const [label, settings, migrations] of [
  [
    '0.6.0 (recipes + systems)',
    { migrationVersion: '0.5.0', craftingSystems: [{ id: 'sys-1' }] },
    undefined,
  ],
  [
    '1.6.0 (recipes + gatheringConfig)',
    { migrationVersion: '1.5.0', craftingSystems: [{ id: 'sys-1' }] },
    undefined,
  ],
]) {
  test(`a tear on the next leg abandons the rest: ${label}`, async () => {
    const world = makeGranularWorld({
      layout: DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
      records: [
        {
          id: 'r1',
          craftingSystemId: 'sys-1',
          catalysts: [{ componentId: 'forge', degradesOnUse: false }],
          resultSelection: { provider: 'macroOutcome' },
        },
      ],
      settings,
    });
    const failing = async (key, value) => {
      world.log.push({ kind: 'setting', key });
      if (key !== SETTING_KEYS.RECIPES) throw new Error(`tear on ${key}`);
      world.store.set(key, value);
    };
    const runner = new MigrationRunner({
      getSetting: world.getSetting,
      setSetting: failing,
      recipeCorpus: world.recipeCorpus,
      migrations,
    });

    const summary = await runner.run();

    assert.equal(summary.deferred, true);
    // The recipes leg landed FIRST, and exactly one whole-array write was attempted before
    // the pass abandoned the rest. A clean run proves nothing here: both legs land in either
    // order, which is why an ordering defect is invisible to it.
    assert.ok(recordLegs(world.log).length > 0, 'the corpus leg was issued');
    assert.equal(settingKeys(world.log).length, 1, 'the pass stopped at the first failed leg');
    assert.equal(
      settingKeys(world.log).includes(SETTING_KEYS.MIGRATION_VERSION),
      false,
      'the version bump was abandoned'
    );
    assert.equal(world.store.get('migrationVersion'), settings.migrationVersion);
  });
}

// ---------------------------------------------------------------------------
// 15. Corpus order does not change any decision
// ---------------------------------------------------------------------------

test('a permuted corpus produces the same decisions and set-equal reference lists', async () => {
  const records = () => [
    {
      id: 'r1',
      craftingSystemId: 'alch-1',
      resultSelection: { provider: 'check' },
      resultGroups: [{ checkOutcomeIds: ['a'] }, { checkOutcomeIds: ['b'] }],
      linkedRecipeItemUuid: 'Item.book-1',
    },
    {
      id: 'r2',
      craftingSystemId: 'alch-1',
      resultSelection: { provider: 'check' },
      linkedRecipeItemUuid: 'Item.book-1',
    },
    // Two check voters and one ingredient voter, so the routed tie-break is decided by a
    // COUNT and not by whichever record happens to come first. Ordering r3 (check) first and
    // r5 (ingredientSet) first in the two runs is what makes a first-wins reduction visible.
    { id: 'r3', craftingSystemId: 'routed-1', resultSelection: { provider: 'check' } },
    { id: 'r4', craftingSystemId: 'routed-1', resultSelection: { provider: 'check' } },
    { id: 'r5', craftingSystemId: 'routed-1', resultSelection: { provider: 'ingredientSet' } },
  ];
  const systems = () => [
    {
      id: 'alch-1',
      resolutionMode: 'alchemy',
      // 1.13.0 appends recipe ids onto this list in CORPUS ITERATION ORDER, so it is the one
      // persisted value in the registry whose bytes change under permutation. Membership is a
      // set semantically, which is why the assertion below is set equality — and why the
      // ARRAY inequality is asserted too, so the set comparison cannot go vacuous.
      recipeItemDefinitions: [{ id: 'def-1', sourceItemUuid: 'Item.book-1' }],
    },
    { id: 'routed-1', resolutionMode: 'routed' },
  ];
  // The permutation has to be one the MIGRATIONS can observe. Seeding the record documents
  // in a different order is not: `loadAll` imposes an id sort, so every granular run delivers
  // the same sequence and a seeded-order test would be vacuous. What differs in practice is
  // STORED order (the legacy array, preserved as authored) against ID order (what the
  // granular arm imposes) — so the two orders are driven through the legacy arm, and the
  // granular arm is then required to agree with both.
  const run = async (order) => {
    const seeded = records();
    const store = new Map(
      Object.entries({
        recipes: order.map((id) => seeded.find((record) => record.id === id)),
        craftingSystems: systems(),
        gatheringConfig: {},
        migrationVersion: '1.8.0',
      })
    );
    await new MigrationRunner({
      getSetting: (key) => store.get(key) ?? null,
      setSetting: async (key, value) => store.set(key, value),
    }).run();
    return store.get('craftingSystems');
  };

  const forward = await run(['r1', 'r2', 'r3', 'r4', 'r5']);
  const reversed = await run(['r5', 'r4', 'r3', 'r2', 'r1']);
  const granular = await (async () => {
    const world = makeGranularWorld({
      layout: DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
      records: records(),
      settings: { migrationVersion: '1.8.0', craftingSystems: systems() },
    });
    await granularRunner(world).run();
    return world.store.get('craftingSystems');
  })();

  const byId = (list, id) => list.find((system) => system.id === id);
  for (const [label, other] of [
    ['a reversed stored order', reversed],
    ['the id-ordered granular arm', granular],
  ]) {
    assert.equal(
      byId(forward, 'alch-1').alchemy.checkMode,
      byId(other, 'alch-1').alchemy.checkMode,
      `${label}: the alchemy check-mode reduction is order-free`
    );
    assert.equal(
      byId(forward, 'routed-1').resolutionMode,
      byId(other, 'routed-1').resolutionMode,
      `${label}: the routed tie-break is order-free`
    );
    assert.equal(
      byId(forward, 'routed-1').resolutionMode,
      'routedByCheck',
      'and the count really does decide it, so the comparison is not vacuous'
    );
  }
  // SET equality, not array equality. 1.13.0 appends recipe ids in corpus iteration order, so
  // a re-sorted corpus yields a permuted list. Membership is a set semantically, and this is
  // the one accepted, gated deviation from order-independence.
  const recipeIdsOf = (list) => [...byId(list, 'alch-1').recipeItemDefinitions[0].recipeIds];
  assert.deepEqual(recipeIdsOf(forward).sort(), ['r1', 'r2'], 'the list really is populated');
  assert.deepEqual(recipeIdsOf(forward).sort(), recipeIdsOf(reversed).sort());
  assert.deepEqual(recipeIdsOf(forward).sort(), recipeIdsOf(granular).sort());
  assert.notDeepEqual(
    recipeIdsOf(forward),
    recipeIdsOf(reversed),
    'and the ARRAY really is permuted, so the set comparison above is not vacuous'
  );
});

test("a permuted corpus disables the same SET of colliding alchemy recipes", async () => {
  // The 1.17.0 reconciliation is the one cross-record migration whose order-independence is
  // not obvious: it computes conflicts and then disables BOTH participants of each. The
  // inseparable fixture is from `tests/migrate-essences-to-ingredient-groups.test.js` — A
  // requires component C; B requires fire essence, of which C is the sole carrier, so after
  // folding both reduce to the identical signature.
  const seedRecords = () => [
    {
      id: 'A',
      name: 'A',
      craftingSystemId: 'alch-1',
      enabled: true,
      ingredientSets: [
        {
          id: 'sA',
          ingredientGroups: [
            { id: 'gA', options: [{ quantity: 1, match: { type: 'component', componentId: 'C' } }] },
          ],
        },
      ],
    },
    {
      id: 'B',
      name: 'B',
      craftingSystemId: 'alch-1',
      enabled: true,
      ingredientSets: [{ id: 'sB', ingredientGroups: [], essences: { fire: 1 } }],
    },
  ];
  const seedSystems = () => [
    {
      id: 'alch-1',
      resolutionMode: 'alchemy',
      alchemy: { checkMode: 'none' },
      components: [
        { id: 'C', name: 'Cinder', tags: [], essences: { fire: 1 } },
        { id: 'X', name: 'Xenon', tags: [], essences: {} },
      ],
    },
  ];
  const disabledIdsFor = async (order) => {
    const seeded = seedRecords();
    const store = new Map(
      Object.entries({
        recipes: order.map((id) => seeded.find((record) => record.id === id)),
        craftingSystems: seedSystems(),
        gatheringConfig: {},
        migrationVersion: '1.16.0',
      })
    );
    await new MigrationRunner({
      getSetting: (key) => store.get(key) ?? null,
      setSetting: async (key, value) => store.set(key, value),
    }).run();
    return store
      .get('recipes')
      .filter((record) => record.enabled === false)
      .map((record) => record.id)
      .sort();
  };

  const forward = await disabledIdsFor(['A', 'B']);
  const reversed = await disabledIdsFor(['B', 'A']);

  assert.deepEqual(forward, ['A', 'B'], 'the fixture really does collide');
  assert.deepEqual(forward, reversed, 'the disabled SET is invariant under permutation');
});

// ---------------------------------------------------------------------------
// 16(a). `main.js` wires the real accessor
// ---------------------------------------------------------------------------

test('main.js constructs the MigrationRunner with the real arrangement-aware accessor', () => {
  // A source scan, and deliberately so: `main.js` cannot be imported under `node --test`, and
  // a unit test that hand-injects the collaborator cannot observe the wiring at all.
  const source = readFileSync(
    fileURLToPath(new URL('../src/main.js', import.meta.url)),
    'utf8'
  );

  assert.match(source, /import \{ createRecipeCorpus \} from '\.\/systems\/recipeCorpus\.js';/);
  assert.match(source, /recipeCorpus: createRecipeCorpus\(\{ getSetting, setSetting \}\)/);
  assert.match(
    source,
    /if \(summary\?\.deferred === true\) \{/,
    'the deferral branch exists and sits above the abort branch'
  );
  assert.ok(
    source.indexOf('summary?.deferred === true') < source.indexOf('summary?.aborted === true'),
    'the deferral branch is checked BEFORE the abort branch, because a deferral reports aborted:false'
  );
});
