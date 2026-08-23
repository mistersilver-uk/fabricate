/**
 * Journal run states for the View Lab.
 *
 * The smoke reaches its journal frames by actually crafting: it starts runs, advances them, lets
 * some fail and cancels others, then screenshots what the journal shows. The lab cannot do that in
 * a static capture, so it writes the run records directly — the same shapes
 * `CraftingRunManager` / `SalvageRunManager` / `GatheringRunManager` persist, onto the same actor
 * flags they read (`fabricate.craftingRuns`, `.salvageRuns`, `.gatheringRuns`), each a
 * `{ active: {id: run}, history: [run] }` container.
 *
 * This is the one place in the lab where a record is authored rather than produced by the real
 * engine, and it is deliberate: a journal frame's job is to show how a run of a given STATUS renders,
 * and driving a real failure or a real time-gate maturation from a screenshot harness would take
 * more machinery than the frame is worth. The shapes are taken from the managers themselves, so a
 * field the journal reads is a field that exists.
 *
 * Statuses covered, because each renders differently:
 *   inProgress · waitingTime (time-gated, not yet mature) · succeeded · failed · cancelled
 * crossed with single-step and multi-step, because the step rail only appears for the latter.
 *
 * Two records are authored for a reason beyond how they RENDER, and each says so where it is built:
 * the in-flight blind gathering run in {@link buildLabGatheringRuns}, which exists so the Journal's
 * viewer-dependent redaction (issue 901) has a state to be photographed in at all; and the resolved
 * progressive salvage run in {@link buildResolvedProgressiveSalvageRun}, which exists so the
 * complication feature's FIRED state (issue 1286) is reachable — every `player-salvage*` case is
 * pre-roll, so without it no frame and no parity region could show a complication that has fired.
 */

import { blindWaitingTaskId } from '../../../src/systems/gatheringEngineInternals.js';

import { CRACKED_ALEMBIC_STAGE_IDS, ICON_BASE, LAB_SYSTEM_IDS } from './labContent.js';
import { RUN_CONTAINER_PATHS, makeGetFlag, makeSetFlag, seedFabricateFlag } from './labFlags.js';

/** World time the lab pins to; a run's timestamps are relative to it. */
const NOW = 1_209_600;
const HOUR = 3600;

/**
 * The in-flight BLIND gathering run (issue 901), and the run id its GM-owned secret is keyed by.
 *
 * Exported because the secret does NOT live on the actor — that is the whole point of the fix — so
 * `labWorld.js` has to write the matching `gatheringBlindRuns` world-setting record under this same
 * id. Two literals in two files would be one rename away from a run whose GM preview resolves to
 * nothing, which renders as the PLAYER's frame under the GM's name: exactly the confident, wrong
 * screenshot this harness exists to prevent.
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
 * DERIVED, never authored. The blind marker is `blind:<environmentId>` and the drawn task must be
 * one the environment actually composes, so both are read out of the fixture world rather than
 * spelled a second time here — a run naming an environment or task the world does not contain
 * resolves to nothing and renders as a generic stub, which is indistinguishable from the redaction
 * this frame exists to evidence. Throws rather than degrading, for the same reason.
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
function resolveDraw(environments, predicate, description, avoid = null) {
  const environment = (environments ?? []).find((entry) => predicate(entry));
  if (!environment) {
    throw new Error(`labRunStates: the lab world declares no ${description} gathering environment`);
  }
  // `compositionMode: 'manual'` puts the composed set in `forcedTaskIds`; an automatic environment
  // lists them in `enabledTaskIds`. Either is the real set of tasks that environment can yield.
  const composed = environment.forcedTaskIds ?? environment.enabledTaskIds ?? [];
  // `avoid` keeps the completed run off the blind run's drawn task. Not cosmetic: the GM frame is
  // read by comparing the secret preview against the rows around it, and a history row carrying the
  // same task name makes "the GM sees the drawn task" indistinguishable from a coincidence.
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
 * This is the half of a blind run that does NOT live on the actor. `GatheringBlindRunStore` keys it
 * by run id inside the `gatheringBlindRuns` WORLD setting, which only a GM may write — so it is the
 * only place the drawn task exists, and the only reason a GM's Journal can preview it. Built here,
 * beside the run it belongs to, so the marker and the secret cannot disagree about which task was
 * drawn.
 *
 * `reservation` is deliberately absent: a reservation is taken only against a node pool, and
 * herbalism runs no resource economy, so production would record none either.
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
    // it stood at START. The Journal's GM preview reads it only as a FALLBACK — it prefers the
    // composed environment's task — so this being the library record rather than the composed one
    // does not change the frame; it keeps the record the shape production writes.
    snapshot: { task, events: [], rules: {}, conditions: environment.conditions ?? {} },
    createdAtWorldTime: NOW - HOUR,
  };
}

/**
 * Build every journal state the smoke captures, for one actor and a set of real recipe ids.
 *
 * Recipe ids come from the seeded world rather than being invented: the journal resolves each run's
 * recipe to render its name, ingredients and step list, so a run pointing at a recipe that does not
 * exist renders as a redacted stub and proves nothing.
 *
 * @param {object} options Options.
 * @param {object} options.actor The actor the runs belong to.
 * @param {string} options.userId Owning user id.
 * @param {Array<{id: string, craftingSystemId: string, steps?: unknown[]}>} options.recipes Real recipes.
 * @param {object[]} options.environments Real gathering environments, for the blind run below.
 * @returns {{craftingRuns: object, salvageRuns: object, gatheringRuns: object}} Flag containers.
 */
export function buildLabRunStates({ actor, userId, recipes, environments }) {
  const actorUuid = actor.uuid;
  const multiStep = recipes.find((recipe) => (recipe.steps?.length ?? 0) > 1) ?? recipes[0];
  const single = recipes.find((recipe) => (recipe.steps?.length ?? 0) <= 1) ?? recipes[0];
  const pick = (index) => recipes[index % recipes.length] ?? recipes[0];

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

  return {
    craftingRuns: { active, history },
    // Salvage and gathering share the container shape. One terminal salvage record is enough for
    // the journal's mixed-source list to show all three kinds side by side; gathering carries an
    // in-flight blind run as well, because that state is the one the Journal used to leak.
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
}

/**
 * A RESOLVED progressive salvage run, with per-stage outcomes and a fired-complication list.
 *
 * ## Why it has to exist at all (issue 1286)
 *
 * The complication feature's player treatment has two states — forecast and FIRED — and the
 * fired one is a fact about a resolution that already happened. Every `player-salvage*` case
 * is pre-roll, and the one salvage record this module already seeds carries
 * `createdResults: []` on a Simple-mode component, so before this the fired treatment was
 * unreachable in the lab: no frame could show it and no parity region could measure it. This
 * is that state, authored the way every other record here is authored.
 *
 * ## The numbers are the award loop's, not decoration
 *
 * `hb-cracked-alembic` resolves salvage progressively, and its ordered stages cost their
 * result components' own difficulties: Empty Vial 1, Ground Reagent 2, Frostcap Mushroom 4.
 * The budget is the check's `value` verbatim (`initialRemaining: Number(checkResult?.value)`),
 * and a progressive check never fails — `runFormulaProgressive` returns `success: true` and a
 * raw total, with no threshold gate — so a total of 5 is a legal successful resolution that
 *
 *   - pays stage 1 (1), leaving 4;
 *   - pays stage 2 (2), leaving 2;
 *   - cannot pay stage 3 (4) and BREAKS, under this system's `awardMode: 'equal'`.
 *
 * That leaves two stages `full`, one `halted`, none `unreached` and none `skipped` — which is
 * why `createdResults` holds exactly two records and why the fired list names stage 2 and
 * stage 3 rather than all three. A record whose arithmetic did not close would publish a
 * confident, wrong screenshot, which is the failure this whole harness exists to prevent.
 *
 * Quantities are 1 and not the authored 2 and 1: the progressive salvage branch forces
 * `quantity: 1` per stage, so a record echoing the group's authored quantities would disagree
 * with the items the engine actually creates.
 *
 * ## `firedComplications` carries `publicComplications`' whole output
 *
 * The list is written at write time with `publicComplications`, because the container is an
 * actor flag replicated to every client with actor permission. Two consequences are seeded
 * literally rather than described:
 *
 *   - `hb-comp-dust-spoiled` fires here too — it is enabled for salvage and its only clause is
 *     `stageAwarded`, which stage 2 satisfies — and it is ABSENT from this list, because it is
 *     `gmOnly`. That absence is the disclosure guarantee, in the one document a player reads.
 *   - the entries are keyed by `resultId`, not by `componentId`, so the badge lands on the
 *     occurrence that fired and on none of that component's others. `resultId` is stable only
 *     because `labContent.js` authors the stage ids; see `CRACKED_ALEMBIC_STAGE_IDS`.
 *
 * The four keys the delta pins for the run record (`resultId`, `componentId`,
 * `complicationId`, `buckets`) are a SUBSET of what `publicComplications` returns, and the
 * projection's own docblock says a caller persisting it may narrow but must not widen. This
 * seeds the unnarrowed shape, so a reader that takes only the four still reconciles and a
 * strip that renders the authored name and description has something to render.
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
    // The order captured onto the run AT START, which is what a world-time-resumed salvage
    // spends the budget down rather than re-reading the player's settings. Authored order
    // here: this run was not reordered.
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
        // AWARDED and fired at once, which the prototype never had to draw: its own rule
        // derives "fired" from a stage being short. The stage keeps its success chip and
        // carries the fired band beneath it.
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
 * The gathering run container: one terminal record and one in-flight BLIND run.
 *
 * ── The blind run (issue 901) ────────────────────────────────────────────────────────────────
 *
 * The Journal is the surface that shows in-flight gathering runs, and before the fix it resolved a
 * blind run's real task id straight to the task NAME and rendered it to the acting player. The two
 * journal frames the changed-file mapping already selected could not show that either way, because
 * this world contained no blind run at all — a green gate over frames that evidence nothing, which
 * is worse than a red one because it looks like proof.
 *
 * What makes the frame evidence is the SHAPE. The persisted run carries only
 * `blindWaitingTaskId(environment)` — imported from the runtime rather than spelled `blind:` here,
 * so a change to the marker moves the fixture with it — plus the time gate and the environment's
 * risk. It carries NO task id and NO runtime snapshot: those are precisely what moved off the
 * player-owned flag and into the GM-owned world setting (see {@link buildLabBlindRunSecret}).
 * Seeding the real task here would reinstate the leak in the fixture and let a player frame pass
 * while showing the task name.
 *
 * ── The terminal run ──────────────────────────────────────────────────────────────────────────
 *
 * `lab-gathering-succeeded` previously carried neither `environmentId` nor `taskId`, and named its
 * timestamps `startedAt`/`updatedAt`/`finishedAt`. `GatheringRunManager._normalizeRun` rejects a
 * record missing any of `id`/`craftingSystemId`/`environmentId`/`taskId` and reads
 * `startedAtWorldTime`/`updatedAtWorldTime`/`completedAtWorldTime`, so the record was dropped whole
 * and the journal's gathering history has been empty in every published frame — the fixture-shape
 * failure class this module's own header describes. Repaired here so the new blind card is not the
 * only gathering row that is real.
 *
 * It resolves in a TARGETED environment, deliberately. A completed blind run reveals its task
 * (`revealPolicy: 'onSuccess'`), so putting the history row in the blind environment too would put
 * a real task name one row below the redacted one and invite the frame to be read as a leak.
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
  // Each container goes at the ONE depth production writes it, and the three do not agree:
  //
  //   crafting  flags.fabricate.fabricate.craftingRuns   (setFabricateFlag -> dotted top-level key
  //   salvage   flags.fabricate.fabricate.salvageRuns     -> V13 expandObject -> doubly nested)
  //   gathering flags.fabricate.gatheringRuns            (bare setFlag, inner key has no dot)
  //
  // Verified against `src/systems/runFlagInvalidation.js`, which is the authority, and against
  // V13's `updateSource` expanding only when a TOP-LEVEL key contains a dot.
  //
  // This previously wrote every container at BOTH the bare and the dotted key "to be safe". That
  // was worse than picking wrong: with both spellings present, every reader finds something at
  // whatever depth it looks, so the lab could never reproduce a depth bug — including the one this
  // branch shipped and then fixed. Seeding one shape is what makes the frame evidence.
  for (const [key, container] of Object.entries(containers)) {
    const path = RUN_CONTAINER_PATHS[key];
    if (!path) throw new Error(`labRunStates: no known flag path for container "${key}"`);
    seedFabricateFlag(actor, path, container);
  }

  // Rebind so the accessors read the flags object as it now stands, with real V13 semantics.
  actor.getFlag = makeGetFlag(actor);
  actor.setFlag = makeSetFlag(actor);
}
