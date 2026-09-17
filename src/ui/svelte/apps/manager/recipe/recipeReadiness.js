/**
 * Pure recipe readiness and issue evaluation for the recipe editor's Validation tab. It consumes
 * the projected plain recipe and returns structured checks and issues with stable ids, which the
 * UI maps to localized copy; no Svelte, Foundry or store dependency, so it stays unit-testable.
 *
 * AN ISSUE CARRIES TWO INDEPENDENT ADDRESSES. `target` is the ROUTE — the editor tab hosting the
 * gap — and every issue has one. `focusTarget` is the CONTROL, the `data-validation-target` value
 * the offending control carries, emitted only where ONE element IS the offending thing; an issue
 * about the recipe as a whole, or about a set that does not exist yet, emits `target` alone and
 * its row action changes route without moving focus. That fallback is STATED rather than silent,
 * the mounted tests asserting which of the two a given row is. The three addresses are
 * `recipe-name`, `ingredient-group-<id>` and `result-group-<id>`.
 *
 * They are written as literals on both sides rather than imported, which would put this module in
 * the closure of every suite mounting a card that reads it. A pair of BEHAVIOURAL gates holds the
 * two sides together instead: `tests/components/recipe-validation-tab.test.js` reads the address
 * this file hands the row action, and `tests/components/recipe-edit-mounted.test.js` resolves that
 * address onto a real control. Either half alone would pass while the other drifted.
 *
 * @typedef {{ id: string, satisfied: boolean }} ReadinessCheck
 * @typedef {{ id: string, severity: 'critical' | 'warning' | 'info', blocks?: 'enable', target?: 'ingredients' | 'results' | 'overview', focusTarget?: string, stepId?: string, stepName?: string }} ReadinessIssue
 * @typedef {{ id: string, name: string }} RoutedOutcomeTier
 */

import { getMatchHandler } from '../../../../../models/match/matchTypes.js';

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * A stable match signature for one alternative, used to detect exact duplicates within an OR group
 * or set. `null` for an option with no usable match.
 */
function optionSignature(option) {
  return getMatchHandler(option?.match).signature(option?.match);
}

/**
 * The recipe's execution steps, exactly as the admin store's `_getRecipeExecutionSteps` resolves
 * them: explicit `recipe.steps` when non-empty, else one implicit step from the recipe-level sets.
 */
function getExecutionSteps(recipe) {
  const steps = asArray(recipe?.steps);
  if (steps.length > 0) {
    return steps.map((step, index) => ({
      id: step?.id || `step-${index + 1}`,
      name: trimmed(step?.name),
      ingredientSets: asArray(step?.ingredientSets),
      resultGroups: asArray(step?.resultGroups),
      toolIds: asArray(step?.toolIds),
      explicit: true,
    }));
  }

  return [
    {
      id: 'implicit-step',
      name: '',
      ingredientSets: asArray(recipe?.ingredientSets),
      resultGroups: asArray(recipe?.resultGroups),
      toolIds: asArray(recipe?.toolIds),
      explicit: false,
    },
  ];
}

/** The `{ stepId, stepName }` spread per-step issues carry; empty for a single-step recipe. */
function stepTag(step, isMultiStep) {
  return isMultiStep ? { stepId: step.id, stepName: step.name } : {};
}

/**
 * The `{ focusTarget }` spread, or nothing. An EMPTY address must produce NO key: the host resolves
 * any non-empty string, so an id-less group would report as focus-wired while focusing nothing.
 */
function focusTag(address) {
  return address ? { focusTarget: address } : {};
}

/** One requirement card's address, or '' for a draft group the store has not normalized yet. */
function ingredientGroupTarget(group) {
  const id = trimmed(group?.id);
  return id ? `ingredient-group-${id}` : '';
}

/** One result-set card's address, or '' when the group carries no id. */
function resultGroupTarget(group) {
  const id = trimmed(group?.id);
  return id ? `result-group-${id}` : '';
}

/** Missing-set and missing-group issues, one per offending step, blocking and critical. */
function collectMissingRequirementIssues(executionSteps, isMultiStep) {
  const issues = [];
  for (const step of executionSteps) {
    if (step.ingredientSets.length === 0) {
      issues.push({
        id: 'noIngredientSet',
        severity: 'critical',
        blocks: 'enable',
        target: 'ingredients',
        ...stepTag(step, isMultiStep),
      });
    }
  }
  for (const step of executionSteps) {
    if (step.resultGroups.length === 0) {
      issues.push({
        id: 'noResultGroup',
        severity: 'critical',
        blocks: 'enable',
        target: 'results',
        ...stepTag(step, isMultiStep),
      });
    }
  }
  return issues;
}

/**
 * A requirement's signature: its sorted, `&&`-joined option signatures, so two requirements sharing
 * one are exact duplicates. `null` when the group has no usable option signature.
 */
function requirementSignature(group) {
  const signatures = asArray(group?.options).map(optionSignature).filter(Boolean);
  if (signatures.length === 0) return null;
  return [...signatures].sort((a, b) => a.localeCompare(b)).join('&&');
}

/**
 * Duplicate-match issues for one ingredient set: a `duplicateAlternative` per OR group repeating an
 * option signature, plus one `duplicateRequirement` when two requirements share a signature.
 */
function collectSetDuplicateIssues(set, step, isMultiStep) {
  const issues = [];
  const seenSignatures = new Set();
  // The SECOND carrier of an already-seen signature, which is the one a GM would delete: the first
  // is the requirement they meant to author.
  let repeatedGroup = null;

  for (const group of asArray(set?.ingredientGroups)) {
    const signatures = asArray(group?.options).map(optionSignature).filter(Boolean);

    // Within an OR group: any repeated option signature is a duplicate.
    if (new Set(signatures).size !== signatures.length) {
      issues.push({
        id: 'duplicateAlternative',
        severity: 'critical',
        blocks: 'enable',
        target: 'ingredients',
        ...focusTag(ingredientGroupTarget(group)),
        ...stepTag(step, isMultiStep),
      });
    }

    const signature = requirementSignature(group);
    if (signature !== null) {
      if (seenSignatures.has(signature) && repeatedGroup === null) repeatedGroup = group;
      seenSignatures.add(signature);
    }
  }

  // Within a set: two requirements sharing a requirement signature duplicate.
  if (repeatedGroup !== null) {
    issues.push({
      id: 'duplicateRequirement',
      severity: 'critical',
      blocks: 'enable',
      target: 'ingredients',
      ...focusTag(ingredientGroupTarget(repeatedGroup)),
      ...stepTag(step, isMultiStep),
    });
  }

  return issues;
}

/**
 * The component ids a group's options expand to against the system catalogue: a component option to
 * its own id, a tag option to every matching component's, and a currency option to nothing.
 */
function requirementComponentIds(group, systemComponents) {
  const ids = new Set();
  for (const option of asArray(group?.options)) {
    const expanded = getMatchHandler(option?.match).expandToComponentIds(
      option?.match,
      systemComponents
    );
    for (const id of expanded) ids.add(id);
  }
  return ids;
}

function setsIntersect(a, b) {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const value of small) {
    if (large.has(value)) return true;
  }
  return false;
}

/**
 * Overlapping-requirement detection for one set: two DISTINCT requirements whose options expand to
 * intersecting component-id sets are ambiguous, because a single component could satisfy both AND'd
 * requirements. At most one `requirementOverlap` warning per set.
 */
function collectSetOverlapIssues(set, step, isMultiStep, systemComponents) {
  if (systemComponents.length === 0) return [];

  const groups = [];
  for (const group of asArray(set?.ingredientGroups)) {
    const ids = requirementComponentIds(group, systemComponents);
    if (ids.size === 0) continue;
    groups.push({
      ids,
      signature: requirementSignature(group),
      address: ingredientGroupTarget(group),
    });
  }

  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      // Skip exact duplicates, which `duplicateRequirement` already flags.
      if (groups[i].signature !== null && groups[i].signature === groups[j].signature) continue;
      if (setsIntersect(groups[i].ids, groups[j].ids)) {
        return [
          {
            id: 'requirementOverlap',
            severity: 'warning',
            target: 'ingredients',
            // The LATER of the ambiguous pair, for the reason the duplicate case gives:
            // the earlier requirement is the one the GM authored deliberately.
            ...focusTag(groups[j].address),
            ...stepTag(step, isMultiStep),
          },
        ];
      }
    }
  }

  return [];
}

/** Duplicate-match detection across every step and set: no repeated match inside an OR group,
 *  and no duplicate requirements within a set. */
function collectDuplicateMatchIssues(executionSteps, isMultiStep) {
  const issues = [];
  for (const step of executionSteps) {
    for (const set of asArray(step.ingredientSets)) {
      issues.push(...collectSetDuplicateIssues(set, step, isMultiStep));
    }
  }
  return issues;
}

/** Overlapping-requirement detection across every step and set. With no component catalogue —
 *  the one-arg evaluator call — tag-versus-component expansion cannot resolve, so it is silent. */
function collectRequirementOverlapIssues(executionSteps, isMultiStep, systemComponents) {
  const issues = [];
  for (const step of executionSteps) {
    for (const set of asArray(step.ingredientSets)) {
      issues.push(...collectSetOverlapIssues(set, step, isMultiStep, systemComponents));
    }
  }
  return issues;
}

/**
 * Routed check-mode authoring warnings, for the routed `check` provider and only for steps with
 * MULTIPLE result groups, a single group needing no mapping. Two soft misconfigurations: a group
 * listing no VALID outcome tier, and an authored success tier no group produces. Both deep-link
 * to the results tab rather than blocking enable.
 *
 * `routedOutcomeTierOptions` is POLICY-CONDITIONAL and is passed in rather than derived here, so
 * this validator and the editor's picker read ONE set and a tier the editor offers can never be
 * one this function calls unroutable.
 */
function collectRoutedCheckIssues(executionSteps, isMultiStep, routedOutcomeTierOptions) {
  const validTierIds = new Set(
    routedOutcomeTierOptions.map((tier) => tier?.id).filter((id) => typeof id === 'string' && id)
  );
  const issues = [];

  // A single result group needs no outcome mapping: it is produced on any non-failure outcome.
  const isMultiGroupStep = (step) => asArray(step.resultGroups).length > 1;

  // A group whose `checkOutcomeIds` holds no currently-valid tier id, in a multi-group step.
  let hasUnroutedGroup = false;
  for (const step of executionSteps) {
    if (!isMultiGroupStep(step)) continue;
    // `findIndex` rather than `some`, so the issue addresses the FIRST unrouted group; the INDEX
    // rather than the group, because a null entry is unrouted too and `find` would report absent.
    const stepResultGroups = asArray(step.resultGroups);
    const unroutedIndex = stepResultGroups.findIndex((group) => {
      const assigned = asArray(group?.checkOutcomeIds).filter((id) => validTierIds.has(id));
      return assigned.length === 0;
    });
    if (unroutedIndex >= 0) {
      hasUnroutedGroup = true;
      issues.push({
        id: 'unroutedResultGroup',
        severity: 'warning',
        target: 'results',
        ...focusTag(resultGroupTarget(stepResultGroups[unroutedIndex])),
        ...stepTag(step, isMultiStep),
      });
    }
  }

  // An authored success tier no result group lists, required only where a step has MULTIPLE
  // groups: a single-group recipe routes on the exemption and needs no tiers produced.
  const producedTierIds = new Set();
  for (const step of executionSteps) {
    for (const group of asArray(step.resultGroups)) {
      for (const id of asArray(group?.checkOutcomeIds)) {
        if (validTierIds.has(id)) producedTierIds.add(id);
      }
    }
  }
  const hasMultiGroupStep = executionSteps.some(isMultiGroupStep);
  const hasUnproducedTier =
    hasMultiGroupStep && [...validTierIds].some((id) => !producedTierIds.has(id));
  if (hasUnproducedTier) {
    issues.push({ id: 'unproducedOutcomeTier', severity: 'warning', target: 'results' });
  }

  const checks = [
    { id: 'routedResultGroupsRouted', satisfied: !hasUnroutedGroup },
    { id: 'routedOutcomeTiersProduced', satisfied: !hasUnproducedTier },
  ];

  return { issues, checks };
}

/**
 * Alchemy-only enable blockers: two checks the enable path enforces that are invisible to the
 * generic readiness list and used to throw only on the click.
 *
 *  - RESULT SELECTION: None/Simple check modes must resolve to exactly one SUCCESS result set, the
 *    reserved failure group not being a selectable outcome. Tiered routes by check outcome, so its
 *    cardinality is unconstrained here, and the empty case stays `noResultGroup`.
 *  - cross-recipe SIGNATURE COLLISION: each conflict is a reason the alchemy runtime cannot tell
 *    this recipe from another, precomputed by the caller through the same `SignatureValidator` the
 *    enable path uses and passed in CODED so the tab localizes without leaking ids.
 *
 * Both are critical and enable-blocking. With no alchemy context this returns nothing.
 */
function collectAlchemyReadiness(recipe, alchemy, signatureConflicts) {
  const issues = [];
  const checks = [];
  if (!alchemy) return { issues, checks };

  // None/Simple result-selection cardinality (Tiered routes by check outcome).
  if ((alchemy.checkMode || 'none') !== 'tiered') {
    const resultGroups = asArray(recipe?.resultGroups);
    const successGroups = resultGroups.filter((group) => group?.role !== 'failure');
    // The empty case is already `noResultGroup`'s, so this stays silent there — a vacuously
    // satisfied row beside that failing one reads contradictory — and speaks only to a PRESENT set.
    if (resultGroups.length > 0) {
      const invalid = successGroups.length !== 1;
      if (invalid) {
        issues.push({
          id: 'alchemyResultSelection',
          severity: 'critical',
          blocks: 'enable',
          target: 'results',
        });
      }
      checks.push({ id: 'alchemyResultSelection', satisfied: !invalid });
    }
  }

  const conflicts = asArray(signatureConflicts);
  for (const conflict of conflicts) {
    issues.push({
      id: 'signatureCollision',
      severity: 'critical',
      blocks: 'enable',
      target: 'ingredients',
      code: conflict?.code || 'signatureCollision',
      params: conflict?.params || {},
      message: conflict?.message || '',
    });
  }
  checks.push({ id: 'noSignatureCollision', satisfied: conflicts.length === 0 });

  return { issues, checks };
}

/**
 * Every check and issue for one projected recipe. `options` carries `systemComponents`, whose
 * absence no-ops overlap detection; `routingProvider`, which gates the routed warnings on `check`;
 * `routedOutcomeTierOptions`, the system's policy-conditional tiers; and `alchemy` with
 * `signatureConflicts`, which drive the two enable blockers above and are ignored without it.
 */
export function evaluateRecipeReadiness(recipe = {}, options = {}) {
  const systemComponents = Array.isArray(options.systemComponents) ? options.systemComponents : [];
  const routingProvider = options.routingProvider || null;
  const routedOutcomeTierOptions = Array.isArray(options.routedOutcomeTierOptions)
    ? options.routedOutcomeTierOptions
    : [];
  const alchemy =
    options.alchemy && typeof options.alchemy === 'object' ? options.alchemy : null;
  const signatureConflicts = Array.isArray(options.signatureConflicts)
    ? options.signatureConflicts
    : [];
  const executionSteps = getExecutionSteps(recipe);
  const isMultiStep = executionSteps.length > 0 && executionSteps[0].explicit;
  const active = recipe?.enabled !== false;

  const hasName = Boolean(trimmed(recipe?.name));
  const hasIngredientSet = executionSteps.every((step) => step.ingredientSets.length > 0);
  const hasResultGroup = executionSteps.every((step) => step.resultGroups.length > 0);
  const stepsNamed = executionSteps.every((step) => Boolean(step.name));

  const checks = [
    { id: 'hasName', satisfied: hasName },
    { id: 'hasIngredientSet', satisfied: hasIngredientSet },
    { id: 'hasResultGroup', satisfied: hasResultGroup },
  ];
  if (isMultiStep) {
    checks.push({ id: 'stepsNamed', satisfied: stepsNamed });
  }

  const issues = [];

  if (!hasName) {
    issues.push({
      id: 'noName',
      severity: 'critical',
      blocks: 'enable',
      target: 'overview',
      focusTarget: 'recipe-name',
    });
  }

  issues.push(...collectMissingRequirementIssues(executionSteps, isMultiStep));

  const duplicateIssues = collectDuplicateMatchIssues(executionSteps, isMultiStep);
  issues.push(...duplicateIssues);
  checks.push({ id: 'noDuplicateMatches', satisfied: duplicateIssues.length === 0 });

  const overlapIssues = collectRequirementOverlapIssues(
    executionSteps,
    isMultiStep,
    systemComponents
  );
  issues.push(...overlapIssues);
  checks.push({ id: 'noRequirementOverlap', satisfied: overlapIssues.length === 0 });

  // Only meaningful when the recipe routes its results by the routed `check` provider.
  if (routingProvider === 'check') {
    const routed = collectRoutedCheckIssues(executionSteps, isMultiStep, routedOutcomeTierOptions);
    issues.push(...routed.issues);
    checks.push(...routed.checks);
  }

  // The two blockers the enable path enforces and the generic readiness checks never inspect.
  const alchemyReadiness = collectAlchemyReadiness(recipe, alchemy, signatureConflicts);
  issues.push(...alchemyReadiness.issues);
  checks.push(...alchemyReadiness.checks);

  // A disabled recipe still saves, but cannot be ENABLED until the critical requirements above
  // are met; the projected `incomplete` is preferred, with the local gaps as the fallback.
  const incomplete =
    typeof recipe?.incomplete === 'boolean'
      ? recipe.incomplete
      : !hasName || !hasIngredientSet || !hasResultGroup;
  if (!active && incomplete) {
    issues.push({ id: 'disabledIncomplete', severity: 'warning', target: 'overview' });
  }

  return { checks, issues };
}

export function countIssues(severity, issues = []) {
  return issues.filter((issue) => issue.severity === severity).length;
}

export function blocksEnable(issues = []) {
  return issues.some((issue) => issue.blocks === 'enable');
}

/**
 * THE NEGATIVE ISSUE(S) THAT OWN EACH CHECK, so an unsatisfied check borrows that issue's severity,
 * blocking flag, text and address. It lives here rather than in the tab because it is the join TWO
 * screens need — the tab draws a row per check and the editor shell badges the same state — and
 * while the tab owned it the shell counted `issues` instead, so the two answered one question from
 * two populations. `stepsNamed` IS DELIBERATELY ABSENT, which is why
 * {@link recipeValidationRowStates} exists: nothing raises an issue for an unnamed step, so that
 * check fails with no owner, which is a perfectly good amber row.
 */
export const CHECK_TO_ISSUES = Object.freeze({
  hasName: ['noName'],
  hasIngredientSet: ['noIngredientSet'],
  hasResultGroup: ['noResultGroup'],
  noDuplicateMatches: ['duplicateAlternative', 'duplicateRequirement'],
  noRequirementOverlap: ['requirementOverlap'],
  routedResultGroupsRouted: ['unroutedResultGroup'],
  routedOutcomeTiersProduced: ['unproducedOutcomeTier'],
  alchemyResultSelection: ['alchemyResultSelection'],
  noSignatureCollision: ['signatureCollision'],
});

/**
 * One row's status word. `blocks: 'enable'` FIRST and severity second, because the block word is
 * literally "Blocks enable" and an issue stopping a recipe enabling while graded `warning` is a
 * blocker whatever it is called.
 */
function issueStatus(issue) {
  if (!issue) return 'warn';
  return issue.blocks === 'enable' || issue.severity === 'critical' ? 'block' : 'warn';
}

/**
 * EVERY ROW THE VALIDATION SURFACE DRAWS, in render order. ONE DERIVATION, TWO READERS: the tab
 * maps these onto copy and takes each status VERBATIM, and the editor shell counts them for its tab
 * badge, so neither computes a status of its own and the badge cannot contradict the tab's own
 * list. A check row comes first for every check, then one row per issue no failing check claimed.
 */
export function recipeValidationRowStates(readiness = {}) {
  const checks = Array.isArray(readiness?.checks) ? readiness.checks : [];
  const issues = Array.isArray(readiness?.issues) ? readiness.issues : [];
  const claimed = new Set();
  const rows = checks.map((check) => {
    const owners = CHECK_TO_ISSUES[check.id] || [];
    const issue = check.satisfied ? null : issues.find((entry) => owners.includes(entry.id)) || null;
    if (issue) claimed.add(issue);
    return { checkId: check.id, issue, status: check.satisfied ? 'pass' : issueStatus(issue) };
  });
  for (const issue of issues) {
    if (claimed.has(issue)) continue;
    rows.push({ checkId: '', issue, status: issueStatus(issue) });
  }
  return rows;
}

/** The count rail's three numbers, as a tally of the rows above. */
export function countRecipeReadiness(readiness = {}) {
  const tally = { passing: 0, warnings: 0, blocking: 0 };
  for (const row of recipeValidationRowStates(readiness)) {
    if (row.status === 'pass') tally.passing += 1;
    else if (row.status === 'block') tally.blocking += 1;
    else tally.warnings += 1;
  }
  return tally;
}
