<!-- Svelte 5 runes mode -->
<!--
  Recipe editor shell. A tab strip (Overview / Ingredients / Results / Validation)
  mirroring the gathering environment editor, with the card contents moved into the
  relevant tab.

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
  import RecipeValidationTab from './recipe/RecipeValidationTab.svelte';
  import { evaluateRecipeReadiness, blocksEnable } from './recipe/recipeReadiness.js';

  let {
    recipe = null,
    complex = false,
    // Alchemy Simple two-slot result editor (issue 554). Declared+forwarded here so
    // the Results tab receives it through the wrapper (a tab prop that skips this
    // wrapper silently drops to its default and never renders).
    alchemySimple = false,
    saving = false,
    saveFailed = false,
    onPickImagePath = null,
    linkedItemImage = '',
    currencyUnits = [],
    toolsLibrary = [],
    componentOptions = [],
    componentTagOptions = [],
    essenceOptions = [],
    itemTags = [],
    checkTierOptions = [],
    minSuccessTierOptions = [],
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
    // Requested-tab handshake (a nonce, so the same tab can be re-requested): the
    // context rail deep-links into a tab of the editor it sits beside.
    requestedTab = '',
    requestedTabNonce = 0,
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
    const scopeSets = stepId == null ? ingredientSets : stepById(stepId)?.ingredientSets || [];
    const nextSets = scopeSets.map((set) =>
      set.id === setId ? { ...set, resultGroupId: assigned ? groupId : null } : set
    );
    updateIngredientSets(stepId, nextSets);
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
    if (stepId == null) {
      onUpdateRecipe({ resultGroups: nextGroups });
      return;
    }
    if (!stepById(stepId)) return;
    onUpdateStep(stepId, { resultGroups: nextGroups });
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

  // Deleting a step removes the whole step (its ingredients, results, and tools).
  // The root confirms with wording contextual to where the delete was triggered.
  function deleteStepFrom(context) {
    return (stepId) => onDeleteStep(stepId, context);
  }

  // When a recipe item is linked, the identity image mirrors the linked item's
  // image and the picker is locked — exactly like the environment editor locks
  // its image to a linked scene.
  const isRecipeItemLinked = $derived(Boolean(recipe?.recipeItemId));

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

  // Honour an external tab request (the context rail's validation deep-link). Keyed
  // on the NONCE so requesting the tab the user has since navigated away from still
  // works, and so a stale `requestedTab` never fights manual tab clicks.
  let lastRequestedTabNonce = $state(0);
  $effect(() => {
    if (requestedTabNonce === lastRequestedTabNonce) return;
    lastRequestedTabNonce = requestedTabNonce;
    if (TAB_IDS.includes(requestedTab)) activeTab = requestedTab;
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  async function chooseImage() {
    if (typeof onPickImagePath !== 'function' || isRecipeItemLinked) return;
    const value = await onPickImagePath(img || DEFAULT_RECIPE_IMAGE);
    if (value) onUpdateRecipe({ img: value });
  }

  const TAB_IDS = ['overview', 'ingredients', 'results', 'tools', 'validation'];

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
      <RecipeEditorTabs {activeTab} {badges} onSelect={(tab) => { activeTab = tab; }} />

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
            {isRecipeItemLinked}
            {linkedItemImage}
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
            {locked}
            {onToggleLocked}
            {onUpdateRecipe}
            {onAddStep}
            {onReorderSteps}
            {onUpdateStep}
            onDeleteStep={deleteStepFrom('overview')}
          />
        {:else if activeTab === 'ingredients'}
          <RecipeIngredientsTab
            {recipe}
            {complex}
            {isMultiStep}
            {currencyUnits}
            {componentOptions}
            {essenceOptions}
            {itemTags}
            {showSetName}
            onUpdateIngredientSets={updateIngredientSets}
            onDeleteStep={deleteStepFrom('ingredients')}
          />
        {:else if activeTab === 'results'}
          <RecipeResultsTab
            {recipe}
            {complex}
            {alchemySimple}
            {isMultiStep}
            {componentOptions}
            {routingProvider}
            {progressive}
            {onOpenComponent}
            outcomeTierOptions={routedOutcomeTierOptions}
            outcomeTiersDefined={routedOutcomeTiersDefined}
            onAssignIngredientSet={assignIngredientSet}
            onUpdateResultGroups={updateResultGroups}
            onDeleteStep={deleteStepFrom('results')}
          />
        {:else if activeTab === 'tools'}
          <RecipeToolsTab
            {recipe}
            {isMultiStep}
            {toolIds}
            {toolsLibrary}
            onAddTool={addTool}
            onRemoveTool={removeTool}
            onAddStepTool={addStepTool}
            onRemoveStepTool={removeStepTool}
            onDeleteStep={deleteStepFrom('tools')}
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
