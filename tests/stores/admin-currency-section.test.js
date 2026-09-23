/**
 * The admin store's world-currency behaviour corpus (issue 1708): what each op saves, what it
 * returns, how many refreshes it costs, and the whole published object after it. Recorded from a
 * real run, so the split is judged against measured behaviour rather than a reading of the code.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertConvergent,
  assertStatePatch,
  createSectionHarness,
} from '../helpers/adminSectionCorpus.js';

/** `refresh()` lists environments for the gathering-enabled fixture, so it is countable. */
function refreshCount(entries) {
  return entries.filter((entry) => entry.seam === 'environments.listBySystem').length;
}

function saves(entries) {
  return entries.filter((entry) => entry.seam === 'currency.save').map((entry) => entry.args[0]);
}

const GOLD = {
  id: 'gp',
  label: 'Gold',
  abbreviation: 'gp',
  icon: 'fa-solid fa-coins',
  actorPath: 'system.currency.gp',
};

describe('adminStore currency section corpus', () => {
  it('addCurrencyUnit saves the ladder, refreshes once and publishes the new unit', async () => {
    const harness = await createSectionHarness();
    try {
      const before = harness.state();
      const created = await harness.store.addCurrencyUnit(GOLD);
      const entries = harness.drain();
      assert.equal(created.id, 'gp');
      assert.equal(created.label, 'Gold');
      assert.equal(refreshCount(entries), 1, 'one refresh per accepted write');
      const [saved] = saves(entries);
      assert.deepStrictEqual(
        saved.units.map((unit) => unit.id),
        ['gp']
      );
      const after = harness.state();
      assertStatePatch(before, after, {
        worldCurrency: after.worldCurrency,
        worldCurrencyValidation: after.worldCurrencyValidation,
      });
      assert.deepStrictEqual(
        after.worldCurrency.units.map((unit) => unit.id),
        ['gp']
      );
      assert.equal(after.worldCurrencyValidation.valid, true);
    } finally {
      harness.dispose();
    }
  });

  for (const [label, partial] of [
    ['a colliding id', { ...GOLD, label: 'Second gold' }],
    ['a whitespace-only id', { ...GOLD, id: '   ' }],
  ]) {
    it(`addCurrencyUnit refuses ${label}: no save, no refresh, and false`, async () => {
      const harness = await createSectionHarness();
      try {
        await harness.store.addCurrencyUnit(GOLD);
        harness.drain();
        const before = harness.state();
        const result = await harness.store.addCurrencyUnit(partial);
        const entries = harness.drain();
        assert.equal(result, false);
        assert.deepStrictEqual(saves(entries), [], 'a refused add saves nothing');
        assert.equal(refreshCount(entries), 0, 'and costs no refresh');
        assert.deepStrictEqual(harness.state().worldCurrency, before.worldCurrency);
      } finally {
        harness.dispose();
      }
    });
  }

  it('a refused sub-unit add writes nothing beyond the unchanged save and reports false', async () => {
    const harness = await createSectionHarness();
    try {
      await harness.store.addCurrencyUnit(GOLD);
      harness.drain();
      const result = await harness.store.addCurrencySubUnit('gp', 'missing-unit');
      const entries = harness.drain();
      assert.equal(result, false);
      assert.deepStrictEqual(saves(entries), [], 'a refused mutate saves nothing');
      assert.equal(refreshCount(entries), 0, 'and costs no refresh');
    } finally {
      harness.dispose();
    }
  });

  it('setCurrencyMacro refuses an unlisted key before it reaches the config store', async () => {
    const harness = await createSectionHarness();
    try {
      const refused = await harness.store.setCurrencyMacro('notAMacroKey', 'Macro.abc');
      assert.equal(refused, false);
      assert.deepStrictEqual(saves(harness.drain()), []);

      const accepted = await harness.store.setCurrencyMacro('balance', 'Macro.abc');
      const entries = harness.drain();
      assert.equal(accepted, true);
      assert.equal(saves(entries)[0].macros.balance, 'Macro.abc');
      assert.equal(harness.state().worldCurrency.macros.balance, 'Macro.abc');

      const cleared = await harness.store.clearCurrencyMacro('balance');
      assert.equal(cleared, true);
      assert.equal(saves(harness.drain())[0].macros.balance, '');
    } finally {
      harness.dispose();
    }
  });

  it('setCurrencySpendStrategy seeds a provider only when none is set', async () => {
    const seeded = await createSectionHarness({ foundrySystemId: 'pf2e' });
    try {
      const result = await seeded.store.setCurrencySpendStrategy('actorInventory');
      assert.equal(result, true);
      const [saved] = saves(seeded.drain());
      assert.equal(saved.spendStrategy, 'actorInventory');
      assert.equal(saved.providerId, 'pf2e-inventory');
      assert.ok(saved.units.length > 0, 'the provider ladder overwrites the empty unit list');
    } finally {
      seeded.dispose();
    }

    const preset = await createSectionHarness({
      foundrySystemId: 'pf2e',
      currencyConfig: { spendStrategy: 'actorProperty', providerId: 'pf2e-inventory', units: [] },
    });
    try {
      await preset.store.setCurrencySpendStrategy('actorInventory');
      const [saved] = saves(preset.drain());
      assert.equal(saved.providerId, 'pf2e-inventory', 'a set provider is left alone');
    } finally {
      preset.dispose();
    }
  });

  it('seedCurrencyUnitPresets is asymmetric between pf2e and dnd5e', async () => {
    const dnd = await createSectionHarness({ foundrySystemId: 'dnd5e' });
    try {
      const result = await dnd.store.seedCurrencyUnitPresets();
      assert.deepStrictEqual(Object.keys(result).sort(), [
        'added',
        'foundrySystemId',
        'skipped',
        'unsupported',
      ]);
      assert.equal(result.unsupported, false);
      assert.equal(result.foundrySystemId, 'dnd5e');
      assert.ok(result.added.length > 0);
      const [saved] = saves(dnd.drain());
      assert.equal(saved.spendStrategy, 'actorProperty');
      assert.equal(saved.providerId, '');
    } finally {
      dnd.dispose();
    }

    const pf2e = await createSectionHarness({ foundrySystemId: 'pf2e' });
    try {
      await pf2e.store.seedCurrencyUnitPresets();
      const [saved] = saves(pf2e.drain());
      assert.equal(saved.spendStrategy, 'actorInventory');
      assert.equal(saved.providerId, 'pf2e-inventory');
    } finally {
      pf2e.dispose();
    }

    const unsupported = await createSectionHarness({ foundrySystemId: 'nosuchsystem' });
    try {
      const result = await unsupported.store.seedCurrencyUnitPresets();
      assert.equal(result.unsupported, true);
      assert.deepStrictEqual(result.added, []);
      assert.deepStrictEqual(saves(unsupported.drain()), [], 'an unsupported world saves nothing');
    } finally {
      unsupported.dispose();
    }
  });

  it('the unit list reorders, updates and deletes through the shared reorder helper', async () => {
    const harness = await createSectionHarness();
    try {
      await harness.store.addCurrencyUnit({ ...GOLD, id: 'cp', label: 'Copper' });
      await harness.store.addCurrencyUnit({ ...GOLD, id: 'sp', label: 'Silver' });
      harness.drain();

      assert.equal(await harness.store.reorderCurrencyUnit(1, 0), true);
      assert.deepStrictEqual(
        harness.state().worldCurrency.units.map((unit) => unit.id),
        ['sp', 'cp']
      );
      assert.equal(await harness.store.reorderCurrencyUnit(0, 0), false, 'a no-op move is refused');
      assert.equal(await harness.store.reorderCurrencyUnit(9, 0), false, 'as is an out-of-range one');

      assert.equal(await harness.store.updateCurrencyUnit('cp', { label: 'Copper piece' }), true);
      assert.equal(await harness.store.updateCurrencyUnit('nope', { label: 'x' }), false);
      harness.drain();

      assert.equal(await harness.store.deleteCurrencyUnit('cp'), true);
      assert.deepStrictEqual(
        saves(harness.drain())[0].units.map((unit) => unit.id),
        ['sp']
      );
      assert.equal(await harness.store.deleteCurrencyUnit('cp'), false, 'a second delete is a no-op');
    } finally {
      harness.dispose();
    }
  });

  it('sub-unit amounts round-trip through the config store', async () => {
    const harness = await createSectionHarness();
    try {
      await harness.store.addCurrencyUnit({ ...GOLD, id: 'cp', label: 'Copper' });
      await harness.store.addCurrencyUnit({ ...GOLD, id: 'sp', label: 'Silver' });
      assert.equal(await harness.store.addCurrencySubUnit('sp', 'cp'), true);
      assert.equal(await harness.store.updateCurrencySubUnit('sp', 'cp', 10), true);
      harness.drain();
      assert.deepStrictEqual(
        harness.state().worldCurrency.units.find((unit) => unit.id === 'sp').contains,
        [{ unitId: 'cp', amount: 10 }]
      );
      assert.equal(await harness.store.deleteCurrencySubUnit('sp', 'cp'), true);
      assert.deepStrictEqual(
        harness.state().worldCurrency.units.find((unit) => unit.id === 'sp').contains,
        []
      );
    } finally {
      harness.dispose();
    }
  });

  it('a repeated preset seeding converges on one persisted ladder', async () => {
    const harness = await createSectionHarness();
    try {
      await assertConvergent(harness, () => harness.store.seedCurrencyUnitPresets(), [
        'currency.save',
      ]);
    } finally {
      harness.dispose();
    }
  });
});
