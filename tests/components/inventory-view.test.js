import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// The player Inventory tab tree. Its raw `.js` deps (foundryBridge +
// craftingImageDefaults) are the same ones the Crafting tree already uses, so no
// new raw module is needed — only the inventory `.svelte` components (plus the
// shared Pagination + CraftingThumb they reuse) are compiled.
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-inventory-view-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/craftingImageDefaults.js',
  ],
  compiledModules: [
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/apps/crafting/CraftingThumb.svelte',
    'src/ui/svelte/apps/inventory/InventoryItemCard.svelte',
    'src/ui/svelte/apps/inventory/InventoryFilters.svelte',
    'src/ui/svelte/apps/inventory/InventoryGrid.svelte',
    'src/ui/svelte/apps/inventory/InventoryDetail.svelte',
    'src/ui/svelte/apps/inventory/InventoryView.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/inventory/InventoryView.svelte',
});

function makeItem() {
  return {
    key: 'sys:c1',
    componentId: 'c1',
    name: 'Mordant Gland',
    img: 'icons/gland.webp',
    icon: null,
    tags: ['Beast', 'Mordant'],
    tier: 1,
    isEssenceSource: false,
    isTool: true,
    totalQuantity: 7,
    sources: [
      { actorId: 'a1', actorName: 'Akra', actorImg: null, quantity: 2 },
      { actorId: 'a2', actorName: 'Camp Chest', actorImg: null, quantity: 5 },
    ],
    essences: [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire', quantity: 2 }],
    usedBy: [
      { recipeId: 'r1', recipeName: "Alchemist's Crucible", recipeImg: null, role: 'ingredient' },
    ],
    requiredFor: [{ kind: 'recipe', recipeId: 'r3', name: 'Carve Bone Idol', img: null }],
    producedBy: [
      { kind: 'recipe', recipeId: 'r2', name: 'Distil Gland', img: null },
      { kind: 'gathering', recipeId: null, name: 'Harvest Beast', img: null },
    ],
    contributors: [],
  };
}

function makeEssenceItem() {
  return {
    key: 'sys:fire',
    componentId: 'fire',
    name: 'Fire',
    img: null,
    icon: 'fas fa-fire',
    tags: [],
    tier: null,
    isEssenceSource: true,
    isTool: false,
    totalQuantity: 6,
    sources: [{ actorId: 'a1', actorName: 'Akra', actorImg: null, quantity: 6 }],
    essences: [],
    usedBy: [],
    producedBy: [],
    contributors: [{ componentId: 'c1', name: 'Iron', img: 'icons/iron.webp', quantity: 6 }],
  };
}

// A plain (non-reactive) store stand-in: this is a render + interaction smoke
// test, so a POJO exposing the getters InventoryView reads is sufficient. The
// real store's derivations are unit-tested separately.
function makeServices(item) {
  const calls = { navigate: [] };
  const store = {
    rows: [item],
    loading: false,
    loadedOnce: true,
    error: null,
    hasActor: true,
    search: '',
    filter: 'all',
    sort: 'name',
    filterCounts: { all: 1, components: 1, essences: 0, tools: 1 },
    page: 0,
    pageSize: 25,
    visibleItems: [item],
    pageItems: [item],
    selectedItem: item,
    select() {},
    setSearch() {},
    setFilter() {},
    setSort() {},
    setPage() {},
    setPageSize() {},
    load() {},
    tickWorldTime() {},
  };
  const services = {
    inventory: store,
    craftingSources: { load() {}, setCraftingActor() {}, selectedSourceIds: [] },
    actorBar: { selectedActorId: 'a1' },
    setSelectedCraftingActorId() {},
    navigateToCraftingRecipe: (id) => calls.navigate.push(id),
  };
  return { services, calls, store };
}

async function settle() {
  flushSync();
  await tick();
  await tick();
  flushSync();
}

describe('InventoryView (mounted)', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('renders the populated layout with an item card and the selected item detail', async () => {
    const { services } = makeServices(makeItem());
    const target = await harness.mount({ services });
    await settle();

    assert.ok(
      target.querySelector('[data-inventory-state="populated"]'),
      'renders the populated layout'
    );
    assert.ok(target.querySelector('[data-inventory-card="sys:c1"]'), 'renders the item card');

    const detail = target.querySelector('[data-inventory-detail="sys:c1"]');
    assert.ok(detail, 'renders the selected item detail');
    assert.match(detail.textContent, /Mordant Gland/, 'detail shows the item name');
    assert.match(detail.textContent, /Akra/, 'detail lists a source actor');
    assert.match(detail.textContent, /Alchemist's Crucible/, 'detail lists the using recipe');
    // Produced By section lists the producing recipe + gathering task.
    assert.match(detail.textContent, /Distil Gland/, 'detail lists a producing recipe');
    assert.match(detail.textContent, /Harvest Beast/, 'detail lists a producing gathering task');
    // Required For section (the item is a tool) lists the tool recipe.
    assert.ok(detail.querySelector('[data-inventory-section="required"]'), 'shows Required for for a tool');
    assert.ok(
      detail.querySelector('[data-inventory-required-for="r3"]'),
      'renders the required-for recipe'
    );
    assert.match(detail.textContent, /Carve Bone Idol/, 'detail lists the tool recipe');
  });

  it('hides the Required for section for a non-tool component', async () => {
    const item = makeItem();
    item.isTool = false;
    item.requiredFor = [];
    const { services } = makeServices(item);
    const target = await harness.mount({ services });
    await settle();

    const detail = target.querySelector('[data-inventory-detail="sys:c1"]');
    assert.equal(
      detail.querySelector('[data-inventory-section="required"]'),
      null,
      'no Required for section for a non-tool component'
    );
    // Used By and Produced By still render.
    assert.ok(detail.querySelector('[data-inventory-used-by="r1"]'), 'still shows Used by');
  });

  it('shows essence and tool pips on a component card', async () => {
    const { services } = makeServices(makeItem());
    const target = await harness.mount({ services });
    await settle();

    const card = target.querySelector('[data-inventory-card="sys:c1"]');
    assert.ok(card.querySelector('[data-inventory-pip="essence"]'), 'renders an essence pip');
    assert.ok(card.querySelector('[data-inventory-pip="tool"]'), 'renders a tool pip');
  });

  it('shows contributing components when an essence is selected', async () => {
    const item = makeEssenceItem();
    const { services } = makeServices(item);
    const target = await harness.mount({ services });
    await settle();

    const detail = target.querySelector('[data-inventory-detail="sys:fire"]');
    assert.ok(detail, 'renders the essence detail');
    assert.ok(
      detail.querySelector('[data-inventory-contributor="c1"]'),
      'lists a contributing component'
    );
    assert.match(detail.textContent, /Iron/, 'names the contributing component');
    // An essence has no Produced By section.
    assert.equal(
      detail.querySelector('[data-inventory-produced-by]'),
      null,
      'essence has no produced-by'
    );
  });

  it('shows the empty state when the actor owns nothing', async () => {
    const { services, store } = makeServices(makeItem());
    store.rows = [];
    store.visibleItems = [];
    store.pageItems = [];
    store.selectedItem = null;
    const target = await harness.mount({ services });
    await settle();

    assert.ok(target.querySelector('[data-inventory-state="empty"]'), 'renders the empty state');
    assert.equal(
      target.querySelector('[data-inventory-state="populated"]'),
      null,
      'no populated grid'
    );
  });

  it('navigates to the Crafting tab when a used-by recipe is activated', async () => {
    const { services, calls } = makeServices(makeItem());
    const target = await harness.mount({ services });
    await settle();

    const usedBy = target.querySelector('[data-inventory-used-by="r1"]');
    assert.ok(usedBy, 'renders a clickable used-by recipe');
    usedBy.click();
    flushSync();
    assert.deepEqual(calls.navigate, ['r1'], 'clicking a used-by recipe navigates to that recipe');

    // A recipe producer is clickable and navigates too.
    const producedBy = target.querySelector('[data-inventory-produced-by="r2"]');
    assert.ok(producedBy, 'renders a clickable produced-by recipe');
    producedBy.click();
    flushSync();
    assert.deepEqual(calls.navigate, ['r1', 'r2'], 'clicking a produced-by recipe navigates to it');

    // A required-for (tool) recipe navigates too.
    target.querySelector('[data-inventory-required-for="r3"]').click();
    flushSync();
    assert.deepEqual(
      calls.navigate,
      ['r1', 'r2', 'r3'],
      'clicking a required-for recipe navigates to it'
    );
  });

  it('paginates a detail list at 6 with a working next control', async () => {
    const item = makeItem();
    // 8 using recipes → 2 pages of 6 + 2.
    item.usedBy = Array.from({ length: 8 }, (_, i) => ({
      recipeId: `u${i}`,
      recipeName: `Recipe ${i}`,
      recipeImg: null,
      role: 'ingredient',
    }));
    const { services } = makeServices(item);
    const target = await harness.mount({ services });
    await settle();

    const detail = target.querySelector('[data-inventory-detail="sys:c1"]');
    // Only the first 6 render; a pager appears for the used-by section.
    assert.equal(
      detail.querySelectorAll('[data-inventory-used-by]').length,
      6,
      'first page shows 6 rows'
    );
    const pager = detail.querySelector('[data-inventory-pager="used"]');
    assert.ok(pager, 'renders a pager for the used-by section');
    assert.ok(detail.querySelector('[data-inventory-used-by="u0"]'), 'shows the first-page rows');
    assert.equal(
      detail.querySelector('[data-inventory-used-by="u7"]'),
      null,
      'hides the second-page rows'
    );

    // Advance to the next page: the last 2 rows show.
    pager.querySelectorAll('.inventory-detail-pager-btn')[1].click();
    flushSync();
    assert.equal(
      detail.querySelectorAll('[data-inventory-used-by]').length,
      2,
      'second page shows the remaining 2 rows'
    );
    assert.ok(detail.querySelector('[data-inventory-used-by="u7"]'), 'shows the second-page rows');
  });
});

// Build a store whose selected item is a recipe-item "book", plus a learn()
// capture. Only the getters InventoryView/InventoryDetail read are provided.
function makeBookServices(book, { learningRecipeId = null } = {}) {
  const calls = { navigate: [], learn: [] };
  const store = {
    rows: [book],
    loading: false,
    loadedOnce: true,
    error: null,
    hasActor: true,
    search: '',
    filter: 'all',
    sort: 'name',
    filterCounts: { all: 1, components: 0, essences: 0, tools: 0, recipeItems: 1 },
    page: 0,
    pageSize: 25,
    visibleItems: [book],
    pageItems: [book],
    selectedItem: book,
    learningRecipeId,
    select() {},
    setSearch() {},
    setFilter() {},
    setSort() {},
    setPage() {},
    setPageSize() {},
    load() {},
    learn: (recipeId) => calls.learn.push(recipeId),
    tickWorldTime() {},
  };
  const services = {
    inventory: store,
    craftingSources: { load() {}, setCraftingActor() {}, selectedSourceIds: [] },
    actorBar: { selectedActorId: 'a1' },
    setSelectedCraftingActorId() {},
    navigateToCraftingRecipe: (id) => calls.navigate.push(id),
  };
  return { services, calls, store };
}

function makeBook(recipes, limits = { uses: null, learning: null }, learnable = true) {
  return {
    key: 'recipeitem:sys:def-1',
    recipeItemId: 'def-1',
    componentId: null,
    name: "Armorer's Handbook",
    img: 'icons/book.webp',
    icon: null,
    description: 'A worn manual of forge techniques.',
    tags: [],
    tier: null,
    isEssenceSource: false,
    isTool: false,
    isRecipeItem: true,
    learnable,
    totalQuantity: 1,
    sources: [{ actorId: 'a1', actorName: 'Akra', actorImg: null, quantity: 1 }],
    essences: [],
    usedBy: [],
    requiredFor: [],
    producedBy: [],
    contributors: [],
    recipes,
    limits,
  };
}

describe('InventoryView (mounted) — recipe-item books', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('renders a single-recipe book inline with its description and a Learn button', async () => {
    const book = makeBook([
      { id: 'r1', name: 'Forge Breastplate', description: 'A sturdy cuirass.', img: null, learned: false },
    ]);
    const { services, calls } = makeBookServices(book);
    const target = await harness.mount({ services });
    await settle();

    const detail = target.querySelector('[data-inventory-recipe-item]');
    // The recipe list is collapsed behind the "Read & learn" CTA — expand it.
    detail.querySelector('[data-inventory-read-learn]')?.click();
    await settle();
    assert.ok(detail, 'renders the book detail');
    assert.match(detail.textContent, /A worn manual of forge techniques\./, 'shows the book description');
    assert.match(detail.textContent, /Forge Breastplate/, 'shows the single recipe name');
    assert.match(detail.textContent, /A sturdy cuirass\./, 'shows the recipe description inline');
    // No accordion for a single recipe.
    assert.equal(detail.querySelector('[data-inventory-recipe-accordion]'), null, 'no accordion for one recipe');

    const learn = detail.querySelector('[data-inventory-learn="r1"]');
    assert.ok(learn, 'renders a Learn button');
    learn.click();
    await settle();
    assert.deepEqual(calls.learn, ['r1'], 'clicking Learn invokes store.learn with the recipe id');
  });

  it('collapses the recipe list behind a Read & learn CTA that expands it', async () => {
    const book = makeBook([
      { id: 'r1', name: 'Forge Breastplate', description: 'A cuirass.', img: null, learned: false },
    ]);
    const { services } = makeBookServices(book);
    const target = await harness.mount({ services });
    await settle();

    const detail = target.querySelector('[data-inventory-recipe-item]');
    const cta = detail.querySelector('[data-inventory-read-learn]');
    assert.ok(cta, 'renders the Read & learn CTA');
    // Collapsed by default — the recipe list is not rendered.
    assert.equal(detail.querySelector('[data-inventory-learn-recipe]'), null, 'recipe list collapsed by default');
    assert.equal(cta.getAttribute('aria-expanded'), 'false');

    cta.click();
    await settle();
    assert.ok(detail.querySelector('[data-inventory-learn-recipe="r1"]'), 'the CTA expands the recipe list');
    assert.equal(
      detail.querySelector('[data-inventory-read-learn]').getAttribute('aria-expanded'),
      'true'
    );
  });

  it('shows the learning budget and disables Learn when the budget is spent', async () => {
    const book = makeBook(
      [{ id: 'r1', name: 'Forge Breastplate', description: '', img: null, learned: false }],
      { uses: null, learning: { max: 2, learned: 2, remaining: 0 } }
    );
    const { services } = makeBookServices(book);
    const target = await harness.mount({ services });
    await settle();

    const detail = target.querySelector('[data-inventory-recipe-item]');
    // The recipe list is collapsed behind the "Read & learn" CTA — expand it.
    detail.querySelector('[data-inventory-read-learn]')?.click();
    await settle();
    // The harness localize mock does not interpolate; it emits `key:{data}`, so
    // assert the budget uses the "N remaining" (plural at 0) key carrying remaining=0.
    const budget = detail.querySelector('[data-inventory-learning-budget]').textContent;
    assert.match(budget, /LearningRemainingMany/, 'renders the pluralized remaining string at 0');
    assert.match(budget, /"remaining":0/, 'budget carries remaining = 0');
    assert.equal(
      detail.querySelector('[data-inventory-learn="r1"]').disabled,
      true,
      'Learn is disabled when the budget is spent'
    );
  });

  it('shows a Learned chip instead of a Learn button for an already-learned recipe', async () => {
    const book = makeBook([{ id: 'r1', name: 'Forge Breastplate', description: '', img: null, learned: true }]);
    const { services } = makeBookServices(book);
    const target = await harness.mount({ services });
    await settle();

    const detail = target.querySelector('[data-inventory-recipe-item]');
    // The recipe list is collapsed behind the "Read & learn" CTA — expand it.
    detail.querySelector('[data-inventory-read-learn]')?.click();
    await settle();
    assert.ok(detail.querySelector('[data-inventory-learned="r1"]'), 'renders a Learned chip');
    assert.equal(detail.querySelector('[data-inventory-learn="r1"]'), null, 'no Learn button when learned');
  });

  it('renders a multi-recipe book as a searchable accordion that expands to the description', async () => {
    const recipes = Array.from({ length: 8 }, (_, i) => ({
      id: `r${i + 1}`,
      name: `Recipe ${i + 1}`,
      description: `Description ${i + 1}`,
      img: null,
      learned: false,
    }));
    const { services } = makeBookServices(makeBook(recipes));
    const target = await harness.mount({ services });
    await settle();

    const detail = target.querySelector('[data-inventory-recipe-item]');
    // The recipe list is collapsed behind the "Read & learn" CTA — expand it.
    detail.querySelector('[data-inventory-read-learn]')?.click();
    await settle();
    const accordion = detail.querySelector('[data-inventory-recipe-accordion]');
    assert.ok(accordion, 'renders the accordion for multiple recipes');
    // Search appears once a book teaches more than the smallest page (6).
    assert.ok(detail.querySelector('[data-inventory-recipe-search]'), 'shows the recipe search over 6 recipes');
    // First page shows 6 of 8; the pager offers page-size 6/9/12.
    assert.equal(accordion.querySelectorAll('[data-inventory-learn-recipe]').length, 6, 'first page shows six recipes');
    assert.ok(detail.querySelector('[data-inventory-recipe-pager]'), 'renders the recipe pager');

    // The row description is collapsed until the header is toggled.
    assert.equal(detail.querySelector('[data-inventory-recipe-body="r1"]'), null, 'description collapsed by default');
    detail.querySelector('[data-inventory-learn-recipe="r1"] .inventory-detail-accordion-toggle').click();
    await settle();
    assert.match(
      detail.querySelector('[data-inventory-recipe-body="r1"]').textContent,
      /Description 1/,
      'expanding the row reveals the description'
    );
  });

  it('does not show the recipe search for a small multi-recipe book (<= 6)', async () => {
    const recipes = Array.from({ length: 3 }, (_, i) => ({
      id: `r${i + 1}`,
      name: `Recipe ${i + 1}`,
      description: '',
      img: null,
      learned: false,
    }));
    const { services } = makeBookServices(makeBook(recipes));
    const target = await harness.mount({ services });
    await settle();

    const detail = target.querySelector('[data-inventory-recipe-item]');
    // The recipe list is collapsed behind the "Read & learn" CTA — expand it.
    detail.querySelector('[data-inventory-read-learn]')?.click();
    await settle();
    assert.ok(detail.querySelector('[data-inventory-recipe-accordion]'), 'still an accordion');
    assert.equal(detail.querySelector('[data-inventory-recipe-search]'), null, 'no search for a small book');
  });

  it('lists an item-only (non-learnable) book without Learn controls', async () => {
    const recipes = [
      { id: 'r1', name: 'Forge Breastplate', description: 'A cuirass.', img: null, learned: false },
      { id: 'r2', name: 'Temper Longsword', description: '', img: null, learned: false },
    ];
    const { services } = makeBookServices(makeBook(recipes, { uses: null, learning: null }, false));
    const target = await harness.mount({ services });
    await settle();

    const detail = target.querySelector('[data-inventory-recipe-item]');
    // The recipe list is collapsed behind the "Read & learn" CTA — expand it.
    detail.querySelector('[data-inventory-read-learn]')?.click();
    await settle();
    assert.ok(detail, 'the item-only book still renders in the inventory');
    assert.match(detail.textContent, /Forge Breastplate/, 'it still lists its recipes');
    assert.equal(detail.querySelector('[data-inventory-learn="r1"]'), null, 'no Learn button in item-only mode');
    assert.equal(detail.querySelector('[data-inventory-learned="r1"]'), null, 'no Learned chip in item-only mode');
  });

  it('shows a USE-based CTA in item mode (not Read & learn)', async () => {
    const book = makeBook(
      [{ id: 'r1', name: 'Forge Breastplate', description: '', img: null, learned: false }],
      { uses: { max: 3, used: 1, remaining: 2 }, learning: null },
      false
    );
    const { services } = makeBookServices(book);
    const target = await harness.mount({ services });
    await settle();

    const cta = target.querySelector('[data-inventory-recipe-item] [data-inventory-read-learn]');
    assert.ok(cta, 'renders the CTA in item mode');
    // The harness localize mock emits `key:{data}`; assert the Use-based key + remaining.
    assert.match(cta.textContent, /UseMore/, 'item mode uses the "Use N more times" label');
    assert.match(cta.textContent, /"remaining":2/);
    assert.doesNotMatch(cta.textContent, /ReadLearn/, 'not a read & learn label in item mode');
  });
});
