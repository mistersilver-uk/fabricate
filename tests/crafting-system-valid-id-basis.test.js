// The VALID ID BASIS guard for the world character libraries (issue 1308). WHY THIS SUITE EXISTS.
// `CraftingSystemManager` PRUNES reference ids — a tool's `prerequisites.ids` and each activity
// check's `defaultModifierIds` — against the libraries those ids name.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.foundry = {
  utils: { randomID: () => Math.random().toString(36).slice(2) },
};
globalThis.game = { user: { isGM: true }, system: { id: 'dnd5e' }, actors: [], fabricate: null };
globalThis.ui = { notifications: { warn: () => {}, error: () => {} } };

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { CharacterLibrariesStore } = await import('../src/systems/CharacterLibrariesStore.js');

const PREREQ = { id: 'smithsTools', name: "Smith's Tools", path: 'tools.smith.value', op: 'gte', value: 1 };
const MODIFIER = { id: 'med', label: 'Medicine', expression: '@abilities.med.mod' };

/** A system carrying references to both libraries, plus its own legacy in-system copies. */
function systemWithLegacy(overrides = {}) {
  return {
    id: 'sys',
    name: 'S',
    characterPrerequisites: [PREREQ],
    modifiers: [MODIFIER],
    tools: [
      {
        id: 'tool-1',
        name: 'Hammer',
        prerequisites: { enabled: true, ids: ['smithsTools'], gateMode: 'usability' },
      },
    ],
    craftingCheck: { defaultModifierPolicy: 'addAll', defaultModifierIds: ['med'] },
    salvageCraftingCheck: { defaultModifierPolicy: 'addAll', defaultModifierIds: ['med'] },
    gatheringCraftingCheck: { defaultModifierPolicy: 'addAll', defaultModifierIds: ['med'] },
    ...overrides,
  };
}

function managerWith(store) {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  manager._characterLibrariesStore = store;
  return manager;
}

function assertReferencesSurvive(system, message) {
  assert.deepEqual(system.tools[0].prerequisites.ids, ['smithsTools'], message);
  assert.equal(system.tools[0].prerequisites.enabled, true, message);
  assert.deepEqual(system.craftingCheck.defaultModifierIds, ['med'], message);
  assert.deepEqual(system.salvageCraftingCheck.defaultModifierIds, ['med'], message);
  assert.deepEqual(system.gatheringCraftingCheck.defaultModifierIds, ['med'], message);
}

test('an ABSENT store prunes nothing', () => {
  const normalized = managerWith(null)._normalizeSystem(systemWithLegacy());
  assertReferencesSurvive(normalized, 'no store can vouch for the ids, so none may be dropped');
});

test('an UNLOADED store prunes nothing', () => {
  // A store that has never been asked anything: `isSeeded()` self-loads, and against a settings
  // seam holding nothing it must report the setting as unwritten.
  const store = new CharacterLibrariesStore({
    getSetting: () => ({}),
    setSetting: async () => {},
  });
  assert.equal(store.loaded, false);
  assertReferencesSurvive(
    managerWith(store)._normalizeSystem(systemWithLegacy()),
    'an unwritten setting is not a basis'
  );
});

test('a store whose read THROWS prunes nothing, and does not take the normalizer down', () => {
  // The issue-970 shape: a throw here would propagate through `_normalizeSystem` into `hydrate`
  // and out of `initialize()`, so the manager would never initialize at all.
  const store = new CharacterLibrariesStore({
    getSetting: () => {
      throw new Error('setting not registered yet');
    },
    setSetting: async () => {},
  });
  assert.doesNotThrow(() => store.load());
  assertReferencesSurvive(
    managerWith(store)._normalizeSystem(systemWithLegacy()),
    'an unreadable setting degrades to an unknown basis'
  );
});

// THE CASE THAT DESTROYS WORLDS.
test('an UNWRITTEN world setting prunes nothing, even though it reads as two empty libraries', () => {
  const store = new CharacterLibrariesStore({
    getSetting: () => ({}),
    setSetting: async () => {},
  });
  assert.deepEqual(store.get(), { characterPrerequisites: [], modifiers: [] });
  assert.equal(store.isSeeded(), false, 'the raw payload carries neither library key');
  assertReferencesSurvive(
    managerWith(store)._normalizeSystem(systemWithLegacy()),
    'an unmigrated world must not have its references stripped'
  );
});

test('the basis UNIONS the world library with a surviving legacy in-system copy', () => {
  // Half migrated: the world library carries the modifier but not the prerequisite, and the
  // system still carries both legacy copies. Every reference is vouched for by one side or other.
  const store = new CharacterLibrariesStore({
    getSetting: () => ({ modifiers: [MODIFIER] }),
    setSetting: async () => {},
  });
  assert.equal(store.isSeeded(), true);
  assertReferencesSurvive(
    managerWith(store)._normalizeSystem(systemWithLegacy()),
    'legacy entries are part of the live corpus until the migration lifts them'
  );
});

// THE NEGATIVE CONTROL. Without this the whole feature could be a no-op that never prunes.
test('a WRITTEN world library DOES prune an id that names nothing in it', () => {
  const store = new CharacterLibrariesStore({
    getSetting: () => ({ characterPrerequisites: [PREREQ], modifiers: [MODIFIER] }),
    setSetting: async () => {},
  });
  const normalized = managerWith(store)._normalizeSystem(
    // No legacy copies, so the world library is the whole basis, and these two ids name nothing.
    systemWithLegacy({
      characterPrerequisites: undefined,
      modifiers: undefined,
      tools: [
        {
          id: 'tool-1',
          name: 'Hammer',
          prerequisites: { enabled: true, ids: ['smithsTools', 'gone'], gateMode: 'usability' },
        },
      ],
      craftingCheck: { defaultModifierPolicy: 'addAll', defaultModifierIds: ['med', 'gone'] },
    })
  );
  assert.deepEqual(normalized.tools[0].prerequisites.ids, ['smithsTools']);
  assert.deepEqual(normalized.craftingCheck.defaultModifierIds, ['med']);
});

test('a GM who EMPTIED both libraries gets a real, empty, prunable basis', () => {
  // The distinction the store's `isSeeded()` exists to draw: written-but-empty is a deliberate
  // instruction to prune, where never-written is not.
  const store = new CharacterLibrariesStore({
    getSetting: () => ({ characterPrerequisites: [], modifiers: [] }),
    setSetting: async () => {},
  });
  assert.equal(store.isSeeded(), true);
  const normalized = managerWith(store)._normalizeSystem(
    systemWithLegacy({ characterPrerequisites: undefined, modifiers: undefined })
  );
  assert.deepEqual(normalized.tools[0].prerequisites.ids, []);
  assert.equal(
    normalized.tools[0].prerequisites.enabled,
    false,
    'and a gate left with no ids is disabled rather than left enabled and vacuous'
  );
  assert.deepEqual(normalized.craftingCheck.defaultModifierIds, []);
});

// The three activity-check normalizers used to DEFAULT their basis argument to `new Set()`, which
// is the omitted-argument form of this very failure: an empty basis prunes every id on every run.
for (const method of [
  '_normalizeCraftingCheck',
  '_normalizeSalvageCraftingCheck',
  '_normalizeGatheringCraftingCheck',
]) {
  test(`${method} with the basis argument OMITTED prunes nothing`, () => {
    const manager = managerWith(null);
    const result = manager[method]({
      defaultModifierPolicy: 'addAll',
      defaultModifierIds: ['med', 'anything'],
    });
    assert.deepEqual(result.defaultModifierIds, ['med', 'anything']);
  });
}

// `upsertTool` derives its OWN basis and never goes through `_normalizeSystem`, so it needs its own
// guard.
test('upsertTool preserves prerequisite ids that exist in the WORLD library', async () => {
  const store = new CharacterLibrariesStore({
    getSetting: () => ({ characterPrerequisites: [PREREQ], modifiers: [] }),
    setSetting: async () => {},
  });
  const manager = managerWith(store);
  const system = { ...systemWithLegacy({ characterPrerequisites: undefined }), tools: [] };
  manager.systems.set(system.id, system);
  manager.save = async () => {};
  await manager.upsertTool(system.id, {
    id: 'tool-1',
    name: 'Hammer',
    componentId: 'comp-1',
    prerequisites: { enabled: true, ids: ['smithsTools'], gateMode: 'usability' },
  });
  assert.deepEqual(system.tools[0].prerequisites.ids, ['smithsTools']);
  assert.equal(system.tools[0].prerequisites.enabled, true);
});

test('upsertTool preserves prerequisite ids when NO store is available', async () => {
  const manager = managerWith(null);
  const system = { ...systemWithLegacy({ characterPrerequisites: undefined }), tools: [] };
  manager.systems.set(system.id, system);
  manager.save = async () => {};
  await manager.upsertTool(system.id, {
    id: 'tool-1',
    name: 'Hammer',
    componentId: 'comp-1',
    prerequisites: { enabled: true, ids: ['smithsTools'], gateMode: 'usability' },
  });
  assert.deepEqual(system.tools[0].prerequisites.ids, ['smithsTools']);
});
