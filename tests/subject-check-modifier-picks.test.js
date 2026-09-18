/**
 * Issue 1095 — the SUBJECT check-modifier pick, asserted against each of the FOUR whitelist
 * rebuilds that emit it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { SETTING_KEYS } from '../src/config/settings.js';
import { GatheringRichStateService } from '../src/systems/GatheringRichStateService.js';

globalThis.foundry = { utils: { randomID: () => Math.random().toString(36).slice(2) } };
globalThis.game = { user: { isGM: true }, system: { id: 'dnd5e' }, actors: [], fabricate: null };
globalThis.ui = { notifications: { warn: () => {}, error: () => {} } };

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { Recipe } = await import('../src/models/Recipe.js');

const manager = () => new CraftingSystemManager({ getRecipes: () => [] });

/**
 * The three authoredness cases every subject must answer identically.
 * `[input, expected]` — `undefined` expected means the key must be ABSENT.
 */
const AUTHOREDNESS_CASES = [
  ['a two-id pick', ['med', 'alch'], ['med', 'alch']],
  ['an AUTHORED EMPTY pick', [], []],
  ['a pick whose members are junk', [123, '', null], []],
  ['no pick at all', undefined, undefined],
  ['a malformed non-array pick', 'nope', undefined],
];

// ── crafting: Recipe.craftingModifier.modifierIds ────────────────────────────

test('Recipe.craftingModifier preserves authoredness on all five inputs', () => {
  for (const [label, input, expected] of AUTHOREDNESS_CASES) {
    const recipe = new Recipe({
      name: 'r',
      craftingSystemId: 's',
      craftingModifier: input === undefined ? undefined : { modifierIds: input },
    });
    if (expected === undefined) {
      assert.equal(recipe.craftingModifier, null, `${label}: inherits`);
    } else {
      assert.deepEqual(recipe.craftingModifier, { modifierIds: expected }, label);
    }
  }
});

// ── salvage: Component.salvage.checkModifierIds ──────────────────────────────

test('_normalizeSalvage preserves authoredness on all five inputs', () => {
  for (const [label, input, expected] of AUTHOREDNESS_CASES) {
    const normalized = manager()._normalizeSalvage(
      input === undefined ? {} : { checkModifierIds: input }
    );
    if (expected === undefined) {
      assert.equal(
        Object.hasOwn(normalized, 'checkModifierIds'),
        false,
        `${label}: the key stays ABSENT, so the component inherits`
      );
    } else {
      assert.deepEqual(normalized.checkModifierIds, expected, label);
    }
  }
});

test('_normalizeSalvage seeds no pick onto a component with no salvage config', () => {
  // The non-object path returns its own literal, and seeding `[]` there would silently give
  // every such component a pick of ZERO — a different roll from inheriting.
  assert.equal(Object.hasOwn(manager()._normalizeSalvage(null), 'checkModifierIds'), false);
  assert.equal(Object.hasOwn(manager()._normalizeSalvage(undefined), 'checkModifierIds'), false);
});

test('_normalizeSalvage survives a whole-system normalize, alongside its siblings', () => {
  // The nested normalizer is reached through `_normalizeComponent`, so the emit has to
  // survive the options bag and the Simple-mode clamp as well as its own literal.
  const system = manager()._normalizeSystem({
    id: 's',
    name: 'S',
    salvageResolutionMode: 'routed',
    components: [
      {
        id: 'c1',
        name: 'Ore',
        salvage: { enabled: true, dcOverride: 17, checkModifierIds: ['med'] },
      },
      { id: 'c2', name: 'Herb', salvage: { enabled: true, checkModifierIds: [] } },
      { id: 'c3', name: 'Coal', salvage: { enabled: true } },
    ],
  });
  const byId = new Map(system.components.map((component) => [component.id, component]));
  assert.deepEqual(byId.get('c1').salvage.checkModifierIds, ['med']);
  assert.equal(byId.get('c1').salvage.dcOverride, 17, 'and its siblings survive alongside it');
  assert.deepEqual(byId.get('c2').salvage.checkModifierIds, []);
  assert.equal(Object.hasOwn(byId.get('c3').salvage, 'checkModifierIds'), false);
});

// gathering: GatheringTask.checkModifierIds, through BOTH mirrors. `GatheringTask` is normalized by
// TWO mirrored whitelist rebuilds, and a key emitted by one and not the other survives ONE save
// path and is dropped on the other — silently, and in one direction only.

/** Drive `normalizeLibraryTask` (`GatheringRichStateService`) over a raw config. */
function normalizeThroughRichState(task) {
  const settings = new Map([
    [SETTING_KEYS.GATHERING_CONFIG, { systems: { 'sys-1': { tasks: [task] } } }],
  ]);
  const service = new GatheringRichStateService({
    getSetting: (key) => settings.get(key),
    setSetting: async (key, value) => settings.set(key, value),
    settingKey: SETTING_KEYS.GATHERING_CONFIG,
  });
  return service._config().systems['sys-1'].tasks[0];
}

test('normalizeLibraryTask preserves authoredness on all five inputs', () => {
  for (const [label, input, expected] of AUTHOREDNESS_CASES) {
    const normalized = normalizeThroughRichState(
      input === undefined ? { id: 't', name: 'T' } : { id: 't', name: 'T', checkModifierIds: input }
    );
    if (expected === undefined) {
      assert.equal(
        Object.hasOwn(normalized, 'checkModifierIds'),
        false,
        `${label}: the key stays ABSENT, so the task inherits`
      );
    } else {
      assert.deepEqual(normalized.checkModifierIds, expected, label);
    }
  }
});

test('_normalizeGatheringTask — the adminStore MIRROR — answers identically', async () => {
  // The mirror is module-private, so it is driven through the ONE public path that reaches it: the
  // store's `gatheringConfig` projection, which normalizes the whole persisted config through
  // `_normalizeGatheringTask`.
  const { createAdminStore } = await import('../src/ui/svelte/stores/adminStore.js');
  const { get } = await import('svelte/store');

  for (const [label, input, expected] of AUTHOREDNESS_CASES) {
    const task = {
      id: 't',
      name: 'T',
      ...(input === undefined ? {} : { checkModifierIds: input }),
    };
    const settings = new Map([
      ['gatheringConfig', { systems: { 'sys-1': { tasks: [task] } } }],
      ['lastManagedCraftingSystem', ''],
    ]);
    const store = createAdminStore({
      getSetting: (key) => settings.get(key),
      setSetting: async (key, value) => settings.set(key, value),
      getCraftingSystemManager: () => ({ getSystems: () => [], getSystem: () => null }),
      getRecipeManager: () => ({ getRecipes: () => [] }),
    });
    await store.refresh();
    const normalized = get(store.viewState).gatheringConfig.systems['sys-1'].tasks[0];
    if (expected === undefined) {
      assert.equal(
        Object.hasOwn(normalized, 'checkModifierIds'),
        false,
        `${label}: the mirror keeps the key ABSENT too`
      );
    } else {
      assert.deepEqual(normalized.checkModifierIds, expected, `${label} (mirror)`);
    }
  }
});
