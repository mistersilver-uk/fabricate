import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';

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
      getProperty
    }
  };
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: () => systemConfig
      })
    }
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
    }
  };
}

test('CraftingEngine currency unit normalization and adapter bucket lookup', () => {
  const system = {
    requirements: {
      currency: {
        enabled: true,
        provider: 'system',
        systemAdapter: 'dnd5e'
      }
    }
  };
  setupGlobals(system);
  const engine = new CraftingEngine({});

  assert.equal(engine._normalizeCurrencyUnit('gold', 'dnd5e'), 'gp');
  assert.equal(engine._normalizeCurrencyUnit('silver', 'pf2e'), 'sp');
  assert.equal(engine._normalizeCurrencyUnit('credits', 'pf2e'), 'credits');

  const dndActor = buildActor('DND Hero', {
    gp: { value: 12 }
  });
  const dndBucket = engine._getSystemCurrencyBucket(
    dndActor,
    { unit: 'gold', amount: 5 },
    { systemAdapter: 'dnd5e' }
  );
  assert.equal(dndBucket?.value, 12);
  assert.equal(dndBucket?.path, 'system.currency.gp.value');

  const pf2eActor = buildActor('PF2e Hero', {
    sp: { value: 7 }
  });
  const pf2eBucket = engine._getSystemCurrencyBucket(
    pf2eActor,
    { unit: 'silver', amount: 2 },
    { systemAdapter: 'pf2e' }
  );
  assert.equal(pf2eBucket?.value, 7);
  assert.equal(pf2eBucket?.path, 'system.currency.sp.value');
});

test('CraftingEngine system currency requirement check and decrement', async () => {
  const system = {
    requirements: {
      currency: {
        enabled: true,
        provider: 'system',
        systemAdapter: 'dnd5e',
        checkCurrencyMacroUuid: null,
        decrementCurrencyMacroUuid: null,
        formatCurrencyMacroUuid: null
      }
    }
  };
  setupGlobals(system);
  const engine = new CraftingEngine({});
  const recipe = {
    craftingSystemId: 'sys-1',
    toJSON: () => ({ id: 'recipe-1' })
  };
  const step = {
    currencyRequirement: {
      unit: 'gp',
      amount: 3
    }
  };

  const richActor = buildActor('Rich', { gp: { value: 10 } });
  const checkRich = await engine._checkCurrencyRequirement(richActor, recipe, step);
  assert.equal(checkRich.valid, true);

  const decrementRich = await engine._decrementCurrencyRequirement(richActor, recipe, step);
  assert.equal(decrementRich.valid, true);
  assert.equal(richActor.system.currency.gp.value, 7);

  const poorActor = buildActor('Poor', { gp: { value: 2 } });
  const checkPoor = await engine._checkCurrencyRequirement(poorActor, recipe, step);
  assert.equal(checkPoor.valid, false);
  assert.match(checkPoor.message, /Insufficient currency/i);
});
