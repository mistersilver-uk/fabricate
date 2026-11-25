import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createRecipeStepHandlers,
  newStepId,
} from '../src/ui/svelte/apps/manager/recipe/recipeStepHandlers.js';

import { installFoundryUtilsEnv } from './helpers/foundryEnv.js';

/** A draft holder the handlers read through a thunk and write through `patch`, with a scripted confirm. */
function harness({ draft = { id: 'r1', name: 'Tonic' }, confirms = [] } = {}) {
  const state = { draft, asked: [], patches: [] };
  const handlers = createRecipeStepHandlers({
    draft: () => state.draft,
    patch: (partial) => {
      state.patches.push(partial);
      state.draft = { ...state.draft, ...partial };
    },
    confirm: async (options) => {
      state.asked.push(options);
      return confirms.length > 0 ? confirms.shift() : true;
    },
    text: (key, fallback) => fallback,
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
