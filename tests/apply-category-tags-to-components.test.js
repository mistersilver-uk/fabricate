/**
 * Issue 771 — the shared set-apply primitive
 * `CraftingSystemManager.applyCategoryAndTagsToComponents`, which folder-aware import
 * categorization (this issue) and multi-select bulk edit (#772) both build on.
 *
 * Category is single-valued (OVERWRITE); tags are additive (UNION, case-insensitive,
 * stored lowercase); the write lands in ONE save().
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
const { GENERAL_COMPONENT_CATEGORY } = await import('../src/utils/componentCategories.js');

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
      items: [
        { id: 'c1', name: 'Iron Ore', category: 'general', tags: [] },
        { id: 'c2', name: 'Sage', category: 'general', tags: ['herb'] },
        { id: 'c3', name: 'Copper Ore', category: 'Metal', tags: ['metal'] },
      ],
    },
  ]);
}

test('applies a single-valued category by OVERWRITING it across the set', async () => {
  const manager = seededManager();
  const result = await manager.applyCategoryAndTagsToComponents('sys1', ['c1', 'c3'], {
    category: 'Reagent',
  });
  assert.equal(result.updated, 2);
  assert.deepEqual(result.componentIds.sort(), ['c1', 'c3']);
  const components = manager.getSystem('sys1').components;
  assert.equal(components.find((c) => c.id === 'c1').category, 'Reagent');
  assert.equal(components.find((c) => c.id === 'c3').category, 'Reagent', 'overwrites Metal');
  // An untargeted component is untouched.
  assert.equal(components.find((c) => c.id === 'c2').category, 'general');
});

test('unions tags additively, de-duplicating case-insensitively and storing lowercase', async () => {
  const manager = seededManager();
  await manager.applyCategoryAndTagsToComponents('sys1', ['c2'], { addTags: ['Herb', 'RARE'] });
  const c2 = manager.getSystem('sys1').components.find((c) => c.id === 'c2');
  // 'herb' already present (case-insensitive), 'rare' added lowercased; no duplicate 'herb'.
  assert.deepEqual(c2.tags, ['herb', 'rare']);
});

test('applies category AND tags together in a single save()', async () => {
  const manager = seededManager();
  const before = manager.saveCount;
  const result = await manager.applyCategoryAndTagsToComponents('sys1', ['c1', 'c2'], {
    category: 'Reagent',
    addTags: ['rare'],
  });
  assert.equal(result.updated, 2);
  assert.equal(manager.saveCount - before, 1, 'exactly one persist for the whole set');
  const components = manager.getSystem('sys1').components;
  assert.equal(components.find((c) => c.id === 'c1').category, 'Reagent');
  assert.deepEqual(components.find((c) => c.id === 'c1').tags, ['rare']);
  assert.equal(components.find((c) => c.id === 'c2').category, 'Reagent');
  assert.deepEqual(components.find((c) => c.id === 'c2').tags, ['herb', 'rare']);
});

test('an omitted/blank category leaves each component category untouched (tags-only apply)', async () => {
  const manager = seededManager();
  await manager.applyCategoryAndTagsToComponents('sys1', ['c3'], {
    category: '   ',
    addTags: ['rare'],
  });
  const c3 = manager.getSystem('sys1').components.find((c) => c.id === 'c3');
  assert.equal(c3.category, 'Metal', 'blank category is not applied');
  assert.deepEqual(c3.tags, ['metal', 'rare']);
});

test('a resolved no-op (no category, no tags) does not save', async () => {
  const manager = seededManager();
  const before = manager.saveCount;
  const result = await manager.applyCategoryAndTagsToComponents('sys1', ['c1'], {
    addTags: ['   ', ''],
  });
  assert.equal(result.updated, 0);
  assert.deepEqual(result.componentIds, []);
  assert.equal(manager.saveCount, before, 'no persist when nothing resolves to apply');
});

test('an empty id set is a no-op', async () => {
  const manager = seededManager();
  const before = manager.saveCount;
  const result = await manager.applyCategoryAndTagsToComponents('sys1', [], { category: 'Reagent' });
  assert.equal(result.updated, 0);
  assert.equal(manager.saveCount, before);
});

test('unknown ids are ignored; only real components in the set change', async () => {
  const manager = seededManager();
  const result = await manager.applyCategoryAndTagsToComponents('sys1', ['c1', 'does-not-exist'], {
    category: 'Reagent',
  });
  assert.deepEqual(result.componentIds, ['c1']);
});

test('removeTags strips tags case-insensitively, keeping the rest and counting only real losses', async () => {
  const manager = makeLoadedManager([
    {
      id: 'sys1',
      name: 'System One',
      componentCategories: ['Reagent', 'Metal'],
      itemTags: ['herb', 'rare'],
      items: [
        // authored VERBATIM mixed-case tag — a case-sensitive strip would miss it.
        { id: 'c1', name: 'Sage', category: 'general', tags: ['Herb', 'rare'] },
        { id: 'c2', name: 'Iron Ore', category: 'general', tags: ['metal'] },
      ],
    },
  ]);
  const before = manager.saveCount;
  const result = await manager.applyCategoryAndTagsToComponents('sys1', ['c1', 'c2'], {
    removeTags: ['HERB'],
  });
  // c1 loses its mixed-case 'Herb'; c2 never had it, so it is NOT a false "updated".
  assert.equal(result.updated, 1);
  assert.deepEqual(result.componentIds, ['c1']);
  assert.equal(manager.saveCount - before, 1, 'one save for the changed set');
  const components = manager.getSystem('sys1').components;
  assert.deepEqual(
    components.find((c) => c.id === 'c1').tags,
    ['rare'],
    'case-insensitive strip keeps the rest'
  );
  assert.deepEqual(components.find((c) => c.id === 'c2').tags, ['metal'], 'untouched component');
});

test('a removeTags-only apply still updates and saves (no-op-guard regression)', async () => {
  const manager = seededManager();
  const before = manager.saveCount;
  const result = await manager.applyCategoryAndTagsToComponents('sys1', ['c2'], {
    removeTags: ['herb'],
  });
  assert.equal(result.updated, 1, 'removeTags alone is not swallowed by the no-op guard');
  assert.equal(manager.saveCount - before, 1);
  assert.deepEqual(manager.getSystem('sys1').components.find((c) => c.id === 'c2').tags, []);
});

test('add + remove of the same tag is remove-wins', async () => {
  const manager = seededManager();
  await manager.applyCategoryAndTagsToComponents('sys1', ['c1'], {
    addTags: ['shiny'],
    removeTags: ['shiny'],
  });
  const c1 = manager.getSystem('sys1').components.find((c) => c.id === 'c1');
  assert.deepEqual(c1.tags, [], 'remove runs after add, so the tag is not present');
});

test('category + addTags + removeTags still land in exactly one save()', async () => {
  const manager = seededManager();
  const before = manager.saveCount;
  const result = await manager.applyCategoryAndTagsToComponents('sys1', ['c2', 'c3'], {
    category: 'Reagent',
    addTags: ['rare'],
    removeTags: ['herb'],
  });
  assert.equal(result.updated, 2);
  assert.equal(manager.saveCount - before, 1, 'one persist across all three axes');
  const components = manager.getSystem('sys1').components;
  const c2 = components.find((c) => c.id === 'c2');
  assert.equal(c2.category, 'Reagent');
  assert.deepEqual(c2.tags, ['rare'], "'herb' removed, 'rare' added");
  const c3 = components.find((c) => c.id === 'c3');
  assert.equal(c3.category, 'Reagent');
  assert.deepEqual(c3.tags, ['metal', 'rare'], 'c3 never had herb; rare added');
});

test('updated skips a component whose category already equals the applied one', async () => {
  const manager = seededManager();
  // c3 is already 'Metal'; setting 'Metal' again must not count or save it.
  const result = await manager.applyCategoryAndTagsToComponents('sys1', ['c1', 'c3'], {
    category: 'Metal',
  });
  assert.deepEqual(result.componentIds, ['c1'], 'only c1 actually changed category');
  assert.equal(result.updated, 1);
});

test('clear-to-general resets a categorized component but omit leaves it', async () => {
  const manager = seededManager();
  const cleared = await manager.applyCategoryAndTagsToComponents('sys1', ['c3'], {
    category: GENERAL_COMPONENT_CATEGORY,
  });
  assert.equal(cleared.updated, 1, 'Metal → general is a real change');
  assert.equal(manager.getSystem('sys1').components.find((c) => c.id === 'c3').category, 'general');

  // A component already in general is not re-cleared; and omitting category leaves it.
  const noop = await manager.applyCategoryAndTagsToComponents('sys1', ['c3'], {
    category: GENERAL_COMPONENT_CATEGORY,
  });
  assert.equal(noop.updated, 0, 'already general → no change');
});

test('requires a GM and a real system', async () => {
  const manager = seededManager();
  await assert.rejects(
    () => manager.applyCategoryAndTagsToComponents('missing', ['c1'], { category: 'Reagent' }),
    /Crafting system not found/
  );

  globalThis.game.user.isGM = false;
  try {
    await assert.rejects(
      () => manager.applyCategoryAndTagsToComponents('sys1', ['c1'], { category: 'Reagent' }),
      /GM/i
    );
  } finally {
    globalThis.game.user.isGM = true;
  }
});
