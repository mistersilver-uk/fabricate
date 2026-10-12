/**
 * `countComponentsByTag` (issue 2430): the tag adder's per-tag component count, keyed by the tag
 * exactly as stored, because a tag requirement matches by exact comparison.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { countComponentsByTag } from '../src/ui/model/vocabularyUsage.js';

describe('countComponentsByTag', () => {
  it('counts each component once per distinct tag it carries', () => {
    assert.deepEqual(
      countComponentsByTag([
        { tags: ['herb', 'rare'] },
        { tags: ['herb', 'herb'] },
        { tags: ['ore'] },
      ]),
      { herb: 2, rare: 1, ore: 1 }
    );
  });

  it('matches exactly, so two spellings that differ only in case are two tags', () => {
    assert.deepEqual(countComponentsByTag([{ tags: ['Wood'] }, { tags: ['wood'] }]), {
      Wood: 1,
      wood: 1,
    });
  });

  it('does not trim, so a padded tag is a distinct key', () => {
    assert.deepEqual(countComponentsByTag([{ tags: ['wood'] }, { tags: [' wood'] }]), {
      wood: 1,
      ' wood': 1,
    });
  });

  it('skips blanks and tolerates components with no tag array', () => {
    assert.deepEqual(
      countComponentsByTag([
        { tags: ['', null, undefined, 'herb'] },
        { tags: 'herb' },
        {},
        null,
        { tags: null },
      ]),
      { herb: 1 }
    );
  });

  it('answers an empty record for an empty or missing input', () => {
    assert.deepEqual(countComponentsByTag([]), {});
    assert.deepEqual(countComponentsByTag(undefined), {});
  });

  it('keeps `constructor` and `__proto__` as ordinary own keys', () => {
    const counts = countComponentsByTag([{ tags: ['constructor', '__proto__'] }]);
    assert.ok(Object.hasOwn(counts, 'constructor'), 'constructor is an own key');
    assert.ok(Object.hasOwn(counts, '__proto__'), '__proto__ is an own key');
    assert.equal(counts.constructor, 1);
    assert.equal(Object.getOwnPropertyDescriptor(counts, '__proto__').value, 1);
    assert.equal(Object.getPrototypeOf(counts), Object.prototype, 'the prototype is untouched');
  });
});
