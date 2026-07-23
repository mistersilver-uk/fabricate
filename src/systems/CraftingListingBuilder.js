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
const TIME_REQUIREMENT_FIELDS = ['minutes', 'hours', 'days', 'months', 'years'];

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

    // An explicit multi-step recipe stores its sets on `steps[]` and leaves the raw
    // top-level `ingredientSets` empty; the listing therefore reads from the FIRST
    // execution step (`getExecutionSteps()[0]`). For a single-step recipe that step's
    // `ingredientSets` is the same array as `recipe.ingredientSets`, so this is a
    // generalization, not a special case. See the Multi-Step Recipe Presentation spec.
    const firstStep = this._firstStep(recipe);
    const firstStepSets = Array.isArray(firstStep?.ingredientSets) ? firstStep.ingredientSets : [];

    // Per-set craftability (essences + per-set tools + actor-bound currency probe
    // all folded in by evaluateCraftability's per-set pass).
    const ingredientSets = firstStepSets.map((set, idx) => ({
      id: stringOrNull(set.id),
      label:
        stringOrEmpty(set.name) ||
        this.localize('FABRICATE.App.Crafting.IngredientSetFallback', {
          index: idx + 1,
        }),
      craftability: this._evaluateSet({
        recipe,
        set,
        step: firstStep,
        craftSources,
        craftingActor,
      }),
      // The products this set routes to (routed-by-ingredients). Empty for
      // routedByCheck, whose output is per outcome tier, not per set.
      products:
        mode === 'routedByCheck'
          ? []
          : this._productsForSet({ recipe, system, set, step: firstStep }),
    }));

    // Craft-button craftability evaluates the first step's sets over the UNION of
    // recipe-level and step-level tool ids (the same view the engine crafts against),
    // bypassing RecipeManager's `ingredientSets.length === 0` early return for a
    // stepped recipe.
    const fullCraftability =
      this.recipeManager?.evaluateCraftability?.(
        craftSources,
        this._stepRecipeView(recipe, firstStep),
        {
          craftingActor,
        }
      ) ?? null;
    const canCraftMaterials = fullCraftability?.canCraft === true;
    const defaultSetId =
      stringOrNull(fullCraftability?.satisfiableSet?.id) ?? stringOrNull(firstStepSets?.[0]?.id);
    const defaultSet =
      firstStepSets.find((set) => stringOrNull(set.id) === defaultSetId) ??
      firstStepSets?.[0] ??
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
      check: this._buildCheck(system, mode, recipe, craftingActor),
      outcomeTiers: this._buildOutcomeTiers({ recipe, system, mode }),
      duration: this._buildDuration({ recipe, system, mode }),
      result: this._buildResult({ recipe, system, mode, defaultSet }),
      // Per-step requirement projection (`simple` multi-step only; [] otherwise). Each
      // entry carries the step's label, its per-set craftability (tool union applied)
      // and the components it produces. See Multi-Step Recipe Presentation.
      steps: this._buildSteps({ recipe, system, mode, craftSources, craftingActor }),
      // The ordered stage list (progressive only; [] otherwise) — the F1 fix.
      progressiveStages: this._buildProgressiveStages({ recipe, system, mode }),
      // GM policy: may this player reorder the stages? Default true (issue 651).
      allowPlayerResultReorder: recipe.allowPlayerResultReorder !== false,
      // The award mode the stage thresholds are derived from. Surfaced because a
      // threshold is a property of a stage's POSITION, so reordering invalidates the
      // baked values and the store must recompute — which it cannot do without knowing
      // the mode. See `_buildProgressiveStages`.
      progressiveAwardMode: this._progressiveAwardMode(system, mode),
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
    // Source the (non-redacted) set list from the first execution step, matching the
    // full projection above; step-level requirement detail is never computed for a
    // teaser (`steps: []`), redacted exactly as `result`/`outcomeTiers`.
    const firstStep = this._firstStep(recipe);
    const firstStepSets = Array.isArray(firstStep?.ingredientSets) ? firstStep.ingredientSets : [];
    return {
      ...base,
      flavor: showDescription ? stringOrEmpty(recipe.description) : '',
      browseStatus: CRAFTING_BROWSE_STATUS.DISCOVERY,
      blockingReasons: this._blockingReasons(CRAFTING_BROWSE_STATUS.DISCOVERY),
      ingredientSets: showIngredients
        ? firstStepSets.map((set, idx) => ({
            id: stringOrNull(set.id),
            label:
              stringOrEmpty(set.name) ||
              this.localize('FABRICATE.App.Crafting.IngredientSetFallback', { index: idx + 1 }),
            craftability: null,
          }))
        : [],
      defaultSetId: null,
      // Timing is always spoiler detail for a Discovery-Mode teaser, independent
      // of the configurable result-field redaction list.
      duration: null,
      // A teaser surfaces no step data, redacted exactly as `result`/`outcomeTiers`.
      steps: [],
      check: showResults ? this._buildCheck(system, mode, recipe) : null,
      outcomeTiers: showResults ? this._buildOutcomeTiers({ recipe, system, mode }) : null,
      result: showResults
        ? this._buildResult({
            recipe,
            system,
            mode,
            defaultSet: firstStepSets?.[0] ?? null,
          })
        : { items: [], timeLabel: null, xp: null },
      // Redacted exactly as `result`/`outcomeTiers` above. A teaser is shown to a player
      // in DISCOVERY status — the surface whose entire purpose is NOT showing them what
      // the recipe makes — so a missing guard here leaks the full stage list, names,
      // images and difficulties included. Redaction is builder-side, so no component test
      // can cover this.
      progressiveStages: showResults ? this._buildProgressiveStages({ recipe, system, mode }) : [],
      allowPlayerResultReorder: recipe.allowPlayerResultReorder !== false,
      // Not redacted: the award mode is a system-level rule, not a per-recipe spoiler,
      // and a teaser's stage list is empty anyway. Present so the shape stays uniform.
      progressiveAwardMode: this._progressiveAwardMode(system, mode),
    };
  }

  /**
   * Per-ingredient-set craftability. Evaluates a single-set view of the recipe so
   * the returned `evaluateCraftability` result (canCraft + ingredient/essence/tool
   * states, currency-aware) reflects exactly that set rather than the
   * recipe-wide satisfiable set.
   * @private
   */
  _evaluateSet({ recipe, set, step = null, craftSources, craftingActor }) {
    if (typeof this.recipeManager?.evaluateCraftability !== 'function') return null;
    // A shallow copy preserves the recipe's data fields (craftingSystemId,
    // currencyCost, …) and the IngredientSet instance methods, while narrowing the
    // evaluation to this one set and applying the owning step's tool union (D1) —
    // evaluateCraftability reads recipe data only (never recipe prototype methods),
    // so the copy is sufficient. When no step is supplied (single-step callers) it
    // defaults to the first execution step, preserving current behaviour.
    const owningStep = step ?? this._firstStep(recipe);
    const singleSetRecipe = { ...this._stepRecipeView(recipe, owningStep), ingredientSets: [set] };
    return this.recipeManager.evaluateCraftability(craftSources, singleSetRecipe, {
      craftingActor,
    });
  }

  /**
   * A read-side mirror of `CraftingEngine._buildStepRecipeView`: a shallow copy of
   * the recipe narrowed to one execution step's sets/result groups, with the tool
   * ids as the UNION of recipe-level and step-level ids (deduped downstream by
   * `RecipeManager.getToolsForSet`). The union — NOT a step-else-recipe fallback —
   * is what the engine consumes at craft time, so the projection must evaluate
   * against the same tool set or the tile would disagree with the craft (D1).
   * @private
   */
  _stepRecipeView(recipe, step) {
    return {
      ...recipe,
      ingredientSets: Array.isArray(step?.ingredientSets)
        ? step.ingredientSets
        : recipe.ingredientSets,
      resultGroups: Array.isArray(step?.resultGroups) ? step.resultGroups : recipe.resultGroups,
      toolIds: [
        ...(Array.isArray(recipe?.toolIds) ? recipe.toolIds : []),
        ...(Array.isArray(step?.toolIds) ? step.toolIds : []),
      ],
    };
  }

  /**
   * Project a positive authored duration into the listing's canonical five-field
   * shape. Zero-only and absent requirements are instant and surface as null.
   * @private
   */
  _durationOrNull(timeRequirement) {
    if (!timeRequirement || typeof timeRequirement !== 'object') return null;
    const duration = Object.fromEntries(
      TIME_REQUIREMENT_FIELDS.map((field) => [
        field,
        Math.max(0, Number(timeRequirement[field] || 0) || 0),
      ])
    );
    return TIME_REQUIREMENT_FIELDS.some((field) => duration[field] > 0) ? duration : null;
  }

  /**
   * The effective recipe-level duration shown before crafting. An explicit
   * simple-mode sequence sums authored units field-wise; an implicit recipe uses
   * its recipe-level requirement. Calendar-dependent unit conversion is left to
   * the execution layer.
   * @private
   */
  _buildDuration({ recipe, system, mode }) {
    if (system?.requirements?.time?.enabled === false) return null;
    const steps = this._executionSteps(recipe);
    if (mode !== 'simple' || steps.length <= 1) {
      return this._durationOrNull(recipe?.timeRequirement);
    }
    const aggregate = Object.fromEntries(TIME_REQUIREMENT_FIELDS.map((field) => [field, 0]));
    for (const step of steps) {
      const duration = this._durationOrNull(step?.timeRequirement);
      if (!duration) continue;
      for (const field of TIME_REQUIREMENT_FIELDS) aggregate[field] += duration[field];
    }
    return this._durationOrNull(aggregate);
  }

  /**
   * The per-step requirement projection surfaced to the `simple`-mode detail body.
   * Empty for single-step recipes and for every non-`simple` mode. `simple` enforces
   * exactly one ingredient set per step, so each entry carries exactly one set.
   * @private
   */
  _buildSteps({ recipe, system, mode, craftSources, craftingActor }) {
    if (mode !== 'simple') return [];
    const steps = this._executionSteps(recipe);
    if (steps.length <= 1) return [];
    return steps.map((step, index) => {
      const sets = Array.isArray(step?.ingredientSets) ? step.ingredientSets : [];
      return {
        id: stringOrNull(step?.id),
        label: this._stepLabel(step, index),
        duration:
          system?.requirements?.time?.enabled === false
            ? null
            : this._durationOrNull(step?.timeRequirement),
        ingredientSets: sets.map((set, setIdx) => ({
          id: stringOrNull(set.id),
          label:
            stringOrEmpty(set.name) ||
            this.localize('FABRICATE.App.Crafting.IngredientSetFallback', { index: setIdx + 1 }),
          craftability: this._evaluateSet({ recipe, set, step, craftSources, craftingActor }),
          products: this._productsForSet({ recipe, system, set, step }),
        })),
        // Retained deliberately as groundwork for a future non-`simple` step renderer
        // (intermediate yields are meaningful there) and to keep the entry shape
        // symmetric with `ingredientSets[]`; not rendered under the inputs-only body.
        products: this._productsForSet({ recipe, system, set: sets[0] ?? null, step }),
      };
    });
  }

  /**
   * A step's display label: the author-given name, else its 1-based position (never
   * the internal id), mirroring `ResolutionModeService._entityLabel`.
   * @private
   */
  _stepLabel(step, index) {
    const name = typeof step?.name === 'string' ? step.name.trim() : '';
    if (name) return name;
    return this.localize('FABRICATE.App.Crafting.Detail.StepFallback', { index: index + 1 });
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
   *
   * The displayed `dc` is resolved per-recipe (not per-system) with the same
   * precedence the engine (`CraftingEngine._resolveSimpleCheckDc`) and the GM
   * manager (`_buildRecipeCheckSummary`) use: the recipe's selected difficulty tier
   * (`recipe.checkTierId` → the matching `config.tiers[].dc`) wins, falling back to
   * the slot's static `config.dc`; both the tier DC and a finite static DC are
   * truncated to an integer. A routed-fixed check and a dynamic (macro-resolved) DC
   * both report `dc: null` (no chip): a fixed check matches by value range, and a
   * dynamic DC is resolved at craft time — this read-only builder never runs the
   * macro. Unlike the engine/GM row, a slot with a `rollFormula` but no finite
   * static `dc` reports `null` rather than the hardcoded `15` fallback — a
   * deliberate display-only divergence so the listing never surfaces a DC chip
   * where none is authored.
   *
   * @param {object} system - The resolved crafting system.
   * @param {string} mode - The system's resolution mode.
   * @param {object} recipe - The recipe being projected (drives tier-DC selection).
   * @param {object|null} [craftingActor] - The acting character, for @-placeholder
   *   resolution of the display formula. Omitted (null) for a teaser projection so
   *   formula resolution stays suppressed.
   * @private
   */
  _buildCheck(system, mode, recipe, craftingActor = null) {
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
    // Suppress the empty DC-only card for a disabled, formula-less optional check (the
    // Tent case): nothing renders when the mode does not require a check, no roll
    // formula is authored, and checks are not enabled. A mandatory-by-mode check, an
    // authored formula (`usable`), or `checksEnabled === true` (which keeps the "no
    // roll formula configured" GM note) all still surface.
    if (!requiredByMode && !usable && !checksEnabled) return null;
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
        ? this._resolveCheckFormula(rollFormula, craftingActor, {
            // The `@craftingmod` context (issue 770): resolve the same scalar the
            // engine rolls, so the displayed formula matches what evaluates.
            catalogue: checks.checkModifiers,
            systemPolicy: checks.defaultModifierPolicy,
            defaultModifierIds: checks.defaultModifierIds,
            recipeModifier: recipe?.craftingModifier ?? null,
          })
        : null;
    // A routed fixed check (routedByCheck, or alchemy tiered) matches by value
    // range, not DC, so it has no meaningful DC — null it so the player card hides
    // its DC chip (its `hasDc` gate).
    const routedFixed =
      (mode === 'routedByCheck' || (mode === 'alchemy' && alchemyCheckMode === 'tiered')) &&
      config.type === 'fixed';
    // Resolve the displayed DC AFTER the #765 suppression guard above (never
    // reorder it there): routed-fixed and dynamic-DC checks surface no chip
    // (`null`); otherwise the recipe's tier DC wins over the static fallback. See
    // the method JSDoc and `_resolveDisplayDc`.
    const dc =
      routedFixed || config.dcMode === 'dynamic' ? null : this._resolveDisplayDc(config, recipe);
    return {
      dc,
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
   * The DC to display for a resolved check `config`, mirroring the engine's
   * `_resolveSimpleCheckDc` tier/static precedence for the tier and integer-static
   * cases: the recipe's selected difficulty tier (`recipe.checkTierId` → matching
   * `config.tiers[].dc`, truncated) wins, else the finite static `config.dc`
   * (truncated). Unlike the engine/GM row, a slot with no finite static `dc`
   * returns `null` (no chip) rather than the hardcoded `15` — a deliberate
   * display-only divergence. The absent-`dc` cases are asymmetric: a `null`
   * static `dc` coerces to `0` (finite) and shows a DC 0 chip, while `undefined`
   * reaches the `?? null` tail and yields `null`. A non-finite yet PRESENT
   * `config.dc` (e.g. a stray authored string) surfaces verbatim through that
   * same tail rather than becoming `15` — the accepted residual, since the
   * builder never invents a DC the recipe never declared. Callers resolve the
   * routed-fixed and dynamic-DC `null` cases before this.
   * @private
   */
  _resolveDisplayDc(config, recipe) {
    const tierId = recipe?.checkTierId;
    if (tierId) {
      const tiers = Array.isArray(config.tiers) ? config.tiers : [];
      const tier = tiers.find((entry) => entry?.id === tierId);
      const tierDc = Number(tier?.dc);
      if (tier && Number.isFinite(tierDc)) return Math.trunc(tierDc);
    }
    return Number.isFinite(Number(config.dc)) ? Math.trunc(Number(config.dc)) : (config.dc ?? null);
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
    return {
      items: this._resultItems({ recipe, system, mode, defaultSet }),
      timeLabel: null,
      xp: null,
    };
  }

  /**
   * The recipe's top-level expected output rows. `routedByCheck` is per outcome tier
   * (empty top-level list). In `simple` mode the output is the recipe's FINAL product,
   * so it resolves against the terminal execution step and that step's own set (simple
   * resolution ignores the set, yielding the terminal step's success group). Every
   * other mode resolves the first step against `defaultSet`, unchanged.
   * @private
   */
  _resultItems({ recipe, system, mode, defaultSet }) {
    if (mode === 'routedByCheck') return [];
    if (mode === 'simple') {
      const terminalStep = this._terminalStep(recipe);
      return this._productsForSet({
        recipe,
        system,
        set: terminalStep?.ingredientSets?.[0] ?? null,
        step: terminalStep,
      });
    }
    return this._productsForSet({ recipe, system, set: defaultSet });
  }

  /**
   * The product rows (`{ name, img, qty }`) a single ingredient set routes to,
   * resolved through the resolution-mode service (routed-by-ingredients maps a set
   * to one result group via `IngredientSet.resultGroupId`). Used both for the
   * per-option product grid and the default set's expected output.
   * @private
   */
  _productsForSet({ recipe, system, set, step = null }) {
    const resolvedStep = step ?? this._firstStep(recipe);
    const resolved = this.resolutionModeService?.resolveResultGroups?.({
      recipe,
      step: resolvedStep,
      ingredientSet: set,
      checkResult: null,
    });
    return this._resultItemsFromGroups(resolved?.groups, system);
  }

  /**
   * The recipe's execution steps (real per-step `IngredientSet`/`ResultGroup`
   * instances). A single-step recipe returns one synthesized implicit step whose
   * arrays are the recipe's own top-level arrays.
   * @private
   */
  _executionSteps(recipe) {
    const steps = this.resolutionModeService?.getExecutionSteps?.(recipe);
    return Array.isArray(steps) ? steps : [];
  }

  _firstStep(recipe) {
    const steps = this._executionSteps(recipe);
    return steps.length > 0 ? steps[0] : null;
  }

  /**
   * The terminal (final) execution step — the recipe's product-bearing step. For a
   * single-step recipe this is the same synthesized implicit step as `_firstStep`.
   * @private
   */
  _terminalStep(recipe) {
    const steps = this._executionSteps(recipe);
    return steps.length > 0 ? steps.at(-1) : null;
  }

  /**
   * The award mode progressive thresholds are derived from (`null` outside progressive).
   * Single source for both projections and the value the store recomputes against.
   * @private
   */
  _progressiveAwardMode(system, mode) {
    if (mode !== 'progressive') return null;
    return system?.craftingCheck?.progressive?.awardMode || 'equal';
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
   * The thresholds baked here are POSITIONAL, so they are only valid for the authored
   * order. When the player reorders, `orderedProgressiveStages` recomputes them through
   * the same helper — carrying these values across a move is the defect that shipped in
   * review and was caught by `fabricate_reviewer`.
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

    // Baked in AUTHORED order. These are correct only while the list is in authored
    // order — a threshold is cumulative, so it belongs to a stage's POSITION, not to the
    // stage. `craftingStore` recomputes them after applying the player's order.
    const thresholds = progressiveStageThresholds({
      results,
      costFor,
      awardMode: this._progressiveAwardMode(system, mode),
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
