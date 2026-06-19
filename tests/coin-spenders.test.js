import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ActorInventoryCoinSpender,
  ActorPropertyCoinSpender,
  MacroCoinSpender,
  interpretMacroSpendResult,
} from '../src/systems/CoinSpenders.js';
import { validateCurrencyProfile } from '../src/systems/currencyProfile.js';

const DND5E_UNITS = [
  { id: 'gp', label: 'Gold', abbreviation: 'gp', actorPath: 'system.currency.gp', contains: [{ unitId: 'sp', amount: 10 }] },
  { id: 'sp', label: 'Silver', abbreviation: 'sp', actorPath: 'system.currency.sp', contains: [] },
];

function dnd5eProfile() {
  const profile = validateCurrencyProfile(DND5E_UNITS, { spendStrategy: 'actorProperty' });
  assert.equal(profile.valid, true);
  return profile;
}

function propertyActor(currency) {
  return { name: 'Hero', system: { currency } };
}

function profileCtx(profile, unitId) {
  const unit = profile.units.find((entry) => entry.id === unitId);
  return { profile, unit, units: profile.units };
}

test('ActorPropertyCoinSpender.check passes when affordable and fails when short', () => {
  globalThis.foundry = undefined;
  const profile = dnd5eProfile();
  const spender = new ActorPropertyCoinSpender();

  const rich = spender.check(propertyActor({ gp: 5, sp: 0 }), { amount: 3 }, profileCtx(profile, 'gp'));
  assert.equal(rich.valid, true);

  const poor = spender.check(propertyActor({ gp: 1, sp: 0 }), { amount: 3 }, profileCtx(profile, 'gp'));
  assert.equal(poor.valid, false);
  assert.match(poor.message, /Insufficient currency/i);
  assert.match(poor.message, /3 gp/);
});

test('ActorInventoryCoinSpender.check reports affordability and missing adapter', () => {
  const profile = validateCurrencyProfile(
    [{ id: 'gp', label: 'Gold', abbreviation: 'gp', denomination: 'gp' }],
    { spendStrategy: 'actorInventory' }
  );
  assert.equal(profile.valid, true);

  const adapter = { readCoins: () => ({ copperValue: 500 }) };
  const spender = new ActorInventoryCoinSpender({
    adapters: new Map([['pf2e', adapter]]),
    getSystemId: () => 'pf2e',
  });
  const ctx = profileCtx(profile, 'gp');
  assert.equal(spender.check({ name: 'A' }, { amount: 3 }, ctx).valid, true);
  assert.equal(spender.check({ name: 'A' }, { amount: 600 }, ctx).valid, false);

  const noAdapter = new ActorInventoryCoinSpender({ adapters: new Map(), getSystemId: () => 'pf2e' });
  const missing = noAdapter.check({ name: 'A' }, { amount: 1 }, ctx);
  assert.equal(missing.valid, false);
  assert.match(missing.message, /no currency inventory adapter/i);
});

test('interpretMacroSpendResult interprets the macro return contract', () => {
  assert.deepEqual(interpretMacroSpendResult(true), { valid: true });
  assert.deepEqual(interpretMacroSpendResult({ success: true }), { valid: true });
  assert.deepEqual(interpretMacroSpendResult({ canAfford: true }), { valid: true });

  assert.equal(interpretMacroSpendResult(false, { fallbackMessage: 'nope' }).valid, false);
  assert.equal(interpretMacroSpendResult(false, { fallbackMessage: 'nope' }).message, 'nope');
  assert.equal(interpretMacroSpendResult(null).valid, false);

  const withMessage = interpretMacroSpendResult({ canAfford: false, message: 'broke' });
  assert.equal(withMessage.valid, false);
  assert.equal(withMessage.message, 'broke');

  // Falsy success object falls back to the default message when none is supplied.
  const noMessage = interpretMacroSpendResult({ success: false });
  assert.equal(noMessage.valid, false);
  assert.ok(noMessage.message.length > 0);
});

test('MacroCoinSpender runs canAfford for check and decrement for spend, never increment', async () => {
  const runs = [];
  const runMacro = async (uuid, context) => {
    runs.push({ uuid, context });
    return true;
  };
  const spender = new MacroCoinSpender({
    macros: { canAfford: 'Macro.can', increment: 'Macro.inc', decrement: 'Macro.dec' },
    runMacro,
  });
  const ctx = { macroContext: { actor: { name: 'Hero' }, cost: [{ abbreviation: 'gp', amount: 2 }] } };

  const check = await spender.check({ name: 'Hero' }, { amount: 2 }, ctx);
  assert.equal(check.valid, true);
  const spend = await spender.spend({ name: 'Hero' }, { amount: 2 }, ctx);
  assert.equal(spend.valid, true);

  assert.deepEqual(runs.map((entry) => entry.uuid), ['Macro.can', 'Macro.dec']);
  assert.ok(!runs.some((entry) => entry.uuid === 'Macro.inc'));
  assert.equal(runs[0].context.actor.name, 'Hero');
});

test('MacroCoinSpender surfaces failure objects and thrown errors as invalid', async () => {
  const failSpender = new MacroCoinSpender({
    macros: { canAfford: 'Macro.can', decrement: 'Macro.dec' },
    runMacro: async () => ({ canAfford: false, message: 'Too poor' }),
  });
  const failed = await failSpender.check({ name: 'Hero' }, { amount: 2 }, { macroContext: {} });
  assert.equal(failed.valid, false);
  assert.match(failed.message, /Too poor/);

  const throwSpender = new MacroCoinSpender({
    macros: { canAfford: 'Macro.can', decrement: 'Macro.dec' },
    runMacro: async () => {
      throw new Error('macro blew up');
    },
  });
  const thrown = await throwSpender.spend({ name: 'Hero' }, { amount: 2 }, { macroContext: {} });
  assert.equal(thrown.valid, false);

  // A missing/unconfigured macro key is invalid, not a silent pass.
  const emptySpender = new MacroCoinSpender({ macros: {}, runMacro: async () => true });
  const noConfig = await emptySpender.check({ name: 'Hero' }, { amount: 2 }, { macroContext: {} });
  assert.equal(noConfig.valid, false);
});
