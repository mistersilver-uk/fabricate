import { findRangeConflicts } from '../../../../../utils/craftingCheckExpression.js';

/**
 * Pure readiness evaluator for a single subsystem check (crafting, salvage, or
 * gathering). Mirrors `recipeReadiness.js`: it returns stable check/issue ids
 * that the Checks Validation tab maps to localized copy, so the tab is the one
 * canonical place a GM sees what is wrong with a check — the rules previously
 * lived inline inside `CraftingCheckEditor` and are surfaced here instead.
 *
 * @typedef {{ id: string, satisfied: boolean }} CheckReadinessCheck
 * @typedef {{ id: string, severity: 'critical' | 'warning' | 'info' }} CheckReadinessIssue
 */

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The active outcome-tier list for a routed check. Relative and fixed tiers are
 * independent lists; only the active type's list is authored/validated.
 * @param {object} check
 * @returns {{ type: 'relative' | 'fixed', outcomes: object[] }}
 */
function routedOutcomes(check) {
  const type = check?.type === 'fixed' ? 'fixed' : 'relative';
  const key = type === 'fixed' ? 'fixedOutcomes' : 'relativeOutcomes';
  return { type, outcomes: Array.isArray(check?.[key]) ? check[key] : [] };
}

/**
 * Evaluate one subsystem check's readiness.
 *
 * @param {object} check Plain check draft (the active draft for its mode).
 * @param {object} [options]
 * @param {'routed'|'simple'|'alchemy'|'progressive'|'d100'} [options.mode] The
 *   subsystem's resolution mode. `d100` (gathering's fixed roll) is not authored,
 *   so it has nothing to validate and returns empty lists.
 * @returns {{ checks: CheckReadinessCheck[], issues: CheckReadinessIssue[] }}
 */
export function evaluateCheckReadiness(check = {}, options = {}) {
  const mode = options.mode || 'simple';
  const checks = [];
  const issues = [];

  // The gathering d100 check is the fixed d100 roll — there is nothing to author
  // and therefore nothing to validate.
  if (mode === 'd100') {
    return { checks, issues };
  }

  // Every authored check needs a roll formula to resolve. Mirrors the
  // system-level "warn always" rule for a missing routed/progressive formula.
  const hasRollFormula = Boolean(trimmed(check?.rollFormula));
  checks.push({ id: 'hasRollFormula', satisfied: hasRollFormula });
  if (!hasRollFormula) {
    issues.push({ id: 'noRollFormula', severity: 'warning' });
  }

  // Routed checks route an outcome tier to a result set by tier NAME, and only
  // SUCCESS tiers can be routed. The outcome-tier rules below are only meaningful
  // once at least one tier has been authored.
  if (mode === 'routed') {
    const { type, outcomes } = routedOutcomes(check);
    if (outcomes.length > 0) {
      const allNamed = outcomes.every((outcome) => Boolean(trimmed(outcome?.name)));
      checks.push({ id: 'outcomesNamed', satisfied: allNamed });
      if (!allNamed) {
        issues.push({ id: 'unnamedOutcome', severity: 'critical' });
      }

      const hasSuccess = outcomes.some((outcome) => outcome?.success === true);
      checks.push({ id: 'hasSuccessOutcome', satisfied: hasSuccess });
      if (!hasSuccess) {
        issues.push({ id: 'noSuccessOutcome', severity: 'critical' });
      }

      // Fixed tiers own a non-overlapping segment of the roll value range.
      if (type === 'fixed') {
        const conflicts = findRangeConflicts(outcomes);
        const rangesValid = conflicts.invalid.size === 0;
        const rangesNoOverlap = conflicts.overlapping.size === 0;
        checks.push({ id: 'rangesValid', satisfied: rangesValid });
        if (!rangesValid) {
          issues.push({ id: 'rangeInvalid', severity: 'critical' });
        }
        checks.push({ id: 'rangesNoOverlap', satisfied: rangesNoOverlap });
        if (!rangesNoOverlap) {
          issues.push({ id: 'rangeOverlap', severity: 'critical' });
        }
      }
    }
  }

  return { checks, issues };
}
