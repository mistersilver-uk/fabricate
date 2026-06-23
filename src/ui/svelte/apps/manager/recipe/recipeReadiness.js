/**
 * Pure recipe readiness + issue evaluation for the recipe editor's Validation
 * tab. Consumes the projected plain recipe (the same shape the admin store
 * builds: `name`, `enabled`, `ingredientSets`, `resultGroups`, `steps`,
 * `toolIds`, `incomplete`, `structureKey`) and returns structured checks/issues
 * with stable ids; the UI layer maps ids to localized copy. No Svelte, Foundry,
 * or store dependencies so it stays unit-testable.
 *
 * @typedef {{ id: string, satisfied: boolean }} ReadinessCheck
 * @typedef {{ id: string, severity: 'critical' | 'warning' | 'info', blocks?: 'enable', target?: 'ingredients' | 'results' | 'overview', stepId?: string, stepName?: string }} ReadinessIssue
 */

import { getMatchHandler } from '../../../../../models/match/matchTypes.js';

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Compute a stable match signature for an alternative (option). Used to detect
 * exact-duplicate matches within an OR group or set. Returns null for options
 * with no usable match (an empty component slot or a tags match with no tags).
 *
 * @param {object} option One alternative inside a requirement.
 * @returns {string | null}
 */
function optionSignature(option) {
  return getMatchHandler(option?.match).signature(option?.match);
}

/**
 * Resolve the recipe's execution steps exactly like the admin store's
 * `_getRecipeExecutionSteps`: explicit `recipe.steps` when non-empty, otherwise
 * one implicit step built from the recipe-level sets/groups/tools.
 *
 * @param {object} recipe Projected plain recipe.
 * @returns {{ id: string, name: string, ingredientSets: object[], resultGroups: object[], toolIds: string[], explicit: boolean }[]}
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

/**
 * Build the `{ stepId, stepName }` tag spread carried by per-step issues. Empty
 * for single-step recipes so their issues stay step-agnostic.
 *
 * @param {{ id: string, name: string }} step
 * @param {boolean} isMultiStep
 * @returns {{ stepId: string, stepName: string } | {}}
 */
function stepTag(step, isMultiStep) {
  return isMultiStep ? { stepId: step.id, stepName: step.name } : {};
}

/**
 * Missing-ingredient-set and missing-result-group issues, one per offending
 * step. Surfaced as blocking, critical issues against their editor tab.
 *
 * @param {object[]} executionSteps
 * @param {boolean} isMultiStep
 * @returns {ReadinessIssue[]}
 */
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
 * Compute a requirement (group) signature: the sorted, `&&`-joined option
 * signatures of the group. Two requirements with the same signature are exact
 * duplicates. Returns null when the group has no usable option signature.
 *
 * @param {object} group One requirement (OR group) inside a set.
 * @returns {string | null}
 */
function requirementSignature(group) {
  const signatures = asArray(group?.options).map(optionSignature).filter(Boolean);
  if (signatures.length === 0) return null;
  return [...signatures].sort((a, b) => a.localeCompare(b)).join('&&');
}

/**
 * Duplicate-match issues for a single ingredient set: a `duplicateAlternative`
 * per OR group that repeats an option signature, plus one `duplicateRequirement`
 * when two requirements in the set share a requirement signature.
 *
 * @param {object} set One ingredient set.
 * @param {object} step Owning execution step.
 * @param {boolean} isMultiStep
 * @returns {ReadinessIssue[]}
 */
function collectSetDuplicateIssues(set, step, isMultiStep) {
  const issues = [];
  const requirementSignatures = [];

  for (const group of asArray(set?.ingredientGroups)) {
    const signatures = asArray(group?.options).map(optionSignature).filter(Boolean);

    // Within an OR group: any repeated option signature is a duplicate.
    if (new Set(signatures).size !== signatures.length) {
      issues.push({
        id: 'duplicateAlternative',
        severity: 'critical',
        blocks: 'enable',
        target: 'ingredients',
        ...stepTag(step, isMultiStep),
      });
    }

    const signature = requirementSignature(group);
    if (signature !== null) {
      requirementSignatures.push(signature);
    }
  }

  // Within a set: two requirements sharing a requirement signature duplicate.
  if (new Set(requirementSignatures).size !== requirementSignatures.length) {
    issues.push({
      id: 'duplicateRequirement',
      severity: 'critical',
      blocks: 'enable',
      target: 'ingredients',
      ...stepTag(step, isMultiStep),
    });
  }

  return issues;
}

/**
 * Union of component ids the group's options expand to, against the system
 * component catalogue. A component option expands to its own id; a tag option
 * expands to the ids of components whose tags match; a currency option expands
 * to nothing.
 *
 * @param {object} group One requirement (OR group) inside a set.
 * @param {object[]} systemComponents `{ id, tags }` per managed component.
 * @returns {Set<string>}
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
 * Overlapping-requirement detection for a single ingredient set. Two DISTINCT
 * requirements (different requirement signatures, so NOT an exact
 * `duplicateRequirement`) whose options expand to intersecting component-id sets
 * are ambiguous: a single component could satisfy both AND'd requirements. Emits
 * at most one `requirementOverlap` warning per set.
 *
 * @param {object} set One ingredient set.
 * @param {object} step Owning execution step.
 * @param {boolean} isMultiStep
 * @param {object[]} systemComponents `{ id, tags }` per managed component.
 * @returns {ReadinessIssue[]}
 */
function collectSetOverlapIssues(set, step, isMultiStep, systemComponents) {
  if (systemComponents.length === 0) return [];

  const groups = [];
  for (const group of asArray(set?.ingredientGroups)) {
    const ids = requirementComponentIds(group, systemComponents);
    if (ids.size === 0) continue;
    groups.push({ ids, signature: requirementSignature(group) });
  }

  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      // Skip exact duplicates — those are flagged as duplicateRequirement; don't
      // double-flag them as an overlap.
      if (groups[i].signature !== null && groups[i].signature === groups[j].signature) continue;
      if (setsIntersect(groups[i].ids, groups[j].ids)) {
        return [
          {
            id: 'requirementOverlap',
            severity: 'warning',
            target: 'ingredients',
            ...stepTag(step, isMultiStep),
          },
        ];
      }
    }
  }

  return [];
}

/**
 * Duplicate-match detection across every step/set: a recipe must not repeat the
 * same component or an identical tag/currency match twice inside one OR group,
 * nor as duplicate requirements within a set.
 *
 * @param {object[]} executionSteps
 * @param {boolean} isMultiStep
 * @returns {ReadinessIssue[]}
 */
function collectDuplicateMatchIssues(executionSteps, isMultiStep) {
  const issues = [];
  for (const step of executionSteps) {
    for (const set of asArray(step.ingredientSets)) {
      issues.push(...collectSetDuplicateIssues(set, step, isMultiStep));
    }
  }
  return issues;
}

/**
 * Overlapping-requirement detection across every step/set. Requires the system
 * component catalogue (`{ id, tags }`); with no catalogue (a one-arg evaluator
 * call) tag-vs-component expansion can't be resolved, so it returns nothing.
 *
 * @param {object[]} executionSteps
 * @param {boolean} isMultiStep
 * @param {object[]} systemComponents
 * @returns {ReadinessIssue[]}
 */
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
 * @param {object} recipe Projected plain recipe.
 * @param {object} [options]
 * @param {object[]} [options.systemComponents] Managed components (`{ id, tags }`)
 *   used to expand tag/component matches for overlap detection. Absent (the
 *   one-arg call) → overlap detection no-ops.
 * @returns {{ checks: ReadinessCheck[], issues: ReadinessIssue[] }}
 */
export function evaluateRecipeReadiness(recipe = {}, options = {}) {
  const systemComponents = Array.isArray(options.systemComponents) ? options.systemComponents : [];
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
    issues.push({ id: 'noName', severity: 'critical', blocks: 'enable', target: 'overview' });
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

  // A disabled recipe still saves, but flag that it cannot be enabled until the
  // critical requirements above are met. The store/model projects `incomplete`;
  // fall back to the locally computed gaps when the flag is absent.
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
