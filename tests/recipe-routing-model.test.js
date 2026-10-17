/**
 * The recipe editor's routing model (issues 2511, 2513): every `how` and `blockedReason`, the
 * inbound, shared, unreachable and unassigned readings, the minimum, and a parity suite pinning each
 * offered source's `targets` to the groups the real `ResolutionModeService` awards.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyCheckTotal, sumGrading } from '../src/systems/checkRouting.js';
import { activeCheckEvaluation } from '../src/systems/checkTarget.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { ResolutionModeService } from '../src/systems/ResolutionModeService.js';
import {
  buildRoutingModel,
  routedMinimum,
} from '../src/ui/svelte/apps/manager/recipe/recipeRoutingModel.js';
import { setDisplayName } from '../src/ui/svelte/apps/manager/recipe/setDrafts.js';
import { activityPermitsFailureResults } from '../src/utils/failureResultPolicy.js';
import {
  routedOutcomeTierRows,
  routedTierOptionsForPolicy,
} from '../src/utils/routedOutcomeKeywords.js';

const FINE = { id: 't-fine', name: 'Fine', success: true };
const GREAT = { id: 't-great', name: 'Great', success: true };
const BOTCH = { id: 't-botch', name: 'Botch', success: false };

const byHow = (model) =>
  model.sources.map(({ id, how, blockedReason }) => [id, how, blockedReason]);
const setModel = (ingredientSets, resultGroups) =>
  buildRoutingModel({
    provider: 'ingredientSet',
    ingredientSets,
    resultGroups,
    setName: setDisplayName,
  });
const tierModel = (resultGroups, tiers = [FINE, GREAT, BOTCH], extra = {}) =>
  buildRoutingModel({ provider: 'check', resultGroups, tiers, ...extra });

describe('set sources', () => {
  const groups = [{ id: 'g1' }, { id: 'g2' }, { id: 'g2' }];

  it('an explicit resultGroupId targets every group with that id', () => {
    const [source] = setModel([{ id: 's1', name: 'Ore', resultGroupId: 'g2' }], groups).sources;
    assert.deepEqual(source, {
      id: 's1',
      kind: 'ingredientSet',
      name: 'Ore',
      targetId: 'g2',
      targets: [1, 2],
      how: 'explicit',
      blockedReason: null,
      sharedCount: 1,
    });
  });

  it('a dangling resultGroupId stays explicit with no targets', () => {
    const model = setModel([{ id: 's1', resultGroupId: 'gone', resultMapping: ['g1'] }], groups);
    assert.deepEqual(byHow(model), [['s1', 'explicit', 'missing-target']]);
    assert.deepEqual(model.sources[0].targets, []);
    assert.equal(model.sources[0].targetId, 'gone');
  });

  it('a resultMapping falls back to its listed groups in group order, dropping unknown ids', () => {
    const [source] = setModel([{ id: 's1', resultMapping: ['g2', 'nope', 'g1'] }], groups).sources;
    assert.deepEqual([source.how, source.targets, source.targetId], ['fallback', [0, 1, 2], null]);
  });

  it('a resultMapping matching nothing is blocked rather than taking the first group', () => {
    const [source] = setModel([{ id: 's1', resultMapping: ['nope'] }], groups).sources;
    assert.deepEqual(
      [source.how, source.targets, source.blockedReason],
      ['fallback', [], 'missing-target']
    );
  });

  it('a set with neither falls back to the first group, or is blocked with none', () => {
    assert.deepEqual(setModel([{ id: 's1' }], groups).sources[0].targets, [0]);
    assert.deepEqual(byHow(setModel([{ id: 's1' }], [])), [['s1', 'fallback', 'no-result-set']]);
  });

  it('names a set through the injected setName and tolerates a null set', () => {
    const model = setModel([null, { id: 's2', name: '  ' }], groups);
    assert.deepEqual(
      model.sources.map(({ id, name, targets }) => [id, name, targets]),
      [
        [null, 'Set 1', [0]],
        ['s2', 'Set 2', [0]],
      ]
    );
  });
});

describe('tier sources', () => {
  it('a listed tier is explicit to the first group listing it', () => {
    const model = tierModel([
      { id: 'g1', checkOutcomeIds: [] },
      { id: 'g2', checkOutcomeIds: ['t-fine'] },
      { id: 'g3', checkOutcomeIds: ['t-fine'] },
    ]);
    assert.deepEqual(model.sources[0], {
      id: 't-fine',
      kind: 'tier',
      name: 'Fine',
      targetId: 'g2',
      targets: [1],
      how: 'explicit',
      blockedReason: null,
      sharedCount: 1,
    });
  });

  it('once any group lists a tier, an unlisted one is unrouted, a stale id counting', () => {
    const model = tierModel([{ id: 'g1', checkOutcomeIds: ['t-deleted'] }, { id: 'g2' }]);
    assert.deepEqual(byHow(model), [
      ['t-fine', null, 'unrouted-tier'],
      ['t-great', null, 'unrouted-tier'],
      ['t-botch', null, 'unrouted-tier'],
    ]);
  });

  it('with no tier listed, a failure tier is unassigned before any default applies', () => {
    const model = tierModel([{ id: 'g1', name: 'Botch' }]);
    assert.deepEqual(byHow(model)[2], ['t-botch', null, 'failure-unassigned']);
  });

  it('a reserved tier name awards nothing, a hazard keyword included', () => {
    const tiers = [
      { id: 'f', name: 'Fail', success: true },
      { id: 'm', name: 'Miss', success: true },
      { id: 'c', name: 'Complication', success: true },
    ];
    assert.deepEqual(byHow(tierModel([{ id: 'g1' }], tiers)), [
      ['f', null, 'reserved-name'],
      ['m', null, 'reserved-name'],
      ['c', null, 'reserved-name'],
    ]);
  });

  it('one group takes every remaining tier as single', () => {
    const model = tierModel([{ id: 'g1' }], [FINE, GREAT]);
    assert.deepEqual(byHow(model), [
      ['t-fine', 'single', null],
      ['t-great', 'single', null],
    ]);
    assert.deepEqual(model.sources[1].targets, [0]);
  });

  it('several groups route by normalized name, first match winning, else no match', () => {
    const model = tierModel(
      [
        { id: 'g1', name: 'Other' },
        { id: 'g2', name: ' fine ' },
        { id: 'g3', name: 'FINE' },
      ],
      [FINE, GREAT]
    );
    assert.deepEqual(byHow(model), [
      ['t-fine', 'name', null],
      ['t-great', null, 'no-name-match'],
    ]);
    assert.deepEqual([model.sources[0].targets, model.sources[0].targetId], [[1], 'g2']);
  });

  it('a fixed tier below the minimum is blocked before an explicit listing', () => {
    const tiers = [
      { ...FINE, start: 6 },
      { ...GREAT, start: 16 },
    ];
    const groups = [{ id: 'g1', checkOutcomeIds: ['t-fine', 't-great'] }];
    const over = tierModel(groups, tiers, { minSuccessOutcomeId: 't-great' });
    assert.deepEqual(byHow(over), [
      ['t-fine', null, 'below-minimum'],
      ['t-great', 'explicit', null],
    ]);
    const under = tierModel(groups, tiers, { minSuccessOutcomeId: 't-fine', direction: 'under' });
    assert.deepEqual(byHow(under)[1], ['t-great', null, 'below-minimum']);
    const stale = tierModel(groups, tiers, { minSuccessOutcomeId: 't-gone' });
    assert.deepEqual(byHow(stale)[0], ['t-fine', 'explicit', null]);
  });

  it('reads starts by id from rankedTiers, blocks success tiers only, and returns the minimum', () => {
    const rankedTiers = [
      { ...BOTCH, start: 1 },
      { ...FINE, start: 6 },
      { ...GREAT, start: 16 },
      { id: 't-null', name: 'Null', success: true, start: null },
    ];
    const tiers = [BOTCH, FINE, GREAT, { id: 't-null', name: 'Null', success: true }];
    const model = tierModel([{ id: 'g1' }], tiers, {
      rankedTiers,
      minSuccessOutcomeId: 't-great',
    });
    assert.deepEqual(byHow(model), [
      ['t-botch', null, 'failure-unassigned'],
      ['t-fine', null, 'below-minimum'],
      ['t-great', 'single', null],
      ['t-null', 'single', null],
    ]);
    assert.equal(model.minimum, rankedTiers[2]);
  });

  it('locates no minimum outside check routing, without a finite start, or by a stale id', () => {
    const rankedTiers = [
      { ...FINE, start: null },
      { ...GREAT, start: 16 },
    ];
    const minimumOf = (extra) =>
      tierModel([{ id: 'g1' }], [FINE, GREAT], { rankedTiers, ...extra }).minimum;
    assert.equal(minimumOf({ minSuccessOutcomeId: 't-fine' }), null);
    assert.equal(minimumOf({ minSuccessOutcomeId: 't-gone' }), null);
    assert.equal(minimumOf({}), null);
    const setScoped = buildRoutingModel({
      provider: 'ingredientSet',
      rankedTiers,
      minSuccessOutcomeId: 't-great',
    });
    assert.equal(setScoped.minimum, null);
  });

  it('offers only id-bearing tiers', () => {
    const model = tierModel([{ id: 'g1' }], [FINE, { id: '', name: 'Blank' }, null]);
    assert.deepEqual(byHow(model), [['t-fine', 'single', null]]);
  });
});

describe('routedMinimum', () => {
  it('passes the minimum under routedByCheck alone', () => {
    const read = (resolutionMode, minSuccessOutcomeId) =>
      routedMinimum({ resolutionMode, minSuccessOutcomeId, evaluation: null }).minSuccessOutcomeId;
    assert.equal(read('routedByCheck', 't-fine'), 't-fine');
    assert.equal(read('routedByCheck', undefined), null);
    for (const mode of ['alchemy', 'routedByIngredients', 'simple', 'progressive', undefined]) {
      assert.equal(read(mode, 't-fine'), null, String(mode));
    }
  });

  it('reads the direction exactly as sumGrading does', () => {
    const evaluations = [null];
    for (const product of [undefined, 'sum', 'count']) {
      for (const direction of [undefined, 'over', 'under']) {
        evaluations.push({ product, direction });
      }
    }
    for (const evaluation of evaluations) {
      assert.equal(
        routedMinimum({ resolutionMode: 'routedByCheck', minSuccessOutcomeId: null, evaluation })
          .direction,
        sumGrading(evaluation).direction,
        JSON.stringify(evaluation)
      );
    }
  });
});

describe('inbound, sharedCount, unreachable and unassigned', () => {
  it('collects each group’s effective sources and counts a shared target', () => {
    const groups = [{ id: 'g1' }, { id: 'g2' }, { id: 'g3', role: 'failure' }, { id: 'g4' }];
    const model = setModel(
      [
        { id: 's1', resultGroupId: 'g2' },
        { id: 's2', resultGroupId: 'g2' },
        { id: 's3', resultMapping: ['g1', 'g2'] },
        { id: 's4', resultGroupId: 'gone' },
      ],
      groups
    );
    assert.deepEqual(
      model.inbound.map((sources) => sources.map(({ id }) => id)),
      [['s3'], ['s1', 's2', 's3'], [], []]
    );
    assert.deepEqual(
      model.sources.map(({ sharedCount }) => sharedCount),
      [3, 3, 3, 0]
    );
    assert.deepEqual(model.unreachable, [3], 'a failure-role group is never unreachable');
    assert.deepEqual(model.unassigned, [0, 2, 3]);
  });

  it('counts a multi-target fallback by its largest target', () => {
    const model = setModel(
      [
        { id: 's1', resultMapping: ['g1', 'g2'] },
        { id: 's2', resultGroupId: 'g2' },
      ],
      [{ id: 'g1' }, { id: 'g2' }]
    );
    assert.deepEqual(
      model.sources.map(({ sharedCount }) => sharedCount),
      [2, 2]
    );
  });

  it('lists every non-failure group as unreachable under ingredientSet with no sets', () => {
    const model = setModel([], [{ id: 'g1' }, { id: 'g2', role: 'failure' }, null]);
    assert.deepEqual([model.sources, model.unreachable], [[], [0, 2]]);
  });

  it('claims an id-less group only by a set naming it, never by an undefined resultGroupId', () => {
    const model = setModel(
      [{ id: 's1' }, { id: 's2', resultGroupId: 'g1' }],
      [{ name: 'Draft' }, { id: 'g1' }]
    );
    assert.deepEqual(model.unassigned, [0]);
  });

  it('reads a check group as unassigned when it lists no offered tier, null entries included', () => {
    const model = tierModel(
      [{ id: 'g1', checkOutcomeIds: ['t-fine'] }, { id: 'g2', checkOutcomeIds: ['t-x'] }, null],
      [FINE]
    );
    assert.deepEqual(model.unassigned, [1, 2]);
    assert.deepEqual(model.unreachable, [1, 2]);
  });

  it('routes nothing without a provider', () => {
    const model = buildRoutingModel({
      resultGroups: [{ id: 'g1' }],
      ingredientSets: [{ id: 's1' }],
    });
    assert.deepEqual(
      [model.sources, model.inbound, model.unreachable, model.unassigned],
      [[], [[]], [], []]
    );
  });
});

// ── parity with the engine ──────────────────────────────────────────────────────────────
/** The groups a craft awards, as `CraftingEngine` decides: a pass, else a permitted failure. */
function awardedIndexes(service, system, { recipe, step, ingredientSet, checkResult }) {
  const candidates = service._allResultGroups({ recipe, step });
  const resolved = service.resolveResultGroups({
    recipe,
    step,
    ingredientSet,
    checkResult,
    selectedResultGroupId: null,
  });
  const succeeded =
    checkResult.success === true && service.validateCheckResult({ recipe, checkResult });
  const failureAward =
    !succeeded &&
    activityPermitsFailureResults(system, 'crafting') &&
    CraftingEngine.prototype._isFailureAwardDisposition(resolved?.meta?.disposition);
  if (!succeeded && !failureAward) return [];
  return resolved.groups.map((group) => candidates.indexOf(group));
}

function routedSystem({
  type = 'relative',
  outcomes,
  policy = 'never',
  mode = 'routedByCheck',
  evaluation = undefined,
}) {
  const routed =
    type === 'fixed'
      ? { type, fixedOutcomes: outcomes, relativeOutcomes: [] }
      : { type, relativeOutcomes: outcomes, fixedOutcomes: [] };
  if (evaluation) routed.evaluation = evaluation;
  return {
    id: 'sys',
    resolutionMode: mode,
    alchemy: mode === 'alchemy' ? { checkMode: 'tiered' } : undefined,
    craftingCheck: { failureResultPolicy: policy, routed },
  };
}

/**
 * The roll result a tier produces, classified from its own `start` as the engine would: the
 * system's evaluation, and the minimum only where `_runRoutedCheck` applies it. `forced` adds a
 * forced-failure trigger.
 */
function classifyTier(system, mode, recipe, tier, { forced = false } = {}) {
  const routed = system.craftingCheck.routed;
  if (routed.type !== 'fixed') {
    return { checkResult: { outcome: tier.name, success: tier.success === true } };
  }
  const total = Number(tier.start ?? 0);
  const trigger = {
    outcome: 'failure',
    condition: { type: 'rollTotal', operator: '==', value: total },
  };
  const { matched, success, minTierFailed } = classifyCheckTotal({
    type: 'fixed',
    total,
    fixedOutcomes: routed.fixedOutcomes,
    triggers: forced ? [trigger] : [],
    minOutcomeId: mode === 'routedByCheck' ? (recipe.minSuccessOutcomeId ?? null) : null,
    evaluation: activeCheckEvaluation(routed),
  });
  return { checkResult: { outcome: matched?.name ?? null, success }, matched, minTierFailed };
}

const NULL_START =
  'Backlog 1: the engine coerces a null start to 0 and blocks a tier the editor routes';

/**
 * Asserts one tier's source against the engine. A failure tier the minimum gates is compared on
 * its forced-failure path, its natural roll awarding nothing; a `coercesNullStart` tier asserts
 * the null-start divergence by name.
 */
function assertTierParity(context, tier, source, coercesNullStart) {
  const { service, system, mode, recipe, step, ingredientSet } = context;
  const award = (checkResult) =>
    awardedIndexes(service, system, { recipe, step, ingredientSet, checkResult });
  const natural = classifyTier(system, mode, recipe, tier);
  const awarded = award(natural.checkResult);
  if (!source) {
    return assert.deepEqual(awarded, [], `the unoffered tier ${tier.name} awards nothing`);
  }
  if (coercesNullStart.includes(tier.id)) {
    assert.deepEqual(awarded, [], `${NULL_START}: ${tier.name}`);
    return assert.ok(source.targets.length > 0, `${NULL_START}: ${tier.name}`);
  }
  if (tier.success === true || !natural.minTierFailed) {
    return assert.deepEqual(source.targets, awarded, `tier ${tier.name}`);
  }
  assert.deepEqual(awarded, [], `only on a forced failure: a natural ${tier.name} awards nothing`);
  const forced = classifyTier(system, mode, recipe, tier, { forced: true });
  if (forced.matched?.id !== tier.id) return undefined;
  return assert.deepEqual(source.targets, award(forced.checkResult), `forced ${tier.name}`);
}

/**
 * Asserts the model built for one scope against the engine: every offered source's `targets` are
 * the awarded groups, and every tier the policy does not offer awards nothing.
 */
function assertParity({ system, recipe, step = null, mode, expected, coercesNullStart = [] }) {
  const service = new ResolutionModeService({ getSystem: () => system });
  assert.ok(recipe.craftingSystemId, 'premise: the fixture names its system');
  assert.equal(service.getMode(recipe), mode, 'premise: the fixture runs the intended mode');
  const scope = step ?? recipe;
  const resultGroups = service._allResultGroups({ recipe, step });
  if (mode === 'routedByIngredients') {
    const model = setModel(scope.ingredientSets, resultGroups);
    for (const [index, set] of scope.ingredientSets.entries()) {
      const checkResult = { success: true };
      const awarded = awardedIndexes(service, system, {
        recipe,
        step,
        ingredientSet: set,
        checkResult,
      });
      assert.deepEqual(model.sources[index].targets, awarded, `set ${set.id}`);
    }
    if (expected) assert.deepEqual(byHow(model), expected);
    return model;
  }
  const routed = system.craftingCheck.routed;
  const outcomes = routed.type === 'fixed' ? routed.fixedOutcomes : routed.relativeOutcomes;
  const model = buildRoutingModel({
    provider: 'check',
    ingredientSets: scope.ingredientSets,
    resultGroups,
    tiers: routedTierOptionsForPolicy(routed, system.craftingCheck.failureResultPolicy),
    rankedTiers: routedOutcomeTierRows(routed),
    ...routedMinimum({
      resolutionMode: system.resolutionMode,
      minSuccessOutcomeId: recipe.minSuccessOutcomeId,
      evaluation: activeCheckEvaluation(routed),
    }),
  });
  const context = { service, system, mode, recipe, step, ingredientSet: scope.ingredientSets[0] };
  for (const tier of outcomes) {
    const source = model.sources.find(({ id }) => id === tier.id);
    assertTierParity(context, tier, source, coercesNullStart);
  }
  if (expected) assert.deepEqual(byHow(model), expected);
  return model;
}

const recipeOf = (resultGroups, ingredientSets = [{ id: 's1' }], extra = {}) => ({
  id: 'r1',
  craftingSystemId: 'sys',
  ingredientSets,
  resultGroups,
  ...extra,
});

describe('parity: routedByIngredients', () => {
  const system = { id: 'sys', resolutionMode: 'routedByIngredients' };
  const groups = [
    { id: 'g1', name: 'A' },
    { id: 'g2', name: 'B' },
    { id: 'g3', name: 'C' },
  ];
  const check = (ingredientSets, resultGroups, expected = undefined) =>
    assertParity({
      system,
      recipe: recipeOf(resultGroups, ingredientSets),
      mode: 'routedByIngredients',
      expected,
    });

  it('explicit and dangling', () => {
    check(
      [
        { id: 's1', resultGroupId: 'g2' },
        { id: 's2', resultGroupId: 'gone' },
      ],
      groups,
      [
        ['s1', 'explicit', null],
        ['s2', 'explicit', 'missing-target'],
      ]
    );
  });

  it('a two-id resultMapping, a reversed one with an unknown id, and explicit beside a mapping', () => {
    check(
      [
        { id: 's1', resultMapping: ['g1', 'g3'] },
        { id: 's2', resultMapping: ['g3', 'nope', 'g1'] },
        { id: 's3', resultGroupId: 'g2', resultMapping: ['g1'] },
        { id: 's4', resultMapping: ['nope'] },
      ],
      groups,
      [
        ['s1', 'fallback', null],
        ['s2', 'fallback', null],
        ['s3', 'explicit', null],
        ['s4', 'fallback', 'missing-target'],
      ]
    );
  });

  it('the first group, a failure-role group first included, and no groups', () => {
    check([{ id: 's1' }], groups, [['s1', 'fallback', null]]);
    const failureFirst = [{ id: 'gf', role: 'failure' }, ...groups];
    const model = check([{ id: 's1' }], failureFirst, [['s1', 'fallback', null]]);
    assert.deepEqual([model.sources[0].targets, model.unreachable], [[0], [1, 2, 3]]);
    check([{ id: 's1' }], [], [['s1', 'fallback', 'no-result-set']]);
  });

  it('two sets sharing one group', () => {
    const model = check(
      [
        { id: 's1', resultGroupId: 'g1' },
        { id: 's2', resultGroupId: 'g1' },
      ],
      groups
    );
    assert.deepEqual(
      model.sources.map(({ sharedCount }) => sharedCount),
      [2, 2]
    );
  });
});

for (const policy of ['never', 'perRecord']) {
  describe(`parity: routedByCheck, relative tiers, failureResultPolicy ${policy}`, () => {
    const system = routedSystem({ outcomes: [FINE, GREAT, BOTCH], policy });
    const check = (resultGroups, expected) =>
      assertParity({ system, recipe: recipeOf(resultGroups), mode: 'routedByCheck', expected });
    const botch = (row) => (policy === 'never' ? [] : [row]);

    it('premise: the offered tiers follow the policy', () => {
      const offered = routedTierOptionsForPolicy(system.craftingCheck.routed, policy);
      assert.deepEqual(
        offered.map(({ id }) => id),
        policy === 'never' ? ['t-fine', 't-great'] : ['t-fine', 't-great', 't-botch']
      );
    });

    it('a partial tier list across several groups', () => {
      check(
        [
          { id: 'g1', checkOutcomeIds: ['t-fine'] },
          { id: 'g2', checkOutcomeIds: [] },
          { id: 'g3' },
        ],
        [
          ['t-fine', 'explicit', null],
          ['t-great', null, 'unrouted-tier'],
          ...botch(['t-botch', null, 'unrouted-tier']),
        ]
      );
    });

    it('the single-group exemption', () => {
      check(
        [{ id: 'g1', name: 'Anything' }],
        [
          ['t-fine', 'single', null],
          ['t-great', 'single', null],
          ...botch(['t-botch', null, 'failure-unassigned']),
        ]
      );
    });

    it('a single group listing only some tiers (the recorded readiness divergence)', () => {
      check(
        [{ id: 'g1', checkOutcomeIds: ['t-fine'] }],
        [
          ['t-fine', 'explicit', null],
          ['t-great', null, 'unrouted-tier'],
          ...botch(['t-botch', null, 'unrouted-tier']),
        ]
      );
    });

    it('a name match, no match, and duplicate group names', () => {
      check(
        [
          { id: 'g1', name: 'Other' },
          { id: 'g2', name: 'fine' },
          { id: 'g3', name: 'Fine' },
        ],
        [
          ['t-fine', 'name', null],
          ['t-great', null, 'no-name-match'],
          ...botch(['t-botch', null, 'failure-unassigned']),
        ]
      );
    });

    it('a failure tier explicitly assigned, and two groups listing one tier', () => {
      check(
        [
          { id: 'g1', checkOutcomeIds: ['t-great'] },
          { id: 'g2', checkOutcomeIds: ['t-fine', 't-botch'] },
          { id: 'g3', checkOutcomeIds: ['t-fine'] },
        ],
        [
          ['t-fine', 'explicit', null],
          ['t-great', 'explicit', null],
          ...botch(['t-botch', 'explicit', null]),
        ]
      );
    });

    it('stale or forbidden ids alone still claim tier routing', () => {
      check(
        [
          { id: 'g1', checkOutcomeIds: ['t-deleted'] },
          { id: 'g2', name: 'Fine' },
        ],
        [
          ['t-fine', null, 'unrouted-tier'],
          ['t-great', null, 'unrouted-tier'],
          ...botch(['t-botch', null, 'unrouted-tier']),
        ]
      );
      check(
        [
          { id: 'g1', checkOutcomeIds: ['t-botch'] },
          { id: 'g2', name: 'Fine' },
        ],
        policy === 'never'
          ? [
              ['t-fine', null, 'unrouted-tier'],
              ['t-great', null, 'unrouted-tier'],
            ]
          : [
              ['t-fine', null, 'unrouted-tier'],
              ['t-great', null, 'unrouted-tier'],
              ['t-botch', 'explicit', null],
            ]
      );
    });

    it('an unassigned failure tier with one group, a name-matching group, and named Fail', () => {
      check([{ id: 'g1' }], undefined);
      check([{ id: 'g1', name: 'Botch' }, { id: 'g2' }], undefined);
      const failNamed = routedSystem({
        outcomes: [FINE, { id: 't-fail', name: 'Fail', success: false }],
        policy,
      });
      assertParity({
        system: failNamed,
        recipe: recipeOf([{ id: 'g1' }]),
        mode: 'routedByCheck',
        expected: [['t-fine', 'single', null], ...botch(['t-fail', null, 'failure-unassigned'])],
      });
    });

    it('reserved tier names, single- and multi-group, a hazard keyword included', () => {
      const reserved = routedSystem({
        outcomes: [
          { id: 't-fail', name: 'Fail', success: true },
          { id: 't-miss', name: 'Miss', success: true },
          { id: 't-hazard', name: 'Complication', success: true },
          FINE,
        ],
        policy,
      });
      const expected = (fine) => [
        ['t-fail', null, 'reserved-name'],
        ['t-miss', null, 'reserved-name'],
        ['t-hazard', null, 'reserved-name'],
        fine,
      ];
      assertParity({
        system: reserved,
        recipe: recipeOf([{ id: 'g1', name: 'Fail' }]),
        mode: 'routedByCheck',
        expected: expected(['t-fine', 'single', null]),
      });
      assertParity({
        system: reserved,
        recipe: recipeOf([
          { id: 'g1', name: 'Miss' },
          { id: 'g2', name: 'Fine' },
        ]),
        mode: 'routedByCheck',
        expected: expected(['t-fine', 'name', null]),
      });
    });

    it('no groups', () => {
      check(
        [],
        [
          ['t-fine', null, 'no-name-match'],
          ['t-great', null, 'no-name-match'],
          ...botch(['t-botch', null, 'failure-unassigned']),
        ]
      );
    });
  });
}

describe('parity: routedByCheck, fixed tiers', () => {
  const outcomes = [
    { ...BOTCH, start: 1, end: 5 },
    { ...FINE, start: 6, end: 15 },
    { ...GREAT, start: 16, end: 20 },
  ];

  for (const policy of ['never', 'perRecord']) {
    it(`a partial list and the single-group exemption under ${policy}`, () => {
      const system = routedSystem({ type: 'fixed', outcomes, policy });
      assertParity({
        system,
        recipe: recipeOf([{ id: 'g1', checkOutcomeIds: ['t-great'] }, { id: 'g2' }]),
        mode: 'routedByCheck',
      });
      assertParity({ system, recipe: recipeOf([{ id: 'g1' }]), mode: 'routedByCheck' });
    });
  }

  it('a recipe minimum blocks the tiers below it', () => {
    const system = routedSystem({ type: 'fixed', outcomes, policy: 'perRecord' });
    const model = assertParity({
      system,
      recipe: recipeOf(
        [
          { id: 'g1', checkOutcomeIds: ['t-botch', 't-fine'] },
          { id: 'g2', checkOutcomeIds: ['t-great'] },
        ],
        [{ id: 's1' }],
        { minSuccessOutcomeId: 't-great' }
      ),
      mode: 'routedByCheck',
    });
    assert.deepEqual(byHow(model), [
      ['t-botch', 'explicit', null],
      ['t-fine', null, 'below-minimum'],
      ['t-great', 'explicit', null],
    ]);
  });
});

describe('parity: tiered alchemy', () => {
  for (const policy of ['never', 'perRecord']) {
    it(`routes as routedByCheck under ${policy}`, () => {
      const system = routedSystem({ outcomes: [FINE, GREAT, BOTCH], policy, mode: 'alchemy' });
      assertParity({
        system,
        recipe: recipeOf([{ id: 'g1', checkOutcomeIds: ['t-fine', 't-botch'] }, { id: 'g2' }]),
        mode: 'alchemy',
      });
      assertParity({ system, recipe: recipeOf([{ id: 'g1' }]), mode: 'alchemy' });
    });
  }
});

describe('parity: a multi-step step scope', () => {
  const system = routedSystem({ outcomes: [FINE, GREAT, BOTCH], policy: 'perRecord' });
  const step = {
    id: 'step-2',
    ingredientSets: [{ id: 's2' }],
    resultGroups: [
      { id: 'sg1', checkOutcomeIds: ['t-great'] },
      { id: 'sg2', name: 'Fine' },
    ],
  };
  const recipe = recipeOf([{ id: 'rg1', name: 'Fine' }], [{ id: 's1' }], {
    steps: [{ id: 'step-1' }, step],
  });

  it('reads the step’s own groups', () => {
    assertParity({ system, recipe, step, mode: 'routedByCheck' });
  });

  it('a step with no groups falls back to the recipe’s groups in the engine', () => {
    const empty = { ...step, resultGroups: [] };
    const service = new ResolutionModeService({ getSystem: () => system });
    assert.deepEqual(service._allResultGroups({ recipe, step: empty }), recipe.resultGroups);
    const model = assertParity({ system, recipe, step: empty, mode: 'routedByCheck' });
    assert.deepEqual(model.sources[0].targets, [0], 'the model is fed the engine’s candidates');
  });
});

describe('parity: the minimum success tier', () => {
  const ROUGH = { id: 't-rough', name: 'Rough', success: true };
  const fixed = (outcomes, extra = {}) =>
    routedSystem({ type: 'fixed', outcomes, policy: 'perRecord', ...extra });
  const minimumOn = (resultGroups, minSuccessOutcomeId) =>
    recipeOf(resultGroups, [{ id: 's1' }], { minSuccessOutcomeId });

  it('a minimum on a failure tier the policy does not offer, reached by flipping a chosen tier', () => {
    const outcomes = [
      { ...BOTCH, start: 1, end: 5 },
      { ...FINE, success: false, start: 6, end: 15 },
      { ...GREAT, start: 16, end: 20 },
    ];
    const model = assertParity({
      system: fixed(outcomes, { policy: 'never' }),
      recipe: minimumOn([{ id: 'g1', checkOutcomeIds: ['t-great'] }, { id: 'g2' }], 't-fine'),
      mode: 'routedByCheck',
      expected: [['t-great', 'explicit', null]],
    });
    assert.equal(model.minimum?.id, 't-fine');
  });

  it('a relative check carrying a minimum blocks nothing', () => {
    const model = assertParity({
      system: routedSystem({ outcomes: [FINE, GREAT, BOTCH], policy: 'perRecord' }),
      recipe: minimumOn(
        [
          { id: 'g1', checkOutcomeIds: ['t-fine', 't-botch'] },
          { id: 'g2', checkOutcomeIds: ['t-great'] },
        ],
        't-great'
      ),
      mode: 'routedByCheck',
      expected: [
        ['t-fine', 'explicit', null],
        ['t-great', 'explicit', null],
        ['t-botch', 'explicit', null],
      ],
    });
    assert.equal(model.minimum, null);
  });

  it('a stale minimum blocks nothing', () => {
    const outcomes = [
      { ...FINE, start: 6, end: 15 },
      { ...GREAT, start: 16, end: 20 },
    ];
    assertParity({
      system: fixed(outcomes),
      recipe: minimumOn([{ id: 'g1' }], 't-gone'),
      mode: 'routedByCheck',
      expected: [
        ['t-fine', 'single', null],
        ['t-great', 'single', null],
      ],
    });
  });

  it('a tier sharing the minimum’s start is not below it, and the failure tier routes forced', () => {
    const outcomes = [
      { ...BOTCH, start: 1, end: 5 },
      { ...FINE, start: 6, end: 15 },
      { ...GREAT, start: 16, end: 20 },
      { id: 't-keen', name: 'Keen', success: true, start: 16, end: 20 },
    ];
    assertParity({
      system: fixed(outcomes),
      recipe: minimumOn(
        [
          { id: 'g1', checkOutcomeIds: ['t-botch', 't-fine'] },
          { id: 'g2', checkOutcomeIds: ['t-great', 't-keen'] },
        ],
        't-keen'
      ),
      mode: 'routedByCheck',
      expected: [
        ['t-botch', 'explicit', null],
        ['t-fine', null, 'below-minimum'],
        ['t-great', 'explicit', null],
        ['t-keen', 'explicit', null],
      ],
    });
  });

  it('sum/under blocks the higher starts, given the evaluation on both sides', () => {
    const outcomes = [
      { ...GREAT, start: 1, end: 5 },
      { ...FINE, start: 6, end: 10 },
      { ...ROUGH, start: 11, end: 15 },
      { ...BOTCH, start: 16, end: 20 },
    ];
    assertParity({
      system: fixed(outcomes, { evaluation: { product: 'sum', direction: 'under' } }),
      recipe: minimumOn(
        [
          { id: 'g1', checkOutcomeIds: ['t-great', 't-fine', 't-rough'] },
          { id: 'g2', checkOutcomeIds: ['t-botch'] },
        ],
        't-fine'
      ),
      mode: 'routedByCheck',
      expected: [
        ['t-great', 'explicit', null],
        ['t-fine', 'explicit', null],
        ['t-rough', null, 'below-minimum'],
        ['t-botch', 'explicit', null],
      ],
    });
  });

  it('tiered alchemy ignores a carried minimum', () => {
    const outcomes = [
      { ...BOTCH, start: 1, end: 5 },
      { ...FINE, start: 6, end: 15 },
      { ...GREAT, start: 16, end: 20 },
    ];
    const model = assertParity({
      system: fixed(outcomes, { mode: 'alchemy' }),
      recipe: minimumOn([{ id: 'g1', checkOutcomeIds: ['t-fine', 't-great'] }], 't-great'),
      mode: 'alchemy',
    });
    assert.deepEqual(byHow(model).slice(1), [
      ['t-fine', 'explicit', null],
      ['t-great', 'explicit', null],
    ]);
    assert.equal(model.minimum, null);
  });

  for (const direction of ['over', 'under']) {
    const evaluation = { product: 'sum', direction };

    it(`a null-start minimum blocks nothing in the editor (${direction})`, () => {
      const outcomes = [
        { id: 't-low', name: 'Low', success: true, start: null, end: 8 },
        { ...FINE, start: 9, end: 15 },
        { ...GREAT, start: 16, end: 20 },
      ];
      const model = assertParity({
        system: fixed(outcomes, { evaluation }),
        recipe: minimumOn(
          [
            { id: 'g1', checkOutcomeIds: ['t-low', 't-fine'] },
            { id: 'g2', checkOutcomeIds: ['t-great'] },
          ],
          't-low'
        ),
        mode: 'routedByCheck',
        coercesNullStart: direction === 'under' ? ['t-fine', 't-great'] : [],
      });
      assert.equal(model.minimum, null);
      assert.ok(model.sources.every(({ blockedReason }) => blockedReason === null));
    });

    it(`a boundless tier is never below the minimum in the editor (${direction})`, () => {
      const outcomes = [
        { ...BOTCH, start: 1, end: 8 },
        { ...FINE, start: 9, end: 15 },
        { ...GREAT, start: 16, end: 20 },
        { id: 't-wild', name: 'Wild', success: true, start: null, end: null },
      ];
      const system = fixed(outcomes, { evaluation });
      const recipe = minimumOn(
        [
          { id: 'g1', checkOutcomeIds: ['t-botch', 't-wild'] },
          { id: 'g2', checkOutcomeIds: ['t-fine', 't-great'] },
        ],
        't-fine'
      );
      const model = assertParity({
        system,
        recipe,
        mode: 'routedByCheck',
        coercesNullStart: direction === 'over' ? ['t-wild'] : [],
      });
      assert.deepEqual(byHow(model), [
        ['t-botch', 'explicit', null],
        ['t-fine', 'explicit', null],
        ['t-great', ...(direction === 'over' ? ['explicit', null] : [null, 'below-minimum'])],
        ['t-wild', 'explicit', null],
      ]);
      if (direction === 'under') {
        const natural = classifyTier(system, 'routedByCheck', recipe, outcomes[0]);
        assert.equal(
          natural.minTierFailed,
          false,
          'a failure tier above the minimum routes naturally'
        );
      }
    });
  }
});
