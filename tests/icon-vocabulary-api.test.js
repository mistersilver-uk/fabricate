import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { listCuratedIconVocabulary } from '../src/utils/iconVocabulary.js';
import {
  FONT_AWESOME_FREE_CLASSIC_CURATED_ICON_DEFINITIONS,
  FONT_AWESOME_FREE_CLASSIC_ICON_DEFINITIONS
} from '../src/ui/svelte/util/fontAwesomeFreeClassicIcons.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainSource = readFileSync(resolve(__dirname, '../src/main.js'), 'utf8');
const apiDocs = readFileSync(resolve(__dirname, '../docs/api/index.md'), 'utf8');

describe('the published icon vocabulary (issue 1269)', () => {
  it('publishes every curated definition, in the curated order', () => {
    const published = listCuratedIconVocabulary();

    assert.equal(published.length, FONT_AWESOME_FREE_CLASSIC_CURATED_ICON_DEFINITIONS.length);
    assert.deepEqual(
      published.map(({ iconCode }) => iconCode),
      FONT_AWESOME_FREE_CLASSIC_CURATED_ICON_DEFINITIONS.map(({ iconCode }) => iconCode),
      'the published list is the curated set itself, neither re-filtered nor re-sorted'
    );
  });

  it('publishes exactly the three documented fields, and nothing else', () => {
    // The contract a companion binds to is `{ iconCode, label, hasRegular }`. A spread of the
    // stored definition would publish whatever a later regeneration of the catalogue happens to
    // add, so the projection names its fields one at a time.
    for (const record of listCuratedIconVocabulary()) {
      assert.deepEqual(
        Object.keys(record).sort(),
        ['hasRegular', 'iconCode', 'label'],
        `${record.iconCode} should carry only the three published fields`
      );
      assert.equal(typeof record.iconCode, 'string');
      assert.equal(typeof record.label, 'string');
      assert.equal(typeof record.hasRegular, 'boolean');
    }
  });

  // The reason the projection copies rather than handing the frozen array back. The freeze is
  // shallow: `Object.freeze([...])` freezes the array, not the objects in it, and the curated
  // array is `filter`ed out of the full catalogue, so each entry object is THE SAME object the
  // 1402-entry catalogue holds. Handing one to a caller lends it a writable handle on the data
  // every Fabricate icon picker renders from.
  it('leaves the module unreachable through the value it hands back', () => {
    const [firstDefinition] = FONT_AWESOME_FREE_CLASSIC_CURATED_ICON_DEFINITIONS;
    const [firstPublished] = listCuratedIconVocabulary();

    assert.ok(
      firstPublished !== firstDefinition,
      "a published record must not be the module's own definition object"
    );

    firstPublished.label = 'mutated by a caller';
    firstPublished.iconCode = 'mutated-by-a-caller';

    assert.equal(
      firstDefinition.label,
      listCuratedIconVocabulary()[0].label,
      'a caller writing to its own copy must not reach the curated definitions'
    );
    assert.ok(
      FONT_AWESOME_FREE_CLASSIC_ICON_DEFINITIONS.every(
        ({ label }) => label !== 'mutated by a caller'
      ),
      'nor the full catalogue the curated set is filtered out of, which shares those objects'
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

describe('the icon vocabulary accessor on game.fabricate (issue 1269)', () => {
  it('gates the accessor on readiness and delegates to the shared projection', () => {
    // `src/main.js` imports Foundry globals and a stylesheet at module scope and cannot be
    // imported under `node:test`, so its wiring is asserted against its source, as every other
    // `game.fabricate` surface test in this repository does. The BEHAVIOUR under that wiring is
    // covered above, against the projection the accessor delegates to.
    assert.match(
      mainSource,
      /listCuratedIcons\(\) \{\s*this\._requireReady\(\);\s*return listCuratedIconVocabulary\(\);\s*\}/,
      'listCuratedIcons should throw through _requireReady() and return the shared projection'
    );
    assert.ok(
      mainSource.includes("import { listCuratedIconVocabulary } from './utils/iconVocabulary.js';"),
      'main.js should take the projection from the shared module rather than re-implementing it'
    );
  });

  // A deliberate narrowing, pinned so reversing it is a decision rather than a slip. Nothing in
  // the icon-definitions module is reachable from the API except through the projection, which
  // rules out publishing `isCuratedFontAwesomeClassicFreeIcon` alongside the list. That predicate
  // asks "does any exclusion pattern match this string", which is NOT the membership question a
  // companion validating a stored icon asks: it answers true for a typo, for a Pro-only code, and
  // for any string Font Awesome never shipped. The published list answers it correctly.
  it('reaches the vocabulary only through the projection', () => {
    assert.equal(
      /from '[^']*fontAwesomeFreeClassicIcons\.js'/.test(mainSource),
      false,
      'main.js must not import the definitions module directly, predicate included'
    );
  });
});

test('the API reference documents the icon vocabulary accessor', () => {
  // `docs/api/index.md` hand-lists the `game.fabricate` surface, so it is a MIRROR of `main.js`,
  // and a mirror rots silently: a companion author reading the page is the only thing that
  // notices.
  // Scoped to the quick-reference block on purpose: a bare `includes` over the whole page is
  // satisfied by the worked example below it, so deleting the roster line would prove nothing.
  const quickReference = apiDocs.slice(
    apiDocs.indexOf('### Services And Runtime Methods'),
    apiDocs.indexOf('### Global Macro Helpers')
  );
  assert.ok(quickReference.length > 0, 'the quick-reference block should be locatable');
  assert.ok(
    quickReference.includes('game.fabricate.listCuratedIcons()'),
    'the quick reference should list the accessor'
  );

  const section = apiDocs.slice(apiDocs.indexOf('### Icon Vocabulary'));
  assert.ok(apiDocs.includes('### Icon Vocabulary'), 'the accessor should have a section of its own');
  assert.ok(
    section.includes('game.fabricate.listCuratedIcons()'),
    'that section should document the accessor by worked example, as its siblings do'
  );
});
