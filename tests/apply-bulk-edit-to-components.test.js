/**
 * The shared set-apply primitive `CraftingSystemManager.applyBulkEditToComponents`,
 * which folder-aware import categorization (#771) and multi-select bulk edit (#772)
 * both build on. Renamed from `applyCategoryAndTagsToComponents` in #772: the old name
 * enumerated two of the five axes and became false the moment it wrote essences.
 *
 * Category is single-valued (OVERWRITE); tags are additive (UNION, case-insensitive,
 * stored lowercase) with removals applied AFTER the union; essences REPLACE the whole
 * map; difficulty is the progressive DC. `essences` and `difficulty` are read by
 * PRESENCE, never truthiness — an empty map and a zero DC are both "clear this".
 * The write lands in ONE save().
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
globalThis.game = { user: { isGM: true } };

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

function makeManager() {
  return new CraftingSystemManager({ getRecipes: () => [] });
}

// A manager holding real, normalized systems with `save()` counted so the "one persist"
// guarantee is provable — the house pattern from component-category-normalization.test.js.
function makeLoadedManager(systems = []) {
  const manager = makeManager();
  for (const system of systems) {
    manager.systems.set(system.id, manager._normalizeSystem(system));
  }
  manager.initialized = true;
  manager.saveCount = 0;
  manager.save = async () => {
    manager.saveCount += 1;
  };
  return manager;
}

function seededManager() {
  return makeLoadedManager([
    {
      id: 'sys1',
      name: 'System One',
      componentCategories: ['Reagent', 'Metal'],
      itemTags: ['herb', 'rare'],
      essenceDefinitions: [
        { id: 'earth', name: 'Earth' },
        { id: 'fire', name: 'Fire' },
      ],
      items: [
        {
          id: 'c1',
          name: 'Iron Ore',
          category: 'general',
          tags: [],
          essences: { earth: 2 },
          difficulty: 7,
        },
        { id: 'c2', name: 'Sage', category: 'general', tags: ['herb'] },
        {
          id: 'c3',
          name: 'Copper Ore',
          category: 'Metal',
          tags: ['metal'],
          essences: { fire: 1 },
          difficulty: 3,
        },
      ],
    },
  ]);
}

function componentsOf(manager) {
  return manager.getSystem('sys1').components;
}

function componentById(manager, id) {
  return componentsOf(manager).find((c) => c.id === id);
}

test('applies a single-valued category by OVERWRITING it across the set', async () => {
  const manager = seededManager();
  const result = await manager.applyBulkEditToComponents('sys1', ['c1', 'c3'], {
    category: 'Reagent',
  });
  assert.equal(result.updated, 2);
  assert.deepEqual(result.componentIds.sort(), ['c1', 'c3']);
  assert.equal(componentById(manager, 'c1').category, 'Reagent');
  assert.equal(componentById(manager, 'c3').category, 'Reagent', 'overwrites Metal');
  // An untargeted component is untouched.
  assert.equal(componentById(manager, 'c2').category, 'general');
});

test('unions tags additively, de-duplicating case-insensitively and storing lowercase', async () => {
  const manager = seededManager();
  await manager.applyBulkEditToComponents('sys1', ['c2'], { addTags: ['Herb', 'RARE'] });
  const c2 = componentById(manager, 'c2');
  // 'herb' already present (case-insensitive), 'rare' added lowercased; no duplicate 'herb'.
  assert.deepEqual(c2.tags, ['herb', 'rare']);
});

test('applies category AND tags together in a single save()', async () => {
  const manager = seededManager();
  const before = manager.saveCount;
  const result = await manager.applyBulkEditToComponents('sys1', ['c1', 'c2'], {
    category: 'Reagent',
    addTags: ['rare'],
  });
  assert.equal(result.updated, 2);
  assert.equal(manager.saveCount - before, 1, 'exactly one persist for the whole set');
  assert.equal(componentById(manager, 'c1').category, 'Reagent');
  assert.deepEqual(componentById(manager, 'c1').tags, ['rare']);
  assert.equal(componentById(manager, 'c2').category, 'Reagent');
  assert.deepEqual(componentById(manager, 'c2').tags, ['herb', 'rare']);
});

test('an omitted/blank category leaves each component category untouched (tags-only apply)', async () => {
  const manager = seededManager();
  await manager.applyBulkEditToComponents('sys1', ['c3'], {
    category: '   ',
    addTags: ['rare'],
  });
  const c3 = componentById(manager, 'c3');
  assert.equal(c3.category, 'Metal', 'blank category is not applied');
  assert.deepEqual(c3.tags, ['metal', 'rare']);
});

test('a resolved no-op (no category, no tags, no essence/difficulty key) does not save', async () => {
  const manager = seededManager();
  const before = manager.saveCount;
  const result = await manager.applyBulkEditToComponents('sys1', ['c1'], {
    addTags: ['   ', ''],
    removeTags: [''],
  });
  assert.equal(result.updated, 0);
  assert.deepEqual(result.componentIds, []);
  assert.equal(manager.saveCount, before, 'no persist when nothing resolves to apply');
});

test('an empty id set is a no-op', async () => {
  const manager = seededManager();
  const before = manager.saveCount;
  const result = await manager.applyBulkEditToComponents('sys1', [], { category: 'Reagent' });
  assert.equal(result.updated, 0);
  assert.equal(manager.saveCount, before);
});

test('unknown ids are ignored; only real components in the set change', async () => {
  const manager = seededManager();
  const result = await manager.applyBulkEditToComponents('sys1', ['c1', 'does-not-exist'], {
    category: 'Reagent',
  });
  assert.deepEqual(result.componentIds, ['c1']);
});

test('requires a GM and a real system', async () => {
  const manager = seededManager();
  await assert.rejects(
    () => manager.applyBulkEditToComponents('missing', ['c1'], { category: 'Reagent' }),
    /Crafting system not found/
  );

  globalThis.game.user.isGM = false;
  try {
    await assert.rejects(
      () => manager.applyBulkEditToComponents('sys1', ['c1'], { category: 'Reagent' }),
      /GM/i
    );
  } finally {
    globalThis.game.user.isGM = true;
  }
});

test('removeTags subtracts case-insensitively and is applied AFTER addTags', async () => {
  const manager = seededManager();
  const result = await manager.applyBulkEditToComponents('sys1', ['c2', 'c3'], {
    addTags: ['rare'],
    // 'HERB' matches the stored lowercase tag; 'rare' collides with the addition and
    // loses, because removal runs after the union.
    removeTags: ['HERB', 'rare'],
  });
  assert.equal(result.updated, 2);
  assert.deepEqual(componentById(manager, 'c2').tags, [], 'herb removed, rare added then removed');
  assert.deepEqual(componentById(manager, 'c3').tags, ['metal'], 'untouched tags survive');
});

test('a removal-only call is a real edit, NOT a no-op', async () => {
  const manager = seededManager();
  const before = manager.saveCount;
  const result = await manager.applyBulkEditToComponents('sys1', ['c2'], {
    removeTags: ['herb'],
  });
  assert.equal(result.updated, 1, 'a removal-only apply writes');
  assert.deepEqual(result.componentIds, ['c2']);
  assert.equal(manager.saveCount - before, 1, 'and persists');
  assert.deepEqual(componentById(manager, 'c2').tags, []);
});

test('a supplied essences map REPLACES the whole map on every targeted component', async () => {
  const manager = seededManager();
  const result = await manager.applyBulkEditToComponents('sys1', ['c1', 'c3'], {
    essences: { fire: 3 },
  });
  assert.equal(result.updated, 2);
  assert.deepEqual(
    componentById(manager, 'c1').essences,
    { fire: 3 },
    'the pre-existing earth quantity is replaced, not merged'
  );
  assert.deepEqual(componentById(manager, 'c3').essences, { fire: 3 });
});

test('an empty essences map CLEARS essences (presence, not truthiness)', async () => {
  const manager = seededManager();
  const before = manager.saveCount;
  const result = await manager.applyBulkEditToComponents('sys1', ['c1'], { essences: {} });
  assert.equal(result.updated, 1, '{} is a real "clear essences" edit');
  assert.equal(manager.saveCount - before, 1);
  assert.deepEqual(componentById(manager, 'c1').essences, {});
});

test('a zero quantity clears that essence and an id outside the system definitions is rejected', async () => {
  const manager = seededManager();
  await manager.applyBulkEditToComponents('sys1', ['c1'], {
    essences: { earth: 0, fire: 2, 'not-an-essence': 5 },
  });
  assert.deepEqual(
    componentById(manager, 'c1').essences,
    { fire: 2 },
    'non-positive quantities and foreign essence ids never land'
  );
});

test('difficulty sets the progressive DC, and zero clears it', async () => {
  const manager = seededManager();
  const set = await manager.applyBulkEditToComponents('sys1', ['c1', 'c2'], { difficulty: 12 });
  assert.equal(set.updated, 2);
  assert.equal(componentById(manager, 'c1').difficulty, 12);
  assert.equal(componentById(manager, 'c2').difficulty, 12);

  const before = manager.saveCount;
  const cleared = await manager.applyBulkEditToComponents('sys1', ['c1'], { difficulty: 0 });
  assert.equal(cleared.updated, 1, 'a zero DC is a real "clear" edit, not a no-op');
  assert.equal(manager.saveCount - before, 1);
  assert.equal(componentById(manager, 'c1').difficulty, undefined);
});

test('an ABSENT essences/difficulty key leaves both values alone', async () => {
  const manager = seededManager();
  await manager.applyBulkEditToComponents('sys1', ['c1'], { category: 'Reagent' });
  const c1 = componentById(manager, 'c1');
  assert.equal(c1.category, 'Reagent');
  assert.deepEqual(c1.essences, { earth: 2 }, 'essences untouched when the key is absent');
  assert.equal(c1.difficulty, 7, 'difficulty untouched when the key is absent');
});

// ── The SALVAGE half of the re-normalization context ────────────────────────────────
// Each written component is re-normalized under `{ validEssenceIds, ...salvageContext }`.
// Only the essence half was pinned, so deleting `...salvageContext` left every test in
// this file green while silently changing salvage clamping on every bulk-written
// component — the write would stop enforcing the Simple-mode invariant that the
// single-component path enforces, and a bulk category edit would leave behind a config
// the engine awards a FAILURE group from.
//
// The raw salvage is poked on AFTER seeding on purpose: `_normalizeSystem` runs the very
// clamp under test, so a failure-first config declared in the fixture would already be
// clamped before the bulk write and the assertion would pass on the seed's work.
test('re-normalizes salvage under the owning system context, so a bulk write runs the Simple clamp', async () => {
  const manager = makeLoadedManager([
    {
      id: 'sys1',
      name: 'System One',
      componentCategories: ['Reagent'],
      salvageResolutionMode: 'simple',
      // No authored Simple salvage roll formula, so the reserved failure group is not
      // tolerated either — it is dropped rather than merely demoted to index 1.
      items: [{ id: 'c1', name: 'Iron Ore', category: 'general' }],
    },
  ]);
  const component = componentById(manager, 'c1');
  component.salvage = {
    enabled: true,
    ingredientQuantity: 1,
    resultGroups: [
      { id: 'g-fail', name: 'Ruined', role: 'failure', results: [] },
      { id: 'g-ok', name: 'Scrap', results: [] },
    ],
  };

  await manager.applyBulkEditToComponents('sys1', ['c1'], { category: 'Reagent' });

  const salvage = componentById(manager, 'c1').salvage;
  assert.equal(salvage.resultGroups.length, 1, 'the untolerated failure group is dropped');
  assert.equal(salvage.resultGroups[0].id, 'g-ok', 'and the success group lands at index 0');
  assert.equal(salvage.enabled, true, 'a surviving success group keeps salvage enabled');
});

test('every staged axis lands on every targeted component in ONE save()', async () => {
  const manager = seededManager();
  const before = manager.saveCount;
  const result = await manager.applyBulkEditToComponents('sys1', ['c1', 'c2', 'c3'], {
    category: 'Reagent',
    addTags: ['Rare'],
    removeTags: ['metal'],
    essences: { earth: 1 },
    difficulty: 4,
  });
  assert.equal(result.updated, 3);
  assert.equal(manager.saveCount - before, 1, 'one persist for the whole five-axis set');
  for (const component of componentsOf(manager)) {
    assert.equal(component.category, 'Reagent');
    assert.ok(component.tags.includes('rare'));
    assert.ok(!component.tags.includes('metal'));
    assert.deepEqual(component.essences, { earth: 1 });
    assert.equal(component.difficulty, 4);
  }
});
