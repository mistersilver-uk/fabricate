import { resolveProgressiveAward } from '../utils/progressiveAward.js';
import {
  matchResultGroupsByName,
  normalizeRoutedName,
  isFailKeyword,
  isMissKeyword,
  isReservedRoutedName,
} from '../utils/routedOutcomeKeywords.js';

/**
 * Handles mode-specific validation and result resolution logic.
 *
 * Canonical resolution modes are `simple`, `routed`, `progressive`, and
 * `alchemy`. `routed` is the only non-simple selection model and dispatches on
 * `resultSelection.provider`:
 *  - `ingredientSet` — the chosen ingredient set's `resultGroupId` selects the
 *    result group (the former `mapped` behavior, now canonical).
 *  - `check` — the system-level crafting-check outcome name routes to the
 *    `ResultGroup` of the same name. This is the canonical check-driven provider.
 *
 * Legacy `mapped`/`tiered` are NOT live modes. They are accepted only as
 * one-time inputs to the 1.4.0 migration (`migrateLegacyResolutionModes`), and
 * the manager's token normalizer maps any un-migrated/imported `mapped`/`tiered`
 * token to `routed`. No `mapped`/`tiered` resolution branch survives here.
 */
export class ResolutionModeService {
  constructor(craftingSystemManager) {
    this.craftingSystemManager = craftingSystemManager;
  }

  getSystem(recipe) {
    if (!recipe?.craftingSystemId) return null;
    return this.craftingSystemManager?.getSystem(recipe.craftingSystemId) || null;
  }

  getMode(recipe) {
    const system = this.getSystem(recipe);
    return system?.resolutionMode || 'simple';
  }

  getProvider(recipe) {
    return recipe?.resultSelection?.provider || null;
  }

  getResultSelection(recipe, step = null) {
    return step?.resultSelection || recipe?.resultSelection || null;
  }

  getProviderForStep(recipe, step = null) {
    return this.getResultSelection(recipe, step)?.provider || null;
  }

  getExecutionSteps(recipe) {
    return typeof recipe?.getExecutionSteps === 'function' ? recipe.getExecutionSteps() : [];
  }

  // ---------------------------------------------------------------------------
  // Routed name-normalization + reserved-keyword helpers. Shared with Recipe.js
  // via ../utils/routedOutcomeKeywords.js so runtime resolution and authoring-time
  // validation use one source of truth. They apply under every routed provider
  // (ingredientSet / check).
  // ---------------------------------------------------------------------------

  _normalizeName(name) {
    return normalizeRoutedName(name);
  }

  // The fail/miss/hazard keyword sets are shared with Recipe.js via
  // ../utils/routedOutcomeKeywords.js so the runtime failure path and the routed
  // ResultGroup.name validation can never drift. The hazard family
  // (hazard/danger/complication/trap/oops) routes to the failure path here.
  _isFailKeyword(name) {
    return isFailKeyword(name);
  }

  _isMissKeyword(name) {
    return isMissKeyword(name);
  }

  /**
   * Reserved/duplicate routed `ResultGroup.name` validation, applied under every
   * routed provider. Reserved names (fail/miss/hazard families) may not name a
   * result group; names must be unique under trim-normalized comparison.
   * @param {Array<{id?: string, name?: string}>} groups
   * @param {{name?: string, id?: string}} step
   * @param {string[]} errors
   */
  _validateRoutedGroupNames(groups, step, errors) {
    const seenNames = new Set();
    const label = step?.name || step?.id;
    for (const group of groups || []) {
      const normalized = normalizeRoutedName(group?.name);
      if (!normalized) continue;
      if (isReservedRoutedName(normalized)) {
        errors.push(
          `Result group name "${group.name}" conflicts with reserved routing keyword in step "${label}"`
        );
      }
      if (seenNames.has(normalized)) {
        errors.push(
          `Duplicate result group name "${group.name}" (case-insensitive) in step "${label}" — routed mode requires unique names`
        );
      }
      seenNames.add(normalized);
    }
  }

  /**
   * Validate a recipe against its system's resolution mode.
   * @param {Recipe} recipe
   * @param {{requireComplete?: boolean}} [options] - When `requireComplete` is
   *   false, mode COMPLETENESS checks (e.g. "must have exactly/at least N
   *   ingredient set/result group", progressive "requires ordered results", and a
   *   not-yet-chosen routed/alchemy `resultSelection.provider`) are waived so an
   *   incomplete authoring shell can persist. Mode REFERENCE-INTEGRITY checks
   *   (an invalid provider VALUE, an invalid routed `ingredientSet` resultGroupId,
   *   reserved/duplicate routed `ResultGroup.name`) always apply. Legacy `mapped`
   *   and `tiered` are not live modes — they are accepted only as one-time
   *   migration inputs (see `migrateLegacyResolutionModes`) and the manager's
   *   token normalizer maps un-migrated tokens to `routed`.
   * @returns {{valid: boolean, errors: string[]}}
   */
  validateRecipe(recipe, { requireComplete = true } = {}) {
    const errors = [];
    const system = this.getSystem(recipe);
    if (!system) return { valid: true, errors };

    const mode = this.getMode(recipe);
    const steps = this.getExecutionSteps(recipe);
    const checkEnabled =
      system?.craftingCheck?.enabled === true ||
      !!system?.craftingCheck?.macroUuid ||
      system?.craftingCheck?.checkSource === 'builtIn';

    for (const step of steps) {
      const sets = Array.isArray(step?.ingredientSets) ? step.ingredientSets : [];
      const groups = Array.isArray(step?.resultGroups) ? step.resultGroups : [];

      if (mode === 'simple') {
        if (requireComplete && sets.length !== 1)
          errors.push(
            `Step "${step.name || step.id}" must have exactly 1 ingredient set in simple mode`
          );
        if (requireComplete && groups.length !== 1)
          errors.push(
            `Step "${step.name || step.id}" must have exactly 1 result group in simple mode`
          );
      }

      if (mode === 'routed') {
        if (requireComplete && sets.length === 0)
          errors.push(
            `Step "${step.name || step.id}" must have at least 1 ingredient set in routed mode`
          );
        if (requireComplete && groups.length === 0)
          errors.push(
            `Step "${step.name || step.id}" must have at least 1 result group in routed mode`
          );

        const provider = this.getProviderForStep(recipe, step);
        if (!provider) {
          // A not-yet-chosen provider is a completeness gap (an authoring shell),
          // not a reference-integrity error — waive it while drafting.
          if (requireComplete)
            errors.push(
              `Step "${step.name || step.id}" in routed mode requires resultSelection.provider`
            );
        } else if (!['ingredientSet', 'check'].includes(provider)) {
          errors.push('Invalid result selection provider: ' + provider);
        }
        // A recipe that routes by the `check` provider is structurally valid
        // regardless of the system's check configuration. Whether the system has
        // a usable routed crafting check (a configured `routed.rollFormula`) is a
        // SYSTEM-level concern surfaced by `systemValidation`, not a per-recipe
        // validation error.
        if (provider === 'ingredientSet') {
          // Reference integrity: an ingredientSet resultGroupId must point at a
          // real group in the step (the former `mapped` invariant, now canonical).
          const groupIds = new Set(groups.map((g) => g.id));
          for (const set of sets) {
            const mappedId = set?.resultGroupId || null;
            if (mappedId && !groupIds.has(mappedId)) {
              errors.push(
                `Ingredient set "${set.name || set.id}" has invalid resultGroupId "${mappedId}"`
              );
            }
          }
        }
        // Reserved/duplicate ResultGroup.name applies under EVERY routed provider
        // (spec 004 §Validation lines 79-80).
        this._validateRoutedGroupNames(groups, step, errors);
      }

      if (mode === 'progressive') {
        if (!checkEnabled) errors.push('Progressive mode requires crafting checks enabled');
        if (!system?.craftingCheck?.progressive) {
          errors.push('Progressive mode requires craftingCheck.progressive configuration');
        }
        if (requireComplete && sets.length !== 1)
          errors.push(
            `Step "${step.name || step.id}" must have exactly 1 ingredient set in progressive mode`
          );
        if (requireComplete && groups.length !== 1)
          errors.push(
            `Step "${step.name || step.id}" must have exactly 1 result group in progressive mode`
          );

        const results = groups?.[0]?.results || [];
        if (requireComplete && results.length === 0) {
          errors.push(
            `Step "${step.name || step.id}" requires ordered results in progressive mode`
          );
        }
        for (const result of results) {
          const difficulty = this._getDifficulty(
            system,
            result?.componentId || result?.systemItemId
          );
          if (!Number.isFinite(difficulty) || difficulty < 1) {
            errors.push(
              `Result "${result?.id || 'unknown'}" references component without valid difficulty`
            );
          }
        }
      }
    }

    if (mode === 'alchemy') {
      // Alchemy recipes cannot have explicit multi-step configuration
      const setsTop = Array.isArray(recipe.ingredientSets) ? recipe.ingredientSets : [];
      const groupsTop = Array.isArray(recipe.resultGroups) ? recipe.resultGroups : [];
      if (requireComplete && setsTop.length === 0)
        errors.push('Alchemy recipe must have at least 1 ingredient set');
      if (requireComplete && groupsTop.length === 0)
        errors.push('Alchemy recipe must have at least 1 result group');
      // No explicit steps allowed
      const explicitSteps =
        typeof recipe.getExecutionSteps === 'function' ? recipe.getExecutionSteps() : [];
      const hasExplicitSteps =
        explicitSteps.length > 1 ||
        (explicitSteps.length === 1 && explicitSteps[0]?.id !== 'implicit-step');
      if (hasExplicitSteps) errors.push('Alchemy recipe must not have explicit steps');
      const provider = this.getProvider(recipe);
      if (!provider) {
        // Missing provider is a completeness gap (drafting shell); waive it unless
        // a complete recipe is required. An invalid provider VALUE still errors below.
        if (requireComplete) errors.push('Alchemy recipe requires resultSelection.provider');
      } else if (!['ingredientSet', 'check'].includes(provider)) {
        errors.push('Invalid result selection provider: ' + provider);
      }
      // The `check` provider is structurally valid regardless of the system's
      // check configuration; a usable routed crafting check is a system-level
      // concern surfaced by `systemValidation`, not a per-recipe error.
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  validateSalvage(component, system) {
    const errors = [];

    // Pre-checks: return early if there's nothing to validate
    if (!component?.salvage || !system) return { valid: true, errors };

    // Legacy salvage tokens (`tiered`/`mapped`) are normalized to canonical
    // values by the manager's salvage token normalizer + the 1.4.0 migration
    // before they reach here, so this path only ever sees canonical modes.
    const mode = system.salvageResolutionMode || 'simple';
    const componentLabel = component.name || component.id || 'unknown';

    if (!['simple', 'routed', 'progressive'].includes(mode)) {
      if (mode === 'alchemy') {
        errors.push('Alchemy mode is not supported for salvage');
      } else {
        errors.push(`Unsupported salvage resolution mode: ${mode}`);
      }
      return { valid: false, errors };
    }

    const groups = Array.isArray(component.salvage.resultGroups)
      ? component.salvage.resultGroups
      : [];

    if (mode === 'simple' && groups.length !== 1) {
      errors.push(
        `Salvage for "${componentLabel}" must have exactly 1 result group in simple mode`
      );
    }

    if (mode === 'routed') {
      const checkEnabled =
        system.salvageCraftingCheck?.enabled === true || !!system.salvageCraftingCheck?.macroUuid;
      const outcomes = Array.isArray(system.salvageCraftingCheck?.outcomes)
        ? system.salvageCraftingCheck.outcomes
        : [];

      if (!checkEnabled) errors.push('Routed salvage mode requires crafting checks enabled');
      if (outcomes.length === 0)
        errors.push('Routed salvage mode requires at least one declared outcome');
      if (groups.length === 0)
        errors.push(
          `Salvage for "${componentLabel}" must have at least 1 result group in routed mode`
        );

      const groupIds = new Set(groups.map((g) => g.id));
      const routing = component.salvage.outcomeRouting || {};
      for (const outcome of outcomes) {
        const target = routing[outcome];
        if (!target || !groupIds.has(target)) {
          errors.push(
            `Outcome "${outcome}" must map to a valid salvage result group for "${componentLabel}"`
          );
        }
      }
    }

    if (mode === 'progressive') {
      const checkEnabled =
        system.salvageCraftingCheck?.enabled === true || !!system.salvageCraftingCheck?.macroUuid;

      if (!checkEnabled) errors.push('Progressive salvage mode requires crafting checks enabled');
      if (!system.salvageCraftingCheck?.progressive) {
        errors.push(
          'Progressive salvage mode requires salvageCraftingCheck.progressive configuration'
        );
      }
      if (groups.length !== 1) {
        errors.push(
          `Salvage for "${componentLabel}" must have exactly 1 result group in progressive mode`
        );
      }

      const results = groups?.[0]?.results || [];
      if (results.length === 0) {
        errors.push(`Salvage for "${componentLabel}" requires ordered results in progressive mode`);
      }
      for (const result of results) {
        const difficulty = this._getDifficulty(system, result?.componentId || result?.systemItemId);
        if (!Number.isFinite(difficulty) || difficulty < 1) {
          errors.push(
            `Result "${result?.id || 'unknown'}" references component without valid difficulty for salvage on "${componentLabel}"`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Resolve a crafting-check outcome name to the id of the matching routed-check
   * outcome tier on the system (active type's tier list), or null when there is
   * no routed config or no name match. Used to route by explicit tier→result-set
   * assignments (`ResultGroup.checkOutcomeIds`).
   *
   * Only `success === true` tiers route via the assignment: a `success: false`
   * tier must never produce a `disposition: 'success'` result, so it returns
   * null here and falls through to the fail/keyword/name handling below.
   * @param {object} system
   * @param {string|null} outcome
   * @returns {string|null}
   */
  _resolveRoutedTierId(system, outcome) {
    const routed = system?.craftingCheck?.routed;
    if (!routed || outcome == null) return null;
    const tiers = routed.type === 'fixed' ? routed.fixedOutcomes : routed.relativeOutcomes;
    if (!Array.isArray(tiers)) return null;
    const normalized = this._normalizeName(outcome);
    const tier = tiers.find(
      (entry) => entry?.success === true && this._normalizeName(entry?.name) === normalized
    );
    return tier?.id || null;
  }

  /**
   * Resolve the result group(s) awarded for a craft attempt, dispatching on the
   * system resolution mode. Thin dispatcher: each mode's logic lives in a private
   * `_resolve*ResultGroups` helper so this method stays a simple switch.
   * @returns {{groups: Array, meta: object}}
   */
  resolveResultGroups({ recipe, step, ingredientSet, checkResult, selectedResultGroupId = null }) {
    const system = this.getSystem(recipe);
    const mode = this.getMode(recipe);
    const allGroups =
      Array.isArray(step?.resultGroups) && step.resultGroups.length > 0
        ? step.resultGroups
        : Array.isArray(recipe?.resultGroups)
          ? recipe.resultGroups
          : [];

    if (mode === 'simple') {
      return { groups: allGroups.slice(0, 1), meta: {} };
    }
    if (mode === 'routed') {
      return this._resolveRoutedResultGroups({
        recipe,
        step,
        ingredientSet,
        checkResult,
        selectedResultGroupId,
        system,
        allGroups,
      });
    }
    if (mode === 'progressive') {
      return this._resolveProgressiveResultGroups({ checkResult, system, allGroups });
    }
    if (mode === 'alchemy') {
      return this._resolveAlchemyResultGroups({ recipe, ingredientSet, checkResult, allGroups });
    }

    return {
      groups: [],
      meta: { error: 'Unknown resolution mode', disposition: 'error' },
    };
  }

  /**
   * Route a normalized check `outcome` to a result group by NAME, shared by the
   * routed and alchemy `check` providers (both key on the crafting-check outcome).
   * Order: fail keyword → miss keyword → exact name match → misconfiguration.
   * @param {string|null} outcome raw outcome string (already coerced to string|null)
   * @param {Array} allGroups candidate result groups
   * @returns {{groups: Array, meta: object}}
   */
  _routeByOutcomeName(outcome, allGroups) {
    const normalized = this._normalizeName(outcome);
    if (this._isFailKeyword(normalized))
      return { groups: [], meta: { outcome, disposition: 'fail' } };
    if (this._isMissKeyword(normalized))
      return { groups: [], meta: { outcome, disposition: 'miss' } };
    // Crafting routes a check outcome to a SINGLE result group (`firstOnly: true`);
    // the per-system routing keys (tier / `checkOutcomeIds`) stay in the caller.
    const matched = matchResultGroupsByName(outcome, allGroups, { firstOnly: true });
    if (matched.length === 0) {
      return {
        groups: [],
        meta: {
          outcome,
          disposition: 'misconfiguration',
          error: `No result group matches outcome "${outcome}"`,
        },
      };
    }
    return { groups: matched, meta: { outcome, disposition: 'success' } };
  }

  /**
   * Route by the chosen ingredient set's `resultGroupId` (the former `mapped`
   * behavior), with the legacy `resultMapping` fallback, then first-group
   * fallback. Shared by routed and alchemy `ingredientSet` providers.
   * @param {{resultGroupId?: string, resultMapping?: string[]}} ingredientSet
   * @param {Array} allGroups
   * @param {string|null} selectedResultGroupId explicit override (routed only)
   * @returns {{groups: Array, meta: object}}
   */
  _routeByIngredientSet(ingredientSet, allGroups, selectedResultGroupId = null) {
    const mappedId = ingredientSet?.resultGroupId || selectedResultGroupId || null;
    if (mappedId) {
      return { groups: allGroups.filter((group) => group.id === mappedId), meta: {} };
    }
    if (Array.isArray(ingredientSet?.resultMapping) && ingredientSet.resultMapping.length > 0) {
      return {
        groups: allGroups.filter((group) => ingredientSet.resultMapping.includes(group.id)),
        meta: {},
      };
    }
    return { groups: allGroups.slice(0, 1), meta: {} };
  }

  /**
   * Routed mode resolution: `ingredientSet` routes by mapping; `check` routes by
   * explicit tier→result-set assignment first, then by outcome name.
   * @returns {{groups: Array, meta: object}}
   */
  _resolveRoutedResultGroups({
    recipe,
    step,
    ingredientSet,
    checkResult,
    selectedResultGroupId,
    system,
    allGroups,
  }) {
    const provider = this.getProviderForStep(recipe, step);
    if (provider === 'ingredientSet') {
      return this._routeByIngredientSet(ingredientSet, allGroups, selectedResultGroupId);
    }
    if (provider === 'check') {
      const outcome = checkResult?.outcome == null ? null : String(checkResult.outcome);
      // Explicit tier→result-set assignment (authored in the recipe editor) wins:
      // resolve the outcome to a routed-check tier id, then route to the result
      // group that lists it in `checkOutcomeIds`.
      const assigned = this._routeByTierAssignment(system, outcome, allGroups);
      // A resolved-but-unassigned tier (the outcome matched an authored success tier
      // but no result group lists its id) is a DISTINCT misconfiguration from "no
      // tier resolved": surface `unrouted-tier` rather than silently falling through
      // to name matching, which would mask the missing assignment.
      if (assigned?.meta?.disposition === 'unrouted-tier') return assigned;
      if (assigned) return assigned;
      // Fallback for recipes without an explicit tier match (no success tier of that
      // name): fail/miss keywords, then match the outcome name to a result group of
      // that name.
      return this._routeByOutcomeName(outcome, allGroups);
    }
    return { groups: allGroups.slice(0, 1), meta: {} };
  }

  /**
   * Resolve a routed-check outcome to its explicit tier→result-set assignment
   * (`ResultGroup.checkOutcomeIds`). Three outcomes:
   *  - `null` — either no success tier of that name resolved, OR the recipe declares
   *    NO `checkOutcomeIds` on any group (it is name-routed, not tier-routed). The
   *    caller falls back to outcome-name matching (the legitimate no-assignment path).
   *  - `disposition:'unrouted-tier'` (empty groups) — the outcome DID resolve to an
   *    authored success tier AND the recipe opted into tier routing (at least one
   *    group declares `checkOutcomeIds`), but no group lists THIS tier's id. This is a
   *    distinct misconfiguration (tier resolved but unassigned); the caller surfaces
   *    it rather than masking it with name matching.
   *  - `disposition:'success'` — routed to the assigned group.
   * @returns {{groups: Array, meta: object}|null}
   */
  _routeByTierAssignment(system, outcome, allGroups) {
    const tierId = this._resolveRoutedTierId(system, outcome);
    if (!tierId) return null;
    const assigned = allGroups.filter(
      (group) => Array.isArray(group.checkOutcomeIds) && group.checkOutcomeIds.includes(tierId)
    );
    if (assigned.length > 0) {
      return { groups: assigned.slice(0, 1), meta: { outcome, disposition: 'success' } };
    }
    // The tier resolved but no group lists it. Distinguish a tier-routed recipe (some
    // group declares `checkOutcomeIds`) — a genuine unrouted-tier misconfiguration —
    // from a purely name-routed recipe (no group declares any), which falls through.
    const recipeUsesTierRouting = allGroups.some(
      (group) => Array.isArray(group.checkOutcomeIds) && group.checkOutcomeIds.length > 0
    );
    if (!recipeUsesTierRouting) return null;
    return {
      groups: [],
      meta: {
        outcome,
        disposition: 'unrouted-tier',
        error: `Outcome tier "${outcome}" is not assigned to any result group`,
      },
    };
  }

  /**
   * Alchemy mode resolution: `ingredientSet` routes by mapping; `check` routes by
   * the crafting-check outcome name (shared with routed via `_routeByOutcomeName`).
   * @returns {{groups: Array, meta: object}}
   */
  _resolveAlchemyResultGroups({ recipe, ingredientSet, checkResult, allGroups }) {
    const provider = this.getProvider(recipe);
    if (provider === 'ingredientSet') {
      const mappedId = ingredientSet?.resultGroupId || null;
      if (mappedId) {
        return { groups: allGroups.filter((g) => g.id === mappedId), meta: {} };
      }
      return { groups: allGroups.slice(0, 1), meta: {} };
    }
    if (provider === 'check') {
      const outcome = checkResult?.outcome == null ? null : String(checkResult.outcome);
      return this._routeByOutcomeName(outcome, allGroups);
    }
    return { groups: allGroups.slice(0, 1), meta: {} };
  }

  /**
   * Progressive mode resolution: spend the check `value` against ordered result
   * difficulties using the system `awardMode` (`equal` | `exceed` | `partial`).
   * @returns {{groups: Array, meta: object}}
   */
  _resolveProgressiveResultGroups({ checkResult, system, allGroups }) {
    const group = allGroups[0];
    if (!group) return { groups: [], meta: { awardedResultIds: [], remaining: 0 } };

    // Crafting normalizes the budget with `Number(value || 0)` (divergence 4) and
    // skips invalid-cost results (divergence 1: `invalidCost: 'skip'`), zeroing the
    // budget after a `partial` tail award (divergence 2: `zeroRemainingOnPartial`).
    const { awarded, remaining } = resolveProgressiveAward({
      results: group.results || [],
      initialRemaining: Number(checkResult?.value || 0),
      costFor: (result) => this._getDifficulty(system, result?.componentId || result?.systemItemId),
      awardMode: system?.craftingCheck?.progressive?.awardMode || 'equal',
      invalidCost: 'skip',
      zeroRemainingOnPartial: true,
    });

    return {
      groups: [{ ...group, results: awarded }],
      meta: { awardedResultIds: awarded.map((r) => r.id), remaining },
    };
  }

  validateCheckResult({ recipe, checkResult }) {
    const mode = this.getMode(recipe);
    if (mode === 'routed') {
      const provider = this.getProvider(recipe);
      return (
        provider !== 'check' ||
        !!(checkResult?.outcome != null && String(checkResult.outcome).trim().length > 0)
      );
    }
    if (mode === 'progressive') {
      return Number.isFinite(Number(checkResult?.value));
    }
    return true;
  }

  _getDifficulty(system, componentId) {
    if (!componentId) return null;
    const managedItems = system?.components || [];
    const item = managedItems.find((entry) => entry.id === componentId);
    const difficulty = Number(item?.difficulty);
    return Number.isFinite(difficulty) ? difficulty : null;
  }
}
