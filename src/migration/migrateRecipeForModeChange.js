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
 * Migratability matrix (per the `resolution-modes/spec.md` normative 5×5). RI =
 * `routedByIngredients`, RC = `routedByCheck`:
 *
 *   | From \ To  | simple              | RI                       | RC                       | progressive         | alchemy                              |
 *   |------------|---------------------|--------------------------|--------------------------|---------------------|--------------------------------------|
 *   | simple     | —                   | clear                    | clear; reconcile         | clear               | seed                                 |
 *   | RI         | clear if 1×1 else del| —                        | carry; reconcile         | clear if 1×1 else del| seed=ingredientSet, single-step else del |
 *   | RC         | clear if 1×1 else del| carry; reconcile         | —                        | clear if 1×1 else del| seed=check, single-step else del     |
 *   | progressive| clear               | clear                    | clear; reconcile         | —                   | seed                                 |
 *   | alchemy    | clear if 1×1 else del| clear (drop), carry      | clear (drop), carry; recon| clear if 1×1 else del| —                                   |
 *
 *   - "seed": ALCHEMY is the only provider-routed target, so seed its
 *     `resultSelection.provider` — `ingredientSet`/`check` when the source is the
 *     matching routed mode, otherwise {@link chooseSeedProvider}'s choice.
 *   - "clear": the target mode does not route via a recipe-level provider, so
 *     `resultSelection` is set to `null` (a no-op for routed modes, which never
 *     carry one).
 *   - "carry": the recipe is already structurally shaped for the target mode; it is
 *     carried verbatim.
 *   - "reconcile": the recipe survives (`carry`/`clear`) but its routing data is
 *     stale for the new basis (group names under check routing, or ingredient-set
 *     `resultGroupId` mappings under ingredient routing). It is FLAGGED via
 *     `reconcile: true` and surfaces as a re-authoring validation issue — never
 *     silently mis-routed. Re-running a `carry` with no reconcile pending is
 *     idempotent.
 *   - "delete": a structural constraint cannot be met (narrowing a >1×1 recipe into
 *     `simple`/`progressive`, or moving a multi-step recipe into `alchemy`).
 *
 * `RI↔RC` never deletes (`carry`); it reconciles stale routing. Reuses the
 * `_seedProvider`/`_clone` idiom from `migrateLegacyResolutionModes.js`. The
 * alchemy provider set is `['ingredientSet', 'check']`.
 *
 * @module migrateRecipeForModeChange
 */

// Only ALCHEMY routes via a recipe-level `resultSelection.provider` now; the two
// routed crafting modes derive their basis from the system mode.
const ROUTED_MODES = new Set(['routedByIngredients', 'routedByCheck']);
const SINGLE_GROUP_MODES = new Set(['simple', 'progressive']);

/**
 * @typedef {object} ModeChangeResult
 * @property {'lossless'|'seeded'|'cleared'|'carry'|'delete'} outcome
 *   Classification of what happened: `lossless` (no-op carry, already conforming),
 *   `seeded` (an alchemy provider was seeded), `cleared` (`resultSelection` cleared),
 *   `carry` (carried verbatim into a mode that keeps existing routing), or
 *   `delete` (a structural constraint cannot be met — caller must delete).
 * @property {boolean} [reconcile] When true, the recipe survives but its routing
 *   data is stale for the new basis and must be re-authored (surfaced as a
 *   validation issue, never silently mis-routed).
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
 * @param {object} [_system] The target system. Retained for call-site parity with
 *   `classifyModeChange`; the per-recipe pass no longer seeds a provider (alchemy's
 *   routing basis moved to the system-level `alchemy.checkMode`), so it is unused.
 * @returns {ModeChangeResult}
 */
export function migrateRecipeForModeChange(recipeJSON, fromMode, toMode, _system = {}) {
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

  // Alchemy no longer routes via a per-recipe `resultSelection.provider` (retired for
  // the system-level `alchemy.checkMode`) and requires EXACTLY ONE ingredient set.
  // Migrating INTO alchemy therefore clears any stale `resultSelection` and collapses
  // a multi-INGREDIENT-SET recipe to its first set (multi-STEP was already deleted
  // above). The system-level `checkMode` is seeded separately (defaults to `none`
  // when the system switches to alchemy); this per-recipe pass never seeds a provider.
  if (toMode === 'alchemy') {
    const reasons = [];
    let changed = false;
    if (Array.isArray(recipeJSON.ingredientSets) && recipeJSON.ingredientSets.length > 1) {
      recipeJSON.ingredientSets = recipeJSON.ingredientSets.slice(0, 1);
      changed = true;
      reasons.push('collapsed multiple ingredient sets to the first set for alchemy mode');
    }
    if (recipeJSON.resultSelection != null) {
      recipeJSON.resultSelection = null;
      changed = true;
      reasons.push('cleared resultSelection for alchemy mode');
    }
    return {
      outcome: changed ? 'cleared' : 'lossless',
      recipe: recipeJSON,
      reasons: reasons.length > 0 ? reasons : ['no alchemy reshaping required'],
    };
  }

  // A routed crafting target derives its basis from the system mode and never
  // carries a `resultSelection`. RI↔RC is carried verbatim; every other source has
  // its `resultSelection` dropped. Stale routing data (group names for check
  // routing, ingredient-set `resultGroupId` for ingredient routing) is surfaced as
  // a re-authoring validation issue via `reconcile`, never silently mis-routed.
  if (ROUTED_MODES.has(toMode)) {
    const reconcile =
      toMode === 'routedByCheck' ||
      (toMode === 'routedByIngredients' && fromMode === 'routedByCheck');
    const fromRouted = ROUTED_MODES.has(fromMode);
    if (fromRouted) {
      // RI↔RC: structurally identical, carry verbatim (and reconcile stale routing).
      return {
        outcome: 'carry',
        recipe: recipeJSON,
        reconcile,
        reasons: reconcile
          ? [`carried into ${toMode}; routing data must be re-authored for the new basis`]
          : ['routing carried for the new mode'],
      };
    }
    const cleared = recipeJSON.resultSelection != null;
    if (cleared) recipeJSON.resultSelection = null;
    return {
      outcome: cleared ? 'cleared' : 'carry',
      recipe: recipeJSON,
      reconcile,
      reasons: [
        cleared
          ? `cleared resultSelection for ${toMode} mode`
          : `no resultSelection to clear for ${toMode} mode`,
        ...(reconcile ? [`routing data must be re-authored for ${toMode}`] : []),
      ],
    };
  }

  // Target mode does not route via a recipe-level provider (simple/progressive):
  // clear any selection so the recipe conforms to the new mode.
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
 * Choose the provider to seed for the ALCHEMY target mode (the only mode that still
 * routes via a recipe-level provider). Prefer `check` ONLY when the system has an
 * authored SIMPLE check roll formula (alchemy's check provider routes by the simple
 * check outcome), else the always-available `ingredientSet` provider. Seeding can
 * therefore never manufacture an avoidable system-level gap. A check is usable IFF
 * it has an authored roll formula — the legacy `enabled` / `features.craftingChecks`
 * toggles do not make a check usable, so they are not consulted here (aligns with
 * `ResolutionModeService._hasRollFormula` and `systemValidation`).
 *
 * Also used by the recipe editor to seed an alchemy provider when a recipe is
 * switched to Complex in an alchemy system (so the routing basis is never left
 * unselected), keeping that default in lockstep with this migration's contract.
 * The `toMode` param is retained for call-site clarity; only `alchemy` reaches here.
 * @param {object} system
 * @param {string} toMode The target resolution mode (`alchemy`).
 * @returns {'check'|'ingredientSet'}
 */
export function chooseSeedProvider(system, toMode) {
  const check = _isPlainObject(system?.craftingCheck) ? system.craftingCheck : {};
  const hasUsableFormula =
    toMode === 'alchemy'
      ? _trimmed(check.simple?.rollFormula).length > 0
      : _trimmed(check.routed?.rollFormula).length > 0;
  return hasUsableFormula ? 'check' : 'ingredientSet';
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
