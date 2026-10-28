/** `uniqueRowKeys`: a unique `{#each}` key per result row, whatever its ids (issue 2169). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { uniqueRowKeys } from '../src/ui/svelte/components/resultRows.js';

const keysOf = (...ids) => uniqueRowKeys(ids.map((id) => (id === undefined ? {} : { id })));

describe('uniqueRowKeys', () => {
  it('keys each result by its id when every id is unique', () => {
    assert.deepEqual(keysOf('a', 'b', 'c'), ['a', 'b', 'c']);
  });

  it('keys an id’s first occurrence by the id and each later one by a suffix', () => {
    assert.deepEqual(keysOf('dup', 'dup', 'other', 'dup'), ['dup', 'dup#1', 'other', 'dup#3']);
  });

  it('keys a result with no id by its index', () => {
    assert.deepEqual(keysOf(undefined, '', 'a'), [0, 1, 'a']);
  });

  it('never mints a suffix another result already uses as its id', () => {
    assert.deepEqual(keysOf('x', 'x', 'x#1'), ['x', 'x#2', 'x#1']);
    assert.deepEqual(keysOf('x', 'x#2', 'x', 'x'), ['x', 'x#2', 'x#3', 'x#4']);
  });

  it('returns as many distinct keys as there are results', () => {
    const keys = keysOf('x', 'x', 'x#1', 'x#2', 'x', undefined, 'x');
    assert.equal(new Set(keys).size, keys.length);
  });

  it('reads anything but an array as no results', () => {
    assert.deepEqual(uniqueRowKeys(undefined), []);
    assert.deepEqual(uniqueRowKeys({ id: 'a' }), []);
  });
});
