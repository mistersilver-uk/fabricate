/**
 * The `balance` currency macro key (issue 1342, Phase 3).
 *
 * A `macro` world hands its currency to GM-authored macros, so before this key existed Fabricate
 * could SPEND such a world's coins and could not SEE them. `balance` is the fourth slot, and the
 * only one that asks rather than acts — which is why almost everything here is about the one rule
 * that distinguishes an answer from a non-answer:
 *
 *   **A returned number `0` means provably none. Anything that is not a number means CANNOT SEE.**
 *
 * Mapping a broken macro to `0` is the specific lie the rule exists to prevent: it would report
 * every character in a `macro` world as penniless, with the same confidence as a real reading.
 *
 * The rest of the suite is mirror-guarding. Adding a key to `CURRENCY_MACRO_KEYS` backfills it
 * through the normalizer into every existing world for free — there is no migration — but four
 * surfaces do NOT follow automatically, and each of them fails silently: a constructor that drops
 * the uuid, a projection that hides the field in the unloaded state, and an editor that never
 * offers it. The drift guards below fail when any of them stops covering the declared vocabulary.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  MacroCoinSpender,
  interpretMacroBalanceResult,
  interpretMacroSpendResult,
} from '../src/systems/CoinSpenders.js';
import { COMPANION_OUTCOMES } from '../src/systems/companionContract.js';
import {
  CURRENCY_MACRO_KEYS,
  normalizeCurrencyConfig,
  normalizeWorldCurrencyConfig,
  validateCurrencyProfile,
} from '../src/systems/currencyProfile.js';

import { POOLED_LADDER, POOLED_MACROS } from './helpers/pooled-currency-fixtures.js';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

/**
 * A spender whose `balance` macro resolves to a runnable script returning `answer`.
 *
 * `macro` is read with `in` rather than defaulted, because one of the refusal shapes under test IS
 * an explicit `null` — a `??` default would silently substitute a runnable document for it and the
 * case would pass for the wrong reason.
 */
function balanceSpender(answer, options = {}) {
  const { macros = POOLED_MACROS } = options;
  const macro = 'macro' in options ? options.macro : { type: 'script', command: 'return 1;' };
  const runs = [];
  const spender = new MacroCoinSpender({
    macros,
    resolveMacro: async () => macro,
    runMacro: async (uuid) => {
      runs.push(uuid);
      if (typeof answer === 'function') return answer();
      return answer;
    },
  });
  return { runs, spender };
}

describe('interpretMacroBalanceResult', () => {
  it('reads any finite number as an answer, zero included', async () => {
    assert.deepEqual(interpretMacroBalanceResult(250), { valid: true, copperValue: 250 });
    assert.deepEqual(interpretMacroBalanceResult(0), { valid: true, copperValue: 0 });
    assert.deepEqual(interpretMacroBalanceResult(-5), { valid: true, copperValue: -5 });
  });

  it('reads everything that is not a finite number as "cannot see", never as zero', async () => {
    for (const answer of [
      '250',
      '',
      true,
      false,
      null,
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      { copperValue: 250 },
      [250],
    ]) {
      const result = interpretMacroBalanceResult(answer);
      assert.equal(result.valid, false, `${JSON.stringify(answer) ?? 'undefined'} is not an answer`);
      assert.equal(
        'copperValue' in result,
        false,
        'a refusal must carry no number at all, so no caller can read one out of it'
      );
    }
  });

  it('cannot be replaced by the spend interpreter, which reads a balance as a refusal', async () => {
    // The reason this key needed its own reader, stated as a test rather than as a comment: the
    // shipped interpreter falls a bare number through to its failure branch, so a `balance` macro
    // correctly reporting 250 copper would have been read as "this actor cannot pay".
    assert.equal(interpretMacroSpendResult(250).valid, false);
    assert.equal(interpretMacroBalanceResult(250).valid, true);
  });
});

describe('MacroCoinSpender.readCoins', () => {
  it('runs the balance macro, and only the balance macro', async () => {
    const { runs, spender } = balanceSpender(250);

    const result = await spender.readCoins({ name: 'Idrin' }, {});

    assert.deepEqual(result, { valid: true, copperValue: 250 });
    assert.deepEqual(runs, [POOLED_MACROS.balance]);
  });

  it('carries a configured balance uuid through the constructor', async () => {
    // The defect this pins is silent: the constructor used to copy three NAMED keys, so a GM could
    // author a balance macro that the editor persisted, the normalizer emitted and the spender
    // discarded — with nothing anywhere reporting that the macro simply never ran.
    const { runs, spender } = balanceSpender(42, { macros: { balance: 'Macro.only-balance' } });

    await spender.readCoins({ name: 'Idrin' }, {});

    assert.deepEqual(runs, ['Macro.only-balance']);
  });

  it('reports a provable zero as zero', async () => {
    const { spender } = balanceSpender(0);

    assert.deepEqual(await spender.readCoins({ name: 'Idrin' }, {}), {
      valid: true,
      copperValue: 0,
    });
  });

  it('maps every "the macro never ran" shape to cannot-see, never to zero', async () => {
    const cases = [
      ['no balance macro is configured', { macros: {} }],
      ['the uuid resolves to nothing', { macro: null }],
      ['the document has no string command', { macro: { type: 'script' } }],
      ['the document is a chat macro', { macro: { type: 'chat', command: 'hello' } }],
      ['the command is blank', { macro: { type: 'script', command: '   ' } }],
    ];

    for (const [why, options] of cases) {
      const { spender } = balanceSpender(250, options);
      // eslint-disable-next-line no-await-in-loop
      const result = await spender.readCoins({ name: 'Idrin' }, {});

      assert.equal(result.valid, false, `${why}: must not report a balance`);
      assert.equal(
        'copperValue' in result,
        false,
        `${why}: a broken macro reported as 0 copper is the exact lie the null rule prevents`
      );
      assert.ok(result.message, `${why}: says why`);
    }
  });

  it('maps a throwing balance macro to cannot-see', async () => {
    const { spender } = balanceSpender(() => {
      throw new Error('the GM macro exploded');
    });

    const result = await spender.readCoins({ name: 'Idrin' }, {});

    assert.equal(result.valid, false);
    assert.equal('copperValue' in result, false);
    assert.equal(result.thrown, true);
    assert.equal(
      'wroteNothing' in result,
      false,
      'a throw proves nothing about writes; the credit reads `wroteNothing` before `thrown`'
    );
  });
});

describe('the balance key needs no migration', () => {
  it('backfills an existing world that predates it, at read time, without throwing', async () => {
    // Exactly what a world persisted before this key existed holds: three macro slots and no
    // fourth. `CurrencyConfigStore.load()` normalizes on EVERY read, so this is the shape the
    // runtime sees the first time anything asks — no migration step, no `migrationVersion` bump.
    const persisted = {
      spendStrategy: 'macro',
      providerId: '',
      macros: { canAfford: 'Macro.can', increment: '', decrement: 'Macro.dec' },
      units: POOLED_LADDER,
    };

    const normalized = normalizeWorldCurrencyConfig(persisted);

    assert.equal(normalized.macros.balance, '');
    assert.deepEqual(Object.keys(normalized.macros).sort(), [...CURRENCY_MACRO_KEYS].sort());
    assert.equal(normalized.macros.canAfford, 'Macro.can', 'the authored keys are untouched');
    assert.deepEqual(
      normalizeWorldCurrencyConfig(normalized),
      normalized,
      'and the backfilled shape round-trips, so no read can drift it further'
    );
  });

  it('emits the slot even when the stored config has no macros object at all', async () => {
    assert.equal(normalizeCurrencyConfig({ spendStrategy: 'macro' }).macros.balance, '');
    assert.equal(normalizeCurrencyConfig({ macros: null }).macros.balance, '');
  });

  it('leaves a macro world without a balance macro VALID', async () => {
    // On the `increment` precedent. Requiring it would invalidate every existing macro world's
    // profile at CRAFT time, because `validateCurrencyProfile` is the same gate the engine's
    // afford check and deduction run through.
    const profile = validateCurrencyProfile(POOLED_LADDER, {
      spendStrategy: 'macro',
      macros: { canAfford: 'Macro.can', decrement: 'Macro.dec' },
    });

    assert.equal(profile.valid, true, profile.errors.join('; '));
  });
});

describe('the surfaces that do not follow the vocabulary automatically', () => {
  const PROJECTIONS = [
    '../src/ui/svelte/stores/adminStore.js',
    '../src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
    '../src/ui/svelte/apps/manager/world/WorldCurrencyTab.svelte',
  ];

  it('declares every macro slot in every hardcoded empty projection', async () => {
    // These literals are only reached in the UNLOADED state, which is why a missing key is
    // invisible: everything else in the app reads the normalized config, where the slot is always
    // present. A field absent from the empty projection simply never renders until a world config
    // arrives, and nothing reports it.
    for (const path of PROJECTIONS) {
      const text = source(path);
      const counts = CURRENCY_MACRO_KEYS.map((key) => [
        key,
        text.split(`${key}: ''`).length - 1,
      ]);
      const expected = counts[0][1];
      assert.ok(expected > 0, `${path} should carry at least one empty macro projection`);
      for (const [key, count] of counts) {
        assert.equal(
          count,
          expected,
          `${path} declares ${expected} empty projections but names "${key}" in ${count} of them`
        );
      }
    }
  });

  it('offers an editor field for every macro slot', async () => {
    const text = source('../src/ui/svelte/apps/manager/world/WorldCurrencyTab.svelte');
    const fields = [...text.matchAll(/key: '([A-Za-z]+)',/g)].map((match) => match[1]);

    assert.deepEqual(
      fields.sort(),
      [...CURRENCY_MACRO_KEYS].sort(),
      'a slot with no field is a macro a GM has no way to author'
    );
  });
});

/**
 * The three tokens the pooled currency pair answers that the contract did not declare while it
 * had no member able to emit them. `currencyAffordance.js` spelled them locally in an explicit
 * FORWARD REFERENCE, and this guard compared the two spellings so they could not diverge.
 */
const POOLED_CURRENCY_TOKENS = Object.freeze([
  'insufficient',
  'balanceNotConfigured',
  'consumeFailed',
]);

describe('the pooled outcome tokens', () => {
  it('are answered through the contract, with no second vocabulary beside it', () => {
    // The forward reference is retired: the contract declares all three beside the pooled members
    // that answer them (issue 1342). So the guard that once compared two spellings now pins the
    // single home against the module that answers with it — and reds if a second one reappears,
    // which is the whole failure the forward reference was written to be safe from.
    const text = source('../src/systems/currencyAffordance.js');
    for (const token of POOLED_CURRENCY_TOKENS) {
      assert.equal(
        COMPANION_OUTCOMES[token],
        token,
        `the contract declares "${token}", and a token is its own key`
      );
      assert.ok(
        text.includes(`COMPANION_OUTCOMES.${token}`),
        `the pooled currency pair must answer "${token}" through the contract`
      );
    }
    assert.equal(
      text.includes('POOLED_CURRENCY_OUTCOMES = '),
      false,
      'a local pooled-outcome block is two vocabularies for one fact'
    );
  });
});
