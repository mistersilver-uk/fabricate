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
 * `sourceUuid`, so a decoy actually resolves through source refs and the durable
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

// Two managed components carrying real source refs; `c-hammer` is the tool's
// component and `c-tongs` a sibling used to prove exclusivity is never violated.
function hammerSystem(id = 'sys-1') {
  return {
    id,
    features: {},
    tools: [],
    components: [
      component('c-hammer', { sourceUuid: HAMMER_SRC, name: 'Hammer' }),
      component('c-tongs', { sourceUuid: 'Item.tongs-src-uuid', name: 'Tongs' }),
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
// durable-flag surface) and add the mutation methods the breakage path calls.
function ownedTool(spec) {
  const item = roleItem(spec);
  item.parent = ACTOR_REF;
  item.deleted = false;
  item.delete = async () => {
    item.deleted = true;
  };
  item.update = async () => {};
  item.setFlag = async () => {};
  return item;
}

// A destroy-on-break tool (breakageChance 100 always breaks; no usage flag written).
const HAMMER_TOOL = {
  componentId: 'c-hammer',
  breakage: { mode: 'breakageChance', breakageChance: 100 },
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
// Durable per-system roles flag naming c-hammer.
function durableFlagHammer() {
  return ownedTool({
    uuid: 'Item.real-hammer',
    roles: { 'sys-1': { componentId: 'c-hammer' } },
    name: 'Hammer',
  });
}
// Own compendium source equal to the component's sourceUuid (locked-compendium copy).
function compendiumHammer() {
  return ownedTool({ uuid: 'Item.pack-hammer', compendiumSource: HAMMER_SRC, name: 'Hammer' });
}

// ===========================================================================
// Crafting acceptance — real RecipeManager, real CraftingEngine
// ===========================================================================

async function craftingBreakage(items) {
  installSystem(hammerSystem());
  const engine = new CraftingEngine(new RecipeManager());
  const validation = await engine._validateTools([{ items }], RECIPE, [HAMMER_TOOL]);
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

async function gatheringBreakage(items) {
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
    tools: [HAMMER_TOOL],
    craftingSystemManager,
  });
  assert.equal(matched.missing.length, 0, 'gathering presence gate should still succeed');
  const runtime = gatheringRuntime(craftingSystemManager);
  const evidence = await runtime.apply({ actor, system, task, tools: [HAMMER_TOOL] });
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
