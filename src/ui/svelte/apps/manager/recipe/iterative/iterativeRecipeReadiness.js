/**
 * The recipe editor's Validation rows for an iterative recipe: the route model's issues as
 * `ReadinessIssue`s, "Counters are set up", and one check per step owning that step's issues. It
 * has no local imports, so the readiness closure the Validation tab's suite hand-lists stays whole.
 */

/** The step-scoped codes (`resolution-modes` § Iterative Validation), which a single step's check owns. */
const STEP_CODES = new Set([
  'iterativeNoSuccessRule',
  'iterativeSuccessLineOnFailureGroup',
  'iterativeInvalidEntry',
  'iterativeUnknownAction',
  'iterativeNoAllowedActions',
  'iterativeUnknownCounter',
  'iterativeInvalidRule',
  'iterativeFinalStepProducesNothing',
]);

/** The recipe-wide codes "Counters are set up" owns; it takes `iterativeUnknownCounter` before a single step. */
const COUNTER_CODES = new Set([
  'iterativeNoCounters',
  'iterativeUnknownCounter',
  'iterativeInvalidNumber',
  'iterativeBoundsInverted',
  'iterativeStartOutOfBounds',
]);

const RESULTS_CODES = new Set([
  'iterativeSuccessLineOnFailureGroup',
  'iterativeFinalStepProducesNothing',
]);

/** The step codes whose control is the step's allowed-actions picker. */
const ACTION_CODES = new Set(['iterativeUnknownAction', 'iterativeNoAllowedActions']);

const COUNTERS_CHECK = 'iterativeCounters';
const stepCheckId = (address) => `iterativeStep:${address}`;

/** The check that owns a recipe-scoped `issue`, or `null` for a library one or a recipe-wide one it has none for. */
function ownerOf(issue, single) {
  if (issue?.entityKind !== 'recipe') return null;
  if (issue.stepIndex != null) return stepCheckId(issue.stepIndex);
  if (COUNTER_CODES.has(issue.code)) return COUNTERS_CHECK;
  return single && STEP_CODES.has(issue.code) ? stepCheckId('single') : null;
}

/**
 * The `data-validation-target` the issue's control carries, or `''` when none is the issue. A counters
 * issue addressed to one of the recipe's Counter Instances targets that instance's row.
 */
function focusTargetOf({ code, counterId }, owner, counterIds) {
  if (code === 'iterativeNoCounters') return 'iterative-counters-add';
  if (owner === COUNTERS_CHECK) {
    return counterId && counterIds.includes(counterId)
      ? `iterative-counter-${counterId}`
      : 'iterative-counters';
  }
  const address = owner?.startsWith('iterativeStep:') ? owner.slice('iterativeStep:'.length) : '';
  if (!address) return '';
  if (code === 'iterativeNoSuccessRule') return `iterative-step-${address}-success`;
  return ACTION_CODES.has(code) ? `iterative-step-${address}-actions` : '';
}

function mappedIssue(issue, owner, { steps, counterIds }) {
  const library = issue.entityKind !== 'recipe';
  const step =
    issue.stepIndex == null ? null : steps.find((entry) => entry.index === issue.stepIndex);
  const focusTarget = focusTargetOf(issue, owner, counterIds);
  // `message` is the headless sentence the Validation title falls back to when a key is missing.
  return {
    id: library
      ? `${issue.code}:${issue.entityKind}:${issue.entityId ?? ''}`
      : `${issue.code}:${issue.stepIndex ?? 'recipe'}`,
    iterativeCode: issue.code,
    ...(issue.message && { message: issue.message }),
    severity: issue.severity,
    ...(!library && issue.severity === 'critical' && { blocks: 'enable' }),
    target: RESULTS_CODES.has(issue.code) ? 'results' : 'overview',
    ...(focusTarget && { focusTarget }),
    ...(library && { entityName: issue.entityName }),
    ...(issue.counterId && { counterId: issue.counterId, counterName: issue.counterName }),
    ...(issue.actionName && { actionName: issue.actionName }),
    ...(step && { stepId: step.id, stepName: step.name }),
  };
}

/**
 * `{ checks, issues }` over `input`, the route model's `recipeReadinessInput`: `{ issues, steps,
 * counterIds }`, each step `{ index, id, name }` and `counterIds` the recipe's Counter Instance ids. Each check names the issue ids it owns as `owners`, and holds
 * when it owns none.
 */
export function iterativeRecipeReadiness(input) {
  const steps = Array.isArray(input?.steps) ? input.steps : [];
  const counterIds = Array.isArray(input?.counterIds) ? input.counterIds : [];
  const single = steps.length === 0;
  const owned = new Map();
  const issues = (Array.isArray(input?.issues) ? input.issues : []).map((issue) => {
    const owner = ownerOf(issue, single);
    const mapped = mappedIssue(issue, owner, { steps, counterIds });
    if (owner) owned.set(owner, [...(owned.get(owner) ?? []), mapped.id]);
    return mapped;
  });
  const checkOf = (id, extra = {}) => {
    const owners = owned.get(id) ?? [];
    return { id, satisfied: owners.length === 0, owners, ...extra };
  };
  const stepChecks = single
    ? [checkOf(stepCheckId('single'))]
    : steps.map((step) =>
        checkOf(stepCheckId(step.index), { stepIndex: step.index, stepName: step.name })
      );
  return { checks: [checkOf(COUNTERS_CHECK), ...stepChecks], issues };
}
