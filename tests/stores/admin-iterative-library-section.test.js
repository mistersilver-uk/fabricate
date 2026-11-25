/** The iterative library section: every write is one `updateSystem(id, { iterative })` and a refresh. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { writable } from 'svelte/store';

import { createIterativeLibrarySection } from '../../src/ui/svelte/stores/adminIterativeLibrarySection.js';

const LIBRARY = Object.freeze({
  version: 1,
  counters: [
    { id: 'iron', label: 'Iron', limit: 'global', min: 0, max: 9 },
    { id: 'heat', label: 'Heat', limit: 'none' },
  ],
  actions: [
    {
      id: 'stoke',
      label: 'Stoke',
      categories: [],
      usesSession: true,
      availability: { combine: 'all', rules: [] },
      costs: [],
      check: 'none',
      effects: [],
    },
  ],
});

function harness({ iterative = LIBRARY, systemId = 'sys', fail = null } = {}) {
  const calls = { updates: [], refreshes: 0, notices: [], prompts: [] };
  const system = { id: 'sys', ...(iterative && { iterative: structuredClone(iterative) }) };
  const services = {
    notify: { error: (message) => calls.notices.push(message) },
    getCraftingSystemManager: () => ({
      getSystem: (id) => (id === system.id ? system : null),
      updateSystem: async (id, patch) => {
        if (fail) throw fail;
        calls.updates.push([id, patch]);
        Object.assign(system, structuredClone(patch));
      },
    }),
  };
  const section = createIterativeLibrarySection({
    services,
    selectedSystemId: writable(systemId),
    refresh: async () => {
      calls.refreshes += 1;
    },
    confirmDiscardDirty: (key, fallback) => {
      calls.prompts.push([key, fallback]);
      return 'discard';
    },
  });
  return { section, calls, system };
}

const lastWrite = (calls) => calls.updates.at(-1)[1].iterative;

describe('the iterative library section: Counters', () => {
  it('adds a Counter under its placeholder name and answers the id minted from it', async () => {
    const { section, calls } = harness();
    assert.equal(await section.addCounter(), 'newCounter');
    assert.equal(await section.addCounter(), 'newCounter2');
    assert.equal(calls.updates.length, 2);
    assert.equal(calls.refreshes, 2);
    assert.deepEqual(lastWrite(calls).counters.slice(2), [
      { id: 'newCounter', label: 'New counter', limit: 'none' },
      { id: 'newCounter2', label: 'New counter 2', limit: 'none' },
    ]);
    assert.equal(calls.updates[0][0], 'sys');
  });

  it('starts an empty library from an absent block', async () => {
    const { section, calls } = harness({ iterative: null });
    assert.equal(await section.addCounter(), 'newCounter');
    assert.equal(lastWrite(calls).version, 1);
    assert.deepEqual(lastWrite(calls).actions, []);
  });

  it('writes a patch once, trims the name and drops an unset key', async () => {
    const { section, calls } = harness();
    assert.equal(await section.updateCounter('iron', { label: ' Iron ore ', max: null }), true);
    assert.equal(calls.updates.length, 1);
    assert.deepEqual(lastWrite(calls).counters[0], {
      id: 'iron',
      label: 'Iron ore',
      limit: 'global',
      min: 0,
    });
    assert.equal(
      await section.updateCounter('iron', { description: 'Mined', limit: 'perRecipe' }),
      true
    );
    assert.equal(lastWrite(calls).counters[0].description, 'Mined');
  });

  it('writes a change of case to the counter own name', async () => {
    const { section, calls } = harness();
    assert.equal(await section.updateCounter('iron', { label: 'IRON' }), true);
    assert.equal(calls.updates.length, 1);
    assert.equal(lastWrite(calls).counters[0].label, 'IRON');
  });

  it('refuses an empty name and another counter name without writing', async () => {
    const { section, calls } = harness();
    assert.equal(await section.updateCounter('heat', { label: ' iron ' }), false);
    assert.equal(await section.updateCounter('heat', { label: '' }), false);
    assert.equal(await section.updateCounter('missing', { label: 'x' }), false);
    assert.equal(calls.updates.length, 0);
    assert.equal(calls.refreshes, 0);
  });

  it('keeps the stored bounds when the limit is switched off', async () => {
    const { section, calls } = harness();
    await section.updateCounter('iron', { limit: 'none' });
    assert.deepEqual(lastWrite(calls).counters[0], {
      id: 'iron',
      label: 'Iron',
      limit: 'none',
      min: 0,
      max: 9,
    });
  });

  it('reorders by index, and refuses a move that goes nowhere', async () => {
    const { section, calls } = harness();
    assert.equal(await section.reorderCounters(0, 1), true);
    assert.deepEqual(
      lastWrite(calls).counters.map((counter) => counter.id),
      ['heat', 'iron']
    );
    assert.equal(await section.reorderCounters(1, 1), false);
    assert.equal(await section.reorderCounters(0, 5), false);
    assert.equal(calls.updates.length, 1);
  });

  it('deletes a Counter and rewrites nothing that names it', async () => {
    const { section, calls } = harness();
    assert.equal(await section.deleteCounter('iron'), true);
    assert.deepEqual(
      lastWrite(calls).counters.map((counter) => counter.id),
      ['heat']
    );
    assert.deepEqual(lastWrite(calls).actions, LIBRARY.actions);
    assert.equal(await section.deleteCounter('iron'), false);
  });
});

describe('the iterative library section: Crafting Actions', () => {
  it('stages a blank draft that has no id until it is saved', () => {
    const { section } = harness();
    assert.deepEqual(section.newActionDraft(), {
      id: '',
      label: '',
      categories: [],
      usesSession: true,
      availability: { combine: 'all', rules: [] },
      costs: [],
      check: 'none',
      effects: [],
    });
  });

  it('mints a new action id from its label when it is first saved', async () => {
    const { section, calls } = harness();
    const draft = (label) => ({ ...section.newActionDraft(), label });
    assert.equal(await section.saveAction(draft(' Quench ')), 'quench');
    assert.equal(await section.saveAction(draft('Stoke')), 'stoke2');
    assert.equal(await section.saveAction(draft('')), 'action');
    assert.deepEqual(
      lastWrite(calls).actions.map((action) => [action.id, action.label]),
      [
        ['stoke', 'Stoke'],
        ['quench', 'Quench'],
        ['stoke2', 'Stoke'],
        ['action', ''],
      ]
    );
  });

  it('replaces a saved action in place and keeps its id when the label changes', async () => {
    const { section, calls } = harness();
    const draft = { ...structuredClone(LIBRARY.actions[0]), label: 'Fire up' };
    assert.equal(await section.saveAction(draft), 'stoke');
    assert.deepEqual(
      lastWrite(calls).actions.map((action) => [action.id, action.label]),
      [['stoke', 'Fire up']]
    );
  });

  it('copies an action under a new id and answers it', async () => {
    const { section, calls } = harness();
    assert.equal(await section.duplicateAction('stoke'), 'stokeCopy');
    assert.deepEqual(
      lastWrite(calls).actions.map((action) => [action.id, action.label]),
      [
        ['stoke', 'Stoke'],
        ['stokeCopy', 'Stoke copy'],
      ]
    );
    assert.equal(await section.duplicateAction('missing'), false);
  });

  it('deletes an action, answering whether it did', async () => {
    const { section, calls } = harness();
    assert.equal(await section.deleteAction('stoke'), true);
    assert.deepEqual(lastWrite(calls).actions, []);
    assert.equal(await section.deleteAction('stoke'), false);
  });

  it('asks the shared unsaved-changes prompt for a dirty action draft', () => {
    const { section, calls } = harness();
    assert.equal(section.confirmDiscardDirtyActionDraft(), 'discard');
    assert.equal(calls.prompts[0][0], 'FABRICATE.Admin.Manager.Iterative.DiscardDirtyContent');
  });
});

describe('the iterative library section: refusals', () => {
  it('writes nothing while the library was made by a newer version', async () => {
    const { section, calls } = harness({ iterative: { version: 2, counters: [], actions: [] } });
    assert.equal(await section.addCounter(), false);
    assert.equal(await section.updateCounter('iron', { label: 'x' }), false);
    assert.equal(await section.reorderCounters(0, 1), false);
    assert.equal(await section.deleteCounter('iron'), false);
    assert.equal(await section.saveAction(section.newActionDraft()), false);
    assert.equal(await section.duplicateAction('stoke'), false);
    assert.equal(await section.deleteAction('stoke'), false);
    assert.equal(calls.updates.length, 0);
    assert.equal(calls.refreshes, 0);
  });

  it('writes nothing with no system selected', async () => {
    const { section, calls } = harness({ systemId: '' });
    assert.equal(await section.addCounter(), false);
    assert.equal(calls.updates.length, 0);
  });

  it('reports a failed write and answers false without refreshing', async () => {
    const { section, calls } = harness({ fail: new Error('disk full') });
    assert.equal(await section.addCounter(), false);
    assert.deepEqual(calls.notices, ['disk full']);
    assert.equal(calls.refreshes, 0);
  });
});
