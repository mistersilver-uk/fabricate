/**
 * The world-scope entity STORE contract (issue 1359, part of epic 1357). ONE PARAMETERIZED
 * CONTRACT, CALLED ONCE PER KEY, on #1358's `tests/scoped-definitions.test.js` precedent — not
 * three near-duplicate suites.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SETTING_KEYS, WORLD_SCOPED_SETTING_KEYS } from '../src/config/settings.js';
import {
  createComponentScopeStore,
  createEssenceScopeStore,
  createToolScopeStore,
} from '../src/systems/worldScopeStores.js';

/**
 * The three keys, each with a section its own entity type actually resolves over, so the
 * parameterized contract exercises a REAL override rather than a key the normalizer would drop.
 */
const SCOPES = [
  {
    name: 'componentScope',
    settingKey: SETTING_KEYS.COMPONENT_SCOPE,
    create: createComponentScopeStore,
    section: 'category',
    sectionValue: 'ore',
  },
  {
    name: 'essenceScope',
    settingKey: SETTING_KEYS.ESSENCE_SCOPE,
    create: createEssenceScopeStore,
    section: 'macro',
    sectionValue: 'Macro.worldEssenceMacro',
  },
  {
    name: 'toolScope',
    settingKey: SETTING_KEYS.TOOL_SCOPE,
    create: createToolScopeStore,
    section: 'breakage',
    sectionValue: { mode: 'breakageChance', breakageChance: 25 },
  },
];

/** A `Map`-backed settings seam, so a case can read the RAW stored value back. */
function settingsSeam(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getSetting: (key) => values.get(key),
    setSetting: async (key, value) => {
      values.set(key, value);
      return value;
    },
  };
}

/** A DISTINCT, NON-DEFAULT, NON-EMPTY payload for one scope. */
function payloadFor(scope, suffix) {
  const first = `ent-${suffix}-1`;
  const second = `ent-${suffix}-2`;
  return {
    entities: [
      { id: first, name: `Entity ${suffix} 1` },
      { id: second, name: `Entity ${suffix} 2` },
    ],
    defaults: { [first]: { id: first, [scope.section]: scope.sectionValue } },
    membership: { [`${first}|sys-a`]: { entityId: first, systemId: 'sys-a', inherit: {} } },
  };
}

for (const scope of SCOPES) {
  describe(`the ${scope.name} store`, () => {
    // --- Criterion 2: the seeded predicate -------------------------------------------------
    it('reports an UNWRITTEN setting as unseeded, per sub-key, even though it reads as empty', () => {
      // THE CASE THAT DESTROYS WORLDS.
      const seam = settingsSeam({ [scope.settingKey]: {} });
      const store = scope.create(seam);
      assert.deepEqual(store.listEntities(), []);
      for (const subKey of ['entities', 'defaults', 'membership']) {
        assert.equal(store.isSeeded(subKey), false, `${subKey} was never written`);
      }
      assert.equal(store.isSeeded(), false, 'and the aggregate agrees');
    });

    it('reports a GM-EMPTIED sub-key as seeded, and its unwritten siblings as not', () => {
      // The distinction the basis turns on: "written empty" is a real, empty, PRUNABLE basis;
      // "never written" is not.
      const seam = settingsSeam({ [scope.settingKey]: { entities: [] } });
      const store = scope.create(seam);
      assert.equal(store.isSeeded('entities'), true, 'the GM emptied the roster deliberately');
      assert.equal(store.isSeeded('membership'), false, 'the sibling says nothing about itself');
      assert.equal(
        store.isSeeded(),
        true,
        'the aggregate ORs, which is why the basis never uses it'
      );
    });

    // --- Criterion 3: load() never throws --------------------------------------------------
    it('degrades to an unseeded store when the settings read THROWS', () => {
      // A throw here would propagate through `_normalizeSystem` into `hydrate` and out of
      // `initialize()` — the issue-970 failure mode where the manager never initializes at all.
      const store = scope.create({
        getSetting: () => {
          throw new Error('setting not registered yet');
        },
        setSetting: async () => {},
      });
      assert.doesNotThrow(() => store.load());
      assert.equal(store.isSeeded('entities'), false);
      assert.deepEqual(store.listEntities(), []);
    });

    it('is TOTAL over malformed input and drops what it cannot repair', () => {
      const selfReferential = { id: 'loop' };
      selfReferential.self = selfReferential;
      const seam = settingsSeam({
        [scope.settingKey]: {
          entities: [
            null,
            'not an object',
            [],
            { name: 'no id' },
            { id: '   ' },
            { id: '  spaced  ', name: 'Trimmed' },
            { id: 'spaced', name: 'Duplicate after trimming' },
            selfReferential,
          ],
          defaults: 'not a map',
          membership: 42,
        },
      });
      const store = scope.create(seam);
      assert.doesNotThrow(() => store.load());
      assert.deepEqual(
        store.listEntities().map((entity) => entity.id),
        ['spaced', 'loop'],
        'ids trimmed, id-less and non-object entries dropped, duplicates first-wins'
      );
      assert.deepEqual(store.listDefaults(), []);
      assert.deepEqual(store.listMemberships(), []);
    });

    it('is IDEMPOTENT: saving what it published changes nothing', async () => {
      const seam = settingsSeam({ [scope.settingKey]: payloadFor(scope, scope.name) });
      const store = scope.create(seam);
      const once = JSON.stringify(store.get());
      await store.save(store.get());
      assert.equal(JSON.stringify(store.get()), once);
    });

    // --- Criterion 4: publish before await -------------------------------------------------
    it('publishes the cache BEFORE awaiting the write', async () => {
      // `tests/currency-config-store.test.js`'s working precedent: a delayed `setSetting` promise
      // plus a SYNCHRONOUS read taken mid-flight.
      let releaseWrite;
      const store = scope.create({
        getSetting: () => ({}),
        setSetting: () =>
          new Promise((resolve) => {
            releaseWrite = resolve;
          }),
      });
      store.load();
      assert.equal(store.isSeeded('entities'), false);

      const pending = store.save(payloadFor(scope, 'inflight'));
      assert.equal(store.listEntities().length, 2, 'the cache is already the post-edit corpus');
      assert.equal(store.isSeeded('entities'), true, 'and a write means seeded from here on');

      releaseWrite();
      await pending;
    });

    // --- The stable corpus the memo keys on ------------------------------------------------
    it('publishes ONE corpus object and replaces it WHOLESALE', async () => {
      const seam = settingsSeam({ [scope.settingKey]: payloadFor(scope, 'stable') });
      const store = scope.create(seam);
      const first = store.corpus();
      assert.equal(
        store.corpus(),
        first,
        'repeated reads answer the SAME object, so the memo hits'
      );

      await store.save(payloadFor(scope, 'replaced'));
      assert.notEqual(store.corpus(), first, 'a write replaces it, so the memo misses by identity');

      const second = store.corpus();
      store.load();
      assert.notEqual(store.corpus(), second, 'and so does a replicated reload');
    });

    it('round-trips the persisted MAP shape, keying every record from the record itself', async () => {
      const seam = settingsSeam({ [scope.settingKey]: {} });
      const store = scope.create(seam);
      const first = `ent-${scope.name}-1`;
      await store.save({
        entities: [{ id: first, name: 'Kept' }],
        // A map key that DISAGREES with its record. The record is the truth, so the round trip
        // re-keys it rather than preserving a lookup that would find the wrong record.
        defaults: { 'wrong-key': { id: first, [scope.section]: scope.sectionValue } },
        membership: { 'wrong|key': { entityId: first, systemId: 'sys-a', inherit: {} } },
      });
      const stored = seam.values.get(scope.settingKey);
      assert.deepEqual(Object.keys(stored.defaults), [first]);
      assert.deepEqual(Object.keys(stored.membership), [`${first}|sys-a`]);
      assert.equal(stored.entities.length, 1);
    });
  });
}

// --- Criterion 5: the three settings are independent ---------------------------------------
describe('the three world scope settings', () => {
  it('are separate documents: writing one leaves the other two byte-for-byte unchanged', async () => {
    // Read the RAW backing values from the settings seam, never from another store instance's
    // cached getter — a stale cache would report "unchanged" for a value that had in fact been
    // clobbered, which is the exact failure this criterion exists to see.
    const seam = settingsSeam();
    const stores = SCOPES.map((scope) => ({ scope, store: scope.create(seam) }));
    for (const { scope, store } of stores) {
      await store.save(payloadFor(scope, scope.name));
    }
    const before = new Map(
      SCOPES.map((scope) => [scope.settingKey, JSON.stringify(seam.values.get(scope.settingKey))])
    );
    // Every payload is DISTINCT and NON-EMPTY, so an accidental clobber cannot pass as a match.
    assert.equal(new Set(before.values()).size, 3);

    const [component] = stores;
    await component.store.save(payloadFor(component.scope, 'rewritten'));

    for (const scope of SCOPES.slice(1)) {
      assert.equal(
        JSON.stringify(seam.values.get(scope.settingKey)),
        before.get(scope.settingKey),
        `${scope.name} cannot lose an update to a sibling key`
      );
    }
    assert.notEqual(
      JSON.stringify(seam.values.get(SETTING_KEYS.COMPONENT_SCOPE)),
      before.get(SETTING_KEYS.COMPONENT_SCOPE),
      'and the written key really did move'
    );
  });

  it('are the three keys this change registers, beside a FOURTH that is not one of them', () => {
    assert.equal(SETTING_KEYS.COMPONENT_SCOPE, 'componentScope');
    assert.equal(SETTING_KEYS.ESSENCE_SCOPE, 'essenceScope');
    assert.equal(SETTING_KEYS.TOOL_SCOPE, 'toolScope');
    // `fabricate.worldVocabulary` EXISTS since issue 1392, and this assertion INVERTS with it —
    // deliberately, because the claim was never "it does not exist" but "it is not one of these
    // three".
    assert.equal(SETTING_KEYS.WORLD_VOCABULARY, 'worldVocabulary');
    assert.equal(
      SCOPES.some((scope) => scope.settingKey === SETTING_KEYS.WORLD_VOCABULARY),
      false,
      'the scoped-definition shell must not acquire a fourth key'
    );
  });

  it('are registered at WORLD scope, which the rest of this suite cannot see', () => {
    // Every other case here injects its own settings seam, so it would pass verbatim against a
    // typo'd `scope: 'client'` registration - and that typo is not cosmetic.
    assert.equal(WORLD_SCOPED_SETTING_KEYS.has(SETTING_KEYS.COMPONENT_SCOPE), true);
    assert.equal(WORLD_SCOPED_SETTING_KEYS.has(SETTING_KEYS.ESSENCE_SCOPE), true);
    assert.equal(WORLD_SCOPED_SETTING_KEYS.has(SETTING_KEYS.TOOL_SCOPE), true);
    // Issue 1392: the vocabulary key is admitted to the DERIVED set by its own `scope: 'world'`,
    // which is what enrols it into the shared SETTINGS_MODIFY permission seam every test that
    // models a refused write reads.
    assert.equal(WORLD_SCOPED_SETTING_KEYS.has(SETTING_KEYS.WORLD_VOCABULARY), true);
  });
});

// --- The tool scope's one extra field -------------------------------------------------------
describe('the world tool-breakage authority', () => {
  it('persists at world scope and is ABSENCE-PRESERVING', async () => {
    const seam = settingsSeam();
    const store = createToolScopeStore(seam);
    await store.save({ entities: [], toolBreakage: { authority: 'checkDriven' } });
    assert.deepEqual(seam.values.get(SETTING_KEYS.TOOL_SCOPE).toolBreakage, {
      authority: 'checkDriven',
    });

    // An unauthored or unrecognized authority carries NO key at all rather than minting
    // `toolSpecific`.
    await store.save({ entities: [], toolBreakage: { authority: 'nonsense' } });
    assert.equal('toolBreakage' in seam.values.get(SETTING_KEYS.TOOL_SCOPE), false);
    await store.save({ entities: [] });
    assert.equal('toolBreakage' in seam.values.get(SETTING_KEYS.TOOL_SCOPE), false);
  });

  it('is carried by the tool scope ALONE', async () => {
    const seam = settingsSeam();
    for (const create of [createComponentScopeStore, createEssenceScopeStore]) {
      const store = create(seam);
      await store.save({ entities: [], toolBreakage: { authority: 'checkDriven' } });
    }
    assert.equal('toolBreakage' in seam.values.get(SETTING_KEYS.COMPONENT_SCOPE), false);
    assert.equal('toolBreakage' in seam.values.get(SETTING_KEYS.ESSENCE_SCOPE), false);
  });
});
