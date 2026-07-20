/**
 * Issue 780: a GATHERED AWARD item must carry the durable per-system component identity
 * (`flags.fabricate.roles[systemId].componentId`) of the awarded component at creation, so
 * a gathered part resolves to its OWN component through the identity tier once #601 removes
 * the name-fallback match tier — instead of degrading to name-only when the awarding
 * component has no registered source item.
 *
 * These drive the REAL `createGatheringResultCreator().create()` closure and assert on the
 * CAPTURED `createEmbeddedDocuments` payload (never a fake-document read-back — the stamp
 * lives in the create payload). Key invariants pinned here:
 *   - the stamped id is the one the RESULT authored (`result.componentId || systemItemId`),
 *     NEVER `source.id` (in the registeredItemUuid case `source` is the source Item);
 *   - ANY `itemUuid`-resolved result — even one carrying a stray `result.componentId` —
 *     stamps NO roles leaf (no managed component);
 *   - a dotted `systemId` stamps nothing (degrades to raw-reference resolution);
 *   - `flags.core.sourceId` is still written;
 *   - the stack/`existing.update` branch stamps NO roles leaf (create-only).
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
  let cur = object;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

globalThis.foundry = {
  utils: { getProperty, setProperty, deepClone: (v) => JSON.parse(JSON.stringify(v)) },
};

const { createGatheringResultCreator } = await import('../src/gatheringResultCreation.js');

const SYSTEM_ID = 'sys-780';

// A component whose display item is a REGISTERED source Item — the case where a
// mis-implementation could stamp `source.id` (a Foundry Item id) instead of the component id.
const REGISTERED_COMPONENT = {
  id: 'comp-registered',
  name: 'Raw Hide',
  registeredItemUuid: 'Item.raw-hide-src',
  originItemUuid: null,
  aliasItemUuids: [],
};
// A component with NO registered source item — the degenerate case #601 would break.
const SOURCELESS_COMPONENT = {
  id: 'comp-sourceless',
  name: 'Wild Berries',
  registeredItemUuid: null,
  originItemUuid: null,
  aliasItemUuids: [],
};
const COMPONENTS = [REGISTERED_COMPONENT, SOURCELESS_COMPONENT];

// The registered source Item resolved from REGISTERED_COMPONENT.registeredItemUuid. Its
// `id` differs from the component id so a `source.id` mis-stamp is observable.
const REGISTERED_SOURCE_ITEM = {
  uuid: 'Item.raw-hide-src',
  id: 'foundry-item-id-999',
  // A live source Item exposes getFlag; the gathering stack-guard resolves the source's
  // own component identity through it (its uuid matches the component's registeredItemUuid).
  getFlag: () => undefined,
  toObject: () => ({
    name: 'Raw Hide',
    type: 'loot',
    img: 'icons/svg/item-bag.svg',
    system: { quantity: 1 },
    flags: {},
  }),
};

function managerWith(system) {
  return { getSystem: (id) => (id === system.id ? system : null) };
}

function capturingActor(items = []) {
  const captured = [];
  return {
    captured,
    uuid: 'Actor.a',
    items,
    createEmbeddedDocuments: async (_type, dataArray) => {
      captured.push(...dataArray);
      return dataArray.map((data, i) => ({ ...data, uuid: `Actor.a.Item.new-${i}` }));
    },
  };
}

test('780: a registered-source award stamps the AUTHORED component id (not source.id), keeps flags.core.sourceId', async () => {
  const system = { id: SYSTEM_ID, components: COMPONENTS };
  globalThis.fromUuidSync = (uuid) =>
    uuid === REGISTERED_COMPONENT.registeredItemUuid ? REGISTERED_SOURCE_ITEM : null;

  const actor = capturingActor();
  const resultGroups = [{ results: [{ componentId: REGISTERED_COMPONENT.id, quantity: 2 }] }];
  await createGatheringResultCreator(managerWith(system)).create({ actor, system, resultGroups });

  assert.equal(actor.captured.length, 1, 'exactly one award item is created');
  const itemData = actor.captured[0];
  assert.equal(
    itemData.flags?.fabricate?.fabricate?.roles?.[SYSTEM_ID]?.componentId,
    REGISTERED_COMPONENT.id,
    'the award carries the AUTHORED component id in roles[systemId].componentId'
  );
  assert.notEqual(
    itemData.flags?.fabricate?.fabricate?.roles?.[SYSTEM_ID]?.componentId,
    REGISTERED_SOURCE_ITEM.id,
    'the stamp is NEVER the registered source Item id'
  );
  assert.equal(
    itemData.flags?.core?.sourceId,
    REGISTERED_SOURCE_ITEM.uuid,
    'the existing flags.core.sourceId write is preserved'
  );
});

test('780: an award for a component with NO registered source still stamps its component identity', async () => {
  const system = { id: SYSTEM_ID, components: COMPONENTS };
  globalThis.fromUuidSync = () => null;

  const actor = capturingActor();
  // systemItemId (not componentId) authored the result — the id is derived from either.
  const resultGroups = [{ results: [{ systemItemId: SOURCELESS_COMPONENT.id, quantity: 1 }] }];
  await createGatheringResultCreator(managerWith(system)).create({ actor, system, resultGroups });

  assert.equal(actor.captured.length, 1);
  assert.equal(
    actor.captured[0].flags?.fabricate?.fabricate?.roles?.[SYSTEM_ID]?.componentId,
    SOURCELESS_COMPONENT.id,
    'a no-registered-source award still resolves by identity — exactly the #601 gap this closes'
  );
});

test('780: an itemUuid-resolved result carrying a STRAY componentId stamps NO roles leaf', async () => {
  const system = { id: SYSTEM_ID, components: COMPONENTS };
  const FREEFORM = {
    uuid: 'Item.freeform',
    id: 'freeform-id',
    toObject: () => ({ name: 'Freeform Loot', type: 'loot', system: { quantity: 1 }, flags: {} }),
  };
  globalThis.fromUuidSync = (uuid) => (uuid === 'Item.freeform' ? FREEFORM : null);

  const actor = capturingActor();
  // resolveGatheringResultSource returns the itemUuid source BEFORE component resolution,
  // so the stray componentId names no managed component and must NOT be stamped.
  const resultGroups = [
    { results: [{ itemUuid: 'Item.freeform', componentId: REGISTERED_COMPONENT.id, quantity: 1 }] },
  ];
  await createGatheringResultCreator(managerWith(system)).create({ actor, system, resultGroups });

  assert.equal(actor.captured.length, 1, 'the itemUuid award is still created');
  assert.equal(
    actor.captured[0].flags?.fabricate?.fabricate?.roles,
    undefined,
    'an itemUuid-resolved result stamps NO roles leaf, stray componentId notwithstanding'
  );
});

test('780: a dotted systemId leaves the gathered award unstamped', async () => {
  const dottedSystemId = 'sys.with.dots';
  const system = { id: dottedSystemId, components: COMPONENTS };
  globalThis.fromUuidSync = () => null;

  const actor = capturingActor();
  const resultGroups = [{ results: [{ componentId: SOURCELESS_COMPONENT.id, quantity: 1 }] }];
  await createGatheringResultCreator(managerWith(system)).create({ actor, system, resultGroups });

  assert.equal(actor.captured.length, 1);
  assert.equal(
    actor.captured[0].flags?.fabricate?.fabricate?.roles,
    undefined,
    'a dotted system id can never be a roles map key, so nothing is stamped'
  );
});

test('780: the stack/existing.update branch stamps NO roles leaf (create-only)', async () => {
  const system = { id: SYSTEM_ID, components: COMPONENTS };
  globalThis.fromUuidSync = (uuid) =>
    uuid === REGISTERED_COMPONENT.registeredItemUuid ? REGISTERED_SOURCE_ITEM : null;

  // An owned stackable item that resolves to the SAME registered component via its
  // duplicate-source ref, so findStackableMatch folds the award onto it.
  let updatePayload = null;
  const existing = {
    uuid: 'Item.owned',
    _stats: { duplicateSource: REGISTERED_SOURCE_ITEM.uuid },
    system: { quantity: 3 },
    update: async (payload) => {
      updatePayload = payload;
    },
  };
  const actor = capturingActor([existing]);
  const resultGroups = [{ results: [{ componentId: REGISTERED_COMPONENT.id, quantity: 2 }] }];
  await createGatheringResultCreator(managerWith(system)).create({ actor, system, resultGroups });

  assert.equal(actor.captured.length, 0, 'no new document is created — the award stacked');
  assert.deepEqual(
    updatePayload,
    { 'system.quantity': 5 },
    'the existing item receives ONLY a quantity update — no roles leaf'
  );
  assert.equal(existing.flags, undefined, 'the stacked item is never stamped with a roles map');
});
