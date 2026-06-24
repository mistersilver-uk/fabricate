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
    gatheringRealms: REGIONS,
    // Realm/travel subsystem ENABLED so these tests exercise location gating.
    gatheringRealmSettings: { enabled: true, revealMode: 'manual', modifierVisibility: 'visible' },
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
    includedRealmIds: ['r-secret'],
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
    resultCreator: { create: async () => [] },
    toolBreakage: { apply: async () => [] },
    locationResolver,
    localize: (key, data) => (data ? `${key}:${JSON.stringify(data)}` : key)
  });
}

function findEnv(listing, id = 'env-a') {
  return listing.environments.find(e => e.id === id);
}

test('listing blocks an inclusion-gated environment with NO_CURRENT_REALM when no party realm is set', async () => {
  const engine = makeEngine({ parties: [] });
  const listing = await engine.listForActor({ viewer, actor });
  const env = findEnv(listing);
  assert.ok(env);
  assert.ok(env.blockedReasons.some(r => r.code === 'NO_CURRENT_REALM'));
  assert.equal(env.location.gated, true);
  assert.equal(env.location.available, false);
  assert.equal(env.location.guidance.state, 'noCurrentRealm');
});

test('listing makes the environment available when the party current realm matches', async () => {
  const engine = makeEngine({
    parties: [{ id: 'p1', enabled: true, memberActorUuids: ['Actor.actor-1'], travelActorUuid: 'Actor.t1', currentRealmOverrides: { 'system-a': { mode: 'manual', realmIds: ['r-secret'] } } }]
  });
  const listing = await engine.listForActor({ viewer, actor });
  const env = findEnv(listing);
  assert.equal(env.location.available, true);
  assert.equal(env.attemptable, true);
});

test('listing blocks with LOCATION_BLOCKED when current realm does not match', async () => {
  const engine = makeEngine({
    parties: [{ id: 'p1', enabled: true, memberActorUuids: ['Actor.actor-1'], travelActorUuid: 'Actor.t1', currentRealmOverrides: { 'system-a': { mode: 'manual', realmIds: ['r-here'] } } }]
  });
  const listing = await engine.listForActor({ viewer, actor });
  const env = findEnv(listing);
  assert.ok(env.blockedReasons.some(r => r.code === 'LOCATION_BLOCKED'));
});

test('a NO_CURRENT_REALM environment renders as a locked teaser (no tasks, unselectable)', async () => {
  const engine = makeEngine({ parties: [] });
  const env = findEnv(await engine.listForActor({ viewer, actor }));
  assert.equal(env.locked, true);
  assert.equal(env.attemptable, false);
  assert.deepEqual(env.tasks, []);
  assert.deepEqual(env.discoveredTasks, []);
  // The location reason + field survive on the teaser so the card can show the alert.
  assert.ok(env.blockedReasons.some(r => r.code === 'NO_CURRENT_REALM'));
  assert.equal(env.location.gated, true);
  assert.equal(env.location.available, false);
});

test('a LOCATION_BLOCKED environment renders as a locked teaser', async () => {
  const engine = makeEngine({
    parties: [{ id: 'p1', enabled: true, memberActorUuids: ['Actor.actor-1'], travelActorUuid: 'Actor.t1', currentRealmOverrides: { 'system-a': { mode: 'manual', realmIds: ['r-here'] } } }]
  });
  const env = findEnv(await engine.listForActor({ viewer, actor }));
  assert.equal(env.locked, true);
  assert.equal(env.attemptable, false);
  assert.deepEqual(env.tasks, []);
  assert.ok(env.blockedReasons.some(r => r.code === 'LOCATION_BLOCKED'));
});

test('an in-realm environment is NOT locked and still lists its tasks', async () => {
  const engine = makeEngine({
    parties: [{ id: 'p1', enabled: true, memberActorUuids: ['Actor.actor-1'], travelActorUuid: 'Actor.t1', currentRealmOverrides: { 'system-a': { mode: 'manual', realmIds: ['r-secret'] } } }]
  });
  const env = findEnv(await engine.listForActor({ viewer, actor }));
  assert.equal(env.locked, false);
  assert.ok(env.tasks.length > 0);
});

test('non-GM blocked-reason data contains no secret realm id or name', async () => {
  const engine = makeEngine({
    parties: [{ id: 'p1', enabled: true, memberActorUuids: ['Actor.actor-1'], travelActorUuid: 'Actor.t1', currentRealmOverrides: { 'system-a': { mode: 'manual', realmIds: ['r-here'] } } }]
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
    parties: [{ id: 'p1', enabled: true, memberActorUuids: ['Actor.actor-1'], travelActorUuid: 'Actor.t1', currentRealmOverrides: { 'system-a': { mode: 'manual', realmIds: ['r-here'] } } }]
  });
  const listing = await engine.listForActor({ viewer: gmViewer, actor });
  const env = findEnv(listing);
  const blocked = env.blockedReasons.find(r => r.code === 'LOCATION_BLOCKED');
  assert.ok(blocked.data.knownDestinations.some(d => d.label === 'Hidden Vale'));
});

test('start guard re-evaluates: override cleared between list and start ⇒ blocked', async () => {
  const party = { id: 'p1', enabled: true, memberActorUuids: ['Actor.actor-1'], travelActorUuid: 'Actor.t1', currentRealmOverrides: { 'system-a': { mode: 'manual', realmIds: ['r-secret'] } } };
  const engine = makeEngine({ parties: [party] });
  // First confirm available.
  const listing = await engine.listForActor({ viewer, actor });
  assert.equal(findEnv(listing).location.available, true);

  // Clear the override (simulate GM clearing it between list and start).
  party.currentRealmOverrides['system-a'] = { mode: 'none', realmIds: [] };
  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });
  assert.equal(result.started ?? false, false);
  assert.ok((result.blockedReasons || []).some(r => r.code === 'NO_CURRENT_REALM'));
});

test('ungated legacy environment is unaffected by location gating', async () => {
  const engine = makeEngine({ environments: [environment({ includedRealmIds: [], excludedRealmIds: [] })], parties: [] });
  const listing = await engine.listForActor({ viewer, actor });
  const env = findEnv(listing);
  assert.equal(env.location.gated, false);
  assert.equal(env.attemptable, true);
  assert.equal(env.blockedReasons.some(r => r.code === 'NO_CURRENT_REALM'), false);
});

// ---------------------------------------------------------------------------
// Toggle disabled: the realm/travel subsystem behaves as if no environment is
// location-gated and no travel exists.
// ---------------------------------------------------------------------------

const disabledSettings = { enabled: false, revealMode: 'manual', modifierVisibility: 'visible' };

test('disabled subsystem: a location-gated environment is NOT blocked and reports gated=false', async () => {
  const engine = makeEngine({
    systems: [system({ gatheringRealmSettings: disabledSettings })],
    parties: []
  });
  const listing = await engine.listForActor({ viewer, actor });
  const env = findEnv(listing);
  assert.ok(env);
  assert.equal(env.location.gated, false, 'location field is the ungated shape when disabled');
  assert.equal(env.location.available, true);
  assert.deepEqual(env.location.currentRealms, []);
  assert.equal(env.blockedReasons.some(r => r.code === 'NO_CURRENT_REALM'), false);
  assert.equal(env.blockedReasons.some(r => r.code === 'LOCATION_BLOCKED'), false);
  assert.equal(env.attemptable, true);
});

test('disabled subsystem: the start-attempt location guard is skipped', async () => {
  // No party / no current realm, but disabled ⇒ the start guard does not block.
  // (When ENABLED, the identical setup blocks with NO_CURRENT_REALM — see the
  // start-guard re-evaluation test above.) Downstream run-creation is out of
  // scope for this harness, so we assert only that NO location reason fires.
  const engine = makeEngine({
    systems: [system({ gatheringRealmSettings: disabledSettings })],
    parties: []
  });
  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });
  const reasons = result.blockedReasons || [];
  assert.equal(reasons.some(r => r.code === 'NO_CURRENT_REALM'), false, 'no NO_CURRENT_REALM when disabled');
  assert.equal(reasons.some(r => r.code === 'LOCATION_BLOCKED'), false, 'no LOCATION_BLOCKED when disabled');
});

test('ENABLED subsystem with no current realm blocks start (control for the disabled case)', async () => {
  const engine = makeEngine({ parties: [] });
  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-a' });
  assert.equal(result.started ?? false, false);
  assert.ok((result.blockedReasons || []).some(r => r.code === 'NO_CURRENT_REALM'));
});

test('default (no gatheringRealmSettings) behaves as disabled — no location gating', async () => {
  const engine = makeEngine({
    systems: [system({ gatheringRealmSettings: undefined })],
    parties: []
  });
  const listing = await engine.listForActor({ viewer, actor });
  const env = findEnv(listing);
  assert.equal(env.location.gated, false);
  assert.equal(env.attemptable, true);
});

// ---------------------------------------------------------------------------
// Header-bar current-realm summary (realmsEnabled + currentRealms), surfaced
// for the player app's realm chip independently of this environment's gating.
// ---------------------------------------------------------------------------

test('realms enabled: the model surfaces realmsEnabled + the party current realm (disclosed)', async () => {
  const engine = makeEngine({
    parties: [{ id: 'p1', enabled: true, memberActorUuids: ['Actor.actor-1'], travelActorUuid: 'Actor.t1', currentRealmOverrides: { 'system-a': { mode: 'manual', realmIds: ['r-here'] } } }]
  });
  const listing = await engine.listForActor({ viewer, actor });
  const env = findEnv(listing);
  assert.equal(env.realmsEnabled, true, 'realm chip flag set when the subsystem is enabled');
  assert.equal(env.currentRealms.length, 1);
  assert.equal(env.currentRealms[0].label, 'Verdant Expanse', 'non-secret current realm name disclosed');
  assert.equal(env.currentRealms[0].placeholder, false);
});

test('realms enabled, UNGATED environment still surfaces the party current realm', async () => {
  // The header realm chip must show even when the selected environment has no
  // location rules — the current realm is party-scoped, not env-gated.
  const engine = makeEngine({
    environments: [environment({ includedRealmIds: [], excludedRealmIds: [] })],
    parties: [{ id: 'p1', enabled: true, memberActorUuids: ['Actor.actor-1'], travelActorUuid: 'Actor.t1', currentRealmOverrides: { 'system-a': { mode: 'manual', realmIds: ['r-here'] } } }]
  });
  const listing = await engine.listForActor({ viewer, actor });
  const env = findEnv(listing);
  assert.equal(env.location.gated, false, 'environment itself is ungated');
  assert.equal(env.realmsEnabled, true);
  assert.equal(env.currentRealms[0]?.label, 'Verdant Expanse', 'current realm surfaced despite no gating');
});

test('realms enabled, no current realm: realmsEnabled true with an empty list', async () => {
  const engine = makeEngine({ parties: [] });
  const listing = await engine.listForActor({ viewer, actor });
  const env = findEnv(listing);
  assert.equal(env.realmsEnabled, true);
  assert.deepEqual(env.currentRealms, [], 'no party realm → empty list ("no realm selected")');
});

test('realms enabled: a secret undiscovered current realm is redacted to a placeholder', async () => {
  const engine = makeEngine({
    parties: [{ id: 'p1', enabled: true, memberActorUuids: ['Actor.actor-1'], travelActorUuid: 'Actor.t1', currentRealmOverrides: { 'system-a': { mode: 'manual', realmIds: ['r-secret'] } } }]
  });
  const listing = await engine.listForActor({ viewer, actor });
  const env = findEnv(listing);
  assert.equal(env.realmsEnabled, true);
  assert.equal(env.currentRealms[0].placeholder, true, 'secret undiscovered realm is redacted');
  const serialized = JSON.stringify(env.currentRealms);
  assert.equal(serialized.includes('Hidden Vale'), false, 'no secret name leak');
  assert.equal(serialized.includes('r-secret'), false, 'no secret id leak');
});

test('realms disabled: realmsEnabled false with an empty current-realm list', async () => {
  const engine = makeEngine({
    systems: [system({ gatheringRealmSettings: disabledSettings })],
    parties: [{ id: 'p1', enabled: true, memberActorUuids: ['Actor.actor-1'], travelActorUuid: 'Actor.t1', currentRealmOverrides: { 'system-a': { mode: 'manual', realmIds: ['r-here'] } } }]
  });
  const listing = await engine.listForActor({ viewer, actor });
  const env = findEnv(listing);
  assert.equal(env.realmsEnabled, false, 'realm chip flag off when the subsystem is disabled');
  assert.deepEqual(env.currentRealms, []);
});

// ---------------------------------------------------------------------------
// Listing-level realm context (listing.realmContext) — the party/system current
// realm surfaced for the header chip independent of any environment selection,
// so the chip shows even when every environment is realm-locked and none is
// selectable. Uses STORE contract keys (enabled/realms/systemId) so the View
// passes it straight through setRealmContext.
// ---------------------------------------------------------------------------

test('listing.realmContext: realms on + resolved realm surfaces the disclosed realm with no selection', async () => {
  const engine = makeEngine({
    // Ungated environment so it is available with no realm-lock — proves the
    // listing-level context is independent of any selected/gated environment.
    environments: [environment({ includedRealmIds: [], excludedRealmIds: [] })],
    parties: [{ id: 'p1', enabled: true, memberActorUuids: ['Actor.actor-1'], travelActorUuid: 'Actor.t1', currentRealmOverrides: { 'system-a': { mode: 'manual', realmIds: ['r-here'] } } }]
  });
  const listing = await engine.listForActor({ viewer, actor });
  assert.equal(listing.realmContext.enabled, true);
  assert.equal(listing.realmContext.systemId, 'system-a');
  assert.equal(listing.realmContext.realms.length, 1);
  assert.equal(listing.realmContext.realms[0].label, 'Verdant Expanse');
  assert.equal(listing.realmContext.realms[0].placeholder, false);
});

test('listing.realmContext: realms on + no current realm is enabled:true with an empty realm list', async () => {
  // The core repro: every environment is realm-locked and none is selectable,
  // but the chip must still show ("No current realm").
  const engine = makeEngine({ parties: [] });
  const listing = await engine.listForActor({ viewer, actor });
  assert.equal(listing.realmContext.enabled, true);
  assert.equal(listing.realmContext.systemId, 'system-a');
  assert.deepEqual(listing.realmContext.realms, []);
});

test('listing.realmContext: realms off is enabled:false with no system id', async () => {
  const engine = makeEngine({
    systems: [system({ gatheringRealmSettings: disabledSettings })],
    parties: [{ id: 'p1', enabled: true, memberActorUuids: ['Actor.actor-1'], travelActorUuid: 'Actor.t1', currentRealmOverrides: { 'system-a': { mode: 'manual', realmIds: ['r-here'] } } }]
  });
  const listing = await engine.listForActor({ viewer, actor });
  assert.equal(listing.realmContext.enabled, false);
  assert.equal(listing.realmContext.systemId, null);
  assert.deepEqual(listing.realmContext.realms, []);
});

test('listing.realmContext: a secret undiscovered current realm is redacted (no leak in the serialized listing)', async () => {
  const engine = makeEngine({
    environments: [environment({ includedRealmIds: [], excludedRealmIds: [] })],
    parties: [{ id: 'p1', enabled: true, memberActorUuids: ['Actor.actor-1'], travelActorUuid: 'Actor.t1', currentRealmOverrides: { 'system-a': { mode: 'manual', realmIds: ['r-secret'] } } }]
  });
  const listing = await engine.listForActor({ viewer, actor });
  assert.equal(listing.realmContext.enabled, true);
  assert.equal(listing.realmContext.realms[0].placeholder, true, 'secret undiscovered realm redacted');
  const serialized = JSON.stringify(listing.realmContext);
  assert.equal(serialized.includes('Hidden Vale'), false, 'no secret name leak');
  assert.equal(serialized.includes('r-secret'), false, 'no secret id leak');
});

test('listing.realmContext: more than one realm-enabled system is ambiguous (enabled:false)', async () => {
  // Two realm-enabled gathering systems present — a single chip cannot honestly
  // represent both, so the listing-level chip falls back to selection-driven.
  const systemB = system({ id: 'system-b' });
  const engine = makeEngine({
    environments: [
      environment({ includedRealmIds: [], excludedRealmIds: [] }),
      environment({ id: 'env-b', craftingSystemId: 'system-b', includedRealmIds: [], excludedRealmIds: [] })
    ],
    systems: [system(), systemB],
    parties: [{ id: 'p1', enabled: true, memberActorUuids: ['Actor.actor-1'], travelActorUuid: 'Actor.t1', currentRealmOverrides: { 'system-a': { mode: 'manual', realmIds: ['r-here'] } } }]
  });
  const listing = await engine.listForActor({ viewer, actor });
  assert.equal(listing.realmContext.enabled, false, 'ambiguous multi-system → chip omitted');
  assert.equal(listing.realmContext.systemId, null);
  assert.deepEqual(listing.realmContext.realms, []);
});

test('listing.realmContext: exactly one realm-enabled system among several is unambiguous (chip shows)', async () => {
  // system-a has realms on, system-b has realms off — only one realm-enabled
  // system present, so the chip resolves to system-a despite the second system.
  const systemB = system({ id: 'system-b', gatheringRealmSettings: disabledSettings });
  const engine = makeEngine({
    environments: [
      environment({ includedRealmIds: [], excludedRealmIds: [] }),
      environment({ id: 'env-b', craftingSystemId: 'system-b', includedRealmIds: [], excludedRealmIds: [] })
    ],
    systems: [system(), systemB],
    parties: [{ id: 'p1', enabled: true, memberActorUuids: ['Actor.actor-1'], travelActorUuid: 'Actor.t1', currentRealmOverrides: { 'system-a': { mode: 'manual', realmIds: ['r-here'] } } }]
  });
  const listing = await engine.listForActor({ viewer, actor });
  assert.equal(listing.realmContext.enabled, true);
  assert.equal(listing.realmContext.systemId, 'system-a');
  assert.equal(listing.realmContext.realms[0].label, 'Verdant Expanse');
});

test('_emptyListing returns a well-formed realmContext (enabled:false, realms:[], systemId:null)', async () => {
  // No environments configured → empty listing; the View's setRealmContext must
  // never see an undefined realmContext.
  const engine = makeEngine({ environments: [] });
  const listing = await engine.listForActor({ viewer, actor });
  assert.deepEqual(listing.environments, []);
  assert.deepEqual(listing.realmContext, { enabled: false, realms: [], systemId: null });
});
