import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { InventoryListingBuilder } from '../src/systems/InventoryListingBuilder.js';
import { findMatchingComponent } from '../src/utils/essenceResolver.js';
import { component, componentSet, roleItem } from './helpers/componentIdentityFixtures.js';

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
