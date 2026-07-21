import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { InventoryListingBuilder } from '../src/systems/InventoryListingBuilder.js';
import { findMatchingComponent } from '../src/utils/essenceResolver.js';
import { component, componentSet, roleItem } from './helpers/componentIdentityFixtures.js';
import {
  SYS_A,
  SYS_B,
  rolesDocument,
  salvageComponent,
  salvageSystem,
} from './helpers/inventoryCollapseFixtures.js';

// Regression coverage for issue 538: a single owned item that carries a durable
// component identity (a `roles[systemId].componentId` claim, or the legacy flat
// `componentId` scalar) must NOT also loosely name-match same-named components in
// OTHER crafting systems — that name-fallback cross-match projected the one item as a
// duplicate inventory row per system (Smith's Tools / Charcoal / Iron Ingot).

const SYSTEM_A = 'masterwork-armory';
const SYSTEM_B = 'mythwright';
const SYSTEM_C = 'runesmiths-forge';

function makeBuilder(systemList) {
  const recipeManager = { getRecipes: () => [] };
  const craftingSystemManager = { getSystems: () => systemList };
  return new InventoryListingBuilder({
    recipeManager,
    craftingSystemManager,
    localize: (key) => key,
    nowWorldTime: () => 0,
  });
}

// A same-named component ("Smith's Tools") defined independently in three systems.
function smithsToolsSystem(systemId) {
  return {
    id: systemId,
    name: systemId,
    enableEssences: false,
    components: [
      { id: `${systemId}-smiths-tools`, name: "Smith's Tools", img: null, essences: {} },
    ],
    tools: [],
  };
}

describe('InventoryListingBuilder — cross-system name-fallback duplicates (issue 538)', () => {
  it('projects a durably-flagged owned item ONCE, in its flagged system only', () => {
    const systems = [
      smithsToolsSystem(SYSTEM_A),
      smithsToolsSystem(SYSTEM_B),
      smithsToolsSystem(SYSTEM_C),
    ];
    const builder = makeBuilder(systems);

    // One physical Smith's Tools, durably flagged to System A's component only.
    const owned = roleItem({
      name: "Smith's Tools",
      quantity: 1,
      roles: { [SYSTEM_A]: { componentId: `${SYSTEM_A}-smiths-tools` } },
    });
    const actor = { id: 'a1', name: 'Akra', img: null, items: [owned] };

    const listing = builder.buildListing({ craftingActor: actor });
    const rows = listing.rows.filter((row) => !row.isEssenceSource);

    assert.equal(rows.length, 1, 'the one owned item must produce exactly one row');
    assert.equal(rows[0].systemId, SYSTEM_A);
    assert.equal(rows[0].componentId, `${SYSTEM_A}-smiths-tools`);
    assert.equal(listing.counts.components, 1);
  });

  it('still name-matches an UNFLAGGED item (pre-identity compatibility path, issue 540)', () => {
    // No identity flag at all → the legacy name fallback still applies within a system.
    const systems = [smithsToolsSystem(SYSTEM_A)];
    const builder = makeBuilder(systems);
    const owned = { name: "Smith's Tools", system: { quantity: 1 }, items: undefined };
    const actor = { id: 'a1', name: 'Akra', img: null, items: [owned] };

    const listing = builder.buildListing({ craftingActor: actor });
    const rows = listing.rows.filter((row) => !row.isEssenceSource);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].componentId, `${SYSTEM_A}-smiths-tools`);
  });
});

describe('findMatchingComponent — identity flag suppresses cross-system name match (issue 538)', () => {
  it('returns null in a foreign system for an item flagged via the roles map', () => {
    const foreign = componentSet(SYSTEM_B, [
      component(`${SYSTEM_B}-smiths-tools`, { name: "Smith's Tools" }),
    ]).components;
    const item = roleItem({
      name: "Smith's Tools",
      roles: { [SYSTEM_A]: { componentId: `${SYSTEM_A}-smiths-tools` } },
    });
    assert.equal(findMatchingComponent(item, foreign, SYSTEM_B), null);
  });

  it('returns null in a foreign system for an item flagged via the legacy scalar', () => {
    const foreign = componentSet(SYSTEM_B, [
      component(`${SYSTEM_B}-smiths-tools`, { name: "Smith's Tools" }),
    ]).components;
    const item = roleItem({ name: "Smith's Tools", componentId: `${SYSTEM_A}-smiths-tools` });
    assert.equal(findMatchingComponent(item, foreign, SYSTEM_B), null);
  });

  it('still name-matches an item with NO identity flag', () => {
    const set = componentSet(SYSTEM_B, [
      component(`${SYSTEM_B}-smiths-tools`, { name: "Smith's Tools" }),
    ]).components;
    const item = { name: "Smith's Tools" };
    const matched = findMatchingComponent(item, set, SYSTEM_B);
    assert.equal(matched?.id, `${SYSTEM_B}-smiths-tools`);
  });

  it('resolves the flagged item in its OWN system by the durable tier', () => {
    const own = componentSet(SYSTEM_A, [
      component(`${SYSTEM_A}-smiths-tools`, { name: "Smith's Tools" }),
    ]).components;
    const item = roleItem({
      name: "Smith's Tools",
      roles: { [SYSTEM_A]: { componentId: `${SYSTEM_A}-smiths-tools` } },
    });
    const matched = findMatchingComponent(item, own, SYSTEM_A);
    assert.equal(matched?.id, `${SYSTEM_A}-smiths-tools`);
  });
});

// A component-tag matcher unaware fake: components own an item only via the durable
// `roles` map here, so quantities are attributable per physical document.
function collapseBuilder(systemList) {
  const recipeManager = { getRecipes: () => [] };
  const craftingSystemManager = { getSystems: () => systemList };
  return new InventoryListingBuilder({
    recipeManager,
    craftingSystemManager,
    localize: (key) => key,
    nowWorldTime: () => 0,
  });
}

function componentRows(listing) {
  return listing.rows.filter((row) => !row.isEssenceSource && !row.isRecipeItem);
}

describe('InventoryListingBuilder — one card per unified physical stack (issue 766)', () => {
  it('counts a stack flagged into two systems ONCE (quantity-once, never N×)', () => {
    const systems = [
      salvageSystem(SYS_A, [salvageComponent('cA', 'Air Shard')]),
      salvageSystem(SYS_B, [salvageComponent('cB', 'Air Shard')]),
    ];
    const builder = collapseBuilder(systems);
    // ONE physical document (uuid), stack quantity 2, backing a component in BOTH systems.
    const doc = rolesDocument({ uuid: 'Item.air-1', quantity: 2, componentA: 'cA', componentB: 'cB' });
    const listing = builder.buildListing({
      craftingActor: { id: 'a1', name: 'Akra', img: null, items: [doc] },
    });

    const rows = componentRows(listing);
    assert.equal(rows.length, 1, 'the two participations collapse to one card');
    assert.equal(rows[0].totalQuantity, 2, 'the physical stack is counted once');
    assert.notEqual(rows[0].totalQuantity, 4, 'and NEVER doubled across systems');
    assert.equal(listing.counts.components, 1);
    // Both systems are reachable via the participation array.
    assert.deepEqual(
      rows[0].systems.map((entry) => entry.systemId).sort(),
      [SYS_A, SYS_B]
    );
  });

  it('still aggregates one component held by two source actors into one card (multi-actor)', () => {
    const systems = [salvageSystem(SYS_A, [salvageComponent('cA', 'Iron')])];
    const builder = collapseBuilder(systems);
    const character = rolesDocument({ uuid: 'Item.iron-char', quantity: 2, componentA: 'cA' });
    const stash = rolesDocument({ uuid: 'Item.iron-stash', quantity: 3, componentA: 'cA' });
    const listing = builder.buildListing({
      craftingActor: { id: 'a1', name: 'Akra', img: null, items: [character] },
      componentSourceActors: [{ id: 'a2', name: 'Party Stash', img: null, items: [stash] }],
    });

    const rows = componentRows(listing);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].sources.length, 2, 'both source actors listed');
    assert.equal(rows[0].totalQuantity, 5, 'summed across actors (2 + 3)');
  });

  it('sums two distinct documents of one component on one actor into one card', () => {
    const systems = [salvageSystem(SYS_A, [salvageComponent('cA', 'Iron')])];
    const builder = collapseBuilder(systems);
    const docOne = rolesDocument({ uuid: 'Item.iron-a', quantity: 2, componentA: 'cA' });
    const docTwo = rolesDocument({ uuid: 'Item.iron-b', quantity: 3, componentA: 'cA' });
    const listing = builder.buildListing({
      craftingActor: { id: 'a1', name: 'Akra', img: null, items: [docOne, docTwo] },
    });

    const rows = componentRows(listing);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].sources.length, 1, 'one actor');
    assert.equal(rows[0].totalQuantity, 5, 'two distinct documents summed (2 + 3)');
  });

  it('joins divergent roles by intersecting documents, scoping each participation to ITS OWN docs', () => {
    // doc1 backs the component in BOTH systems; doc2 backs it in System A ONLY. Both
    // resolve to the same-named component and share an actor. They form ONE card whose
    // System-A participation owns {doc1, doc2} and whose System-B participation owns
    // {doc1} — B cannot consume doc2's stock.
    const systems = [
      salvageSystem(SYS_A, [salvageComponent('cA', 'Air Shard')]),
      salvageSystem(SYS_B, [salvageComponent('cB', 'Air Shard')]),
    ];
    const builder = collapseBuilder(systems);
    const doc1 = rolesDocument({ uuid: 'Item.air-1', quantity: 2, componentA: 'cA', componentB: 'cB' });
    const doc2 = rolesDocument({ uuid: 'Item.air-2', quantity: 3, componentA: 'cA' });
    const listing = builder.buildListing({
      craftingActor: { id: 'a1', name: 'Akra', img: null, items: [doc1, doc2] },
    });

    const rows = componentRows(listing);
    assert.equal(rows.length, 1, 'one card despite divergent roles');
    assert.equal(rows[0].totalQuantity, 5, 'card union counts each physical stack once (2 + 3)');
    const bySystem = new Map(rows[0].systems.map((entry) => [entry.systemId, entry]));
    assert.equal(bySystem.get(SYS_A).ownedQuantity, 5, 'System A owns doc1 + doc2');
    assert.equal(bySystem.get(SYS_B).ownedQuantity, 2, 'System B owns doc1 only');
  });

  it('keeps two DIFFERENT-component documents distinct even when they share a source template', () => {
    // Two distinct documents (distinct uuids) that share a compendium/duplicate source but
    // resolve to DIFFERENT components must stay TWO cards — proving the collapse key is the
    // per-document uuid, not the shared source-reference union.
    const systems = [
      salvageSystem(SYS_A, [
        salvageComponent('cX', 'Air Shard'),
        salvageComponent('cY', 'Water Shard'),
      ]),
    ];
    const builder = collapseBuilder(systems);
    const docX = roleItem({
      uuid: 'Item.x',
      quantity: 2,
      compendiumSource: 'Compendium.shared.Item.template',
      duplicateSource: 'Item.template-world',
      roles: { [SYS_A]: { componentId: 'cX' } },
    });
    const docY = roleItem({
      uuid: 'Item.y',
      quantity: 4,
      compendiumSource: 'Compendium.shared.Item.template',
      duplicateSource: 'Item.template-world',
      roles: { [SYS_A]: { componentId: 'cY' } },
    });
    const listing = builder.buildListing({
      craftingActor: { id: 'a1', name: 'Akra', img: null, items: [docX, docY] },
    });

    const rows = componentRows(listing);
    assert.equal(rows.length, 2, 'distinct components stay distinct despite a shared template');
    const byComponent = new Map(rows.map((row) => [row.componentId, row]));
    assert.equal(byComponent.get('cX').totalQuantity, 2);
    assert.equal(byComponent.get('cY').totalQuantity, 4);
  });

  it('unions essence pips across participations, deduped by essence id', () => {
    const systems = [
      salvageSystem(
        SYS_A,
        [salvageComponent('cA', 'Air Shard', { essences: { fire: 1 } })],
        { enableEssences: true, essenceDefinitions: [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }] }
      ),
      salvageSystem(
        SYS_B,
        [salvageComponent('cB', 'Air Shard', { essences: { fire: 2 } })],
        { enableEssences: true, essenceDefinitions: [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }] }
      ),
    ];
    const builder = collapseBuilder(systems);
    const doc = rolesDocument({ uuid: 'Item.air-1', quantity: 1, componentA: 'cA', componentB: 'cB' });
    const listing = builder.buildListing({
      craftingActor: { id: 'a1', name: 'Akra', img: null, items: [doc] },
    });

    const rows = componentRows(listing);
    assert.equal(rows.length, 1);
    const firePips = rows[0].essences.filter((pip) => pip.id === 'fire');
    assert.equal(firePips.length, 1, 'the shared essence id yields exactly one pip');
  });

  it('biases the primary participation to a salvageable one', () => {
    // System A's component is NOT salvageable; System B's is. The primary (and so the
    // card's top-level salvage + recycle badge) must be System B's participation.
    const systems = [
      salvageSystem(SYS_A, [
        { id: 'cA', name: 'Air Shard', img: 'icons/cA.webp', tags: [], essences: {} },
      ]),
      salvageSystem(SYS_B, [salvageComponent('cB', 'Air Shard')]),
    ];
    const builder = collapseBuilder(systems);
    const doc = rolesDocument({ uuid: 'Item.air-1', quantity: 1, componentA: 'cA', componentB: 'cB' });
    const listing = builder.buildListing({
      craftingActor: { id: 'a1', name: 'Akra', img: null, items: [doc] },
    });

    const rows = componentRows(listing);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].systemId, SYS_B, 'primary is the salvageable participation');
    assert.equal(rows[0].salvage?.enabled, true);
  });
});
