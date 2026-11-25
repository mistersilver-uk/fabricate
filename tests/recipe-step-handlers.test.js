import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Recipe } from '../src/models/Recipe.js';
import {
  createRecipeStepHandlers,
  newStepId,
} from '../src/ui/svelte/apps/manager/recipe/recipeStepHandlers.js';

import { installFoundryUtilsEnv } from './helpers/foundryEnv.js';

/** A draft holder the handlers read through a thunk and write through `patch`, with a scripted confirm. */
function harness({
  draft = { id: 'r1', name: 'Tonic' },
  confirms = [],
  iterative = false,
  text = (key, fallback) => fallback,
} = {}) {
  const state = { draft, asked: [], patches: [] };
  const handlers = createRecipeStepHandlers({
    iterative: () => iterative,
    draft: () => state.draft,
    patch: (partial) => {
      state.patches.push(partial);
      state.draft = { ...state.draft, ...partial };
    },
    confirm: async (options) => {
      state.asked.push(options);
      return confirms.length > 0 ? confirms.shift() : true;
    },
    text,
    localize: (key, data) => (data ? `${key}|${JSON.stringify(data)}` : key),
  });
  return { state, handlers };
}

describe('recipe step handlers read the draft at call time', () => {
  it('adds a step after the one entering multi-step seeded', () => {
    const { state, handlers } = harness({ draft: { id: 'r1', toolIds: ['anvil'] } });
    handlers.handleEnterMultiStep();
    handlers.handleAddStep();
    assert.deepEqual(
      state.draft.steps.map((step) => step.name),
      ['Step 1', 'Step 2']
    );
    assert.deepEqual(state.draft.steps[0].toolIds, ['anvil']);
  });

  it('reorders the steps an add left, not the draft it was made from', () => {
    const { state, handlers } = harness({ draft: { id: 'r1', steps: [{ id: 'a', name: 'A' }] } });
    handlers.handleAddStep();
    assert.equal(handlers.handleReorderSteps(1, 0), true);
    assert.deepEqual(
      state.draft.steps.map((step) => step.name),
      ['Step 2', 'A']
    );
  });

  it('updates a step an earlier call added', () => {
    const { state, handlers } = harness();
    handlers.handleEnterMultiStep();
    const [{ id }] = state.draft.steps;
    handlers.handleUpdateStep(id, { name: 'Forge' });
    assert.equal(state.draft.steps[0].name, 'Forge');
    assert.equal(state.draft.steps[0].description, '', 'and the rest of the step is kept');
  });

  it('deletes down to zero steps through enter then add then two deletes', async () => {
    const { state, handlers } = harness();
    handlers.handleEnterMultiStep();
    handlers.handleAddStep();
    const ids = state.draft.steps.map((step) => step.id);
    assert.equal(await handlers.handleDeleteStep(ids[1]), true);
    assert.deepEqual(
      state.draft.steps.map((step) => step.id),
      [ids[0]]
    );
    assert.equal(await handlers.handleDeleteStep(ids[0]), true);
    assert.deepEqual(state.draft.steps, []);
  });

  it('follows a draft the root replaced between calls', () => {
    const { state, handlers } = harness();
    handlers.handleEnterMultiStep();
    state.draft = { id: 'r2', steps: [{ id: 'x', name: 'X' }] };
    handlers.handleAddStep();
    assert.deepEqual(state.draft.steps.map((step) => step.id).slice(0, 1), ['x']);
    assert.equal(state.draft.steps.length, 2);
  });
});

describe('recipe step handler guards and confirms', () => {
  it('does nothing without a draft', async () => {
    const { state, handlers } = harness({ draft: null });
    assert.equal(handlers.handleEnterMultiStep(), false);
    assert.equal(handlers.handleAddStep(), false);
    assert.equal(handlers.handleReorderSteps(0, 1), false);
    assert.equal(handlers.handleUpdateStep('a', { name: 'x' }), false);
    assert.equal(await handlers.handleDeleteStep('a'), false);
    assert.equal(await handlers.handleRevertToSingleStep(), false);
    assert.deepEqual(state.patches, []);
  });

  it('refuses an out-of-range or no-op reorder and an empty update', () => {
    const { state, handlers } = harness({
      draft: { id: 'r1', steps: [{ id: 'a' }, { id: 'b' }] },
    });
    for (const [from, to] of [
      [-1, 0],
      [0, -1],
      [2, 0],
      [0, 2],
      [1, 1],
    ]) {
      assert.equal(handlers.handleReorderSteps(from, to), false, `${from} to ${to}`);
    }
    assert.equal(handlers.handleUpdateStep('a', null), false);
    assert.deepEqual(state.patches, []);
  });

  it('keeps the steps when a delete or a revert is declined', async () => {
    const steps = [{ id: 'a', name: 'A' }];
    const { state, handlers } = harness({
      draft: { id: 'r1', name: 'Tonic', steps },
      confirms: [false, false],
    });
    assert.equal(await handlers.handleDeleteStep('a'), false);
    assert.equal(await handlers.handleRevertToSingleStep(), false);
    assert.deepEqual(state.patches, []);
    assert.equal(state.asked.length, 2);
  });

  it('writes nothing for a step id the draft does not hold, and asks nothing', async () => {
    const { state, handlers } = harness({ draft: { id: 'r1', steps: [{ id: 'a' }] } });
    assert.equal(await handlers.handleDeleteStep('zzz'), false);
    assert.deepEqual(state.asked, []);
  });

  it('words the delete question for the tab it came from, naming the step', async () => {
    const { state, handlers } = harness({
      draft: { id: 'r1', steps: [{ id: 'a', name: 'Forge' }] },
    });
    await handlers.handleDeleteStep('a', 'tools');
    const prefix = 'FABRICATE.Admin.Manager.Recipe';
    assert.deepEqual(state.asked[0], {
      title: `${prefix}.DeleteStepTitle`,
      content: `${prefix}.DeleteStepContent|{"name":"Forge","alsoDeleted":"${prefix}.DeleteStepAlsoTools"}`,
      confirmLabel: `${prefix}.DeleteStep`,
    });
  });

  it('asks about a revert by recipe name, falling back to "this recipe"', async () => {
    const named = harness({ draft: { id: 'r1', name: ' Tonic ', steps: [{ id: 'a' }] } });
    await named.handlers.handleRevertToSingleStep();
    assert.match(named.state.asked[0].content, /"name":"Tonic"/);
    const unnamed = harness({ draft: { id: 'r1', name: ' ', steps: [{ id: 'a' }] } });
    await unnamed.handlers.handleRevertToSingleStep();
    assert.match(unnamed.state.asked[0].content, /"name":"this recipe"/);
  });

  it('needs no confirm collaborator to decline', async () => {
    const handlers = createRecipeStepHandlers({
      draft: () => ({ id: 'r1', steps: [{ id: 'a' }] }),
      patch: () => assert.fail('nothing is staged without a confirmation'),
      text: (key, fallback) => fallback,
      localize: (key) => key,
    });
    assert.equal(await handlers.handleDeleteStep('a'), false);
  });
});

/** A confirm the test answers by hand, so an edit can land while it is open. */
function deferredConfirm() {
  const pending = [];
  return {
    confirm: () =>
      new Promise((resolve) => {
        pending.push(resolve);
      }),
    answer: (value) => pending.shift()(value),
  };
}

describe('a confirming handler reads the draft after the confirm resolves', () => {
  function deferredHarness(draft, iterative = false) {
    const dialog = deferredConfirm();
    const state = { draft, patches: [] };
    const handlers = createRecipeStepHandlers({
      iterative: () => iterative,
      draft: () => state.draft,
      patch: (partial) => {
        state.patches.push(partial);
        state.draft = state.draft ? { ...state.draft, ...partial } : state.draft;
      },
      confirm: dialog.confirm,
      text: (key, fallback) => fallback,
      localize: (key) => key,
    });
    return { state, handlers, dialog };
  }

  it('deletes from the steps an edit left while the confirm was open', async () => {
    const { state, handlers, dialog } = deferredHarness({
      id: 'r1',
      steps: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    });
    const deleting = handlers.handleDeleteStep('a');
    handlers.handleUpdateStep('b', { name: 'B edited' });
    dialog.answer(true);
    assert.equal(await deleting, true);
    assert.deepEqual(state.patches.at(-1), { steps: [{ id: 'b', name: 'B edited' }] });
  });

  it('writes nothing when the step or the draft went while the confirm was open', async () => {
    const steps = [{ id: 'a' }, { id: 'b' }];
    const gone = deferredHarness({ id: 'r1', steps });
    const deleting = gone.handlers.handleDeleteStep('a');
    gone.state.draft = { id: 'r1', steps: [{ id: 'b' }] };
    gone.dialog.answer(true);
    assert.equal(await deleting, false);

    const closed = deferredHarness({ id: 'r1', steps });
    const reverting = closed.handlers.handleRevertToSingleStep();
    closed.state.draft = null;
    closed.dialog.answer(true);
    assert.equal(await reverting, false);
    assert.deepEqual([...gone.state.patches, ...closed.state.patches], []);
  });

  it('collapses the step 1 an edit left while the confirm was open, under iterative', async () => {
    const { state, handlers, dialog } = deferredHarness(
      { id: 'r1', iterative: { counters: [] }, steps: [FORGE, QUENCH] },
      true
    );
    const collapsing = handlers.handleRevertToSingleStep();
    handlers.handleUpdateStep('sa', { toolIds: ['tongs'] });
    dialog.answer(true);
    assert.equal(await collapsing, true);
    assert.deepEqual(state.patches.at(-1).toolIds, ['tongs']);
    assert.deepEqual(state.patches.at(-1).iterative, { counters: [], step: STEP_CONFIG });
  });
});

const STEP_CONFIG = Object.freeze({
  actions: { mode: 'only', actionIds: ['strike'] },
  hiddenCounterIds: [],
  lockedCounterIds: ['heat'],
  success: [{ source: 'counter', counterId: 'heat', op: '>=', value: 8 }],
  failure: [],
});
const FORGE = Object.freeze({
  id: 'sa',
  name: 'Forge',
  description: '',
  ingredientSets: [{ id: 'set-a' }],
  resultGroups: [{ id: 'group-a' }],
  toolIds: ['anvil'],
  timeRequirement: { hours: 2 },
  iterative: STEP_CONFIG,
});
const QUENCH = Object.freeze({ id: 'sb', name: 'Quench', description: '' });
const COUNTERS = Object.freeze([{ counterId: 'heat', start: 0, visible: true }]);
const KEY = 'FABRICATE.Admin.Manager.Recipe';

describe('recipe step handlers under iterative', () => {
  it('enters multi-step by moving the recipe step config onto step 1', () => {
    const { state, handlers } = harness({
      iterative: true,
      draft: { id: 'r1', iterative: { counters: COUNTERS, step: STEP_CONFIG }, toolIds: ['anvil'] },
    });
    handlers.handleEnterMultiStep();
    const [patch] = state.patches;
    assert.deepEqual(patch.iterative, { counters: COUNTERS }, 'no `iterative.step` is left');
    assert.deepEqual(patch.steps[0].iterative, STEP_CONFIG);
    assert.deepEqual(patch.steps[0].toolIds, ['anvil']);
  });

  it('enters multi-step without a step key when the recipe had no step config', () => {
    const { state, handlers } = harness({ iterative: true, draft: { id: 'r1', iterative: null } });
    handlers.handleEnterMultiStep();
    assert.equal(Object.hasOwn(state.patches[0].steps[0], 'iterative'), false);
    assert.equal(state.patches[0].iterative, null, 'the held `null` is carried, not omitted');
  });

  it('names the seeded step and the collapse prompt from `text`', async () => {
    const text = (key, fallback) => (key === `${KEY}.StepLabel` ? 'Étape' : fallback);
    const entering = harness({ iterative: true, text, draft: { id: 'r1' } });
    entering.handlers.handleEnterMultiStep();
    assert.equal(entering.state.patches[0].steps[0].name, 'Étape 1');

    const collapsing = harness({
      iterative: true,
      text,
      draft: { id: 'r1', steps: [{ id: 'a', name: ' ' }, QUENCH, { id: 'c' }] },
    });
    await collapsing.handlers.handleRevertToSingleStep();
    assert.deepEqual(collapsing.state.asked[0], {
      title: `${KEY}.RevertToSingleStepTitle`,
      content: `${KEY}.Iterative.CollapseContent|{"first":"Étape 1","others":"Quench, Étape 3"}`,
      confirmLabel: `${KEY}.Iterative.CollapseConfirm`,
    });
  });

  it('collapses to one step keeping step 1 whole, asking with the one-other copy', async () => {
    const { state, handlers } = harness({
      iterative: true,
      draft: { id: 'r1', iterative: { counters: COUNTERS }, steps: [FORGE, QUENCH] },
    });
    assert.equal(await handlers.handleRevertToSingleStep(), true);
    assert.equal(
      state.asked[0].content,
      `${KEY}.Iterative.CollapseContentOne|{"first":"Forge","others":"Quench"}`
    );
    assert.deepEqual(state.patches, [
      {
        steps: [],
        ingredientSets: FORGE.ingredientSets,
        resultGroups: FORGE.resultGroups,
        toolIds: FORGE.toolIds,
        timeRequirement: FORGE.timeRequirement,
        iterative: { counters: COUNTERS, step: STEP_CONFIG },
      },
    ]);
  });

  it('collapses a draft with no `iterative` into `{ counters: [], step }`', async () => {
    const { state, handlers } = harness({ iterative: true, draft: { id: 'r1', steps: [FORGE] } });
    await handlers.handleRevertToSingleStep();
    assert.deepEqual(state.patches[0].iterative, { counters: [], step: STEP_CONFIG });
    assert.deepEqual(state.asked, [], 'a sole step loses nothing, so nothing is asked');
  });

  it('writes no step key for a step 1 with no config, and the saved recipe reads it back', async () => {
    const bare = { ...FORGE, iterative: null };
    const { state, handlers } = harness({
      iterative: true,
      draft: {
        id: 'r1',
        name: 'Blade',
        metadata: {},
        iterative: { counters: COUNTERS },
        steps: [bare],
      },
    });
    await handlers.handleRevertToSingleStep();
    assert.deepEqual(state.patches[0].iterative, { counters: COUNTERS });
    const saved = Recipe.fromJSON(state.draft).toJSON();
    assert.deepEqual(saved.iterative, state.draft.iterative);
    assert.equal(saved.steps?.length ?? 0, 0, 'and has no explicit step');

    const empty = harness({ iterative: true, draft: { id: 'r1', steps: [{ id: 'a' }] } });
    await empty.handlers.handleRevertToSingleStep();
    assert.equal(Object.hasOwn(empty.state.patches[0], 'iterative'), false, 'nothing to keep');
  });

  it('carries the `iterative` the draft holds on every step patch', async () => {
    const recipeIterative = { counters: COUNTERS };
    const { state, handlers } = harness({
      iterative: true,
      draft: { id: 'r1', iterative: recipeIterative, steps: [FORGE, QUENCH] },
    });
    handlers.handleAddStep();
    handlers.handleReorderSteps(0, 1);
    handlers.handleUpdateStep('sa', { name: 'Forge hard' });
    await handlers.handleDeleteStep('sb');
    assert.equal(state.patches.length, 4);
    for (const patch of state.patches) {
      assert.ok('iterative' in patch, 'the held value is never omitted');
      assert.deepEqual(patch.iterative, recipeIterative);
    }
  });

  it('adds the iterative loss to the delete copy, and refuses the sole step', async () => {
    const { state, handlers } = harness({
      iterative: true,
      draft: { id: 'r1', steps: [FORGE, QUENCH] },
    });
    assert.equal(await handlers.handleDeleteStep('sb', 'results'), true);
    assert.equal(
      state.asked[0].content,
      `${KEY}.DeleteStepContent|{"name":"Quench","alsoDeleted":"${KEY}.DeleteStepAlsoResults${KEY}.Iterative.DeleteStepAlso"}`
    );
    assert.equal(await handlers.handleDeleteStep('sa'), false, 'the sole step stays');
    assert.equal(state.asked.length, 1, 'and nothing is asked about it');
    assert.equal(state.patches.length, 1);
  });

  it('patches nothing on a cancelled or dismissed collapse, having asked with the shipped keys', async () => {
    for (const answer of [false, null]) {
      const { state, handlers } = harness({
        iterative: true,
        confirms: [answer],
        draft: { id: 'r1', steps: [FORGE, QUENCH] },
      });
      assert.equal(await handlers.handleRevertToSingleStep(), false);
      assert.deepEqual(state.patches, []);
      assert.deepEqual(Object.keys(state.asked[0]), ['title', 'content', 'confirmLabel']);
    }
  });

  it('outside iterative, a stale `iterative` changes no patch', async () => {
    const stale = { counters: COUNTERS, step: STEP_CONFIG };
    const { state, handlers } = harness({ draft: { id: 'r1', iterative: stale, toolIds: [] } });
    handlers.handleEnterMultiStep();
    const [seeded] = state.patches[0].steps;
    assert.deepEqual(Object.keys(seeded), [
      'id',
      'name',
      'description',
      'ingredientSets',
      'resultGroups',
      'toolIds',
    ]);
    handlers.handleAddStep();
    assert.equal(await handlers.handleDeleteStep(seeded.id), true);
    assert.equal(await handlers.handleDeleteStep(state.draft.steps[0].id), true);
    await handlers.handleRevertToSingleStep();
    assert.deepEqual(
      state.patches.map((patch) => Object.keys(patch)),
      [['steps'], ['steps'], ['steps'], ['steps'], ['steps']]
    );
    assert.deepEqual(state.patches.at(-1), { steps: [] });
  });
});

describe('newStepId', () => {
  // The fallback runs first: this process holds no `foundry` until the second case installs one.
  it('falls back to a step- id without Foundry', () => {
    assert.match(newStepId(), /^step-[a-z0-9]+$/);
  });

  it('uses Foundry randomID when present', () => {
    installFoundryUtilsEnv();
    assert.match(newStepId(), /^rid-\d+$/);
  });
});
