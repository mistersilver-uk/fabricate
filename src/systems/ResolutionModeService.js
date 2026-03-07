/**
 * Handles mode-specific validation and result resolution logic.
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

  getExecutionSteps(recipe) {
    return typeof recipe?.getExecutionSteps === 'function'
      ? recipe.getExecutionSteps()
      : [];
  }

  validateRecipe(recipe) {
    const errors = [];
    const system = this.getSystem(recipe);
    if (!system) return { valid: true, errors };

    const mode = this.getMode(recipe);
    const steps = this.getExecutionSteps(recipe);
    const checkEnabled = system?.craftingCheck?.enabled === true || !!system?.craftingCheck?.macroUuid || system?.craftingCheck?.checkSource === 'builtIn';
    const outcomes = Array.isArray(system?.craftingCheck?.outcomes) ? system.craftingCheck.outcomes : [];

    for (const step of steps) {
      const sets = Array.isArray(step?.ingredientSets) ? step.ingredientSets : [];
      const groups = Array.isArray(step?.resultGroups) ? step.resultGroups : [];

      if (mode === 'simple') {
        if (sets.length !== 1) errors.push(`Step "${step.name || step.id}" must have exactly 1 ingredient set in simple mode`);
        if (groups.length !== 1) errors.push(`Step "${step.name || step.id}" must have exactly 1 result group in simple mode`);
      }

      if (mode === 'mapped') {
        if (sets.length < 1) errors.push(`Step "${step.name || step.id}" must have at least 1 ingredient set in mapped mode`);
        if (groups.length < 1) errors.push(`Step "${step.name || step.id}" must have at least 1 result group in mapped mode`);
        const groupIds = new Set(groups.map(g => g.id));
        for (const set of sets) {
          const mappedId = set?.resultGroupId || null;
          if (mappedId && !groupIds.has(mappedId)) {
            errors.push(`Ingredient set "${set.name || set.id}" has invalid resultGroupId "${mappedId}"`);
          }
        }
      }

      if (mode === 'tiered') {
        if (!checkEnabled) errors.push('Tiered mode requires crafting checks enabled');
        if (outcomes.length === 0) errors.push('Tiered mode requires at least one declared outcome');
        if (sets.length < 1) errors.push(`Step "${step.name || step.id}" must have at least 1 ingredient set in tiered mode`);
        if (groups.length < 1) errors.push(`Step "${step.name || step.id}" must have at least 1 result group in tiered mode`);

        const groupIds = new Set(groups.map(g => g.id));
        const routing = step?.outcomeRouting || recipe?.outcomeRouting || {};
        for (const outcome of outcomes) {
          const target = routing?.[outcome];
          if (!target || !groupIds.has(target)) {
            errors.push(`Outcome "${outcome}" must map to a valid result group in step "${step.name || step.id}"`);
          }
        }
      }

      if (mode === 'progressive') {
        if (!checkEnabled) errors.push('Progressive mode requires crafting checks enabled');
        if (!system?.craftingCheck?.progressive) {
          errors.push('Progressive mode requires craftingCheck.progressive configuration');
        }
        if (sets.length !== 1) errors.push(`Step "${step.name || step.id}" must have exactly 1 ingredient set in progressive mode`);
        if (groups.length !== 1) errors.push(`Step "${step.name || step.id}" must have exactly 1 result group in progressive mode`);

        const results = groups?.[0]?.results || [];
        if (results.length === 0) {
          errors.push(`Step "${step.name || step.id}" requires ordered results in progressive mode`);
        }
        for (const result of results) {
          const difficulty = this._getDifficulty(system, result?.componentId || result?.systemItemId);
          if (!Number.isFinite(difficulty) || difficulty < 1) {
            errors.push(`Result "${result?.id || 'unknown'}" references system item without valid difficulty`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  validateSalvage(component, system) {
    const errors = [];

    // Pre-checks: return early if there's nothing to validate
    if (!component?.salvage || !system) return { valid: true, errors };

    const mode = system.salvageResolutionMode || 'simple';
    const componentLabel = component.name || component.id || 'unknown';

    if (mode === 'mapped') {
      errors.push('Mapped mode is not supported for salvage');
      return { valid: false, errors };
    }

    const groups = Array.isArray(component.salvage.resultGroups) ? component.salvage.resultGroups : [];

    if (mode === 'simple') {
      if (groups.length !== 1) {
        errors.push(`Salvage for "${componentLabel}" must have exactly 1 result group in simple mode`);
      }
    }

    if (mode === 'tiered') {
      const checkEnabled = system.salvageCraftingCheck?.enabled === true || !!system.salvageCraftingCheck?.macroUuid;
      const outcomes = Array.isArray(system.salvageCraftingCheck?.outcomes) ? system.salvageCraftingCheck.outcomes : [];

      if (!checkEnabled) errors.push('Tiered salvage mode requires crafting checks enabled');
      if (outcomes.length === 0) errors.push('Tiered salvage mode requires at least one declared outcome');
      if (groups.length < 1) errors.push(`Salvage for "${componentLabel}" must have at least 1 result group in tiered mode`);

      const groupIds = new Set(groups.map(g => g.id));
      const routing = component.salvage.outcomeRouting || {};
      for (const outcome of outcomes) {
        const target = routing[outcome];
        if (!target || !groupIds.has(target)) {
          errors.push(`Outcome "${outcome}" must map to a valid salvage result group for "${componentLabel}"`);
        }
      }
    }

    if (mode === 'progressive') {
      const checkEnabled = system.salvageCraftingCheck?.enabled === true || !!system.salvageCraftingCheck?.macroUuid;

      if (!checkEnabled) errors.push('Progressive salvage mode requires crafting checks enabled');
      if (!system.salvageCraftingCheck?.progressive) {
        errors.push('Progressive salvage mode requires salvageCraftingCheck.progressive configuration');
      }
      if (groups.length !== 1) {
        errors.push(`Salvage for "${componentLabel}" must have exactly 1 result group in progressive mode`);
      }

      const results = groups?.[0]?.results || [];
      if (results.length === 0) {
        errors.push(`Salvage for "${componentLabel}" requires ordered results in progressive mode`);
      }
      for (const result of results) {
        const difficulty = this._getDifficulty(system, result?.componentId || result?.systemItemId);
        if (!Number.isFinite(difficulty) || difficulty < 1) {
          errors.push(`Result "${result?.id || 'unknown'}" references component without valid difficulty for salvage on "${componentLabel}"`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  resolveResultGroups({ recipe, step, ingredientSet, checkResult, selectedResultGroupId = null }) {
    const system = this.getSystem(recipe);
    const mode = this.getMode(recipe);
    const allGroups = Array.isArray(step?.resultGroups) && step.resultGroups.length > 0
      ? step.resultGroups
      : (Array.isArray(recipe?.resultGroups) ? recipe.resultGroups : []);

    if (mode === 'simple') {
      return {
        groups: allGroups.slice(0, 1),
        meta: {}
      };
    }

    if (mode === 'mapped') {
      const mappedId = ingredientSet?.resultGroupId || selectedResultGroupId || null;
      if (mappedId) {
        return {
          groups: allGroups.filter(group => group.id === mappedId),
          meta: {}
        };
      }

      // Legacy fallback to resultMapping support.
      if (Array.isArray(ingredientSet?.resultMapping) && ingredientSet.resultMapping.length > 0) {
        return {
          groups: allGroups.filter(group => ingredientSet.resultMapping.includes(group.id)),
          meta: {}
        };
      }

      return {
        groups: allGroups.slice(0, 1),
        meta: {}
      };
    }

    if (mode === 'tiered') {
      const outcome = checkResult?.outcome != null ? String(checkResult.outcome) : null;
      const routing = step?.outcomeRouting || recipe?.outcomeRouting || {};
      const routedId = outcome ? routing[outcome] : null;
      return {
        groups: routedId ? allGroups.filter(group => group.id === routedId) : [],
        meta: { outcome, routedId }
      };
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
        groups: [{
          ...group,
          results: awarded
        }],
        meta: {
          awardedResultIds: awarded.map(r => r.id),
          remaining
        }
      };
    }

    return {
      groups: allGroups,
      meta: {}
    };
  }

  validateCheckResult({ recipe, checkResult }) {
    const mode = this.getMode(recipe);
    if (mode === 'tiered') {
      return !!(checkResult?.outcome != null && String(checkResult.outcome).trim().length > 0);
    }
    if (mode === 'progressive') {
      return Number.isFinite(Number(checkResult?.value));
    }
    return true;
  }

  _getDifficulty(system, componentId) {
    if (!componentId) return null;
    const managedItems = Array.isArray(system?.components) ? system.components : (Array.isArray(system?.managedItems) ? system.managedItems : (system?.items || []));
    const item = managedItems.find(entry => entry.id === componentId);
    const difficulty = Number(item?.difficulty);
    return Number.isFinite(difficulty) ? difficulty : null;
  }
}
