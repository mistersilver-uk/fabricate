/**
 * Tests for CraftingSystemManager.repairItemData — the GM maintenance
 * action behind the settings-menu "Repair Component Sources" button.
 *
 *  1. A world item that IS a component source (matched by identity) is stripped of a
 *     transitive duplicateSource and stamped with flags.fabricate.roles[sys].componentId.
 *  2. Matching is by IDENTITY (own uuid / compendium source), NOT duplicateSource —
 *     an item whose duplicateSource points at a component source is NOT mis-stamped.
 *  3. A stale roles[sys].componentId flag on a non-source item is cleared.
 *  4. An already-correct source item is a no-op.
 *  5. Locked packs are counted+skipped; unlocked packs are processed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

let _idCounter = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `id-${++_idCounter}`,
    getProperty: (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj) ?? undefined,
  },
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.fromUuid = async () => null;

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

function makeRecipeManager() {
  return { getRecipes: () => [], deleteRecipe: async () => {}, updateRecipe: async () => {} };
}

function makeItem({
  uuid,
  name = 'Item',
  duplicateSource = null,
  compendiumSource = null,
  componentFlag = null,
  pack = null,
}) {
  return {
    uuid,
    name,
    pack,
    _stats: { duplicateSource, compendiumSource },
    // Components now carry a per-system durable identity map. getFabricateFlag/
    // setFabricateFlag store at flags.fabricate['fabricate.roles.<sys>.componentId']
    // via getProperty/dotted-key traversal — mirror that nesting here (single system sys1).
    flags: componentFlag
      ? { fabricate: { fabricate: { roles: { sys1: { componentId: componentFlag } } } } }
      : {},
    updates: [],
    async update(patch) {
      this.updates.push(patch);
      if ('_stats.duplicateSource' in patch) {
        this._stats.duplicateSource = patch['_stats.duplicateSource'];
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
}

function buildManager(components, { items = [], packs = [] } = {}) {
  const mgr = new CraftingSystemManager(makeRecipeManager());
  mgr.initialized = true;
  mgr.save = async () => {};
  mgr.systems = new Map([['sys1', { id: 'sys1', name: 'S1', components, recipes: [] }]]);
  globalThis.game = { user: { isGM: true }, items, packs };
  return mgr;
}

const EMBERCAP = {
  id: 'comp-embercap',
  name: 'Embercap Mushroom',
  registeredItemUuid: 'Item.embercap-src',
  originItemUuid: 'Item.embercap-src',
  aliasItemUuids: [],
};

test('repair — strips a transitive duplicateSource and stamps the component id on a source item', async () => {
  const item = makeItem({
    uuid: 'Item.embercap-src',
    name: 'Embercap Mushroom',
    duplicateSource: 'Item.foraged-greens',
  });
  const mgr = buildManager([EMBERCAP], { items: [item] });

  const summary = await mgr.repairItemData();

  assert.equal(summary.stamped, 1);
  assert.equal(summary.stripped, 1);
  assert.equal(item._stats.duplicateSource, null, 'transitive duplicateSource cleared');
  assert.equal(item.getFlag('fabricate', 'fabricate.roles.sys1.componentId'), 'comp-embercap');
});

test('repair — does NOT mis-stamp an item whose duplicateSource merely points at a component source', async () => {
  // Its own identity (uuid Item.other) matches no component; the duplicateSource
  // link must be ignored for attribution.
  const item = makeItem({ uuid: 'Item.other', duplicateSource: 'Item.embercap-src' });
  const mgr = buildManager([EMBERCAP], { items: [item] });

  const summary = await mgr.repairItemData();

  assert.equal(summary.stamped, 0, 'identity-based attribution ignores duplicateSource');
  assert.equal(item.getFlag('fabricate', 'fabricate.roles.sys1.componentId'), undefined);
});

test('repair — clears a stale componentId flag on a non-source item', async () => {
  const item = makeItem({ uuid: 'Item.stale', componentFlag: 'comp-gone' });
  const mgr = buildManager([EMBERCAP], { items: [item] });

  const summary = await mgr.repairItemData();

  assert.equal(summary.cleared, 1);
  assert.equal(item.getFlag('fabricate', 'fabricate.roles.sys1.componentId'), undefined);
});

test('repair — an already-correct source item is a no-op', async () => {
  const item = makeItem({ uuid: 'Item.embercap-src', componentFlag: 'comp-embercap' });
  const mgr = buildManager([EMBERCAP], { items: [item] });

  const summary = await mgr.repairItemData();

  assert.equal(summary.stamped, 0);
  assert.equal(summary.stripped, 0);
  assert.equal(summary.cleared, 0);
  assert.equal(item.updates.length, 0, 'no writes for a clean item');
});

test('repair — skips locked packs and processes unlocked packs', async () => {
  const packItem = makeItem({
    uuid: 'Compendium.world.pack.embercap',
    compendiumSource: 'Item.embercap-src',
    pack: 'world.pack',
  });
  const lockedPack = { documentName: 'Item', locked: true, getDocuments: async () => [] };
  const openPack = { documentName: 'Item', locked: false, getDocuments: async () => [packItem] };

  const mgr = buildManager([EMBERCAP], { items: [], packs: [lockedPack, openPack] });

  const summary = await mgr.repairItemData();

  assert.equal(summary.skippedLocked, 1, 'the locked pack is skipped');
  assert.equal(summary.stamped, 1, 'the unlocked pack item is stamped');
  assert.equal(packItem.getFlag('fabricate', 'fabricate.roles.sys1.componentId'), 'comp-embercap');
});

test('repair — requires GM', async () => {
  const mgr = buildManager([EMBERCAP], { items: [] });
  globalThis.game.user.isGM = false;
  await assert.rejects(() => mgr.repairItemData(), /GM/);
});

// ---------------------------------------------------------------------------
// Description backfill (issue 800) — DEFINITION-driven, not item-driven.
//
// The identity leg above walks ITEMS and skips locked packs, because it writes flags
// INTO pack items. Descriptions only READ, through fromUuid, which resolves a locked
// pack fine — and a locked system pack is exactly where the reported
// `@UUID[Compendium.dnd5e.equipment24.…]` lives. So this leg must NOT ride that walk.
// ---------------------------------------------------------------------------

const LOCKED_PACK_UUID = 'Compendium.dnd5e.equipment24.Item.supplies';

const SUPPLIES = {
  id: 'comp-supplies',
  name: "Alchemist's Supplies",
  registeredItemUuid: LOCKED_PACK_UUID,
  originItemUuid: LOCKED_PACK_UUID,
  aliasItemUuids: [],
  description: '@UUID[Compendium.dnd5e.equipment24.Item.componentpouch]',
};

/**
 * A manager whose only definition is sourced from a LOCKED pack, wired with a fake
 * enricher that resolves that reference to the referenced document's name.
 */
function buildDescriptionRepairManager({ includeCompendiums = true } = {}) {
  const primeCalls = [];
  const mgr = new CraftingSystemManager(makeRecipeManager(), {
    enrichToHtml: async (raw) =>
      raw.replaceAll(
        '@UUID[Compendium.dnd5e.equipment24.Item.componentpouch]',
        '<a class="content-link">Component Pouch</a>'
      ),
    primeEnricherCache: async (rawTexts) => {
      primeCalls.push([...rawTexts]);
    },
  });
  mgr.initialized = true;
  mgr.save = async () => {};
  mgr._notifySystemsChanged = () => {};
  const component = { ...SUPPLIES };
  mgr.systems = new Map([['sys1', { id: 'sys1', name: 'S1', components: [component], recipes: [] }]]);
  // The only pack in the world is LOCKED — the item walk skips it entirely.
  globalThis.game = {
    user: { isGM: true },
    items: [],
    packs: [{ documentName: 'Item', locked: true, getDocuments: async () => [] }],
  };
  globalThis.fromUuid = async (uuid) =>
    uuid === LOCKED_PACK_UUID
      ? { uuid, name: "Alchemist's Supplies", system: { description: { value: SUPPLIES.description } } }
      : null;
  return { mgr, component, primeCalls, run: () => mgr.repairItemData({ includeCompendiums }) };
}

test('repair — refreshes a description whose source lives in a LOCKED pack', async () => {
  const { component, primeCalls, run } = buildDescriptionRepairManager();

  const summary = await run();

  assert.equal(
    component.description,
    'Component Pouch',
    'the reported case: a locked system pack is unreachable by the item walk but ' +
      'resolves fine through fromUuid'
  );
  assert.equal(summary.skippedLocked, 1, 'the identity leg still skips the locked pack');
  assert.equal(summary.descriptions.refreshed, 1);
  assert.equal(summary.descriptions.unchanged, 0);
  assert.equal(primeCalls.length, 1, 'exactly ONE priming call per repair run');
  assert.deepEqual(primeCalls[0], [SUPPLIES.description], 'fed by the single definition sweep');
});

test('repair — refreshes descriptions even with includeCompendiums:false', async () => {
  // That flag gates WRITES into packs; the description leg only reads.
  const { component, run } = buildDescriptionRepairManager({ includeCompendiums: false });

  const summary = await run();

  assert.equal(component.description, 'Component Pouch');
  assert.equal(summary.descriptions.refreshed, 1);
  assert.equal(summary.skippedLocked, 0, 'no pack was visited by the identity leg at all');
});

test('repair — is idempotent: a second run reports unchanged', async () => {
  const { component, run } = buildDescriptionRepairManager();

  await run();
  const second = await run();

  assert.equal(component.description, 'Component Pouch');
  assert.equal(second.descriptions.refreshed, 0);
  assert.equal(second.descriptions.unchanged, 1);
});

test('repair — counts a definition with no resolvable source as skipped, and never wipes text', async () => {
  const { mgr, component, run } = buildDescriptionRepairManager();
  component.registeredItemUuid = 'Item.gone';
  component.originItemUuid = 'Item.gone';
  component.aliasItemUuids = [];
  mgr.systems.get('sys1').components = [component];

  const summary = await run();

  assert.equal(summary.descriptions.skipped, 1);
  assert.equal(component.description, SUPPLIES.description, 'text is never wiped by a repair');
});
