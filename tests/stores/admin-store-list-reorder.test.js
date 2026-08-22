/**
 * System Overview settings-list manual reorder (issue 768, increment 2). The
 * three lists — Modifiers, Character Prerequisites and Currency Units — persist their
 * order AS the array order, so each reorder op rewrites the array in place through
 * the list's existing save path and the order-preserving normalizer round-trips
 * it. These tests drive the REAL adminStore + normalizers (no stubs), asserting
 * the reordered order survives re-projection and persistence, and that
 * invalid/no-op moves are rejected.
 *
 * Modifiers and prerequisites are crafting-system state and persist through `updateSystem`.
 * Currency units are WORLD state since issue 1278 and persist through the world currency
 * setting instead, which is why the currency case below drives a real `CurrencyConfigStore`
 * and reads its order back off `viewState.worldCurrency` rather than off the selected system.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createAdminStore } from '../../src/ui/svelte/stores/adminStore.js';
import { normalizeCharacterPrerequisiteList } from '../../src/systems/characterPrerequisites.js';
import { CurrencyConfigStore } from '../../src/systems/CurrencyConfigStore.js';

function createServices({ modifiers = [], prerequisites = [], currencyUnits = [] } = {}) {
  let idSeq = 0;
  const settingStore = {
    gatheringConfig: { systems: { sys1: {} } },
  };
  const system = {
    id: 'sys1',
    name: 'System One',
    // The ONE modifier library, SYSTEM-owned since issue 1117 — it used to live in the
    // gathering world config, which is why this suite's header called it "gathering world
    // config" and why the reorder used to persist through `_saveGatheringConfig`.
    modifiers,
    resolutionMode: 'simple',
    features: {},
    recipeVisibility: { listMode: 'global' },
    requirements: {
      time: { enabled: false },
      // Participation only: the ladder itself is world scope (issue 1278).
      currency: { enabled: true },
    },
    tools: [],
    characterPrerequisites: normalizeCharacterPrerequisiteList(prerequisites, () => `seed-${++idSeq}`),
  };
  const systemManager = {
    getSystems: () => [system],
    getSystem: (id) => (id === system.id ? system : null),
    getItems: () => [],
    createSystem: async () => system,
    deleteSystem: async () => {},
    updateSystem: async (id, updates = {}) => {
      if (id !== system.id) return null;
      if (Object.prototype.hasOwnProperty.call(updates, 'characterPrerequisites')) {
        system.characterPrerequisites = normalizeCharacterPrerequisiteList(
          updates.characterPrerequisites,
          () => `mgr-${++idSeq}`
        );
        Object.assign(system, { ...updates, characterPrerequisites: system.characterPrerequisites });
      } else if (Object.prototype.hasOwnProperty.call(updates, 'requirements')) {
        system.requirements = JSON.parse(JSON.stringify(updates.requirements));
        Object.assign(system, { ...updates, requirements: system.requirements });
      } else {
        Object.assign(system, updates);
      }
      return system;
    },
  };
  const getSetting = (key) => settingStore[key] ?? null;
  const setSetting = async (key, value) => {
    settingStore[key] = value;
  };
  settingStore.currencyConfig = { units: currencyUnits };
  const currencyStore = new CurrencyConfigStore({
    getSetting,
    setSetting,
    randomID: () => `cur-seed-${++idSeq}`,
  });
  return {
    getSetting,
    setSetting,
    getCurrencyConfigStore: () => currencyStore,
    getCraftingSystemManager: () => systemManager,
    getRecipeManager: () => ({ getRecipes: () => [], getRecipe: () => null }),
    getGatheringEnvironmentStore: () => ({ list: () => [], listBySystem: async () => [] }),
    getFoundrySystemId: () => 'dnd5e',
    getScriptMacros: () => [],
    getSceneOptions: () => [],
    notify: { info: () => {}, warn: () => {}, error: () => {} },
    confirmDialog: async () => true,
    localize: (key) => key,
    _system: system,
    _settingStore: settingStore,
  };
}

async function storeFor(overrides) {
  const services = createServices(overrides);
  const store = createAdminStore(services);
  await store.selectSystem('sys1');
  return { store, services };
}

function modifierIds(store) {
  return (get(store.viewState).selectedSystem.modifiers || []).map((entry) => entry.id);
}
function prerequisiteIds(store) {
  return (get(store.viewState).selectedSystem.characterPrerequisites || []).map((entry) => entry.id);
}
function currencyUnitIds(store) {
  return (get(store.viewState).worldCurrency?.units || []).map((unit) => unit.id);
}

const MODIFIERS = [
  { id: 'mod-a', label: 'Alpha', icon: 'fa-solid fa-a', expression: '@one' },
  { id: 'mod-b', label: 'Bravo', icon: 'fa-solid fa-b', expression: '@two' },
  { id: 'mod-c', label: 'Charlie', icon: 'fa-solid fa-c', expression: '@three' },
];
const PREREQUISITES = [
  { id: 'pre-a', name: 'Alpha', path: 'a', op: 'gte', value: 1 },
  { id: 'pre-b', name: 'Bravo', path: 'b', op: 'gte', value: 2 },
  { id: 'pre-c', name: 'Charlie', path: 'c', op: 'gte', value: 3 },
];
const CURRENCY_UNITS = [
  { id: 'cur-a', label: 'Gold' },
  { id: 'cur-b', label: 'Silver' },
  { id: 'cur-c', label: 'Copper' },
];

describe('adminStore settings-list reorder (issue 768)', () => {
  it('reorderSystemModifier moves an entry and persists the new order', async () => {
    const { store, services } = await storeFor({ modifiers: MODIFIERS });
    assert.deepEqual(modifierIds(store), ['mod-a', 'mod-b', 'mod-c']);

    const ok = await store.reorderSystemModifier(0, 2, 'sys1');
    assert.equal(ok, true);
    assert.deepEqual(modifierIds(store), ['mod-b', 'mod-c', 'mod-a'], 're-projected order');
    assert.deepEqual(
      services._system.modifiers.map((e) => e.id),
      ['mod-b', 'mod-c', 'mod-a'],
      'persisted on the crafting system document, through updateSystem'
    );
  });

  it('reorderCharacterPrerequisite moves an entry and persists through updateSystem', async () => {
    const { store, services } = await storeFor({ prerequisites: PREREQUISITES });
    assert.deepEqual(prerequisiteIds(store), ['pre-a', 'pre-b', 'pre-c']);

    const ok = await store.reorderCharacterPrerequisite(2, 0, 'sys1');
    assert.equal(ok, true);
    assert.deepEqual(prerequisiteIds(store), ['pre-c', 'pre-a', 'pre-b']);
    assert.deepEqual(
      services._system.characterPrerequisites.map((e) => e.id),
      ['pre-c', 'pre-a', 'pre-b'],
      'persisted on the crafting system document'
    );
  });

  it('reorderCurrencyUnit moves a unit and persists the new order', async () => {
    const { store, services } = await storeFor({ currencyUnits: CURRENCY_UNITS });
    assert.deepEqual(currencyUnitIds(store), ['cur-a', 'cur-b', 'cur-c']);

    const ok = await store.reorderCurrencyUnit(1, 0);
    assert.equal(ok, true);
    assert.deepEqual(currencyUnitIds(store), ['cur-b', 'cur-a', 'cur-c']);
    assert.deepEqual(
      services._settingStore.currencyConfig.units.map((u) => u.id),
      ['cur-b', 'cur-a', 'cur-c'],
      'persisted through the world currency setting'
    );
  });

  it('survives a fresh re-selection (round-trip): reordered order is the persisted order', async () => {
    const { store } = await storeFor({
      modifiers: MODIFIERS,
      prerequisites: PREREQUISITES,
      currencyUnits: CURRENCY_UNITS,
    });

    await store.reorderSystemModifier(0, 2, 'sys1');
    await store.reorderCharacterPrerequisite(0, 2, 'sys1');
    await store.reorderCurrencyUnit(0, 2);

    // Re-select from scratch to force a fresh projection off the persisted state.
    await store.selectSystem('');
    await store.selectSystem('sys1');

    assert.deepEqual(modifierIds(store), ['mod-b', 'mod-c', 'mod-a']);
    assert.deepEqual(prerequisiteIds(store), ['pre-b', 'pre-c', 'pre-a']);
    assert.deepEqual(currencyUnitIds(store), ['cur-b', 'cur-c', 'cur-a']);
  });

  it('rejects out-of-range and no-op moves for every list (no persist)', async () => {
    const { store } = await storeFor({
      modifiers: MODIFIERS,
      prerequisites: PREREQUISITES,
      currencyUnits: CURRENCY_UNITS,
    });

    assert.equal(await store.reorderSystemModifier(0, 0, 'sys1'), false, 'no-op');
    assert.equal(await store.reorderSystemModifier(1, 9, 'sys1'), false, 'to out of range');
    assert.equal(await store.reorderSystemModifier(-1, 1, 'sys1'), false, 'from out of range');
    assert.equal(await store.reorderCharacterPrerequisite(2, 2, 'sys1'), false, 'no-op');
    assert.equal(await store.reorderCharacterPrerequisite(0, 5, 'sys1'), false, 'out of range');
    assert.equal(await store.reorderCurrencyUnit(1, 1), false, 'no-op');
    assert.equal(await store.reorderCurrencyUnit(0, -3), false, 'out of range');

    assert.deepEqual(modifierIds(store), ['mod-a', 'mod-b', 'mod-c'], 'order unchanged');
    assert.deepEqual(prerequisiteIds(store), ['pre-a', 'pre-b', 'pre-c'], 'order unchanged');
    assert.deepEqual(currencyUnitIds(store), ['cur-a', 'cur-b', 'cur-c'], 'order unchanged');
  });
});
