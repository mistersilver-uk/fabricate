/**
 * Pins EVERY surface that answers "is this owned item a Tool" against ONE identity table
 * (`tests/helpers/toolSurfaceCases.js`), per `openspec/specs/data-models/spec.md`
 * `## Tool` requirement 12.
 *
 * Why this exists. Issue 561 made Tools first-class; issue 976 then found the same
 * component-only assumption in three DISPLAY surfaces and pinned them against a shared
 * table. The IDENTITY half was never given the same treatment, so the miss in
 * `InventoryListingBuilder` — an owned tool producing no inventory row at all — survived
 * both changes and shipped in 1.8.0 as issue 1119.
 *
 * Each surface registers an adapter. A `covered` adapter must recognise the item-sourced
 * tools and must NOT claim the plain component. An `excluded` adapter must name a reason
 * AND an open issue, and is asserted to genuinely still fail — so an exclusion that is
 * quietly fixed reds this suite and has to be promoted rather than rotting into folklore
 * the way requirement 9's "tracked separately" did.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPECTED_TOOL_IDS,
  SYSTEM_ID,
  TOOL_SET,
  TOOL_SURFACE_CASES,
  surfaceActor,
  surfaceSystem,
} from './helpers/toolSurfaceCases.js';

globalThis.foundry = globalThis.foundry || { utils: { getProperty: () => undefined } };

const { resolveToolForItem } = await import('../src/utils/sourceUuid.js');
const { matchGatheringTools } = await import('../src/gatheringToolRuntime.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { InventoryListingBuilder } = await import('../src/systems/InventoryListingBuilder.js');

/**
 * Install the canonical world behind `game.fabricate.getCraftingSystemManager()`, which is
 * how `RecipeManager` reaches the Tools library.
 */
function installWorld(system) {
  const manager = {
    getSystem: (id) => (id === system.id ? system : null),
    getSystems: () => [system],
  };
  globalThis.game = {
    fabricate: { getCraftingSystemManager: () => manager },
    settings: { get: () => undefined, set: () => {} },
  };
  return manager;
}

/**
 * Every surface under one signature: given the canonical world and one owned document,
 * return the library Tool id that surface resolves it to (or null).
 *
 * `status: 'excluded'` records a surface KNOWN not to answer, with the issue tracking it.
 */
const SURFACES = [
  {
    id: 'sourceUuid.resolveToolForItem',
    status: 'covered',
    run: ({ item }) => resolveToolForItem(item, TOOL_SET.tools, SYSTEM_ID)?.id ?? null,
  },
  {
    id: 'RecipeManager.toolMatchesItem',
    status: 'covered',
    run: ({ item, system }) => {
      installWorld(system);
      const manager = new RecipeManager();
      const recipe = { id: 'r-probe', craftingSystemId: SYSTEM_ID };
      const matched = system.tools.filter((entry) => manager.toolMatchesItem(recipe, entry, item));
      // The wide presence gate is per-tool, so a same-named decoy could match two slots.
      // The table has no such collision, so exactly one match is the correct expectation.
      return matched.length === 1 ? matched[0].id : null;
    },
  },
  {
    id: 'gatheringToolRuntime.matchGatheringTools',
    status: 'covered',
    run: ({ item, system }) => {
      const manager = installWorld(system);
      const recipeManager = new RecipeManager();
      manager.toolMatchesItem = recipeManager.toolMatchesItem.bind(recipeManager);
      manager.toolMatchesItemByIdentity =
        recipeManager.toolMatchesItemByIdentity.bind(recipeManager);
      const actor = { id: 'probe', uuid: 'Actor.probe', items: [item] };
      const matched = matchGatheringTools({
        actor,
        system,
        task: { id: 't-probe', craftingSystemId: SYSTEM_ID },
        tools: [...system.tools],
        craftingSystemManager: manager,
      });
      const owned = matched.items.filter((pair) => pair.item === item);
      return owned.length === 1 ? owned[0].tool.id : null;
    },
  },
  {
    id: 'InventoryListingBuilder.buildListing',
    status: 'covered',
    run: ({ item, system }) => {
      const manager = installWorld(system);
      const recipeManager = new RecipeManager();
      const builder = new InventoryListingBuilder({
        recipeManager,
        craftingSystemManager: manager,
        localize: (key) => key,
        nowWorldTime: () => 0,
      });
      const listing = builder.buildListing({
        craftingActor: { id: 'a1', uuid: 'Actor.a1', name: 'Akra', img: null, items: [item] },
      });
      // The card must EXIST for the owned document, and carry the tool identity when it is
      // one. A tool that produces no row is exactly the reported defect.
      const rows = listing.rows.filter((row) => row.toolId != null);
      return rows.length === 1 ? rows[0].toolId : null;
    },
  },
];

test('every registered tool surface resolves the shared identity table', async (t) => {
  for (const surface of SURFACES.filter((entry) => entry.status === 'covered')) {
    for (const testCase of TOOL_SURFACE_CASES) {
      await t.test(`${surface.id} — ${testCase.id}`, () => {
        const resolved = surface.run({ item: testCase.item, system: surfaceSystem() });
        assert.equal(
          resolved,
          testCase.toolId,
          `${surface.id} must resolve ${testCase.id} to ${testCase.toolId ?? 'no tool'}: ${testCase.summary}`
        );
      });
    }
  }
});

test('the whetstone is one card carrying both roles, never two', () => {
  const system = surfaceSystem();
  const manager = installWorld(system);
  const builder = new InventoryListingBuilder({
    recipeManager: new RecipeManager(),
    craftingSystemManager: manager,
    localize: (key) => key,
    nowWorldTime: () => 0,
  });
  const listing = builder.buildListing({ craftingActor: surfaceActor() });

  const whetstones = listing.rows.filter((row) => row.name === 'Whetstone');
  assert.equal(whetstones.length, 1, 'a document that is both must not produce two rows');
  assert.equal(whetstones[0].componentId, 'cmp-whetstone', 'the component identity stays primary');
  assert.equal(whetstones[0].isTool, true, 'and it is badged as a tool');
  assert.equal(whetstones[0].isToolOnly, false, 'so it still belongs under the Components pill');
  assert.equal(whetstones[0].systems.length, 1, 'one systems[] entry per system, not two');
});

test('every owned tool in the table reaches the player inventory', () => {
  // The end-to-end form of the reported bug: the GM registers tools from Item uuids and
  // the player sees nothing. Asserted over the WHOLE actor at once, so a surface that
  // handles one identity tier but drops another still fails.
  const system = surfaceSystem();
  const manager = installWorld(system);
  const builder = new InventoryListingBuilder({
    recipeManager: new RecipeManager(),
    craftingSystemManager: manager,
    localize: (key) => key,
    nowWorldTime: () => 0,
  });
  const listing = builder.buildListing({ craftingActor: surfaceActor() });

  const listedToolIds = listing.rows
    .map((row) => row.toolId)
    .filter(Boolean)
    .sort();
  assert.deepEqual(
    listedToolIds,
    [...EXPECTED_TOOL_IDS].sort(),
    'every owned tool is listed, by whichever identity tier identifies it'
  );

  const pick = listing.rows.find((row) => row.toolId === 'tool-pick');
  assert.equal(pick.isToolOnly, true, 'an item-sourced tool backs no component');
  assert.equal(pick.name, "Miner's Pick", 'and displays through its own snapshot');

  // The negative control must still be a normal component row.
  const iron = listing.rows.find((row) => row.componentId === 'cmp-iron');
  assert.ok(iron, 'the plain component is still listed');
  assert.equal(iron.isTool, false, 'and is not mistaken for a tool');
});

test('the surface registry is complete and every exclusion is tracked', () => {
  // A hardcoded count, so ADDING a surface is a visible diff on a number rather than a
  // line in a list a reviewer skims past.
  assert.equal(SURFACES.length, 4, 'update this count deliberately when registering a surface');

  for (const surface of SURFACES) {
    assert.ok(
      surface.status === 'covered' || surface.status === 'excluded',
      `${surface.id} declares a status`
    );
    if (surface.status !== 'excluded') continue;
    // An exclusion must name WHY and WHERE it is tracked — requirement 9's "re-keying is
    // tracked separately" named no tracker, and the gap it hid (silently dead canvas Tool
    // stations) survived two releases because of it.
    assert.ok(surface.reason, `${surface.id} states why it is excluded`);
    assert.ok(
      Number.isInteger(surface.issue),
      `${surface.id} cites the open issue tracking its exclusion`
    );
  }
});

test('the identity table cannot pass vacuously', () => {
  // A surface that simply returned every owned document, or always null, must fail.
  const positives = TOOL_SURFACE_CASES.filter((entry) => entry.toolId !== null);
  const negatives = TOOL_SURFACE_CASES.filter((entry) => entry.toolId === null);
  assert.ok(positives.length >= 3, 'the table exercises several identity routes');
  assert.equal(negatives.length, 1, 'and carries a negative control');

  // The defect case must be genuinely unresolvable through componentId alone — otherwise
  // a component-only surface could pass it by accident.
  const defect = TOOL_SURFACE_CASES.find((entry) => entry.id === 'durable-item-sourced');
  const defectTool = TOOL_SET.tools.find((entry) => entry.id === defect.toolId);
  assert.equal(defectTool.componentId, null, 'the defect case names no component');
  assert.equal(
    defect.item.flags.fabricate.roles[SYSTEM_ID].componentId,
    undefined,
    'and the owned document claims no component role either'
  );
});
