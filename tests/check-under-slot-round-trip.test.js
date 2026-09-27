/**
 * Issue 2005 — a roll-under direction authored in every other editable check slot saves through
 * the real route model and store into a real `CraftingSystemManager`, and a fresh route model
 * reopens it (Q18 beyond crafting routed). The crafting simple slot also keeps its evaluation
 * across switching the check off and on again.
 */
import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { CraftingSystemManager } from '../src/systems/CraftingSystemManager.js';
import { createAdminStore } from '../src/ui/svelte/stores/adminStore.js';
import { createServices } from './helpers/adminStoreServices.js';
import {
  CHECK_EDITOR_COMPILED_MODULES,
  CHECK_EDITOR_RAW_MODULES,
} from './helpers/checksHarnessModules.js';
import { createMountedComponentHarness } from './helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '..');
const ROUTE_MODEL = 'src/ui/svelte/apps/manager/checks/checksRouteModel.svelte.js';
const CHECKS = 'src/ui/svelte/apps/manager/checks/';

const harnessFor = (editor) =>
  createMountedComponentHarness({
    repoRoot,
    tmpPrefix: `fabricate-check-under-slot-${editor}-`,
    rawModules: [
      ...CHECK_EDITOR_RAW_MODULES,
      `${CHECKS}checkDraftClone.js`,
      `${CHECKS}checksNav.js`,
    ],
    runeModules: [ROUTE_MODEL],
    compiledModules: CHECK_EDITOR_COMPILED_MODULES,
    componentPath: `${CHECKS}${editor}.svelte`,
  });

const SIMPLE = { rollFormula: '1d20', dc: 12, thresholdMode: 'meet', dcMode: 'static' };
const ROUTED = {
  type: 'relative',
  rollFormula: '1d20',
  dc: 12,
  thresholdMode: 'meet',
  relativeOutcomes: [
    { id: 'good', name: 'Good', success: true, dc: 0 },
    { id: 'poor', name: 'Poor', success: false, dc: -5 },
  ],
};

/** Each slot, the system that makes it the rolled one, and the route model's names for it. */
const SLOTS = [
  {
    key: 'checkSimple',
    editor: 'SimpleCraftingCheckEditor',
    seed: { resolutionMode: 'simple', craftingCheck: { enabled: true, simple: SIMPLE } },
    read: (system) => system.craftingCheck.simple,
    draft: 'checkSimpleDraft',
    update: 'onUpdateCraftingCheckSimple',
  },
  {
    key: 'salvageSimple',
    editor: 'SimpleCraftingCheckEditor',
    salvageMode: 'simple',
    seed: { salvageCraftingCheck: { enabled: true, simple: SIMPLE } },
    read: (system) => system.salvageCraftingCheck.simple,
    draft: 'salvageSimpleDraft',
    update: 'onUpdateSalvageCheckSimple',
  },
  {
    key: 'salvageRouted',
    editor: 'CraftingCheckEditor',
    salvageMode: 'routed',
    seed: { salvageCraftingCheck: { enabled: true, routed: ROUTED } },
    read: (system) => system.salvageCraftingCheck.routed,
    draft: 'salvageRoutedDraft',
    update: 'onUpdateSalvageCheckRouted',
  },
  {
    key: 'gatheringRouted',
    editor: 'CraftingCheckEditor',
    gatheringMode: 'routed',
    seed: { gatheringCraftingCheck: { enabled: true, routed: ROUTED } },
    read: (system) => system.gatheringCraftingCheck.routed,
    draft: 'gatheringRoutedDraft',
    update: 'onUpdateGatheringCheckRouted',
  },
];

function installGlobals() {
  let ids = 0;
  globalThis.foundry = {
    utils: {
      randomID: () => `rid-${(ids += 1)}`,
      getProperty: () => undefined,
      deepClone: (value) => structuredClone(value),
    },
  };
  globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };
  Object.assign(globalThis.game, {
    user: { id: 'gm', isGM: true },
    system: { id: 'generic' },
    actors: [],
    settings: { get: () => undefined, set: async () => {} },
  });
}

/** A real manager and store holding one system seeded for `spec`. */
async function openWorld(spec) {
  const id = `sys-${spec.key}`;
  const manager = new CraftingSystemManager({ getRecipes: () => [], getRecipe: () => null });
  manager.initialized = true;
  manager.save = async () => {};
  manager.systems.set(
    id,
    manager._normalizeSystem({ id, name: spec.key, features: { craftingChecks: true }, ...spec.seed })
  );
  const store = createAdminStore(
    createServices(manager.getSystem(id), [], [], { getCraftingSystemManager: () => manager })
  );
  await store.selectSystem(id);
  return { id, manager, store };
}

function openRouteModel(createChecksRouteModel, world, spec) {
  return createChecksRouteModel({
    store: () => world.store,
    selectedSystem: () => world.manager.getSystem(world.id),
    selectedSystemId: () => world.id,
    salvageResolutionMode: () => spec.salvageMode ?? 'simple',
    gatheringResolutionMode: () => spec.gatheringMode ?? 'd100',
    selectedSystemModifiers: () => [],
    currentView: () => 'checks-crafting',
  });
}

function chooseUnder(root) {
  const radio = root.querySelector('[data-check-direction-option="under"] input[type="radio"]');
  assert.ok(radio, 'the direction axis renders');
  radio.checked = true;
  radio.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
}

for (const editor of ['SimpleCraftingCheckEditor', 'CraftingCheckEditor']) {
  describe(`${editor} slots save and reopen a roll-under check`, () => {
    const harness = harnessFor(editor);
    let createChecksRouteModel;

    before(async () => {
      await harness.setup();
      installGlobals();
      ({ createChecksRouteModel } = await harness.loadRuneModule(ROUTE_MODEL));
    });
    after(() => harness.teardown());
    afterEach(() => harness.remount());

    const mountSlot = async (model, spec) => {
      const root = await harness.mount({
        value: model[spec.draft],
        section: '',
        showTiers: false,
        onChange: model[spec.update],
      });
      const act = async (fn) => {
        fn(root);
        await harness.setProps({ value: model[spec.draft] });
      };
      return { root, act };
    };

    for (const spec of SLOTS.filter((slot) => slot.editor === editor)) {
      it(`${spec.key}: the direction persists and reopens`, async () => {
        const world = await openWorld(spec);
        const model = openRouteModel(createChecksRouteModel, world, spec);
        const { act } = await mountSlot(model, spec);
        await act(chooseUnder);
        assert.equal(model.checksDirty, true);
        assert.equal(await model.saveChecks(), true);
        assert.equal(model.checksDirty, false, 'the saved draft is the new baseline');
        assert.equal(spec.read(world.manager.getSystem(world.id)).evaluation.direction, 'under');

        harness.remount();
        const reopened = await mountSlot(openRouteModel(createChecksRouteModel, world, spec), spec);
        assert.ok(
          reopened.root
            .querySelector('[data-check-direction-option="under"]')
            .classList.contains('is-active'),
          'the reopened editor shows the saved direction'
        );
      });
    }

    if (editor === 'SimpleCraftingCheckEditor') {
      it('keeps the evaluation across switching the check off and on', async () => {
        const spec = SLOTS[0];
        const world = await openWorld(spec);
        const model = openRouteModel(createChecksRouteModel, world, spec);
        const { act } = await mountSlot(model, spec);
        await act(chooseUnder);
        const authored = JSON.parse(JSON.stringify(model[spec.draft].evaluation));
        const saved = () => world.manager.getSystem(world.id).craftingCheck;
        for (const enabled of [false, true]) {
          model.onToggleCheckActive('crafting', enabled);
          assert.equal(await model.saveChecks(), true);
          assert.equal(saved().enabled, enabled);
          assert.deepEqual(saved().simple.evaluation, authored, `enabled ${enabled}`);
        }
      });
    }
  });
}
