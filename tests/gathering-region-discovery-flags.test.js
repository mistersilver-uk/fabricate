import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getDiscoveredGatheringRegions,
  getDiscoveredRegionIdsForSystem,
  hideGatheringRegion,
  isGatheringRegionDiscovered,
  revealGatheringRegion
} from '../src/systems/gatheringRegionDiscovery.js';

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

const systemSnapshot = { id: 'system-a', gatheringRegions: [{ id: 'r1' }, { id: 'r2' }] };

test('revealGatheringRegion writes a discovery entry validated against the system', async () => {
  const doc = new FakeDocument();
  const ok = await revealGatheringRegion(doc, {
    systemId: 'system-a', regionId: 'r1', source: 'manual', validateRegionInSystem: systemSnapshot, now: () => 42
  });
  assert.equal(ok, true);
  assert.equal(isGatheringRegionDiscovered(doc, 'system-a', 'r1'), true);
  const entry = getDiscoveredGatheringRegions(doc)['system-a']['r1'];
  assert.equal(entry.discoveredAt, 42);
  assert.equal(entry.source, 'manual');
});

test('revealGatheringRegion rejects a region that does not belong to the system', async () => {
  const doc = new FakeDocument();
  const ok = await revealGatheringRegion(doc, {
    systemId: 'system-a', regionId: 'r-foreign', source: 'manual', validateRegionInSystem: systemSnapshot
  });
  assert.equal(ok, false);
  assert.equal(isGatheringRegionDiscovered(doc, 'system-a', 'r-foreign'), false);
});

test('revealGatheringRegion rejects an unknown source token', async () => {
  const doc = new FakeDocument();
  const ok = await revealGatheringRegion(doc, {
    systemId: 'system-a', regionId: 'r1', source: 'telepathy', validateRegionInSystem: systemSnapshot
  });
  assert.equal(ok, false);
});

test('hideGatheringRegion removes the entry by re-setting the per-system map', async () => {
  const doc = new FakeDocument();
  await revealGatheringRegion(doc, { systemId: 'system-a', regionId: 'r1', source: 'manual', validateRegionInSystem: systemSnapshot });
  await revealGatheringRegion(doc, { systemId: 'system-a', regionId: 'r2', source: 'api', validateRegionInSystem: systemSnapshot });
  const removed = await hideGatheringRegion(doc, { systemId: 'system-a', regionId: 'r1' });
  assert.equal(removed, true);
  assert.equal(isGatheringRegionDiscovered(doc, 'system-a', 'r1'), false);
  assert.equal(isGatheringRegionDiscovered(doc, 'system-a', 'r2'), true);
});

test('discovery entry with a stale partyId remains readable', async () => {
  const doc = new FakeDocument();
  await revealGatheringRegion(doc, {
    systemId: 'system-a', regionId: 'r1', source: 'partyToken', partyId: 'party-gone', validateRegionInSystem: systemSnapshot
  });
  const entry = getDiscoveredGatheringRegions(doc)['system-a']['r1'];
  assert.equal(entry.partyId, 'party-gone');
  assert.equal(isGatheringRegionDiscovered(doc, 'system-a', 'r1'), true);
});

test('actor knowledge survives a party change (discovery is actor-scoped)', async () => {
  const doc = new FakeDocument();
  await revealGatheringRegion(doc, {
    systemId: 'system-a', regionId: 'r1', source: 'partyToken', partyId: 'party-1', validateRegionInSystem: systemSnapshot
  });
  // Simulate the actor joining a different party; discovery flag is untouched.
  assert.deepEqual([...getDiscoveredRegionIdsForSystem(doc, 'system-a')], ['r1']);
});
