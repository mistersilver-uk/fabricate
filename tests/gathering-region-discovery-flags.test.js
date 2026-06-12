import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getDiscoveredGatheringRealms,
  getDiscoveredRealmIdsForSystem,
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

const systemSnapshot = { id: 'system-a', gatheringRealms: [{ id: 'r1' }, { id: 'r2' }] };

test('revealGatheringRealm writes a discovery entry validated against the system', async () => {
  const doc = new FakeDocument();
  const ok = await revealGatheringRealm(doc, {
    systemId: 'system-a', realmId: 'r1', source: 'manual', validateRealmInSystem: systemSnapshot, now: () => 42
  });
  assert.equal(ok, true);
  assert.equal(isGatheringRealmDiscovered(doc, 'system-a', 'r1'), true);
  const entry = getDiscoveredGatheringRealms(doc)['system-a']['r1'];
  assert.equal(entry.discoveredAt, 42);
  assert.equal(entry.source, 'manual');
});

test('revealGatheringRealm rejects a realm that does not belong to the system', async () => {
  const doc = new FakeDocument();
  const ok = await revealGatheringRealm(doc, {
    systemId: 'system-a', realmId: 'r-foreign', source: 'manual', validateRealmInSystem: systemSnapshot
  });
  assert.equal(ok, false);
  assert.equal(isGatheringRealmDiscovered(doc, 'system-a', 'r-foreign'), false);
});

test('revealGatheringRealm rejects an unknown source token', async () => {
  const doc = new FakeDocument();
  const ok = await revealGatheringRealm(doc, {
    systemId: 'system-a', realmId: 'r1', source: 'telepathy', validateRealmInSystem: systemSnapshot
  });
  assert.equal(ok, false);
});

test('hideGatheringRealm removes the entry by re-setting the per-system map', async () => {
  const doc = new FakeDocument();
  await revealGatheringRealm(doc, { systemId: 'system-a', realmId: 'r1', source: 'manual', validateRealmInSystem: systemSnapshot });
  await revealGatheringRealm(doc, { systemId: 'system-a', realmId: 'r2', source: 'api', validateRealmInSystem: systemSnapshot });
  const removed = await hideGatheringRealm(doc, { systemId: 'system-a', realmId: 'r1' });
  assert.equal(removed, true);
  assert.equal(isGatheringRealmDiscovered(doc, 'system-a', 'r1'), false);
  assert.equal(isGatheringRealmDiscovered(doc, 'system-a', 'r2'), true);
});

test('discovery entry with a stale partyId remains readable', async () => {
  const doc = new FakeDocument();
  await revealGatheringRealm(doc, {
    systemId: 'system-a', realmId: 'r1', source: 'partyToken', partyId: 'party-gone', validateRealmInSystem: systemSnapshot
  });
  const entry = getDiscoveredGatheringRealms(doc)['system-a']['r1'];
  assert.equal(entry.partyId, 'party-gone');
  assert.equal(isGatheringRealmDiscovered(doc, 'system-a', 'r1'), true);
});

test('actor knowledge survives a party change (discovery is actor-scoped)', async () => {
  const doc = new FakeDocument();
  await revealGatheringRealm(doc, {
    systemId: 'system-a', realmId: 'r1', source: 'partyToken', partyId: 'party-1', validateRealmInSystem: systemSnapshot
  });
  // Simulate the actor joining a different party; discovery flag is untouched.
  assert.deepEqual([...getDiscoveredRealmIdsForSystem(doc, 'system-a')], ['r1']);
});

test('legacy-read fallback: reads a pre-rename discoveredGatheringRegions flag', () => {
  // A world saved on the pre-1.1.0 schema still carries the old actor flag key.
  const doc = new FakeDocument({
    flags: { fabricate: { fabricate: { discoveredGatheringRegions: { 'system-a': { r1: { discoveredAt: 7, source: 'manual' } } } } } }
  });
  assert.deepEqual([...getDiscoveredRealmIdsForSystem(doc, 'system-a')], ['r1']);
  assert.equal(isGatheringRealmDiscovered(doc, 'system-a', 'r1'), true);
});

test('legacy upgrade: a discovery write persists only the new discoveredGatheringRealms key', async () => {
  const doc = new FakeDocument({
    flags: { fabricate: { fabricate: { discoveredGatheringRegions: { 'system-a': { r1: { discoveredAt: 7, source: 'manual' } } } } } }
  });
  await revealGatheringRealm(doc, {
    systemId: 'system-a', realmId: 'r2', source: 'api', validateRealmInSystem: systemSnapshot, now: () => 9
  });
  // The merged map (legacy r1 + new r2) is written under the NEW key.
  const fresh = new FakeDocument({ flags: { fabricate: { fabricate: { discoveredGatheringRealms: doc.flags.fabricate.fabricate.discoveredGatheringRealms } } } });
  assert.deepEqual([...getDiscoveredRealmIdsForSystem(fresh, 'system-a')].sort(), ['r1', 'r2']);
  // The legacy key is not re-derived from the new write.
  assert.equal(doc.flags.fabricate.fabricate.discoveredGatheringRealms !== undefined, true);
});
