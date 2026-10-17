/**
 * The routing overview's rows (issue 2513): one scope per step as the engine reads it, rows best
 * first with gap rows between the tiers, policy and below-minimum blocks, the markers, and the set
 * summary.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ResolutionModeService } from '../src/systems/ResolutionModeService.js';
import { fixedTierGaps } from '../src/ui/svelte/apps/manager/checks/checkRangeGaps.js';
import { buildRoutingModel } from '../src/ui/svelte/apps/manager/recipe/recipeRoutingModel.js';
import {
  overviewRows,
  routingScopes,
  setSummary,
} from '../src/ui/svelte/apps/manager/recipe/routingOverviewRows.js';
import {
  routedOutcomeTierRows,
  routedTierOptionsForPolicy,
} from '../src/utils/routedOutcomeKeywords.js';

const engineGroups = (recipe, step) =>
  new ResolutionModeService({ getSystem: () => null })._allResultGroups({ recipe, step });

describe('routingScopes', () => {
  const recipeGroups = [{ id: 'rg1' }];

  /** Every scope's groups are the engine's candidates for that step. */
  function assertEngineGroups(recipe, scopes) {
    for (const scope of scopes) {
      const step = scope.stepId == null ? null : recipe.steps.find(({ id }) => id === scope.stepId);
      assert.deepEqual(scope.groups, engineGroups(recipe, step), `scope ${scope.stepId}`);
    }
  }

  it('reads a recipe with no steps as one recipe scope', () => {
    const recipe = { ingredientSets: [{ id: 's1' }], resultGroups: recipeGroups };
    const scopes = routingScopes(recipe, { collapsed: false });
    assert.deepEqual(scopes, [
      { stepId: null, name: '', sets: [{ id: 's1' }], groups: recipeGroups, borrowed: false },
    ]);
    assertEngineGroups(recipe, scopes);
  });

  it('reads one explicit step as one scope carrying its id', () => {
    const step = { id: 'st1', name: 'Smelt', ingredientSets: [], resultGroups: [{ id: 'sg1' }] };
    const recipe = { steps: [step], ingredientSets: [], resultGroups: recipeGroups };
    const scopes = routingScopes(recipe, { collapsed: false });
    assert.deepEqual(
      scopes.map(({ stepId, name, borrowed }) => [stepId, name, borrowed]),
      [['st1', 'Smelt', false]]
    );
    assertEngineGroups(recipe, scopes);
  });

  it('reads one scope per step, a step with no result sets borrowing the recipe’s', () => {
    const recipe = {
      steps: [
        { id: 'st1', name: 'One', ingredientSets: [{ id: 's1' }], resultGroups: [{ id: 'sg1' }] },
        { id: 'st2', name: 'Two', ingredientSets: [{ id: 's2' }], resultGroups: [] },
        { id: 'st3', name: 'Three' },
      ],
      resultGroups: recipeGroups,
    };
    const scopes = routingScopes(recipe, { collapsed: false });
    assert.deepEqual(
      scopes.map(({ stepId, sets, borrowed }) => [stepId, sets, borrowed]),
      [
        ['st1', [{ id: 's1' }], false],
        ['st2', [{ id: 's2' }], true],
        ['st3', [], true],
      ]
    );
    assertEngineGroups(recipe, scopes);
  });

  it('borrows nothing when the recipe has no result sets to lend', () => {
    const recipe = { steps: [{ id: 'st1', resultGroups: [] }], resultGroups: [] };
    const [scope] = routingScopes(recipe, { collapsed: false });
    assert.deepEqual([scope.groups, scope.borrowed], [[], false]);
    assertEngineGroups(recipe, [scope]);
  });

  it('reads a collapsed chain as its final step, by id', () => {
    // jw-r-circlet: authored steps on a system with multi-step off, recipe-level sets kept.
    const recipe = {
      steps: [
        { id: 'jw-step-draw', ingredientSets: [{ id: 'd1' }], resultGroups: [{ id: 'd-rg' }] },
        { id: 'jw-step-chase', ingredientSets: [{ id: 'c1' }], resultGroups: [{ id: 'c-rg' }] },
      ],
      ingredientSets: [{ id: 'jw-set-circlet', resultGroupId: 'jw-grp-circlet' }],
      resultGroups: [{ id: 'jw-grp-circlet' }],
    };
    const scopes = routingScopes(recipe, { collapsed: true });
    assert.deepEqual(
      scopes.map(({ stepId, sets }) => [stepId, sets]),
      [['jw-step-chase', [{ id: 'c1' }]]]
    );
    assertEngineGroups(recipe, scopes);
  });

  it('reads a recipe with no sets and no groups as one empty scope', () => {
    const scopes = routingScopes({}, { collapsed: false });
    assert.deepEqual(scopes, [{ stepId: null, name: '', sets: [], groups: [], borrowed: false }]);
    assertEngineGroups({}, scopes);
  });
});

// ── rows ────────────────────────────────────────────────────────────────────────────────
const tier = (id, success, start, end) => ({ id, name: id, success, start, end });
const fixedRouted = (fixedOutcomes) => ({ type: 'fixed', fixedOutcomes, relativeOutcomes: [] });
const keys = (rows) => rows.map(({ key }) => key);

/** The rows a fixed or relative check draws for `groups`, built as the card builds them. */
function checkRows(routed, groups, { policy = 'never', minimum = null, direction = 'over' } = {}) {
  const tierRows = routedOutcomeTierRows(routed);
  const offered = routedTierOptionsForPolicy(routed, policy);
  const model = buildRoutingModel({
    provider: 'check',
    resultGroups: groups,
    tiers: offered,
    rankedTiers: tierRows,
    minSuccessOutcomeId: minimum,
    direction,
  });
  return overviewRows({
    provider: 'check',
    model,
    scope: { groups, sets: [] },
    tierRows,
    offeredIds: offered.map(({ id }) => id),
    gaps: routed.type === 'fixed' ? fixedTierGaps(routed.fixedOutcomes) : [],
    direction,
  });
}

describe('overviewRows: tier order and gaps', () => {
  const groups = [{ id: 'g1' }];

  it('draws no row for a check with zero tiers', () => {
    assert.deepEqual(checkRows(fixedRouted([]), groups), []);
    assert.deepEqual(checkRows({ type: 'relative', relativeOutcomes: [] }, groups), []);
  });

  it('orders fixed tiers best first in the check’s direction, a gap between its neighbours', () => {
    const routed = fixedRouted([
      tier('rough', true, 8, 11),
      tier('fine', true, 16, 17),
      tier('master', true, 18, 20),
      tier('standard', true, 12, 14),
    ]);
    assert.deepEqual(keys(checkRows(routed, groups)), [
      'tier:master',
      'tier:fine',
      'gap:15',
      'tier:standard',
      'tier:rough',
    ]);
    assert.deepEqual(keys(checkRows(routed, groups, { direction: 'under' })), [
      'tier:rough',
      'tier:standard',
      'gap:15',
      'tier:fine',
      'tier:master',
    ]);
  });

  it('keeps authored order among equal starts in both directions', () => {
    const routed = fixedRouted([
      tier('low', true, 1, 5),
      tier('b', true, 6, 10),
      tier('a', true, 6, 10),
    ]);
    assert.deepEqual(keys(checkRows(routed, groups)), ['tier:b', 'tier:a', 'tier:low']);
    assert.deepEqual(keys(checkRows(routed, groups, { direction: 'under' })), [
      'tier:low',
      'tier:b',
      'tier:a',
    ]);
  });

  it('carries the gap span on the gap row', () => {
    const routed = fixedRouted([tier('a', true, 1, 5), tier('b', true, 9, 12)]);
    const gap = checkRows(routed, groups).find(({ kind }) => kind === 'gap');
    assert.deepEqual(gap, { kind: 'gap', key: 'gap:6', gap: { from: 6, to: 8 } });
  });

  it('draws no row for an id-less tier, and puts a null-bound tier last, never beside a gap', () => {
    const routed = fixedRouted([
      { name: 'Nameless', success: true, start: 14, end: 15 },
      tier('open', true, 10, null),
      tier('high', true, 16, 20),
      tier('wild', true, null, null),
      tier('low', true, 1, 9),
      tier('mid', true, 11, 13),
    ]);
    const rows = checkRows(routed, groups);
    assert.deepEqual(keys(rows), [
      'tier:high',
      'tier:mid',
      'gap:10',
      'tier:low',
      'tier:open',
      'tier:wild',
    ]);
    assert.deepEqual(keys(checkRows(routed, groups, { direction: 'under' })).slice(-2), [
      'tier:open',
      'tier:wild',
    ]);
  });

  it('keeps a relative check’s tiers in authored order', () => {
    const routed = {
      type: 'relative',
      relativeOutcomes: [
        { id: 'b', name: 'B', success: true, dc: 5 },
        { id: 'a', name: 'A', success: true, dc: 10 },
      ],
    };
    assert.deepEqual(keys(checkRows(routed, groups)), ['tier:b', 'tier:a']);
  });
});

describe('overviewRows: blocked rows and the forced-failure hint', () => {
  const routed = fixedRouted([
    tier('master', true, 18, 20),
    tier('standard', true, 12, 17),
    tier('rough', true, 8, 11),
    tier('ruined', false, 1, 7),
  ]);
  const groups = [{ id: 'g1', checkOutcomeIds: ['standard', 'master', 'ruined'] }, { id: 'g2' }];
  const byKey = (rows) => Object.fromEntries(rows.map((row) => [row.key, row]));

  it('blocks a failure tier the policy forbids as policy, even beneath the minimum', () => {
    const rows = byKey(checkRows(routed, groups, { minimum: 'standard' }));
    assert.equal(rows['tier:ruined'].kind, 'blocked');
    assert.equal(rows['tier:ruined'].blocked, 'policy');
    assert.equal(rows['tier:rough'].blocked, 'below-minimum');
    assert.equal(rows['tier:standard'].kind, 'source');
  });

  it('never blocks a permitted failure tier below the minimum, and hints its forced route', () => {
    const rows = byKey(checkRows(routed, groups, { policy: 'perRecord', minimum: 'standard' }));
    assert.equal(rows['tier:ruined'].kind, 'source');
    assert.equal(rows['tier:ruined'].forcedFailure, true);
    assert.equal(rows['tier:ruined'].value, 'g1');
    assert.equal(rows['tier:standard'].forcedFailure, false, 'a success tier carries no hint');
  });

  it('hints no forced route without a minimum', () => {
    const rows = byKey(checkRows(routed, groups, { policy: 'perRecord' }));
    assert.equal(rows['tier:ruined'].forcedFailure, false);
    assert.equal(rows['tier:rough'].kind, 'source', 'nothing is below a missing minimum');
  });
});

describe('overviewRows: set rows and markers', () => {
  const setRows = (sets, groups) =>
    overviewRows({
      provider: 'ingredientSet',
      model: buildRoutingModel({
        provider: 'ingredientSet',
        ingredientSets: sets,
        resultGroups: groups,
      }),
      scope: { sets, groups },
      tierRows: [],
      offeredIds: [],
      gaps: [],
    });
  const markers = (rows) =>
    rows.map(({ key, value, fallback, shared }) => [key, value, fallback, shared]);

  it('lists sets in authored order with their effective target, default and shared', () => {
    const groups = [{ id: 'g1' }, { id: 'g2' }];
    const rows = setRows(
      [{ id: 's2', resultGroupId: 'g2' }, { id: 's1', resultGroupId: 'g2' }, { id: 's3' }],
      groups
    );
    assert.deepEqual(markers(rows), [
      ['set:s2', 'g2', false, 2],
      ['set:s1', 'g2', false, 2],
      ['set:s3', 'g1', true, 0],
    ]);
    assert.ok(rows.every(({ kind }) => kind === 'source'));
  });

  it('marks a two-id resultMapping default with its first target', () => {
    const rows = setRows([{ id: 's1', resultMapping: ['g2', 'g1'] }], [{ id: 'g1' }, { id: 'g2' }]);
    assert.deepEqual(markers(rows), [['set:s1', 'g1', true, 0]]);
  });

  it('marks no default on a blocked fallback', () => {
    assert.deepEqual(markers(setRows([{ id: 's1', resultMapping: ['nope'] }], [{ id: 'g1' }])), [
      ['set:s1', '', false, 0],
    ]);
    assert.deepEqual(markers(setRows([{ id: 's1' }], [])), [['set:s1', '', false, 0]]);
  });

  it('keys an id-less set by its index', () => {
    assert.deepEqual(keys(setRows([{ name: 'Draft' }], [{ id: 'g1' }])), ['set:0']);
  });

  it('marks a tier routed by the single-group exemption or by name as default', () => {
    const routed = {
      type: 'relative',
      relativeOutcomes: [tier('fine', true, null, null), tier('great', true, null, null)],
    };
    const single = checkRows(routed, [{ id: 'g1' }]);
    assert.deepEqual(markers(single), [
      ['tier:fine', 'g1', true, 2],
      ['tier:great', 'g1', true, 2],
    ]);
    const named = checkRows(routed, [
      { id: 'g1', name: 'great' },
      { id: 'g2', checkOutcomeIds: [] },
    ]);
    assert.deepEqual(markers(named), [
      ['tier:fine', '', false, 0],
      ['tier:great', 'g1', true, 0],
    ]);
  });
});

describe('setSummary', () => {
  const nameOf = (value) => ({ steel: 'Steel Ingot', oak: 'Oak Haft' })[value.id] ?? value.kind;

  it('names each requirement’s first alternative with its amount', () => {
    const set = {
      ingredientGroups: [
        {
          options: [
            { match: { type: 'component', componentId: 'steel' }, quantity: 2 },
            { match: { type: 'component', componentId: 'oak' }, quantity: 9 },
          ],
        },
        { options: [{ match: { type: 'component', componentId: 'oak' } }] },
      ],
    };
    assert.equal(setSummary(set, nameOf), 'Steel Ingot ×2 · Oak Haft ×1');
  });

  it('skips a requirement with no alternatives, and reads no groups as empty', () => {
    const set = { ingredientGroups: [{ options: [] }, { options: [{ match: { type: 'tags' } }] }] };
    assert.equal(setSummary(set, nameOf), 'tags ×1');
    assert.equal(setSummary({}, nameOf), '');
    assert.equal(setSummary(null, nameOf), '');
  });
});
