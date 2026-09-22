/**
 * The admin store's tool-draft behaviour corpus (issue 1708): the draft's published keys, the
 * number of out-of-band publishes per op, the tool-persist call log with full arguments, and the
 * validation and dirty answers. The draft publishes outside `refresh()`, so the publish count is
 * part of the contract rather than an implementation detail.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertConvergent,
  assertStatePatch,
  createSectionHarness,
  makeCorpusSystem,
} from '../helpers/adminSectionCorpus.js';

function seamCalls(entries, seam) {
  return entries.filter((entry) => entry.seam === seam).map((entry) => entry.args);
}

const DRAFT_KEYS = [
  'toolDraft',
  'toolDraftBaseline',
  'toolDraftSystemId',
  'toolDraftSourceItemUuid',
  'toolDraftDirty',
  'toolDraftSaving',
  'toolDraftSaveError',
  'toolDraftValidation',
  'toolsDraft',
  'toolsDraftBaseline',
  'toolsDraftSystemId',
  'toolsDraftDirty',
  'toolsDraftDirtyToolIds',
  'toolsDraftSaving',
  'toolsDraftSaveError',
  'toolsDraftSelectedToolId',
  'toolsDraftExpandedToolId',
];

/** The draft half of the published object, which is what an out-of-band patch owns. */
function draftPatch(state) {
  return Object.fromEntries(DRAFT_KEYS.map((key) => [key, state[key]]));
}

function hammer(overrides = {}) {
  return {
    id: 't1',
    name: 'Hammer',
    componentId: 'c1',
    enabled: true,
    breakage: { mode: 'limitedUses', maxUses: 3 },
    onBreak: { mode: 'destroy' },
    ...overrides,
  };
}

function twoSystems(toolsForSecond = []) {
  return [
    makeCorpusSystem({ tools: [hammer()] }),
    makeCorpusSystem({
      id: 'sys2',
      name: 'System Two',
      features: { gathering: false },
      tools: toolsForSecond,
    }),
  ];
}

describe('adminStore tool draft section corpus', () => {
  it('a created draft that is patched back to its own values falls clean again', async () => {
    const harness = await createSectionHarness({ systems: twoSystems() });
    try {
      const before = harness.state();
      harness.resetPublishes();
      const created = harness.store.createToolDraft({ name: 'Awl' });
      assert.equal(harness.publishes(), 1, 'a create is one out-of-band publish');
      const afterCreate = harness.state();
      assertStatePatch(before, afterCreate, draftPatch(afterCreate));
      assert.equal(afterCreate.toolDraftSystemId, 'sys1');
      assert.equal(afterCreate.toolDraftDirty, true, 'a new draft has no baseline, so it is dirty');
      assert.equal(harness.store.isToolsDraftDirty(), true);

      harness.resetPublishes();
      assert.equal(harness.store.patchToolDraft({ name: created.name }), true);
      assert.equal(harness.publishes(), 1);
      assert.equal(harness.state().toolDraft.name, 'Awl');
      assert.equal(harness.state().toolDraftDirty, true, 'still dirty against a null baseline');

      assert.equal(harness.store.openToolDraft('t1'), true);
      assert.equal(harness.state().toolDraftDirty, false, 'an opened draft starts clean');
      assert.equal(harness.store.patchToolDraft({ name: 'Mallet' }), true);
      assert.equal(harness.store.isToolDraftDirty('t1'), true);
      assert.equal(harness.store.patchToolDraft({ name: 'Hammer' }), true);
      assert.equal(
        harness.store.isToolDraftDirty('t1'),
        false,
        'patching back to the baseline clears dirty rather than latching it'
      );
      assert.deepStrictEqual(harness.state().toolDraftValidation, { valid: true, errors: [] });
    } finally {
      harness.dispose();
    }
  });

  it('validation answers the same question in the singular and the plural shape', async () => {
    const harness = await createSectionHarness({ systems: twoSystems() });
    try {
      assert.deepStrictEqual(harness.store.validateToolDraft(), {
        valid: false,
        errors: ['missing'],
      });
      assert.deepStrictEqual(harness.store.validateToolsDraft(), {
        valid: false,
        errors: [{ id: '', errors: ['missing'] }],
      });
      harness.store.openToolDraft('t1');
      assert.deepStrictEqual(harness.store.validateToolDraft(), { valid: true, errors: [] });
      assert.deepStrictEqual(harness.store.validateToolsDraft(), { valid: true, errors: [] });
      assert.deepStrictEqual(harness.store.validateToolDraft('other'), {
        valid: false,
        errors: ['missing'],
      });
    } finally {
      harness.dispose();
    }
  });

  it('saveToolDraft writes the record and re-seeds from the union, not from the write result', async () => {
    const systems = twoSystems();
    const harness = await createSectionHarness({ systems });
    try {
      harness.store.openToolDraft('t1');
      harness.store.patchToolDraft({ name: 'Warhammer' });
      harness.drain();
      // The live record moves underneath the open draft, exactly as another client's GM edit does.
      systems[0].tools[0].description = 'changed underneath';

      assert.equal(await harness.store.saveToolDraft(), true);
      const entries = harness.drain();
      const [[systemId, record]] = seamCalls(entries, 'systemManager.upsertTool');
      assert.equal(systemId, 'sys1');
      assert.equal(record.name, 'Warhammer');
      assert.equal(harness.state().toolDraftDirty, false, 'a save leaves the draft clean');
      assert.equal(harness.state().toolDraft.name, 'Warhammer');
      assert.equal(harness.state().toolDraftSaveError, null);

      assert.equal(await harness.store.saveToolDraft(), true, 'a clean save is a reported no-op');
      assert.deepStrictEqual(
        seamCalls(harness.drain(), 'systemManager.upsertTool'),
        [],
        'and writes nothing'
      );
    } finally {
      harness.dispose();
    }
  });

  it('a repeated save converges, and only a staged source reaches the persist extras', async () => {
    const harness = await createSectionHarness({ systems: twoSystems() });
    try {
      harness.store.openToolDraft('t1');
      harness.store.patchToolDraft({ name: 'Warhammer' });
      harness.drain();
      await harness.store.saveToolDraft();
      const [[, , extras]] = seamCalls(harness.drain(), 'systemManager.upsertTool');
      assert.deepStrictEqual(extras, {}, 'an unstaged save carries no item uuid');

      harness.store.stageToolDraftSource('Item.abc');
      harness.drain();
      await harness.store.saveToolDraft();
      const [[, , staged]] = seamCalls(harness.drain(), 'systemManager.upsertTool');
      assert.deepStrictEqual(staged, { itemUuid: 'Item.abc' });

      harness.store.patchToolDraft({ name: 'Sledge' });
      harness.drain();
      await assertConvergent(
        harness,
        () => harness.store.saveToolDraft(),
        ['systemManager.upsertTool'],
        { repeat: 'silent' }
      );
    } finally {
      harness.dispose();
    }
  });

  it('an inheriting section is written from the live record rather than from the draft', async () => {
    const systems = twoSystems();
    const harness = await createSectionHarness({ systems });
    try {
      // `findMembership` reads the published corpus directly, so this is the whole seam the
      // section-aware save consults.
      harness.services.getToolScopeStore = () => ({
        corpus: () => ({
          entities: [],
          defaults: [],
          membership: [{ entityId: 't1', systemId: 'sys1', inherit: { breakage: true } }],
        }),
      });
      harness.store.openToolDraft('t1');
      harness.store.patchToolDraft({ breakage: { mode: 'unbreakable' }, name: 'Warhammer' });
      harness.drain();

      assert.equal(await harness.store.saveToolDraft(), true);
      const [[, record]] = seamCalls(harness.drain(), 'systemManager.upsertTool');
      assert.equal(record.name, 'Warhammer', 'an overriding section is written from the draft');
      assert.equal(
        record.breakage.mode,
        'limitedUses',
        'an inheriting section is restored from the live in-system record'
      );
    } finally {
      harness.dispose();
    }
  });

  it('a refused tool write reports the failure and notifies rather than throwing', async () => {
    const harness = await createSectionHarness({ systems: twoSystems(), refuseToolWrites: true });
    try {
      harness.store.openToolDraft('t1');
      harness.store.patchToolDraft({ name: 'Warhammer' });
      harness.drain();
      assert.equal(await harness.store.saveToolDraft(), false);
      const entries = harness.drain();
      assert.equal(harness.state().toolDraftSaveError, 'tool write refused');
      assert.equal(harness.state().toolDraftSaving, false);
      assert.equal(seamCalls(entries, 'notify.error').length, 1);
    } finally {
      harness.dispose();
    }
  });

  it('deleteToolFromDraft deletes the focused tool and re-focuses for another one', async () => {
    const systems = [
      makeCorpusSystem({ tools: [hammer(), hammer({ id: 't2', name: 'Awl' })] }),
      makeCorpusSystem({ id: 'sys2', name: 'System Two', features: { gathering: false } }),
    ];
    const harness = await createSectionHarness({ systems });
    try {
      harness.store.openToolDraft('t1');
      harness.drain();
      assert.equal(await harness.store.deleteToolFromDraft('t2'), true);
      assert.deepStrictEqual(seamCalls(harness.drain(), 'systemManager.deleteTool'), [
        ['sys1', 't2'],
      ]);
      assert.equal(harness.state().toolDraft, null, 'the delete closes the editor');

      harness.store.openToolDraft('t1');
      harness.drain();
      assert.equal(await harness.store.deleteToolFromDraft(), true);
      assert.deepStrictEqual(seamCalls(harness.drain(), 'systemManager.deleteTool'), [
        ['sys1', 't1'],
      ]);
      assert.equal(await harness.store.deleteToolFromDraft('ghost'), false);
    } finally {
      harness.dispose();
    }
  });

  it('two concurrent discard confirms share one prompt and one answer', async () => {
    const harness = await createSectionHarness({ systems: twoSystems() });
    try {
      assert.equal(
        await harness.store.confirmDiscardDirtyToolsDraft(),
        true,
        'a clean draft needs no prompt'
      );
      assert.deepStrictEqual(seamCalls(harness.drain(), 'confirmDialog'), []);

      harness.store.openToolDraft('t1');
      harness.store.patchToolDraft({ name: 'Warhammer' });
      harness.drain();
      const [first, second] = await Promise.all([
        harness.store.confirmDiscardDirtyToolsDraft(),
        harness.store.confirmDiscardDirtyToolsDraft(),
      ]);
      assert.equal(first, true);
      assert.equal(second, true);
      assert.equal(
        seamCalls(harness.drain(), 'confirmDialog').length,
        1,
        'the single-flight guard asks once for two concurrent callers'
      );
    } finally {
      harness.dispose();
    }
  });

  it('a defaulted systemId follows the selection rather than the one held at construction', async () => {
    const systems = twoSystems([hammer({ id: 't2', name: 'Chisel' })]);
    const harness = await createSectionHarness({ systems });
    try {
      assert.equal(harness.store.enterToolsDraft(), true);
      assert.equal(harness.state().toolsDraftSystemId, 'sys1');
      harness.drain();

      await harness.store.selectSystem('sys2');
      harness.drain();

      assert.equal(harness.store.enterToolsDraft(), true);
      assert.equal(harness.state().toolsDraftSystemId, 'sys2');
      assert.equal(harness.store.openToolDraft('t2'), true, 'the second system owns this tool');
      harness.drain();

      assert.equal(await harness.store.toggleToolEnabled('t2', false), true);
      assert.deepStrictEqual(
        seamCalls(harness.drain(), 'systemManager.upsertTool').map(([systemId]) => systemId),
        ['sys2'],
        'the write names the currently selected system'
      );

      assert.equal(await harness.store.removeToolFromSystem('t2'), true);
      assert.deepStrictEqual(seamCalls(harness.drain(), 'systemManager.deleteTool'), [
        ['sys2', 't2'],
      ]);
    } finally {
      harness.dispose();
    }
  });

  it('staging and unlinking an item source rewrite the draft source keys together', async () => {
    const harness = await createSectionHarness({ systems: twoSystems() });
    try {
      assert.equal(await harness.store.addToolFromUuidToDraft('Item.abc'), true);
      let state = harness.state();
      assert.equal(state.toolDraftSourceItemUuid, 'Item.abc');
      assert.equal(state.toolDraft.registeredItemUuid, 'Item.abc');
      assert.equal(state.toolDraft.originItemUuid, 'Item.abc');

      assert.equal(harness.store.unlinkToolDraftSource(), true);
      state = harness.state();
      assert.equal(state.toolDraftSourceItemUuid, '');
      assert.equal(state.toolDraft.registeredItemUuid, null);
      assert.equal(state.toolDraft.originItemUuid, null);

      assert.equal(harness.store.cancelToolsDraft(), true);
      assert.equal(harness.state().toolDraft, null);
      assert.equal(harness.state().toolsDraftSystemId, '');
      assert.equal(harness.store.stageToolDraftSource('Item.abc'), false, 'with no draft open');
    } finally {
      harness.dispose();
    }
  });

  it('discardToolDraft returns to the baseline, or cancels when there is none', async () => {
    const harness = await createSectionHarness({ systems: twoSystems() });
    try {
      harness.store.openToolDraft('t1');
      harness.store.patchToolDraft({ name: 'Warhammer' });
      assert.equal(harness.store.discardToolDraft(), true);
      assert.equal(harness.state().toolDraft.name, 'Hammer');
      assert.equal(harness.state().toolDraftDirty, false);

      harness.store.createToolDraft({ name: 'Awl' });
      assert.equal(harness.store.discardToolDraft(), true);
      assert.equal(harness.state().toolDraft, null, 'a never-persisted draft is cancelled instead');
    } finally {
      harness.dispose();
    }
  });
});
