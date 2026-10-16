/**
 * Issue 2006 — a success-counting check authored through the Studio's controls executes as
 * authored. The real simple editor writes through the real route model and store into a real
 * `CraftingSystemManager`; the reloaded record reopens unchanged, and a real `CraftingEngine` rolls
 * it with the registered count Roll over the face-scripting core double, which counts every Roll it
 * constructs. Tier successes and the Botch trigger are authored through their own controls too.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { CraftingSystemManager } from '../src/systems/CraftingSystemManager.js';
import { createAdminStore } from '../src/ui/svelte/stores/adminStore.js';
import { createServices } from './helpers/adminStoreServices.js';
import {
  CHECK_EDITOR_COMPILED_MODULES,
  CHECK_EDITOR_RAW_MODULES,
} from './helpers/checksHarnessModules.js';
import { installCountDice } from './helpers/countEngineDice.js';
import { craftProbe, probeResolutionService } from './helpers/craftPipelineProbe.js';
import { chooseSelectOption } from './helpers/select-control.js';
import { createMountedComponentHarness } from './helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '..');
const ROUTE_MODEL = 'src/ui/svelte/apps/manager/checks/checksRouteModel.svelte.js';
const SYSTEM_ID = 'sys-count';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-check-count-author-',
  rawModules: [
    ...CHECK_EDITOR_RAW_MODULES,
    'src/ui/svelte/apps/manager/checks/checkDraftClone.js',
    'src/ui/svelte/apps/manager/checks/checksNav.js',
  ],
  runeModules: [ROUTE_MODEL],
  compiledModules: CHECK_EDITOR_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/apps/manager/checks/SimpleCraftingCheckEditor.svelte',
});

/** A summing check as a world has it before the GM touches the Studio. */
const seed = (simple) => ({
  id: SYSTEM_ID,
  name: 'Counting',
  resolutionMode: 'simple',
  features: { craftingChecks: true },
  craftingCheck: { enabled: true, simple: { rollFormula: '1d20', dc: 10, ...simple } },
});

let manager;
let store;
let createChecksRouteModel;

async function openSystem(simple) {
  manager.systems.set(SYSTEM_ID, manager._normalizeSystem(seed(simple)));
  store = createAdminStore(
    createServices(manager.getSystem(SYSTEM_ID), [], [], { getCraftingSystemManager: () => manager })
  );
  await store.selectSystem(SYSTEM_ID);
}

function openRouteModel() {
  return createChecksRouteModel({
    store: () => store,
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
    value: model.checkSimpleDraft,
    section: 'roll',
    onChange: model.onUpdateCraftingCheckSimple,
  });
  const act = async (fn) => {
    fn(root);
    await harness.setProps({ value: model.checkSimpleDraft });
  };
  return { root, act };
}

function choose(root, attr, value) {
  const radio = root.querySelector(`[${attr}="${value}"] input[type="radio"]`);
  assert.ok(Boolean(radio), `a radio exists for ${attr}="${value}"`);
  radio.checked = true;
  radio.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
}

function typeInto(root, selector, text) {
  const input = root.querySelector(selector);
  assert.ok(Boolean(input), `${selector} exists`);
  input.value = text;
  input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
}

function stepper(root, attr) {
  const input = root.querySelector(`[${attr}]`);
  const [decrement, increment] = input.closest('.fab-stepper').querySelectorAll('.fab-stepper-adjunct');
  return { decrement, increment };
}

/** Save through the header's route model, then read the persisted simple check back. */
async function saveAndReload(model) {
  assert.equal(model.checksDirty, true, 'the authored draft is dirty');
  assert.equal(await model.saveChecks(), true, 'the header Save lands');
  assert.equal(model.checksDirty, false, 'the saved draft is the new baseline');
  return manager.getSystem(SYSTEM_ID).craftingCheck;
}

/** Craft once with the reloaded check, `rollData` on the actor, and an optional library bonus. */
async function execute(craftingCheck, { rollData, faces, library = null, checkTierId = null }) {
  const world = craftProbe({
    systemId: SYSTEM_ID,
    resolutionMode: 'simple',
    features: { craftingChecks: true },
    craftingCheck: structuredClone(craftingCheck),
    resolutionService: probeResolutionService({ mode: 'simple' }),
  });
  Object.assign(world.craftingActor.system, structuredClone(rollData));
  if (checkTierId) world.recipe.checkTierId = checkTierId;
  if (library !== null) {
    world.system.modifiers = [{ id: 'knack', label: 'Knack', expression: String(library) }];
    Object.assign(world.system.craftingCheck, {
      defaultModifierPolicy: 'addAll',
      defaultModifierIds: ['knack'],
    });
  }
  const checks = [];
  const run = world.engine._runCraftingCheck.bind(world.engine);
  world.engine._runCraftingCheck = async (...args) => {
    const result = await run(...args);
    checks.push(result);
    return result;
  };
  const dice = installCountDice({ faces, chat: false });
  try {
    await world.craft();
  } finally {
    dice.restore();
  }
  const counted = dice.constructed.filter((entry) => entry.kind === 'FabricateCountRoll');
  return { check: checks[0], counted, awarded: world.craftingActor.created.length };
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
  ({ createChecksRouteModel } = await harness.loadRuneModule(ROUTE_MODEL));
});

after(() => harness.teardown());

const REPAIR = Object.freeze({ abilities: { int: { value: 6 } }, skills: { repair: { value: 4 } } });

test('#861: 2d20 at or under INT + Repair, needing the tier\'s 2 successes, rolls once as authored', async () => {
  await openSystem({ tiers: [{ id: 't-repair', name: 'Repair work', dc: 12 }] });
  const model = openRouteModel();
  const { root, act } = await mountEditor(model);

  await act(() => choose(root, 'data-check-product-option', 'count'));
  await act(() => choose(root, 'data-check-direction-option', 'under'));
  await act(() => chooseSelectOption(root, '[data-check-count-die]', '20'));
  await act(() => stepper(root, 'data-check-count-base').increment.click());
  await act(() => stepper(root, 'data-check-count-base').decrement.click());
  await act(() => choose(root, 'data-check-count-threshold-mode-option', 'value'));
  await act(() =>
    typeInto(root, '[data-check-count-threshold-expression]', '@abilities.int.value + @skills.repair.value')
  );
  await act(() => choose(root, 'data-check-count-destination-option', 'threshold'));
  // The tier's DC of 12 is never its count: it asks for successes, and the GM steps them to 2.
  assert.equal(root.querySelector('[data-tier-successes]').value, '', 'the DC is not a count');
  assert.ok(root.querySelector('[data-tier-successes-missing]'), 'Set successes needed');
  await act(() => stepper(root, 'data-tier-successes').increment.click());
  await act(() => stepper(root, 'data-tier-successes').increment.click());
  assert.equal(root.querySelector('[data-tier-successes]').value, '2');

  const reloaded = await saveAndReload(model);
  const { evaluation } = reloaded.simple;
  assert.deepEqual(
    [evaluation.product, evaluation.direction, reloaded.simple.thresholdMode],
    ['count', 'under', 'meet']
  );
  assert.deepEqual(
    [evaluation.pool.die, evaluation.pool.base, evaluation.pool.threshold, evaluation.pool.modifierDestination],
    [20, '2', '@abilities.int.value + @skills.repair.value', 'threshold']
  );
  assert.deepEqual(
    [reloaded.simple.tiers[0].successes, reloaded.simple.tiers[0].dc],
    [2, 12],
    'the stepped successes survive the save beside the kept DC'
  );
  assert.equal(reloaded.simple.rollFormula, '1d20', 'the retained formula is kept');

  harness.remount();
  const reopened = await mountEditor(openRouteModel());
  assert.ok(
    reopened.root
      .querySelector('[data-check-count-threshold-mode-option="value"]')
      .classList.contains('is-active'),
    'the reopened threshold reads Character value'
  );
  assert.equal(reopened.root.querySelector('[data-check-count-base]').value, '2');
  harness.remount();

  // Faces 11 and 10 against 10: one success, one short of the tier's two.
  const plain = await execute(reloaded, { rollData: REPAIR, faces: [11, 10], checkTierId: 't-repair' });
  assert.deepEqual(plain.counted.map((entry) => entry.formula), ['2d20'], 'exactly one main Roll');
  assert.deepEqual(
    [plain.check.data.target, plain.check.data.total, plain.check.data.margin, plain.check.success],
    [10, 1, -1, false]
  );
  assert.equal(plain.awarded, 0);

  // A library +2 moves the threshold to 12 once, so both dice qualify and the tier is met.
  const helped = await execute(reloaded, {
    rollData: REPAIR,
    faces: [11, 10],
    library: 2,
    checkTierId: 't-repair',
  });
  assert.deepEqual(helped.counted.map((entry) => entry.formula), ['2d20']);
  assert.deepEqual(
    [helped.check.data.target, helped.check.data.total, helped.check.data.margin, helped.check.success],
    [12, 2, 0, true]
  );
  assert.equal(helped.awarded, 1, 'the success is awarded');
});

test('a six-die pool that explodes tens and cancels ones botches as authored', async () => {
  await openSystem({});
  const model = openRouteModel();
  const { root, act } = await mountEditor(model);

  await act(() => choose(root, 'data-check-product-option', 'count'));
  await act(() => chooseSelectOption(root, '[data-check-count-die]', '10'));
  await act(() => choose(root, 'data-check-count-base-mode-option', 'value'));
  await act(() => typeInto(root, '[data-check-count-base-expression]', '@a + @b'));
  await act(() => typeInto(root, '[data-check-count-threshold]', '8'));
  await act(() => choose(root, 'data-check-count-explode-option', 'extreme'));
  await act(() => choose(root, 'data-check-count-explode-repeat-option', 'keeps'));
  await act(() => choose(root, 'data-check-count-cancel-option', 'extreme'));
  await act(() => choose(root, 'data-check-count-destination-option', 'pool'));
  // The Botch preset, offered once cancelling is on, from the Triggers section.
  await harness.setProps({ section: 'triggers' });
  await act(() => root.querySelector('[data-rule-row-preset="botch"]').click());

  const reloaded = await saveAndReload(model);
  const { pool } = reloaded.simple.evaluation;
  assert.deepEqual(
    [pool.base, pool.threshold, pool.explode.enabled, pool.explode.once, pool.cancel.enabled],
    ['@a + @b', '8', true, false, true]
  );
  const [botch] = reloaded.simple.checkBreakage.triggers;
  assert.deepEqual(
    [botch.condition, botch.outcome],
    [{ type: 'rollTotal', operator: '<', value: 0 }, 'failure']
  );

  // 6 + library 2 = 8 dice: the 10 qualifies and explodes into a 5, three 1s cancel, net −2.
  const result = await execute(reloaded, {
    rollData: { a: 4, b: 2 },
    faces: [10, 1, 1, 1, 2, 3, 4, 5, 5],
    library: 2,
  });
  assert.deepEqual(result.counted.map((entry) => entry.formula), ['8d10x=10'], 'one Roll');
  assert.deepEqual(
    [result.check.data.successes, result.check.data.cancelled, result.check.data.total],
    [1, 3, -2]
  );
  assert.equal(result.check.success, false, 'the Botch trigger fails the attempt');
  assert.equal(result.check.data.forcedOutcome, 'failure', 'the Botch fired');
  assert.equal(result.awarded, 0);

  // A net of −1 botches; a qualifying 10 against one cancelled 1 is a net of 0, which does not.
  const nets = [];
  for (const faces of [[1, 2, 3, 4, 5, 6, 7, 7], [10, 1, 2, 3, 4, 5, 6, 7, 5]]) {
    const { check } = await execute(reloaded, { rollData: { a: 4, b: 2 }, faces, library: 2 });
    nets.push([check.data.total, check.data.forcedOutcome ?? null]);
  }
  assert.deepEqual(nets, [[-1, 'failure'], [0, null]]);
});

test('a pool of zero fails without constructing a Roll', async () => {
  await openSystem({});
  const model = openRouteModel();
  const { root, act } = await mountEditor(model);
  await act(() => choose(root, 'data-check-product-option', 'count'));
  await act(() => typeInto(root, '[data-check-count-base]', '0'));
  const zeroToggle = root.querySelector('[data-check-count-zero-pool]');
  assert.equal(zeroToggle.getAttribute('aria-pressed'), 'true', 'a zero pool fails by default');
  const reloaded = await saveAndReload(model);
  harness.remount();

  const result = await execute(reloaded, { rollData: {}, faces: [] });
  assert.deepEqual(result.counted, [], 'zero Roll constructions');
  assert.equal(result.check.data.zeroPool, true);
  assert.equal(result.check.success, false);
});
