import { ingredientSetToolsAreActive } from '../systems/toolCheckBonus.js';
import { authoredCheckModifierIds } from '../utils/checkModifierPicks.js';
import { buildRecipeActivationIssue } from '../utils/recipeActivationMessages.js';
import { GENERAL_RECIPE_CATEGORY, normalizeRecipeCategory } from '../utils/recipeCategories.js';
import { normalizeRoutedName, isReservedRoutedName } from '../utils/routedOutcomeKeywords.js';

import { Ingredient } from './Ingredient.js';
import { IngredientSet } from './IngredientSet.js';
import { isEmptyArray, isNull, omitReconstructibleDefaults } from './reconstructibleDefaults.js';
import { Result } from './Result.js';

/** The fallback recipe image, in the model so systems and UI share it without a layering break. */
export const DEFAULT_RECIPE_IMAGE = 'icons/sundries/documents/blueprint-recipe-alchemical.webp';

/** The teaser fields hidden by default when a recipe carries no authored teaser block. */
const DEFAULT_TEASER_HIDDEN_FIELDS = ['ingredients', 'results', 'description'];

/** Whether a teaser block is exactly the one `_normalizeTeaser` builds when none is authored. */
function isDefaultTeaser(teaser) {
  return (
    teaser?.enabled === true &&
    teaser.revealThreshold === 100 &&
    teaser.teaserDescription === '' &&
    Array.isArray(teaser.hiddenFields) &&
    teaser.hiddenFields.length === DEFAULT_TEASER_HIDDEN_FIELDS.length &&
    teaser.hiddenFields.every((field, index) => field === DEFAULT_TEASER_HIDDEN_FIELDS[index])
  );
}

/**
 * Serialized recipe fields the `Recipe` constructor rebuilds to EXACTLY this value when the key is
 * absent, so emitting them is pure payload weight (issue 1087).
 */
export const RECIPE_OMITTED_WHEN_DEFAULT = {
  description: (value) => value === '',
  img: (value) => value === DEFAULT_RECIPE_IMAGE,
  category: (value) => value === GENERAL_RECIPE_CATEGORY,
  craftingSystemId: isNull,
  system: (value) => value === 'all',
  tags: isEmptyArray,
  // Both default true on absence, but `enabled` is not omittable: other readers of the serialized
  // payload need it.
  allowPlayerResultReorder: (value) => value === true,
  locked: (value) => value === false,
  recipeItemId: isNull,
  linkedRecipeItemUuid: isNull,
  visibility: isNull,
  // Only both-empty is omittable: `_normalizeAccess` seeds `playerIds` from the legacy
  // `visibility.allowedUserIds`, so a legacy grant reports non-empty here and is emitted.
  access: (value) => value?.characterIds?.length === 0 && value?.playerIds?.length === 0,
  steps: isEmptyArray,
  toolIds: isEmptyArray,
  timeRequirement: isNull,
  isVariable: (value) => value === false,
  transferEffects: (value) => value === false,
  outcomeRouting: isNull,
  resultSelection: isNull,
  checkTierId: isNull,
  minSuccessOutcomeId: isNull,
  craftingModifier: isNull,
  currencyCost: isNull,
  teaser: isDefaultTeaser,
  importSource: isNull,
};

/** Drop every key the constructor rebuilds from absence, preserving key order. */
const omitRecipeDefaults = (payload) =>
  omitReconstructibleDefaults(payload, RECIPE_OMITTED_WHEN_DEFAULT);

/** Shared by the recipe-level and step-level emitters, so their group payloads agree. */
function serializeResultGroup(group) {
  const checkOutcomeIds = Array.isArray(group.checkOutcomeIds) ? [...group.checkOutcomeIds] : [];
  return {
    id: group.id,
    name: group.name,
    ...(group.role === 'failure' && { role: 'failure' }),
    ...(checkOutcomeIds.length > 0 && { checkOutcomeIds }),
    results: (group.results || []).map((result) => (result.toJSON ? result.toJSON() : result)),
  };
}

/** A crafting recipe; its Recipe mode (`complex`) is an authoring shape, not a resolution mode. */
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
    // May a player reorder the progressive result stages before the roll is spent down them?
    this.allowPlayerResultReorder =
      data.allowPlayerResultReorder === undefined ? true : data.allowPlayerResultReorder;
    this.locked = data.locked === true;
    this.recipeItemId = data.recipeItemId || null;
    this.linkedRecipeItemUuid = data.linkedRecipeItemUuid || null;
    this.visibility = this._normalizeVisibility(data.visibility);
    // Grants for the Books & Scrolls `restricted` visibility mode.
    this.access = this._normalizeAccess(data.access, data.visibility);

    // At least one set must be satisfied.
    this.ingredientSets = (data.ingredientSets || []).map((s) =>
      s instanceof IngredientSet ? s : IngredientSet.fromJSON(s)
    );
    this.steps = Array.isArray(data.steps)
      ? data.steps.map((step, idx) => this._normalizeStep(step, idx))
      : [];

    this.resultGroups = this._normalizeResultGroups(data);
    this.results = this.resultGroups.flatMap((group) => group.results);

    // Derived from the shape when absent; a reserved `role: 'failure'` group keeps it Simple.
    this.complex = typeof data.complex === 'boolean' ? data.complex : this._deriveComplex(data);

    this.toolIds = this._normalizeToolIds(data.toolIds);

    // The implicit single step's duration.
    this.timeRequirement = this._normalizeTimeRequirement(data.timeRequirement);

    this.isVariable = data.isVariable === undefined ? false : data.isVariable;
    this.transferEffects = data.transferEffects === undefined ? false : data.transferEffects;
    this.outcomeRouting =
      data.outcomeRouting && typeof data.outcomeRouting === 'object'
        ? { ...data.outcomeRouting }
        : null;
    this.resultSelection = this._normalizeResultSelection(data.resultSelection);
    this.checkTierId =
      typeof data.checkTierId === 'string' && data.checkTierId.trim()
        ? data.checkTierId.trim()
        : null;
    this.minSuccessOutcomeId =
      typeof data.minSuccessOutcomeId === 'string' && data.minSuccessOutcomeId.trim()
        ? data.minSuccessOutcomeId.trim()
        : null;
    // Honoured only under the system's `bySubject` combination rule (issues 770, 1055).
    this.craftingModifier = this._normalizeCraftingModifier(data.craftingModifier);
    this.currencyCost = this._normalizeCurrencyCost(data.currencyCost);
    this.teaser = this._normalizeTeaser(data.teaser);

    this.metadata = data.metadata || {
      created: Date.now(),
      modified: Date.now(),
      author: game?.user?.name || 'Unknown',
      version: '1.0.0',
    };

    // The importer's provenance, not a Foundry flag: a reinstall prunes what the pack dropped
    // without touching GM-authored recipes.
    this.importSource = this._normalizeImportSource(data.importSource);
  }

  /** To `{ modifierIds } | null` (issues 770, 1055). */
  _normalizeCraftingModifier(craftingModifier) {
    if (!craftingModifier || typeof craftingModifier !== 'object') return null;
    // The authored-ness of the set is decided HERE, before any filtering.
    if (!Array.isArray(craftingModifier.modifierIds)) return null;
    return authoredCheckModifierIds(craftingModifier.modifierIds, 'modifierIds');
  }

  /** To `{ systemId, importedAt } | null`. */
  _normalizeImportSource(importSource) {
    if (!importSource || typeof importSource !== 'object') return null;
    const systemId = typeof importSource.systemId === 'string' ? importSource.systemId.trim() : '';
    if (!systemId) return null;
    const importedAt = Number(importSource.importedAt);
    return { systemId, importedAt: Number.isFinite(importedAt) ? importedAt : 0 };
  }

  getResultDescription() {
    if (this.resultGroups.length === 0) return 'No result';
    if (this.resultGroups.length === 1 && this.resultGroups[0].results.length === 1) {
      return this.resultGroups[0].results[0].getDescription();
    }
    return `${this.resultGroups.length} result groups`;
  }

  isSimpleRecipe(craftingSystem = null) {
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
      this.ingredientSets.every(
        (set) =>
          !ingredientSetToolsAreActive(craftingSystem, set) || (set.toolIds?.length || 0) === 0
      );
    const hasNoVariableOutput = !this.isVariable;
    const hasNoEffectTransfer = !this.transferEffects;

    return hasSimpleIngredients && hasNoTools && hasNoVariableOutput && hasNoEffectTransfer;
  }

  /**
   * Structure plus completeness (the sets and groups a craft needs). Without `Roll`,
   * `Result.validate` reports nothing about a rolled amount.
   */
  validate({ Roll } = {}) {
    return this._validate({ requireComplete: true, Roll });
  }

  /** Structure only, waiving completeness. */
  validateStructure({ Roll } = {}) {
    return this._validate({ requireComplete: false, Roll });
  }

  _validate({ requireComplete = true, Roll } = {}) {
    // Coded issues (issue 595): a stable `code` plus id-free params and a `location` phrase
    // (`Recipe` or `Step "<label>"`), so the UI localizes every failure without ids. An uncoded
    // string passes through as `{ code: null }`.
    const issues = [];
    const plain = (message) => {
      issues.push({ code: null, params: {}, message });
    };

    if (!this.name) plain('Recipe must have a name');

    const hasSteps = this.steps.length > 0;
    if (requireComplete && !hasSteps && this.ingredientSets.length === 0) {
      plain('Recipe must have at least one ingredient set (or use explicit steps)');
    }

    if (hasSteps) {
      for (const [stepIndex, step] of this.steps.entries()) {
        const stepLabel = this._entityLabel(step, stepIndex);
        if (
          requireComplete &&
          (!Array.isArray(step.ingredientSets) || step.ingredientSets.length === 0)
        ) {
          issues.push(buildRecipeActivationIssue('stepMissingIngredientSet', { step: stepLabel }));
        }
        if (
          requireComplete &&
          (!Array.isArray(step.resultGroups) || step.resultGroups.length === 0)
        ) {
          issues.push(buildRecipeActivationIssue('stepMissingResultGroup', { step: stepLabel }));
        }
        this._validateTimeRequirement(step.timeRequirement, `Step "${stepLabel}"`, issues);
      }
    } else {
      this._validateTimeRequirement(this.timeRequirement, 'Recipe', issues);
      for (const [setIndex, ingredientSet] of this.ingredientSets.entries()) {
        const setValidation = ingredientSet.validate({ requireComplete });
        if (!setValidation.valid) {
          issues.push(
            buildRecipeActivationIssue('ingredientSetInvalid', {
              set: this._entityLabel(ingredientSet, setIndex),
              detail: setValidation.errors.join(', '),
            })
          );
        }
      }
    }

    if (requireComplete && !hasSteps && this.resultGroups.length === 0) {
      plain('Recipe must have at least one result group');
    }

    for (const container of this._resultContainers()) {
      this._validateResultGroups(container.resultGroups, container.location, issues, {
        requireComplete,
        requireResults: container.requireResults,
        Roll,
      });
      this._validateRoutedResultSelection(
        container.resultSelection,
        container.resultGroups,
        issues,
        { requireComplete }
      );
    }

    const resultGroupIds = new Set(this.resultGroups.map((group) => group.id));
    const resultIds = new Set(
      this.resultGroups.flatMap((group) => (group.results || []).map((result) => result.id))
    );
    const routableResultGroupIds = hasSteps
      ? new Set(this.steps.flatMap((step) => (step.resultGroups || []).map((group) => group.id)))
      : resultGroupIds;

    if (this.isVariable) {
      for (const [setIndex, ingredientSet] of this.ingredientSets.entries()) {
        for (const mappingId of ingredientSet.resultMapping) {
          const valid = resultGroupIds.has(mappingId) || resultIds.has(mappingId);
          if (!valid) {
            issues.push(
              buildRecipeActivationIssue('ingredientSetInvalidResultMapping', {
                set: this._entityLabel(ingredientSet, setIndex),
              })
            );
          }
        }
      }
    }

    if (this.outcomeRouting && typeof this.outcomeRouting === 'object') {
      for (const [outcome, resultGroupId] of Object.entries(this.outcomeRouting)) {
        if (resultGroupId && !routableResultGroupIds.has(resultGroupId)) {
          // `outcome` is an authored keyword; the dangling group id is not echoed.
          issues.push(buildRecipeActivationIssue('outcomeRoutingInvalidResultGroup', { outcome }));
        }
      }
    }

    return {
      valid: issues.length === 0,
      errors: issues.map((issue) => issue.message),
      issues,
    };
  }

  /** The authored `name`, else a 1-based position (issue 595). */
  _entityLabel(entity, index) {
    const name = typeof entity?.name === 'string' ? entity.name.trim() : '';
    return name || String(index + 1);
  }

  /**
   * One result-validation scope per step, or a single `Recipe` scope when there are none.
   * `requireResults` marks the terminal scope, the only one that must award something (issue 1907).
   */
  _resultContainers() {
    const { resultGroups, resultSelection } = this;
    if (this.steps.length === 0) {
      return [{ location: 'Recipe', resultGroups, resultSelection, requireResults: true }];
    }
    return this.steps.map((step, stepIndex) => ({
      location: `Step "${this._entityLabel(step, stepIndex)}"`,
      resultGroups: Array.isArray(step.resultGroups) ? step.resultGroups : [],
      resultSelection: step.resultSelection || this.resultSelection,
      requireResults: stepIndex === this.steps.length - 1,
    }));
  }

  /** Unique ids, non-empty contents and valid results, per `requireResults` (issue 1907). */
  _validateResultGroups(
    resultGroups,
    location,
    issues,
    { requireComplete = true, requireResults = true, Roll } = {}
  ) {
    const resultGroupIds = new Set();
    const resultIds = new Set();
    for (const [groupIndex, group] of resultGroups.entries()) {
      const groupLabel = this._entityLabel(group, groupIndex);
      if (resultGroupIds.has(group.id)) {
        issues.push(
          buildRecipeActivationIssue('resultGroupDuplicate', { location, group: groupLabel })
        );
      }
      resultGroupIds.add(group.id);
      if (!Array.isArray(group.results) || group.results.length === 0) {
        // Exempt: the alchemy Simple failure group (`role: 'failure'`, issue 554) and any group
        // on a non-terminal step (issue 1907).
        if (requireComplete && requireResults && group.role !== 'failure') {
          issues.push(
            buildRecipeActivationIssue('resultGroupEmpty', { location, group: groupLabel })
          );
        }
        continue;
      }

      for (const [resultIndex, result] of group.results.entries()) {
        const resultLabel = this._entityLabel(result, resultIndex);
        if (resultIds.has(result.id)) {
          issues.push(
            buildRecipeActivationIssue('resultDuplicate', { location, result: resultLabel })
          );
        }
        resultIds.add(result.id);

        const resultValidation = result.validate({ Roll });
        if (!resultValidation.valid) {
          issues.push(
            buildRecipeActivationIssue('resultInvalid', {
              location,
              result: resultLabel,
              detail: resultValidation.errors.join(', '),
            })
          );
        }
      }
    }
  }

  /** Validate a legacy `resultSelection` and its `ResultGroup` names. */
  _validateRoutedResultSelection(
    resultSelection,
    resultGroups,
    issues,
    { requireComplete = true } = {}
  ) {
    if (!requireComplete) return;
    const provider = resultSelection?.provider;
    // Only a legacy provider routes by ResultGroup.name; no current mode has one (issue 554).
    if (!['ingredientSet', 'check'].includes(provider)) return;

    // The shared keyword set, so the model and ResolutionModeService never drift.
    const seenNames = new Set();
    for (const group of resultGroups || []) {
      const normalized = normalizeRoutedName(group?.name);
      if (!normalized) continue;
      if (seenNames.has(normalized)) {
        issues.push({
          code: null,
          params: {},
          message: `Duplicate result group name "${group.name}" (case-insensitive) — routed mode requires unique names`,
        });
      }
      seenNames.add(normalized);
      if (isReservedRoutedName(normalized)) {
        issues.push({
          code: null,
          params: {},
          message: `Result group name "${group.name}" conflicts with reserved routing keyword`,
        });
      }
    }
  }

  toJSON() {
    return omitRecipeDefaults({
      id: this.id,
      name: this.name,
      description: this.description,
      img: this.img,
      category: this.category,
      craftingSystemId: this.craftingSystemId,
      system: this.system,
      tags: this.tags,
      enabled: this.enabled,
      allowPlayerResultReorder: this.allowPlayerResultReorder,
      locked: this.locked,
      recipeItemId: this.recipeItemId,
      linkedRecipeItemUuid: this.linkedRecipeItemUuid,
      visibility: this.visibility,
      access: {
        characterIds: [...this.access.characterIds],
        playerIds: [...this.access.playerIds],
      },
      complex: this.complex,
      steps: this.steps.map((step) => ({
        ...step,
        ingredientSets: (step.ingredientSets || []).map((set) => (set.toJSON ? set.toJSON() : set)),
        resultGroups: (step.resultGroups || []).map(serializeResultGroup),
        toolIds: Array.isArray(step.toolIds) ? [...step.toolIds] : [],
      })),
      ingredientSets: this.ingredientSets.map((s) => s.toJSON()),
      resultGroups: this.resultGroups.map(serializeResultGroup),
      toolIds: [...this.toolIds],
      timeRequirement: this.timeRequirement,
      isVariable: this.isVariable,
      transferEffects: this.transferEffects,
      outcomeRouting: this.outcomeRouting,
      resultSelection: this.resultSelection,
      checkTierId: this.checkTierId,
      minSuccessOutcomeId: this.minSuccessOutcomeId,
      craftingModifier: this.craftingModifier,
      currencyCost: this.currencyCost,
      teaser: this.teaser,
      metadata: this.metadata,
      importSource: this.importSource,
    });
  }

  static fromJSON(data) {
    return new Recipe(data);
  }

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

  _deriveComplex(data = {}) {
    const scopeHasFailureGroup = (scope) =>
      (Array.isArray(scope?.resultGroups) ? scope.resultGroups : []).some(
        (group) => group?.role === 'failure'
      );
    const steps = Array.isArray(data.steps) ? data.steps : [];
    if (scopeHasFailureGroup(data) || steps.some((step) => scopeHasFailureGroup(step))) {
      return false;
    }
    const scopeIsComplex = (scope) => {
      const ingredientSets = Array.isArray(scope?.ingredientSets) ? scope.ingredientSets : [];
      const resultGroups = Array.isArray(scope?.resultGroups) ? scope.resultGroups : [];
      return ingredientSets.length > 1 || resultGroups.length > 1;
    };
    if (scopeIsComplex(data)) return true;
    return steps.some((step) => scopeIsComplex(step));
  }

  _normalizeResultSelection(resultSelection) {
    if (!resultSelection || typeof resultSelection !== 'object') return null;
    // Retired per recipe (issue 554): no live mode carries a `resultSelection`, so this only
    // round-trips a legacy `ingredientSet` or `check` provider.
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
        // `'failure'` marks the alchemy Simple failure group; anything else is success.
        ...(group?.role === 'failure' && { role: 'failure' }),
        // The routed-check outcome tiers that produce this group.
        checkOutcomeIds: this._normalizeIdList(group?.checkOutcomeIds),
        results: (group?.results || []).map((r) => (r instanceof Result ? r : Result.fromJSON(r))),
      }));
    }

    // PERMANENT INBOUND SHIM — do not remove with a "the alias is gone" cleanup.
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

  _normalizeIdList(value, { stringsOnly = false } = {}) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const out = [];
    for (const raw of value) {
      if (stringsOnly && typeof raw !== 'string') continue;
      const id = String(raw ?? '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  /** To `{ characterIds, playerIds }`, deduped non-empty strings. */
  _normalizeAccess(access, visibility) {
    const source = access && typeof access === 'object' ? access : {};
    const characterIds = this._normalizeIdList(source.characterIds, { stringsOnly: true });
    let playerIds = this._normalizeIdList(source.playerIds, { stringsOnly: true });
    if (characterIds.length === 0 && playerIds.length === 0) {
      playerIds = this._normalizeIdList(visibility?.allowedUserIds, { stringsOnly: true });
    }
    return { characterIds, playerIds };
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

  /** Every present unit must be a finite, non-negative number. */
  _validateTimeRequirement(timeRequirement, location, issues) {
    if (!timeRequirement) return;
    for (const unit of ['minutes', 'hours', 'days', 'months', 'years']) {
      const value = Number(timeRequirement?.[unit] || 0);
      if (!Number.isFinite(value) || value < 0) {
        // `location` is a pre-composed, id-free context phrase (issue 595).
        issues.push(buildRecipeActivationIssue('timeRequirementInvalid', { location, unit }));
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
        hiddenFields: [...DEFAULT_TEASER_HIDDEN_FIELDS],
        revealThreshold: 100,
        teaserDescription: '',
      };
    }
    const VALID_FIELDS = ['ingredients', 'results', 'description', 'tools', 'essences'];
    return {
      enabled: teaser.enabled !== false,
      hiddenFields: Array.isArray(teaser.hiddenFields)
        ? teaser.hiddenFields.filter((f) => VALID_FIELDS.includes(f))
        : [...DEFAULT_TEASER_HIDDEN_FIELDS],
      revealThreshold: Math.min(100, Math.max(0, Number(teaser.revealThreshold) || 100)),
      teaserDescription: String(teaser.teaserDescription || '').trim(),
    };
  }

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
