/**
 * `checkAffordability`'s behaviour — the world-scoped affordability answer the companion contract
 * publishes, and the macro discriminator it needed (issue 1289).
 *
 * Four claims are worth a suite of their own, because each one is a value a shape pin cannot see:
 *
 *   1. **The ladder still converts.** 10 sp affords a 1 gp cost on a 10-sp-per-gp ladder. This is
 *      the #1278 sentinel: that refactor moved the coin ladder from a crafting system to the world,
 *      and the companion's own catalogue kept reading `system?.requirements?.currency?.units`,
 *      which then answered `[]` for every system in every world while failing nothing at all.
 *      Breaking ladder resolution flips this VALUE, and a key-set-and-type pin cannot see that.
 *   2. **World scope, never a crafting system.** Asserted DIFFERENTIALLY — identical answers with
 *      the system toggle `false` and `true`, plus spies proving zero calls to EITHER route to a
 *      crafting system. Sameness alone would pass even if the toggle were read and happened not to
 *      matter.
 *   3. **The unit and the amount are resolved BEFORE any spender runs.** Asserted with a spy
 *      proving the spender was never invoked, because sameness of answer is not enough: an unknown
 *      unit prices the cost at zero, and `copperValue >= 0` is true of every purse, so the defect
 *      this guards is an unknown unit reading as AFFORDABLE.
 *   4. **A thrown macro is distinguishable from a poor actor.** Also differential: a macro that
 *      throws and a macro that returns a refusal must not answer in the same shape. Against shipped
 *      code they did.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ActorPropertyCoinSpender } from '../src/systems/CoinSpenders.js';
import { COMPANION_OUTCOMES } from '../src/systems/companionContract.js';
import {
  CURRENCY_SPEND_CALLERS,
  checkCurrencySpends,
  checkWorldCurrencyAffordability,
} from '../src/systems/currencyAffordance.js';
import { validateCurrencyProfile } from '../src/systems/currencyProfile.js';

import { assertContractResult } from './helpers/companionContractOutcomes.js';
import {
  CurrencyCraftingActorFake,
  SINGLE_TERMINAL_CURRENCY_UNITS,
  makeCurrencyCraftingSystem,
  makeDelegatingCoinSpender,
  makeWorldCurrencyConfig,
} from './helpers/currency-spend-fixtures.js';

const KEY = 'FABRICATE.Currency.Affordability';

/**
 * Every call the runtime could make to a crafting system, recorded in one place.
 *
 * BOTH routes are instrumented — the injected seam and the `game.fabricate` global fallback —
 * because a check that reached past its seam to the global would otherwise satisfy a seam-only spy
 * while still consulting a system.
 */
const systemManagerCalls = [];

globalThis.game = {
  fabricate: {
    getCraftingSystemManager: () => {
      systemManagerCalls.push('global');
      return { getSystem: () => makeCurrencyCraftingSystem({ enabled: true }) };
    },
  },
};

/** An actor carrying `sp` and nothing else, so only a ladder conversion can afford a `gp` cost. */
function purseHolding(sp) {
  return new CurrencyCraftingActorFake('Idrin', { currency: { sp } });
}

/**
 * Ask THE standard question — can Idrin, holding 10 sp and nothing else, afford 1 gp — with each
 * case naming only what it changes about it.
 *
 * A shared question rather than a per-case one is the point in three of these suites: the
 * world-scope differential claims two calls are "the same question", and the pre-spender guards
 * claim a refusal is caused by the one field the case overrode and by nothing else.
 */
function ask(seams, { sp = 10, ...request } = {}) {
  return checkWorldCurrencyAffordability(
    purseHolding(sp),
    { unitId: 'gp', amount: 1, ...request },
    seams
  );
}

/**
 * Seams for one question. The spender is always a recording delegate over a REAL
 * {@link ActorPropertyCoinSpender}, so a balance assertion means something and "never invoked" is
 * observable rather than inferred.
 */
function seamsFor({ units = SINGLE_TERMINAL_CURRENCY_UNITS, spendStrategy, macros, ...rest } = {}) {
  const spender = makeDelegatingCoinSpender(new ActorPropertyCoinSpender());
  return {
    spender,
    seams: {
      getCurrencyConfig: () => makeWorldCurrencyConfig({ units, spendStrategy, macros }),
      actorPropertyCoinSpender: spender,
      ...rest,
    },
  };
}

describe('the #1278 sentinel: a cost is priced against the WORLD ladder', () => {
  it('affords a 1 gp cost from 10 sp, because gp resolves to 10 sp', async () => {
    const { seams, spender } = seamsFor();

    const result = await ask(seams);

    assertContractResult(result, {
      success: true,
      affordable: true,
      outcome: COMPANION_OUTCOMES.affordable,
      message: `${KEY}.Affordable`,
      messageData: { actor: 'Idrin', amount: 1, unit: 'gp' },
    });
    assert.deepEqual(
      spender.checkCalls,
      [{ unit: 'gp', amount: 1 }],
      'the cost is checked once, in the unit it was asked in'
    );
  });

  it('refuses the same cost from 9 sp — one silver short, not a rounding', async () => {
    const { seams } = seamsFor();

    const result = await ask(seams, { sp: 9 });

    assertContractResult(result, {
      success: true,
      affordable: false,
      outcome: COMPANION_OUTCOMES.notAffordable,
      message: `${KEY}.NotAffordable`,
      messageData: {
        actor: 'Idrin',
        amount: 1,
        unit: 'gp',
        detail: 'Insufficient currency. Requires 1 gp.',
      },
    });
  });

  it('writes nothing: an affordability question is a read', async () => {
    const { seams } = seamsFor();
    const actor = purseHolding(10);

    await checkWorldCurrencyAffordability(actor, { unitId: 'gp', amount: 1 }, seams);

    assert.deepEqual(actor.updates, [], 'the check must not touch the purse it reads');
    assert.equal(actor.system.currency.sp, 10, 'and the balance is unchanged');
  });
});

describe('world scope, never a crafting system', () => {
  it('answers identically whichever way a system toggle points, and asks no system', async () => {
    const answers = [];
    for (const enabled of [false, true]) {
      systemManagerCalls.length = 0;
      const seamCalls = [];
      const { seams } = seamsFor({
        getCraftingSystemManager: () => {
          seamCalls.push('seam');
          return { getSystem: () => makeCurrencyCraftingSystem({ enabled }) };
        },
      });

      const result = await ask(seams);

      // The differential half. Sameness alone would still pass if the toggle were read and
      // happened not to matter, so the zero-call assertion is what actually pins the scope.
      assert.deepEqual(seamCalls, [], `the system-manager seam was consulted (toggle ${enabled})`);
      assert.deepEqual(
        systemManagerCalls,
        [],
        `the game.fabricate system-manager fallback was consulted (toggle ${enabled})`
      );
      answers.push({ ...result });
    }

    assert.deepEqual(answers[0], answers[1], 'a downtime cost belongs to no crafting system');
    assert.equal(answers[0].affordable, true);
  });
});

describe('the unit and the amount are resolved before any spender runs', () => {
  it('refuses an unknown unit id, and the spender is never invoked', async () => {
    const { seams, spender } = seamsFor();

    const result = await ask(seams, { unitId: 'zorkmid' });

    assertContractResult(result, {
      success: false,
      affordable: null,
      outcome: COMPANION_OUTCOMES.unitNotFound,
      message: `${KEY}.UnitNotFound`,
      messageData: { unit: 'zorkmid' },
    });
    // Without this guard the unknown unit prices at zero and every purse "affords" it.
    assert.deepEqual(spender.checkCalls, [], 'an unpriceable cost must never reach a spender');
  });

  it('refuses an amount of zero, and the spender is never invoked', async () => {
    const { seams, spender } = seamsFor();

    const result = await ask(seams, { amount: 0 });

    assertContractResult(result, {
      success: false,
      affordable: null,
      outcome: COMPANION_OUTCOMES.invalidAmount,
      message: `${KEY}.InvalidAmount`,
    });
    assert.deepEqual(spender.checkCalls, [], 'a zero cost is a caller bug, not a free purchase');
  });

  it('refuses every unusable amount rather than coercing one into a number', async () => {
    const { seams } = seamsFor();
    const unusable = [Number.NaN, Infinity, -1, null, undefined, true, [], {}, 'lots', ''];

    for (const amount of unusable) {
      const result = await ask(seams, { amount });
      assert.equal(
        result.outcome,
        COMPANION_OUTCOMES.invalidAmount,
        `${String(amount)} must refuse: Number(true) is 1 and Number([]) is 0, so a coerced amount silently invents a cost`
      );
      assert.equal(result.affordable, null, 'a refusal is never a confident "cannot afford"');
    }
  });

  it('accepts a numeric string, which an authored activity field legitimately holds', async () => {
    const { seams } = seamsFor();

    const result = await ask(seams, { amount: '1' });

    assert.equal(result.outcome, COMPANION_OUTCOMES.affordable);
  });

  it('refuses an empty ladder as a distinct outcome from a broken one', async () => {
    const { seams, spender } = seamsFor({ units: [] });

    const result = await ask(seams);

    assertContractResult(result, {
      success: false,
      affordable: null,
      outcome: COMPANION_OUTCOMES.ladderEmpty,
      message: `${KEY}.LadderEmpty`,
    });
    assert.deepEqual(spender.checkCalls, []);
  });

  it('refuses an invalid ladder, carrying the validator’s free text as messageData.detail', async () => {
    const units = [{ id: 'gp', label: 'Gold', abbreviation: 'gp' }];
    const { seams, spender } = seamsFor({ units });
    // Derived rather than transcribed, so this pins "the detail IS the profile's errors" rather
    // than restating one wording of them.
    const expectedDetail = validateCurrencyProfile(units, { spendStrategy: 'actorProperty' })
      .errors.join('; ');

    const result = await ask(seams);

    assert.ok(expectedDetail.length > 0, 'the fixture must actually be invalid');
    assertContractResult(result, {
      success: false,
      affordable: null,
      outcome: COMPANION_OUTCOMES.ladderInvalid,
      message: `${KEY}.LadderInvalid`,
      messageData: { detail: expectedDetail },
    });
    assert.deepEqual(spender.checkCalls, []);
  });
});

describe('the macro arm', () => {
  const MACROS = { canAfford: 'Macro.afford', decrement: 'Macro.dec', increment: '' };

  /**
   * A resolver answering a runnable SCRIPT macro for every uuid.
   *
   * `MacroCoinSpender` now RESOLVES the configured uuid and gates on the document before it
   * delegates (issue 1301), and this suite defines no `globalThis.fromUuid` — so without an
   * injected resolver every case here would refuse at the gate and never reach its own
   * `runMacro`, and the two cells that COUNT macro invocations would pass vacuously.
   */
  const resolveRunnableMacro = async () => ({ type: 'script', command: 'return true;' });

  function macroSeams(runMacro) {
    const received = [];
    const { seams } = seamsFor({
      spendStrategy: 'macro',
      macros: MACROS,
      resolveMacro: resolveRunnableMacro,
      runMacro: async (uuid, context) => {
        received.push({ uuid, context });
        return runMacro(context);
      },
    });
    return { seams, received };
  }

  it('distinguishes a macro that THREW from a macro that reported a shortfall', async () => {
    const broken = macroSeams(() => {
      throw new TypeError("Cannot read properties of null (reading 'name')");
    });
    const honest = macroSeams(() => ({ canAfford: false, message: 'Not enough coin.' }));

    const thrown = await ask(broken.seams);
    const refused = await ask(honest.seams);

    // The defect: against shipped code both collapsed into `{ valid: false, message }`, so a
    // craft-shaped macro that threw on `context.recipe.name` reported a well-funded actor as
    // unable to pay, indistinguishable from a genuine shortfall.
    assertContractResult(thrown, {
      success: false,
      affordable: null,
      outcome: COMPANION_OUTCOMES.checkUnavailable,
      message: `${KEY}.CheckUnavailable`,
      messageData: { detail: 'Could not spend currency (1 gp).' },
    });
    assertContractResult(refused, {
      success: true,
      affordable: false,
      outcome: COMPANION_OUTCOMES.notAffordable,
      message: `${KEY}.NotAffordable`,
      messageData: { actor: 'Idrin', amount: 1, unit: 'gp', detail: 'Not enough coin.' },
    });
    assert.notEqual(
      thrown.affordable,
      refused.affordable,
      'a broken macro and a poor actor must not answer the same thing'
    );
  });

  it('hands the macro caller "award" with a null recipe and crafting system', async () => {
    const { seams, received } = macroSeams(() => true);

    const result = await ask(seams);

    assert.equal(result.outcome, COMPANION_OUTCOMES.affordable);
    assert.equal(received.length, 1);
    const { context } = received[0];
    // A discriminator a macro can TEST, rather than two nulls it must infer an occasion from.
    assert.equal(context.caller, CURRENCY_SPEND_CALLERS.award);
    assert.equal(context.recipe, null, 'a downtime award has no recipe');
    assert.equal(context.craftingSystem, null, 'and belongs to no crafting system');
    assert.equal(context.actor?.name, 'Idrin');
    assert.deepEqual(context.cost, [{ abbreviation: 'gp', amount: 1 }]);
  });

  it('still hands the CRAFT path caller "craft", with its real recipe and system', async () => {
    const received = [];
    const system = makeCurrencyCraftingSystem({ enabled: true });
    const recipe = { id: 'r1', craftingSystemId: system.id };
    const seams = {
      getCraftingSystemManager: () => ({ getSystem: () => system }),
      getCurrencyConfig: () =>
        makeWorldCurrencyConfig({ spendStrategy: 'macro', macros: MACROS }),
      resolveMacro: resolveRunnableMacro,
      runMacro: async (uuid, context) => {
        received.push(context);
        return true;
      },
    };

    const result = await checkCurrencySpends(
      purseHolding(10),
      recipe,
      [{ unit: 'gp', amount: 1 }],
      seams
    );

    assert.equal(result.valid, true);
    assert.equal(received.length, 1);
    assert.equal(received[0].caller, CURRENCY_SPEND_CALLERS.craft);
    assert.equal(received[0].recipe, recipe, 'the craft arm still carries its recipe');
    assert.equal(received[0].craftingSystem, system, 'and its crafting system');
  });
});

describe('a spender that throws outright', () => {
  it('answers checkUnavailable, because a contract member may not throw mid-tick', async () => {
    const { seams } = seamsFor({
      actorPropertyCoinSpender: {
        check() {
          throw new Error('the purse exploded');
        },
      },
    });

    const result = await ask(seams);

    assertContractResult(result, {
      success: false,
      affordable: null,
      outcome: COMPANION_OUTCOMES.checkUnavailable,
      message: `${KEY}.CheckUnavailable`,
      messageData: { detail: 'the purse exploded' },
    });
  });

  it('answers checkUnavailable when the strategy resolves no spender at all', async () => {
    const { seams } = seamsFor({ spendStrategy: 'actorInventory', actorInventoryCoinSpender: null });

    const result = await ask(seams);

    assert.equal(result.outcome, COMPANION_OUTCOMES.checkUnavailable);
    assert.match(result.messageData.detail, /actorInventory/);
  });
});
