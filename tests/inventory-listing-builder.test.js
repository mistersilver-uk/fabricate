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

  it('resolves tool usage via the system Tool library componentId', () => {
    const { listing } = ownAll();
    assert.deepEqual(rowByComponent(listing, 'c3').usedBy, [
      { recipeId: 'r1', recipeName: 'Iron Blade', recipeImg: 'icons/blade.webp', role: 'tool' },
    ]);
  });

  it('records essence usage on the essence row', () => {
    const { listing } = ownAll();
    const fire = listing.rows.find((row) => row.isEssenceSource && row.componentId === 'fire');
    assert.equal(fire.usedBy.length, 1);
    assert.equal(fire.usedBy[0].recipeId, 'r1');
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
});
