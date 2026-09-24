import { evaluateCheckBreakageCondition } from '../toolBreakageRuntime.js';
import { findById, getDefinitionIndex } from '../utils/definitionIndex.js';
import { activityPermitsFailureResults } from '../utils/failureResultPolicy.js';
import { resolveProgressiveAward } from '../utils/progressiveAward.js';
import { applyPlayerResultOrder } from '../utils/progressiveResultOrder.js';
import { buildRecipeActivationIssue } from '../utils/recipeActivationMessages.js';
import {
  matchResultGroupsByName,
  normalizeRoutedName,
  isFailKeyword,
  isMissKeyword,
  isReservedRoutedName,
  routedOutcomeTierNames,
  routedSuccessTierOptions,
} from '../utils/routedOutcomeKeywords.js';

import { resolvedComponentsFor } from './scopedEntityReads.js';

/** The full progressive `meta` for an award of nothing (no authored group), never a short shape. */
function emptyProgressiveMeta() {
  return {
    awardedResultIds: [],
    remaining: 0,
    partialResultId: null,
    haltedResultId: null,
    skippedResultIds: [],
  };
}

/**
 * The active progressive check block's trigger ids: every id it owns, and the ones this roll
 * matched on condition alone, whatever the trigger's effects (issue 1286). A `when.checkTrigger`
 * names a trigger id, never a boolean, and a clause naming another activity's trigger is inert.
 * An `outcomeTier` condition never matches a progressive roll, whose outcome is `null`. Shared by
 * all three engines so none imports another.
 */
export function resolveCheckTriggerMatches(checkBreakage, checkResult) {
  const triggers = Array.isArray(checkBreakage?.triggers) ? checkBreakage.triggers : [];
  const checkTriggerIds = [];
  const matchedTriggerIds = [];
  for (const trigger of triggers) {
    const id = typeof trigger?.id === 'string' ? trigger.id.trim() : '';
    if (!id) continue;
    checkTriggerIds.push(id);
    if (evaluateCheckBreakageCondition(trigger?.condition, checkResult)) {
      matchedTriggerIds.push(id);
    }
  }
  return { matchedTriggerIds, checkTriggerIds };
}

/**
 * Mode-specific validation and result resolution for the canonical modes `simple`,
 * `routedByIngredients`, `routedByCheck`, `progressive` and `alchemy` (DOMAIN.md, one row per
 * mode). The routing basis is a property of the mode; `resultSelection.provider` is retired, and
 * legacy `mapped`/`tiered` are migration inputs only, with no branch here.
 */
export class ResolutionModeService {
  /** `getPlayerResultOrder` answers the executing user's stored progressive order for a recipe;
   *  its `() => null` default keeps the argument-free construction in `systemValidation.js`. */
  constructor(craftingSystemManager, { getPlayerResultOrder = () => null } = {}) {
    this.craftingSystemManager = craftingSystemManager;
    this.getPlayerResultOrder = getPlayerResultOrder;
  }

  getSystem(recipe) {
    if (!recipe?.craftingSystemId) return null;
    return this.craftingSystemManager?.getSystem(recipe.craftingSystemId) || null;
  }

  /** A check sub-object is usable only with a non-blank roll formula. */
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

  _normalizeName(name) {
    return normalizeRoutedName(name);
  }

  // Shared with Recipe.js through routedOutcomeKeywords.js, so runtime and validation agree.
  _isFailKeyword(name) {
    return isFailKeyword(name);
  }

  _isMissKeyword(name) {
    return isMissKeyword(name);
  }

  /** The authored name, else the 1-based position; never an id (issue 595). */
  _entityLabel(entity, index) {
    const name = typeof entity?.name === 'string' ? entity.name.trim() : '';
    return name || String(index + 1);
  }

  /** The authored name, else a name-free phrase; never an id (issue 611). */
  _salvageComponentLabel(component) {
    const name = typeof component?.name === 'string' ? component.name.trim() : '';
    return name || 'this component';
  }

  /** Reserved (fail/miss/hazard) and duplicate trim-normalized group names, as id-free issues. */
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
   * With `requireComplete: false`, completeness checks (set and group counts, ordered results)
   * are waived so an authoring shell can persist; reference-integrity checks always apply.
   */
  validateRecipe(recipe, { requireComplete = true } = {}) {
    // Issues carry a `code` and id-free params (issue 595); `errors` keeps the English messages.
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
        // One success group plus an optional reserved failure group, whose absence is valid.
        const successGroups = groups.filter((group) => group?.role !== 'failure');
        if (requireComplete && successGroups.length !== 1)
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

        // Whether the system has a usable routed check is surfaced by `systemValidation`.
        if (mode === 'routedByIngredients') {
          // Every set's resultGroupId names a real group; the message never echoes the id.
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
          // Check routing keys on the group name (spec 004 §routedByCheck Validation).
          this._validateRoutedGroupNames(groups, stepLabel, issues);
        }
      }

      if (mode === 'progressive') {
        // A system-level concern too (`progressiveNoCheck`), waived while drafting.
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
      // Exactly one ingredient set; group cardinality follows `alchemy.checkMode`.
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
        // Tiered validates like `routedByCheck`, labelled by recipe name or position 1; tier
        // assignment completeness is a system-level warning.
        if (requireComplete && groupsTop.length === 0)
          plain('Alchemy recipe must have at least 1 result group');
        this._validateRoutedGroupNames(groupsTop, this._entityLabel(recipe, 0), issues);
      } else {
        // One success group; the reserved failure group may be absent after a None→Simple flip.
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

    // Legacy salvage tokens are normalized before they reach here.
    const mode = system.salvageResolutionMode || 'simple';
    const componentLabel = this._salvageComponentLabel(component);

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

    if (mode === 'simple') {
      // Exactly one success group; a reserved failure group is tolerated (issue 764).
      const successGroups = groups.filter((group) => group?.role !== 'failure');
      if (successGroups.length !== 1) {
        errors.push(
          `Salvage for "${componentLabel}" must have exactly 1 result group in simple mode`
        );
      }
    }

    if (mode === 'routed') {
      if (groups.length === 0)
        errors.push(
          `Salvage for "${componentLabel}" must have at least 1 result group in routed mode`
        );

      // Routes by the routed check's tier names, the source the editor offers and runtime uses.
      const routed = system.salvageCraftingCheck?.routed;
      const tierNames = routedOutcomeTierNames(routed);
      const groupIds = new Set(groups.map((g) => g.id));
      const routing = component.salvage.outcomeRouting || {};

      // No tiers is a system-level issue (`salvageRoutedNoTiers`), not the component's.
      if (tierNames.length > 0) {
        // Every success tier must route to a real group; failure tiers may stay unrouted.
        for (const { name } of routedSuccessTierOptions(routed)) {
          const target = routing[name];
          if (!target || !groupIds.has(target)) {
            errors.push(
              `Outcome "${name}" must map to a valid salvage result group for "${componentLabel}"`
            );
          }
        }
        // No route may point at a deleted group, whichever tier it belongs to.
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
      // Report a result by 1-based position, never its id (issue 611).
      for (const [resultIndex, result] of results.entries()) {
        const difficulty = this._getDifficulty(system, result?.componentId || result?.systemItemId);
        if (!Number.isFinite(difficulty) || difficulty < 1) {
          errors.push(
            `Result ${resultIndex + 1} references component without valid difficulty for salvage on "${componentLabel}"`
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
   * The routed-check tier an outcome name resolves to. A `success: false` tier resolves only
   * when `failureResultPolicy` permits results on failure (issue 1098), and the returned
   * `success` flag keeps a failing tier from ever routing as `disposition: 'success'`.
   */
  _resolveRoutedTierId(system, outcome) {
    const routed = system?.craftingCheck?.routed;
    if (!routed || outcome == null) return null;
    const tiers = routed.type === 'fixed' ? routed.fixedOutcomes : routed.relativeOutcomes;
    if (!Array.isArray(tiers)) return null;
    const normalized = this._normalizeName(outcome);
    const permitsFailure = activityPermitsFailureResults(system, 'crafting');
    const tier = tiers.find(
      (entry) =>
        (entry?.success === true || permitsFailure) &&
        this._normalizeName(entry?.name) === normalized
    );
    if (!tier?.id) return null;
    return { tierId: tier.id, success: tier.success === true };
  }

  /** The step's result groups when it authors any, else the recipe's. */
  _allResultGroups({ recipe, step }) {
    if (Array.isArray(step?.resultGroups) && step.resultGroups.length > 0) {
      return step.resultGroups;
    }
    return Array.isArray(recipe?.resultGroups) ? recipe.resultGroups : [];
  }

  resolveResultGroups({ recipe, step, ingredientSet, checkResult, selectedResultGroupId = null }) {
    const system = this.getSystem(recipe);
    const mode = this.getMode(recipe);
    const allGroups = this._allResultGroups({ recipe, step });

    if (mode === 'simple') {
      return this._resolveSimpleResultGroups({ checkResult, allGroups, system });
    }
    if (mode === 'routedByIngredients') {
      return this._routeByIngredientSet(ingredientSet, allGroups, selectedResultGroupId);
    }
    if (mode === 'routedByCheck') {
      return this._resolveRoutedByCheckResultGroups({ checkResult, system, allGroups });
    }
    if (mode === 'progressive') {
      return this._resolveProgressiveResultGroups({ recipe, checkResult, system, allGroups });
    }
    if (mode === 'alchemy') {
      return this._resolveAlchemyResultGroups({ recipe, checkResult, allGroups });
    }

    return {
      groups: [],
      meta: { error: 'Unknown resolution mode', disposition: 'error' },
    };
  }

  /** Name routing: fail keyword, miss keyword, exact name, else misconfiguration. */
  _routeByOutcomeName(outcome, allGroups) {
    const normalized = this._normalizeName(outcome);
    if (this._isFailKeyword(normalized))
      return { groups: [], meta: { outcome, disposition: 'fail' } };
    if (this._isMissKeyword(normalized))
      return { groups: [], meta: { outcome, disposition: 'miss' } };
    // Crafting routes an outcome to a single group.
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

  /** Route by the set's `resultGroupId` or the explicit override, then the legacy
   *  `resultMapping`, then the first group. */
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

  /** Tier assignment first, then the single-group exemption, then name routing. */
  _resolveRoutedByCheckResultGroups({ checkResult, system, allGroups }) {
    const outcome = checkResult?.outcome == null ? null : String(checkResult.outcome);
    const assigned = this._routeByTierAssignment(system, outcome, allGroups);
    // A resolved but unassigned tier is its own misconfiguration, never masked by name routing.
    if (assigned?.meta?.disposition === 'unrouted-tier') return assigned;
    if (assigned) return assigned;
    // One group needs no mapping: any non-failure outcome produces it, never misconfigured.
    if (allGroups.length === 1) {
      const normalized = this._normalizeName(outcome);
      if (this._isFailKeyword(normalized))
        return { groups: [], meta: { outcome, disposition: 'fail' } };
      if (this._isMissKeyword(normalized))
        return { groups: [], meta: { outcome, disposition: 'miss' } };
      return { groups: allGroups.slice(0, 1), meta: { outcome, disposition: 'success' } };
    }
    return this._routeByOutcomeName(outcome, allGroups);
  }

  /**
   * `null` when no tier resolves or no group declares `checkOutcomeIds` (name routing follows);
   * `unrouted-tier` when a tier-routed recipe leaves this tier unassigned; else the assigned
   * group, with `disposition` `success`, or `failure` for a failure tier the policy permits.
   */
  _routeByTierAssignment(system, outcome, allGroups) {
    const resolved = this._resolveRoutedTierId(system, outcome);
    if (!resolved) return null;
    const { tierId, success } = resolved;
    const assigned = allGroups.filter(
      (group) => Array.isArray(group.checkOutcomeIds) && group.checkOutcomeIds.includes(tierId)
    );
    if (assigned.length > 0) {
      return {
        groups: assigned.slice(0, 1),
        meta: { outcome, disposition: success ? 'success' : 'failure' },
      };
    }
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
   * A failed check yields the reserved `role: 'failure'` group when present, else nothing; no
   * check or a pass yields the single success group. Under `failureResultPolicy: 'never'` the
   * failure group is never looked up and the disposition is still `'fail'` (issue 1098).
   */
  _resolveSimpleResultGroups({ checkResult, allGroups, system }) {
    if (checkResult?.success === false) {
      if (!activityPermitsFailureResults(system, 'crafting')) {
        return { groups: [], meta: { disposition: 'fail' } };
      }
      const failureGroup = allGroups.find((group) => group?.role === 'failure');
      return { groups: failureGroup ? [failureGroup] : [], meta: { disposition: 'fail' } };
    }
    const successGroups = allGroups.filter((group) => group?.role !== 'failure');
    return { groups: successGroups.slice(0, 1), meta: {} };
  }

  /**
   * Alchemy dispatches on `alchemy.checkMode`: `tiered` routes like `routedByCheck`; a failed
   * `simple` check yields the reserved failure group when present and permitted, else nothing;
   * otherwise the single success group, including for a listing's `checkResult: null`.
   */
  _resolveAlchemyResultGroups({ recipe, checkResult, allGroups }) {
    const system = this.getSystem(recipe);
    const checkMode = system?.alchemy?.checkMode || 'none';
    if (checkMode === 'tiered') {
      return this._resolveRoutedByCheckResultGroups({ checkResult, system, allGroups });
    }
    if (checkMode === 'simple' && checkResult?.success === false) {
      // Policy-gated as in `_resolveSimpleResultGroups` (issue 1098).
      if (!activityPermitsFailureResults(system, 'crafting')) {
        return { groups: [], meta: { disposition: 'fail' } };
      }
      const failureGroup = allGroups.find((group) => group?.role === 'failure');
      return {
        groups: failureGroup ? [failureGroup] : [],
        meta: { disposition: 'fail' },
      };
    }
    const successGroups = allGroups.filter((group) => group?.role !== 'failure');
    return { groups: successGroups.slice(0, 1), meta: {} };
  }

  /**
   * The ordered stage occurrences a progressive award spends down, one per occurrence in fire
   * order (issue 1286), through the same `_orderProgressiveResults` the award uses so the two
   * cannot disagree. Pure. Published because `meta` cannot say which stages were `unreached`.
   * Empty for a non-progressive mode or a recipe authoring no group.
   */
  progressiveStageOccurrences({ recipe, step = null } = {}) {
    if (this.getMode(recipe) !== 'progressive') return [];
    const system = this.getSystem(recipe);
    const allGroups = this._allResultGroups({ recipe, step });
    const group = allGroups[0];
    if (!group) return [];
    const index = getDefinitionIndex(resolvedComponentsFor(system));
    return this._orderProgressiveResults(recipe, group.results || []).map((result) => {
      const componentId = result?.componentId || result?.systemItemId || null;
      return {
        resultId: result?.id ?? null,
        componentId,
        component: componentId ? (findById(index, componentId) ?? null) : null,
      };
    });
  }

  /**
   * The one definition of progressive order: the executing user's stored order, unless the
   * recipe sets `allowPlayerResultReorder: false`. One flat id list covers every step, which
   * assumes result ids are unique across steps (issue 651 D6). Returns the input `===` when
   * nothing moved, which threshold recomputation relies on.
   */
  _orderProgressiveResults(recipe, authored) {
    if (recipe?.allowPlayerResultReorder === false) return authored;
    return applyPlayerResultOrder(
      authored,
      this.getPlayerResultOrder({ scope: 'recipe', id: recipe?.id })
    );
  }

  /**
   * Spend the check `value` down the ordered difficulties by `awardMode`; order is applied here,
   * never in `resolveProgressiveAward` (issue 651 D0). Pure and never a complication firing site:
   * it runs up to three times per craft, the first before consumption (issue 1286). `meta`'s five
   * facts derive the buckets: `full` is `awardedResultIds` minus `partialResultId`, `halted` the
   * stage that stopped the loop, `skipped` every invalid cost, and the rest `unreached`.
   */
  _resolveProgressiveResultGroups({ recipe, checkResult, system, allGroups }) {
    const group = allGroups[0];
    if (!group) return { groups: [], meta: emptyProgressiveMeta() };

    const results = this._orderProgressiveResults(recipe, group.results || []);

    // Crafting's divergences: `Number(value || 0)`, skip invalid costs, zero after a partial.
    const { awarded, remaining, partialResult, haltedResult, skippedResults } =
      resolveProgressiveAward({
        results,
        initialRemaining: Number(checkResult?.value || 0),
        costFor: (result) =>
          this._getDifficulty(system, result?.componentId || result?.systemItemId),
        awardMode: system?.craftingCheck?.progressive?.awardMode || 'equal',
        invalidCost: 'skip',
        zeroRemainingOnPartial: true,
      });

    // Each awarded entry is one item: `quantity: 1` and no `quantityFormula`, so a rolled amount
    // never applies here, even to a legacy `quantity > 1` (issue 1645).
    return {
      groups: [
        {
          ...group,
          results: awarded.map((result) => ({ ...result, quantity: 1, quantityFormula: null })),
        },
      ],
      // Taken from the loop's own report, never re-derived: a skipped stage hides the break index.
      meta: {
        awardedResultIds: awarded.map((r) => r.id),
        remaining,
        partialResultId: partialResult?.id ?? null,
        haltedResultId: haltedResult?.id ?? null,
        skippedResultIds: skippedResults.map((r) => r.id),
      },
    };
  }

  validateCheckResult({ recipe, checkResult }) {
    const mode = this.getMode(recipe);
    if (mode === 'routedByCheck') {
      // Check routing needs a non-empty outcome; `routedByIngredients` never does.
      return !!(checkResult?.outcome != null && String(checkResult.outcome).trim().length > 0);
    }
    if (mode === 'alchemy') {
      // Tiered alchemy needs an outcome as `routedByCheck` does; None and Simple pass.
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

  /** Public seam so `CraftingListingBuilder`'s thresholds spend exactly the engine's costs. */
  getDifficulty(system, componentId) {
    return this._getDifficulty(system, componentId);
  }

  _getDifficulty(system, componentId) {
    if (!componentId) return null;
    const item = findById(getDefinitionIndex(resolvedComponentsFor(system)), componentId);
    const difficulty = Number(item?.difficulty);
    return Number.isFinite(difficulty) ? difficulty : null;
  }
}
