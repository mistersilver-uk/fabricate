/**
 * The shared dotted-path walker (issue 1024).
 *
 * Five hand-rolled walkers collapsed into this one module, so the behaviours each
 * consumer relied on are pinned here rather than rediscovered from a regression:
 *
 *   - `currencyProfile.js` preferred `foundry.utils.getProperty`, which tries a dotted
 *     key as a LITERAL own key first. That branch is kept.
 *   - `runFlagInvalidation.js` needs PRESENCE (`in`), not a value read, because an
 *     `updateActor` change diff can legitimately carry `undefined` at a touched path.
 *   - the four item-creation sites need `setByPath` to CREATE intermediate objects; a
 *     reducer-shaped setter no-ops on a >= 3-segment path and the created item then has
 *     no stack quantity at all.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getByPath, hasByPath, pathSegments, setByPath } from '../src/utils/objectPath.js';

describe('pathSegments', () => {
  it('rejects everything that is not a usable dotted path', () => {
    for (const bad of [undefined, null, '', '   ', 42, {}, []]) {
      assert.deepEqual(pathSegments(bad), [], `expected [] for ${JSON.stringify(bad)}`);
    }
  });

  it('splits and trims a usable path', () => {
    assert.deepEqual(pathSegments('system.quantity'), ['system', 'quantity']);
    assert.deepEqual(pathSegments('  system.stack.count '), ['system', 'stack', 'count']);
  });
});

describe('getByPath', () => {
  it('walks a nested path and returns undefined for any missing segment', () => {
    const target = { system: { stack: { count: 7 } } };
    assert.equal(getByPath(target, 'system.stack.count'), 7);
    assert.equal(getByPath(target, 'system.stack'), target.system.stack);
    assert.equal(getByPath(target, 'system.missing.count'), undefined);
    assert.equal(getByPath(target, 'missing'), undefined);
  });

  it('does not traverse THROUGH a non-object, matching foundry.utils.getProperty', () => {
    // A naive `value?.[key]` reducer resolves `'abc'.length` here and reports 3.
    assert.equal(getByPath({ system: { qty: 'abc' } }, 'system.qty.length'), undefined);
  });

  it('prefers a LITERAL dotted own key, so a flattened update payload reads correctly', () => {
    assert.equal(getByPath({ 'system.qtd': 19 }, 'system.qtd'), 19);
    // A single-segment path never takes the literal branch, so nothing changes there.
    assert.equal(getByPath({ qty: 4 }, 'qty'), 4);
  });

  it('returns undefined rather than throwing for junk inputs', () => {
    for (const target of [undefined, null, 3, 'text']) {
      assert.equal(getByPath(target, 'system.quantity'), undefined);
    }
    assert.equal(getByPath({ system: {} }, ''), undefined);
  });
});

describe('hasByPath', () => {
  it('reports PRESENCE, including a key explicitly holding undefined', () => {
    assert.equal(hasByPath({ flags: { fabricate: { runs: undefined } } }, 'flags.fabricate.runs'), true);
    assert.equal(hasByPath({ flags: { fabricate: {} } }, 'flags.fabricate.runs'), false);
  });

  it('is false for junk targets and unusable paths', () => {
    assert.equal(hasByPath(null, 'a.b'), false);
    assert.equal(hasByPath({ a: 1 }, ''), false);
    assert.equal(hasByPath({ a: 1 }, undefined), false);
  });
});

describe('setByPath', () => {
  it('CREATES intermediate objects for a >= 3-segment path', () => {
    const itemData = { name: 'Plank', system: {} };
    setByPath(itemData, 'system.stack.count', 20);
    assert.deepEqual(itemData.system, { stack: { count: 20 } });
  });

  it('preserves sibling keys when writing a leaf', () => {
    const itemData = { system: { qtd: { value: 1, max: 99 } } };
    setByPath(itemData, 'system.qtd.value', 19);
    assert.deepEqual(itemData.system.qtd, { value: 19, max: 99 });
  });

  it('replaces a non-object sitting mid-path rather than throwing', () => {
    const itemData = { system: { qtd: 5 } };
    setByPath(itemData, 'system.qtd.value', 19);
    assert.deepEqual(itemData.system.qtd, { value: 19 });
  });

  it('is a no-op for junk targets and unusable paths', () => {
    assert.equal(setByPath(null, 'a.b', 1), null);
    const target = { a: 1 };
    assert.deepEqual(setByPath(target, '', 2), { a: 1 });
  });
});
