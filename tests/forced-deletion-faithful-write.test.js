/** The shared faithful-write engine behind the merge-faithful actor doubles (issue 2051). */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FakeForcedDeletion,
  FakeForcedReplacement,
  applyFaithfulWrite,
} from './helpers/forcedDeletion.js';

const seeded = () => ({
  flags: { fabricate: { map: { a: { n: 1 }, b: { n: 2 } }, list: [1, 2, 3] } },
});

test('a plain write merges: a key the write omits survives', () => {
  const root = seeded();
  applyFaithfulWrite(root, 'flags.fabricate.map', { a: { n: 9 } });
  assert.deepEqual(root.flags.fabricate.map, { a: { n: 9 }, b: { n: 2 } });
});

test('a forced deletion removes only its own key, in both forms and when nested', () => {
  for (const [path, value] of [
    ['flags.fabricate.map.-=a', null],
    ['flags.fabricate.map.a', new FakeForcedDeletion()],
    ['flags.fabricate.map', { '-=a': null }],
    ['flags.fabricate.map', { a: new FakeForcedDeletion() }],
  ]) {
    const root = seeded();
    applyFaithfulWrite(root, path, value);
    assert.deepEqual(root.flags.fabricate.map, { b: { n: 2 } }, path);
    assert.deepEqual(root.flags.fabricate.list, [1, 2, 3], 'siblings are untouched');
  }
});

test('a forced replacement assigns wholesale, in both forms and when nested', () => {
  for (const [path, value] of [
    ['flags.fabricate.map.==a', { m: 1 }],
    ['flags.fabricate.map.a', FakeForcedReplacement.create({ m: 1 })],
    ['flags.fabricate.map', { '==a': { m: 1 } }],
    ['flags.fabricate.map', { a: FakeForcedReplacement.create({ m: 1 }) }],
  ]) {
    const root = seeded();
    applyFaithfulWrite(root, path, value);
    assert.deepEqual(root.flags.fabricate.map, { a: { m: 1 }, b: { n: 2 } }, path);
  }
});

test('a nested plain object merges recursively, leaving sibling keys intact', () => {
  const root = seeded();
  applyFaithfulWrite(root, 'flags.fabricate', { map: { a: { n: 9 } } });
  assert.deepEqual(root.flags.fabricate.map, { a: { n: 9 }, b: { n: 2 } });
  assert.deepEqual(root.flags.fabricate.list, [1, 2, 3]);
});

test('arrays and scalars replace, and written values are cloned rather than aliased', () => {
  const root = seeded();
  const written = { x: [7] };
  applyFaithfulWrite(root, 'flags.fabricate.list', [9]);
  applyFaithfulWrite(root, 'flags.fabricate.extra', written);
  written.x.push(8);
  assert.deepEqual(root.flags.fabricate.list, [9], 'an array is replaced, never merged index-wise');
  assert.deepEqual(root.flags.fabricate.extra, { x: [7] });
});

test('missing parents are created along the path', () => {
  const root = {};
  applyFaithfulWrite(root, 'flags.fabricate.deep.leaf', { k: 1 });
  assert.deepEqual(root, { flags: { fabricate: { deep: { leaf: { k: 1 } } } } });
});
