/**
 * The recipe editor's step handlers as the root runs them: add, reorder, update, delete, enter
 * multi-step and revert to single-step, each driven from the rendered control and read back from the
 * `updateRecipe` payload Save commits (issue 3010, P4). A non-iterative recipe, `confirmRecipeAction`
 * stubbed for both outcomes.
 */
import assert from 'node:assert/strict';
import { afterEach, before, describe, it } from 'node:test';

import { flushSync, tick, unmount } from 'svelte';

import { createManagerMounts } from '../helpers/manager/managerMount.js';
import { createManagerQueries, headerSaveButton } from '../helpers/manager/managerQueries.js';

import {
  assertNoTitledIconButton,
  managerComponents,
  settle,
  settleBetweenTests,
  titledIconButtons,
} from './manager-mounted-shared.js';

let Component;
let mounted;
let target;
let formatBefore;

const queries = createManagerQueries(() => target);
const { openRecipeEditor } = createManagerMounts({
  queries,
  component: () => Component,
  adopt: (nextMounted, nextTarget) => {
    mounted = nextMounted;
    target = nextTarget;
  },
  adoptStore: () => {},
});

const MULTI_STEP = { multiStepRecipes: true };
const KEY = 'FABRICATE.Admin.Manager.Recipe';
const FORGE = { id: 'sa', name: 'Forge', description: 'Heat it.' };
const QUENCH = { id: 'sb', name: 'Quench', description: '' };

/** Open r1 with `recipe` fields merged over it and the multi-step feature on. */
function openEditor(calls, recipe = {}, storeOptions = {}) {
  return openRecipeEditor(calls, {
    selectedFeatures: MULTI_STEP,
    recipeOverrides: recipe,
    ...storeOptions,
  });
}

async function press(selector) {
  const control = target.querySelector(selector);
  assert.ok(Boolean(control), `${selector} is not on the page`);
  control.click();
  await settle();
}

/** Rename one step through its Overview name field, as a GM committing the edit. */
async function renameStep(id, value) {
  const row = target.querySelector(`[data-recipe-step-id="${id}"]`);
  const input = row.querySelector('[data-recipe-step-field="name"]');
  input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
}

/** Save the staged draft and return the one `updateRecipe` call it commits. */
async function save(calls) {
  headerSaveButton(target).click();
  await settle();
  const updates = calls.filter((call) => call[0] === 'updateRecipe');
  assert.equal(updates.length, 1, 'Save commits the staged draft once');
  return updates[0];
}

/** The freshly minted step ids a handler produced, swapped for a placeholder so a payload is literal. */
function pinFreshIds(steps, knownIds = []) {
  return steps.map((step) => {
    if (knownIds.includes(step.id)) return step;
    assert.ok(typeof step.id === 'string' && step.id.length > 0, 'a new step carries an id');
    return { ...step, id: '<fresh>' };
  });
}

const confirmCalls = (calls) => calls.filter((call) => call[0] === 'confirmRecipeAction');

export function registerRecipeStepsCases() {
  before(async () => {
    ({ Component } = await managerComponents());
  });

  afterEach(async () => {
    const titled = titledIconButtons();
    if (formatBefore) globalThis.game.i18n.format = formatBefore;
    formatBefore = null;
    if (mounted) {
      unmount(mounted);
      mounted = null;
    }
    target?.remove();
    target = null;
    await settleBetweenTests();
    assertNoTitledIconButton(titled);
  });

  /** Make `localize(key, data)` show its data, so a confirm payload's interpolation is pinned. */
  function showFormatData() {
    formatBefore = globalThis.game.i18n.format;
    globalThis.game.i18n.format = (key, data) => `${key}|${JSON.stringify(data)}`;
  }

  describe('recipe step handlers on the root mount', () => {
    it('enters multi-step by seeding step 1 from the draft top-level sets, groups and tools', async () => {
      const calls = [];
      await openEditor(calls, {
        ingredientSets: [{ id: 'set-a' }],
        resultGroups: [{ id: 'group-a' }],
        toolIds: ['tool-a'],
      });
      await press('[data-recipe-step-mode-option="multi"] input[type="radio"]');

      const update = await save(calls);
      assert.equal(update[1], 'r1');
      assert.deepEqual(update[3], { allowIncomplete: true, notify: false });
      assert.deepEqual(pinFreshIds(update[2].steps), [
        {
          id: '<fresh>',
          name: 'Step 1',
          description: '',
          ingredientSets: [{ id: 'set-a' }],
          resultGroups: [{ id: 'group-a' }],
          toolIds: ['tool-a'],
        },
      ]);
      assert.equal(update[2].name, 'Healing Draught', 'the rest of the draft is untouched');
      assert.deepEqual(confirmCalls(calls), [], 'entering multi-step asks nothing');
    });

    it('seeds empty sets, groups and tools when the draft has none', async () => {
      const calls = [];
      await openEditor(calls);
      await press('[data-recipe-step-mode-option="multi"] input[type="radio"]');

      const update = await save(calls);
      assert.deepEqual(pinFreshIds(update[2].steps), [
        {
          id: '<fresh>',
          name: 'Step 1',
          description: '',
          ingredientSets: [],
          resultGroups: [],
          toolIds: [],
        },
      ]);
    });

    it('adds a step named after its position', async () => {
      const calls = [];
      await openEditor(calls, { steps: [FORGE, QUENCH] });
      await press('[data-recipe-step-add]');

      const update = await save(calls);
      assert.deepEqual(pinFreshIds(update[2].steps, ['sa', 'sb']), [
        FORGE,
        QUENCH,
        { id: '<fresh>', name: 'Step 3', description: '' },
      ]);
    });

    it('moves a step up and down by one place', async () => {
      const calls = [];
      await openEditor(calls, { steps: [FORGE, QUENCH, { id: 'sc', name: 'Polish' }] });
      await press('[data-recipe-step-id="sc"] [data-sortable-move="up"]');
      await press('[data-recipe-step-id="sa"] [data-sortable-move="down"]');

      const update = await save(calls);
      assert.deepEqual(
        update[2].steps.map((step) => step.id),
        ['sc', 'sa', 'sb'],
        'sc moved above sb, then sa moved below it'
      );
    });

    it('updates one step by id and leaves the others as they were', async () => {
      const calls = [];
      await openEditor(calls, { steps: [FORGE, QUENCH] });
      await renameStep('sb', 'Quench hard');

      const update = await save(calls);
      assert.deepEqual(update[2].steps, [FORGE, { ...QUENCH, name: 'Quench hard' }]);
    });

    it('deletes a confirmed step and asks with its name and the overview wording', async () => {
      showFormatData();
      const calls = [];
      await openEditor(calls, { steps: [FORGE, QUENCH] });
      await press('[data-recipe-step-delete="sa"]');

      assert.deepEqual(confirmCalls(calls), [
        [
          'confirmRecipeAction',
          {
            title: `${KEY}.DeleteStepTitle`,
            content: `${KEY}.DeleteStepContent|{"name":"Forge","alsoDeleted":"${KEY}.DeleteStepAlsoAll"}`,
            confirmLabel: `${KEY}.DeleteStep`,
          },
        ],
      ]);
      const update = await save(calls);
      assert.deepEqual(update[2].steps, [QUENCH]);
    });

    it('names an unnamed step "this step" in the delete confirmation', async () => {
      showFormatData();
      const calls = [];
      await openEditor(calls, { steps: [{ id: 'sa', name: '  ' }, QUENCH] });
      await press('[data-recipe-step-delete="sa"]');

      assert.match(confirmCalls(calls)[0][1].content, /"name":"this step"/);
    });

    it('words the delete confirmation for the tab it was raised from', async () => {
      showFormatData();
      const calls = [];
      await openEditor(calls, { steps: [FORGE, QUENCH] });
      await press('#recipe-tab-ingredients');
      await press('[data-recipe-step-delete="sa"]');

      assert.match(
        confirmCalls(calls)[0][1].content,
        new RegExp(`"alsoDeleted":"${KEY}.DeleteStepAlsoIngredients"`)
      );
    });

    it('keeps the step when the delete is declined', async () => {
      const calls = [];
      await openEditor(calls, { steps: [FORGE, QUENCH] }, { confirmRecipeActionResult: false });
      await press('[data-recipe-step-delete="sa"]');

      assert.equal(confirmCalls(calls).length, 1);
      assert.ok(target.querySelector('[data-recipe-step-id="sa"]'), 'the row is still listed');
      assert.deepEqual(
        calls.filter((call) => call[0] === 'updateRecipe'),
        [],
        'and nothing was staged to save'
      );
    });

    it('reverts to a single step on confirm, naming the recipe in the question', async () => {
      showFormatData();
      const calls = [];
      await openEditor(calls, { steps: [FORGE, QUENCH] });
      await press('[data-recipe-step-mode-option="single"] input[type="radio"]');

      assert.deepEqual(confirmCalls(calls), [
        [
          'confirmRecipeAction',
          {
            title: `${KEY}.RevertToSingleStepTitle`,
            content: `${KEY}.RevertToSingleStepContent|{"name":"Healing Draught"}`,
            confirmLabel: `${KEY}.RevertToSingleStepConfirm`,
          },
        ],
      ]);
      const update = await save(calls);
      assert.deepEqual(update[2].steps, []);
    });

    it('keeps the steps when the revert is declined', async () => {
      const calls = [];
      await openEditor(calls, { steps: [FORGE, QUENCH] }, { confirmRecipeActionResult: false });
      await press('[data-recipe-step-mode-option="single"] input[type="radio"]');

      assert.equal(confirmCalls(calls).length, 1);
      assert.ok(target.querySelector('[data-recipe-step-id="sb"]'), 'the steps are still listed');
      assert.deepEqual(
        calls.filter((call) => call[0] === 'updateRecipe'),
        []
      );
    });

    // The shipped read-before-confirm: the delete computes its steps before the dialog, so an edit
    // made while the dialog is open is not in what it writes. P6 replaces this with a read-after.
    it('writes the steps it read before the confirm, dropping an edit made while it was open', async () => {
      const calls = [];
      let release;
      const answer = new Promise((resolve) => {
        release = resolve;
      });
      await openEditor(calls, { steps: [FORGE, QUENCH] }, { confirmRecipeActionResult: answer });
      await press('[data-recipe-step-delete="sa"]');

      await renameStep('sb', 'Edited meanwhile');
      release(true);
      await settle();
      await tick();
      flushSync();

      const update = await save(calls);
      assert.deepEqual(update[2].steps, [QUENCH], 'the pre-confirm copy of step sb is what lands');
    });
  });
}
