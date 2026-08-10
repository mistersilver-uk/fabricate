/**
 * `BulkDestroyService` — permanently deletes the selected components' WHOLE STACKS on
 * one actor (issue 859).
 *
 * Two hazards drive most of this file, and both are core behaviours rather than
 * Fabricate ones:
 *
 * 1. `deleteEmbeddedDocuments` is ALL-OR-NOTHING on a stale id.
 *    `#preDeleteDocumentArray` resolves every id with `collection.get(id, {strict:true})`,
 *    which THROWS on the first one it cannot find — so one id that went away between the
 *    panel snapshot and the confirm click deletes NOTHING, not even the twenty valid ids
 *    beside it.
 * 2. A `preDeleteItem` hook returning `false` drops INDIVIDUAL ids silently while the
 *    rest of the batch deletes, so a count taken from the REQUEST would tell the player
 *    it destroyed something still in their pack.
 *
 * Stale and vetoed are therefore two different stories, tracked separately, and this
 * suite pins the distinction rather than only the totals.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  BULK_DESTROY_SKIP_REASONS,
  BulkDestroyService,
} from '../src/systems/BulkDestroyService.js';
import {
  bulkComponent,
  bulkSystem,
  craftingSystemLookup,
  deleteCapableActor,
  ownedItem,
} from './helpers/bulkSalvageFixtures.js';

const ORE = bulkComponent({ id: 'comp-ore', name: 'Iron Ore', img: 'icons/ore.webp' });
const HIDE = bulkComponent({ id: 'comp-hide', name: 'Boar Hide', img: 'icons/hide.webp' });

/** Build a service over one system, with the two document seams supplied by the test. */
function makeService({
  systems = [bulkSystem({ components: [ORE, HIDE] })],
  findComponentItems,
  deleteItems,
}) {
  return new BulkDestroyService({
    getCraftingSystem: craftingSystemLookup(systems),
    findComponentItems,
    deleteItems,
  });
}

/** One destroy target carrying an ALREADY-RESOLVED actor — the facade owns resolution. */
function destroyTarget(actor, { systemId = 'sys-a', componentId = 'comp-ore' } = {}) {
  return { actor, actorId: actor?.id ?? null, actorName: actor?.name ?? '', systemId, componentId };
}

describe('BulkDestroyService.run: whole stacks, read through the configured accessor', () => {
  it('captures each document name, image and STACK SIZE before deleting', async () => {
    // The stack-quantity path is GM-configurable, so the capture goes through
    // `readStackQuantity` and never a hardcoded `system.quantity`
    // (`tests/quantity-literal-gate.test.js` pins the spelling; this pins the answer).
    const items = [ownedItem('i1', 'Iron Ore', 7), ownedItem('i2', 'Iron Ore', 5)];
    const { actor, deleteItems, deleteCalls } = deleteCapableActor({ items });
    const service = makeService({ findComponentItems: () => items, deleteItems });

    const result = await service.run({ targets: [destroyTarget(actor)] });

    assert.equal(result.items[0].requested, 12, 'the whole stack of every document');
    assert.equal(result.unitsDeleted, 12, 'and every unit went');
    assert.equal(result.documentsDeleted, 2);
    assert.deepEqual(deleteCalls, [{ actorId: 'a1', itemIds: ['i1', 'i2'] }]);
    assert.deepEqual(result.items[0].items, [
      { name: 'Iron Ore', img: 'icons/ore.webp', quantity: 7 },
      { name: 'Iron Ore', img: 'icons/ore.webp', quantity: 5 },
    ]);
  });

  it('never reads salvage.ingredientQuantity — destroy has no analogue for it', async () => {
    // Salvage's one-unit-at-a-time rule comes from a GM-authored ingredient quantity.
    // Destroy takes the stack; the gesture carries no quantity control at all.
    const component = bulkComponent({ id: 'comp-ore', name: 'Iron Ore', ingredientQuantity: 1 });
    const items = [ownedItem('i1', 'Iron Ore', 9)];
    const { actor, deleteItems } = deleteCapableActor({ items });
    const service = makeService({
      systems: [bulkSystem({ components: [component] })],
      findComponentItems: () => items,
      deleteItems,
    });

    const result = await service.run({ targets: [destroyTarget(actor)] });

    assert.equal(result.unitsDeleted, 9, 'nine, not the authored one');
  });

  it('reports the captured identity even after the document is gone', async () => {
    const items = [ownedItem('i1', 'Iron Ore', 3)];
    const { actor, deleteItems } = deleteCapableActor({ items });
    const service = makeService({ findComponentItems: () => items, deleteItems });

    const result = await service.run({ targets: [destroyTarget(actor)] });

    assert.equal(result.items[0].name, 'Iron Ore');
    assert.equal(result.items[0].img, 'icons/ore.webp');
    assert.equal(result.items[0].outcome, 'succeeded');
  });
});

describe('BulkDestroyService.run: stale ids are filtered BEFORE the call', () => {
  it('submits only the ids the live collection still holds', async () => {
    // A stale id is expected rather than exotic: `InventoryView` reloads on world-time,
    // scene and source changes while the confirm dialog stands.
    const captured = [ownedItem('i1', 'Iron Ore', 4), ownedItem('i2', 'Iron Ore', 6)];
    // The actor holds only `i1` — `i2` went away since the panel snapshot.
    const { actor, deleteItems, deleteCalls } = deleteCapableActor({ items: [captured[0]] });
    const service = makeService({ findComponentItems: () => captured, deleteItems });

    const result = await service.run({ targets: [destroyTarget(actor)] });

    assert.deepEqual(deleteCalls, [{ actorId: 'a1', itemIds: ['i1'] }], 'the stale id is not sent');
    assert.equal(result.unitsDeleted, 4, 'a stale id does not zero the run');
    assert.equal(result.documentsDeleted, 1);
    assert.equal(result.items[0].staleIds, 1, 'and it is reported as stale');
    assert.deepEqual(result.items[0].vetoed, [], 'NOT as a veto — nothing ever asked for it');
  });

  it('a stale id does not zero the run even when it is the FIRST one', async () => {
    // The core lookup throws on the first id it cannot find, so "first" is the position
    // that would have destroyed the whole batch.
    const captured = [ownedItem('gone', 'Iron Ore', 2), ownedItem('i2', 'Iron Ore', 6)];
    const { actor, deleteItems } = deleteCapableActor({ items: [captured[1]] });
    const service = makeService({ findComponentItems: () => captured, deleteItems });

    const result = await service.run({ targets: [destroyTarget(actor)] });

    assert.equal(result.unitsDeleted, 6);
    assert.equal(result.items[0].staleIds, 1);
  });

  it('submits everything when the actor exposes NO live collection lookup', async () => {
    // A defence must not be able to cause the failure it defends against: filtering
    // against an absent `items.has` would drop every id and zero a run that would
    // otherwise have succeeded.
    const items = [ownedItem('i1', 'Iron Ore', 3)];
    const { actor, deleteItems, deleteCalls } = deleteCapableActor({
      items,
      liveCollection: false,
    });
    const service = makeService({ findComponentItems: () => items, deleteItems });

    const result = await service.run({ targets: [destroyTarget(actor)] });

    assert.deepEqual(deleteCalls, [{ actorId: 'a1', itemIds: ['i1'] }]);
    assert.equal(result.unitsDeleted, 3);
    assert.equal(result.items[0].staleIds, 0);
  });

  it('never calls delete at all when every captured id is stale', async () => {
    const captured = [ownedItem('gone', 'Iron Ore', 2)];
    const { actor, deleteItems, deleteCalls } = deleteCapableActor({ items: [] });
    const service = makeService({ findComponentItems: () => captured, deleteItems });

    const result = await service.run({ targets: [destroyTarget(actor)] });

    assert.deepEqual(deleteCalls, []);
    assert.equal(result.items[0].staleIds, 1);
    assert.equal(result.items[0].outcome, 'failed', 'nothing was destroyed');
  });
});

describe('BulkDestroyService.run: the per-item fallback', () => {
  it('retries one document at a time when the batch throws, and keeps going', async (t) => {
    // A per-item retry re-enters the same strict lookup one id at a time, so exactly the
    // problem id fails and every valid one still goes.
    const original = console.error;
    console.error = () => {};
    t.after(() => {
      console.error = original;
    });

    const items = [
      ownedItem('i1', 'Iron Ore', 2),
      ownedItem('bad', 'Iron Ore', 5),
      ownedItem('i3', 'Iron Ore', 3),
    ];
    const attempts = [];
    const deleteItems = async (actor, itemIds) => {
      attempts.push([...itemIds]);
      if (itemIds.length > 1) throw new Error('one of these is gone');
      if (itemIds[0] === 'bad') throw new Error('still gone');
      return items.filter((item) => itemIds.includes(item.id));
    };
    const { actor } = deleteCapableActor({ items });
    const service = makeService({ findComponentItems: () => items, deleteItems });

    const result = await service.run({ targets: [destroyTarget(actor)] });

    assert.deepEqual(attempts, [['i1', 'bad', 'i3'], ['i1'], ['bad'], ['i3']]);
    assert.equal(result.unitsDeleted, 5, 'the two good documents still went (2 + 3)');
    assert.equal(result.documentsDeleted, 2);
    assert.deepEqual(
      result.items[0].vetoed.map((entry) => entry.quantity),
      [5],
      'the one that could not be deleted is reported, not counted'
    );
  });
});

describe('BulkDestroyService.run: unitsDeleted comes from what the delete RETURNED', () => {
  it('reports a preDeleteItem veto rather than counting it as destroyed', async () => {
    // The veto is silent: the batch succeeds, the vetoed id simply is not in the return.
    // Counting the REQUEST would tell the player their Boar Hide was destroyed while it
    // is still in their pack.
    const items = [ownedItem('i1', 'Iron Ore', 4), ownedItem('i2', 'Iron Ore', 6)];
    const { actor } = deleteCapableActor({ items });
    const service = makeService({
      findComponentItems: () => items,
      // A hook vetoed `i2`, so only `i1` comes back.
      deleteItems: async () => [items[0]],
    });

    const result = await service.run({ targets: [destroyTarget(actor)] });

    assert.equal(result.items[0].requested, 10, 'ten units were asked for');
    assert.equal(result.unitsDeleted, 4, 'four actually went');
    assert.equal(result.documentsDeleted, 1);
    assert.deepEqual(result.items[0].vetoed, [
      { name: 'Iron Ore', img: 'icons/ore.webp', quantity: 6 },
    ]);
    assert.equal(result.items[0].staleIds, 0, 'a veto is NOT a stale id');
  });

  it('keeps vetoed and stale apart in ONE row that has both', async () => {
    // The single most confusable pair. A stale id was never submitted — nothing to tell
    // the player beyond "the panel was out of date". A vetoed id WAS submitted and
    // refused, so that row is still in their pack and is the one they need to see.
    const captured = [
      ownedItem('i1', 'Iron Ore', 4),
      ownedItem('vetoed', 'Iron Ore', 6),
      ownedItem('stale', 'Iron Ore', 9),
    ];
    const { actor } = deleteCapableActor({ items: [captured[0], captured[1]] });
    const submitted = [];
    const service = makeService({
      findComponentItems: () => captured,
      deleteItems: async (actorArg, itemIds) => {
        submitted.push([...itemIds]);
        // A hook vetoed `vetoed`, so only `i1` comes back.
        return [captured[0]];
      },
    });

    const result = await service.run({ targets: [destroyTarget(actor)] });

    assert.deepEqual(submitted, [['i1', 'vetoed']], 'the stale id was never submitted');
    assert.equal(result.items[0].staleIds, 1, 'exactly the never-submitted one');
    assert.deepEqual(
      result.items[0].vetoed.map((entry) => entry.quantity),
      [6],
      'exactly the submitted-and-refused one — never the stale id as well'
    );
    assert.equal(result.unitsDeleted, 4);
  });

  it('accepts bare id strings as well as documents from the delete seam', async () => {
    // Reading `undefined` out of the wrong shape would silently report every row as
    // vetoed — a whole run reported as refused while every document really went.
    const items = [ownedItem('i1', 'Iron Ore', 4)];
    const { actor } = deleteCapableActor({ items });
    const service = makeService({
      findComponentItems: () => items,
      deleteItems: async () => ['i1'],
    });

    const result = await service.run({ targets: [destroyTarget(actor)] });

    assert.equal(result.unitsDeleted, 4);
    assert.deepEqual(result.items[0].vetoed, []);
  });

  it('accepts the `_id` spelling a raw source object carries', async () => {
    const items = [ownedItem('i1', 'Iron Ore', 4)];
    const { actor } = deleteCapableActor({ items });
    const service = makeService({
      findComponentItems: () => items,
      deleteItems: async () => [{ _id: 'i1' }],
    });

    const result = await service.run({ targets: [destroyTarget(actor)] });

    assert.equal(result.unitsDeleted, 4);
  });
});

describe('BulkDestroyService.run: what it does NOT gate on', () => {
  it('destroys a row whose component has salvage DISABLED', async () => {
    // Deliberate: a player can already delete their own owned Items from the Foundry
    // sheet, so this adds ergonomics rather than capability — and a blocked-for-salvage
    // row is often exactly the row they want gone.
    const component = bulkComponent({ id: 'comp-ore', name: 'Iron Ore', salvageEnabled: false });
    const items = [ownedItem('i1', 'Iron Ore', 4)];
    const { actor, deleteItems } = deleteCapableActor({ items });
    const service = makeService({
      systems: [bulkSystem({ components: [component] })],
      findComponentItems: () => items,
      deleteItems,
    });

    const result = await service.run({ targets: [destroyTarget(actor)] });

    assert.equal(result.unitsDeleted, 4);
    assert.equal(result.items[0].outcome, 'succeeded');
  });

  it('destroys a row in a system whose salvage FEATURE is off', async () => {
    const items = [ownedItem('i1', 'Iron Ore', 4)];
    const { actor, deleteItems } = deleteCapableActor({ items });
    const service = makeService({
      systems: [bulkSystem({ salvage: false, components: [ORE] })],
      findComponentItems: () => items,
      deleteItems,
    });

    const result = await service.run({ targets: [destroyTarget(actor)] });

    assert.equal(result.unitsDeleted, 4);
  });

  it('posts no chat message — it produced nothing to report', async () => {
    // Structural: the service takes no `postChatMessage` seam at all, so there is no
    // wiring a future edit could quietly complete.
    const service = new BulkDestroyService({});
    assert.equal('postChatMessage' in service, false);
    // An explicit comparator: an uncompared `Array#sort()` is a SonarCloud finding, and
    // on a list of names it is genuinely wrong.
    assert.deepEqual(
      Object.keys(service).sort((left, right) => left.localeCompare(right)),
      ['deleteItems', 'findComponentItems', 'getCraftingSystem']
    );
  });
});

describe('BulkDestroyService.run: the refusals', () => {
  const CASES = [
    {
      reason: BULK_DESTROY_SKIP_REASONS.unknownSystem,
      target: { systemId: 'sys-nope', componentId: 'comp-ore' },
    },
    {
      reason: BULK_DESTROY_SKIP_REASONS.unknownComponent,
      target: { systemId: 'sys-a', componentId: 'comp-nope' },
    },
  ];

  for (const testCase of CASES) {
    it(`classifies ${testCase.reason} without resolving any document`, async () => {
      let resolved = 0;
      const { actor, deleteItems, deleteCalls } = deleteCapableActor({ items: [] });
      const service = makeService({
        findComponentItems: () => {
          resolved += 1;
          return [];
        },
        deleteItems,
      });

      const result = await service.run({ targets: [destroyTarget(actor, testCase.target)] });

      assert.equal(resolved, 0, 'the matcher was never reached');
      assert.deepEqual(deleteCalls, []);
      assert.equal(result.items[0].outcome, 'skipped');
      assert.equal(result.items[0].skipReason, testCase.reason);
    });
  }

  it('classifies `depleted` when the actor holds none of the component', async () => {
    const { actor, deleteItems, deleteCalls } = deleteCapableActor({ items: [] });
    const service = makeService({ findComponentItems: () => [], deleteItems });

    const result = await service.run({ targets: [destroyTarget(actor)] });

    assert.deepEqual(deleteCalls, [], 'nothing to delete, so nothing is submitted');
    assert.equal(result.items[0].skipReason, BULK_DESTROY_SKIP_REASONS.depleted);
    assert.equal(result.items[0].name, 'Iron Ore', 'and the row still names what it stood for');
  });
});

describe('BulkDestroyService.run: target-actor scoping', () => {
  it('resolves each row against ITS OWN target actor', async () => {
    // A listing row's `sources` may span actors, but the panel resolves ONE target actor
    // per row and `findComponentItems` takes one actor — so the counts reported are the
    // target actor's units, matching what the confirmation named.
    const akraItems = [ownedItem('i1', 'Iron Ore', 4)];
    const brenItems = [ownedItem('i2', 'Boar Hide', 2)];
    const akra = deleteCapableActor({ id: 'a1', items: akraItems });
    const bren = deleteCapableActor({ id: 'a2', items: brenItems });
    const matcherCalls = [];
    const service = makeService({
      findComponentItems: (actor, component) => {
        matcherCalls.push([actor.id, component.id]);
        return actor.id === 'a1' ? akraItems : brenItems;
      },
      deleteItems: async (actor, itemIds) =>
        (actor.id === 'a1' ? akraItems : brenItems).filter((item) => itemIds.includes(item.id)),
    });

    const result = await service.run({
      targets: [
        destroyTarget(akra.actor, { componentId: 'comp-ore' }),
        destroyTarget(bren.actor, { componentId: 'comp-hide' }),
      ],
    });

    assert.deepEqual(matcherCalls, [
      ['a1', 'comp-ore'],
      ['a2', 'comp-hide'],
    ]);
    assert.deepEqual(
      result.items.map((item) => item.actorId),
      ['a1', 'a2']
    );
    assert.deepEqual(
      result.items.map((item) => item.unitsDeleted),
      [4, 2]
    );
    assert.equal(result.unitsDeleted, 6, 'the run total sums the per-actor rows');
  });

  it('hands the matcher the resolved component AND system, not ids', async () => {
    // Destroy must resolve documents through the IDENTICAL matcher salvage uses,
    // including its case-SENSITIVE name fallback — a destroy matching more broadly than
    // salvage would delete things the player was shown as a different component.
    const system = bulkSystem({ components: [ORE] });
    let received = null;
    const { actor, deleteItems } = deleteCapableActor({ items: [] });
    const service = makeService({
      systems: [system],
      findComponentItems: (actorArg, component, systemArg) => {
        received = { actorArg, component, systemArg };
        return [];
      },
      deleteItems,
    });

    await service.run({ targets: [destroyTarget(actor)] });

    assert.equal(received.actorArg, actor, 'the resolved actor document');
    assert.equal(received.component, ORE, 'the resolved component, by identity');
    assert.equal(received.systemArg, system, 'and its system');
  });

  it('is sequential, so row k+1 sees what row k deleted', async () => {
    // Two rows can resolve to the same owned document — the same reason bulk salvage is
    // sequential.
    const shared = ownedItem('i1', 'Iron Ore', 4);
    const { actor, deleteItems, held } = deleteCapableActor({ items: [shared] });
    const service = makeService({
      findComponentItems: () => [...held.values()],
      deleteItems,
    });

    const result = await service.run({
      targets: [destroyTarget(actor), destroyTarget(actor)],
    });

    assert.equal(result.items[0].unitsDeleted, 4);
    assert.equal(
      result.items[1].skipReason,
      BULK_DESTROY_SKIP_REASONS.depleted,
      'the second row finds nothing left rather than double-counting'
    );
    assert.equal(result.unitsDeleted, 4, 'and the run total is not doubled');
  });
});

describe('BulkDestroyService.run: progress over an IRREVERSIBLE queue', () => {
  it('ticks once per target, in order, a REFUSED row included', async () => {
    // Every target ticks, a refusal included: `_destroyOne` resolves each one, and the
    // panel is marking the rows the player CONFIRMED. A counter that skipped the refused
    // row would mark the wrong rows done and stop at `1 of 2` for a queue that finished.
    const items = [ownedItem('i1', 'Iron Ore', 4)];
    const { actor, deleteItems } = deleteCapableActor({ items });
    const service = makeService({ findComponentItems: () => items, deleteItems });
    const ticks = [];

    const result = await service.run({
      targets: [
        destroyTarget(actor, { componentId: 'comp-nope' }),
        destroyTarget(actor, { componentId: 'comp-ore' }),
      ],
      onProgress: (completed, total) => ticks.push([completed, total]),
    });

    assert.deepEqual(ticks, [
      [1, 2],
      [2, 2],
    ]);
    assert.equal(result.items[0].skipReason, BULK_DESTROY_SKIP_REASONS.unknownComponent);
    assert.equal(result.unitsDeleted, 4, 'and the row after the refusal still ran');
  });

  it('a THROWING listener never abandons a half-destroyed queue', async (t) => {
    // Destroy is IRREVERSIBLE, and the loop is already mid-flight when the first tick
    // fires, so a consumer's broken callback must never cost the rest of the queue — that
    // would leave the player with a half-destroyed selection and a report that no longer
    // describes their pack. EVERY tick throws, because the guard has to hold per call
    // rather than once.
    const original = console.error;
    const logged = [];
    console.error = (...args) => logged.push(args.map(String).join(' '));
    t.after(() => {
      console.error = original;
    });

    /** The same two-component queue, run with whatever listener the test supplies. */
    const runBoth = async (onProgress) => {
      const items = [ownedItem('i1', 'Iron Ore', 4), ownedItem('i2', 'Boar Hide', 6)];
      const { actor, deleteItems, deleteCalls } = deleteCapableActor({ items });
      const service = makeService({
        findComponentItems: (actorArg, component) =>
          items.filter((item) => item.name === component.name),
        deleteItems,
      });
      const result = await service.run({
        targets: [
          destroyTarget(actor, { componentId: 'comp-ore' }),
          destroyTarget(actor, { componentId: 'comp-hide' }),
        ],
        onProgress,
      });
      return { result, deleteCalls };
    };

    const control = await runBoth(undefined);
    const observed = await runBoth(() => {
      throw new Error('the panel went away');
    });

    assert.deepEqual(observed.deleteCalls, control.deleteCalls, 'both stacks were still submitted');
    assert.equal(observed.result.unitsDeleted, 10, 'and both really went (4 + 6)');
    assert.equal(observed.result.documentsDeleted, 2);
    assert.deepEqual(observed.result.items, control.result.items, 'the report is unchanged');
    assert.ok(
      logged.some((line) => line.includes('progress listener threw')),
      'the throw is reported to the console rather than swallowed'
    );
  });
});
