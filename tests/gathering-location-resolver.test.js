import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringLocationService } from '../src/systems/GatheringLocationService.js';

function makeService({ parties = [], regions = [] } = {}) {
  const partyMap = new Map(parties.map(p => [p.id, p]));
  const partyStore = {
    get: id => partyMap.get(id) || null,
    findEnabledPartyForActor: uuid => parties.find(p => p.enabled
      && (p.travelActorUuid === uuid || (p.memberActorUuids || []).includes(uuid))) || null
  };
  const systemManager = {
    getSystem: id => (id === 'system-a' ? { id: 'system-a', gatheringRegions: regions } : null)
  };
  return new GatheringLocationService({ partyStore, systemManager });
}

const regions = [
  { id: 'r1', name: 'Verdant', enabled: true },
  { id: 'r2', name: 'Ashen', enabled: true },
  { id: 'r-disabled', name: 'Closed', enabled: false }
];

test('manual override resolves with source manualOverride', () => {
  const service = makeService({
    regions,
    parties: [{ id: 'p1', enabled: true, currentRegionOverrides: { 'system-a': { mode: 'manual', regionIds: ['r1'] } } }]
  });
  const result = service.resolveCurrentRegions({ partyId: 'p1', systemId: 'system-a' });
  assert.equal(result.resolved, true);
  assert.equal(result.source, 'manualOverride');
  assert.deepEqual(result.regionIds, ['r1']);
});

test('override keyed per system: an override for another system does not resolve here', () => {
  const service = makeService({
    regions,
    parties: [{ id: 'p1', enabled: true, currentRegionOverrides: { 'system-b': { mode: 'manual', regionIds: ['r1'] } } }]
  });
  const result = service.resolveCurrentRegions({ partyId: 'p1', systemId: 'system-a' });
  assert.equal(result.resolved, false);
  assert.equal(result.source, 'unresolved');
});

test('mode none resolves to unresolved', () => {
  const service = makeService({
    regions,
    parties: [{ id: 'p1', enabled: true, currentRegionOverrides: { 'system-a': { mode: 'none', regionIds: [] } } }]
  });
  const result = service.resolveCurrentRegions({ partyId: 'p1', systemId: 'system-a' });
  assert.equal(result.resolved, false);
  assert.equal(result.source, 'unresolved');
});

test('no party resolves to unresolved', () => {
  const service = makeService({ regions, parties: [] });
  const result = service.resolveCurrentRegions({ partyId: 'missing', systemId: 'system-a' });
  assert.equal(result.resolved, false);
});

test('disabled region in a manual override still resolves (GM diagnostic inclusion)', () => {
  const service = makeService({
    regions,
    parties: [{ id: 'p1', enabled: true, currentRegionOverrides: { 'system-a': { mode: 'manual', regionIds: ['r-disabled'] } } }]
  });
  const result = service.resolveCurrentRegions({ partyId: 'p1', systemId: 'system-a' });
  assert.equal(result.resolved, true);
  assert.deepEqual(result.regionIds, ['r-disabled']);
});

test('missing region id surfaces as staleRegionIds and does not resolve', () => {
  const service = makeService({
    regions,
    parties: [{ id: 'p1', enabled: true, currentRegionOverrides: { 'system-a': { mode: 'manual', regionIds: ['r-gone'] } } }]
  });
  const result = service.resolveCurrentRegions({ partyId: 'p1', systemId: 'system-a' });
  assert.equal(result.resolved, false);
  assert.deepEqual(result.staleRegionIds, ['r-gone']);
  assert.deepEqual(result.regionIds, []);
});

test('mixed missing + valid region ids resolve the valid ones and report stale', () => {
  const service = makeService({
    regions,
    parties: [{ id: 'p1', enabled: true, currentRegionOverrides: { 'system-a': { mode: 'manual', regionIds: ['r1', 'r-gone'] } } }]
  });
  const result = service.resolveCurrentRegions({ partyId: 'p1', systemId: 'system-a' });
  assert.equal(result.resolved, true);
  assert.deepEqual(result.regionIds, ['r1']);
  assert.deepEqual(result.staleRegionIds, ['r-gone']);
});

test('resolveForActor uses findEnabledPartyForActor', () => {
  const service = makeService({
    regions,
    parties: [{ id: 'p1', enabled: true, memberActorUuids: ['Actor.alice'], travelActorUuid: 'Actor.t1', currentRegionOverrides: { 'system-a': { mode: 'manual', regionIds: ['r2'] } } }]
  });
  const result = service.resolveForActor({ actor: { uuid: 'Actor.alice' }, systemId: 'system-a' });
  assert.equal(result.resolved, true);
  assert.deepEqual(result.regionIds, ['r2']);
});

test('resolveForActor returns unresolved when the actor is in no enabled party', () => {
  const service = makeService({
    regions,
    parties: [{ id: 'p1', enabled: false, memberActorUuids: ['Actor.alice'] }]
  });
  const result = service.resolveForActor({ actor: { uuid: 'Actor.alice' }, systemId: 'system-a' });
  assert.equal(result.resolved, false);
  assert.equal(result.partyId, null);
});
