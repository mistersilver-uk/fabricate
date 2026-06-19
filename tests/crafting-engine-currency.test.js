import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DND5E_CURRENCY_PRESETS,
  PF2E_CURRENCY_PRESETS,
  seedCurrencyPresets,
} from '../src/config/currencyPresets.js';
import { ActorInventoryCoinSpender } from '../src/systems/CoinSpenders.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { CraftingSystemManager } from '../src/systems/CraftingSystemManager.js';
import { Pf2eInventoryCoinAdapter } from '../src/systems/Pf2eInventoryCoinAdapter.js';
import {
  buildCurrencySpendUpdates,
  canAddCurrencySubUnit,
  currencySubUnitOptions,
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

// Sub-unit eligibility and conflicting-conversion-path rule:
// reachable(parent) ∩ reachable(child) must be empty.
function ladderUnit(id, contains = []) {
  return { id, label: id, abbreviation: id, actorPath: `system.currency.${id}`, contains };
}

test('canAddCurrencySubUnit rejects a descendant reachable through an existing chain', () => {
  // Chain P -> A -> B -> C. Adding C directly to P would give P two paths to C.
  const units = [
    ladderUnit('p', [{ unitId: 'a', amount: 10 }]),
    ladderUnit('a', [{ unitId: 'b', amount: 10 }]),
    ladderUnit('b', [{ unitId: 'c', amount: 10 }]),
    ladderUnit('c'),
  ];
  assert.equal(canAddCurrencySubUnit(units, 'p', 'c'), false);
  assert.equal(canAddCurrencySubUnit(units, 'p', 'b'), false);
  // A still legitimately reaches C and B; adding the next rung in a fresh chain is fine.
  assert.equal(canAddCurrencySubUnit(units, 'c', 'p'), false); // cycle
});

test('validateCurrencyProfile rejects a unit with two paths to the same descendant', () => {
  // P -> A -> B -> C and also P -> C: two distinct paths to C.
  const chainConflict = validateCurrencyProfile([
    ladderUnit('p', [
      { unitId: 'a', amount: 10 },
      { unitId: 'c', amount: 1000 },
    ]),
    ladderUnit('a', [{ unitId: 'b', amount: 10 }]),
    ladderUnit('b', [{ unitId: 'c', amount: 10 }]),
    ladderUnit('c'),
  ]);
  assert.equal(chainConflict.valid, false);
  assert.match(chainConflict.errors.join('; '), /conflicting conversion paths to "c"/i);
});

test('canAddCurrencySubUnit rejects a diamond (shared child via the new edge)', () => {
  // gp -> sp; ep -> sp. Adding ep to gp gives gp two paths to sp (gp->sp and gp->ep->sp).
  const units = [
    ladderUnit('gp', [{ unitId: 'sp', amount: 10 }]),
    ladderUnit('ep', [{ unitId: 'sp', amount: 5 }]),
    ladderUnit('sp'),
  ];
  assert.equal(canAddCurrencySubUnit(units, 'gp', 'ep'), false);
});

test('validateCurrencyProfile allows a node shared by two different parents', () => {
  // The legitimate DAG: gp -> sp and ep -> sp built separately is valid (no single unit reaches sp
  // twice). sp is still addable to a fresh parent.
  const units = [
    ladderUnit('gp', [{ unitId: 'sp', amount: 10 }]),
    ladderUnit('ep', [{ unitId: 'sp', amount: 5 }]),
    ladderUnit('sp', [{ unitId: 'cp', amount: 10 }]),
    ladderUnit('cp'),
    ladderUnit('pp'),
  ];
  const profile = validateCurrencyProfile(units);
  assert.equal(profile.valid, true, profile.errors.join('; '));
  // pp has nothing in common with sp's subtree, so sp remains addable to it.
  assert.equal(canAddCurrencySubUnit(units, 'pp', 'sp'), true);
});

test('canAddCurrencySubUnit still excludes self, already-contained, and cycles', () => {
  const units = [
    ladderUnit('gp', [{ unitId: 'sp', amount: 10 }]),
    ladderUnit('sp', [{ unitId: 'cp', amount: 10 }]),
    ladderUnit('cp'),
  ];
  assert.equal(canAddCurrencySubUnit(units, 'gp', 'gp'), false); // self
  assert.equal(canAddCurrencySubUnit(units, 'gp', 'sp'), false); // already contained
  assert.equal(canAddCurrencySubUnit(units, 'gp', 'cp'), false); // descendant
  assert.equal(canAddCurrencySubUnit(units, 'cp', 'gp'), false); // cycle
  assert.equal(canAddCurrencySubUnit(units, 'sp', 'gp'), false); // cycle (sp reaches cp, gp reaches sp,cp)
});

test('currencySubUnitOptions only offers conflict-free sub-units', () => {
  const units = [
    ladderUnit('gp', [{ unitId: 'sp', amount: 10 }]),
    ladderUnit('sp', [{ unitId: 'cp', amount: 10 }]),
    ladderUnit('cp'),
    ladderUnit('gem'),
  ];
  const options = currencySubUnitOptions(units, 'gp').map((option) => option.id);
  // gp already reaches sp and cp; gem is unrelated and eligible.
  assert.deepEqual(options, ['gem']);
});

test('normalizeCurrencyConfig defaults, trims, and drops the legacy inventoryMode field', () => {
  const defaults = normalizeCurrencyConfig({ enabled: true });
  assert.equal('inventoryMode' in defaults, false);
  assert.equal(defaults.spendStrategy, 'actorProperty');
  assert.equal(defaults.providerId, '');
  assert.deepEqual(defaults.macros, { canAfford: '', increment: '', decrement: '' });

  const trimmed = normalizeCurrencyConfig({
    enabled: true,
    spendStrategy: 'macro',
    providerId: '  pf2e-inventory  ',
    macros: { canAfford: '  Macro.a  ', increment: '', decrement: 'Macro.d', bogus: 'x' },
  });
  assert.equal(trimmed.spendStrategy, 'macro');
  assert.equal('inventoryMode' in trimmed, false);
  assert.equal(trimmed.providerId, 'pf2e-inventory');
  assert.deepEqual(trimmed.macros, { canAfford: 'Macro.a', increment: '', decrement: 'Macro.d' });

  // Legacy nested actorInventory + inventoryMode: 'macro' maps forward to the peer macro strategy
  // and drops inventoryMode; round-trips stably.
  const legacy = normalizeCurrencyConfig({
    spendStrategy: 'actorInventory',
    inventoryMode: 'macro',
  });
  assert.equal(legacy.spendStrategy, 'macro');
  assert.equal('inventoryMode' in legacy, false);
  assert.deepEqual(normalizeCurrencyConfig(legacy), legacy);

  // An unknown spendStrategy falls back to actorProperty.
  const fallback = normalizeCurrencyConfig({ spendStrategy: 'nonsense' });
  assert.equal(fallback.spendStrategy, 'actorProperty');
});

test('validateCurrencyProfile enforces macro config and actorInventory denominations', () => {
  const units = [{ id: 'gp', label: 'Gold', abbreviation: 'gp' }];

  const missingMacros = validateCurrencyProfile(units, {
    spendStrategy: 'macro',
    macros: {},
  });
  assert.equal(missingMacros.valid, false);
  assert.match(missingMacros.errors.join('; '), /can afford/i);
  assert.match(missingMacros.errors.join('; '), /decrement/i);

  // increment stays optional.
  const incrementOptional = validateCurrencyProfile(units, {
    spendStrategy: 'macro',
    macros: { canAfford: 'Macro.a', decrement: 'Macro.d' },
  });
  assert.equal(incrementOptional.valid, true);

  // actorInventory still requires a pf2e denomination, not a macro set. The unit id "coins"
  // is not a pf2e denomination and carries no explicit denomination, so it fails.
  const providerUnits = [{ id: 'coins', label: 'Coins', abbreviation: 'c' }];
  const inventoryMode = validateCurrencyProfile(providerUnits, {
    spendStrategy: 'actorInventory',
  });
  assert.equal(inventoryMode.valid, false);
  assert.match(inventoryMode.errors.join('; '), /denomination/i);

  // The same unit is fine under the macro strategy (abbreviation present, macros configured).
  const macroOk = validateCurrencyProfile(providerUnits, {
    spendStrategy: 'macro',
    macros: { canAfford: 'Macro.a', decrement: 'Macro.d' },
  });
  assert.equal(macroOk.valid, true);

  // actorProperty still requires an actor path.
  const propertyMode = validateCurrencyProfile(units, { spendStrategy: 'actorProperty' });
  assert.equal(propertyMode.valid, false);
  assert.match(propertyMode.errors.join('; '), /actor data path/i);
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

test('actorInventory currency spend uses the inventory spender and never calls actor.update', async () => {
  const system = {
    requirements: {
      currency: {
        enabled: true,
        spendStrategy: 'actorInventory',
        units: PF2E_CURRENCY_PRESETS,
      },
    },
  };
  setupGlobals(system);

  const spendCalls = [];
  const inventorySpender = {
    readCoins: (actor) =>
      actor?.inventory?.coins
        ? { valid: true, copperValue: Number(actor.inventory.coins.copperValue) || 0 }
        : { valid: false, message: 'not available' },
    check(actor) {
      return actor?.inventory?.coins
        ? { valid: true }
        : { valid: false, message: 'not available' };
    },
    async spend(actor, payload) {
      spendCalls.push({ actor, payload });
      return { valid: true };
    },
  };
  const engine = new CraftingEngine({}, null, null, null, null, inventorySpender);
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

test('actorInventory currency spend returning {valid:false} aborts the craft', async () => {
  const system = {
    requirements: {
      currency: {
        enabled: true,
        spendStrategy: 'actorInventory',
        units: PF2E_CURRENCY_PRESETS,
      },
    },
  };
  setupGlobals(system);

  const inventorySpender = {
    readCoins: (actor) =>
      actor?.inventory?.coins
        ? { valid: true, copperValue: Number(actor.inventory.coins.copperValue) || 0 }
        : { valid: false, message: 'not available' },
    async spend() {
      return { valid: false, message: 'Insufficient currency.' };
    },
  };
  const engine = new CraftingEngine({}, null, null, null, null, inventorySpender);
  const { recipe, step } = recipeAndStep('gp', 3);
  const actor = buildPf2eActor({ pp: 0, gp: 5, sp: 0, cp: 0 }, async () => false);

  const decrement = await engine._decrementCurrencyRequirement(actor, recipe, step);
  assert.equal(decrement.valid, false);
  assert.match(decrement.message, /Insufficient currency/i);
});

test('actorInventory currency check rejects an actor with no inventory coins', async () => {
  const system = {
    requirements: {
      currency: {
        enabled: true,
        spendStrategy: 'actorInventory',
        units: PF2E_CURRENCY_PRESETS,
      },
    },
  };
  setupGlobals(system);
  const inventorySpender = {
    readCoins: (actor) =>
      actor?.inventory?.coins
        ? { valid: true, copperValue: Number(actor.inventory.coins.copperValue) || 0 }
        : { valid: false, message: 'Currency unit "Gold" is not available on Non-PF2e.' },
    check: (actor) =>
      actor?.inventory?.coins
        ? { valid: true }
        : { valid: false, message: 'Currency unit "Gold" is not available on Non-PF2e.' },
    async spend() {
      return { valid: true };
    },
  };
  const engine = new CraftingEngine({}, null, null, null, null, inventorySpender);
  const { recipe, step } = recipeAndStep('gp', 1);
  const actor = buildActor('Non-PF2e', { cp: 0, sp: 0, gp: 0, pp: 0 });

  const check = await engine._checkCurrencyRequirement(actor, recipe, step);
  assert.equal(check.valid, false);
  assert.match(check.message, /not available/i);
});

test('actorInventory currency on a system with no registered adapter fails loudly', async () => {
  const system = {
    requirements: {
      currency: {
        enabled: true,
        spendStrategy: 'actorInventory',
        units: PF2E_CURRENCY_PRESETS,
      },
    },
  };
  setupGlobals(system);
  // Real generic spender with an empty adapter map for a system id with no entry.
  const inventorySpender = new ActorInventoryCoinSpender({
    adapters: new Map(),
    getSystemId: () => 'mysterysystem',
  });
  const engine = new CraftingEngine({}, null, null, null, null, inventorySpender);
  const { recipe, step } = recipeAndStep('gp', 1);
  const actor = buildPf2eActor({ pp: 0, gp: 5, sp: 0, cp: 0 }, async () => true);

  const check = await engine._checkCurrencyRequirement(actor, recipe, step);
  assert.equal(check.valid, false);
  assert.match(check.message, /no currency inventory adapter is registered/i);

  const decrement = await engine._decrementCurrencyRequirement(actor, recipe, step);
  assert.equal(decrement.valid, false);
  assert.match(decrement.message, /no currency inventory adapter is registered/i);
});

test('Pf2eInventoryCoinAdapter spends through removeCoins and never makes its own change', async () => {
  const removeCalls = [];
  const adapter = new Pf2eInventoryCoinAdapter();
  const actor = buildPf2eActor({ pp: 0, gp: 5, sp: 0, cp: 0 }, async (coins) => {
    removeCalls.push(coins);
    return true;
  });
  const result = await adapter.spend(actor, {
    unit: { id: 'gp', denomination: 'gp', label: 'Gold' },
    amount: 3,
  });
  assert.equal(result.valid, true);
  assert.deepEqual(removeCalls, [{ gp: 3 }]);

  const broke = buildPf2eActor({ pp: 0, gp: 0, sp: 0, cp: 0 }, async () => false);
  const insufficient = await adapter.spend(broke, {
    unit: { id: 'gp', denomination: 'gp', label: 'Gold' },
    amount: 1,
  });
  assert.equal(insufficient.valid, false);
  assert.match(insufficient.message, /insufficient currency/i);
});

test('actorProperty currency spend calls actor.update and never the inventory spender', async () => {
  const system = {
    requirements: {
      currency: { enabled: true, units: DND5E_CURRENCY_PRESETS },
    },
  };
  setupGlobals(system);
  let inventoryReadCalled = false;
  let inventorySpendCalled = false;
  const inventorySpender = {
    readCoins: () => {
      inventoryReadCalled = true;
      return { valid: false };
    },
    async spend() {
      inventorySpendCalled = true;
      return { valid: true };
    },
  };
  // Inject the inventory spender in the 6th slot; the actorProperty path must use the
  // default ActorPropertyCoinSpender and never touch the inventory spender.
  const engine = new CraftingEngine({}, null, null, null, null, inventorySpender);
  const { recipe, step } = recipeAndStep('gp', 3);
  const actor = buildActor('Rich', { cp: 0, sp: 0, ep: 0, gp: 10, pp: 0 });

  const check = await engine._checkCurrencyRequirement(actor, recipe, step);
  assert.equal(check.valid, true);

  const decrement = await engine._decrementCurrencyRequirement(actor, recipe, step);
  assert.equal(decrement.valid, true);
  assert.equal(inventoryReadCalled, false, 'actorProperty path must not read inventory coins');
  assert.equal(inventorySpendCalled, false, 'actorProperty path must not call inventory spend');
  assert.equal(actor.system.currency.gp, 7);
});

// --- macro inventory mode -------------------------------------------------

const MACRO_PRESETS = [
  { id: 'gp', label: 'Gold', abbreviation: 'gp', contains: [{ unitId: 'sp', amount: 10 }] },
  { id: 'sp', label: 'Silver', abbreviation: 'sp', contains: [] },
];

function macroSystem() {
  return {
    name: 'Macro System',
    requirements: {
      currency: {
        enabled: true,
        spendStrategy: 'macro',
        macros: { canAfford: 'Macro.can', increment: 'Macro.inc', decrement: 'Macro.dec' },
        units: MACRO_PRESETS,
      },
    },
  };
}

function installMacroStub(commands) {
  const calls = [];
  globalThis.fromUuid = async (uuid) =>
    commands[uuid] ? { name: uuid, command: commands[uuid] } : null;
  return { calls };
}

test('macro mode runs canAfford then decrement with the agreed context', async () => {
  setupGlobals(macroSystem());
  const received = [];
  // Record the context macros receive; canAfford and decrement both pass.
  globalThis.fromUuid = async (uuid) => ({
    name: uuid,
    command: `received.push({ uuid: ${JSON.stringify(uuid)}, context }); return true;`,
  });
  globalThis.received = received;
  globalThis.ui = {};

  const engine = new CraftingEngine({});
  const { recipe, step } = recipeAndStep('gp', 3);
  const actor = { name: 'Hero' };

  const check = await engine._checkCurrencyRequirement(actor, recipe, step);
  assert.equal(check.valid, true);
  const decrement = await engine._decrementCurrencyRequirement(actor, recipe, step);
  assert.equal(decrement.valid, true);

  assert.equal(received.length, 2);
  assert.equal(received[0].uuid, 'Macro.can');
  assert.equal(received[1].uuid, 'Macro.dec');
  const ctx = received[0].context;
  assert.equal(ctx.actor.name, 'Hero');
  assert.deepEqual(ctx.cost, [{ abbreviation: 'gp', amount: 3 }]);
  assert.equal(ctx.units.length, 2);
  assert.ok(ctx.units.some((unit) => unit.abbreviation === 'gp'));
  assert.equal(ctx.requirement.unit, 'gp');
  assert.equal(ctx.craftingSystem.name, 'Macro System');
  // The built macro context also carries the recipe alongside
  // actor/cost/units/requirement/craftingSystem so macros can read what is being crafted.
  assert.ok(ctx.recipe, 'macro context should include the recipe');
  assert.equal(ctx.recipe.toJSON().id, 'recipe-1');
  // increment must never run.
  assert.ok(!received.some((entry) => entry.uuid === 'Macro.inc'));

  delete globalThis.received;
});

test('macro mode canAfford failure aborts the check', async () => {
  setupGlobals(macroSystem());
  installMacroStub({
    'Macro.can': 'return { canAfford: false, message: "Too poor" };',
    'Macro.dec': 'return true;',
  });
  globalThis.ui = {};
  const engine = new CraftingEngine({});
  const { recipe, step } = recipeAndStep('gp', 3);

  const check = await engine._checkCurrencyRequirement({ name: 'Hero' }, recipe, step);
  assert.equal(check.valid, false);
  assert.match(check.message, /Too poor/);
});

test('macro mode decrement failure aborts the spend', async () => {
  setupGlobals(macroSystem());
  installMacroStub({
    'Macro.can': 'return true;',
    'Macro.dec': 'return false;',
  });
  globalThis.ui = {};
  const engine = new CraftingEngine({});
  const { recipe, step } = recipeAndStep('gp', 3);

  const decrement = await engine._decrementCurrencyRequirement({ name: 'Hero' }, recipe, step);
  assert.equal(decrement.valid, false);
});

test('macro mode does not require a denomination on units', async () => {
  const profile = validateCurrencyProfile(MACRO_PRESETS, {
    spendStrategy: 'macro',
    macros: { canAfford: 'Macro.can', decrement: 'Macro.dec' },
  });
  assert.equal(profile.valid, true);
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
  // actorProperty: actorPath required, missing one is invalid.
  const actorPropertyMissing = validateCurrencyProfile(
    [{ id: 'gp', label: 'Gold', abbreviation: 'gp', contains: [] }],
    { spendStrategy: 'actorProperty' }
  );
  assert.equal(actorPropertyMissing.valid, false);
  assert.match(actorPropertyMissing.errors.join('; '), /actor data path/i);

  // actorInventory: actorPath not required; a valid denomination passes.
  const inventoryValid = validateCurrencyProfile(
    [{ id: 'gp', label: 'Gold', abbreviation: 'gp', denomination: 'gp', contains: [] }],
    { spendStrategy: 'actorInventory' }
  );
  assert.equal(inventoryValid.valid, true);

  // actorInventory: a unit whose id/denomination is not a pf2e coin is invalid.
  const inventoryInvalid = validateCurrencyProfile(
    [{ id: 'shards', label: 'Shards', abbreviation: 'sh', contains: [] }],
    { spendStrategy: 'actorInventory' }
  );
  assert.equal(inventoryInvalid.valid, false);
  assert.match(inventoryInvalid.errors.join('; '), /pf2e denomination/i);

  // actorInventory: denomination defaults to the unit id (cp is valid).
  const inventoryDefault = validateCurrencyProfile(
    [{ id: 'cp', label: 'Copper', abbreviation: 'cp', contains: [] }],
    { spendStrategy: 'actorInventory' }
  );
  assert.equal(inventoryDefault.valid, true);
});

test('normalizeCurrencyConfig normalizes spendStrategy and unit denomination', () => {
  const normalized = normalizeCurrencyConfig({
    enabled: true,
    spendStrategy: 'actorInventory',
    units: [{ id: 'gp', label: 'Gold', denomination: ' gp ', actorPath: '' }],
  });
  assert.equal(normalized.spendStrategy, 'actorInventory');
  assert.equal(normalized.units[0].denomination, 'gp');

  const fallback = normalizeCurrencyConfig({ enabled: true, spendStrategy: 'bogus', units: [] });
  assert.equal(fallback.spendStrategy, 'actorProperty');

  const noDenom = normalizeCurrencyUnit({ id: 'gp', actorPath: 'system.currency.gp' });
  assert.equal('denomination' in noDenom, false);
});

test('CraftingSystemManager normalizes legacy pf2e adapter to actorInventory units', () => {
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
  assert.equal(normalized.currency.spendStrategy, 'actorInventory');
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

function containsAmount(unit, unitId) {
  return (unit.contains || []).find((entry) => entry.unitId === unitId)?.amount;
}

test('dnd5e presets break down hierarchically into the parent denomination', () => {
  const byId = Object.fromEntries(DND5E_CURRENCY_PRESETS.map((unit) => [unit.id, unit]));
  assert.deepEqual([...byId.cp.contains], []);
  assert.equal(containsAmount(byId.sp, 'cp'), 10);
  assert.equal(containsAmount(byId.ep, 'sp'), 5);
  assert.equal(containsAmount(byId.gp, 'sp'), 10);
  assert.equal(containsAmount(byId.pp, 'gp'), 10);
  // No coin flattens straight to copper except silver itself.
  assert.equal(containsAmount(byId.gp, 'cp'), undefined);
  assert.equal(containsAmount(byId.pp, 'cp'), undefined);
});

test('pf2e presets break down hierarchically with no electrum', () => {
  const byId = Object.fromEntries(PF2E_CURRENCY_PRESETS.map((unit) => [unit.id, unit]));
  assert.equal(byId.ep, undefined);
  assert.deepEqual([...byId.cp.contains], []);
  assert.equal(containsAmount(byId.sp, 'cp'), 10);
  assert.equal(containsAmount(byId.gp, 'sp'), 10);
  assert.equal(containsAmount(byId.pp, 'gp'), 10);
});

test('hierarchical presets resolve to the same base values as the flat ladder', () => {
  const profile = validateCurrencyProfile(DND5E_CURRENCY_PRESETS);
  assert.equal(profile.valid, true);
  assert.equal(profile.metadata.get('cp').baseValue, 1);
  assert.equal(profile.metadata.get('sp').baseValue, 10);
  assert.equal(profile.metadata.get('ep').baseValue, 50);
  assert.equal(profile.metadata.get('gp').baseValue, 100);
  assert.equal(profile.metadata.get('pp').baseValue, 1000);
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

// ---------------------------------------------------------------------------
// End-to-end: the full craft() loop must abort the spend BEFORE consuming
// ingredients when a macro-mode currency macro fails. This pins the
// check/decrement-before-consumption ordering end-to-end, not just at the
// _decrementCurrencyRequirement helper level.
// ---------------------------------------------------------------------------

function macroCraftSystem() {
  return {
    name: 'Macro Craft System',
    // No crafting checks, so _runCraftingCheck passes through to the currency spend.
    features: {},
    requirements: {
      currency: {
        enabled: true,
        spendStrategy: 'macro',
        macros: { canAfford: 'Macro.can', increment: 'Macro.inc', decrement: 'Macro.dec' },
        units: [
          { id: 'gp', label: 'Gold', abbreviation: 'gp', contains: [] },
          { id: 'sp', label: 'Silver', abbreviation: 'sp', contains: [] },
        ],
      },
    },
  };
}

function setupCraftGlobals(systemConfig) {
  globalThis.foundry = {
    utils: { getProperty, randomID: () => 'generated-id' },
  };
  globalThis.game = {
    user: { id: 'user-1' },
    time: { worldTime: 0 },
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: () => systemConfig }),
      getResolutionModeService: () => null,
    },
  };
  globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };
}

function buildCraftIngredientItem() {
  return {
    id: 'ing-1',
    uuid: 'Item.ing-1',
    name: 'Iron Ingot',
    parent: null,
    system: { quantity: 3 },
    deleteCalled: false,
    updateCalled: false,
    async delete() { this.deleteCalled = true; },
    async update(payload) {
      this.updateCalled = true;
      if (payload['system.quantity'] !== undefined) this.system.quantity = payload['system.quantity'];
    },
  };
}

function buildCraftRecipe(ingredientItem) {
  const ingredient = {
    systemItemId: ingredientItem.id,
    quantity: 1,
    getDescription: () => ingredientItem.name,
  };
  const ingredientSet = {
    id: 'set-1',
    matchIngredients(availableItems) {
      const matched = availableItems.find((item) => item === ingredientItem);
      return matched ? [{ item: matched, quantity: 1, ingredient }] : [];
    },
  };
  return {
    id: 'recipe-1',
    name: 'Macro Currency Recipe',
    craftingSystemId: 'sys-1',
    ingredientSets: [ingredientSet],
    // A single step that also carries the currency requirement (3 gp).
    getExecutionSteps: () => [
      {
        id: 'step-1',
        name: 'Step 1',
        ingredientSets: [ingredientSet],
        resultGroups: [],
        toolIds: [],
        timeRequirement: null,
        currencyRequirement: { unit: 'gp', amount: 3 },
        outcomeRouting: null,
      },
    ],
    validate: () => ({ valid: true, errors: [] }),
    toJSON: () => ({ id: 'recipe-1', name: 'Macro Currency Recipe' }),
  };
}

function buildCraftEngine(ingredientItem) {
  const recipeManager = {
    canCraft() {
      return { canCraft: true, satisfiableSet: null, missing: { ingredients: [], essences: [], tools: [] } };
    },
    getToolsForSet() { return []; },
    toolMatchesItem() { return false; },
    ingredientMatchesItem(recipe, ingredient, item) { return item === ingredientItem; },
  };
  return new CraftingEngine(recipeManager, null, null);
}

test('craft() aborts before consuming ingredients when the decrement macro returns success:false', async () => {
  setupCraftGlobals(macroCraftSystem());
  // canAfford passes the up-front gate; decrement fails the authoritative spend.
  globalThis.fromUuid = async (uuid) => {
    if (uuid === 'Macro.can') return { name: uuid, command: 'return true;' };
    if (uuid === 'Macro.dec') return { name: uuid, command: 'return { success: false, message: "Spend rejected" };' };
    return null;
  };

  const ingredientItem = buildCraftIngredientItem();
  const recipe = buildCraftRecipe(ingredientItem);
  // The satisfiable set is the recipe's set so canCraft resolves an ingredient set to consume.
  const engine = buildCraftEngine(ingredientItem);
  engine.recipeManager.canCraft = () => ({
    canCraft: true,
    satisfiableSet: recipe.ingredientSets[0],
    missing: { ingredients: [], essences: [], tools: [] },
  });

  const sourceActor = { id: 'a1', name: 'Crafter', items: [ingredientItem] };
  const craftingActor = {
    id: 'a1',
    name: 'Crafter',
    uuid: 'Actor.a1',
    items: { contents: [] },
    createEmbeddedDocuments: async () => [],
  };

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, false, 'craft should fail when the decrement macro rejects the spend');
  assert.equal(result.results, null, 'no result items should be created when the spend aborts');
  assert.equal(ingredientItem.deleteCalled, false, 'ingredient must NOT be deleted when the spend aborts');
  assert.equal(ingredientItem.updateCalled, false, 'ingredient must NOT be partially consumed when the spend aborts');
  assert.equal(ingredientItem.system.quantity, 3, 'ingredient quantity must be untouched');

  delete globalThis.fromUuid;
});
