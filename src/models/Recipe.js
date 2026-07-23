import { buildRecipeActivationIssue } from '../utils/recipeActivationMessages.js';
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
    // GM-authored policy: may a player reorder this recipe's progressive result stages
    // before the check roll is spent down them? Defaults TRUE (issue 651) — an absent
    // key reads as `true`, which is why the 1.17.0 migration does not seed it. Follows
    // the `enabled` default-true idiom above.
    this.allowPlayerResultReorder =
      data.allowPlayerResultReorder === undefined ? true : data.allowPlayerResultReorder;
    this.locked = data.locked === true;
    this.recipeItemId = data.recipeItemId || null;
    this.linkedRecipeItemUuid = data.linkedRecipeItemUuid || null;
    this.visibility = this._normalizeVisibility(data.visibility);
    // Per-recipe access grants (Books & Scrolls `restricted` visibility mode):
    // which specific characters and players may see/read this recipe. Runtime
    // enforcement reads this in restricted mode. Read-forward seeds player grants
    // from the legacy `visibility.allowedUserIds` when no explicit grant exists.
    this.access = this._normalizeAccess(data.access, data.visibility);

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
    // Optional reference to a fixed-type routed check's success outcome tier (its
    // id). When set, a craft whose rolled tier ranks below this tier fails outright,
    // letting recipes on a shared fixed check carry different difficulty. Null/unknown
    // ids impose no override (outcome = the tier actually rolled) at resolution time.
    this.minSuccessOutcomeId =
      typeof data.minSuccessOutcomeId === 'string' && data.minSuccessOutcomeId.trim()
        ? data.minSuccessOutcomeId.trim()
        : null;
    // Optional per-recipe crafting-check modifier override (issue 770). Absent → the
    // recipe inherits the system's default policy + default eligible modifier ids.
    // Present → overrides the policy and/or the eligible id subset resolved into the
    // `@craftingmod` formula placeholder. Unknown catalogue ids are dropped at
    // resolution time (the resolver validates against the system catalogue), so this
    // normalizer only shape-guards; a malformed value becomes null (inherit).
    this.craftingModifier = this._normalizeCraftingModifier(data.craftingModifier);
    this.currencyCost = this._normalizeCurrencyCost(data.currencyCost);
    this.teaser = this._normalizeTeaser(data.teaser);

    // Metadata
    this.metadata = data.metadata || {
      created: Date.now(),
      modified: Date.now(),
      author: game?.user?.name || 'Unknown',
      version: '1.0.0',
    };

    // Durable settings-payload provenance stamped by the compendium importer (NOT a
    // Foundry flag): identifies the source pack so a later reinstall can prune the
    // recipes the pack dropped WITHOUT touching GM-authored recipes. Normalized to
    // object-or-`null` — a malformed value (a string, or a partial object missing a
    // `systemId`) becomes `null` — so a hand-authored recipe round-trips as `null` and
    // the never-prune guard for GM-authored recipes is a structural absence enforced
    // here at the normalizer, not at a UI control.
    this.importSource = this._normalizeImportSource(data.importSource);
  }

  /**
   * Normalize the optional per-recipe crafting-check modifier override (issue 770) to
   * `{ policy?, modifierIds? } | null`. A non-object, or an object that carries neither
   * a known policy nor a non-empty `modifierIds` array, normalizes to `null` (inherit
   * the system default). `policy` keeps only the four known values (`addAll`,
   * `highest`, `byRecipe`, `playerPicks`); an unknown/absent policy is dropped. `modifierIds` keeps
   * only non-empty string ids, de-duplicated in order; catalogue membership is NOT
   * checked here (the resolver drops unknown ids against the live system catalogue).
   * @param {unknown} craftingModifier
   * @returns {{ policy?: string, modifierIds?: string[] } | null}
   * @private
   */
  _normalizeCraftingModifier(craftingModifier) {
    if (!craftingModifier || typeof craftingModifier !== 'object') return null;
    const validPolicies = ['addAll', 'highest', 'byRecipe', 'playerPicks'];
    const policy = validPolicies.includes(craftingModifier.policy) ? craftingModifier.policy : null;
    const seen = new Set();
    const modifierIds = (
      Array.isArray(craftingModifier.modifierIds) ? craftingModifier.modifierIds : []
    ).filter((id) => {
      if (typeof id !== 'string' || id.trim() === '' || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    // Neither a policy override nor an id subset → nothing to override, so inherit.
    if (!policy && modifierIds.length === 0) return null;
    const normalized = {};
    if (policy) normalized.policy = policy;
    if (modifierIds.length > 0) normalized.modifierIds = modifierIds;
    return normalized;
  }

  /**
   * Normalize durable import provenance to `{ systemId, importedAt } | null`. Any
   * malformed value — a non-object, or an object missing a non-empty string
   * `systemId` — normalizes to `null`, so the never-prune guard for a GM-authored
   * recipe is the structural absence of provenance. `importedAt` coerces to a finite
   * number (0 when absent/invalid).
   * @param {unknown} importSource
   * @returns {{ systemId: string, importedAt: number } | null}
   * @private
   */
  _normalizeImportSource(importSource) {
    if (!importSource || typeof importSource !== 'object') return null;
    const systemId = typeof importSource.systemId === 'string' ? importSource.systemId.trim() : '';
    if (!systemId) return null;
    const importedAt = Number(importSource.importedAt);
    return { systemId, importedAt: Number.isFinite(importedAt) ? importedAt : 0 };
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
    // Structured, coded issues (issue 595): each carries a stable `code` + id-free
    // params (step/set/result-group/result label as name-or-1-based-position, and a
    // pre-composed `location` context phrase — `Recipe` or `Step "<label>"`), so the
    // UI can localize every structural failure id-free. `errors` is derived from the
    // issue messages; NAMED entities keep the pre-fix English wording. UNCODED plain
    // strings (those that never carried an id) pass through as `{ code: null }`.
    const issues = [];
    const plain = (message) => {
      issues.push({ code: null, params: {}, message });
    };

    // Basic validation
    if (!this.name) plain('Recipe must have a name');

    // Ingredient set validation
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

    // Result validation. Explicit multi-step recipes own their outputs on each step;
    // implicit recipes still use the top-level result groups.
    if (requireComplete && !hasSteps && this.resultGroups.length === 0) {
      plain('Recipe must have at least one result group');
    }

    const resultContainers = hasSteps
      ? this.steps.map((step, stepIndex) => ({
          location: `Step "${this._entityLabel(step, stepIndex)}"`,
          resultGroups: Array.isArray(step.resultGroups) ? step.resultGroups : [],
          resultSelection: step.resultSelection || this.resultSelection,
        }))
      : [
          {
            location: 'Recipe',
            resultGroups: this.resultGroups,
            resultSelection: this.resultSelection,
          },
        ];

    for (const container of resultContainers) {
      this._validateResultGroups(container.resultGroups, container.location, issues, {
        requireComplete,
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

    // Variable recipe validation. Name the SOURCE set by name-or-position and
    // describe the target as a missing mapping — never echo the dangling id (595).
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
          // `outcome` is an authored routing keyword, not an id; the dangling group
          // id is dropped rather than echoed.
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

  /**
   * A human-readable label for a step / ingredient set / result group / result —
   * the author-given `name` when present, otherwise a 1-based POSITION (issue 595).
   * Never the entity's internal id, so a validation message cannot leak one.
   * @param {{name?: string}} entity
   * @param {number} index 0-based index of the entity in its collection
   * @returns {string}
   * @private
   */
  _entityLabel(entity, index) {
    const name = typeof entity?.name === 'string' ? entity.name.trim() : '';
    return name || String(index + 1);
  }

  _validateResultGroups(resultGroups, location, issues, { requireComplete = true } = {}) {
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
        // The reserved alchemy Simple failure group (`role: 'failure'`) is
        // empty-by-default and legitimately produces nothing on a failed check, so
        // an empty one is NOT a completeness error (issue 554). Every other empty
        // group still blocks craftability under requireComplete.
        if (requireComplete && group.role !== 'failure') {
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

        const resultValidation = result.validate();
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

  /**
   * Validate a legacy `resultSelection` and its `ResultGroup` names.
   *
   * The per-recipe `resultSelection.provider` is RETIRED (issue 554): alchemy
   * routing moved to the system-level `alchemy.checkMode`, and no live resolution
   * mode reads a provider. This path is now inert for current data — the migration
   * strips `resultSelection` from alchemy recipes, so `provider` is absent and the
   * guard below early-returns. It is retained only so a legacy recipe still carrying
   * a stray provider before migration round-trips without a spurious name error.
   * Tiered alchemy's `ResultGroup.name` uniqueness now lives in the service layer.
   *
   * Under a legacy provider, `ResultGroup.name` must be unique under
   * trim+lowercase comparison and must not collide with a reserved routing
   * keyword (the fail/miss/hazard families in `routedOutcomeKeywords.js`). The
   * shared keyword set keeps this in lockstep with the runtime resolution path in
   * `ResolutionModeService`.
   *
   * @param {{provider?: string}} resultSelection
   * @param {Array<{id?: string, name?: string}>} resultGroups
   * @param {Array<{code: string|null, params: object, message: string}>} issues push-target
   * @param {{requireComplete?: boolean}} [options] When `requireComplete` is false
   *   (structural-only validation / the persistence gate) the name check is waived.
   *   The model is mode-unaware, so a routed-mode recipe carrying a STRAY leftover
   *   `resultSelection.provider` (routed modes ignore `resultSelection`) must not
   *   block persistence with a name error; full `validate()` still flags genuine
   *   alchemy name collisions.
   */
  _validateRoutedResultSelection(
    resultSelection,
    resultGroups,
    issues,
    { requireComplete = true } = {}
  ) {
    if (!requireComplete) return;
    const provider = resultSelection?.provider;
    // Only a legacy provider routes by ResultGroup.name; a recipe with no
    // resultSelection (every current mode after issue 554) is unaffected.
    if (!['ingredientSet', 'check'].includes(provider)) return;

    // Reserved + unique ResultGroup.name rules apply under a legacy provider
    // (spec 004 §routedByCheck Validation), using the shared keyword set so the
    // model and ResolutionModeService never drift. These key on the authored group
    // NAME, so they carry no id — pushed as uncoded issues (id-free passthrough).
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
        resultGroups: (step.resultGroups || []).map((group) => ({
          id: group.id,
          name: group.name,
          ...(group.role === 'failure' && { role: 'failure' }),
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
        ...(group.role === 'failure' && { role: 'failure' }),
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
      minSuccessOutcomeId: this.minSuccessOutcomeId,
      craftingModifier: this.craftingModifier,
      currencyCost: this.currencyCost,
      teaser: this.teaser,
      metadata: this.metadata,
      importSource: this.importSource,
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
   *
   * NEVER fires for an alchemy recipe (data-models spec): alchemy authoring is
   * decoupled from the single `complex` flag and forces a single ingredient set. The
   * model is mode-unaware, so alchemy is detected via its signature — a reserved
   * `role: 'failure'` result group (Simple), which no other mode carries. A
   * migration-seeded two-group Simple recipe therefore reads Complex=false, not true.
   * @param {object} data - Raw recipe construction data.
   * @returns {boolean}
   * @private
   */
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
    // `ingredientSet` and `check` are the only providers still recognised here, but
    // the per-recipe provider is RETIRED (issue 554): alchemy routing moved to the
    // system-level `alchemy.checkMode` and the routed crafting modes derive their
    // basis from the system mode, so no live mode carries a `resultSelection`. This
    // normalizer survives only to round-trip a legacy provider until migration
    // strips it. The legacy
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
        // Reserved role discriminator for the alchemy Simple failure result group
        // (`'failure'`; absent/other = success). Simple-only — the recipe editor +
        // service layer forbid it on None/Tiered groups. Preserved verbatim so a
        // settings-only mode flip round-trips it; the runtime reads it in
        // `ResolutionModeService._resolveAlchemyResultGroups`.
        ...(group?.role === 'failure' && { role: 'failure' }),
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
   * @param {{stringsOnly?: boolean}} [options] When `stringsOnly` is true,
   *   non-string entries are ignored rather than coerced (used by access grants,
   *   whose ids are always authored as strings).
   * @returns {string[]}
   */
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

  /**
   * Normalize per-recipe access grants into `{ characterIds, playerIds }`, each a
   * deduped array of non-empty id strings (non-strings are ignored). When the
   * access grant is absent or fully empty, player grants are read-forward from the
   * legacy `visibility.allowedUserIds` (pre-access recipes stored granted users
   * there), so restricted-mode enforcement keeps showing the recipe to the same
   * players after the runtime switches to reading `access`.
   * @param {unknown} access
   * @param {unknown} visibility
   * @returns {{characterIds: string[], playerIds: string[]}}
   */
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

  /**
   * Validate a step/recipe time requirement: every present unit must be a
   * finite, non-negative number. A nullish requirement is valid (no duration).
   * @param {object|null} timeRequirement
   * @param {string} label - Prefix for any error message (e.g. `Step "Forge"`).
   * @param {string[]} errors - Accumulator the caller owns.
   * @private
   */
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
