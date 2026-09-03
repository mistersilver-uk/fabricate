/**
 * The shared category-total model behind both GM libraries' group headers (issue 676).
 *
 * Both studios group the PAGE, so a header that reports only its rendered count says
 * "General · 25 components" above page 1 of a 282-strong bucket. These are the pure
 * counts the header's second number comes from.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { categoryTotalOf, countByCategory } from '../../src/utils/browserGroupCounts.js';

const categoryOf = (row) => row.category;

describe('browserGroupCounts — countByCategory', () => {
  it('counts the rows each category holds', () => {
    const counts = countByCategory(
      [
        { category: 'alchemy' },
        { category: 'smithing' },
        { category: 'alchemy' },
        { category: 'alchemy' },
      ],
      categoryOf
    );

    assert.equal(counts.get('alchemy'), 3);
    assert.equal(counts.get('smithing'), 1);
    assert.equal(counts.get('cooking'), undefined);
  });

  it('tolerates a non-array roster', () => {
    assert.equal(countByCategory(null, categoryOf).size, 0);
    assert.equal(countByCategory(undefined, categoryOf).size, 0);
  });
});

describe('browserGroupCounts — categoryTotalOf', () => {
  const totals = countByCategory([{ category: 'a' }, { category: 'a' }, { category: 'b' }], categoryOf);

  it('reports the category total when it exceeds what the page renders', () => {
    assert.equal(categoryTotalOf(totals, 'a', 1), 2);
  });

  it('never reports FEWER than the group renders', () => {
    // A total below the rendered count could only come from a totals map built off a
    // different (narrower) filter than the rows being grouped — the header must not
    // claim a category holds less than the rows visible under it.
    assert.equal(categoryTotalOf(totals, 'b', 3), 3);
  });

  it('degrades to the rendered count for an absent category or a missing map', () => {
    assert.equal(categoryTotalOf(totals, 'unknown', 4), 4);
    assert.equal(categoryTotalOf(undefined, 'a', 4), 4);
    assert.equal(categoryTotalOf(null, 'a', 4), 4);
  });
});
