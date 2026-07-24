<!-- Svelte 5 runes mode -->
<!--
  Tools tab. Always shows the recipe-level tools section (the tools required across
  the whole recipe). For multi-step recipes it then lists the ordered steps as an
  expandable/collapsible accordion (shared with Overview, Ingredients, and Results)
  — WITHOUT drag-reorder (order is set in Overview) but WITH the time/currency chips
  and a delete button in each header, each expanded step hosting its own tools
  section (scoped via `idPrefix`). Deleting a step here removes the whole step (its
  ingredients and results too), so the parent confirms. The shell owns the
  add/remove patching; recipe-level tools patch the recipe, per-step tools patch
  the step.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import RecipeStepAccordion from './RecipeStepAccordion.svelte';
  import RecipeToolsSection from './RecipeToolsSection.svelte';

  let {
    recipe = null,
    isMultiStep = false,
    // COLLAPSED chain (issue 710): the system's multi-step feature is off but the
    // recipe still carries authored steps. Step-level tool authoring is gated read-only
    // behind a note; the preserved step data is restored on re-enable.
    collapsed = false,
    toolIds = [],
    toolsLibrary = [],
    toolBonusModes = {},
    onAddTool = () => {},
    onRemoveTool = () => {},
    onAddStepTool = () => {},
    onRemoveStepTool = () => {},
    onAddIngredientSetTool = () => {},
    onRemoveIngredientSetTool = () => {},
    onSetToolBonusMode = () => {},
    onDeleteStep = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const steps = $derived(Array.isArray(recipe?.steps) ? recipe.steps : []);

  function stepToolIds(step) {
    return Array.isArray(step?.toolIds) ? step.toolIds : [];
  }

  function ingredientSets(scope) {
    return Array.isArray(scope?.ingredientSets) ? scope.ingredientSets : [];
  }

  function setToolIds(set) {
    return Array.isArray(set?.toolIds) ? set.toolIds : [];
  }
</script>

<section class="manager-recipe-tab manager-recipe-tools-tab" data-recipe-tab="tools" aria-label={text('FABRICATE.Admin.Manager.Recipe.Tabs.Tools', 'Tools')}>
  <div class="manager-recipe-tab-intro">
    <h2 class="manager-recipe-tab-title">{text('FABRICATE.Admin.Manager.Recipe.ToolsSection', 'Tools')}</h2>
    <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.ToolsIntro', 'Required to craft but not consumed — a forge, a cauldron, a whetstone.')}</p>
  </div>

  {#if collapsed}
    <p class="manager-muted" data-recipe-collapsed-note>{text('FABRICATE.Admin.Manager.Recipe.CollapsedStepsNote', 'This recipe keeps its steps but runs as one combined action while multi-step recipes are disabled for this system. Turn multi-step recipes back on to edit steps.')}</p>
  {:else if isMultiStep && steps.length > 0}
    <!-- The recipe-level tools are GLOBAL — required for every step (§D2). -->
    <div class="manager-recipe-tools-global" data-recipe-tools-global>
      <div class="manager-recipe-tools-global-head">
        <span class="manager-recipe-tools-global-medallion" aria-hidden="true"><i class="fas fa-globe"></i></span>
        <div>
          <h3 class="manager-recipe-section-title">{text('FABRICATE.Admin.Manager.Recipe.GlobalTools', 'Global tools')}</h3>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.GlobalToolsHint', 'required for every step')}</p>
        </div>
      </div>
      <RecipeToolsSection
        {toolIds}
        {toolsLibrary}
        {toolBonusModes}
        emptyLabel={text('FABRICATE.Admin.Manager.Recipe.ToolsEmptyGlobal', 'No global tools — add one that every step needs.')}
        addLabel={text('FABRICATE.Admin.Manager.Recipe.AddGlobalTool', 'Add global tool')}
        {onAddTool}
        {onRemoveTool}
        {onSetToolBonusMode}
      />
    </div>

    <div class="manager-recipe-tools-divider" aria-hidden="true">
      <span>{text('FABRICATE.Admin.Manager.Recipe.PlusPerStep', 'Plus, per step')}</span>
    </div>

    <RecipeStepAccordion {steps} alwaysOpen {onDeleteStep}>
      {#snippet body(step)}
        <RecipeToolsSection
          idPrefix={`step-${step.id}-`}
          toolIds={stepToolIds(step)}
          {toolsLibrary}
          {toolBonusModes}
          emptyLabel={text('FABRICATE.Admin.Manager.Recipe.ToolsEmptyStep', 'No tools needed for this step.')}
          onAddTool={(toolId) => onAddStepTool(step.id, toolId)}
          onRemoveTool={(toolId) => onRemoveStepTool(step.id, toolId)}
          {onSetToolBonusMode}
        />
        {#each ingredientSets(step) as set (set.id)}
          <div class="manager-recipe-tools-ingredient-set" data-recipe-tools-ingredient-set={set.id}>
            <h4>{set.name || text('FABRICATE.Admin.Manager.Recipe.IngredientSet', 'Ingredient set')}</h4>
            <RecipeToolsSection
              idPrefix={`step-${step.id}-set-${set.id}-`}
              toolIds={setToolIds(set)}
              {toolsLibrary}
              {toolBonusModes}
              emptyLabel={text('FABRICATE.Admin.Manager.Recipe.ToolsEmptyIngredientSet', 'No tools needed for this ingredient set.')}
              onAddTool={(toolId) => onAddIngredientSetTool(step.id, set.id, toolId)}
              onRemoveTool={(toolId) => onRemoveIngredientSetTool(step.id, set.id, toolId)}
              {onSetToolBonusMode}
            />
          </div>
        {/each}
      {/snippet}
    </RecipeStepAccordion>
  {:else}
    <RecipeToolsSection
      {toolIds}
      {toolsLibrary}
      {toolBonusModes}
      emptyLabel={text('FABRICATE.Admin.Manager.Recipe.ToolsEmptyPanel', 'No tools required.')}
      {onAddTool}
      {onRemoveTool}
      {onSetToolBonusMode}
    />
    {#each ingredientSets(recipe) as set (set.id)}
      <div class="manager-recipe-tools-ingredient-set" data-recipe-tools-ingredient-set={set.id}>
        <h4>{set.name || text('FABRICATE.Admin.Manager.Recipe.IngredientSet', 'Ingredient set')}</h4>
        <RecipeToolsSection
          idPrefix={`set-${set.id}-`}
          toolIds={setToolIds(set)}
          {toolsLibrary}
          {toolBonusModes}
          emptyLabel={text('FABRICATE.Admin.Manager.Recipe.ToolsEmptyIngredientSet', 'No tools needed for this ingredient set.')}
          onAddTool={(toolId) => onAddIngredientSetTool(null, set.id, toolId)}
          onRemoveTool={(toolId) => onRemoveIngredientSetTool(null, set.id, toolId)}
          {onSetToolBonusMode}
        />
      </div>
    {/each}
  {/if}
</section>
