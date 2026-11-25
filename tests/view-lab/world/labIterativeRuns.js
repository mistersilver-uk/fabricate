/**
 * The iterative workbench's lab world (issue 3011): the Ironworks `workpiece` library, its three
 * recipes, the runs each `iterative-*` Journal state persists, and the controller that answers the
 * Journal's commands against them. Everything here is seeded only for a frame that names
 * `iterative: 'workpiece'`, so no existing frame changes.
 */
import { buildAttemptLibrary } from '../../../src/systems/iterative/attemptLibrary.js';
import { prepareIterativeStepStart } from '../../../src/systems/iterative/iterativeStepStart.js';
import {
  appendAttemptEntry,
  archiveRunTerms,
  createIterativeStepState,
  readIterativeStepState,
  recordAttemptOnRun,
} from '../../../src/systems/iterative/iterativeStepState.js';
import { iterativeTermsEntry } from '../../../src/systems/iterative/iterativeTerms.js';
import { resolveAttempt } from '../../../src/systems/iterative/resolveAttempt.js';
import { cloneJson } from '../../../src/utils/scalars.js';
import { scriptedRollDie } from '../../helpers/scriptedRollDie.js';

import { stockComponent } from './labActors.js';
import { component, LAB_SYSTEM_IDS, recipe, simpleSet } from './labContent.js';
import { seedFabricateFlag } from './labFlags.js';

const NOW = 1_209_600;
const HOUR = 3600;
const IRONWORKS = LAB_SYSTEM_IDS.IRONWORKS;
const INGOT = 'commodities/metal/ingot-worn-iron.webp';
const SWORD = 'weapons/swords/sword-guard-worn.webp';

const counter = (id, label, extra = {}) => ({ id, label, limit: 'global', ...extra });
const costOf = (id, counterId, amount, needsEnough = true) => ({
  id,
  counterId,
  amount,
  needsEnough,
});
const counterRule = (counterId, op, value) => ({ source: 'counter', counterId, op, value });
const gain = (id, counterId, amount, when = { combine: 'all' }, op = 'add') => ({
  id,
  when,
  target: { kind: 'counter', counterId },
  op,
  amount,
});
const onSuccess = { combine: 'all', success: true };
const action = (id, label, icon, extra) => ({
  id,
  label,
  icon,
  categories: [],
  usesSession: true,
  availability: { combine: 'all', rules: [] },
  costs: [],
  check: 'none',
  effects: [],
  ...extra,
});

/** The sentinel D18 must keep from a viewer who may not see it: its label and its value. */
export const HIDDEN_COUNTER = Object.freeze({
  id: 'qzxHidden',
  label: 'Qzx-Hidden-Fit',
  value: 7731,
});

export const WORKPIECE_LIBRARY = Object.freeze({
  version: 1,
  counters: [
    counter('shape', 'Shape', {
      description: 'How close the blade is to its form.',
      min: 0,
      max: 100,
    }),
    counter('finish', 'Finish', { min: 0, max: 100 }),
    counter('integrity', 'Integrity', {
      description: 'How much the metal can take.',
      min: 0,
      max: 12,
    }),
    counter('heat', 'Heat', { description: 'How hot the iron is.', min: 0, max: 100 }),
    counter(HIDDEN_COUNTER.id, HIDDEN_COUNTER.label, { limit: 'none' }),
  ],
  actions: [
    action('hammer', 'Hammer', 'fas fa-hammer', {
      description: 'Draw the metal out.',
      check: 'roll',
      availability: { combine: 'all', rules: [counterRule('integrity', '>=', 2)] },
      costs: [costOf('wear', 'integrity', '2'), costOf('cool', 'heat', '10', false)],
      effects: [gain('draw', 'shape', '10', onSuccess)],
    }),
    action('planish', 'Planish', 'fas fa-gavel', {
      description: 'Even the surface with light blows.',
      check: 'roll',
      costs: [costOf('rest', 'heat', '50')],
      effects: [gain('smooth', 'shape', '6', onSuccess)],
    }),
    action('stoke', 'Stoke the forge', 'fas fa-fire', {
      description: 'Feed the fire.',
      effects: [
        gain('warm', 'heat', '25'),
        gain(
          'scorch',
          'integrity',
          '1',
          {
            combine: 'all',
            rules: [counterRule('heat', '>=', 30)],
          },
          'subtract'
        ),
      ],
    }),
    action('normalise', 'Normalise', 'fas fa-temperature-low', {
      description: 'Relax the stress in the steel.',
      availability: { combine: 'all', rules: [counterRule('shape', '>=', 40)] },
      costs: [costOf('soak', 'heat', '30')],
      effects: [gain('relax', 'integrity', '3')],
    }),
    action('fitHilt', 'Fit the hilt', 'fas fa-shield-halved', {
      description: 'Seat the hilt on the tang.',
      usesSession: false,
      effects: [gain('seat', 'finish', '15')],
    }),
  ],
});

/** Failure, Success and Great Success, each from a lower bound on a d20. */
export const WORKPIECE_CHECK = Object.freeze({
  type: 'fixed',
  rollFormula: '1d20',
  fixedOutcomes: [
    { id: 'failure', name: 'Failure', success: false, start: 1 },
    { id: 'success', name: 'Success', success: true, start: 10 },
    { id: 'greatSuccess', name: 'Great Success', success: true, start: 20 },
  ],
});

const WORKPIECE_COMPONENTS = [
  component('iw-iron-bar', 'Iron bar', INGOT, { categories: ['Stock'] }),
  component('iw-longsword', 'Longsword', SWORD, { categories: ['Stock'] }),
  component('iw-blade-blank', 'Blade blank', INGOT, { categories: ['Stock'] }),
  component('iw-spearhead', 'Spearhead', SWORD, { categories: ['Stock'] }),
  component('iw-slag', 'Slag', INGOT, { categories: ['Stock'] }),
];

/** Every step takes one iron bar, which a world that seeds the workpiece hands each actor. */
const barSet = () => simpleSet('s1', { 'iw-iron-bar': 1 });
const instance = (counterId, start, extra = {}) => ({ counterId, start, visible: true, ...extra });
const stepConfig = (success, extra = {}) => ({
  actions: { mode: 'all', actionIds: [] },
  hiddenCounterIds: [],
  lockedCounterIds: [],
  success,
  failure: [counterRule('integrity', '<=', 0)],
  ...extra,
});
const group = (id, name, componentId, producedWhen, extra = {}) => ({
  id,
  name,
  results: [{ componentId, quantity: 1 }],
  producedWhen,
  ...extra,
});
const hidden = () => instance(HIDDEN_COUNTER.id, HIDDEN_COUNTER.value, { visible: false });
const forge = (id, name, config) =>
  recipe(id, name, IRONWORKS, INGOT, { categories: ['Forging'], ...config });

export const WORKPIECE_RECIPES = Object.freeze([
  // Step 1 has no routes; step 2 has a banded group, an empty-rules group and a failure group.
  forge('iw-r-longsword', 'Forge a Longsword', {
    iterative: {
      counters: [
        instance('shape', 0, { target: 100 }),
        instance('integrity', 12),
        instance('heat', 60),
        hidden(),
      ],
    },
    steps: [
      {
        id: 'iw-longsword-rough',
        name: 'Rough out the blade',
        ingredientSets: [barSet()],
        resultGroups: [],
        toolIds: [],
        iterative: stepConfig([counterRule('shape', '>=', 60)]),
      },
      {
        id: 'iw-longsword-edge',
        name: 'Draw out the edge',
        ingredientSets: [barSet()],
        toolIds: [],
        resultGroups: [
          group('iw-edge-fine', 'Fine edge', 'iw-longsword', [
            { end: 'success', rules: [counterRule('integrity', '>=', 8)] },
          ]),
          group('iw-edge-plain', 'Plain edge', 'iw-blade-blank', [{ end: 'success', rules: [] }]),
          group('iw-edge-slag', 'Slag', 'iw-slag', [{ end: 'failure', rules: [] }], {
            role: 'failure',
          }),
        ],
        iterative: stepConfig([counterRule('shape', '>=', 100)]),
      },
    ],
  }),
  forge('iw-r-spear', 'Forge a Spear', {
    ingredientSets: [barSet()],
    resultGroups: [
      group('iw-spear-fine', 'Spearhead', 'iw-spearhead', [{ end: 'success', rules: [] }]),
      group('iw-spear-slag', 'Slag', 'iw-slag', [{ end: 'failure', rules: [] }], {
        role: 'failure',
      }),
    ],
    iterative: {
      counters: [
        instance('shape', 0),
        instance('finish', 0),
        instance('integrity', 12),
        instance('heat', 60),
      ],
      step: stepConfig([counterRule('finish', '>=', 100)]),
    },
  }),
  forge('iw-r-veiled', 'Qzx-Secret-Recipe', {
    iterative: {
      counters: [instance('shape', 0), instance('integrity', 12), instance('heat', 60), hidden()],
    },
    steps: [
      {
        id: 'iw-veiled-step',
        name: 'Qzx-Secret-Step',
        ingredientSets: [barSet()],
        resultGroups: [],
        toolIds: [],
        iterative: stepConfig([counterRule('shape', '>=', 60)]),
      },
    ],
  }),
]);

/** Adds the workpiece components, recipes and vocabulary to a freshly seeded Ironworks. */
export function installWorkpieceWorld(content, system) {
  const components = structuredClone(WORKPIECE_COMPONENTS);
  system.components = components;
  system.componentCategories = ['Stock'];
  system.features = { ...system.features, multiStepRecipes: true };
  content.components.push(...structuredClone(components));
  content.recipes.push(...structuredClone(WORKPIECE_RECIPES));
}

const WORKPIECE_RECIPE_BY_ID = new Map(WORKPIECE_RECIPES.map((entry) => [entry.id, entry]));
const WORKPIECE_SYSTEM = Object.freeze({
  resolutionMode: 'iterative',
  iterative: WORKPIECE_LIBRARY,
});
const PROBE_RECIPE_ID = 'iw-r-spear';

/** The world's per-state edits that need more than the library: who knows what, and cancel refunds. */
export function seedWorkpieceJourney(content, actors, iterative, journalCaseState) {
  if (iterative !== 'workpiece') return;
  stockComponent(content, actors, 'iw-iron-bar', 6);
  const system = content.systems.find((entry) => entry.id === IRONWORKS);
  if (journalCaseState === 'iterative-redacted') {
    // The veiled recipe stays unlearned, so the player is shown a protected run of it.
    system.visibilityMode = 'knowledge';
    for (const actor of actors) {
      seedFabricateFlag(actor, ['fabricate', 'learnedRecipes'], {
        ...actor.flags?.fabricate?.fabricate?.learnedRecipes,
        ...Object.fromEntries(
          ['iw-r-longsword', PROBE_RECIPE_ID].map((id) => [
            id,
            { sourceItemUuid: null, learnedAt: NOW - 100 * HOUR },
          ])
        ),
      });
    }
  }
  if (journalCaseState === 'iterative-cancel') {
    system.features = { ...system.features, refundOnPlayerCancel: false };
  }
}

// ── runs ────────────────────────────────────────────────────────────────────

const BAR_SNAPSHOT = Object.freeze({
  id: 's1',
  ingredientGroups: [
    {
      id: 's1-g1',
      options: [{ match: { type: 'component', componentId: 'iw-iron-bar' }, quantity: 1 }],
    },
  ],
});

const CONSUMED = Object.freeze({
  selectedIngredientSetId: null,
  currencySpends: [],
  resolvedEssences: {},
  essenceEnabled: {},
  consumedSummary: [],
});

const startRow = ({ counterId, value }) => ({
  counterId,
  value,
  formulaValue: null,
  rolls: [],
  clamped: false,
});

const rowsOf = (values) =>
  Object.entries(values).map(([counterId, value]) => ({ counterId, value }));
const SESSIONLESS = new Set(['fitHilt']);

/**
 * One persisted step state: `values` are the final counters, `log` the entries as
 * `[actionId, check | null, paid, changed]`, and `compacted` the folded older ones.
 */
function stepState({ start, values, log = [], compacted = null, version = 1 }, runId) {
  const base = createIterativeStepState({
    counters: rowsOf(start ?? values),
    startedWith: rowsOf(start ?? values).map(startRow),
  });
  const folded = (compacted?.attempts ?? 0) + log.length;
  const sessionsOf = (rows) => rows.filter(([actionId]) => !SESSIONLESS.has(actionId)).length;
  let state = {
    ...base,
    counters: rowsOf(values),
    attemptCount: folded,
    sessionCount: (compacted?.sessions ?? 0) + sessionsOf(log),
    compacted,
  };
  let session = compacted?.sessions ?? 0;
  for (const [index, [actionId, check, paid, changed]] of log.entries()) {
    const sessionNumber = SESSIONLESS.has(actionId) ? null : (session += 1);
    const entry = {
      attempt: (compacted?.attempts ?? 0) + index + 1,
      sessionNumber,
      actionId,
      check,
      rolls: [],
      paid,
      changed,
    };
    state = appendAttemptEntry(state, entry, `iw-fixed-${runId}-${entry.attempt}`);
  }
  return { ...state, version };
}

const HIT = { success: true, outcomeId: 'success', value: 14 };
const MISS = { success: false, outcomeId: 'failure', value: 7 };
const HAMMERED = (check, shape) => [
  'hammer',
  check,
  [
    { counterId: 'integrity', delta: -2 },
    { counterId: 'heat', delta: -10 },
  ],
  check.success ? [{ counterId: 'shape', delta: shape }] : [],
];
const STOKED = [
  'stoke',
  null,
  [],
  [
    { counterId: 'heat', delta: 25 },
    { counterId: 'integrity', delta: -1 },
  ],
];

const stepRecord = (recipeJson, index, status, extra = {}) => {
  const authored = recipeJson.steps?.[index];
  return {
    index,
    status,
    stepId: authored?.id ?? 'implicit-step',
    stepName: authored?.name ?? 'Step 1',
    ...(status !== 'pending' && {
      startedAt: NOW - (4 - index) * HOUR,
      updatedAt: NOW - HOUR,
    }),
    consumedIngredients: [],
    usedTools: [],
    createdResults: [],
    selectedIngredientSetId: BAR_SNAPSHOT.id,
    selectedRequirementSnapshot: cloneJson(BAR_SNAPSHOT),
    selectionPlan: { selectedIngredientSetId: BAR_SNAPSHOT.id, ingredientOptionOverrides: {} },
    ...extra,
  };
};

/** What the start commit spent: the one bar the step's set names. */
const consumed = (stepId) => ({
  ...cloneJson(CONSUMED),
  selectedIngredientSetId: BAR_SNAPSHOT.id,
  consumedSummary: [
    {
      itemUuid: `Item.lab-consumed-${stepId}-0`,
      actorUuid: null,
      quantity: 1,
      name: 'Iron bar',
      img: null,
      componentId: 'iw-iron-bar',
    },
  ],
});

const startedRecord = (recipeJson, index, state, extra = {}) =>
  stepRecord(recipeJson, index, 'inProgress', {
    preparedConsumption: consumed(recipeJson.steps?.[index]?.id ?? 'implicit-step'),
    iterative: state,
    ...extra,
  });

const doneRecord = (recipeJson, index, state) =>
  stepRecord(recipeJson, index, 'succeeded', {
    completedAt: NOW - 2 * HOUR,
    preparedConsumption: consumed(recipeJson.steps?.[index]?.id ?? 'implicit-step'),
    iterative: {
      ...state,
      terminal: { kind: 'success', attempt: state.attemptCount, resultGroupId: null },
    },
  });

function workpieceRun(context, id, recipeId, steps, extra = {}) {
  const recipeJson = WORKPIECE_RECIPE_BY_ID.get(recipeId);
  return {
    id,
    actorUuid: context.actorUuid,
    userId: context.userId,
    craftingSystemId: IRONWORKS,
    recipeId,
    status: 'inProgress',
    startedAt: NOW - 4 * HOUR,
    updatedAt: NOW - HOUR,
    currentStepIndex: 0,
    steps,
    componentSourceActorUuids: [context.actorUuid],
    lifecycleVersion: 1,
    runRevision: 3,
    completionMode: 'manual',
    pausedDurationSeconds: 0,
    termsSnapshot: {
      recipe: cloneJson(recipeJson),
      craftingCheck: { enabled: true, routed: cloneJson(WORKPIECE_CHECK) },
      ...iterativeTermsEntry(recipeJson, WORKPIECE_SYSTEM),
    },
    ...extra,
  };
}

const LONGSWORD = WORKPIECE_RECIPE_BY_ID.get('iw-r-longsword');
const SPEAR = WORKPIECE_RECIPE_BY_ID.get('iw-r-spear');
const VEILED = WORKPIECE_RECIPE_BY_ID.get('iw-r-veiled');
const VISIBLE = { qzxHidden: HIDDEN_COUNTER.value };

/** A longsword in step 1, started, with the counters and log the state asks for. */
function longsword(context, id, { values, log = [], compacted = null, ...extra } = {}) {
  const start = { shape: 0, integrity: 12, heat: 60, ...VISIBLE };
  const state = stepState({ start, values: { ...start, ...values }, log, compacted }, id);
  return workpieceRun(
    context,
    id,
    'iw-r-longsword',
    [startedRecord(LONGSWORD, 0, state), stepRecord(LONGSWORD, 1, 'pending')],
    extra
  );
}

/** The longsword once step 1 has succeeded: at its boundary, or started in step 2. */
function longswordStepTwo(context, id, { started = true, values, log = [], ...extra } = {}) {
  const carried = { shape: 60, integrity: 9, heat: 35, ...VISIBLE };
  const begun = { shape: 0, integrity: 12, heat: 60, ...VISIBLE };
  const first = stepState({ start: begun, values: carried, log: [HAMMERED(HIT, 10)] }, `${id}-1`);
  const steps = [doneRecord(LONGSWORD, 0, first)];
  if (started) {
    const state = stepState({ start: carried, values: { ...carried, ...values }, log }, id);
    steps.push(startedRecord(LONGSWORD, 1, state));
  } else steps.push(stepRecord(LONGSWORD, 1, 'inProgress'));
  return workpieceRun(context, id, 'iw-r-longsword', steps, { currentStepIndex: 1, ...extra });
}

function spear(context, id, { values, log = [], ...extra } = {}) {
  const start = { shape: 0, finish: 0, integrity: 12, heat: 60 };
  const state = stepState({ start, values: { ...start, ...values }, log }, id);
  return workpieceRun(context, id, 'iw-r-spear', [startedRecord(SPEAR, 0, state)], extra);
}

function veiled(context, id) {
  const start = { shape: 0, integrity: 12, heat: 60, ...VISIBLE };
  const state = stepState({ start, values: { ...start, shape: 10 }, log: [HAMMERED(HIT, 10)] }, id);
  return workpieceRun(context, id, 'iw-r-veiled', [startedRecord(VEILED, 0, state)]);
}

const flags = (active = [], history = []) => ({
  craftingRuns: {
    active: Object.fromEntries(active.map((run) => [run.id, run])),
    history,
  },
  salvageRuns: { active: {}, history: [] },
  gatheringRuns: { active: {}, history: [] },
});

const READY = {
  values: { shape: 20, integrity: 8, heat: 45 },
  log: [HAMMERED(HIT, 10), STOKED, HAMMERED(MISS, 0)],
};

/** A run driven to its step end by the same resolver the controller uses, then archived. */
function archived(context, build, id, press) {
  const container = flags([build(context, id)]);
  const run = container.craftingRuns.active[id];
  applyAttempt({ container: container.craftingRuns, run, now: NOW - 2 * HOUR, ...press });
  return container.craftingRuns.history[0];
}

function libraryRuns(context) {
  const ready = longsword(context, 'iw-run-longsword', READY);
  const boundary = longswordStepTwo(context, 'iw-run-boundary', { started: false });
  const rest = spear(context, 'iw-run-spear', { values: { shape: 30 }, log: [HAMMERED(HIT, 10)] });
  const failed = archived(
    context,
    (ctx, id) =>
      longsword(ctx, id, { values: { shape: 20, integrity: 2 }, log: [HAMMERED(HIT, 10)] }),
    'iw-run-failed',
    { actionId: 'hammer', attemptId: 'iw-fixed-failed', check: HIT }
  );
  const made = archived(
    context,
    (ctx, id) => spear(ctx, id, { values: { finish: 90 }, log: [STOKED] }),
    'iw-run-made',
    { actionId: 'fitHilt', attemptId: 'iw-fixed-made', check: null }
  );
  return flags([ready, boundary, rest], [failed, made]);
}

const only = (run) => flags([run]);

/** Each `iterative-*` Journal state: the run its frame selects, and the persisted world around it. */
export const ITERATIVE_SCENARIOS = Object.freeze({
  'iterative-list': { runId: 'iw-run-longsword', build: libraryRuns },
  'iterative-history': { runId: 'iw-run-failed', build: libraryRuns },
  'iterative-record': { runId: 'iw-run-made', build: libraryRuns },
  'iterative-resume': {
    runId: 'iw-run-longsword',
    build: (c) => only(longsword(c, 'iw-run-longsword', READY)),
  },
  'iterative-idle': {
    runId: 'iw-run-longsword',
    build: (c) => flags([longsword(c, 'iw-run-longsword', READY), spear(c, 'iw-run-spear')]),
  },
  'iterative-fresh': {
    runId: 'iw-run-longsword',
    build: (c) => only(longsword(c, 'iw-run-longsword')),
  },
  'iterative-cards': {
    runId: 'iw-run-longsword',
    build: (c) => only(longsword(c, 'iw-run-longsword', { values: { heat: 40 }, log: [STOKED] })),
  },
  'iterative-no-action': {
    runId: 'iw-run-longsword',
    build: (c) => {
      const run = longsword(c, 'iw-run-longsword', READY);
      // Only actions this piece can never take: one unmet, one that names a counter it lacks.
      run.termsSnapshot.recipe.steps[0].iterative.actions = {
        mode: 'only',
        actionIds: ['normalise', 'fitHilt'],
      };
      return only(run);
    },
  },
  ...Object.fromEntries(
    [
      'result',
      'result-nocheck',
      'busy',
      'unanswered',
      'throw',
      'stale',
      'error',
      'refusal-cost-unaffordable',
      'refusal-action-unavailable',
      'refusal-unknown-counter',
      'step-done',
    ].map((suffix) => [
      `iterative-${suffix}`,
      {
        runId: 'iw-run-longsword',
        build: (c) =>
          only(
            longsword(c, 'iw-run-longsword', {
              values:
                suffix === 'step-done' ? { shape: 55, integrity: 8 } : { shape: 20, integrity: 12 },
              log: [HAMMERED(HIT, 10)],
            })
          ),
      },
    ])
  ),
  'iterative-starting': {
    runId: 'iw-run-boundary',
    build: (c) => only(longswordStepTwo(c, 'iw-run-boundary', { started: false })),
  },
  'iterative-begin-stale': {
    runId: 'iw-run-boundary',
    build: (c) => only(longswordStepTwo(c, 'iw-run-boundary', { started: false })),
  },
  'iterative-step-started': {
    runId: 'iw-run-boundary',
    build: (c) => only(longswordStepTwo(c, 'iw-run-boundary', { started: false })),
  },
  'iterative-routes': {
    runId: 'iw-run-longsword',
    build: (c) =>
      only(
        longswordStepTwo(c, 'iw-run-longsword', {
          values: { shape: 80, integrity: 9 },
          log: [HAMMERED(HIT, 10)],
        })
      ),
  },
  'iterative-finished': {
    runId: 'iw-run-spear',
    build: (c) =>
      only(
        spear(c, 'iw-run-spear', { values: { finish: 90, shape: 40 }, log: [HAMMERED(HIT, 10)] })
      ),
  },
  'iterative-failed': {
    runId: 'iw-run-longsword',
    build: (c) =>
      only(
        longswordStepTwo(c, 'iw-run-longsword', {
          values: { shape: 40, integrity: 2 },
          log: [HAMMERED(HIT, 10)],
        })
      ),
  },
  'iterative-failed-nothing': {
    runId: 'iw-run-longsword',
    build: (c) =>
      only(
        longsword(c, 'iw-run-longsword', {
          values: { shape: 10, integrity: 2 },
          log: [HAMMERED(HIT, 10)],
        })
      ),
  },
  'iterative-cancel': {
    runId: 'iw-run-longsword',
    build: (c) => only(longsword(c, 'iw-run-longsword', READY)),
  },
  'iterative-cancel-single-refund': {
    runId: 'iw-run-spear',
    build: (c) =>
      only(spear(c, 'iw-run-spear', { values: { shape: 30 }, log: [HAMMERED(HIT, 10)] })),
  },
  'iterative-single': {
    runId: 'iw-run-spear',
    build: (c) =>
      only(spear(c, 'iw-run-spear', { values: { shape: 30 }, log: [HAMMERED(HIT, 10)] })),
  },
  'iterative-past-step': {
    runId: 'iw-run-longsword',
    build: (c) =>
      only(
        longswordStepTwo(c, 'iw-run-longsword', { values: { shape: 70 }, log: [HAMMERED(HIT, 10)] })
      ),
  },
  'iterative-future-step': {
    runId: 'iw-run-longsword',
    build: (c) => only(longsword(c, 'iw-run-longsword', READY)),
  },
  'iterative-waiting': {
    runId: 'iw-run-longsword',
    build: (c) => {
      const run = longsword(c, 'iw-run-longsword', READY);
      run.status = 'waitingTime';
      run.steps[0].status = 'waitingTime';
      run.steps[0].timeGate = {
        requiredSeconds: 4 * HOUR,
        initiatedAt: NOW - HOUR,
        availableAt: NOW + 3 * HOUR,
      };
      return only(run);
    },
  },
  'iterative-authority': {
    runId: 'iw-run-longsword',
    build: (c) => only(longsword(c, 'iw-run-longsword', READY)),
  },
  'iterative-unsupported': {
    runId: 'iw-run-longsword',
    build: (c) => only(longsword(c, 'iw-run-longsword', { ...READY, lifecycleVersion: 2 })),
  },
  'iterative-gm': {
    runId: 'iw-run-longsword',
    build: (c) => only(longsword(c, 'iw-run-longsword', READY)),
  },
  'iterative-redacted': { runId: 'iw-run-veiled', build: (c) => only(veiled(c, 'iw-run-veiled')) },
  'iterative-sessions': {
    runId: 'iw-run-longsword',
    build: (c) =>
      only(
        longsword(c, 'iw-run-longsword', {
          values: { shape: 30, integrity: 6, heat: 30 },
          log: Array.from({ length: 8 }, (_, index) =>
            index % 3 === 2 ? STOKED : HAMMERED(index % 2 === 0 ? HIT : MISS, 10)
          ),
          compacted: { attempts: 2, sessions: 2, paid: [], changed: [] },
        })
      ),
  },
  'iterative-narrow': {
    runId: 'iw-run-longsword',
    build: (c) => only(longsword(c, 'iw-run-longsword', READY)),
  },
});

export const isIterativeState = (state) => Object.hasOwn(ITERATIVE_SCENARIOS, state);

/** The run-state factories `labRunStates.js` spreads in: each throws unless the world is `workpiece`. */
export function seedIterativeWorkpieces(context, state) {
  if (context.recipes.every((entry) => entry?.id !== PROBE_RECIPE_ID)) {
    throw new Error(
      `labIterativeRuns: "${state}" needs the lab world seeded with iterative: 'workpiece'`
    );
  }
  return ITERATIVE_SCENARIOS[state].build(context);
}

// ── controller ──────────────────────────────────────────────────────────────

const refusal = (reason, detail = {}) => ({ success: false, reason, detail, message: reason });
const bump = (run) => {
  run.runRevision = Math.max(0, Number(run.runRevision) || 0) + 1;
};

/** The scripted check a state answers a roll with; a rolled action reads one outcome per state. */
const scriptedCheck = (state) => (state === 'iterative-result' ? MISS : HIT);

function groupResults(run, stepIndex, groupId) {
  const authored = run.termsSnapshot.recipe.steps?.[stepIndex] ?? run.termsSnapshot.recipe;
  const found = (authored.resultGroups ?? []).find((entry) => entry.id === groupId);
  const names = new Map(WORKPIECE_COMPONENTS.map((entry) => [entry.id, entry]));
  return (found?.results ?? []).map(({ componentId, quantity }) => ({
    actorUuid: run.actorUuid,
    componentId,
    quantity,
    name: names.get(componentId)?.name,
    img: names.get(componentId)?.img,
  }));
}

function finishRun({ container, run, status, now }) {
  delete container.active[run.id];
  run.status = status;
  run.finishedAt = now;
  bump(run);
  archiveRunTerms(run);
  container.history.unshift(run);
}

/** Settles a step end the way the engine does: the next step, unstarted, or the run's archive. */
function settleTerminal({ container, run, stepIndex, terminal, now }) {
  const step = run.steps[stepIndex];
  const succeeded = terminal.kind === 'success';
  step.status = succeeded ? 'succeeded' : 'failed';
  step.completedAt = now;
  step.createdResults = groupResults(run, stepIndex, terminal.resultGroupId);
  if (!succeeded) step.failureReason = 'iterativeFailure';
  if (succeeded && run.steps[stepIndex + 1]) {
    run.currentStepIndex = stepIndex + 1;
    run.steps[stepIndex + 1].status = 'inProgress';
    return;
  }
  finishRun({ container, run, status: succeeded ? 'succeeded' : 'failed', now });
}

/**
 * One Iterative Attempt: `resolveAttempt` plus `appendAttemptEntry` on the current step, with a
 * scripted die and check, exactly as the authority persists it.
 */
export function applyAttempt({ container, run, actionId, attemptId, check, now }) {
  const stepIndex = Number(run.currentStepIndex) || 0;
  const read = readIterativeStepState(run.steps[stepIndex]?.iterative);
  if (!read?.supported) return refusal('version-unsupported');
  const terms = run.termsSnapshot;
  const library = buildAttemptLibrary(terms.iterative, terms.recipe, stepIndex);
  const chosen = library.actions.find((entry) => entry.id === actionId);
  if (!chosen) return refusal('action-not-found', { actionId });
  const resolved = resolveAttempt({
    state: read.state,
    action: chosen,
    library,
    rollData: {},
    check: chosen.check === 'roll' ? check : null,
    rollDie: scriptedRollDie([], { fill: 1 }).rollDie,
  });
  if (!resolved.ok) return refusal(resolved.reason, resolved.detail);
  const next = appendAttemptEntry(resolved.next, resolved.entry, attemptId);
  recordAttemptOnRun(run, stepIndex, next, { checked: resolved.entry.check !== null });
  if (resolved.terminal) {
    settleTerminal({ container, run, stepIndex, terminal: resolved.terminal, now });
  } else bump(run);
  return {
    success: true,
    runRevision: run.runRevision,
    iterative: {
      attempt: next.log.at(-1),
      stepEnd: resolved.terminal ? { ...resolved.terminal } : null,
      replayed: false,
    },
  };
}

function takeAction({ state, command, container, run, now, persist }) {
  if (Number(command.expectedRevision) !== Number(run.runRevision ?? 0)) {
    return refusal('stale-run');
  }
  const result = applyAttempt({
    container,
    run,
    now,
    actionId: command.payload?.actionId,
    attemptId: command.payload?.attemptId,
    check: scriptedCheck(state),
  });
  if (result.success) persist();
  return result;
}

/** An iterative `beginStep`: the step state the engine writes at a start, and a bumped revision. */
function beginStep({ run, actor, persist }) {
  const stepIndex = Number(run.currentStepIndex) || 0;
  const prepared = prepareIterativeStepStart({
    run,
    stepIndex,
    actor,
    rollDie: scriptedRollDie([], { fill: 1 }).rollDie,
  });
  if (prepared?.refusal) return prepared.refusal;
  const step = run.steps[stepIndex];
  step.iterative = prepared.state;
  step.preparedConsumption = consumed(step.stepId);
  step.status = 'inProgress';
  step.startedAt = NOW;
  bump(run);
  persist();
  return { success: true };
}

const NEVER = () => new Promise(() => {});

/** The canned answers of the controller states, keyed by state; each is a `takeAction` reply. */
const TAKE_ACTION_REPLIES = Object.freeze({
  'iterative-unanswered': () => refusal('command-timeout'),
  'iterative-error': () => ({ success: false, reason: 'roll-unavailable' }),
  'iterative-refusal-cost-unaffordable': () =>
    refusal('cost-unaffordable', { entryId: 'rest', counterId: 'heat', amount: 50, value: 40 }),
  'iterative-refusal-action-unavailable': () =>
    refusal('action-unavailable', { actionId: 'hammer' }),
  'iterative-refusal-unknown-counter': () => refusal('unknown-counter', { counterId: 'finish' }),
});

/** The one other-window attempt `iterative-stale` leaves behind: a Stoke the pressed card never saw. */
function interleavedStoke({ run, now, persist }) {
  const stepIndex = Number(run.currentStepIndex) || 0;
  const read = readIterativeStepState(run.steps[stepIndex].iterative);
  const entry = {
    attempt: read.state.attemptCount + 1,
    sessionNumber: read.state.sessionCount + 1,
    actionId: 'stoke',
    check: null,
    rolls: [],
    paid: [],
    changed: [{ counterId: 'heat', delta: 25 }],
  };
  const counters = read.state.counters.map((row) =>
    row.counterId === 'heat' ? { ...row, value: Math.min(100, row.value + 25) } : row
  );
  const next = appendAttemptEntry(
    {
      ...read.state,
      counters,
      attemptCount: entry.attempt,
      sessionCount: entry.sessionNumber,
    },
    entry,
    `iw-fixed-other-window-${entry.attempt}`
  );
  recordAttemptOnRun(run, stepIndex, next);
  run.updatedAt = now;
  bump(run);
  persist();
}

/**
 * The reply an `iterative-*` state gives a Journal command, or `undefined` for a command it leaves
 * to the shared fixture (cancel). `persist` writes the containers back onto the actor.
 */
export function iterativeFixtureCommand({ state, command, container, run, now, actor, persist }) {
  if (!isIterativeState(state)) return undefined;
  if (command.action === 'takeAction') {
    if (state === 'iterative-busy') return NEVER();
    if (state === 'iterative-throw') throw new Error('Journal fixture command threw');
    if (state === 'iterative-stale') {
      interleavedStoke({ run, now, persist });
      return refusal('stale-run');
    }
    const canned = TAKE_ACTION_REPLIES[state];
    return canned ? canned() : takeAction({ state, command, container, run, now, persist });
  }
  if (command.action === 'beginStep') {
    if (state === 'iterative-starting') return NEVER();
    if (state === 'iterative-begin-stale') {
      bump(run);
      persist();
      return refusal('stale-run');
    }
    return beginStep({ run, actor, persist });
  }
  return undefined;
}
