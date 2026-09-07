/**
 * THE QUANTITY READINGS THE RETIRED TAG USED TO OWN (issue 1506).
 *
 * `QuantityTag` was a chip that rendered a label and a value, and the VALUE was composed at each
 * of its six call sites: `state.have ?? 0` twice, a `${have}/${need}` ratio once, a `×${have}`
 * stack count once. The component itself formatted nothing. So retiring it into `Chip` would have
 * left those four readings spelled out at the call sites with no home and no test — four copies
 * of "what a count looks like when a model hands you `undefined`", in two files, with the one
 * place they could have been compared gone.
 *
 * They are one module here for the same reason `craftingRecipeStatus.js` and `journalRunStatus.js`
 * are modules: a pure, closed presentation vocabulary is unit-testable and a template literal
 * inside a `.svelte` markup block is not.
 *
 * WHAT IS DELIBERATELY TOTAL. Every reading answers with a number, whatever the model handed
 * over. The retired call sites were total only where someone had remembered `?? 0`: the stack
 * count rendered the string `×undefined` for a stack with no `have`, and the ratio rendered
 * `undefined/undefined`. That is the behaviour these cases pin, and it is a repair rather than a
 * reproduction, so it is asserted rather than left to be discovered.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  countText,
  haveOfNeedText,
  stackCountText,
} from '../src/ui/svelte/util/craftingQuantityReading.js';

describe('1506 the crafting quantity readings — a count', () => {
  it('writes a real count as its own digits', () => {
    assert.equal(countText(0), '0');
    assert.equal(countText(3), '3');
    assert.equal(countText(12), '12');
  });

  it('reads a numeric STRING, because a model may hand one over', () => {
    assert.equal(countText('4'), '4');
  });

  it('answers ZERO for every absent or unreadable value rather than printing it', () => {
    for (const absent of [null, undefined, '', 'abc', NaN, Infinity, -Infinity, {}]) {
      assert.equal(
        countText(absent),
        '0',
        `a chip must never read "${String(absent)}" back to a player as a quantity`
      );
    }
  });

  it('keeps a fractional count, because rounding one would misreport a holding', () => {
    assert.equal(countText(1.5), '1.5');
  });

  it('keeps a negative count, which is a real shortfall and not an error to swallow', () => {
    assert.equal(countText(-2), '-2');
  });
});

describe('1506 the crafting quantity readings — held against needed', () => {
  it('writes the pair the alternatives picker reads', () => {
    assert.equal(haveOfNeedText(2, 1), '2/1');
    assert.equal(haveOfNeedText(0, 3), '0/3');
  });

  it('is total on both sides, where the retired call site rendered `undefined/undefined`', () => {
    assert.equal(haveOfNeedText(undefined, undefined), '0/0');
    assert.equal(haveOfNeedText(null, 2), '0/2');
  });
});

describe('1506 the crafting quantity readings — a held stack', () => {
  it('writes the multiplication sign the stack chooser reads, not the letter x', () => {
    assert.equal(stackCountText(3), '×3');
    assert.ok(!stackCountText(3).includes('x'), 'the sign is U+00D7, which is what shipped');
  });

  it('is total, where the retired call site rendered `×undefined`', () => {
    assert.equal(stackCountText(undefined), '×0');
  });
});
