// The WORLD character-libraries import merge (issue 1308), and the ORDERING that makes copy-mode
// import work at all. WHY THIS SUITE EXISTS. `CompendiumImporter._persistCharacterLibraries`
// shipped with no test.
import test from 'node:test';
import assert from 'node:assert/strict';

import { CompendiumImporter } from '../src/systems/CompendiumImporter.js';
import { importerOverSettings } from './helpers/worldConfigImporterHarness.js';

const KEY = 'characterLibraries';

const SMITH = { id: 'smithsTools', name: "Smith's Tools", path: 'tools.smith.value', op: 'gte', value: 1 };
const MED = { id: 'med', label: 'Medicine', expression: '@abilities.med.mod' };

test('seeds both libraries into a world that has none', async () => {
  const { importer, settings } = importerOverSettings();
  await importer._persistCharacterLibraries({
    characterPrerequisites: [SMITH],
    modifiers: [MED],
  });
  assert.deepEqual(settings[KEY].characterPrerequisites.map((e) => e.id), ['smithsTools']);
  assert.deepEqual(settings[KEY].modifiers.map((e) => e.id), ['med']);
});

// DESTINATION WINS, exactly as the currency and realm merges do.
test('an id the destination already holds keeps the DESTINATION’s definition', async () => {
  const { importer, settings } = importerOverSettings({
    [KEY]: { characterPrerequisites: [{ ...SMITH, value: 5 }], modifiers: [] },
  });
  await importer._persistCharacterLibraries({
    characterPrerequisites: [SMITH],
    modifiers: [],
  });
  assert.equal(settings[KEY].characterPrerequisites.length, 1);
  assert.equal(settings[KEY].characterPrerequisites[0].value, 5, 'the local rule is not overwritten');
});

test('appends only genuinely new entries, preserving destination order', async () => {
  const { importer, settings } = importerOverSettings({
    [KEY]: { characterPrerequisites: [], modifiers: [MED] },
  });
  await importer._persistCharacterLibraries({
    characterPrerequisites: [],
    modifiers: [MED, { id: 'alch', label: 'Alchemy', expression: '@abilities.alch.mod' }],
  });
  assert.deepEqual(settings[KEY].modifiers.map((e) => e.id), ['med', 'alch']);
});

// THE PER-KEY MERGE, and the reason it cannot be one object-level destination-wins.
test('merges the two libraries INDEPENDENTLY', async () => {
  const { importer, settings } = importerOverSettings({
    [KEY]: { characterPrerequisites: [SMITH] },
  });
  await importer._persistCharacterLibraries({
    characterPrerequisites: [SMITH],
    modifiers: [MED],
  });
  assert.deepEqual(settings[KEY].characterPrerequisites.map((e) => e.id), ['smithsTools']);
  assert.deepEqual(
    settings[KEY].modifiers.map((e) => e.id),
    ['med'],
    'a destination holding only prerequisites must not swallow the incoming modifiers'
  );
});

test('a destination whose setting is absent, empty, or one-list-only all merge cleanly', async () => {
  for (const seed of [undefined, {}, { modifiers: [MED] }]) {
    const { importer, settings } = importerOverSettings(seed === undefined ? {} : { [KEY]: seed });
    await importer._persistCharacterLibraries({ characterPrerequisites: [SMITH], modifiers: [] });
    assert.deepEqual(settings[KEY].characterPrerequisites.map((e) => e.id), ['smithsTools']);
    assert.ok(Array.isArray(settings[KEY].modifiers), 'both keys are always written');
  }
});

// No new entries means no write.
test('writes NOTHING when the import adds no new entry', async () => {
  const { importer, settings } = importerOverSettings({
    [KEY]: { characterPrerequisites: [SMITH], modifiers: [MED] },
  });
  const before = settings[KEY];
  await importer._persistCharacterLibraries({
    characterPrerequisites: [SMITH],
    modifiers: [MED],
  });
  assert.equal(settings[KEY], before, 'the stored object is untouched, by identity');
});

test('ignores a malformed or absent payload rather than throwing', async () => {
  const { importer, settings } = importerOverSettings();
  for (const payload of [undefined, null, 'nope', [], 7]) {
    await assert.doesNotReject(() => importer._persistCharacterLibraries(payload));
  }
  assert.equal(settings[KEY], undefined, 'and never writes for one');
});

// THE ORDERING: `_normalizeSystem` derives its Valid Id Basis from the world libraries, so a system
// created while the incoming entries are still only in the payload is pruned against a basis that
// cannot see them. A manager double that records what the world held at `createSystem` time sees
// the order no non-normalizing fake could.
test('the merge is ordered BEFORE the system create, unlike the currency merge', async () => {
  const settings = {};
  const atCreate = [];
  const manager = {
    getSystems: () => [],
    getSystem: () => null,
    getItems: () => [],
    createSystem: async (data) => {
      atCreate.push({
        libraries: structuredClone(settings[KEY]),
        currency: structuredClone(settings.currencyConfig),
      });
      return { ...data, id: 'sys-imported' };
    },
  };
  const recipeManager = { getRecipes: () => [], notifyRecipesChanged: () => {} };
  const importer = new CompendiumImporter(manager, recipeManager, {
    getSetting: (key) => settings[key],
    setSetting: async (key, value) => {
      settings[key] = value;
    },
    isGM: () => true,
    reportProgress: () => {},
  });
  await importer.importFromPackData({
    system: { id: 'sys-imported', name: 'Imported' },
    characterLibraries: { characterPrerequisites: [SMITH], modifiers: [MED] },
    currencyConfig: { units: [{ id: 'gp', label: 'Gold', value: 1 }] },
  });
  assert.equal(atCreate.length, 1, 'the system was created exactly once');
  assert.deepEqual(
    atCreate[0].libraries,
    { characterPrerequisites: [SMITH], modifiers: [MED] },
    'the character-libraries merge must land BEFORE the system is created'
  );
  assert.equal(atCreate[0].currency, undefined, 'while the currency merge still runs after it');
  assert.deepEqual(
    settings.currencyConfig.units.map(({ id }) => id),
    ['gp'],
    'and it does land'
  );
});

// The store caches what it read, and `_setSetting` writes the setting directly.
test('republishes the store after writing, so the manager’s basis is not stale', async () => {
  const loads = [];
  const previous = globalThis.game;
  globalThis.game = {
    fabricate: { getCharacterLibrariesStore: () => ({ load: () => loads.push('load') }) },
  };
  try {
    const { importer } = importerOverSettings();
    await importer._persistCharacterLibraries({ characterPrerequisites: [SMITH] });
    assert.deepEqual(loads, ['load'], 'a landed merge reloads the store');
    await importer._persistCharacterLibraries({ characterPrerequisites: [SMITH] });
    assert.deepEqual(loads, ['load'], 'and a merge that adds nothing has nothing to republish');
  } finally {
    globalThis.game = previous;
  }
});
