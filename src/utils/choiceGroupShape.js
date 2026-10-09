/**
 * A result-side choice group's shape (issue 1773): what makes an entry a group, and the setting and
 * ladder predicates `Result.validate` refuses a save on and the recipe editor's readiness flags, so
 * the two cannot drift. A UI-free leaf, which the editor's mounted suites load raw.
 */

/** Whether a result is a choice group: `alternatives` present, whatever its length. */
export const isChoiceGroup = (result) => Array.isArray(result?.alternatives);

/** What one result entry can award: a choice group's alternatives, else the entry itself. */
export const awardedResults = (result) => (isChoiceGroup(result) ? result.alternatives : [result]);

/** Who picks a choice group's award, and how many it awards; the first of each is the default. */
export const GROUP_CHOOSERS = Object.freeze(['playerChooses', 'rolled']);
export const GROUP_AWARD_STRATEGIES = Object.freeze(['anyOne', 'upTo']);

/** Whether a group setting is one of `allowed`, an absent one reading as the default. */
export const knownSetting = (value, allowed) =>
  value === null || value === undefined || allowed.includes(value);

const blank = (text) => typeof text !== 'string' || text.trim() === '';
const bothEnds = (range) => Number.isFinite(range?.from) && Number.isFinite(range?.to);
const wholeEnds = (range) => Number.isSafeInteger(range?.from) && Number.isSafeInteger(range?.to);
const overlaps = (a, b) => a.from <= b.to && b.from <= a.to;

/**
 * Per alternative, aligned to `members`: `{ code: 'fraction' }` where a typed end is not whole,
 * `{ code: 'inverted' }` where `from` exceeds `to`, `{ code: 'overlap', with }` naming the first
 * other well-formed range sharing a value, else `null`; a missing end is the ladder's problem.
 */
export function rangeProblems(members = []) {
  const ranges = members.map((member) => member?.selectionRange);
  const sound = ranges.map((range) => wholeEnds(range) && range.from <= range.to);
  return ranges.map((range, index) => {
    const ends = [range?.from, range?.to].filter(Number.isFinite);
    if (!ends.every(Number.isSafeInteger)) return { code: 'fraction' };
    if (!wholeEnds(range)) return null;
    if (range.from > range.to) return { code: 'inverted' };
    const other = ranges.findIndex(
      (candidate, i) => i !== index && sound[i] && overlaps(range, candidate)
    );
    return other === -1 ? null : { code: 'overlap', with: other };
  });
}

/** A rolled group's ladder problems as codes: `unranged` for a member missing an end, then each
 *  member problem's code in member order. */
export function ladderProblems(members = []) {
  const codes = new Set(
    members.some((member) => !bothEnds(member?.selectionRange)) ? ['unranged'] : []
  );
  for (const problem of rangeProblems(members)) if (problem) codes.add(problem.code);
  return [...codes];
}

/** Up to N's count problem: `missing` or `both` of a count and a count formula, a count that is not
 *  a positive whole number, `notWhole`, else `null`. The formula's rollability is its caller's. */
export function countProblem(group) {
  const fixed = group?.awardCount !== null && group?.awardCount !== undefined;
  if (fixed === !blank(group?.awardCountFormula)) return fixed ? 'both' : 'missing';
  const whole = Number.isSafeInteger(group?.awardCount) && group.awardCount > 0;
  return fixed && !whole ? 'notWhole' : null;
}
