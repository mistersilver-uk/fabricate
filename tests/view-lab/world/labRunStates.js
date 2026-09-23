/** Journal run states for the View Lab (issue 901). */

import {
  environmentComposesRecord,
  resolveGatheringCompositionMode,
} from '../../../src/systems/gatheringComposition.js';
import { blindWaitingTaskId } from '../../../src/systems/gatheringEngineInternals.js';

import { CRACKED_ALEMBIC_STAGE_IDS, ICON_BASE, LAB_SYSTEM_IDS } from './labContent.js';
import { LAB_HISTORY_DATA_STATES, historyDataRunSets } from './labHistoryEvidence.js';
import {
  JOURNAL_PROTOTYPE_RECIPES,
  JOURNAL_PROTOTYPE_BINDINGS,
  journalPrototypeRecipeId,
  journalPrototypeMaterial,
  journalPrototypeEssenceSpend,
} from './labJournalPrototype.js';
import { RUN_CONTAINER_PATHS, makeGetFlag, makeSetFlag, seedFabricateFlag } from './labFlags.js';

/** World time the lab pins to; a run's timestamps are relative to it. */
const NOW = 1_209_600;
const HOUR = 3600;

/**
 * The RETAINED execution claim the `claim-retained` fixture leaves on the authority ledger: a pause
 * the lifecycle refused before it wrote anything, whose claim the authority kept because it cannot
 * prove the refusal was pre-write.
 */
export const LAB_RETAINED_CLAIM = Object.freeze({
  claimId: 'lab-retained-claim',
  requestId: 'lab-retained-request',
  requestKind: 'command',
  requestStatus: 'recoveryRequired',
  failureReason: 'operation-failed',
  failureMessage: 'The run is already paused',
  claimedAt: 0,
});

/**
 * Stable run identity selected by each Journal fixture query. A null identity means the state is
 * produced by the lab-only service seam or by operating a real Journal control after mount.
 */
export const LAB_JOURNAL_CASE_STATE_RUN_IDS = Object.freeze({
  'ready-single': 'lab-v1-ready-single',
  'legacy-armed': 'lab-v1-legacy-armed',
  'waiting-auto-eligible': 'lab-v1-waiting-auto-eligible',
  'waiting-open-choice': 'lab-v1-waiting-open-choice',
  'stage-not-started': 'lab-v1-stage-not-started',
  'stage-paid': 'lab-v1-stage-paid',
  'awaiting-choice': 'lab-v1-awaiting-choice',
  'stage-consumed': 'lab-v1-stage-consumed',
  'material-shortage': 'lab-v1-material-shortage',
  'ingredient-route': 'lab-v1-ingredient-route',
  'check-route': 'lab-v1-check-route',
  'essence-shared': 'lab-v1-essence-shared',
  paused: 'lab-v1-paused',
  'cancel-confirmation': 'lab-v1-cancel-confirmation',
  'past-stage': 'lab-v1-stage-browser',
  'future-stage': 'lab-v1-stage-browser',
  'gathering-straight': 'lab-v1-gathering-straight',
  'gathering-d100': 'lab-v1-gathering-d100',
  'gathering-check': 'lab-v1-gathering-check',
  'finished-success': 'lab-v1-finished-success',
  'finished-failure': 'lab-v1-finished-failure',
  'finished-cancelled': 'lab-v1-finished-cancelled',
  'active-page-two': 'lab-v1-active-5',
  'finished-page-two': 'lab-v1-finished-5',
  'filter-paused': 'lab-v1-filter-paused',
  'empty-search': 'lab-v1-ready-single',
  'automatic-completion': 'lab-v1-automatic-completion',
  'automatic-blocker': 'lab-v1-automatic-blocker',
  dismissal: 'lab-v1-dismissal',
  'redacted-owner': 'lab-gathering-blind-waiting',
  alchemy: 'lab-v1-alchemy',
  salvage: 'lab-v1-salvage',
  legacy: 'lab-run-inprogress-single',
  loading: null,
  'error-retry': 'lab-v1-ready-single',
  'no-actor-empty': null,
  'stale-action': 'lab-v1-stale-action',
  'command-timeout': 'lab-v1-command-timeout',
  'authority-unavailable': 'lab-v1-authority-unavailable',
  'roll-cancelled': 'lab-v1-roll-cancelled',
  'unsupported-version': 'lab-unsupported-version',
  'recovery-required': 'lab-v1-recovery-required',
  'claim-retained': 'lab-v1-claim-retained',
  wide: 'lab-v1-wide',
  narrow: 'lab-v1-wide',
  ...Object.fromEntries(
    [
      'history-checked-choice',
      'history-resolution-ingredients',
      'history-resolution-simple',
      'history-checked-ingredients',
      'history-legacy-no-check-failure',
      'history-multi-essence',
      'history-multi-shared-essence',
      'history-multi-success',
      'history-multi-failure',
      'history-cancelled-before',
      'history-cancelled-multi',
      'history-d100-all-hit',
      'history-d100-all-miss',
      'history-gathering-check-failure',
      'history-just-resolved',
      'history-redacted',
      'history-missing-material',
      'history-gm-deleted-recipe',
      'history-failure-awards',
      'current-choice-closed',
      'essence-overshoot',
      'past-routed-stage',
      'future-routed-stage',
      'kind-menu-open',
      'history-settling',
      'history-compact-grid',
      'history-compact-tools',
      ...LAB_HISTORY_DATA_STATES,
    ].map((state) => [state, `lab-v1-${state}`])
  ),
});

/**
 * The in-flight BLIND gathering run (issue 901), and the run id its GM-owned secret is keyed by.
 */
export const LAB_BLIND_GATHERING_RUN_ID = 'lab-gathering-blind-waiting';

/**
 * One step state, matching what `CraftingRunManager` builds per recipe step.
 *
 * @param {number} index Step position.
 * @param {string} status One of pending | inProgress | waitingTime | succeeded | failed.
 * @param {object} [extra] Additional fields (timeGate, lastCheckResult, failureReason).
 * @returns {object} A step state.
 */
function step(index, status, extra = {}) {
  return {
    index,
    status,
    startedAt: status === 'pending' ? undefined : NOW - (3 - index) * HOUR,
    updatedAt: NOW - (3 - index) * HOUR,
    completedAt: ['succeeded', 'failed'].includes(status) ? NOW - (2 - index) * HOUR : undefined,
    timeGate: undefined,
    preparedConsumption: undefined,
    selectedIngredientSetId: undefined,
    lastCheckResult: undefined,
    consumedIngredients: [],
    usedTools: [],
    createdResults: [],
    failureReason: undefined,
    ...extra,
  };
}

/**
 * One crafting run.
 *
 * @param {object} config Run configuration.
 * @returns {object} A persisted-shape crafting run.
 */
function craftingRun({
  id,
  actorUuid,
  userId,
  systemId,
  recipeId,
  status,
  steps,
  finishedAt,
  currentStepIndex = 0,
}) {
  return {
    id,
    actorUuid,
    userId,
    craftingSystemId: systemId,
    recipeId,
    status,
    startedAt: NOW - 4 * HOUR,
    updatedAt: NOW - HOUR,
    finishedAt,
    currentStepIndex,
    steps,
    componentSourceActorUuids: [actorUuid],
  };
}

/**
 * Which environment a blind gathering run is drawn in, and which task it drew.
 *
 * @param {object[]} environments Persisted environment records from `labContent`.
 * @returns {{environment: object, taskId: string}} The blind environment and the task drawn in it.
 */
function resolveBlindDraw(environments) {
  return resolveDraw(environments, (entry) => entry?.selectionMode === 'blind', 'blind-selection');
}

/**
 * The first environment matching `predicate`, and one task it composes.
 *
 * @param {object[]} environments Persisted environment records from `labContent`.
 * @param {Function} predicate Which environment to take.
 * @param {string} description What was being looked for, for the failure message.
 * @param {string|null} [avoid] A task id to pass over when the environment composes another.
 * @returns {{environment: object, taskId: string}} The environment and a task composed in it.
 */
export function resolveDraw(environments, predicate, description, avoid = null) {
  const environment = (environments ?? []).find((entry) => predicate(entry));
  if (!environment) {
    throw new Error(`labRunStates: the lab world declares no ${description} gathering environment`);
  }
  const declaredTaskIds = (key) => {
    const value = environment?.[key];
    return Array.isArray(value) ? value : [];
  };
  const pool = [
    ...new Set([...declaredTaskIds('enabledTaskIds'), ...declaredTaskIds('forcedTaskIds')]),
  ];
  const mode = resolveGatheringCompositionMode(environment);
  const composed = pool.filter((id) =>
    environmentComposesRecord(environment, { id, enabled: true }, 'task', mode, true)
  );
  // `avoid` keeps the completed run off the blind run's drawn task.
  const taskId = composed.find((entry) => entry !== avoid) ?? composed[0];
  if (!taskId) {
    throw new Error(
      `labRunStates: ${description} environment "${environment.id}" composes no task`
    );
  }
  return { environment, taskId };
}

/**
 * The GM-owned secret record for the lab's in-flight blind run (issue 901).
 *
 * @param {object} options Options.
 * @param {object} options.actor The actor the run belongs to.
 * @param {object[]} options.environments Persisted environment records.
 * @param {object[]} options.tasks Persisted gathering library tasks.
 * @returns {object} A `GatheringBlindRunStore` record, keyed by {@link LAB_BLIND_GATHERING_RUN_ID}.
 */
export function buildLabBlindRunSecret({ actor, environments, tasks }) {
  const { environment, taskId } = resolveBlindDraw(environments);
  const task = (tasks ?? []).find((entry) => entry?.id === taskId) ?? null;
  return {
    runId: LAB_BLIND_GATHERING_RUN_ID,
    actorUuid: actor.uuid,
    craftingSystemId: environment.craftingSystemId,
    environmentId: environment.id,
    taskId,
    // `_runtimeSnapshot` embeds the drawn task so a matured run resolves against the environment as
    // it stood at START.
    snapshot: { task, events: [], rules: {}, conditions: environment.conditions ?? {} },
    createdAtWorldTime: NOW - HOUR,
  };
}

/**
 * Build every journal state the smoke captures, for one actor and a set of real recipe ids.
 *
 * @param {object} options Options.
 * @param {object} options.actor The actor the runs belong to.
 * @param {string} options.userId Owning user id.
 * @param {Array<{id: string, craftingSystemId: string, steps?: unknown[]}>} options.recipes Real
 * recipes.
 * @param {object[]} options.environments Real gathering environments, for the blind run below.
 * @param {object[]} [options.tasks] Real gathering tasks.
 * @param {string|null} [options.journalCaseState] Focused persisted state selected by View Lab.
 * @returns {{craftingRuns: object, salvageRuns: object, gatheringRuns: object}} Flag containers.
 */
export function buildLabRunStates({
  actor,
  userId,
  recipes,
  environments,
  tasks = [],
  journalCaseState = null,
}) {
  const actorUuid = actor.uuid;
  const multiStep = recipes.find((recipe) => (recipe.steps?.length ?? 0) > 1) ?? recipes[0];
  const single = recipes.find((recipe) => (recipe.steps?.length ?? 0) <= 1) ?? recipes[0];
  const pick = (index) => recipes[index % recipes.length] ?? recipes[0];

  if (
    recipes.some((recipe) => recipe.id === journalPrototypeRecipeId('cord')) &&
    Object.hasOwn(JOURNAL_PROTOTYPE_BINDINGS, journalCaseState)
  ) {
    return prototypeContainers(
      { actor, actorUuid, userId, recipes, environments, tasks },
      journalCaseState
    );
  }

  if (journalCaseState && !['legacy', 'redacted-owner'].includes(journalCaseState)) {
    return buildJournalCaseContainers({
      state: journalCaseState,
      actor,
      userId,
      recipes,
      environments,
      tasks,
      defaults: null,
    });
  }

  const active = {};
  const history = [];

  const add = (run, terminal) => {
    if (terminal) history.push(run);
    else active[run.id] = run;
  };

  // ── active ────────────────────────────────────────────────────────────────
  add(
    craftingRun({
      id: 'lab-run-inprogress-single',
      actorUuid,
      userId,
      systemId: single?.craftingSystemId,
      recipeId: single?.id,
      status: 'inProgress',
      steps: [step(0, 'inProgress')],
    }),
    false
  );

  add(
    craftingRun({
      id: 'lab-run-inprogress-multi',
      actorUuid,
      userId,
      systemId: multiStep?.craftingSystemId,
      recipeId: multiStep?.id,
      status: 'inProgress',
      currentStepIndex: 1,
      steps: [step(0, 'succeeded'), step(1, 'inProgress'), step(2, 'pending')],
    }),
    false
  );

  // A time-gated step whose gate has NOT matured: the journal shows a countdown rather than an
  // advance affordance, which is a different rendering path from plain inProgress.
  add(
    craftingRun({
      id: 'lab-run-waiting-time',
      actorUuid,
      userId,
      systemId: pick(2)?.craftingSystemId,
      recipeId: pick(2)?.id,
      status: 'waitingTime',
      currentStepIndex: 0,
      steps: [
        step(0, 'waitingTime', {
          timeGate: { availableAt: NOW + 6 * HOUR, startedAt: NOW - HOUR },
        }),
      ],
    }),
    false
  );

  // ── history ───────────────────────────────────────────────────────────────
  add(
    craftingRun({
      id: 'lab-run-succeeded-single',
      actorUuid,
      userId,
      systemId: single?.craftingSystemId,
      recipeId: single?.id,
      status: 'succeeded',
      finishedAt: NOW - 2 * HOUR,
      steps: [step(0, 'succeeded', { lastCheckResult: { success: true, total: 18, dc: 12 } })],
    }),
    true
  );

  add(
    craftingRun({
      id: 'lab-run-succeeded-multi',
      actorUuid,
      userId,
      systemId: multiStep?.craftingSystemId,
      recipeId: multiStep?.id,
      status: 'succeeded',
      finishedAt: NOW - 3 * HOUR,
      currentStepIndex: 2,
      steps: [step(0, 'succeeded'), step(1, 'succeeded'), step(2, 'succeeded')],
    }),
    true
  );

  add(
    craftingRun({
      id: 'lab-run-failed',
      actorUuid,
      userId,
      systemId: pick(1)?.craftingSystemId,
      recipeId: pick(1)?.id,
      status: 'failed',
      finishedAt: NOW - 5 * HOUR,
      steps: [
        step(0, 'failed', {
          lastCheckResult: { success: false, total: 7, dc: 15 },
          failureReason: 'checkFailed',
        }),
      ],
    }),
    true
  );

  add(
    craftingRun({
      id: 'lab-run-failed-multi',
      actorUuid,
      userId,
      systemId: multiStep?.craftingSystemId,
      recipeId: multiStep?.id,
      status: 'failed',
      finishedAt: NOW - 6 * HOUR,
      currentStepIndex: 1,
      steps: [
        step(0, 'succeeded'),
        step(1, 'failed', {
          lastCheckResult: { success: false, total: 4, dc: 14 },
          failureReason: 'checkFailed',
        }),
        step(2, 'pending'),
      ],
    }),
    true
  );

  add(
    craftingRun({
      id: 'lab-run-cancelled',
      actorUuid,
      userId,
      systemId: pick(3)?.craftingSystemId,
      recipeId: pick(3)?.id,
      status: 'cancelled',
      finishedAt: NOW - 7 * HOUR,
      steps: [step(0, 'pending')],
    }),
    true
  );

  const defaults = {
    craftingRuns: { active, history },
    // Salvage and gathering share the container shape.
    salvageRuns: {
      active: {},
      history: [
        {
          id: 'lab-salvage-succeeded',
          actorUuid,
          userId,
          craftingSystemId: single?.craftingSystemId,
          status: 'succeeded',
          startedAt: NOW - 9 * HOUR,
          updatedAt: NOW - 8 * HOUR,
          finishedAt: NOW - 8 * HOUR,
          createdResults: [],
        },
        buildResolvedProgressiveSalvageRun({ actorUuid, userId }),
      ],
    },
    gatheringRuns: buildLabGatheringRuns({ actorUuid, userId, environments }),
  };
  if (!journalCaseState) return defaults;
  return buildJournalCaseContainers({
    state: journalCaseState,
    actor,
    userId,
    recipes,
    environments,
    tasks,
    defaults,
  });
}

function buildJournalCaseContainers({
  state,
  actor,
  userId,
  recipes,
  environments,
  tasks,
  defaults,
}) {
  if (!Object.hasOwn(LAB_JOURNAL_CASE_STATE_RUN_IDS, state)) {
    throw new Error(`labRunStates: unknown journalCaseState "${state}"`);
  }
  if (state === 'legacy') return defaults;
  if (state === 'redacted-owner') {
    return emptyRunContainers({
      gatheringActive: Object.values(defaults.gatheringRuns.active).map((run) => ({
        ...run,
        lifecycleVersion: 1,
        runRevision: 0,
        completionMode: 'manual',
        pausedDurationSeconds: 0,
      })),
    });
  }
  if (state === 'no-actor-empty') return emptyRunContainers();

  const context = { actor, actorUuid: actor.uuid, userId, recipes, environments, tasks };
  const factories = journalCaseFactories(context);
  const factory = factories[state];
  if (!factory) throw new Error(`labRunStates: journalCaseState "${state}" has no fixture factory`);
  return factory();
}

function journalCaseFactories(context) {
  const single = () => requireRecipe(context.recipes, 'sm-r-horseshoe');
  const choice = () => requireRecipe(context.recipes, 'sm-r-quenchoil');
  const shortage = () => requireRecipe(context.recipes, 'sm-r-chainmail');
  const ingredientRoute = () => requireRecipe(context.recipes, 'jw-r-cast');
  const checkRoute = () => requireRecipe(context.recipes, 'rw-r-blade');
  const essence = () => requireRecipe(context.recipes, 'sm-r-deepbind');
  const multi = () => requireRecipe(context.recipes, 'sm-r-pattern-blade');
  const alchemy = () => requireRecipe(context.recipes, 'al-r-fire');
  const active = (run) => emptyRunContainers({ craftingActive: [run] });
  const finished = (run) => emptyRunContainers({ craftingHistory: [run] });
  const ready = (id, recipe = single()) =>
    versionedCraftingRun(context, recipe, {
      id,
      status: 'waitingTime',
      steps: [versionedRecipeStep(recipe, 0, 'waitingTime', maturedGate())],
    });
  const waiting = (id, recipe = single(), extra = {}) =>
    versionedCraftingRun(context, recipe, {
      id,
      status: 'waitingTime',
      completionMode: 'worldTime',
      steps: [versionedRecipeStep(recipe, 0, 'waitingTime', futureGate())],
      ...extra,
    });
  // The stage a player has NOT begun: no gate, no consumption receipt, and therefore the only shape
  // whose route, options and essence allocation are still editable (issue 1648).
  const unbegun = (id, recipe = single(), extra = {}) =>
    versionedCraftingRun(context, recipe, {
      id,
      status: 'inProgress',
      steps: [versionedRecipeStep(recipe, 0, 'inProgress')],
      ...extra,
    });
  const readyAlias = (id) => () => active(ready(id));

  return {
    'ready-single': readyAlias('lab-v1-ready-single'),
    'legacy-armed': () => {
      const run = ready('lab-v1-legacy-armed');
      delete run.steps[0].preparedConsumption;
      return active(run);
    },
    'waiting-auto-eligible': () => active(waiting('lab-v1-waiting-auto-eligible')),
    'waiting-open-choice': () =>
      active(unbegun('lab-v1-waiting-open-choice', choice(), { completionMode: 'manual' })),
    'material-shortage': () =>
      active(
        unbegun('lab-v1-material-shortage', shortage(), {
          completionMode: 'manual',
          steps: [shortageStep(shortage())],
        })
      ),
    'ingredient-route': () =>
      active(
        versionedCraftingRun(context, ingredientRoute(), {
          id: 'lab-v1-ingredient-route',
          steps: [
            versionedRecipeStep(ingredientRoute(), 0, 'inProgress', {
              selectedSetIndex: 1,
            }),
          ],
        })
      ),
    'check-route': () => active(ready('lab-v1-check-route', checkRoute())),
    'essence-shared': () => active(unbegun('lab-v1-essence-shared', essence())),
    paused: () =>
      active(
        waiting('lab-v1-paused', single(), {
          runRevision: 3,
          pauseState: { pausedAt: NOW - HOUR, remainingSeconds: 3 * HOUR },
          pausedDurationSeconds: HOUR,
        })
      ),
    'cancel-confirmation': readyAlias('lab-v1-cancel-confirmation'),
    'past-stage': () => active(stageBrowserRun(context, multi())),
    'future-stage': () => active(stageBrowserRun(context, multi())),
    'gathering-straight': () =>
      emptyRunContainers({ gatheringActive: [gatheringCaseRun(context, 'straight')] }),
    'gathering-d100': () =>
      emptyRunContainers({ gatheringActive: [gatheringCaseRun(context, 'd100')] }),
    'gathering-check': () =>
      emptyRunContainers({ gatheringActive: [gatheringCaseRun(context, 'routed')] }),
    'finished-success': () => finished(terminalCraftingCase(context, single(), 'succeeded')),
    'finished-failure': () => finished(terminalCraftingCase(context, checkRoute(), 'failed')),
    'finished-cancelled': () => finished(cancelledCraftingCase(context, multi())),
    'active-page-two': () => pagingContainers(context, single()),
    'finished-page-two': () => pagingContainers(context, single()),
    'filter-paused': () => filterContainers(context, single()),
    'empty-search': readyAlias('lab-v1-ready-single'),
    'automatic-completion': () =>
      finished(automaticCompletedCase(context, single(), 'lab-v1-automatic-completion')),
    // D-010: a conservative automatic advance decides BEFORE it spends, so a run it cannot
    // resolve is never started and never consumes — which is why this one holds no gate.
    'automatic-blocker': () =>
      active(
        versionedCraftingRun(context, shortage(), {
          id: 'lab-v1-automatic-blocker',
          status: 'inProgress',
          completionMode: 'worldTime',
          steps: [shortageStep(shortage())],
        })
      ),
    dismissal: () =>
      finished(terminalCraftingCase(context, single(), 'succeeded', 'lab-v1-dismissal')),
    alchemy: () => active(ready('lab-v1-alchemy', alchemy())),
    salvage: () => emptyRunContainers({ salvageHistory: [versionedSalvageCase(context)] }),
    'stale-action': readyAlias('lab-v1-stale-action'),
    'command-timeout': readyAlias('lab-v1-command-timeout'),
    'authority-unavailable': readyAlias('lab-v1-authority-unavailable'),
    'roll-cancelled': readyAlias('lab-v1-roll-cancelled'),
    'unsupported-version': () =>
      active({ ...ready('lab-unsupported-version'), lifecycleVersion: 2 }),
    'recovery-required': () => active(recoveryCase(context, single())),
    // A paused run the authority's RETAINED claim blocks — the maintainer's own stuck world.
    // The claim itself is seeded on the ledger by `labWorld.js`; this is the run it blocks.
    'claim-retained': () =>
      active(
        waiting('lab-v1-claim-retained', single(), {
          runRevision: 3,
          pauseState: { pausedAt: NOW - HOUR, remainingSeconds: 3 * HOUR },
          pausedDurationSeconds: HOUR,
        })
      ),
    wide: () => wideContainers(context, multi()),
    narrow: () => wideContainers(context, multi()),
    loading: readyAlias('lab-v1-ready-single'),
    'error-retry': readyAlias('lab-v1-ready-single'),
    // Persisted history-data witnesses live in their own module; each state seeds one selected
    // record, plus the earlier record a recovery genuinely reads.
    ...Object.fromEntries(
      Object.entries(historyDataRunSets({ ...context, now: NOW, hour: HOUR })).map(
        ([state, build]) => [
          state,
          () =>
            emptyRunContainers({
              craftingActive: [ready(`lab-v1-${state}-open`)],
              ...build(),
            }),
        ]
      )
    ),
  };
}

/** The prototype's eight crafting and three gathering accounts, plus its twelve closed accounts. */
function prototypeContainers(context, state) {
  const keys = ['cord', 'boss', 'edge', 'rivets', 'tonic', 'sigil', 'poultice', 'buckler'];
  const active = keys.map((key, index) =>
    prototypeCraft(context, key, `lab-v1-active-${index + 1}`)
  );
  const gatheringActive = ['stone', 'herbs', 'balehound'].map((key) =>
    prototypeGather(context, key)
  );
  const history = [
    'copper',
    'draught',
    'breastplate',
    'boss',
    'cord',
    'sigil',
    'tonic',
    'boss',
    'edge',
    'rivets',
  ].map((key, index) => prototypeHistory(context, key, `lab-v1-finished-${index + 1}`, index));
  const gatheringHistory = ['herbs', 'stone'].map((key) => {
    const run = prototypeGather(context, key);
    run.id = `jp-history-${key}`;
    const closedAt = NOW - (key === 'herbs' ? 5.5 : 11) * HOUR;
    run.startedAtWorldTime = closedAt - run.timeGate.requiredSeconds;
    run.timeGate = { ...run.timeGate, initiatedAt: run.startedAtWorldTime, availableAt: closedAt };
    completeGatheringFixture(run, closedAt);
    run.status = 'succeeded';
    return run;
  });
  const containers = emptyRunContainers({
    craftingActive: active,
    craftingHistory: history,
    gatheringActive,
    gatheringHistory,
  });
  if (['history-compact-grid', 'history-compact-tools'].includes(state)) {
    seedCompactHistory(context, containers, state);
    return containers;
  }
  if (['active-page-two', 'finished-page-two'].includes(state)) return containers;
  const id = LAB_JOURNAL_CASE_STATE_RUN_IDS[state];
  const binding = JOURNAL_PROTOTYPE_BINDINGS[state];
  const historyIndex = { h1: 0, h2: 1, h3: 2, h4: 3, h5: 4, h7: 5, h8: 6, h9: 7, h10: 8, h12: 9 }[
    binding
  ];
  if (historyIndex != null) {
    containers.craftingRuns.history[historyIndex].id = id;
    // Keep the selected historical row on page one; all twelve accounts remain.
    const [selected] = containers.craftingRuns.history.splice(historyIndex, 1);
    selected.finishedAt = NOW;
    containers.craftingRuns.history.unshift(selected);
    return containers;
  }
  const special = prototypeSpecial(context, state, id, containers);
  if (special) return containers;
  const key = state === 'automatic-blocker' ? 'poultice' : binding.split('/')[0];
  const craftKey = Object.hasOwn(JOURNAL_PROTOTYPE_RECIPES, key) ? key : 'rivets';
  const selected = prototypeCraft(context, craftKey, id);
  if (['gathering-straight', 'gathering-d100', 'gathering-check'].includes(state)) {
    const run = prototypeGather(context, key);
    run.id = id;
    maturePrototypeGather(run);
    replacePrototypeFocus(containers.gatheringRuns, run, false);
    return containers;
  }
  if (state === 'filter-paused')
    selected.pauseState = { pausedAt: NOW - HOUR, remainingSeconds: 3 * HOUR };
  if (state === 'waiting-auto-eligible') {
    selected.completionMode = 'worldTime';
    const current = selected.steps[selected.currentStepIndex];
    current.selectionPlan.ingredientEssenceAllocation = {
      stepId: current.stepId,
      ingredientSetId: current.selectedIngredientSetId,
      allocation: { 'Item.jp-bitterroot': 2 },
    };
  }
  // Both shortage states are UNBEGUN (issue 1648).
  if (state === 'material-shortage') {
    const recipe = requireRecipe(context.recipes, selected.recipeId);
    selected.steps[0] = versionedRecipeStep(recipe, 0, 'inProgress', {
      presentationSnapshot: selected.steps[0].presentationSnapshot,
      selectedSetIndex: 1,
    });
    selected.status = 'inProgress';
  }
  if (state === 'automatic-blocker') {
    selected.completionMode = 'worldTime';
    selected.status = 'inProgress';
    const current = selected.steps[selected.currentStepIndex];
    delete current.timeGate;
    delete current.preparedConsumption;
    current.status = 'inProgress';
    current.selectionPlan.ingredientEssenceAllocation = {
      stepId: current.stepId,
      ingredientSetId: current.selectedIngredientSetId,
      allocation: {},
    };
  }
  if (UNBEGUN_PROTOTYPE_CASES.has(state)) unbeginStage(selected);
  replacePrototypeFocus(containers.craftingRuns, selected, false);
  return containers;
}

// Additive maintainer witnesses: original prototype cohorts and acting walks are untouched.
function seedCompactHistory(context, containers, state) {
  const multi = state === 'history-compact-tools';
  const run = prototypeHistory(context, multi ? 'tonic' : 'cord', `lab-v1-${state}`);
  const materials = ['iron_billet', 'charcoal', 'quench_oil', 'brine', 'beeswax'].map(
    (id, index) => ({
      ...journalPrototypeMaterial(context.actorUuid, id, index + 1),
      name: `${id.replaceAll('_', ' ')} — a very long recorded name from the northern mountain expedition`,
    })
  );
  const tools = [
    ['Hammer', 'smithing/hammer-sledge-steel-grey'],
    ['Tongs', 'smithing/tongs-steel-grey'],
    ['Mortar', 'cooking/mortar-stone-yellow'],
    ['Chisel', 'hand/chisel-steel-brown'],
    ['Hammer', 'hand/hammer-cobbler-steel'],
  ].map(([name, image], index) => ({
    actorUuid: context.actorUuid,
    itemUuid: `${context.actorUuid}.Item.batch-tool-${index}`,
    toolId: `batch-tool-${index}`,
    name,
    img: `/@foundry-chrome/icons/tools/${image}.webp`,
    quantity: 1,
  }));
  run.steps[0].consumedIngredients = materials;
  run.steps[0].createdResults = materials.map((item) => ({ ...item, quantity: 2 }));
  run.steps[0].usedTools = tools;
  if (multi)
    run.steps[1].usedTools = [
      { ...tools[0], quantity: 2, broken: true },
      { ...tools[1], itemUuid: null, virtual: true, quantity: null },
    ];
  replacePrototypeFocus(containers.craftingRuns, run, true);
  // Eleven gives BOTH independent pagers a genuine three-row last page.
  containers.craftingRuns.history.pop();
}

function replacePrototypeFocus(container, run, terminal) {
  if (terminal) {
    container.history[0] = run;
    run.finishedAt = NOW;
    if (run.taskId) run.completedAtWorldTime = NOW;
  } else {
    const replaced = Object.values(container.active).find((entry) =>
      run.taskId ? entry.taskId === run.taskId : entry.recipeId === run.recipeId
    );
    delete container.active[replaced?.id ?? Object.keys(container.active)[0]];
    container.active = { [run.id]: run, ...container.active };
  }
}

function prototypeCheck(spec, success = true, total = null) {
  const value = total ?? (success ? spec.dc + 4 : spec.dc - 8);
  return {
    success,
    value,
    outcome: success ? 'Cleared' : 'Short',
    data: { resolvedFormula: `1d20 + ${spec.mod}`, total: value, dc: spec.dc },
  };
}

function prototypeStageStatus(index, current) {
  if (index < current) return 'succeeded';
  return index === current ? 'waitingTime' : 'pending';
}

function prototypeCraft(context, key, id) {
  const spec = JOURNAL_PROTOTYPE_RECIPES[key];
  const recipe = requireRecipe(context.recipes, journalPrototypeRecipeId(key));
  const steps = recipeSteps(recipe).map((authored, index) => {
    const status = prototypeStageStatus(index, spec.current);
    const entry = versionedRecipeStep(recipe, index, status);
    if (index <= spec.current)
      entry.presentationSnapshot = {
        name: spec.steps[index].name,
        description: spec.steps.length === 1 ? (spec.description ?? '') : '',
      };
    if (index < spec.current) recordPrototypeStage(context, key, entry, index, true);
    if (index === spec.current) {
      entry.timeGate = {
        requiredSeconds: spec.steps[index].hours * HOUR,
        initiatedAt: NOW - (spec.steps[index].hours - spec.left) * HOUR,
        availableAt: NOW + spec.left * HOUR,
      };
      entry.preparedConsumption ??= startedStageConsumption(entry);
    }
    if (index === spec.current && key === 'sigil')
      entry.selectionPlan.ingredientEssenceAllocation = {
        stepId: entry.stepId,
        ingredientSetId: entry.selectedIngredientSetId,
        allocation: {},
      };
    if (index > spec.current) {
      delete entry.selectionPlan;
      delete entry.selectedRequirementSnapshot;
      delete entry.selectedIngredientSetId;
    }
    return entry;
  });
  return versionedCraftingRun(context, recipe, {
    id,
    status: 'waitingTime',
    currentStepIndex: spec.current,
    steps,
    ...(key === 'tonic' && {
      pauseState: { pausedAt: NOW - 5 * HOUR, remainingSeconds: 5 * HOUR },
    }),
    ...(key === 'poultice' && { pausedDurationSeconds: 3 * HOUR }),
  });
}

function recordPrototypeStage(context, key, entry, index, success) {
  const spec = JOURNAL_PROTOTYPE_RECIPES[key];
  const stageSpec = spec.steps[index];
  if (!entry.selectionPlan)
    Object.assign(
      entry,
      versionedRecipeStep(
        requireRecipe(context.recipes, journalPrototypeRecipeId(key)),
        index,
        'inProgress'
      )
    );
  const requirements = stageSpec.routes?.[0].requirements ?? stageSpec.requirements;
  const consumed = requirements
    .filter((req) => !req.essence)
    .map((req) =>
      journalPrototypeMaterial(context.actorUuid, req.id ?? req.options.at(-1), req.quantity ?? 1)
    );
  entry.status = success ? 'succeeded' : 'failed';
  entry.completedAt = NOW - (spec.steps.length - index) * HOUR;
  entry.presentationSnapshot = { name: stageSpec.name, description: spec.description ?? '' };
  const checked = Boolean(spec.dc) && (spec.steps.length === 1 || index > 0);
  let kind = stageSpec.routes ? 'ingredients' : 'none';
  if (checked) kind = 'check';
  entry.resolutionSnapshot = {
    kind,
    mode: spec.mode,
  };
  if (checked)
    entry.lastCheckResult = prototypeCheck(
      { ...spec, dc: key === 'rivets' && index === 2 ? 13 : spec.dc },
      success
    );
  entry.selectionPlan.ingredientOptionOverrides = Object.fromEntries(
    requirements.flatMap((req, groupIndex) =>
      req.options
        ? [
            [
              entry.selectedRequirementSnapshot.ingredientGroups[groupIndex].id,
              {
                optionIndex: req.options.length - 1,
                heldItemId: `Item.jp-${req.options.at(-1)}`,
              },
            ],
          ]
        : []
    )
  );
  const output = stageSpec.routes?.[0].output ?? stageSpec.output;
  entry.consumedIngredients = consumed;
  entry.createdResults =
    success && output ? [journalPrototypeMaterial(context.actorUuid, ...output)] : [];
  entry.currencySpends = [];
  if (!success) entry.failureReason = 'checkFailed';
  if (index === 1 && ['sigil', 'tonic'].includes(key)) {
    entry.essenceSpend = journalPrototypeEssenceSpend(
      context.actorUuid,
      key === 'sigil' ? { sunmote: 1, duskglass: 2 } : { dewglass: 1, moonpetal: 1 }
    );
    entry.consumedIngredients.push(
      ...entry.essenceSpend.carriers.map(({ contributions: _contributions, ...item }) => item)
    );
  }
}

function prototypeHistory(context, key, id, index = -1) {
  const run = prototypeCraft(context, key, id);
  const failed = [2, 7, 9].includes(index);
  run.status = failed ? 'failed' : 'succeeded';
  run.finishedAt = NOW - (index + 1) * HOUR;
  run.currentStepIndex = run.steps.length - 1;
  delete run.pauseState;
  run.steps.forEach((entry, stepIndex) =>
    recordPrototypeStage(
      context,
      key,
      entry,
      stepIndex,
      !failed || stepIndex < run.steps.length - 1
    )
  );
  if (key === 'boss' && [3, 7].includes(index)) {
    const entry = run.steps[0];
    entry.resolutionSnapshot = { kind: 'ingredients', mode: 'routedByIngredients' };
    delete entry.lastCheckResult;
    if (failed) {
      delete run.lifecycleVersion;
      entry.failureReason =
        'The Sunward set was two Emberdust short when this legacy run resolved.';
      const recipe = requireRecipe(context.recipes, run.recipeId);
      entry.selectedRequirementSnapshot = recipeSteps(recipe)[0].ingredientSets[1].toJSON();
      entry.consumedIngredients = ['shield_blank', 'rune_chalk', 'emberdust'].map((material) =>
        journalPrototypeMaterial(context.actorUuid, material, material === 'emberdust' ? 2 : 1)
      );
    }
  }
  if ([0, 1, 2, 3, 4].includes(index)) run.steps[0].consumedIngredients = [];
  const totals = {
    0: [12],
    1: [14],
    2: [6],
    5: [null, 17],
    6: [null, 15],
    8: [18],
    9: [null, 16, 7],
  };
  for (const [stepIndex, total] of (totals[index] ?? []).entries()) {
    const check = run.steps[stepIndex].lastCheckResult;
    if (check && total != null) {
      check.value = total;
      check.data.total = total;
    }
  }
  if (key === 'cord') run.steps[0].createdResults[0].quantity = 2;
  if (key === 'tonic') run.steps[1].createdResults[0].quantity = 1;
  if (key === 'edge') run.steps[0].createdResults[0].quantity = 2;
  if (key === 'sigil') run.pausedDurationSeconds = 4 * HOUR;
  const duration = JOURNAL_PROTOTYPE_RECIPES[key].steps.reduce(
    (sum, entry) => sum + entry.hours * HOUR,
    0
  );
  run.startedAt = run.finishedAt - duration - run.pausedDurationSeconds;
  run.updatedAt = run.finishedAt;
  let cursor = run.startedAt + run.pausedDurationSeconds;
  run.steps.forEach((entry, stepIndex) => {
    const requiredSeconds = JOURNAL_PROTOTYPE_RECIPES[key].steps[stepIndex].hours * HOUR;
    entry.startedAt = cursor;
    cursor += requiredSeconds;
    entry.updatedAt = cursor;
    entry.completedAt = cursor;
    entry.timeGate = { requiredSeconds, initiatedAt: entry.startedAt, availableAt: cursor };
  });
  return run;
}

function prototypeGather(context, key) {
  const task = context.tasks.find((entry) => entry.id === `jp-${key}`);
  if (!task) throw new Error(`Journal prototype task missing: ${key}`);
  const left = { stone: 0, herbs: 2, balehound: 1 }[key] * HOUR;
  const availableAt = NOW + left;
  const initiatedAt = availableAt - task.durationSeconds;
  return {
    ...gatheringCaseRun({ ...context, tasks: [task] }, task.resolutionMode),
    id: `jp-active-${key}`,
    environmentId: 'jp-environment',
    startedAtWorldTime: initiatedAt,
    timeGate: { requiredSeconds: task.durationSeconds, initiatedAt, availableAt },
  };
}

function maturePrototypeGather(run) {
  const requiredSeconds = run.timeGate.requiredSeconds;
  run.startedAtWorldTime = NOW - requiredSeconds;
  run.timeGate = { requiredSeconds, initiatedAt: run.startedAtWorldTime, availableAt: NOW };
}

function prototypeSpecial(context, state, id, containers) {
  if (state === 'history-settling') {
    const run = prototypeGather(context, 'herbs');
    run.id = id;
    completeGatheringFixture(run, NOW);
    run.status = 'succeeded';
    // Gathering persists terminal intent before applying results. The planned
    // top-level awards must remain invisible until this receipt is applied.
    run.executionJournal.status = 'planned';
    const effect = run.executionJournal.effects[0];
    effect.phase = 'planned';
    effect.planned = cloneFixtureValue(run.createdResults);
    delete effect.receipt;
    replacePrototypeFocus(containers.gatheringRuns, run, true);
    return true;
  }
  // The state a multi-step craft ARRIVES in (issue 1648, M10): every earlier stage succeeded, so
  // `completeStepSuccess` advanced into a stage with two authored routes and no plan at all.
  if (state === 'legacy-armed') {
    const run = prototypeCraft(context, 'cord', id);
    delete run.steps[run.currentStepIndex].preparedConsumption;
    replacePrototypeFocus(containers.craftingRuns, run, false);
    return true;
  }
  if (state === 'awaiting-choice') {
    const run = prototypeCraft(context, 'buckler', id);
    const last = run.steps.length - 1;
    run.steps.forEach((entry, index) => {
      if (index < last) recordPrototypeStage(context, 'buckler', entry, index, true);
    });
    run.currentStepIndex = last;
    run.status = 'inProgress';
    run.steps[last].status = 'inProgress';
    replacePrototypeFocus(containers.craftingRuns, run, false);
    return true;
  }
  // The two states the stage-start commit creates (issue 1648): a stage the player has not begun,
  // whose choices are still open and whose materials are unspent, and the same stage once beginning
  // it locked the choice and consumed them.
  if (state === 'stage-paid') {
    const run = prototypeCraft(context, 'permit', id);
    const current = run.steps[run.currentStepIndex];
    current.preparedConsumption = {
      ...current.preparedConsumption,
      consumedSummary: [],
      currencySpends: [{ unit: 'gp', amount: 50 }],
    };
    replacePrototypeFocus(containers.craftingRuns, run, false);
    return true;
  }
  if (['stage-not-started', 'stage-consumed', 'current-choice-closed'].includes(state)) {
    const run = prototypeCraft(context, 'rivets', id);
    const current = run.steps[run.currentStepIndex];
    // `stage-consumed` keeps the start receipt `prototypeCraft` already armed the gate with, so the
    // two states differ ONLY in whether the stage has begun.
    if (state !== 'stage-consumed') {
      delete current.timeGate;
      delete current.preparedConsumption;
      current.status = 'inProgress';
      run.status = 'inProgress';
      // The pick a player makes with the option control before they press begin (issue 1648).
      persistAuthoredPicks(current);
    }
    replacePrototypeFocus(containers.craftingRuns, run, false);
    return true;
  }
  const cancelled = {
    'finished-cancelled': ['rivets', 1],
    'history-cancelled-before': ['cord', 0],
    'history-cancelled-multi': ['buckler', 2],
  }[state];
  if (cancelled) {
    const [key, attempted] = cancelled;
    const run = prototypeCraft(context, key, id);
    run.currentStepIndex = attempted;
    run.steps.forEach((entry, index) => {
      if (index < attempted) recordPrototypeStage(context, key, entry, index, true);
    });
    // Cancellation cases start active and close through the real arm/confirm controls.
    replacePrototypeFocus(containers.craftingRuns, run, false);
    return true;
  }
  if (
    ['history-d100-all-hit', 'history-d100-all-miss', 'history-gathering-check-failure'].includes(
      state
    )
  ) {
    const key = state === 'history-gathering-check-failure' ? 'balehound' : 'stone';
    const run = prototypeGather(context, key);
    run.id = id;
    maturePrototypeGather(run);
    replacePrototypeFocus(containers.gatheringRuns, run, false);
    return true;
  }
  if (state === 'history-just-resolved') {
    replacePrototypeFocus(containers.craftingRuns, prototypeCraft(context, 'cord', id), false);
    return true;
  }
  const historyKey = {
    'history-checked-ingredients': 'boss',
    'history-multi-success': 'rivets',
    'history-redacted': 'copper',
    'history-missing-material': 'edge',
    'history-gm-deleted-recipe': 'edge',
    'history-failure-awards': 'edge',
    'automatic-completion': 'poultice',
    dismissal: 'copper',
  }[state];
  if (!historyKey) return false;
  const run = prototypeHistory(context, historyKey, id);
  if (state === 'history-redacted' || state === 'history-gm-deleted-recipe')
    run.recipeId = 'jp-deleted-recipe';
  if (state === 'history-missing-material')
    run.steps[0].consumedIngredients = [
      {
        actorUuid: context.actorUuid,
        itemUuid: 'Actor.deleted.Item.missing',
        name: null,
        img: null,
        quantity: null,
      },
    ];
  if (state === 'history-failure-awards') {
    run.status = 'failed';
    run.steps[0].status = 'failed';
    run.steps[0].lastCheckResult = prototypeCheck(JOURNAL_PROTOTYPE_RECIPES.edge, false);
  }
  if (state === 'automatic-completion') run.completionMode = 'worldTime';
  replacePrototypeFocus(containers.craftingRuns, run, true);
  return true;
}

function requireRecipe(recipes, id) {
  const recipe = (recipes ?? []).find((entry) => entry?.id === id);
  if (!recipe) throw new Error(`labRunStates: journal fixture requires real recipe "${id}"`);
  return recipe;
}

function recipeSteps(recipe) {
  return typeof recipe?.getExecutionSteps === 'function' ? recipe.getExecutionSteps() : [];
}

/** The start-commit receipt every gated stage carries (issue 1648). */
function startedStageConsumption(step) {
  return {
    selectedIngredientSetId:
      step.selectionPlan?.selectedIngredientSetId ?? step.selectedIngredientSetId ?? null,
    currencySpends: [],
    resolvedEssences: {},
    essenceEnabled: {},
    consumedSummary: startedStageReceipts(step),
  };
}

/**
 * The item rows a start commit records, one per group whose picked option names a PHYSICAL
 * requirement (issue 1648, M21). An ESSENCE group contributes no row.
 */
function startedStageReceipts(step) {
  const overrides = step.selectionPlan?.ingredientOptionOverrides ?? {};
  return normalizeLabList(step.selectedRequirementSnapshot?.ingredientGroups)
    .map((group, index) => {
      const options = normalizeLabList(group?.options);
      const picked = options[Number(overrides?.[group?.id]?.optionIndex) || 0] ?? options[0];
      return { group, index, picked };
    })
    .filter(({ picked }) => picked && picked.match?.type !== 'essence')
    .map(({ group, index, picked }) => ({
      itemUuid: `Item.lab-consumed-${step.stepId ?? 'stage'}-${index}`,
      actorUuid: null,
      quantity: Math.max(1, Number(picked.quantity ?? group?.quantity) || 1),
      name: picked.name ?? null,
      img: null,
      componentId: picked.match?.componentId ?? null,
    }));
}

function versionedRecipeStep(recipe, index, status, extra = {}) {
  const authored = recipeSteps(recipe)[index];
  if (!authored) {
    throw new Error(`labRunStates: recipe "${recipe?.id}" has no execution step ${index}`);
  }
  const selectedSetIndex = Number(extra.selectedSetIndex) || 0;
  const selectedSet = authored.ingredientSets?.[selectedSetIndex] ?? authored.ingredientSets?.[0];
  const selectedRequirementSnapshot = selectedSet?.toJSON?.() ?? selectedSet ?? null;
  const selectedIngredientSetId = selectedRequirementSnapshot?.id ?? null;
  const fields = { ...extra };
  delete fields.selectedSetIndex;
  const built = step(index, status, {
    stepId: authored.id,
    stepName: authored.name || `Step ${index + 1}`,
    selectedIngredientSetId,
    selectedRequirementSnapshot,
    selectionPlan: selectedIngredientSetId
      ? { selectedIngredientSetId, ingredientOptionOverrides: {} }
      : null,
    ...fields,
  });
  // A gate is a start commit's own output, so every fixture that arms one also carries the
  // receipt the commit writes. A stage that has NOT begun simply has neither.
  if (built.timeGate && !built.preparedConsumption) {
    built.preparedConsumption = startedStageConsumption(built);
  }
  return built;
}

function versionedCraftingRun(context, recipe, overrides = {}) {
  const steps = overrides.steps ?? [versionedRecipeStep(recipe, 0, 'inProgress')];
  return {
    ...craftingRun({
      id: overrides.id,
      actorUuid: context.actorUuid,
      userId: context.userId,
      systemId: recipe.craftingSystemId,
      recipeId: recipe.id,
      status: overrides.status ?? 'inProgress',
      steps,
      finishedAt: overrides.finishedAt,
      currentStepIndex: overrides.currentStepIndex ?? 0,
    }),
    lifecycleVersion: 1,
    runRevision: overrides.runRevision ?? 0,
    completionMode: overrides.completionMode ?? 'manual',
    pausedDurationSeconds: overrides.pausedDurationSeconds ?? 0,
    ...(overrides.pauseState && { pauseState: overrides.pauseState }),
    ...(overrides.executionJournal && { executionJournal: overrides.executionJournal }),
  };
}

/**
 * Un-begin the current stage: delete its clock AND its consumption receipt together, because a
 * start commit writes both or neither (issue 1648).
 */
function unbeginStage(run) {
  const current = run.steps?.[Math.max(0, Number(run.currentStepIndex) || 0)];
  if (!current) return run;
  delete current.timeGate;
  delete current.preparedConsumption;
  current.status = 'inProgress';
  run.status = 'inProgress';
  return run;
}

/**
 * Prototype cases whose SUBJECT is an editable requirement rail, and which are therefore unbegun.
 *
 * @see unbeginStage
 */
const UNBEGUN_PROTOTYPE_CASES = new Set([
  'waiting-open-choice',
  'ingredient-route',
  'essence-shared',
  'essence-overshoot',
]);

/**
 * Persist the option each multi-option group would be given by the player's own pick, so a stage
 * that is ready to begin reads as ready to begin.
 */
function persistAuthoredPicks(step) {
  const groups = normalizeLabList(step.selectedRequirementSnapshot?.ingredientGroups);
  step.selectionPlan = {
    ...(step.selectionPlan ?? {}),
    selectedIngredientSetId:
      step.selectionPlan?.selectedIngredientSetId ?? step.selectedIngredientSetId ?? null,
    ingredientOptionOverrides: Object.fromEntries(
      groups
        .filter((group) => normalizeLabList(group?.options).length > 1)
        .map((group) => [group.id, { optionIndex: 0 }])
    ),
  };
}

function normalizeLabList(value) {
  return Array.isArray(value) ? value : [];
}

function shortageStep(recipe) {
  const current = versionedRecipeStep(recipe, 0, 'inProgress');
  // No allocation means "suggest one"; an explicit empty allocation means the player has
  // allocated nothing. This is canonical Chainmail shortage evidence, not Sunward-route parity.
  current.selectionPlan.ingredientEssenceAllocation = {
    stepId: current.stepId,
    ingredientSetId: current.selectedIngredientSetId,
    allocation: {},
  };
  return current;
}

function maturedGate() {
  return {
    timeGate: { requiredSeconds: HOUR, initiatedAt: NOW - 2 * HOUR, availableAt: NOW - HOUR },
  };
}

function futureGate() {
  return {
    timeGate: { requiredSeconds: 4 * HOUR, initiatedAt: NOW - HOUR, availableAt: NOW + 3 * HOUR },
  };
}

function stageBrowserRun(context, recipe) {
  const authored = recipeSteps(recipe);
  const steps = authored.map((_entry, index) => {
    if (index === 0) {
      return versionedRecipeStep(recipe, index, 'succeeded', {
        completedAt: NOW - HOUR,
        lastCheckResult: {
          success: true,
          value: 17,
          data: { resolvedFormula: '1d20 + 3', total: 17, dc: 14 },
        },
        consumedIngredients: [{ componentId: 'sm-steel-ingot', quantity: 2, name: 'Steel Ingot' }],
      });
    }
    if (index === 1) return versionedRecipeStep(recipe, index, 'waitingTime', futureGate());
    return versionedRecipeStep(recipe, index, 'pending');
  });
  return versionedCraftingRun(context, recipe, {
    id: 'lab-v1-stage-browser',
    status: 'waitingTime',
    currentStepIndex: Math.min(1, steps.length - 1),
    steps,
  });
}

function terminalCraftingCase(context, recipe, status, id = null) {
  const succeeded = status === 'succeeded';
  const suffix = status === 'succeeded' ? 'success' : status === 'failed' ? 'failure' : 'cancelled';
  const runId = id ?? `lab-v1-finished-${suffix}`;
  const persistedStep = versionedRecipeStep(recipe, 0, status, {
    completedAt: NOW - HOUR,
    lastCheckResult: {
      success: succeeded,
      value: succeeded ? 18 : 6,
      reason: succeeded ? null : 'checkFailed',
      data: { resolvedFormula: '1d20 + 2', total: succeeded ? 18 : 6, dc: 12 },
    },
    consumedIngredients: [{ componentId: 'sm-iron-ingot', quantity: 1, name: 'Iron Ingot' }],
    createdResults: succeeded
      ? [{ componentId: 'sm-horseshoe', quantity: 4, name: 'Horseshoe' }]
      : [],
    ...(!succeeded && { failureReason: 'checkFailed' }),
  });
  return versionedCraftingRun(context, recipe, {
    id: runId,
    status,
    finishedAt: NOW - HOUR,
    steps: [persistedStep],
    executionJournal: {
      operationId: `${runId}-operation`,
      status: 'committed',
      effects: [
        { id: 'spend', kind: 'ingredientConsumption', phase: 'applied', receipt: { count: 1 } },
        ...(succeeded
          ? [{ id: 'award', kind: 'awardCreation', phase: 'applied', receipt: { count: 1 } }]
          : []),
      ],
    },
  });
}

function cancelledCraftingCase(context, recipe) {
  const first = versionedRecipeStep(recipe, 0, 'succeeded', {
    completedAt: NOW - 2 * HOUR,
    consumedIngredients: [{ componentId: 'sm-steel-ingot', quantity: 2, name: 'Steel Ingot' }],
  });
  const second = versionedRecipeStep(recipe, 1, 'cancelled', {
    timeGate: { requiredSeconds: 8 * HOUR, initiatedAt: NOW - HOUR, availableAt: NOW + 7 * HOUR },
  });
  return versionedCraftingRun(context, recipe, {
    id: 'lab-v1-finished-cancelled',
    status: 'cancelled',
    currentStepIndex: 1,
    finishedAt: NOW,
    steps: [first, second],
  });
}

function gatheringCaseRun(context, mode) {
  const task = requireGatheringTask(context.tasks, mode);
  const environment =
    context.environments.find((entry) => entry?.craftingSystemId === task.craftingSystemId) ??
    context.environments[0];
  if (!environment) throw new Error(`labRunStates: ${mode} gathering fixture has no environment`);
  const id = `lab-v1-gathering-${mode === 'routed' ? 'check' : mode}`;
  return {
    id,
    actorUuid: context.actorUuid,
    userId: context.userId,
    craftingSystemId: task.craftingSystemId,
    environmentId: environment.id,
    taskId: task.id,
    lifecycleVersion: 1,
    runRevision: 0,
    completionMode: 'manual',
    pausedDurationSeconds: 0,
    status: 'waitingTime',
    startedAtWorldTime: NOW - 2 * HOUR,
    updatedAtWorldTime: NOW - HOUR,
    timeGate: maturedGate().timeGate,
    economyEvidence: { runtimeSnapshot: { task } },
    checkResult: null,
    createdResults: [],
  };
}

function automaticCompletedCase(context, recipe, id) {
  const completed = versionedRecipeStep(recipe, 0, 'succeeded', {
    completedAt: NOW,
    createdResults: authoredResults(recipe, 0),
  });
  return versionedCraftingRun(context, recipe, {
    id,
    status: 'succeeded',
    completionMode: 'worldTime',
    finishedAt: NOW,
    steps: [completed],
  });
}

function authoredResults(recipe, stepIndex) {
  const authored = recipeSteps(recipe)[stepIndex];
  return (authored?.resultGroups ?? []).flatMap((group) =>
    (group?.results ?? []).map((result) => ({
      componentId: result.componentId,
      quantity: result.quantity ?? 1,
      name: result.name,
      img: result.img,
    }))
  );
}

function requireGatheringTask(tasks, mode) {
  const task = (tasks ?? []).find((entry) => {
    const resolutionMode = entry?.resolutionMode ?? 'd100';
    return resolutionMode === mode;
  });
  if (!task)
    throw new Error(`labRunStates: journal fixture requires a real ${mode} gathering task`);
  return task;
}

function pagingContainers(context, recipe) {
  const activeRuns = Array.from({ length: 6 }, (_unused, index) => ({
    ...versionedCraftingRun(context, recipe, {
      id: `lab-v1-active-${index + 1}`,
      status: 'waitingTime',
      steps: [versionedRecipeStep(recipe, 0, 'waitingTime', futureGate())],
    }),
    startedAt: NOW - index * 60,
  }));
  const historyRuns = Array.from({ length: 6 }, (_unused, index) => ({
    ...terminalCraftingCase(context, recipe, 'succeeded', `lab-v1-finished-${index + 1}`),
    finishedAt: NOW - index * 60,
  }));
  return emptyRunContainers({ craftingActive: activeRuns, craftingHistory: historyRuns });
}

function filterContainers(context, recipe) {
  const paused = {
    ...versionedCraftingRun(context, recipe, {
      id: 'lab-v1-filter-paused',
      status: 'waitingTime',
      steps: [versionedRecipeStep(recipe, 0, 'waitingTime', futureGate())],
      pauseState: { pausedAt: NOW - 300, remainingSeconds: HOUR },
    }),
  };
  return emptyRunContainers({
    craftingActive: [
      paused,
      versionedCraftingRun(context, recipe, {
        id: 'lab-v1-filter-ready',
        status: 'waitingTime',
        steps: [versionedRecipeStep(recipe, 0, 'waitingTime', maturedGate())],
      }),
    ],
  });
}

function versionedSalvageCase(context) {
  return {
    ...buildResolvedProgressiveSalvageRun(context),
    id: 'lab-v1-salvage',
    lifecycleVersion: 1,
    runRevision: 1,
    completionMode: 'manual',
    pausedDurationSeconds: 0,
  };
}

function recoveryCase(context, recipe) {
  return versionedCraftingRun(context, recipe, {
    id: 'lab-v1-recovery-required',
    status: 'inProgress',
    steps: [versionedRecipeStep(recipe, 0, 'inProgress')],
    executionJournal: {
      operationId: 'lab-recovery-operation',
      status: 'recoveryRequired',
      effects: [
        { id: 'spend', kind: 'ingredientConsumption', phase: 'applied', receipt: { count: 1 } },
        { id: 'award', kind: 'awardCreation', phase: 'applying' },
      ],
    },
  });
}

function wideContainers(context, recipe) {
  const containers = pagingContainers(context, recipe);
  const wide = versionedCraftingRun(context, recipe, {
    id: 'lab-v1-wide',
    status: 'waitingTime',
    currentStepIndex: 1,
    steps: recipeSteps(recipe).map((_entry, index) =>
      versionedRecipeStep(
        recipe,
        index,
        index === 1 ? 'waitingTime' : index < 1 ? 'succeeded' : 'pending',
        index === 1 ? futureGate() : {}
      )
    ),
  });
  containers.craftingRuns.active = {
    [wide.id]: wide,
    ...containers.craftingRuns.active,
  };
  return containers;
}

function emptyRunContainers({
  craftingActive = [],
  craftingHistory = [],
  salvageActive = [],
  salvageHistory = [],
  gatheringActive = [],
  gatheringHistory = [],
} = {}) {
  const keyed = (runs) => Object.fromEntries(runs.map((run) => [run.id, run]));
  return {
    craftingRuns: { active: keyed(craftingActive), history: craftingHistory },
    salvageRuns: { active: keyed(salvageActive), history: salvageHistory },
    gatheringRuns: { active: keyed(gatheringActive), history: gatheringHistory },
  };
}

/**
 * Build the View Lab's test-only command collaborator. It changes the same persisted containers
 * installed on the actor, then the production Journal builder/store reloads those records.
 *
 * @param {object} options Options.
 * @param {object} options.actor Actor carrying the run flags.
 * @param {object} options.containers Persisted run containers installed on the actor.
 * @param {string|null} options.state Selected Journal fixture state.
 * @param {object[]} [options.recipes] Authored recipes used to resolve completion results.
 * @param {() => number} [options.nowWorldTime] Current world-time reader.
 * @param {() => void} [options.onPersist] Refresh readers after the actor flags have been replaced.
 */
export function createLabJournalCaseController({
  actor,
  containers,
  state,
  recipes = [],
  nowWorldTime = () => NOW,
  onPersist = () => {},
}) {
  const events = [];
  const persist = () => {
    installLabRunStates(actor, containers);
    onPersist();
  };

  async function execute(command) {
    const event = { ...cloneFixtureValue(command ?? {}), state };
    events.push(event);
    const located = locateActiveRun(containers, command);
    if (!located) return undefined;
    const { container, run } = located;

    if (state === 'stale-action') {
      run.runRevision = Math.max(0, Number(run.runRevision) || 0) + 1;
      persist();
      return fixtureFailure('stale-run');
    }
    if (state === 'command-timeout') {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return fixtureFailure('command-timeout');
    }
    if (state === 'roll-cancelled') {
      return { success: false, cancelled: true, reason: 'roll-cancelled' };
    }
    if (
      ['automatic-blocker', 'material-shortage'].includes(state) &&
      command.action === 'execute'
    ) {
      return fixtureFailure('selection-required');
    }
    const precondition = stagePreconditionFailure({
      run,
      command,
      recipes,
      now: Number(nowWorldTime()) || NOW,
    });
    if (precondition) return precondition;

    applyFixtureCommand({
      command,
      container,
      run,
      recipes,
      state,
      now: Number(nowWorldTime()) || NOW,
    });
    persist();
    return { success: true };
  }

  return { events, execute };
}

/**
 * The stage preconditions `beginVersionedStage` and `executeVersionedStage` enforce, so no fixture
 * control can succeed where the real command refuses (issue 1648).
 */
function stagePreconditionFailure({ run, command, recipes, now }) {
  if (!['beginStep', 'execute'].includes(command?.action)) return null;
  const index = Math.max(0, Number(run?.currentStepIndex) || 0);
  const step = run?.steps?.[index];
  if (!step) return null;
  const started = Boolean(step.preparedConsumption) || Boolean(step.timeGate);
  const authored = recipeSteps(recipes.find((entry) => entry?.id === run.recipeId))[index];
  const needsStart = normalizeLabList(Object.values(authored?.timeRequirement ?? {})).some(
    (value) => Number(value) > 0
  );
  if (command.action === 'beginStep') {
    if (started) return fixtureFailure('lifecycle-refused', 'This crafting stage has already started.');
    return needsStart
      ? null
      : fixtureFailure('lifecycle-refused', 'This crafting stage has no separate start.');
  }
  if (needsStart && !started) {
    return fixtureFailure(
      'lifecycle-refused',
      'Begin this crafting stage before it can be resolved.'
    );
  }
  const availableAt = Number(step.timeGate?.availableAt);
  return Number.isFinite(availableAt) && now < availableAt
    ? fixtureFailure('lifecycle-refused', 'The crafting step is still in progress.')
    : null;
}

function cloneFixtureValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function fixtureFailure(reason, message = null) {
  return {
    success: false,
    reason,
    message: message ?? `Journal fixture command refused: ${reason}`,
  };
}

function locateActiveRun(containers, command) {
  const key = `${command?.runType ?? ''}Runs`;
  const container = containers?.[key];
  const run = container?.active?.[command?.runId];
  return run ? { container, run } : null;
}

function applyFixtureCommand({ command, container, run, recipes, state, now }) {
  switch (command.action) {
    case 'setCompletionMode': {
      run.completionMode = command.payload?.completionMode === 'worldTime' ? 'worldTime' : 'manual';
      bumpRun(run);
      return;
    }
    case 'setSelection': {
      const stepIndex = Math.max(0, Number(command.payload?.stepIndex) || 0);
      if (run.steps?.[stepIndex]) {
        run.steps[stepIndex].selectionPlan = cloneFixtureValue(
          command.payload?.selectionPlan ?? {}
        );
      }
      bumpRun(run);
      return;
    }
    // The stage-start commit (issue 1648): the choice locks, the materials are spent and the
    // clock starts, in one act. The fixture records the lock; it holds no live inventory to spend.
    case 'beginStep': {
      const stepIndex = Math.max(0, Number(run.currentStepIndex) || 0);
      const step = run.steps?.[stepIndex];
      if (step) {
        const seconds = Number(step.timeGate?.requiredSeconds) || HOUR;
        step.preparedConsumption = {
          selectedIngredientSetId:
            step.selectionPlan?.selectedIngredientSetId ?? step.selectedIngredientSetId ?? null,
          currencySpends: [],
          resolvedEssences: {},
          essenceEnabled: {},
          consumedSummary: [],
        };
        step.timeGate ??= { requiredSeconds: seconds, initiatedAt: now, availableAt: now + seconds };
        step.status = 'waitingTime';
        run.status = 'waitingTime';
      }
      bumpRun(run);
      return;
    }
    case 'pause': {
      const availableAt = Number(
        run.timeGate?.availableAt ?? run.steps?.[run.currentStepIndex]?.timeGate?.availableAt
      );
      run.pauseState = {
        pausedAt: now,
        remainingSeconds: Number.isFinite(availableAt) ? Math.max(0, availableAt - now) : 0,
      };
      bumpRun(run);
      return;
    }
    case 'resume': {
      const remaining = Math.max(0, Number(run.pauseState?.remainingSeconds) || 0);
      const pausedAt = Number(run.pauseState?.pausedAt);
      const ownGate = run.runType === 'gathering' || !Array.isArray(run.steps);
      // `persistResumedRun` re-anchors the DEADLINE and nothing else: `requiredSeconds` is the
      // authored budget and `initiatedAt` records when the stage started, so neither moves across a
      // pause (issue 1648).
      const current = ownGate ? run.timeGate : run.steps[run.currentStepIndex]?.timeGate;
      const gate = { ...(current ?? {}), availableAt: now + remaining };
      if (ownGate) run.timeGate = gate;
      else if (run.steps[run.currentStepIndex]) run.steps[run.currentStepIndex].timeGate = gate;
      run.pausedDurationSeconds =
        Math.max(0, Number(run.pausedDurationSeconds) || 0) +
        (Number.isFinite(pausedAt) ? Math.max(0, now - pausedAt) : 0);
      delete run.pauseState;
      bumpRun(run);
      return;
    }
    case 'cancel': {
      finishFixtureRun({ container, run, status: 'cancelled', now });
      return;
    }
    case 'execute': {
      completeFixtureRun({ container, run, recipes, state, now });
    }
  }
}

function bumpRun(run) {
  run.runRevision = Math.max(0, Number(run.runRevision) || 0) + 1;
}

function completeFixtureRun({ container, run, recipes, state, now }) {
  if (run.taskId) completeGatheringFixture(run, now, state);
  else {
    const recipe = recipes.find((entry) => entry?.id === run.recipeId);
    const stepIndex = Math.max(0, Number(run.currentStepIndex) || 0);
    const current = run.steps?.[stepIndex];
    if (current) {
      current.status = 'succeeded';
      current.completedAt = now;
      current.createdResults = authoredResults(recipe, stepIndex);
      const prototypeKey = Object.keys(JOURNAL_PROTOTYPE_RECIPES).find(
        (key) => journalPrototypeRecipeId(key) === run.recipeId
      );
      if (prototypeKey)
        recordPrototypeStage({ actorUuid: run.actorUuid }, prototypeKey, current, stepIndex, true);
      else current.resolutionSnapshot = { kind: 'none', mode: 'simple' };
      if (recipe?.craftingSystemId === LAB_SYSTEM_IDS.RUNEWORK) {
        current.lastCheckResult = {
          success: true,
          outcome: 'rw-standard',
          value: 17,
          data: { resolvedFormula: '1d20 + 3', total: 17, dc: 12 },
        };
      }
    }
  }
  finishFixtureRun({
    container,
    run,
    status: state === 'history-gathering-check-failure' ? 'failed' : 'succeeded',
    now,
  });
}

function completeGatheringFixture(run, now, state = '') {
  const task = run.economyEvidence?.runtimeSnapshot?.task ?? {};
  const mode = task.resolutionMode ?? 'd100';
  const rolls = {
    'history-d100-all-hit': 100,
    'history-d100-all-miss': 1,
    'history-gathering-check-failure': 3,
  };
  const roll = rolls[state] ?? (mode === 'd100' ? 75 : 17);
  const drops = (task.dropRows ?? []).filter((row) => row?.enabled !== false);
  const clearedDrops = drops.filter((row) => roll >= 101 - Number(row.dropRate));
  const firstGroup =
    task.resultGroups?.find(
      (group) => group.name === (state === 'history-gathering-check-failure' ? 'Barren' : 'Rich')
    ) ?? task.resultGroups?.[0];
  const awarded = mode === 'd100' ? clearedDrops : (firstGroup?.results ?? []);
  run.createdResults = awarded.map((result) => ({
    actorUuid: run.actorUuid,
    componentId: result.componentId,
    quantity: result.quantity ?? 1,
    name: result.name,
    img: result.img,
  }));
  run.checkResult =
    mode === 'straight'
      ? null
      : {
          success: state !== 'history-gathering-check-failure',
          provider: mode === 'd100' ? 'd100' : 'formula',
          ...(mode === 'routed' && { outcome: firstGroup?.name ?? null }),
          roll,
          value: roll,
          data: {
            total: roll,
            resolvedFormula: mode === 'd100' ? '1d100' : '1d20 + 2',
            ...(mode === 'routed' && { dc: task.dc ?? 15 }),
          },
          itemRows: drops.map((row) => ({
            id: row.id,
            componentId: row.componentId,
            finalDropRate: row.dropRate,
            effectiveRoll: roll,
            threshold: 101 - Number(row.dropRate),
            dropped: clearedDrops.includes(row),
            quantity: row.quantity,
          })),
        };
  run.executionJournal = {
    operationId: `${run.id}-collect`,
    requestId: `${run.id}-request`,
    baseRunRevision: run.runRevision ?? 0,
    status: 'committed',
    effects: [
      {
        effectId: 'results',
        kind: 'createGatheredResults',
        phase: 'applied',
        receipt: cloneFixtureValue(run.createdResults),
      },
    ],
  };
  run.completedAtWorldTime = now;
  run.updatedAtWorldTime = now;
}

function finishFixtureRun({ container, run, status, now }) {
  delete container.active[run.id];
  run.status = status;
  run.finishedAt = now;
  if (run.taskId) run.completedAtWorldTime = now;
  bumpRun(run);
  container.history.unshift(run);
}

/**
 * A RESOLVED progressive salvage run, with per-stage outcomes and a fired-complication list (issue
 * 1286).
 *
 * @param {object} options Options.
 * @param {string} options.actorUuid The owning actor's uuid.
 * @param {string} options.userId Owning user id.
 * @returns {object} A persisted-shape terminal salvage run.
 */
function buildResolvedProgressiveSalvageRun({ actorUuid, userId }) {
  return {
    id: 'lab-salvage-progressive-resolved',
    actorUuid,
    userId,
    craftingSystemId: LAB_SYSTEM_IDS.HERBALISM,
    componentId: 'hb-cracked-alembic',
    componentName: 'Cracked Alembic',
    status: 'succeeded',
    startedAt: NOW - 7 * HOUR,
    updatedAt: NOW - 6 * HOUR,
    finishedAt: NOW - 6 * HOUR,
    // The order captured onto the run AT START, which is what a world-time-resumed salvage spends
    // the budget down rather than re-reading the player's settings.
    resultOrder: [
      CRACKED_ALEMBIC_STAGE_IDS.vial,
      CRACKED_ALEMBIC_STAGE_IDS.reagent,
      CRACKED_ALEMBIC_STAGE_IDS.frostcap,
    ],
    consumedComponents: [{ itemUuid: 'Item.hb-cracked-alembic', quantity: 1 }],
    usedTools: [],
    createdResults: [
      {
        itemUuid: 'Item.hb-empty-vial',
        componentId: 'hb-empty-vial',
        quantity: 1,
        name: 'Empty Vial',
        img: `${ICON_BASE}/consumables/potions/bottle-bulb-empty-glass.webp`,
      },
      {
        itemUuid: 'Item.hb-mortar-dust',
        componentId: 'hb-mortar-dust',
        quantity: 1,
        name: 'Ground Reagent',
        img: `${ICON_BASE}/commodities/materials/bowl-powder-grey.webp`,
      },
    ],
    // `outcome` is null for every progressive check by construction, and `value` IS the
    // budget the loop spent — the two facts the stage classification above rests on.
    checkResult: {
      success: true,
      outcome: null,
      value: 5,
      data: {
        formula: '1d20 + @abilities.int.mod',
        resolvedFormula: '1d20 + 0',
        total: 5,
        value: 5,
      },
    },
    failureReason: null,
    firedComplications: [
      {
        resultId: CRACKED_ALEMBIC_STAGE_IDS.reagent,
        componentId: 'hb-mortar-dust',
        complicationId: 'hb-comp-dust-cloud',
        // AWARDED and fired at once, which the prototype never had to draw: its own rule derives
        // "fired" from a stage being short.
        buckets: ['full'],
        name: 'Choking dust',
        description:
          'The reagent goes up in a fine bitter cloud. Everyone at the bench coughs through the next exchange.',
        severity: 'severe',
      },
      {
        resultId: CRACKED_ALEMBIC_STAGE_IDS.frostcap,
        componentId: 'hb-frostcap',
        complicationId: 'hb-comp-frostcap-shatter',
        // The one stage the budget could not pay. `halted` rather than `unreached`: the loop
        // reached it and broke on it, and the two stay distinct even though `stageMissed`
        // unions them.
        buckets: ['halted'],
        name: 'The cap shatters',
        description:
          'The fungus is more ice than flesh by now. Handled short of its stage it bursts across the bench.',
        severity: 'major',
      },
    ],
  };
}

/**
 * The gathering run container: one terminal record and one in-flight BLIND run (issue 901).
 *
 * @param {object} options Options.
 * @param {string} options.actorUuid The owning actor's uuid.
 * @param {string} options.userId Owning user id.
 * @param {object[]} options.environments Real gathering environments.
 * @returns {{active: object, history: object[]}} The `flags.fabricate.gatheringRuns` container.
 */
function buildLabGatheringRuns({ actorUuid, userId, environments }) {
  const { environment, taskId: drawnTaskId } = resolveBlindDraw(environments);
  const blindRun = {
    id: LAB_BLIND_GATHERING_RUN_ID,
    actorUuid,
    userId,
    craftingSystemId: environment.craftingSystemId,
    environmentId: environment.id,
    // The sentinel, not the drawn task. This IS the integrity boundary being photographed.
    taskId: blindWaitingTaskId(environment),
    status: 'waitingTime',
    startedAtWorldTime: NOW - HOUR,
    updatedAtWorldTime: NOW - HOUR,
    timeGate: { requiredSeconds: 6 * HOUR, initiatedAt: NOW - HOUR, availableAt: NOW + 5 * HOUR },
    // The ENVIRONMENT's risk, never the drawn task's `riskOverride` — a per-task override would
    // fingerprint which task was drawn, which is why the blind branch substitutes this one.
    riskLevel: environment.dangerTags?.[0] ?? 'safe',
    conditionSnapshot: environment.conditions ?? {},
    characterModifierSnapshot: null,
  };

  const terminal = resolveDraw(
    environments,
    (entry) => entry?.selectionMode !== 'blind',
    'targeted-selection',
    drawnTaskId
  );
  return {
    active: { [blindRun.id]: blindRun },
    history: [
      {
        id: 'lab-gathering-succeeded',
        actorUuid,
        userId,
        craftingSystemId: terminal.environment.craftingSystemId,
        environmentId: terminal.environment.id,
        taskId: terminal.taskId,
        status: 'succeeded',
        startedAtWorldTime: NOW - 11 * HOUR,
        updatedAtWorldTime: NOW - 10 * HOUR,
        completedAtWorldTime: NOW - 10 * HOUR,
      },
    ],
  };
}

/**
 * Write the run containers onto an actor's Fabricate flags.
 *
 * @param {object} actor The actor to stock.
 * @param {object} containers Output of {@link buildLabRunStates}.
 */
export function installLabRunStates(actor, containers) {
  // Each container goes at the ONE depth production writes it, and the three do not agree:.
  // crafting flags.fabricate.fabricate.craftingRuns (setFabricateFlag -> dotted top-level key
  // salvage flags.fabricate.fabricate.salvageRuns -> V13 expandObject -> doubly nested) gathering
  // flags.fabricate.gatheringRuns (bare setFlag, inner key has no dot)
  for (const [key, container] of Object.entries(containers)) {
    const path = RUN_CONTAINER_PATHS[key];
    if (!path) throw new Error(`labRunStates: no known flag path for container "${key}"`);
    seedFabricateFlag(actor, path, container);
  }

  // Rebind so the accessors read the flags object as it now stands, with real V13 semantics.
  actor.getFlag = makeGetFlag(actor);
  actor.setFlag = makeSetFlag(actor);
}
