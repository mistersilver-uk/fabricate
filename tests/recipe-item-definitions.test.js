import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingSystemManager } from '../src/systems/CraftingSystemManager.js';
import { RecipeVisibilityService } from '../src/systems/RecipeVisibilityService.js';

let idCounter = 0;

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

globalThis.foundry = {
  utils: {
    getProperty,
    randomID: () => `id-${++idCounter}`,
  },
};

globalThis.game = {
  user: { isGM: true, name: 'Test GM' },
  actors: [],
  settings: {
    get: () => [],
    set: async () => {},
  },
};

globalThis.ui = {
  notifications: {
    info: () => {},
    warn: () => {},
    error: () => {},
  },
};

globalThis.fromUuid = async () => null;
globalThis.fromUuidSync = () => null;

test('_normalizeComponentDescription extracts plain text from Foundry-style description objects', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  assert.equal(
    manager._normalizeComponentDescription({ value: '<p>Fresh <strong>silverweed</strong>.</p>' }),
    'Fresh silverweed.'
  );
});

test('_normalizeComponentDescription does not stringify unknown objects', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  assert.equal(manager._normalizeComponentDescription({ unexpected: 'shape' }), '');
});

test('_normalizeComponentDescription NORMALIZES stored text and resolves nothing (issue 800)', () => {
  // The synchronous normalizer is reached from `_normalizeComponent` across nine call
  // sites and deliberately stays synchronous: resolution happens only at the async
  // ingestion boundaries.
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  // It NORMALIZES: markup is stripped and an unregistered LABELLED directive falls
  // back to its authored label (the post-resolution mop-up).
  assert.equal(
    manager._normalizeComponentDescription('<p><a class="content-link">Acid</a>, Oil</p>'),
    'Acid, Oil'
  );
  assert.equal(manager._normalizeComponentDescription('&Reference[prone]{Prone}'), 'Prone');

  // It does NOT resolve: a LABEL-LESS reference cannot become a document name here, so
  // it survives verbatim rather than being dropped (the rejected approach) or
  // half-fixed by a second, divergent grammar.
  const labelless = '@UUID[Compendium.dnd5e.equipment24.Item.componentpouch]';
  assert.equal(manager._normalizeComponentDescription(labelless), labelless);
});

// `_extractSourceDescription` is ASYNC since issue 800 — it awaits the `enrichToHtml`
// seam before normalizing. That signature change is the reason this suite legitimately
// changes; the CONSTRUCTOR change is the one that must be invisible to existing tests.
test('_extractSourceDescription skips object fallback text instead of returning object strings', async () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  assert.equal(
    await manager._extractSourceDescription({
      system: {
        description: {
          value: '<p>Dreamleaf petals.</p>',
        },
      },
    }),
    'Dreamleaf petals.'
  );
  assert.equal(
    await manager._extractSourceDescription({
      system: {
        description: {
          unexpected: '<p>Should not stringify the object.</p>',
        },
      },
    }),
    ''
  );
});

// ---------------------------------------------------------------------------
// System-wide recipe visibility strategy (issue 511) — caps moved off knowledge
// ---------------------------------------------------------------------------

test('_normalizeRecipeVisibility keeps only strategy fields (mode + dragDropEnabled); caps are gone', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  const normalized = manager._normalizeRecipeVisibility({
    listMode: 'knowledge',
    knowledge: {
      mode: 'itemOrLearned',
      item: { limitUses: true, maxUses: 2, destroyWhenExhausted: true },
      learn: { consumeOnLearn: false, dragDropEnabled: false, limitRecipes: true, maxRecipes: 2 },
    },
  });

  assert.equal(normalized.listMode, 'knowledge');
  assert.equal(normalized.knowledge.mode, 'itemOrLearned');
  assert.equal(normalized.knowledge.learn.dragDropEnabled, false);
  // The per-item caps no longer live on the system-wide config.
  assert.equal('item' in normalized.knowledge, false);
  assert.equal('consumeOnLearn' in normalized.knowledge.learn, false);
  assert.equal('limitRecipes' in normalized.knowledge.learn, false);
});

// ---------------------------------------------------------------------------
// Flat system-level visibility strategy enum (issue 511, PR-B)
// ---------------------------------------------------------------------------

test('_normalizeVisibilityMode passes through the four valid modes', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  for (const mode of ['global', 'restricted', 'item', 'knowledge']) {
    assert.equal(manager._normalizeVisibilityMode(mode), mode);
  }
});

test('_normalizeVisibilityMode defaults invalid/missing input to knowledge', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  for (const bad of [undefined, null, '', 'player', 'nonsense', 42, {}]) {
    assert.equal(manager._normalizeVisibilityMode(bad), 'knowledge');
  }
});

test('_normalizeSystem emits visibilityMode (default knowledge, valid pass-through)', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  assert.equal(manager._normalizeSystem({ id: 'sys-default' }).visibilityMode, 'knowledge');
  assert.equal(
    manager._normalizeSystem({ id: 'sys-item', visibilityMode: 'item' }).visibilityMode,
    'item'
  );
  assert.equal(
    manager._normalizeSystem({ id: 'sys-bad', visibilityMode: 'bogus' }).visibilityMode,
    'knowledge'
  );
});

// ---------------------------------------------------------------------------
// Per-recipe-item caps (issue 511) — model normalization
// ---------------------------------------------------------------------------

test('_normalizeRecipeItemDefinition seeds an uncapped caps block when none is authored', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  const def = manager._normalizeRecipeItemDefinition({
    id: 'recipe-item-1',
    name: 'Formula Book',
    originItemUuid: 'Compendium.world.formulas.book-1',
  });

  assert.deepEqual(def.caps, {
    item: {
      limitUses: false,
      maxUses: undefined,
      // Default whenSpent is 'destroyed'; the legacy boolean is kept in sync.
      destroyWhenExhausted: true,
      whenSpent: 'destroyed',
    },
    learn: {
      consumeOnLearn: true,
      limitRecipes: false,
      limitLearning: false,
      maxRecipes: undefined,
      learnsAllowed: undefined,
      learnScope: 'perInstance',
      learningMode: 'once',
      prerequisiteIds: [],
      characterPrerequisiteIds: [],
      destroyWhenSpent: false,
    },
  });
  // The definition defaults to enabled.
  assert.equal(def.enabled, true);
});

// ---------------------------------------------------------------------------
// Expanded recipe-item model (issue 511, PR-B) — enabled + whenSpent/learningMode
// ---------------------------------------------------------------------------

test('_normalizeRecipeItemDefinition round-trips enabled:false and defaults it to true', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  assert.equal(
    manager._normalizeRecipeItemDefinition({ id: 'a', originItemUuid: 'u' }).enabled,
    true
  );
  assert.equal(
    manager._normalizeRecipeItemDefinition({ id: 'b', originItemUuid: 'u', enabled: false })
      .enabled,
    false
  );
  assert.equal(
    manager._normalizeRecipeItemDefinition({ id: 'c', originItemUuid: 'u', enabled: true }).enabled,
    true
  );
});

test('_normalizeRecipeItemCaps derives whenSpent from legacy destroyWhenExhausted when unset', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  const destroyed = manager._normalizeRecipeItemCaps({ item: { destroyWhenExhausted: true } });
  assert.equal(destroyed.item.whenSpent, 'destroyed');
  assert.equal(destroyed.item.destroyWhenExhausted, true);

  const inert = manager._normalizeRecipeItemCaps({ item: { destroyWhenExhausted: false } });
  assert.equal(inert.item.whenSpent, 'inert');
  assert.equal(inert.item.destroyWhenExhausted, false);
});

test('_normalizeRecipeItemCaps lets an authored whenSpent win and syncs destroyWhenExhausted', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  // whenSpent wins even when the legacy boolean disagrees.
  const inert = manager._normalizeRecipeItemCaps({
    item: { whenSpent: 'inert', destroyWhenExhausted: true },
  });
  assert.equal(inert.item.whenSpent, 'inert');
  assert.equal(inert.item.destroyWhenExhausted, false);

  const destroyed = manager._normalizeRecipeItemCaps({
    item: { whenSpent: 'destroyed', destroyWhenExhausted: false },
  });
  assert.equal(destroyed.item.whenSpent, 'destroyed');
  assert.equal(destroyed.item.destroyWhenExhausted, true);
});

test('_normalizeRecipeItemCaps mirrors limitRecipes/maxRecipes to limitLearning/learnsAllowed', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  const legacy = manager._normalizeRecipeItemCaps({
    learn: { limitRecipes: true, maxRecipes: 4 },
  });
  assert.equal(legacy.learn.limitLearning, true);
  assert.equal(legacy.learn.learnsAllowed, 4);
  // Migrated from legacy: maxRecipes > 1 → 'ntimes'.
  assert.equal(legacy.learn.learningMode, 'ntimes');

  // The new fields win and are mirrored back onto the legacy names.
  const modern = manager._normalizeRecipeItemCaps({
    learn: { limitLearning: true, learnsAllowed: 2, learningMode: 'party' },
  });
  assert.equal(modern.learn.limitRecipes, true);
  assert.equal(modern.learn.maxRecipes, 2);
  assert.equal(modern.learn.limitLearning, true);
  assert.equal(modern.learn.learnsAllowed, 2);
  assert.equal(modern.learn.learningMode, 'party');
});

test('_normalizeRecipeItemCaps defaults learningMode once, prerequisiteIds empty, and clamps enum', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  const bare = manager._normalizeRecipeItemCaps({});
  assert.equal(bare.learn.learningMode, 'once');
  assert.deepEqual(bare.learn.prerequisiteIds, []);
  assert.equal(bare.learn.prerequisite, undefined, 'the legacy singular is not re-emitted');

  const bad = manager._normalizeRecipeItemCaps({ learn: { learningMode: 'nonsense' } });
  assert.equal(bad.learn.learningMode, 'once');
});

test('_normalizeRecipeItemCaps trims/dedupes prerequisiteIds and folds a legacy single prerequisite (issue 544)', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  // An array is trimmed, String-coerced, de-duplicated, and empties dropped.
  const many = manager._normalizeRecipeItemCaps({
    learn: { prerequisiteIds: ['  recipe-42  ', 'recipe-42', '', 'recipe-7'] },
  });
  assert.deepEqual(many.learn.prerequisiteIds, ['recipe-42', 'recipe-7']);

  // A legacy single `prerequisite` string is folded into the array (back-compat).
  const legacy = manager._normalizeRecipeItemCaps({ learn: { prerequisite: '  recipe-42  ' } });
  assert.deepEqual(legacy.learn.prerequisiteIds, ['recipe-42']);

  // The array wins when both the array and the legacy single are present.
  const both = manager._normalizeRecipeItemCaps({
    learn: { prerequisiteIds: ['recipe-9'], prerequisite: 'recipe-42' },
  });
  assert.deepEqual(both.learn.prerequisiteIds, ['recipe-9']);
});

test('_normalizeRecipeItemCaps derives learnScope (per-copy vs total) with legacy mode fallback', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const scope = (learn) => manager._normalizeRecipeItemCaps({ learn }).learn;

  // Default and legacy per-document modes → per-copy scope.
  assert.equal(scope({}).learnScope, 'perInstance');
  assert.equal(scope({ learningMode: 'once' }).learnScope, 'perInstance');
  assert.equal(scope({ learningMode: 'ntimes' }).learnScope, 'perInstance');
  // Legacy shared world pool → total scope.
  assert.equal(scope({ learningMode: 'party' }).learnScope, 'total');
  // An authored learnScope wins over the legacy mode; the legacy mirror follows it.
  const total = scope({ learnScope: 'total', limitLearning: true, learnsAllowed: 4 });
  assert.equal(total.learnScope, 'total');
  assert.equal(total.learningMode, 'party');
  const perCopy = scope({ learnScope: 'perInstance', limitLearning: true, learnsAllowed: 4 });
  assert.equal(perCopy.learnScope, 'perInstance');
  assert.equal(perCopy.learningMode, 'ntimes');
});

test('updateRecipeItemDefinition accepts an enabled patch alongside caps', async () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  manager.save = async () => {};
  manager.systems.set(
    'sys-1',
    manager._normalizeSystem({
      id: 'sys-1',
      name: 'Alchemy',
      recipeItemDefinitions: [{ id: 'book-1', originItemUuid: 'u' }],
    })
  );

  const result = await manager.updateRecipeItemDefinition('sys-1', 'book-1', {
    enabled: false,
    caps: { learn: { limitLearning: true, learnsAllowed: 3, learnScope: 'total' } },
  });

  assert.equal(result.item.enabled, false);
  assert.equal(result.item.caps.learn.learnScope, 'total');
  assert.equal(result.item.caps.learn.learnsAllowed, 3);
  // Legacy fields stay in sync for back-compat consumers.
  assert.equal(result.item.caps.learn.learningMode, 'party');
  assert.equal(result.item.caps.learn.limitRecipes, true);
  assert.equal(result.item.caps.learn.maxRecipes, 3);
});

test('_normalizeRecipeItemDefinition round-trips authored per-item caps', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  const def = manager._normalizeRecipeItemDefinition({
    id: 'recipe-item-1',
    name: 'Formula Book',
    originItemUuid: 'Compendium.world.formulas.book-1',
    caps: {
      item: { limitUses: true, maxUses: 3, destroyWhenExhausted: true },
      learn: {
        consumeOnLearn: false,
        limitRecipes: true,
        maxRecipes: 2,
        destroyWhenSpent: true,
      },
    },
  });

  assert.equal(def.caps.item.limitUses, true);
  assert.equal(def.caps.item.maxUses, 3);
  assert.equal(def.caps.item.destroyWhenExhausted, true);
  assert.equal(def.caps.learn.consumeOnLearn, false);
  assert.equal(def.caps.learn.limitRecipes, true);
  assert.equal(def.caps.learn.maxRecipes, 2);
  assert.equal(def.caps.learn.destroyWhenSpent, true);
});

test('_normalizeRecipeItemCaps clears the learn cap when off, defaults it to 1 when on with an invalid count', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  // Off ⇒ no cap value at all.
  const capOff = manager._normalizeRecipeItemCaps({
    learn: { limitRecipes: false, maxRecipes: 4 },
  });
  assert.equal(capOff.learn.maxRecipes, undefined);
  assert.equal(capOff.learn.learnsAllowed, undefined);

  // On with a non-positive/invalid count ⇒ default to 1 (the value the stepper shows);
  // a "0/undefined" cap is meaningless and would wrongly read as uncapped (issue 544).
  const nonPositive = manager._normalizeRecipeItemCaps({
    learn: { limitRecipes: true, maxRecipes: 0 },
  });
  assert.equal(nonPositive.learn.maxRecipes, 1);
  assert.equal(nonPositive.learn.learnsAllowed, 1);

  const enabled = manager._normalizeRecipeItemCaps({
    learn: { limitRecipes: true, maxRecipes: 4 },
  });
  assert.equal(enabled.learn.maxRecipes, 4);
});

test('_normalizeRecipeItemCaps defaults learnsAllowed to 1 when Limited learning is on but none is authored (issue 544)', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });

  const onNoCount = manager._normalizeRecipeItemCaps({ learn: { limitLearning: true } });
  assert.equal(onNoCount.learn.learnsAllowed, 1, 'a limit with no count defaults to 1');
  assert.equal(onNoCount.learn.maxRecipes, 1, 'the legacy mirror follows');

  const off = manager._normalizeRecipeItemCaps({ learn: { limitLearning: false } });
  assert.equal(off.learn.learnsAllowed, undefined, 'off leaves the count unset');
  assert.equal(off.learn.maxRecipes, undefined);
});

test('addRecipeItemFromUuid adds a recipe item definition without creating a component', async () => {
  globalThis.fromUuid = async (uuid) => ({
    documentName: 'Item',
    uuid,
    name: 'Formula Book',
    img: 'icons/svg/book.svg',
    system: {
      description: {
        value: '<p>Arcane instructions</p>',
      },
    },
  });

  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  manager.save = async () => {};
  manager.systems.set(
    'sys-1',
    manager._normalizeSystem({
      id: 'sys-1',
      name: 'Alchemy',
      components: [
        {
          id: 'component-1',
          name: 'Mandrake',
          img: 'icons/svg/item-bag.svg',
          description: '',
        },
      ],
    })
  );

  const result = await manager.addRecipeItemFromUuid('sys-1', 'Compendium.world.formulas.book-1');

  assert.equal(result.action, 'added');
  assert.equal(manager.getRecipeItemDefinitions('sys-1').length, 1);
  assert.equal(manager.getItems('sys-1').length, 1);
  assert.equal(manager.getItems('sys-1')[0].id, 'component-1');
  assert.equal(manager.getRecipeItemDefinitions('sys-1')[0].name, 'Formula Book');
});

test('migrateLegacyRecipeItems reuses one recipe item definition for shared legacy UUIDs', async () => {
  let systemsSaved = false;
  let recipesSaved = false;
  const recipes = [
    {
      id: 'recipe-1',
      name: 'Potion A',
      img: 'icons/svg/item-bag.svg',
      description: '',
      craftingSystemId: 'sys-1',
      recipeItemId: '',
      linkedRecipeItemUuid: 'Compendium.world.formulas.book-1',
      toJSON() {
        return { ...this };
      },
    },
    {
      id: 'recipe-2',
      name: 'Potion B',
      img: 'icons/svg/item-bag.svg',
      description: '',
      craftingSystemId: 'sys-1',
      recipeItemId: '',
      linkedRecipeItemUuid: 'Compendium.world.formulas.book-1',
      toJSON() {
        return { ...this };
      },
    },
  ];
  const recipeManager = {
    getRecipes: ({ craftingSystemId } = {}) =>
      craftingSystemId
        ? recipes.filter((recipe) => recipe.craftingSystemId === craftingSystemId)
        : recipes,
    save: async () => {
      recipesSaved = true;
    },
  };

  const manager = new CraftingSystemManager(recipeManager);
  manager.save = async () => {
    systemsSaved = true;
  };
  manager.systems.set(
    'sys-1',
    manager._normalizeSystem({
      id: 'sys-1',
      name: 'Alchemy',
    })
  );

  await manager._migrateLegacyRecipeItems();

  const definitions = manager.getRecipeItemDefinitions('sys-1');
  assert.equal(definitions.length, 1);
  assert.equal(recipes[0].recipeItemId, definitions[0].id);
  assert.equal(recipes[1].recipeItemId, definitions[0].id);
  assert.equal(systemsSaved, true);
  assert.equal(recipesSaved, true);
});

// Issue 978. A manager save persisted `containingDefinitions[0]` onto the recipe. Book
// membership lives on the definition, so for a recipe that IS a member through
// `recipeIds[]` the scalar is noise that arms the four legacy image resolvers (issue 887).
// The same un-gated pass that mints-and-stamps the alchemy cohort now clears it.
test('migrateLegacyRecipeItems clears a leaked recipeItemId but spares the alchemy cohort', async () => {
  let recipesSaved = false;
  const recipes = [
    {
      // Leaked: a book member through `recipeIds[]`, no standalone formula link.
      id: 'recipe-leaked',
      name: 'Kite Shield',
      img: 'icons/shield.webp',
      description: '',
      craftingSystemId: 'sys-1',
      recipeItemId: 'book-1',
      linkedRecipeItemUuid: '',
      toJSON() {
        return { ...this };
      },
    },
    {
      // The alchemy cohort: a standalone formula-item link the 1.13.0 migration
      // deliberately preserved, and which the mint-and-stamp half maintains.
      id: 'recipe-formula',
      name: 'Potion of Healing',
      img: 'icons/potion.webp',
      description: '',
      craftingSystemId: 'sys-1',
      recipeItemId: 'book-1',
      linkedRecipeItemUuid: 'Compendium.world.formulas.formula-1',
      toJSON() {
        return { ...this };
      },
    },
    {
      // Not a member of anything: nothing to reconcile against, so it is left alone.
      id: 'recipe-unlinked',
      name: 'Iron Sword',
      img: 'icons/sword.webp',
      description: '',
      craftingSystemId: 'sys-1',
      recipeItemId: 'book-1',
      linkedRecipeItemUuid: '',
      toJSON() {
        return { ...this };
      },
    },
  ];

  const recipeManager = {
    getRecipes: ({ craftingSystemId } = {}) =>
      craftingSystemId
        ? recipes.filter((recipe) => recipe.craftingSystemId === craftingSystemId)
        : recipes,
    save: async () => {
      recipesSaved = true;
    },
  };

  const manager = new CraftingSystemManager(recipeManager);
  manager.save = async () => {};
  manager.systems.set(
    'sys-1',
    manager._normalizeSystem({
      id: 'sys-1',
      name: 'Smithing',
      recipeItemDefinitions: [
        {
          id: 'book-1',
          name: 'Forgecraft Handbook',
          originItemUuid: 'Compendium.world.books.book-1',
          recipeIds: ['recipe-leaked', 'recipe-formula'],
        },
      ],
    })
  );

  await manager._migrateLegacyRecipeItems();

  assert.equal(recipes[0].recipeItemId, null, 'the leaked scalar is cleared for a book member');
  assert.equal(
    recipes[1].recipeItemId,
    'book-1',
    'a recipe retaining a standalone formula link keeps its scalar'
  );
  assert.equal(
    recipes[2].recipeItemId,
    'book-1',
    'a recipe that is a member of nothing is left untouched'
  );
  assert.equal(recipesSaved, true, 'the clear is persisted');

  // Idempotent: a cleared recipe carries no `linkedRecipeItemUuid`, so it is not a
  // re-stamp candidate and a second pass must not resurrect the scalar.
  recipesSaved = false;
  await manager._migrateLegacyRecipeItems();
  assert.equal(recipes[0].recipeItemId, null, 'a second pass leaves the cleared recipe cleared');
  assert.equal(recipesSaved, false, 'a converged pass persists nothing');
});

test('deleteRecipeItemDefinition removes the system recipe item and clears affected recipe references', async () => {
  let systemsSaved = false;
  let recipesSaved = false;
  const recipes = [
    {
      id: 'recipe-1',
      name: 'Potion A',
      craftingSystemId: 'sys-1',
      recipeItemId: 'recipe-item-1',
      linkedRecipeItemUuid: 'Compendium.world.formulas.book-1',
      toJSON() {
        return { ...this };
      },
    },
    {
      id: 'recipe-2',
      name: 'Potion B',
      craftingSystemId: 'sys-1',
      recipeItemId: '',
      linkedRecipeItemUuid: 'Compendium.world.formulas.book-1',
      toJSON() {
        return { ...this };
      },
    },
  ];

  const recipeManager = {
    getRecipes: ({ craftingSystemId } = {}) =>
      craftingSystemId
        ? recipes.filter((recipe) => recipe.craftingSystemId === craftingSystemId)
        : recipes,
    save: async () => {
      recipesSaved = true;
    },
  };

  const manager = new CraftingSystemManager(recipeManager);
  manager.save = async () => {
    systemsSaved = true;
  };
  manager.systems.set(
    'sys-1',
    manager._normalizeSystem({
      id: 'sys-1',
      name: 'Alchemy',
      recipeItemDefinitions: [
        {
          id: 'recipe-item-1',
          name: 'Formula Book',
          img: 'icons/svg/book.svg',
          originItemUuid: 'Compendium.world.formulas.book-1',
        },
      ],
    })
  );

  const result = await manager.deleteRecipeItemDefinition('sys-1', 'recipe-item-1');

  assert.equal(result.deleted, true);
  assert.deepEqual(
    result.affectedRecipes.map((recipe) => recipe.id),
    ['recipe-1', 'recipe-2']
  );
  assert.equal(manager.getRecipeItemDefinitions('sys-1').length, 0);
  assert.equal(recipes[0].recipeItemId, null);
  assert.equal(recipes[0].linkedRecipeItemUuid, null);
  assert.equal(recipes[1].recipeItemId, null);
  assert.equal(recipes[1].linkedRecipeItemUuid, null);
  assert.equal(systemsSaved, true);
  assert.equal(recipesSaved, true);
});

test('updateRecipeItemDefinition merges and normalizes a caps patch, persisting it', async () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  manager.save = async () => {};
  manager.systems.set(
    'sys-1',
    manager._normalizeSystem({
      id: 'sys-1',
      name: 'Alchemy',
      recipeItemDefinitions: [
        {
          id: 'book-1',
          name: 'Formula Book',
          originItemUuid: 'Compendium.world.formulas.book-1',
        },
      ],
    })
  );

  const result = await manager.updateRecipeItemDefinition('sys-1', 'book-1', {
    caps: { learn: { limitRecipes: true, maxRecipes: 3 } },
  });

  assert.equal(result.item.caps.learn.limitRecipes, true);
  assert.equal(result.item.caps.learn.maxRecipes, 3);
  const stored = manager.getRecipeItemDefinition('sys-1', 'book-1');
  assert.equal(stored.caps.learn.maxRecipes, 3);
  // The untouched item sub-block keeps its uncapped defaults.
  assert.equal(stored.caps.item.limitUses, false);
});

test('updateRecipeItemDefinition defaults an invalid maxRecipes to 1 while the limit is on (issue 544)', async () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  manager.save = async () => {};
  manager.systems.set(
    'sys-1',
    manager._normalizeSystem({
      id: 'sys-1',
      name: 'Alchemy',
      recipeItemDefinitions: [{ id: 'book-1', originItemUuid: 'u' }],
    })
  );

  const result = await manager.updateRecipeItemDefinition('sys-1', 'book-1', {
    caps: { learn: { limitRecipes: true, maxRecipes: 0 } },
  });

  // A limit-on book with an invalid count normalizes to the minimum cap of 1, never
  // an "uncapped" undefined that would hide the learn-all CTA.
  assert.equal(result.item.caps.learn.maxRecipes, 1);
  assert.equal(result.item.caps.learn.learnsAllowed, 1);
});

test('updateRecipeItemDefinition throws for a missing definition', async () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  manager.save = async () => {};
  manager.systems.set('sys-1', manager._normalizeSystem({ id: 'sys-1', name: 'A' }));

  await assert.rejects(() => manager.updateRecipeItemDefinition('sys-1', 'nope', { caps: {} }));
});

test('RecipeVisibilityService matches recipeItemId through the system recipe item definition', () => {
  const system = {
    id: 'sys-1',
    resolutionMode: 'simple',
    recipeVisibility: { listMode: 'knowledge', knowledge: { mode: 'item' } },
    recipeItemDefinitions: [
      {
        id: 'recipe-item-1',
        originItemUuid: 'Compendium.world.formulas.book-1',
      },
    ],
  };
  const service = new RecipeVisibilityService(
    { getRecipes: () => [] },
    {
      getSystem: (systemId) => (systemId === 'sys-1' ? system : null),
      getRecipeItemDefinition: (systemId, recipeItemId) =>
        systemId === 'sys-1'
          ? system.recipeItemDefinitions.find((def) => def.id === recipeItemId) || null
          : null,
    }
  );

  const recipe = {
    id: 'recipe-1',
    craftingSystemId: 'sys-1',
    recipeItemId: 'recipe-item-1',
  };
  const item = {
    uuid: 'Item.actor-owned-formula',
    flags: {
      core: {
        sourceId: 'Compendium.world.formulas.book-1',
      },
    },
  };

  assert.equal(service._isMatchingRecipeItem(recipe, item), true);
});

// `_migrateLegacyRecipeItems` runs from `initialize()` — BEFORE runStartupMaintenance's
// error isolation and before `ready` is set — and its two saves write the
// `craftingSystems` and `recipes` WORLD settings. On a player client that rejection
// escapes `initialize()`, so `initialized` never flips and every facade method throws
// through `_requireReady()` for the whole session (the issue-970 failure mode).

function legacyMigrationFixture() {
  const saves = { systems: 0, recipes: 0 };
  const recipes = [
    {
      id: 'recipe-1',
      name: 'Potion A',
      img: 'icons/svg/item-bag.svg',
      description: '',
      craftingSystemId: 'sys-1',
      recipeItemId: '',
      linkedRecipeItemUuid: 'Compendium.world.formulas.book-1',
      toJSON() {
        return { ...this };
      },
    },
  ];
  const recipeManager = {
    getRecipes: () => recipes,
    save: async () => {
      saves.recipes += 1;
    },
  };
  return { saves, recipes, recipeManager };
}

function migrationManager({ recipeManager, saves, isActiveGM }) {
  const manager = new CraftingSystemManager(recipeManager, { isActiveGM });
  manager.save = async () => {
    saves.systems += 1;
  };
  manager.systems.set('sys-1', manager._normalizeSystem({ id: 'sys-1', name: 'Alchemy' }));
  return manager;
}

test('the legacy recipe-item migration writes no world setting off the active GM', async () => {
  const { saves, recipes, recipeManager } = legacyMigrationFixture();
  const manager = migrationManager({ recipeManager, saves, isActiveGM: () => false });

  const result = await manager._migrateLegacyRecipeItems();

  assert.equal(result, false, 'reports no persistence rather than throwing');
  assert.equal(saves.systems, 0, 'craftingSystems world setting untouched');
  assert.equal(saves.recipes, 0, 'recipes world setting untouched');
  // The in-memory pass is deliberately NOT gated, so this client's own view stays
  // self-consistent for the session; the GM's write replicates the durable fix.
  assert.equal(manager.getRecipeItemDefinitions('sys-1').length, 1);
  assert.equal(recipes[0].recipeItemId, manager.getRecipeItemDefinitions('sys-1')[0].id);
});

test('the legacy recipe-item migration still persists on the active GM', async () => {
  const { saves, recipeManager } = legacyMigrationFixture();
  const manager = migrationManager({ recipeManager, saves, isActiveGM: () => true });

  assert.equal(await manager._migrateLegacyRecipeItems(), true);
  assert.equal(saves.systems, 1);
  assert.equal(saves.recipes, 1);
});

test('initialize completes on a player client instead of leaving the manager unready', async () => {
  const { saves, recipeManager } = legacyMigrationFixture();
  const manager = migrationManager({ recipeManager, saves, isActiveGM: () => false });
  manager.systems.clear();

  await manager.initialize();

  assert.equal(manager.initialized, true, 'ready is reached, so the facade works all session');
});
