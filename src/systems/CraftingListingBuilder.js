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
 * Modes whose crafting check is mandatory (the attempt fails without an authored
 * roll formula). The routed/progressive modes require a check; alchemy runs an
 * always-on check. Simple and routedByIngredients treat the check as optional.
 */
const MANDATORY_CHECK_MODES = new Set(['routedByCheck', 'progressive', 'alchemy']);

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

    const base = {
      id: stringOrNull(recipe.id),
      name: stringOrEmpty(recipe.name),
      img: stringOrNull(recipe.img),
      systemId: stringOrNull(recipe.craftingSystemId),
      systemName: stringOrEmpty(system?.name),
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

    const hasRecipeItemRef = !!(recipe.recipeItemId || recipe.linkedRecipeItemUuid);
    const knowledgeCfg = system?.recipeVisibility?.knowledge ?? {};
    const consumeOnLearn = knowledgeCfg?.learn?.consumeOnLearn !== false;
    const canLearn = !isGM && reason === 'knowledge' && hasRecipeItemRef;

    return {
      ...base,
      flavor: stringOrEmpty(recipe.description),
      browseStatus,
      learn: { canLearn, consumeOnLearn },
      blockingReasons,
      ingredientSets,
      defaultSetId,
      check: this._buildCheck(system, mode),
      outcomeTiers: this._buildOutcomeTiers({ recipe, system, mode }),
      result: this._buildResult({ recipe, system, mode, defaultSet }),
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
      learn: { canLearn: false, consumeOnLearn: false },
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
  _buildCheck(system, mode) {
    const checks = system?.craftingCheck ?? {};
    let config;
    switch (mode) {
      case 'simple':
      case 'alchemy': {
        config = checks.simple;
        break;
      }
      case 'routedByIngredients':
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
    const mandatory = MANDATORY_CHECK_MODES.has(mode);
    return {
      dc: config.dc ?? null,
      rollFormula: rollFormula.length > 0 ? rollFormula : null,
      skill: stringOrNull(config.skill),
      optional: !mandatory,
      mandatory,
      usable: rollFormula.length > 0,
    };
  }

  /**
   * Outcome tiers for `routedByCheck` mode only (null for every other mode). Each
   * tier carries its `awardedResults`, resolved through
   * `ResolutionModeService.resolveResultGroups` so the success-only routing,
   * single-result-group exemption, and checkOutcomeIds→name→unrouted precedence
   * are honoured identically to a real attempt. A `success === false` tier never
   * routes and carries an empty `awardedResults`.
   * @private
   */
  _buildOutcomeTiers({ recipe, system, mode }) {
    if (mode !== 'routedByCheck') return null;
    const routed = system?.craftingCheck?.routed ?? null;
    const tiers = routed?.type === 'fixed' ? routed.fixedOutcomes : routed?.relativeOutcomes;
    if (!Array.isArray(tiers)) return [];
    const step = this._firstStep(recipe);
    return tiers.map((tier) => {
      const success = tier?.success === true;
      let awardedResults = [];
      if (success) {
        const resolved = this.resolutionModeService?.resolveResultGroups?.({
          recipe,
          step,
          checkResult: { outcome: tier?.name ?? null },
        });
        awardedResults = this._resultItemsFromGroups(resolved?.groups, system);
      }
      return {
        id: stringOrNull(tier?.id),
        name: stringOrEmpty(tier?.name),
        success,
        awardedResults,
      };
    });
  }

  /**
   * The recipe's default expected output. For `routedByCheck` the awarded output
   * is per-tier (see `outcomeTiers`), so the top-level item list is empty.
   * @private
   */
  _buildResult({ recipe, system, mode, defaultSet }) {
    let items = [];
    if (mode !== 'routedByCheck') {
      const step = this._firstStep(recipe);
      const resolved = this.resolutionModeService?.resolveResultGroups?.({
        recipe,
        step,
        ingredientSet: defaultSet,
        checkResult: null,
      });
      items = this._resultItemsFromGroups(resolved?.groups, system);
    }
    // timeLabel is calendar-aware and deferred to the UI slice; the raw duration
    // requirement is surfaced for that formatting step.
    return { items, time: recipe.timeRequirement ?? null, timeLabel: null, xp: null };
  }

  _firstStep(recipe) {
    const steps = this.resolutionModeService?.getExecutionSteps?.(recipe);
    return Array.isArray(steps) && steps.length > 0 ? steps[0] : null;
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
