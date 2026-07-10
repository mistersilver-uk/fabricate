/**
 * Issue 555 — durable recipe-item identity + clone-safe registration (manager level).
 *
 * Pure-logic over plain fakes (no mounted components). Covers:
 *  - flow 4b: registering a duplicated (compendium-origin) book/component yields a NEW
 *    definition and leaves the original untouched;
 *  - flow 1 double-import dedups to one definition;
 *  - clone registration writes: own-uuid sourceItemUuid, overwritten flag, stripped
 *    duplicateSource, cleared compendiumSource;
 *  - the skipped branch stamps+strips a pre-flag source;
 *  - union source refs (sourceUuid + sourceItemUuid + fallbacks) resolve both drag routes;
 *  - the normalizer + import-shaped round-trip preserve sourceUuid/fallbackItemIds;
 *  - R3 auto-stamp (idempotent, world + writable pack, skips locked);
 *  - R4 repair reconciles component + recipe-item sources and actor-owned copies, with the
 *    guardrailed name-assisted re-point + audit log;
 *  - the generic _clearSourceFlag clears a stale flag off an old source (incl. the
 *    updated-branch re-point path and a throwing fromUuid);
 *  - post-review gap tests: tier-3 owned copy, component both-routes, deleted source.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

let _idCounter = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `rid-${++_idCounter}`,
    getProperty: (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj) ?? undefined,
  },
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };

const _registry = new Map();
globalThis.fromUuid = async (uuid) => _registry.get(uuid) ?? null;

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { RecipeVisibilityService } = await import('../src/systems/RecipeVisibilityService.js');
const { InventoryListingBuilder } = await import('../src/systems/InventoryListingBuilder.js');
const { matchRecipeItemDefinition, itemMatchesComponentSource } = await import('../src/utils/sourceUuid.js');

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function makeDoc({
  uuid,
  name = 'Item',
  img = 'icons/item.png',
  description = '',
  pack = null,
  documentName = 'Item',
  compendiumSource = null,
  duplicateSource = null,
  flags = null,
} = {}) {
  const doc = {
    uuid,
    name,
    img,
    description,
    pack,
    documentName,
    _stats: { compendiumSource, duplicateSource },
    flags: flags || {},
    updates: [],
    async update(patch) {
      this.updates.push(patch);
      for (const [key, value] of Object.entries(patch)) {
        if (key === '_stats.duplicateSource') this._stats.duplicateSource = value;
        if (key === '_stats.compendiumSource') this._stats.compendiumSource = value;
      }
    },
    getFlag(scope, key) {
      return foundry.utils.getProperty(this.flags?.[scope], key);
    },
    async setFlag(scope, key, value) {
      const parts = key.split('.');
      let node = (this.flags[scope] ??= {});
      while (parts.length > 1) node = node[parts.shift()] ??= {};
      node[parts[0]] = value;
    },
    async unsetFlag(scope, key) {
      const parts = key.split('.');
      let node = this.flags?.[scope];
      while (node && parts.length > 1) node = node[parts.shift()];
      if (node) delete node[parts[0]];
    },
  };
  return doc;
}

function register(doc) {
  _registry.set(doc.uuid, doc);
  return doc;
}

function recipeItemFlag(doc) {
  return doc.getFlag('fabricate', 'fabricate.recipeItemDefinitionId');
}

function componentFlag(doc) {
  return doc.getFlag('fabricate', 'fabricate.componentId');
}

function makeRecipeManager() {
  return { getRecipes: () => [], deleteRecipe: async () => {}, updateRecipe: async () => {}, save: async () => {} };
}

function packCollection(packs = []) {
  const arr = [...packs];
  arr.get = (id) => packs.find((pack) => pack.id === id) || null;
  return arr;
}

function buildManager({ systems = [], items = [], packs = [], actors = [], isGM = true } = {}) {
  const mgr = new CraftingSystemManager(makeRecipeManager());
  for (const sys of systems) mgr.systems.set(sys.id, mgr._normalizeSystem(sys));
  mgr.initialized = true;
  mgr.save = async () => {};
  globalThis.game = { user: { isGM }, items, packs: packCollection(packs), actors };
  return mgr;
}

function firstSystem(mgr) {
  return [...mgr.systems.values()][0];
}

function resetRegistry() {
  _registry.clear();
}

// Register the pack → imported-world-item → clone chain shared by the flow-4b tests: a
// compendium item, a world item imported from it, and a duplicate of that world item
// (which inherits the compendium source and gains a duplicateSource).
function registerCloneChain({ packUuid, worldUuid, worldName, cloneUuid, cloneName, cloneImg }) {
  register(makeDoc({ uuid: packUuid, name: `${worldName} (pack)` }));
  register(makeDoc({ uuid: worldUuid, name: worldName, compendiumSource: packUuid }));
  register(
    makeDoc({
      uuid: cloneUuid,
      name: cloneName,
      img: cloneImg,
      compendiumSource: packUuid,
      duplicateSource: worldUuid,
    })
  );
}

// A manager holding one (or more) recipe-item-definition systems plus one actor whose
// inventory is `ownedItems` — the shared scaffolding for the owned-copy repair tests.
function ownedRepairManager(definitions, ownedItems, { extraSystems = [] } = {}) {
  return buildManager({
    systems: [{ id: 'sys', name: 'S', recipeItemDefinitions: definitions }, ...extraSystems],
    actors: [{ id: 'a', items: ownedItems }],
  });
}

const BOOK_SCROLL_DEFS = [
  { id: 'def-book', name: 'Book', sourceItemUuid: 'Item.book' },
  { id: 'def-scroll', name: 'Scroll', sourceItemUuid: 'Item.scroll' },
];

// ---------------------------------------------------------------------------
// Flow 4b — a duplicated compendium-origin recipe item becomes a NEW definition
// ---------------------------------------------------------------------------

test('555 — flow 4b: registering a book duplicated from a compendium-origin book yields a new definition, original untouched', async () => {
  resetRegistry();
  // The book is a world item imported from a compendium.
  registerCloneChain({
    packUuid: 'Compendium.mod.books.book',
    worldUuid: 'Item.book',
    worldName: 'Book',
    cloneUuid: 'Item.scroll',
    cloneName: 'Scroll',
    cloneImg: 'icons/scroll.png',
  });
  const mgr = buildManager({ systems: [{ id: 'sys', name: 'S', recipeItemDefinitions: [] }] });

  const registered = await mgr.addRecipeItemFromUuid('sys', 'Item.book');
  const bookDef = registered.item;
  bookDef.recipeIds = ['r1', 'r2', 'r3', 'r4', 'r5'];
  const bookName = bookDef.name;
  const bookImg = bookDef.img;

  const second = await mgr.addRecipeItemFromUuid('sys', 'Item.scroll');
  const system = firstSystem(mgr);

  assert.equal(second.action, 'added', 'the clone registers as a new definition');
  assert.equal(system.recipeItemDefinitions.length, 2, 'a second definition was created');
  assert.notEqual(second.item.id, bookDef.id);
  // Original untouched.
  assert.equal(bookDef.name, bookName);
  assert.equal(bookDef.img, bookImg);
  assert.deepEqual(bookDef.recipeIds, ['r1', 'r2', 'r3', 'r4', 'r5']);
  // Clone keys on its OWN uuid, not the inherited compendium source.
  assert.equal(second.item.sourceItemUuid, 'Item.scroll');
});

test('555 — flow 4b: registering a component duplicated from a compendium-origin component yields a new component, original untouched', async () => {
  resetRegistry();
  registerCloneChain({
    packUuid: 'Compendium.mod.items.ore',
    worldUuid: 'Item.ore',
    worldName: 'Ore',
    cloneUuid: 'Item.ore-copy',
    cloneName: 'Ore Copy',
  });
  const mgr = buildManager({ systems: [{ id: 'sys', name: 'S', components: [] }] });

  const original = await mgr.addItemFromUuid('sys', 'Item.ore');
  const clone = await mgr.addItemFromUuid('sys', 'Item.ore-copy');
  const system = firstSystem(mgr);

  assert.equal(clone.action, 'added');
  assert.equal(system.components.length, 2, 'the clone is a separate component');
  assert.notEqual(clone.item.id, original.item.id);
  assert.equal(clone.item.sourceUuid, 'Item.ore-copy');
});

// ---------------------------------------------------------------------------
// Flow 1 — double-import of the same pack item dedups to ONE definition
// ---------------------------------------------------------------------------

test('555 — flow 1 double-import (NOT the bug): the same pack book imported to the world twice registers as ONE definition', async () => {
  resetRegistry();
  register(makeDoc({ uuid: 'Compendium.mod.books.book', name: 'Book (pack)' }));
  // Two DISTINCT world imports of the same pack item — both carry the same compendiumSource
  // and neither is a clone (no duplicateSource).
  register(makeDoc({ uuid: 'Item.book-a', name: 'Book', compendiumSource: 'Compendium.mod.books.book' }));
  register(makeDoc({ uuid: 'Item.book-b', name: 'Book', compendiumSource: 'Compendium.mod.books.book' }));
  const mgr = buildManager({ systems: [{ id: 'sys', name: 'S', recipeItemDefinitions: [] }] });

  const first = await mgr.addRecipeItemFromUuid('sys', 'Item.book-a');
  const second = await mgr.addRecipeItemFromUuid('sys', 'Item.book-b');

  assert.equal(firstSystem(mgr).recipeItemDefinitions.length, 1, 'the re-import dedups to one definition');
  assert.equal(second.item.id, first.item.id);
});

// ---------------------------------------------------------------------------
// Registration writes — clone strip + stamp; skipped branch recovery
// ---------------------------------------------------------------------------

test('555 — clone registration stamps the flag, strips duplicateSource, and clears compendiumSource on the source', async () => {
  resetRegistry();
  register(makeDoc({ uuid: 'Compendium.mod.books.book' }));
  register(makeDoc({ uuid: 'Item.book', compendiumSource: 'Compendium.mod.books.book' }));
  const mgr = buildManager({ systems: [{ id: 'sys', name: 'S', recipeItemDefinitions: [] }] });
  await mgr.addRecipeItemFromUuid('sys', 'Item.book');

  const scroll = register(
    makeDoc({
      uuid: 'Item.scroll',
      name: 'Scroll',
      compendiumSource: 'Compendium.mod.books.book',
      duplicateSource: 'Item.book',
      // Inherited marker from the original — must be overwritten.
      flags: { fabricate: { fabricate: { recipeItemDefinitionId: 'original-def-id' } } },
    })
  );
  const result = await mgr.addRecipeItemFromUuid('sys', 'Item.scroll');

  assert.equal(scroll._stats.duplicateSource, null, 'stale duplicateSource stripped');
  assert.equal(scroll._stats.compendiumSource, null, 'stale compendiumSource cleared');
  assert.equal(recipeItemFlag(scroll), result.item.id, 'inherited marker overwritten with the clone def id');
  assert.notEqual(result.item.id, 'original-def-id');
});

test('555 — the skipped branch stamps and strips a pre-flag source (recovery path)', async () => {
  resetRegistry();
  // A fresh world book, registered, whose source predates the durable flag.
  const book = register(makeDoc({ uuid: 'Item.book', name: 'Book' }));
  const mgr = buildManager({ systems: [{ id: 'sys', name: 'S', recipeItemDefinitions: [] }] });
  const first = await mgr.addRecipeItemFromUuid('sys', 'Item.book');
  // Simulate a pre-flag world: wipe the flag the first registration stamped.
  book.flags = {};

  const second = await mgr.addRecipeItemFromUuid('sys', 'Item.book');
  assert.equal(second.action, 'skipped', 'an unchanged definition is skipped');
  assert.equal(recipeItemFlag(book), first.item.id, 'the skipped branch re-stamped the durable flag');
});

// ---------------------------------------------------------------------------
// Union source refs — both drag routes resolve; round-trip preserved
// ---------------------------------------------------------------------------

test('555 — a compendium-imported book records union source refs (sourceUuid + sourceItemUuid)', async () => {
  resetRegistry();
  register(makeDoc({ uuid: 'Compendium.mod.books.book' }));
  register(makeDoc({ uuid: 'Item.book', compendiumSource: 'Compendium.mod.books.book' }));
  const mgr = buildManager({ systems: [{ id: 'sys', name: 'S', recipeItemDefinitions: [] }] });

  const def = (await mgr.addRecipeItemFromUuid('sys', 'Item.book')).item;
  assert.equal(def.sourceUuid, 'Item.book', 'sourceUuid is the registered live document');
  assert.equal(def.sourceItemUuid, 'Compendium.mod.books.book', 'sourceItemUuid is the canonical compendium uuid');
});

test('555 — the normalizer preserves sourceUuid + fallbackItemIds across a save/load round-trip', () => {
  const mgr = buildManager({ systems: [] });
  const normalized = mgr._normalizeRecipeItemDefinition({
    id: 'def1',
    name: 'Book',
    sourceUuid: 'Item.book',
    sourceItemUuid: 'Compendium.mod.books.book',
    fallbackItemIds: ['Item.old', 'Item.book'], // duplicate of a primary is dropped
  });
  assert.equal(normalized.sourceUuid, 'Item.book');
  assert.equal(normalized.sourceItemUuid, 'Compendium.mod.books.book');
  assert.deepEqual(normalized.fallbackItemIds, ['Item.old']);

  // Re-normalizing the serialized shape (import round-trip) preserves the fields.
  const roundTripped = mgr._normalizeRecipeItemDefinition({ ...normalized });
  assert.equal(roundTripped.sourceUuid, 'Item.book');
  assert.deepEqual(roundTripped.fallbackItemIds, ['Item.old']);
});

// ---------------------------------------------------------------------------
// R3 — one-shot auto-stamp
// ---------------------------------------------------------------------------

test('555 R3 — auto-stamp flags world sources, is idempotent, and skips locked packs', async () => {
  resetRegistry();
  const worldBook = register(makeDoc({ uuid: 'Item.book', name: 'Book', duplicateSource: 'Item.template' }));
  const packBook = register(makeDoc({ uuid: 'Compendium.world.pack.book2', name: 'Book2', pack: 'world.pack' }));
  const lockedBook = register(makeDoc({ uuid: 'Compendium.mod.pack.book3', name: 'Book3', pack: 'mod.pack' }));

  const mgr = buildManager({
    systems: [
      {
        id: 'sys',
        name: 'S',
        recipeItemDefinitions: [
          { id: 'd1', name: 'Book', sourceItemUuid: 'Item.book' },
          { id: 'd2', name: 'Book2', sourceItemUuid: 'Compendium.world.pack.book2' },
          { id: 'd3', name: 'Book3', sourceItemUuid: 'Compendium.mod.pack.book3' },
        ],
      },
    ],
    packs: [
      { id: 'world.pack', documentName: 'Item', locked: false },
      { id: 'mod.pack', documentName: 'Item', locked: true },
    ],
  });

  const summary = await mgr.autoStampRecipeItemSources();
  assert.equal(recipeItemFlag(worldBook), 'd1');
  assert.equal(worldBook._stats.duplicateSource, null, 'a clone world source is also stripped');
  assert.equal(recipeItemFlag(packBook), 'd2', 'a writable-pack source is stamped');
  assert.equal(componentFlag(lockedBook), undefined);
  assert.equal(recipeItemFlag(lockedBook), undefined, 'a locked-pack source is left alone');
  assert.equal(summary.skippedLocked, 1);
  assert.ok(summary.stamped >= 2);

  const second = await mgr.autoStampRecipeItemSources();
  assert.equal(second.stamped, 0, 'a second run performs zero writes (idempotent)');
  assert.equal(second.stripped, 0);
});

// ---------------------------------------------------------------------------
// R4 — repair reconciles both kinds + actor-owned copies + name-assist
// ---------------------------------------------------------------------------

test('555 R4 — one repair pass stamps a component source, a recipe-item source, and an actor-owned copy', async () => {
  resetRegistry();
  const compSource = makeDoc({ uuid: 'Item.ore', name: 'Ore' });
  const bookSource = makeDoc({ uuid: 'Item.book', name: 'Book', duplicateSource: 'Item.template' });
  const ownedBook = makeDoc({ uuid: 'Actor.a.Item.copy', name: 'Book', duplicateSource: 'Item.book' });
  const actor = { id: 'a', items: [ownedBook] };

  const mgr = buildManager({
    systems: [
      {
        id: 'sys',
        name: 'S',
        components: [{ id: 'comp-ore', name: 'Ore', sourceUuid: 'Item.ore', sourceItemUuid: 'Item.ore' }],
        recipeItemDefinitions: [{ id: 'def-book', name: 'Book', sourceItemUuid: 'Item.book' }],
      },
    ],
    items: [compSource, bookSource],
    actors: [actor],
  });

  const summary = await mgr.repairComponentSourceFlags();
  assert.equal(componentFlag(compSource), 'comp-ore');
  assert.equal(recipeItemFlag(bookSource), 'def-book');
  assert.equal(bookSource._stats.duplicateSource, null, 'clone source stripped');
  assert.equal(recipeItemFlag(ownedBook), 'def-book', 'the actor-owned copy is stamped via the four-tier matcher');
  assert.ok(summary.stamped >= 3);

  const second = await mgr.repairComponentSourceFlags();
  assert.equal(second.stamped, 0, 'idempotent second pass');
});

test('555 R4 — a world SOURCE clone is NOT identity-matched onto the original via inherited compendiumSource (self-corruption fixed)', async () => {
  resetRegistry();
  // A world source that is a duplicate of the original: inherits the original's
  // compendium source. Repair must NOT stamp it with the original's id.
  const cloneSource = makeDoc({
    uuid: 'Item.clone',
    name: 'Clone',
    compendiumSource: 'Compendium.mod.books.book',
    duplicateSource: 'Item.book',
  });
  const mgr = buildManager({
    systems: [
      {
        id: 'sys',
        name: 'S',
        recipeItemDefinitions: [
          { id: 'def-original', name: 'Original', sourceItemUuid: 'Compendium.mod.books.book' },
        ],
      },
    ],
    items: [cloneSource],
  });

  await mgr.repairComponentSourceFlags();
  assert.equal(recipeItemFlag(cloneSource), undefined, 'the clone source is not mis-stamped with the original id');
});

test('555 R4 name-assist — an owned copy whose unique name matches a different definition is re-pointed, with an audit log', async () => {
  resetRegistry();
  // Owned scroll copy: its transitive duplicateSource points at the BOOK, but its name
  // uniquely matches the SCROLL definition.
  const ownedScroll = makeDoc({ uuid: 'Actor.a.Item.scroll', name: 'Scroll', duplicateSource: 'Item.book' });
  const mgr = ownedRepairManager(BOOK_SCROLL_DEFS, [ownedScroll]);

  const summary = await mgr.repairComponentSourceFlags();
  assert.equal(recipeItemFlag(ownedScroll), 'def-scroll', 're-pointed by unique name to the scroll def');
  assert.equal(summary.repointed, 1);
  assert.deepEqual(summary.repointLog, [
    { itemUuid: 'Actor.a.Item.scroll', oldDuplicateSourceTarget: 'Item.book', newlyStampedDefinitionId: 'def-scroll' },
  ]);
});

test('555 R4 name-assist — a name matching TWO definitions anywhere is skipped as ambiguous (no re-point)', async () => {
  resetRegistry();
  const ownedCopy = makeDoc({ uuid: 'Actor.a.Item.dup', name: 'Tome', duplicateSource: 'Item.book' });
  const mgr = ownedRepairManager(
    [
      { id: 'def-book', name: 'Book', sourceItemUuid: 'Item.book' },
      { id: 'def-tome-1', name: 'Tome', sourceItemUuid: 'Item.tome1' },
    ],
    [ownedCopy],
    {
      extraSystems: [
        { id: 'sys2', name: 'S2', recipeItemDefinitions: [{ id: 'def-tome-2', name: 'Tome', sourceItemUuid: 'Item.tome2' }] },
      ],
    }
  );

  const summary = await mgr.repairComponentSourceFlags();
  assert.equal(summary.skippedAmbiguous, 1);
  assert.equal(summary.repointed, 0);
  assert.equal(recipeItemFlag(ownedCopy), undefined, 'no re-point on an ambiguous name');
});

test('555 R4 name-assist — a flagged owned copy is authoritative and left untouched', async () => {
  resetRegistry();
  const ownedCopy = makeDoc({
    uuid: 'Actor.a.Item.flagged',
    name: 'Scroll',
    duplicateSource: 'Item.book',
    flags: { fabricate: { fabricate: { recipeItemDefinitionId: 'def-book' } } },
  });
  const mgr = ownedRepairManager(BOOK_SCROLL_DEFS, [ownedCopy]);

  const summary = await mgr.repairComponentSourceFlags();
  assert.equal(recipeItemFlag(ownedCopy), 'def-book', 'a flagged copy is authoritative');
  assert.equal(summary.repointed, 0);
});

// ---------------------------------------------------------------------------
// _clearSourceFlag (generic, kind-agnostic)
// ---------------------------------------------------------------------------

test('555 — _clearSourceFlag unsets a stale recipe-item flag on the old source', async () => {
  resetRegistry();
  const old = register(
    makeDoc({ uuid: 'Item.old', flags: { fabricate: { fabricate: { recipeItemDefinitionId: 'def-1' } } } })
  );
  const mgr = buildManager({ systems: [] });
  await mgr._clearSourceFlag('Item.old', 'recipeItemDefinitionId', 'def-1');
  assert.equal(recipeItemFlag(old), undefined);
});

test('555 — _clearSourceFlag leaves a flag that belongs to a different definition', async () => {
  resetRegistry();
  const other = register(
    makeDoc({ uuid: 'Item.other', flags: { fabricate: { fabricate: { recipeItemDefinitionId: 'def-2' } } } })
  );
  const mgr = buildManager({ systems: [] });
  await mgr._clearSourceFlag('Item.other', 'recipeItemDefinitionId', 'def-1');
  assert.equal(recipeItemFlag(other), 'def-2', 'a different def id is untouched');
});

// ---------------------------------------------------------------------------
// Matcher drift — both consumers resolve through the ONE shared matcher
// ---------------------------------------------------------------------------

test('555 — RecipeVisibilityService and InventoryListingBuilder resolve identically through the shared matcher', () => {
  const defs = [
    { id: 'def-book', sourceUuid: 'Item.book', sourceItemUuid: 'Compendium.mod.book' },
    { id: 'def-scroll', sourceUuid: 'Item.scroll', sourceItemUuid: 'Item.scroll' },
  ];
  const item = { uuid: 'Actor.a.Item.copy', _stats: { compendiumSource: 'Compendium.mod.book' }, getFlag: () => undefined };
  const shared = matchRecipeItemDefinition(item, defs).definition;

  // InventoryListingBuilder._matchRecipeItemDefinition does not touch `this`.
  const fromBuilder = InventoryListingBuilder.prototype._matchRecipeItemDefinition.call(null, item, defs);
  assert.equal(fromBuilder, shared, 'the inventory builder resolves via the shared matcher');

  // RecipeVisibilityService._matchDefinitionForItem routes a supplied item through the
  // same matcher over the recipe's member definitions.
  const service = new RecipeVisibilityService({ getRecipes: () => [] }, { getSystem: () => null });
  service._getRecipeItemDefinitions = () => defs;
  const fromService = service._matchDefinitionForItem({ id: 'r' }, item);
  assert.equal(fromService, shared, 'the visibility service resolves via the shared matcher');
});

// ---------------------------------------------------------------------------
// Cross-system shared source — single flag, last writer wins (documented limit)
// ---------------------------------------------------------------------------

test('555 — a source shared by two systems carries ONE durable flag (last writer wins)', async () => {
  resetRegistry();
  const shared = register(makeDoc({ uuid: 'Item.shared', name: 'Shared Book' }));
  const mgr = buildManager({
    systems: [
      { id: 'sys1', name: 'S1', recipeItemDefinitions: [] },
      { id: 'sys2', name: 'S2', recipeItemDefinitions: [] },
    ],
  });

  const first = await mgr.addRecipeItemFromUuid('sys1', 'Item.shared');
  assert.equal(recipeItemFlag(shared), first.item.id);

  const second = await mgr.addRecipeItemFromUuid('sys2', 'Item.shared');
  assert.equal(recipeItemFlag(shared), second.item.id, 'the second system overwrites the flag (last writer wins)');
  assert.notEqual(first.item.id, second.item.id, 'each system owns its own definition');
});

// ---------------------------------------------------------------------------
// Gap-closing tests (post-review): updated-branch re-point, tier-3 owned copy,
// component both-routes, deleted-source branches
// ---------------------------------------------------------------------------

test('555 — addRecipeItemFromUuid updated branch clears the flag on the OLD source when sourceItemUuid drifts', async () => {
  resetRegistry();
  // A non-clone source whose stored sourceItemUuid has drifted (the definition still
  // points at an old world source) but which carries the durable flag, so find-existing
  // resolves it by flag and the updated branch re-points it.
  register(makeDoc({ uuid: 'Item.old-source', name: 'Book', flags: { fabricate: { fabricate: { recipeItemDefinitionId: 'def-1' } } } }));
  register(makeDoc({ uuid: 'Item.book', name: 'Book', flags: { fabricate: { fabricate: { recipeItemDefinitionId: 'def-1' } } } }));
  const mgr = buildManager({
    systems: [
      { id: 'sys', name: 'S', recipeItemDefinitions: [{ id: 'def-1', name: 'Book', sourceUuid: 'Item.old-source', sourceItemUuid: 'Item.old-source' }] },
    ],
  });

  const result = await mgr.addRecipeItemFromUuid('sys', 'Item.book');
  assert.equal(result.action, 'updated', 'the drifted source re-registers through the updated branch');
  assert.equal(firstSystem(mgr).recipeItemDefinitions[0].sourceItemUuid, 'Item.book', 'the definition re-points to the new source');
  assert.equal(recipeItemFlag(_registry.get('Item.old-source')), undefined, 'the OLD source flag is cleared on re-point');
  assert.equal(recipeItemFlag(_registry.get('Item.book')), 'def-1', 'the new source keeps the flag');
});

test('555 R4 — an actor-owned copy carrying BOTH compendiumSource and duplicateSource is stamped via tier 3', async () => {
  resetRegistry();
  // The copy of a compendium-imported world item: inherits the compendium source AND a
  // duplicateSource. It must resolve via the reliable tier 3, not the tier-4 fallback.
  const ownedCopy = makeDoc({
    uuid: 'Actor.a.Item.copy',
    name: 'Book',
    compendiumSource: 'Compendium.mod.book',
    duplicateSource: 'Item.book',
  });
  const mgr = ownedRepairManager(
    [{ id: 'def-book', name: 'Book', sourceUuid: 'Item.book', sourceItemUuid: 'Compendium.mod.book' }],
    [ownedCopy]
  );

  const summary = await mgr.repairComponentSourceFlags();
  assert.equal(recipeItemFlag(ownedCopy), 'def-book', 'resolved via tier 3 (compendium) despite the duplicateSource');
  assert.equal(summary.repointed, 0, 'a reliable tier-3 match is not a name-assist re-point');
  assert.equal(ownedCopy._stats.duplicateSource, null, 'the owned copy is stripped of its transitive duplicateSource');
});

test('555 A2 — a compendium-imported component resolves owned copies dragged from BOTH the compendium item and the imported world item', async () => {
  resetRegistry();
  register(makeDoc({ uuid: 'Compendium.mod.items.ore', name: 'Ore (pack)' }));
  register(makeDoc({ uuid: 'Item.ore', name: 'Ore', compendiumSource: 'Compendium.mod.items.ore' }));
  const mgr = buildManager({ systems: [{ id: 'sys', name: 'S', components: [] }] });
  const component = (await mgr.addItemFromUuid('sys', 'Item.ore')).item;

  const fromCompendium = makeDoc({ uuid: 'Actor.a.Item.a', compendiumSource: 'Compendium.mod.items.ore' });
  const fromWorldItem = makeDoc({ uuid: 'Actor.a.Item.b', compendiumSource: 'Compendium.mod.items.ore', duplicateSource: 'Item.ore' });
  assert.equal(itemMatchesComponentSource(fromCompendium, component), true, 'the compendium-drag copy matches');
  assert.equal(itemMatchesComponentSource(fromWorldItem, component), true, 'the world-item-drag copy matches');
});

test('555 R3 — auto-stamp counts a definition whose source item no longer resolves as skippedMissing', async () => {
  resetRegistry(); // empty registry → fromUuid returns null for the deleted source
  const mgr = buildManager({
    systems: [{ id: 'sys', name: 'S', recipeItemDefinitions: [{ id: 'd1', name: 'Gone', sourceItemUuid: 'Item.deleted' }] }],
  });
  const summary = await mgr.autoStampRecipeItemSources();
  assert.equal(summary.skippedMissing, 1);
  assert.equal(summary.stamped, 0);
});

test('555 — _clearSourceFlag swallows a throwing fromUuid and does not reject', async () => {
  resetRegistry();
  const mgr = buildManager({ systems: [] });
  const original = globalThis.fromUuid;
  globalThis.fromUuid = async () => {
    throw new Error('boom');
  };
  try {
    await assert.doesNotReject(() =>
      mgr._clearSourceFlag('Item.throws', 'recipeItemDefinitionId', 'def-1')
    );
  } finally {
    globalThis.fromUuid = original;
  }
});
