/** Issue 3011 (P7) — the iterative face the Crafting listing adds to its detail model. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createIterativeStepState } from '../src/systems/iterative/iterativeStepState.js';
import { ResolutionModeService } from '../src/systems/ResolutionModeService.js';
import { CraftingListingBuilder } from '../src/ui/presenters/CraftingListingBuilder.js';

import { shippedLocalize } from './helpers/checkEvidenceFixtures.js';

/** The shipped copy, its `{name}` placeholders filled from `data`. */
const localize = (key, data = {}) =>
  shippedLocalize(key).replaceAll(/\{(\w+)\}/gu, (_match, name) => String(data[name] ?? ''));
const clone = (value) => JSON.parse(JSON.stringify(value));

const PLAYER = { id: 'user-1', isGM: false };
const GM = { id: 'gm-1', isGM: true };
const ACTOR = { id: 'actor-1', uuid: 'Actor.actor-1' };

const LIBRARY = Object.freeze({
  version: 1,
  counters: [
    { id: 'shape', label: 'Shape', limit: 'none' },
    { id: 'integrity', label: 'Integrity', limit: 'none' },
    { id: 'secret', label: 'Qzx-Hidden-Fit', limit: 'none' },
  ],
  actions: [],
});

const rule = (counterId, op, value) => ({ source: 'counter', counterId, op, value });
const instance = (counterId, extra = {}) => ({ counterId, start: 0, visible: true, ...extra });

const STEPS = [
  {
    id: 'rough',
    name: 'Rough out the blade',
    ingredientSets: [{ id: 'set-1', name: 'Bar' }],
    resultGroups: [],
    iterative: {
      actions: { mode: 'all', actionIds: [] },
      hiddenCounterIds: [],
      lockedCounterIds: [],
      success: [rule('shape', '>=', 60), rule('secret', '>=', 3)],
      failure: [rule('integrity', '<=', 0), rule('secret', '<=', 0)],
    },
  },
  {
    id: 'edge',
    name: 'Draw out the edge',
    ingredientSets: [{ id: 'set-1', name: 'Bar' }],
    resultGroups: [
      { id: 'good', name: 'Fine', results: [{ componentId: 'c1', quantity: 1 }] },
      { id: 'plain', name: 'Plain', results: [{ componentId: 'c2', quantity: 2 }] },
      { id: 'slag', name: 'Slag', role: 'failure', results: [{ componentId: 'c3', quantity: 1 }] },
    ],
    iterative: {
      actions: { mode: 'all', actionIds: [] },
      hiddenCounterIds: [],
      lockedCounterIds: [],
      success: [rule('shape', '>=', 100)],
      failure: [rule('integrity', '<=', 0)],
    },
  },
];

function recipeOf({ mode = 'iterative', steps = STEPS } = {}) {
  const base = {
    id: 'recipe-1',
    name: 'Forge a Longsword',
    img: 'icons/sword.webp',
    craftingSystemId: 'sys-1',
    description: '',
    iterative: {
      counters: [instance('shape'), instance('integrity'), instance('secret', { visible: false })],
    },
    timeRequirement: {},
    ingredientSets: STEPS[0].ingredientSets,
    resultGroups: [],
  };
  return mode === 'iterative'
    ? { ...base, steps, getExecutionSteps: () => steps }
    : {
        ...base,
        iterative: undefined,
        getExecutionSteps: () => [
          { id: 's', name: 'S', ingredientSets: base.ingredientSets, resultGroups: [] },
        ],
      };
}

const stateAt = (values, sessions) => ({
  ...createIterativeStepState({
    counters: Object.entries(values).map(([counterId, value]) => ({ counterId, value })),
    startedWith: [],
  }),
  sessionCount: sessions,
  attemptCount: sessions,
});

function runOf({
  currentStepIndex = 0,
  state = stateAt({ shape: 20, integrity: 8, secret: 7731 }, 3),
  steps = STEPS,
} = {}) {
  const recipe = recipeOf({ steps });
  return {
    id: 'run-1',
    recipeId: recipe.id,
    status: 'inProgress',
    currentStepIndex,
    steps: steps.map((step, index) => ({
      stepName: step.name,
      status: index === currentStepIndex ? 'inProgress' : 'pending',
      iterative: index === currentStepIndex ? state : undefined,
    })),
    termsSnapshot: { recipe: clone(recipe), iterative: clone(LIBRARY) },
  };
}

/**
 * A run manager that counts each `getActiveRuns` read, however it is reached, and records the actor
 * each read names. Like the real container read, it throws for no actor.
 */
function countingRunManager(runs) {
  const manager = {
    reads: 0,
    actors: [],
    getActiveRuns(actor) {
      if (!actor) throw new TypeError("Cannot read properties of null (reading 'id')");
      manager.reads += 1;
      manager.actors.push(actor);
      return runs;
    },
    findActiveRunForRecipe: (actor, recipeId) =>
      manager.getActiveRuns(actor).find((run) => run.recipeId === recipeId) ?? null,
  };
  return manager;
}

function makeBuilder({ recipe, runs = [], mode = 'iterative' }) {
  const system = {
    id: 'sys-1',
    name: 'Ironworks',
    resolutionMode: mode,
    ...(mode === 'iterative' && { iterative: LIBRARY }),
    craftingCheck: { simple: {}, routed: {}, progressive: {} },
    recipeVisibility: { knowledge: { learn: { consumeOnLearn: true } } },
    components: [
      { id: 'c1', name: 'Longsword' },
      { id: 'c2', name: 'Blade blank' },
      { id: 'c3', name: 'Slag' },
    ],
  };
  const craftingSystemManager = { getSystem: () => system, getRecipeItemDefinition: () => null };
  const craftingRunManager = countingRunManager(runs);
  const builder = new CraftingListingBuilder({
    recipeManager: {
      evaluateCraftability: () => ({ canCraft: true, satisfiableSet: { id: 'set-1' } }),
      getRecipe: () => recipe,
    },
    recipeVisibility: { evaluateRecipeAccess: () => ({ visible: true, reason: 'ok' }) },
    resolutionModeService: new ResolutionModeService(craftingSystemManager),
    craftingSystemManager,
    craftingRunManager,
    localize,
  });
  return { builder, craftingRunManager };
}

const detail = (builder, viewer = PLAYER) =>
  builder.buildRecipeDetail({ recipeId: 'recipe-1', craftingActor: ACTOR, viewer });

const TEASER = () => ({ visible: true, reason: 'teaser' });

/** One step whose failure reads `integrity` and `shape`, hiding `hidden` and producing `results`. */
const stepOf = (id, { hidden = [], results = [{ componentId: 'c1', quantity: 1 }] } = {}) => ({
  ...STEPS[1],
  id,
  name: id,
  resultGroups: [{ id: `${id}-good`, name: 'Good', results }],
  iterative: {
    ...STEPS[1].iterative,
    hiddenCounterIds: hidden,
    failure: [rule('integrity', '<=', 0), rule('shape', '<=', 0)],
  },
});

describe('CraftingListingBuilder — the iterative face (issue 3011)', () => {
  it('leaves a non-iterative model exactly as the model builder made it, with no extra run read', () => {
    const plain = recipeOf({ mode: 'simple' });
    const faced = makeBuilder({ recipe: plain, mode: 'simple' });
    const bare = makeBuilder({ recipe: plain, mode: 'simple' });
    bare.builder._withIterativeFace = (model) => model;

    const model = detail(faced.builder);
    assert.deepEqual(model, detail(bare.builder));
    assert.ok(!('iterative' in model));
    assert.equal(faced.craftingRunManager.reads, bare.craftingRunManager.reads);
  });

  it('reads the actor’s runs exactly once more for an iterative recipe', () => {
    const iterative = makeBuilder({ recipe: recipeOf(), runs: [runOf()] });
    const bare = makeBuilder({ recipe: recipeOf(), runs: [runOf()] });
    bare.builder._withIterativeFace = (model) => model;
    detail(iterative.builder);
    detail(bare.builder);
    assert.equal(iterative.craftingRunManager.reads, bare.craftingRunManager.reads + 1);
  });

  it('labels the mode "Iterative", not the simple fallback', () => {
    const { builder } = makeBuilder({ recipe: recipeOf() });
    assert.equal(detail(builder).modeLabel, 'Iterative');
  });

  it('projects the goal before a workpiece exists, the hidden counter’s rules dropped', () => {
    const { builder } = makeBuilder({ recipe: recipeOf() });
    const { iterative } = detail(builder);
    assert.equal(iterative.workpiece, null);
    assert.deepEqual(iterative.goal, {
      succeeds: 'Shape ≥ 60',
      fails: 'Integrity ≤ 0',
      produces: 'Longsword, Blade blank ×2',
    });
    assert.ok(!JSON.stringify(iterative).includes('Qzx-Hidden-Fit'));
  });

  it('shows a GM the hidden counter’s rules in the goal', () => {
    const { builder } = makeBuilder({ recipe: recipeOf() });
    const { goal } = detail(builder, GM).iterative;
    assert.equal(goal.succeeds, 'Shape ≥ 60 and Qzx-Hidden-Fit ≥ 3');
    assert.equal(goal.fails, 'Integrity ≤ 0 or Qzx-Hidden-Fit ≤ 0');
  });

  it('projects the first active run as the workpiece, with only the counters the viewer may see', () => {
    const { builder } = makeBuilder({ recipe: recipeOf(), runs: [runOf()] });
    const { workpiece } = detail(builder).iterative;
    assert.deepEqual(workpiece, {
      runId: 'run-1',
      stepIndex: 0,
      stepName: 'Rough out the blade',
      stepCount: 2,
      counters: [
        { counterId: 'shape', label: 'Shape', value: 20 },
        { counterId: 'integrity', label: 'Integrity', value: 8 },
      ],
      nextSession: 4,
    });
    const text = JSON.stringify(detail(builder).iterative);
    assert.ok(
      !text.includes('Qzx-Hidden-Fit') && !text.includes('7731') && !text.includes('secret')
    );
    const seen = detail(builder, GM).iterative.workpiece.counters.map((row) => row.counterId);
    assert.deepEqual(seen, ['shape', 'integrity', 'secret'], 'a GM sees every counter');
  });

  it('continues the first of several active runs of the recipe, and ignores another recipe’s', () => {
    const other = { ...runOf(), id: 'run-other', recipeId: 'recipe-2' };
    const first = runOf();
    const second = { ...runOf(), id: 'run-2' };
    const { builder } = makeBuilder({ recipe: recipeOf(), runs: [other, first, second] });
    assert.equal(detail(builder).iterative.workpiece.runId, 'run-1');
  });

  it('names no next session at a step boundary, and the step the run is parked on', () => {
    const boundary = {
      ...runOf({ currentStepIndex: 1 }),
      steps: [
        {
          stepName: STEPS[0].name,
          status: 'succeeded',
          iterative: {
            ...stateAt({ shape: 60, integrity: 8, secret: 7731 }, 2),
            terminal: { kind: 'success', attempt: 2, resultGroupId: null },
          },
        },
        { stepName: STEPS[1].name, status: 'inProgress' },
      ],
    };
    const { builder } = makeBuilder({ recipe: recipeOf(), runs: [boundary] });
    const { workpiece } = detail(builder).iterative;
    assert.equal(workpiece.stepIndex, 1);
    assert.equal(workpiece.stepName, 'Draw out the edge');
    assert.equal(workpiece.nextSession, null);
    assert.deepEqual(
      workpiece.counters.map((row) => row.counterId),
      ['shape', 'integrity']
    );
  });

  it('still continues a run whose state this release cannot read, stating no counters or session', () => {
    const future = runOf({ state: { ...stateAt({ shape: 1 }, 1), version: 99 } });
    const { builder } = makeBuilder({ recipe: recipeOf(), runs: [future] });
    const { workpiece } = detail(builder).iterative;
    assert.equal(workpiece.runId, 'run-1');
    assert.deepEqual(workpiece.counters, []);
    assert.equal(workpiece.nextSession, null);
  });

  it('reads no run with no crafting actor, rather than throwing', () => {
    const { builder, craftingRunManager } = makeBuilder({ recipe: recipeOf(), runs: [runOf()] });
    const model = builder.buildRecipeDetail({
      recipeId: 'recipe-1',
      craftingActor: null,
      viewer: GM,
    });
    assert.equal(model.iterative.workpiece, null);
    assert.equal(craftingRunManager.reads, 0);
  });

  it('reads the runs of the crafting actor it was given', () => {
    const { builder, craftingRunManager } = makeBuilder({ recipe: recipeOf(), runs: [runOf()] });
    detail(builder);
    assert.ok(craftingRunManager.actors.length > 0);
    assert.ok(craftingRunManager.actors.every((actor) => actor === ACTOR));
  });

  it('passes a redacted teaser through unread, with no iterative face', () => {
    const faced = makeBuilder({ recipe: recipeOf(), runs: [runOf()] });
    const bare = makeBuilder({ recipe: recipeOf(), runs: [runOf()] });
    faced.builder.recipeVisibility = { evaluateRecipeAccess: TEASER };
    bare.builder.recipeVisibility = { evaluateRecipeAccess: TEASER };
    bare.builder._withIterativeFace = (model) => model;
    const model = detail(faced.builder);
    assert.equal(model.redaction.redacted, true);
    assert.ok(!('iterative' in model));
    assert.equal(faced.craftingRunManager.reads, bare.craftingRunManager.reads);
  });

  it('drops a counter a step hides from the goal and the workpiece, for a player only', () => {
    const steps = [stepOf('only', { hidden: ['integrity'] })];
    const { builder } = makeBuilder({ recipe: recipeOf({ steps }), runs: [runOf({ steps })] });
    const player = detail(builder).iterative;
    assert.ok(!player.goal.fails.includes('Integrity'));
    assert.deepEqual(
      player.workpiece.counters.map((row) => row.counterId),
      ['shape']
    );
    const gm = detail(builder, GM).iterative;
    assert.match(gm.goal.fails, /Integrity/u);
    assert.deepEqual(
      gm.workpiece.counters.map((row) => row.counterId),
      ['shape', 'integrity', 'secret']
    );
  });

  it('hides at a boundary the counters the focus step hides, not the current step', () => {
    const steps = [stepOf('first', { hidden: ['shape'] }), stepOf('second')];
    const boundary = {
      ...runOf({ steps }),
      currentStepIndex: 1,
      steps: [
        { stepName: 'first', iterative: stateAt({ shape: 9, integrity: 4 }, 1) },
        { stepName: 'second' },
      ],
    };
    const { builder } = makeBuilder({ recipe: recipeOf({ steps }), runs: [boundary] });
    assert.deepEqual(
      detail(builder).iterative.workpiece.counters.map((row) => row.counterId),
      ['integrity']
    );
  });

  it('names each produced component once, an unknown one by the fallback', () => {
    const results = [
      { componentId: 'c1', quantity: 1 },
      { componentId: 'c1', quantity: 1 },
      { componentId: 'gone', quantity: 1 },
    ];
    const steps = [stepOf('only', { results })];
    const { builder } = makeBuilder({ recipe: recipeOf({ steps }) });
    assert.equal(
      detail(builder).iterative.goal.produces,
      `Longsword, ${localize('FABRICATE.Labels.UnknownComponent')}`
    );
  });

  it('reads the produced names off the recipe itself when it has no steps', () => {
    const recipe = {
      ...recipeOf({ steps: [] }),
      resultGroups: [{ id: 'g', name: 'G', results: [{ componentId: 'c2', quantity: 1 }] }],
    };
    const { builder } = makeBuilder({ recipe });
    assert.equal(detail(builder).iterative.goal.produces, 'Blade blank');
  });

  it('names the step from the run’s accepted terms, not the default the run recorded', () => {
    const run = runOf();
    run.steps[0].stepName = 'Step 1';
    const { builder } = makeBuilder({ recipe: recipeOf(), runs: [run] });
    assert.equal(detail(builder).iterative.workpiece.stepName, 'Rough out the blade');
  });

  it('names no step for a stepless recipe, whatever default the run recorded', () => {
    const run = runOf({ steps: [] });
    delete run.termsSnapshot.recipe.steps; // A stepless recipe serializes no steps at all.
    run.steps = [{ stepName: 'Step 1', status: 'inProgress', iterative: stateAt({ shape: 1 }, 0) }];
    const { builder } = makeBuilder({ recipe: recipeOf({ steps: [] }), runs: [run] });
    assert.equal(detail(builder).iterative.workpiece.stepName, '');
  });

  it('names the step from the run itself when it carries no accepted terms', () => {
    const run = { ...runOf(), termsSnapshot: { iterative: clone(LIBRARY) } };
    const { builder } = makeBuilder({ recipe: recipeOf(), runs: [run] });
    assert.equal(detail(builder).iterative.workpiece.stepName, 'Rough out the blade');
  });

  it('names no next session once the current step has reached its end', () => {
    const ended = runOf({
      state: {
        ...stateAt({ shape: 60, integrity: 8, secret: 1 }, 2),
        terminal: { kind: 'success', attempt: 2, resultGroupId: null },
      },
    });
    const { builder } = makeBuilder({ recipe: recipeOf(), runs: [ended] });
    assert.equal(detail(builder).iterative.workpiece.nextSession, null);
  });
});

describe('CraftingListingBuilder — an iterative row in progress (issue 3011)', () => {
  /** The listing pass over `recipes`, each visible under `reason`. */
  function listing({ recipes, runs = [], mode = 'iterative', reason = 'ok', actor = ACTOR }) {
    const made = makeBuilder({ recipe: recipes[0], runs, mode });
    made.builder.recipeVisibility.getVisibleRecipes = () =>
      recipes.map((recipe) => ({ recipe, access: { visible: true, reason } }));
    const { summaries } = made.builder.buildListing({ craftingActor: actor, viewer: PLAYER });
    return { summaries, reads: made.craftingRunManager.reads };
  }
  const second = { ...recipeOf(), id: 'recipe-2', name: 'Forge a Spear' };

  it('marks the row of a recipe whose workpiece is in progress, reading the runs once a pass', () => {
    const { summaries, reads } = listing({ recipes: [recipeOf(), second], runs: [runOf()] });
    assert.deepEqual(
      summaries.map((row) => [row.id, row.inProgress]),
      [
        ['recipe-1', true],
        ['recipe-2', false],
      ]
    );
    assert.equal(reads, 1);
  });

  it('marks no row, and reads nothing, for a teaser, another mode or no actor', () => {
    for (const options of [{ reason: 'teaser' }, { mode: 'simple' }, { actor: null }]) {
      const { summaries, reads } = listing({ recipes: [recipeOf()], runs: [runOf()], ...options });
      assert.equal(summaries[0].inProgress, false, JSON.stringify(options));
      assert.equal(reads, 0, JSON.stringify(options));
    }
  });

  it('marks no row whose first run of the recipe is not an iterative one', () => {
    const plain = { id: 'run-0', recipeId: 'recipe-1', status: 'inProgress', steps: [{}] };
    const { summaries } = listing({ recipes: [recipeOf()], runs: [plain, runOf()] });
    assert.equal(summaries[0].inProgress, false);
  });
});
