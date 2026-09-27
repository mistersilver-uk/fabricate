/**
 * Issue 2005 — a percentile roll-under check authored entirely in the Studio executes as authored.
 * The real routed editor writes through the real route model and the real store into a real
 * `CraftingSystemManager`; the reloaded record reopens unchanged, and a real `CraftingEngine` rolls
 * it with queued faces (Q18). Fixture-built records prove nothing here, so none is used.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { CraftingSystemManager } from '../src/systems/CraftingSystemManager.js';
import { createAdminStore } from '../src/ui/svelte/stores/adminStore.js';
import { foldTargetTerms } from '../src/ui/presenters/checkDisplay.js';
import { createServices } from './helpers/adminStoreServices.js';
import {
  CHECK_EDITOR_COMPILED_MODULES,
  CHECK_EDITOR_RAW_MODULES,
} from './helpers/checksHarnessModules.js';
import { craftProbe, probeResolutionService } from './helpers/craftPipelineProbe.js';
import { createMountedComponentHarness } from './helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '..');
const ROUTE_MODEL = 'src/ui/svelte/apps/manager/checks/checksRouteModel.svelte.js';
const SYSTEM_ID = 'sys-percentile';
const SKILL = 55;
const IDRIN = Object.freeze({ name: 'Idrin', rollData: { skills: { craft: { value: SKILL } } } });

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-check-under-author-',
  rawModules: [
    ...CHECK_EDITOR_RAW_MODULES,
    'src/ui/svelte/apps/manager/checks/checkDraftClone.js',
    'src/ui/svelte/apps/manager/checks/checksNav.js',
  ],
  runeModules: [ROUTE_MODEL],
  compiledModules: CHECK_EDITOR_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/apps/manager/checks/CraftingCheckEditor.svelte',
});

/** A roll-over check as a world has it before the GM touches the Studio. */
const SEED = {
  id: SYSTEM_ID,
  name: 'Percentile',
  resolutionMode: 'routedByCheck',
  features: { craftingChecks: true },
  craftingCheck: {
    enabled: true,
    routed: {
      type: 'relative',
      rollFormula: '1d100',
      dc: 50,
      thresholdMode: 'meet',
      relativeOutcomes: [
        { id: 'extreme', name: 'Extreme', success: true, dc: 20 },
        { id: 'hard', name: 'Hard', success: true, dc: 10 },
        { id: 'regular', name: 'Regular', success: true, dc: 0 },
        { id: 'otherwise', name: 'Otherwise', success: false, dc: -10 },
      ],
    },
  },
};

let manager;
let store;
const saves = [];
let createChecksRouteModel;

function openRouteModel() {
  return createChecksRouteModel({
    store: () => ({
      ...store,
      saveCraftingCheckRouted: async (draft) => {
        saves.push(JSON.parse(JSON.stringify(draft)));
        return store.saveCraftingCheckRouted(draft);
      },
    }),
    selectedSystem: () => manager.getSystem(SYSTEM_ID),
    selectedSystemId: () => SYSTEM_ID,
    salvageResolutionMode: () => 'simple',
    gatheringResolutionMode: () => 'd100',
    selectedSystemModifiers: () => [],
    currentView: () => 'checks-crafting',
  });
}

async function mountEditor(model) {
  const root = await harness.mount({
    value: model.checkRoutedDraft,
    resolutionMode: 'routedByCheck',
    section: '',
    previewCharacter: IDRIN,
    onChange: model.onUpdateCraftingCheck,
  });
  const act = async (fn) => {
    fn(root);
    await harness.setProps({ value: model.checkRoutedDraft });
  };
  return { root, act };
}

function choose(root, attr, value) {
  const radio = root.querySelector(`[${attr}="${value}"] input[type="radio"]`);
  assert.ok(radio, `a radio exists for ${attr}="${value}"`);
  radio.checked = true;
  radio.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
}

function typeMultiplier(root, outcomeId, text) {
  const input = root.querySelector(`[data-outcome-row="${outcomeId}"] [data-outcome-adjustment]`);
  assert.ok(input, `${outcomeId} edits a multiplier`);
  input.value = text;
  input.dispatchEvent(
    new globalThis.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  );
}

/** A counting `Roll` whose dice total the next queued face. */
function installQueuedRoll(faces) {
  const constructed = [];
  const queue = [...faces];
  globalThis.Roll = class QueuedRoll {
    constructor(formula) {
      this.formula = String(formula);
      constructed.push(this.formula);
      this.total = queue.shift();
      this.dice = [{ number: 1, faces: 100, total: this.total, results: [{ result: this.total }] }];
    }
    async evaluate() {
      return this;
    }
    evaluateSync() {
      return this;
    }
    toJSON() {
      return { formula: this.formula, total: this.total };
    }
    async toMessage() {}
    static replaceFormulaData(formula) {
      return formula;
    }
    static validate() {
      return true;
    }
  };
  return constructed;
}

/** Execute the reloaded check once, returning the check result, the rolls and the award. */
async function execute(craftingCheck, face) {
  const world = craftProbe({
    systemId: SYSTEM_ID,
    resolutionMode: 'routedByCheck',
    features: { craftingChecks: true },
    craftingCheck: structuredClone(craftingCheck),
    resolutionService: probeResolutionService({ mode: 'routedByCheck' }),
  });
  world.craftingActor.system.skills = { craft: { value: SKILL } };
  const checks = [];
  const run = world.engine._runCraftingCheck.bind(world.engine);
  world.engine._runCraftingCheck = async (...args) => {
    const result = await run(...args);
    checks.push(result);
    return result;
  };
  const constructed = installQueuedRoll([face]);
  await world.craft();
  return { check: checks[0], constructed, awarded: world.craftingActor.created.length };
}

before(async () => {
  await harness.setup();
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
  manager = new CraftingSystemManager({ getRecipes: () => [], getRecipe: () => null });
  manager.initialized = true;
  manager.save = async () => {};
  manager.systems.set(SYSTEM_ID, manager._normalizeSystem(SEED));
  store = createAdminStore(
    createServices(manager.getSystem(SYSTEM_ID), [], [], {
      getCraftingSystemManager: () => manager,
    })
  );
  await store.selectSystem(SYSTEM_ID);
  ({ createChecksRouteModel } = await harness.loadRuneModule(ROUTE_MODEL));
});

after(() => {
  harness.teardown();
  delete globalThis.Roll;
});

test('a percentile roll-under ladder authored in the Studio saves, reopens and executes', async () => {
  const model = openRouteModel();
  const { root, act } = await mountEditor(model);

  await act(() => choose(root, 'data-check-direction-option', 'under'));
  await act(() => choose(root, 'data-check-target-source-option', 'attribute'));
  await act(() => {
    const input = root.querySelector('[data-check-target-expression]');
    input.value = '@skills.craft.value';
    input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  });
  await act(() => choose(root, 'data-check-adjustment-kind-option', 'multiply'));
  assert.equal(
    root.querySelector('[data-outcome-row="otherwise"] [data-outcome-adjustment]').value,
    'Otherwise',
    'an unset multiplier already reads as Otherwise'
  );
  await act(() => typeMultiplier(root, 'extreme', '1/5'));
  await act(() => typeMultiplier(root, 'hard', '½'));
  await act(() => typeMultiplier(root, 'regular', '1'));
  await act(() => root.querySelector('[data-check-offer-situational-bonus]').click());

  assert.equal(model.checksDirty, true);
  assert.equal(await model.saveChecks(), true, 'the header Save lands');

  // The route model hands the store the whole draft: evaluation and offer included.
  const saved = saves.at(-1);
  assert.equal(saved.offerSituationalBonus, false, 'the offer reaches the store');
  assert.deepEqual(
    [saved.evaluation.direction, saved.evaluation.target.source, saved.evaluation.target.adjustmentKind],
    ['under', 'attribute', 'multiply']
  );

  const reloaded = manager.getSystem(SYSTEM_ID).craftingCheck;
  assert.equal(reloaded.routed.offerSituationalBonus, false, 'the offer persists');
  assert.deepEqual(reloaded.routed.evaluation.target, {
    source: 'attribute',
    expression: '@skills.craft.value',
    adjustmentKind: 'multiply',
    baseAdjustment: null,
  });
  assert.equal(reloaded.routed.evaluation.direction, 'under');
  assert.deepEqual(
    reloaded.routed.relativeOutcomes.map((outcome) => [outcome.id, outcome.adjustment, outcome.dc]),
    [
      ['extreme', 0.2, 20],
      ['hard', 0.5, 10],
      ['regular', 1, 0],
      ['otherwise', null, -10],
    ],
    'multipliers persist and the kept offsets survive'
  );

  // Reopen: a fresh route model over the reloaded system shows what was authored.
  harness.remount();
  const reopened = await mountEditor(openRouteModel());
  assert.ok(
    reopened.root.querySelector('[data-check-direction-option="under"]').classList.contains('is-active')
  );
  assert.deepEqual(
    ['extreme', 'hard', 'regular', 'otherwise'].map(
      (id) =>
        reopened.root.querySelector(`[data-outcome-row="${id}"] [data-outcome-adjustment]`).value
    ),
    ['×⅕', '×½', '×1', 'Otherwise']
  );
  assert.equal(
    reopened.root.querySelector('[data-check-offer-situational-bonus]').getAttribute('aria-pressed'),
    'false',
    'the reopened editor shows the offer off'
  );
  harness.remount();

  // Execute: raw 20 lands Hard at 55 × ½ = 27 with a margin of 7, and the result is awarded.
  const hard = await execute(reloaded, 20);
  assert.deepEqual(hard.constructed, ['1d100'], 'rolled once, raw');
  assert.deepEqual(
    [hard.check.data.total, hard.check.data.target, hard.check.data.margin],
    [20, 27, 7]
  );
  assert.deepEqual([hard.check.data.outcomeId, hard.check.success], ['hard', true]);
  assert.deepEqual(hard.check.data.targetTerms, [
    { kind: 'anchor', value: SKILL },
    { kind: 'multiplier', value: 0.5 },
  ]);
  assert.equal(foldTargetTerms(hard.check.data.targetTerms, hard.check.data.preRolls), 27);
  assert.equal(hard.awarded, 1, 'the success tier produces its result');

  const extreme = await execute(reloaded, 11);
  assert.deepEqual([extreme.check.data.outcomeId, extreme.check.data.target], ['extreme', 11]);

  // Raw 70 meets no multiplied threshold: Otherwise, with no target or margin, and no award.
  const otherwise = await execute(reloaded, 70);
  assert.deepEqual(otherwise.constructed, ['1d100']);
  assert.deepEqual(
    [otherwise.check.data.outcomeId, otherwise.check.success],
    ['otherwise', false]
  );
  assert.deepEqual([otherwise.check.data.target, otherwise.check.data.margin], [null, null]);
  assert.ok(!Object.hasOwn(otherwise.check.data, 'targetTerms'), 'Otherwise invents no target');
  assert.equal(otherwise.awarded, 0);
});
