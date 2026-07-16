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
    toolIds = [],
    toolsLibrary = [],
    onAddTool = () => {},
    onRemoveTool = () => {},
    onAddStepTool = () => {},
    onRemoveStepTool = () => {},
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
</script>

<section class="manager-recipe-tab manager-recipe-tools-tab" data-recipe-tab="tools" aria-label={text('FABRICATE.Admin.Manager.Recipe.Tabs.Tools', 'Tools')}>
  <div class="manager-recipe-tab-intro">
    <h2 class="manager-recipe-tab-title">{text('FABRICATE.Admin.Manager.Recipe.ToolsSection', 'Tools')}</h2>
    <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.ToolsIntro', 'Required to craft but not consumed — a forge, a cauldron, a whetstone.')}</p>
  </div>

  {#if isMultiStep && steps.length > 0}
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
        emptyLabel={text('FABRICATE.Admin.Manager.Recipe.ToolsEmptyGlobal', 'No global tools — add one that every step needs.')}
        addLabel={text('FABRICATE.Admin.Manager.Recipe.AddGlobalTool', 'Add global tool')}
        {onAddTool}
        {onRemoveTool}
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
          emptyLabel={text('FABRICATE.Admin.Manager.Recipe.ToolsEmptyStep', 'No tools needed for this step.')}
          onAddTool={(toolId) => onAddStepTool(step.id, toolId)}
          onRemoveTool={(toolId) => onRemoveStepTool(step.id, toolId)}
        />
      {/snippet}
    </RecipeStepAccordion>
  {:else}
    <RecipeToolsSection
      {toolIds}
      {toolsLibrary}
      emptyLabel={text('FABRICATE.Admin.Manager.Recipe.ToolsEmptyPanel', 'No tools required.')}
      {onAddTool}
      {onRemoveTool}
    />
  {/if}
</section>
