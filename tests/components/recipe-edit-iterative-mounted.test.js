/**
 * The iterative recipe editor's Overview (issue 3010), mounted over the lab's authored Ironworks:
 * the Counters table's writes, faults, adder and empty states, the mode callout, the header status,
 * each step's actions, hide and lock and end rules, the per-step chips, and a Save that keeps
 * `Recipe.iterative.step` through the real store's projection.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync, mount, tick, unmount } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { get } from 'svelte/store';

import { Recipe } from '../../src/models/Recipe.js';
import { evaluateIterativeReadiness } from '../../src/systems/iterative/iterativeReadiness.js';
import { normalizeIterativeLibrary } from '../../src/systems/normalize/iterativeLibrary.js';
import {
  iterativeRecipeStatus,
  iterativeStepTally,
} from '../../src/ui/svelte/apps/manager/iterative/iterativeRecipeIssues.js';
import { iterativeStatusChip } from '../../src/ui/svelte/apps/manager/iterative/iterativeStatusCopy.js';
import {
  evaluateRecipeReadiness,
  recipeValidationRowStates,
} from '../../src/ui/svelte/apps/manager/recipe/recipeReadiness.js';
import { createRecipeStepHandlers } from '../../src/ui/svelte/apps/manager/recipe/recipeStepHandlers.js';
import { createAdminStore } from '../../src/ui/svelte/stores/adminStore.js';
import { createServices } from '../helpers/adminStoreServices.js';
import { byCodePoint } from '../helpers/codePointOrder.js';
import { setInputValue } from '../helpers/manager/managerQueries.js';
import { chooseSelectOption } from '../helpers/select-control.js';
import { buildLabContent, LAB_SYSTEM_IDS } from '../view-lab/world/labContent.js';
import { seedIterativeRecipes, seedIterativeState } from '../view-lab/world/labIterative.js';

import { disposeManagerSuite, managerComponent, managerModule } from './manager-mounted-shared.js';

const EDIT_VIEW = 'src/ui/svelte/apps/manager/RecipeEditView.svelte';
const RECIPE_READS = 'src/ui/svelte/apps/manager/iterative/iterativeRecipeReads.svelte.js';

/** The lab's Ironworks in `state`, its recipes as models, and its library normalized. */
function ironworks(state = 'authoring') {
  const content = buildLabContent();
  seedIterativeState(content, 'populated');
  seedIterativeRecipes(content, [], state);
  const persisted = content.systems.find((entry) => entry.id === LAB_SYSTEM_IDS.IRONWORKS);
  const system = { ...persisted, iterative: normalizeIterativeLibrary(persisted.iterative) };
  const recipes = content.recipes
    .filter((entry) => entry.craftingSystemId === system.id)
    .map((entry) => new Recipe(entry));
  return { system, recipes };
}

/** The editor's draft of `id`, cloned from the projected row the way the shell seeds it. */
async function draftOf(world, id) {
  const store = createAdminStore(createServices(world.system, world.recipes));
  await store.selectSystem(world.system.id);
  const row = get(store.viewState).recipes.find((entry) => entry.id === id);
  return JSON.parse(JSON.stringify(row));
}

let EditView;
let mounted;
let target;

async function settle() {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
  await tick();
  flushSync();
}

/** The route model's recipe reads over `world`, as the shell builds them. */
async function recipeReads(world) {
  const { createIterativeRecipeReads } = await managerModule(RECIPE_READS);
  return createIterativeRecipeReads({
    section: () => null,
    selectedSystem: () => world.system,
    currentView: () => 'recipe-edit',
  });
}

/**
 * Mounts the editor on `draft`, applying each patch as the shell's `patchRecipeDraft` does;
 * `runs` is what the stubbed `activeRunCount` answers.
 */
async function mountEditor(world, draft, { runs = 0, ...extra } = {}) {
  const live = new SvelteMap([['recipe', draft]]);
  const calls = { patches: [], routed: 0 };
  const reads = await recipeReads(world);
  const iterative = {
    counters: world.system.iterative.counters,
    actions: world.system.iterative.actions,
    library: world.system.iterative,
    systemName: world.system.name,
    recipeIssues: reads.recipeIssues,
    recipeReadinessInput: reads.recipeReadinessInput,
    activeRunCount: (recipeId) => (recipeId === draft.id ? runs : 0),
    openCounters: () => {
      calls.routed += 1;
    },
  };
  target = document.createElement('div');
  target.className = 'fabricate-manager';
  document.body.appendChild(target);
  mounted = mount(EditView, {
    target,
    props: {
      get recipe() {
        return live.get('recipe');
      },
      iterative,
      resolutionMode: 'iterative',
      multiStepEnabled: world.system.features?.multiStepRecipes === true,
      onUpdateRecipe: (patch) => {
        calls.patches.push(structuredClone(patch));
        live.set('recipe', { ...live.get('recipe'), ...patch });
      },
      ...extra,
    },
  });
  await settle();
  return { calls, live };
}

const $ = (selector) => target.querySelector(selector);
const row = (key) => $(`[data-iterative-counter-row="${key}"]`);
const countersOf = (calls) => calls.patches.at(-1).iterative.counters;

async function press(element, what) {
  assert.ok(Boolean(element), `${what} did not render`);
  element.click();
  await settle();
}

async function type(element, value, what) {
  assert.ok(Boolean(element), `${what} did not render`);
  setInputValue(element, value);
  await settle();
}

before(async () => {
  EditView = await managerComponent(EDIT_VIEW);
});
afterEach(() => {
  if (mounted) unmount(mounted);
  mounted = null;
  target?.remove();
});
after(() => disposeManagerSuite());

describe('iterative recipe Overview: the Counters table', () => {
  it('writes Start, Target, Player sees and remove once each, keeping the step', async () => {
    const world = ironworks();
    const { calls } = await mountEditor(world, await draftOf(world, 'iw-r-blade'));
    const step = structuredClone(world.recipes[0].toJSON().iterative.step);

    await type($('[data-iterative-counter-start="heat"]'), '4', 'the Start stepper');
    assert.equal(calls.patches.length, 1);
    assert.deepEqual(calls.patches[0], {
      iterative: { counters: [{ counterId: 'heat', start: 4, visible: true }], step },
    });

    await type($('[data-iterative-counter-target="heat"]'), '9', 'the Target stepper');
    assert.equal(calls.patches.length, 2);
    assert.equal(countersOf(calls)[0].target, 9);

    await press($('[data-iterative-counter-visible="heat"]'), 'the Player sees switch');
    assert.equal(calls.patches.length, 3);
    assert.equal(countersOf(calls)[0].visible, false);

    await press($('[data-iterative-counter-remove="heat"]'), 'the remove button');
    assert.equal(calls.patches.length, 4);
    assert.deepEqual(calls.patches[3], { iterative: { counters: [], step } });
  });

  it('heads Overview with the iterative mode callout, and offers no Preview tab', async () => {
    const world = ironworks();
    await mountEditor(world, await draftOf(world, 'iw-r-blade'));
    assert.ok(Boolean($('[data-recipe-mode-callout="iterative"]')), 'the callout names the mode');
    assert.match($('[data-recipe-mode-callout]').textContent, /Iterative/);
    assert.ok(!$('#recipe-tab-preview'), 'there is no Preview tab');
  });

  it('adds every library counter in order from the empty state, and focuses the first Start', async () => {
    const world = ironworks();
    const { calls } = await mountEditor(world, await draftOf(world, 'iw-r-ingot'));
    const addAll = $('[data-iterative-counters-add-all]');
    assert.equal(addAll.textContent.trim(), 'Add all 3 counters');

    await press(addAll, 'Add all');
    await settle();
    assert.deepEqual(countersOf(calls), [
      { counterId: 'heat', start: 0, visible: true },
      { counterId: 'temper', start: 0, visible: true },
      { counterId: 'slag', start: 0, visible: true },
    ]);
    assert.ok(
      document.activeElement === $('[data-iterative-counter-start="heat"]'),
      'focus moved there'
    );
  });

  it('disables Add all with no library counters, says so and links to Counters', async () => {
    const world = ironworks('noLibrary');
    const { calls } = await mountEditor(world, await draftOf(world, 'iw-r-ingot'));
    const addAll = $('[data-iterative-counters-add-all]');
    const note = $('[data-iterative-counters-note]');
    assert.equal(addAll.disabled, true);
    assert.equal(addAll.getAttribute('aria-describedby'), note.id);
    assert.match(note.textContent, /There are no counters in Ironworks yet\./);

    await press($('[data-iterative-counters-open]'), 'Create one in Counters');
    assert.equal(calls.routed, 1);
    assert.equal(calls.patches.length, 0);
  });

  it('draws global and no-limit bounds read-only, named and titled', async () => {
    const world = ironworks();
    await mountEditor(world, await draftOf(world, 'iw-r-hinge'));
    const temperMax = row('temper').querySelector('[data-iterative-counter-bound="max"]');
    assert.match(temperMax.textContent, /Temper max, global 5/);
    assert.equal(temperMax.title, 'Temper uses global limits. Change them in Counters.');
    assert.ok(Boolean(temperMax.querySelector('.fa-globe')));
    const slagMin = row('slag').querySelector('[data-iterative-counter-bound="min"]');
    assert.match(slagMin.textContent, /Slag min, no limit/);
    assert.match(slagMin.textContent, /—/);
    assert.equal(slagMin.title, 'Slag has no limits. Change them in Counters.');
    const heatMin = $('[data-iterative-counter-min="heat"]');
    assert.equal(heatMin.placeholder, '0', 'a per-recipe bound shows the counter default unset');
    assert.equal(heatMin.value, '');
  });

  it('writes Formula and Fixed starts, keeping the typed formula across the switch', async () => {
    const world = ironworks();
    const { calls } = await mountEditor(world, await draftOf(world, 'iw-r-hinge'));
    const slag = row('slag');
    const formula = slag.querySelector('[data-recipe-option-formula]');
    assert.equal(formula.value, '2 + 1d4');
    assert.equal(formula.getAttribute('aria-label'), 'Slag start formula');
    assert.match(slag.textContent, /Rolls when the step starts/);
    assert.match(slag.textContent, /Dice roll once, when the step starts\./);
    assert.ok(!slag.querySelector('[role="group"]'), 'Start offers no tokens');

    await press(
      slag.querySelector(':scope [data-recipe-option-amount-mode="fixed"] input'),
      'Fixed'
    );
    assert.equal(Object.hasOwn(countersOf(calls)[2], 'startFormula'), false, 'Fixed removes it');
    await press(
      row('slag').querySelector(':scope [data-recipe-option-amount-mode="rolled"] input'),
      'Formula'
    );
    assert.equal(countersOf(calls)[2].startFormula, '2 + 1d4', 'Formula restores the kept text');

    await type(row('slag').querySelector('[data-recipe-option-formula]'), '2 +', 'the formula');
    const input = row('slag').querySelector('[data-recipe-option-formula]');
    assert.equal(input.getAttribute('aria-invalid'), 'true', 'a start formula that cannot parse');
  });

  it('stacks Rivet’s fault lines under each counter, each describing its invalid control', async () => {
    const world = ironworks();
    await mountEditor(world, await draftOf(world, 'iw-r-rivet'));
    const lines = (key) =>
      [...row(key).querySelectorAll(':scope th [data-issue-code]')].map((line) =>
        line.textContent.trim()
      );
    assert.deepEqual(lines('heat'), ['Min 8 is above max 4.']);
    assert.deepEqual(lines('temper'), ['Max 5 is below the start value of 9.']);
    assert.deepEqual(lines('slag'), ['Slag start must be a number.']);

    for (const [key, control] of [
      ['heat', '[data-iterative-counter-min="heat"]'],
      ['temper', '[data-iterative-counter-start="temper"]'],
      ['slag', '[data-iterative-counter-start="slag"]'],
    ]) {
      const input = $(control);
      const line = row(key).querySelector(':scope th [data-issue-code]');
      assert.equal(input.getAttribute('aria-invalid'), 'true', `${control} is marked`);
      assert.equal(input.getAttribute('aria-describedby'), line.id, `${control} is described`);
    }
    assert.ok(!$('[data-iterative-counter-max="heat"][aria-invalid]'), 'max is not the fault');
  });

  it('disables the adder once every counter is used, describes it and links to Counters', async () => {
    const world = ironworks();
    const { calls } = await mountEditor(world, await draftOf(world, 'iw-r-hinge'));
    const adder = $('[data-iterative-counter-add]');
    const note = $('[data-iterative-counters-note]');
    assert.equal(adder.disabled, true);
    assert.equal(adder.getAttribute('aria-describedby'), note.id);
    assert.match(note.textContent, /Every counter in Ironworks is already in this recipe\./);
    assert.match($('.fabricate-data-table-footer').textContent, /Max and target are optional\./);
    await press($('[data-iterative-counters-open]'), 'Create one in Counters');
    assert.equal(calls.routed, 1);
  });

  it('adds one counter through the adder and focuses its Start', async () => {
    const world = ironworks();
    const { calls } = await mountEditor(world, await draftOf(world, 'iw-r-blade'));
    assert.equal($('[data-iterative-counter-add]').disabled, false);
    chooseSelectOption(target, '[data-iterative-counter-add]', 'temper');
    await settle();
    await settle();
    assert.deepEqual(countersOf(calls).at(-1), { counterId: 'temper', start: 0, visible: true });
    assert.ok(
      document.activeElement === $('[data-iterative-counter-start="temper"]'),
      'focus moved there'
    );
  });

  it('marks a counter missing from the library and routes Create counter', async () => {
    const world = ironworks();
    const { calls } = await mountEditor(world, await draftOf(world, 'iw-r-nail'));
    const line = row('rust').querySelector('[data-issue-code="iterativeUnknownCounter"]');
    assert.equal(
      line.textContent.trim(),
      'This counter isn’t in the Ironworks counter library. Remove this row or create the counter.'
    );
    await press(row('rust').querySelector('[data-iterative-counter-create]'), 'Create counter');
    assert.equal(calls.routed, 1);
  });

  it('focuses the next row’s remove after a remove, else the adder', async () => {
    const world = ironworks();
    await mountEditor(world, await draftOf(world, 'iw-r-hinge'));
    await press($('[data-iterative-counter-remove="heat"]'), 'remove Heat');
    await settle();
    assert.ok(
      document.activeElement === $('[data-iterative-counter-remove="temper"]'),
      'focus moved there'
    );
    await press($('[data-iterative-counter-remove="slag"]'), 'remove Slag');
    await settle();
    assert.ok(document.activeElement === $('[data-iterative-counter-add]'), 'focus moved there');
  });

  it('prunes a removed counter from every step’s hide and lock lists in the one write', async () => {
    const world = ironworks();
    const draft = await draftOf(world, 'iw-r-sword');
    // No rule names Heat, so only the lists could leave an unknown counter behind.
    const temperRule = { source: 'counter', counterId: 'temper', op: '>=', value: 2 };
    draft.steps[0].iterative.success = [temperRule];
    draft.steps[1].iterative.success = [temperRule];
    draft.steps[1].iterative.hiddenCounterIds = ['heat'];
    const { calls, live } = await mountWithHandlers(world, draft);
    await press(
      stepRow('iw-sword-heat').querySelector('[data-iterative-step-lock="heat"]'),
      'lock Heat'
    );
    assert.deepEqual(live.get('recipe').steps[0].iterative.lockedCounterIds, ['temper', 'heat']);

    const before = calls.patches.length;
    await press($('[data-iterative-counter-remove="heat"]'), 'remove Heat');
    assert.equal(calls.patches.length, before + 1, 'one write');
    const [patch] = calls.patches.slice(before);
    assert.deepEqual(
      patch.iterative.counters.map((entry) => entry.counterId),
      ['temper', 'slag']
    );
    const lists = patch.steps.map(({ iterative }) => [
      iterative.hiddenCounterIds,
      iterative.lockedCounterIds,
    ]);
    assert.deepEqual(lists, [
      [['slag'], ['temper']],
      [[], []],
    ]);
    const codes = (await recipeReads(world)).recipeIssues(live.get('recipe')).map((i) => i.code);
    assert.ok(!codes.includes('iterativeUnknownCounter'), codes.join(', '));
  });

  it('never presents an iterative multi-step recipe as collapsed', async () => {
    const world = ironworks('multiStepOff');
    await mountEditor(world, await draftOf(world, 'iw-r-sword'));
    assert.ok(!$('[data-recipe-section="collapsed-steps"]'), 'the steps are not collapsed');
    assert.match($('[data-recipe-section="iterative-counters"]').textContent, /carry on from step/);
  });
});

describe('iterative recipe header status', () => {
  it('reads Ready, Needs iterative setup, N blocking, or nothing while Ready is withheld', async () => {
    const world = ironworks();
    const { createIterativeRecipeReads } = await managerModule(RECIPE_READS);
    const reads = createIterativeRecipeReads({
      section: () => null,
      selectedSystem: () => world.system,
      currentView: () => 'recipe-edit',
    });
    const chipOf = async (id, enableBlocked = false) =>
      iterativeStatusChip(
        reads.recipeHeaderStatus({ ...(await draftOf(world, id)), enableBlocked }),
        (_k, f) => f
      );
    assert.deepEqual(await chipOf('iw-r-blade'), {
      id: 'ready',
      label: 'Ready',
      tone: 'positive',
      icon: 'fas fa-circle-check',
    });
    assert.equal((await chipOf('iw-r-ingot')).label, 'Needs iterative setup');
    assert.equal((await chipOf('iw-r-rivet')).label, '3 blocking');
    assert.equal((await chipOf('iw-r-hinge')).label, 'Ready');
    assert.equal(
      await chipOf('iw-r-hinge', true),
      null,
      'Hinge has no ingredient set, so while enabling is blocked Ready is withheld'
    );
  });
});

describe('iterative recipe Save through the real store', () => {
  it('keeps the step a Save never touched, because the row projects `iterative`', async () => {
    const world = ironworks();
    const seed = structuredClone(world.recipes[0].toJSON().iterative.step);
    const replace = async (id, updates) => {
      const at = world.recipes.findIndex((entry) => entry.id === id);
      world.recipes[at] = Recipe.fromJSON({ ...world.recipes[at].toJSON(), ...updates, id });
    };
    const store = createAdminStore(
      createServices(world.system, world.recipes, [], { updateRecipe: replace })
    );
    await store.selectSystem(world.system.id);
    const row0 = get(store.viewState).recipes.find((entry) => entry.id === 'iw-r-blade');
    const { live } = await mountEditor(world, JSON.parse(JSON.stringify(row0)));

    chooseSelectOption(target, '[data-iterative-counter-add]', 'temper');
    await settle();
    assert.equal(await store.updateRecipe('iw-r-blade', live.get('recipe')), true);

    const saved = world.recipes.find((entry) => entry.id === 'iw-r-blade').toJSON().iterative;
    assert.deepEqual(saved.step, seed, 'the step survives the Save');
    assert.deepEqual(
      saved.counters.map((entry) => entry.counterId),
      ['heat', 'temper']
    );
  });
});

/** The editor on `draft`, its step callbacks the real handlers over the live draft. */
async function mountWithHandlers(world, draft, extra = {}) {
  const ref = {};
  const handlers = createRecipeStepHandlers({
    draft: () => ref.live.get('recipe'),
    patch: (partial) => ref.apply(partial),
    confirm: async () => true,
    iterative: () => true,
    text: (_key, fallback) => fallback,
    localize: (key) => key,
  });
  const editor = await mountEditor(world, draft, {
    onEnterMultiStep: handlers.handleEnterMultiStep,
    onRevertToSingleStep: handlers.handleRevertToSingleStep,
    onAddStep: handlers.handleAddStep,
    onReorderSteps: handlers.handleReorderSteps,
    onUpdateStep: handlers.handleUpdateStep,
    onDeleteStep: handlers.handleDeleteStep,
    ...extra,
  });
  ref.live = editor.live;
  ref.apply = (partial) => {
    editor.calls.patches.push(structuredClone(partial));
    editor.live.set('recipe', { ...editor.live.get('recipe'), ...partial });
  };
  return editor;
}

const STEP_CARD = '[data-recipe-section="iterative-step"]';
const stepRow = (id) => $(`[data-recipe-step-id="${id}"]`);
const lastStep = (calls) => calls.patches.at(-1).iterative.step;
const panelOption = (id) => document.querySelector(`[data-popover-option="${id}"]`);

describe('iterative recipe Overview: a single step’s Working the recipe card', () => {
  it('states every action under All, with no picker, and writes All once', async () => {
    const world = ironworks();
    const { calls } = await mountEditor(world, await draftOf(world, 'iw-r-blade'));
    assert.match($(STEP_CARD).textContent, /Working the recipe/);
    await press($(`${STEP_CARD} [data-iterative-step-actions-mode="all"] input`), 'All actions');
    assert.equal(calls.patches.length, 1);
    assert.deepEqual(lastStep(calls).actions, { mode: 'all', actionIds: [] });
    assert.equal(
      $('[data-iterative-step-actions-count]').textContent.trim(),
      'All 3, including actions added later'
    );
    assert.ok(!$('[data-iterative-step-actions]'), 'All draws no picker');
  });

  it('seeds every library action on Only, writes the picker on Apply only, and marks idle ones', async () => {
    const world = ironworks();
    const draft = await draftOf(world, 'iw-r-blade');
    draft.iterative.step.actions = { mode: 'all', actionIds: [] };
    const { calls } = await mountEditor(world, draft);
    await press($(`${STEP_CARD} [data-iterative-step-actions-mode="only"] input`), 'Only these');
    assert.deepEqual(lastStep(calls).actions, {
      mode: 'only',
      actionIds: ['stoke', 'strike', 'quench'],
    });
    assert.equal($('[data-iterative-step-actions-count]').textContent.trim(), '3 of 3 allowed');

    await press($('[data-iterative-step-actions]'), 'the allowed-actions picker');
    assert.match(panelOption('quench').textContent, /changes nothing here/, 'Quench uses no Heat');
    assert.doesNotMatch(panelOption('strike').textContent, /changes nothing here/);
    await press(panelOption('quench'), 'Quench');
    assert.equal(calls.patches.length, 1, 'nothing writes before Apply');
    await press(document.querySelector('[data-set-picker-apply]'), 'Apply');
    assert.equal(calls.patches.length, 2);
    assert.deepEqual(lastStep(calls).actions.actionIds, ['stoke', 'strike']);
  });

  it('states an empty Only list as an error that describes the picker', async () => {
    const world = ironworks();
    const draft = await draftOf(world, 'iw-r-blade');
    draft.iterative.step.actions = { mode: 'only', actionIds: [] };
    await mountEditor(world, draft);
    const line = $(`${STEP_CARD} [data-iterative-step-part="actions"] .manager-iterative-fault`);
    assert.equal(
      line.textContent.trim(),
      'No actions are allowed, so players can’t work this step. Pick at least one.'
    );
    const add = $('[data-iterative-step-actions]');
    assert.equal(add.getAttribute('aria-invalid'), 'true');
    assert.equal(add.getAttribute('aria-describedby'), line.id);
    const issues = (await recipeReads(world)).recipeIssues(draft);
    assert.deepEqual(
      issues.map((issue) => [issue.code, issue.severity, issue.blocks]),
      [['iterativeNoAllowedActions', 'critical', 'enable']]
    );
  });

  it('states both empty rule lists, writes a Condition, and draws no step chip', async () => {
    const world = ironworks();
    const draft = await draftOf(world, 'iw-r-blade');
    draft.iterative.step.success = [];
    const { calls } = await mountEditor(world, draft);
    const empty = (end) =>
      $(`[data-iterative-step-end="${end}"] [data-counter-rules-empty]`)?.textContent.trim();
    assert.equal(empty('success'), 'No success rule. Without one, the step can never finish.');
    assert.equal(empty('failure'), 'No failure rule. The step can only end in success.');
    assert.ok(!$('[data-recipe-step-issues]'), 'a single step draws no chip');

    await press(
      $('[data-iterative-step-end="success"] [data-rule-row-preset="rule"]'),
      'the success Condition adder'
    );
    assert.match(
      $('[data-iterative-step-end="success"] [data-rule-row-preset]').textContent,
      /Condition/
    );
    assert.deepEqual(lastStep(calls).success, [
      { source: 'counter', counterId: 'heat', op: '>=', value: 0 },
    ]);
  });

  it('names a rule on a counter the recipe does not track, in both lists', async () => {
    const world = ironworks();
    const draft = await draftOf(world, 'iw-r-blade');
    draft.iterative.step.success = [{ source: 'counter', counterId: 'temper', op: '>=', value: 2 }];
    draft.iterative.step.failure = [{ source: 'counter', counterId: 'slag', op: '>=', value: 4 }];
    await mountEditor(world, draft);
    const fault = (end) =>
      $(`[data-iterative-step-end="${end}"] .manager-iterative-fault`)?.textContent.trim();
    assert.match(fault('success'), /^Temper isn.t tracked in this step\.$/);
    assert.match(fault('failure'), /^Slag isn.t tracked in this step\.$/);
  });

  it('shows a single step’s lock while a list is non-empty, and hides it once cleared', async () => {
    const world = ironworks();
    const { calls } = await mountEditor(world, await draftOf(world, 'iw-r-hinge'));
    assert.ok(Boolean($(`${STEP_CARD} [data-iterative-step-part="counters"]`)), 'Temper is locked');
    await press($('[data-iterative-step-lock="temper"]'), 'the Temper lock');
    assert.deepEqual(lastStep(calls).lockedCounterIds, []);
    assert.ok(!$(`${STEP_CARD} [data-iterative-step-part="counters"]`), 'nothing left to show');
  });
});

describe('iterative recipe Overview: the Steps card', () => {
  it('writes each step’s hide, lock and rules with their joiners, explaining a never-shown counter', async () => {
    const world = ironworks();
    const { calls } = await mountWithHandlers(world, await draftOf(world, 'iw-r-sword'));
    const heat = stepRow('iw-sword-heat');
    const slagHide = heat.querySelector('[data-iterative-step-hide="slag"]');
    assert.equal(slagHide.checked, true);
    assert.equal(slagHide.disabled, true);
    const reason = heat.querySelector('[data-iterative-step-never-shown]');
    assert.equal(reason.textContent.trim(), 'Hidden from players in every step');
    assert.equal(slagHide.getAttribute('aria-describedby'), reason.id);
    assert.equal(
      heat.querySelector('[data-iterative-step-hide="heat"]').getAttribute('aria-label'),
      'Hide from players: Heat in step 1'
    );

    await press(heat.querySelector('[data-iterative-step-lock="heat"]'), 'lock Heat');
    const stepOf = () => calls.patches.at(-1).steps[0].iterative;
    assert.deepEqual(stepOf().lockedCounterIds, ['temper', 'heat']);
    assert.ok('iterative' in calls.patches.at(-1), 'the recipe iterative is carried');

    for (const end of ['success', 'failure']) {
      await press(
        stepRow('iw-sword-heat').querySelector(
          `[data-iterative-step-end="${end}"] [data-rule-row-preset="rule"]`
        ),
        `the ${end} Condition adder`
      );
    }
    assert.equal(stepOf().success.length, 2);
    assert.equal(stepOf().failure.length, 2);
    const joiner = (end) =>
      stepRow('iw-sword-heat')
        .querySelector(`[data-iterative-step-end="${end}"] [data-counter-rules-joiner]`)
        .textContent.trim();
    assert.equal(joiner('success'), 'and');
    assert.equal(joiner('failure'), 'or');
  });

  it('counts each step’s blocking issues, else its warnings, as its tally does', async () => {
    const world = ironworks();
    const draft = await draftOf(world, 'iw-r-sword');
    await mountEditor(world, draft);
    const chip = (id) => stepRow(id).querySelector('[data-recipe-step-issues]');
    assert.match(chip('iw-sword-heat').textContent, /1 warning/);
    assert.match(chip('iw-sword-heat').textContent, /Heat the blank: 1 warning/);
    assert.match(chip('iw-sword-etch').textContent, /1 blocking/);
    assert.match(chip('iw-sword-etch').textContent, /Etch the fuller: 1 blocking issue/);
    assert.ok(Boolean(chip('iw-sword-etch').querySelector('.fa-circle-exclamation')));

    const issues = (await recipeReads(world)).recipeIssues(draft);
    for (const [index, id] of ['iw-sword-heat', 'iw-sword-etch'].entries()) {
      const tally = iterativeStepTally(issues, index);
      const count = tally.blocking || tally.warnings;
      assert.match(chip(id).textContent, new RegExp(String.raw`^\s*${count} `));
    }
  });

  it('moves the single step config onto step 1, and offers no remove on a sole step', async () => {
    const world = ironworks();
    const draft = await draftOf(world, 'iw-r-blade');
    const step = structuredClone(draft.iterative.step);
    const { calls } = await mountWithHandlers(world, draft);
    await press($('[data-recipe-step-mode-option="multi"] input'), 'Multi-step');
    const [patch] = calls.patches;
    assert.deepEqual(patch.steps[0].iterative, step);
    assert.equal(Object.hasOwn(patch.iterative, 'step'), false, 'no `iterative.step` is left');
    const [only] = patch.steps;
    assert.ok(Boolean(stepRow(only.id).querySelector('[data-iterative-step-config]')));
    assert.ok(!$('[data-recipe-step-delete]'), 'the sole step offers no remove');

    await press($('[data-recipe-step-add]'), 'Add a step');
    assert.equal(target.querySelectorAll('[data-recipe-step-delete]').length, 2);
    for (const tab of ['ingredients', 'results', 'tools']) {
      await press($(`#recipe-tab-${tab}`), tab);
      assert.equal(target.querySelectorAll('[data-recipe-step-delete]').length, 2, tab);
    }
  });

  it('offers no remove on a sole step on any tab', async () => {
    const world = ironworks();
    const draft = await draftOf(world, 'iw-r-sword');
    draft.steps = draft.steps.slice(0, 1);
    await mountEditor(world, draft);
    for (const tab of ['overview', 'ingredients', 'results', 'tools']) {
      await press($(`#recipe-tab-${tab}`), tab);
      assert.ok(Boolean($('[data-recipe-step-id="iw-sword-heat"]')), `${tab} lists the step`);
      assert.ok(!$('[data-recipe-step-delete]'), `${tab} offers no remove`);
    }
  });

  it('warns while multi-step is off, offers no Add a step, and routes to settings', async () => {
    const world = ironworks('multiStepOff');
    let opened = 0;
    const draft = await draftOf(world, 'iw-r-sword');
    await mountEditor(world, draft, {
      onOpenCraftingSettings: () => {
        opened += 1;
      },
    });
    const callout = $('[data-recipe-steps-multistep-off]');
    assert.match(
      callout.textContent,
      /Multi-step recipes are turned off in Ironworks, so this recipe can’t be started\./
    );
    assert.ok(!$('[data-recipe-step-add]'), 'no Add a step');
    assert.ok(!$('[data-recipe-section="collapsed-steps"]'));
    await press($('[data-recipe-steps-open-settings]'), 'Crafting Settings');
    assert.equal(opened, 1);
    const codes = (await recipeReads(world)).recipeIssues(draft).map((issue) => issue.code);
    assert.ok(codes.includes('iterativeMultiStepOff'));
  });
});

describe('step headers outside iterative', () => {
  it('draw no count and keep every delete on each tab', async () => {
    const world = ironworks();
    const draft = { ...(await draftOf(world, 'iw-r-sword')), iterative: undefined };
    draft.steps = draft.steps.slice(0, 1);
    await mountEditor(world, draft, { iterative: null, resolutionMode: 'simple' });
    for (const tab of ['overview', 'ingredients', 'results', 'tools']) {
      await press($(`#recipe-tab-${tab}`), tab);
      assert.ok(Boolean($('[data-recipe-step-delete="iw-sword-heat"]')), `${tab} keeps its delete`);
      assert.ok(!$('.manager-recipe-step-meta'), `${tab} draws no count`);
    }
    assert.ok(!$('[data-iterative-step-config]'));
  });
});

describe('iterative recipe Results', () => {
  const setRow = (id) => $(`[data-iterative-result-set="${id}"]`);
  const groupsOf = (calls) => calls.patches.at(-1).resultGroups;
  const stepGroupsOf = (calls, index = 0) => calls.patches.at(-1).steps[index].resultGroups;

  it('reads the iterative intro, and writes a When line’s end, rule and remove once each', async () => {
    const world = ironworks();
    const { calls } = await mountEditor(world, await draftOf(world, 'iw-r-hinge'));
    await press($('#recipe-tab-results'), 'Results');
    assert.match(
      $('[data-recipe-tab="results"] .manager-recipe-tab-intro').textContent,
      /What the work produces\. Result sets are checked top to bottom/
    );
    const lines = () => setRow('rg').querySelector('[data-produced-when]');
    assert.equal(
      lines().querySelector('.manager-iterative-fault').textContent.trim(),
      'Never produced. Add when it should be.'
    );

    await press(lines().querySelector('[data-produced-when-add]'), 'When');
    assert.equal(calls.patches.length, 1);
    assert.deepEqual(groupsOf(calls)[0].producedWhen, [{ end: 'success', rules: [] }]);
    assert.equal(
      lines().querySelector('[data-counter-rules-empty]').textContent.trim(),
      'Any value'
    );

    await press(
      lines().querySelector(':scope [data-produced-when-end="failure"] input'),
      'Failure'
    );
    assert.equal(calls.patches.length, 2);
    assert.deepEqual(groupsOf(calls)[0].producedWhen, [{ end: 'failure', rules: [] }]);

    await press(lines().querySelector('[data-rule-row-preset]'), 'Condition');
    assert.equal(calls.patches.length, 3);
    assert.deepEqual(groupsOf(calls)[0].producedWhen[0].rules, [
      { source: 'counter', counterId: 'heat', op: '>=', value: 0 },
    ]);

    await press(lines().querySelector('[data-produced-when-remove="0"]'), 'the line remove');
    assert.equal(calls.patches.length, 4);
    assert.equal('producedWhen' in groupsOf(calls)[0], false, 'no line leaves no key');
    assert.equal(groupsOf(calls)[0].id, 'rg', 'the set keeps its id');
    assert.ok(document.activeElement === lines().querySelector('[data-produced-when-add]'));
  });

  it('marks only the failure set, and moves a set with the rocker in its step', async () => {
    const world = ironworks();
    const { calls } = await mountWithHandlers(world, await draftOf(world, 'iw-r-sword'));
    await press($('#recipe-tab-results'), 'Results');
    assert.match(
      $('[data-recipe-tab="results"] .manager-recipe-tab-intro').textContent,
      /What each step produces\./
    );
    assert.equal(
      setRow('g1-fail').querySelector('[data-iterative-failure-set]').textContent,
      'Failure set'
    );
    assert.ok(!setRow('g1').querySelector('[data-iterative-failure-set]'));
    assert.equal(
      setRow('g1-fail').closest('[aria-label="Result sets"]').getAttribute('role'),
      'list'
    );

    await press(setRow('g1').querySelector('[data-sortable-move="down"]'), 'Move down');
    assert.deepEqual(
      stepGroupsOf(calls).map((group) => group.id),
      ['g1-fail', 'g1']
    );
    assert.equal(stepGroupsOf(calls)[0].role, 'failure', 'the failure set moves like any other');
  });

  it('states a scope with no set, and hands focus to the adder after a remove', async () => {
    const world = ironworks();
    const { calls } = await mountEditor(world, await draftOf(world, 'iw-r-blade'));
    await press($('#recipe-tab-results'), 'Results');
    await press(setRow('rg').querySelector('[data-sortable-remove]'), 'remove the set');
    assert.deepEqual(groupsOf(calls), []);
    assert.equal(
      $('[data-iterative-results-empty]').textContent.trim(),
      'No result sets. This step produces nothing.'
    );
    assert.ok(
      document.activeElement === $('[data-iterative-results] [data-recipe-add="result-set"]')
    );

    await press($('[data-recipe-add="result-set"]'), 'Add result set');
    assert.equal(groupsOf(calls).length, 1);
    assert.ok(Boolean(groupsOf(calls)[0].id), 'a new set carries an id');
  });

  it('names an untracked rule and marks a line that does not parse', async () => {
    const world = ironworks();
    const draft = await draftOf(world, 'iw-r-blade');
    draft.resultGroups[0].producedWhen = [
      { end: 'success', rules: [{ source: 'counter', counterId: 'temper', op: '>=', value: 2 }] },
      { end: 'sideways', rules: [] },
    ];
    await mountEditor(world, draft);
    await press($('#recipe-tab-results'), 'Results');
    const line = (index) => $(`[data-produced-when-line="${index}"]`);
    assert.match(
      line(0).querySelector('[data-counter-rule-source]').textContent,
      /Temper \(not tracked\)/
    );
    assert.equal(
      line(0).querySelector('[data-issue-code="iterativeUnknownCounter"]').textContent.trim(),
      "Temper isn't tracked in this step."
    );
    const group = line(1).querySelector('[role="radiogroup"]');
    const mark = line(1).querySelector('[data-issue-code="iterativeInvalidEntry"]');
    assert.equal(group.getAttribute('aria-invalid'), 'true');
    assert.equal(group.getAttribute('aria-describedby'), mark.id);
    assert.equal(group.getAttribute('aria-label'), 'Success or failure');
  });
});

describe('iterative recipe Validation', () => {
  const badges = () =>
    [
      ...target.querySelectorAll(
        ':scope [data-recipe-tab-button="validation"] .manager-editor-tab-badge'
      ),
    ].map((node) => node.textContent.trim());
  const enableSwitch = () => $('[data-recipe-field="enabled"]');
  const openValidation = () => press($('#recipe-tab-validation'), 'Validation');

  it('blocks Enable for a recipe-scoped critical issue, and frees an enabled recipe', async () => {
    const world = ironworks();
    const draft = { ...(await draftOf(world, 'iw-r-nail')), enabled: false };
    await mountEditor(world, draft);
    assert.equal(enableSwitch().disabled, true, 'Bent Nail cannot be enabled');
    unmount(mounted);
    target.remove();

    await mountEditor(world, { ...draft, enabled: true });
    assert.equal(enableSwitch().disabled, false, 'an enabled recipe can still be disabled');
  });

  it('counts a library start blocker on the badge and leaves Enable free', async () => {
    const world = ironworks();
    const draft = { ...(await draftOf(world, 'iw-r-blade')), enabled: false };
    await mountEditor(world, draft);
    assert.deepEqual(badges(), []);
    unmount(mounted);
    target.remove();

    world.system.iterative.counters = world.system.iterative.counters.map((counter) =>
      counter.id === 'heat' ? { ...counter, limit: 'global', min: 9, max: 2 } : counter
    );
    await mountEditor(world, draft);
    assert.deepEqual(badges(), ['1'], 'the badge rises by one');
    assert.equal(enableSwitch().disabled, false, 'and Enable stays free');
    await openValidation();
    const row = $('[data-issue="iterativeBoundsInverted:counter:heat"]');
    assert.match(row.querySelector('.manager-recipe-val-title').textContent, /^Heat: /);
    assert.ok(row.classList.contains('is-block'), 'a block row, though Enable is free');
  });

  it('lands each row’s View on the control its issue names', async () => {
    const world = ironworks();
    const cases = [
      ['iw-r-ingot', 'iterativeNoCounters:recipe', '[data-iterative-counters-add-all]'],
      ['iw-r-nail', 'iterativeUnknownAction:recipe', '[data-iterative-step-actions]'],
      [
        'iw-r-rivet',
        'iterativeBoundsInverted:recipe',
        '[data-recipe-section="iterative-counters"]',
      ],
      [
        'iw-r-sword',
        'iterativeNoSuccessRule:1',
        '[data-recipe-step-id="iw-sword-etch"] [data-iterative-step-end="success"]',
      ],
    ];
    for (const [id, issueId, control] of cases) {
      await mountWithHandlers(world, await draftOf(world, id));
      await openValidation();
      await press($(`[data-issue="${issueId}"] [data-recipe-issue-view]`), `${issueId}'s View`);
      await settle();
      assert.ok(document.activeElement === $(control), `${issueId} focuses ${control}`);
      unmount(mounted);
      target.remove();
      mounted = null;
    }
  });

  it('agrees with the status, the tallies and Systems › Validation on every lab recipe', async () => {
    const world = ironworks();
    const reads = await recipeReads(world);
    const byCode = (codes) => [...codes].sort(byCodePoint);
    for (const recipe of world.recipes) {
      const draft = await draftOf(world, recipe.id);
      const issues = reads.recipeIssues(draft);
      const readiness = evaluateRecipeReadiness(draft, {
        iterative: reads.recipeReadinessInput(draft),
      });
      const iterativeRows = recipeValidationRowStates(readiness).filter(
        (row) => row.issue?.iterativeCode
      );
      const blockRows = iterativeRows.filter((row) => row.status === 'block').length;
      const status = iterativeRecipeStatus(issues);
      if (status.id === 'blocking') assert.equal(blockRows, status.count, recipe.id);
      assert.equal(blockRows, issues.filter((entry) => entry.severity === 'critical').length);
      const tallied = (draft.steps ?? []).map((_step, index) => iterativeStepTally(issues, index));
      const wide = issues.filter((entry) => entry.stepIndex == null || draft.steps?.length === 0);
      const sum = (key) => tallied.reduce((total, tally) => total + tally[key], 0);
      assert.equal(
        sum('blocking') + wide.filter((entry) => entry.severity === 'critical').length,
        issues.filter((entry) => entry.severity === 'critical').length,
        `${recipe.id} blocking`
      );
      assert.equal(
        sum('warnings') + wide.filter((entry) => entry.severity === 'warning').length,
        issues.filter((entry) => entry.severity === 'warning').length,
        `${recipe.id} warnings`
      );
      const system = evaluateIterativeReadiness(world.system, [draft])
        .filter((entry) => entry.kind === 'recipe')
        .map((entry) => entry.code);
      const editor = readiness.issues
        .filter((entry) => entry.iterativeCode && !entry.entityName)
        .map((entry) => entry.iterativeCode);
      assert.deepEqual(byCode(editor), byCode(system), `${recipe.id} codes`);
    }
  });

  it('keeps the Validation codes equal to the pill after a Save and a reopen', async () => {
    const world = ironworks();
    const replace = async (id, updates) => {
      const at = world.recipes.findIndex((entry) => entry.id === id);
      world.recipes[at] = Recipe.fromJSON({ ...world.recipes[at].toJSON(), ...updates, id });
    };
    const store = createAdminStore(
      createServices(world.system, world.recipes, [], { updateRecipe: replace })
    );
    await store.selectSystem(world.system.id);
    const rowOf = (id) => get(store.viewState).recipes.find((entry) => entry.id === id);
    const { live } = await mountEditor(world, JSON.parse(JSON.stringify(rowOf('iw-r-blade'))));
    await press($('[data-iterative-counter-remove="heat"]'), 'remove Heat');
    assert.equal(await store.updateRecipe('iw-r-blade', live.get('recipe')), true);
    unmount(mounted);
    target.remove();

    const reopened = JSON.parse(JSON.stringify(rowOf('iw-r-blade')));
    const reads = await recipeReads(world);
    const status = iterativeRecipeStatus(reads.recipeIssues(reopened));
    await mountEditor(world, reopened);
    await openValidation();
    const codes = [...target.querySelectorAll('[data-issue]')].map((row) => row.dataset.issue);
    assert.deepEqual(status, { id: 'setup' });
    assert.ok(codes.includes('iterativeNoCounters:recipe'), 'Validation states what the pill does');
  });
});

describe('the mid-run banner', () => {
  const banner = () => $('[data-iterative-mid-run]');

  it('states the count on every tab but Validation, singular for one', async () => {
    const world = ironworks();
    await mountEditor(world, await draftOf(world, 'iw-r-blade'), { runs: 2 });
    for (const tab of ['overview', 'ingredients', 'results', 'tools']) {
      await press($(`#recipe-tab-${tab}`), tab);
      assert.ok(Boolean(banner()), `${tab} states it`);
      assert.ok(Boolean(banner().closest('.manager-editor-notice-position')), 'in the inset');
    }
    assert.equal(banner().dataset.iterativeMidRun, '2');
    assert.match(banner().textContent, /2 workpieces of Tempered Blade are in progress\./);
    assert.match(
      banner().textContent,
      /They keep the counters, rules and routes they started with\./
    );
    await press($('#recipe-tab-validation'), 'Validation');
    assert.ok(!banner(), 'Validation does not');
    unmount(mounted);
    target.remove();

    await mountEditor(world, await draftOf(world, 'iw-r-blade'), { runs: 1 });
    assert.match(banner().textContent, /1 workpiece of Tempered Blade is in progress\./);
    unmount(mounted);
    target.remove();

    await mountEditor(world, await draftOf(world, 'iw-r-blade'));
    assert.ok(!banner(), 'nothing at zero');
    assert.ok(!$('.manager-editor-notice-position'), 'and no empty inset');
  });
});
