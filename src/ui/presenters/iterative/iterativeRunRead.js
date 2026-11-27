/**
 * Where an iterative run stands, read once from its persisted steps and accepted terms: which step
 * a surface describes, whether that step has begun, and whether this release can read it.
 */
import { readIterativeStepState } from '../../../systems/iterative/iterativeStepState.js';
import { iterativeLibraryVersionUnsupported } from '../../../systems/normalize/iterativeLibrary.js';
import { arrayOrEmpty } from '../../../utils/scalars.js';

/** A run with accepted iterative terms, or one whose steps already hold an Iterative Step State. */
export function isIterativeRun(run) {
  return (
    Boolean(run?.termsSnapshot?.iterative) ||
    arrayOrEmpty(run?.steps).some((step) => step?.iterative != null)
  );
}

/** The newest step holding a state, for a record whose run no longer names a current step. */
function lastStartedIndex(steps) {
  const index = steps.findLastIndex((step) => readIterativeStepState(step?.iterative) !== null);
  return Math.max(0, index);
}

/**
 * `null` for a run that is not iterative, else the focus step: the current step once begun, the
 * one before it at a boundary, and the last begun step of a closed run. `state` is that step's
 * readable state or `null`, and `supported` is false when its state or the terms are newer.
 * @returns {null | { focusStepIndex: number, currentStepIndex: number | null, boundary: boolean,
 *   started: boolean, state: object | null, supported: boolean }}
 */
export function readIterativeRun(run, { terminal = false } = {}) {
  if (!isIterativeRun(run)) return null;
  const steps = arrayOrEmpty(run.steps);
  const current = Number.isInteger(run.currentStepIndex) ? run.currentStepIndex : null;
  const currentRead = current === null ? null : readIterativeStepState(steps[current]?.iterative);
  const boundary = !terminal && current > 0 && currentRead === null;
  let focusStepIndex = current ?? lastStartedIndex(steps);
  if (terminal) focusStepIndex = lastStartedIndex(steps);
  else if (boundary) focusStepIndex = current - 1;
  const read = readIterativeStepState(steps[focusStepIndex]?.iterative);
  const termsAhead = iterativeLibraryVersionUnsupported(run.termsSnapshot?.iterative);
  return {
    focusStepIndex,
    currentStepIndex: current,
    boundary,
    started: !terminal && currentRead !== null,
    state: read?.supported ? read.state : null,
    supported: !termsAhead && read?.supported !== false,
  };
}
