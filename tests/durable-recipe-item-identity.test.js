/**
 * Issue 555 — durable recipe-item identity + clone-safe registration (manager level).
 *
 * Pure-logic over plain fakes (no mounted components). Covers:
 *  - flow 4b: registering a duplicated (compendium-origin) book/component yields a NEW
 *    definition and leaves the original untouched;
 *  - flow 1 double-import dedups to one definition;
 *  - clone registration writes: own-uuid originItemUuid, overwritten flag, stripped
 *    duplicateSource, cleared compendiumSource;
 *  - the skipped branch stamps+strips a pre-flag source;
 *  - union source refs (registeredItemUuid + originItemUuid + fallbacks) resolve both drag routes;
 *  - the normalizer + import-shaped round-trip preserve registeredItemUuid/aliasItemUuids;
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
const { matchRecipeItemDefinition, resolveComponentForItem } = await import('../src/utils/sourceUuid.js');
const { RECIPE_ITEM_FLAG_STAMP_TARGET } = await import('../src/config/settings.js');

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

// Recipe items now carry a per-system durable identity map (issue 567), the third `roles`
// sibling after componentId (#556) and toolId (#561). Read that per-system leaf; every
// single-system fixture here uses the id 'sys'.
function recipeItemFlag(doc, systemId = 'sys') {
  return doc.getFlag('fabricate', `fabricate.roles.${systemId}.recipeItemDefinitionId`);
}

// The retired #555 single scalar `flags.fabricate.recipeItemDefinitionId`, kept only as a
// transitional read-only fallback tier. Used by the legacy-fallback and pre-upgrade tests.
function recipeItemScalarFlag(doc) {
  return doc.getFlag('fabricate', 'fabricate.recipeItemDefinitionId');
}

// Components now carry a per-system durable identity map; every fixture here uses the
// single system id 'sys', so read that per-system leaf.
function componentFlag(doc, systemId = 'sys') {
  return doc.getFlag('fabricate', `fabricate.roles.${systemId}.componentId`);
}

// A leaf helper for the sibling-preservation assertions (issue 567 acceptance #2).
function roleLeaf(doc, systemId, role) {
  return doc.getFlag('fabricate', `fabricate.roles.${systemId}.${role}`);
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
  { id: 'def-book', name: 'Book', originItemUuid: 'Item.book' },
  { id: 'def-scroll', name: 'Scroll', originItemUuid: 'Item.scroll' },
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
  assert.equal(second.item.originItemUuid, 'Item.scroll');
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
  assert.equal(clone.item.registeredItemUuid, 'Item.ore-copy');
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
      // Inherited stale roles-leaf marker from the original — the clone keys on its own
      // uuid, so registration stamps the clone's own def id into the per-system roles leaf.
      flags: { fabricate: { fabricate: { roles: { sys: { recipeItemDefinitionId: 'original-def-id' } } } } },
    })
  );
  const result = await mgr.addRecipeItemFromUuid('sys', 'Item.scroll');

  assert.equal(scroll._stats.duplicateSource, null, 'stale duplicateSource stripped');
  assert.equal(scroll._stats.compendiumSource, null, 'stale compendiumSource cleared');
  assert.equal(recipeItemFlag(scroll), result.item.id, 'per-system roles leaf stamped with the clone def id');
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

test('555 — a compendium-imported book records union source refs (registeredItemUuid + originItemUuid)', async () => {
  resetRegistry();
  register(makeDoc({ uuid: 'Compendium.mod.books.book' }));
  register(makeDoc({ uuid: 'Item.book', compendiumSource: 'Compendium.mod.books.book' }));
  const mgr = buildManager({ systems: [{ id: 'sys', name: 'S', recipeItemDefinitions: [] }] });

  const def = (await mgr.addRecipeItemFromUuid('sys', 'Item.book')).item;
  assert.equal(def.registeredItemUuid, 'Item.book', 'registeredItemUuid is the registered live document');
  assert.equal(def.originItemUuid, 'Compendium.mod.books.book', 'originItemUuid is the canonical compendium uuid');
});

test('555 — the normalizer preserves registeredItemUuid + aliasItemUuids across a save/load round-trip', () => {
  const mgr = buildManager({ systems: [] });
  const normalized = mgr._normalizeRecipeItemDefinition({
    id: 'def1',
    name: 'Book',
    registeredItemUuid: 'Item.book',
    originItemUuid: 'Compendium.mod.books.book',
    aliasItemUuids: ['Item.old', 'Item.book'], // duplicate of a primary is dropped
  });
  assert.equal(normalized.registeredItemUuid, 'Item.book');
  assert.equal(normalized.originItemUuid, 'Compendium.mod.books.book');
  assert.deepEqual(normalized.aliasItemUuids, ['Item.old']);

  // Re-normalizing the serialized shape (import round-trip) preserves the fields.
  const roundTripped = mgr._normalizeRecipeItemDefinition({ ...normalized });
  assert.equal(roundTripped.registeredItemUuid, 'Item.book');
  assert.deepEqual(roundTripped.aliasItemUuids, ['Item.old']);
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
          { id: 'd1', name: 'Book', originItemUuid: 'Item.book' },
          { id: 'd2', name: 'Book2', originItemUuid: 'Compendium.world.pack.book2' },
          { id: 'd3', name: 'Book3', originItemUuid: 'Compendium.mod.pack.book3' },
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
        components: [{ id: 'comp-ore', name: 'Ore', registeredItemUuid: 'Item.ore', originItemUuid: 'Item.ore' }],
        recipeItemDefinitions: [{ id: 'def-book', name: 'Book', originItemUuid: 'Item.book' }],
      },
    ],
    items: [compSource, bookSource],
    actors: [actor],
  });

  const summary = await mgr.repairItemData();
  assert.equal(componentFlag(compSource), 'comp-ore');
  assert.equal(recipeItemFlag(bookSource), 'def-book');
  assert.equal(bookSource._stats.duplicateSource, null, 'clone source stripped');
  assert.equal(recipeItemFlag(ownedBook), 'def-book', 'the actor-owned copy is stamped via the four-tier matcher');
  assert.ok(summary.stamped >= 3);

  const second = await mgr.repairItemData();
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
          { id: 'def-original', name: 'Original', originItemUuid: 'Compendium.mod.books.book' },
        ],
      },
    ],
    items: [cloneSource],
  });

  await mgr.repairItemData();
  assert.equal(recipeItemFlag(cloneSource), undefined, 'the clone source is not mis-stamped with the original id');
});

test('555 R4 name-assist — an owned copy whose unique name matches a different definition is re-pointed, with an audit log', async () => {
  resetRegistry();
  // Owned scroll copy: its transitive duplicateSource points at the BOOK, but its name
  // uniquely matches the SCROLL definition.
  const ownedScroll = makeDoc({ uuid: 'Actor.a.Item.scroll', name: 'Scroll', duplicateSource: 'Item.book' });
  const mgr = ownedRepairManager(BOOK_SCROLL_DEFS, [ownedScroll]);

  const summary = await mgr.repairItemData();
  assert.equal(recipeItemFlag(ownedScroll), 'def-scroll', 're-pointed by unique name to the scroll def');
  assert.equal(summary.repointed, 1);
  assert.deepEqual(summary.repointLog, [
    { itemUuid: 'Actor.a.Item.scroll', oldDuplicateSourceTarget: 'Item.book', newlyStampedDefinitionId: 'def-scroll' },
  ]);
});

test('555/567 R4 name-assist — a name matching TWO definitions WITHIN the system is skipped as ambiguous (no re-point)', async () => {
  resetRegistry();
  // Recipe-item repair is now PER SYSTEM (issue 567), so name uniqueness — and therefore
  // the ambiguity guard — is scoped to the system being reconciled. Two 'Tome' definitions
  // in the SAME system make the name-assist ambiguous.
  const ownedCopy = makeDoc({ uuid: 'Actor.a.Item.dup', name: 'Tome', duplicateSource: 'Item.book' });
  const mgr = ownedRepairManager(
    [
      { id: 'def-book', name: 'Book', originItemUuid: 'Item.book' },
      { id: 'def-tome-1', name: 'Tome', originItemUuid: 'Item.tome1' },
      { id: 'def-tome-2', name: 'Tome', originItemUuid: 'Item.tome2' },
    ],
    [ownedCopy]
  );

  const summary = await mgr.repairItemData();
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
    flags: { fabricate: { fabricate: { roles: { sys: { recipeItemDefinitionId: 'def-book' } } } } },
  });
  const mgr = ownedRepairManager(BOOK_SCROLL_DEFS, [ownedCopy]);

  const summary = await mgr.repairItemData();
  assert.equal(recipeItemFlag(ownedCopy), 'def-book', 'a roles-flagged copy is authoritative');
  assert.equal(summary.repointed, 0);
});

// ---------------------------------------------------------------------------
// _clearSourceFlag (generic, kind-agnostic)
// ---------------------------------------------------------------------------

test('555/567 — _clearSourceFlag unsets a stale recipe-item roles leaf on the old source', async () => {
  resetRegistry();
  const old = register(
    makeDoc({ uuid: 'Item.old', flags: { fabricate: { fabricate: { roles: { sys: { recipeItemDefinitionId: 'def-1' } } } } } })
  );
  const mgr = buildManager({ systems: [] });
  await mgr._clearSourceFlag('Item.old', 'roles.sys.recipeItemDefinitionId', 'def-1');
  assert.equal(recipeItemFlag(old), undefined);
});

test('555/567 — _clearSourceFlag leaves a roles leaf that belongs to a different definition', async () => {
  resetRegistry();
  const other = register(
    makeDoc({ uuid: 'Item.other', flags: { fabricate: { fabricate: { roles: { sys: { recipeItemDefinitionId: 'def-2' } } } } } })
  );
  const mgr = buildManager({ systems: [] });
  await mgr._clearSourceFlag('Item.other', 'roles.sys.recipeItemDefinitionId', 'def-1');
  assert.equal(recipeItemFlag(other), 'def-2', 'a different def id is untouched');
});

// ---------------------------------------------------------------------------
// Matcher drift — both consumers resolve through the ONE shared matcher
// ---------------------------------------------------------------------------

test('555 — RecipeVisibilityService and InventoryListingBuilder resolve identically through the shared matcher', () => {
  const defs = [
    { id: 'def-book', registeredItemUuid: 'Item.book', originItemUuid: 'Compendium.mod.book' },
    { id: 'def-scroll', registeredItemUuid: 'Item.scroll', originItemUuid: 'Item.scroll' },
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
// 567 acceptance #1 — cross-system sibling coexistence, with an ISOLATED reader.
// The load-bearing gap #567 exists to close: a source registered in TWO systems keeps
// a durable per-system claim in EACH (writer half), and a SEPARATE owned copy whose only
// link to A's definition is `roles.A.recipeItemDefinitionId` resolves to A's def in A's
// set — INDEPENDENTLY of the writer half (reader half). Under the retired single scalar
// that copy resolved to NOTHING in A's set (last-writer-wins collision); this test
// supersedes the "555 last writer wins" writer test.
// ---------------------------------------------------------------------------

test('567 #1 — a source shared by two systems keeps a per-system roles leaf in EACH (writer half, no last-writer-wins)', async () => {
  resetRegistry();
  const shared = register(makeDoc({ uuid: 'Item.shared', name: 'Shared Book' }));
  const mgr = buildManager({
    systems: [
      { id: 'sysA', name: 'A', recipeItemDefinitions: [] },
      { id: 'sysB', name: 'B', recipeItemDefinitions: [] },
    ],
  });

  const first = await mgr.addRecipeItemFromUuid('sysA', 'Item.shared');
  assert.equal(recipeItemFlag(shared, 'sysA'), first.item.id, 'system A stamps its own roles leaf');

  const second = await mgr.addRecipeItemFromUuid('sysB', 'Item.shared');
  // Both leaves coexist — B's stamp does NOT overwrite A's (the retired scalar would have).
  assert.equal(recipeItemFlag(shared, 'sysA'), first.item.id, "A's leaf survives B's registration");
  assert.equal(recipeItemFlag(shared, 'sysB'), second.item.id, "B's leaf lands alongside A's");
  assert.notEqual(first.item.id, second.item.id, 'each system owns its own definition');
  // The retired scalar is not written on a fresh registration.
  assert.equal(recipeItemScalarFlag(shared), undefined, 'no legacy scalar is written on a fresh registration');
});

test('567 #1 — a SEPARATE owned copy linked ONLY by roles.A resolves to A\'s def in A\'s set (reader half, isolated)', async () => {
  resetRegistry();
  register(makeDoc({ uuid: 'Item.shared', name: 'Shared Book' }));
  const mgr = buildManager({
    systems: [
      { id: 'sysA', name: 'A', recipeItemDefinitions: [] },
      { id: 'sysB', name: 'B', recipeItemDefinitions: [] },
    ],
  });
  const first = await mgr.addRecipeItemFromUuid('sysA', 'Item.shared');
  const second = await mgr.addRecipeItemFromUuid('sysB', 'Item.shared');
  const sysADefs = mgr.getSystem('sysA').recipeItemDefinitions;
  const sysBDefs = mgr.getSystem('sysB').recipeItemDefinitions;
  const defA = sysADefs[0];
  const defB = sysBDefs[0];

  // The reader fixture: a SEPARATE owned copy whose ONLY link to A's definition is
  // `roles.sysA.recipeItemDefinitionId`. It carries NO uuid / compendiumSource /
  // duplicateSource intersecting A's def source refs (so tiers 2/3/4 cannot resolve it in
  // A's set), and its legacy scalar names B's def (ABSENT from A's set) so the scalar tier
  // ALSO falls through in A's set. Mirrors the tools suite's scalarDecoy dispatch-isolation.
  const readerCopy = makeDoc({
    uuid: 'Actor.x.Item.readerCopy',
    name: 'Reader Copy',
    flags: {
      fabricate: {
        fabricate: {
          roles: { sysA: { recipeItemDefinitionId: defA.id }, sysB: { recipeItemDefinitionId: defB.id } },
          // Legacy scalar names B's def — out of A's candidate set, so on scalar-only the
          // reader falls through to NOTHING in A's set (independently RED without #567).
          recipeItemDefinitionId: defB.id,
        },
      },
    },
  });

  // Sanity: the reader shares NO source ref with A's definition (tiers 2/3/4 isolated).
  const { getItemMatchUuids } = await import('../src/utils/sourceUuid.js');
  const aRefs = new Set(getItemMatchUuids(defA));
  assert.ok(!aRefs.has('Actor.x.Item.readerCopy'), 'reader uuid is not in A\'s source refs');

  // Reader half (THE independently-red assertion): resolves to A's def via the roles tier.
  const inA = matchRecipeItemDefinition(readerCopy, sysADefs, 'sysA');
  assert.equal(inA.definition, defA, 'reader resolves to A\'s definition via roles.sysA');
  assert.equal(inA.tier, 'identity', 'resolved through the durable identity tier');

  // Coexistence: the same copy resolves to B's def in B's set via roles.sysB.
  assert.equal(
    matchRecipeItemDefinition(readerCopy, sysBDefs, 'sysB').definition,
    defB,
    'the same copy resolves to B\'s definition in B\'s set via roles.sysB'
  );

  // Cross-check: under the wrong system id the roles tier finds nothing, and the isolated
  // source refs cannot resolve it either — so it resolves to null, proving the isolation.
  assert.equal(
    matchRecipeItemDefinition(readerCopy, sysADefs, 'sysB').definition,
    null,
    'reader shares no source ref with A\'s def, so a non-A roles scope resolves NOTHING in A\'s set (proves tiers 2/3/4 are isolated)'
  );
});

// ---------------------------------------------------------------------------
// Gap-closing tests (post-review): updated-branch re-point, tier-3 owned copy,
// component both-routes, deleted-source branches
// ---------------------------------------------------------------------------

test('555 — addRecipeItemFromUuid updated branch clears the flag on the OLD source when originItemUuid drifts', async () => {
  resetRegistry();
  // A non-clone source whose stored originItemUuid has drifted (the definition still
  // points at an old world source) but which carries the durable roles leaf, so
  // find-existing resolves it by that leaf and the updated branch re-points it.
  register(makeDoc({ uuid: 'Item.old-source', name: 'Book', flags: { fabricate: { fabricate: { roles: { sys: { recipeItemDefinitionId: 'def-1' } } } } } }));
  register(makeDoc({ uuid: 'Item.book', name: 'Book', flags: { fabricate: { fabricate: { roles: { sys: { recipeItemDefinitionId: 'def-1' } } } } } }));
  const mgr = buildManager({
    systems: [
      { id: 'sys', name: 'S', recipeItemDefinitions: [{ id: 'def-1', name: 'Book', registeredItemUuid: 'Item.old-source', originItemUuid: 'Item.old-source' }] },
    ],
  });

  const result = await mgr.addRecipeItemFromUuid('sys', 'Item.book');
  assert.equal(result.action, 'updated', 'the drifted source re-registers through the updated branch');
  assert.equal(firstSystem(mgr).recipeItemDefinitions[0].originItemUuid, 'Item.book', 'the definition re-points to the new source');
  assert.equal(recipeItemFlag(_registry.get('Item.old-source')), undefined, 'the OLD source roles leaf is cleared on re-point');
  assert.equal(recipeItemFlag(_registry.get('Item.book')), 'def-1', 'the new source keeps the roles leaf');
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
    [{ id: 'def-book', name: 'Book', registeredItemUuid: 'Item.book', originItemUuid: 'Compendium.mod.book' }],
    [ownedCopy]
  );

  const summary = await mgr.repairItemData();
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
  assert.equal(resolveComponentForItem(fromCompendium, [component], 'sys'), component, 'the compendium-drag copy matches');
  assert.equal(resolveComponentForItem(fromWorldItem, [component], 'sys'), component, 'the world-item-drag copy matches');
});

test('555 R3 — auto-stamp counts a definition whose source item no longer resolves as skippedMissing', async () => {
  resetRegistry(); // empty registry → fromUuid returns null for the deleted source
  const mgr = buildManager({
    systems: [{ id: 'sys', name: 'S', recipeItemDefinitions: [{ id: 'd1', name: 'Gone', originItemUuid: 'Item.deleted' }] }],
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
      mgr._clearSourceFlag('Item.throws', 'roles.sys.recipeItemDefinitionId', 'def-1')
    );
  } finally {
    globalThis.fromUuid = original;
  }
});

// ---------------------------------------------------------------------------
// 567 acceptance #2 — a recipe-item leaf clear removes ONLY that leaf and preserves the
// sibling componentId/toolId leaves, at BOTH clear sites.
// ---------------------------------------------------------------------------

test('567 #2 — the addRecipeItemFromUuid re-point clears ONLY the recipe-item leaf, preserving sibling componentId/toolId', async () => {
  resetRegistry();
  // The old source carries all three role leaves; only the recipe-item leaf must be cleared
  // on re-point. The new source carries the recipe-item leaf so find-existing resolves it.
  register(makeDoc({
    uuid: 'Item.old-source',
    name: 'Book',
    flags: { fabricate: { fabricate: { roles: { sys: { componentId: 'comp-x', toolId: 'tool-x', recipeItemDefinitionId: 'def-1' } } } } },
  }));
  register(makeDoc({
    uuid: 'Item.new-source',
    name: 'Book',
    flags: { fabricate: { fabricate: { roles: { sys: { recipeItemDefinitionId: 'def-1' } } } } },
  }));
  const mgr = buildManager({
    systems: [
      { id: 'sys', name: 'S', recipeItemDefinitions: [{ id: 'def-1', name: 'Book', registeredItemUuid: 'Item.old-source', originItemUuid: 'Item.old-source' }] },
    ],
  });

  const result = await mgr.addRecipeItemFromUuid('sys', 'Item.new-source');
  assert.equal(result.action, 'updated', 'the drifted source re-registers through the updated branch');
  const old = _registry.get('Item.old-source');
  assert.equal(roleLeaf(old, 'sys', 'recipeItemDefinitionId'), undefined, 'the recipe-item leaf is cleared on the old source');
  assert.equal(roleLeaf(old, 'sys', 'componentId'), 'comp-x', 'the sibling componentId leaf is preserved');
  assert.equal(roleLeaf(old, 'sys', 'toolId'), 'tool-x', 'the sibling toolId leaf is preserved');
});

test('567 #2 — the repair owner-null branch clears ONLY the recipe-item leaf, preserving sibling componentId/toolId', async () => {
  resetRegistry();
  // Item.orphan is a legit component AND tool source (so those leaves are re-affirmed, not
  // cleared), but its recipe-item leaf names a def that no longer exists in the set, so the
  // recipeItems owner-null branch clears ONLY that leaf.
  const orphan = makeDoc({
    uuid: 'Item.orphan',
    name: 'Whetstone',
    flags: { fabricate: { fabricate: { roles: { sys: { componentId: 'comp-x', toolId: 'tool-x', recipeItemDefinitionId: 'def-gone' } } } } },
  });
  const mgr = buildManager({
    systems: [
      {
        id: 'sys',
        name: 'S',
        components: [{ id: 'comp-x', name: 'X', registeredItemUuid: 'Item.orphan', originItemUuid: 'Item.orphan' }],
        tools: [{ id: 'tool-x', name: 'T', originItemUuid: 'Item.orphan' }],
        recipeItemDefinitions: [{ id: 'def-real', name: 'R', originItemUuid: 'Item.other' }],
      },
    ],
    items: [orphan],
  });

  await mgr.repairItemData();
  assert.equal(roleLeaf(orphan, 'sys', 'recipeItemDefinitionId'), undefined, 'the stale recipe-item leaf is cleared');
  assert.equal(roleLeaf(orphan, 'sys', 'componentId'), 'comp-x', 'the sibling componentId leaf is preserved');
  assert.equal(roleLeaf(orphan, 'sys', 'toolId'), 'tool-x', 'the sibling toolId leaf is preserved');
});

// ---------------------------------------------------------------------------
// 567 acceptance #3 — a dotted/unsafe systemId degrades (no throw), warning once.
// ---------------------------------------------------------------------------

test('567 #3 — a dotted systemId does not throw and degrades to the source-uuid tiers, warning once', () => {
  const defs = [{ id: 'd1', name: 'Book', originItemUuid: 'Item.x' }];
  // A copy whose durable link would be a roles leaf, but the dotted id can never be a map
  // key: it resolves via the source-uuid tier instead of throwing.
  const copy = makeDoc({ uuid: 'Item.x', name: 'Book' });
  const origWarn = console.warn;
  let warnCount = 0;
  console.warn = () => {
    warnCount += 1;
  };
  try {
    let match;
    assert.doesNotThrow(() => {
      match = matchRecipeItemDefinition(copy, defs, 'dotted.sys.567');
    });
    assert.equal(match.definition, defs[0], 'resolves via the source-uuid tier');
    assert.equal(match.tier, 'uuid', 'the durable tier is skipped for a dotted id');
    // A second call for the SAME dotted id must not warn again (warn-once per system).
    matchRecipeItemDefinition(copy, defs, 'dotted.sys.567');
    assert.equal(warnCount, 1, 'warns at most once per offending system id');
  } finally {
    console.warn = origWarn;
  }
});

// ---------------------------------------------------------------------------
// 567 acceptance #4 — the restamp target bumped 1 → 2 (v1 worlds re-run) and is idempotent.
// The primary-GM gate lives in `runRecipeItemFlagAutoStamp` (src/main.js), version-keyed by
// `RECIPE_ITEM_FLAG_STAMP_VERSION`; here we pin the target and the idempotency of the pass.
// ---------------------------------------------------------------------------

test('567 #4 — RECIPE_ITEM_FLAG_STAMP_TARGET is 2 so a v1-stamped world re-runs the roles backfill', () => {
  assert.equal(RECIPE_ITEM_FLAG_STAMP_TARGET, 2, 'the restamp target is bumped 1 → 2 for the roles backfill');
});

test('567 #4 — autoStampRecipeItemSources is idempotent: a second run performs zero writes', async () => {
  resetRegistry();
  const worldBook = register(makeDoc({ uuid: 'Item.book', name: 'Book' }));
  const mgr = buildManager({
    systems: [{ id: 'sys', name: 'S', recipeItemDefinitions: [{ id: 'd1', name: 'Book', originItemUuid: 'Item.book' }] }],
  });

  const first = await mgr.autoStampRecipeItemSources();
  assert.equal(recipeItemFlag(worldBook), 'd1', 'the roles leaf is backfilled');
  assert.ok(first.stamped >= 1);

  const second = await mgr.autoStampRecipeItemSources();
  assert.equal(second.stamped, 0, 'a second run performs zero writes (idempotent)');
  assert.equal(second.stripped, 0);
});

// ---------------------------------------------------------------------------
// 567 acceptance #5 — the restamp path lands BOTH per-system leaves for a shared source.
// ---------------------------------------------------------------------------

test('567 #5 — autoStampRecipeItemSources stamps BOTH roles.A and roles.B for a source registered in two systems', async () => {
  resetRegistry();
  const shared = register(makeDoc({ uuid: 'Item.shared', name: 'Shared Book' }));
  const mgr = buildManager({
    systems: [
      { id: 'sysA', name: 'A', recipeItemDefinitions: [{ id: 'defA', name: 'Shared Book', originItemUuid: 'Item.shared' }] },
      { id: 'sysB', name: 'B', recipeItemDefinitions: [{ id: 'defB', name: 'Shared Book', originItemUuid: 'Item.shared' }] },
    ],
  });

  await mgr.autoStampRecipeItemSources();
  assert.equal(recipeItemFlag(shared, 'sysA'), 'defA', 'the roles.A leaf is stamped');
  assert.equal(recipeItemFlag(shared, 'sysB'), 'defB', 'the roles.B leaf is stamped alongside it');
});

// ---------------------------------------------------------------------------
// 567 acceptance #6 — legacy behaviour preserved: the id-less synthetic legacy/alchemy link
// still resolves via the source-uuid tiers (and keeps its null id for the bulk-learn guard),
// and a pre-upgrade owned copy carrying ONLY the legacy scalar still resolves.
// ---------------------------------------------------------------------------

test('567 #6 — an id-less synthetic legacy link resolves via the source-uuid tier and keeps a null id', () => {
  const synthetic = { id: null, originItemUuid: 'Item.legacy' };
  const item = { uuid: 'Item.legacy', _stats: {}, getFlag: () => undefined };
  const match = matchRecipeItemDefinition(item, [synthetic], 'sys');
  assert.equal(match.definition, synthetic, 'the id-less synthetic entry resolves via source uuid');
  assert.equal(match.tier, 'uuid', 'through the source-uuid tier, never the durable identity tier');
  assert.equal(match.definition.id, null, 'its null id leaves the bulk auto-learn guard untouched');
});

test('567 #6 — a pre-upgrade owned copy carrying ONLY the legacy scalar still resolves via the legacy fallback tier', () => {
  const defs = [{ id: 'def-book', name: 'Book', originItemUuid: 'Compendium.mod.book' }];
  // Carries ONLY the retired scalar (no roles leaf), and NO source ref intersecting the def.
  const copy = makeDoc({
    uuid: 'Actor.a.Item.preupgrade',
    name: 'Book',
    flags: { fabricate: { fabricate: { recipeItemDefinitionId: 'def-book' } } },
  });
  const match = matchRecipeItemDefinition(copy, defs, 'sys');
  assert.equal(match.definition, defs[0], 'the scalar-only copy resolves via the transitional legacy fallback');
  assert.equal(match.tier, 'identity', 'reported as the durable identity tier');
});
