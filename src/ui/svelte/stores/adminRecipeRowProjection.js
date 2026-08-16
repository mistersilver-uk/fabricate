/**
 * adminRecipeRowProjection — the GM recipe-browser row projection, as a pure module
 * (issue 1090).
 *
 * `buildRecipeList` is the whole of what the recipes tab renders: the filtered rows, the
 * category counts, and the per-row derivations the row itself cannot compute (the
 * structure chip, the requirements preview, the check pill, the activation gate, and
 * recipe-book membership).
 *
 * THE ROW OBJECT IS A HAND-BUILT ALLOWLIST. A field omitted from it is invisible to the
 * browser and to the recipe editor however correctly the model and the write path behave,
 * and several of the per-field comments below exist because that has already shipped more
 * than once. Add to the literal deliberately; never trim it to "tidy up".
 *
 * ## Two tiers, on ONE row object (issue 1081)
 *
 * The browser filters, sorts, counts and paginates the WHOLE filtered cohort and then
 * renders 25 rows, so projecting every row richly is `O(cohort)` work to display
 * `O(page)` of it. The row is therefore built in two tiers:
 *
 *  - **Summary** — plain own data properties, computed for every row in the cohort. It
 *    carries everything the pure browser model reads: the filter fields (`enabled`,
 *    `locked`, `category`), the identity fields, book membership, and — critically — all
 *    five SORT KEYS, because sorting runs over the filtered cohort BEFORE pagination and a
 *    browser paged on a summary that omits them renders name order under a "DC" label.
 *  - **Detail** — the same fields, exposed as MEMOIZED ENUMERABLE ACCESSORS that compute
 *    on first read. `Object.keys`, spread, `JSON.stringify` and `deepEqual` all see them,
 *    so the allowlist is unchanged and every existing reader is unaffected; what changes is
 *    WHEN the work happens. Only the rendered page and the selected recipe (the inspector
 *    seeds its draft with `JSON.parse(JSON.stringify(row))`) read those fields, so only
 *    those rows pay `toJSON()`, the requirements-preview object graph, and the two
 *    completeness validators.
 *
 * `enableBlocked` is its own memoized slot rather than part of the detail bundle. It is a
 * sort key (`attentionRank`), so it must be answerable for the whole cohort — but it is the
 * single most expensive field on the row (`RecipeManager.canActivateRecipe` runs the full
 * activation gate), so the cohort must not pay for it under a sort key that does not read
 * it. Sorting by `attention` reads it for every row; every other sort reads it for the page
 * and for the bulk selection only. The audit behind it is compiled ONCE per revision by
 * issue 1074's retained `_alchemySignatureReport`, so N reads cost one audit, not N.
 *
 * Pure by construction: it touches no `svelte/store`, no `game.*` and no module state, so
 * a test (or a benchmark, per issues 1071 and 1072) can call it directly with plain
 * fixtures and no store.
 *
 * Deliberately a LEAF under `stores/`: no `.svelte` imports from `src/ui/svelte/stores/`,
 * so this module cannot reach a mounted-component test's dependency closure.
 */
import { ingredientSetToolsAreActive } from '../../../systems/toolCheckBonus.js';
import { normalizeRecipeCategory } from '../../../utils/recipeCategories.js';
import { recipeItemDefinitionsContaining } from '../../../utils/recipeItemMembership.js';

/**
 * Build a human-readable visibility summary for a recipe row.
 */
function _visibilitySummary(recipe) {
  const visibility = recipe.visibility || {};
  if (visibility.restricted !== true) return 'All players';
  const allowed = Array.isArray(visibility.allowedUserIds) ? visibility.allowedUserIds : [];
  if (allowed.length === 0) return 'Restricted (none selected)';
  return `Restricted (${allowed.length})`;
}

function _ingredientCountForSet(ingredientSet) {
  const groups =
    Array.isArray(ingredientSet?.ingredientGroups) && ingredientSet.ingredientGroups.length > 0
      ? ingredientSet.ingredientGroups
      : (ingredientSet?.ingredients || []).map((ingredient) => ({ options: [ingredient] }));
  return groups.reduce((sum, group) => sum + ((group.options || []).length || 0), 0);
}

function _getRecipeExecutionSteps(recipe) {
  const methodSteps =
    typeof recipe?.getExecutionSteps === 'function' ? recipe.getExecutionSteps() : null;
  if (Array.isArray(methodSteps) && methodSteps.length > 0) return methodSteps;
  if (Array.isArray(recipe?.steps) && recipe.steps.length > 0) return recipe.steps;

  return [
    {
      id: 'implicit-step',
      name: 'Step 1',
      ingredientSets: Array.isArray(recipe?.ingredientSets) ? recipe.ingredientSets : [],
      resultGroups: Array.isArray(recipe?.resultGroups) ? recipe.resultGroups : [],
      toolIds: Array.isArray(recipe?.toolIds) ? recipe.toolIds : [],
    },
  ];
}

function _usesExplicitRecipeSteps(recipe, executionSteps) {
  return (Array.isArray(recipe?.steps) && recipe.steps.length > 0) || executionSteps.length > 1;
}

function _buildRequirementPreviewStep(
  step,
  index,
  sharedRecipeToolIds = [],
  craftingSystem = null
) {
  const ingredientSets = Array.isArray(step?.ingredientSets) ? step.ingredientSets : [];
  const ingredientSetSummaries = ingredientSets.map((set, setIndex) => ({
    id: set?.id || `set-${setIndex + 1}`,
    name: set?.name || `Set ${setIndex + 1}`,
    ingredientCount: _ingredientCountForSet(set),
    toolCount:
      ingredientSetToolsAreActive(craftingSystem, set) && Array.isArray(set?.toolIds)
        ? set.toolIds.length
        : 0,
  }));
  const stepToolCount = Array.isArray(step?.toolIds) ? step.toolIds.length : 0;
  const previewIngredientCount =
    ingredientSetSummaries.length > 0
      ? Math.max(...ingredientSetSummaries.map((set) => set.ingredientCount))
      : 0;
  const previewSetToolCount =
    ingredientSetSummaries.length > 0
      ? Math.max(...ingredientSetSummaries.map((set) => set.toolCount))
      : 0;

  const resultGroups = Array.isArray(step?.resultGroups) ? step.resultGroups : [];

  return {
    id: step?.id || `step-${index + 1}`,
    name: step?.name || `Step ${index + 1}`,
    ingredientSetCount: ingredientSets.length,
    ingredientCount: previewIngredientCount,
    toolCount: sharedRecipeToolIds.length + stepToolCount + previewSetToolCount,
    resultGroupCount: resultGroups.length,
    // The number of result ITEMS across the step's groups. Distinct from
    // `resultGroupCount`: the browser row's "N out" half is only meaningful in
    // `simple` / `progressive` (issue 643 §9); tier- and set-keyed modes render
    // the GROUP count instead, so both numbers have to be projected.
    resultItemCount: resultGroups.reduce(
      (sum, group) => sum + (Array.isArray(group?.results) ? group.results.length : 0),
      0
    ),
    hasAlternatives: ingredientSetSummaries.length > 1,
    ingredientSetSummaries,
  };
}

function _recipeStructure(isSimple, stepCount) {
  if (stepCount > 1) {
    return { structureKey: 'multiStep', structureLabel: 'Multi-step' };
  }
  if (isSimple) {
    return { structureKey: 'simple', structureLabel: 'Simple' };
  }
  return { structureKey: 'singleStep', structureLabel: 'Single step' };
}

/**
 * Coarse fallback for {@link _isRecipeIncomplete} when a recipe model instance
 * (with `validate()` / `validateStructure()`) is unavailable. Detects the common
 * shell shapes — missing ingredient sets / result groups — but not the deeper
 * completeness cases the validators reject.
 * @param {object} recipe
 * @returns {boolean}
 */
function _isRecipeIncompleteByCounts(recipe) {
  const steps = Array.isArray(recipe?.steps) ? recipe.steps : [];
  if (steps.length > 0) {
    return steps.some(
      (step) =>
        !Array.isArray(step?.ingredientSets) ||
        step.ingredientSets.length === 0 ||
        !Array.isArray(step?.resultGroups) ||
        step.resultGroups.length === 0
    );
  }
  const ingredientSets = Array.isArray(recipe?.ingredientSets) ? recipe.ingredientSets : [];
  const resultGroups = Array.isArray(recipe?.resultGroups) ? recipe.resultGroups : [];
  return ingredientSets.length === 0 || resultGroups.length === 0;
}

/**
 * Derive whether a recipe is an incomplete authoring shell — persistable but not craftable.
 * Source of truth: a recipe is incomplete iff it is structurally sound but fails the
 * full completeness contract, i.e. `validateStructure().valid === true` while
 * `validate().valid === false`. This exactly matches the craftability/completeness
 * notion (the engine gates craft on `Recipe.validate()`), so the chip never falsely
 * reads "complete" for a recipe whose ingredient set has no groups/essences, whose
 * result group is empty, whose resolution-mode cardinality is unmet, or — for explicit
 * multi-step recipes — whose step is missing either side. The two validators are pure.
 * Falls back to a coarse count-only check when a model instance is unavailable.
 * @param {Recipe} recipe
 * @returns {boolean}
 */
function _isRecipeIncomplete(recipe) {
  if (typeof recipe?.validate === 'function' && typeof recipe?.validateStructure === 'function') {
    return recipe.validate().valid === false && recipe.validateStructure().valid === true;
  }
  return _isRecipeIncompleteByCounts(recipe);
}

/**
 * Derive whether ACTIVATION would refuse this recipe (issue 1010) — the ONE predicate
 * behind the row's `Can't enable` pill, the bulk panel's pre-flight count and the bulk
 * write's `blockedEnables`. `RecipeManager.canActivateRecipe` runs the same
 * `_validateRecipeForActivation` the write runs, against a clone with `enabled: true`.
 *
 * It CANNOT be derived from {@link _isRecipeIncomplete}, which is
 * `validate().valid === false && validateStructure().valid === true`. A STRUCTURALLY
 * BROKEN recipe therefore reads `incomplete: false` while still being un-enableable, and
 * none of the essence-reference, tag-placeholder, resolution-mode or alchemy-signature
 * blockers move it either. Reading `incomplete` here would let the panel warn that three
 * selected recipes will stay off while zero rows wear the pill — two contradicting
 * statements about one fact, on one screen.
 *
 * The guard covers only a recipe manager that does not implement the predicate (an
 * injected test seam); an invalid RESULT is never swallowed.
 *
 * @param {object} recipeManager
 * @param {Recipe} recipe
 * @returns {boolean}
 */
function _isRecipeEnableBlocked(recipeManager, recipe) {
  if (typeof recipeManager?.canActivateRecipe !== 'function') return false;
  return !recipeManager.canActivateRecipe(recipe).valid;
}

/**
 * The four structural NUMBERS a browser row sorts and reads out on, folded straight off the
 * execution steps (issue 1081).
 *
 * Byte-for-byte the same arithmetic {@link _buildRequirementPreviewStep} performs — the
 * per-step ingredient figure is the MAXIMUM across that step's alternative ingredient sets,
 * summed over steps, and the two result figures are plain sums — but it allocates nothing.
 * The preview builds one summary object per ingredient set plus one per step and resolves
 * per-set tool activity against the system; three of these four numbers are sort keys over
 * the whole filtered cohort, so they cannot wait for the page, and none of them needs any of
 * that object graph to be correct.
 *
 * `toolCount` is deliberately NOT here: it is the only one of the five preview totals that
 * depends on `ingredientSetToolsAreActive`, it is not a sort key, and it is rendered on the
 * row only — so it stays in the detail tier with the preview it is summed from.
 *
 * @param {object[]} executionSteps from {@link _getRecipeExecutionSteps}.
 * @returns {{stepCount: number, ingredientCount: number, resultGroupCount: number,
 *   resultItemCount: number}}
 */
function _recipeStructureCounts(executionSteps) {
  let ingredientCount = 0;
  let resultGroupCount = 0;
  let resultItemCount = 0;

  for (const step of executionSteps) {
    const ingredientSets = Array.isArray(step?.ingredientSets) ? step.ingredientSets : [];
    let widestSet = 0;
    for (const set of ingredientSets) {
      const size = _ingredientCountForSet(set);
      if (size > widestSet) widestSet = size;
    }
    ingredientCount += widestSet;

    const resultGroups = Array.isArray(step?.resultGroups) ? step.resultGroups : [];
    resultGroupCount += resultGroups.length;
    for (const group of resultGroups) {
      resultItemCount += Array.isArray(group?.results) ? group.results.length : 0;
    }
  }

  return { stepCount: executionSteps.length, ingredientCount, resultGroupCount, resultItemCount };
}

/**
 * The requirements preview, the structure chip and the row's tool count — the expensive half
 * of what {@link _buildRecipeBrowserDisplay} used to build for every row in the cohort.
 *
 * @param {object} recipe
 * @param {object[]} executionSteps
 * @param {boolean} isSimple
 * @param {object|null} craftingSystem
 * @returns {{requirementsPreview: object[], toolCount: number, structureKey: string,
 *   structureLabel: string}}
 */
function _buildRecipeBrowserDisplay(recipe, executionSteps, isSimple, craftingSystem = null) {
  const sharedRecipeToolIds =
    _usesExplicitRecipeSteps(recipe, executionSteps) && Array.isArray(recipe?.toolIds)
      ? recipe.toolIds
      : [];
  const requirementsPreview = executionSteps.map((step, index) =>
    _buildRequirementPreviewStep(step, index, sharedRecipeToolIds, craftingSystem)
  );

  return {
    requirementsPreview,
    toolCount: requirementsPreview.reduce((sum, step) => sum + step.toolCount, 0),
    ..._recipeStructure(isSimple, requirementsPreview.length),
  };
}

/**
 * The crafting check a recipe row's check pill resolves against, keyed off the
 * SYSTEM's resolution mode. `routedByCheck` authors its check on the `routed`
 * slot; `simple`, `alchemy` and `routedByIngredients` share the `simple`
 * pass/fail slot; `progressive` has its own.
 * @private
 */
function _recipeCheckConfig(system) {
  const mode = system?.resolutionMode || 'simple';
  if (mode === 'routedByCheck') return system?.craftingCheck?.routed || null;
  if (mode === 'progressive') return system?.craftingCheck?.progressive || null;
  return system?.craftingCheck?.simple || null;
}

/**
 * The check pill the recipe row renders (issue 643 §9). The row cannot derive
 * this — the DC lives on the SYSTEM's check, keyed by the recipe's `checkTierId`
 * — so it is projected here.
 *
 * A check is USABLE only when it has an authored `rollFormula`; "checks enabled"
 * is not the same thing. The DC resolution mirrors
 * `CraftingEngine._resolveSimpleCheckDc`: the recipe's selected tier wins, then
 * the check's static default.
 *
 * The two check-less kinds are NOT the same fact, and the row must not tell the GM
 * they are:
 *
 *  - `ingredients` — a `routedByIngredients` system with no usable check. Results
 *    route off the ingredient set that was used, so the recipe resolves perfectly
 *    well with no roll. This is a working configuration, reported neutrally.
 *  - `none` — every other mode with no usable check. The system cannot roll for this
 *    recipe, which is a state the GM should be able to SCAN a library for, so it
 *    carries a warning rather than an em dash that says nothing.
 *
 * Everything that depends on the SYSTEM alone is resolved ONCE per cohort here rather than
 * once per row (issue 1081).
 *
 * Three of the six branches in the original per-row derivation could not vary by recipe at
 * all — they read the system's mode, its check config and that config's `dcMode` — so each
 * collapses to a `constant` summary shared by every row. Only the last branch is per-recipe,
 * and its `tiers.find()` scan becomes a first-wins `Map` lookup (matching `Array#find`'s
 * precedence for a duplicated tier id).
 *
 * @param {object} system the selected crafting system (raw, not projected).
 * @returns {{constant: object|null, tierDcById: Map<string, number>, defaultDc: number}}
 */
function _recipeCheckContext(system) {
  const mode = system?.resolutionMode || 'simple';
  const constantOf = (kind) => ({ constant: Object.freeze({ kind, dc: null }) });

  // Alchemy's own check mode is system-level and independent of the crafting
  // check; `none` means the recipe resolves with no check at all.
  if (mode === 'alchemy' && (system?.alchemy?.checkMode || 'none') === 'none') {
    return constantOf('none');
  }

  const config = _recipeCheckConfig(system);
  const hasRollFormula = Boolean(String(config?.rollFormula ?? '').trim());
  if (!config || !hasRollFormula) {
    return constantOf(mode === 'routedByIngredients' ? 'ingredients' : 'none');
  }
  if (mode === 'progressive') return constantOf('progressive');
  // A dynamic DC is macro-resolved at craft time; there is no static number to show.
  if (config.dcMode === 'dynamic') return constantOf('dynamic');

  const tierDcById = new Map();
  for (const entry of Array.isArray(config.tiers) ? config.tiers : []) {
    // FIRST-WINS, mirroring the `tiers.find()` this replaces: a duplicated tier id must
    // resolve to the same tier the scan resolved to.
    if (entry?.id !== undefined && !tierDcById.has(entry.id)) tierDcById.set(entry.id, entry.dc);
  }
  const defaultDc = Number(config.dc);
  return {
    constant: null,
    tierDcById,
    defaultDc: Number.isFinite(defaultDc) ? Math.trunc(defaultDc) : 15,
  };
}

/**
 * The check pill for ONE recipe, against a cohort-scoped {@link _recipeCheckContext}.
 *
 * A tier that EXISTS but carries a non-numeric `dc` falls through to the check's static
 * default, exactly as the `Number.isFinite(tierDc)` guard did before this was hoisted.
 *
 * @param {{constant: object|null, tierDcById: Map<string, number>, defaultDc: number}} context
 * @param {object} recipe the Recipe model.
 * @returns {{kind: 'none' | 'ingredients' | 'progressive' | 'dynamic' | 'dc', dc: number | null}}
 * @private
 */
function _recipeCheckSummary(context, recipe) {
  if (context.constant) return context.constant;
  const tierDc = recipe?.checkTierId ? Number(context.tierDcById.get(recipe.checkTierId)) : NaN;
  if (Number.isFinite(tierDc)) return { kind: 'dc', dc: Math.trunc(tierDc) };
  return { kind: 'dc', dc: context.defaultDc };
}

/**
 * The DETAIL-tier field names, in one list (issue 1081).
 *
 * Every one of them is an enumerable accessor on the row, so the projected row's key set is
 * unchanged and `tests/stores/admin-projection-modules.test.js` still pins ONE exact
 * allowlist. What the list decides is which fields are computed for the whole cohort and
 * which are computed for the rows a reader actually touches.
 *
 * A field belongs here when NOTHING in `recipeBrowserModel.js` reads it — no filter, no sort
 * key, no category. Moving a field into this list that the model does read reintroduces the
 * failure `summaryProjection.js` records for the systems-layer manifest: the browser renders
 * name order under a "DC" label and says nothing.
 */
const RECIPE_DETAIL_FIELDS = Object.freeze([
  'access',
  'accessSummary',
  'checkTierId',
  'complex',
  'craftingModifier',
  'incomplete',
  'ingredients',
  'ingredientSets',
  'minSuccessOutcomeId',
  'outcomeRouting',
  'requirementsPreview',
  'resultGroups',
  'resultSelection',
  'steps',
  'structureKey',
  'structureLabel',
  'timeRequirement',
  'toolCount',
  'toolIds',
  'tools',
  'visibility',
  'visibilitySummary',
]);

/**
 * Define `fields` on `row` as enumerable accessors sharing ONE memoized producer.
 *
 * Enumerable and configurable, so `Object.keys`, object spread, `JSON.stringify` and
 * `assert.deepEqual` are all indistinguishable from data properties — the recipe editor
 * seeds its draft with `JSON.parse(JSON.stringify(row))` and gets a fully materialised plain
 * object exactly as it did before. There is no setter: a projected row is a read model, and
 * a silent write onto one is a defect worth a `TypeError` rather than a field the next
 * refresh throws away.
 *
 * @param {object} row
 * @param {readonly string[]} fields
 * @param {() => object} produce Called at most once, on the first read of any field.
 * @returns {void}
 */
function _defineLazyFields(row, fields, produce) {
  let produced = null;
  const read = () => (produced ??= produce());
  for (const field of fields) {
    Object.defineProperty(row, field, {
      enumerable: true,
      configurable: true,
      get: () => read()[field],
    });
  }
}

/**
 * Everything about the row that only the RENDERED page and the selected recipe need.
 *
 * @param {object} recipe
 * @param {object[]} executionSteps
 * @param {{isSimple: boolean, ingredientCount: number}} summary
 * @param {object} context
 * @returns {object}
 */
function _buildRecipeRowDetail(recipe, executionSteps, summary, context) {
  const display = _buildRecipeBrowserDisplay(
    recipe,
    executionSteps,
    summary.isSimple,
    context.system
  );
  // Plain authoring data for the recipe editor's step-mode UI. Sourced from
  // toJSON() so step / top-level shapes match Recipe._normalizeStep exactly.
  // The multi-step editor reads `steps` (and migrates the top-level fields into
  // the seeded first step); without these the editor cannot detect or author steps.
  //
  // `toJSON()` is a DEEP CLONE of the whole recipe body, which is why it lives here rather
  // than in the summary tier: a 10,000-recipe library paid 10,000 of them to render 25 rows.
  const raw = recipe.toJSON();
  return {
    steps: Array.isArray(raw.steps) ? raw.steps : [],
    ingredientSets: Array.isArray(raw.ingredientSets) ? raw.ingredientSets : [],
    resultGroups: Array.isArray(raw.resultGroups) ? raw.resultGroups : [],
    // Result routing: the per-recipe routing mode (provider) and check-tier
    // reference live at the top level and MUST be projected, or the editor
    // seeds them empty and they revert on reload (the routing-mode persistence
    // bug). The resultGroups/ingredientSets arrays above already carry their
    // own routing fields (checkOutcomeIds / resultGroupId).
    resultSelection: raw.resultSelection || null,
    outcomeRouting: raw.outcomeRouting || null,
    checkTierId: raw.checkTierId ?? null,
    minSuccessOutcomeId: raw.minSuccessOutcomeId ?? null,
    // Per-recipe crafting-check modifier override (issue 770). This projection is a
    // hand-built ALLOWLIST: omitting it makes the Overview override control seed from
    // `undefined`, render "Inherit system default", and silently write the override
    // back to null on the next save (data loss). `raw` is `recipe.toJSON()`, which
    // carries `craftingModifier` per the model.
    craftingModifier: raw.craftingModifier ?? null,
    // Single-step recipe duration (issue 845). This projection is a hand-built
    // ALLOWLIST: omitting it makes the Overview Duration steppers seed from
    // `undefined` and render "Instant" on every editor open — the persisted value
    // is NOT lost (RecipeManager.updateRecipe shallow-merges it back from the stored
    // record when the draft omits the key), so craft time still applies, but the GM
    // sees their authored duration reset to zero. Multi-step recipes carry their
    // per-step duration inside the `steps` array projected wholesale below.
    timeRequirement: raw.timeRequirement ?? null,
    complex: raw.complex === true,
    toolIds: Array.isArray(raw.toolIds) ? raw.toolIds : [],
    visibilitySummary: _visibilitySummary(recipe),
    // The raw `{ restricted, allowedUserIds }` object (display string aside) so
    // the per-recipe restriction editor can seed, stage, and save an edit. Without
    // it `recipeDraft.visibility` is undefined and edits cannot be persisted.
    visibility: raw.visibility || null,
    // Per-recipe access grants (restricted visibility mode): the normalized
    // `{ characterIds, playerIds }` snapshot the Access tab seeds and saves, plus
    // a `{ characterCount, playerCount }` summary the recipe rows render as the
    // "N char · N player" grant chip (or "No access" when both are 0).
    access: {
      characterIds: Array.isArray(raw.access?.characterIds) ? raw.access.characterIds : [],
      playerIds: Array.isArray(raw.access?.playerIds) ? raw.access.playerIds : [],
    },
    accessSummary: {
      characterCount: Array.isArray(raw.access?.characterIds) ? raw.access.characterIds.length : 0,
      playerCount: Array.isArray(raw.access?.playerIds) ? raw.access.playerIds.length : 0,
    },
    // Derived (no stored flag): a shell missing ingredient sets / result groups is
    // persistable but not craftable. Surfaced as an "Incomplete" chip in the browser.
    // Two full model validators per row, and NOT a sort key — `attentionRank` reads
    // `enableBlocked`, deliberately (issue 1010) — so the cohort must not pay for it.
    incomplete: _isRecipeIncomplete(recipe),
    toolCount: display.toolCount,
    structureKey: display.structureKey,
    structureLabel: display.structureLabel,
    requirementsPreview: display.requirementsPreview,
    ingredients: new Array(summary.ingredientCount),
    tools: new Array(display.toolCount),
  };
}

/**
 * The per-cohort inputs every row derivation shares, resolved once (issue 1081).
 *
 * @param {object} recipeManager
 * @param {object} selectedSystem the RAW manager system.
 * @returns {object}
 */
function _createRecipeRowContext(recipeManager, selectedSystem) {
  const definitions = Array.isArray(selectedSystem.recipeItemDefinitions)
    ? selectedSystem.recipeItemDefinitions
    : [];
  return {
    recipeManager,
    system: selectedSystem,
    checkContext: _recipeCheckContext(selectedSystem),
    definitions,
    membershipResolvesByRecipeIds: selectedSystem.membershipResolvesByRecipeIds,
    membershipLookups: _cohortMembershipLookups(definitions),
  };
}

/**
 * A per-COHORT `recipeId -> definitions` bucket index for the membership leaf's `recipeIds[]`
 * leg (issue 1081).
 *
 * The leaf's default lookup is `definitions.filter(d => d.recipeIds.some(...))`, which is
 * `O(books x members)` PER RECIPE — the dominant summary-tier cost on a library with a real
 * book collection. Building the same buckets once per cohort makes it a `Map.get` per recipe
 * and pays the scan once.
 *
 * Deliberately LOCAL and rebuilt per call, NOT `definitionIndex.indexedMembershipLookups`.
 * That module's index is retained by array identity and is only invalidated by a length
 * change or an explicit `advanceDefinitionRevision`, so an in-place reorder or `recipeIds`
 * rewrite that skips the revision serves a stale answer — and this is a render path reading
 * whatever array the manager currently holds. A per-refresh index cannot be stale by
 * construction, and one scan per refresh is the cost that buys that.
 *
 * Buckets keep DEFINITION ORDER, matching the `filter()` this replaces: the row's legacy
 * `recipeItemId` scalar is `containingDefinitions[0]`, so bucket order is observable.
 *
 * @param {object[]} definitions
 * @returns {{byRecipeId: (definitions: object[], recipeId: string) => object[]}}
 */
function _cohortMembershipLookups(definitions) {
  const byRecipeId = new Map();
  for (const definition of definitions) {
    for (const memberId of Array.isArray(definition?.recipeIds) ? definition.recipeIds : []) {
      const key = String(memberId ?? '').trim();
      if (!key) continue;
      const bucket = byRecipeId.get(key);
      // A definition listing the same recipe twice must contribute ONE entry, matching
      // `filter()`'s one-element-per-definition result.
      if (bucket) {
        if (bucket.at(-1) !== definition) bucket.push(definition);
      } else {
        byRecipeId.set(key, [definition]);
      }
    }
  }
  return { byRecipeId: (_definitions, recipeId) => byRecipeId.get(recipeId) || [] };
}

/**
 * Project ONE recipe into a browser row: summary fields eagerly, detail fields lazily.
 *
 * @param {object} recipe the Recipe model.
 * @param {object} context from {@link _createRecipeRowContext}.
 * @returns {object} the projected row.
 */
function _createRecipeRow(recipe, context) {
  const executionSteps = _getRecipeExecutionSteps(recipe);
  const counts = _recipeStructureCounts(executionSteps);
  const isSimple =
    typeof recipe.isSimpleRecipe === 'function' ? recipe.isSimpleRecipe(context.system) : true;

  // Book membership (many-to-many): the books that contain this recipe. The
  // legacy scalars `recipeItemId`/name/source reflect the FIRST containing book —
  // an accident of definition order, which is exactly why NO image is derived from
  // them (issue 884): a recipe's icon is its own `img` and nothing else.
  // `context.system` here is the RAW manager system (`getSystems()`), not the
  // hand-built viewState projection, so the membership-basis marker is reachable
  // without adding it to that allowlist (issue 1011).
  //
  // The rule is the shared leaf every membership reader asks (issue 1155). This row
  // used to carry a LOCAL copy of it with no `linkedRecipeItemUuid` → `originItemUuid`
  // leg, so on an un-migrated world the browser's book column and the delete card's
  // impact statement could name different books for the same recipe.
  //
  // SUMMARY tier, not detail: `enrichRecipeItemLibrary` builds its legacy `recipeItemId`
  // index over the WHOLE projected cohort, so deferring membership would materialise every
  // row on an un-migrated world. It is answered through the per-cohort bucket index
  // (`_cohortMembershipLookups`) instead of the leaf's default per-recipe definition scan.
  const containingDefinitions = recipeItemDefinitionsContaining(
    context.definitions,
    recipe,
    context.membershipResolvesByRecipeIds,
    context.membershipLookups
  );
  const recipeItemIds = containingDefinitions.map((def) => String(def.id));
  const recipeItemDefinition = containingDefinitions[0] || null;
  const recipeItemId = recipeItemDefinition ? String(recipeItemDefinition.id) : '';

  const row = {
    id: recipe.id,
    name: recipe.name,
    img: recipe.img,
    description: String(recipe.description || '').trim(),
    category: normalizeRecipeCategory(recipe.category),
    locked: recipe.locked === true,
    enabled: recipe.enabled !== false,
    // GM policy: may a player reorder this recipe's progressive result stages
    // (issue 651)? This projection is a hand-built ALLOWLIST — an omitted field is
    // invisible to the editor, so the Results tab's toggle card would seed from
    // `undefined`, read default-true, and silently render ON for a recipe the GM had
    // authored OFF. Default-true here mirrors the model's constructor.
    allowPlayerResultReorder: recipe.allowPlayerResultReorder !== false,
    // Book membership: all books containing this recipe (many-to-many), plus the
    // first book's id/name/source for legacy single-link consumers. Deliberately no
    // book IMAGE among them (issue 884): the GM readers resolve `recipe.img` through
    // the shared `resolveRecipeImage` helper, never a containing book's artwork.
    recipeItemIds,
    recipeItemId,
    recipeItemName: recipeItemDefinition?.name || '',
    recipeItemSourceUuid: recipeItemDefinition?.originItemUuid || '',
    // The row's check pill: the system check's DC resolved through this recipe's
    // `checkTierId`, or `{ kind: 'none' }` when the system has no USABLE check
    // (usable iff an authored rollFormula exists — "checks enabled" is not the
    // same thing). The row cannot derive this (issue 643 §9).
    //
    // SUMMARY tier: `checkSummary.dc` is the `dc` sort key, which orders the whole
    // filtered cohort before pagination.
    checkSummary: _recipeCheckSummary(context.checkContext, recipe),
    isSimple,
    // SUMMARY tier: `ingredientCount` and `resultItemCount` are the `ingredients` and
    // `results` sort keys, and `resultGroupCount` is the other half of the row's I/O
    // readout (`deriveRecipeIo`). Folded arithmetically — see `_recipeStructureCounts`.
    stepCount: counts.stepCount,
    ingredientCount: counts.ingredientCount,
    resultGroupCount: counts.resultGroupCount,
    resultItemCount: counts.resultItemCount,
  };

  // Derived (no stored flag): would ACTIVATION refuse this recipe? See
  // `_isRecipeEnableBlocked` for why `incomplete` could NOT have served — a
  // structurally broken recipe reads `incomplete: false` and still cannot be enabled.
  // This projection is a hand-built ALLOWLIST, so omitting the field would leave it
  // invisible to the row pill and every downstream blocked-enable count silently zero.
  //
  // Its OWN memo slot, separate from the detail bundle (issue 1081). It is the
  // `attention` sort key, so it must be answerable across the whole filtered cohort —
  // but it is also the most expensive field on the row, and the default sort is `name`.
  // Slotting it alone means sorting by attention pays N activation checks and NOTHING
  // else, while every other sort pays for the page and the bulk selection only. The
  // signature audit each one would otherwise have run is compiled once per revision by
  // `RecipeManager._alchemySignatureReport` (issue 1074), so N reads still cost one audit.
  _defineLazyFields(row, ['enableBlocked'], () => ({
    enableBlocked: _isRecipeEnableBlocked(context.recipeManager, recipe),
  }));
  _defineLazyFields(row, RECIPE_DETAIL_FIELDS, () =>
    _buildRecipeRowDetail(recipe, executionSteps, { isSimple, ...counts }, context)
  );
  return row;
}

/**
 * Count the recipes per category across a roster.
 *
 * Takes the roster as an ARRAY rather than re-reading it from the manager (issue 1081): the
 * category counts are deliberately over the UNFILTERED roster while the rows are over the
 * search-filtered one, and two derivations over one fetch is the shape that keeps them
 * distinct without copying the corpus twice.
 *
 * @param {object[]} roster
 * @returns {{name: string, count: number}[]}
 */
function _countRecipeCategories(roster) {
  const categoriesMap = new Map();
  for (const recipe of roster) {
    const key = normalizeRecipeCategory(recipe.category);
    categoriesMap.set(key, (categoriesMap.get(key) || 0) + 1);
  }
  return Array.from(categoriesMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Build the recipe list for the recipes tab.
 * Mirrors RecipeManagerApp._prepareRecipeContext().
 *
 * Each returned row is TWO-TIERED — see this module's header. Every field of the allowlist is
 * present and reads identically; the detail half simply computes on first access, so a caller
 * that renders 25 of 10,000 rows performs 25 rows' worth of expensive projection.
 */
export function buildRecipeList(systemManager, recipeManager, selectedSystem, recipeSearchTerm) {
  if (!selectedSystem) return { recipes: [], recipeCategories: [], showVisibilitySummary: false };

  const listMode = selectedSystem.recipeVisibility?.listMode || 'global';
  const showVisibilitySummary = listMode === 'player';

  let recipes = recipeManager.getRecipes({ craftingSystemId: selectedSystem.id });

  // The category counts are deliberately over the UNFILTERED roster — a category chip that
  // disappeared when the GM typed in the search box would be a different feature.
  const recipeCategories = _countRecipeCategories(
    recipeManager.getRecipes({ craftingSystemId: selectedSystem.id })
  );
  if (recipeSearchTerm) {
    const lower = recipeSearchTerm.toLowerCase();
    recipes = recipes.filter(
      (r) =>
        r.name.toLowerCase().includes(lower) || (r.description || '').toLowerCase().includes(lower)
    );
  }

  const context = _createRecipeRowContext(recipeManager, selectedSystem);
  return {
    recipes: recipes.map((recipe) => _createRecipeRow(recipe, context)),
    recipeCategories,
    showVisibilitySummary,
  };
}

/**
 * Fields {@link buildRecipeList} DERIVES onto a projected recipe row that are not
 * authored recipe state (issue 978).
 *
 * They exist for display — the browser's book column, the editor's Books & Scrolls tab,
 * and `handleRemoveRecipeItem`'s post-unlink refresh all read them — but the editor
 * seeds its draft from a whole projected row and Save posts the whole draft, so without
 * a strip at the write boundary `recipeItemId` (the only one of the four that is also a
 * real `Recipe` field) is persisted onto the model. Its value is
 * `containingDefinitions[0]`, i.e. definition order — an authoring accident.
 *
 * The other three are dropped today by `Recipe.fromJSON`, which reconstructs from named
 * fields. That is a property of the model's current field list rather than a guarantee,
 * so the whole derived set is stripped and named once here.
 */
export const DERIVED_RECIPE_PROJECTION_FIELDS = Object.freeze([
  'recipeItemId',
  'recipeItemIds',
  'recipeItemName',
  'recipeItemSourceUuid',
]);

/**
 * Drop the derived projection fields from a recipe update payload.
 *
 * OMITS the keys rather than nulling them. `RecipeManager.updateRecipe` merges
 * `{ ...recipe.toJSON(), ...updates }`, so an absent key preserves the persisted value
 * while an explicit `null` would DESTROY the scalar that `_migrateLegacyRecipeItems`
 * maintains for the standalone alchemy formula-item cohort the 1.13.0 migration
 * deliberately preserved.
 *
 * @param {object} updates A recipe update payload, possibly a whole projected row.
 * @returns {object} The payload without any derived projection field.
 */
export function withoutDerivedRecipeProjectionFields(updates) {
  if (!updates || typeof updates !== 'object') return updates;
  if (!DERIVED_RECIPE_PROJECTION_FIELDS.some((field) => field in updates)) return updates;
  const stripped = { ...updates };
  for (const field of DERIVED_RECIPE_PROJECTION_FIELDS) delete stripped[field];
  return stripped;
}

