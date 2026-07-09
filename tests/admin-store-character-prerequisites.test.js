/**
 * Coverage for the system-owned character prerequisite library CRUD in
 * adminStore (issue 544). Prerequisites live on the crafting system document
 * (`system.characterPrerequisites`, persisted through the crafting system
 * manager's `craftingSystems` setting), so the mock `updateSystem` round-trips
 * them through the real `normalizeCharacterPrerequisiteList` — the same shape the
 * production manager produces.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createAdminStore } from '../src/ui/svelte/stores/adminStore.js';
import { normalizeCharacterPrerequisiteList } from '../src/systems/characterPrerequisites.js';

function createServices({ prerequisites = [], foundrySystemId = 'dnd5e' } = {}) {
  const store = {};
  let idSeq = 0;
  const system = {
    id: 'sys1',
    name: 'System One',
    resolutionMode: 'simple',
    features: {},
    recipeVisibility: { listMode: 'global' },
    requirements: { time: { enabled: false }, currency: { enabled: false, units: [] } },
    tools: [],
    characterPrerequisites: normalizeCharacterPrerequisiteList(prerequisites, () => `seed-${++idSeq}`),
  };
  const systemManager = {
    getSystems: () => [system],
    getSystem: (id) => (id === system.id ? system : null),
    getItems: () => system.components || system.items || [],
    createSystem: async () => system,
    deleteSystem: async () => {},
    deleteItem: async () => {},
    updateSystem: async (id, updates = {}) => {
      if (id !== system.id) return null;
      if (Object.prototype.hasOwnProperty.call(updates, 'characterPrerequisites')) {
        system.characterPrerequisites = normalizeCharacterPrerequisiteList(
          updates.characterPrerequisites,
          () => `mgr-${++idSeq}`
        );
      }
      Object.assign(system, { ...updates, characterPrerequisites: system.characterPrerequisites });
      return system;
    },
  };
  return {
    getSetting: (key) => store[key] ?? null,
    setSetting: async (key, value) => {
      store[key] = value;
    },
    getCraftingSystemManager: () => systemManager,
    getRecipeManager: () => ({ getRecipes: () => [], getRecipe: () => null }),
    getGatheringEnvironmentStore: () => ({ list: () => [], save: async () => true }),
    getFoundrySystemId: () => foundrySystemId,
    getScriptMacros: () => [],
    getSceneOptions: () => [],
    notify: { info: () => {}, warn: () => {}, error: () => {} },
    confirmDialog: async () => true,
    localize: (key) => key,
    _system: system,
  };
}

async function storeFor(overrides) {
  const services = createServices(overrides);
  const store = createAdminStore(services);
  await store.selectSystem('sys1');
  return { store, services };
}

describe('adminStore character prerequisites (system-owned)', () => {
  it('surfaces the prerequisite library on the selectedSystem projection', async () => {
    const { store } = await storeFor({
      prerequisites: [{ id: 'p1', name: 'Expert', path: '@skills.cra.rank', op: 'gte', value: 2 }],
    });
    const projected = get(store.viewState).selectedSystem.characterPrerequisites;
    assert.equal(projected.length, 1);
    assert.deepEqual(projected[0], {
      id: 'p1',
      name: 'Expert',
      icon: 'fa-solid fa-user-shield',
      path: 'skills.cra.rank', // leading @ stripped
      op: 'gte',
      value: 2,
    });
  });

  it('addCharacterPrerequisite appends a normalized entry with a generated id', async () => {
    const { store, services } = await storeFor();
    const added = await store.addCharacterPrerequisite('sys1');
    assert.ok(added?.id, 'returns the created entry');
    assert.equal(services._system.characterPrerequisites.length, 1);
    assert.equal(services._system.characterPrerequisites[0].op, 'gte');
  });

  it('updateCharacterPrerequisite merges a patch, cannot change the id, and rejects unknown ids', async () => {
    const { store, services } = await storeFor({
      prerequisites: [{ id: 'p1', name: 'Old', path: 'a', op: 'gte', value: 1 }],
    });
    const ok = await store.updateCharacterPrerequisite('sys1', 'p1', {
      name: 'New',
      op: 'isTrue',
      id: 'hacked',
    });
    assert.equal(ok, true);
    const entry = services._system.characterPrerequisites[0];
    assert.equal(entry.id, 'p1', 'id cannot be mutated');
    assert.equal(entry.name, 'New');
    assert.equal(entry.op, 'isTrue');
    assert.equal(entry.value, null, 'switching to a valueless op nulls the value');

    const missing = await store.updateCharacterPrerequisite('sys1', 'nope', { name: 'X' });
    assert.equal(missing, false);
  });

  it('deleteCharacterPrerequisite removes the entry and persists the removal', async () => {
    const { store, services } = await storeFor({
      prerequisites: [
        { id: 'p1', name: 'A', path: 'a', op: 'gte', value: 1 },
        { id: 'p2', name: 'B', path: 'b', op: 'gte', value: 1 },
      ],
    });
    const ok = await store.deleteCharacterPrerequisite('sys1', 'p1');
    assert.equal(ok, true);
    assert.deepEqual(
      services._system.characterPrerequisites.map((e) => e.id),
      ['p2'],
      'the removed prerequisite does not resurrect'
    );
    assert.equal(await store.deleteCharacterPrerequisite('sys1', 'ghost'), false);
  });

  it('seedCharacterPrerequisitePresetsForSystem seeds on dnd5e and is idempotent', async () => {
    const { store, services } = await storeFor({ foundrySystemId: 'dnd5e' });
    const first = await store.seedCharacterPrerequisitePresetsForSystem('sys1');
    assert.equal(first.unsupported, false);
    assert.ok(first.added > 0);
    const seededCount = services._system.characterPrerequisites.length;

    const second = await store.seedCharacterPrerequisitePresetsForSystem('sys1');
    assert.equal(second.added, 0);
    assert.equal(services._system.characterPrerequisites.length, seededCount);
  });

  it('seedCharacterPrerequisitePresetsForSystem reports unsupported for a non-5e/pf2e world', async () => {
    const { store, services } = await storeFor({ foundrySystemId: 'cyberpunk' });
    const result = await store.seedCharacterPrerequisitePresetsForSystem('sys1');
    assert.equal(result.unsupported, true);
    assert.equal(result.added, 0);
    assert.equal(services._system.characterPrerequisites.length, 0);
  });
});
