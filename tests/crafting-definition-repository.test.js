/**
 * Issue 1089 — the crafting-definition repository seam.
 *
 * The byte-level proof that this changed nothing lives in
 * `crafting-definition-persistence-equivalence.test.js`. This suite covers the rest of
 * the issue's acceptance criteria: that no production code outside the adapter still
 * reaches the two setting keys, that the repository is injectable and countable, that
 * a single-record mutation costs exactly one write, and that the interface really is
 * expressible by the other candidate backend rather than only claimed to be.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

import { SETTING_KEYS } from '../src/config/settings.js';
import {
  CraftingDefinitionRepository,
  applyDefinitionChange,
} from '../src/systems/CraftingDefinitionRepository.js';
import { SettingsCraftingDefinitionRepository } from '../src/systems/SettingsCraftingDefinitionRepository.js';

import {
  CountingDefinitionRepository,
  DocumentShapedDefinitionRepository,
} from './helpers/definitionRepositoryFakes.js';
import { installFoundryEnv } from './helpers/foundryEnv.js';
import { makeSettingsSeam } from './helpers/settings.js';
import { collectWorkingTreeSources, stripComments } from './helpers/sourceScan.js';

const env = installFoundryEnv();
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { Recipe } = await import('../src/models/Recipe.js');

/**
 * `getSetting(SETTING_KEYS.RECIPES)` and friends — the thing the acceptance criterion
 * actually forbids, as opposed to merely naming a key.
 *
 * Matches `_getSetting`/`this._setSetting` too, deliberately: an injected accessor
 * reaching the same key is the same coupling wearing a seam.
 */
const KEY_ACCESS = /\b_?(?:get|set)Setting\(\s*SETTING_KEYS\.(?:RECIPES|CRAFTING_SYSTEMS)\b/;

/** Modules permitted to READ OR WRITE the two keys directly. */
const KEY_ACCESS_ALLOWLIST = new Set([
  // The adapter. The only production write path for these two keys.
  'src/systems/SettingsCraftingDefinitionRepository.js',
  // Owned by #1080: ~36 registered migrations rewrite the raw settings corpus through
  // their own injected `_getSetting`/`_setSetting` seams, and they run BEFORE either
  // manager initializes. Routing them through the repository would put a hydrating,
  // normalizing layer underneath migrations whose whole job is to fix data the
  // normalizers cannot yet read — and a migration that silently reads nothing is a
  // data-loss bug no test catches.
  'src/migration/MigrationRunner.js',
  // Issue 1232 — the Storage Layout Conversion. It is the operation that MOVES the corpus
  // between arrangements, so "go through the repository" is not available to it in either
  // direction: the repository is chosen BY the arrangement, and asking the single-array
  // adapter to write the legacy key is exactly what the arrangement guard now refuses. It
  // also deliberately carries RAW stored values rather than hydrating through the model,
  // for the same reason the migration runner does — a conversion whose output depends on
  // today's normalizer drops any field that normalizer has not learned to emit.
  'src/systems/definitionStorageConversion.js',
  // Issue 1242 — the arrangement-aware recipe corpus accessor for the startup migration
  // pass. It is the module that SELECTS between the legacy key and the per-record store, so
  // "go through the repository" is not available to it either: on a `singleArray` world the
  // legacy-key access IS the correct access, and on a `perRecord` world it delegates to the
  // per-record adapter. It carries raw stored values for the same reason the runner and the
  // conversion do. Adding a module here is a deliberate act: the point of this list is that
  // every legacy-key reader is enumerated and justified rather than merely permitted.
  'src/systems/recipeCorpus.js',
  // Issue 1212 — the COMPONENT Storage Layout Conversion. Same standing as the recipe one,
  // with one difference that is the whole subject of that change: its step 4 REWRITES
  // `craftingSystems` without the extracted keys rather than deleting a document, so it
  // touches the container key by construction and carries raw stored values for it.
  'src/systems/componentStorageConversion.js',
  // Issue 1212 — the arrangement-aware CRAFTING-SYSTEM corpus accessor for the startup
  // migration pass. Same standing as `recipeCorpus.js`: it is the module that SELECTS between
  // the nested key and the per-record component store, and on a `singleArray` world the
  // container access IS the correct access.
  'src/systems/craftingSystemCorpus.js',
]);

/** Modules permitted to NAME the two keys at all (a superset of the above). */
const KEY_MENTION_ALLOWLIST = new Set([
  ...KEY_ACCESS_ALLOWLIST,
  // Declares them.
  'src/config/settings.js',
  // Derives the fully-qualified `updateSetting` hook keys; reads and writes nothing.
  'src/config/settingChangeBridge.js',
  // Name a key only to construct their repository.
  'src/systems/RecipeManager.js',
  'src/systems/CraftingSystemManager.js',
  // Issue 1212: IS the crafting-system adapter. It names `CRAFTING_SYSTEMS` to construct the
  // container half of itself and reaches the key through no other route.
  'src/systems/CompositeCraftingSystemRepository.js',
]);

function recipeData(overrides = {}) {
  return {
    id: overrides.id ?? 'r1',
    name: overrides.name ?? 'Test Recipe',
    craftingSystemId: overrides.craftingSystemId ?? 'sys-1',
    ingredientSets: [
      {
        id: 'set-1',
        ingredientGroups: [
          {
            id: 'group-1',
            name: 'Ingredients',
            options: [{ id: 'opt-1', itemUuid: 'Item.in', quantity: 1 }],
          },
        ],
        essences: {},
      },
    ],
    resultGroups: [{ id: 'rg-1', results: [{ id: 'res-1', itemUuid: 'Item.out', quantity: 1 }] }],
    ...overrides,
  };
}

/** A `RecipeManager` whose repository is a counting wrapper around the real adapter. */
function countedRecipeManager() {
  const manager = new RecipeManager();
  const real = new SettingsCraftingDefinitionRepository({
    settingKey: SETTING_KEYS.RECIPES,
    corpus: () => manager.recipes,
    hydrate: (raw) => Recipe.fromJSON(raw),
    serialize: (recipe) => recipe.toJSON(),
    scopeOf: (recipe) => recipe?.craftingSystemId ?? null,
  });
  const counting = new CountingDefinitionRepository(real);
  manager._repository = counting;
  return { manager, counting };
}

describe('no production code outside the adapter touches the definition setting keys', () => {
  /** @returns {Record<string, string>} comment-stripped `src/**` sources by repo-relative path. */
  function scannedSources() {
    const sources = collectWorkingTreeSources(['src'], ['.js', '.mjs', '.svelte']);
    assert.ok(
      Object.keys(sources).length > 100,
      'the source scan found suspiciously few files; a vacuous gate proves nothing'
    );
    return Object.fromEntries(
      Object.entries(sources).map(([file, source]) => [file, stripComments(source)])
    );
  }

  it('leaves every read and write of the two keys to the adapter', () => {
    const offenders = Object.entries(scannedSources())
      .filter(([file, code]) => !KEY_ACCESS_ALLOWLIST.has(file) && KEY_ACCESS.test(code))
      .map(([file]) => file);

    assert.deepEqual(
      offenders,
      [],
      'these modules read or write the recipes/craftingSystems settings directly; go through CraftingDefinitionRepository instead'
    );
  });

  it('leaves even naming the two keys to a short, deliberate list', () => {
    const offenders = Object.entries(scannedSources())
      .filter(
        ([file, code]) =>
          !KEY_MENTION_ALLOWLIST.has(file) && /SETTING_KEYS\.(RECIPES|CRAFTING_SYSTEMS)/.test(code)
      )
      .map(([file]) => file);

    assert.deepEqual(offenders, [], 'these modules name a definition setting key directly');
  });

  it('actually fires on the shape it forbids, in both spellings', () => {
    // A "must print nothing" gate is worthless until you have watched it print something.
    // Both of these are real pre-seam lines from the two managers and the migration runner.
    assert.ok(KEY_ACCESS.test(stripComments('const saved = getSetting(SETTING_KEYS.RECIPES) || [];')));
    assert.ok(
      KEY_ACCESS.test(stripComments('await setSetting(SETTING_KEYS.CRAFTING_SYSTEMS, payload);'))
    );
    assert.ok(
      KEY_ACCESS.test(stripComments('const raw = this._getSetting(SETTING_KEYS.RECIPES) ?? [];')),
      'an injected accessor reaching the same key is the same coupling'
    );
  });

  it('does not fire on prose or on an unrelated setting key', () => {
    assert.ok(
      !KEY_ACCESS.test(stripComments('// getSetting(SETTING_KEYS.RECIPES) used to live here\nconst x = 1;')),
      'comments are stripped before matching, so documenting the retired shape is safe'
    );
    assert.ok(!KEY_ACCESS.test(stripComments('getSetting(SETTING_KEYS.THEME);')));
  });
});

describe('the repository is injectable and countable without patching globals', () => {
  beforeEach(() => env.settings.clear());

  it('a single-recipe create, update and delete each cost exactly one write', async () => {
    const { manager, counting } = countedRecipeManager();
    manager.initialized = true;

    await manager.createRecipe(recipeData({ id: 'r1' }), { notify: false, emitChange: false });
    assert.equal(counting.writeCount, 1, 'create issues exactly one persistence write');
    assert.deepEqual(counting.writeLog, ['put:r1']);

    await manager.updateRecipe('r1', { name: 'Renamed' }, { notify: false, emitChange: false });
    assert.equal(counting.writeCount, 2, 'update issues exactly one further write');

    await manager.deleteRecipe('r1', { notify: false, cleanupFlags: false });
    assert.deepEqual(
      counting.writeLog,
      ['put:r1', 'put:r1', 'delete:r1'],
      'each single-record mutation names the record it changed — the baseline #1080 must improve on'
    );
    assert.equal(counting.counts.putAll, 0, 'no whole-corpus write is issued for a single mutation');
  });

  it('persist:false defers to exactly one whole-corpus write', async () => {
    const { manager, counting } = countedRecipeManager();
    manager.initialized = true;

    const batchOptions = { persist: false, notify: false, emitChange: false };
    await manager.createRecipe(recipeData({ id: 'a' }), batchOptions);
    await manager.createRecipe(recipeData({ id: 'b' }), batchOptions);
    assert.equal(counting.writeCount, 0, 'persist:false announces nothing at the seam');

    await manager.save();
    assert.deepEqual(counting.writeLog, ['putAll:2'], 'one flush covers the whole batch');
  });

  it('a crafting-system mutation is countable through the same seam', async () => {
    const recipeManager = new RecipeManager();
    const manager = new CraftingSystemManager(recipeManager);
    const counting = new CountingDefinitionRepository(
      new SettingsCraftingDefinitionRepository({
        settingKey: SETTING_KEYS.CRAFTING_SYSTEMS,
        corpus: () => manager.systems,
        hydrate: (raw) => manager._normalizeSystem(raw),
        serialize: (system) => system,
        scopeOf: (system) => system?.id ?? null,
      })
    );
    manager._repository = counting;
    manager.initialized = true;

    await manager.createSystem({ id: 'sys-1', name: 'Alpha' });
    await manager.createItem('sys-1', { id: 'c1', name: 'Ore' });
    await manager.deleteSystem('sys-1');

    assert.deepEqual(counting.writeLog, ['put:sys-1', 'put:sys-1', 'delete:sys-1']);
    assert.equal(counting.counts.putAll, 0, 'no single-system mutation replaces the whole corpus');
  });
});

describe('the settings adapter', () => {
  /** A standalone adapter over an explicit corpus map, with no manager involved. */
  function makeAdapter({ isGM = true } = {}) {
    const corpus = new Map();
    const seam = makeSettingsSeam({ isGM });
    const repository = new SettingsCraftingDefinitionRepository({
      settingKey: SETTING_KEYS.RECIPES,
      corpus: () => corpus,
      scopeOf: (record) => record?.craftingSystemId ?? null,
      getSetting: seam.getSetting,
      setSetting: seam.setSetting,
    });
    return { corpus, seam, repository };
  }

  it('writes the whole corpus for a single put, because settings cannot address a record', async () => {
    const { corpus, seam, repository } = makeAdapter();
    await repository.put({ id: 'a', name: 'A' });
    await repository.put({ id: 'b', name: 'B' });

    assert.equal(seam.writes.length, 2, 'one write per put');
    assert.deepEqual(
      seam.writes.at(-1).value,
      [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      'the second put still serializes the first record too'
    );
    assert.deepEqual([...corpus.keys()], ['a', 'b']);
  });

  it('preserves insertion order when an existing record is replaced', async () => {
    const { seam, repository } = makeAdapter();
    await repository.put({ id: 'a', name: 'A' });
    await repository.put({ id: 'b', name: 'B' });
    await repository.put({ id: 'a', name: 'A2' });

    assert.deepEqual(
      seam.writes.at(-1).value.map((record) => record.id),
      ['a', 'b'],
      'replacing a record must not move it to the end of the persisted array'
    );
  });

  it('coalesces a batch into one write and still flushes when the work throws', async () => {
    const { seam, repository } = makeAdapter();
    await repository.runBatch(async () => {
      await repository.put({ id: 'a', name: 'A' });
      await repository.put({ id: 'b', name: 'B' });
      await repository.delete('a');
    });
    assert.equal(seam.writes.length, 1, 'three operations, one flush');
    assert.deepEqual(seam.writes[0].value, [{ id: 'b', name: 'B' }]);

    await assert.rejects(
      repository.runBatch(async () => {
        await repository.put({ id: 'c', name: 'C' });
        throw new Error('boom');
      }),
      /boom/
    );
    assert.equal(seam.writes.length, 2, 'memory already moved, so storage must not be left behind');
  });

  it('answers get and scoped listSummaries', async () => {
    const { repository } = makeAdapter();
    await repository.put({ id: 'a', name: 'A', craftingSystemId: 'sys-1' });
    await repository.put({ id: 'b', name: 'B', craftingSystemId: 'sys-2' });

    assert.equal((await repository.get('a'))?.name, 'A');
    assert.equal(await repository.get('nope'), null);
    assert.deepEqual(await repository.listSummaries({ systemId: 'sys-2' }), [
      { id: 'b', name: 'B', systemId: 'sys-2' },
    ]);
    assert.deepEqual(
      (await repository.listSummaries({ ids: ['a'] })).map((summary) => summary.id),
      ['a']
    );
    assert.equal((await repository.listSummaries()).length, 2, 'an empty query lists everything');
  });

  it('still lets the server refuse a non-GM write', async () => {
    const { seam, repository } = makeAdapter({ isGM: false });
    await assert.rejects(repository.put({ id: 'a', name: 'A' }), /lacks permission to update Setting/);
    assert.deepEqual(seam.refused, ['recipes'], 'world-scope authority is unchanged by the seam');
    assert.equal(seam.writes.length, 0);
  });

  it('rejects construction without the settings-specific corpus accessor', () => {
    assert.throws(
      () => new SettingsCraftingDefinitionRepository({ settingKey: SETTING_KEYS.RECIPES }),
      TypeError
    );
  });

  it('is untouched by #1080’s per-record replication capability', async () => {
    // -b adds an OPTIONAL capability to the seam and this adapter opts out of it by
    // inheriting the defaults, so `reload()` keeps re-reading the whole corpus exactly as
    // it does today. A whole-corpus backend cannot answer per-record: a replication event
    // names the one key holding everything.
    const { repository } = makeAdapter();
    await repository.put({ id: 'a', name: 'A' });

    assert.equal(repository.supportsPerRecordReplication(), false);
    assert.equal(
      repository.readReplicatedRecord({ key: 'fabricate.recipes', operation: 'update' }),
      null,
      'the settings adapter must fall its caller back to the whole-corpus snapshot'
    );
    assert.deepEqual(repository.readReplicatedSnapshot(), [{ id: 'a', name: 'A' }]);
  });
});

describe('the interface is expressible by a document-backed backend', () => {
  beforeEach(() => env.settings.clear());

  it('drives the real RecipeManager with one document written per single-record mutation', async () => {
    const manager = new RecipeManager();
    const repository = new DocumentShapedDefinitionRepository({
      serialize: (recipe) => recipe.toJSON(),
      hydrate: (raw) => Recipe.fromJSON(raw),
      scopeOf: (raw) => raw?.craftingSystemId ?? null,
    });
    manager._repository = repository;
    await manager.initialize();

    const options = { notify: false, emitChange: false };
    await manager.createRecipe(recipeData({ id: 'a' }), options);
    await manager.createRecipe(recipeData({ id: 'b' }), options);
    await manager.updateRecipe('a', { name: 'Renamed' }, options);
    await manager.deleteRecipe('b', { notify: false, cleanupFlags: false });

    assert.deepEqual(
      repository.documentWrites,
      [1, 1, 1, 1],
      'every single-record mutation touched exactly ONE document — this is what the seam buys #1080, and it needed no caller change'
    );
    assert.deepEqual([...repository.documents.keys()], ['a']);
    assert.equal((await repository.get('a'))?.name, 'Renamed');
    assert.deepEqual(await repository.listSummaries({ systemId: 'sys-1' }), [
      { id: 'a', name: 'Renamed', systemId: 'sys-1' },
    ]);
  });

  it('goes inert on reload rather than answering wrongly when replication is unavailable', async () => {
    const manager = new RecipeManager();
    manager._repository = new DocumentShapedDefinitionRepository();
    await manager.initialize();
    await manager.createRecipe(recipeData({ id: 'a' }), { notify: false, emitChange: false });

    assert.equal(
      manager.reload(),
      false,
      'a backend with no synchronous replicated snapshot reports no change instead of wiping the map'
    );
    assert.equal(manager.recipes.size, 1, 'the in-memory corpus survives an unsupported reload');
  });

  it('coalesces a manager batch into one bulk document operation', async () => {
    const repository = new DocumentShapedDefinitionRepository();
    await applyDefinitionChange(repository, { batch: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }, []);
    assert.deepEqual(repository.documentWrites, [3], 'one bulk operation covering three documents');
  });
});

describe('the abstract contract', () => {
  it('refuses to answer instead of silently returning nothing', async () => {
    const bare = new CraftingDefinitionRepository();
    await assert.rejects(bare.loadAll(), /must implement loadAll/);
    await assert.rejects(bare.get('x'), /must implement get\(x\)/);
    await assert.rejects(bare.listSummaries(), /must implement listSummaries/);
    await assert.rejects(bare.put({}), /must implement put/);
    await assert.rejects(bare.delete('x'), /must implement delete\(x\)/);
    await assert.rejects(bare.putAll([]), /must implement putAll/);
    await assert.rejects(bare.runBatch(() => {}), /must implement runBatch/);
  });

  it('treats readReplicatedSnapshot as optional, defaulting to unsupported', () => {
    assert.equal(new CraftingDefinitionRepository().readReplicatedSnapshot(), null);
  });

  it('treats per-record replication as optional, defaulting to today’s whole-corpus behaviour', () => {
    // #1080 -b. Both members exist so a per-record backend can report ONE changed record
    // instead of forcing a whole-corpus re-read; every backend that cannot simply inherits
    // these, which is what makes the addition behaviour-neutral.
    const bare = new CraftingDefinitionRepository();
    assert.equal(bare.supportsPerRecordReplication(), false);
    assert.equal(bare.readReplicatedRecord({ key: 'fabricate.recipes', operation: 'update' }), null);
  });

  it('falls back to a whole-corpus write only when the caller does not say what changed', async () => {
    const repository = new DocumentShapedDefinitionRepository();
    await applyDefinitionChange(repository, null, [{ id: 'a' }, { id: 'b' }]);
    assert.deepEqual(repository.documentWrites, [2], 'an unnamed change costs the whole corpus');
  });
});
