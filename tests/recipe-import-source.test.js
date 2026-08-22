/**
 * Tests for the durable `Recipe.importSource` provenance field (issue 775):
 * normalization (malformed → null), toJSON/fromJSON round-trip, and the
 * hand-authored default of null (the structural never-prune guard).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

let idSeq = 0;
globalThis.foundry = {
  utils: { randomID: () => `rid-${++idSeq}` }
};
globalThis.game = { user: { name: 'GM' } };

const { Recipe } = await import('../src/models/Recipe.js');

test('#775: a default-constructed (hand-authored) recipe has importSource === null', () => {
  const recipe = new Recipe({ name: 'Hand Authored' });
  assert.equal(recipe.importSource, null);
});

test('#775/#1087: toJSON OMITS importSource for a hand-authored recipe, and absence rebuilds null', () => {
  // Issue 775 made the key unconditional so the never-prune guard could not be lost to a
  // dropped `toJSON` line; issue 1087 made it conditional again, because `null` was being
  // written into every recipe in every world write to say what absence already says. The
  // guard is unchanged — what matters is that the RECONSTRUCTED value is null, which is the
  // structural absence of provenance the prune reads.
  const json = new Recipe({ name: 'Hand Authored' }).toJSON();
  assert.ok(!('importSource' in json), 'a null provenance is not written');
  assert.equal(Recipe.fromJSON(json).importSource, null, 'and absence rebuilds as null');
});

test('#775: importSource round-trips through toJSON / fromJSON', () => {
  const recipe = new Recipe({ name: 'Imported', importSource: { systemId: 'sys-pack', importedAt: 1234 } });
  assert.deepEqual(recipe.importSource, { systemId: 'sys-pack', importedAt: 1234 });

  const json = recipe.toJSON();
  assert.deepEqual(json.importSource, { systemId: 'sys-pack', importedAt: 1234 });

  const restored = Recipe.fromJSON(json);
  assert.deepEqual(restored.importSource, { systemId: 'sys-pack', importedAt: 1234 });
});

test('#775 Q7: a malformed importSource normalizes to null', () => {
  const cases = [
    ['a bare string', 'sys-pack'],
    ['a number', 42],
    ['an object missing systemId', { importedAt: 10 }],
    ['a blank systemId', { systemId: '   ', importedAt: 10 }],
    ['a non-string systemId', { systemId: 123, importedAt: 10 }],
    ['an array', []]
  ];
  for (const [label, value] of cases) {
    assert.equal(new Recipe({ name: 'r', importSource: value }).importSource, null, label);
  }
});

test('#775 Q7: a valid systemId with an absent/invalid importedAt coerces importedAt to 0, and trims systemId', () => {
  assert.deepEqual(
    new Recipe({ name: 'r', importSource: { systemId: 'sys' } }).importSource,
    { systemId: 'sys', importedAt: 0 }
  );
  assert.deepEqual(
    new Recipe({ name: 'r', importSource: { systemId: 'sys', importedAt: 'nope' } }).importSource,
    { systemId: 'sys', importedAt: 0 }
  );
  assert.deepEqual(
    new Recipe({ name: 'r', importSource: { systemId: '  sys  ', importedAt: 5 } }).importSource,
    { systemId: 'sys', importedAt: 5 }
  );
});
