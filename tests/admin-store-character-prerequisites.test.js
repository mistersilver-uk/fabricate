/**
 * Coverage for the character prerequisite library CRUD in adminStore (issue 544).
 *
 * The library moved to WORLD scope in issue 1308, so it is persisted through the
 * `CharacterLibrariesStore` rather than through the crafting system, none of the actions takes a
 * crafting system id, and — the part worth pinning — none of them requires a system to be
 * SELECTED. The fake store below is the real class over an in-memory setting, so the round trip
 * goes through the real `normalizeCharacterPrerequisiteList`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createAdminStore } from '../src/ui/svelte/stores/adminStore.js';
import { normalizeCharacterPrerequisiteList } from '../src/systems/characterPrerequisites.js';
import { CharacterLibrariesStore } from '../src/systems/CharacterLibrariesStore.js';

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
  };
  const worldSetting = {
    characterPrerequisites: normalizeCharacterPrerequisiteList(
      prerequisites,
      () => `seed-${++idSeq}`
    ),
    modifiers: [],
  };
  const characterLibrariesStore = new CharacterLibrariesStore({
    getSetting: () => worldSetting,
    setSetting: async (_key, value) => {
      Object.assign(worldSetting, value);
    },
    randomID: () => `mgr-${++idSeq}`,
  });
  const systemManager = {
    getSystems: () => [system],
    getSystem: (id) => (id === system.id ? system : null),
    getItems: () => system.components || system.items || [],
    createSystem: async () => system,
    deleteSystem: async () => {},
    deleteItem: async () => {},
    updateSystem: async (id, updates = {}) => {
      if (id !== system.id) return null;
      Object.assign(system, updates);
      return system;
    },
  };
  return {
    getSetting: (key) => store[key] ?? null,
    setSetting: async (key, value) => {
      store[key] = value;
    },
    getCraftingSystemManager: () => systemManager,
    getCharacterLibrariesStore: () => characterLibrariesStore,
    getRecipeManager: () => ({ getRecipes: () => [], getRecipe: () => null }),
    getGatheringEnvironmentStore: () => ({ list: () => [], save: async () => true }),
    getFoundrySystemId: () => foundrySystemId,
    getScriptMacros: () => [],
    getSceneOptions: () => [],
    notify: { info: () => {}, warn: () => {}, error: () => {} },
    confirmDialog: async () => true,
    localize: (key) => key,
    _system: system,
    _worldSetting: worldSetting,
  };
}

async function storeFor(overrides) {
  const services = createServices(overrides);
  const store = createAdminStore(services);
  await store.selectSystem('sys1');
  return { store, services };
}

describe('adminStore character prerequisites (system-owned)', () => {
  // The header's claim that none of these actions needs a SELECTED system was unpinned: every
  // case below goes through `storeFor`, which selects one. This is the case that holds it.
  it('adds a prerequisite with NO crafting system selected', async () => {
    const services = createServices();
    const store = createAdminStore(services);
    await store.refresh();
    const added = await store.addCharacterPrerequisite({ name: 'Unselected' });
    assert.ok(added?.id, 'a world library is authored without a system in hand');
    assert.equal(services._worldSetting.characterPrerequisites.length, 1);
  });

  it('surfaces the prerequisite library on the WORLD projection, not on selectedSystem', async () => {
    const { store } = await storeFor({
      prerequisites: [{ id: 'p1', name: 'Expert', path: '@skills.cra.rank', op: 'gte', value: 2 }],
    });
    const state = get(store.viewState);
    assert.equal(
      state.selectedSystem.characterPrerequisites,
      undefined,
      'a world library must not be hung off the selection, or it would appear to change when the ' +
        'GM merely clicks a different crafting system'
    );
    const projected = state.worldCharacterPrerequisites;
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
    const added = await store.addCharacterPrerequisite();
    assert.ok(added?.id, 'returns the created entry');
    assert.equal(services._worldSetting.characterPrerequisites.length, 1);
    assert.equal(services._worldSetting.characterPrerequisites[0].op, 'gte');
  });

  it('updateCharacterPrerequisite merges a patch, cannot change the id, and rejects unknown ids', async () => {
    const { store, services } = await storeFor({
      prerequisites: [{ id: 'p1', name: 'Old', path: 'a', op: 'gte', value: 1 }],
    });
    const ok = await store.updateCharacterPrerequisite('p1', {
      name: 'New',
      op: 'isTrue',
      id: 'hacked',
    });
    assert.equal(ok, true);
    const entry = services._worldSetting.characterPrerequisites[0];
    assert.equal(entry.id, 'p1', 'id cannot be mutated');
    assert.equal(entry.name, 'New');
    assert.equal(entry.op, 'isTrue');
    assert.equal(entry.value, null, 'switching to a valueless op nulls the value');

    const missing = await store.updateCharacterPrerequisite('nope', { name: 'X' });
    assert.equal(missing, false);
  });

  it('deleteCharacterPrerequisite removes the entry and persists the removal', async () => {
    const { store, services } = await storeFor({
      prerequisites: [
        { id: 'p1', name: 'A', path: 'a', op: 'gte', value: 1 },
        { id: 'p2', name: 'B', path: 'b', op: 'gte', value: 1 },
      ],
    });
    const ok = await store.deleteCharacterPrerequisite('p1');
    assert.equal(ok, true);
    assert.deepEqual(
      services._worldSetting.characterPrerequisites.map((e) => e.id),
      ['p2'],
      'the removed prerequisite does not resurrect'
    );
    assert.equal(await store.deleteCharacterPrerequisite('ghost'), false);
  });

  it('seedCharacterPrerequisitePresets seeds on dnd5e and is idempotent', async () => {
    const { store, services } = await storeFor({ foundrySystemId: 'dnd5e' });
    const first = await store.seedPrerequisitePresets();
    assert.equal(first.unsupported, false);
    assert.ok(first.added > 0);
    const seededCount = services._worldSetting.characterPrerequisites.length;

    const second = await store.seedPrerequisitePresets();
    assert.equal(second.added, 0);
    assert.equal(services._worldSetting.characterPrerequisites.length, seededCount);
  });

  it('seedCharacterPrerequisitePresets reports unsupported for a non-5e/pf2e world', async () => {
    const { store, services } = await storeFor({ foundrySystemId: 'cyberpunk' });
    const result = await store.seedPrerequisitePresets();
    assert.equal(result.unsupported, true);
    assert.equal(result.added, 0);
    assert.equal(services._worldSetting.characterPrerequisites.length, 0);
  });
});

// The delete CONFIRMATION (issue 1308). These two lists are the only destructive edits on a page
// framed as "settings for the selected crafting system" whose reach is the whole world, and until
// this they were one unconfirmed click on a bare icon button.
//
// Every assertion below exists to kill a specific mutation. Both harnesses stub `confirmDialog`
// to resolve true, so deleting the confirm call outright leaves the rest of the suite green —
// only the DECLINE case notices.
describe('adminStore character prerequisite delete confirmation (issue 1308)', () => {
  function servicesWithConfirm(confirmed, seen = []) {
    const services = createServices({
      prerequisites: [{ id: 'p1', name: 'Expert', path: 'a', op: 'gte', value: 2 }],
    });
    services.confirmDialog = async (options) => {
      seen.push(options);
      return confirmed;
    };
    services.localize = (key, data) => `${key}|${JSON.stringify(data ?? {})}`;
    return services;
  }

  it('DECLINING leaves the library byte-identical and never writes', async () => {
    const services = servicesWithConfirm(false);
    const store = createAdminStore(services);
    await store.selectSystem('sys1');
    const before = JSON.stringify(services._worldSetting.characterPrerequisites);

    assert.equal(await store.deleteCharacterPrerequisite('p1'), false);
    assert.equal(JSON.stringify(services._worldSetting.characterPrerequisites), before);
  });

  it('asks with the WHOLE lang keys and the entry’s own name', async () => {
    const seen = [];
    const services = servicesWithConfirm(true, seen);
    const store = createAdminStore(services);
    await store.selectSystem('sys1');
    await store.deleteCharacterPrerequisite('p1');

    assert.equal(seen.length, 1, 'asked exactly once');
    // Whole literals, not composed from a scope token: a template-literal key reads to the
    // lang-key scanner as the bare Manager namespace base and disarms the orphaned-key gate for
    // everything beneath it.
    assert.match(seen[0].title, /^FABRICATE\.Admin\.Manager\.CharacterPrerequisites\.DeleteTitle\|/);
    assert.match(
      seen[0].content,
      /FABRICATE\.Admin\.Manager\.CharacterPrerequisites\.DeleteContent\|/
    );
    assert.match(seen[0].title, /Expert/, 'and names the entry the GM is removing');
  });

  it('does NOT ask about an unknown id — the GM is not prompted for a no-op', async () => {
    const seen = [];
    const services = servicesWithConfirm(true, seen);
    const store = createAdminStore(services);
    await store.selectSystem('sys1');

    assert.equal(await store.deleteCharacterPrerequisite('ghost'), false);
    assert.deepEqual(seen, []);
  });

  it('escapes the entry name in the dialog BODY, which is HTML', async () => {
    const seen = [];
    const services = createServices({
      prerequisites: [{ id: 'p1', name: '<img src=x onerror=alert(1)>', path: 'a', op: 'gte', value: 1 }],
    });
    services.confirmDialog = async (options) => {
      seen.push(options);
      return true;
    };
    // Echo the interpolation data, because the harness's default `localize` returns the bare key
    // and would hide whatever was substituted into it.
    services.localize = (key, data) => `${key}|${JSON.stringify(data ?? {})}`;
    const store = createAdminStore(services);
    await store.selectSystem('sys1');
    await store.deleteCharacterPrerequisite('p1');

    assert.equal(seen.length, 1);
    assert.equal(seen[0].content.includes('<img'), false, 'raw markup never reaches the body');
    assert.match(seen[0].content, /&lt;img/);
  });

  it('a reorder is NOT a destructive edit and never prompts', async () => {
    const seen = [];
    const services = createServices({
      prerequisites: [
        { id: 'p1', name: 'One', path: 'a', op: 'gte', value: 1 },
        { id: 'p2', name: 'Two', path: 'b', op: 'gte', value: 1 },
      ],
    });
    services.confirmDialog = async (options) => {
      seen.push(options);
      return true;
    };
    const store = createAdminStore(services);
    await store.selectSystem('sys1');

    assert.equal(await store.reorderCharacterPrerequisite(0, 1), true);
    assert.deepEqual(seen, []);
  });
});
