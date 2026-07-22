<!-- Svelte 5 runes mode -->
<!--
  Recipe editor shell. A tab strip (Overview / Ingredients / Results / Tools /
  Access* / Books & Scrolls* / Validation) mirroring the gathering environment
  editor, with the card contents moved into the relevant tab. The two starred tabs
  are mode-conditional (issue 676) — see RecipeEditorTabs for the gate.

  The editor has NO right rail (issue 676): `RecipeContextRail` is deleted and
  `recipe-edit` is in the two-column override list in `styles/fabricate.css`, so the
  tab panel takes the 300px back. Nothing was lost — the rail's Access rows and
  "Appears in" list became the two conditional tabs, its Step-mode control moved to
  Overview (next to the steps it governs), and its validation summary + mini check
  list were duplicates of the Validation tab, which reads the same evaluator.

  The shell is fully CONTROLLED: the root holds the in-flight recipe draft and passes
  it down as `recipe`. Identity inputs (name/description/img) read straight from
  `recipe` and emit `onUpdateRecipe({ … })` on input; the enabled toggle emits
  `onToggleEnabled()` (the root persists that immediately). The header Save button
  lives in the shared header and calls the root's save handler directly — there is no
  form-wrapper to submit. Every requirement add/remove handler stages through
  `onUpdateRecipe`/`onUpdateStep`.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { DEFAULT_RECIPE_IMAGE } from '../../util/recipeImageIcons.js';
  import RecipeEditorTabs from './recipe/RecipeEditorTabs.svelte';
  import RecipeModeBanner from './recipe/RecipeModeBanner.svelte';
  import RecipeOverviewTab from './recipe/RecipeOverviewTab.svelte';
  import RecipeIngredientsTab from './recipe/RecipeIngredientsTab.svelte';
  import RecipeResultsTab from './recipe/RecipeResultsTab.svelte';
  import RecipeToolsTab from './recipe/RecipeToolsTab.svelte';
  import RecipeAccessTab from './recipe/RecipeAccessTab.svelte';
  import RecipeBooksScrollsTab from './recipe/RecipeBooksScrollsTab.svelte';
  import RecipeValidationTab from './recipe/RecipeValidationTab.svelte';
  import { evaluateRecipeReadiness, blocksEnable } from './recipe/recipeReadiness.js';

  let {
    recipe = null,
    // Whether the system mode allows more than one ingredient set (issue 643).
    // Threaded through this wrapper to the Ingredients tab so its single-set
    // (chromeless) view can show the "Add ingredient set" promotion affordance —
    // a tab prop that skips this wrapper silently drops to its default.
    canAddSet = false,
    // Alchemy Simple two-slot result editor (issue 554). Declared+forwarded here so
    // the Results tab receives it through the wrapper (a tab prop that skips this
    // wrapper silently drops to its default and never renders).
    alchemySimple = false,
    // A simple-resolution system with the check enabled also gets the reserved-failure
    // two-slot result editor (issue 643). Threaded through this wrapper like alchemySimple.
    simpleFailureSlot = false,
    saving = false,
    saveFailed = false,
    onPickImagePath = null,
    currencyUnits = [],
    // Whether the system's currency feature is ENABLED (not merely seeded with preset
    // units). Gates the ingredient "Add cost" affordances and drives the read-only
    // rendering of existing currency requirements when currency is off. Defaults true so
    // a caller that only passes units keeps the pre-gate behaviour.
    currencyEnabled = true,
    // Whether the system's time-requirements feature is ENABLED (issue 714). Gates the
    // single-step Duration card (Overview tab) and the per-step duration editor. Defaults
    // true so a caller that omits it keeps the pre-gate always-authorable behaviour.
    timeRequirementsEnabled = true,
    toolsLibrary = [],
    componentOptions = [],
    componentTagOptions = [],
    essenceOptions = [],
    itemTags = [],
    checkTierOptions = [],
    minSuccessTierOptions = [],
    // Per-recipe crafting-check modifier override (issue 770). Threaded through this
    // wrapper so the Overview tab receives them — a tab prop skipping this wrapper
    // silently drops to its default and the control never renders.
    craftingModifierOptions = [],
    craftingModifierPolicyDefault = 'addAll',
    // Category lives on the Overview tab (prototype §5.1). Threaded through this
    // wrapper so the Overview tab receives them (a tab prop skipping this wrapper
    // silently drops to its default and the control never renders).
    categories = [],
    onSetCategory = () => {},
    // Result routing (routed systems): the per-recipe routing mode (provider) and
    // the system's routed-check outcome tiers {id,name} for the result-set
    // assignment controls.
    routingProvider = null,
    routedOutcomeTierOptions = [],
    routedOutcomeTiersDefined = false,
    // Alchemy enable-blocker inputs (issue 549): the alchemy context ({ checkMode })
    // for an alchemy system (null otherwise) and the cross-recipe signature conflicts
    // touching this recipe. Threaded through this wrapper so the Validation tab and
    // the enable-toggle gate receive them (a tab prop skipping this wrapper silently
    // drops to its default).
    alchemy = null,
    signatureConflicts = [],
    // Progressive systems award a recipe's results in order, so the Results tab
    // exposes drag-reorder on the result rows. Other modes ignore result order.
    progressive = false,
    // Progressive result rows deep-link to the COMPONENT editor's Difficulty card:
    // `component.difficulty` is consumed by recipes, salvage, gathering AND system
    // validation, so it is a read-only badge here, never an inline stepper.
    onOpenComponent = () => {},
    // The SYSTEM's resolution mode. Never per-recipe: the banner reports it on every
    // tab and routes to Crafting Settings, which is the only place it can change.
    resolutionMode = 'simple',
    // The system's craftingEffect matrix row ({ showAccess, showBooksScrolls, ... }),
    // gating the Access and Books & Scrolls tabs (issue 676). NOT named `effect`.
    visibilityEffect = { showAccess: false, showBooksScrolls: true },
    // Access tab inputs. RESOLVED rows (never ids) — the store resolves them, because a
    // granted id resolves over EVERY world actor, not the player-character roster.
    accessPlayers = [],
    accessCharacters = [],
    // Books & Scrolls tab inputs (the recipe-item definition library + the unlink).
    recipeItemDefinitions = [],
    onRemoveRecipeItem = () => {},
    onOpenItem = () => {},
    onOpenAccess = () => {},
    onOpenBooksScrolls = () => {},
    // Step mode, rehomed to the Overview tab from the deleted context rail (issue 676).
    multiStepEnabled = false,
    onEnterMultiStep = () => {},
    onRevertToSingleStep = () => {},
    onOpenCraftingSettings = () => {},
    onUpdateRecipe = () => {},
    onToggleEnabled = () => {},
    onToggleLocked = () => {},
    onAddStep = () => {},
    onReorderSteps = () => {},
    onUpdateStep = () => {},
    onDeleteStep = () => {}
  } = $props();

  // Current single-step requirement scopes default to empty arrays so an
  // unconfigured recipe still renders the empty-state sections.
  const ingredientSets = $derived(Array.isArray(recipe?.ingredientSets) ? recipe.ingredientSets : []);
  const resultGroups = $derived(Array.isArray(recipe?.resultGroups) ? recipe.resultGroups : []);
  const toolIds = $derived(Array.isArray(recipe?.toolIds) ? recipe.toolIds : []);
  const toolBonusModes = $derived(recipe?.toolBonusModes || {});
  const steps = $derived(Array.isArray(recipe?.steps) ? recipe.steps : []);

  // Identity reads straight from the controlled draft.
  const name = $derived(recipe?.name || '');
  const description = $derived(recipe?.description || '');
  const img = $derived(recipe?.img || '');
  const enabled = $derived(recipe?.enabled !== false);
  const locked = $derived(recipe?.locked === true);

  // A recipe is multi-step when it carries an explicit steps array; per-step
  // groupings replace the recipe-level sections in that mode (the right-inspector
  // toggle controls entering/leaving the mode).
  const isMultiStep = $derived(steps.length >= 1);

  // COLLAPSED chain (issue 710): a recipe that still carries authored steps while
  // its system's multi-step feature is OFF. It is neither deleted nor reverted — the
  // steps are preserved untouched and restored when the feature is re-enabled. While
  // collapsed the editor presents the recipe as single-step: step authoring
  // (Overview / Ingredients / Tools) is gated read-only, and the Results tab surfaces
  // the chain's EFFECTIVE output — its FINAL step's results — as editable.
  const collapsed = $derived(!multiStepEnabled && steps.length > 1);
  const finalStep = $derived(collapsed ? steps[steps.length - 1] : null);

  // The recipe view the Results tab edits while collapsed: a single-step projection
  // whose result groups / ingredient sets / routing come from the FINAL step, so the
  // normal single-step results editor renders over the chain's effective output.
  // Writes route back to that step (see updateResultGroups / assignIngredientSet).
  const resultsRecipe = $derived(
    collapsed && finalStep
      ? {
          ...recipe,
          resultGroups: Array.isArray(finalStep.resultGroups) ? finalStep.resultGroups : [],
          ingredientSets: Array.isArray(finalStep.ingredientSets) ? finalStep.ingredientSets : [],
          resultSelection: finalStep.resultSelection ?? recipe?.resultSelection ?? null,
          outcomeRouting: finalStep.outcomeRouting ?? recipe?.outcomeRouting ?? null,
        }
      : recipe
  );

  // Check-mode routed recipes route by the crafting-check outcome, so ingredient
  // sets are nameless there; ingredient mode and non-routed systems keep names.
  const showSetName = $derived(routingProvider !== 'check');

  function stepById(stepId) {
    return steps.find(step => step.id === stepId) || null;
  }

  // Ingredient-mode result routing: assigning an ingredient set to a result group
  // writes the canonical `resultGroupId` on that set (consumed at craft time).
  // A set routes to at most one group, so assigning replaces any prior target;
  // unassigning clears it. Ignores assigning to a not-yet-saved (id-less) group.
  function assignIngredientSet(stepId, groupId, setId, assigned) {
    if (!setId || (assigned && !groupId)) return;
    // Collapsed chain (issue 710): the Results tab renders single-step (stepId null)
    // over the FINAL step's data, so a routing assignment writes through to that step.
    const scopeStepId = stepId == null && collapsed && finalStep ? finalStep.id : stepId;
    const scopeSets =
      scopeStepId == null ? ingredientSets : stepById(scopeStepId)?.ingredientSets || [];
    const nextSets = scopeSets.map((set) =>
      set.id === setId ? { ...set, resultGroupId: assigned ? groupId : null } : set
    );
    updateIngredientSets(scopeStepId, nextSets);
  }
  function stepToolIds(step) {
    return Array.isArray(step?.toolIds) ? step.toolIds : [];
  }

  // Add/remove mirror handleAddStep: append entries WITHOUT an id (store
  // normalization assigns one); remove filters by the entry's id; tools store the
  // chosen tool id string directly. A null stepId patches the recipe scope; a
  // present stepId patches that step.
  // The ingredient section emits the whole replacement sets array (shallow-cloned
  // down to the changed node); route it to the recipe scope (null stepId) or the
  // step scope. The store normalizes via Recipe.fromJSON (assigns ids, normalizes
  // each option's match) so nothing here hand-assigns ids.
  function updateIngredientSets(stepId, nextSets) {
    if (stepId == null) {
      onUpdateRecipe({ ingredientSets: nextSets });
      return;
    }
    if (!stepById(stepId)) return;
    onUpdateStep(stepId, { ingredientSets: nextSets });
  }
  // The result section emits the whole replacement groups array (shallow-cloned
  // down to the changed node); route it to the recipe scope (null stepId) or the
  // step scope. The store normalizes via Recipe.fromJSON (assigns ids, normalizes
  // each result) so nothing here hand-assigns ids; existing group ids/names (which
  // routing references) are preserved upstream in the section's edit paths.
  function updateResultGroups(stepId, nextGroups) {
    // Collapsed chain WRITE-THROUGH (issue 710). While the multi-step feature is off
    // the Results tab edits the collapsed recipe as single-step (a null stepId) but
    // over the FINAL step's result groups, so a null stepId here must WRITE THROUGH to
    // that final step rather than to the recipe-level `resultGroups`. This mirrors the
    // engine's atomic chain, whose effective output is the final step's results; the
    // recipe-level `resultGroups` stay empty and the per-step data is never touched, so
    // re-enabling the feature restores the full multi-step editor losslessly.
    const targetStepId = stepId == null && collapsed && finalStep ? finalStep.id : stepId;
    if (targetStepId == null) {
      onUpdateRecipe({ resultGroups: nextGroups });
      return;
    }
    if (!stepById(targetStepId)) return;
    onUpdateStep(targetStepId, { resultGroups: nextGroups });
  }
  // GM policy toggle (issue 651). Stages through the draft like every other authoring
  // edit — the Save button commits it — rather than persisting immediately the way
  // `onToggleEnabled` does.
  function toggleAllowPlayerResultReorder(next) {
    onUpdateRecipe({ allowPlayerResultReorder: next === true });
  }
  function addTool(toolId) {
    if (!toolId || toolIds.includes(toolId)) return;
    onUpdateRecipe({ toolIds: [...toolIds, toolId] });
  }
  function removeTool(toolId) {
    onUpdateRecipe({ toolIds: toolIds.filter(id => id !== toolId) });
  }
  function addStepTool(stepId, toolId) {
    const step = stepById(stepId);
    if (!step || !toolId || stepToolIds(step).includes(toolId)) return;
    onUpdateStep(stepId, { toolIds: [...stepToolIds(step), toolId] });
  }
  function removeStepTool(stepId, toolId) {
    const step = stepById(stepId);
    if (!step) return;
    onUpdateStep(stepId, { toolIds: stepToolIds(step).filter(id => id !== toolId) });
  }

  function setToolBonusMode(toolId, mode) {
    if (!toolId) return;
    const next = { ...toolBonusModes };
    if (mode === 'highestOnly' || mode === 'never') next[toolId] = mode;
    else delete next[toolId];
    onUpdateRecipe({ toolBonusModes: next });
  }

  function updateIngredientSetTools(stepId, setId, update) {
    const scope = stepId == null ? recipe : stepById(stepId);
    const sets = Array.isArray(scope?.ingredientSets) ? scope.ingredientSets : [];
    if (!sets.some((set) => set.id === setId)) return;
    const ingredientSets = sets.map((set) => {
      if (set.id !== setId) return set;
      const ids = Array.isArray(set.toolIds) ? set.toolIds : [];
      return { ...set, toolIds: update(ids) };
    });
    if (stepId == null) onUpdateRecipe({ ingredientSets });
    else onUpdateStep(stepId, { ingredientSets });
  }

  function addIngredientSetTool(stepId, setId, toolId) {
    if (!toolId) return;
    updateIngredientSetTools(stepId, setId, (ids) => ids.includes(toolId) ? ids : [...ids, toolId]);
  }

  function removeIngredientSetTool(stepId, setId, toolId) {
    updateIngredientSetTools(stepId, setId, (ids) => ids.filter((id) => id !== toolId));
  }

  // Deleting a step removes the whole step (its ingredients, results, and tools).
  // The root confirms with wording contextual to where the delete was triggered.
  function deleteStepFrom(context) {
    return (stepId) => onDeleteStep(stepId, context);
  }

  let activeTab = $state('overview');
  let lastRecipeId = $state(null);

  // Validation badges: critical/warning issue counts. The draft is the single
  // source of truth, so the readiness evaluator reads it directly.
  const readiness = $derived(evaluateRecipeReadiness({ ...(recipe || {}) }, {
    systemComponents: componentTagOptions,
    routingProvider,
    routedOutcomeTierOptions,
    alchemy,
    signatureConflicts
  }));
  const errorCount = $derived(readiness.issues.filter(issue => issue.severity === 'critical').length);
  const warningCount = $derived(readiness.issues.filter(issue => issue.severity === 'warning').length);

  // Tab count badges (issue 643 §F1): Ingredients / Results / Tools carry a mono
  // count so the strip reads like the prototype. Multi-step recipes sum each tab's
  // count across every step; single-step recipes read the recipe-scope arrays.
  function countIngredients(scope) {
    const sets = Array.isArray(scope?.ingredientSets) ? scope.ingredientSets : [];
    return sets.reduce((total, set) => {
      const groups = Array.isArray(set?.ingredientGroups) ? set.ingredientGroups.length : 0;
      const essences = set?.essences && typeof set.essences === 'object' ? Object.keys(set.essences).length : 0;
      return total + groups + essences;
    }, 0);
  }
  function countResults(scope) {
    const groups = Array.isArray(scope?.resultGroups) ? scope.resultGroups : [];
    return groups.reduce((total, group) => total + (Array.isArray(group?.results) ? group.results.length : 0), 0);
  }
  function countTools(scope) {
    return Array.isArray(scope?.toolIds) ? scope.toolIds.length : 0;
  }
  function sumOverScopes(counter) {
    if (isMultiStep) return steps.reduce((total, step) => total + counter(step), 0);
    return counter(recipe || {});
  }
  const ingredientsCount = $derived(sumOverScopes(countIngredients));
  const resultsCount = $derived(sumOverScopes(countResults));
  // Tools also carries the recipe-level (global) tools in multi-step mode.
  const toolsCount = $derived(sumOverScopes(countTools) + (isMultiStep ? countTools(recipe || {}) : 0));
  // While the recipe is OFF, an enable-blocking issue disables the enable toggle so
  // the GM cannot trigger the hard activation failure (issue 549); disabling stays
  // free. Predicted from the same readiness the Validation tab renders.
  const enableBlocked = $derived(!enabled && blocksEnable(readiness.issues));
  const badges = $derived({
    ingredients: ingredientsCount > 0 ? [{ label: String(ingredientsCount), tone: 'neutral' }] : [],
    results: resultsCount > 0 ? [{ label: String(resultsCount), tone: 'neutral' }] : [],
    tools: toolsCount > 0 ? [{ label: String(toolsCount), tone: 'neutral' }] : [],
    validation: [
      ...(errorCount > 0 ? [{ label: String(errorCount), tone: 'danger' }] : []),
      ...(warningCount > 0 ? [{ label: String(warningCount), tone: 'warning' }] : [])
    ]
  });

  // Reset the active tab to Overview whenever a different recipe is loaded.
  $effect(() => {
    const nextRecipeId = recipe?.id || '__none__';
    if (nextRecipeId === lastRecipeId) return;
    activeTab = 'overview';
    lastRecipeId = nextRecipeId;
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // The recipe image is always editable: a recipe can belong to many books & scrolls
  // (recipeIds[] is many-to-many), so it no longer mirrors or locks to a single linked
  // recipe item's image.
  async function chooseImage() {
    if (typeof onPickImagePath !== 'function') return;
    const value = await onPickImagePath(img || DEFAULT_RECIPE_IMAGE);
    if (value) onUpdateRecipe({ img: value });
  }

  // Derived from the SAME `visibilityEffect` the tab strip builds its buttons from, so
  // a deep-link can never select a tab that does not exist in this system's mode.
  const TAB_IDS = $derived([
    'overview',
    'ingredients',
    'results',
    'tools',
    ...(visibilityEffect?.showAccess ? ['access'] : []),
    ...(visibilityEffect?.showBooksScrolls ? ['books-scrolls'] : []),
    'validation'
  ]);

  // A mode change can retire the tab the GM is standing on (turning a restricted system
  // global retires Access). Fall back to Overview rather than rendering a panel-less
  // tabpanel whose `aria-labelledby` points at a button that no longer exists.
  $effect(() => {
    if (!TAB_IDS.includes(activeTab)) activeTab = 'overview';
  });

  // Deep-link from a validation issue: switch to the tab that hosts the gap.
  function selectIssue(targetTab) {
    if (['overview', 'ingredients', 'results', 'tools'].includes(targetTab)) {
      activeTab = targetTab;
    }
  }
</script>

<main class="manager-main manager-recipe-edit-main" aria-label={text('FABRICATE.Admin.Manager.Recipe.EditTitle', 'Edit recipe')}>
  {#if recipe}
    <div class="manager-recipe-edit-view" data-recipe-editor>
      <!-- Header → tabs → banner → content (§4.2): the banner sits BELOW the tab strip
           so the tabs stay attached to the header above them. -->
      <RecipeEditorTabs {activeTab} {badges} {visibilityEffect} onSelect={(tab) => { activeTab = tab; }} />

      <RecipeModeBanner {resolutionMode} onOpenSettings={onOpenCraftingSettings} />

      <div
        class="manager-editor-tab-panel"
        role="tabpanel"
        id={`recipe-panel-${activeTab}`}
        aria-labelledby={`recipe-tab-${activeTab}`}
      >
        {#if activeTab === 'overview'}
          <RecipeOverviewTab
            {recipe}
            {name}
            {description}
            {img}
            {enabled}
            {saving}
            {saveFailed}
            {onPickImagePath}
            onNameInput={(value) => onUpdateRecipe({ name: value })}
            onDescriptionInput={(value) => onUpdateRecipe({ description: value })}
            {onToggleEnabled}
            {enableBlocked}
            onChooseImage={chooseImage}
            {isMultiStep}
            {categories}
            {onSetCategory}
            {checkTierOptions}
            {minSuccessTierOptions}
            {craftingModifierOptions}
            {craftingModifierPolicyDefault}
            {locked}
            {onToggleLocked}
            {multiStepEnabled}
            {collapsed}
            {onEnterMultiStep}
            {onRevertToSingleStep}
            {timeRequirementsEnabled}
            {onUpdateRecipe}
            {onAddStep}
            {onReorderSteps}
            {onUpdateStep}
            onDeleteStep={deleteStepFrom('overview')}
          />
        {:else if activeTab === 'ingredients'}
          <RecipeIngredientsTab
            {recipe}
            {canAddSet}
            {isMultiStep}
            {collapsed}
            {currencyUnits}
            {currencyEnabled}
            {componentOptions}
            {essenceOptions}
            {itemTags}
            {showSetName}
            {routingProvider}
            onUpdateIngredientSets={updateIngredientSets}
            onDeleteStep={deleteStepFrom('ingredients')}
          />
        {:else if activeTab === 'results'}
          <RecipeResultsTab
            recipe={resultsRecipe}
            {alchemySimple}
            {simpleFailureSlot}
            isMultiStep={collapsed ? false : isMultiStep}
            {collapsed}
            {componentOptions}
            {routingProvider}
            {progressive}
            {onOpenComponent}
            outcomeTierOptions={routedOutcomeTierOptions}
            outcomeTiersDefined={routedOutcomeTiersDefined}
            onAssignIngredientSet={assignIngredientSet}
            onUpdateResultGroups={updateResultGroups}
            onDeleteStep={deleteStepFrom('results')}
            onToggleAllowPlayerResultReorder={toggleAllowPlayerResultReorder}
          />
        {:else if activeTab === 'tools'}
          <RecipeToolsTab
            {recipe}
            {isMultiStep}
            {collapsed}
            {toolIds}
            {toolsLibrary}
            {toolBonusModes}
            onAddTool={addTool}
            onRemoveTool={removeTool}
            onAddStepTool={addStepTool}
            onRemoveStepTool={removeStepTool}
            onAddIngredientSetTool={addIngredientSetTool}
            onRemoveIngredientSetTool={removeIngredientSetTool}
            onSetToolBonusMode={setToolBonusMode}
            onDeleteStep={deleteStepFrom('tools')}
          />
        {:else if activeTab === 'access'}
          <RecipeAccessTab {accessPlayers} {accessCharacters} {onOpenAccess} />
        {:else if activeTab === 'books-scrolls'}
          <RecipeBooksScrollsTab
            {recipe}
            {recipeItemDefinitions}
            {onRemoveRecipeItem}
            {onOpenItem}
            {onOpenBooksScrolls}
          />
        {:else if activeTab === 'validation'}
          <RecipeValidationTab
            {recipe}
            {componentTagOptions}
            {routingProvider}
            {routedOutcomeTierOptions}
            {alchemy}
            {signatureConflicts}
            onSelectIssue={selectIssue}
          />
        {/if}
      </div>
    </div>
  {:else}
    <div class="manager-empty">
      <div>
        <i class="fas fa-scroll" aria-hidden="true"></i>
        <h3>{text('FABRICATE.Admin.Manager.Recipe.SelectRecipe', 'Select a recipe')}</h3>
        <p>{text('FABRICATE.Admin.Manager.Recipe.EditMissingHint', 'Pick a recipe from the browser to open its editor.')}</p>
      </div>
    </div>
  {/if}
</main>
