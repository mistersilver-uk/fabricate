import {
  describeRetiredModifierPlaceholder,
  findRangeConflicts,
} from '../../../../../utils/craftingCheckExpression.js';

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
 * Readiness of a routed check's tier-STEP targets (issue 975), reported only once at
 * least one trigger sets `tierStep.mode === 'target'` — mirroring the outcome-tier
 * rules, which stay silent until a tier is authored.
 *
 * Two rules share one green tick, because both say the same thing to a GM: the
 * targets on this check name exactly one existing tier.
 *
 * - A DANGLING target (including one that has chosen no tier at all) no-ops at
 *   runtime; the relative↔fixed type switch dangles every `tierId` at once, so this
 *   is reachable by ordinary authoring and not only by import.
 * - MULTIPLE targets are guidance, not breakage. This is a static authoring count:
 *   it cannot know which conditions will match, or whether a roll will be forced, so
 *   it reports what happens if more than one does rather than calling the check broken.
 *
 * Extracted rather than inlined so the tier-step rules do not add branches to the
 * already-branchy `evaluateCheckReadiness`.
 *
 * @param {object} check    Plain check draft.
 * @param {object[]} outcomes The ACTIVE outcome-tier list (relative or fixed).
 * @returns {{ checks: CheckReadinessCheck[], issues: CheckReadinessIssue[] }}
 */
function tierStepTargetReadiness(check, outcomes) {
  const triggers = Array.isArray(check?.checkBreakage?.triggers)
    ? check.checkBreakage.triggers
    : [];
  const targets = triggers.filter((trigger) => trigger?.tierStep?.mode === 'target');
  if (targets.length === 0) return { checks: [], issues: [] };

  const tierIds = new Set(outcomes.map((outcome) => outcome?.id));
  const dangling = targets.some((trigger) => !tierIds.has(trigger?.tierStep?.tierId));
  const ambiguous = targets.length > 1;

  const issues = [];
  if (dangling) issues.push({ id: 'danglingTierStepTarget', severity: 'warning' });
  if (ambiguous) issues.push({ id: 'multipleTierStepTargets', severity: 'warning' });
  return {
    checks: [{ id: 'tierStepTargetsResolve', satisfied: !dangling && !ambiguous }],
    issues,
  };
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

  // The retired check-modifier placeholder, typed after its retirement (issue 1094). The
  // formula field is free text, so nothing stops a GM who read an old guide from typing
  // it — and `stripRetiredModifierPlaceholder` would then delete it SILENTLY on the way
  // to the roll. A warning rather than a critical: the check still resolves, and the
  // modifiers still apply; what the GM believes about WHY is what is wrong.
  if (describeRetiredModifierPlaceholder(check?.rollFormula).present) {
    issues.push({ id: 'retiredPlaceholderInFormula', severity: 'warning' });
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

    // Outside the tier-count gate on purpose: a target authored before any tier
    // exists is exactly the dangling case a GM most needs told about.
    const tierStep = tierStepTargetReadiness(check, outcomes);
    checks.push(...tierStep.checks);
    issues.push(...tierStep.issues);
  }

  return { checks, issues };
}
