/**
 * The Iterative Step State a step start writes, resolved before the start consumes anything: the
 * first step's Counter Instance starts against live roll data, a later step the counters the
 * previous step ended with.
 */
import { cloneJson } from '../../utils/scalars.js';
import { actorRollData } from '../checkTarget.js';

import { buildAttemptLibrary } from './attemptLibrary.js';
import { createIterativeStepState, readIterativeStepState } from './iterativeStepState.js';
import { ITERATIVE_ATTEMPT_REFUSALS, resolveStartedWith } from './resolveAttempt.js';

const refusal = (reason, detail = {}) => ({ refusal: { success: false, reason, detail } });

/** A later step's start: the previous step's final counters verbatim, recorded as carried. */
function carriedStart(previous) {
  const counters = cloneJson(previous.counters);
  const startedWith = counters.map(({ counterId, value }) => ({
    counterId,
    value,
    formulaValue: null,
    rolls: [],
    clamped: false,
  }));
  return createIterativeStepState({ counters, startedWith });
}

/**
 * `{ state }` for step `stepIndex` of an iterative run, `{ refusal }` when it cannot start, or
 * `null` for a run without iterative terms. `rollDie(faces)` draws a start formula's dice.
 */
export function prepareIterativeStepStart({ run, stepIndex, actor, rollDie }) {
  const terms = run?.termsSnapshot;
  if (!terms?.iterative) return null;
  if (stepIndex > 0) {
    const previous = readIterativeStepState(run.steps?.[stepIndex - 1]?.iterative);
    if (!previous) return refusal(ITERATIVE_ATTEMPT_REFUSALS.invalidEntry, { kind: 'state' });
    if (!previous.supported) return refusal(ITERATIVE_ATTEMPT_REFUSALS.versionUnsupported);
    return { state: carriedStart(previous.state) };
  }
  const library = buildAttemptLibrary(terms.iterative, terms.recipe, stepIndex);
  const started = resolveStartedWith({ library, rollData: actorRollData(actor), rollDie });
  if (!started.ok) return refusal(started.reason, started.detail);
  return { state: createIterativeStepState(started) };
}
