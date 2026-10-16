/**
 * A browse row's Tool verdict (issue 2306): the summary phase's per-pass probe, and how its
 * Tool-ready sets narrow the material term of the row's browse status.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { projectRecipeSummary } from '../src/ui/presenters/summaryProjection.js';
import { createToolReadySetsProbe } from '../src/ui/presenters/summaryToolPresence.js';

const ACTOR = { id: 'actor-1', items: [] };

/** A manager whose Tools are `toolIds` plus each set's own, and whose held Tools are `held`. */
function toolManager(held) {
  const calls = [];
  return {
    calls,
    getToolsForSet: (recipe, set) =>
      [...(recipe.toolIds ?? []), ...(set?.toolIds ?? [])].map((id) => ({ id })),
    resolveToolStates: (recipe, tools) => {
      calls.push(tools.map((tool) => tool.id));
      return tools.map((tool) => ({ available: held.has(tool.id) }));
    },
  };
}

const recipe = (toolIds, sets = [{ id: 'set' }]) => ({
  craftingSystemId: 'sys',
  toolIds,
  ingredientSets: sets,
});

const probeFor = (held) =>
  createToolReadySetsProbe({ recipeManager: toolManager(new Set(held)), craftSources: [ACTOR] });

describe('createToolReadySetsProbe', () => {
  it('answers null when every set has its Tools, and [] when none does', () => {
    const probe = probeFor(['hammer']);
    assert.equal(probe(recipe([])), null);
    assert.equal(probe(recipe(['hammer'])), null);
    assert.deepEqual(probe(recipe(['hammer', 'anvil'])), []);
  });

  it('names exactly the sets whose own Tools are all held', () => {
    const forge = { id: 'forge', toolIds: ['anvil'] };
    const bench = { id: 'bench', toolIds: ['tongs'] };
    assert.deepEqual(probeFor(['tongs'])(recipe([], [forge, bench])), [bench]);
  });

  it('judges a step with no sets by its recipe-wide Tools', () => {
    assert.equal(probeFor(['hammer'])(recipe(['hammer'], [])), null);
    assert.deepEqual(probeFor([])(recipe(['hammer'], [])), []);
  });

  it('resolves each (system, Tool) once per pass', () => {
    const manager = toolManager(new Set(['hammer']));
    const probe = createToolReadySetsProbe({ recipeManager: manager, craftSources: [ACTOR] });
    for (let index = 0; index < 5; index++) probe(recipe(['hammer', 'anvil']));
    probe({ ...recipe(['hammer']), craftingSystemId: 'other' });
    assert.deepEqual(manager.calls, [['hammer'], ['anvil'], ['hammer']]);
  });

  it('answers null when nothing can be asked', () => {
    const manager = toolManager(new Set());
    const noSources = createToolReadySetsProbe({ recipeManager: manager, craftSources: [] });
    const noSeams = createToolReadySetsProbe({ recipeManager: {}, craftSources: [ACTOR] });
    assert.equal(noSources(recipe(['x'])), null);
    assert.equal(noSeams(recipe(['x'])), null);
    assert.deepEqual(manager.calls, []);
  });
});

describe('projectRecipeSummary toolReadySets', () => {
  const ore = { match: { type: 'component', componentId: 'ore' }, quantity: 1 };
  const ingot = { match: { type: 'component', componentId: 'ingot' }, quantity: 1 };
  const forge = { id: 'forge', ingredientGroups: [{ options: [ore] }] };
  const cold = { id: 'cold', ingredientGroups: [{ options: [ingot] }] };
  const snapshot = {
    componentTallies: () => ({
      quantityByComponentId: new Map([['ore', 1]]),
      stacksByComponentId: new Map([['ore', 1]]),
      essenceTotals: new Map(),
      quantityByTag: new Map(),
    }),
  };
  const status = (input) =>
    projectRecipeSummary({ recipe: { id: 'r', ingredientSets: [forge, cold] }, snapshot, ...input })
      .browseStatus;

  it('reads no Tool-ready set as a shortfall even when the materials look makeable', () => {
    assert.equal(status({ toolReadySets: [] }), 'missingMaterials');
    assert.equal(status({ toolReadySets: [], snapshot: null }), 'missingMaterials');
  });

  it('judges materials over the Tool-ready sets alone', () => {
    assert.equal(status({ toolReadySets: [cold] }), 'missingMaterials');
    assert.equal(status({ toolReadySets: [forge] }), 'available');
  });

  it('leaves the material verdict alone when Tools rule nothing out', () => {
    assert.equal(status({ toolReadySets: null }), 'available');
  });

  it('keeps the cheap availability itself Tool-free', () => {
    const summary = projectRecipeSummary({
      recipe: { id: 'r', ingredientSets: [forge, cold] },
      snapshot,
      toolReadySets: [],
    });
    assert.equal(summary.availability.available, true);
  });

  it('never lets a Tool verdict reach a redacted teaser', () => {
    assert.equal(status({ toolReadySets: [], access: { reason: 'teaser' } }), 'discovery');
  });
});
