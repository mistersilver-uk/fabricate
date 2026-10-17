/**
 * The recipe editor's routing model (issue 2511): every `how` and `blockedReason`, the inbound,
 * shared, unreachable and unassigned readings, golden picker options, and a parity suite pinning
 * each offered source's `targets` to the groups the real `ResolutionModeService` awards.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyCheckTotal } from '../src/systems/checkRouting.js';
import { ResolutionModeService } from '../src/systems/ResolutionModeService.js';
import { buildRoutingModel } from '../src/ui/svelte/apps/manager/recipe/recipeRoutingModel.js';
import { setDisplayName } from '../src/ui/svelte/apps/manager/recipe/setDrafts.js';
import { activityPermitsFailureResults } from '../src/utils/failureResultPolicy.js';
import { routedTierOptionsForPolicy } from '../src/utils/routedOutcomeKeywords.js';

const FINE = { id: 't-fine', name: 'Fine', success: true };
const GREAT = { id: 't-great', name: 'Great', success: true };
const BOTCH = { id: 't-botch', name: 'Botch', success: false };

const byHow = (model) => model.sources.map(({ id, how, blockedReason }) => [id, how, blockedReason]);
const setModel = (ingredientSets, resultGroups) =>
  buildRoutingModel({ provider: 'ingredientSet', ingredientSets, resultGroups, setName: setDisplayName });
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
    assert.deepEqual([source.how, source.targets, source.blockedReason], [
      'fallback',
      [],
      'missing-target',
    ]);
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
      [{ id: 'g1', name: 'Other' }, { id: 'g2', name: ' fine ' }, { id: 'g3', name: 'FINE' }],
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

  it('offers only id-bearing tiers', () => {
    const model = tierModel([{ id: 'g1' }], [FINE, { id: '', name: 'Blank' }, null]);
    assert.deepEqual(byHow(model), [['t-fine', 'single', null]]);
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
      [{ id: 's1', resultMapping: ['g1', 'g2'] }, { id: 's2', resultGroupId: 'g2' }],
      [{ id: 'g1' }, { id: 'g2' }]
    );
    assert.deepEqual(model.sources.map(({ sharedCount }) => sharedCount), [2, 2]);
  });

  it('lists every non-failure group as unreachable under ingredientSet with no sets', () => {
    const model = setModel([], [{ id: 'g1' }, { id: 'g2', role: 'failure' }, null]);
    assert.deepEqual([model.sources, model.unreachable], [[], [0, 2]]);
  });

  it('claims an id-less group only by a set naming it, never by an undefined resultGroupId', () => {
    const model = setModel([{ id: 's1' }, { id: 's2', resultGroupId: 'g1' }], [{ name: 'Draft' }, { id: 'g1' }]);
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
    const model = buildRoutingModel({ resultGroups: [{ id: 'g1' }], ingredientSets: [{ id: 's1' }] });
    assert.deepEqual(
      [model.sources, model.inbound, model.unreachable, model.unassigned, model.routingOptionsFor(0)],
      [[], [[]], [], [], []]
    );
  });
});

describe('routingOptionsFor', () => {
  it('gives each group today’s set options: a set routed elsewhere is disabled', () => {
    const model = setModel(
      [
        { id: 's1', name: '  Ore  ' },
        { id: 's2', name: '' },
        { id: 's3', resultGroupId: 'g2' },
        { id: 's4', resultGroupId: 'g1' },
      ],
      [{ id: 'g1' }, { name: 'Draft' }, { id: 'g2' }]
    );
    assert.deepEqual(model.routingOptionsFor(0), [
      { id: 's1', name: 'Ore', disabled: false },
      { id: 's2', name: 'Set 2', disabled: false },
      { id: 's3', name: 'Set 3', disabled: true },
      { id: 's4', name: 'Set 4', disabled: false },
    ]);
    assert.deepEqual(model.routingOptionsFor(1), [
      { id: 's1', name: 'Ore', disabled: false },
      { id: 's2', name: 'Set 2', disabled: false },
      { id: 's3', name: 'Set 3', disabled: true },
      { id: 's4', name: 'Set 4', disabled: true },
    ]);
    assert.deepEqual(model.routingOptionsFor(2), [
      { id: 's1', name: 'Ore', disabled: false },
      { id: 's2', name: 'Set 2', disabled: false },
      { id: 's3', name: 'Set 3', disabled: false },
      { id: 's4', name: 'Set 4', disabled: true },
    ]);
  });

  it('gives each group today’s tier options: a tier listed by another index is disabled', () => {
    const model = tierModel(
      [{ id: 'g1', checkOutcomeIds: ['t-fine'] }, { name: 'Draft', checkOutcomeIds: ['t-great'] }, null],
      [FINE, GREAT]
    );
    assert.deepEqual(model.routingOptionsFor(0), [
      { id: 't-fine', name: 'Fine', disabled: false },
      { id: 't-great', name: 'Great', disabled: true },
    ]);
    assert.deepEqual(model.routingOptionsFor(1), [
      { id: 't-fine', name: 'Fine', disabled: true },
      { id: 't-great', name: 'Great', disabled: false },
    ]);
    assert.deepEqual(model.routingOptionsFor(2), [
      { id: 't-fine', name: 'Fine', disabled: true },
      { id: 't-great', name: 'Great', disabled: true },
    ]);
  });
});

// ── parity with the engine ──────────────────────────────────────────────────────────────
const FAILURE_AWARD_DISPOSITIONS = ['fail', 'failure'];

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
    FAILURE_AWARD_DISPOSITIONS.includes(resolved?.meta?.disposition);
  if (!succeeded && !failureAward) return [];
  return resolved.groups.map((group) => candidates.indexOf(group));
}

function routedSystem({ type = 'relative', outcomes, policy = 'never', mode = 'routedByCheck' }) {
  const routed =
    type === 'fixed'
      ? { type, fixedOutcomes: outcomes, relativeOutcomes: [] }
      : { type, relativeOutcomes: outcomes, fixedOutcomes: [] };
  return {
    id: 'sys',
    resolutionMode: mode,
    alchemy: mode === 'alchemy' ? { checkMode: 'tiered' } : undefined,
    craftingCheck: { failureResultPolicy: policy, routed },
  };
}

/** The roll result a tier produces: a fixed tier classified from its own start, minimum applied. */
function checkResultFor(system, recipe, tier) {
  const routed = system.craftingCheck.routed;
  if (routed.type !== 'fixed') return { outcome: tier.name, success: tier.success === true };
  const { matched, success } = classifyCheckTotal({
    type: 'fixed',
    total: tier.start,
    fixedOutcomes: routed.fixedOutcomes,
    minOutcomeId: recipe.minSuccessOutcomeId ?? null,
  });
  return { outcome: matched?.name ?? null, success };
}

/**
 * Asserts the model built for one scope against the engine: every offered source's `targets` are
 * the awarded groups, and every tier the policy does not offer awards nothing.
 */
function assertParity({ system, recipe, step = null, mode, expected }) {
  const service = new ResolutionModeService({ getSystem: () => system });
  assert.ok(recipe.craftingSystemId, 'premise: the fixture names its system');
  assert.equal(service.getMode(recipe), mode, 'premise: the fixture runs the intended mode');
  const scope = step ?? recipe;
  const resultGroups = service._allResultGroups({ recipe, step });
  if (mode === 'routedByIngredients') {
    const model = setModel(scope.ingredientSets, resultGroups);
    for (const [index, set] of scope.ingredientSets.entries()) {
      const checkResult = { success: true };
      const awarded = awardedIndexes(service, system, { recipe, step, ingredientSet: set, checkResult });
      assert.deepEqual(model.sources[index].targets, awarded, `set ${set.id}`);
    }
    if (expected) assert.deepEqual(byHow(model), expected);
    return model;
  }
  const routed = system.craftingCheck.routed;
  const outcomes = routed.type === 'fixed' ? routed.fixedOutcomes : routed.relativeOutcomes;
  const offered = routedTierOptionsForPolicy(routed, system.craftingCheck.failureResultPolicy);
  const tiers = offered.map((tier) => ({ ...tier, start: outcomes.find((o) => o.id === tier.id).start }));
  const model = buildRoutingModel({
    provider: 'check',
    ingredientSets: scope.ingredientSets,
    resultGroups,
    tiers,
    minSuccessOutcomeId: recipe.minSuccessOutcomeId ?? null,
  });
  const ingredientSet = scope.ingredientSets[0];
  for (const tier of outcomes) {
    const checkResult = checkResultFor(system, recipe, tier);
    const awarded = awardedIndexes(service, system, { recipe, step, ingredientSet, checkResult });
    const source = model.sources.find(({ id }) => id === tier.id);
    if (source) assert.deepEqual(source.targets, awarded, `tier ${tier.name}`);
    else assert.deepEqual(awarded, [], `the unoffered tier ${tier.name} awards nothing`);
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
  const groups = [{ id: 'g1', name: 'A' }, { id: 'g2', name: 'B' }, { id: 'g3', name: 'C' }];
  const check = (ingredientSets, resultGroups, expected = undefined) =>
    assertParity({
      system,
      recipe: recipeOf(resultGroups, ingredientSets),
      mode: 'routedByIngredients',
      expected,
    });

  it('explicit and dangling', () => {
    check(
      [{ id: 's1', resultGroupId: 'g2' }, { id: 's2', resultGroupId: 'gone' }],
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
      [{ id: 's1', resultGroupId: 'g1' }, { id: 's2', resultGroupId: 'g1' }],
      groups
    );
    assert.deepEqual(model.sources.map(({ sharedCount }) => sharedCount), [2, 2]);
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
        [{ id: 'g1', checkOutcomeIds: ['t-fine'] }, { id: 'g2', checkOutcomeIds: [] }, { id: 'g3' }],
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
        [{ id: 'g1', name: 'Other' }, { id: 'g2', name: 'fine' }, { id: 'g3', name: 'Fine' }],
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
        [{ id: 'g1', checkOutcomeIds: ['t-deleted'] }, { id: 'g2', name: 'Fine' }],
        [
          ['t-fine', null, 'unrouted-tier'],
          ['t-great', null, 'unrouted-tier'],
          ...botch(['t-botch', null, 'unrouted-tier']),
        ]
      );
      check(
        [{ id: 'g1', checkOutcomeIds: ['t-botch'] }, { id: 'g2', name: 'Fine' }],
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
      assertParity({ system: failNamed, recipe: recipeOf([{ id: 'g1' }]), mode: 'routedByCheck' });
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
        recipe: recipeOf([{ id: 'g1', name: 'Miss' }, { id: 'g2', name: 'Fine' }]),
        mode: 'routedByCheck',
        expected: expected(['t-fine', 'name', null]),
      });
    });

    it('no groups', () => {
      check([], [
        ['t-fine', null, 'no-name-match'],
        ['t-great', null, 'no-name-match'],
        ...botch(['t-botch', null, 'failure-unassigned']),
      ]);
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
        [{ id: 'g1', checkOutcomeIds: ['t-botch', 't-fine'] }, { id: 'g2', checkOutcomeIds: ['t-great'] }],
        [{ id: 's1' }],
        { minSuccessOutcomeId: 't-great' }
      ),
      mode: 'routedByCheck',
    });
    assert.deepEqual(byHow(model), [
      ['t-botch', null, 'below-minimum'],
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
    resultGroups: [{ id: 'sg1', checkOutcomeIds: ['t-great'] }, { id: 'sg2', name: 'Fine' }],
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
