/**
 * The observable persistence behaviour of the six one-key world-setting stores (issue 1689): write
 * order, payload, load guardedness, rejected-write state, seededness and corpus identity.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SETTING_KEYS } from '../../src/config/settings.js';
import { CharacterLibrariesStore } from '../../src/systems/CharacterLibrariesStore.js';
import { CurrencyConfigStore } from '../../src/systems/CurrencyConfigStore.js';
import { GatheringEnvironmentStore } from '../../src/systems/GatheringEnvironmentStore.js';
import { GatheringPartyStore } from '../../src/systems/GatheringPartyStore.js';
import { GatheringRealmStore } from '../../src/systems/GatheringRealmStore.js';
import {
  createWorldVocabularyStore,
  WORLD_VOCABULARY_SETTING_KEY,
} from '../../src/systems/WorldVocabularyStore.js';
import { makeSettingsSeam } from '../helpers/settings.js';

const GATHERING_SYSTEMS = Object.freeze([{ id: 'system-a', features: { gathering: true } }]);

/**
 * One row per store. `probe` reads a scalar off the published cache through the store's own read
 * API, so an observation taken from inside the write seam says which side of the await the
 * publish happened on; `read` is the canonical read-back the written payload must equal.
 */
const STORES = Object.freeze([
  {
    name: 'CurrencyConfigStore',
    cacheField: 'config',
    key: SETTING_KEYS.CURRENCY_CONFIG,
    guardedLoad: false,
    publishesBeforeWrite: true,
    resolvesFreshClone: true,
    seed: { spendStrategy: 'actorProperty', providerId: 'alpha', units: [] },
    build: (seams) => new CurrencyConfigStore({ ...seams, randomID: () => 'id-1' }),
    save: (store) => store.save({ spendStrategy: 'actorProperty', providerId: 'beta', units: [] }),
    read: (store) => store.get(),
    probe: (store) => store.get().providerId,
    before: 'alpha',
    after: 'beta',
  },
  {
    name: 'CharacterLibrariesStore',
    cacheField: 'libraries',
    key: SETTING_KEYS.CHARACTER_LIBRARIES,
    guardedLoad: true,
    publishesBeforeWrite: true,
    resolvesFreshClone: true,
    seed: { characterPrerequisites: [], modifiers: [] },
    build: (seams) => new CharacterLibrariesStore({ ...seams, randomID: () => 'id-1' }),
    save: (store) =>
      store.save({
        characterPrerequisites: [],
        modifiers: [{ id: 'mod-a', label: 'Alpha', expression: '2' }],
      }),
    read: (store) => store.get(),
    probe: (store) => store.get().modifiers.length,
    before: 0,
    after: 1,
  },
  {
    name: 'GatheringRealmStore',
    cacheField: 'config',
    key: SETTING_KEYS.TRAVEL_CONFIG,
    guardedLoad: false,
    publishesBeforeWrite: true,
    resolvesFreshClone: true,
    seed: { revealMode: 'manual', modifierVisibility: 'visible', realms: [] },
    build: (seams) => new GatheringRealmStore({ ...seams, randomID: () => 'id-1' }),
    save: (store) =>
      store.save({ revealMode: 'manual', modifierVisibility: 'gmOnly', realms: [] }),
    read: (store) => store.get(),
    probe: (store) => store.get().modifierVisibility,
    before: 'visible',
    after: 'gmOnly',
  },
  {
    name: 'GatheringPartyStore',
    cacheField: 'parties',
    key: SETTING_KEYS.GATHERING_PARTIES,
    guardedLoad: false,
    publishesBeforeWrite: false,
    resolvesFreshClone: true,
    seed: [{ id: 'party-a', name: 'Alpha' }],
    build: (seams) =>
      new GatheringPartyStore({
        ...seams,
        randomID: () => 'id-1',
        getUserId: () => 'user-1',
        now: () => 0,
      }),
    save: (store) => store.save([{ id: 'party-a', name: 'Beta' }]),
    read: (store) => store.list(),
    probe: (store) => store.list()[0].name,
    before: 'Alpha',
    after: 'Beta',
    invalidSave: (store) => store.save([{ id: 'party-a' }, { id: 'party-a' }]),
    invalidMessage: /Duplicate party id/,
  },
  {
    name: 'GatheringEnvironmentStore',
    cacheField: 'environments',
    key: SETTING_KEYS.GATHERING_ENVIRONMENTS,
    guardedLoad: false,
    publishesBeforeWrite: false,
    resolvesFreshClone: true,
    seed: [
      { id: 'env-a', name: 'Alpha', craftingSystemId: 'system-a', selectionMode: 'targeted' },
    ],
    build: (seams) =>
      new GatheringEnvironmentStore({
        ...seams,
        getSystems: () => GATHERING_SYSTEMS,
        randomID: () => 'id-1',
      }),
    save: (store) => store.save([]),
    read: (store) => store.list(),
    probe: (store) => store.list().length,
    before: 1,
    after: 0,
    invalidSave: (store) => store.save([{ id: 'env-b', name: 'Bad' }]),
    invalidMessage: /missing craftingSystemId/,
  },
  {
    name: 'WorldVocabularyStore',
    key: WORLD_VOCABULARY_SETTING_KEY,
    guardedLoad: true,
    publishesBeforeWrite: true,
    resolvesFreshClone: false,
    seed: { componentCategories: [{ id: 'reagent', name: 'Reagent' }] },
    build: (seams) => createWorldVocabularyStore(seams),
    save: (store) =>
      store.save({
        componentCategories: [
          { id: 'reagent', name: 'Reagent' },
          { id: 'ore', name: 'Ore' },
        ],
      }),
    read: (store) => store.get(),
    probe: (store) => store.corpus().componentCategories.length,
    before: 1,
    after: 2,
  },
]);

const byName = (name) => STORES.find((row) => row.name === name);

/**
 * Build the store over a seam that records what the cache said at the moment the write was
 * issued, then prime it so every save runs against an already-loaded store.
 */
function observedStore(row, { isGM = true } = {}) {
  const seam = makeSettingsSeam({ isGM, initial: [[row.key, row.seed]] });
  const observed = [];
  let store = null;
  store = row.build({
    getSetting: seam.getSetting,
    setSetting: async (key, value) => {
      observed.push({ probe: row.probe(store), seeded: store.isSeeded?.() ?? null });
      return seam.setSetting(key, value);
    },
  });
  row.read(store);
  return { store, seam, observed };
}

/** The same store over a seam whose read throws, to ask whether `load()` degrades or propagates. */
function unreadableStore(row) {
  return row.build({
    getSetting: () => {
      throw new Error('setting unreadable');
    },
    setSetting: async () => {},
  });
}

describe('the six one-key world-setting stores', () => {
  for (const row of STORES) {
    describe(row.name, () => {
      it('writes its own key once, with a payload equal to its canonical read-back', async () => {
        const { store, seam } = observedStore(row);
        await row.save(store);

        assert.deepEqual(seam.writes, [{ key: row.key, value: row.read(store) }]);
      });

      it(
        row.publishesBeforeWrite
          ? 'has already published the cache when the write is issued'
          : 'still holds the previous cache when the write is issued',
        async () => {
          const { store, observed } = observedStore(row);
          assert.equal(row.probe(store), row.before);

          await row.save(store);

          assert.equal(observed.length, 1);
          assert.equal(observed[0].probe, row.publishesBeforeWrite ? row.after : row.before);
          assert.equal(row.probe(store), row.after);
        }
      );

      it(
        row.guardedLoad
          ? 'degrades to an empty basis when the setting cannot be read'
          : 'propagates a read failure out of load()',
        () => {
          const store = unreadableStore(row);
          if (row.guardedLoad) {
            assert.doesNotThrow(() => store.load());
            return;
          }
          assert.throws(() => store.load(), /setting unreadable/);
        }
      );

      it('leaves the setting untouched when the world write is refused', async () => {
        const { store, seam } = observedStore(row, { isGM: false });

        await assert.rejects(() => row.save(store), /lacks permission to update Setting/);

        assert.deepEqual(seam.writes, []);
        assert.deepEqual(seam.refused, [row.key]);
        assert.deepEqual(seam.settings.get(row.key), row.seed);
        // Publish-first stores are knowingly left ahead of the refused setting and recover on the
        // next `load()`; the two validation-gated stores stay in step with it.
        assert.equal(row.probe(store), row.publishesBeforeWrite ? row.after : row.before);
      });

      if (row.resolvesFreshClone) {
        it('resolves a fresh clone of the payload it wrote', async () => {
          const { store, seam } = observedStore(row);
          const resolved = await row.save(store);
          const written = seam.writes[0].value;

          assert.deepEqual(resolved, written);
          assert.notEqual(resolved, written);
        });
      }

      if (row.invalidSave) {
        it('writes nothing at all when validation rejects the payload', async () => {
          const { store, seam } = observedStore(row);

          await assert.rejects(() => row.invalidSave(store), row.invalidMessage);

          assert.deepEqual(seam.writes, []);
          assert.equal(row.probe(store), row.before);
        });
      }
    });
  }
});

describe('raw-key seededness across a write', () => {
  const seededCases = [
    {
      row: byName('CharacterLibrariesStore'),
      unseeded: {},
      expectAfterReload: (store) => {
        assert.equal(store.isSeeded('characterPrerequisites'), true);
        assert.equal(store.isSeeded('modifiers'), true);
      },
    },
    {
      row: byName('WorldVocabularyStore'),
      unseeded: {},
      expectAfterReload: (store) => {
        assert.equal(store.isSeeded('componentCategories'), true);
        // Only the kinds a payload carries are persisted, so an unwritten kind stays absent on
        // disk and reads back as unseeded.
        assert.equal(store.isSeeded('componentTags'), false);
      },
    },
  ];

  for (const { row, unseeded, expectAfterReload } of seededCases) {
    it(`${row.name} reports seeded from the moment of the write, not its resolution`, async () => {
      const { store, observed } = observedStore({ ...row, seed: unseeded });
      assert.equal(store.isSeeded(), false);

      await row.save(store);

      assert.equal(observed[0].seeded, true);
      assert.equal(store.isSeeded(), true);
    });

    it(`${row.name} still reports seeded after a refused write`, async () => {
      const { store, observed } = observedStore({ ...row, seed: unseeded }, { isGM: false });
      assert.equal(store.isSeeded(), false);

      await assert.rejects(() => row.save(store));

      assert.equal(observed[0].seeded, true);
      assert.equal(store.isSeeded(), true);
    });

    it(`${row.name} re-derives seededness from raw key presence on the next load`, async () => {
      const { store } = observedStore({ ...row, seed: unseeded });
      await row.save(store);
      store.loaded = false;
      store.load();

      expectAfterReload(store);
    });
  }
});

describe('WorldVocabularyStore corpus identity', () => {
  const row = byName('WorldVocabularyStore');

  it('hands back the one published corpus object from load, corpus and the persist', async () => {
    const { store } = observedStore(row);

    assert.equal(store.load(), store.corpus());

    const resolved = await row.save(store);
    assert.equal(resolved, store.corpus());
    assert.equal(store.list('componentCategories'), store.corpus().componentCategories);
  });

  it('publishes a new corpus object on every save rather than mutating the old one', async () => {
    const { store } = observedStore(row);
    const before = store.load();

    await row.save(store);

    assert.notEqual(store.corpus(), before);
  });
});

describe('cache identity is the invalidation signal', () => {
  for (const row of STORES.filter((entry) => entry.cacheField)) {
    it(`${row.name} publishes a new cache object on every save rather than mutating the old one`, async () => {
      const { store } = observedStore(row);
      store.load();
      const before = store[row.cacheField];

      await row.save(store);

      assert.notEqual(store[row.cacheField], before);
    });
  }
});
