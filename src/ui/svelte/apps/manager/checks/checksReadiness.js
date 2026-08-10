import {
  findRangeConflicts,
  planRetiredPlaceholderStrip,
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
  //
  // READ POST-SHIM (issue 1094), and this is the whole point of the derivation rather than
  // a `trimmed(check?.rollFormula)`. `checkUsable` — the value the engine, the inert-cause
  // projection and the recipe editor all dispatch on — is post-shim, so reading the RAW
  // field here made this tab tick "Has a roll formula" green for `@craftingmod`,
  // `1d20 * @craftingmod` and `max(@craftingmod, 2)`: a check that cannot roll at all,
  // reported as ready, inside the module named `checksReadiness`. That falsified the
  // invariant `resolution-modes/spec.md` asserts, on the one surface a GM consults to find
  // out whether a check works.
  //
  // ONE PLAN, not one plan and one classifier. `planRetiredPlaceholderStrip` is the same
  // decider `stripRetiredModifierPlaceholder` (and therefore `checkUsable`) reduces, so
  // deriving BOTH the formula tick and the severity split below from this single call is
  // what makes them incapable of disagreeing — see the split's own note for the rows that
  // caught them disagreeing.
  const authoredFormula = trimmed(check?.rollFormula);
  const plan = planRetiredPlaceholderStrip(authoredFormula);
  const hasRollFormula = plan.outcome !== 'refused' && trimmed(plan.formula) !== '';
  checks.push({ id: 'hasRollFormula', satisfied: hasRollFormula });
  if (!hasRollFormula) {
    issues.push({ id: 'noRollFormula', severity: 'warning' });
  }

  // The retired check-modifier placeholder, typed after its retirement (issue 1094). The
  // formula field is free text, so nothing stops a GM who read an old guide from typing
  // it, and the shim would then remove it SILENTLY on the way to the roll.
  //
  // THE SEVERITY SPLITS ON THE STRIP OUTCOME, because the two cases need opposite advice.
  // A STRIPPED placement is genuinely ignorable: the removal is lossless, so whatever was
  // authored around it still rolls, the modifiers still apply, and only what the GM
  // believes about WHY is wrong — so "it is ignored and removed before the roll, delete it"
  // is true and a warning is proportionate. (A placeholder-ONLY formula is the degenerate
  // case: it strips losslessly to nothing, and `hasRollFormula` above is what reports that
  // there is no formula left, because "delete the placeholder" and "author a formula" are
  // different instructions and must not be merged into one issue.) A REFUSED
  // one is not ignorable: the whole formula is discarded and the check does not roll at all, and
  // telling that GM to "just delete the placeholder" is actively wrong, because deleting it
  // out of `1d20 * @craftingmod` or `max(@craftingmod, 2)` leaves `1d20 * ` or `max(, 2)` —
  // still broken. That one is critical and says the formula must be rewritten.
  //
  // IT ASKS THE DECIDER, NOT THE CLASSIFIER, and the distinction is not cosmetic. This
  // split used to test `describeRetiredModifierPlaceholder(...).nonAdditive`, which is only
  // the FIRST half of what decides usability: `planRetiredPlaceholderStrip` refuses a
  // non-additive placement AND an additive one whose residue is structurally incomplete.
  // The two disagree on exactly the rows the residue check was added for — `1d20 * -@craftingmod`,
  // `1d20 - @craftingmod -` and `@craftingmod +` are all `nonAdditive: false` and all refused —
  // so the tab told that GM the placeholder was "ignored and removed before the roll, so
  // delete it", and deleting it leaves `1d20 * `, still refused, with `hasRollFormula` then
  // reading GREEN because nothing re-validates a placeholder-free formula. The migration
  // meanwhile counted the same formula `untouched` and said it would not roll. One decider
  // is the only way two surfaces can give one instruction.
  //
  // The legacy `routed.rollExpression` alias is planned too, DEFENSIVELY rather than as a
  // load-bearing branch: both `CraftingSystemManager._normalizeRoutedCraftingCheck` and the
  // manager root's `cloneRoutedCheck` fold it into `rollFormula` and neither emits the key,
  // so no draft this tab is handed carries a live one. The `1.21.0` migration sweeps it
  // because it reads the raw SETTING, which is a different input. It stays because this is
  // a pure evaluator over a plain check object with no normalizer of its own, and it plans
  // through the same decider so the two branches cannot answer differently.
  const legacyPlan = planRetiredPlaceholderStrip(trimmed(check?.rollExpression));
  if (plan.outcome === 'refused' || legacyPlan.outcome === 'refused') {
    issues.push({ id: 'retiredPlaceholderBreaksFormula', severity: 'critical' });
  } else if (plan.outcome === 'stripped' || legacyPlan.outcome === 'stripped') {
    issues.push({ id: 'retiredPlaceholderInFormula', severity: 'warning' });
  }

  // Routed checks route an outcome tier to a result set by tier NAME, and only
  // SUCCESS tiers can be routed. The outcome-tier rules below are only meaningful
  // once at least one tier has been authored.
  if (mode === 'routed') {
    const { type, outcomes } = routedOutcomes(check);
    if (outcomes.length > 0) {
      const allNamed = outcomes.every((outcome) => trimmed(outcome?.name) !== '');
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
