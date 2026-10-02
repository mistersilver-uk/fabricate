/**
 * Which of a counting check's triggers its pool can fire (issue 2006), and whether one can rescue an
 * attempt the dice alone cannot reach (issue 2008). It imports nothing under `src/ui/`.
 */
import { normalizeCheckEvaluation } from './normalize/checkEvaluation.js';

const FACE_TESTS = Object.freeze({
  '==': (face, value) => face === value,
  '<=': (face, value) => face <= value,
  '>=': (face, value) => face >= value,
  '<': (face, value) => face < value,
  '>': (face, value) => face > value,
});

const TIER_STEP_MODES = new Set(['up', 'down', 'target']);

/** Whether a dice condition can fire on the pool's one group: group 0, a face the die shows. */
export function poolCanFire(condition, { groupId, sides }) {
  if (Number(condition?.groupId) !== groupId) return false;
  if (condition.aggregate === 'total') return true;
  const test = FACE_TESTS[condition.operator];
  const value = Number(condition.value);
  for (let face = 1; face <= sides; face += 1) if (test?.(face, value)) return true;
  return false;
}

/**
 * Whether a trigger forces success or, on a routed check, steps or targets a tier, and is not a
 * dice trigger the pool can never fire.
 */
export function countTriggerRescues({ triggers, evaluation, routed = false }) {
  const group = { groupId: 0, sides: normalizeCheckEvaluation(evaluation).pool.die };
  return (Array.isArray(triggers) ? triggers : []).some((trigger) => {
    const moves =
      trigger?.outcome === 'success' || (routed && TIER_STEP_MODES.has(trigger?.tierStep?.mode));
    if (!moves) return false;
    return trigger.condition?.type !== 'diceGroup' || poolCanFire(trigger.condition, group);
  });
}
