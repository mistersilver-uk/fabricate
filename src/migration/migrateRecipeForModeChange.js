/**
 * Migration-first resolution-mode change (pure, no I/O).
 *
 * When a crafting system's `resolutionMode` changes, recipes are MIGRATED to fit
 * the new mode wherever possible instead of being deleted. A recipe is only
 * deleted when a per-recipe STRUCTURAL constraint of the target mode cannot be met
 * by seeding a provider or clearing the routed `resultSelection`:
 *
 *   - narrowing to `simple` or `progressive` (which require exactly one ingredient
 *     set AND one result group) from a recipe that carries more than one of either
 *     ("1×1" = exactly one of each), or
 *   - moving a multi-step recipe into `alchemy` (alchemy does not support
 *     multi-step recipes).
 *
 * SYSTEM-LEVEL gaps (e.g. switching to `progressive` without a progressive check,
 * or to `routed`/`check` without a routed roll formula) NEVER delete or disable a
 * recipe here — they are surfaced as `blocks:'system'` validation issues by the
 * system-validation aggregator (`src/systems/systemValidation.js`) and gate
 * visibility, not deletion.
 *
 * Migratability matrix (per the `004-resolution-modes` Mode Invariant):
 *
 *   | From \ To   | simple                  | routed | progressive             | alchemy                 |
 *   |-------------|-------------------------|--------|-------------------------|-------------------------|
 *   | simple      | —                       | seed   | clear                   | seed                    |
 *   | routed      | clear if 1×1 else delete | —      | clear if 1×1 else delete | carry if single-step else delete |
 *   | progressive | clear                   | seed   | —                       | seed                    |
 *   | alchemy     | clear if 1×1 else delete | carry  | clear if 1×1 else delete | —                       |
 *
 *   - "seed": the target mode routes via a recipe-level provider, so seed
 *     `resultSelection.provider` (`check` when the system has a usable crafting
 *     check, otherwise `ingredientSet`) if one is not already present.
 *   - "clear": the target mode does not route via a recipe-level provider, so
 *     `resultSelection` is set to `null`.
 *   - "carry": the recipe is already shaped for the target mode; it is carried
 *     verbatim.
 *
 * Reuses the `_seedProvider`/`_clone` idiom from `migrateLegacyResolutionModes.js`.
 * The provider set is `['ingredientSet', 'check']` (post-#424 / post-1.6.0).
 *
 * @module migrateRecipeForModeChange
 */

const PROVIDER_MODES = new Set(['routed', 'alchemy']);
const SINGLE_GROUP_MODES = new Set(['simple', 'progressive']);

/**
 * @typedef {object} ModeChangeResult
 * @property {'lossless'|'seeded'|'cleared'|'carry'|'delete'} outcome
 *   Classification of what happened: `lossless` (no-op carry, already conforming),
 *   `seeded` (a provider was seeded), `cleared` (routed `resultSelection` cleared),
 *   `carry` (carried verbatim into a provider mode that keeps existing routing), or
 *   `delete` (a structural constraint cannot be met — caller must delete).
 * @property {object|null} recipe The migrated recipe JSON, or `null` when `delete`.
 * @property {string[]} reasons Human-readable notes describing the decision.
 */

/**
 * Classify a resolution-mode change for one recipe WITHOUT mutating the input.
 * Used by the UI dry-run to report migrate/delete counts before committing.
 *
 * @param {object} recipeJSON Recipe JSON (as produced by `Recipe#toJSON`).
 * @param {string} fromMode The current system resolution mode.
 * @param {string} toMode The target system resolution mode.
 * @param {object} [system] The target system (used to choose the seed provider).
 * @returns {ModeChangeResult}
 */
export function classifyModeChange(recipeJSON, fromMode, toMode, system = {}) {
  return migrateRecipeForModeChange(_clone(recipeJSON), fromMode, toMode, system);
}

/**
 * Migrate one recipe for a resolution-mode change. Pure: operates on the passed
 * `recipeJSON` (mutating it in place when a transform applies) and returns the
 * result; performs no I/O. For a no-mutation dry run use {@link classifyModeChange}.
 *
 * @param {object} recipeJSON Recipe JSON (as produced by `Recipe#toJSON`).
 * @param {string} fromMode The current system resolution mode.
 * @param {string} toMode The target system resolution mode.
 * @param {object} [system] The target system (used to choose the seed provider).
 * @returns {ModeChangeResult}
 */
export function migrateRecipeForModeChange(recipeJSON, fromMode, toMode, system = {}) {
  if (!_isPlainObject(recipeJSON)) {
    return { outcome: 'carry', recipe: recipeJSON, reasons: [] };
  }
  if (fromMode === toMode) {
    return { outcome: 'lossless', recipe: recipeJSON, reasons: ['mode unchanged'] };
  }

  // Structural deletion: a multi-step recipe cannot move into alchemy (alchemy
  // does not support multi-step recipes). This is a per-recipe structural
  // constraint, not a system-level gap.
  if (toMode === 'alchemy' && _stepCount(recipeJSON) > 1) {
    return {
      outcome: 'delete',
      recipe: null,
      reasons: ['multi-step recipe cannot be migrated into alchemy mode'],
    };
  }

  // Structural deletion: narrowing into a single-group mode (simple/progressive)
  // requires exactly one ingredient set AND one result group ("1×1"). A recipe
  // carrying more than one of either cannot be reshaped by seed/clear alone.
  if (SINGLE_GROUP_MODES.has(toMode) && !_isOneByOne(recipeJSON)) {
    return {
      outcome: 'delete',
      recipe: null,
      reasons: [
        `recipe has multiple ingredient sets or result groups and cannot be narrowed to ${toMode} mode`,
      ],
    };
  }

  // Target mode routes via a recipe-level provider (routed/alchemy).
  if (PROVIDER_MODES.has(toMode)) {
    // routed → alchemy and alchemy → routed keep the same provider contract, so a
    // recipe that already has a valid provider is carried verbatim.
    if (PROVIDER_MODES.has(fromMode) && _hasValidProvider(recipeJSON)) {
      return { outcome: 'carry', recipe: recipeJSON, reasons: ['routing provider preserved'] };
    }
    const provider = _chooseSeedProvider(system, toMode);
    _seedProvider(recipeJSON, provider);
    return {
      outcome: 'seeded',
      recipe: recipeJSON,
      reasons: [`seeded resultSelection.provider = "${provider}" for ${toMode} mode`],
    };
  }

  // Target mode does not route via a recipe-level provider (simple/progressive):
  // clear any routed selection so the recipe conforms to the new mode.
  if (recipeJSON.resultSelection != null) {
    recipeJSON.resultSelection = null;
    return {
      outcome: 'cleared',
      recipe: recipeJSON,
      reasons: [`cleared resultSelection for ${toMode} mode`],
    };
  }

  return { outcome: 'lossless', recipe: recipeJSON, reasons: ['no routed selection to clear'] };
}

/**
 * Choose the provider to seed for a provider-routed target mode. Prefer `check`
 * ONLY when the target mode has an authored roll formula for the formula the
 * check provider actually keys on (so name-routing resolves), else the
 * always-available `ingredientSet` provider. Seeding can therefore never manufacture
 * an avoidable system-level gap. A check is usable IFF it has an authored roll
 * formula for its mode — the legacy `enabled` / `features.craftingChecks` toggles
 * do not make a check usable, so they are not consulted here (aligns with
 * `ResolutionModeService._hasRollFormula` and `systemValidation`).
 *
 * The keyed formula differs by target mode: `routed` routes by the routed check's
 * outcome tier (`routed.rollFormula`); `alchemy`'s check provider routes by the
 * SIMPLE check outcome (`simple.rollFormula`), so the routed formula is the wrong
 * one to consult there.
 * @param {object} system
 * @param {string} toMode The target resolution mode (`routed` | `alchemy`).
 * @returns {'check'|'ingredientSet'}
 */
function _chooseSeedProvider(system, toMode) {
  const check = _isPlainObject(system?.craftingCheck) ? system.craftingCheck : {};
  const hasUsableFormula =
    toMode === 'alchemy'
      ? _trimmed(check.simple?.rollFormula).length > 0
      : _trimmed(check.routed?.rollFormula).length > 0;
  return hasUsableFormula ? 'check' : 'ingredientSet';
}

/** Whether the recipe already carries one of the two valid routed providers. */
function _hasValidProvider(recipe) {
  const provider = recipe?.resultSelection?.provider;
  return provider === 'ingredientSet' || provider === 'check';
}

/** Number of authoring steps on the recipe (0 for a flat recipe). */
function _stepCount(recipe) {
  return Array.isArray(recipe.steps) ? recipe.steps.length : 0;
}

/**
 * Whether the recipe is "1×1": exactly one ingredient set and exactly one result
 * group across every scope. A multi-step recipe is never 1×1 (each step is its own
 * scope and single-group modes do not support steps).
 * @param {object} recipe
 * @returns {boolean}
 */
function _isOneByOne(recipe) {
  if (_stepCount(recipe) > 0) return false;
  const ingredientSets = Array.isArray(recipe.ingredientSets) ? recipe.ingredientSets : [];
  const resultGroups = Array.isArray(recipe.resultGroups) ? recipe.resultGroups : [];
  return ingredientSets.length <= 1 && resultGroups.length <= 1;
}

/**
 * Seed `resultSelection.provider` on a recipe without clobbering an existing valid
 * selection. Mirrors the `_seedProvider` idiom from `migrateLegacyResolutionModes.js`.
 * @param {object} recipe
 * @param {string} provider
 */
function _seedProvider(recipe, provider) {
  if (!_isPlainObject(recipe.resultSelection)) {
    recipe.resultSelection = { provider };
    return;
  }
  if (!_hasValidProvider(recipe)) {
    recipe.resultSelection.provider = provider;
  }
}

function _trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function _isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function _clone(value) {
  if (value === null || value === undefined) return value;
  return structuredClone(value);
}
