/**
 * `CurrencyConfigStore` — the persistence shell over the `currencyConfig` WORLD setting (issue
 * 1278). What this suite pins is the shell's own contract, and the one policy decision inside it:
 * persistence is NOT gated on profile validity.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CurrencyConfigStore } from '../src/systems/CurrencyConfigStore.js';
import { CURRENCY_MACRO_KEYS } from '../src/systems/currencyProfile.js';

function makeStore(seed = null) {
  const settings = { currencyConfig: seed };
  const writes = [];
  let idSeq = 0;
  const store = new CurrencyConfigStore({
    getSetting: (key) => settings[key] ?? null,
    setSetting: async (key, value) => {
      writes.push(key);
      settings[key] = value;
    },
    randomID: () => `gen-${(idSeq += 1)}`,
  });
  return { store, writes, persisted: () => settings.currencyConfig };
}

describe('CurrencyConfigStore', () => {
  it('normalizes an unset setting into the empty world shape without writing', () => {
    const { store, writes, persisted } = makeStore(null);
    const config = store.get();

    assert.deepEqual(config.units, []);
    assert.equal(config.spendStrategy, 'actorProperty');
    assert.equal(config.providerId, '');
    // Derived from the declared vocabulary rather than restated, because the point of the
    // assertion is that the normalizer emits EVERY declared slot — a literal list agrees with
    // a normalizer that dropped a key only until someone updates both together.
    assert.deepEqual(Object.keys(config.macros).sort(), [...CURRENCY_MACRO_KEYS].sort());
    // Reading must not persist: a world that never configured currency should not acquire a
    // setting document merely because something asked.
    assert.deepEqual(writes, []);
    assert.equal(persisted(), null);
  });

  it('never carries an `enabled` flag, because participation is per crafting system', async () => {
    // The world owns the ladder; `requirements.currency.enabled` on a crafting system owns whether
    // that system participates (issue 1278).
    const { store, persisted } = makeStore({ enabled: true, units: [] });
    assert.equal('enabled' in store.get(), false);

    await store.save({ ...store.get(), enabled: true, spendStrategy: 'macro' });
    assert.equal('enabled' in persisted(), false);
  });

  it('returns a copy, so a caller mutating the result cannot corrupt the cache', () => {
    const { store } = makeStore({ units: [{ id: 'gp', label: 'Gold' }] });
    const first = store.get();
    first.units.push({ id: 'sneaked', label: 'Sneaked' });
    first.spendStrategy = 'macro';

    assert.deepEqual(
      store.get().units.map((unit) => unit.id),
      ['gp']
    );
    assert.equal(store.get().spendStrategy, 'actorProperty');
  });

  it('normalizes on write, so a caller cannot persist a shape the readers do not expect', async () => {
    const { store, persisted } = makeStore();
    await store.save({
      spendStrategy: 'teleportation',
      units: [{ id: 'gp', label: 'Gold' }],
      strayKey: 'discarded',
    });

    assert.equal(persisted().spendStrategy, 'actorProperty', 'an unknown strategy falls back');
    assert.equal('strayKey' in persisted(), false, 'the whitelist rebuild drops stray keys');
    assert.deepEqual(
      persisted().units.map((unit) => unit.id),
      ['gp']
    );
  });

  it('serves the saved config from cache without re-reading the setting', async () => {
    const { store } = makeStore();
    await store.save({ units: [{ id: 'gp', label: 'Gold' }] });

    assert.deepEqual(
      store.get().units.map((unit) => unit.id),
      ['gp'],
      'the write updates the in-memory cache, not only the setting'
    );
  });

  it('load() re-reads a REPLICATED change, which is how a non-writing client catches up', () => {
    // The setting-change bridge calls this when another client's GM edits the ladder. Without it
    // that client keeps resolving currency costs against the ladder it last read.
    const settings = { currencyConfig: { units: [{ id: 'gp', label: 'Gold' }] } };
    const store = new CurrencyConfigStore({
      getSetting: (key) => settings[key] ?? null,
      setSetting: async () => {},
    });
    assert.deepEqual(
      store.get().units.map((unit) => unit.id),
      ['gp']
    );

    settings.currencyConfig = { units: [{ id: 'gp' }, { id: 'sp', label: 'Silver' }] };
    store.load();

    assert.deepEqual(
      store.get().units.map((unit) => unit.id),
      ['gp', 'sp']
    );
  });

  it('resolves a LEGACY provider config forward rather than leaving it unreadable', async () => {
    // A pre-1278 world could carry `provider: 'system'` with a `systemAdapter`.
    const { store } = makeStore({ provider: 'system', systemAdapter: 'pf2e' });
    const config = store.get();

    assert.equal(config.spendStrategy, 'actorInventory');
    assert.ok(config.units.length > 0, 'the pf2e preset ladder is seeded');
    assert.equal('provider' in config, false, 'the legacy key does not survive normalization');
  });

  it('PERSISTS an invalid profile rather than blocking the GM mid-edit', async () => {
    // The half-authored state a GM is always passing through: one unit, no actor path.
    const { store, persisted } = makeStore();
    await store.save({ units: [{ id: 'gp', label: 'Gold', actorPath: '' }] });

    assert.ok(persisted(), 'the write went through');
    assert.equal(persisted().units.length, 1);
    assert.equal(persisted().units[0].actorPath, '');
  });

  it('tolerates a malformed stored value instead of throwing on world start-up', () => {
    for (const stored of ['not an object', 42, [], undefined]) {
      const { store } = makeStore(stored);
      assert.deepEqual(store.get().units, [], `a stored ${typeof stored} normalizes to empty`);
    }
  });
});

describe('CurrencyConfigStore under overlapping edits', () => {
  // Callers read-modify-write, and the editor fires one of those per keystroke on a label field, so
  // a second edit routinely starts while the first write is still in flight.
  function makeSlowStore(delayMs) {
    const settings = { currencyConfig: { units: [{ id: 'gp', label: 'Gold' }] } };
    const store = new CurrencyConfigStore({
      getSetting: (key) => settings[key] ?? null,
      setSetting: (key, value) =>
        new Promise((resolve) => {
          setTimeout(() => {
            settings[key] = value;
            resolve(value);
          }, delayMs);
        }),
      randomID: () => 'gen',
    });
    return { store, persisted: () => settings.currencyConfig };
  }

  it('serves the first edit to a read that starts before the write lands', async () => {
    const { store, persisted } = makeSlowStore(20);

    const first = store.save({ ...store.get(), spendStrategy: 'macro' });
    // A second caller reads while the first write is still in flight, exactly as the editor does.
    const readDuringFlight = store.get();
    assert.equal(
      readDuringFlight.spendStrategy,
      'macro',
      'the in-flight edit must already be visible, or the next read-modify-write clobbers it'
    );

    const second = store.save({ ...readDuringFlight, providerId: 'pf2e-inventory' });
    await Promise.all([first, second]);

    assert.equal(persisted().spendStrategy, 'macro', 'the first edit survived the second');
    assert.equal(persisted().providerId, 'pf2e-inventory');
  });
});
