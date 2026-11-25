/** The editor's and the library's reading of an iterative recipe: issues, status, step tallies and the pill. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { byCodePoint } from './helpers/codePointOrder.js';
import { installFoundryEnv } from './helpers/foundryEnv.js';

installFoundryEnv();

const { Recipe } = await import('../src/models/Recipe.js');
const { iterativeStartRefusal } = await import('../src/systems/iterative/iterativeCraftGate.js');
const { evaluateIterativeReadiness } =
  await import('../src/systems/iterative/iterativeReadiness.js');
const { normalizeIterativeLibrary } = await import('../src/systems/normalize/iterativeLibrary.js');
const { buildLabContent, LAB_SYSTEM_IDS } = await import('./view-lab/world/labContent.js');
const { seedIterativeRecipes, seedIterativeState } =
  await import('./view-lab/world/labIterative.js');
const {
  iterativeReadinessInput,
  iterativeRecipeIssues,
  iterativeRecipeStatus,
  iterativeStatusPill,
  iterativeStepTally,
} = await import('../src/ui/svelte/apps/manager/iterative/iterativeRecipeIssues.js');

/** The lab's authored Ironworks, as the readiness evaluator reads it. */
function authored() {
  const content = buildLabContent();
  seedIterativeState(content, 'populated');
  seedIterativeRecipes(content, [], 'authoring');
  const persisted = content.systems.find((entry) => entry.id === LAB_SYSTEM_IDS.IRONWORKS);
  const system = { ...persisted, iterative: normalizeIterativeLibrary(persisted.iterative) };
  const recipes = content.recipes
    .filter((entry) => entry.craftingSystemId === system.id)
    .map((entry) => new Recipe(entry));
  return { system, recipes };
}

const { system, recipes } = authored();
const byId = (id) => recipes.find((entry) => entry.id === id);
const issuesOf = (recipe, sys = system) =>
  iterativeRecipeIssues(evaluateIterativeReadiness(sys, [recipe]), recipe, sys);
const tag = (issue) => `${issue.code}@${issue.stepIndex}`;

/** The oracle: each lab recipe's status and its issues in first-raised order, written out by hand. */
const ORACLE = [
  ['iw-r-blade', { id: 'ready' }, []],
  [
    'iw-r-ingot',
    { id: 'setup' },
    [
      'iterativeNoCounters@null',
      'iterativeNoSuccessRule@null',
      'iterativeFinalStepProducesNothing@null',
    ],
  ],
  [
    'iw-r-nail',
    { id: 'blocking', count: 2 },
    ['iterativeUnknownCounter@null', 'iterativeUnknownAction@null'],
  ],
  ['iw-r-hinge', { id: 'ready' }, ['iterativeFinalStepProducesNothing@null']],
  [
    'iw-r-rivet',
    { id: 'blocking', count: 3 },
    [
      'iterativeBoundsInverted@null',
      'iterativeStartOutOfBounds@null',
      'iterativeInvalidNumber@null',
    ],
  ],
  [
    'iw-r-sword',
    { id: 'setup' },
    ['iterativeNoSuccessRule@1', 'iterativeSuccessLineOnFailureGroup@0'],
  ],
];

describe('the oracle: each lab recipe, written out by hand', () => {
  for (const [id, status, expected] of ORACLE) {
    it(`${id} is ${status.id} with ${expected.length} issue(s)`, () => {
      const issues = issuesOf(byId(id));
      assert.deepEqual(issues.map(tag), expected);
      assert.deepEqual(iterativeRecipeStatus(issues), status);
    });
  }

  it('covers every authored recipe', () => {
    assert.deepEqual(
      recipes.map((entry) => entry.id).sort(byCodePoint),
      ORACLE.map(([id]) => id).sort(byCodePoint)
    );
  });

  it('is Ready exactly when the start refusal is null', () => {
    for (const entry of recipes) {
      const ready = iterativeRecipeStatus(issuesOf(entry)).id === 'ready';
      assert.equal(iterativeStartRefusal(system, entry) === null, ready, entry.id);
    }
  });

  it('addresses the Sword issues to the explicit steps', () => {
    const issues = issuesOf(byId('iw-r-sword'));
    assert.deepEqual(
      issues.map((issue) => [issue.stepIndex, issue.stepId]),
      [
        [1, 'iw-sword-etch'],
        [0, 'iw-sword-heat'],
      ]
    );
  });
});

describe('metamorphic and mutation checks', () => {
  const sword = () => byId('iw-r-sword').toJSON();

  it('fixing the second Sword step removes only its issue and its tally', () => {
    const fixed = sword();
    fixed.steps[1].iterative.success = [
      { source: 'counter', counterId: 'heat', op: '>=', value: 9 },
    ];
    const before = issuesOf(byId('iw-r-sword'));
    const after = issuesOf(new Recipe(fixed));
    assert.deepEqual(after.map(tag), ['iterativeSuccessLineOnFailureGroup@0']);
    assert.deepEqual(iterativeStepTally(before, 1), { blocking: 1, warnings: 0 });
    assert.deepEqual(iterativeStepTally(after, 1), { blocking: 0, warnings: 0 });
    assert.deepEqual(iterativeStepTally(after, 0), iterativeStepTally(before, 0));
  });

  it('moves each issue with its step when the steps swap', () => {
    const swapped = sword();
    swapped.steps.reverse();
    const issues = issuesOf(new Recipe(swapped));
    assert.deepEqual(
      issues.map((issue) => [issue.code, issue.stepId]),
      [
        ['iterativeNoSuccessRule', 'iw-sword-etch'],
        ['iterativeSuccessLineOnFailureGroup', 'iw-sword-heat'],
      ]
    );
    assert.deepEqual(
      issues.map((issue) => issue.stepIndex),
      [0, 1]
    );
  });

  it('keeps one issue per code and step, so a repeated fault is two issues', () => {
    const doubled = sword();
    doubled.steps[0].iterative.success = [];
    const issues = issuesOf(new Recipe(doubled));
    assert.deepEqual(issues.map(tag), [
      'iterativeNoSuccessRule@0',
      'iterativeNoSuccessRule@1',
      'iterativeSuccessLineOnFailureGroup@0',
    ]);
  });

  it('counts blocking issues, not every issue, so a summed chip would read otherwise', () => {
    const nail = iterativeRecipeStatus(issuesOf(byId('iw-r-nail')));
    assert.equal(nail.count, 2);
    const sums = iterativeStepTally(issuesOf(byId('iw-r-sword')), 0);
    assert.deepEqual(sums, { blocking: 0, warnings: 1 });
  });
});

describe('the pill and the readiness input', () => {
  it('withholds Ready while the recipe is enable-blocked, and nothing else', () => {
    assert.equal(iterativeStatusPill({ id: 'ready' }, true), null);
    assert.deepEqual(iterativeStatusPill({ id: 'ready' }, false), { id: 'ready' });
    assert.deepEqual(iterativeStatusPill({ id: 'setup' }, true), { id: 'setup' });
    assert.deepEqual(iterativeStatusPill({ id: 'blocking', count: 2 }, true), {
      id: 'blocking',
      count: 2,
    });
    assert.equal(iterativeStatusPill(null, false), null);
  });

  it('counts blockers that are not recipe-scoped as recipe-wide', () => {
    const broken = structuredClone(system);
    broken.iterative.counters = broken.iterative.counters.map((counter) =>
      counter.id === 'temper' ? { ...counter, min: 7, max: 5 } : counter
    );
    const issues = issuesOf(byId('iw-r-hinge'), broken);
    assert.deepEqual(
      issues.map((issue) => `${issue.code}:${issue.entityKind}`),
      ['iterativeFinalStepProducesNothing:recipe', 'iterativeBoundsInverted:counter']
    );
    assert.deepEqual(iterativeRecipeStatus(issues), { id: 'blocking', count: 1 });
    assert.equal(issues[1].stepIndex, undefined);
  });

  it('counts a library issue on a counter the recipe does not use for no one', () => {
    const broken = structuredClone(system);
    broken.iterative.counters = [
      ...broken.iterative.counters,
      { id: 'unused', label: 'Unused', limit: 'perRecipe', min: 4, max: 1 },
    ];
    assert.deepEqual(issuesOf(byId('iw-r-blade'), broken), []);
  });

  it('lists the explicit steps in the mapper input', () => {
    const issues = issuesOf(byId('iw-r-sword'));
    assert.deepEqual(iterativeReadinessInput(issues, byId('iw-r-sword')), {
      issues,
      steps: [
        { index: 0, id: 'iw-sword-heat', name: 'Heat the blank' },
        { index: 1, id: 'iw-sword-etch', name: 'Etch the fuller' },
      ],
    });
    assert.deepEqual(iterativeReadinessInput([], byId('iw-r-blade')).steps, []);
  });
});
