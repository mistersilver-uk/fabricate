import {
  GROUP_AWARD_STRATEGIES,
  GROUP_CHOOSERS,
  countProblem,
  isChoiceGroup,
  knownSetting,
  ladderProblems,
} from '../utils/choiceGroupShape.js';
import { quantityFormulaErrors } from '../utils/rollFormulaRollability.js';

import { isNull, omitReconstructibleDefaults } from './reconstructibleDefaults.js';

/** What a result awards (issue 1773); an absent `kind` is `component`. */
export const RESULT_KINDS = Object.freeze(['component', 'currency', 'knowledge']);

export {
  GROUP_AWARD_STRATEGIES,
  GROUP_CHOOSERS,
  awardedResults,
  isChoiceGroup,
} from '../utils/choiceGroupShape.js';
export { quantityFormulaErrors } from '../utils/rollFormulaRollability.js';

/** Fields the constructor rebuilds exactly from absence (issue 1135). */
export const RESULT_OMITTED_WHEN_DEFAULT = {
  kind: (value) => value === 'component',
  unit: isNull,
  recipeId: isNull,
  label: isNull,
  reason: isNull,
  quantityFormula: isNull,
  alternatives: isNull,
  chooser: (value) => value === null || value === GROUP_CHOOSERS[0],
  awardStrategy: (value) => value === null || value === GROUP_AWARD_STRATEGIES[0],
  awardCount: isNull,
  awardCountFormula: isNull,
  withReplacement: isNull,
  selectionFormula: isNull,
  selectionRange: isNull,
};

/** The persisted form of an amount formula: a trimmed non-empty string, or `null` for absent. */
export function normalizeQuantityFormula(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : null;
}

const textOrNull = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** The kind-specific half of `Result.validate` (issue 1773). */
function kindErrors(result) {
  const { kind } = result;
  if (!RESULT_KINDS.includes(kind)) return [`Result kind "${kind}" is not recognised`];
  const errors = [];
  if (kind === 'component' && !result.itemUuid && !result.componentId) {
    errors.push('Result must have componentId or itemUuid');
  }
  if (kind === 'currency' && !result.unit) errors.push('Currency result must name a unit');
  if (kind === 'knowledge' && !result.recipeId) errors.push('Knowledge result must name a recipe');
  if (kind === 'knowledge' && result.quantityFormula) {
    errors.push('Knowledge result cannot roll an amount');
  }
  if (kind !== 'currency' && (result.label || result.reason)) {
    errors.push('Only a currency result carries a label or reason');
  }
  if (kind !== 'component' && result.propertyMacroUuid) {
    errors.push('Only a component result runs a property macro');
  }
  return errors;
}

const LADDER_ERRORS = Object.freeze({
  unranged: 'Every alternative of a rolled choice group needs a selecting range',
  fraction: 'A selecting range must run between whole numbers',
  inverted: 'A selecting range cannot start above its end',
  overlap: 'Selecting ranges cannot overlap',
});

/** A rolled group's ladder: every member ranged in whole numbers, `from <= to`, none overlapping. */
function ladderErrors(members) {
  const codes = ladderProblems(members);
  return (codes.includes('unranged') ? ['unranged'] : codes).map((code) => LADDER_ERRORS[code]);
}

/** Two or more distinct, un-nested members, each valid as a result in its own right. */
function memberErrors(members, Roll) {
  const errors = members.length < 2 ? ['A choice group needs two or more alternatives'] : [];
  if (new Set(members.map((member) => member.id)).size !== members.length) {
    errors.push('Choice group alternatives need distinct ids');
  }
  for (const [index, member] of members.entries()) {
    const own = member.alternatives
      ? ['cannot be a choice group']
      : member.validate({ Roll }).errors;
    errors.push(...own.map((error) => `Alternative ${index + 1}: ${error}`));
  }
  return errors;
}

/** `upTo` takes exactly one of a positive whole count and a count formula. */
function countErrors(group, Roll) {
  const problem = countProblem(group);
  if (problem === 'notWhole') return ['The award count must be a positive whole number'];
  if (problem) return ['Up to N needs exactly one of a count or a count formula'];
  return quantityFormulaErrors(group.awardCountFormula, Roll).map(
    (error) => `Award count ${error}`
  );
}

/** A rolled group needs its selection formula and a ladder of ranges. */
function rolledErrors(group, Roll) {
  const errors = group.selectionFormula
    ? quantityFormulaErrors(group.selectionFormula, Roll).map((error) => `Selection ${error}`)
    : ['A rolled choice group needs a selection formula'];
  return [...errors, ...ladderErrors(group.alternatives)];
}

/** The choice-group half of `Result.validate` (issue 1773): members, settings and the ladder. */
function groupErrors(group, Roll) {
  const errors = memberErrors(group.alternatives, Roll);
  if (!knownSetting(group.chooser, GROUP_CHOOSERS)) {
    errors.push(`Chooser "${group.chooser}" is not recognised`);
  }
  if (!knownSetting(group.awardStrategy, GROUP_AWARD_STRATEGIES)) {
    errors.push(`Award strategy "${group.awardStrategy}" is not recognised`);
  }
  if (group.awardStrategy === 'upTo') errors.push(...countErrors(group, Roll));
  if (group.chooser === 'rolled') errors.push(...rolledErrors(group, Roll));
  return errors;
}

/** A selecting range as authored, or `null`; its bounds are checked by `ladderErrors`. */
function rangeOrNull(range) {
  return range && typeof range === 'object' ? { from: range.from, to: range.to } : null;
}

/** One thing a recipe produces: a component, an amount of a currency, or a recipe's knowledge. */
export class Result {
  constructor(data = {}) {
    this.id = data.id || foundry.utils.randomID();

    // An unrecognised kind is kept verbatim so validation can report it as a misconfiguration.
    this.kind = data.kind ?? 'component';

    this.componentId = data.componentId || data.systemItemId || null;

    this.unit = textOrNull(data.unit);

    this.recipeId = textOrNull(data.recipeId);

    this.label = textOrNull(data.label);

    this.reason = textOrNull(data.reason);

    this.itemUuid = data.itemUuid || null;

    this.quantity = this.kind === 'knowledge' ? 1 : data.quantity || 1;

    // Presence is the mode: a non-empty formula ROLLS the amount and `quantity` becomes the authored
    // amount it falls back to. `''` and whitespace ARE absence, so the two on-disk states are one.
    this.quantityFormula = normalizeQuantityFormula(data.quantityFormula);

    this.propertyMacroUuid = data.propertyMacroUuid || null;

    // Present makes this result a choice group; each setting is kept only in the cell that reads
    // it, so a group unwrapped or switched to another cell drops it (Result requirement 11).
    const group = isChoiceGroup(data);
    this.chooser = group ? (data.chooser ?? GROUP_CHOOSERS[0]) : null;
    this.awardStrategy = group ? (data.awardStrategy ?? GROUP_AWARD_STRATEGIES[0]) : null;
    const upTo = this.awardStrategy === 'upTo';
    const rolled = this.chooser === 'rolled';
    // A member's range is read only under a roll, so a draft's hidden ranges are not saved.
    const member = (entry) => new Result(rolled ? entry : { ...entry, selectionRange: null });
    this.alternatives = group ? data.alternatives.map(member) : null;
    this.awardCount = upTo ? (data.awardCount ?? null) : null;
    this.awardCountFormula = upTo ? normalizeQuantityFormula(data.awardCountFormula) : null;
    this.selectionFormula = rolled ? normalizeQuantityFormula(data.selectionFormula) : null;
    this.withReplacement = rolled && upTo && data.withReplacement === true ? true : null;

    this.selectionRange = rangeOrNull(data.selectionRange);
  }

  /** `Roll` is INJECTED: with none, nothing is reported about `quantityFormula`, because a missing
   *  dice engine can decide no formula and no actor-free reading can decide a path-bearing one. */
  validate({ Roll } = {}) {
    // A carrier's own kind, subject and amount are not read while it is a group.
    if (this.alternatives) {
      const errors = groupErrors(this, Roll);
      return { valid: errors.length === 0, errors };
    }
    const errors = kindErrors(this);

    if (typeof this.quantity !== 'number' || this.quantity <= 0) {
      errors.push('Result quantity must be a positive number');
    }

    errors.push(
      ...quantityFormulaErrors(this.quantityFormula, Roll).map((error) => `Result ${error}`)
    );

    if (this.propertyMacroUuid !== null && typeof this.propertyMacroUuid !== 'string') {
      errors.push('Property macro UUID must be a string or null');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /** The AUTHORED amount: a rolled result states its expression, never a number (issue 1645). */
  getDescription() {
    return `${this.quantityFormula ?? this.quantity}x item`;
  }

  toJSON() {
    return omitReconstructibleDefaults(
      {
        id: this.id,
        kind: this.kind,
        componentId: this.componentId,
        systemItemId: this.componentId,
        unit: this.unit,
        recipeId: this.recipeId,
        label: this.label,
        reason: this.reason,
        itemUuid: this.itemUuid,
        quantity: this.quantity,
        quantityFormula: this.quantityFormula,
        propertyMacroUuid: this.propertyMacroUuid,
        alternatives: this.alternatives?.map((member) => member.toJSON()) ?? null,
        chooser: this.chooser,
        awardStrategy: this.awardStrategy,
        awardCount: this.awardCount,
        awardCountFormula: this.awardCountFormula,
        withReplacement: this.withReplacement,
        selectionFormula: this.selectionFormula,
        selectionRange: this.selectionRange,
      },
      RESULT_OMITTED_WHEN_DEFAULT
    );
  }

  static fromJSON(data) {
    return new Result(data);
  }
}
