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
    advancedOptionsEnabled: true,
    categories: [],
    itemTags: [],
    essenceDefinitions: [],
    items: [],
    components: [],
    gatheringRegions: overrides.gatheringRegions || [],
    requirements: { time: { enabled: false }, currency: { enabled: false, provider: 'macro' } },
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
  regions = [],
  actors = [],
  confirmResult = true,
  partyError = null
} = {}) {
  const settings = { lastManagedCraftingSystem: 'system-a' };
  const system = makeSystem({ gatheringRegions: regions });
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
    regionCreate: [], regionUpdate: [], regionDelete: []
  };
  const confirmCalls = [];

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
      const party = { id: `party-${partyRecords.length + 1}`, name: data?.name || 'New party', enabled: false, memberActorUuids: [], travelActorUuid: null, currentRegionOverrides: {} };
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
    setCurrentRegionOverride: async (id, sys, ids) => {
      calls.setOverride.push({ id, sys, ids: clone(ids) });
      maybeThrow();
      const party = partyRecords.find(p => p.id === id);
      if (party) party.currentRegionOverrides = { ...party.currentRegionOverrides, [sys]: { mode: 'manual', regionIds: clone(ids) } };
      return clone(party);
    },
    clearCurrentRegionOverride: async (id, sys) => {
      calls.clearOverride.push({ id, sys });
      const party = partyRecords.find(p => p.id === id);
      if (party) party.currentRegionOverrides = { ...party.currentRegionOverrides, [sys]: { mode: 'none', regionIds: [] } };
      return clone(party);
    }
  };

  const regionStore = {
    listBySystem: (sys) => clone(system.gatheringRegions.filter(r => !r.craftingSystemId || r.craftingSystemId === sys)),
    get: (sys, id) => clone(system.gatheringRegions.find(r => r.id === id) || null),
    create: async (sys, data) => { calls.regionCreate.push({ sys, data: clone(data) }); system.gatheringRegions.push({ id: `region-${system.gatheringRegions.length + 1}`, name: data.name, enabled: true, secret: false, biomes: [], description: 'keep', img: 'keep.webp' }); return true; },
    update: async (sys, id, patch) => { calls.regionUpdate.push({ sys, id, patch: clone(patch) }); const r = system.gatheringRegions.find(x => x.id === id); if (r) Object.assign(r, patch); return clone(r); },
    delete: async (sys, id, collaborators) => { calls.regionDelete.push({ sys, id, collaborators: { hasEnv: !!collaborators?.environmentStore, hasParty: !!collaborators?.partyStore } }); system.gatheringRegions = system.gatheringRegions.filter(r => r.id !== id); return { deleted: { id }, referencedBy: { environments: [], partyOverrides: [] } }; }
  };

  const locationService = {
    resolveCurrentRegions: ({ partyId, systemId }) => {
      const party = partyRecords.find(p => p.id === partyId);
      const override = party?.currentRegionOverrides?.[systemId];
      if (override?.mode === 'manual' && override.regionIds.length > 0) {
        const regionsById = new Map(system.gatheringRegions.map(r => [r.id, r]));
        const resolvedRegions = [];
        const staleRegionIds = [];
        for (const rid of override.regionIds) {
          if (regionsById.has(rid)) resolvedRegions.push(regionsById.get(rid));
          else staleRegionIds.push(rid);
        }
        return { resolved: resolvedRegions.length > 0, source: resolvedRegions.length > 0 ? 'manualOverride' : 'unresolved', regions: resolvedRegions, regionIds: resolvedRegions.map(r => r.id), staleRegionIds, partyId, systemId };
      }
      return { resolved: false, source: 'unresolved', regions: [], regionIds: [], staleRegionIds: [], partyId, systemId };
    }
  };

  const services = {
    getSetting: (key) => settings[key] ?? '',
    setSetting: async (key, value) => { settings[key] = value; },
    getCraftingSystemManager: () => systemManager,
    getRecipeManager: () => recipeManager,
    getGatheringEnvironmentStore: () => ({ listBySystem: async () => [], list: () => [] }),
    getGatheringPartyStore: () => partyStore,
    getGatheringRegionStore: () => regionStore,
    getGatheringLocationService: () => locationService,
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

  return { services, calls, confirmCalls, partyRecords, system };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('adminStore travel section', () => {
  it('exposes parties, regions, and actor options in view state', async () => {
    const { services } = createServices({
      parties: [{ id: 'p1', name: 'Vanguard', enabled: false, memberActorUuids: [], travelActorUuid: null, currentRegionOverrides: {} }],
      regions: [{ id: 'r1', name: 'Verdant', enabled: true, secret: false, biomes: [] }],
      actors: [{ uuid: 'Actor.a', id: 'a', name: 'Aria', img: '' }]
    });
    const store = createAdminStore(services);
    await store.refresh();
    const state = get(store.viewState);
    assert.equal(state.travelParties.length, 1);
    assert.equal(state.travelParties[0].name, 'Vanguard');
    assert.equal(state.selectedSystemRegions.length, 1);
    assert.equal(state.actorOptions.length, 1);
    assert.equal(state.selectedPartyId, 'p1');
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
      parties: [{ id: 'p1', name: 'Vanguard', enabled: false, memberActorUuids: [], travelActorUuid: null, currentRegionOverrides: {} }],
      regions: [{ id: 'r1', name: 'Verdant', enabled: true, secret: false, biomes: [] }],
      actors: [{ uuid: 'Actor.a', id: 'a', name: 'Aria', img: '' }]
    });
    const store = createAdminStore(services);
    await flush();
    await store.addPartyMember('p1', 'Actor.a');
    await store.setPartyTravelActor('p1', 'Actor.a');
    await store.setPartyEnabled('p1', true);
    await store.setPartyRegionOverride('p1', 'system-a', ['r1']);
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
        { id: 'p1', name: 'Vanguard', enabled: true, memberActorUuids: [], travelActorUuid: 'Actor.t1', currentRegionOverrides: {} },
        { id: 'p2', name: 'Rearguard', enabled: true, memberActorUuids: [], travelActorUuid: 'Actor.t2', currentRegionOverrides: {} }
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
        { id: 'p1', name: 'Vanguard', enabled: true, memberActorUuids: [], travelActorUuid: 'Actor.t1', currentRegionOverrides: {} },
        { id: 'p2', name: 'Rearguard', enabled: true, memberActorUuids: ['Actor.a'], travelActorUuid: 'Actor.t2', currentRegionOverrides: {} }
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

  it('deleteParty confirms via confirmDialog before deleting', async () => {
    const { services, calls, confirmCalls } = createServices({
      parties: [{ id: 'p1', name: 'Vanguard', enabled: false, memberActorUuids: [], travelActorUuid: null, currentRegionOverrides: {} }]
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
      parties: [{ id: 'p1', name: 'Vanguard', enabled: false, memberActorUuids: [], travelActorUuid: null, currentRegionOverrides: {} }],
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
      regions: [{ id: 'r1', name: 'Verdant', enabled: true, secret: false, biomes: [], description: 'lore', img: 'pic.webp' }]
    });
    const store = createAdminStore(services);
    await flush();
    await store.createRegionQuick('system-a', 'Ashen March');
    await store.renameRegion('system-a', 'r1', 'Verdant Expanse');
    await store.toggleRegionEnabled('system-a', 'r1', false);
    await flush();
    assert.equal(calls.regionCreate.length, 1);
    assert.deepEqual(calls.regionUpdate[0].patch, { name: 'Verdant Expanse' });
    assert.deepEqual(calls.regionUpdate[1].patch, { enabled: false });
    store.destroy();
  });

  it('deleteRegion confirms then passes environment/party collaborators for referenced-by evidence', async () => {
    const { services, calls, confirmCalls } = createServices({
      regions: [{ id: 'r1', name: 'Verdant', enabled: true, secret: false, biomes: [] }]
    });
    const store = createAdminStore(services);
    await flush();
    await store.deleteRegion('system-a', 'r1');
    await flush();
    assert.equal(confirmCalls.length, 1);
    assert.equal(calls.regionDelete.length, 1);
    assert.equal(calls.regionDelete[0].collaborators.hasEnv, true);
    assert.equal(calls.regionDelete[0].collaborators.hasParty, true);
    store.destroy();
  });

  it('surfaces stale member/travel-actor/override-region references for repair', async () => {
    const { services } = createServices({
      parties: [{
        id: 'p1', name: 'Vanguard', enabled: false,
        memberActorUuids: ['Actor.gone'], travelActorUuid: 'Actor.also-gone',
        currentRegionOverrides: { 'system-a': { mode: 'manual', regionIds: ['r-missing'] } }
      }],
      regions: [],
      actors: []
    });
    const store = createAdminStore(services);
    await store.refresh();
    const party = get(store.viewState).travelParties[0];
    assert.deepEqual(party.staleMembers, ['Actor.gone']);
    assert.equal(party.staleTravelActor, 'Actor.also-gone');
    assert.deepEqual(party.staleRegionIds, ['r-missing']);
    assert.equal(party.hasStaleReference, true);
    store.destroy();
  });
});
