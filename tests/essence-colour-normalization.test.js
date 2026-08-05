/**
 * Issue 917 — `EssenceDefinition.colorToken` persistence.
 *
 * `_normalizeEssenceDefinition` has TWO branches (the legacy bare-string shorthand and
 * the object form) and BOTH are whitelist rebuilds that drop any key they do not name.
 * A field added to only one is lost on the next save, silently and only for the systems
 * that happen to take the other branch — so both are pinned here, plus the round-trip
 * through `updateSystem` a GM save actually performs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

let idCounter = 0;
globalThis.foundry = { utils: { randomID: () => `id-${++idCounter}`, getProperty } };
globalThis.game = { user: { isGM: true, id: 'gm' }, actors: [], fabricate: {} };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };
globalThis.fromUuid = async () => null;

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

function makeManager() {
  return new CraftingSystemManager({ getRecipes: () => [] });
}

function normalizeEssences(entries) {
  return makeManager()._normalizeEssenceDefinitions(entries);
}

test('the object branch persists an authored colour token', () => {
  const [definition] = normalizeEssences([
    { id: 'radiant', name: 'Radiant', icon: 'fas fa-sun', colorToken: 'butter' },
  ]);
  assert.equal(definition.colorToken, 'butter');
});

test('the object branch stores the token bare, stripping a --fab-tag- prefix', () => {
  // Stored bare so a round trip through an export/import cannot accumulate prefixes.
  const [definition] = normalizeEssences([{ id: 'radiant', colorToken: '--fab-tag-aqua' }]);
  assert.equal(definition.colorToken, 'aqua');
});

test('the object branch emits an explicit null for an unauthored colour', () => {
  // Explicit rather than absent: a surface can then read the field without having to
  // distinguish "not authored" from "this build predates the field".
  const [definition] = normalizeEssences([{ id: 'radiant', name: 'Radiant' }]);
  assert.equal(Object.hasOwn(definition, 'colorToken'), true);
  assert.equal(definition.colorToken, null);
});

test('the legacy bare-string branch also emits the field', () => {
  // The string shorthand cannot carry a colour, but the KEY must still be emitted:
  // both branches are whitelist rebuilds, and a definition reaching a surface without
  // the field is the silent-loss failure this test exists to prevent.
  const [definition] = normalizeEssences(['Radiant']);
  assert.equal(definition.name, 'Radiant');
  assert.equal(Object.hasOwn(definition, 'colorToken'), true);
  assert.equal(definition.colorToken, null);
});

test('an unrecognized token is retained rather than discarded', () => {
  // The palette is not validated at the persistence layer: an unrecognized token
  // renders as the theme accent, so a hand-edited or imported value degrades
  // gracefully instead of being thrown away on the next save.
  const [definition] = normalizeEssences([{ id: 'radiant', colorToken: 'chartreuse' }]);
  assert.equal(definition.colorToken, 'chartreuse');
});

test('there is no customColor sibling — the palette is the whole vocabulary', () => {
  // A free hex cannot be guaranteed legible against all seven themes, so unlike the
  // gathering biome colour this model deliberately has no custom-hex companion.
  const [definition] = normalizeEssences([
    { id: 'radiant', colorToken: 'rose', customColor: '#FF00FF' },
  ]);
  assert.equal(definition.colorToken, 'rose');
  assert.equal(Object.hasOwn(definition, 'customColor'), false);
});

test('an authored colour survives a save that does not mention it', async () => {
  // The end-to-end shape of the silent-loss bug: normalize, persist, re-normalize.
  const manager = makeManager();
  const stored = new Map();
  manager.saveSystems = async () => {};
  manager.systems = stored;

  const created = manager._normalizeSystem({
    id: 'sys-colour',
    name: 'Colour System',
    essenceDefinitions: [{ id: 'radiant', name: 'Radiant', colorToken: 'lavender' }],
  });
  stored.set(created.id, created);
  assert.equal(created.essenceDefinitions[0].colorToken, 'lavender');

  const resaved = manager._normalizeSystem({ ...created, name: 'Renamed System' });
  assert.equal(
    resaved.essenceDefinitions[0].colorToken,
    'lavender',
    'a later save that never mentions the colour must not drop it'
  );
});
