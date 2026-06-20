<!-- Svelte 5 runes mode -->
<!--
  Results tab. Single-step recipes show the recipe-level result section directly;
  multi-step recipes show the steps as an expandable/collapsible, drag-to-reorder
  accordion (shared with Overview and Ingredients), each expanded step hosting its
  own result section (scoped via `idPrefix`). Reordering here uses the same
  `onReorderSteps` as every other surface, so a move stays in sync with the
  Ingredients and Overview views. The shell owns the add/remove patching; `stepId`
  is null for the single-step (recipe) scope.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import RecipeStepAccordion from './RecipeStepAccordion.svelte';
  import RecipeResultsSection from './RecipeResultsSection.svelte';

  let {
    recipe = null,
    isMultiStep = false,
    onAddResultGroup = () => {},
    onRemoveResultGroup = () => {},
    onReorderSteps = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const resultGroups = $derived(Array.isArray(recipe?.resultGroups) ? recipe.resultGroups : []);
  const steps = $derived(Array.isArray(recipe?.steps) ? recipe.steps : []);

  function stepResultGroups(step) {
    return Array.isArray(step?.resultGroups) ? step.resultGroups : [];
  }
</script>

<section class="manager-recipe-tab manager-recipe-results-tab" data-recipe-tab="results" aria-label={text('FABRICATE.Admin.Manager.Recipe.Tabs.Results', 'Results')}>
  {#if isMultiStep}
    {#if steps.length === 0}
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.NoStepsHint', 'Add a step in Overview to configure its results.')}</p>
    {:else}
      <RecipeStepAccordion {steps} {onReorderSteps}>
        {#snippet body(step)}
          <RecipeResultsSection
            idPrefix={`step-${step.id}-`}
            resultGroups={stepResultGroups(step)}
            onAddResultGroup={() => onAddResultGroup(step.id)}
            onRemoveResultGroup={(groupId) => onRemoveResultGroup(step.id, groupId)}
          />
        {/snippet}
      </RecipeStepAccordion>
    {/if}
  {:else}
    <RecipeResultsSection
      {resultGroups}
      onAddResultGroup={() => onAddResultGroup(null)}
      onRemoveResultGroup={(groupId) => onRemoveResultGroup(null, groupId)}
    />
  {/if}
</section>
