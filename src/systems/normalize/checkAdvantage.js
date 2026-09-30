import { integerInRange } from './checkEvaluation.js';

const MODES = Object.freeze(['off', 'keep', 'bonus']);

/**
 * Produces the persisted advantage rule, a sibling of a check's `evaluation` (issue 2007). All six
 * keys are kept whatever the evaluation: summing reads the first four, counting the last two.
 * The defaults reproduce the pre-record roll for a plain first `1d20`, so no migration runs.
 */
export function normalizeCheckAdvantage(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    mode: MODES.includes(source.mode) ? source.mode : 'keep',
    extraDice: integerInRange(source.extraDice, 1, 4, 1),
    bonusExpression: typeof source.bonusExpression === 'string' ? source.bonusExpression : '1d6',
    offerDisadvantage: source.offerDisadvantage !== false,
    countEnabled: source.countEnabled !== false,
    countDice: integerInRange(source.countDice, 1, 5, 1),
  };
}
