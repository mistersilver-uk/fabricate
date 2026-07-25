/**
 * game.fabricate.resetActorKnowledge — the GM-only interim knowledge-reset access
 * path (issue 773), the macro/console lever until #785 ships the Knowledge tab.
 *
 * WHY A REPRODUCTION (and not the real `Fabricate` class): `src/main.js` imports the
 * global stylesheet and Svelte UI at module load, so it cannot be imported under
 * plain `node --test`. This suite drives a faithful reproduction of the facade method
 * against a spy `recipeVisibilityService` + a mock `game`, then a SOURCE-CONTRACT
 * guard pins the real `src/main.js` method so weakening the GM gate, the
 * actorId-not-uuid resolution, the per-system/all delegation, or the never-throw
 * `{ success, message }` shape fails this suite.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// --- Faithful reproduction of Fabricate#resetActorKnowledge ------------------
class ResetKnowledgeFacade {
  constructor(recipeVisibilityService) {
    this.recipeVisibilityService = recipeVisibilityService;
  }

  async resetActorKnowledge({ actorId = null, systemId = null, freeLearnBudget = true } = {}) {
    if (globalThis.game.user?.isGM !== true) {
      return { success: false, message: 'FABRICATE.Knowledge.Reset.GMOnly' };
    }
    const actor = globalThis.game.actors?.get?.(actorId);
    if (!actor) {
      return { success: false, message: 'FABRICATE.Knowledge.Reset.NoActor' };
    }
    const service = this.recipeVisibilityService;
    const result = systemId
      ? await service.forgetSystemLearnedRecipes(actor, systemId, { freeLearnBudget })
      : await service.forgetAllLearnedRecipes(actor, { freeLearnBudget });
    return {
      success: result.success === true,
      message: 'FABRICATE.Knowledge.Reset.Success',
      messageData: { actor: actor.name, count: result.count || 0, systemId },
    };
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

  const result = await facade.resetActorKnowledge({ actorId: 'actor-1' });

  assert.equal(service.calls[0].method, 'forgetAllLearnedRecipes');
  assert.equal(result.messageData.count, 5);
  assert.equal(result.messageData.systemId, null);
});

// ---------------------------------------------------------------------------
// SOURCE-CONTRACT guard — pin the real src/main.js method.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAIN_SOURCE = readFileSync(resolve(__dirname, '../src/main.js'), 'utf8');

test('SOURCE CONTRACT: resetActorKnowledge is GM-gated, actorId-resolved, and delegates by scope', () => {
  const body = MAIN_SOURCE.slice(MAIN_SOURCE.indexOf('async resetActorKnowledge({'));
  assert.ok(
    body.includes("if (game.user?.isGM !== true) {") &&
      body.includes("return { success: false, message: 'FABRICATE.Knowledge.Reset.GMOnly' };"),
    'the explicit GM gate is present up front'
  );
  assert.ok(
    body.includes('const actor = game.actors?.get?.(actorId);'),
    'the actor is resolved by actorId via game.actors.get (never a uuid)'
  );
  assert.ok(
    body.includes("return { success: false, message: 'FABRICATE.Knowledge.Reset.NoActor' };"),
    'a missing actor returns NoActor'
  );
  assert.ok(
    body.includes('service.forgetSystemLearnedRecipes(actor, systemId, { freeLearnBudget })') &&
      body.includes('service.forgetAllLearnedRecipes(actor, { freeLearnBudget })'),
    'delegates to the per-system or all-systems reset by scope'
  );
  assert.ok(
    body.slice(0, body.indexOf('\n  }')).includes("message: 'FABRICATE.Knowledge.Reset.Success'"),
    'a success returns the Success outcome with { success, message } (never throws)'
  );
});
