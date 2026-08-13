/**
 * adminRecipeRowProjection — the GM recipe-browser row projection, as a pure module
 * (issue 1090).
 *
 * `buildRecipeList` is the whole of what the recipes tab renders: the filtered rows, the
 * category counts, and the per-row derivations the row itself cannot compute (the
 * structure chip, the requirements preview, the check pill, the activation gate, and
 * recipe-book membership). It was lifted out of `adminStore.js` UNCHANGED — same inputs,
 * same ordering, same fields — so that the paging work in issue 1081 and the cached
 * blocked-enable report in issue 1074 land against a small module instead of a
 * ten-thousand-line store.
 *
 * THE ROW OBJECT IS A HAND-BUILT ALLOWLIST. A field omitted from it is invisible to the
 * browser and to the recipe editor however correctly the model and the write path behave,
 * and several of the per-field comments below exist because that has already shipped more
 * than once. Add to the literal deliberately; never trim it to "tidy up".
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

function _buildRecipeBrowserDisplay(recipe, craftingSystem = null) {
  const executionSteps = _getRecipeExecutionSteps(recipe);
  const isSimple =
    typeof recipe.isSimpleRecipe === 'function' ? recipe.isSimpleRecipe(craftingSystem) : true;
  const sharedRecipeToolIds =
    _usesExplicitRecipeSteps(recipe, executionSteps) && Array.isArray(recipe?.toolIds)
      ? recipe.toolIds
      : [];
  const requirementsPreview = executionSteps.map((step, index) =>
    _buildRequirementPreviewStep(step, index, sharedRecipeToolIds, craftingSystem)
  );
  const structure = _recipeStructure(isSimple, requirementsPreview.length);

  return {
    description: String(recipe.description || '').trim(),
    stepCount: requirementsPreview.length,
    resultGroupCount: requirementsPreview.reduce((sum, step) => sum + step.resultGroupCount, 0),
    resultItemCount: requirementsPreview.reduce((sum, step) => sum + step.resultItemCount, 0),
    ingredientCount: requirementsPreview.reduce((sum, step) => sum + step.ingredientCount, 0),
    toolCount: requirementsPreview.reduce((sum, step) => sum + step.toolCount, 0),
    ...structure,
    requirementsPreview,
    isSimple,
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
 * @param {object} system the selected crafting system (raw, not projected).
 * @param {object} recipe the Recipe model.
 * @returns {{kind: 'none' | 'ingredients' | 'progressive' | 'dynamic' | 'dc', dc: number | null}}
 * @private
 */
function _buildRecipeCheckSummary(system, recipe) {
  const mode = system?.resolutionMode || 'simple';
  // Alchemy's own check mode is system-level and independent of the crafting
  // check; `none` means the recipe resolves with no check at all.
  if (mode === 'alchemy' && (system?.alchemy?.checkMode || 'none') === 'none') {
    return { kind: 'none', dc: null };
  }

  const config = _recipeCheckConfig(system);
  const hasRollFormula = Boolean(String(config?.rollFormula ?? '').trim());
  if (!config || !hasRollFormula) {
    return mode === 'routedByIngredients'
      ? { kind: 'ingredients', dc: null }
      : { kind: 'none', dc: null };
  }
  if (mode === 'progressive') return { kind: 'progressive', dc: null };
  // A dynamic DC is macro-resolved at craft time; there is no static number to show.
  if (config.dcMode === 'dynamic') return { kind: 'dynamic', dc: null };

  const tiers = Array.isArray(config.tiers) ? config.tiers : [];
  const tier = recipe?.checkTierId ? tiers.find((entry) => entry?.id === recipe.checkTierId) : null;
  const tierDc = Number(tier?.dc);
  if (tier && Number.isFinite(tierDc)) return { kind: 'dc', dc: Math.trunc(tierDc) };

  const defaultDc = Number(config.dc);
  return { kind: 'dc', dc: Number.isFinite(defaultDc) ? Math.trunc(defaultDc) : 15 };
}

/**
 * Build the recipe list for the recipes tab.
 * Mirrors RecipeManagerApp._prepareRecipeContext().
 */
export function buildRecipeList(systemManager, recipeManager, selectedSystem, recipeSearchTerm) {
  if (!selectedSystem) return { recipes: [], recipeCategories: [], showVisibilitySummary: false };

  const listMode = selectedSystem.recipeVisibility?.listMode || 'global';
  const showVisibilitySummary = listMode === 'player';

  let recipes = recipeManager.getRecipes({ craftingSystemId: selectedSystem.id });

  if (recipeSearchTerm) {
    const lower = recipeSearchTerm.toLowerCase();
    recipes = recipes.filter(
      (r) =>
        r.name.toLowerCase().includes(lower) || (r.description || '').toLowerCase().includes(lower)
    );
  }

  const categoriesMap = new Map();
  for (const recipe of recipeManager.getRecipes({ craftingSystemId: selectedSystem.id })) {
    const key = normalizeRecipeCategory(recipe.category);
    categoriesMap.set(key, (categoriesMap.get(key) || 0) + 1);
  }
  const recipeCategories = Array.from(categoriesMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const prepared = recipes.map((recipe) => {
    const display = _buildRecipeBrowserDisplay(recipe, selectedSystem);
    // Book membership (many-to-many): the books that contain this recipe. The
    // legacy scalars `recipeItemId`/name/source reflect the FIRST containing book —
    // an accident of definition order, which is exactly why NO image is derived from
    // them (issue 884): a recipe's icon is its own `img` and nothing else.
    // `selectedSystem` here is the RAW manager system (`getSystems()`), not the
    // hand-built viewState projection, so the membership-basis marker is reachable
    // without adding it to that allowlist (issue 1011).
    const containingDefinitions = _recipeItemDefinitionsContaining(
      selectedSystem.recipeItemDefinitions,
      recipe,
      selectedSystem.membershipResolvesByRecipeIds
    );
    const recipeItemIds = containingDefinitions.map((def) => String(def.id));
    const recipeItemDefinition = containingDefinitions[0] || null;
    const recipeItemId = recipeItemDefinition ? String(recipeItemDefinition.id) : '';
    // Plain authoring data for the recipe editor's step-mode UI. Sourced from
    // toJSON() so step / top-level shapes match Recipe._normalizeStep exactly.
    // The multi-step editor reads `steps` (and migrates the top-level fields into
    // the seeded first step); without these the editor cannot detect or author steps.
    const raw = recipe.toJSON();
    return {
      id: recipe.id,
      name: recipe.name,
      img: recipe.img,
      description: display.description,
      category: normalizeRecipeCategory(recipe.category),
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
        characterCount: Array.isArray(raw.access?.characterIds)
          ? raw.access.characterIds.length
          : 0,
        playerCount: Array.isArray(raw.access?.playerIds) ? raw.access.playerIds.length : 0,
      },
      locked: recipe.locked === true,
      enabled: recipe.enabled !== false,
      // GM policy: may a player reorder this recipe's progressive result stages
      // (issue 651)? This projection is a hand-built ALLOWLIST — an omitted field is
      // invisible to the editor, so the Results tab's toggle card would seed from
      // `undefined`, read default-true, and silently render ON for a recipe the GM had
      // authored OFF. Default-true here mirrors the model's constructor.
      allowPlayerResultReorder: recipe.allowPlayerResultReorder !== false,
      // Derived (no stored flag): a shell missing ingredient sets / result groups is
      // persistable but not craftable. Surfaced as an "Incomplete" chip in the browser.
      incomplete: _isRecipeIncomplete(recipe),
      // Derived (no stored flag): would ACTIVATION refuse this recipe? See
      // `_isRecipeEnableBlocked` for why `incomplete` above could NOT have served — a
      // structurally broken recipe reads `incomplete: false` and still cannot be enabled.
      // This projection is a hand-built ALLOWLIST, so omitting the field would leave it
      // invisible to the row pill and every downstream blocked-enable count silently zero.
      enableBlocked: _isRecipeEnableBlocked(recipeManager, recipe),
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
      checkSummary: _buildRecipeCheckSummary(selectedSystem, recipe),
      isSimple: display.isSimple,
      stepCount: display.stepCount,
      resultGroupCount: display.resultGroupCount,
      resultItemCount: display.resultItemCount,
      ingredientCount: display.ingredientCount,
      toolCount: display.toolCount,
      structureKey: display.structureKey,
      structureLabel: display.structureLabel,
      requirementsPreview: display.requirementsPreview,
      ingredients: new Array(display.ingredientCount),
      tools: new Array(display.toolCount),
    };
  });

  return { recipes: prepared, recipeCategories, showVisibilitySummary };
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

// The recipe-item definitions of a system that CONTAIN a recipe (issue 511
// many-to-many). Canonical read is each definition's `recipeIds[]`; only while the
// system's membership-basis marker is unset does it fall back to the recipe's book-only
// `recipeItemId`.
//
// The basis is a PARAMETER, not re-derived here (issue 1011). This is a module-scope
// pure helper with no system in scope, and the "any definition has a non-empty
// recipeIds" inference it used to run flipped in both directions — so the caller threads
// `system.membershipResolvesByRecipeIds` down from the raw manager system.
function _recipeItemDefinitionsContaining(definitions, recipe, membershipResolvesByRecipeIds) {
  const defs = Array.isArray(definitions) ? definitions : [];
  const rid = String(recipe?.id || '');
  const byMembership = defs.filter((def) =>
    (Array.isArray(def.recipeIds) ? def.recipeIds : []).some((id) => String(id) === rid)
  );
  if (byMembership.length > 0) return byMembership;
  if (membershipResolvesByRecipeIds === true) return [];
  const recipeItemId = String(recipe?.recipeItemId || '').trim();
  return recipeItemId ? defs.filter((def) => String(def.id) === recipeItemId) : [];
}
