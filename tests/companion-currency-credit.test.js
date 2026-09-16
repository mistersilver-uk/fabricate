/**
 * `creditCurrency`'s behaviour — the Currency Credit the companion contract publishes
 * (issue 1301).
 *
 * The member MOVES MONEY onto a player's sheet through a mechanism Fabricate does not own, so
 * the claims worth a suite of their own are all about what it may state as fact:
 *
 *   1. **`credited` is an OBSERVATION, never a restatement of the request.** Under
 *      `actorInventory` the shipped spender manufactures `{ valid: true }` out of a VOID
 *      `addCoins`, so without a `readCoins` observation the member would report `credited: 50`
 *      for a write it never saw.
 *   2. **`0` means Fabricate can PROVE it; `null` means it cannot.** One rule, stated twice —
 *      by the scalar and by the published zero-mutation retry set — so the two can never
 *      disagree. `creditFailed` answering `0` would state a third party's word as Fabricate's
 *      own proof.
 *   3. **A misconfiguration is not a domain answer.** Four spellings of "the macro never ran"
 *      answer `creditNotConfigured` identically, because from the GM's side deleting a macro
 *      and switching its type to `chat` are the same action.
 *
 * The check and the credit share ONE denomination resolution, and AC-10 drives both members
 * against a ladder carrying a DECOY unit whose abbreviation collides with the real one — which
 * is what makes that criterion able to fail at all, since any re-derivation agrees on a
 * single-`gp` fixture.
 *
 * **AC-33 is not here.** It asserts what a player-cancelled craft reports when Foundry
 * discards the currency write, and it lives in `tests/crafting-cancel-craft.test.js` beside the
 * run fixture and the rest of that member's truth table — copying that fixture here would be a
 * duplication block, and the criterion belongs next to the answers it moves.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { ActorPropertyCoinSpender } from '../src/systems/CoinSpenders.js';
import {
  AFFORDABILITY_MESSAGE_KEYS,
  CHECK_ROLL_MESSAGE_KEYS,
  COMPANION_OUTCOMES,
  COMPONENT_AWARD_MESSAGE_KEYS,
  CURRENCY_CREDIT_MESSAGE_KEYS,
  KNOWLEDGE_GRANT_MESSAGE_KEYS,
} from '../src/systems/companionContract.js';
import {
  CURRENCY_SPEND_CALLERS,
  checkWorldCurrencyAffordability,
  creditWorldCurrency,
} from '../src/systems/currencyAffordance.js';
import { validateCurrencyProfile } from '../src/systems/currencyProfile.js';

import {
  assertContractResult,
  assertMessageDataCovers,
  assertMessageIsFromTable,
} from './helpers/companionContractOutcomes.js';
import {
  CurrencyCraftingActorFake,
  makeCurrencyConfigStoreStub,
  makeWorldCurrencyConfig,
} from './helpers/currency-spend-fixtures.js';
import {
  FabricateFacadeUnderTest,
  installFacadeGame,
  makeFacadeActor,
} from './helpers/fabricateFacadeHarness.js';

const KEY = 'FABRICATE.Currency.Credit';
const GM = { id: 'user-gm', isGM: true };

/**
 * A `game` global, because `resolveCoinSpender` reads a BARE `game.fabricate?.…` on both of its
 * accessor fallbacks (`currencyAffordance.js:144`, `:152`) rather than the `globalThis.game?.`
 * the ladder reader uses one function above it, whose own docblock records why: a bare
 * reference throws `ReferenceError` in any context without the Foundry global. Under Foundry
 * the global always exists, so this models production rather than papering over a defect — but
 * it is why a cell that injects NO spender needs it, and the asymmetry is worth knowing about.
 */
globalThis.game = globalThis.game ?? { fabricate: {} };

/**
 * A three-rung ladder — `gp` -> 10 `sp` -> 10 `cp` — so `gp` prices at 100 copper, PLUS a
 * DECOY whose `abbreviation` is `gp` and whose id is not.
 *
 * The decoy is what makes AC-10 able to fail: `findCurrencyUnit` matches on exact id, so on a
 * single-`gp` fixture any second, re-derived resolution agrees with the first by luck.
 */
const LADDER = [
  {
    id: 'gp',
    label: 'Gold',
    abbreviation: 'gp',
    actorPath: 'system.currency.gp',
    contains: [{ unitId: 'sp', amount: 10 }],
  },
  {
    id: 'sp',
    label: 'Silver',
    abbreviation: 'sp',
    actorPath: 'system.currency.sp',
    contains: [{ unitId: 'cp', amount: 10 }],
  },
  { id: 'cp', label: 'Copper', abbreviation: 'cp', actorPath: 'system.currency.cp', contains: [] },
  {
    id: 'trade-bar',
    label: 'Trade Bar',
    abbreviation: 'gp',
    actorPath: 'system.currency.tb',
    contains: [],
  },
];

/**
 * The same ladder WITHOUT the decoy, for the `actorInventory` cells.
 *
 * That strategy validates every unit against the pf2e denominations (`pp`/`gp`/`sp`/`cp`), so a
 * `trade-bar` decoy makes the whole profile invalid and every case below would answer
 * `ladderInvalid` before reaching a spender. `gp` still prices at 100 copper, which is what the
 * observed delta is measured against.
 */
const INVENTORY_LADDER = LADDER.slice(0, 3);

const MACROS = { canAfford: 'Macro.afford', decrement: 'Macro.dec', increment: 'Macro.inc' };

/** A resolver answering a runnable SCRIPT macro, since no `fromUuid` exists under `node --test`. */
const runnableMacro = async () => ({ type: 'script', command: 'return true;' });

/**
 * What `credited` must be for EVERY declared outcome, at the standard 50 gp request.
 *
 * Written out as the RULE rather than computed from the member's own list of provably-zero
 * outcomes, and that is the whole point: an expectation read back from the implementation
 * agrees with the implementation by construction, so deleting six outcomes from that list would
 * change the code and the expectation together and nothing would fail. The rule itself is
 * three-valued — the AMOUNT when Fabricate observed the credit, `0` when it can PROVE nothing
 * moved (`creditNotConfigured` and every refusal taken before any mechanism ran), and `null`
 * when a mechanism ran and it cannot prove what that mechanism did.
 *
 * The regression this catches runs the DANGEROUS way: a provable zero reporting itself as
 * `null` reads as "unknown", which is the collapse the three-token vocabulary exists to
 * prevent, and `null` is what a caller is told not to treat as retry-safe.
 */
const EXPECTED_CREDITED = new Map([
  // the mechanism ran and Fabricate OBSERVED the credit
  [COMPANION_OUTCOMES.credited, 50],
  // a mechanism ran and Fabricate cannot prove what it did
  [COMPANION_OUTCOMES.creditFailed, null],
  [COMPANION_OUTCOMES.creditUnavailable, null],
  // nothing ran, and Fabricate can prove it
  [COMPANION_OUTCOMES.creditNotConfigured, 0],
  [COMPANION_OUTCOMES.invalidAmount, 0],
  [COMPANION_OUTCOMES.ladderEmpty, 0],
  [COMPANION_OUTCOMES.ladderInvalid, 0],
  [COMPANION_OUTCOMES.unitNotFound, 0],
  [COMPANION_OUTCOMES.invalidCallSite, 0],
  [COMPANION_OUTCOMES.notElected, 0],
  [COMPANION_OUTCOMES.gmOnly, 0],
  [COMPANION_OUTCOMES.noActor, 0],
  [COMPANION_OUTCOMES.notReady, 0],
]);

const actor = (currency = {}) => new CurrencyCraftingActorFake('Idrin', currency);

/** Seams for one credit, named only where they differ from the default world. */
function creditSeams({ units = LADDER, spendStrategy, macros, elected = true, ...rest } = {}) {
  return {
    getCurrencyConfig: () => makeWorldCurrencyConfig({ units, spendStrategy, macros }),
    isElectedExecutor: () => elected,
    ...rest,
  };
}

/** The standard question: credit Idrin 50 gp from a GM action. */
const credit = (target, seams, request = {}) =>
  creditWorldCurrency(
    target,
    { unitId: 'gp', amount: 50, callSite: 'gmAction', ...request },
    seams
  );

/** A spender double that records every `refund` it is handed. */
function recordingSpender(answer = () => ({ valid: true })) {
  const calls = [];
  return {
    calls,
    spender: {
      check: () => ({ valid: true }),
      refund: async (...args) => {
        calls.push(args);
        return answer(...args);
      },
    },
  };
}

/**
 * An `actorInventory` spender double: a `readCoins` that walks a scripted sequence of copper
 * balances, and a `refund` that answers what the SHIPPED one answers over a void `addCoins`.
 */
function inventorySpender({ balances = [1000, 1000], refund } = {}) {
  const calls = { readCoins: 0, refund: 0 };
  return {
    calls,
    spender: {
      readCoins: () => {
        const value = balances[Math.min(calls.readCoins, balances.length - 1)];
        calls.readCoins += 1;
        return typeof value === 'object' ? value : { valid: true, copperValue: value };
      },
      refund: async () => {
        calls.refund += 1;
        // `(await refund.call(adapter, …)) ?? { valid: true }`, over an adapter whose
        // `addCoins` returns VOID — the shipped pf2e shape.
        return typeof refund === 'function' ? refund() : { valid: true };
      },
    },
  };
}

// ---------------------------------------------------------------------------
// AC-10 — ONE denomination resolution, not two
// ---------------------------------------------------------------------------

describe('AC-10 — the check and the credit resolve the same coin the same way', () => {
  const SOURCE = readFileSync(
    new URL('../src/systems/currencyAffordance.js', import.meta.url),
    'utf8'
  );

  /** One exported free function's text, bounded at its own closing brace. */
  function functionSource(signature) {
    const start = SOURCE.indexOf(signature);
    assert.ok(start >= 0, `${signature} is no longer in currencyAffordance.js`);
    const end = SOURCE.indexOf('\n}', start);
    assert.ok(end > start, `${signature} has no closing brace, so this pin would be vacuous`);
    return SOURCE.slice(start, end);
  }

  it('hands both spenders the same unit, priced at the same base value', async () => {
    const seen = [];
    const seams = creditSeams({
      actorPropertyCoinSpender: {
        check: (target, requirement, ctx) => {
          seen.push(['check', ctx]);
          return { valid: true };
        },
        refund: async (target, requirement, ctx) => {
          seen.push(['credit', ctx]);
          return { valid: true };
        },
      },
    });

    await checkWorldCurrencyAffordability(actor(), { unitId: 'gp', amount: 50 }, seams);
    await credit(actor(), seams);

    assert.equal(seen.length, 2, 'both members reached their spender');
    for (const [label, ctx] of seen) {
      assert.deepEqual(
        { id: ctx.unit.id, abbreviation: ctx.unit.abbreviation },
        { id: 'gp', abbreviation: 'gp' },
        `${label} resolved the real gp, not the decoy that merely abbreviates to it`
      );
      assert.equal(
        Number(ctx.profile.metadata.get(ctx.unit.id).baseValue),
        100,
        `${label} prices gp at 100 copper — the value lives in profile.metadata, never on the unit`
      );
    }
  });

  it('names the ONE shared resolver in both bodies, at source', () => {
    for (const signature of [
      'export async function checkWorldCurrencyAffordability(',
      'export async function creditWorldCurrency(',
    ]) {
      const body = functionSource(signature);
      assert.ok(
        body.includes('resolveWorldCurrencyRequest('),
        `${signature} stopped composing the shared request resolution, so the two can drift`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// AC-11 / AC-13 — the right macro, and never `refundCurrencySpends`
// ---------------------------------------------------------------------------

describe('AC-11 — the credit runs the INCREMENT macro, as an award', () => {
  it('invokes the increment uuid with caller "award", a null recipe and a null system', async () => {
    const ran = [];
    const result = await credit(
      actor(),
      creditSeams({
        spendStrategy: 'macro',
        macros: MACROS,
        resolveMacro: runnableMacro,
        runMacro: async (uuid, context) => {
          ran.push({ uuid, context });
          return true;
        },
      })
    );

    assert.equal(result.outcome, COMPANION_OUTCOMES.credited);
    assert.deepEqual(
      ran.map((entry) => entry.uuid),
      [MACROS.increment],
      'the increment macro, and never the decrement or canAfford one'
    );
    assert.equal(ran[0].context.caller, CURRENCY_SPEND_CALLERS.award);
    assert.equal(ran[0].context.recipe, null, 'a companion credit has no recipe');
    assert.equal(ran[0].context.craftingSystem, null, 'and belongs to no crafting system');
  });
});

describe('AC-13 — `refundCurrencySpends` is not on the path', () => {
  it('never names it in the member’s own body', () => {
    const source = readFileSync(
      new URL('../src/systems/currencyAffordance.js', import.meta.url),
      'utf8'
    );
    const body = source.slice(source.indexOf('export async function creditWorldCurrency('));
    assert.equal(body.includes('refundCurrencySpends'), false);
  });

  it('credits through the spender itself, with a refund call count of ONE', async () => {
    // The counterfactual is a SILENT SUCCESS: handed `recipe: null`, `refundCurrencySpends`
    // returns `{ valid: true, groups: [] }` before its loop and credits nothing, with `refund`
    // never invoked. Only the call count separates that from this.
    const { spender, calls } = recordingSpender();
    const result = await credit(actor(), creditSeams({ actorPropertyCoinSpender: spender }));

    assert.equal(result.credited, 50);
    assert.equal(calls.length, 1);
  });
});

// ---------------------------------------------------------------------------
// AC-12 — the credit discrimination, driven from every producer
// ---------------------------------------------------------------------------

describe('AC-12 — every producer of a failed credit is discriminated', () => {
  const macroSeams = (extra) =>
    creditSeams({ spendStrategy: 'macro', macros: MACROS, resolveMacro: runnableMacro, ...extra });

  it('(a) a macro that THREW answers creditUnavailable / null', async () => {
    const result = await credit(
      actor(),
      macroSeams({
        runMacro: async () => {
          throw new TypeError("Cannot read properties of null (reading 'name')");
        },
      })
    );

    assert.equal(result.outcome, COMPANION_OUTCOMES.creditUnavailable);
    assert.equal(result.credited, null);
  });

  it('(b) a macro that returned FALSE answers creditFailed / null, never zero', async () => {
    // The counterfactual is `credited: 0`, which would report a third party's word as
    // Fabricate's own proof — the collapse the whole scalar rule exists to prevent.
    const result = await credit(actor(), macroSeams({ runMacro: async () => false }));

    assert.equal(result.outcome, COMPANION_OUTCOMES.creditFailed);
    assert.equal(result.credited, null);
  });

  it('(c) no increment macro configured answers creditNotConfigured / 0', async () => {
    const result = await credit(
      actor(),
      macroSeams({ macros: { ...MACROS, increment: '' }, runMacro: async () => true })
    );

    assert.equal(result.outcome, COMPANION_OUTCOMES.creditNotConfigured);
    assert.equal(result.credited, 0, 'a documented-normal world state, provably zero-mutation');
  });

  it('(d) an increment uuid resolving to NOTHING answers the same as (c)', async () => {
    let ran = 0;
    const result = await credit(
      actor(),
      macroSeams({
        resolveMacro: async () => null,
        runMacro: async () => {
          ran += 1;
          return true;
        },
      })
    );

    assert.equal(result.outcome, COMPANION_OUTCOMES.creditNotConfigured);
    assert.equal(result.credited, 0, 'both mean the macro never ran');
    assert.equal(ran, 0);
  });

  it('(e) no spender, and a spender lacking refund, answer creditNotConfigured without throwing', async () => {
    const noSpender = await credit(
      actor(),
      creditSeams({
        units: INVENTORY_LADDER,
        spendStrategy: 'actorInventory',
        actorInventoryCoinSpender: null,
      })
    );
    assert.equal(noSpender.outcome, COMPANION_OUTCOMES.creditNotConfigured);
    assert.equal(noSpender.credited, 0);

    // The member RESOLVES rather than calling `null.refund` — a stable member may not throw.
    const noRefund = await credit(
      actor(),
      creditSeams({ actorPropertyCoinSpender: { check: () => ({ valid: true }) } })
    );
    assert.equal(noRefund.outcome, COMPANION_OUTCOMES.creditNotConfigured);
    assert.equal(noRefund.credited, 0);
  });

  it('(f) a spender that REJECTS outright answers creditUnavailable, and resolves', async () => {
    const result = await credit(
      actor(),
      creditSeams({
        actorPropertyCoinSpender: {
          refund: async () => {
            throw new Error('the purse exploded');
          },
        },
      })
    );

    assert.equal(result.outcome, COMPANION_OUTCOMES.creditUnavailable);
    assert.equal(result.credited, null);
    assert.equal(result.messageData.detail, 'the purse exploded');
  });

  it('(g) a present-but-non-numeric actorPath answers creditNotConfigured, with NO write', async () => {
    // On the DEFAULT strategy, and provably zero-mutation: `readCurrencyBalances` refuses
    // before `buildCurrencyRefundUpdates` ever reaches `actor.update`.
    const target = actor();
    target.system.currency.gp = { total: 5 };
    let updates = 0;
    target.update = async () => {
      updates += 1;
      return target;
    };

    const result = await credit(
      target,
      creditSeams({ actorPropertyCoinSpender: new ActorPropertyCoinSpender() })
    );

    assert.equal(result.outcome, COMPANION_OUTCOMES.creditNotConfigured);
    assert.equal(result.credited, 0);
    assert.equal(updates, 0, 'actor.update was never called');
  });

  it('(h) checkAffordability is UNMOVED by every marker this change places', async () => {
    const ask = (seams) =>
      checkWorldCurrencyAffordability(actor({ sp: 10 }), { unitId: 'gp', amount: 1 }, seams);

    // An unresolvable `canAfford` macro still answers checkUnavailable, exactly as it does
    // today by throwing inside the executor.
    const unresolvable = await ask(macroSeams({ resolveMacro: async () => null }));
    assert.equal(unresolvable.outcome, COMPANION_OUTCOMES.checkUnavailable);

    // A `macro` world with NO `canAfford` configured answers `ladderInvalid` — NOT
    // `notAffordable`, which the plan's prose implies: `collectMacroConfigErrors` REQUIRES
    // `canAfford` and `decrement`, so the profile fails validation and no spender is ever
    // resolved. The refusal precedes every marker, which is why it cannot have moved.
    const unconfigured = await ask(
      macroSeams({ macros: { ...MACROS, canAfford: '' }, runMacro: async () => true })
    );
    assert.equal(unconfigured.outcome, COMPANION_OUTCOMES.ladderInvalid);

    // And the domain answers themselves still come through, both ways.
    const affordable = await ask(macroSeams({ runMacro: async () => true }));
    assert.equal(affordable.outcome, COMPANION_OUTCOMES.affordable);
    const short = await ask(macroSeams({ runMacro: async () => ({ canAfford: false }) }));
    assert.equal(short.outcome, COMPANION_OUTCOMES.notAffordable);
    assert.equal(short.success, true, 'a question answered NO is still a question answered');
  });
});

// ---------------------------------------------------------------------------
// AC-14 — the integer rule, and the deliberate asymmetry with the check
// ---------------------------------------------------------------------------

describe('AC-14 — the credit refuses what it cannot write exactly', () => {
  const REFUSED = [
    ['a fraction', 2.5],
    ['a negative', -1],
    ['zero', 0],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a fractional string', '2.5'],
    ['an empty string', ''],
    ['true', true],
    ['an array', []],
    ['beyond MAX_SAFE_INTEGER', Number.MAX_SAFE_INTEGER + 2],
  ];

  for (const [label, amount] of REFUSED) {
    it(`refuses ${label}, with a refund call count of zero`, async () => {
      const { spender, calls } = recordingSpender();
      const result = await credit(actor(), creditSeams({ actorPropertyCoinSpender: spender }), {
        amount,
      });

      assert.equal(result.outcome, COMPANION_OUTCOMES.invalidAmount);
      assert.equal(result.credited, 0, 'a refusal before any mechanism ran is a PROVABLE zero');
      assert.equal(calls.length, 0);
    });
  }

  it('credits a numeric string, because a companion legitimately holds one', async () => {
    const result = await credit(
      actor(),
      creditSeams({ actorPropertyCoinSpender: new ActorPropertyCoinSpender() }),
      { amount: '50' }
    );

    assert.equal(result.credited, 50);
  });

  it('does NOT narrow checkAffordability to match, because that would be a version bump', async () => {
    const answer = await checkWorldCurrencyAffordability(
      actor({ gp: 10 }),
      { unitId: 'gp', amount: 2.5 },
      creditSeams({ actorPropertyCoinSpender: new ActorPropertyCoinSpender() })
    );

    assert.notEqual(
      answer.outcome,
      COMPANION_OUTCOMES.invalidAmount,
      'the shipped check still prices a fractional cost — a later harmonising tidy-up fails HERE'
    );
  });
});

// ---------------------------------------------------------------------------
// AC-16 / AC-17 — the election, and the gate order
// ---------------------------------------------------------------------------

describe('AC-16 — the election gate is ZERO WRITES for the credit too', () => {
  it('refuses an unelected broadcast without invoking the spender', async () => {
    const { spender, calls } = recordingSpender();
    const result = await credit(
      actor(),
      creditSeams({ actorPropertyCoinSpender: spender, elected: false }),
      { callSite: 'broadcast' }
    );

    assert.equal(result.outcome, COMPANION_OUTCOMES.notElected);
    assert.equal(result.credited, 0);
    assert.equal(calls.length, 0);
  });

  it('admits an ELECTED broadcast, so the refusal is the election and not the call site', async () => {
    const { spender, calls } = recordingSpender();
    const result = await credit(
      actor(),
      creditSeams({ actorPropertyCoinSpender: spender, elected: true }),
      { callSite: 'broadcast' }
    );

    assert.equal(result.outcome, COMPANION_OUTCOMES.credited);
    assert.equal(calls.length, 1);
  });
});

describe('AC-17 — the two published gate-order consequences hold for the credit', () => {
  function standUp({ ready = true, actors = [] } = {}) {
    installFacadeGame({ user: GM, actors });
    const { spender, calls } = recordingSpender();
    const facade = new FabricateFacadeUnderTest({
      ready,
      currencyConfigStore: makeCurrencyConfigStoreStub(makeWorldCurrencyConfig({ units: LADDER })),
      actorPropertyCoinSpender: spender,
    });
    return { facade, calls };
  }

  it('answers noActor — not invalidCallSite — for a GM holding a stale actorId', async () => {
    const { facade, calls } = standUp({ actors: [] });

    const result = await facade.creditCurrency({
      actorId: 'gone',
      unitId: 'gp',
      amount: 50,
      callSite: 'nonsense',
    });

    assert.equal(result.outcome, COMPANION_OUTCOMES.noActor);
    assert.equal(result.message, CURRENCY_CREDIT_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor]);
    assert.equal(calls.length, 0);
  });

  it('answers notReady — not invalidCallSite — before readiness', async () => {
    const { facade, calls } = standUp({ ready: false, actors: [makeFacadeActor('actor-1')] });

    const result = await facade.creditCurrency({
      actorId: 'actor-1',
      unitId: 'gp',
      amount: 50,
      callSite: 'nonsense',
    });

    assert.equal(result.outcome, COMPANION_OUTCOMES.notReady);
    assert.equal(result.message, CURRENCY_CREDIT_MESSAGE_KEYS[COMPANION_OUTCOMES.notReady]);
    assert.equal(calls.length, 0);
  });
});

// ---------------------------------------------------------------------------
// AC-18 — every outcome, in this member's OWN words
// ---------------------------------------------------------------------------

describe('AC-18 — the driven vocabulary equals the declared vocabulary', () => {
  async function driveEveryOutcome() {
    const answers = [];
    const macroSeams = (extra) =>
      creditSeams({
        spendStrategy: 'macro',
        macros: MACROS,
        resolveMacro: runnableMacro,
        ...extra,
      });

    answers.push(
      await credit(
        actor(),
        creditSeams({ actorPropertyCoinSpender: new ActorPropertyCoinSpender() })
      ),
      await credit(actor(), macroSeams({ runMacro: async () => false })),
      await credit(
        actor(),
        macroSeams({
          runMacro: async () => {
            throw new Error('boom');
          },
        })
      ),
      await credit(actor(), macroSeams({ resolveMacro: async () => null })),
      await credit(actor(), creditSeams({}), { amount: 0 }),
      await credit(actor(), creditSeams({ units: [] })),
      await credit(
        actor(),
        creditSeams({ units: [{ ...LADDER[0], actorPath: '' }, LADDER[1], LADDER[2]] })
      ),
      await credit(actor(), creditSeams({}), { unitId: 'nope' }),
      await credit(actor(), creditSeams({}), { callSite: 'nonsense' }),
      await credit(actor(), creditSeams({ elected: false }), { callSite: 'broadcast' })
    );

    // The three the FACADE answers with, which the leaf can never emit.
    const facadeCall = async ({ user, ready, actors, actorId }) => {
      installFacadeGame({ user, actors });
      const facade = new FabricateFacadeUnderTest({
        ready,
        currencyConfigStore: makeCurrencyConfigStoreStub(
          makeWorldCurrencyConfig({ units: LADDER })
        ),
        actorPropertyCoinSpender: new ActorPropertyCoinSpender(),
      });
      return facade.creditCurrency({ actorId, unitId: 'gp', amount: 50, callSite: 'gmAction' });
    };
    const target = makeFacadeActor('actor-1');
    answers.push(
      await facadeCall({
        user: { id: 'p', isGM: false },
        ready: true,
        actors: [target],
        actorId: 'actor-1',
      }),
      await facadeCall({ user: GM, ready: true, actors: [], actorId: 'gone' }),
      await facadeCall({ user: GM, ready: false, actors: [target], actorId: 'actor-1' })
    );

    return answers;
  }

  it('drives every declared outcome, and no other', async () => {
    const answers = await driveEveryOutcome();

    assert.deepEqual(
      [...new Set(answers.map((answer) => answer.outcome))].sort(),
      Object.keys(CURRENCY_CREDIT_MESSAGE_KEYS).sort(),
      'the driven set is the DECLARED set, computed from the table rather than restated'
    );
  });

  it('answers every one of them in its OWN words, with the data its string needs', async () => {
    const answers = await driveEveryOutcome();
    const foreign = [
      KNOWLEDGE_GRANT_MESSAGE_KEYS,
      AFFORDABILITY_MESSAGE_KEYS,
      CHECK_ROLL_MESSAGE_KEYS,
      COMPONENT_AWARD_MESSAGE_KEYS,
    ].flatMap((table) => Object.values(table));

    for (const answer of answers) {
      assertMessageIsFromTable(answer, CURRENCY_CREDIT_MESSAGE_KEYS, 'the credit');
      assertMessageDataCovers(answer, `the ${answer.outcome} answer`);
      assert.equal(foreign.includes(answer.message), false, `${answer.outcome} borrowed a key`);
      assert.equal(
        answer.credited,
        EXPECTED_CREDITED.get(answer.outcome),
        `${answer.outcome} must answer credited ${String(EXPECTED_CREDITED.get(answer.outcome))}: ` +
          '`0` is a claim Fabricate can prove, and `null` is a claim it cannot make'
      );
    }
  });

  it('states a credited value for every declared outcome, so a new one cannot skip the rule', () => {
    // Set equality against the KEY TABLE, so an outcome added without a decision about what it
    // may claim fails here rather than sliding through the loop above unasserted.
    assert.deepEqual(
      [...EXPECTED_CREDITED.keys()].sort(),
      Object.keys(CURRENCY_CREDIT_MESSAGE_KEYS).sort()
    );
  });

  it('answers the happy path as a WHOLE, field for field', async () => {
    const result = await credit(
      actor(),
      creditSeams({ actorPropertyCoinSpender: new ActorPropertyCoinSpender() })
    );

    assertContractResult(result, {
      success: true,
      credited: 50,
      outcome: COMPANION_OUTCOMES.credited,
      message: `${KEY}.Credited`,
      messageData: { actor: 'Idrin', amount: 50, unit: 'gp' },
    });
  });
});

// ---------------------------------------------------------------------------
// AC-28 / AC-32 — the credit is VERIFIED, and reaches the gate-resolved actor
// ---------------------------------------------------------------------------

describe('AC-28 (D0) — the credit is argument-accurate and observed', () => {
  it('(a) hands the spender the RESOLVED request, not a re-derived one', async () => {
    const { spender, calls } = recordingSpender();
    await credit(actor(), creditSeams({ actorPropertyCoinSpender: spender }));

    const [, requirement] = calls[0];
    assert.deepEqual(Object.keys(requirement), ['unit', 'amount']);
    assert.equal(requirement.unit.id, 'gp');
    assert.equal(requirement.amount, 50, 'the actor gets what the answer says it got');
  });

  it('(b) passes the GATE-RESOLVED actor by reference, on both routes into the spender', async () => {
    const gateResolved = actor();
    const callersOwn = actor();
    const { spender, calls } = recordingSpender();

    await creditWorldCurrency(
      gateResolved,
      { unitId: 'gp', amount: 50, callSite: 'gmAction', actor: callersOwn },
      creditSeams({ actorPropertyCoinSpender: spender })
    );

    const [target, , ctx] = calls[0];
    assert.equal(target, gateResolved, 'the spender is handed the gate-resolved actor');
    assert.equal(ctx.macroContext.actor, gateResolved, 'and so is the macro context');
    assert.notEqual(target, callersOwn);
  });

  it('(c) reports a DISCARDED actor.update as creditNotConfigured, never as a credit', async () => {
    // `Document#update` resolves `undefined` when the whole diff is empty. The shipped spender
    // answered `{ valid: true }` regardless, so this cell would have said `credited: 50` for a
    // write Foundry threw away.
    const target = actor();
    let attempts = 0;
    target.update = async () => {
      attempts += 1;
      return undefined;
    };

    const result = await credit(
      target,
      creditSeams({ actorPropertyCoinSpender: new ActorPropertyCoinSpender() })
    );

    assert.equal(result.outcome, COMPANION_OUTCOMES.creditNotConfigured);
    assert.equal(result.credited, 0);
    assert.equal(attempts, 1, 'the write WAS attempted, and answered nothing');
  });
});

describe('AC-32 (D0) — the actorInventory credit is an OBSERVATION', () => {
  const inventorySeams = (spender) =>
    creditSeams({
      units: INVENTORY_LADDER,
      spendStrategy: 'actorInventory',
      actorInventoryCoinSpender: spender,
    });

  it('(a) an observed delta equal to the expected one credits the amount', async () => {
    // 50 gp at 100 copper = 5000 copper.
    const { spender, calls } = inventorySpender({ balances: [1000, 6000] });

    const result = await credit(actor(), inventorySeams(spender));

    assert.equal(result.outcome, COMPANION_OUTCOMES.credited);
    assert.equal(result.credited, 50);
    assert.equal(calls.readCoins, 2, 'read before AND after');
    assert.equal(calls.refund, 1);
  });

  it('(b) NO observed change answers creditFailed / null, outside the zero-mutation set', async () => {
    // The criterion's whole content: the shipped spender returns `{ valid: true }` over a VOID
    // `addCoins`, so without the observation the member reports a credit it never saw.
    const { spender } = inventorySpender({ balances: [1000, 1000] });

    const result = await credit(actor(), inventorySeams(spender));

    assert.equal(result.outcome, COMPANION_OUTCOMES.creditFailed);
    assert.equal(
      result.credited,
      null,
      'a concurrent spend could mask a real write, so Fabricate observed the zero but cannot prove it'
    );
  });

  it('(c) an UNEXPECTED delta, and an unreadable balance, both answer creditUnavailable', async () => {
    const surprising = inventorySpender({ balances: [1000, 1017] });
    const wrong = await credit(actor(), inventorySeams(surprising.spender));
    assert.equal(wrong.outcome, COMPANION_OUTCOMES.creditUnavailable);
    assert.equal(wrong.credited, null, 'what it credited is not what was asked, so no number');

    const unreadable = inventorySpender({
      balances: [
        { valid: true, copperValue: 1000 },
        { valid: false, message: 'no adapter' },
      ],
    });
    const unknown = await credit(actor(), inventorySeams(unreadable.spender));
    assert.equal(unknown.outcome, COMPANION_OUTCOMES.creditUnavailable);
    assert.equal(unknown.credited, null);
  });

  it('a failed PRE-read refuses before the mechanism runs, and is provably zero-mutation', async () => {
    // Stronger than the delta's `creditUnavailable`, and in the same voice as the missing
    // spender: nothing has been invoked yet, so the credit stays retry-safe.
    const { spender, calls } = inventorySpender({
      balances: [{ valid: false, message: 'no inventory adapter is registered' }],
    });

    const result = await credit(actor(), inventorySeams(spender));

    assert.equal(result.outcome, COMPANION_OUTCOMES.creditNotConfigured);
    assert.equal(result.credited, 0);
    assert.equal(calls.refund, 0, 'nothing ran');
  });
});

// ---------------------------------------------------------------------------
// AC-34 / AC-35 — the macro gate, and the shipped zero-update refund
// ---------------------------------------------------------------------------

describe('AC-34 — four spellings of "the macro never ran", answered identically', () => {
  const SPELLINGS = [
    ['a uuid resolving to nothing', null],
    ['a document with no string command', { type: 'script' }],
    ['a chat-type macro whose body is not JavaScript', { type: 'chat', command: '/roll 1d20!' }],
    ['a blank command', { type: 'script', command: '   ' }],
  ];

  for (const [label, macro] of SPELLINGS) {
    it(`answers creditNotConfigured for ${label}, without running anything`, async () => {
      let ran = 0;
      const result = await credit(
        actor(),
        creditSeams({
          spendStrategy: 'macro',
          macros: MACROS,
          resolveMacro: async () => macro,
          runMacro: async () => {
            ran += 1;
            return true;
          },
        })
      );

      assert.equal(result.outcome, COMPANION_OUTCOMES.creditNotConfigured);
      assert.equal(result.credited, 0);
      assert.equal(ran, 0, 'the gate refuses BEFORE delegating');
    });
  }

  it('keeps the script gate at the CALL SITE, never in the executor', () => {
    // The other half of this criterion — "`MacroExecutor.js` is unchanged by this PR" — is a
    // DIFF check, which no unit test can make; it is discharged from the changed-file list at
    // review. What IS enforceable is the property that check protects, and it already ships as
    // an absence in `tests/macro-executor.test.js`: centralising the type check there would
    // turn a chat-type essence property macro from a silent warn into a per-essence,
    // per-result error notification. Asserted here too, because this change is the one that
    // gains a reason to move it.
    const executor = readFileSync(
      new URL('../src/utils/MacroExecutor.js', import.meta.url),
      'utf8'
    );
    const code = executor.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/.*$/gm, '');
    assert.equal(/\.type\b/.test(code), false, 'the executor reads no macro type');
    assert.equal(/script/i.test(code), false, 'and names no script gate');
  });
});

describe('AC-35 — the shipped ZERO-UPDATE refund still succeeds', () => {
  it('answers valid without ever calling actor.update', async () => {
    // `buildCurrencyRefundUpdates` answers `{ valid: true, updates: {} }` for a non-positive
    // amount. Implementing the write-truth test OUTSIDE the zero-updates guard would turn this
    // legitimate no-op into a reported failure on the shipped `refundCurrencySpends` path. It
    // is unreachable from `creditCurrency`, which refuses a non-positive amount first — which
    // is exactly why it needs a criterion of its own.
    const profile = validateCurrencyProfile(LADDER);
    const unit = profile.units.find((entry) => entry.id === 'gp');
    const target = actor({ gp: 1 });
    let updates = 0;
    target.update = async () => {
      updates += 1;
      return undefined;
    };

    const result = await new ActorPropertyCoinSpender().refund(
      target,
      { unit, amount: 0 },
      { profile }
    );

    assert.equal(result.valid, true);
    assert.equal(updates, 0);
  });
});
