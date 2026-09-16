// The WORLD character-libraries import merge (issue 1308), and the ORDERING that makes copy-mode
// import work at all.
//
// WHY THIS SUITE EXISTS. `CompendiumImporter._persistCharacterLibraries` shipped with no test.
// Its two siblings — the currency ladder (issue 1278) and the realm library (issue 1282) — are
// each covered by a merge suite standing over `importerOverSettings`; this one was missed, and the
// gap is not academic. The merge is deliberately placed BEFORE the system is created, unlike both
// siblings, and moving it back below `createSystem` turns nothing red today, because every
// importer test stands over a mock system manager that never normalizes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { importerOverSettings } from './helpers/worldConfigImporterHarness.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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

// DESTINATION WINS, exactly as the currency and realm merges do. An id already in this world keeps
// its own definition: that is what makes an import safe to run twice, and what keeps every book,
// tool, check and drop row that references the id resolving to the rule its author meant.
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

// THE PER-KEY MERGE, and the reason it cannot be one object-level destination-wins. The two lists
// share a setting key for persistence economy and share no invariant, so a destination holding
// only prerequisites must not win the whole slice and silently discard every incoming modifier.
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

// No new entries means no write. Without the short-circuit every re-import rewrites the setting,
// which fires the replication bridge and re-announces an invalidation for a change that is not one.
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

// THE ORDERING, pinned on the SOURCE because no behavioural fixture can reach it: every importer
// test stands over a mock system manager that does not normalize, so moving the call below
// `createSystem` leaves the whole suite green while breaking copy-mode import in production.
//
// It matters because `_normalizeSystem` derives its Valid Id Basis from these libraries. A system
// created while the incoming entries are still only in the payload has every tool prerequisite
// reference and every `defaultModifierIds` pruned against a basis that cannot yet see them.
test('the merge is ordered BEFORE the system create/update, unlike currency and travel', () => {
  const source = readFileSync(
    resolve(repoRoot, 'src/systems/CompendiumImporter.js'),
    'utf8'
  );
  const merge = source.indexOf('await this._persistCharacterLibraries(');
  const create = source.indexOf('await this._craftingSystemManager.createSystem(');
  const currency = source.indexOf('await this._persistCurrencyConfig(');
  assert.ok(merge > 0 && create > 0 && currency > 0, 'located all three call sites');
  assert.ok(
    merge < create,
    'the character-libraries merge must run BEFORE the system is created, or the normalizer ' +
      'prunes every incoming reference against a basis that cannot see the new entries'
  );
  assert.ok(
    currency > create,
    'and the currency merge still runs after it — the contrast is the point: nothing reads the ' +
      'coin ladder during normalization, and these two libraries are read during it'
  );
});

// The store caches what it read. `_setSetting` writes the setting directly, so without an explicit
// reload the manager goes on deriving its basis from the pre-import libraries for the rest of the
// session — which is the same failure the ordering above prevents, arriving one step later.
test('republishes the store after writing, so the manager’s basis is not stale', () => {
  const source = readFileSync(
    resolve(repoRoot, 'src/systems/CompendiumImporter.js'),
    'utf8'
  );
  const body = source.slice(
    source.indexOf('async _persistCharacterLibraries('),
    source.indexOf('async _persistCurrencyConfig(')
  );
  assert.match(body, /getCharacterLibrariesStore\?\.\(\)\?\.load\?\.\(\)/);
});
