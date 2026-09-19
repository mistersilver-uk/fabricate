/**
 * The salvage-execution sub-store (issue 1695): the busy key, the ribbon, and the row held under it.
 * Its collaborators arrive as thunks, so this suite injects them directly rather than loading a
 * listing — the browse store's own suite covers the composed behaviour.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SvelteMap } from 'svelte/reactivity';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createSvelteModuleCompiler } from '../helpers/compile-svelte-module.js';
import { expectedMemberKinds, storeMemberKinds } from '../helpers/storeMemberKinds.js';

const MODULE_PATH = 'src/ui/svelte/stores/inventorySalvageExecution.svelte.js';

const PARTICIPATION = {
  systemId: 'sys',
  componentId: 'c1',
  salvage: { enabled: true, targetActorId: 'a1' },
  ownedQuantity: 1,
};

/** The inspected card, single-system: its top-level identity IS its participation. */
function card(overrides = {}) {
  return {
    key: 'sys:c1',
    name: 'Iron Ore',
    systemId: 'sys',
    componentId: 'c1',
    totalQuantity: 1,
    salvage: PARTICIPATION.salvage,
    ...overrides,
  };
}

let compiler;
let createSalvageExecution;

/**
 * One sub-store plus the seam log. `liveRows` is what the listing answers AFTER the reload, so a
 * depleted card is simply absent from it.
 */
function setup({
  item = card(),
  participation = PARTICIPATION,
  liveRows = [],
  result = { success: true, message: 'done', results: [{ name: 'Shard', img: null }], value: 7 },
  flush = { ok: true },
} = {}) {
  const log = [];
  // Reactive, because `firedComplications` must be invalidated by the participation changing
  // exactly as it is by a store's own `$derived` selection.
  const bag = new SvelteMap([['participation', participation]]);
  const execution = createSalvageExecution({
    selectedItem: () => item,
    selectedParticipation: () => bag.get('participation') ?? null,
    rows: () => liveRows,
    holdSelection: (key) => log.push(['holdSelection', key]),
    flushOrder: async () => {
      log.push(['flushOrder']);
      return flush;
    },
    orderAnnouncement: () => 'Could not save your order.',
    reload: async (quiet) => log.push(['reload', quiet]),
    services: {
      salvageComponent: async (options) => {
        log.push(['salvageComponent', options]);
        return typeof result === 'function' ? result() : result;
      },
      notify: (message) => log.push(['notify', message]),
    },
  });
  return { execution, log, bag };
}

describe('createSalvageExecution', () => {
  before(async () => {
    compiler = createSvelteModuleCompiler('fabricate-salvage-execution-');
    // The sub-store's real import graph, walked rather than restated.
    ({ createSalvageExecution } = await compiler.loadWithClosure(MODULE_PATH));
  });

  after(() => {
    compiler.cleanup();
  });

  it('returns exactly the members the browse store delegates to, each still the same kind', () => {
    const { execution } = setup();
    assert.deepEqual(
      storeMemberKinds(execution),
      expectedMemberKinds({
        getters: ['firedComplications', 'heldItem', 'salvageResult', 'salvagingKey'],
        methods: ['clearRibbon', 'resetSalvage', 'salvage'],
      })
    );
  });

  it('settles the pending order write BEFORE it asks the facade to salvage anything', async () => {
    const { execution, log } = setup();
    await execution.salvage('sys', 'c1');
    flushSync();

    assert.deepEqual(
      log.map(([name]) => name),
      ['flushOrder', 'salvageComponent', 'holdSelection', 'reload']
    );
    assert.equal(log[1][1].actorId, 'a1', 'decision 8: the acting participation OWNS the documents');
  });

  it('ABORTS on a rejected order flush, consuming nothing and reporting the revert', async () => {
    const { execution, log } = setup({ flush: { ok: false } });
    const outcome = await execution.salvage('sys', 'c1');

    assert.deepEqual(outcome, { success: false, message: 'Could not save your order.' });
    assert.deepEqual(
      log.map(([name]) => name),
      ['flushOrder'],
      'no salvage, no reload'
    );
    assert.equal(execution.salvagingKey, null, 'and the busy key is released');
  });

  it('holds the salvaged row and RECONCILES it to zero when its last copy is gone', async () => {
    const { execution, log } = setup({ liveRows: [] });
    await execution.salvage('sys', 'c1');
    flushSync();

    assert.deepEqual(log.at(-2), ['holdSelection', 'sys:c1']);
    assert.equal(execution.heldItem.totalQuantity, 0, 'the depleted card reads None remaining');
    assert.equal(execution.salvageResult.state, 'success');
    assert.deepEqual(execution.salvageResult.awarded, [{ name: 'Shard', img: null }]);
    assert.equal(execution.salvageResult.rollValue, 7);
  });

  it('prefers the FRESH live row when copies remain, rather than the pre-roll snapshot', async () => {
    const live = card({ totalQuantity: 2 });
    const { execution } = setup({ liveRows: [live] });
    await execution.salvage('sys', 'c1');
    flushSync();

    assert.deepEqual(
      { ...execution.heldItem },
      live,
      'the reloaded row is authoritative — its live count, not the pre-roll one'
    );
  });

  it('scopes a depletion to the ACTING participation of a multi-system card', async () => {
    const item = {
      key: 'sys:c1',
      name: 'Iron Ore',
      totalQuantity: 4,
      systems: [
        { systemId: 'sys', componentId: 'c1', ownedQuantity: 1, salvage: PARTICIPATION.salvage },
        { systemId: 'other', componentId: 'c2', ownedQuantity: 3, salvage: null },
      ],
    };
    const { execution } = setup({ item, liveRows: [] });
    await execution.salvage('sys', 'c1');
    flushSync();

    assert.deepEqual(
      execution.heldItem.systems.map((entry) => entry.ownedQuantity),
      [0, 3],
      'only the participation that was broken down is depleted'
    );
  });

  it('refuses ids that name nothing on the inspected card, and never calls the facade', async () => {
    const { execution, log } = setup();
    assert.deepEqual(await execution.salvage('sys', 'nope'), { success: false });
    assert.deepEqual(await execution.salvage('', 'c1'), { success: false });
    assert.deepEqual(log, []);
  });

  it('resetSalvage() releases the held row AND the ribbon', async () => {
    const { execution } = setup();
    await execution.salvage('sys', 'c1');
    flushSync();
    assert.ok(execution.heldItem, 'the fixture held a row');

    execution.resetSalvage();
    flushSync();

    assert.ok(!execution.heldItem, 'the held row is released');
    assert.ok(!execution.salvageResult, 'and the ribbon with it');
  });

  it('clearRibbon() is that same release, under the name the browse store calls', async () => {
    const { execution } = setup();
    await execution.salvage('sys', 'c1');
    flushSync();

    execution.clearRibbon();
    flushSync();

    assert.ok(!execution.heldItem);
    assert.ok(!execution.salvageResult);
  });

  it('records a time-gated run as WAITING, with no ribbon to dismiss', async () => {
    const { execution, log } = setup({ result: { waiting: true, message: 'not yet' } });
    await execution.salvage('sys', 'c1');
    flushSync();

    assert.deepEqual(execution.salvageResult, {
      systemId: 'sys',
      componentId: 'c1',
      state: 'waiting',
      message: 'not yet',
    });
    assert.ok(!execution.heldItem, 'nothing is held: no copy was consumed');
    assert.deepEqual(log.at(-1), ['reload', true]);
  });

  it('surfaces a failed salvage through notify and holds no ribbon', async () => {
    const { execution, log } = setup({ result: { success: false, message: 'no tools' } });
    await execution.salvage('sys', 'c1');
    flushSync();

    assert.ok(!execution.salvageResult);
    assert.deepEqual(log.at(-1), ['notify', 'no tools']);
  });

  it('returns a cancelled prompt to the pre-roll state, calling NO notify', async () => {
    const { execution, log } = setup({ result: { cancelled: true } });
    await execution.salvage('sys', 'c1');
    flushSync();

    assert.ok(!execution.salvageResult);
    assert.equal(
      log.some(([name]) => name === 'notify'),
      false,
      'the player dismissed the prompt; a toast would be a lie'
    );
  });

  it('publishes the fired record ONLY while the ribbon belongs to the inspected participation', async () => {
    const fired = [{ resultId: 'r1', componentId: 'x', complicationId: 'x1', buckets: ['full'] }];
    const { execution, bag } = setup({
      result: { success: true, results: [], salvageRun: { firedComplications: fired } },
    });
    await execution.salvage('sys', 'c1');
    flushSync();
    assert.deepEqual(execution.firedComplications, fired);

    // The held row released while the result still stands: the strip must not badge another
    // component's stages.
    bag.set('participation', { systemId: 'other', componentId: 'c2' });
    flushSync();
    const empty = execution.firedComplications;
    assert.deepEqual(empty, []);

    execution.resetSalvage();
    flushSync();
    assert.equal(execution.firedComplications, empty, 'and every un-fired state is the SAME []');
  });
});
