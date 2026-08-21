/**
 * The admin store's WORLD currency actions (issue 1278).
 *
 * Currency used to be per-crafting-system state, so these lived in `adminStore.test.js` inside
 * the selected-system describe and asserted against the `updateSystem` payload. The ladder,
 * spend strategy, provider and macro set are world scope now — one config for the whole world,
 * because a world runs one ruleset and so has one way actors store coins — so the actions take
 * no system id and persist through `CurrencyConfigStore` instead.
 *
 * These drive the REAL store against a REAL `CurrencyConfigStore` over an in-memory setting, so
 * the normalizer that the store round-trips through is exercised rather than stubbed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAdminStore } from '../../src/ui/svelte/stores/adminStore.js';
import { CurrencyConfigStore } from '../../src/systems/CurrencyConfigStore.js';
import { PF2E_CURRENCY_PRESETS } from '../../src/config/currencyPresets.js';
import { createServices, makeSystem } from '../helpers/adminStoreServices.js';

async function setupCurrencyStore(overrides = {}) {
  const { randomID, ...serviceOverrides } = overrides;
  const settings = { lastManagedCraftingSystem: 'sys1', currencyConfig: null };
  let idSeq = 0;
  const currencyStore = new CurrencyConfigStore({
    getSetting: (key) => settings[key] ?? null,
    setSetting: async (key, value) => {
      settings[key] = value;
    },
    randomID: randomID || (() => `unit-${(idSeq += 1)}`),
  });
  const services = createServices(makeSystem(), [], [], {
    getSetting: (key) => settings[key] ?? '',
    setSetting: async (key, value) => {
      settings[key] = value;
    },
    getFoundrySystemId: () => 'dnd5e',
    getCurrencyConfigStore: () => currencyStore,
    ...serviceOverrides,
  });
  const store = createAdminStore(services);
  await store.selectSystem('sys1');
  return {
    store,
    // The PERSISTED config, read back off the setting rather than out of the store's cache, so
    // an action that mutates in memory without writing cannot pass.
    currency: () => settings.currencyConfig,
    persisted: () => settings.currencyConfig,
  };
}

describe('adminStore world currency actions', () => {
  it('addCurrencyUnit and updateCurrencyUnit persist editable unit fields', async () => {
    const { store, currency, persisted } = await setupCurrencyStore();
    const created = await store.addCurrencyUnit({
      id: 'gp',
      label: 'Gold',
      abbreviation: 'gp',
      icon: 'fa-solid fa-coins',
      actorPath: 'system.currency.gp',
    });
    assert.equal(created.id, 'gp');
    await store.updateCurrencyUnit('gp', {
      label: 'Gold pieces',
      actorPath: 'system.currency.gp.value',
    });
    assert.ok(persisted() !== null, 'the world currency setting was written');
    assert.equal(currency().units[0].id, 'gp');
    assert.equal(currency().units[0].label, 'Gold pieces');
    assert.equal(currency().units[0].actorPath, 'system.currency.gp.value');
    assert.equal('provider' in currency(), false);
  });

  it('currency sub-unit actions add, update, and remove denomination breakdowns', async () => {
    const { store, currency, persisted } = await setupCurrencyStore({
      randomID: (() => {
        const ids = ['cp', 'sp'];
        let index = 0;
        return () => ids[index++] || `id-${index}`;
      })(),
    });
    await store.addCurrencyUnit({
      id: 'cp',
      label: 'Copper',
      abbreviation: 'cp',
      actorPath: 'system.currency.cp',
    });
    await store.addCurrencyUnit({
      id: 'sp',
      label: 'Silver',
      abbreviation: 'sp',
      actorPath: 'system.currency.sp',
    });
    await store.addCurrencySubUnit('sp', 'cp');
    await store.updateCurrencySubUnit('sp', 'cp', 10);
    assert.ok(persisted() !== null, 'the world currency setting was written');
    let silver = currency().units.find((unit) => unit.id === 'sp');
    assert.deepEqual(silver.contains, [{ unitId: 'cp', amount: 10 }]);

    await store.deleteCurrencySubUnit('sp', 'cp');
    silver = currency().units.find((unit) => unit.id === 'sp');
    assert.deepEqual(silver.contains, []);
  });

  it('seedCurrencyUnitPresets adds dnd5e units idempotently', async () => {
    const { store, currency } = await setupCurrencyStore({ getFoundrySystemId: () => 'dnd5e' });
    const first = await store.seedCurrencyUnitPresets();
    const second = await store.seedCurrencyUnitPresets();
    assert.equal(first.unsupported, false);
    assert.equal(first.added.length, 5);
    assert.equal(second.added.length, 0);
    assert.equal(second.skipped.length, 5);
    assert.equal(
      currency().units.some((unit) => unit.id === 'gp'),
      true
    );
  });

  it('seedCurrencyUnitPresets sets actorInventory spend strategy for pf2e worlds', async () => {
    const { store, currency } = await setupCurrencyStore({ getFoundrySystemId: () => 'pf2e' });
    const result = await store.seedCurrencyUnitPresets();
    assert.equal(result.unsupported, false);
    assert.equal(currency().spendStrategy, 'actorInventory');
    const gp = currency().units.find((unit) => unit.id === 'gp');
    assert.equal(gp.denomination, 'gp');
  });

  it('seedCurrencyUnitPresets seeds the actorInventory strategy for pf2e worlds', async () => {
    const { store, currency } = await setupCurrencyStore({ getFoundrySystemId: () => 'pf2e' });
    await store.seedCurrencyUnitPresets();
    assert.equal('inventoryMode' in currency(), false);
    assert.equal(currency().spendStrategy, 'actorInventory');
    assert.equal(currency().providerId, 'pf2e-inventory');
    // The actorInventory strategy is provider-owned, so the seeded units are the canonical ladder.
    assert.deepEqual(
      currency().units.map((unit) => unit.id),
      PF2E_CURRENCY_PRESETS.map((unit) => unit.id)
    );
    assert.deepEqual(
      currency().units.map((unit) => unit.denomination),
      PF2E_CURRENCY_PRESETS.map((unit) => unit.denomination)
    );
  });

  it('setCurrencySpendStrategy persists and defaults providerId for pf2e actorInventory', async () => {
    const { store, currency } = await setupCurrencyStore({ getFoundrySystemId: () => 'pf2e' });
    await store.setCurrencySpendStrategy('actorInventory');
    assert.equal(currency().spendStrategy, 'actorInventory');
    assert.equal(currency().providerId, 'pf2e-inventory');
  });

  it('setCurrencySpendStrategy persists the macro strategy and preserves providerId', async () => {
    const { store, currency } = await setupCurrencyStore({ getFoundrySystemId: () => 'pf2e' });
    await store.setCurrencySpendStrategy('actorInventory');
    await store.setCurrencySpendStrategy('macro');
    assert.equal(currency().spendStrategy, 'macro');
    assert.equal('inventoryMode' in currency(), false);
    // providerId is inert under macro but is preserved across the switch.
    assert.equal(currency().providerId, 'pf2e-inventory');
    await store.setCurrencyProvider('pf2e-inventory');
    assert.equal(currency().providerId, 'pf2e-inventory');
  });

  it('setCurrencySpendStrategy("actorInventory") syncs units to the provider canonical ladder', async () => {
    const { store, currency } = await setupCurrencyStore({ getFoundrySystemId: () => 'pf2e' });
    // Seed a user-managed unit first, then switching to actorInventory overwrites it.
    await store.addCurrencyUnit({
      id: 'junk',
      label: 'Junk',
      actorPath: 'system.currency.junk',
    });
    await store.setCurrencySpendStrategy('actorInventory');
    const units = currency().units;
    assert.deepEqual(
      units.map((unit) => unit.id),
      PF2E_CURRENCY_PRESETS.map((unit) => unit.id)
    );
    assert.deepEqual(
      units.map((unit) => unit.denomination),
      PF2E_CURRENCY_PRESETS.map((unit) => unit.denomination)
    );
    assert.equal(
      units.some((unit) => unit.id === 'junk'),
      false,
      'user-managed unit should be overwritten by canonical ladder'
    );
  });

  it('setCurrencyProvider syncs canonical units while under the actorInventory strategy', async () => {
    const { store, currency } = await setupCurrencyStore({ getFoundrySystemId: () => 'pf2e' });
    await store.setCurrencySpendStrategy('actorInventory');
    await store.setCurrencyProvider('pf2e-inventory');
    assert.deepEqual(
      currency().units.map((unit) => unit.id),
      PF2E_CURRENCY_PRESETS.map((unit) => unit.id)
    );
  });

  it('switching to actorProperty or macro leaves user-managed units untouched', async () => {
    const { store, currency } = await setupCurrencyStore({ getFoundrySystemId: () => 'pf2e' });
    await store.addCurrencyUnit({
      id: 'mine',
      label: 'Mine',
      actorPath: 'system.currency.mine',
    });
    // macro strategy keeps the user's units.
    await store.setCurrencySpendStrategy('macro');
    assert.equal(
      currency().units.some((unit) => unit.id === 'mine'),
      true
    );
    // actorProperty strategy keeps the user's units too.
    await store.setCurrencySpendStrategy('actorProperty');
    assert.equal(
      currency().units.some((unit) => unit.id === 'mine'),
      true
    );
    // setCurrencyProvider outside the actorInventory strategy does not touch the user's units.
    await store.setCurrencyProvider('pf2e-inventory');
    assert.equal(
      currency().units.some((unit) => unit.id === 'mine'),
      true
    );
  });

  it('actorInventory in a no-provider system (dnd5e) leaves configured units untouched', async () => {
    // Regression: dnd5e has no registered provider, so getDefaultProviderId('dnd5e') === '' and
    // getProviderCanonicalUnits('') is empty. The actorInventory strategy must NOT wipe the GM's
    // units in that case.
    const { store, currency } = await setupCurrencyStore({ getFoundrySystemId: () => 'dnd5e' });
    await store.addCurrencyUnit({
      id: 'gp',
      label: 'Gold',
      actorPath: 'system.currency.gp',
    });
    await store.setCurrencySpendStrategy('actorInventory');
    assert.equal(
      currency().units.some((unit) => unit.id === 'gp'),
      true,
      'no-provider system must not have its configured units wiped by the actorInventory strategy'
    );
    // setCurrencyProvider with an empty/unknown provider id also preserves the units.
    await store.setCurrencyProvider('');
    assert.equal(
      currency().units.some((unit) => unit.id === 'gp'),
      true,
      'selecting an empty provider id must not wipe configured units'
    );
  });

  it('setCurrencyMacro and clearCurrencyMacro persist per-key macro UUIDs', async () => {
    const { store, currency } = await setupCurrencyStore();
    await store.setCurrencyMacro('canAfford', 'Macro.can');
    assert.equal(currency().macros.canAfford, 'Macro.can');
    await store.setCurrencyMacro('decrement', 'Macro.dec');
    assert.equal(currency().macros.decrement, 'Macro.dec');
    await store.clearCurrencyMacro('canAfford');
    assert.equal(currency().macros.canAfford, '');
    assert.equal(currency().macros.decrement, 'Macro.dec');
  });

  it('seedCurrencyUnitPresets does not overwrite a user-edited seeded unit', async () => {
    const { store, currency } = await setupCurrencyStore({ getFoundrySystemId: () => 'dnd5e' });
    await store.seedCurrencyUnitPresets();
    await store.updateCurrencyUnit('gp', {
      label: 'Custom Gold',
      actorPath: 'system.currency.gp.value',
    });
    const second = await store.seedCurrencyUnitPresets();
    assert.equal(second.added.length, 0);
    const units = currency().units;
    const gold = units.find((unit) => unit.id === 'gp');
    assert.equal(gold.label, 'Custom Gold');
    assert.equal(gold.actorPath, 'system.currency.gp.value');
    // No duplicate gp unit was introduced by the second seed.
    assert.equal(units.filter((unit) => unit.id === 'gp').length, 1);
  });

  it("deleteCurrencyUnit removes the unit and strips it from other units' sub-units", async () => {
    const { store, currency } = await setupCurrencyStore();
    await store.addCurrencyUnit({
      id: 'cp',
      label: 'Copper',
      abbreviation: 'cp',
      actorPath: 'system.currency.cp',
    });
    await store.addCurrencyUnit({
      id: 'sp',
      label: 'Silver',
      abbreviation: 'sp',
      actorPath: 'system.currency.sp',
    });
    await store.addCurrencySubUnit('sp', 'cp', 10);
    await store.deleteCurrencyUnit('cp');
    const units = currency().units;
    assert.equal(
      units.some((unit) => unit.id === 'cp'),
      false
    );
    const silver = units.find((unit) => unit.id === 'sp');
    assert.deepEqual(silver.contains, []);
  });

});
