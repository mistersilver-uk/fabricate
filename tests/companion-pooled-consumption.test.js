/**
 * `consumePooledHoldings`' behaviour — the pooled holdings CONSUME (issue 1342, Phase 5).
 *
 * It is the only companion member that removes value, and the claims worth a suite of their own
 * are the ones where a plausible implementation quietly destroys a player's inventory:
 *
 *   1. **Nothing is written until everything is priced.** One cost the pool cannot cover refuses
 *      the whole call with every row reporting `attempted: false`, and the actors' item lists are
 *      untouched. The currency half of that pre-check runs BEFORE the component arm writes, which
 *      is the whole reason a `macro` world with no `increment` macro can be refused "having
 *      written nothing" rather than "having written and un-written".
 *   2. **The rollback actually rolls back.** A reduction is restored to the value the plan read,
 *      a deletion is re-created with its own `_id` — and therefore its UUID — and only the
 *      documents the delete ANSWERED with are re-created, because core rejects a `keepId` create
 *      onto an id the collection still holds. Every one of those is driven here by a write that
 *      FAILS, never by a spy that agrees.
 *   3. **A failed give-back stays visible.** The answer shape carries no `wroteNothing` field, so
 *      the ledger is the only place the truth can live: a restored row reports `takes: []` and an
 *      unrestored one keeps its lines, which is what makes `consumed` "what is still missing".
 *
 * **The fakes can REFUSE.** A Foundry document write fails silently far more often than it
 * rejects — `deleteEmbeddedDocuments` resolves fewer documents than it was given ids for when a
 * `preDelete` hook declines one, and `updateEmbeddedDocuments` DROPS an update whose diff is empty
 * — so the actor fake models both, plus `keepId`'s real semantics and core's collision throw. A
 * fake that always says yes cannot see a missing guard.
 *
 * **The suite configures a NON-DEFAULT stack-quantity path for its whole file**, so that a write
 * hardcoding the near-universal default would fail here rather than pass everywhere.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  COMPANION_OUTCOMES,
  POOLED_ACTORS_MAX,
  POOLED_COSTS_MAX,
  POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS,
} from '../src/systems/companionContract.js';
import { consumePooledHoldings } from '../src/systems/companionPooledConsumption.js';
import {
  configureItemStackQuantityPath,
  resetItemStackQuantityPath,
} from '../src/systems/itemStackQuantity.js';

import {
  assertLocalizationKey,
  assertMessageDataCovers,
  assertMessageIsFromTable,
} from './helpers/companionContractOutcomes.js';
import {
  POOLED_LADDER,
  POOLED_MACROS,
  PooledActorFake,
  pooledSeams,
} from './helpers/pooled-currency-fixtures.js';

/**
 * A `game` global, because `resolveCoinSpender` reads a BARE `game.fabricate?.…` on its accessor
 * fallbacks. Under Foundry the global always exists, so this models production.
 */
globalThis.game = globalThis.game ?? { fabricate: {} };

/**
 * The configured path, spelled as a LITERAL everywhere below and never as
 * `itemStackQuantityPath()`: comparing an implementation's answer against the live module default
 * is satisfied by an implementation that hardcodes that default.
 */
const QUANTITY_PATH = 'system.count.value';

before(() => configureItemStackQuantityPath(QUANTITY_PATH));
after(() => resetItemStackQuantityPath());

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Write a flattened `{ 'a.b.c': value }` update payload onto a fake document. */
function applyFlattened(target, update) {
  for (const [key, value] of Object.entries(update)) {
    if (key === '_id') continue;
    const segments = key.split('.');
    let node = target;
    for (const segment of segments.slice(0, -1)) node = node[segment];
    node[segments.at(-1)] = value;
  }
}

/**
 * One owned item, carrying flags and an active effect so a restore can be checked for FIDELITY
 * rather than merely for existence.
 */
function makeItem(actor, id, componentId, quantity, { snapshotable = true, systems } = {}) {
  const item = {
    id,
    name: `${componentId} (${id})`,
    uuid: `${actor.uuid}.Item.${id}`,
    parent: actor,
    componentId,
    systems: systems ?? ['sys-a', 'sys-b'],
    system: { count: { value: quantity } },
    flags: { fabricate: { roles: { 'sys-a': { componentId } } } },
    effects: [{ _id: `eff-${id}`, name: 'Blessed' }],
  };
  if (snapshotable) {
    item.toObject = () => ({
      _id: item.id,
      name: item.name,
      componentId: item.componentId,
      system: structuredClone(item.system),
      flags: structuredClone(item.flags),
      effects: structuredClone(item.effects),
    });
  }
  actor.items.push(item);
  return item;
}

/**
 * An actor that owns items and coins and can REFUSE a write.
 *
 * It extends the shared currency fixture rather than restating a coin actor, so the currency arm
 * runs against exactly the actor the pooled currency suite proved the debit against.
 *
 * `createEmbeddedDocuments` models the two `keepId` behaviours the restore depends on, verified
 * against the v14.365 server backend: an id is regenerated unless `keepId` AND an `_id` are both
 * supplied, and a create onto an id the collection still holds is REJECTED.
 */
class ConsumptionActor extends PooledActorFake {
  constructor(name, currency = {}) {
    super(name, currency);
    this.itemWrites = [];
    this.denyUpdate = false;
    this.denyDelete = false;
    this.denyCreate = false;
    this.dropUpdateIds = new Set();
    this.dropDeleteIds = new Set();
    this.created = 0;
  }

  writesOfKind(method) {
    return this.itemWrites.filter((write) => write.method === method);
  }

  async updateEmbeddedDocuments(type, updates, options) {
    this.itemWrites.push({ method: 'update', type, updates: structuredClone(updates), options });
    if (this.denyUpdate) return [];
    const applied = [];
    for (const update of updates) {
      if (this.dropUpdateIds.has(update._id)) continue;
      const item = this.items.find((candidate) => candidate.id === update._id);
      if (!item) continue;
      applyFlattened(item, update);
      applied.push(item);
    }
    return applied;
  }

  async deleteEmbeddedDocuments(type, ids, options) {
    this.itemWrites.push({ method: 'delete', type, ids: [...ids], options });
    if (this.denyDelete) return [];
    const removed = [];
    for (const id of ids) {
      if (this.dropDeleteIds.has(id)) continue;
      const index = this.items.findIndex((item) => item.id === id);
      if (index !== -1) removed.push(...this.items.splice(index, 1));
    }
    return removed;
  }

  async createEmbeddedDocuments(type, data, options) {
    this.itemWrites.push({ method: 'create', type, data: structuredClone(data), options });
    if (this.denyCreate) return [];
    return data.map((payload) => {
      const keeps = options?.keepId === true && Boolean(payload._id);
      const id = keeps ? payload._id : `regenerated-${(this.created += 1)}`;
      if (this.items.some((item) => item.id === id)) {
        throw new Error(`The _id [${id}] already exists within the parent collection`);
      }
      const restored = makeItem(this, id, payload.componentId, 0);
      restored.name = payload.name;
      restored.system = structuredClone(payload.system);
      restored.flags = structuredClone(payload.flags);
      restored.effects = structuredClone(payload.effects);
      return restored;
    });
  }
}

const SYSTEMS = {
  'sys-a': { id: 'sys-a', name: 'Alpha', components: [{ id: 'hide' }, { id: 'ore' }] },
  'sys-b': { id: 'sys-b', name: 'Beta', components: [{ id: 'hide' }] },
};

/** The component, currency and election seams one call is given. */
function makeSeams(overrides = {}) {
  const { world, ...rest } = overrides;
  return {
    isElectedExecutor: () => true,
    resolveSystem: (systemId) => SYSTEMS[systemId] ?? null,
    resolveComponent: (system, componentId) =>
      (system?.components ?? []).find((component) => component.id === componentId) ?? null,
    // System-AWARE, because component identity is per system: the same component id can name
    // different physical items in two crafting systems, and the shipped resolver reads a durable
    // role keyed by system id.
    findComponentItems: (actor, component, system) =>
      actor.items.filter(
        (item) => item.componentId === component.id && item.systems.includes(system.id)
      ),
    ...pooledSeams({ units: POOLED_LADDER, ...world }),
    ...rest,
  };
}

const componentCost = (componentId, quantity, systemId = 'sys-a') => ({
  type: 'component',
  systemId,
  componentId,
  quantity,
});

const currencyCost = (amount, unitId = 'gp') => ({ type: 'currency', unitId, amount });

const take = (actors, costs, seams = makeSeams(), callSite = 'gmAction') =>
  consumePooledHoldings(actors, { callSite, costs }, seams);

/** Every ledger row's `attempted`, so "nothing was attempted" is asserted as data. */
const attempts = (result) => result.ledger.map((row) => row.attempted);

/** Every item write any actor in the pool received. */
const allWrites = (actors) => actors.flatMap((actor) => actor.itemWrites);

/** The stack count an item currently stores at the configured path. */
const stackOf = (item) => item.system.count.value;

/** Assert an answer is a frozen, table-owned, resolvable contract answer. */
function assertConsumeAnswer(result, outcome) {
  assert.ok(Object.isFrozen(result), 'a contract answer crosses the boundary frozen');
  assert.equal(result.outcome, outcome);
  assertMessageIsFromTable(result, POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS, `the ${outcome} answer`);
  assertLocalizationKey(result.message, `the ${outcome} message`);
  assertMessageDataCovers(result, `the ${outcome} answer`);
}

// ---------------------------------------------------------------------------
// The gates, none of which reach a cost at all
// ---------------------------------------------------------------------------

describe('the gates that refuse before a single cost is read', () => {
  it('refuses an undeclared or unrecognised call site, and a broadcast this client is not elected for', async () => {
    const actors = [new ConsumptionActor('Idrin')];
    makeItem(actors[0], 'i1', 'hide', 5);

    // Called through the export directly rather than through the local helper, whose default
    // argument would silently supply a valid call site for the omitted case.
    for (const callSite of [null, undefined, 'gmaction', 'somewhere']) {
      const result = await consumePooledHoldings(
        actors,
        { callSite, costs: [componentCost('hide', 1)] },
        makeSeams()
      );
      assertConsumeAnswer(result, COMPANION_OUTCOMES.invalidCallSite);
    }

    const notElected = await take(
      actors,
      [componentCost('hide', 1)],
      makeSeams({ isElectedExecutor: () => false }),
      'broadcast'
    );
    assertConsumeAnswer(notElected, COMPANION_OUTCOMES.notElected);
    assert.deepEqual(allWrites(actors), [], 'a refused call site writes nothing at all');
  });

  it('refuses an unusable actor set, echoing the bound the string interpolates', async () => {
    const costs = [componentCost('hide', 1)];
    const overBound = Array.from(
      { length: POOLED_ACTORS_MAX + 1 },
      (_, index) => new ConsumptionActor(`a${index}`)
    );

    for (const pool of [null, undefined, 'Actor.Idrin', [], overBound, [null], [42]]) {
      const result = await take(pool, costs);
      assertConsumeAnswer(result, COMPANION_OUTCOMES.invalidActorUuids);
      assert.deepEqual(result.messageData, { max: POOLED_ACTORS_MAX });
      assert.deepEqual(result.ledger, [], 'no cost was examined, so there is no ledger');
      assert.equal(result.consumed, null, 'and a sum over an empty ledger is vacuous, not zero');
    }
  });

  it('refuses an unusable cost list, and a malformed entry with it', async () => {
    const actors = [new ConsumptionActor('Idrin')];
    const overBound = Array.from({ length: POOLED_COSTS_MAX + 1 }, () => componentCost('hide', 1));

    for (const costs of [null, undefined, {}, [], overBound, [null], ['hide'], [[]]]) {
      const result = await take(actors, costs);
      assertConsumeAnswer(result, COMPANION_OUTCOMES.invalidCosts);
      assert.deepEqual(result.messageData, { max: POOLED_COSTS_MAX });
      assert.equal(result.consumed, null);
    }
    assert.deepEqual(allWrites(actors), []);
  });
});

// ---------------------------------------------------------------------------
// The pre-check: every refusal below writes nothing
// ---------------------------------------------------------------------------

describe('the whole-call pre-check', () => {
  it('gives every unresolvable cost its own row token and reports the rest as notAttempted', async () => {
    const actors = [new ConsumptionActor('Idrin')];
    makeItem(actors[0], 'i1', 'hide', 5);
    const cases = [
      [
        { type: 'components', componentId: 'hide', quantity: 1 },
        COMPANION_OUTCOMES.invalidCostType,
      ],
      [{ type: 'tool', name: 'Hammer' }, COMPANION_OUTCOMES.costTypeUnsupported],
      [{ type: 'essence', name: 'Fire', quantity: 1 }, COMPANION_OUTCOMES.costTypeUnsupported],
      [componentCost('hide', 0), COMPANION_OUTCOMES.invalidQuantity],
      [componentCost('hide', 2.5), COMPANION_OUTCOMES.invalidQuantity],
      [componentCost('hide', 1, 'sys-missing'), COMPANION_OUTCOMES.systemNotFound],
      [componentCost('nothing', 1), COMPANION_OUTCOMES.componentNotFound],
    ];

    for (const [cost, expected] of cases) {
      const result = await take(actors, [cost, componentCost('hide', 1)]);
      assertConsumeAnswer(result, COMPANION_OUTCOMES.consumeFailed);
      assert.equal(result.ledger[0].outcome, expected, JSON.stringify(cost));
      assert.equal(result.ledger[1].outcome, COMPANION_OUTCOMES.notAttempted);
      assert.deepEqual(attempts(result), [false, false]);
      assert.equal(result.consumed, 0, 'every cost was examined, so zero is PROVABLE');
    }
    assert.deepEqual(allWrites(actors), [], 'not one write was issued on any of those');
    assert.equal(stackOf(actors[0].items[0]), 5);
  });

  it('refuses a pool short of one cost as insufficient, taking nothing for any of them', async () => {
    const actors = [new ConsumptionActor('Idrin'), new ConsumptionActor('Sera')];
    makeItem(actors[0], 'i1', 'hide', 2);
    makeItem(actors[1], 's1', 'hide', 1);
    makeItem(actors[1], 's2', 'ore', 4);

    const result = await take(actors, [componentCost('ore', 2), componentCost('hide', 4)]);

    assertConsumeAnswer(result, COMPANION_OUTCOMES.insufficient);
    assert.deepEqual(attempts(result), [false, false]);
    assert.equal(result.ledger[0].outcome, COMPANION_OUTCOMES.notAttempted);
    assert.equal(result.ledger[1].outcome, COMPANION_OUTCOMES.insufficient);
    assert.equal(result.consumed, 0);
    assert.deepEqual(allWrites(actors), [], 'the affordable cost was NOT taken first');
  });

  it('sums two costs naming one component before deciding, so neither can be double-planned', async () => {
    const actors = [new ConsumptionActor('Idrin')];
    makeItem(actors[0], 'i1', 'hide', 3);

    // Either cost alone fits in the pool of three; together they need four.
    const result = await take(actors, [componentCost('hide', 2), componentCost('hide', 2)]);

    assertConsumeAnswer(result, COMPANION_OUTCOMES.insufficient);
    assert.deepEqual(
      result.ledger.map((row) => row.outcome),
      [COMPANION_OUTCOMES.insufficient, COMPANION_OUTCOMES.insufficient]
    );
    assert.deepEqual(allWrites(actors), []);
  });

  it('keeps a component id per crafting system, so two systems are two pools', async () => {
    const actors = [new ConsumptionActor('Idrin')];
    // Both systems declare a component called `hide`, and each resolves to its OWN item.
    makeItem(actors[0], 'i1', 'hide', 1, { systems: ['sys-a'] });
    makeItem(actors[0], 'i2', 'hide', 1, { systems: ['sys-b'] });

    const result = await take(actors, [
      componentCost('hide', 1, 'sys-a'),
      componentCost('hide', 1, 'sys-b'),
    ]);

    // A system-blind bucket would sum the two costs into one drain of two against whichever
    // system it happened to bucket first, whose pool holds exactly one.
    assertConsumeAnswer(result, COMPANION_OUTCOMES.consumed);
    assert.equal(result.consumed, 2);
    assert.equal(actors[0].items.length, 0, 'one document paid each cost');
  });

  it('never plans one document into two costs, even when two components both match it', async () => {
    const actors = [new ConsumptionActor('Idrin')];
    // ONE stack of two, carrying a role in both systems — a component in each can register the
    // same source item. Two plans over it would write the second reduction over the first.
    makeItem(actors[0], 'i1', 'hide', 2, { systems: ['sys-a', 'sys-b'] });

    const result = await take(actors, [
      componentCost('hide', 1, 'sys-a'),
      componentCost('hide', 1, 'sys-b'),
    ]);

    assertConsumeAnswer(result, COMPANION_OUTCOMES.insufficient);
    assert.deepEqual(allWrites(actors), []);
    assert.equal(stackOf(actors[0].items[0]), 2, 'and the stack is untouched');
  });
});

// ---------------------------------------------------------------------------
// The component arm
// ---------------------------------------------------------------------------

describe('the component arm', () => {
  it('batches one update and one delete per actor, and names every document that paid', async () => {
    const idrin = new ConsumptionActor('Idrin');
    const sera = new ConsumptionActor('Sera');
    const first = makeItem(idrin, 'i1', 'hide', 2);
    const second = makeItem(idrin, 'i2', 'hide', 3);
    const third = makeItem(sera, 's1', 'hide', 4);
    const actors = [idrin, sera];

    const result = await take(actors, [componentCost('hide', 6)]);

    assertConsumeAnswer(result, COMPANION_OUTCOMES.consumed);
    assert.equal(result.success, true);
    assert.equal(result.consumed, 6);
    assert.deepEqual(result.actorUuids, ['Actor.Idrin', 'Actor.Sera']);
    assert.deepEqual(
      result.ledger[0].takes.map((line) => [line.actorUuid, line.documentUuid, line.quantity]),
      [
        ['Actor.Idrin', first.uuid, 2],
        ['Actor.Idrin', second.uuid, 3],
        ['Actor.Sera', third.uuid, 1],
      ],
      'first-fit in the POOLED order: whoever comes first pays first'
    );
    // Idrin's two items are both exhausted, so ONE delete carries both ids and no update runs.
    assert.deepEqual(
      idrin.itemWrites.map((write) => write.method),
      ['delete']
    );
    assert.deepEqual(idrin.writesOfKind('delete')[0].ids, ['i1', 'i2']);
    // Sera's single stack survives smaller, so ONE update runs and no delete does.
    assert.deepEqual(
      sera.itemWrites.map((write) => write.method),
      ['update']
    );
    assert.deepEqual(sera.writesOfKind('update')[0].updates, [{ _id: 's1', [QUANTITY_PATH]: 3 }]);
    assert.equal(stackOf(third), 3);
  });

  it('splits one drain across the two costs that share a component', async () => {
    const actors = [new ConsumptionActor('Idrin')];
    const first = makeItem(actors[0], 'i1', 'hide', 4);
    const second = makeItem(actors[0], 'i2', 'hide', 4);

    const result = await take(actors, [componentCost('hide', 3), componentCost('hide', 2)]);

    assertConsumeAnswer(result, COMPANION_OUTCOMES.consumed);
    assert.deepEqual(
      result.ledger.map((row) => row.takes.map((line) => [line.documentUuid, line.quantity])),
      [
        [[first.uuid, 3]],
        [
          [first.uuid, 1],
          [second.uuid, 1],
        ],
      ],
      'a single take is split across the rows it pays for'
    );
    assert.deepEqual(
      result.ledger.map((row) => row.consumed),
      [3, 2]
    );
    assert.equal(result.consumed, 5);
    // FIVE units left one document each — a per-row plan would have drained eight.
    assert.equal(stackOf(second), 3);
    assert.equal(actors[0].items.length, 1, 'the exhausted stack is gone, the other survives');
  });

  it('reduces before it deletes, so the cheap inverse is the one already committed', async () => {
    const actors = [new ConsumptionActor('Idrin')];
    makeItem(actors[0], 'i1', 'hide', 3);
    makeItem(actors[0], 'i2', 'hide', 3);

    await take(actors, [componentCost('hide', 4)]);

    assert.deepEqual(
      actors[0].itemWrites.map((write) => write.method),
      ['update', 'delete'],
      'the reduction — whose inverse is another reduction — is issued first'
    );
  });
});

// ---------------------------------------------------------------------------
// The rollback
// ---------------------------------------------------------------------------

describe('the rollback', () => {
  it('restores a reduced stack to the value the plan read when a later delete is refused', async () => {
    const actors = [new ConsumptionActor('Idrin')];
    makeItem(actors[0], 'i1', 'hide', 3);
    const survivor = makeItem(actors[0], 'i2', 'hide', 3);
    actors[0].denyDelete = true;

    const result = await take(actors, [componentCost('hide', 4)]);

    assertConsumeAnswer(result, COMPANION_OUTCOMES.consumeFailed);
    assert.equal(result.consumed, 0, 'everything taken was given back');
    assert.deepEqual(result.ledger[0].takes, []);
    assert.equal(result.ledger[0].attempted, true, 'a write WAS issued for this cost');
    assert.equal(stackOf(survivor), 3, 'the reduction was put back exactly, not incremented');
    assert.deepEqual(
      actors[0].writesOfKind('update').at(-1).updates,
      [{ _id: 'i2', [QUANTITY_PATH]: 3 }],
      'the restore writes the value the plan read, through the configured path'
    );
  });

  it('re-creates a deleted document with its own id, flags and effects intact', async () => {
    const idrin = new ConsumptionActor('Idrin');
    const sera = new ConsumptionActor('Sera');
    const doomed = makeItem(idrin, 'i1', 'hide', 2);
    const snapshot = doomed.toObject();
    makeItem(sera, 's1', 'hide', 5);
    const actors = [idrin, sera];
    // Idrin's delete lands; Sera's reduction is DROPPED, the empty-diff shape a stack-quantity
    // path outside the item's data model produces. So the undo has a real delete to reverse.
    sera.dropUpdateIds = new Set(['s1']);

    const result = await take(actors, [componentCost('hide', 4)]);

    assertConsumeAnswer(result, COMPANION_OUTCOMES.consumeFailed);
    const created = idrin.writesOfKind('create');
    assert.equal(created.length, 1, 'exactly one restore was issued');
    assert.deepEqual(created[0].options, { keepId: true, keepEmbeddedIds: true });
    assert.deepEqual(created[0].data, [snapshot], 'the payload is the pre-delete snapshot, whole');
    const restored = idrin.items.find((item) => item.id === 'i1');
    assert.ok(Boolean(restored), 'the document is back');
    assert.equal(
      restored.uuid,
      doomed.uuid,
      'and under its original uuid, because the _id was kept'
    );
    assert.deepEqual(restored.flags, doomed.flags);
    assert.deepEqual(restored.effects, doomed.effects);
    assert.equal(result.consumed, 0);
  });

  it('re-creates only what the delete answered with, because core rejects a kept id that still exists', async () => {
    const actors = [new ConsumptionActor('Idrin')];
    makeItem(actors[0], 'i1', 'hide', 2);
    makeItem(actors[0], 'i2', 'hide', 2);
    makeItem(actors[0], 'i3', 'hide', 5);
    // `i2` survives the delete — a `preDelete` refusal — so the batch is partial.
    actors[0].dropDeleteIds = new Set(['i2']);

    const result = await take(actors, [componentCost('hide', 4)]);

    assertConsumeAnswer(result, COMPANION_OUTCOMES.consumeFailed);
    const created = actors[0].writesOfKind('create');
    assert.deepEqual(
      created[0].data.map((payload) => payload._id),
      ['i1'],
      'restoring i2 as well would collide with the copy the delete refused to remove'
    );
    assert.equal(result.consumed, 0, 'and the collision never happened, so the give-back stands');
    assert.ok(
      actors[0].items.some((item) => item.id === 'i1'),
      'the document that WAS deleted came back'
    );
  });

  it('keeps the take lines when the give-back itself fails, so consumed is what is still missing', async () => {
    const idrin = new ConsumptionActor('Idrin');
    const sera = new ConsumptionActor('Sera');
    makeItem(idrin, 'i1', 'hide', 2);
    makeItem(sera, 's1', 'hide', 5);
    const actors = [idrin, sera];
    sera.dropUpdateIds = new Set(['s1']);
    idrin.denyCreate = true;

    const result = await take(actors, [componentCost('hide', 4)]);

    assertConsumeAnswer(result, COMPANION_OUTCOMES.consumeFailed);
    assert.equal(result.consumed, 4, 'the answer does not claim a give-back that did not happen');
    assert.equal(result.ledger[0].takes.length, 2);
    assert.ok(
      idrin.items.every((item) => item.id !== 'i1'),
      'and the document really is gone'
    );
  });

  it('never deletes what it cannot first snapshot', async () => {
    const actors = [new ConsumptionActor('Idrin')];
    makeItem(actors[0], 'i1', 'hide', 2, { snapshotable: false });
    makeItem(actors[0], 'i2', 'hide', 5);

    const result = await take(actors, [componentCost('hide', 4)]);

    assertConsumeAnswer(result, COMPANION_OUTCOMES.consumeFailed);
    assert.deepEqual(
      actors[0].writesOfKind('delete'),
      [],
      'a document with no toObject is a delete with no inverse, so no delete is issued'
    );
    assert.equal(actors[0].items.length, 2);
    assert.equal(result.consumed, 0);
  });

  it('refuses a reduction whose configured path resolves an object, before writing it', async () => {
    const actors = [new ConsumptionActor('Idrin')];
    const item = makeItem(actors[0], 'i1', 'hide', 5);
    // A structured value at the configured path that still COERCES to a number, which is the
    // only shape that reaches the reduction branch at all: anything the drain reads as NaN
    // prices the stack at one and takes the delete branch instead. The accessor warns and
    // refuses the write rather than replacing the structure with a bare count.
    item.system.count.value = [5];

    const result = await take(actors, [componentCost('hide', 1)]);

    assertConsumeAnswer(result, COMPANION_OUTCOMES.consumeFailed);
    assert.deepEqual(actors[0].writesOfKind('update'), []);
    assert.equal(result.consumed, 0);
  });
});

// ---------------------------------------------------------------------------
// The currency arm
// ---------------------------------------------------------------------------

describe('the currency arm', () => {
  const macroWorldWithoutIncrement = {
    spendStrategy: 'macro',
    macros: { ...POOLED_MACROS, increment: '' },
  };

  it('refuses a world that publishes no give-back UP FRONT, before the component arm writes', async () => {
    const actors = [new ConsumptionActor('Idrin', { gp: 10 })];
    makeItem(actors[0], 'i1', 'hide', 5);
    const seams = makeSeams({
      world: macroWorldWithoutIncrement,
      runMacro: () => assert.fail('no macro may run on a refusal decided by world configuration'),
    });

    // The COMPONENT cost is first in the list, so a member that settled costs in list order
    // would already have deleted an item by the time it discovered this.
    const result = await take(actors, [componentCost('hide', 2), currencyCost(1)], seams);

    assertConsumeAnswer(result, COMPANION_OUTCOMES.creditNotConfigured);
    assert.deepEqual(allWrites(actors), [], 'nothing was taken');
    assert.deepEqual(attempts(result), [false, false]);
    assert.equal(result.consumed, 0);
  });

  it('refuses a currency shortfall before the component arm writes', async () => {
    const actors = [new ConsumptionActor('Idrin', { gp: 1 })];
    makeItem(actors[0], 'i1', 'hide', 5);

    const result = await take(actors, [componentCost('hide', 2), currencyCost(5)]);

    assertConsumeAnswer(result, COMPANION_OUTCOMES.insufficient);
    assert.deepEqual(allWrites(actors), []);
    assert.equal(result.ledger[1].outcome, COMPANION_OUTCOMES.insufficient);
    assert.equal(result.ledger[0].outcome, COMPANION_OUTCOMES.notAttempted);
  });

  it('gives a currency cost its own row token for a unit and an amount it cannot use', async () => {
    const actors = [new ConsumptionActor('Idrin', { gp: 10 })];

    const missing = await take(actors, [currencyCost(1, 'zorkmid')]);
    assertConsumeAnswer(missing, COMPANION_OUTCOMES.consumeFailed);
    assert.equal(missing.ledger[0].outcome, COMPANION_OUTCOMES.unitNotFound);

    const fractional = await take(actors, [currencyCost(2.5)]);
    assertConsumeAnswer(fractional, COMPANION_OUTCOMES.consumeFailed);
    assert.equal(fractional.ledger[0].outcome, COMPANION_OUTCOMES.invalidQuantity);
    assert.equal(fractional.ledger[0].requested, null, 'an unusable quantity echoes as null');
  });

  it('settles components first and currency second, in the terminal base unit', async () => {
    const idrin = new ConsumptionActor('Idrin', { gp: 1 });
    const sera = new ConsumptionActor('Sera', { sp: 5 });
    makeItem(idrin, 'i1', 'hide', 3);
    const actors = [idrin, sera];

    const result = await take(actors, [currencyCost(1), componentCost('hide', 2)]);

    assertConsumeAnswer(result, COMPANION_OUTCOMES.consumed);
    // Reported in the CALLER's order even though currency was settled last.
    assert.deepEqual(
      result.ledger.map((row) => row.type),
      ['currency', 'component']
    );
    // 1 gp is 100 cp on this ladder, and Idrin covers all of it.
    assert.deepEqual(result.ledger[0].takes, [
      { actorUuid: 'Actor.Idrin', documentUuid: null, quantity: 100 },
    ]);
    assert.equal(result.ledger[0].requested, 1, 'the ECHO is in the caller`s own denomination');
    assert.equal(result.ledger[0].consumed, 100, 'while the takes are coins, and coins are exact');
    assert.equal(idrin.totalCopper(), 0);
    assert.equal(sera.totalCopper(), 50, 'the first payer covered it, so the second paid nothing');
    assert.equal(result.consumed, 102);
  });

  it('splits a currency cost across payers and names each of them', async () => {
    const idrin = new ConsumptionActor('Idrin', { sp: 5 });
    const sera = new ConsumptionActor('Sera', { gp: 1 });
    const actors = [idrin, sera];

    const result = await take(actors, [currencyCost(1)]);

    assertConsumeAnswer(result, COMPANION_OUTCOMES.consumed);
    assert.deepEqual(
      result.ledger[0].takes.map((line) => [line.actorUuid, line.quantity]),
      [
        ['Actor.Idrin', 50],
        ['Actor.Sera', 50],
      ]
    );
    assert.equal(idrin.totalCopper(), 0);
    assert.equal(sera.totalCopper(), 50, 'and the gold piece was broken for change');
  });

  it('gives every component back when the currency arm fails afterwards', async () => {
    const idrin = new ConsumptionActor('Idrin', { gp: 1 });
    const survivor = { current: null };
    makeItem(idrin, 'i1', 'hide', 2);
    survivor.current = makeItem(idrin, 'i2', 'hide', 5);
    const actors = [idrin];
    const seams = makeSeams({
      actorPropertyCoinSpender: {
        readCoins: () => ({ valid: true, copperValue: 100 }),
        spend: async () => ({ valid: false, message: 'The purse would not open.' }),
        refund: async () => ({ valid: true }),
      },
    });

    const result = await take(actors, [componentCost('hide', 4), currencyCost(1)], seams);

    assertConsumeAnswer(result, COMPANION_OUTCOMES.consumeFailed);
    assert.equal(result.consumed, 0, 'the whole take was given back');
    assert.deepEqual(result.ledger[0].takes, []);
    assert.equal(stackOf(survivor.current), 5, 'the reduced stack is whole again');
    assert.ok(
      idrin.items.some((item) => item.id === 'i1'),
      'and the deleted document is back under its own id'
    );
  });

  it('gives an already-settled currency cost back when a later one fails', async () => {
    const idrin = new ConsumptionActor('Idrin', { gp: 3 });
    const actors = [idrin];
    let spends = 0;
    const seams = makeSeams({
      actorPropertyCoinSpender: {
        readCoins: () => ({ valid: true, copperValue: idrin.totalCopper() }),
        spend: async (actor, requirement) => {
          spends += 1;
          if (spends === 2) return { valid: false, message: 'The second purse jammed.' };
          idrin.system.currency.cp = idrin.totalCopper() - requirement.amount;
          idrin.system.currency.gp = 0;
          idrin.system.currency.sp = 0;
          return { valid: true };
        },
        refund: async (actor, requirement) => {
          idrin.system.currency.cp = idrin.totalCopper() + requirement.amount;
          return { valid: true };
        },
      },
    });

    const result = await take(actors, [currencyCost(1), currencyCost(1)], seams);

    assertConsumeAnswer(result, COMPANION_OUTCOMES.consumeFailed);
    assert.equal(idrin.totalCopper(), 300, 'the first cost was credited back in full');
    assert.equal(result.consumed, 0);
    assert.deepEqual(result.ledger[0].takes, []);
  });

  it('reports a pool that became unreadable as notAttempted, not as an issued write', async () => {
    const idrin = new ConsumptionActor('Idrin', { gp: 5 });
    makeItem(idrin, 'i1', 'hide', 2);
    const actors = [idrin];
    let reads = 0;
    const seams = makeSeams({
      actorPropertyCoinSpender: {
        // Readable while the pre-check prices the cost, unreadable by the time the debit reads
        // the pool for itself. The leg refuses having invoked no spender at all.
        readCoins: () => {
          reads += 1;
          return reads === 1
            ? { valid: true, copperValue: 500 }
            : { valid: false, message: 'gone' };
        },
        spend: async () => assert.fail('no spend may be attempted against an unreadable pool'),
        refund: async () => ({ valid: true }),
      },
    });

    const result = await take(actors, [componentCost('hide', 2), currencyCost(1)], seams);

    assertConsumeAnswer(result, COMPANION_OUTCOMES.consumeFailed);
    assert.equal(result.ledger[1].outcome, COMPANION_OUTCOMES.notAttempted);
    assert.deepEqual(attempts(result), [true, false], 'only the component arm issued a write');
    assert.equal(result.consumed, 0, 'and that write was given back');
    assert.ok(
      idrin.items.some((item) => item.id === 'i1'),
      'the component is back on the sheet'
    );
  });

  it('keeps the coin lines when the currency leg could not give its own take back', async () => {
    const idrin = new ConsumptionActor('Idrin', { gp: 1 });
    const sera = new ConsumptionActor('Sera', { gp: 1 });
    const actors = [idrin, sera];
    let spends = 0;
    const seams = makeSeams({
      actorPropertyCoinSpender: {
        readCoins: (actor) => ({ valid: true, copperValue: actor.totalCopper() }),
        spend: async () => {
          spends += 1;
          return spends === 1 ? { valid: true } : { valid: false, message: 'jammed' };
        },
        refund: async () => ({ valid: false, message: 'and the refund jammed too' }),
      },
    });

    const result = await take(actors, [currencyCost(2)], seams);

    assertConsumeAnswer(result, COMPANION_OUTCOMES.consumeFailed);
    assert.equal(result.consumed, 100, 'one payer`s hundred copper is genuinely still gone');
    assert.deepEqual(result.ledger[0].takes, [
      { actorUuid: 'Actor.Idrin', documentUuid: null, quantity: 100 },
    ]);
  });
});
