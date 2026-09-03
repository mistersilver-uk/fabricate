import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringLocationService } from '../src/systems/GatheringLocationService.js';

/**
 * Since issue 1282 the resolver answers ONE question — where is this party — and it needs no
 * crafting system to answer it. Realms come from the world travel store, and the per-system
 * travel toggle has moved entirely to the consumption side, in
 * `GatheringEngine._locationBlockedReasons`. So there is no `systemId` and no gate here.
 */
function makeService({ parties = [], realms = [], senseSceneRegions } = {}) {
  const partyMap = new Map(parties.map(p => [p.id, p]));
  const partyStore = {
    get: id => partyMap.get(id) || null,
    findEnabledPartyForActor: uuid => parties.find(p => p.enabled
      && (p.travelActorUuid === uuid || (p.memberActorUuids || []).includes(uuid))) || null
  };
  const travelStore = { list: () => realms };
  return new GatheringLocationService({ partyStore, travelStore, senseSceneRegions });
}

const realms = [
  { id: 'r1', name: 'Verdant', enabled: true },
  { id: 'r2', name: 'Ashen', enabled: true },
  { id: 'r-disabled', name: 'Closed', enabled: false }
];

test('manual override resolves with source manualOverride', () => {
  const service = makeService({
    realms,
    parties: [{ id: 'p1', enabled: true, currentRealmOverride: { mode: 'manual', realmIds: ['r1'] } }]
  });
  const result = service.resolveCurrentRealms({ partyId: 'p1' });
  assert.equal(result.resolved, true);
  assert.equal(result.source, 'manualOverride');
  assert.deepEqual(result.realmIds, ['r1']);
});

test('the override is no longer keyed by crafting system — a party is in ONE place', () => {
  // This test used to assert the opposite: that an override set for system B did not resolve
  // for system A. With world realms that distinction had no referent — "where is the party,
  // according to system A" is not a question with an answer — so the override collapsed to one
  // per party and the resolver stopped taking a system at all.
  const service = makeService({
    realms,
    parties: [{ id: 'p1', enabled: true, currentRealmOverride: { mode: 'manual', realmIds: ['r1'] } }]
  });
  const result = service.resolveCurrentRealms({ partyId: 'p1' });
  assert.equal(result.resolved, true);
  assert.deepEqual(result.realmIds, ['r1']);
  assert.equal('systemId' in result, false, 'the result carries no system either');
});

test('mode none resolves to unresolved', () => {
  const service = makeService({
    realms,
    parties: [{ id: 'p1', enabled: true, currentRealmOverride: { mode: 'none', realmIds: [] } }]
  });
  const result = service.resolveCurrentRealms({ partyId: 'p1' });
  assert.equal(result.resolved, false);
  assert.equal(result.source, 'unresolved');
});

test('no party resolves to unresolved', () => {
  const service = makeService({ realms, parties: [] });
  const result = service.resolveCurrentRealms({ partyId: 'missing' });
  assert.equal(result.resolved, false);
});

test('disabled realm in a manual override still resolves (GM diagnostic inclusion)', () => {
  const service = makeService({
    realms,
    parties: [{ id: 'p1', enabled: true, currentRealmOverride: { mode: 'manual', realmIds: ['r-disabled'] } }]
  });
  const result = service.resolveCurrentRealms({ partyId: 'p1' });
  assert.equal(result.resolved, true);
  assert.deepEqual(result.realmIds, ['r-disabled']);
});

test('missing realm id surfaces as staleRealmIds and does not resolve', () => {
  const service = makeService({
    realms,
    parties: [{ id: 'p1', enabled: true, currentRealmOverride: { mode: 'manual', realmIds: ['r-gone'] } }]
  });
  const result = service.resolveCurrentRealms({ partyId: 'p1' });
  assert.equal(result.resolved, false);
  assert.deepEqual(result.staleRealmIds, ['r-gone']);
  assert.deepEqual(result.realmIds, []);
});

test('mixed missing + valid realm ids resolve the valid ones and report stale', () => {
  const service = makeService({
    realms,
    parties: [{ id: 'p1', enabled: true, currentRealmOverride: { mode: 'manual', realmIds: ['r1', 'r-gone'] } }]
  });
  const result = service.resolveCurrentRealms({ partyId: 'p1' });
  assert.equal(result.resolved, true);
  assert.deepEqual(result.realmIds, ['r1']);
  assert.deepEqual(result.staleRealmIds, ['r-gone']);
});

test('resolveForActor uses findEnabledPartyForActor', () => {
  const service = makeService({
    realms,
    parties: [{ id: 'p1', enabled: true, memberActorUuids: ['Actor.alice'], travelActorUuid: 'Actor.t1', currentRealmOverride: { mode: 'manual', realmIds: ['r2'] } }]
  });
  const result = service.resolveForActor({ actor: { uuid: 'Actor.alice' } });
  assert.equal(result.resolved, true);
  assert.deepEqual(result.realmIds, ['r2']);
});

test('resolveForActor returns unresolved when the actor is in no enabled party', () => {
  const service = makeService({
    realms,
    parties: [{ id: 'p1', enabled: false, memberActorUuids: ['Actor.alice'] }]
  });
  const result = service.resolveForActor({ actor: { uuid: 'Actor.alice' } });
  assert.equal(result.resolved, false);
  assert.equal(result.partyId, null);
});

// ---------------------------------------------------------------------------
// Toggle disabled: every resolver entry point fast-exits to unresolved-empty.
// ---------------------------------------------------------------------------

const overrideParty = { id: 'p1', enabled: true, memberActorUuids: ['Actor.alice'], travelActorUuid: 'Actor.t1', currentRealmOverride: { mode: 'manual', realmIds: ['r1'] } };

// The three tests that stood here asserted the resolver fast-exiting when a system's travel
// toggle was off. That gate MOVED in issue 1282: where a party is standing does not depend on
// any crafting system, so the resolver always answers, and the toggle decides only whether a
// given system's environments are gated by that answer. These assert the new contract.

test('resolution does NOT depend on any crafting system toggle', () => {
  const service = makeService({ realms, parties: [overrideParty] });
  const result = service.resolveCurrentRealms({ partyId: 'p1' });

  assert.equal(result.resolved, true, 'the party is somewhere regardless of who is asking');
  assert.deepEqual(result.realmIds, ['r1']);
});

test('resolveForActor answers for any actor in an enabled party, ungated', () => {
  const service = makeService({ realms, parties: [overrideParty] });
  const result = service.resolveForActor({ actor: { uuid: 'Actor.alice' } });

  assert.equal(result.resolved, true);
  assert.equal(result.partyId, 'p1');
});

test('buildCurrentRealmContext is the same answer, ungated', () => {
  const service = makeService({ realms, parties: [overrideParty] });
  const result = service.buildCurrentRealmContext({ actor: { uuid: 'Actor.alice' } });

  assert.equal(result.resolved, true);
  assert.deepEqual(result.realms.map((realm) => realm.id), ['r1']);
});

// ---------------------------------------------------------------------------
// Auto (travel-actor) sensing: current realm derived live from the marker's
// token position via realm sceneMappings, when there is no manual override.
// ---------------------------------------------------------------------------

const mappedRealms = [
  { id: 'r1', name: 'Verdant', enabled: true, sceneMappings: [{ sceneUuid: 'Scene.s1', sceneRegionUuid: 'Scene.s1.Realm.a' }] },
  { id: 'r2', name: 'Ashen', enabled: true, sceneMappings: [{ sceneUuid: 'Scene.s1', sceneRegionUuid: 'Scene.s1.Realm.b' }] },
  { id: 'r3', name: 'Unmapped', enabled: true, sceneMappings: [] }
];

test('auto: marker inside a linked Scene Realm resolves the Fabricate realm (source travelActor)', () => {
  const service = makeService({
    realms: mappedRealms,
    parties: [{ id: 'p1', enabled: true, travelActorUuid: 'Actor.m1', currentRealmOverride: null }],
    senseSceneRegions: (uuid) => (uuid === 'Actor.m1' ? ['Scene.s1.Realm.a'] : [])
  });
  const result = service.resolveCurrentRealms({ partyId: 'p1' });
  assert.equal(result.resolved, true);
  assert.equal(result.source, 'travelActor');
  assert.deepEqual(result.realmIds, ['r1']);
});

test('auto: marker inside multiple linked Scene Realms resolves all matching Fabricate realms', () => {
  const service = makeService({
    realms: mappedRealms,
    parties: [{ id: 'p1', enabled: true, travelActorUuid: 'Actor.m1', currentRealmOverride: { mode: 'none', realmIds: [] } }],
    senseSceneRegions: () => new Set(['Scene.s1.Realm.a', 'Scene.s1.Realm.b'])
  });
  const result = service.resolveCurrentRealms({ partyId: 'p1' });
  assert.equal(result.resolved, true);
  assert.equal(result.source, 'travelActor');
  assert.deepEqual([...result.realmIds].sort((a, b) => a.localeCompare(b)), ['r1', 'r2']);
});

test('auto: a manual override still wins over live sensing', () => {
  const service = makeService({
    realms: mappedRealms,
    parties: [{ id: 'p1', enabled: true, travelActorUuid: 'Actor.m1', currentRealmOverride: { mode: 'manual', realmIds: ['r2'] } }],
    senseSceneRegions: () => ['Scene.s1.Realm.a']
  });
  const result = service.resolveCurrentRealms({ partyId: 'p1' });
  assert.equal(result.source, 'manualOverride');
  assert.deepEqual(result.realmIds, ['r2']);
});

test('auto: marker in no linked Scene Realm resolves to unresolved', () => {
  const service = makeService({
    realms: mappedRealms,
    parties: [{ id: 'p1', enabled: true, travelActorUuid: 'Actor.m1', currentRealmOverride: null }],
    senseSceneRegions: () => ['Scene.s1.Realm.unmapped']
  });
  const result = service.resolveCurrentRealms({ partyId: 'p1' });
  assert.equal(result.resolved, false);
  assert.equal(result.source, 'unresolved');
});

test('auto: a travel-actor-less party resolves to unresolved (no sensing attempted)', () => {
  let sensed = false;
  const service = makeService({
    realms: mappedRealms,
    parties: [{ id: 'p1', enabled: true, currentRealmOverride: null }],
    senseSceneRegions: () => { sensed = true; return ['Scene.s1.Realm.a']; }
  });
  const result = service.resolveCurrentRealms({ partyId: 'p1' });
  assert.equal(result.resolved, false);
  assert.equal(sensed, false, 'no marker ⇒ no sensing call');
});

test('auto: resolveForActor derives the realm from the party marker for a member', () => {
  const service = makeService({
    realms: mappedRealms,
    parties: [{ id: 'p1', enabled: true, memberActorUuids: ['Actor.alice'], travelActorUuid: 'Actor.m1', currentRealmOverride: null }],
    senseSceneRegions: (uuid) => (uuid === 'Actor.m1' ? ['Scene.s1.Realm.b'] : [])
  });
  const result = service.resolveForActor({ actor: { uuid: 'Actor.alice' } });
  assert.equal(result.resolved, true);
  assert.deepEqual(result.realmIds, ['r2']);
});
