import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringEngine } from '../src/systems/GatheringEngine.js';
import { GatheringLocationService } from '../src/systems/GatheringLocationService.js';

const viewer = { id: 'user-1', isGM: false };
const gmViewer = { id: 'gm-1', isGM: true };
const actor = { id: 'actor-1', uuid: 'Actor.actor-1', name: 'Gatherer', items: [] };

const REGIONS = [
  { id: 'r-here', name: 'Verdant Expanse', enabled: true, secret: false },
  { id: 'r-secret', name: 'Hidden Vale', enabled: true, secret: true }
];

function system(overrides = {}) {
  return {
    id: 'system-a',
    enabled: true,
    features: { gathering: true },
    components: [],
    gatheringRegions: REGIONS,
    gatheringRegionSettings: { revealMode: 'manual', modifierVisibility: 'visible' },
    ...overrides
  };
}

function environment(overrides = {}) {
  return {
    id: 'env-a',
    craftingSystemId: 'system-a',
    name: 'Secret Grove',
    description: '',
    enabled: true,
    selectionMode: 'targeted',
    sceneUuid: null,
    includedRegionIds: ['r-secret'],
    tasks: [task()],
    ...overrides
  };
}

function task(overrides = {}) {
  return {
    id: 'task-a',
    name: 'Gather Herbs',
    description: '',
    img: 'icons/svg/item-bag.svg',
    enabled: true,
    resolutionMode: 'routed',
    toolIds: [],
    resultGroups: [{ id: 'group-a', name: 'Herbs', results: [{ id: 'res', componentId: 'herb', quantity: 1 }] }],
    resultSelection: { provider: 'macroOutcome', macroUuid: 'Macro.outcome' },
    ...overrides
  };
}

function makeEngine({ environments = [environment()], parties = [], systems = [system()] } = {}) {
  const partyMap = new Map(parties.map(p => [p.id, p]));
  const partyStore = {
    get: id => partyMap.get(id) || null,
    findEnabledPartyForActor: uuid => parties.find(p => p.enabled
      && (p.travelActorUuid === uuid || (p.memberActorUuids || []).includes(uuid))) || null
  };
  const systemManager = { getSystem: id => systems.find(s => s.id === id) || null };
  const locationResolver = new GatheringLocationService({ partyStore, systemManager });

  return new GatheringEngine({
    environmentStore: { list: () => environments },
    getSystems: () => systems,
    getSelectableActors: () => [actor],
    isActorSelectable: () => true,
    isGamePaused: () => false,
    sceneAccess: { canAttempt: () => ({ allowed: true }) },
    toolAvailability: { check: () => ({ available: true, missing: [], failedRequirements: [] }) },
    runManager: { findActiveRunForTask: () => null },
    evaluator: {
      evaluateVisibility: async () => ({ visible: true, reasonCode: 'VISIBLE', diagnostic: null }),
      evaluateCheck: async () => ({ success: true, value: 10 })
    },
    resultResolver: {
      resolveRouted: async (payload) => ({ status: 'succeeded', resultGroups: [payload.task.resultGroups[0]], checkResult: { outcome: 'success' } })
    },
    resultCreator: { create: async () => [] },
    toolBreakage: { apply: async () => [] },
    locationResolver,
    localize: (key, data) => (data ? `${key}:${JSON.stringify(data)}` : key)
  });
}

function findEnv(listing, id = 'env-a') {
  return listing.environments.find(e => e.id === id);
}

test('listing blocks an inclusion-gated environment with NO_CURRENT_REGION when no party region is set', async () => {
  const engine = makeEngine({ parties: [] });
  const listing = await engine.listForActor({ viewer, actor });
  const env = findEnv(listing);
  assert.ok(env);
  assert.ok(env.blockedReasons.some(r => r.code === 'NO_CURRENT_REGION'));
  assert.equal(env.location.gated, true);
  assert.equal(env.location.available, false);
  assert.equal(env.location.guidance.state, 'noCurrentRegion');
});

test('listing makes the environment available when the party current region matches', async () => {
  const engine = makeEngine({
    parties: [{ id: 'p1', enabled: true, memberActorUuids: ['Actor.actor-1'], travelActorUuid: 'Actor.t1', currentRegionOverrides: { 'system-a': { mode: 'manual', regionIds: ['r-secret'] } } }]
  });
  const listing = await engine.listForActor({ viewer, actor });
  const env = findEnv(listing);
  assert.equal(env.location.available, true);
  assert.equal(env.attemptable, true);
});

test('listing blocks with LOCATION_BLOCKED when current region does not match', async () => {
  const engine = makeEngine({
    parties: [{ id: 'p1', enabled: true, memberActorUuids: ['Actor.actor-1'], travelActorUuid: 'Actor.t1', currentRegionOverrides: { 'system-a': { mode: 'manual', regionIds: ['r-here'] } } }]
  });
  const listing = await engine.listForActor({ viewer, actor });
  const env = findEnv(listing);
  assert.ok(env.blockedReasons.some(r => r.code === 'LOCATION_BLOCKED'));
});

test('non-GM blocked-reason data contains no secret region id or name', async () => {
  const engine = makeEngine({
    parties: [{ id: 'p1', enabled: true, memberActorUuids: ['Actor.actor-1'], travelActorUuid: 'Actor.t1', currentRegionOverrides: { 'system-a': { mode: 'manual', regionIds: ['r-here'] } } }]
  });
  const listing = await engine.listForActor({ viewer, actor });
  const env = findEnv(listing);
  const serialized = JSON.stringify(env.blockedReasons);
  assert.equal(serialized.includes('Hidden Vale'), false);
  assert.equal(serialized.includes('r-secret'), false);
  // The undiscovered destination is summarized as a count only.
  const blocked = env.blockedReasons.find(r => r.code === 'LOCATION_BLOCKED');
  assert.equal(blocked.data.undiscoveredCount, 1);
});

test('GM sees the secret destination name in blocked-reason data', async () => {
  const engine = makeEngine({
    parties: [{ id: 'p1', enabled: true, memberActorUuids: ['Actor.actor-1'], travelActorUuid: 'Actor.t1', currentRegionOverrides: { 'system-a': { mode: 'manual', regionIds: ['r-here'] } } }]
  });
  const listing = await engine.listForActor({ viewer: gmViewer, actor });
  const env = findEnv(listing);
  const blocked = env.blockedReasons.find(r => r.code === 'LOCATION_BLOCKED');
  assert.ok(blocked.data.knownDestinations.some(d => d.label === 'Hidden Vale'));
});

test('start guard re-evaluates: override cleared between list and start ⇒ blocked', async () => {
  const party = { id: 'p1', enabled: true, memberActorUuids: ['Actor.actor-1'], travelActorUuid: 'Actor.t1', currentRegionOverrides: { 'system-a': { mode: 'manual', regionIds: ['r-secret'] } } };
  const engine = makeEngine({ parties: [party] });
  // First confirm available.
  const listing = await engine.listForActor({ viewer, actor });
  assert.equal(findEnv(listing).location.available, true);

  // Clear the override (simulate GM clearing it between list and start).
  party.currentRegionOverrides['system-a'] = { mode: 'none', regionIds: [] };
  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });
  assert.equal(result.started ?? false, false);
  assert.ok((result.blockedReasons || []).some(r => r.code === 'NO_CURRENT_REGION'));
});

test('ungated legacy environment is unaffected by location gating', async () => {
  const engine = makeEngine({ environments: [environment({ includedRegionIds: [], excludedRegionIds: [] })], parties: [] });
  const listing = await engine.listForActor({ viewer, actor });
  const env = findEnv(listing);
  assert.equal(env.location.gated, false);
  assert.equal(env.attemptable, true);
  assert.equal(env.blockedReasons.some(r => r.code === 'NO_CURRENT_REGION'), false);
});
