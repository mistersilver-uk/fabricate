/**
 * Issue 561 — first-class Tools acceptance (A1–A9).
 *
 * Every capability/repro here is RED on `28c3ca49` and green after: on pristine `main`
 * there is no `addToolFromUuid` / `autoStampToolSources` / `deleteTool` / `itemIsToolByDurableIdentity`
 * and `Tool.validate()` still requires a `componentId`, so each call throws or the assertion
 * inverts. The crafting acceptance drives the REAL `RecipeManager` / `CraftingEngine` over an
 * installed system (never a bare `resolveToolForItem` call and never a stubbed matcher).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { getProperty, makeWorldItem } from './helpers/writeCapableItemFake.js';
import { tool, roleItem } from './helpers/componentIdentityFixtures.js';

globalThis.foundry = {
  utils: { randomID: () => `id-${Math.random().toString(36).slice(2)}`, getProperty },
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };

const _registry = new Map();
globalThis.fromUuid = async (uuid) => _registry.get(uuid) ?? null;
globalThis.game = {
  user: { isGM: true, id: 'gm-user' },
  users: { activeGM: { id: 'gm-user' } },
  actors: [],
  items: [],
  packs: [],
  fabricate: {},
};

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');
const { Tool } = await import('../src/models/Tool.js');
const { migrateToolsToFirstClass } = await import('../src/migration/migrateToolsToFirstClass.js');
const { migrateExportPayload } = await import('../src/migration/migrateExportPayload.js');

function buildManager() {
  const mgr = new CraftingSystemManager({
    getRecipes: () => [],
    deleteRecipe: async () => {},
    updateRecipe: async () => {},
  });
  mgr.initialized = true;
  mgr.save = async () => {};
  mgr.systems = new Map();
  return mgr;
}

// Wire the manager as the live crafting-system manager the RecipeManager reads.
function installManager(mgr) {
  globalThis.game.fabricate = {
    getCraftingSystemManager: () => mgr,
    getResolutionModeService: () => null,
    getCraftingRunManager: () => null,
    getRecipeVisibilityService: () => null,
  };
}

// ---------------------------------------------------------------------------
// A1 — register a tool directly from an Item uuid with NO component
// ---------------------------------------------------------------------------

test('A1 - addToolFromUuid registers a first-class tool (componentId null) matched through the real RecipeManager', async () => {
  const mgr = buildManager();
  installManager(mgr);
  const system = await mgr.createSystem({ id: 'sysA', name: 'A' });
  const source = makeWorldItem({ uuid: 'Item.hammer-src', name: 'Hammer' });
  _registry.set('Item.hammer-src', source);

  const { item: created } = await mgr.addToolFromUuid('sysA', 'Item.hammer-src');
  // First-class: its own source refs + snapshot and a null component link.
  assert.equal(created.componentId, null);
  assert.equal(created.originItemUuid, 'Item.hammer-src');
  assert.equal(created.name, 'Hammer');
  // The durable `roles[sys].toolId` is stamped on the source Item.
  assert.equal(source.getFlag('fabricate', 'fabricate.roles.sysA.toolId'), created.id);
  // The tool validates with no componentId.
  assert.equal(Tool.fromJSON(created).validate().valid, true);

  // Match THROUGH the real RecipeManager over the installed system (not a bare resolver call).
  const rm = new RecipeManager();
  const recipe = { id: 'r1', craftingSystemId: 'sysA' };
  const owned = roleItem({ uuid: 'Item.owned', roles: { sysA: { toolId: created.id } }, name: 'Hammer' });
  assert.equal(rm.toolMatchesItem(recipe, system.tools[0], owned), true);
  // An unrelated item does not match.
  const unrelated = roleItem({ uuid: 'Item.other', name: 'Spanner' });
  assert.equal(rm.toolMatchesItem(recipe, system.tools[0], unrelated), false);
});

// ---------------------------------------------------------------------------
// A2 — whetstone: a tool + a component on ONE Item coexist without flag clobber
// ---------------------------------------------------------------------------

test('A2 - a component and a tool on one Item keep both roles leaves; deleting the tool spares componentId', async () => {
  const mgr = buildManager();
  installManager(mgr);
  await mgr.createSystem({ id: 'sysA', name: 'A' });
  const source = makeWorldItem({ uuid: 'Item.whetstone', name: 'Whetstone' });
  _registry.set('Item.whetstone', source);

  const { item: comp } = await mgr.addItemFromUuid('sysA', 'Item.whetstone');
  const { item: builtTool } = await mgr.addToolFromUuid('sysA', 'Item.whetstone');

  // BOTH leaves live under one roles[sysA] object.
  assert.equal(source.getFlag('fabricate', 'fabricate.roles.sysA.componentId'), comp.id);
  assert.equal(source.getFlag('fabricate', 'fabricate.roles.sysA.toolId'), builtTool.id);

  // Deleting the tool clears ONLY the toolId leaf; the componentId sibling survives.
  await mgr.deleteTool('sysA', builtTool.id);
  assert.equal(source.getFlag('fabricate', 'fabricate.roles.sysA.toolId'), undefined);
  assert.equal(
    source.getFlag('fabricate', 'fabricate.roles.sysA.componentId'),
    comp.id,
    'the component identity must survive the tool delete (no whole-object clear)'
  );
});

// ---------------------------------------------------------------------------
// A3 — the durable-identity tool-breakage path uses toolId (real matcher)
// ---------------------------------------------------------------------------

test('A3 - breakage selects the durable toolId tool and spares a duplicateSource decoy (still present)', async () => {
  const mgr = buildManager();
  installManager(mgr);
  await mgr.createSystem({ id: 'sysA', name: 'A' });
  const source = makeWorldItem({ uuid: 'Item.hammer-src', name: 'Hammer' });
  _registry.set('Item.hammer-src', source);
  const { item: builtTool } = await mgr.addToolFromUuid('sysA', 'Item.hammer-src');
  const destroyTool = { ...builtTool, breakage: { mode: 'breakageChance', breakageChance: 100 }, onBreak: { mode: 'destroy' } };

  const actorRef = { uuid: 'Actor.a1' };
  const durable = ownedToolItem({ uuid: 'Item.real', roles: { sysA: { toolId: builtTool.id } }, name: 'Hammer', parent: actorRef });
  const decoy = ownedToolItem({ uuid: 'Item.decoy', duplicateSource: 'Item.hammer-src', name: 'Battered', parent: actorRef });

  const engine = new CraftingEngine(new RecipeManager());
  const recipe = { id: 'r1', name: 'R', craftingSystemId: 'sysA' };
  const validation = await engine._validateTools([{ items: [decoy, durable] }], recipe, [destroyTool]);
  assert.equal(validation.valid, true, 'presence still succeeds (decoy or durable satisfies it)');
  await engine._applyToolBreakage(recipe, validation.tools);

  assert.equal(durable.deleted, true, 'the durably-identified tool is broken');
  assert.equal(decoy.deleted, false, 'the duplicateSource decoy is spared');
});

function ownedToolItem(spec) {
  const item = roleItem(spec);
  item.parent = spec.parent ?? null;
  item.deleted = false;
  item.delete = async () => {
    item.deleted = true;
  };
  item.update = async () => {};
  return item;
}

// ---------------------------------------------------------------------------
// A4 — migration converts a componentId-tool without breaking its recipes
// ---------------------------------------------------------------------------

test('A4 - migrateToolsToFirstClass copies component refs onto a legacy tool and is idempotent', () => {
  const systems = [
    {
      id: 'sysA',
      components: [{ id: 'comp-axe', name: 'Axe', img: 'icons/axe.webp', originItemUuid: 'Item.axe', aliasItemUuids: ['Item.axe-old'] }],
      tools: [{ id: 'tool-axe', componentId: 'comp-axe', label: 'Woodaxe' }],
    },
  ];
  migrateToolsToFirstClass(systems);
  const t = systems[0].tools[0];
  assert.equal(t.componentId, 'comp-axe', 'componentId is preserved');
  assert.equal(t.originItemUuid, 'Item.axe');
  assert.deepEqual(t.aliasItemUuids, ['Item.axe-old']);
  assert.equal(t.name, 'Axe');
  assert.equal(t.label, 'Woodaxe', 'the user-authored label is untouched');

  // The migrated tool matches the same owned item (continuity), through the real matcher.
  const mgr = buildManager();
  mgr.systems.set('sysA', mgr._normalizeSystem(systems[0]));
  installManager(mgr);
  const rm = new RecipeManager();
  const recipe = { id: 'r1', craftingSystemId: 'sysA' };
  const owned = roleItem({ uuid: 'Item.copy', compendiumSource: 'Item.axe', name: 'Axe' });
  assert.equal(rm.toolMatchesItem(recipe, mgr.getSystem('sysA').tools[0], owned), true);

  // Idempotent: re-running derives nothing new.
  const snapshot = JSON.stringify(systems);
  migrateToolsToFirstClass(systems);
  assert.equal(JSON.stringify(systems), snapshot);
});

// ---------------------------------------------------------------------------
// Production-path derive: _normalizeSystem derives a component-linked tool's own
// source refs + snapshot from its component (the beyond-delta compatibility bridge).
// This is the ONLY test that routes through the REAL _normalizeSystem call site — a
// wrong impl that drops `deriveToolSourceFromComponents(normalizedTool, items)` ships
// green without it (A4 pre-migrates; the craftability/canvas suites reuse the shared
// helper directly, both bypassing the production call).
// ---------------------------------------------------------------------------

test('_normalizeSystem derives a component-linked tool\'s source refs + snapshot and it matches a source-only copy', () => {
  const mgr = buildManager();
  const normalized = mgr._normalizeSystem({
    id: 'sysD',
    components: [
      { id: 'comp-x', name: 'Chisel', img: 'icons/chisel.webp', originItemUuid: 'Item.chisel', aliasItemUuids: ['Item.chisel-old'] },
    ],
    tools: [{ id: 'tool-x', componentId: 'comp-x' }],
  });
  mgr.systems.set('sysD', normalized);
  installManager(mgr);

  const t = mgr.getSystem('sysD').tools[0];
  assert.equal(t.componentId, 'comp-x', 'the component link is preserved');
  assert.equal(t.originItemUuid, 'Item.chisel', 'derived the component originItemUuid');
  assert.equal(t.registeredItemUuid, 'Item.chisel');
  assert.deepEqual(t.aliasItemUuids, ['Item.chisel-old']);
  assert.equal(t.name, 'Chisel', 'derived the component name snapshot');
  assert.equal(t.img, 'icons/chisel.webp');

  // A source-only owned copy (no durable flag, no name equality) matches ONLY because
  // the tool now carries the derived source ref — so this fails if the derive is dropped.
  const rm = new RecipeManager();
  const recipe = { id: 'r1', craftingSystemId: 'sysD' };
  const sourceOnlyCopy = roleItem({ uuid: 'Item.copy', compendiumSource: 'Item.chisel', name: 'Renamed Chisel' });
  assert.equal(rm.toolMatchesItem(recipe, t, sourceOnlyCopy), true);
});

// ---------------------------------------------------------------------------
// A5 — autoStampToolSources writes roles[sys].toolId; ordering after migration
// ---------------------------------------------------------------------------

test('A5 - autoStampToolSources stamps migration-populated tool refs, skips locked/unresolvable, idempotent', async () => {
  _registry.clear();
  const worldSource = makeWorldItem({ uuid: 'Item.world-tool', name: 'World Tool' });
  const lockedSource = makeWorldItem({ uuid: 'Compendium.locked.pack.x', name: 'Locked', pack: 'locked.pack' });
  _registry.set('Item.world-tool', worldSource);
  _registry.set('Compendium.locked.pack.x', lockedSource);
  globalThis.game.packs = { get: (id) => (id === 'locked.pack' ? { locked: true } : { locked: false }) };

  const mgr = buildManager();
  mgr.systems.set('sysA', {
    id: 'sysA',
    tools: [
      tool('tool-world', { originItemUuid: 'Item.world-tool' }),
      tool('tool-locked', { originItemUuid: 'Compendium.locked.pack.x' }),
      tool('tool-missing', { originItemUuid: 'Item.deleted' }),
    ],
  });

  const summary = await mgr.autoStampToolSources();
  assert.equal(summary.stamped, 1, 'only the writable world source is stamped');
  assert.equal(summary.skippedLocked, 1);
  assert.equal(summary.skippedMissing, 1);
  assert.equal(worldSource.getFlag('fabricate', 'fabricate.roles.sysA.toolId'), 'tool-world');
  assert.equal(lockedSource.getFlag('fabricate', 'fabricate.roles.sysA.toolId'), undefined);

  const second = await mgr.autoStampToolSources();
  assert.equal(second.stamped, 0, 'idempotent — a second run performs zero writes');

  // Ordering: a tool with NO source refs (a stamp-before-migrate world) resolves nothing.
  const preMigrate = buildManager();
  preMigrate.systems.set('sysA', { id: 'sysA', tools: [{ id: 'tool-x', componentId: 'c-x' }] });
  const beforeMigration = await preMigrate.autoStampToolSources();
  assert.equal(beforeMigration.stamped, 0, 'stamp-before-migrate resolves nothing (no source refs yet)');

  globalThis.game.packs = [];
  _registry.clear();
});

// ---------------------------------------------------------------------------
// A6 — a dotted-systemId tool degrades to raw refs, never refuses
// ---------------------------------------------------------------------------

test('A6 - a dotted systemId resolves a tool by raw refs and _toolRoleFlagKey is null (no write, no throw)', async () => {
  const mgr = buildManager();
  const registeredItemUuid = 'Item.dotted-tool';
  mgr.systems.set('my.system', { id: 'my.system', tools: [tool('tool-d', { originItemUuid: registeredItemUuid })] });
  installManager(mgr);

  assert.equal(mgr._toolRoleFlagKey('my.system'), null, 'no durable flag key for a dotted id');

  const rm = new RecipeManager();
  const recipe = { id: 'r1', craftingSystemId: 'my.system' };
  const owned = roleItem({ uuid: registeredItemUuid, name: 'Dotted' });
  // Resolves by raw source references, never throwing/refusing.
  assert.equal(rm.toolMatchesItem(recipe, mgr.getSystem('my.system').tools[0], owned), true);
});

// ---------------------------------------------------------------------------
// A7 — name-fallback split: presence keeps it, breakage never uses it
// ---------------------------------------------------------------------------

test('A7 - a name-only item satisfies presence but is NEVER selected for usage/breakage', () => {
  const mgr = buildManager();
  mgr.systems.set('sysA', {
    id: 'sysA',
    tools: [tool('tool-axe', { originItemUuid: 'Item.axe-src', name: 'Axe' })],
  });
  installManager(mgr);
  const rm = new RecipeManager();
  const recipe = { id: 'r1', craftingSystemId: 'sysA' };
  const t = mgr.getSystem('sysA').tools[0];
  const nameOnly = roleItem({ uuid: 'Item.unrelated', name: 'Axe' });

  assert.equal(rm.toolMatchesItem(recipe, t, nameOnly), true, 'presence: name match is honoured');
  assert.equal(
    rm.toolMatchesItemByIdentity(recipe, t, nameOnly),
    false,
    'breakage: a name-only item is never selected for destruction'
  );
});

// ---------------------------------------------------------------------------
// A8 — canvas item-drop resolves a first-class Tool via resolveToolForItem
// ---------------------------------------------------------------------------

test('A8 - a dropped item-sourced Tool (no component) resolves through firstToolMatch', async () => {
  const { resolveItemUuidToTool } = await import('../src/canvas/interactableItemResolution.js');
  const system = { id: 'sysA', components: [], tools: [tool('tool-chisel', { originItemUuid: 'Item.chisel' })] };
  const dropped = { uuid: 'Item.chisel', _stats: {} };
  const match = resolveItemUuidToTool('Item.chisel', {
    resolveItem: (uuid) => (uuid === 'Item.chisel' ? dropped : null),
    getSystems: () => [system],
  });
  assert.deepEqual(match, { systemId: 'sysA', toolId: 'tool-chisel' });
});

// ---------------------------------------------------------------------------
// A9 — tool repair reconciles the tools bucket via resolveToolForItem
// ---------------------------------------------------------------------------

test('A9 - repairItemData stamps an owned tool copy via the TOOL resolver', async () => {
  const mgr = buildManager();
  mgr.systems.set('sysA', {
    id: 'sysA',
    components: [],
    recipeItemDefinitions: [],
    tools: [tool('tool-axe', { originItemUuid: 'Item.axe-src' })],
  });
  // An owned copy whose compendium source equals the tool's source ref (no durable flag yet).
  const ownedCopy = makeWorldItem({ uuid: 'Item.owned-axe', name: 'Axe', compendiumSource: 'Item.axe-src' });
  // Dispatch-isolation decoy: it carries a LEGACY scalar `flags.fabricate.componentId`
  // equal to a tool id but NO matching source ref. The TOOL resolver has no legacy-scalar
  // tier, so it resolves nothing and this item is never stamped. A wrong impl routing the
  // tools bucket through `resolveComponentForItem` WOULD read the scalar, match `tool-axe`,
  // and mis-stamp it — so the "stays undefined" assertion pins the dispatch.
  const scalarDecoy = makeWorldItem({ uuid: 'Item.scalar-only', name: 'Unrelated' });
  scalarDecoy.flags = { fabricate: { fabricate: { componentId: 'tool-axe' } } };
  const actor = { items: [ownedCopy, scalarDecoy] };
  globalThis.game = {
    user: { isGM: true, id: 'gm-user' },
    users: { activeGM: { id: 'gm-user' } },
    actors: [actor],
    items: [],
    packs: [],
    fabricate: { getCraftingSystemManager: () => mgr },
  };

  const summary = await mgr.repairItemData({ includeCompendiums: false });
  assert.equal(
    ownedCopy.getFlag('fabricate', 'fabricate.roles.sysA.toolId'),
    'tool-axe',
    'the owned tool copy is stamped with the resolved tool id (via resolveToolForItem, not the component resolver)'
  );
  assert.equal(
    scalarDecoy.getFlag('fabricate', 'fabricate.roles.sysA.toolId'),
    undefined,
    'a legacy componentId scalar equal to a tool id is NOT a tool identity — the tool resolver never stamps it (component resolver would)'
  );
  assert.ok(summary.tools.stamped >= 1, 'the tools summary bucket records the stamp');

  globalThis.game = {
    user: { isGM: true, id: 'gm-user' },
    users: { activeGM: { id: 'gm-user' } },
    actors: [],
    items: [],
    packs: [],
    fabricate: {},
  };
});

// ---------------------------------------------------------------------------
// migrateExportPayload upcast + stripTransitionalAliases preservation (D10)
// ---------------------------------------------------------------------------

test('migrateExportPayload upcasts a legacy componentId-only tool with derived refs + snapshot', () => {
  const payload = {
    schemaVersion: 2,
    system: {
      components: [{ id: 'comp-saw', name: 'Saw', img: 'icons/saw.webp', originItemUuid: 'Item.saw' }],
      tools: [{ id: 'tool-saw', componentId: 'comp-saw' }],
    },
    recipes: [],
  };
  const migrated = migrateExportPayload(payload);
  const t = migrated.system.tools[0];
  assert.equal(t.originItemUuid, 'Item.saw');
  assert.equal(t.name, 'Saw');
  assert.equal(t.componentId, 'comp-saw');
  // Idempotent.
  const again = migrateExportPayload(migrated);
  assert.deepEqual(again.system.tools[0], t);
});
