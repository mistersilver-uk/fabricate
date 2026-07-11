/**
 * Issue 557 — durable-identity gate for destructive/consumptive tool selection.
 *
 * Central acceptance across BOTH surfaces (crafting + gathering): an owned item is
 * consumed or destroyed on the tool-breakage path ONLY when it matches the tool by
 * durable identity (durable flag, or own uuid/compendium source). A decoy that
 * satisfies only the wide PRESENCE gate — via a transitive `_stats.duplicateSource`
 * reference or by name alone — is spared from breakage but still satisfies presence.
 *
 * Anti-vacuity (delta A1/A2): both surfaces drive the REAL `RecipeManager`
 * (`installSystem` + `new RecipeManager()`) over components carrying real
 * `registeredItemUuid`, so a decoy actually resolves through source refs and the durable
 * gate is the only thing preventing `delete()`. No fake `componentId === item.id`
 * matcher and no `matchTools: () => ({ items })` stub is used here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}
function setProperty(object, path, value) {
  const parts = String(path).split('.');
  const last = parts.pop();
  let cursor = object;
  for (const part of parts) {
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[last] = value;
}

globalThis.foundry = {
  utils: {
    getProperty,
    setProperty,
    deepClone: (value) => JSON.parse(JSON.stringify(value)),
    randomID: () => `id-${Math.random().toString(36).slice(2, 10)}`,
  },
};
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { matchGatheringTools } = await import('../src/gatheringToolRuntime.js');
const { createToolBreakageRuntime } = await import('../src/toolBreakageRuntime.js');
const { component, roleItem } = await import('./helpers/componentIdentityFixtures.js');

const HAMMER_SRC = 'Item.hammer-src-uuid';

// The first-class Tool (issue 561): it carries its OWN source refs, so both presence
// (`resolveToolForItem`) and durable-identity breakage (`itemIsToolByDurableIdentity`)
// resolve owned items against the tool itself, not through a component. The system exposes
// it in `tools`; the breakage-config variants below share its id so they resolve to it.
const HAMMER_LIBRARY_TOOL = {
  id: 'tool-hammer',
  componentId: 'c-hammer',
  name: 'Hammer',
  registeredItemUuid: HAMMER_SRC,
  originItemUuid: HAMMER_SRC,
  aliasItemUuids: [],
};

// Two managed components carrying real source refs; `c-hammer` is the tool's linked
// component and `c-tongs` a sibling used to prove exclusivity is never violated.
function hammerSystem(id = 'sys-1') {
  return {
    id,
    features: {},
    tools: [{ ...HAMMER_LIBRARY_TOOL }],
    components: [
      component('c-hammer', { registeredItemUuid: HAMMER_SRC, name: 'Hammer' }),
      component('c-tongs', { registeredItemUuid: 'Item.tongs-src-uuid', name: 'Tongs' }),
    ],
  };
}

function installSystem(system) {
  globalThis.game = {
    user: { id: 'user-1', isGM: true },
    time: { worldTime: 0 },
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: (sid) => (sid === system.id ? system : null),
      }),
      getResolutionModeService: () => null,
    },
  };
  return system;
}

const ACTOR_REF = { uuid: 'Actor.a1' };

// Build an owned tool item on top of the shared `roleItem` fixture (A4-compliant
// durable-flag surface) and add the mutation methods the breakage path calls. The
// `toolUsage` flag is OBSERVABLE (a live `timesUsed` counter) so a `limitedUses`
// usage-increment gate can be asserted, not just the `delete()` side effect.
function ownedTool(spec = {}) {
  const item = roleItem(spec);
  item.parent = ACTOR_REF;
  item.deleted = false;
  item.delete = async () => {
    item.deleted = true;
  };
  item.update = async () => {};
  let toolUsage = { timesUsed: spec.timesUsed ?? 0 };
  const baseGetFlag = item.getFlag;
  item.getFlag = (scope, key) => {
    if (scope === 'fabricate' && key === 'fabricate.toolUsage') return toolUsage;
    return baseGetFlag(scope, key);
  };
  item.setFlag = async (scope, key, value) => {
    if (scope === 'fabricate' && key === 'fabricate.toolUsage') toolUsage = value;
    return value;
  };
  Object.defineProperty(item, 'timesUsed', { get: () => toolUsage?.timesUsed });
  return item;
}

// A destroy-on-break tool (breakageChance 100 always breaks; no usage flag written).
const HAMMER_TOOL = {
  ...HAMMER_LIBRARY_TOOL,
  breakage: { mode: 'breakageChance', breakageChance: 100 },
  onBreak: { mode: 'destroy' },
};

// A limitedUses tool with an unbounded cap: it is USAGE-incremented on every attempt
// but never breaks, isolating the usage gate from the breakage gate.
const HAMMER_LIMITED_TOOL = {
  ...HAMMER_LIBRARY_TOOL,
  breakage: { mode: 'limitedUses', maxUses: null },
  onBreak: { mode: 'destroy' },
};

const RECIPE = { id: 'recipe-1', name: 'R', craftingSystemId: 'sys-1' };

// --- decoys (spared) and durable tools (broken) ----------------------------

// Only a transitive `_stats.duplicateSource` links this to the hammer source; no
// fabricate flag, no compendium source, a DIFFERENT name.
function duplicateSourceDecoy() {
  return ownedTool({
    uuid: 'Item.decoy-dup',
    duplicateSource: HAMMER_SRC,
    name: 'Battered Mallet',
  });
}
// Shares only the component NAME (unrelated source, no flag, no compendium source).
function nameDecoy() {
  return ownedTool({ uuid: 'Item.decoy-name', name: 'Hammer' });
}
// Durable per-system roles flag naming the tool (issue 561: `toolId`, not `componentId`).
function durableFlagHammer() {
  return ownedTool({
    uuid: 'Item.real-hammer',
    roles: { 'sys-1': { toolId: 'tool-hammer' } },
    name: 'Hammer',
  });
}
// Own compendium source equal to the component's registeredItemUuid (locked-compendium copy).
function compendiumHammer() {
  return ownedTool({ uuid: 'Item.pack-hammer', compendiumSource: HAMMER_SRC, name: 'Hammer' });
}

// ===========================================================================
// Crafting acceptance — real RecipeManager, real CraftingEngine
// ===========================================================================

async function craftingBreakage(items, tool = HAMMER_TOOL) {
  installSystem(hammerSystem());
  const engine = new CraftingEngine(new RecipeManager());
  const validation = await engine._validateTools([{ items }], RECIPE, [tool]);
  // A3: the presence gate must still succeed (spared !== "no longer matches").
  assert.equal(validation.valid, true, 'presence gate should still succeed');
  const used = await engine._applyToolBreakage(RECIPE, validation.tools);
  return { validation, used };
}

test('crafting: a duplicateSource decoy satisfies presence but is NOT broken', async () => {
  const decoy = duplicateSourceDecoy();
  const { used } = await craftingBreakage([decoy]);
  assert.equal(decoy.deleted, false, 'decoy must not be destroyed');
  // A spared pair is silent under toolSpecific authority — no breakage evidence.
  assert.ok(!used.some((entry) => entry.broken === true), 'nothing should be recorded broken');
});

test('crafting: a same-name decoy satisfies presence but is NOT broken', async () => {
  const decoy = nameDecoy();
  const { used } = await craftingBreakage([decoy]);
  assert.equal(decoy.deleted, false, 'name decoy must not be destroyed');
  assert.ok(!used.some((entry) => entry.broken === true), 'nothing should be recorded broken');
});

test('crafting: a durable roles-flag tool IS broken', async () => {
  const tool = durableFlagHammer();
  const { used } = await craftingBreakage([tool]);
  assert.equal(tool.deleted, true, 'durable-flag tool must break');
  assert.equal(used[0].broken, true);
});

test('crafting: an own-compendiumSource (locked-compendium) tool IS broken', async () => {
  const tool = compendiumHammer();
  const { used } = await craftingBreakage([tool]);
  assert.equal(tool.deleted, true, 'compendium-source tool must break');
  assert.equal(used[0].broken, true);
});

test('crafting: the durable tool is preferred over an earlier-sorting decoy', async () => {
  const decoy = duplicateSourceDecoy();
  const durable = durableFlagHammer();
  // Decoy sorts FIRST in the actor inventory.
  await craftingBreakage([decoy, durable]);
  assert.equal(decoy.deleted, false, 'the decoy must be spared');
  assert.equal(durable.deleted, true, 'the durable tool must be the one broken');
});

test('crafting: a limitedUses decoy is spared AND its usage counter is NOT incremented', async () => {
  const decoy = duplicateSourceDecoy();
  await craftingBreakage([decoy], HAMMER_LIMITED_TOOL);
  assert.equal(decoy.deleted, false, 'decoy must not be destroyed');
  // The gate covers usage, not breakage alone: a spared pair never reaches applyUsage.
  assert.equal(decoy.timesUsed, 0, 'a spared decoy must not be usage-incremented');
});

test('crafting: a durable limitedUses tool IS usage-incremented', async () => {
  const tool = durableFlagHammer();
  await craftingBreakage([tool], HAMMER_LIMITED_TOOL);
  assert.equal(tool.deleted, false, 'maxUses null never breaks');
  assert.equal(tool.timesUsed, 1, 'a durable tool must be usage-incremented');
});

// ===========================================================================
// Gathering acceptance — real matchGatheringTools + real RecipeManager +
// shared createToolBreakageRuntime
// ===========================================================================

function gatheringRuntime(craftingSystemManager) {
  return createToolBreakageRuntime({
    matchTools: ({ actor, system, task, tools = [], presentTools = null }) =>
      matchGatheringTools({ actor, system, task, tools, craftingSystemManager, presentTools }),
    buildItemRef: (_actor, item) => ({
      actorUuid: item?.parent?.uuid ?? null,
      itemUuid: item?.uuid ?? null,
      quantity: 1,
    }),
  });
}

async function gatheringBreakage(items, tool = HAMMER_TOOL) {
  installSystem(hammerSystem());
  const recipeManager = new RecipeManager();
  const craftingSystemManager = { recipeManager };
  const system = { id: 'sys-1' };
  const task = { id: 'task-1', craftingSystemId: 'sys-1' };
  const actor = { uuid: 'Actor.a1', items };
  // A2/A3: presence is computed by the REAL matcher — confirm the tool is present.
  const matched = matchGatheringTools({
    actor,
    system,
    task,
    tools: [tool],
    craftingSystemManager,
  });
  assert.equal(matched.missing.length, 0, 'gathering presence gate should still succeed');
  const runtime = gatheringRuntime(craftingSystemManager);
  const evidence = await runtime.apply({ actor, system, task, tools: [tool] });
  return { matched, evidence };
}

test('gathering: a duplicateSource decoy satisfies presence but is NOT broken', async () => {
  const decoy = duplicateSourceDecoy();
  const { evidence } = await gatheringBreakage([decoy]);
  assert.equal(decoy.deleted, false, 'decoy must not be destroyed');
  // A spared pair is silent under toolSpecific authority — no breakage evidence.
  assert.ok(!evidence.some((entry) => entry.broken === true), 'nothing should be recorded broken');
});

test('gathering: a same-name decoy satisfies presence but is NOT broken', async () => {
  const decoy = nameDecoy();
  await gatheringBreakage([decoy]);
  assert.equal(decoy.deleted, false, 'name decoy must not be destroyed');
});

test('gathering: a durable roles-flag tool IS broken', async () => {
  const tool = durableFlagHammer();
  const { evidence } = await gatheringBreakage([tool]);
  assert.equal(tool.deleted, true, 'durable-flag tool must break');
  assert.equal(evidence[0].broken, true);
});

test('gathering: an own-compendiumSource tool IS broken', async () => {
  const tool = compendiumHammer();
  await gatheringBreakage([tool]);
  assert.equal(tool.deleted, true, 'compendium-source tool must break');
});

test('gathering: the durable tool is preferred over an earlier-sorting decoy', async () => {
  const decoy = duplicateSourceDecoy();
  const durable = durableFlagHammer();
  await gatheringBreakage([decoy, durable]);
  assert.equal(decoy.deleted, false, 'the decoy must be spared');
  assert.equal(durable.deleted, true, 'the durable tool must be the one broken');
});

test('gathering: a limitedUses decoy is spared AND its usage counter is NOT incremented', async () => {
  const decoy = duplicateSourceDecoy();
  await gatheringBreakage([decoy], HAMMER_LIMITED_TOOL);
  assert.equal(decoy.deleted, false, 'decoy must not be destroyed');
  assert.equal(decoy.timesUsed, 0, 'a spared decoy must not be usage-incremented');
});

test('gathering: a durable limitedUses tool IS usage-incremented', async () => {
  const tool = durableFlagHammer();
  await gatheringBreakage([tool], HAMMER_LIMITED_TOOL);
  assert.equal(tool.deleted, false, 'maxUses null never breaks');
  assert.equal(tool.timesUsed, 1, 'a durable tool must be usage-incremented');
});

// ===========================================================================
// Fail-safe spare — resolveToolIdentityMatcher defaults to () => false
// ===========================================================================

test('gathering fail-safe: a present item is SPARED when no identity matcher is resolvable', async () => {
  installSystem(hammerSystem());
  // A manager that can decide PRESENCE (wide match) but exposes no identity matcher
  // and no `recipeManager` — so `resolveToolIdentityMatcher` falls back to () => false.
  const craftingSystemManager = { toolMatchesItem: () => true };
  const system = { id: 'sys-1' };
  const task = { id: 'task-1', craftingSystemId: 'sys-1' };
  const item = durableFlagHammer();
  const actor = { uuid: 'Actor.a1', items: [item] };

  const matched = matchGatheringTools({
    actor,
    system,
    task,
    tools: [HAMMER_TOOL],
    craftingSystemManager,
  });
  assert.equal(matched.missing.length, 0, 'present gate still satisfied');
  assert.equal(matched.items[0].breakable, false, 'unknown matcher must tag non-breakable');

  const runtime = gatheringRuntime(craftingSystemManager);
  await runtime.apply({ actor, system, task, tools: [HAMMER_TOOL] });
  assert.equal(item.deleted, false, 'a spared pair must never reach delete()');
});
