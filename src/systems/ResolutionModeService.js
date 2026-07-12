import { resolveProgressiveAward } from '../utils/progressiveAward.js';
import {
  matchResultGroupsByName,
  normalizeRoutedName,
  isFailKeyword,
  isMissKeyword,
  isReservedRoutedName,
  routedOutcomeTierNames,
  routedSuccessTierOptions,
} from '../utils/routedOutcomeKeywords.js';

import { buildRecipeActivationIssue } from './recipeActivationMessages.js';

/**
 * Handles mode-specific validation and result resolution logic.
 *
 * Canonical crafting resolution modes are `simple`, `routedByIngredients`,
 * `routedByCheck`, `progressive`, and `alchemy`. The two routed modes are the
 * non-simple selection models, and the routing basis is a property of the MODE
 * (not a per-recipe `resultSelection.provider`):
 *  - `routedByIngredients` — the chosen ingredient set's `resultGroupId` selects
 *    the result group (the former `routed` + `ingredientSet` provider behavior).
 *    The crafting check is OPTIONAL (runs only when a routed roll formula is
 *    authored), matching `simple` mode.
 *  - `routedByCheck` — the system-level routed crafting-check outcome routes to a
 *    `ResultGroup` (by explicit tier assignment, then by name). The crafting
 *    check is REQUIRED.
 *
 * `resultSelection.provider` is fully RETIRED: alchemy now routes on the
 * SYSTEM-level `alchemy.checkMode` (`none` | `simple` | `tiered`) in
 * `_resolveAlchemyResultGroups`, and the routed crafting modes derive their basis
 * from the system mode. No live mode reads `resultSelection`.
 *
 * Legacy `mapped`/`tiered` are NOT live modes. They are accepted only as
 * one-time inputs to the 1.4.0 migration (`migrateLegacyResolutionModes`), and
 * the manager's token normalizer maps any un-migrated/imported `mapped`/`tiered`
 * token to `routedByIngredients`/`routedByCheck` respectively. No `mapped`/`tiered`
 * resolution branch survives here.
 */
export class ResolutionModeService {
  constructor(craftingSystemManager) {
    this.craftingSystemManager = craftingSystemManager;
  }

  getSystem(recipe) {
    if (!recipe?.craftingSystemId) return null;
    return this.craftingSystemManager?.getSystem(recipe.craftingSystemId) || null;
  }

  /**
   * A check sub-object (simple/routed/progressive) is "usable" only when it carries
   * an authored, non-empty roll formula. This is the single notion of an enabled
   * check now that the legacy macro/builtIn check sources are gone.
   * @private
   */
  _hasRollFormula(check) {
    return typeof check?.rollFormula === 'string' && check.rollFormula.trim().length > 0;
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
  // validation use one source of truth. They apply to `routedByCheck` mode and
  // alchemy `tiered` check mode (both key on the crafting-check outcome).
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
   * A human-readable label for a step / ingredient set / result — the author-given
   * `name` when present, otherwise a 1-based POSITION (issue 595). NEVER the entity's
   * internal id, so a validation message for an unnamed entity cannot leak one.
   * @param {{name?: string}} entity
   * @param {number} index 0-based index of the entity in its collection
   * @returns {string}
   * @private
   */
  _entityLabel(entity, index) {
    const name = typeof entity?.name === 'string' ? entity.name.trim() : '';
    return name || String(index + 1);
  }

  /**
   * Reserved/duplicate routed `ResultGroup.name` validation, applied under
   * `routedByCheck` mode (check routing keys on the group name). Reserved names
   * (fail/miss/hazard families) may not name a result group; names must be unique
   * under trim-normalized comparison. Pushes coded, id-free issues (issue 595); the
   * caller supplies a pre-computed, name-or-position `stepLabel` (never an id).
   * @param {Array<{id?: string, name?: string}>} groups
   * @param {string} stepLabel human-readable step label (name or 1-based position)
   * @param {Array<{code: string|null, params: object, message: string}>} issues
   */
  _validateRoutedGroupNames(groups, stepLabel, issues) {
    const seenNames = new Set();
    for (const group of groups || []) {
      const normalized = normalizeRoutedName(group?.name);
      if (!normalized) continue;
      if (isReservedRoutedName(normalized)) {
        issues.push(
          buildRecipeActivationIssue('routedGroupNameReserved', {
            groupName: group.name,
            step: stepLabel,
          })
        );
      }
      if (seenNames.has(normalized)) {
        issues.push(
          buildRecipeActivationIssue('routedGroupNameDuplicate', {
            groupName: group.name,
            step: stepLabel,
          })
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
   *   not-yet-chosen alchemy `resultSelection.provider`) are waived so an
   *   incomplete authoring shell can persist. Mode REFERENCE-INTEGRITY checks
   *   (an invalid alchemy provider VALUE, an invalid `routedByIngredients`
   *   resultGroupId, reserved/duplicate `routedByCheck` `ResultGroup.name`) always
   *   apply. Legacy `mapped` and `tiered` are not live modes — they are accepted
   *   only as one-time migration inputs (see `migrateLegacyResolutionModes`) and
   *   the manager's token normalizer maps un-migrated tokens to
   *   `routedByIngredients`/`routedByCheck`.
   * @returns {{valid: boolean, errors: string[]}}
   */
  validateRecipe(recipe, { requireComplete = true } = {}) {
    // Issues carry a stable `code` + human-readable params (step/set/result label:
    // name-or-1-based-position, never an id) so the UI can localize the failure
    // id-free (issue 595); `errors` is derived from their headless English messages,
    // preserving the pre-fix wording for NAMED entities byte-for-byte.
    const issues = [];
    const plain = (message) => {
      issues.push({ code: null, params: {}, message });
    };
    const system = this.getSystem(recipe);
    if (!system) return { valid: true, errors: [], issues };

    const mode = this.getMode(recipe);
    const steps = this.getExecutionSteps(recipe);

    for (const [stepIndex, step] of steps.entries()) {
      const stepLabel = this._entityLabel(step, stepIndex);
      const sets = Array.isArray(step?.ingredientSets) ? step.ingredientSets : [];
      const groups = Array.isArray(step?.resultGroups) ? step.resultGroups : [];

      if (mode === 'simple') {
        if (requireComplete && sets.length !== 1)
          issues.push(
            buildRecipeActivationIssue('stepIngredientSetCountExact', { step: stepLabel, mode })
          );
        if (requireComplete && groups.length !== 1)
          issues.push(
            buildRecipeActivationIssue('stepResultGroupCountExact', { step: stepLabel, mode })
          );
      }

      if (mode === 'routedByIngredients' || mode === 'routedByCheck') {
        if (requireComplete && sets.length === 0)
          issues.push(
            buildRecipeActivationIssue('stepIngredientSetCountMin', { step: stepLabel, mode })
          );
        if (requireComplete && groups.length === 0)
          issues.push(
            buildRecipeActivationIssue('stepResultGroupCountMin', { step: stepLabel, mode })
          );

        // The routing basis is the MODE (no per-recipe provider). A
        // `routedByCheck` recipe is structurally valid regardless of the system's
        // check configuration — whether the system has a usable routed crafting
        // check (`routed.rollFormula`) is a SYSTEM-level concern surfaced by
        // `systemValidation`, not a per-recipe validation error.
        if (mode === 'routedByIngredients') {
          // Reference integrity: an ingredient set's resultGroupId must point at a
          // real group in the step (the former `mapped` invariant, now canonical).
          // The message reports the set by name-or-position and never echoes the
          // missing group id (issue 595).
          const groupIds = new Set(groups.map((g) => g.id));
          for (const [setIndex, set] of sets.entries()) {
            const mappedId = set?.resultGroupId || null;
            if (mappedId && !groupIds.has(mappedId)) {
              issues.push(
                buildRecipeActivationIssue('ingredientSetInvalidResultGroup', {
                  set: this._entityLabel(set, setIndex),
                })
              );
            }
          }
        } else {
          // Reserved/duplicate ResultGroup.name applies under check routing, which
          // keys on the group name (spec 004 §routedByCheck Validation).
          this._validateRoutedGroupNames(groups, stepLabel, issues);
        }
      }

      if (mode === 'progressive') {
        // A progressive crafting check is usable only when an authored progressive
        // roll formula exists. This is a SYSTEM-level concern also surfaced by
        // systemValidation (`progressiveNoCheck`); waive it while drafting so an
        // authoring shell can be created, and enforce it only when a complete recipe
        // is required (persistence-complete / activation).
        if (requireComplete && !this._hasRollFormula(system?.craftingCheck?.progressive)) {
          plain('Progressive mode requires a configured progressive crafting check (roll formula)');
        }
        if (requireComplete && sets.length !== 1)
          issues.push(
            buildRecipeActivationIssue('stepIngredientSetCountExact', { step: stepLabel, mode })
          );
        if (requireComplete && groups.length !== 1)
          issues.push(
            buildRecipeActivationIssue('stepResultGroupCountExact', { step: stepLabel, mode })
          );

        const results = groups?.[0]?.results || [];
        if (requireComplete && results.length === 0) {
          issues.push(
            buildRecipeActivationIssue('stepRequiresOrderedResults', { step: stepLabel })
          );
        }
        for (const [resultIndex, result] of results.entries()) {
          const difficulty = this._getDifficulty(
            system,
            result?.componentId || result?.systemItemId
          );
          if (!Number.isFinite(difficulty) || difficulty < 1) {
            issues.push(
              buildRecipeActivationIssue('stepResultDifficulty', { result: resultIndex + 1 })
            );
          }
        }
      }
    }

    if (mode === 'alchemy') {
      // Alchemy recipes always have EXACTLY one ingredient set and are never routed
      // by ingredients. Result-group cardinality is per `alchemy.checkMode`; the
      // retired per-recipe `resultSelection.provider` is no longer validated.
      const setsTop = Array.isArray(recipe.ingredientSets) ? recipe.ingredientSets : [];
      const groupsTop = Array.isArray(recipe.resultGroups) ? recipe.resultGroups : [];
      if (requireComplete && setsTop.length === 0)
        plain('Alchemy recipe must have at least 1 ingredient set');
      if (requireComplete && setsTop.length > 1)
        plain('Alchemy recipe must have exactly 1 ingredient set');
      // No explicit steps allowed
      const explicitSteps =
        typeof recipe.getExecutionSteps === 'function' ? recipe.getExecutionSteps() : [];
      const hasExplicitSteps =
        explicitSteps.length > 1 ||
        (explicitSteps.length === 1 && explicitSteps[0]?.id !== 'implicit-step');
      if (hasExplicitSteps) plain('Alchemy recipe must not have explicit steps');

      const checkMode = system?.alchemy?.checkMode || 'none';
      if (checkMode === 'tiered') {
        // Tiered routes exactly like `routedByCheck`: at least one result group with
        // reserved/duplicate group-name protection (name-uniqueness moved here from
        // the model for Tiered only). Tier-assignment completeness is a system-level
        // warning surfaced by `systemValidation`, not a per-recipe blocker. The
        // routed-name check is scoped to the recipe (an implicit single step), so its
        // step label is the recipe name or position 1 — never the recipe id.
        if (requireComplete && groupsTop.length === 0)
          plain('Alchemy recipe must have at least 1 result group');
        this._validateRoutedGroupNames(groupsTop, this._entityLabel(recipe, 0), issues);
      } else {
        // None / Simple: exactly one SUCCESS group. Simple additionally carries a
        // reserved `role: 'failure'` group, but its ABSENCE is TOLERATED (a
        // settings-only None→Simple flip runs no recipe migration).
        const successGroups = groupsTop.filter((group) => group?.role !== 'failure');
        if (requireComplete && successGroups.length === 0)
          plain('Alchemy recipe must have at least 1 result group');
        if (requireComplete && successGroups.length > 1)
          plain('Alchemy recipe must have exactly 1 result group');
      }
    }

    return {
      valid: issues.length === 0,
      errors: issues.map((issue) => issue.message),
      issues,
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
      if (groups.length === 0)
        errors.push(
          `Salvage for "${componentLabel}" must have at least 1 result group in routed mode`
        );

      // Routing keys on the routed check's outcome-tier NAMES — the SAME source the
      // authoring UI offers and the runtime routes by (CraftingEngine
      // `_runSalvageRoutedCheck` → `_resolveSalvageResultGroups`). Reading the legacy
      // flat `salvageCraftingCheck.outcomes` list here (which always defaulted to
      // `['fail','pass']`) demanded routes the editor never surfaced, leaving routed
      // salvage permanently invalid with no UI fix.
      const routed = system.salvageCraftingCheck?.routed;
      const tierNames = routedOutcomeTierNames(routed);
      const groupIds = new Set(groups.map((g) => g.id));
      const routing = component.salvage.outcomeRouting || {};

      // When the salvage check defines NO outcome tiers, routing is impossible and
      // there is nothing the component author can fix — that gap is reported once at
      // the system level (`salvageRoutedNoTiers`), so the component is not faulted.
      if (tierNames.length > 0) {
        // Every SUCCESS tier must route to a real result group: a passed salvage
        // check must yield something. Failure tiers may stay unrouted (the runtime
        // yields nothing for an unrouted outcome), so they are not required here.
        for (const { name } of routedSuccessTierOptions(routed)) {
          const target = routing[name];
          if (!target || !groupIds.has(target)) {
            errors.push(
              `Outcome "${name}" must map to a valid salvage result group for "${componentLabel}"`
            );
          }
        }
        // No dangling routes: an authored route pointing at a now-deleted group is a
        // misconfiguration regardless of which tier it belongs to.
        for (const [name, target] of Object.entries(routing)) {
          if (target && !groupIds.has(target)) {
            errors.push(
              `Salvage routing for "${name}" references a missing result group for "${componentLabel}"`
            );
          }
        }
      }
    }

    if (mode === 'progressive') {
      if (!this._hasRollFormula(system.salvageCraftingCheck?.progressive)) {
        errors.push(
          'Progressive salvage mode requires a configured progressive salvage check (roll formula)'
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
    if (mode === 'routedByIngredients') {
      return this._routeByIngredientSet(ingredientSet, allGroups, selectedResultGroupId);
    }
    if (mode === 'routedByCheck') {
      return this._resolveRoutedByCheckResultGroups({ checkResult, system, allGroups });
    }
    if (mode === 'progressive') {
      return this._resolveProgressiveResultGroups({ checkResult, system, allGroups });
    }
    if (mode === 'alchemy') {
      return this._resolveAlchemyResultGroups({ recipe, checkResult, allGroups });
    }

    return {
      groups: [],
      meta: { error: 'Unknown resolution mode', disposition: 'error' },
    };
  }

  /**
   * Route a normalized check `outcome` to a result group by NAME, used by
   * `routedByCheck` mode (and, via `_resolveRoutedByCheckResultGroups`, by alchemy
   * `tiered` mode — both key on the crafting-check outcome).
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
   * fallback. Shared by `routedByIngredients` mode and the alchemy `ingredientSet`
   * provider.
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
   * `routedByCheck` mode resolution: route the routed crafting-check outcome to a
   * result group by explicit tier→result-set assignment first, then (for a single
   * result group) the no-mapping-required exemption, then by outcome name.
   * @returns {{groups: Array, meta: object}}
   */
  _resolveRoutedByCheckResultGroups({ checkResult, system, allGroups }) {
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
    // Single-result-group exemption (mirrors routedByIngredients' "one result group
    // → mapping may be omitted"): with exactly one group in scope, no outcome/tier
    // mapping is required. A non-failure outcome produces the single group; a
    // fail/miss keyword yields nothing (failure path). Never a misconfiguration.
    if (allGroups.length === 1) {
      const normalized = this._normalizeName(outcome);
      if (this._isFailKeyword(normalized))
        return { groups: [], meta: { outcome, disposition: 'fail' } };
      if (this._isMissKeyword(normalized))
        return { groups: [], meta: { outcome, disposition: 'miss' } };
      return { groups: allGroups.slice(0, 1), meta: { outcome, disposition: 'success' } };
    }
    // Multiple result groups: fall back to fail/miss keywords, then match the
    // outcome name to a result group of that name. An unmatched success outcome is
    // a misconfiguration the author must fix by mapping each outcome to a group.
    return this._routeByOutcomeName(outcome, allGroups);
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
   * Alchemy mode resolution, dispatched on the SYSTEM-level `alchemy.checkMode`
   * (the retired per-recipe `resultSelection.provider` is gone):
   *  - `none` / `simple`-PASS → the single success group (the first group whose
   *    `role` is not `'failure'`);
   *  - `simple`-FAIL → the reserved `role: 'failure'` group when present, else
   *    NOTHING (a settings-only None→Simple flip runs no recipe migration, so the
   *    failure group may be absent — produce nothing, never crash);
   *  - `tiered` → identical to `routedByCheck`: route the routed-check outcome to a
   *    result group via tier assignment (`checkOutcomeIds`).
   *
   * A simple check FAILURE is signalled by `checkResult.success === false`; the
   * success path (and every listing-builder projection, which passes
   * `checkResult: null`) resolves to the success group.
   * @returns {{groups: Array, meta: object}}
   */
  _resolveAlchemyResultGroups({ recipe, checkResult, allGroups }) {
    const system = this.getSystem(recipe);
    const checkMode = system?.alchemy?.checkMode || 'none';
    if (checkMode === 'tiered') {
      return this._resolveRoutedByCheckResultGroups({ checkResult, system, allGroups });
    }
    if (checkMode === 'simple' && checkResult?.success === false) {
      const failureGroup = allGroups.find((group) => group?.role === 'failure');
      return {
        groups: failureGroup ? [failureGroup] : [],
        meta: { disposition: 'fail' },
      };
    }
    // None, or a passed Simple check: the single success group (never the reserved
    // failure group).
    const successGroups = allGroups.filter((group) => group?.role !== 'failure');
    return { groups: successGroups.slice(0, 1), meta: {} };
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

    // Progressive results are a quantity-less ordered list: each entry is awarded
    // once and the GM expresses "more of X" by listing X again. Force `quantity: 1`
    // so the grant path (CraftingEngine._createResultItem reads `result.quantity`)
    // produces one item per awarded entry, even for legacy recipes still carrying a
    // `quantity > 1` authored before the editor dropped the field.
    return {
      groups: [{ ...group, results: awarded.map((result) => ({ ...result, quantity: 1 })) }],
      meta: { awardedResultIds: awarded.map((r) => r.id), remaining },
    };
  }

  validateCheckResult({ recipe, checkResult }) {
    const mode = this.getMode(recipe);
    if (mode === 'routedByCheck') {
      // Check routing is required: it needs a non-empty outcome to route by.
      // `routedByIngredients` routes by the chosen ingredient set, so it never
      // requires a check outcome.
      return !!(checkResult?.outcome != null && String(checkResult.outcome).trim().length > 0);
    }
    if (mode === 'alchemy') {
      // Tiered alchemy routes exactly like `routedByCheck` (it needs a non-empty
      // outcome to route by); None/Simple never route by outcome, so they pass.
      const system = this.getSystem(recipe);
      if (system?.alchemy?.checkMode === 'tiered') {
        return !!(checkResult?.outcome != null && String(checkResult.outcome).trim().length > 0);
      }
      return true;
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
