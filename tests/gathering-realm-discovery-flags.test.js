import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getDiscoveredGatheringRealms,
  getDiscoveredRealmIds,
  hideGatheringRealm,
  isGatheringRealmDiscovered,
  revealGatheringRealm
} from '../src/systems/gatheringRealmDiscovery.js';
import {
  deletedKey,
  forEachReplacementForm,
  isForcedReplacement,
  recordWrite,
  replacedKey
} from './helpers/forcedDeletion.js';

function getPathValue(object, path) {
  return String(path).split('.').reduce((value, part) => {
    if (value == null || typeof value !== 'object') return undefined;
    return value[part];
  }, object);
}

function setPathValue(object, path, value) {
  const parts = String(path).split('.');
  const last = parts.pop();
  let target = object;
  for (const part of parts) {
    if (!target[part] || typeof target[part] !== 'object') target[part] = {};
    target = target[part];
  }
  target[last] = value;
}

class FakeDocument {
  constructor({ activeScopes = ['fabricate'], flags = {} } = {}) {
    this.activeScopes = new Set(activeScopes);
    this._flags = flags;
  }
  get flags() { return this._flags; }
  getFlag(scope, key) {
    if (!this.activeScopes.has(scope)) throw new Error(`scope "${scope}" not active`);
    return getPathValue(this._flags[scope], key);
  }
  async setFlag(scope, key, value) {
    if (!this.activeScopes.has(scope)) throw new Error(`scope "${scope}" not active`);
    if (!this._flags[scope] || typeof this._flags[scope] !== 'object') this._flags[scope] = {};
    setPathValue(this._flags[scope], key, value);
    return value;
  }
}

const isObject = (value) => Boolean(value) && typeof value === 'object';

function mergeNeverDeleting(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (isObject(value) && isObject(target[key])) mergeNeverDeleting(target[key], value);
    else target[key] = value;
  }
}

// `Actor#update` as core runs it: a recursive merge that removes a key only for a forced
// deletion, never because the written map omits it (issue 2012), and assigns a forced
// replacement wholesale. A missing parent on the path is created, as core's diff creates one.
class MergingActor extends FakeDocument {
  updateCalls = [];
  updateSource() {}
  async update(changes) {
    recordWrite(this.updateCalls, changes);
    for (const [path, value] of Object.entries(changes)) {
      const parts = path.split('.');
      const last = parts.pop();
      let node = this;
      for (const part of parts) node = node[part] ??= {};
      const deleted = deletedKey(last, value);
      const replaced = replacedKey(last, value);
      if (deleted !== null) delete node[deleted];
      else if (replaced) node[replaced.key] = structuredClone(replaced.value);
      else if (isObject(value) && isObject(node[last])) mergeNeverDeleting(node[last], value);
      else node[last] = value;
    }
    return this;
  }
}

const discoveryActor = (fabricateFlags) =>
  new MergingActor({ flags: { fabricate: { fabricate: fabricateFlags } } });
const storedDiscoveryMap = (actor) => actor.flags.fabricate.fabricate.discoveredGatheringRealms;
const R1 = { discoveredAt: 1, source: 'manual' };
const R2 = { discoveredAt: 2, source: 'api' };

const travelConfig = { realms: [{ id: 'r1' }, { id: 'r2' }] };

test('revealGatheringRealm writes a discovery entry validated against the WORLD library', async () => {
  const doc = new FakeDocument();
  const ok = await revealGatheringRealm(doc, {
    realmId: 'r1', source: 'manual', validateRealmExists: travelConfig, now: () => 42
  });
  assert.equal(ok, true);
  assert.equal(isGatheringRealmDiscovered(doc, 'r1'), true);
  const entry = getDiscoveredGatheringRealms(doc).r1;
  assert.equal(entry.discoveredAt, 42);
  assert.equal(entry.source, 'manual');
});

test('revealGatheringRealm rejects a realm that does not exist in the world', async () => {
  const doc = new FakeDocument();
  const ok = await revealGatheringRealm(doc, {
    realmId: 'r-foreign', source: 'manual', validateRealmExists: travelConfig
  });
  assert.equal(ok, false);
  assert.equal(isGatheringRealmDiscovered(doc, 'r-foreign'), false);
});

test('revealGatheringRealm rejects an unknown source token', async () => {
  const doc = new FakeDocument();
  const ok = await revealGatheringRealm(doc, {
    realmId: 'r1', source: 'telepathy', validateRealmExists: travelConfig
  });
  assert.equal(ok, false);
});

test('hideGatheringRealm removes the entry', async () => {
  const doc = new MergingActor();
  await revealGatheringRealm(doc, { realmId: 'r1', source: 'manual', validateRealmExists: travelConfig });
  await revealGatheringRealm(doc, { realmId: 'r2', source: 'api', validateRealmExists: travelConfig });
  const removed = await hideGatheringRealm(doc, { realmId: 'r1' });
  assert.equal(removed, true);
  assert.equal(isGatheringRealmDiscovered(doc, 'r1'), false);
  assert.equal(isGatheringRealmDiscovered(doc, 'r2'), true);
});

forEachReplacementForm('hideGatheringRealm replaces the map that core merges', async (form) => {
  form.apply();
  const actor = discoveryActor({ discoveredGatheringRealms: { r1: R1, r2: R2 } });
  assert.equal(await hideGatheringRealm(actor, { realmId: 'r1' }), true);
  assert.equal(isGatheringRealmDiscovered(actor, 'r1'), false, 'an omitted key survives the merge');
  assert.equal(isGatheringRealmDiscovered(actor, 'r2'), true);
  assert.deepEqual(
    actor.updateCalls,
    form.expect([{ 'flags.fabricate.fabricate.==discoveredGatheringRealms': { r2: R2 } }])
  );
  const [[, written]] = Object.entries(actor.updateCalls[0]);
  assert.equal(isForcedReplacement(written), form.v14, 'V14 writes the operator, V13 the plain map');
});

forEachReplacementForm('hiding on a legacy-key-only actor keeps its other discoveries', async (form) => {
  form.apply();
  const actor = discoveryActor({ discoveredGatheringRegions: { 'system-a': { r1: R1, r2: R2 } } });
  assert.equal(await hideGatheringRealm(actor, { realmId: 'r1' }), true);
  assert.deepEqual([...getDiscoveredRealmIds(actor)], ['r2'], 'r1 hidden, nothing else wiped');
  assert.deepEqual(storedDiscoveryMap(actor), { r2: R2 }, 'migrated to the flat key');
});

forEachReplacementForm('hiding a realm inside a legacy bucket removes it', async (form) => {
  form.apply();
  const actor = discoveryActor({ discoveredGatheringRealms: { 'system-a': { r1: R1, r2: R2 } } });
  assert.equal(await hideGatheringRealm(actor, { realmId: 'r1' }), true);
  assert.deepEqual([...getDiscoveredRealmIds(actor)], ['r2']);
  assert.deepEqual(storedDiscoveryMap(actor), { r2: R2 }, 'the bucket is flattened away');
});

forEachReplacementForm('hiding a realm both flat and bucketed removes both copies', async (form) => {
  form.apply();
  const actor = discoveryActor({ discoveredGatheringRealms: {
    r1: R1,
    'system-b': { r1: { discoveredAt: 5, source: 'api' }, r2: R2 }
  } });
  assert.equal(await hideGatheringRealm(actor, { realmId: 'r1' }), true);
  assert.equal(isGatheringRealmDiscovered(actor, 'r1'), false);
  assert.deepEqual(storedDiscoveryMap(actor), { r2: R2 });
});

forEachReplacementForm('hiding the last realm leaves an empty map, not the legacy one', async (form) => {
  form.apply();
  for (const flags of [
    { discoveredGatheringRealms: { r1: R1 } },
    { discoveredGatheringRegions: { 'system-a': { r1: R1 } } }
  ]) {
    const actor = discoveryActor(flags);
    assert.equal(await hideGatheringRealm(actor, { realmId: 'r1' }), true);
    assert.deepEqual(storedDiscoveryMap(actor), {});
    assert.deepEqual([...getDiscoveredRealmIds(actor)], [], 'the legacy key is no longer read');
  }
});

test('hiding an undiscovered or inherited id answers false and writes nothing', async () => {
  for (const realmId of ['r-unknown', 'constructor', 'toString', 'hasOwnProperty', '__proto__']) {
    const actor = discoveryActor({ discoveredGatheringRealms: { r1: R1 } });
    assert.equal(await hideGatheringRealm(actor, { realmId }), false, realmId);
    assert.deepEqual(actor.updateCalls, [], `${realmId} writes nothing`);
    assert.equal(isGatheringRealmDiscovered(actor, 'r1'), true);
  }
});

test('hiding a dotted realm id removes it, since the id never enters an update path', async () => {
  const actor = discoveryActor({ discoveredGatheringRealms: { 'r.1': R1, r2: R2 } });
  await assert.doesNotReject(async () => {
    assert.equal(await hideGatheringRealm(actor, { realmId: 'r.1' }), true);
  });
  assert.deepEqual(storedDiscoveryMap(actor), { r2: R2 });
});

test('a non-Document actor gets the setFabricateFlag fallback or a quiet refusal', async () => {
  const readOnly = { getFlag: () => ({ r1: R1 }) };
  assert.equal(await hideGatheringRealm(readOnly, { realmId: 'r1' }), false);

  const writes = [];
  const flagOnly = {
    getFlag: () => ({ r1: R1, r2: R2 }),
    setFlag: async (...args) => writes.push(args)
  };
  assert.equal(await hideGatheringRealm(flagOnly, { realmId: 'r1' }), true);
  assert.deepEqual(writes, [['fabricate', 'fabricate.discoveredGatheringRealms', { r2: R2 }]]);
});

test('discovery entry with a stale partyId remains readable', async () => {
  const doc = new FakeDocument();
  await revealGatheringRealm(doc, {
    realmId: 'r1', source: 'partyToken', partyId: 'party-gone', validateRealmExists: travelConfig
  });
  const entry = getDiscoveredGatheringRealms(doc).r1;
  assert.equal(entry.partyId, 'party-gone');
  assert.equal(isGatheringRealmDiscovered(doc, 'r1'), true);
});

test('actor knowledge survives a party change (discovery is actor-scoped)', async () => {
  const doc = new FakeDocument();
  await revealGatheringRealm(doc, {
    realmId: 'r1', source: 'partyToken', partyId: 'party-1', validateRealmExists: travelConfig
  });
  assert.deepEqual([...getDiscoveredRealmIds(doc)], ['r1']);
});

// The lazy upgrade (issue 1282) ------------------------------------------------------- The
// migration runner reaches two corpora and four world settings; it has no actor access at all, so
// the re-key from `[systemId][realmId]` to `[realmId]` can only happen on read.

test('flattens a legacy per-system map on read, so knowledge is not lost', () => {
  const doc = new FakeDocument({
    flags: { fabricate: { fabricate: { discoveredGatheringRealms: {
      'system-a': { r1: { discoveredAt: 7, source: 'manual' } },
      'system-b': { r2: { discoveredAt: 8, source: 'api' } }
    } } } }
  });
  assert.deepEqual([...getDiscoveredRealmIds(doc)].sort(), ['r1', 'r2']);
  assert.equal(isGatheringRealmDiscovered(doc, 'r1'), true);
  assert.equal(isGatheringRealmDiscovered(doc, 'r2'), true);
});

test('a realm discovered under two systems keeps the EARLIEST sighting', () => {
  // Discovery records the first time a character saw a place. A later duplicate arriving from
  // another system's bucket is not a re-discovery.
  const doc = new FakeDocument({
    flags: { fabricate: { fabricate: { discoveredGatheringRealms: {
      'system-a': { r1: { discoveredAt: 900, source: 'api' } },
      'system-b': { r1: { discoveredAt: 100, source: 'manual' } }
    } } } }
  });
  const entry = getDiscoveredGatheringRealms(doc).r1;
  assert.equal(entry.discoveredAt, 100);
  assert.equal(entry.source, 'manual');
});

test('a HALF-UPGRADED map resolves — both shapes at once', () => {
  // Reachable in normal use, not hypothetical: upgrade an actor, write, then discover a second
  // realm, and the map carries a flat entry beside a legacy bucket until the next full read.
  const doc = new FakeDocument({
    flags: { fabricate: { fabricate: { discoveredGatheringRealms: {
      r1: { discoveredAt: 50, source: 'manual' },
      'system-b': { r2: { discoveredAt: 60, source: 'api' } }
    } } } }
  });
  assert.deepEqual([...getDiscoveredRealmIds(doc)].sort(), ['r1', 'r2']);
});

test('legacy-read fallback: reads a pre-rename discoveredGatheringRegions flag', () => {
  const doc = new FakeDocument({
    flags: { fabricate: { fabricate: { discoveredGatheringRegions: { 'system-a': { r1: { discoveredAt: 7, source: 'manual' } } } } } }
  });
  assert.deepEqual([...getDiscoveredRealmIds(doc)], ['r1']);
  assert.equal(isGatheringRealmDiscovered(doc, 'r1'), true);
});

test('a write persists ONLY the new flat shape, upgrading the actor lazily', async () => {
  const doc = new FakeDocument({
    flags: { fabricate: { fabricate: { discoveredGatheringRealms: {
      'system-a': { r1: { discoveredAt: 7, source: 'manual' } }
    } } } }
  });
  await revealGatheringRealm(doc, {
    realmId: 'r2', source: 'api', validateRealmExists: travelConfig, now: () => 9
  });

  const written = doc.flags.fabricate.fabricate.discoveredGatheringRealms;
  assert.deepEqual(Object.keys(written).sort(), ['r1', 'r2'], 'flat, with the bucket gone');
  assert.equal(written.r1.discoveredAt, 7, 'the legacy entry survived the flatten');
  assert.equal(written.r2.discoveredAt, 9);
});
