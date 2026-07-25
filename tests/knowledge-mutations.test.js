/**
 * The GM Knowledge mutation collaborator (issue 785).
 *
 * These four bodies used to sit inline in `SvelteCraftingSystemManagerApp`, where
 * every acceptance bullet they carry was reachable only through a live Foundry
 * Application and could therefore only be asserted as source text. Extracted, each
 * rule is asserted on a fake's CALL LOG, which is what the acceptance actually asks
 * for: delete calls `item.delete()` exactly once and `item.update` never; a delete
 * writes no `learnedRecipes` and no `recipeItemLearning`; erase passes the EXACT
 * options object.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  KNOWLEDGE_MESSAGES,
  deleteOwnedRecipeItemCopy,
  eraseLearnedRecipeEntry,
  expendOwnedRecipeItemUse,
  resetActorKnowledgeState,
} from '../src/ui/svelte/apps/manager/knowledge/knowledgeMutations.js';

// A call-logging owned copy. `update` and `setFlag` exist precisely so their absence
// after a delete is a real negative rather than an absent-method artefact.
function fakeItem({ id = 'i1', name = 'Tome of Testing', failDelete = false } = {}) {
  const calls = { delete: 0, update: [], setFlag: [] };
  return {
    id,
    name,
    calls,
    delete: async () => {
      calls.delete += 1;
      if (failDelete) throw new Error('Foundry refused the delete');
    },
    update: async (payload) => calls.update.push(payload),
    setFlag: async (scope, key, value) => calls.setFlag.push({ scope, key, value }),
  };
}

function fakeActor({ id = 'a1' } = {}) {
  const calls = { update: [], setFlag: [] };
  return {
    id,
    calls,
    update: async (payload) => calls.update.push(payload),
    setFlag: async (scope, key, value) => calls.setFlag.push({ scope, key, value }),
  };
}

function fakeService(overrides = {}) {
  const calls = { expend: [], forget: [] };
  return {
    calls,
    expendRecipeItemUse: async (actor, itemId, definition) => {
      calls.expend.push({ actor, itemId, definition });
      return { success: true, message: 'FABRICATE.Ok' };
    },
    forgetLearnedRecipes: async (actor, recipeIds, options) => {
      calls.forget.push({ actor, recipeIds, options });
      return { success: true, count: 1 };
    },
    ...overrides,
  };
}

describe('knowledge mutation collaborator', () => {
  it('routes an expend to the engine by DOCUMENT ID with the resolved definition', async () => {
    const service = fakeService();
    const item = fakeItem();
    const actor = fakeActor();
    const definition = { id: 'book' };

    const result = await expendOwnedRecipeItemUse({ actor, item, service, definition });

    assert.equal(result.success, true);
    assert.deepEqual(service.calls.expend, [{ actor, itemId: 'i1', definition }]);
    // The engine owns every use rule; the collaborator must not pre-empt any of them.
    assert.equal(item.calls.delete, 0);
    assert.deepEqual(item.calls.update, []);
    assert.deepEqual(item.calls.setFlag, []);
  });

  it('reports a missing definition and an absent engine without throwing', async () => {
    const noDefinition = await expendOwnedRecipeItemUse({
      actor: fakeActor(),
      item: fakeItem(),
      service: fakeService(),
      definition: null,
    });
    assert.deepEqual(noDefinition, { success: false, message: KNOWLEDGE_MESSAGES.noDefinition });

    const noEngine = await expendOwnedRecipeItemUse({
      actor: fakeActor(),
      item: fakeItem(),
      service: {},
      definition: { id: 'book' },
    });
    assert.deepEqual(noEngine, { success: false, message: KNOWLEDGE_MESSAGES.unavailable });
  });

  it('maps an engine throw to a result shape rather than letting it past the store', async () => {
    const result = await expendOwnedRecipeItemUse({
      actor: fakeActor(),
      item: fakeItem(),
      service: fakeService({
        expendRecipeItemUse: async () => {
          throw new Error('boom');
        },
      }),
      definition: { id: 'book' },
    });
    assert.deepEqual(result, { success: false, message: KNOWLEDGE_MESSAGES.expendFailed });
  });

  it('deletes the WHOLE document exactly once and never decrements a stack', async () => {
    const item = fakeItem({ name: 'Alchemist Cook Book' });

    const result = await deleteOwnedRecipeItemCopy({ item });

    assert.equal(item.calls.delete, 1, 'exactly one delete');
    // The negative is what pins "no stack decrement": `recipeItemUsage.timesUsed` and
    // `recipeItemLearning.learnedCount` are per-DOCUMENT counters shared by every unit.
    assert.deepEqual(item.calls.update, [], 'item.update is never called');
    assert.deepEqual(item.calls.setFlag, [], 'no per-document counter is rewritten');
    assert.deepEqual(result, {
      success: true,
      message: KNOWLEDGE_MESSAGES.deleted,
      messageData: { name: 'Alchemist Cook Book' },
    });
  });

  it('reports a refused delete rather than claiming success', async () => {
    const item = fakeItem({ failDelete: true });
    const result = await deleteOwnedRecipeItemCopy({ item });
    assert.deepEqual(result, { success: false, message: KNOWLEDGE_MESSAGES.deleteFailed });
  });

  it('takes no actor collaborator at all, so a delete cannot free budget or touch learnedRecipes', () => {
    // Structural, and deliberately so: the acceptance is "zero actor.update calls
    // touching learnedRecipes and zero recipeItemLearning writes after a delete", and
    // a function with no actor in scope can never make either.
    assert.equal(
      /actor/.test(deleteOwnedRecipeItemCopy.toString()),
      false,
      'the delete path names no actor'
    );
    assert.equal(
      /learnedRecipes|recipeItemLearning|freeLearnBudget/.test(
        deleteOwnedRecipeItemCopy.toString()
      ),
      false,
      'the delete path names no learn-budget or learned-recipe state'
    );
  });

  it('erases through the merged primitive with the EXACT pinned options object', async () => {
    const service = fakeService();
    const actor = fakeActor();

    const result = await eraseLearnedRecipeEntry({ actor, service, recipeId: 'r1' });

    assert.equal(service.calls.forget.length, 1);
    const [call] = service.calls.forget;
    assert.equal(call.actor, actor);
    assert.deepEqual(call.recipeIds, ['r1']);
    // `freeLearnBudget` must be passed EXPLICITLY even though it defaults true, or an
    // implementation passing `false` satisfies the spec letter and breaks this.
    assert.deepEqual(call.options, { freeLearnBudget: true, clearDiscovery: false });
    assert.deepEqual(Object.keys(call.options), ['freeLearnBudget', 'clearDiscovery']);
    assert.deepEqual(result, {
      success: true,
      message: KNOWLEDGE_MESSAGES.erased,
      messageData: { count: 1 },
    });
  });

  it('renders the FAILURE sentence when an erase fails, never the success one', async () => {
    const service = fakeService({
      forgetLearnedRecipes: async () => ({ success: false, count: 0 }),
    });

    const result = await eraseLearnedRecipeEntry({
      actor: fakeActor(),
      service,
      recipeId: 'r1',
    });

    assert.equal(result.success, false);
    assert.equal(
      result.message,
      KNOWLEDGE_MESSAGES.eraseFailed,
      'a failed erase must not render "Erased 0 learned recipe(s)." as a red toast'
    );
  });

  it('reports an absent or throwing erase primitive as a result', async () => {
    assert.deepEqual(await eraseLearnedRecipeEntry({ actor: fakeActor(), service: {} }), {
      success: false,
      message: KNOWLEDGE_MESSAGES.unavailable,
    });

    const thrown = await eraseLearnedRecipeEntry({
      actor: fakeActor(),
      service: fakeService({
        forgetLearnedRecipes: async () => {
          throw new Error('boom');
        },
      }),
      recipeId: 'r1',
    });
    assert.deepEqual(thrown, { success: false, message: KNOWLEDGE_MESSAGES.eraseFailed });
  });

  it('routes BOTH reset grains through the merged GM API, distinguished only by systemId', async () => {
    const calls = [];
    const reset = async (options) => {
      calls.push(options);
      return { success: true, message: 'FABRICATE.Ok' };
    };

    await resetActorKnowledgeState({ reset, actorId: 'a1', systemId: 'sys1' });
    await resetActorKnowledgeState({ reset, actorId: 'a1' });

    assert.deepEqual(calls, [
      { actorId: 'a1', systemId: 'sys1' },
      // The all-systems grain is the ONLY one that can clear orphan learned keys.
      { actorId: 'a1', systemId: null },
    ]);

    assert.deepEqual(await resetActorKnowledgeState({ reset: null, actorId: 'a1' }), {
      success: false,
      message: KNOWLEDGE_MESSAGES.unavailable,
    });
  });

  it('preserves the API receiver so the reset keeps its own `this`', async () => {
    const host = {
      seen: null,
      async resetActorKnowledge(options) {
        this.seen = options;
        return { success: true, message: 'FABRICATE.Ok' };
      },
    };

    await resetActorKnowledgeState({
      reset: host.resetActorKnowledge,
      thisArg: host,
      actorId: 'a1',
      systemId: null,
    });

    assert.deepEqual(host.seen, { actorId: 'a1', systemId: null });
  });
});
