/**
 * What the Journal offers on a run: whether its stage still has its own start, and each action
 * this viewer may take with the one code that says why they may not. An iterative run is worked
 * one Iterative Attempt at a time, so it is never executed, paused or set to complete on its own.
 */
import { readIterativeRun } from './iterative/iterativeRunRead.js';

const DAY_SECONDS = 24 * 60 * 60;

/**
 * Convert a recipe/step `timeRequirement` (`{minutes,hours,days,months,years}`)
 * into a non-negative second count. Mirrors `CraftingRunManager._durationToSeconds`
 * (months = 30 days, years = 365 days) so the projection's required-time read
 * matches the gate the engine arms.
 */
export function durationToSeconds(timeRequirement = null) {
  if (!timeRequirement || typeof timeRequirement !== 'object') return 0;
  const minutes = Number(timeRequirement.minutes || 0);
  const hours = Number(timeRequirement.hours || 0);
  const days = Number(timeRequirement.days || 0);
  const months = Number(timeRequirement.months || 0);
  const years = Number(timeRequirement.years || 0);
  return Math.max(
    0,
    minutes * 60 +
      hours * 60 * 60 +
      days * DAY_SECONDS +
      months * 30 * DAY_SECONDS +
      years * 365 * DAY_SECONDS
  );
}

/**
 * Whether the live stage still has its own start, and whether it has taken it. A
 * zero-duration stage has no waiting window, so it never has one to take, except an iterative
 * step, which always begins on its own, as the engine's own start does.
 * @returns {{needed: boolean, locked: boolean, started: boolean, required: boolean}|null}
 */
export function stageStartState({ activeStep, recipeStep, system }) {
  if (!activeStep) return null;
  const needed =
    system?.resolutionMode === 'iterative' ||
    (durationToSeconds(recipeStep?.timeRequirement) > 0 &&
      system?.requirements?.time?.enabled !== false);
  // `locked` is the D-028 commit; `started` also covers a stage armed before it shipped,
  // which cannot be begun again even though its plan was never locked.
  const locked = Boolean(activeStep.preparedConsumption);
  const started = locked || Boolean(activeStep.timeGate);
  return { needed, locked, started, required: needed && !started };
}

/** What this viewer may do to this run, and the one code that says why they may not. */
function shippedRunActions({
  run,
  runType,
  terminal,
  derivedStatus,
  timeGate,
  hasPlayerCheck,
  stageStart,
  entitled,
  paused,
  mutableCurrent,
  executableType,
  legacyExecute,
  legacyCancel,
  readyToExecute,
  stageBlocker,
  awaitingStageStart,
  blockedReason,
  recoveryClaim,
  reconcileUncertain,
}) {
  // The stage-start boundary is a SEPARATE fact from whether the begin control is
  // enabled (M15). `atStageStart` alone decides which control renders — the begin
  // decision, not the ordinary primary — so gating `beginStep` on the player's own
  // unmade choice can never also make the control disappear and hand back an
  // enabled primary that the command refuses.
  const atStageStart = mutableCurrent && runType === 'crafting' && !paused && awaitingStageStart;
  return {
    execute: legacyExecute || (mutableCurrent && !paused && executableType && readyToExecute),
    pause:
      mutableCurrent &&
      executableType &&
      !paused &&
      run?.status === 'waitingTime' &&
      Boolean(timeGate),
    resume: mutableCurrent && executableType && paused,
    setCompletionMode:
      mutableCurrent &&
      executableType &&
      !paused &&
      derivedStatus === 'waiting' &&
      Boolean(timeGate) &&
      !hasPlayerCheck,
    atStageStart,
    // Offered only where `beginVersionedStage` would commit the stage: `stageBlocker` carries
    // every cause that command refuses on, so none of them is offered and then refused.
    beginStep: atStageStart && stageBlocker === null,
    setSelection:
      mutableCurrent && runType === 'crafting' && entitled && stageStart?.locked !== true,
    cancel: legacyCancel || (mutableCurrent && executableType),
    dismiss: terminal,
    disabledReason:
      blockedReason ?? stageBlocker ?? (awaitingStageStart ? 'stageNotStarted' : null),
    reconcileUncertain,
    ...(recoveryClaim && { recoveryClaim }),
  };
}

/**
 * An iterative run's actions over the shipped ones. An attempt reads no entitlement, because
 * redaction hides identity only; a begun step reports no stage blocker, because its stage has
 * already spent what it needed.
 */
function iterativeRunActions(actions, facts, args) {
  const { mutableCurrent, paused, stageBlocker, blockedReason } = args;
  const unsupported = facts.supported ? null : 'version-unsupported';
  const takeAction =
    mutableCurrent &&
    !paused &&
    facts.started &&
    args.derivedStatus !== 'waiting' &&
    facts.supported &&
    facts.state?.terminal === null;
  const disabledReason = facts.started
    ? (blockedReason ?? unsupported)
    : (blockedReason ?? unsupported ?? stageBlocker ?? 'stageNotStarted');
  return {
    ...actions,
    execute: false,
    pause: false,
    resume: false,
    setCompletionMode: false,
    beginStep: actions.atStageStart && stageBlocker === null && facts.supported,
    takeAction,
    disabledReason: args.terminal ? actions.disabledReason : disabledReason,
  };
}

/** What this viewer may do to this run; an iterative run also says whether it can take an attempt. */
export function runActions(args) {
  const actions = shippedRunActions(args);
  const facts =
    args.runType === 'crafting' ? readIterativeRun(args.run, { terminal: args.terminal }) : null;
  return facts ? iterativeRunActions(actions, facts, args) : actions;
}
