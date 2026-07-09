import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { InventoryListingBuilder } from '../src/systems/InventoryListingBuilder.js';

// Components are matched to actor items by name fallback (no source flags in these
// fakes), so an item whose `name` equals a component's `name` is "owned".
function item(name, quantity) {
  return { name, system: quantity == null ? {} : { quantity } };
}

function actor(id, name, items, extra = {}) {
  return { id, name, img: `icons/${id}.webp`, items, ...extra };
}

function makeSystem(overrides = {}) {
  return {
    id: 'sys-1',
    name: 'Smithing',
    enableEssences: true,
    essenceDefinitions: [
      { id: 'fire', name: 'Fire', icon: 'fas fa-fire' },
      { id: 'earth', name: 'Earth', icon: 'fas fa-mountain' },
    ],
    components: [
      {
        id: 'c1',
        name: 'Iron',
        img: 'icons/iron.webp',
        tags: ['metal'],
        tier: 1,
        essences: { fire: 2 },
      },
      { id: 'c2', name: 'Coal', img: 'icons/coal.webp', tags: ['fuel'], essences: { fire: 1 } },
      { id: 'c3', name: 'Hammerhead', img: null, tags: [], essences: {} },
    ],
    tools: [{ id: 't1', componentId: 'c3' }],
    ...overrides,
  };
}

function makeBuilder({ systems, recipes = [] } = {}) {
  const systemList = systems ?? [makeSystem()];
  const getRecipesCalls = [];
  const recipeManager = {
    getRecipes: (filters) => {
      getRecipesCalls.push(filters);
      return recipes.filter(
        (r) =>
          filters?.craftingSystemId === undefined || r.craftingSystemId === filters.craftingSystemId
      );
    },
  };
  const craftingSystemManager = { getSystems: () => systemList };
  const builder = new InventoryListingBuilder({
    recipeManager,
    craftingSystemManager,
    localize: (key) => key,
    nowWorldTime: () => 1000,
  });
  return { builder, getRecipesCalls };
}

function rowByComponent(listing, componentId) {
  return (
    listing.rows.find((row) => row.componentId === componentId && !row.isEssenceSource) ?? null
  );
}

describe('InventoryListingBuilder — ownership aggregation', () => {
  it('projects worldTime, selected actor id, and source ids', () => {
    const { builder } = makeBuilder();
    const listing = builder.buildListing({
      craftingActor: actor('a1', 'Akra', [item('Iron', 2)]),
      componentSourceActors: [actor('a2', 'Camp Chest', [item('Iron', 3)])],
    });
    assert.equal(listing.worldTime, 1000);
    assert.equal(listing.selectedActorId, 'a1');
    assert.deepEqual(listing.sourceActorIds, ['a1', 'a2']);
  });

  it('excludes unowned components and sums owned quantity across sources', () => {
    const { builder } = makeBuilder();
    const listing = builder.buildListing({
      craftingActor: actor('a1', 'Akra', [item('Iron', 2)]),
      componentSourceActors: [actor('a2', 'Camp Chest', [item('Iron', 3), item('Coal', 5)])],
    });
    // c3 (Hammerhead) is owned by nobody, so it is absent.
    assert.equal(rowByComponent(listing, 'c3'), null);
    const iron = rowByComponent(listing, 'c1');
    assert.equal(iron.totalQuantity, 5);
    assert.equal(iron.sources.length, 2);
    assert.deepEqual(
      iron.sources.map((s) => [s.actorId, s.quantity]),
      [
        ['a1', 2],
        ['a2', 3],
      ]
    );
    // Source display order follows the actor order (crafting actor first).
    assert.equal(iron.sources[0].actorName, 'Akra');
    assert.equal(iron.sources[1].actorName, 'Camp Chest');
  });

  it('defaults a missing item quantity to 1', () => {
    const { builder } = makeBuilder();
    const listing = builder.buildListing({
      craftingActor: actor('a1', 'Akra', [item('Iron')]),
    });
    assert.equal(rowByComponent(listing, 'c1').totalQuantity, 1);
  });

  it('carries an absent component image through as null', () => {
    const { builder } = makeBuilder();
    const listing = builder.buildListing({
      craftingActor: actor('a1', 'Akra', [item('Hammerhead', 1)]),
    });
    assert.equal(rowByComponent(listing, 'c3').img, null);
  });

  it('reports component/essence/total counts', () => {
    const { builder } = makeBuilder();
    const listing = builder.buildListing({
      craftingActor: actor('a1', 'Akra', [item('Iron', 2), item('Coal', 1)]),
    });
    assert.equal(listing.counts.components, 2);
    // Both Iron and Coal carry Fire → one Fire essence row.
    assert.equal(listing.counts.essences, 1);
    assert.equal(listing.counts.total, 3);
  });
});

describe('InventoryListingBuilder — used-by index', () => {
  const recipe = {
    id: 'r1',
    name: 'Iron Blade',
    img: 'icons/blade.webp',
    craftingSystemId: 'sys-1',
    toolIds: [],
    ingredientSets: [
      {
        id: 's1',
        ingredientGroups: [
          { id: 'g1', options: [{ componentId: 'c1' }] },
          { id: 'g2', options: [{ match: { componentId: 'c2' } }] },
        ],
        toolIds: ['t1'],
        essences: { fire: 1 },
      },
      // c1 again in a second set — must be deduped to a single ingredient entry.
      { id: 's2', ingredientGroups: [{ id: 'g3', options: [{ componentId: 'c1' }] }] },
    ],
  };

  function ownAll() {
    const { builder, getRecipesCalls } = makeBuilder({ recipes: [recipe] });
    const listing = builder.buildListing({
      craftingActor: actor('a1', 'Akra', [item('Iron', 2), item('Coal', 1), item('Hammerhead', 1)]),
    });
    return { listing, getRecipesCalls };
  }

  it('resolves ingredient usage via option.componentId and option.match.componentId', () => {
    const { listing } = ownAll();
    assert.deepEqual(rowByComponent(listing, 'c1').usedBy, [
      {
        recipeId: 'r1',
        recipeName: 'Iron Blade',
        recipeImg: 'icons/blade.webp',
        role: 'ingredient',
      },
    ]);
    assert.equal(rowByComponent(listing, 'c2').usedBy[0].role, 'ingredient');
  });

  it('records tool usage under requiredFor (present but not consumed), not usedBy', () => {
    const { listing } = ownAll();
    assert.deepEqual(rowByComponent(listing, 'c3').requiredFor, [
      { kind: 'recipe', recipeId: 'r1', name: 'Iron Blade', img: 'icons/blade.webp' },
    ]);
    // A tool is never "used by" (consumed) — that list stays empty for a pure tool.
    assert.deepEqual(rowByComponent(listing, 'c3').usedBy, []);
  });

  it('records essence usage on the essence row', () => {
    const { listing } = ownAll();
    const fire = listing.rows.find((row) => row.isEssenceSource && row.componentId === 'fire');
    assert.equal(fire.usedBy.length, 1);
    assert.equal(fire.usedBy[0].recipeId, 'r1');
  });

  it('marks a component as used by a recipe that requires an essence it carries', () => {
    // A recipe that requires fire essence but never names Iron as an ingredient.
    const recipe = {
      id: 'r-ess',
      name: 'Fire Brew',
      img: 'icons/brew.webp',
      craftingSystemId: 'sys-1',
      toolIds: [],
      ingredientSets: [{ id: 's1', ingredientGroups: [], essences: { fire: 2 } }],
    };
    const { builder } = makeBuilder({ recipes: [recipe] });
    const listing = builder.buildListing({ craftingActor: actor('a1', 'Akra', [item('Iron', 1)]) });
    // Iron carries fire:2 → used by the fire-essence recipe (role: essence).
    assert.deepEqual(rowByComponent(listing, 'c1').usedBy, [
      { recipeId: 'r-ess', recipeName: 'Fire Brew', recipeImg: 'icons/brew.webp', role: 'essence' },
    ]);
  });

  it('does not duplicate a recipe that uses the component directly and via its essence', () => {
    const recipe = {
      id: 'r1',
      name: 'Dual Use',
      img: 'icons/dual.webp',
      craftingSystemId: 'sys-1',
      toolIds: [],
      ingredientSets: [
        {
          id: 's1',
          ingredientGroups: [{ id: 'g1', options: [{ componentId: 'c1' }] }],
          essences: { fire: 1 },
        },
      ],
    };
    const { builder } = makeBuilder({ recipes: [recipe] });
    const listing = builder.buildListing({ craftingActor: actor('a1', 'Akra', [item('Iron', 1)]) });
    const usedBy = rowByComponent(listing, 'c1').usedBy;
    assert.equal(usedBy.length, 1, 'the recipe appears once');
    assert.equal(usedBy[0].role, 'ingredient', 'direct ingredient usage wins over essence');
  });

  it('builds the used-by index once per system that has owned rows', () => {
    const { getRecipesCalls } = ownAll();
    assert.equal(getRecipesCalls.length, 1);
    assert.equal(getRecipesCalls[0].craftingSystemId, 'sys-1');
  });

  it('does not query recipes for a system with no owned components', () => {
    const empty = makeSystem({ id: 'sys-2', name: 'Empty', components: [] });
    const { builder, getRecipesCalls } = makeBuilder({
      systems: [makeSystem(), empty],
      recipes: [recipe],
    });
    builder.buildListing({ craftingActor: actor('a1', 'Akra', [item('Iron', 1)]) });
    // Only sys-1 (which owns Iron) is queried.
    assert.deepEqual(
      getRecipesCalls.map((f) => f.craftingSystemId),
      ['sys-1']
    );
  });

  it('leaves usedBy empty when no recipes reference the component', () => {
    const { builder } = makeBuilder({ recipes: [] });
    const listing = builder.buildListing({ craftingActor: actor('a1', 'Akra', [item('Iron', 1)]) });
    assert.deepEqual(rowByComponent(listing, 'c1').usedBy, []);
  });

  it('resolves the used-by recipe image from the linked recipe item (GM parity), not the raw recipe.img', () => {
    // A recipe whose icon lives on its linked recipe item: the raw recipe.img is a
    // generic bag, but the GM/crafting UI shows the linked item's image.
    const linkedRecipe = {
      id: 'r2',
      name: 'Smelt Iron Ingot',
      img: 'icons/svg/item-bag.svg',
      recipeItemId: 'ri-1',
      craftingSystemId: 'sys-1',
      toolIds: [],
      ingredientSets: [
        { id: 's1', ingredientGroups: [{ id: 'g1', options: [{ componentId: 'c1' }] }] },
      ],
    };
    const systemList = [makeSystem()];
    const recipeManager = { getRecipes: () => [linkedRecipe] };
    const craftingSystemManager = {
      getSystems: () => systemList,
      getRecipeItemDefinition: (systemId, itemId) =>
        systemId === 'sys-1' && itemId === 'ri-1'
          ? { img: 'icons/commodities/metal/ingot-iron.webp' }
          : null,
    };
    const builder = new InventoryListingBuilder({
      recipeManager,
      craftingSystemManager,
      localize: (key) => key,
      nowWorldTime: () => 1000,
    });
    const listing = builder.buildListing({
      craftingActor: actor('a1', 'Akra', [item('Iron', 1)]),
    });
    assert.equal(
      rowByComponent(listing, 'c1').usedBy[0].recipeImg,
      'icons/commodities/metal/ingot-iron.webp'
    );
  });

  it('resolves a book recipe image to the recipe’s own image, defaulting to the alchemical blueprint', () => {
    const { builder } = makeBuilder();
    const blueprint = 'icons/sundries/documents/blueprint-recipe-alchemical.webp';
    assert.equal(builder._resolveRecipeImg({ img: 'icons/blade.webp' }), 'icons/blade.webp');
    assert.equal(builder._resolveRecipeImg({ img: '' }), blueprint, 'empty img → blueprint, not a bag');
    assert.equal(builder._resolveRecipeImg({}), blueprint);
    // Foundry's generic item-bag default is treated as "no image" → blueprint.
    assert.equal(builder._resolveRecipeImg({ img: 'icons/svg/item-bag.svg' }), blueprint);
    assert.equal(builder._resolveRecipeImg({ img: '  icons/svg/item-bag.svg  ' }), blueprint);
  });

  it('hides undiscovered (teaser) recipes from a non-GM viewer’s used-by list', () => {
    const systemList = [makeSystem()];
    const recipeManager = { getRecipes: () => [recipe] };
    const craftingSystemManager = { getSystems: () => systemList };
    // Visibility service marks r1 a teaser → it must not appear in used-by.
    const recipeVisibility = {
      getVisibleRecipes: () => [{ recipe: { id: 'r1' }, access: { reason: 'teaser' } }],
    };
    const builder = new InventoryListingBuilder({
      recipeManager,
      craftingSystemManager,
      recipeVisibility,
      localize: (key) => key,
      nowWorldTime: () => 1000,
    });
    const listing = builder.buildListing({
      craftingActor: actor('a1', 'Akra', [item('Iron', 1)]),
      viewer: { isGM: false },
    });
    assert.deepEqual(rowByComponent(listing, 'c1').usedBy, []);
  });

  it('shows all recipes to a GM regardless of the visibility service', () => {
    const systemList = [makeSystem()];
    const recipeManager = { getRecipes: () => [recipe] };
    const craftingSystemManager = { getSystems: () => systemList };
    const recipeVisibility = {
      getVisibleRecipes: () => [{ recipe: { id: 'r1' }, access: { reason: 'teaser' } }],
    };
    const builder = new InventoryListingBuilder({
      recipeManager,
      craftingSystemManager,
      recipeVisibility,
      localize: (key) => key,
      nowWorldTime: () => 1000,
    });
    const listing = builder.buildListing({
      craftingActor: actor('a1', 'Akra', [item('Iron', 1)]),
      viewer: { isGM: true },
    });
    assert.equal(rowByComponent(listing, 'c1').usedBy[0].recipeId, 'r1');
  });
});

describe('InventoryListingBuilder — multi-system + essences', () => {
  it('dedupes rows by (systemId, componentId) with distinct keys', () => {
    // Two systems that reuse the same componentId string 'c1' for different items.
    const sysA = makeSystem({
      id: 'sysA',
      name: 'Alpha',
      components: [{ id: 'c1', name: 'Alpha Ore', essences: {} }],
      tools: [],
    });
    const sysB = makeSystem({
      id: 'sysB',
      name: 'Beta',
      components: [{ id: 'c1', name: 'Beta Ore', essences: {} }],
      tools: [],
    });
    const { builder } = makeBuilder({ systems: [sysA, sysB] });
    const listing = builder.buildListing({
      craftingActor: actor('a1', 'Akra', [item('Alpha Ore', 1), item('Beta Ore', 1)]),
    });
    const keys = listing.rows.map((r) => r.key).sort();
    assert.deepEqual(keys, ['sysA:c1', 'sysB:c1']);
    assert.equal(listing.rows.find((r) => r.systemId === 'sysA').name, 'Alpha Ore');
    assert.equal(listing.rows.find((r) => r.systemId === 'sysB').name, 'Beta Ore');
  });

  it('sums essence rows as perUnit content × owned quantity across sources', () => {
    const { builder } = makeBuilder();
    const listing = builder.buildListing({
      // Iron carries fire:2, Coal carries fire:1.
      craftingActor: actor('a1', 'Akra', [item('Iron', 3)]),
      componentSourceActors: [actor('a2', 'Chest', [item('Coal', 4)])],
    });
    const fire = listing.rows.find((r) => r.isEssenceSource && r.componentId === 'fire');
    // 3×2 (Iron/Akra) + 4×1 (Coal/Chest) = 10.
    assert.equal(fire.totalQuantity, 10);
    assert.equal(fire.icon, 'fas fa-fire');
    assert.deepEqual(
      fire.sources.map((s) => [s.actorId, s.quantity]),
      [
        ['a1', 6],
        ['a2', 4],
      ]
    );
  });

  it('lists a component’s essence content on its row', () => {
    const { builder } = makeBuilder();
    const listing = builder.buildListing({ craftingActor: actor('a1', 'Akra', [item('Iron', 1)]) });
    assert.deepEqual(rowByComponent(listing, 'c1').essences, [
      { id: 'fire', name: 'Fire', icon: 'fas fa-fire', quantity: 2 },
    ]);
  });

  it('suppresses essence rows and content when the system has essences disabled', () => {
    const { builder } = makeBuilder({ systems: [makeSystem({ enableEssences: false })] });
    const listing = builder.buildListing({ craftingActor: actor('a1', 'Akra', [item('Iron', 2)]) });
    assert.equal(
      listing.rows.every((r) => !r.isEssenceSource),
      true
    );
    assert.equal(listing.counts.essences, 0);
    assert.deepEqual(rowByComponent(listing, 'c1').essences, []);
  });

  it('lists an essence row’s contributing components with their contribution', () => {
    const { builder } = makeBuilder();
    const listing = builder.buildListing({
      craftingActor: actor('a1', 'Akra', [item('Iron', 3), item('Coal', 2)]),
    });
    const fire = listing.rows.find((r) => r.isEssenceSource && r.componentId === 'fire');
    // Iron fire:2 ×3 = 6; Coal fire:1 ×2 = 2.
    assert.deepEqual(fire.contributors, [
      { componentId: 'c1', name: 'Iron', img: 'icons/iron.webp', quantity: 6 },
      { componentId: 'c2', name: 'Coal', img: 'icons/coal.webp', quantity: 2 },
    ]);
  });
});

describe('InventoryListingBuilder — tools + produced-by', () => {
  it('marks a component registered in the system tool library as a tool', () => {
    const { builder } = makeBuilder();
    const listing = builder.buildListing({
      craftingActor: actor('a1', 'Akra', [item('Hammerhead', 1), item('Iron', 1)]),
    });
    // c3 (Hammerhead) is the componentId of tool t1 in makeSystem.
    assert.equal(rowByComponent(listing, 'c3').isTool, true);
    assert.equal(rowByComponent(listing, 'c1').isTool, false);
  });

  it('lists producing recipes (kind: recipe) that output the component', () => {
    const recipe = {
      id: 'r1',
      name: 'Smelt Iron',
      img: 'icons/smelt.webp',
      craftingSystemId: 'sys-1',
      toolIds: [],
      ingredientSets: [],
      results: [{ componentId: 'c1', quantity: 1 }],
    };
    const { builder } = makeBuilder({ recipes: [recipe] });
    const listing = builder.buildListing({ craftingActor: actor('a1', 'Akra', [item('Iron', 1)]) });
    assert.deepEqual(rowByComponent(listing, 'c1').producedBy, [
      { kind: 'recipe', recipeId: 'r1', name: 'Smelt Iron', img: 'icons/smelt.webp' },
    ]);
  });

  it('lists a recipe result from an explicit step', () => {
    const recipe = {
      id: 'r1',
      name: 'Multi Smelt',
      img: 'icons/smelt.webp',
      craftingSystemId: 'sys-1',
      ingredientSets: [],
      steps: [{ id: 's1', resultGroups: [{ id: 'g1', results: [{ componentId: 'c1' }] }] }],
    };
    const { builder } = makeBuilder({ recipes: [recipe] });
    const listing = builder.buildListing({ craftingActor: actor('a1', 'Akra', [item('Iron', 1)]) });
    assert.equal(rowByComponent(listing, 'c1').producedBy[0].recipeId, 'r1');
  });

  it('lists salvage producers (kind: salvage) from a component whose salvage yields it', () => {
    const system = makeSystem({
      components: [
        { id: 'c1', name: 'Iron', img: 'icons/iron.webp', essences: {} },
        {
          id: 'c2',
          name: 'Scrap',
          img: 'icons/scrap.webp',
          essences: {},
          salvage: { enabled: true, resultGroups: [{ results: [{ componentId: 'c1' }] }] },
        },
      ],
      tools: [],
    });
    const { builder } = makeBuilder({ systems: [system] });
    const listing = builder.buildListing({ craftingActor: actor('a1', 'Akra', [item('Iron', 1)]) });
    assert.deepEqual(rowByComponent(listing, 'c1').producedBy, [
      { kind: 'salvage', recipeId: null, name: 'Scrap', img: 'icons/scrap.webp' },
    ]);
  });

  it('ignores salvage from a component whose salvage is disabled', () => {
    const system = makeSystem({
      components: [
        { id: 'c1', name: 'Iron', img: 'icons/iron.webp', essences: {} },
        {
          id: 'c2',
          name: 'Scrap',
          essences: {},
          salvage: { enabled: false, resultGroups: [{ results: [{ componentId: 'c1' }] }] },
        },
      ],
      tools: [],
    });
    const { builder } = makeBuilder({ systems: [system] });
    const listing = builder.buildListing({ craftingActor: actor('a1', 'Akra', [item('Iron', 1)]) });
    assert.deepEqual(rowByComponent(listing, 'c1').producedBy, []);
  });

  it('lists gathering producers (kind: gathering) from an injected task drop', () => {
    const system = makeSystem();
    const builder = new InventoryListingBuilder({
      recipeManager: { getRecipes: () => [] },
      craftingSystemManager: { getSystems: () => [system] },
      localize: (key) => key,
      nowWorldTime: () => 1,
      getGatheringTasksForSystem: (systemId) =>
        systemId === 'sys-1'
          ? [
              {
                id: 'task-1',
                name: 'Mine Ore',
                img: 'icons/pick.webp',
                dropRows: [
                  { componentId: 'c1', enabled: true },
                  { componentId: 'c2', enabled: false },
                ],
              },
            ]
          : [],
    });
    const listing = builder.buildListing({
      craftingActor: actor('a1', 'Akra', [item('Iron', 1), item('Coal', 1)]),
    });
    assert.deepEqual(rowByComponent(listing, 'c1').producedBy, [
      { kind: 'gathering', recipeId: null, name: 'Mine Ore', img: 'icons/pick.webp' },
    ]);
    // A disabled drop row does not count.
    assert.deepEqual(rowByComponent(listing, 'c2').producedBy, []);
  });

  it('lists a gathering task under requiredFor when it needs the component as a tool', () => {
    // c3 (Hammerhead) is the componentId of tool t1 in makeSystem; a gathering task
    // requires t1 (via toolIds) and another task references a tool inline.
    const system = makeSystem();
    const builder = new InventoryListingBuilder({
      recipeManager: { getRecipes: () => [] },
      craftingSystemManager: { getSystems: () => [system] },
      localize: (key) => key,
      nowWorldTime: () => 1,
      getGatheringTasksForSystem: () => [
        { id: 'task-mine', name: 'Mine Ore', img: 'icons/pick.webp', toolIds: ['t1'] },
        { id: 'task-dig', name: 'Dig', img: 'icons/dig.webp', tools: [{ componentId: 'c3' }] },
        { id: 'task-off', name: 'Disabled', enabled: false, toolIds: ['t1'] },
      ],
    });
    const listing = builder.buildListing({
      craftingActor: actor('a1', 'Akra', [item('Hammerhead', 1)]),
    });
    assert.deepEqual(rowByComponent(listing, 'c3').requiredFor, [
      { kind: 'gathering', recipeId: null, name: 'Mine Ore', img: 'icons/pick.webp' },
      { kind: 'gathering', recipeId: null, name: 'Dig', img: 'icons/dig.webp' },
    ]);
  });

  it('excludes redacted (teaser) recipes from produced-by for a non-GM viewer', () => {
    const recipe = {
      id: 'r1',
      name: 'Smelt Iron',
      img: 'icons/smelt.webp',
      craftingSystemId: 'sys-1',
      ingredientSets: [],
      results: [{ componentId: 'c1' }],
    };
    const builder = new InventoryListingBuilder({
      recipeManager: { getRecipes: () => [recipe] },
      craftingSystemManager: { getSystems: () => [makeSystem()] },
      recipeVisibility: {
        getVisibleRecipes: () => [{ recipe: { id: 'r1' }, access: { reason: 'teaser' } }],
      },
      localize: (key) => key,
      nowWorldTime: () => 1,
    });
    const listing = builder.buildListing({
      craftingActor: actor('a1', 'Akra', [item('Iron', 1)]),
      viewer: { isGM: false },
    });
    assert.deepEqual(rowByComponent(listing, 'c1').producedBy, []);
  });
});

describe('InventoryListingBuilder — recipe-item books', () => {
  // A recipe-item book document: matched by uuid or compendium source uuid, and
  // exposing the per-document use/learn counters through a fabricate getFlag.
  function bookItem(uuid, quantity, flags = {}) {
    return {
      uuid,
      _stats: { compendiumSource: uuid },
      system: quantity == null ? {} : { quantity },
      getFlag: (scope, key) => {
        if (scope !== 'fabricate') return undefined;
        const short = key.startsWith('fabricate.') ? key.slice('fabricate.'.length) : key;
        return flags[short];
      },
    };
  }

  function bookActor(id, name, items, learned = {}) {
    return {
      id,
      name,
      img: `icons/${id}.webp`,
      items,
      getFlag: (scope, key) => {
        if (scope !== 'fabricate') return undefined;
        const short = key.startsWith('fabricate.') ? key.slice('fabricate.'.length) : key;
        return short === 'learnedRecipes' ? learned : undefined;
      },
    };
  }

  function bookSystem({ knowledge, caps } = {}) {
    return {
      id: 'sys-b',
      name: 'Arcana',
      enableEssences: false,
      components: [],
      recipeItemDefinitions: [
        {
          id: 'def-1',
          name: 'Spellbook',
          img: 'icons/book.webp',
          description: 'A tome of spells.',
          sourceItemUuid: 'Item.book1',
          // Per-item caps (issue 511) — the canonical source the builder reads for the
          // book's use/learn limits + access badge.
          caps: caps ?? { item: {}, learn: {} },
        },
      ],
      recipeVisibility: {
        listMode: 'knowledge',
        knowledge: { mode: 'learned', item: {}, learn: {}, ...(knowledge ?? {}) },
      },
    };
  }

  const RECIPES = [
    { id: 'r1', name: 'Fireball', description: 'Boom.', img: 'icons/fb.webp', craftingSystemId: 'sys-b', recipeItemId: 'def-1' },
    { id: 'r2', name: 'Ice Lance', description: 'Chill.', img: 'icons/il.webp', craftingSystemId: 'sys-b', recipeItemId: 'def-1' },
  ];

  function bookBuilder({ system, recipes = RECIPES, recipeVisibility = null } = {}) {
    const systemList = [system ?? bookSystem()];
    const recipeManager = {
      getRecipes: (filters) =>
        recipes.filter(
          (r) =>
            filters?.craftingSystemId === undefined ||
            r.craftingSystemId === filters.craftingSystemId
        ),
    };
    const craftingSystemManager = {
      getSystems: () => systemList,
      getRecipeItemDefinition: (sysId, defId) =>
        (systemList.find((s) => s.id === sysId)?.recipeItemDefinitions ?? []).find(
          (d) => d.id === defId
        ) ?? null,
    };
    return new InventoryListingBuilder({
      recipeManager,
      craftingSystemManager,
      recipeVisibility,
      localize: (key) => key,
      nowWorldTime: () => 0,
    });
  }

  function bookRow(listing) {
    return listing.rows.find((row) => row.isRecipeItem === true) ?? null;
  }

  it('flags a book’s recipes learnBlocked when the reader fails its character prerequisites (issue 544)', () => {
    const EXPERT = { id: 'p-expert', name: 'Expert Crafter', path: 'skills.cra.rank', op: 'gte', value: 2 };
    const system = {
      ...bookSystem({ caps: { item: {}, learn: { characterPrerequisiteIds: ['p-expert'] } } }),
      characterPrerequisites: [EXPERT],
    };
    const actorWithRollData = (rank) => ({
      ...bookActor('a1', 'Akra', [bookItem('Item.book1', 1)]),
      getRollData: () => ({ skills: { cra: { rank } } }),
    });

    const blocked = bookBuilder({ system }).buildListing({
      craftingActor: actorWithRollData(1),
      viewer: { isGM: false },
    });
    const blockedRecipes = bookRow(blocked).recipes;
    assert.ok(blockedRecipes.every((r) => r.learnBlocked === true), 'all recipes blocked');
    assert.equal(blockedRecipes[0].learnBlockedReason, 'Expert Crafter');

    const passing = bookBuilder({ system }).buildListing({
      craftingActor: actorWithRollData(3),
      viewer: { isGM: false },
    });
    assert.ok(bookRow(passing).recipes.every((r) => r.learnBlocked === false), 'passing reader unblocked');
  });

  it('classifies book learn/craft from the flat visibilityMode (item→craft, knowledge→learn, global/restricted→no rows)', () => {
    // The 1.12.0 migration stamps `visibilityMode` on every system, so the flat branch —
    // not the legacy listMode — is the primary runtime path.
    const rowFor = (visibilityMode) =>
      bookRow(
        bookBuilder({ system: { ...bookSystem(), visibilityMode } }).buildListing({
          craftingActor: bookActor('a1', 'Akra', [bookItem('Item.book1', 1)]),
          viewer: { isGM: false },
        })
      );

    const item = rowFor('item');
    assert.ok(item, 'item mode still projects a book row');
    assert.equal(item.learnable, false, 'item mode is not learnable');
    assert.equal(item.craftable, true, 'item mode grants craft-by-holding');

    const knowledge = rowFor('knowledge');
    assert.equal(knowledge.learnable, true, 'knowledge mode is learnable');
    assert.equal(knowledge.craftable, false, 'knowledge mode learns, does not craft-by-holding');

    assert.equal(rowFor('global'), null, 'global mode projects no book rows');
    assert.equal(rowFor('restricted'), null, 'restricted mode projects no book rows');
  });

  it('projects an owned book as a learnable row with its linked recipes and learned flags', () => {
    const builder = bookBuilder();
    const listing = builder.buildListing({
      craftingActor: bookActor('a1', 'Akra', [bookItem('Item.book1', 1)], { r1: { learnedAt: 1 } }),
      viewer: { isGM: false },
    });
    const row = bookRow(listing);
    assert.ok(row, 'a book row is projected');
    assert.equal(row.recipeItemId, 'def-1');
    assert.equal(row.name, 'Spellbook');
    assert.equal(row.description, 'A tome of spells.');
    assert.equal(row.totalQuantity, 1);
    assert.deepEqual(
      row.recipes.map((r) => [r.id, r.learned]),
      [
        ['r1', true],
        ['r2', false],
      ]
    );
    assert.equal(listing.counts.recipeItems, 1);
    // Books are counted apart from components.
    assert.equal(listing.counts.components, 0);
    assert.equal(row.learnable, true, 'a learned-mode book is learnable');
  });

  it('matches a book duplicated from a world template via _stats.duplicateSource', () => {
    // A world item dragged onto an actor carries the link to the template only in
    // _stats.duplicateSource — its own uuid and compendium source do not match the
    // definition. The book must still resolve (source-uuid-only matching misses it).
    const copy = {
      uuid: 'Actor.a1.Item.copy',
      _stats: { duplicateSource: 'Item.book1' },
      system: {},
      getFlag: () => undefined,
    };
    const listing = bookBuilder().buildListing({
      craftingActor: bookActor('a1', 'Akra', [copy]),
      viewer: { isGM: false },
    });
    assert.ok(bookRow(listing), 'the world-duplicated book is matched by duplicateSource');
  });

  it('does not project book rows outside a knowledge list mode', () => {
    const system = bookSystem();
    system.recipeVisibility.listMode = 'player';
    const listing = bookBuilder({ system }).buildListing({
      craftingActor: bookActor('a1', 'Akra', [bookItem('Item.book1', 1)]),
    });
    assert.equal(bookRow(listing), null);
  });

  it('projects an item-only book as a non-learnable row and suppresses its learning limit', () => {
    // Even with a learn cap configured, an item-only book must not show a learning
    // limit — it grants access by being held, not by learning.
    const system = bookSystem({
      knowledge: { mode: 'item' },
      caps: { item: { limitUses: true, maxUses: 3 }, learn: { limitRecipes: true, maxRecipes: 2 } },
    });
    const book = bookItem('Item.book1', 1, { recipeItemUsage: { timesUsed: 1 } });
    const listing = bookBuilder({ system }).buildListing({
      craftingActor: bookActor('a1', 'Akra', [book]),
    });
    const row = bookRow(listing);
    assert.ok(row, 'an item-only book still appears in the inventory');
    assert.equal(row.learnable, false, 'an item-only book offers no Learn affordance');
    assert.equal(row.limits.learning, null, 'no learning limit for an item-only book');
    assert.deepEqual(row.limits.uses, { max: 3, used: 1, remaining: 2 }, 'the craft-use limit still shows');
    assert.deepEqual(
      row.recipes.map((r) => r.id),
      ['r1', 'r2'],
      'it still lists the recipes it grants access to'
    );
  });

  it('omits a book the player does not own', () => {
    const listing = bookBuilder().buildListing({
      craftingActor: bookActor('a1', 'Akra', [item('Iron', 2)]),
    });
    assert.equal(bookRow(listing), null);
  });

  it('reports both learning and use limits for an item-or-learned book', () => {
    // Item-or-learned grants access both ways, so both limits are meaningful.
    const system = bookSystem({
      knowledge: { mode: 'itemOrLearned' },
      caps: { item: { limitUses: true, maxUses: 3 }, learn: { limitRecipes: true, maxRecipes: 2 } },
    });
    const book = bookItem('Item.book1', 1, {
      recipeItemLearning: { learnedCount: 1 },
      recipeItemUsage: { timesUsed: 2 },
    });
    const listing = bookBuilder({ system }).buildListing({
      craftingActor: bookActor('a1', 'Akra', [book]),
    });
    const row = bookRow(listing);
    assert.deepEqual(row.limits.learning, { max: 2, learned: 1, remaining: 1 });
    assert.deepEqual(row.limits.uses, { max: 3, used: 2, remaining: 1 });
  });

  it('suppresses the craft-use limit for a learn-only (learned) book', () => {
    const system = bookSystem({
      knowledge: { mode: 'learned' },
      caps: { item: { limitUses: true, maxUses: 3 }, learn: { limitRecipes: true, maxRecipes: 2 } },
    });
    const book = bookItem('Item.book1', 1, {
      recipeItemLearning: { learnedCount: 1 },
      recipeItemUsage: { timesUsed: 2 },
    });
    const listing = bookBuilder({ system }).buildListing({
      craftingActor: bookActor('a1', 'Akra', [book]),
    });
    const row = bookRow(listing);
    assert.deepEqual(row.limits.learning, { max: 2, learned: 1, remaining: 1 });
    assert.equal(row.limits.uses, null, 'a learn-only book is never used to craft');
  });

  it('treats an enabled-but-invalid cap as uncapped (no learning limit)', () => {
    const system = bookSystem({
      knowledge: { mode: 'learned' },
      caps: { item: {}, learn: { limitRecipes: true, maxRecipes: 0 } },
    });
    const listing = bookBuilder({ system }).buildListing({
      craftingActor: bookActor('a1', 'Akra', [bookItem('Item.book1', 1)]),
    });
    assert.equal(bookRow(listing).limits.learning, null);
  });

  it('hides an undiscovered (teaser) recipe from a non-GM book row', () => {
    const recipeVisibility = {
      getVisibleRecipes: () => [
        { recipe: { id: 'r1' }, access: { reason: 'knowledge' } },
        { recipe: { id: 'r2' }, access: { reason: 'teaser' } },
      ],
    };
    const listing = bookBuilder({ recipeVisibility }).buildListing({
      craftingActor: bookActor('a1', 'Akra', [bookItem('Item.book1', 1)]),
      viewer: { isGM: false },
    });
    assert.deepEqual(
      bookRow(listing).recipes.map((r) => r.id),
      ['r1'],
      'the teaser recipe r2 is not named on the book'
    );
  });
});
