/**
 * Issue 651 — `allowPlayerResultReorder` on the Recipe and on Component.salvage.
 *
 * The GM-authored reorder permission, default TRUE, replacing the retired system-level
 * `craftingCheck.progressive.allowPlayerReorder`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

let idCounter = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `random-${++idCounter}`,
    getProperty: () => undefined,
  },
};
globalThis.game = {};

const { Recipe } = await import('../src/models/Recipe.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

function makeManager() {
  return new CraftingSystemManager({ getRecipes: () => [] });
}

// ---------------------------------------------------------------------------
// Recipe — constructor default
// ---------------------------------------------------------------------------

test('Recipe defaults allowPlayerResultReorder to true when the key is absent', () => {
  // The absent-key-reads-true property is exactly why migration 1.17.0 does not seed.
  assert.equal(new Recipe({ id: 'r1', name: 'Potion' }).allowPlayerResultReorder, true);
});

test('Recipe honours an explicit false (the enabled default-true idiom, not a truthiness coerce)', () => {
  assert.equal(
    new Recipe({ id: 'r1', name: 'Potion', allowPlayerResultReorder: false })
      .allowPlayerResultReorder,
    false
  );
  assert.equal(
    new Recipe({ id: 'r1', name: 'Potion', allowPlayerResultReorder: true })
      .allowPlayerResultReorder,
    true
  );
});

// ---------------------------------------------------------------------------
// Recipe — toJSON allowlist round-trip
// ---------------------------------------------------------------------------

test('Recipe.toJSON round-trips allowPlayerResultReorder: FALSE', () => {
  // MUST use a `false` fixture. `toJSON()` is an explicit allowlist and the only
  // export/import gate — an omitted line silently drops the field on every save and
  // export. A `true` fixture would round-trip GREEN through a dropped field, because
  // the constructor default re-supplies `true`. Only `false` can fail.
  // Mutation this test catches: delete the `allowPlayerResultReorder` line from toJSON().
  const original = new Recipe({ id: 'r1', name: 'Potion', allowPlayerResultReorder: false });

  const json = original.toJSON();
  assert.equal(json.allowPlayerResultReorder, false, 'toJSON must carry the field');

  const restored = new Recipe(json);
  assert.equal(restored.allowPlayerResultReorder, false, 'the false survives the round-trip');
});

test('Recipe.toJSON round-trips allowPlayerResultReorder: true', () => {
  const json = new Recipe({ id: 'r1', name: 'Potion', allowPlayerResultReorder: true }).toJSON();
  assert.equal(json.allowPlayerResultReorder, true);
  assert.equal(new Recipe(json).allowPlayerResultReorder, true);
});

test('Recipe.toJSON survives a JSON string round-trip (export/import shape)', () => {
  const original = new Recipe({ id: 'r1', name: 'Potion', allowPlayerResultReorder: false });
  const restored = new Recipe(JSON.parse(JSON.stringify(original.toJSON())));
  assert.equal(restored.allowPlayerResultReorder, false);
});

// ---------------------------------------------------------------------------
// Component.salvage — both _normalizeSalvage return paths
// ---------------------------------------------------------------------------

test('_normalizeSalvage defaults allowPlayerResultReorder to true for a normal config', () => {
  const salvage = makeManager()._normalizeSalvage({ enabled: true });
  assert.equal(salvage.allowPlayerResultReorder, true);
});

test('_normalizeSalvage defaults allowPlayerResultReorder to true on the NON-OBJECT path', () => {
  // The early guard returns its own literal, so the default must be stated on BOTH
  // return paths. Mutation: remove the field from the non-object literal — a component
  // with no salvage config would then render the GM toggle off against a default-on spec.
  const mgr = makeManager();
  for (const input of [null, undefined, 'nope', 42, true]) {
    assert.equal(
      mgr._normalizeSalvage(input).allowPlayerResultReorder,
      true,
      `default-true for ${JSON.stringify(input) ?? 'undefined'}`
    );
  }
});

test('_normalizeSalvage honours an explicit false and re-normalizes it stably', () => {
  const mgr = makeManager();
  const once = mgr._normalizeSalvage({ enabled: true, allowPlayerResultReorder: false });
  assert.equal(once.allowPlayerResultReorder, false);
  // Salvage is structuredClone'd with no allowlist, so a re-normalize must not flip it back.
  assert.equal(mgr._normalizeSalvage(once).allowPlayerResultReorder, false);
});

test('_normalizeSalvage treats only an exact false as off (not falsy junk)', () => {
  const mgr = makeManager();
  for (const raw of [0, '', null, undefined]) {
    assert.equal(
      mgr._normalizeSalvage({ enabled: true, allowPlayerResultReorder: raw })
        .allowPlayerResultReorder,
      true,
      `${JSON.stringify(raw) ?? 'undefined'} is not an authored false`
    );
  }
});

test('a normalized component carries salvage.allowPlayerResultReorder through _normalizeSystem', () => {
  const system = makeManager()._normalizeSystem({
    id: 'sys-1',
    name: 'Sys',
    components: [
      { id: 'c-default', name: 'Default' },
      { id: 'c-off', name: 'Off', salvage: { enabled: true, allowPlayerResultReorder: false } },
    ],
  });
  assert.equal(system.components[0].salvage.allowPlayerResultReorder, true);
  assert.equal(system.components[1].salvage.allowPlayerResultReorder, false);
});
