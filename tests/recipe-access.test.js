/**
 * Per-recipe access grants (Books & Scrolls `restricted` visibility mode).
 *
 * Covers Recipe._normalizeAccess:
 *   - default empty grant when no access / visibility is present;
 *   - read-forward: legacy `visibility.allowedUserIds` seeds `playerIds` when the
 *     access grant is absent or fully empty;
 *   - explicit access wins over read-forward (no seeding when a grant exists);
 *   - dedupe + ignore non-strings for both character and player id lists;
 *   - toJSON round-trips the normalized access snapshot as a fresh copy.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = {
  utils: {
    randomID: () => `id-${Math.random().toString(36).slice(2, 10)}`,
    getProperty: (obj, path) =>
      String(path)
        .split('.')
        .reduce((v, k) => (v == null ? undefined : v[k]), obj),
  },
};
globalThis.game = { user: { isGM: true }, fabricate: null };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

const { Recipe } = await import('../src/models/Recipe.js');

test('access defaults to empty character/player id lists', () => {
  const recipe = new Recipe({ name: 'Alloy Bronze' });
  assert.deepEqual(recipe.access, { characterIds: [], playerIds: [] });
});

test('access reads forward legacy visibility.allowedUserIds into playerIds', () => {
  const recipe = new Recipe({
    name: 'Refine Steel',
    visibility: { restricted: true, allowedUserIds: ['u1', 'u2'] },
  });
  assert.deepEqual(recipe.access, { characterIds: [], playerIds: ['u1', 'u2'] });
});

test('read-forward also fires when an access object is present but fully empty', () => {
  const recipe = new Recipe({
    name: 'Veil Powder',
    access: { characterIds: [], playerIds: [] },
    visibility: { allowedUserIds: ['u9'] },
  });
  assert.deepEqual(recipe.access, { characterIds: [], playerIds: ['u9'] });
});

test('explicit access grant wins over legacy allowedUserIds (no seeding)', () => {
  const recipe = new Recipe({
    name: 'Soul-Ash Bomb',
    access: { characterIds: ['akra'], playerIds: [] },
    visibility: { allowedUserIds: ['u1'] },
  });
  assert.deepEqual(recipe.access, { characterIds: ['akra'], playerIds: [] });
});

test('access dedupes and ignores non-string ids', () => {
  const recipe = new Recipe({
    name: 'Masterwork Alloy',
    access: {
      characterIds: ['akra', 'akra', ' brann ', '', 5, null, { id: 'x' }],
      playerIds: ['p1', 'p1', 2, undefined],
    },
  });
  assert.deepEqual(recipe.access, {
    characterIds: ['akra', 'brann'],
    playerIds: ['p1'],
  });
});

test('toJSON round-trips access as an independent copy', () => {
  const recipe = new Recipe({
    name: 'Temper a Blade',
    access: { characterIds: ['akra'], playerIds: ['p2'] },
  });
  const json = recipe.toJSON();
  assert.deepEqual(json.access, { characterIds: ['akra'], playerIds: ['p2'] });

  const restored = Recipe.fromJSON(json);
  assert.deepEqual(restored.access, { characterIds: ['akra'], playerIds: ['p2'] });

  // Mutating the serialized copy must not mutate the model's grant.
  json.access.characterIds.push('mira');
  assert.deepEqual(recipe.access.characterIds, ['akra']);
});
