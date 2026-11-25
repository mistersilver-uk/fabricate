/**
 * What the authority checks of an Iterative Attempt before it rolls and again under its claim:
 * the step state, the gate, the action, Tool presence and preflight. A `check: 'roll'` action
 * describes the routed check, keyed to its action id.
 */
import { actorRollData } from '../checkTarget.js';
import { CraftingLifecycleExecutionError } from '../CraftingLifecycleExecutor.js';
import { getRunLifecycleContract } from '../runLifecycleState.js';
import { resolveRunRecipe } from '../runTerms.js';
import { describeVersionedCheck } from '../versionedCheckDescriptor.js';

import { buildAttemptLibrary } from './attemptLibrary.js';
import { readIterativeStepState } from './iterativeStepState.js';
import { ITERATIVE_ATTEMPT_REFUSALS, preflightAttempt } from './resolveAttempt.js';

const failure = (reason, detail = {}) => ({ refusal: { success: false, reason, detail } });

/** The run's current step: its recipe view, state and selected set, or the refusal it starts with. */
function currentStep(engine, run) {
  if (!run?.termsSnapshot?.iterative) return failure('unsupported-operation');
  const recipe = resolveRunRecipe(run, engine.recipeManager);
  const stepIndex = Number(run.currentStepIndex);
  const step = engine._executionSteps(recipe)[stepIndex];
  const record = run.steps?.[stepIndex];
  const read = readIterativeStepState(record?.iterative);
  if (!step || !read) return failure('step-not-started');
  if (!read.supported) {
    return failure(ITERATIVE_ATTEMPT_REFUSALS.versionUnsupported, {
      stateVersion: read.state.version,
    });
  }
  if (!engine._versionedGateReady(run)) return failure('step-time-pending');
  const selectedId = record.selectionPlan?.selectedIngredientSetId;
  const selectedSet = engine._selectedIngredientSet(step, selectedId);
  return { recipe, stepIndex, step, selectedSet, state: read.state };
}

/**
 * Inspects an attempt of `actionId` on `run` for `actor`: a `{ refusal }` with nothing spent, or
 * the recipe, step, state, terms library, action, roll data, started-stage preparation and Tools.
 */
export async function inspectIterativeAttempt(
  engine,
  { actor, componentSourceActors, run, actionId }
) {
  const current = currentStep(engine, run);
  if (current.refusal) return current;
  const { recipe, stepIndex, step, selectedSet, state } = current;
  const terms = run.termsSnapshot;
  const library = buildAttemptLibrary(terms.iterative, terms.recipe, stepIndex);
  const action = library.actions.find((entry) => entry?.id === actionId);
  if (!action) return failure('action-not-found', { actionId });
  const stage = { run, actor, componentSourceActors, recipe, step, stepIndex, selectedSet };
  const prepared = await engine._reconstructStartedVersionedStage(stage);
  if (!prepared.valid) return failure('tools-unavailable');
  const rollData = actorRollData(actor);
  const preflight = preflightAttempt({ state, action, library, rollData });
  if (!preflight.ok) return failure(preflight.reason, preflight.detail);
  const tools = prepared.toolValidation.tools; // ratchet-exempt(world-scope): not-a-system
  return { ...current, library, action, rollData, prepared, tools };
}

/** The resolver's check summary from the routed result the authority evaluated. */
export function iterativeCheckSummary(resolvedCheckResult) {
  const outcomeId = resolvedCheckResult?.data?.outcomeId ?? null;
  return {
    success: outcomeId !== null && resolvedCheckResult?.success === true,
    outcomeId,
    value: Number(resolvedCheckResult?.value),
  };
}

/** The active run a describe reads, refusing one that cannot take an attempt now. */
function describableRun(engine, actor, runId) {
  const runManager = engine._craftingRunManager();
  runManager?.invalidateCache?.(actor?.id);
  const run = runManager?.getActiveRun?.(actor, runId) ?? null;
  if (run && getRunLifecycleContract(run) === 'current' && !run.pauseState) return run;
  throw new CraftingLifecycleExecutionError(
    'The crafting stage is not available for a check',
    'STAGE_NOT_EXECUTABLE'
  );
}

/**
 * Describes the check of one Iterative Attempt under a `describeCheck` grant: a refusal as
 * `{ required: false, blocked, detail }`, nothing for a `check: 'none'` action, else the routed
 * descriptor whose private evaluation names `actionId`.
 */
export async function describeIterativeAttemptCheck(
  engine,
  { actor, componentSourceActors, runId, actionId, preparationGrant, requestId }
) {
  await engine._consumeVersionedGrant(preparationGrant, {
    operation: 'describeCheck',
    actor,
    runId,
    expectedRevision: null,
    requestId,
  });
  const run = describableRun(engine, actor, runId);
  const inspected = await inspectIterativeAttempt(engine, {
    actor,
    componentSourceActors,
    run,
    actionId,
  });
  if (inspected.refusal) {
    const { reason, detail } = inspected.refusal;
    return { required: false, blocked: reason, detail: { detail } };
  }
  if (inspected.action.check !== 'roll') return { required: false };
  const { recipe, step, stepIndex, selectedSet, tools } = inspected;
  const descriptor = await describeVersionedCheck(engine, {
    actor,
    componentSourceActors,
    recipe,
    step,
    stepIndex,
    selectedSet,
    prepareTools: async () => tools,
  });
  return { ...descriptor, privateEvaluation: { ...descriptor.privateEvaluation, actionId } };
}
