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
    currencyUnits = [],
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
  <RecipeToolsSection
    {toolIds}
    {toolsLibrary}
    {onAddTool}
    {onRemoveTool}
  />

  {#if isMultiStep && steps.length > 0}
    <h4 class="manager-recipe-tools-steps-title">{text('FABRICATE.Admin.Manager.Recipe.PerStepTools', 'Tools per step')}</h4>
    <RecipeStepAccordion {steps} {currencyUnits} {onDeleteStep}>
      {#snippet body(step)}
        <RecipeToolsSection
          idPrefix={`step-${step.id}-`}
          toolIds={stepToolIds(step)}
          {toolsLibrary}
          onAddTool={(toolId) => onAddStepTool(step.id, toolId)}
          onRemoveTool={(toolId) => onRemoveStepTool(step.id, toolId)}
        />
      {/snippet}
    </RecipeStepAccordion>
  {/if}
</section>
