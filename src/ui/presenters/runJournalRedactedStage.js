/**
 * A crafting run's stage models, and the readiness its lifecycle is judged on (issue 3033).
 *
 * A visible run projects every stage and is judged on its current one. A redacted run projects
 * none, yet its current stage is judged by the same model the visible path builds, of which only
 * the blocker code is kept: the viewer learns why the stage waits, never what it was judged from.
 */

/**
 * @param {object} args
 * @param {(args: object) => object} args.buildStep Builds one stage model (`_craftingStepModel`).
 * @param {boolean} args.redacted Whether this viewer is denied the recipe's identity.
 * @param {object[]} args.runSteps The run's persisted stages.
 * @param {object[]} args.recipeSteps The recipe's execution steps, `[]` when it does not resolve.
 * @param {number|null} args.currentStepIndex
 * @param {object|null} args.activeStep The live current stage, `null` for a terminal run.
 * @param {object} args.shared Every other `buildStep` argument; `recipe` and `terminal` are read.
 * @returns {{steps: object[], currentStep: object|null, readiness: object|null|undefined}}
 */
export function craftingStageModels({
  buildStep,
  redacted,
  runSteps,
  recipeSteps,
  currentStepIndex,
  activeStep,
  shared,
}) {
  const live = Boolean(activeStep) && Number.isFinite(currentStepIndex);
  const stageModel = (runStep, index) =>
    buildStep({
      ...shared,
      runStep,
      recipeStep: recipeSteps[index] ?? null,
      index,
      isCurrent: !shared.terminal && index === currentStepIndex,
    });
  if (redacted) {
    const judged =
      live && shared.recipe
        ? stageModel(runSteps[currentStepIndex], currentStepIndex).selectionAvailability
        : null;
    return { steps: [], currentStep: null, readiness: judged ? { blocker: judged.blocker } : null };
  }
  const steps = runSteps.map((runStep, index) => stageModel(runStep, index));
  const currentStep = live ? (steps[currentStepIndex] ?? null) : null;
  return { steps, currentStep, readiness: currentStep?.selectionAvailability };
}
