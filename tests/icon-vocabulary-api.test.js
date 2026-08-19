import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { listCuratedIconVocabulary } from '../src/utils/iconVocabulary.js';
import {
  FONT_AWESOME_FREE_CLASSIC_CURATED_ICON_DEFINITIONS,
  FONT_AWESOME_FREE_CLASSIC_ICON_DEFINITIONS
} from '../src/ui/svelte/util/fontAwesomeFreeClassicIcons.js';

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
