import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DND5E_CURRENCY_PRESETS,
  PF2E_CURRENCY_PRESETS,
  seedCurrencyPresets,
} from '../src/config/currencyPresets.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { CraftingSystemManager } from '../src/systems/CraftingSystemManager.js';
import {
  buildCurrencySpendUpdates,
  normalizeCurrencyConfig,
  normalizeCurrencyUnit,
  readCurrencyBalances,
  validateCurrencyProfile,
} from '../src/systems/currencyProfile.js';

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

function setProperty(object, path, value) {
  const parts = String(path).split('.');
  let target = object;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    target[key] = target[key] || {};
    target = target[key];
  }
  target[parts[parts.length - 1]] = value;
}

function setupGlobals(systemConfig) {
  globalThis.foundry = {
    utils: {
      getProperty,
      randomID: () => 'generated-id',
    },
  };
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: () => systemConfig,
      }),
    },
  };
}

function buildActor(name, currency) {
  return {
    name,
    system: { currency },
    async update(payload) {
      for (const [path, value] of Object.entries(payload || {})) {
        setProperty(this, path, value);
      }
      return this;
    },
  };
}

function recipeAndStep(unit = 'sp', amount = 1) {
  return {
    recipe: {
      craftingSystemId: 'sys-1',
      toJSON: () => ({ id: 'recipe-1' }),
    },
    step: {
      currencyRequirement: { unit, amount },
    },
  };
}

test('currency profile validation rejects circular and stale sub-unit references', () => {
  const circular = validateCurrencyProfile([
    { id: 'gp', label: 'Gold', abbreviation: 'gp', actorPath: 'system.currency.gp', contains: [{ unitId: 'sp', amount: 10 }] },
    { id: 'sp', label: 'Silver', abbreviation: 'sp', actorPath: 'system.currency.sp', contains: [{ unitId: 'gp', amount: 10 }] },
  ]);
  assert.equal(circular.valid, false);
  assert.match(circular.errors.join('; '), /circular reference/i);

  const stale = validateCurrencyProfile([
    { id: 'gp', label: 'Gold', abbreviation: 'gp', actorPath: 'system.currency.gp', contains: [{ unitId: 'missing', amount: 10 }] },
  ]);
  assert.equal(stale.valid, false);
  assert.match(stale.errors.join('; '), /unknown unit/i);
});

test('CraftingSystemManager normalizes legacy system adapter currency to seeded units', () => {
  setupGlobals({});
  const manager = new CraftingSystemManager({});
  const normalized = manager._normalizeRequirements({
    currency: {
      enabled: true,
      provider: 'system',
      systemAdapter: 'dnd5e',
    },
  });
  assert.equal(normalized.currency.enabled, true);
  assert.equal(normalized.currency.units.length, DND5E_CURRENCY_PRESETS.length);
  assert.equal('provider' in normalized.currency, false);
  assert.equal('systemAdapter' in normalized.currency, false);
});

test('CraftingEngine checks and decrements exact configured currency units', async () => {
  const system = {
    requirements: {
      currency: { enabled: true, units: DND5E_CURRENCY_PRESETS },
    },
  };
  setupGlobals(system);
  const engine = new CraftingEngine({});
  const { recipe, step } = recipeAndStep('gp', 3);
  const actor = buildActor('Rich', { cp: 0, sp: 0, ep: 0, gp: 10, pp: 0 });

  const check = await engine._checkCurrencyRequirement(actor, recipe, step);
  assert.equal(check.valid, true);

  const decrement = await engine._decrementCurrencyRequirement(actor, recipe, step);
  assert.equal(decrement.valid, true);
  assert.equal(actor.system.currency.gp, 7);
});

test('CraftingEngine spends lower denominations for a higher-unit requirement', async () => {
  const system = {
    requirements: {
      currency: { enabled: true, units: DND5E_CURRENCY_PRESETS },
    },
  };
  setupGlobals(system);
  const engine = new CraftingEngine({});
  const { recipe, step } = recipeAndStep('gp', 1);
  const actor = buildActor('Silver Saver', { cp: 0, sp: 10, ep: 0, gp: 0, pp: 0 });

  const decrement = await engine._decrementCurrencyRequirement(actor, recipe, step);
  assert.equal(decrement.valid, true);
  assert.equal(actor.system.currency.sp, 0);
  assert.equal(actor.system.currency.gp, 0);
});

test('CraftingEngine makes change only in the required and smaller denominations', async () => {
  // Change is returned across the required unit and smaller denominations only, largest
  // first. Spending sp x1 from gp x1 overpays by 90 cp, which returns 9 sp rather than
  // 1 ep + 4 sp: electrum is larger than the required silver unit and is excluded so the
  // craft never hands back a coin nobody wants.
  const system = {
    requirements: {
      currency: { enabled: true, units: DND5E_CURRENCY_PRESETS },
    },
  };
  setupGlobals(system);
  const engine = new CraftingEngine({});
  const { recipe, step } = recipeAndStep('sp', 1);
  const actor = buildActor('Gold Breaker', { cp: 0, sp: 0, ep: 0, gp: 1, pp: 0 });

  const decrement = await engine._decrementCurrencyRequirement(actor, recipe, step);
  assert.equal(decrement.valid, true);
  assert.equal(actor.system.currency.gp, 0);
  assert.equal(actor.system.currency.ep, 0);
  assert.equal(actor.system.currency.sp, 9);
  assert.equal(actor.system.currency.cp, 0);
});

test('CraftingEngine rejects insufficient currency, missing actor paths, and legacy macro configs', async () => {
  const system = {
    requirements: {
      currency: { enabled: true, units: DND5E_CURRENCY_PRESETS },
    },
  };
  setupGlobals(system);
  const engine = new CraftingEngine({});
  const { recipe, step } = recipeAndStep('gp', 3);

  const poorActor = buildActor('Poor', { cp: 0, sp: 0, ep: 0, gp: 2, pp: 0 });
  const poorCheck = await engine._checkCurrencyRequirement(poorActor, recipe, step);
  assert.equal(poorCheck.valid, false);
  assert.match(poorCheck.message, /Insufficient currency/i);

  // A missing actor path is read as a balance of 0 (NPCs / custom denominations
  // that never carry this coin) and falls through to insufficient-currency, not a
  // hard "not available" profile failure.
  const missingPathActor = buildActor('No Gold Slot', { cp: 0, sp: 0, ep: 0, pp: 0 });
  delete missingPathActor.system.currency.gp;
  const missingCheck = await engine._checkCurrencyRequirement(missingPathActor, recipe, step);
  assert.equal(missingCheck.valid, false);
  assert.match(missingCheck.message, /Insufficient currency/i);

  // A PRESENT but non-numeric value remains a hard "not available" failure.
  const corruptActor = buildActor('Corrupt Copper', { cp: 'abc', sp: 0, ep: 0, gp: 3, pp: 0 });
  const corruptCheck = await engine._checkCurrencyRequirement(corruptActor, recipe, step);
  assert.equal(corruptCheck.valid, false);
  assert.match(corruptCheck.message, /Copper.*not available/i);

  setupGlobals({
    requirements: {
      currency: {
        enabled: true,
        provider: 'macro',
        checkCurrencyMacroUuid: 'Macro.check',
        decrementCurrencyMacroUuid: 'Macro.dec',
      },
    },
  });
  const macroCheck = await engine._checkCurrencyRequirement(poorActor, recipe, step);
  assert.equal(macroCheck.valid, false);
  assert.match(macroCheck.message, /Currency configuration is invalid/i);
});

test('change-making breaks multiple higher coins when one coin underpays', async () => {
  // Regression: requiring gp x11 (1100 cp) while holding only pp x2 (2000 cp) must
  // break BOTH platinum coins, not declare a single 1000 cp coin sufficient.
  const system = {
    requirements: {
      currency: { enabled: true, units: DND5E_CURRENCY_PRESETS },
    },
  };
  setupGlobals(system);
  const engine = new CraftingEngine({});
  const { recipe, step } = recipeAndStep('gp', 11);
  const actor = buildActor('Platinum Hoarder', { cp: 0, sp: 0, ep: 0, gp: 0, pp: 2 });

  const check = await engine._checkCurrencyRequirement(actor, recipe, step);
  assert.equal(check.valid, true);

  const decrement = await engine._decrementCurrencyRequirement(actor, recipe, step);
  assert.equal(decrement.valid, true);
  // 1100 spent from 2000: both pp broken, 900 returned as change (9 gp).
  assert.equal(actor.system.currency.pp, 0);
  assert.equal(actor.system.currency.gp, 9);
  assert.equal(actor.system.currency.sp, 0);
  assert.equal(actor.system.currency.cp, 0);
  assert.equal(actor.system.currency.ep, 0);
});

test('change-making with a single higher coin underpay aborts the craft', async () => {
  // The same shortfall must NOT green-light the craft: gp x11 (1100) with only pp x1
  // (1000) is short by 100 and must be rejected.
  const system = {
    requirements: {
      currency: { enabled: true, units: DND5E_CURRENCY_PRESETS },
    },
  };
  setupGlobals(system);
  const engine = new CraftingEngine({});
  const { recipe, step } = recipeAndStep('gp', 11);
  const actor = buildActor('Short By One', { cp: 0, sp: 0, ep: 0, gp: 0, pp: 1 });

  const check = await engine._checkCurrencyRequirement(actor, recipe, step);
  assert.equal(check.valid, false);
  assert.match(check.message, /Insufficient currency/i);
});

// A clean three-tier ladder (no electrum) so exact-change assertions are unambiguous.
const GP_SP_CP_UNITS = [
  { id: 'cp', label: 'Copper', abbreviation: 'cp', actorPath: 'system.currency.cp', contains: [] },
  {
    id: 'sp',
    label: 'Silver',
    abbreviation: 'sp',
    actorPath: 'system.currency.sp',
    contains: [{ unitId: 'cp', amount: 10 }],
  },
  {
    id: 'gp',
    label: 'Gold',
    abbreviation: 'gp',
    actorPath: 'system.currency.gp',
    contains: [{ unitId: 'cp', amount: 100 }],
  },
];

test('spending one cp from one gp returns change in the required unit only', async () => {
  // gp x1 (100 cp), spend cp x1. Change is restricted to the required unit and smaller,
  // so the 99 cp overpay is returned entirely in copper rather than rolled up into silver.
  const system = {
    requirements: {
      currency: { enabled: true, units: GP_SP_CP_UNITS },
    },
  };
  setupGlobals(system);
  const engine = new CraftingEngine({});
  const { recipe, step } = recipeAndStep('cp', 1);
  const actor = buildActor('Penny Breaker', { cp: 0, sp: 0, gp: 1 });

  const decrement = await engine._decrementCurrencyRequirement(actor, recipe, step);
  assert.equal(decrement.valid, true);
  assert.equal(actor.system.currency.gp, 0);
  assert.equal(actor.system.currency.sp, 0);
  assert.equal(actor.system.currency.cp, 99);
});

function buildPf2eActor(coins, removeImpl) {
  const inventory = {
    coins: {
      ...coins,
      copperValue:
        (coins.cp || 0) + (coins.sp || 0) * 10 + (coins.gp || 0) * 100 + (coins.pp || 0) * 1000,
    },
    removeCoins: removeImpl,
  };
  return { name: 'PF2e Hero', inventory };
}

test('pf2e currency spend uses the coinSpender and never calls actor.update', async () => {
  const system = {
    requirements: {
      currency: {
        enabled: true,
        spendStrategy: 'pf2eInventory',
        units: PF2E_CURRENCY_PRESETS,
      },
    },
  };
  setupGlobals(system);

  const spendCalls = [];
  const coinSpender = {
    readCoins: (actor) => (actor?.inventory?.coins ? { ...actor.inventory.coins } : null),
    async spend(actor, payload) {
      spendCalls.push({ actor, payload });
      return { valid: true };
    },
  };
  const engine = new CraftingEngine({}, null, null, null, null, coinSpender);
  const { recipe, step } = recipeAndStep('gp', 3);

  let updateCalled = false;
  const actor = buildPf2eActor({ pp: 0, gp: 5, sp: 0, cp: 0 }, async () => true);
  actor.update = async () => {
    updateCalled = true;
  };

  const check = await engine._checkCurrencyRequirement(actor, recipe, step);
  assert.equal(check.valid, true);

  const decrement = await engine._decrementCurrencyRequirement(actor, recipe, step);
  assert.equal(decrement.valid, true);
  assert.equal(updateCalled, false, 'pf2e path must not call actor.update');
  assert.equal(spendCalls.length, 1);
  assert.equal(spendCalls[0].payload.unit.id, 'gp');
  assert.equal(spendCalls[0].payload.unit.denomination, 'gp');
  assert.equal(spendCalls[0].payload.amount, 3);
});

test('pf2e currency spend returning {valid:false} aborts the craft', async () => {
  const system = {
    requirements: {
      currency: {
        enabled: true,
        spendStrategy: 'pf2eInventory',
        units: PF2E_CURRENCY_PRESETS,
      },
    },
  };
  setupGlobals(system);

  const coinSpender = {
    readCoins: (actor) => (actor?.inventory?.coins ? { ...actor.inventory.coins } : null),
    async spend() {
      return { valid: false, message: 'Insufficient currency.' };
    },
  };
  const engine = new CraftingEngine({}, null, null, null, null, coinSpender);
  const { recipe, step } = recipeAndStep('gp', 3);
  const actor = buildPf2eActor({ pp: 0, gp: 5, sp: 0, cp: 0 }, async () => false);

  const decrement = await engine._decrementCurrencyRequirement(actor, recipe, step);
  assert.equal(decrement.valid, false);
  assert.match(decrement.message, /Insufficient currency/i);
});

test('pf2e currency check rejects an actor with no pf2e inventory', async () => {
  const system = {
    requirements: {
      currency: {
        enabled: true,
        spendStrategy: 'pf2eInventory',
        units: PF2E_CURRENCY_PRESETS,
      },
    },
  };
  setupGlobals(system);
  const coinSpender = {
    readCoins: (actor) => (actor?.inventory?.coins ? { ...actor.inventory.coins } : null),
    async spend() {
      return { valid: true };
    },
  };
  const engine = new CraftingEngine({}, null, null, null, null, coinSpender);
  const { recipe, step } = recipeAndStep('gp', 1);
  const actor = buildActor('Non-PF2e', { cp: 0, sp: 0, gp: 0, pp: 0 });

  const check = await engine._checkCurrencyRequirement(actor, recipe, step);
  assert.equal(check.valid, false);
  assert.match(check.message, /not available/i);
});

test('dnd5e currency spend calls actor.update and never the coinSpender', async () => {
  const system = {
    requirements: {
      currency: { enabled: true, units: DND5E_CURRENCY_PRESETS },
    },
  };
  setupGlobals(system);
  let spendCalled = false;
  const coinSpender = {
    readCoins: () => null,
    async spend() {
      spendCalled = true;
      return { valid: true };
    },
  };
  const engine = new CraftingEngine({}, null, null, null, null, coinSpender);
  const { recipe, step } = recipeAndStep('gp', 3);
  const actor = buildActor('Rich', { cp: 0, sp: 0, ep: 0, gp: 10, pp: 0 });

  const decrement = await engine._decrementCurrencyRequirement(actor, recipe, step);
  assert.equal(decrement.valid, true);
  assert.equal(spendCalled, false, 'dataPath path must not call coinSpender.spend');
  assert.equal(actor.system.currency.gp, 7);
});

test('readCurrencyBalances treats missing paths as zero and present non-numeric as not available', () => {
  const units = [
    { id: 'cp', label: 'Copper', abbreviation: 'cp', actorPath: 'system.currency.cp', contains: [] },
    { id: 'gp', label: 'Gold', abbreviation: 'gp', actorPath: 'system.currency.gp', contains: [] },
  ];
  setupGlobals({});

  const missing = readCurrencyBalances({ system: { currency: { gp: 5 } } }, units);
  assert.equal(missing.valid, true);
  assert.equal(missing.balances.get('cp'), 0);
  assert.equal(missing.balances.get('gp'), 5);

  const corrupt = readCurrencyBalances({ system: { currency: { cp: 'abc', gp: 5 } } }, units);
  assert.equal(corrupt.valid, false);
  assert.match(corrupt.message, /Copper.*not available/i);
});

test('validateCurrencyProfile rejects a unit that references its own id', () => {
  const result = validateCurrencyProfile([
    {
      id: 'gp',
      label: 'Gold',
      abbreviation: 'gp',
      actorPath: 'system.currency.gp',
      contains: [{ unitId: 'gp', amount: 10 }],
    },
  ]);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('; '), /cannot contain itself/i);
});

test('validateCurrencyProfile surfaces non-integer and non-positive sub-unit amounts', () => {
  const fractional = validateCurrencyProfile([
    { id: 'cp', label: 'Copper', abbreviation: 'cp', actorPath: 'system.currency.cp', contains: [] },
    {
      id: 'sp',
      label: 'Silver',
      abbreviation: 'sp',
      actorPath: 'system.currency.sp',
      contains: [{ unitId: 'cp', amount: 2.5 }],
    },
  ]);
  assert.equal(fractional.valid, false);
  assert.match(fractional.errors.join('; '), /invalid sub-unit amount/i);

  const nonPositive = validateCurrencyProfile([
    { id: 'cp', label: 'Copper', abbreviation: 'cp', actorPath: 'system.currency.cp', contains: [] },
    {
      id: 'sp',
      label: 'Silver',
      abbreviation: 'sp',
      actorPath: 'system.currency.sp',
      contains: [{ unitId: 'cp', amount: 0 }],
    },
  ]);
  assert.equal(nonPositive.valid, false);
  assert.match(nonPositive.errors.join('; '), /invalid sub-unit amount/i);
});

test('validateCurrencyProfile applies the conditional actorPath vs denomination rule', () => {
  // dataPath: actorPath required, missing one is invalid.
  const dataPathMissing = validateCurrencyProfile(
    [{ id: 'gp', label: 'Gold', abbreviation: 'gp', contains: [] }],
    { spendStrategy: 'dataPath' }
  );
  assert.equal(dataPathMissing.valid, false);
  assert.match(dataPathMissing.errors.join('; '), /actor data path/i);

  // pf2eInventory: actorPath not required; a valid denomination passes.
  const pf2eValid = validateCurrencyProfile(
    [{ id: 'gp', label: 'Gold', abbreviation: 'gp', denomination: 'gp', contains: [] }],
    { spendStrategy: 'pf2eInventory' }
  );
  assert.equal(pf2eValid.valid, true);

  // pf2eInventory: a unit whose id/denomination is not a pf2e coin is invalid.
  const pf2eInvalid = validateCurrencyProfile(
    [{ id: 'shards', label: 'Shards', abbreviation: 'sh', contains: [] }],
    { spendStrategy: 'pf2eInventory' }
  );
  assert.equal(pf2eInvalid.valid, false);
  assert.match(pf2eInvalid.errors.join('; '), /pf2e denomination/i);

  // pf2eInventory: denomination defaults to the unit id (cp is valid).
  const pf2eDefault = validateCurrencyProfile(
    [{ id: 'cp', label: 'Copper', abbreviation: 'cp', contains: [] }],
    { spendStrategy: 'pf2eInventory' }
  );
  assert.equal(pf2eDefault.valid, true);
});

test('normalizeCurrencyConfig normalizes spendStrategy and unit denomination', () => {
  const normalized = normalizeCurrencyConfig({
    enabled: true,
    spendStrategy: 'pf2eInventory',
    units: [{ id: 'gp', label: 'Gold', denomination: ' gp ', actorPath: '' }],
  });
  assert.equal(normalized.spendStrategy, 'pf2eInventory');
  assert.equal(normalized.units[0].denomination, 'gp');

  const fallback = normalizeCurrencyConfig({ enabled: true, spendStrategy: 'bogus', units: [] });
  assert.equal(fallback.spendStrategy, 'dataPath');

  const noDenom = normalizeCurrencyUnit({ id: 'gp', actorPath: 'system.currency.gp' });
  assert.equal('denomination' in noDenom, false);
});

test('CraftingSystemManager normalizes legacy pf2e adapter to pf2eInventory units', () => {
  setupGlobals({});
  const manager = new CraftingSystemManager({});
  const normalized = manager._normalizeRequirements({
    currency: {
      enabled: true,
      provider: 'system',
      systemAdapter: 'pf2e',
    },
  });
  assert.equal(normalized.currency.enabled, true);
  assert.equal(normalized.currency.spendStrategy, 'pf2eInventory');
  assert.equal(normalized.currency.units.length, PF2E_CURRENCY_PRESETS.length);
  const gp = normalized.currency.units.find((unit) => unit.id === 'gp');
  assert.equal(gp.denomination, 'gp');
});

test('seedCurrencyPresets preserves the pf2e denomination field', () => {
  const { added } = seedCurrencyPresets({ presets: PF2E_CURRENCY_PRESETS, currentUnits: [] });
  const gp = added.find((unit) => unit.id === 'gp');
  assert.equal(gp.denomination, 'gp');
  // Idempotent: re-seeding over existing units adds nothing and keeps user edits.
  const second = seedCurrencyPresets({ presets: PF2E_CURRENCY_PRESETS, currentUnits: added });
  assert.equal(second.added.length, 0);
});

test('buildCurrencySpendUpdates stays exact when paying with mixed denominations', () => {
  // gp x2 requirement (200 cp), actor has gp:1, sp:9, cp:10 -> exactly 200 cp.
  setupGlobals({});
  const actor = {
    name: 'Exact',
    system: { currency: { cp: 10, sp: 9, ep: 0, gp: 1, pp: 0 } },
  };
  const result = buildCurrencySpendUpdates(actor, { unit: 'gp', amount: 2 }, DND5E_CURRENCY_PRESETS);
  assert.equal(result.valid, true);
  assert.equal(result.updates['system.currency.cp'], 0);
  assert.equal(result.updates['system.currency.sp'], 0);
  assert.equal(result.updates['system.currency.gp'], 0);
});
