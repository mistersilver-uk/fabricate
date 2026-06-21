import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DND5E_CURRENCY_PRESETS,
  PF2E_CURRENCY_PRESETS,
  seedCurrencyPresets,
} from '../src/config/currencyPresets.js';
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

test('macro mode does not require a denomination on units', async () => {
  const macroPresets = [
    { id: 'gp', label: 'Gold', abbreviation: 'gp', contains: [{ unitId: 'sp', amount: 10 }] },
    { id: 'sp', label: 'Silver', abbreviation: 'sp', contains: [] },
  ];
  const profile = validateCurrencyProfile(macroPresets, {
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
