/**
 * Pure `producedWhen` routing: at a terminal outcome, the first result group, in order, with a
 * line for that end whose rules all hold. A group with no `producedWhen` never matches, and a
 * failure group is selected only by its lines, never by its role.
 */
import { arrayOrEmpty } from '../../utils/scalars.js';

import { evaluateCounterRule } from './counterRule.js';

/** Whether every rule of `line` holds against `facts`; an absent or empty list always holds. */
export function producedLineHolds(line, facts) {
  return arrayOrEmpty(line?.rules).every((rule) => evaluateCounterRule(rule, facts));
}

/** The first group whose `end` line holds, or `null` when no line matches. */
export function selectProducedGroup(resultGroups, end, facts) {
  const holds = (line) => line?.end === end && producedLineHolds(line, facts);
  return (
    arrayOrEmpty(resultGroups).find((group) => arrayOrEmpty(group?.producedWhen).some(holds)) ??
    null
  );
}
