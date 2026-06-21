<!-- Svelte 5 runes mode -->
<!--
  Recipe editor shell. A tab strip (Overview / Ingredients / Results / Validation)
  mirroring the gathering environment editor, with the card contents moved into the
  relevant tab. The shell owns the identity local `$state` (name/description/img/
  enabled), the dirty/draft `$effect`s, and `handleSave`, plus every requirement
  add/remove handler (single-step patches the recipe via `onUpdateRecipe`; per-step
  patches the step via `onUpdateStep`).

  The whole tab workspace stays inside `<form id="manager-recipe-edit-form">` so the
  shared header's `type="submit" form="manager-recipe-edit-form"` Save button still
  fires on any tab — `handleSave` reads component state, not form fields.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { DEFAULT_RECIPE_IMAGE } from '../../util/recipeImageIcons.js';
  import RecipeEditorTabs from './recipe/RecipeEditorTabs.svelte';
  import RecipeOverviewTab from './recipe/RecipeOverviewTab.svelte';
  import RecipeIngredientsTab from './recipe/RecipeIngredientsTab.svelte';
  import RecipeResultsTab from './recipe/RecipeResultsTab.svelte';
  import RecipeToolsTab from './recipe/RecipeToolsTab.svelte';
  import RecipeValidationTab from './recipe/RecipeValidationTab.svelte';
  import { evaluateRecipeReadiness } from './recipe/recipeReadiness.js';

  let {
    recipe = null,
    complex = false,
    saving = false,
    onBack = () => {},
    onSave = () => {},
    onDirtyChange = () => {},
    onDraftChange = () => {},
    onPickImagePath = null,
    linkedItemImage = '',
    currencyUnits = [],
    toolsLibrary = [],
    componentOptions = [],
    essenceOptions = [],
    itemTags = [],
    onUpdateRecipe = () => {},
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

  // A recipe is multi-step when it carries an explicit steps array; per-step
  // groupings replace the recipe-level sections in that mode (the right-inspector
  // toggle controls entering/leaving the mode).
  const isMultiStep = $derived(steps.length >= 1);

  function stepById(stepId) {
    return steps.find(step => step.id === stepId) || null;
  }
  function stepResultGroups(step) {
    return Array.isArray(step?.resultGroups) ? step.resultGroups : [];
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
  function addResultGroup(stepId) {
    if (stepId == null) {
      onUpdateRecipe({ resultGroups: [...resultGroups, { name: '' }] });
      return;
    }
    const step = stepById(stepId);
    if (!step) return;
    onUpdateStep(stepId, { resultGroups: [...stepResultGroups(step), { name: '' }] });
  }
  function removeResultGroup(stepId, groupId) {
    if (stepId == null) {
      onUpdateRecipe({ resultGroups: resultGroups.filter(group => group.id !== groupId) });
      return;
    }
    const step = stepById(stepId);
    if (!step) return;
    onUpdateStep(stepId, { resultGroups: stepResultGroups(step).filter(group => group.id !== groupId) });
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
  // The store confirms with wording contextual to where the delete was triggered.
  function deleteStepFrom(context) {
    return (stepId) => onDeleteStep(stepId, context);
  }

  // When a recipe item is linked, the identity image mirrors the linked item's
  // image and the picker is locked — exactly like the environment editor locks
  // its image to a linked scene.
  const isRecipeItemLinked = $derived(Boolean(recipe?.recipeItemId));

  let activeTab = $state('overview');
  let draftId = $state('');
  let name = $state('');
  let description = $state('');
  let img = $state('');
  let enabled = $state(true);
  let lastRecipeId = $state(null);
  let lastDirty = $state(false);
  let lastDraftSignature = $state('');
  let saveFailed = $state(false);

  const validName = $derived(Boolean(name.trim()));
  const dirty = $derived(isDirty());
  const draftSummary = $derived(buildDraftSummary());
  const draftSignature = $derived([
    draftSummary.id,
    draftSummary.name,
    draftSummary.description,
    draftSummary.img,
    draftSummary.enabled ? 'on' : 'off',
    draftSummary.dirty ? 'dirty' : 'clean',
    draftSummary.validName ? 'valid' : 'invalid'
  ].join(''));

  // Validation badges: critical/warning issue counts, projected with the live
  // identity edits folded in so the chips track unsaved changes.
  const readiness = $derived(evaluateRecipeReadiness({
    ...(recipe || {}),
    name,
    enabled
  }));
  const errorCount = $derived(readiness.issues.filter(issue => issue.severity === 'critical').length);
  const warningCount = $derived(readiness.issues.filter(issue => issue.severity === 'warning').length);
  const badges = $derived({
    validation: [
      ...(errorCount > 0 ? [{ label: String(errorCount), tone: 'danger' }] : []),
      ...(warningCount > 0 ? [{ label: String(warningCount), tone: 'warning' }] : [])
    ]
  });

  $effect(() => {
    const nextRecipeId = recipe?.id || '__none__';
    if (nextRecipeId === lastRecipeId) return;
    draftId = recipe?.id || '';
    name = recipe?.name || '';
    description = recipe?.description || '';
    img = recipe?.img || '';
    enabled = recipe?.enabled !== false;
    saveFailed = false;
    activeTab = 'overview';
    lastRecipeId = nextRecipeId;
  });

  $effect(() => {
    if (dirty === lastDirty) return;
    lastDirty = dirty;
    onDirtyChange(dirty);
  });

  $effect(() => {
    if (draftSignature === lastDraftSignature) return;
    lastDraftSignature = draftSignature;
    onDraftChange(draftSummary);
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function buildUpdates() {
    return {
      name: name.trim(),
      description,
      img,
      enabled
    };
  }

  function buildDraftSummary() {
    return {
      id: draftId || '',
      updates: buildUpdates(),
      name: name.trim(),
      description,
      img,
      enabled,
      dirty,
      validName
    };
  }

  function isDirty() {
    if (!recipe) return false;
    return name !== (recipe.name || '')
      || description !== (recipe.description || '')
      || img !== (recipe.img || '')
      || enabled !== (recipe.enabled !== false);
  }

  async function chooseImage() {
    if (typeof onPickImagePath !== 'function' || isRecipeItemLinked) return;
    const value = await onPickImagePath(img || DEFAULT_RECIPE_IMAGE);
    if (value) img = value;
  }

  // Deep-link from a validation issue: switch to the tab that hosts the gap.
  function selectIssue(targetTab) {
    if (['overview', 'ingredients', 'results', 'tools'].includes(targetTab)) {
      activeTab = targetTab;
    }
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!validName || saving) return;
    saveFailed = false;
    let result = false;
    try {
      result = await onSave(draftId || null, buildUpdates());
    } catch (err) {
      result = false;
    }
    if (result === false) saveFailed = true;
  }
</script>

<main class="manager-main manager-recipe-edit-main" aria-label={text('FABRICATE.Admin.Manager.Recipe.EditTitle', 'Edit recipe')}>
  {#if recipe}
    <div class="manager-recipe-edit-view" data-recipe-editor>
      <RecipeEditorTabs {activeTab} {badges} onSelect={(tab) => { activeTab = tab; }} />

      <form id="manager-recipe-edit-form" onsubmit={handleSave}>
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
              onNameInput={(value) => { name = value; }}
              onDescriptionInput={(value) => { description = value; }}
              onToggleEnabled={() => { enabled = !enabled; }}
              onChooseImage={chooseImage}
              {isMultiStep}
              {currencyUnits}
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
              onUpdateIngredientSets={updateIngredientSets}
              onDeleteStep={deleteStepFrom('ingredients')}
            />
          {:else if activeTab === 'results'}
            <RecipeResultsTab
              {recipe}
              {complex}
              {isMultiStep}
              {currencyUnits}
              onAddResultGroup={addResultGroup}
              onRemoveResultGroup={removeResultGroup}
              onDeleteStep={deleteStepFrom('results')}
            />
          {:else if activeTab === 'tools'}
            <RecipeToolsTab
              {recipe}
              {isMultiStep}
              {toolIds}
              {toolsLibrary}
              {currencyUnits}
              onAddTool={addTool}
              onRemoveTool={removeTool}
              onAddStepTool={addStepTool}
              onRemoveStepTool={removeStepTool}
              onDeleteStep={deleteStepFrom('tools')}
            />
          {:else if activeTab === 'validation'}
            <RecipeValidationTab
              recipe={{ ...recipe, name, enabled }}
              onSelectIssue={selectIssue}
            />
          {/if}
        </div>
      </form>
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
