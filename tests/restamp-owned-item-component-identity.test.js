/**
 * Issue 600 (#540 Phase 2): the one-shot, active-GM re-stamp that back-fills the durable
 * per-system component identity `flags.fabricate.roles[systemId].componentId` onto OWNED
 * ACTOR items that currently resolve to a system component ONLY by name.
 *
 * These tests drive the pure migration module (`restampOwnedItemComponentIdentity.js`) with
 * the REAL flag reader/writer (`getFabricateFlag`/`setFabricateFlag`) over `getFlag`/`setFlag`
 * fakes that mirror Foundry's doubly-nested `flags.fabricate.fabricate.roles` layout, and
 * assert the guarantees:
 *   - a name-only owned item GAINS the correct `roles[systemId].componentId` and then resolves
 *     via `resolveComponentForItem` by IDENTITY (RED before, GREEN after);
 *   - idempotence: a second run is a no-op;
 *   - a foreign-system role leaf is never clobbered (per-leaf merge write);
 *   - a dotted systemId is skipped safely (no mis-nested flag);
 *   - an already-durably-flagged item is left untouched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { setFabricateFlag } from '../src/config/flags.js';
import {
  planOwnedItemComponentRestamp,
  restampOwnedItemComponentIdentity,
} from '../src/migration/restampOwnedItemComponentIdentity.js';
import { findMatchingComponent } from '../src/utils/essenceResolver.js';
import { resolveComponentForItem } from '../src/utils/sourceUuid.js';

// Silence the resolver's one-time unsafe-system warning so the suite output stays clean.
const originalWarn = console.warn;
console.warn = () => {};
test.after(() => {
  console.warn = originalWarn;
});

// ---------------------------------------------------------------------------
// getProperty/setProperty over dotted paths so the fake item's getFlag/setFlag walk and
// write `flags.fabricate.fabricate.roles.<systemId>.componentId` exactly as Foundry does.
// ---------------------------------------------------------------------------
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

/**
 * A live owned-item fake: `getFlag`/`setFlag` read and write `flags.fabricate.<key>` so a
 * write is visible to a subsequent read (needed for the idempotence + resolve-after
 * assertions). Records each `setFlag` for write-count assertions.
 */
function makeOwnedItem({ name, uuid, roles = {}, componentId } = {}) {
  const flags = { fabricate: { fabricate: { roles } } };
  if (componentId !== undefined) flags.fabricate.fabricate.componentId = componentId;
  const setFlagCalls = [];
  return {
    name,
    uuid,
    _stats: {},
    flags,
    setFlagCalls,
    getFlag(scope, key) {
      if (scope !== 'fabricate') return undefined;
      return getProperty(flags.fabricate, key);
    },
    async setFlag(scope, key, value) {
      if (scope !== 'fabricate') return null;
      setProperty(flags.fabricate, key, value);
      setFlagCalls.push({ key, value });
      return value;
    },
  };
}

function makeActor(items) {
  return { items };
}

// The production write seam: the REAL merge-preserving flag writer.
const writeFlag = (item, flagKey, componentId) => setFabricateFlag(item, flagKey, componentId);

// A component name-collides with the owned item but its source refs DON'T, so the item
// resolves by name only until it is stamped.
const HEALING = { id: 'healing', name: 'Healing Potion', registeredItemUuid: 'Item.healing-src' };
const SYS_A = { id: 'sysA', components: [HEALING] };

test('600: a name-only owned item gains roles[systemId].componentId and then resolves by IDENTITY', async () => {
  const item = makeOwnedItem({ name: 'Healing Potion', uuid: 'Item.owned-copy' });

  // RED baseline: no durable identity, resolves to the component ONLY via the name fallback.
  assert.equal(
    resolveComponentForItem(item, SYS_A.components, SYS_A.id),
    null,
    'pre-migration: no durable/raw-ref resolution'
  );
  assert.equal(
    findMatchingComponent(item, SYS_A.components, SYS_A.id)?.id,
    HEALING.id,
    'pre-migration: resolves to the component by NAME only'
  );

  const summary = await restampOwnedItemComponentIdentity({
    actors: [makeActor([item])],
    systems: [SYS_A],
    writeFlag,
  });

  assert.equal(summary.stampedItems, 1);
  assert.equal(summary.stampedLeaves, 1);
  assert.equal(
    item.flags.fabricate.fabricate.roles[SYS_A.id].componentId,
    HEALING.id,
    'the durable leaf is written at flags.fabricate.roles[systemId].componentId'
  );
  // GREEN: it now resolves by durable identity, not by name.
  const resolved = resolveComponentForItem(item, SYS_A.components, SYS_A.id);
  assert.equal(resolved?.id, HEALING.id, 'post-migration: resolves by IDENTITY');
});

test('600: idempotent — a second run stamps nothing', async () => {
  const item = makeOwnedItem({ name: 'Healing Potion', uuid: 'Item.owned-copy' });
  const actors = [makeActor([item])];

  const first = await restampOwnedItemComponentIdentity({ actors, systems: [SYS_A], writeFlag });
  assert.equal(first.stampedLeaves, 1);

  const second = await restampOwnedItemComponentIdentity({ actors, systems: [SYS_A], writeFlag });
  assert.equal(second.stampedItems, 0, 'second run stamps no items');
  assert.equal(second.stampedLeaves, 0, 'second run writes no leaves');
  assert.equal(
    item.setFlagCalls.length,
    1,
    'exactly one setFlag ever fired across both runs (no redundant write)'
  );
});

test('600: a foreign-system role leaf is NOT clobbered (per-leaf merge write)', async () => {
  // The item already carries a DIFFERENT system's leaf; sysA has no leaf but name-matches.
  const item = makeOwnedItem({
    name: 'Healing Potion',
    uuid: 'Item.owned-copy',
    roles: { sysB: { componentId: 'b-comp' } },
  });

  await restampOwnedItemComponentIdentity({
    actors: [makeActor([item])],
    systems: [SYS_A],
    writeFlag,
  });

  const roles = item.flags.fabricate.fabricate.roles;
  assert.equal(roles.sysA.componentId, HEALING.id, 'sysA leaf added');
  assert.equal(roles.sysB.componentId, 'b-comp', 'the foreign sysB leaf is preserved');
});

test('600: a dotted/unsafe systemId is skipped safely (no mis-nested flag)', async () => {
  const dottedSystem = { id: 'sys.with.dots', components: [HEALING] };
  const item = makeOwnedItem({ name: 'Healing Potion', uuid: 'Item.owned-copy' });

  const writes = planOwnedItemComponentRestamp(item, [dottedSystem]);
  assert.deepEqual(writes, [], 'the planner emits no write for a dotted system id');

  const summary = await restampOwnedItemComponentIdentity({
    actors: [makeActor([item])],
    systems: [dottedSystem],
    writeFlag,
  });
  assert.equal(summary.stampedLeaves, 0);
  assert.equal(item.setFlagCalls.length, 0, 'no flag write occurs');
  assert.equal(
    item.flags.fabricate.fabricate.roles.sys,
    undefined,
    'no mis-nested roles.sys.with.dots path is created'
  );
});

test('600: an already-durably-flagged owned item is left untouched', async () => {
  // Already carries the sysA leaf → resolves by identity → nothing to do.
  const item = makeOwnedItem({
    name: 'Healing Potion',
    uuid: 'Item.owned-copy',
    roles: { sysA: { componentId: HEALING.id } },
  });

  const summary = await restampOwnedItemComponentIdentity({
    actors: [makeActor([item])],
    systems: [SYS_A],
    writeFlag,
  });

  assert.equal(summary.stampedLeaves, 0, 'no leaf written');
  assert.equal(item.setFlagCalls.length, 0, 'no setFlag fired');
});

test('600: an item that name-matches components in TWO systems gains one leaf per system', async () => {
  // Distinct component ids per system (ids are not globally unique); both name-collide.
  const healingA = { id: 'a-healing', name: 'Healing Potion', registeredItemUuid: 'Item.a-src' };
  const healingB = { id: 'b-healing', name: 'Healing Potion', registeredItemUuid: 'Item.b-src' };
  const systemA = { id: 'alpha', components: [healingA] };
  const systemB = { id: 'beta', components: [healingB] };
  const item = makeOwnedItem({ name: 'Healing Potion', uuid: 'Item.owned-copy' });

  const summary = await restampOwnedItemComponentIdentity({
    actors: [makeActor([item])],
    systems: [systemA, systemB],
    writeFlag,
  });

  assert.equal(summary.stampedItems, 1);
  assert.equal(summary.stampedLeaves, 2, 'one leaf per name-matching system');
  assert.equal(resolveComponentForItem(item, systemA.components, systemA.id)?.id, healingA.id);
  assert.equal(resolveComponentForItem(item, systemB.components, systemB.id)?.id, healingB.id);
});

test('600: no-throw-per-item — a failing write is counted and the pass continues', async () => {
  const good = makeOwnedItem({ name: 'Healing Potion', uuid: 'Item.good' });
  // A plan target whose getFlag reports no identity; its write is made to throw below.
  const bad = makeOwnedItem({ name: 'Healing Potion', uuid: 'Item.bad' });

  // A write seam that throws for the hostile item and delegates to the real writer otherwise.
  const throwingWriteFlag = (item, flagKey, componentId) => {
    if (item.uuid === 'Item.bad') throw new Error('write blew up');
    return setFabricateFlag(item, flagKey, componentId);
  };

  const summary = await restampOwnedItemComponentIdentity({
    actors: [makeActor([bad, good])],
    systems: [SYS_A],
    writeFlag: throwingWriteFlag,
  });

  assert.equal(summary.skippedErrors, 1, 'the failing write is counted');
  assert.equal(summary.stampedItems, 1, 'the healthy item is still stamped');
  assert.equal(good.flags.fabricate.fabricate.roles[SYS_A.id].componentId, HEALING.id);
});

test('600: an item whose source refs already match is NOT treated as name-only (no write)', async () => {
  // The item shares the component's registered source UUID → resolves by raw refs already.
  const item = makeOwnedItem({ name: 'Healing Potion', uuid: HEALING.registeredItemUuid });

  const writes = planOwnedItemComponentRestamp(item, [SYS_A]);
  assert.deepEqual(writes, [], 'raw-ref-resolving items are not re-stamped');
});
