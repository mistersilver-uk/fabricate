import {
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
 *  - `macroOutcome` / `rollTableOutcome` — legacy check-driven providers (route
 *    by macro outcome / roll-table draw) pending removal in favour of `check`
 *    (tracked in #424); still accepted and resolved like `check` until they are
 *    migrated away.
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
  // (ingredientSet / macroOutcome / rollTableOutcome), not just rollTableOutcome.
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

  // ---------------------------------------------------------------------------
  // rollTableOutcome resolution
  // ---------------------------------------------------------------------------

  /**
   * @deprecated `rollTableOutcome` is a legacy routed provider slated for removal
   *   in favour of `check` (system crafting-check outcome). Retained only until a
   *   migration moves existing recipes off it. Removal is tracked in #424.
   */
  async resolveByRollTable(recipe, step, allGroups) {
    const selection = this.getResultSelection(recipe, step);
    const tableUuid = selection?.rollTableUuid;
    if (!tableUuid) {
      return { groups: [], meta: { error: 'No roll table UUID configured' } };
    }

    const table = await fromUuid(tableUuid);
    if (!table || typeof table.draw !== 'function') {
      return { groups: [], meta: { error: `Roll table not found: ${tableUuid}` } };
    }

    let drawResult;
    try {
      drawResult = await table.draw({ displayChat: false });
    } catch (error) {
      return { groups: [], meta: { error: `Roll table draw failed: ${error.message}` } };
    }

    const results = drawResult?.results || [];
    if (results.length === 0) {
      return { groups: [], meta: { error: 'Roll table draw returned no results' } };
    }

    const drawnName = results[0]?.text || results[0]?.name || '';
    const normalized = this._normalizeName(drawnName);

    if (this._isFailKeyword(normalized)) {
      return {
        groups: [],
        meta: { drawnName, normalized, disposition: 'fail' },
      };
    }

    if (this._isMissKeyword(normalized)) {
      return {
        groups: [],
        meta: { drawnName, normalized, disposition: 'miss' },
      };
    }

    const matched = (allGroups || []).filter((g) => this._normalizeName(g.name) === normalized);
    if (matched.length === 0) {
      return {
        groups: [],
        meta: {
          drawnName,
          normalized,
          disposition: 'misconfiguration',
          error: `No result group matches drawn name "${drawnName}"`,
        },
      };
    }

    return {
      groups: matched.slice(0, 1),
      meta: { drawnName, normalized, disposition: 'success', matchedGroupId: matched[0].id },
    };
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
        } else if (
          !['ingredientSet', 'check', 'macroOutcome', 'rollTableOutcome'].includes(provider)
        ) {
          errors.push('Invalid result selection provider: ' + provider);
        }
        const selection = this.getResultSelection(recipe, step);
        // @deprecated rollTableOutcome / macroOutcome — legacy check-driven
        // providers superseded by `check`; these branches go away once a
        // migration moves existing recipes onto `check` (tracked in #424).
        if (provider === 'rollTableOutcome' && !selection?.rollTableUuid) {
          errors.push('rollTableOutcome provider requires a roll table UUID');
        }
        if (provider === 'macroOutcome' && !checkEnabled) {
          errors.push('macroOutcome provider requires crafting checks enabled');
        }
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
        // (spec 004 §Validation lines 79-80), not just rollTableOutcome.
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
      } else if (!['ingredientSet', 'macroOutcome', 'rollTableOutcome'].includes(provider)) {
        errors.push('Invalid result selection provider: ' + provider);
      }
      if (provider === 'rollTableOutcome' && !recipe?.resultSelection?.rollTableUuid) {
        errors.push('rollTableOutcome provider requires a roll table UUID');
      }
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

  resolveResultGroups({
    recipe,
    step,
    ingredientSet,
    checkResult,
    selectedResultGroupId = null,
    rollTableResult = null,
  }) {
    // If a rollTableResult was pre-resolved (for rollTableOutcome provider), use it directly
    if (rollTableResult) {
      return rollTableResult;
    }

    const system = this.getSystem(recipe);
    const mode = this.getMode(recipe);
    const allGroups =
      Array.isArray(step?.resultGroups) && step.resultGroups.length > 0
        ? step.resultGroups
        : Array.isArray(recipe?.resultGroups)
          ? recipe.resultGroups
          : [];

    if (mode === 'simple') {
      return {
        groups: allGroups.slice(0, 1),
        meta: {},
      };
    }

    if (mode === 'routed') {
      const outcome = checkResult?.outcome == null ? null : String(checkResult.outcome);
      const provider = this.getProviderForStep(recipe, step);
      if (provider === 'ingredientSet') {
        // Former `mapped` behavior: route by ingredientSet.resultGroupId, with the
        // legacy resultMapping fallback, then first-group fallback.
        const mappedId = ingredientSet?.resultGroupId || selectedResultGroupId || null;
        if (mappedId)
          return { groups: allGroups.filter((group) => group.id === mappedId), meta: {} };
        if (Array.isArray(ingredientSet?.resultMapping) && ingredientSet.resultMapping.length > 0) {
          return {
            groups: allGroups.filter((group) => ingredientSet.resultMapping.includes(group.id)),
            meta: {},
          };
        }
        return { groups: allGroups.slice(0, 1), meta: {} };
      }
      // `check` is the canonical successor to `macroOutcome`: both route by the
      // crafting-check outcome name to the ResultGroup of that name.
      if (provider === 'macroOutcome' || provider === 'check') {
        const normalized = this._normalizeName(outcome);
        if (this._isFailKeyword(normalized))
          return { groups: [], meta: { outcome, disposition: 'fail' } };
        if (this._isMissKeyword(normalized))
          return { groups: [], meta: { outcome, disposition: 'miss' } };
        const matched = allGroups.filter((group) => this._normalizeName(group.name) === normalized);
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
        return { groups: matched.slice(0, 1), meta: { outcome, disposition: 'success' } };
      }
      return { groups: allGroups.slice(0, 1), meta: {} };
    }

    if (mode === 'progressive') {
      const group = allGroups[0];
      if (!group) return { groups: [], meta: { awardedResultIds: [], remaining: 0 } };

      const value = Number(checkResult?.value || 0);
      const awardMode = system?.craftingCheck?.progressive?.awardMode || 'equal';
      const awarded = [];
      let remaining = value;

      for (const result of group.results || []) {
        const cost = this._getDifficulty(system, result?.componentId || result?.systemItemId);
        if (!Number.isFinite(cost) || cost < 1) continue;

        if (awardMode === 'exceed') {
          if (remaining > cost) {
            awarded.push(result);
            remaining -= cost;
          } else {
            break;
          }
          continue;
        }

        if (awardMode === 'partial') {
          if (remaining >= cost) {
            awarded.push(result);
            remaining -= cost;
            continue;
          }
          if (remaining > 0) {
            awarded.push(result);
            remaining = 0;
          }
          break;
        }

        // equal
        if (remaining >= cost) {
          awarded.push(result);
          remaining -= cost;
        } else {
          break;
        }
      }

      return {
        groups: [
          {
            ...group,
            results: awarded,
          },
        ],
        meta: {
          awardedResultIds: awarded.map((r) => r.id),
          remaining,
        },
      };
    }

    if (mode === 'alchemy') {
      const provider = this.getProvider(recipe);
      if (provider === 'ingredientSet') {
        const mappedId = ingredientSet?.resultGroupId || null;
        if (mappedId) {
          return { groups: allGroups.filter((g) => g.id === mappedId), meta: {} };
        }
        return { groups: allGroups.slice(0, 1), meta: {} };
      }
      if (provider === 'macroOutcome') {
        const outcome = checkResult?.outcome == null ? null : String(checkResult.outcome);
        const normalized = this._normalizeName(outcome);
        if (this._isFailKeyword(normalized)) {
          return { groups: [], meta: { outcome, disposition: 'fail' } };
        }
        if (this._isMissKeyword(normalized)) {
          return { groups: [], meta: { outcome, disposition: 'miss' } };
        }
        const matched = allGroups.filter((g) => this._normalizeName(g.name) === normalized);
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
        return { groups: matched.slice(0, 1), meta: { outcome, disposition: 'success' } };
      }
      return { groups: allGroups.slice(0, 1), meta: {} };
    }

    return {
      groups: [],
      meta: {
        error: 'Unknown resolution mode',
        disposition: 'error',
      },
    };
  }

  validateCheckResult({ recipe, checkResult }) {
    const mode = this.getMode(recipe);
    if (mode === 'routed') {
      const provider = this.getProvider(recipe);
      return (
        !['macroOutcome', 'check'].includes(provider) ||
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
