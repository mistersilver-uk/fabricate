/**
 * The companion reward effect executor (issue 1954) under fault injection: the real operation
 * store over a Foundry-shaped ledger, the real run and companion authorities where the claim
 * matters, and world actors whose writes land on `_source`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ActorPropertyCoinSpender } from '../src/systems/CoinSpenders.js';
import { createCompanionOperationEffectExecutor } from '../src/systems/companionOperationEffects.js';
import { createCompanionOperationStore } from '../src/systems/companionOperationStore.js';
import {
  CLAIM,
  OPERATION_ID,
  giveItem,
  makeWorldActor,
  rewardPlan,
  rewardWorld,
} from './helpers/companionRewardWorld.js';

const SYSTEM = Object.freeze({ id: 'sys-1', name: 'Test System' });
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
const MACROS = { canAfford: 'Macro.afford', decrement: 'Macro.dec', increment: 'Macro.inc' };
const LEARNED = 'learnedRecipes';

function seamsFor(actors, overrides = {}) {
  const byId = new Map(actors.map((actor) => [actor.id, actor]));
  return {
    resolveActor: (id) => byId.get(id) ?? null,
    resolveSystem: (id) => (id === SYSTEM.id ? SYSTEM : null),
    resolveComponent: (_system, id) => ({ id, name: id, registeredItemUuid: null }),
    findComponentItems: async (actor, component) =>
      actor.items.filter((item) => item.name === component.name),
    resolveSourceItem: async () => null,
    resolveRecipe: (id) => (id.startsWith('recipe') ? { id } : null),
    resolveRecipeSystem: () => SYSTEM,
    isKnowledgeObservable: (system) => system === SYSTEM,
    readFlag: (actor, key, fallback) => actor._source.flags.fabricate?.fabricate?.[key] ?? fallback,
    writeFlag: (actor, key, value) => actor.update({ [`flags.fabricate.fabricate.${key}`]: value }),
    getCurrencyConfig: () => ({ spendStrategy: 'actorProperty', units: LADDER, macros: MACROS }),
    actorPropertyCoinSpender: new ActorPropertyCoinSpender(),
    ...overrides,
  };
}

const award = (effectId, recipients, requires = []) => [
  effectId,
  'componentAward',
  {
    systemId: SYSTEM.id,
    recipients: recipients.map(([actorId, awards]) => ({
      actorId,
      awards: awards.map(([componentId, quantity]) => ({ componentId, quantity })),
    })),
  },
  requires,
];

const credit = (effectId, recipients, unitId = 'gp') => [
  effectId,
  'currencyCredit',
  { unitId, recipients: recipients.map(([actorId, amount]) => ({ actorId, amount })) },
];

const grant = (effectId, recipients, grantedBy = 'Quest') => [
  effectId,
  'recipeKnowledgeGrant',
  { grantedBy, recipients: recipients.map(([actorId, recipeIds]) => ({ actorId, recipeIds })) },
];

async function accept(world, effects, decisions = []) {
  const plan = rewardPlan(effects, decisions);
  const accepted = await world.store().accept({ operationId: OPERATION_ID, plan });
  assert.equal(accepted.status, 'accepted');
  return plan;
}

/** Run the executor directly over the stored record, under a claim `held(call)` decides. */
async function run(world, seams, held = () => true) {
  const executor = createCompanionOperationEffectExecutor({ ...seams, clock: world.clock });
  const stored = await world.store().read(OPERATION_ID);
  const claim = world.heldClaim(held);
  const summary = await executor({ record: stored.record, heldClaim: claim });
  return { summary, claim, executor };
}

const evidence = (world, index = 0) => world.record().effectStates[index].evidence;
const phases = (world, index = 0) => evidence(world, index).subwrites.map(({ phase }) => phase);
const quantities = (actor) => actor.items.map((item) => [item.name, item._source.system.quantity]);

/** The record a ledger update writes, by its forced-replacement key. */
function recordIn(update) {
  return Object.entries(update).find(([key]) => key.endsWith('companionOperationRecord'))?.[1];
}

const subwriteOf = (record, subwriteId, index = 0) =>
  record?.effectStates[index].evidence?.subwrites.find((entry) => entry.subwriteId === subwriteId);

describe('scenario 1: before the write', () => {
  for (const [label, fault] of [
    [
      'rejected',
      () => {
        throw new Error('socket closed');
      },
    ],
    ['ambiguous', () => []],
  ]) {
    it(`writes nothing on an ${label} applying write, and the retry applies exactly once`, async () => {
      const hero = makeWorldActor('hero');
      const world = rewardWorld();
      const seams = seamsFor([hero]);
      await accept(world, [award('e0', [['hero', [['iron', 2]]]])]);
      world.hooks.beforeUpdate = fault;

      const first = await run(world, seams);
      assert.deepEqual(first.summary, {
        status: 'stopped',
        reason: 'unavailable',
        effectId: 'e0',
        subwriteId: 'r0.a0',
        recoveryRequired: false,
      });
      assert.equal(hero.createCalls.length, 0);
      assert.equal(world.record().state, 'accepted', 'the reread shows it still pending');

      world.hooks.beforeUpdate = null;
      const second = await run(world, seams);
      assert.equal(second.summary.status, 'completed');
      assert.equal(hero.createCalls.length, 1);
      assert.deepEqual(quantities(hero), [['iron', 2]]);
      assert.equal(world.record().state, 'completed');
      assert.deepEqual(world.record().outcome.effects[0].subwrites, [
        {
          subwriteId: 'r0.a0',
          receipt: { itemUuid: hero.items[0].uuid, placed: 2, stacked: false },
        },
      ]);
    });
  }
});

describe('scenario 2: the claim is lost', () => {
  it('after the intent is saved: no write, the subwrite stays applying, recovery required', async () => {
    const hero = makeWorldActor('hero');
    const world = rewardWorld();
    const executor = createCompanionOperationEffectExecutor({
      ...seamsFor([hero]),
      clock: world.clock,
    });
    const plan = rewardPlan([award('e0', [['hero', [['iron', 2]]]])]);
    world.hooks.afterUpdate = (_update, record) => {
      if (subwriteOf(record, 'r0.a0')?.phase === 'applying') world.elect('gm2');
    };
    const { companion } = world.realm('gm', { executor });
    const result = await companion.submit({ operationId: OPERATION_ID, plan });

    assert.equal(result.recoveryRequired, true);
    assert.equal(result.reason, 'claimLost');
    assert.equal(hero.createCalls.length, 0, 'no write without the claim');
    assert.equal(subwriteOf(world.record(), 'r0.a0').phase, 'applying');
    assert.equal(world.requests()[0].status, 'recoveryRequired');
  });

  it('before the intent: the subwrite stays pending and a later run resumes it', async () => {
    const hero = makeWorldActor('hero');
    const world = rewardWorld();
    const real = createCompanionOperationEffectExecutor({
      ...seamsFor([hero]),
      clock: world.clock,
    });
    let lose = true;
    const executor = async (args) => {
      if (lose) world.elect('gm2');
      lose = false;
      return real(args);
    };
    const plan = rewardPlan([award('e0', [['hero', [['iron', 2]]]])]);
    const { companion } = world.realm('gm', { executor });
    const first = await companion.submit({ operationId: OPERATION_ID, plan });
    assert.equal(first.continued, true);
    assert.equal(first.recoveryRequired, undefined);
    assert.equal(world.record().state, 'accepted');
    assert.equal(world.record().revision, 0, 'no intent was persisted');
    assert.equal(hero.createCalls.length, 0);
    assert.equal(world.requests()[0].status, 'settled');

    world.elect('gm');
    const second = await companion.submit({ operationId: OPERATION_ID, plan });
    assert.equal(second.record.state, 'completed');
    assert.deepEqual(quantities(hero), [['iron', 2]]);
  });
});

describe('scenario 3: after the write, before the receipt', () => {
  const failReceipt = (world) => {
    world.hooks.beforeUpdate = (update) => {
      const next = recordIn(update);
      const settled = next?.effectStates[0].evidence?.subwrites.some(
        ({ phase }) => phase !== 'pending' && phase !== 'applying'
      );
      if (settled) throw new Error('socket closed');
    };
  };

  it('releases the claim, and a resubmit rereads the record and never reaches the executor', async () => {
    const hero = makeWorldActor('hero');
    const world = rewardWorld();
    const real = createCompanionOperationEffectExecutor({
      ...seamsFor([hero]),
      clock: world.clock,
    });
    const ran = [];
    const executor = async (args) => {
      ran.push(args.record.revision);
      return real(args);
    };
    const reads = [];
    const createStore = (deps) => {
      const store = createCompanionOperationStore(deps);
      return {
        accept: (submission) => store.accept(submission),
        read: (id) => (reads.push(id), store.read(id)),
      };
    };
    const plan = rewardPlan([award('e0', [['hero', [['iron', 2]]]])]);
    failReceipt(world);
    const { companion } = world.realm('gm', { executor, createStore });

    const first = await companion.submit({ operationId: OPERATION_ID, plan });
    assert.equal(first.continued, true);
    assert.equal(first.recoveryRequired, undefined);
    assert.equal(world.pages.has(CLAIM), false, 'the claim is released');
    assert.equal(world.requests()[0].status, 'settled');
    assert.equal(subwriteOf(world.record(), 'r0.a0').phase, 'applying');
    assert.deepEqual(quantities(hero), [['iron', 2]]);

    world.hooks.beforeUpdate = null;
    reads.length = 0;
    const second = await companion.submit({ operationId: OPERATION_ID, plan });
    assert.equal(second.status, 'duplicate');
    assert.equal(second.continued, false, 'executable() refuses the in-flight record');
    assert.deepEqual(reads, [OPERATION_ID], 'the resubmit reached store.read');
    assert.equal(ran.length, 1, 'the executor never ran again');
    assert.deepEqual(quantities(hero), [['iron', 2]], 'the world count stays exact');

    const probe = await real.probe({ record: world.record(), effectId: 'e0', subwriteId: 'r0.a0' });
    assert.deepEqual(probe, {
      status: 'applied',
      receipt: { itemUuid: hero.items[0].uuid, placed: 2, stacked: false },
    });
  });

  const inventory = (delta) => {
    const spender = {
      balance: 100,
      readCoins: () => ({ valid: true, copperValue: spender.balance }),
      check: () => ({ valid: true }),
      refund: async () => {
        spender.balance += delta;
        return { valid: true };
      },
    };
    return spender;
  };
  const macroSeams = (runMacro) => ({
    getCurrencyConfig: () => ({ spendStrategy: 'macro', units: LADDER, macros: MACROS }),
    resolveMacro: async () => ({ type: 'script', command: 'return true;' }),
    runMacro,
  });

  for (const [label, effect, overrides, expected] of [
    ['an actorProperty credit', credit('e0', [['hero', 3]]), {}, 'applied'],
    ['a knowledge grant', grant('e0', [['hero', ['recipe-a']]]), {}, 'applied'],
    [
      'an actorInventory credit',
      credit('e0', [['hero', 3]]),
      {
        getCurrencyConfig: () => ({ spendStrategy: 'actorInventory', units: LADDER }),
        actorInventoryCoinSpender: inventory(300),
      },
      'uncertain',
    ],
    ['a macro credit', credit('e0', [['hero', 3]]), macroSeams(async () => true), 'uncertain'],
  ]) {
    it(`probes ${label} as ${expected}`, async () => {
      const hero = makeWorldActor('hero', { system: { currency: { gp: 1, cp: 0 } } });
      const world = rewardWorld();
      await accept(world, [effect]);
      failReceipt(world);
      const { summary, executor } = await run(world, seamsFor([hero], overrides));
      assert.equal(summary.reason, 'receiptUnrecorded');
      assert.deepEqual(phases(world), ['applying']);
      const { subwriteId } = evidence(world).subwrites[0];
      const probe = await executor.probe({ record: world.record(), effectId: 'e0', subwriteId });
      assert.equal(probe.status, expected);
    });
  }
});

describe('scenario 4: a partial award', () => {
  const setup = () => {
    let creates = 0;
    const hero = makeWorldActor('hero', {
      hooks: { create: () => (++creates === 2 ? [] : undefined) },
    });
    const ally = makeWorldActor('ally');
    const world = rewardWorld();
    const effect = award('e0', [
      [
        'hero',
        [
          ['iron', 2],
          ['hide', 3],
          ['bone', 4],
        ],
      ],
      ['ally', [['iron', 1]]],
    ]);
    return { hero, ally, world, seams: seamsFor([hero, ally]), effect };
  };

  it('applies a0 and a2, fails a1, and leaves the record pending mid-run', async () => {
    const { hero, ally, world, seams, effect } = setup();
    await accept(world, [effect]);
    const midRun = [];
    world.hooks.afterUpdate = (_update, record) => {
      if (subwriteOf(record, 'r0.a1')?.phase === 'knownFailure' && midRun.length === 0) {
        midRun.push(record.state);
      }
    };
    const { summary } = await run(world, seams);

    assert.deepEqual(midRun, ['pending']);
    assert.equal(summary.reason, 'effectNotApplied');
    assert.deepEqual(phases(world), ['applied', 'knownFailure', 'applied', 'applied']);
    assert.deepEqual(subwriteOf(world.record(), 'r0.a1').failure, {
      reason: 'writeRefused',
      detail: null,
    });
    assert.equal(world.record().effectStates[0].phase, 'knownFailure');
    assert.equal(world.record().state, 'failed');
    assert.deepEqual(quantities(hero), [
      ['iron', 2],
      ['bone', 4],
    ]);
    assert.deepEqual(quantities(ally), [['iron', 1]]);
  });

  it('resumes only a2 after a crash between a1 and a2', async () => {
    const { hero, world, seams, effect } = setup();
    await accept(world, [effect]);
    // Claim checks: a0 start and after intent, a1 start and after intent, then a2's start.
    const crashed = await run(world, seams, (call) => call < 5);
    assert.equal(crashed.summary.reason, 'claimLost');
    assert.equal(crashed.summary.subwriteId, 'r0.a2');
    assert.equal(crashed.summary.recoveryRequired, false);
    assert.deepEqual(phases(world), ['applied', 'knownFailure', 'pending', 'pending']);
    assert.equal(world.record().state, 'pending');

    await run(world, seams);
    assert.deepEqual(phases(world), ['applied', 'knownFailure', 'applied', 'applied']);
    assert.equal(world.record().state, 'failed');
    assert.equal(hero.createCalls.length, 3, 'a0 and a1 are never attempted again');
    assert.deepEqual(quantities(hero), [
      ['iron', 2],
      ['bone', 4],
    ]);
  });
});

describe('scenario 5: after the receipt', () => {
  it('resumes only pending subwrites, stacking a1 onto the item a0 created', async () => {
    const hero = makeWorldActor('hero');
    const world = rewardWorld();
    const seams = seamsFor([hero], { findComponentItems: async () => [] });
    await accept(world, [
      award('e0', [
        [
          'hero',
          [
            ['iron', 2],
            ['iron', 3],
          ],
        ],
      ]),
    ]);
    const crashed = await run(world, seams, (call) => call < 3);
    assert.equal(crashed.summary.reason, 'claimLost');
    assert.deepEqual(phases(world), ['applied', 'pending']);

    const resumed = await run(world, seams);
    assert.equal(resumed.summary.status, 'completed');
    assert.equal(hero.createCalls.length, 1);
    assert.deepEqual(quantities(hero), [['iron', 5]]);
    const [a0, a1] = evidence(world).subwrites;
    assert.equal(a1.receipt.itemUuid, a0.receipt.itemUuid);
    assert.equal(a1.receipt.stacked, true);
    assert.deepEqual(a1.intent, { mode: 'stack', targetItemUuid: a0.receipt.itemUuid, stackBefore: 2 });
  });

  it('holds the claim before completing, and a later run completes without rewriting', async () => {
    const hero = makeWorldActor('hero');
    const world = rewardWorld();
    const seams = seamsFor([hero]);
    await accept(world, [award('e0', [['hero', [['iron', 2]]]])]);
    const lost = await run(world, seams, (call) => call < 3);
    assert.equal(lost.summary.reason, 'claimLost');
    assert.equal(world.record().state, 'pending');
    assert.equal(world.record().effectStates[0].phase, 'applied');

    const resumed = await run(world, seams);
    assert.equal(resumed.summary.status, 'completed');
    assert.equal(world.record().state, 'completed');
    assert.equal(hero.createCalls.length, 1);
  });
});

describe('scenario 6: currency', () => {
  const coinHero = (hooks) =>
    makeWorldActor('hero', { system: { currency: { gp: 1, cp: 0 } }, hooks });
  const marker = { operationId: OPERATION_ID, effectId: 'e0', subwriteId: 'r0' };

  it('credits 3 gp at base 100 as creditedBase 300, with the marker in the one update', async () => {
    const hero = coinHero();
    const world = rewardWorld();
    await accept(world, [credit('e0', [['hero', 3]])]);
    const { summary } = await run(world, seamsFor([hero]));

    assert.equal(summary.status, 'completed');
    const [subwrite] = evidence(world).subwrites;
    assert.equal(evidence(world).replayClass, 'structuredMarker');
    assert.deepEqual(subwrite.target, { actorUuid: 'Actor.hero' });
    assert.deepEqual(subwrite.intent, {
      amount: 3,
      baseValue: 100,
      creditedBase: 300,
      postValues: [{ path: 'system.currency.gp', value: 4 }],
      strategy: 'actorProperty',
      unitId: 'gp',
    });
    assert.deepEqual(subwrite.receipt, { credited: 3, creditedBase: 300, observedDelta: null });
    assert.deepEqual(hero.updates, [
      { 'system.currency.gp': 4, 'flags.fabricate.==companionEffect': marker },
    ]);
    assert.deepEqual(hero._source.flags.fabricate.companionEffect, marker);
  });

  it('is not applied when the value path is stripped and only the marker lands', async () => {
    const hero = coinHero({ drop: ['system.currency.gp'] });
    const world = rewardWorld();
    await accept(world, [credit('e0', [['hero', 3]])]);
    const { summary } = await run(world, seamsFor([hero]));

    assert.equal(summary.reason, 'uncertain');
    assert.deepEqual(hero._source.flags.fabricate.companionEffect, marker);
    assert.equal(hero._source.system.currency.gp, 1);
    assert.deepEqual(phases(world), ['uncertain']);
    assert.equal(world.record().state, 'reviewRequired');
  });

  for (const [label, refund, phase, observedDelta] of [
    ['the exact delta', (spender) => (spender.balance += 300), 'applied', 300],
    ['a zero delta', () => {}, 'uncertain', null],
    ['a different delta', (spender) => (spender.balance += 200), 'uncertain', null],
  ]) {
    it(`judges an actorInventory credit by ${label}`, async () => {
      const hero = coinHero();
      const spender = {
        balance: 100,
        readCoins: () => ({ valid: true, copperValue: spender.balance }),
        check: () => ({ valid: true }),
        refund: async () => (refund(spender), { valid: true }),
      };
      const world = rewardWorld();
      await accept(world, [credit('e0', [['hero', 3]])]);
      await run(
        world,
        seamsFor([hero], {
          getCurrencyConfig: () => ({ spendStrategy: 'actorInventory', units: LADDER }),
          actorInventoryCoinSpender: spender,
        })
      );
      assert.equal(evidence(world).replayClass, 'structuredObserved');
      assert.deepEqual(phases(world), [phase]);
      assert.equal(evidence(world).subwrites[0].receipt?.observedDelta ?? null, observedDelta);
    });
  }

  it('fails an actorInventory credit that provably wrote nothing', async () => {
    const hero = coinHero();
    const world = rewardWorld();
    await accept(world, [credit('e0', [['hero', 3]])]);
    await run(
      world,
      seamsFor([hero], {
        getCurrencyConfig: () => ({ spendStrategy: 'actorInventory', units: LADDER }),
        actorInventoryCoinSpender: {
          readCoins: () => ({ valid: true, copperValue: 0 }),
          check: () => ({ valid: true }),
          refund: async () => ({ valid: false, wroteNothing: true, message: 'no adapter' }),
        },
      })
    );
    assert.deepEqual(phases(world), ['knownFailure']);
    assert.equal(world.record().state, 'failed');
  });

  for (const [label, runMacro, phase, state] of [
    ['a macro credit that succeeds', async () => true, 'applied', 'completed'],
    [
      'an interrupted macro credit',
      async () => {
        throw new Error('macro interrupted');
      },
      'uncertain',
      'reviewRequired',
    ],
  ]) {
    it(`classifies ${label} as opaqueMacro and settles it ${phase}`, async () => {
      const hero = coinHero();
      const world = rewardWorld();
      await accept(world, [credit('e0', [['hero', 3]])]);
      await run(
        world,
        seamsFor([hero], {
          getCurrencyConfig: () => ({ spendStrategy: 'macro', units: LADDER, macros: MACROS }),
          resolveMacro: async () => ({ type: 'script', command: 'return true;' }),
          runMacro,
        })
      );
      assert.equal(evidence(world).replayClass, 'opaqueMacro');
      assert.deepEqual(phases(world), [phase]);
      assert.equal(world.record().state, state);
    });
  }
});

describe('scenario 7: knowledge', () => {
  it('applies an already-known recipe with no write, and grants the other', async () => {
    const hero = makeWorldActor('hero');
    hero._source.flags.fabricate = {
      fabricate: { [LEARNED]: { 'recipe-a': { learnedAt: 1, sourceItemUuid: null } } },
    };
    const world = rewardWorld();
    await accept(world, [grant('e0', [['hero', ['recipe-a', 'recipe-b']]])]);
    const { summary } = await run(world, seamsFor([hero]));

    assert.equal(summary.status, 'completed');
    assert.equal(evidence(world).replayClass, 'idempotentKey');
    const [known, granted] = evidence(world).subwrites;
    assert.deepEqual(
      [known.intent, known.receipt, known.target],
      [null, { result: 'alreadyKnown' }, { actorUuid: 'Actor.hero', recipeId: 'recipe-a' }]
    );
    assert.deepEqual(granted.receipt, { result: 'granted' });
    assert.equal(hero.updates.length, 1, 'only the unknown recipe is written');
    assert.deepEqual(Object.keys(hero.updates[0]['flags.fabricate.fabricate.learnedRecipes']), [
      'recipe-a',
      'recipe-b',
    ]);
  });
});

describe('scenario 8: awaiting a decision', () => {
  it('stops in plan order at the effect waiting on a decision, unvalidated', async () => {
    const hero = makeWorldActor('hero');
    const world = rewardWorld();
    await accept(
      world,
      [
        award('e0', [['hero', [['iron', 2]]]]),
        ['e1', 'notAKind', {}, ['roll']],
        award('e2', [['hero', [['hide', 1]]]]),
      ],
      ['roll']
    );
    const { summary } = await run(world, seamsFor([hero]));

    assert.equal(summary.reason, 'awaitingDecision');
    assert.equal(summary.effectId, 'e1');
    assert.deepEqual(
      world.record().effectStates.map(({ phase }) => phase),
      ['applied', 'pending', 'pending']
    );
    assert.equal(world.record().state, 'awaitingDecision');
    assert.deepEqual(quantities(hero), [['iron', 2]]);
  });
});

describe('validation on reach', () => {
  const token = { ...makeWorldActor('token'), isToken: true };
  for (const [label, effect, reason] of [
    ['an unknown kind', ['e1', 'giveEverything', {}], 'unknownKind'],
    ['empty recipients', award('e1', []), 'noRecipients'],
    ['a recipient with no awards', award('e1', [['hero', []]]), 'emptyRecipient'],
    ['a knowledge recipient with no recipes', grant('e1', [['hero', []]]), 'emptyRecipient'],
    ['an unresolved actor', award('e1', [['nobody', [['iron', 1]]]]), 'actorNotFound'],
    ['a synthetic token actor', award('e1', [['token', [['iron', 1]]]]), 'actorNotFound'],
    ['an unresolved recipient of a credit', credit('e1', [['nobody', 3]]), 'noActor'],
    ['an unknown recipe', grant('e1', [['hero', ['spell-x']]]), 'recipeNotFound'],
  ]) {
    it(`fails the effect whole for ${label}, before any write, and stops`, async () => {
      const hero = makeWorldActor('hero');
      const world = rewardWorld();
      await accept(world, [
        award('e0', [['hero', [['iron', 2]]]]),
        effect,
        award('e2', [['hero', [['hide', 1]]]]),
      ]);
      const { summary } = await run(world, seamsFor([hero, token]));

      assert.equal(summary.reason, 'effectFailed');
      const [first, failed, untouched] = world.record().effectStates;
      assert.equal(first.phase, 'applied');
      assert.equal(failed.phase, 'knownFailure');
      assert.equal(failed.evidence.failure.reason, reason);
      assert.deepEqual(failed.evidence.subwrites, []);
      assert.equal(untouched.phase, 'pending');
      assert.equal(world.record().state, 'failed');
      assert.deepEqual(quantities(hero), [['iron', 2]]);
    });
  }

  it('holds the claim before an effect failure', async () => {
    const world = rewardWorld();
    await accept(world, [award('e0', [])]);
    const { summary } = await run(world, seamsFor([]), () => false);
    assert.equal(summary.reason, 'claimLost');
    assert.equal(world.record().state, 'accepted');
  });

  it('refuses a token actor in a currency credit', async () => {
    const world = rewardWorld();
    const tokenCoins = { ...token, _source: { system: { currency: { gp: 0, cp: 0 } }, flags: {} } };
    await accept(world, [credit('e0', [['token', 3]])]);
    await run(world, seamsFor([{ ...tokenCoins, system: tokenCoins._source.system }]));
    assert.equal(world.record().effectStates[0].evidence.failure.reason, 'actorNotFound');
  });

  it('stacks onto an item the actor already carries', async () => {
    const hero = makeWorldActor('hero');
    const stale = { operationId: 'ZzZzZzZzZzZzZz99', effectId: 'old', subwriteId: 'r9', extra: 1 };
    const held = giveItem(hero, {
      name: 'iron',
      system: { quantity: 4 },
      flags: { fabricate: { companionEffect: stale } },
    });
    const world = rewardWorld();
    await accept(world, [award('e0', [['hero', [['iron', 2]]]])]);
    await run(world, seamsFor([hero]));
    assert.deepEqual(quantities(hero), [['iron', 6]]);
    assert.equal(evidence(world).subwrites[0].intent.stackBefore, 4);
    // Forced replacement drops the stale marker's extra key, as Foundry does.
    assert.deepEqual(held._source.flags.fabricate.companionEffect, {
      operationId: OPERATION_ID,
      effectId: 'e0',
      subwriteId: 'r0.a0',
    });
  });
});

describe('plan throws, plan drift and pre-flight refusals', () => {
  const throwing = () => {
    throw new Error('world seam broke');
  };
  const twoIron = () =>
    award('e0', [
      [
        'hero',
        [
          ['iron', 2],
          ['iron', 3],
        ],
      ],
    ]);

  it('fails a pending effect planThrew when a world seam throws, and never throws', async () => {
    const hero = makeWorldActor('hero');
    const world = rewardWorld();
    await accept(world, [award('e0', [['hero', [['iron', 2]]]])]);
    const { summary } = await run(world, seamsFor([hero], { resolveActor: throwing }));

    assert.equal(summary.reason, 'effectFailed');
    assert.deepEqual(evidence(world).failure, { reason: 'planThrew', detail: 'world seam broke' });
    assert.equal(world.record().state, 'failed');
    assert.equal(hero.createCalls.length, 0);
  });

  it('stops a resumed effect whose plan throws without settling anything', async () => {
    const hero = makeWorldActor('hero');
    const world = rewardWorld();
    const seams = seamsFor([hero], { findComponentItems: async () => [] });
    await accept(world, [twoIron()]);
    await run(world, seams, (call) => call < 3);
    const before = world.record();
    assert.deepEqual(phases(world), ['applied', 'pending']);

    const { summary } = await run(world, { ...seams, resolveActor: throwing });
    assert.equal(summary.status, 'stopped');
    assert.equal(summary.reason, 'planThrew');
    assert.deepEqual(world.record(), before, 'no store write');
    assert.equal(hero.createCalls.length, 1);
  });

  it('settles a knowledge grant knownFailure when the learned-map read throws', async () => {
    const hero = makeWorldActor('hero');
    const world = rewardWorld();
    await accept(world, [grant('e0', [['hero', ['recipe-a']]])]);
    const { summary } = await run(world, seamsFor([hero], { readFlag: throwing }));

    assert.equal(summary.reason, 'effectNotApplied');
    const [subwrite] = evidence(world).subwrites;
    assert.equal(subwrite.phase, 'knownFailure');
    assert.deepEqual(subwrite.failure, { reason: 'preflightThrew', detail: 'world seam broke' });
    assert.equal(hero.updates.length, 0);
  });

  it('fails pending credit subwrites planChanged when the strategy moves to macro', async () => {
    const hero = makeWorldActor('hero', { system: { currency: { gp: 1, cp: 0 } } });
    const ally = makeWorldActor('ally', { system: { currency: { gp: 0, cp: 0 } } });
    const world = rewardWorld();
    await accept(world, [
      credit('e0', [
        ['hero', 3],
        ['ally', 2],
      ]),
    ]);
    // Claim checks: r0 start and after intent, then r1's start, where the run crashes.
    const crashed = await run(world, seamsFor([hero, ally]), (call) => call < 3);
    assert.equal(crashed.summary.reason, 'claimLost');
    assert.deepEqual(phases(world), ['applied', 'pending']);

    const macroRuns = [];
    const resumed = await run(
      world,
      seamsFor([hero, ally], {
        getCurrencyConfig: () => ({ spendStrategy: 'macro', units: LADDER, macros: MACROS }),
        resolveMacro: async () => ({ type: 'script', command: 'return true;' }),
        runMacro: async (...args) => (macroRuns.push(args), true),
      })
    );
    assert.equal(resumed.summary.reason, 'effectNotApplied');
    assert.deepEqual(phases(world), ['applied', 'knownFailure']);
    assert.deepEqual(evidence(world).subwrites[1].failure, {
      reason: 'planChanged',
      detail: 'replayClass',
    });
    assert.equal(macroRuns.length, 0, 'the macro never ran');
    assert.equal(ally._source.system.currency.gp, 0);
    assert.equal(world.record().state, 'failed');
  });

  it('fails pending subwrites planChanged when the recipient resolves to another actor', async () => {
    const hero = makeWorldActor('hero');
    const impostor = makeWorldActor('impostor');
    const world = rewardWorld();
    const seams = seamsFor([hero], { findComponentItems: async () => [] });
    await accept(world, [twoIron()]);
    await run(world, seams, (call) => call < 3);

    await run(world, { ...seams, resolveActor: () => impostor });
    assert.deepEqual(phases(world), ['applied', 'knownFailure']);
    assert.deepEqual(evidence(world).subwrites[1].failure, {
      reason: 'planChanged',
      detail: 'target',
    });
    assert.equal(impostor.createCalls.length, 0);
    assert.equal(hero.createCalls.length, 1);
  });

  for (const [label, overrides, reason] of [
    ['an unresolved recipe system', { resolveRecipeSystem: () => null }, 'systemNotFound'],
    ['an unobservable system', { isKnowledgeObservable: () => false }, 'knowledgeNotObservable'],
  ]) {
    it(`refuses a knowledge grant for ${label} before any write`, async () => {
      const hero = makeWorldActor('hero');
      const world = rewardWorld();
      await accept(world, [grant('e0', [['hero', ['recipe-a']]])]);
      const { summary } = await run(world, seamsFor([hero], overrides));

      assert.equal(summary.reason, 'effectFailed');
      assert.deepEqual(evidence(world).failure, { reason, detail: 'recipe-a' });
      assert.equal(hero.updates.length, 0);
    });
  }

  it('fails an actorProperty credit whose _source lacks the value path, writing nothing', async () => {
    const hero = makeWorldActor('hero', { system: { currency: { gp: 1, cp: 0 } } });
    Object.defineProperty(hero, 'system', { value: { currency: { gp: 1, cp: 0 } } });
    delete hero._source.system.currency;
    const world = rewardWorld();
    await accept(world, [credit('e0', [['hero', 3]])]);
    await run(world, seamsFor([hero]));

    const [subwrite] = evidence(world).subwrites;
    assert.equal(subwrite.phase, 'knownFailure');
    assert.equal(subwrite.failure.reason, 'currencySourceMissing');
    assert.equal(hero.updates.length, 0);
  });
});

describe('in-flight evidence and single-slot markers', () => {
  const failReceipt = (world) => {
    world.hooks.beforeUpdate = (update) => {
      const phase = recordIn(update)?.effectStates[0].evidence?.subwrites[0].phase;
      if (phase !== 'pending' && phase !== 'applying') throw new Error('socket closed');
    };
  };

  it('stops on a record with an applying subwrite, with no adapter or store write', async () => {
    const hero = makeWorldActor('hero');
    const world = rewardWorld();
    const seams = seamsFor([hero]);
    await accept(world, [award('e0', [['hero', [['iron', 2]]]])]);
    failReceipt(world);
    await run(world, seams);
    assert.deepEqual(phases(world), ['applying']);

    const writes = [];
    world.hooks.beforeUpdate = (update) => void writes.push(update);
    const before = world.record();
    const { summary, claim } = await run(world, seams);
    assert.equal(summary.status, 'stopped');
    assert.equal(summary.reason, 'effectNotApplied');
    assert.deepEqual(writes, []);
    assert.deepEqual(claim.calls, [], 'not even a claim check');
    assert.equal(hero.createCalls.length, 1, 'the one earlier write only');
    assert.deepEqual(world.record(), before);
  });

  it("probes a credit uncertain once another operation's marker overwrites the slot", async () => {
    const hero = makeWorldActor('hero', { system: { currency: { gp: 1, cp: 0 } } });
    const world = rewardWorld();
    await accept(world, [credit('e0', [['hero', 3]])]);
    failReceipt(world);
    const { executor } = await run(world, seamsFor([hero]));
    const where = { record: world.record(), effectId: 'e0', subwriteId: 'r0' };
    assert.equal((await executor.probe(where)).status, 'applied');

    const other = { operationId: 'ZzZzZzZzZzZzZz99', effectId: 'e0', subwriteId: 'r0' };
    hero._source.flags.fabricate.companionEffect = other;
    assert.equal(hero._source.system.currency.gp, 4, 'the post-value still matches');
    assert.deepEqual(await executor.probe(where), { status: 'uncertain', receipt: null });
  });
});
