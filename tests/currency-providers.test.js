import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getCurrencyProvidersForFoundrySystem,
  getDefaultProviderId,
  getProviderCanonicalUnits,
  resolveProvider,
} from '../src/config/currencyProviders.js';
import { PF2E_CURRENCY_PRESETS } from '../src/config/currencyPresets.js';
import { Pf2eInventoryCoinAdapter } from '../src/systems/Pf2eInventoryCoinAdapter.js';

test('getCurrencyProvidersForFoundrySystem filters by system id', () => {
  const pf2e = getCurrencyProvidersForFoundrySystem('pf2e');
  assert.equal(pf2e.length, 1);
  assert.equal(pf2e[0].id, 'pf2e-inventory');
  assert.ok(pf2e[0].systems.includes('pf2e'));

  assert.deepEqual(getCurrencyProvidersForFoundrySystem('dnd5e'), []);
  assert.deepEqual(getCurrencyProvidersForFoundrySystem(''), []);
  assert.deepEqual(getCurrencyProvidersForFoundrySystem('unknown'), []);
});

test('the pf2e provider builds a pf2e inventory adapter', () => {
  const [provider] = getCurrencyProvidersForFoundrySystem('pf2e');
  const adapter = provider.buildAdapter();
  assert.ok(adapter instanceof Pf2eInventoryCoinAdapter);
});

test('getDefaultProviderId returns the first provider or empty string', () => {
  assert.equal(getDefaultProviderId('pf2e'), 'pf2e-inventory');
  assert.equal(getDefaultProviderId('dnd5e'), '');
  assert.equal(getDefaultProviderId(''), '');
});

test('getProviderCanonicalUnits returns the pf2e ladder and empty for unknown providers', () => {
  const units = getProviderCanonicalUnits('pf2e-inventory');
  assert.equal(units.length, PF2E_CURRENCY_PRESETS.length);
  assert.deepEqual(
    units.map((unit) => unit.id),
    PF2E_CURRENCY_PRESETS.map((unit) => unit.id)
  );
  assert.deepEqual(
    units.map((unit) => unit.denomination),
    PF2E_CURRENCY_PRESETS.map((unit) => unit.denomination)
  );
  // Unknown / empty provider ids resolve to an empty ladder.
  assert.deepEqual(getProviderCanonicalUnits('does-not-exist'), []);
  assert.deepEqual(getProviderCanonicalUnits(''), []);
  assert.deepEqual(getProviderCanonicalUnits(null), []);
});

test('resolveProvider matches by id, falls back to default, and returns null without providers', () => {
  assert.equal(resolveProvider('pf2e-inventory', 'pf2e').id, 'pf2e-inventory');
  // Unknown id within a system with providers falls back to the system default.
  assert.equal(resolveProvider('does-not-exist', 'pf2e').id, 'pf2e-inventory');
  // Empty id falls back to the default too.
  assert.equal(resolveProvider('', 'pf2e').id, 'pf2e-inventory');
  // A system with no providers resolves to null.
  assert.equal(resolveProvider('pf2e-inventory', 'dnd5e'), null);
});
