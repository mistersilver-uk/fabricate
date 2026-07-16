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
    'src/ui/svelte/util/recipeItemAccessBadge.js',
    // NOTE: `progressiveStageThresholds.js` / `progressiveResultOrder.js` are NOT needed
    // here. `ProgressiveStageList.svelte` imports neither (only `foundryBridge`); the
    // real importer is `inventoryStore.svelte.js`, which this suite mocks with a POJO.
    // The store's own suite copies them instead.
  ],
  compiledModules: [
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/apps/crafting/CraftingThumb.svelte',
    'src/ui/svelte/apps/inventory/InventoryItemCard.svelte',
    'src/ui/svelte/apps/inventory/InventoryFilters.svelte',
    'src/ui/svelte/apps/inventory/InventoryGrid.svelte',
    // The inspector is a thin ROUTER over these bodies (issue 675). A `{#if}` in a
    // router does NOT keep a branch out of the module graph — the compiled
    // `.svelte.js` carries STATIC imports of every child — so the whole `detail/`
    // tree is listed here even though only one branch renders at a time. An omission
    // HANGS this suite (reported as `# cancelled`), it never fails it.
    'src/ui/svelte/apps/inventory/detail/InventoryDetailPager.svelte',
    'src/ui/svelte/apps/inventory/detail/InventoryBookDetail.svelte',
    // The salvage tree, plus the shared stage list it reuses.
    'src/ui/svelte/apps/crafting/detail/ProgressiveStageList.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageRollSummary.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageSimpleBody.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageRoutedBody.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageProgressiveBody.svelte',
    'src/ui/svelte/apps/inventory/detail/salvage/SalvageMisconfiguredBody.svelte',
    'src/ui/svelte/apps/inventory/detail/InventorySalvagePanel.svelte',
    'src/ui/svelte/apps/inventory/detail/InventoryComponentDetail.svelte',
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
    assert.ok(
      detail.querySelector('[data-inventory-section="required"]'),
      'shows Required for for a tool'
    );
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

  // D14: the prototype puts the salvageable and tool badges at ONE slot, which is only
  // safe there because no prototype fixture item is both. Fabricate's flags are
  // orthogonal and a broken salvageable tool is the headline case, so both-true must
  // resolve to two distinct badges in one row — nothing else in the suite would catch
  // an overlap (presence assertions pass either way).
  it('gives a salvageable tool BOTH corner badges, in one row, distinct elements', async () => {
    const item = makeItem();
    item.isTool = true;
    item.salvage = { enabled: true, mode: 'simple' };
    const { services } = makeServices(item);
    const target = await harness.mount({ services });
    await settle();

    const card = target.querySelector('[data-inventory-card="sys:c1"]');
    const salvageable = card.querySelector('[data-inventory-pip="salvageable"]');
    const tool = card.querySelector('[data-inventory-pip="tool"]');
    assert.ok(salvageable, 'renders the salvageable badge');
    assert.ok(tool, 'renders the tool badge');
    assert.notEqual(salvageable, tool, 'they are two elements, not one shared slot');
    const badges = card.querySelector('[data-inventory-badges]');
    assert.equal(salvageable.parentElement, badges, 'the salvageable badge sits in the badge row');
    assert.equal(tool.parentElement, badges, 'the tool badge sits in the SAME badge row');
    assert.equal(badges.children.length, 2, 'the row carries exactly the two badges');
  });

  it('renders no salvageable badge for a component with salvage disabled', async () => {
    const item = makeItem();
    item.salvage = { enabled: false };
    const { services } = makeServices(item);
    const target = await harness.mount({ services });
    await settle();

    const card = target.querySelector('[data-inventory-card="sys:c1"]');
    assert.equal(card.querySelector('[data-inventory-pip="salvageable"]'), null);
  });

  // D14: "Broken" REPLACES the quantity pip; they share one slot and one ternary.
  // Rendering them as separate elements would collide at top-right.
  it('replaces the quantity pip with a Broken pip on a broken tool', async () => {
    const item = makeItem();
    item.broken = true;
    const { services } = makeServices(item);
    const target = await harness.mount({ services });
    await settle();

    const card = target.querySelector('[data-inventory-card="sys:c1"]');
    const pips = card.querySelectorAll('[data-inventory-qty]');
    assert.equal(pips.length, 1, 'exactly one top-right pip — a replacement, not an addition');
    assert.ok(pips[0].hasAttribute('data-inventory-qty-broken'), 'it is the broken variant');
    assert.doesNotMatch(pips[0].textContent, /×7/, 'the quantity is not also shown');
    assert.ok(card.hasAttribute('data-inventory-card-broken'), 'the card carries the broken state');
  });

  it('shows the quantity pip and no broken state on an intact item', async () => {
    const { services } = makeServices(makeItem());
    const target = await harness.mount({ services });
    await settle();

    const card = target.querySelector('[data-inventory-card="sys:c1"]');
    const pips = card.querySelectorAll('[data-inventory-qty]');
    assert.equal(pips.length, 1);
    assert.equal(pips[0].hasAttribute('data-inventory-qty-broken'), false);
    assert.match(pips[0].textContent, /×7/);
    assert.equal(card.hasAttribute('data-inventory-card-broken'), false);
  });

  it('shows the read-only broken banner, with no repair action, on the Info body', async () => {
    const item = makeItem();
    item.broken = true;
    const { services } = makeServices(item);
    const target = await harness.mount({ services });
    await settle();

    const detail = target.querySelector('[data-inventory-detail="sys:c1"]');
    const banner = detail.querySelector('[data-inventory-broken-banner]');
    assert.ok(banner, 'renders the broken banner');
    assert.equal(banner.querySelector('button'), null, 'the banner offers no action');
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
  const calls = { navigate: [], learn: [], learnAll: [] };
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
    learnAll: (recipeIds) => calls.learnAll.push(recipeIds),
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

function makeBook(
  recipes,
  limits = { uses: null, learning: null },
  learnable = true,
  craftable = false,
  caps = { item: { limitUses: false }, learn: { limitLearning: false } }
) {
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
    craftable,
    totalQuantity: 1,
    sources: [{ actorId: 'a1', actorName: 'Akra', actorImg: null, quantity: 1 }],
    essences: [],
    usedBy: [],
    requiredFor: [],
    producedBy: [],
    contributors: [],
    recipes,
    caps,
    limits,
  };
}

describe('InventoryView (mounted) — recipe-item books', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('renders a single-recipe book inline with its description and a Learn button', async () => {
    const book = makeBook([
      {
        id: 'r1',
        name: 'Forge Breastplate',
        description: 'A sturdy cuirass.',
        img: null,
        learned: false,
      },
    ]);
    const { services, calls } = makeBookServices(book);
    const target = await harness.mount({ services });
    await settle();

    const detail = target.querySelector('[data-inventory-recipe-item]');
    assert.ok(detail, 'renders the book detail');
    assert.match(
      detail.textContent,
      /A worn manual of forge techniques\./,
      'shows the book description'
    );
    assert.match(detail.textContent, /Forge Breastplate/, 'shows the single recipe name');
    assert.match(detail.textContent, /A sturdy cuirass\./, 'shows the recipe description inline');
    // No accordion for a single recipe.
    assert.equal(
      detail.querySelector('[data-inventory-recipe-accordion]'),
      null,
      'no accordion for one recipe'
    );

    const learn = detail.querySelector('[data-inventory-learn="r1"]');
    assert.ok(learn, 'renders a Learn button');
    learn.click();
    await settle();
    assert.deepEqual(calls.learn, ['r1'], 'clicking Learn invokes store.learn with the recipe id');
  });

  it('always shows the recipe list + a "learn all" convenience for an unlimited book', async () => {
    const book = makeBook([
      { id: 'r1', name: 'Forge Breastplate', description: 'A cuirass.', img: null, learned: false },
    ]);
    const { services, calls } = makeBookServices(book);
    const target = await harness.mount({ services });
    await settle();

    const detail = target.querySelector('[data-inventory-recipe-item]');
    // No reveal CTA — the recipe list is shown immediately with per-recipe Learn.
    assert.equal(detail.querySelector('[data-inventory-read-learn]'), null, 'no reveal CTA');
    assert.ok(
      detail.querySelector('[data-inventory-learn-recipe="r1"]'),
      'the recipe list is shown'
    );
    assert.ok(detail.querySelector('[data-inventory-learn="r1"]'), 'per-recipe Learn is shown');
    // An unlimited learnable book offers the "Read & learn all N" convenience.
    const learnAll = detail.querySelector('[data-inventory-learn-all]');
    assert.ok(learnAll, 'shows the learn-all convenience');
    // A single-recipe book reads the singular "Read & learn", not "...all 1 recipes".
    assert.match(
      learnAll.textContent,
      /ReadLearnAllRecipeSingular/,
      'single recipe ⇒ singular CTA'
    );
    assert.ok(
      !/ReadLearnAllRecipes/.test(learnAll.textContent),
      'not the plural "...all {n} recipes"'
    );
    learnAll.click();
    await settle();
    assert.deepEqual(calls.learnAll, [['r1']], 'learn-all passes the unlearned recipe ids');
  });

  it('uses the plural learn-all CTA for a multi-recipe book', async () => {
    const book = makeBook([
      { id: 'r1', name: 'Forge Breastplate', description: '', img: null, learned: false },
      { id: 'r2', name: 'Forge Gauntlets', description: '', img: null, learned: false },
    ]);
    const { services } = makeBookServices(book);
    const target = await harness.mount({ services });
    await settle();
    const learnAll = target.querySelector(
      '[data-inventory-recipe-item] [data-inventory-learn-all]'
    );
    assert.ok(learnAll, 'shows the learn-all convenience');
    assert.match(learnAll.textContent, /ReadLearnAllRecipes/, 'multi-recipe ⇒ plural CTA');
  });

  it('keeps the learn-all CTA for a Limited-learning book with Recipes-allowed 1 and a single unlearned recipe (issue 544)', async () => {
    const book = makeBook(
      [{ id: 'r1', name: 'Forge Breastplate', description: '', img: null, learned: false }],
      { uses: null, learning: { max: 1, learned: 0, remaining: 1 } },
      true,
      false,
      { item: { limitUses: false }, learn: { limitLearning: true, learnsAllowed: 1 } }
    );
    const { services } = makeBookServices(book);
    const target = await harness.mount({ services });
    await settle();
    const detail = target.querySelector('[data-inventory-recipe-item]');
    assert.ok(
      detail.querySelector('[data-inventory-learn-all]'),
      'the learn-all CTA is NOT hidden when the cap (1) covers the single recipe'
    );
  });

  it('always shows the list, hides learn-all, and disables Learn when the budget is spent', async () => {
    const book = makeBook(
      [{ id: 'r1', name: 'Forge Breastplate', description: '', img: null, learned: false }],
      { uses: null, learning: { max: 2, learned: 2, remaining: 0 } },
      true,
      false,
      { item: { limitUses: false }, learn: { limitLearning: true, learnsAllowed: 2 } }
    );
    const { services } = makeBookServices(book);
    const target = await harness.mount({ services });
    await settle();

    const detail = target.querySelector('[data-inventory-recipe-item]');
    assert.ok(
      detail.querySelector('[data-inventory-learn-recipe="r1"]'),
      'the recipe list is shown'
    );
    assert.equal(
      detail.querySelector('[data-inventory-learn="r1"]').disabled,
      true,
      'Learn is disabled when the budget is spent'
    );
    assert.equal(
      detail.querySelector('[data-inventory-learn-all]'),
      null,
      'no learn-all convenience when the budget is spent'
    );
  });

  it('renders a DISABLED Learn button (not an enumeration chip) for a requirement-blocked recipe (issue 544)', async () => {
    const book = makeBook([
      {
        id: 'r1',
        name: 'Forge Breastplate',
        description: '',
        img: null,
        learned: false,
        learnBlocked: true,
        learnBlockedReason: 'Forge a Club',
      },
    ]);
    const { services } = makeBookServices(book);
    const target = await harness.mount({ services });
    await settle();

    const detail = target.querySelector('[data-inventory-recipe-item]');
    const learn = detail.querySelector('[data-inventory-learn="r1"]');
    assert.ok(learn, 'a blocked recipe still shows the Learn button');
    assert.equal(learn.disabled, true, 'the Learn button is disabled when the recipe is blocked');
    assert.ok(
      /LearnBlockedShort/.test(learn.getAttribute('title') || ''),
      'the disabled button explains itself'
    );
    // The per-recipe enumeration chip is gone — requirements live in the book-level chips.
    assert.equal(
      detail.querySelector('[data-inventory-learn-blocked="r1"]'),
      null,
      'no per-recipe enumeration chip'
    );
  });

  it('shows a Learned chip instead of a Learn button for an already-learned recipe', async () => {
    const book = makeBook([
      { id: 'r1', name: 'Forge Breastplate', description: '', img: null, learned: true },
    ]);
    const { services } = makeBookServices(book);
    const target = await harness.mount({ services });
    await settle();

    const detail = target.querySelector('[data-inventory-recipe-item]');
    assert.ok(detail.querySelector('[data-inventory-learned="r1"]'), 'renders a Learned chip');
    assert.equal(
      detail.querySelector('[data-inventory-learn="r1"]'),
      null,
      'no Learn button when learned'
    );
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
    const accordion = detail.querySelector('[data-inventory-recipe-accordion]');
    assert.ok(accordion, 'renders the accordion for multiple recipes');
    // Search appears once a book teaches more than the smallest page (6).
    assert.ok(
      detail.querySelector('[data-inventory-recipe-search]'),
      'shows the recipe search over 6 recipes'
    );
    // First page shows 6 of 8; the pager offers page-size 6/9/12.
    assert.equal(
      accordion.querySelectorAll('[data-inventory-learn-recipe]').length,
      6,
      'first page shows six recipes'
    );
    assert.ok(detail.querySelector('[data-inventory-recipe-pager]'), 'renders the recipe pager');

    // The row description is collapsed until the header is toggled.
    assert.equal(
      detail.querySelector('[data-inventory-recipe-body="r1"]'),
      null,
      'description collapsed by default'
    );
    detail
      .querySelector('[data-inventory-learn-recipe="r1"] .inventory-detail-accordion-toggle')
      .click();
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
    assert.ok(detail.querySelector('[data-inventory-recipe-accordion]'), 'still an accordion');
    assert.equal(
      detail.querySelector('[data-inventory-recipe-search]'),
      null,
      'no search for a small book'
    );
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
    assert.ok(detail, 'the item-only book still renders in the inventory');
    assert.match(detail.textContent, /Forge Breastplate/, 'it still lists its recipes');
    assert.equal(
      detail.querySelector('[data-inventory-learn="r1"]'),
      null,
      'no Learn button in item-only mode'
    );
    assert.equal(
      detail.querySelector('[data-inventory-learned="r1"]'),
      null,
      'no Learned chip in item-only mode'
    );
  });

  it('item mode: always shows the list with Craft buttons, an access badge, and no reveal/learn-all', async () => {
    const book = makeBook(
      [{ id: 'r1', name: 'Forge Breastplate', description: '', img: null, learned: false }],
      { uses: { max: 3, used: 1, remaining: 2 }, learning: null },
      false, // not learnable
      true, // craftable (item mode)
      { item: { limitUses: true, maxUses: 3 }, learn: { limitLearning: false } }
    );
    const { services, calls } = makeBookServices(book);
    const target = await harness.mount({ services });
    await settle();

    const detail = target.querySelector('[data-inventory-recipe-item]');
    // The use cap is shown as the access badge (matching the GM preview), not a pill.
    const badge = detail.querySelector('[data-inventory-access-badge]');
    assert.ok(badge, 'shows the access badge');
    assert.match(badge.textContent, /NUses/, 'the badge reads the use cap');
    // No reveal CTA and no learn-all convenience in item mode.
    assert.equal(detail.querySelector('[data-inventory-read-learn]'), null, 'no reveal CTA');
    assert.equal(
      detail.querySelector('[data-inventory-learn-all]'),
      null,
      'no learn-all in item mode'
    );

    // The list is shown immediately with per-recipe Craft (not Learn), wired to navigate.
    assert.equal(
      detail.querySelector('[data-inventory-learn="r1"]'),
      null,
      'no Learn button in item mode'
    );
    const craft = detail.querySelector('[data-inventory-craft="r1"]');
    assert.ok(craft, 'renders a Craft button');
    craft.click();
    await settle();
    assert.deepEqual(calls.navigate, ['r1'], 'Craft navigates to the recipe to craft it');
  });

  it('renders book-level "Needs:" requirement chips with names, icons, and met/unmet tone (issue 544)', async () => {
    const book = makeBook([
      { id: 'r1', name: 'Forge Breastplate', description: '', img: null, learned: false },
    ]);
    book.requirements = [
      {
        kind: 'knowledge',
        id: 'r-known',
        name: 'Cantrip',
        icon: 'fas fa-graduation-cap',
        met: true,
      },
      {
        kind: 'character',
        id: 'p-fail',
        name: 'Master Only',
        icon: 'fas fa-hat-wizard',
        met: false,
      },
    ];
    const { services } = makeBookServices(book);
    const target = await harness.mount({ services });
    await settle();

    const detail = target.querySelector('[data-inventory-recipe-item]');
    const row = detail.querySelector('[data-inventory-requirements]');
    assert.ok(row, 'renders the requirement chip row');

    const met = detail.querySelector('[data-inventory-requirement="r-known"]');
    assert.ok(met, 'a met requirement chip renders');
    assert.match(met.textContent, /Needs/, 'chip reads "Needs: <name>"');
    assert.match(met.textContent, /Cantrip/, 'chip names the requirement');
    assert.ok(
      met.querySelector('i.fa-graduation-cap'),
      'Required Knowledge chip has the graduation-cap icon'
    );
    assert.ok(met.classList.contains('is-met'), 'met chip uses the success (met) tone');
    assert.equal(met.getAttribute('data-requirement-met'), 'true');
    assert.equal(met.querySelector('button'), null, 'requirement chips are read-only');
    // Non-colour state signals: a trailing status glyph + a stateful accessible name.
    assert.ok(
      met.querySelector('i.fa-circle-check[data-requirement-status="met"]'),
      'met chip has a check status glyph'
    );
    assert.ok(
      /RequirementMet/.test(met.getAttribute('aria-label') || ''),
      'met chip aria-label states it is met'
    );

    const unmet = detail.querySelector('[data-inventory-requirement="p-fail"]');
    assert.ok(unmet, 'an unmet requirement chip renders');
    assert.match(unmet.textContent, /Master Only/);
    assert.ok(unmet.querySelector('i.fa-hat-wizard'), 'character prereq chip uses its own icon');
    assert.ok(unmet.classList.contains('is-unmet'), 'unmet chip uses the danger (unmet) tone');
    assert.equal(unmet.getAttribute('data-requirement-met'), 'false');
    assert.ok(
      unmet.querySelector('i.fa-lock[data-requirement-status="unmet"]'),
      'unmet chip has a lock status glyph'
    );
    assert.ok(
      /RequirementUnmet/.test(unmet.getAttribute('aria-label') || ''),
      'unmet chip aria-label states it is not met'
    );
  });

  it('renders no requirement chip row when the book has no requirements', async () => {
    const book = makeBook([
      { id: 'r1', name: 'Forge Breastplate', description: '', img: null, learned: false },
    ]);
    const { services } = makeBookServices(book);
    const target = await harness.mount({ services });
    await settle();
    const detail = target.querySelector('[data-inventory-recipe-item]');
    assert.equal(
      detail.querySelector('[data-inventory-requirements]'),
      null,
      'no requirement row without requirements'
    );
  });
});

// --- Player salvage surface (issue 675) ---------------------------------------

function salvageItem(salvage = {}, overrides = {}) {
  return {
    ...makeItem(),
    salvage: {
      enabled: true,
      mode: 'simple',
      checkUsable: false,
      misconfigured: false,
      routedType: null,
      dc: null,
      allowPlayerResultReorder: true,
      results: [],
      routedOutcomes: [],
      stages: [],
      awardMode: null,
      targetActorId: 'a1',
      ...salvage,
    },
    ...overrides,
  };
}

function salvageServices(item, storeOverrides = {}) {
  const { services, calls, store } = makeServices(item);
  calls.salvage = [];
  calls.reset = [];
  calls.reorder = [];
  store.salvagingKey = null;
  store.salvageResult = null;
  store.orderedSalvageStages = item.salvage?.stages ?? [];
  store.salvageOrderAnnouncement = '';
  store.salvage = (componentId) => calls.salvage.push(componentId);
  store.resetSalvage = () => calls.reset.push(true);
  store.reorderSalvageStage = (...args) => calls.reorder.push(args);
  store.flushSalvageOrder = () => Promise.resolve({ ok: true });
  Object.assign(store, storeOverrides);
  return { services, calls, store };
}

describe('InventoryView (mounted) — player salvage surface', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  // AC1.
  it('shows the Info | Salvage control for a salvageable component, Info active first', async () => {
    const { services } = salvageServices(salvageItem());
    const target = await harness.mount({ services });
    await settle();

    const tablist = target.querySelector('[role="tablist"]');
    assert.ok(tablist, 'renders a tab strip');
    const info = target.querySelector('[data-inventory-detail-tab="info"]');
    const salvage = target.querySelector('[data-inventory-detail-tab="salvage"]');
    assert.ok(info && salvage, 'both segments render');
    assert.equal(info.getAttribute('aria-selected'), 'true');
    assert.equal(salvage.getAttribute('aria-selected'), 'false');
    // Roving tabindex, per the GatheringDetailTabs precedent.
    assert.equal(info.getAttribute('tabindex'), '0');
    assert.equal(salvage.getAttribute('tabindex'), '-1');
    assert.equal(target.querySelector('[data-inventory-salvage-panel]'), null, 'Info is the body');
  });

  // AC1. Brokenness is about usability, not salvageability: the engine has no broken
  // check, so hiding the tab would read as "this isn't salvageable" - wrong, and
  // unfixable by the player.
  it('AC1: a BROKEN salvageable tool still gets the Salvage tab, and the broken banner', async () => {
    const { services } = salvageServices(salvageItem({}, { broken: true, isTool: true }));
    const target = await harness.mount({ services });
    await settle();

    assert.ok(
      target.querySelector('[data-inventory-detail-tab="salvage"]'),
      'a broken tool is still salvageable'
    );
    assert.ok(target.querySelector('[data-inventory-broken-banner]'), 'and says why it is unusable');
  });

  it('AC1: a non-salvageable item shows NO tab bar at all', async () => {
    const item = makeItem();
    item.salvage = null;
    const { services } = salvageServices(item);
    const target = await harness.mount({ services });
    await settle();

    assert.equal(target.querySelector('[role="tablist"]'), null);
    assert.equal(target.querySelector('[data-inventory-detail-tab="salvage"]'), null);
  });

  it('switching to Salvage renders the panel in a labelled tabpanel', async () => {
    const { services } = salvageServices(salvageItem());
    const target = await harness.mount({ services });
    await settle();

    target.querySelector('[data-inventory-detail-tab="salvage"]').click();
    await settle();

    const panel = target.querySelector('#inventory-detail-panel-salvage');
    assert.ok(panel, 'the salvage panel renders');
    assert.equal(panel.getAttribute('role'), 'tabpanel');
    assert.equal(panel.getAttribute('aria-labelledby'), 'inventory-detail-tab-salvage');
    assert.ok(panel.querySelector('[data-inventory-salvage-panel]'));
  });

  async function openSalvage(services) {
    const target = await harness.mount({ services });
    await settle();
    target.querySelector('[data-inventory-detail-tab="salvage"]').click();
    await settle();
    return target;
  }

  // D5: "no check" and "pass/fail" are ONE mode at two usability states.
  it('simple with NO usable check renders the guaranteed body and a "Salvage" footer', async () => {
    const { services } = salvageServices(
      salvageItem({
        checkUsable: false,
        results: [{ id: 'r1', componentId: 'c2', name: 'Iron Shard', img: null, quantity: 2 }],
      })
    );
    const target = await openSalvage(services);

    assert.ok(target.querySelector('[data-inventory-salvage-body="no-check"]'));
    assert.match(target.textContent, /Guaranteed/);
    assert.equal(
      target.querySelector('[data-inventory-salvage-loss-note]'),
      null,
      'nothing can be lost without a roll'
    );
    assert.equal(target.querySelector('[data-inventory-salvage-dc]'), null, 'and there is no DC');
    // The harness localizer echoes keys, so assert the KEY the footer selected: with no
    // usable check the label is "Salvage", not "Salvage roll".
    assert.match(
      target.querySelector('[data-inventory-salvage-action]').textContent,
      /Salvage\.Action$/,
      'the footer names the gesture: no roll'
    );
  });

  it('simple WITH a usable check renders the on-success body, its DC, and the loss note', async () => {
    const { services } = salvageServices(
      salvageItem({
        checkUsable: true,
        dc: 14,
        results: [{ id: 'r1', componentId: 'c2', name: 'Iron Shard', img: null, quantity: 1 }],
      })
    );
    const target = await openSalvage(services);

    assert.ok(target.querySelector('[data-inventory-salvage-body="simple-check"]'));
    assert.equal(target.querySelector('[data-inventory-salvage-dc]').dataset.inventorySalvageDc, '14');
    assert.ok(target.querySelector('[data-inventory-salvage-loss-note]'), 'a roll can cost you');
    assert.match(
      target.querySelector('[data-inventory-salvage-action]').textContent,
      /Salvage\.ActionRoll$/,
      'a usable check makes the gesture a roll'
    );
  });

  // AC2, rendering half. The builder decides the numbers; this pins that the panel
  // renders the FIXED shape as a range and shows no DC chip.
  it('routed + fixed renders authored ranges and NO DC; routed + relative renders thresholds', async () => {
    const fixed = salvageServices(
      salvageItem({
        mode: 'routed',
        checkUsable: true,
        routedType: 'fixed',
        dc: null,
        routedOutcomes: [
          { id: 'o1', name: 'Fail', success: false, threshold: null, start: 1, end: 9, results: [] },
          {
            id: 'o2',
            name: 'Pass',
            success: true,
            threshold: null,
            start: 10,
            end: 20,
            results: [{ id: 'r1', componentId: 'c2', name: 'Iron Shard', img: null, quantity: 1 }],
          },
        ],
      })
    );
    let target = await openSalvage(fixed.services);
    assert.equal(
      target.querySelector('[data-inventory-salvage-body="routed"]').dataset.inventoryRoutedType,
      'fixed'
    );
    assert.equal(target.querySelector('[data-inventory-salvage-dc]'), null, 'a fixed check has no DC');
    assert.equal(
      target.querySelector('[data-inventory-outcome-range]').dataset.inventoryOutcomeRange,
      '1-9'
    );
    assert.equal(target.querySelector('[data-inventory-outcome-threshold]'), null);

    harness.remount();
    const relative = salvageServices(
      salvageItem({
        mode: 'routed',
        checkUsable: true,
        routedType: 'relative',
        dc: 15,
        routedOutcomes: [
          { id: 'o1', name: 'Pass', success: true, threshold: 15, start: null, end: null, results: [] },
        ],
      })
    );
    target = await openSalvage(relative.services);
    assert.equal(target.querySelector('[data-inventory-salvage-dc]').dataset.inventorySalvageDc, '15');
    assert.equal(
      target.querySelector('[data-inventory-outcome-threshold]').dataset.inventoryOutcomeThreshold,
      '15'
    );
    assert.equal(target.querySelector('[data-inventory-outcome-range]'), null);
  });

  // AC2. A routed/progressive salvage with no formula aborts in the engine with a
  // GM-config message and zero mutation, so showing its tiers would put a plausible
  // contract under a footer that ALWAYS fails.
  it('AC2: a misconfigured salvage renders the config state, no outcomes, and a disabled footer', async () => {
    const { services } = salvageServices(
      salvageItem({
        mode: 'routed',
        checkUsable: false,
        misconfigured: true,
        routedType: 'relative',
        routedOutcomes: [],
      })
    );
    const target = await openSalvage(services);

    assert.ok(target.querySelector('[data-inventory-salvage-body="misconfigured"]'));
    assert.equal(target.querySelector('[data-inventory-salvage-outcomes]'), null);
    assert.equal(target.querySelector('[data-inventory-salvage-action]').disabled, true);
  });

  it('the footer is one-shot: pressing it asks the store to salvage this component', async () => {
    const { services, calls } = salvageServices(salvageItem({ checkUsable: true, dc: 12 }));
    const target = await openSalvage(services);

    target.querySelector('[data-inventory-salvage-action]').click();
    await settle();

    assert.deepEqual(calls.salvage, ['c1'], 'one gesture, one call - no separate confirm');
  });

  it('AC3: the read-only summary renders only AFTER resolution', async () => {
    const { services, store } = salvageServices(salvageItem({ checkUsable: true, dc: 12 }));
    let target = await openSalvage(services);
    assert.equal(
      target.querySelector('[data-inventory-salvage-summary]'),
      null,
      'no summary before the roll - there is no pre-roll dice box'
    );

    harness.remount();
    store.salvageResult = {
      componentId: 'c1',
      state: 'success',
      message: 'Salvaged Mordant Gland',
      awarded: [{ name: 'Iron Shard', img: null }],
    };
    target = await openSalvage(services);
    const summary = target.querySelector('[data-inventory-salvage-summary]');
    assert.ok(summary, 'the summary appears after resolution');
    assert.match(summary.textContent, /Iron Shard/, 'and names what was recovered');
    assert.doesNotMatch(target.textContent, /d20/, 'it never invents a formula');
  });

  it('a committed salvage swaps the footer for the ribbon plus a Salvage again reset', async () => {
    const { services, calls, store } = salvageServices(salvageItem());
    store.salvageResult = { componentId: 'c1', state: 'success', message: '', awarded: [] };
    const target = await openSalvage(services);

    assert.ok(target.querySelector('[data-inventory-salvage-ribbon]'));
    assert.equal(target.querySelector('[data-inventory-salvage-action]'), null, 'one-shot: no reroll');
    target.querySelector('[data-inventory-salvage-again]').click();
    await settle();
    assert.deepEqual(calls.reset, [true]);
  });

  // AC9.
  it('AC9: a time-gated salvage shows a waiting state with the engine message, no ribbon', async () => {
    const { services, store } = salvageServices(salvageItem());
    store.salvageResult = {
      componentId: 'c1',
      state: 'waiting',
      message: 'Salvage started for Mordant Gland (60s remaining)',
      awarded: [],
    };
    const target = await openSalvage(services);

    assert.ok(target.querySelector('[data-inventory-salvage-summary="waiting"]'));
    assert.match(target.textContent, /60s remaining/);
    assert.equal(target.querySelector('[data-inventory-salvage-ribbon]'), null, 'nothing was awarded');
    assert.equal(target.querySelector('[data-inventory-salvage-again]'), null);
    assert.equal(
      target.querySelector('[data-inventory-salvage-action]').disabled,
      true,
      'pressing again would only re-enter the time gate'
    );
  });

  // AC8, rendering half.
  it('AC8: a progressive salvage renders reorderable stages with a live region', async () => {
    const stages = [
      { id: 's1', componentId: 'c2', name: 'Iron Shard', img: null, quantity: 2, difficulty: 4, threshold: 4 },
      { id: 's2', componentId: 'c3', name: 'Slag', img: null, quantity: 1, difficulty: 3, threshold: 7 },
    ];
    const { services, calls } = salvageServices(
      salvageItem({ mode: 'progressive', checkUsable: true, stages, awardMode: 'equal' }),
      // AC6's live-region half. `salvageOrderAnnouncement` threads FIVE wrapper hops
      // (InventoryView → InventoryDetail → InventoryComponentDetail →
      // InventorySalvagePanel → SalvageProgressiveBody → ProgressiveStageList). Drop the
      // prop at ANY hop and it silently defaults to '': the revert announcement never
      // reaches the player, a keyboard reorder announces nothing, and an
      // existence-only assertion stays green. So the fixture carries a REAL string and
      // the assertion below reads it back out of the DOM, through the real chain.
      { salvageOrderAnnouncement: 'Iron Shard moved to position 2 of 2' }
    );
    const target = await openSalvage(services);

    assert.ok(target.querySelector('[data-inventory-salvage-flow-note]'), 'says the roll flows down');
    const rows = target.querySelectorAll('[data-progressive-stage-reorderable]');
    assert.equal(rows.length, 2, 'both stages are reorderable');
    const liveRegion = target.querySelector('[data-progressive-stage-status]');
    assert.ok(liveRegion, 'the live region is present');
    assert.equal(liveRegion.getAttribute('aria-live'), 'polite');
    assert.equal(
      liveRegion.textContent.trim(),
      'Iron Shard moved to position 2 of 2',
      'the announcement REACHES the live region across all five wrapper hops (AC6)'
    );
    // The opt-in extensions the salvage body passes.
    assert.equal(
      target.querySelector('[data-progressive-stage-quantity]').dataset.progressiveStageQuantity,
      '2'
    );
    assert.ok(target.querySelector('[data-progressive-stage-state]'), 'renders a state chip');
    // No exclude affordance exists: the reconciliation contract guarantees a result is
    // never dropped, and there is nowhere to persist an exclusion.
    assert.equal(target.querySelector('input[type="checkbox"]'), null, 'no exclude checkbox');

    // Keyboard reorder routes through the store.
    target.querySelectorAll('[data-progressive-stage-move-down]')[0].click();
    await settle();
    assert.equal(calls.reorder.length, 1);
    assert.equal(calls.reorder[0][0], 0, 'from index 0');
    assert.equal(calls.reorder[0][1], 1, 'to index 1');
  });

  // AC8. `canReorder: false` DETACHES the handlers rather than leaving inert rows: a
  // player grabbing a row that does nothing is the worst outcome.
  it('AC8: allowPlayerResultReorder:false drops the grip and detaches the handlers', async () => {
    const stages = [
      { id: 's1', componentId: 'c2', name: 'Iron Shard', img: null, quantity: 1, difficulty: 4, threshold: 4 },
      { id: 's2', componentId: 'c3', name: 'Slag', img: null, quantity: 1, difficulty: 3, threshold: 7 },
    ];
    const { services } = salvageServices(
      salvageItem({
        mode: 'progressive',
        checkUsable: true,
        stages,
        awardMode: 'equal',
        allowPlayerResultReorder: false,
      })
    );
    const target = await openSalvage(services);

    assert.equal(target.querySelectorAll('[data-progressive-stage-reorderable]').length, 0);
    assert.equal(target.querySelectorAll('[data-progressive-stage-fixed]').length, 2);
    assert.equal(target.querySelector('[data-progressive-stage-move]'), null, 'no move buttons');
    assert.equal(target.querySelector('[data-progressive-stage-status]'), null, 'nothing to announce');
    assert.equal(
      target.querySelector('[data-progressive-stage-fixed-note]').textContent.trim(),
      'Order set by the GM',
      'and says the GM set it — which, here, is the reason that actually applies',
    );
  });

  // --- The body reconciles with the resolved roll -------------------------------
  //
  // The pre-roll list is a PLAN; once the roll resolves it is a RECORD. A stage row
  // still chipped "Awaiting roll" directly beneath the green "Salvaged" ribbon is a
  // contradiction the player has to resolve for us — and an existence-only chip
  // assertion cannot see it.

  const RECON_STAGES = [
    { id: 's1', componentId: 'c2', name: 'Iron Shard', img: null, quantity: 1, difficulty: 4, threshold: 4 },
    { id: 's2', componentId: 'c3', name: 'Slag', img: null, quantity: 1, difficulty: 3, threshold: 7 },
    // Unreachable at ANY budget (the award loop skips an invalid cost), so it is "Not
    // reached" before AND after a roll — never "Roll fell short".
    { id: 's3', componentId: 'c4', name: 'Dust', img: null, quantity: 1, difficulty: null, threshold: null },
  ];

  function progressiveServices(storeOverrides = {}) {
    return salvageServices(
      salvageItem({
        mode: 'progressive',
        checkUsable: true,
        stages: RECON_STAGES,
        awardMode: 'equal',
      }),
      storeOverrides,
    );
  }

  const chipStates = target =>
    [...target.querySelectorAll('[data-progressive-stage-state]')].map(
      chip => chip.dataset.progressiveStageState,
    );

  it('pre-roll: reachable stages await the roll, an unreachable one never does', async () => {
    const { services } = progressiveServices();
    const target = await openSalvage(services);
    assert.deepEqual(chipStates(target), ['awaiting', 'awaiting', 'unreachable']);
  });

  it('post-roll: chips reconcile against the run record — and NOTHING still awaits a roll', async () => {
    const { services } = progressiveServices({
      salvageResult: {
        componentId: 'c1',
        state: 'success',
        message: 'Salvaged Mordant Gland',
        awarded: [{ name: 'Iron Shard', img: null }],
        // The engine's OWN record of what it awarded, keyed by componentId: the roll
        // reached stage 1 and fell short of stage 2.
        awardedComponentIds: ['c2'],
        outcomeId: null,
      },
    });
    const target = await openSalvage(services);

    assert.ok(target.querySelector('[data-inventory-salvage-ribbon]'), 'the ribbon is up');
    assert.deepEqual(chipStates(target), ['recovered', 'short', 'unreachable']);
    // The regression this test exists for.
    assert.equal(
      target.querySelector('[data-progressive-stage-state="awaiting"]'),
      null,
      'no row still claims to await a roll beneath the success ribbon',
    );
  });

  it('post-roll: reorder is FROZEN — the roll has already been spent down the list', async () => {
    const { services } = progressiveServices({
      salvageResult: {
        componentId: 'c1',
        state: 'success',
        message: '',
        awarded: [],
        awardedComponentIds: ['c2'],
        outcomeId: null,
      },
    });
    const target = await openSalvage(services);

    assert.equal(
      target.querySelectorAll('[data-progressive-stage-reorderable]').length,
      0,
      'a committed order is a record, not a choice',
    );
    assert.equal(target.querySelector('[data-progressive-stage-move]'), null, 'no move buttons');
    assert.equal(target.querySelectorAll('[data-progressive-stage-fixed]').length, 3);

    // The note must give the REASON THAT APPLIES. `canReorder: false` has two causes and
    // the shared list cannot tell them apart, so a hardcoded string told a player who
    // had just dragged their OWN order that the GM set it — false, and invisible to an
    // assertion that only counts drag handles. Reading the text is the whole point.
    assert.equal(
      target.querySelector('[data-progressive-stage-fixed-note]').textContent.trim(),
      'Order spent — your roll ran down this list.',
      'the order is SPENT, not delegated to the GM',
    );
  });

  // The other cause of the same boolean. Here the GM string is the true one, and it must
  // survive a commit: the GM pinned this order whether or not a roll has since run down
  // it.
  it('the GM-pinned reason survives a commit, and is never replaced by the spent one', async () => {
    const gmPinned = salvageServices(
      salvageItem({
        mode: 'progressive',
        checkUsable: true,
        stages: RECON_STAGES,
        awardMode: 'equal',
        allowPlayerResultReorder: false,
      }),
      {
        salvageResult: {
          componentId: 'c1',
          state: 'success',
          message: '',
          awarded: [],
          awardedComponentIds: ['c2'],
          outcomeId: null,
        },
      },
    );
    const target = await openSalvage(gmPinned.services);
    assert.equal(
      target.querySelector('[data-progressive-stage-fixed-note]').textContent.trim(),
      'Order set by the GM',
      'the GM reason stays true after a commit and keeps precedence',
    );
  });

  it('post-roll with NO run record degrades to a neutral resolved state, inventing nothing', async () => {
    // The runless invariant: a salvage with no run manager records no createdResults, so
    // there is nothing to reconcile against. Claiming every stage fell short would be a
    // lie; claiming they still await a roll would be the contradiction above.
    const { services } = progressiveServices({
      salvageResult: {
        componentId: 'c1',
        state: 'success',
        message: '',
        awarded: [],
        awardedComponentIds: [],
        outcomeId: null,
      },
    });
    const target = await openSalvage(services);
    assert.deepEqual(chipStates(target), ['resolved', 'resolved', 'unreachable']);
    assert.equal(target.querySelector('[data-progressive-stage-state="awaiting"]'), null);
  });

  it('routed: the rolled tier is marked "Your roll" only AFTER resolution', async () => {
    const routed = {
      mode: 'routed',
      checkUsable: true,
      routedType: 'relative',
      dc: 15,
      routedOutcomes: [
        { id: 'o1', name: 'Fail', success: false, threshold: 10, start: null, end: null, results: [] },
        { id: 'o2', name: 'Pass', success: true, threshold: 15, start: null, end: null, results: [] },
      ],
    };

    const before = salvageServices(salvageItem(routed));
    let target = await openSalvage(before.services);
    assert.equal(
      target.querySelector('[data-inventory-outcome-your-roll]'),
      null,
      'no tier is marked before a roll',
    );

    harness.remount();
    const after = salvageServices(salvageItem(routed), {
      salvageResult: {
        componentId: 'c1',
        state: 'success',
        message: '',
        awarded: [],
        awardedComponentIds: [],
        // The engine's own record of the tier it routed through.
        outcomeId: 'o2',
      },
    });
    target = await openSalvage(after.services);
    const marked = target.querySelectorAll('[data-outcome-rolled="true"]');
    assert.equal(marked.length, 1, 'exactly one tier is marked');
    assert.equal(marked[0].dataset.inventorySalvageOutcome, 'o2', 'and it is the one that matched');
    assert.ok(marked[0].querySelector('[data-inventory-outcome-your-roll]'));
  });
});
