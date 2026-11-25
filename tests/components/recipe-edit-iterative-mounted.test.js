/**
 * The iterative recipe editor's Overview (issue 3010), mounted over the lab's authored Ironworks:
 * the Counters table's writes, faults, adder and empty states, the mode callout, the header status,
 * and a Save that keeps `Recipe.iterative.step` through the real store's projection.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync, mount, tick, unmount } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { get } from 'svelte/store';

import { Recipe } from '../../src/models/Recipe.js';
import { normalizeIterativeLibrary } from '../../src/systems/normalize/iterativeLibrary.js';
import { iterativeStatusChip } from '../../src/ui/svelte/apps/manager/iterative/iterativeStatusCopy.js';
import { createAdminStore } from '../../src/ui/svelte/stores/adminStore.js';
import { createServices } from '../helpers/adminStoreServices.js';
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

/** Mounts the editor on `draft`, applying each patch as the shell's `patchRecipeDraft` does. */
async function mountEditor(world, draft, extra = {}) {
  const live = new SvelteMap([['recipe', draft]]);
  const calls = { patches: [], routed: 0 };
  const iterative = {
    counters: world.system.iterative.counters,
    systemName: world.system.name,
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
