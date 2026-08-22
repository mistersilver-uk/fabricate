import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getDiscoveredGatheringRealms,
  getDiscoveredRealmIds,
  hideGatheringRealm,
  isGatheringRealmDiscovered,
  revealGatheringRealm
} from '../src/systems/gatheringRealmDiscovery.js';

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

test('hideGatheringRealm removes the entry by re-setting the map', async () => {
  const doc = new FakeDocument();
  await revealGatheringRealm(doc, { realmId: 'r1', source: 'manual', validateRealmExists: travelConfig });
  await revealGatheringRealm(doc, { realmId: 'r2', source: 'api', validateRealmExists: travelConfig });
  const removed = await hideGatheringRealm(doc, { realmId: 'r1' });
  assert.equal(removed, true);
  assert.equal(isGatheringRealmDiscovered(doc, 'r1'), false);
  assert.equal(isGatheringRealmDiscovered(doc, 'r2'), true);
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

// --- The lazy upgrade (issue 1282) -------------------------------------------------------
// The migration runner reaches two corpora and four world settings; it has no actor access at
// all, so the re-key from `[systemId][realmId]` to `[realmId]` can only happen on read. If it
// is wrong, players silently lose realm knowledge with no server-side record to recover from,
// which is why every shape below is covered.

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
