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
 *
 * ## Two phases, and why the split is a shape change rather than a cache (issue 1075)
 *
 * The read API is SUMMARY then DETAIL, and the two are separate methods because they have
 * genuinely different costs and genuinely different audiences of consumer.
 *
 * - {@link CraftingListingBuilder#buildListing} answers "what may this viewer browse?" for
 *   the whole visible corpus and returns #1091 summaries. It performs ZERO exact
 *   craftability evaluations, at any corpus size: material availability comes from #1077's
 *   indexed projection over ONE per-pass inventory snapshot. Everything the browser list
 *   filters, sorts and paginates on — name, id, browse status, system, category — is on a
 *   summary, so the page window is chosen before any expensive work happens.
 * - {@link CraftingListingBuilder#buildRecipeDetail} answers "what does the inspector show
 *   for THIS recipe?" and is the unchanged rich projection, exact evaluations included, for
 *   one recipe at a time.
 *
 * The old shape ran the rich projection over every visible recipe before the store had even
 * looked at the page size, so opening the app against a large corpus cost roughly
 * `1 + setCount + stepSetCount` exact evaluations PER RECIPE for rows nobody would see.
 *
 * The two phases disagree about material availability BY DESIGN, and that is stated here
 * rather than discovered: the summary's answer is #1077's documented upper bound (contended
 * sets are counted for both, so it can say "looks makeable" where exact evaluation refuses),
 * while the detail — and the craft guard behind it — stay exact. A row is a promise about
 * what is worth opening, never a promise about what will craft.
 */

import { resolveRecipeImage } from '../ui/svelte/util/craftingImageDefaults.js';
import { progressiveStageThresholds } from '../utils/progressiveStageThresholds.js';
import { normalizeRecipeCategory, getRecipeCategoryLabel } from '../utils/recipeCategories.js';

import { buildCheckModifierContext } from './checkModifierResolver.js';
import { CRAFTING_BROWSE_STATUS, deriveBrowseStatus } from './craftingBrowseStatus.js';
import { buildInventorySnapshot } from './inventorySnapshot.js';
import { activeRunStepState, buildStepRecipeView } from './stepRecipeView.js';
import { SUMMARY_AUDIENCE, projectRecipeSummary } from './summaryProjection.js';

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
 * The browse-status vocabulary the player Crafting list keys its callout on, re-exported
 * from the import-free leaf that now owns it (issue 1091).
 *
 * It moved because #1091's summary projection needs the SAME vocabulary and the same
 * precedence rule, and could not take them from here without dragging this whole builder
 * into every consumer's graph — which is exactly why `craftingStore.svelte.js` already
 * kept a private copy. One vocabulary, one owner, and this re-export so nothing that
 * imported it from the builder has to move.
 */
export { CRAFTING_BROWSE_STATUS } from './craftingBrowseStatus.js';

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
   * @param {object} [deps.craftingRunManager] - `CraftingRunManager`, read ONLY through
   *   its synchronous `findActiveRunForRecipe` so the projection can name the step a
   *   run is actually parked on (issue 917). A constructor dependency rather than an
   *   import, mirroring `GatheringListingBuilder`'s `runManager`. Omitted (null) every
   *   recipe reports `activeStepIndex: 0` — today's behaviour.
   * @param {Function} [deps.getViewer] - Fallback viewer accessor when `buildListing` omits one.
   * @param {Function} [deps.localize] - `(key, data?) => string`.
   * @param {Function} [deps.nowWorldTime] - `() => number` current world time.
   * @param {Function} [deps.isSystemBlockedForRecipes] - `(systemId) => boolean`; a blocked
   *   system exposes no recipes to a non-GM viewer. Defaults to never-blocked.
   * @param {Function} [deps.resolveComponentForItem] - `(item, components, systemId) =>
   *   component|null`, the item-identity resolution the per-pass inventory snapshot tallies
   *   held stacks with (issue 1075). INJECTED rather than imported for two reasons: item
   *   identity is not this builder's concern, and the real resolver drags a four-module
   *   matcher graph the mounted-component harness would then have to copy alongside every
   *   crafting suite. Omitted, the snapshot resolves no components, so every summary reports
   *   `availability: false` — the FAIL-CLOSED direction, which shows as "missing materials"
   *   rather than as a false "looks makeable".
   */
  constructor({
    recipeManager = null,
    recipeVisibility = null,
    resolutionModeService = null,
    craftingSystemManager = null,
    craftingRunManager = null,
    getViewer = null,
    localize = (key) => key,
    nowWorldTime = () => 0,
    isSystemBlockedForRecipes = null,
    resolveCheckFormula = null,
    resolveComponentForItem = null,
  } = {}) {
    this.recipeManager = recipeManager;
    this.recipeVisibility = recipeVisibility;
    this.resolutionModeService = resolutionModeService;
    this.craftingSystemManager = craftingSystemManager;
    this.craftingRunManager = craftingRunManager;
    this._getViewer = typeof getViewer === 'function' ? getViewer : null;
    this.localize = typeof localize === 'function' ? localize : (key) => key;
    this._nowWorldTime = typeof nowWorldTime === 'function' ? nowWorldTime : () => 0;
    this._isSystemBlockedForRecipes =
      typeof isSystemBlockedForRecipes === 'function' ? isSystemBlockedForRecipes : () => false;
    // Injected so the builder stays free of Foundry's `Roll` global; wired to
    // resolveCheckFormulaDisplay in main.js. Default no-op → resolvedFormula null.
    this._resolveCheckFormula =
      typeof resolveCheckFormula === 'function' ? resolveCheckFormula : () => null;
    this._resolveComponentForItem =
      typeof resolveComponentForItem === 'function' ? resolveComponentForItem : null;
  }

  /**
   * SUMMARY PHASE — the paged browse query (issue 1075).
   *
   * Every recipe the viewer may browse, projected into #1091's canonical summary. The cost
   * is one corpus-wide visibility pass, one inventory snapshot, and one cheap projection per
   * visible recipe; `evaluateCraftability` and `resolveIngredientSelection` are invoked
   * ZERO times, which is asserted by counter rather than left as a review note.
   *
   * The caller filters, sorts and paginates these, then asks {@link buildRecipeDetail} for
   * the one recipe it is about to render an inspector for.
   *
   * @param {object} options
   * @param {object|null} options.craftingActor - The acting character.
   * @param {object[]} [options.componentSourceActors] - Additional inventory sources.
   * @param {object|null} [options.viewer] - Foundry user; falls back to `getViewer()`.
   * @param {Array<{recipe: object, access: object}>|null} [options.visibleRecipeEntries] - An
   *   ALREADY-COMPUTED corpus-wide visibility pass, handed in by a caller that has to run
   *   the same pass for another consumer in the same read (issue 1075). Explicitly a
   *   parameter and never a field: a retained pass would be a cache of knowledge results
   *   derived from live inventory, which `inventorySnapshot`'s invalidation rule forbids.
   *   Omitted, this method runs the pass itself, exactly as before.
   * @returns {{
   *   selectedActorId: string|null,
   *   actor: object|null,
   *   componentSourceIds: Array<string|null>,
   *   worldTime: number,
   *   summaries: object[],
   *   total: number,
   *   counts: { available: number, total: number }
   * }}
   */
  buildListing({
    craftingActor = null,
    componentSourceActors = [],
    viewer = null,
    visibleRecipeEntries = null,
  } = {}) {
    const resolvedViewer = viewer ?? this._getViewer?.() ?? null;
    const isGM = resolvedViewer?.isGM === true;
    const knowledgeSources = Array.isArray(componentSourceActors)
      ? componentSourceActors.filter(Boolean)
      : [];
    const craftSources = this._dedupeActors([craftingActor, ...knowledgeSources]);

    const visibleEntries =
      visibleRecipeEntries ??
      this.recipeVisibility?.getVisibleRecipes?.({
        viewer: resolvedViewer,
        craftingActor,
        componentSourceActors: knowledgeSources,
      }) ??
      [];

    // ONE snapshot for the whole pass, discarded when this returns. Its per-system tallies
    // are memoised inside it, so N summaries of one system walk the inventory once — the
    // whole reason a summary may consult held quantities per row at all.
    const snapshot = this._passSnapshot(craftingActor, knowledgeSources);

    const summaries = [];
    for (const entry of visibleEntries) {
      const recipe = entry?.recipe;
      if (!recipe) continue;
      if (!isGM && this._isSystemBlockedForRecipes(recipe.craftingSystemId)) continue;
      summaries.push(
        this._buildRecipeSummary({
          recipe,
          access: entry.access ?? {},
          isGM,
          snapshot,
          craftingActor,
          knowledgeSources,
        })
      );
    }

    const available = summaries.filter(
      (summary) => summary.browseStatus === CRAFTING_BROWSE_STATUS.AVAILABLE
    ).length;

    return {
      selectedActorId: actorKey(craftingActor),
      actor: craftingActor ?? null,
      componentSourceIds: craftSources.map(actorKey),
      worldTime: Number(this._nowWorldTime() || 0),
      summaries,
      total: summaries.length,
      counts: { available, total: summaries.length },
    };
  }

  /**
   * DETAIL PHASE — the exact rich model for ONE recipe (issue 1075).
   *
   * Structurally the same projection the pre-split `buildListing` ran over the whole corpus,
   * now asked for one recipe at a time. Exact per-set craftability, ingredient assignment,
   * checks, outcome tiers, durations, steps and progressive stages all live here and only
   * here.
   *
   * ## Every gate the summary phase applies is re-applied, from scratch
   *
   * A caller reaching this with a recipe id has NOT proved the viewer may see it: an id is
   * whatever the client sent. So the system block is re-tested, the `enabled` filter the
   * summary phase's corpus query applied is re-applied, and access is re-evaluated (or
   * accepted from the caller only when the caller is the same pass that computed it). An
   * invisible recipe answers `null` rather than a redacted model. Re-deriving is the cheap
   * half of this call; trusting the id would make the split a privilege escalation.
   *
   * @param {object} options
   * @param {string|null} [options.recipeId] Resolved through `recipeManager.getRecipe`.
   * @param {object|null} [options.recipe] The recipe itself, when the caller already holds
   *   it (avoids a redundant manager read; the gates below are identical either way).
   * @param {object|null} [options.craftingActor]
   * @param {object[]} [options.componentSourceActors]
   * @param {object|null} [options.viewer]
   * @param {object|null} [options.access] This recipe's already-evaluated access result.
   * @returns {object|null} The `RecipeListingModel`, or `null` when no such recipe exists or
   *   the viewer may not see it.
   */
  buildRecipeDetail({
    recipeId = null,
    recipe = null,
    craftingActor = null,
    componentSourceActors = [],
    viewer = null,
    access = null,
  } = {}) {
    const resolvedViewer = viewer ?? this._getViewer?.() ?? null;
    const isGM = resolvedViewer?.isGM === true;
    const knowledgeSources = Array.isArray(componentSourceActors)
      ? componentSourceActors.filter(Boolean)
      : [];
    const craftSources = this._dedupeActors([craftingActor, ...knowledgeSources]);

    const target = recipe ?? this.recipeManager?.getRecipe?.(recipeId) ?? null;
    if (!target) return null;
    if (!isGM && this._isSystemBlockedForRecipes(target.craftingSystemId)) return null;
    // The `enabled` gate the summary phase gets for free. `getVisibleRecipes` sources from
    // `getRecipes({enabled: true})`, so a disabled recipe can never be a row; `getRecipe`
    // applies no such filter, so without this line a client-supplied id hydrates a recipe
    // the GM has switched off. `=== false` rather than falsy: `enabled` is absent-means-ON
    // per the model default, and reading an omitted field as "disabled" would blank the
    // inspector for every fixture and every pre-`enabled` authored recipe.
    if (!isGM && target.enabled === false) return null;

    const resolvedAccess =
      access ??
      this.recipeVisibility?.evaluateRecipeAccess?.({
        recipe: target,
        viewer: resolvedViewer,
        craftingActor,
        componentSourceActors: knowledgeSources,
      }) ??
      {};
    // `=== false` rather than `!== true`: the shipped access results for a visible recipe
    // always carry `visible: true`, but a hand-built fixture (and every pre-1075 caller that
    // passes an entry's `access` straight through) carries only a `reason`. Reading an
    // absent flag as "not visible" would blank the inspector for every one of those.
    if (resolvedAccess.visible === false) return null;

    return this._buildRecipeModel({
      recipe: target,
      access: resolvedAccess,
      isGM,
      craftingActor,
      craftSources,
      knowledgeSources,
    });
  }

  /**
   * The per-pass inventory snapshot the summary phase's availability projection reads.
   *
   * A per-pass VALUE, never a field: `inventorySnapshot`'s invalidation rule is that no
   * snapshot outlives the synchronous pass that built it, because nothing mints a revision
   * token when a player's `actor.items` changes and a stale inventory read would feed the
   * craftability and knowledge gates. #1078 owns the item-side generation that would ever
   * permit retention.
   * @private
   */
  _passSnapshot(craftingActor, componentSourceActors) {
    return buildInventorySnapshot({
      craftingActor,
      componentSourceActors,
      resolveComponent: this._resolveComponentForItem,
    });
  }

  /**
   * Project one visible recipe into its #1091 summary.
   *
   * `exhausted` is skipped for a redacted teaser, matching the pre-split builder exactly:
   * the teaser branch short-circuited before the exhaustion read, and asking for it here
   * would add an inventory rescan for a row whose status is `discovery` regardless.
   *
   * `favourite` is always `false` and that is deliberate rather than a stub. Favourites are
   * a per-VIEWER client setting the store reads and filters on directly
   * (`craftingStore.favouriteIds`); this builder has no seam to that setting and inventing
   * one would give the preference two owners. The manifest requires the key on a player
   * summary, so it is emitted as its "not asserted here" value.
   * @private
   */
  _buildRecipeSummary({ recipe, access, isGM, snapshot, craftingActor, knowledgeSources }) {
    const redacted = !isGM && stringOrEmpty(access?.reason) === 'teaser';
    return projectRecipeSummary({
      recipe,
      system: this.craftingSystemManager?.getSystem?.(recipe.craftingSystemId) ?? null,
      audience: isGM ? SUMMARY_AUDIENCE.GM : SUMMARY_AUDIENCE.PLAYER,
      access,
      snapshot,
      exhausted:
        !isGM &&
        !redacted &&
        this._isKnowledgeExhausted(access, recipe, craftingActor, knowledgeSources),
      favourite: false,
      localize: this.localize,
    });
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
   * Whether this recipe's book knowledge is exhausted.
   *
   * The already-evaluated `access.knowledge` is handed BACK to the service, which answers
   * from it when it carries evidence and rescans only when it does not (issue 1077). Passing
   * it rather than branching here keeps one owner for the exhaustion rule: a listing that
   * re-derived "owned some, all spent" locally would be a second copy of a per-book cap rule
   * that has already changed once (issue 511).
   * @private
   */
  _isKnowledgeExhausted(access, recipe, craftingActor, knowledgeSources) {
    return (
      this.recipeVisibility?.isKnowledgeItemExhausted?.({
        recipe,
        craftingActor,
        componentSourceActors: knowledgeSources,
        knowledge: access?.knowledge ?? null,
      }) === true
    );
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
      // A recipe's icon is its OWN `img` and nothing else — `data-models/spec.md`
      // `## Recipe` requirement 16. This previously borrowed the containing book's
      // artwork ahead of an authored image, keyed on the legacy `recipe.recipeItemId`
      // scalar; book membership is many-to-many, so "the containing book" tracked
      // definition order rather than anything the GM authored (issue 884, the rule; issue
      // 887 shipped the removal of the last borrows).
      //
      // `resolveRecipeImage` rather than `recipe.img` directly: Foundry's generic
      // item-bag is the "no image" sentinel, and collapsing without it would render the
      // BAG for a bag-valued recipe — which `tests/recipe-prompt-img.test.js` records as
      // an explicit product requirement never to do. The helper is an import-free leaf
      // already in `CRAFTING_APP_RAW_MODULES`, so this import adds no harness edge; do
      // NOT reach for `models/Recipe.js` here, which would.
      //
      // Redaction no longer needs a branch: with no borrowed item image there is nothing
      // for an undiscovered recipe's teaser to leak.
      img: stringOrNull(resolveRecipeImage(recipe)),
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

    // Where the actor's active run has this recipe parked (issue 917). The
    // projection below deliberately keeps reading the FIRST step: a routed or
    // progressive multi-step recipe surfaces no `steps[]` at all, so re-pointing the
    // top-level rail mid-run would silently swap the requirements under the player.
    // The model NAMES both steps instead, and the UI renders the rail read-only
    // whenever they differ.
    const activeStep = this._activeStepState(recipe, craftingActor);

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

    // Book-knowledge exhaustion. `getVisibleRecipes` has ALREADY collected this recipe's
    // owned copies and filtered them by their own books' caps, so when it handed back a
    // knowledge result the answer is two numbers on that result rather than a second
    // corpus-wide candidate walk (issue 1077). The rescan remains for the modes that
    // produce no knowledge result at all — a `global`-mode or teaser recipe never evaluates
    // knowledge, and dropping its exhausted state would silently retire the badge.
    const exhausted =
      !isGM && this._isKnowledgeExhausted(access, recipe, craftingActor, knowledgeSources);

    const browseStatus = this._deriveBrowseStatus({ reason, canCraftMaterials, exhausted });
    const blockingReasons = this._blockingReasons(browseStatus);

    return {
      ...base,
      flavor: stringOrEmpty(recipe.description),
      browseStatus,
      blockingReasons,
      ingredientSets,
      defaultSetId,
      // Multi-step run position (issue 917). `activeStepId` names the step the engine
      // would execute for this actor's active run; `displayedStepId` names the step
      // whose sets `ingredientSets` above projects. When they differ the requirement
      // rail must render read-only — what is shown does not drive the craft the
      // button fires, and the engine drops any allocation sent for the wrong step.
      // `activeStepTimeGateArmed` forces read-only for the same reason: the inputs
      // were consumed when the gate was ARMED, a craft click hits the engine's "still
      // in progress" early return, and the finish path never re-resolves ingredients.
      activeStepIndex: activeStep.index,
      activeStepId: stringOrNull(activeStep.step?.id),
      displayedStepId: stringOrNull(firstStep?.id),
      activeStepTimeGateArmed: activeStep.timeGateArmed,
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
      // A teaser is never craftable, so it carries no run position: the fields are
      // present (uniform model shape) but inert. Redacted for the same reason
      // `steps` is — a teaser exposes no step structure at all.
      activeStepIndex: 0,
      activeStepId: null,
      displayedStepId: null,
      activeStepTimeGateArmed: false,
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
   * The recipe narrowed to one execution step, through the SHARED
   * {@link buildStepRecipeView} the engine also uses (issue 917) — the read side and
   * the write side previously carried private twins of this projection and must not
   * drift. The tool ids are the UNION of recipe-level and step-level ids (deduped
   * downstream by `RecipeManager.getToolsForSet`); the union — NOT a step-else-recipe
   * fallback — is what the engine consumes at craft time, so the projection must
   * evaluate against the same tool set or the tile would disagree with the craft (D1).
   * @private
   */
  _stepRecipeView(recipe, step) {
    return buildStepRecipeView(recipe, step);
  }

  /**
   * The execution step this actor's active run has the recipe parked on, plus
   * whether that step's world-time gate is already armed (issue 917). Both come from
   * the SHARED {@link activeRunStepState}, which performs exactly the reads
   * `CraftingEngine.craft` performs before it resolves the step it will execute.
   *
   * `step` is null when the index names no execution step (a run left pointing past
   * the end of a re-authored recipe) — the engine aborts that craft with "No active
   * crafting step available", so a null here correctly reads as "nothing the player
   * sees drives a craft".
   * @private
   */
  _activeStepState(recipe, craftingActor) {
    const { index, timeGateArmed } = activeRunStepState(
      this.craftingRunManager,
      craftingActor,
      recipe?.id
    );
    return { index, timeGateArmed, step: this._executionSteps(recipe)[index] ?? null };
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
   * The effective recipe-level duration shown before crafting. Authored shape is
   * authoritative: an implicit recipe uses its recipe-level requirement, while an
   * explicit simple-mode sequence sums authored step units field-wise. Other
   * explicit shapes have no safe recipe-level projection. Calendar-dependent unit
   * conversion is left to the execution layer.
   * @private
   */
  _buildDuration({ recipe, system, mode }) {
    if (system?.requirements?.time?.enabled === false) return null;
    const authoredSteps = Array.isArray(recipe?.steps) ? recipe.steps : [];
    if (authoredSteps.length === 0) return this._durationOrNull(recipe?.timeRequirement);
    if (mode !== 'simple' || authoredSteps.length <= 1) return null;

    const aggregate = Object.fromEntries(TIME_REQUIREMENT_FIELDS.map((field) => [field, 0]));
    for (const step of authoredSteps) {
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
   *
   * Delegates to the shared rule (issue 1091) so this detail model and the summary
   * projection the page rows are built from cannot label the same recipe differently.
   * The rule reads `materialsAvailable` as a TRISTATE — `null` means no material check
   * ran — and this builder always ran one, so it passes a boolean and behaves exactly
   * as the inlined version did.
   * @private
   */
  _deriveBrowseStatus({ reason, canCraftMaterials, exhausted }) {
    return deriveBrowseStatus({
      reason,
      materialsAvailable: canCraftMaterials === true,
      exhausted: exhausted === true,
    });
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
        ? // The check-modifier context (issues 770, 1055, 1095): the SAME builder the
          // engine threads to its check runners, not a second literal of the same shape.
          // The display path and the evaluation path must agree on every axis the context
          // carries — the combination rule, the activity's default eligible set, the
          // subject's own picks under `bySubject`, each entry's `min`/`max` clamp, and
          // the `maxModifierPicks` cap that bounds them — or the listed formula shows a
          // scalar the roll will not use (`resolution-modes/spec.md` requirement 71).
          //
          // THE ACTIVITY ARGUMENT IS LOAD-BEARING (issue 1095). The catalogue is shared
          // across crafting, salvage and gathering but the SELECTION is not, so an
          // arity-2 call here would resolve this listed CRAFTING formula against
          // whichever selection triple the builder happened to default to. This is the
          // player-facing card; a wrong scalar here is a promise the roll breaks.
          this._resolveCheckFormula(
            rollFormula,
            craftingActor,
            buildCheckModifierContext(system, 'crafting', recipe)
          )
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
