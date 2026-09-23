/**
 * Issue 539: crafted OUTPUT items must carry a durable per-system component identity so the
 * inventory matcher attributes them to their OWN component instead of a sibling reached through
 * Foundry's transitive `_stats.duplicateSource` chain.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { resolveComponentForItem } from '../src/utils/sourceUuid.js';

// Minimal foundry.utils.{getProperty,setProperty} so the engine can write the doubly-nested
// `flags.fabricate.fabricate.roles.<systemId>.componentId` path and a reader can walk it exactly as
// Foundry's Document#getFlag would.

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

function setProperty(object, path, value) {
  const parts = String(path).split('.');
  let cur = object;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

globalThis.foundry = { utils: { getProperty, setProperty, randomID: () => 'rid' } };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

const SYSTEM_ID = 'sys-539';
// The crafted Masterwork shield's own component and the SIBLING it was mis-attributed to.
const MASTERWORK = {
  id: 'masterwork',
  name: 'Masterwork Round Shield',
  registeredItemUuid: 'Item.masterwork-src',
  originItemUuid: null,
  aliasItemUuids: [],
};
const REINFORCED = {
  id: 'reinforced',
  name: 'Reinforced Round Shield',
  registeredItemUuid: 'Item.reinforced-src',
  originItemUuid: null,
  aliasItemUuids: [],
};
const COMPONENTS = [MASTERWORK, REINFORCED];

function makeEngine() {
  return new CraftingEngine({ canCraft: () => ({ canCraft: false }) }, null, null);
}

/**
 * Configure the global crafting-system manager + fromUuid so `_createSingleResult` resolves
 * `MASTERWORK` and reads its source item.
 */
function setupGame() {
  const system = { id: SYSTEM_ID, components: COMPONENTS, features: {} };
  globalThis.game = {
    fabricate: { getCraftingSystemManager: () => ({ getSystem: () => system }) },
  };
  globalThis.fromUuid = async (uuid) => {
    if (uuid !== MASTERWORK.registeredItemUuid) return null;
    return {
      uuid,
      toObject: () => ({
        name: 'Masterwork Round Shield',
        type: 'loot',
        img: 'icons/svg/item-bag.svg',
        system: { quantity: 1 },
        // Sibling's source UUID inherited via Foundry's transitive duplicate chain.
        _stats: { duplicateSource: REINFORCED.registeredItemUuid },
        flags: {},
      }),
    };
  };
}

/**
 * A capturing craftingActor: records the item-data passed to createEmbeddedDocuments and
 * returns a created-document stand-in.
 */
function makeCapturingActor() {
  const captured = [];
  const actor = {
    uuid: 'Actor.crafter',
    captured,
    // Foundry answers a successful embedded create with the CREATED documents —
    // parented to this actor and carrying its own descendant uuid — which is what the
    // acknowledged-award contract reads before it records a receipt for the award.
    createEmbeddedDocuments: async (_type, dataArray) => {
      const first = captured.length;
      captured.push(...dataArray);
      return dataArray.map((data, index) => {
        const created = structuredClone(data);
        created.parent = actor;
        created.uuid = `${actor.uuid}.Item.crafted-${first + index}`;
        created._source = structuredClone(data);
        return created;
      });
    },
  };
  return actor;
}

/**
 * Wrap created item-data in a `getFlag`-compatible reader that mirrors Foundry's Document#getFlag:
 * `getFlag('fabricate', 'fabricate.roles')` walks `flags.fabricate.fabricate.roles`.
 */
function asOwnedItem(itemData) {
  return {
    ...itemData,
    getFlag(scope, key) {
      if (scope !== 'fabricate') return undefined;
      return getProperty(itemData.flags?.fabricate, key);
    },
  };
}

test('539: crafted output carries its own durable component identity in the roles map', async () => {
  setupGame();
  const engine = makeEngine();
  const actor = makeCapturingActor();
  const recipe = { craftingSystemId: SYSTEM_ID, transferEffects: false };

  await engine._createSingleResult(
    actor,
    { componentId: MASTERWORK.id, quantity: 1 },
    [],
    [],
    recipe,
    null,
    {}
  );

  assert.equal(actor.captured.length, 1, 'exactly one item is created');
  const itemData = actor.captured[0];
  assert.equal(
    itemData.flags?.fabricate?.fabricate?.roles?.[SYSTEM_ID]?.componentId,
    MASTERWORK.id,
    'the crafted item-data carries flags.fabricate.roles[systemId].componentId = its own component id'
  );
});

test('539: inventory matcher attributes the crafted output to its OWN component despite a sibling duplicateSource', async () => {
  setupGame();
  const engine = makeEngine();
  const actor = makeCapturingActor();
  const recipe = { craftingSystemId: SYSTEM_ID, transferEffects: false };

  await engine._createSingleResult(
    actor,
    { componentId: MASTERWORK.id, quantity: 1 },
    [],
    [],
    recipe,
    null,
    {}
  );

  const owned = asOwnedItem(actor.captured[0]);

  // Sanity: the crafted item DOES carry the sibling's source UUID as its duplicateSource,
  // so the pre-fix raw-reference tier would (and did) mis-match it to Reinforced.
  assert.equal(owned._stats?.duplicateSource, REINFORCED.registeredItemUuid);

  const resolved = resolveComponentForItem(owned, COMPONENTS, SYSTEM_ID);
  assert.ok(resolved, 'the crafted item resolves to a component');
  assert.equal(
    resolved.id,
    MASTERWORK.id,
    'the durable identity flag beats the sibling duplicateSource → Masterwork, not Reinforced'
  );
});

test('539: a DOTTED craftingSystemId leaves the output unstamped (no mis-nested roles path)', async () => {
  // A dotted system id fails isSafeFlagKeySegment, so it can never be a roles map key.
  const dottedSystemId = 'sys.with.dots';
  const system = { id: dottedSystemId, components: COMPONENTS, features: {} };
  globalThis.game = {
    fabricate: { getCraftingSystemManager: () => ({ getSystem: () => system }) },
  };
  globalThis.fromUuid = async (uuid) => {
    if (uuid !== MASTERWORK.registeredItemUuid) return null;
    return {
      uuid,
      toObject: () => ({
        name: 'Masterwork Round Shield',
        type: 'loot',
        system: { quantity: 1 },
        _stats: { duplicateSource: REINFORCED.registeredItemUuid },
        flags: {},
      }),
    };
  };

  const engine = makeEngine();
  const actor = makeCapturingActor();
  const recipe = { craftingSystemId: dottedSystemId, transferEffects: false };

  await engine._createSingleResult(
    actor,
    { componentId: MASTERWORK.id, quantity: 1 },
    [],
    [],
    recipe,
    null,
    {}
  );

  assert.equal(actor.captured.length, 1);
  const itemData = actor.captured[0];
  // No roles write of ANY shape — not the intended path, and NOT a mis-nested
  // `roles.sys.with.dots` path that expandObject/setProperty would have created.
  assert.equal(
    itemData.flags?.fabricate?.fabricate?.roles,
    undefined,
    'a dotted system id writes no roles map'
  );
  // It degrades to raw-reference resolution: the sibling duplicateSource still governs
  // (the mis-attribution this fix cannot touch for an unsafe system id, by design).
  assert.equal(getProperty(itemData, 'flags.fabricate.fabricate.roles.sys'), undefined);
});

test('539: a componentId that resolves to NO managed component writes no null identity leaf', async () => {
  // Result names a componentId absent from the system's component set ⇒ managedItem is null ⇒ the
  // `!componentId` guard skips the stamp (the sibling case to the bare itemUuid).
  const system = { id: SYSTEM_ID, components: COMPONENTS, features: {} };
  globalThis.game = {
    fabricate: { getCraftingSystemManager: () => ({ getSystem: () => system }) },
  };
  globalThis.fromUuid = async (uuid) =>
    uuid === 'Item.freeform'
      ? {
          uuid,
          toObject: () => ({
            name: 'Freeform Loot',
            type: 'loot',
            system: { quantity: 1 },
            flags: {},
          }),
        }
      : null;

  const engine = makeEngine();
  const actor = makeCapturingActor();
  const recipe = { craftingSystemId: SYSTEM_ID, transferEffects: false };

  await engine._createSingleResult(
    actor,
    { componentId: 'ghost-component', itemUuid: 'Item.freeform', quantity: 1 },
    [],
    [],
    recipe,
    null,
    {}
  );

  assert.equal(actor.captured.length, 1, 'the itemUuid output is still created');
  assert.equal(
    actor.captured[0].flags?.fabricate?.fabricate?.roles,
    undefined,
    'an unresolved managed component writes NO roles leaf (no null/undefined componentId)'
  );
});

test('539: a componentId whose component IS found but has no source item stamps by fallback', async () => {
  // managedItem found (so componentId is truthy) but its source item cannot be resolved:
  // the deterministic loot fallback item still carries the durable identity, and no
  // null/undefined leaf is ever written.
  const system = { id: SYSTEM_ID, components: COMPONENTS, features: {} };
  globalThis.game = {
    fabricate: { getCraftingSystemManager: () => ({ getSystem: () => system }) },
  };
  globalThis.fromUuid = async () => null; // source item unresolvable

  const engine = makeEngine();
  const actor = makeCapturingActor();
  const recipe = { craftingSystemId: SYSTEM_ID, transferEffects: false };

  await engine._createSingleResult(
    actor,
    { componentId: MASTERWORK.id, quantity: 1 },
    [],
    [],
    recipe,
    null,
    {}
  );

  assert.equal(actor.captured.length, 1);
  assert.equal(
    actor.captured[0].flags?.fabricate?.fabricate?.roles?.[SYSTEM_ID]?.componentId,
    MASTERWORK.id,
    'the fallback loot item still carries its own durable component identity'
  );
});

test('539: a bare itemUuid output with no managed component is left unstamped', async () => {
  setupGame();
  globalThis.fromUuid = async () => ({
    uuid: 'Item.freeform',
    toObject: () => ({ name: 'Freeform Loot', type: 'loot', system: { quantity: 1 }, flags: {} }),
  });
  const engine = makeEngine();
  const actor = makeCapturingActor();
  const recipe = { craftingSystemId: SYSTEM_ID, transferEffects: false };

  await engine._createSingleResult(
    actor,
    { itemUuid: 'Item.freeform', quantity: 1 },
    [],
    [],
    recipe,
    null,
    {}
  );

  assert.equal(actor.captured.length, 1);
  assert.equal(
    actor.captured[0].flags?.fabricate?.fabricate?.roles,
    undefined,
    'no managed component ⇒ no roles stamp'
  );
});
