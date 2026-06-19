import test from 'node:test';
import assert from 'node:assert/strict';

import { DND5E_CURRENCY_PRESETS } from '../src/config/currencyPresets.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { CraftingSystemManager } from '../src/systems/CraftingSystemManager.js';
import { validateCurrencyProfile } from '../src/systems/currencyProfile.js';

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

test('CraftingEngine makes change from a higher denomination through configured sub-units', async () => {
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
  assert.equal(actor.system.currency.sp, 9);
  assert.equal(actor.system.currency.ep, 0);
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

  const missingPathActor = buildActor('No Copper Slot', { sp: 0, ep: 0, gp: 3, pp: 0 });
  const missingCheck = await engine._checkCurrencyRequirement(missingPathActor, recipe, step);
  assert.equal(missingCheck.valid, false);
  assert.match(missingCheck.message, /Copper.*not available/i);

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
