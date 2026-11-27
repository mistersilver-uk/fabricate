/**
 * A change into or out of `iterative` is refused, writing nothing, while the system has an active
 * crafting run (`destructive-changes-and-migrations` § Change Crafting System Resolution Mode),
 * through the real seam: `game.fabricate.getCraftingRunManager` and two world actors.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { mergeHistoryFlag } from './helpers/journal-fixtures.js';

let idSeq = 0;
const notifications = [];
const settingWrites = [];
const settings = new Map();
const record = (message) => {
  notifications.push(message);
};
const game = {
  user: { id: 'gm', isGM: true },
  time: { worldTime: 1000 },
  actors: [],
  settings: {
    get: (_namespace, key) => settings.get(key),
    set: async (_namespace, key, value) => {
      settingWrites.push(key);
      settings.set(key, value);
      return value;
    },
  },
};
Object.assign(globalThis, {
  foundry: { utils: { randomID: () => `rid-${++idSeq}`, getProperty: () => undefined } },
  ui: { notifications: { info: record, warn: record, error: record } },
  game,
});

const { CraftingRunManager } = await import('../src/systems/CraftingRunManager.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { CompendiumImporter } = await import('../src/systems/CompendiumImporter.js');
const {
  activeRunCountsBySystem,
  activeSystemRunCount,
  modeChangeRunRefusal,
  modeChangeRunsMessage,
} = await import('../src/systems/manager/resolutionModeChange.js');

class FakeActor {
  constructor(id) {
    this.id = id;
    this.name = id;
    this.uuid = `Actor.${id}`;
    this.isOwner = true;
    this.flags = {};
  }

  getFlag(namespace, key) {
    return this.flags[namespace]?.[key];
  }

  async setFlag(namespace, key, value) {
    this.flags[namespace] ??= {};
    this.flags[namespace][key] = mergeHistoryFlag(this.flags[namespace][key], value);
    return this;
  }
}

/** A recipe manager over no recipes that counts every write a mode change could make. */
function recordingRecipeManager(recipes = []) {
  const calls = {
    updateRecipe: 0,
    deleteRecipes: 0,
    cleanupOrphanedRecipeFlags: 0,
    createRecipe: 0,
  };
  const count = (name) => async () => {
    calls[name] += 1;
    return { deleted: 0, recipeIds: [], recipes: [] };
  };
  return {
    calls,
    getRecipes: () => recipes,
    getRecipe: () => null,
    updateRecipe: count('updateRecipe'),
    deleteRecipes: count('deleteRecipes'),
    cleanupOrphanedRecipeFlags: count('cleanupOrphanedRecipeFlags'),
    createRecipe: count('createRecipe'),
    disableSignatureConflicts: async () => [],
    _notifyRecipesChanged() {},
    notifyRecipesChanged() {},
  };
}

/** A real run manager whose `invalidateCache` calls are counted. */
function countingRunManager() {
  const runManager = new CraftingRunManager();
  runManager.invalidations = 0;
  const invalidate = runManager.invalidateCache.bind(runManager);
  runManager.invalidateCache = (...args) => {
    runManager.invalidations += 1;
    return invalidate(...args);
  };
  return runManager;
}

const recipeFor = (craftingSystemId, id = 'r-1') => ({
  id,
  craftingSystemId,
  getExecutionSteps: () => [{ id: `${id}-step`, name: 'Only' }],
});

let runManager;
let actors;

/** A ready manager holding `sys-1` in `mode` and `sys-2` in `routedByCheck`, counting saves. */
function managerWith(mode, recipeManager = recordingRecipeManager()) {
  const manager = new CraftingSystemManager(recipeManager, {
    componentScopeStore: null,
    essenceScopeStore: null,
    toolScopeStore: null,
    characterLibrariesStore: null,
  });
  manager.initialized = true;
  manager.saves = 0;
  manager.save = async () => {
    manager.saves += 1;
  };
  for (const [id, resolutionMode] of [
    ['sys-1', mode],
    ['sys-2', 'routedByCheck'],
  ]) {
    manager.systems.set(id, manager._normalizeSystem({ id, name: `Forge ${id}`, resolutionMode }));
  }
  return { manager, recipeManager };
}

beforeEach(() => {
  notifications.length = 0;
  settingWrites.length = 0;
  runManager = countingRunManager();
  actors = [new FakeActor('actor-a'), new FakeActor('actor-b')];
  game.actors = actors;
  game.fabricate = { getCraftingRunManager: () => runManager };
});

const MESSAGES = {
  'into:1': 'Blocked until the crafting run in progress is finished or cancelled.',
  'into:2': 'Blocked until the 2 crafting runs in progress are finished or cancelled.',
  'out:1': 'Blocked until the workpiece in progress is finished or cancelled.',
  'out:2': 'Blocked until the 2 workpieces in progress are finished or cancelled.',
};
const DIRECTIONS = { into: ['routedByCheck', 'iterative'], out: ['iterative', 'routedByCheck'] };

describe('a change across iterative with active runs', () => {
  for (const [direction, [fromMode, toMode]] of Object.entries(DIRECTIONS)) {
    for (const count of [1, 2]) {
      it(`is refused ${direction} at ${count} run(s), writing nothing`, async () => {
        const { manager, recipeManager } = managerWith(fromMode);
        // The second actor's runs alone, so a walk that stops at the first actor counts nothing.
        for (let index = 0; index < count; index += 1) {
          await runManager.createRun(actors[1], recipeFor('sys-1', `r-${index}`));
        }
        const before = structuredClone(manager.getSystem('sys-1'));
        runManager.invalidations = 0;

        await assert.rejects(
          manager.updateSystem('sys-1', { name: 'Renamed', resolutionMode: toMode }),
          (error) => {
            assert.ok(error instanceof Error);
            assert.equal(error.reason, 'modeChangeRunsActive');
            assert.equal(error.count, count);
            assert.equal(error.direction, direction);
            assert.equal(error.message, MESSAGES[`${direction}:${count}`]);
            return true;
          }
        );

        assert.deepEqual(manager.getSystem('sys-1'), before, 'name plus mode is refused whole');
        assert.equal(manager.saves, 0);
        assert.deepEqual(recipeManager.calls, {
          updateRecipe: 0,
          deleteRecipes: 0,
          cleanupOrphanedRecipeFlags: 0,
          createRecipe: 0,
        });
        assert.deepEqual(notifications, []);
        assert.equal(
          runManager.invalidations,
          0,
          'the count reads the cache, never invalidating it'
        );
      });
    }
  }

  it('the message function owns the four sentences', () => {
    for (const [key, message] of Object.entries(MESSAGES)) {
      const [direction, count] = key.split(':');
      assert.equal(modeChangeRunsMessage({ direction, count: Number(count) }), message);
    }
  });
});

describe('a mode change the run check lets through', () => {
  const passes = async (fromMode, toMode, systemId = 'sys-1') => {
    const { manager } = managerWith(fromMode);
    const saved = await manager.updateSystem(systemId, { resolutionMode: toMode });
    assert.equal(saved.resolutionMode, toMode);
    assert.ok(manager.saves > 0);
  };

  it("passes beside another system's run", async () => {
    await runManager.createRun(actors[0], recipeFor('sys-2'));
    await passes('routedByCheck', 'iterative');
  });

  it('passes a non-iterative change and a same-mode update while runs are active', async () => {
    await runManager.createRun(actors[0], recipeFor('sys-1'));
    await passes('routedByCheck', 'simple');
    const { manager } = managerWith('iterative');
    await manager.updateSystem('sys-1', { name: 'Kept', resolutionMode: 'iterative' });
    assert.equal(manager.getSystem('sys-1').name, 'Kept');
  });

  it('does not count a completed or a cancelled run', async () => {
    const done = await runManager.createRun(actors[0], recipeFor('sys-1', 'r-done'));
    const cancelled = await runManager.createRun(actors[1], recipeFor('sys-1', 'r-cancel'));
    await runManager.completeRun(actors[0], done, 'succeeded');
    await runManager.cancelRun(actors[1], cancelled.id);
    await passes('routedByCheck', 'iterative');
  });

  for (const [direction, [fromMode, toMode]] of Object.entries(DIRECTIONS)) {
    it(`cancels the pre-flip run ${direction}, then passes the same change`, async () => {
      const { manager } = managerWith(fromMode);
      const run = await runManager.createRun(actors[0], recipeFor('sys-1'));
      await assert.rejects(manager.updateSystem('sys-1', { resolutionMode: toMode }), {
        reason: 'modeChangeRunsActive',
      });
      const archived = await runManager.cancelRun(actors[0], run.id);
      assert.equal(archived.status, 'cancelled');
      const saved = await manager.updateSystem('sys-1', { resolutionMode: toMode });
      assert.equal(saved.resolutionMode, toMode);
    });
  }

  it('counts 0 with no run manager', async () => {
    game.fabricate = {};
    await passes('routedByCheck', 'iterative');
    assert.equal(activeSystemRunCount(null, actors, 'sys-1'), 0);
  });
});

describe('the run counts', () => {
  it('counts iterative, plain and foreign runs per system across world actors', async () => {
    await runManager.createRun(actors[0], recipeFor('sys-1', 'r-plain'));
    await runManager.createRun(actors[1], recipeFor('sys-1', 'r-iter'), [], null, {
      termsSnapshot: { recipe: {}, craftingCheck: null, iterative: { actions: [] } },
    });
    await runManager.createRun(actors[1], recipeFor('sys-foreign', 'r-foreign'));
    assert.deepEqual(activeRunCountsBySystem(runManager, actors), { 'sys-1': 2, 'sys-foreign': 1 });
    assert.equal(activeSystemRunCount(runManager, actors, 'sys-1'), 2);
    assert.equal(activeSystemRunCount(runManager, actors, 'sys-2'), 0);
    assert.equal(activeSystemRunCount(runManager, actors, 'toString'), 0);
    assert.deepEqual(activeRunCountsBySystem(runManager, [actors[0]]), { 'sys-1': 1 });
    assert.deepEqual(activeRunCountsBySystem(null, actors), {});
  });

  it('the refusal names only a change with iterative on one side and a positive count', () => {
    assert.equal(modeChangeRunRefusal({ fromMode: 'simple', toMode: 'alchemy', count: 3 }), null);
    assert.equal(
      modeChangeRunRefusal({ fromMode: 'iterative', toMode: 'iterative', count: 3 }),
      null
    );
    assert.equal(modeChangeRunRefusal({ fromMode: 'simple', toMode: 'iterative', count: 0 }), null);
    assert.deepEqual(modeChangeRunRefusal({ fromMode: 'iterative', toMode: 'alchemy', count: 2 }), {
      reason: 'modeChangeRunsActive',
      count: 2,
      direction: 'out',
    });
  });
});

describe('an overwrite import across iterative while a run is active', () => {
  /** A real manager behind the importer, its library and roster writes recorded. */
  function importerHarness(mode) {
    const { manager, recipeManager } = managerWith(mode);
    const rosterSaves = [];
    const componentScopeStore = {
      isSeeded: () => true,
      get: () => ({ entities: [], membership: {}, defaults: {} }),
      save: async (value) => {
        rosterSaves.push(value);
      },
    };
    const reporter = Object.assign(() => {}, { dismissed: 0 });
    reporter.dismiss = () => {
      reporter.dismissed += 1;
    };
    const importer = new CompendiumImporter(manager, recipeManager, {
      isGM: () => true,
      getSetting: (key) => settings.get(key),
      setSetting: async (key, value) => {
        settingWrites.push(key);
        settings.set(key, value);
      },
      componentScopeStore,
      reportProgress: reporter,
    });
    return { manager, recipeManager, importer, rosterSaves, reporter };
  }

  const payload = (resolutionMode) => ({
    system: { id: 'sys-1', name: 'Forge sys-1', resolutionMode, components: [] },
    recipes: [{ id: 'r-new', name: 'New', craftingSystemId: 'sys-1' }],
    characterLibraries: { characterPrerequisites: [{ id: 'pre-1', name: 'Smith' }] },
    componentScope: { entities: [{ id: 'world-ore', name: 'Ore' }] },
  });

  it('writes only the library and roster merges, then rethrows and closes the reporter', async () => {
    const { manager, recipeManager, importer, rosterSaves, reporter } =
      importerHarness('routedByCheck');
    await runManager.createRun(actors[0], recipeFor('sys-1'));
    settingWrites.length = 0;

    await assert.rejects(
      importer.importFromPackData(payload('iterative'), { overwriteExisting: true }),
      {
        reason: 'modeChangeRunsActive',
      }
    );

    assert.deepEqual(settingWrites, ['characterLibraries']);
    assert.equal(rosterSaves.length, 1);
    assert.equal(manager.saves, 0);
    assert.equal(manager.getSystem('sys-1').resolutionMode, 'routedByCheck');
    assert.equal(recipeManager.calls.createRecipe, 0);
    assert.equal(reporter.dismissed, 1);
  });

  it('a mode-keeping overwrite succeeds beside the same run', async () => {
    const { manager, importer } = importerHarness('routedByCheck');
    await runManager.createRun(actors[0], recipeFor('sys-1'));
    const summary = await importer.importFromPackData(payload('routedByCheck'), {
      overwriteExisting: true,
    });
    assert.equal(summary.system.skipped, false);
    assert.ok(manager.saves > 0);
  });
});
