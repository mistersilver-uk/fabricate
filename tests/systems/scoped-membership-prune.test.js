/** The system-side membership prune: its plan, its one write, and its failure answer. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  planMembershipPrune,
  removeScopedMemberships,
} from '../../src/systems/scopedMembershipPrune.js';
import {
  createComponentScopeStore,
  createToolScopeStore,
} from '../../src/systems/worldScopeStores.js';

const record = (entityId, systemId, extra = {}) => ({ entityId, systemId, inherit: {}, ...extra });

/** A settings double over one key, counting writes and optionally refusing them. */
function settings(initial, { refuse = false } = {}) {
  const state = { value: structuredClone(initial), writes: 0 };
  return {
    state,
    getSetting: () => structuredClone(state.value),
    setSetting: async (_key, value) => {
      state.writes += 1;
      if (refuse) throw new Error('setting refused');
      state.value = structuredClone(value);
    },
  };
}

function payloadOf(records) {
  return {
    entities: [],
    defaults: {},
    membership: Object.fromEntries(records.map((r) => [`${r.entityId}|${r.systemId}`, r])),
  };
}

describe('planMembershipPrune', () => {
  const payload = payloadOf([record('c1', 'sysA'), record('c2', 'sysA'), record('c1', 'sysB')]);

  it('plans nothing for a blank systemId or an empty entityIds', () => {
    assert.deepEqual(planMembershipPrune(payload, { systemId: '  ' }), []);
    assert.deepEqual(planMembershipPrune(payload, { systemId: 'sysA', entityIds: [] }), []);
    assert.deepEqual(planMembershipPrune(payload, { systemId: 'sysA', entityIds: [' '] }), []);
    assert.deepEqual(planMembershipPrune(null, { systemId: 'sysA' }), []);
  });

  it('matches trimmed record and option ids, and only the named system', () => {
    const padded = { membership: { k: record(' c1 ', ' sysA '), j: record('c1', 'sysB') } };
    assert.deepEqual(planMembershipPrune(padded, { systemId: ' sysA', entityIds: ['c1 '] }), ['k']);
    assert.deepEqual(planMembershipPrune(payload, { systemId: 'sysA' }), ['c1|sysA', 'c2|sysA']);
    assert.deepEqual(planMembershipPrune(payload, { systemId: 'sysA', entityIds: ['c2'] }), [
      'c2|sysA',
    ]);
  });
});

describe('removeScopedMemberships', () => {
  it('answers 0 for a missing store', async () => {
    assert.deepEqual(await removeScopedMemberships(null, { systemId: 'sysA' }), { count: 0 });
  });

  it('prunes 50 ids in one save, leaving every other record as it was read', async () => {
    const ids = Array.from({ length: 50 }, (_, index) => `c${index}`);
    const kept = [record('c0', 'sysB'), record('keep', 'sysA', { mutedTags: ['bulk'] })];
    const io = settings(payloadOf([...ids.map((id) => record(id, 'sysA')), ...kept]));
    const store = createComponentScopeStore(io);
    const before = store.get();

    assert.deepEqual(await removeScopedMemberships(store, { systemId: 'sysA', entityIds: ids }), {
      count: 50,
    });
    assert.equal(io.state.writes, 1, 'one write for the whole set');
    const after = store.get();
    assert.deepEqual(Object.keys(after.membership), ['c0|sysB', 'keep|sysA']);
    for (const [key, kept] of Object.entries(after.membership)) {
      assert.deepEqual(kept, before.membership[key], `${key} is unchanged`);
    }
    assert.deepEqual(after.entities, before.entities);
    assert.deepEqual(after.defaults, before.defaults);
  });

  it('writes nothing when no id has a membership', async () => {
    const io = settings(payloadOf([record('c1', 'sysB')]));
    const store = createComponentScopeStore(io);
    const outcome = await removeScopedMemberships(store, { systemId: 'sysA', entityIds: ['c1'] });
    assert.deepEqual(outcome, { count: 0 });
    assert.equal(io.state.writes, 0);
  });

  it('reloads the store and answers 0 when the save is refused', async () => {
    const io = settings(payloadOf([record('c1', 'sysA')]), { refuse: true });
    const store = createComponentScopeStore(io);
    const outcome = await removeScopedMemberships(store, { systemId: 'sysA' });
    assert.equal(outcome.count, 0);
    assert.match(outcome.error.message, /setting refused/);
    assert.deepEqual(
      store.listMemberships().map((r) => r.entityId),
      ['c1'],
      'the client corpus matches the setting, which still holds the record'
    );
  });

  it('keeps the tool scope world tool-breakage authority', async () => {
    const io = settings({
      ...payloadOf([record('t1', 'sysA'), record('t1', 'sysB')]),
      toolBreakage: { authority: 'checkDriven' },
    });
    const store = createToolScopeStore(io);
    assert.deepEqual(await removeScopedMemberships(store, { systemId: 'sysA' }), { count: 1 });
    assert.deepEqual(io.state.value.toolBreakage, { authority: 'checkDriven' });
    assert.deepEqual(Object.keys(io.state.value.membership), ['t1|sysB']);
  });
});
