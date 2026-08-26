/**
 * The two POOLED ALLOCATION policies, and the proof that crafting still runs on one of
 * them (issue 1342, phase 1).
 *
 * `src/systems/pooledAllocation.js` names two rules that were emergent before it:
 *
 * - **pooled order** — caller's actor order, then each actor's own item order. It is a
 *   policy rather than a detail because the drain is first-fit, so the order decides
 *   which documents are destroyed.
 * - **first-fit drain** — take `Math.min(available, remaining)` from each candidate in
 *   order, stop at the first item that is not needed.
 *
 * ## The equivalence pin is the point of this file
 *
 * `CraftingEngine._consumeComponentItems` is a salvage consume: it deletes and decrements
 * real inventory. The extraction is only allowed to be invisible, so the last describe
 * block below pins it two ways, because either alone can be fooled:
 *
 * - **behaviourally**, against an ORACLE — a literal transcription of the loop as it
 *   stood before the extraction — over a matrix of stack shapes, comparing the returned
 *   consumption records AND the exact ordered write log (delete vs update, and the update
 *   payload) document by document. This is what goes red if the call is ALTERED.
 * - **structurally**, on the method's own source text. A behavioural pin alone cannot see
 *   the call being REMOVED, because re-inlining the loop is by definition still
 *   equivalent — and an inlined copy is exactly the drift the extraction exists to
 *   prevent, since the pooled companion consume must drain the same way this does.
 *
 * Both arms were mutation-proved: re-inlining the legacy loop fails the structural arm,
 * and perturbing the call's arguments fails the behavioural arm.
 *
 * ## Fixture note
 *
 * Capacity is read with `readStackQuantity`, whose contract is "a present item is at
 * least one": an absent, unreadable or stored-`0` stack reads as `1`. The cases below
 * assert that directly, because it is the difference between decrementing a stack and
 * DELETING the document.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { getByPath, setByPath } from '../../src/utils/objectPath.js';

globalThis.foundry = {
  utils: {
    getProperty: getByPath,
    setProperty: setByPath,
    deepClone: (value) => JSON.parse(JSON.stringify(value ?? null)),
    randomID: () => 'id-pooled-allocation',
  },
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.game = { user: { id: 'gm', isGM: true }, actors: [], time: { worldTime: 0 } };

const { planFirstFitDrain, pooledItemOrder } = await import(
  '../../src/systems/pooledAllocation.js'
);
const { readStackQuantity, updateStackQuantity } = await import(
  '../../src/systems/itemStackQuantity.js'
);
const { CraftingEngine } = await import('../../src/systems/CraftingEngine.js');

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * An owned-item fake that records every write against it, in order.
 *
 * @param {string} id Item id, used as the write-log identity.
 * @param {number|undefined} quantity Stored stack quantity; `undefined` authors no field.
 * @param {object|null} parent The owning actor-like document.
 * @returns {object} The item fake.
 */
function itemFake(id, quantity, parent = null) {
  const log = [];
  return {
    id,
    parent,
    system: quantity === undefined ? {} : { quantity },
    writes: log,
    async delete() {
      log.push({ id, op: 'delete' });
      return this;
    },
    async update(payload) {
      log.push({ id, op: 'update', payload });
      return this;
    },
  };
}

/**
 * @param {string} id Actor id.
 * @param {Array<object>} items The item fakes this actor owns.
 * @returns {object} An actor-like owner whose items are the given fakes.
 */
function actorFake(id, items) {
  const actor = { id, items };
  for (const item of items) item.parent = actor;
  return actor;
}

/**
 * @param {Array<object>} items The item fakes to read.
 * @returns {Array<object>} Every recorded write, in the order the items were touched.
 */
function writeLog(items) {
  return items.flatMap((item) => item.writes);
}

describe('pooled order', () => {
  it('is the caller actor order, then each actor own item order', () => {
    const alice = actorFake('alice', [itemFake('a1', 1), itemFake('a2', 1), itemFake('a3', 1)]);
    const bob = actorFake('bob', [itemFake('b1', 1), itemFake('b2', 1)]);

    assert.deepEqual(
      pooledItemOrder([alice, bob]).map((item) => item.id),
      ['a1', 'a2', 'a3', 'b1', 'b2']
    );
  });

  it('reorders with the caller and sorts nothing of its own', () => {
    const alice = actorFake('alice', [itemFake('a1', 1), itemFake('a2', 1)]);
    const bob = actorFake('bob', [itemFake('b1', 1)]);

    assert.deepEqual(
      pooledItemOrder([bob, alice]).map((item) => item.id),
      ['b1', 'a1', 'a2']
    );
  });

  it('materialises each actor collection rather than returning it', () => {
    const items = [itemFake('s1', 1), itemFake('s2', 1)];
    const actor = { id: 'set-owner', items: new Set(items) };

    const pooled = pooledItemOrder([actor]);

    assert.ok(Array.isArray(pooled), 'the pooled candidates are a plain array');
    assert.deepEqual(
      pooled.map((item) => item.id),
      ['s1', 's2']
    );
  });

  it('skips an actor with no items and a nullish entry, and answers empty for a non-array', () => {
    const alice = actorFake('alice', [itemFake('a1', 1)]);

    assert.deepEqual(
      pooledItemOrder([null, { id: 'empty' }, alice, undefined]).map((item) => item.id),
      ['a1']
    );
    assert.deepEqual(pooledItemOrder(null), []);
    assert.deepEqual(pooledItemOrder(undefined), []);
  });

  it('is what _resolveCraftSelection pools its candidates with', () => {
    const alice = actorFake('alice', [itemFake('a1', 1), itemFake('a2', 1)]);
    const bob = actorFake('bob', [itemFake('b1', 1)]);
    const engine = new CraftingEngine({ ingredientMatchesItem: () => false });
    let offered = null;

    const resolved = engine._resolveCraftSelection(
      [bob, alice],
      {
        matchIngredients: (availableItems) => {
          offered = availableItems;
          return [];
        },
      },
      { id: 'recipe' },
      alice
    );

    assert.equal(resolved.success, true);
    assert.deepEqual(
      offered.map((item) => item.id),
      ['b1', 'a1', 'a2'],
      'the candidate list is the pooled order over the actors as the caller supplied them'
    );
  });
});

describe('first-fit drain', () => {
  it('takes a partial bite out of a stack that covers the whole requirement', () => {
    const item = itemFake('hide', 20);

    const plan = planFirstFitDrain([item], 3);

    assert.deepEqual(plan.takes, [
      {
        item,
        parent: null,
        available: 20,
        quantity: 3,
        remainingQuantity: 17,
        exhausted: false,
      },
    ]);
    assert.equal(plan.satisfied, true);
    assert.equal(plan.allocated, 3);
    assert.equal(plan.shortfall, 0);
  });

  it('exhausts a stack the requirement matches exactly', () => {
    const item = itemFake('hide', 3);

    const [take] = planFirstFitDrain([item], 3).takes;

    assert.equal(take.quantity, 3);
    assert.equal(take.remainingQuantity, 0);
    assert.equal(take.exhausted, true, 'an exact take is a delete, not a decrement');
  });

  it('drains stacks in order and leaves the last one partial', () => {
    const items = [itemFake('i1', 2), itemFake('i2', 4), itemFake('i3', 9)];

    const plan = planFirstFitDrain(items, 7);

    assert.deepEqual(
      plan.takes.map((take) => [take.item.id, take.quantity, take.exhausted]),
      [
        ['i1', 2, true],
        ['i2', 4, true],
        ['i3', 1, false],
      ]
    );
    assert.equal(plan.allocated, 7);
    assert.equal(plan.satisfied, true);
  });

  it('stops at the first item it does not need', () => {
    const items = [itemFake('i1', 5), itemFake('i2', 5), itemFake('i3', 5)];

    const plan = planFirstFitDrain(items, 5);

    assert.deepEqual(
      plan.takes.map((take) => take.item.id),
      ['i1'],
      'first-fit never reads past the point the requirement is met'
    );
  });

  it('reports a shortfall and takes everything when the pool is short', () => {
    const items = [itemFake('i1', 2), itemFake('i2', 1)];

    const plan = planFirstFitDrain(items, 10);

    assert.equal(plan.allocated, 3);
    assert.equal(plan.requested, 10);
    assert.equal(plan.shortfall, 7);
    assert.equal(plan.satisfied, false);
    assert.ok(
      plan.takes.every((take) => take.exhausted),
      'a short pool is drained dry'
    );
  });

  it('takes nothing for a requirement of zero or less, and nothing from an empty pool', () => {
    const item = itemFake('hide', 5);

    for (const quantity of [0, -1]) {
      const plan = planFirstFitDrain([item], quantity);
      assert.deepEqual(plan.takes, [], `requirement ${quantity} takes nothing`);
      assert.equal(plan.satisfied, true);
    }
    assert.deepEqual(planFirstFitDrain([], 4).takes, []);
    assert.deepEqual(planFirstFitDrain(null, 4).takes, []);
  });

  it('reads a stored 0 and an absent field as one, matching readStackQuantity', () => {
    const stored = itemFake('stored-zero', 0);
    const absent = itemFake('no-field', undefined);

    assert.equal(readStackQuantity(stored), 1, 'the capacity reader is the coercing one');

    const plan = planFirstFitDrain([stored, absent], 2);

    assert.deepEqual(
      plan.takes.map((take) => [take.item.id, take.available, take.quantity, take.exhausted]),
      [
        ['stored-zero', 1, 1, true],
        ['no-field', 1, 1, true],
      ]
    );
  });
});

describe('parent grouping', () => {
  it('buckets takes by owning parent in first-encounter order', () => {
    const alice = actorFake('alice', [itemFake('a1', 2), itemFake('a2', 2)]);
    const bob = actorFake('bob', [itemFake('b1', 2)]);

    const plan = planFirstFitDrain([alice.items[0], bob.items[0], alice.items[1]], 6);

    assert.deepEqual(
      plan.groups.map((group) => [group.parent.id, group.takes.map((take) => take.item.id)]),
      [
        ['alice', ['a1', 'a2']],
        ['bob', ['b1']],
      ],
      'one group per parent, parents in the order the drain first met them'
    );
  });

  it('splits each group into the deletes and the decrements a batched write needs', () => {
    const alice = actorFake('alice', [itemFake('a1', 2), itemFake('a2', 9)]);
    const bob = actorFake('bob', [itemFake('b1', 4)]);

    const plan = planFirstFitDrain([alice.items[0], bob.items[0], alice.items[1]], 8);
    const [aliceGroup, bobGroup] = plan.groups;

    assert.deepEqual(
      aliceGroup.deletions.map((take) => take.item.id),
      ['a1']
    );
    assert.deepEqual(
      aliceGroup.reductions.map((take) => [take.item.id, take.remainingQuantity]),
      [['a2', 7]]
    );
    assert.deepEqual(
      bobGroup.deletions.map((take) => take.item.id),
      ['b1']
    );
    assert.deepEqual(bobGroup.reductions, []);
  });

  it('carries the same takes as the flat list, in the same order within a parent', () => {
    const alice = actorFake('alice', [itemFake('a1', 1), itemFake('a2', 1)]);
    const bob = actorFake('bob', [itemFake('b1', 1), itemFake('b2', 1)]);
    const pooled = pooledItemOrder([alice, bob]);

    const plan = planFirstFitDrain(pooled, 4);

    assert.deepEqual(
      plan.groups.flatMap((group) => group.takes),
      plan.takes,
      'the grouping is a view of the drain, never a second allocation'
    );
  });

  it('groups parentless items together under a null parent', () => {
    const plan = planFirstFitDrain([itemFake('loose1', 1), itemFake('loose2', 1)], 2);

    assert.equal(plan.groups.length, 1);
    assert.equal(plan.groups[0].parent, null);
    assert.equal(plan.groups[0].takes.length, 2);
  });
});

describe('_consumeComponentItems equivalence', () => {
  /**
   * The consume loop EXACTLY as it stood before the extraction, transcribed. Nothing here
   * may import `pooledAllocation`: it is the independent answer the engine is compared to.
   *
   * @param {object} actor Unused, as in the original.
   * @param {Array<object>} items The candidate items.
   * @param {number} quantity The total to consume.
   * @returns {Promise<Array<{item: object, quantity: number}>>} The consumption records.
   */
  async function legacyConsumeComponentItems(actor, items, quantity) {
    const consumed = [];
    let remaining = quantity;

    for (const item of items) {
      if (remaining <= 0) break;
      const available = readStackQuantity(item);
      const toConsume = Math.min(available, remaining);
      consumed.push({ item, quantity: toConsume });
      remaining -= toConsume;
      await (toConsume >= available
        ? item.delete()
        : updateStackQuantity(item, available - toConsume));
    }

    return consumed;
  }

  const CASES = [
    { name: 'a single partial bite', stacks: [20], quantity: 1 },
    { name: 'an exact single stack', stacks: [3], quantity: 3 },
    { name: 'an over-full first stack', stacks: [9, 4], quantity: 2 },
    { name: 'two whole stacks then a partial', stacks: [2, 4, 9], quantity: 7 },
    { name: 'every stack exactly', stacks: [2, 3], quantity: 5 },
    { name: 'more than the pool holds', stacks: [2, 1], quantity: 10 },
    { name: 'a stored zero among real stacks', stacks: [0, 4], quantity: 3 },
    { name: 'an unreadable stack', stacks: [undefined, 2], quantity: 2 },
    { name: 'nothing asked for', stacks: [5], quantity: 0 },
    { name: 'an empty candidate list', stacks: [], quantity: 4 },
    { name: 'items owned by two different actors', stacks: [2, 2, 2], quantity: 5, split: 1 },
  ];

  for (const { name, stacks, quantity, split = stacks.length } of CASES) {
    it(`consumes identically to the pre-extraction loop: ${name}`, async () => {
      const build = () => {
        const items = stacks.map((stack, index) => itemFake(`i${index}`, stack));
        actorFake('alice', items.slice(0, split));
        actorFake('bob', items.slice(split));
        return items;
      };
      const engineItems = build();
      const oracleItems = build();

      const consumed = await new CraftingEngine({})._consumeComponentItems(
        engineItems[0]?.parent ?? { id: 'alice' },
        engineItems,
        quantity
      );
      const expected = await legacyConsumeComponentItems(
        oracleItems[0]?.parent ?? { id: 'alice' },
        oracleItems,
        quantity
      );

      assert.deepEqual(
        consumed.map((record) => [record.item.id, record.quantity]),
        expected.map((record) => [record.item.id, record.quantity]),
        'the returned consumption records match the pre-extraction loop'
      );
      assert.deepEqual(
        writeLog(engineItems),
        writeLog(oracleItems),
        'the ordered writes — delete vs update, and each update payload — match'
      );
    });
  }

  it('still ignores its unused actor parameter', async () => {
    const item = itemFake('hide', 4);
    const engine = new CraftingEngine({});

    const consumed = await engine._consumeComponentItems(undefined, [item], 1);

    assert.deepEqual(consumed, [{ item, quantity: 1 }]);
    assert.deepEqual(item.writes, [
      { id: 'hide', op: 'update', payload: { 'system.quantity': 3 } },
    ]);
  });

  it('delegates the allocation instead of carrying its own copy of the loop', () => {
    const source = readFileSync(resolve(REPO_ROOT, 'src', 'systems', 'CraftingEngine.js'), 'utf8');
    const start = source.indexOf('async _consumeComponentItems(');
    assert.ok(start > 0, '_consumeComponentItems is still declared in CraftingEngine.js');
    const body = source.slice(start, source.indexOf('\n  }\n', start));

    assert.ok(
      body.replace(/\s+/g, ' ').includes('planFirstFitDrain(items, quantity)'),
      'the method drains through the extracted policy, over the items and quantity it was given'
    );
    assert.ok(
      !body.includes('Math.min('),
      'the take arithmetic lives in pooledAllocation.js, not re-inlined here'
    );
    assert.ok(
      !body.includes('readStackQuantity('),
      'the capacity read lives in pooledAllocation.js, not re-inlined here'
    );
  });
});
