/**
 * Component-source ownership for a non-GM player, driven through the real facade (issue 1032): a
 * stored source the player cannot select never reaches `craft()`, and an advance over a run whose
 * source they do not own is refused with the owner message instead of a Foundry permission throw.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createFabricateFacadeHarness, makeFacadeActor } from './helpers/fabricateFacadeHarness.js';

const PLAYER = { id: 'u1', isGM: false };
const GM = { id: 'gm-1', isGM: true };
const NEEDS_OWNER = 'FABRICATE.App.Journal.Actions.NeedsOwner';

/** The facade over a player-owned crafting actor and a source owned by nobody, `craft` recording. */
function ownershipHarness({ user, componentSourceActorIds = [], run = null }) {
  const mine = makeFacadeActor('a-mine', { ownerUserIds: ['u1'] });
  const gmOnly = makeFacadeActor('a-gm', { ownerUserIds: [] });
  const harness = createFabricateFacadeHarness({
    user,
    actors: [mine, gmOnly],
    selectedCraftingActorId: 'a-mine',
    componentSourceActorIds,
  });
  const craftCalls = [];
  harness.facade.craft = async (actor, recipeId, options) => {
    craftCalls.push({ actor, recipeId, options });
    return { success: true };
  };
  harness.facade.craftingRunManager = { getActiveRun: () => run };
  return { ...harness, craftCalls, mine, gmOnly };
}

const sourceIds = (call) => call.options.componentSourceActors.map((actor) => actor.id);

describe('craftRecipe: stored component sources the player cannot select are dropped', () => {
  it('passes only the sources the player may select, keeping the owned one', async () => {
    const { facade, craftCalls } = ownershipHarness({
      user: PLAYER,
      componentSourceActorIds: ['a-gm', 'a-mine'],
    });

    await facade.craftRecipe({ recipeId: 'recipe-1' });

    assert.equal(craftCalls.length, 1, 'the craft was submitted');
    assert.deepEqual(sourceIds(craftCalls[0]), ['a-mine']);
  });

  it('falls back to the crafting actor when no stored source survives', async () => {
    const { facade, craftCalls, mine } = ownershipHarness({
      user: PLAYER,
      componentSourceActorIds: ['a-gm'],
    });

    await facade.craftRecipe({ recipeId: 'recipe-1' });

    assert.equal(craftCalls.length, 1);
    assert.deepEqual(sourceIds(craftCalls[0]), ['a-mine']);
    assert.ok(
      craftCalls[0].options.componentSourceActors[0] === mine,
      'the fallback is the crafting actor'
    );
  });

  it('keeps both stored sources for a GM (control: the filter is permission-driven)', async () => {
    const { facade, craftCalls } = ownershipHarness({
      user: GM,
      componentSourceActorIds: ['a-gm', 'a-mine'],
    });

    await facade.craftRecipe({ actorId: 'a-mine', recipeId: 'recipe-1' });

    assert.deepEqual(sourceIds(craftCalls[0]), ['a-gm', 'a-mine']);
  });
});

describe('advanceCraftingRun: a run over a source the player does not own is refused', () => {
  it('answers the owner message and never reaches the engine', async () => {
    const run = { recipeId: 'recipe-1', componentSourceActorUuids: ['Actor.a-gm'] };
    const { facade, craftCalls } = ownershipHarness({ user: PLAYER, run });

    const result = await facade.advanceCraftingRun({ actorId: 'a-mine', runId: 'run-1' });

    assert.deepEqual(result, { success: false, message: NEEDS_OWNER });
    assert.equal(craftCalls.length, 0, 'no craft was attempted');
  });

  it('advances over a source the player owns (control)', async () => {
    const run = { recipeId: 'recipe-1', componentSourceActorUuids: ['Actor.a-mine'] };
    const { facade, craftCalls } = ownershipHarness({ user: PLAYER, run });

    const result = await facade.advanceCraftingRun({ actorId: 'a-mine', runId: 'run-1' });

    assert.equal(result.success, true);
    assert.equal(craftCalls.length, 1);
    assert.deepEqual(sourceIds(craftCalls[0]), ['a-mine']);
  });
});
