import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateRecipeReadiness, blocksEnable } from '../src/ui/svelte/apps/manager/recipe/recipeReadiness.js';

function check(checks, id) {
  return checks.find(entry => entry.id === id);
}

describe('evaluateRecipeReadiness', () => {
  it('flags an empty single-step recipe with critical, enable-blocking issues', () => {
    const { checks, issues } = evaluateRecipeReadiness({ name: '', enabled: true, ingredientSets: [], resultGroups: [] });
    assert.equal(check(checks, 'hasName').satisfied, false);
    assert.equal(check(checks, 'hasIngredientSet').satisfied, false);
    assert.equal(check(checks, 'hasResultGroup').satisfied, false);
    // Single-step recipes have no stepsNamed check.
    assert.equal(check(checks, 'stepsNamed'), undefined);

    assert.ok(issues.some(i => i.id === 'noName' && i.severity === 'critical' && i.blocks === 'enable' && i.target === 'overview'));
    assert.ok(issues.some(i => i.id === 'noIngredientSet' && i.severity === 'critical' && i.target === 'ingredients'));
    assert.ok(issues.some(i => i.id === 'noResultGroup' && i.severity === 'critical' && i.target === 'results'));
    assert.equal(blocksEnable(issues), true);
  });

  it('reports a complete single-step recipe as ready with no issues', () => {
    const { checks, issues } = evaluateRecipeReadiness({
      name: 'Healing Draught',
      enabled: true,
      ingredientSets: [{ id: 's1' }],
      resultGroups: [{ id: 'g1' }]
    });
    assert.equal(check(checks, 'hasName').satisfied, true);
    assert.equal(check(checks, 'hasIngredientSet').satisfied, true);
    assert.equal(check(checks, 'hasResultGroup').satisfied, true);
    assert.equal(issues.length, 0, 'no issues for a complete recipe');
    assert.equal(blocksEnable(issues), false);
  });

  it('downgrades a disabled incomplete recipe to a non-blocking warning', () => {
    const { issues } = evaluateRecipeReadiness({ name: 'Draft', enabled: false, ingredientSets: [], resultGroups: [] });
    const warning = issues.find(i => i.id === 'disabledIncomplete');
    assert.ok(warning, 'disabledIncomplete warning surfaced for a disabled, incomplete recipe');
    assert.equal(warning.severity, 'warning');
    // The critical requirement gaps still exist and still block enabling.
    assert.ok(issues.some(i => i.id === 'noIngredientSet' && i.blocks === 'enable'));
    assert.equal(blocksEnable(issues), true);
  });

  it('does not warn when a complete recipe is merely disabled', () => {
    const { issues } = evaluateRecipeReadiness({
      name: 'Complete',
      enabled: false,
      ingredientSets: [{ id: 's1' }],
      resultGroups: [{ id: 'g1' }]
    });
    assert.equal(issues.some(i => i.id === 'disabledIncomplete'), false, 'a complete disabled recipe is not flagged incomplete');
    assert.equal(issues.length, 0);
  });

  it('adds the stepsNamed check and per-step gaps for a multi-step recipe', () => {
    const { checks, issues } = evaluateRecipeReadiness({
      name: 'Forged Blade',
      enabled: true,
      steps: [
        { id: 'sa', name: 'Forge', ingredientSets: [{ id: 'i1' }], resultGroups: [{ id: 'r1' }] },
        { id: 'sb', name: '', ingredientSets: [], resultGroups: [{ id: 'r2' }] }
      ]
    });
    assert.equal(check(checks, 'stepsNamed').satisfied, false, 'an unnamed step fails stepsNamed');
    // Step B has no ingredient set; the issue carries the step id (name blank).
    const ingredientIssue = issues.find(i => i.id === 'noIngredientSet');
    assert.ok(ingredientIssue, 'per-step missing ingredient set surfaced');
    assert.equal(ingredientIssue.stepId, 'sb', 'carries the offending step id');
    assert.equal('stepName' in ingredientIssue, true, 'carries a stepName field');
    // Both steps have result groups, so no noResultGroup issue fires.
    assert.equal(issues.some(i => i.id === 'noResultGroup'), false);
    assert.equal(blocksEnable(issues), true);
  });

  it('resolves an implicit single step from recipe-level sets when steps is empty', () => {
    const { checks } = evaluateRecipeReadiness({
      name: 'Implicit',
      enabled: true,
      steps: [],
      ingredientSets: [{ id: 's1' }],
      resultGroups: [{ id: 'g1' }]
    });
    // No explicit steps → treated single-step (no stepsNamed check).
    assert.equal(check(checks, 'stepsNamed'), undefined);
    assert.equal(check(checks, 'hasIngredientSet').satisfied, true);
    assert.equal(check(checks, 'hasResultGroup').satisfied, true);
  });

  it('flags a duplicate component within an OR group as a critical duplicateAlternative', () => {
    const { checks, issues } = evaluateRecipeReadiness({
      name: 'Dupe',
      enabled: true,
      ingredientSets: [{
        id: 's1',
        ingredientGroups: [{
          id: 'g1',
          options: [
            { quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } },
            { quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }
          ]
        }]
      }],
      resultGroups: [{ id: 'r1' }]
    });
    const dupes = issues.filter(i => i.id === 'duplicateAlternative');
    assert.equal(dupes.length, 1, 'one duplicateAlternative per offending group');
    assert.equal(dupes[0].severity, 'critical');
    assert.equal(dupes[0].blocks, 'enable');
    assert.equal(dupes[0].target, 'ingredients');
    assert.equal(check(checks, 'noDuplicateMatches').satisfied, false);
    assert.equal(blocksEnable(issues), true);
  });

  it('flags an identical tag match within an OR group regardless of tag order', () => {
    const { issues } = evaluateRecipeReadiness({
      name: 'Tag dupe',
      enabled: true,
      ingredientSets: [{
        id: 's1',
        ingredientGroups: [{
          id: 'g1',
          options: [
            { quantity: 1, match: { type: 'tags', tags: ['a', 'b'], tagMatch: 'all' } },
            { quantity: 1, match: { type: 'tags', tags: ['b', 'a'], tagMatch: 'all' } }
          ]
        }]
      }],
      resultGroups: [{ id: 'r1' }]
    });
    assert.equal(issues.filter(i => i.id === 'duplicateAlternative').length, 1, 'sorted-tag signature collapses tag order');
  });

  it('does not flag tag matches that differ only by tagMatch', () => {
    const { issues } = evaluateRecipeReadiness({
      name: 'Distinct tagMatch',
      enabled: true,
      ingredientSets: [{
        id: 's1',
        ingredientGroups: [{
          id: 'g1',
          options: [
            { quantity: 1, match: { type: 'tags', tags: ['a'], tagMatch: 'any' } },
            { quantity: 1, match: { type: 'tags', tags: ['a'], tagMatch: 'all' } }
          ]
        }]
      }],
      resultGroups: [{ id: 'r1' }]
    });
    assert.equal(issues.some(i => i.id === 'duplicateAlternative'), false, 'any vs all are distinct matches');
  });

  it('flags two identical currency alternatives within an OR group as duplicateAlternative', () => {
    const { issues } = evaluateRecipeReadiness({
      name: 'Currency dupe',
      enabled: true,
      ingredientSets: [{
        id: 's1',
        ingredientGroups: [{
          id: 'g1',
          options: [
            { quantity: 1, match: { type: 'currency', unit: 'gp', amount: 100 } },
            { quantity: 1, match: { type: 'currency', unit: 'gp', amount: 100 } }
          ]
        }]
      }],
      resultGroups: [{ id: 'r1' }]
    });
    assert.equal(issues.filter(i => i.id === 'duplicateAlternative').length, 1, 'identical currency matches collide');
  });

  it('does not flag currency alternatives with distinct units or amounts', () => {
    const { issues } = evaluateRecipeReadiness({
      name: 'Currency distinct',
      enabled: true,
      ingredientSets: [{
        id: 's1',
        ingredientGroups: [{
          id: 'g1',
          options: [
            { quantity: 1, match: { type: 'currency', unit: 'gp', amount: 100 } },
            { quantity: 1, match: { type: 'currency', unit: 'sp', amount: 100 } },
            { quantity: 1, match: { type: 'currency', unit: 'gp', amount: 50 } }
          ]
        }]
      }],
      resultGroups: [{ id: 'r1' }]
    });
    assert.equal(issues.some(i => i.id === 'duplicateAlternative'), false, 'distinct unit/amount are distinct matches');
  });

  it('flags two identical currency requirements in a set as duplicateRequirement', () => {
    const { issues } = evaluateRecipeReadiness({
      name: 'Currency req dupe',
      enabled: true,
      ingredientSets: [{
        id: 's1',
        ingredientGroups: [
          { id: 'g1', options: [{ quantity: 1, match: { type: 'currency', unit: 'gp', amount: 100 } }] },
          { id: 'g2', options: [{ quantity: 1, match: { type: 'currency', unit: 'gp', amount: 100 } }] }
        ]
      }],
      resultGroups: [{ id: 'r1' }]
    });
    assert.equal(issues.filter(i => i.id === 'duplicateRequirement').length, 1, 'identical currency requirements collide');
  });

  it('flags two identical single-component requirements in a set as duplicateRequirement', () => {
    const { checks, issues } = evaluateRecipeReadiness({
      name: 'Req dupe',
      enabled: true,
      ingredientSets: [{
        id: 's1',
        ingredientGroups: [
          { id: 'g1', options: [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }] },
          { id: 'g2', options: [{ quantity: 3, match: { type: 'component', componentId: 'cmp-herb' } }] }
        ]
      }],
      resultGroups: [{ id: 'r1' }]
    });
    const dupes = issues.filter(i => i.id === 'duplicateRequirement');
    assert.equal(dupes.length, 1, 'one duplicateRequirement for the set');
    assert.equal(dupes[0].severity, 'critical');
    assert.equal(dupes[0].blocks, 'enable');
    assert.equal(dupes[0].target, 'ingredients');
    assert.equal(check(checks, 'noDuplicateMatches').satisfied, false);
  });

  it('reports noDuplicateMatches satisfied and no duplicate issues for all-distinct matches', () => {
    const { checks, issues } = evaluateRecipeReadiness({
      name: 'Distinct',
      enabled: true,
      ingredientSets: [{
        id: 's1',
        ingredientGroups: [
          { id: 'g1', options: [
            { quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } },
            { quantity: 1, match: { type: 'component', componentId: 'cmp-water' } }
          ] },
          { id: 'g2', options: [{ quantity: 1, match: { type: 'tags', tags: ['liquid'], tagMatch: 'any' } }] }
        ]
      }],
      resultGroups: [{ id: 'r1' }]
    });
    assert.equal(issues.some(i => i.id === 'duplicateAlternative'), false);
    assert.equal(issues.some(i => i.id === 'duplicateRequirement'), false);
    assert.equal(check(checks, 'noDuplicateMatches').satisfied, true);
  });

  it('does not flag duplicates among options that have no usable match yet', () => {
    const { checks, issues } = evaluateRecipeReadiness({
      name: 'Empty matches',
      enabled: true,
      ingredientSets: [{
        id: 's1',
        ingredientGroups: [
          { id: 'g1', options: [
            { quantity: 1, match: { type: 'component', componentId: '' } },
            { quantity: 1, match: { type: 'component', componentId: '' } }
          ] },
          { id: 'g2', options: [{ quantity: 1, match: { type: 'tags', tags: [], tagMatch: 'any' } }] }
        ]
      }],
      resultGroups: [{ id: 'r1' }]
    });
    assert.equal(issues.some(i => i.id === 'duplicateAlternative'), false, 'empty matches are not signatures');
    assert.equal(issues.some(i => i.id === 'duplicateRequirement'), false);
    assert.equal(check(checks, 'noDuplicateMatches').satisfied, true);
  });

  it('carries stepId/stepName on a duplicate issue for a multi-step recipe', () => {
    const { issues } = evaluateRecipeReadiness({
      name: 'Multi dupe',
      enabled: true,
      steps: [
        { id: 'sa', name: 'Forge', ingredientSets: [{
          id: 's1',
          ingredientGroups: [{
            id: 'g1',
            options: [
              { quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } },
              { quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }
            ]
          }]
        }], resultGroups: [{ id: 'r1' }] }
      ]
    });
    const dupe = issues.find(i => i.id === 'duplicateAlternative');
    assert.ok(dupe, 'duplicate surfaced for the multi-step recipe');
    assert.equal(dupe.stepId, 'sa', 'carries the offending step id');
    assert.equal(dupe.stepName, 'Forge', 'carries the step name');
  });

  it('marks every multi-step requirement check satisfied for a complete multi-step recipe', () => {
    const { checks, issues } = evaluateRecipeReadiness({
      name: 'Forged Blade',
      enabled: true,
      steps: [
        { id: 'sa', name: 'Forge', ingredientSets: [{ id: 'i1' }], resultGroups: [{ id: 'r1' }] },
        { id: 'sb', name: 'Quench', ingredientSets: [{ id: 'i2' }], resultGroups: [{ id: 'r2' }] }
      ]
    });
    assert.equal(check(checks, 'hasIngredientSet').satisfied, true);
    assert.equal(check(checks, 'hasResultGroup').satisfied, true);
    assert.equal(check(checks, 'stepsNamed').satisfied, true);
    assert.equal(issues.length, 0);
  });
});

describe('evaluateRecipeReadiness overlapping requirements', () => {
  // Iron Ore is tagged "metal"; the system catalogue lets the tag requirement
  // expand to component ids.
  const systemComponents = [
    { id: 'cmp-iron-ore', tags: ['metal', 'ore'] },
    { id: 'cmp-copper-ore', tags: ['metal', 'ore'] },
    { id: 'cmp-herb', tags: ['plant'] }
  ];

  function overlapRecipe(groups) {
    return {
      name: 'Overlap',
      enabled: true,
      ingredientSets: [{ id: 's1', ingredientGroups: groups }],
      resultGroups: [{ id: 'r1' }]
    };
  }

  it('flags a tag requirement overlapping a component it tags as one warning', () => {
    const { checks, issues } = evaluateRecipeReadiness(overlapRecipe([
      { id: 'g1', options: [{ quantity: 1, match: { type: 'component', componentId: 'cmp-iron-ore' } }] },
      { id: 'g2', options: [{ quantity: 1, match: { type: 'tags', tags: ['metal'], tagMatch: 'any' } }] }
    ]), { systemComponents });

    const overlaps = issues.filter(i => i.id === 'requirementOverlap');
    assert.equal(overlaps.length, 1, 'one requirementOverlap for the set');
    assert.equal(overlaps[0].severity, 'warning');
    assert.equal('blocks' in overlaps[0], false, 'overlap never blocks enabling');
    assert.equal(overlaps[0].target, 'ingredients');
    assert.equal(check(checks, 'noRequirementOverlap').satisfied, false);
    assert.equal(blocksEnable(issues), false, 'ambiguity does not block enabling');
  });

  it('flags two tag requirements whose tagged components intersect', () => {
    const { issues } = evaluateRecipeReadiness(overlapRecipe([
      { id: 'g1', options: [{ quantity: 1, match: { type: 'tags', tags: ['metal'], tagMatch: 'any' } }] },
      { id: 'g2', options: [{ quantity: 1, match: { type: 'tags', tags: ['ore'], tagMatch: 'any' } }] }
    ]), { systemComponents });
    assert.equal(issues.filter(i => i.id === 'requirementOverlap').length, 1);
  });

  it('does not double-flag exact-duplicate requirements as an overlap', () => {
    const { issues } = evaluateRecipeReadiness(overlapRecipe([
      { id: 'g1', options: [{ quantity: 1, match: { type: 'tags', tags: ['metal'], tagMatch: 'any' } }] },
      { id: 'g2', options: [{ quantity: 3, match: { type: 'tags', tags: ['metal'], tagMatch: 'any' } }] }
    ]), { systemComponents });
    assert.equal(issues.filter(i => i.id === 'duplicateRequirement').length, 1, 'exact dup flagged once');
    assert.equal(issues.some(i => i.id === 'requirementOverlap'), false, 'no overlap double-flag');
  });

  it('reports clean for disjoint requirements', () => {
    const { checks, issues } = evaluateRecipeReadiness(overlapRecipe([
      { id: 'g1', options: [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }] },
      { id: 'g2', options: [{ quantity: 1, match: { type: 'tags', tags: ['metal'], tagMatch: 'any' } }] }
    ]), { systemComponents });
    assert.equal(issues.some(i => i.id === 'requirementOverlap'), false);
    assert.equal(check(checks, 'noRequirementOverlap').satisfied, true);
  });

  it('does not flag a currency requirement against a tag requirement (currency expands empty)', () => {
    const { issues } = evaluateRecipeReadiness(overlapRecipe([
      { id: 'g1', options: [{ quantity: 1, match: { type: 'currency', unit: 'gp', amount: 100 } }] },
      { id: 'g2', options: [{ quantity: 1, match: { type: 'tags', tags: ['metal'], tagMatch: 'any' } }] }
    ]), { systemComponents });
    assert.equal(issues.some(i => i.id === 'requirementOverlap'), false);
  });

  it('detects no overlap when systemComponents is absent (one-arg back-compat call)', () => {
    const { checks, issues } = evaluateRecipeReadiness(overlapRecipe([
      { id: 'g1', options: [{ quantity: 1, match: { type: 'component', componentId: 'cmp-iron-ore' } }] },
      { id: 'g2', options: [{ quantity: 1, match: { type: 'tags', tags: ['metal'], tagMatch: 'any' } }] }
    ]));
    assert.equal(issues.some(i => i.id === 'requirementOverlap'), false, 'no catalogue → no overlap');
    assert.equal(check(checks, 'noRequirementOverlap').satisfied, true);
    assert.equal(blocksEnable(issues), false);
  });

  it('carries stepId on a multi-step overlap issue', () => {
    const { issues } = evaluateRecipeReadiness({
      name: 'Multi overlap',
      enabled: true,
      steps: [
        { id: 'sa', name: 'Smelt', ingredientSets: [{
          id: 's1',
          ingredientGroups: [
            { id: 'g1', options: [{ quantity: 1, match: { type: 'component', componentId: 'cmp-iron-ore' } }] },
            { id: 'g2', options: [{ quantity: 1, match: { type: 'tags', tags: ['metal'], tagMatch: 'any' } }] }
          ]
        }], resultGroups: [{ id: 'r1' }] }
      ]
    }, { systemComponents });
    const overlap = issues.find(i => i.id === 'requirementOverlap');
    assert.ok(overlap, 'overlap surfaced for the multi-step recipe');
    assert.equal(overlap.stepId, 'sa');
    assert.equal(overlap.stepName, 'Smelt');
  });

  it('emits exactly one overlap issue for three mutually-overlapping requirements in a set', () => {
    const { issues } = evaluateRecipeReadiness(overlapRecipe([
      { id: 'g1', options: [{ quantity: 1, match: { type: 'tags', tags: ['metal'], tagMatch: 'any' } }] },
      { id: 'g2', options: [{ quantity: 1, match: { type: 'tags', tags: ['ore'], tagMatch: 'any' } }] },
      { id: 'g3', options: [{ quantity: 1, match: { type: 'component', componentId: 'cmp-copper-ore' } }] }
    ]), { systemComponents });
    assert.equal(issues.filter(i => i.id === 'requirementOverlap').length, 1, 'one issue per set');
  });
});

describe('evaluateRecipeReadiness routed check-mode warnings', () => {
  // Two authored success tiers offered by the system's routed check (the
  // success-filtered {id,name} list the recipe editor threads in).
  const routedOutcomeTierOptions = [
    { id: 't-good', name: 'Good' },
    { id: 't-great', name: 'Great' }
  ];

  it('warns when a check-mode result group has no assigned outcome tier, deep-linking to results', () => {
    const { checks, issues } = evaluateRecipeReadiness({
      name: 'Routed',
      enabled: true,
      ingredientSets: [{ id: 's1' }],
      resultGroups: [
        { id: 'g-good', name: 'Good', checkOutcomeIds: ['t-good'] },
        { id: 'g-orphan', name: 'Orphan', checkOutcomeIds: [] }
      ]
    }, { routingProvider: 'check', routedOutcomeTierOptions });

    const unrouted = issues.filter(i => i.id === 'unroutedResultGroup');
    assert.equal(unrouted.length, 1, 'one unroutedResultGroup warning for the orphan group');
    assert.equal(unrouted[0].severity, 'warning');
    assert.equal(unrouted[0].target, 'results', 'deep-links to the results tab');
    assert.equal('blocks' in unrouted[0], false, 'never blocks enabling');
    assert.equal(check(checks, 'routedResultGroupsRouted').satisfied, false);
    assert.equal(blocksEnable(issues), false);
  });

  it('treats a group referencing only a deleted tier id as unrouted', () => {
    const { issues } = evaluateRecipeReadiness({
      name: 'Stale',
      enabled: true,
      ingredientSets: [{ id: 's1' }],
      resultGroups: [
        { id: 'g-good', name: 'Good', checkOutcomeIds: ['t-good'] },
        { id: 'g-great', name: 'Great', checkOutcomeIds: ['t-great'] },
        // References a since-deleted tier id only → counts as unrouted.
        { id: 'g-stale', name: 'Stale', checkOutcomeIds: ['t-deleted'] }
      ]
    }, { routingProvider: 'check', routedOutcomeTierOptions });

    assert.equal(issues.filter(i => i.id === 'unroutedResultGroup').length, 1);
    // Both valid tiers are produced, so no unproduced-tier warning.
    assert.equal(issues.some(i => i.id === 'unproducedOutcomeTier'), false);
  });

  it('warns when an authored success tier produces no result group, deep-linking to results', () => {
    const { checks, issues } = evaluateRecipeReadiness({
      name: 'Routed',
      enabled: true,
      ingredientSets: [{ id: 's1' }],
      // Only 't-good' is produced; 't-great' is unproduced.
      resultGroups: [{ id: 'g-good', name: 'Good', checkOutcomeIds: ['t-good'] }]
    }, { routingProvider: 'check', routedOutcomeTierOptions });

    const unproduced = issues.filter(i => i.id === 'unproducedOutcomeTier');
    assert.equal(unproduced.length, 1, 'one unproducedOutcomeTier warning');
    assert.equal(unproduced[0].severity, 'warning');
    assert.equal(unproduced[0].target, 'results', 'deep-links to the results tab');
    assert.equal('blocks' in unproduced[0], false, 'never blocks enabling');
    assert.equal(check(checks, 'routedOutcomeTiersProduced').satisfied, false);
    assert.equal(blocksEnable(issues), false);
  });

  it('does not fire routed warnings when the recipe is not check-routed', () => {
    const { checks, issues } = evaluateRecipeReadiness({
      name: 'IngredientRouted',
      enabled: true,
      ingredientSets: [{ id: 's1' }],
      resultGroups: [{ id: 'g-orphan', name: 'Orphan', checkOutcomeIds: [] }]
    }, { routingProvider: 'ingredientSet', routedOutcomeTierOptions });

    assert.equal(issues.some(i => i.id === 'unroutedResultGroup'), false);
    assert.equal(issues.some(i => i.id === 'unproducedOutcomeTier'), false);
    assert.equal(check(checks, 'routedResultGroupsRouted'), undefined, 'no routed checklist entry off check-mode');
    assert.equal(check(checks, 'routedOutcomeTiersProduced'), undefined);
  });

  it('is clean when every group routes and every tier is produced', () => {
    const { checks, issues } = evaluateRecipeReadiness({
      name: 'Routed',
      enabled: true,
      ingredientSets: [{ id: 's1' }],
      resultGroups: [
        { id: 'g-good', name: 'Good', checkOutcomeIds: ['t-good'] },
        { id: 'g-great', name: 'Great', checkOutcomeIds: ['t-great'] }
      ]
    }, { routingProvider: 'check', routedOutcomeTierOptions });

    assert.equal(issues.some(i => i.id === 'unroutedResultGroup'), false);
    assert.equal(issues.some(i => i.id === 'unproducedOutcomeTier'), false);
    assert.equal(check(checks, 'routedResultGroupsRouted').satisfied, true);
    assert.equal(check(checks, 'routedOutcomeTiersProduced').satisfied, true);
  });
});
