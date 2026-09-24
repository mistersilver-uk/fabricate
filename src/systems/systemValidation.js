/**
 * Pure system-level validation: composes the per-entity readiness evaluators (recipe, environment,
 * salvage, alchemy signature) and the system-level blocker checks into one derived, never persisted
 * report. It reads only its arguments, never a Foundry global or a store, so the synchronous
 * visibility hot path and the GM Validation tab share it. The evaluators take the admin store's
 * PROJECTED shapes, rebuilt here as the editors build them, and recipes get the policy-conditional
 * `routedOutcomeTierOptions` the recipe editor's picker offers (issue 1098). Importing the
 * readiness evaluators from `src/ui/svelte/apps/manager/` is a documented layering exception.
 *
 * @typedef {'recipe'|'environment'|'task'|'event'|'salvage'|'system'} IssueKind
 * @typedef {{ kind: IssueKind, entityId: string|null, environmentId?: string|null,
 *   entityName: string, severity: 'critical'|'warning'|'info',
 *   blocks: 'enable'|'visibility'|'system'|undefined, code: string, message: string,
 *   nav: { view: string, tab?: string } }} SystemValidationIssue `environmentId` names the owning
 *   environment of an environment, task or event issue, the environment editor's deep-link target.
 * @typedef {{ issues: SystemValidationIssue[], blocksSystem: boolean,
 *   counts: { critical: number, warning: number, info: number, blockers: number } }}
 *   SystemValidationReport
 */

import { evaluateEnvironmentReadiness } from '../ui/svelte/apps/manager/environment/environmentReadiness.js';
import { evaluateRecipeReadiness } from '../ui/svelte/apps/manager/recipe/recipeReadiness.js';
import { diceEngine } from '../utils/rollFormulaRollability.js';
import {
  routedTierOptionsForPolicy,
  routedOutcomeTierNames,
} from '../utils/routedOutcomeKeywords.js';
import { trimString as trimmed } from '../utils/scalars.js';

import { ResolutionModeService } from './ResolutionModeService.js';
import { SignatureValidator } from './SignatureValidator.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * The `{ id, tags, essences }` projection the admin store builds: trimmed non-blank tags, and the
 * positive essence quantities without which essence overlap detection would silently no-op.
 */
function projectComponentTagOptions(components) {
  return asArray(components).map((component) => ({
    id: component?.id,
    tags: Array.isArray(component?.tags)
      ? component.tags.map((tag) => String(tag ?? '').trim()).filter(Boolean)
      : [],
    essences: normalizeComponentEssences(component?.essences),
  }));
}

/** A component's positive essence quantities by trimmed id, as the admin store normalizes them. */
function normalizeComponentEssences(essences) {
  const out = {};
  if (!essences || typeof essences !== 'object') return out;
  for (const [rawId, rawQty] of Object.entries(essences)) {
    const id = String(rawId ?? '').trim();
    if (!id) continue;
    const qty = Number(rawQty);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    out[id] = qty;
  }
  return out;
}

/** The admin store's `_buildRecipeList` projection, from `toJSON()`, plus `incomplete`. */
function projectRecipe(recipe) {
  const raw = typeof recipe?.toJSON === 'function' ? recipe.toJSON() : recipe || {};
  return {
    id: raw.id,
    name: raw.name,
    enabled: raw.enabled !== false,
    steps: asArray(raw.steps),
    ingredientSets: asArray(raw.ingredientSets),
    resultGroups: asArray(raw.resultGroups),
    resultSelection: raw.resultSelection || null,
    toolIds: asArray(raw.toolIds),
    incomplete: isRecipeIncomplete(recipe, raw),
    structureKey: raw.structureKey,
  };
}

/**
 * A persistable but uncraftable shell, per the model's `validate()` and `validateStructure()` when
 * present, else a count-only fallback (the admin store's `_isRecipeIncomplete`).
 */
function isRecipeIncomplete(recipe, raw) {
  if (typeof recipe?.validate === 'function' && typeof recipe?.validateStructure === 'function') {
    const injected = { Roll: diceEngine() };
    return (
      recipe.validate(injected).valid === false && recipe.validateStructure(injected).valid === true
    );
  }
  const steps = asArray(raw?.steps);
  if (steps.length > 0) {
    return steps.some(
      (step) =>
        asArray(step?.ingredientSets).length === 0 || asArray(step?.resultGroups).length === 0
    );
  }
  return asArray(raw?.ingredientSets).length === 0 || asArray(raw?.resultGroups).length === 0;
}

/** Headless English per code; the Validation tab localizes by `code`. */
const READINESS_ISSUE_MESSAGES = {
  noName: 'Recipe has no name.',
  noIngredientSet: 'A step is missing an ingredient set.',
  noResultGroup: 'A step is missing a result group.',
  duplicateAlternative: 'An ingredient group repeats an alternative.',
  duplicateRequirement: 'A set repeats an ingredient requirement.',
  requirementOverlap: 'Two ingredient requirements can be satisfied by the same component.',
  unroutedResultGroup: 'A result group is not routed to any crafting-check outcome.',
  unproducedOutcomeTier: 'A crafting-check outcome tier produces no result group.',
  disabledIncomplete: 'Recipe is disabled and cannot be enabled until its gaps are fixed.',
  noAvailableTasks: 'Environment has no available gathering tasks.',
  activeNoComposition: 'Environment is active but composes no available tasks.',
  staleIncluded: 'Environment includes a task/event that does not match it.',
  noScene: 'Environment has no linked scene.',
  noEventsAtDanger: 'Environment carries danger but composes no events.',
  taskNoDescription: 'A gathering task has no description.',
  locallyExcluded: 'Some tasks/events are excluded for this environment.',
};

function readinessMessage(code) {
  return READINESS_ISSUE_MESSAGES[code] || code;
}

/** A recipe readiness issue, deep-linking to its `recipe-edit` tab. */
function tagRecipeIssue(issue, recipe) {
  return {
    kind: 'recipe',
    entityId: recipe.id ?? null,
    entityName: trimmed(recipe.name) || recipe.id || 'recipe',
    severity: issue.severity,
    blocks: issue.blocks === 'enable' ? 'enable' : undefined,
    code: issue.id,
    message: readinessMessage(issue.id),
    nav: { view: 'recipe-edit', tab: issue.target || 'overview' },
  };
}

/**
 * An environment readiness issue, kinded `task` or `event` when bound to one. The editor selects
 * only an environment, so every such issue carries its owning `environmentId` for the deep link.
 */
function tagEnvironmentIssue(issue, environment) {
  const recordKind =
    issue.recordKind === 'task' || issue.recordKind === 'event' ? issue.recordKind : null;
  const kind = recordKind || 'environment';
  const environmentId = environment?.id ?? null;
  const entityId = recordKind ? (issue.recordId ?? null) : environmentId;
  const entityName = recordKind
    ? trimmed(issue.recordName) || issue.recordId || recordKind
    : trimmed(environment?.name) || environment?.id || 'environment';
  return {
    kind,
    entityId,
    environmentId,
    entityName,
    severity: issue.severity,
    blocks: issue.blocks === 'enable' ? 'enable' : undefined,
    code: issue.id,
    message: readinessMessage(issue.id),
    nav: { view: 'environment-edit' },
  };
}

/** Every recipe's readiness issues, with the routing context the routed-check warnings need. */
function collectRecipeIssues(system, recipes, systemComponents) {
  // POLICY-CONDITIONAL, the SAME set the recipe editor's picker offers (issue 1098): with failure
  // results permitted it is the unfiltered tier list, or every failure-tier assignment would read
  // as an unrouted group.
  const routedOutcomeTierOptions = routedTierOptionsForPolicy(
    system?.craftingCheck?.routed,
    system?.craftingCheck?.failureResultPolicy
  );
  const mode = system?.resolutionMode || 'simple';
  const issues = [];
  for (const recipe of asArray(recipes)) {
    const projected = projectRecipe(recipe);
    // The routing basis is the system MODE: `routedByCheck`, and alchemy with a tiered
    // `alchemy.checkMode`, route by the check; every other mode routes by neither.
    let routingProvider = null;
    if (mode === 'routedByCheck') {
      routingProvider = 'check';
    } else if (mode === 'alchemy' && system?.alchemy?.checkMode === 'tiered') {
      routingProvider = 'check';
    }
    const { issues: recipeIssues } = evaluateRecipeReadiness(projected, {
      systemComponents,
      routingProvider,
      routedOutcomeTierOptions,
    });
    for (const issue of recipeIssues) {
      issues.push(tagRecipeIssue(issue, projected));
    }
  }
  return issues;
}

/** Environment readiness issues over each precomputed `composition`, else an empty one. */
function collectEnvironmentIssues(environments) {
  const issues = [];
  for (const environment of asArray(environments)) {
    const composition = environment?.composition || {};
    const { issues: environmentIssues } = evaluateEnvironmentReadiness(environment, composition);
    for (const issue of environmentIssues) {
      issues.push(tagEnvironmentIssue(issue, environment));
    }
  }
  return issues;
}

/**
 * Components whose declared salvage is invalid for the system's mode, each hiding that salvage from
 * players (`blocks: 'visibility'`).
 */
function collectSalvageIssues(system, components) {
  // Salvage switched off is preserved but inert, so it raises nothing.
  if (system?.features?.salvage === false) return [];
  const service = new ResolutionModeService();
  // `validateSalvage` reads `system.components` for progressive difficulty.
  const systemForSalvage = { ...system, components: asArray(components) };
  const issues = [];
  for (const component of asArray(components)) {
    if (!component?.salvage) continue;
    // No salvage result sets means "not salvageable", an opt-in state, not a misconfiguration.
    const salvageGroups = Array.isArray(component.salvage.resultGroups)
      ? component.salvage.resultGroups
      : [];
    if (salvageGroups.length === 0) continue;
    const { valid, errors } = service.validateSalvage(component, systemForSalvage);
    if (valid) continue;
    issues.push({
      kind: 'salvage',
      entityId: component.id ?? null,
      entityName: trimmed(component.name) || 'component',
      severity: 'critical',
      blocks: 'visibility',
      code: 'invalidSalvage',
      message:
        errors[0] || `Salvage for "${trimmed(component.name) || 'this component'}" is invalid.`,
      nav: { view: 'items' },
    });
  }
  return issues;
}

/**
 * Alchemy only: the engine infers the recipe from what was submitted, so a signature collision
 * blocks the whole system. The validator runs on an in-memory adapter.
 */
function collectAlchemySignatureBlockers(system, recipes, components) {
  if (system?.resolutionMode !== 'alchemy') return [];
  const systemId = system?.id ?? 'system';
  const recipeJson = asArray(recipes).map((recipe) =>
    typeof recipe?.toJSON === 'function' ? recipe.toJSON() : recipe
  );
  const validator = new SignatureValidator({
    getSystem: (id) => (id === systemId ? system : null),
    getRecipesForSystem: (id) => (id === systemId ? recipeJson : []),
    getComponentsForSystem: (id) => (id === systemId ? asArray(components) : []),
  });
  const { conflicts } = validator.validateSystem(systemId);
  return conflicts.map((conflict) => ({
    kind: 'system',
    entityId: conflict.recipeA?.id ?? null,
    entityName: conflict.recipeA?.name || conflict.recipeA?.id || 'recipe',
    severity: 'critical',
    blocks: 'system',
    code: 'alchemySignatureCollision',
    message: conflict.message,
    nav: { view: 'system-overview' },
  }));
}

/**
 * The system-level checks on the system's own fields. A `blocks: 'system'` blocker hides the whole
 * system, unlike the per-recipe routed warnings.
 */
function collectSystemBlockers(system, recipes, components) {
  const blockers = [];
  const mode = system?.resolutionMode || 'simple';
  const features = system?.features || {};
  const check = system?.craftingCheck || {};

  // `routedByCheck` routes every recipe by the routed check, so a missing
  // `craftingCheck.routed.rollFormula` (never the `enabled` flag) is an unconditional blocker,
  // with no recipe scan; `routedByIngredients` never raises it.
  if (mode === 'routedByCheck') {
    const hasRoutedFormula = Boolean(trimmed(check.routed?.rollFormula));
    if (!hasRoutedFormula) {
      blockers.push({
        kind: 'system',
        entityId: null,
        entityName: trimmed(system?.name) || system?.id || 'system',
        severity: 'critical',
        blocks: 'system',
        code: 'routedCheckNoFormula',
        message:
          'Routed-by-check mode requires a routed crafting check roll formula; no recipe in this system can resolve until one is configured.',
        nav: { view: 'system-overview' },
      });
    }
  }

  // Routed salvage needs a roll formula and at least one outcome tier. It warns always and
  // escalates to critical once any component declares salvage result groups, but never blocks: a
  // misconfigured optional feature must not hide the system. `validateSalvage` defers the no-tiers
  // gap here so it is reported once.
  if (features.salvage !== false && system?.salvageResolutionMode === 'routed') {
    const salvageCheck = system?.salvageCraftingCheck || {};
    const hasSalvageFormula = Boolean(trimmed(salvageCheck.routed?.rollFormula));
    const hasSalvageTiers = routedOutcomeTierNames(salvageCheck.routed).length > 0;
    const salvageInUse = asArray(components).some(
      (component) =>
        Array.isArray(component?.salvage?.resultGroups) && component.salvage.resultGroups.length > 0
    );
    const entityName = trimmed(system?.name) || system?.id || 'system';
    const pushSalvageIssue = (code, usedMessage, idleMessage) => {
      blockers.push({
        kind: 'system',
        entityId: null,
        entityName,
        severity: salvageInUse ? 'critical' : 'warning',
        code,
        message: salvageInUse ? usedMessage : idleMessage,
        nav: { view: 'system-overview' },
      });
    };
    if (!hasSalvageFormula) {
      pushSalvageIssue(
        'salvageRoutedNoFormula',
        'Components are salvageable but routed salvage has no roll formula; salvage will not resolve until one is configured.',
        'Routed salvage has no roll formula; salvage will not resolve until one is configured.'
      );
    }
    if (!hasSalvageTiers) {
      pushSalvageIssue(
        'salvageRoutedNoTiers',
        'Components are salvageable but routed salvage has no outcome tiers; configure salvage outcome tiers so salvage can be routed.',
        'Routed salvage has no outcome tiers; configure salvage outcome tiers so salvage can be routed.'
      );
    }
  }

  // Progressive needs an authored progressive roll formula (a missing one always blocks) and some
  // component with `difficulty >= 1`.
  if (mode === 'progressive') {
    const progressive = check.progressive || {};
    const hasProgressiveCheck = Boolean(trimmed(progressive.rollFormula));
    if (!hasProgressiveCheck) {
      blockers.push({
        kind: 'system',
        entityId: null,
        entityName: trimmed(system?.name) || system?.id || 'system',
        severity: 'critical',
        blocks: 'system',
        code: 'progressiveNoCheck',
        message: 'Progressive mode requires a configured progressive crafting check.',
        nav: { view: 'system-overview' },
      });
    }
    const hasDifficulty = asArray(components).some((component) => {
      const difficulty = Number(component?.difficulty);
      return Number.isFinite(difficulty) && difficulty >= 1;
    });
    if (asArray(components).length > 0 && !hasDifficulty) {
      blockers.push({
        kind: 'system',
        entityId: null,
        entityName: trimmed(system?.name) || system?.id || 'system',
        severity: 'critical',
        blocks: 'system',
        code: 'progressiveNoDifficulty',
        message: 'Progressive mode requires at least one component with a difficulty of 1 or more.',
        nav: { view: 'system-overview' },
      });
    }
  }

  // Alchemy attempts are single-step, so multi-step recipes left on break recipe authoring.
  if (mode === 'alchemy' && features.multiStepRecipes === true) {
    blockers.push({
      kind: 'system',
      entityId: null,
      entityName: trimmed(system?.name) || system?.id || 'system',
      severity: 'critical',
      blocks: 'system',
      code: 'multiStepInAlchemy',
      message: 'Multi-step recipes cannot be used while the system is in alchemy mode.',
      nav: { view: 'system-overview' },
    });
  }

  // Simple or Tiered alchemy makes the check MANDATORY on its slot (`simple` or `routed`); None
  // never checks.
  if (mode === 'alchemy') {
    const alchemyCheckMode = system?.alchemy?.checkMode || 'none';
    const mandatorySlot =
      alchemyCheckMode === 'tiered'
        ? check.routed
        : alchemyCheckMode === 'simple'
          ? check.simple
          : null;
    if (mandatorySlot && !trimmed(mandatorySlot.rollFormula)) {
      blockers.push({
        kind: 'system',
        entityId: null,
        entityName: trimmed(system?.name) || system?.id || 'system',
        severity: 'critical',
        blocks: 'system',
        code: 'alchemyCheckNoFormula',
        message:
          'The alchemy check mode is Simple or Tiered but no crafting check roll formula is configured; no brew can resolve until one is set.',
        nav: { view: 'system-overview' },
      });
    }

    // Global visibility reveals an alchemy recipe only from `learnedRecipes`, written by
    // `learnOnCraft` and the GM knowledge grant (issue 1289); with learning off only a GM can fill
    // it, and brewing still works, so this is a warning (issue 966).
    const alchemyVisibilityMode = system?.visibilityMode || null;
    if (alchemyVisibilityMode === 'global' && system?.alchemy?.learnOnCraft === false) {
      blockers.push({
        kind: 'system',
        entityId: null,
        entityName: trimmed(system?.name) || system?.id || 'system',
        severity: 'warning',
        code: 'alchemyGlobalNoDiscovery',
        message:
          'Global visibility reveals alchemy recipes only through discovery by brewing or a GM grant, but "Learn a recipe when its ingredients are matched" is off; no player will see a recipe in their Known list unless a GM grants it.',
        nav: { view: 'system-overview' },
      });
    }
  }

  blockers.push(...collectAlchemySignatureBlockers(system, recipes, components));
  return blockers;
}

/** Every readiness issue and system blocker, as one report. */
export function evaluateSystemValidation(system, { recipes, environments, components } = {}) {
  const systemComponents = projectComponentTagOptions(components);

  const issues = [
    ...collectRecipeIssues(system, recipes, systemComponents),
    ...collectEnvironmentIssues(environments),
    ...collectSalvageIssues(system, components),
    ...collectSystemBlockers(system, recipes, components),
  ];

  const counts = {
    critical: issues.filter((issue) => issue.severity === 'critical').length,
    warning: issues.filter((issue) => issue.severity === 'warning').length,
    info: issues.filter((issue) => issue.severity === 'info').length,
    blockers: issues.filter((issue) => issue.blocks === 'system').length,
  };
  const blocksSystem = counts.blockers > 0;

  return { issues, counts, blocksSystem };
}

/**
 * The visibility gate's two facts for the synchronous listing hot path, building no report:
 * `blocksSystem` (no recipe reaches a non-GM, and crafting refuses) and `hiddenEntityIds` (the
 * `blocks: 'visibility'` entities hidden from non-GMs). Compute it once per listing; the GM bypass
 * is the caller's.
 */
export function computeSystemVisibility(system, { recipes, environments, components } = {}) {
  const systemComponents = projectComponentTagOptions(components);
  const issues = [
    ...collectRecipeIssues(system, recipes, systemComponents),
    ...collectEnvironmentIssues(environments),
    ...collectSalvageIssues(system, components),
    ...collectSystemBlockers(system, recipes, components),
  ];

  const blocksSystem = issues.some((issue) => issue.blocks === 'system');
  const hiddenEntityIds = new Set(
    issues
      .filter((issue) => issue.blocks === 'visibility' && issue.entityId != null)
      .map((issue) => String(issue.entityId))
  );
  return { blocksSystem, hiddenEntityIds };
}
