/**
 * Pure system-level validation aggregator.
 *
 * `evaluateSystemValidation(system, { recipes, environments, components })`
 * composes the existing per-entity readiness evaluators (recipe / environment /
 * salvage / signature) into one system-wide report of structured issues, plus a
 * set of NEW system-level blocker checks keyed on the system's own fields (the
 * check / progressive / multi-step / alchemy-signature gaps that make the whole
 * system unusable). The output is a derived/computed view — nothing here is
 * persisted on the `CraftingSystem`.
 *
 * The function is PURE: no Foundry runtime globals (`game`/`ui`/`Hooks`), no
 * store reads, no I/O. It only reads the plain `system`, `recipes`,
 * `environments`, and `components` passed in. This keeps it unit-testable with a
 * plain object graph and reusable from both the synchronous visibility hot-path
 * and the (PR-2) GM overview view.
 *
 * ## Composition contract
 *
 * The per-entity evaluators consume the admin-store PROJECTED shapes, not raw
 * model JSON. This module rebuilds the same projection the editors pass:
 *
 *  - recipes → {@link evaluateRecipeReadiness} with the projected recipe plus
 *    `{ systemComponents, routingProvider, routedOutcomeTierOptions }`, where
 *    `routingProvider = recipe.resultSelection?.provider` and
 *    `routedOutcomeTierOptions = routedSuccessTierOptions(system.craftingCheck?.routed)`,
 *    so #431's `unroutedResultGroup` / `unproducedOutcomeTier` warnings surface;
 *  - environments → {@link evaluateEnvironmentReadiness} with the per-environment
 *    composition view-model the caller precomputed (carried as
 *    `environment.composition`), or an empty composition when absent;
 *  - components → {@link ResolutionModeService#validateSalvage}; and
 *  - the system's recipes/components → {@link SignatureValidator#validateSystem}
 *    via an in-memory adapter (no `CraftingSystemManager`).
 *
 * The readiness evaluators live under `src/ui/svelte/apps/manager/...` and are
 * pure (no Svelte/Foundry). Importing them from `src/systems` is a documented
 * pragmatic layering exception — relocating them is an optional follow-up, NOT in
 * scope here. Do not relocate them.
 *
 * @typedef {'recipe'|'environment'|'task'|'event'|'salvage'|'system'} IssueKind
 * @typedef {'enable'|'visibility'|'system'|undefined} IssueBlocks
 * @typedef {{ view: string, tab?: string }} IssueNav
 * @typedef {{
 *   kind: IssueKind,
 *   entityId: string|null,
 *   environmentId?: string|null,
 *   entityName: string,
 *   severity: 'critical'|'warning'|'info',
 *   blocks: IssueBlocks,
 *   code: string,
 *   message: string,
 *   nav: IssueNav,
 * }} SystemValidationIssue
 *
 * `environmentId` is the owning gathering environment's id, present on
 * environment-derived issues (`environment`/`task`/`event`). The GM overview's
 * deep-link selects the environment by this id because the environment editor
 * cannot deep-target an individual task/event row.
 * @typedef {{
 *   issues: SystemValidationIssue[],
 *   counts: { critical: number, warning: number, info: number, blockers: number },
 *   blocksSystem: boolean,
 * }} SystemValidationReport
 */

import { evaluateEnvironmentReadiness } from '../ui/svelte/apps/manager/environment/environmentReadiness.js';
import { evaluateRecipeReadiness } from '../ui/svelte/apps/manager/recipe/recipeReadiness.js';
import { routedSuccessTierOptions } from '../utils/routedOutcomeKeywords.js';

import { ResolutionModeService } from './ResolutionModeService.js';
import { SignatureValidator } from './SignatureValidator.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * `{ id, tags }` projection of the managed components, matching the admin store's
 * `_buildComponentTagOptions`: tags are trimmed and blanks dropped so a tag
 * requirement's `match.tags` line up with a component's `tags` during expansion.
 *
 * @param {object[]} components
 * @returns {{ id: string, tags: string[] }[]}
 */
function projectComponentTagOptions(components) {
  return asArray(components).map((component) => ({
    id: component?.id,
    tags: Array.isArray(component?.tags)
      ? component.tags.map((tag) => String(tag ?? '').trim()).filter(Boolean)
      : [],
  }));
}

/**
 * Build the projected plain recipe the recipe editor passes to
 * `evaluateRecipeReadiness`. Mirrors the admin store's `_buildRecipeList`
 * projection (sourced from `toJSON()` so step / top-level shapes match
 * `Recipe._normalizeStep` exactly) plus the derived `incomplete` flag.
 *
 * @param {object} recipe Recipe model instance OR plain JSON.
 * @returns {object} Projected recipe.
 */
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
 * Derive whether a recipe is an incomplete authoring shell — persistable but not
 * craftable. Uses the model's `validate()`/`validateStructure()` when available
 * (the authoritative completeness contract), else a coarse count-only fallback.
 * Mirrors the admin store's `_isRecipeIncomplete`.
 *
 * @param {object} recipe Recipe model instance OR plain JSON.
 * @param {object} raw The recipe's JSON projection.
 * @returns {boolean}
 */
function isRecipeIncomplete(recipe, raw) {
  if (typeof recipe?.validate === 'function' && typeof recipe?.validateStructure === 'function') {
    return recipe.validate().valid === false && recipe.validateStructure().valid === true;
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

/**
 * Localized-copy-free message stems. The (PR-2) overview view maps issue `code`
 * to localized strings; this aggregator carries a stable default message so the
 * report is human-readable without the UI layer (logs, tests, headless callers).
 */
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
  staleIncluded: 'Environment includes a task/event that is no longer available.',
  noScene: 'Environment has no linked scene.',
  noEventsAtDanger: 'Environment carries danger but composes no events.',
  taskNoDescription: 'A gathering task has no description.',
  locallyExcluded: 'Some tasks/events are excluded for this environment.',
};

function readinessMessage(code) {
  return READINESS_ISSUE_MESSAGES[code] || code;
}

/**
 * Re-tag a recipe readiness issue as a system-validation issue. Recipe issues
 * deep-link to the recipe editor (`recipe-edit`) with the issue's editor tab.
 *
 * @param {object} issue Issue from `evaluateRecipeReadiness`.
 * @param {object} recipe Projected recipe.
 * @returns {SystemValidationIssue}
 */
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
 * Re-tag an environment readiness issue. Issues bound to a task/event record
 * (`recordKind`) are kinded `task`/`event`; the rest are environment-level. All
 * three deep-link to the environment editor, which selects an environment by id
 * — so every environment-derived issue carries `environmentId` (the owning
 * environment) for the deep-link, while `entityId` stays the record's own id
 * (task/event record id, or the environment id) for display/identity. The
 * environment editor cannot deep-target an individual task/event row, so
 * selecting the owning environment is the resolvable deep-link target.
 *
 * @param {object} issue Issue from `evaluateEnvironmentReadiness`.
 * @param {object} environment The environment.
 * @returns {SystemValidationIssue}
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

/**
 * Evaluate the per-recipe readiness issues for every recipe, composing the
 * #431 routing context so its routed-check warnings surface.
 *
 * @param {object} system The crafting system.
 * @param {object[]} recipes Recipe models or JSON.
 * @param {{ id: string, tags: string[] }[]} systemComponents
 * @returns {SystemValidationIssue[]}
 */
function collectRecipeIssues(system, recipes, systemComponents) {
  const routedOutcomeTierOptions = routedSuccessTierOptions(system?.craftingCheck?.routed);
  const issues = [];
  for (const recipe of asArray(recipes)) {
    const projected = projectRecipe(recipe);
    const routingProvider = projected.resultSelection?.provider || null;
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

/**
 * Evaluate the per-environment readiness issues. The caller precomputes each
 * environment's composition view-model (`{ counts, tasks, events }`) and carries
 * it as `environment.composition`; with none, an empty composition is used so the
 * aggregator stays pure and never reaches into a store.
 *
 * @param {object[]} environments
 * @returns {SystemValidationIssue[]}
 */
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
 * Evaluate per-component salvage validity. A component whose salvage config is
 * invalid for the system's salvage mode surfaces a `salvage` issue that hides the
 * component's salvage at craft time (`blocks: 'visibility'`), deep-linking to the
 * component editor.
 *
 * @param {object} system The crafting system (with `components` for difficulty lookups).
 * @param {object[]} components
 * @returns {SystemValidationIssue[]}
 */
function collectSalvageIssues(system, components) {
  const service = new ResolutionModeService();
  // `validateSalvage` reads `system.components` for progressive difficulty; merge
  // the passed component list so the check resolves difficulties purely.
  const systemForSalvage = { ...system, components: asArray(components) };
  const issues = [];
  for (const component of asArray(components)) {
    if (!component?.salvage) continue;
    const { valid, errors } = service.validateSalvage(component, systemForSalvage);
    if (valid) continue;
    issues.push({
      kind: 'salvage',
      entityId: component.id ?? null,
      entityName: trimmed(component.name) || component.id || 'component',
      severity: 'critical',
      blocks: 'visibility',
      code: 'invalidSalvage',
      message: errors[0] || `Salvage for "${component.name || component.id}" is invalid.`,
      nav: { view: 'items' },
    });
  }
  return issues;
}

/**
 * Signature-collision blocker for ALCHEMY mode (subsumes #99). In alchemy mode
 * the engine infers the recipe from submitted ingredients, so overlapping
 * ingredient signatures make the whole system ambiguous and unusable. Runs the
 * pure `SignatureValidator` against an in-memory adapter built from the passed
 * recipes/components — no `CraftingSystemManager`.
 *
 * @param {object} system The crafting system.
 * @param {object[]} recipes Recipe models or JSON.
 * @param {object[]} components
 * @returns {SystemValidationIssue[]}
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
 * The NEW system-level blocker checks, keyed on the system's own fields. Each
 * makes the whole system unusable → `blocks: 'system'`. Distinct from #431's
 * per-recipe `severity: 'warning'` routed issues (those stay warnings with no
 * `blocks`). The alchemy signature collision is handled separately because it
 * needs the recipe/component graph.
 *
 * @param {object} system The crafting system.
 * @param {object[]} recipes Recipe models or JSON.
 * @param {object[]} components
 * @returns {SystemValidationIssue[]}
 */
function collectSystemBlockers(system, recipes, components) {
  const blockers = [];
  const mode = system?.resolutionMode || 'simple';
  const features = system?.features || {};
  const check = system?.craftingCheck || {};
  const checksEnabled = features.craftingChecks === true || check.enabled === true;

  // Routed `check` provider in use but no usable crafting check: a routed recipe
  // whose result routing is the `check` provider needs either a routed roll
  // formula OR an enabled macro/builtIn check. With neither, every such craft
  // dead-ends — the whole system is unusable.
  if (mode === 'routed') {
    const usesCheckProvider = asArray(recipes).some((recipe) => {
      const raw = typeof recipe?.toJSON === 'function' ? recipe.toJSON() : recipe || {};
      return raw?.resultSelection?.provider === 'check';
    });
    const hasRoutedFormula = Boolean(trimmed(check.routed?.rollFormula));
    if (usesCheckProvider && !hasRoutedFormula && !checksEnabled) {
      blockers.push({
        kind: 'system',
        entityId: null,
        entityName: trimmed(system?.name) || system?.id || 'system',
        severity: 'critical',
        blocks: 'system',
        code: 'routedCheckNoFormula',
        message:
          'Routed check-mode recipes are configured but the system has no routed crafting check.',
        nav: { view: 'system-overview' },
      });
    }
  }

  // Progressive mode with no progressive check, or components missing a usable
  // difficulty: the progressive award math needs a configured formula (or an
  // enabled check) and per-component `difficulty >= 1`.
  if (mode === 'progressive') {
    const progressive = check.progressive || {};
    const hasProgressiveCheck = Boolean(trimmed(progressive.rollFormula)) || checksEnabled;
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

  // Multi-step recipes are incompatible with alchemy mode (alchemy attempts are
  // single-step ingredient matches), so leaving the feature on in alchemy mode
  // is a structural misconfiguration that breaks recipe authoring.
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

  blockers.push(...collectAlchemySignatureBlockers(system, recipes, components));
  return blockers;
}

/**
 * Aggregate every per-entity readiness issue plus the system-level blocker checks
 * into one report.
 *
 * @param {object} system The crafting system (plain projected shape or model).
 * @param {object} [collaborators]
 * @param {object[]} [collaborators.recipes] Recipes in the system (models or JSON).
 * @param {object[]} [collaborators.environments] Gathering environments (each may
 *   carry a precomputed `composition` view-model).
 * @param {object[]} [collaborators.components] Managed components in the system.
 * @returns {SystemValidationReport}
 */
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
 * The lightweight visibility decision for the synchronous listing hot-path.
 * Computes ONLY the two facts the player-facing visibility gate needs:
 *
 *  - `blocksSystem`: any `blocks: 'system'` blocker is present → the system
 *    exposes NO recipes to non-GM users and the crafting guard rejects; and
 *  - `hiddenEntityIds`: the ids of entities carrying a `blocks: 'visibility'`
 *    issue (the per-entity display guard) — excluded only for non-GM users.
 *
 * It does NOT build localized messages or the full kind-grouped overview, so a
 * per-render listing read stays cheap. Callers should compute it once per
 * listing call (cache it) rather than re-evaluating per entity. GM bypass is the
 * caller's responsibility: a GM must see everything, so callers skip both tiers
 * when `game.user?.isGM` (the gate helpers below encapsulate that).
 *
 * @param {object} system The crafting system.
 * @param {object} [collaborators] Same shape as {@link evaluateSystemValidation}.
 * @returns {{ blocksSystem: boolean, hiddenEntityIds: Set<string> }}
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
