import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createAdminStore } from '../../src/ui/svelte/stores/adminStore.js';

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function makeSystem(overrides = {}) {
  return {
    id: overrides.id || 'system-a',
    name: overrides.name || 'System A',
    description: '',
    resolutionMode: 'simple',
    features: { gathering: true },
    categories: [],
    itemTags: [],
    essenceDefinitions: [],
    items: [],
    components: [],
    gatheringRealms: overrides.gatheringRealms || [],
    requirements: { time: { enabled: false }, currency: { enabled: false, units: [] } },
    craftingCheck: { mode: 'passFail', macroUuid: null, outcomes: [] },
    recipeVisibility: { listMode: 'global' },
    ...overrides
  };
}

class PartyValidationError extends Error {
  constructor(errors) {
    super(errors.join('; '));
    this.name = 'GatheringPartyValidationError';
    this.errors = errors;
  }
}

function createServices({
  parties = [],
  realms = [],
  actors = [],
  environments = [],
  confirmResult = true,
  partyError = null,
  sceneRegions = null,
  insideActorUuids = [],
  autoRegionIds = {}
} = {}) {
  const settings = { lastManagedCraftingSystem: 'system-a' };
  const system = makeSystem({ gatheringRealms: realms });
  const systemManager = {
    getSystems: () => [system],
    getSystem: (id) => (id === system.id ? system : null),
    getItems: () => [],
    updateSystem: async (id, updates) => { Object.assign(system, updates); }
  };
  const recipeManager = { getRecipes: () => [], getRecipe: () => null };

  const partyRecords = clone(parties);
  const calls = {
    create: [], update: [], delete: [], addMember: [], removeMember: [],
    moveMember: [], setTravelActor: [], setEnabled: [], setOverride: [], clearOverride: [],
    realmCreate: [], realmUpdate: [], realmDelete: [], realmSettings: []
  };
  const confirmCalls = [];
  const markerMoveHandlers = [];

  function maybeThrow() {
    if (partyError) throw new PartyValidationError(partyError);
  }

  const partyStore = {
    list: () => clone(partyRecords),
    get: (id) => clone(partyRecords.find(p => p.id === id) || null),
    findEnabledPartyForActor: () => null,
    create: async (data) => {
      calls.create.push(clone(data));
      maybeThrow();
      const party = { id: `party-${partyRecords.length + 1}`, name: data?.name || 'New party', enabled: false, memberActorUuids: [], travelActorUuid: null, currentRealmOverrides: {} };
      partyRecords.push(party);
      return clone(party);
    },
    update: async (id, patch) => {
      calls.update.push({ id, patch: clone(patch) });
      maybeThrow();
      const index = partyRecords.findIndex(p => p.id === id);
      if (index < 0) return null;
      partyRecords[index] = { ...partyRecords[index], ...patch };
      return clone(partyRecords[index]);
    },
    delete: async (id) => {
      calls.delete.push(id);
      const index = partyRecords.findIndex(p => p.id === id);
      if (index < 0) return false;
      partyRecords.splice(index, 1);
      return true;
    },
    addMember: async (id, uuid) => {
      calls.addMember.push({ id, uuid });
      maybeThrow();
      const party = partyRecords.find(p => p.id === id);
      if (party && !party.memberActorUuids.includes(uuid)) party.memberActorUuids.push(uuid);
      return clone(party);
    },
    removeMember: async (id, uuid) => {
      calls.removeMember.push({ id, uuid });
      const party = partyRecords.find(p => p.id === id);
      if (party) party.memberActorUuids = party.memberActorUuids.filter(m => m !== uuid);
      return clone(party);
    },
    moveMember: async (from, to, uuid) => {
      calls.moveMember.push({ from, to, uuid });
      maybeThrow();
      return clone(partyRecords);
    },
    setTravelActor: async (id, uuid) => {
      calls.setTravelActor.push({ id, uuid });
      maybeThrow();
      const party = partyRecords.find(p => p.id === id);
      if (party) party.travelActorUuid = uuid;
      return clone(party);
    },
    setEnabled: async (id, enabled) => {
      calls.setEnabled.push({ id, enabled });
      maybeThrow();
      const party = partyRecords.find(p => p.id === id);
      if (party) party.enabled = enabled === true;
      return clone(party);
    },
    setCurrentRealmOverride: async (id, sys, ids) => {
      calls.setOverride.push({ id, sys, ids: clone(ids) });
      maybeThrow();
      const party = partyRecords.find(p => p.id === id);
      if (party) party.currentRealmOverrides = { ...party.currentRealmOverrides, [sys]: { mode: 'manual', realmIds: clone(ids) } };
      return clone(party);
    },
    clearCurrentRealmOverride: async (id, sys) => {
      calls.clearOverride.push({ id, sys });
      const party = partyRecords.find(p => p.id === id);
      if (party) party.currentRealmOverrides = { ...party.currentRealmOverrides, [sys]: { mode: 'none', realmIds: [] } };
      return clone(party);
    }
  };

  const realmStore = {
    listBySystem: (sys) => clone(system.gatheringRealms.filter(r => !r.craftingSystemId || r.craftingSystemId === sys)),
    get: (sys, id) => clone(system.gatheringRealms.find(r => r.id === id) || null),
    create: async (sys, data) => { calls.realmCreate.push({ sys, data: clone(data) }); system.gatheringRealms.push({ id: `region-${system.gatheringRealms.length + 1}`, name: data.name, enabled: true, secret: false, biomes: [], description: 'keep', img: 'keep.webp' }); return true; },
    update: async (sys, id, patch) => { calls.realmUpdate.push({ sys, id, patch: clone(patch) }); const r = system.gatheringRealms.find(x => x.id === id); if (r) Object.assign(r, patch); return clone(r); },
    delete: async (sys, id, collaborators) => { calls.realmDelete.push({ sys, id, collaborators: { hasEnv: !!collaborators?.environmentStore, hasParty: !!collaborators?.partyStore } }); system.gatheringRealms = system.gatheringRealms.filter(r => r.id !== id); return { deleted: { id }, referencedBy: { environments: [], partyOverrides: [] } }; },
    getRealmSettings: () => clone(system.gatheringRealmSettings || { enabled: false, revealMode: 'manual', modifierVisibility: 'visible' }),
    updateRealmSettings: async (sys, patch) => { calls.realmSettings.push({ sys, patch: clone(patch) }); system.gatheringRealmSettings = { ...(system.gatheringRealmSettings || { enabled: false, revealMode: 'manual', modifierVisibility: 'visible' }), ...patch }; return clone(system.gatheringRealmSettings); }
  };

  const locationService = {
    resolveCurrentRealms: ({ partyId, systemId }) => {
      const party = partyRecords.find(p => p.id === partyId);
      const override = party?.currentRealmOverrides?.[systemId];
      if (override?.mode === 'manual' && override.realmIds.length > 0) {
        const regionsById = new Map(system.gatheringRealms.map(r => [r.id, r]));
        const resolvedRealms = [];
        const staleRealmIds = [];
        for (const rid of override.realmIds) {
          if (regionsById.has(rid)) resolvedRealms.push(regionsById.get(rid));
          else staleRealmIds.push(rid);
        }
        return { resolved: resolvedRealms.length > 0, source: resolvedRealms.length > 0 ? 'manualOverride' : 'unresolved', realms: resolvedRealms, realmIds: resolvedRealms.map(r => r.id), staleRealmIds, partyId, systemId };
      }
      // Auto (travel-actor) sensing — driven by the mutable autoRegionIds map.
      const autoIds = autoRegionIds[partyId];
      if (Array.isArray(autoIds) && autoIds.length > 0) {
        const regionsById = new Map(system.gatheringRealms.map(r => [r.id, r]));
        const realms = autoIds.filter(id => regionsById.has(id)).map(id => regionsById.get(id));
        return { resolved: realms.length > 0, source: realms.length > 0 ? 'travelActor' : 'unresolved', realms, realmIds: realms.map(r => r.id), staleRealmIds: [], partyId, systemId };
      }
      return { resolved: false, source: 'unresolved', realms: [], realmIds: [], staleRealmIds: [], partyId, systemId };
    }
  };

  const services = {
    getSetting: (key) => settings[key] ?? '',
    setSetting: async (key, value) => { settings[key] = value; },
    getCraftingSystemManager: () => systemManager,
    getRecipeManager: () => recipeManager,
    getGatheringEnvironmentStore: () => ({ listBySystem: async () => clone(environments), list: () => clone(environments) }),
    getGatheringPartyStore: () => partyStore,
    getGatheringRealmStore: () => realmStore,
    getGatheringLocationService: () => locationService,
    getCurrentSceneRegions: () => clone(sceneRegions || { sceneUuid: '', regions: [] }),
    subscribeSceneChange: () => () => {},
    subscribeTravelMarkerMove: (handler) => { markerMoveHandlers.push(handler); return () => {}; },
    getActorUuidsInSceneRegion: (sceneRegionUuid, actorUuids) =>
      (Array.isArray(actorUuids) ? actorUuids : []).filter(uuid => insideActorUuids.includes(uuid)),
    getActorOptions: () => clone(actors),
    getScriptMacros: () => [],
    getSceneOptions: () => [],
    getRollTableOptions: () => [],
    notify: { info: () => {}, warn: () => {}, error: () => {} },
    confirmDialog: async (options) => { confirmCalls.push(clone(options)); return confirmResult; },
    localize: (key, data = {}) => Object.entries(data).reduce((m, [n, v]) => m.replaceAll(`{${n}}`, String(v)), key),
    copyToClipboard: async () => {},
    getModuleVersion: () => 'test'
  };

  return { services, calls, confirmCalls, partyRecords, system, markerMoveHandlers, autoRegionIds };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('adminStore travel section', () => {
  it('exposes parties, regions, and actor options in view state', async () => {
    const { services } = createServices({
      parties: [{ id: 'p1', name: 'Vanguard', enabled: false, memberActorUuids: [], travelActorUuid: null, currentRealmOverrides: {} }],
      realms: [{ id: 'r1', name: 'Verdant', enabled: true, secret: false, biomes: ['forest'], description: 'Old wood', img: 'verdant.webp' }],
      actors: [{ uuid: 'Actor.a', id: 'a', name: 'Aria', img: '' }]
    });
    const store = createAdminStore(services);
    await store.refresh();
    const state = get(store.viewState);
    assert.equal(state.travelParties.length, 1);
    assert.equal(state.travelParties[0].name, 'Vanguard');
    assert.equal(state.selectedSystemRealms.length, 1);
    // The Travel view-model carries the full authoring projection plus per-region counts and lists.
    assert.deepEqual(state.selectedSystemRealms[0], {
      id: 'r1',
      name: 'Verdant',
      description: 'Old wood',
      img: 'verdant.webp',
      enabled: true,
      secret: false,
      biomes: ['forest'],
      environmentCount: 0,
      partyCount: 0,
      environments: [],
      parties: []
    });
    assert.equal(state.actorOptions.length, 1);
    assert.equal(state.selectedPartyId, 'p1');
    store.destroy();
  });

  it('selectedSystemRealms includes per-region environment and party counts and lists', async () => {
    const { services } = createServices({
      parties: [
        { id: 'p1', name: 'A', enabled: true, memberActorUuids: [], travelActorUuid: 'Actor.t', currentRealmOverrides: { 'system-a': { mode: 'manual', realmIds: ['r1'] } } },
        { id: 'p2', name: 'B', enabled: false, memberActorUuids: [], travelActorUuid: null, currentRealmOverrides: {} }
      ],
      realms: [
        { id: 'r1', name: 'Verdant', enabled: true, secret: false, biomes: [] },
        { id: 'r2', name: 'Ashen', enabled: true, secret: false, biomes: [] }
      ],
      actors: [{ uuid: 'Actor.t', id: 't', name: 'Marker', img: 'marker.webp' }],
      environments: [
        { id: 'e1', name: 'Grove', img: 'grove.webp', includedRealmIds: ['r1'] },
        { id: 'e2', name: 'Glade', includedRealmIds: ['r1', 'r2'] },
        { id: 'e3', name: 'Bare', includedRealmIds: [] }
      ]
    });
    const store = createAdminStore(services);
    await store.refresh();
    const state = get(store.viewState);
    const r1 = state.selectedSystemRealms.find(r => r.id === 'r1');
    const r2 = state.selectedSystemRealms.find(r => r.id === 'r2');
    assert.equal(r1.environmentCount, 2);
    assert.equal(r1.partyCount, 1);
    assert.equal(r2.environmentCount, 1);
    assert.equal(r2.partyCount, 0);
    // Lists carry the referencing environment / party identities (with images) for the inspector.
    assert.deepEqual(r1.environments.map(e => e.name).sort((a, b) => a.localeCompare(b)), ['Glade', 'Grove']);
    assert.deepEqual(r1.parties.map(p => p.id), ['p1']);
    assert.deepEqual(r2.environments.map(e => e.name), ['Glade']);
    assert.deepEqual(r2.parties, []);
    // Environment image flows through; party image resolves from the travel-marker actor.
    assert.equal(r1.environments.find(e => e.name === 'Grove').img, 'grove.webp');
    assert.equal(r1.parties[0].img, 'marker.webp');
    store.destroy();
  });

  it('createRealmQuick appends a region to the selected system view-model', async () => {
    const { services, calls } = createServices({
      realms: [{ id: 'r1', name: 'Verdant', enabled: true, secret: false, biomes: [] }]
    });
    const store = createAdminStore(services);
    await store.refresh();
    assert.equal(get(store.viewState).selectedSystemRealms.length, 1);
    const result = await store.createRealmQuick('system-a', 'New region');
    await flush();
    assert.equal(calls.realmCreate.length, 1);
    assert.equal(calls.realmCreate[0].data.name, 'New region');
    assert.ok(result);
    assert.equal(get(store.viewState).selectedSystemRealms.length, 2);
    store.destroy();
  });

  it('createParty calls through and selects the created party', async () => {
    const { services, calls } = createServices();
    const store = createAdminStore(services);
    await flush();
    await store.createParty();
    await flush();
    assert.equal(calls.create.length, 1);
    assert.equal(get(store.viewState).selectedPartyId, 'party-1');
    store.destroy();
  });

  it('member/travel-actor/override actions call through to the party store', async () => {
    const { services, calls } = createServices({
      parties: [{ id: 'p1', name: 'Vanguard', enabled: false, memberActorUuids: [], travelActorUuid: null, currentRealmOverrides: {} }],
      realms: [{ id: 'r1', name: 'Verdant', enabled: true, secret: false, biomes: [] }],
      actors: [{ uuid: 'Actor.a', id: 'a', name: 'Aria', img: '' }]
    });
    const store = createAdminStore(services);
    await flush();
    await store.addPartyMember('p1', 'Actor.a');
    await store.setPartyTravelActor('p1', 'Actor.a');
    await store.setPartyEnabled('p1', true);
    await store.setPartyRealmOverride('p1', 'system-a', ['r1']);
    await flush();
    assert.deepEqual(calls.addMember, [{ id: 'p1', uuid: 'Actor.a' }]);
    assert.deepEqual(calls.setTravelActor, [{ id: 'p1', uuid: 'Actor.a' }]);
    assert.deepEqual(calls.setEnabled, [{ id: 'p1', enabled: true }]);
    assert.equal(calls.setOverride.length, 1);
    assert.deepEqual(calls.setOverride[0].ids, ['r1']);
    store.destroy();
  });

  // The party store emits ONE composite uniqueness message for both member and
  // travel-actor conflicts: `Actor "<uuid>" is associated with more than one
  // enabled party`. The adminStore therefore routes the duplicate-actor error by
  // operation context (which mutator was invoked), not by message text.
  it('routes the composite uniqueness error to the travelActor field when setPartyTravelActor fails', async () => {
    const { services } = createServices({
      parties: [
        { id: 'p1', name: 'Vanguard', enabled: true, memberActorUuids: [], travelActorUuid: 'Actor.t1', currentRealmOverrides: {} },
        { id: 'p2', name: 'Rearguard', enabled: true, memberActorUuids: [], travelActorUuid: 'Actor.t2', currentRealmOverrides: {} }
      ],
      actors: [
        { uuid: 'Actor.t1', id: 't1', name: 'Tam', img: '' },
        { uuid: 'Actor.t2', id: 't2', name: 'Tem', img: '' }
      ],
      // The exact composite message the real GatheringPartyStore produces.
      partyError: ['Actor "Actor.t2" is associated with more than one enabled party']
    });
    const store = createAdminStore(services);
    await flush();
    // Assigning party p1 a travel actor already used by enabled party p2.
    await store.setPartyTravelActor('p1', 'Actor.t2');
    await flush();
    const state = get(store.viewState);
    assert.ok(state.travelError, 'summary error should be set');
    assert.ok(state.travelFieldErrors.travelActor, 'travelActor field error should be set');
    assert.equal(state.travelFieldErrors.members, undefined, 'members field error should NOT be set for a travel-actor operation');
    store.destroy();
  });

  it('routes the composite uniqueness error to the members field when addPartyMember fails', async () => {
    const { services } = createServices({
      parties: [
        { id: 'p1', name: 'Vanguard', enabled: true, memberActorUuids: [], travelActorUuid: 'Actor.t1', currentRealmOverrides: {} },
        { id: 'p2', name: 'Rearguard', enabled: true, memberActorUuids: ['Actor.a'], travelActorUuid: 'Actor.t2', currentRealmOverrides: {} }
      ],
      actors: [{ uuid: 'Actor.a', id: 'a', name: 'Aria', img: '' }],
      // Same composite message — the field is resolved purely from operation context.
      partyError: ['Actor "Actor.a" is associated with more than one enabled party']
    });
    const store = createAdminStore(services);
    await flush();
    // Adding a member already owned by enabled party p2.
    await store.addPartyMember('p1', 'Actor.a');
    await flush();
    const state = get(store.viewState);
    assert.ok(state.travelFieldErrors.members, 'members field error should be set');
    assert.equal(state.travelFieldErrors.travelActor, undefined, 'travelActor field error should NOT be set for a member operation');
    store.destroy();
  });

  it('addOrMovePartyMember adds directly when the actor is in no other party', async () => {
    const { services, calls, confirmCalls } = createServices({
      parties: [{ id: 'p1', name: 'Vanguard', enabled: true, memberActorUuids: [], travelActorUuid: null, currentRealmOverrides: {} }],
      actors: [{ uuid: 'Actor.a', id: 'a', name: 'Aria', img: '' }]
    });
    const store = createAdminStore(services);
    await flush();
    await store.addOrMovePartyMember('p1', 'Actor.a');
    await flush();
    assert.deepEqual(calls.addMember, [{ id: 'p1', uuid: 'Actor.a' }]);
    assert.equal(calls.moveMember.length, 0);
    assert.equal(confirmCalls.length, 0);
    store.destroy();
  });

  it('addOrMovePartyMember confirms and moves when the actor is already in another party', async () => {
    const { services, calls, confirmCalls } = createServices({
      parties: [
        { id: 'p1', name: 'Vanguard', enabled: true, memberActorUuids: [], travelActorUuid: null, currentRealmOverrides: {} },
        { id: 'p2', name: 'Rearguard', enabled: true, memberActorUuids: ['Actor.a'], travelActorUuid: null, currentRealmOverrides: {} }
      ],
      actors: [{ uuid: 'Actor.a', id: 'a', name: 'Aria', img: '' }],
      confirmResult: true
    });
    const store = createAdminStore(services);
    await flush();
    await store.addOrMovePartyMember('p1', 'Actor.a');
    await flush();
    assert.equal(confirmCalls.length, 1);
    assert.deepEqual(calls.moveMember, [{ from: 'p2', to: 'p1', uuid: 'Actor.a' }]);
    assert.equal(calls.addMember.length, 0);
    store.destroy();
  });

  it('addOrMovePartyMember does nothing when the move is declined', async () => {
    const { services, calls } = createServices({
      parties: [
        { id: 'p1', name: 'Vanguard', enabled: true, memberActorUuids: [], travelActorUuid: null, currentRealmOverrides: {} },
        { id: 'p2', name: 'Rearguard', enabled: true, memberActorUuids: ['Actor.a'], travelActorUuid: null, currentRealmOverrides: {} }
      ],
      actors: [{ uuid: 'Actor.a', id: 'a', name: 'Aria', img: '' }],
      confirmResult: false
    });
    const store = createAdminStore(services);
    await flush();
    await store.addOrMovePartyMember('p1', 'Actor.a');
    await flush();
    assert.equal(calls.moveMember.length, 0);
    assert.equal(calls.addMember.length, 0);
    store.destroy();
  });

  it('deleteParty confirms via confirmDialog before deleting', async () => {
    const { services, calls, confirmCalls } = createServices({
      parties: [{ id: 'p1', name: 'Vanguard', enabled: false, memberActorUuids: [], travelActorUuid: null, currentRealmOverrides: {} }]
    });
    const store = createAdminStore(services);
    await flush();
    await store.deleteParty('p1');
    await flush();
    assert.equal(confirmCalls.length, 1);
    assert.deepEqual(calls.delete, ['p1']);
    store.destroy();
  });

  it('deleteParty does not delete when confirmation is declined', async () => {
    const { services, calls, confirmCalls } = createServices({
      parties: [{ id: 'p1', name: 'Vanguard', enabled: false, memberActorUuids: [], travelActorUuid: null, currentRealmOverrides: {} }],
      confirmResult: false
    });
    const store = createAdminStore(services);
    await flush();
    await store.deleteParty('p1');
    await flush();
    assert.equal(confirmCalls.length, 1);
    assert.equal(calls.delete.length, 0);
    store.destroy();
  });

  it('region quick-list create/rename/toggle call through with name/enabled only', async () => {
    const { services, calls } = createServices({
      realms: [{ id: 'r1', name: 'Verdant', enabled: true, secret: false, biomes: [], description: 'lore', img: 'pic.webp' }]
    });
    const store = createAdminStore(services);
    await flush();
    await store.createRealmQuick('system-a', 'Ashen March');
    await store.renameRealm('system-a', 'r1', 'Verdant Expanse');
    await store.toggleRealmEnabled('system-a', 'r1', false);
    await flush();
    assert.equal(calls.realmCreate.length, 1);
    assert.deepEqual(calls.realmUpdate[0].patch, { name: 'Verdant Expanse' });
    assert.deepEqual(calls.realmUpdate[1].patch, { enabled: false });
    store.destroy();
  });

  it('updateRealm merge-patches authoring fields (description/img/secret/biomes) without touching others', async () => {
    const { services, calls, system } = createServices({
      realms: [{ id: 'r1', name: 'Verdant', enabled: true, secret: false, biomes: ['forest'], description: 'lore', img: 'pic.webp' }]
    });
    const store = createAdminStore(services);
    await flush();
    await store.updateRealm('system-a', 'r1', { description: 'Ancient wood' });
    await store.updateRealm('system-a', 'r1', { secret: true });
    await store.updateRealm('system-a', 'r1', { biomes: ['forest', 'cavern'] });
    await flush();
    assert.deepEqual(calls.realmUpdate.map(c => c.patch), [
      { description: 'Ancient wood' },
      { secret: true },
      { biomes: ['forest', 'cavern'] }
    ]);
    // The store merges over the existing record, so unedited fields survive.
    const region = system.gatheringRealms.find(r => r.id === 'r1');
    assert.equal(region.name, 'Verdant');
    assert.equal(region.img, 'pic.webp');
    store.destroy();
  });

  it('setGatheringRealmsEnabled writes the enabled flag through GatheringRealmStore.updateRealmSettings', async () => {
    const { services, calls, system } = createServices();
    const store = createAdminStore(services);
    await flush();
    await store.setGatheringRealmsEnabled('system-a', true);
    await flush();
    assert.equal(calls.realmSettings.length, 1);
    assert.deepEqual(calls.realmSettings[0].patch, { enabled: true });
    assert.equal(system.gatheringRealmSettings.enabled, true);
    await store.setGatheringRealmsEnabled('system-a', false);
    await flush();
    assert.equal(system.gatheringRealmSettings.enabled, false);
    store.destroy();
  });

  it('deleteRealm confirms then passes environment/party collaborators for referenced-by evidence', async () => {
    const { services, calls, confirmCalls } = createServices({
      realms: [{ id: 'r1', name: 'Verdant', enabled: true, secret: false, biomes: [] }]
    });
    const store = createAdminStore(services);
    await flush();
    await store.deleteRealm('system-a', 'r1');
    await flush();
    assert.equal(confirmCalls.length, 1);
    assert.equal(calls.realmDelete.length, 1);
    assert.equal(calls.realmDelete[0].collaborators.hasEnv, true);
    assert.equal(calls.realmDelete[0].collaborators.hasParty, true);
    store.destroy();
  });

  it('surfaces stale member/travel-actor/override-region references for repair', async () => {
    const { services } = createServices({
      parties: [{
        id: 'p1', name: 'Vanguard', enabled: false,
        memberActorUuids: ['Actor.gone'], travelActorUuid: 'Actor.also-gone',
        currentRealmOverrides: { 'system-a': { mode: 'manual', realmIds: ['r-missing'] } }
      }],
      realms: [],
      actors: []
    });
    const store = createAdminStore(services);
    await store.refresh();
    const party = get(store.viewState).travelParties[0];
    assert.deepEqual(party.staleMembers, ['Actor.gone']);
    assert.equal(party.staleTravelActor, 'Actor.also-gone');
    assert.deepEqual(party.staleRealmIds, ['r-missing']);
    assert.equal(party.hasStaleReference, true);
    store.destroy();
  });
});

describe('adminStore Map Region Links', () => {
  const SCENE_REGIONS = {
    sceneUuid: 'Scene.s1',
    regions: [
      { sceneRegionUuid: 'Scene.s1.Region.a', name: 'Northwood', color: '#1a9c4f' },
      { sceneRegionUuid: 'Scene.s1.Region.b', name: 'Southmoor', color: '#883322' }
    ]
  };

  it('exposes the current scene regions with their existing Fabricate links', async () => {
    const { services } = createServices({
      realms: [
        {
          id: 'r1', name: 'Verdant', enabled: true, secret: false, biomes: [],
          sceneMappings: [{ id: 'm1', sceneUuid: 'Scene.s1', sceneRegionUuid: 'Scene.s1.Region.a' }]
        },
        { id: 'r2', name: 'Ashen', enabled: false, secret: false, biomes: [], sceneMappings: [] }
      ],
      sceneRegions: SCENE_REGIONS
    });
    const store = createAdminStore(services);
    await store.refresh();
    const state = get(store.viewState);
    assert.equal(state.currentSceneUuid, 'Scene.s1');
    assert.deepEqual(state.currentSceneRegions, [
      { sceneRegionUuid: 'Scene.s1.Region.a', name: 'Northwood', color: '#1a9c4f', linkedRegionId: 'r1', partiesInMapRegion: [], partiesInFabricateRealm: [] },
      { sceneRegionUuid: 'Scene.s1.Region.b', name: 'Southmoor', color: '#883322', linkedRegionId: '', partiesInMapRegion: [], partiesInFabricateRealm: [] }
    ]);
    store.destroy();
  });

  it('annotates each scene region with parties in the map region (marker inside) and in the Fabricate region', async () => {
    const { services } = createServices({
      parties: [
        // Marker inside the scene region, and current region includes the linked region r1.
        { id: 'p1', name: 'Vanguard', enabled: true, memberActorUuids: [], travelActorUuid: 'Actor.m1', currentRealmOverrides: { 'system-a': { mode: 'manual', realmIds: ['r1'] } } },
        // Current region includes r1 (in the Fabricate region) but marker NOT inside the map region.
        { id: 'p2', name: 'Rearguard', enabled: true, memberActorUuids: [], travelActorUuid: 'Actor.m2', currentRealmOverrides: { 'system-a': { mode: 'manual', realmIds: ['r1'] } } }
      ],
      realms: [{
        id: 'r1', name: 'Verdant', enabled: true, secret: false, biomes: [],
        sceneMappings: [{ id: 'm1', sceneUuid: 'Scene.s1', sceneRegionUuid: 'Scene.s1.Region.a' }]
      }],
      actors: [
        { uuid: 'Actor.m1', id: 'm1', name: 'Marker 1', img: 'm1.webp' },
        { uuid: 'Actor.m2', id: 'm2', name: 'Marker 2', img: 'm2.webp' }
      ],
      sceneRegions: SCENE_REGIONS,
      insideActorUuids: ['Actor.m1'] // only p1's marker is inside Region.a
    });
    const store = createAdminStore(services);
    await store.refresh();
    const regionA = get(store.viewState).currentSceneRegions.find(r => r.sceneRegionUuid === 'Scene.s1.Region.a');
    // Marker-inside list: only p1.
    assert.deepEqual(regionA.partiesInMapRegion, [{ id: 'p1', name: 'Vanguard', img: 'm1.webp' }]);
    // Fabricate-region list (current region includes r1): both p1 and p2.
    assert.deepEqual([...regionA.partiesInFabricateRealm.map(p => p.id)].sort((a, b) => a.localeCompare(b)), ['p1', 'p2']);
    // The unlinked region has no Fabricate-region parties.
    const regionB = get(store.viewState).currentSceneRegions.find(r => r.sceneRegionUuid === 'Scene.s1.Region.b');
    assert.deepEqual(regionB.partiesInFabricateRealm, []);
    store.destroy();
  });

  it('setMapRegionLink attaches a scene region to the chosen Fabricate region', async () => {
    const { services, calls, system } = createServices({
      realms: [{ id: 'r1', name: 'Verdant', enabled: true, secret: false, biomes: [], sceneMappings: [] }],
      sceneRegions: SCENE_REGIONS
    });
    const store = createAdminStore(services);
    await flush();
    const ok = await store.setMapRegionLink('Scene.s1.Region.a', 'r1');
    await flush();
    assert.equal(ok, true);
    assert.equal(calls.realmUpdate.length, 1);
    assert.deepEqual(calls.realmUpdate[0].patch.sceneMappings, [
      { sceneUuid: 'Scene.s1', sceneRegionUuid: 'Scene.s1.Region.a' }
    ]);
    assert.deepEqual(system.gatheringRealms[0].sceneMappings, [
      { sceneUuid: 'Scene.s1', sceneRegionUuid: 'Scene.s1.Region.a' }
    ]);
    store.destroy();
  });

  it('setMapRegionLink moves an existing link off the previous region', async () => {
    const { services, calls, system } = createServices({
      realms: [
        {
          id: 'r1', name: 'Verdant', enabled: true, secret: false, biomes: [],
          sceneMappings: [{ id: 'm1', sceneUuid: 'Scene.s1', sceneRegionUuid: 'Scene.s1.Region.a' }]
        },
        { id: 'r2', name: 'Ashen', enabled: true, secret: false, biomes: [], sceneMappings: [] }
      ],
      sceneRegions: SCENE_REGIONS
    });
    const store = createAdminStore(services);
    await flush();
    await store.setMapRegionLink('Scene.s1.Region.a', 'r2');
    await flush();
    // r1 had the mapping stripped; r2 gained it.
    assert.deepEqual(system.gatheringRealms.find(r => r.id === 'r1').sceneMappings, []);
    assert.deepEqual(system.gatheringRealms.find(r => r.id === 'r2').sceneMappings, [
      { sceneUuid: 'Scene.s1', sceneRegionUuid: 'Scene.s1.Region.a' }
    ]);
    // Both regions were persisted (one cleared, one set).
    assert.equal(calls.realmUpdate.length, 2);
    store.destroy();
  });

  it('setMapRegionLink with a falsy region clears the link everywhere on the scene', async () => {
    const { services, calls, system } = createServices({
      realms: [{
        id: 'r1', name: 'Verdant', enabled: true, secret: false, biomes: [],
        sceneMappings: [{ id: 'm1', sceneUuid: 'Scene.s1', sceneRegionUuid: 'Scene.s1.Region.a' }]
      }],
      sceneRegions: SCENE_REGIONS
    });
    const store = createAdminStore(services);
    await flush();
    await store.setMapRegionLink('Scene.s1.Region.a', null);
    await flush();
    assert.deepEqual(system.gatheringRealms[0].sceneMappings, []);
    assert.equal(calls.realmUpdate.length, 1);
    store.destroy();
  });

  it('setMapRegionLink leaves other scenes’ mappings untouched', async () => {
    const { services, system } = createServices({
      realms: [{
        id: 'r1', name: 'Verdant', enabled: true, secret: false, biomes: [],
        sceneMappings: [{ id: 'm1', sceneUuid: 'Scene.other', sceneRegionUuid: 'Scene.other.Region.z' }]
      }],
      sceneRegions: SCENE_REGIONS
    });
    const store = createAdminStore(services);
    await flush();
    await store.setMapRegionLink('Scene.s1.Region.a', 'r1');
    await flush();
    // The other scene's mapping is preserved verbatim; the current scene's link is appended.
    assert.deepEqual(system.gatheringRealms[0].sceneMappings, [
      { id: 'm1', sceneUuid: 'Scene.other', sceneRegionUuid: 'Scene.other.Region.z' },
      { sceneUuid: 'Scene.s1', sceneRegionUuid: 'Scene.s1.Region.a' }
    ]);
    store.destroy();
  });
});

describe('adminStore Map Region Links — live auto current region', () => {
  const SCENE_REGIONS = {
    sceneUuid: 'Scene.s1',
    regions: [{ sceneRegionUuid: 'Scene.s1.Region.a', name: 'Northwood', color: '#1a9c4f' }]
  };

  it('setMapRegionLink only updates sceneMappings (no party current-region writes)', async () => {
    const { services, calls } = createServices({
      parties: [{ id: 'p1', name: 'Vanguard', enabled: true, memberActorUuids: [], travelActorUuid: 'Actor.m1', currentRealmOverrides: {} }],
      realms: [{ id: 'r1', name: 'Verdant', enabled: true, secret: false, biomes: [], sceneMappings: [] }],
      sceneRegions: SCENE_REGIONS,
      insideActorUuids: ['Actor.m1']
    });
    const store = createAdminStore(services);
    await flush();
    await store.setMapRegionLink('Scene.s1.Region.a', 'r1');
    await flush();
    // The marker's current region is now DERIVED live; linking writes no override.
    assert.deepEqual(calls.setOverride, []);
    assert.equal(calls.realmUpdate.length, 1);
    store.destroy();
  });

  it('region→party lists reflect AUTO-resolved parties (no manual override)', async () => {
    const { services } = createServices({
      parties: [{ id: 'p1', name: 'Vanguard', enabled: true, memberActorUuids: [], travelActorUuid: 'Actor.m1', currentRealmOverrides: {} }],
      realms: [{
        id: 'r1', name: 'Verdant', enabled: true, secret: false, biomes: [],
        sceneMappings: [{ id: 'm1', sceneUuid: 'Scene.s1', sceneRegionUuid: 'Scene.s1.Region.a' }]
      }],
      sceneRegions: SCENE_REGIONS,
      insideActorUuids: ['Actor.m1'],
      autoRegionIds: { p1: ['r1'] } // marker live-resolves to r1
    });
    const store = createAdminStore(services);
    await store.refresh();
    const state = get(store.viewState);
    // Regions tab: the auto-resolved party is listed in the region.
    const r1 = state.selectedSystemRealms.find(r => r.id === 'r1');
    assert.deepEqual(r1.parties.map(p => p.id), ['p1']);
    assert.equal(r1.partyCount, 1);
    // Map tab: parties-in-fabricate-region also reflects the live resolution.
    const regionA = state.currentSceneRegions.find(r => r.sceneRegionUuid === 'Scene.s1.Region.a');
    assert.deepEqual(regionA.partiesInFabricateRealm.map(p => p.id), ['p1']);
    // And the Parties inspector evidence is resolved via travelActor sensing.
    assert.equal(state.travelParties[0].currentRealmEvidence.source, 'travelActor');
    assert.deepEqual(state.travelParties[0].currentRealmEvidence.realms.map(r => r.id), ['r1']);
    store.destroy();
  });

  it('refreshes the travel view-model when a party travel marker moves', async () => {
    const auto = { p1: [] };
    const { services, markerMoveHandlers } = createServices({
      parties: [{ id: 'p1', name: 'Vanguard', enabled: true, memberActorUuids: [], travelActorUuid: 'Actor.m1', currentRealmOverrides: {} }],
      realms: [{
        id: 'r1', name: 'Verdant', enabled: true, secret: false, biomes: [],
        sceneMappings: [{ id: 'm1', sceneUuid: 'Scene.s1', sceneRegionUuid: 'Scene.s1.Region.a' }]
      }],
      sceneRegions: SCENE_REGIONS,
      autoRegionIds: auto
    });
    const store = createAdminStore(services);
    await store.refresh();
    assert.equal(get(store.viewState).travelParties[0].currentRealmEvidence.resolved, false);
    assert.ok(markerMoveHandlers.length >= 1, 'the store subscribes to travel-marker movement');

    // Marker moves into Region.a → r1; firing the move handler must re-patch.
    auto.p1 = ['r1'];
    markerMoveHandlers.forEach(handler => handler('Actor.m1'));
    await flush();
    assert.equal(get(store.viewState).travelParties[0].currentRealmEvidence.resolved, true);
    assert.deepEqual(get(store.viewState).travelParties[0].currentRealmEvidence.realms.map(r => r.id), ['r1']);
    store.destroy();
  });

  it('ignores movement of tokens that are not a party travel marker', async () => {
    const auto = { p1: [] };
    const { services, markerMoveHandlers } = createServices({
      parties: [{ id: 'p1', name: 'Vanguard', enabled: true, memberActorUuids: [], travelActorUuid: 'Actor.m1', currentRealmOverrides: {} }],
      realms: [{
        id: 'r1', name: 'Verdant', enabled: true, secret: false, biomes: [],
        sceneMappings: [{ id: 'm1', sceneUuid: 'Scene.s1', sceneRegionUuid: 'Scene.s1.Region.a' }]
      }],
      sceneRegions: SCENE_REGIONS,
      autoRegionIds: auto
    });
    const store = createAdminStore(services);
    await store.refresh();
    // A non-marker token moves; even though the resolver would now return r1, no
    // re-patch happens because the actor is not a travel marker.
    auto.p1 = ['r1'];
    markerMoveHandlers.forEach(handler => handler('Actor.someone-else'));
    await flush();
    assert.equal(get(store.viewState).travelParties[0].currentRealmEvidence.resolved, false);
    store.destroy();
  });
});
