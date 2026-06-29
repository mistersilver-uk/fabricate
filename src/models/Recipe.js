import { normalizeRecipeCategory } from '../utils/recipeCategories.js';
import { normalizeRoutedName, isReservedRoutedName } from '../utils/routedOutcomeKeywords.js';

import { Ingredient } from './Ingredient.js';
import { IngredientSet } from './IngredientSet.js';
import { Result } from './Result.js';

/**
 * Canonical default/fallback image for a recipe with no custom image set.
 * Defined in the model (the lowest shared layer) so systems and UI can import
 * a single source of truth without a ui→model/systems layering violation.
 * @type {string}
 */
export const DEFAULT_RECIPE_IMAGE = 'icons/sundries/documents/blueprint-recipe-alchemical.webp';

/**
 * Represents a crafting recipe
 * Supports simple (A + B = C) and complex (multiple ingredient sets, variable output, essences) modes
 */
export class Recipe {
  constructor(data = {}) {
    this.id = data.id || foundry.utils.randomID();
    this.name = data.name || 'Unnamed Recipe';
    this.description = data.description || '';
    this.img = data.img || DEFAULT_RECIPE_IMAGE;
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

    // Authoring complexity: Simple (one ingredient set + one result set, streamlined
    // UI) vs Complex (multiple sets, full UI). An explicit flag wins; otherwise it is
    // derived so legacy multi-set recipes are never silently collapsed to Simple.
    this.complex = typeof data.complex === 'boolean' ? data.complex : this._deriveComplex(data);

    // Recipe-level shared library tool references (per-system Tool ids).
    this.toolIds = this._normalizeToolIds(data.toolIds);

    // Recipe-level duration for the implicit (single) step. Multi-step recipes
    // carry their own per-step `timeRequirement`; this feeds the implicit step
    // synthesized by getExecutionSteps for single-step recipes.
    this.timeRequirement = this._normalizeTimeRequirement(data.timeRequirement);

    // Recipe behaviour
    this.isVariable = data.isVariable === undefined ? false : data.isVariable;
    this.transferEffects = data.transferEffects === undefined ? false : data.transferEffects;
    this.outcomeRouting =
      data.outcomeRouting && typeof data.outcomeRouting === 'object'
        ? { ...data.outcomeRouting }
        : null;
    this.resultSelection = this._normalizeResultSelection(data.resultSelection);
    // Optional reference to a simple-check recipe tier (its id). When set, the
    // recipe uses that tier's DC instead of the system default; null/unknown ids
    // fall back to the default at resolution time.
    this.checkTierId =
      typeof data.checkTierId === 'string' && data.checkTierId.trim()
        ? data.checkTierId.trim()
        : null;
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
   * Validate that this recipe has all required data, including completeness
   * (ingredient sets and result groups required to craft). This is the
   * craftability contract and is unchanged: a recipe must satisfy it before it
   * can be crafted or surfaced as craftable.
   * @returns {{valid: boolean, errors: string[]}}
   */
  validate() {
    return this._validate({ requireComplete: true });
  }

  /**
   * Validate this recipe's structural integrity only, waiving completeness
   * (missing ingredient sets / result groups). This is the persistence
   * contract: a GM authoring path may persist a structurally consistent but
   * incomplete shell. Such a shell remains non-craftable because the engine
   * still gates on the full {@link Recipe#validate} contract.
   * @returns {{valid: boolean, errors: string[]}}
   */
  validateStructure() {
    return this._validate({ requireComplete: false });
  }

  /**
   * Internal validation implementation.
   * @param {{requireComplete?: boolean}} [options] - When `requireComplete` is
   *   false, completeness errors (missing ingredient sets / result groups /
   *   results) are waived while all structural integrity checks still fire.
   * @returns {{valid: boolean, errors: string[]}}
   * @private
   */
  _validate({ requireComplete = true } = {}) {
    const errors = [];

    // Basic validation
    if (!this.name) errors.push('Recipe must have a name');

    // Ingredient set validation
    const hasSteps = this.steps.length > 0;
    if (requireComplete && !hasSteps && this.ingredientSets.length === 0) {
      errors.push('Recipe must have at least one ingredient set (or use explicit steps)');
    }

    if (hasSteps) {
      for (const step of this.steps) {
        if (
          requireComplete &&
          (!Array.isArray(step.ingredientSets) || step.ingredientSets.length === 0)
        ) {
          errors.push(`Step "${step.name || step.id}" must include at least one ingredient set`);
        }
        if (
          requireComplete &&
          (!Array.isArray(step.resultGroups) || step.resultGroups.length === 0)
        ) {
          errors.push(`Step "${step.name || step.id}" must include at least one result group`);
        }
        this._validateTimeRequirement(
          step.timeRequirement,
          `Step "${step.name || step.id}"`,
          errors
        );
      }
    } else {
      this._validateTimeRequirement(this.timeRequirement, 'Recipe', errors);
      for (const ingredientSet of this.ingredientSets) {
        const setValidation = ingredientSet.validate({ requireComplete });
        if (!setValidation.valid) {
          errors.push(
            `Ingredient set "${ingredientSet.name || ingredientSet.id}": ${setValidation.errors.join(', ')}`
          );
        }
      }
    }

    // Result validation. Explicit multi-step recipes own their outputs on each step;
    // implicit recipes still use the top-level result groups.
    if (requireComplete && !hasSteps && this.resultGroups.length === 0) {
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
      this._validateResultGroups(container.resultGroups, container.label, errors, {
        requireComplete,
      });
      this._validateRoutedResultSelection(
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

  _validateResultGroups(resultGroups, label, errors, { requireComplete = true } = {}) {
    const resultGroupIds = new Set();
    const resultIds = new Set();
    for (const group of resultGroups) {
      if (resultGroupIds.has(group.id)) {
        errors.push(`${label} has duplicate result group ID: ${group.id}`);
      }
      resultGroupIds.add(group.id);
      if (!Array.isArray(group.results) || group.results.length === 0) {
        if (requireComplete) {
          errors.push(`${label} result group "${group.id}" must contain at least one result`);
        }
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

  /**
   * Validate an alchemy `resultSelection` and its `ResultGroup` names.
   *
   * `resultSelection.provider` survives ONLY for alchemy (the routed crafting
   * modes derive their basis from the system mode and clear `resultSelection`), so
   * a recipe with no `resultSelection` (simple/progressive/routed/legacy) is
   * unaffected. The alchemy `check` provider routes by the crafting-check outcome.
   *
   * Under the alchemy providers, `ResultGroup.name` must be unique under
   * trim+lowercase comparison and must not collide with a reserved routing
   * keyword (the fail/miss/hazard families in `routedOutcomeKeywords.js`). The
   * shared keyword set keeps this in lockstep with the runtime resolution path in
   * `ResolutionModeService`.
   *
   * @param {{provider?: string}} resultSelection
   * @param {Array<{id?: string, name?: string}>} resultGroups
   * @param {string[]} errors push-target for validation messages
   */
  _validateRoutedResultSelection(resultSelection, resultGroups, errors) {
    const provider = resultSelection?.provider;
    // Only an alchemy provider routes by ResultGroup.name; a recipe with no
    // resultSelection (simple/progressive/routed/legacy) is unaffected.
    if (!['ingredientSet', 'check'].includes(provider)) return;

    // Reserved + unique ResultGroup.name rules apply under the alchemy providers
    // (spec 004 §routedByCheck Validation), using the shared keyword set so the
    // model and ResolutionModeService never drift.
    const seenNames = new Set();
    for (const group of resultGroups || []) {
      const normalized = normalizeRoutedName(group?.name);
      if (!normalized) continue;
      if (seenNames.has(normalized)) {
        errors.push(
          `Duplicate result group name "${group.name}" (case-insensitive) — routed mode requires unique names`
        );
      }
      seenNames.add(normalized);
      if (isReservedRoutedName(normalized)) {
        errors.push(`Result group name "${group.name}" conflicts with reserved routing keyword`);
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
      complex: this.complex,
      steps: this.steps.map((step) => ({
        ...step,
        ingredientSets: (step.ingredientSets || []).map((set) => (set.toJSON ? set.toJSON() : set)),
        resultGroups: (step.resultGroups || []).map((group) => ({
          id: group.id,
          name: group.name,
          checkOutcomeIds: Array.isArray(group.checkOutcomeIds) ? [...group.checkOutcomeIds] : [],
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
        checkOutcomeIds: Array.isArray(group.checkOutcomeIds) ? [...group.checkOutcomeIds] : [],
        results: group.results.map((r) => r.toJSON()),
      })),
      toolIds: [...this.toolIds],
      timeRequirement: this.timeRequirement,
      // Legacy alias retained for compatibility with older consumers.
      results: this.results.map((r) => r.toJSON()),
      isVariable: this.isVariable,
      transferEffects: this.transferEffects,
      outcomeRouting: this.outcomeRouting,
      resultSelection: this.resultSelection,
      checkTierId: this.checkTierId,
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

  /**
   * Derive the default Complex flag from raw construction data. Returns true when
   * any scope (recipe-level or any step) already holds more than one ingredient set
   * or more than one result group, so legacy multi-set recipes default to Complex.
   * @param {object} data - Raw recipe construction data.
   * @returns {boolean}
   * @private
   */
  _deriveComplex(data = {}) {
    const scopeIsComplex = (scope) => {
      const ingredientSets = Array.isArray(scope?.ingredientSets) ? scope.ingredientSets : [];
      const resultGroups = Array.isArray(scope?.resultGroups) ? scope.resultGroups : [];
      return ingredientSets.length > 1 || resultGroups.length > 1;
    };
    if (scopeIsComplex(data)) return true;
    const steps = Array.isArray(data.steps) ? data.steps : [];
    return steps.some((step) => scopeIsComplex(step));
  }

  _normalizeResultSelection(resultSelection) {
    if (!resultSelection || typeof resultSelection !== 'object') return null;
    // `ingredientSet` and `check` are the canonical providers — now ALCHEMY-only
    // (the routed crafting modes derive their basis from the system mode and carry
    // no `resultSelection`). The legacy
    // `macroOutcome`/`rollTableOutcome` providers were removed in 1.6.0 (persisted
    // recipes were migrated onto `check` by `migrateRemoveResultSelectionProviders`).
    // The `macroUuid` those providers carried is now orphaned — nothing reads it —
    // and was retired in 1.8.0 (stripped from persisted recipes by
    // `migrateRemoveLegacyCheckSources`), so it is no longer normalized here.
    const VALID_PROVIDERS = ['ingredientSet', 'check'];
    const provider = String(resultSelection.provider || '').trim();
    if (!VALID_PROVIDERS.includes(provider)) return null;
    return { provider };
  }

  _normalizeResultGroups(data = {}) {
    if (Array.isArray(data.resultGroups) && data.resultGroups.length > 0) {
      return data.resultGroups.map((group, idx) => ({
        id: group?.id || foundry.utils.randomID(),
        name: group?.name || `Result Group ${idx + 1}`,
        // Routed check-mode routing: ids of the system's routed-check outcome
        // tiers that produce this group. Empty for ingredient-mode / non-routed.
        checkOutcomeIds: this._normalizeIdList(group?.checkOutcomeIds),
        results: (group?.results || []).map((r) => (r instanceof Result ? r : Result.fromJSON(r))),
      }));
    }

    const legacyResults = Array.isArray(data.results) ? data.results : [];
    return legacyResults.map((r, idx) => {
      const result = r instanceof Result ? r : Result.fromJSON(r);
      return {
        id: result.id || foundry.utils.randomID(),
        name: `Result Group ${idx + 1}`,
        checkOutcomeIds: [],
        results: [result],
      };
    });
  }

  /**
   * Coerce a value into a deduped array of trimmed, non-empty id strings.
   * Tolerant of non-array / nullish input (returns []).
   * @param {unknown} value
   * @returns {string[]}
   */
  _normalizeIdList(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const out = [];
    for (const raw of value) {
      const id = String(raw ?? '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
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
      currencyCost: this._normalizeCurrencyCost(step.currencyCost),
      outcomeRouting:
        step.outcomeRouting && typeof step.outcomeRouting === 'object'
          ? { ...step.outcomeRouting }
          : null,
      resultSelection: this._normalizeResultSelection(step.resultSelection),
    };
  }

  /**
   * Validate a step/recipe time requirement: every present unit must be a
   * finite, non-negative number. A nullish requirement is valid (no duration).
   * @param {object|null} timeRequirement
   * @param {string} label - Prefix for any error message (e.g. `Step "Forge"`).
   * @param {string[]} errors - Accumulator the caller owns.
   * @private
   */
  _validateTimeRequirement(timeRequirement, label, errors) {
    if (!timeRequirement) return;
    for (const unit of ['minutes', 'hours', 'days', 'months', 'years']) {
      const value = Number(timeRequirement?.[unit] || 0);
      if (!Number.isFinite(value) || value < 0) {
        errors.push(`${label} has invalid time requirement value for "${unit}"`);
      }
    }
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
        timeRequirement: this.timeRequirement || null,
        outcomeRouting: this.outcomeRouting || null,
        resultSelection: this.resultSelection || null,
      },
    ];
  }
}
