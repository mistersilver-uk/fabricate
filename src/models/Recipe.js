import { normalizeRecipeCategory } from '../utils/recipeCategories.js';

import { Ingredient } from './Ingredient.js';
import { IngredientSet } from './IngredientSet.js';
import { Result } from './Result.js';

/**
 * Represents a crafting recipe
 * Supports simple (A + B = C) and complex (multiple ingredient sets, variable output, essences) modes
 */
export class Recipe {
  constructor(data = {}) {
    this.id = data.id || foundry.utils.randomID();
    this.name = data.name || 'Unnamed Recipe';
    this.description = data.description || '';
    this.img = data.img || 'icons/svg/item-bag.svg';
    this.category = normalizeRecipeCategory(data.category);
    this.craftingSystemId = data.craftingSystemId || null;
    this.system = data.system || 'all';
    this.tags = Array.isArray(data.tags) ? data.tags : [];
    this.enabled = data.enabled === undefined ? true : data.enabled;
    this.locked = data.locked === true;
    this.recipeItemId = data.recipeItemId || null;
    this.linkedRecipeItemUuid = data.linkedRecipeItemUuid || null;
    this.visibility = this._normalizeVisibility(data.visibility);

    // Input requirements (at least one set must be satisfied)
    this.ingredientSets = (data.ingredientSets || []).map((s) =>
      s instanceof IngredientSet ? s : IngredientSet.fromJSON(s)
    );
    this.steps = Array.isArray(data.steps)
      ? data.steps.map((step, idx) => this._normalizeStep(step, idx))
      : [];

    // Output groups (canonical). Legacy flat `results` is still accepted and flattened for compatibility.
    this.resultGroups = this._normalizeResultGroups(data);
    this.results = this.resultGroups.flatMap((group) => group.results);

    // Recipe-level shared library tool references (per-system Tool ids).
    this.toolIds = this._normalizeToolIds(data.toolIds);

    // Recipe behaviour
    this.isVariable = data.isVariable === undefined ? false : data.isVariable;
    this.transferEffects = data.transferEffects === undefined ? false : data.transferEffects;
    this.outcomeRouting =
      data.outcomeRouting && typeof data.outcomeRouting === 'object'
        ? { ...data.outcomeRouting }
        : null;
    this.resultSelection = this._normalizeResultSelection(data.resultSelection);
    this.currencyCost = this._normalizeCurrencyCost(data.currencyCost);
    this.teaser = this._normalizeTeaser(data.teaser);

    // Metadata
    this.metadata = data.metadata || {
      created: Date.now(),
      modified: Date.now(),
      author: game?.user?.name || 'Unknown',
      version: '1.0.0',
    };
  }

  /**
   * Get a simple description of what this recipe produces
   * @returns {string}
   */
  getResultDescription() {
    if (this.resultGroups.length === 0) return 'No result';
    if (this.resultGroups.length === 1 && this.resultGroups[0].results.length === 1) {
      return this.resultGroups[0].results[0].getDescription();
    }
    return `${this.resultGroups.length} result groups`;
  }

  /**
   * Check if this is a simple recipe (no advanced features)
   * @returns {boolean}
   */
  isSimpleRecipe() {
    // Single ingredient set with exact item matching (no tags)
    const firstSet = this.ingredientSets[0];
    const groups = Array.isArray(firstSet?.ingredientGroups) ? firstSet.ingredientGroups : [];
    const hasSimpleIngredients =
      this.ingredientSets.length === 1 &&
      groups.length > 0 &&
      groups.every(
        (group) =>
          Array.isArray(group.options) &&
          group.options.length === 1 &&
          !!group.options[0] &&
          (!!group.options[0].itemUuid ||
            ((group.options[0].match?.type === 'component' ||
              group.options[0].match?.type === 'systemItem') &&
              !!(group.options[0].match?.componentId || group.options[0].match?.systemItemId)) ||
            !!(group.options[0].componentId || group.options[0].systemItemId)) &&
          !(group.options[0].match?.type === 'tags') &&
          !group.options[0].tag
      ) &&
      Object.keys(firstSet?.essences || {}).length === 0;

    const hasNoTools =
      (this.toolIds?.length || 0) === 0 &&
      this.ingredientSets.every((set) => (set.toolIds?.length || 0) === 0);
    const hasNoVariableOutput = !this.isVariable;
    const hasNoEffectTransfer = !this.transferEffects;

    return hasSimpleIngredients && hasNoTools && hasNoVariableOutput && hasNoEffectTransfer;
  }

  /**
   * Validate that this recipe has all required data
   * @returns {{valid: boolean, errors: string[]}}
   */
  validate() {
    const errors = [];

    // Basic validation
    if (!this.name) errors.push('Recipe must have a name');

    // Ingredient set validation
    const hasSteps = this.steps.length > 0;
    if (!hasSteps && this.ingredientSets.length === 0) {
      errors.push('Recipe must have at least one ingredient set (or use explicit steps)');
    }

    if (hasSteps) {
      for (const step of this.steps) {
        if (!Array.isArray(step.ingredientSets) || step.ingredientSets.length === 0) {
          errors.push(`Step "${step.name || step.id}" must include at least one ingredient set`);
        }
        if (!Array.isArray(step.resultGroups) || step.resultGroups.length === 0) {
          errors.push(`Step "${step.name || step.id}" must include at least one result group`);
        }
        if (step.timeRequirement) {
          for (const unit of ['minutes', 'hours', 'days', 'months', 'years']) {
            const value = Number(step.timeRequirement?.[unit] || 0);
            if (!Number.isFinite(value) || value < 0) {
              errors.push(
                `Step "${step.name || step.id}" has invalid time requirement value for "${unit}"`
              );
            }
          }
        }
        if (step.currencyRequirement) {
          const unit = String(step.currencyRequirement?.unit || '').trim();
          const amount = Number(step.currencyRequirement?.amount || 0);
          if (!unit) {
            errors.push(`Step "${step.name || step.id}" has invalid currency requirement unit`);
          }
          if (!Number.isFinite(amount) || amount <= 0) {
            errors.push(`Step "${step.name || step.id}" has invalid currency requirement amount`);
          }
        }
      }
    } else {
      for (const ingredientSet of this.ingredientSets) {
        const setValidation = ingredientSet.validate();
        if (!setValidation.valid) {
          errors.push(
            `Ingredient set "${ingredientSet.name || ingredientSet.id}": ${setValidation.errors.join(', ')}`
          );
        }
      }
    }

    // Result validation. Explicit multi-step recipes own their outputs on each step;
    // implicit recipes still use the top-level result groups.
    if (!hasSteps && this.resultGroups.length === 0) {
      errors.push('Recipe must have at least one result group');
    }

    const resultContainers = hasSteps
      ? this.steps.map((step) => ({
          label: `Step "${step.name || step.id}"`,
          resultGroups: Array.isArray(step.resultGroups) ? step.resultGroups : [],
          resultSelection: step.resultSelection || this.resultSelection,
        }))
      : [
          {
            label: 'Recipe',
            resultGroups: this.resultGroups,
            resultSelection: this.resultSelection,
          },
        ];

    for (const container of resultContainers) {
      this._validateResultGroups(container.resultGroups, container.label, errors);
      this._validateRollTableResultSelection(
        container.resultSelection,
        container.resultGroups,
        errors
      );
    }

    const resultGroupIds = new Set(this.resultGroups.map((group) => group.id));
    const resultIds = new Set(
      this.resultGroups.flatMap((group) => (group.results || []).map((result) => result.id))
    );
    const routableResultGroupIds = hasSteps
      ? new Set(this.steps.flatMap((step) => (step.resultGroups || []).map((group) => group.id)))
      : resultGroupIds;

    // Variable recipe validation
    if (this.isVariable) {
      for (const ingredientSet of this.ingredientSets) {
        for (const mappingId of ingredientSet.resultMapping) {
          const valid = resultGroupIds.has(mappingId) || resultIds.has(mappingId);
          if (!valid) {
            errors.push(
              `Ingredient set "${ingredientSet.name || ingredientSet.id}" references invalid result mapping ID: ${mappingId}`
            );
          }
        }
      }
    }

    if (this.outcomeRouting && typeof this.outcomeRouting === 'object') {
      for (const [outcome, resultGroupId] of Object.entries(this.outcomeRouting)) {
        if (resultGroupId && !routableResultGroupIds.has(resultGroupId)) {
          errors.push(
            `Outcome routing "${outcome}" references invalid result group ID: ${resultGroupId}`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  _validateResultGroups(resultGroups, label, errors) {
    const resultGroupIds = new Set();
    const resultIds = new Set();
    for (const group of resultGroups) {
      if (resultGroupIds.has(group.id)) {
        errors.push(`${label} has duplicate result group ID: ${group.id}`);
      }
      resultGroupIds.add(group.id);
      if (!Array.isArray(group.results) || group.results.length === 0) {
        errors.push(`${label} result group "${group.id}" must contain at least one result`);
        continue;
      }

      for (const result of group.results) {
        if (resultIds.has(result.id)) {
          errors.push(`${label} has duplicate result ID: ${result.id}`);
        }
        resultIds.add(result.id);

        const resultValidation = result.validate();
        if (!resultValidation.valid) {
          errors.push(`${label} result "${result.id}": ${resultValidation.errors.join(', ')}`);
        }
      }
    }
  }

  _validateRollTableResultSelection(resultSelection, resultGroups, errors) {
    if (resultSelection?.provider === 'rollTableOutcome') {
      if (!resultSelection.rollTableUuid) {
        errors.push('rollTableOutcome provider requires a roll table UUID');
      }

      // Validate ResultGroup name uniqueness (case-insensitive) and reserved keywords
      const FAIL_KEYWORDS = new Set(['fail', 'failed', 'failure', 'f']);
      const MISS_KEYWORDS = new Set(['miss', 'missed', 'm', 'nothing', 'none', 'whiff', 'whiffed']);
      const seenNames = new Map();
      for (const group of resultGroups) {
        const normalized = String(group.name || '')
          .trim()
          .toLowerCase();
        if (seenNames.has(normalized)) {
          errors.push(
            `Duplicate result group name "${group.name}" (case-insensitive) — rollTableOutcome requires unique names`
          );
        }
        seenNames.set(normalized, group.id);
        if (FAIL_KEYWORDS.has(normalized) || MISS_KEYWORDS.has(normalized)) {
          errors.push(`Result group name "${group.name}" conflicts with reserved routing keyword`);
        }
      }
    }
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      img: this.img,
      category: this.category,
      craftingSystemId: this.craftingSystemId,
      system: this.system,
      tags: this.tags,
      enabled: this.enabled,
      locked: this.locked,
      recipeItemId: this.recipeItemId,
      linkedRecipeItemUuid: this.linkedRecipeItemUuid,
      visibility: this.visibility,
      steps: this.steps.map((step) => ({
        ...step,
        ingredientSets: (step.ingredientSets || []).map((set) => (set.toJSON ? set.toJSON() : set)),
        resultGroups: (step.resultGroups || []).map((group) => ({
          id: group.id,
          name: group.name,
          results: (group.results || []).map((result) =>
            result.toJSON ? result.toJSON() : result
          ),
        })),
        toolIds: Array.isArray(step.toolIds) ? [...step.toolIds] : [],
      })),
      ingredientSets: this.ingredientSets.map((s) => s.toJSON()),
      resultGroups: this.resultGroups.map((group) => ({
        id: group.id,
        name: group.name,
        results: group.results.map((r) => r.toJSON()),
      })),
      toolIds: [...this.toolIds],
      // Legacy alias retained for compatibility with older consumers.
      results: this.results.map((r) => r.toJSON()),
      isVariable: this.isVariable,
      transferEffects: this.transferEffects,
      outcomeRouting: this.outcomeRouting,
      resultSelection: this.resultSelection,
      currencyCost: this.currencyCost,
      teaser: this.teaser,
      metadata: this.metadata,
    };
  }

  static fromJSON(data) {
    return new Recipe(data);
  }

  /**
   * Create a simple recipe with minimal configuration
   * @param {string} name - Recipe name
   * @param {Array} ingredients - Array of {itemUuid, quantity} objects
   * @param {Object} result - {itemUuid, quantity} object
   * @returns {Recipe}
   */
  static createSimple(name, ingredients, result) {
    return new Recipe({
      name,
      ingredientSets: [
        new IngredientSet({
          id: 'default',
          ingredientGroups: ingredients.map((ing, idx) => ({
            id: `group-${idx + 1}`,
            options: [
              new Ingredient({
                itemUuid: ing.itemUuid,
                quantity: ing.quantity || 1,
              }),
            ],
          })),
        }),
      ],
      resultGroups: [
        {
          id: 'default',
          name: 'Default',
          results: [
            new Result({
              id: 'default-result',
              itemUuid: result.itemUuid,
              quantity: result.quantity || 1,
            }),
          ],
        },
      ],
      isVariable: false,
      transferEffects: false,
    });
  }

  _normalizeResultSelection(resultSelection) {
    if (!resultSelection || typeof resultSelection !== 'object') return null;
    const VALID_PROVIDERS = ['ingredientSet', 'macroOutcome', 'rollTableOutcome'];
    const provider = String(resultSelection.provider || '').trim();
    if (!VALID_PROVIDERS.includes(provider)) return null;
    return {
      provider,
      macroUuid: resultSelection.macroUuid || null,
      rollTableUuid: resultSelection.rollTableUuid || null,
    };
  }

  _normalizeResultGroups(data = {}) {
    if (Array.isArray(data.resultGroups) && data.resultGroups.length > 0) {
      return data.resultGroups.map((group, idx) => ({
        id: group?.id || foundry.utils.randomID(),
        name: group?.name || `Result Group ${idx + 1}`,
        results: (group?.results || []).map((r) => (r instanceof Result ? r : Result.fromJSON(r))),
      }));
    }

    const legacyResults = Array.isArray(data.results) ? data.results : [];
    return legacyResults.map((r, idx) => {
      const result = r instanceof Result ? r : Result.fromJSON(r);
      return {
        id: result.id || foundry.utils.randomID(),
        name: `Result Group ${idx + 1}`,
        results: [result],
      };
    });
  }

  _normalizeStep(step = {}, idx = 0) {
    return {
      id: step.id || foundry.utils.randomID(),
      name: step.name || `Step ${idx + 1}`,
      description: step.description || '',
      ingredientSets: (step.ingredientSets || []).map((set) =>
        set instanceof IngredientSet ? set : IngredientSet.fromJSON(set)
      ),
      resultGroups: this._normalizeResultGroups(step),
      toolIds: this._normalizeToolIds(step.toolIds),
      timeRequirement: this._normalizeTimeRequirement(step.timeRequirement),
      currencyRequirement: this._normalizeCurrencyRequirement(step.currencyRequirement),
      currencyCost: this._normalizeCurrencyCost(step.currencyCost),
      outcomeRouting:
        step.outcomeRouting && typeof step.outcomeRouting === 'object'
          ? { ...step.outcomeRouting }
          : null,
      resultSelection: this._normalizeResultSelection(step.resultSelection),
    };
  }

  _normalizeTimeRequirement(timeRequirement = null) {
    if (!timeRequirement || typeof timeRequirement !== 'object') return null;
    const normalized = {
      minutes: Math.max(0, Number(timeRequirement.minutes || 0) || 0),
      hours: Math.max(0, Number(timeRequirement.hours || 0) || 0),
      days: Math.max(0, Number(timeRequirement.days || 0) || 0),
      months: Math.max(0, Number(timeRequirement.months || 0) || 0),
      years: Math.max(0, Number(timeRequirement.years || 0) || 0),
    };
    const total =
      normalized.minutes +
      normalized.hours +
      normalized.days +
      normalized.months +
      normalized.years;
    return total > 0 ? normalized : null;
  }

  _normalizeCurrencyRequirement(currencyRequirement = null) {
    if (!currencyRequirement || typeof currencyRequirement !== 'object') return null;
    const unit = String(currencyRequirement.unit || '').trim();
    const amount = Math.max(0, Number(currencyRequirement.amount || 0) || 0);
    return unit && amount > 0 ? { unit, amount } : null;
  }

  _normalizeCurrencyCost(cost) {
    if (!cost || typeof cost !== 'object') return null;
    const currencies = Array.isArray(cost.currencies) ? cost.currencies : [];
    const normalized = currencies
      .map((c) => ({
        abbreviation: String(c.abbreviation || '').trim(),
        amount: Math.max(0, Number(c.amount) || 0),
      }))
      .filter((c) => c.abbreviation && c.amount > 0);
    return normalized.length > 0 ? { currencies: normalized } : null;
  }

  _normalizeTeaser(teaser) {
    if (!teaser || typeof teaser !== 'object') {
      return {
        enabled: true,
        hiddenFields: ['ingredients', 'results', 'description'],
        revealThreshold: 100,
        teaserDescription: '',
      };
    }
    const VALID_FIELDS = ['ingredients', 'results', 'description', 'tools', 'essences'];
    return {
      enabled: teaser.enabled !== false,
      hiddenFields: Array.isArray(teaser.hiddenFields)
        ? teaser.hiddenFields.filter((f) => VALID_FIELDS.includes(f))
        : ['ingredients', 'results', 'description'],
      revealThreshold: Math.min(100, Math.max(0, Number(teaser.revealThreshold) || 100)),
      teaserDescription: String(teaser.teaserDescription || '').trim(),
    };
  }

  /**
   * Normalize an array of library tool id strings: coerce to trimmed, non-empty,
   * deduped strings. Tolerant of non-array / nullish input (returns []).
   * @param {unknown} toolIds
   * @returns {string[]}
   */
  _normalizeToolIds(toolIds) {
    if (!Array.isArray(toolIds)) return [];
    const seen = new Set();
    const out = [];
    for (const raw of toolIds) {
      const id = String(raw ?? '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  _normalizeVisibility(visibility) {
    if (!visibility || typeof visibility !== 'object') return null;
    return {
      restricted: visibility.restricted === true,
      allowedUserIds: Array.isArray(visibility.allowedUserIds)
        ? [...visibility.allowedUserIds]
        : [],
    };
  }

  getExecutionSteps() {
    if (Array.isArray(this.steps) && this.steps.length > 0) {
      return this.steps;
    }

    return [
      {
        id: 'implicit-step',
        name: 'Step 1',
        description: '',
        ingredientSets: this.ingredientSets,
        resultGroups: this.resultGroups,
        toolIds: this.toolIds || [],
        timeRequirement: null,
        currencyRequirement: null,
        outcomeRouting: this.outcomeRouting || null,
        resultSelection: this.resultSelection || null,
      },
    ];
  }
}
