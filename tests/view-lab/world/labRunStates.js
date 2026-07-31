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
 */

const FLAG_NAMESPACE = 'fabricate';

/** World time the lab pins to; a run's timestamps are relative to it. */
const NOW = 1_209_600;
const HOUR = 3600;

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
 * @returns {{craftingRuns: object, salvageRuns: object, gatheringRuns: object}} Flag containers.
 */
export function buildLabRunStates({ actor, userId, recipes }) {
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
    // Salvage and gathering share the container shape; one terminal record each is enough for the
    // journal's mixed-source list to show all three kinds side by side.
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
      ],
    },
    gatheringRuns: {
      active: {},
      history: [
        {
          id: 'lab-gathering-succeeded',
          actorUuid,
          userId,
          craftingSystemId: single?.craftingSystemId,
          status: 'succeeded',
          startedAt: NOW - 11 * HOUR,
          updatedAt: NOW - 10 * HOUR,
          finishedAt: NOW - 10 * HOUR,
        },
      ],
    },
  };
}

/**
 * Write the run containers onto an actor's Fabricate flags.
 *
 * @param {object} actor The actor to stock.
 * @param {object} containers Output of {@link buildLabRunStates}.
 */
export function installLabRunStates(actor, containers) {
  actor.flags = actor.flags ?? {};
  const scope = { ...(actor.flags[FLAG_NAMESPACE] ?? {}) };

  // Written under BOTH the bare key and the dotted one. `getFabricateFlag` normalises
  // `craftingRuns` to `fabricate.craftingRuns` before calling `getFlag`, because Foundry V13 stores
  // a dotted flag key literally — so a container written only at the bare key is invisible to every
  // reader, and the journal renders empty with the runs sitting right there on the actor.
  for (const [key, container] of Object.entries(containers)) {
    scope[key] = container;
    scope[`${FLAG_NAMESPACE}.${key}`] = container;
  }
  actor.flags[FLAG_NAMESPACE] = scope;

  // The lab's actors answer `getFlag` from a closure over their original flags object, so rebind it
  // to what was just written — literal key first, then a dotted traversal, which is how Foundry
  // resolves the two spellings.
  actor.getFlag = (namespace, key) => {
    const bucket = actor.flags?.[namespace];
    if (!bucket) return null;
    if (key in bucket) return bucket[key];
    return (
      String(key)
        .split('.')
        .reduce((current, part) => (current == null ? current : current[part]), bucket) ?? null
    );
  };
  actor.setFlag = async (namespace, key, value) => {
    actor.flags[namespace] = { ...(actor.flags[namespace] ?? {}), [key]: value };
    return actor;
  };
}
