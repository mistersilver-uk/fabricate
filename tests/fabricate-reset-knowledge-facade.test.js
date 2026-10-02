/**
 * game.fabricate.resetActorKnowledge — the GM-only knowledge-reset access path (issue 773), the
 * macro/console lever beside the Knowledge tab's own reset control.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { FabricateFacadeUnderTest } from './helpers/fabricateFacadeHarness.js';

/** The REAL facade, pre-`ready`: the reset has no readiness gate, so it answers before `ready`. */
class ResetKnowledgeFacade extends FabricateFacadeUnderTest {
  constructor(recipeVisibilityService) {
    super({ recipeVisibilityService });
  }
}

function makeSpyService() {
  const calls = [];
  return {
    calls,
    async forgetSystemLearnedRecipes(actor, systemId, options) {
      calls.push({ method: 'forgetSystemLearnedRecipes', actor, systemId, options });
      return { success: true, count: 2 };
    },
    async forgetAllLearnedRecipes(actor, options) {
      calls.push({ method: 'forgetAllLearnedRecipes', actor, options });
      return { success: true, count: 5 };
    },
  };
}

function installGame({ isGM, actorsById = {} } = {}) {
  globalThis.game = {
    user: { isGM },
    actors: { get: (id) => actorsById[id] ?? null },
  };
}

test('773 facade: a non-GM caller is rejected with GMOnly and never reaches the service', async () => {
  installGame({ isGM: false, actorsById: { 'actor-1': { name: 'Ari' } } });
  const service = makeSpyService();
  const facade = new ResetKnowledgeFacade(service);

  const result = await facade.resetActorKnowledge({ actorId: 'actor-1' });

  assert.deepEqual(result, { success: false, message: 'FABRICATE.Knowledge.Reset.GMOnly' });
  assert.equal(service.calls.length, 0, 'no mutation is attempted for a non-GM');
});

test('773 facade: a missing actor returns NoActor (actorId, never a uuid)', async () => {
  installGame({ isGM: true, actorsById: {} });
  const service = makeSpyService();
  const facade = new ResetKnowledgeFacade(service);

  const result = await facade.resetActorKnowledge({ actorId: 'nope' });

  assert.deepEqual(result, { success: false, message: 'FABRICATE.Knowledge.Reset.NoActor' });
  assert.equal(service.calls.length, 0);
});

test('773 facade: a systemId delegates to the per-system reset and reports the count', async () => {
  const actor = { name: 'Ari' };
  installGame({ isGM: true, actorsById: { 'actor-1': actor } });
  const service = makeSpyService();
  const facade = new ResetKnowledgeFacade(service);

  const result = await facade.resetActorKnowledge({ actorId: 'actor-1', systemId: 'system-1' });

  assert.equal(service.calls[0].method, 'forgetSystemLearnedRecipes');
  assert.equal(service.calls[0].actor, actor);
  assert.equal(service.calls[0].systemId, 'system-1');
  assert.deepEqual(service.calls[0].options, { freeLearnBudget: true });
  assert.deepEqual(result, {
    success: true,
    message: 'FABRICATE.Knowledge.Reset.Success',
    messageData: { actor: 'Ari', count: 2, systemId: 'system-1' },
  });
});

test('773 facade: no systemId delegates to the all-systems reset', async () => {
  const actor = { name: 'Ari' };
  installGame({ isGM: true, actorsById: { 'actor-1': actor } });
  const service = makeSpyService();
  const facade = new ResetKnowledgeFacade(service);

  const result = await facade.resetActorKnowledge({ actorId: 'actor-1', freeLearnBudget: false });

  assert.equal(service.calls[0].method, 'forgetAllLearnedRecipes');
  assert.deepEqual(service.calls[0].options, { freeLearnBudget: false });
  assert.equal(result.messageData.count, 5);
  assert.equal(result.messageData.systemId, null);
});
