import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findCuratedIconRecord, listCuratedIconVocabulary } from '../src/utils/iconVocabulary.js';
import {
  FOUNDRY_CURATED_ICON_DEFINITIONS,
  FOUNDRY_ICON_DEFINITIONS
} from '../src/ui/svelte/util/foundryIconVocabulary.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainSource = readFileSync(resolve(__dirname, '../src/main.js'), 'utf8');
const apiDocs = readFileSync(resolve(__dirname, '../docs/api/index.md'), 'utf8');

describe('the published icon vocabulary (issue 1269)', () => {
  it('publishes every curated definition, in the curated order', () => {
    const published = listCuratedIconVocabulary();

    assert.equal(published.length, FOUNDRY_CURATED_ICON_DEFINITIONS.length);
    assert.deepEqual(
      published.map(({ iconCode }) => iconCode),
      FOUNDRY_CURATED_ICON_DEFINITIONS.map(({ iconCode }) => iconCode),
      'the published list is the curated set itself, neither re-filtered nor re-sorted'
    );
  });

  it('publishes exactly the three documented fields, and nothing else', () => {
    // The contract a companion binds to is `{ iconCode, label, aliases }`. A spread of the stored
    // definition would publish whatever a later regeneration of the catalogue happens to add, so
    // the projection names its fields one at a time.
    for (const record of listCuratedIconVocabulary()) {
      assert.deepEqual(
        Object.keys(record).sort(),
        ['aliases', 'iconCode', 'label'],
        `${record.iconCode} should carry only the three published fields`
      );
      assert.equal(typeof record.iconCode, 'string');
      assert.equal(typeof record.label, 'string');
      assert.ok(Array.isArray(record.aliases), 'aliases should always be an array, never absent');
    }
  });

  // `aliases` is published because one entry exists per GLYPH rather than per name, so the offered
  // name is only one of the names a stored icon may legitimately use. Dropping the field would
  // publish a lossy view of a deduplicated set, and the part lost is exactly what a caller needs
  // to interpret data a GM already saved.
  it('publishes the other names a glyph answers to', () => {
    const gear = listCuratedIconVocabulary().find(({ iconCode }) => iconCode === 'gear');

    assert.ok(gear, 'the gear should be in the curated vocabulary');
    assert.ok(
      gear.aliases.includes('cog'),
      'a persisted `fas fa-cog` names this glyph, so `cog` has to be reachable from its record'
    );
  });

  // The reason the projection copies. The catalogue freezes entry by entry, so the older hazard —
  // a caller writing through a shared object into every picker — is closed at the source. What
  // survives is that a frozen row cannot be sorted or appended to, and that the freezing lives in
  // a GENERATED file rather than in this contract.
  it('hands back rows a caller owns, all the way down', () => {
    const [firstDefinition] = FOUNDRY_CURATED_ICON_DEFINITIONS;
    const [firstPublished] = listCuratedIconVocabulary();

    assert.ok(
      firstPublished !== firstDefinition,
      "a published record must not be the module's own definition object"
    );
    assert.equal(Object.isFrozen(firstPublished), false, 'a published record must be writable');
    assert.equal(
      Object.isFrozen(firstPublished.aliases),
      false,
      'and so must its aliases, or `record.aliases.sort()` throws on a caller'
    );

    const aliased = listCuratedIconVocabulary().find(({ aliases }) => aliases.length > 0);
    const source = FOUNDRY_CURATED_ICON_DEFINITIONS.find(
      ({ iconCode }) => iconCode === aliased.iconCode
    );
    assert.ok(
      aliased.aliases !== source.aliases,
      'the aliases array must be copied too, not borrowed from the definition'
    );

    // The caller-owned promise, exercised rather than asserted about.
    assert.doesNotThrow(() => {
      const mine = listCuratedIconVocabulary();
      mine.sort((a, b) => a.label.localeCompare(b.label));
      mine[0].label = 'mine now';
      mine[0].aliases.push('mine-too');
    }, 'a caller must be able to sort and edit what it is handed');

    assert.ok(
      FOUNDRY_ICON_DEFINITIONS.every(({ label }) => label !== 'mine now'),
      'and none of that may reach the catalogue every picker renders from'
    );
  });

  it('hands every call its own array and its own records', () => {
    const first = listCuratedIconVocabulary();
    const second = listCuratedIconVocabulary();

    assert.ok(first !== second, 'two calls must not share one array');
    assert.ok(first[0] !== second[0], 'two calls must not share one record');
    assert.deepEqual(first, second, 'but they must carry equal data');
  });
});

describe('resolving a name to a curated record (issue 1269)', () => {
  it('resolves the offered name and every alias to the same record', () => {
    const byOfferedName = findCuratedIconRecord('gear');
    const byAlias = findCuratedIconRecord('cog');

    assert.deepEqual(byOfferedName, byAlias, 'one glyph, one record, whichever name asked for it');
    assert.equal(byOfferedName.iconCode, 'gear', 'the record reports the OFFERED name');
  });

  it('answers null for a name the catalogue does not carry', () => {
    // The whole reason a resolver is published rather than a predicate. The vocabulary's
    // `isExcludedIconName` consults no catalogue, so it reports a typo as unexcluded; this
    // answers from the catalogue and cannot.
    assert.equal(findCuratedIconRecord('zzz-not-a-real-icon'), null);
    assert.equal(findCuratedIconRecord(''), null);
    assert.equal(findCuratedIconRecord(null), null);
  });

  it('answers null for a real icon the curation leaves out', () => {
    const curatedCodes = new Set(FOUNDRY_CURATED_ICON_DEFINITIONS.map(({ iconCode }) => iconCode));
    const excluded = FOUNDRY_ICON_DEFINITIONS.find(({ iconCode }) => !curatedCodes.has(iconCode));

    assert.ok(excluded, 'the curation should leave something out');
    assert.equal(
      findCuratedIconRecord(excluded.iconCode),
      null,
      'resolution answers for the curated vocabulary, not for the whole catalogue'
    );
  });

  it('hands back a record the caller owns', () => {
    const record = findCuratedIconRecord('cog');

    assert.equal(Object.isFrozen(record), false);
    assert.equal(Object.isFrozen(record.aliases), false);
    assert.ok(findCuratedIconRecord('cog') !== record, 'two lookups must not share one record');
    assert.deepEqual(
      Object.keys(record).sort(),
      ['aliases', 'iconCode', 'label'],
      'and it is the same shape a list row has'
    );
  });
});

describe('the icon vocabulary accessors on game.fabricate (issue 1269)', () => {
  it('gates both accessors on readiness and delegates to the shared projection', () => {
    // `src/main.js` imports Foundry globals and a stylesheet at module scope and cannot be
    // imported under `node:test`, so its wiring is asserted against its source, as every other
    // `game.fabricate` surface test in this repository does. The BEHAVIOUR under that wiring is
    // covered above, against the projection the accessors delegate to.
    assert.match(
      mainSource,
      /listCuratedIcons\(\) \{\s*this\._requireReady\(\);\s*return listCuratedIconVocabulary\(\);\s*\}/,
      'listCuratedIcons should throw through _requireReady() and return the shared projection'
    );
    assert.match(
      mainSource,
      /findCuratedIcon\(iconName\) \{\s*this\._requireReady\(\);\s*return findCuratedIconRecord\(iconName\);\s*\}/,
      'findCuratedIcon should throw through _requireReady() and return the shared projection'
    );
    assert.ok(
      mainSource.includes(
        "import { findCuratedIconRecord, listCuratedIconVocabulary } from './utils/iconVocabulary.js';"
      ),
      'main.js should take both projections from the shared module rather than re-implementing them'
    );
  });

  // A deliberate narrowing, pinned so reversing it is a decision rather than a slip. Nothing in
  // the vocabulary module is reachable from the API except through the projection, which rules out
  // publishing `isExcludedIconName` alongside the list. That predicate asks whether a name matches
  // an exclusion, not whether Foundry can draw it, so it reports a typo as unexcluded. The
  // published list and `findCuratedIcon` both answer from the catalogue and cannot.
  it('reaches the vocabulary only through the projection', () => {
    assert.equal(
      /from '[^']*foundryIcon(Vocabulary|Catalogue)\.js'/.test(mainSource),
      false,
      'main.js must not import the vocabulary module directly, exclusion predicate included'
    );
  });
});

test('the API reference documents both icon vocabulary accessors', () => {
  // `docs/api/index.md` hand-lists the `game.fabricate` surface, so it is a MIRROR of `main.js`,
  // and a mirror rots silently: a companion author reading the page is the only thing that
  // notices.
  //
  // Scoped to the quick-reference block on purpose: a bare `includes` over the whole page is
  // satisfied by the worked example below it, so deleting the roster line would prove nothing.
  const quickReference = apiDocs.slice(
    apiDocs.indexOf('### Services And Runtime Methods'),
    apiDocs.indexOf('### Global Macro Helpers')
  );
  assert.ok(quickReference.length > 0, 'the quick-reference block should be locatable');
  for (const call of ['game.fabricate.listCuratedIcons()', 'game.fabricate.findCuratedIcon(']) {
    assert.ok(quickReference.includes(call), `the quick reference should list ${call}`);
  }

  assert.ok(
    apiDocs.includes('### Icon Vocabulary'),
    'the accessors should have a section of their own'
  );
  const section = apiDocs.slice(apiDocs.indexOf('### Icon Vocabulary'));
  for (const call of ['game.fabricate.listCuratedIcons()', 'game.fabricate.findCuratedIcon(']) {
    assert.ok(
      section.includes(call),
      `that section should document ${call} by worked example, as its siblings do`
    );
  }
});
