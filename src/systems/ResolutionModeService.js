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
    return typeof recipe?.getExecutionSteps === 'function'
      ? recipe.getExecutionSteps()
      : [];
  }

  // ---------------------------------------------------------------------------
  // Name normalization helpers for rollTableOutcome
  // ---------------------------------------------------------------------------

  _normalizeName(name) {
    return String(name || '').trim().toLowerCase();
  }

  _isFailKeyword(name) {
    const normalized = this._normalizeName(name);
    return ['fail', 'failed', 'failure', 'f'].includes(normalized);
  }

  _isMissKeyword(name) {
    const normalized = this._normalizeName(name);
    return ['miss', 'missed', 'm', 'nothing', 'none', 'whiff', 'whiffed'].includes(normalized);
  }

  // ---------------------------------------------------------------------------
  // rollTableOutcome resolution
  // ---------------------------------------------------------------------------

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
    } catch (err) {
      return { groups: [], meta: { error: `Roll table draw failed: ${err.message}` } };
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
        meta: { drawnName, normalized, disposition: 'fail' }
      };
    }

    if (this._isMissKeyword(normalized)) {
      return {
        groups: [],
        meta: { drawnName, normalized, disposition: 'miss' }
      };
    }

    const matched = (allGroups || []).filter(g => this._normalizeName(g.name) === normalized);
    if (matched.length === 0) {
      return {
        groups: [],
        meta: {
          drawnName,
          normalized,
          disposition: 'misconfiguration',
          error: `No result group matches drawn name "${drawnName}"`
        }
      };
    }

    return {
      groups: matched.slice(0, 1),
      meta: { drawnName, normalized, disposition: 'success', matchedGroupId: matched[0].id }
    };
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

      if (mode === 'tiered' || mode === 'routed') {
        if (sets.length < 1) errors.push(`Step "${step.name || step.id}" must have at least 1 ingredient set in ${mode === 'routed' ? 'routed' : 'legacy tiered compatibility'} mode`);
        if (groups.length < 1) errors.push(`Step "${step.name || step.id}" must have at least 1 result group in ${mode === 'routed' ? 'routed' : 'legacy tiered compatibility'} mode`);

        if (mode === 'tiered') {
          if (!checkEnabled) errors.push('Legacy tiered compatibility mode requires crafting checks enabled');
          if (outcomes.length === 0) errors.push('Legacy tiered compatibility mode requires at least one declared outcome');
          const groupIds = new Set(groups.map(g => g.id));
          const routing = step?.outcomeRouting || recipe?.outcomeRouting || {};
          for (const outcome of outcomes) {
            const target = routing?.[outcome];
            if (!target || !groupIds.has(target)) {
              errors.push(`Outcome "${outcome}" must map to a valid result group in step "${step.name || step.id}"`);
            }
          }
        } else {
          const provider = this.getProviderForStep(recipe, step);
          if (!provider) {
            errors.push(`Step "${step.name || step.id}" in routed mode requires resultSelection.provider`);
          } else if (!['ingredientSet', 'macroOutcome', 'rollTableOutcome'].includes(provider)) {
            errors.push('Invalid result selection provider: ' + provider);
          }
          const selection = this.getResultSelection(recipe, step);
          if (provider === 'rollTableOutcome' && !selection?.rollTableUuid) {
            errors.push('rollTableOutcome provider requires a roll table UUID');
          }
          if (provider === 'macroOutcome' && !checkEnabled) {
            errors.push('macroOutcome provider requires crafting checks enabled');
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
            errors.push(`Result "${result?.id || 'unknown'}" references component without valid difficulty`);
          }
        }
      }
    }

    if (mode === 'alchemy') {
      // Alchemy recipes cannot have explicit multi-step configuration
      const setsTop = Array.isArray(recipe.ingredientSets) ? recipe.ingredientSets : [];
      const groupsTop = Array.isArray(recipe.resultGroups) ? recipe.resultGroups : [];
      if (setsTop.length < 1) errors.push('Alchemy recipe must have at least 1 ingredient set');
      if (groupsTop.length < 1) errors.push('Alchemy recipe must have at least 1 result group');
      // No explicit steps allowed
      const explicitSteps = typeof recipe.getExecutionSteps === 'function' ? recipe.getExecutionSteps() : [];
      const hasExplicitSteps = explicitSteps.length > 1 || (explicitSteps.length === 1 && explicitSteps[0]?.id !== 'implicit-step');
      if (hasExplicitSteps) errors.push('Alchemy recipe must not have explicit steps');
      const provider = this.getProvider(recipe);
      if (!provider) {
        errors.push('Alchemy recipe requires resultSelection.provider');
      } else if (!['ingredientSet', 'macroOutcome', 'rollTableOutcome'].includes(provider)) {
        errors.push('Invalid result selection provider: ' + provider);
      }
      if (provider === 'rollTableOutcome' && !recipe?.resultSelection?.rollTableUuid) {
        errors.push('rollTableOutcome provider requires a roll table UUID');
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

    const rawMode = system.salvageResolutionMode || 'simple';
    const mode = rawMode === 'tiered' ? 'routed' : rawMode;
    const componentLabel = component.name || component.id || 'unknown';

    if (!['simple', 'routed', 'progressive'].includes(mode)) {
      if (rawMode === 'mapped') {
        errors.push('Mapped mode is not supported for salvage');
      } else if (rawMode === 'alchemy') {
        errors.push('Alchemy mode is not supported for salvage');
      } else {
        errors.push(`Unsupported salvage resolution mode: ${rawMode}`);
      }
      return { valid: false, errors };
    }

    const groups = Array.isArray(component.salvage.resultGroups) ? component.salvage.resultGroups : [];

    if (mode === 'simple') {
      if (groups.length !== 1) {
        errors.push(`Salvage for "${componentLabel}" must have exactly 1 result group in simple mode`);
      }
    }

    if (mode === 'routed') {
      const checkEnabled = system.salvageCraftingCheck?.enabled === true || !!system.salvageCraftingCheck?.macroUuid;
      const outcomes = Array.isArray(system.salvageCraftingCheck?.outcomes) ? system.salvageCraftingCheck.outcomes : [];

      if (!checkEnabled) errors.push('Routed salvage mode requires crafting checks enabled');
      if (outcomes.length === 0) errors.push('Routed salvage mode requires at least one declared outcome');
      if (groups.length < 1) errors.push(`Salvage for "${componentLabel}" must have at least 1 result group in routed mode`);

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

  resolveResultGroups({ recipe, step, ingredientSet, checkResult, selectedResultGroupId = null, rollTableResult = null }) {
    // If a rollTableResult was pre-resolved (for rollTableOutcome provider), use it directly
    if (rollTableResult) {
      return rollTableResult;
    }

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

    if (mode === 'tiered' || mode === 'routed') {
      const outcome = checkResult?.outcome != null ? String(checkResult.outcome) : null;
      if (mode === 'tiered') {
        const routing = step?.outcomeRouting || recipe?.outcomeRouting || {};
        const routedId = outcome ? routing[outcome] : null;
        return {
          groups: routedId ? allGroups.filter(group => group.id === routedId) : [],
          meta: { outcome, routedId }
        };
      }

      const provider = this.getProviderForStep(recipe, step);
      if (provider === 'ingredientSet') {
        const mappedId = ingredientSet?.resultGroupId || selectedResultGroupId || null;
        if (mappedId) return { groups: allGroups.filter(group => group.id === mappedId), meta: {} };
        return { groups: allGroups.slice(0, 1), meta: {} };
      }
      if (provider === 'macroOutcome') {
        const normalized = this._normalizeName(outcome);
        if (this._isFailKeyword(normalized)) return { groups: [], meta: { outcome, disposition: 'fail' } };
        if (this._isMissKeyword(normalized)) return { groups: [], meta: { outcome, disposition: 'miss' } };
        const matched = allGroups.filter(group => this._normalizeName(group.name) === normalized);
        if (matched.length === 0) {
          return { groups: [], meta: { outcome, disposition: 'misconfiguration', error: `No result group matches outcome "${outcome}"` } };
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

    if (mode === 'alchemy') {
      const provider = this.getProvider(recipe);
      if (provider === 'ingredientSet') {
        const mappedId = ingredientSet?.resultGroupId || null;
        if (mappedId) {
          return { groups: allGroups.filter(g => g.id === mappedId), meta: {} };
        }
        return { groups: allGroups.slice(0, 1), meta: {} };
      }
      if (provider === 'macroOutcome') {
        const outcome = checkResult?.outcome != null ? String(checkResult.outcome) : null;
        const normalized = this._normalizeName(outcome);
        if (this._isFailKeyword(normalized)) {
          return { groups: [], meta: { outcome, disposition: 'fail' } };
        }
        if (this._isMissKeyword(normalized)) {
          return { groups: [], meta: { outcome, disposition: 'miss' } };
        }
        const matched = allGroups.filter(g => this._normalizeName(g.name) === normalized);
        if (matched.length === 0) {
          return { groups: [], meta: { outcome, disposition: 'misconfiguration', error: `No result group matches outcome "${outcome}"` } };
        }
        return { groups: matched.slice(0, 1), meta: { outcome, disposition: 'success' } };
      }
      return { groups: allGroups.slice(0, 1), meta: {} };
    }

    return {
      groups: [],
      meta: {
        error: 'Unknown resolution mode',
        disposition: 'error'
      }
    };
  }

  validateCheckResult({ recipe, checkResult }) {
    const mode = this.getMode(recipe);
    if (mode === 'tiered') {
      return !!(checkResult?.outcome != null && String(checkResult.outcome).trim().length > 0);
    }
    if (mode === 'routed') {
      return this.getProvider(recipe) !== 'macroOutcome'
        || !!(checkResult?.outcome != null && String(checkResult.outcome).trim().length > 0);
    }
    if (mode === 'progressive') {
      return Number.isFinite(Number(checkResult?.value));
    }
    return true;
  }

  _getDifficulty(system, componentId) {
    if (!componentId) return null;
    const managedItems = system?.components || [];
    const item = managedItems.find(entry => entry.id === componentId);
    const difficulty = Number(item?.difficulty);
    return Number.isFinite(difficulty) ? difficulty : null;
  }
}
