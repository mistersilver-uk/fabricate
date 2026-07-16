/**
 * CraftingListingBuilder — player-facing recipe listing / view-model construction
 * for the unified-window Crafting tab.
 *
 * This mirrors {@link GatheringListingBuilder}: a one-directional read-side
 * collaborator that projects the existing crafting backend
 * (`RecipeManager` / `RecipeVisibilityService` / `ResolutionModeService` /
 * `CraftingSystemManager`) into redaction-safe `RecipeListingModel`s for the UI.
 * It NEVER mutates state and NEVER imports Foundry runtime globals — every
 * Foundry-facing read flows through its injected collaborators (the same
 * collaborators the GM crafting flow already uses), so GM and player viewers
 * resolve through one code path and a GM bypass is honoured everywhere the
 * visibility service honours it.
 *
 * The builder only projects recipes the visibility service marks
 * `access.visible === true`. For an undiscovered teaser recipe shown to a non-GM
 * viewer (`access.reason === 'teaser'`) it redacts every field named in
 * `teaserState.hiddenFields`, surfacing only a generic name/img and a `discovery`
 * browse status so no ingredient/result/check detail leaks.
 */

import { progressiveStageThresholds } from '../utils/progressiveStageThresholds.js';
import { normalizeRecipeCategory, getRecipeCategoryLabel } from '../utils/recipeCategories.js';

/**
 * Resolution-mode → localization key map. Kept in lockstep with the GM manager's
 * private map in `adminStore.js`; the builder owns its own copy so the systems
 * layer never imports the Svelte store. `modeLabel` is always produced through
 * this map — a raw mode token is never surfaced to the UI.
 * @type {Record<string, string>}
 */
const RESOLUTION_MODE_LABEL_KEYS = {
  simple: 'FABRICATE.Admin.SystemSettings.ResolutionSimple',
  routedByIngredients: 'FABRICATE.Admin.SystemSettings.ResolutionRoutedByIngredients',
  routedByCheck: 'FABRICATE.Admin.SystemSettings.ResolutionRoutedByCheck',
  progressive: 'FABRICATE.Admin.SystemSettings.ResolutionProgressive',
  alchemy: 'FABRICATE.Admin.SystemSettings.ResolutionAlchemy',
};

/**
 * The browse-status vocabulary the player Crafting list keys its callout on.
 * `incomplete` is intentionally absent — a recipe is either visible (and thus
 * projected) or filtered out upstream by the visibility service.
 */
export const CRAFTING_BROWSE_STATUS = Object.freeze({
  AVAILABLE: 'available',
  LOCKED: 'locked',
  UNKNOWN: 'unknown',
  EXHAUSTED: 'exhausted',
  MISSING_MATERIALS: 'missingMaterials',
  DISCOVERY: 'discovery',
});

/**
 * Localization keys for a recipe's primary blocking reason, keyed by browse
 * status. `available` has no blocking reason.
 */
const BLOCKING_REASON_KEYS = {
  [CRAFTING_BROWSE_STATUS.LOCKED]: 'FABRICATE.App.Crafting.Blocking.Locked',
  [CRAFTING_BROWSE_STATUS.UNKNOWN]: 'FABRICATE.App.Crafting.Blocking.Unknown',
  [CRAFTING_BROWSE_STATUS.EXHAUSTED]: 'FABRICATE.App.Crafting.Blocking.Exhausted',
  [CRAFTING_BROWSE_STATUS.DISCOVERY]: 'FABRICATE.App.Crafting.Blocking.Discovery',
  [CRAFTING_BROWSE_STATUS.MISSING_MATERIALS]: 'FABRICATE.App.Crafting.Blocking.MissingMaterials',
};

const DEFAULT_TEASER_HIDDEN_FIELDS = ['ingredients', 'results', 'description'];
const UNKNOWN_COMPONENT_KEY = 'FABRICATE.Labels.UnknownComponent';

/**
 * Non-alchemy modes whose crafting check is mandatory (the attempt fails without an
 * authored roll formula): only routedByCheck and progressive. Simple and
 * routedByIngredients treat the crafting check as an optional pass/fail layer backed
 * by the shared `craftingCheck.simple` slot. Alchemy check-ness is NOT in this set —
 * it is driven by the system-level `alchemy.checkMode` (simple/tiered mandatory,
 * none has no check), handled separately in `_buildCheck`.
 */
const MANDATORY_CHECK_MODES = new Set(['routedByCheck', 'progressive']);

function stringOrEmpty(value) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function stringOrNull(value) {
  const out = stringOrEmpty(value);
  return out.length > 0 ? out : null;
}

function actorKey(actor) {
  return actor?.id ?? actor?.uuid ?? null;
}

export class CraftingListingBuilder {
  /**
   * @param {object} deps
   * @param {object} deps.recipeManager - Source of recipes + `evaluateCraftability`.
   * @param {object} deps.recipeVisibility - `RecipeVisibilityService` (visibility/knowledge/teaser).
   * @param {object} deps.resolutionModeService - `ResolutionModeService` (mode + result routing).
   * @param {object} deps.craftingSystemManager - System/component library reads.
   * @param {Function} [deps.getViewer] - Fallback viewer accessor when `buildListing` omits one.
   * @param {Function} [deps.localize] - `(key, data?) => string`.
   * @param {Function} [deps.nowWorldTime] - `() => number` current world time.
   * @param {Function} [deps.isSystemBlockedForRecipes] - `(systemId) => boolean`; a blocked
   *   system exposes no recipes to a non-GM viewer. Defaults to never-blocked.
   */
  constructor({
    recipeManager = null,
    recipeVisibility = null,
    resolutionModeService = null,
    craftingSystemManager = null,
    getViewer = null,
    localize = (key) => key,
    nowWorldTime = () => 0,
    isSystemBlockedForRecipes = null,
    resolveCheckFormula = null,
  } = {}) {
    this.recipeManager = recipeManager;
    this.recipeVisibility = recipeVisibility;
    this.resolutionModeService = resolutionModeService;
    this.craftingSystemManager = craftingSystemManager;
    this._getViewer = typeof getViewer === 'function' ? getViewer : null;
    this.localize = typeof localize === 'function' ? localize : (key) => key;
    this._nowWorldTime = typeof nowWorldTime === 'function' ? nowWorldTime : () => 0;
    this._isSystemBlockedForRecipes =
      typeof isSystemBlockedForRecipes === 'function' ? isSystemBlockedForRecipes : () => false;
    // Injected so the builder stays free of Foundry's `Roll` global; wired to
    // resolveCheckFormulaDisplay in main.js. Default no-op → resolvedFormula null.
    this._resolveCheckFormula =
      typeof resolveCheckFormula === 'function' ? resolveCheckFormula : () => null;
  }

  /**
   * Build the player Crafting listing for one crafting actor and a set of
   * component-source actors.
   *
   * @param {object} options
   * @param {object|null} options.craftingActor - The acting character.
   * @param {object[]} [options.componentSourceActors] - Additional inventory sources.
   * @param {object|null} [options.viewer] - Foundry user; falls back to `getViewer()`.
   * @returns {{
   *   selectedActorId: string|null,
   *   actor: object|null,
   *   componentSourceIds: Array<string|null>,
   *   worldTime: number,
   *   recipes: object[],
   *   counts: { available: number, total: number }
   * }}
   */
  buildListing({ craftingActor = null, componentSourceActors = [], viewer = null } = {}) {
    const resolvedViewer = viewer ?? this._getViewer?.() ?? null;
    const isGM = resolvedViewer?.isGM === true;
    const knowledgeSources = Array.isArray(componentSourceActors)
      ? componentSourceActors.filter(Boolean)
      : [];
    const craftSources = this._dedupeActors([craftingActor, ...knowledgeSources]);

    const visibleEntries =
      this.recipeVisibility?.getVisibleRecipes?.({
        viewer: resolvedViewer,
        craftingActor,
        componentSourceActors: knowledgeSources,
      }) ?? [];

    const recipes = [];
    for (const entry of visibleEntries) {
      const recipe = entry?.recipe;
      if (!recipe) continue;
      if (!isGM && this._isSystemBlockedForRecipes(recipe.craftingSystemId)) continue;
      recipes.push(
        this._buildRecipeModel({
          recipe,
          access: entry.access ?? {},
          isGM,
          craftingActor,
          craftSources,
          knowledgeSources,
        })
      );
    }

    const available = recipes.filter(
      (recipe) => recipe.browseStatus === CRAFTING_BROWSE_STATUS.AVAILABLE
    ).length;

    return {
      selectedActorId: actorKey(craftingActor),
      actor: craftingActor ?? null,
      componentSourceIds: craftSources.map(actorKey),
      worldTime: Number(this._nowWorldTime() || 0),
      recipes,
      counts: { available, total: recipes.length },
    };
  }

  _dedupeActors(actors) {
    const seen = new Set();
    const out = [];
    for (const actor of actors) {
      if (!actor) continue;
      const key = actorKey(actor);
      if (key != null && seen.has(key)) continue;
      if (key != null) seen.add(key);
      out.push(actor);
    }
    return out;
  }

  /**
   * Project a single visible recipe into its `RecipeListingModel`.
   * @private
   */
  _buildRecipeModel({ recipe, access, isGM, craftingActor, craftSources, knowledgeSources }) {
    const system = this.craftingSystemManager?.getSystem?.(recipe.craftingSystemId) ?? null;
    const mode = stringOrEmpty(system?.resolutionMode) || 'simple';
    const modeLabel = this.localize(
      RESOLUTION_MODE_LABEL_KEYS[mode] ?? RESOLUTION_MODE_LABEL_KEYS.simple
    );

    const reason = stringOrEmpty(access?.reason);
    const redacted = !isGM && reason === 'teaser';
    const hiddenFields = redacted
      ? Array.isArray(access?.teaserState?.hiddenFields)
        ? access.teaserState.hiddenFields
        : DEFAULT_TEASER_HIDDEN_FIELDS
      : [];
    const hidden = new Set(hiddenFields);

    // Match the GM Manager's icon precedence (recipeItemImg || img || default): a recipe
    // whose icon lives on a linked recipe item keeps the default `recipe.img`, so resolve
    // the linked item definition's image the same way adminStore does. `recipe.img` is
    // itself model-defaulted to DEFAULT_RECIPE_IMAGE, so it already supplies the Manager's
    // trailing default fallback without importing the heavy models/Recipe.js graph here.
    // Skip the resolved item image for a redacted teaser so an undiscovered recipe's item
    // icon never leaks.
    const recipeItemImg = recipe.recipeItemId
      ? this.craftingSystemManager?.getRecipeItemDefinition?.(
          recipe.craftingSystemId,
          recipe.recipeItemId
        )?.img || ''
      : '';

    const base = {
      id: stringOrNull(recipe.id),
      name: stringOrEmpty(recipe.name),
      img: stringOrNull(redacted ? recipe.img : recipeItemImg || recipe.img),
      systemId: stringOrNull(recipe.craftingSystemId),
      systemName: stringOrEmpty(system?.name),
      // GM-authored grouping metadata. `category` is the raw normalized token
      // (the filter-match key; the reserved `general` for the default bucket);
      // `categoryLabel` is its display string — `general` localizes to
      // FABRICATE.Common.General while a custom token is surfaced verbatim.
      // Both ride on `base` so the redacted teaser model inherits them via
      // `...base` (category is grouping metadata, not a redacted spoiler field).
      category: normalizeRecipeCategory(recipe.category),
      categoryLabel: getRecipeCategoryLabel(recipe.category, this.localize),
      modeToken: mode,
      modeLabel,
      redaction: { redacted, hiddenFields },
    };

    if (redacted) {
      return this._buildTeaserModel({ base, recipe, system, mode, hidden });
    }

    // Per-set craftability (essences + per-set tools + actor-bound currency probe
    // all folded in by evaluateCraftability's per-set pass).
    const ingredientSets = recipe.ingredientSets.map((set, idx) => ({
      id: stringOrNull(set.id),
      label:
        stringOrEmpty(set.name) ||
        this.localize('FABRICATE.App.Crafting.IngredientSetFallback', {
          index: idx + 1,
        }),
      craftability: this._evaluateSet({ recipe, set, craftSources, craftingActor }),
      // The products this set routes to (routed-by-ingredients). Empty for
      // routedByCheck, whose output is per outcome tier, not per set.
      products: mode === 'routedByCheck' ? [] : this._productsForSet({ recipe, system, set }),
    }));

    const fullCraftability =
      this.recipeManager?.evaluateCraftability?.(craftSources, recipe, { craftingActor }) ?? null;
    const canCraftMaterials = fullCraftability?.canCraft === true;
    const defaultSetId =
      stringOrNull(fullCraftability?.satisfiableSet?.id) ??
      stringOrNull(recipe.ingredientSets?.[0]?.id);
    const defaultSet =
      recipe.ingredientSets.find((set) => stringOrNull(set.id) === defaultSetId) ??
      recipe.ingredientSets?.[0] ??
      null;

    const exhausted =
      !isGM &&
      this.recipeVisibility?.isKnowledgeItemExhausted?.({
        recipe,
        craftingActor,
        componentSourceActors: knowledgeSources,
      }) === true;

    const browseStatus = this._deriveBrowseStatus({ reason, canCraftMaterials, exhausted });
    const blockingReasons = this._blockingReasons(browseStatus);

    return {
      ...base,
      flavor: stringOrEmpty(recipe.description),
      browseStatus,
      blockingReasons,
      ingredientSets,
      defaultSetId,
      check: this._buildCheck(system, mode, craftingActor),
      outcomeTiers: this._buildOutcomeTiers({ recipe, system, mode }),
      result: this._buildResult({ recipe, system, mode, defaultSet }),
      // The ordered stage list (progressive only; [] otherwise) — the F1 fix.
      progressiveStages: this._buildProgressiveStages({ recipe, system, mode }),
      // GM policy: may this player reorder the stages? Default true (issue 651).
      allowPlayerResultReorder: recipe.allowPlayerResultReorder !== false,
    };
  }

  /**
   * Redacted teaser projection: generic identity + `discovery` status only. Each
   * hidden field is dropped wholesale so no ingredient/result/check detail is
   * computed or surfaced for an undiscovered recipe.
   * @private
   */
  _buildTeaserModel({ base, recipe, system, mode, hidden }) {
    const showIngredients = !hidden.has('ingredients');
    const showResults = !hidden.has('results');
    const showDescription = !hidden.has('description');
    return {
      ...base,
      flavor: showDescription ? stringOrEmpty(recipe.description) : '',
      browseStatus: CRAFTING_BROWSE_STATUS.DISCOVERY,
      blockingReasons: this._blockingReasons(CRAFTING_BROWSE_STATUS.DISCOVERY),
      ingredientSets: showIngredients
        ? recipe.ingredientSets.map((set, idx) => ({
            id: stringOrNull(set.id),
            label:
              stringOrEmpty(set.name) ||
              this.localize('FABRICATE.App.Crafting.IngredientSetFallback', { index: idx + 1 }),
            craftability: null,
          }))
        : [],
      defaultSetId: null,
      check: showResults ? this._buildCheck(system, mode) : null,
      outcomeTiers: showResults ? this._buildOutcomeTiers({ recipe, system, mode }) : null,
      result: showResults
        ? this._buildResult({
            recipe,
            system,
            mode,
            defaultSet: recipe.ingredientSets?.[0] ?? null,
          })
        : { items: [], timeLabel: null, xp: null },
      // Redacted exactly as `result`/`outcomeTiers` above. A teaser is shown to a player
      // in DISCOVERY status — the surface whose entire purpose is NOT showing them what
      // the recipe makes — so a missing guard here leaks the full stage list, names,
      // images and difficulties included. Redaction is builder-side, so no component test
      // can cover this.
      progressiveStages: showResults ? this._buildProgressiveStages({ recipe, system, mode }) : [],
      allowPlayerResultReorder: recipe.allowPlayerResultReorder !== false,
    };
  }

  /**
   * Per-ingredient-set craftability. Evaluates a single-set view of the recipe so
   * the returned `evaluateCraftability` result (canCraft + ingredient/essence/tool
   * states, currency-aware) reflects exactly that set rather than the
   * recipe-wide satisfiable set.
   * @private
   */
  _evaluateSet({ recipe, set, craftSources, craftingActor }) {
    if (typeof this.recipeManager?.evaluateCraftability !== 'function') return null;
    // A shallow copy preserves the recipe's data fields (craftingSystemId,
    // toolIds, currencyCost, …) and the IngredientSet instance methods, while
    // narrowing the evaluation to this one set. evaluateCraftability reads recipe
    // data only (never recipe prototype methods), so the copy is sufficient.
    const singleSetRecipe = { ...recipe, ingredientSets: [set] };
    return this.recipeManager.evaluateCraftability(craftSources, singleSetRecipe, {
      craftingActor,
    });
  }

  /**
   * Browse-status precedence (highest first):
   *   teaser → discovery, locked → locked, knowledge → unknown,
   *   recipe-item exhausted → exhausted, materials missing → missingMaterials,
   *   otherwise available.
   * Teaser is handled before this is reached (redacted recipes short-circuit), so
   * the `reason === 'teaser'` branch is a defensive fallback.
   * @private
   */
  _deriveBrowseStatus({ reason, canCraftMaterials, exhausted }) {
    if (reason === 'teaser') return CRAFTING_BROWSE_STATUS.DISCOVERY;
    if (reason === 'locked') return CRAFTING_BROWSE_STATUS.LOCKED;
    if (reason === 'knowledge') return CRAFTING_BROWSE_STATUS.UNKNOWN;
    if (exhausted) return CRAFTING_BROWSE_STATUS.EXHAUSTED;
    if (!canCraftMaterials) return CRAFTING_BROWSE_STATUS.MISSING_MATERIALS;
    return CRAFTING_BROWSE_STATUS.AVAILABLE;
  }

  _blockingReasons(browseStatus) {
    const key = BLOCKING_REASON_KEYS[browseStatus];
    return key ? [this.localize(key)] : [];
  }

  /**
   * The crafting-check descriptor for the recipe's resolution mode, or null when
   * the system configures no check block for that mode. `usable` is true iff an
   * authored, non-empty roll formula exists — NOT the legacy `enabled` flag.
   * @private
   */
  _buildCheck(system, mode, craftingActor = null) {
    const checks = system?.craftingCheck ?? {};
    // Alchemy selects its check slot from the SYSTEM-level `alchemy.checkMode`:
    // none → no check card, simple → the pass/fail slot, tiered → the routed slot.
    const alchemyCheckMode = mode === 'alchemy' ? system?.alchemy?.checkMode || 'none' : null;
    let config;
    switch (mode) {
      case 'simple':
      case 'routedByIngredients': {
        config = checks.simple;
        break;
      }
      case 'alchemy': {
        config =
          alchemyCheckMode === 'tiered'
            ? checks.routed
            : alchemyCheckMode === 'simple'
              ? checks.simple
              : null;
        break;
      }
      case 'routedByCheck': {
        config = checks.routed;
        break;
      }
      case 'progressive': {
        config = checks.progressive;
        break;
      }
      default: {
        config = null;
      }
    }
    if (!config) return null;

    const rollFormula = typeof config.rollFormula === 'string' ? config.rollFormula.trim() : '';
    const usable = rollFormula.length > 0;
    // "Mandatory" reflects whether the engine will actually roll this check and a
    // failure fails the craft (CraftingEngine._runCraftingCheck) — NOT merely whether
    // the mode requires a check to be configured. Otherwise a routed-by-ingredients
    // recipe with an authored simple pass/fail check + DC reads "Optional" even though it is
    // always rolled and can fail. Active when: the mode requires a check
    // (routedByCheck / progressive); routedByIngredients with an authored
    // formula (no enabled toggle); or simple/alchemy with a formula AND checks enabled.
    // Alchemy check-ness is driven by `alchemy.checkMode` (simple/tiered are
    // mandatory, independent of the `checksEnabled` toggle); other modes keep the
    // MANDATORY_CHECK_MODES contract.
    const requiredByMode =
      MANDATORY_CHECK_MODES.has(mode) ||
      (mode === 'alchemy' && (alchemyCheckMode === 'simple' || alchemyCheckMode === 'tiered'));
    const checksEnabled =
      system?.features?.craftingChecks === true || system?.craftingCheck?.enabled === true;
    const mandatory = requiredByMode
      ? true
      : mode === 'routedByIngredients'
        ? usable
        : usable && checksEnabled;
    // Resolve the formula's @-placeholders against the acting character for display
    // (e.g. "1d20 + 3 + 2"). `resolvedFormula` is null when not attempted (no actor /
    // no dice engine), so the UI falls back to the raw formula; `formulaResolved` is
    // false when the formula does not reduce to a number for this actor (error state).
    const resolution =
      rollFormula.length > 0 && craftingActor
        ? this._resolveCheckFormula(rollFormula, craftingActor)
        : null;
    // A routed fixed check (routedByCheck, or alchemy tiered) matches by value
    // range, not DC, so it has no meaningful DC — null it so the player card hides
    // its DC chip (its `hasDc` gate).
    const routedFixed =
      (mode === 'routedByCheck' || (mode === 'alchemy' && alchemyCheckMode === 'tiered')) &&
      config.type === 'fixed';
    return {
      dc: routedFixed ? null : (config.dc ?? null),
      rollFormula: rollFormula.length > 0 ? rollFormula : null,
      resolvedFormula: resolution?.display ?? null,
      formulaResolved: resolution ? resolution.resolved === true : null,
      skill: stringOrNull(config.skill),
      optional: !mandatory,
      mandatory,
      usable,
    };
  }

  /**
   * Outcome tiers for `routedByCheck` mode only (null for every other mode). Each
   * tier's award is resolved through `ResolutionModeService.resolveResultGroups`
   * so the success-only routing, single-result-group exemption, and
   * checkOutcomeIds→name→unrouted precedence are honoured identically to a real
   * attempt. A `success === false` tier never routes and awards nothing.
   *
   * Tiers that produce the exact same result signature (same components + counts,
   * and the same success flag) are collapsed into a single entry whose `names`
   * lists every contributing tier in first-appearance order, so the OUTCOMES panel
   * shows one row per distinct result rather than one row per tier.
   * @returns {Array<{id: string|null, names: string[], success: boolean,
   *   awardedResults: Array<{name: string, img: string|null, qty: number}>}>|null}
   * @private
   */
  _buildOutcomeTiers({ recipe, system, mode }) {
    if (mode !== 'routedByCheck') return null;
    const routed = system?.craftingCheck?.routed ?? null;
    const tiers = routed?.type === 'fixed' ? routed.fixedOutcomes : routed?.relativeOutcomes;
    if (!Array.isArray(tiers)) return [];
    const step = this._firstStep(recipe);
    const groups = [];
    const byKey = new Map();
    for (const tier of tiers) {
      const success = tier?.success === true;
      let resolvedGroups = null;
      if (success) {
        resolvedGroups = this.resolutionModeService?.resolveResultGroups?.({
          recipe,
          step,
          checkResult: { outcome: tier?.name ?? null },
        })?.groups;
      }
      const key = `${success ? 's' : 'f'}|${this._resultSignature(resolvedGroups)}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.names.push(stringOrEmpty(tier?.name));
        continue;
      }
      const entry = {
        id: stringOrNull(tier?.id),
        names: [stringOrEmpty(tier?.name)],
        success,
        awardedResults: success ? this._resultItemsFromGroups(resolvedGroups, system) : [],
      };
      byKey.set(key, entry);
      groups.push(entry);
    }
    return groups;
  }

  /**
   * Canonical, order-independent signature of a set of resolved result groups,
   * built from `componentId` + `quantity` pairs (not resolved names) so unknown or
   * renamed components still group correctly. Empty/failure resolves to `''`.
   * @private
   */
  _resultSignature(groups) {
    if (!Array.isArray(groups) || groups.length === 0) return '';
    const pairs = [];
    for (const group of groups) {
      for (const result of group?.results ?? []) {
        pairs.push(`${stringOrEmpty(result?.componentId)}:${Number(result?.quantity || 1)}`);
      }
    }
    return pairs.sort((a, b) => a.localeCompare(b)).join(',');
  }

  /**
   * The recipe's default expected output. For `routedByCheck` the awarded output
   * is per-tier (see `outcomeTiers`), so the top-level item list is empty.
   * @private
   */
  _buildResult({ recipe, system, mode, defaultSet }) {
    // routedByCheck output is per outcome tier (see outcomeTiers), so the top-level
    // item list is empty.
    const items =
      mode === 'routedByCheck' ? [] : this._productsForSet({ recipe, system, set: defaultSet });
    // timeLabel is calendar-aware and deferred to the UI slice; the raw duration
    // requirement is surfaced for that formatting step.
    return { items, time: recipe.timeRequirement ?? null, timeLabel: null, xp: null };
  }

  /**
   * The product rows (`{ name, img, qty }`) a single ingredient set routes to,
   * resolved through the resolution-mode service (routed-by-ingredients maps a set
   * to one result group via `IngredientSet.resultGroupId`). Used both for the
   * per-option product grid and the default set's expected output.
   * @private
   */
  _productsForSet({ recipe, system, set }) {
    const step = this._firstStep(recipe);
    const resolved = this.resolutionModeService?.resolveResultGroups?.({
      recipe,
      step,
      ingredientSet: set,
      checkResult: null,
    });
    return this._resultItemsFromGroups(resolved?.groups, system);
  }

  _firstStep(recipe) {
    const steps = this.resolutionModeService?.getExecutionSteps?.(recipe);
    return Array.isArray(steps) && steps.length > 0 ? steps[0] : null;
  }

  /**
   * The ORDERED stage list a progressive recipe shows the player, built from the AUTHORED
   * result group — deliberately bypassing the award loop.
   *
   * This is the F1 fix. Browsing has no roll, so this builder passes `checkResult: null`;
   * `_resolveProgressiveResultGroups` then derives `initialRemaining: Number(null || 0)`
   * → 0, every stage costs at least 1, and `awarded` is ALWAYS `[]`. A progressive recipe
   * therefore showed the player an empty output list — a pre-existing bug, and a
   * precondition for this feature: a stage list cannot be added to a surface with no data.
   * Routing this through the award loop with a fake budget would be the wrong fix; the
   * player is being shown what the recipe CAN produce, not what one roll did produce.
   *
   * Group selection mirrors `_resolveProgressiveResultGroups`'s `allGroups[0]` exactly
   * (step groups win over recipe groups), so the list the player orders is the list the
   * award will spend.
   *
   * @private
   */
  _buildProgressiveStages({ recipe, system, mode }) {
    if (mode !== 'progressive') return [];
    const step = this._firstStep(recipe);
    const allGroups =
      Array.isArray(step?.resultGroups) && step.resultGroups.length > 0
        ? step.resultGroups
        : Array.isArray(recipe?.resultGroups)
          ? recipe.resultGroups
          : [];
    const group = allGroups[0];
    const results = Array.isArray(group?.results) ? group.results : [];
    if (results.length === 0) return [];

    const components = Array.isArray(system?.components) ? system.components : [];
    const byId = new Map(components.map((component) => [component.id, component]));
    // The ENGINE'S difficulty lookup, not a local re-implementation — see
    // `ResolutionModeService.getDifficulty`. Parity here is what keeps the displayed
    // thresholds honest.
    const costFor = (result) =>
      this.resolutionModeService?.getDifficulty?.(
        system,
        result?.componentId || result?.systemItemId
      ) ?? NaN;

    const thresholds = progressiveStageThresholds({
      results,
      costFor,
      awardMode: system?.craftingCheck?.progressive?.awardMode || 'equal',
    });

    return results.map((result, index) => {
      const componentId = result?.componentId || result?.systemItemId;
      const component = componentId ? byId.get(componentId) : null;
      const difficulty = costFor(result);
      return {
        id: stringOrNull(result?.id),
        componentId: stringOrNull(componentId),
        name: stringOrEmpty(component?.name) || this.localize(UNKNOWN_COMPONENT_KEY),
        img: stringOrNull(component?.img),
        // Null (not 0) when the component has no authored difficulty, so the row can say
        // "no difficulty" rather than claim a free stage.
        difficulty: Number.isFinite(difficulty) ? difficulty : null,
        // Null when this stage is unreachable at any budget (an invalid cost the award
        // loop skips): the row omits the badge rather than showing a wrong number.
        threshold: thresholds[index] ?? null,
      };
    });
  }

  /**
   * Flatten resolved result groups into display item rows, resolving each
   * component id against the system's component library for name/img.
   * @private
   */
  _resultItemsFromGroups(groups, system) {
    if (!Array.isArray(groups) || groups.length === 0) return [];
    const components = Array.isArray(system?.components) ? system.components : [];
    const byId = new Map(components.map((component) => [component.id, component]));
    const items = [];
    for (const group of groups) {
      for (const result of group?.results ?? []) {
        const component = result?.componentId ? byId.get(result.componentId) : null;
        items.push({
          name: stringOrEmpty(component?.name) || this.localize(UNKNOWN_COMPONENT_KEY),
          img: stringOrNull(component?.img),
          qty: Number(result?.quantity || 1),
        });
      }
    }
    return items;
  }
}
