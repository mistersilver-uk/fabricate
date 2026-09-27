/**
 * The marker-capable reward writer primitives the companion effect path builds on (issue 1954):
 * each is judged by the returned document's `_source`, never by an acknowledgement alone.
 */

import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import {
  ActorPropertyCoinSpender,
  currencyStrategyReplayClass,
} from '../src/systems/CoinSpenders.js';
import {
  awardComponents,
  placeComponentAward,
  probeComponentAward,
} from '../src/systems/companionComponentAward.js';
import { COMPANION_CALL_SITES, COMPANION_OUTCOMES } from '../src/systems/companionContract.js';
import {
  grantRecipeKnowledgeEntry,
  isRecipeKnown,
  probeRecipeKnowledgeGrant,
} from '../src/systems/companionKnowledgeGrant.js';
import { prepareWorldCurrencyCredit } from '../src/systems/currencyAffordance.js';
import {
  configureItemStackQuantityPath,
  resetItemStackQuantityPath,
} from '../src/systems/itemStackQuantity.js';

import { expandObject } from './helpers/foundryExpandObject.js';

const QUANTITY_PATH = 'system.count.value';
const SYSTEM = { id: 'sys-1', name: 'Test System' };
const MARKER = Object.freeze({ operationId: 'op-1', effectId: 'e0', subwriteId: 'r0.a0' });

before(() => configureItemStackQuantityPath(QUANTITY_PATH));
after(() => resetItemStackQuantityPath());

// Fixtures

const isPlain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Apply a flattened update to `_source` the way Foundry does: values are dot-expanded first,
 * and `==` replaces wholesale.
 */
function applyUpdate(source, payload, { drop = [] } = {}) {
  for (const [path, value] of Object.entries(payload)) {
    if (drop.includes(path)) continue;
    const segments = path.split('.');
    let node = source;
    for (const segment of segments.slice(0, -1)) node = node[segment] ??= {};
    const last = segments.at(-1);
    const expanded = expandObject(value);
    if (last.startsWith('==')) node[last.slice(2)] = structuredClone(expanded);
    else if (isPlain(expanded) && isPlain(node[last])) {
      Object.assign(node[last], structuredClone(expanded));
    } else node[last] = structuredClone(expanded);
  }
}

/** An item document double: prepared data mirrors `_source` unless told otherwise. */
function makeItem(id, { count = 3, sourceCount = count, flags, update } = {}) {
  const item = {
    id,
    uuid: `Actor.a1.Item.${id}`,
    system: { count: { value: count } },
    _source: { system: { count: sourceCount === null ? {} : { value: sourceCount } }, flags },
    updates: [],
    async update(payload) {
      item.updates.push(payload);
      if (update) return update(payload, item);
      applyUpdate(item._source, payload);
      return item;
    },
  };
  return item;
}

function makeActor({ create } = {}) {
  const actor = {
    uuid: 'Actor.a1',
    createCalls: [],
    async createEmbeddedDocuments(type, payloads) {
      actor.createCalls.push(payloads);
      if (create) return create(payloads);
      return payloads.map((data, index) => ({
        uuid: `Actor.a1.Item.new${index}`,
        _source: structuredClone(data),
      }));
    },
  };
  return actor;
}

function makeSeams({ matching = [], sourceFlags } = {}) {
  return {
    resolveComponent: (_system, id) => ({ id, name: id, registeredItemUuid: `Item.${id}` }),
    findComponentItems: async () => matching,
    resolveSourceItem: async () => ({
      toObject: () => ({
        name: 'Iron',
        type: 'loot',
        system: { count: { value: 1 } },
        flags: structuredClone(sourceFlags),
      }),
    }),
  };
}

const place = (options = {}, seams = makeSeams()) =>
  placeComponentAward(
    {
      actor: options.actor ?? makeActor(),
      entry: { componentId: 'iron', quantity: 2 },
      system: SYSTEM,
      marker: MARKER,
      ...options,
    },
    seams
  );

/** Every own key of a value tree, recursively, with the prototypes it holds. */
function* walk(node) {
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    yield [key, value];
    yield* walk(value);
  }
}

// Component award

describe('placeComponentAward — create', () => {
  const replacement = class ForcedReplacement {
    static create(value) {
      return Object.assign(new replacement(), { value });
    }
  };
  afterEach(() => delete globalThis.foundry);

  it('stamps the marker as a plain nested object, never an operator, and applies', async () => {
    globalThis.foundry = { data: { operators: { ForcedReplacement: replacement } } };
    const actor = makeActor();
    const carried = new Map();
    const answer = await place({ actor, carried });

    const [data] = actor.createCalls[0];
    const stamped = data.flags.fabricate.companionEffect;
    assert.deepEqual(stamped, MARKER);
    assert.equal(Object.getPrototypeOf(stamped), Object.prototype);
    for (const [key, value] of walk(data)) {
      assert.ok(!key.includes('=='), `create data carries no replacement key: ${key}`);
      assert.ok(!(value instanceof replacement), `create data carries no operator at ${key}`);
    }
    assert.deepEqual(answer, {
      status: 'applied',
      intent: { mode: 'create', targetItemUuid: null, stackBefore: null },
      receipt: { itemUuid: 'Actor.a1.Item.new0', placed: 2, stacked: false },
      failure: null,
    });
    assert.equal(carried.get('iron').uuid, 'Actor.a1.Item.new0');
  });

  it('strips a copied marker, replacing it on the marker path', async () => {
    const copied = { fabricate: { companionEffect: { operationId: 'other' }, keep: 1 } };
    const actor = makeActor();
    await place({ actor }, makeSeams({ sourceFlags: copied }));
    assert.deepEqual(actor.createCalls[0][0].flags.fabricate.companionEffect, MARKER);
    assert.equal(actor.createCalls[0][0].flags.fabricate.keep, 1);
  });

  it('omits the key entirely without a marker, and strips a copied one', async () => {
    const copied = { fabricate: { companionEffect: { operationId: 'other' } } };
    const actor = makeActor();
    const answer = await place({ actor, marker: null }, makeSeams({ sourceFlags: copied }));
    assert.equal(Object.hasOwn(actor.createCalls[0][0].flags.fabricate, 'companionEffect'), false);
    assert.equal(answer.status, 'applied');
  });

  it('strips a copied marker on the legacy awardComponents path too', async () => {
    const copied = { fabricate: { companionEffect: { operationId: 'other' } } };
    const payloads = [];
    const result = await awardComponents(
      makeActor(),
      { systemId: SYSTEM.id, awards: [{ componentId: 'iron', quantity: 2 }], callSite: COMPANION_CALL_SITES.gmAction },
      {
        ...makeSeams({ sourceFlags: copied }),
        resolveSystem: () => SYSTEM,
        isElectedExecutor: () => true,
        createOrStack: async ({ itemData }) => {
          payloads.push(itemData);
          return { uuid: 'Actor.a1.Item.legacy' };
        },
      }
    );
    assert.equal(result.outcome, COMPANION_OUTCOMES.awarded);
    assert.equal(Object.hasOwn(payloads[0].flags.fabricate, 'companionEffect'), false);
  });

  it('is knownFailure when the create resolves [] or undefined', async () => {
    for (const created of [[], undefined]) {
      const answer = await place({ actor: makeActor({ create: () => created }) });
      assert.equal(answer.status, 'knownFailure');
      assert.equal(answer.receipt, null);
      assert.deepEqual(answer.failure, { reason: 'writeRefused', detail: null });
    }
  });

  it('is uncertain when the create throws, or lands without the marker or the value', async () => {
    const thrown = await place({
      actor: makeActor({
        create: () => {
          throw new Error('socket closed');
        },
      }),
    });
    assert.equal(thrown.status, 'uncertain');
    assert.deepEqual(thrown.failure, { reason: 'writeThrew', detail: 'socket closed' });
    assert.equal(thrown.intent.mode, 'create');

    const unmarked = await place({
      actor: makeActor({ create: () => [{ uuid: 'x', _source: { system: { count: { value: 2 } } } }] }),
    });
    assert.equal(unmarked.status, 'uncertain');
  });

  it('applies a sourced item with no quantity field at quantity 1, and probes it applied', async () => {
    const seams = {
      ...makeSeams(),
      resolveSourceItem: async () => ({
        toObject: () => ({ name: 'Iron', type: 'loot', system: {} }),
      }),
    };
    const actor = makeActor();
    const entry = { componentId: 'iron', quantity: 1 };
    const answer = await place({ actor, entry }, seams);
    const [data] = actor.createCalls[0];
    assert.equal(data.system.count, undefined, 'no count field was invented');
    assert.equal(answer.status, 'applied');
    assert.deepEqual(answer.receipt, { itemUuid: 'Actor.a1.Item.new0', placed: 1, stacked: false });

    const created = { uuid: 'Actor.a1.Item.new0', _source: structuredClone(data) };
    const probe = (quantity) =>
      probeComponentAward({ intent: answer.intent, marker: MARKER, quantity, documents: [created] });
    assert.equal(probe(1).status, 'applied');
    assert.equal(probe(2).status, 'uncertain', 'an absent count proves only one unit');
  });

  it('refuses a pre-write throw as knownFailure, having written nothing', async () => {
    const actor = makeActor();
    const seams = {
      ...makeSeams(),
      findComponentItems: async () => {
        throw new Error('resolver broke');
      },
    };
    const answer = await place({ actor }, seams);
    assert.equal(answer.status, 'knownFailure');
    assert.equal(answer.failure.reason, 'preflightThrew');
    assert.equal(actor.createCalls.length, 0);
  });
});

describe('placeComponentAward — stack', () => {
  it('writes the marker by forced replacement in the same update as the value', async () => {
    const stale = { operationId: 'old', effectId: 'e9', subwriteId: 'x', extra: true };
    const target = makeItem('i1', { flags: { fabricate: { companionEffect: stale } } });
    const answer = await place({}, makeSeams({ matching: [target] }));

    assert.deepEqual(target.updates, [
      { [QUANTITY_PATH]: 5, 'flags.fabricate.==companionEffect': MARKER },
    ]);
    // The dropped `extra` key is gone, as Foundry's replacement leaves it.
    assert.deepEqual(target._source.flags.fabricate.companionEffect, MARKER);
    assert.deepEqual(answer, {
      status: 'applied',
      intent: { mode: 'stack', targetItemUuid: 'Actor.a1.Item.i1', stackBefore: 3 },
      receipt: { itemUuid: 'Actor.a1.Item.i1', placed: 2, stacked: true },
      failure: null,
    });
  });

  it('is uncertain when the value path is stripped and only the flag lands', async () => {
    const target = makeItem('i1', {
      update: (payload, item) => {
        applyUpdate(item._source, payload, { drop: [QUANTITY_PATH] });
        return item;
      },
    });
    const answer = await place({}, makeSeams({ matching: [target] }));
    assert.deepEqual(target._source.flags.fabricate.companionEffect, MARKER);
    assert.equal(answer.status, 'uncertain');
    assert.equal(answer.failure.reason, 'receiptMismatch');
  });

  it('refuses a target whose _source lacks the quantity path, writing nothing', async () => {
    const target = makeItem('i1', { sourceCount: null });
    const answer = await place({}, makeSeams({ matching: [target] }));
    assert.equal(answer.status, 'knownFailure');
    assert.equal(answer.failure.reason, 'stackSourceMissing');
    assert.equal(target.updates.length, 0);
  });

  it('is knownFailure for an undefined update and uncertain for a thrown one', async () => {
    const refused = makeItem('i1', { update: () => undefined });
    assert.equal((await place({}, makeSeams({ matching: [refused] }))).status, 'knownFailure');

    const thrown = makeItem('i2', {
      update: () => {
        throw new Error('timeout');
      },
    });
    const answer = await place({}, makeSeams({ matching: [thrown] }));
    assert.equal(answer.status, 'uncertain');
    assert.equal(answer.intent.stackBefore, 3);
  });

  it('stacks onto an injected carried document rebuilt from a prior receipt', async () => {
    const prior = makeItem('prior', { count: 4 });
    const carried = new Map([['iron', prior]]);
    const answer = await place({ carried }, makeSeams({ matching: [] }));
    assert.equal(answer.receipt.itemUuid, 'Actor.a1.Item.prior');
    assert.equal(prior._source.system.count.value, 6);
  });

  it('hands the intent to beforeWrite, and writes nothing when it declines', async () => {
    const target = makeItem('i1');
    const seen = [];
    const answer = await place(
      { beforeWrite: async (intent) => (seen.push(intent), false) },
      makeSeams({ matching: [target] })
    );
    assert.deepEqual(seen, [{ mode: 'stack', targetItemUuid: 'Actor.a1.Item.i1', stackBefore: 3 }]);
    assert.equal(answer.status, 'notAttempted');
    assert.equal(target.updates.length, 0);
  });
});

describe('probeComponentAward', () => {
  const intent = { mode: 'stack', targetItemUuid: 'Actor.a1.Item.i1', stackBefore: 3 };
  const withSource = (count, marker) =>
    Object.assign(makeItem('i1'), {
      _source: { system: { count: { value: count } }, flags: { fabricate: { companionEffect: marker } } },
    });

  it('answers applied only for the marker AND the intended value', () => {
    assert.deepEqual(
      probeComponentAward({ intent, marker: MARKER, quantity: 2, documents: [withSource(5, MARKER)] }),
      { status: 'applied', receipt: { itemUuid: 'Actor.a1.Item.i1', placed: 2, stacked: true } }
    );
  });

  it('answers uncertain, never unapplied, for a missing value or an overwritten marker', () => {
    const other = { ...MARKER, operationId: 'op-2' };
    for (const document of [withSource(3, MARKER), withSource(5, other), withSource(5, undefined)]) {
      assert.deepEqual(
        probeComponentAward({ intent, marker: MARKER, quantity: 2, documents: [document] }),
        { status: 'uncertain', receipt: null }
      );
    }
  });
});

// Knowledge grant

const LEARNED = 'learnedRecipes';

function makeKnowledgeActor(learned = {}, { write } = {}) {
  const actor = {
    learned,
    writes: [],
    _source: { flags: { fabricate: { fabricate: { [LEARNED]: learned } } } },
  };
  const seams = {
    readFlag: (target, key, fallback) => (key === LEARNED ? target.learned : fallback),
    writeFlag: async (target, key, value) => {
      target.writes.push({ key, value });
      if (write) return write(value, target);
      target.learned = value;
      target._source.flags.fabricate.fabricate[LEARNED] = value;
      return target;
    },
  };
  return { actor, seams };
}

describe('grantRecipeKnowledgeEntry', () => {
  it('is applied with no write and a null intent when already known', async () => {
    const known = { r1: { learnedAt: 1, sourceItemUuid: null } };
    const { actor, seams } = makeKnowledgeActor(known);
    assert.equal(isRecipeKnown(actor, 'r1', seams.readFlag), true);
    assert.deepEqual(await grantRecipeKnowledgeEntry({ actor, recipeId: 'r1' }, seams), {
      status: 'applied',
      intent: null,
      receipt: { result: 'alreadyKnown' },
      failure: null,
    });
    assert.equal(actor.writes.length, 0);
  });

  it('is applied only when the learned entry is in the returned _source', async () => {
    const { actor, seams } = makeKnowledgeActor();
    const answer = await grantRecipeKnowledgeEntry(
      { actor, recipeId: 'r1', grantedBy: 'Quest' },
      seams
    );
    assert.deepEqual(answer, {
      status: 'applied',
      intent: { recipeId: 'r1', grantedBy: 'Quest' },
      receipt: { result: 'granted' },
      failure: null,
    });
    assert.equal(actor.writes[0].value.r1.granted, true);
  });

  it('is knownFailure for no answer, and uncertain for a throw or a missing entry', async () => {
    const refused = makeKnowledgeActor({}, { write: () => undefined });
    assert.equal(
      (await grantRecipeKnowledgeEntry({ actor: refused.actor, recipeId: 'r1' }, refused.seams))
        .status,
      'knownFailure'
    );

    const thrown = makeKnowledgeActor(
      {},
      {
        write: () => {
          throw new Error('rejected');
        },
      }
    );
    const threw = await grantRecipeKnowledgeEntry(
      { actor: thrown.actor, recipeId: 'r1' },
      thrown.seams
    );
    assert.equal(threw.status, 'uncertain');
    assert.equal(threw.failure.reason, 'writeThrew');

    const stripped = makeKnowledgeActor({}, { write: (_value, target) => target });
    assert.equal(
      (await grantRecipeKnowledgeEntry({ actor: stripped.actor, recipeId: 'r1' }, stripped.seams))
        .status,
      'uncertain'
    );
  });

  it('probes applied only for granted: true and the intended grantedBy', () => {
    const entry = { learnedAt: 1, sourceItemUuid: null, granted: true, grantedBy: 'Quest' };
    const { actor } = makeKnowledgeActor({ r1: entry });
    assert.equal(probeRecipeKnowledgeGrant(actor, { recipeId: 'r1', grantedBy: 'Quest' }).status, 'applied');
    assert.equal(probeRecipeKnowledgeGrant(actor, { recipeId: 'r1', grantedBy: 'GM' }).status, 'uncertain');
    const crafted = makeKnowledgeActor({ r1: { learnedAt: 1, sourceItemUuid: 'Item.x' } });
    assert.equal(
      probeRecipeKnowledgeGrant(crafted.actor, { recipeId: 'r1', grantedBy: null }).status,
      'uncertain'
    );
  });
});

// Currency

const LADDER = [
  {
    id: 'gp',
    label: 'Gold',
    abbreviation: 'gp',
    actorPath: 'system.currency.gp',
    contains: [{ unitId: 'cp', amount: 100 }],
  },
  { id: 'cp', label: 'Copper', abbreviation: 'cp', actorPath: 'system.currency.cp', contains: [] },
];

describe('currencyStrategyReplayClass', () => {
  it('maps each spend strategy to how its credit can be proven', () => {
    assert.equal(currencyStrategyReplayClass('actorProperty'), 'structuredMarker');
    assert.equal(currencyStrategyReplayClass('actorInventory'), 'structuredObserved');
    assert.equal(currencyStrategyReplayClass('macro'), 'opaqueMacro');
    assert.equal(currencyStrategyReplayClass('toString'), null);
  });
});

describe('ActorPropertyCoinSpender#refund with a marker', () => {
  const profile = { units: LADDER };
  const unit = { id: 'gp' };
  const markerUpdate = { 'flags.fabricate.==companionEffect': MARKER };
  function makeCoinActor(gp = 1) {
    const actor = {
      system: { currency: { gp } },
      updates: [],
      async update(payload) {
        actor.updates.push(payload);
        return actor;
      },
    };
    return actor;
  }

  it('merges the marker into the one value update and returns the document', async () => {
    const actor = makeCoinActor(1);
    const result = await new ActorPropertyCoinSpender().refund(
      actor,
      { unit, amount: 3 },
      { profile, markerUpdate }
    );
    assert.deepEqual(actor.updates, [{ 'system.currency.gp': 4, ...markerUpdate }]);
    assert.equal(result.valid, true);
    assert.deepEqual(result.updates, { 'system.currency.gp': 4 });
    assert.equal(result.document, actor);
  });

  it('omits the marker and answers wroteNothing for an empty refund', async () => {
    const actor = makeCoinActor(1);
    const result = await new ActorPropertyCoinSpender().refund(
      actor,
      { unit, amount: 0 },
      { profile, markerUpdate }
    );
    assert.equal(actor.updates.length, 0);
    assert.equal(result.valid, false);
    assert.equal(result.wroteNothing, true);
  });

  it('keeps the legacy answer shape without a marker', async () => {
    const actor = makeCoinActor(1);
    const result = await new ActorPropertyCoinSpender().refund(actor, { unit, amount: 3 }, { profile });
    assert.deepEqual(actor.updates, [{ 'system.currency.gp': 4 }]);
    assert.deepEqual(Object.keys(result).sort(), ['formatted', 'valid']);
  });
});

const MACROS = { canAfford: 'Macro.afford', decrement: 'Macro.dec', increment: 'Macro.inc' };

describe('prepareWorldCurrencyCredit', () => {
  const coinActor = { id: 'a1', name: 'Bearer', update: () => assert.fail('prepare never writes') };
  const seams = (spendStrategy = 'actorProperty') => ({
    getCurrencyConfig: () => ({ spendStrategy, units: LADDER, macros: MACROS }),
    resolveActor: (id) => (id === 'a1' ? coinActor : null),
    actorPropertyCoinSpender: new ActorPropertyCoinSpender(),
  });

  it('resolves 3 gp at base 100 to creditedBase 300 without writing', () => {
    const prepared = prepareWorldCurrencyCredit({ actorId: 'a1', unitId: 'gp', amount: 3 }, seams());
    assert.equal(prepared.outcome, null);
    assert.equal(prepared.actor, coinActor);
    assert.equal(prepared.unit.id, 'gp');
    assert.equal(prepared.baseValue, 100);
    assert.equal(prepared.creditedBase, 300);
    assert.equal(prepared.strategy, 'actorProperty');
    assert.equal(typeof prepared.spender.refund, 'function');
    assert.equal(prepared.ctx.macroContext.actor, coinActor);
  });

  it('names the macro strategy, and refuses an unresolved actor or a bad amount', () => {
    const macro = prepareWorldCurrencyCredit({ actorId: 'a1', unitId: 'gp', amount: 3 }, seams('macro'));
    assert.equal(currencyStrategyReplayClass(macro.strategy), 'opaqueMacro');
    assert.equal(
      prepareWorldCurrencyCredit({ actorId: 'nobody', unitId: 'gp', amount: 3 }, seams()).outcome,
      COMPANION_OUTCOMES.noActor
    );
    assert.equal(
      prepareWorldCurrencyCredit({ actorId: 'a1', unitId: 'gp', amount: 2.5 }, seams()).outcome,
      COMPANION_OUTCOMES.invalidAmount
    );
  });
});
