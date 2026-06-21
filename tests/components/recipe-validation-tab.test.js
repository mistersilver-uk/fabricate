import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-recipe-validation-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    // recipeReadiness dispatches through the match-type registry, which reads
    // item flags — copy both so the harness module graph resolves.
    'src/config/flags.js',
    'src/models/match/matchTypes.js',
    'src/ui/svelte/apps/manager/recipe/recipeReadiness.js'
  ],
  compiledModules: ['src/ui/svelte/apps/manager/recipe/RecipeValidationTab.svelte'],
  componentPath: 'src/ui/svelte/apps/manager/recipe/RecipeValidationTab.svelte'
});

function flushRender() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('RecipeValidationTab (mounted)', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => {
    harness.teardown();
  });

  it('renders a readiness checklist with satisfied and unsatisfied checks', async () => {
    const target = await harness.mount({
      recipe: { name: 'Brew', enabled: true, ingredientSets: [{ id: 's1' }], resultGroups: [] }
    });
    const nameCheck = target.querySelector('[data-check="hasName"]');
    const ingredientCheck = target.querySelector('[data-check="hasIngredientSet"]');
    const resultCheck = target.querySelector('[data-check="hasResultGroup"]');
    assert.equal(nameCheck.dataset.satisfied, 'true', 'name check satisfied');
    assert.equal(ingredientCheck.dataset.satisfied, 'true', 'ingredient check satisfied');
    assert.equal(resultCheck.dataset.satisfied, 'false', 'result check unsatisfied');
    harness.remount();
  });

  it('lists critical issues for a recipe missing requirements', async () => {
    const target = await harness.mount({
      recipe: { name: '', enabled: true, ingredientSets: [], resultGroups: [] }
    });
    assert.ok(target.querySelector('[data-issue="noName"]'), 'noName issue listed');
    assert.ok(target.querySelector('[data-issue="noIngredientSet"]'), 'noIngredientSet issue listed');
    assert.ok(target.querySelector('[data-issue="noResultGroup"]'), 'noResultGroup issue listed');
    const criticalList = target.querySelector('[data-issue-severity="critical"]');
    assert.ok(criticalList, 'a critical issue group renders');
    harness.remount();
  });

  it('shows the no-issues state for a complete recipe', async () => {
    const target = await harness.mount({
      recipe: { name: 'Brew', enabled: true, ingredientSets: [{ id: 's1' }], resultGroups: [{ id: 'g1' }] }
    });
    assert.equal(target.querySelector('[data-issue]'), null, 'no issues rendered');
    assert.match(target.textContent, /No issues detected/, 'no-issues message shown');
    harness.remount();
  });

  // The overlapping-requirement recipe: a component "Iron Ore" requirement AND a
  // "metal" tag requirement that Iron Ore satisfies — ambiguous overlap.
  const overlapRecipe = {
    name: 'Smelt',
    enabled: true,
    ingredientSets: [{
      id: 's1',
      ingredientGroups: [
        { id: 'g1', options: [{ quantity: 1, match: { type: 'component', componentId: 'cmp-iron-ore' } }] },
        { id: 'g2', options: [{ quantity: 1, match: { type: 'tags', tags: ['metal'], tagMatch: 'any' } }] }
      ]
    }],
    resultGroups: [{ id: 'r1' }]
  };

  // No harness rawModules/compiledModules change is needed: recipeReadiness and
  // the match-type registry it dispatches through are already copied above, so
  // overlap expansion resolves with the existing module graph.
  it('warns about overlapping requirements when componentTagOptions are supplied', async () => {
    const target = await harness.mount({
      recipe: overlapRecipe,
      componentTagOptions: [{ id: 'cmp-iron-ore', tags: ['metal'] }]
    });
    const warningList = target.querySelector('[data-issue-severity="warning"]');
    assert.ok(warningList, 'a warning issue group renders');
    assert.ok(warningList.querySelector('[data-issue="requirementOverlap"]'), 'overlap warning listed under the warning bucket');
    const overlapCheck = target.querySelector('[data-check="noRequirementOverlap"]');
    assert.equal(overlapCheck.dataset.satisfied, 'false', 'overlap check fails');
    harness.remount();
  });

  it('does not warn about overlap when componentTagOptions are absent', async () => {
    const target = await harness.mount({ recipe: overlapRecipe });
    assert.equal(target.querySelector('[data-issue="requirementOverlap"]'), null, 'no overlap issue without a catalogue');
    const overlapCheck = target.querySelector('[data-check="noRequirementOverlap"]');
    assert.equal(overlapCheck.dataset.satisfied, 'true', 'overlap check passes with no catalogue');
    harness.remount();
  });

  it("fires onSelectIssue with the issue's deep-link target when View is clicked", async () => {
    const targets = [];
    const target = await harness.mount({
      recipe: { name: 'Brew', enabled: true, ingredientSets: [], resultGroups: [{ id: 'g1' }] },
      onSelectIssue: (deepLink) => targets.push(deepLink)
    });
    const view = target.querySelector('[data-issue="noIngredientSet"] [data-recipe-issue-view]');
    assert.ok(view, 'a View button renders on the ingredient issue');
    view.click();
    await flushRender();
    assert.deepEqual(targets, ['ingredients'], 'View deep-links to the Ingredients tab');
    harness.remount();
  });
});
