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

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
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
      explicit: true
    }));
  }

  return [{
    id: 'implicit-step',
    name: '',
    ingredientSets: asArray(recipe?.ingredientSets),
    resultGroups: asArray(recipe?.resultGroups),
    toolIds: asArray(recipe?.toolIds),
    explicit: false
  }];
}

/**
 * @param {object} recipe Projected plain recipe.
 * @returns {{ checks: ReadinessCheck[], issues: ReadinessIssue[] }}
 */
export function evaluateRecipeReadiness(recipe = {}) {
  const executionSteps = getExecutionSteps(recipe);
  const isMultiStep = executionSteps.length > 0 && executionSteps[0].explicit;
  const active = recipe?.enabled !== false;

  const hasName = Boolean(trimmed(recipe?.name));
  const hasIngredientSet = executionSteps.every(step => step.ingredientSets.length > 0);
  const hasResultGroup = executionSteps.every(step => step.resultGroups.length > 0);
  const stepsNamed = executionSteps.every(step => Boolean(step.name));

  const checks = [
    { id: 'hasName', satisfied: hasName },
    { id: 'hasIngredientSet', satisfied: hasIngredientSet },
    { id: 'hasResultGroup', satisfied: hasResultGroup }
  ];
  if (isMultiStep) {
    checks.push({ id: 'stepsNamed', satisfied: stepsNamed });
  }

  const issues = [];

  if (!hasName) {
    issues.push({ id: 'noName', severity: 'critical', blocks: 'enable', target: 'overview' });
  }

  for (const step of executionSteps) {
    if (step.ingredientSets.length === 0) {
      issues.push({
        id: 'noIngredientSet',
        severity: 'critical',
        blocks: 'enable',
        target: 'ingredients',
        ...(isMultiStep ? { stepId: step.id, stepName: step.name } : {})
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
        ...(isMultiStep ? { stepId: step.id, stepName: step.name } : {})
      });
    }
  }

  // A disabled recipe still saves, but flag that it cannot be enabled until the
  // critical requirements above are met. The store/model projects `incomplete`;
  // fall back to the locally computed gaps when the flag is absent.
  const incomplete = typeof recipe?.incomplete === 'boolean'
    ? recipe.incomplete
    : (!hasName || !hasIngredientSet || !hasResultGroup);
  if (!active && incomplete) {
    issues.push({ id: 'disabledIncomplete', severity: 'warning', target: 'overview' });
  }

  return { checks, issues };
}

export function countIssues(issues = [], severity) {
  return issues.filter(issue => issue.severity === severity).length;
}

export function blocksEnable(issues = []) {
  return issues.some(issue => issue.blocks === 'enable');
}
