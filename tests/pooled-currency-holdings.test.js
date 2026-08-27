/**
 * The POOLED currency balance and debit (issue 1342, Phase 2).
 *
 * The claims worth a suite of their own are the three where a plausible implementation is quietly
 * wrong about somebody else's money:
 *
 *   1. **A pool with an unreadable member is UNREADABLE, not partial.** Summing only the actors
 *      that answered produces a number that is always too small and looks authoritative, so a gate
 *      built on it refuses parties that can pay — and a debit built on it moves the whole cost onto
 *      whichever actors Fabricate happened to see.
 *   2. **The debit is denominated in the TERMINAL BASE UNIT.** `aggregateCurrencySpends` rounds a
 *      requirement UP into a representative denomination so a single payer is never under-charged;
 *      the same rounding applied per payer over-charges the POOL by up to `baseValue - 1` each. The
 *      numeric case below is the one that can tell the two rules apart.
 *   3. **Nothing is taken that cannot be given back.** A `macro` world's `increment` macro is
 *      optional, so such a world can be perfectly valid and still have published no way to refund;
 *      the debit refuses it before it reads, let alone writes.
 *
 * Every money assertion is on `totalCopper()` — the whole ladder branch in one denomination —
 * rather than on a single rung, because a base-unit debit legitimately breaks higher coins for
 * change and a per-rung expectation would fail for the right behaviour.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ActorPropertyCoinSpender } from '../src/systems/CoinSpenders.js';
import { COMPANION_OUTCOMES } from '../src/systems/companionContract.js';
import {
  CURRENCY_SPEND_CALLERS,
  consumePooledCurrency,
  readPooledCurrencyBalance,
} from '../src/systems/currencyAffordance.js';

import {
  POOLED_LADDER,
  POOLED_MACROS,
  PooledActorFake,
  makePooledSpenderSpy,
  pooledSeams,
} from './helpers/pooled-currency-fixtures.js';

/**
 * A `game` global, because `resolveCoinSpender` reads a BARE `game.fabricate?.…` on its accessor
 * fallbacks. Under Foundry the global always exists, so this models production rather than
 * papering over a defect.
 */
globalThis.game = globalThis.game ?? { fabricate: {} };

const read = (actors, seams, request = {}) =>
  readPooledCurrencyBalance(actors, { unitId: 'gp', ...request }, seams);

const consume = (actors, seams, request = {}) =>
  consumePooledCurrency(actors, { unitId: 'gp', amount: 1, ...request }, seams);

describe('readPooledCurrencyBalance', () => {
  it('sums what every actor holds across the whole ladder branch', async () => {
    const party = [
      new PooledActorFake('Idrin', { gp: 1 }),
      new PooledActorFake('Sera', { sp: 5 }),
      new PooledActorFake('Bram', { cp: 30 }),
    ];

    const result = await read(party, pooledSeams());

    assert.equal(result.outcome, null);
    // 100 + 50 + 30. Three DIFFERENT rungs, so a reader that only summed the requested unit, or
    // that priced every rung at its own face value, cannot produce this number by accident.
    assert.equal(result.available, 180);
    assert.deepEqual(
      result.readings.map((reading) => [reading.actorName, reading.copperValue]),
      [
        ['Idrin', 100],
        ['Sera', 50],
        ['Bram', 30],
      ]
    );
    assert.equal(result.baseUnit.id, 'cp');
    assert.deepEqual(
      party.map((actor) => actor.updates.length),
      [0, 0, 0],
      'a holdings read must write nothing'
    );
  });

  it('reads an empty actor set as a provable zero, not as unknown', async () => {
    const result = await read([], pooledSeams());

    assert.equal(result.outcome, null);
    assert.equal(result.available, 0);
    assert.deepEqual(result.readings, []);
  });

  it('reports the whole pool as unreadable when any one actor cannot be read', async () => {
    const readable = new PooledActorFake('Idrin', { gp: 4 });
    const opaque = new PooledActorFake('Sera');
    // PRESENT but non-numeric is the one shape `readCurrencyBalances` treats as a hard failure; a
    // missing path is legitimately read as zero, so it could not stand in for "cannot see".
    opaque.system.currency.gp = 'a pouch';

    const result = await read([readable, opaque], pooledSeams());

    assert.equal(
      result.available,
      null,
      'a sum over the actors that answered is a number about a different party'
    );
    assert.equal(result.readings[0].copperValue, 400, 'the readable actor is still reported');
    assert.equal(result.readings[1].copperValue, null);
    assert.ok(result.readings[1].message, 'the unreadable actor says why');
  });

  it('refuses a unit the world ladder does not name, before reading any actor', async () => {
    const party = [new PooledActorFake('Idrin', { gp: 4 })];

    const result = await read(party, pooledSeams(), { unitId: 'zorkmid' });

    assert.equal(result.outcome, COMPANION_OUTCOMES.unitNotFound);
    assert.deepEqual(result.messageData, { unit: 'zorkmid' });
  });

  it('asks the spender in the pooled caller voice', async () => {
    const spy = makePooledSpenderSpy(new ActorPropertyCoinSpender());
    const party = [new PooledActorFake('Idrin', { gp: 1 })];

    await read(party, pooledSeams({ actorPropertyCoinSpender: spy }));

    assert.deepEqual(
      spy.readCalls.map((call) => call.caller),
      [CURRENCY_SPEND_CALLERS.consume],
      'a macro branching on `caller` must be able to tell a pooled question from a craft'
    );
  });
});

describe('consumePooledCurrency', () => {
  it('takes exactly the cost across payers, denominated in the terminal base unit', async () => {
    // Idrin holds 150 cp; Sera holds 5 gp and nothing smaller. The cost is 3 gp = 300 cp.
    const idrin = new PooledActorFake('Idrin', { cp: 150 });
    const sera = new PooledActorFake('Sera', { gp: 5 });
    const spy = makePooledSpenderSpy(new ActorPropertyCoinSpender());

    const result = await consume([idrin, sera], pooledSeams({ actorPropertyCoinSpender: spy }), {
      amount: 3,
    });

    assert.equal(result.outcome, null);
    assert.equal(result.requiredBase, 300);
    // THE NUMERIC PROOF. Denominated in `cp` (baseValue 1) the two legs are 150 and 150, and the
    // pool pays 300. Denominated in the representative `gp` (baseValue 100) each leg would round
    // up through `Math.ceil(150 / 100)` to 2 gp, and the pool would pay 400 — a third more than
    // the cost, taken from characters who are not told why.
    assert.equal(
      idrin.totalCopper() + sera.totalCopper(),
      650 - 300,
      'the pool must be exactly 300 copper poorer, not 400'
    );
    assert.equal(idrin.totalCopper(), 0);
    assert.equal(sera.totalCopper(), 350, 'Sera breaks gold to pay 150 copper and keeps the rest');
    assert.deepEqual(
      spy.spendCalls.map((call) => [call.actor, call.unit, call.amount]),
      [
        ['Idrin', 'cp', 150],
        ['Sera', 'cp', 150],
      ]
    );
    assert.deepEqual(
      result.ledger.map((row) => [row.actorName, row.amount, row.settled]),
      [
        ['Idrin', 150, true],
        ['Sera', 150, true],
      ]
    );
    assert.equal(result.wroteNothing, false);
  });

  it('stops at the first payer that can cover the rest', async () => {
    const idrin = new PooledActorFake('Idrin', { gp: 5 });
    const sera = new PooledActorFake('Sera', { gp: 5 });
    const spy = makePooledSpenderSpy(new ActorPropertyCoinSpender());

    await consume([idrin, sera], pooledSeams({ actorPropertyCoinSpender: spy }), { amount: 2 });

    assert.deepEqual(
      spy.spendCalls.map((call) => call.actor),
      ['Idrin'],
      'the caller-supplied order is the allocation policy'
    );
    assert.equal(sera.totalCopper(), 500, 'an unneeded payer is never touched');
  });

  it('refuses a pool short of the cost, having written nothing', async () => {
    const party = [new PooledActorFake('Idrin', { gp: 1 })];

    const result = await consume(party, pooledSeams(), { amount: 2 });

    assert.equal(result.outcome, COMPANION_OUTCOMES.insufficient);
    assert.equal(result.wroteNothing, true);
    assert.deepEqual(result.ledger, []);
    assert.equal(party[0].updates.length, 0);
    assert.equal(result.available, 100);
    assert.equal(result.requiredBase, 200);
  });

  it('refuses an unreadable pool rather than taking the cost from the actors it can see', async () => {
    const readable = new PooledActorFake('Idrin', { gp: 9 });
    const opaque = new PooledActorFake('Sera');
    opaque.system.currency.sp = 'a pouch';

    const result = await consume([readable, opaque], pooledSeams(), { amount: 2 });

    assert.equal(result.outcome, COMPANION_OUTCOMES.balanceNotConfigured);
    assert.equal(result.wroteNothing, true);
    assert.equal(
      readable.updates.length,
      0,
      'Idrin can afford it alone, and that is exactly why nothing may be taken from him'
    );
  });

  it('refuses a macro world with no increment macro up front, running and writing nothing', async () => {
    const runs = [];
    const party = [new PooledActorFake('Idrin', { gp: 9 })];
    const { increment: _dropped, ...withoutIncrement } = POOLED_MACROS;

    const result = await consume(
      party,
      pooledSeams({
        spendStrategy: 'macro',
        macros: withoutIncrement,
        runMacro: async (uuid) => {
          runs.push(uuid);
          return true;
        },
        resolveMacro: async () => ({ type: 'script', command: 'return true;' }),
      }),
      { amount: 2 }
    );

    assert.equal(result.outcome, COMPANION_OUTCOMES.creditNotConfigured);
    assert.equal(result.wroteNothing, true);
    assert.deepEqual(result.ledger, []);
    // Not merely "wrote nothing": the refusal is decided by world configuration alone, so it must
    // not have run the GM's `balance` macro on the way to deciding it.
    assert.deepEqual(runs, [], 'no macro may run before a configuration-only refusal');
  });

  it('proceeds in a macro world that can give currency back', async () => {
    const runs = [];
    const party = [new PooledActorFake('Idrin', { gp: 9 })];

    const result = await consume(
      party,
      pooledSeams({
        spendStrategy: 'macro',
        macros: POOLED_MACROS,
        runMacro: async (uuid) => {
          runs.push(uuid);
          return uuid === POOLED_MACROS.balance ? 900 : true;
        },
        resolveMacro: async () => ({ type: 'script', command: 'return true;' }),
      }),
      { amount: 2 }
    );

    assert.equal(result.outcome, null);
    assert.equal(result.available, 900, 'the balance macro answers in the terminal base unit');
    assert.deepEqual(runs, [POOLED_MACROS.balance, POOLED_MACROS.decrement]);
    assert.deepEqual(
      result.ledger.map((row) => [row.actorName, row.amount, row.settled]),
      [['Idrin', 200, true]]
    );
  });

  it('gives every settled payment back when a later one fails, and reports net zero', async () => {
    const idrin = new PooledActorFake('Idrin', { gp: 1 });
    const sera = new PooledActorFake('Sera', { gp: 5 });
    const spy = makePooledSpenderSpy(new ActorPropertyCoinSpender(), { failSpendAt: [2] });

    const result = await consume([idrin, sera], pooledSeams({ actorPropertyCoinSpender: spy }), {
      amount: 3,
    });

    assert.equal(result.outcome, COMPANION_OUTCOMES.consumeFailed);
    assert.equal(idrin.totalCopper(), 100, "the first payer's total is restored exactly");
    assert.equal(sera.totalCopper(), 500);
    assert.deepEqual(
      spy.refundCalls.map((call) => [call.actor, call.unit, call.amount]),
      [['Idrin', 'cp', 100]],
      'the give-back is in the same denomination the take was'
    );
    assert.deepEqual(
      result.ledger.map((row) => [row.actorName, row.settled, row.restored ?? null]),
      [
        ['Idrin', true, true],
        ['Sera', false, null],
      ]
    );
    assert.equal(
      result.wroteNothing,
      true,
      'a fully restored failure is net zero, which is what makes it safe to retry'
    );
  });

  it('reports a failed give-back as NOT zero-mutation', async () => {
    const idrin = new PooledActorFake('Idrin', { gp: 1 });
    const sera = new PooledActorFake('Sera', { gp: 5 });
    const spy = makePooledSpenderSpy(new ActorPropertyCoinSpender(), {
      failSpendAt: [2],
      failRefundAt: [1],
    });

    const result = await consume([idrin, sera], pooledSeams({ actorPropertyCoinSpender: spy }), {
      amount: 3,
    });

    assert.equal(result.outcome, COMPANION_OUTCOMES.consumeFailed);
    assert.equal(idrin.totalCopper(), 0, 'the coin really is gone');
    assert.equal(
      result.wroteNothing,
      false,
      'Fabricate cannot claim a zero it can see is untrue, and a companion must not retry'
    );
    assert.equal(result.ledger[0].restored, false);
  });

  it('refuses an amount that is not a whole number of coins, and accepts a numeric string', async () => {
    const party = [new PooledActorFake('Idrin', { gp: 9 })];

    for (const amount of [2.5, 0, -1, true, null, '']) {
      // eslint-disable-next-line no-await-in-loop
      const refused = await consume(party, pooledSeams(), { amount });
      assert.equal(
        refused.outcome,
        COMPANION_OUTCOMES.invalidAmount,
        `an amount of ${JSON.stringify(amount)} must be refused, not coerced`
      );
      assert.equal(refused.wroteNothing, true);
    }
    assert.equal(party[0].updates.length, 0);

    const accepted = await consume(party, pooledSeams(), { amount: '2' });
    assert.equal(accepted.outcome, null);
    assert.equal(party[0].totalCopper(), 700);
  });

  it('refuses a spender that cannot give currency back', async () => {
    const party = [new PooledActorFake('Idrin', { gp: 9 })];
    const takeOnly = {
      readCoins: (actor, ctx) => new ActorPropertyCoinSpender().readCoins(actor, ctx),
      spend: async () => ({ valid: true }),
    };

    const result = await consume(
      party,
      pooledSeams({ actorPropertyCoinSpender: takeOnly }),
      { amount: 1 }
    );

    assert.equal(result.outcome, COMPANION_OUTCOMES.creditNotConfigured);
    assert.equal(result.wroteNothing, true);
  });
});
