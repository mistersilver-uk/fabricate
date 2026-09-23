/**
 * The bulk-actions sub-store (issue 1695): the click-ordered selection, the queued/blocked
 * partition, and the two runs over it. Collaborators are injected directly, so this suite asserts
 * the sub-store's own contract; the browse store's suite covers it through the composed store.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SvelteMap } from 'svelte/reactivity';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createSvelteModuleCompiler } from '../helpers/compile-svelte-module.js';
import { expectedMemberKinds, storeMemberKinds } from '../helpers/storeMemberKinds.js';

const MODULE_PATH = 'src/ui/svelte/stores/inventoryBulkActions.svelte.js';

/** A single-system listing row: its top-level identity IS its one participation. */
function listingRow(componentId, name, salvage = { enabled: true, mode: 'simple', toolsAvailable: true, results: [] }) {
  return {
    key: `sys:${componentId}`,
    name,
    img: null,
    componentId,
    systemId: 'sys',
    totalQuantity: 3,
    sources: [{ actorId: 'a1', actorName: 'Akra', quantity: 3 }],
    salvage: salvage && { targetActorId: 'a1', ...salvage },
  };
}

let compiler;
let createBulkActions;

/** One sub-store plus the seam log, over a reactive row source the reload can replace. */
function setup({ rows = [], inspectedKey = null, flush = { ok: true }, results = {} } = {}) {
  const log = [];
  const bag = new SvelteMap([['rows', rows]]);
  const bulk = createBulkActions({
    rows: () => bag.get('rows') ?? [],
    inspectedKey: () => inspectedKey,
    selectedSystemId: () => null,
    primaryParticipation: (row) => row?.systems?.[0] ?? null,
    salvageOrderId: (participation) =>
      participation?.systemId && participation.componentId
        ? `${participation.systemId}:${participation.componentId}`
        : null,
    orders: () => ({}),
    flushOrder: async () => {
      log.push(['flushOrder']);
      return flush;
    },
    orderAnnouncement: () => 'Could not save your order.',
    clearRibbon: () => log.push(['clearRibbon']),
    reload: async (quiet) => log.push(['reload', quiet]),
    services: {
      salvageComponents: async (options) => {
        log.push(['salvageComponents', options.targets]);
        options.onProgress?.(1);
        // A caller-held gate, so a test can observe the sub-store MID-RUN; without it the whole
        // run resolves inside one microtask turn and `busy` is never observably true.
        if (results.salvageGate) await results.salvageGate;
        if (results.salvageThrows) throw new Error('the engine blew up');
        return results.salvage ?? { cancelled: false, items: [{ outcome: 'succeeded' }] };
      },
      destroyComponents: async (options) => {
        log.push(['destroyComponents', options.targets]);
        return results.destroy ?? { items: [{ outcome: 'destroyed' }], unitsDeleted: 3 };
      },
      confirmDialog: async (prompt) => {
        log.push(['confirmDialog', prompt]);
        return results.confirmed ?? true;
      },
      createProgressReporter: () => {
        const reporter = (update) => log.push(['progress', update]);
        reporter.dismiss = () => log.push(['dismiss']);
        return reporter;
      },
    },
  });
  return { bulk, log, bag };
}

describe('createBulkActions', () => {
  before(async () => {
    compiler = createSvelteModuleCompiler('fabricate-bulk-actions-');
    // The sub-store's real import graph, walked rather than restated.
    ({ createBulkActions } = await compiler.loadWithClosure(MODULE_PATH));
  });

  after(() => {
    compiler.cleanup();
  });

  it('returns exactly the members the browse store delegates to, each still the same kind', () => {
    const { bulk } = setup();
    assert.deepEqual(
      storeMemberKinds(bulk),
      expectedMemberKinds({
        getters: [
          'bulkActive',
          'bulkBlocked',
          'bulkCounts',
          'bulkDestroying',
          'bulkEntries',
          'bulkProgress',
          'bulkReport',
          'bulkRunning',
          'bulkSalvageable',
          'bulkSelectedKeys',
          'bulkSelectedRows',
          'bulkYieldPreview',
          'busy',
        ],
        methods: [
          'bulkDestroy',
          'bulkSalvage',
          'clearBulkSelection',
          'removeFromBulkSelection',
          'toggleBulkSelection',
        ],
      })
    );
  });

  it('selects in CLICK order, promoting the inspected card on the first toggle', () => {
    const { bulk } = setup({
      rows: [listingRow('c1', 'Iron'), listingRow('c2', 'Bronze')],
      inspectedKey: 'sys:c1',
    });
    bulk.toggleBulkSelection('sys:c2');
    flushSync();

    assert.deepEqual(bulk.bulkSelectedKeys, ['sys:c1', 'sys:c2']);
    assert.equal(bulk.bulkActive, true);
  });

  it('releases the single-item ribbon when a selection ENTERS bulk', () => {
    const { bulk, log } = setup({ rows: [listingRow('c1', 'Iron')] });
    bulk.toggleBulkSelection('sys:c1');
    flushSync();

    assert.deepEqual(log, [['clearRibbon']]);
  });

  it('ANNOUNCES the cap on the click that reaches it, then refuses the next', () => {
    const rows = Array.from({ length: 30 }, (unused, index) =>
      listingRow(`c${index}`, `Item ${index}`)
    );
    const { bulk } = setup({ rows });
    for (let index = 0; index < 25; index += 1) bulk.toggleBulkSelection(`sys:c${index}`);
    flushSync();

    assert.equal(bulk.bulkCounts.atMax, true, 'stated before a screen reader hits the wall');
    assert.deepEqual(bulk.toggleBulkSelection('sys:c25'), { refused: true, reason: 'bulkLimit' });
    flushSync();
    assert.equal(bulk.bulkSelectedKeys.length, 25);
  });

  it('partitions the selection by blocked reason, name-sorted within each half', () => {
    const { bulk } = setup({
      rows: [
        listingRow('c2', 'Bronze'),
        listingRow('c1', 'Iron'),
        listingRow('c3', 'Ash', null),
        listingRow('c4', 'Dust', { enabled: true, mode: 'simple', toolsAvailable: false, toolStates: [{ name: 'Hammer', available: false }] }),
      ],
    });
    for (const key of ['sys:c2', 'sys:c1', 'sys:c3', 'sys:c4']) bulk.toggleBulkSelection(key);
    flushSync();

    assert.deepEqual(
      bulk.bulkSalvageable.map((entry) => entry.name),
      ['Bronze', 'Iron']
    );
    assert.deepEqual(
      bulk.bulkBlocked.map((entry) => [entry.name, entry.blockedReason, entry.missingTools]),
      [
        ['Ash', 'salvageDisabled', []],
        ['Dust', 'toolsUnavailable', ['Hammer']],
      ]
    );
    assert.deepEqual(bulk.bulkCounts, { selected: 4, salvageable: 2, blocked: 2, atMax: false });
  });

  it('runs the name-sorted queue, reports it, and reloads once on the way out', async () => {
    const { bulk, log } = setup({ rows: [listingRow('c1', 'Iron')] });
    bulk.toggleBulkSelection('sys:c1');
    flushSync();

    const outcome = await bulk.bulkSalvage();
    flushSync();

    assert.deepEqual(outcome, { cancelled: false, items: [{ outcome: 'succeeded' }] });
    assert.deepEqual(log.map(([name]) => name), [
      'clearRibbon',
      'flushOrder',
      'salvageComponents',
      'progress',
      'progress',
      'dismiss',
      'reload',
    ]);
    assert.equal(bulk.bulkReport.mode, 'salvage');
    assert.deepEqual(bulk.bulkReport.items[0], {
      key: 'sys:c1',
      name: 'Iron',
      img: null,
      outcome: 'succeeded',
    });
    assert.equal(bulk.bulkRunning, false, 'and the busy flag is discharged');
  });

  it('ABORTS the run before anything starts when the order flush rejects', async () => {
    const { bulk, log } = setup({ rows: [listingRow('c1', 'Iron')], flush: { ok: false } });
    bulk.toggleBulkSelection('sys:c1');
    flushSync();

    assert.deepEqual(await bulk.bulkSalvage(), {
      cancelled: true,
      message: 'Could not save your order.',
    });
    assert.deepEqual(
      log.map(([name]) => name),
      ['clearRibbon', 'flushOrder'],
      'no run, no toast, no reload'
    );
  });

  it('discharges the whole exit obligation on a THROWN run', async () => {
    const { bulk, log } = setup({
      rows: [listingRow('c1', 'Iron')],
      results: { salvageThrows: true },
    });
    bulk.toggleBulkSelection('sys:c1');
    flushSync();

    const outcome = await bulk.bulkSalvage();
    flushSync();

    assert.deepEqual(outcome, { cancelled: false, items: [], error: 'the engine blew up' });
    assert.equal(bulk.bulkReport.error, 'the engine blew up');
    assert.equal(bulk.bulkRunning, false);
    assert.equal(bulk.busy, false, 'so the listing is not left deaf to document changes');
    assert.deepEqual(log.at(-1), ['reload', true]);
  });

  it('destroys BLOCKED rows too, and only after the confirmation is agreed', async () => {
    const { bulk, log } = setup({ rows: [listingRow('c1', 'Iron'), listingRow('c3', 'Ash', null)] });
    bulk.toggleBulkSelection('sys:c1');
    bulk.toggleBulkSelection('sys:c3');
    flushSync();

    const outcome = await bulk.bulkDestroy({ content: 'Destroy 2 stacks?' });
    flushSync();

    assert.equal(outcome.confirmed, true);
    assert.equal(outcome.unitsDeleted, 3);
    assert.deepEqual(log[2], ['confirmDialog', { content: 'Destroy 2 stacks?' }]);
    assert.deepEqual(
      log[3][1].map((target) => target.componentId),
      ['c1', 'c3'],
      'destroy is not gated on salvageability'
    );
    assert.equal(bulk.bulkReport.mode, 'destroy');
  });

  it('destroys nothing when the confirmation is declined', async () => {
    const { bulk, log } = setup({
      rows: [listingRow('c1', 'Iron')],
      results: { confirmed: false },
    });
    bulk.toggleBulkSelection('sys:c1');
    flushSync();

    assert.deepEqual(await bulk.bulkDestroy({}), { confirmed: false });
    assert.equal(
      log.some(([name]) => name === 'destroyComponents'),
      false
    );
  });

  it('drops a standing report on every selection mutation', async () => {
    const { bulk } = setup({ rows: [listingRow('c1', 'Iron'), listingRow('c2', 'Bronze')] });
    bulk.toggleBulkSelection('sys:c1');
    flushSync();
    await bulk.bulkSalvage();
    flushSync();
    assert.ok(bulk.bulkReport, 'the fixture produced a report');

    bulk.clearBulkSelection();
    flushSync();

    assert.ok(!bulk.bulkReport, 'a report never stands for a selection it no longer describes');
    assert.deepEqual(bulk.bulkSelectedKeys, []);
  });

  it('filters a stale key the reload dropped rather than surfacing it', async () => {
    const { bulk, bag } = setup({ rows: [listingRow('c1', 'Iron'), listingRow('c2', 'Bronze')] });
    bulk.toggleBulkSelection('sys:c1');
    bulk.toggleBulkSelection('sys:c2');
    flushSync();

    bag.set('rows', [listingRow('c2', 'Bronze')]);
    flushSync();

    assert.deepEqual(
      bulk.bulkSelectedRows.map((row) => row.key),
      ['sys:c2']
    );
  });

  it('aggregates the best-case yield across the QUEUE only', () => {
    const yielding = (componentId, name, results) =>
      listingRow(componentId, name, { enabled: true, mode: 'simple', toolsAvailable: true, results });
    const { bulk } = setup({
      rows: [
        yielding('c1', 'Iron', [{ componentId: 'x', name: 'Shard', quantity: 2 }]),
        yielding('c2', 'Bronze', [{ componentId: 'x', name: 'Shard', quantity: 1 }]),
        listingRow('c3', 'Ash', null),
        // Same-named, distinct components stay two rows: `yieldKeyOf` keys on identity.
        yielding('c4', 'Cedar', [{ componentId: 'y', name: 'Dust', quantity: 1 }]),
        yielding('c5', 'Elm', [{ componentId: 'z', name: 'Dust', quantity: 1 }]),
      ],
    });
    for (const id of ['c1', 'c2', 'c3', 'c4', 'c5']) bulk.toggleBulkSelection(`sys:${id}`);
    flushSync();

    assert.deepEqual(
      bulk.bulkYieldPreview.map((row) => [
        row.componentId,
        row.name,
        row.quantity,
        row.guaranteedQuantity,
      ]),
      [
        ['y', 'Dust', 1, 1],
        ['z', 'Dust', 1, 1],
        ['x', 'Shard', 3, 3],
      ]
    );
  });

  it('refuses a second run while one is in flight, on the ONE busy question', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const { bulk } = setup({ rows: [listingRow('c1', 'Iron')], results: { salvageGate: gate } });
    bulk.toggleBulkSelection('sys:c1');
    flushSync();

    const running = bulk.bulkSalvage();
    for (let attempt = 0; attempt < 10 && !bulk.busy; attempt += 1) await Promise.resolve();
    assert.equal(bulk.busy, true, 'the run is observably in flight');

    assert.deepEqual(await bulk.bulkDestroy({}), { confirmed: false });
    assert.deepEqual(await bulk.bulkSalvage(), { cancelled: true });

    release();
    await running;
    flushSync();
    assert.equal(bulk.busy, false);
  });

  it('does nothing at all when the queue is empty', async () => {
    const { bulk, log } = setup({ rows: [listingRow('c3', 'Ash', null)] });
    bulk.toggleBulkSelection('sys:c3');
    flushSync();

    assert.deepEqual(await bulk.bulkSalvage(), { cancelled: true, items: [] });
    assert.equal(
      log.some(([name]) => name === 'salvageComponents'),
      false
    );
  });
});
