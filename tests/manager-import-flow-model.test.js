/**
 * The manager's import flow model (issue 1721): the post-import report and the folder-aware
 * component drop. The selected system is a `SvelteMap` behind its thunk, as the shell's
 * `$derived` is, so the commit is shown to read the id at call time rather than at construction.
 */
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SvelteMap } from 'svelte/reactivity';

import { flushSync } from '../node_modules/svelte/src/index-client.js';
import { createSvelteModuleCompiler } from './helpers/compile-svelte-module.js';

const MODULE_PATH = 'src/ui/svelte/apps/manager/importFlowModel.svelte.js';

const GROUPS = Object.freeze([
  { folderId: 'f1', folderName: 'Reagent', itemCount: 2, itemUuids: ['Item.a', 'Item.b'] },
]);

describe('importFlowModel', () => {
  let compiler;
  let createImportFlowModel;

  before(async () => {
    compiler = createSvelteModuleCompiler('fabricate-import-flow-model-');
    ({ createImportFlowModel } = await compiler.loadWithClosure(MODULE_PATH));
  });

  after(() => {
    compiler.cleanup();
  });

  /** One model over a logged service seam and a live selected-system id. */
  function openModel({ report = null, plan = null, systemId = 'alchemy' } = {}) {
    const calls = [];
    const selection = new SvelteMap([['id', systemId]]);
    const store = {
      importSystem: async () => {
        calls.push(['importSystem']);
        return report;
      },
    };
    const services = {
      collectImportFolderGroups: async (data) => {
        calls.push(['collect', data]);
        return plan;
      },
      onDropItem: (data) => calls.push(['onDropItem', data]),
      commitImportFolderMapping: async (id, decisions) =>
        calls.push(['commit', id, decisions]),
    };
    const model = createImportFlowModel({
      store: () => store,
      services: () => services,
      selectedSystemId: () => selection.get('id'),
    });
    return { model, calls, selection };
  }

  it('stores the report a system import resolves, and null when it is cancelled', async () => {
    const report = { groups: [] };
    const { model } = openModel({ report });
    await model.importSystem();
    flushSync();
    // `$state` proxies the record, so the modal reads an equal report rather than the same object.
    assert.deepEqual(model.importReportContent, report, 'the resolved report reaches the modal');

    const cancelled = openModel({ report: undefined });
    cancelled.model.importReportContent = { stale: true };
    await cancelled.model.importSystem();
    flushSync();
    assert.equal(cancelled.model.importReportContent, null, 'a cancelled import closes the report');
  });

  it('opens the mapping modal over the folders a grouped drop resolved to', async () => {
    const { model, calls } = openModel({ plan: { groups: GROUPS } });
    const data = { type: 'Folder', uuid: 'Folder.f1' };
    await model.dropComponent(data);
    flushSync();

    assert.equal(model.importMappingOpen, true);
    assert.deepEqual(model.importMappingFolders, GROUPS);
    assert.deepEqual(calls, [['collect', data]], 'and nothing is imported before the GM commits');
  });

  it('imports nothing and opens nothing for a drop the collector already handled', async () => {
    const { model, calls } = openModel({ plan: { handled: true } });
    await model.dropComponent({ type: 'Folder', uuid: 'Folder.packs' });
    flushSync();

    assert.equal(model.importMappingOpen, false);
    assert.ok(!calls.some(([name]) => name === 'onDropItem'), 'a handled drop never falls through');
  });

  it('hands any other drop to onDropItem with the raw payload', async () => {
    for (const plan of [null, { groups: [] }]) {
      const { model, calls } = openModel({ plan });
      const data = { type: 'Item', uuid: 'Item.dropped', extra: 1 };
      await model.dropComponent(data);
      flushSync();

      assert.equal(model.importMappingOpen, false);
      const forwarded = calls.find(([name]) => name === 'onDropItem');
      assert.equal(forwarded?.[1], data, 'the payload is passed on untouched, not rebuilt');
    }
  });

  it('closes the modal before it skips an empty or malformed decision set', async () => {
    for (const decisions of [[], null, { folderId: 'f1' }]) {
      const { model, calls } = openModel({ plan: { groups: GROUPS } });
      await model.dropComponent({ type: 'Folder' });
      await model.commitImportFolderMapping(decisions);
      flushSync();

      assert.equal(model.importMappingOpen, false, 'the modal closes whatever the GM committed');
      assert.ok(!calls.some(([name]) => name === 'commit'), 'and nothing reaches the service');
    }
  });

  it('commits against the system selected when the GM commits', async () => {
    const { model, calls, selection } = openModel({ plan: { groups: GROUPS } });
    await model.dropComponent({ type: 'Folder' });
    selection.set('id', 'smithing');
    flushSync();

    const decisions = [{ folderId: 'f1', category: 'Reagent' }];
    const pending = model.commitImportFolderMapping(decisions);
    assert.equal(model.importMappingOpen, false, 'the modal is closed before the service settles');
    await pending;

    assert.deepEqual(calls.at(-1), ['commit', 'smithing', decisions]);
  });

  it('closes both modals through their setters', async () => {
    const { model } = openModel({ plan: { groups: GROUPS }, report: { groups: [] } });
    await model.dropComponent({ type: 'Folder' });
    await model.importSystem();
    model.importMappingOpen = false;
    model.importReportContent = null;
    flushSync();

    assert.equal(model.importMappingOpen, false);
    assert.equal(model.importReportContent, null);
  });

  describe('a drop import that throws (issue 2397)', () => {
    const FAILED_KEY = 'FABRICATE.Admin.Items.DropImportFailed';
    const PREFIX = 'Fabricate | Component drop import failed:';
    let savedUi;
    let savedError;
    let warnings;
    let errors;

    beforeEach(() => {
      savedUi = globalThis.ui;
      savedError = console.error;
      warnings = [];
      errors = [];
      const warn = (message) => {
        warnings.push(message);
      };
      Reflect.set(globalThis, 'ui', { notifications: { warn } });
      console.error = (...args) => {
        errors.push(args);
      };
    });

    afterEach(() => {
      Reflect.set(globalThis, 'ui', savedUi);
      console.error = savedError;
    });

    function assertWarnedOnce(label) {
      assert.deepEqual(warnings, [FAILED_KEY], `${label}: one import-failed warning`);
      assert.equal(errors.length, 1, `${label}: one console error`);
      assert.equal(errors[0][0], PREFIX, `${label}: under the drop-import prefix`);
      assert.ok(errors[0][1] instanceof Error, `${label}: carrying the error`);
    }

    /** A model whose named service throws the way `fail` says. */
    function failingModel(name, fail) {
      const calls = [];
      const services = {
        collectImportFolderGroups: async () => null,
        onDropItem: (data) => {
          calls.push(['onDropItem', data]);
        },
        commitImportFolderMapping: async () => {},
        [name]: fail,
      };
      const model = createImportFlowModel({
        services: () => services,
        selectedSystemId: () => 'alchemy',
      });
      return { model, calls };
    }

    it('warns once when onDropItem rejects or throws synchronously', async () => {
      const rejecting = failingModel('onDropItem', async () => {
        throw new Error('pack import failed');
      });
      await rejecting.model.dropComponent({ type: 'Compendium', id: 'world.items' });
      assertWarnedOnce('a rejecting onDropItem');

      warnings.length = 0;
      errors.length = 0;
      const throwing = failingModel('onDropItem', () => {
        throw new Error('folder import failed');
      });
      await throwing.model.dropComponent({ type: 'Folder', uuid: 'Folder.f1' });
      assertWarnedOnce('a throwing onDropItem');
    });

    it('warns once and imports nothing when the folder collector rejects', async () => {
      const { model, calls } = failingModel('collectImportFolderGroups', async () => {
        throw new Error('folder lookup failed');
      });
      await model.dropComponent({ type: 'Folder', uuid: 'Folder.f1' });
      assertWarnedOnce('a rejecting collector');
      assert.ok(
        calls.every(([name]) => name !== 'onDropItem'),
        'and onDropItem is never called'
      );
    });

    it('warns once when the folder-mapping commit rejects', async () => {
      const { model } = failingModel('commitImportFolderMapping', async () => {
        throw new Error('mapping commit failed');
      });
      await model.commitImportFolderMapping([{ folderId: 'f1', category: 'Reagent' }]);
      assertWarnedOnce('a rejecting commit');
      assert.equal(model.importMappingOpen, false, 'the modal is still closed');
    });

    it('warns nothing when the import resolves', async () => {
      const { model, calls } = openModel({ plan: null });
      await model.dropComponent({ type: 'Item', uuid: 'Item.ok' });
      await model.commitImportFolderMapping([{ folderId: 'f1', category: 'Reagent' }]);

      assert.ok(
        calls.some(([name]) => name === 'onDropItem'),
        'the drop reached the import'
      );
      assert.deepEqual(warnings, [], 'a resolving import warns nothing');
      assert.deepEqual(errors, [], 'and logs nothing');
    });
  });
});
