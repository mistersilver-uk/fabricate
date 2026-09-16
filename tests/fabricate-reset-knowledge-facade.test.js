/**
 * game.fabricate.resetActorKnowledge — the GM-only knowledge-reset access path
 * (issue 773), the macro/console lever beside the Knowledge tab's own reset control.
 *
 * WHY A REPRODUCTION (and not the real `Fabricate` class): `src/main.js` imports the
 * global stylesheet and Svelte UI at module load, so it cannot be imported under
 * plain `node --test`. This suite drives a faithful reproduction of the facade method
 * against a spy `recipeVisibilityService` + a mock `game`, then a SOURCE-CONTRACT
 * guard pins the real `src/main.js` method so weakening the GM gate, the
 * actorId-not-uuid resolution, the per-system/all delegation, or the never-throw
 * `{ success, message }` shape fails this suite.
 *
 * ## What issue 1289 changed here, and what it deliberately did not
 *
 * The GM gate and the actor resolution moved OUT of this method into the shared
 * `_requireGmActor` preamble, so that one authorization rule exists once rather than a
 * third time. The four behavioural cases below are UNCHANGED by that refactor — which is
 * the whole proof that it was behaviour-preserving, and why they are worth reading before
 * the source-contract guard.
 *
 * The reproduction therefore extends the shared facade harness rather than carrying its own
 * copy of the preamble: a second copy in this file would be the very duplication the
 * refactor removed, and it could drift from production while these four cases stayed green.
 * The guard at the foot of the file is what pins the delegation itself.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FabricateFacadeUnderTest,
  mainMethodSource,
} from './helpers/fabricateFacadeHarness.js';

// --- Faithful reproduction of Fabricate#resetActorKnowledge ------------------
class ResetKnowledgeFacade extends FabricateFacadeUnderTest {
  constructor(recipeVisibilityService) {
    super({ recipeVisibilityService });
  }

  async resetActorKnowledge({ actorId = null, systemId = null, freeLearnBudget = true } = {}) {
    const gate = this._requireGmActor(actorId, {
      gmOnlyKey: 'FABRICATE.Knowledge.Reset.GMOnly',
      noActorKey: 'FABRICATE.Knowledge.Reset.NoActor',
    });
    if (gate.outcome) return { success: false, message: gate.message };
    const actor = gate.actor;
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

const RESET =
  'async resetActorKnowledge({ actorId = null, systemId = null, freeLearnBudget = true } = {}) {';
const PREAMBLE = '_requireGmActor(actorId, { gmOnlyKey, noActorKey }) {';

test('SOURCE CONTRACT: resetActorKnowledge delegates its gate and delegates by scope', () => {
  // BOUNDED to this method alone. The previous form sliced `MAIN_SOURCE` from the method's
  // first character to the END OF THE FILE, which is harmless for a "must contain" claim and
  // silently vacuous for a "must NOT contain" one — every helper the rest of the class
  // legitimately uses is inside an unbounded slice. The absence assertions below are the
  // reason this suite could not keep that form once the gate moved out of the method.
  const body = mainMethodSource(RESET);

  assert.ok(
    body.includes('const gate = this._requireGmActor(actorId, {') &&
      body.includes("gmOnlyKey: 'FABRICATE.Knowledge.Reset.GMOnly'") &&
      body.includes("noActorKey: 'FABRICATE.Knowledge.Reset.NoActor'"),
    'the gate is delegated to the shared preamble, with THIS member\'s own refusal strings'
  );
  assert.ok(
    body.includes('if (gate.outcome) return { success: false, message: gate.message };'),
    'a refused gate returns the { success, message } facade convention, never a throw'
  );
  for (const inlined of ['game.user?.isGM', 'game.actors?.get?.(']) {
    assert.equal(
      body.includes(inlined),
      false,
      `\`${inlined}\` is still inlined here; the point of the preamble is that this rule ` +
        'exists once, and a re-inlined copy is how the keys drift apart again'
    );
  }
  assert.ok(
    body.includes('service.forgetSystemLearnedRecipes(actor, systemId, { freeLearnBudget })') &&
      body.includes('service.forgetAllLearnedRecipes(actor, { freeLearnBudget })'),
    'delegates to the per-system or all-systems reset by scope'
  );
  assert.ok(
    body.includes("message: 'FABRICATE.Knowledge.Reset.Success'"),
    'a success returns the Success outcome with { success, message } (never throws)'
  );
});

test('SOURCE CONTRACT: both gates resolve INSIDE _requireGmActor, in that order', () => {
  // The refactor is only behaviour-preserving if the gates it removed from the method above
  // still exist somewhere, in the same order, and neither the four behavioural cases nor the
  // absence assertions above can see that: the cases would pass against a preamble that
  // dropped a gate for a GM fixture, and an absence assertion is satisfied BY a deletion.
  const preamble = mainMethodSource(PREAMBLE);

  const gmAt = preamble.indexOf('if (game.user?.isGM !== true) {');
  const actorAt = preamble.indexOf('const actor = this._resolveCraftingActor(actorId);');
  assert.ok(gmAt >= 0, 'the GM gate is the preamble\'s first test');
  assert.ok(actorAt >= 0, 'the actor is resolved through the ownership-gated resolver');
  assert.ok(gmAt < actorAt, 'GM before actor: a non-GM must never reach an actor resolution');
  assert.ok(
    preamble.includes('outcome: COMPANION_OUTCOMES.gmOnly, message: gmOnlyKey') &&
      preamble.includes('outcome: COMPANION_OUTCOMES.noActor, message: noActorKey'),
    'each refusal answers with the CALLER\'s key, which is why the keys are parameters'
  );
  assert.equal(
    preamble.includes('this.ready') || preamble.includes('_requireReady'),
    false,
    'readiness is tested per member AFTER this preamble: `_requireReady()` throws, and a ' +
      'ready-first preamble would make a pre-`ready` non-GM call throw where it returns gmOnly'
  );
});
