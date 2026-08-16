/**
 * Issue 1080 (-b), task B3 — the in-place mutation audit, and the constructor default that
 * selects the recipe backend.
 *
 * **What makes this suite necessary.** Under the settings adapter a NAMED `save({put})`
 * still serializes `[...corpus().values()]`, so it flushes every in-memory mutation —
 * including ones made by code paths that never called `save()` themselves. A per-record
 * `put` writes exactly one document. Any site that mutated recipe A in place and then
 * issued `save({ put: B })` would therefore stop persisting A the moment the Definition
 * Storage Target flips, with nothing raised and no existing test failing, because every
 * existing test asserts against a backend for which the distinction does not exist.
 *
 * So the suite does two things. It pins the shape each of the six `save()` sites issues,
 * and — the part that stops the audit being a comment nobody can falsify — it proves the
 * loss is REAL by demonstrating it: an in-place mutation not named by a `save({put})` is
 * genuinely dropped by a granular backend, and the same mutation genuinely survives the
 * argument-less whole-corpus `save()` every external mutator already uses.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

import {
  DEFINITION_STORAGE_TARGETS,
  SETTING_KEYS,
  FABRICATE_SETTINGS_NAMESPACE,
} from '../src/config/settings.js';
import { Recipe } from '../src/models/Recipe.js';
import { CraftingDefinitionRepository } from '../src/systems/CraftingDefinitionRepository.js';
import {
  PerRecordCraftingDefinitionRepository,
  RECIPE_RECORD_KEY_PREFIX,
} from '../src/systems/PerRecordCraftingDefinitionRepository.js';
import { RecipeManager } from '../src/systems/RecipeManager.js';
import { SettingsCraftingDefinitionRepository } from '../src/systems/SettingsCraftingDefinitionRepository.js';

import { installFoundryEnv } from './helpers/foundryEnv.js';

/**
 * A repository with GRANULAR write semantics: `put` stores exactly one record and touches
 * nothing else, `delete` removes exactly one, `putAll` replaces the corpus.
 *
 * That is the whole point. The settings adapter cannot behave this way — it has no
 * addressable element — so a suite built on it can never observe the defect B3 audits for.
 * `calls` records the operation shape each manager method chose, which is the assertion.
 */
class GranularRecordingRepository extends CraftingDefinitionRepository {
  constructor(seed = []) {
    super();
    /** @type {Map<string, object>} id -> persisted JSON */
    this.stored = new Map(seed.map((record) => [record.id, structuredClone(record)]));
    /** @type {string[]} */
    this.calls = [];
    this._batchDepth = 0;
  }

  async loadAll() {
    return [...this.stored.values()].map((raw) => Recipe.fromJSON(raw));
  }

  async get(id) {
    const raw = this.stored.get(id);
    return raw ? Recipe.fromJSON(raw) : null;
  }

  async listSummaries() {
    return [...this.stored.values()].map(({ id, name }) => ({ id, name, systemId: null }));
  }

  async put(record) {
    this.calls.push(`put:${record.id}`);
    this.stored.set(record.id, record.toJSON());
  }

  async delete(id) {
    this.calls.push(`delete:${id}`);
    this.stored.delete(id);
  }

  async putAll(records) {
    this.calls.push('putAll');
    this.stored = new Map([...records].map((record) => [record.id, record.toJSON()]));
  }

  async runBatch(work) {
    this._batchDepth += 1;
    this.calls.push('batch:open');
    try {
      return await work();
    } finally {
      this._batchDepth -= 1;
      if (this._batchDepth === 0) this.calls.push('batch:close');
    }
  }

  /** The persisted value of one record, or `null`. */
  read(id) {
    return this.stored.get(id) ?? null;
  }
}

/** A repository answering the per-record replication seam, as the granular backend does. */
class ReplicatingRepository extends GranularRecordingRepository {
  constructor(seed = []) {
    super(seed);
    /** @type {object[]} */
    this.replicationReads = [];
    /** @type {Map<string, object|null>} key -> the record a replicated change delivers */
    this.wire = new Map();
  }

  supportsPerRecordReplication() {
    return true;
  }

  readReplicatedRecord(change) {
    this.replicationReads.push(change);
    if (!this.wire.has(change.key)) return null;
    const raw = this.wire.get(change.key);
    return {
      id: String(change.key).slice(`${FABRICATE_SETTINGS_NAMESPACE}.${RECIPE_RECORD_KEY_PREFIX}`.length),
      record: raw ? Recipe.fromJSON(raw) : null,
    };
  }
}

function recipeData(id, overrides = {}) {
  return { id, name: `Recipe ${id}`, craftingSystemId: 'sys-1', enabled: true, ...overrides };
}

/**
 * A recipe complete enough to clear the activation gate, which `importRecipes` applies
 * unconditionally — it has no `allowIncomplete` escape.
 */
function completeRecipeData(id, overrides = {}) {
  return recipeData(id, {
    ingredientSets: [
      {
        id: `${id}-set`,
        ingredientGroups: [
          {
            id: `${id}-group`,
            name: 'Ingredients',
            options: [{ id: `${id}-option`, itemUuid: 'Item.ingredient', quantity: 1 }],
          },
        ],
        essences: {},
      },
    ],
    resultGroups: [
      {
        id: `${id}-results`,
        results: [{ id: `${id}-result`, itemUuid: 'Item.result', quantity: 1 }],
      },
    ],
    ...overrides,
  });
}

/** A manager holding `ids`, already initialized, over the supplied repository. */
function seededManager(repository, ids) {
  const manager = new RecipeManager({ repository });
  for (const id of ids) manager.recipes.set(id, new Recipe(recipeData(id)));
  manager.initialized = true;
  return manager;
}

describe('RecipeManager backend selection (issue 1080 -b)', () => {
  let env;

  beforeEach(() => {
    env = installFoundryEnv();
  });

  it('builds the settings adapter when the target is unset — the behaviour-neutral default', () => {
    assert.ok(new RecipeManager()._repository instanceof SettingsCraftingDefinitionRepository);
  });

  it('builds the settings adapter for an explicit singleArray target', () => {
    env.settings.set(SETTING_KEYS.RECIPE_STORAGE_TARGET, DEFINITION_STORAGE_TARGETS.SINGLE_ARRAY);
    assert.ok(new RecipeManager()._repository instanceof SettingsCraftingDefinitionRepository);
  });

  it('builds the per-record adapter, with its separator-terminated prefix, for perRecord', () => {
    env.settings.set(SETTING_KEYS.RECIPE_STORAGE_TARGET, DEFINITION_STORAGE_TARGETS.PER_RECORD);
    const repository = new RecipeManager()._repository;
    assert.ok(repository instanceof PerRecordCraftingDefinitionRepository);
    assert.equal(repository.qualifiedPrefix, 'fabricate.recipe.');
  });

  it('falls back to the settings adapter when the target cannot be read at all', () => {
    // Fail TOWARDS today's arrangement: an unreadable target must never be able to promote
    // a world onto the granular backend. Many fixtures construct a bare manager with no
    // `game` at all, and `game.settings.get` throws for an unregistered key besides.
    const previous = globalThis.game;
    globalThis.game = undefined;
    try {
      assert.ok(new RecipeManager()._repository instanceof SettingsCraftingDefinitionRepository);
    } finally {
      globalThis.game = previous;
    }
  });

  it('still honours an injected repository, so no existing construction changes', () => {
    env.settings.set(SETTING_KEYS.RECIPE_STORAGE_TARGET, DEFINITION_STORAGE_TARGETS.PER_RECORD);
    const repository = new GranularRecordingRepository();
    assert.equal(new RecipeManager({ repository })._repository, repository);
  });
});

describe('RecipeManager in-place mutation audit (issue 1080 -b, B3)', () => {
  beforeEach(() => {
    installFoundryEnv();
  });

  it('createRecipe names only the created record', async () => {
    const repository = new GranularRecordingRepository();
    const manager = seededManager(repository, []);
    await manager.createRecipe(recipeData('r1'), { allowIncomplete: true, notify: false });
    assert.deepEqual(repository.calls, ['put:r1']);
  });

  it('updateRecipe names only the replaced record', async () => {
    const repository = new GranularRecordingRepository([recipeData('r1'), recipeData('r2')]);
    const manager = seededManager(repository, ['r1', 'r2']);
    repository.calls.length = 0;
    await manager.updateRecipe('r1', { name: 'Renamed' }, { allowIncomplete: true, notify: false });
    assert.deepEqual(repository.calls, ['put:r1']);
    assert.equal(repository.read('r1').name, 'Renamed');
  });

  it('deleteRecipe names only the removed record', async () => {
    const repository = new GranularRecordingRepository([recipeData('r1')]);
    const manager = seededManager(repository, ['r1']);
    repository.calls.length = 0;
    await manager.deleteRecipe('r1', { notify: false, cleanupFlags: false });
    assert.deepEqual(repository.calls, ['delete:r1']);
    assert.equal(repository.read('r1'), null);
  });

  it('deleteRecipes flushes the whole corpus, so a pending in-place edit rides along', async () => {
    const repository = new GranularRecordingRepository([
      recipeData('r1'),
      recipeData('r2'),
      recipeData('r3', { recipeItemId: 'ri-1' }),
    ]);
    const manager = new RecipeManager({ repository });
    await manager.initialize();
    assert.equal(repository.read('r3').recipeItemId, 'ri-1', 'control: the link starts set');

    // The external-mutator shape, exactly as `CraftingSystemManager.deleteRecipeItemDefinition`
    // performs it — clear the link on a stored recipe, then flush with an argument-less save.
    manager.getRecipe('r3').recipeItemId = null;
    repository.calls.length = 0;

    await manager.deleteRecipes(['r1'], { notify: false, cleanupFlags: false });

    assert.deepEqual(repository.calls, ['putAll']);
    assert.equal(repository.read('r1'), null);
    // `Recipe.toJSON` omits a null `recipeItemId`, so the cleared link is the key's absence.
    assert.ok(
      !Object.hasOwn(repository.read('r3'), 'recipeItemId'),
      'the in-place clear was persisted'
    );
  });

  it('importRecipes flushes the whole corpus', async () => {
    const repository = new GranularRecordingRepository();
    const manager = seededManager(repository, []);
    const result = await manager.importRecipes([
      completeRecipeData('r1'),
      completeRecipeData('r2'),
    ]);
    assert.equal(result.imported, 2, 'control: both recipes cleared the activation gate');
    assert.deepEqual(repository.calls, ['putAll']);
    assert.deepEqual([...repository.stored.keys()].sort(), ['r1', 'r2']);
  });

  it('a batch save persists EVERY member it names, in-place mutations included', async () => {
    // The `disableSignatureConflicts` shape: the one in-place writer in this manager. Its
    // batch is derived from the same `disabled` list it mutated, so the mutated set and the
    // persisted set are the same array by construction.
    const repository = new GranularRecordingRepository([recipeData('r1'), recipeData('r2')]);
    const manager = seededManager(repository, ['r1', 'r2']);
    const disabled = [manager.getRecipe('r1'), manager.getRecipe('r2')];
    for (const recipe of disabled) recipe.enabled = false;
    repository.calls.length = 0;

    await manager.save({ batch: disabled });

    assert.deepEqual(repository.calls, ['batch:open', 'put:r1', 'put:r2', 'batch:close']);
    assert.equal(repository.read('r1').enabled, false);
    assert.equal(repository.read('r2').enabled, false);
  });

  // ---- Why the audit is not a comment -------------------------------------------------
  //
  // These two are a matched pair and only mean anything together: the first states the
  // hazard the audit exists to prevent, the second states the discipline that avoids it.
  // Delete either and the other reads as a coincidence.

  it('DOES NOT persist an in-place mutation a named put did not name', async () => {
    const repository = new GranularRecordingRepository([recipeData('r1'), recipeData('r2')]);
    const manager = seededManager(repository, ['r1', 'r2']);
    manager.getRecipe('r1').enabled = false;

    await manager.save({ put: manager.getRecipe('r2') });

    assert.equal(
      repository.read('r1').enabled,
      true,
      'a granular put writes ONE record; the unnamed mutation is genuinely lost'
    );
  });

  it('DOES persist that same in-place mutation through the whole-corpus save', async () => {
    const repository = new GranularRecordingRepository([recipeData('r1'), recipeData('r2')]);
    const manager = seededManager(repository, ['r1', 'r2']);
    manager.getRecipe('r1').enabled = false;

    await manager.save();

    assert.equal(repository.read('r1').enabled, false);
  });
});

describe('RecipeManager.applyReplicatedRecordChange (issue 1080 -b, B4)', () => {
  beforeEach(() => {
    installFoundryEnv();
  });

  it('adds a replicated record and reports the change', () => {
    const repository = new ReplicatingRepository();
    const manager = seededManager(repository, []);
    repository.wire.set('fabricate.recipe.r1', recipeData('r1'));

    const changed = manager.applyReplicatedRecordChange({
      key: 'fabricate.recipe.r1',
      operation: 'update',
      document: {},
    });

    assert.equal(changed, true);
    assert.equal(manager.getRecipe('r1')?.name, 'Recipe r1');
  });

  it('initializes a client whose FIRST sight of the corpus is a replicated record', () => {
    // Deliberately NOT `seededManager`, which sets `initialized` itself: asserted against a
    // manager that already claimed it, this cannot fail, and the flag matters exactly for
    // the client that has never loaded — a player who joins mid-conversion and is handed
    // records one document at a time.
    const repository = new ReplicatingRepository();
    const manager = new RecipeManager({ repository });
    assert.equal(manager.initialized, false, 'control: nothing has loaded this manager');
    repository.wire.set('fabricate.recipe.r1', recipeData('r1'));

    assert.equal(
      manager.applyReplicatedRecordChange({
        key: 'fabricate.recipe.r1',
        operation: 'update',
        document: {},
      }),
      true
    );
    assert.equal(manager.initialized, true, 'the replicated record IS this client’s load');
  });

  it('replaces a changed record and advances that system revision', () => {
    const repository = new ReplicatingRepository();
    const manager = seededManager(repository, ['r1']);
    const before = manager.revision();
    repository.wire.set('fabricate.recipe.r1', recipeData('r1', { name: 'Renamed remotely' }));

    assert.equal(
      manager.applyReplicatedRecordChange({ key: 'fabricate.recipe.r1', operation: 'update' }),
      true
    );
    assert.equal(manager.getRecipe('r1').name, 'Renamed remotely');
    assert.notEqual(manager.revision(), before);
  });

  it('reports NO change for an identical record, and keeps the held object', () => {
    // This is the writing client, which receives its own document hooks. Reporting a change
    // here would emit a second `recipesChanged` per record on top of the single change hook
    // the writer already emits, and would destroy the record identity #1074 and #1076 key
    // their retained work on.
    const repository = new ReplicatingRepository();
    const manager = seededManager(repository, ['r1']);
    const held = manager.getRecipe('r1');
    const before = manager.revision();
    repository.wire.set('fabricate.recipe.r1', recipeData('r1'));

    assert.equal(
      manager.applyReplicatedRecordChange({ key: 'fabricate.recipe.r1', operation: 'update' }),
      false
    );
    assert.equal(manager.getRecipe('r1'), held, 'the held object survives, by identity');
    assert.equal(manager.revision(), before, 'and no revision token moved');
  });

  it('removes a replicated deletion, and reports a replayed one as no change', () => {
    const repository = new ReplicatingRepository();
    const manager = seededManager(repository, ['r1']);
    repository.wire.set('fabricate.recipe.r1', null);

    const change = { key: 'fabricate.recipe.r1', operation: 'delete' };
    assert.equal(manager.applyReplicatedRecordChange(change), true);
    assert.equal(manager.getRecipe('r1'), null);
    assert.equal(manager.applyReplicatedRecordChange(change), false, 'a replay is not a change');
  });

  it('reports no change for a key the repository does not store', () => {
    const repository = new ReplicatingRepository();
    const manager = seededManager(repository, ['r1']);
    assert.equal(
      manager.applyReplicatedRecordChange({ key: 'fabricate.component.c1', operation: 'update' }),
      false
    );
  });

  it('answers false, without reading the wire, for a backend with no per-record support', () => {
    // The settings adapter inherits `supportsPerRecordReplication() === false`, which IS
    // today's behaviour: its replication event names the one key holding everything and the
    // only correct response is the whole-corpus `reload()`.
    const repository = new GranularRecordingRepository();
    repository.readReplicatedRecord = () => {
      throw new Error('readReplicatedRecord must not be reached');
    };
    const manager = seededManager(repository, ['r1']);
    assert.equal(
      manager.applyReplicatedRecordChange({ key: 'fabricate.recipe.r1', operation: 'update' }),
      false
    );
  });
});
