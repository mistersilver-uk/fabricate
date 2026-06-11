import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringLocationService } from '../src/systems/GatheringLocationService.js';

function makeService({ parties = [], regions = [], enabled = true, senseSceneRegions } = {}) {
  const partyMap = new Map(parties.map(p => [p.id, p]));
  const partyStore = {
    get: id => partyMap.get(id) || null,
    findEnabledPartyForActor: uuid => parties.find(p => p.enabled
      && (p.travelActorUuid === uuid || (p.memberActorUuids || []).includes(uuid))) || null
  };
  const systemManager = {
    getSystem: id => (id === 'system-a'
      ? { id: 'system-a', gatheringRegions: regions, gatheringRegionSettings: { enabled } }
      : null)
  };
  return new GatheringLocationService({ partyStore, systemManager, senseSceneRegions });
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

// ---------------------------------------------------------------------------
// Toggle disabled: every resolver entry point fast-exits to unresolved-empty.
// ---------------------------------------------------------------------------

const overrideParty = { id: 'p1', enabled: true, memberActorUuids: ['Actor.alice'], travelActorUuid: 'Actor.t1', currentRegionOverrides: { 'system-a': { mode: 'manual', regionIds: ['r1'] } } };

test('resolveCurrentRegions fast-exits to unresolved-empty when the subsystem is disabled', () => {
  const service = makeService({ enabled: false, regions, parties: [overrideParty] });
  const result = service.resolveCurrentRegions({ partyId: 'p1', systemId: 'system-a' });
  assert.equal(result.resolved, false);
  assert.equal(result.source, 'unresolved');
  assert.deepEqual(result.regionIds, []);
  assert.deepEqual(result.regions, []);
  assert.deepEqual(result.staleRegionIds, []);
});

test('resolveForActor fast-exits to unresolved-empty when the subsystem is disabled', () => {
  const service = makeService({ enabled: false, regions, parties: [overrideParty] });
  const result = service.resolveForActor({ actor: { uuid: 'Actor.alice' }, systemId: 'system-a' });
  assert.equal(result.resolved, false);
  assert.equal(result.source, 'unresolved');
  assert.deepEqual(result.regionIds, []);
  assert.equal(result.partyId, null);
});

test('buildCurrentRegionContext fast-exits to unresolved-empty when the subsystem is disabled', () => {
  const service = makeService({ enabled: false, regions, parties: [overrideParty] });
  const result = service.buildCurrentRegionContext({ actor: { uuid: 'Actor.alice' }, systemId: 'system-a' });
  assert.equal(result.resolved, false);
  assert.equal(result.source, 'unresolved');
  assert.deepEqual(result.regions, []);
});

// ---------------------------------------------------------------------------
// Auto (travel-actor) sensing: current region derived live from the marker's
// token position via region sceneMappings, when there is no manual override.
// ---------------------------------------------------------------------------

const mappedRegions = [
  { id: 'r1', name: 'Verdant', enabled: true, sceneMappings: [{ sceneUuid: 'Scene.s1', sceneRegionUuid: 'Scene.s1.Region.a' }] },
  { id: 'r2', name: 'Ashen', enabled: true, sceneMappings: [{ sceneUuid: 'Scene.s1', sceneRegionUuid: 'Scene.s1.Region.b' }] },
  { id: 'r3', name: 'Unmapped', enabled: true, sceneMappings: [] }
];

test('auto: marker inside a linked Scene Region resolves the Fabricate region (source travelActor)', () => {
  const service = makeService({
    regions: mappedRegions,
    parties: [{ id: 'p1', enabled: true, travelActorUuid: 'Actor.m1', currentRegionOverrides: {} }],
    senseSceneRegions: (uuid) => (uuid === 'Actor.m1' ? ['Scene.s1.Region.a'] : [])
  });
  const result = service.resolveCurrentRegions({ partyId: 'p1', systemId: 'system-a' });
  assert.equal(result.resolved, true);
  assert.equal(result.source, 'travelActor');
  assert.deepEqual(result.regionIds, ['r1']);
});

test('auto: marker inside multiple linked Scene Regions resolves all matching Fabricate regions', () => {
  const service = makeService({
    regions: mappedRegions,
    parties: [{ id: 'p1', enabled: true, travelActorUuid: 'Actor.m1', currentRegionOverrides: { 'system-a': { mode: 'none', regionIds: [] } } }],
    senseSceneRegions: () => new Set(['Scene.s1.Region.a', 'Scene.s1.Region.b'])
  });
  const result = service.resolveCurrentRegions({ partyId: 'p1', systemId: 'system-a' });
  assert.equal(result.resolved, true);
  assert.equal(result.source, 'travelActor');
  assert.deepEqual(result.regionIds.sort(), ['r1', 'r2']);
});

test('auto: a manual override still wins over live sensing', () => {
  const service = makeService({
    regions: mappedRegions,
    parties: [{ id: 'p1', enabled: true, travelActorUuid: 'Actor.m1', currentRegionOverrides: { 'system-a': { mode: 'manual', regionIds: ['r2'] } } }],
    senseSceneRegions: () => ['Scene.s1.Region.a']
  });
  const result = service.resolveCurrentRegions({ partyId: 'p1', systemId: 'system-a' });
  assert.equal(result.source, 'manualOverride');
  assert.deepEqual(result.regionIds, ['r2']);
});

test('auto: marker in no linked Scene Region resolves to unresolved', () => {
  const service = makeService({
    regions: mappedRegions,
    parties: [{ id: 'p1', enabled: true, travelActorUuid: 'Actor.m1', currentRegionOverrides: {} }],
    senseSceneRegions: () => ['Scene.s1.Region.unmapped']
  });
  const result = service.resolveCurrentRegions({ partyId: 'p1', systemId: 'system-a' });
  assert.equal(result.resolved, false);
  assert.equal(result.source, 'unresolved');
});

test('auto: a travel-actor-less party resolves to unresolved (no sensing attempted)', () => {
  let sensed = false;
  const service = makeService({
    regions: mappedRegions,
    parties: [{ id: 'p1', enabled: true, currentRegionOverrides: {} }],
    senseSceneRegions: () => { sensed = true; return ['Scene.s1.Region.a']; }
  });
  const result = service.resolveCurrentRegions({ partyId: 'p1', systemId: 'system-a' });
  assert.equal(result.resolved, false);
  assert.equal(sensed, false, 'no marker ⇒ no sensing call');
});

test('auto: resolveForActor derives the region from the party marker for a member', () => {
  const service = makeService({
    regions: mappedRegions,
    parties: [{ id: 'p1', enabled: true, memberActorUuids: ['Actor.alice'], travelActorUuid: 'Actor.m1', currentRegionOverrides: {} }],
    senseSceneRegions: (uuid) => (uuid === 'Actor.m1' ? ['Scene.s1.Region.b'] : [])
  });
  const result = service.resolveForActor({ actor: { uuid: 'Actor.alice' }, systemId: 'system-a' });
  assert.equal(result.resolved, true);
  assert.deepEqual(result.regionIds, ['r2']);
});
