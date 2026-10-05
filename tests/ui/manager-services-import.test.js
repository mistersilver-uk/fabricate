/**
 * The system-import service's two failure boundaries (issue 1674), driven through
 * `createManagerServices` directly because both need an `io` the shell never passes: a report
 * builder that throws, and an admin store that is null.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildManagerWorld, installWorld } from '../fixtures/managerServicesCorpus.js';
import { createManagerServices } from '../../src/ui/managerServices.js';

const KNOWLEDGE_IO = Object.freeze({
  knowledgeSnapshot: () => null,
  expendRecipeItemUse: () => null,
  deleteOwnedRecipeItem: () => null,
  eraseLearnedRecipe: () => null,
  resetActorKnowledge: () => null,
});

/** A payload the importer resolves to an already-installed system, which is its cheapest exit. */
const IMPORT_FILE = {
  text: async () =>
    JSON.stringify({
      fabricateVersion: '1.0.0',
      system: { id: 'sys-import', name: 'Imported', components: [] },
      recipes: [],
    }),
};

/** A world in which the payload's system does not already exist, so the import runs to the report. */
function admitTheImport(world) {
  world.handles.craftingSystemManager.getSystems = () => [];
  world.handles.craftingSystemManager.createSystem = async (input) => ({
    id: 'sys-import',
    name: input.name,
  });
  world.handles.recipeManager.save = async () => world.record('recipeManager.save');
  return world;
}

async function withWorld(options, run) {
  const world = buildManagerWorld({ importFile: IMPORT_FILE, ...options });
  const restoreWorld = installWorld(world);
  const previousHooks = globalThis.Hooks;
  globalThis.Hooks = { on: () => 1, off: () => {}, once: () => 1 };
  try {
    return await run(world);
  } finally {
    globalThis.Hooks = previousHooks;
    restoreWorld();
  }
}

describe('the system import service', () => {
  it('reports a failing report builder as itself, never as a failed import', async () => {
    await withWorld({}, async (world) => {
      admitTheImport(world);
      const services = createManagerServices({
        ...KNOWLEDGE_IO,
        adminStore: () => ({ refresh: async () => world.record('adminStore.refresh') }),
        importReportBuilder: () => {
          throw new Error('report assembly blew up');
        },
      });
      await assert.rejects(
        () => services.renderSystemImportDialog(),
        /report assembly blew up/,
        'the report builder sits outside the import try, so its failure surfaces as itself'
      );
      assert.ok(
        !world.journal.some(
          ([channel, message]) =>
            channel === 'notify.error' && String(message).startsWith('Import failed')
        ),
        'a render failure must never be reported to the GM as a failed import'
      );
    });
  });

  it('hands the assembled report back when the builder succeeds', async () => {
    await withWorld({}, async (world) => {
      admitTheImport(world);
      const services = createManagerServices({
        ...KNOWLEDGE_IO,
        adminStore: () => ({ refresh: async () => world.record('adminStore.refresh') }),
        importReportBuilder: (summary) => ({ reported: summary.system.name }),
      });
      assert.deepStrictEqual(await services.renderSystemImportDialog(), { reported: 'Imported' });
      assert.ok(
        world.journal.some(([channel]) => channel === 'adminStore.refresh'),
        'a completed import refreshes the admin store'
      );
    });
  });

  it('refreshes and returns null when the system already exists', async () => {
    await withWorld({}, async (world) => {
      const services = createManagerServices({
        ...KNOWLEDGE_IO,
        adminStore: () => ({ refresh: async () => world.record('adminStore.refresh') }),
      });
      assert.equal(await services.renderSystemImportDialog(), null);
      assert.ok(
        world.journal.some(([channel]) => channel === 'adminStore.refresh'),
        'the skipped exit refreshes too, and outside the import try'
      );
    });
  });
});

/**
 * A GM can close the manager while an import runs, and closing nulls the shell's store. The
 * import has still landed, so its completion must neither throw nor be reported as a failure.
 */
describe('an import whose manager closes while it runs', () => {
  /** An io whose store closes when `close` is called, or when the import reads its file. */
  function closingManager() {
    const refreshes = [];
    let store = { refresh: async () => refreshes.push('refresh') };
    const close = () => (store = null);
    const file = { text: async () => (close(), IMPORT_FILE.text()) };
    return { io: { ...KNOWLEDGE_IO, adminStore: () => store }, file, close, refreshes };
  }

  const failed = (world) =>
    world.journal.some(
      ([channel, message]) => channel === 'notify.error' && /failed/i.test(String(message))
    );

  it('still announces the import, refreshes nothing, and opens no report', async () => {
    const closing = closingManager();
    await withWorld({ importFile: closing.file }, async (world) => {
      admitTheImport(world);
      assert.equal(await createManagerServices(closing.io).renderSystemImportDialog(), null);
      assert.ok(
        world.journal.some(
          ([channel, message]) =>
            channel === 'notify.info' && String(message).startsWith('Imported')
        ),
        'the success toast is the GM record of an import whose window has gone'
      );
      assert.deepStrictEqual(closing.refreshes, [], 'a closed manager has no store to refresh');
      assert.ok(!failed(world), 'a landed import is never reported as failed');
    });
  });

  it('still skips an existing system quietly', async () => {
    const closing = closingManager();
    await withWorld({ importFile: closing.file }, async (world) => {
      assert.equal(await createManagerServices(closing.io).renderSystemImportDialog(), null);
      assert.deepStrictEqual(closing.refreshes, []);
      assert.ok(!failed(world), 'the skip is not a failure either');
    });
  });

  it('never reports a landed recipe import as failed', async () => {
    const closing = closingManager();
    await withWorld({}, async (world) => {
      const importRecipes = world.handles.recipeManager.importRecipes;
      world.handles.recipeManager.importRecipes = async (...args) => {
        closing.close();
        return importRecipes(...args);
      };
      await createManagerServices(closing.io).renderImportDialog('sys-1');
      assert.ok(
        world.journal.some(([channel]) => channel === 'recipeManager.importRecipes'),
        'the recipes were imported'
      );
      assert.ok(!failed(world), 'so no "Import failed" toast follows them');
    });
  });
});
